"""
API Schemas - Pydantic Models for Request/Response Validation

Provides type-safe, validated models for:
- Sensor processing requests
- Processing responses
- Error responses
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, field_validator


class SensorProcessRequest(BaseModel):
    """
    Request model for sensor processing endpoint.
    
    ESP32 sends raw sensor data for server-side processing.
    """
    
    esp_id: str = Field(
        ...,
        description="ESP device ID (format: ESP_XXXXXXXX)",
        pattern=r"^ESP_[A-Z0-9]{8}$",
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
        description="Sensor type identifier (e.g., 'ph', 'temperature', 'ec')",
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
        # Lowercase and strip whitespace
        v = v.lower().strip()
        
        # Check for invalid characters
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Sensor type must be alphanumeric (with - or _)")
        
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "esp_id": "ESP_12AB34CD",
                "gpio": 34,
                "sensor_type": "ph",
                "raw_value": 2150,
                "calibration": {
                    "slope": -3.5,
                    "offset": 21.34
                },
                "params": {
                    "temperature_compensation": 25.0
                },
                "timestamp": 1735818000
            }
        }


class SensorProcessResponse(BaseModel):
    """
    Response model for sensor processing endpoint.
    
    Server returns processed sensor data.
    """
    
    success: bool = Field(
        ...,
        description="Whether processing succeeded",
    )
    
    processed_value: Optional[float] = Field(
        None,
        description="Processed sensor value (e.g., 7.2 for pH)",
    )
    
    unit: Optional[str] = Field(
        None,
        description="Measurement unit (e.g., 'pH', '°C', 'ppm')",
    )
    
    quality: Optional[str] = Field(
        None,
        description="Data quality indicator (excellent, good, fair, poor, bad, error)",
    )
    
    processing_time_ms: Optional[float] = Field(
        None,
        description="Server processing time in milliseconds",
    )
    
    error: Optional[str] = Field(
        None,
        description="Error message if processing failed",
    )
    
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional processing metadata",
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "processed_value": 7.2,
                "unit": "pH",
                "quality": "good",
                "processing_time_ms": 15.3,
                "metadata": {
                    "voltage": 1.75,
                    "calibrated": True
                }
            }
        }


class ErrorResponse(BaseModel):
    """Standard error response model."""
    
    error: str = Field(
        ...,
        description="Error type or code",
    )
    
    detail: str = Field(
        ...,
        description="Human-readable error description",
    )
    
    timestamp: Optional[int] = Field(
        None,
        description="Error timestamp (Unix seconds)",
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "SENSOR_NOT_FOUND",
                "detail": "No processor found for sensor type 'invalid_sensor'",
                "timestamp": 1735818000
            }
        }

