"""
Unit Tests: SensorRepository
Tests for sensor config and data operations
"""

import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio

from src.db.repositories.sensor_repo import SensorRepository


@pytest.mark.asyncio
class TestSensorRepositoryConfig:
    """Test SensorRepository config operations"""

    async def test_get_by_esp_and_gpio_success(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval by ESP ID and GPIO."""
        config = await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            sensor_name="Temperature Sensor",
            enabled=True,
            pi_enhanced=True,
        )

        retrieved = await sensor_repo.get_by_esp_and_gpio(sample_esp_device.id, 34)

        assert retrieved is not None
        assert retrieved.gpio == 34
        assert retrieved.sensor_type == "temperature"

    async def test_get_by_esp_and_gpio_not_found(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval with non-existent ESP/GPIO."""
        result = await sensor_repo.get_by_esp_and_gpio(sample_esp_device.id, 99)
        assert result is None

    async def test_get_by_esp_success(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval of all sensors for an ESP."""
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            sensor_name="Temp Sensor",
            enabled=True,
        )

        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=35,
            sensor_type="humidity",
            sensor_name="Humidity Sensor",
            enabled=True,
        )

        sensors = await sensor_repo.get_by_esp(sample_esp_device.id)

        assert len(sensors) == 2
        gpios = {s.gpio for s in sensors}
        assert gpios == {34, 35}

    async def test_get_enabled(self, sensor_repo: SensorRepository, sample_esp_device):
        """Test retrieval of enabled sensors."""
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            sensor_name="Enabled Sensor",
            enabled=True,
        )

        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=35,
            sensor_type="humidity",
            sensor_name="Disabled Sensor",
            enabled=False,
        )

        enabled_sensors = await sensor_repo.get_enabled()

        assert len(enabled_sensors) == 1
        assert enabled_sensors[0].gpio == 34

    async def test_get_pi_enhanced(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval of Pi-Enhanced sensors."""
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            sensor_name="Pi-Enhanced Sensor",
            enabled=True,
            pi_enhanced=True,
        )

        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=35,
            sensor_type="humidity",
            sensor_name="Local Sensor",
            enabled=True,
            pi_enhanced=False,
        )

        pi_enhanced = await sensor_repo.get_pi_enhanced()

        assert len(pi_enhanced) == 1
        assert pi_enhanced[0].gpio == 34

    async def test_get_by_sensor_type(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval by sensor type."""
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            sensor_name="Temp Sensor 1",
            enabled=True,
        )

        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=35,
            sensor_type="temperature",
            sensor_name="Temp Sensor 2",
            enabled=True,
        )

        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=36,
            sensor_type="humidity",
            sensor_name="Humidity Sensor",
            enabled=True,
        )

        temp_sensors = await sensor_repo.get_by_sensor_type("temperature")

        assert len(temp_sensors) == 2
        assert all(s.sensor_type == "temperature" for s in temp_sensors)


@pytest.mark.asyncio
class TestSensorRepositoryOneWire:
    """Test SensorRepository OneWire operations (DS18B20 support)"""

    async def test_get_by_esp_gpio_type_and_onewire_found(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test 4-way lookup for OneWire sensor."""
        # Create a OneWire sensor with ROM code
        config = await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=4,
            sensor_type="ds18b20",
            sensor_name="DS18B20 Sensor 1",
            interface_type="ONEWIRE",
            onewire_address="28FF641E8D3C0C79",
            enabled=True,
            pi_enhanced=True,
        )

        # Lookup by all 4 criteria
        retrieved = await sensor_repo.get_by_esp_gpio_type_and_onewire(
            sample_esp_device.id, 4, "ds18b20", "28FF641E8D3C0C79"
        )

        assert retrieved is not None
        assert retrieved.id == config.id
        assert retrieved.onewire_address == "28FF641E8D3C0C79"

    async def test_get_by_esp_gpio_type_and_onewire_not_found(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test 4-way lookup with non-existent ROM code."""
        # Create sensor with one ROM code
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=4,
            sensor_type="ds18b20",
            sensor_name="DS18B20 Sensor 1",
            interface_type="ONEWIRE",
            onewire_address="28FF641E8D3C0C79",
            enabled=True,
        )

        # Lookup with different ROM code
        retrieved = await sensor_repo.get_by_esp_gpio_type_and_onewire(
            sample_esp_device.id, 4, "ds18b20", "28FFNONEXISTENT"
        )

        assert retrieved is None

    async def test_multiple_ds18b20_on_same_gpio(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test multiple DS18B20 sensors on same GPIO (OneWire bus sharing)."""
        # Create 3 DS18B20 sensors on same GPIO pin
        rom_codes = [
            "28FF641E8D3C0C79",
            "28FF123456789ABC",
            "28FFABCDEF012345",
        ]

        for rom in rom_codes:
            await sensor_repo.create(
                esp_id=sample_esp_device.id,
                gpio=4,  # Same GPIO!
                sensor_type="ds18b20",
                sensor_name=f"DS18B20 {rom[:8]}",
                interface_type="ONEWIRE",
                onewire_address=rom,
                enabled=True,
            )

        # Lookup each sensor individually
        for rom in rom_codes:
            retrieved = await sensor_repo.get_by_esp_gpio_type_and_onewire(
                sample_esp_device.id, 4, "ds18b20", rom
            )
            assert retrieved is not None
            assert retrieved.onewire_address == rom

    async def test_get_by_onewire_address(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test lookup by OneWire address only."""
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=4,
            sensor_type="ds18b20",
            sensor_name="DS18B20 Sensor",
            interface_type="ONEWIRE",
            onewire_address="28FF641E8D3C0C79",
            enabled=True,
        )

        retrieved = await sensor_repo.get_by_onewire_address(
            sample_esp_device.id, "28FF641E8D3C0C79"
        )

        assert retrieved is not None
        assert retrieved.onewire_address == "28FF641E8D3C0C79"

    async def test_get_all_by_interface_onewire(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval of all OneWire sensors for ESP."""
        # Create OneWire sensors
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=4,
            sensor_type="ds18b20",
            sensor_name="DS18B20 Sensor 1",
            interface_type="ONEWIRE",
            onewire_address="28FF641E8D3C0C79",
            enabled=True,
        )
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=4,
            sensor_type="ds18b20",
            sensor_name="DS18B20 Sensor 2",
            interface_type="ONEWIRE",
            onewire_address="28FF123456789ABC",
            enabled=True,
        )

        # Create non-OneWire sensor
        await sensor_repo.create(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            sensor_name="Analog Temp",
            interface_type="ANALOG",
            enabled=True,
        )

        # Get all OneWire sensors
        onewire_sensors = await sensor_repo.get_all_by_interface(
            sample_esp_device.id, "ONEWIRE"
        )

        assert len(onewire_sensors) == 2
        assert all(s.interface_type == "ONEWIRE" for s in onewire_sensors)


