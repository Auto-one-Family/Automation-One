"""
MQTT Handler: ESP32 Configuration Response Messages

Logs configuration acknowledgements from ESP devices.

Topic: kaiser/god/esp/{esp_id}/config_response
QoS: 2 (Exactly Once)

Note: ESP32 uses 'config_response' topic (not 'config/ack').
Server adapts to ESP32 protocol.
"""

from datetime import datetime, timezone
from typing import Optional

from ...core.logging_config import get_logger
from ...db.repositories.esp_repo import ESPRepository
from ...db.session import get_session
from ..topics import TopicBuilder

logger = get_logger(__name__)


class ConfigHandler:
    """
    Handles configuration acknowledgement messages from ESP devices.

    Flow:
    1. Parse topic → extract esp_id
    2. Validate payload structure
    3. Log ACK status (success/failed)
    4. Optional: Store in DB for audit log
    """

    async def handle_config_ack(self, topic: str, payload: dict) -> bool:
        """
        Handle config response message from ESP32.

        Expected topic: kaiser/god/esp/{esp_id}/config_response

        Expected payload (from ESP32 ConfigResponseBuilder):
        {
            "status": "success" | "error",
            "type": "sensor" | "actuator" | "zone" | "system",
            "count": 3,
            "message": "Configured 3 sensor(s) successfully",
            "error_code": "NONE" | "MISSING_FIELD" | "TYPE_MISMATCH" | ...,  # Only on error
            "failed_item": {...}  # Only on error, contains the failed config item
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_config_response_topic(topic)
            if not parsed_topic:
                logger.error(f"Failed to parse config ACK topic: {topic}")
                return False

            esp_id = parsed_topic["esp_id"]

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                logger.error(f"Invalid config response payload: {validation_result['error']}")
                return False

            # Step 3: Log response
            # ESP32 uses "type" not "config_type"
            config_type = payload.get("type", payload.get("config_type", "unknown"))
            status = payload["status"]
            count = payload.get("count", 0)
            message = payload.get("message", "")
            error_code = payload.get("error_code", "")

            if status == "success":
                logger.info(
                    f"✅ Config Response from {esp_id}: {config_type} "
                    f"({count} items) - {message}"
                )
            else:
                logger.error(
                    f"❌ Config FAILED on {esp_id}: {config_type} "
                    f"- {message} (Error: {error_code})"
                )

            # TODO: Optional - Store in audit_log table for history
            # async for session in get_session():
            #     audit_entry = AuditLog(
            #         esp_id=esp_id,
            #         event_type="config_ack",
            #         status=status,
            #         details=payload
            #     )
            #     session.add(audit_entry)
            #     await session.commit()

            # WebSocket Broadcast
            try:
                from ...websocket.manager import WebSocketManager
                ws_manager = await WebSocketManager.get_instance()
                await ws_manager.broadcast("config_response", {
                    "esp_id": esp_id,
                    "config_type": config_type,
                    "status": status,
                    "count": count,
                    "message": message,
                    "timestamp": int(datetime.now(timezone.utc).timestamp())
                })
            except Exception as e:
                logger.warning(f"Failed to broadcast config response via WebSocket: {e}")

            return True

        except Exception as e:
            logger.error(f"Error handling config ACK: {e}", exc_info=True)
            return False

    def _validate_payload(self, payload: dict) -> dict:
        """Validate config response payload structure.
        
        ESP32 ConfigResponseBuilder sends:
        - status: "success" or "error"
        - type: "sensor", "actuator", "zone", "system"
        - count: number of configured items
        - message: human-readable message
        - error_code: (on error) error code string
        - failed_item: (on error) the failed config item
        """
        # Required fields: status and type
        if "status" not in payload:
            return {"valid": False, "error": "Missing required field: status"}
        
        # Accept both "type" (ESP32) and "config_type" (legacy)
        if "type" not in payload and "config_type" not in payload:
            return {"valid": False, "error": "Missing required field: type"}

        # Type validation
        valid_config_types = ["sensor", "actuator", "zone", "system"]
        config_type = payload.get("type", payload.get("config_type"))
        if config_type not in valid_config_types:
            return {
                "valid": False,
                "error": f"Invalid type. Must be one of: {valid_config_types}",
            }

        # Status validation - ESP32 sends "success" or "error" (not "failed")
        valid_statuses = ["success", "error", "failed"]  # Accept all variants
        if payload["status"] not in valid_statuses:
            return {
                "valid": False,
                "error": f"Invalid status. Must be one of: {valid_statuses}",
            }

        return {"valid": True, "error": ""}


# Global handler instance
_handler_instance: Optional[ConfigHandler] = None


def get_config_handler() -> ConfigHandler:
    """Get singleton config handler instance."""
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = ConfigHandler()
    return _handler_instance


async def handle_config_ack(topic: str, payload: dict) -> bool:
    """Handle config ACK message (convenience function)."""
    handler = get_config_handler()
    return await handler.handle_config_ack(topic, payload)
