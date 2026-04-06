# Auftragsserie El Frontend F01-F14

Stand: 2026-04-05
Ziel: Vollstaendige, fokussierte Bereichsanalyse fuer El Frontend in 14 Einzelauftraegen.

## Gemeinsame Leitplanken fuer alle Auftraege

- Nur Analyse, kein Refactoring.
- Jede Aussage braucht Codebeleg (Datei + Symbol/Funktion + beobachtete Wirkung).
- Reports werden hier abgelegt: `.claude/reports/current/frontend-analyse/`.
- Pflichtstruktur je Report:
  1. Kurzurteil (max 12 Bullets)
  2. Happy Path + Stoerfall mit Pfadbelegen
  3. Contract-/Kommunikationsmatrix (REST/WS/Store/Type)
  4. Top Findings P0/P1/P2
  5. Konkrete Folgeauftraege

## Referenzen im Repo

- `.claude/auftraege/Auto_One_Architektur/frontend/bericht-frontend-inventar-2026-04-05.md`
- `.claude/auftraege/Auto_One_Architektur/frontend/analyseauftrag-el-frontend-komplett-inventar-2026-04-05.md`
- `El Frontend/src/router/index.ts`
- `El Frontend/src/shared/stores/`
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/stores/esp-websocket-subscription.ts`
- `El Frontend/src/utils/contractEventMapper.ts`

## Reihenfolge

F01 -> F03 -> F04 -> F05 -> F06 -> F07 -> F08 -> F09 -> F10 -> F11 -> F12 -> F13 -> F02 -> F14

## Dateien

- `auftrag-frontend-F01-routing-guards-2026-04-05.md`
- `auftrag-frontend-F02-design-tokens-konsistenz-2026-04-05.md`
- `auftrag-frontend-F03-pinia-state-ownership-2026-04-05.md`
- `auftrag-frontend-F04-rest-api-vertragsklarheit-2026-04-05.md`
- `auftrag-frontend-F05-websocket-realtime-contract-2026-04-05.md`
- `auftrag-frontend-F06-hardware-konfiguration-dnd-2026-04-05.md`
- `auftrag-frontend-F07-monitor-live-ansichten-2026-04-05.md`
- `auftrag-frontend-F08-dashboard-editor-widgets-2026-04-05.md`
- `auftrag-frontend-F09-logic-ui-ausfuehrungsfeedback-2026-04-05.md`
- `auftrag-frontend-F10-inventar-kalibrierung-2026-04-05.md`
- `auftrag-frontend-F11-systembetrieb-ops-plugins-2026-04-05.md`
- `auftrag-frontend-F12-auth-user-settings-2026-04-05.md`
- `auftrag-frontend-F13-notifications-quick-actions-2026-04-05.md`
- `auftrag-frontend-F14-tests-tooling-qualitaetsnetz-2026-04-05.md`
