"""
MQTT Handler: ESP32 Configuration ACK Messages

Logs configuration acknowledgements from ESP devices.

Topic: kaiser/god/esp/{esp_id}/config/ack
QoS: 2 (Exactly Once)
"""

from datetime import datetime
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
        Handle config ACK message.

        Expected topic: kaiser/god/esp/{esp_id}/config/ack

        Expected payload:
        {
            "config_type": "sensor" | "actuator" | "zone" | "system",
            "gpio": 5,  # Optional (nur für sensor/actuator)
            "status": "success" | "failed",
            "error": "Optional error message"  # Nur wenn status=failed
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_config_ack_topic(topic)
            if not parsed_topic:
                logger.error(f"Failed to parse config ACK topic: {topic}")
                return False

            esp_id = parsed_topic["esp_id"]

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                logger.error(f"Invalid config ACK payload: {validation_result['error']}")
                return False

            # Step 3: Log ACK
            config_type = payload["config_type"]
            status = payload["status"]
            gpio = payload.get("gpio")
            error = payload.get("error")

            if status == "success":
                logger.info(
                    f"✅ Config ACK from {esp_id}: {config_type}"
                    + (f" GPIO {gpio}" if gpio else "")
                )
            else:
                logger.error(
                    f"❌ Config FAILED on {esp_id}: {config_type}"
                    + (f" GPIO {gpio}" if gpio else "")
                    + (f" - Error: {error}" if error else "")
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

            return True

        except Exception as e:
            logger.error(f"Error handling config ACK: {e}", exc_info=True)
            return False

    def _validate_payload(self, payload: dict) -> dict:
        """Validate config ACK payload structure."""
        required_fields = ["config_type", "status"]

        for field in required_fields:
            if field not in payload:
                return {"valid": False, "error": f"Missing required field: {field}"}

        # Type validation
        valid_config_types = ["sensor", "actuator", "zone", "system"]
        if payload["config_type"] not in valid_config_types:
            return {
                "valid": False,
                "error": f"Invalid config_type. Must be one of: {valid_config_types}",
            }

        valid_statuses = ["success", "failed"]
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
