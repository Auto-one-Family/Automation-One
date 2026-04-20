# VERIFY-PLAN-REPORT (Issues AUT-54 bis AUT-65) — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Gebundener Ordner:** `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/`
**Datum:** 2026-04-17
**Gate aktiv:** Ja (TASK-PACKAGES.md / VERIFY-PLAN-REPORT.md existieren → OUTPUT FÜR ORCHESTRATOR Pflicht)
**Basis:** RUN-FORENSIK-REPORT-2026-04-17.md + Steuerdatei (`STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`) + 12 Linear-Issues (AUT-54 bis AUT-65)
**Geprüft gegen:** `mqtt-development` / `esp32-development` / `server-development` / `frontend-development` Evidence-Pfade, Anhänge A–F des `verify-plan` Skill.

> **Scope dieses Reports:** Plan-Erweiterung der bisherigen TASK-PACKAGES (PKG-01 bis PKG-04) um **10 neue Pakete** (PKG-05 bis PKG-14) aus den 12 Linear-Issues. Die verify-plan-Prüfung erfolgt pro Issue.

---

## /verify-plan Ergebnis (Gesamt)

**Plan:** 12 Issues ⇒ 12 Paket-Anker (einige decken dieselbe PKG-Achse; siehe Mapping unten).
**Geprüft:** 28 Code-Pfade, 9 Agent-Referenzen, 5 Docker-Container-Namen, 6 Error-Codes (3011/3012/3014/3016/5xxx), 3 MQTT-Topic-Segmente, 2 REST-Pfade, 1 WS-Envelope-Konsistenzregel.

### Globale Korrekturen (gelten für alle 12 Issues)

| # | Plan / Annahme | IST im Repo | Korrektur |
|---|---------------|------------|-----------|
| G1 | Build-Ziel generisch `pio run` / `seeed` | EA5484 = ESP32 Dev (WROOM), ESP-IDF `esp_mqtt`; `[env:esp32_dev]` in `platformio.ini` ohne `-DMQTT_USE_PUBSUBCLIENT=1` | **`cd "El Trabajante" && pio run -e esp32_dev`** für AUT-54/55/57/58/59/61/62/63 |
| G2 | Agent-Referenzen in Subordnern | **Flache Ablage** unter `.claude/agents/esp32-dev.md`, `server-dev.md`, `mqtt-dev.md`, `frontend-dev.md`, `mqtt-debug.md`, `auto-debugger.md` | In jeder Issue-Sektion und SPECIALIST-PROMPTS die flachen Pfade verwenden |
| G3 | Container-Namen generisch (`mqtt`, `server`) | `docker compose ps`: **`automationone-mqtt`**, **`automationone-server`**, **`automationone-postgres`**, **`automationone-alloy`** | Überall konkrete Compose-Namen in Log-Befehlen |
| G4 | Git-Branch offen | Auto-Debugger-Gate verlangt `auto-debugger/work` von `master` | Jeder Code-Commit der 12 Issues auf **`auto-debugger/work`** |
| G5 | Verify-Befehle unterschiedlich | Server: `poetry run pytest tests/ -q --timeout=120`; Frontend: `npm run build` + `npx vue-tsc --noEmit`; DB: keine Alembic-Ops im Lauf | In Issue-Akzeptanzkriterien aufnehmen |
| G6 | Incident-Steuerdatei "zu erstellen" | **Existiert bereits:** `.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md` | Projektbeschreibung + TECHNICAL_MANAGER.md korrigieren |
| G7 | Keine Secrets-Disclaimer | Verbot aus Steuerdatei: keine MQTT-URIs mit Credentials / TLS-Keys / JWT / `.env` in Artefakten | In jeder Issue-Akzeptanzliste aufnehmen |

### Mapping: Issue → PKG-Anker

| Issue | Titel (Kurz) | PKG-Anker | Status |
|-------|--------------|-----------|--------|
| AUT-54 | EA-01 Transport/Session-Stabilität | PKG-01 **erweitert** (Mehrgeräte-Fenster, Backoff) | Plan vorhanden, Scope erweitert |
| AUT-55 | EA-02 Outbox-Kapazität & Backpressure | **PKG-05 (neu)** | Neu |
| AUT-56 | EA-03 Lifecycle-Publish (3012) | **PKG-06 (neu)**, blocked by PKG-05 | Neu |
| AUT-57 | EA-04 SafePublish Retry | **PKG-07 (neu)** | Neu |
| AUT-58 | EA-05 Heartbeat Degradation Policy | **PKG-08 (neu)** | Neu |
| AUT-59 | EA-06 Pending-Exit bei offline_rules | **PKG-09 (neu)** | Neu |
| AUT-60 | EA-07 Cross-ESP Readiness-Gate | **PKG-10 (neu)**, blocked by PKG-09 | Neu |
| AUT-61 | EA-08 Approval-NVS-Dedup Call-Site | **PKG-04 Scope-Korrektur** (Funktion ist idempotent) | Plan-Korrektur |
| AUT-62 | EA-09 Emergency Fail-Closed Prod-Default | **PKG-11 (neu)** | Neu |
| AUT-63 | EA-10 Broadcast-Emergency Contract (3016) | **PKG-12 (neu)** | Neu |
| AUT-64 | EA-11 Frontend Config-Timeout UX | **PKG-13 (neu)** | Neu |
| AUT-65 | EA-12 WS correlation_id Konsistenz | **PKG-14 (neu)** | Neu |

