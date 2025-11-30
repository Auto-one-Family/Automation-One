"""
ESP Device Management Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🔴 CRITICAL
Status: PLANNED - Not yet implemented

Purpose:
    REST API for ESP32 device management, configuration, and health monitoring.

Current Implementation:
    - MQTT Handler (heartbeat_handler.py) tracks ESP health via heartbeat messages
    - ESPRepository (esp_repo.py) stores device information
    - This file is placeholder for REST API expansion

Planned Endpoints:
    GET    /devices                    List all ESPs (filter: kaiser_id, zone, status)
    GET    /devices/{esp_id}           ESP details + sensor/actuator configs
    POST   /devices/{esp_id}/config    Update config → send via MQTT
    POST   /devices/{esp_id}/restart   Restart command
    POST   /devices/{esp_id}/reset     Factory reset
    GET    /devices/{esp_id}/health    Health metrics (uptime, heap, rssi)
    POST   /devices/{esp_id}/assign_kaiser  Assign ESP to Kaiser node
    GET    /discovery                  ESP32 network discovery results

Dependencies:
    - services/esp_service.py (to be implemented)
    - schemas/esp.py (to be implemented)
    - mqtt/publisher.py (IMPLEMENTED)

Related Files:
    - mqtt/handlers/heartbeat_handler.py (ESP health tracking - IMPLEMENTED)
    - db/repositories/esp_repo.py (IMPLEMENTED)

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 125-133)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/esp", tags=["esp"])
