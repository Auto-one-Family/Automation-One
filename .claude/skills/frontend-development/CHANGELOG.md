## Versions-Historie

**Version:** 9.78
**Letzte Aktualisierung:** 2026-03-11

### Aenderungen in v9.78 (T18-F3 — Hysterese in graphToRuleData erhalten)

- RuleFlowEditor.vue: `graphToRuleData()` — Bei Sensor-Node mit `isHysteresis === true` oder `operator === 'hysteresis'` wird jetzt `type: 'hysteresis'` (HysteresisCondition) serialisiert statt SensorCondition; Kühlung: activateAbove→activate_above, deactivateBelow→deactivate_below; Heizung: activateBelow→activate_below, deactivateAbove→deactivate_above; esp_id, gpio, sensor_type durchgereicht
- RuleFlowEditor.vue: Sensor-Node Template — Hysterese-Darstellung: "Ein >28 · Aus <24" (Kühlung) oder "Ein <18 · Aus >22" (Heizung); Fallback "Hysterese" wenn keine Schwellen gesetzt
- RuleConfigPanel.vue: Operator-Option "Hysterese (Ein/Aus-Schwellen)" hinzugefuegt; bei operator==='hysteresis' oder isHysteresis: Felder fuer Kühlung (Ein wenn >, Aus wenn <) und Heizung (Ein wenn <, Aus wenn >); Operator-Wechsel setzt isHysteresis automatisch
- types/logic.ts: `formatConditionShort()` — Heizungsmodus unterstuetzt: "Ein <18, Aus >22" (activate_below/deactivate_above)
- Section 4 Logic Types: HysteresisCondition um beide Modi (Kühlung/Heizung) erweitert

### Aenderungen in v9.77 (8.3b — Sensor-Auswahl Duplikate, Multi-Sensor Label, annotationPlugin)

- WidgetConfigPanel.vue: `availableSensors` Computed mit `Set<string>`-Deduplizierung (Key: `espId:gpio:sensorType`) — verhindert doppelte Eintraege im Sensor-Dropdown wenn espStore denselben Sensor mehrfach im sensors-Array hat (F-04)
- MultiSensorWidget.vue: `availableSensors` Computed mit gleichem `Set<string>`-Dedup-Pattern — combined `seen.has(id) || selectedSensorIds.value.includes(id)` Check in einer `continue`-Bedingung (F-04)
- MultiSensorWidget.vue: Dropdown-Label von `(${deviceId} GPIO ${s.gpio})` auf `(${deviceId} — ${s.sensor_type})` — SHT31 temp und humidity sind jetzt unterscheidbar, konsistent mit den 4 anderen Widget-Dropdowns (F-05)
- MultiSensorWidget.vue: Props-Kommentar auf `"espId:gpio:sensorType"` aktualisiert (kosmetisch)
- MultiSensorChart.vue: `import annotationPlugin from 'chartjs-plugin-annotation'` + Registrierung in `ChartJS.register()` — verhindert Laufzeitfehler wenn showThresholds in Multi-Sensor-Widgets aktiviert wird (F-07)

### Aenderungen in v9.76 (8.3a — Dashboard-Persistenz CRITICAL FIX: PUT 404 Recovery, DELETE Idempotenz, Orphan-Sync)

- dashboard.store.ts: `syncLayoutToServer()` — PUT 404 Recovery: bei HTTP 404 wird stale `serverId` geleert und Dashboard automatisch per POST neu auf dem Server erstellt; behebt endlose 404-Schleife nach DB-Reset (F-01)
- dashboard.store.ts: `buildSyncPayload()` als eigene Funktion extrahiert (DRY) — baut Server-Payload aus lokalem Layout, `target` Cast zu `Record<string, unknown>` fuer API-Type-Kompatibilitaet
- dashboard.store.ts: `isHttpStatus(error, status)` Helper — prueft Axios-Error auf spezifischen HTTP-Status-Code (wiederverwendbar)
- dashboard.store.ts: `fetchLayouts()` — Bedingung von `response.data.length > 0` auf `response.success` geaendert; Merge, Migration und Orphan-Sync laufen jetzt auch bei leerer Server-Response (0 Dashboards); behebt Bug wo stale serverIds bei leerer DB nie korrigiert wurden (F-01b)
- dashboard.store.ts: `deleteLayoutFromServer()` — HTTP 404 wird als `logger.debug` behandelt (idempotent: "bereits geloescht oder nie synchronisiert") statt `logger.warn`; verhindert 404-Spam bei Duplikat-Bereinigung (F-02)
- F-10 (Error-Banner) implizit geloest: PUT 404 wird intern recovered, `lastSyncError` wird nur noch bei echten nicht-recoverbaren Fehlern gesetzt (Netzwerk, 500er); rotes Banner erscheint nicht mehr nach Tab-Wechsel
- F-03 (Template-Persistenz) bestaetigt: `createLayoutFromTemplate()` ruft bereits `persistLayouts()` + `syncLayoutToServer()` auf (Zeilen 583-584); kein Code-Fix noetig, Problem war nachgelagerter Sync-Fehler durch F-01
- Section 5: dashboard Store-Tabelle ungeaendert (bestehende Eintraege decken alle Actions ab)

### Aenderungen in v9.75 (8.0 — Chart-Interaktivitaet & Analyse-Features: Zoom/Pan, Dual Y-Axis, Gap-Handling, Stats-Overlay)

- package.json: `chartjs-plugin-zoom ^2.2.0` als neue Dependency — Wheel-Zoom, Pinch-Zoom, Drag-Pan fuer Chart.js
- HistoricalChart.vue: Zoom/Pan via chartjs-plugin-zoom — `mode: 'x'` (nur X-Achse), Wheel-Zoom + Pinch-Zoom + Drag-Pan, `isZoomed` State mit Reset-Button (RotateCcw Icon), `resetZoom()` mit `as any` Cast (Plugin-Type-Augmentation Gap)
- HistoricalChart.vue: Gap-Handling — `calculateMedianInterval()` berechnet Median-Zeitabstand, `insertGapMarkers()` fuegt `null`-Werte ein bei Luecken >3x Median, `spanGaps: false` auf Dataset, Live-Append prueft ebenfalls auf Gaps; DataPoint Interface `value: number | null`
- HistoricalChart.vue: Stats-Overlay — paralleler Fetch via `Promise.all([queryData, getStats.catch(() => null)])`, Stats-Bar unter Chart (Min/Avg/Max/σ/Count), Avg-Annotation-Line (dashed, subtle rgba, Label am Endpunkt)
- MultiSensorChart.vue: Zoom/Pan — gleiches Pattern wie HistoricalChart (zoomPlugin registriert, Reset-Button im Info-Badge-Bereich)
- MultiSensorChart.vue: Dual Y-Axis — `unitGroups` Computed mappt Units zu Sensor-IDs, `needsDualAxis` Computed (>=2 verschiedene Einheiten), `computeRangeForUnit()` berechnet Y-Range pro Unit mit 15% Padding, Datasets bekommen `yAxisID` ('y' links, 'y1' rechts), rechte Achse mit `grid: { drawOnChartArea: false }`, Achsentitel zeigen Unit, "2Y" Badge im Info-Bereich
- LiveLineChart.vue: Keine Aenderung — zu kleiner Buffer fuer sinnvolles Zoom/Pan
- Section 1: Tech-Stack um chartjs-plugin-zoom erweitert

### Aenderungen in v9.75 (8.1-Bugs — Editor-Widget Datenqualitaet: Historical Y-Achse, Thresholds, X-Achse, Templates, Duplikate)

- HistoricalChart.vue: Y-Achsen-Daten von `d.raw_value` auf `d.processed_value ?? d.raw_value` korrigiert — behebt absurde Werte (30000 %RH statt 43.7) bei SHT31 und anderen Sensoren mit Rohwert-Verarbeitung (Bug 1)
- HistoricalChart.vue: `sensor_type: props.sensorType` an `sensorsApi.queryData()` uebergeben — verhindert gemischte Multi-Value-Daten (temp + humidity) auf einer Y-Achse (Bug 1)
- HistoricalChart.vue: Live-Append-Watch filtert jetzt nach `sensor_type` — verhindert Cross-Type-Updates (sht31_temp Werte in humidity Chart) bei Multi-Value-Sensoren (Bug 1, zusaetzliches Finding)
- HistoricalChart.vue: `time.displayFormats` (HH:mm:ss, HH:mm, dd.MM) + `autoSkip: true` + `maxRotation: 0` auf X-Achse — lesbare Zeitstempel statt zusammengequetschter Labels (Bug 3)
- LiveLineChart.vue: `autoSkip: true` + `maxRotation: 0` in ticks Config hinzugefuegt — konsistent mit HistoricalChart X-Achsen-Verhalten (Bug 3)
- WidgetConfigPanel.vue: Threshold-Auto-Population aus `SENSOR_TYPE_CONFIG.min/max` komplett entfernt — Sensor-Hardware-Range (-40..125°C) ist kein sinnvoller Schwellwert; Thresholds muessen explizit vom User konfiguriert werden; yMin/yMax Auto-Population bleibt erhalten (Bug 2)
- dashboard.store.ts: `generateZoneDashboard()` setzt `showThresholds: false` fuer auto-generierte line-chart und gauge Widgets — keine unsinnigen Threshold-Lines bei neuen Zone-Dashboards (Bug 2)
- dashboard.store.ts: `createLayoutFromTemplate()` auto-populiert `sensorId` aus erstem verfuegbaren Sensor (`espStore.devices`) — Templates erzeugen jetzt sichtbare Widgets statt leere Dashboards; 3-Part sensorId-Format (`espId:gpio:sensorType`) (Bug 4)
- dashboard.store.ts: Dedup-Migration in `fetchLayouts()` — entfernt aeltere Duplikate nach Dashboard-Name (case-insensitive), behaelt jeweils neuestes; loescht Server-Kopien via `deleteLayoutFromServer()` (Bug 5)

### Aenderungen in v9.74 (7.1 — Editor-UX: Widget-Loeschen, Deep-Link, Empty-State, Discoverability)

- useDashboardWidgets.ts: `UseDashboardWidgetsOptions` um `onRemoveClick?: (widgetId: string) => void` erweitert — X-Button im Widget-Header neben Gear-Icon (nur wenn Callback gesetzt); REMOVE_SVG Inline-Icon (Lucide X); DOM-Erstellung in `createWidgetElement()` analog zum bestehenden Gear-Button-Pattern
- CustomDashboardView.vue: `confirmRemoveWidget(widgetId)` — ConfirmDialog via `uiStore.confirm()` mit variant 'danger', bei Bestaetigung `grid.removeWidget(el)` (GridStack `removed`-Event triggert autoSave); X-Button nur im Edit-Mode sichtbar, roter Hover-State (`--color-status-alarm`)
- CustomDashboardView.vue: Deep-Link-Fix (F-02) — `activateDeepLink(id)` setzt immer `layout.id` (lokale ID), NICHT serverId aus URL; Zwei-Phasen-Aktivierung: sofort aus localStorage, Retry nach `fetchLayouts().then()`; ungueltige IDs zeigen `toast.warning()` + Fallback auf erstes Dashboard (F-10)
- CustomDashboardView.vue: `handleCreateLayout()` setzt `isEditing = true` + `showCatalog = true` + `grid.enableMove/enableResize(true)` — neue Dashboards oeffnen direkt im Edit-Mode mit Widget-Katalog (F-06); `handleCreateFromTemplate()` analog bei leeren Templates
- CustomDashboardView.vue: Empty-State im View-Mode (F-04) — `v-if="activeLayout.widgets.length === 0 && !isEditing"` zeigt LayoutGrid-Icon + "Noch keine Widgets" + CTA-Button "Bearbeiten" (toggleEditMode)
- CustomDashboardView.vue: Auto-Badge im Layout-Selector (F-08) — `v-if="layout.autoGenerated"` zeigt "Auto"-Badge (font-size text-xs, bg surface-secondary) neben Dashboard-Name im Dropdown
- CSS: `.dashboard-widget__remove-btn` (gleiches Sizing wie config-btn, roter Hover), `.dashboard-builder__empty-state` (flex column centered, min-height 300px), `.dashboard-selector__auto-badge` (kompaktes Badge)
- Section 3: Komponentenhierarchie CustomDashboardView — Widget-Header um X-Remove-Button, Toolbar um Auto-Badge und Edit-Mode-Default, Empty-State eingefuegt

### Aenderungen in v9.74 (8.2 — UX-Polish & Sync-Transparenz: Template Edit-Mode, Sync-Error-Banner, Migration-Sync)

- CustomDashboardView.vue: `handleCreateFromTemplate()` entfernt `widgets.length === 0` Bedingung — ALLE neuen Dashboards (leer UND aus Template) oeffnen im Edit-Mode mit Widget-Katalog (F-V2-02); Template-Widgets haben `sensorId: undefined` und muessen konfiguriert werden
- CustomDashboardView.vue: Toast-Watcher auf `lastSyncError` ersetzt durch persistentes Sync-Error-Banner — `v-if="dashStore.lastSyncError"`, AlertTriangle-Icon + Fehlermeldung + "Erneut versuchen"-Button; Banner verschwindet automatisch bei erfolgreichem Sync (`lastSyncError = null`)
- CustomDashboardView.vue: `retrySyncCurrentLayout()` ruft `dashStore.retrySync(activeLayoutId)` — manueller Retry bei Server-Sync-Fehler
- CustomDashboardView.vue: CSS `.dashboard-builder__sync-error` (flex, alarm-border, rgba-background), `.dashboard-builder__sync-retry` (outline-button, alarm-color, hover-background)
- dashboard.store.ts: `retrySync(layoutId)` NEU — oeffentliche Action die `lastSyncError` zuruecksetzt und `syncLayoutToServer()` erneut aufruft; `syncLayoutToServer` bleibt intern (nicht exportiert)
- dashboard.store.ts: `fetchLayouts()` Migration-Block synced jetzt migrierte Dashboards zum Server — nach `persistLayouts()` werden alle Dashboards mit `scope === 'zone' && autoGenerated && target && serverId` via `syncLayoutToServer()` gesynced (PUT-Update); Dashboards ohne `serverId` werden weiterhin durch Orphan-Catch-Up erfasst
- Section 5: dashboard Store-Tabelle um `lastSyncError` (State) und `retrySync` (Action) erweitert

### Aenderungen in v9.74 (8.1 — Widget-Konfiguration & sensorId-Konsistenz: Gauge-Config, sensorId 3-Part, Threshold-Zonen)

- GaugeWidget.vue: Props um `yMin`, `yMax`, `warnLow`, `warnHigh`, `alarmLow`, `alarmHigh`, `showThresholds` erweitert — Gauge zeigt jetzt konfigurierte Skala statt immer 0-100 (F-V2-03)
- GaugeWidget.vue: `localSensorId` ref statt direktem `props.sensorId` — ueberlebt render() one-shot Props (Bug 1b fix); `watch` synct bei Props-Aenderung
- GaugeWidget.vue: `sensorTypeDefaults` Computed aus `SENSOR_TYPE_CONFIG` — Fallback fuer min/max wenn keine Widget-Config gesetzt
- GaugeWidget.vue: `effectiveMin`/`effectiveMax` Computed: config > SENSOR_TYPE_CONFIG > 0/100 (3-Tier Fallback)
- GaugeWidget.vue: `gaugeThresholds` Computed baut `GaugeThreshold[]` aus Alarm/Warn-Grenzen — 5-Zonen-Modell (alarm-warning-good-warning-alarm); ohne konfigurierte Thresholds: einheitlich gruene Skala; Farben aus `cssTokens` (statusGood, statusWarning, statusAlarm)
- GaugeWidget.vue: GaugeChart bekommt `:min`, `:max`, `:thresholds` Props — keine GaugeChart-Aenderung noetig (Threshold-Logik war bereits vorhanden)
- dashboard.store.ts: `generateZoneDashboard()` — Gauge-Widget sensorId von 2-Part (`espId:gpio`) auf 3-Part (`espId:gpio:sensorType`) korrigiert (F-V2-07); behebt falsche Datenanzeige bei Multi-Value-Sensoren (SHT31 temp vs humidity auf GPIO 0)
- dashboard.store.ts: `generateZoneDashboard()` — SensorCard-Widget sensorId analog von 2-Part auf 3-Part korrigiert; ActuatorCard bleibt bei 2-Part (Aktoren haben keinen sensorType)
- WidgetConfigPanel.vue: `hasYRange` Computed um `'gauge'` erweitert — Y-Achse Min/Max Felder jetzt auch fuer Gauge-Widgets sichtbar
- WidgetConfigPanel.vue: `handleSensorChange()` auto-populate fuer yMin/yMax — bei Sensor-Wechsel werden SENSOR_TYPE_CONFIG-Defaults geladen (nur wenn yMin/yMax noch nicht gesetzt)
- 8.1-C (Zeitraum-Chips fuer line-chart): Bewusst NICHT umgesetzt — LineChartWidget nutzt buffer-basiertes Live-Streaming (MAX_POINTS=60), timeRange-Config hat keinen Effekt; Chips waeren non-funktionale UI-Elemente
- Section 3: Komponentenhierarchie CustomDashboardView — WidgetConfigPanel Y-Achse um Gauge, Threshold-Sichtbarkeit um gauge erweitert

### Aenderungen in v9.73 (7.2 — Monitor-Integration: Zone-Dashboards im Monitor L2 sichtbar)

