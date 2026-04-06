# Auftrag F08: Custom Dashboard Editor, Widgets, GridStack

## Ziel
Dokumentiere den kompletten Editor-Lebenszyklus mit Fokus auf Persistenz, Widget-Datenquellen und Realtime-Konsistenz.

## IST-Wissen aus dem Frontend
- Editor basiert auf `CustomDashboardView.vue` und Widget-Komponenten.
- GridStack steuert Position/Resize/Drag.
- Dashboardzustand ist mit Store und API gekoppelt.

## Scope
- `El Frontend/src/views/CustomDashboardView.vue`
- `El Frontend/src/components/dashboard-widgets/**`
- `El Frontend/src/components/dashboard/DashboardViewer.vue`
- `El Frontend/src/composables/useDashboardWidgets.ts`

## Analyseaufgaben
1. Erstelle State-Machine fuer laden/erstellen/bearbeiten/speichern/wechseln.
2. Zerlege GridStack-Events bis Persistenzwirkung.
3. Dokumentiere Widget-Registry, Konfigschema und Dateneingang je Typ.
4. Pruefe Konflikte zwischen Edit-Session und Live-Deviceupdates.

## Pflichtnachweise
- Widget-Aktion -> Store -> API -> Reload/Replay.
- Realtime-Update -> Widget-Rendering -> Konsistenz/Drift.

## Akzeptanzkriterien
- Jeder Widgettyp hat Input, Trigger, Speicher- und Fehlerpfad.
- Risiken fuer Datenverlust/Desync sind klar klassifiziert.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F08-dashboard-editor-widgets-2026-04-05.md`
