# Report Frontend F01: Routing, Guards, Navigationsautoritaet

Datum: 2026-04-06  
Scope: `El Frontend/src/router/index.ts`, `El Frontend/src/shared/stores/auth.store.ts`, `El Frontend/src/shared/design/layout/Sidebar.vue`, `El Frontend/src/composables/useNavigationHistory.ts`, `El Frontend/src/composables/useQuickActions.ts`

## 1) Kurzfazit

- Die Guard-Reihenfolge ist deterministisch und sicherheitskonform: `Setup -> Auth -> Admin -> Login/Setup-Exit`.
- Die produktiven Pfade sind sauber als `active` oder `legacy redirect` klassifizierbar.
- Deep-Links fuer `/hardware*`, `/monitor*`, `/editor*` sind stabil und in Navigation/Composables angebunden.
- UX-Luecke bleibt: Catch-all und Admin-Verweigerung enden aktuell in stillen Redirects (`/hardware`) statt expliziter Fehlersicht.
- Mehrere Legacy-Pfade sind decommission-faehig, sollten aber nach Risiko/Usage gestaffelt entfernt werden.

## 2) Route Matrix

Legende:
- `Typ`: `active` = rendert View, `legacy redirect` = reine Weiterleitung
- `Auth/Admin`: effektiver Guard-Kontext (Child-Routen erben `requiresAuth: true` vom Parent `/`)

| Route | Typ | Ziel (View/Redirect) | Auth/Admin | Zweck |
|---|---|---|---|---|
| `/login` | active | `LoginView` | `false / false` | Public Login |
| `/setup` | active | `SetupView` | `false / false` | Public Initial-Setup |
| `/` | legacy redirect | `/hardware` | `true / false` | Protected Root-Landing |
| `/hardware` | active | `HardwareView` | `true / false` | Operative Hauptansicht |
| `/hardware/:zoneId` | active | `HardwareView` | `true / false` | Deep-Link auf Zone |
| `/hardware/:zoneId/:espId` | active | `HardwareView` | `true / false` | Deep-Link auf Zone+ESP |
| `/monitor` | active | `MonitorView` | `true / false` | Monitor L1 |
| `/monitor/:zoneId` | active | `MonitorView` | `true / false` | Monitor L2 |
| `/monitor/:zoneId/sensor/:sensorId` | active | `MonitorView` | `true / false` | Monitor L3 Sensor |
| `/monitor/:zoneId/dashboard/:dashboardId` | active | `MonitorView` | `true / false` | Monitor Dashboard-Deep-Link |
| `/editor` | active | `CustomDashboardView` | `true / false` | Dashboard-Editor |
| `/editor/:dashboardId` | active | `CustomDashboardView` | `true / false` | Editor-Deep-Link |
| `/sensors` | active | `SensorsView` | `true / false` | Komponenten/Wissensdatenbank |
| `/logic` | active | `LogicView` | `true / false` | Regelverwaltung |
| `/logic/:ruleId` | active | `LogicView` | `true / false` | Regel-Deep-Link |
| `/settings` | active | `SettingsView` | `true / false` | Einstellungen |
| `/system-monitor` | active | `SystemMonitorView` | `true / true` | Admin Monitoring |
| `/users` | active | `UserManagementView` | `true / true` | Admin Benutzer |
| `/system-config` | active | `SystemConfigView` | `true / true` | Admin Konfiguration |
| `/load-test` | active | `LoadTestView` | `true / true` | Admin Lasttests |
| `/plugins` | active | `PluginsView` | `true / true` | Admin Plugins |
| `/email` | active | `EmailPostfachView` | `true / true` | Admin Postfach |
| `/calibration` | active | `CalibrationView` | `true / true` | Admin Kalibrierung |
| `/monitor/dashboard/:dashboardId` | legacy redirect | `/editor/:dashboardId` | Zielroute | Legacy Monitor-Dashboard |
| `/custom-dashboard` | legacy redirect | `/editor` | Zielroute | Historischer Editor-Pfad |
| `/dashboard-legacy` | legacy redirect | `/hardware` | Zielroute | Historischer Dashboard-Pfad |
| `/devices` | legacy redirect | `/hardware` | Zielroute | Historischer Device-Einstieg |
| `/devices/:espId` | legacy redirect | `/hardware?openSettings=:espId` | Zielroute | Legacy Device-Detail |
| `/mock-esp` | legacy redirect | `/hardware` | Zielroute | Historischer Mock-Einstieg |
| `/mock-esp/:espId` | legacy redirect | `/hardware?openSettings=:espId` | Zielroute | Legacy Mock-Detail |
| `/database` | legacy redirect | `/system-monitor?tab=database` | Zielroute | Historische DB-View |
| `/logs` | legacy redirect | `/system-monitor?tab=logs` | Zielroute | Historische Logs-View |
| `/audit` | legacy redirect | `/system-monitor?tab=events` | Zielroute | Historische Audit-View |
| `/mqtt-log` | legacy redirect | `/system-monitor?tab=mqtt` | Zielroute | Historische MQTT-View |
| `/maintenance` | legacy redirect | `/system-monitor?tab=health` | Zielroute | Historische Wartungs-View |
| `/actuators` | legacy redirect | `/sensors?tab=actuators` | Zielroute | Historischer Aktoren-Einstieg |
| `/sensor-history` | legacy redirect | `/monitor` | Zielroute | Historische Sensor-Historie |
| `/:pathMatch(.*)*` | legacy redirect | `/hardware` | Zielroute | Catch-all (aktuell Blind-Redirect) |

