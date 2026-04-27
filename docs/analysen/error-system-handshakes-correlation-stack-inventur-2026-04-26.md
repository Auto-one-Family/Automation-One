# AUT-193 — Error-System / Handshakes / Correlation-IDs / Stack-Inventur

**Stand:** 2026-04-26  
**Linear:** [AUT-193](https://linear.app/autoone/issue/AUT-193)  
**Projekt:** Claude API Integration in AutomationOne (Phase 1–3)  
**Etappe:** 2 von 4 (parallel zu AUT-192) — blockiert AUT-194 (DailyAnalysisJob)

---

## Sektion 1 — Error-Quellen-Vollständigkeit

| Quelle | Format / Schema | Persistenz-Ort | Zugriffspfad | Stabile Spur? |
|--------|----------------|----------------|--------------|---------------|
| **FW / ESP32 Error (1000-4999)** | JSON: `{error_code, severity(0-3), category, message, context, ts}` — `error_tracker.h:98-109` | `audit_logs` (AuditEventType.MQTT_ERROR) via MQTT `kaiser/god/esp/{id}/system/error` | `GET /api/v1/errors/esp/{esp_id}` | **Ja** — persistiert mit Enrichment |
| **Server Error (5000-5999)** | 80+ Codes in `server_error_mapping.py:21-1320`, Kategorien: Config/MQTT/Validation/DB/Service/Auth/Sequence/Logic/Plugin/Notification | structlog → Loki (~24MB/day), `audit_logs` bei HTTP 5xx (`exception_handlers.py:89-118`) | Loki-Query oder `GET /api/v1/errors/summary` | **Ja (Loki)** — Lücke: DB schreibt nur bei `_log_to_audit` in exception_handlers, nicht bei jedem 5xxx |
| **MQTT LWT** | JSON: `{status: "offline", reason: "lwt"}` — QoS 1, retain=1, `mqtt_client.cpp:337-341` | `audit_logs` (AuditEventType.LWT_RECEIVED) + Prometheus `increment_esp_error` | Loki / AuditLog | **Ja** — kein LWT für Server selbst |
| **DB / audit_logs** | ORM: `AuditLog` (`audit_log.py:25`), Felder: event_type, severity, source_type, source_id, details(JSON), correlation_id, request_id | PostgreSQL `audit_logs` mit 8 Indizes inkl. `ix_audit_logs_created_at` | `AuditLogRepository`, direkt SQL | **Ja** |
| **DB / esp_heartbeat_logs** | ORM: `ESPHeartbeatLog` (`esp_heartbeat.py:59`), Felder: esp_id, device_id, timestamp, heap_free, wifi_rssi, uptime, sensor_count, health_status | PostgreSQL `esp_heartbeat_logs`, Retention 7d (HeartbeatLogCleanup-Job) | ORM / JOINs | **Ja** — kein Bus-Interface-Feld (i2c/onewire) |
| **DB / diagnostic_reports** | ORM: `diagnostic_reports` (`diagnostic.py:22`) | PostgreSQL | DB direkt | **Ja** |
| **DB / plugin_executions** | ORM: `plugin_executions` (`plugin.py:44`) — AutoOps-Plugin-Läufe | PostgreSQL | DB direkt | **Ja** |
| **DB / email_log** | ORM: `email_log` (`email_log.py:23`) — Delivery-Tracking | PostgreSQL | `EmailLogRepository` | **Ja** |
| **WS error_event** | Transient Broadcast: `ws_manager.broadcast("error_event", payload)` — `error_handler.py:257` | Kein Persist — nur Live-Broadcast | WS-Subscription Frontend | **Nein** — kein stabiler Trace nach Disconnect |
| **Frontend Browser-Errors** | Browser-Console, kein Loki-Sink, kein Server-Side-Logging | Nirgends | Nicht erreichbar | **Nein** — vollständiger Blind-Spot |
| **AutoOps Plugin-Berichte** | Markdown-Dateien in `autoops/reports/` — `reporter.py:52-189` | Filesystem (lokal, nicht in DB) | Datei-Zugriff | **Teilweise** — kein Retention-Management |
| **Mail / Email-Fehler** | `EmailLog` ORM + Server Error-Codes 5851-5853 | PostgreSQL `email_log` | `EmailLogRepository` | **Ja** |

**Quellen ohne stabile Spuren:**
- Frontend Browser-Errors (kein Sink zum Server)
- WS `error_event` (transient, nicht persistiert)
- AutoOps-Reports nur im Filesystem (nicht querybar per API)

---

## Sektion 2 — Handshake-Vollständigkeitscheck

### FW → MQTT (ESP32 → Broker)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Publish-Transport | ESP-IDF MQTT, `disable_clean_session=0` → `clean_session=true` (Broker löscht QoS-Queues bei Reconnect) | `mqtt_client.cpp:335` |
| Error-Publish | Fire-and-forget callback, kein ACK, Recursion-Guard via `mqtt_publish_in_progress_` | `error_tracker.h:49,139` |
| Heartbeat QoS | QoS 0 (Verlust by Design) | MQTT_TOPICS.md |
| LWT | QoS 1, retain=1 gesetzt | `mqtt_client.cpp:338-341` |
| **Handshake-Lücke** | Kein Delivery-Confirm für Error-Publishes; ESP weiß nicht ob Server empfangen hat | — |

**Fazit:** ESP → Broker vollständig für LWT und Actuator-Commands. Error-Publishes sind best-effort ohne Rückmeldung. By Design (Recursion-Prevention), bedeutet: Errors unter Broker-Ausfall gehen verloren.

### MQTT → Server (Broker → Handler)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Subscriber-Registrierung | `executor.submit()` mit ThreadPool, max_instances=1 per Job | `subscriber.py:210-228` |
| Correlation-ID-Generierung | Sofort beim Empfang: `generate_mqtt_correlation_id(esp_id, topic_suffix, seq)` | `subscriber.py:196` |
| Critical-Topic-Inbox | Bei kritischen Topics wird `_append_critical_inbound_event` aufgerufen vor Handler-Submit | `subscriber.py:202-207` |
| **Handshake-Lücke** | Bei `ServiceUnavailableError` (DB/MQTT Circuit Breaker offen) wird Error-Event gedropt: `return False` ohne Retry | `error_handler.py:264-269` |
| Retry | Kein Retry für dropped Events; `messages_failed` Counter inkrementiert | `subscriber.py:233` |

### Server → DB

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Session-Management | `resilient_session()` mit Circuit-Breaker | `error_handler.py:136` |
| Commit | Explizit nach `audit_repo.log_mqtt_error()` | `error_handler.py:198` |
| AI-Task | `asyncio.create_task(_enrich_error_with_ai(...))` nach Commit — fire-and-forget | `error_handler.py:202-208` |
| **Handshake-Lücke** | Kein Retry bei DB-Commit-Fehler — Error wird gedropt wenn Postgres nicht erreichbar | — |

### Server → MQTT outbound (ACK/Commands)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Heartbeat-ACK | QoS 1, fire-and-forget, Publish vor DB-Writes (SAFETY-P5 Fix-3) | `heartbeat_handler.py:436-459, 1724` |
| ACK bei Validation-Fehler | `_send_heartbeat_error_ack()` wird aufgerufen — ACK kommt mit Fehlercode | `heartbeat_handler.py:359-364` |
| ACK bei Discovery-Rate-Limit | **Kein ACK** — `return True` still | `heartbeat_handler.py:386-387` |
| MQTTCommandBridge | `asyncio.Future`-basiert, DEFAULT_TIMEOUT=15s | SKILL-Referenz |
| Config-Push-Cooldown | 45s (`CONFIG_PUSH_COOLDOWN_SECONDS`) | `heartbeat_handler.py:78` |
| **Handshake-Lücke** | `_send_heartbeat_ack` bei Fehler: nur `logger.warning`, kein Retry | `heartbeat_handler.py:1741-1742` |

### Server → WS-Clients

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Broadcast-Mechanismus | `ws_manager.broadcast("error_event", payload)` — fire-and-forget | `error_handler.py:257` |
| Fehler bei Broadcast | Exception wird geswallowed: `except Exception as e: logger.warning(...)` | `error_handler.py:259-260` |
| Correlation-ID-Propagation | `envelope_correlation = correlation_id if correlation_id is not None else get_request_id()` | `websocket/manager.py:234` |
| **Handshake-Lücke** | WS-Error-Event nicht persistiert — bei Disconnect verloren | — |

### Frontend → Server

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| HTTP request_id | `X-Request-ID`-Header, bei Fehlendem UUID generiert | `middleware/request_id.py:47-54` |
| Response-Header | `x-request-id` in Response zurückgegeben | `middleware/request_id.py:73` |
| Fehler-Rückgabe | HTTP 4xx/5xx mit `{"detail": "...", "request_id": "uuid"}` | `exception_handlers.py:60,99` |
| **Handshake-Lücke** | Frontend-seitige JS-Errors werden nicht zum Server reported — kein Error-Sink | — |

---

## Sektion 3 — Correlation-ID-Inventur

### Erzeugung

**Firmware (ESP32):** Erzeugt **keine** `correlation_id` eigenständig. Der Server injiziert sie bei Empfang.

**Server — MQTT-Pfad:** `subscriber.py:196` erzeugt beim Empfang:
```
correlation_id = generate_mqtt_correlation_id(esp_id, topic_suffix, seq)
# Format: {esp_id}:{topic_suffix}:{seq}:{timestamp_ms}
# Beispiel: ESP_12AB34CD:data:142:1708704000000
```
(`request_context.py:44-60`)

**Server — HTTP-Pfad:** `RequestIdMiddleware` (`middleware/request_id.py:47-54`) generiert UUID aus `X-Request-ID`-Header oder neu.

**Server — outbound MQTT (Publisher):** `publisher.py:134` generiert UUID als `request_id` wenn kein `correlation_id` übergeben wird, setzt `payload["correlation_id"] = request_id` und `payload["intent_id"] = request_id`.

### Propagation

| Schicht | Propagiert? | Mechanismus | Verlustpunkt |
|---------|------------|-------------|--------------|
| MQTT-Empfang → Handler | Ja | `set_correlation_id(correlation_id)` in ContextVar (`subscriber.py:324`) | — |
| Handler → DB (AuditLog) | Ja | `audit_log_repo.py:52-53`: `get_request_id()` auto-injiziert | Wenn ContextVar nicht gesetzt (async Task-Sprung ohne Copy) |
| Handler → WS-Broadcast | Ja | `ws_manager.broadcast(..., correlation_id=correlation_id)` — `manager.py:234` | — |
| MQTT-outbound (ACK/Command) | Ja | `publisher.py:99-100`: `payload["correlation_id"] = correlation_id` | Nur wenn Caller übergibt |
| HTTP-Request → Exception | Ja | `exception_handlers.py:89,99`: `request_id = get_request_id()` | — |
| Server → AI-Task (fire-and-forget) | **Nein** | `asyncio.create_task()` ohne ContextVar-Copy — neuer Task hat keine correlation_id | **Kettenverlust** |
| Heartbeat-Payload vom ESP | Optional | `HeartbeatHandler._extract_correlation_id(payload)` gibt `None` zurück wenn leer | ESP sendet keine stabile correlation_id |

### C6-Regel — Formaler Beleg (PFLICHT)

**Regel C6:** `correlation_id` (MQTT, Format `{esp_id}:{topic}:{seq}:{ts_ms}`) und `request_id` (HTTP REST, Format UUID4) dürfen **NICHT blind gejoined** werden.

**Beleg aus dem Code:**

`request_context.py:7-10` dokumentiert die Koexistenz explizit:
```
Two ID types coexist:
- REST requests: UUID (generated by RequestIdMiddleware or received via X-Request-ID header)
- MQTT messages: Human-readable format {esp_id}:{topic_suffix}:{seq}:{timestamp_ms}
```

In `subscriber.py:325` setzt der MQTT-Pfad `set_request_id(correlation_id)` — d.h. der `request_id`-ContextVar wird mit einer MQTT-Correlation-ID (kein UUID) befüllt. In `audit_log_repo.py:52-53` liest `create()` diesen Wert mit `get_request_id()` und persistiert ihn als `AuditLog.request_id`.

Das bedeutet: `AuditLog.request_id` enthält **entweder** eine UUID (HTTP-Kontext) **oder** einen MQTT-Correlation-String (MQTT-Kontext). Ein direkter JOIN würde fälschlicherweise MQTT-Events mit HTTP-Events verknüpfen.

**Sicheres Mapping:** JOIN nur wenn `source_type = 'mqtt'` auf beiden Seiten UND das Format explizit geprüft wurde. HTTP-REST-Events über `source_type = 'api'` separat identifizierbar.

### trace_id-Konzept (non-breaking, additiv)

```
trace_id = UUID (einmalig erzeugt bei HTTP-Request-Eingang ODER beim ersten MQTT-Publish)

HTTP-Request → trace_id = request_id (UUID)
  → DB-Commit: AuditLog.trace_id = trace_id
  → MQTT-Publish: payload["trace_id"] = trace_id
    → ESP sendet Response mit trace_id zurück
    → Server empfängt: correlation_id = generate(...), trace_id aus Payload extrahiert
    → DB-Commit: AuditLog.trace_id = trace_id (Original aus HTTP-Kette)
    → WS-Broadcast: data["trace_id"] = trace_id
```

**Technische Voraussetzungen:** `AuditLog` bekommt Spalte `trace_id UUID nullable`, MQTT-Payloads bekommen optionales `trace_id`-Feld (backward-compatible), WS-Events propagieren es durch. **Kein Breaking Change** — alle Felder nullable.

---

## Sektion 4 — False-Error-Pattern-Katalog

### Pattern 1: Heartbeat-ACK-Delay

**Symptom:** Heartbeat empfangen, kein ACK im erwarteten Zeitfenster (<1s). ESP-Seite sieht P1-Timer nicht zurückgesetzt.

**Erkennungs-Heuristik:** `observe_heartbeat_ack_latency_ms()` Prometheus-Metrik erhöht sich. In Loki: `"Early ACK sent for"` fehlt. Kein echter Fehler wenn ACK innerhalb des nächsten Heartbeat-Zyklus (60s) kommt.

**Mechanismus:** SAFETY-P5 Fix-3 sendet ACK vor DB-Writes (`heartbeat_handler.py:436-459`). Bei MQTT-Broker-Backpressure Verzögerung bis `DEFAULT_TIMEOUT=15s`.

**System-Prompt-Beschreibung:** Heartbeat-ACK-Delay ist kein Fehler wenn Latenz unter einem Heartbeat-Intervall (60s) bleibt. ACK kommt vor DB-Writes (SAFETY-P5). Fehlender ACK bei Validation-Fehlern ist by Design (`_send_heartbeat_error_ack` liefert Error-ACK). Kein ACK bei Discovery-Rate-Limit ist by Design.

---

### Pattern 2: Reconnect-Storm

**Symptom:** Rapid-fire Heartbeats nach ESP-Reconnect. Config-Push-Duplicate. Multiple `correlation_id`-Einträge für denselben ESP in kurzer Zeit.

**Erkennungs-Heuristik:** `increment_connect_attempt()` Prometheus-Metrik steigt. Loki: `"State push deferred for %s: config push pending"` wiederholt. `clean_session=true` (`mqtt_client.cpp:335`) löscht QoS-2-Queue beim Reconnect.

**Mechanismus:** `RECONNECT_THRESHOLD_SECONDS=60` (`heartbeat_handler.py:67`). Config-Push-Cooldown 45s (`CONFIG_PUSH_COOLDOWN_SECONDS`, `heartbeat_handler.py:78`). Nach ~120s korrigiert nächster Heartbeat.

**System-Prompt-Beschreibung:** Reconnect-Storm entsteht nach ESP-Reboot oder Netz-Unterbrechung >60s. Multiple Heartbeat-Einträge und Config-Push-Logs innerhalb 0-120s nach Reconnect sind normal. Echter Fehler: Config-Push fehlt nach >180s.

---

### Pattern 3: Config-Push-Chattering

**Symptom:** Wiederholte Config-Push-Logs ohne erkennbare Konfigurationsänderung.

**Erkennungs-Heuristik:** Loki: `"config_push_reason"` im Metadata wiederholt. `_config_push_pending_esps` Set enthält ESP dauerhaft.

**Mechanismus:** 6 Caller triggern Config-Push (Heartbeat, Zone-Assign, Subzone-Assign, Sensor-Create, Actuator-Create, Manual-Push). Nur Heartbeat-Pfad hat 45s-Cooldown. Andere Caller haben keinen Cooldown-Gate.

**System-Prompt-Beschreibung:** Config-Push-Chattering: Mehrfache Config-Pushes <45s für denselben ESP sind bekanntes Muster bei gleichzeitigen Konfigurations-Aktionen. Echter Fehler: Config-Response bleibt aus.

---

### Pattern 4: F-V4-01-artige Race Conditions bei Server-Restart

**Symptom:** Zone/Subzone-ACK-Handler empfängt Response aus Pre-Restart-Session. String-Matching auf `status`-Feld liefert Falsch-Positiv.

**Erkennungs-Heuristik:** `zone_ack_handler` (`main.py:58,288`) verarbeitet `kaiser/+/esp/+/zone/ack`-Messages. Nach Server-Restart keine Session-State → Handler interpretiert alte retained Messages als neue ACKs.

**System-Prompt-Beschreibung:** Post-Restart Race: Innerhalb der ersten 30s nach Server-Restart können Zone/Subzone-ACKs aus der vorherigen Session eintreffen. Erkennbar an veralteten Timestamps im Payload (esp_timestamp << server_time). MQTTCommandBridge hat kein Session-Epoch-Gate für diese Handler.

---

### Pattern 5: LWT-Flood bei vielen gleichzeitig offline gehenden Devices

**Symptom:** Viele simultane LWT-Messages, DB-Write-Überlastung, Connection-Pool-Spike.

**Erkennungs-Heuristik:** Prometheus `increment_esp_error()` multiple Calls in <1s. Loki: `"[resilience] Error event handling blocked"`.

**Mechanismus:** LWT ist QoS 1, retain=1 (`mqtt_client.cpp:338-341`). Bei Netz-Ausfall triggern alle ESPs simultan LWT. Kein LWT-Batch-Handler — jede LWT läuft einzeln durch die Handler-Chain.

**System-Prompt-Beschreibung:** LWT-Flood: Bei Netz-Outage produziert jedes Device einen separaten LWT-MQTT-Event mit vollem DB-Write-Pfad. Circuit Breaker (ServiceUnavailableError) kann bei Burst auslösen und Events droppen — korrektes Schutzverhalten, kein Bug. Erkennbar: viele `LWT_RECEIVED` AuditLog-Einträge mit gleichen Timestamps.

---

### Pattern 6: actuator_states "idle"-Reste (kosmetisch)

**Symptom:** `actuator_states.status = "idle"` Werte in DB nach Migration auf "off/on"-Schema.

**Mechanismus:** Startup-Cleanup (`main.py:195`) cleared nur `emergency_stop`-States. `idle`-Reste sind Legacy-Artefakte der Migration, funktional irrelevant.

**System-Prompt-Beschreibung:** actuator_states "idle"-Werte sind kosmetisches Legacy-Artefakt. Kein Einfluss auf Logic Engine oder Safety. Kein Alert nötig.

---

### Pattern 7: Validation-Fehler ohne ACK (by Design)

**Symptom:** Heartbeat-Payload ungültig, kein "normaler" ACK, aber `_send_heartbeat_error_ack()` wird aufgerufen.

**Erkennungs-Heuristik:** Loki: `"[{ValidationErrorCode}] Invalid heartbeat payload from {esp_id}"` + `"Heartbeat ACK sent to {esp_id}"` mit Error-Status.

**System-Prompt-Beschreibung:** Validation-Fehler triggern einen Error-ACK, keinen Ausfall (`heartbeat_handler.py:354-365`). Das ist intentional — kein Missing-ACK, kein Bug.

---

### Pattern 8: Discovery-Rate-Limit — kein ACK normal

**Symptom:** Neues ESP-Gerät sendet Heartbeats, keine ACK-Response, kein Discovery-Event in audit_logs.

**Erkennungs-Heuristik:** Loki: `"Discovery rate limited for {esp_id}"`. Kein `DEVICE_DISCOVERED`-AuditLog-Eintrag.

**Mechanismus:** `heartbeat_handler.py:384-387`: `return True` ohne ACK bei Rate-Limit. ESP retried beim nächsten Heartbeat-Zyklus (60s) automatisch.

**System-Prompt-Beschreibung:** Discovery-Rate-Limit: Schnelle Heartbeats von neuem ESP (z.B. Boot-Loop) werden nach erstem Discovery-Versuch silent ignoriert (kein ACK, kein Error). Korrekt — ESP wird beim nächsten Heartbeat nach Cooldown normal registriert.

---

### Pattern 9: Notification-Refire-Schutz aktiv

**Symptom:** Notification für gleichen Fehler wird nicht wiederholt gesendet.

**Erkennungs-Heuristik:** Prometheus `increment_notification_deduplicated()` steigt. Loki: `"Notification fingerprint dedup (atomic)"`.

**Mechanismus:** `notification_router.py:111-157` implementiert dreistufige Dedup:
1. Broadcast: correlation_id-Check
2. Title-basiert: `DEDUP_WINDOWS` pro Source (mqtt_handler=300s, device_event=300s)
3. Fingerprint: atomisches INSERT mit ON CONFLICT DO NOTHING (FIX-F5 Race-Condition-Fix)

**System-Prompt-Beschreibung:** Notification-Dedup ist aktiver Schutz gegen Alert-Storms (ISA-18.2: <6 Alerts/h). Fehlender zweiter Alert innerhalb Dedup-Fensters (>300s) ist korrekt. Echter Fehler: Alerts erscheinen nach Ablauf des Fensters immer noch nicht.

---

## Sektion 5 — Stack-Blind-Spots (non-breaking erweiterbar)

| ID | Blind-Spot | Risiko | Aufwand | Breaking Change? |
|----|------------|--------|---------|-----------------|
| **BS-01** | **audit_logs CRUD-Lücken:** ESP-Delete, Sensor-Config-CRUD, Zone-Delete nicht geloggt. `is_error`/`is_critical` Properties in `audit_log.py:179-186` vorhanden, aber `acknowledged`-Flag liegt im `details`-JSON-Blob statt als DB-Spalte. Muster aus `esp.py:1278` wiederverwendbar. | Medium | 2-3d | Nein (additive Spalte) |
| **BS-02** | **CentralScheduler ohne Health-Endpoint (OBS-01):** `scheduler.py:483-504` hat `get_scheduler_status()` mit vollständigen Stats, aber kein REST-Endpoint exponiert dies. APScheduler-Job-Fehler (`_on_job_error`, `scheduler.py:517-523`) loggen in Loki, sind aber nicht per API querybar. | High | 0.5d | Nein |
| **BS-03** | **sensor_data ohne i2c/onewire-Bus-Metadata:** `esp_heartbeat_logs` hat `sensor_count` und `actuator_count`, aber kein `i2c_device_count`/`onewire_device_count`. Bus-Fehler nicht von GPIO-Fehlern unterscheidbar. | Medium | 1d | Nein (optionale Felder) |
| **BS-04** | **Frontend-Errors fließen nicht nach Loki:** Kein `window.onerror`-Sink, kein `POST /api/v1/client-errors`-Endpoint. JS-Fehler in Produktion vollständig unsichtbar. | High | 1-2d | Nein |
| **BS-05** | **WS error_event nicht persistiert:** `error_handler.py:257` broadcastet Event, aber kein DB-Write. Bei Client-Disconnect verloren, kein Replay. Frontend zeigt "0 Fehler" nach Reconnect obwohl Fehler passiert. | Medium | 1d | Nein (neue Tabelle) |
| **BS-06** | **Server hat kein LWT:** Server-Crash nur via P1-Heartbeat-Timeout (120s) erkennbar. ESPs handeln in Offline-Mode ohne Server-Wissen für 120s Blindflug. | High | 1d | Nein |
| **BS-07** | **AutoOps-Reports nur im Filesystem:** `reporter.py:189` schreibt Markdown-Dateien in `autoops/reports/`. Kein DB-Insert, kein API-Endpoint, kein Retention-Management. | Low | 1d | Nein |

---

## Sektion 6 — Snapshot-Schema-Vorschlag für DailyAnalysisJob

```python
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ErrorSourceSummary(BaseModel):
    """Aggregated error counts per source layer."""
    firmware_errors_24h: int = Field(description="ESP32 error events (1000-4999) in audit_logs")
    server_errors_24h: int = Field(description="Server errors (5000-5999) in structlog/Loki")
    mqtt_lwt_events_24h: int = Field(description="LWT_RECEIVED AuditLog entries")
    db_errors_24h: int = Field(description="DATABASE category errors (5300-5399)")
    ws_broadcasts_failed_24h: int = Field(description="WS broadcast failures (from structlog)")
    audit_log_write_failures_24h: int = Field(description="5506 error code occurrences")


class HeartbeatHealthSummary(BaseModel):
    """Heartbeat health over the analysis period."""
    total_heartbeats_24h: int
    ack_success_rate: float = Field(description="heartbeat_ack_valid / total HBs")
    contract_reject_count_24h: int
    avg_ack_latency_ms: float = Field(description="observe_heartbeat_ack_latency_ms P50")
    reconnect_events_24h: int
    discovery_rate_limited_24h: int


class ConfigPushSummary(BaseModel):
    config_pushes_triggered_24h: int
    config_pushes_with_ack_24h: int = Field(description="CONFIG_RESPONSE success in audit_logs")
    config_pushes_timed_out_24h: int = Field(description="5006 timeout occurrences")
    chattering_esps: list[str] = Field(description="ESP IDs mit >3 Config-Pushes in 24h")


class NotificationSummary(BaseModel):
    notifications_created_24h: int
    notifications_deduplicated_24h: int
    notifications_suppressed_24h: int = Field(description="Quiet-hours suppression")
    email_failures_24h: int = Field(description="5851/5852 error code occurrences in email_log")
    alert_storms_detected: bool


class SchedulerHealthSummary(BaseModel):
    """CentralScheduler job health (OBS-01 — aktuell kein REST endpoint)."""
    total_jobs: int
    job_error_count_24h: int = Field(description="_job_stats[*].errors sum")
    missed_jobs_24h: int = Field(description="EVENT_JOB_MISSED count")
    categories: dict[str, int] = Field(description="job count per JobCategory")
    # Note: Erfordert OBS-01 Fix (Health-Endpoint) für automatische Befüllung.


class FalseErrorPatternFlags(BaseModel):
    """Flags für bekannte False-Positive-Patterns (Sektion 4)."""
    heartbeat_ack_delay_detected: bool
    reconnect_storm_detected: bool
    config_push_chattering_esps: list[str]
    lwt_flood_detected: bool = Field(description=">3 LWT events innerhalb 60s window")
    discovery_rate_limit_hits: int
    notification_dedup_active: bool


class SystemAnalysisRequest(BaseModel):
    """
    Daily snapshot für ai_service.analyze_daily_snapshot().

    Quellen:
    - audit_logs: AuditLogRepository queries
    - esp_heartbeat_logs: ESPHeartbeatRepository aggregations
    - structlog/Loki: pre-aggregated counters (Prometheus oder log-parser)
    - email_log: EmailLogRepository
    - plugin_executions: PluginRepository
    - in-memory Prometheus counters (via /metrics)

    Aggregations-Fenster: 24h default (konfigurierbar via period_hours).

    WICHTIG: correlation_id und request_id dürfen NICHT cross-context gejoined werden
    (C6-Regel: request_context.py:7-10). Alle JOINs müssen source_type='mqtt' oder
    source_type='api' filtern.
    """

    period_hours: int = Field(default=24, ge=1, le=168)
    analysis_timestamp: datetime = Field(description="UTC timestamp der Snapshot-Generierung")
    system_version: Optional[str] = None

    error_sources: ErrorSourceSummary
    heartbeat_health: HeartbeatHealthSummary
    config_push: ConfigPushSummary
    notifications: NotificationSummary
    scheduler_health: SchedulerHealthSummary
    false_error_flags: FalseErrorPatternFlags

    top_firmware_error_codes: list[dict] = Field(
        description="{error_code: int, count: int, category: str} sortiert nach count desc, max 10"
    )
    top_server_error_codes: list[dict] = Field(
        description="{error_code: int, count: int, category: str} sortiert nach count desc, max 10"
    )

    total_devices: int
    online_devices: int
    offline_devices: int
    devices_with_errors_24h: list[str] = Field(description="ESP IDs mit >=1 Error im Zeitraum")

    # Blind-Spot-Coverage-Flags
    frontend_error_sink_active: bool = Field(default=False, description="BS-04")
    scheduler_health_endpoint_active: bool = Field(default=False, description="OBS-01/BS-02")
    ws_event_persistence_active: bool = Field(default=False, description="BS-05")
```

### Aggregations-Hinweise

| Feld | SQL / Quelle |
|------|--------------|
| `firmware_errors_24h` | `SELECT count(*) FROM audit_logs WHERE event_type = 'mqtt_error' AND created_at >= now() - interval '24h'` |
| `ack_success_rate` | Prometheus: `heartbeat_ack_valid_total / heartbeat_received_total` |
| `chattering_esps` | `SELECT source_id, count(*) FROM audit_logs WHERE event_type = 'config_published' GROUP BY source_id HAVING count(*) > 3` |
| `lwt_flood_detected` | Time-window query auf `event_type = 'lwt_received'` mit 60s-Bucket |
| correlation_id JOINs | Nur innerhalb `source_type = 'mqtt'` (C6-Regel) |

---

## Zusammenfassung kritischer Befunde

| Priorität | Befund | Beleg |
|-----------|--------|-------|
| High | Server hat kein LWT — Crash-Erkennung dauert 120s | `heartbeat_handler.py:67` |
| High | Frontend-Errors vollständig blind (BS-04) | Kein Error-Sink im Codebase |
| High | CentralScheduler ohne Health-Endpoint (OBS-01/BS-02) | `scheduler.py:483-504` — nur interne Methode |
| Medium | AI-Task nach `session.commit()` verliert correlation_id | `error_handler.py:202-208` — asyncio.create_task ohne ContextVar-Copy |
| Medium | WS-error_event nicht persistiert (BS-05) | `error_handler.py:257` |
| Medium | audit_logs CRUD-Lücken, kein acknowledged-Flag (BS-01) | `audit_log.py:25` |
| Low | AutoOps-Reports nur Filesystem, nicht querybar (BS-07) | `reporter.py:189` |
| Info | actuator_states "idle"-Reste (kosmetisch, migrierbar) | `main.py:195` |
