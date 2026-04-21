# SPECIALIST-PROMPTS — INC-2026-04-20-offline-mode-observability-hardening

> **Stand:** Rollenweise konsolidiert nach Gate 1, Gate 2 und Gate 3 (Tooling-Korrekturen).
> **VERBINDLICH FUER DISPATCH:** Abschnitt **"Block 1 — server-dev"** und folgend (ab `## Block 1 — server-dev (PKG-01b, ...)`). Alle frueheren Kurzfassungen in diesem Dokument sind **HISTORISCH** und dienen nur der Nachvollziehbarkeit.
> **Git-Pflicht fuer alle Rollen:** `git checkout auto-debugger/work` und `git branch --show-current` vor Aenderungen.
> **PKG-Referenz:** `TASK-PACKAGES.md` (Post-Verify, Round 3).
> **Build-Env-Korrektur (Gate 3):** Firmware-Build ausschliesslich mit `-e seeed_xiao_esp32c3`; Firmware-Unit-Tests via `-e esp32dev_test`. Server-Tests ausschliesslich aus `El Servador/god_kaiser_server` (Poetry-Root).

---

## [HISTORISCH — NICHT VERBINDLICH] server-dev (Kurzfassung 1, ersetzt durch Block 1)

**PKG:** `PKG-01b`, `PKG-02`, `PKG-03 (Server)`, `PKG-04a`, `PKG-05`, `PKG-06`, `PKG-07`

**Kernaufgaben:**
- Queue-Pressure-Handler + Metrics (`PKG-01b`) ohne Alembic.
- Rule-Arbitration structured logging (`PKG-02`).
- Stale-Guard expected-label (`PKG-06`) und 4062-Semantik (`PKG-07`).
- Terminal-Guard WS-Event + correlation_id_source (`PKG-04a`).
- Latenzfelder serverseitig (`PKG-03`).
- Monitoring-Filter-Dateien im Repo vorbereiten (`PKG-05`, User-Reload separat).

**Pfade:**
- `El Servador/god_kaiser_server/src/mqtt/topics.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/services/logic/safety/conflict_manager.py`
- `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py`
- `El Servador/god_kaiser_server/src/core/metrics.py`
- `El Servador/god_kaiser_server/src/websocket/manager.py`

**Tests:**
```bash
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q
cd "El Servador/god_kaiser_server" && poetry run ruff check src/
```

---

## esp32-dev

**PKG:** `PKG-01a`, `PKG-03 (Firmware)`

**Kernaufgaben:**
- Queue-Pressure ENTER/RECOVERED mit 5s-Hysterese.
- Additiver Payload ohne bestehende Topics/Payloads zu brechen.
- `t_applied_ms` fuer Latenzkette.

**Pfade:** `El Trabajante/src/tasks/publish_queue.cpp`, `El Trabajante/src/services/communication/mqtt_client.cpp`

**Test:**
```bash
cd "El Trabajante" && pio run -e seeed_xiao_esp32c3
```

---

## frontend-dev

**PKG:** `PKG-04b`, `PKG-03 (Frontend)`

**Kernaufgaben:**
- `config.terminal_guard` typisieren und Soft-Match nur bei `pending_count == 1`.
- Bei Mehrdeutigkeit beim bestehenden Contract-Issue/Timeout-Verhalten bleiben.
- `e2e_latency_ms` berechnen und >1000ms warnen.

**Pfade:** `El Frontend/src/shared/stores/actuator.store.ts`, `El Frontend/src/types/websocket-events.ts`

**Tests:**
```bash
cd "El Frontend" && npm run build
cd "El Frontend" && npx vue-tsc --noEmit
```

---

## mqtt-dev

**PKG:** Topic-Vertrag fuer `PKG-01a/01b`, `PKG-08`

**Kernaufgaben:**
- Queue-Pressure TopicBuilder/Parser additiv ergaenzen.
- `message_size_limit` -> `max_packet_size` in `docker/mosquitto/mosquitto.conf` und `.github/mosquitto/mosquitto.conf`.

**Blocker:** `B-MQTT-VERSION-01`, `B-USER-DOCKER-01`

---

## Rollenuebergreifende BLOCKER

- `B-QP-PERSIST-01`
- `B-MON-PATH-01`
- `B-MQTT-VERSION-01`
- `B-USER-DOCKER-01`
# [HISTORISCH — NICHT VERBINDLICH] SPECIALIST-PROMPTS (Kurzfassung 2, ersetzt durch Block 1-5 unten)

