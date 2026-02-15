# Auftrag 1: Grafana Dashboard-Panels reparieren (Prometheus-Queries)

**Datum:** 2026-02-09
**Agent:** @server-dev
**Priorität:** KRITISCH
**Geschätzter Aufwand:** 30-45 Minuten
**Typ:** Code-Änderung (JSON-Datei)

---

## WORUM GEHT ES

Das Grafana Dashboard "AutomationOne - System Health" zeigt **3 von 6 Panels als "No data"** an, obwohl die Services laufen. Das Problem: Die Panels referenzieren Prometheus-Jobs (`mqtt-broker`, `postgres`, `el-frontend`) die in `prometheus.yml` nicht als Scrape-Targets definiert sind.

**Warum ist das kritisch:**
- Dashboard ist das zentrale Monitoring-Interface
- 50% der Prometheus-Panels sind nutzlos
- User sehen keine MQTT/DB/Frontend-Status-Information
- Falscher Eindruck von "Services down"

**Root Cause:** Dashboard wurde erstellt bevor Prometheus-Config finalisiert wurde, oder von einem Template mit mehr Targets kopiert.

---

## WAS MUSS ANALYSIERT WERDEN

### Phase A: Vollständige IST-Analyse (15 Min)

**1. Dashboard-Datei verstehen**

Datei: `docker/grafana/provisioning/dashboards/system-health.json`

**Lesen und dokumentieren:**
- Wie viele Panels gibt es? (Erwartet: 6)
- Welche Datasources werden genutzt? (Prometheus, Loki)
- Welche Panels nutzen Prometheus? (Erwartet: Panels 1-4)
- Welche Prometheus-Queries werden verwendet?
- Welche davon funktionieren, welche nicht?

**2. Prometheus-Config abgleichen**

Datei: `docker/prometheus/prometheus.yml`

**Prüfen:**
- Welche `job_name` sind definiert? (Erwartet: `el-servador`, `prometheus`)
- Welche Targets werden gescrapt? (Erwartet: `el-servador:8000`, `localhost:9090`)
- Sind die Dashboard-Jobs (`mqtt-broker`, `postgres`, `el-frontend`) vorhanden? (Erwartet: NEIN)

**3. Verfügbare Metriken identifizieren**

**Prometheus live abfragen (wenn Stack läuft):**
```bash
curl -s http://localhost:9090/api/v1/label/__name__/values | jq '.data[]' | grep god_kaiser
```

**Erwartete Metriken:**
- `god_kaiser_uptime_seconds`
- `god_kaiser_mqtt_connected` (0 oder 1) ← **WICHTIG für Panel 2**
- `god_kaiser_esp_total`
- `god_kaiser_esp_online`
- `god_kaiser_esp_offline`
- `god_kaiser_cpu_percent` (falls psutil verfügbar)
- `god_kaiser_memory_percent` (falls psutil verfügbar)

**Dokumentieren in Analyse-Report:**
- Welche Metrik passt zu welchem Panel-Intent?
- Gibt es Lücken? (z.B. keine DB-Metriken verfügbar)

**4. Loki-Queries evaluieren (für Fallback-Lösung)**

Für Panels wo keine Prometheus-Metrik existiert (DB, Frontend), kann Loki als "Heartbeat-Indikator" dienen:

**Test-Queries:**
```bash
# DB-Container loggt?
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="postgres"} [1m])'

# Frontend-Container loggt?
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="el-frontend"} [1m])'
```

**Logik:** Wenn Container Logs produziert, läuft er. `count > 0` = alive.

---

## WIE SOLL GEARBEITET WERDEN

### Phase B: Lösungsplan erstellen (10 Min)

**Für jedes broken Panel entscheiden:**

