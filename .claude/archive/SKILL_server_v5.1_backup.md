---
name: server-development
description: |
  God-Kaiser Server Entwicklung für AutomationOne IoT-Framework.
  Verwenden bei: Python, FastAPI, PostgreSQL, SQLAlchemy, Alembic, MQTT-Handler,
  REST-API, Pydantic, Sensor-Processing, Actuator-Service, Logic-Engine,
  Cross-ESP-Automation, Database-Models, Repositories, WebSocket, JWT-Auth,
  Audit-Log, Maintenance-Jobs, SimulationScheduler, Mock-ESP, Zone-Service,
  Subzone-Service, Safety-Service, Config-Builder, MQTT-Publisher, MQTT-Subscriber,
  Heartbeat-Handler, Sensor-Handler, Actuator-Handler, Pi-Enhanced-Processing,
  Sensor-Libraries, Library-Loader, Error-Codes, pytest, Integration-Tests.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# CLAUDE_SERVER.md - God-Kaiser Server Referenz für KI-Agenten

**Version:** 5.1 (SKILL.md Format)
**Letzte Aktualisierung:** 2026-02-01
**Zweck:** Zentrale Referenz für Claude, um bei jeder Server-Aufgabe die richtigen Dateien, Patterns und Konventionen zu finden.
**Codebase:** `El Servador/god_kaiser_server/` (~15.000+ Zeilen Python)

> **📖 ESP32-Firmware Dokumentation:** Siehe `.claude/skills/esp32/CLAUDE_Esp32.md`
> **📖 Frontend Dokumentation:** Siehe `.claude/skills/Frontend/CLAUDE_FRONTEND.md`
> **🛠️ Service-Management:** Siehe `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0

---

## 0. QUICK DECISION TREE - Welche Doku lesen?

### 🔧 "Ich will Code ändern"

| Aufgabe | Dokumentation | Code-Location |
|---------|---------------|---------------|
| ESP32-Firmware | `.claude/skills/esp32/CLAUDE_Esp32.md` | `El Trabajante/src/` |
| Server-Code | [Section 13: KI-Agenten Workflow](#13-ki-agenten-workflow) | `El Servador/god_kaiser_server/src/` |
| Frontend-Code | `.claude/skills/Frontend/CLAUDE_FRONTEND.md` | `El Frontend/src/` |
| Tests schreiben | `.claude/reference/testing/TEST_WORKFLOW.md` (NUR auf Anfrage) | `El Servador/god_kaiser_server/tests/` |
| Pattern-Beispiele | `.claude/archive/WORKFLOW_PATTERNS.md` | - |

### 🐛 "Ich habe einen Fehler"

| Problem | Dokumentation | Prüfen |
|---------|---------------|--------|
| ESP32 Build-Fehler | `.claude/skills/esp32/CLAUDE_Esp32.md` Section 1 | PlatformIO |
| Server Build-Fehler | [Section 7: Entwickler-Workflows](#7-entwickler-workflows) | `pyproject.toml` |
| Test-Fehler | `El Servador/docs/ESP32_TESTING.md` | Troubleshooting |
| Runtime-Fehler | [Section 10: Häufige Fehler](#10-häufige-fehler-und-lösungen) | Logs |
| MQTT-Problem | `.claude/reference/api/MQTT_TOPICS.md` | Vollständige Topic-Referenz |
| Database-Fehler | [Section 7.4: Database Migration](#74-database-migration) | Alembic |

### 📖 "Ich will verstehen wie X funktioniert"

| Thema | Dokumentation |
|-------|---------------|
| ESP32 System-Flow | `.claude/skills/esp32/CLAUDE_Esp32.md` → System-Flows |
| MQTT-Protokoll | `.claude/reference/api/MQTT_TOPICS.md` (vollständige Topic-Referenz) |
| API-Endpunkte | `.claude/reference/api/REST_ENDPOINTS.md` (~170 Endpoints dokumentiert) |
| Sensor-Processing | [Section 3.1](#31-aufgabe-neuen-sensor-typ-hinzufügen) |
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` (ESP32: 1000-4999, Server: 5000-5999) |
| WebSocket Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
| Datenflüsse | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |

### ➕ "Ich will neues Feature hinzufügen"

