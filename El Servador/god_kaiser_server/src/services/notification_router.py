"""
Notification Router Service: Central Notification Routing

Phase 4A.1: Notification-Stack Backend
Priority: HIGH
Status: IMPLEMENTED

Every notification goes through this service:
1. ALWAYS persist to DB
2. Load user preferences
3. WebSocket broadcast (notification_new)
4. Email based on severity + quiet hours + digest rules
5. Optional webhook

Routing Rules (ISA-18.2):
- Critical → immediate email
- Warning (first of day) → immediate email, then → digest queue
- Info → no email
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.logging_config import get_logger
from ..db.models.notification import Notification, NotificationSeverity
from ..db.models.user import User
from ..db.repositories.notification_repo import (
    NotificationPreferencesRepository,
    NotificationRepository,
)
from ..db.repositories.user_repo import UserRepository
from ..schemas.notification import NotificationCreate
from ..websocket.manager import WebSocketManager
from .email_service import EmailService, get_email_service

logger = get_logger(__name__)


class NotificationRouter:
    """
    Central notification routing service.

    All notifications flow through route() which handles:
    - DB persistence
    - Deduplication (60s window)
    - Cascade suppression (parent_notification_id)
    - WebSocket broadcast
    - Email delivery (severity-based)
    """

    def __init__(
        self,
        session: AsyncSession,
        email_service: Optional[EmailService] = None,
    ):
        self.session = session
        self.notification_repo = NotificationRepository(session)
        self.preferences_repo = NotificationPreferencesRepository(session)
        self.user_repo = UserRepository(session)
        self.email_service = email_service or get_email_service()

    async def route(self, notification: NotificationCreate) -> Optional[Notification]:
        """
        Route a notification through all channels.

        Args:
            notification: NotificationCreate schema with all details

        Returns:
            Persisted Notification model, or None if deduplicated
        """
        user_id = notification.user_id

        # If no user_id, broadcast to all users
        if user_id is None:
            return await self._broadcast_to_all(notification)

        # Step 0: Deduplication check (60s window)
        is_duplicate = await self.notification_repo.check_duplicate(
            user_id=user_id,
            source=notification.source,
            category=notification.category,
            title=notification.title,
            window_seconds=60,
        )
        if is_duplicate:
            logger.debug(
                f"Notification deduplicated: '{notification.title}' for user {user_id}"
            )
            return None

        # Step 1: ALWAYS persist to DB
        db_notification = await self.notification_repo.create(
            user_id=user_id,
            channel=notification.channel,
            severity=notification.severity,
            category=notification.category,
            title=notification.title,
            body=notification.body,
            metadata=notification.metadata,
            source=notification.source,
            parent_notification_id=notification.parent_notification_id,
        )

        logger.info(
            f"Notification created: id={db_notification.id}, "
            f"severity={notification.severity}, source={notification.source}, "
            f"title='{notification.title}'"
        )

        # Step 2: Load user preferences
        prefs = await self.preferences_repo.get_or_create(user_id)

        # Step 3: WebSocket broadcast
        if prefs.websocket_enabled:
            await self._broadcast_websocket(db_notification)

        # Step 4: Email routing (based on severity + quiet hours + digest)
        if prefs.email_enabled and self.email_service.is_available:
            await self._route_email(db_notification, prefs)

        # Step 5: Commit the session
        await self.session.commit()

        return db_notification

    async def _broadcast_to_all(self, notification: NotificationCreate) -> Optional[Notification]:
        """Broadcast notification to all users (system-wide alerts)."""
        # Get all active users
        users = await self.user_repo.get_active_users()
        first_notification = None

        for user in users:
            user_notification = NotificationCreate(
                user_id=user.id,
                channel=notification.channel,
                severity=notification.severity,
                category=notification.category,
                title=notification.title,
                body=notification.body,
                metadata=notification.metadata,
                source=notification.source,
                parent_notification_id=notification.parent_notification_id,
            )
            result = await self.route(user_notification)
            if result and first_notification is None:
                first_notification = result

        return first_notification

    async def _broadcast_websocket(self, notification: Notification) -> None:
        """Broadcast notification via WebSocket."""
        try:
            ws_manager = await WebSocketManager.get_instance()
            data = {
                "id": str(notification.id),
                "user_id": notification.user_id,
                "severity": notification.severity,
                "category": notification.category,
                "title": notification.title,
                "body": notification.body,
                "source": notification.source,
                "metadata": notification.metadata,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat() if notification.created_at else None,
            }
            await ws_manager.broadcast("notification_new", data)
            logger.debug(f"WebSocket broadcast: notification_new for user {notification.user_id}")
        except Exception as e:
            # WebSocket failure MUST NOT block notification processing
            logger.error(f"WebSocket broadcast failed: {e}")

    async def _route_email(self, notification: Notification, prefs) -> None:
        """
        Route email based on severity + ISA-18.2 rules.

        - Critical → immediate email
        - Warning (first of day for this source) → immediate, rest → digest queue
        - Info → no email
        """
        severity = notification.severity

        # Check if severity is in user's email_severities list
        email_severities = prefs.email_severities or ["critical", "warning"]
        if severity not in email_severities:
            return

        # Check quiet hours
        if self._is_quiet_hours(prefs):
            # During quiet hours, only send critical
            if severity != NotificationSeverity.CRITICAL:
                logger.debug(
                    f"Email suppressed (quiet hours): {notification.title}"
                )
                return

        # Get recipient email
        recipient = await self._get_email_address(notification.user_id, prefs)
        if not recipient:
            return

        # Route by severity
        if severity == NotificationSeverity.CRITICAL:
            # Critical → always immediate email
            await self._send_critical_email(notification, recipient)

        elif severity == NotificationSeverity.WARNING:
            # Warning → first of day immediate, rest → digest queue
            today_count = await self.notification_repo.count_today_warnings(
                user_id=notification.user_id,
                source=notification.source,
            )
            if today_count <= 1:
                # First warning of the day → send immediately
                await self._send_critical_email(notification, recipient)
            # Subsequent warnings → handled by DigestService

    def _is_quiet_hours(self, prefs) -> bool:
        """Check if current time is within quiet hours."""
        if not prefs.quiet_hours_enabled:
            return False

        try:
            now = datetime.now(timezone.utc).time()
            start_parts = prefs.quiet_hours_start.split(":")
            end_parts = prefs.quiet_hours_end.split(":")

            from datetime import time as dt_time

            start = dt_time(int(start_parts[0]), int(start_parts[1]))
            end = dt_time(int(end_parts[0]), int(end_parts[1]))

            if start <= end:
                return start <= now <= end
            else:
                # Overnight range (e.g., 22:00 - 07:00)
                return now >= start or now <= end
        except Exception as e:
            logger.warning(f"Error checking quiet hours: {e}")
            return False

    async def _get_email_address(self, user_id: int, prefs) -> Optional[str]:
        """Get the email address for notifications."""
        if prefs.email_address:
            return prefs.email_address

        user = await self.user_repo.get_by_id(user_id)
        if user and user.email:
            return user.email

        return None

    async def _send_critical_email(self, notification: Notification, recipient: str) -> None:
        """Send an immediate alert email (non-blocking)."""
        try:
            success = await self.email_service.send_critical_alert(
                to=recipient,
                title=notification.title,
                body=notification.body or "",
                severity=notification.severity,
                source=notification.source,
                category=notification.category,
                metadata=notification.metadata,
            )
            if success:
                logger.info(f"Alert email sent to {recipient}: {notification.title}")
            else:
                logger.warning(f"Alert email failed for {recipient}: {notification.title}")
        except Exception as e:
            # Email failure MUST NOT block notification processing
            logger.error(f"Email delivery error: {e}")

    async def broadcast_notification_updated(self, notification: Notification) -> None:
        """Broadcast notification_updated event via WebSocket (e.g., after mark-as-read)."""
        try:
            ws_manager = await WebSocketManager.get_instance()
            data = {
                "id": str(notification.id),
                "user_id": notification.user_id,
                "is_read": notification.is_read,
                "is_archived": notification.is_archived,
                "read_at": notification.read_at.isoformat() if notification.read_at else None,
            }
            await ws_manager.broadcast("notification_updated", data)
            logger.debug(f"WebSocket broadcast: notification_updated for {notification.id}")
        except Exception as e:
            logger.error(f"Failed to broadcast notification_updated: {e}")

    async def broadcast_unread_count(self, user_id: int) -> None:
        """Broadcast updated unread count via WebSocket."""
        try:
            count = await self.notification_repo.get_unread_count(user_id)
            highest = await self.notification_repo.get_highest_unread_severity(user_id)

            ws_manager = await WebSocketManager.get_instance()
            await ws_manager.broadcast(
                "notification_unread_count",
                {
                    "user_id": user_id,
                    "unread_count": count,
                    "highest_severity": highest,
                },
            )
        except Exception as e:
            logger.error(f"Failed to broadcast unread count: {e}")
