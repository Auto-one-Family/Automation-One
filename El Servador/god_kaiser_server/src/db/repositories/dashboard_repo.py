"""
Dashboard Repository

CRUD operations for dashboard layouts with owner/shared filtering.
"""

import uuid
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.dashboard import Dashboard
from .base_repo import BaseRepository


class DashboardRepository(BaseRepository[Dashboard]):
    """
    Dashboard Repository with dashboard-specific queries.

    Provides methods for querying dashboards by owner, shared status,
    scope, and zone.
    """

    def __init__(self, session: AsyncSession):
        super().__init__(Dashboard, session)

    async def get_user_dashboards(
        self,
        owner_id: int,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Dashboard]:
        """
        Get dashboards owned by a user OR shared dashboards.

        Args:
            owner_id: User ID
            skip: Pagination offset
            limit: Maximum results

        Returns:
            List of Dashboard instances (owned + shared)
        """
        stmt = (
            select(Dashboard)
            .where(
                or_(
                    Dashboard.owner_id == owner_id,
                    Dashboard.is_shared == True,
                )
            )
            .order_by(Dashboard.updated_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_user_dashboards(self, owner_id: int) -> int:
        """
        Count dashboards visible to a user (owned + shared).

        Args:
            owner_id: User ID

        Returns:
            Total count
        """
        stmt = (
            select(func.count())
            .select_from(Dashboard)
            .where(
                or_(
                    Dashboard.owner_id == owner_id,
                    Dashboard.is_shared == True,
                )
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def get_by_zone(
        self,
        zone_id: str,
        owner_id: Optional[int] = None,
    ) -> list[Dashboard]:
        """
        Get dashboards for a specific zone.

        Args:
            zone_id: Zone identifier
            owner_id: Optional owner filter

        Returns:
            List of zone-scoped Dashboard instances
        """
        conditions = [
            Dashboard.scope == "zone",
            Dashboard.zone_id == zone_id,
        ]
        if owner_id is not None:
            conditions.append(
                or_(
                    Dashboard.owner_id == owner_id,
                    Dashboard.is_shared == True,
                )
            )

        stmt = select(Dashboard).where(*conditions).order_by(Dashboard.updated_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_auto_generated(
        self,
        zone_id: str,
    ) -> Optional[Dashboard]:
        """
        Get auto-generated dashboard for a zone.

        Args:
            zone_id: Zone identifier

        Returns:
            Auto-generated Dashboard or None
        """
        stmt = (
            select(Dashboard)
            .where(
                Dashboard.auto_generated == True,
                Dashboard.scope == "zone",
                Dashboard.zone_id == zone_id,
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def is_owner(self, dashboard_id: uuid.UUID, user_id: int) -> bool:
        """
        Check if a user owns a dashboard.

        Args:
            dashboard_id: Dashboard UUID
            user_id: User ID

        Returns:
            True if user owns the dashboard
        """
        stmt = (
            select(func.count())
            .select_from(Dashboard)
            .where(
                Dashboard.id == dashboard_id,
                Dashboard.owner_id == user_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one() > 0
