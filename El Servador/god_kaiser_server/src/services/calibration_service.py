"""
Calibration Service (S-P4)

Business logic for multi-point sensor calibration sessions.

Responsibilities:
- Session lifecycle management (start → collect points → finalize → apply/reject)
- Calibration computation (linear 2-point, moisture mapping)
- Integration with SensorRepository for applying results
- Validation of calibration points and transitions
"""

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from math import isfinite
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.logging_config import get_logger
from ..db.models.calibration_session import CalibrationSession, CalibrationStatus
from ..db.repositories import ESPRepository, SensorRepository
from ..db.repositories.calibration_session_repo import CalibrationSessionRepository
from ..sensors.sensor_type_registry import normalize_sensor_type
from .calibration_payloads import (
    build_canonical_calibration_result,
    canonicalize_calibration_data,
)

logger = get_logger(__name__)
_SESSION_LOCKS: dict[uuid.UUID, asyncio.Lock] = {}
_SESSION_LOCKS_GUARD = asyncio.Lock()
_SENSOR_SESSION_LOCKS: dict[tuple[str, int, str], asyncio.Lock] = {}
_SENSOR_SESSION_LOCKS_GUARD = asyncio.Lock()
_ROLE_PENDING_OVERWRITES: dict[tuple[uuid.UUID, str], int] = {}
_ROLE_PENDING_GUARD = asyncio.Lock()
_OVERWRITE_ARBITRATION_WINDOW_SECONDS = 0.100


