# Error-System / Handshakes / Correlation-IDs / Stack-Inventur — 2026-05-07

**Stand:** 2026-05-07
**Basis:** Vorige Inventur 2026-04-26 (gleicher Pfad, gleiche Sektion-Nummern)
**Delta zur Vorversion:** AUT-117 (latched_offline), AUT-121 (heartbeat_metrics), AUT-118 (emergency ACK/recovery), AUT-134 (config-resync oversize), PKG-01 (queue_pressure)
**Zweck:** Wissensbasis für DailyAnalysisJob (AUT-194), übergabebereit an automation-experte

---

## Sektion 1 — Error-Quellen-Vollständigkeit

| Quelle | Format / Schema | Persistenz-Ort | Zugriffspfad | Stabile Spur? |
|--------|----------------|----------------|--------------|---------------|
| **FW / ESP32 Error (1000-4999)** | JSON: `{error_code, severity(0-3), category, message, context, ts}` — `error_codes.h`, Mapping in `esp32_error_mapping.py:21-440`. Rate-Limit: max 1 Publish/code/60s (`error_tracker.cpp`). | `audit_logs` (AuditEventType.MQTT_ERROR) via MQTT `kaiser/god/esp/{id}/system/error` QoS 1 | `GET /api/v1/errors/esp/{esp_id}` | Ja — persistiert mit Enrichment; unter Broker-Ausfall verloren (best-effort) |
| **FW / ESP32 Backpressure (4062)** | Subcategory `MQTT_PUBLISH_BACKPRESSURE`; strukturiertes Event auf `system/queue_pressure` (PKG-01a Welle 2: geplant). Aktuell: Code 4062 in `system/error`, `publish_queue.cpp:102/157` | `audit_logs` via `system/error`; `system/queue_pressure`-Handler noch nicht registriert (PKG-01b) | `GET /api/v1/errors/esp/{esp_id}?error_code=4062` | Teilweise — queue_pressure-Kanal noch nicht persistiert |
| **FW / Actuator Latched Offline (AUT-117)** | JSON: `{esp_id, gpio, ts, reason, actuator_state, offline_rule_count}` — QoS 0, retain=false | Kein DB-Persist — WS-Broadcast `actuator_latched_offline`, Log-only. `actuator_latched_offline_handler.py` | WS-Subscription `actuator_latched_offline` | Nein — reines Telemetrie-Event, kein stabiler Trace |
| **FW / Emergency ACK (AUT-118)** | JSON: `{ts, esp_id, correlation_id, command, gpio_count, outcome, seq}` — QoS 1 | `audit_logs` via `emergency_ack_handler.py`; `actuator_history.command_metadata` für GPIO-CID | `GET /api/v1/audit?source_id={esp_id}&event_type=emergency_stop_ack` | Ja |
| **FW / Recovery Confirm (AUT-118)** | JSON: `{ts, esp_id, correlation_id, command, state, seq}` — QoS 1 | `actuator_configs.emergency_state` → `normal` via `recovery_confirm_handler.py` | Actuator-Status-API | Ja |
| **FW / Heartbeat Metrics (AUT-121)** | JSON: `{esp_id, ts, metrics_schema_version, offline_enter_count, ...}` — QoS 0, best-effort. `mqtt_client.cpp:publishHeartbeatMetrics()` | In-memory TTLCache (`heartbeat_metrics_handler.py:get_heartbeat_metrics_handler()`); merged in nächsten Core-Heartbeat-WS-Event. Kein direkter DB-Persist. | WS `esp_health`-Payload (`runtime_telemetry`) | Teilweise — kein eigenständiger DB-Trace; verloren bei Server-Restart |
| **Server Error (5000-5999)** | 80+ Codes in `server_error_mapping.py:21-1320` (49 Codes mit Severity, User-Messages, Troubleshooting). Kategorien: Config/MQTT/Validation/DB/Service/Audit/Sequence/Logic/Dashboard/Subzone/AutoOps/Notification/Plugin | structlog → Loki (~24 MB/day), `audit_logs` bei HTTP 5xx (`exception_handlers.py:89-118`). Nicht jede 5xxx-Exception schreibt in DB — nur `_log_to_audit`-Pfad. | Loki-Query oder `GET /api/v1/errors/summary` | Ja (Loki vollständig); DB-Lücke: kein Audit bei allen 5xxx |
| **MQTT LWT (ESP)** | JSON: `{status:"offline", esp_id, reason, timestamp}` — QoS 1, retain=1. Reason-Canonicalisierung: `lwt_handler.py:35`. | `audit_logs` (AuditEventType.LWT_RECEIVED) + Prometheus `increment_esp_error` | Loki / AuditLog | Ja |
| **MQTT Server-LWT** | JSON: `{status:"offline", timestamp, reason:"unexpected_disconnect"}` — QoS 1, retain=1. `client.py:connect()`: will_set vor connect. `main.py:lifespan()`: graceful offline-Publish. | Broker-retained, kein DB-Persist. ESP empfängt Topic `kaiser/god/server/status`. | Broker-retain (read-only für Server) | Teilweise — BS-06: kein DB-Trace für Server-Crash |
| **DB / audit_logs** | ORM: `AuditLog` (`audit_log.py:25`), Felder: event_type, severity, source_type, source_id, details(JSON), correlation_id, request_id, created_at. 8 Indizes inkl. `ix_audit_logs_created_at`. | PostgreSQL `audit_logs` | `AuditLogRepository`, `GET /api/v1/audit` | Ja |
| **DB / esp_heartbeat_logs** | ORM: `ESPHeartbeatLog` (`esp_heartbeat.py:59`), Felder: esp_id, device_id, timestamp, heap_free, wifi_rssi, uptime, sensor_count, health_status. Retention 7d (HeartbeatLogCleanup-Job). | PostgreSQL `esp_heartbeat_logs` | ORM / JOINs | Ja — kein i2c/onewire-Bus-Metadaten (BS-03) |
| **DB / diagnostic_reports** | ORM: `diagnostic_reports` | PostgreSQL | DB direkt | Ja |
| **DB / plugin_executions** | ORM: `plugin_executions` — AutoOps-Plugin-Läufe | PostgreSQL | DB direkt | Ja |
| **DB / email_log** | ORM: `email_log` — Delivery-Tracking | PostgreSQL | `EmailLogRepository` | Ja |
| **WS error_event** | Transient Broadcast: `ws_manager.broadcast("error_event", payload)` — `error_handler.py:257`. Kein DB-Persist. | Kein Persist | WS-Subscription Frontend | Nein — kein stabiler Trace nach Disconnect (BS-05) |
| **WS actuator_latched_offline** | Transient Broadcast nach MQTT-Event. `actuator_latched_offline_handler.py`. | Kein Persist | WS-Subscription Frontend | Nein — reiner Telemetrie-Kanal |
| **Frontend Browser-Errors** | Browser-Console, kein Loki-Sink, kein Server-Side-Logging | Nirgends | Nicht erreichbar | Nein — vollständiger Blind-Spot (BS-04) |
| **AutoOps Plugin-Berichte** | Markdown in `autoops/reports/` — `reporter.py:52-189` | Filesystem (lokal, kein DB-Insert) | Datei-Zugriff | Teilweise — kein Retention-Management, nicht querybar (BS-07) |
| **Mail / Email-Fehler** | `EmailLog` ORM + Error-Codes 5851-5853 | PostgreSQL `email_log` | `EmailLogRepository` | Ja |