- dashboard.store.ts: `generateZoneDashboard()` setzt beim Neuanlage-Pfad automatisch `target: { view: 'monitor', placement: 'inline' }` — Zone-Dashboards erscheinen sofort als InlineDashboardPanel in Monitor L2; Update-Pfad (bestehendes Dashboard) ueberschreibt Target NICHT (Nutzer-Anpassungen bleiben erhalten)
- dashboard.store.ts: `fetchLayouts()` Migration nach Server-Merge — bestehende auto-generierte Zone-Dashboards (`scope === 'zone' && autoGenerated && !target`) erhalten einmalig `target: { view: 'monitor', placement: 'inline' }`; nur `autoGenerated: true` (manuell erstellte Zone-Dashboards nicht betroffen); `persistLayouts()` + Logger nach Migration
- MonitorView.vue L2: Keine Template-Aenderung noetig — `inlineMonitorPanelsL2` (Zeile 1523) nutzt bereits `dashStore.inlineMonitorPanelsForZone(zoneId)`, das Zone-Dashboards MIT Target automatisch erfasst
- dashboard.store.ts: `fetchLayouts()` proaktiver Orphan-Sync — nach Server-Merge werden alle lokalen Dashboards ohne `serverId` identifiziert und via `syncLayoutToServer()` zum Server gepusht; einmaliger Catch-Up beim App-Start, danach haben alle Dashboards eine serverId; verhindert Datenverlust bei Browser-Cache-Clear
- Vollstaendiger Server-Sync-Status: Alle 7 Erstellungspfade (createLayout, createLayoutFromTemplate, generateZoneDashboard Neuanlage+Update, claimAutoLayout, importLayout, autoSave) rufen `syncLayoutToServer()` auf — kein Pfad ohne Server-Persistenz

### Aenderungen in v9.72 (6.5 — Monitor L1 Kompakt: Zone-Uebersicht aufraumen)

- MonitorView.vue L1: `hasActiveAutomations` Computed — `ActiveAutomationsSection` nur sichtbar wenn `logicStore.enabledRules.length > 0` oder waehrend `logicStore.isLoading` (kein Flackern); `v-if="hasActiveAutomations"` statt immer gerendert; spart ~120px leeren Block bei Setups ohne Logic Engine
- MonitorView.vue L1: Zone-Tiles gleiche Hoehe — `align-items: stretch` auf `.monitor-zone-grid` (Grid-Items pro Zeile gleich hoch), `margin-top: auto` auf `.monitor-zone-tile__footer` (Footer immer am unteren Rand)
- MonitorView.vue L1: `font-size: 10px` durch `var(--text-xs)` ersetzt (11px via tokens.css) — 2 Stellen: `.monitor-zone-tile__kpi-label`, `.monitor-zone-tile__activity`; Token-konsistent, 4 weitere 10px-Stellen in L2/L3 bewusst out-of-scope
- MonitorView.vue L1: `fetchAllZonesGuarded()` mit 30s Timestamp-Cooldown (`ZONE_FETCH_COOLDOWN_MS`) ersetzt direkten `fetchAllZones()`-Aufruf in onMounted — verhindert redundante API-Calls bei schneller Navigation (hin-zurueck innerhalb 30s)
- Section 3: Komponentenhierarchie MonitorView L1 — Datenquellen um fetchAllZonesGuarded, Zone-Tiles um CSS-Grid equal-height, ActiveAutomationsSection um v-if Guard erweitert

### Aenderungen in v9.71 (6.3 — Monitor Read-Only: Aktor-Toggle im Monitor unterbinden)

- useDashboardWidgets.ts: `UseDashboardWidgetsOptions` um `readOnly?: boolean` (Default: false) erweitert — deaktiviert interaktive Controls (Toggle, Select) in Widget-Rendering-Kette
- useDashboardWidgets.ts: `mountWidgetToElement()` reicht `readOnly` als Prop an `actuator-card` Widgets durch (nur bei readOnly=true UND type='actuator-card')
- ActuatorCardWidget.vue: Neuer optionaler Prop `readOnly?: boolean` — Toggle-Button `v-if="!readOnly"` (komplett ausgeblendet, konsistent mit ActuatorCard `v-if="mode !== 'monitor'"`)
- ActuatorCardWidget.vue: Unkonfigurierter Zustand bei readOnly — stummer Platzhalter "Kein Aktor konfiguriert" (Zap-Icon + Label) statt Select-Dropdown (`v-else-if="!readOnly"` auf Select-Block)
- InlineDashboardPanel.vue: `readOnly: true` in useDashboardWidgets-Optionen — Monitor-Kontext (L1 + L2) hat keinen funktionierenden Aktor-Toggle mehr
- CustomDashboardView.vue + DashboardViewer.vue: Keine Aenderung — Default readOnly=false, Steuerung in Editor/Viewer weiterhin funktional
- Prinzip: Monitor = Read-Only (IoT-Industriestandard: versehentliches Schalten im Monitor-Kontext unterbunden)

### Aenderungen in v9.70 (6.2 — ActuatorCard Paritaet mit SensorCard)

- useZoneGrouping.ts: `ActuatorWithContext` um `last_seen?: string | null` erweitert; `allActuators` computed mappt `esp.last_seen ?? null` durch — Stale-Erkennung in ActuatorCard moeglich
- ActuatorCard.vue: `isEspOffline` computed (`esp_state !== 'OPERATIONAL'`) — opacity 0.5 + WifiOff-Badge "ESP offline" (Paritaet mit SensorCard)
- ActuatorCard.vue: `isStale` computed (ESP-Heartbeat aelter als `ZONE_STALE_THRESHOLD_MS`) — opacity 0.7, border-left 3px solid var(--color-warning); Offline hat Vorrang vor Stale
- ActuatorCard.vue: `actuatorIcon` computed via `getActuatorTypeInfo()` aus `@/utils/labels.ts` — typ-spezifische Icons (ToggleRight, Waves, GitBranch, Fan, Flame, Lightbulb, Cog, Activity) statt immer Power; identische Quelle wie ActuatorSatellite
- ActuatorCard.vue: Subzone-Fallback von '—' auf 'Zone-weit' (konsistent mit SensorCard und 6.1)
- ActuatorCard.vue: CSS `.actuator-card--offline` (opacity 0.5), `.actuator-card--stale` (opacity 0.7, warning border-left), `.actuator-card__badge` + `--offline` Styles
- SensorSatellite.vue: `displayLabel` nutzt `getSensorDisplayName()` bei Multi-Value-Sensoren (isMultiValue + name vorhanden) — "Temp&Hum (Temperatur)" statt 2x "Temp&Hum" im Orbital L2
- Section 3: Komponentenhierarchie MonitorView L2 — ActuatorCard um ESP-Offline, Stale, typ-spezifische Icons, Scope-Badge, Subzone-Fallback erweitert

### Aenderungen in v9.70 (6.1 — Monitor L2 Subzone-First Gruppierung)

- MonitorView.vue L2: Subzone-First Gruppierung — jede Subzone erscheint genau EINMAL mit Sensoren+Aktoren zusammen (statt 2x unter getrennten SENSOREN/AKTOREN-Sektionen)
- MonitorView.vue L2: `zoneDeviceGroup` computed (ZoneDeviceSubzone[]) ersetzt getrennte `zoneSensorGroup` + `zoneActuatorGroup` — unified Datenstruktur pro Subzone mit sensors[] + actuators[]
- MonitorView.vue L2: `filteredSubzones` computed ersetzt getrennte `filteredSensorSubzones` + `filteredActuatorSubzones` — ein Subzone-Filter auf die kombinierte Gruppe
- MonitorView.vue L2: `availableSubzones` aus `zoneDeviceGroup` abgeleitet (statt aus zwei getrennten Quellen dedupliziert)
- MonitorView.vue L2: Template-Umbau — zwei getrennte Section-Bloecke durch einen einzigen `v-for="subzone in filteredSubzones"` ersetzt
- MonitorView.vue L2: Typ-Labels "Sensoren"/"Aktoren" NUR sichtbar wenn BEIDE Typen in der Subzone vorhanden
- MonitorView.vue L2: Dashed Trennlinie (`.monitor-subzone__separator`) NUR zwischen Sensoren und Aktoren wenn beide vorhanden
- MonitorView.vue L2: "Zone-weit" (statt "Keine Subzone") — am Ende sortiert, kein farbiger Left-Border, dashed Top-Border
- MonitorView.vue L2: Einzelne Gruppe ohne Accordion — wenn alle Geraete "Zone-weit" und keine benannten Subzonen: kein Accordion-Wrapper, Geraete direkt sichtbar
- MonitorView.vue L2: Smart-Defaults angepasst — leere Subzonen (0 Sensoren + 0 Aktoren) immer eingeklappt
- MonitorView.vue L2: Dead Code entfernt — `subzoneHasSensors()`, `subzoneHasActuators()` (unnoetig nach Zusammenfuehrung)
- MonitorView.vue L2: 4 neue CSS-Klassen — `monitor-subzone__separator`, `monitor-subzone__type-label`, `monitor-subzone__header--zoneweit`, `monitor-subzone__empty`
- MonitorView.vue L2: `.monitor-subzone--unassigned` CSS geaendert — gelbe dashed left-border entfernt, subtile dashed top-border statt dessen
- Section 3: Komponentenhierarchie MonitorView L2 komplett aktualisiert — Subzone-First Architektur mit zoneDeviceGroup, filteredSubzones, Typ-Labels, Trennlinie, Zone-weit Sonderfall

### Aenderungen in v9.69 (Fix-O — Multi-Value-Sensor Display-Differenzierung)

- sensorDefaults.ts: `getSensorDisplayName(sensor)` NEU — Display-Name mit Multi-Value-Disambiguierung; Fallback-Kette: (1) name + Sub-Type-Suffix bei Multi-Value via `getValueConfigForSensorType()`, (2) name bei Single-Value, (3) SENSOR_TYPE_CONFIG label; Ergebnis: "Temp&Hum (Temperatur)" / "Temp&Hum (Luftfeuchte)" statt 2x "Temp&Hum"
- SensorCard.vue: `displayName` Computed nutzt `getSensorDisplayName()` statt direktem `sensor.name` — Multi-Value-Sensoren zeigen eindeutigen Namen in Monitor- und Config-Mode
- ESPSettingsSheet.vue: Sensor-Name in `devicesBySubzone` Computed nutzt `getSensorDisplayName()` — Subzone-Gruppierung zeigt disambiguierte Namen
- inventory.store.ts: `allComponents` Computed nutzt `getSensorDisplayName()` fuer Sensor-displayName — Komponenten-Tab (/sensors) zeigt eindeutige Namen
- Section 9: `getSensorDisplayName()` zu sensorDefaults.ts Helper Functions hinzugefuegt

### Aenderungen in v9.69 (Fix-S — Code-Hygiene + Design-Token-Konsistenz)

- tokens.css: 8 neue Status-Tint-Tokens unter "STATUS TINT BACKGROUNDS" — `--color-warning-bg`, `--color-warning-bg-hover`, `--color-warning-border`, `--color-warning-glow`, `--color-accent-bg`, `--color-iridescent-glow`, `--color-iridescent-glow-hover`, `--color-mock-bg`
- HardwareView.vue: 7 hardcodierte `rgba()`-Farbwerte durch CSS-Token-Variablen ersetzt (DESIGN-001)
- HardwareView.vue: setTimeout Race Condition bei Settings-Panel Open/Close gefixt — `settingsCloseTimer` mit `clearTimeout` in allen 4 Open-Pfaden (SETTINGS-002)
- HardwareView.vue: BEM-Namensraum-Verletzung gefixt — `zone-plate__chevron/devices/device-wrapper` in Unassigned-Section zu `unassigned-section__*` umbenannt (DESIGN-002)
- SensorCard.vue: 3-stufige Icon-Fallback-Kette — exakter Typ-Match → Base-Type-Suffix (z.B. `bme280_pressure` → Druck-Icon) → `CircleDot` Default-Icon (CARD-002)
- SensorCard.vue: `rgba(168, 85, 247, 0.15)` durch `var(--color-mock-bg)` ersetzt
- Backend: Alembic-Migration `fix_actuator_datetime_tz` erstellt — `actuator_states.last_command_timestamp` und `actuator_history.timestamp` auf `DateTime(timezone=True)` migriert (BUG-001)

### Aenderungen in v9.69 (Fix-R — Touch-Accessibility + Discoverability)

- DeviceMiniCard.vue: Action-Row (Settings, MoreVertical, Monitor) von `opacity: 0` auf `0.4` — sichtbar aber dezent, `opacity: 1` bei hover/focus-within; `@media (hover: none)` Block fuer volle Sichtbarkeit auf Touch-Geraeten
- DeviceMiniCard.vue: Action-Buttons `min-width: 44px; min-height: 44px` — WCAG Touch-Target Minimum
- DeviceMiniCard.vue: Drag-Handle `min-width: 44px` — vergroesserter Touch-Bereich
- DeviceMiniCard.vue: Grip-Handle (::before Pseudo-Element) mit `focus-within` und `@media (hover: none)` Sichtbarkeit
- DeviceMiniCard.vue: Long-Press Feedback via `chosen-class` — `transform: scale(1.02)`, `box-shadow` mit `--color-iridescent-1`, 150ms Transition
- ZonePlate.vue: Pencil-Edit-Button von `opacity: 0` auf `0.4`, `min-width/min-height: 44px` (von 20px)
- ZonePlate.vue: Settings-Button von `opacity: 0` auf `0.4`, `min-width/min-height: 44px` (von 24px), `focus-within` Trigger
- ZonePlate.vue: Monitor-Link von `opacity: 0` auf `0.4`, `min-width/min-height: 44px`, `focus-within` Trigger
- ZonePlate.vue: Overflow-Menu-Button `min-width/min-height: 44px` (von 24px)
- ZonePlate.vue: Subzone-Hover-Actions von `opacity: 0` auf `0.4`, `focus-within` Trigger; Subzone-Action-Buttons `min-width/min-height: 32px` (von 16px)
- ZonePlate.vue: Zone-Name click-to-rename — `cursor: text`, dashed underline on hover, `@click.stop="startRename"`, `title="Klicken zum Umbenennen"`
- ZonePlate.vue: Chosen-Drag-Class mit iridescent border glow und 150ms Transition
- ZonePlate.vue: `@media (hover: none)` Block — Edit-Button, Settings-Button, Monitor-Link, Subzone-Actions immer `opacity: 1`
- HardwareView.vue: Context-Menu-Positionierung beim angeklickten Element via `document.querySelector([data-device-id])` + `getBoundingClientRect()` statt Bildschirmmitte (`window.innerWidth/2`)
- Section 3: Komponentenhierarchie HardwareView — ZonePlate Header um click-to-rename, DeviceMiniCard um Touch-Accessibility erweitert
- Section 11: Neue Subsektion "Touch-Accessibility (Fix-R)" — `@media (hover: none)` Pattern, 44px Touch-Targets, Long-Press Feedback Konvention
- Section 12: VueDraggable Regeln um `chosen-class` und Drag-Handle Touch-Target erweitert
- Section 18: NIEMALS-Regel "Hover-only interaktive Elemente ohne Touch-Fallback"; IMMER-Regeln "44px Touch-Targets" und "`@media (hover: none)` Block"

### Aenderungen in v9.69 (Fix-P — Monitor UI-States)

- SensorCard.vue: `effectiveQualityStatus` computed hinzugefuegt — bei Stale (last_read > 120s) wird Quality auf 'warning' ueberschrieben; `qualityLabel` gibt "Veraltet" zurueck bei stale Daten statt "OK"
- SensorCard.vue: Quality-Dot + Quality-Text nutzen `effectiveQualityStatus` statt direktem `qualityToStatus` — stale Sensoren zeigen konsistent Warning-Farbe in Dot und Label
- SensorCard.vue: CSS `.sensor-card--stale` um `border-left: 3px solid var(--color-warning)` erweitert — visuelle Markierung auf der gesamten linken Kante
- SensorCard.vue: `sensorIcon` auf 3-Tier-Fallback umgebaut — exact match → base-type suffix → `DEFAULT_SENSOR_ICON` (CircleDot)
- SensorCard.vue: `.sensor-card__icon--config` Background auf `var(--color-mock-bg)` geaendert
- MonitorView.vue L1: Empty State CTA — `<router-link to="/hardware">` Button "Zonen in der Hardware-Ansicht erstellen" (sekundaerer Ghost-Button-Stil, CSS `.monitor-view__empty-cta`)
- MonitorView.vue L2: Sensor-Section Empty-Hints — Subzones mit Aktoren zeigen KEINEN Hinweis mehr; komplett leere Subzones (keine Sensoren, keine Aktoren) zeigen "Keine Geraete zugeordnet" (kompakt, ohne Link)
- MonitorView.vue L2: Aktor-Section Empty-Hint analog — nur bei komplett leerer Subzone, nur wenn Sensor-Section nicht sichtbar
- MonitorView.vue: Hilfsfunktionen `subzoneHasActuators(subzoneId)` und `subzoneHasSensors(subzoneId)` — Cross-Section-Lookup ueber filteredSensorSubzones/filteredActuatorSubzones fuer bedingte Empty-Hints
- MonitorView.vue: CSS `.monitor-view__empty-cta` fuer sekundaeren Ghost-Button-Stil
- Section 3: Komponentenhierarchie MonitorView L1 um CTA-Link im Empty State; L2 Sensor/Aktor-Section um bedingte Subzone-Empty-Hints; SensorCard um effectiveQualityStatus Stale-Override

### Aenderungen in v9.68 (T14-Fix-J — Device-Scope & Subzone Display-Chain)

