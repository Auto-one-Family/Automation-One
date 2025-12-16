"""
Debug API Schemas - Mock ESP32 Management

Pydantic schemas for the debug/testing API that allows
frontend control of mock ESP32 devices.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

class GPIOPathParams(BaseModel):
    """Path params for GPIO-scoped routes."""
    esp_id: str = Field(..., description="ESP device ID (format: ESP_XXXXXXXX)")
    gpio: int = Field(..., ge=0, le=39, description="GPIO pin number")


class MockSystemState(str, Enum):
    """ESP32 System States - matches El Trabajante implementation."""
    BOOT = "BOOT"
    WIFI_SETUP = "WIFI_SETUP"
    WIFI_CONNECTED = "WIFI_CONNECTED"
    MQTT_CONNECTING = "MQTT_CONNECTING"
    MQTT_CONNECTED = "MQTT_CONNECTED"
    AWAITING_USER_CONFIG = "AWAITING_USER_CONFIG"
    ZONE_CONFIGURED = "ZONE_CONFIGURED"
    SENSORS_CONFIGURED = "SENSORS_CONFIGURED"
    OPERATIONAL = "OPERATIONAL"
    LIBRARY_DOWNLOADING = "LIBRARY_DOWNLOADING"
    SAFE_MODE = "SAFE_MODE"
    ERROR = "ERROR"


class QualityLevel(str, Enum):
    """Sensor quality levels."""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    BAD = "bad"
    STALE = "stale"


# =============================================================================
# Sensor Schemas
# =============================================================================
class MockSensorConfig(BaseModel):
    """Configuration for a mock sensor."""
    gpio: int = Field(..., ge=0, le=39, description="GPIO pin number")
    sensor_type: str = Field(..., description="Sensor type (DS18B20, SHT31, pH, etc.)")
    name: Optional[str] = Field(None, description="Human-readable sensor name")
    subzone_id: Optional[str] = Field(None, description="Subzone assignment for this sensor")
    raw_value: float = Field(0.0, description="Current raw sensor value")
    unit: str = Field("", description="Unit of measurement")
    quality: QualityLevel = Field(QualityLevel.GOOD, description="Data quality")
    raw_mode: bool = Field(True, description="Send raw values (Pi-Enhanced processing)")

    model_config = ConfigDict(use_enum_values=True)


class SetSensorValueRequest(BaseModel):
    """Request to set a sensor's value."""
    raw_value: float = Field(..., description="New raw value")
    quality: Optional[QualityLevel] = Field(None, description="Optional quality override")
    publish: bool = Field(True, description="Publish MQTT message after setting")

    model_config = ConfigDict(use_enum_values=True)


class BatchSensorValueRequest(BaseModel):
    """Request to set multiple sensor values at once."""
    values: Dict[int, float] = Field(
        ...,
        description="Map of GPIO -> raw_value"
    )
    publish: bool = Field(True, description="Publish batch MQTT message")


# =============================================================================
# Actuator Schemas
# =============================================================================
class MockActuatorConfig(BaseModel):
    """Configuration for a mock actuator."""
    gpio: int = Field(..., ge=0, le=39, description="GPIO pin number")
    actuator_type: str = Field("relay", description="Actuator type (relay, pump, valve, pwm)")
    name: Optional[str] = Field(None, description="Human-readable actuator name")
    state: bool = Field(False, description="Current on/off state")
    pwm_value: float = Field(0.0, ge=0.0, le=1.0, description="PWM duty cycle (0.0-1.0)")
    min_value: float = Field(0.0, description="Minimum allowed value")
    max_value: float = Field(1.0, description="Maximum allowed value")


class SetActuatorStateRequest(BaseModel):
    """Request to set actuator state."""
    state: bool = Field(..., description="On/Off state")
    pwm_value: Optional[float] = Field(None, ge=0.0, le=1.0, description="PWM value if applicable")
    publish: bool = Field(True, description="Publish MQTT status after setting")


