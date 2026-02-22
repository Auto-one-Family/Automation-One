# AutomationOne — Vollstaendiger Systemueberblick

> **Erstellt:** 2026-02-21
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel:** Dieses Dokument wird an den auto-one Agenten uebergeben. Er hat vollen Zugriff auf den echten Code und soll fuer jeden Bereich gezielte Ergaenzungen machen.
> **Kontext:** Das System laeuft noch nicht im Zusammenspiel. Ziel ist: Stack auf 100% bringen, jeden Bereich sinnvoll einbinden, Error-Analyse vorbereiten fuer den ersten echten Testlauf.

---

## Auftrag an den auto-one Agenten

**Was ich von dir brauche:**

Geh dieses Dokument Bereich fuer Bereich durch. Fuer jeden Bereich:
1. **Bestaetige oder korrigiere** was ich beschrieben habe (ich kenne nur die Strategie, du kennst den Code)
2. **Ergaenze konkrete Details** aus dem echten Code: Dateinamen, Modulstruktur, aktuelle Bugs, fehlende Verbindungen
3. **Identifiziere was fehlt** um den Bereich auf 100% zu bringen — bezogen auf einen funktionierenden Testlauf
4. **Bewerte die KI-Integrations-Idee** fuer automatisierte Error-Analyse in deinem Bereich

Format fuer deine Ergaenzungen: Schreib direkt unter jeden Bereich einen Block `### Auto-One Ergaenzung` mit deinen Erkenntnissen.

---

## Das Gesamtbild

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                    AUTOMATIONNE — 7 IoT-DOMAINS                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║              ┌──────────────────────────────────────┐                   ║
║              │      APPLICATION (El Frontend)       │                   ║
║              │      Vue3 + TypeScript               │                   ║
║              │      "Was der Nutzer sieht"          │                   ║
║              │      Stand: 88%                      │                   ║
║              └──────────────────┬───────────────────┘                   ║
║                                 │ REST + WebSocket                      ║
║              ┌──────────────────┴───────────────────┐                   ║
║              │      PROCESSING (El Servador)        │                   ║
║              │      FastAPI + Python                 │                   ║
║              │      "Wo die Intelligenz sitzt"       │                   ║
║              │      Stand: 95%                      │                   ║
║              └──────────────────┬───────────────────┘                   ║
║                                 │ MQTT                                  ║
║  ┌──────────────────────────────┴───────────────────────────────────┐   ║
║  │              CONNECTIVITY (Mosquitto Broker)                     │   ║
║  │              "Nachrichtenbus zwischen allen Teilen"              │   ║
║  └──────────────────────────────┬───────────────────────────────────┘   ║
║                                 │                                       ║
║  ┌──────────┐  ┌──────────┐  ┌─┴────────┐  ┌──────────┐              ║
║  │ ESP32 #1 │  │ ESP32 #2 │  │ ESP32 #3 │  │ ESP #N   │              ║
║  │ DEVICE   │  │ DEVICE   │  │ DEVICE   │  │ DEVICE   │              ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────┘              ║
║                                                                         ║
║  ═══════════════ QUERSCHNITT (alle Schichten) ════════════════════════  ║
║                                                                         ║
║  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      ║
║  │   DATA     │  │  SECURITY  │  │ OPERATIONS │  │ KI/ERROR   │      ║
║  │ PostgreSQL │  │ JWT, RBAC  │  │ 13 Docker  │  │ ANALYSE    │      ║
║  │ 19 Tables  │  │ Safety     │  │ Monitoring │  │ (BEREIT)   │      ║
║  └────────────┘  └────────────┘  └────────────┘  └────────────┘      ║
║                                                                         ║
║  ═══════════ ENTWICKLUNGS-TOOLING (Claude Code KI-Agenten) ═══════════  ║
║                                                                         ║
║  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      ║
║  │ 10 MCP     │  │ 13 AGENTS  │  │ 21 SKILLS  │  │ AUTO-OPS   │      ║
║  │ Server     │  │ Debug+Dev  │  │ Workflows  │  │ Plugin     │      ║
║  │ Serena,    │  │ +Meta      │  │ +Audit     │  │ 3 Agents   │      ║
║  │ Playwright │  │ +Control   │  │ +TM-Flow   │  │ 10 Skills  │      ║
║  └────────────┘  └────────────┘  └────────────┘  └────────────┘      ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## DOMAIN 1: DEVICE (El Trabajante — ESP32 Firmware)

### Was ich weiss (Life-Repo Perspektive)

**Praktischer Nutzen:** Die ESP32 sind die physischen Arbeitstiere. Billig (~5 EUR), stromsparend, WLAN-faehig. Sie lesen Sensoren aus, schalten Aktoren und schicken alles per MQTT an den Server. Bewusst "dumm" gehalten — alle Intelligenz liegt auf dem Server.

**Technische Eckdaten:**
- 100 Source-Dateien (42 .cpp + 58 .h), C++ Arduino Framework
- 16-Schritt Boot-Sequenz mit GPIO Safe-Mode
- 4 Sensor-Schnittstellen: Analog (ADC), Digital, I2C, OneWire
- 4 Aktor-Typen: Pumpe (Laufzeitschutz), Ventil, PWM (stufenlos), Relay
- Pi-Enhanced Processing: Rohdaten an Server, Fallback lokal
- SafetyController mit Emergency-Stop (<100ms)
- Circuit Breaker fuer MQTT, WiFi, Pi-Enhanced
- NVS-Persistenz fuer alle Konfigurationen
- Zero-Touch Provisioning ueber Captive Portal
- Watchdog-System mit Boot-Loop-Detection
- 163 Wokwi-Simulator-Szenarien

**9 unterstuetzte Sensortypen:**

| Sensor | Messwert | Schnittstelle | Praktischer Einsatz |
|--------|----------|---------------|---------------------|
| DS18B20 | Temperatur (Grad C) | OneWire | Luft, Wasser, Substrat |
| SHT31 | Temperatur + Luftfeuchtigkeit | I2C | Gewaechshaus-Klima |
| BMP280/BME280 | Luftdruck (+ Temp/Feuchte) | I2C | Wetterdaten |
| pH-Sensor | pH-Wert | Analog (ADC) | Naehrloesung, Boden |
| EC-Sensor | Leitfaehigkeit (uS/cm) | Analog (ADC) | Naehrstoffkonzentration |
| Bodenfeuchte | Feuchtigkeit (%) | Analog (ADC) | Substrat-Monitoring |
| CO2-Sensor | CO2 (ppm) | Variabel | Gewaechshaus-Luft |
| Lichtsensor | Lichtstaerke (Lux) | Analog (ADC) | Beleuchtungssteuerung |
| Durchflusssensor | Durchfluss (L/min) | Digital | Bewaesserung |

**4 Aktor-Typen:**

| Aktor | Steuerung | Sicherheit | Typischer Einsatz |
|-------|-----------|-----------|-------------------|
| Pumpe | Ein/Aus | Laufzeitschutz (max Sekunden) | Bewaesserungspumpe |
| Ventil | Ein/Aus | — | Magnetventil, Tropfsystem |
| PWM | 0-255 stufenlos | — | Luefter-Geschwindigkeit |
| Relay | Ein/Aus | — | Beleuchtung, Heizung |

**Was laut Life-Repo fehlt (Stand: 92% — Core-Firmware funktioniert, Wokwi Full Boot bestanden):**
- Kaiser-Relay-Kommunikation (Topic-Schema vorbereitet, Relay-Firmware fehlt) — HINTERGRUND, nicht Prio
- OTA-Firmware-Updates — HINTERGRUND, nicht Prio
- Erweiterte I2C-Sensor-Treiber (aktuell: SHT31, BMP280, BME280)
- Deep-Sleep-Modus fuer batteriebetriebene Sensoren — HINTERGRUND

**Was ich NICHT weiss und du ergaenzen musst:**
- [x] Welche der 100 Source-Dateien sind die Kern-Module? → Siehe Ordnerstruktur unten
- [x] Funktioniert die Sensor-Auslese aktuell fehlerfrei? → Ja, ueber `SensorManager`. Sensor-Driver-Dateien sind 0-Byte-Placeholder (Logik zentral in sensor_manager.cpp)
- [x] Funktioniert die Kalibrierung fuer pH/EC auf Firmware-Seite? → **NEIN** — bewusst nicht. ESP32 sendet NUR RAW-Werte (`raw_mode = true` hardcoded). Kalibrierung laeuft komplett auf dem Server
- [x] Wie genau funktioniert das Pi-Enhanced Processing? → 2-Schichten-System mit HTTP-POST an Server + lokaler Fallback bei Circuit-Breaker-Open. Siehe Details unten
- [x] Welche MQTT-Topics sendet die Firmware genau? → 18+ Topics via `TopicBuilder`. Pattern: `kaiser/{kaiser_id}/esp/{esp_id}/...`
- [x] Gibt es bekannte Bugs oder instabile Bereiche? → 6 aktive TODOs (NVS-Diagnostik, Safe-Mode, Emergency-Token-Validierung). Keine kritischen Bugs. BUG-009 wurde bereits gefixt
- [x] Wie sieht der Captive-Portal-Flow aus? Funktioniert er? → Vollstaendig implementiert mit State Machine, DNS-Captive-Detection, HTML-Formular. Funktioniert

### Auto-One Ergaenzung

**Ordnerstruktur (`El Trabajante/src/`):**

| Ordner | Beschreibung | Kern-Dateien |
|--------|-------------|-------------|
| `core/` | Anwendungskern | `application.cpp`, `main_loop.cpp`, `system_controller.cpp` |
| `drivers/` | Hardware-Abstraktions-Layer | `gpio_manager`, `i2c_bus`, `onewire_bus`, `pwm_controller` |
| `drivers/hal/` | HAL-Interface (Testbarkeit) | `igpio_hal.h`, `esp32_gpio_hal.h` |
| `models/` | Datenstrukturen | `sensor_types.h`, `mqtt_messages.h`, `error_codes.h` |
| `services/sensor/` | Sensor-Verwaltung | `sensor_manager.cpp` (~1300 Zeilen), `pi_enhanced_processor.cpp` |
| `services/actuator/` | Aktor-Verwaltung | `actuator_manager`, `safety_controller`, `pump/valve/pwm/relay_actuator` |
| `services/communication/` | Konnektivitaet | `mqtt_client`, `wifi_manager`, `http_client`, `webserver` |
| `services/provisioning/` | Zero-Touch Setup | `provision_manager.cpp` (~1200 Zeilen, inkl. HTML-Portal) |
| `services/config/` | Konfigurationsmanagement | `config_manager`, `storage_manager`, `library_manager` |
| `error_handling/` | Fehlerbehandlung | `error_tracker`, `circuit_breaker`, `health_monitor` |
| `utils/` | Utilities | `topic_builder.cpp`, `logger.h`, `time_manager.h`, `json_helpers` |
| `config/` | Hardware-Profile | `system_config.h`, `feature_flags.h`, `hardware/esp32_dev.h` |

