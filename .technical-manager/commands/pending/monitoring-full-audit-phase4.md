# Auftrag: Monitoring Stack – Full Audit Phase 4
Datum: 2026-02-11 22:30

**Typ:** Eigenständiges Analysedokument – KEIN Agent-Auftrag
**Scope:** Kompletter Monitoring Stack von ESP32 bis Grafana
**Ziel-Agents:** ki-audit (Dashboard UX) + system-control (Datenfluss) + esp32-debug (ESP32-Pfad) + server-debug (Logging) + db-inspector (DB-Monitoring) + test-log-analyst (Test-Coverage)
**Output:** `.technical-manager/inbox/agent-reports/monitoring-full-audit-2026-02-11.md` + `.claude/reports/current/` (Dual-Output fuer /collect-reports)

---

## 1. AUFTRAGSZIEL

Vollständiges Audit des gesamten Monitoring Stacks mit drei Schwerpunkten:

1. **Grafana Dashboard UX-Audit** – Menschenverständlichkeit, Informationsdichte, Layout-Effizienz
2. **Datenfluss-Mapping** – Jeder Datenstrom von Quelle bis Visualisierung, lückenlos
3. **Logging-Strategie-Audit** – Vollständigkeit, Dokumentation, Cross-Layer-Konsistenz
4. **Database Monitoring Audit** – postgres-exporter Metriken-Abdeckung, Log-Cleanup *(NEU: db-inspector)*
5. **Monitoring Test Coverage** – Health-Tests, Gauge-Tests, Dashboard-Validierung, CI *(NEU: test-log-analyst)*

---

## 2. KONTEXT

### 2.1 Monitoring Stack Architektur (IST)

```
ESP32 (El Trabajante)
  ├─ MQTT → El Servador → god_kaiser_* Metriken → Prometheus ─→ Grafana (Metrics)
  └─ Serial (TCP) → esp32-serial-logger → Docker stdout → Promtail → Loki ─→ Grafana (Logs)

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
```

### 2.2 Grafana Dashboard "AutomationOne - Operations"

**Datei:** `docker/grafana/provisioning/dashboards/system-health.json`
**26 Panels, 5 Rows, 2 Template-Variablen ($service, $interval)**

| Row | Panels | Visualisierungstypen |
|-----|--------|---------------------|
| Top (y=0) | Server UP/DOWN, MQTT, Database, Frontend Errors (5m), ESP Online, Active Alerts | 6x Stat |
| Server Performance (y=4) | CPU Gauge, Memory Gauge, Uptime, CPU&Memory Over Time | 2x Gauge, 1x Stat, 1x Timeseries |
| ESP32 Fleet (y=13) | Total, Online, Offline, Online Rate Over Time | 3x Stat, 1x Timeseries |
| MQTT Traffic (y=22) | Connected Clients, Msg/s In, Msg/s Out, Messages Dropped, MQTT Message Rate | 4x Stat, 1x Timeseries |
| Database (collapsed, y=35) | Active Connections, DB Size, Deadlocks, Connections Over Time | 3x Stat, 1x Timeseries |
| Logs & Errors (collapsed, y=36) | Error Rate by Service, Log Volume by Service, Recent Error Logs | 2x Timeseries, 1x Logs |

**Datasources:** Prometheus (uid: prometheus), Loki (uid: loki)
**Template Vars:** $service (Loki compose_service label, includeAll), $interval (1m/5m/15m/30m/1h)
**Refresh:** 10s, Default Range: last 1h

### 2.3 Prometheus Scrape-Targets

| Job | Target | Metrics Path | Interval |
|-----|--------|-------------|----------|
| el-servador | el-servador:8000 | /api/v1/health/metrics | 15s |
| postgres | postgres-exporter:9187 | /metrics | 15s |
| mqtt-broker | mosquitto-exporter:9234 | /metrics | 15s |
| prometheus | localhost:9090 | /metrics | 15s |

> **[VERIFY-PLAN GAP]** Loki (:3100/metrics) und Promtail (:9080/metrics) werden NICHT gescraped.
> Loki/Promtail-Metriken (Ingestion Rate, Label Cardinality, Pipeline Errors) sind unsichtbar.

### 2.3a Custom Metrics (src/core/metrics.py)

**7 God-Kaiser Gauges (aktualisiert alle 15s via Scheduler):**

