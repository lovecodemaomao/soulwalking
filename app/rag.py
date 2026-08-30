from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.config import ROOT_DIR
from app.fieldwork import (
    feature_ranges,
    load_dining_density_lookup,
    load_weights,
    score as score_fieldwork,
)
from app.models import (
    OceanProfile,
    ScoreBreakdown,
    SpaceImage,
    SpaceRecommendation,
    SpaceRecord,
    UserConstraints,
)

BGE_QUERY_INSTRUCTION = "为这个句子生成表示以用于检索相关文章："
VECTOR_WEIGHT = 0.6
KEYWORD_WEIGHT = 0.4
RRF_K = 60
BM25_K1 = 1.5
BM25_B = 0.75


def load_seed_spaces() -> list[SpaceRecord]:
    # Keep fieldwork data beside the EXE in the Windows distribution instead
    # of relying on PyInstaller's virtual package-resource loader.
    path = ROOT_DIR / "app" / "data" / "spaces.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    dining_lookup = load_dining_density_lookup()
    records: list[SpaceRecord] = []
    for item in raw:
        item["ocean"]["source"] = "explicit"
        item["ocean"]["confidence"] = 0.7
        density = dining_lookup.get(item.get("id"))
        if density:
            item["description"] = density.get("description") or item.get("description")
            item["dining_poi_count_50m"] = density.get("dining_poi_count_50m")
        records.append(SpaceRecord.model_validate(item))
    return records


@dataclass(frozen=True)
class SpaceChunk:
    """One place is one retrieval chunk, with image references kept as metadata."""

    chunk_id: str
    space_id: str
    text: str
    metadata: dict[str, str | bool | float | int]
    images: tuple[SpaceImage, ...]


@dataclass(frozen=True)
class RetrievalHit:
    space_id: str
    score: float


class EmbeddingProvider(Protocol):
    name: str

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class HashEmbedding:
    """Offline deterministic fallback; this is not a production semantic model."""

    name = "hash-embedding"

    def __init__(self, dimensions: int = 384):
        self.dimensions = dimensions

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed_one(text)

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        for token in tokenize(text):
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            index = int.from_bytes(digest, "little") % self.dimensions
            sign = 1 if digest[0] % 2 else -1
            vector[index] += sign
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


class SentenceTransformerEmbedding:
    """Dense Chinese retrieval based on a local SentenceTransformers model."""

    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self.name = f"sentence-transformers:{model_name}"
        self.model = SentenceTransformer(model_name)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [vector.tolist() for vector in vectors]

    def embed_query(self, text: str) -> list[float]:
        query = (
            BGE_QUERY_INSTRUCTION + text
            if self.model_name.lower().startswith("baai/bge-")
            and "-zh-" in self.model_name.lower()
            else text
        )
        vector = self.model.encode(
            [query],
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]
        return vector.tolist()


def build_embedding(
    backend: str, model_name: str
) -> tuple[EmbeddingProvider, str | None]:
    if backend in {"sentence-transformers", "bge"}:
        try:
            return SentenceTransformerEmbedding(model_name), None
        except Exception as exc:  # pragma: no cover - optional model or download
            return HashEmbedding(), f"本地中文语义模型不可用，已降级：{type(exc).__name__}"
    return HashEmbedding(), None


