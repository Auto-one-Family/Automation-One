# Grafana Template Variables - Analyse & Implementierungsplan

**Datum:** 2026-02-10
**Agent:** server-dev (via /server-development)
**Auftrag:** `.technical-manager/commands/pending/grafana-template-variables.md`
**Status:** Analyse abgeschlossen, Implementierungsplan erstellt

---

## A. Bestandsaufnahme (IST-Zustand)

### A.1 Dashboard-JSON Analyse

**Datei:** `docker/grafana/provisioning/dashboards/system-health.json`

| Eigenschaft | Wert |
|-------------|------|
| **UID** | `automationone-system-health` |
| **Titel** | AutomationOne - Operations |
| **schemaVersion** | 39 |
| **templating** | `{"list": []}` (leer) |
| **refresh** | `10s` |
| **Zeitfenster** | `now-1h` bis `now` |

#### Panel-Inventar (26 Panels + 5 Rows)

| ID | Titel | Typ | Row | Datasource | Rate/Count Query |
|----|-------|-----|-----|------------|------------------|
| 1 | Server | stat | 0 | prometheus | `up{job="el-servador"}` |
| 2 | MQTT | stat | 0 | prometheus | `god_kaiser_mqtt_connected` |
| 3 | Database | stat | 0 | prometheus | `pg_up` |
| 4 | Frontend Errors (5m) | stat | 0 | **loki** | `count_over_time(...[5m])` |
| 5 | ESP Online | stat | 0 | prometheus | `god_kaiser_esp_online` |
| 6 | Active Alerts | alertlist | 0 | (none) | - |
| 100 | Server Performance | **row** | 1 | - | - |
| 7 | CPU | gauge | 1 | prometheus | `god_kaiser_cpu_percent` |
| 8 | Memory | gauge | 1 | prometheus | `god_kaiser_memory_percent` |
| 9 | Uptime | stat | 1 | prometheus | `god_kaiser_uptime_seconds` |
| 10 | CPU & Memory Over Time | timeseries | 1 | prometheus | raw gauges, kein rate() |
| 101 | ESP32 Fleet | **row** | 2 | - | - |
| 11 | Total Registered | stat | 2 | prometheus | `god_kaiser_esp_total` |
| 12 | Online | stat | 2 | prometheus | `god_kaiser_esp_online` |
| 13 | Offline | stat | 2 | prometheus | `god_kaiser_esp_offline` |
| 14 | ESP Online Rate Over Time | timeseries | 2 | prometheus | Division, kein rate() |
| 102 | MQTT Traffic | **row** | 3 | - | - |
| 15 | Connected Clients | stat | 3 | prometheus | raw gauge |
| 16 | Msg/s In | stat | 3 | prometheus | **`rate(...[5m])`** |
| 17 | Msg/s Out | stat | 3 | prometheus | **`rate(...[5m])`** |
| 18 | Messages Dropped | stat | 3 | prometheus | raw gauge |
| 19 | MQTT Message Rate | timeseries | 3 | prometheus | **`rate(...[5m])` x2** |
| 103 | Database | **row** | 4 | - | - |
| 20 | Active Connections | stat | 4 | prometheus | raw gauge |
| 21 | DB Size | stat | 4 | prometheus | raw gauge |
| 22 | Deadlocks | stat | 4 | prometheus | raw gauge |
| 23 | Connections Over Time | timeseries | 4 | prometheus | raw gauge |
| 104 | Logs & Errors | **row** | 5 | - | - |
| 24 | Error Rate by Service | timeseries | 5 | **loki** | **`count_over_time(...[5m])`** |
| 25 | Log Volume by Service | timeseries | 5 | **loki** | **`count_over_time(...[5m])`** |
| 26 | Recent Error Logs | logs | 5 | **loki** | Stream-Selector |

#### Datasource-Referenzen

Alle Panels nutzen direkte UID-Referenzen (KEIN `${DS_*}` Platzhalter):
- Prometheus: `{"type": "prometheus", "uid": "prometheus"}` - Panels 1-3, 5, 7-23
- Loki: `{"type": "loki", "uid": "loki"}` - Panels 4, 24-26
- Keine Datasource: Panel 6 (alertlist)

#### Panels mit hardcoded `compose_service=`