# =============================================================================
# Mock ESP CRUD Schemas
# =============================================================================
class MockESPCreate(BaseModel):
    """Request to create a new mock ESP32."""
    esp_id: str = Field(
        ...,
        pattern=r"^ESP_[A-Za-z0-9]{8}$",
        description="ESP device ID (format: ESP_XXXXXXXX)"
    )
    zone_id: Optional[str] = Field(None, description="Zone assignment")
    master_zone_id: Optional[str] = Field(None, description="Master zone ID")
    subzone_id: Optional[str] = Field(None, description="Subzone ID")
    sensors: List[MockSensorConfig] = Field(
        default_factory=list,
        description="Initial sensor configurations"
    )
    actuators: List[MockActuatorConfig] = Field(
        default_factory=list,
        description="Initial actuator configurations"
    )
    auto_heartbeat: bool = Field(False, description="Enable automatic heartbeat")
    heartbeat_interval_seconds: int = Field(
        60,
        ge=5,
        le=300,
        description="Heartbeat interval in seconds"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "esp_id": "ESP_12AB34CD",
                "zone_id": "greenhouse",
                "master_zone_id": "main",
                "sensors": [
                    {"gpio": 4, "sensor_type": "DS18B20", "name": "Water Temp"},
                    {"gpio": 34, "sensor_type": "pH", "name": "pH Sensor"}
                ],
                "actuators": [
                    {"gpio": 18, "actuator_type": "pump", "name": "Main Pump"}
                ],
                "auto_heartbeat": True
            }
        }
    )


class MockESPUpdate(BaseModel):
    """Request to update mock ESP configuration."""
    zone_id: Optional[str] = None
    master_zone_id: Optional[str] = None
    subzone_id: Optional[str] = None
    auto_heartbeat: Optional[bool] = None
    heartbeat_interval_seconds: Optional[int] = Field(None, ge=5, le=300)


# =============================================================================
# State Transition
# =============================================================================
class StateTransitionRequest(BaseModel):
    """Request to transition ESP to a new state."""
    state: MockSystemState = Field(..., description="Target system state")
    reason: Optional[str] = Field(None, description="Reason for state transition")

    model_config = ConfigDict(use_enum_values=True)


# =============================================================================
# Response Schemas
# =============================================================================
class MockSensorResponse(BaseModel):
    """Sensor state in response."""
    gpio: int
    sensor_type: str
    name: Optional[str]
    subzone_id: Optional[str]
    raw_value: float
    unit: str
    quality: str
    raw_mode: bool
    last_read: Optional[datetime]


class MockActuatorResponse(BaseModel):
    """Actuator state in response."""
    gpio: int
    actuator_type: str
    name: Optional[str]
    state: bool
    pwm_value: float
    emergency_stopped: bool
    last_command: Optional[str]


class MockESPResponse(BaseModel):
    """Full mock ESP state response."""
    esp_id: str
    zone_id: Optional[str]
    master_zone_id: Optional[str]
    subzone_id: Optional[str]
    system_state: str
    sensors: List[MockSensorResponse]
    actuators: List[MockActuatorResponse]
    auto_heartbeat: bool
    heap_free: int
    wifi_rssi: int
    uptime: int
    last_heartbeat: Optional[datetime]
    created_at: datetime
    connected: bool
    hardware_type: str = Field(default="MOCK_ESP32", description="Hardware type identifier")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "esp_id": "ESP_12AB34CD",
                "zone_id": "greenhouse",
                "system_state": "OPERATIONAL",
                "sensors": [
                    {"gpio": 4, "sensor_type": "DS18B20", "name": "Water Temp",
                     "raw_value": 23.5, "unit": "°C", "quality": "good", "raw_mode": True}
                ],
                "actuators": [
                    {"gpio": 18, "actuator_type": "pump", "name": "Main Pump",
                     "state": False, "pwm_value": 0.0, "emergency_stopped": False}
                ],
                "heap_free": 245760,
                "wifi_rssi": -65,
                "uptime": 3600,
                "connected": True
            }
        }
    )


class MockESPListResponse(BaseModel):
    """List of mock ESPs response."""
    success: bool = True
    data: List[MockESPResponse]
    total: int


class HeartbeatResponse(BaseModel):
    """Response after triggering heartbeat."""
    success: bool
    esp_id: str
    timestamp: datetime
    message_published: bool
    payload: Optional[Dict[str, Any]] = None


class CommandResponse(BaseModel):
    """Generic command response."""
    success: bool
    esp_id: str
    command: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class MqttMessageRecord(BaseModel):
    """Record of a published MQTT message."""
    topic: str
    payload: Dict[str, Any]
    timestamp: datetime
    qos: int = 1


class MockESPMessagesResponse(BaseModel):
    """Response with published MQTT messages."""
    success: bool
    esp_id: str
    messages: List[MqttMessageRecord]
    total: int
