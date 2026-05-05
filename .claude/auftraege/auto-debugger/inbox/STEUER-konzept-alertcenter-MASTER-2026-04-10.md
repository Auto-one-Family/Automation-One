---
run_mode: artefact_improvement
incident_id: ""
run_id: konzept-alertcenter-master-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
scope: |
  Index-Lauf für die schrittweise Umsetzung des Konzeptberichts (Alert-Center, E2E, Korrelation,
  zwei Benachrichtigungsketten). Diese Datei definiert nur Reihenfolge und Abhängigkeiten; konkrete
  Arbeit erfolgt in den Teil-STEUER 01–06. Nach jedem abgeschlossenen Teil-Lauf: verify-plan-Gate
  für die zugehörigen TASK-PACKAGES, dann Implementierung nur auf Branch auto-debugger/work.
forbidden: |
  Keine Secrets in Steuerdateien; keine Breaking Changes an öffentlichen REST-/MQTT-/WS-Verträgen ohne
  separates Review-Gate; keine Firmware-Safety-Änderungen ohne HW-Checkliste (Teil-STEUER 06);
  kein Commit auf master im Rahmen auto-debugger-Orchestrierung.
done_criteria: |
  Alle Teil-STEUER 01–06 sind entweder abgearbeitet (done_criteria erfüllt) oder der Grund ist als
  BLOCKER im zugehörigen auto-debugger-runs/<run_id>/VERIFY-PLAN-REPORT.md dokumentiert; MASTER
  dient als Navigationsanker — keine eigene Code-Pflicht.
---

# STEUER — Konzept Alert-Center (MASTER, Reihenfolge)

**Referenz:** `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md` (Roadmap Phasen 1–5, Lücken P0–P2).

**Git:** Branch **`auto-debugger/work`** für alle Produktänderungen aus abgeleiteten Paketen.

## Empfohlene Abarbeitungsreihenfolge

| Nr | Datei | Thema | Bemerkung |
|----|-------|-------|-----------|
| 01 | `STEUER-konzept-alertcenter-01-e2e-flowcatalog-ci-2026-04-10.md` | E2E, Flow-Katalog, CI-Anschluss | baut auf vorhandenen Playwright-Szenarien auf |
| 02 | `STEUER-konzept-alertcenter-02-ui-finality-ack-resolve-2026-04-10.md` | UI-Finalität Ack/Resolve / Toasts | mit IST-Code abgleichen (bereits teils umgesetzt) |
| 03 | `STEUER-konzept-alertcenter-03-server-additive-logging-2026-04-10.md` | Server: additive Log-Felder, Observability | nach 02 sinnvoll, kein harte Blockade |
| 04 | `STEUER-konzept-alertcenter-04-zwei-ketten-operator-doku-2026-04-10.md` | Operator-Runbook: Inbox vs. `error_event` | vorwiegend Dokumentation / IST-Anreicherung |
| 05 | `STEUER-konzept-alertcenter-05-mqtt-metadata-correlation-2026-04-10.md` | MQTT → Notification `metadata` / `correlation_id` | kann parallel zu 03 nach Pattern-Scan, Abstimmung mit 04 |
| 06 | `STEUER-konzept-alertcenter-06-firmware-alert-hw-2026-04-10.md` | Firmware Alert-Pfad, HW-Abnahme | letzter Block; Wokwi ≠ HW für Safety-relevante Pfade |

**Abhängigkeiten (kurz):** 04 kann früh (reine Doku). 05 sollte **nach** oder **mit** abgestimmtem Lagebild zu ID-Semantik (HTTP `request_id` vs. MQTT-CID) erfolgen — siehe IST-Observability § P0. 06 blockiert nicht 01–05, ist eigenes Gate.

## Artefakt-Orchestrierung (pro Teil-STEUER)

1. Teil-STEUER lesen → `TASK-PACKAGES.md` + `SPECIALIST-PROMPTS.md` unter  
   `.claude/reports/current/auto-debugger-runs/<run_id aus Teil-STEUER>/`  
2. Skill **`verify-plan`** → `VERIFY-PLAN-REPORT.md` → Post-Verify-Anpassung der Pakete (Skill auto-debugger).  
3. Implementierung durch Dev-Rollen; **FEHLER-REGISTER.md** bei Code-Paketen.

---

*Ende MASTER-STEUER*