- types/index.ts: `MockSensor` um `device_scope?: DeviceScope | null` und `assigned_zones?: string[] | null` erweitert — Scope-Felder jetzt direkt auf MockSensor verfuegbar (nicht nur auf SensorConfigResponse)
- types/index.ts: `MockActuator` um `device_scope?: DeviceScope | null` und `assigned_zones?: string[] | null` erweitert — analog zu MockSensor
- api/esp.ts: `mapSensorConfigToMockSensor()` mappt jetzt `subzone_id`, `device_scope`, `assigned_zones` aus SensorConfigResponse — behebt fehlende Daten im ESP-Store fuer Scope-Badges und Subzone-Gruppierung
- api/esp.ts: `mapActuatorConfigToMockActuator()` mappt jetzt `device_scope`, `assigned_zones` aus ActuatorConfigResponse (subzone_id war bereits vorhanden)
- SensorColumn.vue: `SensorItem` Interface um `device_scope` und `assigned_zones` erweitert; Props `:device-scope` und `:assigned-zones` an SensorSatellite durchgereicht (behebt fehlende "MZ"/"Mob" Badges)
- ActuatorColumn.vue: `ActuatorItem` Interface um `device_scope` und `assigned_zones` erweitert; Props `:device-scope` und `:assigned-zones` an ActuatorSatellite durchgereicht
- ESPSettingsSheet.vue: `devicesBySubzone` Computed umgebaut — Subzone-Name-Aufloesung ueber `device.subzones[]` (SubzoneSummary-Array) statt nicht-existierendem `sensor.subzone_name`; behebt "alle Geraete unter Keine Subzone" Bug
- Backend debug.py: `MockSensorResponse` und `MockActuatorResponse` um `device_scope` und `assigned_zones` Felder erweitert
- Backend debug.py: Response-Builder mappt `device_scope` und `assigned_zones` aus simulation_config
- Backend esp_repo.py: `rebuild_simulation_config()` persistiert `device_scope` und `assigned_zones` aus sensor_configs/actuator_configs
- Section 3: Komponentenhierarchie HardwareView — ESPSettingsSheet Beschreibung um SubzoneSummary-Resolver ergaenzt
- Section 4: MockSensor und MockActuator Beschreibung um device_scope, assigned_zones erweitert

### Aenderungen in v9.67 (T13-R3 WP5 — Filter in Monitor und Components Tab)

- MonitorView.vue L1: Zone-Filter-Dropdown (native `<select>`) ueber Zone-Tile-Grid — `selectedZoneFilter` ref, `filteredZoneKPIs` computed filtert zoneKPIs nach selectedZoneFilter; `isArchivedZoneSelected` computed; `isZoneFilterActive` computed fuer Badge; zoneStore.activeZones als Optionen + `<optgroup label="Archiv">` fuer archivedZones; "Gefiltert" Badge (ListFilter-Icon, bg-blue-500/20) bei aktivem Filter; Archived-Banner (warning) "Archivierte Zone — nur historische Daten" bei archivierter Zone; `zoneStore.fetchZoneEntities()` in onMounted
- MonitorView.vue L2: Subzone-Filter-Dropdown (native `<select>`) unter Zone-Header — `selectedSubzoneFilter` ref, `filteredSensorSubzones`/`filteredActuatorSubzones` computed; `availableSubzones` computed dedupliziert aus Sensor+Aktor-Subzones; nur sichtbar wenn >1 Subzone; Reset bei Zone-Wechsel (im bestehenden selectedZoneId Watcher)
- inventory.store.ts: `ComponentItem` Interface um `scope: DeviceScope | null` und `activeZone: string | null` erweitert; `ScopeFilter` Type (`'all' | 'zone_local' | 'multi_zone' | 'mobile'`); `SortKey` um `| 'scope' | 'activeZone'`; 2 neue Spalten in `INVENTORY_COLUMNS` (key: 'scope'/'activeZone', defaultVisible: false); `scopeFilter` State; `hasNonLocalScope` Computed; Scope-Filter in `filteredComponents`; Sort-Cases fuer scope/activeZone; `resetFilters()` inkl. scopeFilter
- InventoryTable.vue: `cellValue()` um scope/activeZone Cases erweitert — scope: 'Multi-Zone'/'Mobil'/'Lokal'/'—'; activeZone: item.activeZone ?? '—'
- SensorsView.vue: Scope-Filter-Chips (Lokal/Multi-Zone/Mobil) in erweitertem Filter-Bereich; nur sichtbar wenn `store.hasNonLocalScope`; `activeFilterCount` um scopeFilter erweitert
- Section 3: Komponentenhierarchie MonitorView L1 um Zone-Filter, L2 um Subzone-Filter erweitert; SensorsView um Scope-Filter-Chips erweitert; InventoryTable um Scope/ActiveZone Spalten
- Section 5: inventory Store zur Store-Architektur-Tabelle hinzugefuegt (19 → 20 Shared Stores dokumentiert)

### Aenderungen in v9.66 (T13-R3 WP4 — Multi-Zone Device Scope Konfiguration)

- DeviceScopeSection.vue: NEU in `components/devices/` — Wiederverwendbare AccordionSection fuer Device-Scope-Konfiguration; Props: configId, configType, modelValue (DeviceScope), assignedZones, activeZoneId, availableZones, disabled; 3 Scope-Optionen (Lokal/Multi-Zone/Mobil); Zone-Checkbox-Liste bei multi_zone/mobile; Active-Zone-Dropdown mit sofortigem API-Call (deviceContextApi.setContext); Info-Text "wird sofort gewechselt"
- SensorConfigPanel.vue: AccordionSection "Zone-Zuordnung" (storage-key `${accordionKey}-zone-scope`) mit DeviceScopeSection; State: localScope, localAssignedZones, activeZoneId; Init aus SensorConfigResponse (device_scope, assigned_zones) + deviceContextApi.getContext; Save: device_scope + assigned_zones in Request-Body
- ActuatorConfigPanel.vue: Identisches Pattern wie SensorConfigPanel — AccordionSection "Zone-Zuordnung" mit DeviceScopeSection, Init aus ActuatorConfigResponse, Save in Request-Body
- useZoneGrouping.ts: SensorWithContext + ActuatorWithContext um `device_scope?: 'zone_local' | 'multi_zone' | 'mobile' | null` und `assigned_zones?: string[]` erweitert
- SensorCard.vue: Scope-Badge in Config-Mode (nach Subzone-Badge) und Monitor-Mode (in footer-badges); scopeBadge Computed: Multi-Zone (blau bg-blue-500/20) oder Mobil (orange bg-orange-500/20); kein Badge bei zone_local; scopeTooltip: "Bedient: Zone A, Zone B"
- ActuatorCard.vue: Scope-Badge im badges-Bereich (nach Emergency-Badge); gleiches Pattern wie SensorCard (scopeBadge + scopeTooltip)
- SensorSatellite.vue: Neue Props deviceScope/assignedZones; kompaktes Badge "MZ"/"Mob" im Header neben GPIO-Badge; Scope-Tooltip
- ActuatorSatellite.vue: Neue Props deviceScope/assignedZones; kompaktes Badge "MZ"/"Mob" zwischen Status-Badge und Label; Scope-Tooltip
- Section 2: devices/ 8 → 9 Dateien (DeviceScopeSection.vue hinzugefuegt)

### Aenderungen in v9.65 (T13-R3 WP3 — Subzone-Zaehler und Zone-Switch-Dialog)

- ZonePlate.vue: `distinctSubzones` Computed um `sensorCount` und `actuatorCount` pro Subzone angereichert — Zaehlung basiert auf Frontend-Device-Daten (NICHT API-Counts); Subzone-Chips zeigen Count-Badge "3S 1A"
- ZoneSwitchDialog.vue: NEU in `components/zones/` — Modal-Dialog (BaseModal) fuer Zone-Wechsel-Strategie-Auswahl; RadioGroup mit 3 Strategien: transfer (empfohlen, vorausgewaehlt), reset, copy; Props: isOpen, deviceName, currentZoneName, targetZoneName; Emits: close, confirm(strategy)
- ESPSettingsSheet.vue: ZoneSwitchDialog-Integration — State `showZoneSwitchDialog`, `pendingZoneAssign`, `activeSubzoneStrategy`; `handleZoneBeforeSave()` prueft ob Device eine bestehende Zone hat und oeffnet Dialog; `handleZoneSwitchConfirm()` setzt Strategie; `subzoneStrategy`-Prop an ZoneAssignmentPanel durchgereicht
- ZoneAssignmentPanel.vue: Neuer Prop `subzoneStrategy?: 'transfer' | 'copy' | 'reset'`; neuer Emit `zone-before-save`; `saveZone()` interceptiert Zone-Wechsel ohne gesetzter Strategie; Watcher nimmt Save automatisch auf wenn Strategie gesetzt wird; `subzone_strategy` wird im API-Request-Body mitgeschickt
- Section 2: zones/ 3 → 4 Dateien (ZoneSwitchDialog.vue hinzugefuegt)

### Aenderungen in v9.64 (T13-R3 WP2 — Zone-Status in HardwareView L1)

- HardwareView.vue: Datenquelle von `groupDevicesByZone()` auf `zoneStore.zoneEntities` umgestellt — DB-backed Zone-Entities als primaere Quelle, device-only Zonen (nicht in DB) als Fallback fuer Rueckwaertskompatibilitaet
- HardwareView.vue: `ZoneDisplayEntry` Interface (zoneId, zoneName, devices, zoneEntity?, isArchived) — einheitlicher Typ fuer aktive und archivierte Zonen
- HardwareView.vue: `activeZoneEntries` Computed merged DB-Zonen + device-only Zonen, sortiert offline→online→leer→alpha
- HardwareView.vue: `archivedZoneEntries` Computed filtert archivierte Zonen mit zugeordneten Devices
- HardwareView.vue: Archivierte Zonen als AccordionSection (localStorage-Persistenz), nur sichtbar wenn archivedZoneEntries > 0
- HardwareView.vue: Zone-Erstellung ueber `zoneStore.createZone()` statt reiner Device-Zuweisung — ESP-Auswahl optional ("Kein ESP zuweisen" Default)
- HardwareView.vue: "+Zone" Button nicht mehr disabled bei leerer Device-Liste (FL-01) — Zonen sind eigenstaendige Entitaeten
- HardwareView.vue: ZoneSettingsSheet-Integration mit State-Management (zoneSettingsEntity, isZoneSettingsOpen, openZoneSettings, handleZoneEntityUpdated/Archived)
- ZonePlate.vue: Neue optionale Props `zoneEntity?: ZoneEntity` und `isArchived?: boolean` (default false)
- ZonePlate.vue: Neuer Emit `zone-settings` — Settings-Icon im Header oeffnet ZoneSettingsSheet
- ZonePlate.vue: Archivierter Zustand — "Archiviert" Badge (warning), opacity 0.6, dashed border, DnD deaktiviert (group=undefined, disabled=true), Subzone-CRUD ausgeblendet
- ZoneSettingsSheet.vue: NEU — SlideOver fuer Zone-Entity-Verwaltung (Name, Beschreibung, Status-Badge, Archivieren/Reaktivieren, Danger-Zone Loeschen via ConfirmDialog)
- DeviceMiniCard.vue: Aktor-Count Anzeige neben Sensor-Count — "XS / YA" statt nur "XS" (FL-03)
- zone.store.ts: `deleteZoneEntity` Action hinzugefuegt — DELETE + lokale State-Bereinigung

### Aenderungen in v9.63 (T13-R3 WP1 — ZoneEntity CRUD, DeviceScope, DeviceContext Frontend)

- types/index.ts: Neue Types `ZoneStatus`, `ZoneEntity`, `ZoneEntityCreate`, `ZoneEntityUpdate`, `ZoneEntityListResponse`, `DeviceScope`, `DeviceContextSet`, `DeviceContextResponse` hinzugefuegt
- types/index.ts: `SensorConfigCreate` + `SensorConfigResponse` + `ActuatorConfigCreate` + `ActuatorConfigResponse` um `device_scope?: DeviceScope` und `assigned_zones?: string[]` erweitert
- types/index.ts: `ZoneAssignRequest` um `subzone_strategy?: string` erweitert
- types/index.ts: `MessageType` Union um `device_scope_changed`, `device_context_changed`, `subzone_assignment` erweitert
- api/device-context.ts: NEU — `deviceContextApi` mit `setContext` (PUT), `getContext` (GET), `clearContext` (DELETE) — Endpoint `/device-context/{configType}/{configId}`
- api/zones.ts: 7 neue Methoden im bestehenden `zonesApi` — `createZoneEntity`, `listZoneEntities`, `getZoneEntity`, `updateZoneEntity`, `archiveZoneEntity`, `reactivateZoneEntity`, `deleteZoneEntity` — Endpoint `/zones` (CRUD)
- shared/stores/zone.store.ts: State `zoneEntities[]` + `isLoadingZones` hinzugefuegt; Getters `activeZones` + `archivedZones`; 5 Actions (fetchZoneEntities, createZone, updateZone, archiveZone, reactivateZone); 2 neue WS-Handler (`handleDeviceScopeChanged`, `handleDeviceContextChanged`)
- stores/esp.ts: WS-Filter um `device_scope_changed` und `device_context_changed` erweitert; 2 Handler-Delegationen an zoneStore; 2 neue `ws.on()` Registrierungen

### Aenderungen in v9.62 (T10-FixB — DELETE-Pipeline config_id statt GPIO)

- SensorConfigPanel.vue: Mock-Delete-Pfad von `espStore.removeSensor(espId, gpio)` auf `sensorsApi.delete(espId, configId)` umgestellt — Mock UND Real nutzen jetzt einheitlich `DELETE /sensors/{esp_id}/{config_id}` (UUID). Behebt Mass-Delete Bug (6 I2C-Sensoren auf GPIO 0 alle geloescht statt 1)
- SensorConfigPanel.vue: `isMock` Check in confirmAndDelete() entfernt — kein separater Code-Pfad mehr noetig
- sensors.ts (API): `getByConfigId(configId)` NEU — `GET /sensors/config/{config_id}` fuer eindeutigen Sensor-Lookup per UUID
- Backend debug.py: Guard im `remove_sensor()` Endpoint — bei >1 Sensor auf GPIO ohne sensor_type gibt 409 Conflict statt Mass-Delete
- test_mock_esp_multi_value.py: 5 neue Tests `TestDeleteGuardMultipleSensorsOnGpio` — Guard-Logik fuer 0/1/2/6 Sensoren mit/ohne sensor_type

### Aenderungen in v9.61 (T10-FixD — MiniCard Overflow-Zaehlung + LiveDataPreview Humidity-Wert)

- DeviceMiniCard.vue: `sensorCount` computed (Zeile 154-157) von `sensors.length` auf `groupSensorsByBaseType()` umgestellt — Status-Zeile ("XS") und Overflow ("+X weitere") basieren jetzt auf derselben Zaehlbasis (gruppierte Values statt Roh-Array-Laenge)
- LiveDataPreview.vue: Neuer optionaler Prop `sensorType?: string` — filtert WebSocket sensor_data nach sensor_type bei Multi-Value-Sensoren (z.B. SHT31 temp vs humidity auf demselben GPIO)
- LiveDataPreview.vue: `handleMessage()` erweitert um case-insensitive `sensor_type` Vergleich — verhindert Cross-Update wenn sht31_temp nach sht31_humidity eintrifft
- SensorConfigPanel.vue: `:sensor-type="sensorType"` an LiveDataPreview durchgereicht (Zeile 798) — sensorType ist bereits als Prop verfuegbar

### Aenderungen in v9.60 (T09-FixA — Multi-Value Sensor Identifikation)

- types/index.ts: `config_id?: string` zu MockSensor Interface hinzugefuegt — UUID aus DB als primaerer Identifier fuer Multi-Value-Sensoren (statt GPIO)
- api/esp.ts: `mapSensorConfigToMockSensor()` mappt `config.id` auf `config_id` — DB-Devices bekommen UUID durchgereicht
- SensorColumn.vue: `config_id?: string` zu SensorItem Interface hinzugefuegt; `:key` von `sensor-${sensor.gpio}` auf `sensor.config_id || sensor-${sensor.gpio}-${sensor.sensor_type}` — eindeutiger Virtual-DOM-Key fuer Multi-Value-Sensoren auf GPIO 0
- SensorColumn.vue: Emit von `'sensor-click': [gpio: number]` auf `'sensor-click': [payload: { configId?: string; gpio: number; sensorType: string }]` — uebertraegt config_id + sensorType fuer eindeutige Identifikation
- SensorColumn.vue: `sortedSensors` Computed — deterministische Sortierung nach sensor_type alphabetisch, dann i2c_address
- ESPOrbitalLayout.vue: Emit-Typ und Handler auf `{ configId?, gpio, sensorType }` Payload umgestellt — Event-Chain Step 2
- DeviceDetailView.vue: Emit-Typ erweitert um `sensorType` und `configId`; Handler spreaded Payload mit espId — Event-Chain Step 3
- HardwareView.vue: `configSensorData` um `configId?: string` erweitert; `handleSensorClickFromDetail` nutzt `gpio + sensorType` Lookup (Primary) mit GPIO-only Fallback; Template `:config-id` an SensorConfigPanel durchgereicht
- SensorConfigPanel.vue: Neuer optionaler Prop `configId?: string`; Delete-Logik: Mock UND Real → unified `sensorsApi.delete(espId, configId)` (T10-Fix-B: Mock-Pfad von `espStore.removeSensor` GPIO-basiert auf config_id umgestellt), fehlende configId → Error-Toast (kein 500er)
- sensors.ts (API): `delete()` Signatur von `(espId, gpio)` auf `(espId, configId: string)` — nutzt `DELETE /sensors/{esp_id}/{config_id}` (UUID statt GPIO, behebt scalar_one_or_none Crash bei Multi-Value)
- sensor.store.ts: `handleSensorData` priorisiert exakten Match per `gpio + sensor_type` (Post-Fix1 Pattern) vor Legacy-Multi-Value-Merge — behebt Cross-Update bei SHT31 temp/humidity
- useWebSocket.ts: `on()` registriert Handler nur via `websocketService.on()` wenn KEINE Subscription aktiv — behebt Double-Dispatch (Handler 2x pro Message bei gleichzeitiger Subscription + Listener)
- Section 4 Type-System: MockSensor Beschreibung um config_id erweitert

### Aenderungen in v9.59 (T08-Fix2A — Sensor Display-Namen MiniCard + Orbital I2C-Label)

