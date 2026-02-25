# AutomationOne - KI & Monitoring Roadmap

**Version:** 1.1
**Datum:** 2026-02-13
**Status:** Living Document (verify-plan Full-Stack 2026-02-13)
**Quelle:** TM-Plan, korrigiert mit 8 verify-plan Findings; Full-Stack-Abgleich gegen echte Configs (docker-compose, Alloy/Promtail, Prometheus, metrics.py, Alert Rules)

---

## Kontext

Robin arbeitet alleine am 4-Layer IoT Framework AutomationOne (ESP32 Firmware -> FastAPI Backend -> Vue 3 Frontend -> Technical Manager). Das System laeuft in Docker auf WSL2, mit 13+ Claude Code Agents in VS Code und einem Technical Manager (TM) als strategische Steuerungsinstanz in claude.ai. Aktueller Fokus: Debugging, Stabilisierung, Frontend-Konsolidierung.

Dieser Plan fuehrt von der aktuellen Debugging-Phase schrittweise zu einem vollstaendig ueberwachten, KI-optimierten Entwicklungsworkflow und perspektivisch zu lokaler ML-Inferenz auf einem NVIDIA Jetson Orin Nano Super (8GB, ~280 EUR).

**Architektur-Entscheidung:** Der Docker-Stack (El Servador, PostgreSQL, Mosquitto, Frontend, Monitoring) bleibt auf dem Hauptrechner (WSL2, perspektivisch Mini-PC/NAS). Der Jetson wird ausschliesslich als dedizierte KI-Inferenz-Box eingesetzt - er empfaengt Daten per MQTT/REST vom Hauptserver, rechnet, und schickt Ergebnisse zurueck. Saubere Trennung von Infrastruktur und ML. Der ser2net-Container zur Serial-Bridge wird fest in den Stack integriert.

---

## Phase 1 - Monitoring Stack & Echtzeit-Logging

**Ziel:** Alle Datenstroeme zentral sichtbar machen. Kein blindes Debuggen mehr.

### 1.1 Loki + Alloy + Grafana in Docker-Stack

> **STATUS: DONE**

Vier Monitoring-Services in `docker-compose.yml` unter `profiles: ["monitoring"]`:

| Service | Container | Port | Image | Status |
|---------|-----------|------|-------|--------|
| loki | automationone-loki | 3100 | grafana/loki:3.4 | DONE |
| alloy | automationone-alloy | 12345 | grafana/alloy:v1.13.1 | DONE (migrated from Promtail 2026-02-24) |
| cadvisor | automationone-cadvisor | 8080 | gcr.io/cadvisor/cadvisor:v0.49.1 | DONE |
| postgres-exporter | automationone-postgres-exporter | 9187 (intern) | prometheuscommunity/postgres-exporter:v0.16.0 | DONE |
| mosquitto-exporter | automationone-mosquitto-exporter | 9234 (intern) | sapcc/mosquitto-exporter:0.8.0 | DONE |
| esp32-serial-logger | automationone-esp32-serial | - | Build: docker/esp32-serial-logger | DONE (Profile: hardware) |
| prometheus | automationone-prometheus | 9090 | prom/prometheus:v3.2.1 | DONE |
| grafana | automationone-grafana | 3000 | grafana/grafana:11.5.2 | DONE |

**Makefile-Targets (DONE):** `make monitor-up`, `make monitor-down`, `make monitor-logs`, `make monitor-status`

**Alloy-Config (DONE, migrated from Promtail 2026-02-24):** Docker Service Discovery mit folgenden Labels:

| Feld | Typ | Quelle | Beschreibung |
|------|-----|--------|-------------|
| `compose_service` | Label | Docker SD | Service-Name (el-servador, mqtt-broker, etc.) |
| `container` | Label | Docker SD | Container-Name (automationone-server, etc.) |
| `stream` | Label | Docker SD | stdout/stderr |
| `compose_project` | Label | Docker SD | auto-one |
| `level` | Label | Parser | Log-Level (el-servador: regex, el-frontend: JSON) |
| `logger` | Structured Metadata | Regex Parser | Python module path (el-servador only) |
| `request_id` | Structured Metadata | Regex Parser | Request-Correlation-ID (el-servador only) |
| `component` | Structured Metadata | JSON Parser | Vue/ESP32 component name |
| `device` | Structured Metadata | JSON Parser | ESP32 device_id (esp32-serial-logger only) |
| `error_code` | Structured Metadata | Regex Parser | Error-Code E\d{4} (el-servador only) |

