"""
MQTT Handler: ESP32 Publish-Queue Pressure Events (PKG-01b)

Pure observability handler for queue-pressure lifecycle events published by
El Trabajante (ESP32) on ``kaiser/{kaiser_id}/esp/{esp_id}/system/queue_pressure``.

Scope:
- Parse the topic to extract the ESP identifier.
- Increment a Prometheus counter labelled by (esp_id, event).
- Emit a structured log line for Loki/Grafana correlation.

Explicitly NOT in scope:
- No database writes.
- No WebSocket broadcasts.
- No derived state changes (e.g. no ESP status updates).

The ESP32 firmware publishes at least the following payload fields (additional
fields are tolerated):

    {
        "event": "entered_pressure" | "recovered",
        "fill_level": <int>,          # current queue depth
        "high_watermark": <int>,      # highest recorded depth in window
        "shed_count": <int>,          # number of messages shed/rejected
        "drop_count": <int>,          # number of messages dropped
        "ts": <int>                    # optional unix timestamp (ms/s)
    }

Error Codes:
- Uses ValidationErrorCode for topic parse failures.
"""

from typing import Optional

from ...core.error_codes import ValidationErrorCode
from ...core.logging_config import get_logger
from ...core.metrics import increment_queue_pressure_event
from ..topics import TopicBuilder

logger = get_logger(__name__)


class QueuePressureHandler:
    """
    Handles queue-pressure events from ESP32 devices.

    Flow:
    1. Parse topic -> extract esp_id.
    2. Read event label + telemetry fields (defensive, missing-tolerant).
    3. Increment Prometheus counter for (esp_id, event).
    4. Emit structured log for downstream analysis.
    """

    async def handle_queue_pressure(self, topic: str, payload: dict) -> bool:
        """
        Handle a queue-pressure event message.

        Args:
            topic: MQTT topic string
                   (``kaiser/{kaiser_id}/esp/{esp_id}/system/queue_pressure``)
            payload: Parsed JSON payload dict

        Returns:
            True if the event was processed (even if payload was incomplete),
            False only for unrecoverable errors (topic parse failure or
            unexpected exception).
        """
        try:
            parsed_topic = TopicBuilder.parse_queue_pressure_topic(topic)
            if not parsed_topic:
                logger.error(
                    f"[{ValidationErrorCode.MISSING_REQUIRED_FIELD}] "
                    f"Failed to parse queue_pressure topic: {topic}"
                )
                return False

            esp_id = parsed_topic["esp_id"]
            safe_payload = payload if isinstance(payload, dict) else {}
            event = str(safe_payload.get("event", "unknown"))

            increment_queue_pressure_event(esp_id, event)

            logger.info(
                "Queue pressure event: esp_id=%s event=%s fill_level=%s "
                "high_watermark=%s shed_count=%s drop_count=%s",
                esp_id,
                event,
                safe_payload.get("fill_level"),
                safe_payload.get("high_watermark"),
                safe_payload.get("shed_count"),
                safe_payload.get("drop_count"),
                extra={
                    "event_class": "QUEUE_PRESSURE",
                    "result": event,
                    "classification": "observability",
                    "esp_id": esp_id,
                    "fill_level": safe_payload.get("fill_level"),
                    "high_watermark": safe_payload.get("high_watermark"),
                    "shed_count": safe_payload.get("shed_count"),
                    "drop_count": safe_payload.get("drop_count"),
                },
            )
            return True

        except Exception as e:
            logger.error(
                f"Error handling queue_pressure event: {e}",
                exc_info=True,
            )
            return False


# Global handler instance (follows diagnostics_handler pattern)
_handler_instance: Optional[QueuePressureHandler] = None


def get_queue_pressure_handler() -> QueuePressureHandler:
    """
    Get singleton queue-pressure handler instance.

    Returns:
        QueuePressureHandler instance
    """
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = QueuePressureHandler()
    return _handler_instance


async def handle_queue_pressure(topic: str, payload: dict) -> bool:
    """
    Handle queue-pressure message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_queue_pressure_handler()
    return await handler.handle_queue_pressure(topic, payload)
