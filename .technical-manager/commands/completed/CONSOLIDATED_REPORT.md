# Konsolidierter Report - Ausgeführte TM-Pläne & Analysen

**Erstellt:** 2026-02-10T16:00:00+01:00
**Branch:** feature/docs-cleanup
**Quellordner:** .technical-manager/commands/completed/
**Anzahl Reports:** 16

---

## Einbezogene Reports

| # | Report | Gruppe | Typ | Thema |
|---|--------|--------|-----|-------|
| 1 | infra-part1-docker-compose-hardening.md | Infra | /do-Auftrag | Docker Compose auf industriellen Standard |
| 2 | infra-part2-service-configs.md | Infra | /do-Auftrag | PostgreSQL Log-Rotation + Mosquitto stdout-only |
| 3 | infra-part3-promtail-pipeline.md | Infra | /do-Auftrag | Promtail Pipeline: Structured Log-Processing |
| 4 | infra-part4-cleanup-hygiene.md | Infra | /do-Auftrag | Alert Rule 5, Log-Strategie, pgAdmin, Volumes |
| 5 | infra-part5-grafana-redesign.md | Infra | Analyse+Verify | Grafana Dashboard Redesign Spezifikation |
| 6 | infra-part5-document-review.md | Infra | /do-Auftrag | Korrektur der Grafana-Spezifikation |
| 7 | infra-postfix-review-corrections.md | Infra | /do-Auftrag | 4 Post-Hardening Fixes |
| 8 | 3-1_mosquitto-exporter.md | MQTT | Erstanalyse | Mosquitto Exporter Evaluation |
| 9 | 3-1_mosquitto-exporter-plan.md | MQTT | Impl-Plan | Mosquitto Exporter Integration |
| 10 | 3-2_grafana-alerting.md | Alerting | Erstanalyse | Grafana Built-in Alerting Konzept |
| 11 | 3-2_grafana-alerting-plan.md | Alerting | Impl-Plan | Verify-First Alert Rules Deployment |
| 12 | 4-1_pgadmin-devtools.md | DevTools | Erstanalyse | pgAdmin als devtools-Profil |
| 13 | 4-1_pgadmin-plan.md | DevTools | Impl-Plan | pgAdmin Integration verifiziert |
| 14 | 4-2_frontend-logging.md | Frontend | Erstanalyse | Frontend Logging Assessment |
| 15 | 4-2_frontend-logging-plan.md | Frontend | Impl-Plan | Zentraler Logger + Migration |
| 16 | server-dev-grafana-panels.md | Dashboard | /do-Auftrag | 3 broken Dashboard-Panels reparieren |

---

## Gruppen-Zusammenhaenge

```
Gruppe A: Infrastructure Hardening (Part 1->2->3->4->5->Postfix) - SEQUENZIELL
  Part 1 schafft Basis (logging, healthchecks) -> Part 2 nutzt die Basis (service-configs)
  Part 3 baut auf Part 1+2 auf (Promtail Pipeline braucht Docker json-file logs)
  Part 4 raeumt nach Part 1-3 auf (Altlasten, Alert-Fixes)
  Part 5 = Grafana Dashboard Redesign Spezifikation (braucht Part 1-4 als Basis)
  Postfix = Korrekturen an Part 1+4 (Volume-Naming, Alert Rule 5, Promtail, Bind-Mount)

Gruppe B: Feature-Paare (Analyse -> Plan) - JEWEILS UNABHAENGIG
  3-1: Mosquitto Exporter (Analyse -> Plan)
  3-2: Grafana Alerting (Analyse -> Plan)
  4-1: pgAdmin DevTools (Analyse -> Plan)
  4-2: Frontend Logging (Assessment -> Plan)

Gruppe C: Dashboard Fix (standalone, zeitlich VOR Part 5)
  server-dev-grafana-panels = erste Reparatur der broken Panels
  Part 5 = komplettes Dashboard Redesign (ersetzt die Panel-Fixes)
```

---

## 1. Infrastructure Hardening - Essenz

### Part 1: Docker Compose Hardening

**Ziel:** Jeder der 11 Services bekommt ALLE Pflichtfelder.

**8 Aenderungen an `docker-compose.yml`:**

