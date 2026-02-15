# KI-Debug Preparation Analysis Report

> **Agent:** server-dev + system-control
> **Datum:** 2026-02-10
> **Auftrag:** `.technical-manager/commands/pending/ki-debug-preparation-analysis.md`
> **Scope:** Vollständige Erstanalyse aller Datenquellen für 8 ML-Methoden

---

## Executive Summary

**ML-Readiness Score: 4.5 / 10**

Das System hat eine solide Grundlage (strukturierte Logs, Error-Code-System, Monitoring-Stack), aber erhebliche Lücken bei Cross-Layer-Korrelation, Label-Taxonomie und ESP32-Metrik-Export. Die größte Stärke ist das bereits laufende Monitoring (Loki + Prometheus + Grafana). Die größte Schwäche ist das Fehlen einer durchgängigen Correlation-ID über MQTT-Grenzen hinweg.

---

## Teil 1: Bestandsaufnahme – Datenquellen

### 1.1 Log-Formate pro Layer

#### El Servador (FastAPI Backend)

| Eigenschaft | Wert | Code-Referenz |
|-------------|------|---------------|
| **Format (File)** | JSON-structured | `src/core/logging_config.py:37-60` |
| **Format (Console/Docker)** | Text: `YYYY-MM-DD HH:MM:SS - logger - LEVEL - [request_id] - message` | `logging_config.py:119-122` |
| **Levels** | DEBUG, INFO, WARNING, ERROR, CRITICAL | Standard Python logging |
| **JSON-Felder** | `timestamp`, `level`, `logger`, `message`, `module`, `function`, `line`, `request_id` (optional), `exception` (optional), `extra` (optional) | `logging_config.py:37-60` |
| **Request-ID** | UUID v4 via `contextvars` | `request_context.py:11` |
| **Rotation** | RotatingFileHandler, configurable `file_max_bytes` + `file_backup_count` | `logging_config.py:125-130` |
| **Noise Reduction** | paho.mqtt, urllib3, asyncio → WARNING | `logging_config.py:148-150` |
| **Docker Log Driver** | json-file, 10MB max, 3 files | `docker-compose.yml:86-90` |

**ML-relevant:** Server-Logs sind die beststrukturierte Datenquelle. JSON-Format mit request_id ermöglicht Request-Tracing. Logger-Name (z.B. `src.mqtt.handlers.sensor_handler`) identifiziert das Modul. Allerdings: `request_id` existiert NUR für HTTP-Requests, NICHT für MQTT-Handler-Kontext.

#### El Trabajante (ESP32 Firmware)

| Eigenschaft | Wert | Code-Referenz |
|-------------|------|---------------|
| **Format** | Semi-structured Text: `[millis_timestamp] [LEVEL   ] message` | `src/utils/logger.cpp:173` |
| **Levels** | DEBUG, INFO, WARNING, ERROR, CRITICAL | `src/utils/logger.h:9-15` |
| **Timestamp** | `millis()` (relative, nicht absolute!) | `logger.cpp:169` |
| **Buffer** | Circular buffer, 50 Einträge, 128 char/message | `logger.h:81-83` |
| **Device-ID in Logs** | NICHT systematisch enthalten | - |
| **Error-Codes in Logs** | Teilweise via `Serial.printf` in handlers | `main.cpp` diverse Stellen |
| **Module-Name** | NICHT enthalten | - |

**ML-relevant:** ESP32-Logs sind die SCHWÄCHSTE Datenquelle. Kein absoluter Timestamp, keine Device-ID, kein Module-Name. Parsing erfordert kontextbasierte Heuristik. Error-Codes werden zwar an den Server via MQTT gemeldet (system/error Topic), aber Serial-Logs selbst enthalten keinen maschinenlesbaren Identifier.

**KRITISCH – Wokwi vs. Echte ESP (verify-plan Ergänzung):**
- **Wokwi-Simulation** (`WOKWI_SIMULATION=1`): ESP-ID deterministisch `ESP_00000001`, NVS RAM-only, Watchdog deaktiviert, Logs unter `logs/wokwi/`, Serial enthält `[WOKWI]`-Prefix
- **Echte Hardware** (`seeed_xiao_esp32c3` / `esp32_dev`): ESP-ID aus MAC (`ESP_{3 letzte MAC-Bytes}`), NVS persistent, Watchdog 30s aktiv, Logs unter `logs/current/esp32_serial.log`
- **3 PlatformIO Environments:** `seeed_xiao_esp32c3` (Prod), `esp32_dev` (Dev), `wokwi_simulation` (Sim) mit `#ifdef WOKWI_SIMULATION` an ~10 Stellen
- **Server-seitig `DataSource` Enum** (`enums.py:10-26`): `PRODUCTION`, `MOCK`, `TEST`, `SIMULATION`. Jeder SensorData/ActuatorState hat `data_source`-Feld
- **ML MUSS nach `data_source` filtern** – Wokwi-Daten (`SIMULATION`) NIEMALS mit echten Produktionsdaten (`PRODUCTION`) für Training mischen!
- **Wokwi Seed-Script** (`scripts/seed_wokwi_esp.py`): Pre-registriert ESP mit `capabilities.wokwi: true` → überspringt Approval-Flow

#### MQTT Broker (Mosquitto)

| Eigenschaft | Wert | Code-Referenz |
|-------------|------|---------------|
| **Format** | Mosquitto default stdout | `docker-compose.yml:60-62` |
| **File-Log** | Deaktiviert ("stdout-only seit v3.1") | Kommentar in docker-compose.yml:62 |
| **Inhalt** | Connect/Disconnect Events, Subscriptions, Errors | Mosquitto default |

**ML-relevant:** Broker-Logs liefern Connection-Events die für Client-Disconnect-Erkennung und Timing-Analyse wertvoll sind. Allerdings unstrukturiert.

#### El Frontend (Vue 3)

| Eigenschaft | Wert | Code-Referenz |
|-------------|------|---------------|
| **Format** | JSON-structured: `{level, component, message, timestamp, data?}` | `src/utils/logger.ts:94-101` |
| **Levels** | error, warn, info, debug | `logger.ts:18` |
| **Timestamp** | ISO 8601 (absolute) | `logger.ts:98` |
| **Component** | Vue-Komponentenname (z.B. "ESPStore", "WebSocket") | `logger.ts:81` |
| **Human-Readable Mode** | Aktiviert wenn `VITE_LOG_LEVEL=debug` | `logger.ts:55` |
| **35 Dateien migriert** | Alle console.log → createLogger() | Commit `a547db4` |

**ML-relevant:** Gut strukturiert. Promtail extrahiert `level` und `component` als Labels. `data` Feld enthält optionale Kontextdaten.

### 1.2 Metriken (Prometheus)

#### Scrape-Konfiguration

| Job | Target | Interval | Code-Referenz |
|-----|--------|----------|---------------|
| `el-servador` | `el-servador:8000/api/v1/health/metrics` | 15s | `docker/prometheus/prometheus.yml:6-12` |
| `postgres` | `postgres-exporter:9187` | 15s | `prometheus.yml:14-19` |
| `mqtt-broker` | `mosquitto-exporter:9234` | 15s | `prometheus.yml:25-30` |
| `prometheus` | `localhost:9090` | 15s | `prometheus.yml:21-23` |

**Retention:** 7 Tage (`--storage.tsdb.retention.time=7d`, docker-compose.yml:244)

#### Custom Server-Metriken (El Servador)

| Metrik | Typ | Beschreibung | Code-Referenz |
|--------|-----|--------------|---------------|
| `god_kaiser_uptime_seconds` | Gauge | Server-Uptime | `src/core/metrics.py:26-29` |
| `god_kaiser_cpu_percent` | Gauge | CPU-Auslastung | `metrics.py:31-34` |
| `god_kaiser_memory_percent` | Gauge | RAM-Auslastung | `metrics.py:36-39` |
| `god_kaiser_mqtt_connected` | Gauge | MQTT Status (0/1) | `metrics.py:45-48` |
| `god_kaiser_esp_total` | Gauge | Registrierte ESPs | `metrics.py:54-57` |
| `god_kaiser_esp_online` | Gauge | Online ESPs | `metrics.py:59-62` |
| `god_kaiser_esp_offline` | Gauge | Offline ESPs | `metrics.py:64-67` |

**Update-Zyklus:** Alle 15s via Scheduler (`metrics.py:98-125`)

#### Auto-Instrumentator-Metriken (prometheus-fastapi-instrumentator)

