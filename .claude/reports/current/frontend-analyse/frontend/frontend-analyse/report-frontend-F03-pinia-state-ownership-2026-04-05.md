# Report F03: Pinia State Ownership, Inter-Store-Kommunikation, Mutationssemantik

Datum: 2026-04-05  
Scope: `El Frontend/src/shared/stores/*.store.ts`, `El Frontend/src/shared/stores/index.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/stores/esp-websocket-subscription.ts`

## 1) Ownership-Matrix (SSoT / Derived / Transient)

Legende:
- **SSoT** = primaere Wahrheit fuer Domain/Feature.
- **Derived** = ausschliesslich aus anderem Store/API ableitbar.
- **Transient** = UI- oder Ablaufzustand ohne langlebige Fachwahrheit.

| Store | SSoT | Derived | Transient | Seiteneffekte | Risiko |
|---|---|---|---|---|---|
| `esp` | `devices[]`, `pendingDevices[]` | `onlineDevices`, `offlineDevices`, `mockDevices`, `pendingCount` | `selectedDeviceId`, `isLoading`, `error`, WS-Handler-Registry | REST CRUD, WS Dispatch, Cross-store Delegation, Toasts | **P1** (zentraler Orchestrator) |
| `zone` | `zoneEntities[]` | `activeZones`, `archivedZones` | `isLoadingZones` | REST CRUD, writes in `esp.devices` via callback, Toasts | **P1** (schreibt in fremde SSoT) |
| `auth` | `user`, `accessToken`, `refreshToken`, `setupRequired` | `isAuthenticated`, `isAdmin`, `isOperator` | `isLoading`, `error` | `localStorage`, WS disconnect, reset `intentSignals` | **P1** (Session-Grenze) |
| `actuator` | Intent-Lifecycle interne Maps (`intents`, `pendingCommands`) | none | Timeouts, contract mismatch handling | Toasts, terminal/non-terminal intent tracking | **P1** (Command-Finalitaet) |
| `sensor` | none (mutiert `esp.devices[*].sensors`) | none | none | WS-only Mutationen auf Sensorwerten/Qualitaet | **P1** (fremde SSoT-Mutation) |
| `config` | none (UI-Rueckmeldung) | none | none | Toasts, GPIO refresh trigger | **P2** |
| `deviceContext` | `contexts: Map<config_id, context>` | Getter pro config_id | `isLoaded` | REST load/set/clear, WS granular update, Toasts | **P2** |
| `notification-inbox` | `notifications[]`, `unreadCount`, `highestSeverity` | `filtered/grouped/badge` | Drawer/Prefs/Paging | REST load/mark, WS update/new/count, Browser Notification | **P1** (Operator-Alarmflaeche) |
| `alert-center` | `alertStats`, `activeAlerts` | `unresolvedCount`, `hasCritical`, MTTA/MTTR | Polling timer, loading flags | REST lifecycle actions, mutiert inbox-store Eintrag | **P1** (cross-store write + polling) |
| `dashboard` | `layouts[]`, panel targets, filter state | status/device counts aus `esp`, panel computed | sync flags, nav requests | `localStorage` cache, REST sync/merge/dedup, orphan cleanup via `zone` | **P1** (Dual-Write local/server) |
| `logic` | `rules[]`, `executionHistory[]` | `connections`, `crossEspConnections`, enabled count | wsSubscriptionId, undo/redo history | REST CRUD/test, WS subscription | **P2** |
| `inventory` | Tabellen-UI-Zustand (filter/sort/page/columns) | `allComponents` aus `esp` + composables | Detail panel state | `localStorage` prefs | **P2** |
| `plugins` | `plugins[]`, `selectedPlugin`, `executionHistory` | enabled/disabled/category/options | `isLoading`, `isExecuting` | REST list/detail/execute/toggle/config | **P3** |
| `diagnostics` | `currentReport`, `history`, `availableChecks` | status counts, `lastRunAge` | running flags | REST run/check/history/export | **P3** |
| `database` | `tables/currentSchema/currentData/queryParams` | totals/pages/columns | selection/loading/error | REST explorer calls | **P3** |
| `gpio` | `gpioStatusMap`, `oneWireScanStates` | pin status projection | loading flags, scan state | REST status + onewire, heartbeat merge, Toasts | **P2** |
| `notification` | none (toast bridge) | none | none | toast side effects + window event dispatch | **P2** |
| `quickAction` | FAB state (`isMenuOpen`, `activePanel`, actions) | `alertSummary` from inbox+alert-center | UI only | no persistence | **P3** |
| `ui` | modal stack / confirm/context menu state | `hasOpenModal`, `topModal` | UI only | no persistence | **P3** |
| `dragState` | global drag flags/payloads | `isAnyDragActive` | timeout/listener stats | global browser listeners, safety reset | **P2** |

## 2) Inter-Store-Aufrufketten inkl. Seiteneffekte

