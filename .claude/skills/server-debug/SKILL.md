---
name: server-debug
description: |
  Server-Log Analyse für God-Kaiser Server (FastAPI/Python).
  Analysiert JSON-Logs, MQTT-Handler-Verhalten, Startup-Sequenz,
  Error-Codes 5000-5699, Database-Operationen, WebSocket-Events.
  Liest Session-Kontext aus STATUS.md, schreibt strukturierte Reports.
allowed-tools: Read, Grep, Glob
---

# Server Debug - Skill Dokumentation

> **Fokus:** FastAPI Backend Log-Analyse und Fehlerpfad-Diagnose
> **Log-Quelle:** Container `/app/logs/god_kaiser.log` (~JSON-Format)

---

## 0. Quick Reference - Debug-Fokus

| Ich analysiere... | Primäre Quelle | Grep-Pattern |
|-------------------|----------------|--------------|
| **Request-Tracing** | god_kaiser.log | `"request_id": "UUID"` |
| **MQTT Handler Fehler** | god_kaiser.log | `src.mqtt.handlers` |
| **Circuit Breaker Events** | god_kaiser.log | `[resilience]` |
| **Unhandled Exceptions** | god_kaiser.log | `Unhandled exception` |
| **Startup-Probleme** | god_kaiser.log | `God-Kaiser Server` |
| **Error-Codes** | god_kaiser.log | `[5xxx]` |

### Was ist NICHT mein Bereich?

| Symptom | Weiterleiten an |
|---------|----------------|
| MQTT-Traffic auf Broker-Level | mqtt-debug |
| ESP32 Serial-Logs | esp32-debug |
| Frontend Build/Runtime | frontend-debug |
| Datenbank-Schema/Migrations | db-inspector |

---

## 1. Log-Location & Format

### Primäre Quelle

| Attribut | Wert |
|----------|------|
| **Pfad (Container)** | `/app/logs/god_kaiser.log` |
| **Pfad (Host)** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Format** | JSON (konfigurierbar via `LOG_FORMAT` env) |
| **Rotation** | Konfigurierbar via Settings (Default: 10 MB, 5 Backup-Dateien) |
| **Encoding** | UTF-8 |
| **Zugriff** | `make logs-server` oder `make shell-server` |

**Rotation-Settings:**
- `settings.logging.file_max_bytes` (Default: 10485760 = 10 MB)
- `settings.logging.file_backup_count` (Default: 5)

### JSON-Felder

```json
{
  "timestamp": "2026-02-04 14:30:45",
  "level": "INFO|WARNING|ERROR|CRITICAL",
  "logger": "src.mqtt.handlers.sensor_handler",
  "message": "Sensor data saved: id=123",
  "module": "sensor_handler",
  "function": "handle_sensor_data",
  "line": 296,
  "request_id": "abc123-def456"
}
```

| Feld | Debug-Verwendung |
|------|------------------|
| `level` | Schweregrad-Filter (ERROR/CRITICAL zuerst) |
| `logger` | Handler-Zuordnung (siehe Section 4) |
| `message` | Details, enthält oft `[5xxx]` Error-Codes |
| `line` | Code-Location für Entwickler |
| `request_id` | Request-Tracing (UUID oder `-` bei MQTT-Handlers) |
| `exception` | Voller Traceback (nur bei Fehlern mit `exc_info=True`) |

### Noise-Reduction (bereits im System aktiv)

```python
logging.getLogger("paho.mqtt").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("asyncio").setLevel(logging.WARNING)
```

---

## 2. Request-Tracing

Jeder HTTP-Request bekommt eine UUID via `RequestIdMiddleware` (Zeile 24-67 in `middleware/request_id.py`).

### Wie funktioniert es?

1. Client sendet Request (mit oder ohne `X-Request-ID` Header)
2. Middleware generiert UUID falls nicht vorhanden
3. UUID wird in ContextVar gespeichert (`RequestIdFilter`)
4. Alle Log-Einträge während des Requests enthalten `request_id`
5. Response erhält `X-Request-ID` Header

