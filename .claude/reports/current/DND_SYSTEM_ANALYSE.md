# DnD System-Analyse — El Frontend

> **Erstellt:** 2026-02-25
> **Agent:** Claude Opus 4.6 (Code-Analyse, kein Code geändert)
> **Scope:** Vollständiges Inventar aller Drag-and-Drop-Bereiche im El Frontend

---

## 1. Executive Summary

- **DnD-Bereiche bestätigt:** 9 (D1–D9), davon 7 bekannte + 2 neu gefundene
- **DnD-Libraries im Einsatz:** 3 (vue-draggable-plus, GridStack.js, @vue-flow/core)
- **Gesamtbewertung: Hybrid — gut strukturiert, aber fragmentiert**
- **Zentraler DnD-Store:** `dragState.store.ts` (448 Zeilen) — deckt D1, D2, D8 ab, NICHT D3–D7

### Top 3 Stärken
1. **Robuster zentraler Store** — Safety-Timeouts (30s), globaler dragend-Listener, Escape-Cancel, Debug-Statistiken, HMR-safe Listener-Management
2. **VueDraggable-Integration gut gelöst** — force-fallback verhindert Interferenz mit nativen Drags, @choose/@unchoose/@start/@end korrekt verkettet
3. **Saubere Separation der DnD-Bereiche** — Jeder Bereich nutzt die passende Library für seinen Use-Case, keine erzwungene Einheitslösung

### Top 3 Probleme
1. **CustomDashboardView (D3): Kein DnD aus Katalog** — Widgets werden per Click hinzugefügt, nicht per Drag. GridStack `acceptWidgets: true` ist konfiguriert, aber kein Drag-Source implementiert
2. **UnassignedDropBar (D1b): @change statt @add** — Nutzt `@change="handleDragAdd"` wobei der Handler `event.added.element` erwartet, SortableJS liefert aber bei @change ein anderes Format als bei @add
3. **Kein Touch-Delay** — VueDraggable hat `touch-start-threshold: 5` (nur 5px), aber `delay: 0` — auf Touch-Geräten könnte versehentlich ein Drag starten

---

## 2. Installierte DnD-Libraries

| Library | Version | Verwendet in | Wrapper/Composable |
|---------|---------|--------------|-------------------|
| `vue-draggable-plus` | ^0.6.0 | ZoneGroup, ZonePlate, UnassignedDropBar | Direkt als `<VueDraggable>` Komponente |
| `gridstack` | ^12.4.2 | CustomDashboardView | Direkt als `GridStack.init()` |
| `@vue-flow/core` | ^1.48.2 | RuleFlowEditor | Via `useVueFlow()` Composable |
| `@vue-flow/background` | ^1.3.2 | RuleFlowEditor | Als `<Background>` Komponente |
| `@vue-flow/controls` | ^1.1.3 | RuleFlowEditor | Als `<Controls>` Komponente |
| `@vue-flow/minimap` | ^1.5.4 | RuleFlowEditor | Als `<MiniMap>` Komponente |

### NICHT installiert (Abwesenheit bestätigt)
- `@dnd-kit/*` — nicht in package.json, nicht in node_modules
- `interactjs` — nicht installiert
- `dragula` — nicht installiert
- `sortablejs` (standalone) — nicht direkt installiert, kommt als Dependency von vue-draggable-plus

### Native HTML5 DnD API
Direkt verwendet in 8 Dateien als Drag-Sources und Drop-Targets (siehe Abschnitt 5).

---

## 3. Zentraler DnD-State (dragState.store.ts)

**Pfad:** `El Frontend/src/shared/stores/dragState.store.ts`
**Zeilen:** 448
**Version:** 2.0 (Industrial-Grade mit Safety-Cleanup)

### State-Felder

| Feld | Typ | Zweck |
|------|-----|-------|
| `isDraggingSensorType` | `ref<boolean>` | Sensor-Typ aus Sidebar wird gedraggt |
| `sensorTypePayload` | `ref<SensorTypeDragPayload \| null>` | Payload mit sensorType, label, unit, icon |
| `isDraggingSensor` | `ref<boolean>` | Sensor-Satellite für Chart wird gedraggt |
| `sensorPayload` | `ref<SensorDragPayload \| null>` | Payload mit espId, gpio, sensorType, name, unit |
| `draggingSensorEspId` | `ref<string \| null>` | ESP-ID des gedraggten Sensors (für Auto-Open) |
| `isDraggingEspCard` | `ref<boolean>` | ESP-Card wird zwischen Zonen gedraggt (VueDraggable) |
| `isDraggingActuatorType` | `ref<boolean>` | Actuator-Typ aus Sidebar wird gedraggt |
| `actuatorTypePayload` | `ref<ActuatorTypeDragPayload \| null>` | Payload mit actuatorType, label, icon, isPwm |
| `dragStartTime` | `ref<number \| null>` | Zeitstempel für Timeout-Detection |
| `stats` | `ref<DragStats>` | startCount, endCount, timeoutCount, lastDragDuration |

### Computed
- `isAnyDragActive` — OR über alle 4 isDragging-Flags
- `currentDragDuration` — Differenz zu dragStartTime

