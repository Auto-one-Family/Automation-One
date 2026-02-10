# Konsolidierter Report – Monitoring-Stack Analyse & Implementierung

**Erstellt:** 2026-02-09T05:22:56Z
**Verifiziert:** 2026-02-09 verify-plan – Korrekturen gegen aktuelle Codebase
**Branch:** feature/docs-cleanup
**Quellordner:** .technical-manager/inbox/agent-reports/
**Anzahl Reports:** 11

> **ACHTUNG:** Dieser Report wurde gegen die Codebase verifiziert (2026-02-09).
> Zahlreiche Befunde waren zum Zeitpunkt der Erstellung korrekt, sind aber durch
> zwischenzeitliche Implementierungen ueberholt. Korrekturen sind mit
> `[VERIFIZIERT]` markiert. Hauptabweichungen:
> - **11 Services** in docker-compose.yml (nicht 8): postgres-exporter, mosquitto-exporter, pgadmin hinzugekommen
> - **4 Prometheus Scrape-Jobs** (nicht 2): postgres + mqtt-broker Exporter existieren
> - **prometheus_client Registry + prometheus-fastapi-instrumentator** aktiv (nicht manuelle Strings)
> - **pgAdmin Service EXISTIERT** (Profile: devtools, docker-compose.yml:334-361)
> - **12 Dashboard-Panels** (nicht 6): MQTT-Broker-Sektion hinzugekommen
> - **5 Grafana Alert-Rules** provisioniert (alert-rules.yml)
> - **Frontend Structured Logger** implementiert (logger.ts, 35 Dateien migriert)
> - **Promtail el-frontend JSON-Parsing** Pipeline-Stage aktiv

## Einbezogene Reports

| # | Report | Agent | Thema | Zeilen |
|---|--------|-------|-------|--------|
| 1 | prometheus-analysis-2026-02-09.md | system-control | Prometheus IST/SOLL-Analyse | 284 |
| 2 | loki-analysis-2026-02-09.md | system-control + Explore | Loki IST/SOLL-Analyse | 422 |
| 3 | promtail-analysis-2026-02-09.md | system-control | Promtail IST/SOLL-Analyse | 522 |
| 4 | grafana-analysis-2026-02-09.md | system-control | Grafana IST/SOLL-Analyse | 504 |
| 5 | pgadmin-analysis-2026-02-09.md | system-control | pgAdmin IST/SOLL-Analyse | 521 |
| 6 | system-control-grafana-config-2026-02-09.md | system-control | Grafana Config-Korrekturen | 57 |
| 7 | system-control-promtail-healthcheck-filter-2026-02-09.md | system-control | Promtail Healthcheck-Filterung | 67 |
| 8 | system-control-promtail-positions-2026-02-09.md | system-control | Promtail Positions-Persistierung | 106 |
| 9 | agent-manager-log-access-reference-2026-02-09.md | agent-manager | LOG_ACCESS_REFERENCE Label-Korrektur | 120 |
| 10 | system-control-docker-vollaudit-korrektur-2026-02-09.md | system-control | DOCKER_VOLLAUDIT Phantom-Service-Korrektur | 98 |
| 11 | server-dev-grafana-panels-2026-02-09.md | server-dev | Dashboard-Panel-Verifikation | 119 |

---

# TEIL 1: MONITORING-STACK VOLLANALYSEN

---

## 1. Prometheus-Analyse – Vollstaendiger IST/SOLL-Bericht

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus)
**Auftrag:** TM Monitoring-Stack Auftrag 1
**Status:** ABGESCHLOSSEN
**Live-Verifizierung:** 2026-02-09 04:35 UTC - Alle 8 Container healthy, beide Scrape-Targets UP

### Live-Verifikation (2026-02-09)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | 8/8 Container healthy (inkl. monitoring profile) |
| `/api/v1/health/ready` | `{"ready": true, "checks": {"database": true, "mqtt": true, "disk_space": true}}` |
| Prometheus `/api/v1/targets` | 2 Targets: el-servador (UP, 17ms), prometheus (UP, 9ms) |
| PromQL `up` | 2 Results, beide Wert `1` |
| PromQL `god_kaiser_uptime_seconds` | Wert: `1632` (Server laeuft ~27 Minuten) |
| PromQL `god_kaiser_esp_total` | Wert: `100` (davon 15 online, 17 offline, 68 unbekannt) |
| Prometheus `/api/v1/rules` | Leere Groups (KEINE Alerting/Recording Rules) |
| Metrics-Endpoint | 7 Custom-Metriken (5 immer + 2 psutil-abhaengig) |

### 1.1 Docker-Integration – IST-Zustand

| Eigenschaft | Wert | Quelle |
|---|---|---|
| Container-Name | `automationone-prometheus` | docker-compose.yml:217 |
| Image | `prom/prometheus:v3.2.1` | docker-compose.yml:216 |
| Port-Mapping | `9090:9090` | docker-compose.yml:219-220 |
| Healthcheck | `wget --spider http://localhost:9090/-/healthy` | docker-compose.yml:232 |
| HC-Interval | 15s | docker-compose.yml:233 |
| HC-Timeout | 5s | docker-compose.yml:234 |
| HC-Retries | 5 | docker-compose.yml:235 |
| Volume | `automationone-prometheus-data:/prometheus` (Named) | docker-compose.yml:222-223 |
| Network | `automationone-net` (bridge) | docker-compose.yml:237 |
| Profile | `monitoring` (nicht im Default-Start) | docker-compose.yml:218 |
| Restart-Policy | `unless-stopped` | docker-compose.yml:238 |
| Depends-On | `el-servador` (service_healthy) | docker-compose.yml:228-230 |
| Logging | json-file, max-size 5m, max-file 3 | docker-compose.yml:239-243 |
| Resource-Limits | **KEINE definiert** | - |
| Extra-Flags | `--web.enable-lifecycle` (API-Reload moeglich) | docker-compose.yml:227 |

**Bewertung Docker-Integration:**
- Healthcheck korrekt konfiguriert
- Named Volume fuer Persistenz
- Profile-Separation (monitoring)
- Depends-on mit service_healthy
- Lifecycle-API aktiviert (Hot-Reload)
- **FEHLT:** Keine Resource-Limits (deploy.resources.limits)
- **FEHLT:** Kein start_period im Healthcheck

### 1.2 Konfiguration – IST-Zustand

**Config-Datei:** `docker/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'el-servador'
    metrics_path: '/api/v1/health/metrics'
    static_configs:
      - targets: ['el-servador:8000']
        labels:
          service: 'el-servador'
          environment: 'development'

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
        labels:
          service: 'postgres'
          environment: 'development'

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'mqtt-broker'
    static_configs:
      - targets: ['mosquitto-exporter:9234']
        labels:
          service: 'mqtt-broker'
          environment: 'development'
```

> **[VERIFIZIERT]** prometheus.yml hat 4 Jobs (nicht 2). postgres-exporter und mosquitto-exporter hinzugekommen.

| Aspekt | Status | Detail |
|---|---|---|
| Scrape-Interval | OK 15s | Standard, angemessen fuer Dev |
| Evaluation-Interval | OK 15s | Gleich wie Scrape |
| Job `el-servador` | OK | Target: `el-servador:8000`, Path: `/api/v1/health/metrics` |
| Job `postgres` | **OK (NEU)** | Target: `postgres-exporter:9187`, Default `/metrics` |
| Job `mqtt-broker` | **OK (NEU)** | Target: `mosquitto-exporter:9234`, Default `/metrics` |
| Job `prometheus` | OK | Self-Monitoring `localhost:9090/metrics` |
| Labels | Manuell | `service=el-servador/postgres/mqtt-broker`, `environment=development` |
| Retention | OK 7 Tage | Via CLI-Flag `--storage.tsdb.retention.time=7d` |
| Alerting-Rules | **KEINE** in Prometheus | Kein `rule_files:` Block (Alerting via Grafana, siehe 4.4) |
| Recording-Rules | **KEINE** | Kein `rule_files:` Block |
| Remote-Write/Read | Nicht konfiguriert | - |
| Alertmanager | Nicht konfiguriert | Kein `alerting:` Block |

### Fehlende Scrape-Targets

> **[VERIFIZIERT]** postgres-exporter und mosquitto-exporter sind IMPLEMENTIERT (docker-compose.yml:283-330, prometheus.yml Jobs `postgres` und `mqtt-broker`).