| Metrik | Typ | Beschreibung |
|--------|-----|--------------|
| `http_requests_total` | Counter | HTTP-Requests nach method, handler, status |
| `http_request_duration_seconds` | Histogram | Request-Latenz |
| `http_requests_in_progress` | Gauge | Laufende Requests |
| `http_request_size_bytes` | Histogram | Request-Größe |
| `http_response_size_bytes` | Histogram | Response-Größe |

#### PostgreSQL-Exporter-Metriken (Standard)

- `pg_stat_activity_*` (Connections, States)
- `pg_database_size_bytes`
- `pg_stat_user_tables_*` (Seq scans, Idx scans, Inserts, Updates, Deletes)
- `pg_locks_count`
- `pg_replication_*`

#### Mosquitto-Exporter-Metriken (Standard)

- `broker_clients_connected`
- `broker_clients_total`
- `broker_messages_received`
- `broker_messages_sent`
- `broker_messages_stored`
- `broker_bytes_received/sent`
- `broker_subscriptions_count`

#### FEHLENDE Metriken (ML-kritisch)

| Metrik | Warum wichtig | Quelle |
|--------|---------------|--------|
| **ESP32 RSSI** | WiFi-Signal-Stärke → Drift Detection, Predictive Failure | Heartbeat-Payload (`wifi_rssi`) |
| **ESP32 Heap Free** | Speicher-Trends → Predictive Failure | Heartbeat-Payload (`heap_free`) |
| **ESP32 Uptime** | Boot-Frequenz → Anomalie-Erkennung | Heartbeat-Payload (`uptime`) |
| **Sensor Read Rate** | Messages/s pro Sensor → Anomalie | MQTT Traffic |
| **Actuator Command Rate** | Commands/s → Sequenz-Erkennung | MQTT Traffic |
| **MQTT Message Latency** | End-to-End Latenz → Drift | Timestamp-Differenz |
| **Error-Code Rate** | Errors/min nach Code-Range → Klassifikation | Error Events |
| **Logic Engine Executions** | Rule-Evaluierungen/min → Anomalie | Logic Engine |
| **DB Query Duration** | Query-Zeiten → Drift Detection | SQLAlchemy |
| **WebSocket Clients** | Connected Clients → Anomalie | WebSocket Manager |
| **Container Metriken** | CPU/Memory pro Container → Korrelation | cAdvisor (fehlt!) |

### 1.3 Events & Flows

#### Definierte Kommunikationsflüsse

| Flow | Pfad | Latenz | Doku-Referenz |
|------|------|--------|---------------|
| A: Sensor Data | ESP→MQTT→Server→DB→WS→Frontend | 50-230ms | `COMMUNICATION_FLOWS.md` Section 1 |
| B: Actuator Command | Frontend→REST→Server→MQTT→ESP | 100-290ms | Section 2 |
| C: Emergency Stop | Server→MQTT(broadcast)→ALL ESPs | <100ms | Section 3 |
| D: Zone Assignment | Server→MQTT→ESP→MQTT→Server | 50-150ms | Section 4 |
| E: Config Update | Server→MQTT→ESP→MQTT→Server | 100-300ms | Section 5 |
| F: Heartbeat | ESP→MQTT→Server→WS→Frontend | 20-80ms | Section 6 |
| G: Logic Rule Exec | Sensor→Server Logic→Actuator | 20-100ms | Section 7 |

#### Timestamps an kritischen Punkten

| Punkt | Timestamp vorhanden | Format | Präzision |
|-------|---------------------|--------|-----------|
| ESP32 Sensor Read | ✅ `ts` (Unix epoch) | seconds | 1s |
| MQTT Publish (ESP) | ✅ implizit in Payload `ts` | seconds | 1s |
| Broker Receive | ❌ Kein separater Timestamp | - | - |
| Server Handler | ✅ Python `datetime.now()` | ISO 8601 | microseconds |
| DB Write | ✅ SQLAlchemy `created_at` | ISO 8601 | microseconds |
| WebSocket Broadcast | ✅ `timestamp` in Event | seconds | 1s |
| Frontend Receive | ✅ `new Date().toISOString()` | ISO 8601 | milliseconds |

**Problem:** Kein Broker-seitiger Timestamp → Latenz ESP→Broker vs. Broker→Server nicht trennbar.

#### Correlation-IDs

| Kontext | ID vorhanden | Format | Scope |
|---------|-------------|--------|-------|
| HTTP Request | ✅ `request_id` | UUID v4 | Request-Lifecycle |
| Actuator Command | ✅ `correlation_id` | `cmd_abc123` | Command→Response |
| MQTT Handler | ❌ **KEINE** | - | - |
| Sensor Data Flow | ❌ **KEINE** | - | - |
| Cross-Layer Flow | ❌ **KEINE** | - | - |

**Kritische Lücke:** Sensor-Daten haben keine ID die den Flow ESP→Server→DB→Frontend verfolgt. MQTT-Handler erhalten keine Request-ID.

#### Timeout-Definitionen

| Timeout | Wert | Code-Referenz |
|---------|------|---------------|
| Heartbeat Interval | 60s | `mqtt_client.cpp:621` |
| Device Offline Detection | 300s (5 min) | `heartbeat_handler.py:989` |
| MQTT Keepalive | Broker-default (60s) | Mosquitto config |
| Circuit Breaker (MQTT) | 5 failures → 30s recovery | `mqtt_client.cpp:44-58` |
| Circuit Breaker (WiFi) | 10 failures → 60s recovery | `wifi_manager.cpp:27-36` |
| MQTT Reconnect Backoff | 1s → 2s → 4s → 8s → 16s → 60s cap | `mqtt_client.cpp:815-825` |

#### Device Pending/Approval Flow (verify-plan Ergänzung)

**ML-relevant:** Vollständiger Device-Lifecycle-Statemachine existiert und wird auditiert.

```
Unbekannter ESP sendet Heartbeat → pending_approval → [Admin approved] → approved → [Nächster Heartbeat] → online ↔ offline
                                                     → [Admin rejected] → rejected → [5min Cooldown] → Rediscovery
```

- **Discovery:** `heartbeat_handler.py:119-141` – Rate-Limit: max 1/5min pro Device, max 10/min global
- **Approval:** `esp.py:1089-1198` – 2-Stufen: `pending_approval` → `approved` → `online` (erst beim nächsten Heartbeat)
- **Rejection:** `esp.py:1201-1300` – 5min Cooldown, dann automatische Rediscovery
- **WebSocket Events:** `device_discovered`, `device_approved`, `device_rejected`, `device_rediscovered`
- **Audit-Logs:** Jeder State-Übergang wird geloggt → ML-Trainingsdata für Anomalie-Erkennung (Discovery-Bursts, Rejection-Loops)
- **Wokwi-ESP überspringt Approval komplett** (Pre-registered via Seed-Script) → generiert KEINE Approval-Events

#### Bekannte Fehler-Kaskaden

| Trigger | Kaskade | Erkennbar in |
|---------|---------|-------------|
| WiFi-Verlust | → MQTT Disconnect → Circuit Breaker → Offline Buffer (100 msg) → Server Heartbeat Timeout → Frontend "offline" | ESP logs (3004) → Broker disconnect → Server handler timeout → WS event |
| DB Connection Loss | → Handler Exceptions → Sensor Data Loss → Frontend stale | Server error (5304) → Handler retry → WS gap |
| MQTT Broker Down | → All ESPs buffering → Server unaware → Mass reconnect storm | Mosquitto logs → Server reconnect logs → ESP buffer overflow (3015) |

---

## Teil 2: Analyse – ML-Readiness

### 2.1 Strukturqualität

| Kriterium | Bewertung | Begründung |
|-----------|-----------|------------|
| **Server-Logs maschinenlesbar?** | ✅ 9/10 | JSON im File, Text mit Regex-parsebare Struktur auf Console. Promtail extrahiert level + logger. |
| **Frontend-Logs maschinenlesbar?** | ✅ 8/10 | JSON-Format mit component, level. Promtail JSON-Parser aktiv. |
| **ESP32-Logs maschinenlesbar?** | ⚠️ 3/10 | Semi-structured Text, millis()-Timestamps, kein Device-ID/Module. Parsing aufwändig. |
| **MQTT-Broker-Logs maschinenlesbar?** | ⚠️ 4/10 | Mosquitto stdout-Format, unstrukturiert. |
| **Timestamps konsistent?** | ⚠️ 5/10 | Server: absolute ISO 8601 (µs). ESP32: relative millis() (!) Frontend: ISO 8601 (ms). Keine TZ-Konsistenz-Garantie. |
| **Eindeutige Identifier?** | ⚠️ 4/10 | ESP-ID überall vorhanden. Aber: Keine durchgängige Correlation-ID über MQTT-Grenzen. Request-ID nur für HTTP. |
| **Log-Rauschen** | ✅ 7/10 | Promtail Health-Drop-Rules reduzieren Noise. Library-Logs auf WARNING. Aber: Debug-Spam möglich bei LOG_LEVEL=DEBUG. |

