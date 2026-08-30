from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class OceanDimension(str, Enum):
    openness = "O"
    conscientiousness = "C"
    extraversion = "E"
    agreeableness = "A"
    neuroticism = "N"


class ProfileSource(str, Enum):
    test = "test"
    explicit = "explicit"
    memory = "memory"
    mbti_heuristic = "mbti_heuristic"
    natural_language_inference = "natural_language_inference"
    default = "default"


class Mood(str, Enum):
    calm = "平静"
    happy = "开心"
    excited = "兴奋"
    tired = "疲惫"
    low = "低落"
    anxious = "焦虑"


class SocialMode(str, Enum):
    solo = "独处"
    companion = "结伴"
    flexible = "不限"


class OceanProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    openness: float = Field(50, ge=0, le=100)
    conscientiousness: float = Field(50, ge=0, le=100)
    extraversion: float = Field(50, ge=0, le=100)
    agreeableness: float = Field(50, ge=0, le=100)
    neuroticism: float = Field(50, ge=0, le=100)
    source: ProfileSource = ProfileSource.default
    confidence: float = Field(0.5, ge=0, le=1)
    disclaimer: str = "SpaceTI 仅用于城市空间偏好推荐，不构成心理测量或诊断。"

    def vector(self) -> list[float]:
        return [
            self.openness,
            self.conscientiousness,
            self.extraversion,
            self.agreeableness,
            self.neuroticism,
        ]


class QuestionAnswer(BaseModel):
    question_id: str
    choice: Literal["A", "B"]


class ProfileScoreRequest(BaseModel):
    answers: list[QuestionAnswer]
    user_id: str | None = None


class BigFiveScores(BaseModel):
    A: float = Field(ge=1, le=6)
    E: float = Field(ge=1, le=6)
    O: float = Field(ge=1, le=6)
    C: float = Field(ge=1, le=6)
    N: float = Field(ge=1, le=6)


class BigFiveProfileRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    scores: BigFiveScores
    profile: OceanProfile
    version: str = Field(default="CBF-PI-15", max_length=40)