### Actions
| Action | Funktion |
|--------|----------|
| `startSensorTypeDrag(payload)` | Sidebar → ESP: Setzt isDraggingSensorType + Payload + Safety-Timeout |
| `startActuatorTypeDrag(payload)` | Sidebar → ESP: Setzt isDraggingActuatorType + Payload + Safety-Timeout |
| `startSensorDrag(payload)` | Satellite → Chart: Setzt isDraggingSensor + Payload + Safety-Timeout |
| `startEspCardDrag()` | ESP-Card → Zone: Setzt isDraggingEspCard + Safety-Timeout |
| `endEspCardDrag()` | Cleanup nur für ESP-Card-Drag (spezifisch, nicht generisch) |
| `endDrag()` | Generischer Reset aller Flags + Payloads |
| `forceReset()` | Manueller Reset (Alias für endDrag) |
| `cleanup()` | Entfernt globale Event-Listener (für HMR/Tests) |

### Safety-Mechanismen
1. **Timeout:** 30s Safety-Timer — resettet automatisch bei hängendem State
2. **Globaler dragend-Listener:** Capture-Phase auf `window`, nur für native Drags (nicht VueDraggable)
3. **Escape-Handler:** Keydown auf `window`, beendet jeden aktiven Drag
4. **Vorheriger-Drag-Reset:** Jede startX-Methode prüft `isAnyDragActive` und resettet ggf.
5. **HMR-Safe:** `listenersRegistered` Flag verhindert Duplikate, `cleanup()` exportiert

### Store-Nutzung nach Bereich

| Bereich | Nutzt dragState.store? | Wie? |
|---------|----------------------|------|
| D1: Zone-Assignment (ZoneGroup, ZonePlate) | **JA** | startEspCardDrag/endEspCardDrag |
| D1b: UnassignedDropBar | **JA** | Liest isAnyDragActive für Styling |
| D2: Sensor/Actuator → ESP (ComponentSidebar) | **JA** | startSensorTypeDrag/startActuatorTypeDrag |
| D2: Drop auf ESP (ESPOrbitalLayout) | **JA** | Liest isDraggingSensorType/isDraggingActuatorType |
| D3-D5: CustomDashboard (GridStack) | **NEIN** | GridStack hat eigenen State |
| D6-D7: Logic Rule Builder (Vue Flow) | **NEIN** | Vue Flow hat eigenen State |
| D8: Sensor → Chart (SensorSatellite) | **JA** | startSensorDrag |
| D8: Drop auf Chart (AnalysisDropZone) | **Indirekt** | Liest via dataTransfer, nicht via Store |
| D9: EventDetailsPanel (Touch-Swipe) | **NEIN** | Eigener isDragging ref |

---

## 4. DnD-Composables und Utilities

### useZoneDragDrop.ts
**Pfad:** `El Frontend/src/composables/useZoneDragDrop.ts`
**Zeilen:** 512
**Nutzer:** DashboardView (via ZoneGroup, ZonePlate, UnassignedDropBar), ESPOrbitalLayout

**Funktion:** Handles Zone-Assignment API-Calls nach Drop:
- `handleDeviceDrop(event)` — Weist ESP einer Zone zu (POST /api/v1/zones/assign)
- `handleRemoveFromZone(device)` — Entfernt ESP aus Zone (DELETE /api/v1/zones/remove)
- `undo()` / `redo()` — Undo/Redo Stack (max 20 Einträge)
- `groupDevicesByZone(devices)` — Gruppiert Devices nach Zone
- `ZONE_UNASSIGNED` — Konstante für unzugewiesene Geräte

**Greift NICHT auf dragState.store.ts zu** — reiner API/Store-Handler, kein DnD-State.

### Weitere DnD-relevante Composables
- **useDeviceActions** — In ESPOrbitalLayout für Device-Aktionen, nicht DnD-spezifisch
- **useGpioStatus** — GPIO-Status für dynamische Auswahl, nicht DnD-spezifisch

### Keine weiteren DnD-Composables gefunden
Es gibt KEIN generisches `useDragDrop.ts` Composable. Jeder DnD-Bereich implementiert seine Handler inline in der Komponente.

---

## 5. DnD-Bereiche im Detail

### D1: ESP Zone-Assignment (Level 1)

**View/Route:** DashboardView (`/`), Level 1 (Zone Overview)
**Komponenten:**
- `ZonePlate.vue` — Drop-Target (Zone-Kachel auf Übersichtsebene)
- `ZoneGroup.vue` — Drop-Target (Zone-Container auf Detail-Ebene, Level 2)
- `UnassignedDropBar.vue` — Drop-Target (Bottom-Tray für unzugewiesene ESPs)

**DnD-Library:** vue-draggable-plus (`<VueDraggable>`)
**Store-Anbindung:** dragState.store.ts (isDraggingEspCard)

**Drag-Source:**
- Datei: ZonePlate.vue:320–356, ZoneGroup.vue:439–510
- Element: ESP-Card (DeviceMiniCard / ESPCard)
- Trigger: VueDraggable mit `handle=".esp-drag-handle"`, `force-fallback="true"`
- Payload: DOM `data-device-id` Attribut (gelesen in @add Handler)

**Drop-Target:**
- Datei: ZonePlate.vue:320 (`<VueDraggable group="esp-devices">`)
- Datei: ZoneGroup.vue:439 (`<VueDraggable group="esp-devices">`)
- Datei: UnassignedDropBar.vue:189 (`<VueDraggable group="esp-devices">`)
- Handler: `@add` (ZonePlate, ZoneGroup), `@change` (UnassignedDropBar)
- Aktion nach Drop: API-Call via useZoneDragDrop → espStore.fetchAll()