**Pi-Enhanced Processing (2-Schichten-System):**

| Modus | Bedingung | Ablauf | Qualitaet |
|-------|-----------|--------|-----------|
| **Normal** | Server erreichbar | ESP32 → HTTP POST `/api/v1/sensors/process` → Server kalibriert → Ergebnis zurueck → MQTT publish | `good` (Server-Kalibrierung) |
| **Fallback** | Circuit Breaker OPEN (5 Fehler) | ESP32 nutzt lokale Formeln (z.B. DS18B20: raw × 0.0625°C) → MQTT publish mit Error-Flag | `fair` (keine Kalibrierung) |

Circuit-Breaker-Parameter: 5 Fehlversuche → OPEN, 60s Wartezeit → HALF_OPEN, 10s Test-Timeout.

**Captive-Portal-Flow:**
1. ESP32 startet → prüft NVS nach WiFi-Config → nicht vorhanden → AP-Mode
2. SSID: `AutoOne-{ESP_ID}`, Passwort: `provision`, IP: `192.168.4.1`
3. DNS-Server auf Port 53 (automatische Captive-Portal-Erkennung fuer Windows/macOS/iOS)
4. HTTP-Formular: WiFi-SSID, WiFi-Passwort, MQTT-Server-IP, MQTT-Port, MQTT-Username/Password
5. Validierung → NVS-Speicherung → ESP.restart() → WiFi+MQTT-Verbindung
6. Timeouts: AP-Mode 10min, Waiting 5min, Max 3 Retries

**Groesste Dateien:** `main.cpp` (~2600 Zeilen, alle MQTT-Subscriptions), `sensor_manager.cpp` (~1300 Zeilen), `provision_manager.cpp` (~1200 Zeilen, inkl. HTML)

---

## DOMAIN 2: CONNECTIVITY (MQTT-Broker + Netzwerk)

### Was ich weiss (Life-Repo Perspektive)

**Praktischer Nutzen:** MQTT ist der Nachrichtenbus. Jedes Geraet "published" seine Messwerte an Topics (z.B. `sensor/esp01/temperature`), der Server "subscribed" und empfaengt alles. Extrem effizient — funktioniert auch bei instabilem WLAN, weil Nachrichten zwischengespeichert werden. Standard-Protokoll, von Milliarden IoT-Geraeten weltweit genutzt.

**Technische Eckdaten:**
- Mosquitto MQTT-Broker (Port 1883)
- 14 MQTT-Handler auf Server-Seite:
  - Sensor, Heartbeat, Actuator-Status, Actuator-Response, Actuator-Alert
  - Config, Zone-ACK, Subzone-ACK
  - LWT (Last Will and Testament = "Geraet offline"), Error
  - Discovery, Diagnostics, Kaiser (Multi-Kaiser-Vorbereitung)
- QoS-Level konfigurierbar
- LWT fuer automatische Offline-Erkennung
- Topic-Schema fuer Kaiser-Relay vorbereitet (`kaiser/{kaiser_id}/...`)

**Was laut Life-Repo fehlt:**
- MQTT-Authentifizierung (ACL + TLS) fuer Produktion — dokumentiert aber nicht implementiert
- Aktuell: Keine Verschluesselung, kein Passwortschutz

**Was ich NICHT weiss und du ergaenzen musst:**
- [x] Exaktes MQTT-Topic-Schema → `kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}`. 37 Topics dokumentiert in `.claude/reference/api/MQTT_TOPICS.md` (1087 Zeilen, v2.2). Kaiser_id aktuell immer `god`
- [x] QoS-Level pro Topic-Typ → 3 Stufen: QoS 0 (Heartbeat/Diagnostics), QoS 1 (Sensor-Daten/Status/Alerts), QoS 2 (Actuator-Commands/Config). Konfigurierbar via Umgebungsvariablen
- [x] Mosquitto-Konfiguration → `docker/mosquitto/mosquitto.conf` (76 Zeilen). Port 1883 (MQTT) + 9001 (WebSocket). `allow_anonymous true` (Development). Max 1000 queued Messages, 256KB Message-Size-Limit
- [x] Reconnect-Verhalten → Server: Exponential Backoff 1s-60s (`reconnect_delay_set`), PID-basierte Client-ID (verhindert Reconnect-Schleifen). Circuit Breaker: 5 Fehler → OPEN, 30s Recovery, 1000-Message Offline-Buffer
- [x] Message-Format → JSON. Pflichtfelder Sensor: `{ts, esp_id, gpio, sensor_type, raw, raw_mode}`. Pflichtfelder Heartbeat: `{ts, esp_id, uptime, heap_free, wifi_rssi}`. Pflichtfelder Actuator-Command: `{command, value, duration, timestamp}`
- [x] Gibt es bekannte Probleme? → 1 TODO (Config-Push-Tracking in Heartbeat-ACK). Keine kritischen Bugs. Disconnect-Rate-Limiting verhindert Log-Spam (max 1 Log/60s)

### Auto-One Ergaenzung

**QoS-Strategie (definiert in `src/core/constants.py`):**

| QoS | Konstante | Verwendung | Garantie |
|-----|-----------|-----------|----------|
| **0** | `QOS_HEARTBEAT` | Heartbeat, Diagnostics | At most once (darf verloren gehen) |
| **1** | `QOS_SENSOR_DATA` | Sensordaten, Alerts, Status | At least once (kein Datenverlust) |
| **2** | `QOS_ACTUATOR_COMMAND` | Actuator-Befehle, Config | Exactly once (kritische Befehle) |

**14 MQTT-Handler auf Server-Seite (`src/mqtt/handlers/`):**

| Handler | Topic-Pattern | Richtung |
|---------|--------------|----------|
| `SensorDataHandler` | `kaiser/+/esp/+/sensor/+/data` | ESP→Server |
| `HeartbeatHandler` | `kaiser/+/esp/+/system/heartbeat` | ESP→Server |
| `ActuatorStatusHandler` | `kaiser/+/esp/+/actuator/+/status` | ESP→Server |
| `ActuatorResponseHandler` | `kaiser/+/esp/+/actuator/+/response` | ESP→Server |
| `ActuatorAlertHandler` | `kaiser/+/esp/+/actuator/+/alert` | ESP→Server |
| `ConfigHandler` | `kaiser/+/esp/+/config_response` | ESP→Server |
| `LWTHandler` | `kaiser/+/esp/+/system/will` | ESP→Server (automatisch bei Disconnect) |
| `ErrorEventHandler` | `kaiser/+/esp/+/system/error` | ESP→Server |
| `DiagnosticsHandler` | `kaiser/+/esp/+/system/diagnostics` | ESP→Server |
| `ZoneAckHandler` | `kaiser/+/esp/+/zone/ack` | ESP→Server |
| `SubzoneAckHandler` | `kaiser/+/esp/+/subzone/ack` | ESP→Server |
| `DiscoveryHandler` | `kaiser/+/discovery/esp32_nodes` | ESP→Server (DEPRECATED) |
| `KaiserHandler` | Multi-Kaiser-Topics | Zukunftsfeature |

**Publisher (Server→ESP):** `src/mqtt/publisher.py` — Methoden: `publish_actuator_command()`, `publish_sensor_command()`, `publish_system_command()`, `publish_config()`, `publish_zone_assign()`, `publish_emergency_broadcast()`. Alle mit QoS-Management und Retry.

**Resilience-Stack:**
- Circuit Breaker (5 Fehler → OPEN, 30s Recovery)
- Offline Buffer (max 1000 Messages, Flush-Batch 50)
- Exponential Backoff (1-60s bei Reconnect)
- Subscriber ThreadPool (max 10 Worker)

---

## DOMAIN 3: PROCESSING (El Servador — FastAPI Backend)

### Was ich weiss (Life-Repo Perspektive)

**Praktischer Nutzen:** Das ist die zentrale Intelligenz — das Gehirn des Systems. Alle Daten kommen hier zusammen, werden verarbeitet und gespeichert. Neue Sensortypen, neue Regeln, neue Auswertungen — man aendert nur hier. Das macht das System flexibel: Man muss nie die Firmware auf den ESP32 anfassen.

**Technische Eckdaten:**
- FastAPI (Python), 100+ Python-Dateien in 12 Modulordnern
- ~140 REST-Endpoints ueber 17 Router (CRUD, Commands, Health, Diagnostics)
- 14 MQTT-Handler (empfangen und verarbeiten Geraete-Nachrichten)
- PostgreSQL (19 Tabellen, Alembic Migrations)
- JWT-Authentifizierung mit Admin/Operator-Rollen

**9 Sensor-Processing-Libraries:**

| Library | Verarbeitung | Praktischer Nutzen |
|---------|-------------|-------------------|
| pH | Kalibrierung, Temperaturkompensation | Korrekte pH-Werte trotz Temperaturschwankungen |
| EC | Kalibrierung, Temperaturkompensation | Naehrstoffkonzentration praezise messen |
| Temperatur | Ausreisser-Erkennung, Glaettung | Zuverlaessige Temperaturwerte |
| Feuchtigkeit | Bereichspruefung (0-100%) | Sinnvolle Feuchtigkeitswerte |
| Bodenfeuchte | Kalibrierung pro Substrattyp | Bewaesserungsentscheidungen |
| Druck | Hoehenkompensation | Barometrische Korrektur |
| CO2 | Baseline-Korrektur | Zuverlaessige CO2-Werte |
| Licht | Lux-Berechnung, DLI-Integral | Beleuchtungssteuerung |
| Durchfluss | Volumenberechnung | Wasserverbrauch tracken |

**Cross-ESP Logic Engine:**

| Bedingungen | Aktionen |
|-------------|----------|
| Sensor-Schwellwert (>, <, ==, zwischen) | Aktor schalten (Ein/Aus/PWM) |
| Zeitfenster (z.B. 08:00-18:00) | Verzoegerung (1s-1h) |
| Hysterese (Anti-Flattern) | Benachrichtigung (Dashboard, Email, Webhook) |
| AND/OR-Kombinationen | Sequenz (verkettete Aktionen) |