class SpaceIndex:
    def __init__(
        self,
        records: list[SpaceRecord],
        persist_path: Path,
        embedding: EmbeddingProvider,
        use_chroma: bool = True,
    ):
        self.records = {record.id: record for record in records}
        self.fieldwork_weights = load_weights()
        self.fieldwork_ranges = feature_ranges(
            [record.features for record in records]
        )
        self.chunks = {
            record.id: build_space_chunk(record) for record in records
        }
        self.embedding = embedding
        self.persist_path = persist_path
        self.backend = "memory"
        self.retrieval_strategy = "vector+bm25+weighted-rrf"
        self.warning: str | None = None
        self._vectors = dict(
            zip(
                self.records,
                embedding.embed_documents(
                    [self.chunks[record.id].text for record in records]
                ),
                strict=True,
            )
        )
        self._document_tokens = {
            space_id: tokenize(chunk.text) for space_id, chunk in self.chunks.items()
        }
        self._document_frequencies = Counter(
            token
            for tokens in self._document_tokens.values()
            for token in set(tokens)
        )
        self._average_document_length = (
            sum(len(tokens) for tokens in self._document_tokens.values())
            / max(1, len(self._document_tokens))
        )
        self._collection = None
        if use_chroma:
            self._initialize_chroma()

    def _initialize_chroma(self) -> None:
        try:
            import chromadb

            self.persist_path.mkdir(parents=True, exist_ok=True)
            client = chromadb.PersistentClient(path=str(self.persist_path))
            fingerprint = hashlib.sha1(
                self.embedding.name.encode("utf-8")
            ).hexdigest()[:8]
            data_fingerprint = hashlib.sha1(
                "\n".join(
                    f"{record.id}:{self.chunks[record.id].text}"
                    for record in self.records.values()
                ).encode("utf-8")
            ).hexdigest()[:8]
            self._collection = client.get_or_create_collection(
                name=f"soulwalking-{fingerprint}-{data_fingerprint}",
                metadata={
                    "hnsw:space": "cosine",
                    "embedding": self.embedding.name,
                    "chunking": "one-place-one-chunk",
                },
            )
            records = list(self.records.values())
            self._collection.upsert(
                ids=[record.id for record in records],
                documents=[self.chunks[record.id].text for record in records],
                embeddings=[self._vectors[record.id] for record in records],
                metadatas=[
                    self.chunks[record.id].metadata for record in records
                ],
            )
            self.backend = "chroma"
        except Exception as exc:
            self.warning = f"Chroma 不可用，使用内存向量索引：{type(exc).__name__}"

    def vector_search(
        self,
        text: str,
        constraints: UserConstraints,
        limit: int = 10,
    ) -> list[RetrievalHit]:
        candidate_ids = {
            record.id
            for record in self.records.values()
            if _passes_hard_filters(record, constraints)
        }
        if not candidate_ids:
            return []
        query_vector = self.embedding.embed_query(text)

        if self._collection is not None:
            try:
                query_kwargs: dict[str, Any] = {
                    "query_embeddings": [query_vector],
                    "n_results": min(limit, len(candidate_ids)),
                    "include": ["distances"],
                }
                where = _chroma_where(constraints)
                if where:
                    query_kwargs["where"] = where
                payload = self._collection.query(**query_kwargs)
                ids = (payload.get("ids") or [[]])[0]
                distances = (payload.get("distances") or [[]])[0]
                hits = [
                    RetrievalHit(
                        space_id=space_id,
                        score=_clamp(1 - float(distance), 0, 1),
                    )
                    for space_id, distance in zip(ids, distances, strict=True)
                    if space_id in candidate_ids
                ]
                if hits:
                    return hits
            except Exception as exc:
                self.warning = (
                    f"Chroma 查询失败，本次使用内存向量检索：{type(exc).__name__}"
                )

        hits = [
            RetrievalHit(
                space_id=space_id,
                score=max(0.0, cosine(query_vector, self._vectors[space_id])),
            )
            for space_id in candidate_ids
        ]
        return sorted(hits, key=lambda item: item.score, reverse=True)[:limit]

    def keyword_search(
        self,
        text: str,
        constraints: UserConstraints,
        limit: int = 10,
    ) -> list[RetrievalHit]:
        query_tokens = tokenize(text + " " + " ".join(constraints.tags))
        hits = [
            RetrievalHit(
                space_id=record.id,
                score=self._bm25_score(query_tokens, record.id),
            )
            for record in self.records.values()
            if _passes_hard_filters(record, constraints)
        ]
        positive_hits = [hit for hit in hits if hit.score > 0]
        return sorted(
            positive_hits, key=lambda item: item.score, reverse=True
        )[:limit]

    def _bm25_score(self, query_tokens: list[str], space_id: str) -> float:
        document = self._document_tokens[space_id]
        term_frequencies = Counter(document)
        document_length = len(document)
        document_count = len(self._document_tokens)
        score = 0.0
        for token, query_frequency in Counter(query_tokens).items():
            document_frequency = self._document_frequencies[token]
            if not document_frequency:
                continue
            inverse_document_frequency = math.log(
                1
                + (
                    document_count
                    - document_frequency
                    + 0.5
                )
                / (document_frequency + 0.5)
            )
            term_frequency = term_frequencies[token]
            denominator = term_frequency + BM25_K1 * (
                1
                - BM25_B
                + BM25_B
                * document_length
                / max(1.0, self._average_document_length)
            )
            score += (
                query_frequency
                * inverse_document_frequency
                * term_frequency
                * (BM25_K1 + 1)
                / max(1e-9, denominator)
            )
        return score

    def query(
        self,
        text: str,
        profile: OceanProfile,
        constraints: UserConstraints,
        limit: int = 5,
        mode: str = "normal",
        liked_tags: list[str] | None = None,
        disliked_tags: list[str] | None = None,
    ) -> list[SpaceRecommendation]:
        candidate_count = sum(
            _passes_hard_filters(record, constraints)
            for record in self.records.values()
        )
        if not candidate_count:
            return []

        pool_size = min(candidate_count, max(limit * 4, 10))
        vector_hits = self.vector_search(text, constraints, pool_size)
        keyword_hits = self.keyword_search(text, constraints, pool_size)
        fused = weighted_rrf(vector_hits, keyword_hits)
        if not fused:
            return []

        vector_scores = {hit.space_id: hit.score for hit in vector_hits}
        keyword_scores = _normalize_hit_scores(keyword_hits)
        maximum_fused = max(fused.values()) or 1.0
        liked = set(liked_tags or [])
        disliked = set(disliked_tags or [])
        # Compare each place with the same place under a neutral profile. The
        # raw fieldwork score mostly reflects the place's generic quality; the
        # lift from neutral is the part that should distinguish A/B profiles.
        neutral_profile = OceanProfile()

        scored: list[tuple[float, SpaceRecommendation]] = []
        for space_id, fused_score in fused.items():
            record = self.records[space_id]
            semantic = vector_scores.get(space_id, 0.0)
            lexical = keyword_scores.get(space_id, 0.0)
            hybrid = fused_score / maximum_fused
            fieldwork = score_fieldwork(
                record.features,
                profile,
                self.fieldwork_ranges,
                self.fieldwork_weights,
            )
            fieldwork_behavior = fieldwork.behavior_score if fieldwork else 50.0
            neutral_fieldwork = score_fieldwork(
                record.features,
                neutral_profile,
                self.fieldwork_ranges,
                self.fieldwork_weights,
            )
            neutral_behavior = (
                neutral_fieldwork.behavior_score if neutral_fieldwork else 50.0
            )
            # MVP interaction coefficients are intentionally small, so amplify
            # the profile-specific lift before blending it into the final score.
            # This keeps neutral suitability near 50 while making opposite test
            # profiles produce meaningfully different candidate pools.
            personality_alignment = _clamp(
                50.0 + (fieldwork_behavior - neutral_behavior) * 12.0,
                0.0,
                100.0,
            )
            context = context_score(record, constraints, liked, disliked)
            diversity = (
                -record.heat * 8.0 if mode == "normal" else record.heat * 4.0
            )
            # Personality fit leads ranking; retrieval/context retain enough
            # weight to keep recommendations relevant and operationally useful.
            base = (
                hybrid * 20
                + personality_alignment * 0.65
                + fieldwork_behavior * 0.15
                + context * 15
            )
            final = _clamp(base + diversity, 0, 100)
            if mode == "challenge":
                final = _clamp(100 - final + record.heat * 4, 0, 100)

            breakdown = ScoreBreakdown(
                semantic=round(semantic * 100, 2),
                lexical=round(lexical * 100, 2),
                hybrid_retrieval=round(hybrid * 100, 2),
                personality=round(personality_alignment, 2),
                fieldwork_behavior=round(fieldwork_behavior, 2),
                context=round(context * 100, 2),
                diversity_adjustment=round(diversity, 2),
                final=round(final, 2),
            )
            evidence = [
                f"space:{record.id}:description",
                f"space:{record.id}:tags",
                f"space:{record.id}:opening_hours",
                *[
                    f"space:{record.id}:images:{index}"
                    for index, _ in enumerate(record.images)
                ],
                f"source:{record.source}",
                (
                    f"space:{record.id}:coordinate:{record.coordinate_system}:"
                    f"{record.coordinate_source}:"
                    f"{'verified' if record.coordinate_verified else 'unverified'}"
                ),
            ]
            recommendation = SpaceRecommendation(
                chunk_id=self.chunks[record.id].chunk_id,
                space_id=record.id,
                name=record.name,
                coordinate=record.coordinate,
                map_coordinate=record.map_coordinate,
                score=breakdown,
                reason=build_grounded_reason(
                    record, constraints, breakdown, fieldwork
                ),
                tags=record.tags,
                images=record.images,
                features=record.features,
                perceptions=fieldwork.perceptions if fieldwork else None,
                behaviors=fieldwork.behaviors if fieldwork else None,
                fieldwork_contributions=(fieldwork.contributions if fieldwork else []),
                attributes_pending_verification=_attributes_pending(record),
                evidence=evidence,
                coordinate_system=record.coordinate_system,
                coordinate_source=record.coordinate_source,
                coordinate_verified=record.coordinate_verified,
                map_coordinate_system=record.map_coordinate_system,
                dining_poi_count_50m=record.dining_poi_count_50m,
            )
            scored.append((final, recommendation))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [recommendation for _, recommendation in scored[:limit]]