**Visuelles Feedback:**
- Drag-Ghost: `ghost-class="zone-item--ghost"` (opacity 0.4, scale 1.05, dashed border)
- Chosen-Class: `zone-item--chosen` (scale 1.02, enhanced shadow)
- Fallback-Class: `zone-item--fallback` (scale 1.02, iridescent border, fit-content width)
- Drop-Zone-Highlighting: Ja — `zone-group--drag-over` (pulsing blue border, glow)
- ZonePlate: `zone-plate--drop-target` (iridescent border glow)
- UnassignedDropBar: Glow-Sweep-Animation auf drag-over
- Cancel-Feedback: State reset via @end/@unchoose

**State-Lifecycle:**
1. **Drag Start (@choose):** dragStore.startEspCardDrag() → isDraggingEspCard = true
2. **Drag Start (@start):** Bestätigt State, setzt dragStarted flag
3. **Drag Over:** Container-level dragenter/dragleave mit Counter für nested events
4. **Drop (@add):** Liest data-device-id aus DOM, emittiert device-dropped, Parent ruft API
5. **Cancel (@unchoose ohne @start):** dragStore.endEspCardDrag()
6. **End (@end):** dragStore.endEspCardDrag(), isDragOver reset

**Funktionsstatus:**
- [x] Drag startet korrekt (via @choose → force-fallback Mouse Events)
- [x] Drop funktioniert am richtigen Target (group="esp-devices")
- [x] Payload kommt vollständig an (data-device-id)
- [x] API/Store-Aktion wird korrekt ausgeführt (zonesApi + fetchAll)
- [x] Visuelles Feedback vorhanden (Ghost, Chosen, Fallback, Drop-Zone-Glow)
- [x] State wird nach Drop/Cancel aufgeräumt
- [ ] Touch-Support: threshold=5px, delay=0 — funktional aber kein Touch-Delay
- [x] Undo/Redo über useZoneDragDrop (max 20 Einträge)

**Bekannte Bugs/Probleme:**
- **UnassignedDropBar** nutzt `@change` statt `@add` — der Handler erwartet `event.added.element`, was bei @change ein anderes Format hat als bei @add. Könnte je nach vue-draggable-plus Version fehlschlagen.
- ZonePlate hat keinen `@unchoose` Handler — State-Cleanup nur über @end.

**Code-Qualität:** Akzeptabel — gut dokumentierte VueDraggable-Konfiguration, force-fallback korrekt motiviert.

---

### D2: Sensor/Actuator von Sidebar auf ESP (Level 3)

**View/Route:** DashboardView (`/`), Level 2/3 (Zone → ESP-Detail)
**Komponenten:**
- `ComponentSidebar.vue` — Drag-Source (kombinierte Sensor+Aktor-Sidebar)
- `SensorSidebar.vue` — Drag-Source (reine Sensor-Sidebar, Legacy)
- `ActuatorSidebar.vue` — Drag-Source (reine Aktor-Sidebar, Legacy)
- `ESPOrbitalLayout.vue` — Drop-Target (ESP-Card Container)
- `AddSensorModal.vue` — Modal nach Sensor-Drop
- `AddActuatorModal.vue` — Modal nach Actuator-Drop

**DnD-Library:** Native HTML5 DnD API (`draggable="true"`, dataTransfer)
**Store-Anbindung:** dragState.store.ts (startSensorTypeDrag/startActuatorTypeDrag)

**Drag-Source:**
- Datei: ComponentSidebar.vue:240–242
- Element: Sensor-Typ oder Aktor-Typ Item in der Sidebar
- Trigger: `draggable="true"` + `@dragstart` + `@dragend`
- Payload (Sensor): `{ action: 'add-sensor', sensorType, label, defaultUnit, icon }`
- Payload (Actuator): `{ action: 'add-actuator', actuatorType, label, icon, isPwm }`
- DataTransfer: `application/json` (Hauptdaten) + `text/plain` (Fallback)

**Drop-Target:**
- Datei: ESPOrbitalLayout.vue:435–438
- Element: ESP-Horizontal-Layout Container
- Handler: `@dragenter`, `@dragover`, `@dragleave`, `@drop`
- Aktion nach Drop: Parsed JSON, öffnet AddSensorModal oder AddActuatorModal

**Visuelles Feedback:**
- Drag-Ghost: Standard-Browser (kein Custom-Ghost)
- Drop-Zone-Highlighting: Ja — `esp-horizontal-layout--drag-over` + Drop-Indicator-Overlay
- Drop-Indicator: Text "Sensor hinzufügen" / "Aktor hinzufügen" als Overlay
- Sidebar-Item: `component-item--dragging` (opacity 0.7, glow)
- Cancel-Feedback: dragStore.endDrag() via @dragend auf Source

**State-Lifecycle:**
1. **Drag Start:** ComponentSidebar ruft dragStore.startSensorTypeDrag/startActuatorTypeDrag
2. **Drag Over:** ESPOrbitalLayout prüft Store-Flags, ignoriert VueDraggable-Events
3. **Drop:** ESPOrbitalLayout parsed dataTransfer JSON, öffnet Modal
4. **Cancel/End:** ComponentSidebar @dragend → dragStore.endDrag()
5. **Safety:** Globaler dragend-Listener als Fallback, 30s Timeout

**Funktionsstatus:**
- [x] Drag startet korrekt (draggable="true" + dataTransfer.setData)
- [x] Drop funktioniert am richtigen Target
- [x] Payload kommt vollständig an (application/json parsed)
- [x] API/Store-Aktion wird korrekt ausgeführt (Modal öffnet, Modal ruft API)
- [x] Visuelles Feedback vorhanden (Sidebar-Glow, ESP-Border, Drop-Text-Overlay)
- [x] State wird nach Drop/Cancel aufgeräumt
- [ ] Touch-Support: Native HTML5 DnD — auf mobilen Browsern NICHT unterstützt