**Alloy Pipeline (DONE, native River-Config `docker/alloy/config.alloy`):**
- Health-Endpoint-Logs werden gedroppt (noise reduction)
- Multiline-Aggregation fuer Python Tracebacks
- Structured regex parsing fuer el-servador Text-Logs
- JSON parsing fuer el-frontend Logs
- **ESP32 → Loki:** Stage 4 `{compose_service="esp32-serial-logger"}` – JSON-Parse (level, device_id, component), Labels fuer Abfragen. ESP-Serial-Output fliesst in Loki sobald `esp32-serial-logger` (Profile: hardware) laeuft und sich mit ser2net/socat auf dem Host verbindet.
- **Loki-Selbst-Logs:** Stage 5 – Loki-Container-Logs werden mitgeholt, logfmt-Parser, Query-Stats-Drop (Noise-Reduktion).

**Loki-Config (DONE):** 7-Tage-Retention (168h), TSDB storage, schema v13 (`docker/loki/loki-config.yml`).

### 1.2 ESP32 Serial Output einfangen

Zwei parallele Wege:

**A) MQTT Debug-Topic (permanente Loesung)**

> **STATUS: TODO**

Neuer Topic in El Trabajante Firmware: `kaiser/god/esp/{esp_id}/system/debug`

Schweregrade als Payload-Feld: `ERROR`, `WARN`, `INFO`, `DEBUG`

```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "level": "WARN",
  "module": "sensor_manager",
  "message": "I2C read timeout on GPIO 21"
}
```

El Servador empfaengt diese und schreibt sie als strukturierte Logs (JSON), die Alloy abgreifen kann. Passt zur server-zentrischen Architektur.

**B) Serial-zu-Netzwerk-Bridge (fester Bestandteil des Stacks)**

> **STATUS: TEILWEISE DONE**

- **DONE:** Container `esp32-serial-logger` (Profile: `hardware`) in `docker-compose.yml`. Verbindet sich per TCP mit einem Serial-Bridge auf dem Host (`SERIAL_HOST`/`SERIAL_PORT`, Default: `host.docker.internal:3333`). Liest Zeilen, gibt strukturiertes JSON auf stdout aus. Alloy scraped den Container und sendet nach Loki (Pipeline Stage 4 in `docker/alloy/config.alloy`). **ESP32-Logs landen also bereits in Loki**, wenn: (1) ser2net oder socat auf dem Host auf Port 3333 laeuft, (2) `make monitor-up` und Hardware-Profil gestartet werden (`docker compose --profile monitoring --profile hardware up -d`).
- **Voraussetzung:** Auf dem Host muss eine Serial-Bridge laufen (z. B. ser2net oder `socat TCP-LISTEN:3333,reuseaddr,fork FILE:/dev/ttyUSB0,raw,echo=0`). WSL2: USB-Passthrough via `usbipd-win` fuer `/dev/ttyUSB0`.
- **Hinweis:** Der Plan nannte zuerst "ser2net-Container"; im Stack heisst der Service `esp32-serial-logger` (Build: `docker/esp32-serial-logger`, Image nutzt ser2net/socat **auf dem Host**, nicht im Container).

### 1.3 Grafana "Kontrollraum" Dashboard

> **STATUS: TEILWEISE DONE**

**DONE:**
- System-Health Dashboard (`docker/grafana/provisioning/dashboards/system-health.json`)
- Server Health Status (up/down)
- MQTT Connection Status
- ESP Device Counts (total/online/offline)
- Memory & CPU Gauges
- Datasources provisioniert (Prometheus + Loki via `datasources.yml`)

**TODO:**
- Log-Panel pro Layer (Backend, Frontend, Firmware, Broker, DB) - live, filterbar nach Severity
- Container-Health-Status (CPU, RAM, Restart-Count) im Dashboard: cAdvisor wird bereits von Prometheus gescraped; Grafana-Panels fuer Container-Metriken fehlen noch
- Korrelations-View: alle Logs +/-5 Sekunden um einen Error herum (LogQL)

### 1.4 Prometheus-Metriken

> **STATUS: TEILWEISE DONE**

**DONE - Custom Gauges/Counters/Histogram** (`El Servador/god_kaiser_server/src/core/metrics.py`):