- sensorDefaults.ts: `formatSensorType(sensorType)` exportiert — Underscores → Spaces, Title Case ("sht31_temp" → "Sht31 Temp"), Fallback fuer unbekannte Sensortypen
- sensorDefaults.ts: `groupSensorsByBaseType()` bevorzugt jetzt `sensor.name` (Custom-Name) in allen Code-Pfaden (Multi-Value valueConfig, Multi-Value baseType, Unknown valueType, Single-Value) — Fallback: Registry-Label → formatSensorType()
- DeviceMiniCard.vue: `:title="sensor.label"` Tooltip auf Sensor-Name-Span (Volltext bei Truncation)
- SensorColumn.vue: `interface_type` zu SensorItem Interface + Prop-Durchreichung an SensorSatellite
- SensorSatellite.vue: Neuer Prop `interfaceType?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | null`
- SensorSatellite.vue: `interfaceLabel` Computed erweitert um `interfaceType` Prop-Check + `I2C_SENSOR_PREFIXES` Fallback-Array (sht31, bmp280, bme280, bh1750)
- SensorSatellite.vue: `displayLabel` bevorzugt `props.name` (Custom-Name) vor Device/Sensor-Config-Label
- SensorSatellite.vue: Doppelte `interfaceLabel` Deklaration (Zeile 101 alt + 163 neu) bereinigt
- Server schemas/debug.py: `i2c_address` + `interface_type` Felder zu `MockSensorResponse` hinzugefuegt
- Server api/v1/debug.py: Response-Builder mappt `i2c_address` + `interface_type` aus simulation_config
- Server esp_repo.py: `rebuild_simulation_config()` persistiert `interface_type` aus sensor_configs
- Section 9: sensorDefaults.ts um `formatSensorType()` Helper + groupSensorsByBaseType Name-Preference erweitert

### Aenderungen in v9.58 (T08-Fix2B — AddSensorModal Reaktiver Info-Text)

- AddSensorModal.vue: Statisches `typeSummary` (via `getSensorTypeAwareSummary`) durch reaktives `sensorTypeInfo` computed ersetzt — reflektiert aktuelle I2C-Adresse, Messintervall und Multi-Value-Eintragsanzahl
- AddSensorModal.vue: SHT31 Info-Text zeigt aktuelle I2C-Adresse (`selectedI2CAddress` Hex-Lookup via `i2cAddressOptions`) + "(erstellt 2 Sensor-Eintraege)" + Intervall
- AddSensorModal.vue: BMP280/BME280 Info-Text zeigt aktuelle I2C-Adresse + Multi-Value-Count (2 bzw. 3 Eintraege)
- AddSensorModal.vue: DS18B20 Info-Text zeigt `oneWireScanPin` GPIO, kein Multi-Value-Hinweis
- AddSensorModal.vue: Fallback fuer andere Sensortypen via `getSensorLabel()`
- AddSensorModal.vue: `role="status"` + `aria-live="polite"` auf Info-Banner (Screen-Reader Reaktivitaet bei I2C-Adress-Wechsel)
- AddSensorModal.vue: Import `getSensorTypeAwareSummary` entfernt, `getSensorLabel` + `getDefaultInterval` hinzugefuegt

### Aenderungen in v9.57 (Aufgabe 2 — Orbital I2C-Adresse statt GPIO 0)

- types/index.ts: `MockSensor` um `interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | null` und `i2c_address?: number | null` erweitert — fuer Orbital-Anzeige "I2C 0x44" statt "GPIO 0"
- api/esp.ts: `mapSensorConfigToMockSensor()` mappt jetzt `i2c_address` aus `SensorConfigResponse` — DB-Devices bekommen I2C-Adresse durchgereicht
- SensorColumn.vue: `SensorItem` Interface um `i2c_address` erweitert, Prop `:i2c-address` an SensorSatellite durchgereicht
- SensorSatellite.vue: Neuer optionaler Prop `i2cAddress?: number | null` (Default null)
- SensorSatellite.vue: `interfaceLabel` Computed — sht31/bmp/bme → "I2C 0x{HEX}" (padStart 2), sonstige → "GPIO {n}" (gpio=0 wird unterdrueckt), Hex immer uppercase mit 0x-Praefix
- SensorSatellite.vue: GPIO-Badge zeigt `interfaceLabel` statt nur GPIO-Nummer, immer sichtbar (nicht nur bei Multi-Value)
- SensorSatellite.vue: Title-Tooltip nutzt `interfaceLabel` statt hartcodiertem "GPIO {n}"
- Section 4 Type-System: MockSensor Zeilenbereich und Beschreibung aktualisiert

### Aenderungen in v9.56 (T08-Fix-D/E — Sensor Delete Pipeline + Alert Cleanup)

- types/index.ts: `'sensor_config_deleted'` zu MessageType Union hinzugefuegt — neues WS-Event fuer Sensor-Config-Loeschung
- esp.ts (Store): `handleSensorConfigDeleted` Handler — filtert geloeschten Sensor aus `device.sensors` per gpio+sensor_type Match, Toast-Info bei Erfolg
- esp.ts (Store): WS-Listener `ws.on('sensor_config_deleted', handleSensorConfigDeleted)` in initWebSocket registriert
- Section 4 WebSocket Events: `sensor_config_deleted` Event dokumentiert (config_id, esp_id, gpio, sensor_type; Server→WS Delete-Pipeline)

### Aenderungen in v9.55 (T02-Fix5 — Runtime-Errors, API-Serialisierung, Alert-Metriken, Monitor-Readonly)

- MonitorView.vue: `smartDefaultsApplied` ref-Deklaration vor den Watcher verschoben — behebt ReferenceError beim Laden des Monitor-Tabs (N2)
- MonitorView.vue: Subzone-Inline-Edit komplett entfernt (Rename-Input, Check/X-Buttons, CRUD-Actions Pencil/Trash2, "Subzone hinzufuegen"-Button) — Monitor ist jetzt vollstaendig read-only (B18)
- MonitorView.vue: `useSubzoneCRUD` Import + Instanziierung entfernt, `useUiStore` Import entfernt (nicht mehr benoetigt nach CRUD-Entfernung), `Trash2`/`Check`/`X` Icons aus Import entfernt
- MonitorView.vue: Docstring aktualisiert — "Subzone CRUD" → "read-only, no configuration"
- esp.ts (Store): `isLoading = true` aus `deleteDevice()` entfernt — verhindert weissen Bildschirm-Blitz beim Loeschen des letzten Devices (B17); Delete ist kein fetch-all und braucht keinen Loading-State
- AlertStatusBar.vue: `hasSensors` Computed hinzugefuegt — Bar nur sichtbar wenn Devices UND Sensoren existieren UND mindestens ein Alert-Count > 0 (B15)
- NotificationBadge.vue: `espStore.devices.length > 0` Check in `hasBadge` — Badge unsichtbar bei leerem System (B16)
- Backend logs.py: Router-Prefix `/logs` → `/v1/logs` korrigiert — Frontend-Log-Endpoint erreichbar unter `/api/v1/logs/frontend` statt `/api/logs/frontend` (N3)
- Backend esp.py (API): `deleted_at` und `deleted_by` in ESPDeviceResponse-Konstruktor gemappt — Felder werden bei `include_deleted=true` korrekt serialisiert (N4)

### Aenderungen in v9.54 (T02-Fix6 — Layout-Ueberarbeitung: Orbital-Namen, L1 Zone-Tile, Konsistenz-Polish)

- SensorSatellite.vue: `text-transform: uppercase` entfernt — Sensor-Namen in Normal-Case (wie vom Nutzer eingegeben); `color` von `--color-text-muted` auf `--color-text-secondary` (lesbarer); `letter-spacing` von 0.06em auf 0.02em reduziert
- SensorSatellite.vue: Label bekommt 2-Zeilen-Clamp (`-webkit-line-clamp: 2`, `line-height: 1.2`, `max-height: 2.4em`) statt `white-space: nowrap` — lange Sensor-Namen umbrechen statt abschneiden
- SensorSatellite.vue: `:title="displayLabel"` auf Label-Element — Tooltip mit vollem Namen bei Truncation (Bug N1 aus T02-Verify)
- ActuatorSatellite.vue: `max-width` von 130px auf 180px — konsistent mit Sensor-Satellite Spaltenbreite
- ActuatorSatellite.vue: Label bekommt 2-Zeilen-Clamp + `color: --color-text-secondary` (konsistent mit SensorSatellite)
- ActuatorSatellite.vue: `:title` auf Label-Element (Tooltip, konsistent mit SensorSatellite)
- ESPOrbitalLayout.css: Sensor-/Actuator-Spaltenbreite von 120px auf 180px (Desktop), Multi-Row Grid von `repeat(2, 120px)` auf `repeat(2, 180px)`; Tablet-Breakpoint `max-width` von 120px auf 160px
- ZonePlate.vue: `.zone-plate__devices` von `display: flex; flex-wrap: wrap` auf `display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr))` — bei 1 Device fuellt Card volle Breite, bei 2+ responsives Grid
- ZonePlate.vue: `.zone-plate__agg-values` bekommt `margin-left: var(--space-2)` — mehr Abstand zwischen Zone-Name und Aggregation
- DeviceMiniCard.vue: `max-width` von 240px auf 100% — Grid steuert Breite statt feste Maximalbreite
- DeviceMiniCard.vue: `.device-mini-card__sensor-unit` `color` von `--color-text-muted` auf `--color-text-secondary` — Einheit (°C, %RH) lesbar statt fast unsichtbar
- sensorDefaults.ts: `formatAggregatedValue()` fuegt Thin Space (`\u2009`) vor Einheit ein — "22.5 °C" statt "22.5°C", "18.3 – 22.5 °C" statt "18.3 – 22.5°C"

### Aenderungen in v9.53 (T02-Fix4 — Layout-Polish: Responsive TopBar, SensorCard-Namen, Mock-Dialog, Alert-Metriken)

- CreateMockEspModal.vue: Heartbeat-Intervall Default von 60 auf 15 Sekunden korrigiert — konsistent mit Backend-Default fuer Mock-ESPs; betrifft Initial-State (ref) und resetForm()
- TopBar.vue: Responsive Overflow-Handling — `.header__breadcrumb` bekommt `overflow: hidden`; `.header__crumb--current` bekommt `max-width: 200px` + `text-overflow: ellipsis`
- TopBar.vue: Neuer Breakpoint `@media (max-width: 1399px)` — `.header__type-segment` ausgeblendet (`display: none`), Crumb max-width auf 140px reduziert; bestehender `1023px`-Breakpoint um `max-width: 100px` auf Crumb erweitert
- SensorCard.vue: Monitor-Mode Name bekommt `:title="displayName"` fuer Tooltip bei abgeschnittenem Text (Namen werden uppercase in DB gespeichert, kein text-transform im CSS)
- MonitorView.vue: `.monitor-card-grid` von `minmax(200px, 1fr)` auf `minmax(220px, 1fr)` — breitere Karten fuer laengere Sensor-Namen
- ComponentSidebar.vue: Scroll-Indikator via `::after` Pseudo-Element — `linear-gradient(to bottom, transparent, var(--color-bg-secondary))`, 24px Hoehe, `pointer-events: none`, nur bei nicht-kollabierten Sidebar (`:not(.component-sidebar--collapsed)`)
- AlertStatusBar.vue: `useEspStore` importiert, `hasDevices` Computed (`espStore.devices.length > 0`), `showBar` Computed — Bar nur sichtbar wenn alertStats vorhanden UND Devices existieren UND mindestens ein Count > 0 (active, acknowledged oder resolved_today)
- AlertStatusBar.vue: Template `v-if` erweitert auf `showBar && alertStore.alertStats` — doppelte Guard fuer TypeScript Type-Narrowing + inhaltliche Pruefung

### Aenderungen in v9.52 (T02-Fix3 — L1 Zone-Tile Aggregation + DeviceMiniCard Multi-Sensor + Unassigned-Section)

- sensorDefaults.ts: `formatAggregatedValue()` zeigt jetzt Range statt Durchschnitt — 1 Wert: "22.0°C", 2+ Werte: "18.3 – 22.5°C" (min–max), gleiche Werte: "22.0°C (2)"; Parameter `deviceCount` unbenutzt (jetzt `_deviceCount`)
- sensorDefaults.ts: `ZoneAggregation` um `extraTypeCount: number` erweitert — Anzahl abgeschnittener Kategorien (>3) fuer "+X mehr" Badge
- sensorDefaults.ts: `aggregateZoneSensors()` berechnet `extraTypeCount` vor `splice(3)`, gibt es im Return zurueck
- sensorDefaults.ts: `groupSensorsByBaseType()` — Single-Value-Sensoren nutzen unique Map-Key `${sType}_${gpio}` statt `sType` — behebt Ueberschreibung bei 2x DS18B20 auf einem Device; Label nutzt `sensor.name` fuer spezifische Namen (z.B. "Substrat", "Wasser")
- ZonePlate.vue: Aggregierte Werte mit Pipe-Separator (`' | '`) statt Double-Space; `extraTypeCount` Computed fuer "+X" Badge (`zone-plate__agg-extra`, font-size 9px, color text-muted)
- HardwareView.vue: Unassigned-Section mit `v-if="unassignedDevices.length > 0 || dragStore.isDraggingEspCard"` — ausgeblendet wenn leer, sichtbar als Drop-Target waehrend Drag
- Section 9: sensorDefaults.ts Types aktualisiert (RawSensor, GroupedSensor, ZoneAggregation, AggCategory jetzt 10 Kategorien)

### Aenderungen in v9.51 (Phase 3.1.4 + 3.1.5 + 3.2.4 + 3.2.5 — ActuatorCard Monitor-Kontext + SensorCard Trend-Pfeil)

- ActuatorCard.vue: Neue optionale Props `linkedRules?: LogicRule[]`, `lastExecution?: ExecutionHistoryItem | null` — nur im monitor-mode ausgewertet
- ActuatorCard.vue: PWM-Badge (`actuator-card__pwm-badge`) neben Ein/Aus-Badge wenn `pwm_value > 0` — zeigt "75%" als kompaktes Badge statt separater Zeile
- ActuatorCard.vue: Rules-Section (`actuator-card__rules`) — max 2 Regeln mit Status-Dot (8px, gruen=enabled via `--color-status-success`, rot=error via `--color-status-error`, grau=deaktiviert via `--color-text-muted`) + Rule-Name + Condition-Kurztext via `formatConditionShort(rule)`
- ActuatorCard.vue: "+N weitere" router-link zu `/logic` bei >2 verknuepften Regeln (`actuator-card__rules-more`, Farbe `--color-iridescent-2`)
- ActuatorCard.vue: Letzte Execution (`actuator-card__last-execution`) — `formatRelativeTime(triggered_at)` + `trigger_reason` in Klammern; importiert aus `@/utils/formatters`
- ActuatorCard.vue: config-mode komplett unveraendert (keine Regression)
- SensorCard.vue: Neuer optionaler Prop `trend?: TrendDirection` (importiert aus `@/utils/trendUtils`) — nur im monitor-mode gerendert
- SensorCard.vue: Trend-Pfeil neben Wert+Unit — `TrendingUp`/`Minus`/`TrendingDown` Icons (lucide-vue-next, :size="14"), `v-if="trend"`, `title`-Attribut ("Steigend"/"Stabil"/"Fallend")
- SensorCard.vue: CSS `.sensor-card__trend` — `color: var(--color-text-muted)`, inline-flex, IMMER neutral gefaerbt (kein rot/gruen)
- SensorCard.vue: `TREND_ICONS`/`TREND_TITLES` Record-Maps fuer Icon-Aufloesung und Barrierefreiheit
- MonitorView.vue: `useLogicStore` importiert, `logicStore` instanziiert
- MonitorView.vue onMounted: `logicStore.fetchRules()` + `logicStore.loadExecutionHistory()` aufgerufen (ActuatorCard-Kontext)
- MonitorView.vue L2: `getSensorTrend(espId, gpio, sensorType)` Hilfsfunktion — holt Punkte aus sparklineCache, gibt `undefined` bei <5 Punkten (kein Trend statt 'stable'), berechnet Trend via `calculateTrend()` aus trendUtils
- MonitorView.vue L2 Template: SensorCard bekommt `:trend="getSensorTrend(sensor.esp_id, sensor.gpio, sensor.sensor_type)"`
- MonitorView.vue L2 Template: ActuatorCard bekommt `:linked-rules="logicStore.getRulesForActuator(actuator.esp_id, actuator.gpio)"` und `:last-execution="logicStore.getLastExecutionForActuator(actuator.esp_id, actuator.gpio)"`
- Section 3: Komponentenhierarchie MonitorView L2 — SensorCard um Trend-Pfeil, ActuatorCard um linkedRules, lastExecution, PWM-Badge, "+N weitere" erweitert

### Aenderungen in v9.50 (Phase 3 — ActuatorCard Logik-Grundlage + Sparkline Aussagekraeftig)

- logic.store.ts: `getRulesForActuator(espId, gpio): LogicRule[]` — filtert rules nach Actions mit type 'actuator'/'actuator_command' + esp_id + gpio Match; Sortierung priority (niedrig = hoeher); im Store-Return exportiert
- logic.store.ts: `getLastExecutionForActuator(espId, gpio): ExecutionHistoryItem | null` — nutzt getRulesForActuator intern, sammelt Rule-IDs, filtert executionHistory, sortiert triggered_at DESC, gibt erstes Element oder null
- types/logic.ts: `formatConditionShort(rule): string` — lesbarer Kurztext aller Conditions; sensor/sensor_threshold: Label + Operator + Wert + Einheit ("Temperatur > 28°C"); hysteresis: Kühlung "Ein >28, Aus <24" oder Heizung "Ein <18, Aus >22"; time: "06:00–20:00"; compound: "[Komplex]"; Verbindung logic_operator UND/ODER; importiert getSensorLabel/getSensorUnit aus sensorDefaults
- types/index.ts: Re-Export `formatConditionShort` aus logic.ts
- Section 4 Logic Types: formatConditionShort dokumentiert
- Section 5 Store-Architektur: logic Store um getRulesForActuator, getLastExecutionForActuator erweitert
- trendUtils.ts: **NEU** — `calculateTrend()` (Lineare Regression/Least Squares), `TrendDirection` Type, `TrendResult` Interface, `TREND_THRESHOLDS` (sensor-typ-spezifisch: 13 Eintraege), `DEFAULT_TREND_THRESHOLD` (0.1); gibt `'stable'` bei <5 Datenpunkten zurueck
- MonitorView.vue L2: `ThresholdConfig` Import aus LiveLineChart; `getDefaultThresholds(sensorType)` Hilfsfunktion — alarmLow/warnLow/warnHigh/alarmHigh aus SENSOR_TYPE_CONFIG (10%/20% Range-Raender)
- MonitorView.vue L2: LiveLineChart im #sparkline Slot bekommt `:sensor-type`, `:thresholds`, `:show-thresholds` — Y-Achse mit sinnvollem Bereich, farbige Schwellwert-Zonen sichtbar
- Section 2: utils/ 10 → 11 Module (trendUtils.ts)
- Section 3: Komponentenhierarchie MonitorView L2 — SensorCard Sparkline um sensor-type + Threshold-Zonen erweitert

