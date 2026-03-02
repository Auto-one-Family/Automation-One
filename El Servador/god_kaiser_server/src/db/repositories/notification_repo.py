"""
Notification Repository: CRUD + Filtered Queries

Phase 4A.1: Notification-Stack Backend
Priority: HIGH
Status: IMPLEMENTED
"""

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple

from sqlalchemy import and_, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.notification import (
    Notification,
    NotificationPreferences,
    NotificationSeverity,
)
from .base_repo import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    """Repository for notification CRUD and filtered queries."""

    def __init__(self, session: AsyncSession):
        super().__init__(Notification, session)

    async def get_for_user(
        self,
        user_id: int,
        severity: Optional[str] = None,
        category: Optional[str] = None,
        source: Optional[str] = None,
        is_read: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Notification], int]:
        """
        Get paginated notifications for a user with optional filters.

        Returns:
            Tuple of (notifications, total_count)
        """
        conditions = [Notification.user_id == user_id, Notification.is_archived == False]

        if severity is not None:
            conditions.append(Notification.severity == severity)
        if category is not None:
            conditions.append(Notification.category == category)
        if source is not None:
            conditions.append(Notification.source == source)
        if is_read is not None:
            conditions.append(Notification.is_read == is_read)

        where_clause = and_(*conditions)

        # Count
        count_stmt = select(func.count()).select_from(Notification).where(where_clause)
        count_result = await self.session.execute(count_stmt)
        total = count_result.scalar_one()

        # Data
        data_stmt = (
            select(Notification)
            .where(where_clause)
            .order_by(desc(Notification.created_at))
            .offset(skip)
            .limit(limit)
        )
        data_result = await self.session.execute(data_stmt)
        notifications = list(data_result.scalars().all())

        return notifications, total

    async def get_unread_count(self, user_id: int) -> int:
        """Get count of unread, non-archived notifications for a user."""
        stmt = (
            select(func.count())
            .select_from(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.is_read == False,
                    Notification.is_archived == False,
                )
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def get_highest_unread_severity(self, user_id: int) -> Optional[str]:
        """Get the highest severity among unread notifications."""
        severity_order = {
            NotificationSeverity.CRITICAL: 0,
            NotificationSeverity.WARNING: 1,
            NotificationSeverity.INFO: 2,
            NotificationSeverity.RESOLVED: 3,
        }

        stmt = (
            select(Notification.severity)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.is_read == False,
                    Notification.is_archived == False,
                )
            )
            .distinct()
        )
        result = await self.session.execute(stmt)
        severities = [row[0] for row in result.all()]

        if not severities:
            return None

        return min(severities, key=lambda s: severity_order.get(s, 99))

    async def mark_as_read(self, notification_id: uuid.UUID, user_id: int) -> Optional[Notification]:
        """Mark a single notification as read."""
        stmt = (
            select(Notification)
            .where(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user_id,
                )
            )
        )
        result = await self.session.execute(stmt)
        notification = result.scalar_one_or_none()

        if notification and not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.now(timezone.utc)
            await self.session.flush()
            await self.session.refresh(notification)

        return notification

    async def mark_all_as_read(self, user_id: int) -> int:
        """Mark all unread notifications as read for a user. Returns count updated."""
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.is_read == False,
                    Notification.is_archived == False,
                )
            )
            .values(is_read=True, read_at=now, updated_at=now)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount

    async def get_pending_digest_notifications(
        self,
        user_id: int,
        min_count: int = 3,
    ) -> List[Notification]:
        """Get warning notifications not yet sent in a digest."""
        stmt = (
            select(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.severity == NotificationSeverity.WARNING,
                    Notification.digest_sent == False,
                    Notification.is_archived == False,
                )
            )
            .order_by(Notification.created_at)
        )
        result = await self.session.execute(stmt)
        notifications = list(result.scalars().all())

        if len(notifications) < min_count:
            return []

        return notifications

    async def mark_digest_sent(self, notification_ids: List[uuid.UUID]) -> int:
        """Mark notifications as included in a digest email."""
        if not notification_ids:
            return 0
        stmt = (
            update(Notification)
            .where(Notification.id.in_(notification_ids))
            .values(digest_sent=True, updated_at=datetime.now(timezone.utc))
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount

    async def check_duplicate(
        self,
        user_id: int,
        source: str,
        category: str,
        title: str,
        window_seconds: int = 60,
    ) -> bool:
        """Check if a similar notification exists within the dedup window."""
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        stmt = (
            select(func.count())
            .select_from(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.source == source,
                    Notification.category == category,
                    Notification.title == title,
                    Notification.created_at >= cutoff,
                )
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one() > 0

    async def count_today_warnings(self, user_id: int, source: str) -> int:
        """Count warning notifications sent today for a user+source."""
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        stmt = (
            select(func.count())
            .select_from(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.source == source,
                    Notification.severity == NotificationSeverity.WARNING,
                    Notification.created_at >= today_start,
                )
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()


class NotificationPreferencesRepository:
    """Repository for user notification preferences."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_for_user(self, user_id: int) -> Optional[NotificationPreferences]:
        """Get preferences for a user."""
        stmt = select(NotificationPreferences).where(
            NotificationPreferences.user_id == user_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create(self, user_id: int) -> NotificationPreferences:
        """Get preferences, creating defaults if they don't exist."""
        prefs = await self.get_for_user(user_id)
        if prefs is None:
            prefs = NotificationPreferences(user_id=user_id)
            self.session.add(prefs)
            await self.session.flush()
            await self.session.refresh(prefs)
        return prefs

    async def update(self, user_id: int, **data: Any) -> NotificationPreferences:
        """Update preferences for a user (creates if not exists)."""
        prefs = await self.get_or_create(user_id)
        for key, value in data.items():
            if value is not None and hasattr(prefs, key):
                setattr(prefs, key, value)
        await self.session.flush()
        await self.session.refresh(prefs)
        return prefs

    async def get_all_with_email_enabled(self) -> List[NotificationPreferences]:
        """Get all users with email notifications enabled."""
        stmt = select(NotificationPreferences).where(
            NotificationPreferences.email_enabled == True
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
