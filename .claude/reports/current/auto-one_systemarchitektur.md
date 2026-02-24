# AutomationOne – System-Architektur

> **Version:** 5.1 | **Stand:** 2026-02-23
> **Grundlage:** Vollständige Codebase-Analyse (ESP32 Firmware, FastAPI Server, Vue 3 Frontend)
> **Referenzen:** COMMUNICATION_FLOWS, MQTT_TOPICS, REST_ENDPOINTS, ARCHITECTURE_DEPENDENCIES

---

## 1. Architektur-Übersicht

AutomationOne ist ein dreischichtiges IoT-Framework. Jede Schicht hat eine klar abgegrenzte Verantwortung:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SCHICHT 3: El Frontend (Vue 3 + TypeScript)                          │
│  Aufgabe: Echtzeit-Visualisierung, Konfiguration, Steuerung          │
│  Port: 5173 | WebSocket + REST                                        │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ HTTP REST + WebSocket (Port 8000)
┌────────────────────────────┴────────────────────────────────────────────┐
│  SCHICHT 2: El Servador (FastAPI + Python)                            │
│  Aufgabe: Zentrale Verarbeitung, Datenbank, Logic Engine, Safety      │
│  Port: 8000 | PostgreSQL 5432 | MQTT 1883                            │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ MQTT (Port 1883, Eclipse Mosquitto)
┌────────────────────────────┴────────────────────────────────────────────┐
│  SCHICHT 1: El Trabajante (ESP32-WROOM / XIAO, C++ Arduino)          │
│  Aufgabe: Sensor-Auslesung, Aktor-Steuerung, Rohdaten-Übertragung    │
│  Hardware: GPIO, I2C, OneWire, PWM                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Kernprinzip:** Der Server ist die zentrale Intelligenz. ESP32-Geräte sind "dumme Agenten" – sie erfassen Rohdaten und führen Befehle aus. Alle Logik, Verarbeitung und Entscheidungen liegen auf dem Server. Dieses Prinzip garantiert, dass Firmware-Updates auf den ESP32s fast nie nötig sind: neue Sensoren, neue Regeln, neue Aktoren – alles wird über den Server konfiguriert.

---

## 2. Schicht 1: El Trabajante (ESP32 Firmware)

### 2.1 Überblick

| Eigenschaft | Wert |
|-------------|------|
| **Sprache** | C++ (Arduino Framework, PlatformIO) |
| **Hardware** | ESP32-WROOM-32 (GPIO 0–39) oder XIAO ESP32-C3 (GPIO 0–10, 21) |
| **Source-Dateien** | 100 (42 `.cpp` + 58 `.h`) |
| **Pattern** | Singleton für Manager-Klassen |
| **Pfad** | `El Trabajante/src/` |

### 2.2 Modul-Architektur

```
El Trabajante/src/
├── main.cpp                              # Entry-Point, 16-Schritt Boot-Sequenz (~2.637 Zeilen)
├── core/
│   └── system_controller.h/cpp           # System-State-Machine
├── config/hardware/
│   ├── esp32_dev.h                       # ESP32-WROOM Hardware-Konstanten
│   ├── xiao_esp32c3.h                    # XIAO ESP32-C3 Hardware-Konstanten
│   └── feature_flags.h                   # Compile-Time Feature-Toggles
├── drivers/
│   ├── gpio_manager.h/cpp                # GPIO Safe-Mode, Pin-Reservierung, Subzone-Pins
│   ├── i2c_bus.h/cpp                     # I2C-Bus: Scan, Read/Write, Recovery
│   ├── i2c_sensor_protocol.h/cpp         # I2C Sensor-Protokoll (SHT31, BMP280, BME280)
│   ├── onewire_bus.h/cpp                 # OneWire-Bus: DS18B20 Discovery + Reading
│   ├── pwm_controller.h/cpp              # PWM-Kanal-Management
│   └── hal/                              # GPIO Hardware-Abstraction Interface
├── services/
│   ├── communication/
│   │   ├── mqtt_client.h/cpp             # MQTT: Connect, Publish, Subscribe, Circuit Breaker
│   │   ├── wifi_manager.h/cpp            # WiFi: Connect, Reconnect, Circuit Breaker
│   │   └── http_client.h/cpp             # HTTP-Client für Pi-Enhanced Processing
│   ├── sensor/
│   │   ├── sensor_manager.h/cpp          # Sensor-Registry, Mess-Zyklen, Multi-Bus
│   │   ├── pi_enhanced_processor.h/cpp   # Rohdaten an Server, Fallback-Konvertierung
│   │   └── sensor_factory.h/cpp          # Factory-Pattern für Sensor-Erstellung
│   ├── actuator/
│   │   ├── actuator_manager.h/cpp        # Aktor-Registry, Command-Handling, Factory
│   │   ├── safety_controller.h/cpp       # Emergency-Stop, Subzone-Isolation, Recovery
│   │   └── actuator_drivers/             # PumpActuator, ValveActuator, PWMActuator
│   ├── config/
│   │   ├── config_manager.h/cpp          # NVS-Orchestrierung: Load/Save aller Configs
│   │   ├── storage_manager.h/cpp         # NVS-Zugriffs-Layer (Namespace-Management)
│   │   └── config_response.h/cpp         # Config-Response-Builder (MQTT ACK)
│   └── provisioning/
│       └── provision_manager.h/cpp       # AP-Mode Captive Portal (Ersteinrichtung)
├── error_handling/
│   ├── error_tracker.h/cpp               # Error-Reporting an Server via MQTT
│   ├── circuit_breaker.h/cpp             # CLOSED → OPEN → HALF_OPEN State-Machine
│   └── health_monitor.h/cpp              # Heartbeat-Snapshots, Heap/RSSI-Monitoring
├── utils/
│   ├── topic_builder.h/cpp               # Statische MQTT-Topic-Konstruktion
│   ├── logger.h/cpp                      # Log-System (5 Stufen)
│   ├── time_manager.h/cpp                # NTP-Zeitsynchronisation
│   ├── json_helpers.h                    # JSON-Hilfs-Funktionen
│   └── onewire_utils.h/cpp              # OneWire ROM-Code Konvertierung + Validierung
└── models/
    ├── error_codes.h                     # Error-Codes 1000–4999
    ├── sensor_types.h                    # SensorConfig, SensorReading
    ├── actuator_types.h                  # ActuatorConfig, ActuatorCommand, EmergencyState
    ├── config_types.h                    # ConfigStatus, ConfigFailureItem
    ├── system_types.h                    # SystemState, WiFiConfig, SystemConfig, KaiserZone
    ├── watchdog_types.h                  # WatchdogMode, WatchdogConfig
    └── mqtt_messages.h                   # MQTTMessage-Struct
```

> Vollständige Abhängigkeits-Graphen: `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md`
> Detail-Dokumentation: `.claude/reports/current/auto-one_esparchitektur.md`

### 2.3 Boot-Sequenz (16 Schritte)

Die Firmware durchläuft beim Start eine definierte Sequenz. Jeder Schritt ist in `main.cpp` mit STEP-Kommentaren dokumentiert:

| Schritt | Modul | Was passiert | Fehler-Reaktion |
|---------|-------|-------------|-----------------|
| 1 | Serial | UART 115200 bps initialisieren | Kein Output möglich |
| 2 | Boot Banner | Chip-Model, CPU-Frequenz, Heap anzeigen | – |
| 3 | Boot-Button | GPIO 0 long-press 10s = Factory Reset | NVS löschen, Neustart |
| 4 | **GPIO Safe-Mode** | **Alle Pins auf sicheren Zustand** (INPUT_PULLUP) | Error 1001–1006 |
| 5 | Logger | Logging-System starten | – |
| 6 | Storage | NVS-Zugriffslayer (`storageManager.begin()`) | Error 2001–2005 |
| 7 | Config | Alle Konfigurationen laden (`loadAllConfigs()`) | Error 2010–2014 |
| 8 | Defensive Repair | Inkonsistenten Zustand erkennen und reparieren | SafeMode |
| 9 | Boot-Loop Detect | 5× Reboot in <60s → SafeMode | SafeMode (Infinite Loop) |
| 10 | Watchdog | Init: Provisioning 300s / Production 60s | Error 4070 bei Timeout |
| 11 | Provisioning | Keine Config → AP-Mode Captive Portal | LED-Blink-Pattern |
| 12 | Skip-Check | Bei SAFE_MODE: WiFi/MQTT überspringen | – |
| 13 | Error Tracker | Error-Reporting initialisieren | – |
| 14 | WiFi | Verbinden (Circuit Breaker: 10 Failures → 60s) | Error 3001–3005 |
| 15 | MQTT | Verbinden (Circuit Breaker: 5 Failures → 30s) | Error 3010–3016 |
| 16 | Health Monitor | Sensor/Actuator Manager starten | – |

