# Frontend-Analyse: Sensor Operating Modes (Phase 2B)

> **Erstellt:** 2026-01-07
> **Verifiziert:** 2026-01-07 (Codebase-Abgleich vollständig)
> **Analyse-Fokus:** Mock vs Real ESP Sensor-Hinzufügung per Drag & Drop
> **Kritisches Problem gefunden:** Sensor-Hinzufügung funktioniert NUR für Mock-ESPs

---

## EXECUTIVE SUMMARY: Das Problem

### Aktueller Zustand

| Aspekt | Mock ESPs | Real ESPs |
|--------|-----------|-----------|
| Drag & Drop auf ESP | ✅ Funktioniert | ❌ **BLOCKIERT** |
| Modal öffnet sich | ✅ Ja | ❌ Nein (Funktion returned sofort) |
| API-Route | `/debug/mock-esp/{id}/sensors` | Existiert: `/sensors/{espId}/{gpio}` |
| Store-Action | `addSensor()` | ❌ Wirft Error |

### Root Cause: 5 Blockaden (verifiziert)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ BLOCKADE 1: ESPOrbitalLayout.vue:279                                         │
│ ─────────────────────────────────────────────────────────────────────────── │
│ async function addSensor() {                                                 │
│   if (!isMock.value) return  ← ❌ BLOCKT alle Real ESPs!                     │
│   ...                                                                        │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ BLOCKADE 2: ESPOrbitalLayout.vue:878 (Modal v-if)                            │
│ ─────────────────────────────────────────────────────────────────────────── │
│ <div v-if="showAddSensorModal && isMock" ...>  ← ❌ Real ESPs sehen Modal nie│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ BLOCKADE 3: ESPOrbitalLayout.vue:664-665 (CSS-Klassen)                       │
│ ─────────────────────────────────────────────────────────────────────────── │
│ 'esp-horizontal-layout--can-drop': dragStore.isDraggingSensorType && isMock, │
│ 'esp-horizontal-layout--drag-over': isDragOver && isMock                     │
│ ← ❌ Kein visuelles Feedback für Real ESPs beim Drag!                        │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ BLOCKADE 4: esp.ts Store:442-457                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│ async function addSensor(deviceId: string, config: MockSensorConfig) {       │
│   if (!isMock(deviceId)) {                                                   │
│     throw new Error('Add sensor is only available for Mock ESPs')  ← ❌      │
│   }                                                                          │
│   await debugApi.addSensor(deviceId, config)                                 │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ BLOCKADE 5: debug.ts:128-134                                                 │
│ ─────────────────────────────────────────────────────────────────────────── │
│ async addSensor(espId: string, config: MockSensorConfig) {                   │
│   return api.post(`/debug/mock-esp/${espId}/sensors`, config)  ← Mock-Route! │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Lösung existiert bereits!

Die API für echte ESPs existiert in `sensors.ts:14-28`:

```typescript
// sensors.ts - BEREITS VORHANDEN!
async createOrUpdate(espId: string, gpio: number, config: SensorConfigCreate) {
  return api.post(`/sensors/${espId}/${gpio}`, config)  // ← Richtige Route!
}
```

---

## 1. Dashboard-Struktur

### 1.1 DashboardView.vue

**Pfad:** `El Frontend/src/views/DashboardView.vue`

Die Dashboard-View orchestriert das Haupt-Layout mit:
- Zonen-Container (links)
- ESP-Cards (via VueDraggable für Reordering)
- SensorSidebar (rechts)

### 1.2 ESPOrbitalLayout.vue (Haupt-Komponente)

**Pfad:** `El Frontend/src/components/esp/ESPOrbitalLayout.vue`

**Template-Struktur:**
```
ESPOrbitalLayout
├── Left Column: Sensors (SensorSatellite)
├── Center Column: ESP Info Card
│   ├── Header (Name, Status, WiFi, Heartbeat)
│   └── AnalysisDropZone (Multi-Sensor Chart)
├── Right Column: Actuators (ActuatorSatellite)
└── **Inline Modal: "Sensor hinzufügen"** (Zeile 877-972) ← KRITISCH!
```

**Props:**
```typescript
interface Props {
  device: ESPDevice
  showConnections?: boolean  // default: true
  compactMode?: boolean      // default: false
}
```

**Events:**
```typescript
emit('sensorClick', gpio: number)
emit('actuatorClick', gpio: number)
emit('sensorDropped', sensor: ChartSensor)
emit('heartbeat', device: ESPDevice)
emit('delete', device: ESPDevice)
emit('settings', device: ESPDevice)
emit('name-updated', { deviceId: string; name: string | null })
```

### 1.3 ESPCard.vue

**Pfad:** `El Frontend/src/components/esp/ESPCard.vue`

Wird in ESPOrbitalLayout im `v-else` (Full Mode) verwendet. Nicht für die kompakte Dashboard-Ansicht relevant.

---

## 2. Drag & Drop System

### 2.1 DragState Store (Industrial-Grade)

**Pfad:** `El Frontend/src/stores/dragState.ts`

**State:**
```typescript
isDraggingSensorType: boolean   // Sidebar → ESP Drop
sensorTypePayload: SensorTypeDragPayload | null
isDraggingSensor: boolean       // Sensor → Chart Drop
sensorPayload: SensorDragPayload | null
draggingSensorEspId: string | null
isDraggingEspCard: boolean      // ESP Card Reordering
```

**Key Actions:**
```typescript
startSensorTypeDrag(payload)  // Sidebar-Sensor startet Drag
startSensorDrag(payload)      // Sensor-Satellite startet Drag
endDrag()                     // Cleanup
```

**Safety Features:**
- 30s Timeout für hängende Drags
- Global Event Listeners
- Escape-Key Cancellation

### 2.2 SensorSidebar.vue

**Pfad:** `El Frontend/src/components/dashboard/SensorSidebar.vue`

**Funktionalität:**
- Zeigt Sensor-Typen gruppiert nach Kategorien
- Drag-Elemente mit `draggable="true"`
- `@dragstart` setzt `dragStore.startSensorTypeDrag()`

**Drag-Payload (application/json):**
```typescript
{
  action: 'add-sensor',
  sensorType: 'DS18B20',  // etc.
  label: 'Temperatur (DS18B20)',
  defaultUnit: '°C',
  icon: 'Thermometer'
}
```

### 2.3 Drop-Flow (Aktuell - NUR MOCK!)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. User draggt Sensor aus SensorSidebar                                     │
│    └── dragStore.startSensorTypeDrag(payload)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. ESPOrbitalLayout zeigt Drop-Indicator                                    │
│    └── isDragOver = true (nur wenn isMock!)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. User droppt auf ESP-Card                                                 │
│    └── onDrop() in ESPOrbitalLayout.vue:229-275                             │
│        ├── Parsed JSON-Payload                                              │
│        ├── Pre-fills newSensor form                                         │
│        └── showAddSensorModal.value = true                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Modal öffnet sich (Zeile 877-972)                                        │
│    └── Felder: GPIO, Sensor-Typ, Name, Subzone, Startwert, Einheit          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. User klickt "Hinzufügen"                                                 │
│    └── addSensor() in ESPOrbitalLayout.vue:278-290                          │
│        ├── if (!isMock.value) return  ← ❌ BLOCKADE FÜR REAL ESPs!          │
│        ├── espStore.addSensor(espId, config)                                │
│        └── (das ruft debugApi.addSensor auf - Mock-Route!)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. espStore.fetchAll() refresht UI                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Das Sensor-Einstellungsfenster (KRITISCH!)

### 3.1 Modal-Komponente: INLINE in ESPOrbitalLayout.vue

**Exakter Pfad:** `El Frontend/src/components/esp/ESPOrbitalLayout.vue` (Zeile 877-972)

**KEIN separates SensorConfigModal.vue existiert!**

Das Modal ist direkt inline im Template definiert:

```html
<!-- Add Sensor Modal (Teleport to body) -->
<Teleport to="body">
  <div v-if="showAddSensorModal && isMock" class="modal-overlay">
    <!-- ⚠️ PROBLEM: v-if="... && isMock" - Real ESPs sehen Modal nie! -->
    ...
  </div>
</Teleport>
```

### 3.2 Aktuelle Modal-Felder

| Feld | Typ | Bound To | Beschreibung |
|------|-----|----------|--------------|
| GPIO | `<input type="number">` | `newSensor.gpio` | 0-39 |
| Sensor-Typ | `<select>` | `newSensor.sensor_type` | Dropdown mit allen Typen |
| Name | `<input type="text">` | `newSensor.name` | Optional |
| Subzone | `<input type="text">` | `newSensor.subzone_id` | Optional |
| Startwert | `<input type="number">` | `newSensor.raw_value` | Initial-Wert |
| Einheit | `<input readonly>` | `newSensor.unit` | Auto aus Sensor-Typ |

### 3.3 newSensor State (Zeile 99-108)

```typescript
const newSensor = ref<MockSensorConfig>({
  gpio: 0,
  sensor_type: defaultSensorType,
  name: '',
  subzone_id: '',
  raw_value: getSensorDefault(defaultSensorType),
  unit: getSensorUnit(defaultSensorType),
  quality: 'good',
  raw_mode: true
})
```

### 3.4 Submit-Handler: addSensor() (Zeile 278-290)

```typescript
async function addSensor() {
  if (!isMock.value) return  // ← ❌ BLOCKADE!

  try {
    await espStore.addSensor(espId.value, newSensor.value)
    showAddSensorModal.value = false
    resetNewSensor()
    await espStore.fetchAll()
  } catch (error) {
    console.error('[ESPOrbitalLayout] Failed to add sensor:', error)
  }
}
```

### 3.5 Empfohlene Einfügestelle für Operating Mode

**Nach:** Sensor-Typ Dropdown
**Vor:** Name-Feld
**Begründung:** Operating Mode ist eng mit Sensor-Typ verbunden

```html
<!-- Zeile ~914 - Nach Sensor-Typ -->
<div class="form-group">
  <label class="form-label">Sensor-Typ</label>
  <select v-model="newSensor.sensor_type" class="form-select">...</select>
</div>

<!-- HIER EINFÜGEN: Operating Mode -->
<div class="form-group">
  <label class="form-label">Operating Mode</label>
  <select v-model="newSensor.operating_mode" class="form-select">
    <option value="pi_enhanced">Pi-Enhanced (Server)</option>
    <option value="local">Local (ESP)</option>
    <option value="raw">Raw (Rohdaten)</option>
  </select>
</div>

<!-- Zeile ~917 - Name -->
<div class="form-group">
  <label class="form-label">Name (optional)</label>
  ...
</div>
```

---

## 4. API & Store Integration

### 4.1 Zwei Sensor-APIs existieren

#### Mock-ESP API (debug.ts)

```typescript
// Für Mock-ESPs
async addSensor(espId: string, config: MockSensorConfig) {
  return api.post(`/debug/mock-esp/${espId}/sensors`, config)
}
```

#### Real-ESP API (sensors.ts) - BEREITS VORHANDEN!

```typescript
// Für echte ESPs - EXISTIERT BEREITS!
async createOrUpdate(espId: string, gpio: number, config: SensorConfigCreate) {
  return api.post(`/sensors/${espId}/${gpio}`, {
    ...config,
    esp_id: espId,
    gpio,
  })
}
```

### 4.2 ESP Store - Aktuelle Implementierung

**Pfad:** `El Frontend/src/stores/esp.ts`

```typescript
// Zeile 442-457 - NUR Mock-Support!
async function addSensor(deviceId: string, config: MockSensorConfig) {
  if (!isMock(deviceId)) {
    throw new Error('Add sensor is only available for Mock ESPs')
  }

  await debugApi.addSensor(deviceId, config)
  await fetchDevice(deviceId)
}
```

### 4.3 Benötigte Store-Erweiterung

```typescript
// NEU: Generische addSensor() für beide ESP-Typen
async function addSensor(deviceId: string, config: MockSensorConfig | SensorConfigCreate) {
  if (isMock(deviceId)) {
    // Mock-ESP: Debug-API verwenden
    await debugApi.addSensor(deviceId, config as MockSensorConfig)
  } else {
    // Real-ESP: Sensor-API verwenden
    const realConfig: SensorConfigCreate = {
      esp_id: deviceId,
      gpio: config.gpio,
      sensor_type: config.sensor_type,
      name: config.name || null,
      enabled: true,
      processing_mode: config.raw_mode ? 'raw' : 'pi_enhanced',
      // Operating Mode Felder hier einfügen!
    }
    await sensorsApi.createOrUpdate(deviceId, config.gpio, realConfig)
  }

  await fetchDevice(deviceId)
}
```

---

## 5. TypeScript Types

### 5.1 MockSensorConfig (für Mocks)

**Pfad:** `El Frontend/src/types/index.ts` (Zeile 137-146)

```typescript
export interface MockSensorConfig {
  gpio: number
  sensor_type: string
  name?: string
  subzone_id?: string
  raw_value?: number
  unit?: string
  quality?: QualityLevel
  raw_mode?: boolean
}
```

### 5.2 SensorConfigCreate (für Real ESPs)

**Pfad:** `El Frontend/src/types/index.ts` (Zeile 327-341)

```typescript
export interface SensorConfigCreate {
  esp_id: string
  gpio: number
  sensor_type: string
  name?: string | null
  enabled?: boolean
  interval_ms?: number
  processing_mode?: 'pi_enhanced' | 'local' | 'raw'  // ← Operating Mode!
  calibration?: Record<string, unknown> | null
  threshold_min?: number | null
  threshold_max?: number | null
  warning_min?: number | null
  warning_max?: number | null
  metadata?: Record<string, unknown> | null
}
```

### 5.3 TypeScript Type: SensorOperatingMode

**WICHTIG:** `processing_mode` existiert bereits in `SensorConfigCreate` (Zeile 334):

```typescript
// BEREITS VORHANDEN in types/index.ts:327-341!
export interface SensorConfigCreate {
  esp_id: string
  gpio: number
  sensor_type: string
  name?: string | null
  enabled?: boolean
  interval_ms?: number
  processing_mode?: 'pi_enhanced' | 'local' | 'raw'  // ← EXISTIERT BEREITS!
  calibration?: Record<string, unknown> | null
  threshold_min?: number | null
  threshold_max?: number | null
  warning_min?: number | null
  warning_max?: number | null
  metadata?: Record<string, unknown> | null
}
```

**OPTIONAL: Separater Type für Wiederverwendung:**

```typescript
// Optional zu erstellen für bessere Wartbarkeit:
export type SensorOperatingMode = 'pi_enhanced' | 'local' | 'raw'

// Erweitert (aus Phase 2A):
export interface SensorOperatingModeConfig {
  mode: SensorOperatingMode
  timeout_warning_enabled?: boolean
  timeout_seconds?: number
  fallback_mode?: SensorOperatingMode
}
```

---

## 6. sensorDefaults.ts

**Pfad:** `El Frontend/src/utils/sensorDefaults.ts`

### 6.1 Aktuelle Struktur

```typescript
export interface SensorTypeConfig {
  label: string
  unit: string
  min: number
  max: number
  decimals: number
  icon: string
  defaultValue: number
  description?: string
  category: SensorCategoryId
}
```

### 6.2 Empfohlene Erweiterung

```typescript
export interface SensorTypeConfig {
  // ... existing fields ...

  /** Empfohlener Operating Mode für diesen Sensor-Typ */
  recommendedMode?: SensorOperatingMode

  /** Unterstützte Operating Modes (für Validation) */
  supportedModes?: SensorOperatingMode[]
}

// Beispiel:
'pH': {
  label: 'pH-Wert',
  unit: 'pH',
  recommendedMode: 'pi_enhanced',  // Empfohlen: Server-Verarbeitung
  supportedModes: ['pi_enhanced', 'local', 'raw'],
  // ...
}
```

---

## 7. Wiederverwendbare Komponenten

**Pfad:** `El Frontend/src/components/common/`

| Komponente | Zweck | Für uns relevant |
|------------|-------|------------------|
| Modal.vue | Modal Container | Könnte das Inline-Modal ersetzen |
| Badge.vue | Status Badge | Für Mode-Anzeige auf Sensor-Cards |
| Kein Select.vue | - | Natives `<select>` wird verwendet |

**Form-Pattern (aus Modal in ESPOrbitalLayout):**
```css
.form-row { grid-template-columns: 1fr 1fr; }
.form-group { display: flex; flex-direction: column; gap: 0.375rem; }
.form-label { font-size: 0.75rem; font-weight: 500; }
.form-input, .form-select { padding: 0.625rem 0.75rem; border-radius: 0.375rem; }
```

---

## 8. Implementierungsplan

### Phase 1: UI für beide ESP-Typen aktivieren (API-Routing bleibt getrennt!)

> **WICHTIG:** Die API-Routen für Mock-ESPs und Real-ESPs bleiben **vollständig getrennt**.
> Der `isMock`-Check im Store bleibt bestehen und routet zur korrekten API.
> Nur die **UI-Blockaden** (Modal, CSS-Klassen, Drop-Indicator) werden für Real-ESPs geöffnet.

| Datei | Zeile | Änderung | Routing-Auswirkung |
|-------|-------|----------|-------------------|
| `ESPOrbitalLayout.vue` | 279 | `if (!isMock.value) return` → Routing-Logik in Store | Store entscheidet API |
| `ESPOrbitalLayout.vue` | 878 | `v-if="... && isMock"` → `v-if="showAddSensorModal"` | Nur UI |
| `ESPOrbitalLayout.vue` | 664-665 | `&& isMock` aus CSS-Klassen entfernen | Nur UI |
| `ESPOrbitalLayout.vue` | 870 | `&& isMock` aus Drop-Indikator entfernen | Nur UI |
| `esp.ts` | 442-457 | `addSensor()` erweitern mit Routing-Logik | **Routing-Logik hier!** |

**Routing-Logik im Store (esp.ts):**
```typescript
async function addSensor(deviceId: string, config: ...) {
  if (isMock(deviceId)) {
    await debugApi.addSensor(...)      // → /debug/mock-esp/{id}/sensors
  } else {
    await sensorsApi.createOrUpdate(...) // → /sensors/{espId}/{gpio}
  }
}
```

### Phase 2: Operating Mode UI hinzufügen

| Datei | Änderung | Aufwand |
|-------|----------|---------|
| `ESPOrbitalLayout.vue` | Operating Mode Dropdown ins Modal | Klein |
| `types/index.ts` | `SensorOperatingMode` Type | Klein |
| `sensorDefaults.ts` | `recommendedMode` pro Sensor-Typ | Klein |

### Phase 3: Type-Mapping

| Datei | Änderung | Aufwand |
|-------|----------|---------|
| `esp.ts` | Config-Mapping Mock ↔ Real | Mittel |

---

## 9. Kritische Code-Stellen (verifiziert)

### 9.1 ESPOrbitalLayout.vue - Alle zu ändernden Zeilen

```typescript
// Zeile 279 - ENTFERNEN ODER ANPASSEN:
if (!isMock.value) return

// Zeile 282 - ANPASSEN für beide ESP-Typen:
await espStore.addSensor(espId.value, newSensor.value)
```

```html
<!-- Zeile 664-665 - && isMock aus CSS-Klassen ENTFERNEN: -->
:class="{
  'esp-horizontal-layout--can-drop': dragStore.isDraggingSensorType && isMock,  // ❌ && isMock entfernen
  'esp-horizontal-layout--drag-over': isDragOver && isMock  // ❌ && isMock entfernen
}"

<!-- Zeile 870 - && isMock ENTFERNEN: -->
<div v-if="isDragOver && isMock" class="esp-horizontal-layout__drop-indicator">
<!-- WIRD ZU: -->
<div v-if="isDragOver" class="esp-horizontal-layout__drop-indicator">

<!-- Zeile 878 - && isMock ENTFERNEN: -->
<div v-if="showAddSensorModal && isMock" ...>
<!-- WIRD ZU: -->
<div v-if="showAddSensorModal" ...>
```

### 9.2 esp.ts - Zu erweiternde Funktion

```typescript
// Zeile 442-457 - KOMPLETT UMSCHREIBEN:
async function addSensor(deviceId: string, config: MockSensorConfig) {
  // ... siehe Section 4.3
}
```

---

## 10. Test-Szenarien

### 10.0 Architektur-Übersicht: Parallel-Betrieb Mock + Real ESPs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PARALLEL-BETRIEB: Mock + Real ESPs nebeneinander (UNABHÄNGIGE ROUTEN!)      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Mock-ESP "MOCK_001"              Real-ESP "ESP_ABC123"                     │
│  ══════════════════               ═══════════════════                       │
│  ├─ UI: Modal öffnet              ├─ UI: Modal öffnet (NEU!)                │
│  ├─ Store: isMock(id) = true      ├─ Store: isMock(id) = false              │
│  ├─ API-Client: debugApi          ├─ API-Client: sensorsApi                 │
│  ├─ Route: /debug/mock-esp/...    ├─ Route: /sensors/...                    │
│  ├─ Server: debug.py              ├─ Server: sensors.py                     │
│  └─ Handler: add_sensor()         └─ Handler: create_or_update()            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BEIDE Pfade bleiben vollständig getrennt und funktionieren parallel!        │
│ Der Store (esp.ts) entscheidet basierend auf isMock() welche API genutzt    │
│ wird. Die UI ist für beide identisch.                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.1 Mock-ESP (muss weiterhin funktionieren - KEINE ÄNDERUNG!)

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| 1 | Drag Sensor aus Sidebar auf Mock-ESP | Drop-Indicator erscheint |
| 2 | Drop auf ESP-Card | Modal öffnet sich |
| 3 | Felder ausfüllen | - |
| 4 | "Hinzufügen" klicken | Store ruft `debugApi.addSensor()` |
| 5 | API-Request | `POST /debug/mock-esp/{id}/sensors` |
| 6 | Response | Sensor erscheint auf ESP-Card |

**Server-Handler:** [debug.py:744](El Servador/god_kaiser_server/src/api/v1/debug.py#L744) `add_sensor()`

### 10.2 Real-ESP (NEU zu implementieren - SEPARATE ROUTE!)

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| 1 | Drag Sensor aus Sidebar auf Real-ESP | Drop-Indicator erscheint (NEU!) |
| 2 | Drop auf ESP-Card | Modal öffnet sich (NEU!) |
| 3 | Felder ausfüllen inkl. Operating Mode | - |
| 4 | "Hinzufügen" klicken | Store ruft `sensorsApi.createOrUpdate()` |
| 5 | API-Request | `POST /sensors/{espId}/{gpio}` |
| 6 | Response | Sensor erscheint auf ESP-Card |

**Server-Handler:** [sensors.py:49](El Servador/god_kaiser_server/src/api/v1/sensors.py#L49) `create_or_update_sensor()`

### 10.3 Parallel-Test (Regression-Check)

**Szenario:** Mock-ESP und Real-ESP gleichzeitig im Dashboard

1. Mock-ESP "MOCK_001" hat bereits 2 Sensoren
2. Real-ESP "ESP_ABC123" hat bereits 1 Sensor
3. Drag neuen Sensor auf Mock-ESP → API: `/debug/mock-esp/MOCK_001/sensors`
4. Drag neuen Sensor auf Real-ESP → API: `/sensors/ESP_ABC123/34`
5. **Beide ESPs zeigen korrekt ihre Sensoren**
6. **Keine Cross-Contamination zwischen Mock und Real**

---

## 11. Offene Fragen

1. **Operating Mode für Mocks?**
   - Soll das Modal für Mocks auch Operating Mode zeigen?
   - Oder nur für Real ESPs?

2. **Server-seitige Änderungen?**
   - Ist `POST /sensors/{espId}/{gpio}` vollständig implementiert?
   - Werden Operating Mode Felder bereits unterstützt?

3. **ESP-Firmware Kommunikation?**
   - Wie wird Operating Mode an Real ESP kommuniziert?
   - MQTT Config-Message oder sofort aktiv?

4. **Validation?**
   - GPIO-Konflikte prüfen?
   - Sensor-Typ Einschränkungen?

---

## 12. Zusammenfassung

### Das Problem in einem Satz

> Das Frontend **blockiert die UI** für echte ESPs durch **5 `isMock`-Checks**, obwohl die API (`/sensors/{espId}/{gpio}`) bereits existiert.

### Die Lösung in 3 Schritten (API-Routen bleiben getrennt!)

1. **UI-Blockaden öffnen:** Die 4 `isMock`-Checks in ESPOrbitalLayout.vue entfernen (Modal, CSS, Drop-Indicator)
2. **Store mit Routing-Logik erweitern:** `addSensor()` routet basierend auf `isMock()`:
   - `isMock=true` → `debugApi.addSensor()` → `/debug/mock-esp/{id}/sensors`
   - `isMock=false` → `sensorsApi.createOrUpdate()` → `/sensors/{espId}/{gpio}`
3. **Operating Mode UI:** Dropdown ins Modal einfügen (nutzt bereits vorhandenes `processing_mode`)

### Architektur-Garantie

```
┌────────────────────────────────────────────────────────────────────┐
│ Mock-ESPs und Real-ESPs arbeiten auf GETRENNTEN API-Routen:       │
│                                                                    │
│ Mock:  /debug/mock-esp/{id}/sensors  →  debug.py (add_sensor)     │
│ Real:  /sensors/{espId}/{gpio}       →  sensors.py (create_or_update) │
│                                                                    │
│ Diese Trennung wird durch die Routing-Logik im Store garantiert.  │
└────────────────────────────────────────────────────────────────────┘
```

### Geschätzter Aufwand

| Phase | Aufwand | Risiko |
|-------|---------|--------|
| UI öffnen + Store-Routing | 2-3h | Niedrig (APIs existieren) |
| Operating Mode UI | 1-2h | Niedrig |
| Type-Mapping | 1h | Niedrig |
| **Gesamt** | **4-6h** | **Niedrig** |

---

## 13. Codebase-Verifizierung (2026-01-07)

### Verifizierte Dateien

| Datei | Zeilen verifiziert | Status |
|-------|-------------------|--------|
| `ESPOrbitalLayout.vue` | 279, 664-665, 870, 878, 99-108 | ✅ Korrekt |
| `esp.ts` | 442-457 | ✅ Korrekt |
| `sensors.ts` | 14-28 (createOrUpdate) | ✅ Korrekt |
| `debug.ts` | 128-134 (addSensor) | ✅ Korrekt |
| `types/index.ts` | 137-146, 327-341 | ✅ Korrekt |
| `sensorDefaults.ts` | 8-27, 67-247 | ✅ Korrekt |
| `dragState.ts` | 45-63, 182-253 | ✅ Korrekt |
| `SensorSidebar.vue` | 168-195 (Drag-Handler) | ✅ Korrekt |
| `DashboardView.vue` | 28, 32 (Component-Imports) | ✅ Korrekt |

### Wichtige Erkenntnisse

1. **`processing_mode` existiert bereits:** In `SensorConfigCreate` (types/index.ts:334) ist das Feld bereits definiert als `'pi_enhanced' | 'local' | 'raw'`

2. **5 Blockaden statt 3:** Zusätzlich zu den dokumentierten 3 Blockaden gibt es 2 weitere in ESPOrbitalLayout.vue (CSS-Klassen und Drop-Indikator)

3. **SensorSidebar.vue funktioniert korrekt:** Der Drag-Payload enthält `action: 'add-sensor'` und triggert den korrekten Flow

4. **DashboardView.vue orchestriert alles:** Importiert ESPOrbitalLayout (Zeile 28) und SensorSidebar (Zeile 32)

### Nächste Schritte

1. ✅ Codebase-Analyse abgeschlossen
2. ⏳ Implementierung Phase 1: UI-Blockaden öffnen + Store-Routing (getrennte APIs!)
3. ⏳ Implementierung Phase 2: Operating Mode UI
4. ⏳ Implementierung Phase 3: Type-Mapping

### Verifizierung der Routen-Trennung (2026-01-07)

| Komponente | Mock-ESP Route | Real-ESP Route | Status |
|------------|----------------|----------------|--------|
| Frontend API | `debug.ts` → `/debug/mock-esp/...` | `sensors.ts` → `/sensors/...` | ✅ Getrennt |
| Server Handler | `debug.py:744` | `sensors.py:49` | ✅ Getrennt |
| Store Routing | `isMock()` entscheidet | `isMock()` entscheidet | ✅ Geplant |

---

**Analyse abgeschlossen und verifiziert.**
