# TASK-PACKAGES — INC-2026-04-20-offline-mode-observability-hardening

> **Stand:** Post-Verify final (Gate 1 + Gate 2 abgeschlossen).
> **Branch-Regel (alle Pakete):** Aenderungen und Commits **nur** auf `auto-debugger/work`;
> Branch vor Merge zu `master` von Robin freigeben.
> **Verify-Chain (Status):** Gate 1 = PASS (`VERIFY-PLAN-REPORT.md`); Gate 2 = PASS
> (`VERIFY-PLAN-REPORT-ROUND2.md`).

---

## Paket-Matrix (Uebersicht — Post-Verify mutiert)

| PKG | Titel | Prio | Owner | Schichten | SP | Blockiert durch |
|-----|-------|------|-------|-----------|----|------------------|
| PKG-01a | Firmware: Queue-Pressure Event-Emitter mit Hysterese | P1 | esp32-dev (+ mqtt-dev fuer Topic-Kontrakt) | ESP32 | 3 | — |
| PKG-01b | Server: Queue-Telemetrie-Konsum (Prometheus + Error-Annotation) | P1 | server-dev (+ mqtt-dev) | Server | 2 | Entscheidung `B-QP-PERSIST-01` |
| PKG-02 | Rule-Arbitration-Log structured logging (extra={}) | P1 | server-dev | Server | 2 | Pre-Check `B-LOG-API-01` |
| PKG-03 | End-to-End-Latenzmarker (Firmware + Server + Frontend) | P1 | esp32-dev + server-dev + frontend-dev | ESP32, Server, Frontend | 5 | PKG-01a (Event-Klassen-Konvention) |
| PKG-04a | Server: Terminal-Guard WS-Event + correlation_id_source | P1 | server-dev | Server | 2 | Pre-Check `B-WS-PATH-01` |
| PKG-04b | Frontend: Config-Response Soft-Match + WS-Typen | P1 | frontend-dev | Frontend | 3 | PKG-04a (Event-Kontrakt) + `B-FE-WS-TYPE-01` |
| PKG-05 | Monitoring: Healthcheck-Filter (Loki-Pipeline + Grafana-JSON) | P2 | server-dev (Config-File-only) | Monitoring | 2 | `B-MON-PATH-01`, `B-USER-DOCKER-01` |
| PKG-06 | Stale-Guard-Log als `expected_guard` standardisieren | P2 | server-dev | Server | 1 | — (Pre-Check Log-Level) |
| PKG-07 | Error-Code 4062 Subcategory `MQTT_PUBLISH_BACKPRESSURE` | P2 | server-dev | Server | 2 | — (Pre-Check FE-Consumer) |
| PKG-08 | Mosquitto `max_packet_size` Migration (prod + ci config) | P3 | mqtt-dev (Config-only) | Infra | 1 | `B-MQTT-VERSION-01`, `B-USER-DOCKER-01` |

**Summe:** ~23 SP (nach Splits). Alle PKG additiv; kein Breaking Change.

---

## PKG-01a — Firmware: Queue-Pressure Event-Emitter mit Hysterese

**Prio:** P1
**Owner:** `esp32-dev` (Emitter), Abstimmung mit `mqtt-dev` (Topic-Kontrakt)
**Schichten:** ESP32
**Branch:** `auto-debugger/work`

**IST (verifiziert Gate 1, Abschnitt A):**
- `El Trabajante/src/tasks/publish_queue.cpp` L13,14 (Counter-Atomics), L40-41 (Stats-Export), L102,104,133,157-159 (Drop/Shed + 4062).
- `El Trabajante/src/services/communication/mqtt_client.cpp` L1414-1417 (Heartbeat-Feld-Export bereits vorhanden).
- `El Trabajante/src/models/error_codes.h` — ERROR_TASK_QUEUE_FULL = 4062.

**SOLL (additiv):**
1. Neue Funktion `emitQueuePressureEvent(level, context)` in `publish_queue.cpp` mit
   Hysterese-Logik:
   - `level=ENTER` wenn `fill > 0.8 * PUBLISH_QUEUE_CAPACITY` und `last_level != ENTER`.
   - `level=RECOVERED` wenn `fill == 0 && last_level == ENTER`.
   - Mindestabstand 5000 ms zwischen zwei Events gleichen Levels (anti-spam).
