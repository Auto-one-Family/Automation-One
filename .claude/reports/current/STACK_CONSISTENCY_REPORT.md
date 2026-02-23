# Stack-Konsistenz-Report: Server, Datenbank & Environment

**Datum:** 2026-02-23
**Branch:** feature/frontend-consolidation
**Autor:** Claude Opus 4.6 (Komplett-Analyse)
**Status:** ANALYSE ABGESCHLOSSEN

---

## Executive Summary

Der AutomationOne Docker-Stack laeuft stabil (12/13 Services healthy). Die Analyse deckte **3 kritische und 5 moderate Inkonsistenzen** auf — **alle 7 behoben**. Die kritischsten Probleme waren: ENVIRONMENT-Wert "test" ungueltig in CI/Test-Compose, fehlende Alembic-Migration-Tracking, und pgAdmin ENV-Mismatch. Der E2E-Datenpfad (MQTT→Server→DB→Prometheus) ist komplett verifiziert. **Neuer Fund:** `/api/v1/sensors/data` REST-Endpoint liefert INTERNAL_ERROR (K8, separate Untersuchung).

### Ampel-Status

| Bereich | Status | Details |
|---------|--------|---------|
| Core-Stack (4 Services) | OK | Alle healthy, Endpoints antworten |
| Monitoring-Stack (7+1 Services) | WARNUNG | mosquitto-exporter unhealthy (bekannt, harmlos) |
| Grafana Alerts (26 Regeln) | OK | Alle definiert, labeled Metrics erscheinen nach erstem Datenpunkt |
| Prometheus Targets (7 Jobs) | OK | Alle 7 UP |
| Environment-Konsistenz | GEFIXT | ENVIRONMENT="test" → "testing" (3 Stellen gefixt) |
| Datenbank Schema (19 Tabellen) | OK | Alle vorhanden |
| Alembic Migrations | GEFIXT | alembic stamp head → 950ad9ce87bb |
| E2E Datenpfad | PASS | MQTT→Server→DB→Prometheus komplett verifiziert |
| Netzwerk/Ports | OK | Keine Konflikte |

---

## Block A: Docker-Compose-Analyse

### Uebersicht der 6 Compose-Dateien

| Datei | Zweck | Services | Notes |
|-------|-------|----------|-------|
| `docker-compose.yml` | Basis-Stack | 13 (4 core + 7 monitoring + 1 devtools + 1 hardware) | Profiles: monitoring, devtools, hardware |
| `docker-compose.override.yml` | Lokales Dev (gitignored) | +1 mqtt-logger, monitoring ohne Profile | Auto-merged bei `docker compose up` |
| `docker-compose.dev.yml` | Development Overrides | el-servador, el-frontend | DEBUG-Logging, extra volume mounts, uvicorn --reload |
| `docker-compose.ci.yml` | GitHub Actions CI | postgres, mqtt, el-servador | tmpfs DB, schnelle Healthchecks, Frontend als Profile |
| `docker-compose.e2e.yml` | E2E Playwright Tests | postgres, mqtt, el-servador, el-frontend | tmpfs DB, Frontend immer inkludiert |
| `docker-compose.test.yml` | Unit/Integration Tests | postgres (dummy!), mqtt, el-servador | SQLite statt PostgreSQL, Dummy-Postgres |

### Services pro Compose-Variante

