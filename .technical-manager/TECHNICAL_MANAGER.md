# Technical Manager — Session-Router

> **Letzte Aktualisierung:** 2026-04-20 (Audit-Pass nach AUT-69 Live-Verify — 2 Follow-up-Issues AUT-71/AUT-72)
> **Aktiver Analyseauftrag:** MQTT-Transport & Recovery Hardening (INC EA5484) — **18 Issues** (14 bestand + AUT-69 SESSION_EPOCH H7 + AUT-70 NTP-Doku + AUT-71 FE-Wiring + AUT-72 Memory-Leak)
> **Sprint:** Flow-Modus W17..W19/2026 bis INC durch — ~20 SP/Woche parallel
> **Sprint-Plan:** `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/SPRINT-PLAN-2026-04-17.md` (W17 noch nicht vollständig dispatched — siehe Delta 20.04.)

---

## Aktuelle Prioritaeten

| # | Thema | Status | Linear-Projekt | Naechster Schritt |
|---|-------|--------|----------------|-------------------|
| 1 | **MQTT-Transport & Recovery Hardening (INC EA5484)** | **18 Issues, 3x In Review, 15x Backlog; AUT-69 Firmware+Server live-verified, Audit zeigt 2 Lücken** | MQTT-Transport & Recovery Hardening (INC EA5484) | **AUT-72 (Memory-Leak) + AUT-71 (FE-Wiring) sind die zwei Follow-ups aus dem AUT-69-Audit; W1c/W2c einplanen** |
| 2 | Bodenfeuchte-Kalibrierung W16 | 6 PARTIAL-Pakete offen | Bodenfeuchte-Kalibrierung | Sprint-Pakete abschliessen |
| 3 | Monitor L2 Layout-Fixes | 12 Issues angelegt | Monitor L2 Layout & Sensor-Card Fixes | verify-plan Phase 1 Quick Wins |
| 4 | UI/UX Design-Token & Konsistenz-Audit | 12 Issues (AUT-42 bis AUT-53) | UI/UX Design-Token & Konsistenz-Audit | Phase 1 Quick Wins: AUT-42, AUT-44 |
| 5 | Sensor-Lifecycle-Vereinheitlichung | 7 Issues angelegt | Sensor-Lifecycle-Vereinheitlichung | Wartet auf W16-Abschluss |
| 6 | pH/EC Fertigation Datenpfad | Backlog | pH/EC Fertigation Datenpfad | Wartet auf W16-Abschluss |

---

## Offene Epics (Linear)

