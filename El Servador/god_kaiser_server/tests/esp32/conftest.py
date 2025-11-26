"""
Pytest fixtures for ESP32 orchestrated tests.

Provides:
- mock_esp32: MockESP32Client for hardware-independent tests
- real_esp32: Connection to real ESP32 device (optional, skipped if unavailable)
- mqtt_test_client: MQTT client for test orchestration
"""

import pytest
import os
from typing import Optional

from .mocks.mock_esp32_client import MockESP32Client


@pytest.fixture
def mock_esp32():
    """
    Provide a MockESP32Client for hardware-independent tests.

    Usage:
        def test_actuator_control(mock_esp32):
            response = mock_esp32.handle_command("actuator_set", {"gpio": 5, "value": 1})
            assert response["status"] == "ok"
    """
    mock = MockESP32Client(
        esp_id="test-esp-001",
        kaiser_id="test-kaiser-001"
    )

    yield mock

    # Cleanup
    mock.reset()


@pytest.fixture
def mock_esp32_with_actuators():
    """
    Provide a MockESP32Client with pre-configured actuators.

    Pre-configured actuators:
    - GPIO 5: Pump (digital)
    - GPIO 6: Valve (digital)
    - GPIO 7: PWM Motor (pwm)
    """
    mock = MockESP32Client(esp_id="test-esp-002", kaiser_id="test-kaiser-001")

    # Pre-configure actuators
    mock.handle_command("actuator_set", {"gpio": 5, "value": 0, "mode": "digital"})
    mock.handle_command("actuator_set", {"gpio": 6, "value": 0, "mode": "digital"})
    mock.handle_command("actuator_set", {"gpio": 7, "value": 0.0, "mode": "pwm"})

    # Clear published messages from setup
    mock.clear_published_messages()

    yield mock

    mock.reset()


@pytest.fixture
def mock_esp32_with_sensors():
    """
    Provide a MockESP32Client with pre-configured sensors.

    Pre-configured sensors:
    - GPIO 34: Analog sensor (moisture)
    - GPIO 35: Analog sensor (temperature)
    - GPIO 36: Digital sensor (flow)
    """
    mock = MockESP32Client(esp_id="test-esp-003", kaiser_id="test-kaiser-001")

    # Pre-configure sensors with mock values
    mock.set_sensor_value(gpio=34, raw_value=2048.0, sensor_type="analog")  # Moisture
    mock.set_sensor_value(gpio=35, raw_value=1500.0, sensor_type="analog")  # Temperature
    mock.set_sensor_value(gpio=36, raw_value=1.0, sensor_type="digital")     # Flow

    yield mock

    mock.reset()


@pytest.fixture
def multiple_mock_esp32():
    """
    Provide 3 MockESP32Clients for cross-ESP testing.
    
    Uses REAL MQTT topic structure for authentic routing validation.
    
    Pre-configured ESPs:
    - esp-001: 2 actuators (pump, valve) on GPIO 5, 6
    - esp-002: 3 sensors (moisture, temp, flow) on GPIO 34, 35, 36
    - esp-003: Mixed (1 actuator, 2 sensors) on GPIO 5, 34, 35
    
    Usage:
        def test_cross_esp(multiple_mock_esp32):
            esps = multiple_mock_esp32
            # Read sensor on ESP-002
            sensor_data = esps["esp2"].handle_command("sensor_read", {"gpio": 34})
            # Control actuator on ESP-001
            esps["esp1"].handle_command("actuator_set", {"gpio": 5, "value": 1, "mode": "digital"})
    """
    esp1 = MockESP32Client(esp_id="test-esp-001", kaiser_id="test-kaiser-001")
    esp2 = MockESP32Client(esp_id="test-esp-002", kaiser_id="test-kaiser-001")
    esp3 = MockESP32Client(esp_id="test-esp-003", kaiser_id="test-kaiser-001")
    
    # Pre-configure ESP-001 with actuators
    esp1.handle_command("actuator_set", {"gpio": 5, "value": 0, "mode": "digital"})  # Pump
    esp1.handle_command("actuator_set", {"gpio": 6, "value": 0, "mode": "digital"})  # Valve
    
    # Pre-configure ESP-002 with sensors
    esp2.set_sensor_value(gpio=34, raw_value=2048.0, sensor_type="analog")   # Moisture
    esp2.set_sensor_value(gpio=35, raw_value=1500.0, sensor_type="analog")   # Temperature
    esp2.set_sensor_value(gpio=36, raw_value=1.0, sensor_type="digital")     # Flow
    
    # Pre-configure ESP-003 with mixed (actuator + sensors)
    esp3.handle_command("actuator_set", {"gpio": 5, "value": 0, "mode": "digital"})  # Pump
    esp3.set_sensor_value(gpio=34, raw_value=3000.0, sensor_type="analog")   # Moisture
    esp3.set_sensor_value(gpio=35, raw_value=1800.0, sensor_type="analog")   # Temperature
    
    # Clear setup messages
    esp1.clear_published_messages()
    esp2.clear_published_messages()
    esp3.clear_published_messages()
    
    yield {"esp1": esp1, "esp2": esp2, "esp3": esp3}
    
    # Cleanup
    esp1.reset()
    esp2.reset()
    esp3.reset()