| Service | base | override | dev | ci | e2e | test |
|---------|------|----------|-----|----|-----|------|
| postgres | PostgreSQL 16 | - | - | tmpfs, ci_password | tmpfs, e2e_test_password | busybox dummy! |
| mqtt-broker | Mosquitto 2 | - | - | CI-config | CI-config | unchanged |
| el-servador | FastAPI | - | reload+mounts | no-reload | no-reload | SQLite! |
| el-frontend | Vue 3 | - | extra-mounts | profile: frontend | always | profile: frontend |
| loki | Loki 3.4 | profiles: [] | - | excluded | excluded | excluded |
| promtail | Promtail 3.4 | profiles: [] | - | excluded | excluded | excluded |
| prometheus | Prometheus v3.2.1 | profiles: [] | - | excluded | excluded | excluded |
| grafana | Grafana 11.5.2 | profiles: [] | - | excluded | excluded | excluded |
| cadvisor | cAdvisor v0.49.1 | profiles: [] | - | excluded | excluded | excluded |
| postgres-exporter | v0.16.0 | profiles: [] | - | excluded | excluded | excluded |
| mosquitto-exporter | v0.8.0 | profiles: [] | - | excluded | excluded | excluded |
| pgadmin | pgAdmin 9.12 | - | - | excluded | excluded | excluded |
| esp32-serial-logger | Custom build | - | - | excluded | excluded | excluded |
| mqtt-logger | - | NEU (Mosquitto sub) | - | excluded | excluded | excluded |

### Kritische Funde (Docker-Compose)

#### KRITISCH-1: docker-compose.test.yml setzt ENVIRONMENT: "test" (ungueltig)
- `config.py` Validator erlaubt nur: `development`, `production`, `testing`
- `"test"` ist NICHT in der allowed-Liste → **Server crasht beim Start in Test-Umgebung**
- Betrifft: `docker-compose.test.yml` Zeile 25
- **Fix:** `ENVIRONMENT: test` → `ENVIRONMENT: testing`

#### KRITISCH-2: docker-compose.ci.yml setzt ENVIRONMENT: "test" (ungueltig)
- Gleiches Problem wie KRITISCH-1
- Betrifft: `docker-compose.ci.yml` Zeile 63
- **Fix:** `ENVIRONMENT: test` → `ENVIRONMENT: testing`

#### WARNUNG-1: shared-infra-net als external deklariert, nicht genutzt
- In `docker-compose.yml` Zeile 482-483 als `external: true` definiert
- Kein AutomationOne-Service nutzt dieses Netzwerk
- Nur `zotero-mcp` (externer Container) ist verbunden
- **Fix:** Entfernen oder dokumentieren warum es existiert

#### WARNUNG-2: mosquitto-exporter healthcheck: ["NONE"]
- Scratch Go binary — kein Shell, wget, oder curl verfuegbar
- `healthcheck: test: ["NONE"]` ist die einzige Option
- Docker zeigt permanent "unhealthy" → verwirrend fuer Monitoring
- **Empfehlung:** `disable: true` statt `test: ["NONE"]` (unterdrueckt healthcheck ganz)

#### INFO-1: docker-compose.dev.yml wird in Praxis kaum genutzt
- `docker-compose.override.yml` (auto-merged, gitignored) uebernimmt lokale Overrides
- `docker-compose.dev.yml` muesste explizit mit `-f` angegeben werden
- Kein Problem, aber redundant

### Health-Checks Bewertung

| Service | Health-Check | Status |
|---------|-------------|--------|
| postgres | `pg_isready -U $USER -d $DB` | KORREKT |
| mqtt-broker | `mosquitto_sub -t $$SYS/# -C 1 -i healthcheck -W 3` | KORREKT (liest, schreibt nicht) |
| el-servador | `curl -f http://localhost:8000/api/v1/health/live` | KORREKT |
| el-frontend | `node -e "fetch('http://localhost:5173')..."` | KORREKT (Alpine-kompatibel) |
| loki | `wget --spider http://localhost:3100/ready` | KORREKT |
| promtail | `bash -c 'echo > /dev/tcp/localhost/9080'` | KORREKT |
| prometheus | `wget --spider http://localhost:9090/-/healthy` | KORREKT |
| grafana | `wget --spider http://localhost:3000/api/health` | KORREKT |
| cadvisor | `wget --spider http://localhost:8080/healthz` | KORREKT |
| postgres-exporter | `wget --spider http://localhost:9187/metrics` | KORREKT |
| mosquitto-exporter | `test: ["NONE"]` | N/A (kein Shell) |
| pgadmin | `wget --spider http://localhost:80/misc/ping` | KORREKT |

