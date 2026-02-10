# Auftrag 4: Promtail Healthcheck-Log-Filterung

**Datum:** 2026-02-09
**Agent:** @system-control
**Priorität:** HOCH
**Geschätzter Aufwand:** 30-40 Minuten
**Typ:** Config-Änderung (promtail-config.yml)

---

## WORUM GEHT ES

Prometheus scrapt den el-servador Metrics-Endpoint **alle 15 Sekunden**. Jeder Scrape erzeugt einen Log-Eintrag im Server:

```
INFO: GET /api/v1/health/metrics HTTP/1.1 200 OK
```

**Das Problem:**
- 4 Scrapes/Minute × 60 Minuten = **240 Healthcheck-Logs/Stunde**
- 240/h × 24h = **5.760 Healthcheck-Logs/Tag**
- Diese Logs sind **operativ irrelevant** (Healthchecks sind erwartet, kein Informationswert)
- Aktuell: ~46.000 Logs/h, davon ~2.400 (5,2%) Healthchecks

**Warum ist das kritisch:**
- Log-Volume unnötig hoch (→ Loki-Storage)
- Erschwert Debugging (Signal-Rausch-Verhältnis)
- Query-Performance (mehr Daten durchsuchen)
- Kosten (Loki speichert und indexiert alles)

**Lösung:** Promtail kann Logs **filtern** bevor sie an Loki gesendet werden (Drop-Stage).

---

## WAS MUSS ANALYSIERT WERDEN

### Phase A: Vollständige IST-Analyse (15 Min)

**1. Aktuelles Log-Volumen verstehen**

**Live-Analyse (wenn Stack läuft):**

```bash
# Gesamt-Log-Volumen (letzte Stunde)
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=sum(count_over_time({compose_service="el-servador"} [1h]))' \
  | jq -r '.data.result[0].value[1]'
# Erwartung: ~43.000-45.000

# Healthcheck-Logs isolieren
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="el-servador"} |~ "/api/v1/health/metrics" [1h])' \
  | jq -r '.data.result[0].value[1]'
# Erwartung: ~2.400 (240/h × 1h)

# Prozentsatz berechnen
echo "scale=2; (2400 / 43000) * 100" | bc
# Erwartung: ~5.58%
```

**Dokumentieren:**
- Gesamt-Log-Volume: [Zahl]
- Healthcheck-Logs: [Zahl]
- Prozentsatz: [%]
- Andere Healthchecks? (Grafana → Prometheus, Loki /ready, etc.)

**2. Healthcheck-Patterns identifizieren**

**Log-Beispiele sammeln:**

```bash
# Server-Logs (Healthcheck-Requests)
docker logs automationone-server --tail 1000 | grep health

# Typische Patterns:
# "GET /api/v1/health/metrics HTTP/1.1" - Prometheus
# "GET /api/v1/health/live HTTP/1.1" - Docker Healthcheck
# "GET /api/v1/health/ready HTTP/1.1" - Kubernetes (falls deployed)
```

**Dokumentieren:**
- Welche URLs sind Healthchecks? (Liste)
- Wie oft pro Minute? (Frequenz)
- Log-Format: JSON oder Plain-Text?

**Beispiel Server-Log (JSON):**
```json
{
  "level": "info",
  "timestamp": "2026-02-09T10:30:15.123Z",
  "message": "GET /api/v1/health/metrics HTTP/1.1 200 OK",
  "request_id": "...",
  "duration_ms": 12
}
```

**3. Promtail-Pipeline verstehen**

Datei: `docker/promtail/config.yml`

**Aktuelle Pipeline:**
```yaml
pipeline_stages:
  - docker: {}  # Nur Docker-Log-Format-Parsing
```

**Erklärung:**
- `docker: {}` parsed Docker JSON-Log-Wrapper
- Extrahiert `log`, `stream`, `time` aus Docker-JSON
- Macht NICHTS mit dem eigentlichen Log-Inhalt

**Was fehlt:**
- Kein `drop` Stage (Logs filtern)
- Kein `match` Stage (Pipeline nur für bestimmte Services)
- Kein `json` Stage (Server-JSON-Logs parsen)

**4. Filter-Optionen evaluieren**