### 2.2 Label-Readiness

#### Existierende implizite Kategorien

| Quelle | Label-Typ | Werte | ML-Nutzung |
|--------|-----------|-------|-----------|
| Error-Codes | Numerisch, hierarchisch | ~100 Codes in 11 Ranges | Direkt als Klassifikations-Labels |
| Log-Level | Ordinal | DEBUG/INFO/WARNING/ERROR/CRITICAL | Severity-Filter |
| Logger-Name | Kategorisch | ~40 Python-Module | Source-Identifikation |
| Component (Frontend) | Kategorisch | ~35 Vue-Komponenten | Frontend-Source-ID |
| compose_service (Promtail) | Kategorisch | 4 Core Services | Layer-Identifikation |

#### Error-Code Coverage

- **Definiert:** ~100 Codes (1001-5642)
- **In Code verwendet:** ~45 ESP32, ~10 Server (basierend auf Code-Verwendungs-Matrix)
- **Lücken:** DS18B20-Codes (1060-1063) nicht im Server-Enum, I2C Recovery (1015-1018) nicht im Server-Enum, INVALID_PAYLOAD_FORMAT verwendet aber undefiniert
- **Coverage-Bewertung:** 70% - Error-Codes decken Hardware- und Protokollfehler gut ab, aber Soft-Errors (Timeouts, Slow Queries, Memory Pressure) haben keine eigenen Codes

#### Log-Patterns OHNE Error-Code

| Pattern | Bedeutung | Häufigkeit (geschätzt) |
|---------|-----------|----------------------|
| `"MQTT connection lost"` | Broker-Disconnect | Selten |
| `"WebSocket client disconnected"` | Frontend-Disconnect | Häufig |
| `"Rate limit exceeded for rule"` | Logic-Engine Throttling | Mittel |
| `"Unknown topic pattern: ..."` | Unbekanntes MQTT-Topic | Selten |
| `"Metrics update failed"` | Prometheus-Update-Fehler | Selten |

### 2.3 Baseline-Fähigkeit

| Kriterium | Bewertung | Begründung |
|-----------|-----------|------------|
| **"Normales" Verhalten dokumentiert?** | ⚠️ 3/10 | Timing-Analysen in COMMUNICATION_FLOWS.md (Latenz-Ranges). Aber: Keine statistische Baseline (Mean, Stddev, Percentiles). |
| **Metriken stabil genug für Drift Detection?** | ✅ 6/10 | Heartbeat-Intervall (60s) ist stabil. CPU/Memory-Metriken schwanken natürlich. ESP-Heap zeigt klare Trends. |
| **Saisonale/Zyklische Muster?** | ⚠️ 2/10 | Noch nicht beobachtet (System in Entwicklung). Gewächshaus wird Tag/Nacht-Zyklen und Bewässerungsrhythmen haben. |
| **Genug Trainingsdaten?** | ❌ 1/10 | System ist in Entwicklung. Keine historischen Daten. Loki-Retention 7 Tage. Prometheus-Retention 7 Tage. |

---

## Teil 3: Gap-Analyse

### 3.1 PATTERNS.yaml Schema-Entwurf

```yaml
# PATTERNS.yaml - Fehlermuster-Katalog für ML-Training
# Schema Version: 1.0
# Jedes Pattern adressiert alle 8 ML-Methoden

patterns:
  - id: "PAT-HW-001"
    name: "DS18B20 Sensor Disconnect"
    version: 1
    created: "2026-02-10"
    updated: "2026-02-10"

    # === IDENTIFIKATION ===
    category: "hardware"           # hardware|software|network|config|resource
    subcategory: "sensor_failure"
    severity: "warning"            # critical|warning|info
    layer: ["firmware"]            # firmware|broker|backend|frontend|database
    impact: "degraded"             # service-down|degraded|cosmetic

    # === SYMPTOME (für Log-Klassifikation, Log-Clustering) ===
    symptoms:
      - source: "esp32_serial"
        pattern: "DS18B20 sensor fault.*-127"
        regex: "\\[\\d+\\]\\s+\\[ERROR\\s+\\]\\s+DS18B20 sensor fault"
        frequency: "repeated"      # once|repeated|burst
        error_codes: [1060, 1063]

      - source: "server_log"
        pattern: "Temperature value -127 indicates sensor disconnection"
        regex: "Temperature value -127"
        log_level: "WARNING"
        logger: "src.mqtt.handlers.sensor_handler"

    # === METRIKEN-ANOMALIEN (für Metrik-Korrelation, Drift Detection) ===
    metric_anomalies:
      - metric: "god_kaiser_esp_sensor_error_rate"
        condition: "increase > 5 in 5m"
        related_device_metric: "esp_sensor_count"

    # === URSACHE & LÖSUNG ===
    root_cause: "DS18B20 physical disconnect or wiring fault"
    resolution:
      - "Check sensor wiring (VCC, GND, Data)"
      - "Verify 4.7kΩ pull-up resistor"
      - "Replace sensor if persistent"

    # === KORRELATION (für Cross-Layer-Korrelation) ===
    correlation:
      window_seconds: 30
      expected_sequence:
        - {source: "esp32_serial", event: "Error 1060", delay_ms: 0}
        - {source: "mqtt", topic: "+/system/error", delay_ms: 100}
        - {source: "server_log", event: "sensor_health degraded", delay_ms: 200}
        - {source: "websocket", event: "sensor_health", delay_ms: 300}
      related_patterns: ["PAT-HW-002", "PAT-NET-001"]

    # === SEQUENZ-MINING (für Sequenz-Pattern-Mining) ===
    preceding_events:
      - "I2C bus error (if SHT31 on same bus)"
      - "Power fluctuation"
    following_events:
      - "sensor_health WARNING event"
      - "Logic engine rule disabled (if dependent)"

    # === TRAINING DATA (für Log-Klassifikation) ===
    example_logs:
      - source: "esp32"
        line: "[   45230] [ERROR   ] DS18B20 sensor fault: -127°C (disconnected or CRC failure)"
      - source: "server"
        line: '{"timestamp":"2026-02-10 12:00:00","level":"WARNING","logger":"src.mqtt.handlers.sensor_handler","message":"Temperature value -127 indicates sensor disconnection","module":"sensor_handler","function":"_process_reading","line":287}'

    # === PREDICTIVE (für Predictive Failure) ===
    predictive_indicators:
      - metric: "esp_wifi_rssi"
        threshold: "< -80 dBm"
        lead_time_minutes: 60
        confidence: "low"
      - metric: "sensor_read_error_count"
        threshold: "increasing trend over 1h"
        lead_time_minutes: 30
        confidence: "medium"
```

#### Ableitbare Patterns aus bestehendem Code

| Pattern-ID | Name | Error-Codes | Layer |
|------------|------|-------------|-------|
| PAT-HW-001 | DS18B20 Disconnect | 1060, 1063 | firmware |
| PAT-HW-002 | I2C Bus Error | 1010-1018 | firmware |
| PAT-HW-003 | OneWire Bus Failure | 1020-1029 | firmware |
| PAT-HW-004 | GPIO Conflict | 1002, 1053 | firmware |
| PAT-HW-005 | PWM Channel Exhaustion | 1030-1032 | firmware |
| PAT-NET-001 | WiFi Disconnect Cascade | 3001-3005 | firmware, broker, backend |
| PAT-NET-002 | MQTT Broker Unreachable | 3010-3016, 5104-5106 | firmware, broker, backend |
| PAT-NET-003 | MQTT Buffer Overflow | 3015 | firmware |
| PAT-SVC-001 | NVS Corruption | 2001-2005 | firmware |
| PAT-SVC-002 | Config Validation Failure | 2010-2014 | firmware, backend |
| PAT-DB-001 | Database Connection Loss | 5301-5306 | backend, database |
| PAT-APP-001 | Watchdog Timeout | 4070-4072 | firmware |
| PAT-APP-002 | Memory Exhaustion | 4040-4042 | firmware |
| PAT-APP-003 | State Machine Stuck | 4001-4003 | firmware |
| PAT-SEQ-001 | Actuator Lock Conflict | 5640-5642 | backend |
| PAT-SEQ-002 | Sequence Timeout | 5613, 5616 | backend |