**Sicherheits-Design:** Schritt 4 (GPIO Safe-Mode) kommt absichtlich **vor** dem Config-Laden. Alle Pins starten in einem sicheren Zustand – unabhängig davon, was die Konfiguration vorschreibt. Erst nach vollständiger Validierung werden Pins für Sensoren oder Aktoren freigegeben.

### 2.4 SafeMode (5 Auslöser)

| Auslöser | Bedingung | Verhalten |
|----------|-----------|-----------|
| Boot-Button 10s | GPIO 0 gedrückt halten | NVS löschen, Neustart (Factory Reset) |
| Boot-Loop | 5× Reboot in <60 Sekunden | SafeMode-Zustand (Endlosschleife, kein WiFi/MQTT) |
| Inkonsistenter State | Provisioning-Flag + gültige Config | Repair oder SafeMode |
| WiFi-Failure | Keine Verbindung möglich | Provisioning-Portal (AP-Mode) |
| AP-Mode-Failure | Portal kann nicht starten | LED 4× Blink → Halt |

### 2.5 Circuit Breaker

| Breaker | Threshold | Recovery | Half-Open |
|---------|-----------|----------|-----------|
| MQTT | 5 Failures | 30s | 10s Test-Versuch |
| WiFi | 10 Failures | 60s | 15s Test-Versuch |
| Pi-Enhanced | 5 Failures | 30s | 10s Test-Versuch |

State-Machine: `CLOSED → OPEN → HALF_OPEN → CLOSED` (oder zurück zu OPEN bei Fehler).
Bei OPEN-State: Publish-Versuche werden blockiert, Offline-Buffer (max 100 Messages) speichert Daten.

### 2.6 Sensor-Architektur

Der ESP32 unterstützt vier Sensor-Schnittstellen:

| Schnittstelle | Sensoren | Identifikation |
|---------------|----------|----------------|
| **Analog** (ADC) | pH, EC, Bodenfeuchte | `esp_id` + `gpio` + `sensor_type` |
| **Digital** | Digitale Eingänge | `esp_id` + `gpio` + `sensor_type` |
| **I2C** | SHT31, BMP280, BME280 | + `i2c_address` (z.B. 0x44, 0x76) |
| **OneWire** | DS18B20 | + `onewire_address` (64-bit ROM-Code) |

**Mehrere Sensoren pro GPIO** sind möglich: Auf einem I2C-Bus (zwei Pins) können mehrere Geräte mit unterschiedlichen Adressen hängen. Auf einem OneWire-Pin können beliebig viele DS18B20 mit ihren eindeutigen ROM-Codes adressiert werden.

**Datenverarbeitung:** Es gibt zwei Modi:

| Modus | Wann | Verarbeitung |
|-------|------|-------------|
| **Pi-Enhanced** (raw_mode: true) | pH, EC, SHT31, DS18B20, Feuchte, CO2, Licht, Druck, Durchfluss | ESP sendet Rohwert → Server verarbeitet mit Sensor-Library |
| **Lokal** (raw_mode: false) | BMP280, BME280 | ESP verarbeitet selbst (Bosch-Kalibrierung benötigt lokale EEPROM-Daten) |

### 2.7 Aktor-Architektur

| Aktor-Typ | Driver-Klasse | Steuerung |
|-----------|---------------|-----------|
| Pumpe | `PumpActuator` | Binary (ON/OFF) + Runtime-Protection |
| Ventil | `ValveActuator` | Binary (ON/OFF) |
| PWM | `PWMActuator` | 0–255 Wert |
| Relay | Nutzt `PumpActuator` | Binary (ON/OFF) |

Aktoren werden per Factory-Pattern erstellt (`ActuatorManager::createDriver()`). Jeder Aktor hat:
- **GPIO-Reservierung** über GPIOManager (Konfliktvermeidung)
- **Emergency-Stop** pro Aktor oder global
- **Safety-Timeout** (automatische Deaktivierung)

### 2.8 NVS-Persistenz (Non-Volatile Storage)

| Namespace | Inhalt | Persistenz |
|-----------|--------|------------|
| `wifi_config` | SSID, Passwort, Server-Adresse, MQTT-Port, MQTT-Credentials | Dauerhaft |
| `zone_config` | Kaiser-Zone, Master-Zone | Dauerhaft |
| `system_config` | ESP-ID, State, Boot-Counter, Log-Level, Approval-Status | Dauerhaft |
| `sensor_config` | GPIO, Typ, Intervall, raw_mode, OneWire/I2C-Adresse pro Sensor | Dauerhaft |
| `actuator_config` | GPIO, Typ, Safety-Config, default_state pro Aktor | Dauerhaft |
| `subzone_config` | Subzone-ID, Name, parent_zone_id, zugewiesene GPIOs | Dauerhaft |

**Nicht persistiert:** Sensor-Messwerte und Aktor-Zustände – diese sind flüchtig und existieren nur im Server.

### 2.9 Error-Codes (ESP32)

| Range | Kategorie | Beispiele |
|-------|-----------|-----------|
| 1001–1006 | Hardware/GPIO | GPIO_RESERVED (1001), GPIO_CONFLICT (1002), GPIO_INIT_FAILED (1003) |
| 1010–1018 | I2C | I2C_INIT_FAILED (1010), DEVICE_NOT_FOUND (1011), BUS_STUCK (1015) |
| 1020–1029 | OneWire | NO_DEVICES (1021), INVALID_ROM (1023) |
| 1030–1032 | PWM | PWM_INIT_FAILED (1030), CHANNEL_FULL (1031) |
| 1040–1053 | Sensor/Actuator | READ_FAILED (1040), SET_FAILED (1050), CONFLICT (1053) |
| 1060–1063 | DS18B20 | SENSOR_FAULT (1060), POWER_ON_RESET (1061), OUT_OF_RANGE (1062) |
| 2000–2999 | Service/Config | NVS_INIT_FAILED (2001), CONFIG_INVALID (2010) |
| 3000–3016 | Kommunikation | WIFI_CONNECT_FAILED (3003), MQTT_CONNECT_FAILED (3011) |
| 4000–4999 | Application | STATE_STUCK (4003), WDT_TIMEOUT (4070) |

> Vollständige Referenz: `.claude/reference/errors/ERROR_CODES.md`

---

## 3. Schicht 2: El Servador (FastAPI Server)

### 3.1 Überblick

| Eigenschaft | Wert |
|-------------|------|
| **Framework** | FastAPI (Python, async) |
| **Port** | 8000 (REST + WebSocket) |
| **Datenbank** | PostgreSQL 16 (asyncpg, SQLAlchemy 2.0) |
| **MQTT** | paho-mqtt (Client), Eclipse Mosquitto (Broker, Port 1883) |
| **Source-Dateien** | ~200 Python-Dateien |
| **Pfad** | `El Servador/god_kaiser_server/src/` |

### 3.2 Modul-Architektur

