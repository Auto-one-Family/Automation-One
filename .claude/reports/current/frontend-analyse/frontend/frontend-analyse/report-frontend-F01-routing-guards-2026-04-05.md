# Report Frontend F01: Routing, Guards, Navigationsautoritaet

Datum: 2026-04-05  
Scope: `El Frontend/src/main.ts`, `El Frontend/src/App.vue`, `El Frontend/src/router/index.ts`, `El Frontend/src/shared/design/layout/AppShell.vue`, `El Frontend/src/shared/design/layout/Sidebar.vue`, `El Frontend/src/shared/design/layout/TopBar.vue`

## 1) Ergebnis auf einen Blick

- Der Router ist konsistent aufgebaut: Public (`/login`, `/setup`), geschuetzte Shell unter `/`, Catch-all auf `/hardware`.
- Es gibt insgesamt **41 `path`-Eintraege im Router-File** (inkl. Redirect-Target-Objekte), davon **39 echte Route-Objekte**.
- Guard-Kette ist eindeutig priorisiert: **Setup > Auth > Admin > Login/Setup-Exit fuer eingeloggte User**.
- Deep Links fuer `/hardware*`, `/monitor*`, `/editor*` sind funktional und landen jeweils in derselben Ziel-View mit parametrisierter URL.
- Legacy-Pfade sind klar als Redirects markiert; aktive Views sind eindeutig von Legacy-Weiterleitungen trennbar.

## 2) Vollstaendiger Route-Graph

### 2.1 Graph (hierarchisch)

- Public:
  - `/login` -> `LoginView`
  - `/setup` -> `SetupView`
- Protected Shell:
  - `/` -> `AppShell` (requiresAuth)
    - `''` -> redirect `/hardware`
    - `hardware` -> `HardwareView`
    - `hardware/:zoneId` -> `HardwareView`
    - `hardware/:zoneId/:espId` -> `HardwareView`
    - `monitor` -> `MonitorView`
    - `monitor/dashboard/:dashboardId` -> redirect `/editor/:dashboardId`
    - `monitor/:zoneId` -> `MonitorView`
    - `monitor/:zoneId/sensor/:sensorId` -> `MonitorView`
    - `monitor/:zoneId/dashboard/:dashboardId` -> `MonitorView`
    - `editor` -> `CustomDashboardView`
    - `editor/:dashboardId` -> `CustomDashboardView`
    - `custom-dashboard` -> redirect `/editor`
    - `dashboard-legacy` -> redirect `/hardware`
    - `devices` -> redirect `/hardware`
    - `devices/:espId` -> redirect `/hardware?openSettings=:espId`
    - `mock-esp` -> redirect `/hardware`
    - `mock-esp/:espId` -> redirect `/hardware?openSettings=:espId`
    - `database` -> redirect `/system-monitor?tab=database`
    - `logs` -> redirect `/system-monitor?tab=logs`
    - `system-monitor` -> `SystemMonitorView` (requiresAdmin)
    - `audit` -> redirect `/system-monitor?tab=events`
    - `users` -> `UserManagementView` (requiresAdmin)
    - `system-config` -> `SystemConfigView` (requiresAdmin)
    - `load-test` -> `LoadTestView` (requiresAdmin)
    - `mqtt-log` -> redirect `/system-monitor?tab=mqtt`
    - `maintenance` -> redirect `/system-monitor?tab=health`
    - `plugins` -> `PluginsView` (requiresAdmin)
    - `email` -> `EmailPostfachView` (requiresAdmin)
    - `sensors` -> `SensorsView`
    - `actuators` -> redirect `/sensors?tab=actuators`
    - `logic` -> `LogicView`
    - `logic/:ruleId` -> `LogicView`
    - `settings` -> `SettingsView`
    - `calibration` -> `CalibrationView` (requiresAdmin)
    - `sensor-history` -> redirect `/monitor`
- Catch-all:
  - `/:pathMatch(.*)*` -> redirect `/hardware`

### 2.2 Aktive Pfade vs Legacy-Weiterleitungen

**Aktiv gerenderte Views (kein Redirect):**

- `/login`, `/setup`
- `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId`
- `/monitor`, `/monitor/:zoneId`, `/monitor/:zoneId/sensor/:sensorId`, `/monitor/:zoneId/dashboard/:dashboardId`
- `/editor`, `/editor/:dashboardId`
- `/system-monitor`, `/users`, `/system-config`, `/load-test`, `/plugins`, `/email`, `/calibration`
- `/sensors`, `/logic`, `/logic/:ruleId`, `/settings`

**Legacy-/Kompatibilitaets-Redirects:**

