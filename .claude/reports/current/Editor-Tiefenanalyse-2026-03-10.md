# Editor (CustomDashboardView) Tiefenanalyse

> **Erstellt:** 2026-03-10
> **Typ:** Analyse (kein Code geaendert)
> **Scope:** Editor-Tab — Widget-System, GridStack, Dashboard-CRUD, Target/Placement, Auto-Generierung, Inline-Panels, Abhaengigkeiten
> **Quellen:** 5 parallele Analyse-Agents (Core, Widgets, Store, Dependencies, Server API)

---

## 1. Komponentenbaum (mit Dateipfaden)

```
CustomDashboardView.vue (1352 Zeilen, /editor, /editor/:dashboardId)
├── ViewTabBar.vue (Tab-Navigation)
├── Toolbar (.dashboard-builder__toolbar)
│   ├── Layout-Selector Dropdown (.dashboard-builder__layout-selector)
│   │   ├── Bestehende Layouts (switchLayout)
│   │   ├── DASHBOARD_TEMPLATES (4 Templates)
│   │   └── "Neues Dashboard" Input + Plus-Button
│   ├── Edit/View-Toggle (Pencil/Eye, isEditing ref)
│   ├── Widget-Katalog-Toggle (LayoutGrid, showCatalog ref)
│   ├── Target-Configurator (MapPin, showTargetConfig ref)
│   ├── "Im Monitor anzeigen" RouterLink (MonitorPlay)
│   └── Export/Import/Delete Buttons (nur Edit-Modus)
├── Widget-Katalog Sidebar (.dashboard-builder__catalog, 220px)
│   └── 9 Widget-Typen gruppiert nach Kategorie (Sensoren/Aktoren/System)
│       └── addWidget(type) → WIDGET_DEFAULT_CONFIGS + GridStack.addWidget()
├── GridStack 12-Column Grid (.grid-stack, cellHeight: 80px, margin: 8px)
│   └── Dashboard-Widget[] (imperativ via createWidgetElement + mountWidgetComponent)
│       ├── Widget-Header (.dashboard-widget__header, gs-drag-handle)
│       │   ├── Titel (.dashboard-widget__title)
│       │   ├── Type-Badge (.dashboard-widget__type)
│       │   └── Gear-Button (.dashboard-widget__gear-btn, nur Edit-Modus)
│       └── Vue-Mount-Point (.dashboard-widget__vue-mount)
│           └── [SensorCardWidget | GaugeWidget | LineChartWidget | ...]
└── WidgetConfigPanel.vue (487 Zeilen, SlideOver)
    ├── Titel-Input (alle Widget-Typen)
    ├── Sensor-Selektion (line-chart, gauge, sensor-card, historical)
    ├── Aktor-Selektion (actuator-card)
    ├── Zone-Filter (alarm-list, esp-health, actuator-runtime)
    ├── Zeitraum-Chips (historical)
    ├── Y-Achse Min/Max (line-chart, historical)
    ├── Farb-Palette (8 CHART_COLORS)
    └── Threshold-Konfiguration (4 Felder, auto-populate aus SENSOR_TYPE_CONFIG)
```

### Rendering-Varianten (gleiche Widgets, 3 Container)

| Container | Datei | Zeilen | GridStack? | Drag/Resize? | Header? | Gear? |
|-----------|-------|--------|-----------|-------------|---------|-------|
| Editor | CustomDashboardView.vue | 1352 | Ja (12-col, 80px) | Ja (Edit-Modus) | Ja | Ja (Edit-Modus) |
| Viewer | DashboardViewer.vue | 369 | Ja (staticGrid: true) | Nein | Nein (suppressiert) | Nein |
| Inline | InlineDashboardPanel.vue | 241 | **Nein** (CSS-Grid) | Nein | Nein | Nein |

Alle drei nutzen `useDashboardWidgets.ts` (273 Zeilen) als Shared Rendering-Layer.

---

## 2. Dashboard-CRUD-Flow

### 2.1 Erstellen

**UI-Flow:**
1. Layout-Dropdown oeffnen → "Neues Dashboard" Input sichtbar
2. Name eingeben + Enter oder Plus-Button klicken
3. `handleCreateLayout(name)` → `dashStore.createLayout(name)`
4. Grid wird geleert und neu initialisiert

**Alternativ: Template-Erstellung**
1. Layout-Dropdown → Template-Sektion → Template waehlen
2. `handleCreateFromTemplate(templateId)` → `dashStore.createLayoutFromTemplate(templateId, name?)`
3. Widgets aus Template werden geladen

**API:** Kein sofortiger POST. `createLayout()` erzeugt lokale ID (`dash-{timestamp}-{random6}`), speichert in localStorage, und startet debounced Sync (2000ms) → `POST /api/v1/dashboards`.

**Store-Flow:**
```
createLayout(name) → layouts[].push({id, name, widgets: []}) → persistLayouts() (localStorage)
                   → syncLayoutToServer(id) [debounced 2s] → POST /api/v1/dashboards
                   → Antwort: serverId wird in layout gespeichert
```

### 2.2 Laden

**Routing:** `/editor/:dashboardId` → `route.params.dashboardId` wird in `onMounted` konsumiert. Legacy: `route.query.layout`.

**Init-Reihenfolge:**
1. `onMounted` → `dashStore.fetchLayouts()` (GET /api/v1/dashboards, merged mit localStorage)
2. `initGrid()` → `GridStack.init({...})` mit 12-Spalten-Config
3. `loadWidgetsToGrid(layout.widgets)` → Grid-Items + Vue-Components mounten

