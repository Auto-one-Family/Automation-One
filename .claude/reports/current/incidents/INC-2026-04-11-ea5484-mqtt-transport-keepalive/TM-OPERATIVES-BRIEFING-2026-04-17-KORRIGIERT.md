# STATE-ARCHITECTURE-ANALYSIS — TM Operatives Briefing (KORRIGIERT)

**Incident:** INC-2026-04-11-ea5484-mqtt-transport-keepalive
**Datum:** 2026-04-17 (korrigierte Fassung, nach Linear-Abgleich)
**Vorversionen:** `TM-OPERATIVES-BRIEFING-2026-04-17.md` (enthielt Ticket-Zuordnungsfehler, siehe §10)
**Zielgruppe:** Technical Management (Erstanalyse → Linear-Verteilung → Umsetzungssteuerung)
**Scope:** Cross-Layer-State-Drift bei Reconfigure/Reconnect (Firmware ↔ Broker ↔ Server ↔ DB ↔ Frontend)
**Arbeitsbranch:** `auto-debugger/work`

---

## 1) Executive Klartext

Kein singulärer Crash-Bug, sondern ein Drift-Loop aus mehreren korrekt gemeinten Mechanismen, die unter Last nicht strikt auf dieselbe Autorität zeigen.

Operativer Kern für den TM:

1. Der Auslöser liegt im Transportpfad (Write-Timeout `errno=119`, TLS-Connect-Timeout), der schwerere Schaden entsteht im Recovery-/Contract-Pfad (Pending-Exit, Lifecycle-Publish, Emergency-Contract 3016, WS-correlation_id).
2. Safety/P4-Verhalten ist erwartungskonform, aber `offline_rules` + aktiver Aktor erzeugen ein neues **Latch-Risiko** → eigenes P0 (**AUT-66**).
3. AUT-54..AUT-67 decken die Ursachenlandschaft zu ~90 % ab, wenn die Schärfungen an den **richtigen** Tickets landen (Korrekturen gegenüber Vorbriefing: §10).
4. Neue Arbeit nur minimal als Gap-Ergänzung (Backpressure aus Degradation, Adoption-Restart-Persistenz, WS-Drift-Event).

---

## 2) TM-Entscheidungsregeln

| Frage | Antwort | Regel |
|---|---|---|
| A — Primär MQTT-Transport? | Nein, nur Trigger. | AUT-54 niemals isoliert; immer zusammen mit **AUT-67** (Counter-Sichtbarkeit) und **AUT-55** (Outbox/Backpressure). |
| B — P4/Offline-Mode fehlerhaft? | Nein, policy-konform. Aber Aktor-Latch-Risiko ist neu → AUT-66. | Regressionshärtung + konfigurierbarer `fail_safe_on_disconnect`. |
| C — Autoritätskollision? | Drei Stellen: (1) ACK-Quelle vs. Ersatzsignale, (2) In-Memory-Adoption vs. restartfest, (3) `connected` vs. `ready`. | Ein autoritativer Writer pro State-Feld, Rest nur Spiegel. |
| D — AUT-54..AUT-67 ausreichend? | Ja zu ~90 %. | G-NEW-01..03 nur bei bestätigter Restlücke. |
| E — Reihenfolge in Linear? | Telemetrie-Gate (AUT-67) → Transport+Outbox (AUT-54/55) → Publish-Lifecycle (AUT-56/57/61) → Readiness/Logic-Gate (AUT-59/60) → Contract (AUT-63/65) → Safety/UX (AUT-62/66/64) → Observability/Soak (AUT-58). | Siehe Workstream-Matrix §4 und Handlungsfolge §9. |

---

## 3) SSOT-Regeln (zwingend)

