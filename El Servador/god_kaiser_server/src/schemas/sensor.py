"""
Sensor Pydantic Schemas

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- Sensor configuration CRUD models
- Sensor data query and response models
- Calibration models

Consistency with El Trabajante:
- Sensor types: ph, temperature, humidity, ec, moisture, pressure, co2, light, flow
- Quality levels: excellent, good, fair, poor, bad, stale
- MQTT Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 135-145)
- El Trabajante/docs/Mqtt_Protocoll.md (Sensor topics)
- api/schemas.py (existing processing schemas - to be consolidated)
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .common import (
    BaseResponse,
    IDMixin,
    PaginatedResponse,
    PaginationMeta,
    TimestampMixin,
)


# =============================================================================
# Sensor Types and Constants
# =============================================================================


SENSOR_TYPES = [
    "ph", "temperature", "humidity", "ec", "moisture",
    "pressure", "co2", "light", "flow", "analog", "digital"
]

QUALITY_LEVELS = ["excellent", "good", "fair", "poor", "bad", "stale", "error"]


# =============================================================================
# Sensor Configuration
# =============================================================================


class SensorConfigBase(BaseModel):
    """Base sensor configuration fields."""
    
    gpio: int = Field(
        ...,
        ge=0,
        le=39,
        description="GPIO pin number (0-39 for ESP32)",
    )
    sensor_type: str = Field(
        ...,
        description="Sensor type (ph, temperature, humidity, etc.)",
    )
    name: Optional[str] = Field(
        None,
        max_length=100,
        description="Human-readable sensor name",
        examples=["Tank pH Sensor", "Ambient Temperature"],
    )
    
    @field_validator("sensor_type")
    @classmethod
    def validate_sensor_type(cls, v: str) -> str:
        """Validate and normalize sensor type."""
        v = v.lower().strip()
        if v not in SENSOR_TYPES:
            # Allow custom types but warn
            pass
        return v


class SensorConfigCreate(SensorConfigBase):
    """
    Sensor configuration create request.
    """
    
    esp_id: str = Field(
        ...,
        pattern=r"^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$",
        description="ESP device ID",
        examples=["ESP_12AB34CD"],
    )
    enabled: bool = Field(
        True,
        description="Whether sensor is enabled",
    )
    interval_ms: int = Field(
        30000,
        ge=1000,
        le=300000,
        description="Reading interval in milliseconds",
    )
    # Processing mode
    processing_mode: str = Field(
        "pi_enhanced",
        description="Processing mode: pi_enhanced (server), local (ESP), raw (no processing)",
        pattern=r"^(pi_enhanced|local|raw)$",
    )
    # Calibration
    calibration: Optional[Dict[str, Any]] = Field(
        None,
        description="Calibration data (sensor-specific)",
    )
    # Thresholds
    threshold_min: Optional[float] = Field(
        None,
        description="Minimum valid value threshold",
    )
    threshold_max: Optional[float] = Field(
        None,
        description="Maximum valid value threshold",
    )
    warning_min: Optional[float] = Field(
        None,
        description="Warning threshold (low)",
    )
    warning_max: Optional[float] = Field(
        None,
        description="Warning threshold (high)",
    )
    # Metadata
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Custom metadata",
    )
    # =========================================================================
    # OPERATING MODE CONFIGURATION (Phase 2F)
    # =========================================================================
    operating_mode: Optional[str] = Field(
        None,
        description="Operating mode override: continuous, on_demand, scheduled, paused. "
                    "NULL = use SensorTypeDefaults",
        pattern=r"^(continuous|on_demand|scheduled|paused)$",
    )
    timeout_seconds: Optional[int] = Field(
        None,
        ge=0,
        le=86400,  # Max 24 hours
        description="Timeout override in seconds. NULL = use SensorTypeDefaults, 0 = no timeout",
    )
    timeout_warning_enabled: Optional[bool] = Field(
        None,
        description="Enable timeout warnings. NULL = use SensorTypeDefaults",
    )
    schedule_config: Optional[Dict[str, Any]] = Field(
        None,
        description="Schedule configuration for scheduled mode",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "sensor_type": "ph",
                "name": "Nutrient Tank pH",
                "enabled": True,
                "interval_ms": 30000,
                "processing_mode": "pi_enhanced",
                "calibration": {
                    "slope": -3.5,
                    "offset": 21.34
                },
                "threshold_min": 0.0,
                "threshold_max": 14.0,
                "warning_min": 5.5,
                "warning_max": 7.5,
                "operating_mode": "continuous",
                "timeout_seconds": 180
            }
        }
    )


class SensorConfigUpdate(BaseModel):
    """
    Sensor configuration update request.

    All fields optional - only provided fields are updated.
    """

    name: Optional[str] = Field(None, max_length=100)
    enabled: Optional[bool] = Field(None)
    interval_ms: Optional[int] = Field(None, ge=1000, le=300000)
    processing_mode: Optional[str] = Field(
        None,
        pattern=r"^(pi_enhanced|local|raw)$",
    )
    calibration: Optional[Dict[str, Any]] = Field(None)
    threshold_min: Optional[float] = Field(None)
    threshold_max: Optional[float] = Field(None)
    warning_min: Optional[float] = Field(None)
    warning_max: Optional[float] = Field(None)
    metadata: Optional[Dict[str, Any]] = Field(None)
    # =========================================================================
    # OPERATING MODE CONFIGURATION (Phase 2F)
    # =========================================================================
    operating_mode: Optional[str] = Field(
        None,
        description="Operating mode override: continuous, on_demand, scheduled, paused. "
                    "NULL = use SensorTypeDefaults",
        pattern=r"^(continuous|on_demand|scheduled|paused)$",
    )
    timeout_seconds: Optional[int] = Field(
        None,
        ge=0,
        le=86400,
        description="Timeout override in seconds. NULL = use SensorTypeDefaults, 0 = no timeout",
    )
    timeout_warning_enabled: Optional[bool] = Field(
        None,
        description="Enable timeout warnings. NULL = use SensorTypeDefaults",
    )
    schedule_config: Optional[Dict[str, Any]] = Field(
        None,
        description="Schedule configuration for scheduled mode",
    )


class SensorConfigResponse(SensorConfigBase, TimestampMixin):
    """
    Sensor configuration response.
    """
    
    id: uuid.UUID = Field(
        ...,
        description="Unique identifier (UUID)",
    )
    esp_id: uuid.UUID = Field(
        ...,
        description="ESP device database ID (UUID)",
    )
    esp_device_id: Optional[str] = Field(
        None,
        description="ESP device ID string (ESP_XXXXXXXX)",
    )
    enabled: bool = Field(
        ...,
        description="Whether sensor is enabled",
    )
    interval_ms: int = Field(
        ...,
        description="Reading interval (ms)",
    )
    processing_mode: str = Field(
        ...,
        description="Processing mode",
    )
    calibration: Optional[Dict[str, Any]] = Field(None)
    threshold_min: Optional[float] = Field(None)
    threshold_max: Optional[float] = Field(None)
    warning_min: Optional[float] = Field(None)
    warning_max: Optional[float] = Field(None)
    metadata: Optional[Dict[str, Any]] = Field(None)
    # Latest reading (optional)
    latest_value: Optional[float] = Field(
        None,
        description="Latest sensor value",
    )
    latest_quality: Optional[str] = Field(
        None,
        description="Latest reading quality",
    )
    latest_timestamp: Optional[datetime] = Field(
        None,
        description="Latest reading timestamp",
    )
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "esp_id": "440e8400-e29b-41d4-a716-446655440000",
                "esp_device_id": "ESP_12AB34CD",
                "gpio": 34,
                "sensor_type": "ph",
                "name": "Nutrient Tank pH",
                "enabled": True,
                "interval_ms": 30000,
                "processing_mode": "pi_enhanced",
                "calibration": {"slope": -3.5, "offset": 21.34},
                "threshold_min": 0.0,
                "threshold_max": 14.0,
                "latest_value": 6.8,
                "latest_quality": "good",
                "latest_timestamp": "2025-01-01T12:00:00Z",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    )


# =============================================================================
# Sensor Data
# =============================================================================


class SensorReading(BaseModel):
    """
    Single sensor reading.
    """
    
    timestamp: datetime = Field(..., description="Reading timestamp")
    raw_value: float = Field(..., description="Raw sensor value")
    processed_value: Optional[float] = Field(
        None,
        description="Processed value (after calibration/conversion)",
    )
    unit: Optional[str] = Field(
        None,
        description="Measurement unit",
    )
    quality: str = Field(
        "good",
        description="Data quality (excellent, good, fair, poor, bad, stale)",
    )
    
    @field_validator("quality")
    @classmethod
    def validate_quality(cls, v: str) -> str:
        """Validate quality level."""
        v = v.lower()
        if v not in QUALITY_LEVELS:
            v = "good"  # Default to good if unknown
        return v
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "timestamp": "2025-01-01T12:00:00Z",
                "raw_value": 2150,
                "processed_value": 6.8,
                "unit": "pH",
                "quality": "good"
            }
        }
    )


class SensorDataQuery(BaseModel):
    """
    Sensor data query parameters.
    """
    
    esp_id: Optional[str] = Field(
        None,
        pattern=r"^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$",
        description="Filter by ESP device ID",
    )
    gpio: Optional[int] = Field(
        None,
        ge=0,
        le=39,
        description="Filter by GPIO pin",
    )
    sensor_type: Optional[str] = Field(
        None,
        description="Filter by sensor type",
    )
    start_time: Optional[datetime] = Field(
        None,
        description="Start of time range",
    )
    end_time: Optional[datetime] = Field(
        None,
        description="End of time range",
    )
    quality: Optional[str] = Field(
        None,
        description="Filter by quality level",
    )
    aggregation: Optional[str] = Field(
        None,
        pattern=r"^(none|minute|hour|day)$",
        description="Time aggregation (none, minute, hour, day)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "start_time": "2025-01-01T00:00:00Z",
                "end_time": "2025-01-01T23:59:59Z",
                "aggregation": "hour"
            }
        }
    )


class SensorDataResponse(BaseResponse):
    """
    Sensor data query response.
    """
    
    esp_id: Optional[str] = Field(None, description="ESP device ID filter")
    gpio: Optional[int] = Field(None, description="GPIO filter")
    sensor_type: Optional[str] = Field(None, description="Sensor type")
    readings: List[SensorReading] = Field(
        default_factory=list,
        description="Sensor readings",
    )
    count: int = Field(..., description="Number of readings returned", ge=0)
    aggregation: Optional[str] = Field(None, description="Aggregation applied")
    time_range: Optional[Dict[str, datetime]] = Field(
        None,
        description="Actual time range of data",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "sensor_type": "ph",
                "readings": [
                    {
                        "timestamp": "2025-01-01T12:00:00Z",
                        "raw_value": 2150,
                        "processed_value": 6.8,
                        "unit": "pH",
                        "quality": "good"
                    }
                ],
                "count": 1,
                "aggregation": None,
                "time_range": {
                    "start": "2025-01-01T00:00:00Z",
                    "end": "2025-01-01T23:59:59Z"
                }
            }
        }
    )


class SensorDataPaginatedResponse(BaseResponse):
    """
    Paginated sensor data response.
    """
    
    esp_id: Optional[str] = Field(None)
    gpio: Optional[int] = Field(None)
    readings: List[SensorReading] = Field(default_factory=list)
    pagination: PaginationMeta = Field(...)


# =============================================================================
# Sensor Statistics
# =============================================================================


class SensorStats(BaseModel):
    """
    Statistical summary for sensor data.
    """
    
    min_value: Optional[float] = Field(None, description="Minimum value")
    max_value: Optional[float] = Field(None, description="Maximum value")
    avg_value: Optional[float] = Field(None, description="Average value")
    std_dev: Optional[float] = Field(None, description="Standard deviation")
    reading_count: int = Field(..., description="Number of readings", ge=0)
    quality_distribution: Dict[str, int] = Field(
        default_factory=dict,
        description="Count per quality level",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "min_value": 6.2,
                "max_value": 7.4,
                "avg_value": 6.8,
                "std_dev": 0.3,
                "reading_count": 100,
                "quality_distribution": {
                    "excellent": 50,
                    "good": 40,
                    "fair": 10
                }
            }
        }
    )


class SensorStatsResponse(BaseResponse):
    """
    Sensor statistics response.
    """
    
    esp_id: str = Field(..., description="ESP device ID")
    gpio: int = Field(..., description="GPIO pin")
    sensor_type: str = Field(..., description="Sensor type")
    stats: SensorStats = Field(..., description="Statistical summary")
    time_range: Dict[str, datetime] = Field(..., description="Data time range")


# =============================================================================
# Query Filters
# =============================================================================


class SensorListFilter(BaseModel):
    """
    Filter parameters for sensor list endpoint.
    """
    
    esp_id: Optional[str] = Field(
        None,
        pattern=r"^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$",
        description="Filter by ESP device ID",
    )
    sensor_type: Optional[str] = Field(
        None,
        description="Filter by sensor type",
    )
    enabled: Optional[bool] = Field(
        None,
        description="Filter by enabled status",
    )
    processing_mode: Optional[str] = Field(
        None,
        pattern=r"^(pi_enhanced|local|raw)$",
        description="Filter by processing mode",
    )


# =============================================================================
# Paginated Responses
# =============================================================================


class SensorConfigListResponse(PaginatedResponse[SensorConfigResponse]):
    """
    Paginated list of sensor configurations.
    """
    pass


# =============================================================================
# Processing Schemas (moved from api/schemas.py for consistency)
# =============================================================================


class SensorProcessRequest(BaseModel):
    """
    Request model for sensor processing endpoint.
    
    ESP32 sends raw sensor data for server-side processing.
    """
    
    esp_id: str = Field(
        ...,
        description="ESP device ID (format: ESP_XXXXXXXX)",
        pattern=r"^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$",
        examples=["ESP_12AB34CD"],
    )
    gpio: int = Field(
        ...,
        ge=0,
        le=39,
        description="GPIO pin number (0-39 for ESP32)",
    )
    sensor_type: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Sensor type identifier",
        examples=["ph", "temperature", "humidity", "ec"],
    )
    raw_value: float = Field(
        ...,
        description="Raw sensor value (ADC reading 0-4095 for ESP32)",
        ge=0,
        le=4095,
    )
    calibration: Optional[Dict[str, Any]] = Field(
        None,
        description="Calibration data (sensor-specific format)",
    )
    params: Optional[Dict[str, Any]] = Field(
        None,
        description="Processing parameters (sensor-specific)",
    )
    timestamp: Optional[int] = Field(
        None,
        description="Unix timestamp (seconds)",
    )
    
    @field_validator("sensor_type")
    @classmethod
    def validate_sensor_type(cls, v: str) -> str:
        """Validate sensor type format."""
        return v.lower().strip()
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "sensor_type": "ph",
                "raw_value": 2150,
                "calibration": {"slope": -3.5, "offset": 21.34},
                "timestamp": 1735818000
            }
        }
    )


class SensorProcessResponse(BaseResponse):
    """
    Response model for sensor processing endpoint.
    """
    
    processed_value: Optional[float] = Field(
        None,
        description="Processed sensor value",
    )
    unit: Optional[str] = Field(
        None,
        description="Measurement unit",
    )
    quality: Optional[str] = Field(
        None,
        description="Data quality indicator",
    )
    processing_time_ms: Optional[float] = Field(
        None,
        description="Server processing time (ms)",
    )
    error: Optional[str] = Field(
        None,
        description="Error message if processing failed",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional processing metadata",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "processed_value": 6.8,
                "unit": "pH",
                "quality": "good",
                "processing_time_ms": 5.2,
                "metadata": {"voltage": 1.75, "calibrated": True}
            }
        }
    )


# =============================================================================
# Calibration Schemas
# =============================================================================


class CalibrationPoint(BaseModel):
    """Single calibration point."""
    
    raw: float = Field(
        ...,
        description="Raw sensor value",
        examples=[1500, 3000, 2048],
    )
    reference: float = Field(
        ...,
        description="Known reference value",
        examples=[7.0, 1413, 100.0],
    )


class SensorCalibrateRequest(BaseModel):
    """
    Sensor calibration request.
    """
    
    esp_id: str = Field(
        ...,
        pattern=r"^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$",
        description="ESP device ID",
    )
    gpio: int = Field(
        ...,
        ge=0,
        le=39,
        description="GPIO pin number",
    )
    sensor_type: str = Field(
        ...,
        description="Sensor type",
    )
    calibration_points: List[CalibrationPoint] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Calibration points",
    )
    method: Optional[str] = Field(
        None,
        pattern=r"^(linear|offset|polynomial)$",
        description="Calibration method",
    )
    save_to_config: bool = Field(
        True,
        description="Save calibration to database",
    )
    
    @field_validator("sensor_type")
    @classmethod
    def validate_sensor_type(cls, v: str) -> str:
        return v.lower().strip()


class SensorCalibrateResponse(BaseResponse):
    """
    Sensor calibration response.
    """

    calibration: Dict[str, Any] = Field(
        ...,
        description="Calculated calibration data",
    )
    sensor_type: str = Field(..., description="Sensor type")
    method: str = Field(..., description="Calibration method used")
    saved: bool = Field(..., description="Whether saved to database")
    message: Optional[str] = Field(None, description="Additional info")


# =============================================================================
# On-Demand Measurement (Phase 2D)
# =============================================================================


class TriggerMeasurementResponse(BaseModel):
    """Response for trigger measurement endpoint."""

    success: bool = Field(..., description="Whether command was sent successfully")
    request_id: str = Field(..., description="Unique request ID for tracking")
    esp_id: str = Field(..., description="Target ESP device ID")
    gpio: int = Field(..., description="Target sensor GPIO")
    sensor_type: str = Field(..., description="Sensor type")
    message: str = Field(..., description="Status message")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "request_id": "550e8400-e29b-41d4-a716-446655440000",
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "sensor_type": "ph",
                "message": "Measurement command sent",
            }
        }
    )