| Metric | Typ | Quelle | Dashboard-Panel |
|--------|-----|--------|-----------------|
| `god_kaiser_uptime_seconds` | Gauge | `time.time() - start` | Server Performance: Uptime (ID 9) |
| `god_kaiser_cpu_percent` | Gauge | `psutil.cpu_percent()` | Server Performance: CPU (ID 7) |
| `god_kaiser_memory_percent` | Gauge | `psutil.virtual_memory().percent` | Server Performance: Memory (ID 8) |
| `god_kaiser_mqtt_connected` | Gauge | `MQTTClient.is_connected()` | Top Row: MQTT (ID 2) |
| `god_kaiser_esp_total` | Gauge | DB: `ESPRepository.get_all()` | ESP32 Fleet: Total (ID 11) |
| `god_kaiser_esp_online` | Gauge | DB: status=="online" count | ESP32 Fleet: Online (ID 12) |
| `god_kaiser_esp_offline` | Gauge | DB: status=="offline" count | ESP32 Fleet: Offline (ID 13) |

**Plus HTTP Auto-Metrics** (prometheus-fastapi-instrumentator):
- `http_request_duration_seconds_*` – Request Latency Histogram
- `http_requests_total` – Request Count
- `http_request_size_bytes_*` / `http_response_size_bytes_*`

> **[VERIFY-PLAN GAP]** HTTP-Latency-Metriken werden exportiert, aber KEIN Dashboard-Panel dafuer. RED-Methode (Rate/Errors/Duration) ist unvollstaendig.

### 2.4 Promtail Pipeline

