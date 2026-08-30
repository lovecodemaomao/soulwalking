from __future__ import annotations

import json
import asyncio
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.agent import SoulWalkingAgent
from app.config import ROOT_DIR, settings
from app.database import Database
from app.mcp_client import AmapMCPClient
from app.memory import MemoryService
from app.models import (
    Coordinate,
    BigFiveProfileRequest,
    FeedbackRequest,
    HealthResponse,
    MemoryView,
    MemoryCategory,
    PlanRequest,
    PlanResponse,
    ProfileScoreRequest,
    RouteAdjustmentRequest,
    SessionMemoryView,
    WalkReplanRequest,
    WalkReplanResponse,
)
from app.questions import AnswerValidationError, QUESTIONS, score_answers
from app.rag import SpaceIndex, build_embedding, load_seed_spaces
from app.security import SlidingWindowRateLimiter
from app.tools import (
    DiningArgs,
    RouteArgs,
    ToolRegistry,
    WeatherArgs,
)

AMAP_SERVICE_HOST = "/_AMapService"
LEGACY_AMAP_SERVICE_HOST = "/api/_AMapService"


def _amap_service_host(request: Request) -> str:
    """JSAPI requires an absolute URL whose first path segment is _AMapService."""
    return f"{str(request.base_url).rstrip('/')}{AMAP_SERVICE_HOST}"


def _amap_upstream_url(service_path: str) -> str:
    """Route each JSAPI proxy request to the upstream host required by AMap."""
    if service_path.startswith("v4/map/styles"):
        return f"https://webapi.amap.com/{service_path}"
    if service_path.startswith("v3/vectormap"):
        return f"https://fmap01.amap.com/{service_path}"
    return f"https://restapi.amap.com/{service_path}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    records = load_seed_spaces()
    database = Database(settings.database_path)
    database.initialize()
    database.seed_spaces(records)
    embedding, embedding_warning = build_embedding(
        settings.embedding_backend, settings.embedding_model
    )
    index = SpaceIndex(records, settings.chroma_path, embedding)
    mcp_client = AmapMCPClient(
        settings.resolved_mcp_url if settings.mcp_enabled else None
    )
    memory = MemoryService(
        database,
        session_ttl_hours=settings.short_term_memory_hours,
    )
    tools = ToolRegistry(
        index,
        mcp_client,
        settings.amap_api_key,
        weather_cache_ttl_seconds=settings.weather_cache_ttl_seconds,
        route_cache_ttl_seconds=settings.route_cache_ttl_seconds,
        amap_web_route_max_concurrency=settings.amap_web_route_max_concurrency,
        amap_web_route_retries=settings.amap_web_route_retries,
    )
    app.state.database = database
    app.state.rate_limiter = SlidingWindowRateLimiter(
        settings.api_rate_limit_requests,
        settings.api_rate_limit_window_seconds,
    )
    app.state.embedding_warning = embedding_warning
    app.state.index = index
    app.state.mcp_client = mcp_client
    app.state.tools = tools
    app.state.memory = memory
    app.state.agent = SoulWalkingAgent(settings, database, memory, tools)
    try:
        yield
    finally:
        await app.state.agent.close()


app = FastAPI(
    title="SoulWalking Agent API",
    version="0.1.0",
    description="基于五维空间人格、RAG、工具调用、MCP 和 Memory 的城市漫游 Agent。",
    lifespan=lifespan,
)
if settings.allowed_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))
app.add_middleware(
    CORSMiddleware,
    allow_origins=(
        ["*"]
        if settings.app_env == "development"
        else list(settings.allowed_origins)
    ),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)
