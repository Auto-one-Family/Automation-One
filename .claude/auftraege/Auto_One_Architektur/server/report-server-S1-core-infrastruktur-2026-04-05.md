# Report S1 — Core-Infrastruktur (Config, Logging, Resilience, Health, Metrics)

**Datum:** 2026-04-05  
**Code-Wurzel:** `El Servador/god_kaiser_server/src/core/` (plus eng gekoppelte Health-/Runtime-Pfade)  
**Bezug Auftrag:** `auftrag-server-S1-core-infrastruktur-2026-04-05.md`

---

## 1. Kurzfassung

Das Backend bildet **Degradation** überwiegend über `RuntimeStateService` (Modus + `degraded_reason_codes`), MQTT-Connect-Status und Heartbeat-Telemetry ab. **Health-Endpoints ohne DB-Dependency** spiegeln **keine echte DB-Lebensfähigkeit** wider: Sie können weiterhin `healthy` melden, solange der Prozess läuft und MQTT verbunden ist. **`/detailed`** zeigt `database.connected=True` und Platzhalter-Werte (Pool, Latenz), sobald die Anfrage durchkommt — das ist **kein** unabhängiger DB-Integritätstest. **Liveness** (`/live`) prüft nur Prozesslebendigkeit.

---

## 2. Matrix: Signal | Bedeutung | gesetzt in | sichtbar als …

| Signal | Bedeutung | gesetzt in | sichtbar als … |
|--------|-----------|------------|----------------|
| `RuntimeMode.DEGRADED_OPERATION` | Server betreibt eingeschränkten Modus (z. B. MQTT beim Start nicht erreichbar) | `main.py`: `final_runtime_mode = ... DEGRADED_OPERATION if not connected` | `GET /api/v1/health/detailed` → `status: "degraded"` wenn `mode == "DEGRADED_OPERATION"`; `GET /api/v1/health/ready` → `runtime_mode` |
| `degraded_reason_codes` enthält `mqtt_disconnected` | MQTT nicht verbunden (Startup-Flag) | `main.py`: `await runtime_state.set_degraded_reason("mqtt_disconnected", not connected)` | `GET /api/v1/health/ready` → `degraded_reason_codes`; Logs bei MQTT-Startfehler |
| `ready == false` trotz `NORMAL_OPERATION` | Worker/Recovery/Logic nicht vollständig „grün“ | `runtime_state_service.py`: `ready = state == NORMAL_OPERATION and all(checks) and not degraded_reasons` | `GET /api/v1/health/ready` → `success`/`ready`; Metrik `god_kaiser_ready_blocked_total` (bei Übergang) |
| `mqtt_client.is_connected() == false` | Keine Broker-Verbindung | MQTT-Client-Zustand | `GET /api/v1/health/` → `status: "degraded"`; `GET /health` → `status: "degraded"`; `DetailedHealthResponse.mqtt.connected`; Gauge `god_kaiser_mqtt_connected` (Update-Pfad in `metrics.py` / Jobs) |
| Circuit Breaker `state == open` | Fail-fast nach Failure-Threshold (Registry) | `ResilienceRegistry.register_circuit_breaker` in `main.py` (`external_api`); MQTT/DB-Breaker in Client/DB-Init | `GET /api/v1/health/detailed` → `resilience.healthy == false`, `warnings`; Startup-Log `[resilience] Status: healthy=...` |
| Heartbeat `health_status` / Telemetry-Flags | Geräteseitige Degradation (Netzwerk, Persistenz, Runtime) | `esp_heartbeat.py`: `determine_health_status` (u. a. `network_degraded`, `persistence_degraded`, `mqtt_circuit_breaker_open`) | DB-Spalte/Heartbeat-Pipeline; Metriken `god_kaiser_heartbeat_firmware_flag_total` (Labels in `metrics.py`); Event-Aggregation in `event_aggregator_service.py` |
| `GodKaiserException` + `numeric_code` | Domänenfehler mit HTTP-Mapping | diverse Services/Router werfen Subklassen von `exceptions.py` | HTTP JSON `{ success: false, error: { code, numeric_code, ... } }` via `exception_handlers.py` |
| Strukturierte API-Fehler-Logs | Korrelation Request ↔ Fehler | `exception_handlers.py`: `logger.warning(..., extra={ error_code, numeric_code, request_id, ... })` | JSON-Log-Felder `error_code`, `numeric_code`, `request_id` (wenn Formatter `extra` ausgibt) |
| `god_kaiser_api_error_code_total` | Zählung API-Fehler nach Code | `increment_api_error_code` in `metrics.py`, Aufruf aus `automation_one_exception_handler` | Prometheus `/api/v1/health/metrics` |
| WebSocket `close code 4001` | Auth-/Token-Fehler am Handshake | `api/v1/websocket/realtime.py`: `await websocket.close(code=4001, reason=...)` | Client sieht Close-Code/Reason; Server-Logs `WebSocket connection rejected: ...` |
| `[resilience]` Logzeilen | Registry/Breaker-Lebenszyklus | `resilience/registry.py`, `main.py` | Text/JSON-Logs |