2. Publish an Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/queue_pressure` (QoS0, retain=false).
   Topic-Bau MUSS zentralisiert sein (siehe PKG-01 / mqtt-dev Abschnitt) — kein hardcoded String.
3. Payload-JSON-Felder: `{ esp_id, level, fill, hwm, shed_count, drop_count, burst_window_ms, timestamp_ms }`.
4. Wenn MQTT nicht connected: Event wird **verworfen** (kein Backfill — Queue-Pressure ist
   inhaerent ein Zustand online-Pfades).

**Risiko:** Topic-Explosion wenn Hysterese fehlerhaft. **Mitigation:** Unit-Tests fuer Threshold-
Logik + Abstands-Enforcement.

**Tests:**
- `cd "El Trabajante" && pio run -e seeed_xiao_esp32c3` (Exit 0).
- Optionaler Unit-Test via PlatformIO-Test-Env: `cd "El Trabajante" && pio test -e esp32dev_test` mit `test/test_publish_queue_hysteresis.cpp`.

**Akzeptanzkriterien:**
- Event emittiert korrekt bei ENTER und RECOVERED mit Hysterese.
- Kein Einfluss auf bestehende Heartbeat-Payload (additives Topic).
- Firmware kompiliert fuer alle Target-Environments.

**BLOCKER:** `B-QP-TOPIC-01` (TopicBuilder-Abstimmung mit mqtt-dev — siehe PKG-01 mqtt-dev-Hinweis in SPECIALIST-PROMPTS).

---

## PKG-01b — Server: Queue-Telemetrie-Konsum (Prometheus + Error-Annotation)

**Prio:** P1
**Owner:** `server-dev` (Handler + Metrics), Abstimmung mit `mqtt-dev` (Topic-Parse)
**Schichten:** Server
**Branch:** `auto-debugger/work`

**IST (verifiziert):**
- `El Servador/god_kaiser_server/src/mqtt/handlers/` enthaelt Handler-Pattern; `error_handler.py`
  ist Referenz-Vorbild.
- `src/core/metrics.py` existiert — Prometheus-Metric-Ablage vorhanden.
- `src/db/repositories/esp_heartbeat_repo.py` und `src/services/simulation/scheduler.py` referenzieren bereits `publish_queue`/`publish_outbox`.
- Heartbeat-Handler `heartbeat_handler.py` konsumiert aktuell die Heartbeat-Felder `publish_queue_*` **nicht**.
- **Keine** neue Alembic-Migration in diesem Lauf (Steuerdatei `forbidden`).

**SOLL (additiv):**

**Teil 1 — Neuer Topic-Handler:**
1. Neue Datei `src/mqtt/handlers/queue_pressure_handler.py` nach Pattern `error_handler.py`.
2. `validate_payload` prueft Pflichtfelder: `esp_id`, `level`, `fill`, `hwm`, `shed_count`, `drop_count`.
3. `process_message` **persistiert nicht neu** (keine Alembic), sondern:
   - Erhoeht Prometheus-Gauge `esp_publish_queue_pressure{esp_id, level}`.
   - Schreibt als `mqtt_errors`-Row mit `subcategory=QUEUE_PRESSURE` via bestehender Error-Pipeline (falls Robin das `B-QP-PERSIST-01` so entscheidet).
   - **Alternative (Standard):** Nur Prometheus, kein DB-Write. Entscheidung in SPECIALIST-PROMPT als User-Gate markiert.
4. Registrierung im MQTT-Handler-Routing-Dict (analog zu bestehenden Handlern).

**Teil 2 — Heartbeat-Handler-Erweiterung:**
1. `heartbeat_handler.py`: zusaetzlich Felder `publish_queue_fill, hwm, shed_count, drop_count,
   publish_outbox_drop_count, critical_outcome_drop_count` aus eingehender Heartbeat-Payload
   extrahieren und als Prometheus-Gauges exportieren.
2. **Keine** Pflichtfeld-Pruefung (Backwards-compat; aeltere Firmware ohne diese Felder muss weiter funktionieren).

**Risiko:** Prometheus-Cardinality-Explosion wenn `esp_id` als Label unbegrenzt. **Mitigation:**
`esp_id` bereits in anderen Metrics als Label verwendet, Anzahl ESPs bleibt O(10-100).

**Tests:**
- `pytest El Servador/god_kaiser_server/tests/mqtt/test_queue_pressure_handler.py` (min. 3 Cases: ENTER, RECOVERED, invalid-payload).
- `pytest El Servador/god_kaiser_server/tests/mqtt/test_heartbeat_handler.py::test_consumes_publish_queue_fields`.
- `ruff check src/mqtt/handlers/queue_pressure_handler.py`.

**Akzeptanzkriterien:**
- Prometheus-Gauge `esp_publish_queue_pressure` vorhanden, nach 10-Min-Dauerlauf mit HW
  nicht-Null.
- Keine Alembic-Migration; keine Schema-Aenderung.
- Backwards-compat fuer aeltere Firmware-Heartbeats.

**BLOCKER:** `B-QP-TOPIC-01`, `B-QP-PERSIST-01` (Robins Entscheidung Persistenz-Strategie vor Dispatch).

---

## PKG-02 — Rule-Arbitration-Log structured logging

**Prio:** P1
**Owner:** `server-dev`
**Schichten:** Server
**Branch:** `auto-debugger/work`

**IST (verifiziert):**
- `src/services/logic/safety/conflict_manager.py` L29 `FIRST_WINS="first_wins"`; L252 f-string-Log;
  L262 Error-Event-Message.

**SOLL (additiv, Gate-1-Delta D-02-1):**
1. `conflict_manager.py:252` umstellen auf structured logging:
   ```python
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
   Alte Message-Form bleibt als Prefix (Log-Parser-Kompat).
