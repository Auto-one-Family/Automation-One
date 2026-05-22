---
run_mode: artefact_improvement
incident_id: ""
run_id: docker-ist-folge-01-devops-verify
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md
  - .claude/reference/debugging/LOG_LOCATIONS.md
scope: |
  Operative Absicherung der Docker-IST-Baseline aus INC-2026-04-09-docker-ist: Container-Namen,
  Health-Endpoints und wiederholbare Verify-Befehle (docker ps, docker logs, curl/Invoke-WebRequest)
  mit dem Repo-Ist abgleichen — insbesondere docker-compose.yml (Services el-servador, el-frontend,
  postgres, mqtt-broker) und die dokumentierten Befehle in SYSTEM_OPERATIONS_REFERENCE.md §0.5 ff.
  Additiv: fehlende oder veraltete Stellen korrigieren (kein Rewrite der gesamten Referenz).
  Querverweis: Host-Log vs. Docker-stdout ist separat in STEUER-fix-host-log-vs-docker-stdout-2026-04-10.md.
forbidden: |
  Keine Secrets. Keine Änderung von Health-URL-Pfaden ohne Abgleich mit src/main.py und Instrumentator.
  Keine vollständigen Postgres-Statement-Dumps ins Repo. Keine Commits auf master.
done_criteria: |
  SYSTEM_OPERATIONS_REFERENCE.md (oder LOG_LOCATIONS.md) enthält eine konsistente „Docker-IST-Verify“-
  Mini-Checkliste mit: exakten Container-Namen (automationone-server, automationone-frontend,
  automationone-postgres, automationone-mqtt), Health-URL /api/v1/health/live und optional
  /api/v1/health/metrics, sowie den docker-logs-Kommandos aus dem Lagebild. Optional: VERIFY-PLAN-REPORT
  nach Gate, falls Code/Compose angepasst wurde.
---

# STEUER 01 — DevOps: Stack-Verifikation (Folge INC-2026-04-09-docker-ist)

**Pattern (Repo-Ist):**

- Compose-Basis: `docker-compose.yml` — Services `postgres` → `automationone-postgres`, `mqtt-broker` → `automationone-mqtt`, `el-servador` → `automationone-server`, `el-frontend` → `automationone-frontend`.
- Server-Healthcheck im Compose: `curl -f http://localhost:8000/api/v1/health/live` (siehe Service `el-servador`).

**Schrittweise Umsetzung**

1. **IST lesen:** `INCIDENT-LAGEBILD.md` und `CORRELATION-MAP.md` im Incident-Ordner — keine neuen Symptome erfinden.
2. **Diff Doku↔Compose:** Prüfen, ob SYSTEM_OPERATIONS_REFERENCE §0.5 Docker-Workflow dieselben Service-/Containernamen und Ports nennt wie `docker-compose.yml`.
3. **Verify-Block dokumentieren** (additiv): wiederholbare Befehle aus TASK-PACKAGES PKG-OBS-01 (`docker ps`, `docker logs … --tail`, optional `curl` Health) — PowerShell-Hinweis zu `NativeCommandError` bei `docker logs` beibehalten.
4. **Code nur bei Abweichung:** z. B. Kommentar in Compose oder ein Zeilenergänzung in Referenz — kein neues Skript ohne Bedarf.

**Verify (nach jeder Änderung am Markdown):** manuell: `docker ps` + `curl -s -o NUL -w "%{http_code}" http://localhost:8000/api/v1/health/live` (erwartet 200), sofern Stack läuft.

**Rolle:** primär Dokumentation / Ops; bei Compose-Änderungen server-dev oder CI-Review einbeziehen.
