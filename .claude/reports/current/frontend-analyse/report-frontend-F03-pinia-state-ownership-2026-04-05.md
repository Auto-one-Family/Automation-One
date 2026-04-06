# Report F03: Pinia State Ownership und Kopplungen (Finalisierung)

Datum: 2026-04-05  
Scope: `El Frontend/src/stores/esp.ts`, `El Frontend/src/stores/esp-websocket-subscription.ts`, `El Frontend/src/shared/stores/*.store.ts`

## 1) Ownership-Matrix final (Entity -> Owner -> erlaubte Fremdschreiber)

| Entity | Owner-Store (SSoT) | Erlaubte Fremdschreiber (nur technisch noetig) | Verbotene Fremdschreiber (Soll) |
|---|---|---|---|
| Device (`devices[]`) | `esp` | `zone` (nur ueber expliziten Device-Write-Adapter), `sensor` (nur Sensor-Teilpatch), `actuator` (nur Actuator-Teilpatch) | Jeder andere Store, direkte Component-Writes |
| Sensorzustand (Werte/Qualitaet in Device) | `esp` (Sub-Owner Sensor-Teilbereich) | `sensor` (WS-Delta), `esp` (Delete/Refresh) | `zone`, `dashboard`, `notification-*` |
| Actuatorzustand (state/pwm/emergency in Device) | `esp` (Sub-Owner Actuator-Teilbereich) | `actuator` (WS-Delta), `esp` (Delete/Refresh) | `zone`, `dashboard`, `notification-*` |
| Intent-Lifecycle (`intents`, `pendingCommands`) | `actuator` | keine | alle anderen Stores |
| Notification-Inbox (`notifications`, `unreadCount`) | `notification-inbox` | `alert-center` (temporar, bis Write-API im Inbox-Store vorhanden) | `esp`, `dashboard`, `zone`, Komponenten |
| Alert-Lifecycle/Stats (`activeAlerts`, `alertStats`) | `alert-center` | keine | `notification-inbox` (soll nur lesen, nicht mitschreiben) |
| Dashboards (`layouts`) | `dashboard` | keine | `zone` (nur Trigger erlaubt, kein Layout-Write), Komponenten |

Bewertung fuer Akzeptanzkriterium:
- Device, Sensor, Actuator, Notification, Dashboard haben einen klar benannten Owner.
- Aktuelle Abweichungen zum Soll sind transparent (siehe Kapitel 3 und 6).

## 2) Store-Matrix (SSoT | Derived | Transient -> Seiteneffekt -> Risiko)

| Store | Rolle (SSoT/Derived/Transient) | Seiteneffekt | Risiko |
|---|---|---|---|
| `esp` | SSoT fuer `devices[]`, `pendingDevices[]`; Dispatcher fuer WS | REST CRUD, WS-Registrierung, delegierte Mutationen, `fetchAll()`-Refresh | P1 |
| `zone` | SSoT fuer `zoneEntities[]`; Derived fuer active/archived | Cross-Store-Write in `esp.devices` via Callback, Toasts | P1 |
| `sensor` | kein eigener SSoT, mutiert Sensorteile in `esp.devices` | WS-Delta-Write (in-place), ggf. Sensor anlegen | P1 |
| `actuator` | SSoT fuer Intent-Lifecycle, kein SSoT fuer Devices | WS-Delta-Write in Actuator-Teile, Timeout/Contract-Handling | P1 |
| `notification-inbox` | SSoT fuer Inbox-Liste + unread/badge | REST + WS Merge, Browser Notification | P1 |
| `alert-center` | SSoT fuer Alert-Stats + aktive Alerts | Polling, REST-Lifecycle, schreibt in Inbox-Liste | P1 |
| `dashboard` | SSoT fuer Layouts (lokal + server-synchronisiert) | `localStorage`, Server-Sync, Merge/Dedup/Orphan-Cleanup | P1 |
| `auth` | SSoT fuer Session/Tokens/User | `localStorage`, WS disconnect, intent reset | P1 |
| `deviceContext` | SSoT fuer Context-Map | REST write/read, WS granular patch | P2 |
| weitere UI/Feature Stores | ueberwiegend Transient/Derived | lokale UI-Seiteneffekte | P2/P3 |

## 3) Cross-Store-Writes klassifiziert

### 3.1 Legitim (fachlich sauber)
- `esp` -> `notification-inbox`: Delegation von WS-Events (`notification_new`, `notification_updated`, `notification_unread_count`) an den Domain-Owner.
- `auth.logout()` -> `intentSignals.clearAll()`: explizite Session-Grenze, kein versteckter Domain-Write.