2. `conflict_manager.py:262` analog mit `extra={...}`.

**Risiko:** Downstream-Log-Parser. **Mitigation:** Message-Prefix erhalten.

**Pre-Check (Pflicht vor Implementierung):**
- `Grep "get_logger\|logger = " El Servador/god_kaiser_server/src/services/logic/safety/conflict_manager.py`
  -> bestaetigen, dass `get_logger(__name__)` verwendet wird (api-rules.md Abschnitt 8).
- Falls nicht: **BLOCKER B-LOG-API-01** fuer separates Cleanup-PKG.

**Tests:**
- `pytest .../test_conflict_manager.py::test_conflict_log_contains_structured_fields`.
- `ruff check src/services/logic/safety/conflict_manager.py`.

**Akzeptanzkriterien:**
- Log enthaelt strukturierte `extra`-Felder (JSON-Log-Format).
- Ruff: keine Errors, keine neuen any/type-Probleme.

---

## PKG-03 — End-to-End-Latenzmarker

**Prio:** P1
**Owner:** `esp32-dev` (t_applied_ms), `server-dev` (t_server_*), `frontend-dev` (t_rendered_ms)
**Schichten:** ESP32, Server, Frontend
**Branch:** `auto-debugger/work`

**IST (verifiziert):**
- Firmware hat `esp_timer_get_time()`.
- Server-seitig: `datetime.now(timezone.utc)` verpflichtend (api-rules.md Abschnitt 7).
- Frontend: `actuator.store.ts:420` verwaltet pending Intent.

**SOLL (additiv, Gate-1-Delta D-03-1/3/4):**
1. **Firmware:** In Actuator-Response-Payload zusaetzlich `t_applied_ms`:
   - Default: immer (kein Build-Flag) — Feld ist klein (<20 Bytes).
   - Wert: `esp_timer_get_time() / 1000` (Millis seit Boot, monotonic).
2. **Server:** Intent-Outcome-Handler + WS-Broadcast ergaenzen Felder:
   - `t_server_received_ms` = `int(datetime.now(timezone.utc).timestamp() * 1000)` bei Handler-Entry.
   - `t_server_published_ms` = gleicher Stil unmittelbar vor WS-Broadcast.
3. **Frontend:** `actuator.store.ts` setzt `t_command_ms` beim Intent-Start, berechnet bei
   Terminal-Match: `e2e_latency_ms = Date.now() - t_command_ms`.
4. **Frontend:** Bei `e2e_latency_ms > 1000` -> `logger.warn("e2e_latency_exceeded_1s", { correlation_id, e2e_latency_ms })`.
5. **Frontend:** Store-Exposure `$latencyMetric` (reaktiv) fuer optionales UI-Badge (nicht in diesem PKG implementieren, nur Metrik verfuegbar machen).

**Abhaengigkeit:** PKG-01a (Event-Klassen-Konvention `STATE_EMIT` konsistent mit PKG-03).

**Risiko:** Payload-Groesse unter Burst-Druck. **Mitigation:** Kleine Felder (Integer ms).

