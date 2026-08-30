from __future__ import annotations

import asyncio
import html as html_lib
import math
import re
import time
from functools import lru_cache
import json
from pathlib import Path
from datetime import datetime
from typing import Any, Awaitable, Callable

import httpx
from pydantic import BaseModel, Field

from app.mcp_client import AmapMCPClient, MCPUnavailableError
from app.local_roads import plan_local_road_segment
from app.models import (
    Coordinate,
    CrowdAttraction,
    CrowdSnapshot,
    DiningPlace,
    DiningResult,
    OceanProfile,
    RouteResult,
    RouteSegment,
    SpaceRecommendation,
    ToolTraceItem,
    UserConstraints,
    WeatherResult,
)
from app.rag import SpaceIndex


AMAP_WEB_ROUTE_RATE_LIMIT_CODE = "CUQPS_HAS_EXCEEDED_THE_LIMIT"


class AmapWebRouteRateLimitError(RuntimeError):
    """Raised only for the retryable AMap Web route QPS limit."""


def _direct_http_client(
    *, timeout: float, follow_redirects: bool = False
) -> httpx.AsyncClient:
    """Use direct HTTPS for provider calls in the desktop demo environment."""
    return httpx.AsyncClient(
        transport=httpx.AsyncHTTPTransport(retries=0),
        trust_env=False,
        timeout=timeout,
        follow_redirects=follow_redirects,
    )

