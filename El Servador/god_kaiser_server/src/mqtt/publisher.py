"""
MQTT Publisher

High-level publishing interface with QoS management and retry logic.
"""

import json
import time
from typing import Any, Dict, Optional

from ..core import constants
from ..core.logging_config import get_logger
from .client import MQTTClient
from .topics import TopicBuilder

logger = get_logger(__name__)


class Publisher:
    """
    High-level MQTT Publisher.

    Provides convenience methods for publishing common message types
    with appropriate QoS levels and retry logic.
    """

    def __init__(self, mqtt_client: Optional[MQTTClient] = None):
        """
        Initialize Publisher.

        Args:
            mqtt_client: MQTT client instance (uses singleton if None)
        """
        self.client = mqtt_client or MQTTClient.get_instance()
        self.max_retries = 3
        self.retry_delay = 1  # seconds

    def publish_actuator_command(
        self,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        duration: int = 0,
        retry: bool = True,
    ) -> bool:
        """
        Publish actuator command to ESP.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            command: Command type (ON, OFF, PWM, TOGGLE)
            value: Command value (0.0-1.0 for PWM, 0.0/1.0 for binary)
            duration: Duration in seconds (0 = unlimited)
            retry: Enable retry on failure

        Returns:
            True if publish successful
        """
        topic = TopicBuilder.build_actuator_command_topic(esp_id, gpio)
        payload = {
            "command": command.upper(),
            "value": value,
            "duration": duration,
            "timestamp": int(time.time()),
        }

        qos = constants.QOS_ACTUATOR_COMMAND  # QoS 2 (Exactly once)

        logger.info(f"Publishing actuator command to {esp_id} GPIO {gpio}: {command} (value={value})")
        return self._publish_with_retry(topic, payload, qos, retry)

    def publish_sensor_config(
        self,
        esp_id: str,
        gpio: int,
        sensor_config: Dict[str, Any],
        retry: bool = True,
    ) -> bool:
        """
        Publish sensor configuration to ESP.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            sensor_config: Sensor configuration dict
            retry: Enable retry on failure

        Returns:
            True if publish successful
        """
        topic = TopicBuilder.build_sensor_config_topic(esp_id, gpio)
        payload = {
            **sensor_config,
            "timestamp": int(time.time()),
        }

        qos = constants.QOS_CONFIG  # QoS 2 (Exactly once)

        logger.info(f"Publishing sensor config to {esp_id} GPIO {gpio}")
        return self._publish_with_retry(topic, payload, qos, retry)

    def publish_actuator_config(
        self,
        esp_id: str,
        gpio: int,
        actuator_config: Dict[str, Any],
        retry: bool = True,
    ) -> bool:
        """
        Publish actuator configuration to ESP.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            actuator_config: Actuator configuration dict
            retry: Enable retry on failure

        Returns:
            True if publish successful
        """
        topic = TopicBuilder.build_actuator_config_topic(esp_id, gpio)
        payload = {
            **actuator_config,
            "timestamp": int(time.time()),
        }

        qos = constants.QOS_CONFIG  # QoS 2 (Exactly once)

        logger.info(f"Publishing actuator config to {esp_id} GPIO {gpio}")
        return self._publish_with_retry(topic, payload, qos, retry)

    def publish_system_command(
        self,
        esp_id: str,
        command: str,
        params: Optional[Dict[str, Any]] = None,
        retry: bool = True,
    ) -> bool:
        """
        Publish system command to ESP.

        Args:
            esp_id: ESP device ID
            command: System command (REBOOT, OTA_UPDATE, FACTORY_RESET, etc.)
            params: Optional command parameters
            retry: Enable retry on failure

        Returns:
            True if publish successful
        """
        topic = TopicBuilder.build_system_command_topic(esp_id)
        payload = {
            "command": command.upper(),
            "params": params or {},
            "timestamp": int(time.time()),
        }

        qos = constants.QOS_CONFIG  # QoS 2 (Exactly once)

        logger.info(f"Publishing system command to {esp_id}: {command}")
        return self._publish_with_retry(topic, payload, qos, retry)

    def publish_pi_enhanced_response(
        self,
        esp_id: str,
        gpio: int,
        processed_value: float,
        unit: str,
        quality: str,
        retry: bool = False,
    ) -> bool:
        """
        Publish Pi-Enhanced processing result to ESP.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            processed_value: Processed sensor value
            unit: Measurement unit
            quality: Data quality (excellent, good, fair, poor, bad)
            retry: Enable retry on failure

        Returns:
            True if publish successful
        """
        topic = TopicBuilder.build_pi_enhanced_response_topic(esp_id, gpio)
        payload = {
            "processed_value": processed_value,
            "unit": unit,
            "quality": quality,
            "timestamp": int(time.time()),
        }

        qos = constants.QOS_SENSOR_DATA  # QoS 1 (At least once)

        logger.debug(f"Publishing Pi-Enhanced response to {esp_id} GPIO {gpio}: {processed_value} {unit}")
        return self._publish_with_retry(topic, payload, qos, retry)

    def _publish_with_retry(
        self,
        topic: str,
        payload: Dict[str, Any],
        qos: int,
        retry: bool,
    ) -> bool:
        """
        Publish message with retry logic.

        Args:
            topic: MQTT topic
            payload: Message payload (dict)
            qos: QoS level
            retry: Enable retry on failure

        Returns:
            True if publish successful
        """
        # Convert payload to JSON string
        try:
            payload_str = json.dumps(payload)
        except Exception as e:
            logger.error(f"Failed to serialize payload: {e}", exc_info=True)
            return False

        # Attempt publish
        attempts = self.max_retries if retry else 1

        for attempt in range(1, attempts + 1):
            success = self.client.publish(topic, payload_str, qos)

            if success:
                return True

            # Retry logic
            if attempt < attempts:
                logger.warning(f"Publish failed (attempt {attempt}/{attempts}), retrying in {self.retry_delay}s...")
                time.sleep(self.retry_delay)
            else:
                logger.error(f"Publish failed after {attempts} attempts")
                return False

        return False
