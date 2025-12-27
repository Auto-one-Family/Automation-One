"""
MQTT Publisher

High-level publishing interface with QoS management and retry logic.

Includes resilience patterns:
- Circuit Breaker integration via MQTTClient
- Exponential backoff retry
- Configurable timeouts
"""

import json
import time
from typing import Any, Dict, Optional

from ..core import constants
from ..core.config import get_settings
from ..core.logging_config import get_logger
from ..core.resilience import (
    ResilienceRegistry,
    calculate_backoff_delay,
)
from .client import MQTTClient
from .topics import TopicBuilder

logger = get_logger(__name__)


class Publisher:
    """
    High-level MQTT Publisher.

    Provides convenience methods for publishing common message types
    with appropriate QoS levels and retry logic.
    
    Includes resilience patterns:
    - Uses MQTTClient's circuit breaker
    - Exponential backoff retry with configurable parameters
    - Metrics for monitoring
    """

    def __init__(self, mqtt_client: Optional[MQTTClient] = None):
        """
        Initialize Publisher.

        Args:
            mqtt_client: MQTT client instance (uses singleton if None)
        """
        self.client = mqtt_client or MQTTClient.get_instance()
        
        # Load resilience settings
        settings = get_settings()
        self.max_retries = settings.resilience.retry_max_attempts
        self.base_delay = settings.resilience.retry_base_delay
        self.max_delay = settings.resilience.retry_max_delay
        self.exponential_base = settings.resilience.retry_exponential_base
        self.jitter_enabled = settings.resilience.retry_jitter_enabled
        
        # Metrics
        self._publish_attempts = 0
        self._publish_successes = 0
        self._publish_failures = 0

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

    def publish_config(
        self,
        esp_id: str,
        config: Dict[str, Any],
        retry: bool = True,
    ) -> bool:
        """
        Publish combined sensor/actuator configuration to ESP32.

        Publishes configuration in ESP32-compatible format:
        {
            "sensors": [...],
            "actuators": [...],
            "timestamp": int
        }

        Args:
            esp_id: ESP device ID (e.g., ESP_12AB34CD)
            config: Configuration dict with "sensors" and/or "actuators" arrays
            retry: Enable retry on failure

        Returns:
            True if publish successful

        Note:
            Uses combined config topic: kaiser/{kaiser_id}/esp/{esp_id}/config
            This is the topic ESP32 expects (not individual GPIO topics).
        """
        topic = TopicBuilder.build_config_topic(esp_id)
        
        # Build payload with timestamp
        payload = {
            **config,
            "timestamp": int(time.time()),
        }

        qos = constants.QOS_CONFIG  # QoS 2 (Exactly once)

        # Extract counts for logging
        sensor_count = len(config.get("sensors", []))
        actuator_count = len(config.get("actuators", []))
        
        logger.info(
            f"Publishing config to {esp_id}: "
            f"{sensor_count} sensor(s), {actuator_count} actuator(s)"
        )
        
        success = self._publish_with_retry(topic, payload, qos, retry)
        
        if success:
            logger.info(
                f"✅ Config published successfully to {esp_id}: "
                f"{sensor_count} sensor(s), {actuator_count} actuator(s)"
            )
        else:
            logger.error(
                f"❌ Config publish failed for {esp_id}: "
                f"{sensor_count} sensor(s), {actuator_count} actuator(s)"
            )
        
        return success

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
        Publish message with exponential backoff retry logic.

        Args:
            topic: MQTT topic
            payload: Message payload (dict)
            qos: QoS level
            retry: Enable retry on failure

        Returns:
            True if publish successful
        
        Note:
            Uses exponential backoff with optional jitter to prevent thundering herd.
            Circuit breaker protection is handled by MQTTClient.publish()
        """
        # Convert payload to JSON string
        try:
            payload_str = json.dumps(payload)
        except Exception as e:
            logger.error(f"Failed to serialize payload: {e}", exc_info=True)
            self._publish_failures += 1
            return False

        # Attempt publish with exponential backoff
        attempts = self.max_retries if retry else 1

        for attempt in range(1, attempts + 1):
            self._publish_attempts += 1
            success = self.client.publish(topic, payload_str, qos)

            if success:
                self._publish_successes += 1
                return True

            # Retry logic with exponential backoff
            if attempt < attempts:
                delay = calculate_backoff_delay(
                    attempt=attempt - 1,  # 0-indexed
                    base_delay=self.base_delay,
                    max_delay=self.max_delay,
                    exponential_base=self.exponential_base,
                    jitter=self.jitter_enabled,
                )
                logger.warning(
                    f"[resilience] Publisher: Publish failed "
                    f"(attempt {attempt}/{attempts}), retrying in {delay:.2f}s..."
                )
                time.sleep(delay)
            else:
                logger.error(
                    f"[resilience] Publisher: Publish failed after {attempts} attempts: {topic}"
                )
                self._publish_failures += 1
                return False

        self._publish_failures += 1
        return False
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get publisher metrics.
        
        Returns:
            Dictionary with publish statistics
        """
        return {
            "publish_attempts": self._publish_attempts,
            "publish_successes": self._publish_successes,
            "publish_failures": self._publish_failures,
            "success_rate": (
                self._publish_successes / self._publish_attempts * 100
                if self._publish_attempts > 0 else 0.0
            ),
            "config": {
                "max_retries": self.max_retries,
                "base_delay": self.base_delay,
                "max_delay": self.max_delay,
                "exponential_base": self.exponential_base,
                "jitter_enabled": self.jitter_enabled,
            },
        }
