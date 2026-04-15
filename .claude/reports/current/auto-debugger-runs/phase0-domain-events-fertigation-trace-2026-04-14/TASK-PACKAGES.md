# TASK-PACKAGES — phase0-domain-events-fertigation-trace-2026-04-14

## PKG-01 (abgeschlossen — chirurgischer Fix)

- **Ziel:** Fertigation Live-Updates: WebSocket `sensor_data` an Server-Payload und `WebSocketMessage`-Typ anbinden.
- **Dateien:** `El Frontend/src/composables/useFertigationKPIs.ts`, `El Frontend/tests/unit/composables/useFertigationKPIs.ws.test.ts`
- **Akzeptanz:** `vue-tsc --noEmit` grün; Vitest `tests/unit/composables/useFertigationKPIs.ws.test.ts` grün.
- **Branch:** `auto-debugger/work` only.

## PKG-02 (optional / P1)

- **Ziel:** `FertigationPairWidget` in `useDashboardWidgets` registrieren + Widget-Katalog.
- **Abhängigkeit:** Produktentscheid ob Fertigation nur inline oder im Dashboard-Builder.

## PKG-03 (optional / P1)

- **Ziel:** `docs/FERTIGATION_WIDGET_INTEGRATION.md` WS-Abschnitt korrigieren.
