"""
MQTT Handler: Device Heartbeat Messages

Processes heartbeat messages from ESP32 devices:
- Updates device status (online/offline)
- Tracks last_seen timestamp
- Logs device health metrics
- Detects stale connections
- AUTO-DISCOVERY: Automatically registers unknown ESP devices

Note: Heartbeat is the primary discovery mechanism.
ESP32 sends initial heartbeat on startup for registration.
Separate discovery topic (kaiser/god/discovery/esp32_nodes) is deprecated.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from ...core.logging_config import get_logger
from ...db.models.esp import ESPDevice
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
    3. Check if ESP exists in DB
    4. If NOT: Auto-register (Discovery via Heartbeat)
    5. Update ESP device status to "online"
    6. Update last_seen timestamp and metadata
    7. Log health metrics
    """

    async def handle_heartbeat(self, topic: str, payload: dict) -> bool:
        """
        Handle heartbeat message with auto-discovery.

        Expected topic: kaiser/god/esp/{esp_id}/system/heartbeat

        Expected payload (from ESP32):
        {
            "esp_id": "ESP_12AB34CD",
            "zone_id": "zone_main",
            "master_zone_id": "master",
            "zone_assigned": true,
            "ts": 1735818000,
            "uptime": 123456,
            "heap_free": 45000,
            "wifi_rssi": -45,
            "sensor_count": 3,
            "actuator_count": 2
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
                    # ============================================
                    # REJECT: Unknown ESP device - not registered
                    # ============================================
                    # Note: Auto-discovery is disabled. Devices must be
                    # registered via the REST API before sending heartbeats.
                    # Use POST /api/v1/esp/register to register new devices.
                    logger.warning(
                        f"❌ Heartbeat rejected: Unknown device {esp_id_str}. "
                        f"Device must be registered first via API."
                    )
                    return False

                # Step 5: Update device status and last_seen
                last_seen = datetime.fromtimestamp(
                    payload["ts"] / 1000 if payload["ts"] > 1e10 else payload["ts"]
                )
                await esp_repo.update_status(esp_id_str, "online", last_seen)
                
                # Step 6: Update metadata with latest heartbeat info
                await self._update_esp_metadata(esp_device, payload, session)

                # Step 7: Log health metrics
                self._log_health_metrics(esp_id_str, payload)

                # Commit transaction
                await session.commit()

                logger.debug(
                    f"Heartbeat processed: esp_id={esp_id_str}, "
                    f"uptime={payload.get('uptime')}s, "
                    f"heap_free={payload.get('heap_free', payload.get('free_heap'))} bytes"
                )

                # WebSocket Broadcast
                try:
                    from ...websocket.manager import WebSocketManager
                    ws_manager = await WebSocketManager.get_instance()
                    await ws_manager.broadcast("esp_health", {
                        "esp_id": esp_id_str,
                        "status": "online",
                        "heap_free": payload.get("heap_free", payload.get("free_heap")),
                        "wifi_rssi": payload.get("wifi_rssi"),
                        "uptime": payload.get("uptime"),
                        "sensor_count": payload.get("sensor_count", payload.get("active_sensors", 0)),
                        "actuator_count": payload.get("actuator_count", payload.get("active_actuators", 0)),
                        "timestamp": payload.get("ts")
                    })
                except Exception as e:
                    logger.warning(f"Failed to broadcast ESP health via WebSocket: {e}")

                return True

        except Exception as e:
            logger.error(
                f"Error handling heartbeat: {e}",
                exc_info=True,
            )
            return False
    
    async def _auto_register_esp(
        self, 
        session, 
        esp_repo: ESPRepository, 
        esp_id: str, 
        payload: dict
    ) -> Optional[ESPDevice]:
        """
        Auto-register a new ESP device from heartbeat data.
        
        This implements "Discovery via Heartbeat" - ESP32 sends initial
        heartbeat on startup, server auto-registers if unknown.
        
        Args:
            session: Database session
            esp_repo: ESP repository
            esp_id: ESP device ID
            payload: Heartbeat payload
            
        Returns:
            Created ESPDevice or None on failure
        """
        try:
            # Extract available info from heartbeat
            zone_id = payload.get("zone_id", "")
            master_zone_id = payload.get("master_zone_id", "")
            zone_assigned = payload.get("zone_assigned", False)
            
            # Create new ESP device
            new_esp = ESPDevice(
                device_id=esp_id,
                hardware_type="ESP32_WROOM",  # Default, can be updated later
                status="online",
                capabilities={
                    "max_sensors": 20,  # Default for ESP32_WROOM
                    "max_actuators": 12,
                    "features": ["heartbeat", "sensors", "actuators"],
                },
                metadata={
                    "discovered_via": "heartbeat",
                    "discovered_at": datetime.now(timezone.utc).isoformat(),
                    "auto_registered": True,
                    "zone_id": zone_id,
                    "master_zone_id": master_zone_id,
                    "zone_assigned": zone_assigned,
                    "initial_heap_free": payload.get("heap_free", payload.get("free_heap")),
                    "initial_wifi_rssi": payload.get("wifi_rssi"),
                },
                last_seen=datetime.now(timezone.utc),
            )
            
            session.add(new_esp)
            await session.flush()  # Get ID without committing
            
            logger.info(
                f"✅ Auto-registered new ESP: {esp_id} "
                f"(Zone: {zone_id or 'unassigned'}, "
                f"Sensors: {payload.get('sensor_count', 0)}, "
                f"Actuators: {payload.get('actuator_count', 0)})"
            )
            
            return new_esp
            
        except Exception as e:
            logger.error(f"Error auto-registering ESP {esp_id}: {e}", exc_info=True)
            return None
    
    async def _update_esp_metadata(
        self, 
        esp_device: ESPDevice, 
        payload: dict,
        session
    ) -> None:
        """
        Update ESP metadata with latest heartbeat information.
        
        Args:
            esp_device: ESP device model
            payload: Heartbeat payload
            session: Database session
        """
        try:
            # Update device_metadata with latest values
            current_metadata = esp_device.device_metadata or {}
            
            # Update zone info if provided
            if "zone_id" in payload:
                current_metadata["zone_id"] = payload["zone_id"]
            if "master_zone_id" in payload:
                current_metadata["master_zone_id"] = payload["master_zone_id"]
            if "zone_assigned" in payload:
                current_metadata["zone_assigned"] = payload["zone_assigned"]
            
            # Update health metrics
            current_metadata["last_heap_free"] = payload.get(
                "heap_free", payload.get("free_heap")
            )
            current_metadata["last_wifi_rssi"] = payload.get("wifi_rssi")
            current_metadata["last_uptime"] = payload.get("uptime")
            current_metadata["last_sensor_count"] = payload.get(
                "sensor_count", payload.get("active_sensors", 0)
            )
            current_metadata["last_actuator_count"] = payload.get(
                "actuator_count", payload.get("active_actuators", 0)
            )
            current_metadata["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
            
            esp_device.device_metadata = current_metadata
            
        except Exception as e:
            logger.warning(f"Failed to update ESP metadata: {e}")

    def _validate_payload(self, payload: dict) -> dict:
        """
        Validate heartbeat payload structure.

        Required fields: ts, uptime, heap_free OR free_heap, wifi_rssi

        Args:
            payload: Payload dict to validate

        Returns:
            {"valid": bool, "error": str}
        """
        # Check required fields (with alternatives for compatibility)
        if "ts" not in payload:
            return {"valid": False, "error": "Missing required field: ts"}

        if "uptime" not in payload:
            return {"valid": False, "error": "Missing required field: uptime"}

        # Accept both heap_free (ESP32) and free_heap (legacy)
        if "heap_free" not in payload and "free_heap" not in payload:
            return {"valid": False, "error": "Missing required field: heap_free or free_heap"}

        if "wifi_rssi" not in payload:
            return {"valid": False, "error": "Missing required field: wifi_rssi"}

        # Type validation
        if not isinstance(payload["ts"], int):
            return {
                "valid": False,
                "error": "Field 'ts' must be integer (Unix timestamp)",
            }

        if not isinstance(payload["uptime"], int):
            return {"valid": False, "error": "Field 'uptime' must be integer"}

        # Validate heap field (whichever is present)
        heap_value = payload.get("heap_free", payload.get("free_heap"))
        if not isinstance(heap_value, int):
            return {"valid": False, "error": "Field 'heap_free/free_heap' must be integer"}

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
        # Accept both heap_free (ESP32) and free_heap (legacy)
        free_heap = payload.get("heap_free", payload.get("free_heap", 0))
        wifi_rssi = payload.get("wifi_rssi", 0)
        error_count = payload.get("error_count", 0)
        # Accept both sensor_count (ESP32) and active_sensors (legacy)
        active_sensors = payload.get("sensor_count", payload.get("active_sensors", 0))
        # Accept both actuator_count (ESP32) and active_actuators (legacy)
        active_actuators = payload.get("actuator_count", payload.get("active_actuators", 0))

        # Check for low memory
        if free_heap < 10000:  # Less than 10KB free
            logger.warning(
                f"Low memory on {esp_id}: heap_free={free_heap} bytes"
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
                now = datetime.now(timezone.utc)
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