**Bekannte Bugs/Probleme:**
- **3 Sidebar-Varianten koexistieren:** ComponentSidebar (neu, kombiniert), SensorSidebar (Legacy), ActuatorSidebar (Legacy). Alle 3 implementieren identische DnD-Logik mit leicht unterschiedlichem Code. Duplikation.
- Kein Custom-Drag-Ghost — Browser-Default ist auf manchen Systemen hässlich
- Modal-Reset: droppedSensorType wird auf null gesetzt wenn Modal schließt (korrekt)

**Code-Qualität:** Akzeptabel — VueDraggable-Interferenz sauber gelöst (Store-Flag-Check in jedem Handler).

---

### D3: Widget auf Custom Dashboard platzieren

**View/Route:** CustomDashboardView (`/custom-dashboard`)
**Komponenten:**
- `CustomDashboardView.vue` — Grid-Area + Widget-Katalog

**DnD-Library:** GridStack.js (`GridStack.init()`)
**Store-Anbindung:** dashboard.store.ts (NICHT dragState.store.ts)

**Drag-Source:**
- Datei: CustomDashboardView.vue:476–483
- Element: Katalog-Buttons in der Sidebar
- Trigger: **KEIN DRAG — nur Click!** `@click="addWidget(widget.type)"`
- Payload: Widget-Typ (string)

**Drop-Target:**
- GridStack grid (`acceptWidgets: true` konfiguriert)
- Allerdings: Kein externer Drag-Source vorhanden der die Widgets liefert

**Visuelles Feedback:**
- Widget wird per Click an nächster freier Position eingefügt
- GridStack bietet eigene Drag-/Resize-Handles nach Platzierung

**State-Lifecycle:**
1. **Click:** `addWidget(type)` → `grid.addWidget({...})` → DOM-Injection + Vue-Mount
2. **Kein DnD-Lifecycle für Hinzufügen**

**Funktionsstatus:**
- [ ] Drag startet korrekt — **KEIN DRAG implementiert, nur Click**
- [x] Widget wird erstellt (per Click)
- [x] Payload korrekt (Widget-Typ + Default-Config)
- [x] Store-Aktion korrekt (autoSave nach Änderung)
- [ ] Visuelles Feedback für Drag: **FEHLT** (kein Drag aus Katalog)
- [x] State wird aufgeräumt (onUnmounted cleanup)
- [ ] Touch: GridStack hat eigene Touch-Unterstützung

**Bekannte Bugs/Probleme:**
- **Widget-Hinzufügung ist NUR per Click, nicht per Drag.** Der Auftrag erwähnt "Widget aus Sidebar auf Grid" als DnD-Bereich, aber aktuell ist es Click-to-Add. GridStack hat `acceptWidgets: true`, aber kein externer Drag-Source.

**Code-Qualität:** Sauber — GridStack-Integration mit Vue-Render API, XSS-safe (textContent statt innerHTML), Memory-Leak-Prevention (mountedWidgets Map mit cleanup).

---

### D4: Widget im Grid repositionieren

**View/Route:** CustomDashboardView (`/custom-dashboard`)
**Komponenten:** `CustomDashboardView.vue`

**DnD-Library:** GridStack.js (internes Drag-System)
**Store-Anbindung:** dashboard.store.ts (autoSave on change)

**Drag-Source:**
- Element: Widget-Header (`.dashboard-widget__header` mit `cursor: move`)
- Trigger: GridStack internes Drag-System (`handle: '.dashboard-widget__header'`)

**Drop-Target:**
- GridStack grid (12-Spalten, `float: true`)

**Visuelles Feedback:**
- GridStack-eigenes Feedback (Placeholder, Snap-to-Grid, Animation)

**State-Lifecycle:**
1. **Drag:** GridStack internes Handling
2. **Drop:** `grid.on('change', autoSave)` → Dashboard-Store-Update

**Funktionsstatus:**
- [x] Drag startet korrekt (GridStack handle)
- [x] Drop funktioniert (Snap-to-Grid)
- [x] Layout wird gespeichert (autoSave)
- [x] Visuelles Feedback (GridStack native)
- [x] Cleanup (grid.destroy in onUnmounted)

**Bekannte Bugs/Probleme:** Keine bekannt.
**Code-Qualität:** Sauber.

---

### D5: Widget resizen

**View/Route:** CustomDashboardView (`/custom-dashboard`)
**Komponenten:** `CustomDashboardView.vue`

**DnD-Library:** GridStack.js (internes Resize-System)
**Store-Anbindung:** dashboard.store.ts (autoSave on change)

**Funktionsstatus:**
- [x] Resize funktioniert (GridStack native, `.ui-resizable-se` Handle)
- [x] Min-Größen konfiguriert (minW, minH pro Widget-Typ)
- [x] Layout wird gespeichert (autoSave)
- [x] Visuelles Feedback (GridStack native)

**Bekannte Bugs/Probleme:** Keine bekannt.
**Code-Qualität:** Sauber.

---

### D6: Logic Rule Builder — Node aus Palette auf Canvas

**View/Route:** LogicView (`/logic`)
**Komponenten:**
- `RuleNodePalette.vue` — Drag-Source (Baustein-Palette)
- `RuleFlowEditor.vue` — Drop-Target (Canvas)