| Option | Beschreibung | Pro | Contra |
|--------|--------------|-----|--------|
| **A: Drop in Promtail** | Logs vor Loki filtern | Spart Loki-Storage, Ingestion, Indexing | Logs komplett weg (nicht wiederherstellbar) |
| **B: Drop in Loki** | Loki-seitiges Filtering | Logs bleiben in Promtail-Cache | Trotzdem an Loki gesendet (Bandwidth) |
| **C: Server-seitiges Filtering** | Server loggt Healthchecks nicht | Quelle eliminieren | Code-Änderung nötig, andere Healthchecks bleiben |
| **D: Nichts tun** | Status quo | Keine Änderung | Log-Volume bleibt hoch |

**TM-Empfehlung (aus Report):** **Option A (Drop in Promtail)** – Standard-Lösung, effizient, Promtail ist dafür designed.

---

## WIE SOLL GEARBEITET WERDEN

### Phase B: Lösungsplan erstellen (10 Min)

**Lösung: Drop-Stage in Promtail-Pipeline**

**Strategie:**
1. Pipeline erweitern: `docker` → `drop` → `output`
2. Drop-Regex: Match auf `/api/v1/health/metrics`
3. Optional: Weitere Healthchecks filtern (`/health/live`, `/health/ready`)

**Drop-Stage-Syntax (Promtail):**
```yaml
pipeline_stages:
  - docker: {}  # Bestehend: Docker-Log-Parsing

  - drop:  # NEU: Filter-Stage
      source: ""  # Leerer String = gesamte Log-Zeile
      expression: ".*GET /api/v1/health/metrics.*"  # Regex
```

**Erklärung:**
- `source: ""` bedeutet: Nutze die komplette Log-Zeile (nicht nur ein Label)
- `expression` ist ein **Regex** (nicht LogQL!)
- Wenn Regex matched → Log wird **gedropped** (nicht an Loki gesendet)
- Wenn Regex nicht matched → Log geht normal zu Loki

**Erweiterte Version (mehrere Healthchecks):**
```yaml
pipeline_stages:
  - docker: {}

  - drop:
      source: ""
      expression: ".*(GET /api/v1/health/metrics|GET /api/v1/health/live|GET /api/v1/health/ready).*"
      # Regex mit OR-Operator (|) für mehrere Patterns
```

**Alternative: Service-spezifisch filtern**

Falls andere Services auch Healthchecks haben (Grafana, Prometheus), sollte Filtering **nur für el-servador** aktiv sein:

```yaml
pipeline_stages:
  - docker: {}

  - match:  # Nur für el-servador
      selector: '{compose_service="el-servador"}'
      stages:
        - drop:
            source: ""
            expression: ".*/api/v1/health/.*"
```

**TM-Empfehlung:** Service-spezifisches Filtering nutzen (sauberer, sicherer).

---

## WO IM SYSTEM

### Dateipfade

| Datei | Zweck | Änderung |
|-------|-------|----------|
| `docker/promtail/config.yml` | Promtail-Pipeline | **ÄNDERN** (pipeline_stages erweitern) |

### Promtail-Pipeline-Architektur

**Promtail verarbeitet Logs in Stages:**

```
Docker-Log → [docker] → [match?] → [drop?] → [json?] → [labels?] → Loki
```

**Aktuelle Pipeline:**
```
Docker-Log → [docker] → Loki
```

**Neue Pipeline:**
```
Docker-Log → [docker] → [match: el-servador] → [drop: healthchecks] → Loki
```

**Wichtig:** Stage-Reihenfolge ist relevant!
- `docker` MUSS zuerst (parsed Docker JSON)
- `match` vor `drop` (Service-Filter vor Content-Filter)
- `drop` vor `json` (keine CPU für Parsing von Logs die eh gedropped werden)

---

## ERFOLGSKRITERIUM

### Technische Verifikation

**1. YAML-Syntax**
```bash
# Promtail-Config validieren
docker compose --profile monitoring config | grep -A20 "promtail:"
# Prüfen ob pipeline_stages korrekt erscheint
```

**2. Container startet**
```bash
docker compose --profile monitoring restart promtail
docker logs automationone-promtail --tail 50 | grep -i error
# Keine Pipeline-Errors
```

**3. Healthcheck-Logs verschwinden aus Loki**

**Test-Prozedur:**

```bash
# 1. Baseline: Healthcheck-Count VOR Filterung
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="el-servador"} |~ "/api/v1/health/metrics" [5m])' \
  | jq -r '.data.result[0].value[1]'
# Erwartung: ~20 (4/min × 5 min)

# 2. Promtail neustarten (mit neuer Config)
docker compose --profile monitoring restart promtail

# 3. Warte 5 Minuten (neue Logs sammeln)
sleep 300

# 4. Healthcheck-Count NACH Filterung
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="el-servador"} |~ "/api/v1/health/metrics" [5m])' \
  | jq -r '.data.result[0].value[1]'
# Erwartung: 0 oder sehr niedrig (nur alte Logs aus Cache)
```

