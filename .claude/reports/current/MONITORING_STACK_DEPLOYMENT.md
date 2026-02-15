# Monitoring Stack Deployment

**Datum:** 2026-02-11
**Branch:** `feature/docs-cleanup`
**Erstellt:** 2026-02-09 | **Aktualisiert:** 2026-02-11 (vollstaendige Aktualisierung)

---

## 1. Stack-Uebersicht

### 1.1 Architektur

```
ESP32 (El Trabajante)
  ├─ MQTT → El Servador → god_kaiser_* Gauges → Prometheus ─→ Grafana (Metrics)
  └─ Serial (TCP) → esp32-serial-logger* → Docker stdout → Promtail → Loki ─→ Grafana (Logs)

El Servador (FastAPI)
  ├─ /api/v1/health/metrics → Prometheus scrape (15s) ─→ Grafana (Metrics)
  ├─ stdout (structured text) → Promtail (regex parser) → Loki ─→ Grafana (Logs)
  └─ god_kaiser.log (bind-mount JSON) → Direkt-Debugging

El Frontend (Vue 3)
  └─ stdout (JSON) → Promtail (JSON parser) → Loki ─→ Grafana (Logs)

PostgreSQL
  ├─ postgres-exporter → Prometheus scrape (15s) ─→ Grafana (Metrics)
  └─ postgresql-*.log (bind-mount) → Direkt-Debugging

Mosquitto MQTT Broker
  ├─ mosquitto-exporter → Prometheus scrape (15s) ─→ Grafana (Metrics)
  └─ stdout → Promtail → Loki ─→ Grafana (Logs)

* esp32-serial-logger nur aktiv im hardware-Profil (--profile hardware)
```

### 1.2 Container-Status (2026-02-11)

#### Core-Services (Default-Profile) — 4/4 healthy

| Service | Container | Image | Health | Port(s) |
|---------|-----------|-------|--------|---------|
| postgres | `automationone-postgres` | `postgres:16-alpine` | healthy | 5432 |
| mqtt-broker | `automationone-mqtt` | `eclipse-mosquitto:2` | healthy | 1883, 9001 (WS) |
| el-servador | `automationone-server` | `auto-one-el-servador` (custom) | healthy | 8000 |
| el-frontend | `automationone-frontend` | `auto-one-el-frontend` (custom) | healthy | 5173 |

#### Monitoring-Profile — 5/6 healthy (1 kosmetisch unhealthy)

| Service | Container | Image | Health | Port(s) |
|---------|-----------|-------|--------|---------|
| loki | `automationone-loki` | `grafana/loki:3.4` | healthy | 3100 |
| promtail | `automationone-promtail` | `grafana/promtail:3.4` | healthy | 9080 (intern) |
| prometheus | `automationone-prometheus` | `prom/prometheus:v3.2.1` | healthy | 9090 |
| grafana | `automationone-grafana` | `grafana/grafana:11.5.2` | healthy | 3000 |
| postgres-exporter | `automationone-postgres-exporter` | `prometheuscommunity/postgres-exporter:v0.16.0` | healthy | 9187 (intern) |
| mosquitto-exporter | `automationone-mosquitto-exporter` | `sapcc/mosquitto-exporter:0.8.0` | **unhealthy** | 9234 (intern) |

#### Devtools-Profile — 1/1 healthy

| Service | Container | Image | Health | Port(s) |
|---------|-----------|-------|--------|---------|
| pgadmin | `automationone-pgadmin` | `dpage/pgadmin4:9.12` | healthy | 5050 |

#### Hardware-Profile — nicht gestartet

| Service | Container | Image | Status |
|---------|-----------|-------|--------|
| esp32-serial-logger | `automationone-esp32-serial` | `auto-one-esp32-serial-logger` (custom) | nicht gestartet |

**Gesamt: 12 Services definiert, 11 laufend, 1 nicht gestartet (hardware-Profil)**

---

## 2. Prometheus Metriken

### 2.1 Scrape-Targets — 4/4 UP

| Job | Target | Metrics Path | Interval | Status |
|-----|--------|-------------|----------|--------|
| el-servador | el-servador:8000 | /api/v1/health/metrics | 15s | UP |
| postgres | postgres-exporter:9187 | /metrics | 15s | UP |
| mqtt-broker | mosquitto-exporter:9234 | /metrics | 15s | UP |
| prometheus | localhost:9090 | /metrics | 15s | UP |