**DnD-Library:** Native HTML5 DnD API (Palette) + @vue-flow/core (Canvas)
**Store-Anbindung:** logic.store.ts (NICHT dragState.store.ts)

**Drag-Source:**
- Datei: RuleNodePalette.vue:243–244
- Element: Palette-Items (draggable="true")
- Trigger: `@dragstart="onDragStart($event, item)"`
- Payload: `application/rulenode` MIME-Type mit `{ type, label, defaults }`
- effectAllowed: 'move'

**Drop-Target:**
- Datei: RuleFlowEditor.vue:618–620
- Element: Canvas-Wrapper `<div @dragover @dragleave @drop>`
- Handler: `onDragOverCanvas`, `onDragLeave`, `onDrop`
- Aktion nach Drop: `project()` für Canvas-Koordinaten, `addNodes()` mit Default-Data

**Visuelles Feedback:**
- isDragOver State in RuleFlowEditor (aber kein sichtbarer CSS-Effekt gefunden)
- Palette-Item: `:active` → scale(0.97), opacity 0.8, iridescent border
- Canvas: Kein explizites Drop-Zone-Highlight

**State-Lifecycle:**
1. **Drag Start:** Palette setzt dataTransfer mit `application/rulenode`
2. **Drag Over:** Canvas preventDefault + dropEffect='move'
3. **Drop:** Canvas parsed JSON, berechnet Position via `project()`, `addNodes()`
4. **Cancel:** isDragOver = false

**Funktionsstatus:**
- [x] Drag startet korrekt (draggable="true" + custom MIME)
- [x] Drop funktioniert (position via project())
- [x] Payload kommt vollständig an (type + defaults)
- [x] Node wird korrekt erstellt (addNodes mit getDefaultNodeData)
- [ ] Visuelles Feedback: **Minimal** — kein Canvas-Highlight auf Drag-Over
- [x] State wird aufgeräumt
- [ ] Touch-Support: Native HTML5 DnD — auf mobilen Browsern NICHT unterstützt

**Bekannte Bugs/Probleme:**
- Kein visuelles Canvas-Highlight während Drag-Over (nur isDragOver State, nicht in CSS verwendet)
- Separater MIME-Type (`application/rulenode`) — sauber isoliert von anderen DnD-Bereichen

**Code-Qualität:** Sauber — Custom MIME-Type verhindert Interferenz, Default-Node-Data gut strukturiert.

---

### D7: Logic Rule Builder — Edge zwischen Nodes ziehen

**View/Route:** LogicView (`/logic`)
**Komponenten:** `RuleFlowEditor.vue`

**DnD-Library:** @vue-flow/core (internes Edge-Connection-System)
**Store-Anbindung:** logic.store.ts

**Mechanismus:**
- Vue Flow Handle-Komponenten (`<Handle>`) als Connection-Points
- `onConnect` Callback für neue Edges
- Connection-Validierung via `logicStore.isValidConnection()`
- Toast-Feedback bei ungültiger Verbindung

**Funktionsstatus:**
- [x] Edge-Drag startet korrekt (Vue Flow Handle)
- [x] Connection wird validiert (source/target type check)
- [x] Edge wird erstellt mit Animation und Arrow-Marker
- [x] Undo-History wird aktualisiert
- [x] Visuelles Feedback (Vue Flow native animated edges)

**Bekannte Bugs/Probleme:** Keine bekannt.
**Code-Qualität:** Sauber — Validierung vor Connection, Undo-History.

---

### D8: Sensor-Satellite → AnalysisDropZone (Chart-Analyse)

**View/Route:** DashboardView (`/`), Level 2/3 (ESP-Detail)
**Komponenten:**
- `SensorSatellite.vue` — Drag-Source
- `ActuatorSatellite.vue` — Drag-Source (hat DnD-Code, aber kein Chart-Drop-Target)
- `AnalysisDropZone.vue` — Drop-Target
- `ESPOrbitalLayout.vue` — Container (Auto-Open Chart)

**DnD-Library:** Native HTML5 DnD API
**Store-Anbindung:** dragState.store.ts (startSensorDrag, draggingSensorEspId)

**Drag-Source:**
- Datei: SensorSatellite.vue:296–300
- Element: Sensor-Satellite-Div mit `draggable="true"` und `data-satellite-type="sensor"`
- Trigger: `@dragstart="handleDragStart"` + `@dragend="handleDragEnd"`
- Payload: `{ type: 'sensor', espId, gpio, sensorType, name, unit }`
- DataTransfer: `application/json`
- **KRITISCH:** `event.stopPropagation()` in handleDragStart — verhindert VueDraggable-Interferenz

**Drop-Target:**
- Datei: AnalysisDropZone.vue:267–270
- Element: Root-Div mit `@dragover`, `@dragenter`, `@dragleave`, `@drop`
- Handler: Alle mit `event.stopPropagation()` — verhindert ESPOrbitalLayout-Interferenz
- Aktion nach Drop: Validiert Payload, fügt Sensor zum Chart hinzu (max 5)

**Visuelles Feedback:**
- SensorSatellite: `sensor-satellite--dragging` class
- AnalysisDropZone: Green border glow + inset shadow (`--color-success`)
- Empty-State: Pulsing Plus-Icon, scale animation, solid green border
- Legend: "+"-Indikator während Drag

