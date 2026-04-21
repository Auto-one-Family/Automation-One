---
run_mode: incident
incident_id: INC-2026-04-20-offline-mode-observability-hardening
run_id: ""
order: incident_first
target_docs:
  - .claude/auftraege/auto-debugger/inbox/offline-mode-loganalyse-stack-2026-04-20.md
scope: |
  **Problemcluster:** Signal- und Latenztransparenz im Offline-/Reconnect-Pfad
  um ESP_EA5484 (MAC EA:54:84). Der Kernpfad (Offline-Mode, Reconnect,
  Session-Reconciliation, Config-Publish) arbeitet stabil — aber mehrere
  Observability- und Cross-Layer-Kanten erzeugen "wirkt wie Fehler"-
  Wahrnehmung und verlangsamen Root-Cause-Einordnung.

  **Gesammeltes Wissen (IST-Evidence aus Bericht 2026-04-20, nicht als finale RC verkaufen):**
  - Konflikt-Arbitration auf gleichem Aktor laeuft deterministisch `first_wins`
    (priority 10 vs 50), wird aber im Log als "Conflict on ESP_EA5484:14 ... blocked"
    ohne Hinweis "expected/deterministic" emittiert.
  - Publish-Queue-Backpressure auf ESP-Seite: `error_code=4062`, `"Publish queue full"`,
    `publish_queue_shed_count` 0 -> 1, `publish_queue_drop_count` 0 -> 1,
    `publish_queue_hwm` = 9. Im gleichen Sekundenfenster (17:02:40) laufen beide
    Aktor-Intent-Ketten (`accepted` -> `applied`) und beide Aktor-Responses
    (GPIO14, GPIO25) sauber durch -- System bleibt handlungsfaehig, aber im
    Publish-Pfad unter Burst-Druck statt Hard-Fail.
  - Config-Handler laeuft korrekt mit stale-Guard
    (`Skipping stale config_response due to terminal authority guard`) --
    technisch Idempotenz-Schutz, aber UI-seitig kann `handleConfigResponse`
    ohne matchbare `correlation_id` in `contract_issue`/`timeout` laufen,
    waehrend der Server bereits terminal entschieden hat.
  - Error-Code 4062 wird in `esp32_error_mapping.py:1613-1626` generisch als
    "FreeRTOS Task-Queue voll" gemappt, Firmware-Signal kommt aber konkret aus
    Publish-Queue/Outbox-Druck (`ERROR_TASK_QUEUE_FULL` aus `publish_queue.cpp`).
  - Mosquitto healthcheck-Disconnects (30s-Takt) und Loki-Alertqueries mit
    `ERROR`-Suchmustern werden faelschlich als Servicefehler gelesen.
  - Alloy-Docker-Socket-Reset transient bei Container-Restart.
  - Mosquitto-Startlog empfiehlt `message_size_limit` -> `max_packet_size`
    (Repo-Drift / TODO).

  **Hypothesen (priorisiert, im Lagebild markieren):**
  - H1 (hoch): Signalqualitaet der Logs -- Normalpfad (Guard, Arbitration,
    Healthcheck) nicht als erwartbar markiert -> falsche Alarme im Betrieb.
  - H2 (hoch): Publish-Pfad unter Burst-Druck fehlt Ursache-Wirkung-Kontext
    (Queue-Fuellstand, HWM, shed/drop als zusammenhaengende Betriebszustands-
    Evidenz statt isolierter Error-Events).
  - H3 (mittel): Cross-Layer-Korrelationsbruch Server<->Frontend bei
    config_response ohne matchbare `correlation_id` -> UI-Wahrnehmung
    "kein terminales Ergebnis", Server aber bereits terminal.
  - H4 (mittel): Error-Semantik 4062 Firmware<->Server<->UI
    unterdifferenziert -> verlangsamt Root-Cause-Einordnung.
  - H5 (niedrig): Broker-Konfig-Drift (`max_packet_size`) zeigt Technical
    Debt, aktuell kein Betriebseffekt.

  **Abgrenzung gegen bestehende INC-Projekte:**
  - `INC-2026-04-11-ea5484-mqtt-transport-keepalive` (AUT-54..AUT-72) adressiert
    TLS/Keepalive-Transport, SESSION_EPOCH-Ordering, SafePublish-Retry. **Nicht**
    dieser Scope. Querverweis im Lagebild: AUT-67 (Write-Timeouts-Telemetrie H5)
    liefert Nachbarsicht auf ESP-Publish-Pfad, aber kein Queue-Pressure-Kontext.
  - `INC-2026-04-10-esp32-mqtt-tls-errtrak-6014` adressiert Error-Mapping
    Baseline -- dieser Lauf setzt bei 4062 (nicht 3014/6014) an.

  **Ziel dieses Laufs (Analyseauftrag -> Implementierungsplan):**
  1) Korrelation **nur** mit erlaubten Schluesseln: `esp_id` + Zeitfenster,
     MQTT-Topic-Zeilen, Server-Handler-Logs, WebSocket-Events; HTTP
     `request_id` nur wenn nachgereicht (auto-debugger.md 1.4).
  2) Code-Pfade gegen Repo-Ist abgleichen (alle aus Bericht benannten
     Codebelege). Bereits vor-verifiziert (siehe VERIFY-PLAN-REPORT Abschnitt A).
  3) TASK-PACKAGES so schneiden, dass nach **verify-plan** ein messbarer
     Implementierungsplan entsteht: ein Paket = eine logische Aenderung
     ueber genau die Schichten, die es braucht. Kein Mega-Paket.
  4) **Zwei** `/verify-plan`-Gates (User-Anforderung):
     - **Gate 1**: Initiale TASK-PACKAGES -> VERIFY-PLAN-REPORT.md
     - **Gate 2**: Post-Mutation TASK-PACKAGES -> VERIFY-PLAN-REPORT-ROUND2.md
     Erst nach Gate 2 duerfen Dev-Agenten Code auf `auto-debugger/work` schreiben.

  Ausgabe: vollstaendiger Ordner
  `.claude/reports/current/incidents/INC-2026-04-20-offline-mode-observability-hardening/`
  mit INCIDENT-LAGEBILD, CORRELATION-MAP, TASK-PACKAGES (post-verify),
  SPECIALIST-PROMPTS (rollenweise konsolidiert), VERIFY-PLAN-REPORT,
  VERIFY-PLAN-REPORT-ROUND2. Keine Produkt-Implementierung durch auto-debugger.