| Potentielles Target | Status | Benoetigt |
|---|---|---|
| PostgreSQL (via postgres_exporter) | **IMPLEMENTIERT** (docker-compose.yml:283-306, Port 9187) | `prometheus.yml` Job `postgres` aktiv |
| MQTT-Broker (via mosquitto_exporter) | **IMPLEMENTIERT** (docker-compose.yml:311-330, Port 9234) | `prometheus.yml` Job `mqtt-broker` aktiv |
| Node-Exporter (Host-Metriken) | Nicht vorhanden | Extra Container |
| cAdvisor (Container-Metriken) | Nicht vorhanden | Extra Container |
| Frontend (el-frontend) | Kein Metrics-Endpoint | Muesste implementiert werden |

### 1.3 El Servador Integration – IST-Zustand

**Metrics-Endpoint:**

| Eigenschaft | Wert |
|---|---|
| Pfad | `/api/v1/health/metrics` |
| Datei | `El Servador/god_kaiser_server/src/api/v1/health.py:351-423` |
| Auth | **KEINE** (korrekt fuer Prometheus-Scraping) |
| Response | `text/plain; version=0.0.4` (Prometheus-Format) |
| Library | `prometheus-client>=0.19.0` (in setup.py) |
| Implementierung | **[VERIFIZIERT] prometheus_client Gauge Registry** (`core/metrics.py`) + `prometheus-fastapi-instrumentator` fuer HTTP-Metriken (`main.py:670-676`) |

**Exportierte Metriken:**

| Metrik | Typ | Beschreibung | Immer verfuegbar |
|---|---|---|---|
| `god_kaiser_uptime_seconds` | gauge | Server-Uptime in Sekunden | Ja |
| `god_kaiser_mqtt_connected` | gauge | MQTT-Verbindungsstatus (0/1) | Ja |
| `god_kaiser_esp_total` | gauge | Registrierte ESP-Geraete gesamt | Ja |
| `god_kaiser_esp_online` | gauge | Online ESP-Geraete | Ja |
| `god_kaiser_esp_offline` | gauge | Offline ESP-Geraete | Ja |
| `god_kaiser_cpu_percent` | gauge | CPU-Auslastung % | Nur wenn psutil verfuegbar |
| `god_kaiser_memory_percent` | gauge | RAM-Auslastung % | Nur wenn psutil verfuegbar |

### KRITISCHE Luecken in der Metrik-Abdeckung

> **[VERIFIZIERT]** HTTP Request Metrics und MQTT Message Metrics sind implementiert.

| Fehlende Metrik-Kategorie | Bedeutung | Prioritaet |
|---|---|---|
| **HTTP Request Metrics** | **IMPLEMENTIERT** via `prometheus-fastapi-instrumentator` (main.py:670-676) – Request-Counts, Duration, Size automatisch | ~~KRITISCH~~ ERLEDIGT |
| **MQTT Message Metrics** | **TEILWEISE** via mosquitto-exporter (broker_messages_received, broker_messages_sent, broker_clients_connected etc.) – Kein app-level MQTT Counter | ~~HOCH~~ MITTEL |
| **Database Metrics** | **TEILWEISE** via postgres-exporter (pg_up, pg_stat_*, etc.) – Kein app-level Query-Latenz | ~~HOCH~~ MITTEL |
| **WebSocket Metrics** | Keine Connection-Counts, Message-Raten | MITTEL |
| **Error Rate Metrics** | Keine Error-Counts nach Typ | HOCH |
| **Circuit Breaker Metrics** | Kein CB-State, Trip-Count | MITTEL |

### Implementierungs-Problem

> **[VERIFIZIERT] UEBERHOLT.** Die Implementierung nutzt korrekt:
> - `prometheus_client` Gauge-Objekte in `core/metrics.py` (7 Custom Gauges)
> - `prometheus-fastapi-instrumentator` fuer automatische HTTP-Metriken (main.py:670-676)
> - Scheduler-basiertes Gauge-Update alle 15s (main.py:325-343), NICHT bei jedem Scrape
> - DB-Query nur im Scheduler-Job, nicht im Scrape-Handler
>
> **Verbleibende Luecke:** Keine Custom-Histogramme oder per-Endpoint Labels fuer app-spezifische Metriken.
> Die HTTP-Histogramme werden vom Instrumentator automatisch bereitgestellt.

### 1.4 Grafana Dashboard – Panels

> **[VERIFIZIERT]** Dashboard hat 12 Panels (nicht 6). Panels 3-4 geaendert. MQTT-Broker-Sektion (Panels 7-12) hinzugekommen.

| # | Panel | Datasource | Query | Status |
|---|---|---|---|---|
| 1 | Server Health Status | Prometheus | `up{job="el-servador"}` | FUNKTIONAL |
| 2 | MQTT Broker Status | Prometheus | `god_kaiser_mqtt_connected` | FUNKTIONAL |
| 3 | Database Status | **Prometheus** | **`pg_up`** (via postgres-exporter) | **GEAENDERT** (war Loki) |
| 4 | Frontend Errors (Last 5m) | Loki | **`count_over_time({compose_service="el-frontend", level="error"}[5m])`** | **GEAENDERT** (war "Frontend Status") |
| 5 | Log Volume by Service | Loki | `count_over_time({compose_project=...})` | FUNKTIONAL |
| 6 | Recent Error Logs | Loki | `{compose_project=...} |~ "error|exception..."` | FUNKTIONAL |
| 7 | MQTT Broker Metrics | (Row) | - | NEU |
| 8 | MQTT Broker Up | Prometheus | `up{job="mqtt-broker"}` | NEU (via mosquitto-exporter) |
| 9 | Connected Clients | Prometheus | `broker_clients_connected{job="mqtt-broker"}` | NEU |
| 10 | Messages Dropped | Prometheus | `broker_publish_messages_dropped{job="mqtt-broker"}` | NEU |
| 11 | Subscriptions | Prometheus | `broker_subscriptions_count{job="mqtt-broker"}` | NEU |
| 12 | MQTT Message Rate | Prometheus | `rate(broker_messages_received/sent[5m])` | NEU |

### 1.5 Dokumentation

| Dokument | Prometheus-relevant | Status |
|---|---|---|
| DOCKER_REFERENCE.md Section 5.3 | Port, Config, Retention, Targets | Targets-Pfad verkuerzt |
| REST_ENDPOINTS.md | `/health/metrics` gelistet | Sagt "JWT Auth" – tatsaechlich KEIN Auth |
| Dediziertes Prometheus-Referenzdokument | - | Existiert nicht |

### 1.6 Verify-Plan: Korrekturen zum TM-Auftragsdokument

| # | TM-Annahme | Tatsaechlicher Befund | Korrektur |
|---|---|---|---|
| 1 | Library: `prometheus-fastapi-instrumentator` | **[VERIFIZIERT] BEIDE vorhanden:** `prometheus-client ^0.19.0` + `prometheus-fastapi-instrumentator ^7.0.0` in pyproject.toml:47-48. Instrumentator aktiv in main.py:670-676 | TM-Dok korrekt |
| 2 | Metrics-Pfad unklar | `/api/v1/health/metrics` (verifiziert in prometheus.yml UND health.py) | Eindeutig |
| 3 | Config-Eigenschaft "PROMETHEUS_PORT" in core/config.py | Definiert als `prometheus_port: int = 9090` – wird aber nirgends aktiv genutzt | Nur Config-Platzhalter |
| 4 | Prometheus UI unter localhost:9090 | Korrekt, aber nur wenn monitoring-Profile aktiv | Profil-Hinweis noetig |

### 1.7 SOLL-Analyse: Gap-Zusammenfassung Prometheus

**Prioritaet KRITISCH:**

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| K1 | ~~Keine HTTP-Metriken~~ | **[VERIFIZIERT] ERLEDIGT** – `prometheus-fastapi-instrumentator` aktiv (main.py:670-676) | ~~`prometheus-fastapi-instrumentator` einsetzen~~ |