> **Stand:** Post-Verify konsolidiert (Gate 1 + Gate 2 abgeschlossen).
> **Branch (Pflicht):** `auto-debugger/work`.
> **Prinzip:** genau ein Block pro Dev-Rolle, auf finalen PKG-Stand referenziert.
> **Hinweis:** Diese Fassung wurde durch die ausfuehrliche rollenweise Fassung (Abschnitt `## Block 1 — server-dev ...` und folgend) abgeloest.

---

## server-dev

**Git (Pflicht):**
```bash
git checkout auto-debugger/work
git branch --show-current
```

**PKG:** `PKG-01b`, `PKG-02`, `PKG-03 (Server-Teil)`, `PKG-04a`, `PKG-05`, `PKG-06`, `PKG-07`

**Auftrag:**
1. `PKG-02`: `conflict_manager.py` mit structured logging (`extra`) erweitern, Prefix erhalten.
2. `PKG-06`: stale-guard Logline in `config_handler.py` als `CONFIG_GUARD ... status=expected`.
3. `PKG-07`: 4062-Mapping additiv schaerfen (`subcategory=MQTT_PUBLISH_BACKPRESSURE`).
4. `PKG-01b`: Queue-Pressure-Handler + Topic-Routing + Prometheus-Metrik (ohne Alembic).
5. `PKG-03`: `t_server_received_ms` / `t_server_published_ms` additiv.
6. `PKG-04a`: `config.terminal_guard` WS-Event und `correlation_id_source` additiv.
7. `PKG-05`: Monitoring-Filter in Repo-Dateien vorbereiten; Runtime-Reload nur als User-Schritt dokumentieren.

**Relevante Pfade:**
- `El Servador/god_kaiser_server/src/services/logic/safety/conflict_manager.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`
- `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py`
- `El Servador/god_kaiser_server/src/mqtt/topics.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/core/metrics.py`
- `El Servador/god_kaiser_server/src/websocket/manager.py`

**Verifikation:**
```bash
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q
cd "El Servador/god_kaiser_server" && poetry run ruff check src/
```

---

## esp32-dev

**Git (Pflicht):**
```bash
git checkout auto-debugger/work
git branch --show-current
```

**PKG:** `PKG-01a`, `PKG-03 (Firmware-Teil)`

**Auftrag:**
1. `PKG-01a`: Queue-Pressure-Emitter mit ENTER/RECOVERED-Hysterese (5s anti-spam).
2. Payload additiv halten: `esp_id`, `level`, `fill`, `hwm`, `shed_count`, `drop_count`, `burst_window_ms`, `timestamp_ms`.
3. `PKG-03`: `t_applied_ms` additiv im Actuator-Response-Payload.

**Relevante Pfade:**
- `El Trabajante/src/tasks/publish_queue.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/models/error_codes.h`

**Verifikation:**
```bash
cd "El Trabajante" && pio run -e seeed_xiao_esp32c3
```

---

## frontend-dev

**Git (Pflicht):**
```bash
git checkout auto-debugger/work
git branch --show-current
```

**PKG:** `PKG-04b`, `PKG-03 (Frontend-Teil)`

**Auftrag:**
1. `PKG-04b`: `config.terminal_guard` in `websocket-events.ts` typisieren.
2. Soft-Match nur bei eindeutiger Zuordnung (`pending_count == 1` fuer `esp_id+config_type`).
3. Bei Mehrdeutigkeit beim bisherigen Contract-Issue/Timeout-Verhalten bleiben.
4. `PKG-03`: `e2e_latency_ms` berechnen und >1000ms als Warnung loggen.

**Relevante Pfade:**
- `El Frontend/src/shared/stores/actuator.store.ts`
- `El Frontend/src/types/websocket-events.ts`

**Verifikation:**
```bash
cd "El Frontend" && npm run build
cd "El Frontend" && npx vue-tsc --noEmit
```

---

## mqtt-dev

**Git (Pflicht):**
```bash
git checkout auto-debugger/work
git branch --show-current
```

**PKG:** Topic-Vertrag fuer `PKG-01a/01b`, `PKG-08`

**Auftrag:**
1. TopicBuilder/Parser fuer Queue-Pressure in `topics.py` additiv ergaenzen.
2. Sicherstellen, dass neue Handler keine hardcodierten Topic-Strings nutzen.
3. `PKG-08`: `message_size_limit` -> `max_packet_size` in:
   - `docker/mosquitto/mosquitto.conf`
   - `.github/mosquitto/mosquitto.conf`

**Verifikation:**
```bash
mosquitto -c docker/mosquitto/mosquitto.conf -t
mosquitto -c .github/mosquitto/mosquitto.conf -t
```