| Panel ID | Query |
|----------|-------|
| 4 | `{compose_service="el-frontend"}` |

#### Panels mit hardcoded `compose_project=`

| Panel ID | Query |
|----------|-------|
| 24 | `{compose_project="auto-one"}` |
| 25 | `{compose_project="auto-one"}` |
| 26 | `{compose_project="auto-one"}` |

#### Panels mit `rate(...[Xm])` oder `count_over_time(...[Xm])` (festes Intervall)

| Panel ID | Typ | Query | Intervall |
|----------|-----|-------|-----------|
| 4 | stat | `count_over_time({compose_service="el-frontend"} \|~ "..." [5m])` | 5m |
| 16 | stat | `rate(broker_messages_received{job="mqtt-broker"}[5m])` | 5m |
| 17 | stat | `rate(broker_messages_sent{job="mqtt-broker"}[5m])` | 5m |
| 19 | timeseries | `rate(broker_messages_received{...}[5m])`, `rate(broker_messages_sent{...}[5m])` | 5m |
| 24 | timeseries | `count_over_time({...} \|~ "..." [5m])` | 5m |
| 25 | timeseries | `count_over_time({...} [5m])` | 5m |

#### Panels mit `$__rate_interval`

**Keine.** Kein einziges Panel nutzt `$__rate_interval`.

---

### A.2 Provisioning-Konfiguration

**Datei:** `docker/grafana/provisioning/dashboards/dashboards.yml`

| Eigenschaft | Wert | Bedeutung |
|-------------|------|-----------|
| `disableDeletion` | `true` | Dashboard kann nicht in der UI geloescht werden |
| `editable` | `true` | Dashboard kann in der UI bearbeitet werden |
| `allowUiUpdates` | nicht gesetzt (default: `false`) | UI-Aenderungen werden NICHT in die JSON-Datei zurueckgeschrieben |
| `updateIntervalSeconds` | nicht gesetzt (default: `10`) | Prueft alle 10s auf Datei-Aenderungen |
| `foldersFromFilesStructure` | `false` | Dashboard landet im Ordner "AutomationOne" |

**Konsequenz:** Aenderung der JSON-Datei wird innerhalb von ~10s automatisch im Grafana uebernommen. UI-Aenderungen gehen bei naechstem File-Reload verloren.

---

### A.3 Datasource-UIDs (verifiziert)

**Datei:** `docker/grafana/provisioning/datasources/datasources.yml`

| Datasource | Typ | UID | URL |
|------------|-----|-----|-----|
| Prometheus | `prometheus` | **`prometheus`** | `http://prometheus:9090` |
| Loki | `loki` | **`loki`** | `http://loki:3100` |

Beide UIDs stimmen exakt mit den Dashboard-Referenzen ueberein.

---

### A.4 Loki-Labels (LIVE verifiziert)

**Endpoint:** `http://localhost:3100/loki/api/v1/labels`

Verfuegbare Labels:
```
compose_project, compose_service, container, level, logger, service, service_name, stream
```

**`compose_service` Werte** (`/loki/api/v1/label/compose_service/values`):

| # | Wert |
|---|------|
| 1 | el-frontend |
| 2 | el-servador |
| 3 | grafana |
| 4 | loki |
| 5 | mosquitto-exporter |
| 6 | mqtt-broker |
| 7 | pgadmin |
| 8 | postgres |
| 9 | postgres-exporter |
| 10 | prometheus |
| 11 | promtail |

**11 Services** live in Loki vorhanden. Variable-Query wird funktionieren.

---

### A.5 Prometheus-Metriken (LIVE verifiziert)

**Scrape-Konfiguration** (`docker/prometheus/prometheus.yml`):
- Global scrape_interval: **15s**
- Global evaluation_interval: **15s**
- 4 Scrape-Jobs: `el-servador`, `postgres`, `prometheus`, `mqtt-broker`

**Metriken mit `rate()` im Dashboard:**
- `broker_messages_received` (Counter) - Panels 16, 19
- `broker_messages_sent` (Counter) - Panels 17, 19

**rate() Mindest-Range:** Bei 15s scrape_interval empfiehlt Grafana mindestens `4 * 15s = 60s = 1m` als Range. Der aktuelle Wert `[5m]` ist sicher. Das Minimum `1m` in `$interval` ist ebenfalls sicher.