**Safety-System:**
- ConflictManager: Verhindert parallelen Aktor-Zugriff
- RateLimiter: Begrenzt Ausfuehrungen pro Zeiteinheit
- LoopDetector: Erkennt zirkulaere Regelabhaengigkeiten
- Emergency-Stop: Alle Aktoren netzwerkweit in <100ms stoppen

**Resilience-System:**
- 3 Circuit Breaker (DB, MQTT, externe APIs)
- Retry mit Backoff
- Timeout-Management
- Offline-Buffer

**Was laut Life-Repo fehlt (Stand: 95%):**
- KI-Inferenz-Service (Stub vorhanden, ai_predictions-Tabelle angelegt)
- Kaiser-Service fuer Multi-Kaiser-Koordination (Stub) — HINTERGRUND
- Library-OTA-Service fuer Sensor-Library-Updates (Stub) — HINTERGRUND
- Health-Service Aggregation (Stub)

**Was ich NICHT weiss und du ergaenzen musst:**
- [x] Ordnerstruktur → 12 Modulordner: `api/v1/` (17 Router), `mqtt/handlers/` (14), `db/models/` (16), `db/repositories/` (16), `sensors/sensor_libraries/active/` (9), `services/` (23 + 22 Logic-Submodule), `core/` (14), `schemas/` (20), `websocket/` (2), `middleware/` (2), `utils/` (6), `autoops/` (2+)
- [x] Essentielle Endpoints → Health (5), ESP (15), Sensors (10+4 Processing), Actuators (10), Auth (8), Zones (8), Logic (10). Nice-to-have: AI (Stub), Kaiser (Stub), Library (Stub), Debug
- [x] Sensor-Datenfluss → MQTT-Message → `sensor_handler.py` (Parse+Validate) → `library_loader.py` (Sensor-Typ-Processor laden) → Library `process()` → DB INSERT `sensor_data` → LogicEngine `evaluate_sensor_data()` async → WebSocket `sensor_data_update` Broadcast
- [x] Alle 9 Sensor-Libraries → **ALLE VOLLSTAENDIG**: temperature, ph, ec, humidity, moisture, light, pressure, co2, flow. Jede hat `process()` + `calibrate()` + Multi-Mode-Support
- [x] Kalibrierung → `POST /api/v1/sensors/calibrate` — Request: `{esp_id, gpio, sensor_type, calibration_points[{raw, reference}], method}`. pH/EC: 2-Point-Linear (slope+offset). Moisture: 2-Point (dry/wet). Temp: Offset-Korrektur. Ergebnis wird in `sensor_config.calibration_data` (JSON) gespeichert
- [x] Logic Engine → Regeln als `CrossESPLogic` in DB: `trigger_conditions` (JSON) + `actions` (JSON-Array). Evaluation: Sensor-Message → Matching Rules finden → Conditions evaluieren (SensorCondition, TimeCondition, Compound AND/OR) → Safety-Check → Action ausfuehren (Actuator, Delay, Notification)
- [x] Emergency-Stop → Per API (`POST /api/v1/actuators/emergency-stop`) UND per MQTT (`kaiser/broadcast/emergency`). ConflictManager gibt Safety-Commands Prioritaet -1000 (gewinnen IMMER). Recovery nur manuell
- [x] Health-Endpoints → 5 Stueck: `/health/` (basic status), `/health/live` (alive:true), `/health/ready` (DB+MQTT+Disk checks), `/health/detailed` (Auth required, vollstaendiger Report), `/health/esp` (Auth required, Fleet-Summary)
- [x] Stubs → `ai.py` (nur Skeleton), `kaiser.py` (nur Skeleton), `library.py` (nur Skeleton). Alle 3 sind reine Interface-Definitionen ohne Business-Logik. Core-Services sind ALLE vollstaendig implementiert
- [x] Performance → Kein bekanntes Bottleneck. Async DB-Sessions, ThreadPool fuer MQTT-Handler (10 Worker). DB-Query-Latenz wird per Prometheus Histogram getrackt
- [x] Sensor-Werte abspeichern → Funktioniert End-to-End: ESP32 sendet RAW via MQTT → Handler validiert → Library verarbeitet → INSERT in `sensor_data` mit quality + processed_value. Voraussetzung: ESP in DB registriert + Sensor konfiguriert

### Auto-One Ergaenzung

**Backend-Ordnerstruktur (`El Servador/god_kaiser_server/src/`):**

| Ordner | Dateien | Zweck |
|--------|---------|-------|
| `api/v1/` | 17 Router | REST-Endpoints (health, esp, sensors, actuators, zones, logic, auth, users, audit, debug, errors, sequences, ai*, kaiser*, library*, sensor_type_defaults, subzone) |
| `mqtt/handlers/` | 14 Handler | MQTT-Message-Verarbeitung (sensor, heartbeat, actuator×3, config, lwt, error, diagnostics, zone_ack, subzone_ack, discovery, kaiser) |
| `db/models/` | 16 Models | SQLAlchemy ORM (esp, sensor, actuator, logic, zone, subzone, user, auth, audit_log, ai, kaiser, library, heartbeat, system, sensor_type_defaults, logic_validation) |
| `db/repositories/` | 16 Repos | Repository-Pattern mit async CRUD |
| `sensors/sensor_libraries/active/` | 9 Libraries | temperature, ph, ec, humidity, moisture, light, pressure, co2, flow |
| `services/` | 23 Services | Business-Logik (esp, sensor, actuator, logic_engine, safety, zone, health, config_builder, audit, scheduler, ...) |
| `services/logic/safety/` | 3 Module | ConflictManager, RateLimiter, LoopDetector |
| `core/` | 14 Dateien | Config, Security, Logging, Metrics, Resilience (Circuit Breaker, Retry) |
| `schemas/` | 20 Dateien | Pydantic Request/Response Models |

**Sensor-Datenfluss (vollstaendiger Trace):**

```
ESP32 publiziert: kaiser/god/esp/{id}/sensor/{gpio}/data
  │  Payload: {ts, esp_id, gpio, sensor_type, raw, raw_mode: true}
  ▼
sensor_handler.py → Parse Topic + Validate Payload (Pydantic)
  │  → Lookup ESP Device + Sensor Config (DB, mit Circuit Breaker)
  ▼
library_loader.py → Lade passenden Processor (z.B. temperature.py)
  │  → processor.process(raw_value, calibration_data)
  │  → Return: {processed_value, unit, quality, warnings}
  ▼
sensor_data INSERT → PostgreSQL (mit Indizes fuer Time-Series)
  │
  ├──▶ LogicEngine.evaluate_sensor_data() → async (non-blocking)
  │     └─ Matching Rules → Conditions → Safety-Check → Actions
  │
  └──▶ WebSocket Broadcast → sensor_data_update Event → Frontend
```

**Safety-System (3 Komponenten in `services/logic/safety/`):**

| Komponente | Zweck | Mechanismus |
|-----------|-------|-------------|
| `ConflictManager` | Verhindert konkurrierende Actuator-Befehle | Actuator-Locks mit TTL (60s), Priority-basiert, Safety-Commands = Prio -1000 |
| `RateLimiter` | Begrenzt Regelausfuehrungen | Token-Bucket: Global 100/s, Per-ESP 20/s, Per-Rule konfigurierbar. Burst-Faktor 1.5x |
| `LoopDetector` | Erkennt Endlos-Loops in Rule-Chains | DFS-Graph-Analyse, Max-Depth 10. Wird VOR DB-Save aufgerufen (LogicValidator) |

**Stubs (nicht fuer Testlauf relevant):**
- `api/v1/ai.py` — KI-Inferenz-Service (Skeleton, `ai_predictions`-Tabelle existiert)
- `api/v1/kaiser.py` — Multi-Kaiser-Koordination (Skeleton, `kaiser_registry`-Tabelle existiert)
- `api/v1/library.py` — Sensor-Library-OTA (Skeleton, `library_metadata`-Tabelle existiert)

---

## DOMAIN 4: APPLICATION (El Frontend — Vue 3 Dashboard)

### Was ich weiss (Life-Repo Perspektive)

**Praktischer Nutzen:** Das Web-Dashboard ist das Fenster in das System. Jeder — Robin, Kunden, Club-Team — kann im Browser sehen was passiert, Regeln erstellen und Alarme einrichten. Keine App, keine Installation.

**Technische Eckdaten:**
- Vue 3 + TypeScript mit Tailwind CSS
- 103 Komponenten (86 Feature + 17 Design-System), 11 Views, 13 Pinia Stores
- 23 WebSocket-Events fuer Echtzeit-Updates
- 64 Test-Dateien (Unit + Integration + E2E, Vitest + Playwright)

**3-Level-Zoom-Navigation:**
1. **Zone Overview:** Alle Zonen auf einen Blick (z.B. Gewaechshaus A, Gewaechshaus B, Aussenbereich)
2. **Zone Detail:** Alle Geraete in einer Zone (ESP32 mit ihren Sensoren/Aktoren)
3. **Device Detail:** Einzelnes Geraet mit allen Sensoren, Aktoren, Live-Werten

**Weitere Features:**
- Logic-Rule-Builder: Automationsregeln per Klick erstellen
- ESP-Discovery: Neue Geraete finden und genehmigen
- Mock-ESP Management: Test-Geraete simulieren
- Design-System mit Primitives, Layout, Patterns

**Was laut Life-Repo fehlt (Stand: 88% — alle Unit-Tests gruen, Rule-Builder funktioniert):**
- Analyse-Profile UI (Dashboard fuer Datenerfassungs-Steuerung)
- Historische Daten-Visualisierung (Zeitreihen-Charts) — KRITISCH fuer Testlauf
- Kalibrierungs-Wizard fuer pH/EC-Sensoren — KRITISCH fuer Testlauf
- Benutzer-Management UI (Admin-Panel)
- Mobile-Responsive Optimierung
- Erweiterte Notifications (Email/Webhook-Konfiguration im UI)

