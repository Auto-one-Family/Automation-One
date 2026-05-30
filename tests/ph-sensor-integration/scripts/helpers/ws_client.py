"""WebSocket event watcher for AutomationOne server (S3+).

Connects to ws://<host>/ws/realtime/{client_id}?token=<jwt>
Subscribes to requested event types and waits for matching events.

Server message format:
    {"type": "sensor_data", "timestamp": <unix_s>, "data": {...}, "correlation_id": "..."}
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Callable, Optional


class WsEventWatcher:
    """Subscribe to WebSocket events and collect matching messages.

    Usage (async):
        watcher = WsEventWatcher(ws_url)
        await watcher.connect()
        await watcher.subscribe(types=["sensor_data"], esp_ids=["ESP_698EB4"])
        event = await watcher.wait_for(
            lambda msg: msg.get("data", {}).get("gpio") == 32,
            timeout=15,
        )
        await watcher.close()

    Or as context manager:
        async with WsEventWatcher(ws_url) as watcher:
            await watcher.subscribe(types=["sensor_data"], esp_ids=["ESP_698EB4"])
            event = await watcher.wait_for(matcher, timeout=15)
    """

    def __init__(self, ws_url: str) -> None:
        self._url = ws_url
        self._ws: Any = None
        self._recv_task: Optional[asyncio.Task[None]] = None
        self._events: list[dict[str, Any]] = []
        self._closed = False

    async def connect(self) -> None:
        try:
            import websockets  # type: ignore[import]
        except ImportError as exc:
            raise ImportError("websockets is required: pip install 'websockets>=12.0'") from exc

        self._ws = await websockets.connect(self._url)
        self._closed = False
        self._recv_task = asyncio.create_task(self._recv_loop())

    async def _recv_loop(self) -> None:
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                    self._events.append(msg)
                except json.JSONDecodeError:
                    pass
        except Exception:  # noqa: BLE001
            pass

    async def subscribe(
        self,
        types: Optional[list[str]] = None,
        esp_ids: Optional[list[str]] = None,
        sensor_types: Optional[list[str]] = None,
    ) -> None:
        """Send subscribe message to server."""
        filters: dict[str, Any] = {}
        if types:
            filters["types"] = types
        if esp_ids:
            filters["esp_ids"] = esp_ids
        if sensor_types:
            filters["sensor_types"] = sensor_types
        await self._ws.send(json.dumps({"action": "subscribe", "filters": filters}))

    async def wait_for(
        self,
        matcher: Callable[[dict[str, Any]], bool],
        timeout: float = 15.0,
    ) -> Optional[dict[str, Any]]:
        """Wait until a received message satisfies `matcher`, or timeout expires.

        Scans already-received events first, then polls until deadline.
        Returns the matching message, or None on timeout.
        """
        deadline = time.monotonic() + timeout
        seen_count = 0

        while time.monotonic() < deadline:
            # Scan new events since last check
            new_events = self._events[seen_count:]
            seen_count = len(self._events)
            for msg in new_events:
                if matcher(msg):
                    return msg
            await asyncio.sleep(0.1)

        return None

    def all_events(self) -> list[dict[str, Any]]:
        return list(self._events)

    def events_by_type(self, event_type: str) -> list[dict[str, Any]]:
        return [e for e in self._events if e.get("type") == event_type]

    async def close(self) -> None:
        self._closed = True
        if self._recv_task:
            self._recv_task.cancel()
        if self._ws:
            await self._ws.close()

    async def __aenter__(self) -> "WsEventWatcher":
        await self.connect()
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()
