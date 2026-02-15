# Report: Promtail Pipeline – Industrielles Log-Processing
# =========================================================
# Datum: 2026-02-10
# Auftrag: infra-part3-promtail-pipeline
# Status: ABGESCHLOSSEN

---

## 1. Server-Log-Format (verifiziert)

Der Server gibt **Text-Format** auf stdout aus (nicht JSON). Zwei Log-Formate koexistieren:

### Structured Text (Hauptformat)
```
2026-02-09 23:10:47 - src.services.maintenance.jobs.sensor_health - WARNING - [-] - Sensor stale: ESP MOCK_REALTIMES84JCMCU GPIO 5 (temperature) - no data for never (timeout: 180s)
```
**Pattern:** `YYYY-MM-DD HH:MM:SS - {logger} - {LEVEL} - [{request_id}] - {message}`

### Uvicorn Access Logs (Nebenformat)
```
INFO:     172.18.0.3:59152 - "GET /api/v1/health/metrics HTTP/1.1" 200 OK
```
**Pattern:** `{LEVEL}:     {IP}:{PORT} - "{METHOD} {PATH} HTTP/{VER}" {STATUS} {MSG}`

### Parser-Entscheidung
**Regex-Parser** gewählt (nicht JSON), weil stdout Text-Format ist. Der Regex extrahiert aus dem strukturierten Hauptformat. Uvicorn-Access-Logs matchen den Regex nicht → keine Labels (akzeptabel, da meist Health/Metrics-Endpoints die gedroppt werden).

---

## 2. Implementierte Änderungen

### Datei: `docker/promtail/config.yml`

| Änderung | Beschreibung |
|----------|-------------|
| **Health-Drop** (bestehend) | Uvicorn access logs für `/api/v1/health/*` werden weiterhin gedroppt |
| **Multiline-Stage** (NEU) | Python-Tracebacks werden als einzelne Loki-Einträge aggregiert |
| **Regex-Parser** (NEU) | Extrahiert `level` und `logger` aus strukturierten Server-Logs |
| **Label-Promotion** (NEU) | `level` + `logger` als Loki-Labels für effizientes Querying |
| **Kommentierung** (NEU) | Vollständige Pipeline-Dokumentation in der Config |
| **Frontend-Parser** (unverändert) | JSON-Parser für `level` + `component` bleibt identisch |

### Pipeline-Stages (Reihenfolge)

```
1. docker: {}                     # Docker json-file unwrap
2. match el-servador:
   ├── 2a: drop health/metrics    # Noise-Reduktion (existing)
   ├── 2b: multiline              # Traceback-Aggregation (NEW)
   ├── 2c: regex parser           # Label-Extraktion (NEW)
   └── 2d: labels promotion       # level + logger → Loki-Labels (NEW)
3. match el-frontend:
   ├── json parser                # level + component (unchanged)
   └── labels promotion           # (unchanged)
```

### Design-Entscheidungen

1. **Alle el-servador Stages in EINEM match-Block** – kürzer, wartbarer, keine redundanten Selektoren
2. **Multiline firstline** enthält auch Uvicorn-Prefix (`^(?:INFO|WARNING|ERROR|DEBUG|CRITICAL):`) damit Access-Logs nicht an vorherige Structured-Logs angehängt werden
3. **request_id NICHT als Label** – hohe Kardinalität, bleibt im Log-Text, querybar via `|= "uuid"`
4. **Kein structured_metadata** – obwohl Loki 3.4 es unterstützt, ist es für request_id nicht nötig (Text-Filter reicht)

---

## 3. Verifikation

### Promtail Health
```
automationone-promtail: Up (healthy) – keine Fehler in Logs
```

### Loki Labels verfügbar
```json
{
  "level": ["ERROR", "INFO", "WARNING"],
  "logger": [
    "apscheduler.executors.default",
    "src.core.metrics",
    "src.middleware.request_id",
    "src.mqtt.handlers.heartbeat_handler",
    "src.mqtt.subscriber",
    "src.services.logic_engine",
    "src.services.maintenance.jobs.sensor_health",
    "src.services.maintenance.service",
    "src.services.simulation.scheduler"
  ]
}
```

### Loki-Query Tests

| Query | Ergebnis |
|-------|----------|
| `{compose_service="el-servador", level="WARNING"}` | Korrekte WARNING-Logs mit logger-Labels |
| `{compose_service="el-servador", level="INFO"}` | Korrekte INFO-Logs |
| `{compose_service="el-servador", level="ERROR"}` | ERROR-Logs verfügbar |
| `{compose_service="el-frontend"}` | Keine aktiven Logs (nginx, kein App-Output) |

### Multiline-Verifizierung
SQL-Tracebacks in WARNING-Meldungen (`src.core.metrics`) erscheinen als **einzelne Loki-Einträge** mit `\n`-Zeilenumbrüchen – nicht als separate Zeilen. Multiline funktioniert korrekt.

### Qualitätskriterien (Plan)

| Kriterium | Status |
|-----------|--------|
| Server-Logs haben Label `level` | PASS |
| Frontend-Labels `level` + `component` unverändert | PASS (Stage unmodifiziert) |
| Python Tracebacks als einzelne Einträge | PASS (verifiziert via SQL-Traceback) |
| Health-Check-Drops funktionieren | PASS (drop-Stage unverändert) |
| Config sauber kommentiert | PASS (jede Stage erklärt) |

---

## 4. Offene Punkte

### Bekannte Einschränkungen

1. **Structured-Format Health-Logs nicht gedroppt**: Die middleware-Logs `Request completed: GET /api/v1/health/metrics status=200` werden NICHT gedroppt (nur Uvicorn-Format enthält `HTTP/`). Für vollständiges Health-Dropping müsste eine zweite Drop-Regex ergänzt werden: `.*Request completed: GET /api/v1/health/.*`. Dies ist ein separater Verbesserungsschritt.

2. **Frontend-Logs leer**: `el-frontend` ist ein nginx-Container der statische Files serviert. Die Vue-App loggt im Browser, nicht auf stdout. Frontend-Logs mit Labels werden erst sichtbar wenn:
   - Die Vue-App Server-Side-Rendering hätte (nicht der Fall), ODER
   - Ein custom nginx-Log-Format mit JSON konfiguriert würde (separater Auftrag)

3. **Server JSON-stdout als Optimierung**: Der Server könnte auf JSON-stdout umkonfiguriert werden (statt Text). Dann wäre der Regex-Parser durch einen JSON-Parser ersetzbar und ALLE Felder (module, function, line, request_id) könnten als structured_metadata extrahiert werden. Dies wäre ein separater Auftrag.

---

## 5. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `docker/promtail/config.yml` | Multiline + Regex-Parser + Labels + Kommentierung (Zeilen 37→112, war 37→54) |