**Quellen ohne stabile Spuren (Persistenz-Lücken):**
- Frontend Browser-Errors (kein Sink zum Server) — BS-04
- WS `error_event` (transient, nicht persistiert) — BS-05
- WS `actuator_latched_offline` (telemetrie, kein DB-Persist)
- FW `heartbeat_metrics` (In-memory TTLCache, kein eigenständiger DB-Trace)
- `system/queue_pressure` (PKG-01b Handler fehlt noch)
- AutoOps-Reports nur im Filesystem — BS-07

---

## Sektion 2 — Handshake-Vollständigkeitscheck

### 1. FW → MQTT (ESP32 → Broker)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Transport | ESP-IDF MQTT, `disable_clean_session=0` → `clean_session=true`; Broker löscht QoS-2-Queue bei Reconnect | `mqtt_client.cpp:335` |
| QoS-1-Subscriptions (Server→ESP) | 11 Subscriptions bei Connect via `main.cpp:823-846`: actuator/+/command, heartbeat/ack, config, zone/assign, subzone/assign, subzone/remove, subzone/safe, system/command, actuator/emergency, emergency-ack-topics | `main.cpp:823-846` |
| Error-Publish | Fire-and-forget Callback, kein ACK, Recursion-Guard via `mqtt_publish_in_progress_`. Rate-Limit: 1/code/60s (`error_tracker.cpp`). | `error_tracker.h:49,139` |
| Heartbeat | QoS 0 (Verlust by Design); Bootstrap-Trigger deferred im Loop nach ACK-Subscription | MQTT_TOPICS.md §3.1, `heartbeat_handler.py` |
| LWT (ESP) | QoS 1, retain=1 gesetzt bei `connectToBroker()` | `mqtt_client.cpp:337-341` |
| Emergency ACK (AUT-118) | Via direktem `mqttClient.publish()` (nicht SafePublish-Queue — Safety-Epoch-Race) | `main.cpp:~468`, MQTT_TOPICS.md §2.6 |
| latched_offline (AUT-117) | QoS 0, retain=false, nur bei Aktoren die beim Disconnect "ON" waren | `actuator_manager.cpp:setUncoveredActuatorsToSafeState()` |
| Heartbeat Metrics (AUT-121) | QoS 0, publish nur bei `MetricsSnapshot`-Änderung oder alle 5 Core-Zyklen (`METRICS_MAX_SKIP_COUNT`) | `mqtt_client.h`, `mqtt_client.cpp:publishHeartbeatMetrics()` |
| **Handshake-Lücke** | Kein Delivery-Confirm für Error-Publishes; unter Broker-Ausfall verloren | Design-Entscheid (Recursion-Prevention) |

**Fazit:** ESP → Broker vollständig für LWT und ACK-Flows. Error-Publishes best-effort by Design. `clean_session=true` löscht QoS-2-Queue bei Reconnect — Upstream-Config via nächsten Heartbeat-Zyklus re-synct.

---

### 2. MQTT → Server (Broker → Handler-Dispatch)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Subscriber-Registrierung | `subscriber.py:94-109` → `register_handler()` → `subscribe_all()` (`subscriber.py:111-139`). QoS per `_resolve_qos_for_pattern()`: heartbeat/metrics=0, latched_offline=0, config_response=2, default=1. | `subscriber.py:141-152` |
| Handler-Dispatch | `ThreadPoolExecutor` (max_workers=10). Async-Handler per `run_coroutine_threadsafe()` auf Main-Loop. Correlation-ID: `generate_mqtt_correlation_id(esp_id, topic_suffix, seq)` beim Empfang. | `subscriber.py:167-254` |
| Critical-Topic-Inbox | Kritische Topics (sensor/data, system/error, config_response, system/intent_outcome, system/will) werden in `inbound_inbox_service` geschrieben vor Handler-Submit. | `subscriber.py:202-219`, `_is_critical_topic()` |
| Inbound-Replay | `replay_pending_events()` — reprocessed pending critical events nach Server-Restart. | `subscriber.py:488-570` |
| ACK-Routing (zone/subzone) | `MQTTCommandBridge.resolve_ack()` — wird von `zone_ack_handler` und `subzone_ack_handler` aufgerufen. `extract_ack_correlation_id` prüft Aliase (`corr_id`, `corrId`, `data.correlation_id`). | `mqtt_command_bridge.py:177`, `zone_ack_handler.py:52` |
| **Handshake-Lücke** | Bei `ServiceUnavailableError` in `error_handler.py:264-269` wird Error-Event gedropt (return False, kein Retry). `messages_failed`-Counter inkrementiert. | `error_handler.py:264-269` |
| **Handshake-Lücke** | `status` und `safe_mode`-Topics haben keinen Handler registriert (`main.py` — "derzeit kein Handler"). | MQTT_TOPICS.md §7 Tabelle |
| **Handshake-Lücke** | `system/queue_pressure` Handler fehlt (PKG-01b Welle 2 offen). | MQTT_TOPICS.md §3.6a |

---

### 3. Server → DB (Commit, ON CONFLICT, FK-Constraints)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Session-Management | `resilient_session()` Context-Manager mit Circuit-Breaker-Schutz. | `error_handler.py:136` |
| Commit | Explizit nach `audit_repo.log_mqtt_error()`. Kein Retry bei DB-Commit-Fehler. | `error_handler.py:198` |
| AI-Task fire-and-forget | `asyncio.create_task(_enrich_error_with_ai(...))` nach Commit — verliert ContextVar-Korrelation. | `error_handler.py:202-208` |
| Heartbeat DB-Write | `resilient_session()` in `heartbeat_handler.handle_heartbeat()`. ACK-Senden vor DB-Write (SAFETY-P5 Fix-3). | `heartbeat_handler.py:436-459` |
| Config-Push Cooldown | 45s (`CONFIG_PUSH_COOLDOWN_SECONDS=45`). `config_push_sent_at` in `device_metadata` JSONB. | `heartbeat_handler.py:78,2039` |
| AUT-134 Config-Resync Oversize | Payload-Guard `CONFIG_PAYLOAD_MAX_LEN` in Firmware; Server blockiert bei Oversize: `config_push_oversize_blocked_at` in `device_metadata`. | `heartbeat_handler.py:2124-2132`, `main.cpp:847-858` |
| **Handshake-Lücke** | Kein Retry bei DB-Commit-Fehler; Error-Event gedropt wenn Postgres nicht erreichbar. | Design |

