from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """Small in-process guard for costly public endpoints.

    It is deliberately a safety floor, not an account/billing system. A future
    multi-instance deployment should replace it with a shared Redis limiter.
    """

    def __init__(self, requests: int, window_seconds: int) -> None:
        self.requests = max(1, requests)
        self.window_seconds = max(1, window_seconds)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        async with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.requests:
                return False
            hits.append(now)
            return True