app.mount(
    "/assets",
    StaticFiles(directory=ROOT_DIR / "web" / "assets", check_dir=False),
    name="assets",
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    # Allow the same-origin walk page to request location; browsers still ask
    # the user for explicit permission and HTTPS is required on most phones.
    response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"
    return response


async def _limit_expensive_request(request: Request) -> None:
    limiter: SlidingWindowRateLimiter = request.app.state.rate_limiter
    client_host = request.client.host if request.client else "unknown"
    if not await limiter.allow(f"{request.url.path}:{client_host}"):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")


@app.get("/", include_in_schema=False)
async def frontend():
    path = ROOT_DIR / "web" / "assets" / "light" / "index.html"
    if not path.exists():
        path = ROOT_DIR / "web" / "index.html"
    if not path.exists():
        path = ROOT_DIR / "soulpath.html"
    return FileResponse(path)


@app.get("/api/v1/questions")
async def questions(request: Request):
    return {
        "request_id": request.state.request_id,
        "questions": [
            {
                "id": question.id,
                "dimension": question.dimension.value,
                "prompt": question.prompt,
                "option_a": question.option_a,
                "option_b": question.option_b,
                "option_a_image": question.option_a_image,
                "option_b_image": question.option_b_image,
            }
            for question in QUESTIONS
        ],
    }


@app.get("/api/v1/map/config")
async def map_config(request: Request):
    enabled = bool(settings.amap_js_key and settings.amap_security_js_code)
    return {
        "request_id": request.state.request_id,
        "enabled": enabled,
        "key": settings.amap_js_key if enabled else None,
        "service_host": _amap_service_host(request) if enabled else None,
    }


@app.get("/api/v1/city-context")
async def city_context(request: Request):
    """Homepage cards: weather plus an official, scheduled crowd snapshot."""
    weather, crowd = await asyncio.gather(
        request.app.state.tools.get_weather(WeatherArgs(city="南京市秦淮区")),
        request.app.state.tools.get_tourism_crowd(),
    )
    return {
        "request_id": request.state.request_id,
        "area": "南京·老门东",
        "weather": weather,
        "crowd": crowd,
    }


@app.get("/api/v1/fieldwork/track")
async def fieldwork_track(request: Request):
    """Return the surveyed walk as a map-ready GCJ-02 GeoJSON overlay."""
    path = ROOT_DIR / "app" / "data" / "fieldwork_track.geojson"
    if not path.exists():
        raise HTTPException(status_code=503, detail="实地调研轨迹尚未导入")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return JSONResponse({"request_id": request.state.request_id, "track": payload})


@app.get("/api/v1/fieldwork/audit")
async def fieldwork_audit(request: Request):
    path = ROOT_DIR / "app" / "data" / "fieldwork_audit.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="节点采集审计尚未导入")
    return JSONResponse(
        {"request_id": request.state.request_id, "audit": json.loads(path.read_text(encoding="utf-8"))}
    )


@app.get(
    f"{AMAP_SERVICE_HOST}/{{service_path:path}}",
    include_in_schema=False,
)
@app.get(
    f"{LEGACY_AMAP_SERVICE_HOST}/{{service_path:path}}",
    include_in_schema=False,
)
async def amap_service_proxy(service_path: str, request: Request):
    """Keep the AMap JS security code on the local server."""
    if not settings.amap_security_js_code:
        raise HTTPException(status_code=503, detail="高德 JS API 安全代理未配置")
    await _limit_expensive_request(request)
    target = _amap_upstream_url(service_path)
    params = [
        (key, value)
        for key, value in request.query_params.multi_items()
        if key.lower() != "jscode"
    ]
    params.append(("jscode", settings.amap_security_js_code))
    async with httpx.AsyncClient(
        transport=httpx.AsyncHTTPTransport(retries=0),
        trust_env=False,
        timeout=20,
        follow_redirects=True,
    ) as client:
        upstream = await client.get(target, params=params)
    excluded_headers = {
        "content-encoding",
        "transfer-encoding",
        "connection",
        "content-length",
        "content-type",
    }
    headers = {
        key: value
        for key, value in upstream.headers.items()
        if key.lower() not in excluded_headers
    }
    media_type = upstream.headers.get("content-type")
    # AMap's telemetry endpoint is JSONP but is occasionally served upstream as
    # application/octet-stream. The browser loads it as a script, so preserve
    # the intended executable MIME type only for this known JSONP response.
    if service_path == "v3/log/init" and "callback" in request.query_params:
        media_type = "application/javascript; charset=utf-8"
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=headers,
        media_type=media_type,
    )


@app.post("/api/v1/profile/score")
async def profile_score(payload: ProfileScoreRequest, request: Request):
    try:
        profile = score_answers(payload.answers)
    except AnswerValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if payload.user_id:
        request.app.state.memory.remember_profile(payload.user_id, profile)
    return {"request_id": request.state.request_id, "profile": profile}