| # | Was | Betroffene Services | Code-Stelle |
|---|-----|---------------------|-------------|
| 1 | `logging:` Block (json-file, 10m, 3 files) | postgres, mqtt-broker | Service-Definitionen |
| 2 | Healthcheck fuer mosquitto-exporter | mosquitto-exporter | `wget --spider http://localhost:9234/metrics` |
| 3 | `start_period` bei allen Healthchecks | 9 Services (alle ausser el-servador, el-frontend) | Werte: 10s-20s je nach Service |
| 4 | `depends_on` mit `condition: service_healthy` | el-frontend -> el-servador | War vorher ohne condition |
| 5 | Mosquitto Image pinnen | mqtt-broker | `eclipse-mosquitto:2` -> `eclipse-mosquitto:2.0.21` |
| 6 | Exporter-Ports -> `expose` statt `ports` | postgres-exporter (9187), mosquitto-exporter (9234) | `ports:` -> `expose:` |
| 7 | Volume-Naming vereinheitlichen | Alle | `postgres_data` -> `automationone-postgres-data` etc. |
| 8 | `version:` Feld entfernen | Top-Level | Seit Compose v2 obsolet |

**Verifikation:** `docker compose config --quiet` ohne Fehler

---

### Part 2: Service-Konfigurationen

**Problem 1 - PostgreSQL Log-Rotation DEFEKT:**
- `docker/postgres/postgresql.conf`
- `log_filename = 'postgresql.log'` (fixer Name) -> Log-Rotation greift nie -> 98MB Einzeldatei
- **Fix:** `log_filename = 'postgresql-%Y-%m-%d.log'` + `log_truncate_on_rotation = on`
- Bestehende `log_rotation_age = 1d` und `log_rotation_size = 50MB` greifen dann korrekt

**Problem 2 - Mosquitto doppeltes Logging:**
- `docker/mosquitto/mosquitto.conf`
- Loggte in Datei UND stdout -> doppelte Speicherung
- **Fix:** `log_dest stdout` only, File-Logging auskommentiert
- Docker json-file Driver rotiert automatisch (durch Part 1 konfiguriert)

---

### Part 3: Promtail Pipeline

**Ziel:** Strukturiertes Log-Processing fuer KI-Debugging via Loki.

**Datei:** `docker/promtail/config.yml`

**Pipeline-Reihenfolge (KRITISCH):**
```
1. docker: {}                                    # Docker JSON-Format
2. match(el-servador) -> drop health-logs         # GET /api/v1/health/* filtern
3. match(el-servador) -> multiline (Tracebacks)   # firstline: '^\d{4}-\d{2}-\d{2}'
4. match(el-servador) -> regex/json Parser        # level, logger Labels extrahieren
5. match(el-frontend) -> json Parser              # level, component Labels extrahieren
```

**Wichtiger Kontext:** Server loggt Text-Format auf stdout (nicht JSON). Regex-Parser noetig.
**Label-Strategie:** `level` und `logger` (Server), `level` und `component` (Frontend) als Loki-Labels.

**Verify-Plan Ergebnis:** `level` Label hat im Loki KEINE Werte! Promtail Pipeline extrahiert nicht korrekt. Regex-Filter `|~ "(?i)(error|exception|critical)"` als Workaround fuer Dashboard-Queries.

---

### Part 4: Cleanup & Hygiene

**4 Teile:**

**A) Alert Rule 5 ESP Offline:**
- `docker/grafana/provisioning/alerting/alert-rules.yml` (uid: `ao-esp-offline`)
- Feuerte permanent: 100 Mock-ESPs, 32 offline, Bedingung `> 0` immer true
- Fix-Optionen: Environment-Guard, prozentualer Threshold, oder `esp_online > 0` Guard

**B) Log-Strategie dokumentiert:**
- `docker/README-logging.md` erstellt
- 3 Log-Wege: Bind-Mounts (direktes Debugging) -> Docker json-file (Rotation) -> Promtail -> Loki (7d Retention)

**C) pgAdmin servers.json Mount-Fix:**
- WSL2/Docker Desktop interpretiert File-Bind-Mount als Directory -> ExitCode 127
- `docker/pgadmin/servers.json` pruefen und Fix implementieren

