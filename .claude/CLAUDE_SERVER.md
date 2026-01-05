# CLAUDE_SERVER.md - God-Kaiser Server Referenz für KI-Agenten

**Version:** 3.2
**Letzte Aktualisierung:** 2026-01-05
**Zweck:** Zentrale Referenz für Claude, um bei jeder Server-Aufgabe die richtigen Dateien, Patterns und Konventionen zu finden.

> **📖 ESP32-Firmware Dokumentation:** Siehe `.claude/CLAUDE.md` für ESP32-spezifische Details
> **🔄 Cross-Referenzen:** Beide Dokumentationen verweisen jetzt aufeinander für vollständigen Kontext
> **🛠️ Service-Management:** Siehe `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0 für Start/Stop/Logs

> **Letzte Änderungen (2025-12-08 - v3.0):**
> - **Vollständige Code-Analyse:** Alle kritischen Dateien analysiert und dokumentiert
> - **MQTT-Architektur:** Subscriber mit Thread-Pool, Handler-Registrierung in main.py dokumentiert
> - **Topic-Struktur:** Vollständige Topic-Referenz aus `constants.py` und `topics.py`
> - **Publisher-Methoden:** Alle Publisher-Methoden mit QoS-Levels dokumentiert
> - **Safety-Service:** Integration in ActuatorService dokumentiert
> - **Logic-Engine:** Background-Task-Architektur und Evaluation-Flow dokumentiert
> - **Heartbeat-Handler:** Unbekannte Geräte werden abgelehnt (kein Auto-Discovery)
> - **Sensor-Validierung:** `raw_mode` ist Required Field
> - **Verzeichnisstruktur:** Mit tatsächlichem Code vollständig abgeglichen
>
> **Frühere Änderungen (2025-12-18 - Industrial Production Implementation):**
> - **Audit-Log System:** Vollständiges Retention-System mit Frontend-Steuerung
>   - Neue Performance-Indizes auf `created_at` für Time-Range Queries
>   - `AuditRetentionService` mit konfigurierbaren Retention-Policies
>   - REST API `/api/v1/audit/` mit Filter, Statistics, Manual Cleanup
>   - Frontend-Dashboard in `AuditLogView.vue` mit Retention-Konfiguration
> - **Konfigurierbares Field-Mapping:** `ConfigMappingEngine` für ESP32-Payload-Mapping
>   - Runtime-konfigurierbare Field-Mappings via SystemConfig
>   - JSON-Schema-Validation für Mapping-Definitions
>   - Ersetzt hardcodiertes Mapping in `ConfigPayloadBuilder`
> - **Synchronisiertes Error-Code-System:** Vollständige ESP32-Server-Synchronisation
>   - Unified Error Codes (1000-5999) mit einheitlichen Beschreibungen
>   - ESP32 Hardware/Service/Communication/Application Error Ranges
>   - Server Config/MQTT/Validation/Database/Service/Audit Error Ranges
> - **ESP Online-Check:** Konfigurierbares Verhalten in `ESPService.send_config()`
>   - `offline_behavior`: "warn" (default), "skip", "fail"
>   - Industrietaugliche Offline-Handling für große und kleine Systeme
> - **Base MQTT Handler:** Abstrakte `BaseMQTTHandler`-Klasse
>   - Standardisierte Topic-Parsing, Payload-Validation, ESP-Lookup
>   - Reduzierte Code-Duplizierung in allen Handler-Klassen
>   - Konsistente Error-Handling und Audit-Logging
> - **Alembic Migration:** `add_audit_log_indexes.py` für Performance-Optimierung
> - **Frontend Audit-Dashboard:** Vollständige Audit-Log-Verwaltung
>   - Filterbare Log-Tabelle mit Pagination
>   - Statistics-Cards (Gesamt, Fehler, Speicher, Pending Cleanup)
>   - Retention-Policy-Konfiguration mit Dry-Run-Vorschau
>
> **Frühere Änderungen (2025-12-03):**
> - Alembic-Migration-System funktionsfähig gemacht
> - Bug-Fixes in `actuator_handler.py` und `sensor_handler.py`
> - 34 Integration-Tests für ESP32-Server-Kommunikation hinzugefügt

---

## 0. QUICK DECISION TREE - Welche Doku lesen?

### 🔧 "Ich will Code ändern"
1. **ESP32-Firmware?** → `.claude/CLAUDE.md` → [Section 8: Workflow](.claude/CLAUDE.md#8-ki-agenten-workflow)
2. **Server-Code?** → [Section 13: KI-Agenten Workflow](#13-ki-agenten-workflow)
3. **Welches Modul?** → [Section 12: Modul-Dokumentation Navigation](#12-modul-dokumentation-navigation)
4. **Tests schreiben** → `El Servador/docs/ESP32_TESTING.md` (Server-orchestrierte Tests)
5. **Pattern-Beispiele** → `.claude/WORKFLOW_PATTERNS.md`

### 🐛 "Ich habe einen Fehler"
1. **ESP32 Build-Fehler?** → `.claude/CLAUDE.md` → [Section 1: Build & Commands](.claude/CLAUDE.md#1-build--commands)
2. **Server Build-Fehler?** → [Section 7: Entwickler-Workflows](#7-entwickler-workflows) + `pyproject.toml` prüfen
3. **Test-Fehler?** → `El Servador/docs/ESP32_TESTING.md` Section Troubleshooting
4. **Runtime-Fehler?** → [Section 10: Häufige Fehler](#10-häufige-fehler-und-lösungen)
5. **MQTT-Problem?** → `.claude/CLAUDE.md` → [Section 4: MQTT-Protokoll](.claude/CLAUDE.md#4-mqtt-protokoll-verifiziert) + [Section 4: MQTT Topic-Referenz](#4-mqtt-topic-referenz-server-perspektive)
6. **Database-Fehler?** → [Section 7.4: Database Migration](#74-database-migration)

### 📖 "Ich will verstehen wie X funktioniert"
1. **ESP32 System-Flow?** → `.claude/CLAUDE.md` → [Section 0: Quick Reference](.claude/CLAUDE.md#0-quick-reference---was-suche-ich) → System-Flow
2. **MQTT-Protokoll?** → `.claude/CLAUDE.md` → [Section 4: MQTT-Protokoll](.claude/CLAUDE.md#4-mqtt-protokoll-verifiziert) + [Section 4: MQTT Topic-Referenz](#4-mqtt-topic-referenz-server-perspektive)
3. **API-Endpunkte?** → [Section 3.2: REST API Endpoint hinzufügen](#32-aufgabe-rest-api-endpoint-hinzufügen) + `src/api/v1/`
4. **Test-Infrastruktur?** → `El Servador/docs/ESP32_TESTING.md` (Server-orchestrierte Tests)
5. **Sensor-Processing?** → [Section 3.1: Neuen Sensor-Typ hinzufügen](#31-aufgabe-neuen-sensor-typ-hinzufügen)
6. **ESP32 Error-Codes?** → `.claude/CLAUDE.md` → [Section 5: Error-Codes](.claude/CLAUDE.md#5-error-codes-verifiziert)

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

## 2. SERVER-STARTUP-SEQUENZ (KRITISCH)

**Startup-Flow in `src/main.py` (lifespan startup):**

1. **Database Initialization** (`init_db()`)
   - Erstellt Tabellen wenn `settings.database.auto_init == True`
   - Engine wird erstellt auch wenn auto_init=False

2. **MQTT Client Connection** (`MQTTClient.get_instance().connect()`)
   - Singleton-Pattern
   - Auto-Reconnect mit Exponential Backoff
   - TLS/SSL Support wenn konfiguriert

3. **MQTT Handler Registration** (`Subscriber.register_handler()`)
   - Handler werden für Topic-Patterns registriert
   - `kaiser_id` wird dynamisch aus Config geladen
   - Alle Handler in `main.py:99-129` registriert

4. **MQTT Topic Subscription** (`Subscriber.subscribe_all()`)
   - QoS wird automatisch basierend auf Topic-Typ gesetzt
   - Heartbeat: QoS 0, Config: QoS 2, Rest: QoS 1

5. **WebSocket Manager Initialization** (`WebSocketManager.get_instance()`)
   - Singleton-Pattern
   - Connection-Management für Realtime-Updates

6. **Service Initialization** (in DB Session)
   - `SafetyService` → `ActuatorService` → `LogicEngine`
   - `LogicEngine.start()` startet Background-Task
   - Global instance wird gesetzt via `set_logic_engine()`

**Shutdown-Flow:**
1. Logic Engine stoppen (`LogicEngine.stop()`)
2. WebSocket Manager shutdown
3. MQTT Subscriber Thread-Pool shutdown (wait=True, timeout=30s)
4. MQTT Client disconnect
5. Database Engine dispose

**Code-Location:** `src/main.py:55-230`

---

## 2. VERZEICHNISSTRUKTUR
```
El Servador/
├── god_kaiser_server/
│   ├── src/                          # 🎯 HAUPTCODE
│   │   ├── main.py                   # FastAPI App Entry Point
│   │   ├── core/                     # Zentrale Konfiguration
│   │   │   ├── config.py             # ⭐ Settings (Pydantic BaseSettings)
│   │   │   ├── config_mapping.py     # ⭐ Field-Mapping System für ESP32-Payloads
│   │   │   ├── error_codes.py        # ⭐ Unified Error Codes (Server + ESP32)
│   │   │   ├── security.py           # JWT, Password Hashing
│   │   │   │   ├── logging_config.py # Structured Logging
│   │   │   └── exceptions.py         # Custom Exceptions
│   │   │
│   │   ├── api/                      # REST API Layer
│   │   │   ├── deps.py               # ⭐ Dependency Injection (DB, Auth)
│   │   │   ├── dependencies.py       # Alternative Dependency Injection
│   │   │   ├── schemas.py            # Shared Schemas
│   │   │   ├── sensor_processing.py  # Real-Time Sensor Processing API
│   │   │   └── v1/                   # API Version 1
│   │   │       ├── __init__.py       # Router-Aggregation
│   │   │       ├── audit.py          # ⭐ Audit Log Management & Retention
│   │   │       ├── auth.py           # Login, Register, Token Refresh
│   │   │       ├── esp.py            # ESP CRUD, Status
│   │   │       ├── sensors.py        # Sensor Config, Data Query
│   │   │       ├── actuators.py      # Actuator Control, Status
│   │   │       ├── logic.py          # Automation Rules CRUD
│   │   │       ├── health.py         # Health Checks, Metrics
│   │   │       ├── kaiser.py         # Kaiser Node Management
│   │   │       ├── library.py        # Sensor Library Management
│   │   │       ├── ai.py             # AI Service Integration
│   │   │       └── websocket/        # WebSocket Endpoints
│   │   │           └── realtime.py   # Realtime Updates
│   │   │
│   │   ├── services/                 # 🧠 BUSINESS LOGIC
│   │   │   ├── audit_retention_service.py # ⭐ Audit Log Retention & Cleanup
│   │   │   ├── esp_service.py        # ⭐ ESP Registration, Discovery, Config Publishing
│   │   │   ├── sensor_service.py     # ⭐ Sensor Config, Data Processing
│   │   │   ├── actuator_service.py   # ⭐ Command Validation, Execution
│   │   │   ├── logic_engine.py       # ⭐ Cross-ESP Automation Engine
│   │   │   ├── logic_service.py      # Automation Rule CRUD Service
│   │   │   ├── library_service.py    # Sensor Library Management
│   │   │   ├── safety_service.py     # Safety Controller, Emergency Stop
│   │   │   ├── health_service.py     # Health Checks, Metrics
│   │   │   ├── kaiser_service.py     # Kaiser Node Management
│   │   │   ├── ai_service.py         # God Layer Integration (Future)
│   │   │   └── god_client.py         # HTTP Client für God-Layer
│   │   │
│   │   ├── mqtt/                     # 📡 MQTT LAYER
│   │   │   ├── client.py             # ⭐ Paho-MQTT Singleton Wrapper
│   │   │   ├── subscriber.py         # Topic Subscriptions
│   │   │   ├── publisher.py          # Message Publishing
│   │   │   └── handlers/             # ⭐ MESSAGE HANDLERS
│   │   │       ├── base_handler.py   # ⭐ Abstract Base Handler (reduziert Code-Duplizierung)
│   │   │       ├── sensor_handler.py # Sensor Data Processing
│   │   │       ├── actuator_handler.py # Actuator Status Updates
│   │   │       ├── actuator_response_handler.py # Actuator Command Responses
│   │   │       ├── actuator_alert_handler.py # Actuator Alerts
│   │   │       ├── heartbeat_handler.py # ESP Heartbeats, Registration
│   │   │       ├── config_handler.py # Config Responses
│   │   │       ├── discovery_handler.py # ESP Discovery (falls vorhanden)
│   │   │       └── kaiser_handler.py # Kaiser Node Messages
│   │   │
│   │   ├── websocket/                # 🔴 REALTIME
│   │   │   ├── manager.py            # Connection Management
│   │   │   └── events.py             # Event Types
│   │   │
│   │   ├── db/                       # 💾 DATABASE LAYER
│   │   │   ├── session.py            # ⭐ Engine, Session Factory
│   │   │   ├── models/               # SQLAlchemy Models
│   │   │   │   ├── __init__.py       # Model Exports
│   │   │   │   ├── esp.py            # ESP Device Model
│   │   │   │   ├── sensor.py         # SensorConfig, SensorData
│   │   │   │   ├── actuator.py       # ActuatorConfig, ActuatorState
│   │   │   │   ├── logic.py          # AutomationRule Model
│   │   │   │   ├── logic_validation.py # Logic Validation Helpers
│   │   │   │   ├── user.py           # User, Role, Permission
│   │   │   │   ├── kaiser.py         # Kaiser Node Model
│   │   │   │   ├── library.py        # SensorLibrary Model
│   │   │   │   ├── system.py         # SystemConfig, SystemLog
│   │   │   │   └── ai.py             # AI Service Models
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
│   │   │           ├── temperature.py
│   │   │           ├── humidity.py
│   │   │           ├── moisture.py
│   │   │           ├── pressure.py
│   │   │           ├── light.py
│   │   │           ├── flow.py
│   │   │           ├── co2.py
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
│   │   ├── integration/              # ⭐ Integration Tests (34 Tests)
│   │   │   ├── test_server_esp32_integration.py  # ESP32-Handler Tests
│   │   │   ├── BUGS_FOUND.md         # Dokumentierte Bug-Fixes
│   │   │   └── ...
│   │   ├── esp32/                    # ESP32-spezifische Tests (~140 Tests)
│   │   │   ├── mocks/mock_esp32_client.py
│   │   │   └── ...
│   │   └── e2e/                      # End-to-End Tests
│   │       └── test_sensor_to_frontend.py
│   │
│   ├── alembic/                      # 🔄 DATABASE MIGRATIONS
│   │   ├── env.py                    # ⭐ Alembic Environment (gefixt 2025-12-03)
│   │   ├── script.py.mako            # ⭐ Migration Template (gefixt 2025-12-03)
│   │   └── versions/                 # Migration Files
│   │       └── c6fb9c8567b5_*.py     # ActuatorState Erweiterung
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
1. `src/mqtt/client.py` - MQTT Client Setup (Singleton)
2. `src/mqtt/subscriber.py` - Topic Subscriptions, Thread-Pool
3. `src/mqtt/handlers/sensor_handler.py` - Beispiel Handler (async)
4. `src/mqtt/topics.py` - Topic-Parsing für neues Topic
5. `src/core/constants.py` - Topic-Templates definieren
6. `El Trabajante/docs/Mqtt_Protocoll.md` - ⚠️ ESP32 Topic-Spezifikation!

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
    """
    Verarbeitet Diagnostics-Nachrichten von ESPs.
    
    Payload-Struktur (von ESP32):
    {
        "esp_id": "ESP_12AB34CD",
        "timestamp": 1234567890,
        "heap_free": 123456,
        "uptime": 3600,
        "wifi_rssi": -65,
        "mqtt_reconnects": 2,
        "sensor_errors": 0,
        "actuator_errors": 0
    }
    
    Returns:
        True if processed successfully, False otherwise
    """
    try:
        # Parse topic
        parsed = TopicBuilder.parse_diagnostics_topic(topic)  # Muss in topics.py hinzugefügt werden
        if not parsed:
            logger.error(f"Failed to parse diagnostics topic: {topic}")
            return False
        
        esp_id = parsed["esp_id"]
        
        # Validate payload
        if "esp_id" not in payload or "heap_free" not in payload:
            logger.error(f"Invalid diagnostics payload: {payload}")
            return False
        
        # Process diagnostics
        async for session in get_session():
            esp_repo = ESPRepository(session)
            esp_device = await esp_repo.get_by_device_id(esp_id)
            if not esp_device:
                logger.warning(f"ESP device not found: {esp_id}")
                return False
            
            # Update diagnostics in metadata
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

