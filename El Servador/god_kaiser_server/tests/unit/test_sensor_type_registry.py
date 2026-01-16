"""
Unit tests for sensor type registry.

Tests sensor type normalization, multi-value sensor definitions,
and I2C address lookups.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models.esp import ESPDevice
from src.sensors.sensor_type_registry import (
    normalize_sensor_type,
    get_multi_value_sensor_def,
    is_multi_value_sensor,
    get_device_type_from_sensor_type,
    get_all_value_types_for_device,
    get_i2c_address,
)


class TestSensorTypeNormalization:
    """Test sensor type normalization (ESP32 → Server Processor)."""

    def test_normalize_sht31_temperature(self):
        """Test normalization of SHT31 temperature sensor type."""
        assert normalize_sensor_type("temperature_sht31") == "sht31_temp"

    def test_normalize_sht31_humidity(self):
        """Test normalization of SHT31 humidity sensor type."""
        assert normalize_sensor_type("humidity_sht31") == "sht31_humidity"

    def test_normalize_ds18b20(self):
        """Test normalization of DS18B20 sensor type."""
        assert normalize_sensor_type("temperature_ds18b20") == "ds18b20"

    def test_normalize_already_normalized(self):
        """Test that already normalized types remain unchanged."""
        assert normalize_sensor_type("sht31_temp") == "sht31_temp"
        assert normalize_sensor_type("ph") == "ph"

    def test_normalize_case_insensitive(self):
        """Test that normalization is case-insensitive."""
        assert normalize_sensor_type("TEMPERATURE_SHT31") == "sht31_temp"
        assert normalize_sensor_type("Temperature_Sht31") == "sht31_temp"

    def test_normalize_unknown_type(self):
        """Test that unknown types return lowercase version."""
        assert normalize_sensor_type("unknown_sensor") == "unknown_sensor"
        assert normalize_sensor_type("") == ""


class TestMultiValueSensorDefinitions:
    """Test multi-value sensor definitions."""

    def test_get_sht31_definition(self):
        """Test getting SHT31 multi-value sensor definition."""
        def_ = get_multi_value_sensor_def("sht31")
        assert def_ is not None
        assert def_["device_type"] == "i2c"
        assert def_["device_address"] == 0x44
        assert len(def_["values"]) == 2

    def test_get_bmp280_definition(self):
        """Test getting BMP280 multi-value sensor definition."""
        def_ = get_multi_value_sensor_def("bmp280")
        assert def_ is not None
        assert def_["device_type"] == "i2c"
        assert def_["device_address"] == 0x76
        assert len(def_["values"]) == 2

    def test_get_nonexistent_sensor(self):
        """Test getting definition for non-existent sensor."""
        assert get_multi_value_sensor_def("nonexistent") is None

    def test_is_multi_value_sht31(self):
        """Test that SHT31 is identified as multi-value sensor."""
        assert is_multi_value_sensor("sht31") is True

    def test_is_multi_value_bmp280(self):
        """Test that BMP280 is identified as multi-value sensor."""
        assert is_multi_value_sensor("bmp280") is True

    def test_is_multi_value_single_value(self):
        """Test that single-value sensors return False."""
        assert is_multi_value_sensor("ds18b20") is False
        assert is_multi_value_sensor("ph") is False

    def test_sht31_value_types(self):
        """Test SHT31 value type definitions."""
        def_ = get_multi_value_sensor_def("sht31")
        value_types = [v["sensor_type"] for v in def_["values"]]
        assert "sht31_temp" in value_types
        assert "sht31_humidity" in value_types

    def test_sht31_value_names(self):
        """Test SHT31 value names."""
        def_ = get_multi_value_sensor_def("sht31")
        value_names = [v["name"] for v in def_["values"]]
        assert "Temperature" in value_names
        assert "Humidity" in value_names

    def test_sht31_value_units(self):
        """Test SHT31 value units."""
        def_ = get_multi_value_sensor_def("sht31")
        value_units = [v["unit"] for v in def_["values"]]
        assert "°C" in value_units
        assert "%RH" in value_units


class TestDeviceTypeExtraction:
    """Test device type extraction from sensor types."""

    def test_get_device_type_from_sht31_temp(self):
        """Test extracting device type from SHT31 temperature sensor type."""
        device_type = get_device_type_from_sensor_type("sht31_temp")
        assert device_type == "sht31"

    def test_get_device_type_from_sht31_humidity(self):
        """Test extracting device type from SHT31 humidity sensor type."""
        device_type = get_device_type_from_sensor_type("sht31_humidity")
        assert device_type == "sht31"

    def test_get_device_type_from_single_value(self):
        """Test that single-value sensors return None."""
        assert get_device_type_from_sensor_type("ds18b20") is None
        assert get_device_type_from_sensor_type("ph") is None

    def test_get_device_type_from_normalized_type(self):
        """Test extracting device type from normalized sensor type."""
        device_type = get_device_type_from_sensor_type("temperature_sht31")
        assert device_type == "sht31"


class TestValueTypeLists:
    """Test getting all value types for a device."""

    def test_get_all_value_types_sht31(self):
        """Test getting all value types for SHT31."""
        value_types = get_all_value_types_for_device("sht31")
        assert len(value_types) == 2
        assert "sht31_temp" in value_types
        assert "sht31_humidity" in value_types

    def test_get_all_value_types_bmp280(self):
        """Test getting all value types for BMP280."""
        value_types = get_all_value_types_for_device("bmp280")
        assert len(value_types) == 2
        assert "bmp280_pressure" in value_types
        assert "bmp280_temp" in value_types

    def test_get_all_value_types_single_value(self):
        """Test that single-value sensors return empty list."""
        assert get_all_value_types_for_device("ds18b20") == []
        assert get_all_value_types_for_device("ph") == []


class TestI2CAddressLookup:
    """Test I2C address lookups."""

    def test_get_i2c_address_sht31(self):
        """Test getting I2C address for SHT31."""
        address = get_i2c_address("sht31")
        assert address == 0x44

    def test_get_i2c_address_bmp280(self):
        """Test getting I2C address for BMP280."""
        address = get_i2c_address("bmp280")
        assert address == 0x76

    def test_get_i2c_address_non_i2c(self):
        """Test getting I2C address for non-I2C sensor."""
        address = get_i2c_address("ds18b20", default_address=0x00)
        assert address == 0x00

    def test_get_i2c_address_unknown(self):
        """Test getting I2C address for unknown sensor."""
        address = get_i2c_address("unknown", default_address=0x48)
        assert address == 0x48


# ==================== Hardware Validation: I2C Address Range (Fix #1) ====================

@pytest.mark.asyncio
class TestI2CAddressRangeValidation:
    """Tests for I2C address range validation (Fix #1).
    
    I2C 7-bit addressing rules:
    - Valid range: 0x08-0x77 (8-119 decimal)
    - Reserved: 0x00-0x07 (General call, START byte, etc.)
    - Reserved: 0x78-0x7F (10-bit addressing)
    - Must be positive
    """
    
    async def test_i2c_negative_address_rejected(
        self,
        db_session: AsyncSession,
        sample_esp_device: ESPDevice,
    ):
        """Test: Negative I2C address rejected."""
        from src.api.v1.sensors import _validate_i2c_config
        from src.db.repositories.sensor_repo import SensorRepository
        from fastapi import HTTPException
        
        sensor_repo = SensorRepository(db_session)
        
        with pytest.raises(HTTPException) as exc_info:
            await _validate_i2c_config(
                sensor_repo=sensor_repo,
                esp_id=sample_esp_device.id,
                i2c_address=-1,
                exclude_sensor_id=None,
            )
        
        assert exc_info.value.status_code == 400
        assert "positive" in str(exc_info.value.detail).lower()
    
    async def test_i2c_out_of_7bit_range_rejected(
        self,
        db_session: AsyncSession,
        sample_esp_device: ESPDevice,
    ):
        """Test: I2C address > 0x7F rejected (out of 7-bit range)."""
        from src.api.v1.sensors import _validate_i2c_config
        from src.db.repositories.sensor_repo import SensorRepository
        from fastapi import HTTPException
        
        sensor_repo = SensorRepository(db_session)
        
        # Test 0xFF (255)
        with pytest.raises(HTTPException) as exc_info:
            await _validate_i2c_config(
                sensor_repo=sensor_repo,
                esp_id=sample_esp_device.id,
                i2c_address=255,  # 0xFF
                exclude_sensor_id=None,
            )
        
        assert exc_info.value.status_code == 400
        assert "0x08-0x77" in exc_info.value.detail or "7-bit range" in exc_info.value.detail
    
    async def test_i2c_reserved_low_address_rejected(
        self,
        db_session: AsyncSession,
        sample_esp_device: ESPDevice,
    ):
        """Test: Reserved I2C address 0x00-0x07 rejected."""
        from src.api.v1.sensors import _validate_i2c_config
        from src.db.repositories.sensor_repo import SensorRepository
        from fastapi import HTTPException
        
        sensor_repo = SensorRepository(db_session)
        
        # Test reserved addresses (0x00-0x07)
        reserved_addresses = [0x00, 0x01, 0x05, 0x07]
        
        for addr in reserved_addresses:
            with pytest.raises(HTTPException) as exc_info:
                await _validate_i2c_config(
                    sensor_repo=sensor_repo,
                    esp_id=sample_esp_device.id,
                    i2c_address=addr,
                    exclude_sensor_id=None,
                )
            
            assert exc_info.value.status_code == 400
            detail = exc_info.value.detail.lower()
            if addr == 0x00:
                assert "required" in detail
            else:
                assert "reserved" in detail
    
    async def test_i2c_reserved_high_address_rejected(
        self,
        db_session: AsyncSession,
        sample_esp_device: ESPDevice,
    ):
        """Test: Reserved I2C address 0x78-0x7F rejected."""
        from src.api.v1.sensors import _validate_i2c_config
        from src.db.repositories.sensor_repo import SensorRepository
        from fastapi import HTTPException
        
        sensor_repo = SensorRepository(db_session)
        
        # Test reserved addresses (0x78-0x7F)
        reserved_addresses = [0x78, 0x7A, 0x7D, 0x7F]
        
        for addr in reserved_addresses:
            with pytest.raises(HTTPException) as exc_info:
                await _validate_i2c_config(
                    sensor_repo=sensor_repo,
                    esp_id=sample_esp_device.id,
                    i2c_address=addr,
                    exclude_sensor_id=None,
                )
            
            assert exc_info.value.status_code == 400
            assert "reserved" in exc_info.value.detail.lower()
    
    async def test_i2c_valid_address_accepted(
        self,
        db_session: AsyncSession,
        sample_esp_device: ESPDevice,
    ):
        """Test: Valid I2C address 0x08-0x77 accepted."""
        from src.api.v1.sensors import _validate_i2c_config
        from src.db.repositories.sensor_repo import SensorRepository
        
        sensor_repo = SensorRepository(db_session)
        
        # Test valid addresses (should NOT raise exception)
        valid_addresses = [0x08, 0x44, 0x76, 0x77]  # SHT31, BMP280, etc.
        
        for addr in valid_addresses:
            # Should NOT raise exception
            await _validate_i2c_config(
                sensor_repo=sensor_repo,
                esp_id=sample_esp_device.id,
                i2c_address=addr,
                exclude_sensor_id=None,
            )
            # If we get here, validation passed ✅

