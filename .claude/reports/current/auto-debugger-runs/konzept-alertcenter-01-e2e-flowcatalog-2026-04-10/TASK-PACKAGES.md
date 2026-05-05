# TASK-PACKAGES — konzept-alertcenter-01-e2e-flowcatalog-2026-04-10

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-konzept-alertcenter-01-e2e-flowcatalog-ci-2026-04-10.md`  
**Aktueller Git-Branch:** `auto-debugger/work` (Soll; Commits nur hier).  
**Modus:** `artefact_improvement`

## Lagebild (kurz)

- **Pattern-Anker:** `El Frontend/tests/e2e/scenarios/alert-center.spec.ts`, `playwright.config.ts`, `tests/e2e/global-setup.ts`.
- **Delta Konzept §4.4 ↔ Repo:** `required_env` im Konzept nennt `E2E_USER`/`E2E_PASSWORD`; Ist nutzt `E2E_TEST_USER`/`E2E_TEST_PASSWORD` — im YAML und Konzept ergänzt dokumentiert.

---

## PKG-01 — Flow-Katalog YAML

**Owner:** frontend-dev  
**Status:** erledigt (Datei angelegt)

**Akzeptanzkriterien:**

- [x] `El Frontend/tests/e2e/flows/alert_center_acknowledge_active.yaml` mit `flow_id`, `steps`, `assertions`, Mapping auf existierende `data-testid`-Werte aus `alert-center.spec.ts`.
- [x] Kein neuer externer Runner; YAML ist Contract neben Playwright.

**Verify:** `npx vue-tsc --noEmit` und `npx playwright test tests/e2e/scenarios/alert-center.spec.ts` (Exit 0).

---

## PKG-02 — E2E-Doku (README)

**Owner:** frontend-dev  
**Status:** erledigt

**Akzeptanzkriterien:**

- [x] `El Frontend/tests/e2e/README.md` mit Befehlen `cd "El Frontend"` + `playwright test …`, Hinweis auf Flow-YAML und `global-setup`-Env.

---

## PKG-03 — CI-Verweis (optional)

**Owner:** Dokumentation (kein Pipeline-Diff in diesem STEUER)

**Akzeptanzkriterien:**

- [x] README verweist auf `.github/workflows/playwright-tests.yml` und typische Chromium/Compose-Nutzung.

---

*Nach Verify: keine offenen PKG-Blocker; siehe `VERIFY-PLAN-REPORT.md`.*