**GridStack-Init:** In `onMounted` und `onActivated` (keep-alive). `nextTick` wird genutzt weil `grid.addWidget()` den DOM synchron erstellt aber `.grid-stack-item-content` erst im naechsten Tick verfuegbar ist.

### 2.3 Bearbeiten

**Auto-Save Pattern:** Kein expliziter "Speichern"-Button. Jede Aenderung triggert `autoSave()`:
- `grid.on('change')` → Drag/Resize fertig
- `grid.on('removed')` → Widget entfernt
- `addWidget()` → Neues Widget hinzugefuegt
- `handleConfigUpdate()` → Config geaendert via WidgetConfigPanel

**Dirty-State:** Es gibt **keinen** expliziten Dirty-State-Indikator. Der User sieht nicht ob ungespeicherte Aenderungen existieren. `lastSyncError` wird als Toast angezeigt bei Sync-Fehlern.

**Serialisierung:**
```typescript
autoSave() {
  const items = grid.getGridItems()
  const widgets = items.map(el => ({
    id:     el.querySelector('.dashboard-widget').dataset.widgetId,
    type:   el.querySelector('.dashboard-widget').dataset.type,
    x/y/w/h: el.gridstackNode.{x,y,w,h},
    config: widgetConfigs.get(widgetId)
  }))
  dashStore.saveLayout(layoutId, widgets)
}
```

**Debounce:** Per-Layout, 2000ms. `Map<string, setTimeout>` verhindert dass paralleles Editieren verschiedener Layouts sich gegenseitig cancelt.

### 2.4 Loeschen

1. `handleDeleteLayout()` → `uiStore.confirm()` (Danger-Dialog)
2. `dashStore.deleteLayout(layoutId)` → lokal aus layouts[] entfernt + localStorage aktualisiert
3. Falls `serverId` vorhanden → `DELETE /api/v1/dashboards/{serverId}` (fire-and-forget)
4. Grid wird geleert, activeLayoutId auf erstes verbleibendes Layout oder null

**Referenz-Problem:** Wenn ein Dashboard geloescht wird das in MonitorView als InlineDashboardPanel referenziert wird, verschwindet es dort sofort (reaktiv ueber layouts[]-Array). Kein expliziter Orphan-Check.

### 2.5 CRUD-Lifecycle Diagramm

```
[User-Aktion]
     │
     ▼
layouts[] mutiert (ref)
     │
     ├─► persistLayouts() ────► localStorage['automation-one-dashboard-layouts']
     │
     └─► syncLayoutToServer(layoutId) [debounced 2000ms]
              │
              ├─ serverId vorhanden? → PUT /api/v1/dashboards/{serverId}
              └─ Kein serverId?      → POST /api/v1/dashboards
                                          │
                                     Response: layout.serverId = server-UUID
                                     persistLayouts() erneut

[Store-Init]
     loadLayouts() ─► localStorage (synchron, sofort)
     fetchLayouts() ─► GET /api/v1/dashboards (async, merged in layouts[])
```

---

## 3. Widget-System Anatomie

### 3.1 Widget-Typen (vollstaendige Liste)

| Typ | Label | Kategorie | Default w×h | Min w×h | Zeilen | Stores | Interaktion |
|-----|-------|-----------|-------------|---------|--------|--------|-------------|
| `line-chart` | Linien-Chart | Sensoren | 6×4 | 4×3 | 181 | espStore | Sensor-Select |
| `gauge` | Gauge-Chart | Sensoren | 3×3 | 2×3 | 116 | espStore | Sensor-Select |
| `sensor-card` | Sensor-Karte | Sensoren | 3×2 | 2×2 | 173 | espStore | Sensor-Select |
| `historical` | Historische Zeitreihe | Sensoren | 6×4 | 6×4 | 165 | espStore | Sensor-Select + TimeRange |
| `multi-sensor` | Multi-Sensor-Chart | Sensoren | 8×5 | 6×4 | 294 | espStore | Chips add/remove |
| `actuator-card` | Aktor-Status | Aktoren | 3×2 | 2×2 | 190 | espStore | **Power Toggle** |
| `actuator-runtime` | Aktor-Laufzeit | Aktoren | 4×3 | 3×3 | 199 | espStore | Display-only |
| `esp-health` | ESP-Health | System | 6×3 | 4×3 | 259 | espStore + router | Row-Klick → /hardware |
| `alarm-list` | Alarm-Liste | System | 4×4 | 4×4 | 323 | alertCenter + inbox + espStore | Klick → NotificationDrawer |

**Gesamt:** 9 Widget-Typen, ~2100 Zeilen Widget-Code.

### 3.2 Widget-Interface (TypeScript)

```typescript
interface DashboardWidget {
  id: string              // "widget-{timestamp}-{random4}"
  type: WidgetType        // 9 Typen (siehe oben)
  x: number               // Grid-Position (0-11)
  y: number               // Grid-Position (Zeile)
  w: number               // Breite in Spalten (1-12)
  h: number               // Hoehe in Zeilen
  config: {
    title?: string
    sensorId?: string     // "espId:gpio:sensorType"
    actuatorId?: string   // "espId:gpio"
    espId?: string
    gpio?: number
    sensorType?: string
    zoneId?: string
    timeRange?: '1h' | '6h' | '24h' | '7d'
    showThresholds?: boolean
    color?: string
    syncTimeAxis?: boolean
    dataSources?: string  // Komma-separiert fuer Multi-Sensor
    yMin?: number
    yMax?: number
    warnLow?: number
    warnHigh?: number
    alarmLow?: number
    alarmHigh?: number
    zoneFilter?: string | null
  }
}
```

