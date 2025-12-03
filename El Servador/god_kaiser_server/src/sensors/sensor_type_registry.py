"""
Sensor Type Registry - Centralized sensor type normalization and multi-value sensor definitions

Provides:
- Sensor type mapping (ESP32 → Server Processor)
- Multi-value sensor definitions (e.g., SHT31 with temp + humidity)
- I2C device address mappings
- Device type information

Usage:
    from .sensor_type_registry import normalize_sensor_type, get_multi_value_sensor_def
    
    normalized = normalize_sensor_type("temperature_sht31")  # Returns "sht31_temp"
    sht31_def = get_multi_value_sensor_def("sht31")  # Returns multi-value definition
"""

from typing import Dict, List, Optional, TypedDict

from ..core.logging_config import get_logger

logger = get_logger(__name__)


class ValueDefinition(TypedDict):
    """Definition for a single value provided by a multi-value sensor."""
    sensor_type: str  # Server processor type (e.g., "sht31_temp")
    name: str  # Human-readable name (e.g., "Temperature")
    unit: str  # Unit (e.g., "°C")


class MultiValueSensorDefinition(TypedDict):
    """Definition for a multi-value sensor (e.g., SHT31, BMP280)."""
    device_type: str  # Communication type: "i2c", "uart", etc.
    device_address: int  # I2C address (e.g., 0x44 for SHT31)
    values: List[ValueDefinition]  # List of values this sensor provides
    i2c_pins: Optional[Dict[str, int]]  # I2C pin configuration (SDA, SCL)


# Sensor Type Mapping: ESP32 → Server Processor
# Maps sensor types sent by ESP32 to the processor types expected by the server
SENSOR_TYPE_MAPPING: Dict[str, str] = {
    # SHT31 variants
    "temperature_sht31": "sht31_temp",
    "humidity_sht31": "sht31_humidity",
    "sht31_temp": "sht31_temp",  # Already normalized
    "sht31_humidity": "sht31_humidity",  # Already normalized
    
    # DS18B20 variants
    "temperature_ds18b20": "ds18b20",
    "ds18b20": "ds18b20",  # Already normalized
    
    # BMP280 variants (Phase 2)
    "pressure_bmp280": "bmp280_pressure",
    "temperature_bmp280": "bmp280_temp",
    "bmp280_pressure": "bmp280_pressure",  # Already normalized
    "bmp280_temp": "bmp280_temp",  # Already normalized
    
    # pH sensor
    "ph_sensor": "ph",
    "ph": "ph",  # Already normalized
    
    # EC sensor (Phase 2)
    "ec_sensor": "ec",
    "ec": "ec",  # Already normalized
    
    # Moisture sensor (Phase 2)
    "moisture": "moisture",
    
    # CO2 sensors (Phase 3)
    "mhz19_co2": "mhz19_co2",
    "scd30_co2": "scd30_co2",
    
    # Light sensor (Phase 3)
    "light": "light",
    "tsl2561": "light",
    "bh1750": "light",
    
    # Flow sensor (Phase 3)
    "flow": "flow",
    "yfs201": "flow",
}


# Multi-Value Sensor Definitions
# Defines sensors that provide multiple values (e.g., SHT31: temp + humidity)
MULTI_VALUE_SENSORS: Dict[str, MultiValueSensorDefinition] = {
    "sht31": {
        "device_type": "i2c",
        "device_address": 0x44,  # Default SHT31 address (0x45 if ADR pin to VIN)
        "values": [
            {
                "sensor_type": "sht31_temp",
                "name": "Temperature",
                "unit": "°C",
            },
            {
                "sensor_type": "sht31_humidity",
                "name": "Humidity",
                "unit": "%RH",
            },
        ],
        "i2c_pins": {"sda": 21, "scl": 22},  # ESP32 default I2C pins
    },
    "bmp280": {
        "device_type": "i2c",
        "device_address": 0x76,  # Default BMP280 address (0x77 if SDO to VCC)
        "values": [
            {
                "sensor_type": "bmp280_pressure",
                "name": "Pressure",
                "unit": "hPa",
            },
            {
                "sensor_type": "bmp280_temp",
                "name": "Temperature",
                "unit": "°C",
            },
        ],
        "i2c_pins": {"sda": 21, "scl": 22},  # ESP32 default I2C pins
    },
    # Future multi-value sensors can be added here:
    # "scd30": { ... },  # CO2 + Temp + Humidity
}


