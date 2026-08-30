from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from app.models import (
    MemoryCategory,
    MemoryRecord,
    ProfileSource,
    SessionContext,
    SpaceRecord,
)


class Database:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.RLock()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=30, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._lock, self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS spaces (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    summary TEXT NOT NULL DEFAULT '',
                    last_plan TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    source TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    priority INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(user_id, category, key)
                );

                CREATE INDEX IF NOT EXISTS ix_memories_user
                    ON memories(user_id, category);

                CREATE TABLE IF NOT EXISTS session_contexts (
                    session_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS ix_session_contexts_user
                    ON session_contexts(user_id, expires_at);

                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    rating INTEGER NOT NULL,
                    liked_tags TEXT NOT NULL,
                    disliked_tags TEXT NOT NULL,
                    comment TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )

    def seed_spaces(self, records: list[SpaceRecord]) -> None:
        now = _utc_now()
        with self._lock, self.connect() as connection:
            connection.executemany(
                """
                INSERT INTO spaces(id, payload, updated_at)
                VALUES(?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    payload=excluded.payload,
                    updated_at=excluded.updated_at
                """,
                [
                    (record.id, record.model_dump_json(), now)
                    for record in records
                ],
            )

    def list_spaces(self) -> list[SpaceRecord]:
        with self.connect() as connection:
            rows = connection.execute("SELECT payload FROM spaces ORDER BY id").fetchall()
        return [SpaceRecord.model_validate_json(row["payload"]) for row in rows]

    def get_space(self, space_id: str) -> SpaceRecord | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM spaces WHERE id=?", (space_id,)
            ).fetchone()
        return SpaceRecord.model_validate_json(row["payload"]) if row else None

    def save_session(
        self,
        session_id: str,
        user_id: str,
        summary: str,
        last_plan: dict[str, Any] | None = None,
    ) -> None:
        with self._lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions(session_id, user_id, summary, last_plan, updated_at)
                VALUES(?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    user_id=excluded.user_id,
                    summary=excluded.summary,
                    last_plan=excluded.last_plan,
                    updated_at=excluded.updated_at
                """,
                (
                    session_id,
                    user_id,
                    summary[:2000],
                    json.dumps(last_plan, ensure_ascii=False) if last_plan else None,
                    _utc_now(),
                ),
            )

    def get_session(self, session_id: str, user_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT summary, last_plan, updated_at
                FROM sessions
                WHERE session_id=? AND user_id=?
                """,
                (session_id, user_id),
            ).fetchone()
        if not row:
            return None
        return {
            "summary": row["summary"],
            "last_plan": json.loads(row["last_plan"]) if row["last_plan"] else None,
            "updated_at": row["updated_at"],
        }

    def upsert_session_context(self, context: SessionContext) -> None:
        with self._lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO session_contexts(
                    session_id, user_id, payload, expires_at, updated_at
                )
                VALUES(?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    user_id=excluded.user_id,
                    payload=excluded.payload,
                    expires_at=excluded.expires_at,
                    updated_at=excluded.updated_at
                """,
                (
                    context.session_id,
                    context.user_id,
                    context.model_dump_json(),
                    context.expires_at.isoformat(),
                    context.updated_at.isoformat(),
                ),
            )

    def get_session_context(
        self,
        session_id: str,
        user_id: str,
        now: datetime | None = None,
    ) -> SessionContext | None:
        current_time = now or datetime.now(timezone.utc)
        with self._lock, self.connect() as connection:
            row = connection.execute(
                """
                SELECT payload, expires_at
                FROM session_contexts
                WHERE session_id=? AND user_id=?
                """,
                (session_id, user_id),
            ).fetchone()
            if not row:
                return None
            expires_at = datetime.fromisoformat(row["expires_at"])
            if expires_at <= current_time:
                connection.execute(
                    """
                    DELETE FROM session_contexts
                    WHERE session_id=? AND user_id=?
                    """,
                    (session_id, user_id),
                )
                return None
        context = SessionContext.model_validate_json(row["payload"])
        return context.model_copy(update={"source": "session-memory"})

    def delete_session_context(self, session_id: str, user_id: str) -> int:
        with self._lock, self.connect() as connection:
            cursor = connection.execute(
                """
                DELETE FROM session_contexts
                WHERE session_id=? AND user_id=?
                """,
                (session_id, user_id),
            )
        return cursor.rowcount

    def upsert_memory(self, record: MemoryRecord) -> MemoryRecord:
        now = _utc_now()
        value = json.dumps(record.value, ensure_ascii=False)
        with self._lock, self.connect() as connection:
            existing = connection.execute(
                """
                SELECT id, priority, created_at
                FROM memories
                WHERE user_id=? AND category=? AND key=?
                """,
                (record.user_id, record.category.value, record.key),
            ).fetchone()
            if existing and int(existing["priority"]) > record.priority:
                stored = connection.execute(
                    "SELECT * FROM memories WHERE id=?", (existing["id"],)
                ).fetchone()
                return _memory_from_row(stored)

            created_at = existing["created_at"] if existing else now
            connection.execute(
                """
                INSERT INTO memories(
                    user_id, category, key, value, source, confidence, priority,
                    created_at, updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, category, key) DO UPDATE SET
                    value=excluded.value,
                    source=excluded.source,
                    confidence=excluded.confidence,
                    priority=excluded.priority,
                    updated_at=excluded.updated_at
                """,
                (
                    record.user_id,
                    record.category.value,
                    record.key,
                    value,
                    record.source.value,
                    record.confidence,
                    record.priority,
                    created_at,
                    now,
                ),
            )
            row = connection.execute(
                """
                SELECT * FROM memories
                WHERE user_id=? AND category=? AND key=?
                """,
                (record.user_id, record.category.value, record.key),
            ).fetchone()
        return _memory_from_row(row)

    def list_memories(self, user_id: str) -> list[MemoryRecord]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM memories
                WHERE user_id=?
                ORDER BY priority DESC, updated_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [_memory_from_row(row) for row in rows]

    def delete_memories(self, user_id: str) -> int:
        with self._lock, self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM memories WHERE user_id=?", (user_id,)
            )
        return cursor.rowcount

    def delete_user_memory_data(self, user_id: str) -> dict[str, int]:
        """Delete durable and session-scoped memory owned by one anonymous user."""

        with self._lock, self.connect() as connection:
            memories = connection.execute(
                "DELETE FROM memories WHERE user_id=?", (user_id,)
            ).rowcount
            session_contexts = connection.execute(
                "DELETE FROM session_contexts WHERE user_id=?", (user_id,)
            ).rowcount
            sessions = connection.execute(
                "DELETE FROM sessions WHERE user_id=?", (user_id,)
            ).rowcount
            feedback = connection.execute(
                "DELETE FROM feedback WHERE user_id=?", (user_id,)
            ).rowcount
        return {
            "long_term": memories,
            "short_term": session_contexts,
            "sessions": sessions,
            "feedback": feedback,
        }

    def add_feedback(
        self,
        user_id: str,
        session_id: str,
        rating: int,
        liked_tags: list[str],
        disliked_tags: list[str],
        comment: str | None,
    ) -> int:
        with self._lock, self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO feedback(
                    user_id, session_id, rating, liked_tags, disliked_tags,
                    comment, created_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    session_id,
                    rating,
                    json.dumps(liked_tags, ensure_ascii=False),
                    json.dumps(disliked_tags, ensure_ascii=False),
                    comment,
                    _utc_now(),
                ),
            )
        return int(cursor.lastrowid)


def _memory_from_row(row: sqlite3.Row) -> MemoryRecord:
    return MemoryRecord(
        id=row["id"],
        user_id=row["user_id"],
        category=MemoryCategory(row["category"]),
        key=row["key"],
        value=json.loads(row["value"]),
        source=ProfileSource(row["source"]),
        confidence=row["confidence"],
        priority=row["priority"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