### 3.3 Mount-Logik (useDashboardWidgets.ts)

**Strategie: `h()` + `render()` — NICHT `createApp()`.**

```
addWidget(type)
  ├─ Generate id + mountId
  ├─ grid.addWidget({w, h, minW, minH, id})  ← GridStack DOM-Element
  └─ nextTick():
      ├─ createWidgetElement(type, title, id, mountId)  ← DOM-Konstruktion
      │   ├─ div.dashboard-widget [data-type, data-widget-id]
      │   ├─   div.dashboard-widget__header (gs-drag-handle)
      │   │     ├─ span.title + span.type-badge
      │   │     └─ button.gear-btn (wenn showConfigButton)
      │   └─   div#${mountId}.dashboard-widget__vue-mount
      └─ mountWidgetComponent(id, mountId, type, config)
          ├─ Props aus config extrahiert (explizite Whitelist, kein Spread)
          ├─ vnode = h(WidgetComponent, props)
          ├─ vnode.appContext = capturedAppContext  ← KRITISCH fuer Pinia/Router
          └─ render(vnode, mountEl)
```

**Warum `h()` + `render()` statt `createApp()`:** Kein separater Vue-App-Instance pro Widget. `appContext` wird von `getCurrentInstance()` beim Setup des Composable captured — das injectet Pinia und Router in imperativ gemountete Widgets.

**Cleanup:** `render(null, mountEl)` triggert Vue's vollstaendigen Teardown (onUnmounted, Event-Listener-Cleanup, DOM-Subtree-Entfernung). `mountedWidgets.clear()` gibt Map-Referenzen frei.

### 3.4 Widget-Konfiguration

**WidgetConfigPanel.vue** (SlideOver, 487 Zeilen):
- Oeffnet sich bei Klick auf Gear-Button im Widget-Header
- Alle Aenderungen = sofort (kein "Speichern"-Button)
- Sensor/Aktor-Listen kommen aus `espStore.devices`
- Zone-Liste kommt aus `espStore.devices` (dedupliziert, nicht aus zoneStore)
- Auto-populate: Bei Sensor-Auswahl werden Thresholds aus `SENSOR_TYPE_CONFIG` vorbelegt (nur wenn noch nicht manuell gesetzt)

**Config-Update-Flow:**
```
User aendert Sensor → handleSensorChange() → emit('update:config')
  → CustomDashboardView.handleConfigUpdate()
    → widgetConfigs.set(widgetId, newConfig)
    → unmountWidgetFromElement(widgetId)    ← Altes Widget zerstoeren
    → mountWidgetComponent(id, mountId, type, newConfig)  ← Neu mounten
    → autoSave()
```

### 3.5 Widget-Daten

**Alle 9 Widgets lesen aus espStore.devices** (WebSocket-gefuettert). Kein Widget macht direkte API-Calls fuer Live-Daten. Historische Daten (HistoricalChartWidget, MultiSensorWidget) werden via Child-Komponenten (`HistoricalChart.vue`, `MultiSensorChart.vue`) per REST-API geladen.

---

## 4. GridStack-Integration

### 4.1 Initialisierung

```typescript
grid = GridStack.init({
  column: 12,           // 12-Spalten-Grid
  cellHeight: 80,       // Zeilenhoehe 80px
  margin: 8,            // 8px Abstand
  float: true,          // Freie Platzierung (kein Auto-Pack)
  animate: true,        // CSS-Transitions
  removable: true,      // Drag-to-Remove moeglich
  acceptWidgets: true,  // Externe HTML5-DnD-Drops
  handle: '.dashboard-widget__header',  // Drag-Handle = Widget-Header
}, gridContainer.value)
```

**Wann:** `onMounted()` und `onActivated()` (keep-alive). Guard: `if (!grid)` in onActivated.

### 4.2 Mode-Toggle

**KEIN `grid.setStatic()`.** Stattdessen drei separate API-Calls:

```typescript
// Edit-Modus AN:
grid.enableMove(true)
grid.enableResize(true)
grid.opts.removable = true
showCatalog.value = true  // Sidebar auto-oeffnen

// Edit-Modus AUS:
grid.enableMove(false)
grid.enableResize(false)
grid.opts.removable = false
showCatalog.value = false
configPanelOpen.value = false
```

**CSS-Klasse:** `.grid-stack--editing` wird via `:class` getoggelt:
- Gear-Button: `display: flex` (sonst `display: none`)
- Header: `cursor: move` (sonst `cursor: default`)
- Widget-Cell: `outline: 1px dashed rgba(96, 165, 250, 0.25)`

**isEditing-State:** Lokaler `ref<boolean>` in CustomDashboardView (NICHT im Store).

### 4.3 Serialisierung

**Wann:** Bei jedem `grid.on('change')`, `grid.on('removed')`, nach `addWidget()`, nach Config-Update.

**Format:** `grid.getGridItems()` → iteriert DOM-Elemente, liest `gridstackNode.{x,y,w,h}` + `data-*` Attribute + `widgetConfigs` Map → Array von `DashboardWidget`.

**Guard:** `isLoadingWidgets` Flag verhindert autoSave waehrend `loadWidgetsToGrid()` (grid.removeAll + grid.addWidget-Zyklen).

### 4.4 Widget-Hinzufuegen

