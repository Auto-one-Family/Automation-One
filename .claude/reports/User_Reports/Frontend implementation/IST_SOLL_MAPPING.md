# AutomationOne Frontend - Vollstaendiges IST -> SOLL Mapping

**Version:** 2.0 (verify-plan + frontend-debug + mqtt-debug + system-control + meta-analyst)
**Datum:** 2026-02-11 (aktualisiert 2026-02-11, Deep-Verify)
**Zweck:** Vollstaendiger Ueberblick ueber jeden Bereich des Frontends: aktueller Zustand und Zielzustand nach Restrukturierung gemaess Frontend_Konsolidierung.md
**Methode:** Alle IST-Werte per wc -l, Glob, Grep gegen echte Codebase verifiziert. WS-Handler per Grep auf Funktionsnamen geprueft. MQTT/Docker/Grafana gegen Referenz-Docs abgeglichen.

---

## Uebersicht: Kennzahlen

| Metrik | IST | SOLL |
|--------|-----|------|
| Vue-Komponenten | 67 in `components/` + 11 Views | ~80+ in `modules/` + `shared/` |
| Stores | 5 in `stores/` + 10 in `shared/stores/` (4 renamed + 6 split) | 8+ in `shared/stores/` |
| API-Module | 17 in `api/` | 11 in `shared/services/api/` |
| Composables | 8+index in `composables/` | ~15 in `shared/` + `modules/*/composables/` |
| Utils | 15+index in `utils/` (16 Dateien) | ~12 in `shared/utils/` |
| Types | 4+1 in `types/` | 6+ in `shared/types/` |
| Style-Dateien | 1 (`style.css`, 805 Zeilen) | 5 in `styles/` |
| Ordnertiefe | 2 Ebenen (components/bereich/) | 3 Ebenen (modules/bereich/components/) |
| Hex-Codes in .vue | 30 Dateien | 0 Dateien |
| WS-Handler | 25 in esp.ts → 20 delegiert, 5 inline | verteilt auf 7 Stores (DONE) |
| WS-Event-Types | 26 im Filter (1 ohne Handler) | 26+ (logic_execution Handler NEU) |
| Test-Dateien | 26 (5 Store + 2 Composable + 14 Utils + 5 E2E) | 30+ (Split-Tests + Primitives) |
| Test-Zeilen (neu) | 3068 Z. (3 neue Store-Tests) | Aufteilen bei Store-Split |
| Backend-Router | 17 (kein monitoring/) | +1 monitoring (fuer Grafana-Proxy) |
| Groesste Datei | ESPOrbitalLayout.vue (3833 Z.), esp.ts (1611 Z., war 2598) | max 1500 Zeilen |

---

## 1. DESIGN SYSTEM (CSS + Primitives)

### 1.1 Styles

| IST | Zeilen | SOLL | Aktion |
|-----|--------|------|--------|
| `src/style.css` | 805 | `src/styles/main.css` | Neuer Entry, importiert alles |
| (in style.css :root Block) | Z.10-91 | `src/styles/tokens.css` | Extrahiere CSS Custom Properties |
| (in style.css .glass-*, glass vars) | Z.53-59, 240-246 | `src/styles/glass.css` | Extrahiere Glassmorphism |
| (in style.css @keyframes, animations) | verstreut | `src/styles/animations.css` | Extrahiere Animationen |
| (in style.css @tailwind Direktiven) | Z.1-3 | `src/styles/tailwind.css` | Extrahiere Tailwind Base |
| `src/main.ts` Z.8 `import './style.css'` | 1 | `import './styles/main.css'` | Import-Pfad aendern |

**CSS Token Status:** Bereits SEHR gut organisiert. :root hat 45+ Custom Properties fuer Farben (5 bg, 3 text, 4 iridescent, 4 status, 2 device), Glassmorphism (6 vars), Spacing (6), Radius (6), Transitions (3), Z-Index (8). **Problem:** 30 Vue-Dateien nutzen trotzdem direkte Hex-Codes (korrigiert von 29, MultiSensorChart.vue fehlte).

### 1.2 Primitives (components/common/ -> shared/design/primitives/)

| IST Datei | Zeilen | Props | SOLL Datei | Aktion |
|-----------|--------|-------|------------|--------|
| `components/common/Card.vue` | 101 | hoverable, noPadding, variant (7), glass, shimmer, iridescent | `shared/design/primitives/BaseCard.vue` | **Rename**. Bereits vollstaendig: glass, shimmer, iridescent, 7 Varianten, header/body/footer Slots |
| `components/common/Badge.vue` | 114 | variant (10), size (4), pulse, dot, bordered | `shared/design/primitives/BaseBadge.vue` | **Rename**. Bereits vollstaendig: success/warning/danger/info/gray/purple/orange/mock/real/neutral + pulse dot |
| `components/common/Button.vue` | 117 | variant (6), size (3), disabled, loading, fullWidth, type | `shared/design/primitives/BaseButton.vue` | **Rename**. Bereits vollstaendig: primary/secondary/danger/success/ghost/outline + Spinner |
| `components/common/Modal.vue` | 225 | open, title, maxWidth, showClose, closeOnOverlay, closeOnEscape | `shared/design/primitives/BaseModal.vue` | **Rename**. Bereits vollstaendig: Teleport, Escape, overlay click, scroll-lock, transitions |
| `components/common/Input.vue` | 120 | (Standard-Input) | `shared/design/primitives/BaseInput.vue` | **Rename** |
| `components/common/Toggle.vue` | 107 | (Switch mit Label) | `shared/design/primitives/BaseToggle.vue` | **Rename** |
| `components/common/Select.vue` | 121 | (Dropdown) | `shared/design/primitives/BaseSelect.vue` | **Rename** |
| `components/common/Spinner.vue` | 49 | (Loading-Spinner) | `shared/design/primitives/BaseSpinner.vue` | **Rename** |
| `components/common/LoadingState.vue` | 80 | text, fullHeight, size (sm/md/lg) | `shared/design/primitives/BaseSkeleton.vue` | **Rename+Enhance**: Skeleton-Placeholder hinzufuegen |
| -- | -- | -- | `shared/design/primitives/BasePopover.vue` | **NEU erstellen**: Floating-UI Popover |
| -- | -- | -- | `shared/design/primitives/BaseTooltip.vue` | **NEU erstellen**: Hover-Tooltip |
| -- | -- | -- | `shared/design/primitives/BaseIcon.vue` | **NEU erstellen**: Lucide Icon-Wrapper |

### 1.3 Patterns (components/common/ + NEU -> shared/design/patterns/)

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `components/common/EmptyState.vue` | 122 | `shared/design/patterns/EmptyState.vue` | **Move**. Hat icon, title, description, actionText |
| `components/common/ErrorState.vue` | 128 | `shared/design/patterns/ErrorState.vue` | **Move** |
| `components/common/ToastContainer.vue` | 328 | `shared/design/patterns/ToastContainer.vue` | **Move+Enhance**: Gruppierung, Auto-Dismiss |
| `components/database/DataTable.vue` | 265 | `shared/design/patterns/DataTable.vue` | **Generalisieren**: Domain-unabhaengig |
| `components/system-monitor/MonitorTabs.vue` | 486 | `shared/design/patterns/TabContainer.vue` | **NEU extrahieren** |
| `components/error/ErrorDetailsModal.vue` | 489 | `shared/design/patterns/ErrorDetailsModal.vue` | **Move** (global nutzbar) |
| `components/error/TroubleshootingPanel.vue` | 146 | `shared/design/patterns/TroubleshootingPanel.vue` | **Move** |
| `components/filters/UnifiedFilterBar.vue` | 408 | `shared/design/patterns/UnifiedFilterBar.vue` | **Move** (cross-modul) |
| -- | -- | `shared/design/patterns/ConfirmDialog.vue` | **NEU**: Delete/Disconnect Bestaetigung |
| -- | -- | `shared/design/patterns/FormSection.vue` | **NEU**: Label + Input + Validation + Error |
| -- | -- | `shared/design/patterns/StatusIndicator.vue` | **NEU**: Dot + Text, animiert |
| -- | -- | `shared/design/patterns/MetricCard.vue` | **NEU**: Aus StatCard ableiten |
| -- | -- | `shared/design/patterns/SearchFilter.vue` | **NEU**: Suchfeld + Filter-Chips |