class SearchSpacesArgs(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(5, ge=1, le=15)
    mode: str = Field("normal", pattern="^(normal|challenge)$")


class OpeningStatusArgs(BaseModel):
    space_ids: list[str] = Field(min_length=1, max_length=10)
    at: datetime | None = None


class WeatherArgs(BaseModel):
    city: str = Field("南京", min_length=1, max_length=50)


class RouteArgs(BaseModel):
    origin: Coordinate
    destinations: list[Coordinate] = Field(min_length=1, max_length=8)


class DiningArgs(BaseModel):
    keyword: str = Field(default="", max_length=80)
    location: Coordinate = Field(
        default_factory=lambda: Coordinate(
            longitude=118.787898, latitude=32.012777, name="老门东北门"
        )
    )
    radius_meters: int = Field(default=900, ge=300, le=1200)


ToolHandler = Callable[[BaseModel], Awaitable[Any]]


class ToolRegistry:
    def __init__(
        self,
        index: SpaceIndex,
        mcp_client: AmapMCPClient,
        amap_api_key: str | None = None,
        weather_cache_ttl_seconds: int = 300,
        route_cache_ttl_seconds: int = 600,
        amap_web_route_max_concurrency: int = 2,
        amap_web_route_retries: int = 3,
    ):
        self.index = index
        self.mcp_client = mcp_client
        self.amap_api_key = amap_api_key
        self.weather_cache_ttl_seconds = max(0, weather_cache_ttl_seconds)
        self.route_cache_ttl_seconds = max(0, route_cache_ttl_seconds)
        self.amap_web_route_max_concurrency = max(
            1, min(2, amap_web_route_max_concurrency)
        )
        self.amap_web_route_retries = max(0, amap_web_route_retries)
        self._weather_cache: dict[str, tuple[float, WeatherResult]] = {}
        self._route_cache: dict[
            tuple[float, float, float, float],
            tuple[float, RouteSegment],
        ] = {}
        self._crowd_cache: tuple[float, CrowdSnapshot] | None = None
        self._dining_cache: dict[str, tuple[float, DiningResult]] = {}
        self._amap_web_route_semaphore = asyncio.Semaphore(
            self.amap_web_route_max_concurrency
        )
        self._amap_web_route_pacing_lock = asyncio.Lock()
        self._next_amap_web_route_at = 0.0

    async def search_spaces(
        self,
        args: SearchSpacesArgs,
        profile: OceanProfile,
        constraints: UserConstraints,
        liked_tags: list[str] | None = None,
        disliked_tags: list[str] | None = None,
    ) -> list[SpaceRecommendation]:
        return self.index.query(
            args.query,
            profile,
            constraints,
            args.limit,
            args.mode,
            liked_tags,
            disliked_tags,
        )

    async def check_opening_status(
        self, args: OpeningStatusArgs
    ) -> dict[str, str]:
        at = args.at or datetime.now()
        statuses: dict[str, str] = {}
        for space_id in args.space_ids:
            record = self.index.records.get(space_id)
            if not record:
                statuses[space_id] = "未知空间"
            else:
                statuses[space_id] = _opening_status(record.opening_hours, at)
        return statuses

    async def get_weather(self, args: WeatherArgs) -> WeatherResult:
        cache_key = args.city.strip()
        cached = self._weather_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] <= self.weather_cache_ttl_seconds:
            return cached[1].model_copy(update={"cache_hit": True})

        result: WeatherResult
        if self.mcp_client.configured:
            try:
                payload = await self.mcp_client.call("weather", {"city": args.city})
                result = _weather_from_mcp(payload, args.city)
                self._weather_cache[cache_key] = (time.monotonic(), result)
                return result
            except Exception as exc:
                mcp_warning = f"MCP 天气不可用：{type(exc).__name__}"
            else:  # pragma: no cover - return above
                mcp_warning = None
        else:
            mcp_warning = "未配置高德 MCP"

        if self.amap_api_key:
            try:
                async with _direct_http_client(timeout=8) as client:
                    response = await client.get(
                        "https://restapi.amap.com/v3/weather/weatherInfo",
                        params={
                            "key": self.amap_api_key,
                            "city": "320100",
                            "extensions": "base",
                        },
                    )
                    response.raise_for_status()
                    payload = response.json()
                lives = payload.get("lives") or []
                if lives:
                    live = lives[0]
                    result = WeatherResult(
                        provider="amap-web-api",
                        available=True,
                        city=live.get("city", args.city),
                        condition=live.get("weather"),
                        temperature_c=_optional_float(live.get("temperature")),
                        warning=mcp_warning,
                    )
                    self._weather_cache[cache_key] = (time.monotonic(), result)
                    return result
            except Exception as exc:
                result = WeatherResult(
                    provider="local-fieldwork-snapshot",
                    available=True,
                    city=args.city,
                    condition="晴间多云",
                    temperature_c=28.0,
                    warning=f"外部天气接口暂不可用，当前显示本地现场演示快照：{type(exc).__name__}",
                )
                self._weather_cache[cache_key] = (time.monotonic(), result)
                return result
        result = WeatherResult(
            provider="local-fieldwork-snapshot",
            available=True,
            city=args.city,
            condition="晴间多云",
            temperature_c=28.0,
            warning="外部实时接口暂不可用，当前显示本地现场演示快照",
        )
        self._weather_cache[cache_key] = (time.monotonic(), result)
        return result

    async def get_tourism_crowd(self) -> CrowdSnapshot:
        """Read the official scheduled snapshot and expose absence honestly."""
        if self._crowd_cache and time.monotonic() - self._crowd_cache[0] <= 600:
            return self._crowd_cache[1].model_copy(update={"cache_hit": True})
        source_url = "https://www.njlyw.cn/websitenew/web/comfort_level"
        schedule = "每日 9:30、11:30、13:30、15:30 发布快照"
        if not self.amap_api_key:
            result = CrowdSnapshot(
                provider="demo-fallback",
                source_label="Demo 景区客流（未配置城市数据 Key）",
                source_url=source_url,
                fetched_at=datetime.now(),
                publication_schedule=schedule,
                is_demo=True,
                old_mendong_area=CrowdAttraction(
                    name="夫子庙—秦淮风光带景区", current=4200, capacity=12000,
                    comfort="舒适", available=True
                ),
                warning="外部客流接口暂不可用，当前显示本地现场演示快照",
            )
            self._crowd_cache = (time.monotonic(), result)
            return result
        try:
            async with _direct_http_client(timeout=8, follow_redirects=True) as client:
                response = await client.get(
                    source_url,
                    headers={"User-Agent": "SoulWalking/1.0 (+fieldwork-demo)"},
                )
                response.raise_for_status()
            attractions = _parse_nanjing_crowd_page(response.text)
            if not attractions:
                raise ValueError("official snapshot contains no readable crowd rows")
            old_mendong = next(
                (item for item in attractions if re.search(r"夫子庙|秦淮", item.name)),
                attractions[0],
            )
            result = CrowdSnapshot(
                provider="nanjing-tourism-public-page",
                source_label="南京文旅景区舒适度快照",
                source_url=source_url,
                fetched_at=datetime.now(),
                publication_schedule=schedule,
                old_mendong_area=old_mendong,
                attractions=attractions[:8],
            )
        except Exception as exc:
            result = CrowdSnapshot(
                provider="demo-fallback",
                source_label="Demo 景区客流（官方快照不可用）",
                source_url=source_url,
                fetched_at=datetime.now(),
                publication_schedule=schedule,
                is_demo=True,
                old_mendong_area=CrowdAttraction(
                    name="夫子庙—秦淮风光带景区", current=4200, capacity=12000,
                    comfort="舒适", available=True
                ),
                warning=f"官方快照暂不可用，当前显示本地现场演示快照：{type(exc).__name__}",
            )
        self._crowd_cache = (time.monotonic(), result)
        return result

    async def search_dining(self, args: DiningArgs) -> DiningResult:
        cache_key = (
            f"{args.keyword}:{args.location.longitude:.5f}:"
            f"{args.location.latitude:.5f}:{args.radius_meters}"
        )
        cached = self._dining_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] <= 1800:
            return cached[1].model_copy(update={"cache_hit": True})
        def build_candidates(apply_radius: bool) -> list[tuple[float, int, DiningPlace]]:
            result_items: list[tuple[float, int, DiningPlace]] = []
            for record in self.index.records.values():
                count = int(record.dining_poi_count_50m or 0)
                coordinate = record.map_coordinate or record.coordinate
                if count <= 0 or not coordinate:
                    continue
                distance = round(haversine_meters(args.location, coordinate))
                if apply_radius and distance > args.radius_meters:
                    continue
                priority = count * 100.0 - distance
                result_items.append(
                    (
                        -priority,
                        distance,
                        DiningPlace(
                            id=record.id,
                            name=record.name,
                            type="餐饮密度节点",
                            address=record.address,
                            distance_meters=distance,
                            coordinate=record.coordinate,
                            map_coordinate=record.map_coordinate,
                        ),
                    )
                )
            return result_items

        candidates = build_candidates(True)
        if not candidates:
            candidates = build_candidates(False)
        if not candidates:
            result = _demo_dining_result("本地餐饮补给暂未命中可用节点")
        else:
            restaurants = [
                place for _, _, place in sorted(
                    candidates, key=lambda item: (item[0], item[1])
                )
            ]
            result = DiningResult(
                provider="local-dining-density",
                source_label="本地餐饮补给",
                restaurants=restaurants[:40],
            )
        self._dining_cache[cache_key] = (time.monotonic(), result)
        return result

    async def plan_walking_route(self, args: RouteArgs) -> RouteResult:
        coordinates = [args.origin, *args.destinations]
        async with _direct_http_client(timeout=8) as client:
            segment_results = await asyncio.gather(
                *[
                    self._plan_walking_segment(
                        origin, destination, client
                    )
                    for origin, destination in zip(
                        coordinates, coordinates[1:]
                    )
                ]
            )
        segments = [result[0] for result in segment_results]
        warnings = [
            warning
            for _, segment_warnings in segment_results
            for warning in segment_warnings
        ]
        providers = {segment.provider for segment in segments}
        if providers == {"amap-mcp"}:
            provider = "amap-mcp"
        elif providers == {"amap-web-v5-fallback"}:
            provider = "amap-web-v5-fallback"
        elif providers == {"local-road-network"}:
            provider = "local-road-network"
        elif providers == {"local-straight-line-fallback"}:
            provider = "local-straight-line-fallback"
        else:
            provider = "mixed-amap-fallback"

        geometry_complete = all(
            segment.path_coordinates and segment.provider != "local-straight-line-fallback"
            for segment in segments
        )
        path_coordinates = _merge_paths(
            [
                segment.path_coordinates
                for segment in segments
                if segment.path_coordinates
            ]
        )
        return RouteResult(
            provider=provider,
            distance_meters=sum(segment.distance_meters for segment in segments),
            duration_minutes=max(
                1,
                round(
                    sum(segment.duration_seconds for segment in segments)
                    / 60
                ),
            ),
            coordinates=coordinates,
            path_coordinates=path_coordinates,
            segments=segments,
            geometry_provider=(
                next(
                    (
                        segment.geometry_provider
                        for segment in segments
                        if segment.path_coordinates and segment.geometry_provider
                    ),
                    None,
                )
                if any(segment.path_coordinates for segment in segments)
                else None
            ),
            geometry_complete=geometry_complete,
            cache_hits=sum(segment.cache_hit for segment in segments),
            steps=[
                instruction
                for segment in segments
                for instruction in segment.steps
            ],
            warning="；".join(_unique_strings(warnings)) or None,
        )

    async def _plan_walking_segment(
        self,
        origin: Coordinate,
        destination: Coordinate,
        web_client: httpx.AsyncClient,
    ) -> tuple[RouteSegment, list[str]]:
        cache_key = (
            round(origin.longitude, 6),
            round(origin.latitude, 6),
            round(destination.longitude, 6),
            round(destination.latitude, 6),
        )
        cached = self._route_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] <= self.route_cache_ttl_seconds:
            cached_segment = cached[1].model_copy(
                update={
                    "origin": origin,
                    "destination": destination,
                    "cache_hit": True,
                }
            )
            cached_warnings: list[str] = []
            if cached_segment.provider == "amap-web-v5-fallback":
                cached_warnings.append(
                    "本段高德 MCP 调用不可用，已使用高德 Web 步行路线降级"
                )
            if not cached_segment.path_coordinates:
                cached_warnings.append(
                    "高德 MCP 已返回步行指令，但道路几何不可用；"
                    "地图仅显示站点，不绘制直线"
                )
            return (
                cached_segment,
                cached_warnings,
            )

        mcp_call = (
            self.mcp_client.call(
                "walking_route",
                {
                    "origin": f"{origin.longitude},{origin.latitude}",
                    "destination": (
                        f"{destination.longitude},{destination.latitude}"
                    ),
                },
            )
            if self.mcp_client.configured
            else _none()
        )
        web_call = (
            self._fetch_amap_web_route_with_retry(
                web_client, self.amap_api_key, origin, destination
            )
            if self.amap_api_key
            else _none()
        )
        mcp_payload, web_payload = await asyncio.gather(
            mcp_call, web_call, return_exceptions=True
        )
        mcp_segment = (
            _route_segment_from_mcp(mcp_payload, origin, destination)
            if isinstance(mcp_payload, dict)
            else None
        )
        web_segment = (
            _route_segment_from_web(web_payload, origin, destination)
            if isinstance(web_payload, dict)
            else None
        )
        warnings: list[str] = []
        if isinstance(web_payload, AmapWebRouteRateLimitError):
            warnings.append(
                "高德 Web 步行路线请求触发频率限制，已退避重试但仍未取得道路折线。"
            )

        if mcp_segment:
            segment = mcp_segment.model_copy(
                update={
                    "path_coordinates": (
                        web_segment.path_coordinates if web_segment else []
                    ),
                    "geometry_provider": (
                        "amap-web-v5" if web_segment else None
                    ),
                }
            )
            if not web_segment:
                warnings.append(
                    "高德 MCP 已返回步行指令，但道路几何不可用；"
                    "地图仅显示站点，不绘制直线"
                )
        elif web_segment:
            segment = web_segment.model_copy(
                update={"provider": "amap-web-v5-fallback"}
            )
            warnings.append(
                "本段高德 MCP 调用不可用，已使用高德 Web 步行路线降级"
            )
        else:
            local_segment = plan_local_road_segment(origin, destination)
            if local_segment:
                segment = local_segment
                warnings.append(
                    "高德路线暂不可用，已使用 ArcGIS 导入的本地道路网络规划。"
                )
            else:
                distance = round(haversine_meters(origin, destination))
                segment = RouteSegment(
                    origin=origin,
                    destination=destination,
                    distance_meters=distance,
                    duration_seconds=max(60, round(distance / 1.25)),
                    steps=[
                        f"从{origin.name or '当前点'}步行至"
                        f"{destination.name or '下一节点'}"
                    ],
                    path_coordinates=[origin, destination],
                    provider="local-straight-line-fallback",
                    geometry_provider="local-straight-line-fallback",
                )
                warnings.append(
                    "未取得实时道路路线，且本地道路网络无法吸附该点；"
                    "已用直线补接该段，非真实道路"
                )

        # Do not cache an MCP-only segment without road geometry: a later plan
        # should be allowed to retry the Web route service after a transient QPS limit.
        if (
            segment.provider != "local-straight-line-fallback"
            and segment.path_coordinates
        ):
            self._route_cache[cache_key] = (time.monotonic(), segment)
        return segment, warnings

    async def _fetch_amap_web_route_with_retry(
        self,
        web_client: httpx.AsyncClient,
        api_key: str,
        origin: Coordinate,
        destination: Coordinate,
    ) -> dict[str, Any]:
        """Pace Web v5 route calls and retry only the documented QPS response."""
        for attempt in range(self.amap_web_route_retries + 1):
            try:
                async with self._amap_web_route_semaphore:
                    await self._pace_amap_web_route_request()
                    return await _fetch_amap_walking_route(
                        web_client, api_key, origin, destination
                    )
            except AmapWebRouteRateLimitError:
                if attempt >= self.amap_web_route_retries:
                    raise
                # Back off before rejoining the shared request pacer. The small
                # jitter avoids every waiting segment retrying on the same tick.
                delay = 0.6 * (2**attempt) + (attempt * 0.07)
                await asyncio.sleep(delay)
        raise AssertionError("unreachable")  # pragma: no cover

    async def _pace_amap_web_route_request(self) -> None:
        """Keep launches at roughly two requests per second across one app process."""
        async with self._amap_web_route_pacing_lock:
            now = time.monotonic()
            wait_seconds = max(0.0, self._next_amap_web_route_at - now)
            self._next_amap_web_route_at = max(
                now, self._next_amap_web_route_at
            ) + 0.55
        if wait_seconds:
            await asyncio.sleep(wait_seconds)

    @staticmethod
    def schemas() -> list[dict[str, Any]]:
        return [
            _tool_schema(
                "get_weather",
                "查询南京当前天气；当用户提及今天、现在、下雨或天气时使用。",
                WeatherArgs,
            ),
            _tool_schema(
                "check_opening_status",
                "检查候选空间在指定时刻是否开放。",
                OpeningStatusArgs,
            ),
            _tool_schema(
                "plan_walking_route",
                "根据起点和一个或多个候选节点规划步行路线。",
                RouteArgs,
            ),
            _tool_schema(
                "get_tourism_crowd",
                "读取南京文旅公开发布的景区客流快照；它不是秒级实时人数。",
                BaseModel,
            ),
            _tool_schema(
                "search_dining",
                "按老门东路线起点读取本地餐饮密度表，返回附近更适合停留和补给的节点。",
                DiningArgs,
            ),
        ]