### 3.2 Technisch noetig (kurzfristig akzeptiert, mittelfristig entkoppeln)
- `zone.handleZoneAssignment(..., setDevice)` schreibt in `esp.devices` ueber injizierten Callback.
- `sensor.handleSensorData(..., devices)` mutiert Sensorobjekte innerhalb `esp.devices`.
- `actuator.handleActuatorStatus(..., devices)` mutiert Actuatorobjekte innerhalb `esp.devices`.

### 3.3 Zu entkoppeln (Soll-Verletzung)
- `alert-center._updateAlertInLists()` schreibt direkt in `notification-inbox.notifications`.
  - Zielbild: `notification-inbox.applyServerNotificationUpdate(updated)` als einzige Write-API fuer Inbox.

## 4) Mutationstyp je kritischem Event (`replace` | `patch` | `refresh`)

| Event / Pfad | Mutationstyp | Aktuelles Verhalten |
|---|---|---|
| `REST esp.fetchAll()` | `replace` | ersetzt `devices.value` komplett (deduped) |
| `REST esp.fetchDevice()` | `patch` | ersetzt/insertet genau ein Device |
| `WS esp_health` | `patch` | Device-Teilupdate (gesundheitsbezogene Felder) |
| `WS sensor_data` | `patch` | in-place Sensorwert/Qualitaet/last_read |
| `WS actuator_status` | `patch` | in-place Actuatorstate/pwm/emergency |
| `WS zone_assignment` | `patch` | Feldweises Device-Update (zone-Felder) |
| `WS subzone_assignment` | `refresh` | Toast + `needsRefresh` -> `fetchAll()` |
| `WS device_scope_changed` | `refresh` | Toast + `fetchAll()` |
| `WS device_context_changed` | `patch` + `refresh` | granular `deviceContext`-Patch + `fetchAll()` |
| `WS notification_new` | `patch` | `unshift`, `unreadCount++`, severity update |
| `WS notification_updated` | `patch` | partielle Feldupdates bestehender Inbox-Item |
| `WS notification_unread_count` | `replace` | badge counters als Snapshot |
| `REST dashboard.fetchLayouts()` | `replace` + `patch` | server-priorisierter Merge + dedup + orphan sync |

## 5) Kettennachweis je kritischem Event (`WS/REST -> Store -> UI`)

### Device
- `REST /esp/devices` -> `esp.fetchAll()` (`replace`) -> `HardwareView`, `MonitorView`, `Inventory` rerendern.

### Sensor
- `WS sensor_data` -> `esp` Dispatcher -> `sensor.handleSensorData()` (`patch`) -> `SensorCard`, Live-Charts aktualisieren.

### Actuator
- `WS actuator_status` -> `esp` Dispatcher -> `actuator.handleActuatorStatus()` (`patch`) -> `ActuatorCard`, Monitor-Karten aktualisieren.

### Notification
- `WS notification_new|updated|unread_count` -> `esp` Dispatcher -> `notification-inbox` (`patch/replace`) -> Drawer-Liste, Badge, QuickAction-AlertSummary.

### Dashboard
- `REST dashboardsApi.list` -> `dashboard.fetchLayouts()` (`replace+merge`) -> `CustomDashboardView`/`Monitor`-Panels aktualisieren.

## 6) Verbotene Seitenschreibpfade (benannt)

- `alert-center` darf nicht direkt `notification-inbox.notifications` mutieren (nur ueber Inbox-Action).
- Komponenten/Views duerfen `esp.devices` nicht direkt mutieren (nur Store-Actions).
- `zone`, `sensor`, `actuator` sollen mittelfristig nicht mehr direkt ueber fremde Arrays schreiben, sondern nur ueber `esp`-Write-API.
- `dashboard` darf keine Device-Domain schreiben; nur lesen/derivieren.

## 7) Refactor-Backlog in kleinen, testbaren Paketen (low risk)

### Paket F03-R1 (niedrig): Device-Write-Adapter in `esp`
Ziel:
- Neue interne API im `esp`-Store: `applyDevicePatch(espId, patchFn)` und `replaceDevices(snapshot)`.
- `zone/sensor/actuator` bekommen keine direkte Array-Mutation mehr, sondern rufen Adapter.
Risiko:
- gering (keine Payload-Aenderung, nur Write-Zentralisierung).
Tests:
- Unit `esp` fuer patch/replace-Konsistenz.

### Paket F03-R2 (niedrig): Inbox als alleiniger Writer
Ziel:
- `alert-center` ersetzt `_updateAlertInLists()` durch `notificationInboxStore.applyAlertUpdate(updated)`.
Risiko:
- gering (eine Kopplung weniger, gleiche Daten).
Tests:
- Unit fuer `applyAlertUpdate` + Integration Alert ack/resolve -> Inbox-Status.