**Ergebnis:** ~16 Patterns sofort ableitbar. Geschätzt ~30-40 nach Operational Experience.

### 3.2 Label-Taxonomie Entwurf

```yaml
# Label-Taxonomie für AutomationOne ML-Debug-System
# Hierarchisch, maschinenlesbar, erweiterbar

dimensions:
  layer:
    values: [firmware, broker, backend, frontend, database]
    description: "Systemschicht in der das Event auftritt"
    mapping:
      firmware: {compose_service: null, log_source: "esp32_serial"}
      broker: {compose_service: "mqtt-broker"}
      backend: {compose_service: "el-servador"}
      frontend: {compose_service: "el-frontend"}
      database: {compose_service: "postgres"}

  severity:
    values: [critical, error, warning, info, debug]
    description: "Schweregrad des Events"
    mapping:
      critical: {log_levels: ["CRITICAL"], priority: 0}
      error: {log_levels: ["ERROR"], priority: 1}
      warning: {log_levels: ["WARNING"], priority: 2}
      info: {log_levels: ["INFO"], priority: 3}
      debug: {log_levels: ["DEBUG"], priority: 4}

  category:
    values:
      - hardware      # GPIO, I2C, OneWire, PWM, Sensor, Actuator
      - network       # WiFi, MQTT, HTTP, DNS, Connection
      - software      # State, Logic, Parsing, Validation
      - config        # NVS, Settings, Schema, Migration
      - resource      # Memory, CPU, Disk, Queue, Buffer
      - security      # Auth, JWT, Permission, Rate-Limit
      - data          # Sensor readings, DB operations, Data quality
    mapping_from_error_range:
      "1000-1999": "hardware"
      "2000-2999": "config"
      "3000-3999": "network"
      "4000-4069": "software"
      "4070-4079": "resource"     # Watchdog = resource exhaustion
      "4200-4209": "security"     # Device approval
      "5000-5099": "config"
      "5100-5199": "network"
      "5200-5299": "data"
      "5300-5399": "data"
      "5400-5499": "software"
      "5500-5599": "data"
      "5600-5699": "software"

  impact:
    values:
      - service_down   # Kompletter Service-Ausfall
      - degraded       # Teilweise Funktionalität beeinträchtigt
      - cosmetic       # Nur Darstellungsproblem
      - silent         # Kein sichtbarer Effekt (nur Log)

  scope:
    values:
      - device         # Einzelnes ESP32
      - zone           # Alle ESPs einer Zone
      - system         # Gesamtsystem
      - component      # Einzelne Komponente (Sensor, Actuator)
```

#### Label-Anbringung

| Methode | Wann | Wer | Automatisierbar |
|---------|------|-----|-----------------|
| **Promtail Pipeline** | Log-Ingestion | Promtail | ✅ Voll |
| **Server-seitiges Tagging** | MQTT Handler | Python Code | ✅ Voll |
| **Error-Code Mapping** | Bei Error-Event | Lookup-Table | ✅ Voll |
| **Nachträgliche Annotation** | ML-Training | Manuell/Semi-Auto | ⚠️ Teilweise |

**Empfehlung:** Primär über Promtail Pipeline Stages + Server-seitiges Error-Code→Label Mapping. Keine manuelle Annotation für die erste Phase.

### 3.3 LogQL Recording Rules

```yaml
# Empfohlene LogQL Recording Rules für Loki
# Speicherort: docker/loki/rules/ (oder Grafana Recording Rules)

groups:
  - name: error_rates
    interval: 1m
    rules:
      # Error-Rate pro Service
      - record: automationone:log_errors_per_minute
        expr: |
          sum by (compose_service) (
            count_over_time({compose_project="auto-one"} |= "ERROR" [1m])
          )

      # Error-Rate pro Logger-Modul (Server)
      - record: automationone:server_errors_by_module
        expr: |
          sum by (logger) (
            count_over_time({compose_service="el-servador", level="ERROR"} [5m])
          )

      # MQTT-Handler Error-Rate
      - record: automationone:mqtt_handler_errors
        expr: |
          count_over_time({compose_service="el-servador", logger=~"src.mqtt.handlers.*", level="ERROR"} [5m])

      # Timeout-Häufigkeit
      - record: automationone:timeout_frequency
        expr: |
          count_over_time({compose_service="el-servador"} |= "timeout" [5m])

      # Reconnect-Frequenz
      - record: automationone:reconnect_frequency
        expr: |
          count_over_time({compose_service="el-servador"} |~ "reconnect|Reconnect" [5m])

      # Frontend-Error-Rate pro Component
      - record: automationone:frontend_errors_by_component
        expr: |
          sum by (component) (
            count_over_time({compose_service="el-frontend", level="error"} [5m])
          )

  - name: pattern_detection
    interval: 5m
    rules:
      # DS18B20 Fault Detection
      - record: automationone:ds18b20_fault_count
        expr: |
          count_over_time({compose_service="el-servador"} |= "-127" |= "sensor" [5m])

      # MQTT Disconnect Events
      - record: automationone:mqtt_disconnect_count
        expr: |
          count_over_time({compose_service="mqtt-broker"} |~ "disconnect|Disconnect" [5m])

      # Circuit Breaker Opens
      - record: automationone:circuit_breaker_opens
        expr: |
          count_over_time({compose_service="el-servador"} |= "circuit breaker" |= "open" [5m])

      # Warning-to-Error Escalation Rate
      - record: automationone:warning_to_error_ratio
        expr: |
          count_over_time({compose_service="el-servador", level="ERROR"} [5m])
          /
          (count_over_time({compose_service="el-servador", level="WARNING"} [5m]) + 1)
```

### 3.4 Fehlende Daten-Pipelines

#### ESP32-Metriken in Prometheus

**Problem:** Heartbeat enthält `heap_free`, `wifi_rssi`, `uptime`, `sensor_count`, `actuator_count` – aber diese werden NICHT als Prometheus-Metriken exportiert.

**Lösung:** Server muss Heartbeat-Daten als Prometheus Gauges exportieren:

```
# Neue Metriken (pro ESP):
god_kaiser_esp_heap_free_bytes{esp_id="ESP_12AB34CD"}
god_kaiser_esp_wifi_rssi_dbm{esp_id="ESP_12AB34CD"}
god_kaiser_esp_uptime_seconds{esp_id="ESP_12AB34CD"}
god_kaiser_esp_sensor_count{esp_id="ESP_12AB34CD"}
god_kaiser_esp_actuator_count{esp_id="ESP_12AB34CD"}
```

**Impact:** Heartbeat-Handler (`heartbeat_handler.py:61`) müsste Prometheus-Gauges updaten.

#### Cross-Layer Correlation-ID

**Problem:** Kein durchgängiger Identifier von ESP32→Server→Frontend.

**Lösung (Phase 1):** Server generiert `trace_id` beim Empfang eines MQTT-Messages und propagiert durch Handler → DB → WebSocket.

**Lösung (Phase 2):** ESP32 sendet `msg_id` (sequence counter) in jedem MQTT-Payload. Server korreliert `msg_id` + `esp_id` + `timestamp`.

#### Zentraler Event-Bus vs. Loki + Prometheus

**Empfehlung:** Kein separater Event-Bus nötig. Loki + Prometheus reicht für Phase 1. Gründe:
- Loki hat bereits alle Container-Logs
- Prometheus hat System- und Custom-Metriken
- LogQL Recording Rules können abgeleitete Metriken erzeugen
- Grafana kann beides in einem Dashboard korrelieren
- Erst wenn ML-Modelle >1000 Queries/s brauchen → eigener Event-Bus (Phase 3+)

#### Promtail Pipeline-Erweiterung

**Aktuell:** Promtail extrahiert `level` + `logger` (Server) und `level` + `component` (Frontend).

**Zusätzlich empfohlen:**
1. Error-Code Extraction aus Server-Logs: `|~ "error_code.*\\d{4}"` → Label `error_code`
2. ESP-ID Extraction aus Server-Logs: `|~ "esp_id.*ESP_"` → Label `esp_id` (Achtung: hohe Cardinality!)
3. Mosquitto-Logs: Regex für Connect/Disconnect Events → Label `mqtt_event_type`

**ACHTUNG Cardinality:** `esp_id` als Label nur wenn <50 Geräte. Sonst als filterbarer Log-Text belassen.

### 3.5 DataSource-Filter für ML-Training (KRITISCH)

Das System hat bereits ein `DataSource`-Enum (`enums.py:10-26`) mit 4 Werten: `PRODUCTION`, `MOCK`, `TEST`, `SIMULATION`.

