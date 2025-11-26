"""
ESP Repository: Device Queries and Updates
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.esp import ESPDevice
from .base_repo import BaseRepository


class ESPRepository(BaseRepository[ESPDevice]):
    """
    ESP Repository with device-specific queries.

    Extends BaseRepository with ESP32-specific operations like
    device_id lookups, zone queries, and status management.
    """

    def __init__(self, session: AsyncSession):
        super().__init__(ESPDevice, session)

    async def get_by_device_id(self, device_id: str) -> Optional[ESPDevice]:
        """
        Get ESP device by device_id.

        Args:
            device_id: ESP device ID (e.g., ESP_A1B2C3D4)

        Returns:
            ESPDevice or None if not found
        """
        stmt = select(ESPDevice).where(ESPDevice.device_id == device_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_zone(self, zone_id: str) -> list[ESPDevice]:
        """
        Get all ESP devices in a zone.

        Args:
            zone_id: Zone identifier

        Returns:
            List of ESPDevice instances
        """
        stmt = select(ESPDevice).where(ESPDevice.zone_id == zone_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_zone_masters(self, zone_id: Optional[str] = None) -> list[ESPDevice]:
        """
        Get zone master devices.

        Args:
            zone_id: Optional zone ID filter

        Returns:
            List of zone master ESPDevice instances
        """
        stmt = select(ESPDevice).where(ESPDevice.is_zone_master == True)
        if zone_id:
            stmt = stmt.where(ESPDevice.zone_id == zone_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_online(self) -> list[ESPDevice]:
        """
        Get all online ESP devices.

        Returns:
            List of online ESPDevice instances
        """
        stmt = select(ESPDevice).where(ESPDevice.status == "online")
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_status(self, status: str) -> list[ESPDevice]:
        """
        Get ESP devices by status.

        Args:
            status: Device status (online, offline, error, unknown)

        Returns:
            List of ESPDevice instances
        """
        stmt = select(ESPDevice).where(ESPDevice.status == status)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_hardware_type(self, hardware_type: str) -> list[ESPDevice]:
        """
        Get ESP devices by hardware type.

        Args:
            hardware_type: Hardware type (ESP32_WROOM, XIAO_ESP32_C3)

        Returns:
            List of ESPDevice instances
        """
        stmt = select(ESPDevice).where(ESPDevice.hardware_type == hardware_type)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_status(
        self, device_id: str, status: str, last_seen: Optional[datetime] = None
    ) -> Optional[ESPDevice]:
        """
        Update device status and last_seen timestamp.

        Args:
            device_id: ESP device ID
            status: New status (online, offline, error, unknown)
            last_seen: Optional last_seen timestamp (defaults to now)

        Returns:
            Updated ESPDevice or None if not found
        """
        device = await self.get_by_device_id(device_id)
        if device is None:
            return None

        device.status = status
        device.last_seen = last_seen or datetime.utcnow()

        await self.session.flush()
        await self.session.refresh(device)
        return device

    async def update_capabilities(
        self, device_id: str, capabilities: dict
    ) -> Optional[ESPDevice]:
        """
        Update device capabilities.

        Args:
            device_id: ESP device ID
            capabilities: New capabilities dict

        Returns:
            Updated ESPDevice or None if not found
        """
        device = await self.get_by_device_id(device_id)
        if device is None:
            return None

        device.capabilities = capabilities

        await self.session.flush()
        await self.session.refresh(device)
        return device

    async def assign_zone(
        self, device_id: str, zone_id: str, zone_name: str, is_zone_master: bool = False
    ) -> Optional[ESPDevice]:
        """
        Assign device to a zone.

        Args:
            device_id: ESP device ID
            zone_id: Zone identifier
            zone_name: Human-readable zone name
            is_zone_master: Whether device is zone master

        Returns:
            Updated ESPDevice or None if not found
        """
        device = await self.get_by_device_id(device_id)
        if device is None:
            return None

        device.zone_id = zone_id
        device.zone_name = zone_name
        device.is_zone_master = is_zone_master

        await self.session.flush()
        await self.session.refresh(device)
        return device
