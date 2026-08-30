"""生成适合阿里云百炼「文档知识库」上传的单一 Markdown。

从 app/data/spaces.json 与 app/data/dining_density.json 程序化导出 37 个
老门东实测节点，严格基于现有数据，不补全未知事实。每个节点一个二级标题
`## Nxxx 地点名`，便于智能语义分段时按节点切分 chunk。

用法：
    python scripts/generate_knowledge_base_md.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "soulwalking_old_mendong_spaces.md"

FEATURE_LABELS = (
    ("svi", "天空可视率"),
    ("bvi", "建筑可视率"),
    ("gvi", "绿视率"),
    ("visual_entropy", "视觉熵"),
    ("traditional_visibility", "传统风貌可见比例"),
    ("interface_transparency", "界面透明度"),
    ("relative_walk_width", "相对步行宽度"),
    ("historic_cultural_richness", "历史文化线索丰富度"),
    ("stay_activity_support", "停留活动支持度"),
    ("accessible_node_density", "可进入节点密度"),
    ("environmental_maintenance", "环境维护与秩序"),
    ("spatial_depth_stddev", "空间深度标准差"),
    ("visible_path_choice", "可见路径选择度"),
)


def fmt_float(value: float | None) -> str:
    if value is None:
        return "未知"
    rounded = round(value, 4)
    return f"{rounded:.4f}".rstrip("0").rstrip(".") or "0"


def fmt_coord(value: float | None) -> str:
    return f"{value:.6f}" if value is not None else "未知"


def bool_label(value: bool | None, true="是", false="否", none="未知") -> str:
    if value is None:
        return none
    return true if value else false


def indoor_label(value: bool | None) -> str:
    if value is None:
        return "未知"
    return "室内" if value else "室外"


def main() -> None:
    spaces = json.loads(
        (ROOT / "app" / "data" / "spaces.json").read_text(encoding="utf-8")
    )
    dining_raw = json.loads(
        (ROOT / "app" / "data" / "dining_density.json")
        .read_text(encoding="utf-8")
        .lstrip("﻿")
    )
    dining = {item["node_id"]: item for item in dining_raw}

    lines: list[str] = []
    lines.append("# SoulWalking 老门东实测空间库")
    lines.append("")
    lines.append(
        "本库由 37 个老门东实地调研节点整理而成，数据来源为节点采集表与采集照片"
        "（2026-06-07 实地采集），供文档知识库 RAG 使用。严格基于现有数据整理，"
        "未补全未知事实；标注「未知 / 待核验」的字段不作为已满足条件。"
    )
    lines.append("")
    lines.append("## 阅读说明（字段口径）")
    lines.append("")
    lines.append(
        "- **坐标**：`GCJ-02（地图坐标）` 用于高德/百炼地图展示；"
        "`WGS-84（采集坐标）` 为实地采集原始值。"
    )
    lines.append(
        "- **空间特征**：13 维原始值，量纲与取值范围不同（多数为 0–1，"
        "`空间深度标准差`、`可见路径选择度` 例外），本文档不做归一化，仅作原始参考。"
    )
    lines.append(
        "- **热度（heat）**：当前 37 个节点均为 0（尚未采集），不作为筛选依据。"
    )
    lines.append(
        "- **数据可靠性**：价格、室内外、无障碍信息当前均为「未知」；开放时间均为"
        "「待核验」。未核验信息不会被当作已满足条件。"
    )

    for space in sorted(spaces, key=lambda item: item["id"]):
        node_id = space["id"]
        name = space["name"]
        density = dining.get(node_id)
        description = (
            (density.get("description") or "").strip()
            if density and (density.get("description") or "").strip()
            else (space.get("description") or "").strip()
        )
        dining_count = (
            density.get("dining_poi_count_50m")
            if density
            else space.get("dining_poi_count_50m")
        )
        coord = space.get("coordinate") or {}
        map_coord = space.get("map_coordinate") or {}
        image = (space.get("images") or [{}])[0]

        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append(f"## {node_id} {name}")
        lines.append("")
        lines.append("### 基本信息")
        lines.append(f"- ID：{node_id}")
        lines.append(f"- 名称：{name}")
        lines.append(f"- 标签：{'、'.join(space.get('tags') or [])}")
        lines.append(f"- 热度：{fmt_float(space.get('heat'))}")
        lines.append(f"- 地址：{space.get('address') or '未知'}")
        lines.append("")
        lines.append("### 空间描述")
        lines.append(description)
        lines.append("")
        lines.append("### 餐饮密度")
        if dining_count is not None:
            lines.append(f"- 50 米内餐饮 POI 数量：{int(dining_count)} 个")
        else:
            lines.append("- 50 米内餐饮 POI 数量：未采集")
        lines.append("")
        lines.append("### 坐标")
        lines.append(
            f"- GCJ-02（地图坐标）：{fmt_coord(map_coord.get('longitude'))}, "
            f"{fmt_coord(map_coord.get('latitude'))}"
        )
        lines.append(
            f"- WGS-84（采集坐标）：{fmt_coord(coord.get('longitude'))}, "
            f"{fmt_coord(coord.get('latitude'))}"
        )
        lines.append(f"- 坐标来源：{space.get('coordinate_source') or '未知'}")
        lines.append(
            f"- 是否核验：{bool_label(space.get('coordinate_verified'))}"
        )
        lines.append("")
        lines.append("### 空间特征")
        features = space.get("features") or {}
        for field, label in FEATURE_LABELS:
            lines.append(f"- {label}（{field}）：{fmt_float(features.get(field))}")
        lines.append("")
        lines.append("### 现场照片")
        lines.append(f"- 文件：{image.get('url') or '未知'}")
        lines.append(f"- 说明：{image.get('caption') or '未知'}")
        lines.append(f"- 来源：{image.get('source') or '未知'}")
        lines.append(f"- 核验状态：{bool_label(image.get('verified'))}")
        lines.append("")
        lines.append("### 数据可靠性")
        lines.append(f"- 数据来源：{space.get('source') or '未知'}")
        lines.append(f"- 开放时间：{space.get('opening_hours') or '待核验'}")
        lines.append(f"- 价格：{space.get('price_level') or '未知'}")
        lines.append(f"- 室内外：{indoor_label(space.get('indoor'))}")
        lines.append(f"- 无障碍：{bool_label(space.get('accessibility'))}")

    lines.append("")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"已生成：{OUT}")


if __name__ == "__main__":
    main()
