"""
Sensor Management Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: PLANNED - Not yet implemented

Purpose:
    REST API endpoints for sensor configuration and data queries.

Architecture:
    Frontend/API → SensorService (future) → SensorRepository → DB

Current Implementation:
    - Only /api/v1/sensors/process is implemented (see sensor_processing.py)
    - MQTT Handler (sensor_handler.py) handles real-time sensor data
    - This file is a placeholder for future REST API expansion

Planned Endpoints:
    GET    /                          List all sensor configurations
    GET    /{esp_id}/{gpio}           Get specific sensor config
    POST   /{esp_id}/{gpio}           Create/update sensor config
    DELETE /{esp_id}/{gpio}           Remove sensor config
    POST   /{esp_id}/{gpio}/calibrate Calibrate sensor
    GET    /data                      Query sensor data (time range, pagination)

Dependencies:
    - services/sensor_service.py (to be implemented)
    - schemas/sensor.py (to be implemented)
    - api/deps.py (get_db, get_current_user)

Related Files:
    - mqtt/handlers/sensor_handler.py (MQTT sensor data handling - IMPLEMENTED)
    - api/sensor_processing.py (Pi-Enhanced processing - IMPLEMENTED)
    - db/repositories/sensor_repo.py (Data access - IMPLEMENTED)

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 569-579, Phase 5)
    - El Trabajante/docs/Mqtt_Protocoll.md (MQTT sensor topics)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/sensors", tags=["sensors"])


# NOTE: When implementing, follow this pattern:
#
# @router.get("/")
# async def list_sensors(
#     esp_id: Optional[str] = None,
#     sensor_type: Optional[str] = None,
#     active: Optional[bool] = None,
#     db: Session = Depends(get_db)
# ) -> List[SensorConfigResponse]:
#     """List all sensor configurations with optional filters."""
#     raise NotImplementedError("Phase 5: REST API - To be implemented")