def build_space_chunk(record: SpaceRecord) -> SpaceChunk:
    return SpaceChunk(
        chunk_id=f"space:{record.id}",
        space_id=record.id,
        text=record.retrieval_text(),
        metadata={
            "space_id": record.id,
            "price_level": record.price_level or "待核验",
            "indoor": record.indoor if record.indoor is not None else "待核验",
            "quiet_level": record.quiet_level if record.quiet_level is not None else -1.0,
            "heat": record.heat,
            "accessibility": record.accessibility if record.accessibility is not None else "待核验",
            "verified": record.verified,
            "coordinate_verified": record.coordinate_verified,
            "coordinate_system": record.coordinate_system,
            "image_count": len(record.images),
            "dining_poi_count_50m": record.dining_poi_count_50m if record.dining_poi_count_50m is not None else -1,
        },
        images=tuple(record.images),
    )


def weighted_rrf(
    vector_hits: list[RetrievalHit],
    keyword_hits: list[RetrievalHit],
    vector_weight: float = VECTOR_WEIGHT,
    keyword_weight: float = KEYWORD_WEIGHT,
    k: int = RRF_K,
) -> dict[str, float]:
    """Fuse ranks, not raw scores, because cosine and BM25 scales differ."""

    fused: dict[str, float] = {}
    for rank, hit in enumerate(vector_hits, 1):
        fused[hit.space_id] = fused.get(hit.space_id, 0.0) + (
            vector_weight / (k + rank)
        )
    for rank, hit in enumerate(keyword_hits, 1):
        fused[hit.space_id] = fused.get(hit.space_id, 0.0) + (
            keyword_weight / (k + rank)
        )
    return fused


