---
run_mode: artefact_improvement
incident_id: ""
run_id: docker-ist-folge-05-frontend-container
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md
scope: |
  Frontend-Container-IST zur Stichprobe: automationone-frontend, Vite ready auf 5173, Healthcheck
  per fetch auf http://localhost:5173 (siehe docker-compose.yml Service el-frontend). Abhängigkeit:
  el-servador muss service_healthy sein. Aufgabe: Referenz und ggf. Troubleshooting-Zeile
  (VITE_*, CORS, API-URL) mit Repo-Ist abgleichen — keine zweite Dashboard-Architektur.
  Frontend-Code nur bei nachweisbarem Bug; sonst Doku/Verify-Hinweise.
forbidden: |
  Keine neuen Notification-Kanäle. Keine Light-Mode Styles. Keine Secrets in VITE_* Beispielen.
  Branch nur auto-debugger/work bei Commits.
done_criteria: |
  SYSTEM_OPERATIONS_REFERENCE enthält konsistente Angaben zu el-frontend / automationone-frontend,
  Port 5173, und dem Zusammenspiel mit el-servador (healthy). Optional: Verweis auf lokales
  `npx vite` vs. Docker-Dev — ohne Widerspruch zu AGENTS.md Startbefehlen.
---

# STEUER 05 — Frontend: Vite-Container & Health (Folge INC-2026-04-09-docker-ist)

**Pattern (Repo-Ist):**

- `docker-compose.yml` — `el-frontend`, `build` mit `Dockerfile` target `development`, `container_name: automationone-frontend`.
- Healthcheck: Node `fetch('http://localhost:5173')` — muss HTTP ok liefern, wenn Vite läuft.
- Env: `VITE_API_URL`, `VITE_WS_URL` auf localhost:8000; interne Targets `el-servador:8000`.

**Schrittweise Umsetzung**

1. **IST:** Lagebild — „VITE … ready“, kein Build-Fehler im Tail.
2. **Doku-Abgleich:** Ports und Env mit `El Frontend`-Dockerfile/README und SYSTEM_OPERATIONS_REFERENCE §0.5/Frontend-Abschnitten.
3. **Fehlerfall:** Bei rotem Healthcheck zuerst `docker logs automationone-frontend`, dann el-servador-Dependency — siehe frontend-debug Skill.
4. **Code:** Nur bei konkretem Fix (z. B. Healthcheck-URL falsch) — verify-plan, dann frontend-dev.

**Verify:** `cd "El Frontend" && npx vue-tsc --noEmit && npx vite build` bei TS/Vue-Änderungen; Docker: `docker ps` zeigt frontend healthy.

**Rolle:** frontend-dev bei Code; Ops nur Doku.