### Request-Tracing Grep-Pattern

```bash
# Bestimmten Request tracen
grep "REQUEST_ID_HERE" /app/logs/god_kaiser.log

# Alle Requests mit Dauer anzeigen
grep "Request completed" /app/logs/god_kaiser.log

# Langsame Requests (>1000ms)
grep "duration=" /app/logs/god_kaiser.log | grep -E "duration=[0-9]{4,}"
```

### MQTT-Handler haben request_id = "-"

MQTT-Handler laufen außerhalb des HTTP-Request-Kontexts, daher:
- `request_id` = `-` (Bindestrich)
- Korrelation über `esp_id` oder `topic` im Message-Feld

---

## 3. Middleware-Chain (Reihenfolge!)

Die Middleware-Reihenfolge in FastAPI ist KRITISCH. Probleme hier können zu mysteriösen Fehlern führen.

**WICHTIG:** FastAPI/Starlette Middleware folgt LIFO (Last In, First Out). Die zuletzt hinzugefügte Middleware wird zuerst ausgeführt.

| Position (Ausführung) | Middleware | Funktion | Fehler-Symptom |
|-----------------------|------------|----------|----------------|
| 1 | `CORSMiddleware` | Cross-Origin Validation | CORS-Fehler im Frontend |
| 2 | `RequestIdMiddleware` | UUID generieren/extrahieren | Fehlende request_id in Logs |
| 3 | Auth Dependencies | JWT Validation (pro Endpoint) | 401/403 Responses |

**Code (main.py Zeile 631-643):**
```python
app.add_middleware(RequestIdMiddleware)  # Hinzugefügt zuerst
app.add_middleware(CORSMiddleware, ...)  # Hinzugefügt zuletzt → ausgeführt zuerst
```

### Middleware-Fehler im Log

| Log-Pattern | Bedeutung | Lösung |
|-------------|-----------|--------|
| `Request failed: ... duration=Xms` | Exception während Request | Stack Trace prüfen |
| `CORS preflight request` | OPTIONS Request | Prüfe `cors_origins` Setting |

---

## 4. Exception-Handler-Hierarchie

Zwei globale Exception-Handler in `exception_handlers.py`:

### 1. automation_one_exception_handler (Zeile 17-54)

| Attribut | Wert |
|----------|------|
| **Fängt** | `GodKaiserException` (alle bekannten Fehler) |
| **Log-Level** | WARNING |
| **Response** | `{"success": false, "error": {"code": "...", "message": "..."}}` |

**Log-Pattern:**
```
API error: ERROR_CODE - Error message
```

### 2. general_exception_handler (Zeile 57-85)

| Attribut | Wert |
|----------|------|
| **Fängt** | `Exception` (alles andere) |
| **Log-Level** | ERROR mit `exc_info=True` (Stack Trace!) |
| **Response** | `{"success": false, "error": {"code": "INTERNAL_ERROR"}}` |

**Log-Pattern:**
```
Unhandled exception: ExceptionType - Error message
```

**WICHTIG:** Wenn dieser Handler feuert → Bug gefunden! Der Stack Trace zeigt die Root Cause.

---

## 5. Circuit Breaker Diagnose

Drei Circuit Breaker im System (initialisiert in `main.py` Zeile 129-165):

**WICHTIG:** Alle Werte sind KONFIGURIERBAR via `settings.resilience.*` (nicht hardcoded!)

| Breaker | Datei | Setting-Prefix | Default |
|---------|-------|----------------|---------|
| **database** | `db/session.py` | `circuit_breaker_db_*` | 5/30s/10s |
| **mqtt** | `mqtt/client.py` | `circuit_breaker_mqtt_*` | 5/30s/10s |
| **external_api** | `main.py` | `circuit_breaker_api_*` | 3/60s/10s |

