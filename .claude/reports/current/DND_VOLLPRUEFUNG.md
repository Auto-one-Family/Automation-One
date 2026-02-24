# DnD Vollpruefung — Pruefbericht

> **Datum:** 2026-02-24
> **Branch:** feature/frontend-consolidation
> **Build:** PASSED (vue-tsc + vite build)
> **Tests:** 42/42 files, 1356/1356 tests passed

---

## Zusammenfassung

| Bereich | Status | Fixes |
|---------|--------|-------|
| D1: ESP Zone-Assignment | OK (Fix) | Drop-Zone-Highlighting bei aktivem Drag |
| D2: Sensor/Aktor Orbital | DEFERRED | Orbital-Split noch nicht umgesetzt |
| D3: Dashboard Widget-Drag | OK (Fix) | Drag-Handle auf Header beschraenkt |
| D4: Dashboard Widget-Resize | OK | Min-Sizes korrekt konfiguriert |
| D5: Dashboard Widget-Reorder | OK (Fix) | Header fuer Vue-Widgets hinzugefuegt |
| D6: Logic Rule Nodes | OK | Native Drag + Drop auf Canvas funktional |
| D7: Logic Rule Edges | OK (Fix) | isValidConnection Typen + Delay-Handle |
| Block E: dragState.store.ts | OK | Audit bestanden, keine Fixes noetig |

**3 Bugs gefunden und behoben, 1 Bereich deferred (Abhaengigkeit).**

---

## D1: ESP Zone-Assignment (ZonePlate + UnassignedDropBar)

**Dateien:** `ZonePlate.vue`, `UnassignedDropBar.vue`, `useZoneDragDrop.ts`, `HardwareView.vue`

### Pruefpunkte

| Check | Status | Detail |
|-------|--------|--------|
| VueDraggable group="esp-devices" | OK | Identisch in ZonePlate + UnassignedDropBar |
| Cross-Zone Drag | OK | `useZoneDragDrop.moveDevice()` mit API-Call + Rollback |
| Drop nach Unassigned | OK | `ZONE_UNASSIGNED = '__unassigned__'` korrekt behandelt |
| Undo/Redo | OK | History-Stack (max 20), Ctrl+Z/Y Handler |
| Drop-Zone-Highlighting | FIX | `--drop-target` CSS existierte, wurde aber nie aktiviert |

### Fix: Drop-Zone-Highlighting

**Datei:** `ZonePlate.vue`
**Problem:** CSS-Klasse `zone-plate--drop-target` mit iridescent Glow war definiert, aber `isDropTarget` Prop wurde nie gesetzt. VueDraggable nutzt Mouse-Events (kein native drag), daher feuern native `dragenter`/`dragleave` nicht.
**Loesung:** `dragStore.isDraggingEspCard` als zusaetzliche Bedingung in die Class-Binding aufgenommen:
```html
:class="[statusVariant, { 'zone-plate--drop-target': isDropTarget || dragStore.isDraggingEspCard }]"
```

---

## D2: Sensor/Aktor Orbital

**Status: DEFERRED**

Orbital-Split (Auslagerung der Sensor/Aktor-Darstellung in `components/orbital/`) ist Voraussetzung. Ordner `components/orbital/` existiert nicht. Aktuell werden Sensoren/Aktoren in `DeviceDetailView.vue` gerendert — dort ist kein DnD-Code vorhanden. DnD fuer Sensor-/Aktor-Typen wird ueber `ComponentSidebar.vue` (native HTML5 Drag) abgewickelt.

---

## D3–D5: Dashboard GridStack

**Dateien:** `CustomDashboardView.vue`, `dashboard.store.ts`

### Pruefpunkte

| Check | Status | Detail |
|-------|--------|--------|
| Widget hinzufuegen (Sidebar-Click) | OK | `addWidget()` mit korrekten min/max Sizes |
| Widget-Drag (Reposition) | FIX | Kein Handle → gesamter Body draggbar |
| Widget-Resize | OK | Min-Sizes pro Widget-Typ korrekt |
| Widget-Reorder | FIX | Vue-Widgets hatten keinen Header als Drag-Handle |
| Layout speichern/laden | OK | `saveLayout()` / `loadLayout()` mit GridStack Serialization |
| Widget entfernen | OK | `removable: true` + Trash-Zone |
| Chart-Interaktion | FIX | Vorher durch Widget-Drag blockiert |

### Fix 1: Drag-Handle auf Header beschraenken

**Problem:** `GridStack.init()` hatte keine `handle`-Option. Der gesamte Widget-Inhalt war als Drag-Griff nutzbar. Bei Chart-Widgets (Zoom, Pan, Hover) kollidierte das mit der Chart-Interaktion.
**Loesung:** `handle: '.dashboard-widget__header'` in GridStack.init() hinzugefuegt:
```javascript
grid = GridStack.init({
  column: 12,
  cellHeight: 80,
  margin: 8,
  float: true,
  animate: true,
  removable: true,
  acceptWidgets: true,
  handle: '.dashboard-widget__header',
}, gridContainer.value)
```

### Fix 2: Widget-Header fuer Vue-Widgets

**Problem:** `createWidgetContent()` erzeugte Header nur fuer Nicht-Vue-Widgets. Vue-mounted Widgets (ESP-Status, Sensor-Chart, etc.) bekamen nur ein `<div style="height: 100%">` — keinen Header als Drag-Handle.
**Loesung:** Funktion umstrukturiert: ALLE Widgets erhalten einen `.dashboard-widget__header`. Vue-Widgets bekommen zusaetzlich ein Mount-Div:
```javascript
return `
  <div class="dashboard-widget" data-type="${type}" data-widget-id="${widgetId}">
    <div class="dashboard-widget__header">
      <span class="dashboard-widget__title">${title || label}</span>
      <span class="dashboard-widget__type">${type}</span>
    </div>
    ${hasVueComponent
      ? `<div id="${mountId}" class="dashboard-widget__vue-mount"></div>`
      : `<div class="dashboard-widget__body">...</div>`
    }
  </div>
