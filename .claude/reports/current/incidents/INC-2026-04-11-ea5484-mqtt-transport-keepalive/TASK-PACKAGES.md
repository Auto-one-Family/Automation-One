# TASK-PACKAGES — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Stand:** nach `verify-plan`-Gate (2026-04-19, inkl. Delta PKG-17 Heartbeat-Slimming), Delta eingearbeitet.  
**Git:** Umsetzung nur auf Branch **`auto-debugger/work`** (von `master`); keine Commits auf `master`.

---

## PKG-01 — Firmware: Transport, Schreibpfad, Keepalive-Interaktion (ESP-IDF)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Mittel (MQTT/Safety-Nachbarschaft); keine Safety-Aktor-Logik ohne Review. |
| **Scope** | `El Trabajante/src/services/communication/mqtt_client.cpp` (Event-Pfad, Publishes, `mqtt_cfg.*`); `El Trabajante/src/tasks/communication_task.cpp` / `publish_queue.*` (M3-Drain vs. Blockaden); Abgleich mit ESP-IDF `esp_mqtt` Outbox/Socket-Timeouts (nur wo im Tree konfigurierbar — **keine** Magic-Delays in Hotpaths). |
| **Zielbild** | Messbar: entweder **konkrete** Konfig-/Queue-Anpassung mit Begründung **oder** dokumentiertes „kein sicherer Repo-Fix ohne HW-Repro“ + Telemetrie-Hooks (serielle Marken). Zusätzlich Counter-Konsistenz: Write-Timeout-Evidence darf nicht mit `write_timeouts=0` blind bleiben. |
| **Tests / Verifikation** | `cd "El Trabajante" && pio run -e esp32_dev` (Exit 0). Zielhardware ESP32-Dev wie EA5484. |
| **Akzeptanz** | Änderungen mit Kommentar-Verweis auf Incident-ID; kein Regressions-Wechsel des LWT-Payload-Contracts; Throttle/3014 unverändert legal; reproduzierter 5-Min-TLS-Loop wird mindestens diagnostisch präziser (Counter-/Reason-Telemetrie). |
| **Abhängigkeiten** | Optional: Parallel **PKG-02** (Infra-Evidence) zur RC-Einordnung — kein Blocker für Code-Analyse. |

---

## PKG-02 — Broker / Transport-Beobachtung (Keepalive, Inflight, NAT)

| Feld | Inhalt |
|------|--------|
| **Owner** | `mqtt-debug` (+ Robin Ops) |
| **Risiko** | — (primär Beobachtung/Doku) |
| **Scope** | `docker/mosquitto/mosquitto.conf` (`max_inflight_messages`, `max_keepalive`); pragmatische Logs: `docker logs automationone-mqtt --since …`; Korrelation UTC; Monitoring-Pfad mitprüfen: `docker/alloy/config.alloy`, Compose-Service `alloy` (`automationone-alloy`) auf Ingestion-Mismatch/Noise. **Keine** Secrets in Artefakten. |
| **Tests / Verifikation** | Manuell: `make mqtt-sub` / `mosquitto_sub` laut Makefile; optional Lastvergleich mit/ohne Kalibrier-Burst. |
| **Akzeptanz** | Entweder **B-NET-01** entlastet mit Log-Auszug **oder** BLOCKER explizit offen mit nächstem Messfenster. |
| **Abhängigkeiten** | Keine harte Kante zu PKG-03. |

---

## PKG-03 — Server: Kalibrier-Mess-Burst entschärfen (optional, getrennt von Transport-RC)

| Feld | Inhalt |
|------|--------|
| **Owner** | `server-dev` |
| **Risiko** | Niedrig bis mittel (API-Verhalten / UX); kein Ersatz für Transport-Fix. |
| **Scope** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` (Route `/{esp_id}/{gpio}/measure` um Zeile **1650**); ggf. Service-Layer Rate-Limit / Queue pro Gerät+GPIO — **nur** nach TM-Priorität. |
| **Tests / Verifikation** | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --timeout=120` (fokussiert erweitern falls neuer Limiter). |
| **Akzeptanz** | Keine Regression für legitime Einzelmessung; Verhalten dokumentiert (kurz im PR). |
| **Abhängigkeiten** | **Weich:** Unterstützt H2 (Verstärker), beweist H1 nicht. |