| Panel | Aktuell | Option A | Option B | Option C |
|-------|---------|----------|----------|----------|
| 2. MQTT Broker | `up{job="mqtt-broker"}` | `god_kaiser_mqtt_connected` | Loki-Heartbeat | mosquitto_exporter (später) |
| 3. Database | `up{job="postgres"}` | Loki-Heartbeat | postgres_exporter (später) | - |
| 4. Frontend | `up{job="el-frontend"}` | Loki-Heartbeat | Frontend-Metrics (später) | - |

**TM-Empfehlung (aus Report):**
- Panel 2: **Option A** (Prometheus `god_kaiser_mqtt_connected` bereits vorhanden!)
- Panel 3: **Option B** (Loki-Heartbeat, später postgres_exporter)
- Panel 4: **Option B** (Loki-Heartbeat, später Frontend-Metrics)

**Begründung:**
- Panel 2 kann sofort mit vorhandener Metrik repariert werden
- Panels 3+4: Keine Prometheus-Metriken verfügbar, Loki ist akzeptabler Fallback
- Exporters sind Phase 4 (separate Implementation)

**Dokumentieren im Plan:**
- Welche Query wird verwendet
- Warum diese Lösung (technische Begründung)
- Was sind die Limitationen (z.B. Loki zeigt nur "loggt" nicht "healthy")

### Phase C: Implementation (15-20 Min)

**1. Dashboard-JSON öffnen**

`docker/grafana/provisioning/dashboards/system-health.json`

**Grafana-Dashboard-JSON-Struktur verstehen:**
```json
{
  "dashboard": {
    "panels": [
      {
        "id": 1,
        "title": "Server Health Status",
        "targets": [
          {
            "expr": "up{job=\"el-servador\"}",  // ← Prometheus-Query
            "datasource": {"type": "prometheus", "uid": "prometheus"}
          }
        ],
        "type": "stat"
      }
    ]
  }
}
```

**2. Panel 2 (MQTT Broker) ändern**

**VORHER:**
```json
{
  "id": 2,
  "title": "MQTT Broker Status",
  "targets": [
    {
      "expr": "up{job=\"mqtt-broker\"}",
      "datasource": {"type": "prometheus", "uid": "prometheus"}
    }
  ]
}
```

**NACHHER:**
```json
{
  "id": 2,
  "title": "MQTT Broker Status",
  "targets": [
    {
      "expr": "god_kaiser_mqtt_connected",
      "datasource": {"type": "prometheus", "uid": "prometheus"}
    }
  ]
}
```

**Erklärung:**
- `god_kaiser_mqtt_connected` gibt 0 (disconnected) oder 1 (connected) zurück
- Wird vom Server-Metrics-Endpoint bereitgestellt
- Stat-Panel zeigt dann "0" oder "1" an

**Optional: Panel-Threshold anpassen (wenn vorhanden):**
```json
"fieldConfig": {
  "defaults": {
    "thresholds": {
      "steps": [
        {"color": "red", "value": 0},    // 0 = rot (disconnected)
        {"color": "green", "value": 1}   // 1 = grün (connected)
      ]
    }
  }
}
```

**3. Panel 3 (Database) ändern**

**NACHHER:**
```json
{
  "id": 3,
  "title": "Database Status",
  "targets": [
    {
      "expr": "count_over_time({compose_service=\"postgres\"} [1m]) > 0",
      "datasource": {"type": "loki", "uid": "loki"}
    }
  ],
  "type": "stat"
}
```

**KRITISCH:** Datasource-Typ ändert sich von `prometheus` zu `loki`!

**Erklärung:**
- Loki-Query zählt Log-Lines vom postgres-Container in letzter Minute
- Wenn `> 0`: Container produziert Logs → läuft
- Limitierung: Zeigt nur "loggt", nicht "healthy" (aber besser als "No data")

**4. Panel 4 (Frontend) ändern**

**Analog zu Panel 3:**
```json
{
  "id": 4,
  "title": "Frontend Status",
  "targets": [
    {
      "expr": "count_over_time({compose_service=\"el-frontend\"} [1m]) > 0",
      "datasource": {"type": "loki", "uid": "loki"}
    }
  ],
  "type": "stat"
}
```