**`$__rate_interval` Berechnung:** `max(4 * scrape_interval, scrape_interval + step)` = mindestens 60s. Da `$interval` Minimum auf `1m` gesetzt wird, sind beide Ansaetze aequivalent sicher.

**`esp_id` Label:** `http://localhost:9090/api/v1/label/esp_id/values` → **Leeres Array `[]`**. Kein ESP32-Device aktuell registriert. Label existiert nicht in den Prometheus-Metriken.

---

## B. Variable `$service` (Log-Filter fuer Row 5)

### B.1 Definition

```json
{
  "name": "service",
  "type": "query",
  "label": "Service",
  "datasource": {
    "type": "loki",
    "uid": "loki"
  },
  "query": {
    "label": "compose_service",
    "stream": "",
    "type": 1
  },
  "refresh": 1,
  "includeAll": true,
  "allValue": ".*",
  "multi": false,
  "current": {
    "text": "All",
    "value": "$__all"
  },
  "sort": 1,
  "hide": 0,
  "definition": ""
}
```

**Begruendung der Werte:**
- `query.type: 1` = Grafana 11.x Loki Label-Values Query (natives Format, kein Legacy-String)
- `query.stream: ""` = Kein Stream-Filter (alle Streams), liefert alle compose_service Werte
- `allValue: ".*"` = Bei "All"-Auswahl wird `compose_service=~".*"` verwendet (effizienter als 11-Werte-Regex)
- `sort: 1` = Alphabetisch aufsteigend
- `refresh: 1` = Bei Dashboard-Load (nicht bei jeder Time-Range-Aenderung)

### B.2 Betroffene Panels (Row 5: Logs & Errors)

#### Panel 24 - Error Rate by Service (timeseries)

**AKTUELLE Query:**
```logql
sum(count_over_time({compose_project="auto-one"} |~ "(?i)(error|exception|critical)" [5m])) by (compose_service)
```

**NEUE Query:**
```logql
sum(count_over_time({compose_project="auto-one", compose_service=~"$service"} |~ "(?i)(error|exception|critical)" [5m])) by (compose_service)
```

**Semantik:** Bei "All" zeigt das Panel alle Services (wie bisher). Bei Einzel-Auswahl nur den gewaehlten Service. `by (compose_service)` bleibt fuer konsistente Legend.

#### Panel 25 - Log Volume by Service (timeseries)

**AKTUELLE Query:**
```logql
sum(count_over_time({compose_project="auto-one"} [5m])) by (compose_service)
```

**NEUE Query:**
```logql
sum(count_over_time({compose_project="auto-one", compose_service=~"$service"} [5m])) by (compose_service)
```

#### Panel 26 - Recent Error Logs (logs)

**AKTUELLE Query:**
```logql
{compose_project="auto-one"} |~ "(?i)(error|exception|fail|critical)"
```

**NEUE Query:**
```logql
{compose_project="auto-one", compose_service=~"$service"} |~ "(?i)(error|exception|fail|critical)"
```

### B.3 NICHT betroffene Panels (mit Begruendung)

| Panel ID | Titel | Grund fuer Ausschluss |
|----------|-------|----------------------|
| 4 | Frontend Errors (5m) | **Row 0, nicht Row 5.** Semantisch an `el-frontend` gebunden (Titel!). Service-Variable wuerde Bedeutung verfaelschen. |
| 1-3, 5 | Server/MQTT/DB/ESP | Row 0 Stat-Panels. Prometheus-Metriken, kein compose_service Label. |
| 6 | Active Alerts | Alertlist-Panel, keine Query. |
| 7-10 | Server Performance | Row 1. Prometheus god_kaiser_* Metriken. |
| 11-14 | ESP32 Fleet | Row 2. Prometheus god_kaiser_esp_* Metriken. |
| 15-19 | MQTT Traffic | Row 3. Prometheus broker_* Metriken mit `job="mqtt-broker"`. |
| 20-23 | Database | Row 4. Prometheus pg_* Metriken. |

### B.4 Fallstrick-Check