**D) Verwaiste Volumes:**
- Parallele Volumes: `auto-one_automationone-*` (alt) + `automationone-*` (neu)
- NUR dokumentieren, NICHT loeschen

---

### Part 5: Grafana Dashboard Redesign Spezifikation

**Umfangreichstes Dokument (650+ Zeilen).** Enthaelt verify-plan Ergebnisse.

**Neues Dashboard-Layout: 6 Rows, 26 Panels:**

```
Row 0: System Status (6 stat-Panels: Server, MQTT, DB, Frontend Errors, ESP Fleet, Active Alerts)
Row 1: Server Performance (CPU gauge, Memory gauge, Uptime stat, Performance timeseries)
Row 2: ESP32 Fleet (Total, Online, Offline stats + Online Rate timeseries)
Row 3: MQTT Traffic (Clients, Msg/s In/Out, Dropped + Message Rate timeseries)
Row 4: Database (Connections, Size, Deadlocks/Locks + Connections timeseries) - collapsed
Row 5: Logs & Errors (Error Rate, Log Volume + Recent Error Logs panel) - collapsed
```

**Kritische verify-plan Korrekturen:**

| Was der TM schrieb | Was korrekt ist | Betroffene Panels |
|---------------------|-----------------|-------------------|
| `datname="automationone"` | `datname="god_kaiser_db"` | Panel 20-23 (Database) |
| `broker_uptime_seconds` | `broker_uptime` | MQTT-Panels |
| `{level="error"}` Label-Filter | Label leer -> Regex `\|~ "(?i)(error\|...)"` | Panel 4, 24, 26 |
| stat-Panel fuer Alerts | "Alert List" Panel-Typ (kein Alertmanager) | Panel 6 |
| `pg_stat_database_tup_*` | Nicht verfuegbar in postgres-exporter v0.16.0 | Database Row |
| `esp_online / esp_total * 100` | `esp_online / clamp_min(esp_total, 1) * 100` | Panel 14 |

**Metriken-Endpoints verifiziert:**
- Server: 7 custom `god_kaiser_*` + 10 instrumentator (port 8000)
- Postgres: `pg_up`, `pg_stat_database_numbackends`, `pg_database_size_bytes`, `pg_stat_database_deadlocks` (port 9187)
- Mosquitto: `broker_clients_connected`, `broker_messages_received/sent`, `broker_uptime` etc. (port 9234)
- Loki Labels: `compose_service` (10 Werte), `compose_project` ("auto-one"), `stream`, `container`

**Dashboard-UID:** `automationone-system-health` BEIBEHALTEN (sonst Duplikat wegen `disableDeletion: true`)

---

### Part 5 Document Review

**Auftrag:** Die Grafana-Spezifikation (Part 5) korrigieren und zu einer widerspruchsfreien Implementierungsspezifikation machen.

**Kernaufgaben:**
- Alle "Option A/B/C"-Diskussionen durch finale Entscheidungen ersetzen
- JSON-Strukturregeln aus dem echten `system-health.json` extrahieren (collapsible rows, datasource-Referenzierung, gridPos)
- Loki `level` Label Widerspruch klaeren (Part 3 sagt "funktioniert", verify-plan sagt "leer")
- Qualitaets-Checkliste fuer den implementierenden Agent ergaenzen
- Betroffene Komponenten vollstaendig auflisten (Dashboard + Alert Rules + Promtail + Datasources)

---

### Postfix: 4 Post-Hardening Korrekturen

**Fix 1 - Volume-Naming:**
- `docker-compose.yml` -> `volumes:` Sektion
- Ohne `name:` Attribut haengt Compose v2 Prefix `auto-one_` an -> `auto-one_automationone-postgres-data`
- **Fix:** Explizites `name: automationone-postgres-data` bei jedem Volume

