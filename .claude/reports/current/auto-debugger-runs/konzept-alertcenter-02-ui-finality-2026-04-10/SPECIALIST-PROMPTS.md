# SPECIALIST-PROMPTS — konzept-alertcenter-02-ui-finality-2026-04-10

**Hinweis:** Umsetzung in dieser Session abgeschlossen (Vitest + Artefakte). Für Nachziehen auf anderem Clone:

## frontend-dev — PKG-03 (Vitest)

### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Closest implementation: `El Frontend/tests/unit/utils/lastRestRequestId.test.ts` (falls vorhanden) oder benachbarte `tests/unit/utils/*.test.ts` — gleiche Vitest-/Alias-Patterns (`@/`).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Nur Formatter-Unit-Tests; keine zweite Notification-Welt; ISA/REST-Lifecycle vs. WS-transient nicht vermischen.

### Verify-Befehl (Pflicht)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run tests/unit/utils/alertLifecycleUi.test.ts
```

### Fehler-Register (Pflicht bei Code)

- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl erneut.
