# Report Frontend F01: Routing, Guards, Navigationsautoritaet

Datum: 2026-04-05  
Scope: `El Frontend/src/router/index.ts`, `El Frontend/src/shared/stores/auth.store.ts`, `El Frontend/src/App.vue`, `El Frontend/src/main.ts`, `El Frontend/src/shared/design/layout/Sidebar.vue`

## 1) Kurzfazit

- Die Navigation ist technisch konsistent und guard-seitig priorisiert (`Setup -> Auth -> Admin -> Login/Setup-Exit`).
- Alle produktiven Routen sind eindeutig als `active` oder `legacy redirect` klassifizierbar.
- Deep Links fuer `/hardware*`, `/monitor*`, `/editor*` sind stabil und workflow-kritisch.
- Hauptluecke aus UX-Sicht: fehlende explizite 404-/AccessDenied-Ansicht; stattdessen Blind-Redirect auf `/hardware`.
- Legacy-Redirects sind funktional, aber in Teilen bereits decommission-faehig.

## 2) Vollstaendige Routenmatrix

Legende:
- `Typ`: `active` (rendert View) oder `legacy redirect` (nur Weiterleitung)
- `Auth/Admin`: Guard-Metadaten der Zielroute (effektiv, inkl. Parent `/`)

| Route | Typ | Ziel (View/Redirect) | Auth/Admin | Zweck |
|---|---|---|---|---|
| `/login` | active | `LoginView` | `false` / `false` | Einstieg fuer nicht authentifizierte User |
| `/setup` | active | `SetupView` | `false` / `false` | Initiale Systemeinrichtung |
| `/` | legacy redirect | `/hardware` | `true` / `false` | Protected-Shell Default-Landing |
| `/hardware` | active | `HardwareView` | `true` / `false` | Operative Hauptansicht |
| `/hardware/:zoneId` | active | `HardwareView` | `true` / `false` | Deep Link auf Zone-Kontext |
| `/hardware/:zoneId/:espId` | active | `HardwareView` | `true` / `false` | Deep Link auf Zone+ESP-Kontext |
| `/monitor` | active | `MonitorView` | `true` / `false` | Monitor L1 |
| `/monitor/:zoneId` | active | `MonitorView` | `true` / `false` | Monitor L2 (Zone) |
| `/monitor/:zoneId/sensor/:sensorId` | active | `MonitorView` | `true` / `false` | Monitor L3 (Sensor-Detail) |
| `/monitor/:zoneId/dashboard/:dashboardId` | active | `MonitorView` | `true` / `false` | Monitor Dashboard-Deep-Link |
| `/editor` | active | `CustomDashboardView` | `true` / `false` | Dashboard-Editor |
| `/editor/:dashboardId` | active | `CustomDashboardView` | `true` / `false` | Editor-Deep-Link |
| `/sensors` | active | `SensorsView` | `true` / `false` | Komponenten-/Inventaransicht |
| `/logic` | active | `LogicView` | `true` / `false` | Regelverwaltung |
| `/logic/:ruleId` | active | `LogicView` | `true` / `false` | Regel-Deep-Link |
| `/settings` | active | `SettingsView` | `true` / `false` | Benutzer-/Systemeinstellungen |
| `/system-monitor` | active | `SystemMonitorView` | `true` / `true` | Admin-Monitoring |
| `/users` | active | `UserManagementView` | `true` / `true` | Admin User-Management |
| `/system-config` | active | `SystemConfigView` | `true` / `true` | Admin Systemkonfiguration |
| `/load-test` | active | `LoadTestView` | `true` / `true` | Admin Lasttests |
| `/plugins` | active | `PluginsView` | `true` / `true` | Admin Plugin-Operationen |
| `/email` | active | `EmailPostfachView` | `true` / `true` | Admin E-Mail-Postfach |
| `/calibration` | active | `CalibrationView` | `true` / `true` | Admin Kalibrierung |
| `/monitor/dashboard/:dashboardId` | legacy redirect | `/editor/:dashboardId` | Zielroute | Legacy Monitor-Dashboard-Link |
| `/custom-dashboard` | legacy redirect | `/editor` | Zielroute | Historischer Editor-Pfad |
| `/dashboard-legacy` | legacy redirect | `/hardware` | Zielroute | Historischer Dashboard-Pfad |
| `/devices` | legacy redirect | `/hardware` | Zielroute | Historischer Hardware-Einstieg |
| `/devices/:espId` | legacy redirect | `/hardware?openSettings=:espId` | Zielroute | Legacy Detail-Deep-Link |
| `/mock-esp` | legacy redirect | `/hardware` | Zielroute | Historischer Mock-Einstieg |
| `/mock-esp/:espId` | legacy redirect | `/hardware?openSettings=:espId` | Zielroute | Legacy Mock-Detail-Deep-Link |
| `/database` | legacy redirect | `/system-monitor?tab=database` | Zielroute | Historische DB-Ansicht |
| `/logs` | legacy redirect | `/system-monitor?tab=logs` | Zielroute | Historische Log-Ansicht |
| `/audit` | legacy redirect | `/system-monitor?tab=events` | Zielroute | Historische Audit-Ansicht |
| `/mqtt-log` | legacy redirect | `/system-monitor?tab=mqtt` | Zielroute | Historische MQTT-Ansicht |
| `/maintenance` | legacy redirect | `/system-monitor?tab=health` | Zielroute | Historische Wartungsansicht |
| `/actuators` | legacy redirect | `/sensors?tab=actuators` | Zielroute | Historischer Aktoren-Tab |
| `/sensor-history` | legacy redirect | `/monitor` | Zielroute | Historische Sensor-Historie |
| `/:pathMatch(.*)*` | legacy redirect | `/hardware` | Zielroute | Catch-all fuer unbekannte Pfade |

