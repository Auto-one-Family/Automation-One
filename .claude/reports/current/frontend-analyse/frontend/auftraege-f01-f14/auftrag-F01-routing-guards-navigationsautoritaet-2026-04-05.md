# Auftrag F01: Routing, Guards, Navigationsautoritaet

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F01  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- Der Router bildet die operative Navigation ab: Public (`/login`, `/setup`) und geschuetzte Shell (`/` mit Child-Routen).
- Guard-Reihenfolge ist sicherheitsrelevant: zuerst Setup, dann Auth, dann Admin.
- Legacy-Redirects sind funktional noetig, erzeugen aber Ballast und koennen Diagnose verschaerfen.
- Deep Links fuer `/hardware`, `/monitor`, `/editor` sind Kern fuer Workflow-Kontinuitaet.

## IST-Befund
- Catch-all leitet auf `/hardware`; es gibt keinen expliziten 404-View.
- Viele Redirect-Pfade existieren parallel zu aktiven Routen.
- Guard-Mechanik ist robust, aber Recovery/Fehlersichtbarkeit fuer User kann klarer werden.

## SOLL-Zustand
- Eindeutige Navigationsautoritaet mit klarer Trennung: aktive Pfade vs. Legacy-Pfade.
- Deterministische Guard-Entscheidung fuer jeden Zustand (setup required, unauth, non-admin, admin).
- Transparente UX bei Zugriffsverweigerung und Fehlpfaden (404/AccessDenied statt stiller Umleitung).

## Analyseauftrag
1. Vollstaendige Routenmatrix erstellen: `route -> view|redirect -> requiresAuth|requiresAdmin -> Zweck`.
2. Legacy-Nutzung bewerten und Decommission-Kandidaten priorisieren.
3. Guard-Entscheidungsmatrix als Wahrheit dokumentieren (inkl. Fehler-/Recovery-Zweig).
4. Vorschlag fuer 404-/AccessDenied-UX mit minimalem Eingriff formulieren.

## [Korrektur] Verifizierter Ausfuehrungsrahmen (IST gegen Codebase)
- **Primaerer Agent:** `frontend-debug` (Analysefokus, keine ungefragten Code-Aenderungen).
- **Verbindliche Analyse-Dateien:**
  - `El Frontend/src/router/index.ts` (Routen, Redirects, `beforeEach`, Catch-all)
  - `El Frontend/src/shared/stores/auth.store.ts` (`setupRequired`, `isAuthenticated`, `isAdmin`, `checkAuthStatus`)
  - `El Frontend/src/shared/design/layout/Sidebar.vue` (navigative Einstiegspunkte)
  - `El Frontend/src/composables/useNavigationHistory.ts` (Route-Meta/Route-Label-Konsistenz)
  - `El Frontend/src/composables/useQuickActions.ts` (routebasierte Cross-Navigation)
- **Ziel-Output (verbindlich):**
  - `.claude/reports/current/frontend-analyse/report-frontend-F01-routing-guards-2026-04-05.md`
  - Falls schon vorhanden: inhaltlich aktualisieren/erganzen, nicht neuen Dateinamen erfinden.

## [Korrektur] Arbeitsreihenfolge fuer den Agent
1. Router-Inventar direkt aus `El Frontend/src/router/index.ts` extrahieren (aktive Routen, Legacy-Redirects, Catch-all getrennt markieren).
2. Guard-Reihenfolge 1:1 aus `router.beforeEach` dokumentieren (Setup -> Auth -> Admin -> Login/Setup-Exit).
3. Recovery-Zweig aus `auth.store.ts` pruefen (`checkAuthStatus()` Fehlerpfad und Auswirkungen auf Guard-Entscheidung).
4. Navigationseintraege gegen aktive Routen abgleichen (`Sidebar.vue`, `useNavigationHistory.ts`, `useQuickActions.ts`).
5. 404-/AccessDenied-Vorschlag als minimalen Eingriff formulieren, inkl. betroffener Router-Stellen in `index.ts`.

## [Korrektur] Output-Vertrag (MUSS im Report enthalten sein)
- Tabelle `Route Matrix` mit Klassifikation `active` vs. `legacy redirect`.
- Tabelle `Guard Matrix` mit mindestens: `setupRequired`, `isAuthenticated`, `isAdmin`, Zieltyp, Ergebnis.
- Abschnitt `Decommission-Kandidaten` mit Priorisierung `A/B/C` und Risiko begruendet.
- Abschnitt `404/AccessDenied Vorschlag` mit konkreten betroffenen Pfaden und erwarteter User-Wirkung.
- Abschnitt `Evidenz` mit konkreten Datei- und Symbolreferenzen (keine pauschalen Aussagen ohne Codebeleg).

## Scope
- **In Scope:** Router, Guard, Redirect-Strategie, Deep-Link-Konsistenz.
- **Out of Scope:** Backend-Auth-Logik, UI-Redesign ausserhalb Navigation.

## Nachweise
- Pfad-/Symbolbelege fuer alle Guard-Zweige und Redirects.
- Tabelle mit mindestens einem Happy Path und einem Stoerfall pro Guard-Zweig.
- Expliziter Abgleich `Navigationseintrag -> Zielroute` fuer Sidebar/QuickActions.

## Akzeptanzkriterien
- Jede produktive Route ist als `active` oder `legacy redirect` klassifiziert.
- Guard-Matrix ist testbar und ohne ungeklaerte Zweige.
- 404/AccessDenied-Vorschlag reduziert Blind-Redirects messbar.
- Report liegt am oben definierten Ziel-Output-Pfad und ist in sich reproduzierbar.

## Tests/Nachweise
- Unit: Guard-Entscheidungsmatrix (falls keine dedizierten Router-Unit-Tests existieren, Testluecke explizit markieren und minimalen Testvorschlag dokumentieren).
- E2E (Referenz): `El Frontend/tests/e2e/scenarios/auth.spec.ts` fuer Auth/Redirect-Basis; fehlende Guard-Faelle als Gap ausweisen.
