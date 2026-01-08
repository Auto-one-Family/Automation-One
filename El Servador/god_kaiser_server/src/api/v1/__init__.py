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
from .esp import router as esp_router
from .health import router as health_router
from .logic import router as logic_router
from .sensors import router as sensors_router
from .sensor_type_defaults import router as sensor_type_defaults_router
from .sequences import router as sequences_router
from .subzone import router as subzone_router
from .users import router as users_router
from .zone import router as zone_router

# Create main v1 router
api_v1_router = APIRouter()

# Include all sub-routers
api_v1_router.include_router(auth_router)
api_v1_router.include_router(audit_router)
api_v1_router.include_router(esp_router)
api_v1_router.include_router(sensors_router)
api_v1_router.include_router(sensor_type_defaults_router)  # Phase 2A - Sensor Operating Modes
api_v1_router.include_router(actuators_router)
api_v1_router.include_router(health_router)
api_v1_router.include_router(logic_router)
api_v1_router.include_router(debug_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(zone_router)
api_v1_router.include_router(subzone_router)  # Phase 9 - Subzone Management
api_v1_router.include_router(sequences_router)  # Phase 3 - Sequence Actions

# Export individual routers for direct access if needed
__all__ = [
    "api_v1_router",
    "audit_router",
    "auth_router",
    "debug_router",
    "esp_router",
    "sensors_router",
    "sensor_type_defaults_router",
    "actuators_router",
    "health_router",
    "logic_router",
    "sequences_router",
    "subzone_router",
    "users_router",
    "zone_router",
]