### Paket F03-R3 (niedrig-mittel): Mutation Contract Tabelle als Code-Konstante
Ziel:
- zentrale Mapping-Konstante `eventType -> mutationType` im Frontend (diagnosefaehig, testbar).
Risiko:
- niedrig.
Tests:
- Unit: jeder registrierte WS-Typ hat klassifizierten Mutationstyp.

### Paket F03-R4 (mittel): `refresh`-Faelle reduzieren
Ziel:
- fuer `subzone_assignment`, `device_scope_changed`, `device_context_changed` schrittweise Delta-Updates statt pauschalem `fetchAll()`.
Risiko:
- mittel (Reaktivitaet/Edge-Cases).
Tests:
- Integration: definierte Kernfaelle laufen ohne Voll-Refresh.

### Paket F03-R5 (niedrig): Dashboard Sync Boundary schaerfen
Ziel:
- deutliches Flagging `local_only`, `server_synced`, `stale_server_id` fuer bessere Diagnose.
Risiko:
- niedrig.
Tests:
- Unit fuer merge/dedup/orphan-Sync.

## 8) Test-/Nachweisplan passend zum Auftrag

### Unit (Mutationstests pro Owner-Store)
- `esp`: `replaceDevices`, `applyDevicePatch`, `fetchAll` replace-Semantik.
- `notification-inbox`: `notification_new/updated/unread_count`.
- `dashboard`: `fetchLayouts` merge/dedup.
- `actuator`: intent terminal/non-terminal Konsistenz.

### Integration (Realtime-Deltas ohne Voll-Refresh)
- Fall A: `sensor_data` aendert nur betroffenen Sensor (kein `fetchAll`).
- Fall B: `actuator_status` aendert nur betroffenen Actuator.
- Fall C: `zone_assignment` patcht nur Zonefelder.
- Fall D (nach R4): `device_context_changed` ohne globalen Full-Refresh.

## 9) Abschluss gegen Akzeptanzkriterien

- Ownership fuer Device, Sensor, Actuator, Notification, Dashboard ist explizit dokumentiert.
- Verbotene Seitenschreibpfade sind benannt (Kapitel 6).
- Refactor-Plan ist in kleine, testbare Pakete geschnitten (Kapitel 7/8).

## 10) Umsetzungsstand 2026-04-06 (Analyse -> Fix abgeschlossen)

### Umgesetzt (Phase B)
- **F03-R1 (Device-Write-Adapter):** `esp` fuehrt jetzt `replaceDevices(snapshot)` und `applyDevicePatch(espId, patchFn)` als zentrale Write-APIs.  
  `zone/sensor/actuator` schreiben Device-Deltas nur noch ueber diese Adapter.
- **F03-R2 (Inbox als alleiniger Writer):** `notification-inbox` stellt `applyAlertUpdate(updated)` bereit;  
  `alert-center` schreibt nicht mehr direkt in `notification-inbox.notifications`.
- **F03-R3 (Mutation-Contract):** zentrale Konstante `ESP_STORE_WS_MUTATION_CONTRACT` mit vollstaendiger Klassifizierung aller registrierten `ws.on`-Eventtypen.
- **F03-R4 (Refresh reduzieren):** `device_scope_changed` und `device_context_changed` patchen im Regelfall deltafaehig;  
  globales `fetchAll()` bleibt nur als Fallback bei nicht patchbarer Payload/Zuordnung.
- **F03-R5 (Dashboard Sync Boundary):** `dashboard.layouts[*].syncFlags` eingefuehrt mit  
  `local_only`, `server_synced`, `stale_server_id` und konsistenter Pflege in Load/Merge/PUT-404-Recreate/POST-Sync.

### Test-/Verifikationsnachweis
- `npx vitest run tests/unit/stores/esp-websocket-subscription.test.ts tests/unit/stores/notification-inbox.test.ts tests/unit/stores/esp.test.ts tests/unit/stores/dashboard.test.ts` -> **gruen**
- `npx vue-tsc --noEmit` -> **gruen**

### Neue/erweiterte Tests
- `tests/unit/stores/esp.test.ts`: Adapter-Tests fuer `replaceDevices`, `applyDevicePatch`, `fetchAll`-Replace-Semantik.
- `tests/unit/stores/notification-inbox.test.ts`: `notification_new`, `notification_updated`, `notification_unread_count`, `applyAlertUpdate`.
- `tests/unit/stores/esp-websocket-subscription.test.ts`: Mutation-Contract-Vollstaendigkeit und gueltige Mutationstypen.
- `tests/unit/stores/dashboard.test.ts`: `fetchLayouts` Merge-SyncFlags und Orphan-Sync-Trigger.
