"""Deterministic scorer for the versioned fieldwork MVP matrices."""

from __future__ import annotations

import json
from functools import lru_cache
from dataclasses import dataclass

from app.config import ROOT_DIR
from app.models import (
    BehaviorPreference,
    FieldworkContribution,
    OceanProfile,
    SpaceFeatures,
    SpacePerception,
)


FEATURE_LABELS = {
    "svi": "天空可视率",
    "bvi": "建筑可视率",
    "gvi": "绿视率",
    "visual_entropy": "视觉熵",
    "traditional_visibility": "传统风貌可见比例",
    "interface_transparency": "界面透明度",
    "relative_walk_width": "相对步行宽度",
    "historic_cultural_richness": "历史文化线索丰富度",
    "stay_activity_support": "停留活动支持度",
    "accessible_node_density": "可进入节点密度",
    "environmental_maintenance": "环境维护与秩序",
    "spatial_depth_stddev": "空间深度标准差",
    "visible_path_choice": "可见路径选择度",
}

PERCEPTION_LABELS = {
    "safety": "安全",
    "vitality": "活力",
    "prosperity": "富裕",
    "beauty": "美丽",
    "boredom": "无聊",
    "oppression": "压抑",
    "humanistic_place": "人文地方感",
    "social_interaction": "社会交往",
}


@dataclass(frozen=True)
class FieldworkResult:
    perceptions: SpacePerception
    behaviors: BehaviorPreference
    behavior_score: float
    contributions: list[FieldworkContribution]


def load_weights() -> dict:
    path = ROOT_DIR / "app" / "data" / "fieldwork_weights.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_dining_density_lookup() -> dict[str, dict]:
    path = ROOT_DIR / "app" / "data" / "dining_density.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8").lstrip("\ufeff"))
    lookup: dict[str, dict] = {}
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        node_id = str(item.get("node_id") or "").strip()
        node_name = str(item.get("node_name") or "").strip()
        if node_id:
            lookup[node_id] = item
        if node_name:
            lookup[node_name] = item
    return lookup


def feature_ranges(features: list[SpaceFeatures | None]) -> dict[str, tuple[float, float]]:
    usable = [feature for feature in features if feature]
    if not usable:
        return {}
    return {
        name: (
            min(float(getattr(feature, name)) for feature in usable),
            max(float(getattr(feature, name)) for feature in usable),
        )
        for name in type(usable[0]).model_fields
    }


def score(
    features: SpaceFeatures | None,
    profile: OceanProfile,
    ranges: dict[str, tuple[float, float]],
    weights: dict,
) -> FieldworkResult | None:
    if features is None:
        return None
    normalized = {
        name: _normalize(float(getattr(features, name)), *ranges[name])
        for name in weights["feature_fields"]
    }
    personality = {
        name: (float(getattr(profile, name)) - 50.0) / 50.0
        for name in ("openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism")
    }
    perception_center: dict[str, float] = {}
    contributions: list[FieldworkContribution] = []
    for target in weights["perceptions"]:
        effective = {
            feature: float(weights["w1"][feature].get(target, 0.0))
            for feature in weights["feature_fields"]
        }
        for interaction in weights["m1"]:
            if interaction["target"] == target:
                effective[interaction["source"]] += interaction["beta"] * personality[interaction["personality"]]
        denominator = sum(abs(value) for value in effective.values()) or 1.0
        values = {feature: effective[feature] * normalized[feature] for feature in effective}
        perception_center[target] = sum(values.values()) / denominator
        for feature, value in values.items():
            if value:
                contributions.append(
                    FieldworkContribution(
                        label=FEATURE_LABELS[feature],
                        target=PERCEPTION_LABELS[target],
                        value=round(value, 4),
                    )
                )

    perception_values = {name: _scale(center) for name, center in perception_center.items()}
    behavior_values: dict[str, float] = {}
    for target in weights["behaviors"]:
        effective = {
            perception: float(weights["w2"][perception].get(target, 0.0))
            for perception in weights["perceptions"]
        }
        for interaction in weights["m2"]:
            if interaction["target"] == target:
                effective[interaction["source"]] += interaction["beta"] * personality[interaction["personality"]]
        denominator = sum(abs(value) for value in effective.values()) or 1.0
        centered = {
            perception: (perception_values[perception] - 4.0) / 3.0
            for perception in effective
        }
        behavior_values[target] = _scale(
            sum(effective[name] * centered[name] for name in effective) / denominator
        )

    return FieldworkResult(
        perceptions=SpacePerception(**perception_values),
        behaviors=BehaviorPreference(**behavior_values),
        behavior_score=round(
            ((behavior_values["entry"] * 0.6 + behavior_values["stay"] * 0.3 + behavior_values["record"] * 0.1) - 1.0)
            / 6.0
            * 100.0,
            2,
        ),
        contributions=sorted(contributions, key=lambda item: abs(item.value), reverse=True)[:6],
    )


def _normalize(value: float, low: float, high: float) -> float:
    if high == low:
        return 0.0
    return max(-1.0, min(1.0, 2.0 * (value - low) / (high - low) - 1.0))


def _scale(value: float) -> float:
    return round(max(1.0, min(7.0, 4.0 + 3.0 * value)), 3)