**ML-Training MUSS nach DataSource filtern:**

| DataSource | Verwendung | ML-Training? |
|------------|-----------|-------------|
| `PRODUCTION` | Echte ESP32 Hardware | ✅ Ja – primäre Trainingsquelle |
| `MOCK` | Server-seitige Mock-ESPs | ⚠️ Separat trainieren, nicht mischen |
| `TEST` | Automatisierte Tests | ❌ Nein – synthetische Daten |
| `SIMULATION` | Wokwi-Simulation | ❌ Nein – deterministisch, keine echten Umgebungseinflüsse |

**Implikation:** Alle ML-Queries gegen Loki/Prometheus müssen DataSource-Filter berücksichtigen. Sensor-Daten in der DB haben das Feld bereits. Logs haben es NICHT → Server sollte `data_source` beim Logging mitsenden.

---

## Teil 4: Empfehlung – Architektur

### 4.1 Verzeichnisstruktur

```
.claude/reference/ml/                    # ML-bezogene Referenzdokumente
├── PATTERNS.yaml                        # Fehlermuster-Katalog
├── LABEL_TAXONOMY.yaml                  # Label-Schema
├── ML_METHODS.md                        # 8 ML-Methoden mit Datenanforderungen
└── DATA_REQUIREMENTS.md                 # Welche Methode braucht welche Daten

docker/loki/rules/                       # LogQL Recording Rules
└── automationone-rules.yaml

docker/prometheus/rules/                 # Prometheus Recording/Alert Rules
└── automationone-alerts.yml

El Servador/god_kaiser_server/src/core/  # Server-seitige ML-Vorbereitung
├── metrics.py                           # ← ERWEITERN: ESP-Heartbeat-Metriken
└── ml_labels.py                         # NEU: Label-Mapping Error-Code → Taxonomie
```

### 4.2 Datenfluss-Diagramm: Quelle → ML-Box → Grafana

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     DATENQUELLEN (Phase 1: jetzt)                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ESP32 Serial ─────────────► [nicht erfasst - Blind Spot]               │
│      │                                                                   │
│      └─ MQTT ──┐                                                         │
│                ▼                                                          │
│  MQTT Broker ─────► Docker stdout ──► Promtail ──► Loki (7d)           │
│                                          │                               │
│  Server (FastAPI) ► Docker stdout ──► Promtail ──► Loki (7d)           │
│      │                    │              │     Labels: level, logger     │
│      │                    │              │                               │
│      └─ /metrics ────────────────────────────► Prometheus (7d, 15s)     │
│          7 custom + HTTP auto                                            │
│                                                                          │
│  Frontend (Vue) ──► Docker stdout ──► Promtail ──► Loki (7d)           │
│                                          │     Labels: level, component │
│                                                                          │
│  PostgreSQL ──────► pg-exporter ─────────────► Prometheus               │
│  Mosquitto ───────► mqtt-exporter ───────────► Prometheus               │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                     TRANSFORMATION (Phase 2: nächste)                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Loki ──── LogQL Recording Rules ──── abgeleitete Metriken              │
│       │    (error rates, pattern counts, timeout freq)                   │
│       │                                                                  │
│  Prometheus ── PromQL Rules ── aggregierte Metriken                     │
│                                                                          │
│  Server ── Heartbeat → ESP-Metriken (heap, rssi, uptime) → Prometheus  │
│         ── Error-Events → Label-Mapping → enriched Loki-Logs            │
│         ── MQTT Handler → trace_id → Cross-Layer-Korrelation            │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                     ML-BOX (Phase 3: Jetson Orin Nano)                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Jetson ML Container ◄── Loki API (HTTP) ── Log-Batches                │
│        │              ◄── Prometheus API ─── Metrik-Ranges              │
│        │              ◄── PATTERNS.yaml ──── Trainings-Labels           │
│        │                                                                 │
│        ├── Log-Klassifikation (1) ──── Logs → Kategorie                 │
│        ├── Anomalie-Erkennung (2) ──── Metriken → Normal/Anomal        │
│        ├── Cross-Layer-Korrelation (3) ── Events → Kausalketten        │
│        ├── Sequenz-Pattern-Mining (4) ── Event-Sequenzen → Patterns    │
│        ├── Predictive Failure (5) ──── Trends → Vorhersagen            │
│        ├── Metrik-Korrelation (6) ──── Metriken → Zusammenhänge        │
│        ├── Log-Clustering (7) ──── Ähnliche Logs → Cluster             │
│        └── Drift Detection (8) ──── Baseline → Abweichung              │
│        │                                                                 │
│        ▼                                                                 │
│  MQTT: ao/ml/{method}/results ──► El Servador ──► Grafana ML-Dashboard │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 ML-Methoden → Datenanforderungen

| # | ML-Methode | Primäre Datenquelle | Sekundär | Status | Priorität |
|---|------------|--------------------|---------|----|-----------|
| 1 | **Log-Klassifikation** | Loki (Server + Frontend Logs) | PATTERNS.yaml Labels | ⚠️ Labels fehlen | P1 |
| 2 | **Anomalie-Erkennung** | Prometheus (Metriken) | Loki (Error-Rates) | ⚠️ ESP-Metriken fehlen | P1 |
| 3 | **Cross-Layer-Korrelation** | Loki (alle Layer) + Prometheus | Correlation-IDs | ❌ Correlation-IDs fehlen | P2 |
| 4 | **Sequenz-Pattern-Mining** | Loki (zeitlich sortierte Events) | PATTERNS.yaml Sequenzen | ⚠️ Timestamp-Inkonsistenz | P2 |
| 5 | **Predictive Failure** | Prometheus (Zeitreihen) | PATTERNS.yaml Indikatoren | ⚠️ Zu wenig Metriken | P3 |
| 6 | **Metrik-Korrelation** | Prometheus (alle Metriken) | - | ⚠️ Zu wenig Custom-Metriken | P2 |
| 7 | **Log-Clustering** | Loki (alle Logs) | - | ✅ Grunddaten vorhanden | P1 |
| 8 | **Drift Detection** | Prometheus (Baseline-Metriken) | - | ⚠️ Keine Baseline definiert | P3 |

### 4.4 Prioritäten – Was muss ZUERST gebaut werden?

#### Phase 1: Datenqualität (JETZT – Wochen 1-2)

| # | Aufgabe | Aufwand | Impact | Blocker für |
|---|---------|---------|--------|-------------|
| 1 | **ESP-Heartbeat-Metriken als Prometheus Gauges** exportieren | Klein | Hoch | ML-2, ML-5, ML-6, ML-8 |
| 2 | **PATTERNS.yaml** mit 16 Initial-Patterns erstellen | Mittel | Hoch | ML-1, ML-3, ML-4 |
| 3 | **Label-Taxonomie** finalisieren und als YAML speichern | Klein | Hoch | ML-1, ML-7 |
| 4 | **LogQL Recording Rules** deployen (6 Error-Rate Rules) | Klein | Mittel | ML-2, ML-6 |
| 5 | **Error-Code→Label Mapping** im Server implementieren | Klein | Mittel | ML-1 |

#### Phase 2: Korrelation (Wochen 3-4)

| # | Aufgabe | Aufwand | Impact | Blocker für |
|---|---------|---------|--------|-------------|
| 6 | **trace_id in MQTT-Handlern** generieren | Mittel | Hoch | ML-3, ML-4 |
| 7 | **Promtail Pipeline** erweitern (Error-Code Extraction) | Klein | Mittel | ML-1 |
| 8 | **cAdvisor** zum Docker Stack hinzufügen | Klein | Mittel | ML-6 |
| 9 | **Logic Engine Execution Metrics** als Prometheus Counter | Klein | Mittel | ML-6 |
| 10 | **Sensor/Actuator Message Rate** Metriken | Klein | Mittel | ML-2, ML-8 |

#### Phase 3: ML-Readiness (Wochen 5-8)

| # | Aufgabe | Aufwand | Impact | Blocker für |
|---|---------|---------|--------|-------------|
| 11 | **Baseline-Definition** für "gesundes System" | Mittel | Hoch | ML-2, ML-8 |
| 12 | **Retention-Verlängerung** (7d → 30d) für Training | Klein | Hoch | Alle ML |
| 13 | **Datenexport-Pipeline** Loki/Prometheus → Jetson | Groß | Hoch | Alle ML |
| 14 | **MQTT Topic `ao/ml/*/results`** implementieren | Mittel | Hoch | ML-Feedback |
| 15 | **Grafana ML-Dashboard** Grundstruktur | Mittel | Mittel | Visualisierung |

#### Parallel möglich