```
Katalog-Button klick
  → addWidget(type)
    → grid.addWidget({w, h, minW, minH, id})  // GridStack DOM
    → nextTick:
       → createWidgetElement()   // Widget-HTML erstellen
       → mountWidgetComponent()  // Vue-Component mounten
    → autoSave()
```

### 4.5 Widget-Entfernen

```
grid.on('removed', (event, items) => {
  items.forEach(item => {
    unmountWidgetFromElement(item.id)  // render(null, el)
  })
  autoSave()
})
```

### 4.6 Resize-Handling

Widgets nutzen `height: 100%; display: flex; flex-direction: column` — sie fuellen die GridStack-Cell. Chart-Komponenten (Chart.js) haben interne Resize-Observer. Kein expliziter Debounce auf Resize-Events.

### 4.7 Cleanup

```typescript
onUnmounted(() => {
  cleanupAllWidgets()  // render(null) fuer alle mountedWidgets
  if (grid) {
    grid.destroy(false)  // false = DOM nicht entfernen (Vue managed)
    grid = null
  }
  dashStore.breadcrumb.dashboardName = ''
})
```

**Memory-Leak-Risiko:** Gering durch `render(null, el)` Cleanup. `grid.destroy(false)` entfernt GridStack-Event-Listener. `mountedWidgets.clear()` gibt Map-Referenzen frei.

---

## 5. Target/Placement-System

### 5.1 Dashboard-Scope

| Scope | Bedeutung | zoneId | Implementiert? |
|-------|-----------|--------|---------------|
| `zone` | Einer Zone zugeordnet | Ja (erforderlich) | Ja |
| `cross-zone` | Zonenuebergreifend | Nein | Ja |
| `sensor-detail` | Einem Sensor zugeordnet | Nein (sensorId stattdessen) | Ja |
| — (null) | Kein Scope | — | Ja (Default) |

**Scope wird gesetzt:** Im Target-Configurator Dropdown oder bei Auto-Generierung (`generateZoneDashboard` setzt `scope: 'zone'`).

### 5.2 Dashboard-Target Interface

```typescript
interface DashboardTarget {
  view: 'monitor' | 'hardware'                           // Welche View
  placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel'  // Wo platziert
  anchor?: string                                         // Anker (z.B. zone_id)
  panelPosition?: 'left' | 'right'                       // Fuer side-panel
  panelWidth?: number                                     // Panel-Breite in px
  order?: number                                          // Sortierrang
}
```

### 5.3 Target-Konfiguration im Editor

Der Target-Configurator (MapPin-Button in Toolbar) zeigt ein Dropdown mit Platzierungs-Optionen:
- Monitor — Inline (unter Zone-Tiles)
- Monitor — Seitenpanel
- Monitor — Unteres Panel
- Hardware — Seitenpanel
- Target entfernen

**Uniqueness-Enforcement:** `setLayoutTarget()` prueft ob der Slot (`view+placement`) bereits belegt ist. Bei Konflikt wird der bisherige Inhaber entfernt und synced.

**Zone-Scope-Selector:** Innerhalb des Target-Dropdowns gibt es eine Zone-Auswahl (`<select>` aus `espStore.devices`). Beim Setzen wird `scope: 'zone'` und `zoneId` gesetzt.

### 5.4 Computeds im Store (Filterung nach Target)

| Computed | Filter-Logik |
|----------|-------------|
| `inlineMonitorPanelsCrossZone` | target.view='monitor', placement='inline', scope!='zone' |
| `inlineMonitorPanelsForZone(zoneId)` | target.view='monitor', placement='inline', scope='zone', zoneId=zoneId |
| `sideMonitorPanels` | target.view='monitor', placement='side-panel' |
| `bottomMonitorPanels` | target.view='monitor', placement='bottom-panel' |
| `hardwarePanels` | target.view='hardware' |
| `crossZoneDashboards` | scope='cross-zone', target absent ODER target.view='monitor' |

---

## 6. Steuerungsmoeglichkeiten

### 6.1 ActuatorCardWidget (einziges interaktives Widget)

- **Toggle-Button:** `@click.stop="toggle"` → `espStore.sendActuatorCommand(espId, gpio, 'ON'|'OFF')`
- **API-Call:** Store-Action wrappt REST/MQTT (kein direkter API-Call im Widget)
- **Feedback:** Sofort via Store-Reaktivitaet (espStore.devices wird via WS aktualisiert)
- **Sicherheit:** **Keine Bestaetigung.** Kein "Pumpe wirklich einschalten?" Dialog. Toggle ist sofortig.
- **Abgrenzung:** Monitor-View nutzt `ActuatorCard.vue` (components/devices/) mit `mode='monitor'` — dort ist Toggle ausgeblendet (`v-if="mode !== 'monitor'"`). Dashboard-Widget hat **immer** Toggle.

### 6.2 Steuerungs-Dashboard-Template

**Existiert NICHT.** Keines der 4 Templates (`zone-overview`, `sensor-detail`, `multi-sensor-compare`, `empty`) enthaelt ActuatorCardWidgets.

**Was fehlt fuer UC-A:**
- Template "Steuerungspanel" mit: N × ActuatorCardWidget (alle Aktoren einer Zone) + 2-3 SensorCardWidgets als Kontext
- Template "Fertigation" mit: Pumpe + Ventile Cross-Zone

### 6.3 Gruppensteuerung

**Nicht implementiert.** Jeder Aktor wird einzeln pro Widget gesteuert. Kein "Alle Luefter aus"-Button.

### 6.4 Cross-Zone-Steuerung