```
El Servador/god_kaiser_server/src/
├── main.py                           # Entry-Point, Lifespan (Startup/Shutdown)
├── api/
│   ├── v1/                           # 14 REST-Router (~170 Endpoints)
│   │   ├── esp.py                    # ESP-Verwaltung, Approval/Reject
│   │   ├── sensors.py                # Sensor-CRUD, Daten, Kalibrierung
│   │   ├── actuators.py              # Aktor-CRUD, Commands, Safety
│   │   ├── logic.py                  # Logic-Rules CRUD, Toggle, History
│   │   ├── zone.py                   # Zone-Management
│   │   ├── subzone.py                # Subzone-Management
│   │   ├── auth.py                   # JWT Login, Refresh, Setup
│   │   ├── health.py                 # Liveness, Readiness, Metriken
│   │   ├── sequences.py              # Sequence-Aktionen
│   │   ├── sensor_type_defaults.py   # Sensor-Typ-Defaults
│   │   └── ...                       # audit, errors, debug, users
│   ├── sensor_processing.py          # Pi-Enhanced HTTP-Endpoint
│   └── v1/websocket/realtime.py      # WebSocket-Endpoint
├── core/
│   ├── config.py                     # Settings (Pydantic, .env, 635 Zeilen)
│   ├── logging_config.py             # JSON-Logging, Rotation (10 MB, 10 Backups)
│   ├── resilience/                   # Resilience-Pattern-Paket (~1.761 Zeilen)
│   │   ├── circuit_breaker.py        # CircuitBreaker, CircuitState
│   │   ├── retry.py                  # Retry-Decorator, Exponential Backoff
│   │   ├── timeout.py                # Timeout-Decorator, Fallback
│   │   └── registry.py              # ResilienceRegistry (Singleton)
│   ├── exceptions.py                 # GodKaiserException-Hierarchie (381 Zeilen)
│   ├── exception_handlers.py         # Global Exception Handler
│   ├── metrics.py                    # Prometheus-Metriken (Gauges, Counters, Histograms)
│   ├── scheduler.py                  # APScheduler (Central Scheduler)
│   ├── security.py                   # JWT, Password-Hashing, Auth-Utils
│   ├── error_codes.py                # Error-Code-Definitionen 5000-5699
│   └── constants.py                  # Systemkonstanten
├── db/
│   ├── models/                       # 16 Model-Dateien → 19 Tabellen
│   ├── repositories/                 # 15 Repositories (BaseRepository-Pattern)
│   ├── session.py                    # Async Session + DB Circuit Breaker
│   └── base.py                       # SQLAlchemy Base
├── mqtt/
│   ├── client.py                     # Singleton MQTT-Client (paho, Auto-Reconnect)
│   ├── publisher.py                  # Retry mit Exponential Backoff + Jitter
│   ├── subscriber.py                 # Handler Registry, Thread Pool (max 10 Workers)
│   ├── topics.py                     # TopicBuilder + Wildcard Matching
│   ├── offline_buffer.py             # Deque (max 1000), Auto-Flush nach Reconnect
│   └── handlers/                     # 12 Handler-Module + 1 Inline-Handler
│       ├── base_handler.py           # BaseHandler-Klasse (584 Zeilen)
│       ├── sensor_handler.py         # Sensor-Daten + Pi-Enhanced (733 Zeilen)
│       ├── heartbeat_handler.py      # Discovery, Health, Timeout (971 Zeilen)
│       ├── actuator_handler.py       # Actuator-Status
│       ├── actuator_response_handler.py  # Command-Bestätigung
│       ├── actuator_alert_handler.py # Emergency/Timeout-Alerts
│       ├── config_handler.py         # Config-ACK
│       ├── lwt_handler.py            # Last Will & Testament (Offline-Detection)
│       ├── error_handler.py          # ESP32 Error-Events
│       ├── discovery_handler.py      # ESP32 Discovery
│       ├── zone_ack_handler.py       # Zone-Assignment ACK
│       ├── subzone_ack_handler.py    # Subzone-Assignment ACK
│       └── diagnostics_handler.py    # ESP32 Diagnostics
│       # Mock-ESP Routing: Inline-Handler in main.py (Zeilen 291-319)
├── sensors/
│   ├── library_loader.py             # LibraryLoader Singleton (310 Zeilen)
│   ├── base_processor.py             # BaseSensorProcessor ABC (253 Zeilen)
│   ├── sensor_type_registry.py       # Sensor-Typ-Normalisierung (290 Zeilen)
│   └── sensor_libraries/active/      # 9 Processing-Libraries
│       ├── ph_sensor.py              # pH-Wert-Berechnung
│       ├── ec_sensor.py              # EC-Leitfähigkeit
│       ├── temperature.py            # DS18B20, SHT31 Temperatur
│       ├── humidity.py               # Luftfeuchtigkeit
│       ├── moisture.py               # Bodenfeuchte
│       ├── pressure.py               # BMP280 Druck
│       ├── co2.py                    # CO2-Konzentration
│       ├── flow.py                   # Durchfluss
│       └── light.py                  # Lichtstärke
├── services/
│   ├── logic_engine.py               # Background-Task, Rule-Evaluation (781 Zeilen)
│   ├── logic_scheduler.py            # Timer-basierte Logic-Evaluation
│   ├── logic_service.py              # CRUD für Rules
│   ├── actuator_service.py           # Command Execution
│   ├── safety_service.py             # Safety Validation vor Commands
│   ├── sensor_service.py             # Sensor CRUD + Processing
│   ├── zone_service.py               # Zone-Management
│   ├── subzone_service.py            # Subzone-Management
│   ├── esp_service.py                # ESP CRUD, Discovery, Approval (950 Zeilen)
│   ├── config_builder.py             # Config-Payload für MQTT
│   ├── gpio_validation_service.py    # GPIO-Konflikte, Board-Constraints
│   ├── sensor_scheduler_service.py   # Scheduled Sensor Jobs
│   ├── event_aggregator_service.py   # Event-Aggregation
│   ├── audit_retention_service.py    # Audit Cleanup
│   ├── audit_backup_service.py       # Audit Backups
│   ├── mqtt_auth_service.py          # MQTT-Credentials
│   ├── logic/
│   │   ├── conditions/               # Modulare Condition-Evaluatoren
│   │   │   ├── sensor_evaluator.py   # sensor_threshold, sensor
│   │   │   ├── time_evaluator.py     # time_window, time
│   │   │   ├── hysteresis_evaluator.py # Hysterese (Anti-Flattern)
│   │   │   └── compound_evaluator.py # AND/OR-Logik
│   │   ├── actions/                  # Modulare Action-Executoren
│   │   │   ├── actuator_executor.py  # actuator_command
│   │   │   ├── delay_executor.py     # Verzögerung
│   │   │   ├── notification_executor.py # Email/Webhook/WebSocket
│   │   │   └── sequence_executor.py  # Verkettete Actions (907 Zeilen)
│   │   └── safety/                   # Safety-Komponenten
│   │       ├── conflict_manager.py   # Actuator-Lock-Management (Priority-basiert)
│   │       ├── rate_limiter.py       # max_executions_per_hour
│   │       └── loop_detector.py      # Zirkuläre Dependencies erkennen
│   ├── maintenance/                  # Cleanup-Jobs, Retention
│   └── simulation/                   # Mock-ESP Simulation
├── autoops/                         # AutoOps Agent Framework (v1.0.0)
│   ├── core/                        # Agent, API Client, Plugin Registry, Reporter
│   ├── plugins/                     # health_check, esp_configurator, debug_fix
│   └── runner.py                    # CLI Runner
├── middleware/
│   └── request_id.py                 # UUID pro Request (X-Request-ID)
└── websocket/
    └── manager.py                    # Singleton, Filter-basierte Subscriptions
```

### 3.3 Startup-Sequenz

Die Server-Initialisierung folgt einer strikten Reihenfolge in `main.py` (Lifespan-Context):

