from __future__ import annotations

import heapq
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import ROOT_DIR
from app.models import Coordinate, RouteSegment


NETWORK_PATH = ROOT_DIR / "app" / "data" / "local_road_network.geojson"
MAX_SNAP_METERS = 140
MAX_BRIDGE_METERS = 25
WALKING_METERS_PER_SECOND = 1.25


@dataclass(frozen=True)
class RoadEdge:
    left: int
    right: int
    distance_meters: float


@dataclass
class RoadNetwork:
    nodes: list[Coordinate]
    edges: list[RoadEdge]
    adjacency: dict[int, list[tuple[int, float]]]


_NETWORK: RoadNetwork | None = None


def plan_local_road_segment(
    origin: Coordinate, destination: Coordinate
) -> RouteSegment | None:
    network = load_local_road_network()
    if network is None:
        return None

    graph = {node: list(edges) for node, edges in network.adjacency.items()}
    nodes = list(network.nodes)
    origin_index = _attach_temporary_node(graph, nodes, network.edges, origin)
    destination_index = _attach_temporary_node(
        graph, nodes, network.edges, destination
    )
    if origin_index is None or destination_index is None:
        return None

    path_indexes = _shortest_path(graph, origin_index, destination_index)
    if not path_indexes:
        return None

    path = [nodes[index] for index in path_indexes]
    distance = sum(
        haversine_meters(left, right) for left, right in zip(path, path[1:])
    )
    return RouteSegment(
        origin=origin,
        destination=destination,
        distance_meters=round(distance),
        duration_seconds=max(60, round(distance / WALKING_METERS_PER_SECOND)),
        steps=[
            f"沿本地道路网络从{origin.name or '当前点'}步行至"
            f"{destination.name or '下一节点'}"
        ],
        path_coordinates=path,
        provider="local-road-network",
        geometry_provider="local-road-network",
    )


def load_local_road_network() -> RoadNetwork | None:
    global _NETWORK
    if _NETWORK is not None:
        return _NETWORK
    if not NETWORK_PATH.exists():
        return None

    payload = json.loads(NETWORK_PATH.read_text(encoding="utf-8"))
    node_index: dict[tuple[int, int], int] = {}
    nodes: list[Coordinate] = []
    edges: list[RoadEdge] = []
    adjacency: dict[int, list[tuple[int, float]]] = {}

    def add_node(longitude: float, latitude: float) -> int:
        key = (round(longitude * 10_000_000), round(latitude * 10_000_000))
        if key not in node_index:
            node_index[key] = len(nodes)
            nodes.append(Coordinate(longitude=longitude, latitude=latitude))
        return node_index[key]

    for feature in payload.get("features", []):
        geometry = feature.get("geometry") if isinstance(feature, dict) else None
        if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
            continue
        coordinates = geometry.get("coordinates") or []
        indexes = [
            add_node(float(longitude), float(latitude))
            for longitude, latitude, *_ in coordinates
        ]
        for left, right in zip(indexes, indexes[1:]):
            if left == right:
                continue
            distance = haversine_meters(nodes[left], nodes[right])
            edges.append(RoadEdge(left, right, distance))
            adjacency.setdefault(left, []).append((right, distance))
            adjacency.setdefault(right, []).append((left, distance))

    _stitch_component_gaps(nodes, edges, adjacency)

    if not nodes or not edges:
        return None
    _NETWORK = RoadNetwork(nodes=nodes, edges=edges, adjacency=adjacency)
    return _NETWORK


def _attach_temporary_node(
    graph: dict[int, list[tuple[int, float]]],
    nodes: list[Coordinate],
    edges: list[RoadEdge],
    point: Coordinate,
) -> int | None:
    best: tuple[float, Coordinate, RoadEdge] | None = None
    for edge in edges:
        snapped = _project_to_segment(point, nodes[edge.left], nodes[edge.right])
        distance = haversine_meters(point, snapped)
        if best is None or distance < best[0]:
            best = (distance, snapped, edge)

    if best is None or best[0] > MAX_SNAP_METERS:
        return None

    distance, snapped, edge = best
    index = len(nodes)
    nodes.append(
        Coordinate(
            longitude=snapped.longitude,
            latitude=snapped.latitude,
            name=point.name,
        )
    )
    left_distance = haversine_meters(snapped, nodes[edge.left])
    right_distance = haversine_meters(snapped, nodes[edge.right])
    snap_distance = max(0.0, distance)
    graph.setdefault(index, [])
    for neighbor, edge_distance in (
        (edge.left, left_distance + snap_distance),
        (edge.right, right_distance + snap_distance),
    ):
        graph[index].append((neighbor, edge_distance))
        graph.setdefault(neighbor, []).append((index, edge_distance))
    return index


