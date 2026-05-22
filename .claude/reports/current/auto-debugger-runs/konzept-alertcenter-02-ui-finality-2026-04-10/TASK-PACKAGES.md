# TASK-PACKAGES — STEUER-konzept-alertcenter-02-ui-finality-ack-resolve

**Git-Branch (Soll):** `auto-debugger/work`  
**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-konzept-alertcenter-02-ui-finality-ack-resolve-2026-04-10.md`  
**Stand nach Verify:** Repo-Ist entspricht SOLL für UI-Finalität; ergänzt um Vitest für `formatAlertLifecycleFailureMessage`.

---

## PKG-01 — Inventar Call-Sites (Matrix „Toast bei `success: false`?“)

| Ort | acknowledge | resolve | resolveAll | Fehlerfeedback |
|-----|-------------|---------|------------|----------------|
| `NotificationDrawer.vue` | `handleAcknowledge` → `toast.show` error | `handleResolve` → `toast.show` error | `handleResolveAll` → `toast.show` error | Ja (`formatAlertLifecycleFailureMessage`) |
| `QuickAlertPanel.vue` | `handleAck` → `error()` | `handleResolve` → `error()` | — | Ja |
| `QuickAlertPanel.vue` | `handleBatchAcknowledge` → `error()` / `warning()` / `success()` | — | — | Ja (partial + lastFail) |

**Weitere Komponenten:** Keine direkten `acknowledgeAlert`/`resolveAlert`/`resolveAllAlerts` außerhalb dieser beiden (grep-verifiziert). `NotificationItem.vue` emittiert nur Events; Eltern ist der Drawer.

**Akzeptanz:** Matrix vollständig; keine „stille“ erfolgreiche UI ohne `{ success: true }` vom Store.

---

## PKG-02 — Einheitliches Copy-Pattern

**IST:** `@/utils/alertLifecycleUi.ts` — `formatAlertLifecycleFailureMessage` ergänzt optional `Request-ID` aus `AlertLifecycleFailure.requestId` (aus `toUiApiError` / `x-request-id`).

**Akzeptanz:** Drawer und QuickAlert nutzen dieselbe Hilfsfunktion bzw. gleichwertige Toast-API mit identischem Text.

---

## PKG-03 — Tests

- **Vitest:** `El Frontend/tests/unit/utils/alertLifecycleUi.test.ts` — Formatter mit/ohne `requestId`.
- **E2E (Referenz):** `tests/e2e/scenarios/alert-center.spec.ts` — „P1 Finalität“ für fehlgeschlagenes Ack (500-Mock).

**Verify:**

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run tests/unit/utils/alertLifecycleUi.test.ts
npx playwright test tests/e2e/scenarios/alert-center.spec.ts
```

---

## Abnahme (done_criteria aus STEUER)

- Lifecycle-Aktionen im Alert-Center-UI zeigen bei `AlertLifecycleFailure` konsistentes Feedback.
- Mindestens ein automatisierter Nachweis: Vitest + bestehendes Playwright-Szenario.
- `npx vue-tsc --noEmit` grün.