### 1.4 Layout (components/layout/ -> shared/design/layout/)

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `components/layout/MainLayout.vue` | 61 | `shared/design/layout/AppShell.vue` | **Rename** |
| `components/layout/AppSidebar.vue` | 352 | `shared/design/layout/Sidebar.vue` | **Rename** |
| `components/layout/AppHeader.vue` | 210 | `shared/design/layout/TopBar.vue` | **Rename** |
| -- | -- | `shared/design/layout/ContentArea.vue` | **NEU**: Scrollbarer Content |

---

## 2. STORES

### 2.1 ESP Store Split (2598 Zeilen -> 7 Sub-Stores) — **IMPLEMENTIERT**

**Status:** Phase 6 ABGESCHLOSSEN. esp.ts von 2598 auf 1611 Zeilen reduziert (-987, -38%).
**Pattern:** WS-Dispatcher in esp.ts, Handler-Logik in Sub-Stores via Dependency Injection (devices, getDeviceId, callbacks).
**Keine Circular Dependencies:** Sub-Stores importieren NICHT useEspStore(). Stattdessen erhalten sie dependencies als Funktionsparameter.
**Tests:** 1118/1118 Vitest gruen, 0 TypeScript-Fehler nach jedem Split-Schritt verifiziert.

| Sub-Store | Datei | Zeilen | WS-Events | Inhalt |
|-----------|-------|--------|-----------|--------|
| zone | `shared/stores/zone.store.ts` | ~165 | zone_assignment, subzone_assignment | Zone/Subzone-Zuweisungen, Device-Updates via setDevice Callback |
| actuator | `shared/stores/actuator.store.ts` | ~265 | actuator_alert/status/response/command/command_failed, sequence_started/step/completed/error/cancelled | 10 Handler, Toast-Notifications, Device-Mutation |
| sensor | `shared/stores/sensor.store.ts` | ~280 | sensor_data, sensor_health | Multi-Value-Sensor HYBRID LOGIC, Quality Mapping, Stale-Detection |
| gpio | `shared/stores/gpio.store.ts` | ~310 | (kein WS, aber via esp_health) | GPIO Status State + Getters + Actions, OneWire Scan State + Actions |
| notification | `shared/stores/notification.store.ts` | ~110 | notification, error_event, system_event | Toast-Notifications, Troubleshooting-Detail-Events |
| config | `shared/stores/config.store.ts` | ~165 | config_response, config_published, config_failed | Config-Lifecycle Toasts, GPIO-Refresh nach Config-Change |
| **esp (verbleibend)** | `stores/esp.ts` | **1611** | esp_health + device_discovered/approved/rejected/rediscovered (5 inline) | Device-CRUD, Pending, WS-Dispatcher, esp_health, Discovery, sendActuatorCommand, emergencyStop |

> **ARCHITEKTUR-HINWEIS:** Dependency Injection Pattern statt Cross-Store Import gewaehlt. Sub-Stores erhalten `devices`, `getDeviceId`, `setDevice` als Funktionsparameter. Vermeidet Circular Dependencies und macht Sub-Stores unit-testbar.
>
> **VERBLEIBENDE INLINE-HANDLER:** esp_health (komplex, nutzt fetchAll + updateGpioStatusFromHeartbeat), device_discovered/approved/rejected/rediscovered (Device-CRUD), sendActuatorCommand, emergencyStopAll bleiben in esp.ts da sie Device-State direkt mutieren.
>
> **WS-FILTER-HINWEIS:** 26 Event-Types registriert, 25 Handler implementiert. `logic_execution` hat KEINEN Handler — SOLL-Luecke fuer Rules-Modul (Phase 17).

### 2.2 Andere Stores

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `stores/auth.ts` | 179 | `shared/stores/auth.store.ts` | **DONE** (Re-Export Shim) |
| `stores/logic.ts` | 347 | `shared/stores/logic.store.ts` | **DONE** (Re-Export Shim) |
| `stores/dragState.ts` | 447 | `shared/stores/dragState.store.ts` | **DONE** (Re-Export Shim) |
| `stores/database.ts` | 316 | `shared/stores/database.store.ts` | **DONE** (Re-Export Shim) |
| -- | -- | `shared/stores/zone.store.ts` | **DONE** (ESP Split) |
| -- | -- | `shared/stores/actuator.store.ts` | **DONE** (ESP Split) |
| -- | -- | `shared/stores/sensor.store.ts` | **DONE** (ESP Split) |
| -- | -- | `shared/stores/gpio.store.ts` | **DONE** (ESP Split) |
| -- | -- | `shared/stores/notification.store.ts` | **DONE** (ESP Split) |
| -- | -- | `shared/stores/config.store.ts` | **DONE** (ESP Split) |
| -- | -- | `shared/stores/ui.store.ts` | **NEU**: Sidebar, Active-Tab, Theme |
| -- | -- | `shared/stores/system.store.ts` | **NEU**: System-Health, Server-Status |

---

## 3. API-LAYER (17 -> 11 Module)

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `api/index.ts` | 97 | `shared/services/api/client.ts` | **Rename**: Axios-Instanz + Interceptors |
| `api/esp.ts` | 696 | `shared/services/api/esp.api.ts` | **Move** |
| `api/debug.ts` | 467 | `shared/services/api/esp.api.ts` | **Merge in esp.api** |
| `api/sensors.ts` | 353 | `shared/services/api/sensors.api.ts` | **Move** |
| `api/actuators.ts` | 148 | `shared/services/api/actuators.api.ts` | **Move** |
| `api/zones.ts` | 84 | `shared/services/api/zones.api.ts` | **Move** |
| `api/subzones.ts` | 154 | `shared/services/api/zones.api.ts` | **Merge in zones** |
| `api/auth.ts` | 65 | `shared/services/api/auth.api.ts` | **Move** |
| `api/users.ts` | 149 | `shared/services/api/users.api.ts` | **Move** |
| `api/logic.ts` | 141 | `shared/services/api/logic.api.ts` | **Move** |
| `api/audit.ts` | 579 | `shared/services/api/monitoring.api.ts` | **Merge** |
| `api/logs.ts` | 185 | `shared/services/api/monitoring.api.ts` | **Merge** |
| `api/errors.ts` | 92 | `shared/services/api/monitoring.api.ts` | **Merge** |
| `api/database.ts` | 146 | `shared/services/api/monitoring.api.ts` | **Merge** |
| `api/health.ts` | 54 | `shared/services/api/system.api.ts` | **Merge** |
| `api/config.ts` | 77 | `shared/services/api/system.api.ts` | **Merge** |
| `api/loadtest.ts` | 113 | `shared/services/api/system.api.ts` | **Merge** |

---