| Service | Parser | Extrahierte Labels | Drops |
|---------|--------|--------------------|-------|
| el-servador | regex (multiline) | level, logger | Health-Endpoints (/health/*) |
| el-frontend | JSON | level, component | keine |
| esp32-serial-logger | JSON | level, device, component | keine |
| alle anderen | nur Docker SD | compose_service, container, stream | keine |

### 2.5 Alerting (5 Rules)

| Rule | Severity | Condition | For |
|------|----------|-----------|-----|
| Server Down | critical | up{job="el-servador"} < 1 | 1m |
| MQTT Disconnected | critical | god_kaiser_mqtt_connected < 1 | 1m |
| Database Down | critical | pg_up < 1 | 1m |
| High Memory | warning | god_kaiser_memory_percent > 85 | 5m |
| ESP Offline | warning | >50% offline AND esp_online > 0 | 3m |

### 2.6 Logging-Dokumentation (IST)

Existiert: `docker/README-logging.md` – Beschreibt Primary Log Path, Bind-Mounts, Cleanup.

### 2.7 Referenz-Material (Best Practices aus Recherche)

Die folgenden Erkenntnisse stammen aus gezielter Recherche (Grafana Official Docs, MetricFire, WebbyLab, Logz.io) und dienen als Bewertungsmaßstab:

**Grafana Dashboard Design:**
- **Z-Pattern Layout:** Wichtigste Metriken oben-links → unten-rechts (natürliche Leserichtung). Reduziert kognitive Last um ~40%
- **USE-Methode** für Hardware (CPU, Memory, Network): Utilization, Saturation, Errors
- **RED-Methode** für Services: Rate, Errors, Duration – Proxy für User Experience
- **Four Golden Signals** (Google SRE): Latency, Traffic, Errors, Saturation
- **Panel-Hierarchie:** Stat-Panels für Status-Überblick → Gauges für Momentwerte → Timeseries für Trends → Logs für Details
- **Template Variables:** Verhindern Dashboard-Sprawl, dynamische Filterung statt separate Dashboards
- **Farbkonsistenz:** High-Contrast-Paare (z.B. dunkelblau + orange), barrierefreie Paletten
- **Spacing:** 20px Margins zwischen Rows, 10px Gaps zwischen Panels
- **Panel-Beschreibungen:** Tooltips und Descriptions für Kontext ("Was bedeutet dieser Wert?")
- **Keine Stacked-Graphs** (können irreführend sein, wichtige Daten verstecken)
- **Dashboard-Ziel definieren:** Jedes Dashboard beantwortet EINE Frage oder erzählt EINE Geschichte

**IoT-spezifisch:**
- **MQTT-Monitoring essentiell:** Connected clients, Message load, Active subscribers – wenn MQTT ausfällt, ist die gesamte IoT-Infrastruktur blind
- **Time-Series DB** (InfluxDB) ideal für Sensordaten-Historisierung (wir nutzen aktuell Prometheus – bewusste Entscheidung, InfluxDB steht auf der Roadmap)
- **Edge-Monitoring:** Sensor-Metriken direkt auf dem Dashboard (Temperatur, Humidity etc.) – nicht nur Infrastruktur
- **Device-Health vs. Infrastructure-Health** als separate Concerns

**Logging Best Practices:**
- **Promtail pipeline stages** für strukturierte Label-Extraktion (haben wir ✅)
- **Label-Cardinality kontrollieren:** Container-Name = OK, Request-ID als Label = NICHT OK (haben wir richtig ✅)
- **Promtail ist EOL** (End-of-Life März 2026) → Grafana empfiehlt Migration zu **Grafana Alloy**
- **Structured Logging** auf allen Layern für konsistente Querying

---

## 3. AUFGABE

### Teil A: Grafana Dashboard UX-Audit (ki-audit)

Analysiere das Dashboard `system-health.json` anhand folgender Kriterien:

**A1. Layout & Informationshierarchie**
- Folgt das Layout dem Z-Pattern? Sind die wichtigsten Infos oben-links?
- Ist die Row-Reihenfolge logisch (General → Specific)?
- Gibt es verschwendeten Platz (leere Bereiche, zu große Panels für einfache Werte)?
- Gibt es zu dichte Bereiche (Panels die sich gegenseitig visuell erschlagen)?
- Sind die collapsed Rows (Database, Logs) richtig priorisiert oder sollten sie anders angeordnet sein?

**A2. Panel-Auswahl & Visualisierungstypen**
- Ist für jeden Datenpunkt der richtige Visualisierungstyp gewählt? (Stat für aktuelle Werte, Gauge für Prozent, Timeseries für Trends)
- Fehlen wichtige Visualisierungstypen? (z.B. Bar Chart für Vergleiche, Heatmap für Patterns)
- Sind die Stat-Panels im Top-Row zu gleichförmig? Könnte man dort Informationsdichte erhöhen?
- Gibt es Panels die besser als Tabelle dargestellt wären?

**A3. Inhaltliche Vollständigkeit**
- Welche wichtigen Metriken FEHLEN komplett? (z.B. Request Latency, Error Rate by endpoint, Disk Usage)
- Gibt es Prometheus-Metriken die el-servador exponiert aber NICHT im Dashboard sind?
- Fehlen Loki-basierte Panels für spezifische Service-Logs?
- Sind die ESP32-Metriken ausreichend? (Nur Online/Offline/Total – fehlt z.B. Last-Seen, Response Time, Sensor-Daten?)
- Fehlt ein "System Overview" Text-Panel mit Dashboard-Beschreibung?

**A4. Lesbarkeit & Menschenverständlichkeit**
- Sind Panel-Titel aussagekräftig genug? ("CPU" vs "Server CPU Usage")
- Haben Panels Descriptions (Tooltip-Text) die erklären was der Wert bedeutet?
- Sind die Value-Mappings verständlich? (UP/DOWN ist gut – aber gibt es Werte ohne Mapping?)
- Sind die Thresholds sinnvoll? (grün/gelb/rot bei welchen Werten?)
- Sind Units überall korrekt gesetzt? (%, seconds, short)
- Ist die Legend in Timeseries-Panels hilfreich? (calcs: mean, max, sum – wo sinnvoll?)

**A5. Template-Variable-Nutzung**
- Wird $service konsistent in allen Loki-Panels genutzt?
- Wird $interval konsistent genutzt oder gibt es hard-coded Zeitfenster?
- Fehlen nützliche Template-Variablen? (z.B. $datasource, $esp_device für Device-Level-Filtering)

**A6. Konkrete Verbesserungsvorschläge**
Für jedes Finding: Konkreter Vorschlag mit Panel-ID, was ändern, warum.
Priorisiert nach: Quick-Wins (Titel/Descriptions) → Medium (Panel-Typ-Änderung) → Größer (Neue Panels/Rows)

**A7. Operational Health Checks** *(NEU: system-control Perspektive)*
- Kein automatischer Check ob Loki tatsaechlich Logs empfaengt (silent failure moeglich)
- Kein Check ob Promtail alle erwarteten Services scraped
- Kein Check ob Dashboard-Panels "No Data" zeigen (Panels ohne Datenquelle = unsichtbar kaputt)
- Kein Check ob Exporters (postgres-exporter, mosquitto-exporter) Metriken liefern
- postgres-exporter + mosquitto-exporter haben **KEINE resource limits** (alle anderen Services: 128M-512M)
- Empfehlung: `make monitor-health` Target das Stack-Kohaerenz prueft (Targets up, Loki ingesting, Panels populated)

### Teil B: Datenfluss-Mapping (system-control)

Erstelle ein vollständiges Datenfluss-Diagramm das JEDEN Monitoring-Strom dokumentiert:

**B1. Metriken-Ströme (Prometheus)**
Für jede Prometheus-Metrik die im Dashboard genutzt wird:
- Wo wird sie erzeugt? (welcher Code, welcher Exporter)
- Wie heißt sie genau? (god_kaiser_*, pg_*, broker_*, up{})
- Welcher Scrape-Job sammelt sie?
- In welchem Dashboard-Panel wird sie visualisiert?
- Gibt es Metriken die erzeugt aber NICHT visualisiert werden?

**B2. Log-Ströme (Loki)**
Für jeden Log-produzierenden Service:
- Welches Log-Format wird verwendet? (structured text, JSON, plain)
- Welche Promtail-Pipeline-Stages verarbeiten ihn?
- Welche Labels werden extrahiert?
- Welche Loki-Queries nutzen diese Logs im Dashboard?
- Gibt es Log-Quellen die Promtail NICHT erfasst?

**B3. ESP32 → Monitoring Pfad (BESONDERER FOKUS)**
Trace den KOMPLETTEN Weg von ESP32 Sensordaten bis Grafana:
- ESP32 Firmware: Was wird wo geloggt? (Serial, MQTT payloads, Error-Codes)
- Wokwi Simulation: Gleicher Monitoring-Pfad wie Hardware? Unterschiede?
- serial_logger.py: Was parsed er, welches Format, welche Labels?
- MQTT → Server → Prometheus: Welche ESP-spezifischen Metriken exponiert der Server?
- Gibt es ESP32-Daten die NICHT im Monitoring landen? (z.B. Boot-Events, Watchdog-Resets, Heap-Usage)

**B4. Alerting-Vollständigkeit**
- Sind die 5 Alert-Rules ausreichend?
- Welche Szenarien sind NICHT abgedeckt? (z.B. Disk Full, Loki Down, Promtail Down, High Error Rate)
- Sind die Thresholds und For-Durations sinnvoll?

### Teil C: Logging-Strategie-Audit

**C1. Dokumentations-Vollständigkeit**
- Ist `docker/README-logging.md` aktuell und vollständig?
- Wissen alle Layers Bescheid? Gibt es Logging-Doku in:
  - El Servador? (z.B. logging.yaml, README)
  - El Frontend? (Logger-Utility, README)
  - El Trabajante? (ESP32 Logging-Doku, welche Log-Levels, welche Formate)
  - docker/ Configs? (Promtail, Loki, Grafana Provisioning)
- Gibt es ein EINZIGES Dokument das den gesamten Log-Pfad End-to-End beschreibt?
- Kennt ein neuer Entwickler sofort: "Wo finde ich Log X und wie query ich ihn?"

**C2. Logging-Konsistenz Cross-Layer**
- Nutzen ALLE Services strukturiertes Logging? (Server=structured text, Frontend=JSON, ESP32=JSON via logger – konsistent?)
- Sind die Log-Levels überall gleich definiert? (DEBUG/INFO/WARNING/ERROR/CRITICAL)
- Gibt es Services die KEIN strukturiertes Format nutzen? (Mosquitto, PostgreSQL?)
- Sind die extrahierten Loki-Labels konsistent? (level heißt überall level?)

**C3. Promtail EOL-Bewertung**
- Promtail erreicht End-of-Life im März 2026 (in 3 Wochen!)
- Bewertung: Wie kritisch ist das für uns?
- Gibt es Breaking Changes oder Sicherheitsrisiken?
- Empfehlung: Migration zu Grafana Alloy jetzt planen oder später?

**C4. Fehlende Logging-Bereiche**
- Werden Docker-Events (Container Start/Stop/Restart) geloggt und in Loki erfasst?
- Werden MQTT-Messages geloggt? (Nicht nur Broker-Logs, sondern Payload-Logging für Debug)
- Gibt es ein Audit-Log für kritische Aktionen? (Device-Provisioning, Config-Änderungen)
- Wie werden Wokwi-Simulationslogs vs. Hardware-Logs unterschieden?

### Teil D: Database Monitoring Audit *(NEU: db-inspector)*

**D1. postgres-exporter Metriken-Abdeckung**
- Welche postgres-exporter Metriken werden exportiert aber NICHT im Dashboard visualisiert?
- Dashboard hat nur: Active Connections, DB Size, Deadlocks, Connections Over Time
- FEHLEND im Dashboard (postgres-exporter liefert):
  - Cache Hit Ratio (`pg_stat_database_blks_hit / (blks_hit + blks_read)`) – **TM-Plan nahm an es existiert, tut es NICHT**
  - Table Sizes (Top-N Tabellen nach Groesse)
  - Connection Pool Utilization (used vs. max_connections)
  - Transaction Rate (commits/rollbacks per second)
  - Slow Query Count (queries > 100ms, konfiguriert in postgresql.conf)

**D2. PostgreSQL Log-Cleanup**
- `logs/postgres/postgresql-*.log` waechst unbegrenzt (daily rotation, KEINE Auto-Deletion)
- `docker/README-logging.md` zeigt nur manuelles Cleanup: `find logs/postgres/ -mtime +3 -delete`
- Empfehlung: Automatisierung via `log_rotation_age`/`log_truncate_on_rotation` oder Docker-Entrypoint-Script

**D3. Database Health im Alerting**
- Nur `pg_up < 1` (Database Down) als Alert
- FEHLEND: High Connection Count, Deadlock-Rate, Cache Miss Rate, Low Disk Space

### Teil E: Monitoring Test Coverage *(NEU: test-log-analyst)*

**E1. Existierende Test-Coverage**
- `test_api_health.py`: 5 Testklassen (Basic, Detailed, ESP, Prometheus, K8s Probes) – 162 Zeilen
- Health-Endpoints gut abgedeckt: `/`, `/detailed`, `/esp`, `/metrics`, `/live`, `/ready`
- Integration-Tests laufen gegen SQLite + lokalen MQTT (KEIN Prometheus/Grafana/Loki)

**E2. Fehlende Tests**
- KEINE Tests fuer `metrics.py` Gauge-Updates (`update_system_metrics`, `update_esp_metrics`)
- KEINE Tests fuer Grafana Dashboard JSON-Validierung (Panel-Queries gegen echte Metriken pruefen)
- KEINE Tests fuer Promtail-Pipeline-Labels (Regex-Pattern korrekt?)
- KEINE Tests fuer Alert-Rules (PromQL-Queries syntaktisch korrekt?)
- Kein pytest-Marker `@pytest.mark.monitoring` definiert (21 Marker existieren, keiner fuer Monitoring)

**E3. CI-Gap**
- `server-tests.yml` nutzt nur `mosquitto:2` als Service – kein Prometheus/Grafana/Loki
- KEINE Monitoring-Services in GitHub Actions (bewusste Entscheidung oder Luecke?)
- Empfehlung: Mindestens `test_prometheus_metrics.py` (Unit, ohne Docker) + `test_dashboard_json.py` (JSON-Schema-Validierung)

---

## 4. SUCCESS CRITERION

### Minimum-Output:
1. **Dashboard UX-Bericht** mit konkreten Findings (Panel-ID, Problem, Loesung) in 3 Prioritaetsstufen *(ki-audit)*
2. **Datenfluss-Diagramm** als ASCII/Markdown das JEDEN Strom zeigt (Source → Transport → Storage → Visualization) *(system-control)*
3. **Logging-Audit-Ergebnis** mit GAP-Liste (was fehlt, was inkonsistent ist) *(server-debug)*
4. **Promtail EOL-Bewertung** mit Empfehlung *(server-debug)*
5. **DB-Monitoring GAP-Liste** mit fehlenden postgres-exporter Metriken und Log-Cleanup-Status *(db-inspector)*
6. **Test-Coverage Report** mit existierenden Tests, fehlenden Tests, CI-Gaps *(test-log-analyst)*

### Stretch-Output:
7. **Verbesserte system-health.json** (oder Diff-Vorschlag) mit Quick-Win-Verbesserungen
8. **Draft fuer erweiterte README-logging.md** die den gesamten Stack E2E dokumentiert
9. **Vorschlag fuer fehlende Alert-Rules** (Loki Down, Promtail Down, High Error Rate, DB Connection Saturation)
10. **test_prometheus_metrics.py** Draft (Gauge-Validierung ohne Docker)

---

## 5. AUFTRAGS-ROUTING

Dieser Auftrag ist GROSS. Empfohlene Aufteilung in 6 Phasen:

> **[VERIFY-PLAN KORREKTUR]** Urspruenglich system-control + meta-analyst. system-control ist Ops-Agent (start/stop/status), NICHT UX-Auditor. meta-analyst korreliert Reports, mappt keine Datenfluesse. Routing korrigiert:

| Phase | Aufgabe | Agent | Output |
|-------|---------|-------|--------|
| 4a | Dashboard UX-Audit (Teil A komplett) | **ki-audit** | `.claude/reports/current/MONITORING_DASHBOARD_UX.md` |
| 4b | Datenfluss-Mapping (Teil B1-B2, B4) | **system-control** (Ops-Modus) | `.claude/reports/current/MONITORING_DATAFLOW.md` |
| 4c | ESP32→Monitoring Pfad (Teil B3) | **esp32-debug** | `.claude/reports/current/MONITORING_ESP32_PATH.md` |
| 4d | Logging-Audit (Teil C) | **server-debug** | `.claude/reports/current/MONITORING_LOGGING_AUDIT.md` |
| 4e | DB-Monitoring (Teil D) | **db-inspector** | `.claude/reports/current/MONITORING_DB_AUDIT.md` |
| 4f | Test-Coverage (Teil E) | **test-log-analyst** | `.claude/reports/current/MONITORING_TEST_COVERAGE.md` |

**Reihenfolge:** 4a+4b koennen parallel. 4c-4f danach oder parallel.
**Konsolidierung:** `/collect-reports` → `CONSOLIDATED_MONITORING_AUDIT.md` → zum TM.

Robin entscheidet ob Phasen gleichzeitig oder nacheinander laufen.

### 5.1 Priorisierte Verbesserungen (Quick-Reference fuer Dev-Agents)

**Quick-Wins (< 2h, hoher Impact):**

| # | Was | Agent | Datei |
|---|-----|-------|-------|
| QW1 | Resource Limits fuer postgres-exporter + mosquitto-exporter (128M/64M) | server-dev | `docker-compose.yml` |
| QW2 | Prometheus: Scrape-Jobs fuer Loki + Promtail hinzufuegen | server-dev | `docker/prometheus/prometheus.yml` |
| QW3 | Dashboard: Panel-Descriptions/Tooltips hinzufuegen (alle 26 Panels) | ki-audit → server-dev | `system-health.json` |
| QW4 | Dashboard: HTTP Request Latency Panel (Instrumentator-Metrik bereits vorhanden) | ki-audit → server-dev | `system-health.json` |
| QW5 | Dashboard: Cache Hit Ratio Panel (fehlt trotz Annahme im Plan) | ki-audit → server-dev | `system-health.json` |

**Medium (1-2 Tage):**

| # | Was | Agent | Datei |
|---|-----|-------|-------|
| M1 | Alerting: +3 Rules (Loki Down, Promtail Down, High Error Rate) | server-dev | `alert-rules.yml` |
| M2 | PostgreSQL Log-Cleanup automatisieren | db-inspector → server-dev | `docker-compose.yml` |
| M3 | Tests: `test_prometheus_metrics.py` (Gauge-Validierung) | test-log-analyst → server-dev | `tests/integration/` |
| M4 | Dashboard: Database Row erweitern (Query Latency, Table Sizes) | ki-audit → server-dev | `system-health.json` |
| M5 | Makefile: `make monitor-health` Target | system-control → server-dev | `Makefile` |

**Large (1 Woche+):**

| # | Was | Agent | Datei |
|---|-----|-------|-------|
| L1 | ESP32-spezifisches Grafana Dashboard | esp32-debug + ki-audit | Neues Dashboard JSON |
| L2 | Promtail → Grafana Alloy Migration (nach EOL-Bestaetigung) | system-control | `docker/`, `docker-compose.yml` |
| L3 | Monitoring in CI (GitHub Actions + monitoring profile) | test-log-analyst | `.github/workflows/` |

---

## 6. REPORT ZURÜCK AN

> **[VERIFY-PLAN KORREKTUR]** Dual-Output: Agents schreiben nach `.claude/reports/current/` (fuer /collect-reports), Konsolidierung geht zum TM.

**ki-audit →** `.claude/reports/current/MONITORING_DASHBOARD_UX.md`
**system-control →** `.claude/reports/current/MONITORING_DATAFLOW.md`
**esp32-debug →** `.claude/reports/current/MONITORING_ESP32_PATH.md`
**server-debug →** `.claude/reports/current/MONITORING_LOGGING_AUDIT.md`
**db-inspector →** `.claude/reports/current/MONITORING_DB_AUDIT.md`
**test-log-analyst →** `.claude/reports/current/MONITORING_TEST_COVERAGE.md`

Konsolidierung via `/collect-reports`:
`.technical-manager/inbox/agent-reports/monitoring-full-audit-2026-02-11.md`
