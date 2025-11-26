"""
Mock ESP32 Client - Server-side simulation of ESP32 MQTT behavior.

This mock allows testing ESP32 orchestration without physical hardware.
It simulates:
- MQTT message handling (commands, responses)
- Actuator state management
- Sensor value simulation
- Configuration storage
- Heartbeat publishing

IMPORTANT: This mock uses the REAL MQTT topic structure (not separate test topics).

Rationale:
- Tests must run against both Mock clients AND real hardware
- Pre-production validation requires identical topic structure
- Cross-ESP tests need authentic message routing
- Allows seamless transition from Mock → Real hardware testing

Topic structure matches production:
- kaiser/god/esp/{esp_id}/actuator/{gpio}/status
- kaiser/god/esp/{esp_id}/sensor/{gpio}/data
- kaiser/god/esp/{esp_id}/actuator/{gpio}/command
- etc. (see El Trabajante/docs/Mqtt_Protocoll.md)
"""

import json
import time
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ActuatorState:
    """State of a single actuator."""
    gpio: int
    type: str  # "pump", "valve", "pwm"
    state: bool  # on/off
    pwm_value: float = 0.0  # 0.0-1.0 for PWM actuators
    last_command: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class SensorState:
    """State of a single sensor."""
    gpio: int
    type: str  # "analog", "digital", "i2c", "onewire"
    raw_value: float = 0.0
    processed_value: Optional[float] = None
    last_read: float = field(default_factory=time.time)