@app.post("/api/v1/profile/bigfive")
async def save_bigfive_profile(payload: BigFiveProfileRequest, request: Request):
    """Persist a CBF-PI-15 result as a route-planning profile and a reusable source record."""
    request.app.state.memory.remember_profile(payload.user_id, payload.profile)
    record = request.app.state.memory.store_explicit(
        payload.user_id,
        MemoryCategory.profile,
        "cbfpi15",
        {"scores": payload.scores.model_dump(), "version": payload.version},
        confidence=payload.profile.confidence,
    )
    return {
        "request_id": request.state.request_id,
        "profile": payload.profile.model_dump(mode="json"),
        "stored": record.model_dump(mode="json"),
    }


@app.get("/api/v1/profile/current")
async def current_profile(
    request: Request,
    x_user_id: str = Header(alias="X-User-ID", min_length=1, max_length=128),
):
    profile = request.app.state.memory.load_profile(x_user_id)
    return {
        "request_id": request.state.request_id,
        "user_id": x_user_id,
        "profile": profile.model_dump(mode="json") if profile else None,
    }


@app.post("/api/v1/plans", response_model=PlanResponse)
async def create_plan(payload: PlanRequest, request: Request):
    await _limit_expensive_request(request)
    return await request.app.state.agent.plan(payload)


@app.post("/api/v1/walk/replan", response_model=WalkReplanResponse)
async def replan_active_walk(payload: WalkReplanRequest, request: Request):
    """Replace only the unvisited route tail after an in-walk user feedback."""
    await _limit_expensive_request(request)
    return await request.app.state.agent.replan_walk(payload)


@app.post("/api/v1/route-adjustments")
async def adjust_route_for_dining(
    payload: RouteAdjustmentRequest, request: Request
):
    """Find a nearby dining stop and reroute the remaining virtual walk through it."""
    await _limit_expensive_request(request)
    tools: ToolRegistry = request.app.state.tools
    dining = await tools.search_dining(
        DiningArgs(keyword="美食", location=payload.origin)
    )
    candidates = [
        place
        for place in dining.restaurants
        if place.map_coordinate is not None or place.coordinate is not None
    ]
    if not candidates:
        return {
            "request_id": request.state.request_id,
            "dining": dining.model_dump(mode="json"),
            "selected_restaurant": None,
            "route": None,
            "warning": "附近餐饮坐标暂不可用，无法调整路线。",
        }

    selected = candidates[0]
    dining_coordinate = selected.map_coordinate or selected.coordinate
    route = await tools.plan_walking_route(
        RouteArgs(
            origin=payload.origin,
            destinations=[dining_coordinate, *payload.remaining_destinations[:7]],
        )
    )
    return {
        "request_id": request.state.request_id,
        "dining": dining.model_dump(mode="json"),
        "selected_restaurant": selected.model_dump(mode="json"),
        "route": route.model_dump(mode="json"),
        "warning": dining.warning or route.warning,
    }