def _project_to_segment(
    point: Coordinate, left: Coordinate, right: Coordinate
) -> Coordinate:
    x, y = _to_local_xy(point, point)
    x1, y1 = _to_local_xy(left, point)
    x2, y2 = _to_local_xy(right, point)
    dx = x2 - x1
    dy = y2 - y1
    length_sq = dx * dx + dy * dy
    if length_sq <= 0:
        return left
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length_sq))
    sx = x1 + t * dx
    sy = y1 + t * dy
    return _from_local_xy(sx, sy, point)


def _to_local_xy(point: Coordinate, origin: Coordinate) -> tuple[float, float]:
    lat_scale = 111_320.0
    lon_scale = lat_scale * math.cos(math.radians(origin.latitude))
    return (
        (point.longitude - origin.longitude) * lon_scale,
        (point.latitude - origin.latitude) * lat_scale,
    )


def _from_local_xy(x: float, y: float, origin: Coordinate) -> Coordinate:
    lat_scale = 111_320.0
    lon_scale = lat_scale * math.cos(math.radians(origin.latitude))
    return Coordinate(
        longitude=origin.longitude + x / lon_scale,
        latitude=origin.latitude + y / lat_scale,
    )


def _shortest_path(
    graph: dict[int, list[tuple[int, float]]], start: int, end: int
) -> list[int]:
    queue: list[tuple[float, int]] = [(0.0, start)]
    distances = {start: 0.0}
    previous: dict[int, int] = {}

    while queue:
        distance, node = heapq.heappop(queue)
        if node == end:
            break
        if distance > distances.get(node, float("inf")):
            continue
        for neighbor, weight in graph.get(node, []):
            next_distance = distance + weight
            if next_distance < distances.get(neighbor, float("inf")):
                distances[neighbor] = next_distance
                previous[neighbor] = node
                heapq.heappush(queue, (next_distance, neighbor))

    if end not in distances:
        return []
    path = [end]
    while path[-1] != start:
        path.append(previous[path[-1]])
    path.reverse()
    return path


def _stitch_component_gaps(
    nodes: list[Coordinate],
    edges: list[RoadEdge],
    adjacency: dict[int, list[tuple[int, float]]],
) -> None:
    """Bridge tiny topology gaps so the walk stays on the imported roads."""
    while True:
        components = _connected_components(len(nodes), adjacency)
        if len(components) <= 1:
            return
        best: tuple[float, int, int] | None = None
        for left_index, left_component in enumerate(components):
            for right_component in components[left_index + 1 :]:
                for left in left_component:
                    left_degree = len(adjacency.get(left, []))
                    if left_degree > 2:
                        continue
                    for right in right_component:
                        right_degree = len(adjacency.get(right, []))
                        if right_degree > 2:
                            continue
                        distance = haversine_meters(nodes[left], nodes[right])
                        if distance > MAX_BRIDGE_METERS:
                            continue
                        if best is None or distance < best[0]:
                            best = (distance, left, right)
        if best is None:
            return
        distance, left, right = best
        edges.append(RoadEdge(left, right, distance))
        adjacency.setdefault(left, []).append((right, distance))
        adjacency.setdefault(right, []).append((left, distance))


def _connected_components(
    node_count: int, adjacency: dict[int, list[tuple[int, float]]]
) -> list[list[int]]:
    seen: set[int] = set()
    components: list[list[int]] = []
    for start in range(node_count):
        if start in seen:
            continue
        stack = [start]
        component: list[int] = []
        seen.add(start)
        while stack:
            node = stack.pop()
            component.append(node)
            for neighbor, _ in adjacency.get(node, []):
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    return components


def haversine_meters(left: Coordinate, right: Coordinate) -> float:
    radius = 6_371_000
    lat1, lat2 = math.radians(left.latitude), math.radians(right.latitude)
    delta_lat = math.radians(right.latitude - left.latitude)
    delta_lon = math.radians(right.longitude - left.longitude)
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
