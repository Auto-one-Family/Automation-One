---
run_mode: artefact_improvement
incident_id: ""
run_id: ea5484-calibration-measure-burst-2026-04-11
order: incident_first
target_docs:
  - docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md
scope: |
  **Problemcluster:** Kalibrierungs- und Mess-**Burst** über UI/API (viele
  `POST /api/v1/sensors/ESP_EA5484/32/measure` in kurzer Zeit) parallel zu Heartbeat,
  Subscriptions und ggf. Config-Push — **indirekte** Belastung des MQTT- und ESP-Pfads.

  **Gesammeltes Wissen (Bericht §2.2, §5, §3.2 #14–16):**
  - Server: Häufung `Sensor command published: measure … GPIO 32`; Kalibrier-Sessions mit
    Finalize/Abort (`User aborted calibration flow`, DELETE Session, neue Session) — **operativ**
    normal, aber **Lastspitze**.
  - Kausal **eher indirekt** zur MQTT-Offline-Kette: Burst erhöht Risiko für verpasste Keepalives
    **nur gemeinsam** mit Transport/H2 — im Artefakt TASK-PACKAGES explizit mit Transport-Incident
    verknüpfen (Schnittstelle: Zeitfenster, keine gemischte request_id ohne Evidence).

  **Ziel dieses Laufs (Analyseauftrag → Implementierungsplan):**
  1) Repo-verifiziert: Welche **Frontend**-Komponenten/Composables lösen `measure` wie oft aus
     (Debounce, Doppelklicks, Wizard-Schritte)? Welche **Server**-Endpoints/Publisher-Pfade
     feuern MQTT commands (Rate-Limit möglich)?
  2) Additiv: BERICHT um **konkrete Code-Fundstellen** ergänzen (Datei + Symbol) **oder**
    Lückenliste wenn noch nicht gelesen.
  3) Wenn Code-Änderung gewünscht: unter `run_id`-Ordner **TASK-PACKAGES.md**,
     **SPECIALIST-PROMPTS.md** erzeugen → **verify-plan** → **VERIFY-PLAN-REPORT.md** → Post-Verify
     Mutation (Skill auto-debugger, Agent §2.1 Schritt 5).

  **Ausgabeort Pakete/Verify:** `.claude/reports/current/auto-debugger-runs/ea5484-calibration-measure-burst-2026-04-11/`

  **Querverweis:** Transport-STEUER `STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`
  — Reihenfolge: erst Transport-Hypothesen schärfen, dann Burst-Entschärfung priorisieren, um
  keine falsche Ein-Ursachen-Story zu erzwingen.
forbidden: |
  Keine Breaking Changes an öffentlichen REST-Kontrakten ohne Versionierungs-PKG und verify-plan.
  Keine Secrets. Kein Commit auf master. Keine MQTT-Topic-Umbenennung ohne separates mqtt-dev-Paket.
  Frontend: keine Emergency-Stop-UI verdecken; Aktor-Confirms unangetastet lassen (Projektregeln).
done_criteria: |
  - Entweder (A) BERICHT additiv um mindestens drei **verifizierte** Repo-Verweise erweitert
    (Frontend measure-Trigger, Server publish-Pfad, API-Route), oder Lückenliste mit BLOCKER
    „Lesen ausstehend“.
  - Wenn Implementierung geplant: `auto-debugger-runs/ea5484-calibration-measure-burst-2026-04-11/`
    enthält TASK-PACKAGES, SPECIALIST-PROMPTS, VERIFY-PLAN-REPORT; Post-Verify Pakete aktualisiert.
  - Mindestens ein PKG mit messbarem Akzeptanzkriterium (z. B. max N measure/s pro GPIO/session
    serverseitig **oder** UI-Debounce — genau eine gewählte Strategie nach Verify, nicht beides
    ohne Abhängigkeitsnotiz).
---

# STEUER — Artefakt: Kalibrierungs-/Measure-Burst und MQTT-Last (EA5484)

> **Chat-Start:** `@.claude/auftraege/auto-debugger/inbox/STEUER-artefact-ea5484-calibration-measure-burst-mqtt-load-2026-04-11.md`  
> **Git:** `git checkout auto-debugger/work` vor Code-Änderungen.

## Problemcluster (kurz)

Die **UI/API erzeugt viele manuelle Messungen** in kurzer Zeit. Das ist **kein Bug per se**, kann
aber den ESP und den Broker unter Last setzen und so **H2** (Client-Blockade) im Transport-Cluster
verstärken.

## Erste Analyse (Vorarbeit)

1. **Messpunkt:** Server-Log „Sensor command published“ Häufung; Operator „abort calibration“ ist
   unkritisch für Stabilität, aber erklärt Session-Wechsel.  
2. **Hebel:** Rate-Limit / Queueing auf Server, sequenzielle Wizard-Schritte im Frontend,
   Backpressure-Feedback an UI — jeweils mit UX- und Safety-Review.  
3. **Nicht-Ziel:** Alle Offline-Ereignisse der Burst allein zuschreiben — nur mit Zeitleiste gegen
   `Writing didn't complete` / Mosquitto timeout.

## Spezialisten-Hinweis

- **frontend-dev / frontend-debug:** Kalibrier-UI, Doppel-Requests, `measure`-API-Aufrufe.  
- **server-dev / server-debug:** Mess-Endpoint, Publisher, ggf. Throttling-Middleware.  
- **verify-plan:** Pfade `src/`-Server, `El Frontend/src/`-Views — gegen TM-Pakete prüfen.