## 3) Guard Matrix

### 3.1 Tatsächliche Auswertungsreihenfolge (`beforeEach`)

1. `setupRequired === null` -> `checkAuthStatus()`
2. `setupRequired === true && to.name !== 'setup'` -> Redirect `setup`
3. `to.meta.requiresAuth && !isAuthenticated` -> Redirect `login?redirect=to.fullPath`
4. `to.meta.requiresAdmin && !isAdmin` -> Redirect `hardware`
5. `isAuthenticated && (to.name === 'login' || to.name === 'setup')` -> Redirect `hardware`
6. sonst `next()`

### 3.2 Wahrheitstabelle (inkl. Recovery)

| setupRequired | isAuthenticated | isAdmin | Zieltyp | Ergebnis |
|---|---|---|---|---|
| `true` | `*` | `*` | alles ausser `/setup` | Redirect `/setup` |
| `true` | `*` | `*` | `/setup` | erlaubt |
| `false` | `false` | `false` | `requiresAuth` | Redirect `/login?redirect=...` |
| `false` | `true` | `false` | `requiresAdmin` | Redirect `/hardware` |
| `false` | `true` | `true` | `requiresAdmin` | erlaubt |
| `false` | `true` | `*` | `/login` oder `/setup` | Redirect `/hardware` |
| `false` | `true` | `*` | normale protected Route | erlaubt |
| `null` + `checkAuthStatus()` Fehler | meist `false` | `false` | `requiresAuth` | indirekt Login-Redirect ueber Auth-Gate |
| `null` + `checkAuthStatus()` Fehler | `false` | `false` | public (`/login`, `/setup`) | erlaubt (Recovery via Login/Setup) |

## 4) Happy Path und Stoerfall je Guard-Zweig

| Guard-Zweig | Happy Path | Stoerfall |
|---|---|---|
| Setup-Initialisierung | Statuscheck erfolgreich, anschliessend normaler Flow | Statuscheck wirft Exception -> `setupRequired` bleibt `null`, protected Route landet via Auth-Gate auf Login |
| Setup-Gate | Setup erforderlich, User kommt auf `/setup` | User versucht `/hardware` trotz Setup-required -> harte Umleitung auf `/setup` |
| Auth-Gate | Auth-User oeffnet `/monitor/:zoneId` | Unauth-User oeffnet `/editor/:dashboardId` -> `/login?redirect=...` |
| Admin-Gate | Admin oeffnet `/system-monitor` | Non-Admin oeffnet `/users` -> Redirect `/hardware` |
| Login/Setup-Exit | Unauth-User darf `/login` sehen | Bereits authentifizierter User ruft `/login` oder `/setup` auf -> Redirect `/hardware` |

## 5) Navigationseintraege gegen aktive Routen

### 5.1 Sidebar-Abgleich (`Sidebar.vue`)

| Navigationseintrag | Zielroute | Aktiv-Matching | Bewertung |
|---|---|---|---|
| Dashboard | `/hardware` | aktiv auch bei `/monitor*` und `/editor*` | Konsistent als Operations-Cluster |
| Regeln | `/logic` | `startsWith('/logic')` | Konsistent |
| Komponenten | `/sensors` | `startsWith('/sensors')` | Konsistent |
| System (Admin) | `/system-monitor` | `startsWith('/system-monitor')` | Konsistent |
| Benutzer (Admin) | `/users` | `startsWith('/users')` | Konsistent |
| Kalibrierung (Admin) | `/calibration` | `startsWith('/calibration')` | Konsistent |
| Plugins (Admin) | `/plugins` | `startsWith('/plugins')` | Konsistent |
| Postfach (Admin) | `/email` | `startsWith('/email')` | Konsistent |
| Einstellungen | `/settings` | `startsWith('/settings')` | Konsistent |

### 5.2 Navigation-History-Abgleich (`useNavigationHistory.ts`)

- `ROUTE_META` mapped bekannte Basispfade (`/hardware`, `/monitor`, `/editor`, `/system-monitor`, etc.) sauber auf Labels/Icons.
- Public-Routen werden bewusst nicht in History aufgenommen (`to.meta.requiresAuth === false`).
- Residual-Risiko: Label fuer `/sensors` lautet dort `Sensoren & Aktoren`, waehrend Sidebar `Komponenten` verwendet (nur Begriffsinkonsistenz, kein Routing-Fehler).