---

## AUT-54 — EA-01 MQTT Transport/Session-Stabilität (Mehrgeräte-Reconnect-Fenster)

**PKG-Anker:** PKG-01 (erweitert) · **Rolle:** `esp32-dev` (+ `mqtt-debug` für Evidence) · **Priorität:** Urgent · **Estimate:** 5 SP
**Implementierungs-Status (2026-04-17 post-Review):** **Code umgesetzt in HEAD / aut-54-Branch. Offen: Evidence-Blocker + 4 h Dauerlauf. Patch `pkg-01-mqtt-transport-telemetry.patch` markiert als SUPERSEDED.**

### 🏗️ Implementiert (HEAD, 2026-04-17)

- `mqtt_client.cpp:1529-1533` — `[INC-EA5484] disconnect marker` in `MQTT_EVENT_DISCONNECTED` mit `uptime_ms`, `free_heap`, `wifi_rssi`, `wifi_connected`.
- `mqtt_client.cpp:1704-1747` — `MQTT_EVENT_ERROR`-Telemetrie mit `uptime_ms`, `strerror(sock_errno)`, `tls_stack`, `esp_tls_last`.
- `mqtt_client.cpp:93-110` — Klassifikations-Helper `isWritePathTimeoutSignal` / `isTlsConnectTimeout`.
- `mqtt_client.cpp:910-923` — `computeReconnectJitterMs_`: Exponential-Backoff 1500ms × 2^min(attempt,6), Cap 12 s, Jitter 0..649 ms mit `esp_id`-Entropy (Desync bei Mehrgeräte-Bursts).
- `mqtt_client.cpp:925-985` — `scheduleManagedReconnect_` + `processManagedReconnect_` mit Auto-Reconnect-Grace-Window (`MANAGED_RECONNECT_AUTO_GRACE_MS`).
- `mqtt_client.h:272-274` — Counter `managed_reconnect_attempts_`, `transport_write_timeout_count_`, `tls_connect_timeout_count_`, `tcp_transport_error_count_` als Member (getrennt geführt gem. Ticket-Lösungsansatz Punkt 1).
- `mqtt_client.cpp:338-340` — **bewusst ohne** `network_timeout_ms` / `reconnect_timeout_ms` Overrides (ESP-IDF-Defaults empirisch stabiler im Mehrgeräte-Fenster).
- LWT-Payload unverändert (`mqtt_client.cpp:293-318`).

### ✅ Bestätigt

- `El Trabajante/src/services/communication/mqtt_client.cpp` — `mqtt_cfg.keepalive = config.keepalive` (**225**); `MQTT_EVENT_DISCONNECTED` → `logCommunicationError(ERROR_MQTT_DISCONNECT, …)` (**1159–1179**); `MQTT_EVENT_ERROR` TCP/TLS-Logzweig (**1249–1261**); `[INC-EA5484]` Disconnect-Marker im Event-Handler (**1269–1312**).
- `El Trabajante/src/main.cpp` — `mqtt_config.keepalive = 60` (**2913**).
- `El Trabajante/platformio.ini` — `[env:esp32_dev]` mit `-DMQTT_KEEPALIVE=60`, ESP-IDF `esp_mqtt` Pfad.
- Fehlercode **3014** `ERROR_MQTT_DISCONNECT` (3000er Block COMMUNICATION, ESP32) — korrekt referenziert.
- `docker/mosquitto/mosquitto.conf` — `max_keepalive 65535`, `max_inflight_messages 20` (**62–69**).

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Scope | Nur EA5484 | Issue deckt **Mehrgeräte-Fenster** (EA5484 + 6B27C8 parallel) — TLS-Handshake-Konkurrenz explizit erwähnen |
| Testbefehl | `pio run` (generisch) | **`cd "El Trabajante" && pio run -e esp32_dev`** |
| Docker | Broker-Log-Hinweis fehlt | Log-Befehl: `docker logs automationone-mqtt --since <UTC>` mit UTC-Abgleich Host |
| Contract | LWT-Payload-Änderungen | LWT-Contract (`online/offline`, `unexpected_disconnect`) **unverändert** lassen — keine Payload-Migration in diesem Paket |