**Config:** `docker/prometheus/prometheus.yml`
**Retention:** 7 Tage (`--storage.tsdb.retention.time=7d`)

**Nicht gescraped:** Loki (:3100/metrics) und Promtail (:9080/metrics) — deren Ingestion-Rate, Label-Cardinality und Pipeline-Errors sind unsichtbar.

### 2.2 Custom Metrics (src/core/metrics.py)

7 God-Kaiser Gauges (aktualisiert alle 15s via Scheduler):

| Metric | Typ | Quelle | Dashboard-Panel |
|--------|-----|--------|-----------------|
| `god_kaiser_uptime_seconds` | Gauge | `time.time() - start` | Server Performance: Uptime (ID 9) |
| `god_kaiser_cpu_percent` | Gauge | `psutil.cpu_percent()` | Server Performance: CPU (ID 7) |
| `god_kaiser_memory_percent` | Gauge | `psutil.virtual_memory().percent` | Server Performance: Memory (ID 8) |
| `god_kaiser_mqtt_connected` | Gauge | `MQTTClient.is_connected()` | Top Row: MQTT (ID 2) |
| `god_kaiser_esp_total` | Gauge | DB: `ESPRepository.get_all()` | ESP32 Fleet: Total (ID 11) |
| `god_kaiser_esp_online` | Gauge | DB: status=="online" count | ESP32 Fleet: Online (ID 12) |
| `god_kaiser_esp_offline` | Gauge | DB: status=="offline" count | ESP32 Fleet: Offline (ID 13) |

Plus HTTP Auto-Metrics (prometheus-fastapi-instrumentator):
- `http_request_duration_seconds_*` — Request Latency Histogram
- `http_requests_total` — Request Count
- `http_request_size_bytes_*` / `http_response_size_bytes_*`

**GAP:** HTTP-Latency-Metriken werden exportiert, aber KEIN Dashboard-Panel dafuer. RED-Methode (Rate/Errors/Duration) ist unvollstaendig.

---

## 3. Grafana Dashboard

**Datei:** `docker/grafana/provisioning/dashboards/system-health.json`
**Titel:** "AutomationOne - Operations"
**UID:** `automationone-system-health`
**URL:** http://localhost:3000/d/automationone-system-health
**Refresh:** 10s, Default Range: last 1h

### 3.1 Panels (26 Panels, 5 Rows)

| Row | y-Pos | Panels | Visualisierungstypen |
|-----|-------|--------|---------------------|
| Top (kein Row-Header) | y=0 | Server (ID 1), MQTT (ID 2), Database (ID 3), Frontend Errors 5m (ID 4), ESP Online (ID 5), Active Alerts (ID 6) | 5x Stat, 1x AlertList |
| Server Performance | y=4 | CPU (ID 7), Memory (ID 8), Uptime (ID 9), CPU & Memory Over Time (ID 10) | 2x Gauge, 1x Stat, 1x Timeseries |
| ESP32 Fleet | y=13 | Total Registered (ID 11), Online (ID 12), Offline (ID 13), Online Rate Over Time (ID 14) | 3x Stat, 1x Timeseries |
| MQTT Traffic | y=22 | Connected Clients (ID 15), Msg/s In (ID 16), Msg/s Out (ID 17), Messages Dropped (ID 18), MQTT Message Rate (ID 19) | 4x Stat, 1x Timeseries |
| Database (collapsed) | y=35 | Active Connections (ID 20), DB Size (ID 21), Deadlocks (ID 22), Connections Over Time (ID 23) | 3x Stat, 1x Timeseries |
| Logs & Errors (collapsed) | y=36 | Error Rate by Service (ID 24), Log Volume by Service (ID 25), Recent Error Logs (ID 26) | 2x Timeseries, 1x Logs |

### 3.2 Template-Variablen

| Variable | Typ | Quelle | Werte |
|----------|-----|--------|-------|
| $service | Query | Loki `compose_service` label | includeAll=true, allValue=".*" |
| $interval | Interval | Statisch | 1m, 5m, 15m, 30m, 1h (Default: 5m) |

### 3.3 Datasources

| Name | UID | Typ | URL |
|------|-----|-----|-----|
| Prometheus | prometheus | prometheus | http://prometheus:9090 |
| Loki | loki | loki | http://loki:3100 |

---

## 4. Alerting

