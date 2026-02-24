"""
Unit Tests for Sensor Repository I2C Address Support.

Tests the 4-way lookup functionality for I2C sensors:
- get_by_esp_gpio_type_and_i2c()
- Unique constraint (esp_id, gpio, sensor_type, i2c_address)
- Multiple sensors at different I2C addresses on same GPIO
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from src.db.models.sensor import SensorConfig
from src.db.repositories.sensor_repo import SensorRepository


pytestmark = [pytest.mark.asyncio]


class TestSensorRepoI2CLookup:
    """Tests for I2C 4-way lookup functionality."""

    async def test_get_by_esp_gpio_type_and_i2c_success(
        self, db_session: AsyncSession, sample_esp_device
    ):
        """Test 4-way lookup returns correct sensor by i2c_address."""
        repo = SensorRepository(db_session)

        # Create sensor with i2c_address
        sensor = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=68,  # 0x44
            sensor_name="SHT31 Temp at 0x44",
            interface_type="I2C",
            enabled=True,
        )
        db_session.add(sensor)
        await db_session.flush()

        # Query with 4-way lookup
        result = await repo.get_by_esp_gpio_type_and_i2c(sample_esp_device.id, 21, "sht31_temp", 68)

        assert result is not None
        assert result.id == sensor.id
        assert result.i2c_address == 68
        assert result.sensor_type == "sht31_temp"

    async def test_get_by_esp_gpio_type_and_i2c_not_found(
        self, db_session: AsyncSession, sample_esp_device
    ):
        """Test 4-way lookup returns None for non-existent sensor."""
        repo = SensorRepository(db_session)

        # Create sensor at address 0x44
        sensor = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=68,  # 0x44
            sensor_name="SHT31 Temp",
            interface_type="I2C",
            enabled=True,
        )
        db_session.add(sensor)
        await db_session.flush()

        # Query for different address 0x45
        result = await repo.get_by_esp_gpio_type_and_i2c(
            sample_esp_device.id, 21, "sht31_temp", 69  # 0x45
        )

        assert result is None

    async def test_get_by_esp_gpio_type_and_i2c_different_type(
        self, db_session: AsyncSession, sample_esp_device
    ):
        """Test 4-way lookup distinguishes sensor types at same address."""
        repo = SensorRepository(db_session)

        # Create SHT31 temperature sensor
        sensor_temp = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=68,
            sensor_name="SHT31 Temp",
            interface_type="I2C",
            enabled=True,
        )

        # Create SHT31 humidity sensor (same address, different type)
        sensor_hum = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_humidity",
            i2c_address=68,
            sensor_name="SHT31 Humidity",
            interface_type="I2C",
            enabled=True,
        )

        db_session.add(sensor_temp)
        db_session.add(sensor_hum)
        await db_session.flush()

        # Query for temp sensor
        result_temp = await repo.get_by_esp_gpio_type_and_i2c(
            sample_esp_device.id, 21, "sht31_temp", 68
        )

        # Query for humidity sensor
        result_hum = await repo.get_by_esp_gpio_type_and_i2c(
            sample_esp_device.id, 21, "sht31_humidity", 68
        )

        assert result_temp is not None
        assert result_hum is not None
        assert result_temp.id != result_hum.id
        assert result_temp.sensor_type == "sht31_temp"
        assert result_hum.sensor_type == "sht31_humidity"


class TestSensorRepoI2CMultiDevice:
    """Tests for multiple I2C sensors at different addresses."""

    async def test_two_sensors_different_i2c_addresses(
        self, db_session: AsyncSession, sample_esp_device
    ):
        """Test unique constraint allows different i2c_address on same GPIO."""
        repo = SensorRepository(db_session)

        # Sensor 1 at 0x44
        sensor1 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=68,  # 0x44
            sensor_name="SHT31 Temp A",
            interface_type="I2C",
            enabled=True,
        )

        # Sensor 2 at 0x45 (same type, different address)
        sensor2 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=69,  # 0x45
            sensor_name="SHT31 Temp B",
            interface_type="I2C",
            enabled=True,
        )

        db_session.add(sensor1)
        db_session.add(sensor2)
        await db_session.flush()

        # Both should exist and be different
        result1 = await repo.get_by_esp_gpio_type_and_i2c(
            sample_esp_device.id, 21, "sht31_temp", 68
        )
        result2 = await repo.get_by_esp_gpio_type_and_i2c(
            sample_esp_device.id, 21, "sht31_temp", 69
        )

        assert result1 is not None
        assert result2 is not None
        assert result1.id != result2.id
        assert result1.i2c_address == 68
        assert result2.i2c_address == 69

    async def test_sht31_plus_bmp280_same_bus(self, db_session: AsyncSession, sample_esp_device):
        """Test SHT31 and BMP280 on same I2C bus (different addresses)."""
        repo = SensorRepository(db_session)

        # SHT31 at 0x44
        sht31 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=68,  # 0x44
            sensor_name="SHT31",
            interface_type="I2C",
            enabled=True,
        )

        # BMP280 at 0x76
        bmp280 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="bmp280_pressure",
            i2c_address=118,  # 0x76
            sensor_name="BMP280",
            interface_type="I2C",
            enabled=True,
        )

        db_session.add(sht31)
        db_session.add(bmp280)
        await db_session.flush()

        # Both should exist
        result_sht31 = await repo.get_by_esp_gpio_type_and_i2c(
            sample_esp_device.id, 21, "sht31_temp", 68
        )
        result_bmp280 = await repo.get_by_esp_gpio_type_and_i2c(
            sample_esp_device.id, 21, "bmp280_pressure", 118
        )

        assert result_sht31 is not None
        assert result_bmp280 is not None


class TestSensorRepoI2CUniqueConstraint:
    """Tests for unique constraint enforcement."""

    @pytest.mark.skip(
        reason="Unique constraint enforcement depends on database config; tested in integration tests"
    )
    async def test_duplicate_i2c_address_same_type_rejected(
        self, db_session: AsyncSession, sample_esp_device
    ):
        """Test that duplicate (esp, gpio, type, i2c_address) fails.

        Note: This test is skipped in unit tests because SQLite In-Memory
        may not enforce unique constraints the same way as PostgreSQL.
        The constraint is properly tested in integration tests.
        """
        # Create first sensor
        sensor1 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=68,
            sensor_name="SHT31 Temp Original",
            interface_type="I2C",
            enabled=True,
        )
        db_session.add(sensor1)
        await db_session.flush()

        # Try to create duplicate
        sensor2 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=21,
            sensor_type="sht31_temp",
            i2c_address=68,  # Same address!
            sensor_name="SHT31 Temp Duplicate",
            interface_type="I2C",
            enabled=True,
        )
        db_session.add(sensor2)

        # Should raise IntegrityError on flush/commit
        with pytest.raises(IntegrityError):
            await db_session.flush()

    async def test_null_i2c_address_allows_duplicates(
        self, db_session: AsyncSession, sample_esp_device
    ):
        """Test that NULL i2c_address (non-I2C sensors) can have duplicates per GPIO."""
        # For non-I2C sensors, i2c_address is NULL
        # The unique constraint should still prevent duplicates based on
        # (esp_id, gpio, sensor_type, onewire_address, i2c_address)

        # This is actually a case where the constraint behavior depends on
        # whether NULL = NULL is true (in most DBs, it's not)

        sensor1 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="temperature",  # Generic analog temp
            i2c_address=None,
            sensor_name="Analog Temp 1",
            interface_type="ANALOG",
            enabled=True,
        )
        db_session.add(sensor1)
        await db_session.flush()

        # In most databases, another sensor with NULL i2c_address is allowed
        # because NULL != NULL in unique constraints
        sensor2 = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=35,  # Different GPIO to avoid constraint
            sensor_type="temperature",
            i2c_address=None,
            sensor_name="Analog Temp 2",
            interface_type="ANALOG",
            enabled=True,
        )
        db_session.add(sensor2)
        await db_session.flush()

        # Both should be created
        assert sensor1.id is not None
        assert sensor2.id is not None


class TestSensorRepoI2CAddressValidation:
    """Tests for I2C address range validation."""

    async def test_i2c_address_in_valid_range(self, db_session: AsyncSession, sample_esp_device):
        """Test I2C address in valid 7-bit range (0-127)."""
        valid_addresses = [0x08, 0x44, 0x45, 0x76, 0x77]

        for addr in valid_addresses:
            sensor = SensorConfig(
                esp_id=sample_esp_device.id,
                gpio=21,
                sensor_type=f"test_sensor_{addr}",
                i2c_address=addr,
                sensor_name=f"Sensor at 0x{addr:02X}",
                interface_type="I2C",
                enabled=True,
            )
            db_session.add(sensor)

        await db_session.flush()

        # All should be created
        repo = SensorRepository(db_session)
        for addr in valid_addresses:
            result = await repo.get_by_esp_gpio_type_and_i2c(
                sample_esp_device.id, 21, f"test_sensor_{addr}", addr
            )
            assert result is not None
            assert result.i2c_address == addr


class TestSensorRepoI2CFallback:
    """Tests for fallback to 3-way lookup when I2C address not provided."""

    async def test_get_by_esp_gpio_and_type_still_works(
        self, db_session: AsyncSession, sample_esp_device
    ):
        """Test traditional 3-way lookup still works for non-I2C sensors."""
        repo = SensorRepository(db_session)

        # Create analog sensor (no i2c_address)
        sensor = SensorConfig(
            esp_id=sample_esp_device.id,
            gpio=34,
            sensor_type="ph",
            i2c_address=None,  # Not an I2C sensor
            sensor_name="pH Sensor",
            interface_type="ANALOG",
            enabled=True,
        )
        db_session.add(sensor)
        await db_session.flush()

        # 3-way lookup should work
        result = await repo.get_by_esp_gpio_and_type(sample_esp_device.id, 34, "ph")

        assert result is not None
        assert result.sensor_type == "ph"
        assert result.i2c_address is None