**Fix 2 - Alert Rule 5 (prozentual):**
- `docker/grafana/provisioning/alerting/alert-rules.yml` (uid: `ao-esp-offline`)
- Alte Expression: `god_kaiser_esp_offline > 5 and god_kaiser_esp_total > 0 and god_kaiser_esp_online > 0` -> feuert bei 32/100 Mock-Daten
- **Neue Expression:** `(god_kaiser_esp_offline / clamp_min(god_kaiser_esp_total, 1)) > 0.5 and god_kaiser_esp_online > 0`
- 32/100 = 0.32 -> kein Alert. 3/5 = 0.6 -> Alert.

**Fix 3 - Promtail zweite Drop-Regex:**
- `docker/promtail/config.yml`
- Server loggt Health-Requests in 2 Formaten: Uvicorn-Access + strukturiertes Middleware-Format
- Nur Uvicorn-Format wird gedroppt -> ~240 Middleware-Health-Logs/Stunde bleiben
- **Fix:** Zweite Drop-Stage: `".*Request completed: GET /api/v1/health/.*"`

**Fix 4 - MQTT Bind-Mount auskommentieren:**
- `docker-compose.yml` -> mqtt-broker -> volumes
- `./logs/mqtt:/mosquitto/log` ist seit stdout-only (Part 2) nutzlos
- **Fix:** Auskommentieren mit erklaerenden Kommentar

---

## 2. Mosquitto Exporter (Phase 3.1)

### Erstanalyse

**Problem:** MQTT-Broker hat keine Prometheus-Metriken. Dashboard zeigt nur `god_kaiser_mqtt_connected` (Server-Sicht), nicht Broker-Performance.

**Empfehlung:** `sapcc/mosquitto-exporter:v0.8.0`
- Scratch-Image, 3.2 MB, Port 9234
- Liest `$SYS/#` Topics vom Mosquitto Broker
- Kein Healthcheck moeglich (scratch hat keine Shell) -> `up{job="mqtt-broker"}` als impliziter Health-Indikator

**Verfuegbare Broker-Metriken via Exporter:**
- `broker_clients_connected`, `broker_messages_received/sent`, `broker_publish_messages_dropped`
- `broker_subscriptions_count`, `broker_bytes_received/sent`, `broker_uptime`

### Implementierungsplan

**3 Dateien betroffen:**

| Datei | Aenderung |
|-------|----------|
| `docker-compose.yml` | Neuer Service-Block, Profile: monitoring, expose: 9234 |
| `docker/prometheus/prometheus.yml` | Neuer scrape_config: job `mqtt-broker`, target `mosquitto-exporter:9234` |
| `docker/grafana/provisioning/dashboards/system-health.json` | MQTT-Panels (Row 3 im Redesign) |

---

## 3. Grafana Alerting (Phase 3.2)

### Erstanalyse

**Problem:** Kein Alerting. Bei Serverausfall keine automatische Warnung.

**5 Alert Rules definiert:**

| UID | Name | Metrik | Threshold | Severity |
|-----|------|--------|-----------|----------|
| ao-server-down | Server Down | `up{job="el-servador"}` | < 1 | critical |
| ao-mqtt-disconnected | MQTT Disconnected | `god_kaiser_mqtt_connected` | < 1 | critical |
| ao-database-down | Database Down | `pg_up` | < 1 | critical |
| ao-high-memory | High Memory | `god_kaiser_memory_percent` | > 85 | warning |
| ao-esp-offline | ESP Offline | `god_kaiser_esp_offline > 0 and esp_total > 0` | > 0 | warning |

### Verify-First Implementierungsplan

**Kritische Erkenntnisse:**
- Grafana 11.5.2 braucht 3-Stage Pipeline: A(PromQL) -> B(Reduce:last) -> C(Threshold)
- 2-Stage funktioniert NICHT ("looks like time series data")
- Evaluation interval MUSS Vielfaches von 10s sein (15s scheitert)
- Rule 1 (Server Down) war strukturell fehlerhaft: `condition: A` direkt auf `up{}` feuert PERMANENT
- Phase 1 = UI-only, kein Alertmanager, keine Contact-Points noetig
- File-Provisioning: `docker/grafana/provisioning/alerting/alert-rules.yml`

**Datei:** `docker/grafana/provisioning/alerting/alert-rules.yml`

---

## 4. pgAdmin DevTools (Phase 4.1)

### Erstanalyse

**Problem:** pgAdmin als Phantom-Service dokumentiert aber nie implementiert.