**Was ich NICHT weiss und du ergaenzen musst:**
- [x] Ordnerstruktur → `components/` (97 Vue-Dateien in 15 Unterordnern: charts, command, common, dashboard, database, error, esp, filters, forms, layout, modals, rules, safety, system-monitor, zones). Plus `shared/design/` (Primitives, Layout, Patterns)
- [x] Die 13 Pinia Stores → auth, actuator, config, dashboard, database, dragState, gpio, logic, notification, sensor, ui, zone (alle in `shared/stores/`), esp (Legacy in `stores/`)
- [x] Die 23 WebSocket-Events → sensor_data, actuator_status, esp_health, config_response, device_discovered/rediscovered/approved/rejected, actuator_response/alert/command/command_failed, zone_assignment, subzone_assignment, logic_execution, sequence_started/step/completed/error/cancelled, config_published/failed, server_log, error_event
- [x] Logic-Rule-Builder → **JA, funktioniert End-to-End.** Vue Flow basierter visueller Editor (Node-RED-Style) mit Glassmorphism-Nodes, Drag&Drop von Palette, Regel↔Graph-Konvertierung, Live-Execution-Flash
- [x] ESP-Discovery → Approval-Flow existiert: `device_discovered` WS-Event → Frontend zeigt "Pending" → Admin genehmigt/lehnt ab → `device_approved`/`device_rejected` Event
- [x] Kalibrierungs-Wizard → **Fehlt noch.** Es gibt `EditSensorModal.vue` und `SensorConfigPanel.vue` fuer Sensor-Bearbeitung, aber KEIN dedizierter Kalibrierungs-Wizard mit Schritt-fuer-Schritt-Anleitung. Server-API (`/sensors/calibrate`) existiert bereits
- [x] Zeitreihen-Charts → **Chart.js 4.5.0** + vue-chartjs 5.3.2 + chartjs-adapter-date-fns. 4 Chart-Komponenten: `GaugeChart`, `LiveLineChart`, `StatusBarChart`, `MultiSensorChart`. Library-Entscheidung ist getroffen
- [x] Stabile Komponenten → Dashboard, Zone-Management, ESP-Verwaltung, Rule-Builder sind stabil. 1118/1118 Vitest-Tests bestanden
- [x] Routing → 11 Hauptseiten: `/` (Dashboard), `/login`, `/setup`, `/sensors`, `/logic`, `/settings`, `/system-monitor` (Admin), `/users` (Admin), `/system-config` (Admin), `/maintenance` (Admin), `/load-test` (Admin). Legacy-Redirects fuer alte URLs
- [x] WebSocket-Events → Zuverlaessig via `useWebSocket` Composable mit automatischem Cleanup in `onUnmounted()`. Keine bekannten Sync-Probleme

### Auto-One Ergaenzung

**Komponenten-Organisation (`El Frontend/src/`):**

| Ordner | Inhalt | Beispiele |
|--------|--------|----------|
| `components/esp/` | ESP32-Geraete-Verwaltung | `ESPCard.vue`, `ESPDetailPanel.vue`, `EditSensorModal.vue`, `AddSensorModal.vue`, `SensorConfigPanel.vue` |
| `components/zones/` | Zonen-Navigation (3-Level-Zoom) | `ZoneOverview.vue`, `ZoneDetailPanel.vue`, `ZoneMonitorView.vue` |
| `components/rules/` | Visueller Rule-Builder | `RuleFlowEditor.vue` (Vue Flow), `RuleCard.vue`, `RuleConfigPanel.vue`, `RuleNodePalette.vue` |
| `components/charts/` | Datenvisualisierung | `GaugeChart.vue`, `LiveLineChart.vue`, `StatusBarChart.vue`, `MultiSensorChart.vue` |
| `components/dashboard/` | Dashboard-Widgets | Karten, Uebersichten, Status |
| `components/safety/` | Sicherheits-UI | Emergency-Stop, Warnungen |
| `components/system-monitor/` | Admin-Monitoring | Logs, Events, DB-Explorer |
| `shared/design/primitives/` | 10 Basis-Komponenten | `BaseButton`, `BaseCard`, `BaseInput`, `BaseModal`, `BaseSelect`, `BaseSkeleton`, `BaseSpinner`, `BaseToggle`, `BaseBadge` |
| `shared/design/patterns/` | 5 High-Level-Patterns | `ConfirmDialog`, `ContextMenu`, `EmptyState`, `ErrorState`, `ToastContainer` |
| `shared/design/layout/` | 3 Layout-Komponenten | `AppShell` (Hauptlayout), `TopBar`, `Sidebar` |

**13 Pinia Stores:**

| Store | Zweck |
|-------|-------|
| `auth` | JWT-Tokens, Login/Logout, Benutzer-Session |
| `esp` | ESP32-Geraete, Discovery, Approval |
| `sensor` | Sensor-Daten und Konfiguration |
| `actuator` | Aktor-Verwaltung und Status |
| `zone` | Zonen-Hierarchie, Zuweisungen |
| `logic` | Automatisierungsregeln, CrossESP-Verbindungen |
| `dashboard` | Dashboard-State, Widget-Konfiguration |
| `config` | System-Konfiguration |
| `notification` | Toast-Benachrichtigungen |
| `ui` | UI-State (Modals, Sidebars, aktive Panels) |
| `gpio` | GPIO-Pin-Status und Zuordnungen |
| `dragState` | Drag&Drop-State (fuer Zone-Zuweisung) |
| `database` | DB-Explorer State |

**Was fehlt fuer den Testlauf:**
- **Kalibrierungs-Wizard** — Server-API existiert, UI-Wizard fehlt (Schritt-fuer-Schritt pH/EC-Kalibrierung)
- **Historische Zeitreihen-Ansicht** — Chart-Komponenten vorhanden, aber keine dedizierte Ansicht fuer historische Daten-Abfrage mit Zeitbereich-Selektion

**16 API-Clients** (`src/api/`): actuators, sensors, esp, logic, zones, subzones, users, auth, config, database, audit, logs, health, errors, debug, loadtest

**16 Composables** (`src/composables/`): useWebSocket, useToast, useModal, useDeviceActions, useGrafana, useGpioStatus, useQueryFilters, useKeyboardShortcuts, useCommandPalette, useContextMenu, useZoneDragDrop, useSwipeNavigation, useScrollLock, useZoomNavigation, useConfigResponse

---

## DOMAIN 5: DATA (PostgreSQL + Datenmodell)

### Was ich weiss (Life-Repo Perspektive)

**Praktischer Nutzen:** Jeder einzelne Messwert wird gespeichert — mit Zeitstempel, Qualitaetsbewertung und Kontext. Man kann spaeter fragen: "Wie war die Temperatur letzte Woche?" oder "Wann wurde zuletzt pH gemessen?" Das ist die Grundlage fuer Auswertung, Optimierung und spaeter KI.

**Technische Eckdaten:**
- PostgreSQL, 19 Tabellen
- Alembic Migrations (Versionierung des Schemas)
- Time-Series-Speicherung fuer Sensordaten

**Datenqualitaet:**
Jeder Messwert wird bewertet: `excellent` | `good` | `fair` | `poor` | `bad` | `stale`

**Erfassungsmodi:**
- `continuous` — permanent (konfigurierbare Intervalle 2s-5min)
- `on_demand` — manuell ausgeloest (pH-Sonde eintauchen)
- `scheduled` — Server-gesteuerte Zeitplaene

**Kern-Tabellen (bekannt aus Life-Repo):**

| Tabelle | Inhalt | Zweck |
|---------|--------|-------|
| sensor_data | Zeitreihen-Messwerte | Hauptdatenquelle: value, unit, quality, raw_value, timestamp |
| sensor_configs | Sensor-Konfiguration | Typ, GPIO, Intervall, Modus |
| cross_esp_logic | Automationsregeln | Conditions + Actions als JSON |
| logic_execution_history | Regel-Ausfuehrungen | Wann wurde welche Regel getriggert |
| ai_predictions | KI-Vorhersagen (vorbereitet) | prediction_type, confidence, input/result JSON |

**Analyse-Profile (Konzept, noch nicht implementiert):**
Profile definieren welche Datenquellen fuer eine bestimmte Auswertung benoetigt werden. Das System weiss was es braucht, zieht automatisch was es kann, fordert menschliche Interaktion wo noetig.

**Was ich NICHT weiss und du ergaenzen musst:**
- [x] Alle 19 Tabellen → Siehe vollstaendige Liste unten
- [x] Retention-Policies → **Implementiert** in `audit_retention_service.py`: INFO 30d, WARNING 90d, ERROR 365d, CRITICAL nie loeschen. Test-Daten: TEST 24h, MOCK 7d, SIMULATION 30d, PRODUCTION nie. Batch-Loeschung (1000/Batch), Emergency-Stops werden IMMER aufbewahrt
- [x] Indizes → **10+ Time-Series-Indizes**: `(esp_id, gpio, timestamp)`, `(sensor_type, timestamp)`, `(timestamp DESC)`, `(data_source, timestamp)`. Auch fuer actuator_history, heartbeat_logs, audit_logs, logic_execution
- [x] Backup-Strategie → **Partiell**: Audit-Backup-Service erstellt JSON-Backup VOR Loeschung (automatisch). DB-Backup-Script (`backup_db.py`) existiert als Datei, ist aber TODO (nicht implementiert). Docker-Volume `automationone-postgres-data` wird persistiert
- [x] Migration-Status → 19+ Alembic-Migrations vorhanden (Phase 2A, 4, 6, 9 implementiert). Keine Pending-Migrations bekannt
- [x] Seed-Daten → `scripts/seed_wokwi_esp.py` registriert 3 Wokwi-ESP-Devices (ESP_00000001-3) mit pre-approved Status. `scripts/create_admin.py` fuer Admin-User. `scripts/init_db.py` fuer Schema-Erstellung
- [x] sensor_data INSERT → Direkt aus MQTT-Handler, Einzeln pro Sensor-Message. Kein Batch-Insert (jede MQTT-Message = 1 DB-Write). Multi-Value-Sensoren (SHT31 = Temp+Humidity) erzeugen 2 separate Inserts

### Auto-One Ergaenzung

**Alle 19 Tabellen:**