- Phase 1 Items 1-5 sind alle unabhängig und können parallel bearbeitet werden
- Phase 2 Items 6-10 sind größtenteils unabhängig
- Phase 3 Item 11 (Baseline) kann starten sobald Phase 1 abgeschlossen

---

## Zusammenfassung

### Stärken

1. **Monitoring-Stack läuft** (Loki + Prometheus + Grafana + Promtail)
2. **Error-Code-System** ist umfassend (~100 Codes, ESP32 ↔ Server synchronisiert)
3. **Server-Logs sind JSON-strukturiert** mit Request-ID
4. **Frontend-Logs sind JSON-strukturiert** mit Component-Name
5. **Communication Flows dokumentiert** mit Timing und Code-Referenzen
6. **Promtail Pipeline** hat Label-Extraction und Noise-Filtering

### Kritische Lücken

1. **Keine Cross-Layer Correlation-ID** (MQTT-Handler haben keine trace_id)
2. **ESP32-Metriken nicht in Prometheus** (heap, rssi, uptime bleiben in DB)
3. **ESP32 Serial-Logs unstrukturiert** (relative millis(), kein Device-ID/Module)
4. **Keine Label-Taxonomie** definiert
5. **Keine PATTERNS.yaml** (Fehlermuster nicht katalogisiert)
6. **Keine Recording Rules** (LogQL/PromQL)
7. **Kein cAdvisor** (Container-Metriken fehlen)
8. **Retention nur 7 Tage** (zu kurz für ML-Training)
9. **Keine Baseline** für "normales" Systemverhalten

### ML-Readiness pro Methode

| # | ML-Methode | Readiness | Blocker |
|---|------------|-----------|---------|
| 1 | Log-Klassifikation | 5/10 | Labels, PATTERNS.yaml |
| 2 | Anomalie-Erkennung | 4/10 | ESP-Metriken, Baseline |
| 3 | Cross-Layer-Korrelation | 2/10 | Correlation-ID |
| 4 | Sequenz-Pattern-Mining | 3/10 | Timestamps, Correlation-ID |
| 5 | Predictive Failure | 3/10 | Mehr Metriken, Historische Daten |
| 6 | Metrik-Korrelation | 4/10 | Mehr Custom-Metriken |
| 7 | Log-Clustering | 6/10 | Grunddaten vorhanden |
| 8 | Drift Detection | 3/10 | Baseline, ESP-Metriken |
| **Gesamt** | | **4.5/10** | |

---

## System-Control Ergaenzungen

> **Agent:** system-control
> **Datum:** 2026-02-10
> **Methode:** Kreuzpruefung gegen docker-compose.yml, prometheus.yml, loki-config.yml, promtail/config.yml, grafana provisioning files, mosquitto.conf, postgresql.conf

### SC-1: Docker/Infra-Faktencheck

#### Service-Count (verifiziert gegen docker-compose.yml)

| # | Service | Container-Name | Profile | Ports (Host) | Image |
|---|---------|---------------|---------|--------------|-------|
| 1 | `postgres` | `automationone-postgres` | (core) | 5432 | `postgres:16-alpine` |
| 2 | `mqtt-broker` | `automationone-mqtt` | (core) | 1883, 9001 | `eclipse-mosquitto:2` |
| 3 | `el-servador` | `automationone-server` | (core) | 8000 | custom Dockerfile |
| 4 | `el-frontend` | `automationone-frontend` | (core) | 5173 | custom Dockerfile |
| 5 | `loki` | `automationone-loki` | monitoring | 3100 | `grafana/loki:3.4` |
| 6 | `promtail` | `automationone-promtail` | monitoring | (none) | `grafana/promtail:3.4` |
| 7 | `prometheus` | `automationone-prometheus` | monitoring | 9090 | `prom/prometheus:v3.2.1` |
| 8 | `grafana` | `automationone-grafana` | monitoring | 3000 | `grafana/grafana:11.5.2` |
| 9 | `postgres-exporter` | `automationone-postgres-exporter` | monitoring | (expose 9187) | `prometheuscommunity/postgres-exporter:v0.16.0` |
| 10 | `mosquitto-exporter` | `automationone-mosquitto-exporter` | monitoring | (expose 9234) | `sapcc/mosquitto-exporter:0.8.0` |
| 11 | `pgadmin` | `automationone-pgadmin` | devtools | 5050 | `dpage/pgadmin4:9.12` |

**Gesamt: 11 Services** (4 core + 6 monitoring + 1 devtools). Der Report zaehlt die Services nicht explizit auf -- dieses Inventar fehlte.

#### Volumes (verifiziert)

| Volume | Explicit Name | Genutzt von |
|--------|--------------|-------------|
| `automationone-postgres-data` | ja | postgres |
| `automationone-mosquitto-data` | ja | mqtt-broker |
| `automationone-loki-data` | ja | loki |
| `automationone-prometheus-data` | ja | prometheus |
| `automationone-grafana-data` | ja | grafana |
| `automationone-promtail-positions` | ja | promtail |
| `automationone-pgadmin-data` | ja | pgadmin |

**7 Named Volumes.** Alle mit explizitem `name:` Attribut (kein Docker-Compose v2 Project-Prefix).

#### Zeilennummern-Check im Report

| Behauptung im Report | Tatsaechlich | Korrekt? |
|----------------------|-------------|----------|
| Docker Log Driver `docker-compose.yml:86-90` (Server) | Zeilen 86-90 enthalten `logging:` Block des Servers | Ja |
| Prometheus Retention `docker-compose.yml:244` | Zeile 244: `'--storage.tsdb.retention.time=7d'` | Ja |
| Mosquitto Log-Mount `docker-compose.yml:60-62` | Zeilen 57-62 enthalten `volumes:` und Log-Mount-Kommentar | Ungefaehr (Offset ~3 Zeilen) |

### SC-2: Monitoring-Stack Detail-Check

#### Prometheus scrape configs (verifiziert gegen prometheus.yml)

Der Report listet 4 Jobs korrekt auf. Zusaetzliche Details:

- **Global scrape/eval interval:** Beide 15s -- korrekt im Report
- **Labels:** Prometheus fuegt `service` und `environment: development` Labels hinzu fuer el-servador, postgres, mqtt-broker -- im Report nicht erwaehnt, aber fuer ML-Queries relevant (Prometheus-Queries koennen nach `environment` filtern)
- **Kein `rule_files:` Block** in prometheus.yml -- Recording Rules und Alert Rules sind NICHT konfiguriert. Der Report schlaegt `docker/prometheus/rules/automationone-alerts.yml` vor, aber der aktuelle prometheus.yml hat keinen `rule_files:` Eintrag. Das muss bei der Implementierung ergaenzt werden.

#### Loki Retention (verifiziert gegen loki-config.yml)

- **retention_period: 168h** (7 Tage) -- korrekt im Report
- **compactor.retention_enabled: true** -- Retention wird aktiv durchgesetzt (nicht nur Limit)
- **Schema: v13, Store: tsdb** -- modernes Storage-Backend, performant fuer LogQL
- **auth_enabled: false** -- Development-Modus, kein Tenant-Isolation
- **rules_directory: /loki/rules** -- existiert im Config, aber das Volume `automationone-loki-data` mountet nach `/loki`, NICHT nach `/loki/rules` separat. LogQL Recording Rules muessten also entweder via Grafana Recording Rules deployed werden ODER ein zusaetzlicher Bind-Mount `./docker/loki/rules:/loki/rules:ro` ist noetig.

**KORREKTUR zum Report Section 3.3:** Der empfohlene Speicherort `docker/loki/rules/` existiert nicht als Bind-Mount. Entweder:
1. Bind-Mount in docker-compose.yml ergaenzen: `./docker/loki/rules:/loki/rules:ro`
2. Oder Recording Rules ueber Grafana UI/Provisioning deployen (kein Loki-config noetig)

#### Promtail Pipeline (verifiziert gegen docker/promtail/config.yml)

Der Report beschreibt die Pipeline korrekt, aber unvollstaendig. Vollstaendige Pipeline:

| Stage | Typ | Beschreibung | Im Report erwaehnt? |
|-------|-----|--------------|---------------------|
| 1 | `docker: {}` | Unwrap Docker json-file log driver | Nein (implizit) |
| 2a | `drop` (el-servador) | Health-Check und Metrics-Endpoint Logs droppen (2 Regeln) | Ja ("Health-Drop-Rules") |
| 2b | `multiline` (el-servador) | Python Traceback Aggregation (firstline Regex, max 50 Zeilen, 3s wait) | NEIN -- fehlte im Report |
| 2c | `regex` (el-servador) | Extrahiert `level`, `logger`, `request_id`, `message` | Ja (level + logger) |
| 2d | `labels` (el-servador) | Promoted `level` und `logger` zu Loki Labels | Ja |
| 3a | `json` (el-frontend) | Extrahiert `level` und `component` aus JSON | Ja |
| 3b | `labels` (el-frontend) | Promoted `level` und `component` | Ja |

