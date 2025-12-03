"""
ESP32 Device Model: Hardware, Config, Status
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..base import Base, TimestampMixin


class ESPDevice(Base, TimestampMixin):
    """
    ESP32 Device Model.

    Represents a physical ESP32 device in the system with its configuration,
    status, and relationships to sensors and actuators.

    Attributes:
        id: Primary key (UUID)
        device_id: Unique device identifier (e.g., ESP_A1B2C3D4)
        name: Human-readable device name
        zone_id: Zone identifier for hierarchical organization
        zone_name: Human-readable zone name
        is_zone_master: Whether this device is a zone master
        kaiser_id: ID of the Kaiser managing this device (optional)
        hardware_type: Hardware variant (ESP32_WROOM, XIAO_ESP32_C3)
        ip_address: Current IP address
        mac_address: Hardware MAC address
        firmware_version: Current firmware version
        capabilities: JSON field with device capabilities (max_sensors, max_actuators, etc.)
        status: Device status (online, offline, error, unknown)
        last_seen: Last heartbeat timestamp
        metadata: Additional device metadata
    """

    __tablename__ = "esp_devices"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        doc="Primary key (UUID)",
    )

    # Identity
    device_id: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        doc="Unique device identifier (e.g., ESP_A1B2C3D4)",
    )

    name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        doc="Human-readable device name",
    )

    # Zone Management (CRITICAL!)
    zone_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
        doc="Zone identifier for hierarchical organization",
    )

    zone_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        doc="Human-readable zone name",
    )

    is_zone_master: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether this device is a zone master",
    )

    # Kaiser Assignment (God-Kaiser Architecture)
    kaiser_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
        doc="ID of the Kaiser managing this device",
    )

    # Hardware Information (CRITICAL!)
    hardware_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Hardware variant (ESP32_WROOM, XIAO_ESP32_C3)",
    )

    ip_address: Mapped[Optional[str]] = mapped_column(
        String(45),
        nullable=True,
        doc="Current IPv4 address",
    )

    mac_address: Mapped[Optional[str]] = mapped_column(
        String(17),
        nullable=True,
        unique=True,
        doc="Hardware MAC address (format: XX:XX:XX:XX:XX:XX)",
    )

    firmware_version: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        doc="Current firmware version",
    )

    # Capabilities (CRITICAL!)
    capabilities: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        doc="Device capabilities (max_sensors, max_actuators, features)",
    )

    # Status Tracking
    status: Mapped[str] = mapped_column(
        String(20),
        default="offline",
        nullable=False,
        index=True,
        doc="Device status (online, offline, error, unknown)",
    )

    last_seen: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        index=True,
        doc="Last heartbeat timestamp",
    )

    health_status: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        doc="Health status (healthy, degraded, unhealthy, critical)",
    )

    # Metadata
    device_metadata: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        doc="Additional device metadata",
    )

    # Relationships
    sensors: Mapped[list["SensorConfig"]] = relationship(
        "SensorConfig",
        back_populates="esp",
        cascade="all, delete-orphan",
        doc="Sensor configurations for this device",
    )

    actuators: Mapped[list["ActuatorConfig"]] = relationship(
        "ActuatorConfig",
        back_populates="esp",
        cascade="all, delete-orphan",
        doc="Actuator configurations for this device",
    )

    def __repr__(self) -> str:
        return (
            f"<ESPDevice(device_id='{self.device_id}', "
            f"zone='{self.zone_id}', status='{self.status}')>"
        )

    @property
    def is_online(self) -> bool:
        """Check if device is currently online"""
        return self.status == "online"

    @property
    def max_sensors(self) -> int:
        """Get maximum number of sensors from capabilities"""
        return self.capabilities.get("max_sensors", 0)

    @property
    def max_actuators(self) -> int:
        """Get maximum number of actuators from capabilities"""
        return self.capabilities.get("max_actuators", 0)