| Metrik | Typ | Beschreibung |
|--------|-----|-------------|
| `god_kaiser_uptime_seconds` | Gauge | Server uptime |
| `god_kaiser_cpu_percent` | Gauge | CPU usage |
| `god_kaiser_memory_percent` | Gauge | Memory usage |
| `god_kaiser_mqtt_connected` | Gauge | MQTT status (1/0) |
| `god_kaiser_mqtt_messages_total` | Counter | MQTT messages (labels: direction=received\|published) |
| `god_kaiser_mqtt_errors_total` | Counter | MQTT Fehler (labels: direction=received\|published) |
| `god_kaiser_websocket_connections` | Gauge | Aktive WS-Verbindungen (exakter Name in Code) |
| `god_kaiser_db_query_duration_seconds` | Histogram | DB-Query-Dauer (app-seitig) |
| `god_kaiser_esp_total` | Gauge | Total ESP devices |
| `god_kaiser_esp_online` | Gauge | Online ESP devices |
| `god_kaiser_esp_offline` | Gauge | Offline ESP devices |
| `god_kaiser_esp_avg_heap_free_bytes` | Gauge | Ø freier Heap (online ESPs) |
| `god_kaiser_esp_min_heap_free_bytes` | Gauge | Min freier Heap |
| `god_kaiser_esp_avg_wifi_rssi_dbm` | Gauge | Ø WiFi RSSI |
| `god_kaiser_esp_avg_uptime_seconds` | Gauge | Ø Uptime |

**DONE - prometheus-fastapi-instrumentator:**
- Automatische HTTP-Metriken (Request Count, Latency, Error-Rate pro Endpoint)
- Endpoint: `/api/v1/health/metrics`

**DONE - Exporter:**
- PostgreSQL-Exporter (`postgres-exporter`, Port 9187)
- Mosquitto-Exporter (`mosquitto-exporter`, Port 9234)

**DONE - Scrape-Config** (`docker/prometheus/prometheus.yml`):
- Job `el-servador` -> `el-servador:8000` (metrics_path: `/api/v1/health/metrics`)
- Job `postgres` -> `postgres-exporter:9187`
- Job `mqtt-broker` -> `mosquitto-exporter:9234`
- Job `prometheus` -> `localhost:9090`
- Job `cadvisor` -> `cadvisor:8080`
- Job `loki` -> `loki:3100`
- Job `alloy` -> `alloy:12345`

**DONE - cAdvisor:** Service in `docker-compose.yml` (Profile: monitoring), Port 8080. Prometheus scraped `cadvisor:8080`. Container-CPU, -RAM, -Restart-Count als Prometheus-Metriken verfuegbar.

### Ergebnis Phase 1

**DONE:** Loki, Alloy (migrated from Promtail 2026-02-24), Grafana, Prometheus laufen im Monitoring-Profil. cAdvisor, postgres-exporter, mosquitto-exporter aktiv. Server exponiert Custom Gauges, Counter (MQTT messages/errors), WebSocket-Gauge, DB-Histogram und HTTP-Metriken. Prometheus scraped zusaetzlich Loki, Alloy, cAdvisor. ESP32-Serial-Output fliesst in Loki ueber Container `esp32-serial-logger` (Profile: hardware) + Alloy Pipeline. Basis-Dashboard vorhanden (`docker/grafana/provisioning/dashboards/system-health.json`).

**TODO:** MQTT Debug-Topic (A); auf Host ser2net/socat fuer esp32-serial-logger (B bereits im Stack); Log-Panel-Dashboard, Korrelations-View.

---

## Phase 2 - Intelligentes Alerting & Debug-Wissensbasis

**Ziel:** Das System meldet proaktiv wenn etwas nicht stimmt. Gleichzeitig systematisch Wissen aufbauen fuer spaetere ML-Modelle.

### 2.1 Grafana Alert Rules

> **STATUS: TEILWEISE DONE**

**DONE** (`docker/grafana/provisioning/alerting/alert-rules.yml`):

7 Rules mit korrekter 3-Stage Pipeline (A: PromQL -> B: Reduce:last -> C: Threshold):

| Rule | UID | Severity | Condition | For |
|------|-----|----------|-----------|-----|
| Server Down | ao-server-down | critical | up{job="el-servador"} < 1 | 1m |
| MQTT Disconnected | ao-mqtt-disconnected | critical | god_kaiser_mqtt_connected < 1 | 1m |
| Database Down | ao-database-down | critical | pg_up < 1 | 1m |
| Loki Down | ao-loki-down | critical | up{job="loki"} < 1 | 2m |
| Alloy Down | ao-alloy-down | critical | up{job="alloy"} < 1 | 2m |
| High Memory | ao-high-memory | warning | god_kaiser_memory_percent > 85 | 5m |
| ESP Offline | ao-esp-offline | warning | (esp_offline/esp_total) > 0.5 AND esp_online > 0 | 3m |
| High MQTT Error Rate | ao-high-mqtt-error-rate | warning | increase(god_kaiser_mqtt_errors_total[5m]) > 10 | 2m |