**4. Normale Logs bleiben erhalten**

```bash
# Andere Server-Logs sollten noch da sein
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="el-servador"} |~ "POST|PUT|DELETE" [5m])' \
  | jq -r '.data.result[0].value[1]'
# Sollte > 0 sein (normale API-Calls)
```

**5. Gesamt-Log-Volume reduziert**

```bash
# VOR Filterung: ~46k Lines/h
# NACH Filterung: ~43.6k Lines/h (-5.2%)

# Live-Check
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=sum(rate({compose_service="el-servador"}[5m])) * 3600' \
  | jq -r '.data.result[0].value[1]'
# Erwartung: ~43600 (statt 46000)
```

---

## STRUKTUR & PATTERN

### Promtail-Pipeline-Pattern

**AutomationOne-Konventionen:**

1. **`docker` Stage** immer zuerst (Docker-Log-Format)
2. **`match` Stage** für Service-spezifische Pipelines
3. **`drop` Stage** für Filtering
4. **`json` Stage** für strukturierte Logs (später)
5. **`labels` Stage** für Label-Extraction (später)

**Standard-Pipeline-Template:**
```yaml
pipeline_stages:
  - docker: {}  # Docker-Log-Format parsen

  - match:  # Service-spezifisch
      selector: '{compose_service="<service>"}'
      stages:
        - drop:  # Unwanted Logs
            source: ""
            expression: "<regex>"

        - json:  # Strukturierte Logs
            expressions:
              level: level
              module: module

        - labels:  # Labels extrahieren
            level:
            module:
```

**Für diesen Auftrag:** Nur `docker` + `match` + `drop`.

### Drop-Stage-Regex-Pattern

**Best Practices:**

**DO:**
```yaml
# Spezifisch (nur Healthcheck-Endpoint)
expression: ".*/api/v1/health/metrics.*"

# Mehrere Patterns (OR)
expression: ".*(pattern1|pattern2|pattern3).*"

# Case-insensitive
expression: "(?i).*/health/.*"
```

**DON'T:**
```yaml
# Zu breit (matcht auch non-Healthcheck Logs)
expression: ".*health.*"  # FALSCH: matcht auch "server health ok"

# Ohne Anchors (kann Fehl-Matches haben)
expression: "/health/"  # Besser: ".*/health/.*"
```

### Service-Selector-Pattern

**Match-Stage Selektoren:**

```yaml
# Service-Match (Compose-Label)
selector: '{compose_service="el-servador"}'

# Container-Match
selector: '{container="automationone-server"}'

# Multi-Label-Match
selector: '{compose_service="el-servador", stream="stdout"}'

# Regex-Match
selector: '{compose_service=~"el-.*"}'  # Alle Services mit "el-" Präfix
```

**AutomationOne-Standard:** `compose_service` nutzen (konsistent mit Grafana-Dashboards).

---

## REPORT ZURÜCK AN TM

**Datei:** `.technical-manager/inbox/agent-reports/system-control-promtail-healthcheck-filter-2026-02-09.md`

**Struktur:**

```markdown
# Promtail Healthcheck-Log-Filterung

## Analyse-Findings
- Gesamt-Log-Volume: [~46k Lines/h]
- Healthcheck-Logs: [~2.4k Lines/h, 5.2%]
- Healthcheck-Patterns: [/api/v1/health/metrics, evtl. /live, /ready]
- Filter-Option gewählt: [Drop in Promtail, Begründung]

## Lösungsplan
- Pipeline-Stage: [match + drop]
- Service-Filter: [compose_service="el-servador"]
- Regex-Pattern: [.*/api/v1/health/.*]
- Erwartete Reduktion: [~2.4k Lines/h = -5.2%]

## Implementierung
- promtail/config.yml: [pipeline_stages erweitert, Code-Diff]
- Stage-Reihenfolge: [docker → match → drop]
- Regex getestet: [Beispiel-Logs, Match-Ergebnisse]

## Verifikation
- YAML-Validierung: [OK]
- Container-Start: [OK, keine Errors]
- Healthcheck-Count VOR: [Zahl]
- Healthcheck-Count NACH (5 Min): [0 oder niedrig]
- Normale Logs NACH: [> 0, bleiben erhalten]
- Gesamt-Volume NACH: [~43.6k Lines/h, -5.2%]

## Metriken
- Eingesparte Logs: [~2.4k/h × 24h = 57.6k/Tag]
- Loki-Storage-Einsparung: [~2% Retention × 7 Tage]
- Query-Performance: [Weniger Daten durchsuchen]
```