**Vorhandene Artefakte:**
- `docker/pgadmin/servers.json` - Pre-Provisioning Config (referenziert `god_kaiser_db`)
- `.env.example` - KEINE pgAdmin-Variablen (TM-Annahme "PGADMIN_EMAIL existiert" war falsch)

**Korrekte Env-Variablen:** `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` (nicht `PGADMIN_EMAIL`)

### Implementierungsplan

**Service-Definition:**
- Image: `dpage/pgadmin4:9.3` (gepinnt)
- Profile: `devtools`
- Port: 5050:80
- Healthcheck: `wget --spider http://localhost:80/misc/ping`
- depends_on: postgres (service_healthy)
- Volume: `automationone-pgadmin-data`

**4 Dateien betroffen:**

| Datei | Aenderung |
|-------|----------|
| `docker-compose.yml` | Service-Block + Volume-Definition |
| `docker/pgadmin/servers.json` | PassFile-Zeile entfernen |
| `.env.example` | `PGADMIN_DEFAULT_EMAIL/PASSWORD` hinzufuegen |
| `Makefile` | Targets: `devtools-up`, `devtools-down`, `devtools-logs`, `pgadmin` |

**WSL2-Problem:** File-Bind-Mount von `servers.json` wird als Directory interpretiert -> ExitCode 127

---

## 5. Frontend Logging (Phase 4.2)

### Assessment

**IST-Zustand:**
- 241 `console.*`-Calls in 33 Dateien (85 error, 67 log, 35 warn, 30 debug, 24 info)
- Top-3: `stores/esp.ts` (52), `services/websocket.ts` (28), `SystemMonitorView.vue` (20)
- Kein zentraler Logger
- `VITE_LOG_LEVEL` in docker-compose.yml definiert aber NICHT genutzt
- 6 explizite `[DEBUG]`-Artefakte in SystemMonitorView.vue (Z.917-989)
- 12 styled `%c`-Calls in 6 Dateien (nutzlos in Docker-Logs)
- Globale Handler in main.ts existieren (Vue errorHandler, warnHandler, unhandledrejection)
- Fehlt: `window.onerror`

### Implementierungsplan

**Phase 1+2 zusammen:**

**1. Custom Logger** (`El Frontend/src/utils/logger.ts`):
- `createLogger(componentName)` Factory
- Nutzt `VITE_LOG_LEVEL` als Gate
- JSON-Output in Prod, Plaintext in Debug
- Error loggt IMMER (kein Gate)
- ~50 LOC, kein externer Package

**2. Migration in 4 Batches:**

| Batch | Dateien | Calls |
|-------|---------|-------|
| 1: API-Layer | api/index.ts, api/esp.ts | Zentralster Punkt |
| 2: Services | services/websocket.ts | 28 Calls |
| 3: Stores | esp.ts, logic.ts, auth.ts, dragState.ts | 52+ Calls |
| 4: Views+Components | Rest | Verbleibende |

**3. Promtail Pipeline-Stage** fuer Frontend:
- JSON-Parsing fuer `compose_service="el-frontend"`
- Labels: `level`, `component`

---

## 6. Dashboard Panel Fix (Standalone)

**Zeitlich VOR dem Grafana Redesign (Part 5).** Erste Reparatur der broken Panels.

**Problem:** 3 von 6 Panels "No data" weil Prometheus-Jobs nicht existieren.

| Panel | Vorher (broken) | Nachher (fix) |
|-------|-----------------|---------------|
| 2: MQTT | `up{job="mqtt-broker"}` | `god_kaiser_mqtt_connected` (Prometheus) |
| 3: Database | `up{job="postgres"}` | `count_over_time({compose_service="postgres"} [1m]) > 0` (Loki) |
| 4: Frontend | `up{job="el-frontend"}` | `count_over_time({compose_service="el-frontend"} [1m]) > 0` (Loki) |

**Datei:** `docker/grafana/provisioning/dashboards/system-health.json`

**Limitierung:** Loki-Heartbeat zeigt nur "Container loggt", nicht "Container healthy". Echte Healthchecks brauchen Exporter (postgres-exporter, Frontend-Metrics-Endpoint).