**Handler registrieren in `src/main.py` (lifespan startup):**
```python
# In lifespan() startup (nach MQTT-Client-Connection):
from .mqtt.handlers import diagnostics_handler

# Get KAISER_ID from config
kaiser_id = settings.hierarchy.kaiser_id

# Register handler
_subscriber_instance.register_handler(
    f"kaiser/{kaiser_id}/esp/+/system/diagnostics",
    diagnostics_handler.handle_diagnostics
)

# Subscribe to all topics (wird automatisch aufgerufen)
_subscriber_instance.subscribe_all()
```

**Wichtig:**
- Handler werden in `src/main.py` während des FastAPI lifespan-Events registriert (nicht in `subscriber.py`)
- Handler können sync oder async sein (Subscriber erkennt automatisch)
- Handler-Fehler crashen nicht den Subscriber (Error-Isolation)
- QoS wird automatisch basierend auf Topic-Typ gesetzt (Diagnostics: QoS 1)

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
1. `src/services/logic_engine.py` - ⭐ Kernlogik (Background-Task)
2. `src/db/models/logic.py` - Rule/Condition Models
3. `src/db/models/logic_validation.py` - Condition/Action Validation
4. `src/schemas/logic.py` - Rule Schemas
5. `src/api/v1/logic.py` - Rule CRUD Endpoints
6. `src/services/actuator_service.py` - Command Execution

