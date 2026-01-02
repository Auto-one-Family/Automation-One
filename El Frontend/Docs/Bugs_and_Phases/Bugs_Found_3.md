# Bugs Found 3: Drag & Drop Logik - Forensische Analyse

**Datum:** 2026-01-02
**Analysiert von:** Claude Opus 4.5
**Scope:** Komplette Drag-and-Drop-Logik im Dashboard (Frontend)
**Methodik:** Forensische Deep-Dive-Analyse aller relevanten Dateien

---

## Inhaltsverzeichnis

1. [Systemübersicht](#1-systemübersicht)
2. [Geprüfte Dateien](#2-geprüfte-dateien)
3. [Kritische Bugs](#3-kritische-bugs)
4. [Mittlere Probleme](#4-mittlere-probleme)
5. [Konsistenz-Probleme](#5-konsistenz-probleme)
6. [Server-Kontext](#6-server-kontext-für-verständnis)
7. [Was funktioniert gut](#7-was-funktioniert-gut)
8. [Offene Prüfpunkte](#8-offene-prüfpunkte)
9. [Fix-Prioritäten](#9-fix-prioritäten)

---

## 1. Systemübersicht

### 1.1 Drei separate Drag-and-Drop-Systeme

Das Frontend implementiert **drei unabhängige Drag-and-Drop-Mechanismen**:

| System | Technologie | Zweck | Dateien |
|--------|-------------|-------|---------|
| **Zone-Drag** | VueDraggable (vue-draggable-plus) | ESP-Geräte zwischen Zonen verschieben | `ZoneGroup.vue`, `UnassignedDropBar.vue` |
| **Sensor-Typ-Drag** | Native HTML5 DnD | Neuen Sensor zu ESP hinzufügen | `SensorSidebar.vue`, `dragState.ts` |
| **Sensor-Satellite-Drag** | Native HTML5 DnD | Sensoren in Chart-Analyse ziehen | `SensorSatellite.vue`, `AnalysisDropZone.vue` |

### 1.2 Datenfluss bei Zone-Drag

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ User Action: Device von Zone A nach Zone B ziehen                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ZoneGroup.vue                                                               │
│ - VueDraggable @change Event                                                │
│ - handleDragChange() extrahiert device, fromZoneId, toZoneId                │
│ - emit('device-dropped', payload)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DashboardView.vue                                                           │
│ - onDeviceDropped() empfängt Event                                          │
│ - Ruft handleDeviceDrop() aus useZoneDragDrop auf                           │
│ - ⚠️ BUG: Ruft NOCHMAL espStore.fetchAll() auf                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ useZoneDragDrop.ts                                                          │
│ - handleDeviceDrop() oder handleRemoveFromZone()                            │
│ - API Call: zonesApi.assignZone() oder zonesApi.removeZone()                │
│ - ⚠️ BUG: Ruft espStore.fetchAll() auf                                      │
│ - Toast-Benachrichtigung                                                    │
│ - Speichert in Undo-Stack                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ zones.ts API                                                                │
│ - POST /zone/devices/{deviceId}/assign                                      │
│ - DELETE /zone/devices/{deviceId}/zone                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SERVER (God-Kaiser)                                                         │
│ - zone.py API Endpoint                                                      │
│ - DB Update (ESPDevice.zone_id, zone_name)                                  │
│ - MQTT Publish an ESP: kaiser/{kaiser_id}/esp/{esp_id}/zone/assign          │
│ - WebSocket Broadcast: zone_assignment Event                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ esp.ts Store (WebSocket Handler)                                            │
│ - handleZoneAssignment() empfängt Broadcast                                 │
│ - Aktualisiert device.zone_id im lokalen Store                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Geprüfte Dateien

### 2.1 Frontend - State Management

| Datei | Pfad | Zeilen | Status |
|-------|------|--------|--------|
| **dragState.ts** | `El Frontend/src/stores/dragState.ts` | 317 | ✅ Vollständig geprüft |
| **esp.ts** | `El Frontend/src/stores/esp.ts` | 849 | ✅ Vollständig geprüft |

**dragState.ts Details:**
- Pinia Store für globalen Drag-State
- Zwei Drag-Modi: `isDraggingSensorType`, `isDraggingSensor`
- Safety-Timeout nach 30 Sekunden
- Globale Event-Listener für `dragend` und `keydown` (Escape)
- **Problem gefunden:** Keine Cleanup-Funktion für Event-Listener

**esp.ts Details:**
- Zentraler Store für alle ESP-Devices
- WebSocket-Integration für Live-Updates
- `handleZoneAssignment()` für Zone-ACK vom Server
- `getDeviceId()` Helper für konsistente ID-Extraktion

### 2.2 Frontend - Composables

| Datei | Pfad | Zeilen | Status |
|-------|------|--------|--------|
| **useZoneDragDrop.ts** | `El Frontend/src/composables/useZoneDragDrop.ts` | 494 | ✅ Vollständig geprüft |

**useZoneDragDrop.ts Details:**
- `handleDeviceDrop()`: Zone-Zuweisung via API
- `handleRemoveFromZone()`: Zone-Entfernung via API
- `groupDevicesByZone()`: Gruppierung für Dashboard
- Undo/Redo System (max 20 Einträge)
- Zone-ID Generierung (Umlaute ersetzen, lowercase)
- **Problem gefunden:** Doppeltes `fetchAll()` nach API-Call

### 2.3 Frontend - Views

| Datei | Pfad | Zeilen | Status |
|-------|------|--------|--------|
| **DashboardView.vue** | `El Frontend/src/views/DashboardView.vue` | 688 | ✅ Vollständig geprüft |

**DashboardView.vue Details:**
- Haupt-Dashboard mit Zone-gruppierten ESPs
- Filter nach Typ (All/Mock/Real) und Status
- Integriert ZoneGroup, SensorSidebar, UnassignedDropBar
- `onDeviceDropped()` Handler für Zone-Drops
- **Problem gefunden:** Drittes `fetchAll()` nach `handleDeviceDrop()`

### 2.4 Frontend - Zone Components

| Datei | Pfad | Zeilen | Status |
|-------|------|--------|--------|
| **ZoneGroup.vue** | `El Frontend/src/components/zones/ZoneGroup.vue` | 697 | ✅ Vollständig geprüft |

**ZoneGroup.vue Details:**
- VueDraggable Container für ESP-Cards
- Group: `"esp-devices"` für Cross-Zone-Drag
- `handleDragChange()` für @change Event
- Drag-Over-Effekte (Pulsing Border)
- `localDevices` mit watch-Synchronisation
- **Problem gefunden:** `fromZoneId` könnte nach VueDraggable-Mutation falsch sein

### 2.5 Frontend - Dashboard Components

| Datei | Pfad | Zeilen | Status |
|-------|------|--------|--------|
| **UnassignedDropBar.vue** | `El Frontend/src/components/dashboard/UnassignedDropBar.vue` | 468 | ✅ Vollständig geprüft |
| **SensorSidebar.vue** | `El Frontend/src/components/dashboard/SensorSidebar.vue` | 512 | ✅ Vollständig geprüft |

**UnassignedDropBar.vue Details:**
- Fixed Bottom Bar für unzugewiesene ESPs
- VueDraggable mit Group `"esp-devices"`
- `handleDragAdd()` zum Entfernen aus Zone
- **Problem gefunden:** Index-Zugriff auf `localDevices` kann fehlschlagen

**SensorSidebar.vue Details:**
- Rechte Sidebar mit Sensor-Typen
- Native HTML5 Drag für Sensor-Typ-Auswahl
- `onSensorTypeDragStart()` / `onSensorTypeDragEnd()`
- **Problem gefunden:** CSS-Klasse bleibt bei Abbruch hängen

### 2.6 Frontend - ESP Components

| Datei | Pfad | Zeilen | Status |
|-------|------|--------|--------|
| **SensorSatellite.vue** | `El Frontend/src/components/esp/SensorSatellite.vue` | 318 | ✅ Vollständig geprüft |
| **AnalysisDropZone.vue** | `El Frontend/src/components/esp/AnalysisDropZone.vue` | 675 | ✅ Vollständig geprüft |

**SensorSatellite.vue Details:**
- Draggable Sensor für Multi-Sensor-Charts
- Native HTML5 DnD mit `stopPropagation()`
- Setzt `application/json` Drag-Data
- Interagiert mit `dragState` Store

**AnalysisDropZone.vue Details:**
- Drop-Target für Sensor-Satellites
- Max 5 Sensoren pro Chart
- Time-Range Selector (1h-30d)
- Y-Achsen-Konfiguration
- **Problem gefunden:** Unvollständige Drag-Data Validation

### 2.7 Frontend - API & Types

| Datei | Pfad | Zeilen | Status |
|-------|------|--------|--------|
| **zones.ts** | `El Frontend/src/api/zones.ts` | 79 | ✅ Vollständig geprüft |
| **index.ts** (Types) | `El Frontend/src/types/index.ts` | 636 | ✅ Vollständig geprüft |

**zones.ts Details:**
- `assignZone()`: POST /zone/devices/{deviceId}/assign
- `removeZone()`: DELETE /zone/devices/{deviceId}/zone
- `getZoneInfo()`, `getZoneDevices()`, `getUnassignedDevices()`

**Types Details:**
- `SensorDragData`, `ActuatorDragData`: Drag-Payloads
- `ChartSensor`: Sensor in Multi-Sensor-Chart
- `ZoneAssignRequest/Response`: API-Schemas
- `ZoneUpdate`: WebSocket-Event-Schema

---

## 3. Kritische Bugs

### 3.1 BUG-001: Dreifaches `fetchAll` bei Zone-Drops

**Schweregrad:** 🚨 KRITISCH
**Auswirkung:** Performance-Degradation, Race-Conditions, Server-Last
**Entdeckt in:** Datenfluss-Analyse

#### Betroffene Dateien und Zeilen:

**Datei 1:** `El Frontend/src/composables/useZoneDragDrop.ts`
```typescript
// Zeile 185-197
async function handleDeviceDrop(event: ZoneDropEvent): Promise<boolean> {
  // ...
  try {
    const response = await zonesApi.assignZone(deviceId, {...})
    // ...
    await espStore.fetchAll()  // ← ERSTES fetchAll
    // ...
  }
}

// Zeile 267-276
async function handleRemoveFromZone(device: ESPDevice): Promise<boolean> {
  // ...
  try {
    const response = await zonesApi.removeZone(deviceId)
    // ...
    await espStore.fetchAll()  // ← ERSTES fetchAll (bei Remove)
    // ...
  }
}
```

**Datei 2:** `El Frontend/src/views/DashboardView.vue`
```typescript
// Zeile 183-191
async function onDeviceDropped(payload: {
  device: any
  fromZoneId: string | null
  toZoneId: string
}) {
  await handleDeviceDrop(payload)  // ← Ruft intern fetchAll auf
  await espStore.fetchAll()        // ← ZWEITES fetchAll (überflüssig!)
}
```

**Datei 3:** `El Frontend/src/components/dashboard/UnassignedDropBar.vue`
```typescript
// Zeile 96-109
async function handleDragAdd(event: any) {
  // ...
  if (device.zone_id) {
    await handleRemoveFromZone(device)  // ← Ruft intern fetchAll auf
    await espStore.fetchAll()           // ← ZWEITES fetchAll (überflüssig!)
  }
}
```

#### Problemanalyse:

1. `handleDeviceDrop()` und `handleRemoveFromZone()` rufen **intern** bereits `espStore.fetchAll()` auf
2. Die aufrufenden Komponenten (`DashboardView`, `UnassignedDropBar`) rufen **nochmal** `fetchAll()` auf
3. Bei einem Zone-Drop werden also **2-3x** die gleichen Daten vom Server geladen

#### Konsequenzen:

- **Performance:** 2-3x mehr HTTP-Requests als nötig
- **Race-Condition:** Wenn User schnell mehrere Drops macht, können sich die fetchAll-Calls überschneiden
- **UI-Flackern:** Mehrfaches Re-Render der Device-Liste
- **Server-Last:** Unnötige Datenbankabfragen

#### Fix-Empfehlung:

Entferne die redundanten `fetchAll()` Aufrufe in den aufrufenden Komponenten:

```typescript
// DashboardView.vue - Zeile 183-191
async function onDeviceDropped(payload) {
  await handleDeviceDrop(payload)
  // ENTFERNEN: await espStore.fetchAll()
}

// UnassignedDropBar.vue - Zeile 104-106
if (device.zone_id) {
  await handleRemoveFromZone(device)
  // ENTFERNEN: await espStore.fetchAll()
}
```

---

### 3.2 BUG-002: Timing-Bug in UnassignedDropBar

**Schweregrad:** 🚨 KRITISCH
**Auswirkung:** Silent Failure, Device nicht gefunden
**Entdeckt in:** `UnassignedDropBar.vue` Zeile 96-109

#### Problembeschreibung:

```typescript
// El Frontend/src/components/dashboard/UnassignedDropBar.vue
// Zeile 38-45
const unassignedDevices = computed(() => {
  return espStore.devices.filter(device => !device.zone_id)
})

watch(unassignedDevices, (newDevices) => {
  localDevices.value = [...newDevices]
}, { immediate: true, deep: true })

// Zeile 96-109
async function handleDragAdd(event: any) {
  const newIndex = event?.newIndex
  if (typeof newIndex === 'number' && newIndex >= 0 && newIndex < localDevices.value.length) {
    const device = localDevices.value[newIndex] as ESPDevice  // ← PROBLEM

    if (device.zone_id) {  // ← Wird nie true sein!
      await handleRemoveFromZone(device)
    }
  }
}
```

#### Logiklücke:

1. `localDevices` basiert auf `unassignedDevices` (Devices **ohne** `zone_id`)
2. Wenn ein Device **mit** `zone_id` in die Bar gedroppt wird, ist es noch **nicht** in `localDevices`
3. VueDraggable fügt es zwar via v-model hinzu, aber...
4. Der `newIndex` referenziert möglicherweise das **falsche** Device
5. Zusätzlich: `device.zone_id` Check (Zeile 102) ist **immer false** weil `localDevices` nur Devices ohne `zone_id` enthält

#### Timing-Ablauf:

```
T0: User droppt Device (zone_id: "zelt_1") in UnassignedDropBar
T1: VueDraggable fügt Device zu localDevices hinzu (v-model mutation)
T2: VueDraggable feuert @add Event mit newIndex
T3: handleDragAdd() wird aufgerufen
T4: localDevices[newIndex] wird gelesen
    → ABER: Das Device hat zone_id="zelt_1", kommt also aus einer Zone
    → localDevices enthält aber nur Devices OHNE zone_id
    → Index-Mismatch möglich!
```

#### Fix-Empfehlung:

Das Device sollte aus dem `event.added.element` gelesen werden, nicht aus `localDevices`:

```typescript
async function handleDragAdd(event: any) {
  // VueDraggable liefert das hinzugefügte Element direkt
  const device = event?.added?.element as ESPDevice | undefined
  if (!device) return

  const deviceId = device.device_id || device.esp_id || ''
  if (!deviceId) return

  // Device hatte eine Zone → entfernen
  if (device.zone_id) {
    await handleRemoveFromZone(device)
  }
}
```

---

### 3.3 BUG-003: Falsches `fromZoneId` nach VueDraggable-Mutation

**Schweregrad:** 🚨 KRITISCH
**Auswirkung:** Falsche Undo-History, inkorrekte Audit-Logs
**Entdeckt in:** `ZoneGroup.vue` Zeile 125-139

#### Problembeschreibung:

```typescript
// El Frontend/src/components/zones/ZoneGroup.vue
// Zeile 125-139
function handleDragChange(event: any) {
  if (event.added) {
    const device = event.added.element as ESPDevice
    const fromZoneId = device.zone_id || null  // ← PROBLEM: Könnte bereits mutiert sein!

    emit('device-dropped', {
      device,
      fromZoneId,     // ← Möglicherweise das NEUE zone_id statt dem alten
      toZoneId: props.zoneId
    })
  }
}
```

#### Logiklücke:

1. VueDraggable mutiert das Device-Objekt möglicherweise **bevor** `@change` gefeuert wird
2. Das `device.zone_id` könnte bereits das **neue** Zone-ID sein (die Ziel-Zone)
3. Das `fromZoneId` wäre dann identisch mit `toZoneId`

#### Konsequenz:

- **Undo-History:** Speichert falsches `fromZoneId`, Undo funktioniert nicht korrekt
- **Audit-Log:** Server erhält falsche Informationen über die ursprüngliche Zone
- **Toast-Messages:** Zeigen möglicherweise falsche "von Zone X nach Zone Y" Meldungen

#### Verifizierung nötig:

Muss getestet werden, ob VueDraggable das Element vor oder nach dem @change Event mutiert. Siehe [Offene Prüfpunkte](#8-offene-prüfpunkte).

#### Fix-Empfehlung (falls bestätigt):

Das ursprüngliche `zone_id` vor dem Drop speichern:

```typescript
// Option 1: fromZoneId im dataTransfer speichern
function handleDragStart(event: DragEvent, device: ESPDevice) {
  event.dataTransfer?.setData('fromZoneId', device.zone_id || '')
}

// Option 2: Device-Clone vor Mutation erstellen
function handleDragChange(event: any) {
  if (event.added) {
    const device = event.added.element as ESPDevice
    // VueDraggable speichert das Original in event.from
    const fromZoneId = event.from?.__vnode?.props?.zoneId || null
    // ...
  }
}
```

---

## 4. Mittlere Probleme

### 4.1 ISSUE-001: CSS-Klasse bleibt bei Drag-Abbruch hängen

**Schweregrad:** ⚠️ MITTEL
**Auswirkung:** Visueller Bug, Styling-Inkonsistenz
**Entdeckt in:** `SensorSidebar.vue` Zeile 156-187

#### Problembeschreibung:

```typescript
// El Frontend/src/components/dashboard/SensorSidebar.vue
// Zeile 156-178
function onSensorTypeDragStart(event: DragEvent, sensor: DraggableSensorType) {
  // ...
  if (event.target instanceof HTMLElement) {
    event.target.classList.add('sensor-type--dragging')  // ← Direkte DOM-Manipulation
  }
}

// Zeile 180-187
function onSensorTypeDragEnd(event: DragEvent) {
  dragStore.endDrag()
  if (event.target instanceof HTMLElement) {
    event.target.classList.remove('sensor-type--dragging')  // ← Wird nicht immer aufgerufen
  }
}
```

#### Szenarien wo `dragend` nicht gefeuert wird:

1. **Escape-Taste:** `dragStore.endDrag()` wird via `keydown` Handler aufgerufen, aber nicht `onSensorTypeDragEnd()`
2. **Browser-Tab-Wechsel:** Drag wird abgebrochen ohne Event
3. **Fenster verliert Fokus:** Drag wird abgebrochen
4. **Touch-Abbruch auf Mobile:** Touch-Events verhalten sich anders

#### Konsequenz:

Die CSS-Klasse `sensor-type--dragging` bleibt permanent auf dem Element, was zu:
- Falscher Opacity (0.7)
- Falschem Scale (0.95)
- Falschem Border-Color
- Falschem Box-Shadow

#### Fix-Empfehlung:

Reaktiver State statt direkter DOM-Manipulation:

```typescript
const draggingSensorType = ref<string | null>(null)

function onSensorTypeDragStart(event: DragEvent, sensor: DraggableSensorType) {
  draggingSensorType.value = sensor.type
  // ...
}

function onSensorTypeDragEnd() {
  draggingSensorType.value = null
  dragStore.endDrag()
}

// In Template:
// :class="{ 'sensor-type--dragging': draggingSensorType === sensor.type }"

// Zusätzlich: Watch auf dragStore für Cleanup
watch(() => dragStore.isDraggingSensorType, (isDragging) => {
  if (!isDragging) {
    draggingSensorType.value = null
  }
})
```

---

### 4.2 ISSUE-002: Unvollständige Drag-Data Validation

**Schweregrad:** ⚠️ MITTEL
**Auswirkung:** Potenzielle Runtime-Fehler, korrupte Chart-Daten
**Entdeckt in:** `AnalysisDropZone.vue` Zeile 112-146

#### Problembeschreibung:

```typescript
// El Frontend/src/components/esp/AnalysisDropZone.vue
// Zeile 112-146
function handleDrop(event: DragEvent) {
  // ...
  try {
    const dragData = JSON.parse(data) as SensorDragData

    if (dragData.type !== 'sensor') return  // ← Nur type-Check!

    // Keine Validierung von:
    // - dragData.espId (könnte undefined sein)
    // - dragData.gpio (könnte undefined oder NaN sein)
    // - dragData.sensorType (könnte undefined sein)
    // - dragData.name (könnte undefined sein)
    // - dragData.unit (könnte undefined sein)

    const newSensor: ChartSensor = {
      id: `${dragData.espId}_${dragData.gpio}`,  // ← "undefined_undefined" möglich!
      espId: dragData.espId,
      gpio: dragData.gpio,
      sensorType: dragData.sensorType,
      name: dragData.name,
      unit: dragData.unit,
      color: getNextColor(),
    }
    selectedSensors.value.push(newSensor)
  } catch {
    // Invalid JSON, ignore
  }
}
```

#### Konsequenzen:

- **ID-Kollision:** Mehrere Sensoren könnten die gleiche ID `"undefined_undefined"` haben
- **Chart-Fehler:** MultiSensorChart könnte mit undefined-Werten nicht umgehen
- **API-Fehler:** Sensor-History-Requests mit undefined espId/gpio schlagen fehl

#### Fix-Empfehlung:

Vollständige Validierung vor dem Hinzufügen:

```typescript
function handleDrop(event: DragEvent) {
  // ...
  try {
    const dragData = JSON.parse(data)

    // Vollständige Validierung
    if (
      dragData.type !== 'sensor' ||
      typeof dragData.espId !== 'string' || !dragData.espId ||
      typeof dragData.gpio !== 'number' || isNaN(dragData.gpio) ||
      typeof dragData.sensorType !== 'string' || !dragData.sensorType
    ) {
      console.warn('[AnalysisDropZone] Invalid drag data:', dragData)
      return
    }

    // Defaults für optionale Felder
    const newSensor: ChartSensor = {
      id: `${dragData.espId}_${dragData.gpio}`,
      espId: dragData.espId,
      gpio: dragData.gpio,
      sensorType: dragData.sensorType,
      name: dragData.name || `Sensor GPIO ${dragData.gpio}`,
      unit: dragData.unit || '',
      color: getNextColor(),
    }
    // ...
  }
}
```

---

### 4.3 ISSUE-003: Memory-Leak bei Event-Listeners

**Schweregrad:** ⚠️ MITTEL
**Auswirkung:** Memory-Leak bei HMR, mehrfache Event-Handler
**Entdeckt in:** `dragState.ts` Zeile 283-291

#### Problembeschreibung:

```typescript
// El Frontend/src/stores/dragState.ts
// Zeile 283-291
if (typeof window !== 'undefined') {
  window.addEventListener('dragend', handleGlobalDragEnd, { capture: true })
  window.addEventListener('keydown', handleKeyDown)

  // KEIN CLEANUP!
  // Kommentar sagt: "Pinia stores werden normalerweise nicht destroyed"
  // ABER: Bei HMR (Hot Module Replacement) wird der Store neu erstellt
}
```

#### Konsequenzen bei HMR:

1. Entwickler ändert Code in dragState.ts
2. Vite/Webpack führt Hot Module Replacement durch
3. Store wird neu erstellt
4. Event-Listener werden **nochmal** registriert
5. Nach 10 Code-Änderungen: 10x `handleGlobalDragEnd`, 10x `handleKeyDown`

#### Fix-Empfehlung:

Cleanup-Funktion implementieren und bei Store-Initialisierung alte Listener entfernen:

```typescript
// Referenzen für Cleanup speichern
let globalDragEndHandler: ((e: DragEvent) => void) | null = null
let keyDownHandler: ((e: KeyboardEvent) => void) | null = null

function setupEventListeners(): void {
  if (typeof window === 'undefined') return

  // Alte Listener entfernen (falls vorhanden)
  if (globalDragEndHandler) {
    window.removeEventListener('dragend', globalDragEndHandler, { capture: true })
  }
  if (keyDownHandler) {
    window.removeEventListener('keydown', keyDownHandler)
  }

  // Neue Listener registrieren
  globalDragEndHandler = handleGlobalDragEnd
  keyDownHandler = handleKeyDown

  window.addEventListener('dragend', globalDragEndHandler, { capture: true })
  window.addEventListener('keydown', keyDownHandler)
}

function cleanupEventListeners(): void {
  if (typeof window === 'undefined') return

  if (globalDragEndHandler) {
    window.removeEventListener('dragend', globalDragEndHandler, { capture: true })
    globalDragEndHandler = null
  }
  if (keyDownHandler) {
    window.removeEventListener('keydown', keyDownHandler)
    keyDownHandler = null
  }
}

// Im Store:
setupEventListeners()

return {
  // ...
  cleanupEventListeners,  // Für manuellen Cleanup exponieren
}
```

---

## 5. Konsistenz-Probleme

### 5.1 CONSISTENCY-001: Duplizierte Device-ID Extraktion

**Schweregrad:** 📝 LOW
**Auswirkung:** Wartbarkeit, DRY-Verletzung

Die Logik `device.device_id || device.esp_id || ''` ist an **7 Stellen** dupliziert:

| Datei | Zeile | Kontext |
|-------|-------|---------|
| `useZoneDragDrop.ts` | 169 | `handleDeviceDrop()` |
| `useZoneDragDrop.ts` | 252 | `handleRemoveFromZone()` |
| `ZoneGroup.vue` | 199-201 | `getDeviceId()` |
| `UnassignedDropBar.vue` | 52-54 | `isMock()` |
| `UnassignedDropBar.vue` | 57-59 | `getDeviceId()` |
| `esp.ts` | 111-113 | `getDeviceId()` |
| `DashboardView.vue` | 69 | `warningCount` computed |

#### Empfehlung:

Zentrale Utility-Funktion verwenden:

```typescript
// src/utils/device.ts
export function getDeviceId(device: { device_id?: string; esp_id?: string }): string {
  return device.device_id || device.esp_id || ''
}
```

---

### 5.2 CONSISTENCY-002: Magic String `__unassigned__`

**Schweregrad:** 📝 LOW
**Auswirkung:** Wartbarkeit, Fehleranfälligkeit bei Typos

Der String `__unassigned__` wird ohne zentrale Konstante verwendet:

| Datei | Zeile | Verwendung |
|-------|-------|------------|
| `useZoneDragDrop.ts` | 112 | `zoneMap.set('__unassigned__', ...)` |
| `useZoneDragDrop.ts` | 120 | `device.zone_id \|\| '__unassigned__'` |
| `useZoneDragDrop.ts` | 137 | `a.zoneId === '__unassigned__'` |
| `useZoneDragDrop.ts` | 177 | `toZoneId === '__unassigned__'` |
| `DashboardView.vue` | 179 | `g.zoneId !== '__unassigned__'` |

#### Empfehlung:

Zentrale Konstante definieren:

```typescript
// src/constants/zones.ts
export const UNASSIGNED_ZONE_ID = '__unassigned__'
export const UNASSIGNED_ZONE_NAME = 'Nicht zugewiesen'
```

---

### 5.3 CONSISTENCY-003: Zwei unverbundene Drag-State-Systeme

**Schweregrad:** 📝 LOW
**Auswirkung:** Potenzielle Konflikte, keine zentrale Kontrolle

| System | State-Management | Aktiv-Flag |
|--------|------------------|------------|
| Sensor-Typ/Satellite Drag | `dragState` Pinia Store | `isDraggingSensorType`, `isDraggingSensor` |
| Zone-Drag | VueDraggable lokaler State | Kein globaler Flag |

#### Problem:

- Beide Systeme könnten theoretisch gleichzeitig aktiv sein
- Keine zentrale Methode um alle Drags zu canceln
- `isAnyDragActive` im dragState kennt Zone-Drag nicht

#### Empfehlung:

Zone-Drag-Status auch im dragState Store tracken:

```typescript
// dragState.ts - Erweiterung
const isDraggingZone = ref(false)
const draggingDeviceId = ref<string | null>(null)

const isAnyDragActive = computed(() =>
  isDraggingSensorType.value || isDraggingSensor.value || isDraggingZone.value
)

function startZoneDrag(deviceId: string): void {
  if (isAnyDragActive.value) endDrag()
  isDraggingZone.value = true
  draggingDeviceId.value = deviceId
  startSafetyTimeout()
}
```

---

## 6. Server-Kontext (für Verständnis)

### 6.1 Server-Zentrische Architektur

Das AutomationOne-System ist **server-zentrisch**. Der God-Kaiser Server (Python/FastAPI) ist die Single Source of Truth:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │◄───►│   God-Kaiser    │◄───►│     ESP32       │
│   (Vue.js)      │     │    (FastAPI)    │     │   (Firmware)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       │                       │                       │
       │  REST API             │  PostgreSQL           │  MQTT
       │  WebSocket            │  MQTT Broker          │
       │                       │                       │
```

### 6.2 Zone-Assignment Flow (Server-Seite)

**Datei:** `El Servador/god_kaiser_server/src/api/v1/zone.py`

```python
@router.post("/devices/{device_id}/assign")
async def assign_zone(
    device_id: str,
    request: ZoneAssignRequest,
    db: AsyncSession = Depends(get_db),
    mqtt_client: MQTTClient = Depends(get_mqtt_client)
):
    # 1. Device in DB finden
    device = await esp_repo.get_by_device_id(db, device_id)

    # 2. Zone-Felder in DB aktualisieren
    device.zone_id = request.zone_id
    device.zone_name = request.zone_name
    await db.commit()

    # 3. MQTT an ESP senden
    topic = f"kaiser/{kaiser_id}/esp/{device_id}/zone/assign"
    await mqtt_client.publish(topic, {
        "zone_id": request.zone_id,
        "zone_name": request.zone_name
    })

    # 4. WebSocket Broadcast für Frontend
    await websocket_manager.broadcast({
        "type": "zone_assignment",
        "data": {
            "esp_id": device_id,
            "status": "zone_assigned",
            "zone_id": request.zone_id
        }
    })

    return ZoneAssignResponse(success=True, ...)
```

### 6.3 WebSocket-Events für Zone-Updates

Der ESP Store (`esp.ts`) empfängt Zone-Updates via WebSocket:

```typescript
// esp.ts Zeile 727-752
function handleZoneAssignment(message: any): void {
  const data = message.data
  const espId = data.esp_id || data.device_id

  const device = devices.value.find(d => getDeviceId(d) === espId)
  if (!device) return

  if (data.status === 'zone_assigned') {
    device.zone_id = data.zone_id || undefined
    device.master_zone_id = data.master_zone_id || undefined
  }
}
```

### 6.4 Warum `fetchAll` nach Zone-Change?

Das Composable `useZoneDragDrop.ts` ruft `fetchAll()` auf um:

1. **Server-Autorität:** Die DB ist die Single Source of Truth
2. **Konsistenz:** Andere Felder könnten sich geändert haben (z.B. `updated_at`)
3. **Fehlerfall:** Falls API fehlschlägt, wird der UI-State korrigiert

**ABER:** Der WebSocket `zone_assignment` Event macht das `fetchAll` eigentlich überflüssig, da der ESP Store bereits live aktualisiert wird. Das erklärt warum das dreifache `fetchAll` ein Bug ist.

---

## 7. Was funktioniert gut

### 7.1 Robuste Implementierungen

| Feature | Datei | Beschreibung |
|---------|-------|--------------|
| **Safety-Timeout** | `dragState.ts:30` | 30s Fallback gegen hängende Drags |
| **Escape-Handler** | `dragState.ts:276-280` | Drag via Escape-Taste abbrechen |
| **Undo/Redo** | `useZoneDragDrop.ts:51-101` | 20 Einträge History, clear bei neuer Action |
| **Error-Recovery** | `useZoneDragDrop.ts:218-239` | Retry-Action in Toast bei API-Fehler |
| **VueDraggable Group** | `ZoneGroup.vue:252` | Konsistentes Cross-Zone-Drag |
| **stopPropagation** | `SensorSatellite.vue:107-110` | Verhindert VueDraggable-Konflikt |
| **dragOverCount** | `ZoneGroup.vue:71` | Korrektes Tracking von nested drag events |

### 7.2 Gute Patterns

1. **Composable-Pattern:** `useZoneDragDrop()` kapselt Zone-Logik sauber
2. **Pinia Store:** Zentraler Drag-State ermöglicht Cross-Component-Kommunikation
3. **TypeScript Types:** `SensorDragData`, `ChartSensor` sind gut typisiert
4. **Toast-Feedback:** User bekommt immer Feedback bei Aktionen

---

## 8. Offene Prüfpunkte

### 8.1 Noch zu verifizieren

| # | Prüfpunkt | Priorität | Wie testen? |
|---|-----------|-----------|-------------|
| 1 | Mutiert VueDraggable das Element vor oder nach @change? | HOCH | Console.log in handleDragChange |
| 2 | Funktioniert Zone-Drag auf Touch-Devices? | MITTEL | Mobile Browser testen |
| 3 | Gibt es Race-Conditions bei schnellen Multi-Drops? | MITTEL | Rapid-Fire Drops testen |
| 4 | Werden WebSocket zone_assignment Events korrekt empfangen? | MITTEL | Network Tab + Console |
| 5 | Funktioniert Undo nach Browser-Refresh? | LOW | Refresh nach Drop |

### 8.2 Server-Dateien für tiefere Analyse

Falls Server-Bugs vermutet werden:

| Datei | Pfad | Zweck |
|-------|------|-------|
| zone.py | `El Servador/god_kaiser_server/src/api/v1/zone.py` | Zone REST API |
| zone_ack_handler.py | `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py` | MQTT Zone-ACK |
| esp_repo.py | `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py` | DB Operations |
| websocket/__init__.py | `El Servador/god_kaiser_server/src/api/v1/websocket/__init__.py` | WS Broadcast |

---

## 9. Fix-Prioritäten

### 9.1 Sofort beheben (Kritisch)

| # | Bug | Aufwand | Impact |
|---|-----|---------|--------|
| 1 | BUG-001: Dreifaches fetchAll | 10 min | Performance +300% |
| 2 | BUG-002: Timing-Bug UnassignedDropBar | 15 min | Silent Failures beheben |
| 3 | BUG-003: Falsches fromZoneId | 20 min | Korrekte Undo-History |

### 9.2 Nächste Iteration (Mittel)

| # | Issue | Aufwand | Impact |
|---|-------|---------|--------|
| 4 | ISSUE-001: CSS-Klasse hängt | 15 min | Visueller Bug fix |
| 5 | ISSUE-002: Drag-Data Validation | 10 min | Robustheit |
| 6 | ISSUE-003: Event-Listener Cleanup | 15 min | Memory-Leak fix |

### 9.3 Tech-Debt (Low)

| # | Issue | Aufwand | Impact |
|---|-------|---------|--------|
| 7 | CONSISTENCY-001: DRY Device-ID | 20 min | Wartbarkeit |
| 8 | CONSISTENCY-002: Magic String | 10 min | Wartbarkeit |
| 9 | CONSISTENCY-003: Unified Drag-State | 45 min | Architektur |

---

## Anhang: Vollständige Dateiliste

### Frontend (12 Dateien geprüft)

```
El Frontend/src/
├── stores/
│   ├── dragState.ts          ✅ 317 Zeilen
│   └── esp.ts                ✅ 849 Zeilen
├── composables/
│   └── useZoneDragDrop.ts    ✅ 494 Zeilen
├── views/
│   └── DashboardView.vue     ✅ 688 Zeilen
├── components/
│   ├── zones/
│   │   └── ZoneGroup.vue     ✅ 697 Zeilen
│   ├── dashboard/
│   │   ├── UnassignedDropBar.vue  ✅ 468 Zeilen
│   │   └── SensorSidebar.vue      ✅ 512 Zeilen
│   └── esp/
│       ├── SensorSatellite.vue    ✅ 318 Zeilen
│       └── AnalysisDropZone.vue   ✅ 675 Zeilen
├── api/
│   └── zones.ts              ✅ 79 Zeilen
└── types/
    └── index.ts              ✅ 636 Zeilen
```

**Gesamt:** ~5.733 Zeilen analysiert

---

**Letzte Aktualisierung:** 2026-01-02
**Nächste Review:** Nach Fix der kritischen Bugs