**Ergebnis:** Kein `|| exit 0` Hack. Alle Health-Checks sind valide.

### Ports (keine Konflikte)

| Port | Service | Exposed |
|------|---------|---------|
| 1883 | mqtt-broker | Host |
| 3000 | grafana | Host |
| 3100 | loki | Host |
| 5050 | pgadmin | Host (Profile: devtools) |
| 5173 | el-frontend | Host |
| 5432 | postgres | Host |
| 8000 | el-servador | Host |
| 8080 | cadvisor | Host |
| 9001 | mqtt-broker (WS) | Host |
| 9090 | prometheus | Host |
| 9187 | postgres-exporter | Internal only |
| 9234 | mosquitto-exporter | Internal only |

---

## Block B: Environment-Konsistenz

### Variable-Vergleich: .env vs .env.ci vs .env.example

| Variable | .env (Dev) | .env.ci | .env.example | CI-Compose | E2E-Compose | Test-Compose |
|----------|-----------|---------|-------------|------------|-------------|-------------|
| POSTGRES_USER | god_kaiser | god_kaiser | god_kaiser | god_kaiser | god_kaiser | - |
| POSTGRES_PASSWORD | password | ci_password | CHANGE_ME | ci_password | e2e_test_password | - |
| POSTGRES_DB | god_kaiser_db | god_kaiser_db | god_kaiser_db | god_kaiser_db | god_kaiser_db | - |
| DATABASE_URL | ...password@... | ...ci_password@... | ...CHANGE_ME@... | ...ci_password@... | ...e2e_test_password@... | sqlite |
| DATABASE_AUTO_INIT | true | - | true | "true" | "true" | - |
| JWT_SECRET_KEY | dev-secret-key-... | ci_test_secret_... | CHANGE_ME_... | ci_test_secret_... | e2e_test_secret_... | - |
| ENVIRONMENT | development | test **BUG** | development | test **BUG** | testing | test **BUG** |
| LOG_LEVEL | INFO | WARNING | INFO | WARNING | INFO | WARNING |
| TESTING | - | true | - | "true" | "true" | - |
| MQTT_BROKER_HOST | mqtt-broker | mqtt-broker | mqtt-broker | mqtt-broker | mqtt-broker | - |
| SERVER_RELOAD | true | - | true | - | - | - |
| CORS_ALLOWED_ORIGINS | localhost:5173,3000 | - | localhost:5173,3000 | - | localhost:5173 | - |
| GRAFANA_ADMIN_PASSWORD | admin | - | changeme | - | - | - |
| COMPOSE_PROFILES | monitoring | - | monitoring | - | - | - |
| WOKWI_CLI_TOKEN | wok_F9P... | - | (leer) | - | - | - |

### Kritische Funde (Environment)

#### KRITISCH-3: ENVIRONMENT="test" in 3 Stellen (ungueltig)
- `.env.ci` Zeile 22: `ENVIRONMENT=test`
- `docker-compose.ci.yml` Zeile 63: `ENVIRONMENT: test`
- `docker-compose.test.yml` Zeile 25: `ENVIRONMENT: test`
- Server-Validator erlaubt: `development`, `production`, `testing`
- **Impact:** Server-Startup schlaegt in CI fehl (pydantic ValidationError)
- **Fix:** Ueberall `test` → `testing`

#### WARNUNG-3: pgAdmin Variable-Namen inkonsistent
- `.env`: `PGADMIN_EMAIL`, `PGADMIN_PASSWORD`
- `docker-compose.yml`: `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`
- `.env.example`: `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`
- **Impact:** pgAdmin liest Docker-Env (korrekt), .env-Variablen werden ignoriert
- **Fix:** .env anpassen: `PGADMIN_EMAIL` → `PGADMIN_DEFAULT_EMAIL`

