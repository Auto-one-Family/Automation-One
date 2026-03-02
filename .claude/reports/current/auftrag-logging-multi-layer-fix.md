## Auftrag: Multi-Layer Logging — End-to-End Verknuepfung Fix

**Ziel-Repo:** auto-one
**Kontext:** Systematische Logging-Analyse (2026-02-25) zeigt: Die Architektur ist korrekt, die Implementierung hat 2 kritische und 3 hohe Luecken. End-to-End-Korrelation (ESP32 → Server → Frontend → Loki) funktioniert NICHT trotz vorhandener Infrastruktur. Dieses Auftrag fixt die konkreten Verknuepfungs-Probleme.
**Bezug:** Observability-Modernisierung, Correlation-IDs (ERLEDIGT), Loki Debug-Flow (Block A-F ERLEDIGT), Hardware-Testlauf-Vorbereitung
**Prioritaet:** KRITISCH — Ohne funktionale Korrelation ist Debug-Arbeit bei Hardware-Testlaeufen auf manuelles Timestamp-Matching angewiesen
**Datum:** 2026-02-25

---

### Was AutomationOne's Logging-Stack BEREITS hat (nicht anfassen)

Die folgenden Komponenten sind IMPLEMENTIERT und FUNKTIONAL — sie sind die Basis auf der dieser Auftrag aufbaut:

| Komponente | Status | Dateien |
|------------|--------|---------|
| **Alloy native Config** | ERLEDIGT | `docker/alloy/config.alloy` (305 Zeilen, 6 Pipelines, River-Syntax) |
| **Structured Metadata in Loki** | ERLEDIGT | `docker/loki/loki-config.yml` (`allow_structured_metadata: true`) |
| **6 Alloy-Pipelines** | ERLEDIGT | el-servador (Regex+Multiline), el-frontend (JSON), esp32-serial-logger (JSON), mqtt-broker (Regex), loki (logfmt), postgres (Checkpoint-Drop) |
| **28 Prometheus-Alerts** | ERLEDIGT | `docker/grafana/provisioning/alerting/alert-rules.yml` — 7 Gruppen, alle verifiziert |
| **5 Loki-Alerts** | ERLEDIGT | `docker/grafana/provisioning/alerting/loki-alert-rules.yml` — eigene Gruppe |
| **Debug-Console Dashboard** | ERLEDIGT | `docker/grafana/provisioning/dashboards/debug-console.json` (6 Panels, 4 Vars) |
| **10 LogQL-Queries** | ERLEDIGT | `docs/debugging/logql-queries.md` |
| **Agent-Tools** | ERLEDIGT | `scripts/loki-query.sh` + 4 Makefile-Targets |
| **Correlation-ID Infrastruktur** | ERLEDIGT | `request_context.py` (ContextVar + generate_mqtt_correlation_id), `subscriber.py` (CID-Generierung), `RequestIdMiddleware`, `RequestIdFilter`, Frontend `X-Request-ID` Header, WS `correlation_id?` Interface |
| **ESP32 seq-Counter** | ERLEDIGT | `publish_seq_` in ~25 Publish-Punkten |
| **Frontend Error-Forwarding** | ERLEDIGT | `POST /api/v1/logs/frontend` — Rate-Limited, Sanitized, Unauthenticated |
| **Error-Code-Taxonomie** | ERLEDIGT | 1000-6099 (Hardware, Service, Communication, Application, Test) |
| **Noise-Reduction** | ERLEDIGT | Health-Check-Drop, MQTT-Ping-Drop, Postgres-Checkpoint-Drop, Library-Logger-Filter |

### Was NICHT funktioniert (trotz vorhandener Infrastruktur)

**End-to-End-Test zeigt:**

```
Frontend sendet: X-Request-ID: TRACE-X-1772014809
Server Response Header: x-request-id: TRACE-X-1772014809  ← KORREKT
Server Log-Zeile: ... - [-] - Request completed: ...        ← FALSCH (sollte TRACE-X-...)
Loki Structured Metadata: request_id: "-"                   ← FALSCH
Loki-Query nach request_id: 0 Ergebnisse                    ← KOMPLETT KAPUTT
```

**Zwei unabhaengige Ursachen:**
1. Starlette `BaseHTTPMiddleware` propagiert ContextVars NICHT in den TaskGroup-Context
2. PostgreSQL `logging_collector=on` leitet Logs in Datei statt stdout → Loki sieht NICHTS

---

### Ist-Zustand: Konsistenz-Matrix

| Merkmal | ESP32 | Server (REST) | Server (MQTT) | Frontend | PostgreSQL |
|---------|-------|---------------|---------------|----------|------------|
| Logs in Loki | Nur via serial-logger | OK (custom) | OK (custom) | Nur Vite plain-text | NUR Boot-Meldung |
| Level extrahiert | NEIN (plain text) | JA (Regex) | JA (Regex) | NEIN (Vite format) | NEIN (nicht in Loki) |
| Correlation-ID | seq im Payload | **BROKEN** (immer "-") | **BROKEN** (Thread-Gap) | Sendet X-Request-ID | N/A |
| Error-Codes | Via MQTT ErrorTracker | Im Log-Text | Im Log-Text | Via /logs/frontend | N/A |
| Timestamp UTC | Nein (millis) | Ja | Ja | Ja | Ja (aber nicht in Loki) |

---

### Luecken-Inventar (priorisiert)

