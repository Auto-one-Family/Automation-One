"""
Canonical calibration payload adapters.

Provides a single canonical shape for ``sensor_configs.calibration_data`` while
keeping backward compatibility for legacy payloads and stored rows.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonicalize_calibration_data(
    payload: Any,
    *,
    default_method: str = "unknown",
    source: str = "legacy",
) -> dict | None:
    """
    Normalize calibration payloads into canonical schema.

    Canonical schema:
    {
      "method": str,
      "points": list[dict],
      "derived": dict,
      "metadata": dict
    }
    """
    if payload is None:
        return None
    if not isinstance(payload, dict):
        return None

    # Already canonical
    if {
        "method",
        "points",
        "derived",
        "metadata",
    }.issubset(payload.keys()):
        method = str(payload.get("method") or default_method)
        points = payload.get("points")
        derived = payload.get("derived")
        metadata = payload.get("metadata")
        return {
            "method": method,
            "points": points if isinstance(points, list) else [],
            "derived": derived if isinstance(derived, dict) else {},
            "metadata": metadata if isinstance(metadata, dict) else {},
        }

    method = str(payload.get("method") or payload.get("type") or default_method)
    metadata = {
        "schema_version": 1,
        "source": source,
        "normalized_at": _utc_iso_now(),
    }

    # Session points payload: {"points":[...], "history":[...]}
    if isinstance(payload.get("points"), list):
        return {
            "method": method,
            "points": payload.get("points", []),
            "derived": {},
            "metadata": metadata,
        }

    # Legacy computed calibration objects -> move all keys to derived.
    return {
        "method": method,
        "points": [],
        "derived": dict(payload),
        "metadata": metadata,
    }


def build_canonical_calibration_result(
    *,
    method: str,
    points: list[dict] | None,
    derived: dict,
    source: str = "calibration_session",
) -> dict:
    """Build canonical payload for newly computed calibration results."""
    return {
        "method": method,
        "points": points if isinstance(points, list) else [],
        "derived": dict(derived),
        "metadata": {
            "schema_version": 1,
            "source": source,
            "normalized_at": _utc_iso_now(),
        },
    }
