"""
MQTT Handler: Actuator Command Response Messages

Processes command response confirmations from ESP32 devices:
- Validates command execution success/failure
- Updates actuator command history
- Logs success/failure metrics
- Triggers WebSocket notifications

Topic: kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response
QoS: 1 (At Least Once)

Expected Payload:
{
    "esp_id": "ESP_12AB34CD",
    "zone_id": "zone_main",
    "ts": 1733000000,          // Unix timestamp (seconds)
    "gpio": 25,
    "command": "ON",
    "value": 1.0,
    "duration": 0,
    "success": true,
    "message": "Command executed"
}
"""

from datetime import datetime, timezone
from typing import Optional

from ...core.logging_config import get_logger
from ...db.repositories import ActuatorRepository, ESPRepository
from ...db.session import resilient_session

logger = get_logger(__name__)

# Timestamp validation constants
MIN_VALID_TIMESTAMP = 1700000000  # ~2023-11-14
MAX_VALID_TIMESTAMP = 2500000000  # ~2049-03-22


class ActuatorResponseHandler:
    """
    Handles actuator command response messages from ESP32 devices.

    Flow:
    1. Parse topic → extract esp_id, gpio
    2. Validate payload structure
    3. Convert ESP32 timestamp to datetime
    4. Lookup ESP device
    5. Log command response to history
    6. Broadcast via WebSocket (optional)
    """

    async def handle_actuator_response(self, topic: str, payload: dict) -> bool:
        """
        Handle actuator command response message.

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully, False otherwise
        """
        try:
            # Step 1: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                logger.error(
                    f"Invalid actuator response payload: {validation_result['error']}"
                )
                return False

            esp_id_str = payload["esp_id"]
            gpio = payload["gpio"]
            command = payload.get("command", "UNKNOWN")
            value = payload.get("value", 0.0)
            success = payload.get("success", False)
            message = payload.get("message", "")

            logger.debug(
                f"Processing actuator response: esp_id={esp_id_str}, gpio={gpio}, "
                f"command={command}, success={success}"
            )

            # Step 2: Convert ESP32 timestamp
            esp32_timestamp = self._convert_timestamp(payload.get("ts", 0))

            # Step 3: Get database session and repositories
            async with resilient_session() as session:
                esp_repo = ESPRepository(session)
                actuator_repo = ActuatorRepository(session)

                # Step 4: Lookup ESP device
                esp_device = await esp_repo.get_by_device_id(esp_id_str)
                if not esp_device:
                    logger.warning(
                        f"ESP device not found for response: {esp_id_str}. "
                        "Response will be logged without device reference."
                    )
                    # Don't fail - still log the response for debugging
                    return True

                # Step 5: Log command response to history
                await actuator_repo.log_command(
                    esp_id=esp_device.id,
                    gpio=gpio,
                    actuator_type=payload.get("actuator_type", "unknown"),
                    command_type=command,
                    value=value,
                    success=success,
                    issued_by="esp32_response",
                    error_message=None if success else message,
                    timestamp=esp32_timestamp,
                    metadata={
                        "duration": payload.get("duration", 0),
                        "response_message": message,
                        "zone_id": payload.get("zone_id", ""),
                    },
                )

                # Commit transaction
                await session.commit()

                # Step 6: Log result
                if success:
                    logger.info(
                        f"✅ Actuator command confirmed: esp_id={esp_id_str}, gpio={gpio}, "
                        f"command={command}, value={value}"
                    )
                else:
                    logger.warning(
                        f"❌ Actuator command failed: esp_id={esp_id_str}, gpio={gpio}, "
                        f"command={command}, error={message}"
                    )

                # Step 7: WebSocket broadcast (non-blocking)
                try:
                    from ...websocket.manager import WebSocketManager
                    ws_manager = await WebSocketManager.get_instance()
                    await ws_manager.broadcast("actuator_response", {
                        "esp_id": esp_id_str,
                        "gpio": gpio,
                        "command": command,
                        "value": value,
                        "success": success,
                        "message": message,
                        "timestamp": payload.get("ts", 0)
                    })
                except Exception as e:
                    logger.debug(f"WebSocket broadcast skipped: {e}")

                return True

        except Exception as e:
            logger.error(
                f"Error handling actuator response: {e}",
                exc_info=True,
            )
            return False

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate actuator response payload structure.

        Required fields: ts, esp_id, gpio, command, success

        Args:
            payload: Payload dict to validate

        Returns:
            {"valid": bool, "error": str}
        """
        # Check required fields
        required_fields = ["ts", "esp_id", "gpio", "command", "success"]
        for field in required_fields:
            if field not in payload:
                return {"valid": False, "error": f"Missing required field: {field}"}

        # Type validation
        if not isinstance(payload["ts"], (int, float)):
            return {
                "valid": False,
                "error": "Field 'ts' must be numeric (Unix timestamp)",
            }

        if not isinstance(payload["gpio"], int):
            return {"valid": False, "error": "Field 'gpio' must be integer"}

        if not isinstance(payload["success"], bool):
            return {"valid": False, "error": "Field 'success' must be boolean"}

        return {"valid": True, "error": ""}

    def _convert_timestamp(self, ts_raw: int) -> datetime:
        """
        Convert ESP32 timestamp to datetime.

        Handles:
        - Unix seconds (10-digit): Use directly
        - Unix milliseconds (13-digit): Divide by 1000
        - Invalid/zero: Use server time

        Args:
            ts_raw: Raw timestamp value

        Returns:
            datetime object in UTC
        """
        if not ts_raw or ts_raw == 0:
            logger.debug("No timestamp provided, using server time")
            return datetime.now(timezone.utc)

        # Auto-detect milliseconds vs seconds
        if ts_raw > 1e12:  # Milliseconds (13+ digits)
            ts_seconds = ts_raw / 1000
        else:
            ts_seconds = ts_raw

        # Validate timestamp is reasonable
        if MIN_VALID_TIMESTAMP <= ts_seconds <= MAX_VALID_TIMESTAMP:
            return datetime.fromtimestamp(ts_seconds, tz=timezone.utc)
        else:
            logger.warning(
                f"Invalid timestamp {ts_raw} (out of range), using server time"
            )
            return datetime.now(timezone.utc)


# Global handler instance
_handler_instance: Optional[ActuatorResponseHandler] = None


def get_actuator_response_handler() -> ActuatorResponseHandler:
    """
    Get singleton actuator response handler instance.

    Returns:
        ActuatorResponseHandler instance
    """
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = ActuatorResponseHandler()
    return _handler_instance


async def handle_actuator_response(topic: str, payload: dict) -> bool:
    """
    Handle actuator response message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_actuator_response_handler()
    return await handler.handle_actuator_response(topic, payload)

