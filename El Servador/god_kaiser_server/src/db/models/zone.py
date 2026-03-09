"""
Zone Model: Independent Zone Entity

Phase: 0.3 - Zone as DB Entity
Status: IMPLEMENTED

Zones are logical areas (greenhouse, office, balcony) that exist
independently of devices. Previously zones only existed as zone_id
strings on esp_devices — removing all devices from a zone caused it
to disappear. This model makes zones first-class DB entities.

NOTE: FK constraint from esp_devices.zone_id → zones.zone_id is
intentionally NOT added in this migration. Planned for a follow-up.
"""

import uuid
from typing import Optional

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..base import Base, TimestampMixin


class Zone(Base, TimestampMixin):
    """
    Zone Model.

    Represents a logical zone (area) that exists independently of devices.
    Devices reference zones via zone_id string; FK will be added later.

    Attributes:
        id: Primary key (UUID)
        zone_id: Unique human-readable identifier (e.g., 'greenhouse_zone_1')
        name: Display name (e.g., 'Greenhouse Section 1')
        description: Optional description
    """

    __tablename__ = "zones"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        doc="Primary key (UUID)",
    )

    zone_id: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
        doc="Unique human-readable zone identifier (e.g., 'greenhouse_zone_1')",
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Display name for the zone",
    )

    description: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        doc="Optional zone description",
    )

    def __repr__(self) -> str:
        return f"<Zone(zone_id='{self.zone_id}', name='{self.name}')>"
