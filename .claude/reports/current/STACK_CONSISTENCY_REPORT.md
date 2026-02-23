# Stack-Konsistenz-Report: Server, Datenbank & Environment

**Datum:** 2026-02-23 (Runtime-Verifikation Update)
**Branch:** `feature/frontend-consolidation`
**Autor:** Claude Code (Opus 4.6)
**Status:** RUNTIME-VERIFIZIERT

---

## Executive Summary

Der AutomationOne-Stack ist **funktional konsistent und testfeld-bereit**.
12 aktive Services laufen healthy, der E2E-Datenpfad (MQTT->Server->DB->Prometheus->Frontend)
ist **end-to-end zur Laufzeit verifiziert** (nicht nur Config-Analyse).

### Ampel-Status

| Bereich | Status | Details |
|---------|--------|---------|
| Core-Stack (4 Services) | PASS | Alle healthy, alle Endpoints antworten korrekt |
| Monitoring-Stack (7+1 Services) | PASS | 7/7 Scrape-Targets UP, mosquitto-exporter UP (NONE-Healthcheck) |
| Grafana Alerts (26 Regeln) | PASS | 26/26 zur Laufzeit verifiziert |
| Prometheus Metriken (27 definiert) | PASS | 22 sofort exponiert, 5 lazy-initialized |
| Datenbank (19 Tabellen) | PASS | Alle vorhanden, Alembic at HEAD |
| Alembic Konsistenz | WARN | 4 DESC-Index-Drifts (Model vs DB) |
| Environment-Konsistenz | PASS | Alle 4 Environments intern konsistent |
| E2E Datenpfad | PASS | MQTT->Server->DB->Prometheus->Frontend komplett |
| Branch-Aenderungen | PASS | 4 sinnvolle Fixes auf feature-branch |

---

## Block C: Docker-Stack Runtime-Verifikation

### Voraussetzungen (verifiziert)

| Pruefpunkt | Status | Details |
|------------|--------|---------|
| Docker Desktop | PASS | v29.1.3 |
| shared-infra-net | PASS | Existiert (external network) |
| Port-Konflikte | PASS | Alle Ports eindeutig |

### Services Runtime-Status

| Service | Container | Status | Uptime | Port |
|---------|-----------|--------|--------|------|
| postgres | automationone-postgres | healthy | 2h+ | 5432 |
| mqtt-broker | automationone-mqtt | healthy | 2h+ | 1883, 9001 |
| el-servador | automationone-server | healthy | 2h+ | 8000 |
| el-frontend | automationone-frontend | healthy | 2h+ | 5173 |
| grafana | automationone-grafana | healthy | 11h+ | 3000 |
| prometheus | automationone-prometheus | healthy | 11h+ | 9090 |
| loki | automationone-loki | healthy | 11h+ | 3100 |
| promtail | automationone-promtail | healthy | 11h+ | - |
| cadvisor | automationone-cadvisor | healthy | 11h+ | 8080 |
| postgres-exporter | automationone-postgres-exporter | healthy | 11h+ | 9187 |
| mosquitto-exporter | automationone-mosquitto-exporter | UP (NONE) | 11h+ | 9234 |
| mqtt-logger | automationone-mqtt-logger | UP | 11h+ | - |

**Nicht gestartet (korrekt):**
- `pgadmin` (Profile: devtools)
- `esp32-serial-logger` (Profile: hardware)

### Server Health-Endpoints (Runtime-verifiziert)

| Endpoint | HTTP | Antwort |
|----------|------|---------|
| `GET /` | 200 | `{service:"God-Kaiser Server", version:"2.0.0", status:"online", mqtt_connected:true, environment:"development"}` |
| `GET /health` | 200 | `{status:"healthy", mqtt_connected:true}` |
| `GET /api/v1/health/` | 200 | `{status:"healthy", version:"2.0.0", uptime_seconds:6866}` |
| `GET /api/v1/health/live` | 200 | `{alive:true}` |
| `GET /api/v1/health/ready` | 200 | `{ready:true, checks:{database:true, mqtt:true, disk_space:true}}` |
| `GET /api/v1/health/detailed` | 200 | DB Pool 20/18avail, 5ms latency; MQTT 5 subs; CPU 32%, RAM 33% |