---

### 4. Server → MQTT outbound (Config-Push, Command-Bridge, Timeout)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Heartbeat-ACK | QoS 1, fire-and-forget, Publish vor DB-Writes (SAFETY-P5 Fix-3). Bei Publish-Fehler: `logger.warning`, kein Retry. `_send_heartbeat_error_ack()` bei Validation-Fehler. | `heartbeat_handler.py:1698-1742` |
| MQTTCommandBridge | `asyncio.Future`-basiert, `DEFAULT_TIMEOUT=15s`. Shutdown canceliert pending Futures. Für Zone- und Subzone-Ops. | `mqtt_command_bridge.py:53-60,97` |
| Config-Push | 6 bekannte Caller: Heartbeat (`_has_pending_config`), Zone-Assign, Subzone-Assign, Sensor-Create/Update, Actuator-Create/Update, Manual-Push via `esp_service.publish_config()`. Nur Heartbeat-Pfad hat 45s-Cooldown. | `heartbeat_handler.py:1960-2067`, `esp_service.py:660` |
| Config-Push generation/fingerprint (AUT-134) | `config_builder.py` addiert `reason_code`, `generation` (monotone ms-Timestamp), `config_fingerprint` (SHA-256). Additiv, backward-compatible. | MQTT_TOPICS.md §4.1 |
| Emergency-Stop MQTT | `build_emergency_actuator_correlation_id()` erzeugt deterministischen CID pro GPIO. | `request_context.py:73-89` |
| Server-LWT | `client.py:connect()` → `will_set()` vor `connect()`. `main.py:lifespan()` → offline-Publish bei SIGTERM. | MQTT_TOPICS.md §3.10 |
| **Handshake-Lücke** | 5 von 6 Config-Push-Callern haben keinen Cooldown-Gate → Config-Push-Chattering möglich | `heartbeat_handler.py:78` |
| **Handshake-Lücke** | `_send_heartbeat_ack` bei Fehler: nur `logger.warning`, kein Retry | `heartbeat_handler.py:1741-1742` |

---

### 5. Server → WS-Clients (Event-Typen, Auth)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| Event-Anzahl | 47 relevante Event-Typen (44 Server-Broadcast + 1 optionaler Plugin-Statuskanal + 2 Frontend-Contract-Signale). | WEBSOCKET_EVENTS.md §0 |
| Auth | JWT-Token in URL-Parameter `?token={jwt_token}`. Endpoint: `ws://…/api/v1/ws/realtime/{client_id}?token=…`. | WEBSOCKET_EVENTS.md §1.1 |
| Rate-Limit | 10 msg/sec pro Client (Sliding-Window). Bypass-Liste: `actuator_status`, `esp_health`, `device_discovered/rediscovered`, `notification_new/updated/unread_count`. | WEBSOCKET_EVENTS.md §15 |
| Correlation-ID in Envelope | `envelope_correlation = correlation_id if correlation_id is not None else get_request_id()`. Envelope-`correlation_id` vs. `data.correlation_id`: Divergenz-Metrik `god_kaiser_ws_envelope_data_divergence_total`. | `websocket/manager.py:234`, `metrics.py:249-252` |
| Broadcast-Fehler | Exception geswallowed: `except Exception as e: logger.warning(...)` — kein Retry. | `error_handler.py:259-260` |
| **Handshake-Lücke** | WS `error_event` nicht persistiert — bei Client-Disconnect verloren (BS-05). | `error_handler.py:257` |
| **Handshake-Lücke** | `actuator_latched_offline` (AUT-117) nicht persistiert — reine Telemetrie. | `actuator_latched_offline_handler.py` |
| **Handshake-Lücke** | Legacy `notification`-Event Sunset 2026-07-03 noch aktiv in Code. | WEBSOCKET_EVENTS.md §8.2 |

---

### 6. Frontend → Server (REST + WS, Auth-Token-Refresh)

| Aspekt | Befund | Beleg |
|--------|--------|-------|
| HTTP request_id | `X-Request-ID`-Header via `RequestIdMiddleware`; bei Fehlen: UUID generiert. Response: `x-request-id` Header. | `middleware/request_id.py:47-54,73` |
| Fehler-Rückgabe | HTTP 4xx/5xx mit `{"detail": "...", "request_id": "uuid"}` | `exception_handlers.py:60,99` |
| Auth-Token-Refresh | Frontend-Refresh-Logik via `useWebSocket`: `autoReconnect: true`. Token im URL. JWT-Refresh-Strategie serverseitig in Auth-Layer. | WEBSOCKET_EVENTS.md §12.4 |
| Contract-Signale (Frontend intern) | `contract_mismatch` / `contract_unknown_event` für Schema-Drift sichtbar. | WEBSOCKET_EVENTS.md §11.4-11.5 |
| **Handshake-Lücke** | Frontend-seitige JS-Errors werden nicht reported — kein Error-Sink. | BS-04 |

---

## Sektion 3 — Correlation-ID-Inventur

### Erzeugung (SSOT)

**Firmware (ESP32):** Erzeugt **keine** eigenständige `correlation_id`. Ausnahme: Der Server injiziert `correlation_id` bei ausgehenden Commands (actuator/command, zone/assign, subzone/assign). Die Firmware echot die empfangene ID in Responses/ACKs zurück (`main.cpp:208-211`: `ensureCorrelationId()`, Fallback-Generator `fw_{hash}` für fehlende IDs).

**Server — MQTT-Empfang:** `subscriber.py:204-208` erzeugt beim Empfang:
```
correlation_id = generate_mqtt_correlation_id(esp_id, topic_suffix, seq)
# Format: {esp_id}:{topic_suffix}:{seq}:{timestamp_ms}
# Beispiel: ESP_12AB34CD:data:142:1708704000000
```
Implementiert in `request_context.py:54-70`.

**Server — HTTP-Pfad:** `RequestIdMiddleware` (`middleware/request_id.py:47-54`) generiert UUID4 aus `X-Request-ID`-Header oder neu. Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

