---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: lifecycle-background-state-crosslayer-debug-2026-04-14
order: incident_first
target_docs:
  - docs/analysen/BERICHT-lifecycle-background-state-handshake-crosslayer-debug-2026-04-14.md
scope: |
  **Problemhypothese (verifizieren, nicht voraussetzen):** Nach Abmeldung oder Entfernen eines Geraets/Sensors
  laufen **Hintergrundprozesse** (Server-Tasks, MQTT-Verarbeitung, WS-Broadcasts, Frontend-Polls/Listener, Firmware-Schleifen)
  teilweise **weiter** oder arbeiten auf **veraltetem Cache-State**, sodass Sensorverarbeitung und **persistierter DB-State**
  oder **UI-State** inkonsistent wirken.

  **Ziel:** Eine **genaue Debugging-Moeglichkeit** konzipieren und dort, wo der Code es zulaesst **minimal integrieren** —
  aufbauend auf **vorhandener Infra** (strukturierte Logs, Loki/Prometheus falls im Betrieb genutzt, Correlation/Request-IDs,
  bestehende Health-/Connectivity-Pfade). Kein neues Observability-Produkt; **Verdichtung und Luecken-Schliessung**
  in Server, DB-Schicht, Frontend und Firmware.

  **Pflichtanalyse — Schichten und Schnittstellen:**

  1) **Server — interne Ablaeufe und State:**
  - Hintergrundtasks: z. B. `El Servador/god_kaiser_server/src/services/logic_engine.py` (Evaluation-Loop Start/Stop,
    Registrierung gegen aktuelle Geraete-/Sensor-Listen),
  - MQTT: `src/mqtt/subscriber.py` (Worker-Pool, Event-Loop-Grenzen, Lifecycle-Topics),
  - Heartbeat / Soft-Delete / Reconnect-Pushes: `src/mqtt/handlers/heartbeat_handler.py` (`asyncio.create_task`,
    Full-State-Push, Auto-Push-Config) — **Konsistenz** mit „Geraet/Sensor nicht mehr aktiv“,
  - Calibration / Session-Lifecycle: `src/services/calibration_service.py` (`_unregister_pending_overwrite`, WS-Broadcasts),
  - Weitere Services mit **periodischen** oder **create_task**-Pfaden per Grep inventarisieren (`asyncio.create_task`,
    `Background`, `while True`, `asyncio.sleep` in `services/`, `mqtt/`).

  2) **Datenbank — Wahrheit vs. Laufzeit:**
  - Welche Tabellen/Flags definieren „Sensor/Geraet existiert / soft-deleted / aus Zone entfernt“?
  - Ob Handler **nur** DB lesen oder auch **In-Memory-Caches** — Abgleich: Was passiert bei DELETE/soft-delete,
    bevor Background-Loop naechste Runde dreht?
  - Transaktionsgrenzen: Race zwischen MQTT-Ingest und API-DELETE dokumentieren (Evidence).

  3) **Frontend — intern vs. extern:**
  - WS- und Poll-Listener: **Cleanup** bei Route-Wechsel und nach Geraet-/Sensor-Entfernung (`onUnmounted`, deaktivierte Views),
  - Events: z. B. `device-delete` aus `El Frontend/src/components/dashboard/ZonePlate.vue` — Kette bis Store/API,
  - Monitor/Dashboard: keine **doppelte** Subscription auf dieselben Topics/REST-Ressourcen nach Entfernen,
  - Fertigation/Kalibrierung: pruefen, ob Widgets nach Entfernen der Sensor-Config noch Requests ausloesen.

  4) **Firmware — Handshake mit Server-State:**
  - MQTT-Verbindung, Registrierungsbestaetigung, Command-Queue: z. B. `El Trabajante/src/services/communication/mqtt_client.cpp`,
    `El Trabajante/src/tasks/sensor_command_queue.cpp` — Verhalten wenn Server **abwiesen** hat oder Config **widerrufen**;
  - Safety-/Core-Grenzen: keine neuen Features; nur **Diagnose-Hooks** oder **klarere Log-Zeilen** (TAG, device_id,
    sequence), sofern Pattern im Repo bereits existiert.

  **Deliverable im Bericht:**
  - **Matrix „Interner Ablauf ↔ externer Befehl/Infostrom“** (mind. 8 Zeilen): z. B. Logic-Engine-Tick, MQTT-Sensor-Ingest,
    WS-KPI-Push, API-DELETE, Heartbeat-Reconnect, Firmware-Sensor-Publish — jeweils: Trigger, Source of Truth (DB vs RAM),
    Stop/Cancel-Bedingung, **fehlende** Stop-Bedingung (P0/P1).
  - **Debugging-Playbook** (1–2 Seiten): konkrete **Loki-/Log-Filter** oder Log-Feldnamen (IST aus Code), Reihenfolge
    der Checks bei „Geraet weg, aber noch Aktivitaet“, inkl. **correlation_id / request_id**-Propagierung wo vorhanden;
    was **noch zu instrumentieren** ist (messbare Liste).
  - **Handshake-Katalog:** Registrierung, Config-Push, ACK, Full-State, Calibration-Session — pro Schritt: erwarteter
    State-UEbergang und wo er **heute** gebrochen werden kann (Evidence).

  **Umsetzung (optional im selben Lauf, nur wenn Evidence klar):**
  Chirurgische Ergaenzungen: strukturierte Logs bei Task-Start/Stop und bei **Skip** („sensor_id nicht in DB, ueberspringe“),
  einheitliche Felder `device_id`, `sensor_config_id`, `correlation_id` in betroffenen Pfaden; Frontend: AbortController
    oder gleichwertiges Pattern nur wo bereits aehnlich genutzt. Firmware: nur wenn Robin-Prioritaet und Pattern vorhanden.

