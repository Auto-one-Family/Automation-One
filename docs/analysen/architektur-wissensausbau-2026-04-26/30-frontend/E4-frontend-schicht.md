# E4 — Frontend-Schicht (El Frontend)

**Etappe:** E4  
**Stand:** 2026-04-26  
**Analysiert durch:** Frontend-Dev-Agent (Code-Lesung, kein Bauen)  
**Quell-Verzeichnis:** `El Frontend/src/`

---

## 1. Überblick und Tech-Stack

Die Frontend-Schicht ist eine Single-Page-Application, die ausschliesslich Daten anzeigt und Benutzereingaben sammelt. Jede Business-Logik liegt im Backend (`El Servador`). Das Frontend kommuniziert mit dem Server über zwei Kanäle: REST-API (Axios) für CRUD-Operationen und eine persistente WebSocket-Verbindung für Echtzeit-Updates.

### Tech-Stack (aus `El Frontend/package.json`)

| Paket | Version | Zweck |
|-------|---------|-------|
| vue | ^3.5.13 | Framework (Composition API + Script Setup) |
| vue-router | ^4.5.0 | Routing + Navigation Guards |
| pinia | ^2.3.0 | State Management |
| axios | ^1.10.0 | HTTP-Client mit Interceptoren |
| chart.js | ^4.5.0 | Diagramme |
| vue-chartjs | ^5.3.2 | Chart.js Vue-Wrapper |
| lucide-vue-next | ^0.468.0 | Icon-Bibliothek |
| date-fns | ^4.1.0 | Datum-Utilities |
| @vueuse/core | ^10.11.1 | Vue Composition Utilities |
| vue-draggable-plus | ^0.6.0 | Drag & Drop (SortableJS-Wrapper) |
| gridstack | ^12.1.2 | Dashboard Grid Layout |
| @vue-flow/core | ^1.43.2 | Node-basierter Rule-Flow-Editor |
| vite | ^6.2.4 | Build Tool |
| tailwindcss | ^3.4.17 | CSS Framework |
| typescript | ~5.7.2 | Type Safety (`strict: true`) |
| vitest | ^3.0.0 | Unit Test Framework |
| msw | ^2.7.0 | HTTP Request Mocking (Mock Service Worker) |

### Entwicklungskonventionen (unveränderlich)

- Alle Komponenten verwenden `<script setup lang="ts">` (Composition API, keine Options API).
- Imports verwenden den `@/`-Alias auf `src/` (niemals relative `../../`-Pfade).
- API-Calls erfolgen IMMER über `src/api/`-Module und Store-Actions, NIE direkt in Komponenten.
- Globaler State lebt ausschliesslich in Pinia Stores.
- Dark Theme Only — kein Light-Mode-CSS vorhanden.
- Deutsche Labels zentral in `src/utils/labels.ts`.

### Komponentenzählung

Die Codebase enthält **148 Vue-Komponenten** in `src/components/` und `src/shared/design/` zusammen (plus 19 Views), aufgeteilt auf über 20 Unterverzeichnisse.

---

## 2. Routing und View-Hierarchie

Der Router ist in `El Frontend/src/router/index.ts` definiert. Er verwendet `createWebHistory` und alle geschützten Routen sind als Kindrouten der `AppShell`-Komponente definiert.

### Öffentliche Routen (kein Auth erforderlich)

| Pfad | Name | View | Zweck |
|------|------|------|-------|
| `/login` | `login` | `LoginView.vue` | Anmeldeformular |
| `/setup` | `setup` | `SetupView.vue` | Ersteinrichtung (Admin) |
| `/not-found` | `not-found` | `NotFoundView.vue` | Expliziter 404-Zustand |
| `/:pathMatch(.*)*` | — | Redirect auf `/not-found?from=<original>` | Catch-All |

### Geschützte Routen (`requiresAuth: true`)

| Pfad | Name | View | Zweck |
|------|------|------|-------|
| `/` | — | Redirect auf `/hardware` | Standard-Landingpage |
| `/hardware` | `hardware` | `HardwareView.vue` | Zone-Accordion, L1/L2 |
| `/hardware/:zoneId` | `hardware-zone` | `HardwareView.vue` | Zone-Fokus (Scroll-Anchor) |
| `/hardware/:zoneId/:espId` | `hardware-esp` | `HardwareView.vue` | ESP-Detail (L2 Orbital) |
| `/monitor` | `monitor` | `MonitorView.vue` | Zone-Tiles (L1) |
| `/monitor/:zoneId` | `monitor-zone` | `MonitorView.vue` | Subzone-Accordion (L2) |
| `/monitor/:zoneId/sensor/:sensorId` | `monitor-sensor` | `MonitorView.vue` | Sensor-Detail SlideOver (L3) |
| `/monitor/:zoneId/dashboard/:dashboardId` | `monitor-zone-dashboard` | `MonitorView.vue` | Zone-Dashboard (L3) |
| `/editor` | `editor` | `CustomDashboardView.vue` | Dashboard Editor |
| `/editor/:dashboardId` | `editor-dashboard` | `CustomDashboardView.vue` | Dashboard Editor Deep-Link |
| `/sensors` | `sensors` | `SensorsView.vue` | Komponenten-Wissensdatenbank |
| `/logic` | `logic` | `LogicView.vue` | Automationsregeln |
| `/logic/:ruleId` | `logic-rule` | `LogicView.vue` | Regel Deep-Link |
| `/settings` | `settings` | `SettingsView.vue` | Benutzereinstellungen |
| `/access-denied` | `access-denied` | `AccessDeniedView.vue` | Guard-Fehlerpfad |

### Admin-Routen (`requiresAdmin: true`)

| Pfad | Name | View | Zweck |
|------|------|------|-------|
| `/system-monitor` | `system-monitor` | `SystemMonitorView.vue` | Tabs: Health, Hierarchy, Database, Logs, MQTT, Events, Reports, Diagnostics |
| `/plugins` | `plugins` | `PluginsView.vue` | AutoOps Plugins |
| `/email` | `email-postfach` | `EmailPostfachView.vue` | E-Mail-Postfach |
| `/users` | `users` | `UserManagementView.vue` | Benutzerverwaltung |
| `/system-config` | `system-config` | `SystemConfigView.vue` | Systemkonfiguration |
| `/load-test` | `load-test` | `LoadTestView.vue` | Last-Tests |
| `/calibration` | `calibration` | `CalibrationView.vue` | Sensorkalibrierung |

### Deprecated Redirects (rückwärtskompatibel)

| Alter Pfad | Ziel |
|-----------|------|
| `/devices`, `/mock-esp` | `/hardware` |
| `/database` | `/system-monitor?tab=database` |
| `/logs` | `/system-monitor?tab=logs` |
| `/audit` | `/system-monitor?tab=events` |
| `/mqtt-log` | `/system-monitor?tab=mqtt` |
| `/maintenance` | `/system-monitor?tab=health` |
| `/actuators` | `/sensors?tab=actuators` |
| `/sensor-history` | `/monitor` |
| `/custom-dashboard` | `/editor` |
| `/monitor/dashboard/:dashboardId` | `/editor/:dashboardId` |

