# Automation-One IoT Framework

> **Für Claude Code:** Optimierte Projekt-Dokumentation für AI-gestützte Entwicklung

## 📋 Projekt-Übersicht

**Typ:** Modulares IoT Framework für ESP32-basierte Sensor/Aktor-Netzwerke
**Architektur:** 4-Schichten (God → God-Kaiser → Kaiser → ESP32)
**Hauptkomponenten:** 2 Module
**Sprachen:** C++ (Arduino/ESP-IDF), Python (FastAPI)
**Build-Systeme:** PlatformIO, Poetry
**Version:** El Servador 5.0.0, El Trabajante (siehe Roadmap)

---

## 🚀 Schnellstart-Befehle

### El Trabajante (ESP32 Firmware)

```bash
cd "El Trabajante"

# Build für XIAO ESP32-C3 (10 Sensoren, 6 Aktoren)
pio run -e seeed_xiao_esp32c3

# Build für ESP32 Dev Board (20 Sensoren, 12 Aktoren)
pio run -e esp32_dev

# Unit Tests ausführen
pio test

# Flash auf Device
pio run -e seeed_xiao_esp32c3 -t upload

# Serial Monitor
pio device monitor

# Code-Checks
pio check --fail-on-defect=low
```

**PlatformIO Environments:**
- `seeed_xiao_esp32c3` - XIAO ESP32-C3 (kleineres Board, limitierter Speicher)
- `esp32_dev` - ESP32-WROOM Development Board (mehr Ressourcen)

### El Servador (God-Kaiser Server)

```bash
cd "El Servador"

# Dependencies installieren
poetry install

# Tests ausführen
poetry run pytest -v

# Test Coverage
poetry run pytest --cov=god_kaiser_server --cov-report=html

# Server starten (Development)
poetry run uvicorn god_kaiser_server.src.main:app --host 0.0.0.0 --port 8000 --reload

# Code Formatting
poetry run black god_kaiser_server/
poetry run ruff check god_kaiser_server/

# Database Migrations
poetry run alembic upgrade head

# Admin User erstellen
poetry run python god_kaiser_server/scripts/create_admin.py
```

---

## 🏗️ Architektur

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: God (Raspberry Pi 5)                               │
│ Rolle: KI/Analytics, Predictions, Model Training            │
│ Port: 8001 (HTTP REST)                                      │
│ Tech: Python, TensorFlow/PyTorch, Pandas                    │
└─────────────────────────────────────────────────────────────┘
                          ↕ HTTP REST API
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: God-Kaiser (Raspberry Pi 5)                        │
│ Rolle: Control Hub, MQTT Broker, Database, Logic Engine     │
│ Ports: 8000 (HTTP/WebSocket), 8883 (MQTT TLS)              │
│ Tech: FastAPI, PostgreSQL, Mosquitto, SQLAlchemy            │
└─────────────────────────────────────────────────────────────┘
                          ↕ MQTT Bridge (TLS)
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Kaiser (Raspberry Pi Zero) - OPTIONAL              │
│ Rolle: Relay Node für Skalierung (100+ ESPs)                │
│ Ports: 1883 (Local MQTT), 8080 (HTTP)                      │
└─────────────────────────────────────────────────────────────┘
                          ↕ MQTT (TLS optional)
┌─────────────────────────────────────────────────────────────┐
│ LAYER 4: ESP32-Agenten (WROOM/XIAO C3)                     │
│ Rolle: Sensor-Auslesung, Aktor-Steuerung                    │
│ Tech: C++/Arduino, WiFi, MQTT Client, NVS Storage           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 Projektstruktur

```
Automation-One/
├── El Trabajante/                    # ESP32 Firmware (C++/Arduino)
│   ├── src/
│   │   ├── core/                     # Application, MainLoop, SystemController
│   │   ├── drivers/                  # GPIO, I2C, OneWire, PWM
│   │   ├── services/
│   │   │   ├── communication/        # MQTT, HTTP, WebServer, WiFi, Discovery
│   │   │   ├── sensor/               # SensorManager, Factory, Drivers, Pi-Enhanced
│   │   │   ├── actuator/             # ActuatorManager, Drivers, SafetyController
│   │   │   ├── config/               # ConfigManager, StorageManager, LibraryManager
│   │   │   └── provisioning/         # ProvisionManager (Dynamic Zones)
│   │   ├── models/                   # Types, States, Messages, Error Codes
│   │   ├── utils/                    # Logger, TimeManager, DataBuffer, Helpers
│   │   ├── error_handling/           # ErrorTracker, CircuitBreaker, HealthMonitor
│   │   └── config/                   # SystemConfig, HardwareConfig, FeatureFlags
│   ├── test/                         # Unit Tests
│   ├── docs/                         # ESP32-spezifische Dokumentation
│   └── platformio.ini                # Build-Konfiguration
│
├── El Servador/                      # God-Kaiser Server (Python/FastAPI)
│   └── god_kaiser_server/
│       ├── src/
│       │   ├── core/                 # Config, Security, Logging, Exceptions
│       │   ├── api/v1/               # REST Endpoints
│       │   ├── services/             # Business Logic Services
│       │   ├── mqtt/                 # MQTT Client, Publisher, Subscriber, Handlers
│       │   ├── websocket/            # Real-time Manager
│       │   ├── db/
│       │   │   ├── models/           # SQLAlchemy Models
│       │   │   └── repositories/     # Repository Pattern
│       │   ├── sensors/
│       │   │   ├── library_loader.py # Dynamic Import
│       │   │   └── sensor_libraries/active/  # Sensor Processing Libraries
│       │   ├── schemas/              # Pydantic DTOs
│       │   └── utils/                # Helpers
│       ├── scripts/                  # DB Init, Admin, Certificates, Migrations
│       ├── tests/                    # Unit, Integration, E2E Tests
│       ├── docs/                     # Server-spezifische Docs
│       ├── alembic/                  # Database Migrations
│       └── pyproject.toml            # Poetry Dependencies
│
├── docs/                             # Übergreifende Dokumentation
├── CLAUDE.md                         # Diese Datei (AI-optimiert)
└── README.md                         # Hauptdokumentation (Mensch-lesbar)
```

