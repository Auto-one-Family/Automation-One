"""
Actuator Pydantic Schemas

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- Actuator configuration models
- Command request/response models
- Status and state models
- Emergency stop models

Consistency with El Trabajante:
- Commands: ON, OFF, PWM, TOGGLE
- Value range: 0.0-1.0 (server/ESP32 converts to 0-255)
- Server types: digital, pwm, servo
- ESP32 types: pump, valve, relay, pwm (auto-mapped to server types)
- MQTT Topic: kaiser/god/esp/{esp_id}/actuator/{gpio}/command

Type Mapping (ESP32 → Server):
- pump → digital
- valve → digital
- relay → digital
- pwm → pwm
- servo → servo

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 146-154)
- El Trabajante/docs/Mqtt_Protocoll.md (Actuator topics)
- El Trabajante/include/actuator_types.h (ActuatorTypeTokens)
- db/models/actuator.py
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .common import BaseResponse, IDMixin, PaginatedResponse, TimestampMixin


# =============================================================================
# Actuator Types and Constants
# =============================================================================


# Server-side actuator types (internal classification)
ACTUATOR_TYPES = ["digital", "pwm", "servo"]

# El Trabajante ESP32 actuator types (from actuator_types.h)
ESP32_ACTUATOR_TYPES = ["pump", "valve", "pwm", "relay"]

# Mapping from ESP32 types to server types
# ESP32 uses specific device types, server uses generic electrical types
ACTUATOR_TYPE_MAPPING = {
    "pump": "digital",    # Pump is a digital on/off device
    "valve": "digital",   # Valve is a digital on/off device
    "relay": "digital",   # Relay is a digital on/off device
    "pwm": "pwm",         # PWM maps directly
    "digital": "digital", # Direct mapping
    "servo": "servo",     # Servo maps directly
}

# All valid types (server + ESP32)
ALL_ACTUATOR_TYPES = list(set(ACTUATOR_TYPES + ESP32_ACTUATOR_TYPES))

ACTUATOR_COMMANDS = ["ON", "OFF", "PWM", "TOGGLE"]


def normalize_actuator_type(esp_type: str) -> str:
    """
    Normalize ESP32 actuator type to server type.
    
    Args:
        esp_type: Actuator type from ESP32 (pump, valve, relay, pwm)
        
    Returns:
        Server-side type (digital, pwm, servo)
    """
    return ACTUATOR_TYPE_MAPPING.get(esp_type.lower(), "digital")


# =============================================================================
# Actuator Configuration
# =============================================================================


class ActuatorConfigBase(BaseModel):
    """Base actuator configuration fields."""
    
    gpio: int = Field(
        ...,
        ge=0,
        le=39,
        description="GPIO pin number (0-39 for ESP32)",
    )
    actuator_type: str = Field(
        "digital",
        description="Actuator type (digital, pwm, servo)",
    )
    name: Optional[str] = Field(
        None,
        max_length=100,
        description="Human-readable actuator name",
        examples=["Water Pump", "Grow Light", "Vent Fan"],
    )
    
    @field_validator("actuator_type")
    @classmethod
    def validate_actuator_type(cls, v: str) -> str:
        """
        Validate and normalize actuator type.
        
        Accepts both server types (digital, pwm, servo) and
        ESP32 types (pump, valve, relay, pwm) for compatibility.
        ESP32 types are normalized to server types.
        """
        v = v.lower()
        if v not in ALL_ACTUATOR_TYPES:
            raise ValueError(f"actuator_type must be one of: {ALL_ACTUATOR_TYPES}")
        # Normalize ESP32 types to server types
        return normalize_actuator_type(v)


class ActuatorConfigCreate(ActuatorConfigBase):
    """
    Actuator configuration create request.
    """
    
    esp_id: str = Field(
        ...,
        pattern=r"^ESP_[A-F0-9]{8}$",
        description="ESP device ID",
        examples=["ESP_12AB34CD"],
    )
    enabled: bool = Field(
        True,
        description="Whether actuator is enabled",
    )
    # Safety constraints
    max_runtime_seconds: Optional[int] = Field(
        None,
        ge=1,
        le=86400,
        description="Maximum continuous runtime (seconds, prevents hardware damage)",
    )
    cooldown_seconds: Optional[int] = Field(
        None,
        ge=0,
        le=3600,
        description="Minimum time between activations (seconds)",
    )
    # PWM/Servo specific
    pwm_frequency: Optional[int] = Field(
        None,
        ge=1,
        le=40000,
        description="PWM frequency in Hz (for PWM/servo types)",
    )
    servo_min_pulse: Optional[int] = Field(
        None,
        ge=500,
        le=2500,
        description="Servo minimum pulse width (microseconds)",
    )
    servo_max_pulse: Optional[int] = Field(
        None,
        ge=500,
        le=2500,
        description="Servo maximum pulse width (microseconds)",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Custom metadata",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "esp_id": "ESP_12AB34CD",
                "gpio": 5,
                "actuator_type": "digital",
                "name": "Water Pump",
                "enabled": True,
                "max_runtime_seconds": 1800,
                "cooldown_seconds": 300
            }
        }
    )


class ActuatorConfigUpdate(BaseModel):
    """
    Actuator configuration update request.
    
    All fields optional - only provided fields are updated.
    """
    
    name: Optional[str] = Field(None, max_length=100)
    enabled: Optional[bool] = Field(None)
    max_runtime_seconds: Optional[int] = Field(None, ge=1, le=86400)
    cooldown_seconds: Optional[int] = Field(None, ge=0, le=3600)
    pwm_frequency: Optional[int] = Field(None, ge=1, le=40000)
    servo_min_pulse: Optional[int] = Field(None, ge=500, le=2500)
    servo_max_pulse: Optional[int] = Field(None, ge=500, le=2500)
    metadata: Optional[Dict[str, Any]] = Field(None)


class ActuatorConfigResponse(ActuatorConfigBase, IDMixin, TimestampMixin):
    """
    Actuator configuration response.
    """
    
    esp_id: int = Field(
        ...,
        description="ESP device database ID",
    )
    esp_device_id: Optional[str] = Field(
        None,
        description="ESP device ID string (ESP_XXXXXXXX)",
    )
    enabled: bool = Field(
        ...,
        description="Whether actuator is enabled",
    )
    max_runtime_seconds: Optional[int] = Field(None)
    cooldown_seconds: Optional[int] = Field(None)
    pwm_frequency: Optional[int] = Field(None)
    servo_min_pulse: Optional[int] = Field(None)
    servo_max_pulse: Optional[int] = Field(None)
    metadata: Optional[Dict[str, Any]] = Field(None)
    # Current state
    current_value: Optional[float] = Field(
        None,
        description="Current actuator value (0.0-1.0)",
    )
    is_active: Optional[bool] = Field(
        None,
        description="Whether actuator is currently active",
    )
    last_command_at: Optional[datetime] = Field(
        None,
        description="Last command timestamp",
    )
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "esp_id": 1,
                "esp_device_id": "ESP_12AB34CD",
                "gpio": 5,
                "actuator_type": "digital",
                "name": "Water Pump",
                "enabled": True,
                "max_runtime_seconds": 1800,
                "cooldown_seconds": 300,
                "current_value": 0.0,
                "is_active": False,
                "last_command_at": "2025-01-01T10:00:00Z",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T10:00:00Z"
            }
        }
    )


# =============================================================================
# Actuator Commands
# =============================================================================


class ActuatorCommand(BaseModel):
    """
    Actuator command request.
    
    Sent via REST API, validated by SafetyService, published to MQTT.
    """
    
    command: str = Field(
        ...,
        description="Command type: ON, OFF, PWM, TOGGLE",
    )
    value: float = Field(
        1.0,
        ge=0.0,
        le=1.0,
        description="Command value (0.0-1.0, used for PWM/servo)",
    )
    duration: int = Field(
        0,
        ge=0,
        le=86400,
        description="Duration in seconds (0 = unlimited until OFF)",
    )
    
    @field_validator("command")
    @classmethod
    def validate_command(cls, v: str) -> str:
        """Validate and normalize command."""
        v = v.upper()
        if v not in ACTUATOR_COMMANDS:
            raise ValueError(f"command must be one of: {ACTUATOR_COMMANDS}")
        return v
    
    @model_validator(mode="after")
    def validate_command_value(self) -> "ActuatorCommand":
        """Validate value based on command type."""
        if self.command == "ON" and self.value != 1.0:
            # For ON command, value should be 1.0
            self.value = 1.0
        elif self.command == "OFF" and self.value != 0.0:
            # For OFF command, value should be 0.0
            self.value = 0.0
        return self
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "command": "PWM",
                "value": 0.75,
                "duration": 300
            }
        }
    )


class ActuatorCommandResponse(BaseResponse):
    """
    Actuator command response.
    """
    
    esp_id: str = Field(..., description="ESP device ID")
    gpio: int = Field(..., description="GPIO pin")
    command: str = Field(..., description="Command sent")
    value: float = Field(..., description="Value sent (0.0-1.0)")
    command_sent: bool = Field(..., description="Whether MQTT command was published")
    acknowledged: bool = Field(
        False,
        description="Whether ESP acknowledged command (async)",
    )
    safety_warnings: List[str] = Field(
        default_factory=list,
        description="Safety warnings (if any)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "esp_id": "ESP_12AB34CD",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                "command_sent": True,
                "acknowledged": False,
                "safety_warnings": []
            }
        }
    )


# =============================================================================
# Actuator Status
# =============================================================================


class ActuatorState(BaseModel):
    """
    Current actuator state.
    """
    
    gpio: int = Field(..., description="GPIO pin")
    mode: str = Field(..., description="Actuator mode (digital, pwm, servo)")
    value: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Current value (0.0-1.0)",
    )
    is_active: bool = Field(..., description="Whether actuator is active")
    last_command: Optional[str] = Field(None, description="Last command received")
    last_command_at: Optional[datetime] = Field(None, description="Last command timestamp")
    runtime_seconds: Optional[int] = Field(
        None,
        description="Current runtime if active (seconds)",
        ge=0,
    )


class ActuatorStatusResponse(BaseResponse):
    """
    Actuator status response.
    """
    
    esp_id: str = Field(..., description="ESP device ID")
    gpio: int = Field(..., description="GPIO pin")
    state: ActuatorState = Field(..., description="Current actuator state")
    config: Optional[ActuatorConfigResponse] = Field(
        None,
        description="Actuator configuration (if requested)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "esp_id": "ESP_12AB34CD",
                "gpio": 5,
                "state": {
                    "gpio": 5,
                    "mode": "digital",
                    "value": 1.0,
                    "is_active": True,
                    "last_command": "ON",
                    "last_command_at": "2025-01-01T10:00:00Z",
                    "runtime_seconds": 300
                }
            }
        }
    )


# =============================================================================
# Emergency Stop
# =============================================================================


class EmergencyStopRequest(BaseModel):
    """
    Emergency stop request.
    
    CRITICAL: Stops all actuators immediately, bypasses normal safety checks.
    """
    
    esp_id: Optional[str] = Field(
        None,
        pattern=r"^ESP_[A-F0-9]{8}$",
        description="Specific ESP to stop (None = all ESPs)",
    )
    gpio: Optional[int] = Field(
        None,
        ge=0,
        le=39,
        description="Specific GPIO to stop (None = all actuators on ESP)",
    )
    reason: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Emergency stop reason (for audit log)",
        examples=["Manual safety override", "Sensor malfunction detected"],
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "esp_id": None,
                "gpio": None,
                "reason": "Manual safety override - immediate stop all actuators"
            }
        }
    )


class EmergencyStopResponse(BaseResponse):
    """
    Emergency stop response.
    """
    
    devices_stopped: int = Field(
        ...,
        description="Number of ESPs that received stop command",
        ge=0,
    )
    actuators_stopped: int = Field(
        ...,
        description="Number of actuators stopped",
        ge=0,
    )
    reason: str = Field(..., description="Emergency stop reason")
    timestamp: datetime = Field(..., description="Stop command timestamp")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Emergency stop executed",
                "devices_stopped": 5,
                "actuators_stopped": 12,
                "reason": "Manual safety override",
                "timestamp": "2025-01-01T10:00:00Z"
            }
        }
    )


# =============================================================================
# Actuator History
# =============================================================================


class ActuatorHistoryEntry(BaseModel):
    """
    Actuator command history entry.
    """
    
    id: int = Field(..., description="History entry ID")
    gpio: int = Field(..., description="GPIO pin")
    actuator_type: str = Field(..., description="Actuator type")
    command_type: str = Field(..., description="Command sent")
    value: float = Field(..., description="Value sent")
    success: bool = Field(..., description="Whether command succeeded")
    issued_by: str = Field(..., description="Who issued command")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    metadata: Optional[Dict[str, Any]] = Field(None)
    timestamp: datetime = Field(..., description="Command timestamp")
    
    model_config = ConfigDict(from_attributes=True)


class ActuatorHistoryResponse(BaseResponse):
    """
    Actuator history response.
    """
    
    esp_id: str = Field(..., description="ESP device ID")
    gpio: Optional[int] = Field(None, description="GPIO filter (if applied)")
    entries: List[ActuatorHistoryEntry] = Field(
        default_factory=list,
        description="History entries",
    )
    total_count: int = Field(..., description="Total entries matching filter", ge=0)


# =============================================================================
# Query Filters
# =============================================================================


class ActuatorListFilter(BaseModel):
    """
    Filter parameters for actuator list endpoint.
    """
    
    esp_id: Optional[str] = Field(
        None,
        pattern=r"^ESP_[A-F0-9]{8}$",
        description="Filter by ESP device ID",
    )
    actuator_type: Optional[str] = Field(
        None,
        description="Filter by actuator type",
    )
    enabled: Optional[bool] = Field(
        None,
        description="Filter by enabled status",
    )
    is_active: Optional[bool] = Field(
        None,
        description="Filter by active status",
    )


# =============================================================================
# Paginated Responses
# =============================================================================


class ActuatorConfigListResponse(PaginatedResponse[ActuatorConfigResponse]):
    """
    Paginated list of actuator configurations.
    """
    pass
