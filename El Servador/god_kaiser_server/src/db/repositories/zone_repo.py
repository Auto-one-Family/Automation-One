"""
Zone Repository: Database Operations for Zone Entity

Phase: 0.3 - Zone as DB Entity
Status: IMPLEMENTED

Provides CRUD operations for the Zone model.
Uses UUID primary key but zone_id (unique string) is the primary lookup key,
so this doesn't extend BaseRepository (same pattern as ZoneContextRepository).
"""

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.zone import Zone


class ZoneRepository:
    """
    Zone Repository with zone-specific queries.

    Zone uses UUID PK but zone_id (unique string) is the primary lookup key.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        zone_id: str,
        name: str,
        description: Optional[str] = None,
    ) -> Zone:
        """Create a new zone."""
        zone = Zone(
            zone_id=zone_id,
            name=name,
            description=description,
        )
        self.session.add(zone)
        await self.session.flush()
        await self.session.refresh(zone)
        return zone

    async def get_by_id(self, id: uuid.UUID) -> Optional[Zone]:
        """Get zone by UUID primary key."""
        stmt = select(Zone).where(Zone.id == id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_zone_id(self, zone_id: str) -> Optional[Zone]:
        """Get zone by human-readable zone_id string."""
        stmt = select(Zone).where(Zone.zone_id == zone_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self) -> list[Zone]:
        """Get all zones ordered by zone_id."""
        stmt = select(Zone).order_by(Zone.zone_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update(
        self,
        id: uuid.UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[Zone]:
        """Update zone fields. Only provided (non-None) values are updated."""
        zone = await self.get_by_id(id)
        if not zone:
            return None

        if name is not None:
            zone.name = name
        if description is not None:
            zone.description = description

        await self.session.flush()
        await self.session.refresh(zone)
        return zone

    async def delete(self, id: uuid.UUID) -> bool:
        """Delete zone by UUID. Returns True if deleted, False if not found."""
        zone = await self.get_by_id(id)
        if not zone:
            return False

        await self.session.delete(zone)
        await self.session.flush()
        return True

    async def count(self) -> int:
        """Count total zones."""
        stmt = select(func.count()).select_from(Zone)
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def exists_by_zone_id(self, zone_id: str) -> bool:
        """Check if a zone with the given zone_id exists."""
        stmt = select(func.count()).select_from(Zone).where(Zone.zone_id == zone_id)
        result = await self.session.execute(stmt)
        return result.scalar_one() > 0