def tokenize(text: str) -> list[str]:
    normalized = text.lower()
    ascii_tokens = re.findall(r"[a-z0-9]+", normalized)
    chinese = re.findall(r"[\u4e00-\u9fff]", normalized)
    chinese_tokens = chinese + [
        "".join(chinese[index : index + 2])
        for index in range(max(0, len(chinese) - 1))
    ]
    return ascii_tokens + chinese_tokens


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left)) or 1.0
    right_norm = math.sqrt(sum(value * value for value in right)) or 1.0
    return dot / (left_norm * right_norm)


def personality_similarity(user: OceanProfile, target: OceanProfile) -> float:
    squared = sum(
        (user_value - target_value) ** 2
        for user_value, target_value in zip(
            user.vector(), target.vector(), strict=True
        )
    )
    max_distance = math.sqrt(5 * 100**2)
    return _clamp(1 - math.sqrt(squared) / max_distance, 0, 1)


def context_score(
    record: SpaceRecord,
    constraints: UserConstraints,
    liked: set[str],
    disliked: set[str],
) -> float:
    score = 0.5
    if constraints.quiet is True and record.quiet_level is not None:
        score += (record.quiet_level - 0.5) * 0.6
    elif constraints.quiet is False and record.quiet_level is not None:
        score += (0.5 - record.quiet_level) * 0.4
    tag_set = set(record.tags)
    score += min(0.25, len(tag_set & set(constraints.tags)) * 0.08)
    score += min(0.15, len(tag_set & liked) * 0.05)
    score -= min(0.35, len(tag_set & disliked) * 0.12)
    if constraints.accessibility_required and record.accessibility is True:
        score += 0.2
    return _clamp(score, 0, 1)