**Settings-Variablen:**
- `CIRCUIT_BREAKER_DB_FAILURE_THRESHOLD` / `_RECOVERY_TIMEOUT` / `_HALF_OPEN_TIMEOUT`
- `CIRCUIT_BREAKER_MQTT_FAILURE_THRESHOLD` / `_RECOVERY_TIMEOUT` / `_HALF_OPEN_TIMEOUT`
- `CIRCUIT_BREAKER_API_FAILURE_THRESHOLD` / `_RECOVERY_TIMEOUT` / `_HALF_OPEN_TIMEOUT`

### Circuit Breaker States

```
CLOSED → (failures >= threshold) → OPEN → (recovery_timeout) → HALF_OPEN → (success) → CLOSED
                                           ↓
                                     (failure) → OPEN
```

### Log-Patterns für Circuit Breaker

```bash
# Alle Circuit Breaker Events
grep -i "\[resilience\]" /app/logs/god_kaiser.log

# Circuit Breaker OPEN (Service blockiert)
grep "Circuit Breaker" /app/logs/god_kaiser.log

# Database Circuit Breaker
grep "\[resilience\] Database" /app/logs/god_kaiser.log

# MQTT Circuit Breaker
grep "\[resilience\] MQTT" /app/logs/god_kaiser.log
```

### Typische Circuit Breaker Fehler

| Log-Message | Bedeutung | Aktion |
|-------------|-----------|--------|
| `Database operation blocked by Circuit Breaker` | DB-Breaker OPEN | PostgreSQL prüfen |
| `MQTT publish blocked by Circuit Breaker` | MQTT-Breaker OPEN | Mosquitto prüfen |
| `CircuitBreaker reset on connect` | Breaker zurückgesetzt | Service wieder verfügbar |

---

## 6. Fehlerpfad-Diagnose

### DB-Connection weg

**Symptome im Log:**
```
SQLAlchemy OperationalError
[5301] Database query failed
[resilience] Database operation blocked by Circuit Breaker
```

**Auswirkung:** Alle Endpoints außer `/v1/health/live` schlagen fehl

**Recovery-Ablauf:**
1. 5 Fehler → Circuit Breaker OPEN (30s)
2. Nach 30s → HALF_OPEN (10s Test-Window)
3. Erfolgreiche Query → CLOSED

**Diagnose-Commands:**
```bash
# PostgreSQL Container Status
docker-compose ps postgres

# PostgreSQL Logs
make logs-db
```

---

### MQTT-Broker weg

**Symptome im Log:**
```
paho.mqtt WARNING/ERROR
[5104] CONNECTION_LOST
[5106] BROKER_UNAVAILABLE
MQTT broker unavailable: Connection refused
```

**Auswirkung:**
- Config-Push zu ESP32 fehlschlägt
- Keine Sensor-Daten vom ESP32
- ESP-Status wird nicht aktualisiert

**Recovery:**
- paho-mqtt Auto-Reconnect (exponential backoff, max 60s)
- Bei Reconnect: automatische Re-Subscription
- LWT-Handling für Offline-Detection

**Diagnose-Commands:**
```bash
# Mosquitto Status
docker-compose ps mosquitto

# MQTT Logs
make logs-mqtt
```

---

### Unerwartete Exception

**Symptome im Log:**
```
level: ERROR
Unhandled exception: ExceptionType - message
```

**Mit Stack Trace:**
```json
{
  "exception": "Traceback (most recent call last):\n  File ..."
}
```

**Aktion:**
1. Stack Trace vollständig lesen
2. Root Cause identifizieren (welche Zeile, welche Funktion)
3. Bug dokumentieren mit Code-Location

---

## 7. Error-Codes Server (5000-5999)

### Ranges

| Range | Kategorie | Typische Ursachen |
|-------|-----------|-------------------|
| **5000-5099** | CONFIG | ESP nicht gefunden, Config-Build fehlgeschlagen |
| **5100-5199** | MQTT | Publish failed, Connection lost, Broker unavailable |
| **5200-5299** | VALIDATION | Ungültige ESP-ID, GPIO, fehlende Felder |
| **5300-5399** | DATABASE | Query failed, Integrity error, Connection lost |
| **5400-5499** | SERVICE | Timeout, Rate limit, Circuit breaker open |
| **5500-5599** | AUDIT | Audit logging fehlgeschlagen |
| **5600-5699** | SEQUENCE | Actuator locked, Safety blocked, Sequence errors |