### Aenderungen in v9.49 (Dashboard Sync-Fehler im UI anzeigen)

- dashboard.store.ts: `syncLayoutToServer()` setzt jetzt `lastSyncError` bei Fehlern (vorher nur `logger.warn()` fire-and-forget) und setzt `lastSyncError = null` bei erfolgreichem Sync (create oder update)
- CustomDashboardView.vue: Neuer Watcher auf `dashStore.lastSyncError` — zeigt `toast.error()` mit Fehlermeldung an wenn Sync fehlschlaegt; nutzt bestehenden useToast-Service (Dedup-Window 2s schuetzt vor Spam)

### Aenderungen in v9.48 (Zone-Frontend Phase 0.3 — Leere Zonen + Subzonen)

- zones.ts: `getAllZones()` Methode — GET /zone/zones, liefert alle Zonen inkl. leere (Device-Zuweisungen + ZoneContext merged)
- types/index.ts: `ZoneListEntry` (zone_id, zone_name, device_count, sensor_count, actuator_count) + `ZoneListResponse` (zones[], total)
- MonitorView.vue L1: `allZones` ref via `zonesApi.getAllZones()` in onMounted; `zoneKPIs` Computed merged Device-KPIs + leere Zonen aus Zone-API
- MonitorView.vue L1: `ZoneHealthStatus` erweitert um `'empty'` — leere Zonen (0 Devices) zeigen Status "Leer" (Minus-Icon, opacity 0.7), NICHT "alarm"
- MonitorView.vue L1: `HEALTH_STATUS_CONFIG.empty` — Label "Leer", CSS `.zone-status--empty` (var(--color-text-muted)), `.monitor-zone-tile--empty`
- MonitorView.vue L2: Leere Subzonen mit Hinweis "Keine Sensoren zugeordnet — Sensoren in der Hardware-Ansicht hinzufuegen" + router-link zu /hardware
- Backend zone.py: `GET /v1/zone/zones` Endpoint — merged Zonen aus Device-Zuweisungen + ZoneContext-Tabelle
- Backend schemas/zone.py: `ZoneListEntry` + `ZoneListResponse` Pydantic Schemas
- Backend monitor_data_service.py: `configured_subzone_keys` im ersten Pass gesammelt, leere Subzonen nicht mehr rausgefiltert

### Aenderungen in v9.47 (Sparkline Initial History Load)

- useSparklineCache.ts: `loadInitialData(sensors: SensorIdentifier[])` — laedt letzte 30 Datenpunkte pro Sensor via sensorsApi.queryData beim ersten Render; Throttling max 5 parallele Requests (Promise.allSettled in Batches); `loadedKeys` Set verhindert doppeltes Laden
- useSparklineCache.ts: `mergeAndDeduplicate()` — merged historische API-Daten mit zwischenzeitlich eingetroffenen WS-Events; chronologische Sortierung, 5s-Dedup, capped bei maxPoints
- useSparklineCache.ts: Neues Interface `SensorIdentifier` (esp_id, gpio, sensor_type?) exportiert; neuer Return-Wert `initialLoadInFlight` ref
- MonitorView.vue L2: Watcher auf `zoneSensorGroup` — extrahiert Sensor-Identifier und ruft `loadSparklineHistory()` auf wenn Zone-Daten verfuegbar werden; feuert automatisch bei Zone-Wechsel
- Kein Server-Change: Nutzt bestehende GET /sensors/data API mit esp_id + gpio + sensor_type + limit Filter

### Aenderungen in v9.46 (Monitor L1 Ready-Gate + L2 AbortController)

- MonitorView.vue L1: Ready-Gate-Pattern — BaseSkeleton bei espStore.isLoading, ErrorState mit Retry (espStore.fetchAll) bei espStore.error, Empty State nur bei wirklich leeren Daten nach erfolgreichem Laden
- MonitorView.vue L1: Zone-Tiles von `<div @click>` zu `<button>` — nativ keyboard-navigierbar (Tab + Enter), :focus-visible Outline (2px var(--color-iridescent-2)), Button-Reset-CSS (font, color, text-align)
- MonitorView.vue L2: AbortController bei fetchZoneMonitorData — bricht vorherigen Request ab bei schnellem Zone-Wechsel, AbortError im catch ignoriert, Loading nur zurueckgesetzt wenn Controller noch aktuell
- zones.ts: getZoneMonitorData akzeptiert optionalen AbortSignal Parameter
- onUnmounted: zoneMonitorAbort.abort() Cleanup
- Section 3: Komponentenhierarchie MonitorView L1 um Ready-Gate und button-Kacheln erweitert, L2 um AbortController ergaenzt

### Aenderungen in v9.45 (ActuatorCard Toggle Mode-Guard)

- ActuatorCard.vue: Toggle-Button mit `v-if="mode !== 'monitor'"` — im monitor-mode ausgeblendet (Sicherheit: kein sendActuatorCommand aus read-only Monitor-Kontext)
- ActuatorCard.vue: PWM-Wert-Anzeige im monitor-mode bei `actuator_type === 'pwm'` — "PWM: X%" als read-only Info
- MonitorView.vue: Einziger Aufrufpfad `@toggle="toggleActuator"` durch Button-Guard gekappt — kein Code-Entfernung noetig
- ActuatorCardWidget.vue (Dashboard): Toggle weiterhin funktional — Dashboard-Editor ist bewusster Steuerungs-Kontext (kein Fix)
- Section 3: Komponentenhierarchie MonitorView L2 — ActuatorCard um read-only Hinweis erweitert

### Aenderungen in v9.44 (Monitor L1 — Computerspieloptik-Optimierung)

- RuleCardCompact.vue: Zone-Badge Fallback "—" wenn zoneNames leer/undefined (5-Sekunden-Regel "Wo?"); Badge immer wenn zoneNames-Prop uebergeben (v-if="zoneNames !== undefined"); Zone-Badge Styling an SensorCard angeglichen (padding 2px 8px, border 1px solid var(--glass-border), max-width 140px); statusAriaLabel + aria-live="polite" fuer Screenreader; :focus-visible Outline (2px var(--color-iridescent-2)); Status-Dot transition (background-color, box-shadow)
- ZoneRulesSection.vue: Empty State um Link "Zum Regeln-Tab" ergaenzt (wie ActiveAutomationsSection); :focus-visible auf __more-link und __empty-link
- ActiveAutomationsSection.vue: Regel-Liste semantisch als ul/li (role="list", list-style: none); :focus-visible auf __link und __empty-link; Grid responsive minmax(min(200px, 100%), 1fr) fuer schmale Viewports (z. B. 320px)

### Aenderungen in v9.43 (Monitor L1 — Aktive Automatisierungen)

- ActiveAutomationsSection.vue: Neue Komponente in components/monitor/ — L1-Sektion "Aktive Automatisierungen (N)"; logicStore.enabledRules, Top 5 Regeln (Fehler zuerst, dann priority/name), RuleCardCompact mit zoneNames, Link "Alle Regeln" → /logic; Empty State bei 0 Regeln
- RuleCardCompact.vue: Optionaler Prop `zoneNames?: string[]` — Zone-Badge fuer L1 (5-Sekunden-Regel: "Wo?"); L2 uebergibt nicht (Zone implizit); Badge-Format: "Zone1, Zone2" oder "Zone1 +2" bei >2 Zonen
- logic.store.ts: `getZonesForRule(rule): string[]` — ermittelt Zone-Namen ueber referenzierte ESPs (extractEspIdsFromRule + espStore.devices.zone_name/zone_id)
- MonitorView.vue L1: ActiveAutomationsSection zwischen Zone-Tiles und Dashboard-Card eingefuegt; Reihenfolge: Zonen-Kacheln → Aktive Automatisierungen → Cross-Zone-Dashboards → Inline-Panels
- monitor-view__empty: margin-bottom var(--space-10) fuer konsistenten Abstand vor ActiveAutomationsSection
- Section 2: monitor/ 1 → 2 Dateien (ActiveAutomationsSection)
- Section 3: Komponentenhierarchie MonitorView L1 um ActiveAutomationsSection erweitert

### Aenderungen in v9.42 (Monitor L2 — Regeln für diese Zone Verbesserungen)

- ZoneRulesSection.vue: Bei >10 Regeln nur erste 5 anzeigen + Zeile "Weitere X Regeln — Im Regeln-Tab anzeigen" mit Link zu /logic; RULES_VISIBLE_THRESHOLD=10, MAX_DISPLAYED_WHEN_OVER=5
- RuleCardCompact.vue: Fehler-Rand bei last_execution_success=false — border-left: 3px solid var(--color-status-alarm) (5-Sekunden-Regel)

### Aenderungen in v9.41 (Monitor L2 — Regeln für diese Zone)

- ZoneRulesSection.vue: Neue Komponente in components/monitor/ — Sektion "Regeln für diese Zone (N)"; nutzt logicStore.getRulesForZone(zoneId); Empty State bei 0 Regeln
- RuleCardCompact.vue: Neue Komponente in components/logic/ — Read-only Regel-Karte (Status-Dot, Name, letzte Ausführung, optional Badge); Klick → router.push(/logic/:ruleId); Glow bei activeExecutions
- MonitorView.vue L2: ZoneRulesSection zwischen Aktoren und Zone-Dashboards eingefuegt; Reihenfolge: Sensoren → Aktoren → Regeln → Zone-Dashboards → Inline-Panels

### Aenderungen in v9.40 (getRulesForZone — Monitor-Integration Grundlage)

- logic.store.ts: `getRulesForZone(zoneId): LogicRule[]` — filtert Regeln nach Zone via extractEspIdsFromRule + espStore.devices.zone_id; Sortierung priority, name
- types/logic.ts: `extractEspIdsFromRule(rule): Set<string>` — sammelt ESP-IDs aus SensorCondition, HysteresisCondition, ActuatorAction (rekursiv in Compound)
- Section 4 Logic Types: extractEspIdsFromRule dokumentiert
- Section 5 Store-Architektur: logic Store um getRulesForZone erweitert, Pfad shared/stores/logic.store.ts korrigiert

### Aenderungen in v9.39 (Phase 2.4 — Logic Subzone-Matching)

- types/logic.ts: SensorCondition um optionales `subzone_id?: string | null` erweitert (Backend-Kompatibilitaet)
- Section 4 Logic Types: SensorCondition subzone_id dokumentiert

### Aenderungen in v9.34 (Alert-Basis 4 — websocket_enabled in NotificationPreferences)

- NotificationPreferences.vue: Toggle „Echtzeit-Updates (WebSocket)“ in Basic Zone (vor E-Mail) — Backend nutzt websocket_enabled: bei false kein WS-Broadcast
- applyPrefs/save: websocket_enabled ref + API-Binding, Default true
- Section 2: notifications/ 3 → 4 Dateien (NotificationPreferences explizit)

### Aenderungen in v9.33 (Alert-Basis 3 — Filter nach source in NotificationDrawer)

- notification-inbox.store.ts: Neuer State `sourceFilter` (SourceFilterValue), Action `setSourceFilter()`, `filteredNotifications` erweitert um Source-Filter (AND mit Severity)
- NotificationDrawer.vue: Source-Filter-Chips (Alle, Sensor, Infrastruktur, Aktor, Regel, System) unter Status-Tabs
- NotificationItem.vue: Source-Badge in Titelzeile (Sensor/Infrastruktur/Aktor/Regel/System), Farbkodierung (blau/orange/lila/indigo/grau)
- labels.ts: NOTIFICATION_SOURCE_LABELS + getNotificationSourceLabel() — Backend-source zu lesbarem Label
- shared/stores/index.ts: Re-Export SourceFilterValue

### Aenderungen in v9.32 (Alert-Basis 2 — Device-Level Alert-Config UI)

- DeviceAlertConfigSection.vue: Neue Komponente in `components/devices/` — Device-Level Alert-Konfiguration (ISA-18.2), espApi.getAlertConfig/updateAlertConfig, Felder: alerts_enabled, propagate_to_children, suppression_reason, suppression_note, suppression_until (kein custom_thresholds/severity_override)
- ESPSettingsSheet.vue: Accordion-Sektion „Alert-Konfiguration (Gerät)“ mit DeviceAlertConfigSection integriert (nach Zone, vor Geräte nach Subzone)
- Section 2: devices/ 7 → 8 Dateien (DeviceAlertConfigSection)
- Section 3: Komponentenhierarchie HardwareView — ESPSettingsSheet um Alert-Konfiguration erweitert

### Aenderungen in v9.31 (Alert-Basis 1 — AlarmListWidget Notification-API)

- AlarmListWidget.vue: Datenquelle von espStore.devices (sensor.quality) auf alertCenterStore.activeAlertsFromInbox umgestellt — persistierte Notifications statt Live-Quality
- AlarmListWidget.vue: Gleiche Quelle wie QuickAlertPanel und NotificationDrawer (Single Source of Truth)
- AlarmListWidget.vue: Klick auf Alert oeffnet NotificationDrawer („Zum Alert“), Empty-State „Keine aktiven Alerts“ + Link „Benachrichtigungen oeffnen“
- Section 0.4 ALERT_VOLLANALYSE: Status GEFIXT dokumentiert

### Aenderungen in v9.36 (Phase D D1 — CalibrationStep Retry-Flow)

- CalibrationStep.vue: Expliziter "Erneut versuchen"-Button bei readError — erscheint neben Fehlermeldung, ruft readCurrentValue() erneut auf; CSS calibration-step__error-row, calibration-step__retry-btn (outline, var(--color-warning))
- PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md + PHASE_D_D1_RETRY_FLOW_IMPLEMENTIERUNGSAUFTRAG.md: Docs aktualisiert (Status Implementiert, Akzeptanzkriterien abgehakt)

### Aenderungen in v9.36 (Phase D2 — Kalibrierung Abbruch-Button)

- CalibrationWizard.vue: "Abbrechen"-Button in point1, point2, confirm — handleAbort() ruft reset(), optional ConfirmDialog bei points.length > 0 (uiStore.confirm), kein API-Call
- CalibrationWizard.vue: calibration-wizard__abort-btn CSS (sekundaerer Stil, Hover --color-error)
- SensorConfigPanel.vue: "Abbrechen"-Button in pH/EC Kalibrierung point1/point2 — ruft calibration.resetCalibration(), sensor-config__cal-btn--abort CSS
- Abgrenzung: "Zuruecksetzen" = gespeicherte Kalibrierung loeschen (complete); "Abbrechen" = laufende Erfassung abbrechen (point1/point2)

### Aenderungen in v9.36 (Phase D4 — EC-Presets)

- CalibrationWizard.vue: EC-Preset-Dropdown "Kalibrierloesung" bei sensor_type === 'ec' — Optionen: "0 / 1413 µS/cm", "1413 / 12.880 µS/cm", "Eigene Werte"; Default "1413 / 12.880 µS/cm"; ecPreset State, EC_PRESETS Konstante, getSuggestedReference/getReferenceLabel nutzen Preset-Werte
- CalibrationStep.vue: Keine Aenderung — suggestedReference/referenceLabel werden vom Wizard durchgereicht; bei Custom manuelle Eingabe wie bisher

### Aenderungen in v9.37 (Editor — Unteres Panel / bottom-panel)

- DashboardTarget.placement um `'bottom-panel'` erweitert
- dashboard.store.ts: neues Computed `bottomMonitorPanels` (analog inlineMonitorPanels, sideMonitorPanels)
- CustomDashboardView.vue: Target-Dropdown um "Monitor — Unteres Panel" erweitert
- MonitorView.vue: `monitor-layout__main-col` Wrapper (main + bottom), neuer Bereich `monitor-layout__bottom` mit InlineDashboardPanel (mode="inline"), max-height 400px, overflow-y auto
- El Servador dashboard.py: target-Docstring um `bottom-panel` ergaenzt

### Aenderungen in v9.38 (Phase 3.3 + E3 — Zone-Filter im WidgetConfigPanel, Inline-Panels L2 Zone-Filter)

- WidgetConfigPanel.vue: Zone-Filter-Dropdown fuer alarm-list, esp-health, actuator-runtime — "Alle Zonen" oder konkrete Zone (aus espStore.devices); config.zoneFilter
- dashboard.store.ts: inlineMonitorPanelsCrossZone (scope !== 'zone' oder null), inlineMonitorPanelsForZone(zoneId) (scope === 'zone' && zoneId); inlineMonitorPanels = Alias fuer Cross-Zone
- MonitorView.vue L2: inlineMonitorPanelsL2 = cross-zone + zone-spezifische Panels fuer selectedZoneId; L1 nutzt inlineMonitorPanels (Cross-Zone)
- DashboardWidget.config: zoneFilter?: string | null ergaenzt

### Aenderungen in v9.37 (Phase 1 Monitor-Layout)

- MonitorView.vue L2: Reihenfolge Zone-Header → Sensoren → Aktoren → Regeln für diese Zone → Zone-Dashboards → Inline-Panels
- MonitorView.vue L2: Zaehlung nur in Sektionsueberschrift "Sensoren (N)" / "Aktoren (N)"; Subzone-Zeile ohne Count
- MonitorView.vue L1: Zone-Tile Footer zeigt "X/Y online" (ESP-Count aus zoneKPIs.onlineDevices/totalDevices)
- MonitorView.vue L2: getDashboardNameSuffix(dash) — Zone-Dashboard-Namen mit Suffix (createdAt "DD.MM." oder ID) fuer Eindeutigkeit (F004)
- tokens.css: --space-10: 2.5rem (40px) fuer Major-Section-Trennung
- MonitorView.vue: margin-bottom: var(--space-10) auf Zone-Grid, Dashboard-Card, monitor-section, monitor-dashboards, monitor-view__header

