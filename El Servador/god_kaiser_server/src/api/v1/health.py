"""
Health Check Endpoints

Phase: 5 (Week 9-10) - API Layer
Priority: 🟡 HIGH
Status: PLANNED - Not yet implemented

Purpose:
    System health checks for monitoring (Kubernetes, Prometheus, etc.)

Planned Endpoints:
    GET /            Basic health (DB, MQTT, Disk, Memory)
    GET /detailed    Comprehensive health + statistics
    GET /esp         ESP health summary (all ESPs)
    GET /metrics     Prometheus metrics export

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 191-195)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])