---

## PKG-04 — Firmware: Heartbeat-ACK State-Dedup (NVS-Schreiblast reduzieren)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Mittel (Boot-/Approval-State-Pfad, Persistenzverhalten). |
| **Scope** | `El Trabajante/src/main.cpp` (Heartbeat-ACK Branch um `setDeviceApproved()`). `config_manager.cpp/.h` nur lesen/prüfen; dedup dort ist bereits implementiert, Problem liegt in der ACK-Callsite/Timestamp-Semantik. |
| **Zielbild** | `online`-Liveness-ACKs lösen ohne Statewechsel **keinen** persistierenden Approval-Write aus (kein ts-bedingtes Dauer-Write). Persistenz nur bei echter Approval-Entscheidung/Transition (`pending_approval`→`approved`) oder bewusstem Recovery-Fall. |
| **Tests / Verifikation** | `cd "El Trabajante" && pio run -e esp32_dev` (Exit 0); Serial-Check: über mehrere Heartbeat-Zyklen kein wiederholtes `Device approval saved` bei unverändertem Approval-State. |
| **Akzeptanz** | Approval-Recovery bleibt intakt (`pending_approval`→`operational`), Rejected/Pending-Pfade unverändert korrekt, keine Änderung am ACK-Contract (`status`, `handover_epoch`). |
| **Abhängigkeiten** | Unabhängig von PKG-02/03; kann parallel zu PKG-01 umgesetzt werden, sollte aber denselben PR-/Review-Kontext teilen. |

---

## Verify-Einarbeitung (Delta-Log)

| Quelle | Änderung am Paketplan |
|--------|------------------------|
| `verify-plan` | Build-Ziel für **ESP32 Dev/WROOM** (EA5484): **`pio run -e esp32_dev`** — nicht `seeed_xiao_esp32c3` (PubSubClient-Pfad). |
| `verify-plan` | Agent-Referenzen: flache Pfade `.claude/agents/esp32-dev.md`, `.claude/agents/mqtt-debug.md`, `.claude/agents/server-dev.md`. |
| `verify-plan` | Container-Namen: **`automationone-mqtt`**, **`automationone-server`** (Compose-IST). |
| `verify-plan` | Neuer Delta-Befund aus Live-Logs: ACK-Kadenz triggert unnötige NVS-Writes (`Device approval saved`) → **PKG-04** hinzugefügt (State-Dedup/Persistenz-Gate). |
| `verify-plan` | **Korrektur PKG-04 (2026-04-17):** `setDeviceApproved()` ist bereits idempotent (`config_manager.cpp:1291-1324`). Fix gehört an die **Call-Site** (Heartbeat-ACK-Branch in `main.cpp`) — nicht an die Funktion. |
| `verify-plan` | Alloy als Zusatzpfad bestätigt: Service `alloy` unter Monitoring-Profil, Config `docker/alloy/config.alloy` vorhanden (für Korrelation/Broker-Logweg relevant). |
| `verify-plan` (5-Min-Stresstest) | Keine `WDT`/`Guru Meditation` im Fenster; stattdessen persistenter TLS-Reconnect-Loop + `SafePublish failed after retry` + `OFFLINE_ACTIVE`-Folge. |
| `verify-plan` (5-Min-Stresstest) | Counter-Diskrepanz bestätigt: `Writing didn't complete ... errno=119` sichtbar, Reconnect-Logs zeigen parallel `write_timeouts=0` bei steigenden `tls_timeouts` → **PKG-15** ergänzt. |
| `verify-plan` **2026-04-17 (Issues AUT-54 bis AUT-65)** | Plan-Erweiterung um **10 neue Pakete (PKG-05 bis PKG-14)** aus RUN-FORENSIK-REPORT-2026-04-17 (12 Befunde). Siehe separater Report `VERIFY-PLAN-REPORT-2026-04-17-issues.md` + PKG-Spezifikationen unten. |
| `verify-plan` **2026-04-19 (Heartbeat-Slimming Option 1 / AUT-68)** | Exakte Repo-IST-Mutationen für **PKG-17** ergänzt: Funktionsname `publishHeartbeat`, Zeilenblöcke `43`, `49-51`, `58-64`, `1302`, `1321-1368`, `1370-1381`, `publish_queue.h:21`; Server-/Frontend-Toleranz verifiziert, Gate = GO ohne offene Blocker. |