### Häufige Error-Codes

| Code | Name | Log-Pattern | Lösung |
|------|------|-------------|--------|
| 5001 | `ESP_DEVICE_NOT_FOUND` | `[5001] ESP device not found: {esp_id}` | ESP registrieren |
| 5104 | `CONNECTION_LOST` | `[5104] MQTT connection lost` | Broker prüfen |
| 5106 | `BROKER_UNAVAILABLE` | `[5106] MQTT broker unavailable` | Mosquitto Status |
| 5201 | `INVALID_ESP_ID` | `[5201] Invalid ESP device ID format` | ESP-ID Format prüfen |
| 5205 | `MISSING_REQUIRED_FIELD` | `[5205] Missing required field: {field}` | Payload prüfen |
| 5301 | `QUERY_FAILED` | `[5301] Database query failed` | PostgreSQL prüfen |
| 5402 | `CIRCUIT_BREAKER_OPEN` | `Circuit Breaker` | Service prüfen |
| 5403 | `OPERATION_TIMEOUT` | `[5403] Service operation timed out` | Latenz-Problem |
| 5640 | `SEQ_ACTUATOR_LOCKED` | `[5640] Actuator locked by sequence` | Sequenz stoppen |
| 5642 | `SEQ_SAFETY_BLOCKED` | `[5642] Action blocked by safety` | Safety-Config |

### Error-Code Grep-Pattern

```bash
# Alle Server-Errors finden
grep -E "\[5[0-9]{3}\]" /app/logs/god_kaiser.log

# Bestimmte Error-Range
grep -E "\[53[0-9]{2}\]" /app/logs/god_kaiser.log  # DATABASE

# Error-Code Lookup
cat .claude/reference/errors/ERROR_CODES.md | grep "5301"
```

---

## 8. Health-Endpoints als Debug-Tool

| Endpoint | Auth | Nutzen für Debug |
|----------|------|-----------------|
| `/v1/health/live` | Nein | Server überhaupt da? |
| `/v1/health/ready` | Nein | DB + MQTT connected? |
| `/v1/health/` | Nein | mqtt_connected Status |
| `/v1/health/detailed` | JA | DB/MQTT/WS/System Details |
| `/v1/health/esp` | JA | ESP-Fleet-Übersicht |
| `/v1/health/metrics` | Nein | Prometheus-Format |

### Debug-Reihenfolge

```
1. /v1/health/live     → Server-Prozess läuft?
2. /v1/health/ready    → Kritische Dependencies OK?
3. /v1/health/detailed → Was genau ist kaputt?
```

### Health-Check via curl

```bash
# Liveness (sollte immer 200 sein)
curl http://localhost:8000/api/v1/health/live

# Readiness (200 wenn DB+MQTT OK)
curl http://localhost:8000/api/v1/health/ready

# Detailed (braucht Auth-Token)
curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/v1/health/detailed
```

---

## 9. Logger → Handler Zuordnung

| Logger-Name | Handler-Datei | Verantwortung |
|-------------|---------------|---------------|
| `src.mqtt.handlers.sensor_handler` | sensor_handler.py | Sensor-Daten empfangen |
| `src.mqtt.handlers.heartbeat_handler` | heartbeat_handler.py | Heartbeat, Discovery, Timeout |
| `src.mqtt.handlers.actuator_handler` | actuator_handler.py | Actuator-Status |
| `src.mqtt.handlers.actuator_response_handler` | actuator_response_handler.py | Command-Response |
| `src.mqtt.handlers.actuator_alert_handler` | actuator_alert_handler.py | Actuator-Alerts |
| `src.mqtt.handlers.config_handler` | config_handler.py | Config-ACK |
| `src.mqtt.handlers.lwt_handler` | lwt_handler.py | LWT (Offline-Detection) |
| `src.mqtt.handlers.error_handler` | error_handler.py | ESP32 Error-Events |
| `src.mqtt.handlers.zone_ack_handler` | zone_ack_handler.py | Zone-Assignment-ACK |
| `src.mqtt.handlers.subzone_ack_handler` | subzone_ack_handler.py | Subzone-ACK |
| `src.mqtt.subscriber` | subscriber.py | MQTT-Routing |
| `src.mqtt.client` | client.py | MQTT-Verbindung |
| `src.websocket.manager` | manager.py | WebSocket-Broadcasts |
| `src.db.session` | session.py | Database-Sessions |
| `src.services.maintenance.service` | service.py | Maintenance-Jobs |