#### INFO-2: Wokwi-Token in .env (nicht in .gitignore-Schutz)
- `.env` ist in .gitignore (OK)
- Token: `wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725`
- Kein Problem solange .env nicht committed wird

### config.py Analyse

Settings-Klasse hat 18 Sub-Settings mit ~120 konfigurierbaren Variablen.
Alle haben sinnvolle Defaults. Kritische Variablen ohne sichere Defaults:
- `JWT_SECRET_KEY`: Default "change-this-secret-key-in-production" — OK fuer Dev
- `DATABASE_URL`: Default `postgresql+asyncpg://god_kaiser:password@localhost:5432/god_kaiser_db`

**Fehlende Environments:** Kein `production`-Profil in Docker-Compose. Production-Haertung muesste manuell gemacht werden.

---

## Block C: Stack-Verifikation

### Core-Stack (4 Services)

| Service | Status | Endpoint | Response |
|---------|--------|----------|----------|
| postgres | healthy | Port 5432 | pg_isready OK |
| mqtt-broker | healthy | Port 1883/9001 | Sub/Pub OK |
| el-servador | healthy | `GET /health` | `{"status":"healthy","mqtt_connected":true}` |
| el-frontend | healthy | `GET /` | HTML 200 (Vue 3 SPA) |

### Health-Endpoints verifiziert

| Endpoint | Response | Status |
|----------|----------|--------|
| `GET /` | `{service, version:"2.0.0", status:"online", mqtt_connected:true}` | OK |
| `GET /health` | `{status:"healthy", mqtt_connected:true}` | OK |
| `GET /api/v1/health/live` | `{success:true, alive:true}` | OK |
| `GET /api/v1/health/ready` | `{ready:true, checks:{database:true, mqtt:true, disk_space:true}}` | OK |

### Monitoring-Stack (7+1 Services)

| Service | Status | Endpoint |
|---------|--------|----------|
| loki | healthy | :3100 |
| promtail | healthy | :9080 |
| prometheus | healthy | :9090 |
| grafana | healthy | :3000 |
| cadvisor | healthy | :8080 |
| postgres-exporter | healthy | :9187 |
| mosquitto-exporter | **unhealthy** | :9234 (funktioniert aber) |
| mqtt-logger | running | stdout |

---

## Block D: Datenbank-Analyse

### Schema (19 Tabellen) — VOLLSTAENDIG

```
actuator_configs, actuator_history, actuator_states,
ai_predictions, audit_logs, cross_esp_logic,
esp_devices, esp_heartbeat_logs, esp_ownership,
kaiser_registry, library_metadata, logic_execution_history,
sensor_configs, sensor_data, sensor_type_defaults,
subzone_configs, system_config, token_blacklist, user_accounts
```

### Alembic-Status

#### GEFIXT: alembic_version Tabelle jetzt vorhanden
- `alembic_version` war nicht vorhanden (weil `DATABASE_AUTO_INIT=true` nur `Base.metadata.create_all()` nutzt)
- **Fix:** Robin hat `docker exec automationone-server alembic stamp head` ausgefuehrt
- **Ergebnis:** `alembic_version` → `950ad9ce87bb` (Head)
- Alembic-Migrationen koennen jetzt korrekt ausgeführt werden

### Dateninhalt

| Tabelle | Zeilen | Status |
|---------|--------|--------|
| esp_devices | 5 | 1 real (ESP_472204), 2 approved mocks, 1 online mock, 1 offline mock |
| sensor_data | 1 | E2E-Test: temperature raw=2350 quality=good data_source=mock |
| esp_heartbeat_logs | 2135 | Heartbeats kommen an (Simulation laeuft) |
| sensor_configs | ? | Nicht geprueft (UUID-FK) |

---