**Tests:**
- Firmware: `cd "El Trabajante" && pio run -e seeed_xiao_esp32c3` (Exit 0).
- Server: `cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -k test_actuator_response_latency_fields_parsed -v` (Exit 0).
- Frontend: `cd "El Frontend" && npm run build && npx vue-tsc --noEmit` (Exit 0).
- Integration (manuell): 1 Command -> Timestamps auf 3 Layern vorhanden und plausibel (<1s Gesamt).

**Akzeptanzkriterien:**
- Alle 3 Layer loggen/broadcasten Timestamp-Felder.
- FE loggt WARN bei >1s E2E-Latenz.
- Server-Timestamps verwenden `datetime.now(timezone.utc)` (keine naive Times).

---

## PKG-04a — Server: Terminal-Guard WS-Event + correlation_id_source

**Prio:** P1
**Owner:** `server-dev`
**Schichten:** Server
**Branch:** `auto-debugger/work`

**IST (verifiziert):**
- `src/mqtt/handlers/config_handler.py` L162 `if was_stale:` L168 Log + frueh-Return.
- `src/services/device_response_contract.py` L141-155 canonical correlation_id; L260-263 Actuator-Variante.

**SOLL (additiv, Gate-1-Delta D-04-1/4):**
1. **Pre-Check:** Exakten WS-Manager-Pfad verifizieren (BLOCKER `B-WS-PATH-01`). Vorgemerkt:
   `src/websocket/manager.py` (analog zu bestehenden Referenzen in TM-Notes).
2. `config_handler.py`: Vor Early-Return `return True` im `was_stale`-Pfad zusaetzlich:
   ```python
   await ws_manager.broadcast(
       event="config.terminal_guard",
       data={
           "esp_id": esp_id,
           "config_type": config_type,
           "authority_key": authority_key,
           "skipped_broadcast": True,
           "reason": "terminal_authority_guard",
           "t_server_received_ms": int(datetime.now(timezone.utc).timestamp() * 1000),
       },
   )
   ```
3. `device_response_contract.py`: Feld `correlation_id_source` am Rueckgabe-Dict anhaengen:
   - `"original"` wenn Payload `correlation_id` hatte.
   - `"request_id"` wenn Fallback auf `request_id` (L144-147).
   - `"synthetic"` wenn `missing-corr:...` generiert.

**Risiko:** Keine Breaking Changes (WS-Event ist additiv; neues Dict-Feld ignoriert wenn nicht konsumiert).

**Tests:**
- `pytest .../test_config_handler_emits_terminal_guard_ws_event`.
- `pytest .../test_device_response_contract.py::test_correlation_id_source_values`.
- `ruff check`.

**Akzeptanzkriterien:**
- Stale-Guard-Pfad emittiert WS-Event mit `skipped_broadcast=true`.
- `correlation_id_source` immer gesetzt auf `original|request_id|synthetic`.

**BLOCKER:** `B-WS-PATH-01`.

---

## PKG-04b — Frontend: Config-Response Soft-Match + WS-Typen

**Prio:** P1
**Owner:** `frontend-dev`
**Schichten:** Frontend
**Branch:** `auto-debugger/work`
**Blockiert durch:** PKG-04a (Event-Kontrakt muss stabil sein).

**IST (verifiziert):**
- `El Frontend/src/shared/stores/actuator.store.ts` L875-901 `handleConfigResponse` +
  `notifyContractIssue`.
- `websocket-events.ts` (Pfad in TM-Notes `El Frontend/src/.../websocket-events.ts:84-99`).

**SOLL (additiv, Gate-1-Delta D-04-2/3):**
1. `websocket-events.ts`: Neuer Event-Typ `ConfigTerminalGuardEvent` mit Feldern aus PKG-04a.
   Strict TypeScript — kein `any`.
2. `actuator.store.ts`: Neuer Handler `handleConfigTerminalGuard({ data })`:
   - Wenn pending Intent fuer `esp_id + config_type` eindeutig (count == 1): finalisiere Intent
     mit Status `terminal_guard_match`. KEIN `notifyContractIssue`.
   - Wenn count > 1 oder 0: Log INFO + KEINE Finalisierung (bestehender Timeout/Contract-Issue-Pfad).
3. `handleConfigResponse`: Wenn `correlation_id_source == "synthetic"` und ein pending Intent
   matched per Soft-Match: gleiche Soft-Match-Policy wie in (2).

**Risiko:** False-Positive bei parallelen Config-Updates. **Mitigation:** strikte count==1-Pruefung.

