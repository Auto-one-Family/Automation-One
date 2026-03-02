"""
Notification Models: Notifications and User Notification Preferences

Phase 4A.1: Notification-Stack Backend
Priority: HIGH
Status: IMPLEMENTED

Tables:
- notifications: All system notifications (alerts, emails, webhooks)
- notification_preferences: Per-user notification delivery settings
"""

import uuid
from datetime import datetime, time, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..base import Base, TimestampMixin


class Notification(Base, TimestampMixin):
    """
    Notification Model.

    Central storage for all system notifications. Every notification
    (WebSocket, email, webhook) is persisted here first, then routed
    to the appropriate channels by NotificationRouter.

    Performance Indexes:
    - user_unread: Fast unread-count queries (user_id + is_read + is_archived)
    - created: Time-range queries and retention cleanup
    - source_category: Filtering by source and category
    - severity: Filtering by severity level

    Attributes:
        id: Primary key (UUID)
        user_id: Target user (FK to user_accounts.id)
        channel: Delivery channel (websocket, email, webhook)
        severity: Notification severity (critical, warning, info, resolved)
        category: Alert category (connectivity, data_quality, infrastructure, etc.)
        title: Short notification title
        body: Full notification body text
        metadata: JSON field with context (esp_id, sensor_type, rule_id, etc.)
        source: Origin of notification (logic_engine, mqtt_handler, grafana, etc.)
        is_read: Whether user has read this notification
        is_archived: Whether notification is archived
        digest_sent: Whether included in a digest email
        parent_notification_id: For cascade suppression (root-cause grouping)
        read_at: Timestamp when user read the notification
    """

    __tablename__ = "notifications"

    __table_args__ = (
        Index(
            "ix_notifications_user_unread",
            "user_id",
            "is_read",
            "is_archived",
        ),
        Index("ix_notifications_created_at", "created_at"),
        Index("ix_notifications_source_category", "source", "category"),
        Index("ix_notifications_severity", "severity"),
    )

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        doc="Primary key (UUID)",
    )

    # Target User
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("user_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Target user ID (FK to user_accounts)",
    )

    # Classification
    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        doc="Delivery channel (websocket, email, webhook)",
    )

    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="info",
        doc="Notification severity (critical, warning, info, resolved)",
    )

    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="system",
        doc="Alert category (connectivity, data_quality, infrastructure, lifecycle, maintenance, security)",
    )

    # Content
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="Short notification title",
    )

    body: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        doc="Full notification body text",
    )

    metadata: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        doc="JSON context (esp_id, sensor_type, rule_id, grafana_uid, etc.)",
    )

    # Origin
    source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Notification origin (logic_engine, mqtt_handler, grafana, sensor_threshold, device_event, manual, system)",
    )

    # State
    is_read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether user has read this notification",
    )

    is_archived: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether notification is archived",
    )

    digest_sent: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether this notification was included in a digest email",
    )

    # Cascade Suppression (ISA-18.2 root-cause grouping)
    parent_notification_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notifications.id", ondelete="SET NULL"),
        nullable=True,
        doc="Parent notification for cascade suppression",
    )

    # Read Tracking
    read_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Timestamp when user read the notification",
    )

    def __repr__(self) -> str:
        return (
            f"<Notification(title='{self.title}', "
            f"severity='{self.severity}', source='{self.source}')>"
        )

    @property
    def is_critical(self) -> bool:
        """Check if this is a critical notification."""
        return self.severity == "critical"

    @property
    def is_warning(self) -> bool:
        """Check if this is a warning notification."""
        return self.severity == "warning"


class NotificationPreferences(Base, TimestampMixin):
    """
    User Notification Preferences.

    Per-user settings for notification delivery: which channels are enabled,
    email configuration, quiet hours, and digest preferences.

    Attributes:
        user_id: Primary key + FK to user_accounts.id (1:1 relationship)
        websocket_enabled: Whether to send WebSocket notifications
        email_enabled: Whether to send email notifications
        email_address: Override email for notifications (uses user.email if None)
        email_severities: JSON list of severities that trigger email
        quiet_hours_enabled: Whether quiet hours are active
        quiet_hours_start: Start of quiet hours (HH:MM)
        quiet_hours_end: End of quiet hours (HH:MM)
        digest_interval_minutes: Interval for digest emails (0 = disabled)
        browser_notifications: Whether to request browser notification permission
    """

    __tablename__ = "notification_preferences"

    # Primary Key = User FK (1:1 relationship)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("user_accounts.id", ondelete="CASCADE"),
        primary_key=True,
        doc="User ID (PK + FK to user_accounts)",
    )

    # WebSocket
    websocket_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        doc="Whether WebSocket notifications are enabled",
    )

    # Email
    email_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether email notifications are enabled",
    )

    email_address: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        doc="Override email for notifications (uses user.email if None)",
    )

    email_severities: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: ["critical", "warning"],
        nullable=False,
        doc="JSON list of severities that trigger email delivery",
    )

    # Quiet Hours
    quiet_hours_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether quiet hours are active",
    )

    quiet_hours_start: Mapped[Optional[str]] = mapped_column(
        String(5),
        nullable=True,
        default="22:00",
        doc="Start of quiet hours (HH:MM format)",
    )

    quiet_hours_end: Mapped[Optional[str]] = mapped_column(
        String(5),
        nullable=True,
        default="07:00",
        doc="End of quiet hours (HH:MM format)",
    )

    # Digest
    digest_interval_minutes: Mapped[int] = mapped_column(
        Integer,
        default=60,
        nullable=False,
        doc="Interval for digest emails in minutes (0 = disabled)",
    )

    # Browser
    browser_notifications: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether to request browser notification permission",
    )

    def __repr__(self) -> str:
        return (
            f"<NotificationPreferences(user_id={self.user_id}, "
            f"email={self.email_enabled}, ws={self.websocket_enabled})>"
        )


# Severity Constants
class NotificationSeverity:
    """Notification severity level constants."""

    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"
    RESOLVED = "resolved"


# Source Constants
class NotificationSource:
    """Notification source constants."""

    LOGIC_ENGINE = "logic_engine"
    MQTT_HANDLER = "mqtt_handler"
    GRAFANA = "grafana"
    SENSOR_THRESHOLD = "sensor_threshold"
    DEVICE_EVENT = "device_event"
    AUTOOPS = "autoops"
    MANUAL = "manual"
    SYSTEM = "system"


# Category Constants
class NotificationCategory:
    """Notification category constants."""

    CONNECTIVITY = "connectivity"
    DATA_QUALITY = "data_quality"
    INFRASTRUCTURE = "infrastructure"
    LIFECYCLE = "lifecycle"
    MAINTENANCE = "maintenance"
    SECURITY = "security"
    SYSTEM = "system"
