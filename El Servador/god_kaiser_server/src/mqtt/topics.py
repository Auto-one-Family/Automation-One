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
            kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_ACTUATOR_COMMAND,
            esp_id=esp_id, gpio=gpio
        )

    @staticmethod
    def build_sensor_command_topic(esp_id: str, gpio: int) -> str:
        """
        Build topic for sensor commands (e.g., manual measurement trigger).

        Topic: kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command

        Args:
            esp_id: ESP device ID
            gpio: Sensor GPIO pin

        Returns:
            Full MQTT topic string
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_SENSOR_COMMAND,
            esp_id=esp_id, gpio=gpio
        )

    @staticmethod
    def build_sensor_response_topic(esp_id: str, gpio: int) -> str:
        """
        Build topic for sensor command responses.

        Topic: kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response

        Args:
            esp_id: ESP device ID
            gpio: Sensor GPIO pin

        Returns:
            Full MQTT topic string
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_SENSOR_RESPONSE,
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
            kaiser/{kaiser_id}/esp/{esp_id}/config/sensor/{gpio}
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_CONFIG_SENSOR,
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
            kaiser/{kaiser_id}/esp/{esp_id}/config/actuator/{gpio}
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_CONFIG_ACTUATOR,
            esp_id=esp_id, gpio=gpio
        )

    @staticmethod
    def build_config_topic(esp_id: str) -> str:
        """
        Build combined config topic for sensors and actuators.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/config
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_CONFIG,
            esp_id=esp_id
        )

    @staticmethod
    def build_system_command_topic(esp_id: str) -> str:
        """
        Build system command topic.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/system/command
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_SYSTEM_COMMAND,
            esp_id=esp_id
        )

    @staticmethod
    def build_pi_enhanced_response_topic(esp_id: str, gpio: int) -> str:
        """
        Build Pi-Enhanced response topic.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed
        """
        kaiser_id = constants.get_kaiser_id()
        return f"kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed"

    @staticmethod
    def build_mqtt_auth_update_topic(esp_id: str) -> str:
        """
        Build MQTT authentication update topic.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/mqtt/auth_update
        """
        return constants.get_topic_with_kaiser_id(
            "kaiser/{kaiser_id}/esp/{esp_id}/mqtt/auth_update",
            esp_id=esp_id
        )

    @staticmethod
    def build_zone_assign_topic(esp_id: str) -> str:
        """
        Build zone assignment topic.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/zone/assign
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_ESP_ZONE_ASSIGN,
            esp_id=esp_id
        )

    @staticmethod
    def get_zone_ack_subscription_pattern() -> str:
        """
        Get zone ACK subscription pattern with wildcard.

        Returns:
            kaiser/{kaiser_id}/esp/+/zone/ack
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_SUBSCRIBE_ESP_ZONE_ACK
        )

    # ====================================================================
    # BUILD METHODS (ESP → God-Kaiser - used by Mock ESPs)
    # ====================================================================

    @staticmethod
    def build_heartbeat_topic(esp_id: str, kaiser_id: str = "god") -> str:
        """
        Build heartbeat topic for ESP.

        Used by Mock ESPs to publish heartbeat messages.

        Args:
            esp_id: ESP device ID (e.g., ESP_12AB34CD)
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat"

    @staticmethod
    def build_sensor_data_topic(esp_id: str, gpio: int, kaiser_id: str = "god") -> str:
        """
        Build sensor data topic for ESP.

        Used by Mock ESPs to publish sensor data messages.

        Args:
            esp_id: ESP device ID (e.g., ESP_12AB34CD)
            gpio: GPIO pin number
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data"

    @staticmethod
    def build_sensor_batch_topic(esp_id: str, kaiser_id: str = "god") -> str:
        """
        Build sensor batch data topic for ESP.

        Used by Mock ESPs to publish batch sensor data messages.

        Args:
            esp_id: ESP device ID (e.g., ESP_12AB34CD)
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch"

    @staticmethod
    def build_actuator_status_topic(esp_id: str, gpio: int, kaiser_id: str = "god") -> str:
        """
        Build actuator status topic for ESP.

        Used by Mock ESPs to publish actuator status messages.

        Args:
            esp_id: ESP device ID (e.g., ESP_12AB34CD)
            gpio: GPIO pin number
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status"

    # ====================================================================
    # PARSE METHODS (ESP → God-Kaiser)
    # ====================================================================

    @staticmethod
    def parse_sensor_data_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse sensor data topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/sensor/34/data

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "type": "sensor_data"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
        # Accepts any kaiser_id (filtering happens at subscription level)
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/sensor/(\d+)/data"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "gpio": int(match.group(3)),
                "type": "sensor_data",
            }
        return None

    @staticmethod
    def parse_actuator_status_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse actuator status topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/actuator/18/status

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "gpio": 18,
                "type": "actuator_status"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/actuator/{gpio}/status
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/actuator/(\d+)/status"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "gpio": int(match.group(3)),
                "type": "actuator_status",
            }
        return None

    @staticmethod
    def parse_actuator_response_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse actuator response topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/actuator/18/response

        Returns:
            {
                "kaiser_id": str,
                "esp_id": "ESP_12AB34CD",
                "gpio": 18,
                "type": "actuator_response"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/actuator/{gpio}/response
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/actuator/(\d+)/response"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "gpio": int(match.group(3)),
                "type": "actuator_response",
            }
        return None

    @staticmethod
    def parse_actuator_alert_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse actuator alert topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/actuator/18/alert

        Returns:
            {
                "kaiser_id": str,
                "esp_id": "ESP_12AB34CD",
                "gpio": 18,
                "type": "actuator_alert"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/actuator/(\d+)/alert"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "gpio": int(match.group(3)),
                "type": "actuator_alert",
            }
        return None

    @staticmethod
    def parse_heartbeat_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse heartbeat topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/system/heartbeat
                   or kaiser/{kaiser_id}/esp/ESP_12AB34CD/heartbeat (legacy)

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "heartbeat"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/system/heartbeat (ESP32 v4.0+)
        # Also accepts: kaiser/{any_kaiser_id}/esp/{esp_id}/heartbeat (legacy)
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/(system/)?heartbeat"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "heartbeat",
            }
        return None

    @staticmethod
    def parse_lwt_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse LWT (Last-Will-Testament) topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/{esp_id}/system/will

        Returns:
            {
                "kaiser_id": str,
                "esp_id": str,
                "type": "lwt"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/system/will
        # Note: ESP32 builds this from heartbeat topic: /system/heartbeat -> /system/will
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/system/will"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "lwt",
            }
        return None

    @staticmethod
    def parse_health_status_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse health status topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/health/status

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "health_status"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/health/status
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/health/status"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "health_status",
            }
        return None

    @staticmethod
    def parse_config_response_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse config response topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/config_response

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "config_response"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/config_response
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/config_response"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "config_response",
            }
        return None

    @staticmethod
    def parse_discovery_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse discovery topic.

        Args:
            topic: kaiser/{kaiser_id}/discovery/esp32_nodes

        Returns:
            {
                "type": "discovery"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/discovery/esp32_nodes
        pattern = r"kaiser/([a-zA-Z0-9_]+)/discovery/esp32_nodes"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "type": "discovery",
            }
        return None

    @staticmethod
    def parse_system_error_topic(topic: str) -> Optional[Dict[str, Any]]:
        """
        Parse system error topic.

        Expected topic: kaiser/{kaiser_id}/esp/{esp_id}/system/error

        ESP32 publishes error events to this topic when hardware/config
        errors occur (e.g., DS18B20 sensor failures, GPIO conflicts).

        Args:
            topic: MQTT topic string

        Returns:
            {
                "kaiser_id": str,
                "esp_id": str,
                "type": "system_error"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/system/error
        pattern = r"^kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/system/error$"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "system_error",
            }
        return None

    @staticmethod
    def parse_pi_enhanced_request_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse Pi-Enhanced request topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/pi_enhanced/request

        Returns:
            {
                "esp_id": "ESP_12AB34CD",
                "type": "pi_enhanced_request"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/pi_enhanced/request
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/pi_enhanced/request"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "pi_enhanced_request",
            }
        return None

    @staticmethod
    def parse_zone_ack_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse zone ACK topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/zone/ack

        Returns:
            {
                "kaiser_id": "god",
                "esp_id": "ESP_12AB34CD",
                "type": "zone_ack"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/zone/ack
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/zone/ack"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "zone_ack",
            }
        return None

    # ====================================================================
    # SUBZONE TOPIC METHODS (Phase 9)
    # ====================================================================

    @staticmethod
    def build_subzone_assign_topic(esp_id: str) -> str:
        """
        Build subzone assignment topic.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_SUBZONE_ASSIGN,
            esp_id=esp_id
        )

    @staticmethod
    def build_subzone_remove_topic(esp_id: str) -> str:
        """
        Build subzone removal topic.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_SUBZONE_REMOVE,
            esp_id=esp_id
        )

    @staticmethod
    def build_subzone_safe_topic(esp_id: str) -> str:
        """
        Build subzone safe-mode topic.

        Args:
            esp_id: ESP device ID

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_TOPIC_SUBZONE_SAFE,
            esp_id=esp_id
        )

    @staticmethod
    def get_subzone_ack_subscription_pattern() -> str:
        """
        Get subzone ACK subscription pattern with wildcard.

        Returns:
            kaiser/{kaiser_id}/esp/+/subzone/ack
        """
        return constants.get_topic_with_kaiser_id(
            constants.MQTT_SUBSCRIBE_SUBZONE_ACK
        )

    @staticmethod
    def parse_subzone_ack_topic(topic: str) -> Optional[Dict[str, any]]:
        """
        Parse subzone ACK topic.

        Args:
            topic: kaiser/{kaiser_id}/esp/ESP_12AB34CD/subzone/ack

        Returns:
            {
                "kaiser_id": "god",
                "esp_id": "ESP_12AB34CD",
                "type": "subzone_ack"
            }
            or None if parse fails
        """
        # Pattern: kaiser/{any_kaiser_id}/esp/{esp_id}/subzone/ack
        pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/subzone/ack"
        match = re.match(pattern, topic)

        if match:
            return {
                "kaiser_id": match.group(1),
                "esp_id": match.group(2),
                "type": "subzone_ack",
            }
        return None

    # ====================================================================
    # ADDITIONAL BUILD METHODS (for Mock-ESP and Testing)
    # ====================================================================

    @staticmethod
    def build_actuator_response_topic(esp_id: str, gpio: int, kaiser_id: str = "god") -> str:
        """
        Build actuator command response topic.

        Used by ESPs to acknowledge actuator commands.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response"

    @staticmethod
    def build_actuator_alert_topic(esp_id: str, gpio: int, kaiser_id: str = "god") -> str:
        """
        Build actuator alert topic.

        Used by ESPs to publish actuator alerts (warnings, errors).

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert"

    @staticmethod
    def build_actuator_emergency_topic(esp_id: str, kaiser_id: str = "god") -> str:
        """
        Build actuator emergency stop topic.

        Used by ESPs to publish emergency stop events.

        Args:
            esp_id: ESP device ID
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency"

    @staticmethod
    def build_system_response_topic(esp_id: str, kaiser_id: str = "god") -> str:
        """
        Build system command response topic.

        Used by ESPs to acknowledge system commands.

        Args:
            esp_id: ESP device ID
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/system/response
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/system/response"

    @staticmethod
    def build_system_diagnostics_topic(esp_id: str, kaiser_id: str = "god") -> str:
        """
        Build system diagnostics topic.

        Used by ESPs to publish diagnostic information.

        Args:
            esp_id: ESP device ID
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics"

    @staticmethod
    def build_library_event_topic(esp_id: str, event: str, kaiser_id: str = "god") -> str:
        """
        Build library event topic.

        Used by ESPs to publish library management events (ready, installed, error).

        Args:
            esp_id: ESP device ID
            event: Event type ("ready", "installed", "error", "request")
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/library/{event}
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/library/{event}"

    @staticmethod
    def build_safe_mode_topic(esp_id: str, kaiser_id: str = "god") -> str:
        """
        Build safe mode status topic.

        Used by ESPs to publish safe mode entry/exit events.

        Args:
            esp_id: ESP device ID
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/esp/{esp_id}/safe_mode
        """
        return f"kaiser/{kaiser_id}/esp/{esp_id}/safe_mode"

    @staticmethod
    def build_subzone_sensor_data_topic(
        esp_id: str,
        gpio: int,
        master_zone_id: str,
        subzone_id: str,
        kaiser_id: str = "god"
    ) -> str:
        """
        Build subzone sensor data topic.

        Used by ESPs to publish sensor data within a subzone context.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            master_zone_id: Master zone ID
            subzone_id: Subzone ID
            kaiser_id: Kaiser ID (default: "god")

        Returns:
            kaiser/{kaiser_id}/zone/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data
        """
        return f"kaiser/{kaiser_id}/zone/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data"

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
            cls.parse_actuator_response_topic,
            cls.parse_actuator_alert_topic,
            cls.parse_heartbeat_topic,
            cls.parse_lwt_topic,
            cls.parse_health_status_topic,
            cls.parse_config_response_topic,
            cls.parse_discovery_topic,
            cls.parse_system_error_topic,
            cls.parse_pi_enhanced_request_topic,
            cls.parse_zone_ack_topic,
            cls.parse_subzone_ack_topic,
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