1. `transport_connected` ist kein Betriebsstatus. Betriebsfähigkeit erst bei `ack_validated && readiness_ok`.
2. Finale Config-Erfolge nur nach Commit. `applied` ist Zwischenstatus.
3. Queue/Publish-Fails sind terminal (Outcome-Code `failed`), kein reines Logging.
4. Offline-Exit nur über autoritativen ACK-Contract. Andere Signale sind Hinweise.
5. Readiness ist **per-ESP** sichtbar (`adoption_phase`, `last_ack_epoch`, `config_pending`, `backoff_state`).
6. Counter bilden **mutually exclusive** Primärkategorien (`write_timeouts`, `tls_timeouts`, `tcp_errors_other`).
7. `correlation_id` ist identisch in Envelope und Payload (WS/REST/MQTT).
8. Aktor-Zustand über Disconnect hinweg folgt einer **expliziten** `fail_safe_on_disconnect`-Policy (neu, AUT-66).

---

## 4) Workstream-Matrix (korrigiert, schichten-konsistent)

### WS-1 Transport & Counter-Wahrheit
**Tickets:** **AUT-67 (vor)** → **AUT-54**
**Code:** `El Trabajante/src/services/communication/mqtt_client.cpp` (Event-Handler **1249–1261** / Disconnect **1159–1179** / `[INC-EA5484]`-Marker **1269–1312**, `mqtt_cfg.keepalive` **225**), `main.cpp` **2913**, `platformio.ini [env:esp32_dev]`.
**In Scope:** Korrekte Klassifikation `MQTT_EVENT_ERROR` (Write-Timeout `errno=119` vs. TLS-Timeout) auf getrennte Counter; Reconnect-Attempt-Reset nur nach valider ACK-Contract-Bestätigung; Backoff + ±500 ms Jitter.
**Out of Scope:** Config-Lifecycle, UI.
**DoD:** `write_timeouts>0` im Stresstest reproduzierbar (AUT-67), Attempt-Peak sinkt nach validem Reconnect deterministisch (AUT-54); 4 h-Dauerlauf ohne zyklischen Timeout-Loop.

### WS-2 Publish-Pfad & Outcome-Terminalität (Firmware)
**Tickets:** **AUT-55** (Outbox) → **AUT-57** (Retry-Loop) → **AUT-56** (Lifecycle)
**Code:** `mqtt_client.cpp` `safePublish()` **609–632** (hardcoded 2 Versuche, `-2 = outbox-full`), `publish_queue.cpp/.h`, `actuator_command_queue.cpp`, Server-seitig `intent_outcome_handler.py`.
**In Scope:** App-Queue-Priorisierung kritisch/Telemetrie, Outbox-Druck-Telemetrie (`publish_outbox_full_total` etc.), echter retry-gesteuerter Loop mit ENV `MQTT_PUBLISH_RETRIES`, Lifecycle-Publish QoS 1 + NVS-Replay.
**Out of Scope:** Server-Adoption-Policy, Emergency-Pfad.
**DoD:** Keine stillen Drops kritischer Pfade (3012 = `failed` terminal), Intent-Outcome überlebt Kurz-Disconnect.
**Reihenfolge-Hinweis:** AUT-56 ist *blocked by* AUT-55 (Linear-Relation).

### WS-3 Readiness & Logic-Gate (Server + Firmware)
**Tickets:** **AUT-59** (Firmware Pending-Exit + Server Config-Atomarität) → **AUT-60** (Server Logic-Gate)
**Code:** `El Trabajante/src/tasks/command_admission.cpp:26-52` (`CONFIG_PENDING_BLOCKED`), `El Trabajante/src/main.cpp:473-495` (`evaluatePendingExit` / `RuntimeReadinessSnapshot`), `El Servador/.../services/esp_service.py` (`send_config` atomar), `El Servador/.../services/logic_engine.py:1098, 1256` (Pre-Check nur `is_online`).
**In Scope:** `offline_rules` darf nur mit referenzierten `actuators` atomar versendet werden; `OFFLINE_RULES_WITHOUT_ACTUATORS`-Code; Logic-Gate erweitern auf `is_online && not config_pending` (→ `ESPDevice.config_pending` + `last_config_ack_at`); Policy-Wahl (a/b/c) in AUT-59 als Vorbedingung.
**Out of Scope:** Broker-TLS-Profil, UI-Status.
**DoD:** Keine `CONFIG_PENDING_BLOCKED`-Reject-Stürme, kein Logic-Dispatch auf Geräte in Pending; Metrik `dispatch_skipped_config_pending`.
**Reihenfolge-Hinweis:** AUT-60 ist *blocked by* AUT-59.

