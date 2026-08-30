from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from app.database import Database
from app.models import (
    FeedbackRequest,
    MemoryCategory,
    MemoryRecord,
    Mood,
    OceanProfile,
    ProfileSource,
    SessionContext,
    SocialMode,
    UserConstraints,
)

SOURCE_PRIORITY = {
    ProfileSource.explicit: 100,
    ProfileSource.test: 90,
    ProfileSource.memory: 70,
    ProfileSource.natural_language_inference: 50,
    ProfileSource.mbti_heuristic: 30,
    ProfileSource.default: 10,
}

SENSITIVE_KEYS = {
    "api_key",
    "password",
    "phone",
    "email",
    "id_card",
    "身份证",
    "手机号",
}


class MemoryService:
    def __init__(self, database: Database, session_ttl_hours: int = 12):
        self.database = database
        self.session_ttl = timedelta(hours=session_ttl_hours)

    def remember_profile(self, user_id: str, profile: OceanProfile) -> None:
        if profile.source == ProfileSource.default:
            return
        self.database.upsert_memory(
            MemoryRecord(
                user_id=user_id,
                category=MemoryCategory.profile,
                key="ocean",
                value=profile.model_dump(mode="json"),
                source=profile.source,
                confidence=profile.confidence,
                priority=SOURCE_PRIORITY[profile.source],
            )
        )

    def load_profile(self, user_id: str) -> OceanProfile | None:
        for record in self.database.list_memories(user_id):
            if record.category == MemoryCategory.profile and record.key == "ocean":
                data = dict(record.value)
                data["source"] = ProfileSource.memory
                data["confidence"] = min(float(data.get("confidence", 0.7)), 0.85)
                return OceanProfile.model_validate(data)
        return None

    def preferences(self, user_id: str) -> dict[str, list[str]]:
        result: dict[str, list[str]] = defaultdict(list)
        for record in self.database.list_memories(user_id):
            if record.category in {
                MemoryCategory.preference,
                MemoryCategory.dislike,
                MemoryCategory.constraint,
            }:
                values = (
                    record.value
                    if isinstance(record.value, list)
                    else [str(record.value)]
                )
                result[record.category.value].extend(str(value) for value in values)
        return dict(result)

    def store_explicit(
        self,
        user_id: str,
        category: MemoryCategory,
        key: str,
        value: Any,
        confidence: float = 1.0,
    ) -> MemoryRecord:
        if key.lower() in SENSITIVE_KEYS:
            raise ValueError("敏感信息不会写入长期记忆")
        return self.database.upsert_memory(
            MemoryRecord(
                user_id=user_id,
                category=category,
                key=key,
                value=value,
                source=ProfileSource.explicit,
                confidence=confidence,
                priority=SOURCE_PRIORITY[ProfileSource.explicit],
            )
        )

    def process_feedback(self, feedback: FeedbackRequest) -> list[MemoryRecord]:
        self.database.add_feedback(
            feedback.user_id,
            feedback.session_id,
            feedback.rating,
            feedback.liked_tags,
            feedback.disliked_tags,
            feedback.comment,
        )
        stored: list[MemoryRecord] = []
        if feedback.liked_tags:
            stored.append(
                self.database.upsert_memory(
                    MemoryRecord(
                        user_id=feedback.user_id,
                        category=MemoryCategory.preference,
                        key="liked_tags",
                        value=sorted(set(feedback.liked_tags)),
                        source=ProfileSource.explicit,
                        confidence=1.0,
                        priority=SOURCE_PRIORITY[ProfileSource.explicit],
                    )
                )
            )
        if feedback.disliked_tags:
            stored.append(
                self.database.upsert_memory(
                    MemoryRecord(
                        user_id=feedback.user_id,
                        category=MemoryCategory.dislike,
                        key="disliked_tags",
                        value=sorted(set(feedback.disliked_tags)),
                        source=ProfileSource.explicit,
                        confidence=1.0,
                        priority=SOURCE_PRIORITY[ProfileSource.explicit],
                    )
                )
            )
        return stored

    def load_session_context(
        self, user_id: str, session_id: str
    ) -> SessionContext | None:
        return self.database.get_session_context(session_id, user_id)

    def update_session_context(
        self,
        user_id: str,
        session_id: str,
        query: str,
        now: datetime | None = None,
    ) -> SessionContext | None:
        """Persist only explicit transient signals, never raw conversation text."""

        current_time = now or datetime.now(timezone.utc)
        existing = self.database.get_session_context(
            session_id, user_id, current_time
        )
        extracted = infer_session_context(
            user_id,
            session_id,
            query,
            current_time,
            current_time + self.session_ttl,
        )
        if extracted is None:
            return existing

        context = SessionContext(
            session_id=session_id,
            user_id=user_id,
            mood=extracted.mood or (existing.mood if existing else None),
            energy_level=(
                extracted.energy_level
                if extracted.energy_level is not None
                else existing.energy_level
                if existing
                else None
            ),
            social_mode=(
                extracted.social_mode
                or (existing.social_mode if existing else None)
            ),
            quiet_preference=(
                extracted.quiet_preference
                if extracted.quiet_preference is not None
                else existing.quiet_preference
                if existing
                else None
            ),
            source="explicit-query",
            confidence=1.0,
            updated_at=current_time,
            expires_at=current_time + self.session_ttl,
        )
        self.database.upsert_session_context(context)
        return context

    @staticmethod
    def apply_session_context(
        constraints: UserConstraints,
        context: SessionContext | None,
    ) -> UserConstraints:
        if context is None:
            return constraints
        updates: dict[str, Any] = {}
        if (
            constraints.quiet is None
            and context.quiet_preference is not None
        ):
            updates["quiet"] = context.quiet_preference
        updates["tags"] = list(
            dict.fromkeys([*constraints.tags, *context.ranking_tags()])
        )
        return constraints.model_copy(update=updates)