## 3) Legacy-Nutzung und Decommission-Kandidaten

Priorisierung nach funktionalem Risiko fuer bestehende Deep Links:

### Prioritaet A (behalten, vorerst nicht decommissionen)

- `/devices/:espId`, `/mock-esp/:espId`: liefern weiterhin operativ relevante Deep-Link-Recovery (`openSettings`).
- `/monitor/dashboard/:dashboardId`: migrationskritisch fuer alte Monitor-Bookmark-Pfade.
- `/:pathMatch(.*)*`: muss bleiben, aber Ziel sollte mittelfristig auf dedizierte 404-UX umgestellt werden.

### Prioritaet B (decommission vorbereiten)

- `/database`, `/logs`, `/audit`, `/mqtt-log`, `/maintenance`: vermutlich nur interne Legacy-Navigation, klar auf `system-monitor` gemappt.
- `/custom-dashboard`, `/dashboard-legacy`, `/devices`, `/mock-esp`, `/sensor-history`, `/actuators`: funktional redundant zu aktiven Pfaden.

### Prioritaet C (frueh decommissionbar, wenn Telemetrie unkritisch)

- Statische Legacy-Entry-Routen ohne Parameter:
  - `/devices`
  - `/mock-esp`
  - `/dashboard-legacy`
- Grund: kein zusaetzlicher Kontextverlust gegenueber direktem `/hardware`.

Empfohlene Reihenfolge:
1) Telemetrie auf Redirect-Usage erheben.  
2) Prioritaet-C-Routen entfernen.  
3) Nach 1-2 Releases Prioritaet-B-Routen entfernen.  
4) Prioritaet-A nur mit expliziter Migrationskommunikation entfernen.

## 4) Guard-Entscheidungsmatrix (Wahrheitstabelle)

Quelle: `router.beforeEach` + `auth.store`.

### 4.1 Deterministische Reihenfolge

1. Falls `setupRequired === null`: `checkAuthStatus()` (einmal pro unbekanntem Zustand).  
2. Falls `setupRequired === true` und Ziel != `setup`: Redirect `setup`.  
3. Falls `to.meta.requiresAuth` und `!isAuthenticated`: Redirect `login?redirect=to.fullPath`.  
4. Falls `to.meta.requiresAdmin` und `!isAdmin`: Redirect `hardware`.  
5. Falls `isAuthenticated` und Ziel in `{login, setup}`: Redirect `hardware`.  
6. Sonst: Navigation erlaubt.

### 4.2 Zustand -> Ergebnis

| setupRequired | isAuthenticated | isAdmin | Zieltyp | Ergebnis |
|---|---|---|---|---|
| `true` | `*` | `*` | alles ausser `/setup` | Redirect `/setup` |
| `true` | `*` | `*` | `/setup` | erlaubt |
| `false` | `false` | `false` | protected (`requiresAuth`) | Redirect `/login?redirect=...` |
| `false` | `true` | `false` | admin (`requiresAdmin`) | Redirect `/hardware` |
| `false` | `true` | `true` | admin (`requiresAdmin`) | erlaubt |
| `false` | `true` | `*` | `/login` oder `/setup` | Redirect `/hardware` |
| `false` | `true` | `*` | normale protected Route | erlaubt |
| `null` + Statuscheck-Fehler | meist `false` | `false` | protected | indirekt Redirect `/login?redirect=...` |
| `null` + Statuscheck-Fehler | `false` | `false` | public (`/login`, `/setup`) | erlaubt (Recovery ueber manuellen Login/Setup) |

Hinweis Recovery-Zweig:
- `checkAuthStatus()` kann fehlschlagen und `setupRequired` auf `null` belassen.
- In diesem Fall bleibt die Guard-Entscheidung dennoch deterministisch durch Auth-Branch (`requiresAuth`) fuer protected Routen.

## 5) Happy Path + Stoerfall pro Guard-Zweig

