# 🏛️ Pi-Server Refactoring Command

> **Zweck:** Vollständige Spezifikation für Pi-Server Transformation von Monolith zu modularer Architektur  
> **Themengebiet:** El Servador (Pi-Server)  
> **Verwandte Dokumente:** `El Trabajante/docs/Mqtt_Protocoll.md`, `El Trabajante/docs/System_Overview.md`

---

## PRIMÄRES ZIEL

Refactore den alten Pi-Server (`El Servador/pi_server_ALT/`) nach den Architekturvorgaben von **El Trabajante** (ESP32 Firmware) zu einem industriellen, modularen FastAPI-Backend mit vollständiger MQTT-Integration, wobei die neue Server-Centric Architektur umgesetzt wird.

---

## KRITISCHE ANFORDERUNGEN

### 1. MQTT-PROTOKOLL-KONFORMITÄT (HÖCHSTE PRIORITÄT)

**Basis-Dokument:** `El Trabajante/docs/Mqtt_Protocoll.md`

**Zu überprüfen und implementieren:**

- **Topic-Hierarchie exakt umsetzen:**
  - `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` - Sensor-Daten empfangen
  - `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` - Actuator-Befehle senden
  - `kaiser/god/esp/{esp_id}/actuator/{gpio}/status` - Actuator-Status empfangen
  - `kaiser/god/esp/{esp_id}/system/command` - System-Befehle
  - `kaiser/god/esp/{esp_id}/config/*` - Dynamische Konfiguration
  - `kaiser/broadcast/*` - Broadcast-Topics für alle ESPs
  - `kaiser/god/esp/{esp_id}/pi_enhanced/request` - Pi-Enhanced Sensor Processing

- **Message-Formate validieren:**
  - JSON-Schema-Validierung für alle Message-Typen
  - Timestamp-Handling (Unix-Millisekunden)
  - Error-Responses mit standardisiertem Format
  - QoS-Level korrekt setzen (QoS 1 für Sensor-Daten, QoS 2 für Commands)

- **MQTT-Client-Architektur:**
  - Asynchroner MQTT-Client (aiomqtt/paho-mqtt)
  - Reconnection-Logic mit exponential backoff
  - Circuit Breaker Pattern für MQTT-Verbindung
  - Message-Retry-Mechanismus für kritische Messages
  - Topic-Pattern-Matching Engine

### 2. SERVER-CENTRIC ARCHITEKTUR (KERN-FEATURE)

**Basis-Dokument:** `El Trabajante/docs/System_Overview.md`

**Pi-Enhanced Sensor Processing implementieren:**

```python
# ESP32 sendet Rohdaten → Server verarbeitet → ESP32 empfängt Ergebnis

1. ESP → Pi: {"gpio": 34, "raw_value": 2456, "type": "analog"}
2. Pi Processing: Sensor-Library lädt, konvertiert, validiert
3. Pi → ESP: {"value": 23.5, "unit": "°C", "status": "ok"}
```

**Kritische Komponenten:**

- **Dynamic Sensor Library Loader:**
  - Python-Module zur Laufzeit laden
  - Sensor-Libraries mit standardisiertem Interface
  - Hot-Reload ohne Server-Neustart
  - Fallback auf Rohdaten bei Library-Fehler

- **Sensor Processing Pipeline:**
  - Input-Validierung
  - Library-Selection basierend auf Sensor-Type
  - Processing mit Fehlerbehandlung
  - Response-Formatting
  - Performance: <200ms pro Sensor-Request

### 3. ARCHITEKTUR-TRANSFORMATION

**Von:** Monolithischer `main.py` (12.500+ Zeilen)  
**Zu:** Modulare Struktur gemäß `GOD_KAISER_SERVER_IMPLEMENTIERUNGS_PLAN.md` Part 1+2

**Ziel-Struktur:**

```
god_kaiser_server/
├── src/
│   ├── core/          # App, Config, Security, Logging
│   ├── api/v1/        # REST Endpoints (ESP, Sensor, Actuator, Automation)
│   ├── mqtt/          # MQTT Client, Handlers, Publisher, Subscriber
│   ├── services/      # Business-Logic (Sensor-, Actuator-, Logic-Service)
│   ├── db/            # SQLAlchemy Models, Repositories, Session
│   ├── schemas/       # Pydantic Models für Validation
│   ├── sensors/       # Sensor Library Loader + Libraries
│   ├── websocket/     # WebSocket Manager für Frontend
│   └── utils/         # Helpers (MQTT, Time, Network, Data)
├── tests/
│   ├── unit/          # Isolierte Unit-Tests
│   ├── integration/   # API + MQTT Tests
│   ├── esp32/         # ESP32-spezifische Tests (Mock + Real)
│   └── e2e/           # End-to-End Workflows
└── docs/              # API, Architecture, Deployment
```

**Module-Separation-Regeln:**

- Keine Datei >500 Zeilen Code
- Single Responsibility Principle strikt befolgen
- Dependency Injection für Testbarkeit
- Alle externe Dependencies abstrahieren (Repository-Pattern)

### 4. API-DESIGN

**Basis:** REST + WebSocket Hybrid-Architektur

**REST API Endpoints (FastAPI):**