| Check | Status | Detail |
|-------|--------|--------|
| Provisioned + Query-Variable | OK | Dashboard nutzt direkte UID-Referenzen `{"type": "loki", "uid": "loki"}`, keine `${DS_*}` Platzhalter |
| "All"-Wert mit LogQL | OK | `allValue: ".*"` erzeugt `compose_service=~".*"` → matcht alles. Alternativ wuerde Grafana `(el-frontend\|el-servador\|...)` erzeugen - auch korrekt, aber weniger effizient |
| `=~` Syntax in LogQL | OK | Stream-Selektoren in LogQL unterstuetzen `=~` (Regex-Match) nativ |
| Refresh-Strategie | OK | `refresh: 1` = bei Dashboard-Load. Service-Liste aendert sich selten (nur bei Docker-Stack-Aenderung) |

---

## C. Variable `$interval` (Zeitintervall fuer Timeseries-Panels)

### C.1 Definition

```json
{
  "name": "interval",
  "type": "interval",
  "label": "Interval",
  "query": "1m,5m,15m,30m,1h",
  "current": {
    "text": "5m",
    "value": "5m",
    "selected": true
  },
  "auto": false,
  "auto_count": 10,
  "auto_min": "1m",
  "refresh": 0,
  "hide": 0
}
```

**Begruendung der Werte:**
- `auto: false` = Kein Auto-Modus. User waehlt explizit. Einfacher, vorhersagbarer.
- `1m` als Minimum = Sicher fuer `rate()` bei 15s scrape_interval (>= 4 * 15s = 60s)
- Default `5m` = Aktueller hardcoded Wert, keine Verhaltensaenderung beim ersten Load
- `refresh: 0` = Nie refreshen (statische Werte, keine Query noetig)

### C.2 Betroffene Panels

#### Panel 19 - MQTT Message Rate (timeseries, Row 3)

**AKTUELLE Queries:**
```promql
rate(broker_messages_received{job="mqtt-broker"}[5m])
rate(broker_messages_sent{job="mqtt-broker"}[5m])
```

**NEUE Queries:**
```promql
rate(broker_messages_received{job="mqtt-broker"}[$interval])
rate(broker_messages_sent{job="mqtt-broker"}[$interval])
```

**Semantik:** User kontrolliert die Glaettung der Message-Rate-Kurve. `1m` = rauschiger/detaillierter, `1h` = glaetter.

#### Panel 24 - Error Rate by Service (timeseries, Row 5)

**AKTUELLE Query:** (nach $service-Aenderung)
```logql
sum(count_over_time({compose_project="auto-one", compose_service=~"$service"} |~ "(?i)(error|exception|critical)" [5m])) by (compose_service)
```

**NEUE Query:**
```logql
sum(count_over_time({compose_project="auto-one", compose_service=~"$service"} |~ "(?i)(error|exception|critical)" [$interval])) by (compose_service)
```

#### Panel 25 - Log Volume by Service (timeseries, Row 5)

**AKTUELLE Query:** (nach $service-Aenderung)
```logql
sum(count_over_time({compose_project="auto-one", compose_service=~"$service"} [5m])) by (compose_service)
```

**NEUE Query:**
```logql
sum(count_over_time({compose_project="auto-one", compose_service=~"$service"} [$interval])) by (compose_service)
```

### C.3 NICHT betroffene Panels (mit Begruendung)

| Panel ID | Titel | Typ | Rate/Count Query | Grund fuer Ausschluss |
|----------|-------|-----|-----------------|----------------------|
| 4 | Frontend Errors (5m) | stat | `count_over_time(...[5m])` | **Stat-Panel in Row 0.** Zeigt einen Einzelwert. Variables Intervall wuerde den angezeigten Zaehler unvorhersagbar machen. User erwartet "Fehler in den letzten 5 Minuten" als fixen Wert. |
| 10 | CPU & Memory Over Time | timeseries | Kein rate() | Raw Gauge-Metriken. Kein Intervall-Parameter in der Query. |
| 14 | ESP Online Rate Over Time | timeseries | Kein rate() | Division von Gauges. Kein Intervall-Parameter. |
| 16 | Msg/s In | stat | `rate(...[5m])` | **Stat-Panel.** Zeigt einen Einzelwert (aktuelle Rate). Fixes 5m-Fenster gibt stabilen, vergleichbaren Wert. |
| 17 | Msg/s Out | stat | `rate(...[5m])` | **Stat-Panel.** Gleiche Begruendung wie Panel 16. |
| 23 | Connections Over Time | timeseries | Kein rate() | Raw Gauge-Metrik. Kein Intervall-Parameter. |