class CalibrationError(Exception):
    """Base exception for calibration service errors."""

    def __init__(self, message: str, code: str = "CALIBRATION_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class CalibrationService:
    """
    Orchestrates calibration session lifecycle.

    Usage:
        service = CalibrationService(db_session)
        session = await service.start_session(esp_id, gpio, sensor_type, user)
        session = await service.add_point(session.id, raw=2250, reference=50.0)
        session = await service.add_point(session.id, raw=1100, reference=100.0)
        result = await service.finalize(session.id)
        await service.apply(session.id)
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = CalibrationSessionRepository(session)
        self.sensor_repo = SensorRepository(session)
        self.esp_repo = ESPRepository(session)
        self.session_ttl_hours = 24

    @staticmethod
    def _is_mutable_status(status: CalibrationStatus) -> bool:
        return status in (
            CalibrationStatus.PENDING,
            CalibrationStatus.COLLECTING,
        )

    @staticmethod
    def _ensure_finite(value: float, field_name: str) -> None:
        if not isfinite(float(value)):
            raise CalibrationError(f"{field_name} must be a finite number", "VALIDATION_ERROR")

    async def _ensure_session_mutable(self, cal_session: CalibrationSession) -> CalibrationSession:
        if cal_session.is_terminal:
            raise CalibrationError(
                f"Session is in terminal state: {cal_session.status.value}",
                "SESSION_TERMINAL",
            )

        session_ts = cal_session.updated_at or cal_session.created_at
        if session_ts.tzinfo is None:
            session_ts = session_ts.replace(tzinfo=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - session_ts).total_seconds()
        if age_seconds > self.session_ttl_hours * 3600:
            updated = await self.repo.update_status(
                cal_session.id,
                CalibrationStatus.EXPIRED,
                failure_reason=f"Session expired after {self.session_ttl_hours}h inactivity",
            )
            if updated:
                await self._broadcast_event(
                    "calibration_session_expired",
                    {
                        "session_id": str(cal_session.id),
                        "esp_id": cal_session.esp_id,
                        "gpio": cal_session.gpio,
                        "sensor_type": cal_session.sensor_type,
                        "status": CalibrationStatus.EXPIRED.value,
                    },
                    correlation_id=cal_session.correlation_id,
                )
            raise CalibrationError("Session expired", "SESSION_EXPIRED")

        if not self._is_mutable_status(cal_session.status):
            raise CalibrationError(
                f"Session cannot be mutated from state: {cal_session.status.value}",
                "STATE_ERROR",
            )

        return cal_session

    @staticmethod
    @asynccontextmanager
    async def _session_lock(session_id: uuid.UUID):
        """
        Serialize concurrent mutations for one calibration session in-process.

        DB row locks remain the primary guard for multi-process deployments;
        this lock closes race windows in single-process async execution and tests.
        """
        async with _SESSION_LOCKS_GUARD:
            lock = _SESSION_LOCKS.get(session_id)
            if lock is None:
                lock = asyncio.Lock()
                _SESSION_LOCKS[session_id] = lock
        async with lock:
            yield

    @staticmethod
    @asynccontextmanager
    async def _sensor_lock(sensor_key: tuple[str, int, str]):
        """Serialize start-session race for one logical sensor key."""
        async with _SENSOR_SESSION_LOCKS_GUARD:
            lock = _SENSOR_SESSION_LOCKS.get(sensor_key)
            if lock is None:
                lock = asyncio.Lock()
                _SENSOR_SESSION_LOCKS[sensor_key] = lock
        async with lock:
            yield

    # ── S-P6: WebSocket broadcast helper ──────────────────────────────────

    @staticmethod
    async def _broadcast_event(
        event_type: str,
        data: dict,
        correlation_id: Optional[str] = None,
    ) -> None:
        """Best-effort WebSocket broadcast for calibration lifecycle events."""
        try:
            from ..websocket.manager import WebSocketManager

            ws = await WebSocketManager.get_instance()
            await ws.broadcast(
                message_type=event_type,
                data=data,
                correlation_id=correlation_id,
            )
        except Exception as e:
            logger.debug("CalibrationService WS broadcast failed: %s", e)

    async def start_session(
        self,
        esp_id: str,
        gpio: int,
        sensor_type: str,
        method: str = "linear_2point",
        expected_points: int = 2,
        initiated_by: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> CalibrationSession:
        """
        Start a new calibration session.

        Checks for existing active sessions and aborts them.
        Normalizes sensor_type before persisting.

        Raises:
            CalibrationError: If sensor validation fails
        """
        # Normalize sensor type (S-P1)
        normalized_type = normalize_sensor_type(sensor_type)

        async with self._sensor_lock((esp_id, gpio, normalized_type)):
            # Check for existing active session — expire it
            existing = await self.repo.get_active_session(esp_id, gpio, normalized_type)
            if existing:
                logger.info(
                    "Expiring existing active calibration session %s for %s/GPIO%d",
                    existing.id,
                    esp_id,
                    gpio,
                )
                await self.repo.update_status(
                    existing.id,
                    CalibrationStatus.EXPIRED,
                    failure_reason="Superseded by new calibration session",
                )

            # Find sensor config (optional — may not exist yet for unconfigured sensors)
            sensor_config_id = None
            esp_device = await self.esp_repo.get_by_device_id(esp_id)
            if esp_device:
                sensor = await self.sensor_repo.get_by_esp_gpio_and_type(
                    esp_device.id,
                    gpio,
                    normalized_type,
                )
                if sensor:
                    sensor_config_id = sensor.id

            # Create session
            cal_session = await self.repo.create(
                esp_id=esp_id,
                gpio=gpio,
                sensor_type=normalized_type,
                sensor_config_id=sensor_config_id,
                method=method,
                expected_points=expected_points,
                initiated_by=initiated_by,
                correlation_id=correlation_id,
            )

        logger.info(
            "Started calibration session %s: %s/GPIO%d type=%s method=%s",
            cal_session.id,
            esp_id,
            gpio,
            normalized_type,
            method,
        )

        # S-P6: Broadcast session started event
        await self._broadcast_event(
            "calibration_session_started",
            {
                "session_id": str(cal_session.id),
                "esp_id": esp_id,
                "gpio": gpio,
                "sensor_type": normalized_type,
                "method": method,
                "expected_points": expected_points,
                "status": cal_session.status.value,
            },
            correlation_id=correlation_id,
        )

        return cal_session

    async def add_point(
        self,
        session_id: uuid.UUID,
        raw: float,
        reference: float,
        point_role: str,
        overwrite: bool = False,
        quality: str = "good",
        intent_id: Optional[str] = None,
        measured_at: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> CalibrationSession:
        """
        Add a calibration measurement point to the session.

        point_role values:
        - Moisture calibration: "dry", "wet"
        - pH calibration: "buffer_high", "buffer_low"
        - EC calibration: "reference", "air"

        Raises:
            CalibrationError: If session is terminal or already has enough points
        """
        normalized_role = point_role.strip().lower()
        valid_roles = {"dry", "wet", "buffer_high", "buffer_low", "reference", "air"}
        if normalized_role not in valid_roles:
            raise CalibrationError(
                f"point_role must be one of: {', '.join(sorted(valid_roles))}", "VALIDATION_ERROR"
            )

        role_key = (session_id, normalized_role)
        if overwrite:
            await self._register_pending_overwrite(role_key)

        try:
            async with self._session_lock(session_id):
                # Release-Gate contract:
                # In mixed same-role races (overwrite=true vs overwrite=false), overwrite wins.
                # This keeps the operator-visible API deterministic (200x1 + 409x1), avoiding
                # ambiguous dual-success outcomes that cannot be used as a hard gate.
                if not overwrite:
                    await asyncio.sleep(_OVERWRITE_ARBITRATION_WINDOW_SECONDS)
                    if await self._has_pending_overwrite(role_key):
                        raise CalibrationError(
                            f"Point role '{normalized_role}' already exists (overwrite request has priority)",
                            "ROLE_POINT_EXISTS",
                        )

                cal_session = await self.repo.get_by_id_for_update(session_id)
                if not cal_session:
                    raise CalibrationError("Session not found", "SESSION_NOT_FOUND")
                await self._ensure_session_mutable(cal_session)
                self._ensure_finite(raw, "raw_value")
                self._ensure_finite(reference, "reference_value")

                payload = cal_session.calibration_points or {"points": [], "history": []}
                existing_points = payload.get("points", [])
                points = list(existing_points) if isinstance(existing_points, list) else []
                history = (
                    list(payload.get("history", []))
                    if isinstance(payload.get("history", []), list)
                    else []
                )

                existing_idx = next(
                    (
                        idx
                        for idx, item in enumerate(points)
                        if item.get("point_role") == normalized_role
                    ),
                    None,
                )
                point_id = str(uuid.uuid4())
                point = {
                    "id": point_id,
                    "point_role": normalized_role,
                    "raw": float(raw),
                    "reference": float(reference),
                    "quality": quality,
                    "timestamp": measured_at or datetime.now(timezone.utc).isoformat(),
                    "intent_id": intent_id,
                    "correlation_id": correlation_id,
                }

                audit_action = "created"
                if existing_idx is not None:
                    if not overwrite:
                        raise CalibrationError(
                            f"Point role '{normalized_role}' already exists, set overwrite=true",
                            "ROLE_POINT_EXISTS",
                        )
                    previous = points[existing_idx]
                    history.append(
                        {
                            "action": "overwritten",
                            "point_role": normalized_role,
                            "previous_point": previous,
                            "changed_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                    # keep stable point id for deterministic update semantics
                    point["id"] = previous.get("id", point_id)
                    points[existing_idx] = point
                    audit_action = "overwritten"
                else:
                    if len(points) >= cal_session.expected_points:
                        raise CalibrationError(
                            f"Session already has {len(points)}/{cal_session.expected_points} points",
                            "POINTS_COMPLETE",
                        )
                    points.append(point)

                updated = await self.repo.replace_calibration_points(
                    session_id,
                    {"points": points, "history": history},
                    force_collecting=True,
                    clear_result=True,
                )
                if not updated:
                    raise CalibrationError(
                        "Failed to persist calibration point", "ADD_POINT_FAILED"
                    )

                logger.info(
                    "Calibration point %s (%s) in session %s: role=%s raw=%.3f ref=%.3f",
                    audit_action,
                    point.get("id"),
                    session_id,
                    normalized_role,
                    float(raw),
                    float(reference),
                )
                return updated
        finally:
            if overwrite:
                await self._unregister_pending_overwrite(role_key)

    @staticmethod
    async def _register_pending_overwrite(role_key: tuple[uuid.UUID, str]) -> None:
        async with _ROLE_PENDING_GUARD:
            _ROLE_PENDING_OVERWRITES[role_key] = _ROLE_PENDING_OVERWRITES.get(role_key, 0) + 1

    @staticmethod
    async def _unregister_pending_overwrite(role_key: tuple[uuid.UUID, str]) -> None:
        async with _ROLE_PENDING_GUARD:
            current = _ROLE_PENDING_OVERWRITES.get(role_key, 0)
            if current <= 1:
                _ROLE_PENDING_OVERWRITES.pop(role_key, None)
            else:
                _ROLE_PENDING_OVERWRITES[role_key] = current - 1

    @staticmethod
    async def _has_pending_overwrite(role_key: tuple[uuid.UUID, str]) -> bool:
        async with _ROLE_PENDING_GUARD:
            return _ROLE_PENDING_OVERWRITES.get(role_key, 0) > 0

    async def update_point(
        self,
        session_id: uuid.UUID,
        point_id: str,
        *,
        raw: float,
        reference: float,
        point_role: str,
        quality: str = "good",
        intent_id: Optional[str] = None,
        measured_at: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> CalibrationSession:
        """Update a single calibration point by point_id."""
        async with self._session_lock(session_id):
            cal_session = await self.repo.get_by_id_for_update(session_id)
            if not cal_session:
                raise CalibrationError("Session not found", "SESSION_NOT_FOUND")
            await self._ensure_session_mutable(cal_session)
            self._ensure_finite(raw, "raw_value")
            self._ensure_finite(reference, "reference_value")

            normalized_role = point_role.strip().lower()
            if normalized_role not in {"dry", "wet"}:
                raise CalibrationError("point_role must be one of: dry, wet", "VALIDATION_ERROR")

            payload = cal_session.calibration_points or {"points": [], "history": []}
            points = (
                list(payload.get("points", []))
                if isinstance(payload.get("points", []), list)
                else []
            )
            history = (
                list(payload.get("history", []))
                if isinstance(payload.get("history", []), list)
                else []
            )

            idx = next((i for i, p in enumerate(points) if p.get("id") == point_id), None)
            if idx is None:
                raise CalibrationError(f"Point {point_id} not found", "POINT_NOT_FOUND")

            role_conflict = next(
                (
                    p
                    for p in points
                    if p.get("id") != point_id and p.get("point_role") == normalized_role
                ),
                None,
            )
            if role_conflict:
                raise CalibrationError(
                    f"Point role '{normalized_role}' already exists, set overwrite=true",
                    "ROLE_POINT_EXISTS",
                )

            previous = points[idx]
            updated_point = {
                "id": point_id,
                "point_role": normalized_role,
                "raw": float(raw),
                "reference": float(reference),
                "quality": quality,
                "timestamp": measured_at or datetime.now(timezone.utc).isoformat(),
                "intent_id": intent_id,
                "correlation_id": correlation_id,
            }
            points[idx] = updated_point
            history.append(
                {
                    "action": "updated",
                    "point_role": normalized_role,
                    "previous_point": previous,
                    "changed_at": datetime.now(timezone.utc).isoformat(),
                }
            )

            session = await self.repo.replace_calibration_points(
                session_id,
                {"points": points, "history": history},
                force_collecting=True,
                clear_result=True,
            )
            if not session:
                raise CalibrationError("Failed to update calibration point", "POINT_UPDATE_FAILED")
            return session

    async def delete_point(self, session_id: uuid.UUID, point_id: str) -> CalibrationSession:
        """Delete a point from a mutable calibration session."""
        async with self._session_lock(session_id):
            cal_session = await self.repo.get_by_id_for_update(session_id)
            if not cal_session:
                raise CalibrationError("Session not found", "SESSION_NOT_FOUND")
            await self._ensure_session_mutable(cal_session)

            payload = cal_session.calibration_points or {"points": [], "history": []}
            points = (
                list(payload.get("points", []))
                if isinstance(payload.get("points", []), list)
                else []
            )
            history = (
                list(payload.get("history", []))
                if isinstance(payload.get("history", []), list)
                else []
            )

            idx = next((i for i, p in enumerate(points) if p.get("id") == point_id), None)
            if idx is None:
                raise CalibrationError(f"Point {point_id} not found", "POINT_NOT_FOUND")

            removed = points.pop(idx)
            history.append(
                {
                    "action": "deleted",
                    "point_role": removed.get("point_role"),
                    "previous_point": removed,
                    "changed_at": datetime.now(timezone.utc).isoformat(),
                }
            )

            session = await self.repo.replace_calibration_points(
                session_id,
                {"points": points, "history": history},
                force_collecting=True,
                clear_result=True,
            )
            if not session:
                raise CalibrationError("Failed to delete calibration point", "POINT_DELETE_FAILED")
            return session

    async def finalize(self, session_id: uuid.UUID) -> CalibrationSession:
        """
        Compute calibration result from collected points.

        Transitions session to FINALIZING with computed slope/offset.

        Raises:
            CalibrationError: If not enough points or computation fails
        """
        cal_session = await self.repo.get_by_id_for_update(session_id)
        if not cal_session:
            raise CalibrationError("Session not found", "SESSION_NOT_FOUND")

        if cal_session.status == CalibrationStatus.FINALIZING and cal_session.calibration_result:
            return cal_session

        if cal_session.status != CalibrationStatus.COLLECTING:
            raise CalibrationError(
                f"Cannot finalize from state: {cal_session.status.value}",
                "INVALID_STATE",
            )

        if not cal_session.is_ready_to_finalize:
            raise CalibrationError(
                f"Need {cal_session.expected_points} points, have {cal_session.points_collected}",
                "INSUFFICIENT_POINTS",
            )

        # Extract points
        points_data = cal_session.calibration_points or {"points": []}
        points = points_data.get("points", [])

        # Validate points based on method
        roles = {
            str(point.get("point_role", "")).lower() for point in points if isinstance(point, dict)
        }

        if cal_session.method == "moisture_2point":
            if "dry" not in roles or "wet" not in roles:
                raise CalibrationError(
                    "Finalize requires both 'dry' and 'wet' points for moisture_2point",
                    "INSUFFICIENT_POINTS",
                )
        elif cal_session.method == "ph_2point":
            if "buffer_high" not in roles or "buffer_low" not in roles:
                raise CalibrationError(
                    "Finalize requires both 'buffer_high' and 'buffer_low' points for ph_2point",
                    "INSUFFICIENT_POINTS",
                )
        elif cal_session.method == "ec_1point":
            if "reference" not in roles:
                raise CalibrationError(
                    "Finalize requires 'reference' point for ec_1point",
                    "INSUFFICIENT_POINTS",
                )
        elif cal_session.method == "ec_2point":
            if "air" not in roles or "reference" not in roles:
                raise CalibrationError(
                    "Finalize requires both 'air' and 'reference' points for ec_2point",
                    "INSUFFICIENT_POINTS",
                )
        elif cal_session.method in ("linear_2point", "linear"):
            if "dry" not in roles or "wet" not in roles:
                raise CalibrationError(
                    "Finalize requires both 'dry' and 'wet' points",
                    "INSUFFICIENT_POINTS",
                )

        # Compute calibration based on method
        try:
            result = self._compute_calibration(
                cal_session.method,
                cal_session.sensor_type,
                points,
            )
        except Exception as e:
            await self.repo.update_status(
                session_id,
                CalibrationStatus.FAILED,
                failure_reason=f"Computation error: {e}",
            )
            raise CalibrationError(f"Calibration computation failed: {e}", "COMPUTE_FAILED")

        canonical_result = build_canonical_calibration_result(
            method=cal_session.method,
            points=points,
            derived=result,
            source="calibration_session_finalize",
        )

        updated = await self.repo.set_result(session_id, canonical_result)
        if not updated:
            raise CalibrationError("Failed to set result", "SET_RESULT_FAILED")

        logger.info(
            "Finalized calibration session %s: %s",
            session_id,
            result,
        )

        # S-P6: Broadcast session finalized event
        await self._broadcast_event(
            "calibration_session_finalized",
            {
                "session_id": str(session_id),
                "esp_id": cal_session.esp_id,
                "gpio": cal_session.gpio,
                "sensor_type": cal_session.sensor_type,
                "status": updated.status.value if updated else "unknown",
                "result": canonical_result,
            },
            correlation_id=cal_session.correlation_id,
        )

        return updated

    async def apply(self, session_id: uuid.UUID) -> CalibrationSession:
        """
        Apply the calibration result to the sensor configuration.

        Persists calibration_data to the sensor's config in the DB.

        Raises:
            CalibrationError: If session not in FINALIZING state or sensor not found
        """
        cal_session = await self.repo.get_by_id_for_update(session_id)
        if not cal_session:
            raise CalibrationError("Session not found", "SESSION_NOT_FOUND")

        if cal_session.status == CalibrationStatus.APPLIED:
            return cal_session

        if cal_session.status != CalibrationStatus.FINALIZING:
            raise CalibrationError(
                f"Cannot apply: session is {cal_session.status.value}, expected FINALIZING",
                "INVALID_STATE",
            )

        if not cal_session.calibration_result:
            raise CalibrationError("No calibration result to apply", "NO_RESULT")

        if not cal_session.sensor_config_id:
            await self.repo.update_status(
                session_id,
                CalibrationStatus.FAILED,
                failure_reason="Apply blocked: no sensor_config_id bound to session",
            )
            raise CalibrationError(
                "Cannot apply without bound sensor configuration",
                "APPLY_PERSISTENCE_REQUIRED",
            )

        sensor = await self.sensor_repo.get_by_id(cal_session.sensor_config_id)
        if not sensor:
            await self.repo.update_status(
                session_id,
                CalibrationStatus.FAILED,
                failure_reason="Apply failed: sensor configuration not found",
            )
            raise CalibrationError(
                "Target sensor configuration not found for apply",
                "APPLY_PERSISTENCE_REQUIRED",
            )

        canonical_payload = canonicalize_calibration_data(
            cal_session.calibration_result,
            default_method=cal_session.method,
            source="calibration_session_apply",
        )
        if canonical_payload is None:
            await self.repo.update_status(
                session_id,
                CalibrationStatus.FAILED,
                failure_reason="Apply failed: invalid calibration_result payload",
            )
            raise CalibrationError(
                "Invalid calibration result payload for apply",
                "APPLY_PERSISTENCE_REQUIRED",
            )

        try:
            sensor.calibration_data = canonical_payload
            await self.session.flush()
            await self.session.refresh(sensor)
        except Exception as exc:
            await self.repo.update_status(
                session_id,
                CalibrationStatus.FAILED,
                failure_reason=f"Apply persistence failed: {exc}",
            )
            raise CalibrationError(
                "Calibration persistence write failed",
                "APPLY_PERSISTENCE_REQUIRED",
            ) from exc

        logger.info(
            "Applied calibration to sensor %s (session %s)",
            sensor.id,
            session_id,
        )

        updated = await self.repo.update_status(session_id, CalibrationStatus.APPLIED)
        if not updated:
            raise CalibrationError("Failed to update status", "STATUS_UPDATE_FAILED")

        # S-P6: Broadcast calibration applied event
        await self._broadcast_event(
            "calibration_session_applied",
            {
                "session_id": str(session_id),
                "esp_id": cal_session.esp_id,
                "gpio": cal_session.gpio,
                "sensor_type": cal_session.sensor_type,
                "status": "APPLIED",
                "calibration_result": canonical_payload,
            },
            correlation_id=cal_session.correlation_id,
        )

        return updated

    async def delete_session(
        self, session_id: uuid.UUID, reason: str = "User discarded session"
    ) -> CalibrationSession:
        """Delete/discard a mutable session by transitioning to REJECTED."""
        return await self.reject(session_id, reason=reason)

    async def reject(
        self, session_id: uuid.UUID, reason: str = "User rejected"
    ) -> CalibrationSession:
        """Reject a calibration session (user abort)."""
        cal_session = await self.repo.get_by_id(session_id)
        if not cal_session:
            raise CalibrationError("Session not found", "SESSION_NOT_FOUND")

        if cal_session.is_terminal:
            raise CalibrationError(
                f"Session already terminal: {cal_session.status.value}",
                "SESSION_TERMINAL",
            )

        updated = await self.repo.update_status(
            session_id,
            CalibrationStatus.REJECTED,
            failure_reason=reason,
        )
        if not updated:
            raise CalibrationError("Failed to reject", "REJECT_FAILED")

        logger.info("Rejected calibration session %s: %s", session_id, reason)

        # S-P6: Broadcast calibration rejected event
        await self._broadcast_event(
            "calibration_session_rejected",
            {
                "session_id": str(session_id),
                "esp_id": cal_session.esp_id,
                "gpio": cal_session.gpio,
                "sensor_type": cal_session.sensor_type,
                "status": "REJECTED",
                "reason": reason,
            },
            correlation_id=cal_session.correlation_id,
        )

        return updated

    async def get_session(self, session_id: uuid.UUID) -> Optional[CalibrationSession]:
        """Get a calibration session by ID."""
        return await self.repo.get_by_id(session_id)

    async def get_session_history(
        self,
        esp_id: str,
        gpio: int,
        sensor_type: Optional[str] = None,
        limit: int = 20,
    ) -> list[CalibrationSession]:
        """Get calibration history for a sensor."""
        if sensor_type:
            sensor_type = normalize_sensor_type(sensor_type)
        return await self.repo.get_sessions_for_sensor(esp_id, gpio, sensor_type, limit)

    # ── Private computation methods ────────────────────────────────────────

    @staticmethod
    def _compute_calibration(method: str, sensor_type: str, points: list[dict]) -> dict:
        """
        Compute calibration parameters from measurement points.

        Returns a dict ready to be stored as calibration_data.
        """
        if method == "moisture_2point":
            return CalibrationService._compute_moisture(points)
        elif method in ("linear_2point", "linear"):
            return CalibrationService._compute_linear_2point(sensor_type, points)
        elif method == "offset":
            return CalibrationService._compute_offset(sensor_type, points)
        elif method == "ph_2point":
            return CalibrationService._compute_ph_2point(points)
        elif method == "ec_1point":
            return CalibrationService._compute_ec_1point(points)
        elif method == "ec_2point":
            return CalibrationService._compute_ec_2point(points)
        else:
            raise ValueError(f"Unknown calibration method: {method}")

    @staticmethod
    def _compute_linear_2point(sensor_type: str, points: list[dict]) -> dict:
        """2-point linear interpolation: y = slope * x + offset."""
        if len(points) < 2:
            raise ValueError("Need at least 2 points for linear calibration")

        p1 = points[0]
        p2 = points[1]

        raw1, ref1 = float(p1["raw"]), float(p1["reference"])
        raw2, ref2 = float(p2["raw"]), float(p2["reference"])

        if abs(raw2 - raw1) < 1e-6:
            raise ValueError("Raw values too close — cannot compute slope")

        slope = (ref2 - ref1) / (raw2 - raw1)
        offset = ref1 - slope * raw1

        return {
            "type": "linear_2point",
            "slope": round(slope, 6),
            "offset": round(offset, 4),
            "point1_raw": raw1,
            "point1_ref": ref1,
            "point2_raw": raw2,
            "point2_ref": ref2,
            "sensor_type": sensor_type,
            "calibrated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _compute_moisture(points: list[dict]) -> dict:
        """Moisture 2-point: dry/wet ADC boundary mapping."""
        if len(points) < 2:
            raise ValueError("Need at least 2 points for moisture calibration")

        p1 = points[0]
        p2 = points[1]

        dry_raw = float(p1["raw"])
        wet_raw = float(p2["raw"])

        return {
            "type": "moisture_2point",
            "dry_value": dry_raw,
            "wet_value": wet_raw,
            "invert": dry_raw > wet_raw,  # Most capacitive sensors: dry=high, wet=low
            "calibrated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _compute_offset(sensor_type: str, points: list[dict]) -> dict:
        """Single-point offset calibration."""
        if len(points) < 1:
            raise ValueError("Need at least 1 point for offset calibration")

        p1 = points[0]
        raw = float(p1["raw"])
        ref = float(p1["reference"])

        return {
            "type": "offset",
            "offset": round(ref - raw, 4),
            "point1_raw": raw,
            "point1_ref": ref,
            "sensor_type": sensor_type,
            "calibrated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _compute_ph_2point(points: list[dict]) -> dict:
        """
        pH 2-point calibration using Nernst equation.

        Formula: pH = slope * raw_mV + offset

        Slope should be negative (around -59.16 mV/pH at 25°C).
        Validation: slope_deviation from ideal must be within ±15%.

        Raises:
            ValueError: If slope is not negative or deviates too much from ideal
        """
        if len(points) < 2:
            raise ValueError("Need at least 2 points for pH 2-point calibration")

        # Find buffer_high and buffer_low points
        high_point = None
        low_point = None

        for p in points:
            role = str(p.get("point_role", "")).lower()
            if role == "buffer_high":
                high_point = p
            elif role == "buffer_low":
                low_point = p

        if not high_point or not low_point:
            raise ValueError("pH 2-point requires 'buffer_high' and 'buffer_low' points")

        raw_high = float(high_point["raw"])
        ref_high = float(high_point["reference"])
        raw_low = float(low_point["raw"])
        ref_low = float(low_point["reference"])

        if abs(raw_high - raw_low) < 1e-6:
            raise ValueError("Raw values too close — cannot compute slope")

        # Linear regression: pH = slope * mV + offset
        slope = (ref_high - ref_low) / (raw_high - raw_low)
        offset = ref_high - slope * raw_high

        # Validation: slope must be negative (Nernst equation)
        if slope >= 0:
            raise ValueError(f"pH slope must be negative (got {slope}). Check electrode polarity.")

        # Ideal slope at 25°C: Nernst predicts 59.16 mV/pH
        # Our slope is in pH/mV, so ideal is 1/59.16 ≈ -0.01689 pH/mV (negative because inverted)
        # Compute response (mV/pH) from our slope for validation
        ideal_response_mv_per_ph = 59.16
        measured_response_mv_per_ph = abs(1.0 / slope) if slope != 0 else 0

        slope_deviation_pct = (
            abs(measured_response_mv_per_ph - ideal_response_mv_per_ph)
            / ideal_response_mv_per_ph
            * 100
        )

        if slope_deviation_pct > 15.0:
            raise ValueError(
                f"pH response {measured_response_mv_per_ph:.2f} mV/pH deviates {slope_deviation_pct:.1f}% from ideal {ideal_response_mv_per_ph:.2f} "
                f"(limit ±15%). Electrode may be degraded."
            )

        return {
            "type": "ph_2point",
            "slope": round(slope, 4),
            "offset": round(offset, 4),
            "slope_deviation_pct": round(slope_deviation_pct, 2),
            "point_high_raw": raw_high,
            "point_high_ref": ref_high,
            "point_low_raw": raw_low,
            "point_low_ref": ref_low,
            "measured_response_mv_per_ph": round(measured_response_mv_per_ph, 2),
            "ideal_response_mv_per_ph": ideal_response_mv_per_ph,
            "calibrated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _compute_ec_1point(points: list[dict]) -> dict:
        """
        EC 1-point calibration using cell factor.

        Formula: EC = cell_factor * raw_value
        cell_factor = reference_value / raw_value

        Validation: cell_factor must be between 0.5 and 2.0

        Raises:
            ValueError: If cell_factor is out of acceptable range
        """
        if len(points) < 1:
            raise ValueError("Need at least 1 point for EC 1-point calibration")

        # Find reference point
        ref_point = None
        for p in points:
            role = str(p.get("point_role", "")).lower()
            if role == "reference":
                ref_point = p
                break

        if not ref_point:
            raise ValueError("EC 1-point requires 'reference' point")

        raw = float(ref_point["raw"])
        reference = float(ref_point["reference"])

        if abs(raw) < 1e-6:
            raise ValueError("Raw value too close to zero — cannot compute cell factor")

        cell_factor = reference / raw

        # Validation: cell_factor should be reasonable (0.5 to 2.0)
        if not (0.5 <= cell_factor <= 2.0):
            raise ValueError(
                f"EC cell_factor {cell_factor:.3f} out of range [0.5, 2.0]. "
                f"Check reference solution or probe."
            )

        return {
            "type": "ec_1point",
            "cell_factor": round(cell_factor, 6),
            "point_raw": raw,
            "point_reference": reference,
            "calibrated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _compute_ec_2point(points: list[dict]) -> dict:
        """
        EC 2-point calibration (air + reference).

        Formula: EC = slope * raw + offset
        Air point (0 mS/cm) provides offset; reference provides slope.

        Raises:
            ValueError: If points are invalid or too close
        """
        if len(points) < 2:
            raise ValueError("Need at least 2 points for EC 2-point calibration")

        # Find air and reference points
        air_point = None
        ref_point = None

        for p in points:
            role = str(p.get("point_role", "")).lower()
            if role == "air":
                air_point = p
            elif role == "reference":
                ref_point = p

        if not air_point or not ref_point:
            raise ValueError("EC 2-point requires 'air' and 'reference' points")

        raw_air = float(air_point["raw"])
        ref_air = float(air_point["reference"])  # Should be 0
        raw_ref = float(ref_point["raw"])
        ref_ref = float(ref_point["reference"])

        if abs(raw_ref - raw_air) < 1e-6:
            raise ValueError("Raw values too close — cannot compute slope")

        slope = (ref_ref - ref_air) / (raw_ref - raw_air)
        offset = ref_air - slope * raw_air

        return {
            "type": "ec_2point",
            "slope": round(slope, 6),
            "offset": round(offset, 4),
            "point_air_raw": raw_air,
            "point_air_ref": ref_air,
            "point_reference_raw": raw_ref,
            "point_reference_ref": ref_ref,
            "calibrated_at": datetime.now(timezone.utc).isoformat(),
        }
