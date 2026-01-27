"""
MQTT Handler: Last-Will-Testament (LWT) Messages

Processes LWT messages from MQTT broker when ESP32 disconnects unexpectedly:
- Power loss
- Network failure
- ESP32 crash
- Broker keepalive timeout

Topic: kaiser/{kaiser_id}/esp/{esp_id}/system/will

LWT provides INSTANT offline detection (vs. 300s heartbeat timeout).
The broker publishes this message automatically when ESP32 disconnects
without sending a proper MQTT DISCONNECT packet.

Error Codes:
- Uses ValidationErrorCode for payload validation errors
- Uses ConfigErrorCode for ESP device lookup errors
"""

from datetime import datetime, timezone
from typing import Optional

from ...core.error_codes import (
    ConfigErrorCode,
    ValidationErrorCode,
)
from ...core.logging_config import get_logger
from ...db.models.audit_log import AuditEventType, AuditSeverity
from ...db.repositories import ESPRepository
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.session import resilient_session
from ..topics import TopicBuilder

logger = get_logger(__name__)


class LWTHandler:
    """
    Handles Last-Will-Testament messages from MQTT broker.

    Flow:
    1. Parse topic -> extract esp_id
    2. Validate payload structure
    3. Check if ESP exists in DB
    4. Update ESP device status to "offline"
    5. Broadcast via WebSocket for instant UI update
    """

    async def handle_lwt(self, topic: str, payload: dict) -> bool:
        """
        Handle Last-Will-Testament message.

        Expected topic: kaiser/{kaiser_id}/esp/{esp_id}/system/will

        Expected payload (configured by ESP32 in mqtt_client.cpp:178-185):
        {
            "status": "offline",
            "reason": "unexpected_disconnect",
            "timestamp": 1735818000
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if processed successfully, False otherwise
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_lwt_topic(topic)
            if not parsed_topic:
                logger.error(
                    f"[{ValidationErrorCode.MISSING_REQUIRED_FIELD}] "
                    f"Failed to parse LWT topic: {topic}"
                )
                return False

            esp_id_str = parsed_topic["esp_id"]

            logger.warning(
                f"LWT received: ESP {esp_id_str} disconnected unexpectedly "
                f"(reason: {payload.get('reason', 'unknown')})"
            )

            # Step 2: Validate payload (minimal validation - LWT is broker-generated)
            if "status" not in payload:
                logger.warning(
                    f"LWT payload missing 'status' field, assuming offline: {payload}"
                )

            # Step 3: Update database
            async with resilient_session() as session:
                esp_repo = ESPRepository(session)

                # Step 4: Lookup ESP device
                esp_device = await esp_repo.get_by_device_id(esp_id_str)

                if not esp_device:
                    # Device not registered - log but don't fail
                    # This can happen if device was deleted while still connected
                    logger.warning(
                        f"[{ConfigErrorCode.ESP_DEVICE_NOT_FOUND}] "
                        f"LWT for unknown device {esp_id_str} - ignoring"
                    )
                    return True  # Return True to acknowledge message

                # Step 5: Update device status to offline
                # Only update if currently online (avoid duplicate updates)
                if esp_device.status == "online":
                    await esp_repo.update_status(esp_id_str, "offline")

                    # Update device_metadata with disconnect reason
                    device_metadata = esp_device.device_metadata or {}
                    device_metadata["last_disconnect"] = {
                        "reason": payload.get("reason", "unexpected_disconnect"),
                        "timestamp": payload.get(
                            "timestamp", int(datetime.now(timezone.utc).timestamp())
                        ),
                        "source": "lwt",
                    }
                    esp_device.device_metadata = device_metadata

                    # Audit Logging: lwt_received
                    try:
                        audit_repo = AuditLogRepository(session)
                        await audit_repo.log_device_event(
                            esp_id=esp_id_str,
                            event_type=AuditEventType.LWT_RECEIVED,
                            status="success",
                            message=f"Last Will Testament received - device disconnected unexpectedly",
                            details={
                                "reason": payload.get("reason", "unexpected_disconnect"),
                                "lwt_timestamp": payload.get("timestamp"),
                                "last_seen": esp_device.last_seen.isoformat() if esp_device.last_seen else None,
                            },
                            severity=AuditSeverity.WARNING,
                        )
                    except Exception as audit_error:
                        logger.warning(f"Failed to audit log lwt_received: {audit_error}")

                    await session.commit()

                    logger.info(f"Device {esp_id_str} marked offline via LWT")

                    # Step 6: WebSocket Broadcast for instant UI update
                    try:
                        from ...websocket.manager import WebSocketManager

                        ws_manager = await WebSocketManager.get_instance()
                        await ws_manager.broadcast(
                            "esp_health",
                            {
                                "esp_id": esp_id_str,
                                "status": "offline",
                                "reason": payload.get("reason", "unexpected_disconnect"),
                                "source": "lwt",  # Indicates instant detection
                                "timestamp": payload.get(
                                    "timestamp",
                                    int(datetime.now(timezone.utc).timestamp()),
                                ),
                            },
                        )
                        logger.debug(
                            f"Broadcast esp_health offline event for {esp_id_str}"
                        )
                    except Exception as e:
                        logger.warning(
                            f"Failed to broadcast LWT event via WebSocket: {e}"
                        )

                else:
                    logger.debug(f"Device {esp_id_str} already offline, LWT ignored")

                return True

        except Exception as e:
            logger.error(
                f"Error handling LWT: {e}",
                exc_info=True,
            )
            return False


# Global handler instance
_lwt_handler_instance: Optional[LWTHandler] = None


def get_lwt_handler() -> LWTHandler:
    """Get singleton LWT handler instance."""
    global _lwt_handler_instance
    if _lwt_handler_instance is None:
        _lwt_handler_instance = LWTHandler()
    return _lwt_handler_instance


async def handle_lwt(topic: str, payload: dict) -> bool:
    """
    Handle LWT message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_lwt_handler()
    return await handler.handle_lwt(topic, payload)