- `/monitor/dashboard/:dashboardId` -> `/editor/:dashboardId`
- `/custom-dashboard` -> `/editor`
- `/dashboard-legacy` -> `/hardware`
- `/devices`, `/devices/:espId`, `/mock-esp`, `/mock-esp/:espId`
- `/database`, `/logs`, `/audit`, `/mqtt-log`, `/maintenance`
- `/actuators`, `/sensor-history`
- Catch-all `/:pathMatch(.*)*` -> `/hardware`

## 3) Guard-Logik als explizite Entscheidungszweige

Quelle: `router.beforeEach(...)` in `src/router/index.ts`, Auth-State aus `shared/stores/auth.store.ts`.

1. **Initialisierung**
   - Wenn `setupRequired === null`: `await authStore.checkAuthStatus()`.
   - Effekt: Guard arbeitet erst nach initialer Auth-/Setup-Klaerung.

2. **Setup-Prioritaet**
   - Bedingung: `setupRequired === true` und Zielroute != `setup`.
   - Ergebnis: harte Umleitung auf `/setup`.

3. **Auth-Pflicht**
   - Bedingung: `to.meta.requiresAuth === true` und `!isAuthenticated`.
   - Ergebnis: Umleitung auf `/login?redirect=<to.fullPath>`.

4. **Admin-Pflicht**
   - Bedingung: `to.meta.requiresAdmin === true` und `!isAdmin`.
   - Ergebnis: Umleitung auf `/hardware`.

5. **Login/Setup fuer eingeloggte User sperren**
   - Bedingung: `isAuthenticated === true` und Ziel `login` oder `setup`.
   - Ergebnis: Umleitung auf `/hardware`.

6. **Default**
   - Keine Bedingung greift -> `next()`.

### 3.1 Prioritaetsfolge (wichtig)

- Setup-Redirect laeuft **vor** Auth/Admin.
- Admin-Check laeuft **nach** Auth-Check.
- Damit ist sichergestellt:
  - Uninitialisiertes System erzwingt `/setup`.
  - Nicht eingeloggte User sehen nie Admin-Ziele, sondern zuerst Login.
  - Eingeloggte Nicht-Admins werden von Admin-Routen auf `/hardware` umgelenkt.

## 4) Pflichtnachweis: Navigation -> Guard -> Zielview

### Flow A: Normale Navigation auf geschuetzte Route

- Beispiel: User ruft `/monitor/zone-a` auf.
- Guard:
  - Setup erledigt -> kein Setup-Redirect.
  - Route liegt unter Shell (`requiresAuth: true`) -> Auth erforderlich.
  - Bei gueltiger Session: kein Redirect.
- Ergebnis: `MonitorView` wird gerendert.

### Flow B: Direkter Aufruf Admin-Route ohne Admin-Rolle

- Beispiel: User ruft `/system-monitor` auf.
- Guard:
  - Auth ok.
  - `requiresAdmin: true`, aber `isAdmin === false`.
- Ergebnis: Redirect auf `/hardware`.

### Flow C: Nicht eingeloggter Zugriff auf geschuetzte Route

- Beispiel: User ruft `/editor/abc` auf.
- Guard:
  - `requiresAuth: true`, `isAuthenticated === false`.
- Ergebnis: Redirect auf `/login?redirect=/editor/abc`.

## 5) Pflichtnachweis: Legacy-Pfad -> Redirect -> Zielzustand

- `/devices/ESP_123` -> `/hardware?openSettings=ESP_123` -> `HardwareView` mit Query-gesteuertem Open-Intent.
- `/database` -> `/system-monitor?tab=database` -> `SystemMonitorView` auf Datenbank-Tab.
- `/monitor/dashboard/db42` -> `/editor/db42` -> `CustomDashboardView` (neues Dashboard-Ziel).
- Unbekannter Pfad (z. B. `/foo/bar`) -> Catch-all -> `/hardware` -> `HardwareView`.

## 6) Deep-Link-Verhalten (`/hardware*`, `/monitor*`, `/editor*`)

### 6.1 `/hardware*`

- Gueltige Deep Links:
  - `/hardware`
  - `/hardware/:zoneId`
  - `/hardware/:zoneId/:espId`
- Alle drei routen auf `HardwareView`; Parameter steuern Kontext (Zone/Geraet) statt View-Wechsel.
- Zusaetzlich Legacy-Ziele mit Query:
  - `/devices/:espId` und `/mock-esp/:espId` werden auf `/hardware?openSettings=:espId` abgebildet.

### 6.2 `/monitor*`

- Gueltige Deep Links:
  - `/monitor`
  - `/monitor/:zoneId`
  - `/monitor/:zoneId/sensor/:sensorId`
  - `/monitor/:zoneId/dashboard/:dashboardId`