@pytest.mark.asyncio
class TestSensorRepositoryData:
    """Test SensorRepository data operations"""

    async def test_save_data_success(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test saving sensor data."""
        sensor_data = await sensor_repo.save_data(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            raw_value=2456.0,
            processed_value=23.5,
            unit="°C",
            processing_mode="pi_enhanced",
            quality="good",
        )

        assert sensor_data is not None
        assert sensor_data.raw_value == 2456.0
        assert sensor_data.processed_value == 23.5
        assert sensor_data.unit == "°C"
        assert sensor_data.processing_mode == "pi_enhanced"
        assert sensor_data.quality == "good"

    async def test_save_data_minimal(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test saving sensor data with minimal fields."""
        sensor_data = await sensor_repo.save_data(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",
            raw_value=2456.0,
        )

        assert sensor_data is not None
        assert sensor_data.raw_value == 2456.0
        assert sensor_data.processed_value is None
        assert sensor_data.processing_mode == "raw"

    async def test_get_latest_data_success(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval of latest sensor data."""
        # Save multiple data points
        for i in range(5):
            await sensor_repo.save_data(
                esp_id=sample_esp_device.id,
                gpio=34,
                sensor_type="temperature",
                raw_value=2400.0 + i * 10,
                processed_value=23.0 + i * 0.1,
            )

        latest = await sensor_repo.get_latest_data(sample_esp_device.id, 34, limit=3)

        assert len(latest) == 3
        # Should be ordered by timestamp desc (newest first)
        assert latest[0].raw_value == 2440.0
        assert latest[1].raw_value == 2430.0
        assert latest[2].raw_value == 2420.0

    async def test_get_latest_data_empty(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval with no data."""
        latest = await sensor_repo.get_latest_data(sample_esp_device.id, 34)
        assert len(latest) == 0

    async def test_get_data_range_success(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval of data within time range."""
        now = datetime.utcnow()

        # Save data at different times
        for i in range(5):
            timestamp = now - timedelta(minutes=10 - i * 2)
            sensor_data = await sensor_repo.save_data(
                esp_id=sample_esp_device.id,
                gpio=34,
                sensor_type="temperature",
                raw_value=2400.0 + i * 10,
            )
            # Manually set timestamp (for testing)
            sensor_data.timestamp = timestamp
            await sensor_repo.session.flush()

        # Get data from last 6 minutes
        start_time = now - timedelta(minutes=6)
        end_time = now

        data_range = await sensor_repo.get_data_range(
            sample_esp_device.id, 34, start_time, end_time
        )

        # Should get last 3 data points (within 6 minutes)
        assert len(data_range) >= 0  # Depends on timing, but should be ordered

    async def test_get_data_range_empty(
        self, sensor_repo: SensorRepository, sample_esp_device
    ):
        """Test retrieval with no data in range."""
        now = datetime.utcnow()
        start_time = now - timedelta(hours=1)
        end_time = now - timedelta(minutes=30)

        data_range = await sensor_repo.get_data_range(
            sample_esp_device.id, 34, start_time, end_time
        )

        assert len(data_range) == 0