**Server — MQTT outbound:** `publisher.py` generiert UUID als `request_id` wenn kein `correlation_id` übergeben wird; setzt `payload["correlation_id"] = request_id` und `payload["intent_id"] = request_id`.

**Emergency-Stop-CID:** `build_emergency_actuator_correlation_id(incident_id, esp_id, gpio)` → deterministisch `{incident_id}:{esp_id}:{gpio}`. (`request_context.py:73-89`)

**MQTT-Ingress-CID (für Actuator-Alert):** `generate_mqtt_correlation_id(esp_id, "alert", seq)` → `{esp_id}:alert:{seq}:{ts_ms}`. Wird in `notifications.correlation_id` gespiegelt. (`MQTT_TOPICS.md §2.4`)

---

### Propagation-Matrix

| Schicht | Propagiert? | Mechanismus | Verlustpunkt |
|---------|------------|-------------|--------------|
| MQTT-Empfang → Handler | Ja | `set_correlation_id()` + `set_request_id()` in ContextVar (`subscriber.py:343-347` in `_run_handler_with_cid`) | — |
| Handler → DB (AuditLog) | Ja | `audit_log_repo.py`: `get_request_id()` auto-injiziert | Verlust wenn ContextVar in async Task-Sprung nicht kopiert |
| Handler → WS-Broadcast | Ja | `ws_manager.broadcast(..., correlation_id=correlation_id)` — `manager.py:234` | — |
| MQTT outbound (ACK/Command) | Ja | `publisher.py`: `payload["correlation_id"] = correlation_id` wenn Caller übergibt | Nur wenn Caller übergibt |
| HTTP-Request → Exception | Ja | `exception_handlers.py:89,99`: `request_id = get_request_id()` | — |
| Server → AI-Task (fire-and-forget) | **Nein** | `asyncio.create_task()` ohne ContextVar-Copy — neuer Task hat keine correlation_id | **Kettenverlust** bei AI-Enrichment |
| Heartbeat-Payload vom ESP | Optional | `HeartbeatHandler._extract_correlation_id(payload)` → `None` wenn leer | ESP sendet keine stabile correlation_id |
| WS-Envelope vs. data | Divergenz messbar | `god_kaiser_ws_envelope_data_divergence_total` Counter | `metrics.py:249-252` |
| Emergency ACK (AUT-118) | Ja | ESP echot `correlation_id` aus Emergency-Command. `actuator_history.command_metadata` enthält `mqtt_correlation_id`. | ESP-seitig best-effort (String-Escaping in `main.cpp:460-461`) |
| Heartbeat ACK | Nein (strukturell) | ACK enthält `handover_epoch`, `session_id`, `status` — keine incoming correlation_id im ACK | Design: ACK ist Liveness-Signal, kein Correlation-Echo |

---

### Regel C6 — Formaler Beleg (Pflicht)

**Regel C6:** `correlation_id` (MQTT, Format `{esp_id}:{topic}:{seq}:{ts_ms}`) und `request_id` (HTTP REST, Format UUID4) dürfen **NICHT blind gejoined** werden.

**Beleg:** `request_context.py:2-9` (Modul-Docstring):
```
Two ID types coexist:
- REST requests: UUID (generated by RequestIdMiddleware or received via X-Request-ID header)
- MQTT messages: Human-readable format {esp_id}:{topic_suffix}:{seq}:{timestamp_ms}
```

In `subscriber.py:343-347` setzt der MQTT-Pfad `set_request_id(correlation_id)` — d.h. der `request_id`-ContextVar wird mit einer MQTT-Correlation-ID (kein UUID) befüllt. `audit_log_repo.py` liest diesen Wert mit `get_request_id()` und persistiert ihn als `AuditLog.request_id`.

**Konsequenz:** `AuditLog.request_id` enthält entweder eine UUID (HTTP-Kontext) oder einen MQTT-Correlation-String (MQTT-Kontext). Ein direkter JOIN würde MQTT-Events fälschlicherweise mit HTTP-Events verknüpfen.

**Sicheres Mapping:** JOIN nur innerhalb `source_type = 'mqtt'` auf beiden Seiten UND Format-Prüfung. HTTP-REST-Events über `source_type = 'api'` separat identifizierbar.

**Prometheus-Monitoring:** `god_kaiser_ws_missing_correlation_total` (`metrics.py:244-247`) zählt WS-Events ohne Correlation-ID; `god_kaiser_ws_envelope_data_divergence_total` (`metrics.py:249-252`) zählt Divergenz-Fälle.

---

### trace_id-Konzept (non-breaking, additiv)

Vorschlag für durchgehende HTTP→MQTT→DB→WS-Rückverfolgung ohne Breaking Change:

```
trace_id = UUID4 (erzeugt beim HTTP-Request-Eingang ODER beim ersten MQTT-Publish)

HTTP-Request → trace_id = request_id (UUID)
  → DB-Commit: AuditLog.trace_id = trace_id (neue nullable Spalte)
  → MQTT outbound: payload["trace_id"] = trace_id (optionales Feld)
    → ESP echot trace_id in Response/ACK (best-effort, Firmware-Contract-Erweiterung)
    → Server empfängt: correlation_id = generate_mqtt_correlation_id(...)
      trace_id = payload.get("trace_id")  # Original aus HTTP-Kette
    → DB-Commit: AuditLog.trace_id = trace_id
    → WS-Broadcast: envelope["trace_id"] = trace_id

MQTT-only-Pfad (kein HTTP): trace_id = correlation_id (keine neue UUID)
```

**Technische Voraussetzungen:**
- `AuditLog`: additive nullable Spalte `trace_id UUID` (Alembic-Migration, non-breaking)
- MQTT outbound Payloads: optionales `trace_id`-Feld (backward-compatible, ESP-Firmware ignoriert unbekannte Felder)
- WS-Envelope: optionales `trace_id`-Top-Level-Feld
- `asyncio.create_task()`: `contextvars.copy_context()` vor Task-Start für AI-Task-Propagation

---

## Sektion 4 — False-Error-Pattern-Katalog

### Pattern 1: Heartbeat-ACK-Delay

**Symptom:** Heartbeat empfangen, kein ACK im erwarteten Zeitfenster (<1s). ESP-P1-Timer nicht zurückgesetzt.

**Erkennungs-Heuristik:** `observe_heartbeat_ack_latency_ms()` Prometheus-Metrik erhöht sich. In Loki: `"Early ACK sent for"` fehlt. Kein echter Fehler wenn ACK innerhalb eines Heartbeat-Intervalls (60s) kommt. Bei Broker-Backpressure: Verzögerung bis `DEFAULT_TIMEOUT=15s` der `MQTTCommandBridge`.