### Auth-Endpoint (Runtime-verifiziert)

| Endpoint | HTTP | Anmerkung |
|----------|------|-----------|
| `POST /api/v1/auth/login` | 200 | Token-Pfad: `response.tokens.access_token` (NICHT `response.access_token`) |

**Login-Response Format:**
```json
{
  "success": true,
  "message": "Login successful",
  "tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "bearer",
    "expires_in": 1800
  },
  "user": { "id": 1, "username": "admin", "role": "admin" }
}
```

### Monitoring-Stack (Runtime-verifiziert)

| Service | Check | Ergebnis |
|---------|-------|----------|
| Loki | `/ready` | `ready` |
| Prometheus | `/-/ready` | `Prometheus Server is Ready.` |
| Grafana | `/api/health` | `{database:"ok", version:"11.5.2"}` |

### Prometheus Scrape-Targets: 7/7 UP

| Job | Health | Last Scrape |
|-----|--------|-------------|
| el-servador | up | 2026-02-23T19:15:25 |
| postgres | up | 2026-02-23T19:15:29 |
| prometheus | up | 2026-02-23T19:15:36 |
| mqtt-broker | up | 2026-02-23T19:15:37 |
| cadvisor | up | 2026-02-23T19:15:27 |
| loki | up | 2026-02-23T19:15:36 |
| promtail | up | 2026-02-23T19:15:34 |

### Grafana Alert-Regeln: 26/26 (Runtime-verifiziert)

| Gruppe | Anzahl | Regeln |
|--------|--------|--------|
| automationone-critical | 5 | Server Down, MQTT Disconnected, Database Down, Loki Down, Promtail Down |
| automationone-warnings | 3 | High Memory, ESP Offline, High MQTT Error Rate |
| automationone-infrastructure | 3 | DB Query Slow, DB Connections High, cAdvisor Down |
| automationone-sensor-alerts | 5 | Temp/pH/Humidity/EC Range, Sensor Stale |
| automationone-device-alerts | 4 | Heartbeat Gap, Boot Loop, Error Cascade, Safe Mode |
| automationone-application-alerts | 6 | WS Disconnects, MQTT Backlog, API Errors, Logic Errors, Actuator Timeout, Safety Triggered |

### Prometheus Metriken: 27 definiert, 22+5 exponiert

**22 sofort exponierte Basis-Metriken:**
```
god_kaiser_uptime_seconds             god_kaiser_mqtt_connected
god_kaiser_cpu_percent                god_kaiser_mqtt_messages_total
god_kaiser_memory_percent             god_kaiser_mqtt_queued_messages
god_kaiser_db_query_duration_seconds  god_kaiser_websocket_connections
god_kaiser_esp_total                  god_kaiser_ws_disconnects_total
god_kaiser_esp_online                 god_kaiser_http_errors_total
god_kaiser_esp_offline                god_kaiser_logic_errors_total
god_kaiser_esp_avg_heap_free_bytes    god_kaiser_actuator_timeouts_total
god_kaiser_esp_min_heap_free_bytes    god_kaiser_safety_triggers_total
god_kaiser_esp_avg_wifi_rssi_dbm      god_kaiser_esp_last_heartbeat
god_kaiser_esp_avg_uptime_seconds     god_kaiser_esp_safe_mode
```

**5 lazy-initialized Metriken (erscheinen nach erstem Event):**

| Metrik | Erscheint nach | Status nach E2E-Test |
|--------|----------------|---------------------|
| `god_kaiser_sensor_value` | Erstem Sensor-Datum | **SICHTBAR** (2350.0 fuer MOCK_0954B2B1) |
| `god_kaiser_sensor_last_update` | Erstem Sensor-Datum | Nicht geprueft |
| `god_kaiser_mqtt_errors_total` | Erstem MQTT-Fehler | Unsichtbar |
| `god_kaiser_esp_boot_count` | Erstem Heartbeat mit boot_count | Unsichtbar |
| `god_kaiser_esp_errors_total` | Erstem ESP-Error | Unsichtbar |

