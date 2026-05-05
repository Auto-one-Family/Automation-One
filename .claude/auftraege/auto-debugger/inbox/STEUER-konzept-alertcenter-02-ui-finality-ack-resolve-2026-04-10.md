---
run_mode: artefact_improvement
incident_id: ""
run_id: konzept-alertcenter-02-ui-finality-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
  - El Frontend/src/shared/stores/alert-center.store.ts
  - El Frontend/src/components/notifications/NotificationDrawer.vue
scope: |
  Konzept §5.1 P0 / Roadmap Phase 2: Sichtbare Finalität bei fehlgeschlagenem Ack/Resolve/Resolve-All
  (Timeout, 4xx/5xx): Toast oder gleichwertiges bestehendes Error-Pattern; optional Anzeige von
  `request_id` (x-request-id) aus AlertLifecycleFailure. Abgleich aller UI-Einstiege (Drawer,
  QuickAlertPanel, ggf. „Alle erledigen“) — kein Schein-Erfolg wenn Store `success: false` liefert.
  IST-Code zuerst per Read/Grep prüfen; nur echte Lücken schließen (kein Rewrite).
forbidden: |
  Keine zweite Notification-Welt; ISA-Inbox/DB-Kette nicht mit WS-only error_event vermischen;
  keine neuen Toast-Systeme — bestehende Patterns (useToast, ErrorState, …) erweitern; keine
  Breaking Changes an REST-Client-Signaturen ohne separates Gate.
done_criteria: |
  Alle Lifecycle-Aktionen aus dem Alert-Center-UI, die alert-center.store ansprechen, zeigen bei
  `AlertLifecycleFailure` konsistentes Fehlerfeedback; mindestens ein automatisierter Nachweis
  (bestehendes Playwright-Szenario erweitert oder Vitest auf Handler/Composable); `npx vue-tsc
  --noEmit` grün.
---

# STEUER 02 — UI-Finalität Ack / Resolve

## Pattern-Anker

- Store: `El Frontend/src/shared/stores/alert-center.store.ts` — Typen `AlertLifecycleResult`, `mapAlertLifecycleError`, `toUiApiError` / `request_id`.
- UI: `NotificationDrawer.vue`, `NotificationItem.vue`, `QuickAlertPanel.vue` — wo `acknowledge`/`resolve` aufgerufen werden, Rückgabe auswerten.
- E2E: `tests/e2e/scenarios/alert-center.spec.ts` — Test „P1 Finalität“ als Referenz für REST-Fehlerpfad.

## Aufgabenpaket (SOLL für TASK-PACKAGES)

1. **PKG-01:** Inventar: alle Call-Sites von `acknowledgeAlert` / `resolveAlert` / `resolveAll` im Notification-/Quick-Alert-UI — Matrix „zeigt Toast bei false?“.
2. **PKG-02:** Lücken schließen mit gleichem Toast-/Copy-Pattern wie im E2E-Referenztest; `requestId` optional im Toast-Body oder Dev-Hinweis (Konzept §6.2).
3. **PKG-03:** Tests — Playwright erweitern **oder** Vitest für reine Handler-Logik; kein Duplikat mit sinnlosem Mock-Wald.

## Verify

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run
npx playwright test tests/e2e/scenarios/alert-center.spec.ts
```

## Abgrenzung

- **WS `error_event`:** nicht Ziel dieses STEUER — nur persistierte Alert-Lifecycle-REST-Kette (siehe STEUER 04).

---

*Teil von MASTER `STEUER-konzept-alertcenter-MASTER-2026-04-10.md`*
