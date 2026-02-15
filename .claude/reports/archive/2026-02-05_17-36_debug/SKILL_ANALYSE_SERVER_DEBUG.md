# Skill-Analyse: server-debug

**Datum:** 2026-02-05 21:00 UTC
**Skill:** `server-debug`
**Fragen:** 14-16
**Status:** VOLLSTÄNDIG

---

## 14. Logging-Setup

**Datei:** `El Servador/god_kaiser_server/src/core/logging_config.py`

### Konfiguration

| Aspekt | Konfiguration | Environment Variable |
|--------|---------------|----------------------|
| Format | JSON oder Text | `LOG_FORMAT` |
| Level | INFO (default) | `LOG_LEVEL` |
| File Output | RotatingFileHandler | `LOG_FILE` |
| Max Size | 10MB | `LOG_FILE_MAX_BYTES` |
| Backup Count | 5 Dateien | `LOG_FILE_BACKUP_COUNT` |
| Encoding | UTF-8 | - |

### Log-Levels

| Level | Wert | Verwendung |
|-------|------|------------|
| DEBUG | 10 | Detaillierte Debugging-Info |
| INFO | 20 | Normale Operationen (Default) |
| WARNING | 30 | Unerwartete Situationen |
| ERROR | 40 | Fehler, System läuft weiter |
| CRITICAL | 50 | Schwere Fehler, System-Crash |

### JSON-Format (Zeile 24-60)

```json
{
    "timestamp": "2026-02-05 20:45:00",
    "level": "INFO",
    "logger": "module.name",
    "message": "Processing request",
    "module": "filename",
    "function": "function_name",
    "line": 123,
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### RequestIdFilter (Zeile 16-21)

```python
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = get_request_id() or "-"
        return True
```

- Fügt `request_id` zu jedem Log-Record
- Ermöglicht Request-Tracing durch alle Logs
- Bei MQTT-Handlers: `request_id = "-"` (kein HTTP-Request)

### External Library Noise Reduction (Zeile 148-150)

```python
logging.getLogger("paho.mqtt").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("asyncio").setLevel(logging.WARNING)
```

### Log-Rotation

| Aspekt | Konfiguration |
|--------|---------------|
| Trigger | Dateigröße > 10MB |
| Backup-Dateien | 5 (god_kaiser.log.1 bis .5) |
| Älteste Datei | Wird gelöscht |
| Kompression | Keine |

### Log-Datei-Struktur

```
logs/
├── god_kaiser.log       (aktuell)
├── god_kaiser.log.1     (vorherige)
├── god_kaiser.log.2
├── god_kaiser.log.3
├── god_kaiser.log.4
└── god_kaiser.log.5     (älteste)
```

---

## 15. Middleware-Chain

**Datei:** `El Servador/god_kaiser_server/src/main.py:84-300`

### Reihenfolge

```
Client Request
    ↓
1. RequestIdMiddleware (request_id generation)
    ↓
2. CORSMiddleware (Cross-Origin validation)
    ↓
3. Auth Middleware (JWT validation - in dependencies)
    ↓
4. Logging Middleware (request/response logging)
    ↓
5. Exception Handlers (global error handling)
    ↓
Endpoint Handler
    ↓
Response to Client
```

### 1. RequestIdMiddleware

**Datei:** `El Servador/god_kaiser_server/src/middleware/request_id.py:33-67`

```python
async def dispatch(self, request: Request, call_next: Callable) -> Response:
    # 1. Generate or extract request_id
    request_id = request.headers.get("X-Request-ID") or generate_request_id()

    # 2. Store in context (available to all handlers)
    set_request_id(request_id)

    # 3. Process request
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000

    # 4. Log request metadata
    logger.info("Request completed: %s %s status=%d duration=%.1fms",
        request.method, request.url.path, response.status_code, duration_ms)

    # 5. Add X-Request-ID to response header
    response.headers["X-Request-ID"] = request_id

    # 6. Clear context
    clear_request_id()

    return response
