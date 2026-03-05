"""
Database Models Package

This module imports all models to ensure they are registered with SQLAlchemy's Base.metadata.
All models should be imported here so that Base.metadata.create_all() includes all tables.
"""

# Import all model modules to ensure SQLAlchemy registers them
from . import (  # noqa: F401
    actuator,
    ai,
    audit_log,  # AuditLog model for event tracking
    auth,  # TokenBlacklist model
    dashboard,  # Dashboard layout persistence
    diagnostic,  # Diagnostic reports (Phase 4D)
    email_log,  # Email delivery tracking (Phase C V1.1)
    enums,  # Shared enums (DataSource, SensorOperatingMode, etc.)
    esp,
    esp_heartbeat,  # ESP Heartbeat History (Time-Series)
    kaiser,
    library,
    logic,
    notification,  # Notification + Preferences (Phase 4A.1)
    plugin,  # Plugin configs + execution history (Phase 4C)
    sensor,
    sensor_type_defaults,  # Sensor type default configuration (Phase 2A)
    subzone,  # Subzone configuration model (Phase 9)
    system,
    user,
    zone_context,  # Zone business context (Phase K3)
)

# Explicitly export models for convenience (optional, but helpful)
from .actuator import ActuatorConfig, ActuatorState, ActuatorHistory  # noqa: F401
from .ai import AIPredictions  # noqa: F401
from .audit_log import AuditLog, AuditEventType, AuditSeverity, AuditSourceType  # noqa: F401
from .auth import TokenBlacklist  # noqa: F401
from .dashboard import Dashboard  # noqa: F401
from .diagnostic import DiagnosticReport  # noqa: F401
from .email_log import EmailLog  # noqa: F401
from .enums import DataSource, SensorOperatingMode  # noqa: F401
from .esp import ESPDevice  # noqa: F401
from .esp_heartbeat import (
    ESPHeartbeatLog,
    HeartbeatHealthStatus,
    determine_health_status,
)  # noqa: F401
from .kaiser import KaiserRegistry, ESPOwnership  # noqa: F401
from .library import LibraryMetadata  # noqa: F401
from .logic import CrossESPLogic, LogicExecutionHistory  # noqa: F401
from .notification import (
    Notification,
    NotificationCategory,
    NotificationPreferences,
    NotificationSeverity,
    NotificationSource,
)  # noqa: F401
from .sensor import SensorConfig, SensorData  # noqa: F401
from .sensor_type_defaults import SensorTypeDefaults  # noqa: F401
from .plugin import PluginConfig, PluginExecution  # noqa: F401
from .subzone import SubzoneConfig  # noqa: F401
from .system import SystemConfig  # noqa: F401
from .user import User  # noqa: F401
from .zone_context import ZoneContext  # noqa: F401

__all__ = [
    # Modules
    "actuator",
    "ai",
    "audit_log",
    "auth",
    "dashboard",
    "diagnostic",
    "email_log",
    "enums",
    "esp",
    "esp_heartbeat",
    "kaiser",
    "library",
    "logic",
    "notification",
    "plugin",
    "sensor",
    "sensor_type_defaults",
    "subzone",
    "system",
    "user",
    # Enums
    "DataSource",
    "SensorOperatingMode",
    # Models
    "ActuatorConfig",
    "ActuatorState",
    "ActuatorHistory",
    "AIPredictions",
    "AuditLog",
    "AuditEventType",
    "AuditSeverity",
    "AuditSourceType",
    "TokenBlacklist",
    "Dashboard",
    "DiagnosticReport",
    "EmailLog",
    "ESPDevice",
    "ESPHeartbeatLog",
    "HeartbeatHealthStatus",
    "determine_health_status",
    "KaiserRegistry",
    "ESPOwnership",
    "LibraryMetadata",
    "CrossESPLogic",
    "LogicExecutionHistory",
    "Notification",
    "NotificationCategory",
    "NotificationPreferences",
    "NotificationSeverity",
    "NotificationSource",
    "SensorConfig",
    "SensorData",
    "SensorTypeDefaults",
    "PluginConfig",
    "PluginExecution",
    "SubzoneConfig",
    "SystemConfig",
    "User",
    "ZoneContext",
]