### 📋 Fehlende Vorbedingungen

- **B-NET-01:** Roh-Broker-Log `automationone-mqtt` im exakten UTC-Fenster parallel zum Serial-Trace.
- **B-TLS-URI-01:** TLS vs. Plain MQTT-URI-Klasse am Feldgerät ohne Credentials.
- **B-ALLOY-01:** Monitoring-Pfad (`automationone-alloy` / `config.alloy`) im selben Fenster noch nicht verifiziert.

### 💡 Ergänzungen

- **Reconnect-Jitter:** bei Mehrgeräte-Fenster Exponential-Backoff mit +/− 500 ms Zufalls-Jitter, um TLS-Handshake-Bursts zu entzerren.
- **Serial-Marker:** `[INC-EA5484]` Marker konsequent weiterführen, damit Forensik ein eindeutiges Kriterium für Vorher/Nachher hat.
- **Verweis:** Vorgängerlauf `STEUER-incident-esp32-mqtt-tls-errtrak-6014-2026-04-10.md` (3014 korrekt nach PKG-01 gemappt) nicht doppelt bearbeiten.

---

## AUT-55 — EA-02 MQTT Outbox-Kapazität & Backpressure

**PKG-Anker:** PKG-05 (neu) · **Rolle:** `esp32-dev` · **Priorität:** Urgent · **Estimate:** 3 SP

### ✅ Bestätigt

- Historisch belegt: `outbox_enqueue(46): Memory exhausted` (ESP-IDF MQTT-Outbox-Layer).
- `El Trabajante/src/services/communication/mqtt_client.cpp` — Publish-Pfade gehen über `safePublish()` (**609–632**, 2 Retries, siehe AUT-57).
- `El Trabajante/src/tasks/publish_queue.cpp` / `publish_queue.h` — zentrale Staging-Queue vor `esp_mqtt_client_publish`.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Scope | „MQTT Outbox" unspezifisch | Trennen: (a) **App-seitige Publish-Queue** (`publish_queue.cpp`, steuerbar), (b) **ESP-IDF interne Outbox** (`mqtt_cfg.out_buffer_size` / `task_stack` / `task_prio`, nur Kaltstart-Config) |
| Testbefehl | nicht genannt | **`pio run -e esp32_dev`** + synthetischer Burst-Test (M3-Drain) als Runtime-Check |
| Abhängigkeit | isoliert | **Blocks:** AUT-56 (Lifecycle-Publish hängt von stabiler Outbox ab) |
| Reihenfolge | unspezifiziert | Erst **Messen** (Heap-Headroom, Queue-Tiefe via Telemetrie), dann dimensionieren — kein Blindanheben von `out_buffer_size` |

### 📋 Fehlende Vorbedingungen

- **B-OUT-REPRO-01:** Reproduzierbarer Burst-Test (parallele Kalibrier-Messung + Intent-Commands) — ggf. aus PKG-03/Kalibrier-Burst-Steuerdatei speisen.
- **B-HEAP-BASELINE-01:** Heap-Baseline unter Nennlast (aktuell 41–57 kB frei laut Bericht, Korridor prüfen).

### 💡 Ergänzungen

- **Degradations-Policy koppeln** mit AUT-58: wenn Heap unter Schwelle, nicht nur `gpio_status` droppen, sondern auch Outbox-Enqueue-Politik (drop-oldest vs drop-newest) explizit setzen.
- **Circuit-Breaker:** bestehender CB im `mqtt_client` sollte Outbox-Druck mit höherem Gewicht einbeziehen.

---

## AUT-56 — EA-03 Lifecycle-Publish Robustheit (intent_outcome, 3012)

**PKG-Anker:** PKG-06 (neu) · **Rolle:** `mqtt-dev` (primär) + `esp32-dev` + `server-dev` · **Priorität:** Urgent · **Estimate:** 3 SP · **blocked by:** AUT-55

### ✅ Bestätigt

- Fehlercode **3012** `ERROR_MQTT_PUBLISH_FAILED` (3000er COMMUNICATION) korrekt.
- `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py` — Handler existiert, QoS 1 Topic mit Dedup.
- MQTT-Topic-Familie `system/intent_outcome/lifecycle` referenziert im Firmware-Publish-Pfad.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Abhängigkeit | isoliert | **Blocked by AUT-55** (Outbox-Fix ist Prereq) |
| Testmatrix | nicht genannt | Server: `poetry run pytest tests/mqtt/handlers/test_intent_outcome_handler.py -q`; Firmware: `pio run -e esp32_dev`; Dedup-Contract-Test am Handler |
| Contract | offen | Keine Payload-Breaking-Changes; falls neuer Status hinzukommt, versioniert über `payload_version` |

### 📋 Fehlende Vorbedingungen