```
/api/v1/auth/                          # 🔴 KRITISCH
├── POST   /login                      # User Login → JWT Token
├── POST   /register                   # User Registration
├── POST   /refresh                    # Refresh Access Token
├── POST   /logout                     # Token Blacklist
├── POST   /mqtt/configure             # 🆕 MQTT Auth Configuration
│   └── Body: {"username": "...", "password": "...", "enable": true}
│   └── Action: Update Mosquitto password file + Reload broker
└── GET    /mqtt/status                # 🆕 MQTT Auth Status

/api/v1/esp/                           # 🔴 KRITISCH
├── GET    /devices                    # Liste aller ESPs (Filter: kaiser_id, zone, status)
├── GET    /devices/{esp_id}           # ESP-Details + Sensor/Actuator Configs
├── POST   /devices/{esp_id}/config    # Update ESP Config → Send via MQTT
├── POST   /devices/{esp_id}/restart   # Restart Command
├── POST   /devices/{esp_id}/reset     # Factory Reset
├── GET    /devices/{esp_id}/health    # Health Metrics (uptime, heap, rssi)
├── POST   /devices/{esp_id}/assign_kaiser  # Assign ESP to Kaiser
└── GET    /discovery                  # ESP32 Network Discovery Results

/api/v1/sensors/                       # 🔴 KRITISCH
├── GET    /                           # List Sensor Configs (Filter: esp_id, type, active)
├── GET    /{esp_id}/{gpio}            # Specific Sensor Config
├── POST   /{esp_id}/{gpio}            # Create/Update Sensor Config
├── DELETE /{esp_id}/{gpio}            # Remove Sensor Config
├── POST   /{esp_id}/{gpio}/calibrate  # Sensor Calibration
├── GET    /data                       # Query Sensor Data (Range, Pagination)
└── POST   /process                    # 🔴 Pi-Enhanced Processing (KERN-FEATURE)
    └── Body: {"raw_data": 2456, "sensor_type": "dht22", "metadata": {...}}
    └── Returns: {"temperature": 23.5, "humidity": 65.2, "status": "ok"}

/api/v1/actuators/                     # 🔴 KRITISCH
├── GET    /                           # List Actuator Configs
├── POST   /{esp_id}/{gpio}            # Create/Update Actuator Config
├── POST   /{esp_id}/{gpio}/command    # 🔴 Send Actuator Command
│   └── Body: {"command": "on"/"off", "value": 0-255, "duration": ?}
│   └── Process: Safety-Check → MQTT → Wait ACK → WebSocket Notify
├── GET    /{esp_id}/{gpio}/status     # Current Actuator State
├── POST   /emergency_stop             # 🔴 Emergency Stop (All or Specific ESP)
└── DELETE /{esp_id}/{gpio}            # Remove Actuator Config

/api/v1/kaiser/                        # 🟡 HOCH
├── GET    /nodes                      # List All Kaiser Nodes
├── POST   /register                   # Register New Kaiser → Generate Cert
├── GET    /{kaiser_id}                # Kaiser Details + Assigned ESPs
├── POST   /{kaiser_id}/assign_esp     # Assign ESP to Kaiser
├── POST   /{kaiser_id}/sync_config    # Sync All Config to Kaiser
└── DELETE /{kaiser_id}                # Unregister Kaiser → Reassign ESPs

/api/v1/logic/                         # 🟡 HOCH
├── GET    /rules                      # List All Logic Rules
├── POST   /rules                      # Create Logic Rule (Validate + Test)
├── GET    /rules/{rule_id}            # Rule Details + Execution History
├── PUT    /rules/{rule_id}            # Update Rule
├── DELETE /rules/{rule_id}            # Delete Rule
├── POST   /rules/{rule_id}/toggle     # Enable/Disable Rule
├── POST   /rules/{rule_id}/test       # Simulate Rule Execution
└── GET    /execution_history          # Query Rule Executions

/api/v1/library/                       # 🟢 MITTEL
├── GET    /available                  # List Available Sensor Libraries
├── POST   /install                    # Install Library to ESP(s)
│   └── Body: {"library_name": "...", "version": "1.0", "esp_id": "..."}
│   └── Process: Compress → CRC32 → MQTT/HTTP Transfer → Wait ACK
├── GET    /status                     # Library Installation Status per ESP
└── POST   /update                     # Update Library on All ESPs

/api/v1/ai/                            # 🟢 MITTEL (v5.1+)
├── POST   /recommendation             # Receive AI Recommendation from God
│   └── Body: {"prediction": ..., "confidence": 0.95, "action": {...}}
│   └── Process: Store → Check Auto-Action → Execute? → Notify Frontend
├── GET    /predictions                # Query Predictions (Filter: esp_id, time)
├── POST   /predictions/{id}/approve   # Manually Approve Recommendation
├── POST   /predictions/{id}/reject    # Reject Recommendation + Feedback
└── POST   /send_batch                 # Send Batch Data to God for Training

/api/v1/health/                        # 🟡 HOCH
├── GET    /                           # Basic Health Check (DB, MQTT, Disk, Memory)
├── GET    /detailed                   # Comprehensive Health + Stats
├── GET    /esp                        # ESP Health Summary (All ESPs)
└── GET    /metrics                    # Prometheus Metrics Export
```

**WebSocket Endpoints:**

```
/ws/realtime/{client_id}               # 🔴 KRITISCH - Real-time Updates
├── Message Types:
│   ├── sensor_data         # Real-time Sensor Readings
│   ├── actuator_status     # Actuator State Changes
│   ├── system_event        # Errors, Warnings, Emergency
│   ├── esp_health          # ESP Health Updates
│   ├── logic_execution     # Cross-ESP Logic Triggers
│   └── ai_prediction       # God AI Recommendations
├── Filters: Subscribe by esp_id, sensor_type, etc.
└── Rate Limit: Max 10 messages/sec per client
```

### 5. KOMMUNIKATIONSMUSTER

**Pattern 1: Sensor-Reading (Pi-Enhanced)**

```
1. ESP → MQTT: kaiser/god/esp/{id}/pi_enhanced/request
   {"gpio": 34, "raw_value": 2456, "type": "analog", "sensor_type": "dht22"}

2. Server Processing:
   - MQTT Handler empfängt
   - Sensor-Service lädt Library "dht22"
   - Library verarbeitet raw_value
   - Ergebnis cachen (DB + Redis)

3. Server → MQTT: kaiser/god/esp/{id}/pi_enhanced/response
   {"temperature": 23.5, "humidity": 65.2, "status": "ok"}

4. Optional: Server → WebSocket: Real-time Update an Frontend
```

**Pattern 2: Actuator-Command**

```
1. Frontend/API → REST: POST /api/v1/actuators/{esp_id}/5/set
   {"mode": "digital", "value": 1}

2. Server → MQTT: kaiser/god/esp/{id}/actuator/5/command
   {"action": "set", "mode": "digital", "value": 1, "timestamp": 1732567890123}

3. ESP → MQTT: kaiser/god/esp/{id}/actuator/5/response
   {"status": "ok", "gpio": 5, "mode": "digital", "value": 1}

4. Server → REST Response: {"success": true, "state": {...}}
```

**Pattern 3: Dynamic Configuration**

```
1. API → MQTT: kaiser/god/esp/{id}/config/sensor/34
   {"enabled": true, "interval_ms": 5000, "sensor_type": "dht22"}

2. ESP empfängt, speichert in NVS, bestätigt
3. ESP → MQTT: kaiser/god/esp/{id}/config/sensor/34/ack
```

### 6. FEHLERBEHANDLUNG & AUSFALLSICHERHEIT

**Circuit Breaker Pattern:**

- MQTT-Verbindung: 5 Fehler → 30s Pause → Reconnect
- Pi-Enhanced Processing: 3 Fehler → Fallback auf Rohdaten
- Database: Connection-Pool mit Health-Checks
- External Services (God-AI): Timeout nach 5s, Fallback-Response

**Error-Recovery Flows:**

- MQTT-Disconnect → Automatischer Reconnect mit Message-Queue
- Database-Fehler → Graceful Degradation (Redis-Cache)
- Sensor-Library-Fehler → Rohdaten-Passthrough
- ESP-Offline → Status-Tracking + Offline-Queue

**Logging & Monitoring:**

- Strukturiertes Logging (JSON-Format)
- Log-Levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Prometheus-Metriken exportieren
- Health-Check-Endpoints für Kubernetes/Docker

### 7. DATENBANK-SCHEMA

**PostgreSQL Models (SQLAlchemy):**

```python
# ESPDevice Model (VOLLSTÄNDIG)
class ESPDevice:
    id: UUID (PK)
    device_id: str (UK, "ESP_XXXXXXXX")
    name: Optional[str]
    zone_id: Optional[str]              # NEU
    zone_name: Optional[str]            # NEU
    is_zone_master: bool                # NEU
    ip_address: str
    mac_address: str
    firmware_version: str
    hardware_type: str                  # NEU
    capabilities: JSONB                 # NEU
    status: str (online/offline/error)
    last_seen: DateTime
    metadata: JSONB
    created_at: DateTime
    updated_at: DateTime

# SensorReading Model
class SensorReading:
    id: UUID (PK)
    esp_id: UUID (FK → ESPDevice)
    gpio: int
    raw_value: float
    processed_value: Optional[float]
    sensor_type: str
    unit: Optional[str]
    processing_mode: str (pi_enhanced/local/raw)
    timestamp: DateTime (Index)
    metadata: JSONB

# ActuatorState Model
class ActuatorState:
    id: UUID (PK)
    esp_id: UUID (FK → ESPDevice)
    gpio: int
    mode: str (digital/pwm/servo)
    value: float
    is_active: bool
    last_command_at: DateTime
    metadata: JSONB

# LogicRule Model (Cross-ESP Automation)
class LogicRule:
    id: UUID (PK)
    name: str
    condition: JSONB (Trigger-Bedingungen)
    actions: JSONB (Actuator-Actions)
    is_active: bool
    priority: int
    created_at: DateTime
```

