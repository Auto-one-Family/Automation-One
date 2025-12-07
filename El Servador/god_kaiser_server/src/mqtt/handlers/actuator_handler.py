"""
MQTT Handler: Actuator Status Messages

Processes actuator status updates from ESP32 devices:
- Parses actuator status topics
- Validates payloads
- Updates actuator state in database
- Logs state changes to history
"""

from datetime import datetime
from typing import Optional

from ...core.logging_config import get_logger
from ...db.repositories import ActuatorRepository, ESPRepository
from ...db.session import get_session
from ..topics import TopicBuilder

logger = get_logger(__name__)


class ActuatorStatusHandler:
    """
    Handles incoming actuator status messages from ESP32 devices.

    Flow:
    1. Parse topic → extract esp_id, gpio
    2. Validate payload structure
    3. Lookup ESP device and actuator config
    4. Update actuator state
    5. Log state change to history
    """

    async def handle_actuator_status(self, topic: str, payload: dict) -> bool:
        """
        Handle actuator status message.

        Expected topic: kaiser/god/esp/{esp_id}/actuator/{gpio}/status

        Expected payload:
        {
            "ts": 1735818000,
            "esp_id": "ESP_12AB34CD",
            "gpio": 18,
            "actuator_type": "pump",
            "state": "on",
            "value": 255,
            "last_command": "on",
            "uptime": 3600,
            "error": null
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully, False otherwise
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_actuator_status_topic(topic)
            if not parsed_topic:
                logger.error(f"Failed to parse actuator status topic: {topic}")
                return False

            esp_id_str = parsed_topic["esp_id"]
            gpio = parsed_topic["gpio"]

            logger.debug(
                f"Processing actuator status: esp_id={esp_id_str}, gpio={gpio}, "
                f"actuator_type={payload.get('actuator_type')}"
            )

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                logger.error(
                    f"Invalid actuator status payload: {validation_result['error']}"
                )
                return False

            # Step 3: Get database session and repositories
            async for session in get_session():
                esp_repo = ESPRepository(session)
                actuator_repo = ActuatorRepository(session)

                # Step 4: Lookup ESP device
                esp_device = await esp_repo.get_by_device_id(esp_id_str)
                if not esp_device:
                    logger.error(f"ESP device not found: {esp_id_str}")
                    return False

                # Step 5: Lookup actuator config
                actuator_config = await actuator_repo.get_by_esp_and_gpio(
                    esp_device.id, gpio
                )
                if not actuator_config:
                    logger.warning(
                        f"Actuator config not found: esp_id={esp_id_str}, gpio={gpio}. "
                        "Updating state without config."
                    )

                # Step 6: Extract data from payload
                actuator_type = payload.get("actuator_type", "unknown")
                state = payload.get("state", "unknown")
                value = float(payload.get("value", 0.0))
                last_command = payload.get("last_command", "")
                error = payload.get("error", None)

                # Step 7: Update actuator state
                actuator_state = await actuator_repo.update_state(
                    esp_id=esp_device.id,
                    gpio=gpio,
                    actuator_type=actuator_type,
                    current_value=value,
                    state=state,
                    last_command=last_command,
                    error_message=error,
                )

                # Step 8: Log to history if command was executed
                if last_command:
                    success = error is None
                    await actuator_repo.log_command(
                        esp_id=esp_device.id,
                        gpio=gpio,
                        actuator_type=actuator_type,
                        command_type=last_command,
                        value=value,
                        success=success,
                        issued_by="esp32",
                        error_message=error,
                        metadata={
                            "timestamp": payload.get("ts"),
                            "uptime": payload.get("uptime"),
                        },
                    )

                # Commit transaction
                await session.commit()

                logger.info(
                    f"Actuator status updated: id={actuator_state.id}, "
                    f"esp_id={esp_id_str}, gpio={gpio}, state={state}, value={value}"
                )

                # Log error if present
                if error:
                    logger.error(
                        f"Actuator error reported: esp_id={esp_id_str}, "
                        f"gpio={gpio}, error={error}"
                    )

                # WebSocket Broadcast
                try:
                    from ...websocket.manager import WebSocketManager
                    ws_manager = await WebSocketManager.get_instance()
                    await ws_manager.broadcast("actuator_status", {
                        "esp_id": esp_id_str,
                        "gpio": gpio,
                        "actuator_type": actuator_type,
                        "state": state,
                        "value": value,
                        "emergency": payload.get("emergency", "normal"),
                        "timestamp": payload.get("ts")
                    })
                except Exception as e:
                    logger.warning(f"Failed to broadcast actuator status via WebSocket: {e}")

                return True

        except Exception as e:
            logger.error(
                f"Error handling actuator status: {e}",
                exc_info=True,
            )
            return False

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate actuator status payload structure.

        Required fields: ts, esp_id, gpio, actuator_type, state, value

        Args:
            payload: Payload dict to validate

        Returns:
            {"valid": bool, "error": str}
        """
        required_fields = ["ts", "esp_id", "gpio", "actuator_type", "state", "value"]

        for field in required_fields:
            if field not in payload:
                return {
                    "valid": False,
                    "error": f"Missing required field: {field}",
                }

        # Type validation
        if not isinstance(payload["ts"], int):
            return {
                "valid": False,
                "error": "Field 'ts' must be integer (Unix timestamp)",
            }

        if not isinstance(payload["gpio"], int):
            return {"valid": False, "error": "Field 'gpio' must be integer"}

        # Validate value (should be numeric)
        try:
            float(payload["value"])
        except (ValueError, TypeError):
            return {"valid": False, "error": "Field 'value' must be numeric"}

        # Validate state (should be string)
        valid_states = ["on", "off", "pwm", "error", "unknown"]
        if payload["state"] not in valid_states:
            return {
                "valid": False,
                "error": f"Field 'state' must be one of: {valid_states}",
            }

        return {"valid": True, "error": ""}


# Global handler instance
_handler_instance: Optional[ActuatorStatusHandler] = None


def get_actuator_handler() -> ActuatorStatusHandler:
    """
    Get singleton actuator status handler instance.

    Returns:
        ActuatorStatusHandler instance
    """
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = ActuatorStatusHandler()
    return _handler_instance


async def handle_actuator_status(topic: str, payload: dict) -> bool:
    """
    Handle actuator status message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_actuator_handler()
    return await handler.handle_actuator_status(topic, payload)