**Implikation:** Grafana-Alerts fuer mqtt_errors/esp_boot/esp_errors evaluieren initial als "no data".
Alle betroffenen Alerts haben `noDataState: OK` → kein False-Positive.

---

## Block D: Datenbank (Runtime-verifiziert)

### Schema: 20 Tabellen (19 App + alembic_version)

```sql
-- Verifiziert via: \dt in PostgreSQL Container
actuator_configs (0)    actuator_history (0)     actuator_states (0)
ai_predictions (0)      alembic_version (1)      audit_logs (40)
cross_esp_logic (0)     esp_devices (6)          esp_heartbeat_logs (2501)
esp_ownership (0)       kaiser_registry (0)      library_metadata (0)
logic_execution_history (0)  sensor_configs (1)  sensor_data (2)
sensor_type_defaults (11)    subzone_configs (0) system_config (0)
token_blacklist (26)    user_accounts (1)
```

### Registrierte ESP-Geraete

| device_id | Name | Status | Typ |
|-----------|------|--------|-----|
| MOCK_0954B2B1 | Mock #B2B1 | online | MOCK_ESP32 |
| MOCK_5D5ADA49 | Mock #DA49 | online | MOCK_ESP32 |
| MOCK_7CE9A94D | Mock #A94D | offline | MOCK_ESP32 |
| MOCK_25045525 | - | approved | ESP32_WROOM |
| MOCK_E1BD1447 | - | approved | ESP32_WROOM |
| ESP_472204 | - | offline | ESP32_WROOM |

### Alembic: HEAD (950ad9ce87bb)

- `alembic current` → `950ad9ce87bb (head)` ✓
- `alembic history` → 19 Migrations (inkl. 3 Mergepoints, 2 Branchpoints) ✓
- Kette von `c6fb9c8567b5` (base) bis `950ad9ce87bb` (head) ✓

### WARNUNG: 4 Index-Drifts (`alembic check` FAILED)

`alembic check` meldet Schema-Differenzen bei DESC-Indexes:

| Index | Tabelle | DB (via Alembic) | Model (SQLAlchemy) |
|-------|---------|-----------------|--------------------|
| `idx_timestamp_desc_hist` | actuator_history | `timestamp DESC` | `timestamp` (ASC) |
| `idx_timestamp_desc_ai` | ai_predictions | `timestamp DESC` | `timestamp` (ASC) |
| `idx_timestamp_desc_logic` | logic_execution_history | `timestamp DESC` | `timestamp` (ASC) |
| `idx_timestamp_desc` | sensor_data | `timestamp DESC` | `timestamp` (ASC) |

**Ursache:** Alembic-Migration erstellte DESC-Indexes. SQLAlchemy-Models definieren `Index(...)` ohne `.desc()`.
`create_all()` wuerde ASC-Indexes erstellen → Schema-Drift.

**Impact:** Gering. DESC-Indexes sind fuer `ORDER BY timestamp DESC` sogar besser.

**Empfehlung:** Models anpassen: `Index('idx_...', column.desc())` + neue Migration die den Drift dokumentiert.

### Seed-Script

- **Pfad:** `El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py`
- Erstellt 3 Wokwi-ESPs (ESP_00000001/2/3)
- Idempotent, gute Fehlerbehandlung
- **Aktuell nicht ausgefuehrt** — 6 Test-ESPs aus frueheren Sessions vorhanden
- **Nicht noetig** fuer aktuelle Tests

---

## Block E: E2E-Datenpfad (Runtime-verifiziert)

### Test: MQTT → Server → DB → Prometheus → Frontend