### C.4 `$interval` vs `$__rate_interval` Empfehlung

| Aspekt | `$interval` | `$__rate_interval` |
|--------|-------------|-------------------|
| Kontrolle | User waehlt explizit | Grafana berechnet automatisch |
| Berechnung | Fester Wert (1m/5m/...) | `max(4*scrape_interval, scrape_interval+step)` |
| Vorteil | Vorhersagbar, konsistent fuer PromQL UND LogQL | Optimal fuer rate() bei variablen scrape_intervals |
| Nachteil | User muss verstehen was Intervall bedeutet | Nur fuer PromQL rate(), nicht fuer LogQL count_over_time |

**Empfehlung: `$interval` verwenden** (wie im Auftrag vorgesehen).

Begruendung:
1. `$interval` funktioniert identisch fuer PromQL `rate()` UND LogQL `count_over_time()` - konsistente Semantik ueber beide Datasources
2. Minimum `1m` >= `4 * 15s scrape_interval` - rate()-Sicherheit ist gewaehrleistet
3. `$__rate_interval` ist nur fuer PromQL definiert und wuerde in LogQL nicht funktionieren
4. Der User bekommt direkte Kontrolle ueber die Granularitaet

---

## D. Variable `$esp_id` (NUR DOKUMENTATION - NICHT IMPLEMENTIEREN)

### D.1 Machbarkeit

**Live-Pruefung:** `curl -s http://localhost:9090/api/v1/label/esp_id/values`
**Ergebnis:** `{"status":"success","data":[]}` - **Leeres Array.**

Das Label `esp_id` existiert aktuell nicht in den Prometheus-Metriken. Die god_kaiser_* Metriken (`esp_total`, `esp_online`, `esp_offline`) sind globale Zaehler ohne ESP-spezifische Labels.

**Voraussetzungen fuer spaetere Implementierung:**
1. Server muesste ESP-spezifische Metriken mit `esp_id` Label exportieren (z.B. `god_kaiser_esp_heartbeat_age{esp_id="ESP_ABC123"}`)
2. Mindestens 3+ verschiedene ESP-Devices registriert (unter 3 ist eine Variable Overengineering)
3. Metriken muessen in `prometheus.yml` bereits gescrapt werden (kein neuer Job noetig, da der el-servador Job bereits alle Metriken scrapt)

### D.2 Zukuenftige Variable-Definition (NICHT einbauen)

```json
{
  "name": "esp_id",
  "type": "query",
  "label": "ESP Device",
  "datasource": {
    "type": "prometheus",
    "uid": "prometheus"
  },
  "query": "label_values(god_kaiser_esp_heartbeat_age, esp_id)",
  "refresh": 2,
  "includeAll": true,
  "allValue": ".*",
  "multi": false,
  "current": {
    "text": "All",
    "value": "$__all"
  },
  "sort": 1,
  "hide": 0
}
```

Voraussetzung: Metrik `god_kaiser_esp_heartbeat_age` (oder aehnlich) muss mit `esp_id` Label existieren.

---

## E. JSON-Struktur des templating-Blocks

### E.1 Kompletter `templating`-Block (copy-paste-ready)

```json
"templating": {
  "list": [
    {
      "name": "service",
      "type": "query",
      "label": "Service",
      "datasource": {
        "type": "loki",
        "uid": "loki"
      },
      "query": {
        "label": "compose_service",
        "stream": "",
        "type": 1
      },
      "refresh": 1,
      "includeAll": true,
      "allValue": ".*",
      "multi": false,
      "current": {
        "text": "All",
        "value": "$__all"
      },
      "sort": 1,
      "hide": 0,
      "definition": ""
    },
    {
      "name": "interval",
      "type": "interval",
      "label": "Interval",
      "query": "1m,5m,15m,30m,1h",
      "current": {
        "text": "5m",
        "value": "5m",
        "selected": true
      },
      "auto": false,
      "auto_count": 10,
      "auto_min": "1m",
      "refresh": 0,
      "hide": 0
    }
  ]
}
```

