# STATE-ARCHITECTURE-ANALYSIS — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Scope:** End-to-End Cross-Layer-State-Drift (Firmware ↔ Broker ↔ Server ↔ DB ↔ Frontend) bei häufigem Reconfigure/Reconnect
**Stand:** 2026-04-17 · **Branch für Umsetzung:** `auto-debugger/work`
**Primärquelle-Artefakte:** `INCIDENT-LAGEBILD.md`, `CORRELATION-MAP.md`, `TASK-PACKAGES.md`, `VERIFY-PLAN-REPORT.md`, `RUN-FORENSIK-REPORT-2026-04-17.md`, `SPRINT-PLAN-2026-04-17.md`, `SPECIALIST-PROMPTS.md`
**Linear-Projekt:** „MQTT-Transport & Recovery Hardening (INC EA5484)" — AUT-54..AUT-67 (14 Issues, 44 SP)

---

## 0. Executive Summary

Die Live-Evidence (Stresstest 2026-04-17 13:39:28, `device-monitor-260417-133604.log`) bestätigt **kein** WDT/Guru-Crash, aber einen **zusammengesetzten** Drift-Loop:

1. **Transport-Layer bricht zuerst** (`errno=119`/`errno=11` → `MQTT_EVENT_ERROR` → `MQTT_EVENT_DISCONNECTED` → `esp-tls CONNECTION_TIMEOUT`).
2. **Publish-Pfad kollabiert parallel** (`SafePublish failed after retry`), während **Heartbeat degradiert** (`skipping gpio_status due to low memory headroom`) — ohne die Session zu stabilisieren.
3. **Safety-P4 reagiert deterministisch** (Grace 30 s → `OFFLINE_ACTIVE`, Offline-Regel für Aktor GPIO 25). Das ist **keine** Regression, sondern erwartete Policy-Folge.
4. **State-Drift entsteht *nicht* primär aus dem Transport-Event, sondern aus dem Recovery-Pfad**: Reconnect-Lifecycle, Registration-Gate, Approval-NVS, Config-Cooldowns, Readiness-Gate und WebSocket-Projektion referenzieren **unterschiedliche Autoritäten**. Solange Transport kurz genug unterbrochen ist, konvergiert das System; bei wiederholten Reconnects summieren sich Autoritäts-Mismatche.

**Kern-Thesen (evidenzgestützt):**

- Der **Reconnect-Zyklus** (Handover-Epoch + Adoption + Config-Cooldown) ist an mehreren Stellen **nicht streng synchronisiert** → AUT-55, AUT-56, AUT-60, AUT-61.
- Der **Counter-Pfad ist blind** (`write_timeouts=0` bei Write-Timeout-Evidence) → AUT-67 (H5 aus LAGEBILD §4).
- **Telemetrie vs. State** driftet: `payload_degraded=true` ist gesetzt, aber Safety-/Logic-Pfade konsumieren es nicht als Backpressure-Signal → neue Gap G-NEW-01.
- **Terminal-Authority-Guard** (LWT) ist DB-seitig korrekt, aber die Firmware besitzt **keine Leser-Semantik** für den gleichen Schlüsselraum → potenzielle Drift bei Cross-Reconnect-Ordering → Gap G-NEW-02.
- Die dokumentierten Issues AUT-54..AUT-67 decken **90 %** der Drift-Klassen ab. Echte Lücken sind: Telemetrie-Backpressure, End-to-End Handover-Session-Tracing und 4 h-Soak-Harness (AUT-67 ist da, aber nur Counter-Scope).

**Ergebnis:** Eine neue Arbeitsschicht ist **nicht** nötig — die vorhandenen Issues werden gezielt **präzisiert**, **verkettet (blockedBy)** und **auf Konvergenz-Gates** abgebildet. **Drei** kleine Gap-Tickets werden als Vorschlag mitgeliefert (siehe §6).

---

## 1. IST/SOLL-Matrix je Layer

> **Legende:** RC = Reconnect-Cycle · RCf = Reconfigure-Cycle · HB = Heartbeat · LWT = Last Will · ACK = Server-ACK. Alle Pfade mit Repo-Belegen.

### 1.1 Firmware (El Trabajante — ESP-IDF esp_mqtt_client-Pfad)