### WS-4 Contract-Konsistenz & Observability (Server/WS)
**Tickets:** **AUT-63** (Broadcast-Emergency 3016) → **AUT-65** (WS correlation_id) → **AUT-58** (Heartbeat-Degradation sichtbar)
**Code:** `El Servador/.../api/v1/actuators.py` (Uppercase-Payload), `El Trabajante/src/tasks/emergency_broadcast_contract.h` **40-46, 109-116** (lowercase Whitelist), `El Servador/.../mqtt/handlers/config_handler.py` (`ws_manager.broadcast` ohne `correlation_id=`), `El Servador/.../websocket/manager.py` (Envelope-Fallback auf `get_request_id()`, Divergenz-Metriken), `mqtt_client.cpp:1096-1102` (Heap-Schwellen 46000 B / 16384 B).
**In Scope:** Server-only Casing-Normalisierung auf `emergency_stop` (lowercase) + Pydantic-`Literal`; Input-Guard gegen `EmptyInput`; WS-Broadcast mit `correlation_id`-kwarg + Audit aller Broadcast-Callsites; `payload_degraded: bool` + `degraded_fields: string[]` additiv, Thresholds über Build-Flags.
**Out of Scope:** Firmware-Contract (case-sensitive Whitelist bleibt Single-Source-of-Truth).
**DoD:** Kein 3016 mehr durch Casing-Drift; `increment_ws_contract_mismatch{message_type=config_response}=0`; `heartbeat_degraded_count` aussagekräftig.

### WS-5 Safety/Emergency (Firmware + Server)
**Tickets:** **AUT-66 (NEU P0)** → **AUT-62**
**Code:** `El Trabajante/src/tasks/safety_task.cpp` (NOTIFY_MQTT_DISCONNECTED, Delegation an P4), `mqtt_client.cpp` (`offlineModeManager.onDisconnect()`), `main.cpp` **~855** (Emergency Fail-Open-Branch), `emergency_broadcast_contract.h` **40-46, 109-116**.
**In Scope:** Pro-Aktor-Config `fail_safe_on_disconnect` (Default true für kritische Pumpen); Manual-Recovery-Pfad im Offline-Modus; Build-Flag `-DEMERGENCY_TOKEN_REQUIRED=1` für Prod; Server-Audit-Log `actor_id + reason + token_present`.
**Out of Scope:** Transportmetriken, Config-Atomarität.
**DoD:** Repro — aktiver Aktor + Disconnect geht nach Grace in Safe-State, wenn Flag true; Prod-Build ohne Token weist Emergency ab.

### WS-6 Frontend/Operator-Gates
**Tickets:** **AUT-64**
**Code:** `El Frontend/src/components/esp/ActuatorConfigPanel.vue`, `SensorConfigPanel.vue` (`waitForConfigTerminal(timeoutMs: 65_000)`), `El Frontend/src/shared/stores/actuator.store.ts` (`config_published`/`config_response`/`config_failed`), `El Servador/.../services/esp_service.py` (synchrones `config_published`, asynchrones terminales Event).
**In Scope:** `terminal_timeout` → `pending-with-warning` statt Hard-Error; dedizierte `pending-orders`-Leiste mit `correlation_id`-Deep-Link; Retry nur auf Operator-Aktion; a11y (aria-live polite).
**Out of Scope:** Firmware, Server-Contract.
**DoD:** Kein Hard-Fail ohne explizites `config_failed`; UI schließt nach nachgeliefertem `config_response` sauber.
**Reihenfolge-Hinweis:** AUT-64 ist *blocked by* AUT-65 (saubere `correlation_id`-Propagation).

