from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import uuid
from datetime import datetime
from functools import lru_cache
from itertools import permutations
from typing import Any

import httpx

from app.config import Settings
from app.database import Database
from app.fieldwork import load_dining_density_lookup
from app.local_roads import plan_local_road_segment
from app.memory import MemoryService
from app.models import (
    Coordinate,
    CrowdSnapshot,
    DiningResult,
    OceanProfile,
    PlanRequest,
    PlanResponse,
    ProfileSource,
    RouteResult,
    SessionContext,
    SpaceRecommendation,
    ToolTraceItem,
    UserConstraints,
    WalkReplanRequest,
    WalkReplanResponse,
    WeatherResult,
)
from app.tools import (
    DiningArgs,
    OpeningStatusArgs,
    RouteArgs,
    SearchSpacesArgs,
    ToolRegistry,
    WeatherArgs,
    haversine_meters,
    traced_call,
)


class DeepSeekGateway:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        self._http_client: httpx.AsyncClient | None = None
        self._narrative_cache: dict[str, tuple[float, tuple[str, dict[str, str]]]] = {}
        if settings.deepseek_api_key:
            try:
                from openai import AsyncOpenAI

                # The desktop environment may expose a SOCKS proxy without the
                # optional socksio package. The API is directly reachable here,
                # so avoid silently disabling the model for that local setup.
                self._http_client = httpx.AsyncClient(
                    transport=httpx.AsyncHTTPTransport(retries=0),
                    trust_env=False,
                    timeout=20,
                )
                self._client = AsyncOpenAI(
                    api_key=settings.deepseek_api_key,
                    base_url=settings.deepseek_base_url,
                    timeout=20,
                    max_retries=1,
                    http_client=self._http_client,
                )
            except ImportError:
                self._client = None

    async def close(self) -> None:
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

    @property
    def available(self) -> bool:
        return self._client is not None

    async def parse_constraints(
        self, query: str, fallback: UserConstraints
    ) -> UserConstraints:
        if not self._client:
            return fallback
        schema = UserConstraints.model_json_schema()
        try:
            response = await self._client.chat.completions.create(
                model=self.settings.deepseek_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "从用户的城市漫步需求中提取约束。只输出 JSON。"
                            "没有明确提到的字段沿用给定默认值，不推测敏感信息。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "query": query,
                                "defaults": fallback.model_dump(mode="json"),
                                "schema": schema,
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
            content = response.choices[0].message.content or "{}"
            return UserConstraints.model_validate(json.loads(content))
        except Exception:
            return fallback

    async def personalized_narrative(
        self,
        profile: OceanProfile,
        constraints: UserConstraints,
        query: str,
        recommendations: list[SpaceRecommendation],
        route: RouteResult | None,
        weather: WeatherResult | None,
        session_context: SessionContext | None = None,
    ) -> tuple[str, dict[str, str]] | None:
        if not self._client:
            return None
        evidence = _narrative_evidence(
            profile, constraints, query, recommendations, route, weather, session_context
        )
        cache_key = hashlib.sha256(
            json.dumps(evidence, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()
        cached = self._narrative_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < 900:
            return cached[1][0], dict(cached[1][1])
        try:
            response = await self._client.chat.completions.create(
                model=self.settings.deepseek_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是 SoulWalking 的知心城市导游。只能使用输入 JSON 中的事实，"
                            "不得新增地点、开放时间、距离、天气、店铺或体验。"
                            "请输出 JSON 对象，不要 Markdown："
                            "{\"route_intro\":\"...\",\"stop_notes\":[{\"space_id\":\"...\",\"text\":\"...\"}]}。"
                            "route_intro 是整条路线的温和开场，90-140 个中文字符：先用 1-2 句像亲近的同行者一样"
                            "回应用户当下的心情或期待；再带用户预览沿途会遇到的空间、画面或节奏，并说明为何适合。"
                            "它必须以用户为主语和感受中心，不是产品说明或路线报告。"
                            "route_intro 不得出现画像、维度、筛选、候选、数据、实测、评分、工具、算法等产品机制，"
                            "也不得出现距离、时长、天气或温度；"
                            "每个输入节点必须各有一条 text，40-60 个中文字符。"
                            "用第二人称，解释它为何适合用户此刻；自然、克制，不使用心理诊断、"
                            "评分数字或'AI/模型'等措辞。"
                        )
                    },
                    {
                        "role": "user",
                        "content": json.dumps(evidence, ensure_ascii=False),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0.35,
                max_tokens=800,
            )
            content = response.choices[0].message.content or "{}"
            payload = json.loads(content)
            intro = _clean_narrative_text(payload.get("route_intro"), 180)
            notes = {
                item.get("space_id"): _clean_narrative_text(item.get("text"), 90)
                for item in payload.get("stop_notes", [])
                if isinstance(item, dict)
                and item.get("space_id") in {node.space_id for node in recommendations}
                and _clean_narrative_text(item.get("text"), 90)
            }
            if len(intro) < 20:
                return None
            result = (intro, notes)
            if len(self._narrative_cache) >= 256:
                now = time.monotonic()
                self._narrative_cache = {
                    key: value
                    for key, value in self._narrative_cache.items()
                    if now - value[0] < 900
                }
            self._narrative_cache[cache_key] = (time.monotonic(), result)
            return intro, dict(notes)
        except Exception:
            return None

    async def select_tools(
        self,
        query: str,
        candidate_ids: list[str],
        required_tools: set[str],
        tool_schemas: list[dict[str, Any]],
    ) -> list[str]:
        """Use real Tool Calling when configured; policy remains the safety floor."""
        if not self._client:
            return sorted(required_tools)
        try:
            response = await self._client.chat.completions.create(
                model=self.settings.deepseek_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是城市路线 Agent 的工具规划器。根据用户需求和候选空间，"
                            "只选择确有必要的工具。应用会重新校验并从权威状态构造参数。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "query": query,
                                "candidate_space_ids": candidate_ids,
                                "required_by_policy": sorted(required_tools),
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
                tools=tool_schemas,
                tool_choice="auto",
                temperature=0,
            )
            calls = response.choices[0].message.tool_calls or []
            selected = {
                call.function.name
                for call in calls
                if call.function.name
                in {
                    "get_weather",
                    "get_tourism_crowd",
                    "search_dining",
                    "check_opening_status",
                    "plan_walking_route",
                }
            }
            return sorted(selected | required_tools)
        except Exception:
            return sorted(required_tools)


class SoulWalkingAgent:
    def __init__(
        self,
        settings: Settings,
        database: Database,
        memory: MemoryService,
        tools: ToolRegistry,
    ):
        self.settings = settings
        self.database = database
        self.memory = memory
        self.tools = tools
        self.llm = DeepSeekGateway(settings)

    async def close(self) -> None:
        await self.llm.close()

    async def plan(self, request: PlanRequest) -> PlanResponse:
        plan_started = time.perf_counter()
        request_id = str(uuid.uuid4())
        warnings: list[str] = []
        trace = []

        profile = request.profile
        if profile:
            self.memory.remember_profile(request.user_id, profile)
        elif request.use_memory:
            profile = self.memory.load_profile(request.user_id)
        if profile is None:
            profile, profile_warning = infer_profile_from_text(request.query)
            if profile_warning:
                warnings.append(profile_warning)

        constraints = merge_constraints(
            heuristic_constraints(request.query), request.constraints
        )
        if self.settings.constraint_parsing_mode == "llm":
            parsed_constraints, item = await traced_call(
                "parse_constraints",
                "deepseek" if self.llm.available else "heuristic-fallback",
                request.query,
                lambda: self.llm.parse_constraints(
                    request.query, constraints
                ),
            )
            trace.append(item)
            if isinstance(parsed_constraints, UserConstraints):
                constraints = parsed_constraints
        else:
            trace.append(
                ToolTraceItem(
                    name="parse_constraints",
                    status="success",
                    duration_ms=0,
                    input_summary=request.query[:300],
                    output_summary=_summarize_constraints(constraints),
                    provider="deterministic-heuristic-fast-path",
                )
            )

        session_context = None
        if request.use_memory:
            session_context = self.memory.update_session_context(
                request.user_id,
                request.session_id,
                request.query,
            )
            constraints = self.memory.apply_session_context(
                constraints, session_context
            )
            trace.append(
                ToolTraceItem(
                    name="session_memory",
                    status="success" if session_context else "skipped",
                    duration_ms=0,
                    input_summary=request.session_id,
                    output_summary=(
                        "已合并短期情境："
                        + "、".join(session_context.ranking_tags())
                        if session_context
                        else "本轮没有可写入的明确短期状态"
                    ),
                    provider="sqlite-ttl",
                )
            )

        preferences = (
            self.memory.preferences(request.user_id) if request.use_memory else {}
        )
        search_args = SearchSpacesArgs(
            query=request.query,
            limit=15,
            mode=request.mode,
        )
        recommendations, item = await traced_call(
            "search_spaces",
            self.tools.index.backend,
            request.query,
            lambda: self.tools.search_spaces(
                search_args,
                profile,
                constraints,
                preferences.get("preference"),
                preferences.get("dislike"),
            ),
        )
        trace.append(item)
        if isinstance(recommendations, Exception):
            recommendations = []
            warnings.append("空间检索失败，无法生成可靠推荐。")

        required_tools: set[str] = set()
        if recommendations:
            required_tools.update(
                {
                    "check_opening_status",
                    "plan_walking_route",
                    "get_weather",
                    "get_tourism_crowd",
                    "search_dining",
                }
            )
        if self.settings.tool_selection_mode == "llm":
            selected_tools, item = await traced_call(
                "select_tools",
                (
                    "deepseek-tool-calling"
                    if self.llm.available
                    else "policy-fallback"
                ),
                (
                    f"候选 {len(recommendations)} 个；"
                    f"策略必需 {sorted(required_tools)}"
                ),
                lambda: self.llm.select_tools(
                    request.query,
                    [
                        recommendation.space_id
                        for recommendation in recommendations
                    ],
                    required_tools,
                    self.tools.schemas(),
                ),
            )
            trace.append(item)
            if isinstance(selected_tools, Exception):
                selected_tools = sorted(required_tools)
        else:
            selected_tools = sorted(required_tools)
            trace.append(
                ToolTraceItem(
                    name="select_tools",
                    status="success",
                    duration_ms=0,
                    input_summary=(
                        f"候选 {len(recommendations)} 个；"
                        f"策略必需 {sorted(required_tools)}"
                    ),
                    output_summary=(
                        "选择工具："
                        + "、".join(
                            _tool_display_name(name)
                            for name in selected_tools
                        )
                    ),
                    provider="deterministic-policy-fast-path",
                )
            )

        if recommendations and "check_opening_status" in selected_tools:
            opening_status: dict[str, str] = {}
            space_ids = [item.space_id for item in recommendations]
            for offset in range(0, len(space_ids), 10):
                opening_args = OpeningStatusArgs(
                    space_ids=space_ids[offset:offset + 10],
                    at=constraints.departure_time,
                )
                batch_status, item = await traced_call(
                    "check_opening_status",
                    "sqlite",
                    ",".join(opening_args.space_ids),
                    lambda args=opening_args: self.tools.check_opening_status(args),
                )
                trace.append(item)
                if isinstance(batch_status, dict):
                    opening_status.update(batch_status)
            if opening_status:
                for recommendation in recommendations:
                    recommendation.opening_status = opening_status.get(
                        recommendation.space_id, "需确认"
                    )
                open_items = [
                    recommendation
                    for recommendation in recommendations
                    if recommendation.opening_status not in {"闭馆", "未知空间"}
                ]
                if open_items:
                    recommendations = open_items
                else:
                    warnings.append("当前候选地点均可能闭馆，保留结果供改期参考。")

        # First keep a broad candidate pool, then trim it to a spatially
        # coherent chain. This keeps personality fit separate from route order.
        recommendations = select_walkable_recommendations(
            recommendations, constraints.start,
            limit=6 if request.mode == "challenge" else 8,
            threshold=60.0,
        )
        pending_attributes = [
            recommendation.name
            for recommendation in recommendations
            if recommendation.attributes_pending_verification
        ]
        if pending_attributes and (
            constraints.price_level != "不限"
            or constraints.indoor is not None
            or constraints.accessibility_required
        ):
            warnings.append(
                "以下地点的价格、室内外或无障碍运营属性待核验："
                + "、".join(pending_attributes)
                + "；本次未将未知属性当作已满足条件。"
            )
        unverified_coordinates = [
            recommendation.name
            for recommendation in recommendations
            if not recommendation.coordinate_verified
        ]
        if unverified_coordinates:
            warnings.append(
                "以下地点仍使用待核验坐标："
                + "、".join(unverified_coordinates)
                + "；地图位置仅供原型展示。"
            )
        weather = None
        crowd = None
        dining = None
        route = None
        pending_calls: list[tuple[str, Any]] = []
        if "get_weather" in selected_tools:
            pending_calls.append(
                (
                    "weather",
                    traced_call(
                        "get_weather",
                        "amap-mcp-or-fallback",
                        "南京",
                        lambda: self.tools.get_weather(
                            WeatherArgs(city="南京")
                        ),
                    ),
                )
            )
        if "get_tourism_crowd" in selected_tools:
            pending_calls.append(
                (
                    "crowd",
                    traced_call(
                        "get_tourism_crowd",
                        "nanjing-tourism-public-page-or-demo",
                        "南京景区舒适度快照",
                        self.tools.get_tourism_crowd,
                    ),
                )
            )
        if "search_dining" in selected_tools:
            pending_calls.append(
                (
                    "dining",
                    traced_call(
                        "search_dining",
                        "local-dining-density",
                        "老门东本地餐饮补给",
                        lambda: self.tools.search_dining(
                            DiningArgs(
                                keyword=("美食" if _wants_food(request.query) else ""),
                                location=constraints.start,
                            )
                        ),
                    ),
                )
            )
        if recommendations and "plan_walking_route" in selected_tools:
            pending_calls.append(
                (
                    "route",
                    traced_call(
                        "plan_walking_route",
                        "amap-mcp+amap-web-v5",
                        (
                            f"{constraints.start.name} -> "
                            f"{len(recommendations)} 个节点"
                        ),
                        lambda: self.tools.plan_walking_route(
                            RouteArgs(
                                origin=constraints.start,
                                destinations=[
                                recommendation.coordinate
                                if recommendation.map_coordinate is None
                                else recommendation.map_coordinate
                                for recommendation in recommendations
                                ],
                            )
                        ),
                    ),
                )
            )

        pending_results = (
            await asyncio.gather(
                *[call for _, call in pending_calls]
            )
            if pending_calls
            else []
        )
        for (kind, _), (result, item) in zip(
            pending_calls, pending_results
        ):
            trace.append(item)
            if kind == "weather" and isinstance(result, WeatherResult):
                weather = result
                if weather.warning:
                    warnings.append(weather.warning)
            elif kind == "crowd" and isinstance(result, CrowdSnapshot):
                crowd = result
                if crowd.warning:
                    warnings.append(crowd.warning)
            elif kind == "dining" and isinstance(result, DiningResult):
                dining = result
                if dining.warning:
                    warnings.append(dining.warning)
            elif kind == "route" and isinstance(result, RouteResult):
                route = result
                if route.warning:
                    warnings.append(route.warning)
                recommendations, route = enforce_duration(
                    recommendations, route, constraints.duration_minutes
                )

        narrative_result, item = await traced_call(
            "personalized_narrative",
            "deepseek" if self.llm.available else "deterministic-template",
            f"{len(recommendations)} 个推荐",
            lambda: self.llm.personalized_narrative(
                profile,
                constraints,
                request.query,
                recommendations,
                route,
                weather,
                session_context,
            ),
        )
        trace.append(item)
        narrative = (
            narrative_result
            if isinstance(narrative_result, tuple) and len(narrative_result) == 2
            else None
        )
        if narrative:
            route_intro, personalized_stop_notes = narrative
        else:
            route_intro, personalized_stop_notes = deterministic_narrative(
                profile, request.query, recommendations, route, weather
            )
            if not self.llm.available:
                warnings.append("未配置 DeepSeek，当前说明由可追溯模板生成。")
        for recommendation in recommendations:
            personalized_stop_notes.setdefault(
                recommendation.space_id,
                deterministic_stop_note(recommendation),
            )
        answer = route_intro

        response = PlanResponse(
            request_id=request_id,
            session_id=request.session_id,
            profile=profile,
            constraints=constraints,
            session_context=session_context,
            recommendations=recommendations,
            route=route,
            weather=weather,
            crowd=crowd,
            dining=dining,
            answer=answer,
            route_intro=route_intro,
            personalized_stop_notes=personalized_stop_notes,
            warnings=_unique(warnings),
            tool_trace=trace,
            total_duration_ms=int(
                (time.perf_counter() - plan_started) * 1000
            ),
        )
        self.database.save_session(
            request.session_id,
            request.user_id,
            summary=f"用户需求：{request.query[:500]}；推荐："
            + "、".join(item.name for item in recommendations),
            last_plan=response.model_dump(mode="json"),
        )
        return response

    async def replan_walk(self, request: WalkReplanRequest) -> WalkReplanResponse:
        """Rebuild the unvisited route tail from the walker's current position."""
        action, query, message = _walk_replan_intent(request.feedback)
        constraints = request.constraints or UserConstraints()
        constraints = constraints.model_copy(
            update={"start": request.current_position}
        )
        remaining_count = len(request.remaining_space_ids) or 4
        if action == "quiet":
            constraints = constraints.model_copy(
                update={
                    "quiet": True,
                    "tags": _unique([*constraints.tags, "低刺激", "安静"]),
                }
            )
        elif action == "rest":
            constraints = constraints.model_copy(
                update={
                    "quiet": True,
                    "tags": _unique([*constraints.tags, "低刺激", "安静"]),
                }
            )
        elif action == "shorten":
            constraints = constraints.model_copy(
                update={"duration_minutes": min(constraints.duration_minutes, 45)}
            )

        if action == "return":
            exit_stop = _nearest_exit(request.current_position)
            route = await self.tools.plan_walking_route(
                RouteArgs(origin=request.current_position, destinations=[exit_stop])
            )
            return WalkReplanResponse(
                request_id=str(uuid.uuid4()),
                session_id=request.session_id,
                action=action,
                message=message,
                recommendations=[],
                route=route,
                exit_stop=exit_stop,
                warnings=[warning for warning in [route.warning] if warning],
            )

        # Reuse the established personality/RAG pipeline, but discard visited
        # nodes and rebuild every route segment from the current position.
        planned = await self.plan(
            PlanRequest(
                user_id=request.user_id,
                session_id=request.session_id,
                query=query,
                profile=request.profile,
                constraints=constraints,
                mode=request.mode,
                use_memory=True,
            )
        )
        visited = set(request.visited_space_ids)
        candidates = [
            item for item in planned.recommendations if item.space_id not in visited
        ]
        if action == "rest":
            candidates.sort(
                key=lambda item: (
                    float(item.features.stay_activity_support)
                    if item.features is not None
                    else 0.0,
                    item.score.final,
                ),
                reverse=True,
            )
        desired_count = {
            "quiet": min(remaining_count, 6),
            "rest": min(remaining_count, 5),
            "dining": min(remaining_count, 5),
            "extend": min(8, remaining_count + 2),
            "shorten": min(3, remaining_count),
        }[action]
        recommendations = candidates[: max(1, desired_count)]
        dining_stop = None
        destinations: list[Coordinate] = []
        if action == "dining":
            dining = await self.tools.search_dining(
                DiningArgs(keyword="美食", location=request.current_position)
            )
            dining_stop = next(
                (
                    place
                    for place in dining.restaurants
                    if place.map_coordinate is not None or place.coordinate is not None
                ),
                None,
            )
            if dining_stop is not None:
                destinations.append(
                    dining_stop.map_coordinate or dining_stop.coordinate  # type: ignore[arg-type]
                )
                recommendations = [
                    item
                    for item in recommendations
                    if item.space_id != dining_stop.id
                ]
        destinations.extend(
            item.map_coordinate or item.coordinate for item in recommendations
        )
        route = (
            await self.tools.plan_walking_route(
                RouteArgs(origin=request.current_position, destinations=destinations)
            )
            if destinations
            else None
        )
        warnings = [*planned.warnings]
        if route and route.warning:
            warnings.append(route.warning)
        if not recommendations and dining_stop is None:
            warnings.append("附近暂未找到可用于替换后半程的节点，已保留当前位置。")
        return WalkReplanResponse(
            request_id=str(uuid.uuid4()),
            session_id=request.session_id,
            action=action,
            message=message,
            recommendations=recommendations,
            route=route,
            dining_stop=dining_stop,
            warnings=_unique(warnings),
        )


def _walk_replan_intent(feedback: str) -> tuple[str, str, str]:
    text = feedback.strip()
    if re.search(r"回去|回家|返程|不想走|不走了|结束|收尾", text):
        return "return", text + "；请规划到最近老门东出口的步行返程。", "已从当前位置为你收束到最近出口。"
    if re.search(r"再走|多走|走一会|逛一会|继续逛|还想走|还想逛", text):
        return "extend", text + "；希望在当前位置之后继续漫游，增加两个不绕远的节点。", "已从当前位置为你延长后半段漫游。"
    if "安静" in text or "人太多" in text:
        return "quiet", text + "；避开热闹节点，优先低刺激、安静、人少的空间。", "正在从当前位置避开热闹节点，换成更安静的走法。"
    if re.search(r"坐坐|休息|歇|累|疲惫|脚疼|脚累", text):
        return "rest", text + "；优先选择适合停留、休息且距离较近的空间。", "正在从当前位置寻找更适合休息停留的节点。"
    if re.search(r"吃|饭|小吃|觅食|餐|饿|喝|咖啡|奶茶|茶|饮料", text):
        return "dining", text + "；先安排一个附近餐饮补给点，再衔接后半段路线。", "正在从当前位置寻找附近的餐饮补给点。"
    return "shorten", text + "；减少后半段步行距离和节点数量。", "正在从当前位置缩短后半段路线。"


def _nearest_exit(origin: Coordinate) -> Coordinate:
    exits = [
        Coordinate(longitude=118.789235, latitude=32.010884, name="老门东东出口"),
        Coordinate(longitude=118.785893, latitude=32.012405, name="老门东三条营门"),
        Coordinate(longitude=118.787898, latitude=32.012777, name="老门东北门"),
    ]
    return min(exits, key=lambda item: haversine_meters(origin, item))


def order_recommendations_for_walk(
    recommendations: list[SpaceRecommendation], origin: Any
) -> list[SpaceRecommendation]:
    """Order the already-ranked candidates into the shortest open walk chain."""
    if len(recommendations) < 3:
        return recommendations

    def point(item: SpaceRecommendation):
        return item.map_coordinate or item.coordinate

    @lru_cache(maxsize=None)
    def pair_distance(
        left_lon: float,
        left_lat: float,
        right_lon: float,
        right_lat: float,
    ) -> float:
        left = Coordinate(longitude=left_lon, latitude=left_lat)
        right = Coordinate(longitude=right_lon, latitude=right_lat)
        segment = plan_local_road_segment(left, right)
        if segment:
            return float(segment.distance_meters)
        return haversine_meters(left, right)

    def distance_between(left: Coordinate, right: Coordinate) -> float:
        return pair_distance(
            round(left.longitude, 6),
            round(left.latitude, 6),
            round(right.longitude, 6),
            round(right.latitude, 6),
        )

    best_order = recommendations
    best_distance = float("inf")
    # The API caps recommendations at five, so exhaustive ordering is tiny and
    # gives a more reliable result than a greedy route for tight clusters.
    for candidate_order in permutations(recommendations):
        distance = distance_between(origin, point(candidate_order[0]))
        distance += sum(
            distance_between(point(left), point(right))
            for left, right in zip(candidate_order, candidate_order[1:])
        )
        if distance < best_distance:
            best_distance = distance
            best_order = list(candidate_order)
    return best_order


def select_walkable_recommendations(
    recommendations: list[SpaceRecommendation],
    origin: Coordinate,
    *,
    limit: int = 8,
    threshold: float = 60.0,
) -> list[SpaceRecommendation]:
    """Two-stage selection: broad semantic candidates then coherent chain."""
    if not recommendations:
        return []
    density_lookup = load_dining_density_lookup()

    def dining_count(item: SpaceRecommendation) -> int:
        if item.dining_poi_count_50m is not None:
            return max(0, int(item.dining_poi_count_50m))
        record = density_lookup.get(item.space_id) or density_lookup.get(item.name)
        if not record:
            return 0
        return max(0, int(record.get("dining_poi_count_50m") or 0))

    max_density = max((dining_count(item) for item in recommendations), default=0) or 1

    def density_bonus(item: SpaceRecommendation) -> float:
        return min(12.0, (dining_count(item) / max_density) * 12.0)

    @lru_cache(maxsize=None)
    def leg_distance(left_lon: float, left_lat: float, right_lon: float, right_lat: float) -> float:
        left = Coordinate(longitude=left_lon, latitude=left_lat)
        right = Coordinate(longitude=right_lon, latitude=right_lat)
        segment = plan_local_road_segment(left, right)
        return float(segment.distance_meters) if segment else haversine_meters(left, right)

    def distance_between_point(left: Coordinate, right: SpaceRecommendation) -> float:
        rp = right.map_coordinate or right.coordinate
        return leg_distance(round(left.longitude, 6), round(left.latitude, 6), round(rp.longitude, 6), round(rp.latitude, 6))

    def distance_between(left: SpaceRecommendation, right: SpaceRecommendation) -> float:
        lp, rp = left.map_coordinate or left.coordinate, right.map_coordinate or right.coordinate
        return leg_distance(round(lp.longitude, 6), round(lp.latitude, 6), round(rp.longitude, 6), round(rp.latitude, 6))

    def proximity_bonus(item: SpaceRecommendation, left: Coordinate) -> float:
        rp = item.map_coordinate or item.coordinate
        distance = leg_distance(
            round(left.longitude, 6),
            round(left.latitude, 6),
            round(rp.longitude, 6),
            round(rp.latitude, 6),
        )
        return max(0.0, 1.0 - distance / 1200.0) * 10.0

    def selection_score(item: SpaceRecommendation, left: Coordinate) -> float:
        return item.score.final + density_bonus(item) + proximity_bonus(item, left)

    ranked = sorted(
        recommendations,
        key=lambda item: (selection_score(item, origin), item.score.final),
        reverse=True,
    )
    eligible = [item for item in ranked if selection_score(item, origin) >= threshold]
    candidate_count = min(15, max(limit + 3, int(round(len(ranked) * 0.5))))
    pool = (eligible or ranked)[:candidate_count]

    max_leg_meters = 650.0

    best: tuple[float, list[SpaceRecommendation]] | None = None
    # Try each strong candidate as an anchor. Select later nodes primarily by
    # spatial continuity while preserving a smaller matching bonus; this makes
    # discrete selection explicit without forcing a fixed final count.
    for anchor in pool[:8]:
        selected = [anchor]
        remaining = [item for item in pool if item is not anchor]
        current_distance = distance_between_point(origin, anchor)
        continuity_weight = 0.72
        match_weight = 0.28
        while remaining and len(selected) < limit:
            previous = selected[-1]
            next_item = max(
                remaining,
                key=lambda item: (
                    max(0.0, 1.0 - distance_between(previous, item) / max_leg_meters) * continuity_weight
                    + item.score.final / 100.0 * match_weight
                    + density_bonus(item) / 100.0 * 0.18
                ),
            )
            step_distance = distance_between(previous, next_item)
            if step_distance > max_leg_meters:
                break
            selected.append(next_item)
            remaining.remove(next_item)
            current_distance += step_distance
            # Later selections reward route coherence more strongly.
            continuity_weight = min(0.86, continuity_weight + 0.035)
            match_weight = max(0.14, match_weight - 0.035)
        average_match = sum(item.score.final for item in selected) / len(selected)
        score = average_match * 0.42 - current_distance / 1000.0 * 100.0 * 0.58 + len(selected) * 1.8
        if best is None or score > best[0]:
            best = (score, selected)
    return order_recommendations_for_walk(best[1] if best else pool[:limit], origin)

def heuristic_constraints(query: str) -> UserConstraints:
    text = query.lower()
    duration = 120
    minute_match = re.search(r"(\d+)\s*分钟", text)
    hour_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:小时|个小时)", text)
    if minute_match:
        duration = int(minute_match.group(1))
    elif hour_match:
        duration = round(float(hour_match.group(1)) * 60)

    tags = [
        tag
        for tag in ["艺术", "历史", "自然", "绿化", "书店", "咖啡", "拍照", "小众"]
        if tag in query
    ]
    return UserConstraints(
        price_level="免费" if "免费" in query or "不花钱" in query else "不限",
        indoor=True if any(word in query for word in ["室内", "下雨", "雨天"]) else None,
        quiet=True
        if any(word in query for word in ["安静", "一个人", "独处", "人少", "累"])
        else False
        if any(word in query for word in ["热闹", "人气", "烟火气"])
        else None,
        duration_minutes=max(20, min(480, duration)),
        tags=tags,
        accessibility_required=any(
            word in query for word in ["无障碍", "轮椅", "腿脚不方便"]
        ),
    )


def merge_constraints(
    inferred: UserConstraints, explicit: UserConstraints | None
) -> UserConstraints:
    if explicit is None:
        return inferred
    defaults = UserConstraints()
    updates: dict[str, Any] = {}
    for field in explicit.model_fields:
        value = getattr(explicit, field)
        default_value = getattr(defaults, field)
        if value != default_value or field in explicit.model_fields_set:
            updates[field] = value
    return inferred.model_copy(update=updates)


def infer_profile_from_text(query: str) -> tuple[OceanProfile, str | None]:
    match = re.search(
        r"\b([EI])([SN])([TF])([JP])\b", query.upper(), flags=re.IGNORECASE
    )
    if not match:
        return OceanProfile(), "未提供测试画像，暂以五维中性值规划。"
    e_i, s_n, t_f, j_p = match.groups()
    profile = OceanProfile(
        openness=70 if s_n == "N" else 40,
        conscientiousness=70 if j_p == "J" else 40,
        extraversion=70 if e_i == "E" else 30,
        agreeableness=65 if t_f == "F" else 45,
        neuroticism=50,
        source=ProfileSource.mbti_heuristic,
        confidence=0.35,
    )
    return profile, "MBTI 仅被启发式转换为初始偏好，不构成心理测量结论。"


def should_check_weather(query: str, constraints: UserConstraints) -> bool:
    return constraints.departure_time is not None or any(
        word in query for word in ["今天", "现在", "天气", "下雨", "雨天", "晴"]
    )


def _wants_food(query: str) -> bool:
    return any(word in query for word in ["吃", "美食", "小吃", "餐饮", "咖啡", "茶", "喝"])


def enforce_duration(
    recommendations: list[SpaceRecommendation],
    route: RouteResult,
    max_minutes: int,
) -> tuple[list[SpaceRecommendation], RouteResult]:
    if route.duration_minutes <= max_minutes or len(recommendations) <= 1:
        return recommendations, route
    ratio = max_minutes / max(1, route.duration_minutes)
    keep = max(1, min(len(recommendations), int(len(recommendations) * ratio)))
    kept = recommendations[:keep]
    coordinates = route.coordinates[: keep + 1]
    kept_segments = route.segments[:keep]
    if kept_segments:
        geometry_complete = all(
            segment.path_coordinates
            and segment.provider != "local-straight-line-fallback"
            for segment in kept_segments
        )
        path_coordinates = _merge_route_paths(
            [
                segment.path_coordinates
                for segment in kept_segments
                if segment.path_coordinates
            ]
        )
        distance_meters = sum(
            segment.distance_meters for segment in kept_segments
        )
        duration_minutes = max(
            1,
            round(
                sum(segment.duration_seconds for segment in kept_segments)
                / 60
            ),
        )
        steps = [
            instruction
            for segment in kept_segments
            for instruction in segment.steps
        ]
    else:
        geometry_complete = False
        path_coordinates = []
        distance_meters = round(
            route.distance_meters * keep / len(recommendations)
        )
        duration_minutes = min(
            max_minutes,
            round(route.duration_minutes * keep / len(recommendations)),
        )
        steps = route.steps[:keep]
    return kept, route.model_copy(
        update={
            "coordinates": coordinates,
            "path_coordinates": path_coordinates,
            "segments": kept_segments,
            "geometry_complete": geometry_complete,
            "distance_meters": distance_meters,
            "duration_minutes": min(max_minutes, duration_minutes),
            "cache_hits": sum(segment.cache_hit for segment in kept_segments),
            "steps": steps,
            "warning": (
                (route.warning + "；" if route.warning else "")
                + "已根据用户时长约束缩短路线。"
            ),
        }
    )


def _merge_route_paths(paths: list[list[Any]]) -> list[Any]:
    merged: list[Any] = []
    for path in paths:
        for coordinate in path:
            if not merged or coordinate != merged[-1]:
                merged.append(coordinate)
    return merged


def _summarize_constraints(constraints: UserConstraints) -> str:
    indoor = (
        "室内"
        if constraints.indoor is True
        else "室外"
        if constraints.indoor is False
        else "室内外不限"
    )
    quiet = (
        "偏好安静"
        if constraints.quiet is True
        else "偏好热闹"
        if constraints.quiet is False
        else "安静程度不限"
    )
    parts = [
        f"预算：{constraints.price_level}",
        f"环境：{indoor}",
        quiet,
        f"时长：{constraints.duration_minutes} 分钟",
        f"起点：{constraints.start.name or '用户指定位置'}",
    ]
    if constraints.tags:
        parts.append("兴趣标签：" + "、".join(constraints.tags))
    if constraints.accessibility_required:
        parts.append("需要无障碍")
    if constraints.departure_time:
        parts.append(
            "出发时间："
            + constraints.departure_time.strftime("%Y-%m-%d %H:%M")
        )
    return "；".join(parts)


def _tool_display_name(name: str) -> str:
    return {
        "get_weather": "实时天气",
        "get_tourism_crowd": "景区客流快照",
        "search_dining": "餐饮密度检索",
        "check_opening_status": "开放状态核验",
        "plan_walking_route": "步行路线规划",
    }.get(name, name)


def _clean_narrative_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _profile_summary(profile: OceanProfile) -> list[str]:
    labels = {
        "openness": ("喜欢发现新鲜细节", "偏好清晰、可预期的节奏"),
        "conscientiousness": ("喜欢有条理地慢慢体验", "愿意随走随看"),
        "extraversion": ("享受热闹与互动", "偏好安静、低刺激的体验"),
        "agreeableness": ("在意沿途氛围与感受", "更看重自己的步行节奏"),
        "neuroticism": ("此刻更需要舒缓、稳定的安排", "能接受一点探索与变化"),
    }
    ranked = sorted(
        ((name, abs(float(getattr(profile, name)) - 50)) for name in labels),
        key=lambda item: item[1],
        reverse=True,
    )[:3]
    return [labels[name][0 if getattr(profile, name) >= 50 else 1] for name, _ in ranked]


def _node_fact(item: SpaceRecommendation) -> str:
    sentences = [part.strip() for part in re.split(r"[。；]", item.reason) if part.strip()]
    factual = [
        sentence
        for sentence in sentences
        if not any(marker in sentence for marker in ("匹配", "实测感知", "行为", "得分"))
    ]
    return _clean_narrative_text((factual[-1] if factual else item.reason), 130)


def _narrative_evidence(
    profile: OceanProfile,
    constraints: UserConstraints,
    query: str,
    recommendations: list[SpaceRecommendation],
    route: RouteResult | None,
    weather: WeatherResult | None,
    session_context: SessionContext | None,
) -> dict[str, Any]:
    state: list[str] = []
    if session_context:
        if session_context.mood:
            state.append(session_context.mood.value)
        if session_context.energy_level is not None:
            state.append("精力偏低" if session_context.energy_level < 45 else "精力充足")
        if session_context.social_mode:
            state.append(session_context.social_mode.value)
        if session_context.quiet_preference is True:
            state.append("想安静一些")
    stops = []
    perception_labels = {
        "safety": "安全感",
        "vitality": "活力",
        "prosperity": "繁盛感",
        "beauty": "美感",
        "humanistic_place": "人文地方感",
        "social_interaction": "互动感",
    }
    for index, item in enumerate(recommendations, 1):
        highlights: list[str] = []
        if item.perceptions:
            ranked = sorted(
                (
                    (label, float(getattr(item.perceptions, field)))
                    for field, label in perception_labels.items()
                ),
                key=lambda entry: entry[1],
                reverse=True,
            )[:2]
            highlights = [label for label, _ in ranked]
        if item.dining_poi_count_50m and item.dining_poi_count_50m >= 15:
            highlights.append("餐饮选择较集中")
        stops.append(
            {
                "space_id": item.space_id,
                "order": index,
                "name": item.name,
                "facts": _node_fact(item),
                "tags": item.tags[:4],
                "experience_highlights": highlights[:3],
            }
        )
    return {
        "narrative_style": "user-first-companion-v2",
        "user_context": {
            "current_request": _clean_narrative_text(query, 180),
            "preference_summary": _profile_summary(profile),
            "current_state": state,
            "preference_tags": constraints.tags[:5],
        },
        "stops": stops,
    }


def deterministic_stop_note(recommendation: SpaceRecommendation) -> str:
    fact = _node_fact(recommendation)
    tags = "、".join(recommendation.tags[:2])
    lead = f"这一站有{tags}的气质，"
    return _clean_narrative_text(lead + fact, 100)


def deterministic_narrative(
    profile: OceanProfile,
    query: str,
    recommendations: list[SpaceRecommendation],
    route: RouteResult | None,
    weather: WeatherResult | None,
) -> tuple[str, dict[str, str]]:
    preferences = "、".join(_profile_summary(profile)[:2])
    preview = "、".join(item.name for item in recommendations[:3])
    intro = _clean_narrative_text(
        f"听见你说“{_clean_narrative_text(query, 60)}”。今天不必把城市走成任务，"
        f"这段漫游会从{preview}慢慢展开，把{preferences}留给你。"
        "沿途可以看看、停停，也把注意力交还给自己。",
        180,
    )
    return intro, {item.space_id: deterministic_stop_note(item) for item in recommendations}


def deterministic_answer(
    recommendations: list[SpaceRecommendation],
    route: RouteResult | None,
    weather: WeatherResult | None,
) -> str:
    if not recommendations:
        return "暂时没有找到同时满足硬约束的空间。可以放宽室内、免费或无障碍条件后重试。"
    lines = ["根据你的空间画像和当前需求，我建议这样走："]
    for index, recommendation in enumerate(recommendations, 1):
        lines.append(f"{index}. {recommendation.name}：{recommendation.reason}")
    if route:
        lines.append(
            f"路线估计约 {route.distance_meters} 米、{route.duration_minutes} 分钟"
            f"（{_route_provider_display(route.provider)}）。"
        )
    if weather and weather.available:
        temperature = (
            f"，约 {weather.temperature_c:g}℃"
            if weather.temperature_c is not None
            else ""
        )
        lines.append(f"南京当前天气：{weather.condition}{temperature}。")
    elif weather:
        lines.append("实时天气暂不可用，请出发前再次确认。")
    return "\n".join(lines)


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    return [item for item in items if item and not (item in seen or seen.add(item))]


def _route_provider_display(provider: str) -> str:
    return {
        "amap-mcp": "高德步行路线工具服务",
        "amap-web-v5-fallback": "高德道路服务降级路线",
        "mixed-amap-fallback": "高德混合降级路线",
        "local-road-network": "本地 ArcGIS 道路网络",
        "local-straight-line-fallback": "本地距离估算",
    }.get(provider, provider)