| State/Feld | IST (Evidence) | SOLL | Drift-Risiko | Linear |
|---|---|---|---|---|
| **MQTT-Transport** | `mqtt://%s:%d` in `mqtt_client.cpp:290` (Dev) · `keepalive = config.keepalive` in 311 (60 s) · Write-Timeout `errno=119` → `MQTT_EVENT_ERROR` (1249–1261) → `DISCONNECTED` + 3014 (1159–1179) | TLS-Pfad für Prod-URI `mqtts://`, Keepalive-Dynamik (15–60 s), klare TCP↔TLS-Fehlerklassifikation | Fehlklassifikation Write-Timeout ↔ TLS-Timeout | **AUT-54** |
| **Reconnect-Loop** | `managed reconnect scheduled … reason=mqtt_transport_error`, `attempt=3` persistiert über viele Zyklen (Live-Log) | Monotoner Backoff mit Obergrenze, Reset bei **validem** ACK | Attempt-Counter bleibt zu hoch → aggressive Reconnects | **AUT-54**, **AUT-67** |
| **Registration-Gate** | `registration_confirmed_` nur gesetzt nach voller Contract-ACK-Validierung (`main.cpp:2260–2269`, `mqttClient.confirmRegistration()`) | Gate bleibt geschlossen bis `handover_epoch` gültig **und** Config ausgeliefert | Gate wird pro RC korrekt gesetzt — ABER `offlineModeManager.validateServerAckContract` nutzt nicht die Config-Commit-Validität | **AUT-56**, **AUT-61** |
| **Approval-NVS** | ACK-Callsite *hat* bereits Dedup (`main.cpp:2300–2324`, `APPROVAL_TS_PERSIST_INTERVAL_S`-Interval); `ConfigManager::setDeviceApproved` hat zweite Guard (`config_manager.cpp:1291–1324`) | Exakt **eine** autoritative Guard, jede ACK-Überschreibung nachvollziehbar | Zwei Guards mit unterschiedlichen Semantiken (Interval vs. ts_changed) → potenzielle *doppelte* Ablehnungen | **AUT-61** (Arbeit läuft; Callsite schon teilimplementiert) |
| **Heartbeat-Degradation** | `payload_degraded=true` + `heartbeat_degraded_count` (`mqtt_client.cpp:1321–1348`); Skip `gpio_status` bei `max_alloc < HB_ALLOC_DEGRADE_BYTES` | Gleiches Verhalten plus **Backpressure-Signal** an Publish-Queue (Drain-Pause/Prioritäts-Skip) | Aktuell nur Log-Warning, **keine** Auswirkung auf Outbox/Queue → Gap G-NEW-01 | **AUT-60** teilweise; **Gap G-NEW-01** |
| **Publish-Queue / SafePublish** | `SafePublish failed after retry` im Stress; Intent-Outcome publish-Pfad vorhanden (`publishIntentOutcome`) | Retry mit max Attempts, danach **deterministisches Drop-Event** mit `code`/`reason`, Drop-Counter pro Klasse (critical vs. non-critical) | Drop-Klassifikation und Emission sind da (1150–1161), aber nicht vollständig an Intent-Outcome-Lifecycle angedockt | **AUT-55**, **AUT-60** |
| **Offline-/Safety-State** | `safety_task.cpp:79–95`: NOTIFY_MQTT_DISCONNECTED → `setUncoveredActuatorsToSafeState()` wenn Offline-Regel vorhanden, sonst `setAllActuatorsToSafeState()` · Grace 30 s → OFFLINE_ACTIVE | Identisch; bei Reconnect: strikt „ADOPTING → ADOPTED"-Handshake **bevor** Logic Engine feuert | Fail-closed funktioniert; **Re-Activation** hängt an Adoption-Completed-Event (`heartbeat_handler.py:467–471`) | **AUT-66** (bereits Fix), **AUT-63** |

### 1.2 Broker (Mosquitto Dev / Prod)

| State/Feld | IST | SOLL | Drift-Risiko | Linear |
|---|---|---|---|---|
| **Session** | `exceeded timeout` → Broker-Session-Ende (Bericht §2); `max_keepalive 65535`, `max_inflight_messages 20` (`docker/mosquitto/mosquitto.conf`) | Session-Lifecycle korreliert mit Client-Keepalive; Retained-LWT bleibt bis zum Heartbeat-Clear | Retained LWT-Clear klappt aktuell (`heartbeat_handler.py:437–447`) — aber **keine** Authority-Konsolidierung mit `command_contract`-Guard am Client | **B-NET-01** (Rohlogs), **AUT-54** (Broker-Obs-Pfad) |
| **NAT / Docker** | `172.19.0.1` im Bericht; kein paralleler Router-Log | Klarer Docker-Netz-Scope; keine NAT-Drops unter Last | Vermutung bei Bursts, offen bis B-NET-01 | **B-NET-01** |

### 1.3 Server (El Servador — FastAPI / async SQLAlchemy)

