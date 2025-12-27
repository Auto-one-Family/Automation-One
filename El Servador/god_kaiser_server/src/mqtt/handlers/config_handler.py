"""
MQTT Handler: ESP32 Configuration Response Messages

Logs configuration acknowledgements from ESP devices and stores in audit log.

Topic: kaiser/god/esp/{esp_id}/config_response
QoS: 2 (Exactly Once)

Note: ESP32 uses 'config_response' topic (not 'config/ack').
Server adapts to ESP32 protocol.

Error Codes (ESP32 → Server):
- NONE: Success
- JSON_PARSE_ERROR: Invalid JSON received
- VALIDATION_FAILED: Config validation failed
- GPIO_CONFLICT: GPIO already in use
- NVS_WRITE_FAILED: NVS storage full or corrupted
- TYPE_MISMATCH: Wrong data type
- MISSING_FIELD: Required field missing
- OUT_OF_RANGE: Value out of valid range
- UNKNOWN_ERROR: Unexpected error

Audit Logging:
- All config responses are stored in audit_logs table
- Provides history tracking for debugging and compliance
"""

from datetime import datetime, timezone
from typing import Optional

from ...core.error_codes import ConfigErrorCode, get_error_code_description
from ...core.logging_config import get_logger
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.repositories.esp_repo import ESPRepository
from ...db.session import resilient_session
from ..topics import TopicBuilder

logger = get_logger(__name__)


# ESP32 Config Error Code mapping (from error_codes.h)
ESP32_ERROR_CODES = {
    "NONE": "Success",
    "JSON_PARSE_ERROR": "Invalid JSON format received",
    "VALIDATION_FAILED": "Config validation failed on ESP32",
    "GPIO_CONFLICT": "GPIO already in use by another sensor/actuator",
    "NVS_WRITE_FAILED": "NVS storage full or corrupted",
    "TYPE_MISMATCH": "Field type mismatch",
    "MISSING_FIELD": "Required field missing",
    "OUT_OF_RANGE": "Value out of valid range",
    "UNKNOWN_ERROR": "Unexpected error on ESP32",
}


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
                # Get human-readable error description
                error_description = ESP32_ERROR_CODES.get(error_code, f"Unknown error: {error_code}")
                failed_item = payload.get("failed_item", {})
                
                logger.error(
                    f"❌ Config FAILED on {esp_id}: {config_type} "
                    f"- {message} (Error: {error_code} - {error_description})"
                )
                
                # Log additional details for debugging
                if failed_item:
                    logger.error(
                        f"   Failed item details: GPIO={failed_item.get('gpio', 'N/A')}, "
                        f"Type={failed_item.get('sensor_type', failed_item.get('actuator_type', 'N/A'))}"
                    )

            # Store in audit_log table for history tracking
            try:
                async with resilient_session() as session:
                    audit_repo = AuditLogRepository(session)
                    await audit_repo.log_config_response(
                        esp_id=esp_id,
                        config_type=config_type,
                        status=status,
                        count=count,
                        message=message,
                        error_code=error_code if status != "success" else None,
                        error_description=ESP32_ERROR_CODES.get(error_code) if error_code else None,
                        failed_item=payload.get("failed_item") if status != "success" else None,
                    )
                    await session.commit()
                    logger.debug(f"Config response stored in audit log: {esp_id}")
            except Exception as audit_error:
                # Don't fail the handler if audit logging fails
                logger.warning(f"Failed to store config response in audit log: {audit_error}")

            # WebSocket Broadcast
            try:
                from ...websocket.manager import WebSocketManager
                ws_manager = await WebSocketManager.get_instance()
                
                broadcast_payload = {
                    "esp_id": esp_id,
                    "config_type": config_type,
                    "status": status,
                    "count": count,
                    "message": message,
                    "timestamp": int(datetime.now(timezone.utc).timestamp())
                }
                
                # Include error details for failed configs
                if status != "success":
                    broadcast_payload["error_code"] = error_code
                    broadcast_payload["error_description"] = ESP32_ERROR_CODES.get(error_code, "Unknown error")
                    if payload.get("failed_item"):
                        broadcast_payload["failed_item"] = payload["failed_item"]
                
                await ws_manager.broadcast("config_response", broadcast_payload)
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