forbidden: |
  Keine Secrets. Keine Breaking Changes an MQTT-Topic-Taxonomie, REST-Contracts oder WS-Event-Namen ohne separates Gate.
  Code-Aenderungen nur auf Branch `auto-debugger/work`; Default-Branch im Checkout explizit pruefen (`master` vs `main`)
  und im Bericht vermerken. Git: kein push, kein force, kein destruktives reset auf geteilten Branches; Bash nur eingeschraenkt
  wie Policy. Keine Pfade ausserhalb Auto-one-Wurzel. Playwright/vue-tsc nur mit ehrlichen Voraussetzungen.

done_criteria: |
  - `docs/analysen/BERICHT-lifecycle-background-state-handshake-crosslayer-debug-2026-04-14.md` existiert und enthaelt:
    (1) Matrix Intern vs. Extern (mind. 8 Zeilen) mit Code-Evidence,
    (2) DB-vs-Runtime-Invarianten und dokumentierte Race-Szenarien,
    (3) Debugging-Playbook (Logs/Infra-Schritte) angepasst an **IST**-Instrumentierung im Repo,
    (4) Handshake-Katalog mit Bruchstellen,
    (5) P0/P1-Massnahmenliste; bei Code-Aenderungen: Run-Ordner
        `.claude/reports/current/auto-debugger-runs/lifecycle-background-state-crosslayer-debug-2026-04-14/` mit
        `FEHLER-REGISTER.md` und Verweis auf TASK-PACKAGES/VERIFY-PLAN-REPORT falls PKGs angefasst.
  - Expliziter Abschnitt „Geraet/Sensor abgemeldet — erwartetes Stopp-Signal pro Schicht“ (SOLL) vs. IST mit Befund.
---

# Steuerlauf — Lifecycle, Hintergrundprozesse, State, Cross-Layer-Debug

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `lifecycle-background-state-crosslayer-debug-2026-04-14`

## Ziel (ein Satz)

Inkonsistenzen zwischen **abgemeldeten/entfernten** Geraeten/Sensoren und **laufender** Hintergrundverarbeitung
systematisch aufdecken und **rueckverfolgbares Debugging** (Server, DB, Frontend, Firmware) mit **minimaler**
Erweiterung der bestehenden Observability-Infra ermoeglichen.

## Runbook (imperativ)

1. **Evidence-Sammlung (Server):** `logic_engine.py`, `heartbeat_handler.py`, `mqtt/subscriber.py`, `calibration_service.py`
   lesen; Grep nach `create_task`, `Background`, soft delete, `get_by_device_id`, Cache-/Singleton-Holder in `services/`.

2. **Evidence-Sammlung (DB):** Modelle/Migrationen fuer ESP/Sensor/soft-delete; alle Queries, die Background-Loops nutzen —
   filtern sie geloeschte IDs?

3. **Evidence-Sammlung (Frontend):** Geraet-/Sensor-Entfernen (ZonePlate, Stores, MonitorView, Dashboard-Widgets,
   Fertigation-Composable): Subscriptions, Intervalle, `watch`-Quellen stoppen?

4. **Evidence-Sammlung (Firmware):** Registrierung, Disconnect, Config-Revocation — Logs und State-Maschine;
   keine grossen Refactors.

5. **Synthese:** Matrix + Playbook + Handshake-Katalog im Ziel-Bericht schreiben.

6. **Fixes:** Nur P0 mit klarem Nachweis; VERIFY-Gate bei Code-PKGs; `FEHLER-REGISTER` fuehren.

## Aktivierung (fuer Robin)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-lifecycle-background-state-crosslayer-debug-2026-04-14.md
Bitte Steuerlauf: Abmeldung/Entfernen vs. Hintergrundprozesse; Matrix intern/extern; Debugging-Playbook; Server/DB/Frontend/Firmware; Evidence zuerst, Fixes chirurgisch auf auto-debugger/work.
```