**Fehlende Pipeline-Stages fuer andere Services:**
- **mqtt-broker:** KEINE Pipeline Stages -- Mosquitto-Logs landen als raw text in Loki, nur mit Docker SD Labels (compose_service, container, stream). Der Report empfiehlt Regex fuer Connect/Disconnect (Section 3.4), aber aktuell ist nichts konfiguriert.
- **postgres:** KEINE Pipeline Stages -- PostgreSQL-Logs landen als raw stdout in Loki.
- **postgres-exporter / mosquitto-exporter / pgadmin:** KEINE Pipeline Stages (auch nicht relevant -- Exporter-Logs sind minimal).

**ML-relevant:** Die Multiline-Stage (2b) ist fuer ML Log-Klassifikation KRITISCH -- ohne sie wuerden Python Tracebacks als separate Log-Entries in Loki landen, was Clustering und Klassifikation massiv erschwert.

#### Mosquitto Config (verifiziert gegen mosquitto.conf)

Zusaetzliche Details die im Report fehlen:

| Setting | Wert | ML-Relevanz |
|---------|------|-------------|
| `log_timestamp true` | ISO-Format `%Y-%m-%dT%H:%M:%S` | Timestamps sind DOCH vorhanden in Mosquitto-Logs |
| `log_type` | error, warning, notice, information, subscribe, unsubscribe | Subscribe/Unsubscribe Events sind aktiv -- mehr Daten als "unstrukturiert" |
| `connection_messages true` | Connect/Disconnect-Events aktiv | Beste Quelle fuer Client-Lifecycle |
| `max_queued_messages 1000` | Limit pro Client | Relevant fuer PAT-NET-003 (Buffer Overflow) |
| `message_size_limit 262144` | 256KB | Payload-Limit fuer MQTT Messages |
| `max_inflight_messages 20` | QoS 1/2 In-Flight-Limit | Kann Throttling verursachen bei hoher Last |
| `persistence true` | `/mosquitto/data/` | Retained Messages ueberleben Broker-Restart |

**KORREKTUR:** Der Report bewertet Mosquitto-Logs mit 4/10 ("unstrukturiert"). Tatsaechlich haben die Logs ein ISO-Timestamp-Format und enthalten spezifische Event-Typen (subscribe, unsubscribe, connect, disconnect). Die Bewertung sollte eher 5-6/10 sein.

### SC-3: Grafana Dashboard & Alerting (fehlte im Report komplett)

#### Dashboard: "AutomationOne - Operations" (system-health.json)

**UID:** `automationone-system-health`
**Auto-Refresh:** 10s
**Template-Variablen:** 2 (`$service` = Loki compose_service, `$interval` = 1m/5m/15m/30m/1h)

| Row | Panels | Panel-Typen | Datenquelle |
|-----|--------|-------------|-------------|
| **Header (y=0)** | 6 Panels | Server UP/DOWN (stat), MQTT UP/DOWN (stat), Database UP/DOWN (stat), Frontend Errors 5m (stat), ESP Online (stat), Active Alerts (alertlist) | Prometheus + Loki |
| **Server Performance (y=5)** | 4 Panels | CPU (gauge), Memory (gauge), Uptime (stat), CPU & Memory Over Time (timeseries) | Prometheus |
| **ESP32 Fleet (y=14)** | 4 Panels | Total Registered (stat), Online (stat), Offline (stat), ESP Online Rate Over Time (timeseries) | Prometheus |
| **MQTT Traffic (y=23)** | 5 Panels | Connected Clients (stat), Msg/s In (stat), Msg/s Out (stat), Messages Dropped (stat), MQTT Message Rate (timeseries) | Prometheus |
| **Database (collapsed, y=35)** | 4 Panels | Active Connections (stat), DB Size (stat), Deadlocks (stat), Connections Over Time (timeseries) | Prometheus |
| **Logs & Errors (collapsed, y=36)** | 3 Panels | Error Rate by Service (timeseries), Log Volume by Service (timeseries), Recent Error Logs (logs) | Loki |

**Gesamt: 26 Panels** in 6 Rows (4 expanded + 2 collapsed).

**ML-relevante Dashboard-Panels die bereits existieren:**
- Error Rate by Service (Loki timeseries) -- nutzbar als Baseline-Referenz
- Log Volume by Service (Loki timeseries) -- nutzbar fuer Anomalie-Erkennung
- MQTT Message Rate (Prometheus timeseries) -- nutzbar fuer Traffic-Baseline
- ESP Online Rate Over Time -- nutzbar fuer Fleet-Health-Baseline

#### Alerting Rules (verifiziert gegen alert-rules.yml)

| # | UID | Titel | Typ | Pipeline | Condition | For |
|---|-----|-------|-----|----------|-----------|-----|
| 1 | `ao-server-down` | Server Down | Critical | A(PromQL) -> B(Reduce:last) -> C(Threshold lt 1) | `up{job="el-servador"} < 1` | 1m |
| 2 | `ao-mqtt-disconnected` | MQTT Disconnected | Critical | A(PromQL) -> B(Reduce:last) -> C(Threshold lt 1) | `god_kaiser_mqtt_connected < 1` | 1m |
| 3 | `ao-database-down` | Database Down | Critical | A(PromQL) -> B(Reduce:last) -> C(Threshold lt 1) | `pg_up < 1` | 1m |
| 4 | `ao-high-memory` | High Memory Usage | Warning | A(PromQL) -> B(Reduce:last) -> C(Threshold gt 85) | `god_kaiser_memory_percent > 85` | 5m |
| 5 | `ao-esp-offline` | ESP Devices Offline | Warning | A(PromQL) -> B(Reduce:last) -> C(Threshold gt 0.5) | `(offline/total) > 50% AND online > 0` | 3m |

**5 Alert Rules** (3 critical, 2 warning). Alle nutzen korrekte 3-Stage Pipeline (A -> B -> C) mit Grafana 11.5.2.

**Evaluation Intervals:** Critical = 10s, Warning = 1m. Beide sind Vielfache von 10s (Grafana Scheduler).

**noDataState / execErrState:**
- Critical Rules: Alerting/Alerting (korrekt -- Server/DB/MQTT down = no data = alarm)
- Warning Rules: OK/Alerting (korrekt -- fehlende Daten bei Memory/ESP = kein Alarm, Ausfuehrungsfehler = Alarm)

**ML-relevant:** Diese Alert Rules sind die EINZIGEN existierenden Prometheus Rules. Fuer ML muessen zusaetzliche Recording Rules erstellt werden (wie in Report Section 3.3 empfohlen). Contact Points sind Phase 1 bewusst nicht konfiguriert (UI-only).

#### Datasource Provisioning (verifiziert gegen datasources.yml)

| Datasource | Typ | URL | UID | Default |
|------------|-----|-----|-----|---------|
| Prometheus | prometheus | `http://prometheus:9090` | `prometheus` | Ja |
| Loki | loki | `http://loki:3100` | `loki` | Nein |

**Beide editable: false** -- gut fuer Reproduzierbarkeit. UIDs matchen die Dashboard-Panel-Referenzen und Alert-Rule `datasourceUid` Felder exakt.

### SC-4: Host-Log-Pfade und Bind-Mounts

#### Bind-Mounts (Host -> Container)

| Host-Pfad | Container-Pfad | Service | Zweck |
|-----------|---------------|---------|-------|
| `./logs/server/` | `/app/logs` | el-servador | Server JSON-Logs (File-Handler) |
| `./logs/postgres/` | `/var/log/postgresql` | postgres | PostgreSQL Query/Connection Logs |
| `./docker/mosquitto/mosquitto.conf` | `/mosquitto/config/mosquitto.conf:ro` | mqtt-broker | Broker-Config |
| `./docker/prometheus/prometheus.yml` | `/etc/prometheus/prometheus.yml:ro` | prometheus | Scrape-Config |
| `./docker/loki/loki-config.yml` | `/etc/loki/local-config.yaml:ro` | loki | Loki-Config |
| `./docker/promtail/config.yml` | `/etc/promtail/config.yml:ro` | promtail | Pipeline-Config |
| `./docker/grafana/provisioning/` | `/etc/grafana/provisioning:ro` | grafana | Dashboards, Datasources, Alerting |
| `/var/run/docker.sock` | `/var/run/docker.sock:ro` | promtail | Docker SD fuer Log-Discovery |