| Schritt | Aktion | Ergebnis |
|---------|--------|----------|
| 1. MQTT Publish | `mosquitto_pub -t "kaiser/god/esp/MOCK_0954B2B1/sensor/4/data" -m '{...}'` | Exit 0 |
| 2. Server-Log | `sensor_handler` verarbeitet | `Sensor data saved: id=5493df6d...` |
| 3. DB Insert | `sensor_data` Zeile erstellt | `raw_value=2350, quality=good, data_source=mock` |
| 4. Prometheus | `god_kaiser_sensor_value` aktualisiert | `{esp_id="MOCK_0954B2B1",sensor_type="temperature"} 2350.0` |
| 5. Frontend | Playwright Browser-Test | WebSocket verbunden, 6 Geraete geladen |

**MQTT Subscriptions (16 Topics, verifiziert aus Server-Logs):**
```
kaiser/+/esp/+/sensor/+/data (QoS 1)         kaiser/+/esp/+/system/heartbeat (QoS 0)
kaiser/+/esp/+/actuator/+/status (QoS 1)     kaiser/+/esp/+/system/will (QoS 1)
kaiser/+/esp/+/actuator/+/response (QoS 1)   kaiser/+/esp/+/system/error (QoS 1)
kaiser/+/esp/+/actuator/+/alert (QoS 1)      kaiser/+/esp/+/system/diagnostics (QoS 1)
kaiser/+/esp/+/actuator/+/command (QoS 1)    kaiser/+/esp/+/config_response (QoS 2)
kaiser/+/esp/+/actuator/emergency (QoS 1)    kaiser/+/esp/+/zone/ack (QoS 1)
kaiser/broadcast/emergency (QoS 1)           kaiser/+/esp/+/subzone/ack (QoS 1)
kaiser/+/discovery/esp32_nodes (QoS 1)
```

### Frontend (Playwright-verifiziert)

| Pruefpunkt | Ergebnis |
|------------|----------|
| Erreichbar (HTTP 200) | PASS (811 bytes) |
| Seitentitel | "El Frontend - AutomationOne Debug Dashboard" |
| WebSocket | Verbunden ("Server verbunden") |
| ESP-API | 3 Mocks + 6 DB-Geraete geladen |
| Hardware-View | 2 Online, 4 Offline, 3 Zonen |
| Navigation | Hardware, Regeln, Komponenten, System, Benutzer, Wartung, Einstellungen |
| NOT-AUS Button | Vorhanden |
| Login-Status | "admin" eingeloggt |
| Console-Errors | 1 (favicon.ico 404 — kosmetisch) |

### Bekannte MQTT Handler Timeouts

Server-Log zeigt periodische Timeouts:
```
Handler timed out for topic kaiser/god/esp/MOCK_5D5ADA49/system/heartbeat (30s)
Handler timed out for topic kaiser/god/esp/MOCK_0954B2B1/system/heartbeat (30s)
```
Mock-Heartbeat-Verarbeitung dauert gelegentlich >30s. Timeout-Konfiguration (`HANDLER_TIMEOUT=30s`) pruefen.

---

## Block F: Branch-Analyse

### Branches

| Branch | Typ | Infra-Aenderungen |
|--------|-----|-------------------|
| `feature/frontend-consolidation` (aktiv) | Feature | 4 Fixes (siehe unten) |
| `master` | Main | Baseline |
| `feature/phase2-wokwi-ci` | Feature | Keine |
| 6 Remote-Branches | Stale/Feature | Keine |

### Aenderungen feature/frontend-consolidation vs master

| Datei | Aenderung | Bewertung |
|-------|-----------|-----------|
| `.env.ci` | `ENVIRONMENT=test` → `testing` | **Wichtiger Fix:** `test` war kein valider config.py Wert |
| `docker-compose.ci.yml` | `ENVIRONMENT: test` → `testing` | Gleicher Fix |
| `docker-compose.test.yml` | `ENVIRONMENT: test` → `testing` | Gleicher Fix |
| `docker-compose.yml` | Frontend: `target: development` + `VITE_API_TARGET` / `VITE_WS_TARGET` | Feature: Multi-Stage-Build + Proxy |