| # | Tabelle | Typ | Zweck |
|---|---------|-----|-------|
| 1 | `esp_devices` | Stammdaten | ESP32-Geraete: device_id, zone_id, status, capabilities (JSON) |
| 2 | `sensor_configs` | Konfiguration | Sensor-Setup: gpio, sensor_type, operating_mode, calibration_data (JSON) |
| 3 | `sensor_data` | **Time-Series** | Messwerte: raw_value, processed_value, quality, unit, timestamp |
| 4 | `actuator_configs` | Konfiguration | Aktor-Setup: gpio, actuator_type, safety_constraints (JSON) |
| 5 | `actuator_states` | Echtzeit | Aktueller Zustand: current_value, state, runtime_seconds |
| 6 | `actuator_history` | **Time-Series** | Befehls-Historie: command_type, issued_by, success, timestamp |
| 7 | `esp_heartbeat_logs` | **Time-Series** | Geraete-Gesundheit: heap_free, wifi_rssi, health_status |
| 8 | `cross_esp_logic` | Konfiguration | Automationsregeln: trigger_conditions (JSON), actions (JSON), priority, cooldown |
| 9 | `logic_execution_history` | **Time-Series** | Regel-Ausfuehrungen: trigger_data, success, execution_time_ms |
| 10 | `user_accounts` | Stammdaten | Benutzer: username, email, password_hash, role, token_version |
| 11 | `token_blacklist` | Security | JWT-Revokation: token_hash (SHA256), reason, expires_at |
| 12 | `audit_logs` | **Time-Series** | System-Events: event_type, severity, source_type, correlation_id |
| 13 | `system_config` | Konfiguration | Runtime-Config: config_key, config_value (JSON), is_secret |
| 14 | `ai_predictions` | Zukunft (Stub) | KI-Vorhersagen: prediction_type, confidence_score, result (JSON) |
| 15 | `kaiser_registry` | Zukunft (Stub) | Kaiser-Relay-Knoten: kaiser_id, zone_ids, capabilities |
| 16 | `esp_ownership` | Zukunft (Stub) | Kaiser-ESP-Zuordnung (M:M): kaiser_id, esp_id, priority |
| 17 | `library_metadata` | Zukunft (Stub) | OTA-Libraries: library_name, version, file_hash (SHA256) |
| 18 | `sensor_type_defaults` | Konfiguration | Standard-Config pro Sensor-Typ: operating_mode, timeout, supports_on_demand |
| 19 | `subzone_configs` | Konfiguration | GPIO-Subzone-Gruppierung: subzone_id, parent_zone_id, assigned_gpios (JSON) |

**sensor_data Tabelle (Detail):**
```
Primary Key: id (UUID)
Spalten: esp_id (FK, CASCADE), gpio, sensor_type, raw_value (Float),
         processed_value (Float, NULL), unit, processing_mode,
         quality, timestamp, sensor_metadata (JSON), data_source
Indizes:
  - idx_esp_gpio_timestamp: (esp_id, gpio, timestamp) → Schnelle Sensor-Historie
  - idx_sensor_type_timestamp: (sensor_type, timestamp) → Aggregation
  - idx_timestamp_desc: (timestamp DESC) → Neueste zuerst
  - idx_data_source_timestamp: (data_source, timestamp) → Production vs. Mock filtern
```

**Datenqualitaet (quality-Werte):**
`good` → Wert in typischem Bereich, kalibriert | `fair` → Wert OK, aber unkalibriert (Fallback) | `poor` → Wert ausserhalb typischem Bereich | `error` → Sensor-Fehler (z.B. DS18B20 -2032 = Drahtbruch) | `suspect` → Power-On-Reset-Wert (z.B. DS18B20 RAW 1360 = +85°C)

---

## DOMAIN 6: SECURITY (Querschnitt)

### Was ich weiss (Life-Repo Perspektive)

**Praktischer Nutzen:** Ein IoT-System das Pumpen und Ventile steuert MUSS sicher sein. Wenn jemand unbefugt Aktoren schalten kann, entsteht realer Schaden (Ueberflutung, Ueberhitzung, Ernteausfall). Security ist keine Option sondern Voraussetzung fuer jeden echten Einsatz.

**Was implementiert ist:**

| Komponente | Funktion | Status |
|-----------|----------|--------|
| GPIO Safe-Mode | Alle Pins starten sicher vor Config-Laden | Implementiert |
| Emergency-Stop | Alle Aktoren netzwerkweit in <100ms | Implementiert |
| Circuit Breaker | 3 Breaker schuetzen DB, MQTT, externe APIs | Implementiert |
| JWT-Auth | Access + Refresh Token, Admin/Operator-Rollen | Implementiert |
| Safety-System | ConflictManager, RateLimiter, LoopDetector | Implementiert |

**Was fehlt:**
- MQTT-Authentifizierung (ACL + TLS) — Dokumentiert, nicht implementiert
- OTA-Firmware-Signing — HINTERGRUND
- Audit-Logging (wer hat wann was geaendert)
- Credential-Management (Ablaufdaten, Rotation)
- Geraete-Authentifizierung am Broker (aktuell: jeder kann publishen)

**Fuer den Testlauf relevant:**
- MQTT-Auth ist fuer den internen Testlauf erstmal nicht kritisch (lokales Netzwerk)
- JWT-Auth muss funktionieren fuer Frontend-Login
- Safety-System muss getestet werden bevor echte Aktoren geschaltet werden

**Was ich NICHT weiss und du ergaenzen musst:**
- [x] JWT-Flow → Access-Token (HS256, 30min) + Refresh-Token (7d, mit JTI). Login → Tokens erhalten. Refresh → alter Refresh-Token wird blacklisted + neue Tokens. Logout → Access-Token wird per SHA256-Hash in `token_blacklist` eingetragen. Logout-All → `token_version` wird inkrementiert, alle alten Tokens sofort ungueltig
- [x] Default-Credentials → **JA, MUESSEN GEAENDERT WERDEN:** JWT_SECRET_KEY Default: `"change-this-secret-key-in-production"` (KRITISCH!). DB-Credentials: `god_kaiser/password` (in .env aendern). Kein hardcodierter Admin-User — erster User wird ueber `/api/v1/auth/setup` erstellt (nur wenn DB leer)
- [x] Safety-Tests → Tests existieren: `tests/integration/test_emergency_stop.py`, `tests/e2e/test_e2e_emergency.py`. ConflictManager, RateLimiter, LoopDetector haben eigene Tests in `tests/unit/`
- [x] MQTT-ACL-Datei → **Vorlage existiert** (auskommentiert in `mosquitto.conf` Zeile 29-31). `MQTTAuthService` kann dynamisch Credentials generieren und Broker reloaden. Password-File: bcrypt-hashed. Aktuell: `allow_anonymous true` (Development)
- [x] Ungeschuetzte Endpoints → **5 Stueck:** `/auth/status` (Check ob Setup noetig), `/auth/setup` (nur wenn 0 User), `/health/` (basic), `/health/live` (Liveness), `/health/ready` (Readiness). ALLES andere erfordert Auth. Debug-Auth-Bypass nur in non-production und explizit blocked in Production-Mode

### Auto-One Ergaenzung

**JWT-Authentifizierungs-Flow:**

```
1. SETUP (einmalig, nur wenn DB leer):
   POST /api/v1/auth/setup → Erster Admin-User anlegen

2. LOGIN:
   POST /api/v1/auth/login {username, password}
   → bcrypt-Vergleich → Access-Token (30min) + Refresh-Token (7d)

3. API-ZUGRIFF:
   Authorization: Bearer {access_token}
   → Signature-Check → Blacklist-Check → Token-Version-Check → User-Lookup

4. TOKEN-REFRESH:
   POST /api/v1/auth/refresh {refresh_token}
   → Alter Refresh-Token → Blacklist (reason: "token_rotation")
   → Neue Tokens ausgestellt

5. LOGOUT (Single Device):
   POST /api/v1/auth/logout
   → Access-Token → SHA256 → token_blacklist INSERT

6. LOGOUT ALL DEVICES:
   → user.token_version++ → Alle bestehenden Tokens sofort ungueltig
```

**3 Rollen:**

| Rolle | Rechte | Beispiel-Endpoints |
|-------|--------|-------------------|
| `admin` | Vollzugriff | User-Management, System-Config, MQTT-Auth-Config |
| `operator` | Lesen + Steuern | Actuator-Commands, Logic-Management, Sensor-Config |
| `viewer` | Nur Lesen | Dashboard, Sensor-Daten, Health (kein Schreiben) |

**Sicherheits-Befunde (fuer Testlauf OK, fuer Produktion MUSS gefixt werden):**

| Problem | Severity | Loesung |
|---------|----------|---------|
| JWT_SECRET_KEY Default-Wert | KRITISCH | In `.env` setzen vor Production |
| DB-Credentials `god_kaiser/password` | HOCH | In `.env` aendern |
| MQTT `allow_anonymous true` | HOCH | ACL aktivieren (Vorlage existiert) |
| Rate-Limiter in-memory only | MITTEL | Redis-Backend fuer Scaling |
| Refresh-Token 7 Tage gueltig | NIEDRIG | Fuer Testlauf OK |

---

## DOMAIN 7: OPERATIONS (Monitoring, Deployment, Tests)

### Was ich weiss (Life-Repo Perspektive)

**Praktischer Nutzen:** Operations beantwortet: "Laeuft das System?" und "Was ist kaputt, wenn nicht?" Ohne Operations fliegt man blind — man sieht Sensordaten aber nicht ob der Server unter Last steht oder der MQTT-Broker Nachrichten verliert.

**Monitoring-Stack (7 Container + 4 Core + 1 DevTools + 1 Hardware = 13 gesamt):**

| Komponente | Port | Funktion |
|-----------|------|----------|
| Grafana | 3000 | Dashboards, Visualisierung |
| Prometheus | 9090 | Metriken-Sammlung (Custom Gauges, Counters, Histograms) |
| Loki | — | Log-Aggregation |
| Promtail | — | Log-Shipping an Loki |
| cAdvisor | — | Container-Ressourcen |
| PostgreSQL-Exporter | — | DB-Metriken |
| Mosquitto-Exporter | — | MQTT-Metriken |

**Test-Suite (2126 Tests/Szenarien, verifiziert):**

| Schicht | Tool | Umfang | Ergebnis |
|---------|------|--------|----------|
| Backend | pytest | 109 Test-Dateien (759 Unit + Integration/E2E) | GRUEN |
| Frontend | Vitest + Playwright | 64 Test-Dateien (1118 Vitest Tests) | GRUEN |
| Firmware | Unity + Wokwi | 22 Native Tests + 163 Wokwi-Szenarien | GRUEN |

**CI/CD:** GitHub Actions Pipelines fuer Backend, Frontend und Firmware.

**Was fehlt:**
- Incident-Management-Prozess (wer macht was bei Ausfall)
- Geraete-Lifecycle-Tracking (welcher ESP hat welche Firmware-Version)
- Automatisierte Reports
- Rollback-Strategie

