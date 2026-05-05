# Playwright E2E (El Frontend)

Konfiguration: `playwright.config.ts` — u. a. `globalSetup`/`globalTeardown` für Auth (`E2E_TEST_USER`, `E2E_TEST_PASSWORD`, Standard in `global-setup.ts`: `admin` / `admin123`), `PLAYWRIGHT_BASE_URL` (Default `http://localhost:5173`). **Hinweis:** Die Credentials müssen zu einem existierenden Benutzer auf dem erreichbaren Backend (Port 8000) passen; ist `/auth/setup` bereits durchgelaufen, schlägt ein zweiter Setup-Versuch mit 403 fehl — dann nur noch Login mit korrektem Passwort oder frische Test-DB. Für CI-Parität mit älteren Test-DBs: `E2E_TEST_PASSWORD=Admin123#` setzen (entspricht dem GitHub-Workflow).

**Alert-Center-Referenz** (`data-testid` + Flow-Katalog-YAML):

- Katalog (Contract, keine separate Runner-Engine): `tests/e2e/flows/alert_center_acknowledge_active.yaml`
- Implementierung: `tests/e2e/scenarios/alert-center.spec.ts`

Ausführung nur dieses Szenarios (Dev-Stack: Backend Port 8000 + Vite 5173, siehe `AGENTS.md`):

```bash
cd "El Frontend"
npx vue-tsc --noEmit
npx playwright test tests/e2e/scenarios/alert-center.spec.ts
```

Selektiv nach Titel (`test.describe`-Name):

```bash
npx playwright test tests/e2e/scenarios/alert-center.spec.ts --grep "Alert Center / Notification Drawer"
```

CI: Workflow `.github/workflows/playwright-tests.yml` — Chromium, Docker-Compose-E2E-Stack, Reporter u. a. HTML + JUnit.
