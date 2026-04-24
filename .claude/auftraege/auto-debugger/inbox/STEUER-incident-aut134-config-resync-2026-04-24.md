---
run_mode: both
incident_id: "INC-2026-04-24-aut134-config-resync-oversize"
run_id: "aut134-config-resync-2026-04-24"
order: incident_first
target_docs:
  - docs/analysen/configaustausch-architekturanalyse-2026-04-23.md
  - docs/analysen/forensik-verbesserungsbriefing-stack-2026-04-22.md
scope: |
  Vollständige Incident-Analyse für AUT-134 (Parent AUT-132) inkl. Docker-/Stack-Logs, Firmware-Serial, MQTT- und Server-Korrelation.
  Primärsymptome:
  - intent_outcome rejected (flow=config, code=VALIDATION_FAIL)
  - reason: [CONFIG] Payload too large (Beobachtungen 4164/4096 sowie 4370/4096)
  - heartbeat/config Trigger-Burst rund um Count-Mismatch und Re-Sync
  Pflicht: Cross-Layer-Korrelation mit evidenzbasierter Feldzuordnung (correlation_id/request_id/esp_id/seq/ts), offene Lücken und alle
  zusammenhängenden Fehlerbilder erfassen, inklusive möglicher Folgeprobleme in Observability/Operator-UX.
  Es dürfen Analyse-/Incident-Artefakte erstellt und aktualisiert werden; keine Produktcode-Implementierung im Orchestrator.
forbidden: |
  Keine Secrets in Artefakte.
  Keine Breaking Changes an REST/MQTT/WS/DB.
  Keine Produktcode-Änderungen durch den Orchestrator ohne abgeschlossenes verify-plan-Gate.
  Kein Push/Force/Reset im Git.
done_criteria: |
  1) INCIDENT-LAGEBILD, CORRELATION-MAP, TASK-PACKAGES, SPECIALIST-PROMPTS und VERIFY-PLAN-REPORT sind vollständig und konsistent.
  2) Alle relevanten Fehlerbilder aus AUT-134-Kontext sind als verifizierte Findings oder explizite BLOCKER dokumentiert.
  3) TASK-PACKAGES sind nach verify-plan mutiert (Pfad-/Test-/Abhängigkeitskorrekturen eingearbeitet).
  4) Rollenweise Spezialisten-Prompts sind startklar und referenzieren nur den Verify-Stand.
---

# Steuerdatei — auto-debugger

Kontext:
- Linear: https://linear.app/autoone/issue/AUT-134/ea-132-config-resync-gezielt-statt-flood-heartbeat-count-mismatch
- Zusätzlich korrelieren: intent_outcome rejected, config oversize, heartbeat publish oversize, count-mismatch Trigger und Burst-Fenster.