**Datei:** `docker/grafana/provisioning/alerting/alert-rules.yml`
**Pipeline:** 3-Stage pro Rule: A (PromQL) → B (Reduce:last) → C (Threshold), condition: C
**Phase:** 1 (UI-only, keine Contact-Points/Webhooks)

### 4.1 Alert-Rules (5 Rules)

| Rule | UID | Severity | Condition | For | Group (Interval) |
|------|-----|----------|-----------|-----|-------------------|
| Server Down | ao-server-down | critical | `up{job="el-servador"} < 1` | 1m | automationone-critical (10s) |
| MQTT Disconnected | ao-mqtt-disconnected | critical | `god_kaiser_mqtt_connected < 1` | 1m | automationone-critical (10s) |
| Database Down | ao-database-down | critical | `pg_up < 1` | 1m | automationone-critical (10s) |
| High Memory Usage | ao-high-memory | warning | `god_kaiser_memory_percent > 85` | 5m | automationone-warnings (1m) |
| ESP Devices Offline | ao-esp-offline | warning | `>50% offline AND esp_online > 0` | 3m | automationone-warnings (1m) |

**noDataState:** Critical=Alerting, Warning=OK
**execErrState:** Alle=Alerting

**Nicht abgedeckt:** Loki Down, Promtail Down, High Error Rate, Disk Full, DB Connection Saturation

---

## 5. Promtail Pipeline

**Datei:** `docker/promtail/config.yml`
**Discovery:** Docker SD via Docker Socket, Filter: `com.docker.compose.project=auto-one`
**Positions:** `/promtail-positions/positions.yaml` (Volume: automationone-promtail-positions)

### 5.1 Service-spezifische Pipelines