**5. JSON-Syntax validieren**

**KRITISCH:** JSON muss valid bleiben!

**Prüfen:**
- Alle öffnenden `{` haben ein schließendes `}`
- Alle öffnenden `[` haben ein schließendes `]`
- Keine Kommas vor `}` oder `]`
- Strings in `"` Anführungszeichen
- Backslashes escapen: `\"` für Quotes in Queries

**Tool-Empfehlung:**
```bash
# JSON-Validierung
cat docker/grafana/provisioning/dashboards/system-health.json | jq . > /dev/null
# Kein Output = valid, Fehler-Message = invalid
```

---

## WO IM SYSTEM

### Dateipfade

| Datei | Zweck | Änderung |
|-------|-------|----------|
| `docker/grafana/provisioning/dashboards/system-health.json` | Dashboard-Definition | **ÄNDERN** (Panels 2-4) |
| `docker/prometheus/prometheus.yml` | Prometheus-Config | **LESEN** (zur Analyse) |
| `docker/grafana/provisioning/datasources/datasources.yml` | Datasource-UIDs | **LESEN** (zur Verifizierung) |

### Container-Interaktion

**Grafana lädt Dashboards beim Start:**
- Dashboard-JSON wird via Bind-Mount eingelesen
- Änderungen brauchen Container-Restart um aktiv zu werden

**Nach Änderung:**
```bash
docker compose --profile monitoring restart grafana
```

ODER wenn Hot-Reload gewünscht (experimentell):
```bash
curl -X POST http://admin:admin@localhost:3000/api/admin/provisioning/dashboards/reload
```

---

## ERFOLGSKRITERIUM

### Technische Verifikation

**1. JSON-Syntax**
```bash
jq . docker/grafana/provisioning/dashboards/system-health.json > /dev/null
# Exit-Code 0 = valid
```

**2. Grafana Container startet**
```bash
docker compose --profile monitoring restart grafana
docker logs automationone-grafana --tail 50 | grep -i error
# Keine Errors = OK
```

**3. Dashboard lädt**
- Browser: http://localhost:3000
- Login: admin / (password aus .env)
- Navigate: Dashboards → AutomationOne → System Health
- **Alle 6 Panels zeigen Daten** (keine "No data" mehr)

**4. Panel-Funktionalität**

| Panel | Erwartetes Verhalten |
|-------|---------------------|
| 1. Server Health | Zeigt "1" (grün) wenn el-servador läuft |
| 2. MQTT Broker | Zeigt "1" (grün) wenn MQTT connected, "0" (rot) wenn disconnected |
| 3. Database | Zeigt Zahl > 0 wenn postgres loggt |
| 4. Frontend | Zeigt Zahl > 0 wenn el-frontend loggt |
| 5. Log Volume | Zeigt Zeitreihe mit Log-Counts pro Service |
| 6. Error Logs | Zeigt Log-Einträge mit Error/Exception |

### Semantische Verifikation

**Panel 2 testen:**
1. MQTT-Broker stoppen: `docker compose stop mqtt-broker`
2. Warte 30s (Server erkennt Disconnect)
3. Dashboard: Panel 2 sollte "0" (rot) zeigen
4. MQTT-Broker starten: `docker compose start mqtt-broker`
5. Warte 30s (Server reconnected)
6. Dashboard: Panel 2 sollte "1" (grün) zeigen

---

## STRUKTUR & PATTERN

### Grafana-Dashboard-JSON-Pattern

**AutomationOne folgt Grafana-Standard-Provisionierung:**

1. **Statische JSON-Dateien** (nicht API-generiert)
2. **Provisioning-basiert** (nicht manuell erstellt)
3. **Version in Git** (Dashboard-as-Code)