### 2.1 Zentrale Kette: `esp` als WS-Dispatcher (P1)
- `esp.initWebSocket()` registriert alle `ws.on(...)` Handler.
- Jeder Event wird in spezialisierte Stores delegiert (`sensor`, `actuator`, `zone`, `notification`, `notification-inbox`, `config`, `intentSignals`).
- Seiteneffekte:
  - Mutationen in `esp.devices` (direkt oder indirekt).
  - Toasts in mehreren Stores.
  - Teilweise `fetchAll()` als defensive Voll-Refetch-Strategie (`subzone_assignment`, `device_scope_changed`, `device_context_changed`).

### 2.2 Cross-store write patterns
- `zone.handleZoneAssignment(...)` bekommt `setDevice(...)` Callback aus `esp` und schreibt damit in `esp.devices`.
- `alert-center._updateAlertInLists(...)` schreibt in `notification-inbox.notifications`.
- `auth.logout()` loest `websocketService.disconnect()` und `intentSignals.clearAll()` aus.

### 2.3 API-getriebene Ketten
- `dashboard.fetchLayouts()`:
  - Serverdaten holen -> mit local cache mergen -> dedup -> ggf. serverseitig loeschen/re-sync.
- `deviceContext.setContext/clearContext()`:
  - REST write -> lokale Map aktualisieren -> spaeter WS echo kann erneut schreiben.
- `logic.subscribeToWebSocket()`:
  - Eigene WS-Subscription ausserhalb des zentralen `esp`-Dispatchers.

## 3) Lokale Persistenz und Driftpotenziale

Persistenzstellen:
- `auth`: Tokens in `localStorage`.
- `dashboard`: Layout cache in `localStorage` plus server sync.
- `inventory`: page size + visible columns in `localStorage`.

Driftpotenziale:
- **P1 - Dashboard dual source drift**: `localStorage` + Server koennen divergieren; Store mitigiert durch merge/dedup/orphan-sync, aber eventual consistency bleibt.
- **P2 - Token stale state**: `auth` korrigiert ueber `checkAuthStatus()` + refresh; bei Fehler wird `clearAuth()` ausgefuehrt.
- **P2 - Inventory prefs**: rein UI-bezogen, geringe fachliche Auswirkung.
- **P2 - Device context**: REST write + WS echo + `fetchAll()` in `esp` kann kurzzeitige Doppelaktualisierung erzeugen (idempotent, aber noisy).

## 4) Mutationssemantik pro Kernentity

## Device
- **Replace-semantik als Standard**:
  - `esp.fetchAll()` ersetzt gesamten `devices` Array (`devices.value = dedupedDevices`).
  - `esp.fetchDevice()` ersetzt Eintrag per Index oder fuegt hinzu.
  - `esp.handleEspHealth()` ersetzt komplettes Device-Objekt fuer Reaktivitaet.
- **Delete-semantik**:
  - `esp.deleteDevice()` filtert lokal immer aus Array (auch bei 404).
- **Risiko**:
  - Mehrere Writer (`esp`, `zone` via callback) auf gleicher Struktur -> hohe Kopplung (**P1**).

## Sensor
- **In-place mutation in nested structure**:
  - `sensor.handleSensorData()` mutiert Sensorobjekte direkt (raw_value, quality, unit, last_read).
  - `esp.handleSensorConfigDeleted()` filtert `device.sensors`.
- **Semantik**:
  - Update ist eventbasiert (WS), kein zentraler entity-reducer.
- **Risiko**:
  - Direkte nested mutation in fremder SSoT; reactivity kann bei tiefen Strukturen fragil sein (**P1**).

## Actuator
- **In-place mutation + intent lifecycle**:
  - `actuator.handleActuatorStatus()` mutiert Actuator in `esp.devices`.
  - `esp.handleActuatorConfigDeleted()` filtert `device.actuators`.
  - `actuator` fuehrt zusaetzlich eigenen Intent-Status als Neben-SSoT (pending/terminal).
- **Risiko**:
  - Zwei Ebenen von Wahrheit (device state vs intent map) -> Synchronitaet kritisch (**P1**).

## Notification
- **Split ownership**:
  - `notification`: transiente Toast-Bridge.
  - `notification-inbox`: persistente Liste + unread badge.
  - `alert-center`: lifecycle/statistics, schreibt teilweise in inbox.
- **Risiko**:
  - Ueberlappung inbox/alert-center plus verschiedene Datenquellen (REST, WS, polling) -> Konsistenzfenster (**P1**).

## 5) Pflichtnachweis A: REST-Response -> Mutation -> Reaktivitaet in View

Beispielpfad `esp.fetchAll()`:
1. REST: `espApi.listDevices(...)`.
2. Mutation: dedup + `devices.value = dedupedDevices` (Array replace).
3. Reaktivitaet:
   - `dashboard.statusCounts` (computed auf `esp.devices`) aktualisiert Header/TopBar.
   - Views mit Devicelisten (Hardware/Monitor/Inventory) erhalten neue Daten.

Beispielpfad `zone.createZone()`:
1. REST: `zonesApi.createZoneEntity(...)`.
2. Mutation: `zoneEntities.value.push(zone)`.
3. Reaktivitaet:
   - `activeZones/archivedZones` computed aktualisieren Auswahllisten/Filter.