---

## BLOCKER (rollenuebergreifend)

- `B-QP-PERSIST-01`: Persistenzstrategie fuer PKG-01b final entscheiden.
- `B-MON-PATH-01`: Loki/Grafana-Overlay-Pfade bei Umsetzung exakt pruefen.
- `B-MQTT-VERSION-01`: Broker-Version fuer `max_packet_size` validieren.
- `B-USER-DOCKER-01`: Docker-Restart/Reload durch Robin erforderlich.

---

## Startreihenfolge

1. `server-dev`: PKG-02, PKG-06, PKG-07.
2. Parallel: `esp32-dev` (PKG-01a) + `mqtt-dev` (TopicBuilder-Anteil fuer PKG-01b).
3. `server-dev`: PKG-01b und danach PKG-04a.
4. `frontend-dev`: PKG-04b und PKG-03 Frontend-Teil.
5. `server-dev` + `frontend-dev`: PKG-03 Kette finalisieren.
6. `server-dev`/`mqtt-dev`: PKG-05 und PKG-08 erst nach User-Blocker-Freigabe.
# SPECIALIST-PROMPTS — INC-2026-04-20-offline-mode-observability-hardening

> **Stand:** Post-Verify (nach Gate 1) + **rollenweise konsolidiert**.
> **Branch (Pflicht):** `auto-debugger/work`.
> **Dispatch-Pflicht:** Gate 2 (`VERIFY-PLAN-REPORT-ROUND2.md`) muss PASS sein.
> **PKG-Referenz:** `TASK-PACKAGES.md` (Post-Verify-Version).

---

## Block 1 — server-dev (PKG-01b, PKG-02, PKG-04a, PKG-06, PKG-07)

### Git (Pflicht)

```
Arbeitsbranch: auto-debugger/work
Vor allen Dateiaenderungen:
    git checkout auto-debugger/work
    git branch --show-current   # muss "auto-debugger/work" ausgeben

Alle Commits dieses Auftrags nur auf diesem Branch.
Kein Commit direkt auf master.
Kein git push --force auf Shared-Remotes.
```

### Scope

FastAPI + MQTT-Handler + Error-Mapping + WebSocket-Broadcast im Modul `El Servador/god_kaiser_server/`.

### IST (vor-verifiziert Gate 1)

- `src/mqtt/handlers/config_handler.py` L138, L147, L162, L168, L348 (terminal authority guard).
- `src/mqtt/handlers/error_handler.py` — Referenz-Pattern fuer neuen queue_pressure_handler.
- `src/mqtt/handlers/heartbeat_handler.py` — konsumiert aktuell KEINE Queue-Telemetrie (muss erweitert werden).
- `src/services/device_response_contract.py` L141-155, L260-263 (correlation_id-Canonicalisation).
- `src/services/logic/safety/conflict_manager.py` L29, L241, L249, L252, L262 (Rule-Arbitration).
- `src/core/esp32_error_mapping.py` L1613-1626 (4062-Mapping).
- `src/core/metrics.py` — Prometheus-Metric-Pfad vorhanden.
- `src/mqtt/topics.py` — TopicBuilder (neue Methode fuer queue_pressure braucht Abstimmung mit mqtt-dev, siehe Block 4).
- WS-Manager-Pfad: vor Implementierung per Grep verifizieren (BLOCKER `B-WS-PATH-01`).

### Pre-Checks (Pflicht vor Implementierung)

1. `Grep "get_logger\|logger = " src/services/logic/safety/conflict_manager.py` — Logger-API bestaetigen.
   Falls fehlend: **STOP**, eigenes Cleanup-PKG als separate Task anlegen (`B-LOG-API-01`).
2. `Grep -rn "ws_manager\|websocket.manager\|broadcast" src/websocket/` — exakten Pfad + Method-Signatur dokumentieren.
3. `Grep -rn "subcategory" El Frontend/src/ src/` — Consumer des neuen Feldes pruefen (PKG-07).
4. `Read src/mqtt/handlers/config_handler.py L160-180` — Log-Level fuer PKG-06 bestaetigen (INFO erwartet).
5. **User-Entscheidung `B-QP-PERSIST-01`** vor PKG-01b Start: Prometheus-only vs. mqtt_errors-Annotation.

### SOLL pro PKG

**PKG-01b — Queue-Pressure-Konsum:**