---

## PKG-05 — Firmware: MQTT Outbox-Kapazität & Backpressure (AUT-55)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Mittel (Transport-Hotpath + Ressourcen-Budget). |
| **Scope** | `El Trabajante/src/services/communication/mqtt_client.cpp` (`mqtt_cfg.out_buffer_size`, `task_stack`, `task_prio`); `El Trabajante/src/tasks/publish_queue.cpp/.h` (App-Staging-Queue); Trennung App-Queue vs ESP-IDF-Outbox. |
| **Zielbild** | Mess-first (Heap-Headroom + Queue-Tiefe via Telemetrie), dann dimensionieren. Explizite Drop-Policy (drop-oldest vs drop-newest). |
| **Tests / Verifikation** | `cd "El Trabajante" && pio run -e esp32_dev` (Exit 0); synthetischer Burst-Test (M3-Drain + parallele Kalibrier-Messung). |
| **Akzeptanz** | Kein `outbox_enqueue: Memory exhausted` unter Nennlast; Circuit-Breaker bezieht Outbox-Druck ein; keine `delay()` in Hotpaths. |
| **Abhängigkeiten** | **Blocks PKG-06.** Teilt Heap-Baseline-Blocker mit PKG-08. |

---

## PKG-06 — Server+Firmware: Lifecycle-Publish Robustheit (3012) (AUT-56)

| Feld | Inhalt |
|------|--------|
| **Owner** | `mqtt-dev` (primär) + `server-dev` + `esp32-dev` |
| **Risiko** | Mittel (Cross-Layer Contract). |
| **Scope** | `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py`; Firmware-Publish-Pfade für `system/intent_outcome/lifecycle`. |
| **Zielbild** | At-least-once-Zustellung terminaler Intent-Zustände; serverseitige Idempotency (`intent_id + outcome_state`). |
| **Tests / Verifikation** | Server: `poetry run pytest tests/mqtt/handlers/test_intent_outcome_handler.py -q`; Firmware: `pio run -e esp32_dev`. |
| **Akzeptanz** | Keine Payload-Breaking-Changes; ggf. `payload_version` versioniert; Replay-sicher. |
| **Abhängigkeiten** | **Blocked by PKG-05.** Related zu PKG-13, PKG-14. |

---

## PKG-07 — Firmware: SafePublish-Retry-Strategie (AUT-57)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Niedrig. |
| **Scope** | `El Trabajante/src/services/communication/mqtt_client.cpp` **609-632** — `safePublish()` aktuell 2 Retries + `yield()`. |
| **Zielbild** | Retry-Count konfigurierbar (ENV `MQTT_PUBLISH_RETRIES`, Default 3); Linear-Backoff 50/100/200 ms; Abbruch bei CB-open; Retry-Counter-Telemetrie. |
| **Tests / Verifikation** | `cd "El Trabajante" && pio run -e esp32_dev`. |
| **Akzeptanz** | Keine blockierenden `delay()`; nur `vTaskDelay` mit Minimum-Tick; Circuit-Breaker respektiert. |
| **Abhängigkeiten** | Related zu PKG-05, PKG-06. |

---

## PKG-08 — Firmware+Server: Heartbeat-Degradation Policy (AUT-58)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` + `server-dev` |
| **Risiko** | Niedrig (Contract-Additiv). |
| **Scope** | `El Trabajante/src/services/communication/mqtt_client.cpp` **1096-1102** (Heartbeat-Builder); Server-Handler (Relay); WS-Event `heartbeat_degraded`. |
| **Zielbild** | Neue Felder `payload_degraded: true` + `degraded_fields: [...]` im Heartbeat; Thresholds via Build-Flags/NVS; Frontend-Badge. |
| **Tests / Verifikation** | `pio run -e esp32_dev` + `poetry run pytest tests/mqtt/handlers/test_heartbeat_handler.py -q`. |
| **Akzeptanz** | Abwärtskompatibel (Altconsumer ignorieren neue Felder); Grafana-Alarm möglich. |
| **Abhängigkeiten** | Teilt Heap-Baseline-Blocker mit PKG-05. |