**Ja, moeglich.** Ein Dashboard kann Aktoren aus verschiedenen Zonen enthalten (WidgetConfigPanel zeigt alle Aktoren aus allen Zonen). Es gibt keine Scope-Einschraenkung auf Widget-Ebene — nur auf Dashboard-Ebene (und das beeinflusst nur die Platzierung, nicht die Widget-Auswahl).

---

## 7. InlineDashboardPanel

### 7.1 Einsatzorte

| View | Position | Mode | Datenquelle |
|------|----------|------|-------------|
| MonitorView L1 | Unter Zone-Tiles | `inline` | `dashStore.inlineMonitorPanels` (Cross-Zone) |
| MonitorView L2 | Unter Zone-Dashboards | `inline` | `inlineMonitorPanelsL2` (Cross-Zone + Zone-spezifisch) |
| MonitorView L1+L2 | Unter main content | `inline` | `dashStore.bottomMonitorPanels` |
| MonitorView L1+L2 | Rechtes Seitenpanel | `side-panel` | `dashStore.sideMonitorPanels` |
| HardwareView | Rechtes Seitenpanel | `side-panel` | `dashStore.hardwarePanels` |

### 7.2 Rendering-Modus

**CSS-Grid (KEIN GridStack).** Zero-Overhead-Rendering ohne Drag/Resize-Listener.

```css
/* inline mode: */
grid-template-columns: repeat(12, 1fr);
grid-auto-rows: 80px;  /* ROW_HEIGHT_INLINE */

/* side-panel mode: */
grid-template-columns: 1fr;
grid-auto-rows: 120px; /* ROW_HEIGHT_SIDE */
```

Side-Panel: Alle Widgets volle Breite (`grid-column: 1 / -1`), vertikal gestapelt.

### 7.3 Widget-Interaktion

Widgets im InlineDashboardPanel sind **voll interaktiv** — sie nutzen `useDashboardWidgets({ showConfigButton: false, showWidgetHeader: false })`. Das bedeutet:
- **ActuatorCardWidget hat Toggle!** Das ist ein **Prinzipverstoss** — InlineDashboardPanel wird im Monitor gerendert (Read-Only-Kontext), aber Aktor-Toggles funktionieren trotzdem.
- SensorCardWidget zeigt Quality-Dot (display-only)
- ESPHealthWidget navigiert zu /hardware bei Klick
- AlarmListWidget oeffnet NotificationDrawer

### 7.4 Performance

Kein Performance-Limit implementiert. Theoretisch koennen N InlineDashboardPanels gleichzeitig gerendert werden. Jedes Panel mountet alle seine Widgets als separate Vue-vnodes. Bei 5 Zonen mit je einem Zone-Dashboard und 5 Widgets pro Dashboard = 25 Widget-Instanzen auf L1.

---

## 8. Auto-Generierung (generateZoneDashboard)

### 8.1 Trigger

**MonitorView L2:** Watcher auf `[selectedZoneId, espStore.devices.length]`:
- **Erstmalig:** Wenn keine Zone-Dashboards existieren UND Zone nicht in `generatedZoneDashboards` Set → `dashStore.generateZoneDashboard(zoneId, devices, zoneName)`
- **Update:** Wenn Auto-Dashboard existiert UND Widget-Count != Sensor+Aktor-Count → erneuter Aufruf (Update)

`generatedZoneDashboards` ist ein **lokaler** `ref<Set<string>>` in MonitorView (nicht im Store). Verhindert Re-Generierung bei Same-Session-Revisit.

### 8.2 Algorithmus

**Kategorisierung via `SENSOR_TYPE_CONFIG[type].category`:**

| Kategorie | Widget-Typ | Layout |
|-----------|-----------|--------|
| temperature, light | `line-chart` (24h) | w:12, h:3 (volle Breite, ein pro Sensor) |
| air, water, soil | `gauge` (1h) | w:6, h:2 (zwei pro Reihe) |
| other | `sensor-card` (1h) | w:6, h:2 (zwei pro Reihe) |
| Aktoren | `actuator-card` | w:4, h:2 (drei pro Reihe) |

**Layout-Berechnung:** Top-Down. Line-Charts oben (currentY += 3), dann Gauges (currentY += 2 pro 2er-Reihe), dann Sensor-Cards, dann Aktoren am Ende.

**Widget-Config enthaelt:** `espId`, `gpio`, `sensorId` als `{espId}:{gpio}`, `sensorType`, `zoneId`, `title`, `showThresholds: true`, `yMin/yMax` aus SENSOR_TYPE_CONFIG.

**Leere Zone:** Gibt `null` zurueck. View prueft und fuegt nicht zum Set hinzu.

### 8.3 Auto-Badge

- `autoGenerated: boolean` auf DashboardLayout
- DashboardViewer zeigt Banner: "Automatisch generiertes Dashboard" + "Uebernehmen" + "Anpassen" Buttons
- MonitorView Dashboard-Chips zeigen `[Auto]` Badge

### 8.4 Update-Verhalten

**Automatisch:** Wenn Sensor/Aktor-Count sich aendert (Watcher-Check: `widgets.length !== totalSensors + totalActuators`), wird `generateZoneDashboard()` erneut aufgerufen → Widgets werden komplett neu berechnet.

**ABER:** Update-Pfad ruft `persistLayouts()` auf, aber **NICHT `syncLayoutToServer()`**. Server-Copy bleibt veraltet bis zum naechsten manuellen Save.

### 8.5 Uebernahme-Flow (claimAutoLayout)

