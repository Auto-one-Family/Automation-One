"""
MQTT Handler: Sensor Response for Calibration Sessions (S-P5)

Processes sensor command responses during active calibration sessions:
- Parses sensor/{gpio}/response topic
- Validates response payload (raw, quality, intent_id)
- If an active calibration session exists for the sensor, emits a measurement event
- Point persistence is done only via calibration session points API

Expected response payload from ESP32 (E-P4 enhanced):
{
    "success": true,
    "gpio": 4,
    "sensor_type": "moisture",
    "raw": 2150,
    "value": 52.3,
    "unit": "%",
    "quality": "good",
    "intent_id": "abc-123",
    "correlation_id": "def-456",
    "ttl_ms": 5000,
    "timestamp": 1712345678
}

Resilience: Uses resilient_session() with circuit breaker protection.
"""

import asyncio
from typing import Optional

from ...core.logging_config import get_logger
from ...db.repositories.calibration_session_repo import CalibrationSessionRepository
from ...db.repositories.esp_repo import ESPRepository
from ...db.repositories.sensor_repo import SensorRepository
from ...db.session import resilient_session
from ...sensors.sensor_type_registry import normalize_sensor_type
from ..topics import TopicBuilder

logger = get_logger(__name__)


class CalibrationResponseHandler:
    """
    Handles sensor command responses in the context of calibration sessions.

    Flow:
    1. Parse topic → extract esp_id, gpio
    2. Validate payload (success, raw value present)
    3. Check for active calibration session
    4. If active session exists: broadcast measurement for explicit API commit
    """

    async def handle_sensor_response(self, topic: str, payload: dict) -> bool:
        """
        Handle sensor command response for calibration.

        Args:
            topic: MQTT topic (kaiser/+/esp/{esp_id}/sensor/{gpio}/response)
            payload: Parsed JSON payload from ESP32

        Returns:
            True if processed (regardless of whether calibration was involved)
        """
        # Step 1: Parse topic
        parsed = TopicBuilder.parse_sensor_response_topic(topic)
        if not parsed:
            logger.debug("CalibrationResponseHandler: Could not parse topic: %s", topic)
            return False

        esp_id = parsed["esp_id"]
        gpio = parsed["gpio"]

        # Step 2: Validate payload
        if not isinstance(payload, dict):
            logger.warning("CalibrationResponseHandler: Invalid payload type for %s", topic)
            return False

        success = payload.get("success", False)
        if not success:
            logger.info(
                "CalibrationResponseHandler: Sensor response failed for %s/GPIO%d: %s",
                esp_id, gpio, payload.get("error", "unknown"),
            )
            # Broadcast failure event for frontend awareness
            await self._broadcast_calibration_event(
                "calibration_measurement_failed",
                esp_id=esp_id,
                gpio=gpio,
                error=payload.get("error", "Measurement failed on device"),
                correlation_id=payload.get("correlation_id"),
            )
            return True

        quality = payload.get("quality", "good")
        intent_id = payload.get("intent_id")
        correlation_id = payload.get("correlation_id")
        sensor_type = payload.get("sensor_type", "unknown")

        # Step 3: Check for active calibration session
        active_session = None
        normalized_type = normalize_sensor_type(sensor_type) if sensor_type else "unknown"
        try:
            async with resilient_session() as session:
                cal_repo = CalibrationSessionRepository(session)
                esp_repo = ESPRepository(session)
                sensor_repo = SensorRepository(session)
                if normalized_type != "unknown":
                    active_session = await cal_repo.get_active_session(
                        esp_id, gpio, normalized_type,
                    )
                if not active_session:
                    recent_sessions = await cal_repo.get_sessions_for_sensor(
                        esp_id=esp_id,
                        gpio=gpio,
                        sensor_type=None,
                        limit=5,
                    )
                    active_session = next(
                        (candidate for candidate in recent_sessions if not candidate.is_terminal),
                        None,
                    )
                    if active_session:
                        normalized_type = active_session.sensor_type

                raw_value = payload.get("raw", payload.get("raw_value"))
                if raw_value is None:
                    # Firmware measure-ACK currently omits raw value; resolve latest DB reading.
                    # Retry briefly because sensor_data persistence can lag behind ACK by a few hundred ms.
                    lookup_sensor_type = (
                        active_session.sensor_type if active_session else (
                            None if normalized_type == "unknown" else normalized_type
                        )
                    )
                    esp_device = await esp_repo.get_by_device_id(esp_id)
                    if not esp_device:
                        logger.warning(
                            "CalibrationResponseHandler: ESP %s not found for DB raw-value fallback",
                            esp_id,
                        )
                        await self._broadcast_calibration_event(
                            "calibration_measurement_failed",
                            esp_id=esp_id,
                            gpio=gpio,
                            error="ESP fuer Messwert-Fallback nicht gefunden",
                            correlation_id=correlation_id,
                        )
                        return True
                    for _ in range(3):
                        latest = await sensor_repo.get_latest_reading(
                            esp_device.id,
                            gpio,
                            sensor_type=lookup_sensor_type,
                        )
                        if latest and latest.raw_value is not None:
                            raw_value = float(latest.raw_value)
                            quality = latest.quality or quality
                            break
                        await asyncio.sleep(0.25)
                if raw_value is None:
                    logger.warning(
                        "CalibrationResponseHandler: No raw value available for %s/GPIO%d "
                        "(response payload and DB fallback empty)",
                        esp_id,
                        gpio,
                    )
                    await self._broadcast_calibration_event(
                        "calibration_measurement_failed",
                        esp_id=esp_id,
                        gpio=gpio,
                        error="Kein Messwert aus Sensorantwort ableitbar",
                        correlation_id=correlation_id,
                    )
                    return True

                if not active_session:
                    # No active calibration — this is a normal sensor response
                    logger.debug(
                        "CalibrationResponseHandler: No active session for %s/GPIO%d/%s",
                        esp_id, gpio, normalized_type,
                    )
                    # Still broadcast the raw measurement for frontend live display
                    await self._broadcast_calibration_event(
                        "calibration_measurement_received",
                        esp_id=esp_id,
                        gpio=gpio,
                        sensor_type=normalized_type,
                        raw=float(raw_value),
                        quality=quality,
                        intent_id=intent_id,
                        correlation_id=correlation_id,
                    )
                    return True

                # Step 4: Only broadcast raw measurement.
                # Point persistence is explicitly handled by
                # POST /v1/calibration/sessions/{id}/points with reference assignment.
                logger.info(
                    "CalibrationResponseHandler: Measurement received for active session %s "
                    "(raw=%.1f, quality=%s)",
                    active_session.id, float(raw_value), quality,
                )
                await self._broadcast_calibration_event(
                    "calibration_measurement_received",
                    esp_id=esp_id,
                    gpio=gpio,
                    sensor_type=normalized_type,
                    session_id=str(active_session.id),
                    raw=float(raw_value),
                    raw_value=float(raw_value),
                    measured_at=payload.get("timestamp"),
                    quality=quality,
                    intent_id=intent_id,
                    correlation_id=correlation_id,
                )

        except Exception as e:
            logger.error(
                "CalibrationResponseHandler: Error processing %s/GPIO%d: %s",
                esp_id, gpio, e, exc_info=True,
            )
            return False

        return True

    @staticmethod
    async def _broadcast_calibration_event(
        event_type: str,
        *,
        esp_id: str,
        gpio: int,
        correlation_id: Optional[str] = None,
        **data: object,
    ) -> None:
        """
        Broadcast calibration event via WebSocket (best-effort).

        Uses broadcast_threadsafe since MQTT handlers run in thread pool.
        """
        try:
            from ...websocket.manager import WebSocketManager

            ws = await WebSocketManager.get_instance()
            await ws.broadcast(
                message_type=event_type,
                data={
                    "esp_id": esp_id,
                    "gpio": gpio,
                    **{k: v for k, v in data.items() if v is not None},
                },
                correlation_id=correlation_id,
            )
        except Exception as e:
            logger.debug("CalibrationResponseHandler: WS broadcast failed: %s", e)


# ── Module-level convenience function (same pattern as sensor_handler) ────────

_handler_instance: Optional[CalibrationResponseHandler] = None


def get_calibration_response_handler() -> CalibrationResponseHandler:
    """Get singleton handler instance."""
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = CalibrationResponseHandler()
    return _handler_instance


async def handle_sensor_response(topic: str, payload: dict) -> bool:
    """
    Handle sensor response message (convenience function for subscriber registration).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if processed successfully
    """
    handler = get_calibration_response_handler()
    return await handler.handle_sensor_response(topic, payload)