**Datenfluss:**
```
1. Sensor-Daten kommen via MQTT → sensor_handler.handle_sensor_data()
2. Sensor-Daten werden in DB gespeichert
3. sensor_handler ruft logic_engine.evaluate_sensor_data() auf (non-blocking via asyncio.create_task)
4. LogicEngine lädt passende Rules aus DB (get_rules_by_trigger_sensor)
5. Für jede Rule: Conditions werden evaluiert (_check_conditions)
6. Bei Match: Actions werden ausgeführt (_execute_actions)
7. Actuator-Command wird via ActuatorService.send_command() gesendet
8. Safety-Checks erfolgen VOR Command-Publishing (SafetyService.validate_actuator_command)
9. Command wird via MQTT Publisher gesendet (QoS 2)
10. Execution wird in DB geloggt (log_execution)
```

**Logic Engine Architektur:**
- **Background-Task:** Läuft kontinuierlich im Hintergrund (`_evaluation_loop()`)
- **Trigger-basiert:** Wird von `sensor_handler` getriggert wenn Sensor-Daten ankommen
- **Non-blocking:** `evaluate_sensor_data()` sollte via `asyncio.create_task()` aufgerufen werden
- **Cooldown:** Rules haben `cooldown_seconds` um zu häufige Ausführungen zu verhindern
- **Error-Handling:** Rule-Fehler crashen nicht die Engine (isoliert)

