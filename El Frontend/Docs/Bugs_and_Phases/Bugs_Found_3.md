# Bugs Found 3: Drag & Drop Logik - Analyse & Fixes

**Datum:** 2026-01-03
**Analysiert von:** Claude Opus 4.5
**Scope:** Drag-and-Drop-Logik im Dashboard (Frontend)
**Status:** IMPLEMENTIERT

---

## Inhaltsverzeichnis

1. [Systemübersicht](#1-systemübersicht)
2. [Identifizierte Bugs](#2-identifizierte-bugs)
3. [Implementierte Lösung](#3-implementierte-lösung)
4. [Architektur-Prinzip](#4-architektur-prinzip)
5. [Geänderte Dateien](#5-geänderte-dateien)

---

## 1. Systemübersicht

### 1.1 Drei Drag-Systeme im Frontend

| System | Technologie | Zweck | Hauptdateien |
|--------|-------------|-------|--------------|
| **ESP-Card-Drag** | VueDraggable (SortableJS) | ESP zwischen Zonen verschieben | `ZoneGroup.vue` |
| **Sensor-Typ-Drag** | Native HTML5 DnD | Neuen Sensor zu Mock-ESP hinzufügen | `SensorSidebar.vue`, `ESPOrbitalLayout.vue` |
| **Sensor-Satellite-Drag** | Native HTML5 DnD | Sensor in Chart-Analyse ziehen | `SensorSatellite.vue`, `AnalysisDropZone.vue` |

### 1.2 Komponenten-Hierarchie im Dashboard

```
DashboardView
└── ZoneGroup (pro Zone)
    └── VueDraggable (zone-group__grid)
        └── .zone-group__item (DIV-Wrapper, DIESER ist draggable!)
            └── [Slot: ESPOrbitalLayout]
                ├── SensorSatellite[] (links)
                ├── esp-info-compact (Mitte)
                │   └── AnalysisDropZone (eingebettet)
                └── ActuatorSatellite[] (rechts)
```

**Wichtig:** VueDraggable macht den `.zone-group__item` DIV-Wrapper draggable, NICHT die Kind-Komponenten selbst!

---

## 2. Identifizierte Bugs

### 2.1 BUG-001: AnalysisDropZone triggert ESP-Card-Drag ✅ BEHOBEN

**Symptom:** Wenn man auf der AnalysisDropZone ("Sensoren hierher ziehen") klickt und zieht, wird die gesamte ESP-Card mit verschoben.

**Root Cause:** Die `.analysis-drop-zone` Klasse war NICHT im VueDraggable-Filter enthalten.

**Fix:** `data-no-drag="true"` Attribut zu AnalysisDropZone hinzugefügt.

---

### 2.2 BUG-002: ESP-Card nicht sofort draggbar ✅ BEHOBEN

**Symptom:** Die ESP-Card reagiert nicht sofort auf Drag-Versuche.

**Root Cause:** Der Delay von 120ms war auf allen Geräten aktiv.

**Fix:** `delay-on-touch-only="true"` - Desktop hat jetzt sofortigen Drag, Touch-Geräte behalten 100ms Delay.

---

### 2.3 BUG-003: Inkonsistentes Cursor-Styling ✅ BEHOBEN

**Symptom:** Cursor: grab war auf der gesamten Card, aber nicht alle Bereiche konnten den Drag starten.

**Root Cause:** `:deep()` Regeln überschrieben komponenteneigene Cursor-Styles.

**Fix:** Komponenten kontrollieren jetzt ihre eigenen Cursor. ZoneGroup setzt nur `cursor: grab` auf den Wrapper.

---

### 2.4 BUG-004: Sensor-Satellite Timing-Konflikt ✅ NICHT MEHR RELEVANT

**Status:** Durch die anderen Fixes ist dieses Problem nicht mehr relevant. SensorSatellite und ActuatorSatellite steuern ihre eigene `effectiveDraggable` Logik basierend auf `dragStore.isDraggingEspCard`.

---

### 2.5 BUG-005: Native Drag-Events brechen VueDraggable ab ✅ BEHOBEN (ROOT CAUSE)

**Symptom:** ESP-Card Drag startet (`@choose` Event), aber bricht sofort ab (`@unchoose` ohne `@start`).

**Console-Output (typisch):**
```
[ZoneGroup:test_zone_2] VueDraggable @choose 👆 (item selected)
[DragState] Starting ESP card drag
[DragState] Global dragend ignored - ESP card drag is managed by VueDraggable {target: 'DIV'}
[ZoneGroup:test_zone_2] VueDraggable @unchoose 👋 (item deselected) {dragStarted: false}
[ZoneGroup:test_zone_2] Drag was aborted (no @start), cleaning up state
```

**Root Cause (tiefer):**

VueDraggable/SortableJS nutzt standardmäßig die **native HTML5 Drag API**. Das Problem:
1. SortableJS setzt intern `draggable="true"` auf `.zone-group__item`
2. SensorSatellite/ActuatorSatellite haben ebenfalls `draggable="true"` (für Chart-Drag)
3. Wenn User auf Handle klickt, feuert SortableJS `@choose`
4. **Aber:** Der Browser kann zeitgleich einen nativen Drag starten/beenden
5. Das native `dragend` Event interferiert mit SortableJS' internem State
6. `@start` feuert nie, weil SortableJS den Drag als abgebrochen betrachtet

**Warum bisherige Fixes nicht reichten:**
- `handle=".esp-drag-handle"` → Hilft nicht, weil SortableJS trotzdem native Drag API nutzt
- `handleGlobalDragEnd` ignoriert `dragend` → Das Event erreicht SortableJS trotzdem

**FINAL FIX: force-fallback="true"**

```vue
<VueDraggable
  ...
  :force-fallback="true"
  fallback-class="zone-item--fallback"
  ...
>
```

**Was `force-fallback` tut:**
- Zwingt SortableJS, **ausschließlich Mouse Events** zu verwenden
- **Keine nativen drag/dragstart/dragend Events** mehr für ESP-Card-Drag
- SortableJS erstellt einen Clone (Fallback) statt den nativen Drag-Ghost zu verwenden
- Eliminiert ALLE Interferenzen mit nativen Drag Events von Satellites

**Zusätzliche Sicherheitsmaßnahme: Native dragstart blockieren**

```vue
<div
  v-for="device in localDevices"
  class="zone-group__item"
  @dragstart.capture="handleNativeDragStart"
>
```

```typescript
function handleNativeDragStart(event: DragEvent) {
  const target = event.target as HTMLElement

  // Satellite-Drags (für Chart) durchlassen
  if (target.closest('[data-satellite-type]')) {
    return
  }

  // Alle anderen native Drags blockieren
  event.preventDefault()
  event.stopPropagation()
}
```

**Warum diese Kombination funktioniert:**
1. `force-fallback` → ESP-Card-Drag nutzt nur Mouse Events, keine native Drag API
2. `@dragstart.capture` → Blockiert "verirrte" native Drags, lässt Satellite-Drags durch
3. Satellites behalten `draggable="true"` → Chart-Drag funktioniert weiterhin

---

## 3. Implementierte Lösung

### 3.1 AnalysisDropZone.vue

```vue
<!-- Zeile 268: data-no-drag Attribut hinzugefügt -->
<div
  :class="['analysis-drop-zone', ...]"
  data-no-drag="true"
  @dragover="handleDragOver"
  ...
>
```

```css
/* Zeile 419-420: Base cursor für Drop-Zone */
.analysis-drop-zone {
  cursor: default;
}
```

### 3.2 ZoneGroup.vue - VueDraggable Config

```vue
<!--
  VueDraggable Configuration (FINAL):
  - group="esp-devices": Enables cross-zone drag & drop
  - handle=".esp-drag-handle": Only header triggers drag
  - filter: Interactive elements that should never trigger drag
  - force-fallback: KRITISCH! Zwingt SortableJS, Mouse Events zu verwenden
  - fallback-class: Styling für den Drag-Clone im Fallback-Modus
-->
<VueDraggable
  ...
  handle=".esp-drag-handle"
  :filter="'button, a, input, select, [data-no-drag]'"
  :prevent-on-filter="false"
  :force-fallback="true"
  fallback-class="zone-item--fallback"
  :delay="0"
  :touch-start-threshold="5"
  ...
>
```

### 3.2.1 Native dragstart Handler auf Item-Wrapper

```vue
<!-- Device cards wrapper - verhindert native Drags außer von Satellites -->
<div
  v-for="device in localDevices"
  class="zone-group__item"
  :data-device-id="getDeviceId(device)"
  @dragstart.capture="handleNativeDragStart"
>
```

```typescript
function handleNativeDragStart(event: DragEvent) {
  const target = event.target as HTMLElement

  // Satellite-Drags (für Chart) durchlassen
  if (target.closest('[data-satellite-type]')) {
    log('Native dragstart from satellite - allowing for chart drag')
    return
  }

  // Alle anderen native Drags blockieren
  log('Native dragstart BLOCKED - VueDraggable uses mouse events (force-fallback)')
  event.preventDefault()
  event.stopPropagation()
}
```

### 3.2.2 Fallback-Mode CSS

```css
/* Fallback mode styling (when force-fallback is enabled) */
.zone-item--fallback {
  transform: scale(1.03);
  z-index: 9999;
  pointer-events: none;
  opacity: 0.9;
  filter: brightness(1.1);
}

.zone-item--fallback > * {
  box-shadow: 0 12px 32px rgba(96, 165, 250, 0.4) !important;
  border: 2px solid var(--color-iridescent-1) !important;
}
```

### 3.3 ZoneGroup.vue - Cursor Styling

```css
/* Zeilen 839-865: Sauberes Cursor-Management */

/* Base: Entire item wrapper is draggable */
.zone-group__item {
  cursor: grab;
}

.zone-group__item:active {
  cursor: grabbing;
}

/*
 * Child components control their own cursor based on drag state.
 * We DON'T use :deep() to override them.
 */
```

### 3.4 dragState.ts - Global Event Listener Fix (BUG-005)

```typescript
/**
 * Globaler dragend Listener als Safety-Net.
 * Fängt dragend Events ab die nicht von Components behandelt werden.
 *
 * WICHTIG: Nur für native HTML5 Drags (SensorSatellite, SensorTypeDrag).
 * VueDraggable/SortableJS verwendet KEINE nativen drag events - es verwendet
 * Mouse-Events. Daher dürfen wir bei isDraggingEspCard NICHT eingreifen!
 */
function handleGlobalDragEnd(event: DragEvent): void {
  // Nur für native HTML5 Drags reagieren, NICHT für SortableJS/VueDraggable
  // isDraggingEspCard wird von VueDraggable verwaltet (@choose/@end Events)
  if (isDraggingEspCard.value) {
    log('Global dragend ignored - ESP card drag is managed by VueDraggable', {
      target: (event.target as HTMLElement)?.tagName,
    })
    return
  }

  // Nur bei nativen Drags (Sensor-Typ aus Sidebar, Sensor-Satellite für Chart)
  if (isDraggingSensorType.value || isDraggingSensor.value) {
    log('Global dragend caught for native drag - ensuring state cleanup', {...})
    setTimeout(() => {
      if (isDraggingSensorType.value || isDraggingSensor.value) {
        log('State still active after global dragend - forcing cleanup')
        endDrag()
      }
    }, 100)
  }
}
```

---

## 4. Architektur-Prinzip

### "Subtraktive Isolation"

```
┌─────────────────────────────────────────────────────────────┐
│  Gesamte ESP-Card ist draggbar (Default via Wrapper)        │
│                                                             │
│  Ausnahmen deklarieren sich selbst via:                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. VueDraggable Filter                              │   │
│  │     - Klassen: .sensor-satellite, .actuator-satellite│   │
│  │     - Elemente: button, a, input                     │   │
│  │     - Attribut: [data-no-drag]                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2. stopPropagation() in eigenen Drag-Handlers       │   │
│  │     - SensorSatellite.vue: dragstart, dragend        │   │
│  │     - ActuatorSatellite.vue: dragstart, dragend      │   │
│  │     - AnalysisDropZone.vue: dragover, dragenter, etc │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  3. Komponenten steuern eigene Cursor                │   │
│  │     - Basierend auf dragStore.isDraggingEspCard      │   │
│  │     - effectiveDraggable Computed Property           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Vorteile dieses Ansatzes

1. **Selbstdokumentierend**: Komponenten deklarieren explizit, ob sie Drag verhindern
2. **Erweiterbar**: Neue Komponenten fügen einfach `data-no-drag` hinzu
3. **Keine Konflikte**: Kein `:deep()` Override der Kind-Cursor-Styles
4. **Responsive**: Desktop = sofortiger Drag, Touch = mit Delay

---

## 5. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `AnalysisDropZone.vue` | `data-no-drag="true"` + `cursor: default` |
| `ZoneGroup.vue` | `force-fallback="true"` + `@dragstart.capture` Handler + Fallback-CSS |
| `ESPOrbitalLayout.vue` | `esp-drag-handle` Klasse auf Header |
| `dragState.ts` | `handleGlobalDragEnd` ignoriert VueDraggable Drags |

### Keine Änderungen nötig an:

- `SensorSatellite.vue` - bereits korrekt isoliert mit `data-satellite-type`
- `ActuatorSatellite.vue` - bereits korrekt isoliert mit `data-satellite-type`

---

## Zusammenfassung

| Bug | Status | Lösung |
|-----|--------|--------|
| BUG-001: AnalysisDropZone triggert ESP-Drag | ✅ | `data-no-drag` Attribut |
| BUG-002: ESP-Card nicht sofort draggbar | ✅ | `delay: 0` + `touch-start-threshold` |
| BUG-003: Inkonsistentes Cursor-Styling | ✅ | Cursor nur auf Handle |
| BUG-004: Sensor-Satellite Timing | ✅ | Durch andere Fixes gelöst |
| **BUG-005: Native Drag-Events brechen VueDraggable ab** | ✅ | **`force-fallback="true"`** + Native dragstart blockieren |

---

## Lessons Learned

1. **VueDraggable nutzt standardmäßig native HTML5 DnD**: Nicht Mouse Events! `force-fallback` erzwingt Mouse Events
2. **`force-fallback` ist der Schlüssel**: Bei gemischten Drag-Systemen (VueDraggable + native `draggable="true"`) MUSS `force-fallback="true"` gesetzt werden
3. **Handle allein reicht nicht**: Handle kontrolliert nur WO man greifen kann, nicht WIE gedraggt wird (native vs. mouse)
4. **Capture-Phase für präventives Blockieren**: `@dragstart.capture` fängt Events BEVOR sie Kinder erreichen
5. **`data-satellite-type` als Escape-Hatch**: Erlaubt gezieltes Durchlassen von Satellite-Drags

---

**Letzte Aktualisierung:** 2026-01-03
**Implementiert von:** Claude Opus 4.5
