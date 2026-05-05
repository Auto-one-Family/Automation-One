# FEHLER-REGISTER — frontend-alerts-uiux-2026-04-10

| Zeit / Schritt | Symptom | Evidence | Maßnahme |
|----------------|---------|----------|----------|
| Umsetzung P1 | `vue-tsc`: `warning` nicht aus `useToast` destructured | `TS2304 Cannot find name 'warning'` in `QuickAlertPanel.vue` | `warning` zu Destructuring hinzugefügt |
| — | Keine weiteren Blocker nach Fix | `npx vue-tsc --noEmit` Exit 0 | — |
| 2026-04-09 Abschluss | P0-Inventar ergänzt + P1-Verifikation | `npx vue-tsc --noEmit` im Ordner `El Frontend` → Exit 0 | Inventar `docs/analysen/INVENTAR-frontend-alerts-routen-uiux-2026-04-10.md` aktualisiert |
| 2026-04-10 Review | Auftrag §7 + Artefakt-Konsistenz | `npx vue-tsc --noEmit` (`El Frontend`) → Exit 0 | `VERIFY-PLAN-REPORT.md` + `TASK-PACKAGES.md` ergänzt; Inventar P2–P4-Status bereinigt |
| 2026-04-10 | P2 Zwei-Ketten-UX + Inventar-Update | `npx vue-tsc --noEmit` → Exit 0 | Keine Blocker |
| 2026-04-10 | P3 Poll vs. WS — Barrel-Export `STATS_POLL_INTERVAL_MS` aus `@/shared/stores` löste in `AlertStatusBar` kein Symbol für `vue-tsc` | `TS2304 Cannot find name 'STATS_POLL_INTERVAL_MS'` | Direktimport aus `@/shared/stores/alert-center.store`; `npx vue-tsc --noEmit` → Exit 0 |
| 2026-04-10 | P0-Inventar-Verifikation + P4 testids/Playwright | `npx vue-tsc --noEmit` (`El Frontend`) → Exit 0 | `QuickActionBall`/`QuickActionMenu`/`QuickAlertPanel`, `alert-center.spec.ts`; Inventar „Umsetzung P4“ |

**Playwright:** in dieser Session nicht gegen laufenden Stack ausgeführt — keine „E2E grün“-Behauptung.
