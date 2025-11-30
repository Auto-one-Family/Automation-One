"""
Sensor Library Distribution Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🟢 MEDIUM (OTA library updates)
Status: PLANNED - Not yet implemented

Purpose:
    REST API for distributing sensor libraries to ESP32 devices (OTA).

Current Implementation:
    - Sensor libraries on server-side (sensors/sensor_libraries/active/)
    - Pi-Enhanced mode is default (ESP sends raw, server processes)
    - This is for FUTURE OTA library distribution to ESPs

Planned Endpoints:
    GET  /available                    List available sensor libraries
    POST /install                      Install library to ESP(s)
    GET  /status                       Library installation status per ESP
    POST /update                       Update library on all ESPs

Note:
    OTA library distribution is Phase 7 feature (DYNAMIC_LIBRARY_SUPPORT flag).
    Most projects use Pi-Enhanced mode and don't need this.

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 174-180)
    - El Trabajante/docs/Roadmap.md (Phase 7: OTA Library Mode)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/library", tags=["library"])