**Codeanker (Auszug):**

- Degradation MQTT + Runtime: `main.py` ca. 199–211, 964–965  
- Basic Health: `api/v1/health.py` 69–91  
- Detailed Health Aggregation: `api/v1/health.py` 191–219  
- DB-Platzhalter in Detailed: `api/v1/health.py` 126–133  
- Readiness: `api/v1/health.py` 439–481  
- Runtime Ready-Berechnung: `services/runtime_state_service.py` 127–153  
- Exception → HTTP: `core/exception_handlers.py` 70–121  
- Prometheus API errors: `core/metrics.py` (z. B. `API_ERROR_CODE_COUNTER`), `exception_handlers.py` 104–106  
- Heartbeat Degraded-Flags: `db/models/esp_heartbeat.py` 206–256  
- Resilience-Aggregation: `core/resilience/registry.py` 137–176  

---

## 3. Aufgabe 1 — Degradation-Signale

- **Prozess/Server:** `RuntimeMode` inkl. `DEGRADED_OPERATION` (`runtime_state_service.py`); Übergang bei Startup ohne MQTT (`main.py`).  
- **MQTT:** `set_degraded_reason("mqtt_disconnected", …)`; Basic- und Root-Health spiegeln `is_connected()` wider.  
- **Circuit Breaker:** Offene Breaker setzen Detailed-Health auf `degraded` (`health.py`).  
- **ESP/Firmware:** Heartbeat-Telemetry-Flags heben mindestens auf `degraded` (`determine_health_status` in `esp_heartbeat.py`).  
- **Bereitschaft:** `ready` kollabiert, wenn beliebiger Worker-Check false oder `degraded_reasons` nicht leer (`runtime_state_service.py`).

---

## 4. Aufgabe 2 — Health vs. Realität

**Ja, „grün“ bzw. irreführend positiv ist möglich:**

1. **`GET /api/v1/health/`** und **`GET /health`**: Prüfen **nur** MQTT-Verbindung, **nicht** DB, nicht Logic Engine, nicht WebSocket-Verarbeitung. Bei laufendem Prozess + MQTT „healthy“, obwohl DB-Pool erschöpft oder Queries dauernd fehlschlagen — solange kein Endpoint getroffen wird, sieht der Loadbalancer „healthy“.  
   - Code: `health.py` 75–80, `main.py` 1186–1193.

2. **`GET /api/v1/health/detailed`**: `DatabaseHealth.connected=True` ist **fest** gesetzt mit Kommentar „If we're here, DB is connected“ — das beweist höchstens, dass **diese eine** Session für die Anfrage geklappt hat; keine echte Last-/Timeout-Diagnose. `pool_available`, `latency_ms` sind Platzhalter.  
   - Code: `health.py` 126–133.

3. **`GET /api/v1/health/live`**: Kein Subsystem-Check — nur „Prozess antwortet“.  
   - Code: `health.py` 421–430.