## 4. COMPOSABLES

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `composables/useWebSocket.ts` | 310 | `shared/composables/useWebSocket.ts` | **Move** (global) |
| `composables/useToast.ts` | 171 | `shared/composables/useToast.ts` | **Move** (global) |
| `composables/useModal.ts` | 84 | `shared/composables/useModal.ts` | **Move** (global) |
| `composables/useQueryFilters.ts` | 442 | `shared/composables/useQueryFilters.ts` | **Move** (global) |
| `composables/useSwipeNavigation.ts` | 155 | `shared/composables/useSwipeNavigation.ts` | **Move** (global) |
| `composables/useZoneDragDrop.ts` | 512 | `modules/dashboard/composables/useZoneDragDrop.ts` | **Move** (dashboard-spezifisch) |
| `composables/useGpioStatus.ts` | 270 | `modules/dashboard/composables/useGpioStatus.ts` | **Move** (dashboard-spezifisch) |
| `composables/useConfigResponse.ts` | 101 | `modules/dashboard/composables/useConfigResponse.ts` | **Move** (dashboard-spezifisch) |
| -- | -- | `shared/composables/useGrafana.ts` | **NEU**: Panel-URL Builder |
| -- | -- | `shared/composables/useAuth.ts` | **NEU**: Auth-State Wrapper |
| -- | -- | `shared/composables/useBreakpoints.ts` | **NEU**: Responsive |
| -- | -- | `shared/composables/useKeyboard.ts` | **NEU**: Keyboard-Shortcuts |
| -- | -- | `modules/monitoring/composables/useSystemHealth.ts` | **NEU** |
| -- | -- | `modules/monitoring/composables/useLogStream.ts` | **NEU** |
| -- | -- | `modules/rules/composables/useRuleCanvas.ts` | **NEU** |
| -- | -- | `modules/rules/composables/useRuleValidation.ts` | **NEU** |

---

## 5. TYPES

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `types/index.ts` | 994 | `shared/types/esp.types.ts` + `shared/types/common.types.ts` | **Split** |
| `types/websocket-events.ts` | 770 | `shared/types/websocket.types.ts` | **Rename** |
| `types/logic.ts` | 220 | `shared/types/logic.types.ts` | **Rename** |
| `types/gpio.ts` | 157 | `shared/types/gpio.types.ts` | **Rename** |
| `types/event-grouping.ts` | 67 | `shared/types/common.types.ts` | **Merge** |
| -- | -- | `shared/types/system.types.ts` | **NEU** |

---

## 6. UTILITIES

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `utils/formatters.ts` | 632 | `shared/utils/formatters.ts` | **Move** |
| `utils/labels.ts` | 319 | `shared/utils/labels.ts` | **Move** |
| `utils/sensorDefaults.ts` | 750 | `shared/utils/sensorDefaults.ts` | **Move** |
| `utils/actuatorDefaults.ts` | 236 | `shared/utils/actuatorDefaults.ts` | **Move** |
| `utils/errorCodeTranslator.ts` | 137 | `shared/utils/errorCodeTranslator.ts` | **Move** |
| `utils/databaseColumnTranslator.ts` | 982 | `shared/utils/databaseColumnTranslator.ts` | **Move** |
| `utils/logMessageTranslator.ts` | 485 | `shared/utils/logMessageTranslator.ts` | **Move** |
| `utils/logSummaryGenerator.ts` | 424 | `shared/utils/logSummaryGenerator.ts` | **Move** |
| `utils/eventTransformer.ts` | 485 | `shared/utils/eventTransformer.ts` | **Move** |
| `utils/eventGrouper.ts` | 257 | `shared/utils/eventGrouper.ts` | **Move** |
| `utils/eventTypeIcons.ts` | 156 | `shared/utils/eventTypeIcons.ts` | **Move** |
| `utils/gpioConfig.ts` | 700 | `shared/utils/gpioConfig.ts` | **Move** |
| `utils/zoneColors.ts` | 148 | `shared/utils/color.ts` | **Rename** |
| `utils/wifiStrength.ts` | 192 | `shared/utils/wifiStrength.ts` | **Move** |
| `utils/logger.ts` | 111 | `shared/utils/logger.ts` | **Move** |

---

## 7. SERVICES

| IST Datei | Zeilen | SOLL Datei | Aktion |
|-----------|--------|------------|--------|
| `services/websocket.ts` | 644 | `shared/services/websocket.ts` | **Move** |
| -- | -- | `shared/services/grafana.ts` | **NEU**: Grafana HTTP API |

---

## 8. VIEWS -> MODULES

### 8.1 Dashboard-Modul (23 bestehende + 3 neue Komponenten)

| IST Komponente | Zeilen | SOLL Pfad |
|----------------|--------|-----------|
| `views/DashboardView.vue` | 685 | `modules/dashboard/DashboardView.vue` |
| `components/esp/ESPOrbitalLayout.vue` | 3833 | `modules/dashboard/components/orbital/ESPOrbitalLayout.vue` |
| `components/esp/ESPCard.vue` | 1739 | `modules/dashboard/components/orbital/ESPCard.vue` |
| `components/esp/SensorSatellite.vue` | 747 | `modules/dashboard/components/orbital/SensorSatellite.vue` |
| `components/esp/ActuatorSatellite.vue` | 345 | `modules/dashboard/components/orbital/ActuatorSatellite.vue` |
| `components/esp/SensorValueCard.vue` | 546 | `modules/dashboard/components/orbital/SensorValueCard.vue` |
| `components/esp/ConnectionLines.vue` | 401 | `modules/dashboard/components/orbital/ConnectionLines.vue` |
| `components/esp/GpioPicker.vue` | 729 | `modules/dashboard/components/orbital/GpioPicker.vue` |
| `components/esp/AnalysisDropZone.vue` | 848 | `modules/dashboard/components/charts/AnalysisDropZone.vue` |
| `components/esp/ESPSettingsPopover.vue` | 1498 | `modules/dashboard/components/panels/ESPSettingsPopover.vue` |
| `components/esp/PendingDevicesPanel.vue` | 735 | `modules/dashboard/components/panels/PendingDevicesPanel.vue` |
| `components/dashboard/ActionBar.vue` | 405 | `modules/dashboard/components/ActionBar.vue` |
| `components/dashboard/StatusPill.vue` | 82 | `modules/dashboard/components/StatusPill.vue` |
| `components/dashboard/StatCard.vue` | 216 | -> `shared/design/patterns/MetricCard.vue` |
| `components/dashboard/ComponentSidebar.vue` | 430 | `modules/dashboard/components/sidebar/ComponentSidebar.vue` |
| `components/dashboard/SensorSidebar.vue` | 573 | `modules/dashboard/components/sidebar/SensorSidebar.vue` |
| `components/dashboard/ActuatorSidebar.vue` | 518 | `modules/dashboard/components/sidebar/ActuatorSidebar.vue` |
| `components/dashboard/CrossEspConnectionOverlay.vue` | 496 | `modules/dashboard/components/orbital/ConnectionOverlay.vue` |
| `components/dashboard/UnassignedDropBar.vue` | 481 | `modules/dashboard/components/sidebar/UnassignedDropBar.vue` |
| `components/zones/ZoneGroup.vue` | 920 | `modules/dashboard/components/ZoneGroup.vue` |
| `components/zones/ZoneAssignmentPanel.vue` | 589 | `modules/dashboard/components/panels/ZoneAssignmentPanel.vue` |
| `components/charts/MultiSensorChart.vue` | 898 | `modules/dashboard/components/charts/MultiSensorChart.vue` |
| `components/modals/CreateMockEspModal.vue` | 318 | `modules/dashboard/components/CreateMockEspModal.vue` |
| -- | -- | `modules/dashboard/components/charts/GrafanaPanelEmbed.vue` (NEU) |
| -- | -- | `modules/dashboard/components/panels/SensorDetailPanel.vue` (NEU) |
| -- | -- | `modules/dashboard/components/panels/ActuatorControlPanel.vue` (NEU) |

### 8.2 Monitoring-Modul (25 bestehende + 1 neue Komponente)