async def traced_call(
    name: str,
    provider: str,
    input_summary: str,
    call: Callable[[], Awaitable[Any]],
) -> tuple[Any, ToolTraceItem]:
    started = time.perf_counter()
    try:
        result = await call()
        status = "success"
        output = _summary(result)
        if getattr(result, "available", True) is False or getattr(
            result, "warning", None
        ):
            status = "degraded"
    except Exception as exc:
        result = exc
        status = "failed"
        output = f"{type(exc).__name__}: {exc}"
    duration = int((time.perf_counter() - started) * 1000)
    return result, ToolTraceItem(
        name=name,
        status=status,
        duration_ms=duration,
        input_summary=input_summary[:300],
        output_summary=output[:500],
        provider=provider,
    )


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


def _opening_status(opening_hours: str, at: datetime) -> str:
    if opening_hours in {"全天开放", "预约开放"}:
        return "开放" if opening_hours == "全天开放" else "需预约确认"
    if "周二至周日" in opening_hours and at.weekday() == 0:
        return "闭馆"
    match = __import__("re").search(
        r"(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})", opening_hours
    )
    if not match:
        return "需现场确认"
    start = int(match.group(1)) * 60 + int(match.group(2))
    end = int(match.group(3)) * 60 + int(match.group(4))
    current = at.hour * 60 + at.minute
    return "开放" if start <= current <= end else "闭馆"