- **AUT-54 bis AUT-72:** MQTT-Transport & Recovery Hardening — INC EA5484 (**18 Issues**, 4 RC-Cluster, ~52 SP)
  - **P0 Urgent (23 SP):** AUT-54 (Transport/TLS, In Review), AUT-55 (Outbox, In Review, blockt AUT-56), AUT-56 (Lifecycle-Publish), AUT-59 (Pending-Exit-Blockade, In Review — Boot 20.04. konsistent), AUT-63 (Broadcast-Emergency 3016, In Review), AUT-66 (Aktor-Latch Offline-Rules), **AUT-69 (SESSION_EPOCH Reconnect-Ordering H7, Firmware+Server live-verified 20.04., In Review)**
  - **P1 High (19 SP):** AUT-57 (SafePublish-Retry), AUT-60 (Cross-ESP Readiness-Gate, blocked by AUT-59), AUT-61 (Approval-Dedup), AUT-64 (Frontend Config-Timeout UX), AUT-65 (WS-Korrelation), AUT-67 (Write-Timeouts-Telemetrie H5 — **DoD grün 20.04., bereit für DONE**), **AUT-71 (FE-Wiring AUT-69, NEU 20.04., 2 SP, parent=AUT-69)**, **AUT-72 (Server Memory-Leak Fix, NEU 20.04., 2 SP, parent=AUT-69)**
  - **P2 Medium (6 SP):** AUT-58 (Heartbeat-Degradation), AUT-62 (Emergency Fail-Closed), AUT-68 (Heartbeat-Slimming H6, Phase 1 teilweise per PKG-17 geflasht — **Cache-Scan + Delta-Counter offen**)
  - **P3 Medium (1 SP):** AUT-70 (NTP-Boot-Entblockung Doku + Telemetrie)
  - **Wellen (erneut sortiert 20.04. nach AUT-69-Audit):** W1b ✅ **AUT-69 live-verified** → W1c = **AUT-72 (Memory-Leak-Fix, P1, vor 4-h-Dauerlauf)** → W2b = AUT-68 Phase 1 finalisieren (Cache-Scan) → W2c = **AUT-71 (FE-Wiring, P1, parallel zu W2b möglich)** → W3b = 4h-Dauerlauf, AUT-54 verifizieren, AUT-67 → DONE
  - **Agenten:** `mqtt-dev`, `esp32-dev`, `server-dev`, `frontend-dev` (Cross-Layer)
  - **Workflow:** auto-debugger Steuerdatei (`.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`), Arbeitsbranch `auto-debugger/work`, `verify-plan`-Gate offen für AUT-69 (B-SESS-01..05)
  - **Basis:** RUN-FORENSIK-REPORT (2026-04-17) + Live-Stresstest COM4 13:36 + **Live-Serial 2026-04-20 (Boot nach PKG-17 Teil-Flash)** + Code-Verifikation (command_admission:26-52, main.cpp:473-495, config_manager:1291-1324, actuators.py:1027, logic_engine.py:1098, websocket/manager.py:225-233)
  - **Live-Evidence 2026-04-20 (NEU):**
    - PKG-17 wirkt messbar: `heap_free` bei Disconnect 58-60 kB (vorher < 45 kB), Payload \~700 B (vorher \~1700 B), `write_timeouts=1` **sichtbar** (AUT-67 ✅).
    - **Root-Cause ist gewandert:** `write_timeout_silent` tritt bei **gesundem Heap** auf → H6 (Heap) erklärt nicht mehr den Rest. Neue H7 = SESSION_EPOCH-Ordering beim Reconnect (→ AUT-69).
    - `handover_contract_reject=2` nach Reconnect, danach Adoption & stabil > 5 min.
    - NTP-Boot-Entblockung bestätigt: MQTT start @ 2836 ms, kein Boot-Block (→ AUT-70 Doku-Issue).
    - Actuator-Load konsistent (2 actuators + 2 offline_rules aus NVS) — AUT-59 nicht mehr reproduzierbar, aber Härtung offen.
    - **Offen (Sandbox-Grenze):** Broker-Log `automationone-mqtt` + Alloy-Korrelation im Reconnect-Fenster 20.04. — Docker-CLI **nicht im Claude-Sandbox**, benötigt User-Hand.

- **AUT-23 bis AUT-34:** Monitor L2 Layout & Sensor-Card Fixes (12 Issues, 6 Cluster)
  - Phase 1 Quick Wins: AUT-26, AUT-28, AUT-30
  - Phase 2 Strukturell: AUT-23, AUT-24, AUT-27, AUT-29, AUT-31, AUT-32
  - Phase 3 Architektur: AUT-25, AUT-33, AUT-34

- **AUT-35 bis AUT-41:** Sensor-Lifecycle-Vereinheitlichung (7 Issues)

- **AUT-42 bis AUT-53:** UI/UX Design-Token & Konsistenz-Audit (12 Issues, 3 Phasen)
  - **Phase 1 Token-Durchsetzung (P0):** AUT-42 (BaseInput), AUT-44 (Z-Index), AUT-43 (Border-Radius), AUT-45 (Font-Size), AUT-46 (Spacing), AUT-47 (Farben Top-15), AUT-49 (Breakpoints+Grid)
  - **Phase 2 UX-Verbesserungen (P1):** AUT-48 (Farben Rest), AUT-50 (Cross-View), AUT-51 (Empty States), AUT-52 (View-UX-Defekte)
  - **Phase 3 Accessibility (P2):** AUT-53 (Kontrast + Locale)
  - **Gesamt:** 25 Story Points, alle → `frontend-dev`
  - **Abhaengigkeiten:** Phase 1 vor Phase 2; AUT-47 vor AUT-48; AUT-42-49 vor AUT-50-52