**Prioritaet HOCH:**

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| H1 | ~~Manuelle Metrik-Generierung~~ | **[VERIFIZIERT] ERLEDIGT** – `prometheus_client` Gauge-Objekte in `core/metrics.py` | ~~Refactor~~ |
| H2 | ~~Keine MQTT-Message-Metriken~~ | **[VERIFIZIERT] TEILWEISE ERLEDIGT** – mosquitto-exporter liefert broker-level Metriken (connected, received, sent, dropped) | Verbleibend: App-level MQTT Counter |
| H3 | ~~Keine DB-Metriken~~ | **[VERIFIZIERT] TEILWEISE ERLEDIGT** – postgres-exporter liefert pg_up, pg_stat_* etc. | Verbleibend: App-level Query-Latenz |
| H4 | ~~Keine Alerting-Rules~~ | **[VERIFIZIERT] ERLEDIGT** – 5 Grafana Alert-Rules in `docker/grafana/provisioning/alerting/alert-rules.yml` (3 critical + 2 warning) | ~~rule_files~~ |
| H5 | ~~DB-Query bei jedem Scrape~~ | **[VERIFIZIERT] ERLEDIGT** – Scheduler-Job alle 15s updated Gauges (`main.py:325-343`), Scrape liest nur Registry | ~~Caching~~ |

**Prioritaet MITTEL:**

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| M1 | Keine Recording-Rules | Haeufige Aggregationen nicht vorberechnet | Bei Bedarf ergaenzen |
| M2 | Kein Alertmanager | Alerts gehen ins Leere | Alertmanager-Container hinzufuegen |
| M3 | Label `environment=development` hardcoded | Kein Multi-Environment Support | Via ENV-Variable injizieren |
| M4 | Keine Resource-Limits | Unkontrolliertes Wachstum moeglich | `deploy.resources.limits` setzen |
| M5 | Kein start_period im Healthcheck | False-Positive Health-Failures beim Start | `start_period: 15s` hinzufuegen |
| M6 | Label-Inkonsistenz Prometheus vs Loki | Prometheus nutzt `service`, Loki/Promtail nutzt `service_name` | Labels vereinheitlichen |

**Prioritaet NIEDRIG:**

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| N1 | DOCKER_REFERENCE.md Section 5.3 falscher Metrics-Pfad | Doku-Fehler | Korrigieren |
| N2 | REST_ENDPOINTS.md falscher Auth-Status | Doku-Fehler | Korrigieren |
| N3 | Kein dediziertes Prometheus-Referenzdokument | Fehlende Wissensbasis | Erstellen |
| N4 | Keine Security (Basic Auth/TLS fuer Prometheus UI) | UI offen erreichbar | Fuer Dev OK |

### 1.8 Empfehlungen fuer TM (Prometheus)

**Sofort umsetzbar:**
1. Doku korrigieren: DOCKER_REFERENCE.md Pfad, REST_ENDPOINTS.md Auth-Status
2. Healthcheck start_period: `start_period: 15s` fuer Prometheus hinzufuegen

**Mittelfristig:**
3. `prometheus-fastapi-instrumentator`: Auto-Instrumentierung fuer HTTP-Metriken
4. Custom-Metriken refactoren: `prometheus_client` Registry statt manuelle Strings
5. Alerting-Rules: Basis-Set definieren

**Langfristig:**
6. Zusaetzliche Exporters: postgres_exporter, mosquitto_exporter
7. Alertmanager: Notification-Channel
8. cAdvisor: Container-Level-Metriken

### 1.9 Quellennachweise (Prometheus)

| Datei | Relevante Zeilen |
|---|---|
| `docker-compose.yml` | 215-243 (Prometheus Service) |
| `docker/prometheus/prometheus.yml` | Komplett (17 Zeilen) |
| `El Servador/god_kaiser_server/src/api/v1/health.py` | 351-423 (Metrics Endpoint) |
| `El Servador/god_kaiser_server/pyproject.toml` | 47-48 (`prometheus-client ^0.19.0` + `prometheus-fastapi-instrumentator ^7.0.0`) **[VERIFIZIERT]** (war setup.py, ist pyproject.toml) |
| `El Servador/god_kaiser_server/src/core/config.py` | 147 (`prometheus_port` Setting) |
| `docker/grafana/provisioning/dashboards/system-health.json` | Panels 1-4 |
| `docker/grafana/provisioning/datasources/datasources.yml` | 3-10 |

---

## 2. Loki-Analyse – Vollstaendiger IST/SOLL-Bericht

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus) + Explore (Frontend-Analyse)
**Auftrag:** TM Monitoring-Stack Auftrag 2 – Komplettanalyse
**Status:** ABGESCHLOSSEN

### 2.1 Docker-Integration – IST-Zustand

| Eigenschaft | Wert | Quelle |
|---|---|---|
| Container-Name | `automationone-loki` | docker-compose.yml:162 |
| Image | `grafana/loki:3.4` | docker-compose.yml:161 |
| Port-Mapping | `3100:3100` | docker-compose.yml:164-165 |
| Healthcheck | `wget --spider http://localhost:3100/ready` | docker-compose.yml:171 |
| HC-Interval | 15s | docker-compose.yml:172 |
| HC-Timeout | 5s | docker-compose.yml:173 |
| HC-Retries | 5 | docker-compose.yml:174 |
| Volume | `automationone-loki-data:/loki` (Named) | docker-compose.yml:167-168 |
| Config-Mount | `./docker/loki/loki-config.yml:/etc/loki/local-config.yaml:ro` | docker-compose.yml:167 |
| Network | `automationone-net` (bridge) | docker-compose.yml:176 |
| Profile | `monitoring` | docker-compose.yml:163 |
| Restart-Policy | `unless-stopped` | docker-compose.yml:177 |
| Depends-On | **KEINE** (unabhaengig) | - |
| Logging | json-file, max-size 5m, max-file 3 | docker-compose.yml:178-182 |
| Resource-Limits | **KEINE definiert** | - |

**Bewertung:** Healthcheck korrekt, Named Volume, Config read-only. **FEHLT:** Kein start_period, keine Resource-Limits.

### 2.2 Konfiguration – IST-Zustand

**Config-Datei:** `docker/loki/loki-config.yml`

```yaml
auth_enabled: false
server:
  http_listen_port: 3100
common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
limits_config:
  retention_period: 168h  # 7 Tage
compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

| Aspekt | Status | Detail |
|---|---|---|
| Auth | Deaktiviert | `auth_enabled: false` |
| Storage | OK Filesystem | Chunks + Rules unter `/loki/` |
| Schema | OK v13 + TSDB | Aktuelles Schema seit 2024-01-01 |
| Retention | OK 168h (7 Tage) | Compactor enabled |
| Ingestion Limits | **Nicht konfiguriert** | Keine max_line_size, rate_limits |
| Query Limits | **Nicht konfiguriert** | Keine max_query_length |
| Ruler | **Nicht konfiguriert** | Keine Log-basierten Alert-Rules |

### 2.3 Label-Strategie – IST-Zustand (KRITISCHER BEFUND)

**Tatsaechliche Labels (aus Promtail-Config):**

| Label | Quelle | Beispielwert |
|---|---|---|
| `container` | `__meta_docker_container_name` | `automationone-server` |
| `stream` | `__meta_docker_container_log_stream` | `stdout`, `stderr` |
| `service` | `__meta_docker_compose_service` | `el-servador` |
| `compose_service` | (identisch zu service) | `el-servador` |
| `compose_project` | `__meta_docker_compose_project` | `auto-one` |

**KRITISCHER BEFUND: `service_name` in Dokumentation ist FALSCH**

| Dokument | Behauptung | Tatsaechlich |
|---|---|---|
| TM-Auftragsdokument | "KRITISCH: AutomationOne nutzt `service_name` (NICHT `service`)" | **FALSCH** – Label heisst `service` |
| LOG_ACCESS_REFERENCE.md | "Labels: `service_name` oder `container`" | **INKONSISTENT** – `service_name` gibt es nicht als explizites Label |
| SYSTEM_OPERATIONS_REFERENCE.md | `query={service="el-servador"}` | **KORREKT** – nutzt `service` |
| Grafana Dashboard | `{compose_project="auto-one"}`, `compose_service` | **KORREKT** |

### 2.4 Frontend-Integration – KRITISCHER BEFUND

| TM-Behauptung | Tatsaechlicher Befund |
|---|---|
| "60+ Frontend-Queries nutzen `service_name`" | **0 (NULL) Loki-Queries im Frontend** |
| "Wo sind diese Queries definiert?" | **NIRGENDS** – Frontend hat keine Loki-Integration |
| "In Vue-Components? In Pinia-Stores?" | **NEIN** – Kein LogQL, kein Loki-SDK |

**Tatsaechliche Frontend-Logging-Architektur:**

> **[VERIFIZIERT] UEBERHOLT.** Frontend hat jetzt strukturierten Logger.

```
El Frontend (Vue 3)
  1. Strukturierter Logger (IMPLEMENTIERT)
     El Frontend/src/utils/logger.ts – createLogger()
     35 Dateien nutzen den Logger (Stores, Composables, Components, Views)
     Gibt JSON aus (level, component, message, timestamp)
     → Promtail parsed level + component via Pipeline-Stage
  2. Verbleibende raw console.* Calls: 8 in 2 Dateien (logger.ts selbst + sensors.ts)
  3. Server-Log Viewer (REST API, kein Loki)
     logsApi.queryLogs() → /api/v1/debug/
     → Liest JSON-Dateien vom Server, NICHT Loki-basiert
