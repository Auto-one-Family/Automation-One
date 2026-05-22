---
run_mode: artefact_improvement
incident_id: ""
run_id: konzept-alertcenter-01-e2e-flowcatalog-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
  - El Frontend/tests/e2e/scenarios/alert-center.spec.ts
scope: |
  Phase 1 des Konzeptberichts (§4, §7.2, Roadmap Phase 1): (1) Versionierter Flow-Katalog (YAML)
  gemäß Konzept §4.4 — mindestens flow_id alert_center_acknowledge_active oder gleichwertig mit den
  IST-testids; (2) Referenz-Ausführung dokumentieren (npm/pnpm-Skript, --grep, Umgebungsvariablen
  E2E_*); (3) optional CI-Job-Skizze verweisen (bestehende E2E-Patterns im Repo nutzen).
  Keine neue parallele „Flow-Engine“ neben Playwright — YAML ist Katalog/Contract, Ausführung bleibt
  Playwright/TypeScript.
forbidden: |
  Keine neuen externen Runner-Dependencies nur für den Katalog; keine Änderung der Produkt-API nur
  für den Katalog; keine Secrets; keine Aufweichung von E2E-Auth/Setup (globalSetup beachten).
done_criteria: |
  Mindestens eine YAML-Datei im Repo mit Schema aus Konzept §4.4 (flow_id, steps, assertions);
  README oder Kommentar verweist von YAML auf `alert-center.spec.ts`; `npx playwright test` gegen
  die alert-center-Szenarien mit dokumentiertem Befehl Exit-Code 0 (gegen Dev-Stack oder Mock wie
  im bestehenden Setup).
---

# STEUER 01 — E2E, Flow-Katalog, CI-Anschluss

## Pattern-Anker (Repo-Ist, vor Änderung verifizieren)

- Playwright-Szenario: `El Frontend/tests/e2e/scenarios/alert-center.spec.ts` (Drawer, Tabs, P1-Ack-Fail-Mock).
- Konfiguration: `El Frontend/playwright.config.ts` (globalSetup, baseURL).
- `data-testid`: u. a. `notification-drawer-trigger`, `notification-drawer-panel`, `alert-status-tab-*` — Konzept §4.4-Ziele mit IST abgleichen.

## Aufgabenpaket (SOLL für TASK-PACKAGES)

1. **PKG-01:** Verzeichnis für Flow-Katalog wählen (Vorschlag: `El Frontend/tests/e2e/flows/` oder `docs/analysen/flows/`) — eine YAML-Datei, die den Referenz-Flow beschreibt; `steps`/`assertions` auf **existierende** testids mappen.
2. **PKG-02:** Kurz-Abschnitt in passender Frontend-Doku oder README unter `tests/e2e/` (ein Absatz): Befehl `cd "…/El Frontend" && npx playwright test tests/e2e/scenarios/alert-center.spec.ts` (ggf. mit `--grep`).
3. **PKG-03 (optional):** Verweis auf CI: wo andere E2E-Jobs hängen — nur dokumentieren, keine Pflicht Pipeline-Änderung in diesem STEUER.

## Verify (bindend für Dev-Implementierung)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx playwright test tests/e2e/scenarios/alert-center.spec.ts
```

## Nicht-Ziele

- Interne `/internal/...` Dev-API (Konzept Phase 4) — nicht Teil dieses STEUER.

---

*Teil von MASTER `STEUER-konzept-alertcenter-MASTER-2026-04-10.md`*