### Aenderungen in v9.35 (Phase C — getSensorTypeOptions Deduplizierung)

- sensorDefaults.ts: getSensorTypeOptions() — Device-Liste statt Value-Liste; ein Eintrag pro Multi-Value-Device (sht31, bmp280, bme280) mit Label aus MULTI_VALUE_DEVICES; Value-Types (sht31_temp, sht31_humidity, bme280_*) ausgeblendet; Duplikate DS18B20/ds18b20 dedupliziert (lowercase ds18b20 kanonisch); deviceKeySet + addedLowercase fuer Ausschluss
- sensorDefaults.ts: getMultiValueDeviceFallbackLabel() — Fallback-Labels fuer MULTI_VALUE_DEVICES ohne label
- AddSensorModal.vue: defaultSensorType von 'DS18B20' auf 'ds18b20' (kanonischer Key)
- sensorDefaults.test.ts: Tests fuer SHT31/BME280 Einzeleintrag, Value-Types ausgeschlossen, Single-Value-Sensoren vorhanden

### Aenderungen in v9.30 (Config-Panel-Optimierung 5 — schedule_config + Schwellwerte-Doku)

- SensorConfigPanel.vue: schedule_config UI bei operating_mode=scheduled — Cron-Presets + Expression-Input, Load/Save via sensorsApi.createOrUpdate
- SensorConfigPanel.vue: Accordion-Titel "Sensor-Schwellwerte (Basis)" — Klarstellung vs. AlertConfigSection
- AlertConfigSection.vue: Sektion "Schwellen-Override für Alerts" — In-Code-Kommentar: Override ueberschreibt Haupt-Schwellen nur fuer Alert-Regeln
- types/index.ts: SensorConfigResponse um schedule_config erweitert
- Backend: _model_to_response in sensors.py liefert schedule_config in GET-Response

### Sensor-Schwellwerte: Haupt vs. Alert-Override

| Stelle | Zweck | API |
|--------|------|-----|
| **SensorConfigPanel** "Sensor-Schwellwerte (Basis)" | Basiskonfiguration fuer den Sensor (threshold_min/max, warning_min/max) | POST createOrUpdate |
| **AlertConfigSection** "Schwellen-Override für Alerts" | Override nur fuer Alert-Regeln (custom_thresholds, severity_override) | PATCH /sensors/{id}/alert-config |

Keine Dopplung der Semantik: Haupt-Schwellen = eine Stelle (SensorConfigPanel). Alert-Override = separate Stelle (AlertConfigSection).

### Aenderungen in v9.30 (T08-Fix F/G/H — Sensor Pipeline + Slug + Auth)

- AddSensorModal.vue: `buildSensorPayload()` als gemeinsame Funktion fuer I2C- und OneWire-Flow extrahiert — OneWire-Flow uebertraegt jetzt User-Eingaben (name, raw_value, unit, operating_mode, timeout_seconds, subzone_id) statt Hardcoded-Werte
- AddSensorModal.vue: `SensorPayload` Type-Alias (MockSensorConfig & operating_mode & timeout_seconds & i2c_address)
- subzoneHelpers.ts: `slugifyGerman()` — Deutsche Umlaut-Transliteration (ae/oe/ue/ss) VOR Slugify, dann lowercase + non-alnum → underscore
- useSubzoneCRUD.ts: `confirmCreateSubzone()` nutzt `slugifyGerman()` statt `toLowerCase().replace(/\s+/g, '_')` — "Naehrloesung" statt "n_hrl_sung"
- api/index.ts: Token-Refresh Promise-Queue Pattern (isRefreshing + failedQueue) — genau 1 Refresh-Call bei N parallelen 401-Responses, keine Console-401-Errors

### Aenderungen in v9.29 (Config-Panel-Optimierung 3 — Initial-Panels Subzone-Dropdown)

- AddSensorModal.vue: Freitext durch SubzoneAssignmentSection ersetzt — Dropdown „Keine Subzone“ + bestehende Subzonen + „Neue Subzone erstellen“; effectiveGpio (OneWire/I2C/GPIO), subzoneModel (string | null), resetForm subzone_id: null
- AddActuatorModal.vue: Freitext durch SubzoneAssignmentSection ersetzt — gleiche Dropdown-Logik
- addMultipleOneWireSensors: `normalizeSubzoneId(newSensor.subzone_id)` statt trim/undefined
- types/index.ts: MockSensorConfig.subzone_id?: string | null (analog MockActuatorConfig)

### Aenderungen in v9.28 (Config-Panel-Optimierung 2)

- subzoneHelpers.ts: Neues Util `normalizeSubzoneId()` — "__none__", "", leer → null vor API (Defense-in-Depth)
- esp.ts: addSensor/addActuator nutzen normalizeSubzoneId fuer subzone_id
- ActuatorConfigPanel.vue: handleSave normalisiert subzone_id via normalizeSubzoneId
- SensorConfigPanel.vue: operating_mode + timeout_seconds (Load, UI, Save) — Betriebsmodus-Select, Stale-Timeout bei continuous
- types/index.ts: SensorConfigResponse um operating_mode, timeout_seconds erweitert
- Backend: SensorConfigResponse + _model_to_response liefern operating_mode, timeout_seconds

### Aenderungen in v9.27 (Initiales Sensor/Aktor-Config — Subzone top-level)

- esp.ts addSensor (Real-ESP): `subzone_id` als **top-level** in `realConfig` (nicht nur in metadata) — Backend wertet nur top-level; metadata nur noch `created_via`
- esp.ts addActuator (Real-ESP): `realConfig` um `subzone_id: config.subzone_id ?? null` ergaenzt
- types/index.ts: `ActuatorConfigCreate` und `MockActuatorConfig` um `subzone_id?: string | null` erweitert
- AddActuatorModal.vue: SubzoneAssignmentSection (Dropdown) — `subzoneModel` v-model, resetForm `subzone_id: null`; Wert an addActuator uebergeben
- AddSensorModal.vue: SubzoneAssignmentSection (Dropdown) — `subzoneModel` v-model, effectiveGpio je nach Sensortyp; addMultipleOneWireSensors nutzt `normalizeSubzoneId(newSensor.subzone_id)` bei jedem `espStore.addSensor()`-Aufruf

### Aenderungen in v9.26 (ESPSettingsSheet Bereinigung + Layout)

- ESPSettingsSheet.vue: Reines Informations-Panel — Emits `open-sensor-config`/`open-actuator-config` entfernt, keine Links zu SensorConfigPanel/ActuatorConfigPanel
- ESPSettingsSheet.vue: Eine Sektion „Geräte nach Subzone“ statt getrennter Sensor-/Aktor-Listen — gruppiert nach subzone_id, „Keine Subzone“ am Ende, read-only (kein cursor: pointer)
- ESPSettingsSheet.vue: Layout-Vereinheitlichung — Design-Tokens (--space-*, --text-xs, --text-sm), device-group/device-list CSS, kompakte Zeilen
- ESPSettingsSheet.vue: Mock vs. Real getrennt — „Mock-Steuerung“ nur bei isMock, „Echt-ESP-Info“ nur bei echtem ESP
- HardwareView.vue: handleSensorConfigFromSheet/handleActuatorConfigFromSheet entfernt — Konfiguration ausschliesslich via Level 2 (DeviceDetailView @sensor-click/@actuator-click)
- Section 3: Komponentenhierarchie HardwareView — ESPSettingsSheet, SensorConfigPanel, ActuatorConfigPanel aktualisiert

### Aenderungen in v9.25 (Phase C V1.2 Email-Retry Frontend)

- labels.ts: EMAIL_STATUS_LABELS + getEmailStatusLabel() — Email-Status-Labels (sent, failed, pending, permanently_failed) fuer NotificationDrawer + NotificationItem
- api/notifications.ts: EmailLogStatus Type, EmailLogEntry.status um permanently_failed erweitert, EmailLogListFilters.status typisiert
- NotificationDrawer.vue: getEmailStatusLabel aus labels, retry_count-Anzeige (X/3 Versuche) bei failed/permanently_failed, CSS drawer__email-dot--permanently_failed
- NotificationItem.vue: getEmailStatusLabel aus labels, CSS item__email-status--permanently_failed
- Section 9: labels.ts um EMAIL_STATUS_LABELS + getEmailStatusLabel erweitert

### Aenderungen in v9.24 (Backend-Datenkonsistenz Fix)

- MonitorView L2: Ready-Gate — v-if="!zoneMonitorLoading" auf L2-Content, BaseSkeleton während Loading, ErrorState mit Retry bei API-Fehler
- sensorSubzones/actuatorSubzones: Fallback nur bei zoneMonitorError (nicht während Loading) — behebt "Keine Subzone"-Flackern
- fetchZoneMonitorData() extrahiert für Retry und Watch
- Section 3: Komponentenhierarchie MonitorView — Datenquelle-Zeile um Ready-Gate ergänzt

### Aenderungen in v9.23 (Phase 4D Diagnostics Hub)

- Router: `/maintenance` → Redirect zu `/system-monitor?tab=health` (Wartung in Health-Tab integriert)
- HealthTab.vue: Wartung & Cleanup AccordionSection — Cleanup-Config (Sensor-Daten, Befehlsverlauf, Orphan Mocks) + Maintenance-Jobs mit Run-Buttons (debugApi)
- HealthTab.vue: Plugins-KPI-Cards nutzen `total`/`enabled` (nicht total_plugins/enabled_plugins)
- HealthSummaryBar.vue: Diagnose-Chip immer sichtbar wenn lastRunAge (auch ohne Problems), "Letzte Diagnose: vor Xm ✓"
- diagnostics.store.ts: lastRunAge aus history[0] wenn currentReport null
- DiagnoseTab.vue: loadHistory() beim Mount wenn history leer
- ReportsTab.vue: triggerLabel() — manual→Manuell, logic_rule→Regel, schedule→Zeitplan
- api/diagnostics.ts, shared/stores/diagnostics.store.ts, DiagnoseTab.vue, ReportsTab.vue (Phase 4D)
- Section 5: diagnostics Store, Section 7: diagnostics.ts API-Modul

### Aenderungen in v9.21

- Monitor L2 optimiertes Design — primäre Datenquelle `zonesApi.getZoneMonitorData()`, Fallback `useZoneGrouping` + `useSubzoneResolver`
- types/monitor.ts: ZoneMonitorData, SubzoneGroup, SubzoneSensorEntry, SubzoneActuatorEntry
- zones.ts: `getZoneMonitorData(zoneId)` — GET /zone/{id}/monitor-data
- useSubzoneResolver.ts: Neues Composable — Map (espId, gpio) → { subzoneId, subzoneName } aus Subzone-API, Fallback für Monitor L2
- useZoneGrouping.ts: Optionaler Parameter `subzoneResolver` für GPIO-basierte Subzone-Auflösung
- MonitorView L2: Subzone-Accordion mit „Keine Subzone“-Gruppe, Smart Defaults (≤4 offen, >4 erste offen), localStorage-Persistenz

### Aenderungen in v9.23

- Phase 4C Plugin-System Dokumentation: WebSocket-Events `plugin_execution_started`, `plugin_execution_completed` in Quick-Reference; plugins.ts API-Modul; plugins Store in Store-Architektur; Shared Stores 17 → 18

### Aenderungen in v9.22

- Phase 4B Konsistenz: Alert-Center als Single Source of Truth fuer Badge/Counts
- quickAction.store.ts: alertSummary nutzt alert-center (unresolvedCount, hasCritical, warningCount) mit Fallback auf notification-inbox
- QuickActionMenu.vue: global-alerts Badge reaktiv aus store.alertSummary (nicht aus Action-Objekt)
- NotificationDrawer.vue: Status-Tabs (Aktiv/Gesehen) nutzen alertStore.alertStats (active_count, acknowledged_count) statt lokaler Zaehlung
- App.vue: alertCenterStore.fetchStats() + startStatsPolling() bei Login, stopStatsPolling bei Logout, watch auf isAuthenticated
- useQuickActions.ts: inboxStore aus buildGlobalActions entfernt (Badge kommt aus Store)

### Aenderungen in v9.20

- Phase C: Frontend-Verfeinerung — V1.1 Email-Status-Tracking, V4.1 Timed Snooze, V6.1 QAB-Actions
- notifications.ts (API): 4 neue Types (`EmailLogEntry`, `EmailLogListResponse`, `EmailLogListFilters`, `EmailLogStatsDTO`) + 2 neue Methoden (`getEmailLog()`, `getEmailLogStats()`) fuer Phase C V1.1 Email-Log
- NotificationItem.vue: Email-Delivery-Status im Detail-Grid — `emailStatus`, `emailProvider`, `hasEmailInfo` Computeds aus notification.metadata, Mail-Icon, Zugestellt/Fehlgeschlagen/Ausstehend Badge mit Provider-Info, CSS `.item__email-status--sent/failed/pending`
- QuickAlertPanel.vue: Timed Snooze (Phase C V4.1) — 5 Preset-Dauern (15min, 30min, 1h, 4h, 8h), `suppressionMap` trackt aktive Snooze-Timer, Timer-Countdown-Anzeige, `sensorsApi.updateAlertConfig()` mit `suppression_until` ISO-Datetime
- useQuickActions.ts: Neue QAB-Actions (Phase C V6.1) — `global-last-report` (System Monitor Reports-Tab), ViewContext `'plugins'` fuer PluginsView, `buildGlobalActions()` nimmt jetzt `router` Parameter
- quickAction.store.ts: `'plugins'` zu `ViewContext` Type Union hinzugefuegt
- RuleConfigPanel.vue (Logic): Neuer Action-Node-Typ `plugin` — Plugin-Liste aus API, Konfig aus Schema, Rule-Flow-Editor unterstuetzt Plugin-Actions (Phase 4C)
- Router: Alle Route-Komponenten ueber `lazyView()` (Retry bei dynamic import failure), SystemMonitorView-Tabs per `defineAsyncComponent` (DiagnoseTab, ReportsTab, etc.)

### Aenderungen in v9.19

- Phase 4B: Unified Alert Center — ISA-18.2 Alert Lifecycle (active → acknowledged → resolved) im Frontend
- alert-center.store.ts: Neuer Shared Store — `activeAlerts[]`, `alertStats` (MTTA, MTTR), `fetchActiveAlerts()`, `fetchAlertStats()`, `acknowledgeAlert()`, `resolveAlert()`, Computeds: `alertsByCategory`, `alertsBySeverity`, `criticalCount`, `warningCount`
- notification-inbox.store.ts: Neuer Shared Store — `notifications[]`, `unreadCount`, `highestSeverity`, `isDrawerOpen`, `filter`, WS-Listener fuer `notification_new`, `notification_updated`, `notification_unread_count`
- AlertStatusBar.vue: Neue Komponente in `components/notifications/` — Horizontale Alert-Statusleiste mit Severity-Counts (critical/warning/info), Klick oeffnet NotificationDrawer mit Filter
- NotificationDrawer.vue: Ack/Resolve Buttons integriert — `acknowledgeAlert()` und `resolveAlert()` via `alertCenterStore`, Status-Badge (active/acknowledged/resolved) pro NotificationItem
- NotificationItem.vue: ISA-18.2 Status-Anzeige — Status-Dot mit Farbkodierung, Ack/Resolve Action-Buttons, acknowledged_by/resolved_at Timestamps
- QuickAlertPanel.vue: Status-Filter (active/acknowledged) — FilterChips, Severity-Sortierung (critical > warning > info), Bugfix: ungenutzter `Check` Import entfernt (TS6133)
- HealthTab.vue (System Monitor): Alert-Statistik-Sektion — ISA-18.2 KPIs (MTTA, MTTR), Active/Acknowledged/Resolved Counts, AlertStatusBar Integration
- HealthSummaryBar.vue (System Monitor): Alert-Count-Chips — Critical/Warning Counts aus `alertCenterStore`, Klick-Navigation zu System Monitor Health-Tab
- notifications.ts (API): 4 neue Methoden — `getActiveAlerts()`, `getAlertStats()`, `acknowledgeAlert()`, `resolveAlert()` (Phase 4B REST-Endpoints)
- notification_updated WS-Event: Erweitert um `status`, `acknowledged_at`, `acknowledged_by`, `resolved_at` Felder
- Section 2: notifications/ 2 → 3 Dateien (AlertStatusBar), Shared Stores 13 → 15 (alertCenter, notificationInbox)
- Section 5: Store-Tabelle um notificationInbox und alertCenter erweitert

### Aenderungen in v9.18

- AlertConfigSection.vue: Neue Komponente in `components/devices/` — Per-Sensor/Actuator Alert-Konfiguration (ISA-18.2 Shelved Alarms Pattern), Master-Toggle, Suppression-Details (Grund, Notiz, Zeitlimit), Custom Thresholds (warning/critical min/max), Severity Override, generische Props (`fetchFn`/`updateFn` fuer Sensor/Actuator-Reuse)
- RuntimeMaintenanceSection.vue: Neue Komponente in `components/devices/` — Laufzeit-Statistiken (Uptime, letzte Wartung, erwartete Lebensdauer), Wartungsprotokoll mit Add-Entry-Formular, Maintenance-Overdue-Alert, generische Props (`fetchFn`/`updateFn`)
- SensorConfigPanel.vue: 2 neue AccordionSections integriert — "Alert-Konfiguration" (AlertConfigSection mit sensorsApi) + "Laufzeit & Wartung" (RuntimeMaintenanceSection mit sensorsApi)
- ActuatorConfigPanel.vue: 2 neue AccordionSections integriert — "Alert-Konfiguration" (AlertConfigSection mit actuatorsApi) + "Laufzeit & Wartung" (RuntimeMaintenanceSection mit actuatorsApi)
- QuickAlertPanel.vue: Mute-Button aktiviert — `sensorsApi.updateAlertConfig()` mit `alerts_enabled: false` + `suppression_reason: 'user_mute'`
- sensors.ts: 4 neue Methoden in `sensorsApi` — `getAlertConfig()`, `updateAlertConfig()`, `getRuntime()`, `updateRuntime()` (Phase 4A.7/4A.8)
- actuators.ts: 4 neue Methoden in `actuatorsApi` — `getAlertConfig()`, `updateAlertConfig()`, `getRuntime()`, `updateRuntime()` (Phase 4A.7/4A.8)
- sensors.ts: Bugfix — alert-config/runtime Methoden waren versehentlich in `oneWireApi` statt `sensorsApi` platziert (TypeScript-Fehler)
- Section 2: devices/ Components 4 → 6 (AlertConfigSection + RuntimeMaintenanceSection)