Teil 1 — Neuer Handler `src/mqtt/handlers/queue_pressure_handler.py`:
- Pattern: analog zu `error_handler.py` (BaseMQTTHandler erweitern).
- `validate_payload`: Pflichtfelder `esp_id, level, fill, hwm, shed_count, drop_count`; Level ∈ `{ENTER, RECOVERED}`.
- `process_message`: Prometheus-Gauge `esp_publish_queue_pressure{esp_id, level}` setzen (core/metrics.py).
- **WENN** Robin entscheidet "mqtt_errors-Annotation": zusaetzlich `error_repo.create_error_event(..., subcategory="QUEUE_PRESSURE")`.
- Topic-Parser via `TopicBuilder.parse_queue_pressure_topic` (von mqtt-dev bereitgestellt).
- Handler im MQTT-Routing-Dict registrieren.

Teil 2 — Heartbeat-Handler erweitern:
- In `heartbeat_handler.py` Felder `publish_queue_fill, hwm, shed_count, drop_count, publish_outbox_drop_count, critical_outcome_drop_count` aus eingehender Payload lesen (getattr/safe-get).
- Als Prometheus-Gauges exportieren. Keine neue Pflichtfeld-Pruefung (backwards-compat).
- Bestehende DB-Persistenz NICHT aendern.

**PKG-02 — Rule-Arbitration structured logging:**

```python
# conflict_manager.py:252 (Sinngemaess, Formatierung ruff-konform):
self.logger.warning(
    "Conflict on %s: %s blocked by %s (lower priority %d vs %d)",
    actuator_key, rule_id, existing_lock.rule_id, new_prio, existing_prio,
    extra={
        "event_class": "RULE_ARBITRATION",
        "result": "expected",
        "policy": "first_wins",
        "actuator_key": actuator_key,
        "winner_rule_id": existing_lock.rule_id,
        "loser_rule_id": rule_id,
        "winner_priority": existing_prio,
        "loser_priority": new_prio,
    },
)
```

Zeile 262 analog mit `extra={}`. Message-Prefix erhalten.

**PKG-04a — Terminal-Guard WS-Event + correlation_id_source:**

- `config_handler.py:162-168` im `was_stale`-Pfad **vor** `return True` WS-Broadcast:
  - Event-Name: `config.terminal_guard`
  - Payload: `{esp_id, config_type, authority_key, skipped_broadcast: True, reason: "terminal_authority_guard", t_server_received_ms}`
  - `datetime.now(timezone.utc)` verpflichtend.
- `device_response_contract.py:141-155`: Rueckgabe-Dict erweitern um `correlation_id_source ∈ {"original","request_id","synthetic"}`.
- `device_response_contract.py:260-263` (Actuator): analog.

**PKG-06 — Stale-Guard `expected_guard`:**

```python
# config_handler.py:168 (Sinngemaess):
self.logger.info(
    "Skipping stale config_response due to terminal authority guard: esp_id=%s status=%s key=%s",
    esp_id, response_status, authority_key,
    extra={
        "event_class": "CONFIG_GUARD",
        "action": "skip_stale_response",
        "reason": "terminal_authority",
        "status": "expected",
        "esp_id": esp_id,
        "config_type": config_type,
        "authority_key": authority_key,
    },
)
```

**PKG-07 — 4062 Subcategory:**

- `esp32_error_mapping.py:1613` Entry um `subcategory="MQTT_PUBLISH_BACKPRESSURE"` erweitern.
- `message_user_de` anpassen: "System-Warnung: MQTT-Veroeffentlichung unter Last (kurzfristiger Burst)".
- `troubleshooting_de` additiv: Publish-Kontext-Zeilen (siehe TASK-PACKAGES.md PKG-07).

### Verifikation

```
cd "El Servador/god_kaiser_server" && poetry run ruff check src/
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -v -x
```

- Exit-Code 0, keine Errors. Warnings OK.
- Neue Tests (mindestens):
  - `tests/mqtt/test_queue_pressure_handler.py` (PKG-01b)
  - `tests/mqtt/test_heartbeat_handler.py::test_consumes_publish_queue_fields` (PKG-01b)
  - `tests/services/logic/safety/test_conflict_manager.py::test_conflict_log_contains_structured_fields` (PKG-02)
  - `tests/mqtt/test_config_handler.py::test_terminal_guard_ws_event` (PKG-04a)
  - `tests/services/test_device_response_contract.py::test_correlation_id_source_values` (PKG-04a)
  - `tests/mqtt/test_config_handler.py::test_stale_guard_log_format` (PKG-06)
  - `tests/core/test_esp32_error_mapping.py::test_4062_subcategory_and_message` (PKG-07)

### Akzeptanzkriterien (zusammengefasst)