4. **Gegenstück:** **`/ready`** kombiniert `runtime_snapshot["ready"]`, MQTT und setzt `database: True` ebenfalls ohne aktiven Ping — scheitert aber **indirekt**, wenn die DB-Session-Dependency für den Endpoint nicht aufgebaut werden kann (dann eher 5xx statt strukturiertes `ready: false`).  
   - Code: `health.py` 451–474.

**Fazit:** Für „Realbetrieb MQTT + DB“ ist **`/detailed` + Logs + Prometheus** nötig; schlanke **`/health`-Probes allein sind unzureichend** für vollständiges Bild.

---

## 5. Aufgabe 3 — Exception-Mapping

| Schicht | Mechanismus | Code |
|--------|---------------|------|
| HTTP API | `GodKaiserException` → `JSONResponse`, Status aus Exception | `exception_handlers.py` `automation_one_exception_handler` |
| Unerwartet | `Exception` → 500, generische Message | `exception_handlers.py` `general_exception_handler` |
| Audit | Fire-and-forget `AuditLogRepository.log_api_error` bei `numeric_code` | `exception_handlers.py` `_log_to_audit` |
| Metriken | `increment_api_error_code(numeric_code)` | `exception_handlers.py` |
| WebSocket | Kein zentrales JSON-Fehlerprotokoll wie REST; Verbindungsabbruch mit **Close-Code 4001** bei Auth-Fehlern | `api/v1/websocket/realtime.py` |
| MQTT (Server → Bus) | Kein symmetrischer „HTTP-Status“; Handler loggen und werfen/ignorieren je nach Handler — Publishes auf Error-Topics erfolgen **in den jeweiligen MQTT-Handlern/Services**, nicht in `exception_handlers` (out of scope S1, aber wichtig für E2E). |

---

## 6. Aufgabe 4 — Observability: konkrete Strings / Metrik-Namen

**Log-Präfixe / Schlüsselwort (Suche in Logs):**

- `[resilience]` — Registry/Breaker (`registry.py`, `main.py`)  
- `Runtime transition:` / `Runtime transition blocked:` — `runtime_state_service.py`  
- `API error:` — `exception_handlers.py` (mit `extra` error_code, numeric_code)  
- `WebSocket connection rejected:` — `api/v1/websocket/realtime.py`  
- `SECURITY CRITICAL` / `MQTT TLS is disabled` — `main.py`, `config`-Nutzung  
- `Failed to connect to MQTT broker during startup` — `main.py`  

**JSON-Log-Felder (bei `logging.format=json`):** `timestamp`, `level`, `logger`, `message`, `module`, `function`, `line`, `request_id`, optional `exception`, plus alles unter `record.extra` (`logging_config.py`).

**Prometheus-Metriken (Auswahl, Störfall-relevant):**

- `god_kaiser_mqtt_connected`, `god_kaiser_mqtt_messages_total`, `god_kaiser_mqtt_errors_total`  
- `god_kaiser_db_query_duration_seconds`  
- `god_kaiser_websocket_connections`, `god_kaiser_ws_disconnects_total`  
- `god_kaiser_ready_transition_total`, `god_kaiser_ready_blocked_total`  
- `god_kaiser_api_error_code_total` (Labels `error_code`, `source_type`)  
- `god_kaiser_heartbeat_firmware_flag_total` (Degradation-Flags aus Heartbeat)  
- `god_kaiser_connect_attempts_total`, `god_kaiser_disconnect_reason_total` (MQTT-Client-Lebenszyklus, siehe `metrics.py`)

---

## 7. Aufgabe 5 — Störfall-Matrix (≥3 Szenarien)