**Code-Location:**
- Logic Engine: `src/services/logic_engine.py`
- Sensor Handler Integration: `src/mqtt/handlers/sensor_handler.py:280-290`
- Actuator Service: `src/services/actuator_service.py:44-193`

**Rule-Struktur (Database):**
```python
# Beispiel-Rule in DB
{
    "id": 1,
    "name": "Auto-Irrigation",
    "enabled": true,
    "priority": 1,
    "trigger_conditions": {
        "type": "sensor",  # Akzeptiert: "sensor" oder "sensor_threshold"
        "esp_id": "ESP_SENSOR_01",
        "gpio": 4,
        "sensor_type": "temperature",  # Optional bei "sensor" shorthand
        "operator": ">",
        "value": 30.0
    },
    "actions": [
        {
            "type": "actuator",  # Akzeptiert: "actuator" oder "actuator_command"
            "esp_id": "ESP_ACTUATOR_01",
            "gpio": 5,
            "command": "ON",  # Optional bei "actuator" shorthand
            "value": 1.0
        }
    ],
    "cooldown_seconds": 300,
    "time_start": "06:00",
    "time_end": "22:00"
}
```

**Condition Types (akzeptiert):**
- `sensor_threshold` - Standard (erfordert `sensor_type`)
- `sensor` - Shorthand (optionaler `sensor_type`) - wird zu `sensor_threshold` gemappt
- `time_window` - Zeit-basierte Bedingung

**Action Types (akzeptiert):**
- `actuator_command` - Standard (erfordert `command`)
- `actuator` - Shorthand (optionaler `command`) - wird zu `actuator_command` gemappt

**Validation:** `src/db/models/logic_validation.py` → `validate_condition_type()`, `validate_action_type()`

**Safety-Integration:**
- Jeder Actuator-Command wird VOR Publishing durch `SafetyService.validate_actuator_command()` geprüft
- Emergency-Stop wird automatisch geprüft
- Value-Validierung (PWM: 0.0-1.0, Binary: 0.0 oder 1.0)
- Runtime-Protection wird getrackt

---

## 4. MQTT TOPIC-REFERENZ (Server-Perspektive)

### 4.1 Topics die der Server SUBSCRIBED

**Handler-Registrierung erfolgt in `src/main.py` während des FastAPI lifespan-Events (startup).**

| Topic Pattern | Handler | QoS | Beschreibung | Code-Location |
|--------------|---------|-----|--------------|---------------|
| `kaiser/{kaiser_id}/esp/+/sensor/+/data` | `sensor_handler.handle_sensor_data` | 1 | Sensor-Rohdaten | `main.py:101` |
| `kaiser/{kaiser_id}/esp/+/actuator/+/status` | `actuator_handler.handle_actuator_status` | 1 | Actuator-Status | `main.py:105` |
| `kaiser/{kaiser_id}/esp/+/actuator/+/response` | `actuator_response_handler.handle_actuator_response` | 1 | Command-Responses | `main.py:109` |
| `kaiser/{kaiser_id}/esp/+/actuator/+/alert` | `actuator_alert_handler.handle_actuator_alert` | 1 | Actuator-Alerts | `main.py:114` |
| `kaiser/{kaiser_id}/esp/+/system/heartbeat` | `heartbeat_handler.handle_heartbeat` | 0 | ESP Heartbeats | `main.py:119` |
| `kaiser/{kaiser_id}/discovery/esp32_nodes` | `discovery_handler.handle_discovery` | 1 | ESP Discovery (deprecated) | `main.py:123` |
| `kaiser/{kaiser_id}/esp/+/config_response` | `config_handler.handle_config_ack` | 2 | Config-Bestätigungen | `main.py:127` |

**Wichtig:**
- `{kaiser_id}` wird dynamisch aus `settings.hierarchy.kaiser_id` geladen (Standard: `"god"`)
- QoS-Level werden automatisch von `Subscriber.subscribe_all()` basierend auf Topic-Typ gesetzt
- Handler werden in einem Thread-Pool ausgeführt (max_workers=10) für nicht-blockierende Verarbeitung

### 4.2 Topics auf die der Server PUBLISHED

**Publisher-Methoden in `src/mqtt/publisher.py`:**

| Topic Pattern | Publisher-Methode | QoS | Beschreibung | Code-Location |
|--------------|-------------------|-----|--------------|--------------|
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | `publish_actuator_command()` | 2 | Actuator-Commands | `publisher.py:38` |
| `kaiser/{kaiser_id}/esp/{esp_id}/config/sensor/{gpio}` | `publish_sensor_config()` | 2 | Sensor-Config | `publisher.py:74` |
| `kaiser/{kaiser_id}/esp/{esp_id}/config/actuator/{gpio}` | `publish_actuator_config()` | 2 | Actuator-Config | `publisher.py:104` |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | `publish_system_command()` | 2 | System-Commands | `publisher.py:134` |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed` | `publish_pi_enhanced_response()` | 1 | Pi-Enhanced Response | `publisher.py:165` |
| `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | `publish_zone_assignment()` | 1 | Zone Assignment (Phase 7) | **ZU IMPLEMENTIEREN** |

**Topic-Building:**
- Topics werden via `TopicBuilder` aus `src/mqtt/topics.py` erstellt
- `{kaiser_id}` wird automatisch aus Config ersetzt via `constants.get_topic_with_kaiser_id()`
- Alle Topics sind in `src/core/constants.py` als Templates definiert

### 4.3 MQTT Payload-Schemas