def normalize_sensor_type(sensor_type: str) -> str:
    """
    Normalize sensor type from ESP32 format to server processor format.
    
    Args:
        sensor_type: Sensor type from ESP32 (e.g., "temperature_sht31")
        
    Returns:
        Normalized sensor type for server processor lookup (e.g., "sht31_temp")
        
    Example:
        >>> normalize_sensor_type("temperature_sht31")
        'sht31_temp'
        >>> normalize_sensor_type("sht31_temp")  # Already normalized
        'sht31_temp'
        >>> normalize_sensor_type("unknown_type")  # Unknown type
        'unknown_type'
    """
    if not sensor_type:
        return sensor_type
    
    normalized = SENSOR_TYPE_MAPPING.get(sensor_type.lower(), sensor_type.lower())
    
    if normalized != sensor_type.lower():
        logger.debug(
            f"Normalized sensor type: '{sensor_type}' → '{normalized}'"
        )
    
    return normalized


def get_multi_value_sensor_def(device_type: str) -> Optional[MultiValueSensorDefinition]:
    """
    Get multi-value sensor definition by device type.
    
    Args:
        device_type: Device type identifier (e.g., "sht31", "bmp280")
        
    Returns:
        MultiValueSensorDefinition if found, None otherwise
        
    Example:
        >>> def_ = get_multi_value_sensor_def("sht31")
        >>> def_["device_address"]
        0x44
        >>> len(def_["values"])
        2
    """
    return MULTI_VALUE_SENSORS.get(device_type.lower())


def is_multi_value_sensor(device_type: str) -> bool:
    """
    Check if a device type is a multi-value sensor.
    
    Args:
        device_type: Device type identifier (e.g., "sht31")
        
    Returns:
        True if device type provides multiple values, False otherwise
        
    Example:
        >>> is_multi_value_sensor("sht31")
        True
        >>> is_multi_value_sensor("ds18b20")
        False
    """
    return device_type.lower() in MULTI_VALUE_SENSORS


def get_device_type_from_sensor_type(sensor_type: str) -> Optional[str]:
    """
    Extract device type from sensor type.
    
    For multi-value sensors, extracts the base device type.
    For single-value sensors, returns None.
    
    Args:
        sensor_type: Normalized sensor type (e.g., "sht31_temp")
        
    Returns:
        Device type (e.g., "sht31") if multi-value sensor, None otherwise
        
    Example:
        >>> get_device_type_from_sensor_type("sht31_temp")
        'sht31'
        >>> get_device_type_from_sensor_type("ds18b20")
        None
    """
    normalized = normalize_sensor_type(sensor_type)
    
    # Check if this sensor type belongs to a multi-value sensor
    for device_type, definition in MULTI_VALUE_SENSORS.items():
        for value_def in definition["values"]:
            if value_def["sensor_type"] == normalized:
                return device_type
    
    return None


def get_all_value_types_for_device(device_type: str) -> List[str]:
    """
    Get all sensor types (processor types) for a multi-value sensor device.
    
    Args:
        device_type: Device type identifier (e.g., "sht31")
        
    Returns:
        List of sensor types (e.g., ["sht31_temp", "sht31_humidity"])
        
    Example:
        >>> get_all_value_types_for_device("sht31")
        ['sht31_temp', 'sht31_humidity']
    """
    definition = get_multi_value_sensor_def(device_type)
    if not definition:
        return []
    
    return [value_def["sensor_type"] for value_def in definition["values"]]


def get_i2c_address(device_type: str, default_address: Optional[int] = None) -> Optional[int]:
    """
    Get I2C address for a device type.
    
    Args:
        device_type: Device type identifier (e.g., "sht31")
        default_address: Default address to return if device not found
        
    Returns:
        I2C address (e.g., 0x44) if found, default_address otherwise
        
    Example:
        >>> get_i2c_address("sht31")
        68
        >>> get_i2c_address("unknown", default_address=0x48)
        72
    """
    definition = get_multi_value_sensor_def(device_type)
    if definition and definition["device_type"] == "i2c":
        return definition["device_address"]
    
    return default_address