### E.2 Positionierung im Dashboard-JSON

Der `"templating"` Block steht auf Top-Level-Ebene. Er existiert bereits (Zeile 1081-1083) als leere Liste und muss **ersetzt** werden:

```
...
  "schemaVersion": 39,          ← Zeile 1075
  "tags": [...],                ← Zeile 1076-1080
  "templating": {               ← Zeile 1081 (ERSETZEN ab hier)
    "list": [...]               ← Neuer Inhalt aus E.1
  },                            ← Zeile 1083 (bis hier)
  "time": {...},                ← Zeile 1084
...
```

---

## Panel-Aenderungsliste (komplett)

### Panels die geaendert werden (5 Panels)

| Panel ID | Titel | Aenderung |
|----------|-------|-----------|
| 19 | MQTT Message Rate | `[5m]` → `[$interval]` (2 Targets) |
| 24 | Error Rate by Service | `+compose_service=~"$service"`, `[5m]` → `[$interval]` |
| 25 | Log Volume by Service | `+compose_service=~"$service"`, `[5m]` → `[$interval]` |
| 26 | Recent Error Logs | `+compose_service=~"$service"` |

### Detail: Panel 19

**Target A - ALT:**
```json
"expr": "rate(broker_messages_received{job=\"mqtt-broker\"}[5m])"
```
**Target A - NEU:**
```json
"expr": "rate(broker_messages_received{job=\"mqtt-broker\"}[$interval])"
```

**Target B - ALT:**
```json
"expr": "rate(broker_messages_sent{job=\"mqtt-broker\"}[5m])"
```
**Target B - NEU:**
```json
"expr": "rate(broker_messages_sent{job=\"mqtt-broker\"}[$interval])"
```

### Detail: Panel 24

**Target A - ALT:**
```json
"expr": "sum(count_over_time({compose_project=\"auto-one\"} |~ \"(?i)(error|exception|critical)\" [5m])) by (compose_service)"
```
**Target A - NEU:**
```json
"expr": "sum(count_over_time({compose_project=\"auto-one\", compose_service=~\"$service\"} |~ \"(?i)(error|exception|critical)\" [$interval])) by (compose_service)"
```

### Detail: Panel 25

**Target A - ALT:**
```json
"expr": "sum(count_over_time({compose_project=\"auto-one\"} [5m])) by (compose_service)"
```
**Target A - NEU:**
```json
"expr": "sum(count_over_time({compose_project=\"auto-one\", compose_service=~\"$service\"} [$interval])) by (compose_service)"
```

### Detail: Panel 26

**Target A - ALT:**
```json
"expr": "{compose_project=\"auto-one\"} |~ \"(?i)(error|exception|fail|critical)\""
```
**Target A - NEU:**
```json
"expr": "{compose_project=\"auto-one\", compose_service=~\"$service\"} |~ \"(?i)(error|exception|fail|critical)\""
```

### Panels die NICHT geaendert werden (21 Panels + 5 Rows)

| Panel ID | Titel | Grund |
|----------|-------|-------|
| 1 | Server | Row 0 stat, Prometheus `up{}`, kein compose_service/rate |
| 2 | MQTT | Row 0 stat, Prometheus gauge, kein compose_service/rate |
| 3 | Database | Row 0 stat, Prometheus `pg_up`, kein compose_service/rate |
| 4 | Frontend Errors (5m) | Row 0 stat, semantisch an el-frontend gebunden (Titel). Fixes 5m-Fenster fuer stabilen Zaehler. |
| 5 | ESP Online | Row 0 stat, Prometheus gauge, kein compose_service/rate |
| 6 | Active Alerts | Alertlist, keine Query |
| 7 | CPU | Row 1 gauge, Prometheus gauge |
| 8 | Memory | Row 1 gauge, Prometheus gauge |
| 9 | Uptime | Row 1 stat, Prometheus gauge |
| 10 | CPU & Memory Over Time | Row 1 timeseries, raw gauges (kein rate/count_over_time) |
| 11 | Total Registered | Row 2 stat, Prometheus gauge |
| 12 | Online | Row 2 stat, Prometheus gauge |
| 13 | Offline | Row 2 stat, Prometheus gauge |
| 14 | ESP Online Rate | Row 2 timeseries, Division von Gauges (kein rate) |
| 15 | Connected Clients | Row 3 stat, Prometheus gauge |
| 16 | Msg/s In | Row 3 **stat** mit rate() - fixes 5m-Fenster fuer stabilen Einzelwert |
| 17 | Msg/s Out | Row 3 **stat** mit rate() - fixes 5m-Fenster fuer stabilen Einzelwert |
| 18 | Messages Dropped | Row 3 stat, Prometheus gauge |
| 20 | Active Connections | Row 4 stat, Prometheus gauge |
| 21 | DB Size | Row 4 stat, Prometheus gauge |
| 22 | Deadlocks | Row 4 stat, Prometheus gauge |
| 23 | Connections Over Time | Row 4 timeseries, raw gauge (kein rate) |
| 100-104 | Row-Header | Rows, keine Queries |

