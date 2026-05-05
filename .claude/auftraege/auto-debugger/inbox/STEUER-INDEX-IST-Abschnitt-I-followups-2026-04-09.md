---
# Index — keine eigenständige Steuerdatei für auto-debugger (nur Navigation)
run_mode: artefact_improvement
incident_id: ""
run_id: index-ist-i-followups-2026-04-09
order: incident_first
target_docs:
  - .claude/auftraege/auto-debugger/inbox/STEUER-INDEX-IST-Abschnitt-I-followups-2026-04-09.md
scope: |
  Navigationsindex für die Einzel-STEUER unter derselben inbox/. Nicht als auto-debugger-Start verwenden —
  stattdessen jeweils die konkrete STEUER-IST-I*.md oder STEUER-ops-*.md referenzieren.
forbidden: |
  Nicht mit auto-debugger als vollwertige Steuerdatei starten — Pflichtfelder und scope gelten nur für die Einzel-STEUER-Dateien.
done_criteria: |
  Nutzer hat Tabelle unten gelesen und wählt die nächste STEUER-Datei explizit im Chat.
---

# Index: Follow-ups IST § I + STEUER-04 Ops

**Quelle:** `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` Abschnitt **I)**; ergänzt um **STEUER-04** / `TASK-PACKAGES` PKG-01.

**Git:** Alle Repo-Änderungen nur auf Branch **`auto-debugger/work`**.

## Empfohlene Abarbeitungsreihenfolge

| Nr | Datei (inbox) | Kurzinhalt | Zuerst |
|----|----------------|------------|--------|
| 0 | `STEUER-ops-PKG01-dockerlog-devops-2026-04-09.md` | Menschliche Ops-Checks (Alloy/Grafana Klasse B) | Optional parallel |
| 1 | `STEUER-IST-I01-correlation-playbook-2026-04-09.md` | Doku „Correlation ID Playbook“ | Früh (kein Code) |
| 2 | `STEUER-IST-I02-parse-error-correlation-subscriber-2026-04-09.md` | Server: JSON-Parse-Fehler mit synthetischer CID | P0-technisch |
| 3 | `STEUER-IST-I03-traceparent-rest-optional-2026-04-09.md` | Server: optional traceparent | Nach I02 oder parallel |
| 4 | `STEUER-IST-I04-firmware-serial-sequence-doc-2026-04-09.md` | Firmware-Doku Serial | Parallel |
| 5 | `STEUER-IST-I05-frontend-ws-rest-debug-2026-04-09.md` | Frontend Dev-Panel Request-ID | Parallel |
| 6 | `STEUER-IST-I06-alloy-correlation-metadata-2026-04-09.md` | Alloy + ggf. Log-Pipeline | Abhängig von Logging-Strategie |
| 7 | `STEUER-IST-I07-grafana-panels-mqtt-ws-metrics-2026-04-09.md` | Grafana Dashboards/Panels | Nach Metriknamen-Verifikation |
| 8 | `STEUER-IST-I08-failure-class-pilot-2026-04-09.md` | Server: failure_class Pilot | Später / klein |

## Agenten-Legende (Kurz)

| Agent / Skill | Rolle |
|----------------|--------|
| **auto-debugger** | Orchestrierung: TASK-PACKAGES, SPECIALIST-PROMPTS, Gate-Koordination |
| **verify-plan** | Skill: Reality-Check vor Implementierung |
| **server-dev** | Python/FastAPI/MQTT-Handler |
| **frontend-dev** | Vue 3 / Pinia / UI |
| **esp32-dev** | Firmware-Doku, Verweise auf C++-Pfade |
| **system-control** | Docker/Compose-Briefing (kein Produktcode) |
| **updatedocs** | Reine Doku-Pflege nach Vorgabe |
