"""
MQTT Topic Builder and Parser

Provides functions for building and parsing MQTT topic strings
based on the God-Kaiser Protocol.

Uses topic templates from constants.py to ensure consistency
with ESP32 firmware.
"""

import re
from typing import Dict, Optional

from ..core import constants
from ..core.logging_config import get_logger

logger = get_logger(__name__)


class TopicBuilder:
    """
    MQTT Topic Builder.

    Builds topic strings from templates and parses incoming topics.
    Ensures consistency with ESP32 MQTT protocol.
    """

    # ====================================================================
    # BUILD METHODS (God-Kaiser → ESP)
    # ====================================================================

    @staticmethod
    def build_actuator_command_topic(esp_id: str, gpio: int) -> str:
        """
        Build actuator command topic.

        Args:
            esp_id: ESP device ID (e.g., ESP_12AB34CD)
            gpio: GPIO pin number

        Returns:
            kaiser/god/esp/{esp_id}/actuator/{gpio}/command
        """
        return constants.MQTT_TOPIC_ESP_ACTUATOR_COMMAND.format(
            esp_id=esp_id, gpio=gpio
        )

    @staticmethod
    def build_sensor_config_topic(esp_id: str, gpio: int) -> str:
        """
        Build sensor config topic.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number

        Returns:
            kaiser/god/esp/{esp_id}/config/sensor/{gpio}
        """
        return constants.MQTT_TOPIC_ESP_CONFIG_SENSOR.format(
            esp_id=esp_id, gpio=gpio
        )

    @staticmethod
    def build_actuator_config_topic(esp_id: str, gpio: int) -> str:
        """
        Build actuator config topic.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number

        Returns:
            kaiser/god/esp/{esp_id}/config/actuator/{gpio}
        """
        return constants.MQTT_TOPIC_ESP_CONFIG_ACTUATOR.format(
            esp_id=esp_id, gpio=gpio
        )

    @staticmethod
    def build_system_command_topic(esp_id: str) -> str:
        """
        Build system command topic.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/god/esp/{esp_id}/system/command
        """
        return constants.MQTT_TOPIC_ESP_SYSTEM_COMMAND.format(esp_id=esp_id)

    @staticmethod
    def build_pi_enhanced_response_topic(esp_id: str, gpio: int) -> str:
        """
        Build Pi-Enhanced response topic.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number

        Returns:
            kaiser/god/esp/{esp_id}/sensor/{gpio}/processed
        """
        return f"kaiser/god/esp/{esp_id}/sensor/{gpio}/processed"

    # ====================================================================
    # PARSE METHODS (ESP → God-Kaiser)
    # ====================================================================

    @staticmethod
    def parse_sensor_data_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse sensor data topic.

        Args:
            topic: kaiser/god/esp/ESP_12AB34CD/sensor/34/data

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "type": "sensor_data"
            }
            or None if parse fails
        """
        # Pattern: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
        pattern = r"kaiser/god/esp/([A-Z0-9_]+)/sensor/(\d+)/data"
        match = re.match(pattern, topic)

        if match:
            return {
                "esp_id": match.group(1),
                "gpio": int(match.group(2)),
                "type": "sensor_data",
            }
        return None

    @staticmethod
    def parse_actuator_status_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse actuator status topic.

        Args:
            topic: kaiser/god/esp/ESP_12AB34CD/actuator/18/status

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "gpio": 18,
                "type": "actuator_status"
            }
            or None if parse fails
        """
        # Pattern: kaiser/god/esp/{esp_id}/actuator/{gpio}/status
        pattern = r"kaiser/god/esp/([A-Z0-9_]+)/actuator/(\d+)/status"
        match = re.match(pattern, topic)

        if match:
            return {
                "esp_id": match.group(1),
                "gpio": int(match.group(2)),
                "type": "actuator_status",
            }
        return None

    @staticmethod
    def parse_heartbeat_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse heartbeat topic.

        Args:
            topic: kaiser/god/esp/ESP_12AB34CD/heartbeat

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "heartbeat"
            }
            or None if parse fails
        """
        # Pattern: kaiser/god/esp/{esp_id}/heartbeat
        pattern = r"kaiser/god/esp/([A-Z0-9_]+)/heartbeat"
        match = re.match(pattern, topic)

        if match:
            return {
                "esp_id": match.group(1),
                "type": "heartbeat",
            }
        return None

    @staticmethod
    def parse_health_status_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse health status topic.

        Args:
            topic: kaiser/god/esp/ESP_12AB34CD/health/status

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "health_status"
            }
            or None if parse fails
        """
        # Pattern: kaiser/god/esp/{esp_id}/health/status
        pattern = r"kaiser/god/esp/([A-Z0-9_]+)/health/status"
        match = re.match(pattern, topic)

        if match:
            return {
                "esp_id": match.group(1),
                "type": "health_status",
            }
        return None

    @staticmethod
    def parse_config_ack_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse config ACK topic.

        Args:
            topic: kaiser/god/esp/ESP_12AB34CD/config/ack

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "config_ack"
            }
            or None if parse fails
        """
        # Pattern: kaiser/god/esp/{esp_id}/config/ack
        pattern = r"kaiser/god/esp/([A-Z0-9_]+)/config/ack"
        match = re.match(pattern, topic)

        if match:
            return {
                "esp_id": match.group(1),
                "type": "config_ack",
            }
        return None

    @staticmethod
    def parse_discovery_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse discovery topic.

        Args:
            topic: kaiser/god/discovery/esp32_nodes

        Returns:
            {
                "type": "discovery"
            }
            or None if parse fails
        """
        if topic == constants.MQTT_TOPIC_ESP_DISCOVERY:
            return {"type": "discovery"}
        return None

    @staticmethod
    def parse_pi_enhanced_request_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse Pi-Enhanced request topic.

        Args:
            topic: kaiser/god/esp/ESP_12AB34CD/pi_enhanced/request

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "pi_enhanced_request"
            }
            or None if parse fails
        """
        # Pattern: kaiser/god/esp/{esp_id}/pi_enhanced/request
        pattern = r"kaiser/god/esp/([A-Z0-9_]+)/pi_enhanced/request"
        match = re.match(pattern, topic)

        if match:
            return {
                "esp_id": match.group(1),
                "type": "pi_enhanced_request",
            }
        return None

    # ====================================================================
    # GENERIC PARSE METHOD
    # ====================================================================

    @classmethod
    def parse_topic(cls, topic: str) -> Optional[Dict[str, any]]:
        """
        Parse any incoming topic.

        Tries all parsing methods and returns first successful match.

        Args:
            topic: MQTT topic string

        Returns:
            Parsed topic dict or None if no match
        """
        # Try all parsers
        parsers = [
            cls.parse_sensor_data_topic,
            cls.parse_actuator_status_topic,
            cls.parse_heartbeat_topic,
            cls.parse_health_status_topic,
            cls.parse_config_ack_topic,
            cls.parse_discovery_topic,
            cls.parse_pi_enhanced_request_topic,
        ]

        for parser in parsers:
            result = parser(topic)
            if result:
                logger.debug(f"Parsed topic '{topic}' as type '{result['type']}'")
                return result

        logger.warning(f"Unknown topic pattern: {topic}")
        return None

    # ====================================================================
    # VALIDATION METHODS
    # ====================================================================

    @staticmethod
    def validate_esp_id(esp_id: str) -> bool:
        """
        Validate ESP ID format.

        Args:
            esp_id: ESP device ID (e.g., ESP_12AB34CD)

        Returns:
            True if valid format
        """
        # Pattern: ESP_{8 alphanumeric chars}
        pattern = r"^ESP_[A-Z0-9]{8}$"
        return bool(re.match(pattern, esp_id))

    @staticmethod
    def validate_gpio(gpio: int, hardware_type: str = "ESP32_WROOM") -> bool:
        """
        Validate GPIO pin number for hardware type.

        Args:
            gpio: GPIO pin number
            hardware_type: Hardware type (ESP32_WROOM, XIAO_ESP32_C3)

        Returns:
            True if valid GPIO for hardware
        """
        if hardware_type == constants.HARDWARE_TYPE_ESP32_WROOM:
            return gpio in constants.GPIO_RANGE_ESP32_WROOM and gpio not in constants.GPIO_RESERVED_ESP32_WROOM
        elif hardware_type == constants.HARDWARE_TYPE_XIAO_ESP32_C3:
            return gpio in constants.GPIO_RANGE_XIAO_ESP32_C3 and gpio not in constants.GPIO_RESERVED_XIAO_ESP32_C3
        else:
            logger.error(f"Unknown hardware type: {hardware_type}")
            return False

    @staticmethod
    def matches_subscription(topic: str, subscription_pattern: str) -> bool:
        """
        Check if topic matches subscription pattern.

        Supports MQTT wildcards:
        - + (single level wildcard)
        - # (multi level wildcard)

        Args:
            topic: Actual topic (e.g., kaiser/god/esp/ESP_12AB/sensor/34/data)
            subscription_pattern: Pattern (e.g., kaiser/god/esp/+/sensor/+/data)

        Returns:
            True if topic matches pattern
        """
        # Convert MQTT wildcard pattern to regex
        # + matches single level (no /)
        # # matches multiple levels (including /)
        regex_pattern = subscription_pattern.replace("+", r"[^/]+")
        regex_pattern = regex_pattern.replace("#", r".*")
        regex_pattern = f"^{regex_pattern}$"

        return bool(re.match(regex_pattern, topic))