**Sensor Data (ESP → Server):**
```json
{
    "esp_id": "ESP_12AB34CD",
    "zone_id": "greenhouse",
    "subzone_id": "zone_a",
    "gpio": 34,
    "sensor_type": "ph",
    "raw": 2150,
    "value": 0.0,
    "unit": "",
    "quality": "good",
    "ts": 1735818000,
    "raw_mode": true
}
```
**Required Fields:** `esp_id`, `gpio`, `sensor_type`, `raw` (oder `raw_value`), `ts` (oder `timestamp`), `raw_mode`  
**Validierung:** `src/mqtt/handlers/sensor_handler.py` → `_validate_payload()`  
**Processing:** Pi-Enhanced Processing wird automatisch getriggert wenn `sensor_config.pi_enhanced == True` und `raw_mode == True`

**Heartbeat (ESP → Server):**
```json
{
    "esp_id": "ESP_12AB34CD",
    "zone_id": "greenhouse",
    "master_zone_id": "greenhouse-master",
    "zone_assigned": true,
    "ts": 1735818000,
    "uptime": 3600,
    "heap_free": 245760,
    "wifi_rssi": -65,
    "sensor_count": 3,
    "actuator_count": 2
}
```
**Required Fields:** `ts`, `uptime`, `heap_free` (oder `free_heap`), `wifi_rssi`  
**Validierung:** `src/mqtt/handlers/heartbeat_handler.py` → `_validate_payload()`  
**KRITISCH:** Unbekannte Geräte werden abgelehnt (kein Auto-Discovery). ESPs müssen zuerst via API (`POST /api/v1/esp/register`) registriert werden.  
**Code:** `heartbeat_handler.py:98-109` - Rejection-Logik

**Zone Assignment (Server → ESP):**
```json
{
    "zone_id": "greenhouse_zone_1",
    "master_zone_id": "greenhouse_master",
    "zone_name": "Greenhouse Zone 1",
    "kaiser_id": "god",
    "timestamp": 1234567890
}
```
**Kaiser-ID Bedeutung:**
- `kaiser_id` identifiziert den **übergeordneten Pi** (God-Kaiser Server oder Kaiser-Node), **NICHT** den ESP
- **Aktuell:** Immer `"god"` (God-Kaiser Server)
- **Zukunft:** `"kaiser_01"`, `"kaiser_02"`, etc. für Kaiser-Nodes (geplant, noch nicht implementiert)
**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`  
**QoS:** 1 (at least once)  
**Publisher:** **ZU IMPLEMENTIEREN** - Sollte via `zone_service.py` oder REST API Endpoint gesendet werden  
**ESP Response:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack` mit `status: "zone_assigned"` oder `status: "error"`  
**Siehe:** `El Trabajante/docs/system-flows/08-zone-assignment-flow.md` für detaillierten Flow

**Actuator Command (Server → ESP):**
```json
{
    "command": "ON",
    "value": 1.0,
    "duration": 0,
    "timestamp": 1234567890
}
```
**Publisher:** `src/mqtt/publisher.py` → `publish_actuator_command()`  
**Safety-Check:** Wird VOR Publishing in `ActuatorService.send_command()` via `SafetyService.validate_actuator_command()` geprüft  
**Value-Range:** PWM: 0.0-1.0 (wird intern auf 0-255 gemappt), Binary: 0.0 oder 1.0