@app.get("/api/v1/map/route-image", include_in_schema=False)
async def route_map_image(route: str, request: Request):
    """Return a real AMap static image for a shared/printable local route."""
    if not settings.amap_api_key:
        raise HTTPException(status_code=503, detail="高德静态地图服务未配置")
    node_ids = list(dict.fromkeys(item.strip() for item in route.split(",") if item.strip()))
    if not 1 <= len(node_ids) <= 8:
        raise HTTPException(status_code=422, detail="路线需包含 1 至 8 个点位")
    records = []
    for node_id in node_ids:
        digits = "".join(char for char in node_id if char.isdigit())
        if not digits:
            raise HTTPException(status_code=422, detail="路线点位格式错误")
        record = request.app.state.index.records.get(f"N{int(digits):03d}")
        if not record or not record.map_coordinate:
            raise HTTPException(status_code=422, detail="路线点位缺少地图坐标")
        records.append(record)
    origin = Coordinate(longitude=118.787898, latitude=32.012777, name="老门东北门")
    destinations = [record.map_coordinate for record in records]
    planned = await request.app.state.tools.plan_walking_route(
        RouteArgs(origin=origin, destinations=destinations)
    )
    path = planned.path_coordinates or [origin, *destinations]
    # Static-map URLs must remain bounded even when a provider returns a dense line.
    step = max(1, (len(path) + 119) // 120)
    path = [*path[::step], path[-1]] if len(path) > 1 else path
    point_string = ";".join(f"{point.longitude:.6f},{point.latitude:.6f}" for point in path)
    marker_groups = [f"mid,0x2DB5A6,S:{origin.longitude:.6f},{origin.latitude:.6f}"]
    marker_groups.extend(
        f"mid,0xE85A50,{index}:{point.longitude:.6f},{point.latitude:.6f}"
        for index, point in enumerate(destinations, start=1)
    )
    await _limit_expensive_request(request)
    async with httpx.AsyncClient(
        transport=httpx.AsyncHTTPTransport(retries=0), trust_env=False, timeout=20
    ) as client:
        upstream = await client.get(
            "https://restapi.amap.com/v3/staticmap",
            params={
                "key": settings.amap_api_key,
                "size": "1024*600",
                "scale": 2,
                "markers": "|".join(marker_groups),
                "paths": f"8,0xE85A50,1,,:{point_string}",
            },
        )
    if upstream.status_code != 200 or not upstream.headers.get("content-type", "").startswith("image/"):
        raise HTTPException(status_code=502, detail="高德静态地图暂不可用")
    return Response(content=upstream.content, media_type=upstream.headers["content-type"])


@app.post("/api/v1/feedback")
async def feedback(payload: FeedbackRequest, request: Request):
    records = request.app.state.memory.process_feedback(payload)
    return {
        "request_id": request.state.request_id,
        "stored": [record.model_dump(mode="json") for record in records],
    }


@app.get("/api/v1/memory", response_model=MemoryView)
async def get_memory(
    request: Request,
    x_user_id: str = Header(alias="X-User-ID", min_length=1, max_length=128),
):
    return MemoryView(
        request_id=request.state.request_id,
        user_id=x_user_id,
        records=request.app.state.database.list_memories(x_user_id),
    )


@app.get("/api/v1/memory/session", response_model=SessionMemoryView)
async def get_session_memory(
    request: Request,
    session_id: str,
    x_user_id: str = Header(alias="X-User-ID", min_length=1, max_length=128),
):
    return SessionMemoryView(
        request_id=request.state.request_id,
        user_id=x_user_id,
        session_id=session_id,
        context=request.app.state.memory.load_session_context(
            x_user_id, session_id
        ),
    )


@app.delete("/api/v1/memory/session")
async def delete_session_memory(
    request: Request,
    session_id: str,
    x_user_id: str = Header(alias="X-User-ID", min_length=1, max_length=128),
):
    deleted = request.app.state.database.delete_session_context(
        session_id, x_user_id
    )
    return {"request_id": request.state.request_id, "deleted": deleted}


@app.delete("/api/v1/memory")
async def delete_memory(
    request: Request,
    x_user_id: str = Header(alias="X-User-ID", min_length=1, max_length=128),
):
    details = request.app.state.database.delete_user_memory_data(x_user_id)
    return {
        "request_id": request.state.request_id,
        "deleted": sum(details.values()),
        "details": details,
    }


@app.get("/api/v1/health", response_model=HealthResponse)
async def health(request: Request):
    index = request.app.state.index
    components = {
        "database": {"status": "ok", "path": str(settings.database_path)},
        "vector_index": {
            "status": "ok" if index.backend == "chroma" else "degraded",
            "backend": index.backend,
            "embedding": index.embedding.name,
            "retrieval_strategy": index.retrieval_strategy,
            "chunking": "one-place-one-chunk",
            "warning": request.app.state.embedding_warning or index.warning,
        },
        "model": {
            "status": "ok" if settings.deepseek_api_key else "degraded",
            "model": settings.deepseek_model,
            "configured": bool(settings.deepseek_api_key),
        },
        "mcp": {
            "status": "ok" if request.app.state.mcp_client.configured else "degraded",
            "configured": request.app.state.mcp_client.configured,
        },
        "route_geometry": {
            "status": "ok" if settings.amap_api_key else "degraded",
            "provider": "amap-web-v5",
            "coordinate_system": "GCJ-02",
            "configured": bool(settings.amap_api_key),
        },
        "tool_policy": {
            "status": "ok",
            "mode": settings.tool_selection_mode,
            "constraint_parsing_mode": settings.constraint_parsing_mode,
        },
        "map_js": {
            "status": (
                "ok"
                if settings.amap_js_key and settings.amap_security_js_code
                else "degraded"
            ),
            "configured": bool(
                settings.amap_js_key and settings.amap_security_js_code
            ),
        },
    }
    status = (
        "ok"
        if all(component["status"] == "ok" for component in components.values())
        else "degraded"
    )
    return HealthResponse(
        request_id=request.state.request_id,
        status=status,
        components=components,
    )