**Migrations:** Alembic für Schema-Versionierung

### 8. TESTING-STRATEGIE

**Test-Kategorien (aus `el Trabajante/test/`):**

```
tests/
├── unit/                           # Isolierte Tests (>80% Coverage)
│   ├── test_sensor_library_loader.py
│   ├── test_mqtt_topic_parser.py
│   ├── test_actuator_service.py
│   └── test_circuit_breaker.py
│
├── integration/                    # Service-Integration
│   ├── test_mqtt_sensor_flow.py
│   ├── test_rest_api.py
│   └── test_database_operations.py
│
├── esp32/                          # ESP32-Mocks + Real Hardware
│   ├── mocks/
│   │   ├── mock_esp32_client.py   # Simuliert ESP32 MQTT-Verhalten
│   │   └── real_esp32_client.py   # Echte Hardware-Tests
│   ├── test_communication.py
│   ├── test_sensor.py
│   ├── test_actuator.py
│   └── test_cross_esp.py
│
└── e2e/                            # End-to-End Workflows
    ├── test_sensor_workflow.py     # ESP → MQTT → Processing → Response
    └── test_automation_workflow.py # Logic-Rule-Execution
```

**Test-Anforderungen:**

- Unit-Test Coverage >80%
- Alle MQTT-Messages mit Mock-ESP testen
- Performance-Tests: <200ms Sensor-Processing
- Load-Tests: 100 concurrent requests
- Real-Hardware-Tests optional (mit `@pytest.mark.hardware`)

### 9. CODE-QUALITÄT & BEST PRACTICES

**Code-Standards:**

- Type Hints überall (mypy-strict)
- Docstrings für alle Public-Functions (Google-Style)
- Pydantic für Input/Output-Validation
- Async/Await für I/O-Operations
- Repository-Pattern für Database-Access
- Dependency Injection (FastAPI Depends)

**Project-Management:**

- Poetry für Dependency-Management
- Pre-commit Hooks (black, isort, flake8, mypy)
- GitHub Actions CI/CD Pipeline
- Docker + Docker-Compose für Deployment

**Security:**

- JWT-Authentication für REST API (optional für v1.0)
- MQTT TLS/SSL-Verschlüsselung
- Input-Sanitization (Pydantic)
- SQL-Injection-Prevention (SQLAlchemy ORM)

---

## MIGRATIONS-STRATEGIE (6-PHASEN-PLAN)

### Phase 1: Foundation (Woche 1-2) 🔴 KRITISCH

**Ziel:** Grundgerüst funktionsfähig, Core-Infrastruktur steht

1. **Projekt-Setup:**
   - Poetry init, pyproject.toml mit allen Dependencies
   - Komplette Ordnerstruktur erstellen (alle Ordner/Files)
   - .env.example, .gitignore, README.md
   - Docker + docker-compose.yml

2. **Core-Module (src/core/):**
   - `config.py` - Settings (Pydantic BaseSettings)
   - `security.py` - JWT, Password Hashing, TLS
   - `logging_config.py` - Structured Logging (JSON)
   - `exceptions.py` - Custom Exception Hierarchy
   - `constants.py` - MQTT Topics, GPIO Ranges, Error Codes
   - `validators.py` - Input Validation Functions

3. **Database Layer (src/db/):**
   - `base.py` - SQLAlchemy DeclarativeBase
   - `session.py` - Engine, SessionFactory, Connection Pool
   - `models/*.py` - ALLE Models (user, esp, sensor, actuator, kaiser, logic, library, ai, system)
   - `repositories/base_repo.py` - Generic Repository[T]

4. **Alembic Setup:**
   - alembic.ini, alembic/env.py
   - Initial Migration (alle Tabellen)

**Deliverables:**
- ✅ Server startet ohne Fehler
- ✅ DB-Verbindung funktioniert
- ✅ Logging funktioniert
- ✅ Config lädt aus .env

---

### Phase 2: Data Layer (Woche 3-4) 🔴 KRITISCH

**Ziel:** Alle Repositories + Schemas, vollständige Daten-Access-Schicht

5. **Repositories (src/db/repositories/):**
   - `user_repo.py` - UserRepository
   - `esp_repo.py` - ESPRepository (KRITISCH)
   - `sensor_repo.py` - SensorConfigRepository + SensorDataRepository (KRITISCH)
   - `actuator_repo.py` - ActuatorConfig/State/History Repositories (KRITISCH)
   - `kaiser_repo.py` - KaiserRepository
   - `logic_repo.py` - LogicRule + Execution Repositories
   - `library_repo.py` - LibraryRepository
   - `ai_repo.py` - AIPredictionRepository
   - `system_config_repo.py` - SystemConfigRepository

6. **Pydantic Schemas (src/schemas/):**
   - `common.py` - BaseResponse, ErrorResponse, PaginatedResponse[T]
   - `auth.py` - Login, Register, Token, MQTTAuthRequest
   - `esp.py` - ESPDevice, ESPHealth, DiscoveredESP
   - `sensor.py` - SensorConfig, SensorData, ProcessedSensor
   - `actuator.py` - ActuatorConfig, Command, Status
   - `kaiser.py` - KaiserNode, AssignESP
   - `logic.py` - LogicRule, TestRule, ExecutionHistory
   - `library.py` - LibraryInfo, InstallRequest
   - `ai.py` - Prediction, Recommendation
   - `health.py` - HealthResponse, DetailedHealth

7. **API Dependencies (src/api/):**
   - `deps.py` - get_db(), get_current_user(), verify_api_key(), rate_limit()

**Deliverables:**
- ✅ Alle Repository-Funktionen implementiert + getestet
- ✅ Alle Pydantic Schemas definiert
- ✅ Unit-Tests für Repositories >80% Coverage

---

### Phase 3: Business Logic (Woche 5-6) 🔴 KRITISCH

**Ziel:** Alle Services implementiert, Sensor-Processing funktioniert

8. **Core Services (src/services/):**
   - `esp_service.py` - ESP Management (KRITISCH)
   - `sensor_service.py` - Sensor Operations (KRITISCH)
   - `actuator_service.py` - Actuator Control (KRITISCH)
   - `safety_service.py` - Safety Checks (KRITISCH)
   - `logic_service.py` - Rule Management
   - `kaiser_service.py` - Kaiser Management
   - `library_service.py` - Library Distribution
   - `ai_service.py` - AI Integration
   - `god_client.py` - HTTP Client zu God Layer
   - `health_service.py` - Health Monitoring

