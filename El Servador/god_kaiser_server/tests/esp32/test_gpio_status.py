"""
Tests for GPIO status in Mock ESP32 heartbeat.

Verifies that MockESP32Client produces gpio_status matching real ESP32 behavior.
"""
import pytest
from tests.esp32.mocks.mock_esp32_client import MockESP32Client, BrokerMode


@pytest.fixture
def mock_esp():
    """Create mock ESP32 with some sensors and actuators."""
    client = MockESP32Client(
        esp_id="MOCK_GPIO_TEST",
        kaiser_id="god",
        broker_mode=BrokerMode.DIRECT
    )
    return client


class TestMockHeartbeatGpioStatus:
    """Test GPIO status in Mock ESP32 heartbeat."""

    def test_heartbeat_contains_gpio_fields(self, mock_esp):
        """Test that heartbeat includes gpio_status and gpio_reserved_count."""
        # Add a sensor
        mock_esp.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="DS18B20")

        # Trigger heartbeat
        mock_esp.handle_command("heartbeat", {})

        # Get the published heartbeat
        messages = mock_esp.get_messages_by_topic_pattern("heartbeat")
        assert len(messages) > 0

        heartbeat = messages[-1]["payload"]
        assert "gpio_status" in heartbeat, "Heartbeat missing gpio_status field"
        assert "gpio_reserved_count" in heartbeat, "Heartbeat missing gpio_reserved_count field"

    def test_gpio_status_includes_sensors(self, mock_esp):
        """Test that GPIO status includes registered sensors."""
        mock_esp.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="DS18B20")
        mock_esp.set_sensor_value(gpio=5, raw_value=25.0, sensor_type="analog")

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        gpio_pins = [item["gpio"] for item in heartbeat["gpio_status"]]
        assert 4 in gpio_pins, "Sensor GPIO 4 not in gpio_status"
        assert 5 in gpio_pins, "Sensor GPIO 5 not in gpio_status"

    def test_gpio_status_includes_actuators(self, mock_esp):
        """Test that GPIO status includes registered actuators."""
        mock_esp.configure_zone("test_zone", "main")  # Required for actuator control
        mock_esp.configure_actuator(gpio=14, actuator_type="pump")
        mock_esp.configure_actuator(gpio=15, actuator_type="valve")

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        actuator_items = [
            item for item in heartbeat["gpio_status"]
            if item["owner"] == "actuator"
        ]
        gpio_pins = [item["gpio"] for item in actuator_items]
        assert 14 in gpio_pins, "Actuator GPIO 14 not in gpio_status"
        assert 15 in gpio_pins, "Actuator GPIO 15 not in gpio_status"

    def test_gpio_status_owner_types(self, mock_esp):
        """Test that GPIO status has correct owner types."""
        mock_esp.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="SHT31")  # I2C sensor
        mock_esp.configure_zone("test_zone", "main")
        mock_esp.configure_actuator(gpio=14, actuator_type="pump")

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        owners = set(item["owner"] for item in heartbeat["gpio_status"])
        assert "sensor" in owners, "No sensor owner in gpio_status"
        assert "actuator" in owners, "No actuator owner in gpio_status"
        # I2C sensor should trigger system pins
        assert "system" in owners, "No system owner (I2C) in gpio_status"

    def test_gpio_reserved_count_matches_array(self, mock_esp):
        """Test that gpio_reserved_count matches array length."""
        mock_esp.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="DS18B20")
        mock_esp.set_sensor_value(gpio=5, raw_value=25.0, sensor_type="analog")

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        assert heartbeat["gpio_reserved_count"] == len(heartbeat["gpio_status"])

    def test_emergency_stopped_actuator_marked_safe(self, mock_esp):
        """Test that emergency-stopped actuators have safe=True."""
        mock_esp.configure_zone("test_zone", "main")
        mock_esp.configure_actuator(gpio=14, actuator_type="pump")

        # Emergency stop
        mock_esp.handle_command("emergency_stop", {"reason": "test"})

        # Heartbeat
        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        actuator_status = next(
            (item for item in heartbeat["gpio_status"] if item["gpio"] == 14),
            None
        )
        assert actuator_status is not None
        assert actuator_status["safe"] is True, "Emergency-stopped actuator should have safe=True"

    def test_i2c_pins_for_i2c_sensors(self, mock_esp):
        """Test that I2C sensor triggers I2C system pins."""
        mock_esp.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="SHT31")  # I2C sensor

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        system_pins = [
            item for item in heartbeat["gpio_status"]
            if item["owner"] == "system"
        ]
        gpio_pins = [item["gpio"] for item in system_pins]

        assert 21 in gpio_pins, "I2C_SDA (GPIO 21) should be in gpio_status"
        assert 22 in gpio_pins, "I2C_SCL (GPIO 22) should be in gpio_status"

    def test_no_gpio_status_when_empty(self, mock_esp):
        """Test that empty ESP has empty gpio_status array."""
        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        assert heartbeat["gpio_status"] == []
        assert heartbeat["gpio_reserved_count"] == 0

    def test_sensor_mode_is_input(self, mock_esp):
        """Test that sensors have mode=0 (INPUT)."""
        mock_esp.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="DS18B20")

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        sensor_status = next(
            (item for item in heartbeat["gpio_status"] if item["gpio"] == 4),
            None
        )
        assert sensor_status is not None
        assert sensor_status["mode"] == 0, "Sensor should have mode=0 (INPUT)"

    def test_actuator_mode_is_output(self, mock_esp):
        """Test that actuators have mode=1 (OUTPUT)."""
        mock_esp.configure_zone("test_zone", "main")
        mock_esp.configure_actuator(gpio=14, actuator_type="pump")

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        actuator_status = next(
            (item for item in heartbeat["gpio_status"] if item["gpio"] == 14),
            None
        )
        assert actuator_status is not None
        assert actuator_status["mode"] == 1, "Actuator should have mode=1 (OUTPUT)"

    def test_non_i2c_sensor_no_system_pins(self, mock_esp):
        """Test that non-I2C sensors don't add I2C system pins."""
        mock_esp.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="DS18B20")  # OneWire, not I2C
        mock_esp.set_sensor_value(gpio=5, raw_value=512, sensor_type="analog")  # Analog, not I2C

        mock_esp.handle_command("heartbeat", {})
        heartbeat = mock_esp.get_messages_by_topic_pattern("heartbeat")[-1]["payload"]

        system_pins = [
            item for item in heartbeat["gpio_status"]
            if item["owner"] == "system"
        ]
        assert len(system_pins) == 0, "Non-I2C sensors should not add system pins"