---

## 💡 Kern-Konzepte

### 1. Pi-Enhanced Mode (STANDARD - empfohlen)
- **ESP32 sendet:** Raw ADC-Werte (analogRead/digitalRead)
- **God-Kaiser verarbeitet:** Mit Python Sensor-Libraries
- **ESP32 empfängt:** Verarbeitete Werte zurück
- **Vorteil:** Sofort einsatzbereit, komplexe Algorithmen möglich, zentrale Updates

### 2. OTA Library Mode (OPTIONAL)
- **ESP32 lädt:** C++-Library vom Server (einmalig)
- **ESP32 verarbeitet:** Lokal auf dem Chip
- **Vorteil:** Offline-fähig, schnellere Response
- **Nachteil:** ESP Flash-Verbrauch, Setup-Zeit

### 3. Dynamic Zones & Provisioning
- Hierarchische Zone-Struktur (Master → Sub-Zones)
- Runtime-Konfiguration ohne Code-Änderung
- GPIO-Safe-Mode mit Conflict-Detection

### 4. Cross-ESP Automation Engine
- Multi-ESP Regeln: `IF ESP1.Sensor > X THEN ESP2.Actuator = Y`
- Safety-Limits, Cooldown, Time-Constraints

### 5. Health Monitoring (Phase 7)
- HealthMonitor mit Watchdog-Pattern
- Circuit Breaker für Pi-Enhanced Communication
- MQTT Connection Manager mit Auto-Reconnect
- Error-Tracking und Recovery-Strategien

---

## 🔧 Wichtige Technologien

### ESP32 (El Trabajante)
- **Framework:** Arduino (ESP-IDF kompatibel)
- **Build:** PlatformIO
- **MQTT:** PubSubClient
- **JSON:** ArduinoJson 6.x
- **Storage:** NVS (encrypted)
- **Sensor-Libs:** OneWire, DallasTemperature, Adafruit Unified Sensor

### Server (El Servador)
- **Framework:** FastAPI 0.104+
- **ORM:** SQLAlchemy 2.0
- **Database:** PostgreSQL (Prod) / SQLite (Dev)
- **MQTT:** Paho-MQTT 1.6+
- **Validation:** Pydantic 2.5+
- **Auth:** python-jose + passlib (JWT, bcrypt)
- **Async:** asyncio + asyncpg
- **Testing:** pytest, pytest-asyncio, pytest-cov

---

## 📡 MQTT Topics Schema

**ESP → God-Kaiser:**
```
kaiser/god/esp/{esp_id}/sensor/{gpio}/data          # Sensor-Daten
kaiser/god/esp/{esp_id}/actuator/{gpio}/status      # Aktor-Status
kaiser/god/esp/{esp_id}/health/status               # Health-Status
kaiser/god/esp/{esp_id}/system/status               # System-Info
```

**God-Kaiser → ESP:**
```
kaiser/god/esp/{esp_id}/actuator/{gpio}/command     # Aktor-Befehle
kaiser/god/esp/{esp_id}/config/sensor/{gpio}        # Sensor-Config
kaiser/god/esp/{esp_id}/config/actuator/{gpio}      # Aktor-Config
kaiser/god/esp/{esp_id}/system/command              # System-Befehle
```

---

## 📖 Dokumentations-Navigation

### ESP32 Development:
- **System Flows:** `El Trabajante/docs/system-flows/` (8 Flows)
  - 01: Boot Sequence
  - 02: Sensor Reading Flow
  - 03: Actuator Command Flow
  - 04/05: Runtime Config Flows
  - 06: MQTT Message Routing
  - 07: Error Recovery Flow
  - 08: Zone Assignment Flow
