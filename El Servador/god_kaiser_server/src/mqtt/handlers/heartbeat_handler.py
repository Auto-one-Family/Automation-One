"""
MQTT Handler: Device Heartbeat Messages

Processes heartbeat messages from ESP32 devices:
- Updates device status (online/offline)
- Tracks last_seen timestamp
- Logs device health metrics
- Detects stale connections
"""

from datetime import datetime, timedelta
from typing import Optional

from ...core.logging_config import get_logger
from ...db.repositories import ESPRepository
from ...db.session import get_session
from ..topics import TopicBuilder

logger = get_logger(__name__)

# Heartbeat timeout: device considered offline after 5 minutes
HEARTBEAT_TIMEOUT_SECONDS = 300


class HeartbeatHandler:
    """
    Handles incoming heartbeat messages from ESP32 devices.

    Flow:
    1. Parse topic → extract esp_id
    2. Validate payload structure
    3. Update ESP device status to "online"
    4. Update last_seen timestamp
    5. Log health metrics
    """

    async def handle_heartbeat(self, topic: str, payload: dict) -> bool:
        """
        Handle heartbeat message.

        Expected topic: kaiser/god/esp/{esp_id}/heartbeat

        Expected payload:
        {
            "ts": 1735818000,
            "uptime": 123456,
            "free_heap": 45000,
            "wifi_rssi": -45,
            "mqtt_connected": true,
            "error_count": 0,
            "active_sensors": 3,
            "active_actuators": 2
        }

        Args:
            topic: MQTT topic string
            payload: Parsed JSON payload dict

        Returns:
            True if message processed successfully, False otherwise
        """
        try:
            # Step 1: Parse topic
            parsed_topic = TopicBuilder.parse_heartbeat_topic(topic)
            if not parsed_topic:
                logger.error(f"Failed to parse heartbeat topic: {topic}")
                return False

            esp_id_str = parsed_topic["esp_id"]

            logger.debug(f"Processing heartbeat: esp_id={esp_id_str}")

            # Step 2: Validate payload
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                logger.error(
                    f"Invalid heartbeat payload: {validation_result['error']}"
                )
                return False

            # Step 3: Get database session and repositories
            async for session in get_session():
                esp_repo = ESPRepository(session)

                # Step 4: Lookup ESP device
                esp_device = await esp_repo.get_by_device_id(esp_id_str)
                if not esp_device:
                    logger.warning(
                        f"Heartbeat from unknown ESP device: {esp_id_str}. "
                        "Device not registered in database."
                    )
                    return False

                # Step 5: Update device status and last_seen
                last_seen = datetime.fromtimestamp(payload["ts"])
                await esp_repo.update_status(esp_id_str, "online", last_seen)

                # Step 6: Log health metrics
                self._log_health_metrics(esp_id_str, payload)

                # Commit transaction
                await session.commit()

                logger.debug(
                    f"Heartbeat processed: esp_id={esp_id_str}, "
                    f"uptime={payload.get('uptime')}s, "
                    f"free_heap={payload.get('free_heap')} bytes"
                )

                return True

        except Exception as e:
            logger.error(
                f"Error handling heartbeat: {e}",
                exc_info=True,
            )
            return False

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate heartbeat payload structure.

        Required fields: ts, uptime, free_heap, wifi_rssi

        Args:
            payload: Payload dict to validate

        Returns:
            {"valid": bool, "error": str}
        """
        required_fields = ["ts", "uptime", "free_heap", "wifi_rssi"]

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

        if not isinstance(payload["uptime"], int):
            return {"valid": False, "error": "Field 'uptime' must be integer"}

        if not isinstance(payload["free_heap"], int):
            return {"valid": False, "error": "Field 'free_heap' must be integer"}

        if not isinstance(payload["wifi_rssi"], int):
            return {"valid": False, "error": "Field 'wifi_rssi' must be integer"}

        return {"valid": True, "error": ""}

    def _log_health_metrics(self, esp_id: str, payload: dict):
        """
        Log device health metrics.

        Args:
            esp_id: ESP device ID string
            payload: Heartbeat payload with metrics
        """
        uptime = payload.get("uptime", 0)
        free_heap = payload.get("free_heap", 0)
        wifi_rssi = payload.get("wifi_rssi", 0)
        error_count = payload.get("error_count", 0)
        active_sensors = payload.get("active_sensors", 0)
        active_actuators = payload.get("active_actuators", 0)

        # Check for low memory
        if free_heap < 10000:  # Less than 10KB free
            logger.warning(
                f"Low memory on {esp_id}: free_heap={free_heap} bytes"
            )

        # Check for weak WiFi signal
        if wifi_rssi < -70:  # Weak signal
            logger.warning(
                f"Weak WiFi signal on {esp_id}: rssi={wifi_rssi} dBm"
            )

        # Check for errors
        if error_count > 0:
            logger.warning(
                f"Device {esp_id} reported {error_count} error(s)"
            )

        logger.debug(
            f"Health metrics for {esp_id}: "
            f"uptime={uptime}s, free_heap={free_heap}B, rssi={wifi_rssi}dBm, "
            f"sensors={active_sensors}, actuators={active_actuators}, errors={error_count}"
        )

    async def check_device_timeouts(self) -> dict:
        """
        Check for devices that haven't sent heartbeat recently.

        Marks devices as offline if last_seen > HEARTBEAT_TIMEOUT_SECONDS.

        Returns:
            {
                "checked": int,
                "timed_out": int,
                "offline_devices": [str]
            }
        """
        try:
            async for session in get_session():
                esp_repo = ESPRepository(session)

                # Get all online devices
                online_devices = await esp_repo.get_by_status("online")

                offline_devices = []
                now = datetime.utcnow()
                timeout_threshold = now - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)

                for device in online_devices:
                    if device.last_seen and device.last_seen < timeout_threshold:
                        # Device timed out
                        await esp_repo.update_status(device.device_id, "offline")
                        offline_devices.append(device.device_id)
                        logger.warning(
                            f"Device {device.device_id} timed out. "
                            f"Last seen: {device.last_seen}"
                        )

                # Commit transaction
                await session.commit()

                return {
                    "checked": len(online_devices),
                    "timed_out": len(offline_devices),
                    "offline_devices": offline_devices,
                }

        except Exception as e:
            logger.error(f"Error checking device timeouts: {e}", exc_info=True)
            return {
                "checked": 0,
                "timed_out": 0,
                "offline_devices": [],
            }


# Global handler instance
_handler_instance: Optional[HeartbeatHandler] = None


def get_heartbeat_handler() -> HeartbeatHandler:
    """
    Get singleton heartbeat handler instance.

    Returns:
        HeartbeatHandler instance
    """
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = HeartbeatHandler()
    return _handler_instance


async def handle_heartbeat(topic: str, payload: dict) -> bool:
    """
    Handle heartbeat message (convenience function).

    Args:
        topic: MQTT topic string
        payload: Parsed JSON payload dict

    Returns:
        True if message processed successfully
    """
    handler = get_heartbeat_handler()
    return await handler.handle_heartbeat(topic, payload)
