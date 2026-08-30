from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# PyInstaller's one-folder build keeps mutable configuration and runtime data
# beside the executable, while Python-package resources remain bundled inside it.
ROOT_DIR = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent.parent
)
load_dotenv(ROOT_DIR / ".env")
_configured_hf_home = os.getenv("HF_HOME")
if _configured_hf_home:
    _hf_home_path = Path(_configured_hf_home)
    if not _hf_home_path.is_absolute():
        _hf_home_path = ROOT_DIR / _hf_home_path
else:
    _hf_home_path = ROOT_DIR / "data" / "hf-cache"
os.environ["HF_HOME"] = str(_hf_home_path)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_csv(name: str) -> tuple[str, ...]:
    """Read a comma-separated allow-list without silently accepting blanks."""
    return tuple(
        item.strip()
        for item in os.getenv(name, "").split(",")
        if item.strip()
    )


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "development")
    database_path: Path = ROOT_DIR / os.getenv("DATABASE_PATH", "data/soulwalking.db")
    chroma_path: Path = ROOT_DIR / os.getenv("CHROMA_PATH", "data/chroma")
    embedding_backend: str = os.getenv(
        "EMBEDDING_BACKEND", "sentence-transformers"
    )
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5")
    short_term_memory_hours: int = int(
        os.getenv("SHORT_TERM_MEMORY_HOURS", "12")
    )
    constraint_parsing_mode: str = os.getenv(
        "CONSTRAINT_PARSING_MODE", "heuristic"
    ).lower()
    tool_selection_mode: str = os.getenv("TOOL_SELECTION_MODE", "policy").lower()
    weather_cache_ttl_seconds: int = int(
        os.getenv("WEATHER_CACHE_TTL_SECONDS", "300")
    )
    route_cache_ttl_seconds: int = int(
        os.getenv("ROUTE_CACHE_TTL_SECONDS", "600")
    )
    amap_web_route_max_concurrency: int = int(
        os.getenv("AMAP_WEB_ROUTE_MAX_CONCURRENCY", "2")
    )
    amap_web_route_retries: int = int(
        os.getenv("AMAP_WEB_ROUTE_RETRIES", "3")
    )
    deepseek_api_key: str | None = os.getenv("DEEPSEEK_API_KEY") or None
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
    amap_api_key: str | None = os.getenv("AMAP_API_KEY") or None
    amap_mcp_url: str | None = os.getenv("AMAP_MCP_URL") or None
    mcp_enabled: bool = _env_bool("MCP_ENABLED", False)
    amap_js_key: str | None = os.getenv("AMAP_JS_KEY") or None
    amap_security_js_code: str | None = (
        os.getenv("AMAP_SECURITY_JS_CODE") or None
    )
    allowed_hosts: tuple[str, ...] = _env_csv("APP_ALLOWED_HOSTS")
    allowed_origins: tuple[str, ...] = _env_csv("APP_ALLOWED_ORIGINS")
    api_rate_limit_requests: int = int(
        os.getenv("API_RATE_LIMIT_REQUESTS", "30")
    )
    api_rate_limit_window_seconds: int = int(
        os.getenv("API_RATE_LIMIT_WINDOW_SECONDS", "60")
    )

    @property
    def resolved_mcp_url(self) -> str | None:
        if self.amap_mcp_url:
            return self.amap_mcp_url
        if self.amap_api_key:
            return f"https://mcp.amap.com/mcp?key={self.amap_api_key}"
        return None


settings = Settings()