**Legacy-Redirect-Telemetrie:** Der Router verfolgt in `localStorage` unter dem Key `router.legacyRedirectTelemetry.v1`, wie oft jeder veraltete Pfad genutzt wird — zur Planung der endgültigen Abschaltung (`LEGACY_DECOMMISSION_PLAN` in `router/index.ts`, Zeile 15–20).

### Navigation Guards (`router/index.ts`, Zeile 393–432)

Die `beforeEach`-Guard prüft in dieser Reihenfolge:

1. **Auth-Status-Check** (einmalig beim ersten Navigieren, `authStore.checkAuthStatus()`)
2. **Setup-Redirect:** Wenn `setupRequired === true`, Umleitung auf `/setup`
3. **Auth-Check:** Nicht authentifizierte Nutzer werden auf `/login?redirect=<from>` umgeleitet
4. **Admin-Check:** Nicht-Admins auf Admin-Routen werden auf `/access-denied?from=<from>` umgeleitet
5. **Login-Redirect:** Bereits authentifizierte Nutzer werden von `/login` und `/setup` auf `/hardware` weitergeleitet

### Lazy Loading mit Retry

Alle View-Komponenten werden über `lazyView()` (`router/index.ts`, Zeile 36–54) geladen. Diese Wrapper-Funktion fängt `Failed to fetch dynamically imported module`-Fehler ab und wiederholt den Import maximal `MAX_IMPORT_RETRIES = 2` mal mit `RETRY_DELAY_MS = 200` ms Pause. Bei dauerhaftem Fehler löst `router.onError` einen einmaligen Page-Reload aus (`RELOAD_COOLDOWN_MS = 10_000`).

---

## 3. HardwareView — 3-Level-Zoom-System

**Datei:** `El Frontend/src/views/HardwareView.vue`  
**Route-Pattern:** `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId`

Die HardwareView implementiert ein route-basiertes 2-Level-Navigationssystem (der SKILL.md-Begriff "3-Level" bezieht sich auf das system-weite L1/L2/L3-Konzept; innerhalb der HardwareView selbst gibt es L1 und L2, L3 = Modals/SlideOvers).

```typescript
// HardwareView.vue, Zeile 75-78
const currentLevel = computed<1 | 2>(() => {
  if (route.params.espId) return 2
  return 1
})
```

### 3.1 L1: Zone-Accordion (Übersicht)

Level 1 zeigt alle Zonen als aufklappbare Sektionen. Komponenten auf L1:

- **`ZonePlate.vue`** (`src/components/dashboard/ZonePlate.vue`) — Accordion pro Zone, enthält:
  - Zone-Header: Aggregierte Sensorwerte, Status-Dot, Subzone-Chips, Settings-Icon
  - `VueDraggable`-Container mit **`DeviceMiniCard.vue`**-Einträgen pro ESP
  - Archivierte Zonen in separatem `AccordionSection` (nur sichtbar wenn archivedZoneEntries > 0)
- **`DeviceMiniCard.vue`** (`src/components/dashboard/DeviceMiniCard.vue`) — Kompaktes ESP-Gerät, zeigt Sensor/Aktor-Counts, Touch-Actions
- **`UnassignedDropBar.vue`** (`src/components/dashboard/UnassignedDropBar.vue`) — Drop-Ziel am unteren Bildrand zum Entfernen aus Zone
- **`PendingDevicesPanel.vue`** (`src/components/esp/PendingDevicesPanel.vue`) — SlideOver mit noch nicht genehmigten Geräten
- **`ESPSettingsSheet.vue`** (`src/components/esp/ESPSettingsSheet.vue`) — SlideOver für ESP-Detailkonfiguration (geöffnet via `?openSettings={espId}` Query-Parameter)
- **`ZoneSettingsSheet.vue`** (`src/components/zones/ZoneSettingsSheet.vue`) — SlideOver für Zone-Konfiguration (Name, Archivieren, Löschen)
- **`ZoneSwitchDialog.vue`** — Modal bei Zone-Wechsel-Strategie (transfer/reset/copy)

### 3.2 L2: ESP Orbital Layout (Gerätedetail)

Level 2 wird durch `/hardware/:zoneId/:espId` aktiviert. Es zeigt ein einzelnes ESP-Gerät in einem 3-Spalten-Layout:

- **`DeviceDetailView.vue`** (`src/components/esp/DeviceDetailView.vue`) — Wrapper, rendert `ESPOrbitalLayout`
- **`ESPOrbitalLayout.vue`** (`src/components/esp/ESPOrbitalLayout.vue`) — 3-Spalten-Grid:
  - Links: **`SensorColumn.vue`** mit `SensorSatellite`-Karten
  - Mitte: **`ESPCard.vue`** / `ESPCardBase.vue` — Gerätekarte mit Status, Heap, RSSI
  - Rechts: **`ActuatorColumn.vue`** mit `ActuatorSatellite`-Karten
- **`DeviceHeaderBar.vue`** (`src/components/esp/DeviceHeaderBar.vue`) — Breadcrumb + Actions

### 3.3 L3: Modals und Panels (Konfiguration)

Level 3-Elemente werden als SlideOvers über L2 geöffnet, ausgelöst durch Klick auf Sensor- oder Aktor-Karten in L2:

- **`SensorConfigPanel.vue`** (`src/components/esp/SensorConfigPanel.vue`) — Sensor-Konfiguration (nur in HardwareView, Route `/hardware`)
- **`ActuatorConfigPanel.vue`** (`src/components/esp/ActuatorConfigPanel.vue`) — Aktor-Konfiguration
- **`ESPConfigPanel.vue`** (`src/components/esp/ESPConfigPanel.vue`) — ESP-Grundkonfiguration
- Modale Dialoge: `CreateMockEspModal.vue`, `EditSensorModal.vue`, `AddActuatorModal.vue`

> [!INKONSISTENZ] SensorsView öffnet SensorConfigPanel nicht
>
> **Beobachtung:** Die `SensorsView.vue` (Route `/sensors`) öffnet bei `?sensor={espId}-gpio{gpio}` das `DeviceDetailPanel` (SlideOver aus `src/components/inventory/`), NICHT das `SensorConfigPanel`. Das `SensorConfigPanel` ist exklusiv in der HardwareView nutzbar. Der Link "Vollständige Konfiguration" in `DeviceDetailPanel` navigiert zu `/hardware?openSettings={espId}`, von wo der Nutzer manuell zur L2-Ebene navigieren muss, um `SensorConfigPanel` zu öffnen.
>
> **Korrekte Stelle:** Abschnitt 3.4 (dieses Dokument) und SKILL.md "Komponentenhierarchie (SensorsView)"
>
> **Empfehlung:** Dokumentation konsistent halten: `SensorsView` = Wissensdatenbank, `HardwareView` = Konfiguration
>
> **Erst-Erkennung:** E4, 2026-04-26

### 3.4 SensorConfigPanel — Konfigurationsflow

**Datei:** `El Frontend/src/components/esp/SensorConfigPanel.vue`  
**Props:** `espId: string`, `gpio: number`, `sensorType: string`, `unit?: string`, `configId?: string`, `showMetadata?: boolean`  
**Emits:** `deleted: []`, `saved: []`

