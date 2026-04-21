# INCIDENT-LAGEBILD — INC-2026-04-20-offline-mode-observability-hardening

> **Status:** Analyseauftrag (kein aktiver Produktionsstoerfall). System ist handlungsfaehig und stabil.
> **Erzeugt am:** 2026-04-20 durch auto-debugger.
> **Git-Branch:** Aktuell `auto-debugger/work`, Soll `auto-debugger/work` (konform, siehe Abschnitt 0a).
> **Quelle:** `.claude/auftraege/auto-debugger/inbox/offline-mode-loganalyse-stack-2026-04-20.md`
> **Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-incident-offline-mode-observability-hardening-2026-04-20.md`

---

## 1. Symptom (IST)

**Beobachtung aus 10-Minuten-Loganalyse (letzte 10 Minuten vor 2026-04-20 17:03 UTC):**

- Operator-Wahrnehmung: "Offline-Mode wirkt instabil, State-Sync wirkt verzoegert (5-10s)."
- System-Evidence: Funktional stabil. Offline-Rules, Reconnect, Session-Reconciliation arbeiten
  im Kern korrekt. Zwei Aktor-Status erscheinen in Server/MQTT-Logs meist im **gleichen Sekunden-
  fenster** bei simultanem Trigger. Die gefuehlte 5-10s-Differenz ist damit vorrangig
  **Darstellungs-/Propagationsverhalten** und nicht ein eindeutiger Core-State-Write-Delay.

**Symptomkette (zeitlich korreliert, Sekundenfenster 17:02:40):**

1. Zwei parallele Regel-Trigger auf gleichem Aktor (`ESP_EA5484:14` und `ESP_EA5484:25`).
2. `conflict_manager.py` emittiert `Conflict on ESP_EA5484:14 ... blocked ... (lower priority 50 vs 10)`
   + `Actuator conflict for rule TestTimmsRegen ... first_wins`.
3. Publish-Pfad geraet in Backpressure: `ERROR_TASK_QUEUE_FULL (4062)` aus
   `publish_queue.cpp:159`, `Publish queue full — dropping` aus `publish_queue.cpp:158`.
4. Telemetrie (Heartbeat): `publish_queue_shed_count` 0 -> 1, `publish_queue_drop_count` 0 -> 1,
   `publish_queue_hwm` = 9.
5. **Gleichzeitig**: beide Aktor-Intents vollstaendig `accepted` -> `applied`, beide Aktor-
   Responses (`GPIO14`, `GPIO25`) sauber publiziert.
6. Server schreibt `Error event saved ... error_code=4062`, DB-Row als `mqtt_error`.

**Zusatz-Evidence (gleiches Fenster):**

- Config-Pfad aktiv: `Config gebaut und publiziert (2 offline_rules)` um 17:00:38,
  `flow=config outcome=accepted` + `outcome=persisted` um 17:00:39,
  `Skipping stale config_response due to terminal authority guard` um 17:00:39.
- Reconnect-/Reconciliation sauber: `reconciliation_session_start ... pending=1` ->
  `reconciliation_session_end ... replayed=1 failed=0`.
- Heartbeat stabil: `wifi_connected=true`, `mqtt_connected=true`,
  `network_degraded=false`, `runtime_state_degraded=false`.
- Mosquitto healthcheck-Disconnects alle 30s (erwartet, Healthcheck-Client trennt aktiv).
- Alloy-Docker-Socket-Reset transient bei Container-Neustart.
- Mosquitto-Startlog empfiehlt `message_size_limit` -> `max_packet_size`.

---

## 2. Zeitraum & IDs

| Feld | Wert |
|------|------|
| Zeitraum | 2026-04-20 16:53 — 17:03 UTC (letzte 10 Minuten vor Ziehung) |
| esp_id | `ESP_EA5484` (MAC EA:54:84) |
| Betroffene GPIOs | 14, 25 |
| Regel-IDs | `TestTimmsRegen` (sichtbar im Server-Log) |
| Fehlercode | `4062` (`ERROR_TASK_QUEUE_FULL`, Firmware) — Mapping: `FreeRTOS Task-Queue voll` |
| Topic-Beispiele | `system/error`, Heartbeat-Topic, Actuator-Response-Topic |
| Request-/Correlation-IDs | NICHT durchgehend in den Zitaten vorhanden — siehe CORRELATION-MAP.md |

---

## 3. Betroffene Schichten

| Schicht | Komponenten (Pfad) | Rolle im Problem |
|---------|---------------------|-------------------|
| El Trabajante (ESP32) | `src/tasks/publish_queue.cpp`, `src/services/communication/mqtt_client.cpp`, Heartbeat-Payload | Erzeugt `4062` + Telemetrie-Felder `publish_queue_fill/hwm/shed/drop` |
| El Servador (Server) | `src/mqtt/handlers/config_handler.py`, `src/services/logic/safety/conflict_manager.py`, `src/services/device_response_contract.py`, `src/core/esp32_error_mapping.py` | Terminal-Authority-Guard, Konflikt-Arbitration, Correlation-Canonicalisierung, 4062-Mapping |
| El Frontend (Vue 3) | `src/shared/stores/actuator.store.ts` (handleConfigResponse, notifyContractIssue) | Cross-Layer-Kante Config-correlation Finalisierung |
| MQTT-Broker (Mosquitto) | `automationone-mqtt` Container-Config | Healthcheck-Signal-Rauschen, `max_packet_size` Drift |
| Monitoring | Loki / Grafana / Alloy | Alert-Queries mit `ERROR`-Muster als Signal-Rauschen, Docker-Socket-Reset transient |

---

## 4. Hypothesen (priorisiert)

| # | Hypothese | Priotitaet | Stuetzende Evidence | Widerlegende Evidence |
|---|-----------|-----------|----------------------|------------------------|
| H1 | Signalqualitaet der Logs: Normalpfad (stale-Guard, Arbitration, Healthcheck) nicht als erwartbar markiert -> falsche Alarm-Wahrnehmung im Betrieb. | hoch | `Skipping stale ...` + `Conflict on ...` in Logs, Mosquitto-healthcheck-Disconnects alle 30s, Grafana-Queries mit `ERROR`-Muster | keine — Normalfall ist bestaetigt, nur semantisch nicht markiert |
| H2 | Publish-Pfad unter Burst-Druck: Queue-Fuellstand, HWM, shed/drop als zusammenhaengende Betriebszustands-Evidenz fehlt; 4062-Event isoliert. | hoch | Heartbeat-Telemetrie zeigt `hwm=9`, `shed=1`, `drop=1`; System publiziert weiter | keine — nicht als Hard-Fail beobachtet |
| H3 | Cross-Layer-Korrelationsbruch Server<->Frontend: `handleConfigResponse` ohne matchbare `correlation_id` -> `notifyContractIssue` / Timeout-Pfad, waehrend Server terminal-guarded. | mittel | `device_response_contract.py:141-154` fallback `request_id` bzw. synthetic `missing-corr:cfg:...`; `actuator.store.ts:881-894` erwartet matchbaren Korrelationsschluessel | nicht direkt im 10-Min-Fenster beobachtet, aber Contract-Pfad ist strukturell vorhanden |
| H4 | Error-Semantik 4062 unterdifferenziert: Firmware-Signal kommt aus Publish-Queue-Druck (`publish_queue.cpp`), Server-Mapping generisch `FreeRTOS Task-Queue voll`. | mittel | `esp32_error_mapping.py:1613-1626` vs. `publish_queue.cpp:102-104,157-159` | — |
| H5 | Broker-Konfig-Drift (`message_size_limit` -> `max_packet_size`): Technical Debt, aktuell kein Betriebseffekt. | niedrig | Mosquitto-Startlog-Hinweis | keine Auswirkung auf Payload im 10-Min-Fenster gemessen |

---

## 5. Abgrenzung gegen bestehende Incident-Projekte

- **INC-2026-04-11-ea5484-mqtt-transport-keepalive (AUT-54..AUT-72):** Adressiert TLS/Keepalive,
  SESSION_EPOCH-Ordering, SafePublish-Retry, Memory-Leak in heartbeat_handler. **Nicht** dieser
  Scope. AUT-67 (Write-Timeouts-Telemetrie H5) liefert Nachbarsicht auf ESP-Publish-Pfad, aber
  kein Queue-Pressure-Kontext.
- **INC-2026-04-10-esp32-mqtt-tls-errtrak-6014:** Adressiert Error-Mapping Baseline fuer
  3014/6014/UNKNOWN. Dieser Lauf setzt bei **4062** an (Publish-Queue statt TLS-Transport).
- **Keine Doppelarbeit** an AUT-54/55/59/63/66/69 — diese PKGs behandeln Transport, nicht
  Queue-Druck-Observability oder Config-Correlation-UI-Finalisierung.

---

## 6. Scope & Nicht-Ziele

**Scope:**

- Observability-Verbesserungen (Log-Klassifizierung, Telemetrie-Felder, UI-Badges).
- Additive Payload-Felder auf bestehenden MQTT-Topics (keine Breaking Changes).
- Frontend-Finalisierung bei contract_issue (kein State-Refactor).
- Error-Mapping-Verfeinerung fuer 4062 (Firmware-Signal-Zuordnung).
- Broker-Konfig-Drift-Dokumentation (`max_packet_size`).

**Nicht-Ziele (explizit):**

- Kein Eingriff in Konflikt-Arbitration-Logik (ist korrekt deterministisch).
- Keine Aenderung an Reconnect/Session-Reconciliation (ist stabil).
- Keine MQTT-Topic/QoS-Brueche.
- Keine Alembic-Migration (Schema-Drift ausserhalb dieses Laufs).
- Keine Playwright/E2E-Einfuehrung (Roadmap-Phase, nicht dieser INC).
- Keine Implementierung durch auto-debugger; Dev-Agenten setzen nach Gate 2 um.

---

## 7. Offene Fragen

1. **Latenzmarker-Granularitaet:** Reicht eine Kette `command -> applied -> published -> rendered`
   auf Telemetrie-Ebene, oder wird eine UI-Badge (Monitor L2 oder HardwareView L2) gewuenscht?
   (Entscheidung im PKG-03.)
2. **Contract-Issue-Finalisierung (FE):** Soll `handleConfigResponse` bei `contract_issue` ohne
   Match **automatisch** terminal-finalisieren (mit Guard-Hinweis in UI), oder nur
   Time-to-Finalize-Metrik erhoehen?
   (Entscheidung im PKG-04.)
3. **Broker max_packet_size:** Migrationsstrategie separates Infra-PKG oder Patch in diesem Lauf?
   (PKG-08 Konfig-only, kein Code.)
4. **User-Aktionen (Sandbox-Grenze):** Loki-/Grafana-Query-Anpassung fuer Healthcheck-Filter
   ausserhalb Claude-Sandbox; notiert als BLOCKER im VERIFY-PLAN-REPORT.

---

## 8. Eingebrachte Erkenntnisse (zeitlich, append-only)

| Zeit (UTC) | Phase | Erkenntnis |
|------------|-------|------------|
| 2026-04-20 17:xx | Steuerdatei validiert | Alle Pflichtfelder gesetzt, incident_id konsistent, forbidden-Klausel adressiert Breaking-Changes expliziet. |
| 2026-04-20 17:xx | Code-Anker vor-verifiziert | Alle im Bericht genannten Pfade existieren und die zitierten Zeilen sind korrekt (siehe VERIFY-PLAN-REPORT Abschnitt A). |
| 2026-04-20 17:xx | Git-Branch | Working Tree ist bereits auf `auto-debugger/work` — kein Checkout noetig. |
| 2026-04-20 18:xx | Post-Verify-Mutation | TASK-PACKAGES auf Split-Struktur PKG-01a/01b und PKG-04a/04b finalisiert; Gate-1-Deltas vollstaendig uebernommen. |
| 2026-04-20 18:xx | Gate 2 abgeschlossen | VERIFY-PLAN-REPORT-ROUND2 erstellt (PASS) und SPECIALIST-PROMPTS rollenweise konsolidiert (`server-dev`, `esp32-dev`, `frontend-dev`, `mqtt-dev`). |

---

## 9. Dateien in diesem Incident-Ordner

| Datei | Inhalt |
|-------|--------|
| `INCIDENT-LAGEBILD.md` | Dieses Dokument |
| `CORRELATION-MAP.md` | Feld-bewusste Zeitleiste und Korrelations-Tabellen |
| `TASK-PACKAGES.md` | Nummerierte Pakete (Initial -> Post-Verify mutiert) |
| `SPECIALIST-PROMPTS.md` | Initial nach Bereich -> Rollenweise konsolidiert nach Gate 2 |
| `VERIFY-PLAN-REPORT.md` | Gate 1: Plan<->Code-Abweichungen, BLOCKER |
| `VERIFY-PLAN-REPORT-ROUND2.md` | Gate 2: Konvergenz nach Mutation (User-Anforderung) |
| `logs/` | Evidence-Ablage (Serial-Logs, Heartbeat-Dumps) — leer zu Laufbeginn |
