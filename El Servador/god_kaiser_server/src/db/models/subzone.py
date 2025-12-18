"""
Subzone Configuration Model

Phase: 9 - Subzone Management
Status: IMPLEMENTED

Stores subzone configurations for ESP devices.
Each subzone groups GPIO pins for feingranulare Kontrolle.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .esp import ESPDevice


class SubzoneConfig(Base, TimestampMixin):
    """
    Subzone Configuration Model.

    Represents a logical grouping of GPIO pins within an ESP's zone.
    Enables pin-level control and safe-mode operations.

    Attributes:
        id: Primary key (UUID)
        esp_id: Foreign key to esp_devices.device_id
        subzone_id: Unique subzone identifier within ESP
        subzone_name: Human-readable name
        parent_zone_id: Zone this subzone belongs to (must match ESP zone_id)
        assigned_gpios: JSON array of GPIO pin numbers
        safe_mode_active: Whether subzone is in safe-mode
        sensor_count: Number of sensors in subzone (from ESP)
        actuator_count: Number of actuators in subzone (from ESP)
    """

    __tablename__ = "subzone_configs"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        doc="Primary key (UUID)",
    )

    # Foreign Key to ESP Device
    esp_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("esp_devices.device_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="ESP device ID (e.g., ESP_AB12CD)",
    )

    # Subzone Identity
    subzone_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Unique subzone identifier (e.g., 'irrigation_section_A')",
    )

    subzone_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        doc="Human-readable subzone name",
    )

    # Zone Hierarchy
    parent_zone_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Parent zone ID (must match ESP's zone_id)",
    )

    # GPIO Assignment
    assigned_gpios: Mapped[List[int]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
        doc="JSON array of GPIO pin numbers [4, 5, 6]",
    )

    # Safe-Mode Status
    safe_mode_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        doc="Whether subzone is currently in safe-mode",
    )

    # Counts (from ESP ACK)
    sensor_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        doc="Number of sensors in this subzone",
    )

    actuator_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        doc="Number of actuators in this subzone",
    )

    # Metadata
    last_ack_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        doc="Last ACK timestamp from ESP",
    )

    # Relationship to ESP
    esp: Mapped["ESPDevice"] = relationship(
        "ESPDevice",
        back_populates="subzones",
    )

    # Unique constraint: one subzone_id per ESP
    __table_args__ = (
        UniqueConstraint("esp_id", "subzone_id", name="uq_esp_subzone"),
    )

    def __repr__(self) -> str:
        return (
            f"<SubzoneConfig(esp_id='{self.esp_id}', "
            f"subzone_id='{self.subzone_id}', "
            f"gpios={self.assigned_gpios})>"
        )

    @property
    def gpio_count(self) -> int:
        """Get number of assigned GPIOs."""
        return len(self.assigned_gpios) if self.assigned_gpios else 0

