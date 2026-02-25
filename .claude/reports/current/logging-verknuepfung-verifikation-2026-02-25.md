# Logging-Konfigurationen: Multi-Layer-Verknuepfung Verifikation

**Datum:** 2026-02-25
**Status:** CRITICAL - Mehrere Luecken identifiziert
**Scope:** ESP32 -> Server -> Frontend -> PostgreSQL -> Alloy -> Loki -> Grafana

---

## Block A: ESP32 Firmware Logging

### Format und Felder

**Logger:** `El Trabajante/src/utils/logger.h` + `logger.cpp`
**Format:** `[millis] [LEVEL   ] [TAG     ] message`
**Beispiel:** `[     12345] [INFO    ] [SENSOR  ] SHT31 initialized`

| Feld | Vorhanden | Format |
|------|-----------|--------|
| Timestamp (millis) | OK | `%10lu` (milliseconds since boot) |
| Level | OK | `DEBUG/INFO/WARNING/ERROR/CRITICAL` (8 chars padded) |
| TAG | OK | 8 chars padded (ESP-IDF convention) |
| Error-Code | TEILWEISE | Nicht im Log-Format selbst, nur in `ErrorTracker` via MQTT |

### Log-Level-Konfiguration

| Environment | `CORE_DEBUG_LEVEL` | Custom Logger Default |
|-------------|-------------------|----------------------|
| `seeed_xiao_esp32c3` | 2 (WARNING) | `LOG_INFO` |
| `esp32_dev` | 3 (INFO) | `LOG_INFO` |
| `wokwi_simulation` | 3 (INFO, inherited) | `LOG_INFO` |
| `native` | N/A | `LOG_INFO` |

**Befund:** ESP-IDF `CORE_DEBUG_LEVEL` und Custom `Logger::current_log_level_` sind ZWEI unabhaengige Systeme. ESP-IDF kontrolliert `log_printf()`, Custom Logger kontrolliert `Serial.printf()`. Bei Xiao ist ESP-IDF auf WARNING, aber Custom Logger auf INFO -- Mismatch moeglich.

### Error-Codes

**Definiert in:** `El Trabajante/src/models/error_codes.h`
**Ranges:**
- 1000-1999: HARDWARE (GPIO, I2C, OneWire, PWM, Sensor, Actuator, DS18B20)
- 2000-2999: SERVICE (NVS, Config, Logger, Storage, Subzone)
- 3000-3999: COMMUNICATION (WiFi, MQTT, HTTP, Network)
- 4000-4999: APPLICATION (State, Operation, Command, Payload, Memory, System, Watchdog)
- 6000-6099: TEST INFRASTRUCTURE (nicht in Produktion)

**E:XXXX Format:** NICHT im Logger selbst implementiert. Error-Codes werden ueber `ErrorTracker` via MQTT-Topic `kaiser/+/esp/+/system/error` versendet, NICHT in die Serial-Log-Zeile eingebettet.

### Alloy-Pipeline (ESP32 Serial Logger)

**Alloy erwartet:** JSON-Format `{"level":"info","device_id":"...","component":"...","error_code":"..."}`
**ESP32 sendet:** Plain-Text `[millis] [LEVEL] [TAG] message`

**CRITICAL GAP (A1):** Die Alloy-Pipeline fuer `esp32-serial-logger` nutzt `stage.json` fuer Parsing. Der ESP32-Logger sendet aber plain-text Serial-Output. Nur wenn der `esp32-serial-logger` Container den Serial-Output in JSON konvertiert, funktioniert die Pipeline. Ohne JSON-Konvertierung werden `level`, `device`, `component`, `error_code` NICHT extrahiert.

---

## Block B: FastAPI Backend Logging

### Logging-Konfiguration

**Datei:** `El Servador/god_kaiser_server/src/core/logging_config.py`
**Framework:** Standard `logging` (kein structlog/loguru)
**Format-Optionen:**
- `LOG_FORMAT=json` -> JSONFormatter (`{"timestamp","level","logger","message","module","function","line","request_id"}`)
- `LOG_FORMAT=text` -> TextFormatter (`%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] - %(message)s`)