---

## 5) Präzisierung AUT-54..AUT-67 (korrekt zugeordnet, vollständig, 14/14)

| AUT | Thema | Schärfung (AC-Zusatz) |
|---|---|---|
| **AUT-54** | Transport/Session | Attempt-Reset nur nach valider ACK-Contract-Bestätigung; getrennte Zähler `write_timeouts` / `tls_timeouts` / `tcp_errors_other`; 4 h Dauerlauf grün. |
| **AUT-55** | Outbox + App-Backpressure | Mess-first (`publish_outbox_full_total`, Heap); Priorisierung kritisch vs. non-critical; Shed-Policy dokumentiert. |
| **AUT-56** | Lifecycle-Publish (3012) | QoS 1 + NVS-Replay für `intent_outcome/lifecycle`; Server-Idempotency via `intent_id + outcome_state`; `payload_version`. |
| **AUT-57** | SafePublish Retry-Loop | `retries`-Parameter echt wirksam (`for attempt in 1..retries+1`); Backoff mit Jitter; Fehler-Subcodes `OUTBOX_FULL` / `NOT_CONNECTED` / `TRANSPORT_ERROR`; ENV `MQTT_PUBLISH_RETRIES`. |
| **AUT-58** | Heartbeat-Degradation-Policy | Heartbeat-Felder `payload_degraded: bool` + `degraded_fields: string[]` additiv; Thresholds konfigurierbar (`-DHB_HEAP_DEGRADE_BYTES` / `-DHB_ALLOC_DEGRADE_BYTES`); WS-Event `heartbeat_degraded`; Grafana-Alarm. |
| **AUT-59** | Pending-Exit / Config-Atomarität | Server validiert `offline_rules ↔ actuators` atomar; Firmware liefert `OFFLINE_RULES_WITHOUT_ACTUATORS`; Telemetrie `pending_exit_blocked_reason`; Policy-Entscheidung (a/b/c) vor Dev-Start. |
| **AUT-60** | Cross-ESP Logic-Gate | `ESPDevice.config_pending` + `last_config_ack_at`; Pre-Check `is_online && !config_pending`; Metrik `dispatch_skipped_config_pending` vs. `_offline`; server-seitiger `rejected`-Outcome spart MQTT-Roundtrip. |
| **AUT-61** | Approval-NVS-Dedup | Fix an Call-Site in `main.cpp`-Heartbeat-ACK-Branch (Funktion ist bereits idempotent); `setApprovalTimestampIfDue(ts, min_interval≥24 h)`; Counter `approval_nvs_write_total` / `_skip_total`. |
| **AUT-62** | Emergency fail-closed (Prod-Default) | Build-Flag `-DEMERGENCY_TOKEN_REQUIRED=1`; Dev/Bench bleibt fail-open; Server-Audit-Log; Token-Rotation dokumentiert (ohne Secrets im Repo). |
| **AUT-63** | Broadcast-Emergency Casing (3016) | Server normalisiert auf lowercase `emergency_stop`; Pydantic `Literal[...]`; Input-Guard gegen `EmptyInput`; Metrik `broadcast_emergency_published_total{command=...}`; Firmware-Contract bleibt streng. |
| **AUT-64** | Frontend Config-Timeout UX | `terminal_timeout` → gelb/warnend statt Fehler; `pending-orders`-Leiste mit `correlation_id`; Retry als explizite Operator-Aktion; Vitest Mock- + Real-ESP. |
| **AUT-65** | WS correlation_id-Invariante | 1-Zeilen-Callsite-Fix in `config_handler.py` (`correlation_id=correlation_id`); Invariante als Docstring in `ws_manager.broadcast`; Audit aller `ws_manager.broadcast()`-Calls; Prometheus-Alert `rate(ws_contract_mismatch_total[5m]) > 0`. |
| **AUT-66** | **Aktor-Latch bei Disconnect (NEU, P0)** | Pro-Aktor-Flag `fail_safe_on_disconnect` (Default true für Pumpen); Manual-Recovery im Offline-Modus; Telemetrie `actuator_latched_offline{reason=...}`; Safety-Regression grün. **Nicht** bereits gelöst — Sprint-Welle 1. |
| **AUT-67** | Write-Timeouts-Telemetrie (H5) | IDF-Error-Struct parsen (`error_type` + `esp_transport_sock_errno`), `errno=119` → `write_timeouts++`; Reconnect-Snapshot um drei Counter + `last_errno`; Grafana-Panel; **Vorbedingung** für AUT-54-Verify. |