- Alle vier routen auf `MonitorView`; URL modelliert L1/L2/L3-Navigation.
- Deprecated Sonderfall:
  - `/monitor/dashboard/:dashboardId` redirect auf `/editor/:dashboardId`.

### 6.3 `/editor*`

- Gueltige Deep Links:
  - `/editor`
  - `/editor/:dashboardId`
- Beide routen auf `CustomDashboardView` (Liste vs Detailkontext ueber Param).

## 7) Tabelle: Route, Meta, Guard-Regel, Effekt bei fehlender Berechtigung

| Route/Gruppe | Meta | Guard-Regel | Effekt bei fehlender Berechtigung |
|---|---|---|---|
| `/login` | `requiresAuth: false` | Zweig 5 (wenn bereits eingeloggt) | Eingeloggt: Redirect `/hardware`; sonst zugaenglich |
| `/setup` | `requiresAuth: false` | Zweig 2 und 5 | Nicht-Setup-System: zugaenglich; eingeloggte User: Redirect `/hardware` |
| Alle Child-Routen unter `/` | Parent `requiresAuth: true` | Zweig 3 | Nicht authentifiziert: Redirect `/login?redirect=...` |
| `/system-monitor` | `requiresAdmin: true` | Zweig 4 | Auth ok, aber kein Admin: Redirect `/hardware` |
| `/users` | `requiresAdmin: true` | Zweig 4 | Auth ok, aber kein Admin: Redirect `/hardware` |
| `/system-config` | `requiresAdmin: true` | Zweig 4 | Auth ok, aber kein Admin: Redirect `/hardware` |
| `/load-test` | `requiresAdmin: true` | Zweig 4 | Auth ok, aber kein Admin: Redirect `/hardware` |
| `/plugins` | `requiresAdmin: true` | Zweig 4 | Auth ok, aber kein Admin: Redirect `/hardware` |
| `/email` | `requiresAdmin: true` | Zweig 4 | Auth ok, aber kein Admin: Redirect `/hardware` |
| `/calibration` | `requiresAdmin: true` | Zweig 4 | Auth ok, aber kein Admin: Redirect `/hardware` |
| Alle Redirect-Only Legacy-Routen | i. d. R. keine eigene Meta | Zielroute entscheidet (erneuter Guard-Lauf) | Effekt entspricht Zielroute (`/hardware`, `/system-monitor?...`, `/editor...`) |
| Catch-all `/:pathMatch(.*)*` | keine Meta | Redirect auf `/hardware`, dann normale Guards | Nicht authentifiziert: via `/hardware` auf Login; sonst Hardware |

## 8) Catch-all-Verhalten inkl. Nebenwirkung

- Jeder unbekannte Pfad wird sofort auf `/hardware` umgeleitet.
- Nebenwirkung:
  - URL-Fehler werden "sanft" in die Hauptnavigation ueberfuehrt.
  - Bei nicht authentifizierten Usern folgt danach noch der Auth-Redirect auf Login (weil `/hardware` unter `requiresAuth` faellt).
  - Es gibt keinen 404-View; Fehlpfade sind fuer Nutzer nicht direkt als "nicht existent" erkennbar.

## 9) Zusatzbeobachtung zur Navigationsautoritaet (Shell/Sidebar/TopBar)

- `AppShell` kapselt alle geschuetzten Views unter einer gemeinsamen Layout-Autoritaet (Sidebar, TopBar, `RouterView`).
- `Sidebar` markiert Dashboard aktiv fuer alle `startsWith('/hardware' | '/monitor' | '/editor')`; damit bleiben Deep Links im selben Navigationscluster sichtbar.
- `TopBar` verwendet Route-Parameter (`zoneId`, `espId`, `sensorId`, `dashboardId`, `ruleId`) fuer Breadcrumb-Navigation; das stutzt die Deep-Link-Transparenz.

## 10) Akzeptanzkriterien-Check

- **Keine Route ohne Zielzuordnung:** Erfuellt (jede Route rendert View oder redirectet deterministisch).
- **Jeder Admin-Pfad mit Sperrverhalten:** Erfuellt (`requiresAdmin` + Guard-Zweig 4, Fallback `/hardware`).
- **Catch-all inkl. Nebenwirkung dokumentiert:** Erfuellt (siehe Abschnitt 8).

## 11) Verwendete Quellstellen

- `El Frontend/src/router/index.ts`
- `El Frontend/src/shared/stores/auth.store.ts`
- `El Frontend/src/App.vue`
- `El Frontend/src/main.ts`
- `El Frontend/src/shared/design/layout/AppShell.vue`
- `El Frontend/src/shared/design/layout/Sidebar.vue`
- `El Frontend/src/shared/design/layout/TopBar.vue`