def _tool_schema(name: str, description: str, model: type[BaseModel]) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": model.model_json_schema(),
        },
    }


def _weather_from_mcp(payload: dict[str, Any], city: str) -> WeatherResult:
    text = str(payload)
    forecasts = payload.get("forecasts") or payload.get("lives") or []
    item = forecasts[0] if isinstance(forecasts, list) and forecasts else payload
    condition = (
        item.get("weather")
        or item.get("dayweather")
        or item.get("condition")
        or text[:80]
    )
    temperature = (
        item.get("temperature")
        or item.get("daytemp")
        or item.get("temperature_c")
    )
    return WeatherResult(
        provider="amap-mcp",
        available=True,
        city=item.get("city", city) if isinstance(item, dict) else city,
        condition=str(condition),
        temperature_c=_optional_float(temperature),
    )


def _route_segment_from_mcp(
    payload: dict[str, Any], origin: Coordinate, destination: Coordinate
) -> RouteSegment | None:
    paths = payload.get("paths")
    if not paths and isinstance(payload.get("route"), dict):
        paths = payload["route"].get("paths")
    if not paths:
        return None
    path = paths[0]
    return RouteSegment(
        origin=origin,
        destination=destination,
        provider="amap-mcp",
        distance_meters=int(float(path.get("distance", 0))),
        duration_seconds=max(0, round(float(path.get("duration", 0)))),
        steps=[
            step.get("instruction", "")
            for step in path.get("steps", [])
            if step.get("instruction")
        ],
    )