**Mechanismus:** SAFETY-P5 Fix-3 sendet ACK vor DB-Writes (`heartbeat_handler.py:1698-1742`, `_send_heartbeat_ack`). `_send_heartbeat_error_ack` liefert Error-ACK bei Validation-Fehler — kein Missing-ACK.

**System-Prompt-Beschreibung:** `Heartbeat-ACK-Delay ist kein Fehler wenn Latenz unter einem Heartbeat-Intervall (60s) bleibt. ACK kommt vor DB-Writes (SAFETY-P5). Fehlender normaler ACK bei Validation-Fehlern ist by Design — Error-ACK wird gesendet (heartbeat_handler.py:354-365). Kein ACK bei Discovery-Rate-Limit ist by Design (return True ohne ACK, heartbeat_handler.py:384-387).`

---

### Pattern 2: Reconnect-Storm

**Symptom:** Rapid-fire Heartbeats nach ESP-Reconnect. Config-Push-Duplicate. Multiple `correlation_id`-Einträge für denselben ESP in kurzer Zeit. `esp_reconnect_phase`-WS-Events in Sequenz.

**Erkennungs-Heuristik:** `increment_connect_attempt()` Prometheus-Metrik steigt. Loki: `"State push deferred for %s: config push pending"` wiederholt. `handover_epoch`-Increment in Heartbeat-ACK.

**Mechanismus:** `clean_session=true` (`mqtt_client.cpp:335`) löscht QoS-2-Queue beim Reconnect. `RECONNECT_THRESHOLD_SECONDS=60` (`heartbeat_handler.py:67`). `CONFIG_PUSH_COOLDOWN_SECONDS=45` (`heartbeat_handler.py:78`). `_config_push_pending_esps` Set gated. Nach ~120s korrigiert nächster Heartbeat (`STATE_PUSH_COOLDOWN_SECONDS=120`, `heartbeat_handler.py:73`).

**System-Prompt-Beschreibung:** `Reconnect-Storm entsteht nach ESP-Reboot oder Netz-Unterbrechung >60s. Multiple Heartbeat-Einträge und Config-Push-Logs innerhalb 0-120s nach Reconnect sind normal. esp_reconnect_phase-Events (adopting→adopted→delta_enforced→converged) sind normaler Handover-Ablauf. Echter Fehler: Config-Push fehlt nach >180s, oder Phase bleibt dauerhaft in "adopting".`

---

### Pattern 3: Config-Push-Chattering

**Symptom:** Wiederholte Config-Push-Logs ohne erkennbare Konfigurationsänderung. `config_push_sent_at` in `device_metadata` wird frequent aktualisiert.

**Erkennungs-Heuristik:** Loki: `"config_push_reason"` im Metadata wiederholt innerhalb <45s. `_config_push_pending_esps` Set enthält ESP dauerhaft. AUT-134: `config_push_oversize_blocked_at` deutet auf Payload-Oversize-Problem.

**Mechanismus:** 6 bekannte Caller triggern Config-Push: (1) Heartbeat via `_has_pending_config()` (45s-Cooldown), (2) Zone-Assign, (3) Subzone-Assign, (4) Sensor-Create/Update, (5) Actuator-Create/Update, (6) Manual-Push `esp_service.publish_config()`. Nur Heartbeat-Pfad hat Cooldown. `config_fingerprint` (SHA-256, AUT-134) ermöglicht Drift-Erkennung.

**System-Prompt-Beschreibung:** `Config-Push-Chattering: Mehrfache Config-Pushes <45s für denselben ESP sind bekanntes Muster bei gleichzeitigen Konfigurations-Aktionen. config_fingerprint-Feld ermöglicht Forensik-Korrelation. Echter Fehler: Config-Response bleibt aus (kein ACK in config_response innerhalb 120s). config_push_oversize_blocked_at in device_metadata = AUT-134-Oversize-Guard aktiv (Payload zu groß, Resync blockiert).`

---

### Pattern 4: F-V4-01-artige Race Conditions beim Server-Restart

**Symptom:** Zone/Subzone-ACK-Handler empfängt Response aus Pre-Restart-Session. String-Matching auf `status`-Feld liefert Falsch-Positiv. `MQTTCommandBridge.resolve_ack()` findet kein passendes Future.

**Erkennungs-Heuristik:** Loki: `"ACK dropped: no correlation match"` (WARNING). `zone_ack_handler.py:88` patcht auf `extract_ack_correlation_id` mit Aliasen (`corr_id`, `corrId`, `data.correlation_id`). Veralteter Timestamp: `payload.ts << server_time`.

**Mechanismus:** Kein Session-Epoch-Gate für Zone/Subzone-ACK-Handler. Nach Server-Restart keine Session-State → Handler interpretiert alte retained/queued Messages als neue ACKs. `MQTTCommandBridge` hat keine korrespondierenden Futures mehr nach Restart. `replay_pending_events()` in `subscriber.py:488-570` kann diese Situation nach Restart aufräumen (nur für critical topics in inbox).

**System-Prompt-Beschreibung:** `Post-Restart Race: Innerhalb der ersten 30s nach Server-Restart können Zone/Subzone-ACKs aus der vorherigen Session eintreffen. Erkennbar an veralteten Timestamps oder "ACK dropped: no correlation match"-Log. Kein Bug — MQTTCommandBridge hat keine pendente Future, ACK wird verworfen. Caller läuft in Timeout (15s DEFAULT_TIMEOUT, mqtt_command_bridge.py:60).`

---

### Pattern 5: LWT-Flood bei vielen gleichzeitig offline gehenden Devices

**Symptom:** Viele simultane LWT-Messages, DB-Write-Überlastung, Connection-Pool-Spike. `ServiceUnavailableError` im Error-Handler.

**Erkennungs-Heuristik:** Prometheus `increment_esp_error()` multiple Calls in <1s. Loki: `"[resilience] Error event handling blocked"`. Viele `LWT_RECEIVED`-AuditLog-Einträge mit identischen Timestamps.

**Mechanismus:** LWT ist QoS 1, retain=1 (`mqtt_client.cpp:337-341`). Bei Netz-Ausfall triggern alle ESPs simultan LWT. Kein LWT-Batch-Handler — jede LWT läuft einzeln durch Handler-Chain mit `resilient_session()`.

**System-Prompt-Beschreibung:** `LWT-Flood: Bei Netz-Outage produziert jedes Device einen separaten LWT-MQTT-Event mit vollem DB-Write-Pfad. Circuit Breaker (ServiceUnavailableError) kann bei Burst auslösen und Events droppen — korrektes Schutzverhalten, kein Bug. Server-LWT (kaiser/god/server/status) erscheint nach ~90s (1.5x keepalive=60) bei Server-Crash.`