**Auto-Open Mechanismus:**
- ESPOrbitalLayout watched `isSensorFromThisEspDragging`
- Wenn Sensor DIESES ESPs gedraggt wird → Chart öffnet sich sofort als Overlay
- Nach Drop-Ende: Transition von Overlay zu Inline-Modus (300ms Delay)

**effectiveDraggable Mechanismus:**
- Wenn `dragStore.isDraggingEspCard === true` → draggable wird deaktiviert
- Verhindert dass Satellite-Drags ESP-Card-Drag stören

**State-Lifecycle:**
1. **Drag Start:** SensorSatellite → stopPropagation → dragStore.startSensorDrag → Chart Auto-Open
2. **Drag Over:** AnalysisDropZone → stopPropagation → isDragOver = true
3. **Drop:** AnalysisDropZone → parsed JSON → Validierung → Sensor zum Chart hinzugefügt
4. **Cancel:** dragStore.endDrag() via @dragend, globaler dragend als Fallback
5. **Cleanup:** isDragOver reset, wasAutoOpened → false nach 300ms

**Funktionsstatus:**
- [x] Drag startet korrekt (HTML5 DnD + stopPropagation)
- [x] Drop funktioniert am richtigen Target (AnalysisDropZone)
- [x] Payload kommt vollständig an (mit Validierung: type, espId, gpio, sensorType)
- [x] Chart-Aktion wird korrekt ausgeführt (Sensor hinzugefügt, Farbe zugewiesen)
- [x] Visuelles Feedback vorhanden (Green glow, Auto-Open, Legend-Indikator)
- [x] State wird nach Drop/Cancel aufgeräumt
- [ ] Touch-Support: Native HTML5 DnD — auf mobilen Browsern NICHT unterstützt

**Bekannte Bugs/Probleme:**
- ActuatorSatellite hat identischen DnD-Code (setData, stopPropagation) aber es gibt KEINEN Drop-Target für Actuators im Chart
- Duplicate Sensor Detection: Korrekt implementiert (ID = `${espId}_${gpio}`)

**Code-Qualität:** Gut — saubere stopPropagation-Kette, vollständige Payload-Validierung (ISSUE-002 fix), Auto-Open-Mechanismus elegant.

---

### D9: EventDetailsPanel — Touch-Swipe zum Schließen (NEU GEFUNDEN)

**View/Route:** SystemMonitorView (`/monitor`)
**Komponenten:** `EventDetailsPanel.vue`

**DnD-Library:** Native Touch API (touchstart, touchmove, touchend)
**Store-Anbindung:** KEINE (eigener lokaler isDragging State)

**Mechanismus:**
- Drag-Handle: `.details-panel__drag-handle`
- Touch-Start: Merkt Y-Position
- Touch-Move: Berechnet Delta, setzt `dragOffset` für visuelles Feedback
- Touch-End: Wenn Delta > 150px → Panel schließen (emit 'close')

**Funktionsstatus:**
- [x] Touch-Drag funktioniert (nur auf Mobile)
- [x] Visuelles Feedback (Panel verschiebt sich nach unten)
- [x] Cleanup (isDragging reset)

**Bekannte Bugs/Probleme:** Keine — sauber isolierter Touch-Handler.
**Code-Qualität:** Sauber — kein Interferenz-Risiko mit anderen DnD-Bereichen.

---

### Weitere DnD-Stellen (geprüft, KEIN eigenständiger DnD-Bereich)

| Datei | Was gefunden | Bewertung |
|-------|-------------|-----------|
| `ZoneMonitorView.vue:229,245` | `:draggable="true"` auf SensorSatellite/ActuatorSatellite | Satellite-eigenes DnD (→ D8), kein eigener Bereich |
| `ZoneDetailView.vue:12` | Kommentar "VueDraggable for subzone reassignment" | Nur Kommentar, keine Implementierung gefunden |
| `RangeSlider.vue:5` | "Displays four draggable points" | UI-Slider, kein DnD im eigentlichen Sinn |
| `HealthTab.vue:269–285` | `.col-sortable` Klassen | Tabellen-Sortierung per Click, kein DnD |
| `GpioPicker.vue` | isDragging in Grep-Ergebnis | False-Positive — keine DnD-Logik |

---

## 6. Architektur-Bewertung

### C1: Zentralisierung

| Frage | Antwort |
|-------|---------|
| Nutzen alle DnD-Bereiche den gleichen dragState.store.ts? | **NEIN.** D1 + D2 + D8 nutzen ihn. D3–D5 (GridStack), D6–D7 (Vue Flow), D9 (Touch) haben eigenen State. |
| Gibt es ein gemeinsames Composable? | **NEIN.** useZoneDragDrop ist nur für Zone-Assignment-API-Calls. Kein generisches useDragDrop. |
| Ist die Payload-Struktur einheitlich? | **NEIN.** 4 verschiedene Formate: SensorTypeDragPayload, ActuatorTypeDragPayload, SensorDragPayload, application/rulenode JSON. Plus VueDraggable (kein dataTransfer, data-device-id Attribut). |
| Gibt es eine zentrale Drop-Zone-Registry? | **NEIN.** Drop-Targets sind inline in Komponenten definiert. |
| Gibt es eine zentrale DnD-Konfiguration? | **NEIN.** VueDraggable-Options pro Instanz, GridStack-Options in init(), Vue Flow-Options in useVueFlow(). |