@pytest.fixture
def real_esp32():
    """
    Provide connection to a real ESP32 device via MQTT.
    
    Uses REAL MQTT topics - identical to MockESP32Client API.
    Enable via environment variables:
    - ESP32_TEST_DEVICE_ID: ESP32 device ID
    - MQTT_BROKER_HOST: Broker address
    - MQTT_BROKER_PORT: Broker port (default: 1883)
    - MQTT_USERNAME: Optional auth
    - MQTT_PASSWORD: Optional auth

    Usage:
        def test_real_actuator(real_esp32):
            response = real_esp32.handle_command("actuator_set", {"gpio": 5, "value": 1, "mode": "digital"})
            assert response["status"] == "ok"

    Marks tests with @pytest.mark.hardware for selective running:
        pytest -m hardware  # Run only hardware tests
        pytest -m "not hardware"  # Skip hardware tests (default in CI)
    """
    esp_id = os.getenv("ESP32_TEST_DEVICE_ID")
    if not esp_id:
        pytest.skip("ESP32_TEST_DEVICE_ID not set - skipping real hardware tests")
    
    broker_host = os.getenv("MQTT_BROKER_HOST")
    if not broker_host:
        pytest.skip("MQTT_BROKER_HOST not set - skipping real hardware tests")
    
    broker_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    username = os.getenv("MQTT_USERNAME")
    password = os.getenv("MQTT_PASSWORD")
    
    try:
        from .mocks.real_esp32_client import RealESP32Client
        
        client = RealESP32Client(
            esp_id=esp_id,
            broker_host=broker_host,
            broker_port=broker_port,
            username=username,
            password=password
        )
        
        yield client
        
        client.disconnect()
        
    except ImportError as e:
        pytest.skip(f"RealESP32Client not available: {e}")
    except ConnectionError as e:
        pytest.skip(f"Could not connect to MQTT broker: {e}")


@pytest.fixture(scope="session")
def mqtt_test_config():
    """
    Provide MQTT configuration for tests.

    Returns:
        dict: MQTT configuration (broker, port, credentials)
    """
    return {
        "broker_host": os.getenv("MQTT_BROKER_HOST", "localhost"),
        "broker_port": int(os.getenv("MQTT_BROKER_PORT", "1883")),
        "username": os.getenv("MQTT_USERNAME", "test"),
        "password": os.getenv("MQTT_PASSWORD", "test"),
        "client_id": "pytest-esp32-test-client"
    }


@pytest.fixture
def mqtt_test_client(mqtt_test_config):
    """
    Provide MQTT client for test orchestration.

    This fixture provides an MQTT client that can:
    - Publish test commands to ESP32 devices
    - Subscribe to ESP32 responses
    - Verify message flow

    Usage:
        def test_mqtt_communication(mqtt_test_client):
            mqtt_test_client.publish(
                "kaiser/god/esp/test-001/test/command",
                {"command": "ping"}
            )
            response = mqtt_test_client.wait_for_message(
                "kaiser/god/esp/test-001/test/response",
                timeout=5
            )
            assert response["command"] == "pong"
    """
    # TODO: Implement MQTT test client when MQTT client is available
    pytest.skip("MQTT test client not yet implemented")

    # Future implementation:
    # from god_kaiser_server.src.mqtt.client import MQTTClient
    #
    # client = MQTTClient(**mqtt_test_config)
    # client.connect()
    #
    # yield client
    #
    # client.disconnect()