**Konventionen einhalten:**
- UID bleibt unverändert (`automationone-system-health`)
- Panel-IDs bleiben unverändert (1-6)
- Panel-Titel beschreibend
- Datasource-UIDs nutzen (`prometheus`, `loki`) statt IDs

### Prometheus vs Loki Query-Syntax

**Prometheus (PromQL):**
```
metric_name{label="value"}
metric_name > 0
rate(metric_name[5m])
```

**Loki (LogQL):**
```
{label="value"}
{label="value"} |~ "regex"
count_over_time({label="value"} [1m])
```

**NICHT mischen!** Prometheus-Datasource = PromQL, Loki-Datasource = LogQL.

---

## REPORT ZURÜCK AN TM

**Datei:** `.technical-manager/inbox/agent-reports/server-dev-grafana-panels-2026-02-09.md`

**Struktur:**

```markdown
# Grafana Dashboard-Panels Reparatur

## Analyse-Findings
- Dashboard-JSON: [Zeilen, Panels, Datasources]
- Prometheus-Config: [Jobs, Targets]
- Verfügbare Metriken: [Liste]
- Broken Panels: [2, 3, 4 Details]

## Lösungsplan
- Panel 2: [Query, Begründung]
- Panel 3: [Query, Begründung]
- Panel 4: [Query, Begründung]

## Implementierung
- Änderungen: [Zeilen-Diffs]
- JSON-Validierung: [OK/Fehler]
- Limitationen: [Was fehlt noch]

## Verifikation
- Container-Restart: [OK/Fehler]
- Dashboard lädt: [OK/Fehler]
- Panel-Tests: [1-6 Status]
- MQTT-Disconnect-Test: [Durchgeführt/Ergebnis]

## Nächste Schritte
- Exporters implementieren für native Prometheus-Metriken
- postgres_exporter: DB-Health statt Loki-Heartbeat
- mosquitto_exporter: MQTT-Broker-Stats
```

---

## KRITISCHE HINWEISE

### JSON-Editierung

**VORSICHT:**
- Grafana-Dashboard-JSON ist GROSS (~400+ Zeilen)
- Viele verschachtelte Objekte
- Ein fehlendes Komma bricht das Dashboard

**Best Practice:**
1. Backup erstellen: `cp system-health.json system-health.json.bak`
2. Änderung machen
3. JSON validieren: `jq . system-health.json`
4. Erst committen wenn validiert

### Datasource-UID-Konsistenz

`datasource: {"uid": "prometheus"}` muss mit `datasources.yml` übereinstimmen:

```yaml
datasources:
  - name: Prometheus
    uid: prometheus  # ← Diese UID
```

Wenn falsch: Panel zeigt "Data source not found".

### Loki-Query-Limitationen

**Loki-Heartbeat ist KEIN Healthcheck!**

Was Loki zeigt:
- Container produziert Logs → läuft wahrscheinlich
- Container produziert keine Logs → läuft vielleicht trotzdem (z.B. idle)

Echte Healthchecks brauchen:
- postgres_exporter: Nutzt `pg_isready` und DB-Stats
- Frontend: Metrics-Endpoint (später implementieren)

**Dokumentiere diese Limitierung im Report.**

---

## ZUSAMMENFASSUNG

**Was wird gemacht:**
- 3 Dashboard-Panels von broken auf funktional ändern
- Panel 2: Prometheus `god_kaiser_mqtt_connected` nutzen
- Panels 3+4: Loki-Heartbeat-Queries nutzen

**Warum:**
- Dashboard ist zentrales Monitoring-Interface
- Aktuell 50% nutzlos
- User brauchen MQTT/DB/Frontend-Status

**Wie:**
- JSON-Datei editieren (Queries ändern)
- Datasource-Typ anpassen (Prometheus → Loki für 3+4)
- JSON validieren, Container restarten, testen

**Erwartung:**
- 6/6 Panels funktional
- Limitationen dokumentiert
- Basis für spätere Exporter-Integration
