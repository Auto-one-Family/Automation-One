"""
Subzone Repository: Database Operations for Subzone Configurations

Phase: 9 - Subzone Management
Status: IMPLEMENTED

Provides CRUD operations and specialized queries for SubzoneConfig model.
Follows the same patterns as ESPRepository for consistency.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.subzone import SubzoneConfig
from .base_repo import BaseRepository


class SubzoneRepository(BaseRepository[SubzoneConfig]):
    """
    Subzone Repository with subzone-specific queries.

    Extends BaseRepository with Subzone-specific operations like
    ESP lookups, GPIO conflict detection, and safe-mode management.
    """

    def __init__(self, session: AsyncSession):
        super().__init__(SubzoneConfig, session)

    # =========================================================================
    # Query Methods
    # =========================================================================

    async def get_by_esp_and_subzone(
        self, esp_id: str, subzone_id: str
    ) -> Optional[SubzoneConfig]:
        """
        Get subzone by ESP device ID and subzone ID.

        Args:
            esp_id: ESP device ID (e.g., ESP_AB12CD)
            subzone_id: Subzone identifier

        Returns:
            SubzoneConfig or None if not found
        """
        stmt = select(SubzoneConfig).where(
            and_(
                SubzoneConfig.esp_id == esp_id,
                SubzoneConfig.subzone_id == subzone_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_esp(self, esp_id: str) -> List[SubzoneConfig]:
        """
        Get all subzones for an ESP device.

        Args:
            esp_id: ESP device ID

        Returns:
            List of SubzoneConfig instances
        """
        stmt = select(SubzoneConfig).where(SubzoneConfig.esp_id == esp_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_zone(self, zone_id: str) -> List[SubzoneConfig]:
        """
        Get all subzones in a parent zone.

        Args:
            zone_id: Parent zone identifier

        Returns:
            List of SubzoneConfig instances
        """
        stmt = select(SubzoneConfig).where(SubzoneConfig.parent_zone_id == zone_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_safe_mode_active(self) -> List[SubzoneConfig]:
        """
        Get all subzones with safe-mode active.

        Returns:
            List of SubzoneConfig instances in safe-mode
        """
        stmt = select(SubzoneConfig).where(SubzoneConfig.safe_mode_active == True)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # =========================================================================
    # GPIO Conflict Detection
    # =========================================================================

    async def check_gpio_conflict(
        self, esp_id: str, gpios: List[int], exclude_subzone_id: Optional[str] = None
    ) -> Optional[SubzoneConfig]:
        """
        Check if any GPIO is already assigned to another subzone.

        Args:
            esp_id: ESP device ID
            gpios: List of GPIO pins to check
            exclude_subzone_id: Subzone ID to exclude (for updates)

        Returns:
            SubzoneConfig with conflict or None if no conflict
        """
        stmt = select(SubzoneConfig).where(SubzoneConfig.esp_id == esp_id)
        if exclude_subzone_id:
            stmt = stmt.where(SubzoneConfig.subzone_id != exclude_subzone_id)

        result = await self.session.execute(stmt)
        existing_subzones = result.scalars().all()

        for subzone in existing_subzones:
            if subzone.assigned_gpios:
                for gpio in gpios:
                    if gpio in subzone.assigned_gpios:
                        return subzone

        return None

    async def get_subzone_by_gpio(
        self, esp_id: str, gpio: int
    ) -> Optional[SubzoneConfig]:
        """
        Find which subzone a GPIO belongs to.

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number

        Returns:
            SubzoneConfig that owns this GPIO or None
        """
        subzones = await self.get_by_esp(esp_id)
        for subzone in subzones:
            if subzone.assigned_gpios and gpio in subzone.assigned_gpios:
                return subzone
        return None

    # =========================================================================
    # Create/Update Methods
    # =========================================================================

    async def create_subzone(
        self,
        esp_id: str,
        subzone_id: str,
        parent_zone_id: str,
        assigned_gpios: List[int],
        subzone_name: Optional[str] = None,
        safe_mode_active: bool = True,
    ) -> SubzoneConfig:
        """
        Create a new subzone configuration.

        Args:
            esp_id: ESP device ID
            subzone_id: Unique subzone identifier
            parent_zone_id: Parent zone ID
            assigned_gpios: List of GPIO pin numbers
            subzone_name: Human-readable name (optional)
            safe_mode_active: Whether subzone starts in safe-mode

        Returns:
            Created SubzoneConfig instance
        """
        return await self.create(
            esp_id=esp_id,
            subzone_id=subzone_id,
            subzone_name=subzone_name,
            parent_zone_id=parent_zone_id,
            assigned_gpios=assigned_gpios,
            safe_mode_active=safe_mode_active,
        )

    async def update_subzone(
        self,
        esp_id: str,
        subzone_id: str,
        **data,
    ) -> Optional[SubzoneConfig]:
        """
        Update subzone configuration.

        Args:
            esp_id: ESP device ID
            subzone_id: Subzone identifier
            **data: Fields to update

        Returns:
            Updated SubzoneConfig or None if not found
        """
        subzone = await self.get_by_esp_and_subzone(esp_id, subzone_id)
        if subzone is None:
            return None

        for key, value in data.items():
            if hasattr(subzone, key):
                setattr(subzone, key, value)

        await self.session.flush()
        await self.session.refresh(subzone)
        return subzone

    async def update_last_ack(
        self, esp_id: str, subzone_id: str
    ) -> Optional[SubzoneConfig]:
        """
        Update last ACK timestamp for a subzone.

        Args:
            esp_id: ESP device ID
            subzone_id: Subzone identifier

        Returns:
            Updated SubzoneConfig or None if not found
        """
        return await self.update_subzone(
            esp_id, subzone_id, last_ack_at=datetime.now(timezone.utc)
        )

    # =========================================================================
    # Safe-Mode Methods
    # =========================================================================

    async def enable_safe_mode(
        self, esp_id: str, subzone_id: str
    ) -> Optional[SubzoneConfig]:
        """
        Enable safe-mode for a subzone.

        Args:
            esp_id: ESP device ID
            subzone_id: Subzone identifier

        Returns:
            Updated SubzoneConfig or None if not found
        """
        return await self.update_subzone(esp_id, subzone_id, safe_mode_active=True)

    async def disable_safe_mode(
        self, esp_id: str, subzone_id: str
    ) -> Optional[SubzoneConfig]:
        """
        Disable safe-mode for a subzone.

        WARNING: This allows actuators to be controlled.

        Args:
            esp_id: ESP device ID
            subzone_id: Subzone identifier

        Returns:
            Updated SubzoneConfig or None if not found
        """
        return await self.update_subzone(esp_id, subzone_id, safe_mode_active=False)

    # =========================================================================
    # Delete Methods
    # =========================================================================

    async def delete_by_esp_and_subzone(
        self, esp_id: str, subzone_id: str
    ) -> bool:
        """
        Delete a subzone by ESP and subzone ID.

        Args:
            esp_id: ESP device ID
            subzone_id: Subzone identifier

        Returns:
            True if deleted, False if not found
        """
        subzone = await self.get_by_esp_and_subzone(esp_id, subzone_id)
        if subzone is None:
            return False

        await self.session.delete(subzone)
        await self.session.flush()
        return True

    async def delete_all_by_esp(self, esp_id: str) -> int:
        """
        Delete all subzones for an ESP device.

        Args:
            esp_id: ESP device ID

        Returns:
            Number of subzones deleted
        """
        subzones = await self.get_by_esp(esp_id)
        count = len(subzones)

        for subzone in subzones:
            await self.session.delete(subzone)

        await self.session.flush()
        return count

    # =========================================================================
    # Count Methods
    # =========================================================================

    async def count_by_esp(self, esp_id: str) -> int:
        """
        Count subzones for an ESP device.

        Args:
            esp_id: ESP device ID

        Returns:
            Number of subzones
        """
        subzones = await self.get_by_esp(esp_id)
        return len(subzones)

    async def count_gpios_by_esp(self, esp_id: str) -> int:
        """
        Count total GPIOs assigned across all subzones for an ESP.

        Args:
            esp_id: ESP device ID

        Returns:
            Total number of assigned GPIOs
        """
        subzones = await self.get_by_esp(esp_id)
        total = 0
        for subzone in subzones:
            if subzone.assigned_gpios:
                total += len(subzone.assigned_gpios)
        return total