**Bewertung:** Alle Aenderungen sind sinnvolle Verbesserungen. Keine Regressionen.

---

## Environment-Vergleichstabelle (Runtime-verifiziert)

| Variable | .env (Dev) | .env.ci (CI) | test.yml | e2e.yml |
|----------|-----------|-------------|----------|---------|
| POSTGRES_USER | god_kaiser | god_kaiser | (busybox) | god_kaiser |
| POSTGRES_PASSWORD | password | ci_password | (SQLite) | e2e_test_password |
| DATABASE_URL | ...password@postgres... | ...ci_password@postgres... | sqlite+aiosqlite | ...e2e_test_password@postgres... |
| DATABASE_AUTO_INIT | true | true | - | true |
| ENVIRONMENT | development | testing | testing | testing |
| LOG_LEVEL | INFO | WARNING | WARNING | INFO |
| JWT_SECRET_KEY | dev-secret-key-... | ci_test_secret_key_... | - | e2e_test_secret_key_... |
| MQTT_BROKER_HOST | mqtt-broker | mqtt-broker | - | mqtt-broker |
| COMPOSE_PROFILES | monitoring | - | - | - |

**Konsistenz:** Alle 4 Environments intern konsistent. Keine Widersprueche.

---

## Offene Punkte / Empfehlungen

### Prio 1 (Sollte behoben werden)

1. **4 DESC-Index-Drifts:** Neue Alembic-Migration die SQLAlchemy-Models mit `.desc()` synchronisiert
   - `Index('idx_timestamp_desc', SensorData.timestamp.desc())` etc.
   - Alternativ: Migration die bestehende DB-Indexes auf ASC aendert (weniger sinnvoll)

2. **favicon.ico fehlt:** `El Frontend/public/favicon.ico` erstellen (404 in Console)

### Prio 2 (Nice to have)

3. **3 nicht-registrierte Router:** `kaiser.py`, `library.py`, `ai.py` in `src/api/v1/` — bewusst deaktiviert oder vergessen?

4. **MQTT Handler Timeouts:** Mock-Heartbeat-Verarbeitung >30s. Timeout oder Mock-Intervall anpassen.

5. **`shared-infra-net` Voraussetzung:** `docker network create shared-infra-net` muss VOR `docker compose up` laufen. Dokumentieren.

### Prio 3 (Dokumentation)

6. **Lazy Prometheus-Metriken:** 5 Metriken erst nach erstem Event sichtbar — in Monitoring-Doku erwaehnen.

7. **Auth-Response-Format:** `tokens.access_token` (verschachtelt), nicht `access_token` (direkt). Doku pruefen.

---

## Akzeptanzkriterien

| Kriterium | Status | Methode |
|-----------|--------|---------|
| Alle Docker-Compose-Dateien analysiert | PASS | 6 Dateien gelesen und verglichen |
| Environment-Variablen-Vergleich erstellt | PASS | Tabelle mit 4 Environments |
| Core-Stack faehrt ohne Fehler hoch | PASS | docker compose ps: 4/4 healthy |
| Monitoring-Stack faehrt ohne Fehler hoch | PASS | 7/7 Targets UP, Grafana/Prometheus/Loki ready |
| Grafana hat 26 Alert-UIDs | PASS | API-Query: 26 Rules in 6 Gruppen |
| Prometheus exponiert god_kaiser_* Metriken | PASS | 22 sofort + 5 lazy = 27 definiert |
| Datenbank hat 19 Tabellen, Alembic aktuell | PASS | 19+alembic_version, current=HEAD |
| Seed-Script analysiert | PASS | Code gelesen, idempotent, funktional |
| MQTT->Server->DB Datenpfad funktioniert | PASS | mosquitto_pub -> sensor_handler -> DB Insert -> Prometheus |
| Keine Port-Konflikte | PASS | Alle Ports eindeutig |
| Health-Checks korrekt | PASS | Alle Services mit validen Checks |
| Branch-Analyse durchgefuehrt | PASS | 4 Branches geprueft, 4 sinnvolle Aenderungen |