| Feature | Section |
|---------|---------|
| Sensor-Library | [Section 3.1](#31-aufgabe-neuen-sensor-typ-hinzufügen) |
| API-Endpoint | [Section 3.2](#32-aufgabe-rest-api-endpoint-hinzufügen) |
| MQTT-Handler | [Section 3.3](#33-aufgabe-mqtt-handler-implementieren) |
| Database-Model | [Section 3.4](#34-aufgabe-database-model-hinzufügen) |
| Automation-Rule | [Section 3.5](#35-aufgabe-cross-esp-automation-rule-implementieren) |
| Test | `El Servador/docs/ESP32_TESTING.md` |

---

## 1. SYSTEM-KONTEXT: Was ist der God-Kaiser Server?

### 1.1 Rolle im AutomationOne-Ökosystem

```
┌─────────────────────────────────────────────────────────────────┐
│                    HARDWARE-HIERARCHIE                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐     ┌──────────────┐     ┌────────┐     ┌───────┐ │
│  │   God   │ ──▶ │  God-Kaiser  │ ──▶ │ Kaiser │ ──▶ │ ESP32 │ │
│  │  (KI)   │     │  (Server)    │     │ (Scale)│     │(Agent)│ │
│  └─────────┘     └──────────────┘     └────────┘     └───────┘ │
│       │                 │                  │              │     │
│  Predictions      Control Center      Bridge Node    Hardware  │
│  Analytics        Library Storage     (Pi Zero)      Sensors   │
│  Learning         Data Transform      optional       Actuators │
│                   Cross-ESP Logic                              │
│                   Database                                      │
│                   MQTT Broker                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Kernverantwortlichkeiten

| Verantwortlichkeit | Beschreibung | Kritische Dateien |
|-------------------|--------------|-------------------|
| **Sensor-Datenverarbeitung** | RAW-Daten von ESPs, Pi-Enhanced Processing | `src/mqtt/handlers/sensor_handler.py`, `src/sensors/library_loader.py` |
| **Actuator-Steuerung** | Validiert und sendet Commands an ESPs | `src/mqtt/handlers/actuator_handler.py`, `src/services/actuator_service.py` |
| **Cross-ESP-Logik** | If-Sensor-Then-Actuator über mehrere ESPs | `src/services/logic_engine.py` |
| **Geräteverwaltung** | ESP-Registry, Zonen, Subzonen, Konfiguration | `src/services/esp_service.py`, `src/services/zone_service.py` |
| **Persistenz** | Sensor-Daten, Configs, User, Audit-Logs | `src/db/models/`, `src/db/repositories/` |
| **REST API** | Frontend-Kommunikation | `src/api/v1/` |
| **WebSocket** | Realtime-Updates ans Frontend | `src/websocket/manager.py` |
| **Maintenance & Cleanup** | Data-Safe Cleanup, Health-Checks | `src/services/maintenance/service.py` |
| **Simulation (Mock-ESP)** | Mock-ESP Heartbeat/Sensor, Recovery | `src/services/simulation/scheduler.py` |
| **Audit & Retention** | Audit-Log, Retention, Backup | `src/services/audit_retention_service.py` |

### 1.3 Architektur-Prinzip: Server-Centric

**KRITISCH:** Der God-Kaiser Server ist die "Intelligenz" des Systems. ESPs sind "dumme" Agenten.

```
ESP32 sendet:     RAW-Daten (analogRead = 2048)
Server macht:     Transformation (2048 → pH 7.2), Speicherung, Logik-Evaluation
Server sendet:    Actuator-Commands, Config-Updates
```

**Warum?**
- ESP32 hat limitierten Flash/RAM
- Sensor-Libraries sind Python (einfacher zu entwickeln)
- Cross-ESP-Logik erfordert zentrale Koordination
- Updates ohne ESP-Reflash möglich

---

## 2. SERVER-STARTUP-SEQUENZ (KRITISCH)

**Startup-Flow in `src/main.py` (lifespan startup):**

| Step | Aktion | Details |
|------|--------|---------|
| 0 | **Security Validation** | JWT-Secret-Check, MQTT-TLS-Warnung |
| 0.5 | **Resilience Patterns** | `ResilienceRegistry`, Circuit Breaker |
| 1 | **Database Initialization** | `init_db()` / `get_engine()` |
| 2 | **MQTT Client Connection** | Singleton, Auto-Reconnect, TLS/SSL |
| 3 | **MQTT Handler Registration** | Subscriber mit Thread-Pool |
| 3.4 | **Central Scheduler** | `init_central_scheduler()` |
| 3.4.1 | **SimulationScheduler** | Mock-ESP Simulation |
| 3.4.2 | **MaintenanceService** | Cleanup-Jobs |
| 3.5 | **Mock-ESP Recovery** | `SimulationScheduler.recover_mocks()` |
| 3.6 | **Sensor Type Auto-Registration** | Phase 2A |
| 3.7 | **Scheduled Sensor Job Recovery** | Phase 2H |
| 4 | **MQTT Topic Subscription** | `Subscriber.subscribe_all()` |
| 5 | **WebSocket Manager** | Initialize |
| 6 | **Service Initialization** | SafetyService → ActuatorService → LogicEngine |

**Registrierte MQTT-Handler:**
- `sensor/+/data`, `actuator/+/status`, `actuator/+/response`, `actuator/+/alert`
- `system/heartbeat`, `discovery/esp32_nodes`, `config_response`
- `zone/ack`, `subzone/ack`, `system/will` (LWT), `system/error`
- Paket G: `actuator/+/command`, `actuator/emergency`, `kaiser/broadcast/emergency`

**Shutdown-Flow (Reihenfolge kritisch):**

1. Logic Scheduler stoppen
2. Logic Engine stoppen
3. SequenceActionExecutor cleanup
4. MaintenanceService stop
5. SimulationScheduler: `stop_all_mocks()`
6. Central Scheduler: `shutdown_central_scheduler()`
7. WebSocket Manager shutdown
8. MQTT Subscriber shutdown (wait=True, timeout=30s)
9. MQTT Client disconnect
10. Database Engine dispose

**Code-Location:** `src/main.py` (lifespan ~Zeilen 85–415)

---

## 2.1 VERZEICHNISSTRUKTUR

```
El Servador/god_kaiser_server/
├── src/                              # 🎯 HAUPTCODE
│   ├── main.py                       # FastAPI App Entry Point
│   │
│   ├── core/                         # Zentrale Konfiguration
│   │   ├── config.py                 # ⭐ Settings (19 Pydantic-Klassen)
│   │   ├── config_mapping.py         # Field-Mapping für ESP32-Payloads
│   │   ├── error_codes.py            # Unified Error Codes (1000-5999)
│   │   ├── security.py               # JWT, Password Hashing
│   │   ├── logging_config.py         # Structured Logging
│   │   ├── exceptions.py             # Custom Exceptions
│   │   ├── scheduler.py              # CentralScheduler
│   │   └── resilience/               # Circuit Breaker, Retry, Timeout
│   │
│   ├── api/                          # REST API Layer
│   │   ├── deps.py                   # Dependency Injection (DB, Auth)
│   │   └── v1/                       # API Version 1
│   │       ├── __init__.py           # ⭐ Router-Aggregation (api_v1_router)
│   │       ├── audit.py              # Audit Log Management & Retention
│   │       ├── auth.py               # Login, Register, Token Refresh
│   │       ├── esp.py                # ESP CRUD, Status
│   │       ├── sensors.py            # Sensor Config, Data Query
│   │       ├── sensor_type_defaults.py  # Sensor Operating Modes
│   │       ├── actuators.py          # Actuator Control, Status
│   │       ├── logic.py              # Automation Rules CRUD
│   │       ├── health.py             # Health Checks, Metrics
│   │       ├── debug.py              # Mock-ESP, DB-Explorer
│   │       ├── errors.py             # Error-Event-Integration
│   │       ├── sequences.py          # Sequence Actions
│   │       ├── zone.py               # Zone Assignment
│   │       ├── subzone.py            # Subzone Management
│   │       ├── users.py              # User Management
│   │       └── websocket/realtime.py # Realtime Updates
│   │
│   ├── services/                     # 🧠 BUSINESS LOGIC
│   │   ├── esp_service.py            # ESP Registration, Config Publishing
│   │   ├── sensor_service.py         # Sensor Config, Data Processing
│   │   ├── sensor_scheduler_service.py  # Scheduled Sensor Jobs
│   │   ├── sensor_type_registration.py  # Auto-Registration
│   │   ├── actuator_service.py       # Command Validation, Execution
│   │   ├── safety_service.py         # Safety Controller, Emergency Stop
│   │   ├── logic_engine.py           # Cross-ESP Automation Engine
│   │   ├── logic_service.py          # Automation Rule CRUD
│   │   ├── logic/                    # Conditions, Actions, Safety
│   │   │   ├── conditions/           # Sensor, Time, Hysteresis, Compound
│   │   │   ├── actions/              # Actuator, Delay, Notification, Sequence
│   │   │   └── safety/               # ConflictManager, RateLimiter, LoopDetector
│   │   ├── zone_service.py           # Zone Management
│   │   ├── subzone_service.py        # Subzone Management
│   │   ├── gpio_validation_service.py   # GPIO-Konflikt-Prüfung
│   │   ├── health_service.py         # Health Checks, Metrics
│   │   ├── library_service.py        # Sensor Library Management
│   │   ├── audit_retention_service.py   # Audit Log Retention & Cleanup
│   │   ├── audit_backup_service.py   # JSON/ZIP Backup
│   │   ├── event_aggregator_service.py  # DataSource, EventAggregator
│   │   ├── config_builder.py         # ESP32 Config Payload Builder
│   │   ├── mqtt_auth_service.py      # Mosquitto Passwd-Verwaltung
│   │   ├── god_client.py             # HTTP Client für God-Layer
│   │   ├── maintenance/              # Maintenance Jobs
│   │   │   ├── service.py            # MaintenanceService
│   │   │   └── jobs/                 # cleanup.py, sensor_health.py
│   │   └── simulation/               # Mock-ESP Simulation
│   │       ├── scheduler.py          # SimulationScheduler
│   │       └── actuator_handler.py   # Mock Actuator Commands
│   │
│   ├── mqtt/                         # 📡 MQTT LAYER
│   │   ├── client.py                 # Paho-MQTT Singleton Wrapper
│   │   ├── subscriber.py             # Topic Subscriptions, Thread-Pool
│   │   ├── publisher.py              # Message Publishing
│   │   ├── topics.py                 # Topic-Builder, Parser
│   │   └── handlers/                 # MESSAGE HANDLERS
│   │       ├── base_handler.py       # Abstract Base Handler
│   │       ├── sensor_handler.py     # Sensor Data Processing
│   │       ├── actuator_handler.py   # Actuator Status Updates
│   │       ├── actuator_response_handler.py  # Command Responses
│   │       ├── actuator_alert_handler.py     # Actuator Alerts
│   │       ├── heartbeat_handler.py  # ESP Heartbeats, Registration
│   │       ├── config_handler.py     # Config Responses
│   │       ├── zone_ack_handler.py   # Zone ACK
│   │       ├── subzone_ack_handler.py   # Subzone ACK
│   │       ├── lwt_handler.py        # LWT Instant Offline
│   │       ├── error_handler.py      # system/error
│   │       └── discovery_handler.py  # ESP Discovery (deprecated)
│   │
│   ├── websocket/                    # 🔴 REALTIME
│   │   ├── manager.py                # Connection Management
│   │   └── events.py                 # Event Types
│   │
│   ├── db/                           # 💾 DATABASE LAYER
│   │   ├── session.py                # Engine, Session Factory
│   │   ├── models/                   # SQLAlchemy Models
│   │   │   ├── esp.py                # ESP Device Model
│   │   │   ├── esp_heartbeat.py      # ESP Heartbeat Logs
│   │   │   ├── sensor.py             # SensorConfig, SensorData
│   │   │   ├── sensor_type_defaults.py  # Operating Modes
│   │   │   ├── actuator.py           # ActuatorConfig, ActuatorState
│   │   │   ├── logic.py              # AutomationRule Model
│   │   │   ├── user.py               # User, Role, Permission
│   │   │   ├── auth.py               # TokenBlacklist
│   │   │   ├── audit_log.py          # AuditLog
│   │   │   ├── subzone.py            # SubzoneConfig
│   │   │   └── enums.py              # DataSource etc.
│   │   └── repositories/             # Repository Pattern
│   │       ├── base.py               # BaseRepository (CRUD)
│   │       ├── esp_repo.py           # ESP-specific Queries
│   │       ├── sensor_repo.py        # Sensor Data Queries
│   │       └── ...
│   │
│   ├── sensors/                      # 🔬 SENSOR PROCESSING
│   │   ├── library_loader.py         # Dynamic Import (importlib)
│   │   ├── base_processor.py         # Abstract Sensor Processor
│   │   ├── sensor_type_registry.py   # Type-Mapping
│   │   └── sensor_libraries/active/  # AKTIVE SENSOR-LIBRARIES
│   │       ├── ph_sensor.py, ec_sensor.py, temperature.py
│   │       ├── humidity.py, moisture.py, pressure.py
│   │       └── light.py, flow.py, co2.py, ...
│   │
│   ├── schemas/                      # 📋 PYDANTIC DTOs
│   │   ├── common.py                 # BaseResponse, Pagination
│   │   ├── esp.py, sensor.py, actuator.py
│   │   ├── zone.py, logic.py, auth.py
│   │   └── ...
│   │
│   └── utils/                        # 🔧 HELPERS
│       ├── mqtt_helpers.py, time_helpers.py
│       ├── data_helpers.py, network_helpers.py
│       └── ...
│
├── tests/                            # 🧪 TESTS
│   ├── unit/                         # Unit Tests
│   ├── integration/                  # Integration Tests (34 Tests)
│   ├── esp32/                        # ESP32-spezifische Tests (~140 Tests)
│   │   └── mocks/mock_esp32_client.py
│   └── e2e/                          # End-to-End Tests
│
├── alembic/                          # 🔄 DATABASE MIGRATIONS
│   ├── env.py                        # Alembic Environment
│   ├── script.py.mako                # Migration Template
│   └── versions/                     # Migration Files
│
├── scripts/                          # 🛠️ ADMIN SCRIPTS
│   ├── init_db.py, create_admin.py
│   ├── backup_db.py, restore_db.py
│   └── ...
│
├── docs/                             # 📚 SERVER-DOKUMENTATION
│   ├── ESP32_TESTING.md              # ✅ Test-Framework Guide
│   ├── MQTT_TEST_PROTOCOL.md         # ✅ MQTT Test Protocol
│   └── ...
│
└── config/                           # ⚙️ KONFIGURATION
    ├── .env.example                  # Environment Template
    └── logging.yaml                  # Logging Configuration
```

---

## 3. KRITISCHE DATEIEN PRO AUFGABENTYP

### 3.1 Aufgabe: Neuen Sensor-Typ hinzufügen

**Zu analysierende Dateien (in dieser Reihenfolge):**

1. `src/sensors/base_processor.py` - Abstract Base Class verstehen
2. `src/sensors/sensor_libraries/active/ph_sensor.py` - Beispiel-Implementation
3. `src/sensors/library_loader.py` - Wie Libraries geladen werden
4. `src/db/models/sensor.py` - Sensor-Model Felder
5. `src/schemas/sensor.py` - Pydantic Schemas
6. `src/mqtt/handlers/sensor_handler.py` - Wie Daten empfangen werden

**Zu erstellende Datei:**

```
src/sensors/sensor_libraries/active/co2_sensor.py
```

**Template für neue Sensor-Library:**

```python
# src/sensors/sensor_libraries/active/co2_sensor.py
"""
CO2 Sensor Library - MH-Z19B
Verarbeitet RAW ADC-Werte zu ppm
"""
from ..base_processor import BaseSensorProcessor

class CO2Processor(BaseSensorProcessor):
    """CO2 Sensor Processor für MH-Z19B"""
    
    SENSOR_TYPE = "co2_sensor"
    UNIT = "ppm"
    MIN_VALUE = 400
    MAX_VALUE = 5000
    
    def process(self, raw_value: float, calibration: dict = None) -> dict:
        """
        Konvertiert RAW-Wert zu ppm.
        
        Args:
            raw_value: ADC-Wert (0-4095 bei 12-bit)
            calibration: Optional calibration data
            
        Returns:
            dict mit processed_value, unit, quality
        """
        # Lineare Interpolation
        ppm = (raw_value / 4095.0) * (self.MAX_VALUE - self.MIN_VALUE) + self.MIN_VALUE
        
        # Quality Assessment
        if ppm < 800:
            quality = "excellent"
        elif ppm < 1000:
            quality = "good"
        elif ppm < 1500:
            quality = "fair"
        elif ppm < 2000:
            quality = "poor"
        else:
            quality = "bad"
            
        return {
            "processed_value": round(ppm, 0),
            "unit": self.UNIT,
            "quality": quality
        }

# Wird automatisch vom LibraryLoader erkannt
processor = CO2Processor()
```

**WICHTIG:** Nach Erstellung KEIN Server-Restart nötig (Dynamic Import)!

---

### 3.2 Aufgabe: REST API Endpoint hinzufügen

> **📚 Vollständige API-Referenz:** `.claude/reference/api/REST_ENDPOINTS.md`
> Enthält alle ~170 Endpoints mit Request/Response Schemas

**Zu analysierende Dateien:**

1. `src/api/v1/health.py` – Beispiel-Endpoint
2. `src/api/deps.py` – Dependency Injection
3. `src/schemas/common.py` - Response Schemas
4. `src/services/` - Welcher Service benötigt?

**Pattern für neuen Endpoint:**

```python
# src/api/v1/dashboard.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_user
from ...schemas.common import SuccessResponse
from ...services.esp_service import ESPService
from ...services.sensor_service import SensorService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/summary", response_model=SuccessResponse)
async def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Liefert Dashboard-Zusammenfassung."""
    esp_service = ESPService(db)
    sensor_service = SensorService(db)
    
    return {
        "status": "success",
        "data": {
            "esp_count": esp_service.get_count(),
            "esp_online": esp_service.get_online_count(),
            "sensor_count": sensor_service.get_active_count()
        }
    }
```

**Router registrieren:** In `src/api/v1/__init__.py` inkludieren:
```python
api_v1_router.include_router(dashboard_router)
```

---

### 3.3 Aufgabe: MQTT Handler implementieren

> **📚 Vollständige Topic-Referenz:** `.claude/reference/api/MQTT_TOPICS.md`
> Enthält alle Topics, Payloads, QoS-Werte mit Code-Locations

**Zu analysierende Dateien:**

1. `.claude/reference/api/MQTT_TOPICS.md` - ⚠️ **ZUERST LESEN** - Alle Topics mit Payloads
2. `src/mqtt/handlers/sensor_handler.py` - Beispiel Handler (async)
3. `src/mqtt/subscriber.py` - Topic Subscriptions, Thread-Pool
4. `src/mqtt/topics.py` - Topic-Parsing
5. `src/core/constants.py` - Topic-Templates

**Pattern für neuen Handler:**

```python
# src/mqtt/handlers/diagnostics_handler.py
"""
Handler für System-Diagnostics Messages
Topic: kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics
"""
from typing import Dict, Any
from ...core.logging_config import get_logger
from ...db.repositories import ESPRepository
from ...db.session import get_session
from ..topics import TopicBuilder

logger = get_logger(__name__)

async def handle_diagnostics(topic: str, payload: Dict[str, Any]) -> bool:
    """Verarbeitet Diagnostics-Nachrichten von ESPs."""
    try:
        parsed = TopicBuilder.parse_diagnostics_topic(topic)
        if not parsed:
            logger.error(f"Failed to parse diagnostics topic: {topic}")
            return False
        
        esp_id = parsed["esp_id"]
        
        if "esp_id" not in payload or "heap_free" not in payload:
            logger.error(f"Invalid diagnostics payload: {payload}")
            return False
        
        async for session in get_session():
            esp_repo = ESPRepository(session)
            esp_device = await esp_repo.get_by_device_id(esp_id)
            if not esp_device:
                logger.warning(f"ESP device not found: {esp_id}")
                return False
            
            metadata = esp_device.metadata or {}
            metadata["diagnostics"] = payload
            esp_device.metadata = metadata
            await session.commit()
            break
        
        logger.info(f"Diagnostics updated for {esp_id}")
        return True
        
    except Exception as e:
        logger.exception(f"Error processing diagnostics: {e}")
        return False
```

**Handler registrieren in `src/main.py`:**

```python
# In lifespan() startup:
from .mqtt.handlers import diagnostics_handler

kaiser_id = settings.hierarchy.kaiser_id
_subscriber_instance.register_handler(
    f"kaiser/{kaiser_id}/esp/+/system/diagnostics",
    diagnostics_handler.handle_diagnostics
)
```

---

### 3.4 Aufgabe: Database Model hinzufügen

**Zu analysierende Dateien:**

1. `src/db/models/sensor.py` - Beispiel Model
2. `src/db/session.py` - Engine Setup
3. `alembic/env.py` - Migration Environment
4. `src/db/repositories/base.py` - Repository Pattern

**Pattern für neues Model:**

```python
# src/db/models/alert.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..session import Base

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    esp_id = Column(String(20), ForeignKey("esps.esp_id"), nullable=True)
    severity = Column(String(20), nullable=False)  # info, warning, error, critical
    category = Column(String(50), nullable=False)  # sensor, actuator, system, network
    message = Column(Text, nullable=False)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    esp = relationship("ESP", back_populates="alerts")
    user = relationship("User", back_populates="acknowledged_alerts")
```

**Migration erstellen:**

```bash
cd "El Servador/god_kaiser_server"
python -m alembic revision --autogenerate -m "Add alerts table"
python -m alembic upgrade head
```

---

### 3.5 Aufgabe: Cross-ESP Automation Rule implementieren

**Zu analysierende Dateien:**

1. `src/services/logic_engine.py` - Kernlogik (Background-Task)
2. `src/db/models/logic.py` - Rule/Condition Models
3. `src/db/models/logic_validation.py` - Condition/Action Validation
4. `src/schemas/logic.py` - Rule Schemas
5. `src/api/v1/logic.py` - Rule CRUD Endpoints
6. `src/services/actuator_service.py` - Command Execution

**Datenfluss:**

```
1. Sensor-Daten kommen via MQTT → sensor_handler.handle_sensor_data()
2. Sensor-Daten werden in DB gespeichert
3. sensor_handler ruft logic_engine.evaluate_sensor_data() auf (non-blocking)
4. LogicEngine lädt passende Rules aus DB
5. Für jede Rule: Conditions werden evaluiert
6. Bei Match: Actions werden ausgeführt
7. Actuator-Command wird via ActuatorService.send_command() gesendet
8. Safety-Checks erfolgen VOR Command-Publishing
9. Command wird via MQTT Publisher gesendet (QoS 2)
10. Execution wird in DB geloggt
```

**Rule-Struktur (Database):**

```python
{
    "id": 1,
    "name": "Auto-Irrigation",
    "enabled": true,
    "priority": 1,
    "trigger_conditions": {
        "type": "sensor",  # oder "sensor_threshold"
        "esp_id": "ESP_SENSOR_01",
        "gpio": 4,
        "sensor_type": "temperature",
        "operator": ">",
        "value": 30.0
    },
    "actions": [
        {
            "type": "actuator",  # oder "actuator_command"
            "esp_id": "ESP_ACTUATOR_01",
            "gpio": 5,
            "command": "ON",
            "value": 1.0
        }
    ],
    "cooldown_seconds": 300,
    "time_start": "06:00",
    "time_end": "22:00"
}
```

**Condition Types:** `sensor_threshold`, `sensor` (Shorthand), `time_window`

**Action Types:** `actuator_command`, `actuator` (Shorthand)

---

## 4. MQTT TOPIC-REFERENZ (Server-Perspektive)

> **Vollständige Referenz:** `.claude/reference/api/MQTT_TOPICS.md`
> Dieser Abschnitt enthält eine Server-spezifische Zusammenfassung. Für alle Topics, Payloads und QoS-Werte siehe die vollständige Referenz.

### 4.1 Topics die der Server SUBSCRIBED

| Topic Pattern | Handler | QoS | Beschreibung |
|--------------|---------|-----|--------------|
| `kaiser/{kaiser_id}/esp/+/sensor/+/data` | `sensor_handler` | 1 | Sensor-Rohdaten |
| `kaiser/{kaiser_id}/esp/+/actuator/+/status` | `actuator_handler` | 1 | Actuator-Status |
| `kaiser/{kaiser_id}/esp/+/actuator/+/response` | `actuator_response_handler` | 1 | Command-Responses |
| `kaiser/{kaiser_id}/esp/+/actuator/+/alert` | `actuator_alert_handler` | 1 | Actuator-Alerts |
| `kaiser/{kaiser_id}/esp/+/system/heartbeat` | `heartbeat_handler` | 0 | ESP Heartbeats |
| `kaiser/{kaiser_id}/esp/+/config_response` | `config_handler` | 2 | Config-Bestätigungen |
| `kaiser/{kaiser_id}/esp/+/zone/ack` | `zone_ack_handler` | 1 | Zone Assignment ACK |
| `kaiser/{kaiser_id}/esp/+/subzone/ack` | `subzone_ack_handler` | 1 | Subzone ACK |
| `kaiser/{kaiser_id}/esp/+/system/will` | `lwt_handler` | 1 | LWT – Instant Offline |
| `kaiser/{kaiser_id}/esp/+/system/error` | `error_handler` | 1 | Hardware/Config Errors |
| `kaiser/{kaiser_id}/esp/+/actuator/+/command` | mock_actuator_handler | 2 | Mock-ESP Commands |
| `kaiser/broadcast/emergency` | mock_actuator_handler | 2 | Broadcast Emergency |

**`{kaiser_id}`** wird aus `settings.hierarchy.kaiser_id` geladen (Standard: `"god"`)

### 4.2 Topics auf die der Server PUBLISHED

| Topic Pattern | Publisher-Methode | QoS | Beschreibung |
|--------------|-------------------|-----|--------------|
| `.../actuator/{gpio}/command` | `publish_actuator_command()` | 2 | Actuator-Commands |
| `.../config/sensor/{gpio}` | `publish_sensor_config()` | 2 | Sensor-Config |
| `.../config/actuator/{gpio}` | `publish_actuator_config()` | 2 | Actuator-Config |
| `.../system/command` | `publish_system_command()` | 2 | System-Commands |
| `.../sensor/{gpio}/processed` | `publish_pi_enhanced_response()` | 1 | Pi-Enhanced Response |
| `.../zone/assign` | `publish_zone_assignment()` | 1 | Zone Assignment |

### 4.3 MQTT Payload-Schemas

**Sensor Data (ESP → Server):**

```json
{
    "esp_id": "ESP_12AB34CD",
    "zone_id": "greenhouse",
    "gpio": 34,
    "sensor_type": "ph",
    "raw": 2150,
    "ts": 1735818000,
    "raw_mode": true,
    "onewire_address": "28FF123456789ABC",
    "i2c_address": 68
}
```

**Required Fields:** `esp_id`, `gpio`, `sensor_type`, `raw`, `ts`, `raw_mode`

**Optional Fields:** `onewire_address` (OneWire), `i2c_address` (I2C)

### 4.3.1 Sensor-Lookup Strategie

Der Server verwendet interface-spezifische Lookups:

| Interface | Repository-Methode | Felder |
|-----------|-------------------|--------|
| Analog/Digital | `get_by_esp_gpio_and_type()` | esp_id, gpio, sensor_type |
| OneWire | `get_by_esp_gpio_type_and_onewire()` | + onewire_address |
| I2C | `get_by_esp_gpio_type_and_i2c()` | + i2c_address |

**Unique Constraint:** `(esp_id, gpio, sensor_type, onewire_address, i2c_address)`

**Code-Location:** `sensor_handler.py:161-201`, `sensor_repo.py:772-814`

**Heartbeat (ESP → Server):**

```json
{
    "esp_id": "ESP_12AB34CD",
    "zone_id": "greenhouse",
    "ts": 1735818000,
    "uptime": 3600,
    "heap_free": 245760,
    "wifi_rssi": -65
}
```

**Required Fields:** `ts`, `uptime`, `heap_free`, `wifi_rssi`

**KRITISCH:** Unbekannte Geräte werden abgelehnt. ESPs müssen via API registriert werden (`POST /api/v1/esp/register`).

**Actuator Command (Server → ESP):**

```json
{
    "command": "ON",
    "value": 1.0,
    "duration": 0,
    "timestamp": 1234567890
}
```

**Vollständige Spezifikation:** `El Trabajante/docs/Mqtt_Protocoll.md`

### 4.4 MQTT-Architektur-Details

**Subscriber-Architektur:**
- **Thread-Pool:** Handler in `ThreadPoolExecutor` (max_workers=10)
- **Async-Handler:** Unterstützt sync und async Handler
- **Error-Isolation:** Handler-Fehler crashen nicht den Subscriber

**MQTT-Client:**
- **Singleton-Pattern:** `MQTTClient.get_instance()`
- **Auto-Reconnect:** Exponential Backoff (min=1s, max=60s)
- **TLS/SSL:** Unterstützt via Settings

**Topic-Builder (`src/mqtt/topics.py`):**
- Build-Methoden: `build_actuator_command_topic()`, `build_sensor_config_topic()`, etc.
- Parse-Methoden: `parse_sensor_data_topic()`, `parse_heartbeat_topic()`, etc.
- Validation: `validate_esp_id()`, `validate_gpio()`

### 4.5 Configuration (config.py)

**Settings-Klassen (19 total):**
- `database`, `mqtt`, `server`, `security`, `cors`, `hierarchy`, `performance`, `logging`
- `esp32`, `sensor`, `actuator`, `websocket`, `redis`, `external_services`, `notification`
- `development`, `maintenance`, `resilience`
- Root: `environment`, `log_level`

**MaintenanceSettings:**
- Sensor-/Command-/Audit-/Heartbeat-Log-Cleanup (default: DISABLED)
- Env: `SENSOR_DATA_RETENTION_ENABLED`, `AUDIT_LOG_RETENTION_ENABLED`, etc.

**ResilienceSettings:**
- Circuit Breaker (MQTT, Database, External API)
- Env: `CIRCUIT_BREAKER_MQTT_FAILURE_THRESHOLD`, etc.

---

## 5. DATABASE SCHEMA

### 5.1 Kern-Tabellen

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      users      │     │      esps       │     │     zones       │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ esp_id (PK)     │     │ id (PK)         │
│ email           │     │ name            │     │ zone_id         │
│ password_hash   │     │ zone_id (FK)    │     │ name            │
│ role            │     │ is_online       │     │ master_zone_id  │
│ created_at      │     │ last_heartbeat  │     │ created_at      │
└─────────────────┘     │ created_at      │     └─────────────────┘
                        └─────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ sensor_configs  │     │ actuator_configs│     │  sensor_data    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ esp_id (FK)     │     │ esp_id (FK)     │     │ sensor_id (FK)  │
│ gpio            │     │ gpio            │     │ raw_value       │
│ sensor_type     │     │ actuator_type   │     │ processed_value │
│ name            │     │ name            │     │ unit            │
│ subzone_id      │     │ inverted        │     │ quality         │
│ active          │     │ default_state   │     │ timestamp       │
│ raw_mode        │     │ critical        │     └─────────────────┘
└─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│ automation_rules│     │   audit_log     │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ name            │     │ action          │
│ enabled         │     │ entity_type     │
│ priority        │     │ entity_id       │
│ conditions      │     │ user_id         │
│ actions         │     │ details         │
│ cooldown_seconds│     │ created_at      │
└─────────────────┘     └─────────────────┘
```

---

## 6. CODING STANDARDS

### 6.1 Python Style

```python
# Datei-Header
"""Modul-Beschreibung (kurz, prägnant)"""

# Imports: Standard → Third-Party → Local
import json
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..deps import get_db
from ...schemas.sensor import SensorData

# Logger
logger = logging.getLogger(__name__)

# Klassen: PascalCase
class SensorService:
    """Service für Sensor-Operationen."""
    
    def __init__(self, db: Session):
        self.db = db
    
    # Methoden: snake_case
    async def get_sensor_data(self, esp_id: str, gpio: int) -> Optional[SensorData]:
        """Holt Sensor-Daten für ESP und GPIO."""
        pass

# Konstanten: UPPER_CASE
DEFAULT_MQTT_PORT = 1883
MAX_RETRY_ATTEMPTS = 3
```

### 6.2 Error Handling

```python
# Custom Exceptions
class SensorNotFoundError(Exception):
    """Sensor wurde nicht gefunden."""
    pass

# Usage
try:
    sensor = await sensor_service.get_by_gpio(esp_id, gpio)
    if not sensor:
        raise SensorNotFoundError(f"Sensor {gpio} auf {esp_id} nicht gefunden")
except SensorNotFoundError as e:
    logger.warning(str(e))
    raise HTTPException(status_code=404, detail=str(e))
except Exception as e:
    logger.exception("Unerwarteter Fehler: %s", e)
    raise HTTPException(status_code=500, detail="Interner Server-Fehler")
```

### 6.3 Logging

```python
# Structured Logging
logger.info("Sensor-Daten empfangen", extra={
    "esp_id": esp_id,
    "gpio": gpio,
    "raw_value": raw_value
})
```

---

## 7. ENTWICKLER-WORKFLOWS

### 7.1 Server starten (Development)

```bash
cd "El Servador"

# Dependencies installieren
poetry install

# Environment vorbereiten
cp config/.env.example .env

# Datenbank initialisieren
poetry run python god_kaiser_server/scripts/init_db.py
poetry run alembic upgrade head

# Server starten
poetry run uvicorn god_kaiser_server.src.main:app --reload --host 0.0.0.0 --port 8000
```

### 7.2 Tests ausführen

```bash
cd "El Servador"

# Alle Tests
poetry run pytest

# Mit Coverage
poetry run pytest --cov=god_kaiser_server --cov-report=term-missing

# Nur Unit Tests
poetry run pytest tests/unit/

# Nur Integration Tests
poetry run pytest tests/integration/
```

### 7.3 Code-Qualität

```bash
cd "El Servador"

# Formatierung prüfen
poetry run black --check god_kaiser_server/

# Formatierung anwenden
poetry run black god_kaiser_server/

# Linting
poetry run ruff check god_kaiser_server/
```

### 7.4 Database Migration

```bash
cd "El Servador/god_kaiser_server"

# Neue Migration erstellen
python -m alembic revision --autogenerate -m "Beschreibung"

# Migrationen anwenden
python -m alembic upgrade head

# Status prüfen
python -m alembic current

# Rückgängig
python -m alembic downgrade -1

# History
python -m alembic history
```

**Vorhandene Migrationen (Auswahl):**

| Migration | Beschreibung |
|-----------|--------------|
| `add_last_command_and_error_message_to_ActuatorState.py` | ActuatorState Erweiterung |
| `add_audit_log_indexes.py` | Audit-Log Performance |
| `add_sensor_operating_modes.py` | Sensor Operating Modes |
| `add_subzone_configs_table.py` | Subzone-Tabelle |
| `add_esp_heartbeat_logs.py` | ESP Heartbeat Logs |
| `add_master_zone_id_to_esp_device.py` | master_zone_id |

---

## 8. INTEGRATION MIT EL TRABAJANTE (ESP32)

### 8.1 Kritische Konsistenz-Punkte

| Aspekt | ESP32 Datei | Server Datei | MUSS übereinstimmen |
|--------|-------------|--------------|---------------------|
| MQTT Topics | `El Trabajante/docs/Mqtt_Protocoll.md` | `src/mqtt/subscriber.py` | Topic-Patterns |
| Sensor Payloads | `sensor_manager.cpp` | `sensor_handler.py` | JSON-Schema |
| Actuator Payloads | `actuator_manager.cpp` | `actuator_handler.py` | JSON-Schema |
| Error Codes | `error_codes.h` | `error_codes.py` | Error-Codes |

### 8.2 ESP32-Referenzdokumentation

Wenn du Server-seitig etwas implementierst, das mit ESP32 interagiert, lies IMMER:

1. **MQTT Topics & Payloads:** `.claude/reference/api/MQTT_TOPICS.md` ⚠️ **WICHTIGSTE QUELLE**
2. **Error Codes:** `.claude/reference/errors/ERROR_CODES.md` (ESP32: 1000-4999, Server: 5000-5999)
3. **Datenflüsse:** `.claude/reference/patterns/COMMUNICATION_FLOWS.md`
4. **ESP32 Firmware:** `.claude/skills/esp32/CLAUDE_Esp32.md`
5. **Sensor Types:** `El Trabajante/src/models/sensor_types.h`
6. **Actuator Types:** `El Trabajante/src/models/actuator_types.h`

---

## 10. HÄUFIGE FEHLER UND LÖSUNGEN

> **📚 Vollständige Error-Code Referenz:** `.claude/reference/errors/ERROR_CODES.md`
> Server Error Codes: 5000-5699 mit Beschreibungen und Lösungen

### 10.1 MQTT-Verbindung schlägt fehl

**Symptom:** `ConnectionRefusedError` bei `mqtt_client.connect()`

**Prüfen:**
1. Mosquitto läuft: `sudo systemctl status mosquitto`
2. Port offen: `netstat -ano | findstr 1883`
3. TLS-Certs korrekt

### 10.2 Sensor-Daten kommen nicht an

**Symptom:** ESP sendet, Server empfängt nicht

**Prüfen:**
1. Topic-Pattern in `subscriber.py` korrekt?
2. Handler registriert?
3. MQTT-Logs: `poetry run uvicorn ... --log-level debug`

### 10.3 Database Migration fehlgeschlagen

**Symptom:** `alembic upgrade` wirft Fehler

**Lösung:**
```bash
poetry run alembic current
poetry run alembic heads
# Bei Konflikten:
poetry run alembic merge heads -m "merge"
```

### 10.4 Bekannte Bug-Fixes

| Bug | Datei | Problem | Fix |
|-----|-------|---------|-----|
| #3 | `tests/conftest.py` | Fixture hieß `test_session` | Zu `db_session` umbenannt |
| #4 | `logic_validation.py` | `sensor`/`actuator` nicht akzeptiert | Als Aliase hinzugefügt |
| #5 | `heartbeat_handler.py` | Auto-Discovery registrierte unbekannte Geräte | Deaktiviert |
| #6 | `sensor_handler.py` | `raw_mode` war optional | Required Field |
| #7 | Integration Tests | `free_heap` statt `heap_free` | ESP32-Format |

**Dokumentation:** `tests/integration/BUGS_FOUND.md`

---

## 11. CHECKLISTE FÜR NEUE FEATURES

Vor jedem Commit prüfen:

- [ ] Code formatiert (`black`)
- [ ] Keine Linting-Fehler (`ruff`)
- [ ] Unit-Tests geschrieben
- [ ] Integration-Tests angepasst (wenn MQTT/API betroffen)
- [ ] Pydantic Schemas aktualisiert
- [ ] Database Migration erstellt (wenn Models geändert)
- [ ] Docstrings vollständig
- [ ] Logging hinzugefügt
- [ ] Error Handling implementiert
- [ ] ESP32-Kompatibilität geprüft (wenn MQTT betroffen)

---

## 12. MODUL-DOKUMENTATION NAVIGATION

| Aufgabe | Primäre Dokumentation | Code-Location |
|---------|----------------------|---------------|
| **Tests schreiben** | `El Servador/docs/ESP32_TESTING.md` | `tests/esp32/` |
| **MQTT-Protokoll** | `El Trabajante/docs/Mqtt_Protocoll.md` | `src/mqtt/` |
| **API-Endpunkte** | [Section 3.2](#32-aufgabe-rest-api-endpoint-hinzufügen) | `src/api/v1/` |
| **Sensor-Processing** | [Section 3.1](#31-aufgabe-neuen-sensor-typ-hinzufügen) | `src/sensors/` |
| **Actuator-Steuerung** | [Section 3.3](#33-aufgabe-mqtt-handler-implementieren) | `src/services/actuator_service.py` |
| **Cross-ESP-Logik** | [Section 3.5](#35-aufgabe-cross-esp-automation-rule-implementieren) | `src/services/logic_engine.py` |
| **Database-Models** | [Section 3.4](#34-aufgabe-database-model-hinzufügen) | `src/db/models/` |
| **ESP-Management** | `src/services/esp_service.py` | `src/db/repositories/esp_repo.py` |
| **Zone-Management** | `El Trabajante/docs/Dynamic Zones and Provisioning/` | `src/services/zone_service.py` |
| **Subzone-Management** | `El Trabajante/docs/system-flows/09-subzone-management-flow.md` | `src/services/subzone_service.py` |
| **Maintenance Jobs** | `src/services/maintenance/service.py` | `maintenance/jobs/cleanup.py` |
| **Simulation (Mock-ESP)** | `src/services/simulation/scheduler.py` | SimulationScheduler |
| **Audit Retention** | `src/services/audit_retention_service.py` | `src/api/v1/audit.py` |

---

## 13. KI-AGENTEN WORKFLOW

### Schritt-für-Schritt Anleitung

**SCHRITT 1: Aufgabe identifizieren**
- Was soll geändert werden?
- Welches Modul ist betroffen? (Section 12)
- Bug-Fix, Feature oder Refactoring?

**SCHRITT 2: Dokumentation konsultieren**
- Nutze Tabelle in Section 12
- **Immer zuerst lesen:** Relevante Doku vollständig
- **Server-spezifisch:** MQTT-Protokoll-Kompatibilität prüfen

**SCHRITT 3: Code-Location finden**
- Nutze Code-Location aus Section 12
- Verstehe Abhängigkeiten zwischen Modulen
- Prüfe bestehende Implementierungen

**SCHRITT 4: Änderungen implementieren**
- Test-Patterns: MockESP32Client für ESP32-Tests
- MQTT-Contracts nicht brechen
- Database-Migrations für Model-Änderungen
- Pydantic Schemas für API-Endpunkte
- Error-Handling mit Custom Exceptions

**SCHRITT 5: Tests ausführen**
```bash
cd "El Servador" && poetry run pytest god_kaiser_server/tests/ -v
```

**SCHRITT 6: Dokumentation aktualisieren**
- MQTT-Protokoll bei Topic/Payload-Änderungen
- API-Referenz bei neuen Endpoints

### Regeln für Code-Änderungen

**NIEMALS:**
- ❌ MQTT-Topic-Schema ohne Dokumentation ändern
- ❌ Database-Models ohne Migration ändern
- ❌ Production-Config in Tests ändern
- ❌ MQTT-Payload-Struktur ohne ESP32-Kompatibilität ändern

**IMMER:**
- ✅ MockESP32Client für ESP32-Tests verwenden
- ✅ Database-Migrations für Model-Änderungen erstellen
- ✅ MQTT-Protokoll-Kompatibilität prüfen
- ✅ Pydantic Schemas für API-Validierung nutzen
- ✅ Dokumentation konsultieren BEVOR Code-Änderung

---

## 14. IMPLEMENTIERUNGS-STATUS

### ✅ Implementiert (Production-Ready)

| Modul | Dateien | Tests |
|-------|---------|-------|
| **MQTT Client** | `client.py`, `subscriber.py`, `publisher.py`, `topics.py` | ✅ |
| **MQTT Handlers** | sensor, actuator, heartbeat, config, zone_ack, subzone_ack, lwt, error | ✅ |
| **Sensor Processing** | `library_loader.py`, `sensor_libraries/active/` | ✅ |
| **Database Models** | esp, sensor, actuator, logic, audit_log, subzone | ✅ |
| **Database Repositories** | `repositories/` | ✅ |
| **Core Config** | 19 Settings-Klassen, resilience | ✅ |
| **Audit System** | `audit_retention_service.py`, `api/v1/audit.py` | ✅ |
| **MaintenanceService** | `maintenance/service.py`, `jobs/cleanup.py` | ✅ |
| **SimulationScheduler** | `simulation/scheduler.py` | ✅ |
| **Zone/Subzone** | `zone_service.py`, `subzone_service.py` | ✅ |
| **Logic Engine** | `logic_engine.py`, conditions/actions/safety | ✅ |

### ⏳ Geplant

| Modul | Priorität |
|-------|-----------|
| **AI Service** | Medium |
| **Kaiser Service** | High (Skalierung) |

---

## 15. WEITERFÜHRENDE DOKUMENTATION

| Thema | Datei | Status |
|-------|-------|--------|
| **Server Architecture Dependencies** | `.claude/reference/ARCHITECTURE_DEPENDENCIES.md` | ✅ |
| **ESP32 Testing Guide** | `El Servador/docs/ESP32_TESTING.md` | ✅ |
| **MQTT Test Protocol** | `El Servador/docs/MQTT_TEST_PROTOCOL.md` | ✅ |
| **MQTT Protocol Spec** | `El Trabajante/docs/Mqtt_Protocoll.md` | ✅ |
| **ESP32 Firmware Docs** | `.claude/skills/esp32/CLAUDE_Esp32.md` | ✅ |
| **Test Workflow** | `.claude/reference/testing/TEST_WORKFLOW.md` | ✅ |
| **Workflow Patterns** | `.claude/archive/WORKFLOW_PATTERNS.md` | ✅ |

---

## 16. KRITISCHE CODE-DATEIEN REFERENZ

### Entry Points

- **FastAPI App:** `src/main.py`
- **MQTT Startup:** `src/main.py` (lifespan:55-230)
- **Database Init:** `src/db/session.py`

### Core Configuration

- **Settings:** `src/core/config.py`
- **Config Mapping:** `src/core/config_mapping.py`
- **Error Codes:** `src/core/error_codes.py`
- **Resilience:** `src/core/resilience/`
- **Scheduler:** `src/core/scheduler.py`

### MQTT Layer

- **Client:** `src/mqtt/client.py`
- **Subscriber:** `src/mqtt/subscriber.py`
- **Publisher:** `src/mqtt/publisher.py`
- **Topics:** `src/mqtt/topics.py`

### Business Logic

- **ESP Service:** `src/services/esp_service.py`
- **Sensor Service:** `src/services/sensor_service.py`
- **Actuator Service:** `src/services/actuator_service.py`
- **Safety Service:** `src/services/safety_service.py`
- **Logic Engine:** `src/services/logic_engine.py`
- **Zone/Subzone:** `src/services/zone_service.py`, `subzone_service.py`

### Testing

- **MockESP32Client:** `tests/esp32/mocks/mock_esp32_client.py`
- **Test Fixtures:** `tests/conftest.py`
- **Integration Tests:** `tests/integration/test_server_esp32_integration.py`

---

## 17. SCHNELLREFERENZ: HÄUFIGE BEFEHLE

```bash
# Server-Verzeichnis
cd "El Servador/god_kaiser_server"

# Tests ausführen
python -m pytest tests/integration/ -v --no-cov

# Migration erstellen
python -m alembic revision --autogenerate -m "Beschreibung"

# Migration anwenden
python -m alembic upgrade head

# Migration-Status
python -m alembic current
```

---

## 18. KRITISCHE FUNKTIONEN & ABLÄUFE

### 18.1 Sensor-Daten-Verarbeitungs-Flow

```
1. ESP32 sendet Sensor-Daten (MQTT)
   Topic: kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
   
2. Server empfängt (src/mqtt/subscriber.py)
   Handler: sensor_handler.handle_sensor_data()
   
3. Sensor-Handler verarbeitet (src/mqtt/handlers/sensor_handler.py)
   - Topic-Parsing
   - Payload-Validierung
   - ESP-Device-Lookup
   
4. Pi-Enhanced Processing (wenn aktiviert)
   - Library-Loader: src/sensors/library_loader.py
   - Processing: sensor_libraries/active/
   - Response: .../sensor/{gpio}/processed
   
5. Database-Speicherung
   - SensorData Tabelle
   
6. Logic-Engine Trigger (non-blocking)
   - logic_engine.evaluate_sensor_data()
```

### 18.2 Actuator-Command-Flow

```
1. Command-Request (API oder Logic-Engine)
   
2. Safety-Validation (src/services/safety_service.py)
   - Emergency-Stop, Value-Range, Runtime-Protection
   
3. Command-Publishing (src/mqtt/publisher.py)
   - Topic: .../actuator/{gpio}/command
   - QoS: 2
   
4. ESP32 empfängt und führt aus
   
5. Status-Update (ESP32 → Server)
   - Topic: .../actuator/{gpio}/status
   - Database-Update: ActuatorState
```

### 18.3 Logic-Engine Evaluation-Flow

```
1. Trigger (Sensor-Daten empfangen)
   
2. Rule-Matching
   - LogicRepository.get_rules_by_trigger_sensor()
   
3. Condition-Evaluation
   - _check_conditions()
   - Types: sensor_threshold, time_window
   
4. Cooldown-Check
   - get_last_execution()
   
5. Action-Execution
   - ActuatorService.send_command()
   
6. Execution-Logging
   - LogicRepository.log_execution()
```

### 18.4 Heartbeat & Device-Registration-Flow

```
1. ESP32 sendet Heartbeat
   Topic: .../system/heartbeat
   
2. Server empfängt
   Handler: heartbeat_handler.handle_heartbeat()
   
3. Device-Lookup
   - KRITISCH: Wenn nicht registriert → Rejection
   
4. Status-Update
   - ESPRepository.update_status()
   - last_seen, Metadata
```

**Device-Registration:** `POST /api/v1/esp/register`

---

## 19. CI/CD INTEGRATION (GitHub Actions)

### 19.1 Relevante Workflows

| Workflow | Datei | Trigger | Tests |
|----------|-------|---------|-------|
| **Server Tests** | `server-tests.yml` | Push/PR auf `El Servador/**` | Unit + Integration |
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR auf `tests/esp32/**` | MockESP32 Tests |

### 19.2 GitHub CLI - Log-Befehle

```bash
# Letzte Runs
gh run list --workflow=server-tests.yml --limit=10

# Vollständige Logs
gh run view <run-id> --log

# Nur fehlgeschlagene Jobs
gh run view <run-id> --log-failed

# Artifacts herunterladen
gh run download <run-id>

# Workflow manuell starten
gh workflow run server-tests.yml
```

### 19.3 CI vs. Lokal

| Komponente | CI | Lokal |
|------------|-----|-------|
| **Python** | 3.11 | Poetry-Env |
| **Database** | SQLite In-Memory | PostgreSQL/SQLite |
| **MQTT Broker** | Mosquitto Docker | Optional lokal |

### 19.4 Verwandte Dokumentation

- **Test-Workflow (NUR auf Anfrage):** `.claude/reference/testing/TEST_WORKFLOW.md`
- **Log-System & Serial Capture:** `.claude/reference/debugging/LOG_SYSTEM.md`
- **CI Pipeline & GitHub Actions:** `.claude/reference/debugging/CI_PIPELINE.md`
- **KI-Zugriffslimitationen:** `.claude/reference/debugging/ACCESS_LIMITATIONS.md`
- **MockESP32Client Details:** `El Servador/docs/ESP32_TESTING.md`

> ⚠️ Tests werden NUR auf explizite User-Anfrage durchgeführt.

---

## Referenz-Dokumentation

> Diese Referenz-Dateien enthalten detaillierte Informationen und sollten bei Bedarf konsultiert werden:

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | MQTT Handler implementieren |
| **REST API** | `.claude/reference/api/REST_ENDPOINTS.md` | API Endpoints verstehen |
| **WebSocket Events** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Real-time Features |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | Fehler debuggen |
| **Datenflüsse** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | System-Kommunikation |
| **Debugging** | `.claude/reference/debugging/LOG_LOCATIONS.md` | Server-Logs analysieren |
| **CI/CD** | `.claude/reference/debugging/CI_PIPELINE.md` | GitHub Actions |
| **Tests** | `.claude/reference/testing/TEST_WORKFLOW.md` | Tests ausführen (NUR auf Anfrage) |

---

## Versions-Historie

**Version:** 5.1 (SKILL.md Format)
**Letzte Aktualisierung:** 2026-02-01

### Änderungen in v5.1

- YAML Frontmatter mit `name`, `description`, `allowed-tools` hinzugefügt
- Format für Claude Code VS Code Extension optimiert
- Pfade aktualisiert für neue `.claude/skills/` Struktur
- Alle Inhalte vollständig erhalten

### Vorherige Änderungen

- **v5.0:** Vollständiger Codebase-Abgleich, API v1 Router, Verzeichnisstruktur
- **v4.0:** Codebase-Analyse El Servador, Startup/Shutdown, MQTT-Handler
- **v3.0:** Industrial Production Implementation, Audit-Log, Error-Codes