def _passes_hard_filters(
    record: SpaceRecord, constraints: UserConstraints
) -> bool:
    if (
        constraints.price_level == "免费"
        and record.price_level is not None
        and record.price_level != "免费"
    ):
        return False
    if constraints.indoor is not None and record.indoor is not None and record.indoor != constraints.indoor:
        return False
    if constraints.accessibility_required and record.accessibility is False:
        return False
    return True


def _chroma_where(
    constraints: UserConstraints,
) -> dict[str, Any] | None:
    # Unknown operational attributes intentionally pass the hard-filter policy,
    # so Chroma cannot safely pre-filter them without dropping valid fieldwork nodes.
    return None


def _normalize_hit_scores(hits: list[RetrievalHit]) -> dict[str, float]:
    maximum = max((hit.score for hit in hits), default=0.0)
    if maximum <= 0:
        return {}
    return {hit.space_id: hit.score / maximum for hit in hits}


def build_grounded_reason(
    record: SpaceRecord,
    constraints: UserConstraints,
    score: ScoreBreakdown,
    fieldwork: Any | None = None,
) -> str:
    reasons: list[str] = []
    if constraints.quiet and (record.quiet_level or 0) >= 0.7:
        reasons.append("环境刺激较低")
    if constraints.indoor is True and record.indoor:
        reasons.append("符合室内要求")
    if constraints.price_level == "免费" and record.price_level == "免费":
        reasons.append("免费开放")
    if constraints.tags:
        matches = [tag for tag in constraints.tags if tag in record.tags]
        if matches:
            reasons.append(f"包含{'、'.join(matches)}特征")
    if fieldwork:
        perceptions = fieldwork.perceptions
        top = sorted(
            [("美丽", perceptions.beauty), ("人文地方感", perceptions.humanistic_place), ("安全感", perceptions.safety), ("活力", perceptions.vitality)],
            key=lambda item: item[1],
            reverse=True,
        )[:2]
        reasons.append("实测感知突出：" + "、".join(f"{name}{value:.1f}/7" for name, value in top))
    if not reasons:
        reasons.append(f"实测行为匹配度为 {score.fieldwork_behavior:.0f}%")
    return f"{record.name}：{'，'.join(reasons)}。{record.description}"


def _attributes_pending(record: SpaceRecord) -> bool:
    return any(
        value is None
        for value in (record.price_level, record.indoor, record.accessibility)
    ) or record.opening_hours == "待核验"


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