**Docker-Default:** `LOG_LEVEL=INFO`, `LOG_FORMAT=json` (aber Console-Handler benutzt IMMER TextFormatter)

### Tatsaechliches Log-Output in Docker

```
2026-02-25 10:17:44 - src.middleware.request_id - INFO - [-] - Request completed: GET /api/v1/health/metrics status=200 duration=41.7ms
INFO:     172.18.0.13:48326 - "GET /api/v1/health/metrics HTTP/1.1" 200 OK
```

**Zwei Log-Streams im selben Container:**
1. Custom Logger (TextFormatter): `YYYY-MM-DD HH:MM:SS - logger - LEVEL - [request_id] - message`
2. Uvicorn Access Logger: `LEVEL:     IP - "METHOD /path HTTP/1.1" STATUS`

Die Alloy-Pipeline erkennt nur Format 1 via Regex. Format 2 (Uvicorn) wird NICHT geparst -- keine `logger`, `level`, `request_id` Extraktion.

### Correlation-ID / Request-ID

**ContextVar:** `El Servador/god_kaiser_server/src/core/request_context.py`
- `_request_id_ctx: ContextVar[Optional[str]]` (default: None)
- REST: UUID via `X-Request-ID` Header oder auto-generated
- MQTT: Format `{esp_id}:{topic_suffix}:{seq}:{timestamp_ms}`

**Middleware:** `El Servador/god_kaiser_server/src/middleware/request_id.py`
- Setzt `set_request_id()` vor `call_next()`
- Cleared `clear_request_id()` im `finally`
- Gibt `X-Request-ID` im Response-Header zurueck (verifiziert: funktioniert)

**CRITICAL GAP (B1): ContextVar-Propagation fehlerhaft**

Loki zeigt `request_id: "-"` fuer ALLE Server-Logs, obwohl Client `X-Request-ID` sendet:

```
Gesendet: X-Request-ID: TRACE-X-1772014809
Response Header: x-request-id: TRACE-X-1772014809 (korrekt!)
Loki Structured Metadata: request_id: "-" (FALSCH!)
Log-Zeile: ... - [-] - Request completed: ... (FALSCH!)
```

