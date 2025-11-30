"""
Sensor Business Logic Service

Phase: 3 (Week 5-6) - Business Logic Layer
Priority: 🔴 CRITICAL
Status: OPTIONAL - Currently NOT needed

Purpose:
    Business logic for sensor operations (CRUD, data processing, calibration).

Current Architecture:
    MQTT Handler → Repository (DIRECT) - No service layer needed for MQTT

    mqtt/handlers/sensor_handler.py
        ↓ (calls directly)
    db/repositories/sensor_repo.py
        ↓
    PostgreSQL

Future Use Case:
    When REST API endpoints are implemented, complex business logic
    that is shared between MQTT Handler and REST API should move here.

    REST API ←→ SensorService ←→ Repository
    MQTT Handler ←→ SensorService ←→ Repository

Planned Methods (when implemented):
    - create_sensor_config(esp_id, gpio, sensor_type, config)
    - update_sensor_config(esp_id, gpio, config)
    - delete_sensor_config(esp_id, gpio)
    - get_sensor_data(esp_id, gpio, time_range, pagination)
    - calibrate_sensor(esp_id, gpio, calibration_data)
    - validate_sensor_reading(reading)

Dependencies:
    - db/repositories/sensor_repo.py (IMPLEMENTED)
    - sensors/library_loader.py (IMPLEMENTED)
    - core/validators.py (IMPLEMENTED)

Related Files:
    - mqtt/handlers/sensor_handler.py (MQTT handling - IMPLEMENTED, direct repo access)
    - api/v1/sensors.py (REST API - PLANNED)

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 487-490, Phase 3)

Design Decision:
    This file exists as placeholder to document future refactoring.
    Current MQTT-first architecture does NOT require service layer.
    Implement only when REST API endpoints need shared business logic.
"""

# from typing import Optional, List
# from db.repositories.sensor_repo import SensorRepository
# from sensors.library_loader import SensorLibraryLoader


# class SensorService:
#     """
#     Business logic for sensor operations.
#
#     When implementing:
#     - Extract shared logic from mqtt/handlers/sensor_handler.py
#     - Add validation, error handling, business rules
#     - Keep it thin - delegate to repositories for data access
#     """
#
#     def __init__(
#         self,
#         sensor_repo: SensorRepository,
#         library_loader: SensorLibraryLoader
#     ):
#         self.sensor_repo = sensor_repo
#         self.library_loader = library_loader
#
#     async def create_sensor_config(self, esp_id: str, gpio: int, sensor_type: str, config: dict):
#         raise NotImplementedError("Phase 3: Service layer - To be implemented when REST API is added")