**Bewertung:** Das System ist **absichtlich dezentral** — jede Library hat ihren eigenen State. Der dragState.store.ts vereint die nativen HTML5-DnD-Bereiche und löst Cross-Cutting-Concerns (VueDraggable vs. Native Drag Interferenz). Diese Architektur ist **sinnvoll**, da eine erzwungene Zentralisierung die Libraries gegeneinander arbeiten lassen würde.

### C2: Wiederverwendbarkeit

| Frage | Antwort |
|-------|---------|
| Kann man einen neuen DnD-Bereich hinzufügen ohne Architektur-Erweiterung? | **JA, aber mit Boilerplate.** Für nativen HTML5-DnD: ~50 Zeilen Handler + dragState.store Erweiterung (neues Flag + Payload). Für VueDraggable: `<VueDraggable group="...">` reicht. Für GridStack/Vue Flow: jeweils eigene API. |
| Gibt es Duplikation? | **JA.** ComponentSidebar, SensorSidebar, ActuatorSidebar implementieren nahezu identische DnD-Logik. SensorSatellite und ActuatorSatellite haben fast identischen DnD-Code. |
| Gibt es eine Empfehlung im Code? | **NEIN.** Keine Dokumentation welche Library für welchen Use-Case. |
| Sind DnD-Types zentral definiert? | **TEILWEISE.** dragState.store.ts exportiert SensorTypeDragPayload, SensorDragPayload, ActuatorTypeDragPayload. Aber `application/rulenode` Payload ist nur in RuleNodePalette/RuleFlowEditor definiert. |

### C3: Library-Koexistenz

| Frage | Antwort |
|-------|---------|
| Mehr als eine Library gleichzeitig aktiv? | **JA.** ZoneGroup (VueDraggable) + SensorSatellite (Native HTML5 DnD) + AnalysisDropZone (Native HTML5 DnD) sind im selben DOM-Baum aktiv. |
| Können sich Libraries stören? | **JA, und es wurde gelöst:** force-fallback auf VueDraggable, effectiveDraggable auf Satellites, stopPropagation in Satellite-Handlers, handleNativeDragStart in ZoneGroup blockiert nicht-Satellite native Drags. |
| Ist dokumentiert welche Library für welchen Bereich? | **TEILWEISE.** Kommentare in ZoneGroup erklären force-fallback. Aber keine zentrale Übersichtsdokumentation. |

### C4: Event-Listener-Management

| Frage | Antwort |
|-------|---------|
| Werden alle Listener in onUnmounted aufgeräumt? | **TEILWEISE.** dragState.store.ts hat cleanup() und HMR-Flag. Aber registerListeners() wird bei Store-Erstellung aufgerufen (Auto-Register), cleanup() muss explizit aufgerufen werden. Pinia-Stores werden normalerweise NICHT destroyed, sodass cleanup() de facto nie aufgerufen wird (außer manuell). |
| Globale Listener (window/document)? | **JA:** `window.addEventListener('dragend', ...)` und `window.addEventListener('keydown', ...)` in dragState.store.ts. Werden über `listenersRegistered` Flag dedupliziert. |
| Potentielle Memory-Leaks? | **Minimales Risiko.** Store-Listener bleiben für App-Lifetime bestehen (akzeptabel für SPA). GridStack `grid.destroy(false)` in onUnmounted. Vue-Render-Nodes in mountedWidgets Map mit cleanup. |

---

## 7. Funktionstest-Matrix

| DnD-Bereich | Drag Start | Drop | Payload korrekt | API/Store-Aktion | Visuelles Feedback | Cancel/Cleanup | Touch | Gesamt |
|-------------|-----------|------|-----------------|------------------|-------------------|----------------|-------|--------|
| D1: Zone-Assignment (ZoneGroup) | OK | OK | OK | OK | OK | OK | TEILWEISE | 6.5/7 |
| D1: Zone-Assignment (ZonePlate) | OK | OK | OK | OK | OK | TEILWEISE | TEILWEISE | 6/7 |
| D1b: UnassignedDropBar | OK | TEILWEISE | TEILWEISE | OK | OK | OK | TEILWEISE | 5.5/7 |
| D2: Sensor/Actuator → ESP | OK | OK | OK | OK | OK | OK | FEHLT | 6/7 |
| D3: Widget platzieren | FEHLT | FEHLT | OK | OK | FEHLT | OK | FEHLT | 3/7 |
| D4: Widget verschieben | OK | OK | OK | OK | OK | OK | OK | 7/7 |
| D5: Widget resizen | OK | OK | OK | OK | OK | OK | OK | 7/7 |
| D6: Logic Node | OK | OK | OK | OK | TEILWEISE | OK | FEHLT | 5.5/7 |
| D7: Logic Edge | OK | OK | OK | OK | OK | OK | FEHLT | 6/7 |
| D8: Sensor → Chart | OK | OK | OK | OK | OK | OK | FEHLT | 6/7 |
| D9: Touch-Swipe | OK | OK | OK | OK | OK | OK | OK | 7/7 |

**Legende:** OK = Funktioniert / TEILWEISE = Eingeschränkt / FEHLT = Nicht implementiert / KAPUTT = Defekt

---

## 8. Empfehlungen

### Blocker (sofort fixen)

1. **UnassignedDropBar @change vs @add** — `@change="handleDragAdd"` erwartet `event.added.element`, aber @change hat ein anderes Format (`{added: {element, newIndex}, removed: {...}, moved: {...}}`). Sollte entweder zu `@add` geändert werden oder der Handler angepasst werden.

### Qualität (sollte verbessert werden)