**Tests:**
- Vitest `handleConfigTerminalGuard_finalizes_on_soft_match`.
- Vitest `handleConfigResponse_ignores_when_multiple_pending`.
- `cd "El Frontend" && npm run build && npx vue-tsc --noEmit` (Exit 0).

**Akzeptanzkriterien:**
- Soft-Match-Pfad implementiert mit count==1-Guard.
- Keine any-Casts.
- Design-Token-Regeln (AUT-42..AUT-53) beibehalten.

**BLOCKER:** `B-FE-WS-TYPE-01`.

---

## PKG-05 — Monitoring: Healthcheck-Filter

**Prio:** P2
**Owner:** `server-dev` (Config-File-only)
**Schichten:** Monitoring (Loki/Grafana-JSON im Repo)
**Branch:** `auto-debugger/work`

**IST:** Mosquitto healthcheck-Disconnects alle 30s im Log-Stream.

**SOLL (Gate-1-Delta D-05-1/2):**
1. **Pre-Check:** Loki-Config-Pfad im Repo verifizieren (BLOCKER `B-MON-PATH-01`). Vorgemerkte
   Pfade: `docker/loki/` / `infra/monitoring/loki/` / `.github/monitoring/`.
2. Loki Pipeline-Stage: bei Match `client.*healthcheck.*disconnected` Label `healthcheck=true`
   setzen.
3. Grafana-Dashboard-JSON (im Repo eingecheckt): Default-Panel-Query erweitern um
   `{ healthcheck!="true" }`.

**Risiko:** Loki/Grafana-Reload noetig. **Mitigation:** Keine Regel-Logik-Aenderung — nur Label/Filter.

**BLOCKER:** `B-MON-PATH-01`, `B-USER-DOCKER-01` (Reload ausserhalb Sandbox).

**Tests:**
- yaml-/JSON-Syntax-Check.
- Manuell nach Reload: Panel zeigt keine healthcheck-Disconnects.

**Akzeptanzkriterien:**
- Default-Panel sauber.
- Config-Dateien im Repo versioniert.

---

## PKG-06 — Stale-Guard `expected_guard` Label

**Prio:** P2
**Owner:** `server-dev`
**Schichten:** Server
**Branch:** `auto-debugger/work`

**IST (verifiziert):**
- `config_handler.py:168` Logger-Call (Level vor Implementierung zu bestaetigen — vermutlich INFO).

**SOLL (additiv, Gate-1-Delta D-06-1):**
1. Pre-Check: `Read config_handler.py L162-175` — Level bestaetigen.
2. Log-Line umstellen auf structured logging (konsistent mit PKG-02):
   ```python
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

**Risiko:** Keine.

**Tests:**
- `pytest .../test_config_handler.py::test_stale_guard_log_format`.
- `ruff check`.

**Akzeptanzkriterien:**
- Log enthaelt `event_class=CONFIG_GUARD status=expected`.

---

## PKG-07 — Error-Code 4062 Subcategory

**Prio:** P2
**Owner:** `server-dev`
**Schichten:** Server
**Branch:** `auto-debugger/work`

**IST (verifiziert):**
- `src/core/esp32_error_mapping.py:1613-1626` — Standard-Keys `category, severity, message_de,
  message_user_de, troubleshooting_de, docs_link, recoverable, user_action_required`.

**SOLL (additiv, Gate-1-Delta D-07-1/2):**
1. **Pre-Check:** `Grep "subcategory" El Frontend/src/ El Servador/god_kaiser_server/src/` —
   falls Consumer dieses Feldes existieren, Default-Handling sicherstellen.
2. `esp32_error_mapping.py:1613` Entry erweitern:
   - `"subcategory": "MQTT_PUBLISH_BACKPRESSURE"`
   - `message_user_de`: `"System-Warnung: MQTT-Veroeffentlichung unter Last (kurzfristiger Burst)"`
   - `troubleshooting_de`: alte Zeilen beibehalten + 2 neue Zeilen zu Publish-Kontext:
     - `"4. Backpressure: Queue-Fuellstand aus Heartbeat pruefen (publish_queue_hwm, shed/drop)"`
     - `"5. Bei anhaltendem Druck: Firmware-Emitter-Raten fuer Non-Critical-Pfade reduzieren"`

**Risiko:** **MINOR Breaking** wenn FE Snapshot-Tests auf Mapping-Dict-Keys laufen.
**Mitigation:** Pre-Check Grep; Additiv (kein Rename, kein Remove).

**Tests:**
- `pytest .../test_esp32_error_mapping.py::test_4062_subcategory_and_message`.
- Snapshot-Test (falls existent) aktualisieren.

**Akzeptanzkriterien:**
- Mapping enthaelt `subcategory=MQTT_PUBLISH_BACKPRESSURE`.
- Alte Consumer laufen (Default-Handling geprueft).

---

## PKG-08 — Mosquitto `max_packet_size` Migration

**Prio:** P3
**Owner:** `mqtt-dev` (Config-only)
**Schichten:** Infrastruktur
**Branch:** `auto-debugger/work`

**IST (verifiziert Gate 1 + Gate 3):**
- `docker/mosquitto/mosquitto.conf:79` enthaelt `message_size_limit 262144`.
- `.github/mosquitto/mosquitto.conf` (CI-Variante) — **Gate-3 grep-verifiziert:** KEIN `message_size_limit`, KEIN `max_packet_size`; nur `listener 1883 0.0.0.0` und `persistence false` (stateless CI-Profil).
- Mehrere Dev-Varianten unter `El Servador/god_kaiser_server/mosquitto_*.conf` (Dev-Artefakte, nicht Produktion).

**SOLL (Gate-1-Delta D-08-1/2 + Gate-3-Korrektur):**
1. **Pre-Check:** Broker-Version im Container bestimmen (BLOCKER `B-MQTT-VERSION-01`):
   `docker inspect automationone-mqtt | grep -i image` (User-Aktion).
2. **Wenn Version >= 2.0:** `message_size_limit 262144` -> `max_packet_size 262144` in:
   - `docker/mosquitto/mosquitto.conf:79` (Pflicht-Migration).
   - `.github/mosquitto/mosquitto.conf`: **No-op** — der Key ist nicht vorhanden; NICHT blind hinzufuegen (CI-Profil ist bewusst minimal). Im PR dokumentieren: `CI-config unchanged: no message_size_limit directive to migrate`.
3. Dev-Varianten (`mosquitto_fix.conf` etc.) NICHT anfassen — Dev-Artefakte.
4. Kommentar in `docker/mosquitto/mosquitto.conf` an der migrierten Zeile: `# migrated from message_size_limit (PKG-08, INC-2026-04-20)`.