---

## 10. Make-Targets & Grep-Patterns

### Nützliche Make-Targets

```bash
# Server-Logs live (Docker)
make logs-server

# Shell im Server-Container
make shell-server

# Quick Health-Check
make health

# Alle Services Status
make status
```

### Grep-Patterns für häufige Diagnosen

```bash
# Alle Errors
grep '"level": "ERROR"' /app/logs/god_kaiser.log

# Alle Criticals
grep '"level": "CRITICAL"' /app/logs/god_kaiser.log

# Circuit Breaker Events
grep -i "circuit" /app/logs/god_kaiser.log

# Bestimmten Request tracen
grep "REQUEST_ID" /app/logs/god_kaiser.log

# MQTT-bezogene Server-Logs
grep -i "mqtt" /app/logs/god_kaiser.log

# Unhandled Exceptions (Stack Traces)
grep -A 20 "Unhandled exception" /app/logs/god_kaiser.log

# Startup-Sequenz prüfen
grep "God-Kaiser Server" /app/logs/god_kaiser.log

# Handler-Registration
grep "Registered.*MQTT handlers" /app/logs/god_kaiser.log

# Langsame Requests (>1000ms) - vereinfacht
grep "duration=" /app/logs/god_kaiser.log
```

---

## 11. Startup-Sequenz (Modus: boot)

Erwartete Log-Reihenfolge bei erfolgreichem Server-Start (`main.py` Zeile 84-500):

| Step | Log-Pattern | Status |
|------|-------------|--------|
| 0 | `God-Kaiser Server Starting...` | ⬜ |
| 0.1 | `Validating security configuration...` | ⬜ |
| 0.5 | `Initializing resilience patterns...` | ⬜ |
| 1 | `Initializing database...` | ⬜ |
| 1.1 | `Database initialized successfully` | ⬜ |
| 1.2 | `[resilience] Database circuit breaker initialized` | ⬜ |
| 2 | `Connecting to MQTT broker...` | ⬜ |
| 2.1 | `MQTT client connected successfully` | ⬜ |
| 3 | `Registering MQTT handlers...` | ⬜ |
| 3.3 | `Registered {count} MQTT handlers` | ⬜ |
| 3.4 | `Initializing Central Scheduler...` | ⬜ |
| 3.4.1 | `SimulationScheduler initialized` | ⬜ |
| 3.4.2 | `MaintenanceService initialized and started` | ⬜ |
| 4 | `Subscribing to MQTT topics...` | ⬜ |
| 4.1 | `MQTT subscriptions complete` | ⬜ |
| 5 | `Initializing WebSocket Manager...` | ⬜ |
| 6 | `Initializing services...` | ⬜ |
| 6.1 | `Services initialized successfully` | ⬜ |
| FINAL | `God-Kaiser Server Started Successfully` | ⬜ |

### Failure-Patterns

| Pattern in Message | Bedeutung | Empfehlung |
|--------------------|-----------|------------|
| `SECURITY CRITICAL` | JWT-Secret nicht gesetzt | `.env` prüfen: `JWT_SECRET_KEY` |
| `Startup failed:` + Exception | Kritischer Fehler | Traceback analysieren |
| `Failed to connect to MQTT` | Broker nicht erreichbar | Mosquitto Status prüfen |
| `[resilience]` + `unavailable` | Circuit-Breaker bereits offen | Dependencies prüfen |