**TODO - Fehlende Alert Rules:**

| Rule | Bedingung | Severity |
|------|-----------|----------|
| Frontend WebSocket Lost | god_kaiser_websocket_connections = 0 (wenn zuvor > 0) | warning |
| Container Restart | Container restart_count > threshold (cAdvisor-Metriken) | warning |
| MQTT Reconnect Loop | disconnect -> connect -> disconnect in < 60s | warning |

**TODO - Alert Contact Point:**
- Webhook an El Servador (neuer REST-Endpoint `/api/v1/alerts/webhook`)
- El Servador leitet via WebSocket an Frontend weiter
- Frontend zeigt als Notification im Dashboard

### 2.2 Log-basierte Metriken

> **STATUS: TODO**

In Loki/LogQL Recording Rules definieren:

```logql
rate({compose_service="el-servador"} |= "ERROR" [5m])
count_over_time({compose_service="el-servador", logger=~".*mqtt.*"} |= "timeout" [1h])
rate({compose_service="mqtt-broker"} |= "socket error" [5m])
```

Diese Metriken in Grafana visualisieren und als Alert-Quellen nutzen.

### 2.3 Debug-Wissensbasis (Fehlermuster-Katalog)

> **STATUS: TODO**

**Zieldatei:** `.claude/reference/errors/PATTERNS.yaml`

Strukturierter Katalog fuer jedes Fehlermuster:

```yaml
patterns:
  - id: MQTT_RECONNECT_LOOP
    symptoms:
      - container: automationone-mqtt
        pattern: "socket error on client esp32_01, disconnecting"
        frequency: ">3x in 60s"
      - container: automationone-server
        pattern: "MQTT client esp32_01 went offline"
        compose_service: el-servador
        level: WARNING
      - container: esp32-serial
        pattern: "WiFi: disconnect reason 202"
    root_cause: "ESP32 WiFi-Interferenz bei schwachem Signal"
    solution: "WiFi TX-Power anpassen oder Reconnect-Backoff in Firmware erhoehen"
    layers: [firmware, broker, backend]
    severity: warning
    correlation_window: "+/-10s"
    error_codes: [1201, 5102]  # Referenz zu ERROR_CODES.md
```

**Mehrwert:**
- Sofort: ERROR_CODES.md wird praeziser, Debug-Agents nutzen Katalog als Referenz
- Mittelfristig: Grafana Alert Rules werden praeziser (echte Patterns)
- Langfristig: Trainingsdatensatz fuer ML-Klassifikator (Phase 3)

**Hinweis:** Debug-Agents (esp32-debug, server-debug, mqtt-debug, frontend-debug) haben Read-Only-Zugriff (Read/Grep/Glob). Katalog-Erweiterung erfolgt ueber Dev-Agents oder manuell.

### 2.4 Label-Taxonomie fuer Logs

> **STATUS: TODO**

Definiert Labels fuer spaeteres ML-Training. Bestehende Alloy-Labels (Promtail-Format) als Basis:

| Label | Typ | Werte | Quelle |
|-------|-----|-------|--------|
| `compose_service` | auto | el-servador, mqtt-broker, esp32-serial-logger, loki, etc. | Docker SD |
| `level` | extracted | INFO, WARNING, ERROR, DEBUG, CRITICAL | Parser (el-servador regex, el-frontend/loki/esp32 JSON/logfmt) |
| `logger` | extracted | src.mqtt.handlers.sensor_handler, etc. | Regex (el-servador) |
| `component` | extracted | ESPCard, DashboardView; mqtt/sensor/logger (Firmware) | JSON (el-frontend, esp32-serial-logger) |
| `device` | extracted | esp32-xiao-01, etc. | JSON (esp32-serial-logger, Feld device_id) |
| `error_pattern` | manual | MQTT_RECONNECT_LOOP, etc. | Fehlermuster-Katalog |
| `layer` | static | firmware, broker, backend, frontend, database | Alloy relabel |

### Ergebnis Phase 2

**DONE:** 5 Alert Rules mit 3-Stage Pipeline, provisioniert via YAML.

**TODO:** Fehlermuster-Katalog, LogQL Recording Rules, Label-Taxonomie, Alert Contact Point (Webhook -> Frontend), fehlende Alert Rules.

---

## Phase 2.5 - TM & Agent Workflow Professionalisierung

**Ziel:** Analyse- und Implementierungsauftraege in 2-3 Schritten sauber erledigen.