---

## PKG-09 — Firmware: Pending-Exit-Blockade auflösen (AUT-59)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Mittel (Boot-Lifecycle + Safety-Nähe). |
| **Scope** | `El Trabajante/src/main.cpp` **473-495** (`evaluatePendingExit()`, `MISSING_ACTUATORS`-Branch); `El Trabajante/src/tasks/command_admission.cpp` **26-52** (Admission-Allowlist). |
| **Zielbild** | Explizite Policy nach TM-Entscheidung: (a) Auto-Exit bei `offline_rules`-only, (b) Operator-Override via MQTT `system/admin/pending_exit/<esp_id>`, oder (c) beides. |
| **Tests / Verifikation** | `pio run -e esp32_dev` + Integration-Test `actuators=0` → Exit-Verifikation. |
| **Akzeptanz** | Telemetrie `pending_exit_blocked_reason`; Operator-Notification bei >10 min. |
| **Abhängigkeiten** | **BLOCKER B-POLICY-DECISION-01.** **Blocks PKG-10.** |

---

## PKG-10 — Server: Cross-ESP Command Readiness-Gate (AUT-60)

| Feld | Inhalt |
|------|--------|
| **Owner** | `server-dev` |
| **Risiko** | Niedrig bis mittel. |
| **Scope** | `El Servador/god_kaiser_server/src/services/logic_engine.py` **1098, 1256** — Dispatch-Gate. |
| **Zielbild** | Gate nicht nur `is_online`, sondern auch `config_pending == False`; frühes `rejected`-Intent-Outcome bei Fehlschlag. |
| **Tests / Verifikation** | `poetry run pytest tests/services/test_logic_engine.py -q` mit neuen Fällen. |
| **Akzeptanz** | Counter `logic_engine.dispatch_skipped_config_pending` verfügbar. |
| **Abhängigkeiten** | **Blocked by PKG-09.** |

---

## PKG-11 — Firmware: Emergency Fail-Closed Prod-Default (AUT-62)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Mittel (Safety-Pfad). |
| **Scope** | `El Trabajante/src/main.cpp` ~**855** (Emergency-Branch); `platformio.ini` (Build-Flags). |
| **Zielbild** | Build-Flag `-DEMERGENCY_TOKEN_REQUIRED=1` für Prod; NVS-Override nur Debug; Audit-Log serverseitig. |
| **Tests / Verifikation** | `pio run -e esp32_dev` für Prod- und Bench-Build; Serial muss bei Prod ohne Token `REJECTED` loggen. |
| **Akzeptanz** | `PRODUCTION_CHECKLIST.md` ergänzt; Token-Rotation dokumentiert. |
| **Abhängigkeiten** | **BLOCKER B-TOKEN-GEN-01.** Related zu PKG-12. |

---

## PKG-12 — Server: Broadcast-Emergency Command-Contract (3016) (AUT-63)

| Feld | Inhalt |
|------|--------|
| **Owner** | `server-dev` (primär) + `esp32-dev` (Contract-Check) |
| **Risiko** | Niedrig (Schema-Alignment), operativ Urgent. |
| **Scope** | `El Servador/god_kaiser_server/src/api/v1/actuators.py` **1027** — Payload `"command"` Casing; Firmware `emergency_broadcast_contract.h` **40-46, 109-116**. |
| **Zielbild** | Präferenz **Server-Fix** (`"emergency_stop"` lowercase); Firmware-Allowlist stabil; JSON-Schema-Enum als CI-Gate. |
| **Tests / Verifikation** | Server: `poetry run pytest tests/api/v1/test_actuators.py -q`; Firmware: `pio run -e esp32_dev`. |
| **Akzeptanz** | Kein 3016/`EMERGENCY_CONTRACT_MISMATCH` mehr im Lasttrace; Altserver bleibt tolerierbar (Log + Reject). |
| **Abhängigkeiten** | **BLOCKER B-CONTRACT-AUDIT-01.** Related zu PKG-11. |

---

## PKG-13 — Frontend+Server: Config-Timeout UX (AUT-64)