| IST Komponente | Zeilen | SOLL Pfad |
|----------------|--------|-----------|
| `views/SystemMonitorView.vue` | 2465 | `modules/monitoring/MonitoringView.vue` |
| `components/system-monitor/EventsTab.vue` | 181 | `modules/monitoring/components/tabs/EventsLog.vue` |
| `components/system-monitor/ServerLogsTab.vue` | 1536 | `modules/monitoring/components/tabs/ServerLogs.vue` |
| `components/system-monitor/DatabaseTab.vue` | 655 | `modules/monitoring/components/tabs/DatabaseStatus.vue` |
| `components/system-monitor/MqttTrafficTab.vue` | 1008 | `modules/monitoring/components/tabs/MqttTraffic.vue` |
| `components/system-monitor/HealthTab.vue` | 780 | `modules/monitoring/components/tabs/HealthOverview.vue` |
| `components/system-monitor/HealthSummaryBar.vue` | 561 | `modules/monitoring/components/MetricsSummary.vue` |
| `components/system-monitor/HealthProblemChip.vue` | 187 | `modules/monitoring/components/HealthProblemChip.vue` |
| `components/system-monitor/EventDetailsPanel.vue` | 1740 | `modules/monitoring/components/EventDetailsPanel.vue` |
| `components/system-monitor/EventTimeline.vue` | 532 | `modules/monitoring/components/EventTimeline.vue` |
| `components/system-monitor/UnifiedEventList.vue` | 1616 | `modules/monitoring/components/UnifiedEventList.vue` |
| `components/system-monitor/MonitorHeader.vue` | 665 | `modules/monitoring/components/MonitorHeader.vue` |
| `components/system-monitor/MonitorFilterPanel.vue` | 453 | `modules/monitoring/components/LogFilter.vue` |
| `components/system-monitor/DataSourceSelector.vue` | 1186 | `modules/monitoring/components/DataSourceSelector.vue` |
| `components/system-monitor/CleanupPanel.vue` | 1904 | `modules/monitoring/components/CleanupPanel.vue` |
| `components/system-monitor/CleanupPreview.vue` | 410 | `modules/monitoring/components/CleanupPreview.vue` |
| `components/system-monitor/LogManagementPanel.vue` | 899 | `modules/monitoring/components/LogManagementPanel.vue` |
| `components/system-monitor/AutoCleanupStatusBanner.vue` | 439 | `modules/monitoring/components/AutoCleanupStatusBanner.vue` |
| `components/system-monitor/PreviewEventCard.vue` | 155 | `modules/monitoring/components/PreviewEventCard.vue` |
| `components/system-monitor/RssiIndicator.vue` | 126 | `modules/monitoring/components/RssiIndicator.vue` |
| `components/database/SchemaInfoPanel.vue` | 126 | `modules/monitoring/components/SchemaInfoPanel.vue` |
| `components/database/TableSelector.vue` | 88 | `modules/monitoring/components/TableSelector.vue` |
| `components/database/FilterPanel.vue` | 257 | `modules/monitoring/components/FilterPanel.vue` |
| `components/database/RecordDetailModal.vue` | 170 | `modules/monitoring/components/RecordDetailModal.vue` |
| `components/database/Pagination.vue` | 185 | `shared/design/patterns/Pagination.vue` |
| -- | -- | `modules/monitoring/components/tabs/GrafanaDashboards.vue` (NEU) |

### 8.3 Komponenten/Geraete-Modul (neu)

| IST | Zeilen | SOLL |
|-----|--------|------|
| `views/SensorsView.vue` | 691 | `modules/components/ComponentsView.vue` |
| `components/safety/EmergencyStopButton.vue` | 176 | `modules/components/components/EmergencyStopButton.vue` |
| -- | -- | `modules/components/components/DeviceLibrary.vue` (NEU) |
| -- | -- | `modules/components/components/DeviceDetailCard.vue` (NEU) |
| -- | -- | `modules/components/components/LibraryManager.vue` (NEU) |
| -- | -- | `modules/components/components/GpioOverview.vue` (NEU) |

### 8.4 Regeln-Modul (neu, ersetze Placeholder)

| IST | Zeilen | SOLL |
|-----|--------|------|
| `views/LogicView.vue` | 48 (PLACEHOLDER!) | `modules/rules/RulesView.vue` (Neubau mit Vue Flow) |
| -- | -- | `modules/rules/components/RuleCanvas.vue` (NEU) |
| -- | -- | `modules/rules/components/RuleNode.vue` (NEU) |
| -- | -- | `modules/rules/components/RuleEdge.vue` (NEU) |
| -- | -- | `modules/rules/components/RuleNodeConfig.vue` (NEU) |
| -- | -- | `modules/rules/components/RuleToolbar.vue` (NEU) |
| -- | -- | `modules/rules/components/RuleTestPanel.vue` (NEU) |

### 8.5 Weitere Module

| IST View | Zeilen | SOLL Modul |
|----------|--------|------------|
| `views/UserManagementView.vue` | 565 | `modules/users/UsersView.vue` |
| `views/SystemConfigView.vue` | 285 | `modules/system/SystemView.vue` |
| `views/SettingsView.vue` | 104 | `modules/system/components/GeneralSettings.vue` |
| `views/MaintenanceView.vue` | 528 | `modules/maintenance/MaintenanceView.vue` |
| `views/LoadTestView.vue` | 388 | `modules/load-test/LoadTestView.vue` |
| `views/LoginView.vue` | 361 | `modules/auth/LoginView.vue` |
| `views/SetupView.vue` | 214 | `modules/auth/SetupView.vue` |

---

## 9. ROUTER

| Aspekt | IST | SOLL |
|--------|-----|------|
| Pfad | `src/router/index.ts` (182 Z.) | `src/app/router/index.ts` |
| Guards | Inline in beforeEach | Extrahiert in `src/app/router/guards.ts` |
| Lazy-Loading | Bereits alle `() => import(...)` | Beibehalten, Pfade auf modules/ aktualisieren |
| Deprecated Redirects | 7 Stueck | Aufraeumen oder beibehalten |

---

## 10. ENTRY POINTS

| IST | SOLL | Aktion |
|-----|------|--------|
| `src/main.ts` (53 Z.) | `src/app/main.ts` | **Move** |
| `src/App.vue` (42 Z.) | `src/app/App.vue` | **Move** |

---

## 11. HEX-CODE-BEREINIGUNG (30 Dateien)

Dateien mit direkten Hex-Codes statt CSS-Tokens (verifiziert per grep `#[0-9a-fA-F]{3,8}`):

| # | Datei | Modul-Zuordnung |
|---|-------|----------------|
| 1 | `components/esp/SensorSatellite.vue` | Dashboard |
| 2 | `views/SensorsView.vue` | Components |
| 3 | `components/charts/MultiSensorChart.vue` | Dashboard |
| 4 | `components/zones/ZoneAssignmentPanel.vue` | Dashboard |
| 5 | `components/esp/ESPSettingsPopover.vue` | Dashboard |
| 6 | `components/system-monitor/ServerLogsTab.vue` | Monitoring |
| 7 | `components/esp/ESPCard.vue` | Dashboard |
| 8 | `components/system-monitor/UnifiedEventList.vue` | Monitoring |
| 9 | `components/system-monitor/EventDetailsPanel.vue` | Monitoring |
| 10 | `components/esp/AnalysisDropZone.vue` | Dashboard |
| 11 | `components/system-monitor/CleanupPanel.vue` | Monitoring |
| 12 | `components/esp/ESPOrbitalLayout.vue` | Dashboard |
| 13 | `views/SystemMonitorView.vue` | Monitoring |
| 14 | `components/system-monitor/HealthTab.vue` | Monitoring |
| 15 | `components/system-monitor/HealthSummaryBar.vue` | Monitoring |
| 16 | `components/system-monitor/HealthProblemChip.vue` | Monitoring |
| 17 | `components/system-monitor/EventTimeline.vue` | Monitoring |
| 18 | `components/system-monitor/DataSourceSelector.vue` | Monitoring |
| 19 | `components/safety/EmergencyStopButton.vue` | Components |
| 20 | `components/error/TroubleshootingPanel.vue` | Shared |
| 21 | `components/error/ErrorDetailsModal.vue` | Shared |
| 22 | `components/system-monitor/CleanupPreview.vue` | Monitoring |
| 23 | `components/dashboard/ActionBar.vue` | Dashboard |
| 24 | `components/system-monitor/RssiIndicator.vue` | Monitoring |
| 25 | `components/system-monitor/MonitorFilterPanel.vue` | Monitoring |
| 26 | `components/system-monitor/AutoCleanupStatusBanner.vue` | Monitoring |
| 27 | `components/system-monitor/PreviewEventCard.vue` | Monitoring |
| 28 | `components/filters/UnifiedFilterBar.vue` | Shared |
| 29 | `components/modals/CreateMockEspModal.vue` | Dashboard |
| 30 | `components/common/ToastContainer.vue` | Shared |