**Was ich NICHT weiss und du ergaenzen musst:**
- [x] docker-compose.yml → 13 Services in 3 Profilen: Core (4: postgres, mqtt-broker, el-servador, el-frontend), Monitoring (7: loki, promtail, prometheus, grafana, cadvisor, postgres-exporter, mosquitto-exporter), DevTools (1: pgadmin), Hardware (1: esp32-serial-logger)
- [x] System starten → **Ein Befehl:** `docker compose up -d` (Core-Stack). Mit Monitoring: `docker compose --profile monitoring up -d`. Full Stack: `docker compose --profile monitoring --profile devtools up -d`. Oder `make up` / `make monitor-up`
- [x] Grafana-Dashboards → **1 provisioniertes Dashboard:** "AutomationOne - Operations" mit **26 Panels** in 6 Reihen: System Status (6), Server Performance (4), ESP32 Fleet (4), MQTT Traffic (5), Database (4), Logs & Errors (3). Auto-Refresh 10s
- [x] Prometheus-Metriken → **15 Custom Gauges** (uptime, cpu%, memory%, mqtt_connected, ws_connections, esp_total/online/offline, esp_avg_heap/min_heap/avg_rssi/avg_uptime), **2 Counters** (mqtt_messages_total, mqtt_errors_total), **1 Histogram** (db_query_duration_seconds mit 10 Buckets). 7 Scrape-Jobs
- [x] Test-Pass-Rate → **Backend Unit:** alle bestanden (3 skipped). **Frontend Vitest:** 1118/1118 bestanden. **ESP32 Native Unity:** 22/22 bestanden. Integration/E2E: teilweise, abhaengig von laufendem Stack
- [x] CI/CD → **8 Pipelines:** server-tests (Push/PR, 15min), frontend-tests (Push/PR, 15min), esp32-tests (Push/PR, 15min), backend-e2e-tests (Push/PR, 20min), playwright-tests (Manual), wokwi-tests (Manual), security-scan, pr-checks. Concurrency-Control mit cancel-in-progress
- [x] Health-Endpoint → 5 Endpoints: `/health/` (basic status+MQTT), `/health/live` (alive:true), `/health/ready` (DB+MQTT+Disk checks), `/health/detailed` (Auth, vollstaendig), `/health/esp` (Auth, Fleet). Status: healthy/degraded/unhealthy
- [x] Log-Format → **Strukturiertes JSON:** `{timestamp, level, logger, message, module, function, line, request_id}`. RotatingFileHandler (10MB, 3 Backups). Loki-Ingestion via Promtail (Docker socket scraping). 7 Tage Retention

### Auto-One Ergaenzung

**Docker-Stack Architektur:**

| Profil | Services | Start-Befehl |
|--------|----------|-------------|
| **Core** (Default) | postgres, mqtt-broker, el-servador, el-frontend | `docker compose up -d` |
| **+ Monitoring** | + loki, promtail, prometheus, grafana, cadvisor, postgres-exporter, mosquitto-exporter | `docker compose --profile monitoring up -d` |
| **+ DevTools** | + pgadmin (Port 5050) | `docker compose --profile devtools up -d` |
| **+ Hardware** | + esp32-serial-logger (ser2net Bridge) | `docker compose --profile hardware up -d` |

**Startup-Order** (erzwungen durch `service_healthy`):
```
postgres + mqtt-broker (parallel)
     ↓ (beide healthy)
  el-servador
     ↓
  el-frontend
```

**Grafana-Alerting (8 provisionierte Regeln):**

| Alert | Bedingung | For | Severity |
|-------|-----------|-----|----------|
| Server Down | `up{job="el-servador"} < 1` | 1min | CRITICAL |
| MQTT Disconnected | `god_kaiser_mqtt_connected == 0` | 1min | CRITICAL |
| Database Down | `pg_up < 1` | 1min | CRITICAL |
| Loki Down | `up{job="loki"} < 1` | 2min | CRITICAL |
| Promtail Down | `up{job="promtail"} < 1` | 2min | CRITICAL |
| High Memory | `memory_percent > 85` | 5min | WARNING |
| ESP Offline >50% | `esp_offline/esp_total > 0.5` | 3min | WARNING |
| MQTT Error Rate | `mqtt_errors > 10 in 5min` | 2min | WARNING |

**CI/CD-Pipelines (8):**