---

## F. Qualitaets-Checkliste

- [x] Alle Variable-Definitionen basieren auf LIVE-GETESTETEN Queries
  - Loki `compose_service` labels: 11 Werte verifiziert via `/loki/api/v1/label/compose_service/values`
  - Prometheus `esp_id`: Leeres Array verifiziert via `/api/v1/label/esp_id/values`
  - Prometheus scrape_interval: 15s verifiziert in `prometheus.yml`
- [x] Alle Datasource-UIDs stimmen mit `datasources.yml` ueberein
  - Prometheus: `uid: prometheus` ✓
  - Loki: `uid: loki` ✓
- [x] Alle betroffenen Panel-IDs stimmen mit aktueller `system-health.json` ueberein
  - Panels 19, 24, 25, 26 verifiziert (Zeilen im JSON geprueft)
- [x] Kein Panel wurde vergessen (systematische Pruefung ALLER 26 Panels + 5 Rows)
  - Jedes Panel einzeln dokumentiert in der Nicht-betroffene-Liste mit Begruendung
- [x] Kein Panel wurde faelschlicherweise einbezogen
  - Panel 4 (stat, Row 0): Bewusst ausgeschlossen trotz `count_over_time` und `compose_service` - semantisch an Frontend gebunden
  - Panels 16/17 (stat, Row 3): Bewusst ausgeschlossen trotz `rate()` - Stat-Panels brauchen fixes Fenster
- [x] `includeAll` + `=~` Syntax korrekt fuer LogQL
  - `compose_service=~"$service"` mit `allValue: ".*"` → `compose_service=~".*"` bei "All"
  - PromQL nicht betroffen ($service nur in Loki-Panels)
- [x] Default-Werte gesetzt
  - `$service`: Default "All" → Dashboard zeigt alle Services wie bisher
  - `$interval`: Default "5m" → Dashboard verhaelt sich identisch zum aktuellen Zustand
- [x] Keine Konflikte mit `$__rate_interval`
  - Kein Panel nutzt aktuell `$__rate_interval`. Kein Konflikt moeglich.
  - `$interval` Minimum `1m` >= `4 * 15s` → rate()-sicher
- [x] JSON-Syntax valide
  - Keine trailing commas, korrekte Verschachtelung, alle Strings escaped
- [x] Provisioning-Kompatibilitaet bestaetigt
  - Keine `${DS_*}` Platzhalter verwendet
  - Direkte UID-Referenzen: `{"type": "loki", "uid": "loki"}`
- [x] Refresh-Strategie dokumentiert
  - `$service`: refresh=1 (bei Dashboard-Load) - Service-Liste aendert sich selten
  - `$interval`: refresh=0 (nie) - statische Werte, keine Query

---

## Zusammenfassung

| Was | Anzahl |
|-----|--------|
| Neue Template Variables | 2 (`$service`, `$interval`) |
| Geaenderte Panels | 4 (IDs: 19, 24, 25, 26) |
| Ungeaenderte Panels | 22 (inkl. 5 Rows) |
| Dokumentierte Zukunfts-Variable | 1 (`$esp_id` - nicht implementiert) |
| Live-API-Calls durchgefuehrt | 4 (Loki labels, Loki values, Prometheus metrics, Prometheus esp_id) |

Der Plan ist implementierungsbereit. Ein Implementierer kann die JSON-Datei aendern ohne eigene Entscheidungen treffen oder Live-Endpoints abfragen zu muessen.