forbidden: |
  Keine Secrets (MQTT-URI mit Credentials, Zertifikatsprivatekeys, JWT, .env)
  in Artefakten. Keine Commits auf master; Bash im Agent nur fuer erlaubte
  Git-Branch-Checks laut auto-debugger.md Abschnitt 0a. Keine Implementierung
  aus TASK-PACKAGES ohne beide abgeschlossenen verify-plan-Gates. Kein Vermischen
  ISA-18.2 / NotificationRouter mit WS error_event ohne Evidence (Agent 1.4).
  Kein alembic upgrade/downgrade aus diesem Lauf. Keine MQTT-Topic/QoS-Aenderungen
  die bestehende Kontrakte brechen (nur additive Felder/Labels).
  Kein Frontend-State-Refactor ausserhalb der in PKG genannten Dateien.
done_criteria: |
  - Incident-Ordner mit allen Pflichtdateien existiert und ist konsistent benannt.
  - INCIDENT-LAGEBILD: Symptomkette als korrelierte Zeitleiste,
    Hypothesen H1-H5 mit Stuetz-/Widerleg-Evidence.
  - CORRELATION-MAP: mindestens esp_id-Zeitfenster + MQTT-/Handler-/WS-Zeilen;
    HTTP nur wenn belegt. Cross-Layer-Kante config_response explizit.
  - TASK-PACKAGES: 8+ nummerierte Pakete mit Owner
    (esp32-dev, server-dev, frontend-dev, mqtt-dev), Risiko, Tests,
    Akzeptanzkriterien, Branch-Hinweis auto-debugger/work.
  - VERIFY-PLAN-REPORT.md: Ergebnis Gate 1 (Plan<->Code-Abweichungen,
    Breaking-Change-Checks, BLOCKER-Liste, geschaerfte Auftraege).
  - TASK-PACKAGES post-verify mutiert (Gate-1-Deltas uebernommen).
  - SPECIALIST-PROMPTS rollenweise konsolidiert (ein Block pro Dev-Rolle).
  - VERIFY-PLAN-REPORT-ROUND2.md: Gate 2 bestaetigt Konvergenz (oder BLOCKER).
  - Chat-Uebergabe mit Startrolle, PKG-Reihenfolge, verbleibenden BLOCKERn.
