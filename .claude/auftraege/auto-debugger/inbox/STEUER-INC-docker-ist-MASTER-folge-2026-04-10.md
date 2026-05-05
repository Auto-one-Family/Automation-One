---
run_mode: artefact_improvement
incident_id: ""
run_id: ""
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/reports/current/incidents/INC-2026-04-09-docker-ist/INCIDENT-LAGEBILD.md
scope: |
  Index-Steuerung für die bereichsweise Folgearbeit zum abgeschlossenen Incident
  INC-2026-04-09-docker-ist (Docker-IST-Stichprobe: Stack grün, kein ERROR/FATAL in den Tails).
  Diese MASTER-Datei orchestriert keine Implementierung selbst, sondern verweist auf die
  nummerierten STEUER-Dateien STEUER-INC-docker-ist-01 … 05. Reihenfolge: zuerst 01 (DevOps/
  Verifikation), dann 02–05 parallel möglich, sofern keine gemeinsamen Dateien — bei Konflikt
  02 vor 03–05 (Datenpfad vor Broker-Detail).
forbidden: |
  Keine Secrets in Artefakten. Keine erfundenen Produktfehler — IST war grün; Folgearbeit nur
  dokumentarisch, verifikatorisch oder als optionale Härtung nach verify-plan-Gate bei Code.
  Keine Commits auf master (nur Branch auto-debugger/work).
done_criteria: |
  Alle fünf Bereichs-STEUER-Dateien sind im inbox-Verzeichnis vorhanden; Bearbeiter kennt
  Abhängigkeit 01→Rest und verweist bei Code auf INCIDENT-Ordner + auto-debugger/workflow
  (TASK-PACKAGES, VERIFY-PLAN-REPORT bei Code-PKGs).
---

# MASTER — Folge-STEUER zu `INC-2026-04-09-docker-ist`

**Baseline (abgeschlossen):**

- Ordner: `.claude/reports/current/incidents/INC-2026-04-09-docker-ist/`
- Ursprungs-Steuerung: `.claude/auftraege/auto-debugger/inbox/STEUER-docker-stack-ist-2026-04-09.md`
- Befund: Kern-Container healthy, Health-HTTP 200, MQTT/Postgres/Frontend-Tails ohne ERROR/FATAL in der Stichprobe; Traffic u. a. **MOCK_BEAA9D** (Sensorpfad), **ESP_EA5484** (Heartbeat).

**Git:** `auto-debugger/work` (Pflicht vor Produktänderungen, siehe `.claude/agents/auto-debugger.md` §0a).

## Empfohlene Abarbeitung

| Reihenfolge | Datei | Bereich |
|-------------|-------|---------|
| 1 | `STEUER-INC-docker-ist-01-devops-stack-verify-2026-04-10.md` | Docker Compose, Health-Checks, wiederholbare Verifikation |
| 2 | `STEUER-INC-docker-ist-02-backend-sensor-mqtt-pfad-2026-04-10.md` | El Servador: Health, SimulationScheduler, sensor_handler → DB |
| 3 | `STEUER-INC-docker-ist-03-mqtt-broker-compose-2026-04-10.md` | Mosquitto, Topics, Healthcheck |
| 4 | `STEUER-INC-docker-ist-04-postgres-operativ-2026-04-10.md` | PostgreSQL, asyncpg, Stichproben ohne Voll-Logs |
| 5 | `STEUER-INC-docker-ist-05-frontend-container-2026-04-10.md` | Vite-Container, Ports, Abhängigkeit von el-servador |

**Orchestrierung:** Für Läufe mit TASK-PACKAGES / Code — Agent `auto-debugger` + Skill `verify-plan` vor Implementierung; Ausgabe bei Artefakt-Modus unter `.claude/reports/current/auto-debugger-runs/<run_id>/` gemäß jeweiliger Steuerdatei.