| Szenario | Erwartetes Signal | Wo sichtbar |
|----------|-------------------|-------------|
| **PostgreSQL langsam/timeouts** auf geschäftskritischen Endpoints | DB-Exceptions → `GodKaiserException` / 5301/5304; Histogram `god_kaiser_db_query_duration_seconds` nach oben | API-Response + Logs; Prometheus. **`GET /health` bleibt ggf. „healthy“**, wenn MQTT OK und Basic-Health genutzt wird. |
| **MQTT Broker disconnect** | `mqtt_disconnected` kann aktiv bleiben; `is_connected() == false` | Basic Health `degraded`; Detailed `warnings`; `god_kaiser_mqtt_connected` = 0; Logs Reconnect (MQTT-Client). |
| **Circuit Breaker OPEN** (z. B. `external_api` oder nach vielen DB-Fehlern) | `resilience.healthy == false` | Detailed Health `degraded` + Warning-Liste; Startup-Log-Zeile Resilience-Status; Registry-`get_health_status()`. |

---

## 8. Drift-Risiken (Dokumentation vs. Code)

- **`health.py` Docstring** erwähnt Instrumentator an `/metrics` — tatsächlich ist der Pfad unter Router **`/api/v1/health/metrics`** (`main.py` Instrumentator-`endpoint`).  
- **Kommentar in `main.py`**: „Circuit Breakers (mqtt, database, external_api)“ — stimmt mit Startup-Registrierung überein; **Detailed Health** zeigt aber nur, was in der Registry registriert ist; wenn Breaker nicht registriert wäre, fehlt Eintrag.  
- **DatabaseHealth**: Felder suggerieren echte Pool-Metriken — Code nutzt **Konstanten/Placeholder** (`pool_available=18`, `latency_ms=5.0`). Das ist ein **UX/Monitoring-Drift** (Dashboard sieht „healthy“ Datenbank mit erfundenen Zahlen).  
- **AutoOps health_check Plugin** behandelt Server-Status `healthy`/`degraded` — konsistent mit API; ältere `ok`-Semantik wird explizit erwähnt (`autoops/plugins/health_check.py`).

---

## 9. Gap-Liste (P0 / P1 / P2) — Bezug G2 (Vollständigkeit) / G4 (Degraded vs. scheinbar OK)

| ID | Schwere | Gap | Empfehlung |
|----|---------|-----|------------|
| G4-P0 | P0 | Basic `/health` und `/api/v1/health/` ignorieren DB und Runtime-`ready` | K8s: **Readiness** auf `/api/v1/health/ready` oder dedizierten DB+MQTT-Check; **Liveness** nur wo beabsichtigt. |
| G4-P0 | P0 | `DatabaseHealth` in `/detailed` ist teils **hart codiert** | Echten Pool-Status (SQLAlchemy pool) + optional `SELECT 1` mit Zeitmessung. |
| G2-P1 | P1 | Kein einheitlicher WebSocket-Fehler-Body wie REST | Dokumentierte Close-Codes + optional kleines JSON vor `close` (Contract mit Frontend). |
| G4-P1 | P1 | `readiness` setzt `database: True` ohne expliziten Check | Expliziter leichter DB-Ping in Readiness, konsistent zu Prometheus `db_query_duration`. |
| G2-P2 | P2 | MQTT-Fehlerpfade nicht über einen zentralen Mapper wie HTTP | Bereits Handler-spezifisch OK; für Observability ggf. einheitliche `numeric_code`-Logs bei Publish-Failures. |

---

## 10. Abnahme (Selbstcheck)

- Jede Zeile der Matrix (Abschnitt 2) ist mit mindestens einem **Codeanker** in Abschnitt 2 oder den folgenden Abschnitten belegt.  
- **Health-Endpoints:** Abhängigkeiten je Endpoint kurz:  
  - `/` — MQTT only.  
  - `/detailed` — MQTT, Runtime-Snapshot, Resilience, psutil, **DB nur implizit** (Dependency), DB-Felder teils Placeholder.  
  - `/ready` — Runtime-Snapshot + MQTT + implizite DB-Session.  
  - `/live` — keine externen Dependencies.  
  - `/esp` — DB + Auth.  
  - `/metrics` — Prometheus-Registry.

---

*Ende Report S1*