- Alle neuen Tests gruen; bestehende Tests weiterhin gruen.
- Ruff keine Errors; keine `datetime.utcnow()`, keine naive Timestamps.
- Structured logging mit `extra={}`; alte Message-Prefix erhalten (Log-Parser-Kompat).
- Keine Alembic-Migration; keine Schema-Aenderung; kein MQTT-Topic-Bruch.
- Alle Aenderungen ausschliesslich auf `auto-debugger/work`.

### Querverweise

- PKG-01b braucht PKG-01a Topic-Kontrakt von **esp32-dev** + Topic-Methode von **mqtt-dev**.
- PKG-04a ist Vorbedingung fuer PKG-04b (**frontend-dev**).
- PKG-06 + PKG-02 teilen die structured-logging-Konvention.

---

## Block 2 — esp32-dev (PKG-01a, PKG-03 Firmware-Teil)

### Git (Pflicht)

```
Arbeitsbranch: auto-debugger/work
Vor allen Dateiaenderungen:
    git checkout auto-debugger/work
    git branch --show-current   # muss "auto-debugger/work" ausgeben

Alle Commits dieses Auftrags nur auf diesem Branch.
```

### Scope

Firmware-Aenderungen im Modul `El Trabajante/src/`.

### IST (vor-verifiziert Gate 1)

- `src/tasks/publish_queue.cpp` L13, L14, L40-41, L102, L104, L133, L157-159 (Counter + Drop/Shed + 4062).
- `src/services/communication/mqtt_client.cpp` L637-638, L1134, L1409, L1414-1417 (Outbox-Drop + Heartbeat-Payload-Export).
- `src/models/error_codes.h` — ERROR_TASK_QUEUE_FULL = 4062.

### Pre-Checks (Pflicht)

1. `Grep "PUBLISH_QUEUE_CAPACITY" src/` — Konstante fuer Hysterese-Threshold bestaetigen.
2. `Read platformio.ini` — Target-Environments (`seeed_xiao_esp32c3`, optional `esp32dev_test` fuer Unit-Tests) fuer Build-Matrix.
3. Abstimmung mit **mqtt-dev** Block 4: Topic-Name + QoS-Kontrakt vor Implementierung finalisieren.

### SOLL pro PKG

**PKG-01a — Queue-Pressure Event-Emitter (Firmware):**

1. In `publish_queue.cpp`: Neue Funktion `emitQueuePressureEvent(level, burst_ms)`:
   - Guards: MQTT muss connected sein; sonst skip (**keine** Buffered-Retry).
   - Hysterese:
     - ENTER: `fill > 0.8 * PUBLISH_QUEUE_CAPACITY && last_level != ENTER`.
     - RECOVERED: `fill == 0 && last_level == ENTER`.
     - Mindest-Abstand 5000 ms zwischen zwei Events gleichen Levels (state-flag + `millis()`).
2. Aufruf-Stellen:
   - Bei `g_pq_shed_count.fetch_add(1)` -> Check fuer ENTER.
   - Bei `g_pq_drop_count.fetch_add(1)` -> Check fuer ENTER (falls noch nicht).
   - Bei `fill == 0` in Hot-Path -> Check fuer RECOVERED.
3. Topic: Von mqtt-dev bereitgestellte Konstante/Funktion verwenden (z.B. `buildQueuePressureTopic(esp_id)`).
4. Payload-JSON:
   ```json
   {
     "esp_id": "<ESP_ID>",
     "level": "ENTER" | "RECOVERED",
     "fill": <int>,
     "hwm": <int>,
     "shed_count": <uint32>,
     "drop_count": <uint32>,
     "burst_window_ms": <uint32>,
     "timestamp_ms": <uint64>
   }
   ```
5. Publish via bestehende MQTT-Client-Infrastruktur (QoS0, retain=false).

**PKG-03 (Firmware-Teil) — `t_applied_ms`:**

1. In Actuator-Response-Builder (z.B. `actuator_response.cpp` oder `actuator_command_queue.cpp`):
   `t_applied_ms` = `esp_timer_get_time() / 1000` beim Zeitpunkt der GPIO-Statusaenderung.
2. Als JSON-Feld in bestehende Response-Payload einbetten. Keine bestehenden Felder aendern.

### Verifikation

```
cd "El Trabajante" && pio run -e seeed_xiao_esp32c3
```

- Exit 0, keine Errors. Warnings OK wenn nicht eskaliert.
- Optionaler Firmware-Unit-Test (dedizierte Test-Env): `cd "El Trabajante" && pio test -e esp32dev_test`.
- Unit-Test-Datei (empfohlen): `test/test_publish_queue_hysteresis.cpp`.