---

## Letzte Entscheidungen

| Datum | Entscheidung | Begruendung |
|-------|-------------|-------------|
| 2026-04-20 | **AUT-71 (FE-Wiring) + AUT-72 (Memory-Leak) als AUT-69-Sub-Issues angelegt (parent=AUT-69, related=AUT-58/67/68)** | Audit nach AUT-69 Live-Verify (3× Reconnect, ACK 116/111/114 ms, alle Marker grün) zeigt zwei Lücken, die **nicht** zu AUT-69-Scope gehören, aber durch die Implementierung entstanden sind: (1) **Silent-Drop** der neuen `runtime_telemetry`-Felder im FE (0 Konsumenten in `El Frontend/src/`, Anker `websocket-events.ts:84-99` + `espHealth.ts:6-15/56-73`); (2) **Unbounded Memory-Growth** in Server-Dicts `_last_session_connected_ts_by_esp` + `_handover_epoch_by_esp` (heartbeat_handler.py:96-99, eingeführt mit Commit `4fb1e77b`). Beide bekommen eigene verify-plan-Gates (B-FE-01..04 und B-MEM-01..03). AUT-72 vor 4-h-Dauerlauf W3b ziehen, AUT-71 parallel zu AUT-68 Phase 1. AUT-69 bleibt In Review bis Poetry-Test-Collection-Konflikt geklärt. |
| 2026-04-20 | **AUT-69 (SESSION_EPOCH H7) + AUT-70 (NTP-Doku) angelegt, Delta-Kommentare auf AUT-54/59/67/68** | Live-Serial-Log nach PKG-17 Teil-Flash zeigt Root-Cause-Wanderung: Heap ausreichend (`heap_free ≈ 59 kB` bei Disconnect), trotzdem `write_timeout_silent` + `handover_contract_reject=2` nach Reconnect. Neue Hypothese H7: Session-Ordering-Race. AUT-69 als kleines, cross-layer-Paket (ESP32+Server) formuliert — vor weiterem Heartbeat-Slim (AUT-68) zu ziehen. AUT-70 dokumentiert den sichtbaren NTP-Boot-Fix (< 3 s async) + ergänzt `ntp_boot_wait_ms`-Telemetrie. AUT-67 hat alle DoD-Kriterien grün → Empfehlung auf DONE. AUT-59 nicht mehr reproduzierbar, Härtung aber offen. |
| 2026-04-20 | **Sprint-Neuordnung: W1b AUT-69 zuerst, danach AUT-68 Phase 1 final, dann 4h-Dauerlauf** | Begründung: Funktionstüchtigkeit vor Vollständigkeit. PKG-17 zeigt Wirkung, aber verbleibender Disconnect-Cycle kommt aus Session-Ordering, nicht Heap. Kleinstes Paket, das Reconnect-Reject beseitigt, hat den höchsten Hebel. Prinzip: "ein Paket vollständig über alle Ebenen" (TM-Vorgabe 20.04.). |
| 2026-04-17 | **STATE-ARCHITECTURE-ANALYSIS erstellt** (Cross-Layer-Drift-Vollanalyse) | End-to-End Analyse Firmware↔Broker↔Server↔DB↔Frontend. IST/SOLL je Layer, SSOT je State, Drift-Katalog (D1-D13 mit P0/P1/P2), Präzisierungs-Vorschläge für AUT-54..AUT-67 (keine neuen Issues nötig außer 3 Gap-Tickets G-NEW-01..03). Verifikationsplan mit 12 Konvergenz-Gates + 5 HW-Szenarien S1-S5. Pfad: `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/STATE-ARCHITECTURE-ANALYSIS-2026-04-17.md`. |
| 2026-04-17 | **Sprint-Planung Flow-Modus W17..W19, 3 Wellen á ~20 SP** | Live-Stresstest (COM4 13:36) zeigt reproduzierbares Transport-Bild + Counter-Lücke. AUT-67 (EA-14 Write-Timeouts-Telemetrie H5) neu angelegt als Vorbedingung für AUT-54-Verify. AUT-66 in P0-Wave eingegliedert (Build-Cmd `esp32_dev` korrigiert, Relations AUT-54/62). Delta-Kommentare an AUT-54/55/63/66 mit Gate-Checklisten. |
| 2026-04-17 | /verify-plan Gate absolviert für alle 12 Issues (AUT-54..AUT-65) | TASK-PACKAGES um PKG-05..PKG-14 erweitert, je Issue ein Delta-Block (Bestätigt/Korrekturen/BLOCKER/Ergänzungen) direkt im Linear angehängt. 10 BLOCKER-Codes definiert (B-NET-01, B-TLS-URI-01, B-SERIAL-01, B-ALLOY-01, B-POLICY-DECISION-01, B-OUT-REPRO-01, B-HEAP-BASELINE-01, B-CONTRACT-AUDIT-01, B-TOKEN-GEN-01, B-LIFECYCLE-SCHEMA-01). |
| 2026-04-17 | INC EA5484 als eigenes Projekt (MQTT-Transport & Recovery Hardening) mit 12 Issues | Themenuebergreifend (ESP32 + Server + MQTT + Frontend/WS), eigene Phasenordnung P0/P1/P2, saubere Trennung zu UI/UX und W16-Sprint. Issues 1:1 zu konsolidierter Fehlerliste F-01 bis F-08 / Befunde 1-12. |
| 2026-04-17 | Code-Verifikation vor Issue-Anlage | F-04 korrigiert: `setDeviceApproved` ist bereits idempotent — Fix gehoert zur Call-Site (Heartbeat-ACK-Pfad), nicht zur Funktion. EA-08 entsprechend formuliert. |
| 2026-04-17 | Cross-ESP-Dispatch explizit als eigenes Issue (AUT-60) | `logic_engine.py:1098` prueft nur `is_online`, nicht `config_pending`. Effekt operativ wie Logikfehler, Ursache aber Readiness-Gate. |
| 2026-04-15 | UI/UX Vollaudit: 12 Issues in neuem Projekt statt Erweiterung Monitor L2 | Monitor L2 = view-spezifisch; Audit = system-weit (Token-Adoption). Klare Trennung verhindert Issue-Ueberladung. |
| 2026-04-15 | Farben-Migration in 2 Issues gesplittet (Top-15 + Rest-47) | Anti-KI-Regel: Agent ueberfordern mit 62 Dateien in einem Issue. Top-15 hat ~230 der 351 Stellen. |
| 2026-04-15 | Breakpoints + Grid als ein Issue kombiniert | Logisch zusammenhaengend (Layout-Fundament), beide betreffen Tailwind-Config + CSS Utilities. |
| 2026-04-15 | Layout-Analyse als vollstaendiger Analysepfad (nicht Fast-Track) | Mehrere Schichten betroffen (CSS, Vue, Store, Formatierung), Mock vs. Real Abgrenzung noetig |
| 2026-04-15 | 12 Issues statt 5 grosse | Anti-KI-Regel: lieber 3 kleine Issues als 1 Mega-Issue |
| 2026-04-15 | TM-Workflow-Ueberarbeitung gestartet | 10 Schwachstellen identifiziert, Workflow muss Linear + verify-plan integrieren |