### Aenderungen in v9.17

- formatRelativeTime: 8 lokale Duplikate eliminiert — QuickAlertPanel, NotificationItem, LogicView, DataTable, HealthProblemChip, HealthSummaryBar, useESPStatus, PreviewEventCard importieren jetzt alle von `@/utils/formatters` (Single Source of Truth)
- Server FIX-02: Severity auf 3 Stufen reduziert (critical/warning/info) — kein `success`/`resolved` als Severity
- Server FIX-07: `fingerprint` VARCHAR(64) Spalte in notifications-Tabelle + Partial UNIQUE Index fuer Grafana-Alert Deduplication
- Server FIX-09: Kein separates `alert_update` WS-Event — `notification_new` fuer alles, Frontend unterscheidet via `source`-Feld
- Server FIX-13: Event-Routing — `notification` (legacy) → Toast, `notification_new` → notification-inbox.store (Inbox/Badge)
- Server FIX-15: actuator_alert_handler routet jetzt durch NotificationRouter mit ISA-18.2 Severity-Mapping (emergency→critical, safety→warning, runtime→info, hardware→warning)
- Section 9: formatRelativeTime als SSOT markiert

### Aenderungen in v9.16

- QuickActionBall.vue: Sub-Panel-Routing — dynamische `<component :is>` rendert QuickActionMenu, QuickAlertPanel oder QuickNavPanel basierend auf `store.activePanel`
- QuickAlertPanel.vue: Neues Sub-Panel im FAB — Top-5 ungelesene Alerts sortiert nach Severity (critical > warning > info), Ack/Navigate/Details-Expand Actions, Mute als disabled Placeholder (Auftrag 5 Abhaengigkeit), Footer oeffnet NotificationDrawer
- QuickNavPanel.vue: Neues Sub-Panel im FAB — MRU-Liste (letzte 5 besuchte Views), Favoriten mit Stern-Toggle, Quick-Search Trigger (Ctrl+K via uiStore.toggleCommandPalette)
- useNavigationHistory.ts: Neues Composable — Route-Tracking via router.afterEach(), localStorage Persistenz (ao_nav_history max 20, ao_nav_favorites separat), ROUTE_META fuer 12 Views, StoredNavItem/NavHistoryItem Dual-Type-Pattern (JSON-serializable vs Component-Icon)
- quickAction.store.ts: `QuickActionPanel` Type ('menu' | 'alerts' | 'navigation'), `activePanel` State, `setActivePanel()` Action
- quickAction.store.ts: Bugfix `executeAction()` — prueft ob `activePanel` sich nach Handler-Aufruf geaendert hat, schliesst Menu nur wenn Handler kein Sub-Panel geoeffnet hat
- quickAction.store.ts: Bugfix `toggleMenu()` — nutzt `closeMenu()` beim Schliessen (resettet `activePanel` auf 'menu'), verhindert dass Sub-Panel beim naechsten Oeffnen noch aktiv ist
- useQuickActions.ts: `global-alerts` Action oeffnet jetzt QuickAlertPanel via `setActivePanel('alerts')` statt `inboxStore.toggleDrawer()`
- useQuickActions.ts: Neue `global-navigation` Action mit Navigation-Icon, oeffnet QuickNavPanel via `setActivePanel('navigation')`
- composables/index.ts: Re-Exports fuer `useNavigationHistory` + Type `NavHistoryItem`
- shared/stores/index.ts: Re-Exports fuer `useNotificationInboxStore`, `InboxFilter`, `QuickActionPanel`
- Neues Verzeichnis: `components/notifications/` (NotificationDrawer, NotificationItem)
- Section 2: components/ 18 → 19 Unterverzeichnisse (notifications/ hinzugefuegt), composables 22 → 23 (useNavigationHistory), quick-action/ 3 → 5 Dateien (QuickAlertPanel + QuickNavPanel)
- Section 5: quickAction Store-Tabelle um activePanel, setActivePanel, closeMenu, hasActiveAlerts, isCritical, isWarning erweitert

### Aenderungen in v9.15

- AppShell.vue: `keep-alive` Wrapper mit `:include="['MonitorView', 'LogicView', 'CustomDashboardView']"` — Views bleiben bei Tab-Wechsel erhalten
- MonitorView.vue, LogicView.vue, CustomDashboardView.vue: `defineOptions({ name: 'ComponentName' })` fuer keep-alive Matching
- CustomDashboardView.vue: `onActivated()` re-initialisiert GridStack + Breadcrumb, `onDeactivated()` raeumt Breadcrumb auf (keep-alive Lifecycle)
- MonitorView.vue: DashboardOverviewCard mit horizontalen Chips, Collapse-Toggle (localStorage), Edit-Icons, "+"-Button
- LogicView.vue: Layout umstrukturiert — Eigene Regeln OBEN (primaer), Vorlagen UNTEN (collapsible mit localStorage-State)
- dashboard.store.ts: Per-Layout Debounce-Timer (`Map<string, ReturnType<typeof setTimeout>>`) statt globalem Timer — verhindert Datenverlust bei schnellem Layout-Wechsel
- logic.store.ts: `execution_count` und `last_execution_success` werden bei WebSocket `logic_execution` Event aktualisiert
- DashboardViewer.vue: `inset: 4px` aus `.grid-stack-item-content` entfernt (konsistent mit GridStack-Default margin)
- InlineDashboardPanel.vue: ROW_HEIGHT 60 → 80px (synchron mit CustomDashboardView/DashboardViewer cellHeight), overflow `hidden` → `auto`, CSS hardcoded px → Design-Tokens
- CSS-Konsistenz: 4 Widget-Dateien (ActuatorRuntimeWidget, ActuatorCardWidget, AlarmListWidget, MultiSensorWidget) — hardcoded `font-size`, `padding`, `gap`, `rgba()` durch `var(--text-xs)`, `var(--space-*)`, `var(--color-zone-*)` ersetzt
- Section 16: keep-alive Pattern dokumentiert

### Aenderungen in v9.14

- formatters.ts: 3 neue benannte Konstanten — `DATA_LIVE_THRESHOLD_S` (30), `DATA_STALE_THRESHOLD_S` (120), `ZONE_STALE_THRESHOLD_MS` (60000) — ersetzen Magic Numbers in getDataFreshness(), useDeviceActions, MonitorView
- useDeviceActions.ts: `isRecentlyActive` nutzt `DATA_STALE_THRESHOLD_S * 1000` statt hardcoded `120_000`
- SensorCard.vue: Sensor-Typ-Icons im Monitor-Modus — `ICON_MAP` Record mappt SENSOR_TYPE_CONFIG Icon-Namen auf Lucide-Komponenten (Thermometer, Droplets, Wind, Sun, Gauge, Leaf, Activity), `sensorIcon` Computed, `.sensor-card__type-icon` (14px, iridescent-2)
- dashboard.store.ts: `generateZoneDashboard()` trackt `espId` pro Device — SensorEntry/ActuatorEntry um `espId` erweitert, Widget-Configs enthalten `espId`, `sensorId`/`actuatorId` (`{espId}-gpio{gpio}`)
- dashboard.store.ts: `crossZoneDashboards` filtert nach `target.view === 'monitor'` (verhindert Hardware-Dashboards im Monitor)
- dashboard.store.ts: `generateZoneDashboard()` ruft `syncLayoutToServer()` nach Erstellung auf (auto-persist)
- dashboard.store.ts: `target` Cast von `(dto as any).target` zu `(dto.target as unknown)` (type-safe)
- DashboardViewer.vue: Layout-Lookup per `l.id === layoutId || l.serverId === layoutId` (Server-UUID Kompatibilitaet)
- DashboardViewer.vue: Empty-State mit `router-link` zurueck zum Monitor statt Button + goBack()
- TopBar.vue: Dashboard-Breadcrumb im Monitor-Route — `hasDashboard` Check, `dashboardName` Segment bei `/monitor/dashboard/:dashboardId`
- MonitorView.vue: Zone-Dashboard Empty-State — "Dashboard erstellen" Link zu Editor bei leeren Zonen (LayoutDashboard Icon, dashed Border)
- MonitorView.vue: CSV-Export mit BOM (`\uFEFF`) fuer korrekte UTF-8-Erkennung in Excel
- MonitorView.vue: `URL.revokeObjectURL` verzoegert (1s setTimeout) fuer zuverlaessigeren Download
- MonitorView.vue: `detailIsStale` nutzt `DATA_STALE_THRESHOLD_S * 1000` statt hardcoded `120_000`
- MonitorView.vue: `expandedChartData` Label ohne leere Klammern wenn Unit fehlt
- MonitorView.vue: Error-Logging bei fehlgeschlagenem `fetchDetailStats()`
- Section 9: formatters.ts Zeilenanzahl 631 → 655

### Aenderungen in v9.13

- useDashboardWidgets.ts: Container-agnostisches Widget-Rendering Composable — extrahiert aus CustomDashboardView, 9 Widget-Typen, `WIDGET_TYPE_META`, `WIDGET_DEFAULT_CONFIGS`, `createWidgetElement()`, `mountWidgetToElement()`, `cleanupAllWidgets()`
- DashboardViewer.vue: View-Only Dashboard-Rendering mit GridStack `staticGrid: true` — Header (Zurueck + Titel + "Im Editor bearbeiten"), Auto-Generated Banner mit Uebernehmen/Anpassen
- InlineDashboardPanel.vue: CSS-Grid-Only Dashboard-Renderer (12 Spalten, KEIN GridStack) — Props: `layoutId`, `mode: 'inline' | 'side-panel'`, Zero-Overhead Rendering
- dashboard.store.ts: `DashboardTarget` Interface (`view`, `placement`, `anchor`, `panelPosition`, `panelWidth`, `order`), `setLayoutTarget()`, `generateZoneDashboard()`, `claimAutoLayout()`
- dashboard.store.ts: 3 neue Computeds — `inlineMonitorPanels`, `sideMonitorPanels`, `hardwarePanels` (filtern layouts nach target.view + target.placement)
- dashboard.store.ts: `serverToLocal()`/`localToServer()` mappen target-Feld zwischen API DTO und lokalem State
- Router: 2 neue Routes — `monitor/dashboard/:dashboardId` (name: 'monitor-dashboard', VOR :zoneId wegen Greedy-Matching), `monitor/:zoneId/dashboard/:dashboardId` (name: 'monitor-zone-dashboard')
- MonitorView.vue: InlineDashboardPanel-Integration — CSS-Grid-Layout mit Side-Panel (`grid-template-columns: 1fr 300px`), Inline-Panels in L1 + L2, responsive Breakpoint 768px
- HardwareView.vue: InlineDashboardPanel-Integration — Side-Panel fuer Hardware-View mit sticky Positionierung, responsive Breakpoint 768px
- CustomDashboardView.vue: Target-Konfigurator — `showTargetConfig`, `activeTarget`, `setTarget()`/`clearTarget()`, "Im Monitor anzeigen" RouterLink mit `monitorRouteForLayout` Computed
- Server: `target` JSON-Spalte in DashboardLayout Model + DashboardCreate/Update/Response Schemas + Alembic Migration
- api/dashboards.ts: `target` Feld in DashboardDTO, CreatePayload, UpdatePayload
- composables/index.ts: Re-Export `useDashboardWidgets` + Types (`WidgetTypeMeta`, `UseDashboardWidgetsOptions`)
- Section 2: dashboard/ Components 9 → 11 (DashboardViewer + InlineDashboardPanel)
- Section 5: dashboard Store-Tabelle um DashboardTarget, target-Computeds, setLayoutTarget, generateZoneDashboard, claimAutoLayout erweitert
- Section 10: Router-Tabelle um monitor/dashboard/:dashboardId und monitor/:zoneId/dashboard/:dashboardId erweitert

### Aenderungen in v9.12

- RuleConfigPanel.vue: Days-of-Week Fix — `dayLabels` von `['So','Mo',...,'Sa']` (JS: 0=Sonntag) zu `['Mo','Di','Mi','Do','Fr','Sa','So']` (ISO 8601: 0=Montag) umgestellt, passt zu Python `weekday()`
- RuleFlowEditor.vue: Default `daysOfWeek` von `[1,2,3,4,5]` auf `[0,1,2,3,4]` korrigiert (Montag-Freitag)
- types/logic.ts: ExecutionHistoryItem Felder an Server-Response angepasst — `logic_rule_id`→`rule_id`, `timestamp`→`triggered_at`, `trigger_data`→`trigger_reason` (Typ: Record→string), `rule_name` hinzugefuegt
- types/logic.ts: TimeCondition Kommentar aktualisiert auf `0 = Monday, 6 = Sunday (ISO 8601 / Python weekday())`
- logic.store.ts: `loadExecutionHistory(ruleId?)` Action — REST-Fetch via `logicApi.getExecutionHistory()`, Merge mit WebSocket-Events, Deduplizierung nach ID, max 50 Eintraege
- logic.store.ts: Neuer State: `executionHistory`, `isLoadingHistory`, `historyLoaded`
- logic.store.ts: `handleLogicExecutionEvent` erweitert — pusht WS-Events auch in `executionHistory`
- RuleFlowEditor.vue: `pushToHistory()` in 4 fehlende Events eingebaut — onDrop, deleteNode (vor Loeschung), duplicateNode, onNodeDragStop
- RuleFlowEditor.vue: Undo/Redo Buttons als Overlay (Undo2/Redo2 Icons), disabled-State bei `!canUndo`/`!canRedo`
- RuleFlowEditor.vue: Keyboard-Shortcuts Ctrl+Z (Undo), Ctrl+Y/Ctrl+Shift+Z (Redo), via `@keydown` auf Graph-Container
- LogicView.vue: Landing-Page Rule-Liste von Inline-Buttons auf `<RuleCard>` Komponenten umgestellt
- LogicView.vue: RuleCard Event-Handler — `@select` (Rule oeffnen), `@toggle` (Enable/Disable + Toast), `@delete` (ConfirmDialog + Toast)
- LogicView.vue: Execution History Panel erweitert — REST-Integration beim ersten Oeffnen, Filter (Regel + Status), expandierbare Detail-Rows, Loading-Spinner
- LogicView.vue: Alte list-item CSS (72 Zeilen) ersetzt durch `.rules-empty__cards` Grid
- RuleCard.vue: Sichtbares Status-Label ("Aktiv"/"Deaktiviert"/"Fehler") neben Status-Dot
- RuleCard.vue: Error-Styling — `rule-card--error` (roter Rand) bei `last_execution_success === false`, AlertCircle Error-Icon
- RuleCard.vue: Toggle-Pulse-Animation (dot-pulse, 0.8s) beim Status-Dot-Klick
- Section 4: Logic Types um ExecutionHistoryItem und LogicConnection ergaenzt
- Section 5: Logic Store Zeile um executionHistory, historyLoaded, loadExecutionHistory, pushToHistory, undo, redo erweitert

### Aenderungen in v9.11

- MonitorView.vue L2: SensorCard Sparkline im Monitor-Modus entfernt — keine `sparklineData` Prop-Bindung, keine `LiveLineChart`-Nutzung, kompaktere Karte (Name + Wert + Dot + ESP-ID)
- MonitorView.vue L2: Expanded Panel radikal vereinfacht — GaugeChart, LiveLineChart, HistoricalChart + doppelte TimeRange-Buttons ENTFERNT, ersetzt durch 1h-Chart (vue-chartjs `Line`) + 2 Action-Buttons
- MonitorView.vue L2: 1h-Chart mit Initial-Fetch — `fetchExpandedChartData()` via `sensorsApi.queryData` (1h Fenster, 500 Datenpunkte), `expandedChartData`/`expandedChartOptions` Computeds
- MonitorView.vue L2: Auto-generierte Zone-Dashboards — `generatedZoneDashboards` Guard-Set, Watcher ruft `dashStore.generateZoneDashboard()` beim ersten Zonenbesuch
- MonitorView.vue L2: Zone-Header erweitert um KPI-Zeile (Sensor-Count, Aktor-Count, Alarm-Count mit AlertTriangle)
- MonitorView.vue L2: Subzone-Header erweitert um Status-Dot (`getWorstQualityStatus`) und KPI-Werte (`getSubzoneKPIs` — aggregiert Sensorwerte nach Basistyp, max 3 Eintraege)
- MonitorView.vue L3: Multi-Sensor-Overlay — `availableOverlaySensors` Computed, `toggleOverlaySensor()`, `fetchOverlaySensorData()`, Chip-Selektor UI (max 4 Overlays), sekundaere Y-Achse bei unterschiedlichen Einheiten, Legend bei aktiven Overlays
- MonitorView.vue L3: Overlay-Cleanup in `closeSensorDetail()` und Re-Fetch in `onDetailRangeChange()`
- SensorCard.vue: Stale-Indikator (>120s kein Update) — `getDataFreshness()`, CSS `sensor-card--stale` (opacity 0.7, warning border), Clock-Badge mit `formatRelativeTime()`
- SensorCard.vue: ESP-Offline-Indikator — `esp_state !== 'OPERATIONAL'`, CSS `sensor-card--esp-offline` (opacity 0.5), WifiOff-Badge
- SensorCard.vue: `formatValue()` Signatur von `(value: number)` zu `(value: number | null | undefined)` — 0 wird korrekt als valider Wert behandelt (P2.5 Fix)
- SensorCard.vue: `LiveLineChart` Import entfernt (nicht mehr benoetigt)
- Section 3: Komponentenhierarchie MonitorView aktualisiert (Sparkline→1h-Chart, L3 Overlay dokumentiert)