def _route_segment_from_web(
    payload: dict[str, Any], origin: Coordinate, destination: Coordinate
) -> RouteSegment | None:
    route = payload.get("data") or payload.get("route") or payload
    if not isinstance(route, dict):
        return None
    paths = route.get("paths") or []
    if not paths:
        return None
    path = paths[0]
    steps = path.get("steps") or []
    path_coordinates = _merge_paths(
        [
            _parse_polyline(step.get("polyline"))
            for step in steps
            if step.get("polyline")
        ]
    )
    cost = path.get("cost") if isinstance(path.get("cost"), dict) else {}
    duration = path.get("duration") or cost.get("duration") or 0
    return RouteSegment(
        origin=origin,
        destination=destination,
        provider="amap-web-v5",
        geometry_provider="amap-web-v5" if path_coordinates else None,
        distance_meters=max(0, round(float(path.get("distance", 0)))),
        duration_seconds=max(0, round(float(duration))),
        steps=[
            str(step.get("instruction"))
            for step in steps
            if step.get("instruction")
        ],
        path_coordinates=path_coordinates,
    )


async def _fetch_amap_walking_route(
    client: httpx.AsyncClient,
    api_key: str,
    origin: Coordinate,
    destination: Coordinate,
) -> dict[str, Any]:
    response = await client.get(
        "https://restapi.amap.com/v5/direction/walking",
        params={
            "key": api_key,
            "origin": f"{origin.longitude:.6f},{origin.latitude:.6f}",
            "destination": (
                f"{destination.longitude:.6f},{destination.latitude:.6f}"
            ),
            "show_fields": "cost,navi,polyline",
        },
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") is not None and str(payload.get("status")) != "1":
        error_info = str(payload.get("info") or payload.get("errmsg") or "")
        if AMAP_WEB_ROUTE_RATE_LIMIT_CODE in error_info.upper():
            raise AmapWebRouteRateLimitError(error_info)
        raise ValueError(
            f"高德 Web 路线失败：{error_info}"
        )
    return payload


def _parse_polyline(value: Any) -> list[Coordinate]:
    if not isinstance(value, str):
        return []
    coordinates: list[Coordinate] = []
    for pair in value.split(";"):
        try:
            longitude, latitude = pair.split(",", maxsplit=1)
            coordinate = Coordinate(
                longitude=float(longitude),
                latitude=float(latitude),
            )
        except (TypeError, ValueError):
            continue
        if not coordinates or coordinate != coordinates[-1]:
            coordinates.append(coordinate)
    return coordinates


def _merge_paths(paths: list[list[Coordinate]]) -> list[Coordinate]:
    """Merge provider road polylines without endpoint snapshots.

    Walking APIs snap endpoints onto roads. Re-inserting place-marker
    endpoints creates artificial through-building connectors, so keep only
    actual returned road geometry in the combined display path.
    """
    merged: list[Coordinate] = []
    for path in paths:
        if len(path) < 2:
            continue
        start = 1 if merged and path and path[0] == merged[-1] else 0
        for coordinate in path[start:]:
            if not merged or coordinate != merged[-1]:
                merged.append(coordinate)
    return merged


async def _none() -> None:
    return None


def _unique_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    return [
        item
        for item in items
        if item and not (item in seen or seen.add(item))
    ]


def _summary(value: Any) -> str:
    if (
        isinstance(value, tuple)
        and len(value) == 2
        and isinstance(value[0], str)
        and isinstance(value[1], dict)
    ):
        return f"已生成个性化路线导览与 {len(value[1])} 条节点说明"
    if isinstance(value, list):
        if value and all(isinstance(item, str) for item in value):
            return "选择工具：" + "、".join(
                {
                    "get_weather": "实时天气",
                    "check_opening_status": "开放状态核验",
                    "plan_walking_route": "步行路线规划",
                    "get_tourism_crowd": "景区客流快照",
                    "search_dining": "餐饮密度检索",
                }.get(item, item)
                for item in value
            )
        return f"返回 {len(value)} 条结果"
    if isinstance(value, dict):
        return (
            f"已核验 {len(value)} 个地点："
            + "、".join(
                f"{space_id} {status}"
                for space_id, status in value.items()
            )
        )
    if isinstance(value, RouteResult):
        cache = f"，缓存命中 {value.cache_hits} 段" if value.cache_hits else ""
        geometry = "，道路几何完整" if value.geometry_complete else "，道路几何不完整"
        return (
            f"{value.provider}，约 {value.distance_meters} 米 / "
            f"{value.duration_minutes} 分钟{geometry}{cache}"
        )
    if isinstance(value, WeatherResult):
        return (
            f"{value.provider}，"
            + (
                f"{value.condition or '天气未知'}"
                if value.available
                else "实时天气不可用"
            )
            + ("，缓存命中" if value.cache_hit else "")
        )
    if isinstance(value, CrowdSnapshot):
        spot = value.old_mendong_area
        if spot.available and spot.current is not None:
            return f"{value.source_label}，{spot.name} 当前 {spot.current} 人"
        return f"{value.source_label}，官方本时点暂未发布有效客流"
    if isinstance(value, DiningResult):
        return f"{value.source_label}，返回 {len(value.restaurants)} 个吃喝候选"
    if isinstance(value, UserConstraints):
        indoor = (
            "室内"
            if value.indoor is True
            else "室外"
            if value.indoor is False
            else "室内外不限"
        )
        quiet = (
            "偏好安静"
            if value.quiet is True
            else "偏好热闹"
            if value.quiet is False
            else "安静程度不限"
        )
        return (
            f"预算：{value.price_level}；环境：{indoor}；{quiet}；"
            f"时长：{value.duration_minutes} 分钟；"
            f"起点：{value.start.name or '用户指定位置'}"
        )
    if isinstance(value, str):
        return f"已生成 {len(value)} 字的路线说明"
    if isinstance(value, BaseModel):
        return "已返回结构化结果"
    return str(value)


def _parse_nanjing_crowd_page(html: str) -> list[CrowdAttraction]:
    """Tolerant parser for the public, schedule-based comfort-level page."""
    rows: list[CrowdAttraction] = []
    for item in re.findall(r"<li\b[^>]*>[\s\S]*?</li>", html, flags=re.I):
        text = _strip_html(item)
        if "当前客流" not in text:
            continue
        name = _first_html_text(item, r'<div\s+class=["\']s1["\'][^>]*>([\s\S]*?)</div>')
        numbers = re.search(
            r"当前客流\s*[:：]\s*([\d,]+)\s*人\s*瞬间最大承载量\s*[:：]\s*([\d,]+)\s*人",
            text,
        )
        if not name or not numbers:
            continue
        comfort = _first_html_text(item, r'<span\s+class=["\']color\d+["\'][^>]*>([\s\S]*?)</span>') or "待发布"
        available = comfort not in {"N/A", "待发布", "本时点暂未发布"} and int(
            numbers.group(2).replace(",", "")
        ) > 0
        rows.append(
            CrowdAttraction(
                name=name,
                current=int(numbers.group(1).replace(",", "")),
                capacity=int(numbers.group(2).replace(",", "")),
                comfort=comfort,
                available=available,
            )
        )
    return rows


def _strip_html(value: str) -> str:
    text = html_lib.unescape(re.sub(r"<[^>]+>", " ", value))
    text = re.sub(r"[\ue000-\uf8ff]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _first_html_text(value: str, pattern: str) -> str | None:
    found = re.search(pattern, value, flags=re.I)
    return _strip_html(found.group(1)) if found else None


def _dining_place_from_amap(poi: Any) -> DiningPlace | None:
    if not isinstance(poi, dict) or not poi.get("name"):
        return None
    location = str(poi.get("location") or "")
    try:
        longitude, latitude = (float(part) for part in location.split(",", 1))
        coordinate = Coordinate(longitude=longitude, latitude=latitude)
    except (TypeError, ValueError):
        coordinate = None
    business = poi.get("business") if isinstance(poi.get("business"), dict) else {}
    return DiningPlace(
        id=str(poi.get("id") or poi.get("name")),
        name=str(poi["name"]),
        type=str(poi.get("type") or "餐饮服务"),
        address=str(poi.get("address") or ""),
        distance_meters=_optional_int(poi.get("distance")),
        rating=_optional_string(business.get("rating") or poi.get("rating")),
        cost=_optional_string(business.get("cost") or poi.get("cost")),
        coordinate=coordinate,
        map_coordinate=coordinate,
    )


_OLD_MENDONG_BOUNDARY_PATH = (
    Path(__file__).resolve().parent / "data" / "old_mendong_boundary.geojson"
)


@lru_cache(maxsize=1)
def _old_mendong_ring() -> tuple[tuple[float, float], ...]:
    payload = json.loads(_OLD_MENDONG_BOUNDARY_PATH.read_text(encoding="utf-8"))
    geometry = payload.get("features", [{}])[0].get("geometry", {})
    ring = geometry.get("coordinates", [[]])[0]
    return tuple((float(lon), float(lat)) for lon, lat, *_ in ring)


def _inside_old_mendong(coordinate: Coordinate | None) -> bool:
    """Point-in-polygon test against the exported study boundary."""
    if coordinate is None:
        return False
    ring = _old_mendong_ring()
    if len(ring) < 3:
        return False
    x, y = coordinate.longitude, coordinate.latitude
    inside = False
    previous = ring[-1]
    for vertex in ring:
        x1, y1 = previous
        x2, y2 = vertex
        if (y1 > y) != (y2 > y):
            intersection_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection_x:
                inside = not inside
        previous = vertex
    return inside

def _demo_dining_result(warning: str) -> DiningResult:
    places = [
        DiningPlace(id="demo-food-1", name="老门东风味小吃补给点", type="餐饮服务", address="老门东片区（Demo）", distance_meters=260, map_coordinate=Coordinate(longitude=118.7882, latitude=32.0129)),
        DiningPlace(id="demo-food-2", name="秦淮茶饮休息点", type="餐饮服务", address="三条营周边（Demo）", distance_meters=430, map_coordinate=Coordinate(longitude=118.7878, latitude=32.0135)),
        DiningPlace(id="demo-food-3", name="街巷甜品补给点", type="餐饮服务", address="箍桶巷周边（Demo）", distance_meters=610, map_coordinate=Coordinate(longitude=118.7870, latitude=32.0142)),
    ]
    return DiningResult(
        provider="demo-fallback",
        source_label="Demo 餐饮数据",
        is_demo=True,
        restaurants=places,
        warning=warning,
    )


def _optional_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _optional_string(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _optional_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None