---

## 12. GRAFANA-INTEGRATION (Server + Docker + Frontend)

| Aufgabe | Zustaendig | Status | Verifizierung |
|---------|-----------|--------|---------------|
| `grafana.ini: allow_embedding = true` | system-control | Zu implementieren | Nicht in docker/grafana/ gefunden (verifiziert) |
| `grafana.ini: auth.anonymous = Viewer` | system-control | Zu implementieren | Nicht in docker/grafana/ gefunden (verifiziert) |
| Backend-Proxy `/api/v1/monitoring/metrics` | server-development | **EXISTIERT NICHT** | Kein monitoring-Router in api/v1/. Verfuegbare Router: actuators, ai, audit, auth, debug, errors, esp, health, kaiser, library, logic, sensor_type_defaults, sensors, sequences, subzone, users, zone |
| Backend-Proxy `/api/v1/monitoring/logs` | server-development | **EXISTIERT NICHT** | Loki-Logs werden direkt ueber Grafana abgefragt, kein Backend-Proxy noetig wenn Grafana-Embedding genutzt wird |
| `shared/composables/useGrafana.ts` | frontend-development | Zu implementieren | -- |
| `shared/services/grafana.ts` | frontend-development | Zu implementieren | -- |
| `modules/monitoring/components/tabs/GrafanaDashboards.vue` | frontend-development | Zu implementieren | -- |
| `modules/dashboard/components/charts/GrafanaPanelEmbed.vue` | frontend-development | Zu implementieren | -- |

> **SYSTEM-CONTROL-HINWEIS:** Grafana laeuft im Docker-Profil `monitoring` (Port 3000). Provisioning-Dateien existieren unter `docker/grafana/provisioning/` (dashboards/, alerting/). Die Embedding-Config muss in `docker/grafana/grafana.ini` oder als Environment-Variable in docker-compose.yml gesetzt werden: `GF_SECURITY_ALLOW_EMBEDDING=true`, `GF_AUTH_ANONYMOUS_ENABLED=true`, `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`.
>
> **META-ANALYST-HINWEIS:** Die Backend-Proxy-Endpoints `/api/v1/monitoring/*` existieren in KEINEM Report oder in der Codebase. Wahrscheinlich aus der Frontend_Konsolidierung.md uebernommen ohne Backend-Verifizierung. Alternative: Grafana-iframes direkt einbetten (kein Proxy noetig), oder dedizierte Endpoints spaeter erstellen wenn Proxy-Auth gewuenscht.

---

## 13. TEST-INFRASTRUKTUR

| IST | Zeilen | Tests | SOLL | Aktion |
|-----|--------|-------|------|--------|
| `tests/unit/stores/auth.test.ts` | ~200 | 37 | Pfade aktualisieren | Update Imports |
| `tests/unit/stores/esp.test.ts` | ~300 | 40 | Split -> esp + sensor + actuator + zone | Aufteilen |
| `tests/unit/stores/database.test.ts` | 1139 | neu (umfangreich) | Pfade aktualisieren | Update |
| `tests/unit/stores/dragState.test.ts` | 981 | neu (umfangreich) | Pfade aktualisieren | Update |
| `tests/unit/stores/logic.test.ts` | 948 | neu (umfangreich) | Pfade aktualisieren | Update |
| `tests/unit/composables/useToast.test.ts` | ~150 | 27 | Pfade aktualisieren | Update |
| `tests/unit/composables/useWebSocket.test.ts` | ~300 | 55 | Pfade aktualisieren | Update |
| `tests/unit/utils/formatters.test.ts` | ~400 | 65 | Pfade aktualisieren | Update |
| `tests/unit/utils/*.test.ts` (13 weitere) | verschieden | verschieden | Pfade aktualisieren | Update |
| `tests/e2e/scenarios/*.spec.ts` (5) | -- | -- | Pfade aktualisieren | Update |

> **Hinweis:** 14 Utils-Tests (formatters, errorCodeTranslator, labels, zoneColors, wifiStrength, sensorDefaults, actuatorDefaults, gpioConfig, databaseColumnTranslator, eventTransformer, logMessageTranslator, eventGrouper, eventTypeIcons, logSummaryGenerator), 5 Store-Tests, 2 Composable-Tests, 5 E2E-Specs = **26 Testdateien** gesamt + 10 Support-Dateien (setup.ts, 3 mocks, 4 e2e helpers, 2 e2e global setup/teardown).
>
> **Neue Store-Tests sind NICHT trivial:** database.test.ts (1139 Z.), dragState.test.ts (981 Z.), logic.test.ts (948 Z.) = 3068 Zeilen neuer Tests. Diese muessen beim Store-Split mitaufgeteilt werden.

| -- | -- | -- | Tests fuer Primitives (>=80% Coverage) | NEU |
| -- | -- | -- | Tests fuer Patterns | NEU |
| **Gesamt:** 1118 Vitest-Tests | | | 1118+ Tests muessen gruen bleiben | |

---

## 14. MIGRATIONS-REIHENFOLGE

| Phase | Aufgabe | ~Dateien | Abhaengigkeit |
|-------|---------|---------|-------------|
| 1 | ~~Styles aufteilen~~ | ~~6~~ | **DONE** (5 files in styles/) |
| 2 | ~~Primitives umbenennen + Re-Exports~~ | ~~15~~ | **DONE** (9 Base* + 9 Re-Export Shims) |
| 3 | ~~Patterns erstellen/migrieren~~ | ~~13~~ | **PARTIAL** (3/13 Patterns: EmptyState, ErrorState, ToastContainer) |
| 4 | ~~Layout umbenennen~~ | ~~5~~ | **DONE** (3 Layout + 3 Re-Export Shims) |
| 5 | Router Guards extrahieren | 3 | Phase 4 (klein, niedrige Prio) |
| 6 | ~~ESP Store aufteilen~~ | ~~8~~ | **DONE** (7 Sub-Stores, 2598→1611 Z.) |
| 7 | ~~Andere Stores umbenennen~~ | ~~4~~ | **DONE** (4 Re-Export Shims) |
| 8 | API-Module konsolidieren | 17 | Unabhaengig |
| 9 | Composables aufteilen | 10 | Phase 8 |
| 10 | Types aufteilen | 6 | Unabhaengig |
| 11 | Utils umziehen | 16 | Unabhaengig |
| 12 | Dashboard-Modul | 23+ | Phase 2-11 |
| 13 | Monitoring-Modul | 25+ | Phase 2-11 |
| 14 | Restliche Module | 10+ | Phase 2-11 |
| 15 | Hex-Codes bereinigen | 29 | Phase 1 |
| 16 | Grafana-Integration | 5 | Phase 13 |
| 17 | Regeln-Modul (Vue Flow) | 8+ | Phase 12 |
| 18 | Geraete-Library-Modul | 6+ | Phase 12 |
| 19 | Test-Coverage erweitern | Laufend | Alle |