---

### Pattern 6: actuator_states "idle"-Reste (kosmetisch)

**Symptom:** `actuator_states.status = "idle"` Werte in DB nach Migration auf `"off/on"`-Schema.

**Mechanismus:** Startup-Cleanup (`main.py:195`) cleared nur `emergency_stop`-States. `idle`-Reste sind Legacy-Artefakte der Migration, funktional irrelevant für Logic Engine und Safety.

**System-Prompt-Beschreibung:** `actuator_states "idle"-Werte sind kosmetisches Legacy-Artefakt der off/on-Migration. Kein Einfluss auf Logic Engine oder Safety. Kein Alert nötig. Kann per DB-Migration bereinigt werden wenn gewünscht.`

---

### Pattern 7: Validation-Fehler ohne ACK (by Design)

**Symptom:** Heartbeat-Payload ungültig, kein normaler ACK, aber kein Ausfall des P1-Timers auf ESP-Seite.

**Erkennungs-Heuristik:** Loki: `"[{ValidationErrorCode}] Invalid heartbeat payload from {esp_id}"` gefolgt von `"Heartbeat ACK sent to {esp_id}"` mit `status="error"` im ACK.

**Mechanismus:** `heartbeat_handler.py:354-365`: `_send_heartbeat_error_ack()` bei Validation-Fehler. ESP empfängt Error-ACK mit `status="error"` — P1-Timer wird trotzdem zurückgesetzt.

**System-Prompt-Beschreibung:** `Validation-Fehler triggern einen Error-ACK, keinen Ausfall (heartbeat_handler.py:354-365). Das ist intentional — kein Missing-ACK, kein Bug. error-Status im ACK signalisiert dem ESP dass der Payload fehlerhaft war, nicht dass der Server ausgefallen ist.`

---

### Pattern 8: Discovery-Rate-Limit — kein ACK normal

**Symptom:** Neues ESP-Gerät sendet Heartbeats, keine ACK-Response, kein Discovery-Event in audit_logs.

**Erkennungs-Heuristik:** Loki: `"Discovery rate limited for {esp_id}"`. Kein `DEVICE_DISCOVERED`-AuditLog-Eintrag im erwarteten Fenster.

**Mechanismus:** `heartbeat_handler.py:384-387`: `return True` ohne ACK bei Rate-Limit. ESP retried beim nächsten Heartbeat-Zyklus (60s). `increment_heartbeat_ack_valid()` wird nicht inkrementiert.

**System-Prompt-Beschreibung:** `Discovery-Rate-Limit: Schnelle Heartbeats von neuem ESP (z.B. Boot-Loop) werden nach erstem Discovery-Versuch silent ignoriert (kein ACK, kein Error). Korrekt — ESP wird beim nächsten Heartbeat nach Cooldown normal registriert. Echter Fehler: ESP bleibt nach >5min ohne Discovery-Event und ohne Rate-Limit-Log.`

---

### Pattern 9: Notification-Refire bei Fix-V-Dedup

**Symptom:** Notification für gleichen Fehler wird nicht wiederholt gesendet innerhalb Dedup-Fenster.

**Erkennungs-Heuristik:** Prometheus `increment_notification_deduplicated()` steigt. Loki: `"Notification fingerprint dedup (atomic)"`.

**Mechanismus:** `notification_router.py:111-157` implementiert dreistufige Dedup:
1. Broadcast: correlation_id-Check
2. Title-basiert: `DEDUP_WINDOWS` pro Source (mqtt_handler=300s, device_event=300s)
3. Fingerprint: atomisches INSERT mit ON CONFLICT DO NOTHING (FIX-F5 Race-Condition-Fix)

**System-Prompt-Beschreibung:** `Notification-Dedup ist aktiver Schutz gegen Alert-Storms (ISA-18.2: <6 Alerts/h). Fehlender zweiter Alert innerhalb Dedup-Fensters (300s) ist korrekt. Echter Fehler: Alerts erscheinen nach Ablauf des Fensters (>300s) immer noch nicht — dann Dedup-State-Bug prüfen.`

---

## Sektion 5 — Stack-Blind-Spots (non-breaking erweiterbar)

| ID | Blind-Spot | Risiko | Aufwand | Breaking Change? |
|----|------------|--------|---------|-----------------|
| **BS-01** | **audit_logs CRUD-Lücken:** ESP-Delete, Sensor-Config-CRUD (Create/Update/Delete), Zone-Delete nicht geloggt. `acknowledged`-Flag liegt im `details`-JSON-Blob statt als DB-Spalte (erschweert SQL-Filter). Muster aus `esp.py:1274-1292` (device_approved) wiederverwendbar. | Medium | 2-3d | Nein (additive Entries + optionale Spalte) |
| **BS-02** | **CentralScheduler ohne Health-Endpoint (OBS-01):** `scheduler.py:483-504` hat `get_scheduler_status()` mit vollständigen Stats (job_count, errors, missed), aber kein REST-Endpoint exponiert dies. APScheduler-Job-Fehler (`_on_job_error`, `scheduler.py:517-523`) loggen nur in Loki. Alert-Suppression-Scheduler (`alert_suppression_scheduler.py:5,29,166`) läuft via CentralScheduler unsichtbar. | High | 0.5d | Nein (neue Route) |
| **BS-03** | **sensor_data ohne i2c_address/onewire_address-Metadata in heartbeat_logs:** `esp_heartbeat_logs` hat `sensor_count`/`actuator_count`, aber kein Bus-Interface-Feld. Bus-Fehler (I2C 1010-1019, OneWire 1020-1029) nicht von GPIO-Fehlern unterscheidbar in Aggregaten. MQTT-Sensor-Payload hat `i2c_address`/`onewire_address`-Felder (MQTT_TOPICS.md §1.1). | Medium | 1d | Nein (optionale Spalten) |
| **BS-04** | **Frontend-Errors fließen nicht nach Loki:** Kein `window.onerror`-Sink, kein `POST /api/v1/client-errors`-Endpoint. JS-Fehler, Pinia-State-Korruption, WS-Contract-Violations (`contract_mismatch`) in Produktion vollständig unsichtbar. | High | 1-2d | Nein |
| **BS-05** | **WS error_event nicht persistiert:** `error_handler.py:257` broadcastet Event, aber kein DB-Write. Bei Client-Disconnect verloren, kein Replay möglich. Frontend zeigt nach Reconnect "0 Fehler" obwohl Fehler passiert. Betrifft auch `actuator_latched_offline` (AUT-117, ebenfalls nicht persistiert). | Medium | 1d | Nein (neue Tabelle oder audit_log Insert) |
| **BS-06** | **Server hat kein LWT in DB:** Server-LWT existiert als MQTT-Topic (`kaiser/god/server/status`, `main.py:lifespan()`, `client.py:connect()`) und wird vom ESP empfangen. Aber kein DB-Eintrag bei Server-Crash → Crash nur via P1-Heartbeat-Timeout (120s) erkennbar für Monitoring-System. | High | 1d | Nein (LWT-Handler oder lifespan-Hook) |
| **BS-07** | **AutoOps-Reports nur im Filesystem:** `reporter.py:189` schreibt Markdown-Dateien in `autoops/reports/`. Kein DB-Insert, kein API-Endpoint, kein Retention-Management. | Low | 1d | Nein |
| **BS-08 (neu)** | **heartbeat_metrics kein eigenständiger DB-Trace:** AUT-121 Metrics (Counter: `offline_enter_count`, `handover_contract_reject_count`, `publish_queue_drop_count` etc.) landen nur in In-Memory-TTLCache (`heartbeat_metrics_handler.py`) und werden in den nächsten Core-Heartbeat-WS-Event gemerged. Bei Server-Restart verloren. DailyAnalysisJob kann keine 24h-Aggregate bilden. | Medium | 1-2d | Nein (additive esp_metrics_snapshots-Tabelle) |
| **BS-09 (neu)** | **system/queue_pressure Handler fehlt (PKG-01b):** Topic `kaiser/god/esp/{id}/system/queue_pressure` ist in `topics.py` implementiert (Builder/Parser, Commit `7e7ae245`), aber Handler ist in Welle 2 (PKG-01b) noch offen. 4062-Backpressure-Events landen nur über `system/error`-Kanal. Kein strukturiertes ENTER/RECOVERED-Event-Tracking. | Medium | 1d | Nein |