### Akzeptanzkriterien

- Firmware kompiliert fuer alle aktiven Target-Environments (`platformio.ini` Matrix).
- Heartbeat-Payload unveraendert (keine Regression); nur neues Topic hinzu.
- Hysterese funktioniert: Stress-Test mit synthetic Burst loest ENTER aus, nach Recovery RECOVERED.
- `t_applied_ms` Feld in Actuator-Response vorhanden, monotonic steigend.
- Keine neuen allocierenden String-Operationen im Hot-Path.

### Querverweise

- Topic-Kontrakt: siehe **mqtt-dev** (Block 4) PKG-01.
- PKG-01b (server-dev) konsumiert Events aus diesem PKG.
- PKG-03 Server-/FE-Teile: **server-dev** Block 1, **frontend-dev** Block 3.

---

## Block 3 — frontend-dev (PKG-04b, PKG-03 FE-Teil)

### Git (Pflicht)

```
Arbeitsbranch: auto-debugger/work
Vor allen Dateiaenderungen:
    git checkout auto-debugger/work
    git branch --show-current   # muss "auto-debugger/work" ausgeben

Alle Commits dieses Auftrags nur auf diesem Branch.
```

### Scope

Vue 3 / TypeScript / Pinia-Stores + WebSocket-Integration im Modul `El Frontend/src/`.

### IST (vor-verifiziert Gate 1)

- `src/shared/stores/actuator.store.ts` L39 `correlation_id?`; L146-147 Timeout-Konstanten; L336 `notifyContractIssue`; L420 Timeout-Config; L875 `handleConfigResponse`; L881-901 Match-Logik.
- `src/.../websocket-events.ts` (TM-Notes Pfadangabe L84-99) — WS-Event-Typdefinitionen.

### Pre-Checks (Pflicht)

1. `Grep -n "ConfigResponseEvent\|config_response" El Frontend/src/shared/stores/` — bestehende Event-Typen + Naming-Convention.
2. `Grep -n "ws\.\|onMessage\|handleWsEvent" El Frontend/src/shared/stores/actuator.store.ts` — Event-Dispatch-Pfad.
3. **Warten auf PKG-04a Server-Seite** — Event-Schema muss stabil sein.

### SOLL pro PKG

**PKG-04b — Soft-Match + WS-Typen:**

1. `websocket-events.ts`: Neuer Event-Typ:
   ```ts
   export interface ConfigTerminalGuardEvent {
     event: 'config.terminal_guard'
     data: {
       esp_id: string
       config_type: string
       authority_key: string
       skipped_broadcast: true
       reason: 'terminal_authority_guard'
       t_server_received_ms: number
     }
   }
   ```
2. `actuator.store.ts`: Neuer Handler `handleConfigTerminalGuard(message: ConfigTerminalGuardEvent)`:
   - Pending Intents filtern nach `esp_id + config_type`.
   - Wenn **count === 1**: Intent als `terminal_via_guard` aufloesen; `status = 'resolved'`, `resolution_source = 'terminal_authority_guard'` (neues optionales Feld).
   - Wenn **count !== 1** (0 oder >1): **nicht** aufloesen; bestehendes Timeout-/Contract-Issue-Verhalten (`CONFIG_RESPONSE_TIMEOUT_MS` bzw. `CONFIG_RESPONSE_TIMEOUT_WITH_OFFLINE_RULES_MS`) bleibt aktiv. Zusaetzlich ein INFO-Log `config_terminal_guard_ambiguous_pending` mit `esp_id, config_type, pending_count`.
3. `actuator.store.ts`: Bestehende `handleConfigResponse` nicht veraendern — rein additiver Pfad.
4. `websocket-events.ts`: Union-Typ fuer einkommende WS-Events um `ConfigTerminalGuardEvent` additiv erweitern; Discriminated Union via `event`-Feld.

**PKG-03 (Frontend-Teil) — `e2e_latency_ms`:**

1. In `actuator.store.ts` beim Auswerten der Terminal-Response `e2e_latency_ms = Date.now() - sentAtMs` berechnen (`sentAtMs` ist bereits vorhanden).
2. Wenn `e2e_latency_ms > 1000`: `logger.warn('e2e_latency_exceeded_1s', { correlation_id, e2e_latency_ms, esp_id })`.
3. Store-Feld `lastE2eLatencyMs` additiv fuer spaetere UI-Badges verfuegbar machen (nicht rendern).
4. Keine Pinia-Store-Shape-Break: alle neuen Felder sind optional.