| Schritt | Log-Pattern | Was passiert |
|---------|-------------|-------------|
| 0 | `God-Kaiser Server Starting...` | Start |
| 0.1 | `Validating security configuration...` | JWT-Secret prüfen (Prod + Default-Key → Exit), MQTT-TLS-Warnung |
| 0.5 | `Initializing resilience patterns...` | ResilienceRegistry, external_api Circuit Breaker |
| 1 | `Initializing database...` | PostgreSQL verbinden, Tabellen erstellen, DB Circuit Breaker |
| 2 | `Connecting to MQTT broker...` | Mosquitto verbinden (nicht-fatal bei Fehler, Auto-Reconnect) |
| 3 | `Registering MQTT handlers...` | 12 Handler + Mock-ESP-Handler registrieren |
| 3.4 | `Central Scheduler started` | APScheduler starten |
| 3.4.1 | `SimulationScheduler initialized` | Mock-ESP Simulation + Actuator-Handler |
| 3.4.2 | `MaintenanceService initialized and started` | Cleanup- und Health-Jobs registrieren |
| 3.4.3 | `Prometheus metrics job registered` | Metriken-Update alle 15 Sekunden |
| 3.5 | `Mock-ESP recovery complete` | Aktive Simulationen aus DB wiederherstellen |
| 3.6 | `Sensor type auto-registration` | Sensor-Typ-Defaults laden (idempotent) |
| 3.7 | `Sensor schedule recovery complete` | Scheduled-Sensor-Jobs wiederherstellen |
| 4 | `MQTT subscriptions complete` | Alle Topics abonnieren (nur wenn connected) |
| 5 | `Initializing WebSocket Manager...` | WebSocket-Singleton erstellen |
| 6 | `Services initialized successfully` | SafetyService, ActuatorService, LogicEngine, LogicScheduler |
| FINAL | `God-Kaiser Server Started Successfully` | Betriebsbereit |

### 3.4 Pi-Enhanced Sensor Processing

Der Server übernimmt die rechenintensive Verarbeitung von Sensor-Rohdaten. Dieses Konzept heißt "Pi-Enhanced Processing" – der Raspberry Pi (Server) erweitert die Fähigkeiten des ESP32.

**Ablauf:**

1. ESP32 liest Rohwert (z.B. ADC-Wert 2150 für pH)
2. ESP32 sendet via MQTT mit `raw_mode: true`
3. Server empfängt in `sensor_handler.py`
4. Server lädt passende Library aus `sensor_libraries/active/`
5. Library führt `processor.process(raw_value, calibration, params)` aus
6. Ergebnis (z.B. pH 6.8, Qualität "good") wird:
   - In die Datenbank geschrieben
   - Via WebSocket an das Frontend gesendet
   - Optional: An die Logic Engine weitergeleitet

**Verfügbare Sensor-Libraries:**

| Library | Sensor-Typen | Verarbeitung |
|---------|-------------|-------------|
| `ph_sensor.py` | pH | ADC → Spannungs-Kompensation → pH-Wert |
| `ec_sensor.py` | EC | ADC → Temperatur-Kompensation → Leitfähigkeit |
| `temperature.py` | DS18B20, SHT31 | Rohwert → Grad Celsius |
| `humidity.py` | SHT31 | Rohwert → relative Feuchte |
| `moisture.py` | Bodenfeuchte | ADC → Prozent |
| `pressure.py` | BMP280 | Validierung, Unit-Konvertierung |
| `co2.py` | CO2 | Sensor-spezifische Berechnung |
| `flow.py` | Durchfluss | Pulse → Liter/min |
| `light.py` | Lichtstärke | ADC → Lux |

**Erweiterung:** Neue Sensor-Libraries können als Python-Modul in `sensor_libraries/active/` abgelegt werden. Das Interface ist standardisiert (`process()`, `validate_sensor_data()`, `get_version()`). Kein Server-Neustart nötig – der LibraryLoader lädt dynamisch.

### 3.5 Logic Engine (Cross-ESP-Automation)

Die Logic Engine ermöglicht regelbasierte Automation über mehrere ESP32 hinweg. Beispiel: "Wenn der Temperatursensor an ESP_01 über 28°C steigt, schalte den Lüfter an ESP_02 ein."

**Architektur:**

```
Sensor-Daten (MQTT)
       │
       ▼
  sensor_handler.py ──► logic_engine.evaluate_sensor_data()  (async, non-blocking)
                               │
                               ▼
                        Regeln aus DB laden (get_rules_by_trigger)
                               │
                               ▼
                    ┌──────────┴──────────┐
                    │  Conditions prüfen  │
                    │  (modulare Evaluatoren)
                    └──────────┬──────────┘
                               │ Match?
                    ┌──────────┴──────────┐
                    │  Safety-Checks      │
                    │  ConflictManager     │
                    │  RateLimiter         │
                    │  LoopDetector        │
                    └──────────┬──────────┘
                               │ Freigegeben?
                    ┌──────────┴──────────┐
                    │  Actions ausführen   │
                    │  (modulare Executoren)
                    └─────────────────────┘
```

**Condition-Typen:**

| Typ | Beschreibung | Beispiel |
|-----|-------------|---------|
| `sensor_threshold` | Sensor-Wert Vergleich | GPIO 4 > 28.0°C |
| `time_window` | Zeitfenster | 08:00–18:00 Uhr |
| `hysteresis` | Anti-Flattern | Aktivieren >28°C, Deaktivieren <24°C |
| Compound | AND/OR-Logik | Temperatur > 28 AND Feuchtigkeit < 40 |

**Action-Typen:**

| Typ | Beschreibung | Beispiel |
|-----|-------------|---------|
| `actuator_command` | Aktor steuern | Pumpe auf ESP_02, GPIO 25 → ON |
| `delay` | Verzögerung (1–3600s) | 5 Sekunden warten |
| `notification` | Benachrichtigung | WebSocket/Email/Webhook |
| `sequence` | Verkettete Actions | Schritt 1 → Schritt 2 → Schritt 3 |

**Safety-Komponenten:** ConflictManager (Priority-basierte Aktor-Locks), RateLimiter (max Ausführungen/Stunde), LoopDetector (zirkuläre Abhängigkeiten erkennen).

### 3.6 REST-API

~170 Endpoints unter `/api/v1/`. Die wichtigsten Gruppen:

| Gruppe | Endpoints | Funktion |
|--------|-----------|----------|
| `/auth` | 10 | Login, JWT, Refresh, Setup, MQTT-Credentials |
| `/esp/devices` | 15 | ESP-Registry, Approval/Reject, Config-Push, GPIO-Status |
| `/sensors` | 12 | Sensor CRUD, Daten, Kalibrierung, OneWire-Scan |
| `/sensor-type-defaults` | 6 | Defaults pro Sensor-Typ (Unit, Min/Max) |
| `/actuators` | 8 | Aktor CRUD, Commands, History, Emergency-Stop |
| `/logic` | 8 | Rules CRUD, Toggle, Test, Execution-History |
| `/zone` | 5 | Zone-Zuweisung (MQTT), ESPs pro Zone, Unassigned |
| `/subzone` | 6 | Subzone CRUD, Sensor-Zuordnung |
| `/health` | 6 | Liveness, Readiness, Detailed, ESP-Fleet, Metriken |
| `/audit` | 22 | Audit-Logs, Retention, Export, Backups, Auto-Cleanup |
| `/debug` | ~60 | Mock-ESP (CRUD, Simulation), DB Explorer, Logs, MQTT, Scheduler, Resilience |
| `/users` | 7 | User CRUD, Password-Reset, Rollenverwaltung |
| `/errors` | 4 | Error-Logs, Stats, Error-Code-Referenz |
| `/sequences` | 4 | Sequences auflisten, Details, Cancel |

**Authentifizierung:** JWT Bearer Token. Access Token (30 min), Refresh Token. Admin/Operator-Rollen.

> Vollständige Endpoint-Referenz: `.claude/reference/api/REST_ENDPOINTS.md`

### 3.7 Resilience-System

| Circuit Breaker | Threshold | Recovery Timeout | Half-Open |
|-----------------|-----------|------------------|-----------|
| **database** | 3 Failures | 10s | 5s |
| **mqtt** | 5 Failures | 30s | 10s |
| **external_api** | 5 Failures | 60s | 15s |

**Retry-Konfiguration:** Max 3 Versuche, Exponential Backoff (Base 1s, Max 30s), Jitter aktiviert.

**Offline-Buffer (MQTT):** Max 1000 Messages, Batch-Flush (50 pro Batch) nach Reconnect, automatisch.

### 3.8 Error-Codes (Server)