class Coordinate(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    name: str | None = None


class UserConstraints(BaseModel):
    price_level: Literal["免费", "低消费", "不限"] = "不限"
    indoor: bool | None = None
    quiet: bool | None = None
    duration_minutes: int = Field(120, ge=20, le=480)
    departure_time: datetime | None = None
    start: Coordinate = Field(
        default_factory=lambda: Coordinate(
            longitude=118.787898,
            latitude=32.012777,
            name="老门东北门",
        )
    )
    tags: list[str] = Field(default_factory=list)
    accessibility_required: bool = False


class SpaceImage(BaseModel):
    """Image metadata travels with a place chunk; binary data is stored elsewhere."""

    url: str = Field(min_length=1, max_length=2048)
    alt: str = Field(min_length=1, max_length=200)
    caption: str | None = Field(default=None, max_length=500)
    source: str | None = Field(default=None, max_length=500)
    verified: bool = False


class SpaceFeatures(BaseModel):
    svi: float
    bvi: float
    gvi: float
    visual_entropy: float
    traditional_visibility: float
    interface_transparency: float
    relative_walk_width: float
    historic_cultural_richness: float
    stay_activity_support: float
    accessible_node_density: float
    environmental_maintenance: float
    spatial_depth_stddev: float
    visible_path_choice: float


class SpacePerception(BaseModel):
    safety: float = Field(ge=1, le=7)
    vitality: float = Field(ge=1, le=7)
    prosperity: float = Field(ge=1, le=7)
    beauty: float = Field(ge=1, le=7)
    boredom: float = Field(ge=1, le=7)
    oppression: float = Field(ge=1, le=7)
    humanistic_place: float = Field(ge=1, le=7)
    social_interaction: float = Field(ge=1, le=7)


class BehaviorPreference(BaseModel):
    entry: float = Field(ge=1, le=7)
    stay: float = Field(ge=1, le=7)
    record: float = Field(ge=1, le=7)


class FieldworkContribution(BaseModel):
    label: str
    target: str
    value: float


class PlanRequest(BaseModel):
    user_id: str
    session_id: str
    query: str = Field(min_length=1, max_length=1000)
    profile: OceanProfile | None = None
    constraints: UserConstraints | None = None
    mode: Literal["normal", "challenge"] = "normal"
    use_memory: bool = True

    @field_validator("user_id", "session_id")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 128:
            raise ValueError("identifier must contain 1-128 characters")
        return value


class RouteAdjustmentRequest(BaseModel):
    """Reroute an in-progress walk through the nearest dining stop."""

    user_id: str
    session_id: str
    origin: Coordinate
    remaining_destinations: list[Coordinate] = Field(default_factory=list, max_length=8)

    @field_validator("user_id", "session_id")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 128:
            raise ValueError("identifier must contain 1-128 characters")
        return value


class WalkReplanRequest(BaseModel):
    """Replace only the unvisited tail of an active citywalk."""

    user_id: str
    session_id: str
    feedback: str = Field(min_length=1, max_length=500)
    current_position: Coordinate
    current_stop_id: str | None = Field(default=None, max_length=128)
    visited_space_ids: list[str] = Field(default_factory=list, max_length=40)
    remaining_space_ids: list[str] = Field(default_factory=list, max_length=8)
    profile: OceanProfile | None = None
    constraints: UserConstraints | None = None
    mode: Literal["normal", "challenge"] = "normal"

    @field_validator("user_id", "session_id")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 128:
            raise ValueError("identifier must contain 1-128 characters")
        return value


class SpaceRecord(BaseModel):
    id: str
    name: str
    description: str
    address: str
    coordinate: Coordinate
    map_coordinate: Coordinate | None = None
    ocean: OceanProfile
    tags: list[str]
    price_level: Literal["免费", "低消费"] | None = None
    opening_hours: str
    indoor: bool | None = None
    quiet_level: float | None = Field(default=None, ge=0, le=1)
    heat: float = Field(ge=0, le=1)
    accessibility: bool | None = None
    features: SpaceFeatures | None = None
    images: list[SpaceImage] = Field(default_factory=list)
    source: str
    verified: bool = False
    coordinate_system: Literal["GCJ-02", "WGS-84", "BD-09", "unverified"] = (
        "unverified"
    )
    coordinate_source: str = "prototype-seed"
    coordinate_verified: bool = False
    map_coordinate_system: Literal["GCJ-02", "WGS-84", "BD-09", "unverified"] = "GCJ-02"
    amap_poi_id: str | None = None
    dining_poi_count_50m: int | None = Field(default=None, ge=0)

    def retrieval_text(self) -> str:
        indoor_text = "室内" if self.indoor is True else "室外" if self.indoor is False else "室内外待核验"
        price_text = self.price_level or "消费属性待核验"
        return (
            f"{self.name}。{self.description}。地址：{self.address}。"
            f"标签：{'、'.join(self.tags)}。{price_text}，{indoor_text}，"
            f"开放时间：{self.opening_hours}。"
        )


class ScoreBreakdown(BaseModel):
    semantic: float = Field(ge=0, le=100)
    lexical: float = Field(ge=0, le=100)
    hybrid_retrieval: float = Field(ge=0, le=100)
    personality: float = Field(ge=0, le=100)
    fieldwork_behavior: float = Field(ge=0, le=100)
    context: float = Field(ge=0, le=100)
    diversity_adjustment: float = Field(ge=-100, le=100)
    final: float = Field(ge=0, le=100)


class SpaceRecommendation(BaseModel):
    chunk_id: str
    space_id: str
    name: str
    coordinate: Coordinate
    map_coordinate: Coordinate | None = None
    score: ScoreBreakdown
    reason: str
    tags: list[str]
    images: list[SpaceImage] = Field(default_factory=list)
    features: SpaceFeatures | None = None
    perceptions: SpacePerception | None = None
    behaviors: BehaviorPreference | None = None
    fieldwork_contributions: list[FieldworkContribution] = Field(default_factory=list)
    attributes_pending_verification: bool = False
    evidence: list[str]
    opening_status: str = "待检查"
    coordinate_system: Literal["GCJ-02", "WGS-84", "BD-09", "unverified"] = (
        "unverified"
    )
    coordinate_source: str = "prototype-seed"
    coordinate_verified: bool = False
    map_coordinate_system: Literal["GCJ-02", "WGS-84", "BD-09", "unverified"] = "GCJ-02"
    dining_poi_count_50m: int | None = Field(default=None, ge=0)


class RouteSegment(BaseModel):
    origin: Coordinate
    destination: Coordinate
    distance_meters: int = Field(ge=0)
    duration_seconds: int = Field(ge=0)
    steps: list[str] = Field(default_factory=list)
    path_coordinates: list[Coordinate] = Field(default_factory=list)
    provider: str
    geometry_provider: str | None = None
    cache_hit: bool = False


class RouteResult(BaseModel):
    provider: str
    distance_meters: int = Field(ge=0)
    duration_minutes: int = Field(ge=0)
    coordinates: list[Coordinate]
    path_coordinates: list[Coordinate] = Field(default_factory=list)
    segments: list[RouteSegment] = Field(default_factory=list)
    geometry_provider: str | None = None
    geometry_complete: bool = False
    coordinate_system: Literal["GCJ-02"] = "GCJ-02"
    cache_hits: int = Field(default=0, ge=0)
    steps: list[str] = Field(default_factory=list)
    available: bool = True
    warning: str | None = None


class WeatherResult(BaseModel):
    provider: str
    available: bool
    city: str = "南京"
    condition: str | None = None
    temperature_c: float | None = None
    warning: str | None = None
    cache_hit: bool = False


class CrowdAttraction(BaseModel):
    name: str
    current: int | None = Field(default=None, ge=0)
    capacity: int | None = Field(default=None, ge=0)
    comfort: str = "待发布"
    available: bool = False


class CrowdSnapshot(BaseModel):
    """A clearly-labelled snapshot, never represented as continuous live data."""

    provider: str
    source_label: str
    source_url: str
    fetched_at: datetime
    publication_schedule: str
    is_demo: bool = False
    old_mendong_area: CrowdAttraction
    attractions: list[CrowdAttraction] = Field(default_factory=list)
    warning: str | None = None
    cache_hit: bool = False


class DiningPlace(BaseModel):
    id: str
    name: str
    type: str | None = None
    address: str | None = None
    distance_meters: int | None = Field(default=None, ge=0)
    rating: str | None = None
    cost: str | None = None
    coordinate: Coordinate | None = None
    map_coordinate: Coordinate | None = None


class DiningResult(BaseModel):
    provider: str
    source_label: str
    is_demo: bool = False
    restaurants: list[DiningPlace] = Field(default_factory=list)
    warning: str | None = None
    cache_hit: bool = False


class ToolTraceItem(BaseModel):
    name: str
    status: Literal["success", "degraded", "failed", "skipped"]
    duration_ms: int = Field(ge=0)
    input_summary: str
    output_summary: str
    provider: str = "local"


class SessionContext(BaseModel):
    """Short-term, session-scoped context. It must not mutate OCEAN."""

    model_config = ConfigDict(extra="forbid")

    session_id: str
    user_id: str
    mood: Mood | None = None
    energy_level: int | None = Field(default=None, ge=0, le=100)
    social_mode: SocialMode | None = None
    quiet_preference: bool | None = None
    source: Literal["explicit-query", "session-memory"] = "explicit-query"
    confidence: float = Field(1.0, ge=0, le=1)
    updated_at: datetime
    expires_at: datetime

    def ranking_tags(self) -> list[str]:
        tags: list[str] = []
        if (
            self.quiet_preference is not False
            and self.mood in {Mood.tired, Mood.low, Mood.anxious}
        ):
            tags.extend(["低刺激", "安静"])
        elif (
            self.quiet_preference is not True
            and self.mood in {Mood.happy, Mood.excited}
        ):
            tags.append("活力")
        if self.social_mode == SocialMode.solo:
            tags.append("独处")
        elif self.social_mode == SocialMode.companion:
            tags.append("社交")
        return tags


class PlanResponse(BaseModel):
    request_id: str
    session_id: str
    profile: OceanProfile
    constraints: UserConstraints
    session_context: SessionContext | None = None
    recommendations: list[SpaceRecommendation]
    route: RouteResult | None
    weather: WeatherResult | None
    crowd: CrowdSnapshot | None = None
    dining: DiningResult | None = None
    answer: str
    route_intro: str = ""
    personalized_stop_notes: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    tool_trace: list[ToolTraceItem] = Field(default_factory=list)
    total_duration_ms: int = Field(ge=0)


class WalkReplanResponse(BaseModel):
    request_id: str
    session_id: str
    action: Literal["quiet", "rest", "dining", "extend", "return", "shorten"]
    message: str
    recommendations: list[SpaceRecommendation]
    route: RouteResult | None
    dining_stop: DiningPlace | None = None
    exit_stop: Coordinate | None = None
    warnings: list[str] = Field(default_factory=list)


class FeedbackRequest(BaseModel):
    user_id: str
    session_id: str
    rating: int = Field(ge=1, le=5)
    liked_tags: list[str] = Field(default_factory=list)
    disliked_tags: list[str] = Field(default_factory=list)
    comment: str | None = Field(default=None, max_length=1000)


class MemoryCategory(str, Enum):
    profile = "profile"
    preference = "preference"
    dislike = "dislike"
    constraint = "constraint"


class MemoryRecord(BaseModel):
    id: int | None = None
    user_id: str
    category: MemoryCategory
    key: str
    value: Any
    source: ProfileSource
    confidence: float = Field(ge=0, le=1)
    priority: int = Field(ge=0, le=100)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class MemoryView(BaseModel):
    request_id: str
    user_id: str
    records: list[MemoryRecord]


class SessionMemoryView(BaseModel):
    request_id: str
    user_id: str
    session_id: str
    context: SessionContext | None


class HealthResponse(BaseModel):
    request_id: str
    status: Literal["ok", "degraded"]
    components: dict[str, dict[str, Any]]
