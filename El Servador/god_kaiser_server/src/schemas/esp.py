"""
ESP Device Pydantic Schemas

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: IMPLEMENTED

Provides:
- ESP device registration and update models
- ESP health and status models
- Device discovery and assignment models

Consistency with El Trabajante:
- ESP ID format: ESP_XXXXXXXX (8 hex chars)
- Timestamps: Unix seconds
- Status values: online, offline, error, unknown

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 125-133)
- El Trabajante/docs/Mqtt_Protocoll.md (Heartbeat topic)
- db/models/esp.py (ESPDevice model)
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .common import BaseResponse, PaginatedResponse, TimestampMixin


# =============================================================================
# ESP Device Base
# =============================================================================


class ESPDeviceBase(BaseModel):
    """Base ESP device fields."""

    device_id: str = Field(
        ...,
        pattern=r"^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$",
        description="ESP device ID (format: ESP_XXXXXXXX for real devices or MOCK_XXX for mock devices)",
        examples=["ESP_12AB34CD", "MOCK_TEST01"],
    )
    name: Optional[str] = Field(
        None,
        max_length=100,
        description="Human-readable device name",
        examples=["Greenhouse Sensor Node 1"],
    )
    zone_id: Optional[str] = Field(
        None,
        max_length=50,
        description="Zone identifier",
        examples=["greenhouse-zone-a"],
    )
    zone_name: Optional[str] = Field(
        None,
        max_length=100,
        description="Human-readable zone name",
        examples=["Greenhouse Zone A"],
    )
    is_zone_master: bool = Field(
        False,
        description="Whether device is zone master",
    )


class ESPDeviceCreate(ESPDeviceBase):
    """
    ESP device registration request.
    
    Used when manually registering an ESP or during auto-discovery.
    """
    
    ip_address: str = Field(
        ...,
        description="Device IP address",
        examples=["192.168.1.100"],
    )
    mac_address: str = Field(
        ...,
        pattern=r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$",
        description="Device MAC address",
        examples=["AA:BB:CC:DD:EE:FF"],
    )
    firmware_version: str = Field(
        "unknown",
        description="Firmware version",
        examples=["2.0.0"],
    )
    hardware_type: str = Field(
        "ESP32_WROOM",
        description="Hardware type (ESP32_WROOM, XIAO_ESP32_C3)",
        examples=["ESP32_WROOM", "XIAO_ESP32_C3"],
    )
    capabilities: Optional[Dict[str, Any]] = Field(
        None,
        description="Device capabilities (GPIO count, features)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "device_id": "ESP_12AB34CD",
                "name": "Greenhouse Node 1",
                "zone_id": "greenhouse-a",
                "zone_name": "Greenhouse Zone A",
                "is_zone_master": False,
                "ip_address": "192.168.1.100",
                "mac_address": "AA:BB:CC:DD:EE:FF",
                "firmware_version": "2.0.0",
                "hardware_type": "ESP32_WROOM",
                "capabilities": {
                    "gpio_count": 39,
                    "adc_channels": 18,
                    "has_wifi": True,
                    "has_bluetooth": True
                }
            }
        }
    )


class ESPDeviceUpdate(BaseModel):
    """
    ESP device update request.
    
    All fields optional - only provided fields are updated.
    """
    
    name: Optional[str] = Field(
        None,
        max_length=100,
        description="New device name",
    )
    zone_id: Optional[str] = Field(
        None,
        max_length=50,
        description="New zone ID",
    )
    zone_name: Optional[str] = Field(
        None,
        max_length=100,
        description="New zone name",
    )
    is_zone_master: Optional[bool] = Field(
        None,
        description="Set as zone master",
    )
    capabilities: Optional[Dict[str, Any]] = Field(
        None,
        description="Updated capabilities",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Custom metadata",
    )


class ESPDeviceResponse(ESPDeviceBase, TimestampMixin):
    """
    ESP device response model.

    Full device information including status and health.

    Note: ip_address, mac_address, firmware_version are Optional to support
    Mock ESP devices that may not have these hardware-specific values.
    """

    id: uuid.UUID = Field(
        ...,
        description="Unique identifier (UUID)",
    )

    ip_address: Optional[str] = Field(
        None,
        description="Device IP address (None for Mock ESPs without network)",
    )
    mac_address: Optional[str] = Field(
        None,
        description="Device MAC address (None for Mock ESPs without hardware)",
    )
    firmware_version: Optional[str] = Field(
        None,
        description="Firmware version (None for Mock ESPs)",
    )
    hardware_type: str = Field(
        ...,
        description="Hardware type (ESP32_WROOM, XIAO_ESP32_C3, MOCK_ESP32)",
    )
    capabilities: Optional[Dict[str, Any]] = Field(
        None,
        description="Device capabilities",
    )
    status: str = Field(
        "unknown",
        description="Device status (online, offline, error, unknown)",
    )
    last_seen: Optional[datetime] = Field(
        None,
        description="Last heartbeat timestamp",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Custom metadata",
    )
    # Counts from relationships
    sensor_count: int = Field(
        0,
        description="Number of configured sensors",
        ge=0,
    )
    actuator_count: int = Field(
        0,
        description="Number of configured actuators",
        ge=0,
    )
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "device_id": "ESP_12AB34CD",
                "name": "Greenhouse Node 1",
                "zone_id": "greenhouse-a",
                "zone_name": "Greenhouse Zone A",
                "is_zone_master": False,
                "ip_address": "192.168.1.100",
                "mac_address": "AA:BB:CC:DD:EE:FF",
                "firmware_version": "2.0.0",
                "hardware_type": "ESP32_WROOM",
                "capabilities": {"gpio_count": 39},
                "status": "online",
                "last_seen": "2025-01-01T12:00:00Z",
                "metadata": None,
                "sensor_count": 3,
                "actuator_count": 2,
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    )


# =============================================================================
# ESP Health
# =============================================================================


class ESPHealthMetrics(BaseModel):
    """
    ESP health metrics from heartbeat.
    
    Matches El Trabajante heartbeat payload format.
    """
    
    uptime: int = Field(
        ...,
        description="Seconds since boot",
        ge=0,
    )
    heap_free: int = Field(
        ...,
        description="Free heap memory (bytes)",
        ge=0,
    )
    wifi_rssi: int = Field(
        ...,
        description="WiFi signal strength (dBm, typically -100 to 0)",
        le=0,
    )
    sensor_count: int = Field(
        0,
        description="Number of active sensors",
        ge=0,
    )
    actuator_count: int = Field(
        0,
        description="Number of active actuators",
        ge=0,
    )
    timestamp: int = Field(
        ...,
        description="Heartbeat timestamp (Unix seconds)",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "uptime": 3600,
                "heap_free": 245760,
                "wifi_rssi": -65,
                "sensor_count": 3,
                "actuator_count": 2,
                "timestamp": 1735818000
            }
        }
    )


class ESPHealthResponse(BaseResponse):
    """
    ESP health check response.
    """
    
    device_id: str = Field(
        ...,
        description="ESP device ID",
    )
    status: str = Field(
        ...,
        description="Device status",
    )
    metrics: Optional[ESPHealthMetrics] = Field(
        None,
        description="Latest health metrics (if available)",
    )
    last_seen: Optional[datetime] = Field(
        None,
        description="Last heartbeat timestamp",
    )
    uptime_formatted: Optional[str] = Field(
        None,
        description="Human-readable uptime (e.g., '1d 2h 30m')",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "device_id": "ESP_12AB34CD",
                "status": "online",
                "metrics": {
                    "uptime": 86400,
                    "heap_free": 200000,
                    "wifi_rssi": -55,
                    "sensor_count": 3,
                    "actuator_count": 2,
                    "timestamp": 1735818000
                },
                "last_seen": "2025-01-01T12:00:00Z",
                "uptime_formatted": "1d 0h 0m"
            }
        }
    )


class ESPHealthSummary(BaseModel):
    """
    Summary health status for one ESP.
    """
    
    device_id: str = Field(..., description="ESP device ID")
    name: Optional[str] = Field(None, description="Device name")
    status: str = Field(..., description="online, offline, error, unknown")
    last_seen: Optional[datetime] = Field(None)
    heap_free: Optional[int] = Field(None, description="Free heap (bytes)")
    wifi_rssi: Optional[int] = Field(None, description="WiFi RSSI (dBm)")


class ESPHealthSummaryResponse(BaseResponse):
    """
    Summary health for all ESPs.
    """
    
    total_devices: int = Field(..., description="Total registered devices", ge=0)
    online_count: int = Field(..., description="Online devices", ge=0)
    offline_count: int = Field(..., description="Offline devices", ge=0)
    error_count: int = Field(..., description="Devices with errors", ge=0)
    devices: List[ESPHealthSummary] = Field(
        default_factory=list,
        description="Per-device health summary",
    )


# =============================================================================
# ESP Configuration
# =============================================================================


class ESPConfigUpdate(BaseModel):
    """
    ESP configuration update request.
    
    Sent to ESP via MQTT.
    """
    
    wifi_ssid: Optional[str] = Field(
        None,
        max_length=32,
        description="New WiFi SSID",
    )
    wifi_password: Optional[str] = Field(
        None,
        max_length=64,
        description="New WiFi password",
    )
    mqtt_broker: Optional[str] = Field(
        None,
        description="New MQTT broker address",
    )
    mqtt_port: Optional[int] = Field(
        None,
        ge=1,
        le=65535,
        description="New MQTT broker port",
    )
    report_interval_ms: Optional[int] = Field(
        None,
        ge=1000,
        le=300000,
        description="Sensor report interval (ms)",
    )
    heartbeat_interval_ms: Optional[int] = Field(
        None,
        ge=10000,
        le=300000,
        description="Heartbeat interval (ms)",
    )
    log_level: Optional[str] = Field(
        None,
        pattern=r"^(DEBUG|INFO|WARNING|ERROR)$",
        description="Log level",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "report_interval_ms": 30000,
                "heartbeat_interval_ms": 60000,
                "log_level": "INFO"
            }
        }
    )


class ESPConfigResponse(BaseResponse):
    """
    ESP config update response.
    """
    
    device_id: str = Field(..., description="ESP device ID")
    config_sent: bool = Field(..., description="Whether config was sent via MQTT")
    config_acknowledged: bool = Field(
        False,
        description="Whether ESP acknowledged config (requires ACK)",
    )


# =============================================================================
# ESP Commands
# =============================================================================


class ESPRestartRequest(BaseModel):
    """
    ESP restart command request.
    """
    
    delay_seconds: int = Field(
        0,
        ge=0,
        le=60,
        description="Delay before restart (seconds)",
    )
    reason: Optional[str] = Field(
        None,
        max_length=200,
        description="Restart reason (for logging)",
    )


class ESPResetRequest(BaseModel):
    """
    ESP factory reset command request.
    """
    
    confirm: bool = Field(
        ...,
        description="Must be True to confirm factory reset",
    )
    preserve_wifi: bool = Field(
        False,
        description="Preserve WiFi credentials during reset",
    )


class ESPCommandResponse(BaseResponse):
    """
    ESP command response.
    """
    
    device_id: str = Field(..., description="ESP device ID")
    command: str = Field(..., description="Command sent (restart, reset, etc.)")
    command_sent: bool = Field(..., description="Whether command was published to MQTT")


# =============================================================================
# ESP Assignment
# =============================================================================


class AssignKaiserRequest(BaseModel):
    """
    Assign ESP to Kaiser node request.
    """
    
    kaiser_id: str = Field(
        ...,
        description="Kaiser node ID to assign ESP to",
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "kaiser_id": "KAISER_001"
            }
        }
    )


class AssignKaiserResponse(BaseResponse):
    """
    Kaiser assignment response.
    """
    
    device_id: str = Field(..., description="ESP device ID")
    kaiser_id: str = Field(..., description="Assigned Kaiser ID")
    previous_kaiser_id: Optional[str] = Field(
        None,
        description="Previous Kaiser ID (if reassigned)",
    )


# =============================================================================
# ESP Discovery
# =============================================================================


class DiscoveredESP(BaseModel):
    """
    Discovered ESP device from network scan.
    """
    
    device_id: str = Field(..., description="ESP device ID")
    ip_address: str = Field(..., description="IP address")
    mac_address: str = Field(..., description="MAC address")
    firmware_version: str = Field(..., description="Firmware version")
    hardware_type: str = Field(..., description="Hardware type")
    is_registered: bool = Field(..., description="Whether already registered in DB")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "device_id": "ESP_AABBCCDD",
                "ip_address": "192.168.1.150",
                "mac_address": "11:22:33:44:55:66",
                "firmware_version": "2.0.0",
                "hardware_type": "ESP32_WROOM",
                "is_registered": False
            }
        }
    )


class ESPDiscoveryResponse(BaseResponse):
    """
    ESP discovery response.
    """
    
    discovered_count: int = Field(
        ...,
        description="Number of discovered devices",
        ge=0,
    )
    new_count: int = Field(
        ...,
        description="Number of unregistered devices",
        ge=0,
    )
    devices: List[DiscoveredESP] = Field(
        default_factory=list,
        description="List of discovered devices",
    )
    scan_duration_ms: int = Field(
        ...,
        description="Scan duration in milliseconds",
        ge=0,
    )


# =============================================================================
# Query Filters
# =============================================================================


class ESPListFilter(BaseModel):
    """
    Filter parameters for ESP list endpoint.
    """
    
    zone_id: Optional[str] = Field(None, description="Filter by zone ID")
    status: Optional[str] = Field(
        None,
        pattern=r"^(online|offline|error|unknown)$",
        description="Filter by status",
    )
    kaiser_id: Optional[str] = Field(None, description="Filter by Kaiser ID")
    hardware_type: Optional[str] = Field(None, description="Filter by hardware type")
    is_zone_master: Optional[bool] = Field(None, description="Filter zone masters only")


# =============================================================================
# Paginated Responses
# =============================================================================


class ESPDeviceListResponse(PaginatedResponse[ESPDeviceResponse]):
    """
    Paginated list of ESP devices.
    """
    pass