1. User klickt "Anpassen" in DashboardViewer oder MonitorView
2. `dashStore.claimAutoLayout(layoutId)` → setzt `autoGenerated: false`
3. `persistLayouts()` (localStorage) — aber **KEIN** `syncLayoutToServer()`
4. Navigation zum Editor: `router.push({ name: 'editor-dashboard', params: { dashboardId: layoutId } })`
5. Dashboard ist jetzt user-owned und wird nicht mehr automatisch ueberschrieben

**Luecke:** `claimAutoLayout` synced nicht zum Server. Bei `fetchLayouts()` koennte der Server die alte Version mit `auto_generated: true` zurueckliefern und den Claim-State ueberschreiben.

---

## 9. Use-Case-Bewertung

### UC-A: Gewaechshaus-Betreiber (3 Zonen, 15 Sensoren, 5 Aktoren)

| Anforderung | Status | Details |
|-------------|--------|---------|
| Steuerungs-Dashboard | Manuell moeglich | User muss 5× ActuatorCardWidget manuell hinzufuegen, kein Template |
| Uebersichts-Dashboard | Ja (multi-sensor Template) | Template "Multi-Sensor-Vergleich" vorhanden |
| Template-Katalog | Teilweise | 4 generische Templates, kein "Steuerungspanel" |

**Fehlt:** Template "Steuerungspanel" mit Zone-Aktoren + Kontext-Sensoren. Aktuell muss der User jeden Aktor einzeln als Widget hinzufuegen und konfigurieren.

### UC-B: Fertigation-Setup (Technikzone + 3 Pflanzen-Zonen)

| Anforderung | Status | Details |
|-------------|--------|---------|
| Pumpe in Cross-Zone-Dashboard | Ja | Widget-Konfiguration erlaubt Geraete aus allen Zonen |
| pH/EC KPI-Referenz | Teilweise | SensorCardWidget kann Sensor aus anderer Zone zeigen, aber kein "Referenz"-Badge |
| Ventilmatrix-Dashboard | Manuell moeglich | Kein dediziertes Layout, User muss 3 ActuatorCards + 1 Pumpe platzieren |

**Fehlt:** Zone-Gruppierung in Widgets (visuell Zonen trennen). KPI-Referenz-Widget das zeigt "Wert aus Technikzone".

### UC-C: Klimazone (4 Temp/Hum, 2 Luefter, 1 Befeuchter)

| Anforderung | Status | Details |
|-------------|--------|---------|
| multi_zone Befeuchter Widget | Teilweise | ActuatorCardWidget zeigt den Aktor, aber NICHT welche Subzones er bedient |
| Regel-Verknuepfung | Nein | Kein Widget zeigt verknuepfte Rules (logicStore nicht genutzt) |
| 4-Sensor-Vergleich | Ja | MultiSensorWidget mit dataSources |

**Fehlt:** Scope-Badge auf ActuatorCardWidget (welche Zones/Subzones). Linked-Rules-Anzeige in Widgets.

### UC-D: Mobiler Forscher (1 mobiler pH-Sensor, 4 Zonen)

| Anforderung | Status | Details |
|-------------|--------|---------|
| Mobiler Sensor in Zone-Dashboard | Ja (technisch) | Auto-Generierung bezieht alle Sensoren der Zone ein |
| "Mobil"-Hinweis in Widget-Auswahl | Nein | WidgetConfigPanel zeigt `espId:gpio:type` ohne Scope-Info |
| "Zeigt Daten nur wenn aktiv" | Nein | Kein Liveness-Check in Widgets |

**Fehlt:** Scope-Badge ("Mobil") in Widget-Sensor-Auswahl. Liveness-Indikator fuer mobile Sensoren.

### UC-E: Wissenschaftliches Projekt (6 Zonen, nur Sensoren)

| Anforderung | Status | Details |
|-------------|--------|---------|
| Vergleichs-Dashboards | Ja | Multi-Sensor-Widget cross-zone |
| Auto-Generierung ohne Aktoren | Teilweise | Algorithmus erzeugt keine Aktor-Widgets bei leerer Aktor-Liste, ABER kein Test ob leeres Widget erzeugt wird |
| Kein "Steuerungs"-Noise | Ok | Ohne Aktoren erscheint kein ActuatorCardWidget |

**Funktioniert** weitgehend. Einzige Luecke: Auto-Generierung wurde nicht explizit fuer Aktor-freie Zonen getestet.

---

## 10. Aenderungsbedarf (kategorisiert)

### KRITISCH (Prinzipverstoss)

| ID | Problem | Ort | Impact |
|----|---------|-----|--------|
| **K1** | ActuatorCardWidget Toggle in InlineDashboardPanel im Monitor-Kontext | InlineDashboardPanel rendert Widgets mit vollem Toggle | Monitor = Read-Only Prinzip verletzt |
| **K2** | `claimAutoLayout()` synced nicht zum Server | dashboard.store.ts | Claim-State geht bei fetchLayouts() verloren |
| **K3** | `generateZoneDashboard()` Update synced nicht zum Server | dashboard.store.ts | Server hat veraltete Widget-Liste |

### HOCH (Funktionale Luecke)