| Pipeline | Trigger | Timeout | Was sie prueft |
|----------|---------|---------|---------------|
| `server-tests.yml` | Push/PR auf El Servador/** | 15min | Ruff Lint + Black Format + pytest Unit |
| `frontend-tests.yml` | Push/PR auf El Frontend/** | 15min | TypeScript Type-Check + Vitest |
| `esp32-tests.yml` | Push/PR auf tests/esp32/** | 15min | pytest mit Mosquitto Service |
| `backend-e2e-tests.yml` | Push/PR auf El Servador/** | 20min | Docker Compose + pytest E2E |
| `playwright-tests.yml` | Manual Dispatch | — | Playwright E2E |
| `wokwi-tests.yml` | Manual Dispatch | — | Wokwi Firmware-Simulation |
| `security-scan.yml` | — | — | SAST/Dependency-Scanning |
| `pr-checks.yml` | PR Events | — | Integration Checks |

**Verifizierte Test-Ergebnisse (Stand 2026-02-11):**

| Suite | Ergebnis | Details |
|-------|----------|---------|
| Backend Unit (pytest) | **BESTANDEN** | 759 Tests, 3 skipped |
| Frontend Vitest | **1118/1118 BESTANDEN** | Alle grueen |
| ESP32 Native Unity | **22/22 BESTANDEN** | 12 TopicBuilder + 10 GPIOManager |
| Wokwi Full Boot | **BESTANDEN** | 5 Phasen + MQTT + Heartbeat + Zone Assignment |

**Aktueller Docker-Status (2026-02-21, live verifiziert):**

| Service | Container | Status | Port |
|---------|-----------|--------|------|
| PostgreSQL | automationone-postgres | healthy | 5432 |
| Mosquitto MQTT | automationone-mqtt | healthy | 1883, 9001 (WS) |
| God-Kaiser Server | automationone-server | healthy | 8000 |
| Vue Frontend | automationone-frontend | healthy | 5173 |
| Loki | automationone-loki | healthy | 3100 |
| Promtail | automationone-promtail | healthy | — |
| Prometheus | automationone-prometheus | healthy | 9090 |
| Grafana | automationone-grafana | healthy | 3000 |
| cAdvisor | automationone-cadvisor | healthy | 8080 |
| PostgreSQL Exporter | automationone-postgres-exporter | healthy | 9187 (intern) |
| Mosquitto Exporter | automationone-mosquitto-exporter | **unhealthy** | 9234 (intern) |
| MQTT Logger | automationone-mqtt-logger | running | — |

12/13 Services laufen (pgAdmin/Adminer nicht gestartet = DevTools-Profil inaktiv). Mosquitto-Exporter unhealthy — kein Einfluss auf Kernfunktion.

**MCP-Server-Infrastruktur (10 aktiv, Entwicklungswerkzeuge):**

MCP (Model Context Protocol) Server erweitern Claude Code um externe Tool-Zugriffe. Sie laufen als Sidecar-Prozesse und stellen spezialisierte Tools bereit.

| MCP-Server | Quelle | Funktion | Nutzbar fuer |
|------------|--------|----------|-------------|
| **Serena** | `.mcp.json` (lokal) | Semantische Code-Analyse via LSP. Symbol-Suche, Referenz-Tracking, Rename ueber Python/TypeScript/C++ | Refactoring, Impact-Analyse, Cross-Layer-Suche |
| **Playwright** | `.mcp.json` (lokal) | Browser-Steuerung: Navigate, Snapshot, Click, Screenshot, Console, Network | Frontend-Inspektion, E2E-Debugging, UI-Verifikation |
| **Context7** | Plugin (global) | Aktuelle Dokumentation fuer beliebige Libraries abrufen | API-Lookup, Syntax-Checks, Library-Updates |
| **Sequential Thinking** | `.mcp.json` (lokal) | Strukturiertes Multi-Step-Reasoning | Komplexe Debug-Analysen, Architektur-Entscheidungen |
| **Filesystem** | Plugin (global) | Datei-Operationen ausserhalb Sandbox | System-Config-Zugriff |
| **Docker** | Plugin (global) | Docker-Container-Management | Container-Status, Logs, Exec |
| **Git** | Plugin (global) | Git-Repository-Operationen | Branch-Management, Diff-Analyse |
| **Database** | Plugin (global) | Datenbank-Abfragen (PostgreSQL) | Schema-Inspektion, Query-Ausfuehrung |
| **GitHub** | Plugin (global) | GitHub API (Issues, PRs, Actions) | CI/CD-Status, PR-Reviews |
| **Sentry** | Plugin (global) | Error-Monitoring und Tracking | Production-Error-Analyse |

Zusaetzlich konfiguriert (Forschungs-Tools, nicht AutomationOne-spezifisch): Zotero (Literaturverwaltung), Semantic Scholar (Paper-Suche).

**Konfiguration:** `.mcp.json` (Projektroot, git-committed) fuer lokale Server. Globale Server via `~/.claude/settings.json` Plugins. Serena zusaetzlich: `.serena/project.yml` (gitignored, LSP-Config fuer 3 Sprachen).

**Serena-Tools (einzigartig, kein Aequivalent in Claude Code nativ):**

| Tool | Funktion | Beispiel-Einsatz |
|------|----------|-----------------|
| `find_symbol` | Symbol nach Name suchen (Klasse, Funktion, Variable) | "Wo ist `SensorManager` definiert?" |
| `find_referencing_symbols` | Alle Referenzen auf ein Symbol finden | "Wer nutzt `process_sensor_data()`?" |
| `get_symbols_overview` | Symbol-Uebersicht einer Datei | Modul-Struktur verstehen |
| `replace_symbol_body` | Symbol-Body semantisch ersetzen | Refactoring ohne Regex |
| `insert_after_symbol` / `insert_before_symbol` | Code an semantischer Position einfuegen | Methode zu Klasse hinzufuegen |
| `rename_symbol` | Symbol projektuebergreifend umbenennen | Konsistentes Rename ueber alle 3 Sprachen |

**Einschraenkung:** Serena-Tools sind NUR im Hauptkontext verfuegbar. Subagenten (Debug/Dev-Agents) haben KEINEN MCP-Zugriff — sie arbeiten mit Grep/Glob/Read.

**Claude Code Agent-System (13 Agents, 21 Skills):**

Das Agent-System ist die KI-Entwicklungsinfrastruktur. Agents sind spezialisierte Subprozesse mit eigenem Kontext, Skills sind Wissensdatenbanken die automatisch oder manuell geladen werden.

| Kategorie | Agents | Zweck |
|-----------|--------|-------|
| **Debug** (4) | `esp32-debug`, `server-debug`, `mqtt-debug`, `frontend-debug` | Log-Analyse pro Schicht, Read-Only |
| **Dev** (4) | `esp32-dev`, `server-dev`, `mqtt-dev`, `frontend-dev` | Pattern-konforme Implementierung |
| **System** (2) | `system-control`, `db-inspector` | Operationen, DB-Inspektion |
| **Meta** (2) | `meta-analyst`, `agent-manager` | Cross-Report-Analyse, Agent-Konsistenz |
| **Test** (1) | `test-log-analyst` | Test-Failure-Analyse (pytest/Vitest/Wokwi) |

**21 Skills:**

| Skill | Trigger | Funktion |
|-------|---------|----------|
| `esp32-development` | ESP32, C++, Sensor, GPIO | Firmware-Entwicklungs-Wissensbasis |
| `server-development` | Python, FastAPI, Handler | Backend-Entwicklungs-Wissensbasis |
| `frontend-development` | Vue, TypeScript, Pinia | Frontend-Entwicklungs-Wissensbasis |
| `mqtt-development` | Topic, Publisher, QoS | MQTT-Protokoll-Entwicklung |
| `esp32-debug` | Serial, Boot, Watchdog | ESP32 Debug-Referenz (Error-Codes, Boot-Phasen) |
| `server-debug` | Handler, Error 5xxx | Server-Log-Analyse-Referenz |
| `mqtt-debug` | Broker, Traffic, LWT | MQTT-Traffic-Analyse-Referenz |
| `frontend-debug` | Build-Error, TypeScript | Frontend-Debug-Referenz |
| `meta-analyst` | Cross-Report | Report-Korrelation und Widerspruchs-Erkennung |
| `system-control` | Session, Start, Stop | System-Operationen und Briefing |
| `db-inspector` | Schema, Migration | Datenbank-Inspektion |
| `agent-manager` | Flow-Analyse, IST-SOLL | Agent-Konsistenz-Pruefung |
| `test-log-analyst` | /test, CI rot | Test-Failure-Analyse |
| `collect-reports` | Reports sammeln | Report-Konsolidierung fuer TM |
| `collect-system-status` | Status sammeln | System-Status-Snapshot |
| `updatedocs` | /updatedocs | Dokumentations-Aktualisierung |
| `do` | /do, Plan ausfuehren | Plan-Implementierung |
| `git-commit` | Commit vorbereiten | Git-Change-Analyse |
| `git-health` | Git-Analyse | Repository-Gesundheits-Check |
| `verify-plan` | /verify-plan | TM-Plan Reality-Check |
| `ki-audit` | KI-Audit | Qualitaetsaudit auf KI-Fehler |

**Zusammenspiel Agent ↔ MCP ↔ Stack:**

```
Benutzer
  │
  ▼
Claude Code (Hauptkontext)
  │
  ├──► MCP-Server (10) ─── Serena, Playwright, Context7, Docker, Git, DB, ...
  │     │                    └─ Tools direkt im Hauptkontext verfuegbar
  │     │                    └─ Playwright: Live-Browser-Inspektion des Frontends
  │     │                    └─ Serena: Semantische Code-Navigation ueber alle 3 Sprachen
  │     │                    └─ Database: Direkte PostgreSQL-Abfragen
  │     │
  ├──► Agents (13) ─── Subprozesse mit isoliertem Kontext
  │     │                └─ KEIN MCP-Zugriff (nur Grep, Glob, Read, Write, Edit, Bash)
  │     │                └─ Debug-Agents analysieren Logs → schreiben Reports
  │     │                └─ Dev-Agents implementieren Code → verifizieren mit Build
  │     │
  ├──► Skills (21) ─── Wissensdatenbanken (werden in Hauptkontext geladen)
  │     │                └─ Automatisch bei Keyword-Match ODER manuell via /skill
  │     │                └─ Enthalten Domain-Wissen: Error-Codes, Patterns, Referenzen
  │     │
  └──► auto-ops Plugin ─── Autonome System-Operationen
        │                    └─ Eigene 3 Agents + 10 Skills + 6 Commands
        │                    └─ Nutzt Playwright MCP fuer Frontend-Inspektion
        │                    └─ Nutzt Loki/Prometheus fuer Log/Metrik-Analyse
        └─ Siehe Details unten
```

**auto-ops Plugin (Autonome Operationen):**

Lokales Plugin unter `.claude/local-marketplace/auto-ops/` — erweitert Claude Code um autonome System-Diagnose und -Reparatur.

| Komponente | Umfang | Zweck |
|-----------|--------|-------|
| **3 Plugin-Agents** | auto-ops (Orchestrator), backend-inspector, frontend-inspector | Autonome Cross-Layer-Diagnose |
| **10 Plugin-Skills** | system-health, docker-operations, esp32-operations, database-operations, loki-queries, error-codes, mqtt-analysis, boot-sequences, frontend-patterns, cross-layer-correlation | Domain-Wissen fuer Operations |
| **6 Plugin-Commands** | /ops, /ops-diagnose, /ops-inspect-backend, /ops-inspect-frontend, /ops-drive, /ops-cleanup | User-Einstiegspunkte |

**auto-ops Rollen (4 Modi des Orchestrator-Agents):**

| Rolle | Trigger | Funktion |
|-------|---------|----------|
| **Operations** (Default) | /ops | Vollstaendige System-Diagnose, Fix-Vorschlaege |
| **Backend Inspector** | /ops-inspect-backend | Cross-Layer: ESP → MQTT → Server → DB |
| **Frontend Inspector** | /ops-inspect-frontend | Cross-Layer: Browser → Vue → API → Server → DB |
| **Driver** | /ops-drive | Traffic generieren, UI navigieren, Zustand dokumentieren (via Playwright MCP) |

**Verbindung auto-ops → KI-Error-Analyse:**

auto-ops ist die **operative Implementierung** der in "NEUE DOMAIN: KI-Error-Analyse" beschriebenen Stufe 1 (Rule-based). Der Orchestrator-Agent nutzt:
- Loki-Queries fuer Log-Pattern-Matching (Skill: `loki-queries`)
- Prometheus-Metriken fuer Health-Checks (Skill: `system-health`)
- Error-Code-Referenz fuer Diagnose (Skill: `error-codes`)
- Cross-Layer-Korrelation fuer Root-Cause-Analyse (Skill: `cross-layer-correlation`)

---

## NEUE DOMAIN: KI-GESTUETZTE ERROR-ANALYSE

### Die Idee

**Praktischer Nutzen:** Bevor wir den ersten echten Testlauf fahren, wollen wir eine automatisierte Error-Analyse die im Hintergrund laeuft — auf mehreren Ebenen. Statt manuell Logs zu durchsuchen, soll KI Probleme erkennen, kategorisieren und Loesungsvorschlaege machen.

### Ebenen der Error-Analyse

```
Ebene 1: ECHTZEIT-MONITORING (waehrend System laeuft)
├── Log-Stream-Analyse: Alle Logs in Echtzeit scannen
├── Pattern-Erkennung: Bekannte Fehlermuster automatisch erkennen
├── Anomalie-Detektion: Ungewoehnliche Metriken flaggen
└── Alert-Priorisierung: Wichtige von unwichtigen Fehlern trennen

Ebene 2: SENSOR-DATEN-VALIDIERUNG (pro Messwert)
├── Plausibilitaets-Check: Ist der Wert physikalisch sinnvoll?
├── Drift-Erkennung: Wandert ein Sensor ueber Zeit ab?
├── Ausreisser-Analyse: Einzelner Spike oder echtes Problem?
└── Korrelations-Check: Passt der Wert zu anderen Sensoren?

Ebene 3: SYSTEM-HEALTH-DIAGNOSE (periodisch)
├── Stack-Check: Alle Schichten automatisch durchpruefen
├── Performance-Baseline: Abweichungen von der Norm erkennen
├── Dependency-Check: Sind alle Verbindungen (DB, MQTT, WiFi) stabil?
└── Kapazitaets-Warnung: Speicher, CPU, Disk bevor es kritisch wird

Ebene 4: POST-MORTEM-ANALYSE (nach Vorfall)
├── Root-Cause-Analyse: Was hat den Fehler ausgeloest?
├── Timeline-Rekonstruktion: Was ist in welcher Reihenfolge passiert?
├── Impact-Assessment: Welche Sensoren/Aktoren waren betroffen?
└── Fix-Vorschlag: Was muss geaendert werden?
```

### Konkrete Fragen an auto-one

- [x] Wo KI-Error-Analyse einbauen? → **Ebene 1 (Log-Stream) ist am einfachsten.** Loki sammelt BEREITS alle Logs (Promtail scraped Docker socket, 7d Retention). LogQL-Queries koennen Error-Patterns erkennen. Prometheus hat BEREITS Custom-Metriken (mqtt_errors_total, db_query_duration). Grafana hat BEREITS 8 Alert-Regeln. Der Monitoring-Stack ist die ideale Andockstelle
- [x] Logging-Infrastruktur → **JA, vollstaendig vorhanden:** (1) Strukturiertes JSON-Logging im Server (request_id fuer Correlation), (2) Loki + Promtail fuer Log-Aggregation, (3) Prometheus fuer Metriken, (4) Grafana fuer Visualisierung + Alerting, (5) Audit-Log-Tabelle mit event_type, severity, correlation_id, error_code
- [x] Fehlermeldungen-Struktur → **Zweistufig:** ESP32 Error-Codes 1000-4999 (definiert in `error_codes.h`), Server Error-Codes 5000-5699 (definiert in `constants.py`). Severity: info/warning/error/critical. Kategorien: sensor, actuator, mqtt, system, config, safety. Referenz: `.claude/reference/errors/ERROR_CODES.md`
- [x] Minimaler Aufwand Ebene 1 → **Grafana Alert-Erweiterung** (KEIN Code noetig): Weitere PromQL-Alert-Regeln in `docker/grafana/provisioning/alerting/alert-rules.yml`. Beispiel: `rate(god_kaiser_mqtt_errors_total[5m]) > threshold` → Alert. Loki-Queries fuer Error-Pattern-Matching. Geschaetzter Aufwand: 1-2 Tage fuer 20+ neue Regeln
- [x] ai_predictions-Tabelle → **JA, perfekt geeignet.** Schema: `prediction_type` (z.B. "sensor_drift", "anomaly"), `target_esp_id`, `prediction_result` (JSON), `confidence_score`, `model_version`, `timestamp`. Kann direkt fuer Error-Analyse-Ergebnisse genutzt werden
- [x] KI-Ansatz → **Empfehlung: 3-Stufen-Strategie.** Stufe 1: Rule-based (Grafana Alerting, sofort nutzbar). Stufe 2: Statistische Anomalie-Detektion (Z-Score, IQR auf sensor_data Time-Series, mittel). Stufe 3: LLM-basierte Log-Analyse (Claude API fuer Root-Cause-Analyse, spaeter)

### Auto-One Ergaenzung

**Was bereits existiert und direkt nutzbar ist:**

| Infrastruktur | Status | Wo |
|--------------|--------|-----|
| Log-Aggregation | **LAEUFT** | Loki + Promtail (Docker socket, 7d Retention) |
| Metriken-Sammlung | **LAEUFT** | Prometheus (15 Gauges, 2 Counters, 1 Histogram, 7 Scrape-Jobs) |
| Alerting | **LAEUFT** | 8 Grafana-Regeln (5 Critical + 3 Warning) |
| Error-Codes | **DEFINIERT** | ESP32: 1000-4999, Server: 5000-5699 |
| Audit-Trail | **LAEUFT** | audit_logs Tabelle mit Correlation-ID |
| KI-Tabelle | **VORBEREITET** | ai_predictions (Schema existiert, leer) |
| JSON-Logs | **LAEUFT** | Strukturiert mit request_id, Severity, Modul |

**Empfohlener Implementierungsplan fuer KI-Error-Analyse:**

```
STUFE 1: RULE-BASED (sofort, 0 Code)
├── 20+ neue Grafana-Alert-Regeln (PromQL + LogQL)
├── Sensor-Plausibilitaet: Wert ausserhalb physikalischer Grenzen
├── Drift-Erkennung: Wert weicht >3σ vom 24h-Mittel ab
├── Heartbeat-Luecken: ESP offline ohne LWT
└── Kaskaden-Erkennung: 3+ Errors innerhalb 60s

STUFE 2: STATISTISCHE ANOMALIE-DETEKTION (mittel, ~1 Woche)
├── Python-Service: Z-Score / IQR auf sensor_data Time-Series
├── Sliding-Window-Analyse (1h, 24h, 7d)
├── Korrelations-Check zwischen verwandten Sensoren
├── Ergebnisse → ai_predictions Tabelle
└── Dashboard-Widget im Frontend

STUFE 3: LLM-BASIERTE ROOT-CAUSE-ANALYSE (spaeter)
├── Claude API: Strukturierte Logs → Root-Cause-Bericht
├── Automatische Timeline-Rekonstruktion
├── Fix-Vorschlaege basierend auf Error-Code-Referenz
└── Integration mit Audit-Log (correlation_id)
```

**Ebene 1 ist HEUTE schon moeglich** — nur `alert-rules.yml` erweitern, kein Code noetig. Die Infrastruktur ist vollstaendig vorhanden.

---

## PRIORIATEN FUER DEN TESTLAUF — Stack auf 100%

### Was muss funktionieren bevor wir testen koennen

```
KRITISCHER PFAD (blockiert Testlauf):

1. Sensoren speichern Werte korrekt ab
   └── MQTT → Handler → Processing-Library → PostgreSQL
   └── Alle 9 Sensortypen muessen Werte in sensor_data schreiben

2. Kalibrierung funktioniert
   └── pH/EC-Sensoren muessen kalibrierbar sein
   └── API-Endpoints + UI (mindestens Basis-UI)

3. Frontend zeigt Live-Daten
   └── WebSocket-Verbindung stabil
   └── Pinia-Stores aktualisieren sich
   └── 3-Level-Zoom funktioniert End-to-End

4. Logic Engine fuehrt Regeln aus
   └── Regel erstellen → Condition evaluieren → Action ausfuehren
   └── Cross-ESP muss funktionieren

5. Safety-System reagiert
   └── Emergency-Stop muss zuverlaessig funktionieren
   └── ConflictManager, RateLimiter muessen aktiv sein
```

### Was NICHT fuer den Testlauf noetig ist (Hintergrund)

- OTA-Firmware-Updates
- Kaiser-Relay-Kommunikation
- Multi-Tenant / Mandantenfaehigkeit
- Deep-Sleep-Modus
- Mobile-Responsive Frontend
- Email/Webhook-Notifications
- MQTT-TLS (internes Testnetzwerk)

### Fragen an auto-one

- [x] Kuerzester Pfad zum Testlauf → **Der kritische Pfad ist zu 90% bereits implementiert.** Sensor-Datenfluss (MQTT→Handler→Library→DB→WebSocket→Frontend) funktioniert End-to-End im Code. Was noch fehlt: (1) Kalibrierungs-Wizard UI (Server-API existiert, Frontend-Wizard fehlt), (2) Stack tatsaechlich hochfahren und mit echtem ESP32 testen. Die Code-Basis ist bereit, es fehlt der integrative Testlauf
- [x] Bekannte Bugs die blockieren → **Keine Show-Stopper.** ESP32-Firmware hat 6 offene TODOs (NVS-Diagnostik, Safe-Mode Entry, Emergency-Token-Validierung), aber KEINER blockiert den Grundbetrieb. BUG-009 (Status-Command) ist bereits gefixt. Sensor-Driver-Dateien sind 0-Byte-Placeholder, aber die echte Logik laeuft in `SensorManager`. Backend und Frontend haben alle Unit-Tests bestanden
- [x] Stack hochfahren → **Ein Befehl:** `docker compose up -d` (Core-Stack: PostgreSQL + Mosquitto + Server + Frontend). Dann: `docker compose --profile monitoring up -d` fuer Monitoring. Oder via Makefile: `make up`. Windows: `docker compose up -d` direkt. Erster Start: `docker compose build && docker compose up -d` + `.venv/Scripts/python.exe scripts/seed_wokwi_esp.py` fuer Testdaten
- [x] Test-Zustand → **Backend Unit: GRUEN** (759 Tests bestanden, 3 skipped). **Frontend Vitest: 1118/1118 GRUEN.** **ESP32 Native: 22/22 GRUEN.** **Wokwi Full Boot: BESTANDEN** (5 Phasen + MQTT + Heartbeat). Integration/E2E abhaengig von laufendem Stack
- [x] KI-Error-Analyse zuerst → **Grafana-Alerting erweitern** (KEIN Code noetig). Monitoring-Stack laeuft bereits. Loki sammelt Logs, Prometheus sammelt Metriken. Neue Alert-Regeln in `docker/grafana/provisioning/alerting/alert-rules.yml` hinzufuegen. Geschaetzter Aufwand: 1-2 Tage

### Auto-One Bewertung: Testlauf-Readiness

**Kritischer Pfad — Zustandsanalyse:**

| # | Anforderung | Status | Details |
|---|------------|--------|---------|
| 1 | Sensoren speichern Werte | **95% BEREIT** | Code End-to-End implementiert. Alle 9 Libraries fertig. ESP muss Sensor konfiguriert haben + in DB registriert sein |
| 2 | Kalibrierung funktioniert | **80% BEREIT** | Server-API `POST /sensors/calibrate` implementiert (2-Point pH/EC, Offset Temp). Frontend-Wizard FEHLT — Workaround: API direkt per curl/Swagger aufrufen |
| 3 | Frontend zeigt Live-Daten | **90% BEREIT** | WebSocket stabil, 13 Pinia Stores, 23 Events, Chart.js Charts vorhanden. Historische Datenansicht noch nicht als eigene View |
| 4 | Logic Engine fuehrt Regeln aus | **95% BEREIT** | End-to-End implementiert: Regel-Builder (Vue Flow) → Server → Evaluation → Actuator-Command. Safety-System (ConflictManager, RateLimiter, LoopDetector) aktiv |
| 5 | Safety-System reagiert | **100% BEREIT** | Emergency-Stop per API + MQTT. ConflictManager mit Priority-Locks. RateLimiter mit Token-Bucket. LoopDetector mit DFS-Graph-Analyse |

**Fazit:** Das System ist **90%+ bereit fuer den ersten Testlauf**. Der Code ist implementiert und getestet. Was fehlt ist der integrative Test mit echtem ESP32 und dem vollstaendigen Stack. Kalibrierung kann initial ueber die API (Swagger UI unter `/docs`) erfolgen, bis der Frontend-Wizard gebaut ist

---

## ABHAENGIGKEITSDIAGRAMM: Wer braucht wen?

```
ESP32 (Firmware)
    │
    │ sendet Rohdaten per MQTT
    │
    ▼
MQTT-Broker (Mosquitto)
    │
    │ leitet Messages weiter
    │
    ▼
FastAPI Backend (El Servador)
    │
    ├──► Sensor-Processing-Libraries (Kalibrierung, Qualitaet)
    │        │
    │        ▼
    ├──► PostgreSQL (sensor_data, configs, rules)
    │        │
    │        ▼
    ├──► Logic Engine (Regeln evaluieren)
    │        │
    │        ├──► Aktor-Befehle per MQTT an ESPs
    │        │
    │        └──► Safety-Check (ConflictManager, RateLimiter)
    │
    ├──► WebSocket-Manager
    │        │
    │        ▼
    │    Vue3 Frontend (El Frontend)
    │        │
    │        └──► Benutzer sieht Live-Daten, erstellt Regeln
    │
    ├──► REST-API
    │        │
    │        └──► Frontend-Requests, externe Integrationen
    │
    └──► [NEU] KI-Error-Analyse
             │
             ├──► Log-Analyse (Loki-Daten)
             ├──► Sensor-Validierung (sensor_data)
             └──► Health-Diagnose (Prometheus-Metriken)

MONITORING (Querschnitt)
    │
    ├──► Grafana → Dashboards
    ├──► Prometheus → Metriken
    ├──► Loki → Logs
    └──► cAdvisor → Container
```

---

## Verwandte Dateien (Life-Repo)

| Datei | Inhalt |
|-------|--------|
| `arbeitsbereiche/automation-one/README.md` | Strategische Uebersicht |
| `arbeitsbereiche/automation-one/STATUS.md` | Aktueller Entwicklungsstand |
| `arbeitsbereiche/automation-one/roadmap.md` | Entwicklungsplan |
| `arbeitsbereiche/automation-one/architektur-uebersicht.md` | Vereinfachte Architektur |
| `arbeitsbereiche/automation-one/integration/gaertner.md` | Gaertner-Geschaeftsmodell |
| `arbeitsbereiche/automation-one/integration/cannabis.md` | Cannabis-Club Monitoring |
| `arbeitsbereiche/automation-one/integration/uni.md` | Bachelorarbeit-Datengrundlage |
| `arbeitsbereiche/automation-one/integration/club-inbetriebnahme.md` | 5-Phasen Club-Plan |
| `arbeitsbereiche/automation-one/integration/consulting-inbetriebnahme.md` | 5-Phasen Consulting-Plan |
| `wissen/iot-automation/iot-manager-wissensbereiche.md` | IoT-Manager Wissensreferenz |
| `arbeitsbereiche/gaertner/orchestrierung/workflow.md` | Orchestrierungs-Workflow |
| `arbeitsbereiche/gaertner/orchestrierung/auftragsvorlage.md` | Auftrags-Template |