### Verifikation

```
cd "El Frontend" && npm run build
cd "El Frontend" && npx vue-tsc --noEmit
```

- Exit-Code 0, keine neuen TS-Errors.
- Neue Tests (falls Vitest im Scope):
  - `tests/unit/stores/actuator.store.spec.ts::test_handleConfigTerminalGuard_resolves_only_when_single_pending`.
  - `tests/unit/stores/actuator.store.spec.ts::test_handleConfigTerminalGuard_does_not_resolve_when_multiple_pending`.
  - `tests/unit/stores/actuator.store.spec.ts::test_e2e_latency_warn_above_1000ms`.

### Akzeptanzkriterien

- Neuer Event-Typ typisiert, Discriminated Union erweitert.
- Soft-Match nur bei `pending_count === 1`; sonst bestehendes Verhalten unveraendert.
- Keine `any`-Casts ohne Begruendung (rules.md).
- Frontend-Build gruen; keine Store-Shape-Breaks.

### Querverweise

- Abhaengig von PKG-04a (server-dev Block 1): Event-Schema muss stabil sein.
- PKG-03 Firmware-/Server-Teil: siehe Block 1 und Block 2.

---

## Block 4 — mqtt-dev (PKG-01 Topic-Kontrakt, PKG-08)

### Git (Pflicht)

```
Arbeitsbranch: auto-debugger/work
Vor allen Dateiaenderungen:
    git checkout auto-debugger/work
    git branch --show-current   # muss "auto-debugger/work" ausgeben

Alle Commits dieses Auftrags nur auf diesem Branch.
```

### Scope

MQTT-Topic-Kontrakt + Broker-Config (Server-Seite `topics.py`, Firmware-Seite Topic-Helper), `docker/mosquitto/mosquitto.conf`, `.github/mosquitto/mosquitto.conf`.

### IST (vor-verifiziert Gate 1 + Gate 3)

- `El Servador/god_kaiser_server/src/mqtt/topics.py` — `TopicBuilder` existiert; keine `queue_pressure`-Methoden vorhanden.
- Firmware: Topic-Helper-Funktionen in `El Trabajante/src/services/communication/mqtt_client.cpp`.
- `docker/mosquitto/mosquitto.conf:79` enthaelt `message_size_limit 262144`.
- `.github/mosquitto/mosquitto.conf`: **grep-verifiziert** kein `message_size_limit` (stateless CI-Profil).

### Pre-Checks (Pflicht)

1. `Grep -n "build_.*_topic\|parse_.*_topic" El Servador/god_kaiser_server/src/mqtt/topics.py` — Namenskonvention uebernehmen.
2. **User-Aktion** `B-MQTT-VERSION-01`: Broker-Image-Version mit `docker inspect automationone-mqtt | grep -i image` pruefen; nur fortfahren, wenn Mosquitto >= 2.0.
3. `mosquitto -h 2>&1 | head -3` im Container fuer Versions-Log.

### SOLL pro PKG

**PKG-01 Topic-Kontrakt (Server + Firmware-seitige Helper):**

1. In `topics.py`:
   ```python
   @classmethod
   def build_queue_pressure_topic(cls, esp_id: str) -> str:
       return f"{cls._BASE}/esp/{esp_id}/system/queue_pressure"

   @classmethod
   def parse_queue_pressure_topic(cls, topic: str) -> Optional[dict]:
       # Regex analog zu parse_system_error; liefert {esp_id}
       ...
   ```
2. In Firmware: neue Topic-Helper-Funktion `buildQueuePressureTopic(const char* esp_id, char* out, size_t n)` (siehe esp32-dev Block 2).
3. Keine bestehenden Topics veraendern; additiv. Keine Wildcard-Kollision mit bestehender Subscribe-Matrix pruefen.

**PKG-08 Broker-Config-Migration:**

1. `docker/mosquitto/mosquitto.conf:79`: `message_size_limit 262144` -> `max_packet_size 262144`; Kommentar in derselben Zeile: `# migrated from message_size_limit (PKG-08, INC-2026-04-20)`.
2. `.github/mosquitto/mosquitto.conf`: **No-op**. Der Key ist nicht vorhanden; NICHT blind einfuegen. Im Commit-Body dokumentieren: `ci mosquitto.conf unchanged: no message_size_limit directive present`.
3. Dev-Varianten `mosquitto_*.conf` unter `El Servador/god_kaiser_server/` bleiben unangefasst.

### Verifikation