class MockESP32Client:
    """
    Mock ESP32 Client that simulates ESP32 behavior on the server side.

    Usage:
        mock = MockESP32Client(esp_id="test-esp-001")
        mock.handle_command("ping", {})
        response = mock.get_last_response()
    """

    def __init__(
        self,
        esp_id: str = "test-esp-001",
        kaiser_id: str = "test-kaiser-001",
        auto_heartbeat: bool = False
    ):
        """
        Initialize Mock ESP32 Client.

        Args:
            esp_id: ESP32 device ID
            kaiser_id: Kaiser/God-Kaiser ID
            auto_heartbeat: Automatically publish heartbeat every N seconds
        """
        self.esp_id = esp_id
        self.kaiser_id = kaiser_id
        self.auto_heartbeat = auto_heartbeat

        # State management
        self.actuators: Dict[int, ActuatorState] = {}
        self.sensors: Dict[int, SensorState] = {}
        self.config: Dict[str, Any] = {
            "wifi": {"ssid": "MockWiFi", "connected": True},
            "zone": {"id": "test-zone", "name": "Mock Zone"},
            "system": {"version": "1.0.0-mock", "uptime": 0}
        }

        # Communication state
        self.connected = True
        self.last_heartbeat = time.time()
        self.last_response: Optional[Dict[str, Any]] = None
        self.published_messages: list[Dict[str, Any]] = []

        # Callbacks for custom behavior
        self.on_command: Optional[Callable] = None
        self.on_publish: Optional[Callable] = None

    def handle_command(self, command: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle incoming test command and return response.

        Args:
            command: Command type (ping, actuator_set, sensor_read, config_get)
            params: Command parameters

        Returns:
            Response dict with status and data
        """
        if self.on_command:
            result = self.on_command(command, params)
            if result:
                return result

        handlers = {
            "ping": self._handle_ping,
            "actuator_set": self._handle_actuator_set,
            "actuator_get": self._handle_actuator_get,
            "sensor_read": self._handle_sensor_read,
            "config_get": self._handle_config_get,
            "config_set": self._handle_config_set,
            "emergency_stop": self._handle_emergency_stop,
            "reset": self._handle_reset,
        }

        handler = handlers.get(command)
        if not handler:
            return {
                "status": "error",
                "error": f"Unknown command: {command}",
                "timestamp": time.time()
            }

        response = handler(params)
        self.last_response = response

        return response

    def _handle_ping(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle ping command."""
        return {
            "status": "ok",
            "command": "pong",
            "esp_id": self.esp_id,
            "timestamp": time.time(),
            "uptime": time.time() - self.last_heartbeat
        }

    def _handle_actuator_set(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle actuator set command."""
        gpio = params.get("gpio")
        value = params.get("value")
        mode = params.get("mode", "digital")  # digital, pwm

        if gpio is None or value is None:
            return {
                "status": "error",
                "error": "Missing gpio or value parameter",
                "timestamp": time.time()
            }

        # Create or update actuator state
        if gpio not in self.actuators:
            self.actuators[gpio] = ActuatorState(
                gpio=gpio,
                type=mode,
                state=False,
                pwm_value=0.0
            )

        actuator = self.actuators[gpio]

        if mode == "pwm":
            actuator.pwm_value = float(value)
            actuator.state = value > 0
        else:
            actuator.state = bool(value)
            actuator.pwm_value = 1.0 if actuator.state else 0.0

        actuator.last_command = f"set_{mode}"
        actuator.timestamp = time.time()

        # Simulate publishing actuator status
        self._publish_actuator_status(gpio)

        return {
            "status": "ok",
            "command": "actuator_set",
            "gpio": gpio,
            "state": actuator.state,
            "pwm_value": actuator.pwm_value,
            "timestamp": actuator.timestamp
        }

    def _handle_actuator_get(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle actuator get command."""
        gpio = params.get("gpio")

        if gpio is None:
            # Return all actuators
            return {
                "status": "ok",
                "command": "actuator_get",
                "actuators": {
                    gpio: {
                        "type": act.type,
                        "state": act.state,
                        "pwm_value": act.pwm_value,
                        "last_command": act.last_command
                    }
                    for gpio, act in self.actuators.items()
                },
                "timestamp": time.time()
            }

        if gpio not in self.actuators:
            return {
                "status": "error",
                "error": f"Actuator on GPIO {gpio} not found",
                "timestamp": time.time()
            }

        actuator = self.actuators[gpio]
        return {
            "status": "ok",
            "command": "actuator_get",
            "gpio": gpio,
            "type": actuator.type,
            "state": actuator.state,
            "pwm_value": actuator.pwm_value,
            "last_command": actuator.last_command,
            "timestamp": actuator.timestamp
        }

    def _handle_sensor_read(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle sensor read command."""
        gpio = params.get("gpio")

        if gpio is None:
            return {
                "status": "error",
                "error": "Missing gpio parameter",
                "timestamp": time.time()
            }

        if gpio not in self.sensors:
            # Create mock sensor with default value
            self.sensors[gpio] = SensorState(
                gpio=gpio,
                type="analog",
                raw_value=0.0
            )

        sensor = self.sensors[gpio]
        sensor.last_read = time.time()

        # Simulate publishing sensor data
        self._publish_sensor_data(gpio)

        return {
            "status": "ok",
            "command": "sensor_read",
            "gpio": gpio,
            "type": sensor.type,
            "raw_value": sensor.raw_value,
            "processed_value": sensor.processed_value,
            "timestamp": sensor.last_read
        }

    def _handle_config_get(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle config get command."""
        key = params.get("key")

        if key:
            value = self.config.get(key)
            return {
                "status": "ok",
                "command": "config_get",
                "key": key,
                "value": value,
                "timestamp": time.time()
            }

        # Return all config
        return {
            "status": "ok",
            "command": "config_get",
            "config": self.config,
            "timestamp": time.time()
        }

    def _handle_config_set(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle config set command."""
        key = params.get("key")
        value = params.get("value")

        if key is None or value is None:
            return {
                "status": "error",
                "error": "Missing key or value parameter",
                "timestamp": time.time()
            }

        self.config[key] = value

        return {
            "status": "ok",
            "command": "config_set",
            "key": key,
            "value": value,
            "timestamp": time.time()
        }

    def _handle_emergency_stop(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle emergency stop command."""
        # Stop all actuators
        stopped_actuators = []
        timestamp = time.time()
        
        for gpio, actuator in self.actuators.items():
            actuator.state = False
            actuator.pwm_value = 0.0
            actuator.last_command = "emergency_stop"
            actuator.timestamp = timestamp
            self._publish_actuator_status(gpio)
            stopped_actuators.append(gpio)

        # Publish emergency stop to device-specific emergency topic
        # Topic: kaiser/god/esp/{esp_id}/actuator/emergency
        self.published_messages.append({
            "topic": f"kaiser/god/esp/{self.esp_id}/actuator/emergency",
            "payload": {
                "esp_id": self.esp_id,
                "stopped_actuators": stopped_actuators,
                "timestamp": timestamp
            }
        })
        
        # Publish emergency stop to broadcast topic (all ESPs should receive)
        # Topic: kaiser/broadcast/emergency
        self.published_messages.append({
            "topic": "kaiser/broadcast/emergency",
            "payload": {
                "esp_id": self.esp_id,
                "stopped_actuators": stopped_actuators,
                "timestamp": timestamp
            }
        })

        return {
            "status": "ok",
            "command": "emergency_stop",
            "stopped_actuators": stopped_actuators,
            "timestamp": timestamp
        }

    def _handle_reset(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle reset command."""
        self.actuators.clear()
        self.sensors.clear()
        self.published_messages.clear()

        return {
            "status": "ok",
            "command": "reset",
            "timestamp": time.time()
        }

    def _publish_actuator_status(self, gpio: int):
        """
        Simulate publishing actuator status to MQTT.
        
        NOTE: Uses REAL production topic structure:
        kaiser/god/esp/{esp_id}/actuator/{gpio}/status
        
        This is intentional - allows tests to validate authentic MQTT routing.
        """
        if gpio not in self.actuators:
            return

        actuator = self.actuators[gpio]
        message = {
            "topic": f"kaiser/god/esp/{self.esp_id}/actuator/{gpio}/status",
            "payload": {
                "gpio": gpio,
                "state": actuator.state,
                "pwm_value": actuator.pwm_value,
                "timestamp": actuator.timestamp
            }
        }

        self.published_messages.append(message)

        if self.on_publish:
            self.on_publish(message["topic"], message["payload"])

    def _publish_sensor_data(self, gpio: int):
        """
        Simulate publishing sensor data to MQTT.
        
        NOTE: Uses REAL production topic structure:
        kaiser/god/esp/{esp_id}/sensor/{gpio}/data
        
        This is intentional - allows tests to validate authentic MQTT routing.
        """
        if gpio not in self.sensors:
            return

        sensor = self.sensors[gpio]
        message = {
            "topic": f"kaiser/god/esp/{self.esp_id}/sensor/{gpio}/data",
            "payload": {
                "gpio": gpio,
                "raw_value": sensor.raw_value,
                "processed_value": sensor.processed_value,
                "timestamp": sensor.last_read
            }
        }

        self.published_messages.append(message)

        if self.on_publish:
            self.on_publish(message["topic"], message["payload"])

    # Test helper methods

    def get_actuator_state(self, gpio: int) -> Optional[ActuatorState]:
        """Get current actuator state (for test assertions)."""
        return self.actuators.get(gpio)

    def set_sensor_value(self, gpio: int, raw_value: float, sensor_type: str = "analog"):
        """Set sensor value for testing."""
        if gpio not in self.sensors:
            self.sensors[gpio] = SensorState(gpio=gpio, type=sensor_type, raw_value=raw_value)
        else:
            self.sensors[gpio].raw_value = raw_value
            self.sensors[gpio].last_read = time.time()

    def get_last_response(self) -> Optional[Dict[str, Any]]:
        """Get last command response."""
        return self.last_response

    def get_published_messages(self) -> list[Dict[str, Any]]:
        """Get all published messages (for test verification)."""
        return self.published_messages.copy()

    def clear_published_messages(self):
        """Clear published messages list."""
        self.published_messages.clear()

    def reset(self):
        """Reset mock to clean state."""
        self._handle_reset({})
        self.last_response = None
        self.connected = True
        self.last_heartbeat = time.time()

    def disconnect(self):
        """
        Disconnect mock client (no-op for API compatibility with RealESP32Client).
        
        Mock clients don't have real connections, but this method provides
        API compatibility for tests that use both Mock and Real clients.
        """
        self.connected = False