> **STATUS: TODO (komplett)**

### 2.5.1 Standardisierte Auftragsformate

**Analyseauftrag-Template:**

```
AUFTRAGSTYP: ANALYSE
SCOPE: [welche Layer / welche Dateien / welcher Bereich]
FOKUS: [was genau untersucht werden soll]
TIEFE: [oberflaechlich / standard / tief]
OUTPUT: [erwartetes Report-Format]
KONTEXT: [relevante Vorgeschichte, letzte Aenderungen]
ABHAENGIGKEITEN: [welche Reports/Ergebnisse als Input dienen]
```

**Implementierungsauftrag-Template:**

```
AUFTRAGSTYP: IMPLEMENTIERUNG
SCOPE: [welche Dateien betroffen]
ZIEL: [was soll danach anders sein]
CONSTRAINTS: [was darf NICHT veraendert werden]
VALIDIERUNG: [wie wird Erfolg geprueft - Tests, Healthchecks, manuell]
ROLLBACK: [was tun wenn es schiefgeht]
ABHAENGIG VON: [welcher Analyseauftrag / welche Freigabe]
```

### 2.5.2 Dreistufige Analyse-Pipeline

| Schritt | Agent | Aufgabe | Output |
|---------|-------|---------|--------|
| 1. Erstanalyse | zustaendiger Debug-/Dev-Agent | Fakten: IST-Zustand, Findings | `.claude/reports/current/[AGENT]_REPORT.md` |
| 2. Gegenpruefung | meta-analyst oder zweiter Agent | Nachvollziehbarkeit, Widersprueche | Ergaenzung/Korrektur zum Report |
| 3. Konsolidierung | system-control oder TM | Finale Empfehlung | CONSOLIDATED_REPORT.md |

**Einheitliches Report-Format:**

```markdown
# [Report-Typ] - [Bereich] - [Datum]
## Status: ERSTANALYSE | GEGENGEPRUEFT | KONSOLIDIERT
## Auftrag: [Referenz zum Originalauftrag]
## Ergebnisse
[Strukturierte Findings]
## Empfehlung
[Konkrete naechste Schritte]
## Offene Fragen
[Was konnte nicht geklaert werden]
```

### 2.5.3 Implementierungs-Pipeline

| Schritt | Agent | Aufgabe |
|---------|-------|---------|
| 1. Plan erstellen | zustaendiger Dev-Agent | Implementierungsplan basierend auf Analyse |
| 2. Plan pruefen | system-control oder zweiter Agent | Gegenpruefung auf Vollstaendigkeit |
| 3. Freigabe | User / TM | Approval |
| 4. Umsetzung | Dev-Agent (Edit-Mode) | Implementation + Tests + Report |

### 2.5.4 Agent-System Erweiterungen

**Chain-Awareness:** Jeder Agent erkennt seine Position in der Pipeline:

```
CHAIN-POSITION: 1/3 | 2/3 | 3/3
VORHERIGER-REPORT: .claude/reports/current/[filename]
```

**Report-Discovery:** `/collect-reports` Skill erweitern um Reports nach Status zu filtern (ERSTANALYSE vs. KONSOLIDIERT).

**Fehlermuster-Referenz:** Debug-Agents referenzieren Pattern-IDs aus `.claude/reference/errors/PATTERNS.yaml` statt Probleme neu zu beschreiben.

### 2.5.5 TM Knowledge Base Update

Neue Dokumente fuer TM:
- Auftrags-Templates (Analyse + Implementierung)
- Pipeline-Beschreibung (3-Stufen-Ablauf)
- Report-Format-Spezifikation
- Aktuelles Agent-Inventar (13 Agents, 20 Skills)
- Fehlermuster-Katalog (waechst kontinuierlich)

### Ergebnis Phase 2.5

Streamlined Workflow: TM formuliert Auftrag -> Agent 1 analysiert -> Agent 2 prueft -> Agent 3 konsolidiert -> User approved -> Dev-Agent implementiert. 2-3 Durchlaeufe, minimal manuelle Eingriffe.

---

## Phase 3 - KI-gestuetztes Debugging auf dem Jetson

**Ziel:** GPU-beschleunigte, intelligente Debug-Unterstuetzung auf dem Jetson Orin Nano Super. Der Jetson laeuft als reine ML-Inferenz-Box im Netzwerk.

> **STATUS: TODO (komplett, Hardware-abhaengig)**

### 3.1 Hardware: Jetson Orin Nano Super Dev Kit