9. **Sensor Processing (src/sensors/):**
   - `library_loader.py` - Dynamic Library Loader (KRITISCH)
   - `base_processor.py` - BaseSensorProcessor Interface
   - `sensor_libraries/active/*.py` - Migrate 10 Libraries:
     - `temperature.py` (SHT31, DS18B20, DHT22)
     - `humidity.py` (SHT31, DHT22)
     - `ph_sensor.py` (DFRobot, Atlas)
     - `ec_sensor.py` (DFRobot, Atlas)
     - `moisture.py` (Capacitive, Resistive)
     - `pressure.py` (BMP280, BME280)
     - `co2.py` (MHZ19, SCD30)
     - `light.py` (TSL2561, BH1750)
     - `flow.py` (YFS201, Generic)

10. **Logic Engine (src/services/):**
    - `logic_engine.py` - Cross-ESP Automation Engine (Background Task)

**Deliverables:**
- ✅ Alle Services funktionsfähig
- ✅ Library-Loader lädt dynamisch
- ✅ Sensor-Processing <200ms
- ✅ Logic-Engine evaluiert Rules
- ✅ Unit-Tests für Services >80% Coverage

---

### Phase 4: Communication Layer (Woche 7-8) 🔴 KRITISCH

**Ziel:** MQTT + WebSocket voll funktionsfähig, Real-time Communication

11. **MQTT Client (src/mqtt/):**
    - `client.py` - MQTTClient (Paho-MQTT Wrapper, Singleton) (KRITISCH)
    - `subscriber.py` - MQTTSubscriber (Topic Router) (KRITISCH)
    - `publisher.py` - MQTTPublisher (Command Sender) (KRITISCH)
    - `topics.py` - Topic Builders + Parsers

12. **MQTT Handlers (src/mqtt/handlers/):**
    - `sensor_handler.py` - Sensor Data Handler (KRITISCH)
    - `actuator_handler.py` - Actuator Status Handler (KRITISCH)
    - `heartbeat_handler.py` - ESP Heartbeat Handler
    - `config_handler.py` - Config ACK Handler
    - `kaiser_handler.py` - Kaiser Status Handler
    - `discovery_handler.py` - ESP32 Discovery Handler

13. **WebSocket (src/websocket/):**
    - `manager.py` - WebSocketManager (Singleton, Broadcasting) (KRITISCH)

14. **Utils (src/utils/):**
    - `mqtt_helpers.py` - build_topic(), parse_topic()
    - `time_helpers.py` - Timestamp-Funktionen
    - `data_helpers.py` - normalize_sensor_data(), CRC32
    - `network_helpers.py` - is_reachable(), ping()

**Deliverables:**
- ✅ MQTT-Verbindung stabil (Reconnect funktioniert)
- ✅ Alle Topics werden korrekt geroutet
- ✅ Sensor-Data Flow: ESP → MQTT → Handler → DB → WebSocket
- ✅ Actuator-Command Flow: API → MQTT → ESP
- ✅ WebSocket Broadcasting funktioniert
- ✅ Integration-Tests für MQTT-Flows

---

### Phase 5: API Layer (Woche 9-10) 🔴 KRITISCH

**Ziel:** REST API vollständig, alle Endpoints implementiert

15. **Main Application (src/):**
    - `main.py` - FastAPI App, Middleware, Router Registration, Lifespan Events (KRITISCH)

16. **API Endpoints (src/api/v1/):**
    - `__init__.py` - Router Registration
    - `auth.py` - Authentication + MQTT Auth Config (KRITISCH)
    - `esp.py` - ESP Management (KRITISCH)
    - `sensors.py` - Sensor Endpoints (KRITISCH)
    - `actuators.py` - Actuator Endpoints (KRITISCH)
    - `logic.py` - Logic Rules Endpoints
    - `kaiser.py` - Kaiser Management
    - `library.py` - Library Distribution
    - `ai.py` - AI Integration Endpoints
    - `health.py` - Health Checks (KRITISCH)

17. **WebSocket Endpoint:**
    - `src/api/v1/websocket/realtime.py` - WebSocket Connection Handler

**Deliverables:**
- ✅ Alle REST Endpoints funktionsfähig
- ✅ OpenAPI/Swagger Docs generiert
- ✅ Authentication funktioniert (JWT)
- ✅ API-Tests >90% Coverage
- ✅ End-to-End Tests für Hauptworkflows

---

### Phase 6: Production-Ready (Woche 11-12) 🟡 FINALISIERUNG

**Ziel:** Deployment-Ready, Monitoring, Migration, Dokumentation

18. **Utility Scripts (scripts/):**
    - `init_db.py` - DB Initialization + Seed Data
    - `create_admin.py` - Admin User Creation
    - `backup_db.py` - Database Backup (gzip)
    - `restore_db.py` - Database Restore
    - `cleanup_old_data.py` - Data Retention Cleanup (Cron)
    - `generate_certificates.py` - TLS Certificate Generation
    - `test_mqtt.py` - MQTT Connection Test
    - `migrate_from_old.py` - Migration von pi_server_ALT (WICHTIG)

19. **Testing & Coverage:**
    - `tests/conftest.py` - Pytest Fixtures
    - `tests/unit/*` - Unit-Tests (Ziel: >80% Coverage)
    - `tests/integration/*` - Integration-Tests
    - `tests/e2e/*` - End-to-End Tests
    - ESP32-Mock-Tests (tests/esp32/)
    - Performance-Tests (<200ms Sensor-Processing)
    - Load-Tests (100 concurrent requests)

20. **Monitoring & Observability:**
    - Prometheus-Metriken exportieren (/metrics)
    - Health-Checks (liveness, readiness)
    - Structured Logging (JSON-Format)
    - Error-Tracking Integration

21. **Deployment:**
    - Dockerfile (Multi-stage Build)
    - docker-compose.yml (API, PostgreSQL, Mosquitto, Redis)
    - Kubernetes Manifests (optional)
    - CI/CD Pipeline (GitHub Actions)

22. **Documentation:**
    - `docs/ARCHITECTURE.md` - Vollständige Architektur-Doku
    - `docs/API.md` - API Reference (aus OpenAPI generiert)
    - `docs/MQTT_TOPICS.md` - MQTT Topic Spezifikation
    - `docs/DEPLOYMENT.md` - Deployment Guide
    - `docs/DEVELOPMENT.md` - Development Setup
    - `docs/TESTING.md` - Testing Guide
    - `docs/SECURITY.md` - Security Documentation
    - `docs/TROUBLESHOOTING.md` - Common Issues & Solutions
    - `docs/diagrams/*.png` - Architecture Diagrams

23. **Migration Execution:**
    - Data-Migration von pi_server_ALT → New Server
    - Backward-Compatibility Tests
    - Staged Rollout (Dev → Staging → Production)

**Deliverables:**
- ✅ Server production-ready
- ✅ Alle Tests grün (Unit, Integration, E2E)
- ✅ Test-Coverage >80%
- ✅ Monitoring funktioniert
- ✅ Docker-Deployment funktioniert
- ✅ Dokumentation vollständig
- ✅ Migration erfolgreich
- ✅ Performance-Benchmarks erfüllt

---

## KOMMUNIKATIONS-MATRIX

**Verständnis der Datenflüsse ist KRITISCH für erfolgreiche Implementation.**

### 🔄 Zentrale Kommunikationspunkte