| Feld | Inhalt |
|------|--------|
| **Owner** | `frontend-dev` + `server-dev` |
| **Risiko** | Niedrig (UX). |
| **Scope** | Vue-Store `useConfigStore` (Pinia) mit Pending-Queue; Server-Handler für WS-Events `config_published` / `config_response` / `config_failed`. |
| **Zielbild** | UI differenziert Pending (Spinner) → Warning → Error; ablauf-budgetierte Pending-Queue; A11y-Live-Region. |
| **Tests / Verifikation** | `npm run build` + `npx vue-tsc --noEmit`; Playwright falls verfügbar. |
| **Akzeptanz** | Kein falscher Timeout-Toast, solange terminales Event noch erwartet wird. |
| **Abhängigkeiten** | Related zu PKG-06, PKG-14. |

---

## PKG-14 — Server+Frontend: WS Envelope/Payload correlation_id Konsistenz (AUT-65)

| Feld | Inhalt |
|------|--------|
| **Owner** | `server-dev` (primär) + `frontend-dev` |
| **Risiko** | Niedrig. |
| **Scope** | `El Servador/god_kaiser_server/src/websocket/manager.py` **225-233** — Envelope-Sync mit Payload vor Broadcast. |
| **Zielbild** | Envelope `correlation_id` immer identisch mit Payload; Mismatch = WARN, Broadcast-trotz-Mismatch = ERROR. |
| **Tests / Verifikation** | `poetry run pytest tests/websocket/test_manager.py::test_config_response_correlation_envelope -q`. |
| **Akzeptanz** | Counter `ws.envelope_correlation_mismatch_total` verfügbar; Frontend-Stores filtern zuverlässig auf Envelope-ID. |
| **Abhängigkeiten** | Related zu PKG-06, PKG-13. |

---

## PKG-15 — Firmware: Transport-Counter-Konsistenz (Write vs TLS Timeout)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Niedrig bis mittel (Diagnosepfad, kein Contract-Break). |
| **Scope** | `El Trabajante/src/services/communication/mqtt_client.cpp` (`MQTT_EVENT_ERROR`, Managed-Reconnect-Reason/Counter-Logik; Mapping für `errno=119`/Write-Timeout). |
| **Zielbild** | Bei erneutem `Writing didn't complete in specified timeout: errno=119` steigt ein konsistenter Write-Timeout-Counter oder es wird explizit markiert, warum der Counter unberührt bleibt (kein stilles Blindspot). |
| **Tests / Verifikation** | `cd "El Trabajante" && pio run -e esp32_dev`; Serial-Repro im 5-Min-Fenster mit erwarteter Counter-/Reason-Änderung. |
| **Akzeptanz** | Reconnect-Telemetrie unterscheidet Write- vs TLS-Timeout robust; keine Änderung am MQTT-Payload/LWT-Contract. |
| **Abhängigkeiten** | Kann parallel zu PKG-01 laufen; sollte in denselben Review-Kontext für Transportdiagnostik. |

---

## PKG-16 — Firmware: Null-Safety Defensive & OUTBOX-Bound (Crash-Fix H6/H7, neu 2026-04-17)