**Hinweis:** Diese Fixes werden durch das Grafana Dashboard Redesign (Part 5) vollstaendig ersetzt.

---

## Priorisierte Problemliste

### KRITISCH
- **Grafana Dashboard Redesign noch nicht implementiert:** Part 5 Spezifikation ist fertig (mit verify-plan Korrekturen), aber das JSON wurde noch nicht generiert. 26 Panels, 6 Rows, vollstaendige Metriken-Spezifikation liegt vor.
- **Loki `level` Label funktioniert NICHT:** Promtail Pipeline extrahiert `level` nicht korrekt. Betrifft alle Dashboard-Queries die auf Label-Filter setzen. Workaround: Regex-Filter.
- **Alert Rule 5 Diskrepanz:** YAML hat aktualisierte Expression (`> 5`), laufende Grafana-Instanz hat alte Version (`> 0`). Grafana-Restart noetig. Postfix definiert neue prozentuale Expression (`> 0.5`).

### WARNUNG
- **Volume-Naming Doppel-Prefix:** Ohne explizites `name:` Attribut erzeugt Compose v2 `auto-one_automationone-*`. Postfix Fix 1 adressiert dies.
- **Promtail zweites Health-Log-Format:** Middleware-Health-Logs werden nicht gedroppt (~240/Stunde). Postfix Fix 3 adressiert dies.
- **Frontend 241 console.*-Calls:** Kein zentraler Logger, kein Level-Gating, styled %c-Calls nutzlos in Docker. Plan liegt vor.
- **pgAdmin WSL2 Mount-Problem:** File-Bind-Mount als Directory interpretiert -> Container crashed.

### INFO
- **Reihenfolge der naechsten Implementierungen:**
  1. Postfix Fixes 1-4 anwenden (Volume, Alert, Promtail, Bind-Mount)
  2. Part 5 Document Review ausfuehren (Spezifikation finalisieren)
  3. Dashboard JSON generieren (basierend auf Part 5 Spezifikation)
  4. Frontend Logging Phase 1+2 (Logger + Migration)
- **Verfuegbare Metriken-Endpunkte:** Server :8000 (7 custom + 10 auto), Postgres-Exporter :9187, Mosquitto-Exporter :9234, Loki :3100
- **Docker Stack:** 11 Services (4 core + 6 monitoring + 1 devtools). Profiles: monitoring, devtools
- **DB-Name:** `god_kaiser_db` (NICHT `automationone` wie in mehreren Reports faelschlich angenommen)

---

## Code-Analyse Referenz

Fuer die Nachverfolgung im Code sind diese Dateien die primaeren Aenderungsziele:

| Datei | Reports | Status |
|-------|---------|--------|
| `docker-compose.yml` | Part 1, 4, Postfix, 4-1 | Geaendert (Part 1+4), Postfix-Fixes offen |
| `docker/postgres/postgresql.conf` | Part 2 | Geaendert |
| `docker/mosquitto/mosquitto.conf` | Part 2 | Geaendert (stdout-only) |
| `docker/promtail/config.yml` | Part 3, Postfix | Geaendert, zweite Drop-Regex offen |
| `docker/grafana/provisioning/dashboards/system-health.json` | Part 5, Panel-Fix | Panel-Fix applied, Redesign offen |
| `docker/grafana/provisioning/alerting/alert-rules.yml` | 3-2, Part 4, Postfix | Erstellt, Fixes teilweise applied |
| `docker/grafana/provisioning/dashboards/dashboards.yml` | Part 5 | `disableDeletion: true`, `refresh: 10s` |
| `docker/prometheus/prometheus.yml` | 3-1 | scrape_config fuer mqtt-broker |
| `docker/pgadmin/servers.json` | 4-1 | PassFile entfernen |
| `.env.example` | 4-1, Part 5 | pgAdmin-Vars, Grafana-Passwort-Warnung |
| `docker/README-logging.md` | Part 4 | Erstellt |
| `El Frontend/src/utils/logger.ts` | 4-2 | Neu zu erstellen |
| `El Frontend/src/main.ts` | 4-2 | window.onerror ergaenzen |
| `Makefile` | 4-1 | devtools-Targets |