| ID | Problem | Impact |
|----|---------|--------|
| **H1** | Kein Steuerungs-Template (UC-A) | User muss jeden Aktor manuell als Widget konfigurieren |
| **H2** | Kein Dirty-State-Indikator | User weiss nicht ob Aenderungen gespeichert sind |
| **H3** | Kein Scope-Badge in Widgets | multi_zone/mobile Geraete nicht erkennbar in Dashboard-Kontext |
| **H4** | Keine Confirmation bei Aktor-Toggle | Sicherheitsrisiko bei kritischen Aktoren (Pumpe) |
| **H5** | Keine Rule-Verknuepfung in Widgets | Aktoren zeigen nicht welche Regeln sie steuern |

### MITTEL (UX-Verbesserung)

| ID | Problem | Impact |
|----|---------|--------|
| **M1** | Zone-Liste in WidgetConfigPanel aus espStore statt zoneStore | Leere Zonen (ohne Devices) fehlen |
| **M2** | Sensor-ID-Format `espId:gpio:type` in Dropdown | Unverstaendlich fuer Endnutzer |
| **M3** | Kein "Mobil"-Hinweis in Sensor-Auswahl | UC-D nicht unterstuetzt |
| **M4** | InlineDashboardPanel kein Performance-Limit | Theoretisch unbegrenzt Panels gleichzeitig |
| **M5** | Dashboard-Orphan nach Delete | Kein Check ob InlineDashboardPanels referenziert werden |

### NIEDRIG (Konsistenz)

| ID | Problem |
|----|---------|
| **N1** | `isEditing` nur als lokaler ref, nicht im Store — bei Tab-Wechsel (keep-alive) bleibt Modus erhalten, aber Breadcrumb zeigt keinen Edit-State |
| **N2** | WidgetWrapper.vue (138 Zeilen) existiert, wird aber nur als Header-Scaffold genutzt — nicht als Container |
| **N3** | 2 Legacy-Widgets (DeviceStatusWidget, SensorOverviewWidget) in components/widgets/ — unklar ob noch genutzt |

---

## 11. Abhaengigkeiten Editor <-> Monitor L1 <-> Monitor L2 <-> Logic <-> Hardware

### 11.1 Dependency-Matrix

| Komponente | dashStore | espStore | logicStore | zoneStore | -> /editor | -> /monitor |
|------------|-----------|----------|------------|-----------|-----------|-------------|
| CustomDashboardView | **W** (layouts, target, breadcrumb) | **R** (devices→zones) | — | — | — | router-link |
| MonitorView | **W** (breadcrumb, generateZone, claim) | **R+W** (fetchAll) | **R** (rules, history) | **R** | router-link (4x) | — |
| HardwareView | **W** (breadcrumb, modals) | **R** (primary) | **R** | **R** | — | — |
| InlineDashboardPanel | **R** (getLayoutById) | indirekt (Widgets) | — | — | router-link | — |
| DashboardViewer | **R** (getLayoutById, claim) | indirekt (Widgets) | — | — | router-link (2x) | — |
| Alle 9 Widgets | — | **R** (devices) | — | — | — | — |
| ActuatorCardWidget | — | **R+W** (toggle!) | — | — | — | — |
| ESPHealthWidget | — | **R** | — | — | — | router.push(/hardware) |

**Legende:** W = Schreiben, R = Lesen

### 11.2 Editor <-> Monitor L1

| Abhaengigkeit | Richtung | Mechanismus |
|---------------|----------|-------------|
| Cross-Zone-Dashboards als Chips | Editor → L1 | `dashStore.crossZoneDashboards` |
| InlineDashboardPanels (Cross-Zone) | Editor → L1 | `dashStore.inlineMonitorPanels` |
| Side/Bottom Panels | Editor → L1 | `dashStore.sideMonitorPanels/bottomMonitorPanels` |
| "Im Editor bearbeiten" Link | L1 → Editor | `router-link { name: 'editor-dashboard' }` |
| "+" Neues Dashboard Link | L1 → Editor | `router-link { name: 'editor' }` |
| Shared breadcrumb | Bidirektional | `dashStore.breadcrumb` |

### 11.3 Editor <-> Monitor L2

| Abhaengigkeit | Richtung | Mechanismus |
|---------------|----------|-------------|
| Zone-Dashboards | Editor → L2 | `dashStore.zoneDashboards(zoneId)` |
| InlineDashboardPanels (Zone-spezifisch) | Editor → L2 | `dashStore.inlineMonitorPanelsForZone(zoneId)` |
| Auto-Generierung Trigger | L2 → Store | `dashStore.generateZoneDashboard()` |
| Claim Auto-Layout | L2 → Store → Editor | `dashStore.claimAutoLayout()` + router.push /editor |
| DashboardViewer (L3) | L2 → Viewer → Editor | `router-link { name: 'editor-dashboard' }` |

### 11.4 Editor <-> Logic Engine

**Keine direkte Verbindung.** `logicStore` wird weder in CustomDashboardView noch in einem Widget importiert. Es gibt kein "Linked Rules Widget" im Katalog.

Die Rule→Actuator-Verknuepfung existiert nur in:
- MonitorView L2: `ActuatorCard` (components/devices/) mit Props `linkedRules` und `lastExecution`
- HardwareView: `LinkedRulesSection` in DeviceDetailView

### 11.5 Editor <-> Hardware-View

| Abhaengigkeit | Richtung | Mechanismus |
|---------------|----------|-------------|
| Device-Daten | Hardware → Editor (indirekt) | Beide nutzen `espStore.devices` |
| Hardware-Panels | Editor → Hardware | `dashStore.hardwarePanels` |
| ESPHealthWidget Navigation | Widget → Hardware | `router.push('/hardware?openSettings=...')` |

---

## 12. Shared Components Inventar

### 12.1 NICHT geteilt (separate Implementierungen)

