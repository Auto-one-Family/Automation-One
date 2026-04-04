"""
Durable inbound inbox for critical MQTT classes (P0.3).

Storage is append-only JSONL with atomic rewrite-on-ack semantics.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..core.logging_config import get_logger

logger = get_logger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class InboundInboxService:
    """File-backed durable inbox with simple replay/dedup support."""

    def __init__(self, file_path: Optional[str] = None, capacity: int = 20000) -> None:
        base_dir = Path(tempfile.gettempdir()) / "god-kaiser-inbox"
        base_dir.mkdir(parents=True, exist_ok=True)
        self._file_path = Path(file_path) if file_path else base_dir / "critical-inbound.jsonl"
        self._capacity = capacity
        self._lock = asyncio.Lock()
        self._events: list[dict[str, Any]] = []
        self._loaded = False
        self._last_loaded_mtime: float = -1.0

    async def append(
        self,
        topic: str,
        payload: dict[str, Any],
        correlation_id: Optional[str] = None,
        source: str = "live",
    ) -> str:
        await self._ensure_loaded()
        event_id = str(uuid.uuid4())
        payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        content_hash = hashlib.sha256(f"{topic}|{payload_json}".encode("utf-8")).hexdigest()

        event = {
            "id": event_id,
            "topic": topic,
            "payload": payload,
            "payload_hash": content_hash,
            "correlation_id": correlation_id,
            "source": source,
            "status": "pending",
            "created_at": _utc_now_iso(),
            "updated_at": _utc_now_iso(),
            "attempts": 0,
        }

        async with self._lock:
            if len(self._events) >= self._capacity:
                # Drop oldest acked item first, otherwise oldest pending item.
                acked_idx = next(
                    (i for i, item in enumerate(self._events) if item.get("status") == "acked"),
                    None,
                )
                drop_idx = acked_idx if acked_idx is not None else 0
                dropped = self._events.pop(drop_idx)
                logger.warning(
                    "Inbound inbox capacity reached, dropping oldest event id=%s status=%s",
                    dropped.get("id"),
                    dropped.get("status"),
                )

            self._events.append(event)
            await self._persist_locked()
        return event_id

    async def mark_delivered(self, event_id: str) -> None:
        await self._ensure_loaded()
        async with self._lock:
            for event in self._events:
                if event["id"] == event_id:
                    event["status"] = "acked"
                    event["updated_at"] = _utc_now_iso()
                    await self._persist_locked()
                    return

    async def mark_attempt(self, event_id: str) -> None:
        await self._ensure_loaded()
        async with self._lock:
            for event in self._events:
                if event["id"] == event_id:
                    event["attempts"] = int(event.get("attempts", 0)) + 1
                    event["updated_at"] = _utc_now_iso()
                    await self._persist_locked()
                    return

    async def list_pending(self, limit: int = 200) -> list[dict[str, Any]]:
        await self._ensure_loaded()
        async with self._lock:
            pending = [event for event in self._events if event.get("status") == "pending"]
            return [dict(item) for item in pending[:limit]]

    async def stats(self) -> dict[str, int]:
        await self._ensure_loaded()
        async with self._lock:
            total = len(self._events)
            pending = sum(1 for event in self._events if event.get("status") == "pending")
            acked = total - pending
            return {"total": total, "pending": pending, "acked": acked}

    async def _ensure_loaded(self) -> None:
        async with self._lock:
            if self._loaded and self._file_path.exists():
                mtime = self._file_path.stat().st_mtime
                if mtime <= self._last_loaded_mtime:
                    return

            self._events = []
            if self._file_path.exists():
                try:
                    content = self._file_path.read_text(encoding="utf-8")
                    for line in content.splitlines():
                        if not line.strip():
                            continue
                        parsed = json.loads(line)
                        if isinstance(parsed, dict) and "id" in parsed:
                            self._events.append(parsed)
                except Exception as exc:
                    logger.error("Failed loading inbound inbox file %s: %s", self._file_path, exc)
            self._loaded = True
            self._last_loaded_mtime = self._file_path.stat().st_mtime if self._file_path.exists() else -1

    async def _persist_locked(self) -> None:
        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [json.dumps(event, separators=(",", ":"), ensure_ascii=True) for event in self._events]
        tmp_path = self._file_path.with_suffix(".tmp")
        tmp_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        os.replace(tmp_path, self._file_path)
        self._last_loaded_mtime = self._file_path.stat().st_mtime


_inbox_service: Optional[InboundInboxService] = None


def get_inbound_inbox_service() -> InboundInboxService:
    global _inbox_service
    if _inbox_service is None:
        _inbox_service = InboundInboxService()
    return _inbox_service