- ~280-320 EUR inkl. Import
- 67 TOPS, 8GB RAM, 1024 CUDA Cores, 32 Tensor Cores
- JetPack 6.2.1 (Ubuntu 22.04), Docker mit `--runtime nvidia`
- Netzwerkverbindung zum Hauptserver
- Carrier Board kompatibel mit Orin NX 16GB Modul (Upgrade-Pfad)

### Voraussetzungen (aus Phase 1 + 2)

- Monitoring-Stack laeuft stabil mit sauberen Labels
- Mindestens 4-8 Wochen Sensor- und Log-Daten gesammelt
- Fehlermuster-Katalog hat 15-20+ dokumentierte Patterns
- Prometheus-Metriken-Historie ueber mehrere Wochen

### 3.2 ML-Debugging-Methoden

#### 3.2.1 Log-Klassifikation (ueberwacht)

**Was:** Liest Log-Zeilen in Echtzeit, ordnet bekanntem Fehlermuster aus PATTERNS.yaml zu.
**Modell:** fastText oder kleines DistilBERT, wenige MB.
**Input:** Log-Zeile
**Output:** `{log_line, predicted_pattern: "MQTT_RECONNECT_LOOP", confidence: 0.87}`
**Wann:** Sofort nach Phase 2 (braucht gelabelte Daten).

#### 3.2.2 Anomalie-Erkennung (unueberwacht)

**Was:** Erkennt Log-Zeilen die "nicht normal" sind, ohne Kategorien zu kennen.
**Modell:** Autoencoder oder Isolation Forest, trainiert auf normalen Logs.
**Output:** `{log_line, anomaly_score: 0.94, is_anomaly: true}`
**Wann:** Sofort nach Phase 1 (braucht nur normale Logs als Baseline).

#### 3.2.3 Cross-Layer-Korrelation

**Was:** Erkennt kausale Ketten ueber Container hinweg (ESP32 langsamer -> MQTT-Queue steigt -> Server Timeout -> Frontend Stale Data).
**Modell:** Temporal Convolutional Network (TCN) oder LSTM.
**Daten:** 10-15 dokumentierte Fehler-Kaskaden mit Timestamps.
**Output:** `{time_window, cluster_detected: true, probable_origin: "firmware", affected_layers: ["broker", "backend", "frontend"]}`
**Wann:** Nach Phase 2 (braucht dokumentierte Kaskaden).

#### 3.2.4 Sequenz-Pattern-Mining

**Was:** Entdeckt automatisch Fehler-Kaskaden ("Wenn Event A, folgt Event B in 80% der Faelle innerhalb 30s").
**Modell:** PrefixSpan oder Markov-Chain.
**Output:** `{trigger_event: "MQTT_DISCONNECT", predicted_sequence: [{event: "SENSOR_TIMEOUT", expected_in_s: 5, probability: 0.80}]}`
**Wann:** Nach Phase 1 + einige Wochen Log-Historie.

#### 3.2.5 Predictive Failure Detection

**Was:** Warnt bevor ein Fehler auftritt (z.B. RSSI sinkt -> WiFi-Verlust wahrscheinlich).
**Modell:** Prophet, DeepAR, oder kleines LSTM auf Prometheus-Metriken.
**Output:** `{metric: "esp32_01_rssi", current: -72, predicted_5min: -85, alert: "WiFi-Verlust wahrscheinlich in ~3min"}`
**Wann:** Fruehestens Monat 2-3 (braucht Metriken + Ausfaelle).

#### 3.2.6 Metrik-Korrelation

**Was:** Findet automatisch Metrik-Zusammenhaenge ("PostgreSQL-Query > 200ms -> Frontend-Error-Rate steigt 10s spaeter").
**Modell:** Granger-Kausalitaet, Dynamic Time Warping. Batch-Job (stuendlich).
**Output:** Abhaengigkeitskarte des Systems in Grafana als Heatmap.
**Wann:** Nach Phase 1 + 2-4 Wochen Prometheus-Daten.

#### 3.2.7 Log-Clustering

**Was:** Gruppiert Logs automatisch nach Aehnlichkeit. Entdeckt neue Fehlerklassen.
**Modell:** DBSCAN/HDBSCAN auf Sentence-BERT Embeddings. Taeglicher Batch-Job.
**Output:** Neue Cluster-Vorschlaege zur Aufnahme in PATTERNS.yaml.
**Wann:** Nach Phase 1 (braucht nur Log-Historie).

#### 3.2.8 Drift Detection