```

### 2. CORSMiddleware

**Konfiguration:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 3. Auth Middleware (Dependency-Based)

**Datei:** `El Servador/god_kaiser_server/src/api/v1/dependencies.py`

```python
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    # JWT validation
    # Returns User or raises HTTPException(401)
```

### 4. Logging Middleware

- Request-Start geloggt
- Response-Ende geloggt mit Duration
- Error-Cases geloggt

### 5. Exception Handlers

**Datei:** `El Servador/god_kaiser_server/src/core/exception_handlers.py`

| Handler | Zeile | Exception | Response |
|---------|-------|-----------|----------|
| `automation_one_exception_handler` | 17-54 | GodKaiserException | `{"success": false, "error": {...}}` |
| `general_exception_handler` | 57-85 | Unerwartete Exceptions | Generic 500 |

#### automation_one_exception_handler (Zeile 17-54)

```python
async def automation_one_exception_handler(
    request: Request,
    exc: GodKaiserException
) -> JSONResponse:
    logger.warning(
        "GodKaiserException: %s (code=%s, path=%s, method=%s)",
        exc.message, exc.error_code, request.url.path, request.method
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.error_code,
                "message": exc.message
            }
        }
    )
```

#### general_exception_handler (Zeile 57-85)

```python
async def general_exception_handler(
    request: Request,
    exc: Exception
) -> JSONResponse:
    logger.error(
        "Unhandled exception: %s (path=%s, method=%s)",
        str(exc), request.url.path, request.method,
        exc_info=True  # Stack trace included
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred"
            }
        }
    )
```

---

## 16. Fehlerpfade

### DB-Connection Wegbruch

**Datei:** `El Servador/god_kaiser_server/src/db/session.py`

| Aspekt | Detail |
|--------|--------|
| Detection | SQLAlchemy OperationalError |
| Circuit Breaker | Öffnet nach 5 Failures |
| Recovery Timeout | 30s OPEN → 10s HALF_OPEN |
| Auswirkung | Alle DB-Operationen fehlschlagen |

**Betroffene Operationen:**
- Alle API-Endpoints (außer Health-Check)
- MQTT-Handler (können nicht in DB schreiben)
- WebSocket-Events (keine DB-Updates)

**Retry-Logic:**
```python
# Circuit Breaker Pattern
if circuit_breaker.is_open():
    raise CircuitBreakerOpenError()

try:
    result = await db_operation()
    circuit_breaker.record_success()
except OperationalError:
    circuit_breaker.record_failure()
    raise
```

### MQTT-Broker nicht erreichbar

#### ESP32-Seite

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp`

| Aspekt | Detail |
|--------|--------|
| Circuit Breaker | 5 failures → 30s OPEN |
| Reconnect Backoff | 1s → 2s → 4s → ... → 60s max |
| Offline-Buffer | 256 Messages |
| LWT | Last-Will-Testament gesendet |

#### Server-Seite

**Datei:** `El Servador/god_kaiser_server/src/mqtt/client.py`

| Aspekt | Detail |
|--------|--------|
| Reconnect | Automatisch via paho-mqtt |
| LWT-Handling | Server setzt ESP status = offline |
| Pending Commands | Werden im Offline-Buffer gehalten |

### HTTP Timeout

**Datei:** `El Servador/god_kaiser_server/src/core/config.py`

| Timeout | Default | Beschreibung |
|---------|---------|--------------|
| Request Timeout | 30s | Maximale Request-Dauer |
| DB Query Timeout | 10s | Maximale Query-Dauer |
| MQTT Publish Timeout | 5s | Maximale Publish-Dauer |

### Circuit Breaker Pattern

**Vorhanden in:**