```
┌─────────────────────────────────────────────────────────────────────┐
│                    KOMMUNIKATIONS-HIERARCHIE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  main.py (Entry Point) - Orchestriert Startup                       │
│    ├──→ core/config.py                (Konfiguration laden)         │
│    ├──→ core/logging_config.py        (Logging setup)              │
│    ├──→ db/session.py                 (DB Pool initialisieren)     │
│    ├──→ mqtt/client.py                (MQTT Connection starten)    │
│    ├──→ websocket/manager.py          (WebSocket Manager init)     │
│    ├──→ services/logic_engine.py      (Background Engine starten)  │
│    └──→ api/v1/*.py                   (Alle Routen registrieren)   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  HTTP Request Flow (Frontend → Backend):                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Frontend/Client                                                    │
│    │                                                                │
│    ├──→ api/v1/*.py              (FastAPI Endpoints)               │
│    │     ├──→ api/deps.py        (Auth, DB Session)               │
│    │     │     ├──→ core/security.py  (JWT Verify)                │
│    │     │     └──→ db/session.py     (Get DB Session)            │
│    │     │                                                         │
│    │     └──→ services/*.py      (Business Logic)                 │
│    │           ├──→ db/repositories/*.py  (Data Access)           │
│    │           │     └──→ db/models/*.py     (ORM Models)         │
│    │           │           └──→ PostgreSQL                        │
│    │           │                                                   │
│    │           ├──→ sensors/library_loader.py  (Load Libraries)   │
│    │           │     └──→ sensor_libraries/active/*.py            │
│    │           │                                                   │
│    │           ├──→ mqtt/publisher.py    (Send MQTT Commands)     │
│    │           │     └──→ mqtt/client.py                          │
│    │           │           └──→ Mosquitto Broker → ESP32          │
│    │           │                                                   │
│    │           └──→ websocket/manager.py  (Broadcast Events)      │
│    │                 └──→ Frontend Clients (Real-time Updates)    │
│    │                                                               │
│    └──→ Response (JSON)                                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  MQTT Message Flow (ESP32 → Backend → Frontend):                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ESP32 Device                                                       │
│    │                                                                │
│    ├──→ Mosquitto Broker (kaiser/god/esp/{id}/sensor/...)         │
│    │     │                                                         │
│    │     └──→ mqtt/client.py       (Receive Message)              │
│    │           │                                                   │
│    │           └──→ mqtt/subscriber.py  (Route by Topic Pattern)  │
│    │                 │                                             │
│    │                 ├──→ mqtt/handlers/sensor_handler.py          │
│    │                 │     ├──→ services/sensor_service.py         │
│    │                 │     │     ├──→ sensors/library_loader.py    │
│    │                 │     │     │     └──→ sensor_libraries/active/*.py │
│    │                 │     │     │                                │
│    │                 │     │     └──→ db/repositories/sensor_repo.py │
│    │                 │     │           └──→ db/models/sensor.py    │
│    │                 │     │                 └──→ PostgreSQL (INSERT) │
│    │                 │     │                                       │
│    │                 │     ├──→ services/logic_engine.py          │
│    │                 │     │     └──→ Evaluate Rules → Trigger Actions │
│    │                 │     │                                       │
│    │                 │     └──→ websocket/manager.py              │
│    │                 │           └──→ Frontend (Real-time Update)  │
│    │                 │                                             │
│    │                 ├──→ mqtt/handlers/actuator_handler.py        │
│    │                 │     └──→ Update actuator_states → WebSocket │
│    │                 │                                             │
│    │                 ├──→ mqtt/handlers/heartbeat_handler.py       │
│    │                 │     └──→ Update esp_devices.last_heartbeat  │
│    │                 │                                             │
│    │                 └──→ mqtt/handlers/config_handler.py          │
│    │                       └──→ Config ACK Processing              │
│    │                                                               │
│    └──← Mosquitto Broker (kaiser/god/esp/{id}/actuator/.../command) │
│          │                                                         │
│          └──← mqtt/publisher.py                                    │
│                └──← services/actuator_service.py                   │
│                      └──← api/v1/actuators.py (User Command)      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Cross-ESP Logic Flow (Automation):                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Sensor Data (ESP-002, GPIO 34, Value > 25°C)                      │
│    │                                                                │
│    └──→ mqtt/handlers/sensor_handler.py                            │
│          │                                                          │
│          └──→ services/logic_engine.py  (Background Task)          │
│                ├── Load enabled rules from DB                      │
│                ├── Find matching rules (by trigger)                │
│                ├── Evaluate conditions (temperature > 25)          │
│                ├── Check time constraints                          │
│                ├── Check cooldown                                  │
│                │                                                   │
│                └──→ Execute Actions:                               │
│                      └──→ services/actuator_service.py             │
│                            └──→ mqtt/publisher.py                  │
│                                  └──→ ESP-001, GPIO 5, ON (Pump)  │
│                                        │                           │
│                                        └──→ Log Execution History  │
│                                              └──→ db/repositories/logic_repo.py │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  God AI Integration Flow:                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  God Layer (External AI Server, Port 8001)                         │
│    │                                                                │
│    ├──→ POST /api/v1/ai/recommendation                             │
│    │     └──→ api/v1/ai.py                                         │
│    │           └──→ services/ai_service.py                         │
│    │                 ├──→ db/repositories/ai_repo.py (Store)       │
│    │                 ├──→ Check if auto_action_enabled             │
│    │                 ├──→ If yes: services/actuator_service.py     │
│    │                 └──→ websocket/manager.py (Notify Frontend)   │
│    │                                                                │
│    └──← Background Task: Send Batch Data                           │
│          └──← services/ai_service.py                               │
│                └──← services/god_client.py (HTTP POST)             │
│                      └──← POST god_url/api/ingest/sensor_data      │
│                            └──← Aggregated Sensor Data (last 24h)  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 📊 Modul-Abhängigkeits-Matrix

| Modul | Konsumiert von (←) | Kommuniziert mit (→) | Priorität |
|-------|-------------------|---------------------|-----------|
| `main.py` | - | → alle Module (Init) | 🔴 KRITISCH |
| `core/config.py` | ← alle Module | → .env | 🔴 KRITISCH |
| `core/security.py` | ← api/deps.py | → JWT, bcrypt | 🔴 KRITISCH |
| `db/session.py` | ← api/deps.py | → PostgreSQL | 🔴 KRITISCH |
| `db/repositories/*` | ← services/* | → db/models/* | 🔴 KRITISCH |
| `services/sensor_service.py` | ← api/v1/sensors.py | → sensor_repo, library_loader | 🔴 KRITISCH |
| `services/actuator_service.py` | ← api/v1/actuators.py | → actuator_repo, mqtt/publisher | 🔴 KRITISCH |
| `services/logic_engine.py` | ← mqtt/handlers | → actuator_service, logic_repo | 🔴 KRITISCH |
| `mqtt/client.py` | ← main.py | → Mosquitto | 🔴 KRITISCH |
| `mqtt/subscriber.py` | ← mqtt/client.py | → mqtt/handlers/* | 🔴 KRITISCH |
| `mqtt/publisher.py` | ← services/* | → mqtt/client.py | 🔴 KRITISCH |
| `mqtt/handlers/sensor_handler.py` | ← mqtt/subscriber | → sensor_service, logic_engine | 🔴 KRITISCH |
| `websocket/manager.py` | ← services/*, mqtt/handlers | → Frontend | 🔴 KRITISCH |
| `sensors/library_loader.py` | ← services/sensor_service | → sensor_libraries/*.py | 🔴 KRITISCH |
| `api/v1/*.py` | ← Frontend | → services/* | 🔴 KRITISCH |
| `services/kaiser_service.py` | ← api/v1/kaiser.py | → kaiser_repo | 🟡 HOCH |
| `services/library_service.py` | ← api/v1/library.py | → library_repo, mqtt/publisher | 🟢 MITTEL |
| `services/ai_service.py` | ← api/v1/ai.py | → god_client, ai_repo | 🟢 MITTEL |

---

## PRIORITÄTS-SYSTEM

**Jedes Modul/Feature ist nach Kritikalität klassifiziert:**

### 🔴 KRITISCH (System kann NICHT ohne funktionieren)

**Definition:** Essentiell für Basis-Funktionalität. Ohne diese Module startet der Server nicht oder Core-Features (Sensor-Processing, Actuator-Control, MQTT) funktionieren nicht.

**Module:**
- `main.py` - Entry Point
- `core/config.py`, `core/security.py` - Grundlegende Infrastruktur
- `db/session.py`, `db/models/*` - Datenbank-Layer
- `db/repositories/esp_repo.py`, `sensor_repo.py`, `actuator_repo.py` - Core Data Access
- `api/deps.py` - API Dependencies
- `api/v1/auth.py`, `esp.py`, `sensors.py`, `actuators.py` - Core Endpoints
- `services/esp_service.py`, `sensor_service.py`, `actuator_service.py` - Core Business Logic
- `services/logic_engine.py`, `safety_service.py` - Automation + Safety
- `mqtt/client.py`, `subscriber.py`, `publisher.py` - MQTT Infrastructure
- `mqtt/handlers/sensor_handler.py`, `actuator_handler.py` - Core MQTT Handlers
- `websocket/manager.py` - Real-time Communication
- `sensors/library_loader.py` - Dynamic Library Loading
- `sensor_libraries/active/temperature.py`, `ph_sensor.py`, `ec_sensor.py` - Core Sensor Types

**Implementierungs-Reihenfolge:** Phase 1-4 (Woche 1-8)

---

### 🟡 HOCH (Wichtige Features, aber nicht essentiell für Start)

**Definition:** Wichtige Features für Produktions-Betrieb, aber System kann temporär ohne funktionieren. Benötigt für fortgeschrittene Features (Kaiser-Hierarchie, Automation-Rules).

**Module:**
- `core/logging_config.py`, `validators.py` - Logging + Validation
- `db/models/logic.py`, `kaiser.py` - Logic Rules + Kaiser Management
- `db/repositories/logic_repo.py`, `kaiser_repo.py`, `system_config_repo.py`
- `api/v1/logic.py`, `kaiser.py`, `health.py` - Advanced Endpoints
- `services/logic_service.py`, `kaiser_service.py`, `health_service.py`
- `mqtt/topics.py` - Topic Helpers
- `mqtt/handlers/heartbeat_handler.py`, `config_handler.py`, `kaiser_handler.py`
- `sensor_libraries/active/moisture.py`, `pressure.py` - Additional Sensor Types
- `tests/conftest.py`, `tests/unit/*` - Testing Infrastructure

**Implementierungs-Reihenfolge:** Phase 5 (Woche 9-10)

---

### 🟢 MITTEL (Zusatzfeatures, Nice-to-Have)

**Definition:** Optionale Features, die System-Wert erhöhen aber nicht kritisch sind. Können in späteren Versionen ergänzt werden.

**Module:**
- `db/models/library.py`, `ai.py` - Library Metadata + AI Predictions
- `db/repositories/library_repo.py`, `ai_repo.py`
- `api/v1/library.py`, `ai.py` - Library Distribution + AI Integration
- `services/library_service.py`, `ai_service.py`, `god_client.py`
- `mqtt/handlers/discovery_handler.py` - ESP32 Network Discovery
- `sensor_libraries/active/co2.py`, `light.py`, `flow.py` - Specialized Sensors
- `scripts/*` - Utility Scripts (Backup, Cleanup, etc.)
- `utils/*` - Helper Functions
- `docs/*` - Documentation

**Implementierungs-Reihenfolge:** Phase 6 (Woche 11-12)

---

## DETAILLIERTE DATEISTRUKTUR-ÜBERSICHT

**Vollständige Struktur mit Prioritäten und Kommunikation:**

```
god_kaiser_server/
│
├── 📄 pyproject.toml                          # 🔴 Poetry Dependencies
├── 📄 poetry.lock                             # Generated
├── 📄 .env.example                            # 🔴 Environment Template
├── 📄 Dockerfile                              # 🟡 Container Definition
├── 📄 docker-compose.yml                      # 🟡 Local Dev Stack
├── 📄 alembic.ini                             # 🔴 Migration Config
├── 📄 pytest.ini                              # 🟡 Test Configuration
├── 📄 .gitignore                              # 🔴
├── 📄 README.md                               # 🟡 Main Documentation
│
├── 📁 src/                                    # SOURCE CODE ROOT
│   │
│   ├── 📄 main.py                             # 🔴 APPLICATION ENTRY POINT
│   │   └── Kommunikation: → alle Module (Startup)
│   │
│   ├── 📁 core/                               # 🔴 CORE CONFIGURATION
│   │   ├── config.py                          # 🔴 Settings (Pydantic)
│   │   ├── security.py                        # 🔴 JWT, TLS, Passwords
│   │   ├── logging_config.py                  # 🟡 Structured Logging
│   │   ├── exceptions.py                      # 🟡 Custom Exceptions
│   │   ├── constants.py                       # 🟢 System Constants
│   │   └── validators.py                      # 🟡 Input Validation
│   │
│   ├── 📁 api/                                # 🔴 REST API LAYER
│   │   ├── deps.py                            # 🔴 Dependency Injection
│   │   └── 📁 v1/
│   │       ├── auth.py                        # 🔴 Authentication + MQTT Auth
│   │       ├── esp.py                         # 🔴 ESP Management
│   │       ├── sensors.py                     # 🔴 Sensor Endpoints
│   │       ├── actuators.py                   # 🔴 Actuator Endpoints
│   │       ├── logic.py                       # 🟡 Logic Rules
│   │       ├── kaiser.py                      # 🟡 Kaiser Management
│   │       ├── library.py                     # 🟢 Library Distribution
│   │       ├── ai.py                          # 🟢 AI Integration
│   │       └── health.py                      # 🟡 Health Checks
│   │
│   ├── 📁 services/                           # 🔴 BUSINESS LOGIC
│   │   ├── esp_service.py                     # 🔴
│   │   ├── sensor_service.py                  # 🔴
│   │   ├── actuator_service.py                # 🔴
│   │   ├── safety_service.py                  # 🔴 Safety Checks
│   │   ├── logic_service.py                   # 🟡 Rule Management
│   │   ├── logic_engine.py                    # 🔴 Execution Engine
│   │   ├── kaiser_service.py                  # 🟡
│   │   ├── library_service.py                 # 🟢
│   │   ├── ai_service.py                      # 🟢
│   │   ├── god_client.py                      # 🟢 HTTP to God
│   │   └── health_service.py                  # 🟡
│   │
│   ├── 📁 mqtt/                               # 🔴 MQTT LAYER
│   │   ├── client.py                          # 🔴 MQTT Client Wrapper
│   │   ├── subscriber.py                      # 🔴 Topic Router
│   │   ├── publisher.py                       # 🔴 Command Sender
│   │   ├── topics.py                          # 🟡 Topic Helpers
│   │   └── 📁 handlers/
│   │       ├── sensor_handler.py              # 🔴
│   │       ├── actuator_handler.py            # 🔴
│   │       ├── heartbeat_handler.py           # 🟡
│   │       ├── config_handler.py              # 🟡
│   │       ├── kaiser_handler.py              # 🟡
│   │       └── discovery_handler.py           # 🟢
│   │
│   ├── 📁 websocket/                          # 🔴 WEBSOCKET LAYER
│   │   └── manager.py                         # 🔴 WebSocket Manager
│   │
│   ├── 📁 db/                                 # 🔴 DATABASE LAYER
│   │   ├── base.py                            # 🔴 SQLAlchemy Base
│   │   ├── session.py                         # 🔴 Session Management
│   │   ├── 📁 models/                         # 🔴 ALL MODELS
│   │   │   ├── user.py                        # 🔴
│   │   │   ├── esp.py                         # 🔴
│   │   │   ├── sensor.py                      # 🔴
│   │   │   ├── actuator.py                    # 🔴
│   │   │   ├── kaiser.py                      # 🟡
│   │   │   ├── logic.py                       # 🟡
│   │   │   ├── library.py                     # 🟢
│   │   │   ├── ai.py                          # 🟢
│   │   │   └── system.py                      # 🟡
│   │   └── 📁 repositories/                   # 🔴 REPOSITORY PATTERN
│   │       ├── base_repo.py                   # 🔴 Generic Repository[T]
│   │       ├── user_repo.py                   # 🔴
│   │       ├── esp_repo.py                    # 🔴
│   │       ├── sensor_repo.py                 # 🔴
│   │       ├── actuator_repo.py               # 🔴
│   │       ├── kaiser_repo.py                 # 🟡
│   │       ├── logic_repo.py                  # 🟡
│   │       ├── library_repo.py                # 🟢
│   │       ├── ai_repo.py                     # 🟢
│   │       └── system_config_repo.py          # 🟡
│   │
│   ├── 📁 sensors/                            # 🔴 SENSOR PROCESSING
│   │   ├── library_loader.py                  # 🔴 Dynamic Loader
│   │   ├── base_processor.py                  # 🟡 Base Interface
│   │   └── 📁 sensor_libraries/active/
│   │       ├── temperature.py                 # 🔴 (SHT31, DS18B20, DHT22)
│   │       ├── humidity.py                    # 🔴
│   │       ├── ph_sensor.py                   # 🔴
│   │       ├── ec_sensor.py                   # 🔴
│   │       ├── moisture.py                    # 🟡
│   │       ├── pressure.py                    # 🟡
│   │       ├── co2.py                         # 🟢
│   │       ├── light.py                       # 🟢
│   │       └── flow.py                        # 🟢
│   │
│   ├── 📁 schemas/                            # 🔴 PYDANTIC SCHEMAS
│   │   ├── common.py                          # 🔴 Base Schemas
│   │   ├── auth.py                            # 🔴
│   │   ├── esp.py                             # 🔴
│   │   ├── sensor.py                          # 🔴
│   │   ├── actuator.py                        # 🔴
│   │   ├── kaiser.py                          # 🟡
│   │   ├── logic.py                           # 🟡
│   │   ├── library.py                         # 🟢
│   │   ├── ai.py                              # 🟢
│   │   └── health.py                          # 🟡
│   │
│   └── 📁 utils/                              # 🟢 UTILITIES
│       ├── mqtt_helpers.py                    # 🟡
│       ├── time_helpers.py                    # 🟡
│       ├── data_helpers.py                    # 🟡
│       └── network_helpers.py                 # 🟢
│
├── 📁 alembic/                                # 🔴 DATABASE MIGRATIONS
│   ├── env.py                                 # 🔴
│   └── 📁 versions/
│       └── 001_initial_schema.py              # 🔴
│
├── 📁 scripts/                                # 🟢 UTILITY SCRIPTS
│   ├── init_db.py                             # 🟡 DB Initialization
│   ├── create_admin.py                        # 🟡 Admin Creation
│   ├── backup_db.py                           # 🟢 Backup
│   ├── restore_db.py                          # 🟢 Restore
│   ├── cleanup_old_data.py                    # 🟢 Retention Cleanup
│   ├── generate_certificates.py               # 🟡 TLS Certs
│   ├── test_mqtt.py                           # 🟢 MQTT Test
│   └── migrate_from_old.py                    # 🟡 Migration Script
│
├── 📁 tests/                                  # 🟡 TEST SUITE
│   ├── conftest.py                            # 🟡 Pytest Fixtures
│   ├── 📁 unit/                               # 🟡 Unit Tests
│   ├── 📁 integration/                        # 🟡 Integration Tests
│   ├── 📁 esp32/                              # 🟡 ESP32 Mock Tests
│   └── 📁 e2e/                                # 🟡 End-to-End Tests
│
├── 📁 config/                                 # 🟡 CONFIGURATION
│   └── logging.yaml                           # 🟡 Logging Config
│
├── 📁 certificates/                           # 🟡 TLS CERTIFICATES
│   ├── ca.crt                                 # 🟡
│   ├── server.crt                             # 🟡
│   └── 📁 clients/
│
├── 📁 logs/                                   # Runtime Logs (gitignored)
│
└── 📁 docs/                                   # 🟢 DOCUMENTATION
    ├── ARCHITECTURE.md                        # 🟡
    ├── API.md                                 # 🟢
    ├── MQTT_TOPICS.md                         # 🟡
    ├── DEPLOYMENT.md                          # 🟢
    ├── TESTING.md                             # 🟢
    └── 📁 diagrams/
```

---

## VALIDIERUNGS-CHECKLISTE

Bei jedem Implementierungs-Schritt überprüfen:

### MQTT-Konformität:
- [ ] Topic-Pattern korrekt (Mqtt_Protocoll.md)
- [ ] Message-Format validiert (JSON-Schema)
- [ ] QoS-Level korrekt gesetzt
- [ ] Error-Handling implementiert
- [ ] Reconnect-Logic funktioniert

### Architektur-Konformität:
- [ ] Modul-Separation eingehalten (<500 Zeilen)
- [ ] Single Responsibility Principle
- [ ] Dependency Injection verwendet
- [ ] Type Hints vollständig
- [ ] Docstrings vorhanden

### Funktionale Anforderungen:
- [ ] Pi-Enhanced Processing funktioniert
- [ ] Actuator-Commands werden korrekt gesendet
- [ ] Dynamic Configuration funktioniert
- [ ] Cross-ESP Logic-Rules funktionieren
- [ ] WebSocket Real-time Updates funktionieren

### Performance & Stabilität:
- [ ] Sensor-Processing <200ms
- [ ] Circuit Breaker aktiv
- [ ] Graceful Degradation bei Fehlern
- [ ] Memory-Leaks gecheckt
- [ ] Load-Tests bestanden

### Testing:
- [ ] Unit-Tests >80% Coverage
- [ ] Integration-Tests grün
- [ ] ESP32-Mock-Tests grün
- [ ] E2E-Tests grün
- [ ] Performance-Tests grün

---

## RELEVANTE QUELL-DOKUMENTE (IMMER REFERENZIEREN)

### El Trabajante (ESP32 Firmware - Vorgaben):
- `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT-Topic-Hierarchie + Message-Formate
- `El Trabajante/docs/System_Overview.md` - Server-Centric Architektur
- `El Trabajante/docs/API_REFERENCE.md` - ESP32 API-Spezifikation
- `El Trabajante/docs/system-flows/*.md` - Workflow-Diagramme
- `El Trabajante/docs/Dynamic Zones and Provisioning/*.md` - Zone-Management

### Pi Server ALT (Alter Code - zu migrieren):
- `El Servador/pi_server_ALT/GOD_KAISER_SERVER_IMPLEMENTIERUNGS_PLAN.md` - Architektur-Plan
- `El Servador/pi_server_ALT/GOD_KAISER_SERVER_TEIL_2_REST_API_UND_MEHR.md` - API-Spezifikation
- `El Servador/pi_server_ALT/main.py` - Bestehende MQTT-Handler (zu extrahieren)
- `El Servador/pi_server_ALT/i2c_sensor_processor.py` - Sensor-Processing-Logic
- `El Servador/pi_server_ALT/database_manager.py` - DB-Schema + Operations
- `El Servador/pi_server_ALT/sensor_libraries/active/*.py` - 10 Sensor-Libraries

### Test-Spezifikationen:
- `El Trabajante/test/_archive/README.md` - Test-Kategorien
- `El Servador/docs/ESP32_TESTING.md` - Test-Framework-Design

### Verwandte Claude-Dokumentation:
- `.claude/WORKFLOW_PATTERNS.md` - ESP32 Development Workflows (Sensor/Actuator hinzufügen)
- `.claude/ARCHITECTURE_DEPENDENCIES.md` - ESP32 Architektur-Abhängigkeiten
- `.claude/TEST_WORKFLOW.md` - Test-Workflows

---

## EXEKUTIONS-PRINZIPIEN

1. **Inkrementell:** Jedes Modul einzeln implementieren, testen, validieren
2. **Test-First:** Tests schreiben BEVOR Code implementiert wird
3. **Dokumentations-First:** Docstrings + Type Hints parallel zum Code
4. **Continuous Validation:** Nach jedem Schritt gegen Checkliste prüfen
5. **Relevanz-Fokus:** Nur Code schreiben, der in Dokumentation spezifiziert ist
6. **Industrial-Grade:** Code muss production-ready, wartbar, erweiterbar sein

---

## OUTPUT-ERWARTUNG

Nach Abschluss sollte der Server:

✅ Vollständig modular und testbar sein  
✅ 100% MQTT-Protokoll-konform (Mqtt_Protocoll.md)  
✅ Pi-Enhanced Sensor-Processing unterstützen  
✅ REST API für Frontend/External Services bieten  
✅ WebSocket Real-time Updates senden  
✅ Cross-ESP Automation-Engine haben  
✅ Circuit Breaker + Error-Recovery implementieren  
✅ >80% Test-Coverage haben  
✅ Docker-deploybar sein  
✅ Production-ready Monitoring haben  

---

## ZUSAMMENFASSUNG DER COMMAND-VERBESSERUNGEN

**Dieser Command wurde mit folgenden Ergänzungen optimiert:**

### ✅ Neu Hinzugefügt (aus detailliertem Implementierungs-Plan):

1. **Erweiterte API-Endpoints:**
   - MQTT Authentication Configuration (`POST /auth/mqtt/configure`)
   - ESP Assignment to Kaiser (`POST /devices/{esp_id}/assign_kaiser`)
   - Sensor Calibration (`POST /sensors/{esp_id}/{gpio}/calibrate`)
   - Logic Rule Testing (`POST /logic/rules/{rule_id}/test`)
   - Library Installation Status Tracking

2. **6-Phasen Migrations-Strategie (12 Wochen):**
   - Phase 1-2: Foundation + Data Layer (Woche 1-4)
   - Phase 3: Business Logic + Sensor Processing (Woche 5-6)
   - Phase 4: Communication Layer (MQTT + WebSocket) (Woche 7-8)
   - Phase 5: API Layer (REST Endpoints) (Woche 9-10)
   - Phase 6: Production-Ready (Scripts, Tests, Docs) (Woche 11-12)

3. **Kommunikations-Matrix:**
   - Visuelle Darstellung aller Datenflüsse (HTTP, MQTT, WebSocket)
   - Modul-Abhängigkeits-Tabelle mit Prioritäten
   - Klare Pfade: Frontend → API → Service → Repository → DB
   - MQTT-Flow: ESP → Broker → Handler → Service → DB → WebSocket

4. **3-Stufen Prioritäts-System:**
   - 🔴 KRITISCH: Essentiell für Basis-Funktionalität (Phase 1-4)
   - 🟡 HOCH: Wichtig für Production, aber nicht essentiell (Phase 5)
   - 🟢 MITTEL: Nice-to-Have, kann später ergänzt werden (Phase 6)

5. **Detaillierte Dateistruktur-Übersicht:**
   - Jede Datei mit Priorität markiert
   - Kommunikations-Richtungen dokumentiert (← Konsumiert von, → Kommuniziert mit)
   - Vollständige Ordnerstruktur mit allen Dateien

6. **Utility Scripts (scripts/):**
   - `init_db.py` - Database Initialization + Seed Data
   - `backup_db.py` / `restore_db.py` - Backup/Restore
   - `cleanup_old_data.py` - Retention Policy Enforcement
   - `generate_certificates.py` - TLS Certificate Management
   - `migrate_from_old.py` - Migration von pi_server_ALT

7. **Erweiterte Repository-Spezifikationen:**
   - Alle Repository-Funktionen spezifiziert
   - Spezielle Methoden für jeden Repository-Typ
   - Bulk-Operations (insert_bulk, cleanup_old_data)
   - Query-Helpers (query_range, get_latest, aggregate_hourly)

8. **Detaillierte Deliverables pro Phase:**
   - Checkboxen für jede Phase
   - Klare Erfolgskriterien
   - Test-Coverage-Anforderungen
   - Performance-Benchmarks

### 🎯 Command-Fokus:

Dieser Command ist **präzise genug** für Claude, um:
- ✅ Architektur-Vorgaben zu verstehen
- ✅ Kommunikationsmuster zu implementieren
- ✅ Prioritäten richtig zu setzen
- ✅ Phasen-Reihenfolge einzuhalten
- ✅ MQTT-Protokoll exakt umzusetzen
- ✅ Testing-Standards zu erfüllen
- ✅ Alle relevanten Dokumente zu referenzieren

Aber **flexibel genug** für:
- ✅ Integration mit deinem separaten Implementierungs-Plan
- ✅ Anpassungen basierend auf spezifischen Code-Findings im pi_server_ALT
- ✅ Iterative Verbesserungen während der Implementation

---

**Wichtig:** Dieser Command ist das Framework. Der detaillierte Implementierungs-Plan mit Code-Spezifikationen für jede Funktion liegt separat vor und wird während der Implementierung herangezogen.

---

**Letzte Aktualisierung:** 2025-11-26  
**Version:** 1.0