---

## Sektion 6 — Snapshot-Schema-Vorschlag für DailyAnalysisJob

Auf Basis der Sektionen 1-5: konkretes Pydantic-Schema für `SystemAnalysisRequest`, konsumierbar durch `ai_service.analyze_daily_snapshot()`.

```python
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ErrorSourceSummary(BaseModel):
    """Aggregated error counts per source layer."""
    firmware_errors_24h: int = Field(
        description="ESP32 error events (1000-4999) in audit_logs WHERE event_type='mqtt_error'"
    )
    firmware_backpressure_4062_24h: int = Field(
        description="Occurrences of error_code=4062 (MQTT_PUBLISH_BACKPRESSURE)"
    )
    server_errors_24h: int = Field(
        description="Server errors (5000-5999) in structlog/Loki"
    )
    mqtt_lwt_events_24h: int = Field(
        description="LWT_RECEIVED AuditLog entries (ESP offline events)"
    )
    db_errors_24h: int = Field(
        description="DATABASE category errors (5300-5399) in Loki"
    )
    ws_broadcasts_failed_24h: int = Field(
        description="WS broadcast failures (from structlog failure_class=ws_broadcast)"
    )
    audit_log_write_failures_24h: int = Field(
        description="5501 AUDIT_LOG_FAILED error code occurrences"
    )
    # Blind-Spot-Coverage: folgende Quellen fehlen noch
    frontend_errors_24h: Optional[int] = Field(
        default=None,
        description="BS-04: Frontend JS-Error-Sink nicht implementiert — immer None"
    )
    actuator_latched_offline_events_24h: Optional[int] = Field(
        default=None,
        description="BS-05/AUT-117: WS-only-Event, nicht persistiert — immer None bis BS-05-Fix"
    )


class HeartbeatHealthSummary(BaseModel):
    """Heartbeat health over the analysis period."""
    total_heartbeats_24h: int
    ack_success_rate: float = Field(
        description="Prometheus: heartbeat_ack_valid_total / heartbeat_received_total"
    )
    contract_reject_count_24h: int = Field(
        description="Prometheus: god_kaiser_heartbeat_contract_reject_total"
    )
    avg_ack_latency_ms: float = Field(
        description="Prometheus: observe_heartbeat_ack_latency_ms P50"
    )
    reconnect_events_24h: int = Field(
        description="Prometheus: god_kaiser_connect_attempt_total"
    )
    discovery_rate_limited_24h: int = Field(
        description="Loki: count('Discovery rate limited')"
    )
    # AUT-121 Metrics (aus TTLCache-Snapshot — kein DB-Aggregat verfügbar, BS-08)
    metrics_heartbeat_available: bool = Field(
        description="True wenn heartbeat_metrics_handler aktiv (AUT-121)"
    )


class ConfigPushSummary(BaseModel):
    config_pushes_triggered_24h: int = Field(
        description="audit_logs WHERE event_type='config_published' in 24h"
    )
    config_pushes_with_ack_24h: int = Field(
        description="audit_logs WHERE event_type='config_response' AND status='success' in 24h"
    )
    config_pushes_timed_out_24h: int = Field(
        description="5006 CONFIG_TIMEOUT occurrences in Loki"
    )
    config_pushes_oversize_blocked_24h: int = Field(
        description="AUT-134: device_metadata.config_push_oversize_blocked_at events"
    )
    chattering_esps: list[str] = Field(
        description="ESP IDs mit >3 Config-Pushes in 24h (audit_logs GROUP BY source_id)"
    )


class NotificationSummary(BaseModel):
    notifications_created_24h: int
    notifications_deduplicated_24h: int = Field(
        description="Prometheus: god_kaiser_notification_deduplicated_total"
    )
    notifications_suppressed_24h: int = Field(
        description="Quiet-hours / alert-suppression suppressions"
    )
    email_failures_24h: int = Field(
        description="5851/5852 error code occurrences in email_log"
    )
    alert_storms_detected: bool = Field(
        description=">6 Notifications/h für einen ESP — ISA-18.2 Grenzwert"
    )


class SchedulerHealthSummary(BaseModel):
    """CentralScheduler job health — aktuell kein REST endpoint (OBS-01/BS-02)."""
    total_jobs: int = Field(description="scheduler.get_scheduler_status()['job_count']")
    job_error_count_24h: int = Field(
        description="scheduler._job_stats[*].errors sum — Loki: _on_job_error"
    )
    missed_jobs_24h: int = Field(
        description="APScheduler EVENT_JOB_MISSED count in Loki"
    )
    categories: dict[str, int] = Field(
        description="Job-Anzahl pro JobCategory (MAINTENANCE, DATA_QUALITY, etc.)"
    )
    # Note: Erfordert OBS-01 Fix (scheduler.py:483-504 per REST-Endpoint) für automatische Befüllung.
    health_endpoint_active: bool = Field(
        default=False,
        description="OBS-01/BS-02: False bis Health-Endpoint implementiert"
    )


class FalseErrorPatternFlags(BaseModel):
    """Flags für bekannte False-Positive-Patterns (Sektion 4)."""
    heartbeat_ack_delay_detected: bool = Field(
        description="P50 ACK-Latenz >500ms"
    )
    reconnect_storm_detected: bool = Field(
        description=">3 Reconnects für einen ESP in <300s"
    )
    config_push_chattering_esps: list[str] = Field(
        description="ESP IDs mit >3 Config-Pushes in 24h"
    )
    lwt_flood_detected: bool = Field(
        description=">3 LWT-Events innerhalb 60s-Fenster"
    )
    discovery_rate_limit_hits: int
    notification_dedup_active: bool = Field(
        description="Mindestens 1 Dedup-Event in 24h"
    )
    post_restart_ack_race_detected: bool = Field(
        description="'ACK dropped: no correlation match' in Loki innerhalb 30s nach Restart"
    )


class SystemAnalysisRequest(BaseModel):
    """
    Daily snapshot für ai_service.analyze_daily_snapshot().

    Quellen:
    - audit_logs: AuditLogRepository queries
    - esp_heartbeat_logs: ESPHeartbeatRepository aggregations
    - structlog/Loki: pre-aggregated counters (Prometheus oder log-parser)
    - email_log: EmailLogRepository
    - plugin_executions: PluginRepository
    - Prometheus in-memory counters (via /metrics)

    Aggregations-Fenster: 24h default (konfigurierbar via period_hours).

    WICHTIG (C6-Regel): correlation_id (Format esp_id:topic:seq:ts_ms) und
    request_id (UUID4) dürfen NICHT cross-context gejoined werden.
    Beleg: request_context.py:2-9.
    Alle JOINs müssen source_type='mqtt' oder source_type='api' filtern.
    """

    period_hours: int = Field(default=24, ge=1, le=168)
    analysis_timestamp: datetime = Field(
        description="UTC timestamp der Snapshot-Generierung"
    )
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
    devices_with_errors_24h: list[str] = Field(
        description="ESP IDs mit >=1 Error im Zeitraum"
    )

    # Blind-Spot-Coverage-Flags (Sektion 5)
    frontend_error_sink_active: bool = Field(
        default=False,
        description="BS-04: False bis POST /api/v1/client-errors implementiert"
    )
    scheduler_health_endpoint_active: bool = Field(
        default=False,
        description="OBS-01/BS-02: False bis CentralScheduler-Health-Endpoint implementiert"
    )
    ws_event_persistence_active: bool = Field(
        default=False,
        description="BS-05: False bis error_event/latched_offline DB-Persist implementiert"
    )
    heartbeat_metrics_db_active: bool = Field(
        default=False,
        description="BS-08: False bis AUT-121-Metrics in DB persistiert werden"
    )
    queue_pressure_handler_active: bool = Field(
        default=False,
        description="BS-09/PKG-01b: False bis system/queue_pressure Handler registriert"
    )
```