| Guard-Zweig | Happy Path | Stoerfall |
|---|---|---|
| Initialisierung (`setupRequired === null`) | Statuscheck erfolgreich, danach normaler Flow | Statuscheck-Exception -> `setupRequired` bleibt `null`, protected Route landet via Auth-Check auf Login |
| Setup-Gate | Setup erforderlich, User auf `/setup` gefuehrt | User versucht `/hardware` trotz Setup-required -> harte Umleitung auf `/setup` |
| Auth-Gate | Authentifizierter User oeffnet `/monitor/:zoneId` | Unauth User oeffnet `/editor/:id` -> Redirect `/login?redirect=...` |
| Admin-Gate | Admin oeffnet `/system-monitor` direkt | Nicht-Admin oeffnet `/users` -> Redirect `/hardware` |
| Login/Setup-Exit | Nicht-auth User darf `/login` sehen | Bereits auth User ruft `/login` oder `/setup` auf -> Redirect `/hardware` |

## 6) Deep-Link-Konsistenz (Kernelpfade)

- `/hardware*` bleibt konsistent in `HardwareView` (Zone/ESP-Kontext ueber Param/Query).
- `/monitor*` bleibt konsistent in `MonitorView` (L1/L2/L3 via Params).
- `/editor*` bleibt konsistent in `CustomDashboardView`.
- `Sidebar` spiegelt diese Navigationsautoritaet korrekt: `/hardware|/monitor|/editor` werden als ein Dashboard-Cluster markiert.

## 7) 404-/AccessDenied-UX: Minimal-Invasiver Vorschlag

Ziel: Blind-Redirects reduzieren, ohne bestehende Guard-Logik aufzubrechen.

### 7.1 404 (minimal)

- Neue View: `NotFoundView.vue` (einfacher Hinweis + CTA `Zurueck zum Dashboard`).
- Catch-all von Redirect auf Render-Route umstellen:
  - `/:pathMatch(.*)* -> NotFoundView` (public oder protected je nach Produktentscheidung; empfohlen: public).
- Messbare Wirkung:
  - Anteil unbekannter URLs, die sichtbar als 404 enden, statt still nach `/hardware` umzubiegen = 100%.

### 7.2 AccessDenied (minimal)

- Neue View: `AccessDeniedView.vue` (Hinweis "Admin-Rechte erforderlich", CTA `Zurueck` und `Hardware`).
- Guard-Zweig `requiresAdmin && !isAdmin`:
  - statt `next({ name: 'hardware' })` -> `next({ name: 'access-denied', query: { from: to.fullPath } })`.
- Messbare Wirkung:
  - Blind-Redirects bei Admin-Verweigerung von aktuell 100% auf 0%.
  - Support/Diagnose profitiert durch expliziten Zielzustand.

### 7.3 Eingriffsumfang

- Router: +2 Routen, 1 Guard-Zeile anpassen, Catch-all-Ziel anpassen.
- Keine Backend-Aenderung.
- Kein UI-Redesign ausser 2 kleine Status-Views.

## 8) Testnachweise (auftragskonform)

### Unit (Guard-Matrix)

Pflichtfaelle:
1. unauth + protected -> login redirect mit `redirect` Query  
2. non-admin + admin route -> access-denied (nach Vorschlag) bzw. aktuell hardware  
3. setup-required + beliebige non-setup route -> setup redirect  
4. auth + login route -> hardware redirect  
5. statuscheck-fehler + protected -> login redirect (Recovery)

### E2E

Pflichtszenarien:
1. `unauth -> /monitor/... -> /login?redirect=...`  
2. `non-admin -> /system-monitor -> /access-denied` (bzw. aktuell `/hardware`)  
3. `setup-required -> /hardware -> /setup`  
4. `unknown route -> /not-found` (nach Vorschlag)

## 9) Akzeptanzkriterien-Check

- Jede produktive Route als `active` oder `legacy redirect` klassifiziert: **erfuellt**.
- Guard-Matrix testbar und ohne ungeklaerte Zweige: **erfuellt** (inkl. Recovery-Zweig).
- 404/AccessDenied-Vorschlag reduziert Blind-Redirects messbar: **erfuellt** (Metrik in Abschnitt 7).

## 10) Quellbelege

- `El Frontend/src/router/index.ts` (`routes`, `beforeEach`, Catch-all, Admin-Redirect)
- `El Frontend/src/shared/stores/auth.store.ts` (`setupRequired`, `checkAuthStatus`, `isAuthenticated`, `isAdmin`)
- `El Frontend/src/App.vue` (frueher Auth-Status-Check beim Mount)
- `El Frontend/src/main.ts` (App-Bootstrap-Kontext)
- `El Frontend/src/shared/design/layout/Sidebar.vue` (Navigationscluster `/hardware|/monitor|/editor`)