**Was:** Erkennt schleichende Verhaltensaenderungen (z.B. Sensor-Update-Rate sinkt ueber Wochen).
**Modell:** Page-Hinkley, ADWIN auf Metriken-Streams.
**Output:** `{metric: "el_servador_response_time", drift_detected: true, baseline_mean: 45ms, current_mean: 68ms, drift_since: "2026-03-15"}`
**Wann:** Nach Phase 2 (braucht stabile Baseline).

### 3.3 Zusammenspiel der Methoden

| Frage | Methode |
|-------|---------|
| "Was ist das fuer ein Fehler?" | Log-Klassifikation (3.2.1) |
| "Ist das normal?" | Anomalie-Erkennung (3.2.2) |
| "Welche Container haengen zusammen?" | Cross-Layer-Korrelation (3.2.3) |
| "Was kommt als naechstes?" | Sequenz-Pattern-Mining (3.2.4) |
| "Wird etwas bald ausfallen?" | Predictive Failure (3.2.5) |
| "Welche Metriken beeinflussen sich?" | Metrik-Korrelation (3.2.6) |
| "Gibt es unbekannte Fehlertypen?" | Log-Clustering (3.2.7) |
| "Hat sich etwas schleichend veraendert?" | Drift Detection (3.2.8) |

### 3.4 Empfohlene Reihenfolge auf dem Jetson

1. **Sofort:** Log-Klassifikation + Anomalie-Erkennung (bekannte + unbekannte Fehler)
2. **Nach 2-4 Wochen:** Log-Clustering + Sequenz-Pattern-Mining (Katalog erweitern, Kaskaden)
3. **Nach 1-2 Monaten:** Cross-Layer-Korrelation + Metrik-Korrelation (systemweites Verstaendnis)
4. **Nach 2-3 Monaten:** Predictive Failure + Drift Detection (proaktive Ueberwachung)

Alle 8 Modelle zusammen: ~2-3 GB RAM. Bei 8 GB Gesamtspeicher bleiben 5 GB Headroom.

### 3.5 Integration in Grafana

Alle ML-Ergebnisse fliessen via MQTT zurueck an El Servador:
- Topic: `kaiser/god/ml/{method}/results` (konsistent mit bestehendem Topic-Schema)
- El Servador persistiert Ergebnisse und exponiert als Prometheus-Metriken
- Dediziertes "ML Debug Assistant" Dashboard in Grafana

### Ergebnis Phase 3

Jetson laeuft 24/7 als intelligenter Debug-Assistent. Erkennt bekannte Fehler, warnt bei Anomalien, sagt Folgefehler vorher, entdeckt neue Fehlerklassen, bemerkt schleichende Drift.

---

## Zeitliche Einordnung

| Phase | Dauer | Abhaengig von | Status |
|-------|-------|---------------|--------|
| Phase 1a - Monitoring Stack Basis | 2-4 Wochen | - | **DONE** |
| Phase 1b - Monitoring Erweiterung | 1-2 Wochen | Phase 1a | TODO |
| Phase 2 - Alerting & Wissensbasis | 2-3 Wochen + fortlaufend | Phase 1 | TEILWEISE DONE |
| Phase 2.5 - Workflow-Professionalisierung | 2-3 Wochen | Parallel zu Phase 2 | TODO |
| Phase 3a - Jetson Setup + Basis-ML | 2-3 Wochen | Phase 1+2, Hardware | TODO |
| Phase 3b - Erweiterte ML-Methoden | 4-8 Wochen, schrittweise | Phase 3a + Daten-Historie | TODO |

---

## Deliverables pro Phase

### Phase 1b (TODO)

- MQTT Debug-Topic Handler (`kaiser/god/esp/{esp_id}/system/debug`) in Firmware + El Servador
- Log-Panel Dashboard + Korrelations-View in Grafana
- (Bereits erledigt: cAdvisor, esp32-serial-logger, MQTT/WS/DB-Metriken in `metrics.py`; ser2net/socat auf Host bleibt Voraussetzung fuer ESP→Loki)

### Phase 2 (TODO)

- Fehlermuster-Katalog (`.claude/reference/errors/PATTERNS.yaml`)
- Grafana Recording Rules (LogQL-Metriken)
- Label-Taxonomie-Dokument
- Fehlende Alert Rules (WS Lost, Container Restart, Reconnect Loop)
- Alert Contact Point (Webhook -> Frontend)

### Phase 2.5 (TODO)

- Auftrags-Templates (TM Knowledge Base)
- Pipeline-Dokumentation (3 Stufen)
- Report-Format-Spezifikation
- Agent-Updates (Chain-Awareness, Report-Discovery)
- TM Knowledge Base Update