- **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`
- **API Reference:** `El Trabajante/docs/API_REFERENCE.md`
- **NVS Keys:** `El Trabajante/docs/NVS_KEYS.md`
- **Roadmap:** `El Trabajante/docs/Roadmap.md`

### Server Development:
- **Architecture:** `El Servador/god_kaiser_server/docs/ARCHITECTURE.md`
- **API Docs:** `El Servador/god_kaiser_server/docs/API.md`
- **MQTT Topics:** `El Servador/god_kaiser_server/docs/MQTT_TOPICS.md`
- **Security:** `El Servador/god_kaiser_server/docs/SECURITY.md`
- **Testing:** `El Servador/god_kaiser_server/docs/TESTING.md`
- **Deployment:** `El Servador/god_kaiser_server/docs/DEPLOYMENT.md`

### Provisioning & Zones:
- **Design:** `El Trabajante/docs/Dynamic Zones and Provisioning/PROVISIONING_DESIGN.md`
- **Analysis:** `El Trabajante/docs/Dynamic Zones and Provisioning/ANALYSIS.md`
- **Implementation:** `El Trabajante/docs/Dynamic Zones and Provisioning/DYNAMIC_ZONES_IMPLEMENTATION.md`
- **Integration:** `El Trabajante/docs/Dynamic Zones and Provisioning/INTEGRATION_GUIDE.md`

---

## 🧪 Testing-Strategie

### ESP32 Tests:
```bash
cd "El Trabajante"
pio test -e seeed_xiao_esp32c3  # XIAO Tests
pio test -e esp32_dev           # ESP32 Dev Tests
```

**Test-Typen:**
- Unit Tests für Core-Komponenten
- Hardware-Mock-Tests
- Integration Tests (MQTT, HTTP)

### Server Tests:
```bash
cd "El Servador"
poetry run pytest tests/unit/              # Unit Tests
poetry run pytest tests/integration/       # Integration Tests
poetry run pytest tests/e2e/               # E2E Tests (requires running server)
poetry run pytest --cov                     # Mit Coverage
```

---

## 🔐 Feature Flags (ESP32)

Wichtige Build-Flags in `platformio.ini`:
- `DYNAMIC_LIBRARY_SUPPORT=1` - OTA Library Support
- `HIERARCHICAL_ZONES=1` - Zone-System aktiviert
- `OTA_LIBRARY_ENABLED=1` - OTA Updates erlaubt
- `SAFE_MODE_PROTECTION=1` - GPIO Safe-Mode
- `ZONE_MASTER_ENABLED=1` - Zone-Master-Funktionalität
- `CONFIG_ENABLE_THREAD_SAFETY` - Mutex-Schutz (Phase 6+)

---

## 🚨 Wichtige Hinweise für Claude

### Code-Änderungen:
1. **ESP32:** Immer Feature Flags beachten (`src/config/feature_flags.h`)
2. **Server:** Pi-Enhanced Mode bevorzugen (Standard-Workflow)
3. **MQTT:** Topic-Schema strikt einhalten
4. **Safety:** Aktor-Safety-Constraints beachten
5. **Tests:** Vor jedem Commit Tests ausführen

### Neue Features:
1. **Sensor hinzufügen:**
   - Pi-Enhanced: `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`
   - Keine ESP-Änderung nötig!
2. **Aktor hinzufügen:**
   - ESP Driver: `El Trabajante/src/services/actuator/actuator_drivers/`
   - Factory-Pattern nutzen

### Debugging:
- **ESP32:** Serial Monitor mit `pio device monitor`
- **MQTT:** `mosquitto_sub -h <ip> -p 8883 -t "kaiser/god/#"`
- **Server:** Logs in FastAPI Console

---

## 📊 Aktueller Entwicklungsstand

**Abgeschlossene Phasen:**
- ✅ Phase 1-6: Core System, Sensors, Actuators, Zones, Thread-Safety
- ✅ Phase 7: Health Monitor Implementation

**Aktuelle Phase:**
- Siehe `El Trabajante/docs/Roadmap.md`
- Siehe `El Trabajante/docs/PHASE_7_IMPLEMENTATION_STATUS.md`

---

## 🎯 Workflow-Tipps

### Typische Aufgaben:

**Feature implementieren:**
1. Relevante Docs lesen (siehe Navigation oben)
2. System Flow verstehen
3. Code-Änderungen in beiden Komponenten synchron
4. Tests schreiben
5. MQTT-Kompatibilität prüfen

**Bug fixen:**
1. Error Codes prüfen (`El Trabajante/src/models/error_codes.h`)
2. Logs analysieren (ESP Serial + Server Logs)
3. System Flow nachvollziehen
4. Fix + Test

**Refactoring:**
1. Interface-Contracts beachten (z.B. `ISensorDriver`)
2. Factory-Patterns nutzen
3. Thread-Safety gewährleisten
4. Tests aktualisieren

---

## 🔗 Git Workflow

**Branch-Naming:**
- `feature/<name>` - Neue Features
- `fix/<name>` - Bug-Fixes
- `refactor/<name>` - Code-Refactoring
- `docs/<name>` - Dokumentation
- `claude/<session-id>` - Claude Code Sessions

**Commit-Message-Format:**
```
<type>: <subject>

<body>

<footer>
```

**Types:** feat, fix, docs, refactor, test, chore

---

**Letzte Aktualisierung:** 2025-11-23
**Kontakt:** AutomationOne Team