Das Panel ist in 3 Disclosure-Zonen aufgeteilt (Progressive Disclosure):

**Zone 1 — Basis (immer sichtbar):**
- Name, Beschreibung, Einheit, Enabled-Toggle
- Subzone-Zuweisung (`SubzoneAssignmentSection`)
- Device-Scope (`DeviceScopeSection`: zone_local / multi_zone / mobile)

**Zone 2 — Accordion (eingeklappt):**
- Schwellwerte und Alarme (Alarm-Low, Warn-Low, Warn-High, Alarm-High)
- Betriebsmodus (`continuous` | `on_demand` | `scheduled` | `paused`)
- Timeout-Sekunden
- Cron-Schedule (bei `scheduled`-Modus): 6 Presets (Jede Stunde, Alle 6h, Täglich 8:00, Alle 15min, Alle 30min, Wochentags 9:00)
- Sensor-Lifecycle: `measurement_freshness_hours`, `calibration_interval_days`
- Alert-Konfiguration (`AlertConfigSection`)
- Runtime & Maintenance (`RuntimeMaintenanceSection`)
- Metadaten (`DeviceMetadataSection`: Hersteller, Modell, etc.)
- Verlinkten Regeln (`LinkedRulesSection`)

**Zone 3 — Expert (Accordion):**
- Hardware-Interface: GPIO-Pin, I2C-Adresse/Bus oder OneWire-Adresse
- ADC1-Pins für Analog-Sensoren (Pins 32, 33, 34, 35, 36, 39)
- Live-Vorschau (`LiveDataPreview`)

**Ladelogik** (`onMounted`, Zeile 179–248):

1. Priorität 1: API-Call mit `config_id` (UUID) — `sensorsApi.getByConfigId(props.configId)`
2. Priorität 2: API-Call mit `gpio + sensorType` — `sensorsApi.get(espId, gpio, sensorType)` (Legacy)
3. Fallback für Mock-ESPs: Daten aus `espStore.devices`-Snapshot

**Speichern:** `PUT /api/v1/sensors/{espId}/{gpio}` mit dem kompletten `SensorConfigCreate`-Payload. Nach erfolgreichem Speichern wird `espStore.fetchDevice(espId)` ausgelöst, damit der Store den frischen Snapshot enthält.

**Löschen:** `DELETE /api/v1/sensors/{espId}/{gpio}` — erfordert `config_id` für Real-ESPs (sonst 500 bei mehreren Sensoren auf gleicher GPIO-Nummer, siehe NB6 / I13).

---

## 4. Komponenten-Übersicht (nach Domänen gruppiert)

Die 148 Komponenten verteilen sich auf folgende Unterverzeichnisse:

### `src/components/esp/` (ESP-Geräte, 11 Dateien)

| Komponente | Zweck |
|-----------|-------|
| `ESPCard.vue` | Zentralkarte im Orbital-Layout (Status, Heap, RSSI) |
| `ESPCardBase.vue` | Basis-Layout ohne Orbital-Kontext |
| `ESPOrbitalLayout.vue` | 3-Spalten-Grid (Sensoren | ESP | Aktoren) |
| `SensorConfigPanel.vue` | Sensor-Konfiguration SlideOver (nur HardwareView) |
| `ActuatorConfigPanel.vue` | Aktor-Konfiguration SlideOver |
| `ESPConfigPanel.vue` | ESP-Grundkonfiguration SlideOver |
| `ESPSettingsSheet.vue` | Vollständiges ESP-Einstellungs-SlideOver |
| `PendingDevicesPanel.vue` | Wartende Geräte (Discovery/Approval) |
| `DeviceDetailView.vue` | Wrapper für Orbital-Layout auf L2 |
| `SensorValueCard.vue` | Sensor-Wert mit Live-Messung |
| `LiveDataPreview.vue` | Echtzeit-Sensor-Vorschau |

### `src/components/devices/` (Sensor-/Aktor-Karten, 10 Dateien)

| Komponente | Zweck |
|-----------|-------|
| `SensorCard.vue` | Sensor-Karte im Monitor-Modus (mit Stale/Offline-Badges, Trend) |
| `ActuatorCard.vue` | Aktor-Karte (read-only Monitor, aktive Regeln, LinkedRules) |
| `SharedSensorRefCard.vue` | Kompakte Referenz für Sensoren aus anderen Zonen |
| `AlertConfigSection.vue` | Alarm-Konfiguration (Schwellwerte) |
| `DeviceAlertConfigSection.vue` | Alarm-Konfiguration auf Geräteebene |
| `SubzoneAssignmentSection.vue` | Subzone-Zuweisung |
| `DeviceScopeSection.vue` | Device-Scope (zone_local/multi_zone/mobile) |
| `LinkedRulesSection.vue` | Verknüpfte Automatisierungsregeln |
| `DeviceMetadataSection.vue` | Hersteller, Modell, Wartung |
| `RuntimeMaintenanceSection.vue` | Laufzeit und Wartungsstatus |

### `src/components/dashboard/` (Zone-Layout, 11 Dateien)

| Komponente | Zweck |
|-----------|-------|
| `ZonePlate.vue` | Zone-Accordion mit VueDraggable |
| `DeviceMiniCard.vue` | Kompakte ESP-Karte (L1 HardwareView) |
| `ComponentSidebar.vue` | Rechte Sidebar mit Sensoren/Aktoren |
| `UnassignedDropBar.vue` | Drop-Ziel zum Entfernen aus Zone |
| `CrossEspConnectionOverlay.vue` | SVG-Overlay für ESP-übergreifende Regeln |
| `DashboardViewer.vue` | Dashboard-Anzeige |
| `InlineDashboardPanel.vue` | Inline-Dashboard im Monitor (mode: view/manage) |

### `src/components/monitor/` (Monitor-spezifisch, 5 Dateien)

| Komponente | Zweck |
|-----------|-------|
| `ZoneTileCard.vue` | Zone-Kachel auf Monitor-L1 |
| `ZoneTileInsightBlock.vue` | KPI-Block innerhalb der Zone-Kachel |
| `ActiveAutomationsSection.vue` | Aktive Regeln auf Monitor-L1 |
| `ZoneRulesSection.vue` | Regeln für diese Zone auf Monitor-L2 |
| `AddWidgetDialog.vue` | Dialog zum Hinzufügen von Dashboard-Widgets |

### `src/components/rules/` (Automatisierungsregeln, 5 Dateien)

| Komponente | Zweck |
|-----------|-------|
| `RuleCard.vue` | Regel-Karte (vollständig) |
| `RuleConfigPanel.vue` | Regel-Konfiguration SlideOver |
| `RuleFlowEditor.vue` | Node-basierter Flow-Editor (via @vue-flow/core) |
| `RuleNodePalette.vue` | Komponenten-Palette für Flow-Editor |
| `RuleTemplateCard.vue` | Vorlagen-Auswahl |

### `src/components/dashboard-widgets/` (Dashboard-Widgets)

Alle Widgets für den Grid-Stack-Dashboard-Editor:

`SensorCardWidget`, `GaugeWidget`, `LineChartWidget`, `HistoricalChartWidget`, `StatisticsWidget`, `ActuatorCardWidget`, `ActuatorRuntimeWidget`, `AlarmListWidget`, `ESPHealthWidget`, `FertigationPairWidget`, `ExportCsvDialog`, `WidgetConfigPanel`, `WidgetWrapper`

### `src/shared/design/` (Design-System, 21 Dateien)

| Unterverzeichnis | Komponenten |
|-----------------|-------------|
| `primitives/` | `BaseButton`, `BaseCard`, `BaseInput`, `BaseModal`, `BaseBadge`, `BaseSelect`, `BaseSkeleton`, `BaseSpinner`, `BaseToggle`, `SlideOver`, `AccordionSection`, `QualityIndicator`, `RangeSlider` |
| `layout/` | `AppShell`, `Sidebar`, `TopBar` |
| `patterns/` | `ConfirmDialog`, `ContextMenu`, `EmptyState`, `ErrorState`, `ToastContainer` |

---

## 5. Pinia-Stores

### 5.1 Store-Übersicht

Die Stores befinden sich in zwei Verzeichnissen:
- **`src/stores/`** — Hauptstores (ESP-Domäne)
- **`src/shared/stores/`** — Shared Stores (22 Dateien)

| Store | Datei | Kern-State | Wichtigste Actions |
|-------|-------|-----------|-------------------|
| **esp** | `stores/esp.ts` | `devices[]`, `pendingDevices[]`, `selectedDeviceId` | `fetchAll`, `fetchDevice`, `replaceDevices`, `applyDevicePatch`, `initWebSocket`, `cleanupWebSocket` |
| **auth** | `shared/stores/auth.store.ts` | `user`, `accessToken`, `refreshToken`, `setupRequired` | `login`, `logout`, `checkAuthStatus`, `refreshTokens`, `clearAuth` |
| **zone** | `shared/stores/zone.store.ts` | `zoneEntities[]`, `isLoadingZones` | `fetchZoneEntities`, `createZone`, `updateZone`, `archiveZone`, `deleteZoneEntity` |
| **dashboard** | `shared/stores/dashboard.store.ts` | `layouts[]`, `syncFlags`, `breadcrumb` | `createLayout`, `saveLayout`, `deleteLayout`, `addWidget`, `removeWidget`, `fetchLayouts`, `flushPendingSyncs` |
| **logic** | `shared/stores/logic.store.ts` | `rules[]`, `activeExecutions`, `executionHistory[]` | `fetchRules`, `toggleRule`, `loadExecutionHistory`, `getRulesForZone`, `setRuleLifecycle` |
| **intentSignals** | `shared/stores/intentSignals.store.ts` | `byEspId` (Map) | `ingestOutcome`, `ingestLifecycle`, `clearAll` |
| **deviceContext** | `shared/stores/deviceContext.store.ts` | `contexts` (Map) | `loadContextsForDevices`, `setContext`, `clearContext` |
| **notificationInbox** | `shared/stores/notification-inbox.store.ts` | `notifications[]`, `unreadCount` | `loadInitial`, `markAsRead`, `toggleDrawer`, `applyAlertUpdate` |
| **alertCenter** | `shared/stores/alert-center.store.ts` | `alertStats`, `activeAlerts[]` | `fetchStats`, `acknowledgeAlert`, `startStatsPolling` |
| **diagnostics** | `shared/stores/diagnostics.store.ts` | `currentReport`, `history[]` | `runDiagnostic`, `loadHistory`, `exportReport` |
| **inventory** | `shared/stores/inventory.store.ts` | `searchQuery`, `filters`, `currentPage` | `toggleSort`, `setPage`, `openDetail` |
| **plugins** | `shared/stores/plugins.store.ts` | `plugins[]`, `executionHistory[]` | `fetchPlugins`, `executePlugin`, `togglePlugin` |
| **opsLifecycle** | `shared/stores/ops-lifecycle.store.ts` | `entries[]` | `startLifecycle`, `markRunning`, `markSuccess`, `markFailed` |
| **quickAction** | `shared/stores/quickAction.store.ts` | `isMenuOpen`, `activePanel` | `toggleMenu`, `setActivePanel`, `executeAction` |
| **dragState** | `shared/stores/dragState.store.ts` | `isDragging*` flags, `dragPayload` | `startEspCardDrag`, `endEspCardDrag` — 30s Timeout |
| **gpio** | `shared/stores/gpio.store.ts` | `gpioStatusMap` | `fetchGpioStatus` |
| **sensor** | `shared/stores/sensor.store.ts` | Sensor-State | Sensor-Actions |
| **actuator** | `shared/stores/actuator.store.ts` | Aktor-State | Aktor-Actions |
| **config** | `shared/stores/config.store.ts` | Konfigurationsdaten | Config-Actions |
| **ui** | `shared/stores/ui.store.ts` | UI-State (Sidebars, Panels) | UI-Toggle-Actions |
| **database** | `shared/stores/database.store.ts` | `tables`, `currentData` | `loadTables`, `selectTable` |
| **notification** | `shared/stores/notification.store.ts` | Notification-State | Notification-Actions |

### 5.2 Datenfluss Store → Komponente

```
WebSocket-Event → esp.store.initWebSocket() Handler
                  ↓
                  applyDevicePatch(espId, patchFn) [Write-Boundary]
                  ↓
                  devices[] (reactive ref)
                  ↓
                  Komponente computed → v-for → re-render
```

**Kritische Regel (Device-Write-Boundary):** Alle Schreiboperationen auf `devices[]` erfolgen ausschliesslich über `esp.applyDevicePatch()` oder `esp.replaceDevices()`. Kein anderer Store darf `espStore.devices` direkt mutieren.

**Notification-Write-Boundary:** Nur `notificationInbox.applyAlertUpdate()` darf `notifications[]` von aussen beschreiben (kein Direkt-Write aus anderen Stores).

### Keep-Alive-Pattern

`AppShell.vue` kapselt `MonitorView`, `LogicView` und `CustomDashboardView` in `<keep-alive>`. Diese Views müssen `defineOptions({ name: 'ViewName' })` setzen und `onActivated()`/`onDeactivated()` statt `onMounted()`/`onUnmounted()` für Re-Init/Cleanup verwenden.

---

## 6. WebSocket-Integration

### 6.1 WS-Verbindungsmanagement

**Singleton:** `El Frontend/src/services/websocket.ts` — Klasse `WebSocketService` mit statischem `getInstance()`.

**URL-Schema:**
```
ws[s]://<host>/api/v1/ws/realtime/<clientId>?token=<jwt>
```