#### Host-Log-Verzeichnisse (verifiziert via Glob)

| Verzeichnis | Inhalt | Erzeugt von |
|-------------|--------|-------------|
| `logs/server/` | Server JSON-Logs (god_kaiser.log via RotatingFileHandler) | el-servador Container (Bind-Mount) |
| `logs/postgres/` | PostgreSQL Logs (postgresql-YYYY-MM-DD.log, Rotation 1d/50MB) | postgres Container (Bind-Mount) |
| `logs/mqtt/` | Leer (.gitkeep) -- Mosquitto File-Logging ist DEAKTIVIERT | - |
| `logs/wokwi/` | Wokwi Simulation Logs (.gitkeep vorhanden) | Wokwi CLI (manuell) |
| `logs/current/` | Session-Logs (esp32_serial.log via start_session.sh) | Debug-Skripte |
| `logs/archive/` | 20+ archivierte Test-Sessions mit god_kaiser.log, mqtt_traffic.log, esp32_serial.log, STATUS.md | start_session.sh Archivierung |

**KORREKTUR zum Datenfluss-Diagramm (Section 4.2):** PostgreSQL hat ZWEI Log-Pfade:
1. **Docker stdout** -> Promtail -> Loki (Standard-Output)
2. **Bind-Mount** `logs/postgres/` -> Host-Filesystem (File-Logging via `logging_collector = on`)

PostgreSQL-File-Logs (`postgresql-YYYY-MM-DD.log`) enthalten MOD-Statements, Slow Queries (>100ms), Connections, Disconnections und Lock-Waits. Diese sind fuer ML wesentlich detaillierter als die Docker-stdout-Logs und werden aktuell NICHT von Promtail erfasst.

#### Docker Log Driver Config (alle Services)

| Service | Driver | max-size | max-file | Gesamt pro Service |
|---------|--------|----------|----------|--------------------|
| postgres | json-file | 10m | 3 | 30MB |
| mqtt-broker | json-file | 10m | 3 | 30MB |
| el-servador | json-file | 10m | 3 | 30MB |
| el-frontend | json-file | 5m | 3 | 15MB |
| loki | json-file | 5m | 3 | 15MB |
| promtail | json-file | 5m | 3 | 15MB |
| prometheus | json-file | 5m | 3 | 15MB |
| grafana | json-file | 5m | 3 | 15MB |
| postgres-exporter | json-file | 5m | 3 | 15MB |
| mosquitto-exporter | json-file | 5m | 3 | 15MB |
| pgadmin | json-file | 5m | 3 | 15MB |

**Maximaler Docker-Log-Speicher auf Disk: ~210MB** (Summe aller max-size * max-file). Core Services haben 10MB, Monitoring/Devtools haben 5MB.

### SC-5: Gap-Analyse Bewertung

#### Prioritaeten-Realismus-Check

| Phase | Item | Report-Bewertung | system-control Bewertung | Kommentar |
|-------|------|-----------------|--------------------------|-----------|
| 1.1 | ESP-Heartbeat-Metriken | Klein | **Klein -- KORREKT** | Nur metrics.py erweitern, heartbeat_handler anpassen |
| 1.2 | PATTERNS.yaml | Mittel | **Mittel -- KORREKT** | 16 Patterns manuell definieren, Schema entwerfen |
| 1.3 | Label-Taxonomie | Klein | **Klein -- KORREKT** | YAML schreiben, mapping-table aus Error-Codes |
| 1.4 | LogQL Recording Rules | Klein | **Klein-Mittel -- KORREKTUR** | Rules schreiben ist klein, aber Deployment braucht entweder Loki Bind-Mount oder Grafana API |
| 1.5 | Error-Code Label Mapping | Klein | **Klein -- KORREKT** | Lookup-Table, ~100 Eintraege |
| 2.6 | trace_id in MQTT-Handlern | Mittel | **Mittel-Gross -- KORREKTUR** | Betrifft ALLE MQTT-Handler (sensor, actuator, heartbeat, config, error, zone). Contextvars-Integration, DB-Schema-Erweiterung, WebSocket-Propagation |
| 2.8 | cAdvisor | Klein | **Klein -- KORREKT** | Service in docker-compose, Prometheus scrape config |
| 3.12 | Retention-Verlaengerung | Klein | **Klein -- KORREKT aber mit Caveat** | Config-Aenderung trivial (168h -> 720h), aber Disk-Impact: 7d -> 30d bei gleicher Ingestion-Rate bedeutet ~4x mehr Speicher fuer Loki + Prometheus Volumes |

#### Fehlende Gaps (im Report nicht erwaehnt)

1. **PostgreSQL File-Logs nicht in Loki:** `logs/postgres/postgresql-*.log` werden via Bind-Mount auf Host geschrieben, aber Promtail liest nur Docker-stdout. Slow Queries (>100ms), Lock-Waits und Connection-Logs gehen fuer Loki/ML verloren. Fix: Entweder PostgreSQL `log_destination = stderr` (nur Docker stdout) oder zusaetzliche Promtail file-scrape-config fuer `logs/postgres/`.

2. **Kein Grafana Dashboard-Provisioning fuer Recording Rules:** `docker/grafana/provisioning/alerting/` existiert, aber es gibt kein Aequivalent fuer Grafana Recording Rules. Falls LogQL Recording Rules via Grafana statt via Loki deployed werden, braucht es einen zusaetzlichen Provisioning-Mechanismus.

3. **Prometheus `rule_files:` fehlt in prometheus.yml:** Aktuell gibt es keinen `rule_files:` Block. Fuer PromQL Recording Rules (nicht nur Alerts, die ueber Grafana laufen) muss prometheus.yml erweitert werden und ein Volume-Mount fuer Rules hinzugefuegt werden.

4. **Promtail Docker Socket auf Windows:** Promtail mountet `/var/run/docker.sock` -- das funktioniert nur in Docker Desktop WSL2 Backend. Auf Windows mit Hyper-V Backend kann es Probleme geben. Aktuell kein Problem (WSL2 wird genutzt), aber fuer Dokumentation relevant.

5. **Frontend Log-Driver max-size kleiner:** el-frontend hat nur 5m max-size vs. 10m fuer die anderen Core Services. Bei VITE_LOG_LEVEL=debug koennte das Frontend-Log schneller rotieren und Loki-Entries verlieren, bevor Promtail sie liest (unwahrscheinlich bei 5s refresh, aber theoretisch moeglich).

6. **Kein Healthcheck fuer Promtail HTTP-Port:** Promtail nutzt `echo > /dev/tcp/localhost/9080` statt einen echten HTTP-Endpoint. Das prueft nur Port-Erreichbarkeit, nicht ob Promtail tatsaechlich Logs an Loki sendet. Fuer robusteres Monitoring: `wget --spider http://localhost:9080/ready`.

### SC-6: Zusammenfassung der Korrekturen

| # | Stelle im Report | Korrektur/Ergaenzung |
|---|------------------|---------------------|
| 1 | Section 1.1 MQTT Broker | Mosquitto hat `log_timestamp_format %Y-%m-%dT%H:%M:%S` -- nicht voellig unstrukturiert |
| 2 | Section 2.1 MQTT-Broker 4/10 | Sollte 5-6/10 sein (hat Timestamps + spezifische Event-Types) |
| 3 | Section 3.3 Speicherort | `docker/loki/rules/` hat keinen Bind-Mount -- braucht entweder Mount oder Grafana Deployment |
| 4 | Section 3.4 Promtail Pipeline | Multiline-Stage fuer Tracebacks nicht erwaehnt (existiert, ist ML-kritisch) |
| 5 | Section 4.2 Datenfluss | PostgreSQL File-Logs (Bind-Mount) fehlen im Diagramm |
| 6 | Section 4.4 Phase 2.6 | trace_id Aufwand eher Mittel-Gross (betrifft alle MQTT Handler + DB Schema + WS) |
| 7 | Fehlt komplett | Grafana Dashboard (26 Panels), Alerting (5 Rules), Datasource Provisioning |
| 8 | Fehlt komplett | Docker Log Driver Config pro Service |
| 9 | Fehlt komplett | Volume-Inventar (7 Named Volumes) |
| 10 | Fehlt komplett | PostgreSQL File-Logging Config (Slow Queries, Lock-Waits) nicht in Loki |

---

*Report Ende. Naechster Schritt: TM entscheidet ueber Phase 1 Prioritaeten.*