| Range | Kategorie | Beispiele |
|-------|-----------|-----------|
| 5000–5099 | Config | ESP_NOT_FOUND (5001), ESP_OFFLINE (5007) |
| 5100–5199 | MQTT | CONNECTION_LOST (5104), BROKER_UNAVAILABLE (5106) |
| 5200–5299 | Validation | INVALID_ESP_ID (5201), MISSING_FIELD (5205) |
| 5300–5399 | Database | QUERY_FAILED (5301), CONNECTION_FAILED (5304) |
| 5400–5499 | Service | CIRCUIT_BREAKER_OPEN (5402), TIMEOUT (5403) |
| 5500–5599 | Audit | AUDIT_LOG_FAILED (5501) |
| 5600–5699 | Sequence | SEQ_ALREADY_RUNNING (5610), SAFETY_BLOCKED (5642) |

> Vollständige Referenz: `.claude/reference/errors/ERROR_CODES.md`

> Detail-Dokumentation: `.claude/reports/current/auto-one_serverarchitektur.md`

---

## 4. Schicht 3: El Frontend (Vue 3 Dashboard)

### 4.1 Ueberblick

| Eigenschaft | Wert |
|-------------|------|
| **Framework** | Vue 3 + TypeScript (strict) |
| **Build** | Vite 6.2 |
| **State** | Pinia (13 Stores: 1 esp + 12 shared) |
| **Styling** | Tailwind CSS 3.4 + Design Tokens (`tokens.css`) |
| **API** | Axios + WebSocket (native) |
| **Port** | 5173 (Dev-Proxy zu Server:8000) |
| **Pfad** | `El Frontend/src/` |

### 4.2 Architektur

```
El Frontend/src/
├── main.ts                    # Entry-Point, Global Error Handler
├── App.vue                    # Root-Component, Auth-Init
├── router/index.ts            # Vue Router (16 Views, Nested unter AppShell)
├── views/                     # 16 Views
│   ├── HardwareView.vue       # ESP-Topologie: Zone → ESP → Sensor/Aktor (3-Level Zoom)
│   ├── MonitorView.vue        # Sensor/Aktor-Daten nach Zonen (Default-Route /)
│   ├── CustomDashboardView.vue # GridStack.js Widget-Builder (12-Column Grid)
│   ├── DashboardView.vue      # Legacy (Route: /dashboard-legacy)
│   ├── SensorsView.vue        # Sensor/Aktor-Tabellen mit Konfiguration
│   ├── LogicView.vue          # Rule-Flow-Editor (Vue Flow)
│   ├── CalibrationView.vue    # pH/EC Kalibrierungs-Wizard
│   ├── SensorHistoryView.vue  # Chart.js Zeitreihen mit Threshold-Lines
│   ├── SystemMonitorView.vue  # Logs, DB Explorer, MQTT, Events (Admin)
│   ├── SystemConfigView.vue   # System-Konfiguration (Admin)
│   ├── MaintenanceView.vue    # Wartungs-Tools (Admin)
│   ├── UserManagementView.vue # Benutzerverwaltung (Admin)
│   ├── LoadTestView.vue       # Last-Tests (Admin)
│   ├── SettingsView.vue       # Benutzer-Einstellungen
│   ├── LoginView.vue          # Login
│   └── SetupView.vue          # Ersteinrichtung
├── components/                # ~93 Komponenten in 15 Unterverzeichnissen
│   ├── calibration/           # CalibrationWizard, CalibrationStep
│   ├── charts/                # LiveLineChart, HistoricalChart, TimeRangeSelector, ...
│   ├── common/                # GrafanaPanelEmbed
│   ├── custom-dashboard/      # GridStackBoard, WidgetFactory, WidgetConfig, ...
│   ├── database/              # TablesOverview, DataGrid, QueryEditor, SQLHighlighter
│   ├── debug/                 # SchedulerDebugPanel, ESPLogViewer, ...
│   ├── esp/                   # 24 Komponenten (SensorConfigPanel, ActuatorConfigPanel, ESPConfigPanel, ...)
│   ├── log-viewer/            # LogFilter, LogEntry, ...
│   ├── modals/                # CreateMockEsp, ConfirmAction, RejectDevice
│   ├── mqtt/                  # MqttLogViewer, TopicFilter, ...
│   ├── rules/                 # RuleFlowEditor, RuleNodePalette, RuleConfigPanel
│   ├── sensors/               # SensorDetailPanel, SensorSettingsForm, ...
│   ├── system-config/         # Config-Sections
│   └── zones/                 # ZoneDetailView, SubzoneArea, DeviceSummaryCard
├── shared/design/             # Design System
│   ├── primitives/            # 12: BaseBadge, BaseButton, BaseCard, BaseInput, BaseModal,
│   │                          #     BaseSelect, BaseSkeleton, BaseSpinner, BaseToggle,
│   │                          #     SlideOver, QualityIndicator, RangeSlider
│   ├── layout/                # 3: AppShell, Sidebar, TopBar
│   └── patterns/              # 5: ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer
├── stores/                    # 1 Store (nur esp.ts)
│   └── esp.ts                 # ESP-Devices, Sensoren, Aktoren, WebSocket (~2500 Zeilen)
├── shared/stores/             # 12 Shared Stores
│   ├── auth.store.ts          # Login, Token, Refresh
│   ├── logic.store.ts         # Logic UI State
│   ├── dashboard.store.ts     # Custom Dashboard Layouts
│   ├── ui.store.ts            # UI State, Theme, Sidebar
│   ├── sensor.store.ts        # Sensor-Konfigurationen
│   ├── actuator.store.ts      # Aktor-Steuerung
│   ├── audit.store.ts         # Audit-Logs
│   ├── zone.store.ts          # Zone-Management
│   ├── maintenance.store.ts   # Wartungs-State
│   ├── system-config.store.ts # System-Konfiguration
│   ├── users.store.ts         # Benutzerverwaltung
│   └── index.ts               # Re-Exports
├── api/                       # 18 API-Module (Axios)
├── composables/               # 16 Composables (useWebSocket, useToast, useCalibration, useScrollLock, ...)
├── services/websocket.ts      # WebSocket-Singleton (624 Zeilen)
├── types/                     # TypeScript-Definitionen
├── utils/                     # 14 Utility-Dateien
└── styles/                    # 5 CSS-Dateien (tokens.css, glass.css, animations.css, ...)
```

### 4.3 Routing-Architektur

Alle geschuetzten Routes sind Kinder von `AppShell.vue` (Sidebar + TopBar Layout):

| Route | View | Beschreibung |
|-------|------|-------------|
| `/` | → Redirect `/monitor` | Default-Einstieg |
| `/monitor` | MonitorView | Sensor/Aktor-Daten nach Zonen (KPI-Tiles, Live-Cards) |
| `/monitor/:zoneId` | MonitorView | Zone-Detail mit Sensor/Aktor-Cards |
| `/hardware` | HardwareView | ESP-Topologie: Alle Zonen mit ESP-Karten |
| `/hardware/:zoneId` | HardwareView | Zone-Detail: ESPs mit Sensor/Aktor-Satelliten |
| `/hardware/:zoneId/:espId` | HardwareView | ESP-Detail: Orbital-Layout |
| `/custom-dashboard` | CustomDashboardView | Widget-Builder (GridStack.js, 12-Column Grid) |
| `/sensors` | SensorsView | Sensor/Aktor-Tabellen, Konfiguration |
| `/logic` | LogicView | Rule-Flow-Editor (Vue Flow) |
| `/calibration` | CalibrationView | pH/EC Kalibrierungs-Wizard (Admin) |
| `/sensor-history` | SensorHistoryView | Chart.js Zeitreihen (1h, 6h, 24h, 7d, Custom) |
| `/system-monitor` | SystemMonitorView | Logs, DB, MQTT, Events (Admin) |
| `/system-config` | SystemConfigView | System-Konfiguration (Admin) |
| `/maintenance` | MaintenanceView | Wartung (Admin) |
| `/users` | UserManagementView | Benutzerverwaltung (Admin) |
| `/settings` | SettingsView | Benutzer-Einstellungen |

### 4.4 Neue Design-Primitives

| Primitiv | Funktion | Verwendet in |
|----------|----------|-------------|
| `SlideOver` | Slide-in Panel von rechts (sm/md/lg), ESC + Click-Outside | HardwareView, MonitorView (Config-Panels) |
| `QualityIndicator` | Status-Dot mit Label (good/warning/alarm/offline), Pulsing | Sensor-Cards, ESP-Status |
| `RangeSlider` | 4-Punkt Threshold-Slider (alarmLow-warnLow-warnHigh-alarmHigh) | SensorConfigPanel |