### Phase 3a (TODO, Hardware-abhaengig)

- Jetson Orin Nano Super Setup (JetPack, Docker, Netzwerk)
- Log-Klassifikator Container
- Anomalie-Erkennungs-Container
- MQTT-Anbindung an Hauptserver (`kaiser/god/ml/*/results`)
- Grafana ML-Dashboard

### Phase 3b (TODO)

- Sequenz-Pattern-Mining Container
- Cross-Layer-Korrelation Container
- Log-Clustering Batch-Job
- Metrik-Korrelation Batch-Job
- Predictive Failure Container
- Drift Detection Container

---

## verify-plan Korrekturen (eingearbeitet)

| # | Original (TM) | Korrektur | Grund |
|---|---------------|-----------|-------|
| 1 | `ao/devices/{device_id}/debug` | `kaiser/god/esp/{esp_id}/system/debug` | Bestehendes Topic-Schema nutzt `kaiser/` Prefix |
| 2 | Labels `layer`/`service` | `compose_service`, `container`, `level`, `logger`, `component` | Alloy (Promtail-Format) bereits mit Docker SD Labels konfiguriert |
| 3 | `/metrics` Endpoint | `/api/v1/health/metrics` | prometheus-fastapi-instrumentator konfiguriert |
| 4 | Phase 1 als Zukunft | Phase 1a DONE, Phase 1b TODO | ~60-70% bereits implementiert |
| 5 | PATTERNS.yaml Pfad | `.claude/reference/errors/PATTERNS.yaml` | Korrekt, ERROR_CODES.md existiert bereits dort |
| 6 | `system-manager` Agent | `system-control` | system-manager wurde konsolidiert (Git: 64f5686) |
| 7 | Debug-Agents schreiben Katalog | Read-Only Zugriff | Debug-Agents haben nur Read/Grep/Glob |
| 8 | `ao/ml/{method}/results` | `kaiser/god/ml/{method}/results` | Konsistenz mit bestehendem Topic-Schema |

---

## verify-plan Full-Stack (2026-02-13) – echte Configs

Abgleich gegen `docker-compose.yml`, `docker/alloy/config.alloy` (native River syntax), `docker/prometheus/prometheus.yml`, `El Servador/.../core/metrics.py`, `docker/grafana/provisioning/alerting/alert-rules.yml`.

| # | Im Plan / Doku | Im System | Aenderung im Dokument |
|---|----------------|-----------|------------------------|
| 9 | cAdvisor TODO | cAdvisor Service in docker-compose (Profile monitoring), Port 8080; Prometheus scraped cadvisor:8080 | Phase 1.4 + Ergebnis Phase 1: cAdvisor als DONE gefuehrt |
| 10 | ser2net-Container | Service heisst `esp32-serial-logger` (Profile: hardware), verbindet zu Host (SERIAL_HOST:SERIAL_PORT), baut nicht ser2net im Container | 1.2 B) auf esp32-serial-logger umgestellt, Voraussetzung Host-Bridge erlaeutert |
| 11 | ESP hat keine Loki-Anbindung | Alloy Stage 4 scraped `esp32-serial-logger`-Container, Labels level/device/component; ESP-Logs in Loki wenn Hardware-Profil + Host-Bridge | 1.1 Alloy-Pipeline + 1.2 B) ergaenzt (ESP→Loki) |
| 12 | Nur 4 Prometheus-Jobs | 7 Jobs: el-servador, postgres, prometheus, mqtt-broker, cadvisor, loki, alloy | 1.4 Scrape-Config vollstaendig aufgelistet |
| 13 | MQTT/WS/DB-Metriken TODO | metrics.py: god_kaiser_mqtt_messages_total, god_kaiser_mqtt_errors_total, god_kaiser_websocket_connections, god_kaiser_db_query_duration_seconds | 1.4 Custom-Metriken-Tabelle erweitert, TODO-Block entfernt |
| 14 | Metrikname websocket_connections_active | Code: `god_kaiser_websocket_connections` | 1.4 exakter Name eingetragen |
| 15 | 5 Alert Rules | 7 Rules: zusaetzlich ao-loki-down, ao-alloy-down, ao-high-mqtt-error-rate; ESP-Offline-Formel: 50% offline + esp_online>0 | 2.1 Tabelle auf 7 Rules erweitert, Bedingungen angepasst |
| 16 | Grafana Dashboard-Pfad | `docker/grafana/provisioning/dashboards/system-health.json` + dashboards.yml | 1.3 bereits korrekt; Ergebnis Phase 1 Pfad explizit genannt |