- `clientId` = `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
- JWT wird als Query-Parameter übergeben (kein Custom Header — WebSocket-API unterstützt keine Custom Headers)
- Protokoll (`ws`/`wss`) richtet sich nach `window.location.protocol`

**Reconnect-Strategie:**
- Exponentieller Backoff: Basis 1 s, Maximum 30 s (`maxReconnectDelay`)
- `maxReconnectAttempts = 10` (nur für Backoff-Berechnung, kein Hard-Stop)
- Tab-Visibility-Handler: Schnellerer Reconnect bei Tab-Aktivierung

**Token-Refresh vor Reconnect:** Der Singleton prüft, ob das JWT innerhalb von 60 Sekunden abläuft (`isTokenExpired()`) und ruft `authStore.refreshTokens()` auf, bevor die WebSocket-Verbindung wiederhergestellt wird.

**Rate Limit:** Client → Server: max 10 Nachrichten/Sekunde (`MAX_MESSAGES_PER_SECOND = 10`).

### 6.2 Event-Handler-Mapping

Die WS-Handler sind im ESP Store (`src/stores/esp.ts`) in der Funktion `initWebSocket()` registriert. Der Store abonniert alle relevanten Event-Typen über `useWebSocket({ filters: { types: ESP_STORE_WS_SUBSCRIPTION_TYPES } })`.

**Registrierte Handler in `initWebSocket()` (Zeile 1983–2025):**

| Event-Typ | Handler | Mutations-Typ |
|-----------|---------|--------------|
| `esp_health` | `handleEspHealth` | patch |
| `sensor_data` | `handleSensorData` | patch |
| `actuator_status` | `handleActuatorStatus` | patch |
| `actuator_alert` | `handleActuatorAlert` | patch |
| `config_response` | `handleConfigResponse` | patch |
| `config_response_guard_replay` | `handleConfigResponseGuardReplay` | patch |
| `zone_assignment` | `handleZoneAssignment` | patch |
| `subzone_assignment` | `handleSubzoneAssignment` | patch |
| `sensor_health` | `handleSensorHealth` | patch |
| `sensor_config_deleted` | `handleSensorConfigDeleted` | patch |
| `actuator_config_deleted` | `handleActuatorConfigDeleted` | patch |
| `device_scope_changed` | `handleDeviceScopeChanged` | patch |
| `device_context_changed` | `handleDeviceContextChanged` | patch |
| `esp_reconnect_phase` | `handleEspReconnectPhase` | patch |
| `device_discovered` | `handleDeviceDiscovered` | patch |
| `device_approved` | `handleDeviceApproved` | refresh |
| `device_rejected` | `handleDeviceRejected` | patch |
| `actuator_response` | `handleActuatorResponse` | patch |
| `notification` | `handleNotification` | patch |
| `error_event` | `handleErrorEvent` | patch |
| `system_event` | `handleSystemEvent` | patch |
| `notification_new` | `handleNotificationNew` | patch |
| `notification_updated` | `handleNotificationUpdated` | patch |
| `notification_unread_count` | `handleNotificationUnreadCount` | patch |
| `actuator_command` | `handleActuatorCommand` | patch |
| `actuator_command_failed` | `handleActuatorCommandFailed` | patch |
| `config_published` | `handleConfigPublished` | patch |
| `config_failed` | `handleConfigFailed` | patch |
| `device_rediscovered` | `handleDeviceRediscovered` | patch |
| `sequence_started` | `handleSequenceStarted` | patch |
| `sequence_step` | `handleSequenceStep` | patch |
| `sequence_completed` | `handleSequenceCompleted` | patch |
| `sequence_error` | `handleSequenceError` | patch |
| `sequence_cancelled` | `handleSequenceCancelled` | patch |
| `intent_outcome` | `handleIntentOutcome` | patch |
| `intent_outcome_lifecycle` | `handleIntentOutcomeLifecycle` | patch |

Der vollständige Mutations-Vertrag ist in `src/stores/esp-websocket-subscription.ts` als `ESP_STORE_WS_MUTATION_CONTRACT` dokumentiert.

**Kritische Invariante:** Die Typliste in `ESP_STORE_WS_SUBSCRIPTION_TYPES` muss **identisch** mit allen `ws.on('...')`-Typen in `initWebSocket()` sein. Fehlende Typen in der Filterliste werden vom WebSocket-Service nicht ausgeliefert und erreichen die Handler nie.

### 6.3 EventType-Union (E1-Inkonsistenz)

> [!INKONSISTENZ] WebSocket-EventType-Union in websocket-events.ts deckt nicht alle Typen ab
>
> **Beobachtung:** Die `WebSocketEvent`-Union in `El Frontend/src/types/websocket-events.ts` (Zeile 477–508) enthält **30 Interface-Typen**. Die `MessageType`-Union in `El Frontend/src/types/index.ts` (Zeile 431–493) definiert **44 String-Literale** als abonnierbare Event-Typen. Die `ESP_STORE_WS_ON_HANDLER_TYPES`-Konstante in `esp-websocket-subscription.ts` enthält **37 String-Literale** (aktiv abonniert).
>
> **Typen in `MessageType` aber NICHT in `WebSocketEvent`-Union (keine Interface-Definition):**
> - `config_response_guard_replay`
> - `device_rediscovered` (Interface `DeviceRediscoveredEvent` existiert ab Zeile 559, aber nur im Abschnitt "ADDITIONAL EVENTS", nicht in der Union)
>
> **Typen in `ESP_STORE_WS_ON_HANDLER_TYPES` aber NICHT in `WebSocketEvent`-Union:**
> - `actuator_alert` (`ActuatorAlertEvent` existiert, ist in der Union enthalten — kein Problem)
> - `config_response_guard_replay` — kein Interface, nur String-Literal
> - `notification` (`NotificationEvent` existiert, ist in der Union enthalten)
> - `sensor_health` (`SensorHealthEvent` existiert, ist in der Union enthalten)
> - `system_event` (`SystemEvent` existiert, ist in der Union enthalten)
>
> **Typen in `MessageType` aber NICHT in `ESP_STORE_WS_ON_HANDLER_TYPES` (kein aktiver Handler):**
> - `logic_execution`, `conflict.arbitration`, `calibration_session_started`, `calibration_session_finalized`, `calibration_session_applied`, `calibration_session_rejected`, `calibration_point_added`, `calibration_point_rejected`, `calibration_measurement_received`, `calibration_measurement_failed`, `rule_degraded`, `rule_recovered`
>
> **Korrekte Stelle:** `El Frontend/src/types/websocket-events.ts`, `El Frontend/src/types/index.ts`, `El Frontend/src/stores/esp-websocket-subscription.ts`
>
> **Empfehlung:** `DeviceRediscoveredEvent` zur `WebSocketEvent`-Union hinzufügen. `config_response_guard_replay` als Interface definieren. Kalibrierungs- und Regel-Degradierungs-Events in separaten Stores/Subscribern behandeln (nicht im esp.store).
>
> **Erst-Erkennung:** E1 (bestätigt), vollständig dokumentiert E4, 2026-04-26

---

## 7. REST-API-Client

### 7.1 Axios-Setup und Interceptoren

**Datei:** `El Frontend/src/api/index.ts`

```typescript
const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})
```

**Request-Interceptor** (Zeile 36–55):
- Fügt `Authorization: Bearer <accessToken>` Header hinzu
- Generiert eine eindeutige Request-ID via `crypto.randomUUID()` (mit Fallbacks für ältere Runtimes) und setzt sie als `X-Request-ID`-Header
- Loggt jeden ausgehenden Request (DEBUG-Level)

**Response-Interceptor** (Zeile 76–155):
- Loggt Status und `X-Request-ID` aus Server-Response (DEBUG-Level)
- Behandelt `DELETE + 404` als Debug-Level (idempotent, kein Fehler-Noise)
- Mappt alle Fehler auf `UiApiError` via `toUiApiError()` (SSOT)

### 7.2 Auth-Flow (Token-Refresh)

Der Refresh-Mechanismus ist eine Queue-basierte Implementierung, die sicherstellt, dass genau ein Refresh-Request ausgeführt wird, auch wenn N parallele Requests gleichzeitig einen 401-Fehler erhalten.

**Ablauf bei 401:**

1. Erster 401-Request: `isRefreshing = true`, Refresh-Request an `/auth/refresh` senden
2. Weitere parallele 401-Requests: In `failedQueue` einreihen (Promise.resolve/reject)
3. Nach erfolgreichem Refresh: `processQueue(null, newToken)` — alle Queued-Requests werden mit neuem Token wiederholt
4. Bei Refresh-Fehler: `processQueue(refreshError, null)` — alle Queued-Requests werden abgebrochen, `authStore.clearAuth()` und Redirect auf `/login`

**Auth-Endpoints werden übersprungen** (Anti-Loop-Schutz): `/auth/refresh`, `/auth/login`, `/auth/setup`, `/auth/status`

### REST-Error SSOT (`src/api/uiApiError.ts`)

```typescript
type UiApiError = {
  message: string
  numeric_code: number | null
  request_id: string | null
  retryability: 'yes' | 'no' | 'unknown'
  status: number
}
```

**Regel:** Keine ad-hoc `response.data.detail`-Parser in Business-Stores oder Views. Immer `toUiApiError()` und `formatUiApiError()` verwenden.

**Status-spezifisches Verhalten:**
- 401 → "Sitzung nicht mehr gültig." + `retryability: 'no'`
- 403 → "Zugriff verweigert." + `retryability: 'no'`
- 5xx → "Server-Störung." + `retryability: 'yes'`
- Netzwerkfehler (status 0) → "Netzwerkfehler." + `retryability: 'yes'`

### API-Module-Übersicht

| Modul | Datei | Endpunkt-Präfix | Inhalt |
|-------|-------|----------------|--------|
| axios instance | `api/index.ts` | — | Interceptoren, Helper |
| auth | `api/auth.ts` | `/auth/*` | Login, Logout, Setup, Refresh, Me |
| esp | `api/esp.ts` | `/esp/*`, `/debug/*` | Unified Mock + Real ESP API |
| sensors | `api/sensors.ts` | `/sensors/*` | Sensor CRUD + History + Stats |
| actuators | `api/actuators.ts` | `/actuators/*` | Aktor-Steuerung |
| zones | `api/zones.ts` | `/zone/*`, `/zones` | Zone CRUD + Monitor-Daten |
| subzones | `api/subzones.ts` | `/subzone/*` | Subzone CRUD |
| device-context | `api/device-context.ts` | `/device-context/*` | Mobile/Multi-Zone-Kontext |
| logic | `api/logic.ts` | `/logic/*` | Automatisierungsregeln |
| dashboards | `api/dashboards.ts` | — | Dashboard-Persistenz |
| plugins | `api/plugins.ts` | `/plugins/*` | Plugin-Ausführung |
| diagnostics | `api/diagnostics.ts` | `/diagnostics/*` | Diagnose-Checks |
| backups | `api/backups.ts` | `/backups/*` | DB-Backup (Admin) |
| inventory | `api/inventory.ts` | — | Geräte-Inventar |
| intentOutcomes | `api/intentOutcomes.ts` | `/intent-outcomes` | Intent-Outcome-Liste |
| uiApiError | `api/uiApiError.ts` | — | Error-SSOT |

---

## 8. Composables

**Verzeichnis:** `El Frontend/src/composables/` (36 Dateien)

### Kern-Composables

| Composable | Datei | Funktion |
|-----------|-------|---------|
| `useWebSocket` | `useWebSocket.ts` | WS-Verbindung, Subscriptions, `on(type, callback)`, Auto-Cleanup |
| `useToast` | `useToast.ts` | Toast-Benachrichtigungen (Singleton, Auto-Dismiss, `dedupeKey`) |
| `useModal` | `useModal.ts` | Modal-State-Management |
| `useESPStatus` | `useESPStatus.ts` | SSOT für ESP-Status-Berechnung (`getESPStatus()` als pure Funktion) |
| `useSensorId` | `useSensorId.ts` | Parsen von `sensorId`-Strings (`espId:gpio:sensorType`) |

### Domänen-Composables

| Composable | Datei | Funktion |
|-----------|-------|---------|
| `useZoneDragDrop` | `useZoneDragDrop.ts` | Zone-Zuweisung via Drag & Drop |
| `useOrbitalDragDrop` | `useOrbitalDragDrop.ts` | Orbital-Layout Drag & Drop |
| `useDashboardWidgets` | `useDashboardWidgets.ts` | Widget mount/unmount, GridStack-Integration |
| `useSubzoneCRUD` | `useSubzoneCRUD.ts` | Subzone erstellen/löschen/umbenennen |
| `useSubzoneResolver` | `useSubzoneResolver.ts` | Subzone-Name aus ID auflösen |
| `useZoneGrouping` | `useZoneGrouping.ts` | Geräte nach Zonen/Subzonen gruppieren |
| `useZoneKPIs` | `useZoneKPIs.ts` | Zone-KPI-Aggregation für Monitor-L1 |
| `useQueryFilters` | `useQueryFilters.ts` | URL-Query-Parameter als reaktiver Filter-State |
| `useGpioStatus` | `useGpioStatus.ts` | GPIO-Belegungsstatus abrufen |
| `useDeviceActions` | `useDeviceActions.ts` | ESP-Geräteaktionen (Approve, Reject, Delete) |
| `useDeviceMetadata` | `useDeviceMetadata.ts` | Gerätemetadaten lesen/schreiben |
| `useCalibration` | `useCalibration.ts` | Kalibrierungs-Flow |
| `useCalibrationWizard` | `useCalibrationWizard.ts` | Schritt-für-Schritt-Kalibrierungs-Wizard |
| `useSensorOptions` | `useSensorOptions.ts` | Zone-gruppierte Sensor-Optionen für Dashboard-Widgets |
| `useExportCsv` | `useExportCsv.ts` | CSV-Export für Sensordaten |
| `monitorConnectivity` | `monitorConnectivity.ts` | Monitor-Zustandsmaschine (connected/stale/reconnecting/degraded_api/disconnected) |
| `useSparklineCache` | `useSparklineCache.ts` | Sparkline-Daten-Cache für Sensor-Karten |
| `useSwipeNavigation` | `useSwipeNavigation.ts` | Touch-Swipe-Navigation |
| `useKeyboardShortcuts` | `useKeyboardShortcuts.ts` | Tastaturkürzel |
| `useCommandPalette` | `useCommandPalette.ts` | Command-Palette |
| `useContextMenu` | `useContextMenu.ts` | Kontextmenü |
| `useNavigationHistory` | `useNavigationHistory.ts` | Navigationsverlauf |
| `useGrafana` | `useGrafana.ts` | Grafana-Panel-Einbettung |

### Cleanup-Pflicht

Alle Composables rufen `onUnmounted(cleanup)` auf, um Event-Listener und WebSocket-Subscriptions automatisch zu beenden. In Store-Kontexten (kein `getCurrentInstance()`) wird `onStatusChange()`-Callback statt `setInterval` für Status-Monitoring verwendet (kein Timer-Leak).

---

## 9. Design-System und CSS

### Token-Präfix-Bestätigung

> [!INKONSISTENZ] Kein --ao-*-Token-Präfix vorhanden (I4 bestätigt)
>
> **Beobachtung:** Eine Suche nach `--ao-` in allen Dateien unter `El Frontend/src/` ergab **0 Treffer**. Das Design-System verwendet ausschliesslich den Präfix `--color-*`, `--glass-*`, `--space-*` etc. ohne einen projektspezifischen `--ao-`-Präfix.
>
> **Korrekte Stelle:** `El Frontend/src/styles/tokens.css` (Single Source of Truth für alle CSS Custom Properties)
>
> **Empfehlung:** Ältere Dokumentation die `--ao-*` erwähnt korrigieren; `tokens.css` ist die massgebliche Referenz
>
> **Erst-Erkennung:** I4, bestätigt E4, 2026-04-26

### CSS-Architektur

Das Design-System besteht aus 6 CSS-Dateien in `El Frontend/src/styles/`:

| Datei | Inhalt |
|-------|--------|
| `tokens.css` | Alle CSS Custom Properties (Single Source of Truth) |
| `glass.css` | Glassmorphism-Utility-Klassen |
| `animations.css` | Animationen (shimmer, fade-in, slide-up, breathe) |
| `main.css` | Buttons, Layout-Klassen |
| `forms.css` | Shared Form + Modal Styles |
| `tailwind.css` | Tailwind-Konfiguration |

Zusätzlich existiert `El Frontend/src/style.css` (~800 Zeilen) mit globalen CSS-Variablen und Glassmorphism-Definitionen (historische Datei, teilweise redundant mit `styles/`-Verzeichnis).

### Token-Hierarchie

**Hintergrund (4 Stufen):**
```css
--color-bg-primary:    #07070d;   /* void — body, deepest layer */
--color-bg-secondary:  #0d0d16;   /* base — sidebar, header */
--color-bg-tertiary:   #15151f;   /* raised — cards, inputs */
--color-bg-quaternary: #1d1d2a;   /* overlay — hover, dropdowns */
```

**Text (3 Stufen):**
```css
--color-text-primary:   #eaeaf2;  /* headlines, values */
--color-text-secondary: #8585a0;  /* labels, body */
--color-text-muted:     #5a5a75;  /* timestamps, hints */
```

**Status:**
```css
--color-success: #34d399;  /* grün */
--color-warning: #fbbf24;  /* gelb */
--color-error:   #f87171;  /* rot */
--color-info:    #60a5fa;  /* blau */
--color-mock:    #a78bfa;  /* violett — Mock-ESP */
--color-real:    #22d3ee;  /* cyan — Real-ESP */
```

**Iridescent (4 Stufen, sparsam):**
```css
--color-iridescent-1: #60a5fa;  /* blau */
--color-iridescent-2: #818cf8;  /* violet-blau */
--color-iridescent-3: #a78bfa;  /* violett */
--color-iridescent-4: #c084fc;  /* pink-violett */
```

### Glassmorphism — 3-Level-Tiefenhierarchie

| Level | Blur | Background Alpha | Verwendung |
|-------|------|----------------|-----------|
| L1 | 8px | 0.01 | Navigation, Tab-Bars, Sections |
| L2 | 12px | 0.02 | Cards, Zone-Tiles, Widgets (Default) |
| L3 | 16px | 0.06 | Modals, SlideOvers, Dropdowns |

Backward-kompatible Aliase `--glass-bg`, `--glass-border`, `--glass-shadow` zeigen auf L2-Werte.

### Tailwind-Konfiguration

Tailwind wird als Utility-First-Framework genutzt. Die Konfiguration spiegelt die Design-Tokens:

- **Farben:** `dark-50` bis `dark-950`, Iridescent-Palette, Status-Farben
- **Fonts:** `font-sans` (Outfit), `font-mono` (JetBrains Mono)
- **Typografie:** `text-xs` bis `text-display` (11px–32px, Base = 14px)
- **Shadows:** `shadow-glass`, `shadow-card-hover`, `shadow-iridescent`
- **Animationen:** `animate-shimmer`, `animate-fade-in`, `animate-slide-up`
- **Border-Radius:** `rounded-sm` (6px), `rounded-md` (10px), `rounded-lg` (16px)
- **Screens:** `3xl` (1600px), `4xl` (1920px)

### Touch-Accessibility

Alle klickbaren Elemente benötigen Touch-Targets von mindestens 44×44px (WCAG). Icons bleiben optisch klein, Touch-Area wird durch Padding vergrössert. Hover-only-Elemente müssen mit `@media (hover: none)` auch auf Touch zugänglich sein.

---

## 10. sensorId-Konstruktion (I13 + NB6)

### Aktuelle sensorId-Format-Definition

**Datei:** `El Frontend/src/composables/useSensorId.ts`

**Aktuelles Format (3-teilig):**
```
{espId}:{gpio}:{sensorType}
```
Beispiel: `ESP_12AB34CD:5:ds18b20`

**Legacy-Format (2-teilig, noch unterstützt):**
```
{espId}:{gpio}
```
Beispiel: `ESP_12AB34CD:5`

```typescript
// useSensorId.ts, parseSensorId()
export function parseSensorId(value: string | undefined | null): SensorIdParts {
  const parts = value.split(':')
  if (parts.length < 2) return { espId: null, gpio: null, sensorType: null, isValid: false }
  const espId = parts[0] || null
  const gpio = isNaN(parseInt(parts[1], 10)) ? null : parseInt(parts[1], 10)
  const sensorType = parts[2] || null  // null bei Legacy-Format
  const isValid = espId !== null && gpio !== null
  return { espId, gpio, sensorType, isValid }
}
```

### URL-Format für Deep-Links

Für URL-Parameter (z.B. `?sensor=...`) wird ein **anderes Format** verwendet:
```
{espId}-gpio{gpio}
```
Beispiel: `ESP_12AB34CD-gpio5`

Dieses Format ist in der Router-Dokumentation und in `SensorsView.vue` (Query-Parameter `?sensor={espId}-gpio{gpio}`) dokumentiert. Es unterscheidet sich vom internen `sensorId`-Format.

> [!INKONSISTENZ] Zwei verschiedene sensorId-Formate koexistieren
>
> **Beobachtung:** Das interne `sensorId`-Format (`espId:gpio:sensorType`) unterscheidet sich vom URL-Format (`espId-gpio{gpio}`). Die `useSensorId.ts` kennt nur das interne Format. Das URL-Format wird separat geparst (ohne eigenes Composable).
>
> **Korrekte Stelle:** `El Frontend/src/composables/useSensorId.ts` (internes Format), `El Frontend/src/views/SensorsView.vue` (URL-Format)
>
> **Empfehlung:** Konsolidierung auf ein Format oder explizite Trennung durch Kommentare/Typaliase. `parseSensorIdFromUrl()` als separate Funktion hinzufügen.
>
> **Erst-Erkennung:** E4, 2026-04-26

### DS18B20-Overwrite-Bug (NB6 / I13)

> [!INKONSISTENZ] sensorId-Overwrite bei mehreren DS18B20 auf gleichem GPIO
>
> **Beobachtung:** Das aktuelle `sensorId`-Format `{espId}:{gpio}:{sensorType}` ist bei DS18B20-Sensoren nicht eindeutig, wenn zwei oder mehr DS18B20-Sensoren am gleichen OneWire-Bus (gleiche GPIO-Nummer) hängen, weil `sensorType` für alle `ds18b20` ist. In `sensorDefaults.ts` existiert `groupSensorsByBaseType()` mit dem Hinweis "Single-Value-Sensoren: unique Key per Sensor (gpio-basiert)", aber bei 2× DS18B20 auf GPIO 5 wäre der Key `5-ds18b20` für beide Sensoren identisch, was zum Overwrite führt.
>
> **Wurzelursache:** Der `sensorId` fehlt die OneWire-Adresse (`onewire_address`) als Disambiguierungsmerkmal.
>
> **Korrekte Stelle:** `El Frontend/src/composables/useSensorId.ts` (Erweiterung auf `espId:gpio:sensorType:address`), Server-API muss `onewire_address` in `sensor_data`-Events mitliefern
>
> **Empfehlung:** sensorId um optionale Adresse erweitern: `{espId}:{gpio}:{sensorType}:{onewire_address?}`. Gleichzeitige Server-Änderung notwendig.
>
> **Erst-Erkennung:** NB6 (MEMORY.md, 2026-03-07), I13, vollständig dokumentiert E4, 2026-04-26

---

## 11. Bekannte Inkonsistenzen (Zusammenfassung)

Alle Inkonsistenzen sind inline im jeweiligen Abschnitt dokumentiert:

| ID | Kurzbeschreibung | Abschnitt | Status |
|----|-----------------|-----------|--------|
| I4 | Kein `--ao-*`-Token-Präfix — Tailwind-basiertes Design-System | 9 | Bestätigt |
| I2 | actuator_type: Frontend erhält `relay` (Status) vs. `digital` (Config) | 11.1 | Dokumentiert |
| E1 | WebSocket-EventType-Union deckt nicht alle 44 `MessageType`-Strings ab | 6.3 | Vollständig analysiert |
| I13 + NB6 | sensorId-Format nicht eindeutig für Multi-DS18B20 auf gleicher GPIO | 10 | Bestätigt, Lösungsweg dokumentiert |
| — | Zwei sensorId-Formate (intern vs. URL) | 10 | Neu erkannt E4 |
| — | SensorsView öffnet nicht SensorConfigPanel (nur HardwareView) | 3.4 | Bestätigt |

### 11.1 actuator_type: relay vs. digital (I2)

> [!INKONSISTENZ] actuator_type in Frontend erhält zwei verschiedene Werte
>
> **Beobachtung:** Der Server sendet in `actuator_status`-WebSocket-Events `actuator_type` mit dem Original-ESP32-Wert (z.B. `relay`, `pump`, `valve`). In der REST-API (`GET /actuators/...`) und in der Datenbank (`actuator_configs`) wird `actuator_type` als Interface-Typ gespeichert: `digital` für alle Relay/Pump/Valve-Aktoren. Das Frontend löst diesen Widerspruch über `hardware_type` (enthält den originalen ESP32-Typ) in `getActuatorTypeInfo(actuator_type, hardware_type)` (`src/utils/labels.ts`, Zeile 99–117): `hardware_type ?? type` wird für Icon/Label-Lookup bevorzugt.
>
> **Beobachtung im Code:** `ActuatorCard.vue` (Zeile 45, 88, 246) und `DeviceMiniCard.vue` rufen `getActuatorTypeInfo(actuator.actuator_type, actuator.hardware_type)` auf. Das Mapping `'digital': { label: 'Digital', icon: 'ToggleRight' }` dient als Fallback wenn `hardware_type` fehlt.
>
> **Korrekte Stelle:** `El Frontend/src/utils/labels.ts`, Funktion `getActuatorTypeInfo` — SSOT für dieses Mapping
>
> **Empfehlung:** Das aktuelle `hardware_type`-Bevorzugungsmuster ist korrekt und konsistent. Dokumentation sollte klarstellen, dass `actuator_type === 'digital'` der normalisierte DB-Wert ist und `hardware_type` der semantisch relevante Anzeigewert.
>
> **Erst-Erkennung:** I2, vollständig dokumentiert E4, 2026-04-26

---

## Anhang: Verzeichnis-Struktur (Ist-Stand 2026-04-26)

```
El Frontend/src/
├── api/            28 Module (index.ts, uiApiError.ts, auth.ts, esp.ts, ...)
├── config/         device-schemas/ (JSON-Schemas für Sensoren/Aktoren)
├── components/     20 Unterverzeichnisse, ~127 Komponenten
│   ├── calibration/   2 Dateien
│   ├── charts/        5 Dateien
│   ├── command/       1 Datei
│   ├── common/        ~6 Dateien
│   ├── dashboard/     ~11 Dateien
│   ├── dashboard-widgets/ ~13 Dateien
│   ├── database/      6 Dateien
│   ├── devices/       10 Dateien
│   ├── error/         2 Dateien (ErrorDetailsModal, TroubleshootingPanel)
│   ├── esp/           11 Dateien
│   ├── filters/       1 Datei
│   ├── forms/         3 Dateien
│   ├── inventory/     5 Dateien
│   ├── logic/         1 Datei
│   ├── modals/        1 Datei
│   ├── monitor/       5 Dateien
│   ├── notifications/ 4 Dateien
│   ├── plugins/       2 Dateien
│   ├── quick-action/  7 Dateien
│   ├── rules/         5 Dateien
│   ├── safety/        1 Datei
│   ├── system-monitor/ ~9 Dateien
│   ├── widgets/       1 Datei
│   └── zones/         4 Dateien
├── composables/    36 Dateien
├── domain/         2 Dateien (esp/espHealth.ts, zone/ackPresentation.ts)
├── router/         1 Datei (index.ts, ~434 Zeilen)
├── services/       1 Datei (websocket.ts, ~625 Zeilen)
├── shared/
│   ├── design/     primitives/ (13), layout/ (3), patterns/ (5) = 21 Komponenten
│   └── stores/     22 Store-Dateien
├── stores/         2 Dateien (esp.ts ~2500 Zeilen, esp-websocket-subscription.ts)
├── styles/         6 CSS-Dateien (tokens, glass, animations, main, forms, tailwind)
├── types/          9 Type-Dateien
├── utils/          13 Utility-Module
├── views/          19 View-Dateien
├── App.vue         Root-Komponente
├── main.ts         Bootstrap
└── style.css       Globale CSS-Variablen (~800 Zeilen, historisch)
```