| State/Feld | IST | SOLL | Drift-Risiko | Linear |
|---|---|---|---|---|
| **Heartbeat-ACK** | `_send_heartbeat_ack` **vor** DB-Writes („Early ACK", `heartbeat_handler.py:328–351`) — reduziert P1-Latenz | Identisch, aber ACK muss **idempotent** bzgl. Handover-Epoch und Session-ID sein | `_build_ack_contract_context` inkrementiert Epoch nur bei `is_reconnect`; bei doppelten kurzen HB kann stale Epoch an ESP gelangen | **AUT-56** |
| **Reconnect-Detection** | `is_reconnect = offline_seconds > 60` (`heartbeat_handler.py:302–307`) | Genau: Schwelle passt zu `HEARTBEAT_TIMEOUT_SECONDS = 300`? | Mismatch: Threshold=60 s vs. Timeout=300 s → Server markiert jeden kurzen Jitter als Reconnect-Adoption | **AUT-56** (neues Sub-Pkt.) |
| **StateAdoption-Service** | In-Memory Dict `_cycles` (`state_adoption_service.py:50`), Phasen `adopting → adopted`; **kein** DB-Persist | SSOT im Prozess ok, aber **Server-Restart** löscht alle Zyklen → logic_engine wirft trotz laufenden Actuators evtl. inkonsistent | Server-Restart → Alle Actuators gelten als „adoption_completed=True" via `is_adoption_completed(cycle is None → True)` | **AUT-63** (Adoption als Gate), **Gap G-NEW-02** |
| **Runtime-State-Service** | `RuntimeStateService` mit State-Machine COLD_START→WARMING_UP→NORMAL → evtl. RECOVERY_SYNC; `increment_ready_blocked/transition` Metriken | Reconnect eines ESP erzwingt **RECOVERY_SYNC**, nicht global | Derzeit global state — ein ESP darf nicht den Server in RECOVERY_SYNC zwingen (OK); aber **kein** per-esp-Readiness-Snapshot | **AUT-59** (Readiness-Gate) |
| **LWT-Handler** | Canonical-Reason, Terminal-Authority-Guard, `clear_cycle` bei offline (`lwt_handler.py:130–165`) | Identisch; plus Emission eines WS-Drift-Events wenn `was_stale=True` | `was_stale` wird metriksiert, aber nicht als WS-Drift-Event an UI | **Gap G-NEW-03** (minimal) |
| **Logic-Engine Online-Gate** | `is_online` Check (LAGEBILD: `logic_engine.py:1098, 1256`) | `is_online AND adoption_completed AND readiness_ok` (fail-closed bis Adoption ACK) | Nur `is_online` → Feuert potenziell vor Adoption | **AUT-63** |
| **MQTTCommandBridge / Full-State-Push** | Fires nach Commit + is_reconnect (`heartbeat_handler.py:474–478`) | Gated durch `_has_pending_config` Cooldown (`CONFIG_PUSH_COOLDOWN_SECONDS=120`) | BUG-2-Fix vorhanden (Cooldown-Commit nachgezogen, 594) — aber Cooldown ist nur in `device_metadata` → kein DB-Constraint | **AUT-57**, **AUT-65** |
| **Actuator-Reset on LWT** | `reset_states_for_device(..., "off", reason="lwt_disconnect")` (`lwt_handler.py:168–216`) + History-Log | Identisch; plus **Emergency-Contract-Konformität** (stop_all/emergency_stop lowercase) | Uppercase `EMERGENCY_STOP` in `actuators.py:1027` driftet vs. Broadcast-Contract `stop_all`/`emergency_stop` (→ 3016) | **AUT-64** |

### 1.4 Datenbank (PostgreSQL via Alembic)

| State/Feld | IST | SOLL | Drift-Risiko | Linear |
|---|---|---|---|---|
| **esp_device.status** | `online` ↔ `pending_approval` ↔ `offline` ↔ `rejected` ↔ `deleted`; Update in `esp_repo.update_status` | Identisch | Kein DB-Level State-Machine Guard → Direktes `rejected → online` möglich | **AUT-56** (als Invarianten-Test) |
| **command_contract.terminal_authority** | `upsert_terminal_event_authority` mit `dedup_key`, `is_final`, `generation`, `seq` (LWT + Config-Response) | Identisch; plus Firmware-seitige Dedup-Key-Erzeugung mit gleichem Schlüsselraum | Firmware erzeugt derzeit nur lokale `seq`, kein `correlation_id`-Round-Trip an `system/will` LWT | **AUT-62** |
| **heartbeat_history** | `log_heartbeat` in Savepoint (`heartbeat_handler.py:502–515`) | Identisch | OK; nur Telemetrie, kein State-Gate | — |
| **audit_log** | `log_device_event` + `log_config_response` | Identisch | OK; Gates greifen nicht auf audit_log | — |

### 1.5 Frontend (El Frontend — Vue 3 + WS)

| State/Feld | IST | SOLL | Drift-Risiko | Linear |
|---|---|---|---|---|
| **WebSocket-Envelope** | `websocket/manager.py:225–233` — `contract_mismatch` bei Envelope-Drift | Identisch + correlation_id-Weiterleitung aus HB/Config/WS | correlation_id wird im HB-Broadcast bereits gesetzt (`heartbeat_handler.py:559`), in Actuator-Response evtl. nicht durchgängig | **AUT-65** |
| **esp_health-Event** | `serialize_esp_health_event` + canonical flags (`heartbeat_handler.py:540–561`) | Plus drift-reasons (Drift-Katalog §5) | OK für Online/Offline; für „adoption_phase" fehlt UI-Flag | **AUT-63** (UI-Seite als Unterpunkt) |
| **Config-Timeout UX** | „Waiting for config..." Anzeige steuerseitig; kein deterministisches Timeout | 30-s-Timeout mit UI-Warnung + Retry-Option | Nutzerrückmeldung wartet unendlich bei Config-Push-Drop | **AUT-58** |

---

## 2. Cross-Layer-Transitions (Happy-Path vs. Drift-Path)

### 2.1 Happy Reconfigure (Server → ESP → DB → UI)

```
UI → REST /api/v1/sensors/{esp_id}/{gpio} POST
  → server.sensors.py → Service → DB pending
  → MQTTCommandBridge → Topic `kaiser/god/esp/{esp}/config` QoS 2 (retained)
  → FW config_handler → validate → NVS write → config_response QoS 2
  → server.config_handler → terminal_authority_guard → audit + WS broadcast
  → UI receives `config_response` + status
```

**Autoritäten:**
- Soll-State = DB (API schreibt zuerst)
- Ist-State = ESP (publiziert `config_response`)
- Konvergenz-Signal = `terminal_authority.is_final=True`

### 2.2 Happy Reconnect (Transport-Hiccup < 60 s)

```
FW: MQTT_DISCONNECTED → managed reconnect (IDF intern)
Broker: Session-Ende, Retained LWT liegt im Broker (wird NICHT publiziert, da MQTT disconnect kein gracefull disconnect mit reason>0 ist — abhängig von Client)
FW: reconnect < 60s → Server HB-Detection: is_reconnect=False (offline_seconds < 60)
Server: Early-ACK → config_available via `_has_pending_config` (Cooldown 120s gate)
Adoption: NICHT gestartet (Server detected kein reconnect)
Logic Engine: feuert sofort
```

**Drift-Risiko:** Threshold-Mismatch — Server-Seite wertet **Jitter** als stabile Session, ignoriert aber, dass FW kurze Reconnect-Loops hatte. Gate RECONNECT_THRESHOLD_SECONDS=60 vs. Heartbeat-Intervall (ca. 30 s) → Ereignis liegt gerade an der Schwelle. **Linear-Bindung: AUT-56.**

### 2.3 Drift-Reconnect (Stress-Loop wie 2026-04-17)

```
FW: MQTT_EVENT_ERROR errno=119 → DISCONNECTED → 3014
FW: managed reconnect attempt=3 bleibt über Zyklen (kein Reset auf 0)
FW: SafePublish failed after retry (Critical intents verloren?)
FW: Heartbeat degraded (gpio_status skip), free_heap ~42 kB
FW: Safety-P4: Grace 30s → OFFLINE_ACTIVE → GPIO 25 offline-rule
Broker: LWT emitted (reason=unexpected_disconnect) 
Server LWT: terminal_authority upsert; clear_cycle (Adoption); actuator_reset; status=offline
Server LogicEngine: is_online=False → suspend → backoff-cache
... später:
FW reconnect erfolgreich → 1. HB: offline_seconds > 60 → is_reconnect=True
Server: start_reconnect_cycle (adopting), Early-ACK status=online, handover_epoch++
FW: confirmRegistration(), pending-exit deferred
FW: Logic publishes HB, aber Config-Push pending (Cooldown evtl. noch aktiv)
Server: _has_pending_config → evtl. Config-Push → ESP writes → config_response
Server: invalidate_offline_backoff + _complete_adoption_and_trigger_reconnect_eval
Server LogicEngine: feuert (is_online=True, adoption=completed)
```

**Drifts in diesem Pfad (belegt):**
- **D1 (P0):** `attempt=3` persistiert — Counter-Reset erst bei **validem** Full-ACK-Contract fehlt (Live-Log-Beleg).
- **D2 (P0):** SafePublish-Drops ohne `intent_outcome/lifecycle=failed` Publish → UI sieht hängenden Intent.
- **D3 (P1):** `write_timeouts=0` trotz `errno=119` → Counter-Pfad unterschlägt Transport-Class (AUT-67).
- **D4 (P1):** Approval-NVS Callsite + ConfigManager-Guard — zwei Semantiken; aktueller Code schreibt bei `missing_persisted_ts` trotz `already_approved` (main.cpp 2307) — sinnvoll, aber nirgends in Invariant-Tests erfasst.
- **D5 (P2):** LWT `was_stale=True` erhöht Metrik, erzeugt aber **kein** WS-Drift-Event → UI bleibt uninformiert.

---

## 3. Single Source of Truth (SSOT) je State

| State | Primär-SSOT | Read-Only-Spiegel | Transition darf nur schreiben | Evidence |
|---|---|---|---|---|
| **Approval-Flag** | `configManager.isDeviceApproved()` (FW-NVS) | Server `esp_device.status in {approved, online}`; UI `esp_health.status` | FW-ACK-Callsite `setDeviceApproved(true, ts)` **nur** bei state_changed ODER refresh_due (APPROVAL_TS_PERSIST_INTERVAL_S) | main.cpp:2300–2324, config_manager.cpp:1291–1324 |
| **Online-Flag** | DB `esp_device.status='online'` (via HB-Handler) | WS `esp_health`; FW `g_mqtt_connected` | Nur HB-Handler + LWT-Handler | heartbeat_handler.py:422; lwt_handler.py:162 |
| **Reconnect-Cycle / Adoption** | `StateAdoptionService` (Server-Memory) | WS `reconnect_phase`; FW `offlineModeManager.onReconnect()` | `start_reconnect_cycle` (HB `is_reconnect=True`), `mark_adoption_completed` (nach logic_engine eval) | state_adoption_service.py; heartbeat_handler.py:315–326, 467–471 |
| **Handover-Epoch** | Server `_handover_epoch_by_esp[esp_id]` | FW `active_handover_epoch` in HB-Payload, `offlineModeManager.validateServerAckContract` | Server inkrementiert bei is_reconnect; FW validiert fail-closed | heartbeat_handler.py:123–155; main.cpp:2246–2266 |
| **Registration-Gate** | FW `registration_confirmed_` | Server-Log „Early ACK" | `mqttClient.confirmRegistration()` nach gültigem ACK-Contract | main.cpp:2269 |
| **Config-Cycle** | DB `sensor_config.config_status` + `actuator.config_status` | FW-NVS; WS `config_response` | Handler `_mark_config_applied/_process_config_failures` nach `canonical.is_final=True` | config_handler.py:220–238 |
| **Actuator-State** | FW `actuatorManager` (live GPIO) | DB `actuator.state` (via Response) | FW setzt autoritativ; Server reflektiert über Response + LWT-Reset | safety_task.cpp:79–95; actuators.py |
| **Offline/Safety-Mode** | FW `offlineModeManager` | WS `esp_health`; Server `esp_device.status='offline'` | FW-eigenständig nach Grace 30 s; Server reflektiert | safety_task.cpp:118–127 |
| **Readiness-Gate (Server)** | `RuntimeStateService.snapshot()` | WS `ready`-Flag (falls projiziert) | Worker-Health + `_degraded_reasons` | runtime_state_service.py:127–162 |
| **Terminal-Authority (Events)** | DB `command_contract` + `terminal_authority_key` | WS `contract_code`/`contract_reason`; FW **fehlt** | `upsert_terminal_event_authority` (LWT, config_response) | lwt_handler.py:136–160; config_handler.py:138–173 |

**Wichtigste SSOT-Regel für Drift-Vermeidung:**  
„Eine State-Feldänderung darf **genau** einen autoritativen Writer haben. Alle anderen Layer lesen und spiegeln — Schreibversuche ohne Autorität sind stille No-Ops oder Kontraktverstöße."

---

## 4. Drift-Katalog

Jede Drift: **Trigger** → **Beobachtetes Fehlverhalten** → **Betroffene Layer** → **Prio**.

### P0 — Safety-/Data-Integrity-Risiko

| ID | Trigger | Fehlverhalten | Layer | AUT |
|---|---|---|---|---|
| **D1** | Wiederholte MQTT-Transport-Timeouts (errno 119/11) | Reconnect-`attempt` bleibt hoch über Zyklen; kein Reset bei gültigem ACK | FW | **AUT-54** |
| **D2** | SafePublish Drop eines kritischen Intents während Reconnect-Burst | Kein `intent_outcome/lifecycle=failed` → Operator-UX hängt; Logic-Replay fehlt | FW, Server, FE | **AUT-55**, **AUT-60** |
| **D3** | `NOTIFY_MQTT_DISCONNECTED` ohne Offline-Regel | `setAllActuatorsToSafeState` ausgelöst — korrekt; ABER wenn Offline-Regel später aktiv wird, kein Re-Arm-Pfad | FW | **AUT-66** (größtenteils behoben) |
| **D11** | Emergency-Command vom Server mit uppercase `EMERGENCY_STOP` | FW akzeptiert nur lowercase `stop_all`/`emergency_stop` → 3016 Payload-Invalid | Server, FW | **AUT-64** |

### P1 — Operator-UX / Observability

| ID | Trigger | Fehlverhalten | Layer | AUT |
|---|---|---|---|---|
| **D4** | Write-Timeout aus IDF-MQTT | FW-Counter `write_timeouts=0`, `tls_timeouts` überstellt → falsche RC | FW | **AUT-67** (H5) |
| **D5** | `offline_seconds > 60` aber < `HEARTBEAT_TIMEOUT_SECONDS=300` | Adoption startet für Jitter, nicht für echten RC | Server | **AUT-56** |
| **D6** | HB-Degradation (low heap) | `payload_degraded=true`, aber Publish-Queue kennt kein Backpressure → weitere Pushs verschärfen OOM-Risiko | FW | **AUT-60**, **Gap G-NEW-01** |
| **D7** | Config-Push bei Reconnect kurz nach Config-Change | BUG-2-Fix nachgezogen (594), aber Cooldown ist nur im `device_metadata` JSON | Server | **AUT-57**, **AUT-65** |
| **D8** | `_build_ack_contract_context` mit preferred_epoch=None | Bei doppelt-kurzen HB kann steady-state-Session-ID benutzt werden, die ESP bereits verworfen hat | Server, FW | **AUT-56** |
| **D12** | HB `tls_handshake_latency_ms` wird observed, aber `write_timeout_ms` nicht | Grafana zeigt nur eine Seite des Transport-Defekts | Server | **AUT-67** |

### P2 — Pflege / Hygiene

| ID | Trigger | Fehlverhalten | Layer | AUT |
|---|---|---|---|---|
| **D9** | Server-Restart mitten im Adoption-Cycle | `StateAdoptionService` verliert Cycles → `is_adoption_completed(None)=True` → Logic Engine fires blind | Server | **Gap G-NEW-02** |
| **D10** | LWT Terminal-Authority-Guard greift (`was_stale=True`) | Metric, aber keine UI-Sichtbarkeit | Server, FE | **Gap G-NEW-03** |
| **D13** | `reset_reason` und `boot_sequence_id` im HB-Payload — Verwertung? | Felder werden gesetzt (mqtt_client.cpp 1280–1282), Server speichert in `initial_heartbeat`, aber keine UI-Projektion | Server, FE | **AUT-59** (als Unterpunkt) |

---

## 5. Maßnahmenplan — Dedupliziert und auf AUT-Issues abgebildet

### 5.1 Bestehende Issues präzisieren (keine neuen Tickets, nur Updates)

| AUT | Präzisierung (Zusatz zur aktuellen Beschreibung) | Drift-Bindung |
|---|---|---|
| **AUT-54** (Transport/Keepalive) | Ergänze Counter-Reset-Regel für `managed_reconnect_attempts_` bei `validateServerAckContract=True`. Add Acceptance: „attempt=0 innerhalb von 2 validen ACKs nach Reconnect". | D1 |
| **AUT-55** (Outbox / Intent-Outcome) | Explizit: Drop-Event muss `intent_outcome/lifecycle` `failed` mit `code=CRITICAL_DROP`, `reason=safe_publish_exhausted` emittieren; Topic-Pfad in AC. | D2 |
| **AUT-56** (Reconnect-Lifecycle / Handover-Epoch) | Sub-AC: (a) `RECONNECT_THRESHOLD_SECONDS` von 60 auf **tatsächlichen Wert dynamisch** = `2 × heartbeat_interval` setzen; (b) `_build_ack_contract_context` fail-closed, wenn `preferred_epoch` < stored. | D5, D8 |
| **AUT-57** (Config-Push-Cooldown DB-Persist) | Verschieben von `device_metadata.config_push_sent_at` in echte Tabellen-Spalte `esp_device.last_config_push_at` (Alembic-Migration). | D7 |
| **AUT-59** (Readiness-Gate / Runtime-State) | Sub-AC: Per-ESP-Readiness-Snapshot neben globalem Mode. Felder: `adoption_phase`, `last_ack_epoch`, `backoff_state`. Projektion via WS. | D9, D13 |
| **AUT-60** (Heartbeat-Degradation) | Backpressure-Signal: `payload_degraded=true` triggert PublishQueue-Drain-Pause (X ms) und Prioritäts-Skip für non-critical. | D6 |
| **AUT-61** (ACK-NVS Dedup) | Noch offen: **zwei** Guards (Callsite-Interval + ConfigManager-`ts_changed`) einheitlich dokumentieren; Invariant-Test: „keine NVS-Write solange state unverändert UND refresh_due=False". | D4-Flanke |
| **AUT-62** (Terminal-Authority / Contract-Roundtrip) | FW emittiert `correlation_id` und `generation` im LWT und Config-Response; Server-Guard prüft Round-Trip. | G-NEW-02-Flanke |
| **AUT-63** (Logic-Engine Online-Gate) | Neue Bedingung: `is_online AND adoption_completed AND readiness_ok` + per-esp-backoff-cache. | D3 Recovery |
| **AUT-64** (Emergency-Contract) | Dokumentiert: lowercase-Topic, uppercase-Payload-Translation im Server-Bridge; keine Endpunkt-Ausnahmen. Tests hinzufügen. | D11 |
| **AUT-65** (WS correlation_id End-to-End) | AC: REST → WS → MQTT → FW → Response → WS → UI durchgängig; Test-Fixture in `tests/websocket/test_correlation_roundtrip.py`. | D7 |
| **AUT-66** (Safety-P4 Uncovered vs. Covered) | Merge-ready laut Code (safety_task.cpp:79–95). Nur Regressionstests: Reconnect nach OFFLINE_ACTIVE → korrektes Re-Arm. | D3 |
| **AUT-67** (Counter-Konsistenz) | AC scharf: Jeder `errno=119` inkrementiert **genau einen** Counter (write_timeout) und optional `tls_timeout` nur wenn TLS-Pfad aktiv. Prometheus-Alert bei Delta > 0 in 5 min. | D4, D12 |
| **AUT-58** (Config-Timeout UX) | AC: Frontend-Side-Timeout 30 s mit Banner + Retry; Backend publisht `config_progress` WS-Events (heartbeat-schnell). | D6-Folge |

### 5.2 Dependency-Graph (blockedBy)

```
AUT-54 → AUT-67          (Transport-Fix vor Counter-Validierung)
AUT-55 → AUT-62          (Outbox-Lifecycle vor Contract-Roundtrip)
AUT-56 → AUT-63          (Reconnect-Cycle vor Logic-Gate)
AUT-57 → AUT-65          (Cooldown-Persist vor UI-Gating)
AUT-60 → Gap G-NEW-01    (Degradation vor Backpressure)
AUT-59 ← AUT-56 + AUT-63 (Readiness-Snapshot nach Lifecycle)
AUT-58 ← AUT-65          (UX-Timeout nach correlation_id)
AUT-64 ← (eigenständig, P0-Security)
AUT-66 ← (eigenständig, bereits Fix)
AUT-61 ← (eigenständig, Callsite-Dedup schon teilimplementiert)
```

### 5.3 Neue Gap-Tickets (Vorschlag, nur wenn TM-Go)

| Gap | Titel | Scope (1 Satz) | Parent | Prio |
|---|---|---|---|---|
| **G-NEW-01** | Publish-Queue-Backpressure aus HB-Degradation | `payload_degraded=true` pausiert non-critical Publishes X ms lang und skipt nicht-gated Intents; Counter dafür. | AUT-60 | P1 |
| **G-NEW-02** | StateAdoption Server-Restart-Recovery | Adoption-Cycles in DB-Tabelle persistieren (oder Timestamp-Marker in `esp_device.adoption_state`), Restart-Replay via HB-Next. | AUT-63 | P2 |
| **G-NEW-03** | WS-Drift-Event bei LWT stale terminal-authority | `contract_terminalization_blocked` wird als WS-Event `drift_observed` projiziert (UI-Banner). | AUT-62 | P2 |

**Regel (wie TM eingefordert):** Neue Tickets **nur** wenn AUT-54..AUT-67 den Scope nicht schon abdecken. G-NEW-01/02/03 sind die einzigen Lücken, die nicht durch Präzisierung bestehender Issues geschlossen werden.

---

## 6. Verifikationsplan — Reproduzierbarer Stresstest + Konvergenz-Gates

### 6.1 Hardware-Szenarien

| S# | Szenario | Dauer | Erwartung |
|---|---|---|---|
| **S1** | Reconfigure (Sensor Add/Remove) in rascher Folge, 10× in 5 min, stabile Netzbedingungen | 5 min | Jede Config ein `config_response` final, keine Cooldown-Skips, DB `config_status='applied'` |
| **S2** | WLAN-Drop (AP Reboot) während Stresstest | 2× Drop à 10–90 s | Reconnect ≤ 30 s nach AP-Recovery; Adoption-Phase ≤ 5 s; Logic-Engine pausiert während Phase |
| **S3** | Broker-Restart (docker compose restart mqtt-broker) | 2× | Server LWT, Early-ACK-Rebuild, Handover-Epoch++ bei echtem Reconnect |
| **S4** | Burst Kalibrier-Messung (`POST …/measure` 30×/60 s) während laufendem Betrieb | 10 min | Keine Transport-Timeouts, Backpressure aktiv falls heap < Schwelle |
| **S5** | 4 h-Soak mit S1+S4 kontinuierlich | 4 h | Kein Counter-Drift (`write_timeouts` und `tls_timeouts` plausibel), keine Heap-Leckage, keine terminalization_blocked |

### 6.2 Konvergenz-Gates je Reconnect/Reconfigure-Zyklus

Pro Zyklus muss **gleichzeitig** gelten (P(fail)=0 auf allen Gates = „Converged"):

```
G1 FW:   registration_confirmed_ = True UND validateServerAckContract = True
G2 FW:   offlineModeManager.getMode() in {ONLINE}
G3 FW:   managed_reconnect_attempts_ = 0 (nach 2 validen ACKs)
G4 FW:   payload_degraded = False ODER Backpressure aktiv
G5 SRV:  _handover_epoch_by_esp[esp_id] == FW.active_handover_epoch
G6 SRV:  state_adoption.is_adoption_completed(esp_id) = True
G7 SRV:  esp_device.status = 'online' (DB)
G8 SRV:  terminal_authority: letztes Event für esp_id hat is_final=True
G9 SRV:  logic_engine.offline_backoff[esp_id] = None
G10 UI:  esp_health WS zeigt status=online und adoption_phase=idle
G11 UI:  kein config_timeout-Banner
G12 DB:  command_contract ohne „stale" Events für aktuellen Zyklus
```

**Zeitbudget bis Converged:**
- Transport-Hiccup (S2 < 60 s): **≤ 15 s**
- Echter Reconnect (S2 > 60 s, S3): **≤ 45 s**
- Reconfigure (S1): **≤ 10 s je Change**

### 6.3 Metriken / Alerts als Gate

| Metrik | Gate-Bedingung |
|---|---|
| `mqtt_contract_terminalization_blocked_total{reason="terminal_authority_guard"}` | **0** über Zyklus |
| `esp_write_timeouts_total - esp_tls_timeouts_total` | **konsistent** (Delta erklärt) |
| `connect_attempts_total` | monoton, aber „attempt_peak per cycle ≤ 5" |
| `heartbeat_contract_reject_total` | **0** |
| `heartbeat_degraded_count` | bleibt < 3 pro Minute (sonst Backpressure aktivieren) |
| `ready_blocked_total` | flat nach Cycle-Ende |

### 6.4 Log-Gates (Serial + Server)

- FW-Log MUSS enthalten: `Early ACK` folgender HB sichtbar, **kein** wiederholtes `Device approval saved` bei stabilem Approval (dedup greift).
- Server-Log MUSS enthalten: `State adoption started` → `State adoption completed` **pro echtem Reconnect**, **nicht** bei Jitter.
- Broker-Log: `exceeded timeout` nur bei echtem Transport-Verlust; kein Retained-LWT-Replay für rekonnektiert Gerät.

### 6.5 Testausführung — Skizze (keine Implementierung hier)

```
1) pio run -e esp32_dev               # Build
2) flash + monitor COM4 → Log-Capture in El Trabajante/logs/soak-<ts>.log
3) docker compose up -d               # Server + MQTT + Alloy
4) Test-Harness `tests/e2e/stress_state_drift.py`:
   - orchestriert S1..S4 über REST
   - parsed Serial-Log (tail), WS-Events, Prometheus
   - fail-Gate bei Gate-Verstößen
5) nach Soak: Report unter
   .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/
   SOAK-REPORT-<ts>.md
```

---

## 7. Akzeptanzkriterien (gegen Auftrag §"Akzeptanz")

| # | Kriterium | Belegstelle |
|---|---|---|
| **A1** | Keine Maßnahme ohne Linear-Zuordnung | §5.1 (jede Drift → AUT-ID); §5.3 (Gaps als neue Tickets erst nach TM-Go) |
| **A2** | Kein offener Widerspruch Firmware ↔ Server ↔ DB | §3 SSOT definiert eindeutigen Writer; §1 IST/SOLL nennt Driftpunkte, §4 bindet sie an Tickets |
| **A3** | Definierter „Converged"-End-State je Zyklus | §6.2 G1–G12 + §6.3 Metrik-Gates |
| **A4** | Klare Priorisierung nach Risiko | §4 P0/P1/P2-Spalten; §5.2 Dependency-Graph |

---

## 8. Handlungsempfehlung (TM-Entscheidung)

**Go-Entscheidung jetzt möglich für:**

1. **AUT-54 + AUT-67** zusammen als „Transport + Counter-Konsistenz" Block (Branch `auto-debugger/work`).
2. **AUT-61** schließen, wenn Invariant-Test + Dokumentation der doppelten Guards steht (Code schon teilweise da).
3. **AUT-64** als eigenständiger P0-Fix (Emergency-Payload-Kontrakt) unabhängig vom Transport-Block.

**Warten auf Evidence (BLOCKER — siehe CORRELATION-MAP §4):**

- **B-NET-01** (Broker + Router-Log gleicher UTC-Schnitt) für H1-Validierung.
- **B-TLS-URI-01** (Feldgerät Produktions-URI Klasse/Port) für Transport-Pfad-Klassifikation.
- **B-ERRTRAK-01** (3014-Export vollständig) für Counter-Validierung AUT-67.

**Neue Tickets (G-NEW-01..03) erst nach TM-Go** eröffnen — aktuell als Vorschlag dokumentiert.

---

## 9. Artefakt-Referenzen

- Lagebild: `./INCIDENT-LAGEBILD.md`
- Korrelation: `./CORRELATION-MAP.md`
- Pakete: `./TASK-PACKAGES.md`
- Forensik: `./RUN-FORENSIK-REPORT-2026-04-17.md`
- Verify-Plan: `./VERIFY-PLAN-REPORT.md`, `./VERIFY-PLAN-REPORT-2026-04-17-issues.md`
- Sprint: `./SPRINT-PLAN-2026-04-17.md`
- Spezialisten-Prompts: `./SPECIALIST-PROMPTS.md`
- Firmware-Evidence:
  - `El Trabajante/src/services/communication/mqtt_client.cpp` (200–320 Connect, 1159–1188 Status, 1236–1348 Heartbeat)
  - `El Trabajante/src/main.cpp` (2200–2370 HB-ACK + Approval-Callsite)
  - `El Trabajante/src/tasks/safety_task.cpp` (61–95 NOTIFY-Handler, 117–127 Offline-P4)
- Server-Evidence:
  - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (123–155 ACK-Context, 302–326 Reconnect-Detection, 328–351 Early-ACK, 502–515 Savepoint, 540–567 WS-Broadcast)
  - `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` (72–173 Canonical + Authority-Guard, 220–238 DB-Status)
  - `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` (58–298 End-to-End)
  - `El Servador/god_kaiser_server/src/services/state_adoption_service.py` (45–141 State-Machine)
  - `El Servador/god_kaiser_server/src/services/runtime_state_service.py` (40–172 Runtime-State)

---

*Erstellt: 2026-04-17 · Branch: `auto-debugger/work` · Folge-Schritt: SPECIALIST-PROMPTS durchziehen, Soak-Harness S5 implementieren, G-NEW-01..03 eröffnen nach TM-Go.*