### Aenderungen in v9.10

- CustomDashboardView.vue: Edit/View-Mode-Trennung — `isEditing` ref, GridStack `enableMove()`/`enableResize()` Toggle, Gear-Icon + Katalog/Export/Import/Delete nur im Edit-Modus sichtbar
- CustomDashboardView.vue: Widget-Katalog erweitert um `description` Feld pro Widget-Typ (9 Beschreibungen), Text-xs + text-muted Darstellung
- CustomDashboardView.vue: `WIDGET_DEFAULT_CONFIGS` Record mit Smart-Defaults pro Widget-Typ (z.B. line-chart: timeRange '1h', historical: timeRange '24h')
- CustomDashboardView.vue: Template-Auswahl UI im Layout-Dropdown (4 Templates via `dashStore.DASHBOARD_TEMPLATES`)
- MultiSensorChart.vue: `SENSOR_TYPE_CONFIG` Import, Y-Achse von hart `min`/`max` zu flexibel `suggestedMin`/`suggestedMax` (3-Tier: Props > SENSOR_TYPE_CONFIG > computedYRange)
- MultiSensorChart.vue: `sharedSensorTypeConfig` Computed — erkennt wenn alle Sensoren gleichen Typ haben, nutzt dann SENSOR_TYPE_CONFIG fuer Y-Achsen-Defaults
- WidgetConfigPanel.vue: `handleSensorChange()` auto-populate Threshold-Werte aus SENSOR_TYPE_CONFIG (warnLow/warnHigh bei 10% vom Rand, alarmLow/alarmHigh bei min/max)
- WidgetConfigPanel.vue: 4 Threshold-Inputfelder (Alarm Low/High, Warn Low/High) mit farbigen Labels, sichtbar wenn showThresholds aktiviert
- dashboard.store.ts: `DASHBOARD_TEMPLATES` Registry (4 Templates: zone-overview, sensor-detail, multi-sensor-compare, empty)
- dashboard.store.ts: `createLayoutFromTemplate(templateId, name?)` Funktion mit eindeutigen Widget-IDs (Index in ID gegen Kollision)
- Bugfix: Threshold auto-populate Check `!value` → `value == null` (Wert 0 ist valider Threshold, z.B. 0°C)
- Bugfix: Template Widget-ID Kollision bei synchronem `.map()` — Index im ID-String ergaenzt
- Bugfix: View-Modus Cursor `move` auf Widget-Header → `default` (nur im Edit-Modus `move`)
- Section 3: Neue Komponentenhierarchie (CustomDashboardView / Dashboard Editor) dokumentiert
- Section 5 Store-Tabelle: dashboard Store um DASHBOARD_TEMPLATES + createLayoutFromTemplate erweitert
- Section 13: "Neues Dashboard-Widget" Workflow auf CustomDashboardView + WIDGET_DEFAULT_CONFIGS aktualisiert

### Aenderungen in v9.9

- Router: `/custom-dashboard` umbenannt zu `/editor`, neuer optionaler Param `/editor/:dashboardId` (name: 'editor-dashboard')
- Router: `/logic/:ruleId` Route hinzugefuegt (name: 'logic-rule') — Deep-Link zu spezifischer Rule
- Router: `/monitor/:zoneId/sensor/:sensorId` Route hinzugefuegt (name: 'monitor-sensor') — Sensor-Detail L3 URL-basiert
- Router: Legacy-Redirects `/custom-dashboard` → `/editor` und `/sensor-history` → `/monitor`
- ViewTabBar.vue: Tab-Pfad `/custom-dashboard` → `/editor`, activeTab Computed erweitert
- Sidebar.vue: "Zeitreihen" Eintrag entfernt (veraltet, in Monitor L3 integriert), Dashboard Active-Check deckt `/editor` ab
- TopBar.vue: Breadcrumbs fuer Editor (Dashboard-Name), Logic (Rule-Name), Monitor L3 (Sensor-Name) hinzugefuegt
- dashboard.store.ts: breadcrumb ref erweitert um `sensorName`, `ruleName`, `dashboardName` (6 Felder statt 3)
- LogicView.vue: Deep-Link Support — `route.params.ruleId` lesen, `selectRule()` mit `router.replace()` URL-Sync, Breadcrumb-Update
- CustomDashboardView.vue: Deep-Link Support — `route.params.dashboardId` und Legacy `route.query.layout` konsumieren, Breadcrumb-Update
- MonitorView.vue: Sensor-Detail URL-Sync via `router.replace()` in `openSensorDetail()`/`closeSensorDetail()`, Deep-Link Watcher fuer sensorId
- MonitorView.vue: Cross-Link "Konfiguration" Button → `/sensors?sensor={espId}-gpio{gpio}`, alle `/custom-dashboard` Links → `/editor`
- SensorsView.vue: `?sensor={espId}-gpio{gpio}` bzw. `?focus=sensorId` — auto-open DeviceDetailPanel (volle Konfiguration nur in HardwareView)
- SensorsView.vue: Cross-Link "Live-Daten im Monitor anzeigen" Button → `/monitor/:zoneId`
- LinkedRulesSection.vue: Rule-Items klickbar mit `router.push({ name: 'logic-rule', params: { ruleId } })`, ExternalLink Icon mit Hover-Reveal
- HardwareView.vue: breadcrumb Objekt erweitert um `sensorName`, `ruleName`, `dashboardName`
- Sensor-ID-Format fuer URLs: `{espId}-gpio{gpio}` (z.B. "ESP_12AB34CD-gpio5")
- Section 10 (Router): Route-Struktur vollstaendig aktualisiert, Deep-Link-Pattern dokumentiert
- Komponentenhierarchien: SensorsView und MonitorView mit Cross-Links und URL-Sync aktualisiert

### Aenderungen in v9.8

- Neues Verzeichnis `components/devices/` (4 Dateien): SensorCard, ActuatorCard, DeviceMetadataSection, LinkedRulesSection
- SensorCard.vue: Unified Sensor-Card mit `mode: 'config' | 'monitor'` — ersetzt Inline-Cards in SensorsView UND MonitorView
- ActuatorCard.vue: Unified Actuator-Card mit Toggle in beiden Modi — ersetzt Inline-Cards in SensorsView UND MonitorView
- DeviceMetadataSection.vue: Formular fuer Geraete-Metadaten (3 Gruppen: Hersteller/Produkt, Installation/Wartung, Notizen) mit Wartungs-Ueberfaellig-Alert
- LinkedRulesSection.vue: Read-Only Anzeige verknuepfter Logic Rules per Sensor/Aktor (filtert logicStore.connections)
- SensorsView.vue: Monitoring-Elemente entfernt (Sparklines, Live-Werte, Quality-Dots, updatedSensorKeys, getQualityColor) — Inline-Cards durch SensorCard/ActuatorCard ersetzt
- MonitorView.vue: Inline-Cards durch SensorCard/ActuatorCard ersetzt, ~70 Zeilen ungenutztes CSS entfernt
- SensorConfigPanel.vue: 2 neue AccordionSections ("Geraete-Informationen" + "Verknuepfte Regeln") mit DeviceMetadataSection + LinkedRulesSection
- ActuatorConfigPanel.vue: Identisch zu SensorConfigPanel — 2 neue AccordionSections
- Neuer Type: `device-metadata.ts` — DeviceMetadata Interface + parseDeviceMetadata + mergeDeviceMetadata + getNextMaintenanceDate + isMaintenanceOverdue
- Neues Composable: `useDeviceMetadata.ts` — metadata ref, isDirty, loadFromRaw, toRawMetadata, updateField
- types/index.ts: Re-Exports fuer DeviceMetadata + Utility-Funktionen
- composables/index.ts: Re-Exports fuer useDeviceMetadata + useZoneGrouping
- Ordnerstruktur: components/ 13 → 18 Unterverzeichnisse, composables 18 → 20, types 4 → 7
- Komponentenhierarchien: SensorsView und MonitorView dokumentiert

### Aenderungen in v9.7

- dashboard.store.ts: statusCounts von ref() zu computed() umgebaut — nutzt getESPStatus() direkt, keine manuelle Zuweisung aus HardwareView mehr noetig
- HardwareView.vue: 30 Zeilen entfernt (4 Computeds onlineCount/offlineCount/warningCount/safeModeCount + watch-Block der dashStore.statusCounts schrieb)
- zone.store.ts: handleZoneAssignment() hat jetzt Toasts (zone_assigned, zone_removed, error) — identische Texte zu useZoneDragDrop.ts fuer 2s-Deduplication
- PendingDevicesPanel.vue: Status-Dot (8x8px, border-radius 50%) vor Status-Text in beiden Geraete-Listen (assigned + unassigned)
- Store-Architektur-Tabelle: dashboard und zone Stores dokumentiert

### Aenderungen in v9.6

- ESPSettingsSheet.vue: Custom SlideOver-Implementierung (Teleport+Transition+Overlay) ersetzt durch SlideOver-Primitive (shared/design/primitives/SlideOver.vue)
- ESPSettingsSheet.vue: Status-Anzeige von eigener `isOnline` Logik auf `useESPStatus()` Composable migriert (Dot + Text + Pulse)
- ESPSettingsSheet.vue: Inline SensorConfigPanel/ActuatorConfigPanel (AccordionSections) entfernt — durch klickbare Sensor/Actuator-Liste ersetzt
- ESPSettingsSheet.vue: Neue Emits `open-sensor-config` und `open-actuator-config` — HardwareView faengt Events und oeffnet separate SlideOvers
- ESPSettingsSheet.vue: Two-Step-Delete (showDeleteConfirm ref) ersetzt durch `uiStore.confirm()` (ConfirmDialog) + `useToast()` Feedback
- ESPSettingsSheet.vue: 1419 → 1341 Zeilen (Wrapper-Vereinfachung, Inline-Panels entfernt)
- HardwareView.vue: Neue Event-Handler `handleSensorConfigFromSheet()` und `handleActuatorConfigFromSheet()`
- HardwareView.vue: 1066 → 1316 Zeilen (neue Handler + parallele Block-2-Arbeit)
- Komponentenhierarchie (HardwareView): ESPSettingsSheet, SensorConfigPanel, ActuatorConfigPanel als SlideOver-Stack dokumentiert

### Aenderungen in v9.5

- ZonePlate.vue: `display: contents` auf device-wrapper entfernt — brach SortableJS Drag-Visuals (Element wurde verschoben, aber hatte keine CSS-Box)
- ZonePlate.vue: VueDraggable Template iteriert jetzt `localDevices` direkt statt verschachtelt `subzoneGroups` — fixes v-model/DOM-Kind Mismatch
- ZonePlate.vue: VueDraggable animation 0 → 150 fuer visuelles Reorder-Feedback
- UnassignedDropBar.vue: `@start`/`@end` Events + dragStore Integration hinzugefuegt — ZonePlates zeigen Drop-Target-Visuals beim Drag aus der Leiste
- Section 12 (Drag & Drop): VueDraggable-Regeln dokumentiert (display:contents Verbot, v-model/Template Konsistenz, force-fallback Pflicht)
- Section 12: Zone-Removal Flow (Zone → UnassignedDropBar) als separater Flow dokumentiert
- Section 12: Dual-System Tabelle erweitert um Unassigned-Drag Flow

### Aenderungen in v9.4

- HardwareView Level 1 Redesign (Zone Accordion) — 4-Block Implementierung
- sensorDefaults.ts: Labels gekuerzt ("Temperatur (DS18B20)" → "Temperatur"), Units normalisiert ("% RH" → "%RH")
- sensorDefaults.ts: 3 neue Aggregation-Funktionen (groupSensorsByBaseType, aggregateZoneSensors, formatAggregatedValue)
- sensorDefaults.ts: 4 neue Types (RawSensor, GroupedSensor, ZoneAggregation, AggCategory)
- DeviceMiniCard.vue: Sensor-Display nutzt groupSensorsByBaseType (Multi-Value-Aufloesung), Spark-Bars entfernt, Quality-Textfarbe
- DeviceMiniCard.vue: "Oeffnen"-Button entfernt → ChevronRight-Hint + MoreVertical drill-down
- ZonePlate.vue: Aggregierte Sensorwerte im Zone-Header, farbiger Status-Dot (8px), Subzone-Chips mit Filter
- ZonePlate.vue: EmptyState-Pattern (PackageOpen) fuer leere Zonen, getESPStatus fuer online-Zaehlung
- HardwareView.vue: Zone-Sortierung (offline/warning → online → leer → alphabetisch)
- HardwareView.vue: localStorage-Persistenz fuer Accordion-Zustand, Smart Defaults (≤4 alle offen, >4 nur erste)
- UnassignedDropBar.vue: Badge SIM/HW → nur MOCK (kein Badge fuer echte Devices), Sensor-Summary statt Count

### Aenderungen in v9.3

- esp.ts Store: onlineDevices/offlineDevices nutzen jetzt getESPStatus() statt einfacher status/connected Checks (Heartbeat-Timing-Fallback, stale=online)
- DeviceMiniCard.vue: Stale-Daten-Visualisierung via getESPStatus — graue Sparkbars, "Zuletzt vor X Min." Label, CSS-Klasse device-mini-card--stale
- useESPStatus ist jetzt Single Source of Truth fuer Status in Store UND Komponenten (nicht nur Komponenten)

### Aenderungen in v9.2

- Composables Expansion: 16 → 18 (neu: useESPStatus, useOrbitalDragDrop)
- useESPStatus: Single source of truth fuer ESP-Status (composable + pure functions getESPStatus/getESPStatusDisplay)
- useOrbitalDragDrop: DnD-Logik aus ESPOrbitalLayout extrahiert (250 Zeilen)
- ESPOrbitalLayout.vue: 655 → 410 Zeilen (DnD-Handler + Analysis-Auto-Open + Modal-Watchers in Composable)
- ESPCardBase.vue: Neue Base-Komponente (4 Varianten: mini/compact/standard/full)
- dashboard.store.ts: deviceCounts Fix (dead ref → computed)
- forms.css: Neues Shared CSS fuer Form/Modal Styles, doppelte BEM-Button-Definitionen entfernt
- tokens.css: 3 neue semantische Aliase (--color-text-inverse, --color-border, --color-surface-hover)
- ESPCard.vue + ESPHealthWidget.vue: Status-Logik auf useESPStatus migriert
- Styles: 5 → 6 CSS Dateien (forms.css hinzugefuegt)
- esp/ Components: 10 → 11 (ESPCardBase.vue hinzugefuegt)

### Aenderungen in v9.1

- Settings-Panel Modernisierung (Block B): Three-Zone-Pattern fuer SensorConfigPanel + ActuatorConfigPanel
- Neue Design Primitive: AccordionSection.vue (localStorage-Persistenz, CSS grid-template-rows Animation)
- ESPSettingsSheet.vue: Status-Details, Sensor/Aktor-Config, Mock-Controls als Accordion-Sektionen
- AddSensorModal.vue: Sensor-Type-Aware Summary (SHT31 → "auf I2C 0x44, misst Temperatur + Luftfeuchtigkeit, alle 30s")
- sensorDefaults.ts: Neues Feld defaultIntervalSeconds, neue Funktionen getDefaultInterval(), getSensorTypeAwareSummary()
- Primitives: 9 → 10 (AccordionSection), Barrel Exports: 20 → 21

### Aenderungen in v9.0

- Dashboard-Merge (cursor/dashboard-neue-struktur): 5 neue Views (CustomDashboard, Hardware, Monitor, Calibration, LoadTest)
- Shared Stores Expansion: 4 → 12 (actuator, auth, config, dashboard, database, dragState, gpio, logic, notification, sensor, ui, zone)
- Original stores/ konsolidiert: 5 → 1 (nur esp.ts verbleibt, Rest nach shared/stores/ migriert)
- Composables Expansion: 8 → 16 (neu: useCalibration, useCommandPalette, useContextMenu, useDeviceActions, useGrafana, useKeyboardShortcuts, useScrollLock, useSwipeNavigation)
- Neue Pakete: gridstack (Dashboard Builder), chartjs-plugin-annotation (Threshold-Linien), @vue-flow/core (Rule Editor)
- dashboard.store.ts: Exportierte Types WidgetType, DashboardWidget, DashboardLayout
- Component Count: 97 → 129 .vue, Views: 11 → 16, Stores: 9 → 13, Composables: 8 → 16
- 20 TypeScript-Fehler gefixt nach Merge (API-Type-Mismatches, ComputedRef-Calls, unused Imports)

### Aenderungen in v8.0

- Design System: `shared/design/` mit primitives/ (9), layout/ (3), patterns/ (3)
- Shared Stores: `shared/stores/` (auth, database, dragState, logic)
- Styles: `styles/` (tokens.css, glass.css, animations.css, main.css, tailwind.css)
- Rules Components: `components/rules/` (RuleCard, RuleConfigPanel, RuleFlowEditor, RuleNodePalette, RuleTemplateCard)
- Component Count: 67 → 97 .vue, Stores: 5 → 9 (5 original + 4 shared)
- Ordnerstruktur (Section 2) vollstaendig aktualisiert

### Aenderungen in v7.1

- Test-Stack hinzugefuegt: vitest, @vue/test-utils, jsdom, msw, @vitest/coverage-v8
- Test-Scripts dokumentiert: npm test, test:watch, test:coverage
- Test-Ordnerstruktur (tests/) in Section 2 ergaenzt
- Unit Tests Status in Bekannte Luecken aktualisiert (5 Files, 250 Tests)

### Aenderungen in v7.0

- Projekt-Setup Section mit Tech-Stack Details
- Component-Entwicklung Checkliste und Hierarchie
- Type-System detaillierte Tabellen
- Store-Architektur Uebersicht
- Server-Verbindung erweitert
- Drag & Drop System dokumentiert
- Farbsystem & Design komplett
- Bekannte Luecken dokumentiert
- Entwicklungs-Workflows hinzugefuegt
- Make-Targets dokumentiert
