# FEHLER-REGISTER — konzept-alertcenter-01-e2e-flowcatalog-2026-04-10

| ID | Evidenz | Hypothese | Fix | Verify |
|----|---------|-----------|-----|--------|
| E01 | `global-setup.ts`: Login 401, Setup 403 „Setup already completed“ | `E2E_TEST_USER`/`E2E_TEST_PASSWORD` passen nicht zur laufenden DB; Auth-State abgelaufen | Gültigen User nutzen oder wie in CI Compose-Stack mit `e2e_test_password` / bekanntem Admin aus `.env` | `npx playwright test … --project=chromium` nach erfolgreichem Login erneut |
