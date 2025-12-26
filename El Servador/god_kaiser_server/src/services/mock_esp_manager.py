"""
Mock ESP Manager Service

Manages mock ESP32 instances for debugging and testing.
Wraps the MockESP32Client from tests and provides a clean API
for the debug endpoints.
"""

import asyncio
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..core.logging_config import get_logger
from ..mqtt.client import MQTTClient
from ..schemas.debug import (
    MockActuatorConfig,
    MockActuatorResponse,
    MockESPCreate,
    MockESPResponse,
    MockSensorConfig,
    MockSensorResponse,
    MockSystemState,
    MqttMessageRecord,
)

logger = get_logger(__name__)

# Add tests directory to path for importing MockESP32Client
_tests_path = Path(__file__).parent.parent.parent / "tests" / "esp32" / "mocks"
if str(_tests_path) not in sys.path:
    sys.path.insert(0, str(_tests_path))

from mock_esp32_client import MockESP32Client, SystemState


class MockESPManager:
    """
    Singleton manager for mock ESP32 instances.

    Provides thread-safe management of mock ESP devices
    and their MQTT communication.
    """

    _instance: Optional["MockESPManager"] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self._mock_esps: Dict[str, MockESP32Client] = {}
        self._created_at: Dict[str, datetime] = {}
        self._zone_names: Dict[str, str] = {}  # Store zone_name separately
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._heartbeat_intervals: Dict[str, int] = {}
        self._mqtt_client: Optional[MQTTClient] = None

    @classmethod
    async def get_instance(cls) -> "MockESPManager":
        """Get singleton instance."""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = MockESPManager()
                logger.info("MockESPManager initialized")
            return cls._instance

    def set_mqtt_client(self, client: MQTTClient):
        """Set MQTT client for publishing messages."""
        self._mqtt_client = client

    # =========================================================================
    # CRUD Operations
    # =========================================================================
    async def create_mock_esp(self, config: MockESPCreate) -> MockESPResponse:
        """
        Create a new mock ESP32 instance.

        Args:
            config: Mock ESP configuration

        Returns:
            MockESPResponse with created ESP state

        Raises:
            ValueError: If ESP ID already exists
        """
        if config.esp_id in self._mock_esps:
            raise ValueError(f"Mock ESP {config.esp_id} already exists")

        # Create mock ESP
        mock = MockESP32Client(
            esp_id=config.esp_id,
            kaiser_id="god",
            auto_heartbeat=False  # We manage heartbeat ourselves
        )

        # Configure zone if provided
        # Auto-generate zone_id from zone_name if zone_name is provided but zone_id is not
        zone_id = config.zone_id
        zone_name = config.zone_name

        if zone_name and not zone_id:
            # Generate technical zone_id from user-friendly zone_name
            # "Zelt 1" -> "zelt_1", "Gewächshaus Nord" -> "gewaechshaus_nord"
            import re
            zone_id = zone_name.lower()
            # Replace German umlauts
            zone_id = zone_id.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
            # Replace spaces and special chars with underscores
            zone_id = re.sub(r'[^a-z0-9]+', '_', zone_id)
            # Remove leading/trailing underscores
            zone_id = zone_id.strip('_')

        if zone_id or config.master_zone_id:
            mock.configure_zone(
                zone_id=zone_id or "default",
                master_zone_id=config.master_zone_id or "god",
                subzone_id=config.subzone_id
            )

        # Store zone_name for display
        if zone_name:
            self._zone_names[config.esp_id] = zone_name

        # Add sensors
        for sensor_cfg in config.sensors:
            mock.set_sensor_value(
                gpio=sensor_cfg.gpio,
                raw_value=sensor_cfg.raw_value,
                sensor_type=sensor_cfg.sensor_type,
                unit=sensor_cfg.unit,
                quality=sensor_cfg.quality,
                raw_mode=sensor_cfg.raw_mode,
                subzone_id=sensor_cfg.subzone_id
            )
            if sensor_cfg.name:
                mock.sensors[sensor_cfg.gpio].name = sensor_cfg.name

        # Add actuators
        for actuator_cfg in config.actuators:
            mock.configure_actuator(
                gpio=actuator_cfg.gpio,
                actuator_type=actuator_cfg.actuator_type,
                name=actuator_cfg.name or f"Actuator_{actuator_cfg.gpio}",
                min_value=actuator_cfg.min_value,
                max_value=actuator_cfg.max_value
            )
            if actuator_cfg.state:
                mock.actuators[actuator_cfg.gpio].state = actuator_cfg.state
            if actuator_cfg.pwm_value:
                mock.actuators[actuator_cfg.gpio].pwm_value = actuator_cfg.pwm_value

        # Set callback to publish messages via MQTT
        mock.on_publish = self._create_publish_callback(config.esp_id)

        # Store mock
        self._mock_esps[config.esp_id] = mock
        self._created_at[config.esp_id] = datetime.now(timezone.utc)
        self._heartbeat_intervals[config.esp_id] = config.heartbeat_interval_seconds

        # Start auto-heartbeat if requested
        if config.auto_heartbeat:
            await self._start_heartbeat_task(config.esp_id, config.heartbeat_interval_seconds)

        logger.info(f"Created mock ESP: {config.esp_id} with {len(config.sensors)} sensors, {len(config.actuators)} actuators")

        return self._to_response(config.esp_id)

    async def get_mock_esp(self, esp_id: str) -> Optional[MockESPResponse]:
        """Get mock ESP by ID."""
        if esp_id not in self._mock_esps:
            return None
        return self._to_response(esp_id)

    async def list_mock_esps(self) -> List[MockESPResponse]:
        """List all mock ESPs."""
        return [self._to_response(esp_id) for esp_id in self._mock_esps]

    async def delete_mock_esp(self, esp_id: str) -> bool:
        """
        Delete a mock ESP instance.

        Returns:
            True if deleted, False if not found
        """
        if esp_id not in self._mock_esps:
            return False

        # Stop heartbeat task
        if esp_id in self._heartbeat_tasks:
            self._heartbeat_tasks[esp_id].cancel()
            del self._heartbeat_tasks[esp_id]

        # Disconnect mock
        mock = self._mock_esps[esp_id]
        mock.disconnect()

        # Remove from storage
        del self._mock_esps[esp_id]
        del self._created_at[esp_id]
        if esp_id in self._heartbeat_intervals:
            del self._heartbeat_intervals[esp_id]
        if esp_id in self._zone_names:
            del self._zone_names[esp_id]

        logger.info(f"Deleted mock ESP: {esp_id}")
        return True

    async def update_zone(
        self,
        esp_id: str,
        zone_id: Optional[str],
        zone_name: Optional[str] = None,
        master_zone_id: Optional[str] = None,
    ) -> bool:
        """
        Update zone assignment for a mock ESP.

        This method is called by ZoneService when a zone is assigned via the Zone API.
        It ensures the in-memory store stays in sync with the database.

        Args:
            esp_id: ESP device ID
            zone_id: Zone ID (None or empty string to clear)
            zone_name: Human-readable zone name
            master_zone_id: Parent master zone ID

        Returns:
            True if updated, False if ESP not found
        """
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return False

        # Update zone configuration
        if zone_id:
            mock.configure_zone(
                zone_id=zone_id,
                master_zone_id=master_zone_id or "god",
                subzone_id=None
            )
            # Store zone_name for display
            if zone_name:
                self._zone_names[esp_id] = zone_name
            elif esp_id in self._zone_names:
                del self._zone_names[esp_id]
        else:
            # Clear zone assignment
            mock.zone = None
            if esp_id in self._zone_names:
                del self._zone_names[esp_id]

        logger.info(f"Updated zone for mock ESP {esp_id}: zone_id={zone_id}, zone_name={zone_name}")
        return True

    def has_mock_esp(self, esp_id: str) -> bool:
        """Check if a mock ESP exists in the manager."""
        return esp_id in self._mock_esps

    # =========================================================================
    # Sensor Operations
    # =========================================================================
    async def set_sensor_value(
        self,
        esp_id: str,
        gpio: int,
        raw_value: float,
        quality: Optional[str] = None,
        publish: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Set a sensor value on a mock ESP.

        Returns:
            Published message payload if publish=True, else sensor state
        """
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        if gpio not in mock.sensors:
            return None

        # Update sensor value
        sensor = mock.sensors[gpio]
        sensor.raw_value = raw_value
        if quality:
            sensor.quality = quality
        sensor.last_read = time.time()

        # Publish if requested
        if publish:
            response = mock.handle_command("sensor_read", {"gpio": gpio})
            return response

        return {
            "gpio": gpio,
            "raw_value": raw_value,
            "quality": sensor.quality
        }

    async def set_batch_sensor_values(
        self,
        esp_id: str,
        values: Dict[int, float],
        publish: bool = True
    ) -> Optional[Dict[str, Any]]:
        """Set multiple sensor values at once."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        # Update all sensors
        for gpio, raw_value in values.items():
            if gpio in mock.sensors:
                mock.sensors[gpio].raw_value = raw_value
                mock.sensors[gpio].last_read = time.time()

        # Publish batch if requested
        if publish:
            response = mock.handle_command("sensor_batch", {})
            return response

        return {"updated": list(values.keys())}

    async def add_sensor(
        self,
        esp_id: str,
        config: MockSensorConfig
    ) -> Optional[MockSensorResponse]:
        """Add a sensor to a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        mock.set_sensor_value(
            gpio=config.gpio,
            raw_value=config.raw_value,
            sensor_type=config.sensor_type,
            unit=config.unit,
            quality=config.quality,
            raw_mode=config.raw_mode,
            subzone_id=config.subzone_id
        )
        if config.name:
            mock.sensors[config.gpio].name = config.name

        # Publish an initial sensor_read to mirror real device behavior
        mock.handle_command("sensor_read", {"gpio": config.gpio})

        return self._sensor_to_response(mock.sensors[config.gpio])

    async def remove_sensor(
        self,
        esp_id: str,
        gpio: int
    ) -> bool:
        """Remove a sensor from a mock ESP and return pin to safe state."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return False

        if gpio not in mock.sensors:
            return False

        del mock.sensors[gpio]
        return True

    # =========================================================================
    # Actuator Operations
    # =========================================================================
    async def set_actuator_state(
        self,
        esp_id: str,
        gpio: int,
        state: bool,
        pwm_value: Optional[float] = None,
        publish: bool = True
    ) -> Optional[Dict[str, Any]]:
        """Set actuator state on a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        if gpio not in mock.actuators:
            return None

        # Build command
        command = "ON" if state else "OFF"
        value = pwm_value if pwm_value is not None else (1.0 if state else 0.0)

        # Execute via command handler (handles state + publish)
        response = mock.handle_command("actuator_set", {
            "gpio": gpio,
            "command": command,
            "value": value
        })

        return response

    async def add_actuator(
        self,
        esp_id: str,
        config: MockActuatorConfig
    ) -> Optional[MockActuatorResponse]:
        """Add an actuator to a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        mock.configure_actuator(
            gpio=config.gpio,
            actuator_type=config.actuator_type,
            name=config.name or f"Actuator_{config.gpio}",
            min_value=config.min_value,
            max_value=config.max_value
        )

        if config.state:
            mock.actuators[config.gpio].state = config.state
        if config.pwm_value:
            mock.actuators[config.gpio].pwm_value = config.pwm_value

        return self._actuator_to_response(mock.actuators[config.gpio])

    # =========================================================================
    # Heartbeat & State Operations
    # =========================================================================
    async def trigger_heartbeat(self, esp_id: str) -> Optional[Dict[str, Any]]:
        """Manually trigger a heartbeat for a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        response = mock.handle_command("heartbeat", {})
        mock.last_heartbeat = time.time()

        return response

    async def set_state(
        self,
        esp_id: str,
        state: MockSystemState,
        reason: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Transition mock ESP to a new system state."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        # Map string state to enum - handle both string and enum input
        state_value = state.value if hasattr(state, 'value') else str(state)
        target_state = SystemState[state_value]

        if state_value == "SAFE_MODE":
            mock.enter_safe_mode(reason or "manual")
        elif state_value == "OPERATIONAL" and mock.system_state == SystemState.SAFE_MODE:
            mock.exit_safe_mode()
        else:
            mock._transition_state(target_state)

        return {
            "esp_id": esp_id,
            "previous_state": mock.previous_state.name,
            "current_state": mock.system_state.name,
            "reason": reason
        }

    async def set_auto_heartbeat(
        self,
        esp_id: str,
        enabled: bool,
        interval_seconds: int = 60
    ) -> bool:
        """Enable or disable auto-heartbeat for a mock ESP."""
        if esp_id not in self._mock_esps:
            return False

        self._heartbeat_intervals[esp_id] = interval_seconds

        if enabled:
            await self._start_heartbeat_task(esp_id, interval_seconds)
        else:
            if esp_id in self._heartbeat_tasks:
                self._heartbeat_tasks[esp_id].cancel()
                del self._heartbeat_tasks[esp_id]

        return True

    # =========================================================================
    # Emergency Stop
    # =========================================================================
    async def emergency_stop(self, esp_id: str, reason: str = "manual") -> Optional[Dict[str, Any]]:
        """Trigger emergency stop on a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        response = mock.handle_command("emergency_stop", {"reason": reason})
        return response

    async def clear_emergency(self, esp_id: str) -> Optional[Dict[str, Any]]:
        """Clear emergency stop on a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return None

        response = mock.handle_command("clear_emergency", {})
        return response

    # =========================================================================
    # Message History
    # =========================================================================
    async def get_published_messages(
        self,
        esp_id: str,
        limit: int = 100
    ) -> List[MqttMessageRecord]:
        """Get recently published MQTT messages from a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return []

        messages = mock.published_messages[-limit:]
        return [
            MqttMessageRecord(
                topic=msg.get("topic", ""),
                payload=msg.get("payload", {}),
                timestamp=datetime.fromtimestamp(msg.get("timestamp", time.time()), tz=timezone.utc),
                qos=msg.get("qos", 1)
            )
            for msg in messages
        ]

    async def clear_messages(self, esp_id: str) -> bool:
        """Clear message history for a mock ESP."""
        mock = self._mock_esps.get(esp_id)
        if not mock:
            return False

        mock.published_messages.clear()
        return True

    # =========================================================================
    # Internal Helpers
    # =========================================================================
    def _create_publish_callback(self, esp_id: str):
        """Create callback that publishes messages via MQTT client."""
        def callback(topic: str, payload: Dict[str, Any], qos: int = 1):
            if self._mqtt_client and self._mqtt_client.is_connected():
                try:
                    import json
                    self._mqtt_client.publish(topic, json.dumps(payload), qos=qos)
                    logger.debug(f"Mock {esp_id} published to {topic}")
                except Exception as e:
                    logger.warning(f"Failed to publish mock message: {e}")
        return callback

    async def _start_heartbeat_task(self, esp_id: str, interval: int):
        """Start auto-heartbeat task for a mock ESP."""
        # Cancel existing task
        if esp_id in self._heartbeat_tasks:
            self._heartbeat_tasks[esp_id].cancel()

        async def heartbeat_loop():
            while True:
                try:
                    await asyncio.sleep(interval)
                    await self.trigger_heartbeat(esp_id)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Heartbeat error for {esp_id}: {e}")

        self._heartbeat_tasks[esp_id] = asyncio.create_task(heartbeat_loop())
        logger.info(f"Started auto-heartbeat for {esp_id} every {interval}s")

    def _to_response(self, esp_id: str) -> MockESPResponse:
        """Convert mock ESP to response schema."""
        mock = self._mock_esps[esp_id]

        # Determine connection status for consistent display
        status = "online" if mock.connected else "offline"

        return MockESPResponse(
            esp_id=esp_id,
            zone_id=mock.zone.zone_id if mock.zone else None,
            zone_name=self._zone_names.get(esp_id),  # User-friendly zone name
            master_zone_id=mock.zone.master_zone_id if mock.zone else None,
            subzone_id=mock.zone.subzone_id if mock.zone else None,
            system_state=mock.system_state.name,
            sensors=[self._sensor_to_response(s) for s in mock.sensors.values()],
            actuators=[self._actuator_to_response(a) for a in mock.actuators.values()],
            auto_heartbeat=esp_id in self._heartbeat_tasks,
            heap_free=mock.heap_free,
            wifi_rssi=mock.wifi_rssi,
            uptime=int(time.time() - mock.boot_time),
            last_heartbeat=datetime.fromtimestamp(mock.last_heartbeat, tz=timezone.utc) if mock.last_heartbeat else None,
            created_at=self._created_at[esp_id],
            connected=mock.connected,
            hardware_type="MOCK_ESP32",  # Identifies this as a mock device
            status=status  # Connection status (online/offline) for consistent display
        )

    def _sensor_to_response(self, sensor) -> MockSensorResponse:
        """Convert sensor state to response schema."""
        return MockSensorResponse(
            gpio=sensor.gpio,
            sensor_type=sensor.sensor_type,
            name=sensor.name or None,
            subzone_id=sensor.subzone_id if hasattr(sensor, "subzone_id") else None,
            raw_value=sensor.raw_value,
            unit=sensor.unit,
            quality=sensor.quality,
            raw_mode=sensor.raw_mode,
            last_read=datetime.fromtimestamp(sensor.last_read, tz=timezone.utc) if sensor.last_read else None
        )

    def _actuator_to_response(self, actuator) -> MockActuatorResponse:
        """Convert actuator state to response schema."""
        return MockActuatorResponse(
            gpio=actuator.gpio,
            actuator_type=actuator.actuator_type,
            name=actuator.name or None,
            state=actuator.state,
            pwm_value=actuator.pwm_value,
            emergency_stopped=actuator.emergency_stopped,
            last_command=actuator.last_command
        )

    # =========================================================================
    # Dual-Storage Sync Operations
    # =========================================================================
    def get_orphaned_mock_ids(self, db_mock_ids: List[str]) -> List[str]:
        """
        Find Mock ESP IDs that exist in DB but not in memory.

        These are "orphaned" entries from previous server runs.

        Args:
            db_mock_ids: List of Mock ESP IDs from database

        Returns:
            List of orphaned Mock ESP IDs
        """
        in_memory_ids = set(self._mock_esps.keys())
        db_ids = set(db_mock_ids)
        orphaned = db_ids - in_memory_ids
        return list(orphaned)

    def get_sync_status(self, db_mock_ids: List[str]) -> Dict[str, Any]:
        """
        Get synchronization status between memory and database.

        Args:
            db_mock_ids: List of Mock ESP IDs from database

        Returns:
            Dict with sync status information
        """
        in_memory_ids = set(self._mock_esps.keys())
        db_ids = set(db_mock_ids)

        orphaned = db_ids - in_memory_ids
        memory_only = in_memory_ids - db_ids  # Unlikely, but possible
        synced = in_memory_ids & db_ids

        return {
            "in_memory_count": len(in_memory_ids),
            "in_database_count": len(db_ids),
            "synced_count": len(synced),
            "orphaned_count": len(orphaned),
            "orphaned_ids": list(orphaned),
            "memory_only_ids": list(memory_only),
            "is_synced": len(orphaned) == 0 and len(memory_only) == 0,
        }

    def is_mock_in_memory(self, esp_id: str) -> bool:
        """Check if a Mock ESP exists in memory."""
        return esp_id in self._mock_esps