**⚠️ KRITISCH:** Für vollständige Payload-Spezifikationen siehe:
- `.claude/CLAUDE.md` → [Section 4: MQTT-Protokoll](.claude/CLAUDE.md#4-mqtt-protokoll-verifiziert)
- `El Trabajante/docs/Mqtt_Protocoll.md` (vollständige Spezifikation)
- `El Trabajante/src/services/sensor/sensor_manager.cpp` (buildMQTTPayload)
- `El Trabajante/src/services/communication/mqtt_client.cpp` (publishHeartbeat)

### 4.4 MQTT-Architektur-Details

**Subscriber-Architektur (`src/mqtt/subscriber.py`):**
- **Thread-Pool:** Handler werden in einem `ThreadPoolExecutor` (max_workers=10) ausgeführt
- **Async-Handler:** Unterstützt sowohl sync als auch async Handler (async werden in neuem Event-Loop ausgeführt)
- **Error-Isolation:** Handler-Fehler crashen nicht den Subscriber
- **Performance-Metriken:** `messages_processed`, `messages_failed`, `success_rate`

**MQTT-Client (`src/mqtt/client.py`):**
- **Singleton-Pattern:** `MQTTClient.get_instance()`
- **Auto-Reconnect:** Exponential Backoff (min=1s, max=60s)
- **TLS/SSL:** Unterstützt via `use_tls`, `ca_cert_path`, `client_cert_path`, `client_key_path`
- **Connection-State:** `is_connected()` für Status-Checks

**Topic-Builder (`src/mqtt/topics.py`):**
- **Build-Methoden:** `build_actuator_command_topic()`, `build_sensor_config_topic()`, etc.
- **Parse-Methoden:** `parse_sensor_data_topic()`, `parse_heartbeat_topic()`, etc.
- **Wildcard-Matching:** `matches_subscription()` für Topic-Pattern-Matching
- **Validation:** `validate_esp_id()`, `validate_gpio()` für Input-Validierung

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

**WICHTIG:** Alembic ist jetzt vollständig funktionsfähig (Stand: 2025-12-03).

```bash
cd "El Servador/god_kaiser_server"

# Neue Migration erstellen (nach Model-Änderung)
python -m alembic revision --autogenerate -m "Beschreibung"

# Migrationen anwenden
python -m alembic upgrade head

# Aktuellen Status prüfen
python -m alembic current

# Migration rückgängig
python -m alembic downgrade -1

# Migrations-History anzeigen
python -m alembic history
```

**Vorhandene Migrationen:**
| Revision | Beschreibung | Datum |
|----------|--------------|-------|
| `c6fb9c8567b5` | Add last_command and error_message to ActuatorState | 2025-12-03 |

**Bei Problemen:**
- `alembic/env.py` verwendet relative Imports (`from src.db.base import Base`)
- `alembic/script.py.mako` ist das Template für neue Migrationen
- SQLite-Datenbank: `god_kaiser_dev.db` im Server-Root

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

1. **ESP32 Hauptdokumentation:** `.claude/CLAUDE.md` (ESP32 Firmware-Referenz)
2. **MQTT Protocol:** `.claude/CLAUDE.md` → [Section 4: MQTT-Protokoll](.claude/CLAUDE.md#4-mqtt-protokoll-verifiziert) + `El Trabajante/docs/Mqtt_Protocoll.md`
3. **System Flows:** `.claude/CLAUDE.md` → [Section 0: Quick Reference](.claude/CLAUDE.md#0-quick-reference---was-suche-ich) → System-Flow → `El Trabajante/docs/system-flows/`
4. **Error Codes:** `.claude/CLAUDE.md` → [Section 5: Error-Codes](.claude/CLAUDE.md#5-error-codes-verifiziert) → `El Trabajante/src/models/error_codes.h`
5. **Sensor Types:** `.claude/CLAUDE.md` → [Section 3: Verzeichnisstruktur](.claude/CLAUDE.md#3-el-trabajante---verzeichnisstruktur) → `El Trabajante/src/models/sensor_types.h`
6. **Actuator Types:** `.claude/CLAUDE.md` → [Section 3: Verzeichnisstruktur](.claude/CLAUDE.md#3-el-trabajante---verzeichnisstruktur) → `El Trabajante/src/models/actuator_types.h`

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

## 10.4 Bekannte Bug-Fixes (Referenz)

### Fixes vom 2025-12-08:

| Bug | Datei | Problem | Fix |
|-----|-------|---------|-----|
| **#3** | `tests/conftest.py` | Fixture hieß `test_session` aber Tests verwendeten `db_session` | Fixture zu `db_session` umbenannt + Alias `test_session` |
| **#4** | `src/db/models/logic_validation.py` | `sensor` und `actuator` als condition/action types nicht akzeptiert | Als Aliase für `sensor_threshold`/`actuator_command` hinzugefügt |
| **#5** | `src/mqtt/handlers/heartbeat_handler.py` | Auto-Discovery registrierte unbekannte Geräte | Deaktiviert - unbekannte Geräte werden jetzt abgelehnt |
| **#6** | `src/mqtt/handlers/sensor_handler.py` | `raw_mode` war optional | Als Required Field hinzugefügt |
| **#7** | `tests/integration/test_server_esp32_integration.py` | Tests verwendeten `free_heap` statt ESP32-Standard `heap_free` | Auf ESP32-Format aktualisiert |

### Fixes vom 2025-12-03:

| Bug | Datei | Problem | Fix |
|-----|-------|---------|-----|
| **#1** | `src/mqtt/handlers/actuator_handler.py` | Handler übergibt `last_command` aber `ActuatorState` hatte das Feld nicht | `last_command` und `error_message` zu `ActuatorState` Model hinzugefügt |
| **#2** | `src/mqtt/handlers/sensor_handler.py` | Nutzte `sensor_config.metadata` statt `sensor_config.sensor_metadata` | Feldname korrigiert |

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
| **Zone Assignment** | `El Trabajante/docs/system-flows/08-zone-assignment-flow.md` | **ZU IMPLEMENTIEREN** | **ZU IMPLEMENTIEREN** | MQTT Zone Assignment Publisher, REST API Endpoint |

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
| **Database Migrations** | ✅ | `alembic/versions/`, `alembic/env.py` | ✅ |
| **ESP32 Testing** | ✅ | `tests/esp32/` (~140 Tests) | ✅ |
| **Integration Tests** | ✅ | `tests/integration/test_server_esp32_integration.py` (34 Tests) | ✅ |
| **Core Config** | ✅ | `src/core/config.py`, `src/core/config_mapping.py`, `src/core/error_codes.py` | ✅ |
| **Audit System** | ✅ | `src/services/audit_retention_service.py`, `src/api/v1/audit.py`, `src/db/models/audit_log.py` | ✅ |

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
- **MQTT Startup:** `El Servador/god_kaiser_server/src/main.py` (lifespan:55-230)
- **Database Init:** `El Servador/god_kaiser_server/src/db/session.py`

### Core Configuration
- **Settings:** `El Servador/god_kaiser_server/src/core/config.py` (Pydantic BaseSettings)
- **Config Mapping:** `El Servador/god_kaiser_server/src/core/config_mapping.py` (Field Mapping Engine für ESP32 Payloads)
- **Error Codes:** `El Servador/god_kaiser_server/src/core/error_codes.py` (Unified Error Codes Server + ESP32)
- **Constants:** `El Servador/god_kaiser_server/src/core/constants.py` (MQTT Topics, Sensor Types, GPIO Ranges)
- **Logging:** `El Servador/god_kaiser_server/src/core/logging_config.py`
- **Security:** `El Servador/god_kaiser_server/src/core/security.py` (JWT, Password Hashing)

### MQTT Layer
- **Client:** `El Servador/god_kaiser_server/src/mqtt/client.py` (Singleton, Paho-MQTT Wrapper)
- **Subscriber:** `El Servador/god_kaiser_server/src/mqtt/subscriber.py` (Thread-Pool, Handler-Routing)
- **Publisher:** `El Servador/god_kaiser_server/src/mqtt/publisher.py` (High-Level Publishing, Retry-Logic)
- **Topics:** `El Servador/god_kaiser_server/src/mqtt/topics.py` (Topic-Builder, Parser, Validation)
- **Sensor Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Pi-Enhanced Processing)
- **Actuator Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py` (Status Updates)
- **Heartbeat Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (Device Registration)

### Business Logic
- **Audit Retention:** `El Servador/god_kaiser_server/src/services/audit_retention_service.py` (Log Cleanup, Retention Policies)
- **ESP Service:** `El Servador/god_kaiser_server/src/services/esp_service.py` (Registration, Health Tracking, Config Publishing)
- **Sensor Service:** `El Servador/god_kaiser_server/src/services/sensor_service.py` (Config, Data Processing)
- **Actuator Service:** `El Servador/god_kaiser_server/src/services/actuator_service.py` (Command Execution, Safety Integration)
- **Safety Service:** `El Servador/god_kaiser_server/src/services/safety_service.py` (Emergency Stop, Validation)
- **Logic Engine:** `El Servador/god_kaiser_server/src/services/logic_engine.py` (Background-Task, Rule Evaluation)

### Sensor Processing
- **Library Loader:** `El Servador/god_kaiser_server/src/sensors/library_loader.py` (Dynamic Import via importlib)
- **Base Processor:** `El Servador/god_kaiser_server/src/sensors/base_processor.py` (Abstract Base Class)
- **pH Sensor:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/ph_sensor.py` (Referenz-Implementation)
- **Sensor Type Registry:** `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` (Type-Mapping)

### Database
- **Session:** `El Servador/god_kaiser_server/src/db/session.py`
- **Models:** `El Servador/god_kaiser_server/src/db/models/`
- **Repositories:** `El Servador/god_kaiser_server/src/db/repositories/`

### Testing
- **MockESP32Client:** `El Servador/god_kaiser_server/tests/esp32/mocks/mock_esp32_client.py`
- **Test Fixtures:** `El Servador/god_kaiser_server/tests/conftest.py`
- **Test Documentation:** `El Servador/docs/ESP32_TESTING.md`
- **Integration Tests:** `El Servador/god_kaiser_server/tests/integration/test_server_esp32_integration.py` (34 Tests)
- **Bug Documentation:** `El Servador/god_kaiser_server/tests/integration/BUGS_FOUND.md`

### Database Migrations
- **Alembic Config:** `El Servador/god_kaiser_server/alembic.ini`
- **Alembic Environment:** `El Servador/god_kaiser_server/alembic/env.py`
- **Migration Template:** `El Servador/god_kaiser_server/alembic/script.py.mako`
- **Migrations:** `El Servador/god_kaiser_server/alembic/versions/`
- **Dev Database:** `El Servador/god_kaiser_server/god_kaiser_dev.db` (SQLite)

---

## 17. SCHNELLREFERENZ: HÄUFIGE BEFEHLE

```bash
# Server-Verzeichnis
cd "El Servador/god_kaiser_server"

# Tests ausführen
python -m pytest tests/integration/test_server_esp32_integration.py -v --no-cov

# Migration erstellen
python -m alembic revision --autogenerate -m "Beschreibung"

# Migration anwenden
python -m alembic upgrade head

# Migration-Status
python -m alembic current

# Datenbank-Schema prüfen (SQLite)
python -c "import sqlite3; conn = sqlite3.connect('god_kaiser_dev.db'); print([row for row in conn.execute('PRAGMA table_info(actuator_states)')])"
```

---

---

## 18. KRITISCHE FUNKTIONEN & ABLÄUFE (Detailliert)

### 18.1 Sensor-Daten-Verarbeitungs-Flow

**Kompletter Ablauf von ESP32 → Server → ESP32:**

1. **ESP32 sendet Sensor-Daten** (`El Trabajante/src/services/sensor/sensor_manager.cpp`)
   - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`
   - Payload: `{"raw": 2150, "raw_mode": true, "sensor_type": "ph", ...}`
   - QoS: 1 (At least once)

2. **Server empfängt** (`src/mqtt/subscriber.py`)
   - Thread-Pool führt Handler aus (non-blocking)
   - Handler: `sensor_handler.handle_sensor_data()`

3. **Sensor-Handler verarbeitet** (`src/mqtt/handlers/sensor_handler.py`)
   - Topic-Parsing via `TopicBuilder.parse_sensor_data_topic()`
   - Payload-Validierung (`_validate_payload()`)
   - ESP-Device-Lookup (muss registriert sein)
   - Sensor-Config-Lookup

4. **Pi-Enhanced Processing** (wenn aktiviert)
   - Trigger: `sensor_config.pi_enhanced == True` und `raw_mode == true`
   - Library-Loader: `src/sensors/library_loader.py` → Dynamic Import
   - Processing: Sensor-Library in `src/sensors/sensor_libraries/active/`
   - Response: `publisher.publish_pi_enhanced_response()` → Topic: `.../sensor/{gpio}/processed`

5. **Datenbank-Speicherung**
   - Sensor-Daten werden in `SensorData` Tabelle gespeichert
   - Timestamp, raw_value, processed_value, unit, quality

6. **Logic-Engine Trigger** (non-blocking)
   - `logic_engine.evaluate_sensor_data()` wird via `asyncio.create_task()` aufgerufen
   - Rules werden evaluiert, Actions ausgeführt

**Code-Locations:**
- Handler: `src/mqtt/handlers/sensor_handler.py:46-280`
- Processing: `src/mqtt/handlers/sensor_handler.py:130-150`
- Logic Trigger: `src/mqtt/handlers/sensor_handler.py:280-290`

### 18.2 Actuator-Command-Flow

**Kompletter Ablauf von Server → ESP32:**

1. **Command-Request** (API oder Logic-Engine)
   - API: `POST /api/v1/actuators/{esp_id}/{gpio}/command`
   - Logic-Engine: `ActuatorService.send_command()`

2. **Safety-Validation** (`src/services/safety_service.py`)
   - `SafetyService.validate_actuator_command()` wird aufgerufen
   - Prüft: Emergency-Stop, Value-Range, Runtime-Protection
   - Returns: `SafetyResult` mit `valid`, `error`, `warnings`

3. **Command-Publishing** (`src/mqtt/publisher.py`)
   - `publisher.publish_actuator_command()`
   - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`
   - QoS: 2 (Exactly once)
   - Retry-Logic: 3 Versuche bei Fehler

4. **ESP32 empfängt** (`El Trabajante/src/services/actuator/actuator_manager.cpp`)
   - ActuatorManager verarbeitet Command
   - Safety-Checks auf ESP32-Seite
   - Status-Update wird zurückgesendet

5. **Status-Update** (ESP32 → Server)
   - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status`
   - Handler: `actuator_handler.handle_actuator_status()`
   - Database-Update: `ActuatorState` wird aktualisiert

**Code-Locations:**
- Service: `src/services/actuator_service.py:44-193`
- Safety: `src/services/safety_service.py:validate_actuator_command()`
- Publisher: `src/mqtt/publisher.py:38-72`

### 18.3 Logic-Engine Evaluation-Flow

**Kompletter Ablauf der Automation-Rule-Evaluation:**

1. **Trigger** (Sensor-Daten empfangen)
   - `sensor_handler` ruft `logic_engine.evaluate_sensor_data()` auf
   - Non-blocking via `asyncio.create_task()`

2. **Rule-Matching** (`src/services/logic_engine.py`)
   - `LogicRepository.get_rules_by_trigger_sensor()` lädt passende Rules
   - Filter: `esp_id`, `gpio`, `sensor_type`

3. **Condition-Evaluation**
   - Für jede Rule: `_check_conditions()` wird aufgerufen
   - Condition-Types: `sensor_threshold`, `sensor` (Shorthand), `time_window`
   - Validation: `src/db/models/logic_validation.py`

4. **Cooldown-Check**
   - `LogicRepository.get_last_execution()` prüft letzte Ausführung
   - Wenn `time_since_last < cooldown_seconds`: Rule wird übersprungen

5. **Action-Execution**
   - Wenn Conditions erfüllt: `_execute_actions()` wird aufgerufen
   - Action-Types: `actuator_command`, `actuator` (Shorthand)
   - `ActuatorService.send_command()` wird für jede Action aufgerufen

6. **Execution-Logging**
   - `LogicRepository.log_execution()` speichert Execution-History
   - Loggt: trigger_data, actions, success, execution_time_ms

**Code-Locations:**
- Engine: `src/services/logic_engine.py:84-137`
- Evaluation: `src/services/logic_engine.py:139-200`
- Actions: `src/services/logic_engine.py:202-250`

### 18.4 Heartbeat & Device-Registration-Flow

**Kompletter Ablauf der Device-Registration:**

1. **ESP32 sendet Heartbeat** (`El Trabajante/src/services/communication/mqtt_client.cpp`)
   - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`
   - QoS: 0 (At most once)
   - Payload: `{"ts": ..., "uptime": ..., "heap_free": ..., "wifi_rssi": ...}`

2. **Server empfängt** (`src/mqtt/handlers/heartbeat_handler.py`)
   - Handler: `handle_heartbeat()`
   - Topic-Parsing: `TopicBuilder.parse_heartbeat_topic()`
   - Payload-Validierung: `_validate_payload()`

3. **Device-Lookup**
   - `ESPRepository.get_by_device_id()` prüft ob ESP registriert ist
   - **KRITISCH:** Wenn nicht registriert → Rejection (kein Auto-Discovery)

4. **Status-Update**
   - `ESPRepository.update_status()` setzt Status auf "online"
   - `last_seen` wird aktualisiert
   - Metadata wird mit Health-Metrics aktualisiert

5. **Health-Metrics-Logging**
   - Low Memory Warning: `heap_free < 10000`
   - Weak WiFi Warning: `wifi_rssi < -70`
   - Error-Count Tracking

**Device-Registration (via API):**
- Endpoint: `POST /api/v1/esp/register`
- Service: `ESPService.register_device()`
- Database: `ESPDevice` wird erstellt
- Nach Registration: Heartbeats werden akzeptiert

**Code-Locations:**
- Handler: `src/mqtt/handlers/heartbeat_handler.py:45-139`
- Rejection: `src/mqtt/handlers/heartbeat_handler.py:98-109`
- Service: `src/services/esp_service.py:60-133`

---

## 19. CI/CD INTEGRATION (GitHub Actions)

### 19.1 Relevante Workflows für Server-Tests

| Workflow | Datei | Trigger | Tests | Artifacts |
|----------|-------|---------|-------|-----------|
| **Server Tests** | `server-tests.yml` | Push/PR auf `El Servador/**` | Unit + Integration | `unit-test-results`, `integration-test-results` |
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR auf `tests/esp32/**` | MockESP32 Tests | `esp32-test-results` |

### 19.2 Server-Tests Workflow Details

**Workflow-Datei:** `.github/workflows/server-tests.yml`

**Jobs:**
1. `lint` - Ruff + Black Format-Check
2. `unit-tests` - Unit Tests mit Coverage
3. `integration-tests` - Integration Tests mit Mosquitto Docker-Service
4. `test-summary` - Ergebnisse zusammenfassen + PR-Kommentar

**CI-Umgebung:**
```yaml
env:
  PYTHON_VERSION: '3.11'
  POETRY_VERSION: '1.7.1'
  MQTT_BROKER_HOST: localhost
  DATABASE_URL: sqlite+aiosqlite:///./test.db

services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports: [1883:1883]
```

**Artifacts:**
- `unit-test-results` → `junit-unit.xml`, `coverage-unit.xml`
- `integration-test-results` → `junit-integration.xml`, `coverage-integration.xml`

### 19.3 GitHub CLI - Log-Befehle

```bash
# ============================================
# WORKFLOW-STATUS PRÜFEN
# ============================================

# Server Tests - letzte Runs
gh run list --workflow=server-tests.yml --limit=10

# ESP32 Tests - letzte Runs
gh run list --workflow=esp32-tests.yml --limit=10

# Nur fehlgeschlagene Runs
gh run list --workflow=server-tests.yml --status=failure

# ============================================
# LOGS ABRUFEN (Run-ID aus obiger Liste)
# ============================================

# Vollständige Logs
gh run view <run-id> --log

# Nur fehlgeschlagene Jobs
gh run view <run-id> --log-failed

# Spezifischen Job anzeigen
gh run view <run-id> --job=<job-id>

# Live-Logs eines laufenden Workflows
gh run watch <run-id>

# ============================================
# ARTIFACTS HERUNTERLADEN
# ============================================

# Alle Artifacts eines Runs
gh run download <run-id>

# Unit-Test-Ergebnisse
gh run download <run-id> --name=unit-test-results

# Integration-Test-Ergebnisse
gh run download <run-id> --name=integration-test-results

# ============================================
# WORKFLOW MANUELL STARTEN
# ============================================

gh workflow run server-tests.yml
gh workflow run esp32-tests.yml
```

### 19.4 Typischer Debug-Workflow für KI-Agenten

```bash
# 1. Fehlgeschlagenen Run identifizieren
gh run list --workflow=server-tests.yml --status=failure --limit=3

# 2. Fehler-Logs analysieren
gh run view <run-id> --log-failed

# 3. JUnit XML für Details herunterladen
gh run download <run-id> --name=unit-test-results
cat junit-unit.xml | grep -A 10 "<failure"

# 4. Spezifischen fehlgeschlagenen Test lokal debuggen
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/test_xyz.py::test_failed_function -xvs
```

### 19.5 CI vs. Lokal: Umgebungsunterschiede

| Komponente | CI (GitHub Actions) | Lokal (Development) |
|------------|---------------------|---------------------|
| **Python** | 3.11 (fest) | Poetry-Env |
| **Database** | SQLite In-Memory | PostgreSQL oder SQLite |
| **MQTT Broker** | Mosquitto Docker | Optional lokal |
| **Coverage** | XML Reports | HTML Reports |
| **Parallelität** | `-x` (stop on first) | Alle Tests |
| **Timeouts** | 15 min pro Job | Unbegrenzt |

### 19.6 Verwandte Dokumentation

- **Vollständige Test-Dokumentation:** `El Servador/docs/ESP32_TESTING.md`
- **Test-Workflow für KI-Agenten:** `.claude/TEST_WORKFLOW.md`
- **Haupt-KI-Dokumentation:** `.claude/CLAUDE.md` (Section 13: CI/CD)

---

**Ende der CLAUDE_SERVER.md**

**Letzte Aktualisierung:** 2026-01-05
**Version:** 3.2 (CI/CD Integration dokumentiert)