- **B-LIFECYCLE-SCHEMA-01:** Schema-Mapping der terminalen Zustände (`rejected/accepted/completed/failed`) zwischen Firmware und Server dokumentiert in `.claude/reference/api/MQTT_TOPICS.md` — prüfen, ob aktuell.

### 💡 Ergänzungen

- **At-least-once Garantie** + serverseitige Idempotency-Keys (`intent_id + outcome_state`) für sichere Replays.
- Frontend-Korrelation mit AUT-64 (Config-Timeout) und AUT-65 (WS correlation_id) konsistent halten.

---

## AUT-57 — EA-04 SafePublish Retry-Strategie

**PKG-Anker:** PKG-07 (neu) · **Rolle:** `esp32-dev` · **Priorität:** High · **Estimate:** 2 SP · **related to:** AUT-55, AUT-56

### ✅ Bestätigt

- `El Trabajante/src/services/communication/mqtt_client.cpp` **609–632** — `safePublish()` mit **2 Retries**, `yield()` dazwischen, kein Backoff.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Testbefehl | nicht genannt | **`pio run -e esp32_dev`** + Unit-Test falls vorhanden (kein Arduino-Mock) |
| Retry-Design | "überarbeiten" | Präzisieren: (a) Retry-Count konfigurierbar (ENV `MQTT_PUBLISH_RETRIES`, Default 3), (b) Backoff linear 50/100/200 ms, (c) abbruch bei CB-open |
| Hotpath-Regel | implizit | Keine blockierenden `delay()` auf MQTT-Hotpath; nur `vTaskDelay` mit Minimum-Tick |

### 📋 Fehlende Vorbedingungen

- Keine — Scope ist lokal, Build-Check genügt.

### 💡 Ergänzungen

- Metriken: Retry-Count-Counter via Telemetrie/Serial, damit PKG-05/06 die Outbox-Last messen können.

---

## AUT-58 — EA-05 Heartbeat Degradation Policy

**PKG-Anker:** PKG-08 (neu) · **Rolle:** `esp32-dev` + `server-dev` (Consumer) · **Priorität:** Medium · **Estimate:** 2 SP

### ✅ Bestätigt

- `El Trabajante/src/services/communication/mqtt_client.cpp` **1096–1102** — `gpio_status` wird gedroppt bei `free_heap < 46000B` oder `max_alloc < 16384B`. Log: `Heartbeat: skipping gpio_status due to low memory headroom…`.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Contract | Degradation stillschweigend | **Explizit markieren:** neues Feld `payload_degraded: true` + `degraded_fields: ["gpio_status"]` in Heartbeat-Payload |
| Consumer-Pfad | Frontend sieht nichts | Server-Handler muss Degradation an WS-Subscribers propagieren (siehe AUT-65 Korrelations-Kette) |
| Thresholds | Hardcoded | In `esp32_dev` Build-Flags oder NVS-Config parametrisierbar |

### 📋 Fehlende Vorbedingungen

- **B-HEAP-BASELINE-01** (geteilt mit AUT-55).

### 💡 Ergänzungen