| Konzept | Monitor (components/devices/) | Editor (dashboard-widgets/) | Unterschied |
|---------|-------------------------------|---------------------------|-------------|
| Sensor-Anzeige | `SensorCard.vue` (mode='monitor') | `SensorCardWidget.vue` | Monitor: Stale/Offline-Badges, Trend-Pfeil, Sparkline. Widget: Sensor-Select, Store-basierter Lookup |
| Aktor-Anzeige | `ActuatorCard.vue` (mode='monitor', kein Toggle) | `ActuatorCardWidget.vue` (MIT Toggle) | Monitor: Read-Only, linkedRules, lastExecution. Widget: Toggle, Select |

**Keine Code-Duplikation** — die Widgets und Monitor-Cards sind bewusst getrennte Implementierungen mit unterschiedlichen Anforderungen.

### 12.2 Geteilt (echte Shared Components)

| Komponente | Genutzt von |
|------------|-------------|
| `LiveLineChart.vue` | LineChartWidget (Editor), MonitorView L2 (#sparkline Slot), MonitorView L3 (Detail) |
| `GaugeChart.vue` | GaugeWidget (Editor), DeviceStatusWidget (Legacy) |
| `HistoricalChart.vue` | HistoricalChartWidget (Editor) — MonitorView nutzt eigenen Chart.js-Instanz |
| `MultiSensorChart.vue` | MultiSensorWidget (Editor) — nicht in MonitorView |

### 12.3 Shared Stores

| Store | Editor | Monitor | Hardware | Logic |
|-------|--------|---------|----------|-------|
| `dashStore` | Primary (CRUD) | Read + Auto-Gen + Claim | Read (Panels) + Write (Breadcrumb) | Write (Breadcrumb) |
| `espStore` | Read (Zones) + Widgets | Read (Primary) | Read+Write (Primary) | — |
| `logicStore` | — | Read (Rules) | Read (LinkedRules) | Write (Primary) |
| `zoneStore` | — | Read (ZoneEntities) | Read (ZoneEntities) | — |
| `alertCenterStore` | AlarmListWidget | — | — | — |
| `notificationInboxStore` | AlarmListWidget | — | — | — |

### 12.4 Shared Rendering Layer

`useDashboardWidgets.ts` ist der **einzige** Shared Rendering-Code zwischen Editor, Viewer und InlineDashboardPanel. Die 3 Container unterscheiden sich nur in den Optionen:

| Container | showConfigButton | showWidgetHeader |
|-----------|-----------------|-----------------|
| CustomDashboardView | `true` | `true` |
| DashboardViewer | `false` | implizit `true` (Header wird per CSS `:deep` versteckt) |
| InlineDashboardPanel | `false` | `false` |

---

## 13. Offene Fragen

1. **K1 Loesung:** Soll InlineDashboardPanel einen `readOnly` Prop bekommen der Toggle in ActuatorCardWidget deaktiviert? Oder soll ActuatorCardWidget selbst erkennen in welchem Kontext es laeuft?

2. **Template-Erweiterung:** Sollen Use-Case-spezifische Templates (Steuerung, Fertigation, Klima) als statische `DASHBOARD_TEMPLATES` oder als dynamisch generierte Vorschlaege basierend auf vorhandenen Geraeten implementiert werden?

3. **Zone-Quelle:** Soll WidgetConfigPanel Zonen aus `zoneStore.activeZones` (DB-backed, inkl. leere) statt `espStore.devices` (nur Zonen mit Devices) beziehen?

4. **Linked-Rules-Widget:** Soll ein neuer Widget-Typ "Aktor + Rules" entstehen der ActuatorCardWidget mit logicStore-Integration kombiniert? Oder reicht ein "Rule-Status" eigenstaendiges Widget?

5. **Legacy-Widgets:** Werden `DeviceStatusWidget.vue` und `SensorOverviewWidget.vue` (components/widgets/) noch irgendwo genutzt oder koennen sie entfernt werden?

6. **claimAutoLayout Sync:** Soll `claimAutoLayout()` sofort `syncLayoutToServer()` aufrufen um Server-Client-Divergenz zu verhindern?

7. **Performance-Budget:** Wie viele InlineDashboardPanels sollen maximal gleichzeitig gerendert werden? Soll ein Lazy-Loading oder Virtualisierungs-Mechanismus eingefuehrt werden?

---

## Server API Referenz (Blackbox)

| Methode | URL | Body | Antwort |
|---------|-----|------|---------|
| GET | `/api/v1/dashboards?page=&page_size=` | — | `DashboardListResponse` (paginated) |
| GET | `/api/v1/dashboards/{id}` | — | `DashboardDataResponse` |
| POST | `/api/v1/dashboards` | `DashboardCreate` | `DashboardDataResponse` (201) |
| PUT | `/api/v1/dashboards/{id}` | `DashboardUpdate` | `DashboardDataResponse` |
| DELETE | `/api/v1/dashboards/{id}` | — | `DashboardDataResponse` |

**DB-Tabelle `dashboards`:** UUID PK, name, description, owner_id (FK), is_shared, widgets (JSON), scope, zone_id, auto_generated, sensor_id, target (JSON, nullable), created_at, updated_at.

**Indizes:** `idx_dashboard_owner`, `idx_dashboard_shared`, `idx_dashboard_scope_zone`.

**Hinweis:** `target` ist ein freies JSON-Feld ohne Server-seitige Schema-Validierung. Der Server speichert jeden gueltigen JSON-Wert.