2. **Sidebar-Duplikation eliminieren** — ComponentSidebar, SensorSidebar, ActuatorSidebar haben 80% identischen DnD-Code. Entweder die Legacy-Sidebars entfernen (wenn ComponentSidebar sie ersetzt) oder ein `useSidebarDrag(type)` Composable extrahieren.

3. **ActuatorSatellite DnD-Code prüfen** — Hat vollständigen DnD-Code (setData, stopPropagation) identisch zu SensorSatellite, aber es gibt keinen Drop-Target der Actuator-Drops annimmt. Entweder entfernen (dead code) oder AnalysisDropZone erweitern.

4. **Canvas Drop-Zone-Highlight für D6** — RuleFlowEditor hat `isDragOver` State aber kein CSS-Styling dafür. Visuelles Feedback auf dem Canvas fehlt beim Drag-Over.

5. **Touch-Support dokumentieren** — Explizit dokumentieren: D1 hat Touch via VueDraggable (touch-start-threshold), D2/D6/D8 haben KEINEN Touch-Support (HTML5 DnD), D4/D5 haben Touch via GridStack, D9 hat Touch nativ.

### Nice-to-have

6. **Custom-Dashboard: Drag-to-Add** — `acceptWidgets: true` ist konfiguriert, aber kein Drag-Source implementiert. GridStack bietet `GridStack.setupDragIn()` für externe Drag-Sources. Aktuell nur Click-to-Add.

7. **Custom-Drag-Ghost für D2** — Sensor/Actuator-Sidebar-Items nutzen den Browser-Default-Drag-Ghost. Ein Custom-Ghost mit Icon+Label wäre visuell besser.

8. **DnD-Architektur-Dokument** — Keine zentrale Dokumentation welche Library für welchen Use-Case genutzt wird. Ein kurzer Abschnitt in einer README oder Architecture-Doc wäre hilfreich für neue Entwickler.

### Architektur-Empfehlung

**Hybrid beibehalten.** Die 3 Libraries decken unterschiedliche Use-Cases ab:
- **vue-draggable-plus:** Sortable Lists (Zone-Assignment) — richtig eingesetzt
- **GridStack.js:** Dashboard-Grid mit Resize — richtig eingesetzt
- **@vue-flow/core:** Node-Graph-Editor — richtig eingesetzt
- **Native HTML5 DnD:** Cross-Component Drag (Sidebar → ESP, Sensor → Chart) — richtig eingesetzt

Eine Konsolidierung auf eine Library wäre **kontraproduktiv** — keine einzelne Library deckt alle Use-Cases ab. Der dragState.store.ts als Koordinator für die Interferenz-Vermeidung zwischen VueDraggable und nativem DnD ist die richtige Architektur.

---

## 9. Datei-Index

| Pfad | Rolle | DnD-Bereich |
|------|-------|-------------|
| `src/shared/stores/dragState.store.ts` | Zentraler DnD-State (448 Zeilen) | D1, D2, D8 |
| `src/composables/useZoneDragDrop.ts` | Zone-Assignment API-Handler (512 Zeilen) | D1 |
| `src/components/zones/ZoneGroup.vue` | VueDraggable Zone-Container + Drop-Target (952 Zeilen) | D1 |
| `src/components/dashboard/ZonePlate.vue` | VueDraggable Zone-Kachel + Drop-Target | D1 |
| `src/components/dashboard/UnassignedDropBar.vue` | VueDraggable Unassigned-Tray + Drop-Target (569 Zeilen) | D1 |
| `src/components/dashboard/DeviceMiniCard.vue` | ESP-Mini-Karte mit .esp-drag-handle | D1 |
| `src/components/dashboard/ComponentSidebar.vue` | Kombinierte Sensor+Aktor Drag-Source (436 Zeilen) | D2 |
| `src/components/dashboard/SensorSidebar.vue` | Legacy Sensor Drag-Source | D2 |
| `src/components/dashboard/ActuatorSidebar.vue` | Legacy Aktor Drag-Source | D2 |
| `src/components/esp/ESPOrbitalLayout.vue` | ESP-Container, Drop-Target für Sensor/Aktor (656 Zeilen) | D2, D8 |
| `src/components/esp/AddSensorModal.vue` | Modal nach Sensor-Drop | D2 |
| `src/components/esp/AddActuatorModal.vue` | Modal nach Actuator-Drop | D2 |
| `src/views/CustomDashboardView.vue` | GridStack Dashboard-Builder (791 Zeilen) | D3, D4, D5 |
| `src/shared/stores/dashboard.store.ts` | Dashboard-Layout-State | D3, D4, D5 |
| `src/components/rules/RuleNodePalette.vue` | Rule-Node Drag-Source (533 Zeilen) | D6 |
| `src/components/rules/RuleFlowEditor.vue` | Vue Flow Canvas + Drop-Target (1443 Zeilen) | D6, D7 |
| `src/shared/stores/logic.store.ts` | Logic-Rule-State | D6, D7 |
| `src/components/esp/SensorSatellite.vue` | Sensor Drag-Source für Chart | D8 |
| `src/components/esp/ActuatorSatellite.vue` | Actuator Drag-Source (kein Chart-Target) | D8 (teilweise) |
| `src/components/esp/AnalysisDropZone.vue` | Chart Drop-Target für Sensoren (850 Zeilen) | D8 |
| `src/components/system-monitor/EventDetailsPanel.vue` | Touch-Swipe zum Schließen | D9 |
| `src/components/zones/ZoneMonitorView.vue` | SensorSatellite mit draggable=true | D8 (via Satellite) |