### 4.5 Neue Dependencies

| Package | Version | Funktion |
|---------|---------|----------|
| `chart.js` | ^4.5.0 | Chart-Rendering (SensorHistoryView, HistoricalChart) |
| `vue-chartjs` | ^5.3.2 | Vue 3 Wrapper fuer Chart.js |
| `chartjs-adapter-date-fns` | ^3.0.0 | TimeScale-Adapter fuer Chart.js |
| `chartjs-plugin-annotation` | ^3.1.0 | Threshold-Lines in Charts |
| `gridstack` | ^12.4.2 | Dashboard Widget-Grid (CustomDashboardView) |
| `vue-draggable-plus` | ^0.6.0 | Drag & Drop fuer Widget-Palette |
| `@vueuse/core` | ^10.11.1 | Vue Composition Utilities |

### 4.6 WebSocket (Echtzeit-Events)

28 Event-Typen verbinden Server und Frontend in Echtzeit:

| Gruppe | Events |
|--------|--------|
| **Sensor/Aktor** | `sensor_data`, `actuator_status`, `actuator_command`, `actuator_command_failed`, `actuator_response`, `actuator_alert` |
| **Health** | `esp_health`, `sensor_health`, `esp_diagnostics` |
| **Discovery** | `device_discovered`, `device_approved`, `device_rejected`, `device_rediscovered` |
| **Config** | `config_response`, `config_published`, `config_failed`, `zone_assignment`, `subzone_assignment` |
| **Logic** | `logic_execution`, `notification`, `sequence_started/step/completed/error/cancelled` |
| **System** | `system_event`, `error_event`, `events_restored` |

**Connection:** `ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt}`
**Reconnect:** Exponential Backoff (1s → 2s → 4s → 8s → 16s → max 30s, max 10 Versuche)
**Rate Limit:** 10 msg/s (Client-seitig)
**Token Refresh:** Automatisch vor Reconnect wenn Token < 60s gueltig

> Vollstaendige Event-Referenz: `.claude/reference/api/WEBSOCKET_EVENTS.md`

### 4.7 Auth-Flow

```
App-Start → authStore.checkAuthStatus()
  → GET /auth/status (Setup erforderlich?)
  → Token vorhanden? → GET /auth/me → User laden
  → 401? → refreshTokens() → POST /auth/refresh → Retry
  → Refresh fehlgeschlagen? → clearAuth() → Redirect /login
```

**Token-Speicherung:** `localStorage` (`el_frontend_access_token`, `el_frontend_refresh_token`)
**Infinite-Loop-Guard:** Skip Interceptor fuer `/auth/refresh`, `/auth/login`, `/auth/setup`, `/auth/status`

---

## 5. Datenbank (PostgreSQL 16)

### 5.1 Schema-Übersicht

19 Tabellen in 16 Model-Dateien. Die wichtigsten:

| Tabelle | Funktion | Retention |
|---------|----------|-----------|
| `esp_devices` | Device Registry (device_id, status, zone_id, capabilities, last_seen) | Permanent |
| `sensor_configs` | Sensor-Konfiguration pro GPIO (UNIQUE: esp_id + gpio + sensor_type + onewire/i2c_address) | Permanent |
| `sensor_data` | Time-Series Messwerte (FK → sensor_configs) | Konfigurierbar (Default: unbegrenzt) |
| `sensor_type_defaults` | Standard-Einstellungen pro Sensor-Typ (Unit, Min/Max) | Permanent |
| `actuator_configs` | Aktor-Konfiguration + Safety-Settings | Permanent |
| `actuator_states` | Echtzeit-Zustand pro Aktor | Permanent |
| `actuator_history` | Command-History | Konfigurierbar |
| `esp_heartbeat_logs` | Heartbeat Time-Series (8 Indizes) | 7 Tage |
| `cross_esp_logic` | Logic-Rules (conditions JSON, actions JSON) | Permanent |
| `logic_execution_history` | Rule-Ausführungsprotokoll | Permanent |
| `audit_logs` | Globales Event-Log (5 Indizes) | Permanent |
| `user_accounts` | JWT Auth (username, email, role, token_version) | Permanent |
| `token_blacklist` | Revoked JWT Tokens (expires_at) | Auto-Cleanup |
| `subzone_configs` | Subzone-Definitionen (FK → zones) | Permanent |
| `ai_predictions` | Vorbereitet: KI-Vorhersagen (prediction_type, confidence_score, input/result JSON) | Permanent |
| `kaiser_registry` | Vorbereitet: Kaiser-Nodes | Permanent |
| `esp_ownership` | Vorbereitet: ESP-zu-Kaiser-Zuordnung | Permanent |

### 5.2 Foreign Key Cascades

| Tabelle | FK → | ON DELETE |
|---------|------|-----------|
| `sensor_configs` | `esp_devices` | CASCADE |
| `sensor_data` | `sensor_configs` | CASCADE |
| `actuator_configs` | `esp_devices` | CASCADE |
| `actuator_states` | `actuator_configs` | CASCADE |
| `actuator_history` | `actuator_configs` | CASCADE |
| `esp_heartbeat_logs` | `esp_devices` | CASCADE |

**Konsequenz:** Ein ESP löschen → alle zugehörigen Sensor-Daten, Aktor-Historien, Heartbeats werden kaskadierend mitgelöscht.

### 5.3 Alembic Migrations

19 Migrations. Aktueller HEAD: `950ad9ce87bb` (UNIQUE-Constraint erweitert um `i2c_address`).

```bash
# Status prüfen
docker exec automationone-server python -m alembic current

# Migrations ausführen
docker exec automationone-server python -m alembic upgrade head
```

> Vollständige Schema-Referenz: `.claude/skills/db-inspector/SKILL.md`

---

## 6. MQTT-Kommunikation

### 6.1 Topic-Hierarchie

```
kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}
```

- `kaiser_id`: Aktuell `"god"` (God-Kaiser). Vorbereitet für Multi-Kaiser.
- `esp_id`: Eindeutige ESP32-ID (z.B. `ESP_12AB34CD`)

### 6.2 Kern-Topics (32 total)

| Topic-Pattern | Richtung | QoS | Beschreibung |
|---------------|----------|-----|-------------|
| `.../sensor/{gpio}/data` | ESP → Server | 1 | Sensor-Messwert |
| `.../sensor/batch` | ESP → Server | 1 | Batch-Daten |
| `.../sensor/{gpio}/command` | Server → ESP | 2 | Sensor-Konfiguration |
| `.../actuator/{gpio}/command` | Server → ESP | 2 | Aktor-Befehl |
| `.../actuator/{gpio}/status` | ESP → Server | 1 | Aktor-Zustand |
| `.../actuator/{gpio}/response` | ESP → Server | 1 | Command-ACK |
| `.../actuator/{gpio}/alert` | ESP → Server | 1 | Aktor-Alert |
| `.../system/heartbeat` | ESP → Server | 0 | Health alle ~5s |
| `.../system/heartbeat/ack` | Server → ESP | 0 | Heartbeat-Bestätigung |
| `.../system/will` | Broker → Server | 1 | LWT (Offline-Erkennung, **retain: true**) |
| `.../system/error` | ESP → Server | 1 | Error-Report |
| `.../config` | Server → ESP | 2 | Config-Push |
| `.../config_response` | ESP → Server | 2 | Config-ACK |
| `.../zone/assign` | Server → ESP | 1 | Zone zuweisen |
| `.../zone/ack` | ESP → Server | 1 | Zone-ACK |
| `.../subzone/assign` | Server → ESP | 1 | Subzone zuweisen |
| `.../subzone/ack` | ESP → Server | 1 | Subzone-ACK |
| `kaiser/broadcast/emergency` | Server → ALLE | 2 | Globaler Emergency-Stop |

**QoS-Strategie:**
- QoS 0: Latenz-optimiert (Heartbeat – Verlust tolerierbar)
- QoS 1: At-Least-Once (Sensor-Daten – Duplikate erlaubt)
- QoS 2: Exactly-Once (Commands – exakt eine Ausführung)

