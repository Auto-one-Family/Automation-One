# Auftrag F14: Tests, Tooling, Qualitaetsnetz

## Ziel
Messe, wie gut die Testlandschaft F01-F13 absichert, und leite konkrete, priorisierte Testauftraege fuer offene Risiken ab.

## IST-Wissen aus dem Frontend
- Tests liegen unter `tests/unit`, `tests/e2e`, `tests/mocks`.
- Unit und E2E sind vorhanden, aber nicht gleichmaessig ueber Bereiche verteilt.
- Contract-Drift kann durch Mocks verdeckt werden.

## Scope
- `El Frontend/tests/unit/**`
- `El Frontend/tests/e2e/**`
- `El Frontend/tests/mocks/**`
- `El Frontend/vitest.config.ts`
- `El Frontend/playwright*.ts`
- `El Frontend/package.json`

## Analyseaufgaben
1. Mappe Testabdeckung auf F01-F13 (Heatmap mit Luecken).
2. Pruefe E2E-Reisen fuer Hardware, Monitor, Editor, Auth, Admin.
3. Vergleiche Mock-Events/Schemata mit realem Eventvertrag.
4. Leite Regressionstest-Auftraege fuer alle P0/P1-Findings ab.

## Pflichtnachweise
- Testfall -> Input -> erwarteter Store/UI-Effekt.
- Mock-Schema -> reales Schema -> konkrete Abweichung.

## Akzeptanzkriterien
- Jede P0/P1-Luecke hat mindestens einen konkreten Testauftrag.
- Ergebnis enthaelt priorisierte Umsetzungsreihenfolge mit Aufwandsschaetzung.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F14-tests-tooling-qualitaetsnetz-2026-04-05.md`