**Root Cause:** Starlette `BaseHTTPMiddleware` kopiert den ContextVar NICHT in den TaskGroup-Context, in dem die Middleware den Request verarbeitet. `set_request_id()` wird in einem Context aufgerufen, `get_request_id()` (via `RequestIdFilter`) laeuft in einem anderen. Dies ist ein bekanntes Starlette-Problem (#1012).

**Workaround:** Middleware auf `@app.middleware("http")` umstellen (raw ASGI middleware) oder `asgi_correlation_id` Library verwenden.

**KNOWN LIMITATION (B2): MQTT-Handler ContextVar Propagation**

`run_coroutine_threadsafe()` in `subscriber.py:260` propagiert ContextVars NICHT automatisch. Der Subscriber setzt `set_request_id(correlation_id)` im ThreadPool-Worker (Zeile 246-247), aber die Coroutine, die im Main Loop laeuft, erbt diesen Context NICHT.

Allerdings: Der Subscriber ruft `clear_request_id()` im `finally` Block, was korrekt ist. Das Problem ist, dass `set_request_id()` im Thread-Context gesetzt wird, aber der Handler im Main-Loop-Context laeuft -- zwei verschiedene ContextVar-Kopien.

### Log-Level und Noise Reduction

```python
logging.getLogger("paho.mqtt").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("asyncio").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.WARNING)
```

**OK** -- externe Library-Noise wird reduziert.

---

## Block C: Vue3 Frontend Logging

### Logger-Implementation

**Datei:** `El Frontend/src/utils/logger.ts`
**Format:** JSON-strukturiert fuer Docker/Loki

```json
{"level":"info","component":"SensorCard","message":"...","timestamp":"2026-02-25T10:00:00.000Z"}
```

**Log-Level:** Konfigurierbar via `VITE_LOG_LEVEL` (default: `debug`)

### Global Error Handlers

**Datei:** `El Frontend/src/main.ts`

| Handler | Vorhanden | Beschreibung |
|---------|-----------|--------------|
| `app.config.errorHandler` | OK | Vue Error Handler, loggt + Backend-Report |
| `app.config.warnHandler` | OK | Vue Warning Handler, loggt |
| `window.addEventListener('unhandledrejection')` | OK | Promise Rejection Handler, loggt + Backend-Report |
| `window.onerror` | OK | Synchrone JS-Errors, loggt + Backend-Report |

### Error-Forwarding Endpoint

**Frontend sendet an:** `POST /api/v1/logs/frontend`
**Backend Endpoint:** `El Servador/god_kaiser_server/src/api/v1/logs.py`
- Unauthenticated (fire-and-forget)
- Rate-Limited: 10 req/min per IP
- Sanitizes input (gegen Log-Injection)
- Loggt mit Prefix `[FRONTEND] [ComponentName] message`

**Status: IMPLEMENTIERT und funktional.**

### X-Request-ID bei REST-Requests

**Datei:** `El Frontend/src/api/index.ts`

```typescript
const requestId = crypto.randomUUID()
config.headers['X-Request-ID'] = requestId
```

**OK** -- Frontend generiert UUID fuer JEDEN REST-Request und sendet als `X-Request-ID` Header. Response-Header wird auch geloggt. Cross-Layer-Korrelation ist clientseitig korrekt implementiert.

### Alloy-Pipeline (Frontend)

**Alloy erwartet:** JSON `{"level":"...","component":"..."}`
**Frontend sendet:** Tatsaechlicher Docker-Output ist Vite Dev Server plain text (`[vite] http proxy error: ...`)

**GAP (C1):** Der Vite Dev Server schreibt seine eigenen Plain-Text-Logs an stdout. Vue's `createLogger()` JSON-Output geht an den Browser-Console (client-side), NICHT an Docker stdout. Die Alloy JSON-Parsing-Stage fuer `el-frontend` findet daher KEINE JSON-Logs und extrahiert KEIN `level` oder `component`.

**Loki-Verifikation:**
```
compose_service: el-frontend
detected_level: unknown  <-- KEIN Level extrahiert
```

Nur der Backend-Forwarding-Endpoint (`/logs/frontend`) bringt Frontend-Errors in die Server-Logs.

---

## Block D: PostgreSQL Logging

### PostgreSQL Konfiguration

**Datei:** `docker/postgres/postgresql.conf`

| Setting | Wert | Bewertung |
|---------|------|-----------|
| `logging_collector` | `on` | PROBLEM - leitet Logs weg von stdout |
| `log_directory` | `/var/log/postgresql` | Gemountet als Volume |
| `log_statement` | `mod` | OK - nur DML/DDL |
| `log_min_duration_statement` | `100` | OK - Slow Queries >100ms |
| `log_connections` | `on` | OK |
| `log_disconnections` | `on` | OK |
| `log_lock_waits` | `on` | OK |
| `log_line_prefix` | `%t [%p] %u@%d ` | OK - Timestamp, PID, User@DB |
| `log_timezone` | `UTC` | OK |
| `log_rotation_age` | `1d` | OK |
| `log_rotation_size` | `50MB` | OK |

### CRITICAL GAP (D1): PostgreSQL-Logs fehlen in Loki

**Problem:** `logging_collector = on` leitet ALLE PostgreSQL-Logs von stdout/stderr nach `/var/log/postgresql/`. Docker json-file Logging Driver sieht nur die initiale Startmeldung:

```
2026-02-24 12:23:41 UTC [1] @ LOG:  redirecting log output to logging collector process
2026-02-24 12:23:41 UTC [1] @ HINT:  Future log output will appear in directory "/var/log/postgresql".
could not write to log file: I/O error
```

**Alloy kann NUR Docker-stdout-Logs lesen.** Da PostgreSQL nach Sekunde 1 keine stdout-Logs mehr schreibt, hat Loki KEINE PostgreSQL-Logs nach dem Boot.

Zusaetzlich: `could not write to log file: I/O error` deutet auf ein Permission-Problem im gemounteten `./logs/postgres` Volume hin.

**Loki-Verifikation:**
- `compose_service=postgres` existiert als Label (1 Eintrag -- die Startup-Meldung)
- Keine Logs der letzten 24 Stunden ausser Boot-Meldung

### Slow-Query-Monitoring

`log_min_duration_statement = 100` ist konfiguriert, aber Slow-Query-Logs landen in der DATEI, nicht in Loki.

---

## Block E: Cross-Layer-Korrelation

### E2E-Test: X-Request-ID Round-Trip

| Schritt | Ergebnis |
|---------|----------|
| Frontend generiert UUID | OK (`crypto.randomUUID()`) |
| Frontend sendet `X-Request-ID` Header | OK (Axios Interceptor) |
| Server empfaengt Header | OK (RequestIdMiddleware) |
| Server setzt ContextVar | OK (`set_request_id()`) |
| Server loggt mit request_id | FAIL -- `[-]` in allen Logs |
| Server gibt `X-Request-ID` im Response | OK (verifiziert via curl) |
| Alloy extrahiert request_id | FAIL -- Wert ist `"-"` |
| Loki Structured Metadata | FAIL -- `request_id: "-"` |
| Loki-Query nach request_id | FAIL -- keine Ergebnisse |

**Ergebnis: End-to-End-Korrelation ist NICHT funktional.**

### MQTT-Korrelation

| Schritt | Ergebnis |
|---------|----------|
| MQTT-Subscriber generiert correlation_id | OK (`generate_mqtt_correlation_id()`) |
| ThreadPool-Worker setzt ContextVar | OK (`set_request_id(correlation_id)`) |
| Async Handler im Main Loop erbt ContextVar | FAIL (run_coroutine_threadsafe propagiert nicht) |
| Server-Logs zeigen correlation_id | FAIL -- `[-]` erwartet |

**Ergebnis: MQTT-Korrelation ist NICHT funktional.**

---

## Block F: Silent-Failure-Analyse

### Python `except Exception: pass` (Echte Silent Failures)

| Datei | Zeile | Kontext | Risiko |
|-------|-------|---------|--------|
| `actuator_service.py` | 139 | WebSocket broadcast fail | NIEDRIG -- best-effort, Kommentar vorhanden |
| `actuator_service.py` | 224 | WebSocket broadcast fail | NIEDRIG -- best-effort |
| `actuator_service.py` | 272 | WebSocket broadcast fail | NIEDRIG -- best-effort |
| `debug.py` | 2598 | Log-Backup cleanup | NIEDRIG -- nicht kritisch |
| `autoops/api_client.py` | 174 | JSON parse error detail | NIEDRIG -- raise folgt |

### Python `except Exception:` (mit Handling, KEIN Silent Failure)

| Datei | Zeile | Kontext | Bewertung |
|-------|-------|---------|-----------|
| `security.py` | 188 | `return None` (token parse) | OK -- defensive |
| `circuit_breaker.py` | 438 | `record_failure + raise` | OK -- re-raises |
| `constants.py` | 85 | `return DEFAULT_KAISER_ID` | OK -- fallback |
| `debug.py` | 2307 | `return None` | OK -- debug endpoint |
| `debug.py` | 2544 | `entry_count = None` | OK -- graceful |
| `db/session.py` | 147 | `rollback + raise` | OK -- re-raises |
| `db/session.py` | 327 | `rollback` | OK -- documented |

### TypeScript Silent Failures

**Frontend:** KEINE `catch {}` oder `catch () => {}` Muster gefunden. Alle `catch`-Bloecke loggen den Fehler via `logger.error()`.

**Eine Ausnahme:** `main.ts:26` -- `.catch(() => {})` bei `reportToBackend()`. AKZEPTABEL -- fire-and-forget Error-Reporting soll nicht selbst Errors werfen.

### MQTT-Handler Exception-Handling

`subscriber.py:_execute_handler()`:
- `try/catch` um gesamten Handler -- OK
- Timeout-Fehler geloggt -- OK
- Event-Loop-Fehler speziell behandelt -- OK
- `finally: clear_request_id()` -- OK

**Bewertung:** MQTT-Handler sind robust. Keine Silent Failures im kritischen Pfad.

---

## Block G: Log-Format-Konsistenz

### Level-Mapping Matrix

| Layer | Levels | Loki Label | Mapping |
|-------|--------|------------|---------|
| ESP32 | `DEBUG/INFO/WARNING/ERROR/CRITICAL` | N/A (plain text, nicht geparst) | GAP: Kein Level-Label in Loki |
| Server (custom) | `DEBUG/INFO/WARNING/ERROR/CRITICAL` | `level` (via Regex) | OK |
| Server (uvicorn) | `INFO/WARNING/ERROR` | Nicht extrahiert | GAP: Uvicorn-Logs ohne Level-Label |
| Frontend (logger.ts) | `debug/info/warn/error` | Nicht extrahiert (Browser-only) | GAP: Frontend JSON geht nicht an Docker |
| Frontend (Vite) | Plain text | `detected_level: unknown` | GAP: Kein Level |
| PostgreSQL | `LOG/WARNING/ERROR/FATAL` | Nicht in Loki | GAP: Logs in Datei, nicht stdout |
| MQTT Broker | `error` (nur) | `level` (via Regex) | TEILWEISE: Nur `error` extrahiert |
| Loki | `info/warn/error` | `level` (via logfmt) | OK |

### Timestamp-Format Matrix

| Layer | Format | Timezone | Konsistent? |
|-------|--------|----------|-------------|
| ESP32 | `millis()` (unsigned long) | N/A (uptime) | ANDERS -- nicht wall-clock |
| Server | `%Y-%m-%d %H:%M:%S` | Server-local (Docker=UTC) | OK |
| Frontend | ISO 8601 (`toISOString()`) | UTC | OK |
| PostgreSQL | `%t` (`YYYY-MM-DD HH:MM:SS TZ`) | UTC (`log_timezone`) | OK |
| Alloy | Docker timestamp | UTC | OK |
| Loki | nanosecond epoch | UTC | OK |

**GAP:** ESP32 Timestamps sind `millis()` (Boot-relative), nicht UTC wall-clock. Korrelation mit Server-Timestamps erfordert Offset-Berechnung via Heartbeat-Timestamps.

---

## Zusammenfassung: Offene Luecken

### CRITICAL (Datenfluss unterbrochen)

| ID | Problem | Impact |
|----|---------|--------|
| **B1** | ContextVar-Propagation durch BaseHTTPMiddleware fehlerhaft -- `request_id` ist IMMER `"-"` in Logs | End-to-End-Korrelation komplett nicht funktional |
| **D1** | PostgreSQL `logging_collector=on` leitet Logs in Datei statt stdout -- Loki hat KEINE PG-Logs | DB-Debugging nur ueber direkten File-Zugriff oder `docker exec` |

### HIGH (Daten unvollstaendig)

| ID | Problem | Impact |
|----|---------|--------|
| **A1** | Alloy ESP32-Pipeline erwartet JSON, ESP32 sendet Plain-Text -- Level/Device/Component nicht extrahiert | ESP32-Logs in Loki ohne Metadata-Labels |
| **B2** | MQTT-Subscriber ContextVar Propagation -- `run_coroutine_threadsafe` propagiert ContextVar nicht | MQTT-Handler-Logs haben keine Correlation-ID |
| **C1** | Frontend createLogger() JSON geht an Browser-Console, nicht Docker stdout -- Alloy findet kein JSON | Frontend-Logs in Loki ohne Level/Component |

### MEDIUM (Komfort/Vollstaendigkeit)

| ID | Problem | Impact |
|----|---------|--------|
| **D2** | PostgreSQL Log-Volume I/O Error (`could not write to log file`) | PG-Logs moeglicherweise nicht persistent |
| **G1** | Uvicorn Access-Logs werden nicht von Alloy geparst (kein Regex-Match) | Uvicorn-Logs in Loki ohne Level/Logger Metadata |
| **G2** | ESP32 Timestamps sind millis() statt UTC wall-clock | Cross-Layer Timestamp-Korrelation erfordert Offset |

---

## Fix-Liste (Priorisiert)

### FIX-1: Request-ID ContextVar Propagation (CRITICAL)

**Problem:** Starlette `BaseHTTPMiddleware` kopiert ContextVar nicht.
**Fix:** Middleware auf pure ASGI Middleware umstellen.

```python
# REPLACE: class RequestIdMiddleware(BaseHTTPMiddleware)
# WITH: Pure ASGI middleware
from starlette.types import ASGIApp, Receive, Scope, Send

class RequestIdMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        request_id = None
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"x-request-id":
                request_id = header_value.decode()
                break

        request_id = request_id or generate_request_id()
        token = set_request_id(request_id)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            clear_request_id()
```

**Betroffene Dateien:**
- `El Servador/god_kaiser_server/src/middleware/request_id.py`
- `El Servador/god_kaiser_server/src/main.py` (Middleware-Registration)
- `El Servador/god_kaiser_server/src/core/request_context.py` (`set_request_id` muss Token zurueckgeben)

### FIX-2: PostgreSQL Logs nach stdout (CRITICAL)

**Problem:** `logging_collector = on` leitet alles in Datei.
**Fix:** `logging_collector = off` setzen. Docker json-file driver uebernimmt die Persistenz.

```conf
# docker/postgres/postgresql.conf
# CHANGE:
logging_collector = off
# REMOVE:
# log_directory = '/var/log/postgresql'
# log_filename = 'postgresql-%Y-%m-%d.log'
# log_file_mode = 0644
# log_rotation_age = 1d
# log_rotation_size = 50MB
# log_truncate_on_rotation = on
```

**Zusaetzlich:** Alloy-Pipeline fuer `postgres` ergaenzen (Level-Extraktion aus PG-Logformat):

```alloy
stage.match {
    selector = "{compose_service=\"postgres\"}"

    stage.regex {
        expression = "(?P<level>LOG|WARNING|ERROR|FATAL|PANIC)"
    }
    stage.labels {
        values = { "level" = "" }
    }
}
```

### FIX-3: Alloy-Pipeline fuer Postgres Level-Extraktion (HIGH)

Siehe FIX-2 (Alloy-Ergaenzung). Aktuell werden nur Checkpoint-Logs gedroppt, aber kein Level extrahiert.

### FIX-4: MQTT ContextVar Propagation (HIGH)

**Problem:** `run_coroutine_threadsafe()` propagiert ContextVar nicht.
**Fix:** Context explizit kopieren via `copy_context()`.

```python
# subscriber.py:_execute_handler()
import contextvars

# AFTER set_request_id(correlation_id):
ctx = contextvars.copy_context()
future = asyncio.run_coroutine_threadsafe(
    ctx.run(handler, topic, payload),  # Nein -- ctx.run ist sync
    main_loop
)
# Besser: Wrapper-Coroutine
async def _run_with_context(handler, topic, payload, correlation_id):
    set_request_id(correlation_id)
    try:
        return await handler(topic, payload)
    finally:
        clear_request_id()

future = asyncio.run_coroutine_threadsafe(
    _run_with_context(handler, topic, payload, correlation_id),
    main_loop
)
```

**Betroffene Datei:** `El Servador/god_kaiser_server/src/mqtt/subscriber.py`

### FIX-5: Frontend Logging fuer Docker (MEDIUM)

**Problem:** `createLogger()` JSON geht an Browser-Console, nicht Docker stdout.
**Akzeptanz:** Frontend-Container ist ein Vite Dev Server. Produktiv wuerde nginx statische Dateien servieren und es gaebe keine Client-Side-Logs in Docker. Der Error-Forwarding-Endpoint (`/logs/frontend`) ist der korrekte Pfad.

**Empfehlung:** Alloy-Pipeline fuer `el-frontend` auf Vite-Format anpassen ODER akzeptieren dass nur Backend-forwarded Errors in Loki landen. Kein Code-Change noetig, nur Dokumentation.

### FIX-6: PostgreSQL Log-Volume Permission (MEDIUM)

**Problem:** `could not write to log file: I/O error`
**Fix:** Wird durch FIX-2 obsolet (logging_collector = off). Falls beibehalten:

```yaml
# docker-compose.yml - postgres volumes
volumes:
  - ./logs/postgres:/var/log/postgresql:rw
```

Sicherstellen dass `./logs/postgres/` existiert und schreibbar ist (Docker-UID 999 = postgres).

### FIX-7: Uvicorn Access-Log Format (LOW)

**Problem:** Uvicorn Access-Logs (`INFO: IP - "METHOD /path" STATUS`) werden nicht von Alloy Regex geparst.
**Fix:** Uvicorn Access-Log-Format anpassen oder dedizierte Alloy-Stage:

```alloy
// Fallback Regex for Uvicorn access logs
stage.regex {
    expression = "^(?P<level>\\w+):\\s+"
}
```

Alternativ: Uvicorn Access-Logs deaktivieren (`--access-log` Flag) und nur Custom-Logger nutzen.

---

## Konsistenz-Matrix (Gesamtbild)

| Merkmal | ESP32 | Server | Frontend | PostgreSQL |
|---------|-------|--------|----------|------------|
| Logs in Loki | Nur via serial-logger | OK (custom) | Nur Vite-Errors | NUR Boot-Meldung |
| Level-Label | NICHT extrahiert | OK (custom logs) | NICHT extrahiert | NICHT in Loki |
| Correlation-ID | Nicht vorhanden | BROKEN (immer "-") | Sendet X-Request-ID | N/A |
| Error-Codes | Via MQTT, nicht Serial | Via Logger | Via Backend-Endpoint | N/A |
| Timestamp UTC | Nein (millis) | Ja | Ja | Ja |
| Structured Metadata | Nur mit JSON-Bridge | logger, request_id | component (theoretisch) | N/A |
| Silent Failures | N/A | 5x except:pass (WS) | 1x catch(() => {}) | N/A |
| Noise Reduction | Log-Level Config | Library-Filter | Level Config | Checkpoint-Drop |

---

## Fazit

Die Logging-Infrastruktur ist ARCHITEKTONISCH gut designed (Alloy config, Structured Metadata, Error-Forwarding-Endpoint, Error-Code-Taxonomie). Die IMPLEMENTATION hat jedoch 2 kritische und 3 hohe Luecken:

1. **Request-ID ist KOMPLETT nicht funktional** wegen Starlette BaseHTTPMiddleware ContextVar Bug (FIX-1)
2. **PostgreSQL-Logs fehlen in Loki** wegen `logging_collector=on` (FIX-2)
3. **MQTT-Korrelation propagiert ContextVar nicht** ueber Thread-Grenzen (FIX-4)
4. **ESP32-Serial-Logs** werden von Alloy nicht korrekt geparst (FIX abhaengig von serial-logger JSON-Bridge)
5. **Frontend-Logs** sind Vite plain-text, nicht JSON (akzeptabel, Dokumentation noetig)

**Prioritaet:** FIX-1 > FIX-2 > FIX-4 > FIX-3 > FIX-5 > FIX-6 > FIX-7