---

# STEUER -- Incident Offline-Mode Observability & Signalqualitaet (INC 2026-04-20)

> **Chat-Start:** `@.claude/auftraege/auto-debugger/inbox/STEUER-incident-offline-mode-observability-hardening-2026-04-20.md`
> **Quelle (Wissensbasis):** `.claude/auftraege/auto-debugger/inbox/offline-mode-loganalyse-stack-2026-04-20.md`
> **Git:** `git checkout auto-debugger/work` vor jeder delegierten Code-Arbeit (Pflicht).
> **Besonderheit:** Zwei verify-plan-Gates (User-Anforderung). Implementierung erst nach Gate 2.

## Problemcluster (kurz)

System ist **nicht instabil**, sondern in produktionsnahem Zustand mit identifizierten
Observability-Luecken unter Last-/Gleichzeitigkeitsbedingungen. Der sichtbare
Problem-Kern ist **Signalqualitaet und Latenztransparenz**, nicht Grundarchitektur.

## Erste Analyse (Vorarbeit fuer auto-debugger)

1. **Kette (17:02:40 Sekundenfenster):** zwei parallele Regel-Trigger -> Konflikt-
   Arbitration (WARN, deterministisch first_wins) -> Publish-Queue-Druck
   (error 4062 + shed/drop-Inkremente) -> beide Aktor-Intents laufen durch ->
   Telemetrie zeigt HWM = 9.
2. **Abgrenzung:** Kein Crash, keine Session-Stoerung, kein Reconnect-Loop.
3. **Code-Anker (Verify):**
   - Server: `services/logic/safety/conflict_manager.py` (29, 241, 249, 252, 262)
   - Server: `mqtt/handlers/config_handler.py` (138, 147, 162, 168)
   - Server: `services/device_response_contract.py` (141-154, 260-263)
   - Server: `core/esp32_error_mapping.py` (1613-1626)
   - Firmware: `tasks/publish_queue.cpp` (13, 14, 102, 104, 133, 157-159)
   - Firmware: `services/communication/mqtt_client.cpp` (637, 638, 1134, 1409)
   - Frontend: `shared/stores/actuator.store.ts` (39, 146-147, 336, 420, 875, 881-901)

## Pflicht-Checks fuer SPECIALIST-PROMPTS (uebernehmen)

1. **server-dev:** Log-Klassifizierung expected_guard / rule_arbitration,
   Error-Semantik 4062-Verfeinerung, Config-correlation canonical path,
   E2E-Latenzmarker-Felder.
2. **esp32-dev:** Event-Klasse `QUEUE_PRESSURE` mit konsistenten Korrelations-
   feldern, `STATE_EMIT` mit `intent_id`/`correlation_id`/`seq`.
3. **mqtt-dev:** Topic-Payload-Vertrag additive Felder (keine Breaking
   Changes), MQTTCommandBridge-Konsistenz.
4. **frontend-dev:** `handleConfigResponse` Fallback-Finalisierung bei
   contract_issue ohne Timeout, Latenz-Badge im HardwareView (oder
   SystemMonitorView).
5. **verify-plan (Skill):** Alle PKG-Pfade und Befehle gegen Repo-Ist pruefen;
   BLOCKER bei fehlender HW-Evidence (Dauerlauf / Stresstest) markieren.