**Kontext:** Neue Ausprägung unter Aktor-Command-Burst — siehe `INCIDENT-LAGEBILD.md` Abschnitt „Eingebrachte Erkenntnisse" vom 2026-04-17 (OUTBOX ENOMEM → drei `[ERRTRAK] <null>` → Guru Meditation LoadProhibited Core 0, PC=0x4008c304, EXCVADDR=0x00000000). **Priorität: hoch** (Crash-Pfad, nicht nur Degradation).

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Mittel (zentrale Fehler-/Publish-Pfade, Safety-Nachbarschaft). Fehlerbehandlungs- und Telemetriepfade werden gehärtet; Produktlogik bleibt unverändert. |
| **Scope (Pflicht-Dateien)** | 1) `El Trabajante/src/error_handling/error_tracker.cpp` — Zeile **256** (`strcmp(entry.message, message)`) und Zeile **268** (`strncpy(..., message, ...)`): Null-Guard auf `message` (Fallback-Konstante `"<null>"`).<br>2) `El Trabajante/src/tasks/publish_queue.cpp` — Zeile **65–66** (`strlen(topic)` / `strlen(payload)`): Null-Guard; bei NULL oder `length==0` frühzeitig mit Log `drop_null_payload` abbrechen.<br>3) `El Trabajante/src/tasks/intent_contract.cpp` — Zeile **747** (`strncpy(entry.reason, reason.c_str(), …)`): vor `c_str()` prüfen `reason.length() > 0 && reason.c_str() != nullptr` und ggf. Fallback-Literal nutzen; gleiches Review für Zeilen **743, 746, 745** (alle `strncpy(..., optional_ptr, …)`).<br>4) `El Trabajante/src/services/communication/mqtt_client.cpp` — Zeile **610** (`esp_mqtt_client_publish(…, 0, qos, 0)`): `payload.length()` als expliziten `len`-Parameter übergeben statt `0` (vermeidet IDF-internes `strlen` auf potentiell leerem Buffer); Zeile **632** (`String("ESP-IDF MQTT outbox full: ") + topic`): in einem lokalen Buffer/`char[128]` mit `snprintf` aufbauen, nicht per Arduino-String-Concat unter OOM. |
| **Scope (Outbox-Bound, verschärft PKG-05)** | `El Trabajante/src/services/communication/mqtt_client.cpp` **310–338** — `mqtt_cfg.outbox_limit = <N Bytes>` setzen (ESP-IDF v4.x flache Struct; falls nicht verfügbar: Build-Flag-Check `CONFIG_MQTT_OUTBOX_ENABLE`). Ziel: harte obere Schranke für die IDF-Outbox, bevor Heap-Fragmentierung einsetzt. Dimensionierung: Start `32 * out_buffer_size`-konforme Item-Size, empirisch ≥ Anzahl paralleler Publishes im Burst; nicht größer als `free_heap_min - 20 kB`. |
| **Zielbild** | 1) Kein Guru-Meditation-Crash mehr im Aktor-Command-Burst-Fenster, wenn OUTBOX ENOMEM auftritt (Worst-Case: bounded Publish-Drops + `PUBLISH_OUTBOX_FULL`-Intent-Outcome, **kein** Reboot).<br>2) `[ERRTRAK] <null>`-Zeilen verschwinden bzw. werden durch aussagekräftige Fallback-Texte (`<oom-fallback:reason>`) ersetzt.<br>3) Messbar: Serial-Log zeigt stattdessen `SYNC: Publish rejected (oversize or null)` / `outbox_limit reached`-Warnung und geregelten Reconnect. |
| **Tests / Verifikation** | 1) `cd "El Trabajante" && pio run -e esp32_dev` (Exit 0).<br>2) Vorhandene Native-Tests unverändert: `~/.platformio/penv/Scripts/pio.exe test -e native -vvv`.<br>3) Reproduktionslauf (HW ESP_EA5484 oder vergleichbar): wiederholtes Aktor-ON/OFF am laufenden Band **mit** künstlich geblockter Netzwerkverbindung (WiFi-AP kurz trennen), Erwartung kein Reboot, stattdessen OFFLINE_ACTIVE oder geordneter Reconnect nach Restore. Logauswertung: 0 Treffer auf `Guru Meditation` im 10-Minuten-Fenster. |
| **Akzeptanz** | Kein Regressions-Wechsel am MQTT-Payload/LWT-Contract; ERRTRAK-Rate-Limit (Error-Code-Slot 60 s) unverändert; Outbox-Config ist abwärtskompatibel (wenn Kernel `outbox_limit` nicht stützt: sauberer Compile-Time-Fallback mit Kommentar). **Änderungen tragen Incident-ID im Commit.** |
| **Abhängigkeiten** | **Verschärft PKG-05** (Outbox-Backpressure — AUT-55) und **ergänzt PKG-01** (Transport-Event-Pfad). Kann parallel zu PKG-15 umgesetzt werden; **blockiert keine** anderen Pakete, sollte aber **vor** weiteren Belastungstests (PKG-03 Burst, PKG-08 Heartbeat-Degradation) ausgeliefert sein. |
| **Delta zur bisherigen Artefaktlage** | Diese Ausprägung war in `INCIDENT-LAGEBILD.md` §3 nicht abgedeckt („kein Crash-Muster im Fenster" galt nur für den 5-Minuten-TLS-Loop). Post-Verify: siehe Zeitstempel 2026-04-17 im Lagebild, Abschnitt „Eingebrachte Erkenntnisse" (H6/H7). |

---

## PKG-17 — Heartbeat-Slimming Option 1 (Heap-Budget-Reclaim, H8)

**Kontext:** Verify-Delta 2026-04-19 bestätigt den Root-Cause-Cluster H8: Heartbeat-Payload verursacht Heap-Fragmentierungsdruck, der `max_alloc` bei ~38 900 B deckelt. Ziel ist ein kleiner, reversibler Schnitt mit messbarem Runtime-Effekt ohne Topic-/Contract-Breaking-Change.

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` (primär) + `server-debug` Verify + `frontend-debug` Verify |
| **Risiko** | Niedrig bis mittel (Payload-Slimming im Heartbeat-Pfad; keine Topic-Änderung). |
| **Scope Firmware (Pflicht)** | `El Trabajante/src/services/communication/mqtt_client.cpp` und `El Trabajante/src/tasks/publish_queue.h` mit **Repo-IST-Zeilen** aus Verify 2026-04-19: `mqtt_client.cpp:43`, `49-51`, `58-64`, `1302`, `1321-1368`, `1370-1381`; `publish_queue.h:21`. |
| **Scope Server/Frontend (nur Verify)** | Server: `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:1139-1176`, `src/schemas/esp.py:444-452`. Frontend: Grep/Verify in `El Frontend/src/stores/esp.ts`, `src/shared/stores/gpio.store.ts`, `src/composables/useGpioStatus.ts`, `src/domain/esp/espHealth.ts`, `src/types/websocket-events.ts`. |
| **Edits (verbindlich)** | 1) `mqtt_client.cpp:43` `g_heartbeat_payload_degraded_count` entfernen.<br>2) `mqtt_client.cpp:49-51` Cache-Globals (`g_last_gpio_status_*`) entfernen.<br>3) `mqtt_client.cpp:58-64` `HB_HEAP_DEGRADE_BYTES` und `HB_ALLOC_DEGRADE_BYTES` entfernen.<br>4) `mqtt_client.cpp:1302` `payload.reserve(1900)` → `payload.reserve(640)`.<br>5) `mqtt_client.cpp:1321-1368` kompletten `gpio_status`-Assembly/Fallback-Block entfernen.<br>6) `mqtt_client.cpp:1370-1381` Payload-Append für `gpio_status`/`payload_degraded`/`degraded_fields`/`heartbeat_degraded_count` entfernen.<br>7) `publish_queue.h:21` `PUBLISH_PAYLOAD_MAX_LEN 2048 → 1024`, Kommentar auf schlanken Heartbeat aktualisieren. |
| **Grep-Sweep (Pflicht vor Build)** | `rg "gpio_status|g_last_gpio_status|g_heartbeat_payload_degraded_count|HB_HEAP_DEGRADE_BYTES|HB_ALLOC_DEGRADE_BYTES" "El Trabajante/src"` muss leer sein. |
| **Build / Verifikation** | `cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e esp32_dev` (Exit 0). |
| **Runtime-DoD** | `serial_heartbeat_payload_len_bytes <= 512`; `heap_max_alloc_bytes >= 46000`; `errno_11_disconnect_in_5min = 0`; `mqtt_event_disconnected_in_5min = 0`; Heartbeat-Intervall bleibt 60 s (`mqtt_client.h:238`). |
| **Akzeptanz** | Keine Änderungen an MQTT-Topic-Struktur, LWT, Intent-Outcome oder Kern-Heartbeat-Feldern (`esp_id`, `seq`, `zone_id`, `master_zone_id`, `zone_assigned`, `ts`, `time_valid`, `uptime`, `heap_free`, `wifi_rssi`, `sensor_count`, `actuator_count`, `wifi_ip`, `reset_reason`, `boot_sequence_id`). |
| **Abhängigkeiten** | Server-/Frontend-Verify sind **grün** (kein Blocker), laufen parallel zum Firmware-Flash. |
| **Git (Pflicht)** | Änderungen und Commits nur auf `auto-debugger/work`; kein Commit auf `master`, kein Force-Push. |
| **Follow-up (nicht Teil PKG-17)** | `AUT-69 [EA-16]` für `device_metadata`-Concurrency-Hardening und optional Option-2-Telemetry-Split separat nach Live-Verify. |