---

## 15. QUALITAETSKRITERIEN

- [ ] Kein Hex-Farbcode direkt in Komponenten
- [ ] Jede Glassmorphism-Variante existiert genau einmal
- [ ] Jeder Modal/Popover nutzt BaseModal/BasePopover
- [x] ESP-Store aufgeteilt: 2598 → 1611 Z. (+ 6 Sub-Stores). Ziel <=900 Z. noch nicht erreicht; verbleibend: esp_health, Device-CRUD, Discovery, sendActuatorCommand
- [ ] Jedes Modul hat Ordner unter `modules/`
- [ ] Shared Patterns von mindestens 2 Modulen genutzt
- [ ] Lazy-Loading fuer alle Module
- [ ] TypeScript strict mode ueberall
- [ ] Vitest-Coverage pro Primitive >=80%
- [ ] Grafana-Embedding funktioniert
- [ ] `npm run build` erfolgreich
- [ ] Alle 1118+ Tests gruen
- [ ] logic_execution WS-Handler implementiert (in rules.store.ts)
- [ ] Store-Tests (3068 Z.) beim Split mitaufgeteilt
- [ ] Backend monitoring-Router erstellt ODER Grafana-iframe direkt eingebettet

---

## 16. META-ANALYST: CROSS-REPORT-ERKENNTNISSE

> Korrelationen zwischen Frontend-Mapping, Server-Architektur, MQTT-Protokoll und Docker-Stack.

### Konsistenz-Pruefungen

| Aspekt | Frontend (IST) | Server (IST) | Bewertung |
|--------|---------------|--------------|-----------|
| WS-Events (Frontend Filter) | 26 Types | Server broadcastet 28 Types (WEBSOCKET_EVENTS.md v2.1) | **2 Events NICHT im Frontend-Filter:** `esp_diagnostics` (HealthMonitor 60s Zyklus) und `events_restored` (Audit Backup Restore). Beide relevant fuer Monitoring-Modul |
| API-Module (17) | actuators, auth, audit, config, database, debug, errors, esp, health, loadtest, logic, logs, sensors, subzones, users, zones + index | 17 Router (actuators, ai, audit, auth, debug, errors, esp, health, kaiser, library, logic, sensor_type_defaults, sensors, sequences, subzone, users, zone) | **Namensabweichungen:** Frontend `config.ts` ↔ Server hat keinen config-Router. Frontend `loadtest.ts` ↔ Server hat keinen loadtest-Router. Frontend `database.ts` ↔ Server hat keinen database-Router. Frontend `logs.ts` ↔ Server hat keinen logs-Router |
| MQTT-Topics | Kein direkter MQTT-Zugriff im Frontend | Server MQTT → WS Bridge | Korrekt: Frontend nutzt nur WS, kein direktes MQTT |
| Grafana | Embedding geplant, Config fehlt | Prometheus-Metriken per instrumentator aktiv | **Luecke:** Monitoring-Stack laeuft, aber Frontend-Integration fehlt noch |

### Identifizierte SOLL-Luecken (kein IST-Gegenstueck)

1. **logic_execution WS-Handler:** Im Filter registriert, kein Handler. Rules-Modul (Sec 8.4) ist PLACEHOLDER (LogicView.vue = 48 Z.)
2. **esp_diagnostics + events_restored:** Server broadcastet 28 Events, Frontend subscribed nur 26. `esp_diagnostics` (HealthMonitor-Daten: Heap, Circuit Breaker, Watchdog) fehlt im Monitoring-Modul. `events_restored` (Audit-Restore) fehlt ebenfalls
3. **Backend monitoring-Router:** Fuer Grafana-Proxy referenziert, existiert nicht. Alternative: iframes direkt
4. **Frontend API-Module ohne Server-Router:** `config.ts`, `loadtest.ts`, `database.ts`, `logs.ts` - diese nutzen wahrscheinlich Unter-Pfade anderer Router (z.B. `/api/v1/debug/*` fuer logs)
5. **Server-Router ohne Frontend-API:** `ai`, `kaiser`, `library`, `sensor_type_defaults`, `sequences` - diese haben KEIN Frontend-API-Modul

### Risiko-Bewertung fuer Migration

| Risiko | Beschreibung | Mitigation |
|--------|-------------|------------|
| **HOCH** | ESP Store Split bricht 25 WS-Handler-Registrierungen | WS-Dispatcher Pattern beibehalten, nur Handler-Funktionen verschieben |
| **HOCH** | 3068 Z. neue Store-Tests muessen mitmigriert werden | Tests VOR Store-Split auf 1118+ Pass verifizieren |
| **MITTEL** | API-Modul-Merges koennten Import-Pfade in 67 Components brechen | Re-Export-Layer in shared/services/api/index.ts |
| **MITTEL** | Hex-Code-Bereinigung in 30 Dateien parallel zur Migration | Phase 15 NACH Modul-Migration (nicht gleichzeitig) |
| **NIEDRIG** | Grafana-Integration hat keine Server-Abhaengigkeit wenn iframe | iframe-Approach bevorzugen |

---

*Erstellt als vollstaendiges IST->SOLL Mapping. Jede Datei mit Pfad, Zeilen und Ziel dokumentiert.*
*Basierend auf Frontend_Konsolidierung.md und vollstaendiger Codebase-Analyse vom 2026-02-11.*
*v2.0: Deep-Verify durch verify-plan + frontend-debug + mqtt-debug + system-control + meta-analyst.*

---

## ANHANG A: VERIFIZIERUNGS-PROTOKOLL v1.1 (verify-plan + frontend-debug)

**Datum:** 2026-02-11 (erste Verifizierung)
**Methode:** IST-Werte gegen Codebase per Glob, Grep, wc -l

### Korrekturen v1.1