def infer_session_context(
    user_id: str,
    session_id: str,
    query: str,
    updated_at: datetime,
    expires_at: datetime,
) -> SessionContext | None:
    """Extract explicit, temporary state without treating it as a diagnosis."""

    mood: Mood | None = None
    energy_level: int | None = None
    social_mode: SocialMode | None = None
    quiet_preference: bool | None = None

    if any(word in query for word in ["焦虑", "紧张", "心烦", "压力很大"]):
        mood = Mood.anxious
        energy_level = 30
        quiet_preference = True
    elif (
        any(word in query for word in ["疲惫", "没精神", "没力气", "有点累", "很累"])
        and "不累" not in query
    ):
        mood = Mood.tired
        energy_level = 25
        quiet_preference = True
    elif any(word in query for word in ["低落", "心情不好", "难过", "沮丧"]):
        mood = Mood.low
        energy_level = 35
        quiet_preference = True
    elif any(word in query for word in ["兴奋", "精力充沛", "很有精神"]):
        mood = Mood.excited
        energy_level = 85
    elif any(word in query for word in ["开心", "高兴", "心情很好"]):
        mood = Mood.happy
        energy_level = 70
    elif any(word in query for word in ["平静", "放松", "心情平稳"]):
        mood = Mood.calm
        energy_level = 50
        quiet_preference = True

    energy_match = re.search(
        r"(?:精力|能量)(?:值|水平)?\s*(?:是|有|大概|约)?\s*(\d{1,3})",
        query,
    )
    if energy_match:
        energy_level = max(0, min(100, int(energy_match.group(1))))

    if any(word in query for word in ["一个人", "独处", "自己走", "不想社交"]):
        social_mode = SocialMode.solo
        quiet_preference = True
    elif any(word in query for word in ["和朋友", "结伴", "一起走", "想社交"]):
        social_mode = SocialMode.companion

    if any(word in query for word in ["安静", "人少", "低刺激"]):
        quiet_preference = True
    elif any(word in query for word in ["热闹", "人气", "烟火气"]):
        quiet_preference = False

    if all(
        value is None
        for value in (mood, energy_level, social_mode, quiet_preference)
    ):
        return None
    return SessionContext(
        session_id=session_id,
        user_id=user_id,
        mood=mood,
        energy_level=energy_level,
        social_mode=social_mode,
        quiet_preference=quiet_preference,
        updated_at=updated_at,
        expires_at=expires_at,
    )