---

## 6) Gap-Ergänzungen (nur bei bestätigter Restlücke)

1. **G-NEW-01 — Backpressure aus Degradation-Signal:** `payload_degraded=true` bremst non-critical Publishing. **Nur eröffnen**, wenn AUT-55 + AUT-58 zusammen die Policy nicht abdecken.
2. **G-NEW-02 — Restartfeste Adoption-Wahrheit:** In-Memory-Adoption überlebt keinen Server-Restart. **Nur eröffnen**, wenn AUT-59/60-Schärfung das nicht abdeckt.
3. **G-NEW-03 — WS-Drift-Event bei stale Terminal-Authority:** Sichtbares Operator-Ereignis statt nur Metrik. **Nur eröffnen**, wenn AUT-65-Audit weitere Broadcast-Stellen ohne `correlation_id` findet.

---

## 7) Convergence-Gates (Abnahme Systemniveau)

Ein Zyklus „converged", wenn gleichzeitig gilt:

- FW: `registration_confirmed=true`
- FW: `offline_mode=ONLINE`
- FW: Reconnect-Attempts auf Basisniveau
- Server: Epoch konsistent mit FW
- Server: Adoption completed, `config_pending=false`
- DB: Status `online`, Terminal-Authority final
- Logic: Kein offener Backoff für das ESP
- UI: `ready` sichtbar, kein Config-Timeout-Banner, kein Pending-Order offen
- Safety: Keine Aktoren in „latched offline" ohne expliziten Rule-Grund (AUT-66)

**Zeitbudget:** Kurzer Hiccup ≤ 15 s · Echter Reconnect ≤ 45 s · Reconfigure ≤ 10 s

---

## 8) Best Practices & typische KI-Fehler

**Pflicht:** Contract-First · Minimaldiff in kritischen Pfaden · Single Writer pro State-Feld · Terminalität erzwingen · Negativtests (Queue-Full, Parse-Fail, Cooldown-Race, Reconnect-Burst, Disconnect-während-Aktor-an) · Backpressure statt blindes Retry-Spamming · einheitliche `correlation_id` Envelope↔Payload.

**Typische KI-Fehler (TM verhindert aktiv):** „connected = success"-Fehlannahme · stille Fallbacks statt expliziter Rejections · zusammengelegte Fehlerklassen (`UNKNOWN_ERROR`) · große Cross-Layer-Diffs ohne isolierbare Ursache · fehlende Abhängigkeitsreihenfolge in Linear · **Ticket-Zuordnungsdrift zwischen Briefing und Linear** (siehe §10).

---

## 9) Sofortige TM-Handlungsfolge (aktualisiert auf Sprint-Status 2026-04-17)

1. **Vorbedingung Welle 1:** **AUT-67** freigeben (Telemetrie-Lücke schliessen), damit **AUT-54**-Verify quantitativ möglich wird.
2. **Startblock Welle 1 (parallel, In-Review jetzt mergen):** AUT-54, AUT-55, AUT-63, AUT-65. Start parallel: **AUT-59**, **AUT-66** (keine geteilten Dateien, Parallel-Dispatch zulässig).
3. **Welle 2 (nach Welle-1-Merges):** AUT-56 (*unblocked by* AUT-55), AUT-60 (*unblocked by* AUT-59), AUT-57, AUT-61, AUT-64 (*unblocked by* AUT-65).
4. **Welle 3 (Safety-/Observability-Härtung + Soak):** AUT-62, AUT-58; 4 h-Dauerlauf + Postmortem.
5. **G-NEW-01..03:** Nur öffnen, wenn Welle 2/3 Restlücke bestätigt.
6. **TM-Checkliste nach jeder Welle:** Gate-Kriterien aus §7 prüfen; bei Red Flag auf Steuerdatei `STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md` eskalieren.

