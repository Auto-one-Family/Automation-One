---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i05-frontend-ws-rest-debug-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - El Frontend/src/api/index.ts
scope: |
  Frontend: Letzte **X-Request-ID** (oder Server-Antwort-Header) in einem **Dev-only** Kontext sichtbar machen
  (Debug-Panel, Konsole, o. ä. — nächstliegende bestehende Debug-/Monitor-Pattern im Repo verwenden).

  Akzeptanz:
  (1) Sichtbar nur in Development / explizit geschütztem Modus (kein PII).
  (2) Vitest für Helper oder kleine reine Funktion.
  (3) Keine Speicherung sensibler Nutzerdaten.

  verify-plan: Closest existing „debug“ UI (System-Monitor, Quick-Action, …) vor Neuentwicklung.
forbidden: |
  Keine neuen Secrets; keine zweite parallele Notification-Welt; Production-Build darf keine sensiblen Debug-Leaks haben.
  Commits nur auf auto-debugger/work.
done_criteria: |
  `npx vue-tsc --noEmit` grün; `npx vitest run` für neue Tests grün; manuell: Dev-Modus zeigt letzte Request-ID wie spezifiziert.
---

# STEUER — I05 WS↔REST-Korrelation Debug-Panel

**IST-Referenz:** § I Punkt 5.

## Schritte

1. Branch `auto-debugger/work`.
2. **verify-plan** + Pattern-Scan: bestehende Debug-/Monitor-Komponenten (`Grep` nach debug, DevOnly, VITE_).
3. **frontend-dev**: Implementierung + Vitest.
4. `vue-tsc` + `vitest` + bei Bedarf `vite build`.

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Gate / Pfade | **verify-plan** |
| Implementierung | **frontend-dev** |
| WS-Kontext | **frontend-debug** (read-only: Events/Typen) |
| Bei Build-Rot | **test-log-analyst** |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I05-frontend-ws-rest-debug-2026-04-09.md
verify-plan, dann frontend-dev: letzte X-Request-ID dev-only sichtbar; Vitest; Branch auto-debugger/work.
```