| Service | Parser | Extrahierte Labels | Drops | Multiline |
|---------|--------|--------------------|-------|-----------|
| el-servador | regex (`^\d{4}-\d{2}-\d{2}\s...`) | level, logger | Health-Endpoints (/health/*) | ja (Tracebacks, max 50 Zeilen) |
| el-frontend | JSON | level, component | keine | nein |
| esp32-serial-logger | JSON | level, device, component | keine | nein |
| alle anderen | nur Docker SD | compose_service, container, stream, compose_project | keine | nein |

### 5.2 Globale Labels (alle Services)

| Label | Quelle | Beispiel |
|-------|--------|----------|
| container | `__meta_docker_container_name` | automationone-server |
| stream | `__meta_docker_container_log_stream` | stdout/stderr |
| service | `compose_service` Label | el-servador |
| compose_service | `compose_service` Label | el-servador |
| compose_project | `compose_project` Label | auto-one |

---

## 6. Loki-Labels (Referenz fuer Queries)

| Service | Label `service=` | Label `container=` | Beispiel-Query |
|---------|------------------|--------------------|----------------|
| Frontend | `el-frontend` | `automationone-frontend` | `{service="el-frontend"}` |
| Server | `el-servador` | `automationone-server` | `{service="el-servador"}` |
| MQTT Broker | `mqtt-broker` | `automationone-mqtt` | `{service="mqtt-broker"}` |
| PostgreSQL | `postgres` | `automationone-postgres` | `{service="postgres"}` |
| Loki | `loki` | `automationone-loki` | `{service="loki"}` |
| Promtail | `promtail` | `automationone-promtail` | `{service="promtail"}` |
| Prometheus | `prometheus` | `automationone-prometheus` | `{service="prometheus"}` |
| Grafana | `grafana` | `automationone-grafana` | `{service="grafana"}` |
| postgres-exporter | `postgres-exporter` | `automationone-postgres-exporter` | `{service="postgres-exporter"}` |
| mosquitto-exporter | `mosquitto-exporter` | `automationone-mosquitto-exporter` | `{service="mosquitto-exporter"}` |
| pgAdmin | `pgadmin` | `automationone-pgadmin` | `{service="pgadmin"}` |
| ESP32 Serial* | `esp32-serial-logger` | `automationone-esp32-serial` | `{service="esp32-serial-logger"}` |

`*` nur aktiv im hardware-Profil.
`service` = Docker Compose Service-Name (bevorzugt fuer Queries).
`compose_project` = `auto-one` (abgeleitet vom Verzeichnisnamen `Auto-one`).

---

## 7. Logging-Strategie

### 7.1 Primary Log Path

```
stdout → Docker json-file driver → Promtail → Loki (7-day retention)
```

### 7.2 Bind-Mount Logs (Direkt-Debugging)

| Host-Pfad | Service | Container-Pfad | Format | Rotation |
|-----------|---------|----------------|--------|----------|
| `logs/server/` | el-servador | `/app/logs` | JSON (RotatingFileHandler) | 10MB x 5 backups |
| `logs/postgres/` | postgres | `/var/log/postgresql` | Text mit Timestamps | Daily + 50MB intra-day |
| `logs/mqtt/` | mqtt-broker | *(deaktiviert)* | *(stdout-only seit v3.1)* | n/a |

**Hinweis:** Der `logs/mqtt/` Bind-Mount ist in docker-compose.yml **auskommentiert**. Mosquitto loggt ausschliesslich nach stdout. Reaktivierung moeglich via `log_dest file` in `docker/mosquitto/mosquitto.conf`.

### 7.3 Docker json-file Log-Rotation

| Service | max-size | max-file |
|---------|----------|----------|
| Core-Services (postgres, mqtt, server) | 10m | 3 |
| Frontend, Monitoring-Services, ESP32-Logger | 5m | 3 |

### 7.4 Configuration References

| Komponente | Config-Datei | Key Settings |
|-----------|-------------|-------------|
| Server Logging | `El Servador/god_kaiser_server/config/logging.yaml` | RotatingFileHandler, JSON format |
| Mosquitto Logging | `docker/mosquitto/mosquitto.conf` | `log_dest stdout` |
| PostgreSQL Logging | `docker/postgres/postgresql.conf` | `logging_collector = on`, daily rotation |
| Docker Log Driver | `docker-compose.yml` (per service) | `json-file`, max-size/max-file |
| Promtail Pipeline | `docker/promtail/config.yml` | Docker SD, label extraction |
| Loki Retention | `docker/loki/loki-config.yml` | `retention_period: 168h` |
| Logging-Strategie-Doku | `docker/README-logging.md` | Primary path, bind-mounts, cleanup |

---

## 8. Volumes

### 8.1 Aktive Volumes (7 definiert)

| Volume | Service | Zweck |
|--------|---------|-------|
| `automationone-postgres-data` | postgres | PostgreSQL Daten |
| `automationone-mosquitto-data` | mqtt-broker | MQTT Broker Persistence |
| `automationone-loki-data` | loki | Loki Log-Daten |
| `automationone-prometheus-data` | prometheus | Prometheus TSDB (7d Retention) |
| `automationone-grafana-data` | grafana | Grafana Dashboards + Settings |
| `automationone-promtail-positions` | promtail | Promtail Read-Positions |
| `automationone-pgadmin-data` | pgadmin | pgAdmin Konfiguration |

Alle Volumes nutzen `name:` Attribut fuer konsistentes Naming ohne Docker-Compose-Projekt-Prefix.

### 8.2 Legacy Volumes (loeschbar)

6 alte Volumes mit `auto-one_automationone-*` Prefix (vor Volume-Naming-Fix). Migrationshinweis in docker-compose.yml. Koennen mit `docker volume rm` entfernt werden.

---

## 9. Zugriff

| Tool | URL | Credentials |
|------|-----|-------------|
| Grafana | http://localhost:3000 | admin / (GRAFANA_ADMIN_PASSWORD aus .env) |
| Dashboard | http://localhost:3000/d/automationone-system-health | admin / (aus .env) |
| Prometheus | http://localhost:9090 | — |
| Loki API | http://localhost:3100 | — |
| pgAdmin | http://localhost:5050 | (PGADMIN_DEFAULT_EMAIL / PGADMIN_DEFAULT_PASSWORD aus .env) |
| Server API | http://localhost:8000/api/v1/docs | JWT Auth |
| Frontend | http://localhost:5173 | — |

---

## 10. Makefile-Targets

| Target | Befehl | Aktion |
|--------|--------|--------|
| `monitor-up` | `docker compose --profile monitoring up -d` | Monitoring-Stack starten |
| `monitor-down` | `docker compose --profile monitoring down` | Monitoring-Stack stoppen |
| `monitor-logs` | `docker compose --profile monitoring logs -f --tail=100` | Monitoring Logs folgen |
| `monitor-status` | `docker compose --profile monitoring ps` | Monitoring Container-Status |
| `devtools-up` | `docker compose --profile devtools up -d` | DevTools (pgAdmin) starten |
| `devtools-down` | `docker compose --profile devtools down` | DevTools stoppen |
| `status` | `docker compose ps` | Alle Container-Status |
| `health` | `curl -s http://localhost:8000/api/v1/health/live` | Server Health-Check |

---

## 11. Bekannte Probleme

### 11.1 Mosquitto-Exporter Healthcheck (Severity: LOW)

- **Symptom:** Container-Status "unhealthy"
- **Ursache:** Image `sapcc/mosquitto-exporter:0.8.0` ist Scratch/Distroless-Build ohne `/bin/sh`. CMD-SHELL Healthcheck mit `wget` erfordert Shell.
- **Impact:** KEINER funktional. Exporter laeuft, Prometheus scrapt erfolgreich (Target UP).
- **Fix:** Healthcheck in docker-compose.yml aendern auf `test: ["NONE"]` oder Binary-Check ohne Shell.

### 11.2 Keine Resource Limits (Severity: MEDIUM)

- **Status:** KEIN Service in docker-compose.yml hat `deploy.resources` oder `mem_limit` definiert.
- **Empfehlung:** Resource Limits fuer alle Services definieren (Exporters: 64-128M, Core: 256-512M, Monitoring: 128-256M).

### 11.3 Loki/Promtail nicht gescraped (Severity: LOW)

- **Status:** Prometheus hat keine Scrape-Jobs fuer Loki (:3100/metrics) und Promtail (:9080/metrics).
- **Impact:** Ingestion-Rate, Label-Cardinality und Pipeline-Errors von Loki/Promtail sind unsichtbar.
- **Fix:** 2 zusaetzliche Jobs in `docker/prometheus/prometheus.yml` hinzufuegen.

### 11.4 Legacy Volumes (Severity: INFO)

- 6 alte `auto-one_automationone-*` Volumes belegen Speicherplatz.
- Koennen nach Verifikation der Datenmigration geloescht werden.

---

## 12. Aenderungs-Historie

### 2026-02-09: Initial Deployment

- 4 Monitoring-Services (loki, promtail, prometheus, grafana) erstellt
- Promtail Docker SD mit Label-Extraktion konfiguriert
- Prometheus Scrape-Target fuer el-servador korrigiert (`/metrics` → `/api/v1/health/metrics`)
- Promtail Relabel-Configs korrigiert (compose_service Label-Pfad)
- PostgreSQL `listen_addresses = '*'` gesetzt (fix Cross-Container-Verbindungen)
- Promtail Healthcheck: `wget` durch `bash /dev/tcp` ersetzt (kein wget im Image)
- 4 Makefile-Targets (monitor-up/down/logs/status)
- Grafana Dashboard "AutomationOne - Operations" provisioniert (26 Panels)
- 5 Alert-Rules provisioniert (3 critical, 2 warning)
- 2 Datasources provisioniert (Prometheus, Loki)

### 2026-02-09 → 2026-02-11: Erweiterungen

- postgres-exporter Service hinzugefuegt (Profile: monitoring)
- mosquitto-exporter Service hinzugefuegt (Profile: monitoring)
- esp32-serial-logger Service hinzugefuegt (Profile: hardware)
- Prometheus Scrape-Jobs fuer postgres-exporter und mosquitto-exporter ergaenzt
- MQTT Dashboard-Row: 5 Panels mit mosquitto-exporter Metriken (Connected Clients, Msg/s, Dropped)
- Database Dashboard-Row: 4 Panels mit postgres-exporter Metriken (Connections, DB Size, Deadlocks)
- Promtail Pipeline: esp32-serial-logger Match-Stage hinzugefuegt (JSON parser, device/component Labels)
- Volume-Naming-Fix: `name:` Attribut fuer alle 7 Volumes
- Port 1883 auf Host gemappt (war vorher nur intern)
- pgAdmin Service mit eigenem devtools-Profil (kein Orphan mehr)
- DevTools Makefile-Targets (devtools-up/down/logs/status)

### 2026-02-11: Vollstaendige Dokumentations-Aktualisierung

- Report von Grund auf aktualisiert (war veraltet: fehlten 2 Exporter, esp32-logger, korrigierter Port, Volumes)
- Alle Abschnitte gegen echtes System verifiziert (docker-compose.yml, prometheus.yml, promtail config, alert-rules.yml, metrics.py, system-health.json)
- Bekannte Probleme dokumentiert (Mosquitto-Exporter Healthcheck, fehlende Resource Limits, Loki/Promtail nicht gescraped)
