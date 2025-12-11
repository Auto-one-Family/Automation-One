"""
MQTT Handler: ESP32 Discovery Messages (DEPRECATED)

NOTE: This handler is kept for backwards compatibility.
PRIMARY DISCOVERY MECHANISM: Heartbeat messages.

ESP32 devices are now auto-discovered via their initial heartbeat
(see heartbeat_handler.py). This separate discovery topic is no longer
required but will still work if an ESP32 explicitly publishes to it.

Topic: kaiser/god/discovery/esp32_nodes
QoS: 1 (At Least Once)

Migration Note:
- ESP32 v4.0+ uses heartbeat for discovery
- This handler processes legacy discovery messages
- Both mechanisms can coexist safely
"""

from datetime import datetime, timezone
from typing import Optional

from ...core.logging_config import get_logger
from ...db.models.esp import ESPDevice
from ...db.repositories.esp_repo import ESPRepository
from ...db.session import get_session
from ..topics import TopicBuilder

logger = get_logger(__name__)


class DiscoveryHandler:
    """
    Handles ESP32 discovery messages for automatic device registration.

    Flow:
    1. Parse topic → extract discovery message
    2. Validate payload structure
    3. Check if ESP already exists in DB
    4. If not: Auto-register with metadata
    5. If yes: Update last_seen timestamp
    """

    async def handle_discovery(self, topic: str, payload: dict) -> bool:
        """
        Handle discovery message.

        Expected topic: kaiser/god/discovery/esp32_nodes

        Expected payload:
        {
            "esp_id": "ESP_AB12CD34",
            "hardware_type": "XIAO_ESP32C3" | "ESP32_DEV",
            "mac_address": "AA:BB:CC:DD:EE:FF",
            "ip_address": "192.168.1.100",
            "firmware_version": "4.0.0",
            "capabilities": {
                "max_sensors": 10,
                "max_actuators": 6,
                "features": ["ota", "zones", "safe_mode"]
            }
        }

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
                logger.error(f"Invalid discovery payload: {validation_result['error']}")
                return False

            esp_id_str = payload["esp_id"]

            logger.info(f"Processing discovery: esp_id={esp_id_str}")

            # Step 2: Get database session and repositories
            async for session in get_session():
                esp_repo = ESPRepository(session)

                # Step 3: Check if ESP already exists
                existing_esp = await esp_repo.get_by_device_id(esp_id_str)

                if existing_esp:
                    # ESP already registered → Update metadata
                    logger.info(
                        f"ESP {esp_id_str} already registered. Updating metadata."
                    )

                    # Update device_metadata (IP, Firmware, etc.)
                    existing_esp.device_metadata = {
                        **(existing_esp.device_metadata or {}),
                        "ip_address": payload.get("ip_address"),
                        "mac_address": payload.get("mac_address"),
                        "firmware_version": payload.get("firmware_version"),
                        "last_discovery": datetime.now(timezone.utc).isoformat(),
                    }
                    existing_esp.ip_address = payload.get("ip_address")
                    existing_esp.mac_address = payload.get("mac_address")
                    existing_esp.firmware_version = payload.get("firmware_version")
                    existing_esp.last_seen = datetime.now(timezone.utc)
                    existing_esp.status = "online"

                    await session.commit()

                    logger.info(f"Updated existing ESP: {esp_id_str}")
                    return True

                # Step 4: Auto-register new ESP
                new_esp = ESPDevice(
                    device_id=esp_id_str,
                    hardware_type=payload["hardware_type"],
                    ip_address=payload.get("ip_address"),
                    mac_address=payload.get("mac_address"),
                    firmware_version=payload.get("firmware_version"),
                    status="online",
                    capabilities=payload.get("capabilities", {}),
                    metadata={
                        "discovered_at": datetime.now(timezone.utc).isoformat(),
                        "auto_registered": True,  # Flag for manual review
                    },
                    last_seen=datetime.now(timezone.utc),
                )

                session.add(new_esp)
                await session.commit()

                logger.info(
                    f"✅ Auto-registered new ESP: {esp_id_str} "
                    f"(Type: {payload['hardware_type']}, IP: {payload.get('ip_address', 'N/A')})"
                )

                return True

        except Exception as e:
            logger.error(f"Error handling discovery: {e}", exc_info=True)
            return False

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate discovery payload structure.

        Required fields: esp_id, hardware_type, mac_address, ip_address, firmware_version

        Args:
            payload: Payload dict to validate

        Returns:
            {"valid": bool, "error": str}
        """
        required_fields = [
            "esp_id",
            "hardware_type",
            "mac_address",
            "ip_address",
            "firmware_version",
        ]

        for field in required_fields:
            if field not in payload:
                return {"valid": False, "error": f"Missing required field: {field}"}

        # Type validation
        if not isinstance(payload["esp_id"], str):
            return {"valid": False, "error": "Field 'esp_id' must be string"}

        if not isinstance(payload["hardware_type"], str):
            return {"valid": False, "error": "Field 'hardware_type' must be string"}

        # ESP-ID format validation
        if not payload["esp_id"].startswith("ESP_"):
            return {
                "valid": False,
                "error": "Field 'esp_id' must start with 'ESP_'",
            }

        return {"valid": True, "error": ""}


# Global handler instance
_handler_instance: Optional[DiscoveryHandler] = None


def get_discovery_handler() -> DiscoveryHandler:
    """
    Get singleton discovery handler instance.

    Returns:
        DiscoveryHandler instance
    """
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = DiscoveryHandler()
    return _handler_instance


async def handle_discovery(topic: str, payload: dict) -> bool:
    """
    Handle discovery message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_discovery_handler()
    return await handler.handle_discovery(topic, payload)