## 6) Pflichtnachweis B: WS-Event -> `esp.ts` -> Zielstore -> UI-Effekt

Beispiel `sensor_data`:
1. WS Event kommt ueber `ws.on('sensor_data', handleSensorData)` in `esp`.
2. `esp.handleSensorData(...)` delegiert an `sensorStore.handleSensorData(...)`.
3. Zielmutation: Sensorwerte in `esp.devices[*].sensors[*]` werden aktualisiert.
4. UI-Effekt: SensorCards/Charts zeigen neuen Wert und Qualitaetsstatus.

Beispiel `notification_new`:
1. WS Event in `esp` (`ws.on('notification_new', handleNotificationNew)`).
2. Delegation an `notificationInboxStore.handleWSNotificationNew(...)`.
3. Zielmutation: `notifications.unshift(...)`, `unreadCount++`.
4. UI-Effekt: Inbox-Badge/FAB-Badge aktualisiert; bei critical ggf. Browser Notification.

## 7) Implizite Kopplungen und P-Risiko-Klassifizierung

### P1 (hoch)
1. **`esp` als Mega-Orchestrator**: sehr viele Eventtypen + fachliche Delegation + eigene Mutationen.
2. **Cross-store writes** (`zone -> esp.devices`, `alert-center -> notification-inbox`).
3. **Split Notification Ownership** (`notification`, `notification-inbox`, `alert-center`) mit REST+WS+Polling.
4. **Dual state fuer Actuator** (device actuator state vs intent lifecycle map).

### P2 (mittel)
1. **Voll-Refetch als Konsistenzstrategie** bei einigen WS Events (`fetchAll()` nach scope/context/subzone).
2. **Dashboard cache+server sync** trotz vorhandener Guardrails (merge, dedup, orphan cleanup).
3. **Global listener in `dragState`** (sicherheitsbedingt sinnvoll, aber globaler Einfluss).

### P3 (niedrig)
1. UI-only Stores (`ui`, Teile von `quickAction`) mit geringer fachlicher Kritikalitaet.
2. Feature-spezifische Stores (`plugins`, `diagnostics`, `database`) mit klarer API-Grenze.

## 8) Input / Output / Seiteneffekt / Risiko je produktivem Store (kompakt)

| Store | Input | Output | Seiteneffekt | Risiko |
|---|---|---|---|---|
| `esp` | REST + WS | Device/Pending state fuer gesamte App | Dispatch, Refetch, Toasts | P1 |
| `zone` | REST + WS ack events | Zone entities + zone/subzone updates | schreibt via callback in `esp` | P1 |
| `auth` | REST auth endpoints | session/auth state | localStorage, WS disconnect | P1 |
| `sensor` | WS sensor events | aktualisierte Sensorfelder in devices | mutiert nested data | P1 |
| `actuator` | WS actuator/config/sequence events | intent lifecycle + actuator updates | timeouts/toasts/contracts | P1 |
| `config` | WS config events | keine eigene Domainliste | toasts + gpio refresh | P2 |
| `notification-inbox` | REST + WS | inbox list/badge | browser notifications | P1 |
| `alert-center` | REST + polling + inbox read | stats + active alerts | inbox mutation | P1 |
| `dashboard` | REST dashboards + local cache + esp/zone reads | layouts + panel projections | localStorage + sync | P1 |
| `logic` | REST + WS logic_execution | rules + history + graph state | websocket subscribe | P2 |
| `deviceContext` | REST + WS context_changed | contexts map | toasts | P2 |
| `inventory` | esp-derived data | filtered/sorted table data | localStorage prefs | P2 |
| `gpio` | REST + heartbeat data | gpio status + onewire state | scan toasts | P2 |
| `database` | REST explorer | table/record state | none beyond API | P3 |
| `diagnostics` | REST diagnostics | report/history/check status | none beyond API | P3 |
| `plugins` | REST plugins | plugin list/detail/history | execution toasts | P3 |

## 9) Bewertung gegen Akzeptanzkriterien

- **"Fuer jeden produktiven Store sind Input, Output, Seiteneffekt und Risiko benannt"**: erfuellt (Abschnitte 1 + 8).
- **"Implizite Kopplungen sind als P-Risiko klassifiziert"**: erfuellt (Abschnitt 7).
- **Pflichtnachweise REST- und WS-Ablauf**: erfuellt (Abschnitte 5 + 6).

## 10) Kurzfazit

Die aktuelle Struktur ist funktional und robust in der Laufzeit, aber stark auf `esp` als zentrale Event-Drehscheibe zugeschnitten. Die groessten Architektur-Risiken liegen nicht in fehlender Funktionalitaet, sondern in Ownership-Ueberlappung und cross-store Schreibpfaden. Fuer Folgeauftraege sollte Prioritaet auf klareren Store-Grenzen (ein Writer pro Kernentity) und reduzierter indirekter Mutation liegen.