---

## Workflow-Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| TM Workflow (erweitert) | `.claude/reference/TM_WORKFLOW.md` | F1/F2/Fast-Track/auto-debugger + Linear + verify-plan |
| Agent-Uebersicht | `.claude/agents/Readme.md` + `.claude/CLAUDE.md` | 14 Agents + 1 Orchestrator |
| Verifikationskriterien | `.claude/CLAUDE.md` (Tabelle) | Build-Checks pro Schicht |
| Eskalationsmatrix | `.claude/reference/TM_WORKFLOW.md` (Abschnitt Eskalation) | Was tun bei Cross-Layer, Agent-Fehler, Docker-Ausfall |
| Issue-Template | `.claude/reference/TM_WORKFLOW.md` (Abschnitt Issue-Template) | Pflichtfelder fuer Linear-Issues |

---

## Aktiver Kontext (fuer naechste Session)

- **INC EA5484 Sprint aktiv:** 18 Issues (AUT-54 bis AUT-72) in Projekt "MQTT-Transport & Recovery Hardening (INC EA5484)". Sprint-Plan `SPRINT-PLAN-2026-04-17.md` gilt weiter, **Delta 20.04.** = AUT-69/AUT-70 angelegt und AUT-69 live-verified, AUT-71/AUT-72 als AUT-69-Sub-Issues aus Audit-Pass, AUT-67 empfohlen-DONE, AUT-59 "reproduzierbar nicht mehr auslösbar".
- **Nächstes Paket (jetzt ziehen):** **AUT-72 (Server Memory-Leak Fix, P1, W1c)** — in heartbeat_handler.py:96-99 Dicts → `cachetools.TTLCache(maxsize=10_000, ttl=86_400)`. verify-plan-Gate B-MEM-01..03, dann ein Commit `server-dev`, dann pytest + ruff. Grund für Priorität: vor 4-h-Dauerlauf W3b ziehen, damit Memory-Baseline sauber ist.
- **Parallel dazu (W2c):** **AUT-71 (Frontend-Wiring AUT-69, P1)** — TS-Typen in `websocket-events.ts:84-99` erweitern, ViewModel + Normalizer in `espHealth.ts:6-15/56-73`, Badge in HardwareView oder SystemMonitorView. verify-plan-Gate B-FE-01..04. Agent: `frontend-dev`.
- **Danach:** AUT-68 Phase 1 finalisieren (Cache-Scan `static std::string`/`static char[]` in `mqtt_client.cpp` + Heartbeat-Counter Delta-Only), dann AUT-68 Phase 2 (REST-GET gpio_status), dann 4-h Dauerlauf EA5484+6B27C8 → AUT-54 DoD-Check → AUT-67 auf DONE.
- **AUT-69 Close-Out:** Status bleibt **In Review** bis Poetry-Test-Collection-Konflikt (`tests/mqtt/test_heartbeat_handler.py` vs. `tests/integration/test_heartbeat_handler.py`) geklärt ist. Inhaltlich ist Firmware+Server live-verified (3× Reconnect clean, alle Marker) — siehe AUT-69-Kommentar 2026-04-20T05:45Z.
- **In Review (Welle 1 Gate, unverändert):** AUT-54 (Transport), AUT-55 (Outbox), AUT-63 (3016-Contract) — Merge-Checklisten in Sprint-Update-Kommentaren.
- **Start Welle 1 parallel (nachgelagert nach AUT-69):** AUT-59 (Pending-Exit, Härtung — Validation in `send_config` + Readiness-Policy-Erweiterung), AUT-66 (Aktor-Latch, `esp32-dev` + `mqtt-dev`). Keine geteilten Dateien → parallel-dispatch zulässig.
- **Welle 2 Startreihenfolge:** nach AUT-69-Merge → AUT-56/60 (entblockt nach AUT-55/AUT-59-Merge), dann AUT-57/61/64/65 parallel.
- **Offene User-Aktion (Sandbox-Grenze):** Broker-/Alloy-Korrelation für 2026-04-20-Reconnect-Fenster benötigt Docker-Zugriff (Claude-Sandbox hat kein Docker-CLI). Nötig: `docker logs automationone-mqtt --since <UTC>` + Alloy-Pull, Ablage unter `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/logs/`.
- **Evidence-Ablage anstehend:** Serial-Log 2026-04-20 nach `.../incidents/.../logs/device-monitor-260420-<HHMMSS>.log` kopieren (für Nachprüfbarkeit der Delta-Kommentare).
- **Artefakte:** `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/` → **STATE-ARCHITECTURE-ANALYSIS-2026-04-17.md (NEU — Cross-Layer-Vollanalyse)**, SPRINT-PLAN-2026-04-17.md, INCIDENT-LAGEBILD.md (aktualisiert mit Live-Evidence 2026-04-17), RUN-FORENSIK-REPORT-2026-04-17.md, TASK-PACKAGES.md (PKG-01/PKG-04..PKG-14), VERIFY-PLAN-REPORT-2026-04-17-issues.md.
- **Drift-Katalog (NEU):** 13 Drifts in STATE-ARCHITECTURE-ANALYSIS §4. P0: D1 (Reconnect-Counter-Persist), D2 (SafePublish-Drop ohne Lifecycle), D11 (Emergency-Contract). P1: D4 (H5), D5 (Reconnect-Threshold), D6 (HB-Degradation-Backpressure), D7 (Cooldown-Persist), D8 (Handover-Context), D12 (Metrik-Drift). P2: D3-Recovery, D9 (Adoption-Restart), D10 (Terminal-Auth-WS), D13 (Boot-Info-Projektion).
- **Gap-Tickets (Vorschlag, TM-Go offen):** G-NEW-01 (Publish-Queue-Backpressure aus HB-Degradation, P1), G-NEW-02 (StateAdoption Server-Restart-Recovery, P2), G-NEW-03 (WS-Drift-Event bei stale Terminal-Authority, P2). Nur eröffnen nach Freigabe — AUT-54..AUT-67 decken 90 % ab.
- **Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`
- **Naechster Schritt:** `SPECIALIST-PROMPTS.md` je PKG-05..PKG-14 **plus** PKG für EA-13/EA-14 ergänzen → Dispatch Welle 1 auf `auto-debugger/work`.
- **Abhaengigkeiten beachten:** AUT-56 blocked by AUT-55, AUT-60 blocked by AUT-59, AUT-57/AUT-67 related to AUT-54, AUT-64 related to AUT-56+AUT-65, AUT-62/63 related (same cluster, split fix), AUT-66 related to AUT-54+AUT-59+AUT-62.
- **UI/UX Audit** abgeschlossen: 12 Issues (AUT-42 bis AUT-53) in Projekt "UI/UX Design-Token & Konsistenz-Audit"
- **Monitor L2 Analyse** abgeschlossen: 4 Dokumente unter `docs/analysen/frontend/`, 12 Linear-Issues
- **W16 Sprint:** 6 PARTIAL-Pakete (E-P1, E-P2, E-P8, F-P4, F-P7, F-P8) parallel abarbeiten
- **Ueberlappung AUT-28 ↔ AUT-45:** SensorCard font-size in Monitor L2 vs. system-weite Migration — bei AUT-45 pruefen ob AUT-28 bereits gefixt hat

---

## Metriken (ab 2026-04-15)

| Paket | F1-Zyklen | Erster Agent korrekt? | Schaetzung vs. Real |
|-------|-----------|----------------------|---------------------|
| Monitor L2 Layout | 1 (Analyse direkt) | Ja (frontend-dev) | Noch offen |
| UI/UX Token-Audit | 0 (direkt Issues) | Ja (frontend-dev) | 25 SP geschaetzt |
| INC EA5484 MQTT-Hardening | 0 (Forensik + Verifikation) | Multi-Agent (mqtt-dev primaer, esp32-dev + server-dev + frontend-dev) | **48 SP** (16 Issues: 5+3+3+2+2+5+3+2+3+2+3+3+5+2+**3**+**1**) — +3 AUT-69 +1 AUT-70 nach Live-Evidence 20.04. |

---

*Dieses Dokument wird bei jedem Session-Start gelesen und nach jeder Entscheidung aktualisiert.*
