# Auftrag F11: Systembetrieb, Ops, Diagnostics, Plugins

## Ziel
Durchleuchte alle Admin-/Ops-Flaechen auf Datenwege, Rechte, Fehlertoleranz und Legacy-Drift.

## IST-Wissen aus dem Frontend
- System Monitor hat 8 Haupttabs (events, logs, database, mqtt, health, diagnostics, reports, hierarchy).
- Mehrere alte Ops-Routen redirecten auf neue Ziele.
- Plugins/SystemConfig/LoadTest/Email liegen in Admin-Bereichen.

## Scope
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/components/system-monitor/**`
- `El Frontend/src/components/database/**`
- `El Frontend/src/views/PluginsView.vue`
- `El Frontend/src/views/SystemConfigView.vue`
- `El Frontend/src/views/LoadTestView.vue`
- `El Frontend/src/views/EmailPostfachView.vue`

## Analyseaufgaben
1. Erstelle Tab- und Datenquellenkarte fuer System Monitor.
2. Kartiere Eventgruppen und Abhaengigkeiten in Ops-Flows.
3. Pruefe Rechte/Failure-Pfade/Nebenwirkungen in Plugins, Config, LoadTest, Email.
4. Dokumentiere Legacy-Redirects und deren operative Folgen.

## Pflichtnachweise
- Tab-/Filteraktion -> Query/Realtime -> Rendering.
- Admin-Trigger -> Serverprozess -> Status-/Ergebnisanzeige.

## Akzeptanzkriterien
- Jede Admin-Flaeche hat Sicherheits- und Bedienrisikobewertung.
- Legacy-Pfade sind mit Cleanup-Vorschlag versehen.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F11-systembetrieb-ops-plugins-2026-04-05.md`