| ID | Severity | Problem | Root Cause | Impact |
|----|----------|---------|------------|--------|
| **B1** | CRITICAL | `request_id` ist IMMER `"-"` in Server-Logs | Starlette `BaseHTTPMiddleware` kopiert ContextVars nicht in TaskGroup-Context (Issue #1012) | End-to-End REST-Korrelation komplett nicht funktional |
| **D1** | CRITICAL | PostgreSQL-Logs fehlen in Loki (nur Boot-Meldung) | `logging_collector = on` leitet Logs in Datei `/var/log/postgresql/` statt stdout | DB-Debugging nur ueber `docker exec`, kein Slow-Query-Monitoring in Grafana |
| **B2** | HIGH | MQTT-Handler-Logs haben keine Correlation-ID | `run_coroutine_threadsafe()` propagiert ContextVars nicht ueber Thread-Grenze | MQTT-Pipeline-Logs (Sensorwerte, Heartbeats) nicht korrelierbar |
| **A1** | HIGH | ESP32-Serial-Logs in Loki ohne Metadata-Labels | Alloy-Pipeline erwartet JSON, ESP32 sendet plain text `[millis] [LEVEL] [TAG] msg` | ESP32-Logs nicht nach Level/Device/Component filterbar |
| **C1** | MEDIUM | Frontend-Logs in Loki ohne Level/Component | `createLogger()` JSON geht an Browser-Console, Docker sieht nur Vite plain-text | Akzeptabel — Error-Forwarding-Endpoint ist der korrekte Pfad |
| **D2** | MEDIUM | PostgreSQL Log-Volume I/O Error | Permission-Problem in gemounteten `./logs/postgres` Volume | Wird durch D1-Fix obsolet |
| **G1** | LOW | Uvicorn Access-Logs nicht von Alloy geparst | Kein Regex-Match fuer `INFO: IP - "METHOD /path" STATUS` Format | Uvicorn-Logs in Loki ohne Level/Logger |

---

### Fix-Bloecke

#### FIX-1: Request-ID ContextVar Propagation — Pure ASGI Middleware (CRITICAL)

**Problem im Detail:**

Starlette's `BaseHTTPMiddleware` erstellt fuer jede Request-Verarbeitung eine `anyio.TaskGroup`. ContextVars werden von der aeusseren Middleware-Coroutine in diese TaskGroup NICHT kopiert. Das bedeutet:

```python
# In RequestIdMiddleware.dispatch():
set_request_id("TRACE-X-123")     # Setzt ContextVar in Middleware-Context
response = await call_next(request) # Innere Handler laufen in ANDEREM Context
# → get_request_id() in Handlern/Filtern gibt None/"−" zurueck
```

Dies ist ein bekanntes Starlette-Problem (Issue #1012, seit 2020 offen). Die offizielle Empfehlung ist: Pure ASGI Middleware statt `BaseHTTPMiddleware` verwenden.

**Betroffene Dateien:**

| Datei | Aktion |
|-------|--------|
| `El Servador/god_kaiser_server/src/middleware/request_id.py` | REWRITE — Pure ASGI Middleware |
| `El Servador/god_kaiser_server/src/core/request_context.py` | ERWEITERN — `set_request_id()` muss Token zurueckgeben |
| `El Servador/god_kaiser_server/src/main.py` | PRUEFEN — Middleware-Registration (Reihenfolge!) |

**Neuer Code: Pure ASGI Middleware**

```python
# middleware/request_id.py — KOMPLETT NEU

from starlette.types import ASGIApp, Receive, Scope, Send
from ..core.request_context import set_request_id, clear_request_id, generate_request_id
import logging

logger = logging.getLogger(__name__)

class RequestIdMiddleware:
    """Pure ASGI middleware for request ID propagation.

    Uses raw ASGI interface instead of BaseHTTPMiddleware to ensure
    ContextVar propagation works correctly (Starlette #1012).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        # Extract X-Request-ID from headers
        request_id = None
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"x-request-id":
                request_id = header_value.decode("latin-1")
                break

        if not request_id:
            request_id = generate_request_id()

        # Set ContextVar BEFORE calling inner app
        token = set_request_id(request_id)

        async def send_with_request_id(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            clear_request_id(token)
```

**Aenderung in request_context.py:**

```python
# set_request_id() muss Token zurueckgeben fuer sauberes Cleanup
def set_request_id(request_id: str) -> contextvars.Token:
    """Set request ID in current context. Returns token for reset."""
    return _request_id_ctx.set(request_id)

def clear_request_id(token: contextvars.Token | None = None) -> None:
    """Clear request ID from current context."""
    if token is not None:
        _request_id_ctx.reset(token)
    else:
        _request_id_ctx.set(None)
```

**Aenderung in main.py:**

```python
# BaseHTTPMiddleware-Import entfernen, Pure ASGI Middleware importieren:
from .middleware.request_id import RequestIdMiddleware

# Middleware-Registration — Reihenfolge wichtig!
# ASGI Middleware wird als Wrapper um die App gelegt (aeusserstes zuerst):
app = FastAPI(...)
app.add_middleware(RequestIdMiddleware)  # Muss VOR CORSMiddleware stehen
app.add_middleware(CORSMiddleware, ...)
```

**ACHTUNG — Reihenfolge:** Bei FastAPI `add_middleware` wird die ZULETZT hinzugefuegte Middleware als AEUSSERSTES ausgefuehrt. Wenn `RequestIdMiddleware` NACH `CORSMiddleware` hinzugefuegt wird, laeuft sie VOR CORS — das ist korrekt, weil die Request-ID in der aeusseren Schicht gesetzt werden soll, bevor CORS oder andere Middleware den Request verarbeiten.

**Tests:**

Neue Datei: `tests/unit/test_request_id_middleware.py`
```
test_request_id_from_header()          # X-Request-ID aus Request-Header uebernommen
test_request_id_auto_generated()       # UUID generiert wenn kein Header
test_request_id_in_response_header()   # X-Request-ID im Response zurueck
test_request_id_in_log_output()        # RequestIdFilter zeigt ID (NICHT "-")
test_request_id_contextvar_propagation() # ContextVar in Handler-Code verfuegbar
test_request_id_isolation()            # Parallele Requests haben eigene IDs
```

Bestehende Datei: `tests/integration/test_request_id.py`
```
test_e2e_request_id_round_trip()       # Sende X-Request-ID → pruefe Response + Log
test_concurrent_requests_no_bleed()    # 10 parallele Requests → jede hat eigene ID
```

**Verifikation:**

```bash
# 1. Unit-Tests
pytest tests/unit/test_request_id_middleware.py -v

# 2. Integration-Test
pytest tests/integration/test_request_id.py -v

# 3. Manueller E2E-Test gegen laufenden Stack
REQUEST_ID="VERIFY-$(date +%s)"
curl -sf -H "X-Request-ID: $REQUEST_ID" http://localhost:8000/api/v1/health
sleep 5
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode "query={compose_service=\"el-servador\"} |= \"$REQUEST_ID\"" \
  --data-urlencode 'limit=5' | jq '.data.result | length'
# Erwartung: >= 1 (Request-ID im Loki-Log sichtbar)

# 4. Alle bestehenden Tests gruen
pytest tests/ -x --timeout=60 -q
```

---

#### FIX-2: PostgreSQL Logs nach stdout (CRITICAL)

**Problem im Detail:**

`logging_collector = on` in `docker/postgres/postgresql.conf` leitet ALLE PostgreSQL-Logs von stdout/stderr nach `/var/log/postgresql/`. Docker's json-file Logging Driver sieht nur die initiale Startup-Meldung. Alloy kann nur Docker-stdout-Logs lesen → Loki hat KEINE PostgreSQL-Logs nach dem Boot.

Zusaetzlich: `could not write to log file: I/O error` deutet auf Permission-Problem im gemounteten Volume.

**Betroffene Dateien:**

| Datei | Aktion |
|-------|--------|
| `docker/postgres/postgresql.conf` | AENDERN — `logging_collector = off`, File-Directives entfernen |
| `docker/alloy/config.alloy` | ERWEITERN — Level-Extraktion fuer PostgreSQL-Logs |
| `docker-compose.yml` | PRUEFEN — `./logs/postgres` Volume kann entfernt werden |

**Aenderung in postgresql.conf:**

```conf
# VORHER:
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d.log'
log_file_mode = 0644
log_rotation_age = 1d
log_rotation_size = 50MB
log_truncate_on_rotation = on

# NACHHER:
logging_collector = off
# log_directory, log_filename, log_file_mode entfernt
# log_rotation_age, log_rotation_size, log_truncate_on_rotation entfernt
# Docker json-file driver uebernimmt die Log-Persistenz und Rotation
```

**Alle ANDEREN PostgreSQL-Log-Settings BEIBEHALTEN:**

```conf
# Diese bleiben UNVERAENDERT:
log_statement = 'mod'              # DML/DDL loggen
log_min_duration_statement = 100   # Slow Queries >100ms
log_connections = on
log_disconnections = on
log_lock_waits = on
log_line_prefix = '%t [%p] %u@%d '  # Timestamp, PID, User@DB
log_timezone = 'UTC'
```

**Alloy-Pipeline-Erweiterung fuer PostgreSQL-Level:**

In `docker/alloy/config.alloy`, die bestehende postgres-Pipeline erweitern:

```alloy
// VORHER: Nur Checkpoint-Drop
stage.match {
    selector = "{compose_service=\"postgres\"}"
    stages {
        stage.drop {
            expression = "(?i)checkpoint"
        }
    }
}

// NACHHER: Level-Extraktion + Checkpoint-Drop + Slow-Query-Erkennung
stage.match {
    selector = "{compose_service=\"postgres\"}"
    stages {
        // PostgreSQL Log-Level extrahieren (LOG, WARNING, ERROR, FATAL, PANIC)
        stage.regex {
            expression = "(?P<pg_level>LOG|WARNING|ERROR|FATAL|PANIC)"
        }
        // Mapping auf Standard-Levels
        stage.template {
            source   = "level"
            template = "{{ if eq .pg_level \"FATAL\" }}CRITICAL{{ else if eq .pg_level \"PANIC\" }}CRITICAL{{ else if eq .pg_level \"LOG\" }}INFO{{ else }}{{ .pg_level }}{{ end }}"
        }
        stage.labels {
            values = { "level" = "" }
        }
        // Noise-Drop: Checkpoint-Logs entfernen
        stage.drop {
            expression = "(?i)checkpoint"
        }
        // Slow-Query als Structured Metadata
        stage.regex {
            expression = "duration: (?P<query_duration_ms>[\\d.]+) ms"
        }
        stage.structured_metadata {
            values = { "query_duration_ms" = "" }
        }
    }
}
```

**docker-compose.yml Aenderung:**

```yaml
# Volume ./logs/postgres kann entfernt werden (wird nicht mehr gebraucht)
# volumes:
#   - ./logs/postgres:/var/log/postgresql  # ENTFERNEN
```

**Tests:**

```bash
# 1. PostgreSQL neu starten
docker compose restart postgres

# 2. Warten bis PostgreSQL hochgefahren ist (10s)
sleep 10

# 3. Slow-Query provozieren (>100ms)
docker exec automationone-postgres psql -U autoone -d automationone \
  -c "SELECT pg_sleep(0.2), count(*) FROM sensor_data;"

# 4. In Loki pruefen ob PostgreSQL-Logs ankommen
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="postgres"}' \
  --data-urlencode 'limit=10' | jq '.data.result | length'
# Erwartung: > 1 (nicht nur Boot-Meldung)

# 5. Level-Extraktion pruefen
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="postgres", level=~".+"}' \
  --data-urlencode 'limit=5' | jq '.data.result[0].stream'
# Erwartung: level ist gesetzt (INFO, WARNING, ERROR)

# 6. Slow-Query in Loki sichtbar
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="postgres"} |= "duration"' \
  --data-urlencode 'limit=5' | jq '.data.result | length'
# Erwartung: >= 1
```

---

#### FIX-3: MQTT ContextVar Thread-Propagation (HIGH)

**Problem im Detail:**

Der MQTT-Subscriber (`subscriber.py`) empfaengt Nachrichten im Paho-MQTT-Callback-Thread. Er generiert dort eine Correlation-ID und setzt `set_request_id(correlation_id)`. Dann dispatched er den async Handler via `run_coroutine_threadsafe()` in den Main-Event-Loop. Problem: ContextVars propagieren NICHT automatisch ueber Thread-Grenzen → der Handler im Event-Loop hat eine leere ContextVar.

**Loesung: Explizite CID als Parameter statt ContextVar-Propagation**

Die sauberste Loesung ist NICHT `copy_context()` (das ist fragil und hat Race-Conditions bei parallelen MQTT-Messages), sondern die CID explizit als Parameter durch den gesamten Handler-Pfad zu reichen. Der Handler setzt dann selbst die ContextVar im Event-Loop-Context.

**Betroffene Dateien:**

| Datei | Aktion |
|-------|--------|
| `El Servador/god_kaiser_server/src/mqtt/subscriber.py` | AENDERN — CID als Parameter an Handler-Dispatch |
| Alle MQTT-Handler (`sensor_handler.py`, `heartbeat_handler.py`, etc.) | AENDERN — `correlation_id` Parameter akzeptieren + ContextVar setzen |

**Neuer Code in subscriber.py:**

```python
# In _execute_handler() — NACH CID-Generierung:
correlation_id = generate_mqtt_correlation_id(esp_id, topic_suffix, seq)

# STATT: set_request_id(correlation_id) im Thread
# STATT: run_coroutine_threadsafe(handler(topic, payload), main_loop)

# NEU: CID als Parameter an Wrapper-Coroutine
async def _run_handler_with_cid(
    handler, topic: str, payload: dict, correlation_id: str
) -> None:
    """Run MQTT handler with correlation ID set in event loop context."""
    token = set_request_id(correlation_id)
    try:
        await handler(topic, payload)
    finally:
        clear_request_id(token)

future = asyncio.run_coroutine_threadsafe(
    _run_handler_with_cid(handler, topic, payload, correlation_id),
    main_loop
)
```

**Alternative (Forschungs-Empfehlung): structlog.bound_contextvars()**

Falls El Servador structlog bereits verwendet, ist `bound_contextvars()` die eleganteste Variante:

```python
import structlog

async def _run_handler_with_cid(
    handler, topic: str, payload: dict, correlation_id: str
) -> None:
    """Run MQTT handler with correlation ID in structlog + ContextVar context."""
    with structlog.contextvars.bound_contextvars(
        correlation_id=correlation_id,
        mqtt_topic=topic,
    ):
        token = set_request_id(correlation_id)
        try:
            await handler(topic, payload)
        finally:
            clear_request_id(token)
```

Dies setzt CID sowohl in structlog's eigenem Context ALS AUCH in der rohen ContextVar — damit greifen beide Mechanismen (structlog-Processor UND RequestIdFilter).

**Vorteile gegenueber `copy_context()`:**
- Kein Race-Condition-Risiko bei parallelen MQTT-Messages
- ContextVar wird im RICHTIGEN Context gesetzt (Event-Loop, nicht ThreadPool)
- `RequestIdFilter` in Logging greift korrekt
- WebSocket `broadcast()` liest korrekte CID aus ContextVar
- `bound_contextvars()` ist async-safe und raeunt nach sich auf (Context-Manager)

**Handler-Aenderungen:** KEINE — die Handler muessen NICHT geaendert werden. Die Wrapper-Coroutine setzt die ContextVar BEVOR der Handler aufgerufen wird. `get_request_id()` in Handlern und Logging-Filtern funktioniert dann automatisch.

**Tests:**

Neue/erweiterte Datei: `tests/unit/test_mqtt_correlation.py`
```
test_mqtt_handler_has_correlation_id()          # CID im Handler verfuegbar
test_mqtt_handler_cid_in_log_output()           # CID erscheint in Handler-Logs
test_parallel_mqtt_messages_isolated()          # 2 Messages → 2 verschiedene CIDs
test_mqtt_handler_cid_cleared_after_handler()   # CID nach Handler zurueckgesetzt
test_broadcast_threadsafe_has_cid()             # WS-Broadcast traegt CID
```

**Verifikation:**

```bash
# 1. MQTT-Message senden mit bekanntem Inhalt
docker exec automationone-mqtt-broker mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/VERIFY_ESP/sensors/data" \
  -m '{"sensor_type":"temperature","value":22.5,"unit":"C","esp_id":"VERIFY_ESP","sensor_id":"verify_temp","seq":999}'
sleep 10

# 2. In Loki nach Correlation-ID suchen
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"} |= "VERIFY_ESP:sensors/data:999"' \
  --data-urlencode 'limit=10' | jq '.data.result | length'
# Erwartung: >= 1 (CID im Log sichtbar, NICHT "-")

# 3. Unit-Tests
pytest tests/unit/test_mqtt_correlation.py -v
```

---

#### FIX-4: Alloy-Pipeline fuer ESP32 Serial-Logs (HIGH)

**Problem im Detail:**

Die Alloy-Pipeline fuer `esp32-serial-logger` nutzt `stage.json` zum Parsing. Dies funktioniert NUR wenn der `esp32-serial-logger` Docker-Service den ESP32-Serial-Output bereits in JSON konvertiert. Falls der Service plain text weiterleitet (was wahrscheinlich ist bei direktem `pio device monitor` Output), extrahiert Alloy KEINE Metadata.

**Betroffene Dateien:**

| Datei | Aktion |
|-------|--------|
| `docker/alloy/config.alloy` | AENDERN — Regex-Fallback fuer ESP32 plain text |

**Aenderung: Dual-Parsing (JSON zuerst, Regex-Fallback)**

```alloy
stage.match {
    selector = "{compose_service=\"esp32-serial-logger\"}"
    stages {
        // Versuch 1: JSON-Parsing (wenn serial-logger JSON erzeugt)
        stage.json {
            expressions = {
                "level"      = "level",
                "device"     = "device_id",
                "component"  = "component",
                "error_code" = "error_code",
            }
        }
        // Versuch 2: Regex-Fallback fuer ESP32 plain text
        // Format: [millis] [LEVEL   ] [TAG     ] message [E:code]
        stage.regex {
            expression = "\\[\\s*\\d+\\]\\s*\\[(?P<level>\\w+)\\s*\\]\\s*\\[(?P<component>\\w+)\\s*\\]\\s*(?P<message>.+?)(?:\\s*\\[E:(?P<error_code>\\d+)\\])?"
        }
        // Level normalisieren (ESP32 Levels auf Standard mappen)
        stage.template {
            source   = "level"
            template = "{{ if eq .level \"CRITICAL\" }}CRITICAL{{ else if eq .level \"WARNING\" }}WARNING{{ else if eq .level \"ERROR\" }}ERROR{{ else if eq .level \"INFO\" }}INFO{{ else if eq .level \"DEBUG\" }}DEBUG{{ else }}{{ .level }}{{ end }}"
        }
        stage.labels {
            values = { "level" = "" }
        }
        stage.structured_metadata {
            values = {
                "component"  = "",
                "error_code" = "",
            }
        }
    }
}
```

**Warum KEIN device_id als Label oder Metadata aus ESP32-Logs?**
- ESP32-Serial-Logs enthalten die device_id NICHT in der Log-Zeile
- Die device_id kommt vom Docker-Container-Label `compose_service` = `esp32-serial-logger`
- Falls mehrere ESP32s gleichzeitig ueber Serial loggen, muss der serial-logger Service sie unterscheiden (separate Container oder Log-Prefix)
- Das ist eine Architektur-Entscheidung fuer den serial-logger Service, nicht fuer Alloy

**Tests:**

```bash
# 1. Alloy-Config validieren (Syntax-Check)
docker exec automationone-alloy alloy fmt /etc/alloy/config.alloy

# 2. Alloy neuladen (ohne Restart)
curl -sf -X POST http://localhost:12345/-/reload
# ODER: docker compose restart alloy

# 3. Wenn esp32-serial-logger laeuft:
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="esp32-serial-logger", level=~".+"}' \
  --data-urlencode 'limit=5' | jq '.data.result[0].stream'
# Erwartung: level ist gesetzt (INFO, ERROR, etc.)
```

---

#### FIX-5: Uvicorn Access-Log-Harmonisierung (LOW)

**Problem im Detail:**

El Servador erzeugt ZWEI Log-Streams im selben Container:
1. Custom Logger: `2026-02-25 10:17:44 - src.middleware.request_id - INFO - [req-id] - message` → wird von Alloy geparst
2. Uvicorn Access Logger: `INFO:     172.18.0.13:48326 - "GET /path HTTP/1.1" 200 OK` → wird NICHT geparst

**Empfohlene Loesung: Uvicorn Access-Logs deaktivieren**

Der Custom Logger loggt bereits `Request completed: GET /path status=200 duration=41.7ms` — die Uvicorn Access-Logs sind redundant und erzeugen nur Noise.

**Betroffene Dateien:**

| Datei | Aktion |
|-------|--------|
| `El Servador/god_kaiser_server/src/main.py` oder `uvicorn_config.py` | AENDERN — `--no-access-log` |
| `docker-compose.yml` oder Uvicorn-Startbefehl | AENDERN — Access-Log deaktivieren |

**Aenderung:**

```python
# In der Uvicorn-Konfiguration:
uvicorn.run(
    "main:app",
    host="0.0.0.0",
    port=8000,
    access_log=False,  # NEU: Redundant mit Custom Logger
    log_level="info",
)
```

ODER in `docker-compose.yml`:
```yaml
el-servador:
  command: uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log
```

**Tests:**

```bash
# 1. Server neu starten
docker compose restart el-servador

# 2. Request senden
curl -sf http://localhost:8000/api/v1/health

# 3. Logs pruefen — NUR Custom Logger Format, kein Uvicorn Format
docker logs automationone-server --tail 10
# Erwartung: Keine Zeilen mit "INFO:     172.18.0.x - ..."
# Nur: "2026-02-25 ... - INFO - [req-id] - Request completed: ..."
```

---

#### FIX-6: Frontend-Logging Dokumentation (MEDIUM — kein Code-Change)

**Problem:** Frontend `createLogger()` JSON geht an Browser-Console, nicht Docker stdout. Vite Dev Server schreibt nur plain-text Startup-Logs an Docker.

**Warum KEIN Code-Change:**
- In Produktion: Nginx serviert statische Dateien → es gibt KEINE Client-Side-Logs in Docker
- In Development: Browser-Console ist der richtige Ort fuer Client-Side-Logs
- Error-Forwarding via `POST /api/v1/logs/frontend` ist bereits implementiert fuer kritische Fehler
- Vue Error Handler + Window Error Handlers sind konfiguriert und funktionieren

**Aktion: Dokumentation in Debug-Workflow**

In `docs/debugging/debug-workflow.md` ergaenzen:

```markdown
### Frontend-Logs: Was wo landet

| Log-Typ | Wo sichtbar | Wie zugreifen |
|---------|-------------|---------------|
| Vue Runtime Errors | Server-Log (via /logs/frontend) | Loki: `{compose_service="el-servador"} |= "[FRONTEND]"` |
| Console.log/warn/error | Browser DevTools | F12 → Console Tab |
| Unhandled Promise Rejections | Server-Log (via /logs/frontend) | Loki: `|= "[FRONTEND]"` |
| Vite Build Errors | Docker stdout | `docker logs automationone-frontend` |
| Network Errors (API) | Browser Network Tab + Axios Error Log | F12 → Network Tab |

**Fuer Agents:** Frontend-Fehler sind in Loki unter `[FRONTEND]` suchbar.
Browser-Console-Logs sind NICHT in Loki — dafuer Playwright MCP nutzen (Debug-Szenario).
```

---

### Implementierungsreihenfolge

| Schritt | Fix | Aufwand | Abhaengigkeit |
|---------|-----|---------|---------------|
| 1 | **FIX-1** (ASGI Middleware) | ~2h | Keine — hoechste Prioritaet |
| 2 | **FIX-2** (PostgreSQL stdout) | ~30min | Keine — parallel zu FIX-1 moeglich |
| 3 | **FIX-3** (MQTT CID Propagation) | ~1h | FIX-1 sollte zuerst (gleiche Infrastruktur) |
| 4 | **FIX-4** (ESP32 Alloy Pipeline) | ~30min | Keine — nur Alloy-Config |
| 5 | **FIX-5** (Uvicorn Access-Log) | ~15min | FIX-1 sollte zuerst |
| 6 | **FIX-6** (Doku) | ~15min | Keine |

**Gesamt: ~4-5 Stunden** (inkl. Tests und Verifikation)

**Zustaendiger Agent:** DevOps-Agent (system-control) fuer FIX-2 und FIX-4, Backend-Agent (server-dev) fuer FIX-1 und FIX-3, FIX-5. Dokumentation FIX-6 kann jeder Agent.

**Commit-Strategie:**
1. `fix: replace BaseHTTPMiddleware with pure ASGI middleware for ContextVar propagation` (FIX-1)
2. `fix: PostgreSQL logging_collector=off for Docker stdout + Alloy pipeline` (FIX-2)
3. `fix: MQTT handler ContextVar propagation via explicit CID parameter` (FIX-3)
4. `fix: Alloy ESP32 serial log pipeline with regex fallback` (FIX-4)
5. `chore: disable redundant Uvicorn access logs` (FIX-5)
6. `docs: frontend logging architecture in debug-workflow` (FIX-6)

---

### Akzeptanzkriterien

**End-to-End-Korrelation (CRITICAL — Hauptziel):**
- [ ] REST: `X-Request-ID` Header → Server-Log zeigt ID (NICHT "-") → Loki Structured Metadata hat `request_id`
- [ ] MQTT: Sensor-Message → Server-Log zeigt CID (`esp-id:topic:seq:ts`) → Loki suchbar
- [ ] Cross-Service: `{compose_service=~".+"} |= "esp-001:sht31_temp:42"` findet Eintraege in mindestens 2 Services

**PostgreSQL-Logs (CRITICAL):**
- [ ] PostgreSQL-Logs erscheinen in Loki (nicht nur Boot-Meldung)
- [ ] Slow-Queries (>100ms) in Loki sichtbar und suchbar
- [ ] Level-Label korrekt extrahiert (INFO, WARNING, ERROR, CRITICAL)

**ESP32-Serial-Logs (HIGH):**
- [ ] Level-Label aus ESP32-Logs extrahiert (wenn serial-logger laeuft)
- [ ] Component als Structured Metadata (TAG → component)
- [ ] Error-Code als Structured Metadata (wenn vorhanden)

**Nicht-funktional:**
- [ ] Alle bestehenden Tests gruen (804+ Backend, 1342+ Frontend, ESP32 Build OK)
- [ ] 28 Prometheus-Alerts + 5 Loki-Alerts weiterhin aktiv
- [ ] Kein neues Docker-Volume, keine neue Dependency
- [ ] Alloy-Config syntaktisch valide (`alloy fmt`)

---

### Verifikation: End-to-End-Test nach ALLEN Fixes

```bash
# === SCHRITT 1: REST-Korrelation ===
REQUEST_ID="E2E-VERIFY-$(date +%s)"
echo "Testing REST correlation with: $REQUEST_ID"

# Request senden
curl -sf -H "X-Request-ID: $REQUEST_ID" http://localhost:8000/api/v1/health/metrics
sleep 10

# In Loki suchen
LOKI_RESULT=$(curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode "query={compose_service=\"el-servador\"} |= \"$REQUEST_ID\"" \
  --data-urlencode 'limit=5' | jq '.data.result | length')
echo "REST Correlation: $LOKI_RESULT Ergebnisse (erwartet: >= 1)"

# === SCHRITT 2: MQTT-Korrelation ===
echo "Testing MQTT correlation..."
docker exec automationone-mqtt-broker mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/E2E_TEST/sensors/data" \
  -m '{"sensor_type":"temperature","value":22.5,"unit":"C","esp_id":"E2E_TEST","sensor_id":"temp_verify","seq":12345}'
sleep 10

MQTT_RESULT=$(curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"} |= "E2E_TEST:sensors/data:12345"' \
  --data-urlencode 'limit=5' | jq '.data.result | length')
echo "MQTT Correlation: $MQTT_RESULT Ergebnisse (erwartet: >= 1)"

# === SCHRITT 3: PostgreSQL-Logs ===
echo "Testing PostgreSQL logs in Loki..."
docker exec automationone-postgres psql -U autoone -d automationone \
  -c "SELECT pg_sleep(0.2), count(*) FROM sensor_data;" 2>/dev/null
sleep 10

PG_RESULT=$(curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="postgres"} |= "duration"' \
  --data-urlencode 'limit=5' | jq '.data.result | length')
echo "PostgreSQL Slow-Query: $PG_RESULT Ergebnisse (erwartet: >= 1)"

# === SCHRITT 4: Cross-Service-Korrelation ===
echo "Testing cross-service correlation..."
CROSS_RESULT=$(curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service=~".+"} |= "E2E_TEST"' \
  --data-urlencode 'limit=20' | jq '[.data.result[].stream.compose_service] | unique')
echo "Cross-Service: $CROSS_RESULT (erwartet: mindestens [\"el-servador\", \"mqtt-broker\"])"

# === ZUSAMMENFASSUNG ===
echo ""
echo "=== End-to-End Verifikation ==="
echo "REST Korrelation:    $([ "$LOKI_RESULT" -ge 1 ] 2>/dev/null && echo 'PASS' || echo 'FAIL')"
echo "MQTT Korrelation:    $([ "$MQTT_RESULT" -ge 1 ] 2>/dev/null && echo 'PASS' || echo 'FAIL')"
echo "PostgreSQL Logs:     $([ "$PG_RESULT" -ge 1 ] 2>/dev/null && echo 'PASS' || echo 'FAIL')"
echo "Cross-Service:       Check manuell (siehe Output oben)"
```

---

### Wann nutze ich was? — Debugging nach dem Fix

| Situation | Werkzeug | Query |
|-----------|----------|-------|
| REST-API-Fehler debuggen | Loki + Request-ID | `{compose_service="el-servador"} \|= "REQUEST-ID-AUS-RESPONSE-HEADER"` |
| Sensorwert-Pfad verfolgen | Loki + MQTT-CID | `{compose_service=~".+"} \|= "esp-001:sht31_temp:42"` |
| Slow-Query identifizieren | Loki + PostgreSQL | `{compose_service="postgres"} \|= "duration" \| query_duration_ms > 500` |
| ESP32-Boot-Problem | Loki + Serial-Logger | `{compose_service="esp32-serial-logger"} \| level="ERROR"` |
| Frontend-Runtime-Error | Loki + Error-Forwarding | `{compose_service="el-servador"} \|= "[FRONTEND]"` |
| MQTT-Verbindungsproblem | Loki + Mosquitto | `{compose_service="mqtt-broker"} \|= "disconnect"` |
| Cross-Service-Korrelation | Loki + Freitext | `{compose_service=~".+"} \|= "SUCHBEGRIFF"` |

---

### Referenzen

**Life-Repo (Wissens-Basis):**
- `wissen/iot-automation/unified-logging-correlation-ids.md` — 9 Quellen, Correlation-ID-Pattern fuer IoT
- `wissen/iot-automation/loki-promtail-pipeline-best-practices.md` — Label-Strategie, Structured Metadata
- `wissen/iot-automation/grafana-alloy-docker-migration.md` — Alloy-Setup, Pipeline-Stage-Mapping
- `wissen/iot-automation/log-format-konsistenz-iot-multilayer.md` — Feld-Mapping ueber alle Schichten
- `wissen/iot-automation/esp32-structured-logging-formate.md` — ESP32-Log-Format, TAG, Buffer-Sizing
- `wissen/iot-automation/frontend-structured-logging-browser.md` — Browser-Logging, Error-Forwarding
- `wissen/iot-automation/mqtt-payload-logging-debug.md` — MQTT-Debug-Patterns
- `wissen/iot-automation/grafana-prometheus-iot-monitoring.md` — Monitoring-Stack
- `wissen/iot-automation/ki-error-analyse-iot.md` — 4-Ebenen-Architektur
- `wissen/iot-automation/starlette-basehttpmiddleware-contextvar-bug.md` — Recherche FIX-1
- `wissen/iot-automation/python-asyncio-contextvar-thread-propagation.md` — Recherche FIX-3
- `wissen/iot-automation/postgresql-docker-logging-best-practices.md` — Recherche FIX-2
- `wissen/iot-automation/2025-cross-layer-log-correlation-iot.md` — Forschung Cross-Layer Correlation
- `wissen/iot-automation/2022-cloud-native-unified-structured-logging.md` — Forschung Unified Logging

**Life-Repo (Bestehende Auftraege):**
- `arbeitsbereiche/automation-one/auftrag-loki-debug-flow.md` — Block A-F ERLEDIGT, Block G (Verifikation) OFFEN
- `arbeitsbereiche/automation-one/auftrag-correlation-ids.md` — ERLEDIGT (2026-02-25), Limitation B2 dokumentiert
- `arbeitsbereiche/automation-one/auftrag-monitoring-fix.md` — ERLEDIGT (2026-02-24), 28/28 Alerts verifiziert

**Ziel-Repo (auto-one) — Betroffene Dateien:**
- `El Servador/god_kaiser_server/src/middleware/request_id.py` — FIX-1 (Rewrite)
- `El Servador/god_kaiser_server/src/core/request_context.py` — FIX-1 (Token-Return)
- `El Servador/god_kaiser_server/src/main.py` — FIX-1 (Middleware-Registration) + FIX-5 (Uvicorn)
- `El Servador/god_kaiser_server/src/mqtt/subscriber.py` — FIX-3 (CID-Wrapper)
- `docker/postgres/postgresql.conf` — FIX-2 (logging_collector=off)
- `docker/alloy/config.alloy` — FIX-2 (PG-Pipeline) + FIX-4 (ESP32-Regex)
- `docker-compose.yml` — FIX-2 (Volume-Cleanup)
- `docs/debugging/debug-workflow.md` — FIX-6 (Frontend-Doku)

**Wissenschaftliche Validierung (Forschung 2026-02-25):**

Die Fixes sind durch aktuelle Forschung wissenschaftlich bestaetigt:

| Erkenntnis | Fix-Bezug | Quelle |
|------------|-----------|--------|
| "Domain-spezifische Correlation Keys" (device_id:topic:seq) sind optimaler Ansatz fuer <100 Devices | FIX-3 CID-Format | Cross-Layer Log Correlation Paper (2025) |
| "Partial Tracing Architecture" (Edge=seq, Server=voller Span, Frontend=Browser-Span) ist Industriestandard | Gesamtarchitektur | Lightweight Distributed Tracing (2024) |
| Thread-Grenze MQTT→EventLoop ist ein Python asyncio Designproblem, KEIN AutomationOne-Bug | FIX-3 Wrapper-Pattern | PEP 567, asyncio Docs |
| Unified Structured Logging (JSON-Events) statt getrennte Log/Metric/Trace Pipelines | structlog-Ansatz bestaetigt | Kratzke 2022 (Multi-Case Study) |
| `BaseHTTPMiddleware` ContextVar-Bug (Starlette #1012) seit 2020 offen, offiziell Pure ASGI empfohlen | FIX-1 | Starlette Docs + Issue #1012 |
| MQTT 5.0 User Properties als zukuenftiger Trace-Carrier (kein akuter Bedarf) | Roadmap | OpenTelemetry MQTT Semantic Conventions (2024) |

**Quellen (Recherche + Forschung):**
- Starlette Issue #1012 — BaseHTTPMiddleware ContextVar Bug (seit 2020 bekannt, nicht gefixt)
- Python PEP 567 — ContextVar-Spezifikation (Thread-Isolation by design)
- Grafana Loki Label Best Practices — Kardinalitaets-Management
- FastAPI Community Discussion #8190 — Correlation-ID Implementierungen
- OpenTelemetry MQTT Semantic Conventions (2024) — Trace-Propagation fuer MQTT 5.0
- Kratzke 2022: "Cloud-Native Observability: Unified Structured Logging" — Multi-Case Study
- HiveMQ + Azure IoT Hub — Distributed Tracing Patterns fuer IoT

**Life-Repo (Recherche-Ergebnisse 2026-02-25):**
- `wissen/iot-automation/starlette-basehttpmiddleware-contextvar-bug.md` — 8 Quellen, Pure ASGI Code
- `wissen/iot-automation/python-asyncio-contextvar-thread-propagation.md` — 7 Quellen, copy_context() vs. explizite Parameter
- `wissen/iot-automation/postgresql-docker-logging-best-practices.md` — 7 Quellen, log_line_prefix, Alloy-Integration

**Life-Repo (Forschungs-Ergebnisse 2026-02-25):**
- `wissen/iot-automation/2025-cross-layer-log-correlation-iot.md` — 8 Quellen, W3C Trace Context, Domain-Keys
- `wissen/iot-automation/2022-cloud-native-unified-structured-logging.md` — Kratzke Paper, Unified Logging
- `wissen/iot-automation/2025-context-propagation-async-python.md` — PEP 567, copy_context(), structlog.bound_contextvars()
- `wissen/iot-automation/2025-structured-logging-pipeline-iot.md` — OTLP Log Data Model, Label-Kardinalitaet, Alloy Pipeline