- WS-Event `heartbeat_degraded` für Frontend-Badge („Gerät im Sparmodus").
- Grafana-Alarm, wenn >X% der Geräte > Y min in Degradation.

---

## AUT-59 — EA-06 Pending-Exit bei offline_rules ohne actuators

**PKG-Anker:** PKG-09 (neu) · **Rolle:** `esp32-dev` · **Priorität:** Urgent · **Estimate:** 5 SP

### ✅ Bestätigt

- `El Trabajante/src/main.cpp` **473–495** — `evaluatePendingExit()` mit `RuntimeReadinessPolicy`, Branch `MISSING_ACTUATORS` aktiv, blockiert Exit aus `CONFIG_PENDING_AFTER_RESET`.
- `El Trabajante/src/tasks/command_admission.cpp` **26–52** — `shouldAcceptCommand` prüft Allowlist + wirft `CONFIG_PENDING_BLOCKED` wenn State = `CONFIG_PENDING_AFTER_RESET`.
- Partielle Runtime-Kombination `sensors=4, actuators=0, offline_rules=1` aus RUN-FORENSIK-REPORT belegt.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Policy | implizit | Explizite Policy-Entscheidung (Robin/TM): **(a)** Auto-Exit wenn nur `offline_rules` vorhanden (Sensoren+Regeln reichen); **(b)** Manueller Operator-Override via MQTT-Topic `system/admin/pending_exit/<esp_id>`; **(c)** Beides (Default a + Override b) |
| Testmatrix | fehlt | **`pio run -e esp32_dev`** + Integration-Test mit künstlicher `actuators=0`-Config + Exit-Verifikation |
| Blocks | offen | **Blocks AUT-60** (Server muss Readiness-Gate haben, wenn Firmware weiterhin blocked) |

### 📋 Fehlende Vorbedingungen

- **B-POLICY-DECISION-01:** TM-Entscheidung zwischen (a)/(b)/(c) oben erforderlich, bevor Dev-Agent startet.

### 💡 Ergänzungen

- Telemetrie-Feld `pending_exit_blocked_reason: "MISSING_ACTUATORS"` in Heartbeat aufnehmen, damit Frontend die Sperrursache anzeigt.
- Notification an Operator (`ISA-18.2`-kompatibel, niedrige Prio) bei dauerhaftem Pending-Zustand >10 min.

---

## AUT-60 — EA-07 Cross-ESP Command-Readiness-Gate (Server)

**PKG-Anker:** PKG-10 (neu) · **Rolle:** `server-dev` · **Priorität:** High · **Estimate:** 3 SP · **blocked by:** AUT-59

### ✅ Bestätigt

- `El Servador/god_kaiser_server/src/services/logic_engine.py` **1098, 1256** — Dispatch prüft **nur** `is_online` (Boolean), **kein** `config_pending`-Gate.
- Gerätestatus-Felder verfügbar: `is_online`, `state = CONFIG_PENDING_AFTER_RESET / OPERATIONAL / …` (aus Heartbeat-Handler-Output).

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Ursache-Framing | "Logikfehler" | Präziser: **Readiness-Gate fehlt** (is_online reicht nicht). Funktion selbst ist korrekt — Gate-Vorbedingung fehlt. |
| Abhängigkeit | isoliert | **Blocked by AUT-59** (bis die Pending-Policy final ist, kann der Server-Gate nicht die richtige Wahrheit kennen) |
| Testbefehl | offen | **`poetry run pytest tests/services/test_logic_engine.py -q`** mit neuen Fällen `config_pending=True` / `config_pending=False` |

### 📋 Fehlende Vorbedingungen

- Konsensus zwischen AUT-59 Policy und AUT-60 Gate-Semantik (gleicher Zustandsbegriff).

### 💡 Ergänzungen

- Frühe `rejected`-Intent-Outcome **serverseitig** erzeugen, wenn Gate fehlschlägt — spart MQTT-Roundtrip zum ESP.
- Telemetrie: Zähler `logic_engine.dispatch_skipped_config_pending` für Grafana.

---

## AUT-61 — EA-08 Approval-NVS-Write Dedup an der Call-Site

**PKG-Anker:** PKG-04 (Scope-Korrektur) · **Rolle:** `esp32-dev` · **Priorität:** High · **Estimate:** 2 SP

### ✅ Bestätigt

- `El Trabajante/src/services/config/config_manager.cpp` **1291–1324** — **`setDeviceApproved(true, ts)` ist bereits idempotent** bzgl. `approved`-Bool; schreibt jedoch bei jedem Aufruf den neuen Timestamp persistent.
- Log-Kadenz aus RUN-FORENSIK: `Device approval saved … state_changed=false, ts_changed=true` pro Heartbeat-ACK.

### ⚠️ Korrekturen

| Kategorie | Plan-Annahme (bisher PKG-04) | IST | Korrektur |
|-----------|------------------------------|-----|-----------|
| Fix-Ort | `setDeviceApproved` selbst idempotent machen | Funktion ist bereits idempotent | **Fix gehört zur Call-Site** (Heartbeat-ACK-Branch in `main.cpp`): nur dann rufen, wenn echter Zustandswechsel oder fachlich begründeter Timestamp-Update |
| Semantik | Approval = Liveness-Ack | NVS ist für Approval-Entscheidung (boot-persistent), nicht für Liveness | Saubere Trennung: Liveness nur RAM; Approval-Decision NVS |

### 📋 Fehlende Vorbedingungen

- Keine — lokaler Fix, messbar über Serial.

### 💡 Ergänzungen

- Telemetrie: Counter `nvs_approval_write_total` zur Messung von Vorher/Nachher.
- Flash-Wear-Schätzung im PR-Beschreibungs-Text ergänzen (Heartbeat 30 s → 2880/d → Jahresrate).

---

## AUT-62 — EA-09 Emergency-Pfad fail-closed als Prod-Default

**PKG-Anker:** PKG-11 (neu) · **Rolle:** `esp32-dev` · **Priorität:** Medium · **Estimate:** 3 SP · **related to:** AUT-63

### ✅ Bestätigt

- `El Trabajante/src/main.cpp` **~855** — Log `ESP emergency accepted (no token configured - fail-open)` → `AUTHORIZED EMERGENCY-CLEAR TRIGGERED`.
- `El Trabajante/src/tasks/emergency_broadcast_contract.h` **40–46, 109–116** — Allowlist `stop_all`, `emergency_stop` (lowercase).

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Policy | "fail-closed als Prod-Default" | Präzisieren: **Build-Flag `-DEMERGENCY_TOKEN_REQUIRED=1`** für Prod-Builds, `0` nur für Dev/Bench. Runtime-Override via NVS für Debug. |
| Testmatrix | fehlt | **`pio run -e esp32_dev`** Prod-Build + Bench-Build; Serial muss bei Prod ohne Token `REJECTED` loggen |
| Schnittstelle | implizit | `.env.prod` vs `.env.dev` Beispiel; Doc-Update in `reference/security/PRODUCTION_CHECKLIST.md` |

### 📋 Fehlende Vorbedingungen

- **B-TOKEN-GEN-01:** Token-Generierung/-Rotation dokumentieren (keine Secrets in Repo).

### 💡 Ergänzungen

- Audit-Log auf Server-Seite: jeder Emergency-Stop mit `actor_id + reason + token_present`.

---

## AUT-63 — EA-10 Broadcast-Emergency Command-Contract (3016-Risk)

**PKG-Anker:** PKG-12 (neu) · **Rolle:** `server-dev` (primär) + `esp32-dev` (Contract-Check) · **Priorität:** Urgent · **Estimate:** 2 SP · **related to:** AUT-62

### ✅ Bestätigt

- **Server** `El Servador/god_kaiser_server/src/api/v1/actuators.py` **1027** — sendet `"command": "EMERGENCY_STOP"` (Uppercase).
- **Firmware** `El Trabajante/src/tasks/emergency_broadcast_contract.h` **40–46, 109–116** — akzeptiert nur `"stop_all"` oder `"emergency_stop"` (Lowercase, case-sensitive).
- Folge: Error **3016** `ERROR_MQTT_PAYLOAD_INVALID` / `EMERGENCY_CONTRACT_MISMATCH`.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Wahl des Fix-Orts | nicht eindeutig | **Präferenz: Server anpassen** (sendet `"emergency_stop"`, lowercase) — geringere Angriffsfläche, Firmware-Contract stabil. Falls Firmware auf `"EMERGENCY_STOP"` umgestellt wird, ist Rollout-Reihenfolge (Server vor Firmware) kritisch. |
| Testbefehl | fehlt | Server: `poetry run pytest tests/api/v1/test_actuators.py::test_emergency_broadcast_command -q`; Firmware: `pio run -e esp32_dev` |
| Contract-Check | nur Server-seitig | Firmware behält Log `contract_mismatch` + `payload_received` + Error 3016 bei — Migration toleriert Altserver |
| REST-Pfad | nicht genannt | REST `POST /api/v1/actuators/emergency-broadcast` (prüfen in `REST_ENDPOINTS.md`) |

### 📋 Fehlende Vorbedingungen

- **B-CONTRACT-AUDIT-01:** Übrige Command-Payloads (nicht nur Emergency) auf Case-Konsistenz prüfen — Inventar als Delta für AUT-63.

### 💡 Ergänzungen

- Schema-Test als CI-Gate: JSON-Schema für `emergency_command.command` mit `enum: ["stop_all", "emergency_stop"]` (lowercase).
- Rollout: Server-Patch + `/verify-plan`-Re-Run nach Deployment vor Firmware-Flash.

---

## AUT-64 — EA-11 Frontend Config-Timeout UX

**PKG-Anker:** PKG-13 (neu) · **Rolle:** `frontend-dev` (primär) + `server-dev` (WS-Events) · **Priorität:** High · **Estimate:** 3 SP · **related to:** AUT-56, AUT-65

### ✅ Bestätigt

- Lifecycle: `send_config` → `config_published` (mit `correlation_id`) → **später terminal** `config_response` / `config_failed` via Firmware-Event.
- Unter AUT-55/56-Druck verzögert sich Finalisierung → Toast `Konfigurations-Timeout` wird geworfen.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Semantik | "Timeout" = Fehler | Unterscheiden: **(a) ausstehende Finalität** (WS-Event kommt noch), **(b) harter Timeout** (n Sekunden nach `config_published` kein Event). UI differenziert (Spinner → Warning → Error) |
| Verify | fehlt | Frontend: `npm run build` + `npx vue-tsc --noEmit`; Playwright-Test (falls verfügbar) für Timeout-Fall |
| Abhängigkeit | offen | **Related to AUT-56** (Lifecycle-Zuverlässigkeit) und **AUT-65** (correlation_id Konsistenz) |

### 📋 Fehlende Vorbedingungen

- Schema-Kontrakt `WS_CONFIG_EVENTS` in `reference/api/WEBSOCKET_EVENTS.md` prüfen und ggf. ergänzen.

### 💡 Ergänzungen

- Pending-Queue in Pinia-Store (`useConfigStore`) mit Ablauf-Budget + sichtbarem Badge je Gerät.
- A11y: aria-live für Pending-Transitions.

---

## AUT-65 — EA-12 WS-Envelope/Payload correlation_id Konsistenz

**PKG-Anker:** PKG-14 (neu) · **Rolle:** `server-dev` (primär) + `frontend-dev` (Konsum) · **Priorität:** High · **Estimate:** 3 SP · **related to:** AUT-56, AUT-64

### ✅ Bestätigt

- `El Servador/god_kaiser_server/src/websocket/manager.py` **225–233** — `contract_mismatch` wird bei `config_response` geloggt (Envelope `correlation_id = "unknown:..."`, Payload `correlation_id` korrekt), **aber trotzdem** gebroadcastet.
- Kein Primärtreiber für Disconnects; Observability-Problem.

### ⚠️ Korrekturen

| Kategorie | Issue-Text | Korrektur |
|-----------|-----------|-----------|
| Fix-Priorität | "nur Konsistenz" | Zusätzlich: **Envelope vor Broadcast synchronisieren** mit Payload, sonst driften Frontend-Stores (Pinia-Subscriptions filtern auf Envelope-ID) |
| Testbefehl | fehlt | `poetry run pytest tests/websocket/test_manager.py::test_config_response_correlation_envelope -q` |
| Logging | "weiterhin loggen" | Log-Level **WARN** bei Mismatch, **ERROR** wenn Broadcast trotz Mismatch eingeleitet wird (derzeit implizit) |

### 📋 Fehlende Vorbedingungen

- Keine — serverlokaler Fix.

### 💡 Ergänzungen

- Ein Metric-Counter `ws.envelope_correlation_mismatch_total` für Monitoring-Pfad (Alloy).

---

## Zusammenfassung für TM

**12 Issues → 10 neue PKGs (PKG-05 bis PKG-14) + 2 Scope-Anpassungen (PKG-01, PKG-04).**

- **Plan ist gegen das Repo ausführbar**, nach globalen Korrekturen G1–G7 und issue-spezifischen Deltas.
- **Kritische Vorbedingungen:** B-NET-01 (Broker-Rohlog UTC), B-TLS-URI-01 (TLS-Klasse ohne Creds), B-POLICY-DECISION-01 (AUT-59 Policy-Wahl), B-CONTRACT-AUDIT-01 (Case-Audit Kommandos), B-OUT-REPRO-01 (Outbox-Burst-Test).
- **Startreihenfolge P0:** AUT-54 ∥ AUT-55 ∥ AUT-59 ∥ AUT-63 (unabhängige Domänen). AUT-56 wartet auf AUT-55, AUT-60 wartet auf AUT-59.
- **TM-Entscheidung offen:** AUT-59 Policy (a/b/c — Auto-Exit vs Operator-Override vs beides).

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta

| PKG | Issue | Delta (Pfad, Testbefehl, Reihenfolge, Risiko, Gate, verworfene Teile) |
|-----|-------|------------------------------------------------------------------------|
| PKG-01 (erw.) | AUT-54 | `mqtt_client.cpp` Event-/Write-Pfad; **`pio run -e esp32_dev`**; Mehrgeräte-Fenster-Scope; HW-Gate ESP32-Dev; verworfen: seeed/xiao-Pfad |
| PKG-04 (Korrektur) | AUT-61 | `main.cpp` ACK-Branch + Call-Site-Dedup; **`pio run -e esp32_dev`**; `setDeviceApproved` bleibt unverändert (idempotent); verworfen: Funktions-interner Guard |
| PKG-05 (neu) | AUT-55 | `publish_queue.*` + `mqtt_cfg.*`; **`pio run -e esp32_dev`** + Burst-Test; HW-Gate; Mess-first, dann dimensionieren |
| PKG-06 (neu) | AUT-56 | `intent_outcome_handler.py` + Firmware-Publish-Pfad; pytest + firmware build; **Blocked by PKG-05**; Schema unverändert (payload_version versioniert) |
| PKG-07 (neu) | AUT-57 | `mqtt_client.cpp:609-632`; Retry-Count + linear Backoff; **`pio run -e esp32_dev`**; keine `delay()` |
| PKG-08 (neu) | AUT-58 | `mqtt_client.cpp:1096-1102`; Feld `payload_degraded` + `degraded_fields` im HB; WS-Relay; `pio run -e esp32_dev` + server pytest |
| PKG-09 (neu) | AUT-59 | `main.cpp:473-495` + `command_admission.cpp:26-52`; **BLOCKER:** TM-Policy-Entscheidung vor Code; `pio run -e esp32_dev` + integration |
| PKG-10 (neu) | AUT-60 | `logic_engine.py:1098, 1256`; Readiness-Gate mit `config_pending` zusätzlich zu `is_online`; **Blocked by PKG-09**; pytest mit neuen Fällen |
| PKG-11 (neu) | AUT-62 | `main.cpp:855` Emergency-Branch; Build-Flag `-DEMERGENCY_TOKEN_REQUIRED=1`; `pio run -e esp32_dev` (Prod+Bench) |
| PKG-12 (neu) | AUT-63 | `actuators.py:1027` Payload-Casing; **Präferenz Server-Fix** (`"emergency_stop"` lowercase); pytest + schema-test |
| PKG-13 (neu) | AUT-64 | Vue-Komponenten + Pinia-Store `useConfigStore`; `npm run build` + `vue-tsc --noEmit`; Related zu PKG-06/14 |
| PKG-14 (neu) | AUT-65 | `websocket/manager.py:225-233` Envelope-Sync; pytest; Log-Level-Regel WARN/ERROR |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle(n) | Agent-Pfad (flach) |
|-----|----------|--------------------|
| PKG-01 | `esp32-dev` | `.claude/agents/esp32-dev.md` |
| PKG-04 | `esp32-dev` | `.claude/agents/esp32-dev.md` |
| PKG-05 | `esp32-dev` | `.claude/agents/esp32-dev.md` |
| PKG-06 | `mqtt-dev` + `server-dev` + `esp32-dev` | `.claude/agents/mqtt-dev.md`, `.claude/agents/server-dev.md`, `.claude/agents/esp32-dev.md` |
| PKG-07 | `esp32-dev` | `.claude/agents/esp32-dev.md` |
| PKG-08 | `esp32-dev` + `server-dev` | `.claude/agents/esp32-dev.md`, `.claude/agents/server-dev.md` |
| PKG-09 | `esp32-dev` | `.claude/agents/esp32-dev.md` |
| PKG-10 | `server-dev` | `.claude/agents/server-dev.md` |
| PKG-11 | `esp32-dev` | `.claude/agents/esp32-dev.md` |
| PKG-12 | `server-dev` (primär) + `esp32-dev` (Contract) | `.claude/agents/server-dev.md`, `.claude/agents/esp32-dev.md` |
| PKG-13 | `frontend-dev` + `server-dev` | `.claude/agents/frontend-dev.md`, `.claude/agents/server-dev.md` |
| PKG-14 | `server-dev` + `frontend-dev` | `.claude/agents/server-dev.md`, `.claude/agents/frontend-dev.md` |

### Cross-PKG-Abhängigkeiten

- **PKG-05 → PKG-06:** harte Kante (Outbox vor Lifecycle-Publish)
- **PKG-09 → PKG-10:** harte Kante (Firmware-Policy vor Server-Gate)
- **PKG-05 ↔ PKG-07:** weiche Kante (Retry-Backoff entlastet Outbox)
- **PKG-05 ↔ PKG-08:** weiche Kante (gemeinsame Heap-Schwelle)
- **PKG-06 ↔ PKG-13 ↔ PKG-14:** Lifecycle/UX/Correlation-Trio, gemeinsam testen
- **PKG-11 ↔ PKG-12:** Emergency-Pfad-Review gemeinsam (Token + Contract)
- **PKG-01 ↔ PKG-05:** Firmware-Review-Kante (gleiches Subsystem)

### BLOCKER

| ID | Beschreibung | Betrifft |
|----|-------------|----------|
| **B-NET-01** | Broker-Rohlog `automationone-mqtt` im exakten UTC-Fenster fehlt | AUT-54 |
| **B-TLS-URI-01** | TLS vs. Plain MQTT-URI-Klasse am Feldgerät ohne Creds | AUT-54 |
| **B-SERIAL-01** | Monotone Zeitbasis Serial ↔ Broker für Sub-Minuten-Lage | AUT-54 |
| **B-ALLOY-01** | Monitoring/Alloy-Pfad (`automationone-alloy`) im selben Fenster nicht verifiziert | AUT-54, AUT-58 |
| **B-POLICY-DECISION-01** | TM-Entscheidung zur Pending-Exit-Policy (a/b/c) | AUT-59, AUT-60 |
| **B-OUT-REPRO-01** | Reproduzierbarer Outbox-Burst-Test fehlt | AUT-55 |
| **B-HEAP-BASELINE-01** | Heap-Baseline unter Nennlast | AUT-55, AUT-58 |
| **B-CONTRACT-AUDIT-01** | Case-Konsistenz aller Command-Payloads nicht inventarisiert | AUT-63 |
| **B-TOKEN-GEN-01** | Token-Generierung/-Rotation dokumentiert | AUT-62 |
| **B-LIFECYCLE-SCHEMA-01** | Mapping `rejected/accepted/completed/failed` in `MQTT_TOPICS.md` aktualisiert | AUT-56 |

---

*Stand: 2026-04-17. Dieser Report ergänzt `VERIFY-PLAN-REPORT.md` (PKG-01 bis PKG-04) um die issue-basierte Erweiterung (PKG-05 bis PKG-14). `TASK-PACKAGES.md` wird entsprechend gemuted.*
