---
run_mode: incident
incident_id: INC-2026-04-11-ea5484-mqtt-transport-keepalive
run_id: standby-disconnect-loop-fix-ea5484-2026-04-20
order: incident_first
target_docs:
  - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/standby-disconnect-loop-2026-04-20/BERICHT-standby-disconnect-loop-2026-04-20.md
  - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/standby-disconnect-loop-2026-04-20/EVIDENZ-loki-alloy-queries.txt
  - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/INCIDENT-LAGEBILD.md
  - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/CORRELATION-MAP.md
  - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/TASK-PACKAGES.md
  - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/SPECIALIST-PROMPTS.md
scope: |
  ZIEL:
  Vollstaendige Incident-Weiterfuehrung fuer "Laptop Standby -> MQTT Disconnect Loop" bei ESP_EA5484
  inkl. exakter Analyse, verify-plan Gate und anschliessender Umsetzung ueber die richtigen Dev-Agenten.

  STARTARTEFAKT (bereits vorhanden):
  - Bericht: .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/standby-disconnect-loop-2026-04-20/BERICHT-standby-disconnect-loop-2026-04-20.md
  - Loki/Alloy Evidenz: .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/standby-disconnect-loop-2026-04-20/EVIDENZ-loki-alloy-queries.txt
  - Screenshots im gleichen Ordner (ui-01..ui-05, alloy-01-home.png)

  PHASE 0 (PFLICHT):
  - Branch pruefen/setzen: auto-debugger/work.
  - In INCIDENT-LAGEBILD.md Abschnitt "Eingebrachte Erkenntnisse" mit Timestamp ergaenzen:
    Standby-Loop Befund inkl. Verweis auf neuen Unterordner.

  PHASE 1 - VERTIEFTE ANALYSE (ORCHESTRIEREN, KEIN PRODUKTCODE):
  1) mqtt-debug:
     - Korrelation "ESP Write-Timeout -> Disconnect -> Reconnect -> ggf. Broker-Restart" verdichten.
     - Broker-Restarts ursachenseitig einordnen (Container churn vs. primar broker fault).
     - Referenzdateien:
       - El Trabajante/logs/device-monitor-260420-073715.log
       - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/logs/broker-2026-04-20T053720Z-053825Z-clean.log
       - .claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/logs/server-2026-04-20T053720Z-053840Z-clean.log
       - docker/alloy/config.alloy
  2) esp32-debug:
     - Klassifikation der Fehlerpfade fuer ESP_EA5484:
       write_timeout_silent, write_timeout(errno=11), tls_timeout, CB OPEN.
     - Heap-/max_alloc Verlauf gegen Disconnect-Events legen.
     - Code-Pfade benennen:
       - El Trabajante/src/services/communication/mqtt_client.cpp
       - El Trabajante/src/tasks/publish_queue.h
  3) frontend-debug:
     - UI/UX-Impact verifizieren:
       TopBar "Server verbunden" vs. device flapping,
       Monitor/SystemMonitor Darstellung,
       MQTT-Traffic Tab (Counter hoch, live leer).
     - Code-Pfade:
       - El Frontend/src/shared/design/layout/TopBar.vue
       - El Frontend/src/views/MonitorView.vue
       - El Frontend/src/composables/monitorConnectivity.ts
       - El Frontend/src/views/SystemMonitorView.vue
       - El Frontend/src/stores/esp.ts
  4) server-debug:
     - LWT/Heartbeat Timeout Folgekette pruefen (esp_health offline, stale sensor alerts, ack timeout).
     - Code-Pfade:
       - El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py
       - El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py
       - El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py

  PHASE 2 - INCIDENT ARTEFAKTE AKTUALISIEREN:
  - CORRELATION-MAP.md aktualisieren mit sauberer Kette:
    Notification/HTTP/esp_id-Zeitfenster/MQTT/Titel (Pflichtreihenfolge aus Skill).
  - TASK-PACKAGES.md erweitern um neue Pakete fuer echten Fix:
    PKG-A (esp32-dev), PKG-B (mqtt-dev oder server-dev falls broker/config noetig),
    PKG-C (frontend-dev observability/flapping UX),
    PKG-D (tests + runtime verify).
  - SPECIALIST-PROMPTS.md rollenweise neu aufbauen (copy/paste-fertig, ohne Ueberschneidung).

  PHASE 3 - VERIFY-PLAN GATE (PFLICHT VOR IMPLEMENTIERUNG):
  - verify-plan anwenden auf alle neuen/angepassten PKGs.
  - Chat-Block "OUTPUT FUER ORCHESTRATOR (auto-debugger)" zwingend.
  - VERIFY-PLAN-REPORT.md im Incident-Ordner aktualisieren.
  - Danach TASK-PACKAGES.md mutieren (Delta uebernehmen), dann SPECIALIST-PROMPTS.md je Rolle synchronisieren.

  PHASE 4 - UMSETZUNG (NACH GATE, UEBER DEV-AGENTEN):
  - Richtige Agenten mit Reihenfolge und Abhaengigkeiten:
    1) esp32-dev (primaerer Root-Cause Fix in MQTT/Heartbeat/Payload/Retry/CB-Pfad)
    2) mqtt-dev und/oder server-dev (nur wenn verify-plan Broker/Server-seitige Mitursache bestaetigt)
    3) frontend-dev (Flapping-Transparenz im UI)
    4) test-log-analyst fuer Ergebnispruefung aus Test-/Lauf-Logs
  - Orchestrator implementiert selbst keinen Produktcode in der Post-Verify Planmutation,
    sondern delegiert explizit an Dev-Agenten.

  PHASE 5 - LIVE-ABNAHME (HARDWARE/OPS):
  - Reproduktionslauf "Standby -> Resume" durchfuehren.
  - 10 Minuten Beobachtungsfenster fuer ESP_EA5484.
  - Neue Evidenzdatei unter Incident/logs ablegen + Lagebild aktualisieren.

