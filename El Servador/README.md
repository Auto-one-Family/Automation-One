# God-Kaiser Pi Server (El Servador)

FastAPI-basiertes Backend für AutomationOne IoT-Framework.

## Features
- REST API (FastAPI)
- WebSocket Real-time Communication
- MQTT Integration (Mosquitto)
- Dynamic Sensor Library Loading
- Cross-ESP Automation Logic
- PostgreSQL Database
- God AI Integration

## Setup
```bash
poetry install
poetry run alembic upgrade head
poetry run uvicorn src.main:app --reload
```

## Architecture
Siehe `/docs/ARCHITECTURE.md`

