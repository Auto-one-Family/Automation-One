"""
API v1 Router Package

Combines all v1 API routers into a single router for inclusion in main app.

Phase: 5 (Week 9-10) - API Layer
Status: IMPLEMENTED
"""

from fastapi import APIRouter

from .actuators import router as actuators_router
from .audit import router as audit_router
from .auth import router as auth_router
from .debug import router as debug_router
from .errors import router as errors_router
from .esp import router as esp_router
from .health import router as health_router
from .logic import router as logic_router
from .logs import router as logs_router
from .notifications import router as notifications_router
from .sensors import router as sensors_router
from .sensor_type_defaults import router as sensor_type_defaults_router
from .sequences import router as sequences_router
from .subzone import router as subzone_router
from .users import router as users_router
from .zone import router as zone_router
from .dashboards import router as dashboards_router
from .webhooks import router as webhooks_router
from .plugins import router as plugins_router
from .backups import router as backups_router
from .diagnostics import router as diagnostics_router

# PLANNED routers - stubs with no endpoints yet, included for discoverability.
# Add endpoints directly to the router files; they will be available immediately.
from .ai import router as ai_router
from .kaiser import router as kaiser_router
from .library import router as library_router

# Create main v1 router
api_v1_router = APIRouter()

# Include all sub-routers
api_v1_router.include_router(auth_router)
api_v1_router.include_router(audit_router)
api_v1_router.include_router(errors_router)  # DS18B20 Error Handling Integration
api_v1_router.include_router(esp_router)
api_v1_router.include_router(sensors_router)
api_v1_router.include_router(sensor_type_defaults_router)  # Phase 2A - Sensor Operating Modes
api_v1_router.include_router(actuators_router)
api_v1_router.include_router(health_router)
api_v1_router.include_router(logic_router)
api_v1_router.include_router(debug_router)
api_v1_router.include_router(logs_router)  # Frontend error log ingestion
api_v1_router.include_router(notifications_router)  # Phase 4A.1 - Notification Stack
api_v1_router.include_router(users_router)
api_v1_router.include_router(zone_router)
api_v1_router.include_router(subzone_router)  # Phase 9 - Subzone Management
api_v1_router.include_router(sequences_router)  # Phase 3 - Sequence Actions
api_v1_router.include_router(ai_router)  # PLANNED - God Layer AI integration
api_v1_router.include_router(kaiser_router)  # PLANNED - Kaiser relay node management
api_v1_router.include_router(library_router)  # PLANNED - OTA sensor library distribution
api_v1_router.include_router(dashboards_router)  # Dashboard Layout Persistence
api_v1_router.include_router(webhooks_router)  # Phase 4A.3 - Grafana Webhook
api_v1_router.include_router(plugins_router)  # Phase 4C - Plugin Management
api_v1_router.include_router(backups_router)  # Phase A V5.1 - Database Backup
api_v1_router.include_router(diagnostics_router)  # Phase 4D - Diagnostics Hub

# Export individual routers for direct access if needed
__all__ = [
    "api_v1_router",
    "ai_router",
    "audit_router",
    "auth_router",
    "debug_router",
    "errors_router",
    "esp_router",
    "sensors_router",
    "sensor_type_defaults_router",
    "actuators_router",
    "health_router",
    "kaiser_router",
    "library_router",
    "logic_router",
    "logs_router",
    "notifications_router",
    "sequences_router",
    "subzone_router",
    "users_router",
    "zone_router",
    "dashboards_router",
    "webhooks_router",
    "plugins_router",
    "backups_router",
    "diagnostics_router",
]