### 6.3 Registration Gate

Neuen ESP32 verbinden (ohne Firmware-Änderung):

1. ESP bootet, verbindet WiFi + MQTT
2. Erster Heartbeat → Server erkennt neues Device → Status `pending_approval`
3. Registration Gate **blockiert** alle weiteren Publishes (außer Heartbeat)
4. Admin genehmigt via Frontend/API (`POST /esp/devices/{id}/approve`)
5. Server sendet Config-Push → Gate öffnet → normaler Betrieb
6. Fallback: Gate öffnet automatisch nach 10s Timeout

> Vollständige Topic-Referenz: `.claude/reference/api/MQTT_TOPICS.md`

---

## 7. Datenfluss-Szenarien

### 7.1 Sensor-Reading (ESP → Server → Frontend)

**Latenz:** 50–230 ms End-to-End

```
ESP32: Sensor lesen (ADC/I2C/OneWire)            [sensor_manager.cpp:985]
  │
  ▼ MQTT QoS 1: kaiser/god/esp/{id}/sensor/{gpio}/data
  │
Server: sensor_handler.handle_sensor_data()       [sensor_handler.py:79]
  ├── Validieren + Parsen                         [sensor_handler.py:353]
  ├── Pi-Enhanced Processing (optional)           [sensor_handler.py:217]
  ├── DB: sensor_data speichern                   [sensor_handler.py:259]
  ├── Logic Engine: evaluate_sensor_data()        [logic_engine.py:135]
  └── WebSocket: "sensor_data" broadcast          [sensor_handler.py:297]
       │
       ▼
Frontend: handleSensorData() → Vue Reactivity     [esp.ts:1482]
```

### 7.2 Actuator-Command (Frontend → Server → ESP)

**Latenz:** 100–290 ms End-to-End

```
Frontend: sendActuatorCommand()                   [esp.ts:2287]
  │
  ▼ HTTP POST /actuators/{id}/command
  │
Server: Safety Validation                         [safety_service.py]
  │
  ▼ MQTT QoS 2: kaiser/god/esp/{id}/actuator/{gpio}/command
  │
ESP32: handleActuatorCommand()                    [actuator_manager.cpp:537]
  ├── Safety Check                                [safety_controller.cpp]
  ├── GPIO setzen                                 [pump_actuator.cpp:407]
  ├── MQTT: .../response (ACK)                    [actuator_manager.cpp:826]
  └── MQTT: .../status (Zustand)                  [actuator_manager.cpp:778]
       │
       ▼
Server: DB + WebSocket broadcast → Frontend
```

### 7.3 Emergency Stop (Server → ALLE ESPs)

**Latenz:** <100 ms

```
POST /actuators/emergency-stop
  │
  ▼ MQTT QoS 2: kaiser/broadcast/emergency
  │
ALLE ESPs: SafetyController.emergencyStopAll()
  └── Alle Outputs auf INPUT → Status "emergency"
```

### 7.4 Cross-ESP-Logic (Sensor → Logic → Aktor)

```
ESP_01: Sensor-Wert → Server: sensor_handler
  │
  ▼ Logic Engine: evaluate_sensor_data()
  │
  ├── Bedingung: Temperatur ESP_01 GPIO 4 > 28°C?
  ├── Safety: ConflictManager + RateLimiter
  └── Action: actuator_command → ESP_02 GPIO 25 ON
       │
       ▼ MQTT QoS 2: kaiser/god/esp/ESP_02/actuator/25/command
       │
  ESP_02: Lüfter einschalten
```

> Vollständige Flow-Dokumentation mit Code-Referenzen: `.claude/reference/patterns/COMMUNICATION_FLOWS.md`

---

## 8. Sicherheits-Architektur

### 8.1 Authentifizierung

| Ebene | Mechanismus | Status |
|-------|-------------|--------|
| **Frontend → Server** | JWT (HS256), Access Token 30 min, Refresh Token | Implementiert |
| **WebSocket** | JWT Token in URL-Query bei Connect | Implementiert |
| **MQTT (Dev)** | `allow_anonymous = true` | Development-only |
| **MQTT (Prod)** | Username/Password + ACL + TLS 1.2+ | Dokumentiert in Production Checklist |
| **Service-to-Service** | API-Keys in `.env` | Vorbereitet |

### 8.2 Safety-System

| Komponente | Funktion |
|-----------|----------|
| **SafetyService** | Validiert jeden Aktor-Befehl vor Ausführung |
| **ConflictManager** | Verhindert parallele Steuerung desselben Aktors (Priority-basiert) |
| **RateLimiter** | Begrenzt Regelausführungen pro Stunde |
| **LoopDetector** | Erkennt zirkuläre Abhängigkeiten in Logic-Rules |
| **Emergency-Stop** | Broadcast an alle ESPs, alle Outputs auf INPUT |
| **GPIO Safe-Mode** | Alle Pins starten sicher (vor Config-Laden) |

### 8.3 Circuit Breaker

Drei Circuit Breaker schützen kritische Verbindungen:

| Breaker | Threshold | Recovery | Auswirkung bei OPEN |
|---------|-----------|----------|---------------------|
| **Database** | 3 Failures | 10s → HALF_OPEN | Alle DB-Operationen Error 5402 |
| **MQTT** | 5 Failures | 30s → HALF_OPEN | Offline-Buffer aktiv |
| **External API** | 5 Failures | 60s → HALF_OPEN | API-Calls blockiert |

### 8.4 Production Checklist

Für den Produktionseinsatz sind folgende Maßnahmen erforderlich:

- JWT_SECRET_KEY: Min. 256 Bit, via `.env` oder Docker Secret
- MQTT: `allow_anonymous false` + Password-File + ACL
- TLS: Nginx Reverse Proxy mit Let's Encrypt
- CORS: Nur erlaubte Origins

> Vollständige Checkliste: `.claude/reference/security/PRODUCTION_CHECKLIST.md`

---

## 9. Deployment (Docker)

### 9.1 Core-Stack (4 Container)

| Service | Container | Image | Port | Health-Check |
|---------|-----------|-------|------|-------------|
| `postgres` | automationone-postgres | postgres:16-alpine | 5432 | `pg_isready` |
| `mqtt-broker` | automationone-mqtt | eclipse-mosquitto:2 | 1883, 9001 | `mosquitto_sub -t $SYS/#` |
| `el-servador` | automationone-server | Build: `./El Servador/` | 8000 | `curl /api/v1/health/live` |
| `el-frontend` | automationone-frontend | Build: `./El Frontend/` | 5173 | `node fetch` |

**Startup-Reihenfolge** (erzwungen durch `service_healthy`):

```
postgres + mqtt-broker  (parallel starten)
         │ (beide healthy)
         ▼
    el-servador
         │ (healthy)
         ▼
    el-frontend
```

### 9.2 Monitoring-Stack (7 Container, Profil: monitoring)

| Service | Container | Image | Port | Funktion |
|---------|-----------|-------|------|----------|
| loki | automationone-loki | grafana/loki:3.4 | 3100 | Log-Aggregation |
| promtail | automationone-promtail | grafana/promtail:3.4 | – | Log-Shipping |
| prometheus | automationone-prometheus | prom/prometheus:v3.2.1 | 9090 | Metriken |
| grafana | automationone-grafana | grafana/grafana:11.5.2 | 3000 | Dashboards |
| cadvisor | automationone-cadvisor | gcr.io/cadvisor/cadvisor | 8080 | Container-Metriken |
| postgres-exporter | automationone-postgres-exporter | prom/postgres-exporter | 9187 | DB-Metriken |
| mosquitto-exporter | automationone-mosquitto-exporter | mosquitto-exporter | 9234 | MQTT-Metriken |

**Start:** `docker compose --profile monitoring up -d`

### 9.2a DevTools-Stack (1 Container, Profil: devtools)

| Service | Container | Image | Port | Funktion |
|---------|-----------|-------|------|----------|
| adminer | automationone-adminer | adminer | 8081 | DB-Admin-UI |

**Start:** `docker compose --profile devtools up -d`

### 9.2b Hardware-Stack (1 Container, Profil: hardware)