---

## KRITISCHE HINWEISE

### Regex-Testing

**WICHTIG:** Regex vor Deployment testen!

**Test-Methode:**

```bash
# Beispiel-Log-Zeilen
echo 'GET /api/v1/health/metrics HTTP/1.1 200' | grep -E '.*/api/v1/health/.*'
# Output = Match (würde gedropped)

echo 'POST /api/v1/devices HTTP/1.1 201' | grep -E '.*/api/v1/health/.*'
# Kein Output = Kein Match (bleibt erhalten)
```

**Oder mit Promtail-Tool (falls verfügbar):**
```bash
docker exec automationone-promtail \
  promtail -config.file=/etc/promtail/config.yml -dry-run
```

### Unerwartete Side-Effects

**Logs die NUR "health" erwähnen** (aber kein Healthcheck-Request) könnten fälschlich gedropped werden:

```
# Würde NICHT gedropped (kein /health/ im Pfad):
INFO: Server health check completed successfully

# Würde gedropped (enthält /health/):
ERROR: Failed to parse /api/v1/health/metrics response
```

**Lösung:** Spezifischeres Pattern:
```yaml
expression: ".*GET /api/v1/health/.*"  # Nur GET-Requests
```

### Pipeline-Performance

**Drop-Stage ist sehr effizient:**
- Regex-Match auf Log-String (schnell)
- Kein JSON-Parsing nötig
- Keine DB-Queries
- Promtail designed für High-Throughput-Filtering

**Typischer Overhead:** <1ms pro Log-Zeile

Bei 46k Lines/h = ~13 Lines/Sekunde → ~13ms/s → vernachlässigbar.

### Rollback-Strategie

**Falls Filtering zu aggressiv:**

```bash
# 1. Config rückgängig machen
git checkout docker/promtail/config.yml

# 2. Promtail restarten
docker compose --profile monitoring restart promtail

# 3. Logs kehren zurück (alte Logs nicht wiederherstellbar)
```

**Daher:** Regex-Pattern konservativ wählen (lieber zu spezifisch als zu breit).

---

## ZUSÄTZLICHE OPTIMIERUNGEN (Optional in Report erwähnen)

### Weitere filterbaren Logs

**Andere Kandidaten für Filtering:**

1. **Debug-Logs im Production:** Wenn Server auf `LOG_LEVEL=DEBUG` läuft
2. **Static-Asset-Requests:** CSS, JS, Bilder (wenn Frontend über Server served)
3. **OPTIONS-Requests:** CORS-Preflight-Requests (oft hoch-frequent)

**Empfehlung:** Erst Healthchecks filtern, dann nach Deployment evaluieren ob weitere Optimierung nötig.

### Alternative: Sampling

**Statt komplett droppen:**
```yaml
- drop:
    source: ""
    expression: ".*/api/v1/health/.*"
    rate: 0.9  # Drop 90%, behalte 10% als Sample
```

**Pro:** Sample bleibt für Debugging
**Contra:** Komplexität, nicht bei 2.4k/h nötig

**TM-Empfehlung:** Komplettes Dropping OK (Healthchecks haben keinen Debug-Wert).

---

## ZUSAMMENFASSUNG

**Was wird gemacht:**
- Promtail-Pipeline erweitern: `match` + `drop` Stages
- Service-spezifisches Filtering für el-servador
- Regex-basiertes Droppen von `/api/v1/health/` Requests

**Warum:**
- ~2.4k Healthcheck-Logs/h sind operativ irrelevant
- 5.2% des Log-Volumes → Unnötiger Loki-Storage + Indexing
- Besseres Signal-Rausch-Verhältnis für Debugging

**Wie:**
- promtail/config.yml: pipeline_stages erweitern
- Regex: `.*/api/v1/health/.*`
- Container restarten, 5-Min-Test durchführen

**Erwartung:**
- Healthcheck-Logs verschwinden aus Loki
- Normale Logs bleiben erhalten
- Log-Volume reduziert um ~5.2% (2.4k/h)
- Query-Performance verbessert
