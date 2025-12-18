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
    esp,
    kaiser,
    library,
    logic,
    sensor,
    subzone,  # Subzone configuration model (Phase 9)
    system,
    user,
)

# Explicitly export models for convenience (optional, but helpful)
from .actuator import ActuatorConfig, ActuatorState, ActuatorHistory  # noqa: F401
from .ai import AIPredictions  # noqa: F401
from .audit_log import AuditLog, AuditEventType, AuditSeverity, AuditSourceType  # noqa: F401
from .auth import TokenBlacklist  # noqa: F401
from .esp import ESPDevice  # noqa: F401
from .kaiser import KaiserRegistry, ESPOwnership  # noqa: F401
from .library import LibraryMetadata  # noqa: F401
from .logic import CrossESPLogic, LogicExecutionHistory  # noqa: F401
from .sensor import SensorConfig, SensorData  # noqa: F401
from .subzone import SubzoneConfig  # noqa: F401
from .system import SystemConfig  # noqa: F401
from .user import User  # noqa: F401

__all__ = [
    # Modules
    "actuator",
    "ai",
    "audit_log",
    "auth",
    "esp",
    "kaiser",
    "library",
    "logic",
    "sensor",
    "subzone",
    "system",
    "user",
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
    "ESPDevice",
    "KaiserRegistry",
    "ESPOwnership",
    "LibraryMetadata",
    "CrossESPLogic",
    "LogicExecutionHistory",
    "SensorConfig",
    "SensorData",
    "SubzoneConfig",
    "SystemConfig",
    "User",
]

