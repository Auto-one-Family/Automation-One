# Auftrag F01: App Shell, Routing, Guards, Navigationsautoritaet

## Ziel
Durchleuchte F01 so, dass jede aktive Route, jeder Redirect und jede Guard-Entscheidung belastbar dokumentiert ist.

## IST-Wissen aus dem Frontend
- Router enthaelt 41 Path-Eintraege inkl. Redirects/Catch-all.
- Root `/` leitet auf `/hardware`.
- Es gibt aktive Views und mehrere Legacy-Redirect-Pfade.
- Guards pruefen Setup, Auth und Admin-Rolle.

## Scope
- `El Frontend/src/main.ts`
- `El Frontend/src/App.vue`
- `El Frontend/src/router/index.ts`
- `El Frontend/src/shared/design/layout/AppShell.vue`
- `El Frontend/src/shared/design/layout/Sidebar.vue`
- `El Frontend/src/shared/design/layout/TopBar.vue`

## Analyseaufgaben
1. Erstelle einen vollstaendigen Route-Graph (inkl. Child-Routen, Redirects, Catch-all).
2. Zerlege `beforeEach` in explizite Entscheidungszweige und Ergebnisziele.
3. Validiere Deep-Link-Verhalten fuer `/hardware*`, `/monitor*`, `/editor*`.
4. Trenne aktiv genutzte Pfade sauber von Legacy-Weiterleitungen.

## Pflichtnachweise
- Ablauf: Navigation -> Guard -> Zielview.
- Ablauf: Legacy-Pfad -> Redirect -> Zielzustand.
- Tabelle: Route, Meta, Guard-Regel, Effekt bei fehlender Berechtigung.

## Akzeptanzkriterien
- Keine Route ohne Zielzuordnung.
- Jeder Admin-Pfad ist mit Sperrverhalten belegt.
- Catch-all-Verhalten ist inklusive Nebenwirkung dokumentiert.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F01-routing-guards-2026-04-05.md`