| # | Sektion | Was | Alt | Neu | Grund |
|---|---------|-----|-----|-----|-------|
| 1 | Kennzahlen | Utils-Anzahl | 16+index | 15+index (16 Dateien) | 15 Module + 1 index.ts = 16 total |
| 2 | Kennzahlen | Hex-Code-Dateien | 29 | 30 | MultiSensorChart.vue fehlte |
| 3 | Sec 1.3 | TroubleshootingPanel.vue Zeilen | -- | 146 | Verifiziert |
| 4 | Sec 2.1 | Section-Label Zeile 1-99 | "Imports + Helpers" | "Imports + Helpers + State" | Store-Definition beginnt Z.86 |
| 5 | Sec 2.1 | Section-Label Zeile 686-1314 | "Device CRUD" | "Pending + Device CRUD" | fetchPendingDevices fehlte in Beschreibung |
| 6 | Sec 2.1 | Store-Split Hinweis | -- | Architektur-Hinweis ergaenzt | Cross-Store devices.value Dependency |
| 7 | Sec 2.2 | auth.ts Zeilen | ~180 | 179 | Exakter Wert |
| 8 | Sec 3 | actuators.ts Zeilen | -- | 148 | Verifiziert |
| 9 | Sec 3 | subzones.ts Zeilen | -- | 154 | Verifiziert |
| 10 | Sec 3 | users.ts Zeilen | -- | 149 | Verifiziert |
| 11 | Sec 3 | database.ts Zeilen | -- | 146 | Verifiziert |
| 12 | Sec 3 | logs.ts Zeilen | -- | 185 | Verifiziert |
| 13 | Sec 4 | useToast.ts Zeilen | -- | 171 | Verifiziert |
| 14 | Sec 4 | useSwipeNavigation.ts Zeilen | -- | 155 | Verifiziert |
| 15 | Sec 5 | gpio.ts Zeilen | -- | 157 | Verifiziert |
| 16 | Sec 6 | eventTypeIcons.ts Zeilen | -- | 156 | Verifiziert |
| 17 | Sec 6 | zoneColors.ts Zeilen | -- | 148 | Verifiziert |
| 18 | Sec 6 | wifiStrength.ts Zeilen | -- | 192 | Verifiziert |
| 19 | Sec 8.2 | EventsTab.vue Zeilen | -- | 181 | Verifiziert |
| 20 | Sec 8.2 | HealthProblemChip.vue Zeilen | -- | 187 | Verifiziert |
| 21 | Sec 8.2 | PreviewEventCard.vue Zeilen | -- | 155 | Verifiziert |
| 22 | Sec 8.2 | RecordDetailModal.vue Zeilen | -- | 170 | Verifiziert |
| 23 | Sec 8.2 | Pagination.vue | FEHLTE | 185, hinzugefuegt | Existiert in database/, war nicht im Mapping |
| 24 | Sec 8.2 | Modul-Titel | "20+" | "25 bestehende + 1 neue" | Exakte Zaehlung |
| 25 | Sec 8.3 | EmergencyStopButton.vue Zeilen | -- | 176 | Verifiziert |
| 26 | Sec 9 | Router Zeilen | 183 | 182 | Verifiziert |
| 27 | Sec 11 | Hex-Code Anzahl | 29 | 30 | MultiSensorChart.vue fehlte (neue #3) |
| 28 | Sec 13 | Utils-Tests | 15 Files | 13 weitere (14 total) | formatters separat gezaehlt, 14 gesamt |

---

## ANHANG B: VERIFIZIERUNGS-PROTOKOLL v2.0 (Deep-Verify: verify-plan + frontend-debug + mqtt-debug + system-control + meta-analyst)

**Datum:** 2026-02-11 (zweite Verifizierung, Multi-Perspektive)
**Methode:** wc -l auf ALLE referenzierten Dateien, Grep auf Handler-Funktionsnamen, Docker/Grafana-Provisioning geprueft, Backend-Router-Inventar, WS-Registration analysiert

### Korrekturen v2.0 (KRITISCH - falsche Event-Namen)

| # | Sektion | Was | Alt (v1.1) | Neu (v2.0) | Grund |
|---|---------|-----|------------|------------|-------|
| 29 | Sec 2.1 | Section 100-181 Label | "Pending Devices State: pendingDevices, isPendingLoading" | "Pending State + WS Setup + Getters" mit detaillierten Unterbereichen (100-104, 106-133, 135-178) | Sektion enthaelt WS-Filter-Setup und 9 Computed-Getters, nicht nur Pending State |
| 30 | Sec 2.1 | Section 1315-1917 Events | "sensor_data, esp_health, config_response, **error_event**, **sensor_health**" | "esp_health, **actuator_alert**, sensor_data, **actuator_status**, config_response, **zone_assignment**, **subzone_assignment**" | error_event ist bei Z.2134, sensor_health bei Z.2025. Fehlten: actuator_alert (1433), actuator_status (1667), zone_assignment (1802), subzone_assignment (1869) |
| 31 | Sec 2.1 | Section 1918-2082 Events | "device_discovered, device_approved, device_rejected" | "+ **sensor_health** (2025)" | sensor_health Handler steht in Discovery-Sektion, nicht in Core-Handlers |
| 32 | Sec 2.1 | Section 2083-2201 Events | "**actuator_confirmed**, **actuator_failed**" | "**actuator_response** (2091), **notification** (2119), **error_event** (2134), **system_event** (2194)" | Komplett falsche Event-Namen. actuator_confirmed existiert nicht. 4 statt 2 Handler |
| 33 | Sec 2.1 | Section 2202-2240 Events | "**command_sent**, **command_ack**, **command_timeout**" | "**actuator_command** (2210), **actuator_command_failed** (2226)" | Komplett falsche Event-Namen. 2 statt 3 Handler |
| 34 | Sec 2.1 | Section 2241-2303 Label+Events | "Config Publish Lifecycle: **config_publish_start**, **config_ack**, **config_timeout**" | "Config Publish + Rediscovery: **config_published** (2249), **config_failed** (2265), **device_rediscovered** (2287)" | Komplett falsche Event-Namen. device_rediscovered statt config_timeout |
| 35 | Sec 2.1 | Section 2304-2362 Events | "sequence_start, sequence_step, sequence_complete" | "sequence_**started**, sequence_step, sequence_**completed**, + **sequence_error** (2346), **sequence_cancelled** (2356)" | Namenskorrektur (started/completed) + 2 fehlende Handler |
| 36 | Sec 2.1 | SOLL esp.store.ts Groesse | ~800 Z. | ~900 Z. | Mehr Handler als angenommen (notification, error_event, system_event verbleiben) |
| 37 | Sec 2.1 | SOLL actuator.store.ts Groesse | ~500 Z. | ~550 Z. | 5 Sequence-Handler statt 3 + actuator_alert + actuator_status |
| 38 | Sec 2.1 | SOLL zone.store.ts Groesse | ~300 Z. | ~250 Z. | zone_assignment + subzone_assignment (weniger als geschaetzt) |
| 39 | Sec 2.1 | WS-Registration | "initWebSocket, cleanupWebSocket, return" | "initWebSocket (25 Handler registriert), onConnect auto-refresh" | Exakte Handler-Anzahl dokumentiert |
| 40 | Sec 2.1 | WS-Filter vs Handler | -- | `logic_execution` hat keinen Handler | 26 Filter-Types, 25 Handler. Luecke fuer Rules-Modul |
| 41 | Sec 12 | Backend-Proxy Endpoints | "Zu pruefen" | "EXISTIERT NICHT" | Kein monitoring-Router in api/v1/. 17 Router vorhanden, keiner heisst monitoring |
| 42 | Sec 12 | Grafana-Config | "Zu implementieren" | Bestaetigt: nicht in docker/grafana/ | allow_embedding und auth.anonymous nicht konfiguriert |
| 43 | Sec 13 | Neue Store-Tests | "neu" | database (1139 Z.), dragState (981 Z.), logic (948 Z.) = 3068 Z. | Substantielle Tests, nicht nur Stubs. Beim Store-Split mitaufzuteilen |

### Zeilenzahlen-Verifizierung v2.0 (ALLE stimmen)

**Ergebnis:** Saemtliche 67 Components, 11 Views, 5 Stores, 17 API-Module, 8 Composables, 15 Utils, 5 Types, 1 Service, 1 Router, 2 Entry-Points haben exakt die im Dokument dokumentierten Zeilenzahlen. **Keine einzige Abweichung.**

### Hex-Code-Verifizierung v2.0

**Ergebnis:** 30 Dateien mit Hex-Codes bestaetigt (grep -rl). Alle 30 im Dokument gelisteten Dateien sind korrekt.

### WS-Handler Vollstaendige Referenz (25 registrierte Handler)

| # | Event-Name | Handler-Funktion | Zeile | SOLL-Store |
|---|-----------|------------------|-------|------------|
| 1 | esp_health | handleEspHealth | 1330 | esp.store.ts |
| 2 | sensor_data | handleSensorData | 1485 | sensor.store.ts |
| 3 | actuator_status | handleActuatorStatus | 1667 | actuator.store.ts |
| 4 | actuator_alert | handleActuatorAlert | 1433 | actuator.store.ts |
| 5 | config_response | handleConfigResponse | 1702 | esp.store.ts |
| 6 | zone_assignment | handleZoneAssignment | 1802 | zone.store.ts |
| 7 | subzone_assignment | handleSubzoneAssignment | 1869 | zone.store.ts |
| 8 | sensor_health | handleSensorHealth | 2025 | sensor.store.ts |
| 9 | device_discovered | handleDeviceDiscovered | 1926 | esp.store.ts |
| 10 | device_approved | handleDeviceApproved | 1962 | esp.store.ts |
| 11 | device_rejected | handleDeviceRejected | 1987 | esp.store.ts |
| 12 | actuator_response | handleActuatorResponse | 2091 | actuator.store.ts |
| 13 | notification | handleNotification | 2119 | esp.store.ts (global) |
| 14 | error_event | handleErrorEvent | 2134 | esp.store.ts (global) |
| 15 | system_event | handleSystemEvent | 2194 | esp.store.ts (global) |
| 16 | actuator_command | handleActuatorCommand | 2210 | actuator.store.ts |
| 17 | actuator_command_failed | handleActuatorCommandFailed | 2226 | actuator.store.ts |
| 18 | config_published | handleConfigPublished | 2249 | esp.store.ts |
| 19 | config_failed | handleConfigFailed | 2265 | esp.store.ts |
| 20 | device_rediscovered | handleDeviceRediscovered | 2287 | esp.store.ts |
| 21 | sequence_started | handleSequenceStarted | 2311 | actuator.store.ts |
| 22 | sequence_step | handleSequenceStep | 2322 | actuator.store.ts |
| 23 | sequence_completed | handleSequenceCompleted | 2330 | actuator.store.ts |
| 24 | sequence_error | handleSequenceError | 2346 | actuator.store.ts |
| 25 | sequence_cancelled | handleSequenceCancelled | 2356 | actuator.store.ts |
| -- | logic_execution | KEIN HANDLER | -- | rules.store.ts (SOLL) |

**SOLL-Store-Zuordnung nach Split:**
- **esp.store.ts:** #1, #5, #9-11, #13-15, #18-20 = 11 Handler
- **sensor.store.ts:** #2, #8 = 2 Handler
- **actuator.store.ts:** #3, #4, #12, #16-17, #21-25 = 10 Handler
- **zone.store.ts:** #6, #7 = 2 Handler
- **rules.store.ts (NEU):** logic_execution = 1 Handler (zu implementieren)

### Alle verifizierte Zeilenzahlen (Referenz)

**Components (67 total):**

| Datei | Verifiziert | Im Doc |
|-------|-------------|--------|
| ESPOrbitalLayout.vue | 3833 | 3833 OK |
| SystemMonitorView.vue | 2465 | 2465 OK |
| CleanupPanel.vue | 1904 | 1904 OK |
| EventDetailsPanel.vue | 1740 | 1740 OK |
| ESPCard.vue | 1739 | 1739 OK |
| UnifiedEventList.vue | 1616 | 1616 OK |
| ServerLogsTab.vue | 1536 | 1536 OK |
| ESPSettingsPopover.vue | 1498 | 1498 OK |
| DataSourceSelector.vue | 1186 | 1186 OK |
| MqttTrafficTab.vue | 1008 | 1008 OK |
| ZoneGroup.vue | 920 | 920 OK |
| LogManagementPanel.vue | 899 | 899 OK |
| MultiSensorChart.vue | 898 | 898 OK |
| AnalysisDropZone.vue | 848 | 848 OK |
| HealthTab.vue | 780 | 780 OK |
| SensorSatellite.vue | 747 | 747 OK |
| PendingDevicesPanel.vue | 735 | 735 OK |
| GpioPicker.vue | 729 | 729 OK |
| DashboardView.vue | 685 | 685 OK |
| SensorsView.vue | 691 | 691 OK |
| MonitorHeader.vue | 665 | 665 OK |
| ZoneAssignmentPanel.vue | 589 | 589 OK |
| SensorSidebar.vue | 573 | 573 OK |
| HealthSummaryBar.vue | 561 | 561 OK |
| SensorValueCard.vue | 546 | 546 OK |
| ActuatorSidebar.vue | 518 | 518 OK |
| CrossEspConnectionOverlay.vue | 496 | 496 OK |
| ErrorDetailsModal.vue | 489 | 489 OK |
| MonitorTabs.vue | 486 | 486 OK |
| UnassignedDropBar.vue | 481 | 481 OK |
| MonitorFilterPanel.vue | 453 | 453 OK |
| AutoCleanupStatusBanner.vue | 439 | 439 OK |
| ComponentSidebar.vue | 430 | 430 OK |
| CleanupPreview.vue | 410 | 410 OK |
| UnifiedFilterBar.vue | 408 | 408 OK |
| ActionBar.vue | 405 | 405 OK |
| AppSidebar.vue | 352 | 352 OK |
| ActuatorSatellite.vue | 345 | 345 OK |
| ToastContainer.vue | 328 | 328 OK |
| CreateMockEspModal.vue | 318 | 318 OK |
| ConnectionLines.vue | 401 | 401 OK |
| FilterPanel.vue | 257 | 257 OK |
| Modal.vue | 225 | 225 OK |
| StatCard.vue | 216 | 216 OK |
| AppHeader.vue | 210 | 210 OK |
| DatabaseTab.vue | 655 | 655 OK |
| DataTable.vue | 265 | 265 OK |
| HealthProblemChip.vue | 187 | 187 NEU |
| Pagination.vue | 185 | 185 NEU |
| EventsTab.vue | 181 | 181 NEU |
| EmergencyStopButton.vue | 176 | 176 NEU |
| RecordDetailModal.vue | 170 | 170 NEU |
| PreviewEventCard.vue | 155 | 155 NEU |
| TroubleshootingPanel.vue | 146 | 146 NEU |
| ErrorState.vue | 128 | 128 OK |
| SchemaInfoPanel.vue | 126 | 126 OK |
| RssiIndicator.vue | 126 | 126 OK |
| EmptyState.vue | 122 | 122 OK |
| Select.vue | 121 | 121 OK |
| Input.vue | 120 | 120 OK |
| Button.vue | 117 | 117 OK |
| Badge.vue | 114 | 114 OK |
| Toggle.vue | 107 | 107 OK |
| Card.vue | 101 | 101 OK |
| TableSelector.vue | 88 | 88 OK |
| StatusPill.vue | 82 | 82 OK |
| LoadingState.vue | 80 | 80 OK |
| MainLayout.vue | 61 | 61 OK |
| Spinner.vue | 49 | 49 OK |

**Stores:** esp.ts 2598, dragState.ts 447, logic.ts 347, database.ts 316, auth.ts 179
**Views:** SystemMonitor 2465, Sensors 691, Dashboard 685, UserManagement 565, Maintenance 528, LoadTest 388, Login 361, SystemConfig 285, Setup 214, Settings 104, Logic 48
**Router:** index.ts 182
**Entry:** main.ts 53, App.vue 42, style.css 805
**Services:** websocket.ts 644
**API:** esp.ts 696, audit.ts 579, debug.ts 467, sensors.ts 353, logs.ts 185, subzones.ts 154, users.ts 149, actuators.ts 148, database.ts 146, logic.ts 141, loadtest.ts 113, index.ts 97, errors.ts 92, zones.ts 84, config.ts 77, health.ts 54, auth.ts 65

**Tests (v2.0 ergaenzt):** database.test.ts 1139, dragState.test.ts 981, logic.test.ts 948, esp.test.ts ~300, auth.test.ts ~200, useWebSocket.test.ts ~300, useToast.test.ts ~150, formatters.test.ts ~400 + 13 weitere Utils-Tests
**WS-Handler:** 25 registriert, 26 im Filter (logic_execution ohne Handler). Dispatcher-Zeilen: 2439-2475
**Backend-Router (17 exkl. __init__):** actuators, ai, audit, auth, debug, errors, esp, health, kaiser, library, logic, sensor_type_defaults, sensors, sequences, subzone, users, zone