| Komponente | Datei | Parameter |
|------------|-------|-----------|
| DB Session | `db/session.py` | 5 failures, 30s recovery |
| MQTT Client | `mqtt/client.py` | 5 failures, 30s recovery |
| HTTP Client | `services/http_client.py` | 3 failures, 60s recovery |

**States:**
```
CLOSED → (Failures ≥ Threshold) → OPEN
OPEN → (Recovery Timeout) → HALF_OPEN
HALF_OPEN → (Success) → CLOSED
HALF_OPEN → (Failure) → OPEN
```

---

## Server Error-Codes (5000-5999)

### MQTT Errors (5100-5199)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5101 | PUBLISH_FAILED | MQTT publish failed |
| 5102 | TOPIC_BUILD_FAILED | Topic build failed |
| 5103 | PAYLOAD_SERIALIZATION_FAILED | Payload serialization failed |
| 5104 | CONNECTION_LOST | MQTT connection lost |
| 5105 | RETRY_EXHAUSTED | Retry attempts exhausted |
| 5106 | BROKER_UNAVAILABLE | Broker unavailable |
| 5107 | AUTHENTICATION_FAILED | Auth failed |

### Database Errors (5200-5299)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5201 | DB_CONNECTION_FAILED | Connection failed |
| 5202 | DB_QUERY_FAILED | Query failed |
| 5203 | DB_TRANSACTION_FAILED | Transaction failed |
| 5204 | DB_CONSTRAINT_VIOLATION | Constraint violation |
| 5205 | DB_TIMEOUT | Query timeout |

### Service Errors (5400-5499)

| Code | Name | Beschreibung |
|------|------|--------------|
| 5401 | SERVICE_UNAVAILABLE | Service unavailable |
| 5402 | CIRCUIT_BREAKER_OPEN | Circuit breaker open |
| 5403 | RATE_LIMIT_EXCEEDED | Rate limit exceeded |
| 5404 | VALIDATION_FAILED | Validation failed |

---

## Kritische Dateien für server-debug

| Datei | Zweck |
|-------|-------|
| `El Servador/god_kaiser_server/src/core/logging_config.py` | Logging Setup |
| `El Servador/god_kaiser_server/src/middleware/request_id.py` | Request Tracking |
| `El Servador/god_kaiser_server/src/core/exception_handlers.py` | Error Handling |
| `El Servador/god_kaiser_server/src/db/session.py` | DB Circuit Breaker |
| `El Servador/god_kaiser_server/src/mqtt/client.py` | MQTT Circuit Breaker |
| `El Servador/god_kaiser_server/src/main.py` | Middleware Chain |
| `.claude/reference/errors/ERROR_CODES.md` | Error-Code Reference |

---

## Debug-Checkliste

### Bei API-Problemen

1. **Request-ID finden** (X-Request-ID Header)
2. **Logs durchsuchen** (`grep request_id logs/god_kaiser.log`)
3. **Error-Code identifizieren** (5xxx)
4. **Middleware-Phase identifizieren** (Auth? Validation? DB?)

### Bei DB-Problemen

1. **Circuit-Breaker-Status prüfen** (5402 = OPEN)
2. **PostgreSQL-Logs prüfen** (`make logs-db`)
3. **Connection-Pool prüfen** (Health-Endpoint)
4. **Query-Timeout prüfen** (5205)

### Bei MQTT-Problemen

1. **Broker-Status prüfen** (`make logs-mqtt`)
2. **Connection-Status prüfen** (Health-Endpoint)
3. **Offline-Buffer-Status prüfen**
4. **LWT-Messages prüfen**

### Log-Analyse-Befehle

```bash
# Alle Errors der letzten Stunde
grep '"level": "ERROR"' logs/god_kaiser.log | tail -100

# Bestimmte Request-ID verfolgen
grep "abc123" logs/god_kaiser.log

# Circuit-Breaker Events
grep "circuit_breaker" logs/god_kaiser.log

# MQTT Events
grep "mqtt" logs/god_kaiser.log
```
