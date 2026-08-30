from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any


class MCPUnavailableError(RuntimeError):
    pass


@dataclass
class MCPDiscoveredTool:
    name: str
    description: str
    input_schema: dict[str, Any]


CAPABILITY_PATTERNS = {
    "geocode": ("geo", "geocode", "地理编码"),
    "weather": ("weather", "天气"),
    "walking_route": ("walking", "direction_walking", "步行"),
    "generate_map": ("generate_map", "personal_map", "专属地图"),
}


class AmapMCPClient:
    """Allow-listed client for the official AMap Streamable HTTP MCP server."""

    def __init__(self, url: str | None, timeout_seconds: float = 12):
        self.url = url
        self.timeout_seconds = timeout_seconds
        self._catalog: dict[str, MCPDiscoveredTool] = {}
        self._discovery_complete = False
        self._discovery_lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.url)

    async def discover(
        self, *, force: bool = False
    ) -> dict[str, MCPDiscoveredTool]:
        if not self.url:
            raise MCPUnavailableError("未配置高德 MCP URL")
        async with self._discovery_lock:
            if self._discovery_complete and not force:
                return self._catalog
            tools = await asyncio.wait_for(
                self._list_tools(), timeout=self.timeout_seconds
            )
            catalog: dict[str, MCPDiscoveredTool] = {}
            for capability, patterns in CAPABILITY_PATTERNS.items():
                match = next(
                    (
                        tool
                        for tool in tools
                        if any(
                            pattern.lower()
                            in f"{tool.name} {tool.description}".lower()
                            for pattern in patterns
                        )
                    ),
                    None,
                )
                if match:
                    catalog[capability] = match
            self._catalog = catalog
            self._discovery_complete = True
            return catalog

    async def call(self, capability: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if not self.url:
            raise MCPUnavailableError("未配置高德 MCP URL")
        if capability not in CAPABILITY_PATTERNS:
            raise ValueError(f"MCP capability is not allow-listed: {capability}")
        if capability not in self._catalog:
            await self.discover()
        tool = self._catalog.get(capability)
        if not tool:
            raise MCPUnavailableError(f"高德 MCP 未发现能力：{capability}")
        result = await asyncio.wait_for(
            self._call_tool(tool.name, arguments), timeout=self.timeout_seconds
        )
        return _normalize_result(result)

    async def _list_tools(self) -> list[MCPDiscoveredTool]:
        try:
            from mcp import ClientSession
            from mcp.client.streamable_http import streamable_http_client
        except ImportError as exc:  # pragma: no cover - dependency installation
            raise MCPUnavailableError("未安装 MCP Python SDK") from exc

        async with streamable_http_client(self.url) as streams:
            read_stream, write_stream = streams[0], streams[1]
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                response = await session.list_tools()
                return [
                    MCPDiscoveredTool(
                        name=tool.name,
                        description=tool.description or "",
                        input_schema=tool.inputSchema,
                    )
                    for tool in response.tools
                ]

    async def _call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client

        async with streamable_http_client(self.url) as streams:
            read_stream, write_stream = streams[0], streams[1]
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                return await session.call_tool(name, arguments)


def _normalize_result(result: Any) -> dict[str, Any]:
    structured = getattr(result, "structuredContent", None)
    if isinstance(structured, dict):
        return structured

    content = getattr(result, "content", None) or []
    texts = [
        block.text
        for block in content
        if getattr(block, "type", None) == "text" and getattr(block, "text", None)
    ]
    combined = "\n".join(texts)
    if not combined:
        return {"content": "", "raw_type": type(result).__name__}
    try:
        value = json.loads(combined)
        return value if isinstance(value, dict) else {"result": value}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", combined, flags=re.DOTALL)
        if match:
            try:
                value = json.loads(match.group())
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                pass
        return {"content": combined}