| Service | Container | Image | Port | Funktion |
|---------|-----------|-------|------|----------|
| esp32-serial-logger | automationone-esp32-serial | Build: docker/esp32-serial-logger | – | Serial-Bridge |

**Start:** `docker compose --profile hardware up -d`

### 9.3 Compose-Varianten

| Variante | Dateien | Unterschied |
|----------|---------|------------|
| **Production** | `docker-compose.yml` | Standard, `restart: unless-stopped` |
| **Development** | + `docker-compose.dev.yml` | Hot-Reload, DEBUG-Logging, Volume-Mounts |
| **Test** | + `docker-compose.test.yml` | SQLite statt PostgreSQL, isoliert |
| **E2E** | + `docker-compose.e2e.yml` | Full-Stack für Playwright |

### 9.4 Volumes

| Volume | Container | Pfad |
|--------|-----------|------|
| automationone-postgres-data | postgres | /var/lib/postgresql/data |
| automationone-mosquitto-data | mqtt-broker | /mosquitto/data |
| automationone-loki-data | loki | /loki |
| automationone-prometheus-data | prometheus | /prometheus |
| automationone-grafana-data | grafana | /var/lib/grafana |

> Vollständige Docker-Referenz: `.claude/reference/infrastructure/DOCKER_REFERENCE.md`
> Operative Befehle: `.claude/skills/system-control/SKILL.md`

---

## 10. Test-Infrastruktur

### 10.1 Übersicht

| Layer | Tool | Dateien | CI-Workflow |
|-------|------|---------|-------------|
| **Backend** | pytest | 106 Test-Dateien (37 unit, 44 integration, 19 esp32, 6 e2e) | `server-tests.yml` |
| **Frontend** | Vitest (Unit), Playwright (E2E) | 5 + 5 Test-Dateien | `frontend-tests.yml` |
| **Firmware** | Wokwi CLI | 163 Szenarien in 13 Kategorien | `wokwi-tests.yml` |
| **Gesamt** | | **274 Test-Dateien/Szenarien** | |

### 10.2 Backend-Tests

```
El Servador/god_kaiser_server/tests/
├── unit/           # 37 Dateien: Circuit Breaker, Retry, Timeout, GPIO, Sensor, Logic, Calibration, Diagnostics
├── integration/    # 44 Dateien: API Tests, MQTT Flow, Resilience, Emergency Stop, Logic Engine
├── esp32/          # 19 Dateien: GPIO, I2C, MQTT, Boot Loop, Multi-Device, Performance
├── e2e/            # 6 Dateien: Logic Engine, Sensor Workflow, WebSocket, Actuator
└── conftest.py     # 4 conftest-Dateien (root + unit/db + esp32 + e2e)
```

### 10.3 Wokwi-Szenarien (Firmware)

163 YAML-Szenarien testen die ESP32-Firmware in einer simulierten Umgebung:

| Kategorie | Szenarien | Beschreibung |
|-----------|-----------|-------------|
| 01-boot | 2 | Boot-Sequenz, Safe Mode |
| 02-sensor | 5 | Heartbeat, DS18B20, DHT22, Analog |
| 03-actuator | 7 | LED, PWM, Status, Emergency, Timeout |
| 04-zone | 2 | Zone + Subzone Assignment |
| 05-emergency | 3 | Broadcast, ESP Stop, Full Flow |
| 08-i2c | 20 | I2C Bus Operations |
| 08-onewire | 29 | OneWire Protocol Tests |
| 10-nvs | 40 | NVS Storage Tests |
| gpio | 24 | GPIO Tests |

> Vollständige Test-Referenz: `.claude/reference/testing/TEST_ENGINE_REFERENCE.md`

---

## 11. Kommunikationsmatrix

### 11.1 Protokoll-Zuordnung (IST-Zustand)

| Von | Nach | Protokoll | Port | Auth | Beschreibung |
|-----|------|-----------|------|------|-------------|
| ESP32 | Server | MQTT | 1883 | (Dev: anonym) | Sensor-Daten, Status, Heartbeat |
| Server | ESP32 | MQTT | 1883 | – | Commands, Config, Emergency |
| Frontend | Server | HTTP REST | 8000 | JWT | CRUD-Operationen |
| Frontend | Server | WebSocket | 8000 | JWT | Echtzeit-Events (28 Typen) |
| Server | PostgreSQL | TCP | 5432 | User/Pass | Datenbank-Zugriff |
| Prometheus | Server | HTTP | 8000 | – | `/health/metrics` Scraping |
| Promtail | Loki | HTTP | 3100 | – | Log-Shipping |

### 11.2 Produktion (Geplant)

| Von | Nach | Protokoll | Port | Auth | TLS |
|-----|------|-----------|------|------|-----|
| ESP32 | Server | MQTT | 8883 | User/Pass + mTLS | TLS 1.2+ |
| Kaiser | Server | MQTT | 8883 | User/Pass + mTLS | TLS 1.2+ |
| Frontend | Server | HTTPS | 443 | JWT | Nginx Reverse Proxy |

---

## 12. Skalierungs-Architektur (Optional)

Die aktuelle Architektur verarbeitet alle ESP32-Geräte über einen einzigen Server. Für Netzwerke mit 100+ ESPs ist eine optionale Skalierung vorgesehen:

### 12.1 Kaiser-Relay (Raspberry Pi Zero)

Ein Kaiser-Relay ist ein leichtgewichtiger Zwischenknoten, der eine Gruppe von ESP32 lokal betreut:

- **MQTT-Bridge:** Relayed Messages zwischen lokalen ESPs und dem God-Kaiser Server
- **Lokaler Broker:** Port 1883 (ohne TLS für Latenz-Optimierung im LAN)
- **Offline-Caching:** Puffert Daten bei Verbindungsausfall zum Server
- **Library-Cache:** Speichert häufig genutzte Sensor-Libraries lokal

Die Datenbank-Tabellen `kaiser_registry` und `esp_ownership` sind bereits vorbereitet. Das MQTT-Topic-Schema `kaiser/{kaiser_id}/...` unterstützt bereits mehrere Kaiser-IDs.

### 12.2 God-Layer (KI-Inferenz)

Für fortgeschrittene Datenanalyse ist ein dedizierter KI-Inferenz-Knoten vorgesehen:

- **Hardware:** NVIDIA Jetson Orin Nano Super (8 GB) oder Raspberry Pi 5
- **Funktion:** ML-Modelle ausführen (Anomalie-Erkennung, Ressourcen-Optimierung, Failure Prediction)
- **Schnittstelle:** Empfängt Daten per REST/MQTT vom Server, sendet Predictions zurück
- **Datenbank:** `ai_predictions`-Tabelle ist bereits im Schema vorbereitet (prediction_type, confidence_score, input/result JSON)

Der God-Layer ist explizit als **separater Service** konzipiert – saubere Trennung von Infrastruktur und ML-Inferenz.

> Roadmap-Details: `.claude/reference/ROADMAP_KI_MONITORING.md`

---

## 13. Referenz-Verzeichnis

| Thema | Dokument | Pfad |
|-------|----------|------|
| **MQTT-Topics** | MQTT Topic Referenz | `.claude/reference/api/MQTT_TOPICS.md` |
| **REST-API** | REST Endpoint Referenz (~170 Endpoints) | `.claude/reference/api/REST_ENDPOINTS.md` |
| **WebSocket** | WebSocket Event Referenz (28 Events) | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
| **Datenflüsse** | Kommunikationsmuster mit Code-Referenzen | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| **Abhängigkeiten** | Modul-Dependency-Graph | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` |
| **Error-Codes** | ESP32 (1000–4999) + Server (5000–5999) | `.claude/reference/errors/ERROR_CODES.md` |
| **Sicherheit** | Production Security Checklist | `.claude/reference/security/PRODUCTION_CHECKLIST.md` |
| **Docker** | Docker-Stack Referenz | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` |
| **Tests** | Test Engine Referenz | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` |
| **KI-Roadmap** | Monitoring + KI Phasenplan | `.claude/reference/ROADMAP_KI_MONITORING.md` |
| **System-Ops** | Operative Befehle, Make-Targets | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` |