### Aggregations-Hinweise

| Feld | SQL / Quelle |
|------|--------------|
| `firmware_errors_24h` | `SELECT count(*) FROM audit_logs WHERE event_type = 'mqtt_error' AND created_at >= now() - interval '24h'` |
| `firmware_backpressure_4062_24h` | `SELECT count(*) FROM audit_logs WHERE details->>'error_code' = '4062' AND created_at >= now() - interval '24h'` |
| `ack_success_rate` | Prometheus: `god_kaiser_heartbeat_ack_valid_total / god_kaiser_heartbeat_received_total` |
| `chattering_esps` | `SELECT source_id, count(*) FROM audit_logs WHERE event_type = 'config_published' AND created_at >= now() - interval '24h' GROUP BY source_id HAVING count(*) > 3` |
| `lwt_flood_detected` | `SELECT count(*) FILTER (WHERE ts_bucket = lag(ts_bucket) OVER (ORDER BY created_at)) > 3 FROM (SELECT date_trunc('minute', created_at) ts_bucket FROM audit_logs WHERE event_type = 'lwt_received') sub` |
| `config_pushes_oversize_blocked_24h` | ESP `device_metadata`-JSONB-Scan: `SELECT count(*) FROM esp_devices WHERE device_metadata->>'config_push_oversize_blocked_at' IS NOT NULL AND ...` |
| `correlation_id JOIN-Regel (C6)` | Alle JOINs über `source_type = 'mqtt'` auf beiden Seiten; HTTP-REST-Events über `source_type = 'api'` isoliert. Nie cross-context joinen. |
| `top_firmware_error_codes` | `SELECT details->>'error_code' as error_code, count(*) FROM audit_logs WHERE event_type = 'mqtt_error' AND created_at >= now() - interval '24h' GROUP BY 1 ORDER BY 2 DESC LIMIT 10` |

---

## Zusammenfassung kritischer Befunde (Stand 2026-05-07)

| Priorität | Befund | Beleg |
|-----------|--------|-------|
| High | Server hat kein LWT in DB — Server-Crash-Erkennung dauert 120s (P1-Timeout) | `heartbeat_handler.py:67` (BS-06) |
| High | Frontend-Errors vollständig blind — kein Error-Sink | Kein `client-errors`-Endpoint (BS-04) |
| High | CentralScheduler ohne Health-Endpoint (OBS-01) | `scheduler.py:483-504` — nur interne Methode (BS-02) |
| Medium | AI-Task nach `session.commit()` verliert correlation_id | `error_handler.py:202-208` — `asyncio.create_task()` ohne ContextVar-Copy |
| Medium | WS error_event + actuator_latched_offline nicht persistiert | `error_handler.py:257`, `actuator_latched_offline_handler.py` (BS-05) |
| Medium | heartbeat_metrics kein DB-Trace — kein 24h-Aggregat für DailyAnalysisJob | `heartbeat_metrics_handler.py` (BS-08, neu) |
| Medium | system/queue_pressure Handler fehlt (PKG-01b) — Backpressure nur über error 4062 sichtbar | MQTT_TOPICS.md §3.6a (BS-09, neu) |
| Medium | audit_logs CRUD-Lücken, acknowledged-Flag im JSON-Blob | `audit_log.py:25` (BS-01) |
| Low | AutoOps-Reports nur Filesystem, nicht querybar | `reporter.py:189` (BS-07) |
| Info | actuator_states "idle"-Reste (kosmetisch, migrierbar) | `main.py:195` |
| Info | Legacy WS-Event `notification` Sunset 2026-07-03 ausstehend | WEBSOCKET_EVENTS.md §8.2 |
