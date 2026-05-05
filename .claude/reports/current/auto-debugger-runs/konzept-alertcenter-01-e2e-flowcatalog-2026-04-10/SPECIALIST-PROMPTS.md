# SPECIALIST-PROMPTS — konzept-alertcenter-01-e2e-flowcatalog-2026-04-10

**Stand:** Umsetzung für PKG-01–03 durchgeführt; bei Nacharbeit nur noch Verify wiederholen.

---

## frontend-dev — E2E Flow-Katalog & README

### Scope

- `El Frontend/tests/e2e/flows/alert_center_acknowledge_active.yaml`
- `El Frontend/tests/e2e/README.md`
- Additiv: `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md` (§4.4 Verweis)

### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Closest implementation: `tests/e2e/scenarios/alert-center.spec.ts` — YAML-Schritte nur mit dort verwendeten `data-testid` belegen; keine zweite Flow-Engine.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Alert-Center-E2E nutzt Drawer + REST-Mock im Spec; ISA-DB-Inbox vs. transient nicht vermischen — hier nur E2E-Doku/YAML.

### Verify-Befehl (Pflicht)

```bash
cd "El Frontend"
npx vue-tsc --noEmit
npx playwright test tests/e2e/scenarios/alert-center.spec.ts
```

### Fehler-Register (Pflicht bei Code)

- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl; siehe `FEHLER-REGISTER.md` im gleichen Run-Ordner.

---