`
```

### Fix 3: CSS fuer Vue-Mount Container

```css
:deep(.dashboard-widget__vue-mount) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

---

## D6: Logic Rule Nodes (RuleNodePalette → Canvas)

**Dateien:** `RuleNodePalette.vue`, `RuleFlowEditor.vue`, `LogicView.vue`

### Pruefpunkte

| Check | Status | Detail |
|-------|--------|--------|
| Palette → Canvas Drag | OK | Native HTML5 Drag mit `application/rulenode` MIME |
| Node-Typen (6 Stueck) | OK | sensor, time, logic, actuator, notification, delay |
| Drop auf Canvas | OK | `onDrop()` berechnet Position, erstellt Node |
| Node-Duplizierung | OK | `duplicateNode()` mit Position-Offset |
| Node-Loeschung | OK | Delete-Key + Toolbar-Button |

Keine Fixes noetig.

---

## D7: Logic Rule Edges (Verbindungen)

**Dateien:** `logic.store.ts`, `RuleFlowEditor.vue`

### Pruefpunkte

| Check | Status | Detail |
|-------|--------|--------|
| Sensor → Logic | OK | Erlaubt |
| Logic → Actuator | OK | Erlaubt |
| Sensor → Actuator (direkt) | FIX | War NICHT blockiert (falscher Typ-String) |
| Action → * (outgoing) | FIX | War NICHT blockiert (falscher Typ-String) |
| Delay Source-Handle | FIX | Vorhanden obwohl Delay terminal ist |
| Self-Loop Prevention | OK | `sourceId === targetId` Check |
| Condition → Condition | OK | Erlaubt (AND/OR Chaining) |
| Time → Logic | OK | Erlaubt |

### Fix 1: isValidConnection — Falsche Typ-Strings

**Datei:** `logic.store.ts`
**Problem:** Validator pruefte auf `'action'`, aber Actuator-Nodes haben den Typ `'actuator'`. Dadurch wurden Sensor→Actuator direkte Verbindungen NICHT blockiert, und Actuator-Nodes konnten als Source dienen.
**Loesung:**
```javascript
// Actuator/Notification als Source blockieren
if (sourceNodeType === 'actuator' || sourceNodeType === 'notification') {
  return { valid: false, reason: 'Aktions-Knoten können keine Verbindung starten' }
}

// Sensor/Time direkt zu Actuator/Notification blockieren
if ((sourceNodeType === 'sensor' || sourceNodeType === 'time') &&
    (targetNodeType === 'actuator' || targetNodeType === 'notification')) {
  return { valid: false, reason: '...Verwende einen Logik-Knoten (UND/ODER) dazwischen.' }
}
```

### Fix 2: Delay-Node Source-Handle entfernt

**Datei:** `RuleFlowEditor.vue`
**Problem:** Delay-Node hatte einen Source-Handle (rechts), aber `isValidConnection()` blockierte alle ausgehenden Verbindungen von Delay. Der Handle war visuell vorhanden, aber funktionslos → verwirrende UX.
**Loesung:** Source-Handle aus dem Delay-Node Template entfernt. Delay hat nur noch einen Target-Handle (links).

---

## Block E: dragState.store.ts Audit

**Datei:** `dragState.store.ts` (448 Zeilen)

### Pruefpunkte

| Check | Status | Detail |
|-------|--------|--------|
| State-Tracking (4 Drag-Typen) | OK | Sensor, SensorType, EspCard, ActuatorType |
| Safety-Timeout (30s) | OK | Auto-Reset bei vergessenen dragEnd |
| Global dragend Listener | OK | Einmalig registriert via `listenersRegistered` Flag |
| Escape-Key Handler | OK | Bricht alle aktiven Drags ab |
| Computed `isAnyDragActive` | OK | OR ueber alle 4 Drag-Flags |
| `cleanup()` Export | OK | Existiert, wird aber nicht aufgerufen (akzeptabel: Singleton-Store) |
| Typisierung | OK | Alle Drag-Payloads typisiert |
| Memory-Leaks | OK | Keine Event-Listener-Lecks |

**Keine Fixes noetig.** Store ist robust implementiert.

---

## Geaenderte Dateien

| Datei | Aenderungen |
|-------|-------------|
| `El Frontend/src/views/CustomDashboardView.vue` | +handle, +header fuer Vue-Widgets, +CSS |
| `El Frontend/src/components/dashboard/ZonePlate.vue` | +dragStore.isDraggingEspCard Class-Binding |
| `El Frontend/src/shared/stores/logic.store.ts` | isValidConnection Typ-Fixes |
| `El Frontend/src/components/rules/RuleFlowEditor.vue` | Delay Source-Handle entfernt |

---

## Offene Punkte

1. **D2 Orbital DnD** — Wartet auf Orbital-Split (`auftrag-orbital-split.md`)
2. **Visueller Test** — Code-Fixes sind verifiziert (Build + Unit-Tests). Browser-Test durch User empfohlen fuer:
   - Dashboard: Widget nur am Header draggbar, Chart-Interaktion frei
   - Zone-Assignment: Alle Zonen leuchten bei ESP-Drag
   - Logic Editor: Sensor→Actuator direkt wird blockiert, Delay hat keinen Source-Handle