**Risiko:** Broker-Version < 2.0 -> Directive wird nicht erkannt. **Mitigation:** Pre-Check.

**BLOCKER:** `B-MQTT-VERSION-01`, `B-USER-DOCKER-01`.

**Tests:**
- Syntax-Check: `mosquitto -c docker/mosquitto/mosquitto.conf -t` (wenn lokal verfuegbar).
- Nach Broker-Restart: Startlog ohne Deprecation-Warnung (User pruefe und lege Evidenz unter `logs/broker-startlog-after.txt`).

**Akzeptanzkriterien:**
- `docker/mosquitto/mosquitto.conf` migriert (Schluessel geaendert, Kommentar gesetzt).
- `.github/mosquitto/mosquitto.conf` unveraendert (kein blinder Einfuegevorgang, No-op dokumentiert).
- Startlog clean nach Restart, keine Deprecation-Warnung.

---

## Reihenfolge (Dispatch) — Post-Verify

1. **Welle 1 (parallel, nach Gate 2):** PKG-02, PKG-06, PKG-07 (Server-Logs/Mapping, ohne Cross-Layer), plus Pre-Checks fuer BLOCKER B-LOG-API-01, B-MON-PATH-01, B-WS-PATH-01.
2. **Welle 2 (abhaengig von Welle 1):** PKG-01a + PKG-01b (Queue-Pressure), nach Persistenz-Entscheidung `B-QP-PERSIST-01`. PKG-01a und PKG-01b sind inhaltlich entkoppelt — **parallel-dispatch** zulaessig (kein Shared-State), aber PKG-01b braucht PKG-01a Topic-Kontrakt.
3. **Welle 3 (Cross-Layer):** PKG-04a -> PKG-04b (sequentiell; FE braucht Event-Kontrakt aus Server-Teil).
4. **Welle 4:** PKG-03 (3-Schichten, parallel-dispatch-geeignet wenn PKG-01a Konvention steht).
5. **Welle 5 (User-Aktionen):** PKG-05, PKG-08 (brauchen Docker/Infra-Access).

**Anti-KI-Regel (CLAUDE.md Ueberarbeitungsnotiz):** Jedes PKG ist klein (max 5 SP) und ueber genau die Schichten geschnitten, die es braucht. Kein Mega-PKG.
                                  