```

### 2.5 Server Structured Logging

| Aspekt | Status | Detail |
|---|---|---|
| Logging-Library | `logging_config.py` | Custom Python Logger |
| Format | JSON (strukturiert) | Ausgabe als JSON-Lines |
| Output | stdout + File | `logs/server/god_kaiser.log` + stdout → Promtail |
| Log-Levels | Konfigurierbar | Via `LOG_LEVEL` ENV |

Server gibt **strukturierte JSON-Logs** aus, aber Promtail parsed diese **NICHT** (kein `json` Pipeline-Stage).

### 2.6 SOLL-Analyse: Gap-Zusammenfassung Loki

**Prioritaet KRITISCH:**

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| K1 | **Label-Inkonsistenz in Doku** | LOG_ACCESS_REFERENCE.md sagt `service_name`, tatsaechlich `service` | Doku korrigieren |
| K2 | **Kein JSON-Parsing in Promtail** | Server-JSON-Logs nicht aufgeloest | `json` Pipeline-Stage |

**Prioritaet HOCH:**

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| H1 | Kein Log-Level Label | Kann nicht nach ERROR/WARN/INFO filtern (nur Regex) | Pipeline-Stage |
| H2 | Kein Healthcheck-Filtering | Healthcheck-Logs fluten Loki (~360/h) | Drop-Stage |
| H3 | Keine Ingestion-Limits | Ungeschuetzt vor Log-Floods | Limits setzen |
| H4 | Label-Duplikation | `service` und `compose_service` identisch | Eines entfernen |
| H5 | Kein Multiline-Handling | Python-Stacktraces fragmentiert | multiline Stage |

**Prioritaet MITTEL:**

| # | Gap | Auswirkung | Empfehlung |
|---|---|---|---|
| M1 | ~~Kein Frontend-Logger~~ | **[VERIFIZIERT] ERLEDIGT** – `logger.ts` implementiert, 35 Dateien migriert, nur 8 raw calls verbleibend | ~~Zentralen Logger implementieren~~ |
| M2 | Keine Log-basierten Alerts (Ruler) | Error-Bursts nicht erkannt | Loki-Ruler konfigurieren |

### 2.7 Verify-Plan: Korrekturen zum TM-Auftragsdokument (Loki)

| # | TM-Annahme | Tatsaechlicher Befund | Schwere |
|---|---|---|---|
| 1 | "AutomationOne nutzt `service_name`" | **FALSCH** – Label heisst `service` | KRITISCH |
| 2 | "60+ Frontend-Queries nutzen `service_name`" | **FALSCH** – 0 Loki-Queries im Frontend | KRITISCH |
| 3 | "Frontend-Konsolidierung: 242 console.*-Calls" | **[VERIFIZIERT] Strukturierter Logger implementiert.** 35 Dateien nutzen `createLogger()`. Nur 8 raw console.* Calls verbleibend in 2 Dateien | ERLEDIGT |
| 4 | Label `compose_project` korrekt? | Ja – wird von Promtail gesetzt und im Dashboard genutzt | BESTAETIGT |
| 5 | Promtail sendet an `http://loki:3100/loki/api/v1/push` | Korrekt | BESTAETIGT |
| 6 | Retention 168h (7 Tage) | Korrekt + Compactor aktiviert | BESTAETIGT |

### 2.8 Quellennachweise (Loki)

| Datei | Relevante Zeilen/Sections |
|---|---|
| `docker-compose.yml` | 158-182 (Loki), 186-210 (Promtail) |
| `docker/loki/loki-config.yml` | Komplett (34 Zeilen) |
| `docker/promtail/config.yml` | Komplett (37 Zeilen) – Label-Konfiguration Z.24-36 |
| `docker/grafana/provisioning/dashboards/system-health.json` | Panels 5-6 |
| `El Frontend/src/` | 34 Dateien mit 68+ console.* Calls (kein Loki) |

---

## 3. Promtail-Analyse – Vollstaendiger IST/SOLL-Bericht

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus)
**Auftrag:** TM Monitoring-Stack Auftrag 3 (Komplettanalyse)
**Status:** ABGESCHLOSSEN
**Live-Verifizierung:** 2026-02-09 ~04:37 UTC - Container healthy, 8 Docker-Targets entdeckt

### 3.1 Docker-Integration – IST-Zustand

| Eigenschaft | Wert | Quelle |
|---|---|---|
| Container-Name | `automationone-promtail` | docker-compose.yml:189 |
| Image | `grafana/promtail:3.4` (tatsaechlich 3.4.3) | docker-compose.yml:188 |
| Port-Mapping | **KEINES** (nur intern 9080) | docker-compose.yml |
| Volume 1 | `./docker/promtail/config.yml:/etc/promtail/config.yml:ro` | Bind-Mount, read-only |
| Volume 2 | `/var/run/docker.sock:/var/run/docker.sock:ro` | Bind-Mount, read-only |
| Network | `automationone-net` (bridge) | docker-compose.yml:204 |
| Profile | `monitoring` | docker-compose.yml:190 |
| Depends-On | `loki` (service_healthy) | docker-compose.yml:196-198 |

**Healthcheck:** `bash -c 'echo > /dev/tcp/localhost/9080'` (TCP-Check, nicht HTTP)

### 3.2 Konfiguration – IST-Zustand

**Config-Datei:** `docker/promtail/config.yml`

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0
positions:
  filename: /tmp/positions.yaml    # PROBLEM: ephemeral
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        filters:
          - name: label
            values: ["com.docker.compose.project=auto-one"]
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'compose_service'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_project']
        target_label: 'compose_project'
    pipeline_stages:
      - docker: {}
      - match:
          selector: '{compose_service="el-servador"}'
          stages:
            - drop:
                source: ""
                expression: ".*GET /api/v1/health/.* HTTP/.*"
      - match:
          selector: '{compose_service="el-frontend"}'
          stages:
            - json:
                expressions:
                  level: level
                  component: component
            - labels:
                level:
                component:
```

> **[VERIFIZIERT]** Pipeline-Stages aktualisiert: Healthcheck-Drop fuer el-servador + JSON-Parsing fuer el-frontend (level, component Labels). Positions-Datei bereits auf `/promtail-positions/positions.yaml` migriert.

### 3.3 Label-Konfiguration – Verifizierte Labels

| Label | Typ | Quelle | Werte-Beispiel |
|---|---|---|---|
| `container` | Explizit | relabel_configs | `automationone-server` |
| `stream` | Explizit | relabel_configs | `stdout`, `stderr` |
| `service` | Explizit | relabel_configs | `el-servador` |
| `compose_service` | Explizit (redundant) | relabel_configs | `el-servador` |
| `compose_project` | Explizit | relabel_configs | `auto-one` |
| `service_name` | Auto (Docker SD) | automatisch | Mischt Container- und Service-Namen |
| `detected_level` | Auto (Promtail 3.x) | automatisch | `info`, `error`, `warn`, `unknown` |

**KRITISCH:** `service` und `compose_service` sind identisch. `service_name` ist ambig.

### 3.4 Erfasste Container – Log-Volumen

| Container | compose_service | Log-Lines/h |
|---|---|---|
| automationone-server | el-servador | **~43.425** |
| automationone-grafana | grafana | ~1.401 |
| automationone-loki | loki | ~473 |
| automationone-mqtt | mqtt-broker | ~334 |
| automationone-promtail | promtail | ~32 |
| automationone-prometheus | prometheus | ~19 |
| automationone-postgres | postgres | ~10 |
| automationone-frontend | el-frontend | ~9 |

**Gesamt:** ~45.803 Log-Zeilen pro Stunde (~1.1 Mio/Tag). **el-servador dominiert mit 95%.**

### 3.5 Performance

| Metrik | Wert |
|--------|------|
| CPU | 0.44% |
| Memory | 40.27 MiB (0.51%) |
| Net I/O | 60.4kB rx / 1.51MB tx |

### 3.6 Pipeline-Luecken

> **[VERIFIZIERT]** Healthcheck-Filtering und el-frontend JSON-Parsing implementiert.

| Feature | Status | Auswirkung |
|---|---|---|
| **JSON-Parsing (el-frontend)** | **IMPLEMENTIERT** – `level` + `component` Labels extrahiert | el-frontend Logs filterbar nach Level |
| **JSON-Parsing (el-servador)** | Nicht konfiguriert | Server-JSON-Logs als Plain-Text |
| **Multiline-Handling** | Nicht konfiguriert | Stack-Traces fragmentiert |
| **Label-Extraction (el-servador)** | Nicht konfiguriert | Keine Labels aus Server-Log-Inhalt |
| **Filtering** | **IMPLEMENTIERT** – Drop-Stage fuer `/api/v1/health/*` | Healthcheck-Logs gefiltert |

### 3.7 Bekannte Probleme

| # | Problem | Prioritaet | Loesung |
|---|---------|-----------|---------|
| P1 | Positions-Datei in /tmp (ephemeral) | HOCH | Named Volume |
| P2 | Keine Healthcheck-Filterung | MITTEL | Drop-Stage |
| P3 | Kein JSON-Parsing | MITTEL | JSON-Pipeline fuer el-servador |
| P4 | Kein Multiline-Handling | NIEDRIG | Multiline-Stage |
| P5 | Label-Redundanz | NIEDRIG | compose_service entfernen |

### 3.8 File-Based Logs Evaluation

| Host-Pfad | Container | Von Promtail erfasst? |
|---|---|---|
| `./logs/server/` | el-servador | **NEIN** |
| `./logs/mqtt/` | mqtt-broker | **NEIN** |
| `./logs/postgres/` | postgres | **NEIN** |

**Empfehlung:** JA fuer PostgreSQL-Logs (Slow-Queries). NEIN fuer Server/MQTT (bereits via stdout erfasst).

### 3.9 Quellennachweise (Promtail)

| Datei/Quelle | Relevanz |
|---|---|
| `docker-compose.yml:187-210` | Promtail Service-Definition |
| `docker/promtail/config.yml` | Vollstaendige Config (38 Zeilen) |
| `curl localhost:3100/loki/api/v1/labels` | Live Label-Verifizierung |
| `docker stats automationone-promtail` | Ressourcen-Verbrauch |

---

## 4. Grafana – Vollstaendige Analyse

**Datum:** 2026-02-09
**Agent:** system-control (Monitoring-Fokus)
**Auftrag:** TM Auftrag 4
**Status:** COMPLETE
**Live-Verifizierung:** 2026-02-09 04:40 UTC - Grafana healthy, Datasources connected

### 4.1 Docker-Integration

| Eigenschaft | IST-Wert | Status |
|-------------|----------|--------|
| Container | `automationone-grafana` | OK |
| Image | `grafana/grafana:11.5.2` | OK |
| Port-Mapping | `3000:3000` | OK |
| Healthcheck | `wget --spider http://localhost:3000/api/health` | OK |
| Volume | `automationone-grafana-data:/var/lib/grafana` | OK |
| Profile | `monitoring` | OK |
| Resource-Limits | **KEINE definiert** | FEHLT |
| start_period | **NICHT definiert** | FEHLT |

**Environment-Variables:**

| Variable | Wert | Bewertung |
|----------|------|-----------|
| `GF_SECURITY_ADMIN_PASSWORD` | `${GRAFANA_ADMIN_PASSWORD:-admin}` | WARNUNG: Default `admin` |
| `GF_USERS_ALLOW_SIGN_UP` | `false` | OK |

### 4.2 Provisioning

**Datasources (`datasources.yml`):**

| Datasource | Type | URL | Access | Default | Status |
|------------|------|-----|--------|---------|--------|
| Prometheus | prometheus | `http://prometheus:9090` | proxy | JA | CONNECTED |
| Loki | loki | `http://loki:3100` | proxy | Nein | CONNECTED |

**Dashboard Provider (`dashboards.yml`):**

| Eigenschaft | Wert | Bewertung |
|-------------|------|-----------|
| Folder | AutomationOne | OK |
| disableDeletion | true | OK (korrigiert von false) |
| editable | true | OK fuer Dev |

### 4.3 Dashboard "AutomationOne - System Health"

| Panel# | Titel | Datasource | Funktional? |
|--------|-------|------------|-------------|
| 1 | Server Health Status | Prometheus | OK |
| 2 | MQTT Broker Status | Prometheus | OK (korrigiert) |
| 3 | Database Status | Loki | OK (korrigiert) |
| 4 | Frontend Status | Loki | OK (korrigiert) |
| 5 | Log Volume by Service | Loki | OK |
| 6 | Recent Error Logs | Loki | OK |

**Fehlende Dashboard-Features:**

| Feature | Status |
|---------|--------|
| Template-Variables | KEINE |
| Annotations | KEINE |
| Auto-Refresh | 10s (hinzugefuegt) |
| Links | KEINE |

### 4.4 Alerting

> **[VERIFIZIERT] 5 Grafana Alert-Rules provisioniert** in `docker/grafana/provisioning/alerting/alert-rules.yml`

| Aspekt | Status |
|--------|--------|
| Grafana Alert Rules | **5 Rules** (3 critical: server-down, mqtt-disconnected, database-down; 2 warning: high-memory, esp-offline) |
| Prometheus Alert Rules | **KEINE** (Alerting erfolgt via Grafana, nicht Prometheus rule_files) |
| Alertmanager | **NICHT deployed** (Grafana Built-in Alerting stattdessen) |
| Notification Channels | **KEINE** (Phase 1: UI-only, keine Webhook/Email) |

### 4.5 Frontend-Integration

**KEINE Grafana-Integration im Frontend vorhanden.** Kein Grafana-API-Client, kein Iframe-Embedding, kein Proxy-Endpoint.

### 4.6 Security

| Aspekt | IST | Bewertung |
|--------|-----|-----------|
| Admin-Passwort | `admin` (Default) | WARNUNG |
| Self-Registration | Disabled | OK |
| Anonymous Access | Disabled | OK |
| TLS | Nicht konfiguriert | OK fuer Dev |

### 4.7 SOLL-Analyse: Gap-Zusammenfassung Grafana

**KRITISCH:**

| # | Gap | Empfehlung |
|---|-----|------------|
| K1 | Default Admin-Passwort | `GRAFANA_ADMIN_PASSWORD` in `.env` erzwingen |

**HOCH:**

| # | Gap | Empfehlung |
|---|-----|------------|
| H1 | ~~Keine Alert-Rules~~ | **[VERIFIZIERT] ERLEDIGT** – 5 Alert-Rules in alert-rules.yml |
| H2 | Keine Template-Variables | `$service`, `$timerange` Variables hinzufuegen |
| H3 | ~~Nur 1 Dashboard~~ | **[VERIFIZIERT] ERWEITERT** – 12 Panels inkl. MQTT-Broker-Sektion. Weiterhin ESP Fleet Dashboard wuenschenswert. |

**MITTEL:**

| # | Gap | Empfehlung |
|---|-----|------------|
| M1 | Keine Annotations | Event-Marker hinzufuegen |
| M2 | Kein Dashboard-Versioning-Workflow | Git-basiertes Management |
| M3 | Keine Resource-Limits | `deploy.resources.limits` setzen |
| M4 | Keine Notification-Channels | Mindestens Webhook konfigurieren |

### 4.8 TM-Dokument-Korrekturen (Grafana)

| # | TM-Annahme | Tatsaechlicher Befund |
|---|------------|----------------------|
| 1 | `GF_INSTALL_PLUGINS` vorhanden | NICHT gesetzt |
| 2 | Dashboard-Folders | 1 Folder "AutomationOne" mit 1 Dashboard (**12 Panels**) **[VERIFIZIERT]** |
| 3 | InfluxDB vorbereitet? | NEIN |
| 4 | "60+ Frontend-Queries nutzen service_name" | Frontend hat KEINE Grafana/Loki-Integration |
| 5 | Alerting | **[VERIFIZIERT]** 5 Alert-Rules provisioniert (nicht im TM-Dokument erwartet) |

### 4.9 Quellennachweise (Grafana)

| Datei | Relevante Zeilen |
|-------|------------------|
| `docker-compose.yml` | 248-277 (Grafana Service) |
| `docker/grafana/provisioning/datasources/datasources.yml` | Komplett |
| `docker/grafana/provisioning/dashboards/dashboards.yml` | Komplett |
| `docker/grafana/provisioning/dashboards/system-health.json` | 431 Zeilen, 6 Panels |

---

## 5. pgAdmin – Vollstaendige Analyse

**Datum:** 2026-02-09
**Agent:** system-control (DevTools-Fokus)
**Status:** COMPLETE
**Live-Verifizierung:** NICHT MOEGLICH - pgAdmin-Service existiert nicht

### 5.1 Kern-Befund

> **[VERIFIZIERT] KOMPLETT UEBERHOLT.** pgAdmin ist vollstaendig implementiert.

| Check | Ergebnis |
|-------|----------|
| Service in docker-compose.yml | **VORHANDEN** (Zeilen 334-361) |
| Profile `devtools` | **EXISTIERT** (docker-compose.yml:337) |
| Container `automationone-pgadmin` | **deploybar** via `docker compose --profile devtools up -d` |
| Image | `dpage/pgadmin4:9.12` (gepinnt) |
| Port-Mapping | `5050:80` |
| Healthcheck | `wget --spider http://localhost:80/misc/ping` (15s/5s/5 retries) |
| Pre-Provisioning (`servers.json`) | VORHANDEN + **gemountet** (`/pgadmin4/servers.json:ro`) |
| Environment-Variablen (`.env.example`) | **Korrekt referenziert** (PGADMIN_DEFAULT_EMAIL, PGADMIN_DEFAULT_PASSWORD) |
| Named Volume | `automationone-pgadmin-data` |
| Depends-On | `postgres` (service_healthy) |

**Fazit:** pgAdmin ist **vollstaendig implementiert** als optionaler DevTools-Service.

### 5.2 Vorhandene Artefakte

**Pre-Provisioning: `docker/pgadmin/servers.json`**

```json
{
  "Servers": {
    "1": {
      "Name": "AutomationOne",
      "Group": "Servers",
      "Host": "postgres",
      "Port": 5432,
      "MaintenanceDB": "god_kaiser_db",
      "Username": "god_kaiser",
      "SSLMode": "prefer"
    }
  }
}
```

> **[VERIFIZIERT]** `PassFile` Feld existiert nicht (Report-Version war veraltet).

Syntaktisch korrekt, fachlich passend. **[VERIFIZIERT] GEMOUNTET** via docker-compose.yml:344 (`./docker/pgadmin/servers.json:/pgadmin4/servers.json:ro`). Hinweis: `PassFile` Feld existiert nicht mehr (Report-Version war veraltet).

**Environment-Variablen in `.env.example`:**

> **[VERIFIZIERT]** Variablen korrekt benannt und vom Service referenziert.

| Variable | Status |
|----------|--------|
| `PGADMIN_DEFAULT_EMAIL` | **AKTIV** (referenziert in docker-compose.yml:341, Default: `admin@automationone.local`) |
| `PGADMIN_DEFAULT_PASSWORD` | **AKTIV** (referenziert in docker-compose.yml:342, Default: `admin`) |

### 5.3 Dokumentations-Inkonsistenzen

> **[VERIFIZIERT] UEBERHOLT.** pgAdmin existiert jetzt. Tatsaechliche Service-Zaehlung:
> - 4 Default-Profile (postgres, mqtt-broker, el-servador, el-frontend)
> - 6 Monitoring-Profile (loki, promtail, prometheus, grafana, postgres-exporter, mosquitto-exporter)
> - 1 Devtools-Profile (pgadmin)
> - **Total: 11 Services**

| VOLLAUDIT-Behauptung | Tatsaechlich | Status |
|---------------------|--------------|--------|
| "9 Services" | **11 Services** | KORREKTUR NOETIG |
| pgadmin in Service-Tabelle | **Service existiert** (docker-compose.yml:334-361) | KORREKT |
| "Images gepinnt: 9/9 (100%)" | **11/11** (alle Images gepinnt) | ZAEHLUNG AKTUALISIEREN |
| "Healthchecks: 8/9 (89%)" | **10/11** (mosquitto-exporter hat keinen Healthcheck) | KORREKTUR |
| Port 5050 exponiert | **5050:80 gemappt** (docker-compose.yml:339) | KORREKT |

### 5.4 Entscheidung: Implementieren oder Bereinigen?

> **[VERIFIZIERT] ERLEDIGT.** Option A wurde umgesetzt. pgAdmin ist vollstaendig implementiert mit Profile `devtools`, Healthcheck, Named Volume, servers.json Mount, korrekte ENV-Variablen.

### 5.5 Quellennachweise (pgAdmin)

| Datei | Information |
|-------|-------------|
| `docker-compose.yml` | 298 Zeilen - kein pgAdmin |
| `docker-compose.ci.yml` | Z.87-88 - Kommentar referenziert pgAdmin |
| `docker-compose.e2e.yml` | Z.106 - Kommentar referenziert pgAdmin |
| `docker/pgadmin/servers.json` | Pre-Provisioning Config |
| `.env.example` | Z.51-54 - PGADMIN Vars |

---

# TEIL 2: IMPLEMENTIERUNGS-REPORTS

---

## 6. Grafana Dashboard Config Optimierung

**Agent:** system-control (via verify-plan + do)
**Datum:** 2026-02-09
**Status:** ERLEDIGT

### Ausgefuehrte Aenderungen

| # | Datei | Aenderung | Effekt |
|---|-------|-----------|--------|
| 1 | `docker/grafana/provisioning/dashboards/dashboards.yml` | `disableDeletion: false` → `true` | Dashboard vor versehentlichem Loeschen geschuetzt |
| 2 | `docker/grafana/provisioning/dashboards/system-health.json` | `"refresh": "10s"` eingefuegt | Auto-Refresh alle 10 Sekunden |
| 3 | `.env.example` | Security-Warnung ueber `GRAFANA_ADMIN_PASSWORD` | Konsistent mit JWT_SECRET_KEY Warnung |
| 4 | `.gitignore` | KEINE AENDERUNG | `.env` war bereits gelistet |

### Verifikation

| Pruefung | Ergebnis |
|----------|----------|
| YAML-Syntax | OK |
| JSON-Syntax | OK |
| Plan-IST-Abgleich | 100% korrekt |

### Ausstehend

Erfordert laufenden Monitoring-Stack:
```bash
docker compose --profile monitoring down && docker compose --profile monitoring up -d
docker logs automationone-grafana --tail 50
# Browser: http://localhost:3000 -> Dashboard zeigt "10s" Auto-Refresh
```

### Offener Punkt

**Prometheus scrape jobs unvollstaendig:** Dashboard-Panels referenzierten `up{job="mqtt-broker"}`, `up{job="postgres"}`, `up{job="el-frontend"}` - aber prometheus.yml hat nur Jobs fuer `el-servador` und `prometheus`. **Panels wurden bereits in frueherer Session korrigiert** (siehe Report 11).

---

## 7. Promtail Healthcheck-Log-Filterung

**Agent:** system-control
**Datum:** 2026-02-09
**Status:** IMPLEMENTIERT - Verifikation ausstehend

### Analyse-Findings

- **Healthcheck-Quellen:**
  - Prometheus scrapt `/api/v1/health/metrics` alle 15s (~240 Requests/h)
  - Docker Healthcheck ruft `/api/v1/health/live` alle 30s (~120 Requests/h)
  - Gesamt: ~360 Healthcheck-Requests/h
- **Filter-Option gewaehlt:** Drop in Promtail (Option A)

### Implementierung

**Datei:** `docker/promtail/config.yml`

```yaml
pipeline_stages:
  - docker: {}
  - match:
      selector: '{compose_service="el-servador"}'
      stages:
        - drop:
            source: ""
            expression: ".*GET /api/v1/health/.* HTTP/.*"
```

**Regex:** Matcht alle Health-Endpoints, matcht NICHT normale API-Requests.

### Eingesparte Metriken

- Eingesparte Logs: ~360/h
- Pro Tag: ~8.640 Logs weniger
- Besseres Signal-Rausch-Verhaeltnis in Loki

---

## 8. Promtail Positions-Datei Persistierung

**Agent:** system-control
**Datum:** 2026-02-09
**Status:** IMPLEMENTIERT, Verifikation ausstehend

### Problem

`/tmp/positions.yaml` ist ephemeral. Bei Container-Neustart:
- Positions-Datei geht verloren
- Alle Container-Logs werden erneut an Loki gesendet
- Fuehrt zu **duplizierten Log-Eintraegen**

### Implementierung (3 Aenderungen in 2 Dateien)

**1. `docker/promtail/config.yml` (Zeile 11)**
```diff
 positions:
-  filename: /tmp/positions.yaml
+  filename: /promtail-positions/positions.yaml
```

**2. `docker-compose.yml` — Promtail Service Volumes**
```diff
     volumes:
       - ./docker/promtail/config.yml:/etc/promtail/config.yml:ro
       - /var/run/docker.sock:/var/run/docker.sock:ro
+      - automationone-promtail-positions:/promtail-positions
```

**3. `docker-compose.yml` — Top-Level Volumes**
```diff
   automationone-grafana-data:
+  automationone-promtail-positions:
```

Konsistent mit bestehenden Named-Volume-Patterns (loki-data, prometheus-data, grafana-data).

### Verifikation (ausstehend)

```bash
docker compose --profile monitoring config > /dev/null    # YAML-Validierung
docker compose --profile monitoring up -d promtail        # Container starten
docker volume ls | grep automationone-promtail-positions  # Volume pruefen
docker exec automationone-promtail cat /promtail-positions/positions.yaml  # Datei pruefen
```

---

# TEIL 3: KORREKTUREN & VERIFIKATION

---

## 9. LOG_ACCESS_REFERENCE.md Label-Korrektur

**Agent:** agent-manager
**Datum:** 2026-02-09
**Auftrag:** 5
**Status:** KORRIGIERT

### Fehlerhafte Label-Namen

| Datei | Zeile | Fehlerhaft | Korrekt |
|-------|-------|-----------|---------|
| LOG_ACCESS_REFERENCE.md | 45 | `service_name` | `service` |

### Implementierung

```diff
- **Loki-Befehle (fuer session.sh):** Labels: `service_name` oder `container` mit Container-Namen
+ **Loki-Befehle (fuer session.sh):** Labels: `service` (Compose-Service: `el-servador`, `mqtt-broker`, `el-frontend`) oder `container` (Container-Name: `automationone-server`, `automationone-mqtt`, `automationone-frontend`)
+
+ > **Achtung:** Das Label `service_name` existiert ebenfalls (Docker SD Auto-Label), ist aber ambig. Stattdessen `service` verwenden.
```

### Cross-References

| Datei | Status |
|-------|--------|
| `reference/debugging/LOG_ACCESS_REFERENCE.md` Z.45 | **KORRIGIERT** |
| `reports/Technical Manager/TM SKILLS.md` Z.179-200 | Fehlerhaft, aber Report (nicht aendern) |
| `reference/debugging/LOG_LOCATIONS.md` | Bereits korrekt (v3.1) |

### Quelle der Fehlinformation

**TM SKILLS.md Zeile 181:** "WICHTIG: Label ist `service_name` (NICHT `service`!)" – Dies ist die **Quelle der Fehlinformation**. Tatsaechlich heisst das Promtail-Config-Label `service`.

---

## 10. DOCKER_VOLLAUDIT.md Phantom-Service-Korrektur

**Agent:** system-control
**Datum:** 2026-02-09
**Auftrag:** 6
**Ergebnis:** ERFOLGREICH

### Analyse-Findings

- Services in docker-compose.yml: **8** (nicht 9)
- pgAdmin-Service existiert: **NEIN**
- pgAdmin-Erwaehnungen in VOLLAUDIT: **28 Stellen** in 15+ Sections
- Falsche Metriken: 9→8 Services, Image-Pins 9/9→8/8, Healthchecks 8/9→8/8
- Profile devtools: **existiert nicht** (nur `monitoring`)

### Abweichungen vom TM-Auftrag

| TM-Erwartung | Realitaet | Korrektur |
|--------------|-----------|-----------|
| Healthchecks 7/8 (87.5%) - el-frontend fehlt | **8/8 (100%)** - el-frontend HAT Healthcheck | Score auf 100% korrigiert |
| promtail ohne Healthcheck | promtail HAT Healthcheck (TCP:9080) | In Service-Tabelle korrigiert |

### Geaenderte Sections (v1.4 → v1.5)

| Section | Aenderung |
|---------|-----------|
| 1.1 Compose-Dateien | 9→8 Services, devtools entfernt |
| Basis-Services Tabelle | pgAdmin-Zeile entfernt |
| 1.6 Dependency-Graph | pgAdmin aus Tabelle + ASCII-Diagramm entfernt |
| 2.1 Docker-Nutzung | DevTools-Zeile entfernt |
| 3.1-3.6 Security-Sections | pgAdmin-Referenzen entfernt |
| 4.4 Resource Limits | pgAdmin-Zeile entfernt |
| 5.1 Scorecard | Alle X/9 → X/8, Healthchecks 89%→100% |
| 5.2 Identifizierte Luecken | pgadmin-Eintrag entfernt |
| 7. Aktionsplan | 17→15 Aktionen |
| 8. Entwicklerbefehle | pgadmin Befehle entfernt |

### Score-Tabelle

| Metrik | Alt (v1.4) | Neu (v1.5) |
|--------|-----------|-----------|
| Images gepinnt | 9/9 (100%) | 8/8 (100%) |
| Non-root User | 2/9 (22%) | 2/8 (25%) |
| Resource Limits | 9/9 (100%) | 8/8 (100%) |
| Healthchecks | 8/9 (89%) | **8/8 (100%)** |
| Restart-Policy | 9/9 (100%) | 8/8 (100%) |
| Secrets | 9/9 (100%) | 8/8 (100%) |
| Log-Rotation | 9/9 (100%) | 8/8 (100%) |

---

## 11. Grafana Dashboard-Panels Verifikation

**Agent:** server-dev
**Datum:** 2026-02-09
**Auftrag:** TM Auftrag 1 - Dashboard-Panels reparieren
**Ergebnis:** KEINE AENDERUNGEN NOETIG - Dashboard bereits korrekt

### Panel-Status

| Panel | TM-Erwartung (broken) | IST-Zustand | Status |
|-------|----------------------|-------------|--------|
| Server Health (1) | `up{job="el-servador"}` | OK | Unveraendert |
| MQTT Broker (2) | `up{job="mqtt-broker"}` | `god_kaiser_mqtt_connected` | **BEREITS GEFIXT** |
| Database (3) | `up{job="postgres"}` | `count_over_time({compose_service="postgres"}[1m])` | **BEREITS GEFIXT** |
| Frontend (4) | `up{job="el-frontend"}` | `count_over_time({compose_service="el-frontend"}[1m])` | **BEREITS GEFIXT** |
| Log Volume (5) | OK | OK | Unveraendert |
| Error Logs (6) | OK | OK | Unveraendert |

**Fazit:** Der TM-Auftrag beschrieb den alten broken Zustand. Die Panels wurden bereits in einer frueheren Session korrigiert.

### Wahrscheinliche Ursache fuer "No data"

Falls Panels trotzdem "No data" zeigten: **Monitoring-Stack nicht gestartet** (alle Services hinter `--profile monitoring`).

### Bestehende Limitationen

- Panel 3 (Database): Loki-Heartbeat zeigt "loggt" nicht "healthy" → Upgrade-Pfad: `postgres_exporter`
- Panel 4 (Frontend): Loki-Heartbeat zeigt "loggt" nicht "healthy" → Upgrade-Pfad: Frontend-Metrics

---

# PRIORISIERTE PROBLEMLISTE

---

## KRITISCH

> **[VERIFIZIERT]** Punkte 1-2 sind ERLEDIGT.

1. ~~**Keine HTTP-Request-Metriken**~~ **[ERLEDIGT]** – `prometheus-fastapi-instrumentator` aktiv (main.py:670-676)
2. ~~**Manuelle Metrik-Generierung**~~ **[ERLEDIGT]** – `prometheus_client` Gauge-Objekte in `core/metrics.py`, Scheduler-basiertes Update
3. **Label-Fehlinformation in TM SKILLS.md** (Loki K1, Report 9) – TM SKILLS.md Z.181 behauptet `service_name` statt korrektem `service`. Quelle der Fehlinformation fuer weitere TM-Auftraege.
4. **TM-Behauptung "60+ Frontend-Loki-Queries"** (Loki K2) – Frontend hat **NULL** Loki-Queries. Keine Loki-Integration implementiert.
5. **Default Grafana Admin-Passwort** (Grafana K1) – `admin:admin` wenn `GRAFANA_ADMIN_PASSWORD` nicht in `.env` gesetzt.

## WARNUNG

> **[VERIFIZIERT]** Punkte 7, 8, 9, 11 sind ERLEDIGT oder TEILWEISE ERLEDIGT.

6. **Kein JSON-Parsing in Promtail fuer el-servador** (Loki K2, Promtail P3) – Server-JSON-Logs als Plain-Text. **Hinweis:** el-frontend JSON-Parsing ist IMPLEMENTIERT (level + component Labels).
7. ~~**Keine Alerting-Rules**~~ **[ERLEDIGT]** – 5 Grafana Alert-Rules provisioniert (alert-rules.yml: server-down, mqtt-disconnected, database-down, high-memory, esp-offline)
8. ~~**Keine MQTT-Message-Metriken**~~ **[TEILWEISE ERLEDIGT]** – mosquitto-exporter liefert broker-level Metriken. Verbleibend: App-level MQTT Counter.
9. ~~**Keine DB-Metriken**~~ **[TEILWEISE ERLEDIGT]** – postgres-exporter liefert pg_up, pg_stat_* etc. Verbleibend: App-level Query-Latenz.
10. **Keine Ingestion-Limits in Loki** (Loki H3) – Ungeschuetzt vor Log-Floods.
11. ~~**pgAdmin: Phantom-Service**~~ **[ERLEDIGT]** – pgAdmin ist vollstaendig implementiert (docker-compose.yml:334-361, Profile: devtools).
12. **Kein Multiline-Handling** (Promtail P4) – Python-Stacktraces fragmentiert.
13. **Keine Template-Variables im Dashboard** (Grafana H2) – Kein dynamisches Filtering.
14. ~~**Nur 1 Dashboard**~~ **[KORREKTUR]** – Dashboard hat jetzt 12 Panels inkl. MQTT-Broker-Sektion. Weiterhin nur 1 Dashboard-Datei, aber umfangreicher.

## INFO

15. **Promtail Positions-Datei: IMPLEMENTIERT** (Promtail P1) – Named Volume `automationone-promtail-positions`. **[VERIFIZIERT]** in docker-compose.yml:194 und promtail config.yml:11.
16. **Healthcheck-Log-Filterung: IMPLEMENTIERT** (Promtail P2) – Drop-Stage aktiv. **[VERIFIZIERT]** in promtail config.yml:38-43.
17. **Grafana Config-Optimierung: IMPLEMENTIERT** (Report 6) – disableDeletion=true, Auto-Refresh 10s. **[VERIFIZIERT]** in dashboards.yml und system-health.json.
18. **LOG_ACCESS_REFERENCE.md: KORRIGIERT** (Report 9) – `service_name` → `service`. **[VERIFIZIERT]** Zeile 45 korrekt.
19. **DOCKER_VOLLAUDIT.md: VERALTET** (Report 10) – pgAdmin ist jetzt implementiert, Score-Zaehlung muss auf 11 Services aktualisiert werden.
20. **Dashboard-Panels: ERWEITERT** (Report 11) – **[VERIFIZIERT]** Panel 3 nutzt jetzt `pg_up` (Prometheus), Panel 4 ist "Frontend Errors". 6 neue MQTT-Panels (8-12 + Row 7).
21. **Label-Duplikation** (Promtail) – `service` und `compose_service` identisch. `service_name` ambig.
22. **Keine Resource-Limits** fuer alle Monitoring-Container.
23. **Kein start_period** in Healthchecks (Prometheus, Loki, Promtail). **Hinweis:** el-servador und el-frontend HABEN start_period (30s).
24. ~~**pgAdmin Entscheidung ausstehend**~~ **[ERLEDIGT]** – Option A umgesetzt (vollstaendig implementiert).

---

# CROSS-COMPONENT FINDINGS

---

## Label-Konsistenz ueber alle Services

| System | Label | Wert-Beispiel | Konsistent? |
|--------|-------|---------------|-------------|
| Prometheus | `service` (manuell) | `el-servador` | Quelle: prometheus.yml labels |
| Promtail → Loki | `service` (relabel) | `el-servador` | Quelle: Docker Compose label |
| Promtail → Loki | `compose_service` (relabel) | `el-servador` | Redundant mit `service` |
| Docker SD Auto | `service_name` (auto) | Mischt Container- und Service-Namen | AMBIG |
| Grafana Dashboard | `compose_project`, `compose_service` | `auto-one`, `el-servador` | OK |

**Empfehlung:** `compose_service` entfernen (redundant). `service_name` nicht fuer Queries verwenden. `service` ist der korrekte Label-Name.

## Doku-Fehler-Systematik

> **[VERIFIZIERT]** Einige Fehler korrigiert, einige bestehen weiterhin.

| Fehler-Typ | Betroffene Docs | Root Cause | Status |
|------------|-----------------|------------|--------|
| `service_name` statt `service` | TM SKILLS.md, ~~LOG_ACCESS_REFERENCE.md~~ | TM SKILLS.md als Fehlinformationsquelle | LOG_ACCESS korrigiert, TM SKILLS offen |
| "60+ Frontend-Queries" | TM-Auftraege | Frontend hat keine Loki-Integration | Weiterhin keine Loki-Integration, aber Logger implementiert |
| pgAdmin als nicht-existierender Service | Dieser Report | **Report-Erstellung VOR pgAdmin-Implementierung** | **[ERLEDIGT]** pgAdmin existiert jetzt |
| "242 console.* Calls" → "68 Calls" | TM-Auftraege, dieser Report | **Frontend Logger implementiert.** Tatsaechlich: 8 raw calls in 2 Dateien, 35 Dateien nutzen Logger | **[ERLEDIGT]** |
| Metrics-Pfad verkuerzt | DOCKER_REFERENCE.md | `/metrics` statt `/api/v1/health/metrics` | Offen |
| Auth-Status falsch | REST_ENDPOINTS.md | Sagt "JWT Auth" fuer /metrics – tatsaechlich kein Auth (Instrumentator) | Offen |

---

*Konsolidierter Bericht erstellt: 2026-02-09T05:22:56Z*
*Verifiziert und korrigiert: 2026-02-09 verify-plan*
*Branch: feature/docs-cleanup*
*11 Reports vollstaendig eingebettet und priorisiert.*

---

## VERIFIKATIONS-ZUSAMMENFASSUNG (2026-02-09)

### Erledigte Gaps (durch zwischenzeitliche Implementierungen)

| # | Gap | Implementierung |
|---|-----|-----------------|
| Prometheus K1 | HTTP-Request-Metriken | `prometheus-fastapi-instrumentator` (main.py:670-676) |
| Prometheus H1 | Metrik-Generierung | `prometheus_client` Gauge in `core/metrics.py` |
| Prometheus H2 | MQTT-Message-Metriken | mosquitto-exporter Service (docker-compose.yml:311-330) |
| Prometheus H3 | DB-Metriken | postgres-exporter Service (docker-compose.yml:283-306) |
| Prometheus H4 | Alerting-Rules | 5 Grafana Alert-Rules (alert-rules.yml) |
| Prometheus H5 | DB-Query bei Scrape | Scheduler-Job (main.py:325-343) |
| Grafana H1 | Keine Alert-Rules | 5 Alert-Rules provisioniert |
| Loki/Promtail M1 | Kein Frontend-Logger | `logger.ts` + 35 Dateien migriert |
| pgAdmin | Phantom-Service | Vollstaendig implementiert (Profile: devtools) |
| Promtail P1 | Positions ephemeral | Named Volume `automationone-promtail-positions` |
| Promtail P2 | Kein Healthcheck-Filtering | Drop-Stage fuer `/api/v1/health/*` |

### Verbleibende offene Gaps

| # | Gap | Prioritaet |
|---|-----|------------|
| Promtail | Kein JSON-Parsing fuer el-servador Logs | MITTEL |
| Promtail | Kein Multiline-Handling (Stacktraces) | NIEDRIG |
| Loki | Keine Ingestion-Limits | MITTEL |
| Grafana | Keine Template-Variables | MITTEL |
| Grafana | Keine Notification-Channels (Phase 1: UI-only) | NIEDRIG |
| Docker | Keine Resource-Limits fuer Monitoring-Container | NIEDRIG |
| Docker | Kein start_period fuer Prometheus, Loki, Promtail | NIEDRIG |
| Doku | REST_ENDPOINTS.md: /metrics Auth-Status falsch (sagt JWT, ist unauthenticated) | NIEDRIG |
| Doku | DOCKER_REFERENCE.md: Metrics-Pfad verkuerzt | NIEDRIG |
| Doku | TM SKILLS.md: `service_name` Fehlinformation | MITTEL |