---

## 12. Cross-Layer Weiterleitung

| Server-Symptom | Weiterleiten an | Grund |
|----------------|-----------------|-------|
| `MQTT publish failed` | mqtt-debug | Broker-Level Problem |
| `ESP heartbeat missing` | esp32-debug | ESP-Firmware Problem |
| `Frontend WS disconnect` | frontend-debug | Client-Side Problem |
| `DB constraint violation` | db-inspector | Schema/Daten Problem |
| `Sensor data not arriving` | mqtt-debug + esp32-debug | Multi-Layer |

---

## 13. Referenzen

| Wann | Datei | Zweck |
|------|-------|-------|
| IMMER zuerst | `logs/current/STATUS.md` | Session-Kontext |
| IMMER | `logs/current/god_kaiser.log` | Analyse-Quelle |
| Bei Error-Codes | `.claude/reference/errors/ERROR_CODES.md` | Code-Lookup |
| Bei Handler-Details | `.claude/skills/server-development/SKILL.md` | Handler-Dokumentation |
| Bei MQTT-Fragen | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Schema |

---

## 14. Report-Template

```markdown
# Server Debug Report: [MODUS]

**Session:** [aus STATUS.md]
**Erstellt:** [Timestamp]
**Log-Datei:** logs/current/god_kaiser.log
**Zeilen analysiert:** [Anzahl]

---

## 1. Zusammenfassung

| Metrik | Wert |
|--------|------|
| CRITICAL | [Anzahl] |
| ERROR | [Anzahl] |
| WARNING | [Anzahl] |
| Betroffene Handler | [Liste] |
| Status | ✅ OK / ⚠️ WARNUNG / ❌ FEHLER |

---

## 2. Startup-Sequenz (nur bei Modus: boot)

| Step | Erwartet | Status | Timestamp |
|------|----------|--------|-----------|
| Database Init | `Database initialized successfully` | ✅/❌ | HH:MM:SS |
| MQTT Connect | `MQTT client connected successfully` | ✅/❌ | HH:MM:SS |
| Handler Registration | `Registered X MQTT handlers` | ✅/❌ | HH:MM:SS |
| Final | `God-Kaiser Server Started Successfully` | ✅/❌ | HH:MM:SS |

---

## 3. Errors & Warnings

### 3.1 CRITICAL (sofortige Aufmerksamkeit)

| Timestamp | Logger | Code | Message |
|-----------|--------|------|---------|
| [Zeit] | [Logger-Name] | [5xxx] | [Message] |

### 3.2 ERROR

| Timestamp | Logger | Code | Message | Line |
|-----------|--------|------|---------|------|
| [Zeit] | [Logger-Name] | [5xxx] | [Message] | :XX |

### 3.3 WARNING (relevant für Modus)

| Timestamp | Logger | Message |
|-----------|--------|---------|
| [Zeit] | [Logger-Name] | [Message] |

---

## 4. Handler-Analyse

### [Handler-Name] (z.B. sensor_handler)

**Status:** ✅ Funktioniert / ❌ Fehler

**Erfolgreiche Operationen:** [Anzahl]
**Fehlgeschlagene Operationen:** [Anzahl]

**Log-Auszug (bei Fehlern):**
```json
{"timestamp": "...", "level": "ERROR", ...}
```

**Analyse:** [Was bedeutet dieser Fehler?]

**Empfehlung:** [Was sollte geprüft werden?]

---

## 5. Nächste Schritte

1. [ ] [Konkrete Aktion basierend auf Findings]
2. [ ] [Weitere Aktion]
3. [ ] [Bei Bedarf: mqtt-debug/esp32-debug aktivieren]
```

---

**Version:** 1.0
**Erstellt:** 2026-02-06
**Basiert auf:** Server Code-Analyse (logging_config.py, exception_handlers.py, session.py, client.py, health.py, main.py)