```
cd "El Servador/god_kaiser_server" && poetry run pytest tests/mqtt/ -k topic -v
cd "El Servador/god_kaiser_server" && poetry run ruff check src/mqtt/topics.py
docker run --rm -v "$PWD/docker/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro" eclipse-mosquitto:2 mosquitto -c /mosquitto/config/mosquitto.conf -t
```

- Topic-Tests: Roundtrip `build -> parse -> dict`.
- Mosquitto-Syntax-Check erwartet Exit 0, kein Deprecation-Hinweis.

### Akzeptanzkriterien

- `TopicBuilder` neue Methoden, mit Unit-Tests.
- `docker/mosquitto/mosquitto.conf` migriert; Kommentar eingefuegt.
- `.github/mosquitto/mosquitto.conf` unveraendert (No-op dokumentiert).
- Dev-Varianten unangefasst.

### Querverweise

- PKG-01 Topic ist Vorbedingung fuer PKG-01a (esp32-dev) und PKG-01b (server-dev).
- PKG-08 Runtime-Verifikation durch Robin (`B-USER-DOCKER-01`).

---

## Block 5 — server-dev Monitoring (PKG-05)

### Git (Pflicht)

```
Arbeitsbranch: auto-debugger/work
```

### Scope

Monitoring-Filter nur als Repo-Config vorbereiten (kein Runtime-Reload).

### SOLL

- Loki-/Grafana-Overlay-Config (genauen Pfad vor Umsetzung per Pre-Check `B-MON-PATH-01` bestaetigen).
- Healthcheck-Client-Noise (`New client connected as healthcheck`/`Client healthcheck disconnected` alle 30s) und Grafana-Alert-Query-Muster (`ERROR|Traceback|Exception` mit `statusCode=200`) als Regex in Filter-Config ergaenzen.
- Alloy-Container-Restart-Noise (`error inspecting Docker container ... connection reset by peer`) als transient taggen (rate_limit).

### Verifikation

- Repo-Diff: Nur Config-Dateien geaendert, kein Code-Modul.
- Runtime-Reload ist **User-Aktion** (`B-USER-DOCKER-01`): `docker compose restart grafana loki` o. ae.

### Akzeptanzkriterien

- Monitoring-Filter-Datei(en) aktualisiert.
- PR-Body listet explizit: "Requires docker restart of grafana/loki to take effect (user action)."

---

## BLOCKER (verbindlich, rollenuebergreifend)

- `B-QP-PERSIST-01` — Entscheidung Prometheus-only vs. mqtt_errors-Annotation vor PKG-01b.
- `B-LOG-API-01` — Logger-API in `conflict_manager.py` bestaetigen (`get_logger` oder `logging.getLogger(__name__)`).
- `B-WS-PATH-01` — WS-Manager-Signatur vor PKG-04a verifizieren.
- `B-MON-PATH-01` — Loki-/Grafana-Overlay-Pfad vor PKG-05 bestaetigen.
- `B-MQTT-VERSION-01` — Mosquitto-Version vor PKG-08 validieren.
- `B-USER-DOCKER-01` — Docker-Restart/Reload durch Robin.
- `B-FE-WS-TYPE-01` — Bestaetigung der exakten `websocket-events.ts` Pfadangabe vor PKG-04b.
- `B-QP-TOPIC-01` — Topic-Name zwischen PKG-01 (mqtt-dev) und PKG-01a (esp32-dev) abstimmen.

---

## Startreihenfolge (verbindlich)

1. **Welle 1 (parallel):** Block 1 PKG-02 + PKG-06 + PKG-07 (server-dev, reine Log-/Mapping-Arbeit), Block 2 PKG-01a Vorbereitung (esp32-dev, Pre-Checks), Block 4 PKG-01 TopicBuilder (mqtt-dev). Keine gegenseitigen Shared-State-Konflikte.
2. **Welle 2 (sequentiell nach Welle 1):** Block 1 PKG-01b (braucht Topic aus PKG-01 und Firmware-Payload-Konvention), Block 1 PKG-04a (WS-Event), Block 2 PKG-01a Implementierung + PKG-03 Firmware-Teil.
3. **Welle 3 (abhaengig von PKG-04a):** Block 3 PKG-04b (frontend-dev).
4. **Welle 4 (parallel wenn PKG-01a Konvention steht):** Block 1 PKG-03 Server-Teil + Block 3 PKG-03 FE-Teil.
5. **Welle 5 (User-Aktionen erforderlich):** Block 4 PKG-08 (`B-MQTT-VERSION-01`, `B-USER-DOCKER-01`), Block 5 PKG-05 (`B-MON-PATH-01`, `B-USER-DOCKER-01`).