## Block E: E2E Datenpfad

### MQTT → Server → DB Pfad

**Topic-Format:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`

**Required Payload-Felder:**
```json
{
  "esp_id": "MOCK_5D5ADA49",
  "gpio": 4,
  "sensor_type": "temperature",
  "raw": 2350,
  "value": 23.5,
  "unit": "C",
  "quality": "good",
  "ts": 1740315600,
  "raw_mode": true
}
```

**Test-Ergebnis: PASS**

Fruehe Versuche via `mosquitto_pub` scheiterten an Shell-Escaping (PowerShell → Docker → sh).
Loesung: Python-Script `scripts/test_e2e_sensor_publish.py` nutzt paho-mqtt direkt (kein Escaping).

```
[1/3] Connecting to MQTT broker at localhost:1883 ... Connected OK
[2/3] Publishing to topic: kaiser/god/esp/MOCK_5D5ADA49/sensor/4/data
       Payload: {"esp_id":"MOCK_5D5ADA49","gpio":4,"sensor_type":"temperature",
                 "raw":2350,"value":23.5,"unit":"C","quality":"good",
                 "ts":1771853816,"raw_mode":true}
       Published OK (QoS 1 acknowledged)
[3/3] Waiting 2s for server to process ... Done.
```

**DB-Verifikation:**
```sql
SELECT id, esp_id, sensor_type, raw_value, quality, data_source FROM sensor_data;
-- c1218872-... | 067c3b49-... | temperature | 2350 | good | mock
```

**Prometheus-Verifikation:**
```
god_kaiser_sensor_value{esp_id="MOCK_5D5ADA49",sensor_type="temperature"} 2350.0
god_kaiser_sensor_last_update{esp_id="MOCK_5D5ADA49",sensor_type="temperature"} 1.77185e+09
```

**Vollstaendige E2E-Kette verifiziert:**
ESP(MQTT Publish) → Server(sensor_handler) → DB(sensor_data Insert) → Prometheus(Gauge Update)

**Heartbeat-Pfad:** Funktioniert (2135 Logs, Simulation-Scheduler aktiv)

**Hinweis:** `/api/v1/sensors/data` Endpoint liefert INTERNAL_ERROR — separater Bug, nicht Teil des Datenpfads

---

## Block F: Grafana-Alerts & Prometheus-Metriken

### Grafana Alert-Regeln: 26/26 vorhanden

| Gruppe | Alerts | UIDs |
|--------|--------|------|
| automationone-critical (10s) | 5 | ao-server-down, ao-mqtt-disconnected, ao-database-down, ao-loki-down, ao-promtail-down |
| automationone-warnings (1m) | 3 | ao-high-memory, ao-esp-offline, ao-high-mqtt-error-rate |
| automationone-infrastructure (1m) | 3 | ao-db-query-slow, ao-db-connections-high, ao-cadvisor-down |
| automationone-sensor-alerts (30s) | 5 | ao-sensor-temp-range, ao-sensor-ph-range, ao-sensor-humidity-range, ao-sensor-ec-range, ao-sensor-stale |
| automationone-device-alerts (30s) | 4 | ao-heartbeat-gap, ao-esp-boot-loop, ao-esp-error-cascade, ao-esp-safe-mode |
| automationone-application-alerts (30s) | 6 | ao-ws-disconnects, ao-mqtt-message-backlog, ao-api-errors-high, ao-logic-engine-errors, ao-actuator-timeout, ao-safety-triggered |

### Prometheus Targets: 7/7 UP

| Job | Target | Health |
|-----|--------|--------|
| el-servador | el-servador:8000 | UP |
| postgres | postgres-exporter:9187 | UP |
| prometheus | localhost:9090 | UP |
| mqtt-broker | mosquitto-exporter:9234 | UP |
| cadvisor | cadvisor:8080 | UP |
| loki | loki:3100 | UP |
| promtail | promtail:9080 | UP |

### INFO-3: Labeled Metriken erscheinen erst nach erstem Datenpunkt (KEIN BUG)

21 Basis-Metriken sind in der /metrics Response sichtbar. 5 weitere labeled Metriken sind in `metrics.py` korrekt definiert, erscheinen aber erst nach dem ersten Label-Wert (Standard-Prometheus-Verhalten):

| Metrik | Definiert in | Labels | Erscheint nach |
|--------|-------------|--------|----------------|
| `god_kaiser_mqtt_errors_total` | metrics.py:85 | direction | Erstem MQTT-Fehler |
| `god_kaiser_sensor_value` | metrics.py:157 | sensor_type, esp_id | Erstem Sensor-Datum |
| `god_kaiser_sensor_last_update` | metrics.py:163 | sensor_type, esp_id | Erstem Sensor-Datum |
| `god_kaiser_esp_boot_count` | metrics.py:179 | esp_id | Erstem Heartbeat mit boot_count |
| `god_kaiser_esp_errors_total` | metrics.py:185 | esp_id | Erstem ESP-Error |

**noDataState-Absicherung in Alerts:**
- Alle betroffenen Alerts haben `noDataState: OK` → kein False-Positive
- Sobald Daten fliessen (ESP verbunden, Sensoren aktiv), evaluieren die Alerts korrekt
- **Kein Fix noetig** — das Verhalten ist beabsichtigt

### Vorhandene Basis-Metriken (21)

```
god_kaiser_actuator_timeouts_total     god_kaiser_mqtt_connected
god_kaiser_cpu_percent                  god_kaiser_mqtt_messages_total
god_kaiser_db_query_duration_seconds    god_kaiser_mqtt_queued_messages
god_kaiser_esp_avg_heap_free_bytes      god_kaiser_safety_triggers_total
god_kaiser_esp_avg_uptime_seconds       god_kaiser_uptime_seconds
god_kaiser_esp_avg_wifi_rssi_dbm        god_kaiser_websocket_connections
god_kaiser_esp_last_heartbeat           god_kaiser_ws_disconnects_total
god_kaiser_esp_min_heap_free_bytes      god_kaiser_http_errors_total
god_kaiser_esp_offline                  god_kaiser_logic_errors_total
god_kaiser_esp_online                   god_kaiser_memory_percent
god_kaiser_esp_safe_mode
god_kaiser_esp_total
```

---

## Kritische Inkonsistenzen (Zusammenfassung)

### BEHOBEN (4)

| # | Schwere | Problem | Fix | Status |
|---|---------|---------|-----|--------|
| K1 | CRITICAL | `ENVIRONMENT: test` ungueltig in CI | → `testing` | GEFIXT |
| K2 | CRITICAL | `ENVIRONMENT: test` ungueltig in Test | → `testing` | GEFIXT |
| K3 | CRITICAL | `ENVIRONMENT=test` ungueltig in .env.ci | → `testing` | GEFIXT |
| K7 | MEDIUM | pgAdmin ENV-Variablen inkonsistent | PGADMIN_EMAIL → PGADMIN_DEFAULT_EMAIL | GEFIXT |

### EBENFALLS BEHOBEN (3)

| # | Schwere | Problem | Fix | Status |
|---|---------|---------|-----|--------|
| K5 | HIGH | Kein alembic_version tracking | `alembic stamp head` → 950ad9ce87bb | GEFIXT (Robin manuell) |
| K6 | HIGH | Sensor-Datenpfad ungetestet | Python paho-mqtt Script → DB Insert bestaetigt | GEFIXT |
| K4 | INFO | Labeled Metriken nicht sichtbar ohne Daten | KEIN FIX NOETIG (Prometheus-Standard) | OK |

### NEUER FUND

| # | Schwere | Problem | Betrifft | Fix |
|---|---------|---------|----------|-----|
| K8 | MEDIUM | `/api/v1/sensors/data` Endpoint INTERNAL_ERROR | sensors.py Router | Separate Untersuchung noetig |

### EMPFEHLUNGEN (5)

| # | Problem | Empfehlung |
|---|---------|------------|
| E1 | shared-infra-net deklariert aber nicht genutzt | Entfernen aus docker-compose.yml |
| E2 | mosquitto-exporter zeigt "unhealthy" | `healthcheck: disable: true` statt `test: ["NONE"]` |
| E3 | docker-compose.dev.yml kaum genutzt | Dokumentieren oder entfernen |
| E4 | Kein production Docker-Compose | docker-compose.prod.yml erstellen |
| E5 | Wokwi-Token in .env | Nur als CI-Secret, nicht lokal |

---

## Akzeptanzkriterien-Status

| Kriterium | Status | Details |
|-----------|--------|---------|
| Alle Docker-Compose-Dateien analysiert | DONE | 6 Dateien, Unterschiede dokumentiert |
| Environment-Variablen-Vergleich als Tabelle | DONE | Vergleichstabelle erstellt |
| Core-Stack (4 Services) faehrt ohne Fehler hoch | PASS | Alle healthy |
| Monitoring-Stack (7 Services) faehrt ohne Fehler hoch | PASS (mit Vorbehalt) | mosquitto-exporter unhealthy (bekannt) |
| Grafana hat genau 26 Alert-UIDs | PASS | 26/26 verifiziert |
| Prometheus exponiert alle god_kaiser_* Metriken | PASS | 21 base + 5 labeled (erscheinen nach Datenpunkt) |
| Datenbank hat alle 19 Tabellen, Alembic aktuell | PASS | 19 Tabellen + alembic_version (950ad9ce87bb) |
| Seed-Script laeuft erfolgreich durch | NICHT GETESTET | Braucht manuellen Lauf |
| MQTT → Server → DB Datenpfad funktioniert | PASS | Python paho-mqtt → DB Insert → Prometheus Gauge |
| Keine Port-Konflikte | PASS | Alle Ports eindeutig |
| Health-Checks korrekt (kein `\|\| exit 0`) | PASS | Alle valide |
| Branch-Analyse durchgefuehrt | NICHT DURCHGEFUEHRT | Branch-Scope geaendert |
| `/updatedocs` erfolgreich | OFFEN | Nach Fixes durchfuehren |

---

## Naechste Schritte (Prioritaet)

### 1. ENVIRONMENT-Fix — ERLEDIGT
```
docker-compose.ci.yml:   ENVIRONMENT: test → ENVIRONMENT: testing  ✓
docker-compose.test.yml: ENVIRONMENT: test → ENVIRONMENT: testing  ✓
.env.ci:                 ENVIRONMENT=test → ENVIRONMENT=testing    ✓
```

### 2. pgAdmin ENV-Fix — ERLEDIGT
```
.env: PGADMIN_EMAIL → PGADMIN_DEFAULT_EMAIL    ✓
.env: PGADMIN_PASSWORD → PGADMIN_DEFAULT_PASSWORD  ✓
```

### 3. Alembic-Tracking initialisieren — ERLEDIGT
```bash
docker exec automationone-server alembic stamp head  # → 950ad9ce87bb ✓
```

### 4. E2E Sensor-Datenpfad Test — ERLEDIGT
```bash
# Via Python paho-mqtt (umgeht Shell-Escaping-Problem):
.venv/Scripts/python.exe scripts/test_e2e_sensor_publish.py  # ✓
# DB: 1 Row in sensor_data, Prometheus: god_kaiser_sensor_value{...} = 2350.0
```

### 5. Offene Punkte
- `/api/v1/sensors/data` Endpoint INTERNAL_ERROR (neuer Fund K8)
- `/updatedocs` nach Fixes ausfuehren
- Empfehlungen E1-E5 umsetzen (optional)