forbidden: |
  - Kein git push, kein force, kein reset --hard, kein Commit auf master.
  - Keine Secrets (.env, Tokens, Credentials) in Reports/Prompts.
  - Keine Breaking Changes an MQTT Topic-Struktur ohne explizite Verify-Freigabe.
  - Keine Root-Cause Vermischung ISA-18.2 Notification-Flow vs. WS error_event ohne Evidence.
  - Keine Produktimplementierung durch auto-debugger waehrend TASK-/PROMPT-Mutation (nur Artefaktarbeit).
  - Keine stillen Scope-Erweiterungen ausserhalb der unten referenzierten Pfade.

done_criteria: |
  ARTEFAKTE:
  1) INCIDENT-LAGEBILD.md enthaelt neuen Zeitstempel-Abschnitt zum Standby-Loop inkl. finaler Root-Cause-Bewertung.
  2) CORRELATION-MAP.md zeigt die belastbare End-to-End Kette mit Datei-/Logbelegen.
  3) TASK-PACKAGES.md enthaelt umsetzbare PKGs mit Owner, Risiken, Tests, Akzeptanzkriterien und Branch-Pflicht.
  4) SPECIALIST-PROMPTS.md ist rollenweise (esp32-dev/server-dev/mqtt-dev/frontend-dev/test-log-analyst) konkret und konfliktfrei.
  5) VERIFY-PLAN-REPORT.md enthaelt Ergebnis + Delta und ist in TASK-PACKAGES.md uebernommen.

  UMSETZUNG/VERIFIKATION:
  6) Dev-Agenten haben den Fix implementiert (nicht nur geplant), inkl. Build/Test artefakten.
  7) Laufzeitkriterien fuer ESP_EA5484 im 10-Min-Resume-Fenster:
     - 0x CircuitBreaker OPEN (MQTT)
     - 0x erneuter write_timeout->disconnect loop
     - kein repetitives LWT-Flapping im gleichen Muster wie zuvor
  8) UI/UX zeigt den Zustand nachvollziehbar:
     - flapping/instabiler Zustand sichtbar (nicht nur global "Server verbunden")
     - Monitor/SystemMonitor/MQTT-Traffic fuer Operator eindeutig interpretierbar.

  ABSCHLUSS:
  9) Kurze Handover-Zusammenfassung im Chat:
     - welche PKGs umgesetzt wurden
     - welche Agenten was erledigt haben
     - verbleibende BLOCKER/Folgepakete (falls vorhanden).
---

# STEUER - Standby Disconnect Loop (Analyse + Fix) EA5484

## Zweck

Diese Steuerdatei zwingt den auto-debugger zu einem vollstaendigen Lauf:

1. Exakte Analyse auf Basis vorhandener Incident-Evidenz.  
2. Verify-Plan Gate mit belastbarem Delta.  
3. Konkrete Umsetzung des Fixes ueber die richtigen Dev-Agenten.  
4. Runtime-Abnahme im echten Standby/Resume-Szenario.

## Referenzen (muss gelesen werden)

- Incident-Ordnung:
  `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/`
- Neuer forensischer Unterordner:
  `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/standby-disconnect-loop-2026-04-20/`
- Startbericht:
  `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/standby-disconnect-loop-2026-04-20/BERICHT-standby-disconnect-loop-2026-04-20.md`
- Alloy/Loki Belege:
  `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/standby-disconnect-loop-2026-04-20/EVIDENZ-loki-alloy-queries.txt`
- Bestehende Incident-Artefakte:
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/INCIDENT-LAGEBILD.md`
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/CORRELATION-MAP.md`
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/TASK-PACKAGES.md`
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/SPECIALIST-PROMPTS.md`
  - `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/VERIFY-PLAN-REPORT.md`

## Startbefehl

`@.claude/auftraege/auto-debugger/inbox/STEUER-standby-disconnect-loop-fix-ea5484-2026-04-20.md`

## Git-Pflicht

- Arbeitsbranch: `auto-debugger/work`
- Keine Commits auf `master`
- Kein `git push --force`