### 5.3 QuickActions-Abgleich (`useQuickActions.ts`)

- Context-Resolver deckt aktive Routenfamilien ab: `/hardware`, `/monitor`, `/logic`, `/system-monitor`, `/editor`, `/settings`, `/sensors`, `/plugins`.
- Routebasierte Aktionen zielen auf existente aktive Routen oder bekannte Tab-Queries (`/system-monitor?tab=...`).
- Kein Hinweis auf verwaiste Navigation oder nicht vorhandene Zielpfade.

## 6) Decommission-Kandidaten (A/B/C)

### Prioritaet A (vorerst behalten)

- `/devices/:espId`, `/mock-esp/:espId`  
  Risiko: Verlust operativer Deep-Link-Recovery (`openSettings`) fuer alte Bookmarks/Tools.
- `/monitor/dashboard/:dashboardId`  
  Risiko: Bruch historischer Dashboard-Links aus altem Monitor-Flow.
- `/:pathMatch(.*)*`  
  Muss bleiben als Fallback, aber Ziel sollte von Blind-Redirect auf explizite 404-Route wechseln.

### Prioritaet B (decommission vorbereiten)

- `/database`, `/logs`, `/audit`, `/mqtt-log`, `/maintenance`  
  Risiko moderat: Historische Admin-Einstiege, funktional in `system-monitor` Tabs gebuendelt.
- `/custom-dashboard`, `/devices`, `/mock-esp`, `/sensor-history`, `/actuators`, `/dashboard-legacy`  
  Risiko moderat bis gering: weitgehend redundante Legacy-Einstiege.

### Prioritaet C (frueh decommissionbar nach kurzer Beobachtung)

- Statische Legacy-Einstiege ohne Kontextverlust: `/devices`, `/mock-esp`, `/dashboard-legacy`
- Risiko gering, da Redirect-Ziel bereits direkt die operative Hauptroute ist.

Empfohlene Reihenfolge:
1. Redirect-Usage instrumentieren (Metrik je Legacy-Pfad).
2. C entfernen.
3. Nach 1-2 Releases B entfernen.
4. A nur mit explizitem Migrationshinweis entfernen.

## 7) 404/AccessDenied Vorschlag (minimaler Eingriff)

### 7.1 404 fuer unbekannte Pfade

- Betroffene Stelle: Catch-all in `router/index.ts` (`/:pathMatch(.*)*`).
- Aenderung: statt Redirect auf `/hardware` eine explizite `NotFoundView` Route rendern.
- Erwartete User-Wirkung: Fehlpfad wird sichtbar und diagnostizierbar; kein stilles Umspringen mehr.

### 7.2 AccessDenied fuer Admin-Sperren

- Betroffene Stelle: Guard-Zweig `to.meta.requiresAdmin && !authStore.isAdmin`.
- Aenderung: statt `next({ name: 'hardware' })` auf `next({ name: 'access-denied', query: { from: to.fullPath } })`.
- Erwartete User-Wirkung: klare Rueckmeldung "Rechte fehlen", bessere Selbsthilfe und Support-Diagnose.

### 7.3 Wirkungsmetriken

- Blind-Redirects bei unbekannten Pfaden: von derzeit 100% auf 0%.
- Blind-Redirects bei Admin-Verweigerung: von derzeit 100% auf 0%.

## 8) Testluecken und Minimal-Testvorschlag

- Router-Unit-Tests fuer Guard-Matrix sind in diesem Scope nicht sichtbar -> Testluecke markieren.
- Minimalvorschlag (Unit):
  1. unauth + protected -> Login inkl. `redirect`
  2. setup-required + non-setup -> Setup-Redirect
  3. non-admin + admin-route -> aktuell Hardware (nach Vorschlag AccessDenied)
  4. auth + `/login` -> Hardware
  5. Statuscheck-Fehler + protected -> Login-Recovery
- E2E-Referenzbasis bleibt `El Frontend/tests/e2e/scenarios/auth.spec.ts`; fehlende Guard-Szenarien sollten ergänzt werden.

## 9) Evidenz

- `El Frontend/src/router/index.ts`
  - `routes`-Definition (aktive Pfade, Legacy-Redirects, Catch-all)
  - `router.beforeEach` (Guard-Reihenfolge)
- `El Frontend/src/shared/stores/auth.store.ts`
  - `setupRequired`, `isAuthenticated`, `isAdmin`
  - `checkAuthStatus()` inkl. Fehler-/Recovery-Pfad
- `El Frontend/src/shared/design/layout/Sidebar.vue`
  - Navigationseintraege und Aktiv-Cluster (`/hardware|/monitor|/editor`)
- `El Frontend/src/composables/useNavigationHistory.ts`
  - `ROUTE_META`, `resolveRouteLabel`, `router.afterEach` Tracking-Filter
- `El Frontend/src/composables/useQuickActions.ts`
  - `resolveViewContext`, `buildContextActions`, routebasierte Cross-Navigation