---

## 10) Changelog gegenüber `TM-OPERATIVES-BRIEFING-2026-04-17.md`

Das Vorbriefing enthielt eine verschobene Ticket-Zuordnung, vermutlich aus einem Entwurf vor der endgültigen AUT-Nummernvergabe im Linear. Korrigiert:

| Punkt | Vorbriefing (falsch) | Korrigiert |
|---|---|---|
| WS-2 | „AUT-55, AUT-60 (Teil), AUT-61" — AUT-60 ist Server-Logic, nicht Firmware-Queue. | WS-2 = AUT-55/57/56 (Publish-Pfad Firmware); AUT-60 verschoben in WS-3. |
| WS-3 | „AUT-56, AUT-63, AUT-59" — AUT-56 ist Lifecycle-Publish (Publish-Pfad), AUT-63 ist Emergency-Casing. | WS-3 = AUT-59/60 (Readiness + Logic-Gate); AUT-56 zu WS-2; AUT-63 zu WS-4. |
| WS-4 | „AUT-57, AUT-62, AUT-65" — AUT-57 ist Publish-Retry, AUT-62 ist Emergency-Safety. | WS-4 = AUT-63/65/58 (Contract + Observability); AUT-57 zu WS-2; AUT-62 zu WS-5. |
| WS-5 | „AUT-64, AUT-66" — AUT-64 ist FE UX, keine Safety. | WS-5 = AUT-66/62 (Safety/Emergency echt); AUT-64 separat WS-6. |
| WS-6 | „AUT-58" — AUT-58 ist Heartbeat-Degradation, keine UX. | WS-6 = AUT-64 (Frontend UX); AUT-58 zu WS-4 (Observability). |
| §5 AUT-57 | „Cooldown in stabiler Persistenz" | Korrektes Thema: `safePublish`-Retry-Loop mit Backoff/Jitter. |
| §5 AUT-58 | Fehlte komplett (13/14). | Ergänzt: Heartbeat `payload_degraded` + `degraded_fields`. |
| §5 AUT-60 | „Backpressure aus payload_degraded" | Korrektes Thema: Logic-Engine Readiness-Gate (`is_online && !config_pending`). |
| §5 AUT-62 | „LWT/Config-Response Roundtrip" | Korrektes Thema: Emergency-Pfad fail-closed als Prod-Default. |
| §5 AUT-63 | „Logic-Gate = is_online && adoption_completed && readiness_ok" | Korrektes Thema: Broadcast-Emergency Casing + Input-Guard (3016). |
| §5 AUT-64 | „Emergency-Contract casing normalisieren" | Korrektes Thema: Frontend Pending-UX, blocked by AUT-65. |
| §5 AUT-66 | „Nur Regressionshärtung, funktional bereits korrigiert" — **schwerer Fehler**. | Korrektes Thema: NEUE P0-Story 17.04., Aktor-Latch bei Disconnect, `fail_safe_on_disconnect`-Policy; nicht gelöst. |
| §9 Reihenfolge | AUT-67 nicht als Vorbedingung markiert. | AUT-67 explizit als Vorbedingung für AUT-54-Verify in Welle 1. |
| §9 Reihenfolge | AUT-64 „sofort als P0-Hygiene" | AUT-64 ist P1 High und *blocked by* AUT-65 → Welle 2. AUT-63 ist der P0-Casing-Hygienefix. |

---

*Diese korrigierte Fassung ist die operative Referenz für Sprint W17..W19. Die Vorversion bleibt als Audit-Spur erhalten, sollte aber nicht mehr als Umsetzungsgrundlage dienen.*
