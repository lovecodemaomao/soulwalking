from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path
from typing import Any


WEB_MERCATOR_RADIUS = 6_378_137.0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert an ArcGIS polyline Shapefile into local road GeoJSON."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("app/data/local_road_network.geojson"),
    )
    parser.add_argument(
        "--world-file",
        type=Path,
        help="JGW/PGW world file for ArcGIS local image coordinates.",
    )
    args = parser.parse_args()

    records = read_polyline_shapefile(args.source)
    transformer = choose_transformer(records, args.world_file)
    features = []
    for index, parts in enumerate(records, start=1):
        for part_index, points in enumerate(parts, start=1):
            coordinates = [transformer(x, y) for x, y in points]
            if len(coordinates) < 2:
                continue
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "source": args.source.name,
                        "feature_id": index,
                        "part_id": part_index,
                        "coordinate_system": "GCJ-02",
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": coordinates,
                    },
                }
            )

    payload: dict[str, Any] = {
        "type": "FeatureCollection",
        "name": "老门东本地道路网络",
        "coordinate_system": "GCJ-02",
        "source": str(args.source),
        "features": features,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"wrote {args.output} with {len(features)} line features "
        f"from {args.source}"
    )


def read_polyline_shapefile(path: Path) -> list[list[list[tuple[float, float]]]]:
    data = path.read_bytes()
    if len(data) < 100:
        raise ValueError(f"{path} is too small to be a Shapefile")
    file_code = struct.unpack(">i", data[:4])[0]
    shape_type = struct.unpack("<i", data[32:36])[0]
    if file_code != 9994:
        raise ValueError(f"{path} does not have a Shapefile header")
    if shape_type not in {3, 13, 23}:
        raise ValueError(f"expected polyline Shapefile, got type {shape_type}")

    records: list[list[list[tuple[float, float]]]] = []
    offset = 100
    while offset + 8 <= len(data):
        _, content_words = struct.unpack(">2i", data[offset : offset + 8])
        body_start = offset + 8
        body_end = body_start + content_words * 2
        body = data[body_start:body_end]
        offset = body_end
        if len(body) < 44:
            continue
        record_shape_type = struct.unpack("<i", body[:4])[0]
        if record_shape_type == 0:
            continue
        if record_shape_type not in {3, 13, 23}:
            continue
        num_parts, num_points = struct.unpack("<2i", body[36:44])
        parts_offset = 44
        points_offset = parts_offset + num_parts * 4
        parts = list(
            struct.unpack(f"<{num_parts}i", body[parts_offset:points_offset])
        )
        points = [
            struct.unpack(
                "<2d",
                body[points_offset + point_index * 16 : points_offset + (point_index + 1) * 16],
            )
            for point_index in range(num_points)
        ]
        record_parts = []
        for part_index, start in enumerate(parts):
            end = parts[part_index + 1] if part_index + 1 < len(parts) else len(points)
            record_parts.append(points[start:end])
        records.append(record_parts)
    return records


def web_mercator_to_lon_lat(x: float, y: float) -> list[float]:
    longitude = math.degrees(x / WEB_MERCATOR_RADIUS)
    latitude = math.degrees(
        2 * math.atan(math.exp(y / WEB_MERCATOR_RADIUS)) - math.pi / 2
    )
    return [round(longitude, 8), round(latitude, 8)]


def choose_transformer(records, world_file: Path | None):
    points = [point for parts in records for part in parts for point in part]
    min_x = min(x for x, _ in points)
    max_x = max(x for x, _ in points)
    min_y = min(y for _, y in points)
    max_y = max(y for _, y in points)
    if -180 <= min_x <= max_x <= 180 and -90 <= min_y <= max_y <= 90:
        return lambda x, y: [round(x, 8), round(y, 8)]
    if abs(max_x) > 1_000_000 or abs(max_y) > 1_000_000:
        return web_mercator_to_lon_lat
    if world_file is None:
        raise ValueError(
            "Shapefile appears to use local image coordinates; pass --world-file."
        )
    pixel_x, _, _, pixel_y, origin_x, origin_y = read_world_file(world_file)
    scale = abs(pixel_x) if pixel_x else abs(pixel_y)

    def transform(x: float, y: float) -> list[float]:
        # ArcGIS saved this edit layer in image-local coordinates: x grows right
        # and y is negative downward from the upper-left map origin.
        map_x = origin_x + x * scale
        map_y = origin_y + y * scale
        return web_mercator_to_lon_lat(map_x, map_y)

    return transform


def read_world_file(path: Path) -> tuple[float, float, float, float, float, float]:
    values = [
        float(line.strip())
        for line in path.read_text(encoding="utf-8-sig").splitlines()
        if line.strip()
    ]
    if len(values) != 6:
        raise ValueError(f"{path} does not look like a six-line world file")
    return tuple(values)


if __name__ == "__main__":
    main()
