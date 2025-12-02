# CLAUDE_SERVER.md - God-Kaiser Server Referenz für KI-Agenten

**Version:** 2.0  
**Letzte Aktualisierung:** 2025-01  
**Zweck:** Zentrale Referenz für Claude, um bei jeder Server-Aufgabe die richtigen Dateien, Patterns und Konventionen zu finden.

---

## 0. QUICK DECISION TREE - Welche Doku lesen?

### 🔧 "Ich will Code ändern"
1. **Welches Modul?** → [Section 9: Modul-Dokumentation Navigation](#9-modul-dokumentation-navigation)
2. **Workflow folgen** → [Section 10: KI-Agenten Workflow](#10-ki-agenten-workflow)
3. **Tests schreiben** → `El Servador/docs/ESP32_TESTING.md` (Server-orchestrierte Tests)
4. **Pattern-Beispiele** → `.claude/WORKFLOW_PATTERNS.md`

### 🐛 "Ich habe einen Fehler"
1. **Build-Fehler?** → [Section 7: Entwickler-Workflows](#7-entwickler-workflows) + `pyproject.toml` prüfen
2. **Test-Fehler?** → `El Servador/docs/ESP32_TESTING.md` Section Troubleshooting
3. **Runtime-Fehler?** → [Section 10: Häufige Fehler](#10-häufige-fehler-und-lösungen)
4. **MQTT-Problem?** → `El Trabajante/docs/Mqtt_Protocoll.md` + [Section 4: MQTT Topic-Referenz](#4-mqtt-topic-referenz-server-perspektive)
5. **Database-Fehler?** → [Section 7.4: Database Migration](#74-database-migration)

### 📖 "Ich will verstehen wie X funktioniert"
1. **System-Flow?** → `El Trabajante/docs/system-flows/` (Boot, Sensor-Reading, Actuator-Command)
2. **MQTT-Protokoll?** → `El Trabajante/docs/Mqtt_Protocoll.md` + [Section 4](#4-mqtt-topic-referenz-server-perspektive)
3. **API-Endpunkte?** → [Section 3.2: REST API Endpoint hinzufügen](#32-aufgabe-rest-api-endpoint-hinzufügen) + `src/api/v1/`
4. **Test-Infrastruktur?** → `El Servador/docs/ESP32_TESTING.md` (Server-orchestrierte Tests)
5. **Sensor-Processing?** → [Section 3.1: Neuen Sensor-Typ hinzufügen](#31-aufgabe-neuen-sensor-typ-hinzufügen)

### ➕ "Ich will neues Feature hinzufügen"
1. **Sensor-Library?** → [Section 3.1: Neuen Sensor-Typ hinzufügen](#31-aufgabe-neuen-sensor-typ-hinzufügen)
2. **API-Endpoint?** → [Section 3.2: REST API Endpoint hinzufügen](#32-aufgabe-rest-api-endpoint-hinzufügen)
3. **MQTT-Handler?** → [Section 3.3: MQTT Handler implementieren](#33-aufgabe-mqtt-handler-implementieren)
4. **Database-Model?** → [Section 3.4: Database Model hinzufügen](#34-aufgabe-database-model-hinzufügen)
5. **Automation-Rule?** → [Section 3.5: Cross-ESP Automation Rule implementieren](#35-aufgabe-cross-esp-automation-rule-implementieren)
6. **Test?** → `El Servador/docs/ESP32_TESTING.md` (MockESP32Client Pattern)

---

## 1. SYSTEM-KONTEXT: Was ist der God-Kaiser Server?

### 1.1 Rolle im AutomationOne-Ökosystem
```
┌─────────────────────────────────────────────────────────────────┐
│                    HARDWARE-HIERARCHIE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
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

### 1.2 Kernverantwortlichkeiten des God-Kaiser Servers

| Verantwortlichkeit | Beschreibung | Kritische Dateien |
|-------------------|--------------|-------------------|
| **Sensor-Datenverarbeitung** | Empfängt RAW-Daten von ESPs, verarbeitet mit Python-Libraries | `src/mqtt/handlers/sensor_handler.py`, `src/sensors/library_loader.py` |
| **Actuator-Steuerung** | Validiert und sendet Commands an ESPs | `src/mqtt/handlers/actuator_handler.py`, `src/services/actuator_service.py` |
| **Cross-ESP-Logik** | If-Sensor-Then-Actuator über mehrere ESPs | `src/services/logic_engine.py` |
| **Geräteverwaltung** | ESP-Registry, Zonen, Konfiguration | `src/services/esp_service.py`, `src/services/zone_service.py` |
| **Persistenz** | Sensor-Daten, Configs, User, Logs | `src/db/models/`, `src/db/repositories/` |
| **REST API** | Frontend-Kommunikation | `src/api/v1/` |
| **WebSocket** | Realtime-Updates ans Frontend | `src/websocket/manager.py` |
| **God-Integration** | KI-Schnittstelle (zukünftig) | `src/services/ai_service.py` |

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

## 2. VERZEICHNISSTRUKTUR
```
El Servador/
├── god_kaiser_server/
│   ├── src/                          # 🎯 HAUPTCODE
│   │   ├── main.py                   # FastAPI App Entry Point
│   │   ├── core/                     # Zentrale Konfiguration
│   │   │   ├── config.py             # ⭐ Settings (Pydantic BaseSettings)
│   │   │   ├── security.py           # JWT, Password Hashing
│   │   │   ├── logging.py            # Structured Logging
│   │   │   └── exceptions.py         # Custom Exceptions
│   │   │
│   │   ├── api/                      # REST API Layer
│   │   │   ├── deps.py               # ⭐ Dependency Injection (DB, Auth)
│   │   │   └── v1/                   # API Version 1
│   │   │       ├── auth.py           # Login, Register, Token Refresh
│   │   │       ├── esp.py            # ESP CRUD, Status
│   │   │       ├── sensors.py        # Sensor Config, Data Query
│   │   │       ├── actuators.py      # Actuator Control, Status
│   │   │       ├── zones.py          # Zone Management
│   │   │       ├── logic.py          # Automation Rules CRUD
│   │   │       ├── library.py        # Sensor Library Management
│   │   │       ├── system.py         # Health, Metrics, Logs
│   │   │       └── kaiser.py         # Kaiser Node Management
│   │   │
│   │   ├── services/                 # 🧠 BUSINESS LOGIC
│   │   │   ├── esp_service.py        # ⭐ ESP Registration, Discovery
│   │   │   ├── sensor_service.py     # ⭐ Sensor Config, Data Processing
│   │   │   ├── actuator_service.py   # ⭐ Command Validation, Execution
│   │   │   ├── logic_engine.py       # ⭐ Cross-ESP Automation Engine
│   │   │   ├── zone_service.py       # Zone Hierarchy Management
│   │   │   ├── library_service.py    # Sensor Library Management
│   │   │   ├── auth_service.py       # User Authentication
│   │   │   ├── mqtt_service.py       # MQTT Orchestration
│   │   │   ├── websocket_service.py  # Realtime Broadcast
│   │   │   ├── ai_service.py         # God Layer Integration (Future)
│   │   │   └── scheduler_service.py  # Periodic Tasks
│   │   │
│   │   ├── mqtt/                     # 📡 MQTT LAYER
│   │   │   ├── client.py             # ⭐ Paho-MQTT Singleton Wrapper
│   │   │   ├── subscriber.py         # Topic Subscriptions
│   │   │   ├── publisher.py          # Message Publishing
│   │   │   └── handlers/             # ⭐ MESSAGE HANDLERS
│   │   │       ├── sensor_handler.py # Sensor Data Processing
│   │   │       ├── actuator_handler.py # Actuator Status/Response
│   │   │       ├── system_handler.py # Heartbeat, Diagnostics
│   │   │       └── config_handler.py # Config Responses
│   │   │
│   │   ├── websocket/                # 🔴 REALTIME
│   │   │   ├── manager.py            # Connection Management
│   │   │   └── events.py             # Event Types
│   │   │
│   │   ├── db/                       # 💾 DATABASE LAYER
│   │   │   ├── session.py            # ⭐ Engine, Session Factory
│   │   │   ├── models/               # SQLAlchemy Models
│   │   │   │   ├── esp.py            # ESP Device Model
│   │   │   │   ├── sensor.py         # SensorConfig, SensorData
│   │   │   │   ├── actuator.py       # ActuatorConfig, ActuatorLog
│   │   │   │   ├── zone.py           # Zone, MasterZone, SubZone
│   │   │   │   ├── logic.py          # AutomationRule, Condition
│   │   │   │   ├── user.py           # User, Role, Permission
│   │   │   │   ├── kaiser.py         # Kaiser Node Model
│   │   │   │   ├── library.py        # SensorLibrary Model
│   │   │   │   └── system.py         # SystemConfig, SystemLog
│   │   │   └── repositories/         # Repository Pattern
│   │   │       ├── base.py           # BaseRepository (CRUD)
│   │   │       ├── esp_repo.py       # ESP-specific Queries
│   │   │       ├── sensor_repo.py    # Sensor Data Queries
│   │   │       └── ...               # (weitere Repos)
│   │   │
│   │   ├── sensors/                  # 🔬 SENSOR PROCESSING
│   │   │   ├── library_loader.py     # ⭐ Dynamic Import (importlib)
│   │   │   ├── base_processor.py     # Abstract Sensor Processor
│   │   │   └── sensor_libraries/
│   │   │       └── active/           # ⭐ AKTIVE SENSOR-LIBRARIES
│   │   │           ├── ph_sensor.py
│   │   │           ├── ec_sensor.py
│   │   │           ├── sht31.py
│   │   │           ├── ds18b20.py
│   │   │           ├── bmp280.py
│   │   │           └── ...
│   │   │
│   │   ├── schemas/                  # 📋 PYDANTIC DTOs
│   │   │   ├── common.py             # BaseResponse, Pagination
│   │   │   ├── esp.py                # ESPCreate, ESPResponse
│   │   │   ├── sensor.py             # SensorConfig, SensorData
│   │   │   ├── actuator.py           # ActuatorCommand, ActuatorStatus
│   │   │   ├── zone.py               # ZoneCreate, ZoneResponse
│   │   │   ├── logic.py              # RuleCreate, ConditionSchema
│   │   │   ├── auth.py               # TokenResponse, UserCreate
│   │   │   ├── kaiser.py             # KaiserStatus
│   │   │   └── library.py            # LibraryUpload, LibraryInfo
│   │   │
│   │   └── utils/                    # 🔧 HELPERS
│   │       ├── mqtt_helpers.py       # Topic Parsing, Validation
│   │       ├── time_helpers.py       # Timestamp Utilities
│   │       ├── data_helpers.py       # JSON, Conversion
│   │       └── network_helpers.py    # IP, Hostname Utils
│   │
│   ├── scripts/                      # 🛠️ ADMIN SCRIPTS
│   │   ├── init_db.py                # Database Initialization
│   │   ├── create_admin.py           # Create Admin User
│   │   ├── backup_db.py              # Database Backup
│   │   ├── restore_db.py             # Database Restore
│   │   ├── generate_certificates.py  # TLS Cert Generation
│   │   └── migrate_from_old.py       # Migration Script
│   │
│   ├── tests/                        # 🧪 TESTS
│   │   ├── unit/                     # Unit Tests
│   │   │   ├── test_library_loader.py
│   │   │   ├── test_logic_engine.py
│   │   │   └── ...
│   │   ├── integration/              # Integration Tests
│   │   │   ├── test_mqtt_flow.py
│   │   │   ├── test_api_esp.py
│   │   │   └── ...
│   │   └── e2e/                      # End-to-End Tests
│   │       └── test_sensor_to_frontend.py
│   │
│   ├── alembic/                      # 🔄 DATABASE MIGRATIONS
│   │   ├── env.py                    # Alembic Environment
│   │   ├── script.py.mako            # Migration Template
│   │   └── versions/                 # Migration Files
│   │
│   ├── docs/                         # 📚 SERVER-DOKUMENTATION
│   │   ├── ARCHITECTURE.md           # ⚠️ [LEER - ZU ERSTELLEN]
│   │   ├── API.md                    # ⚠️ [LEER - ZU ERSTELLEN]
│   │   ├── MQTT_TOPICS.md            # ⚠️ [LEER - ZU ERSTELLEN]
│   │   ├── SECURITY.md               # ⚠️ [LEER - ZU ERSTELLEN]
│   │   ├── DEPLOYMENT.md             # ⚠️ [LEER - ZU ERSTELLEN]
│   │   ├── DEVELOPMENT.md            # ⚠️ [LEER - ZU ERSTELLEN]
│   │   └── TESTING.md                # ⚠️ [LEER - ZU ERSTELLEN]
│   │
│   └── config/                       # ⚙️ KONFIGURATION
│       ├── .env.example              # Environment Template
│       └── logging.yaml              # Logging Configuration
│
├── pyproject.toml                    # Poetry Dependencies
├── README.md                         # Server Overview
├── .gitignore                        # Git Ignores
└── CLAUDE_SERVER.md                  # ⭐ DIESE DATEI
```

---

## 3. KRITISCHE DATEIEN PRO AUFGABENTYP

### 3.1 Aufgabe: Neuen Sensor-Typ hinzufügen

**Szenario:** User will einen neuen Sensor (z.B. CO2-Sensor) unterstützen.

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
        # Lineare Interpolation (Beispiel - anpassen für echten Sensor)
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

**Szenario:** User will einen neuen Endpoint `/api/v1/dashboard/summary`.

**Zu analysierende Dateien:**
1. `src/api/v1/system.py` - Beispiel-Endpoint
2. `src/api/deps.py` - Dependency Injection
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
    """
    Liefert Dashboard-Zusammenfassung.
    
    - Anzahl ESPs (online/offline)
    - Aktive Sensoren
    - Letzte Alerts
    """
    esp_service = ESPService(db)
    sensor_service = SensorService(db)
    
    return {
        "status": "success",
        "data": {
            "esp_count": esp_service.get_count(),
            "esp_online": esp_service.get_online_count(),
            "sensor_count": sensor_service.get_active_count(),
            "last_alerts": []  # TODO
        }
    }
```

**Router registrieren in `src/main.py`:**
```python
from .api.v1 import dashboard
app.include_router(dashboard.router, prefix="/api/v1")
```

---

### 3.3 Aufgabe: MQTT Handler implementieren

**Szenario:** Server soll auf neues Topic reagieren.

**Zu analysierende Dateien:**
1. `src/mqtt/client.py` - MQTT Client Setup
2. `src/mqtt/subscriber.py` - Topic Subscriptions
3. `src/mqtt/handlers/sensor_handler.py` - Beispiel Handler
4. `El Trabajante/docs/Mqtt_Protocoll.md` - ⚠️ ESP32 Topic-Spezifikation!

**Pattern für neuen Handler:**
```python
# src/mqtt/handlers/diagnostics_handler.py
"""
Handler für System-Diagnostics Messages
Topic: kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics
"""
import json
import logging
from typing import Dict, Any

from ...services.esp_service import ESPService
from ...db.session import get_session

logger = logging.getLogger(__name__)

async def handle_diagnostics(topic: str, payload: Dict[str, Any]) -> None:
    """
    Verarbeitet Diagnostics-Nachrichten von ESPs.
    
    Payload-Struktur (von ESP32):
    {
        "esp_id": "ESP_12AB34CD",
        "timestamp": 1234567890,
        "free_heap": 123456,
        "uptime_seconds": 3600,
        "wifi_rssi": -65,
        "mqtt_reconnects": 2,
        "sensor_errors": 0,
        "actuator_errors": 0
    }
    """
    try:
        esp_id = payload.get("esp_id")
        if not esp_id:
            logger.warning("Diagnostics ohne esp_id: %s", payload)
            return
            
        async with get_session() as db:
            esp_service = ESPService(db)
            await esp_service.update_diagnostics(esp_id, payload)
            
        logger.info("Diagnostics aktualisiert für %s", esp_id)
        
    except Exception as e:
        logger.exception("Fehler bei Diagnostics-Verarbeitung: %s", e)
```

**Handler registrieren in `src/mqtt/subscriber.py`:**
```python
from .handlers.diagnostics_handler import handle_diagnostics

TOPIC_HANDLERS = {
    "kaiser/+/esp/+/system/diagnostics": handle_diagnostics,
    # ... andere Handler
}
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
"""
Alert Model - Systemweite Alerts und Notifications
"""
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
    
    # Relationships
    esp = relationship("ESP", back_populates="alerts")
    user = relationship("User", back_populates="acknowledged_alerts")
```

**Migration erstellen:**
```bash
cd El\ Servador
poetry run alembic revision --autogenerate -m "Add alerts table"
poetry run alembic upgrade head
```

---

### 3.5 Aufgabe: Cross-ESP Automation Rule implementieren

**Szenario:** Wenn Sensor A > Threshold, dann Actuator B aktivieren.

**Zu analysierende Dateien:**
1. `src/services/logic_engine.py` - ⭐ Kernlogik
2. `src/db/models/logic.py` - Rule/Condition Models
3. `src/schemas/logic.py` - Rule Schemas
4. `src/api/v1/logic.py` - Rule CRUD Endpoints

**Datenfluss:**
```
1. Sensor-Daten kommen via MQTT
2. sensor_handler.py ruft logic_engine.evaluate() auf
3. logic_engine lädt passende Rules aus DB
4. Conditions werden evaluiert
5. Bei Match: Actuator-Command via MQTT
```

**Rule-Struktur (Database):**
```python
# Beispiel-Rule in DB
{
    "id": 1,
    "name": "Auto-Irrigation",
    "enabled": true,
    "priority": 1,
    "conditions": [
        {
            "source_esp_id": "ESP_SENSOR_01",
            "source_gpio": 4,
            "source_type": "sensor",
            "operator": ">",
            "value": 30.0,
            "logic_operator": "AND"
        }
    ],
    "actions": [
        {
            "target_esp_id": "ESP_ACTUATOR_01",
            "target_gpio": 5,
            "target_type": "actuator",
            "action": "ON",
            "value": 1.0
        }
    ],
    "cooldown_seconds": 300,
    "time_start": "06:00",
    "time_end": "22:00"
}
```

---

## 4. MQTT TOPIC-REFERENZ (Server-Perspektive)

### 4.1 Topics die der Server SUBSCRIBED

| Topic Pattern | Handler | Beschreibung |
|--------------|---------|--------------|
| `kaiser/+/esp/+/sensor/+/data` | `sensor_handler.py` | Sensor-Rohdaten |
| `kaiser/+/esp/+/actuator/+/status` | `actuator_handler.py` | Actuator-Status |
| `kaiser/+/esp/+/actuator/+/response` | `actuator_handler.py` | Command-Responses |
| `kaiser/+/esp/+/system/heartbeat` | `system_handler.py` | ESP Heartbeats |
| `kaiser/+/esp/+/system/diagnostics` | `system_handler.py` | System-Diagnostics |
| `kaiser/+/esp/+/config_response` | `config_handler.py` | Config-Bestätigungen |

### 4.2 Topics auf die der Server PUBLISHED

| Topic Pattern | Service | Beschreibung |
|--------------|---------|--------------|
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | `actuator_service.py` | Actuator-Commands |
| `kaiser/{kaiser_id}/esp/{esp_id}/config` | `esp_service.py` | Config-Updates |
| `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | `zone_service.py` | Zone-Zuweisung |
| `kaiser/broadcast/emergency` | `actuator_service.py` | Emergency-Stop |
| `kaiser/broadcast/system_update` | `mqtt_service.py` | System-Updates |

### 4.3 MQTT Payload-Schemas

**Sensor Data (ESP → Server):**
```json
{
    "gpio": 4,
    "sensor_type": "ph_sensor",
    "sensor_name": "Tank pH",
    "raw_value": 2048,
    "timestamp": 1234567890,
    "esp_id": "ESP_12AB34CD"
}
```

**Actuator Command (Server → ESP):**
```json
{
    "command": "SET",
    "value": 1.0,
    "source": "automation",
    "rule_id": 1,
    "timestamp": 1234567890
}
```

**⚠️ KRITISCH:** Für vollständige Payload-Spezifikationen siehe:
- `El Trabajante/docs/Mqtt_Protocoll.md`
- `El Trabajante/test/README.md` (JSON Payload Specifications)

---

## 5. DATABASE SCHEMA (Geplant)

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
│ automation_rules│     │ sensor_libraries│
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ name            │     │ sensor_type     │
│ enabled         │     │ version         │
│ priority        │     │ filename        │
│ conditions (JSON)     │ created_at      │
│ actions (JSON)  │     │ active          │
│ cooldown_seconds│     └─────────────────┘
│ time_start      │
│ time_end        │
└─────────────────┘
```

---

## 6. CODING STANDARDS

### 6.1 Python Style
```python
# Datei-Header
"""
Modul-Beschreibung (kurz, prägnant)
"""

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
        """
        Holt Sensor-Daten für ESP und GPIO.
        
        Args:
            esp_id: ESP-Identifier
            gpio: GPIO-Pin-Nummer
            
        Returns:
            SensorData oder None wenn nicht gefunden
        """
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

class MQTTConnectionError(Exception):
    """MQTT-Verbindung fehlgeschlagen."""
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

logger.error("MQTT Publish fehlgeschlagen", extra={
    "topic": topic,
    "error": str(e)
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
# .env editieren (DATABASE_URL, MQTT_BROKER, etc.)

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

# Type-Checking (wenn mypy konfiguriert)
poetry run mypy god_kaiser_server/
```

### 7.4 Database Migration
```bash
cd "El Servador"

# Neue Migration erstellen (nach Model-Änderung)
poetry run alembic revision --autogenerate -m "Beschreibung"

# Migrationen anwenden
poetry run alembic upgrade head

# Migration rückgängig
poetry run alembic downgrade -1
```

---

## 8. INTEGRATION MIT EL TRABAJANTE (ESP32)

### 8.1 Kritische Konsistenz-Punkte

| Aspekt | ESP32 Datei | Server Datei | MUSS übereinstimmen |
|--------|-------------|--------------|---------------------|
| MQTT Topics | `El Trabajante/docs/Mqtt_Protocoll.md` | `src/mqtt/subscriber.py` | Topic-Patterns |
| Sensor Payloads | `El Trabajante/src/services/sensor/sensor_manager.cpp` | `src/mqtt/handlers/sensor_handler.py` | JSON-Schema |
| Actuator Payloads | `El Trabajante/src/services/actuator/actuator_manager.cpp` | `src/mqtt/handlers/actuator_handler.py` | JSON-Schema |
| Config Payloads | `El Trabajante/docs/Mqtt_Protocoll.md` | `src/services/esp_service.py` | JSON-Schema |
| Error Codes | `El Trabajante/src/models/error_codes.h` | (neu zu erstellen) | Error-Codes |

### 8.2 ESP32-Referenzdokumentation

Wenn du Server-seitig etwas implementierst, das mit ESP32 interagiert, lies IMMER:

1. **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`
2. **System Flows:** `El Trabajante/docs/system-flows/`
3. **Test Contract:** `El Trabajante/test/README.md`
4. **Sensor Types:** `El Trabajante/src/models/sensor_types.h`
5. **Actuator Types:** `El Trabajante/src/models/actuator_types.h`

---

## 9. MOCK-SERVER FÜR TESTING

Für ESP32-Integration-Tests existiert ein Mock-Server:

**Location:** `El Trabajante/god_kaiser_test_server/`

**Starten:**
```bash
cd "El Trabajante/god_kaiser_test_server"
docker-compose up -d
```

**Ports:**
- MQTT: `localhost:1883`
- HTTP: `localhost:8000`

**Nützlich für:**
- ESP32 Firmware-Tests ohne echten Server
- API-Prototyping
- CI/CD Pipeline

---

## 10. HÄUFIGE FEHLER UND LÖSUNGEN

### 10.1 MQTT-Verbindung schlägt fehl

**Symptom:** `ConnectionRefusedError` bei `mqtt_client.connect()`

**Prüfen:**
1. Mosquitto läuft: `sudo systemctl status mosquitto`
2. Port offen: `sudo ufw status` (8883/tcp)
3. TLS-Certs korrekt: `mosquitto_sub -h localhost -p 8883 --cafile ca.crt`

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
# Aktuelle Revision prüfen
poetry run alembic current

# Heads anzeigen
poetry run alembic heads

# Bei Konflikten: Merge
poetry run alembic merge heads -m "merge"
```

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

### Wann welche Dokumentation konsultieren?

| Aufgabe | Primäre Dokumentation | Zusätzliche Ressourcen | Code-Location | Verantwortlichkeit |
|---------|----------------------|------------------------|---------------|-------------------|
| **Tests schreiben/ausführen** | `El Servador/docs/ESP32_TESTING.md` | `.claude/TEST_WORKFLOW.md` | `El Servador/god_kaiser_server/tests/esp32/` | pytest Tests, MockESP32Client, Fixtures |
| **MQTT-Protokoll verstehen** | `El Trabajante/docs/Mqtt_Protocoll.md` | [Section 4: MQTT Topic-Referenz](#4-mqtt-topic-referenz-server-perspektive) | `El Servador/god_kaiser_server/src/mqtt/` | Topics, Payloads, QoS, Wildcards |
| **API-Endpunkte** | [Section 3.2: REST API Endpoint](#32-aufgabe-rest-api-endpoint-hinzufügen) | `El Servador/god_kaiser_server/src/api/v1/` | `El Servador/god_kaiser_server/src/api/v1/` | FastAPI Router, Endpoints, Schemas |
| **Sensor-Processing** | [Section 3.1: Neuen Sensor-Typ hinzufügen](#31-aufgabe-neuen-sensor-typ-hinzufügen) | `El Servador/god_kaiser_server/src/sensors/` | `El Servador/god_kaiser_server/src/sensors/` | LibraryLoader, BaseProcessor, Sensor Libraries |
| **Actuator-Steuerung** | [Section 3.3: MQTT Handler](#33-aufgabe-mqtt-handler-implementieren) | `El Servador/god_kaiser_server/src/services/actuator_service.py` | `El Servador/god_kaiser_server/src/services/actuator_service.py` | ActuatorService, Command Validation, MQTT Publishing |
| **Cross-ESP-Logik** | [Section 3.5: Automation Rule](#35-aufgabe-cross-esp-automation-rule-implementieren) | `El Servador/god_kaiser_server/src/services/logic_engine.py` | `El Servador/god_kaiser_server/src/services/logic_engine.py` | LogicEngine, Rule Evaluation, Condition Matching |
| **Database-Models** | [Section 3.4: Database Model](#34-aufgabe-database-model-hinzufügen) | `El Servador/god_kaiser_server/src/db/models/` | `El Servador/god_kaiser_server/src/db/models/` | SQLAlchemy Models, Relationships, Migrations |
| **ESP-Management** | `El Servador/god_kaiser_server/src/services/esp_service.py` | `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py` | `El Servador/god_kaiser_server/src/services/esp_service.py` | ESP Registration, Discovery, Health Monitoring |
| **Zone-Management** | `El Trabajante/docs/Dynamic Zones and Provisioning/` | `El Servador/god_kaiser_server/src/services/zone_service.py` | `El Servador/god_kaiser_server/src/services/zone_service.py` | Zone Hierarchy, Assignment, Master/Sub Zones |

### Service-Module Übersicht

#### MQTT (`El Servador/god_kaiser_server/src/mqtt/`)
- **MQTTClient:** Singleton MQTT-Client (Paho-MQTT Wrapper)
- **Subscriber:** Topic-Subscriptions, Handler-Registry
- **Publisher:** Message-Publishing, Topic-Building
- **Handlers:** Sensor, Actuator, System, Config Message-Handler
- **Dokumentation:** [Section 4: MQTT Topic-Referenz](#4-mqtt-topic-referenz-server-perspektive), `El Trabajante/docs/Mqtt_Protocoll.md`

#### Sensor (`El Servador/god_kaiser_server/src/sensors/`)
- **LibraryLoader:** Dynamic Import von Sensor-Libraries (importlib)
- **BaseProcessor:** Abstract Base Class für alle Sensor-Processors
- **Sensor Libraries:** Pi-Enhanced Processing (pH, EC, Temperature, etc.)
- **Dokumentation:** [Section 3.1: Neuen Sensor-Typ hinzufügen](#31-aufgabe-neuen-sensor-typ-hinzufügen)

#### Actuator (`El Servador/god_kaiser_server/src/services/actuator_service.py`)
- **ActuatorService:** Command Validation, Execution, MQTT Publishing
- **Safety Checks:** Emergency Stop, Timeout Protection, Constraint Validation
- **Dokumentation:** [Section 3.3: MQTT Handler](#33-aufgabe-mqtt-handler-implementieren)

#### Logic Engine (`El Servador/god_kaiser_server/src/services/logic_engine.py`)
- **LogicEngine:** Cross-ESP Automation Rule Evaluation
- **Condition Matching:** Sensor-Value → Rule Trigger
- **Action Execution:** Actuator-Command via MQTT
- **Dokumentation:** [Section 3.5: Cross-ESP Automation Rule](#35-aufgabe-cross-esp-automation-rule-implementieren)

#### ESP Service (`El Servador/god_kaiser_server/src/services/esp_service.py`)
- **ESPService:** ESP Registration, Discovery, Health Monitoring
- **ESP Repository:** Database Access (CRUD)
- **MQTT Integration:** Config Updates, Commands
- **Dokumentation:** `El Servador/god_kaiser_server/src/services/esp_service.py`

#### Database (`El Servador/god_kaiser_server/src/db/`)
- **Models:** SQLAlchemy Models (ESP, Sensor, Actuator, Zone, Logic, User)
- **Repositories:** Repository Pattern (CRUD Operations)
- **Session:** Database Engine, Session Factory
- **Migrations:** Alembic Migrations
- **Dokumentation:** [Section 3.4: Database Model](#34-aufgabe-database-model-hinzufügen), [Section 7.4: Database Migration](#74-database-migration)

---

## 13. KI-AGENTEN WORKFLOW

### Schritt-für-Schritt Anleitung für Code-Änderungen

**SCHRITT 1: Aufgabe identifizieren**
- Was soll geändert/implementiert werden?
- Welches Modul ist betroffen? (siehe Abschnitt 12: Modul-Dokumentation Navigation)
- Ist es ein Bug-Fix, Feature oder Refactoring?

**SCHRITT 2: Richtige Dokumentation konsultieren**
- Nutze die Tabelle in Abschnitt 12, um die passende Dokumentation zu finden
- **Immer zuerst lesen:** Relevante Dokumentation vollständig durcharbeiten
- Verstehe bestehende Patterns und Constraints
- **Server-spezifisch:** Prüfe MQTT-Protokoll-Kompatibilität (`El Trabajante/docs/Mqtt_Protocoll.md`)

**SCHRITT 3: Code-Location finden**
- Nutze Code-Location aus Abschnitt 12 oder durchsuche `El Servador/god_kaiser_server/src/`
- Verstehe Abhängigkeiten zwischen Modulen
- Prüfe bestehende Implementierungen ähnlicher Features

**SCHRITT 4: Änderungen implementieren**
- **Regeln befolgen:**
  - Test-Patterns: MockESP32Client für ESP32-Tests (siehe `El Servador/docs/ESP32_TESTING.md`)
  - MQTT-Contracts nicht brechen (siehe `El Trabajante/docs/Mqtt_Protocoll.md`)
  - Database-Migrations für Model-Änderungen (siehe Section 7.4)
  - Pydantic Schemas für API-Endpunkte (siehe Section 3.2)
  - Error-Handling mit Custom Exceptions (siehe Section 6.2)
- **Code-Stil:** Konsistent mit bestehendem Code (Python: PEP 8, Type Hints)
- **Kommentare:** Wichtig für komplexe Logik, Docstrings für Public APIs

**SCHRITT 5: Tests ausführen**
- Tests schreiben für neue Features (siehe `El Servador/docs/ESP32_TESTING.md`)
- Server-Tests ausführen: `cd "El Servador" && poetry run pytest god_kaiser_server/tests/esp32/ -v`
- Unit-Tests ausführen: `poetry run pytest god_kaiser_server/tests/unit/ -v`
- Integration-Tests ausführen: `poetry run pytest god_kaiser_server/tests/integration/ -v`
- **Nur committen wenn:** Alle Tests PASS (keine Failures)

**SCHRITT 6: Dokumentation aktualisieren**
- API-Referenz aktualisieren falls nötig (Section 3.2)
- MQTT-Protokoll aktualisieren falls Topics/Payloads geändert (`El Trabajante/docs/Mqtt_Protocoll.md`)
- Database-Schema dokumentieren falls Models geändert (Section 5)
- Test-Dokumentation aktualisieren falls Test-Patterns geändert (`El Servador/docs/ESP32_TESTING.md`)

### Regeln für Code-Änderungen

**NIEMALS:**
- ❌ MQTT-Topic-Schema ohne Dokumentation ändern
- ❌ Database-Models ohne Migration ändern
- ❌ Pydantic Schemas ohne Versionierung ändern
- ❌ Production-Config in Tests ändern (nur read-only!)
- ❌ MQTT-Payload-Struktur ohne ESP32-Kompatibilität ändern

**IMMER:**
- ✅ Server-orchestrierte Tests verwenden (MockESP32Client)
- ✅ Database-Migrations für Model-Änderungen erstellen
- ✅ MQTT-Protokoll-Kompatibilität prüfen (`El Trabajante/docs/Mqtt_Protocoll.md`)
- ✅ Pydantic Schemas für API-Validierung nutzen
- ✅ Error-Handling mit Custom Exceptions
- ✅ Logging für wichtige Operationen
- ✅ Dokumentation konsultieren BEVOR Code-Änderung

---

## 14. IMPLEMENTIERUNGS-STATUS

### ✅ Implementiert (Production-Ready)

| Modul | Status | Dateien | Tests |
|-------|--------|---------|-------|
| **MQTT Client** | ✅ | `src/mqtt/client.py`, `src/mqtt/subscriber.py`, `src/mqtt/publisher.py` | ✅ |
| **MQTT Handlers** | ✅ | `src/mqtt/handlers/sensor_handler.py`, `src/mqtt/handlers/actuator_handler.py`, `src/mqtt/handlers/heartbeat_handler.py` | ✅ |
| **Sensor Processing** | ✅ | `src/sensors/library_loader.py`, `src/sensors/sensor_libraries/active/` | ✅ |
| **Database Models** | ✅ | `src/db/models/` | ✅ |
| **Database Repositories** | ✅ | `src/db/repositories/` | ✅ |
| **ESP32 Testing** | ✅ | `tests/esp32/` (~140 Tests) | ✅ |
| **Core Config** | ✅ | `src/core/config.py` | ✅ |

### 🟡 Teilweise implementiert (In Progress)

| Modul | Status | Dateien | TODO |
|-------|--------|---------|------|
| **REST API** | 🟡 | `src/api/v1/` | Viele Endpoints sind Placeholder |
| **Logic Engine** | 🟡 | `src/services/logic_engine.py` | Rule Evaluation teilweise |
| **Actuator Service** | 🟡 | `src/services/actuator_service.py` | Command Validation teilweise |
| **WebSocket** | 🟡 | `src/websocket/manager.py` | Realtime Updates teilweise |

### ⏳ Geplant (Not Implemented)

| Modul | Status | Dateien | Priorität |
|-------|--------|---------|-----------|
| **AI Service** | ⏳ | `src/services/ai_service.py` | 🟢 Medium |
| **Kaiser Service** | ⏳ | `src/services/kaiser_service.py` | 🟡 High (für Skalierung) |
| **Scheduler Service** | ⏳ | `src/services/scheduler_service.py` | 🟢 Medium |

---

## 15. WEITERFÜHRENDE DOKUMENTATION

| Thema | Datei | Status |
|-------|-------|--------|
| **⭐ Server Architecture Dependencies** | `El Servador/docs/ARCHITECTURE_DEPENDENCIES.md` | ✅ Vollständig |
| **ESP32 Testing Guide** | `El Servador/docs/ESP32_TESTING.md` | ✅ Vollständig |
| **MQTT Test Protocol** | `El Servador/docs/MQTT_TEST_PROTOCOL.md` | ✅ Vollständig |
| **MQTT Protocol Spec** | `El Trabajante/docs/Mqtt_Protocoll.md` | ✅ Vollständig |
| **ESP32 Firmware Docs** | `El Trabajante/CLAUDE.md` | ✅ Vollständig |
| **ESP32 System Flows** | `El Trabajante/docs/system-flows/` | ✅ Vollständig |
| **Test Workflow** | `.claude/TEST_WORKFLOW.md` | ✅ Vollständig |
| **Workflow Patterns** | `.claude/WORKFLOW_PATTERNS.md` | ✅ Vollständig |
| REST API Referenz | `docs/API.md` | ⚠️ Zu erstellen |
| MQTT Topic Details | `docs/MQTT_TOPICS.md` | ⚠️ Zu erstellen |
| Security Guide | `docs/SECURITY.md` | ⚠️ Zu erstellen |
| Deployment Guide | `docs/DEPLOYMENT.md` | ⚠️ Zu erstellen |
| Development Setup | `docs/DEVELOPMENT.md` | ⚠️ Zu erstellen |
| Testing Guide | `docs/TESTING.md` | ⚠️ Zu erstellen (siehe aber `ESP32_TESTING.md`) |

---

## 16. VERWEISE AUF KRITISCHE CODE-DATEIEN

### Entry Points
- **FastAPI App:** `El Servador/god_kaiser_server/src/main.py`
- **MQTT Startup:** `El Servador/god_kaiser_server/src/main.py` (lifespan)
- **Database Init:** `El Servador/god_kaiser_server/src/db/session.py`

### Core Configuration
- **Settings:** `El Servador/god_kaiser_server/src/core/config.py`
- **Logging:** `El Servador/god_kaiser_server/src/core/logging_config.py`
- **Security:** `El Servador/god_kaiser_server/src/core/security.py`

### MQTT Layer
- **Client:** `El Servador/god_kaiser_server/src/mqtt/client.py`
- **Subscriber:** `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
- **Publisher:** `El Servador/god_kaiser_server/src/mqtt/publisher.py`
- **Sensor Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- **Actuator Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py`

### Business Logic
- **ESP Service:** `El Servador/god_kaiser_server/src/services/esp_service.py`
- **Sensor Service:** `El Servador/god_kaiser_server/src/services/sensor_service.py`
- **Actuator Service:** `El Servador/god_kaiser_server/src/services/actuator_service.py`
- **Logic Engine:** `El Servador/god_kaiser_server/src/services/logic_engine.py`

### Sensor Processing
- **Library Loader:** `El Servador/god_kaiser_server/src/sensors/library_loader.py`
- **Base Processor:** `El Servador/god_kaiser_server/src/sensors/base_processor.py`
- **pH Sensor:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ph_sensor.py` (Referenz-Implementation)

### Database
- **Session:** `El Servador/god_kaiser_server/src/db/session.py`
- **Models:** `El Servador/god_kaiser_server/src/db/models/`
- **Repositories:** `El Servador/god_kaiser_server/src/db/repositories/`

### Testing
- **MockESP32Client:** `El Servador/god_kaiser_server/tests/esp32/mocks/mock_esp32_client.py`
- **Test Fixtures:** `El Servador/god_kaiser_server/tests/conftest.py`
- **Test Documentation:** `El Servador/docs/ESP32_TESTING.md`

---

**Ende der CLAUDE_SERVER.md**