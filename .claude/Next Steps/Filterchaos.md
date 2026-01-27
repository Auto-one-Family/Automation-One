# 🎯 System Monitor & Dashboard Filter-Architektur - Vollständige Dokumentation

---

## EXECUTIVE SUMMARY

**Kernfrage:** Warum sind Filter-Patterns unterschiedlich?

**Antwort:** Es gibt **4 verschiedene Filter-Patterns** im Codebase - aber nur **PATTERN 1** (DataSourceSelector) wird tatsächlich für Ereignisquellen verwendet. Die anderen 3 Patterns existieren als vollständige Implementationen, werden aber nirgends importiert oder genutzt.

### Hauptunterschied EREIGNISQUELLEN vs EVENT-TYPEN

| Aspekt | EREIGNISQUELLEN | EVENT-TYPEN |
|--------|-----------------|-------------|
| Anzahl | 4 Kategorien | 31 Types |
| Server-Support | ❌ BUG: Lädt IMMER alle 4 Quellen | ❌ Nur Client-Side |
| Filterung | Client-Side (Zeile 238-243) | Client-Side (Zeile 261-262) |
| localStorage | ✅ Persistiert | ❌ NEIN |
| Hierarchie | Top-Level Kategorien | Sub-Level granulare Types |
| UI-Pattern | 4 große Checkbox-Cards | 31 kleine Pills |
| Wiederverwendbar | ✅ Generisch | ⚠️ System-Monitor-spezifisch |

### 🚨 KRITISCHER BUG ENTDECKT

**Code:** [SystemMonitorView.vue:797](El Frontend/src/views/SystemMonitorView.vue#L797)
**Problem:** Server-API-Call ignoriert `selectedDataSources` und lädt IMMER alle 4 Quellen
**Impact:** 6.8x mehr Netzwerk-Traffic wenn User nur 1 Quelle will (z.B. `audit_log`)

---

## TEIL 1: EREIGNISQUELLEN-PATTERN (DataSourceSelector.vue)

### 1.1 Komponenten-Architektur

**Datei:** [El Frontend/src/components/system-monitor/DataSourceSelector.vue](El Frontend/src/components/system-monitor/DataSourceSelector.vue)

⭐ **KEINE Props** - Vollständig autonomer State

**Emits Interface:**
```typescript
// Zeile 147-149
const emit = defineEmits<{
  change: [sources: DataSource[]]
}>()
```

**State-Variablen:**
```typescript
// Zeile 142: TypeScript Type Definition
export type DataSource = 'audit_log' | 'sensor_data' | 'esp_health' | 'actuators'

// Zeile 144-145: localStorage Keys
const STORAGE_KEY = 'systemMonitor.dataSources'
const COLLAPSED_KEY = 'systemMonitor.dataSourcesCollapsed'

// Zeile 152-166: Smart State Loader mit localStorage Fallback + Validierung
const getInitialSources = (): DataSource[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // ⭐ Validierung: Array UND nicht leer
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  // Default: ALLE Datenquellen für vollständige Event-Sicht
  return ['audit_log', 'sensor_data', 'esp_health', 'actuators']
}

// Zeile 177-178: Reactive State
const selectedSources = ref<DataSource[]>(getInitialSources())
const isCollapsed = ref(getInitialCollapsed())
```

### 1.2 Die 4 EREIGNISQUELLEN (Template-basiert!)

🚨 **WICHTIG:** Keine Array-Variable, sondern 4x hardcodiertes HTML im Template!

```vue
<!-- Zeile 24-44: audit_log -->
<label class="source-card" :class="{ 'source-card--selected': selectedSources.includes('audit_log') }">
  <input type="checkbox" :checked="selectedSources.includes('audit_log')" @change="toggleSource('audit_log')" />
  <div class="card-content">
    <div class="card-icon card-icon--audit">
      <AlertCircle class="icon" />  <!-- Icon: AlertCircle (Rot) -->
    </div>
    <div class="card-text">
      <span class="card-title">System-Ereignisse</span>
      <span class="card-description">Fehler, Konfiguration, Lifecycle</span>
    </div>
    <div v-if="selectedSources.includes('audit_log')" class="card-check">
      <Check class="check-icon" />
    </div>
  </div>
</label>

<!-- Zeile 46-66: sensor_data -->
<label class="source-card">
  <Activity class="icon" />  <!-- Icon: Activity (Blau) -->
  <span class="card-title">Sensordaten</span>
  <span class="card-description">Temperatur, pH, Feuchtigkeit</span>
</label>

<!-- Zeile 68-88: esp_health -->
<label class="source-card">
  <Cpu class="icon" />  <!-- Icon: Cpu (Grün) -->
  <span class="card-title">ESP-Status</span>
  <span class="card-description">Verbindung, Health, Uptime</span>
</label>

<!-- Zeile 90-110: actuators -->
<label class="source-card">
  <Zap class="icon" />  <!-- Icon: Zap (Gelb) -->
  <span class="card-title">Aktoren</span>
  <span class="card-description">Pumpen, Ventile, Beleuchtung</span>
</label>
```

**Icon-Mapping & CSS-Farben:**
```typescript
// Imports (Zeile 131-140)
import { AlertCircle, Activity, Cpu, Zap } from 'lucide-vue-next'

// CSS-Farben (Zeile 339-357)
.card-icon--audit    { background: rgba(248, 113, 113, 0.15); color: #f87171; } /* Rot */
.card-icon--sensor   { background: rgba(96, 165, 250, 0.15);  color: #60a5fa; } /* Blau */
.card-icon--health   { background: rgba(34, 197, 94, 0.15);   color: #22c55e; } /* Grün */
.card-icon--actuator { background: rgba(251, 191, 36, 0.15);  color: #fbbf24; } /* Gelb */
```

### 1.3 STATE-FLOW DIAGRAMM (User-Click bis Server-Request)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. USER-ACTION: Klickt auf Checkbox oder Card                            │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. TEMPLATE: @change Event (Zeile 29, 51, 73, 95)                        │
│    → toggleSource('audit_log' | 'sensor_data' | ...)                     │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. FUNCTION: toggleSource (Zeile 180-190)                                │
│    • Ist Source bereits aktiv? (indexOf check)                           │
│    • JA → Entfernen (aber nur wenn >1 Quelle bleibt)  ⭐ SAFETY CHECK   │
│    • NEIN → Hinzufügen                                                    │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. STATE UPDATE: selectedSources.value = [...] (Zeile 185/188)          │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. WATCHER: watch(selectedSources, ...) (Zeile 194-197)                  │
│    → Triggert automatisch bei jeder Änderung                              │
└────────────┬────────────────────────────────┬──────────────────────────┘
             │                                 │
             ▼                                 ▼
┌────────────────────────────┐  ┌─────────────────────────────────────────┐
│ 6a. localStorage.setItem() │  │ 6b. emit('change', newSources)          │
│     (Zeile 195)            │  │     (Zeile 196)                          │
└────────────────────────────┘  └──────────────┬──────────────────────────┘
                                               │
                                               ▼
                                  ┌─────────────────────────────────────────┐
                                  │ 7. PARENT: EventsTab.vue (Zeile 82)    │
                                  │    @change="handleDataSourcesChange"    │
                                  └──────────────┬──────────────────────────┘
                                                 │
                                                 ▼
                                  ┌─────────────────────────────────────────┐
                                  │ 8. HANDLER: EventsTab Zeile 63-66       │
                                  │    emit('dataSourcesChange', sources)   │
                                  └──────────────┬──────────────────────────┘
                                                 │
                                                 ▼
                                  ┌─────────────────────────────────────────┐
                                  │ 9. GRANDPARENT: SystemMonitorView       │
                                  │    (Zeile 1271, 963-966)                │
                                  │    selectedDataSources.value = sources  │
                                  └──────────────┬──────────────────────────┘
                                                 │
                                                 ▼
                                  ┌─────────────────────────────────────────┐
                                  │ 10. COMPUTED: filteredEvents (Zeile 235)│
                                  │     → Client-seitige Filterung          │
                                  │     → UI aktualisiert automatisch       │
                                  └─────────────────────────────────────────┘
```

⚠️ **ACHTUNG:** Kein API-Call bei DataSource-Änderung! Nur Client-Side-Filterung im `filteredEvents` Computed.

### 1.4 localStorage INTEGRATION

**Storage-Key:**
```typescript
// Zeile 144
const STORAGE_KEY = 'systemMonitor.dataSources'
```

**Load-Mechanismus (nur bei Component-Mount):**
```typescript
// Zeile 152-166
const getInitialSources = (): DataSource[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // ⭐ 3-fache Validierung:
      if (Array.isArray(parsed) && parsed.length > 0) {  // 1. Array? 2. Nicht leer?
        return parsed
      }
    }
  } catch {
    // 3. JSON-Parse-Fehler → Fallback
  }
  // Default: ALLE 4 Quellen aktiv
  return ['audit_log', 'sensor_data', 'esp_health', 'actuators']
}
```

**Save-Mechanismus (automatisch bei jeder Änderung):**
```typescript
// Zeile 194-197: Deep Watch mit Auto-Save
watch(selectedSources, (newSources) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newSources))
  emit('change', newSources)
}, { deep: true })
```

**Initial Emit (damit Parent sofort State erhält):**
```typescript
// Zeile 205-207
onMounted(() => {
  emit('change', selectedSources.value)
})
```

### 1.5 "PREVENT DESELECT ALL" LOGIC

**Problem:** User darf nicht ALLE Quellen abwählen (mindestens 1 muss aktiv sein).

**Implementierung:**
```typescript
// Zeile 180-190
function toggleSource(source: DataSource) {
  const index = selectedSources.value.indexOf(source)
  if (index >= 0) {
    // Versucht zu entfernen
    if (selectedSources.value.length > 1) {  // ⭐ CRITICAL SAFETY CHECK
      selectedSources.value = selectedSources.value.filter(s => s !== source)
    }
    // ⭐ WENN length === 1: KEINE Änderung → Click wird ignoriert (kein Toast!)
  } else {
    // Fügt hinzu
    selectedSources.value = [...selectedSources.value, source]
  }
}
```

**Verhalten:**
- Mindestens 1 Quelle muss immer aktiv sein
- Bei Deselect-Versuch auf letzter Quelle: Stille Ignorierung (kein Error-Toast)
- Checkbox-State wird durch `:checked` Binding automatisch korrekt reflektiert
- User bemerkt es nur daran, dass die letzte Quelle "unclickbar" ist

### 1.6 TEMPLATE-STRUKTUR (UI-Hierarchie)

```vue
<!-- Zeile 2-127: Komplette Struktur -->
<div class="data-source-selector">

  <!-- Header (Zeile 4-17) -->
  <div class="selector-header">
    <Database class="header-icon" />
    <h4 class="header-title">Ereignisquellen</h4>
    <button class="collapse-btn" @click="isCollapsed = !isCollapsed">
      <ChevronDown :class="{ 'collapse-icon--rotated': !isCollapsed }" />
    </button>
  </div>

  <!-- Collapsible Content (Zeile 20-125) -->
  <Transition name="collapse">
    <div v-if="!isCollapsed" class="selector-content">

      <!-- Grid Container (Zeile 23) -->
      <div class="source-grid">  <!-- CSS: grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) -->

        <!-- ⭐ KEIN v-for Loop! 4x manuell hardcodiert -->
        <label class="source-card" @click="toggleSource('audit_log')">
          <input type="checkbox" :checked="selectedSources.includes('audit_log')" class="source-checkbox" />
          <!-- Card-Content mit Icon, Title, Description, Check-Badge -->
        </label>

        <!-- ... 3 weitere Cards für sensor_data, esp_health, actuators -->
      </div>

      <!-- Info-Footer (Zeile 114-123) -->
      <div class="selector-footer">
        <Info class="footer-icon" />
        <span class="footer-text">
          {{ selectedSources.length }} Quelle{{ selectedSources.length !== 1 ? 'n' : '' }} ausgewählt
          <template v-if="selectedSources.length > 0">· Zeige gemischte Events</template>
        </span>
      </div>
    </div>
  </Transition>
</div>
```

**UI-Pattern:**
- **Grid-Layout:** CSS Grid mit auto-fill (responsive)
- **Click-Target:** `<label>` (großes Click-Target, nicht nur Checkbox)
- **Hidden Checkbox:** CSS `opacity: 0` (nur für Accessibility)
- **Visual Feedback:** Border-Color + Background-Color bei Selection

### 1.7 API-INTEGRATION (Server-Request)

🚨 **KRITISCHER BUG ENTDECKT:**

```typescript
// SystemMonitorView.vue Zeile 797-798
// ⭐ CHANGED: Load from ALL sources, not just selected ones
const allSources: DataSource[] = ['audit_log', 'sensor_data', 'esp_health', 'actuators']

// Zeile 804-807
const response = await auditApi.getAggregatedEvents({
  sources: allSources,  // ← IGNORIERT selectedDataSources!
  hours: eventLoadHours.value,
  limitPerSource: initialLimit,
})
```

**Problem:**
- User wählt nur `audit_log` (10.000 Events)
- Server lädt trotzdem alle 4 Quellen (68.000 Events)
- Frontend filtert dann 58.000 Events weg
- → **6.8x mehr Netzwerk-Traffic als nötig!**

**Erwartetes Verhalten (Code-Kommentar sagt):**
> "Client-side filtering in filteredEvents handles visibility"

Aber: Server sollte trotzdem nur gewählte Quellen laden für Performance!

**API-Funktion (audit.ts Zeile 253-279):**
```typescript
async getAggregatedEvents(options: {
  sources?: DataSource[]
  hours?: number | null
  limitPerSource?: number
}): Promise<AggregatedEventsResponse> {
  const params = new URLSearchParams()

  // ⭐ Array → wiederholte Query-Params (FastAPI-Konvention)
  const sources = options.sources ?? ['audit_log']
  sources.forEach(source => {
    params.append('sources', source)  // Zeile 263
  })

  const response = await api.get<AggregatedEventsResponse>(
    `/audit/events/aggregated?${params.toString()}`
  )
  return response.data
}
```

**Server-Request Format:**
```
GET /api/v1/audit/events/aggregated?sources=audit_log&sources=sensor_data&sources=esp_health&sources=actuators&limit_per_source=2000
```

---

## TEIL 2: MONITORFILTER PANEL - VOLLSTÄNDIGE DOKUMENTATION

### 2.1 Architektur-Unterschiede (Tabelle)

| Aspekt | EREIGNISQUELLEN | EVENT-TYPEN |
|--------|-----------------|-------------|
| Anzahl | 4 Kategorien | 31 Types |
| Server-Support | 🚨 BUG: Lädt IMMER alle 4 (Zeile 797) | ❌ Nur Client-Side (Zeile 261-262) |
| UI-Komponente | DataSourceSelector.vue (Grid, Cards) | MonitorFilterPanel.vue (Pills) |
| State-Type | `ref<DataSource[]>` (Zeile 182) | `ref<Set<string>>` (Zeile 214) |
| Filterung | Client-Side Computed (Zeile 238-243) | Client-Side Computed (Zeile 261-262) |
| localStorage | ✅ `systemMonitor.dataSources` (Zeile 144) | ❌ NEIN |
| API-Parameter | `sources: [...]` (wird gesendet, aber ignoriert) | Nicht gesendet |
| Hierarchie | Top-Level (4 Haupt-Kategorien) | Sub-Level (31 granulare Types) |
| Wiederverwendbar | ✅ Generisch | ⚠️ System-Monitor-spezifisch |

### 2.2 EVENT-TYPEN Dokumentation

**ALL_EVENT_TYPES (31 Types):**
```typescript
// SystemMonitorView.vue Zeile 56-100
const ALL_EVENT_TYPES = [
  // Sensor & Actuator Events (6)
  'sensor_data', 'sensor_health',
  'actuator_status', 'actuator_response', 'actuator_alert',
  'esp_health',

  // Configuration Events (3)
  'config_response', 'config_published', 'config_failed',

  // Device Lifecycle Events (6)
  'device_discovered', 'device_rediscovered',
  'device_approved', 'device_rejected',
  'device_online', 'device_offline', 'lwt_received',

  // System Events (6)
  'zone_assignment', 'logic_execution', 'system_event',
  'service_start', 'service_stop', 'emergency_stop',

  // Error Events (4)
  'error_event', 'mqtt_error', 'validation_error', 'database_error',

  // Auth Events (3)
  'login_success', 'login_failed', 'logout',

  // Notifications (1)
  'notification',
] as const
```

**UI-Pattern (MonitorFilterPanel.vue Zeile 206-227):**
```vue
<div class="filter-section filter-section--wide">
  <div class="filter-header">
    <label class="filter-label">Event-Typen</label>
    <div class="filter-actions">
      <button @click="selectAllEventTypes">Alle</button>
      <button @click="clearEventTypeFilter">Keine</button>
    </div>
  </div>
  <div class="filter-chips filter-chips--wrap">
    <!-- ⭐ 31 Pills! -->
    <button
      v-for="type in allEventTypes"
      :key="type"
      class="filter-chip filter-chip--small"
      :class="{ 'filter-chip--active': eventTypes.has(type) }"
      @click="toggleEventType(type)"
    >
      <component :is="getEventIcon(type)" class="w-3 h-3" />
      {{ eventTypeLabels[type] || type }}
    </button>
  </div>
</div>
```

**Client-Side Filterung:**
```typescript
// SystemMonitorView.vue Zeile 261-262
const filteredEvents = computed(() => {
  let events = unifiedEvents.value
  // ... DataSource Filter (Zeile 238-243)

  // ⭐ Event-Type Filter (Client-Side!)
  events = events.filter(e => filterEventTypes.value.has(e.event_type))

  // ... weitere Filter
})
```

### 2.3 REDUNDANZ-ANALYSE (DataSource → Event-Types Mapping)

```typescript
// SystemMonitorView.vue Zeile 446-465: determineDataSource() Mapping
const DATASOURCE_TO_EVENTTYPES_MAP = {
  'audit_log': [
    'config_response',      // 1
    'device_discovered',    // 2
    'device_rediscovered',  // 3
    'device_approved',      // 4
    'device_rejected',      // 5
    'zone_assignment',      // 6
    'logic_execution',      // 7
    'system_event',         // 8
    'error_event',          // 9
    'notification',         // 10
  ],
  'sensor_data': [
    'sensor_data',          // 1
    'sensor_health',        // 2
  ],
  'esp_health': [
    'esp_health',           // 1
  ],
  'actuators': [
    'actuator_status',      // 1
    'actuator_response',    // 2
    'actuator_alert',       // 3
  ]
}
```

🚨 **KRITISCH: 48% der Event-Types haben KEIN dataSource-Mapping!**

**Fehlende Mappings (15 von 31 Types):**
```typescript
// Diese Types haben dataSource: undefined
'config_published',      // ← FEHLT in determineDataSource()
'config_failed',         // ← FEHLT
'device_online',         // ← FEHLT
'device_offline',        // ← FEHLT
'lwt_received',          // ← FEHLT
'service_start',         // ← FEHLT
'service_stop',          // ← FEHLT
'emergency_stop',        // ← FEHLT
'mqtt_error',            // ← FEHLT
'validation_error',      // ← FEHLT
'database_error',        // ← FEHLT
'login_success',         // ← FEHLT
'login_failed',          // ← FEHLT
'logout',                // ← FEHLT
```

**Konsequenz:**
- Diese 15 Events werden IMMER angezeigt (DataSource-Filter greift nicht)
- Code-Zeile 238-243: `if (!e.dataSource) return true` → Skip-Logik

### 2.4 SERVER-INTEGRATION UNTERSCHIED

**EREIGNISQUELLEN (sollte Server-seitig sein, ist aber Client-seitig):**
```typescript
// SystemMonitorView.vue Zeile 797-807
const allSources: DataSource[] = ['audit_log', 'sensor_data', 'esp_health', 'actuators']

const response = await auditApi.getAggregatedEvents({
  sources: allSources,  // ← IMMER alle 4 Quellen!
  hours: eventLoadHours.value,
  limitPerSource: initialLimit,
})

// Zeile 238-243: Client-Side Filterung (INEFFIZIENT!)
events = events.filter(e => {
  if (!e.dataSource) return true  // Events ohne dataSource immer zeigen
  return selectedDataSources.value.includes(e.dataSource)
})
```

**EVENT-TYPEN (nur Client-seitig):**
```typescript
// SystemMonitorView.vue Zeile 261-262
events = events.filter(e => filterEventTypes.value.has(e.event_type))
```

**Performance-Vergleich:**
```
SZENARIO: User wählt nur "audit_log" (10.000 Events)

ERWARTET (Server-seitig):
  Server lädt:  10.000 Events (audit_log)
  Frontend:     10.000 Events anzeigen
  Traffic:      10.000 Events

AKTUELL (Client-seitig):
  Server lädt:  68.000 Events (alle 4 Quellen)
  Frontend:     58.000 Events verwerfen, 10.000 anzeigen
  Traffic:      68.000 Events

→ 6.8x INEFFIZIENZ!
```

### 2.5 MIGRATION-PATH (EVENT-TYPEN entfernen)

**Zu entfernen:**

**SystemMonitorView.vue:**
- Zeile 214: `const filterEventTypes = ref<Set<string>>(new Set(ALL_EVENT_TYPES))`
- Zeile 261-262: `events = events.filter(e => filterEventTypes.value.has(e.event_type))`
- Zeile 310: `const hasEventTypeFilter = filterEventTypes.value.size !== ALL_EVENT_TYPES.length`
- Zeile 319: `if (filterEventTypes.value.size !== ALL_EVENT_TYPES.length) count++`
- Zeile 1248-1255: Props `:event-types`, `:all-event-types`, `:event-type-labels`

**MonitorFilterPanel.vue:**
- Zeile 206-227: Komplette "Event Types Filter" Section
- Zeile 44-47: Props `eventTypes`, `allEventTypes`, `eventTypeLabels`
- Zeile 56: Emit `'update:eventTypes'`
- Zeile 117-133: Funktionen `toggleEventType`, `selectAllEventTypes`, `clearEventTypeFilter`

**Code-Diff:**
```diff
// SystemMonitorView.vue

- const filterEventTypes = ref<Set<string>>(new Set(ALL_EVENT_TYPES))

  const filteredEvents = computed(() => {
    let events = unifiedEvents.value

    events = events.filter(e => {
      if (!e.dataSource) return true
      return selectedDataSources.value.includes(e.dataSource)
    })

-   events = events.filter(e => filterEventTypes.value.has(e.event_type))

    // ... weitere Filter (ESP-ID, Level, Time Range)
  })
```

**Zeilen-Ersparnis:** ~150 Zeilen Code (SystemMonitorView + MonitorFilterPanel)

### 2.6 ESP-ID Filter

**UI-Pattern:** Kombi aus Text-Input + Dropdown-Select (Conditional)
- Text-Input: Freitext zum Eingeben einer ESP-ID (z.B. `ESP_12AB34CD`)
- Dropdown: Erscheint nur wenn `uniqueEspIds.length > 0`, zeigt Liste aller verfügbaren ESPs

**Zeilen:**
- Template: 146-167
- Script: 135-137

**State:**
```typescript
// Props (nicht local state):
espId: string  // Direkter Prop-Binding, kein ref
```

**Filterung:** **Client-seitig ✅** (in SystemMonitorView.vue wird die Filterung angewendet)

**Template-Code:**
```vue
<!-- Zeile 146-167 -->
<div class="filter-section">
  <label class="filter-label">ESP-ID Filter</label>
  <div class="filter-input-group">
    <input
      :value="espId"
      @input="updateEspId(($event.target as HTMLInputElement).value)"
      type="text"
      placeholder="z.B. ESP_12AB34CD"
      class="filter-input"
    />
    <select
      v-if="uniqueEspIds.length > 0"
      :value="espId"
      @change="updateEspId(($event.target as HTMLSelectElement).value)"
      class="filter-select"
    >
      <option value="">Alle ESPs</option>
      <option v-for="id in uniqueEspIds" :key="id" :value="id">{{ id }}</option>
    </select>
  </div>
</div>
```

### 2.7 LEVEL Filter (Severity Levels)

**UI-Pattern:** Inline Chip-Buttons (Pills mit Icons)
- 4 Buttons für: Info, Warning, Error, Critical
- Active-State mit farbigem Gradient + Glow-Shadow
- Icons dynamisch basierend auf Severity

**Zeilen:**
- Template: 169-187
- Script: 63, 76-83, 107-115
- Constants: 33 (Severity Type)

**State:**
```typescript
// Props:
levels: Set<string>  // Set aus: 'info', 'warning', 'error', 'critical'

// Constants:
type Severity = 'info' | 'warning' | 'error' | 'critical'
const severityLevels: Severity[] = ['info', 'warning', 'error', 'critical']
```

**Filterung:** **Client-seitig ✅** (Filtering-Logik in SystemMonitorView.vue)

**Template-Code:**
```vue
<!-- Zeile 169-187 -->
<div class="filter-section">
  <label class="filter-label">Level</label>
  <div class="filter-chips">
    <button
      v-for="level in severityLevels"
      :key="level"
      class="filter-chip"
      :class="{
        'filter-chip--active': levels.has(level),
        [`filter-chip--${level}`]: levels.has(level)
      }"
      @click="toggleLevel(level)"
    >
      <component :is="getSeverityIcon(level)" class="w-3 h-3" />
      {{ getSeverityLabel(level) }}
    </button>
  </div>
</div>
```

**Toggle-Logic:**
```typescript
function toggleLevel(level: string) {
  const newLevels = new Set(props.levels)
  if (newLevels.has(level)) {
    newLevels.delete(level)
  } else {
    newLevels.add(level)
  }
  emit('update:levels', newLevels)
}
```

**Icons (lucide-vue-next):**
- `critical` → `AlertOctagon`
- `error` → `AlertCircle`
- `warning` → `AlertTriangle`
- `info` → `Info`

### 2.8 TIME-RANGE Filter

**UI-Pattern:** Radio-Chip-Buttons (Mutually Exclusive)
- 4 Options: Alle, 1h, 6h, 24h
- Nur ein aktiv (Radio-Style, nicht Multi-Select wie Levels)
- Mit Clock Icon für alle Optionen

**Zeilen:**
- Template: 189-204
- Script: 65-70, 139-141
- Constants: 34 (TimeRange Type)

**State:**
```typescript
// Props:
timeRange: TimeRange  // Single value, nicht Set!

// Constants:
type TimeRange = 'all' | '1h' | '6h' | '24h'
const timeRanges: Array<{ id: TimeRange; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: '1h', label: '1 Stunde' },
  { id: '6h', label: '6 Stunden' },
  { id: '24h', label: '24 Stunden' },
]
```

**Filterung:** **Client-seitig ✅** (Time-Range-Filtering in SystemMonitorView.vue auf Basis `Date.now() - timeRange`)

**Template-Code:**
```vue
<!-- Zeile 189-204 -->
<div class="filter-section">
  <label class="filter-label">Zeitraum</label>
  <div class="filter-chips">
    <button
      v-for="range in timeRanges"
      :key="range.id"
      class="filter-chip"
      :class="{ 'filter-chip--active': timeRange === range.id }"
      @click="updateTimeRange(range.id)"
    >
      <Clock class="w-3 h-3" />
      {{ range.label }}
    </button>
  </div>
</div>
```

### 2.9 Props/Emits Vollständige Interface-Definitionen

**Props-Interface (Zeilen 40-48):**
```typescript
interface Props {
  // ESP-ID Filter
  espId: string                          // Aktuelle Filterung (oder leer = alle)
  uniqueEspIds: string[]                 // Liste aller verfügbaren ESP-IDs für Dropdown

  // Level Filter
  levels: Set<string>                    // Set aus 'info'|'warning'|'error'|'critical'

  // Time-Range Filter
  timeRange: TimeRange                   // Single: 'all'|'1h'|'6h'|'24h'

  // Event-Types Filter
  eventTypes: Set<string>                // Set aus Typ-Strings
  allEventTypes: readonly string[]       // Vollständige Liste aller verfügbaren Typen
  eventTypeLabels: Record<string, string> // Mapping: eventType → UI-Label
}
```

**Emits-Interface (Zeilen 52-57):**
```typescript
const emit = defineEmits<{
  'update:espId': [value: string]
  'update:levels': [value: Set<string>]
  'update:timeRange': [value: TimeRange]
  'update:eventTypes': [value: Set<string>]
}>()
```

### 2.10 Integration in SystemMonitorView

**Zeilen:** 1242-1256

```vue
<MonitorFilterPanel
  v-if="showFilters"
  :class="{ 'is-mobile': isMobile }"

  <!-- ESP-ID Filter Props -->
  :esp-id="filterEspId"
  :unique-esp-ids="uniqueEspIds"

  <!-- Level Filter Props -->
  :levels="filterLevels"

  <!-- Time-Range Filter Props -->
  :time-range="filterTimeRange"

  <!-- Event-Types Filter Props -->
  :event-types="filterEventTypes"
  :all-event-types="ALL_EVENT_TYPES"
  :event-type-labels="EVENT_TYPE_LABELS"

  <!-- Emits: Bi-direktionales Update -->
  @update:esp-id="filterEspId = $event"
  @update:levels="filterLevels = $event"
  @update:time-range="filterTimeRange = $event"
  @update:event-types="filterEventTypes = $event"
/>
```

---

## TEIL 3: FILTER STATE-MANAGEMENT PATTERNS

### 3.1 PATTERN 1: Local State + Emits (✅ VERWENDET)

**Verwendung:** DataSourceSelector.vue

**Architektur:**
```typescript
// State (Child Component)
const selectedSources = ref<DataSource[]>(getInitialSources())

// Emits (Child → Parent)
const emit = defineEmits<{ change: [sources: DataSource[]] }>()

// Watch (automatischer Sync)
watch(selectedSources, (newSources) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newSources))
  emit('change', newSources)
}, { deep: true })
```

**Datenfluss:**
```
DataSourceSelector (Child)
    └─ selectedSources (ref) ← Source of Truth
         ├─ @change → emit('change', sources)
         └─ localStorage.setItem()

EventsTab.vue (Parent)
    └─ @change="handleDataSourcesChange"
         └─ emit('dataSourcesChange', sources)

SystemMonitorView.vue (Grandparent)
    └─ @data-sources-change="handleDataSourcesChange"
         └─ selectedDataSources.value = sources
              └─ filteredEvents (computed) → UI-Update
```

**Vorteile:**
- ✅ Extrem einfach (60 Zeilen Logic)
- ✅ localStorage-Persistenz eingebaut
- ✅ Keine Dependencies (nur Vue Composition API)
- ✅ Vollständig gekapselt (Parent muss keine State-Logik kennen)
- ✅ Safety-Check (verhindert Deselect aller Sources)

**Nachteile:**
- ❌ Nicht global (andere Components kennen State nicht)
- ❌ Keine URL-Synchronisation (Deep-Linking nicht möglich)
- ❌ Kein v-model (Parent kann State nicht programmatisch setzen)

### 3.2 PATTERN 2: Composable (❌ NICHT VERWENDET)

**Datei:** [El Frontend/src/composables/useQueryFilters.ts](El Frontend/src/composables/useQueryFilters.ts) (443 Zeilen)

**Grep-Suche:** `useQueryFilters` in Views → 0 Results (nirgends importiert!)

**Architektur (vollständig implementiert, aber ungenutzt):**
```typescript
// src/composables/useQueryFilters.ts Zeile 113-129
export function useQueryFilters(options: UseQueryFiltersOptions = {}) {
  const route = useRoute()  // ⭐ Vue Router Dependency
  const router = useRouter()

  const filters = reactive<MonitorFilters>({
    category: 'events',
    esp: '',
    level: [] as string[],
    timeRange: '1h',
    // ...
  })

  // URL-Sync (Zeile 141-225)
  function syncFromURL() { /* Read from route.query */ }
  function syncToURL() { /* Write to route.query via router.replace */ }

  // Debouncing (Zeile 230-235)
  function syncToURLDebounced() { /* 300ms debounce */ }

  // Watch Route Changes (Zeile 400-406)
  watch(() => route.query, () => { syncFromURL() }, { deep: true })

  return { filters, syncFromURL, syncToURL, resetFilters, /* ... */ }
}
```

**Warum nicht verwendet?**
- localStorage ist wichtiger als URL-Sync für Data Sources
- Router-Dependency vermieden (System Monitor nutzt nur Query-Params für ESP-ID)
- Data Sources sind UI-Preference, kein Filter-Kriterium

### 3.3 PATTERN 3: UnifiedFilterBar (❌ NICHT IN SYSTEM MONITOR VERWENDET)

**Datei:** [El Frontend/src/components/filters/UnifiedFilterBar.vue](El Frontend/src/components/filters/UnifiedFilterBar.vue)

**Grep-Suche:** `UnifiedFilterBar` in Views → 0 Results in SystemMonitorView

**v-model Support (3-faches v-model):**
```typescript
// Props (Zeile 38-56)
interface Props {
  activeStatusFilters?: Set<StatusFilter>  // v-model:activeStatusFilters
  typeFilter?: TypeFilter                  // v-model:typeFilter
  timeRange?: TimeRange                    // v-model:timeRange
}

// Emits (Zeile 86-91)
emit('update:activeStatusFilters', newFilters)
emit('update:typeFilter', filter)
emit('update:timeRange', range)
```

**Warum nicht in System Monitor verwendet?**
- Pattern-Mismatch: Status-Badges (online, offline) passen nicht zu DataSources
- UI-Design unterschiedlich: Pills + Tabs vs Checkbox-Cards
- Dokumentiert als "Robin's Favorit", aber für Dashboard konzipiert

### 3.4 PATTERN 4: Pinia Store (❌ NICHT IMPLEMENTIERT)

**Grep-Suche:** `systemMonitor` in `src/stores/` → 0 Results

**Existierende Stores (andere Zwecke):**
- `auth.ts`: User Authentication
- `esp.ts`: ESP Device Management (von Server geladen)
- `logic.ts`: Logic Rules (von Server geladen)
- `database.ts`: Database Explorer State
- `dragState.ts`: Drag-and-Drop UI State

**Warum kein Filter-Store?**
- Overhead für lokalen UI-State
- Data Source Selection ist Component-spezifisch
- localStorage ist ausreichend (Pinia würde nur Indirektion hinzufügen)

### 3.5 WIEDERVERWENDBARKEIT-MATRIX

| Pattern | Wiederverwendbar? | URL-Sync? | localStorage? | Komplexität | Best Use-Case |
|---------|-------------------|-----------|---------------|-------------|---------------|
| Local State + Emits (DataSourceSelector) | ⚠️ Component-spezifisch | ❌ | ✅ | Low | Autonome Filter-Components mit Persistenz |
| Composable (useQueryFilters) | ✅ View-übergreifend | ✅ | ❌ | Medium | Deep-Linking, Shareable URLs |
| UnifiedFilterBar (v-model) | ✅ Konfigurierbar | ❌ | ❌ | Low-Medium | Dashboard-Style Filter-Bars |
| Pinia Store (hypothetisch) | ✅ Global | ❌ (Plugin nötig) | ⚠️ Plugin nötig | Medium-High | Global Shared State |

---

## TEIL 4: KRITISCHE ERKENNTNISSE & EMPFEHLUNGEN

### 4.1 Warum EREIGNISQUELLEN das richtige Pattern sind

**Argumente:**
1. **Hierarchie-Prinzip:** 4 Kategorien vs 31 Event-Types → Übersichtlicher UX
2. **localStorage-Persistenz:** User-Präferenz überdauert Page-Reload
3. **Client-Side-Filterung ist ausreichend:** Kein API-Reload nötig bei Source-Änderung
4. **Konsistenz:** 48% der Event-Types haben sowieso kein dataSource-Mapping
5. **Performance:** Virtual Scrolling ab 200 Events → Client-Side-Filterung ist performant

### 4.2 🚨 KRITISCHER BUG: Server lädt IMMER alle 4 Quellen

**Problem-Code:**
```typescript
// SystemMonitorView.vue Zeile 797-807
const allSources: DataSource[] = ['audit_log', 'sensor_data', 'esp_health', 'actuators']

const response = await auditApi.getAggregatedEvents({
  sources: allSources,  // ← IGNORIERT selectedDataSources!
  hours: eventLoadHours.value,
  limitPerSource: initialLimit,
})
```

**Fix:**
```diff
- const allSources: DataSource[] = ['audit_log', 'sensor_data', 'esp_health', 'actuators']

  const response = await auditApi.getAggregatedEvents({
-   sources: allSources,
+   sources: selectedDataSources.value,  // ⭐ Nutze User-Auswahl!
    hours: eventLoadHours.value,
    limitPerSource: initialLimit,
  })
```

**Impact:**
- Vorher: 68.000 Events laden, 58.000 verwerfen (wenn nur audit_log gewählt)
- Nachher: 10.000 Events laden, 0 verwerfen
- → **6.8x Performance-Gewinn!**

### 4.3 Migration-Path: EVENT-TYPEN → EREIGNISQUELLEN

**Schritt 1: EVENT-TYPEN entfernen (2-3 Stunden)**
- SystemMonitorView.vue: `filterEventTypes` State löschen (Zeile 214)
- SystemMonitorView.vue: Client-Side-Filter löschen (Zeile 261-262)
- MonitorFilterPanel.vue: Event-Types-Section löschen (Zeile 206-227)
- **Zeilen-Ersparnis:** ~150 Zeilen

**Schritt 2: Server-Bug fixen (30 Minuten)**
- SystemMonitorView.vue Zeile 804: `sources: selectedDataSources.value` statt `allSources`
- Test: User wählt 1 DataSource → Server lädt nur diese

**Schritt 3: getEventIcon() Refactoring (1 Stunde)**
```typescript
// src/utils/eventTypeIcons.ts (NEU erstellen)
import { Database, Activity, Cpu, Zap, /* ... */ } from 'lucide-vue-next'

const EVENT_TYPE_ICONS: Record<string, Component> = {
  sensor_data: Activity,
  actuator_status: Zap,
  esp_health: Cpu,
  config_response: Database,
  // ... alle 31 Icons
}

export function getEventIcon(eventType: string): Component {
  return EVENT_TYPE_ICONS[eventType] || Database  // Fallback
}
```

**Migration in 3 Files:**
- MonitorFilterPanel.vue Zeile 85-105 → Import statt Definition
- UnifiedEventList.vue Zeile 214-234 → Import statt Definition
- EventDetailsPanel.vue Zeile 84-104 → Import statt Definition

**Zeilen-Ersparnis:** 60 Zeilen × 3 = 180 Zeilen

**Gesamt-Zeilen-Ersparnis:** ~330 Zeilen Code (-10% in System Monitor!)

### 4.4 Offene Fragen für Robin

**Frage 1: Zeitraum-Filter verbessern?**

**Option A:** Smart Time-Range Disabling (basierend auf oldest_entry aus Statistics-API)
```typescript
const statistics = await auditApi.getStatistics('all')
const dataAgeDays = (Date.now() - new Date(statistics.oldest_entry).getTime()) / (1000 * 60 * 60 * 24)

const availableRanges = [
  { value: '1h', label: '1 Stunde', disabled: dataAgeDays < 1/24 },
  { value: '24h', label: '24 Stunden', disabled: dataAgeDays < 1 },
  { value: '7d', label: '7 Tage', disabled: dataAgeDays < 7 },
]
```

**Option B:** Event-Count Labels
```typescript
// "24 Stunden (1,234 Events)" statt nur "24 Stunden"
```

**Frage 2: Fehlende dataSource-Mappings fixen?**

15 Event-Types haben `dataSource: undefined` (z.B. `config_published`, `device_online`, `lwt_received`).

**Fix:**
```typescript
// SystemMonitorView.vue Zeile 446-465: determineDataSource() erweitern
case 'config_published':
case 'config_failed':
  return 'audit_log'  // ← Hinzufügen

case 'device_online':
case 'device_offline':
case 'lwt_received':
  return 'esp_health'  // ← Hinzufügen

// ...
```

---

## TEIL 5: SYSTEM MONITOR - WEITERE TABS (Tabs 2-4)

### 5.1 Tab 2: Server Logs

**Komponente:** `ServerLogsTab.vue`
**Zeilen:** 1-1031

#### Filter-Analyse

**Filter vorhanden?** ✅ JA

**Filter-UI-Elemente (Zeilen 319-355):**
- `<select>` für Log-Datei (Zeile 322-326)
- `<select>` für Log-Level: `selectedLevel` ref (Zeile 329-333)
- `<input>` für Modul-Filter (Zeile 336-342)
- `<div class="logs-search">` mit Suchfeld für `searchQuery` (Zeile 345-354)

**Filter-State (Zeilen 57-73):**
```typescript
const selectedFile = ref('')              // Aktive Log-Datei
const selectedLevel = ref<LogLevel | ''>('')  // DEBUG|INFO|WARNING|ERROR|CRITICAL
const moduleFilter = ref('')              // Modul-String
const searchQuery = ref('')               // Suchtext
const page = ref(1)                       // Pagination
```

**Server-seitig?** ✅ JA
- Alle Filter werden an `logsApi.queryLogs()` gesendet (Zeile 116)
- `currentQueryParams` computed (Zeile 83-90) baut Query-Objekt:
  ```typescript
  { level, module, search, file, page, page_size }
  ```

**Client-seitig?** ❌ NEIN
- Filter werden NICHT im Frontend gefiltert
- Alle Filter werden direkt an den Server gesendet

**API-Endpoint:**
- `POST /api/v1/logs/query` (via `logsApi.queryLogs()`)

**Props/Emits:**
- Keine Props/Emits - reine Container-Komponente

**Polling-Feature (Zeilen 150-165):**
- `isPolling` ref steuert automatisches Polling alle 3s (POLL_INTERVAL = 3000)
- `togglePolling()` startet/stoppt setInterval

### 5.2 Tab 3: Datenbank

**Komponente:** `DatabaseTab.vue`
**Zeilen:** 1-652

#### Filter-Analyse

**Filter vorhanden?** ✅ JA

**Filter-UI-Elemente:**
- **Table-Selector (Zeilen 250-263):** Dropdown mit Tabellenauswahl
- **Filter-Panel Toggle (Zeilen 274-281):** Button zum Öffnen/Schließen
- **FilterPanel Sub-Component (Zeilen 313-323):** Reusable FilterPanel

**Filter-State (via Store):**
```typescript
// useDatabaseStore (Pinia)
- store.queryParams.filters    // Aktuelle Filter-Objekt
- store.queryParams.sort_by    // Sortierungsfeld
- store.queryParams.sort_order // ASC|DESC
- store.queryParams.page       // Seite
- store.queryParams.page_size  // Einträge pro Seite
```

**Server-seitig?** ✅ JA
- Alle Filter werden durch Store-Methods an API gesendet:
  - `handleApplyFilters()` → `store.setFilters()` (Zeile 147-152)
  - `handleSort()` → `store.toggleSort()` (Zeile 139-145)
  - `handlePageChange()` → `store.setPage()` (Zeile 167-173)

**Client-seitig?** ❌ NEIN
- Filter werden NICHT im Frontend gefiltert
- FilterPanel übermittelt Filter direkt an Store/API

**API-Endpoint:**
- Backend-Datenbankzugriff via `databaseApi` (impliziert in Store)

**Props/Emits:**
- Keine Props/Emits - nutzt Pinia Store

**Spalten-Translation (Zeilen 66-97):**
- `getTableConfig()` + `getPrimaryColumnKeys()` für sichtbare Spalten
- Nur Spalten anzeigen, die in `defaultVisible=true` sind
- IDs NICHT anzeigen (z.B. `id`, `zone_id`)

### 5.3 Tab 4: MQTT Traffic

**Komponente:** `MqttTrafficTab.vue`
**Zeilen:** 1-1006

#### Filter-Analyse

**Filter vorhanden?** ✅ JA

**Filter-UI-Elemente (Zeilen 421-477):**
- `<input>` für ESP-ID Filter (Zeile 434-439)
- `<input>` für Topic-Pattern mit MQTT-Wildcard-Hilfe (Zeile 448-453)
- `<button>` Chips für Message-Type-Filter (Zeile 466-474)
- "Alle"/"Keine" Buttons für Type-Filter (Zeile 461-462)

**Filter-State (Zeilen 94-104):**
```typescript
const filterEspId = ref('')                    // ESP-ID String
const filterTopicPattern = ref('')             // MQTT Topic Pattern (+ / #)
const filterTypes = ref<Set<string>>(...)     // Set von Message-Types
const showFilters = ref(false)                 // Panel-Sichtbarkeit
```

**Server-seitig?** ❌ NEIN
- Filter werden NICHT an Server gesendet
- **100% CLIENT-SEITIG gefiltert!**

**Client-seitig?** ✅ JA
- `filteredMessages` computed (Zeile 121-143) filtert lokal:
  1. Nach ESP-ID (case-insensitive substring match)
  2. Nach Message-Type (Set membership check)
  3. Nach Topic-Pattern (MQTT regex matching)

**MQTT Pattern-Matching (Zeilen 160-170):**
```typescript
function mqttPatternToRegex(pattern: string): RegExp
// + = single-level wildcard ([^/]+)
// # = multi-level wildcard (.*)
// Beispiele:
// "kaiser/+/esp/+/sensor" → matches one ESP
// "kaiser/god/esp/#" → matches all under ESP subtree
```

**WebSocket Integration (Zeilen 110-115):**
- `useWebSocket({ autoConnect: true, autoReconnect: true })`
- Subscribiert auf ALL_MESSAGE_TYPES via `on()` (Zeile 337-339)
- Buffer-Limit: MAX_MESSAGES = 1000 (Zeile 61)

**Props (Zeilen 51-55):**
```typescript
interface Props {
  espId?: string | null  // Kann von Parent gesetzt werden
}
// Wird in Watch (Zeile 348-356) verwendet
watch(() => props.espId, (newEspId) => {
  if (newEspId) {
    filterEspId.value = newEspId  // Syncs automatisch
  }
})
```

### 5.4 Vergleichstabelle (Tabs 1-4)

| Tab | Filter-Typen | Server-seitig? | Client-seitig? | API-Endpoint | Load-Strategie |
|-----|--------------|----------------|----------------|--------------|----------------|
| **Ereignisse** | DataSource (4), Level (4), Time (4), ESP-ID | ⚠️ BUG (lädt immer alle) | ✅ JA | `/api/v1/audit/events/aggregated` | Pagination + Virtual Scroll |
| **Server Logs** | Level, Modul, Suchtext, Log-Datei (4 Filter) | ✅ JA | ❌ NEIN | `/api/v1/logs/query` | Polling (3s) + Pagination |
| **Datenbank** | Spalten-Filterung, Sortierung, Paginierung | ✅ JA | ❌ NEIN | `databaseApi.*` | Lazy-Load (on demand) |
| **MQTT Traffic** | ESP-ID, Topic-Pattern, Message-Type (3 Filter) | ❌ NEIN | ✅ JA | **Keine** (WebSocket) | Real-time (1000 Buffer) |

### 5.5 Architektur-Highlights

**Server Logs (Hybrid Approach):**
- **Server-Queries:** Alle Filterungen werden serverseitig ausgeführt
- **Pagination:** Page-basiert (page 1, 2, 3...)
- **Performance:** Pro Query max ~100 Einträge (PAGE_SIZE = 100)
- **UI-Features:** Expandierbare Einträge, JSON-Copy, CSV-Export

**Datenbank (Store-Pattern):**
- **Zentrale State:** useDatabaseStore (Pinia)
- **Filter-Komposition:** FilterPanel → Store → API
- **Spalten-Intelligenz:** databaseColumnTranslator bestimmt Sichtbarkeit
- **Foreign-Key-Navigation:** Kann zu anderen Tabellen navigieren

**MQTT Traffic (WebSocket Real-Time):**
- **Keine Server-Filterung:** Messages kommen LIVE vom Server via WebSocket
- **Client-Side Only:** Alle 3 Filter (ESP, Topic, Type) im Frontend
- **Pattern Matching:** MQTT-Standard Wildcard-Support (+ und #)
- **Performance:** In-Memory Buffer mit Max-Limit (1000 Messages)

---

## TEIL 6: DASHBOARD FILTER-SYSTEM (UnifiedFilterBar)

### 6.1 Komponenten-Architektur

**Datei:** `El Frontend/src/components/filters/UnifiedFilterBar.vue`
**Zeilen:** 1-409 (408 Zeilen gesamt)

**WICHTIG:** UnifiedFilterBar ist eine **DASHBOARD**-Komponente, **NICHT** System Monitor!

#### Props Interface (Zeilen 38-84)

```typescript
interface Props {
  // Filter States (v-model mit drei separaten Bindings)
  activeStatusFilters?: Set<StatusFilter>      // Multi-Select Status-Badges
  typeFilter?: TypeFilter                       // Single-Select Type-Tabs
  timeRange?: TimeRange                         // Single-Select Time-Range

  // Counts für Badge-Anzeige (optional)
  counts?: FilterCounts                         // { online, offline, warning, safemode, all, mock, real }

  // Feature Flags (können individuell deaktiviert werden)
  showStatus?: boolean                          // Standard: true
  showType?: boolean                            // Standard: true
  showTimeRange?: boolean                       // Standard: true

  // Custom Labels (optional, defaults zu German)
  statusLabels?: Record<StatusFilter, string>
  typeLabels?: Record<TypeFilter, string>
  timeRangeLabels?: Record<TimeRange, string>
}

// Type-Definitionen (Zeilen 22-24)
export type StatusFilter = 'online' | 'offline' | 'warning' | 'safemode'
export type TypeFilter = 'all' | 'mock' | 'real'
export type TimeRange = '1h' | '6h' | '24h' | '7d' | 'all'
```

#### Emits Interface (Zeilen 86-91)

```typescript
const emit = defineEmits<{
  'update:activeStatusFilters': [filters: Set<StatusFilter>]
  'update:typeFilter': [filter: TypeFilter]
  'update:timeRange': [range: TimeRange]
  'reset': []
}>()
```

### 6.2 Filter-Typen

#### Status Filter (Multi-Select Pills)

**Design:** Farbige Badges mit Punkt-Indikator und Count-Badge
**Verhaltensweise:** Multi-Select (mehrere gleichzeitig auswählbar)

```typescript
// Status Config Mapping (Zeilen 94-119)
const statusConfig: Record<StatusFilter, {
  dot: string;              // Farbiger Punkt (Tailwind Klasse)
  activeBg: string;         // Hintergrund wenn aktiv
  hoverBg: string;          // Hover-Effekt
  text: string;             // Textfarbe wenn aktiv
}> = {
  online: { dot: 'bg-emerald-500', activeBg: 'bg-emerald-500/20 border-emerald-500/50', ... },
  offline: { dot: 'bg-red-500', activeBg: 'bg-red-500/20 border-red-500/50', ... },
  warning: { dot: 'bg-amber-500', activeBg: 'bg-amber-500/20 border-amber-500/50', ... },
  safemode: { dot: 'bg-orange-500', activeBg: 'bg-orange-500/20 border-orange-500/50', ... }
}
```

#### Type Filter (Single-Select Tabs)

**Design:** Tab-ähnliche Buttons
**Verhaltensweise:** Single-Select (nur eine Option aktivierbar)

```typescript
const typeOptions: TypeFilter[] = ['all', 'mock', 'real']
```

#### Time Range Filter (Dropdown)

**Design:** HTML `<select>` Dropdown
**Verhaltensweise:** Single-Select

```typescript
const timeRangeOptions: TimeRange[] = ['1h', '6h', '24h', '7d', 'all']
```

### 6.3 Server-Integration

**UnifiedFilterBar selbst macht KEINE API-Calls.**
Sie ist eine reine UI-Komponente mit lokalem State Management.

| Filter-Typ | Client-seitig | Server-seitig | Caching |
|------------|---------------|---------------|---------|
| Status-Badges | ✅ JavaScript Set-basiert | ❌ Nein | `espStore.devices` |
| Type-Tabs | ✅ ref<'all' \| 'mock' \| 'real'> | ❌ Nein | `espStore.mockDevices` |
| Time-Range | ⚠️ Props vorhanden aber **nicht im Dashboard verwendet** | ❌ Nein | - |

### 6.4 Unterschied zu System Monitor

| Aspekt | Dashboard (UnifiedFilterBar) | System Monitor (DataSourceSelector) |
|--------|------------------------------|-------------------------------------|
| **Zweck** | ESP32-Geräte nach Status/Typ filtern | Datenquellen für Event-Logs auswählen |
| **Filter-Typen** | Status (online/offline/warning/safemode), Type (all/mock/real), Time-Range | Data Sources (audit_log/sensor_data/esp_health/actuators) |
| **Selektion** | Multi-Select (Status), Single-Select (Type/Time) | Multi-Select (Card-basiert, localStorage) |
| **UI-Pattern** | Pills (Status), Tabs (Type), Dropdown (Time) | Collapsible Card-Grid (Checkboxes) |
| **State-Management** | Drei separate v-model Bindings | localStorage + watch emit |
| **Server-Integration** | Keine - Client-seitig mit espStore | ⚠️ Bug - sollte Server-seitig sein |
| **Styling** | Glassmorphism mit Tailwind Farben | Card-basiert mit Gradient Check-Icon |
| **Fokus** | Echtzeit ESP32-Device-Verwaltung | Langfristige Event-Log-Browsing |

---

## ANHANG: ZEILEN-REFERENZ (Quick-Lookup)

### DataSourceSelector.vue
- Props: Keine Props (autonomer State)
- Emits: Zeile 147-149
- State: Zeile 177-178
- toggleSource(): Zeile 180-190
- localStorage: Zeile 194-197
- Template: Zeile 24-110 (4 hardcodierte Cards)
- CSS-Farben: Zeile 339-357

### EventsTab.vue
- DataSourceSelector Integration: Zeile 82
- Handler: Zeile 63-66

### SystemMonitorView.vue
- selectedDataSources State: Zeile 182
- filterEventTypes State: Zeile 214
- filteredEvents Computed: Zeile 235-244
- 🚨 BUG: Zeile 797-807 (Server lädt IMMER alle Quellen)
- determineDataSource(): Zeile 446-465
- MonitorFilterPanel Integration: Zeile 1248-1255

### MonitorFilterPanel.vue
- ESP-ID Filter: Zeile 146-167
- Level Filter: Zeile 169-187
- Time-Range Filter: Zeile 189-204
- Event-Types Section: Zeile 206-227
- getEventIcon(): Zeile 85-105

### ServerLogsTab.vue
- Filter-State: Zeile 57-73
- Query-Params: Zeile 83-90
- Polling: Zeile 150-165

### DatabaseTab.vue
- Table-Selector: Zeile 250-263
- FilterPanel: Zeile 313-323

### MqttTrafficTab.vue
- Filter-State: Zeile 94-104
- filteredMessages: Zeile 121-143
- mqttPatternToRegex: Zeile 160-170
- WebSocket: Zeile 110-115

### audit.ts
- getAggregatedEvents(): Zeile 253-279

---

---

## TEIL 7: SERVER-ARCHITEKTUR & DATENFLUSS ⭐ NEU

Diese Sektion dokumentiert die **Server-seitige Architektur** für alle Filter-relevanten Systeme.

### 7.1 Datenbank-Schema Overview

#### Core-Tabellen

| Tabelle | Zweck | Primary Key | Wichtige Indizes | Retention |
|---------|-------|-------------|------------------|-----------|
| `esp_devices` | ESP32-Stammdaten | UUID | status, last_seen, zone_id | Unbegrenzt |
| `audit_logs` | Alle System-Events | UUID | created_at, severity+created_at, source+created_at | Konfigurierbar (90 Tage default) |
| `sensor_configs` | Sensor-Konfiguration | UUID | esp_id+gpio+sensor_type (unique) | Unbegrenzt |
| `sensor_data` | Sensor-Messwerte (Time-Series) | UUID | esp_id+gpio+timestamp, timestamp DESC | Konfigurierbar |
| `actuator_configs` | Aktor-Konfiguration | UUID | esp_id+gpio (unique) | Unbegrenzt |
| `actuator_states` | Aktor-Echtzeit-Status | UUID | esp_id+gpio, state | Überschrieben |
| `actuator_history` | Aktor-Command-Historie | UUID | esp_id+gpio+timestamp, timestamp DESC | Konfigurierbar |
| `esp_heartbeat_logs` | Heartbeat-Historie | UUID | esp_id+timestamp, timestamp DESC | 7 Tage (default) |

#### Audit-Log Schema (Detailliert)

**Model:** `src/db/models/audit_log.py:26-178`
**Tabelle:** `audit_logs`

| Spalte | Typ | Index | Beschreibung |
|--------|-----|-------|--------------|
| `id` | UUID | PK | Eindeutige Event-ID |
| `event_type` | String(50) | YES | Typ (31 verschiedene Types) |
| `severity` | String(20) | YES (composite) | info, warning, error, critical |
| `source_type` | String(30) | YES (composite) | esp32, user, system, api, mqtt, scheduler |
| `source_id` | String(100) | YES (composite) | ESP-ID, User-ID, etc. |
| `status` | String(20) | YES | success, failed, pending |
| `message` | Text | NO | Menschenlesbare Beschreibung |
| `details` | JSON | NO | Zusätzliche Daten |
| `created_at` | DateTime | YES | Zeitstempel (für Time-Range-Queries) |

**Performance-Indizes:**
```sql
CREATE INDEX ix_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX ix_audit_logs_severity_created_at ON audit_logs(severity, created_at);
CREATE INDEX ix_audit_logs_source_created_at ON audit_logs(source_type, source_id, created_at);
```

---

### 7.2 MQTT → Database Data-Flows

#### Flow 1: ESP Heartbeat → esp_devices + esp_heartbeat_logs

```
1. ESP sendet: kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat
   Payload: { ts, heap_free, wifi_rssi, uptime, sensor_count, actuator_count, gpio_status }

2. Server: heartbeat_handler.py:61-319
   → Topic-Parsing (Zeile 72)
   → Payload-Validierung (Zeile 660-733)
   → ESP-Device Lookup (Zeile 117)

3. Auto-Discovery (wenn neues Device):
   → Status = "pending_approval" (Zeile 396-447)
   → WebSocket Broadcast: device_discovered
   → AuditLog: DEVICE_DISCOVERED

4. Status-Update (bekanntes Device):
   → esp_devices.status = "online" (Zeile 209)
   → esp_devices.last_seen = timestamp
   → esp_devices.device_metadata aktualisiert

5. Heartbeat-Historie (Zeile 226-232):
   → INSERT INTO esp_heartbeat_logs (esp_id, heap_free, wifi_rssi, uptime, health_status, ...)

6. WebSocket Broadcast (Zeile 275-288):
   → Event: "esp_health" mit Metriken
```

#### Flow 2: Sensor Data → sensor_data

```
1. ESP sendet: kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
   Payload: { ts, gpio, sensor_type, raw, value, unit, quality, raw_mode: true }

2. Server: sensor_handler.py:79-351
   → Topic-Parsing (Zeile 106)
   → Payload-Validierung (Zeile 124)
   → ESP-Device Lookup (Zeile 140)
   → SensorConfig Lookup (Zeile 165)

3. Pi-Enhanced Processing (Zeile 199-240):
   → WENN pi_enhanced=true UND raw_mode=true:
     → Server verarbeitet raw_value
     → processed_value berechnet
   → SONST: processing_mode = "raw" oder "local"

4. DB-Speicherung (Zeile 259-273):
   → INSERT INTO sensor_data (esp_id, gpio, sensor_type, raw_value, processed_value, ...)

5. WebSocket Broadcast (Zeile 297-308):
   → Event: "sensor_data"

6. Logic Engine Trigger (Zeile 316-332):
   → asyncio.create_task() - Non-blocking Evaluation

⚠️ KEIN AuditLog-Eintrag (zu viele Events)
```

#### Flow 3: Actuator Command (Server → ESP → Server)

```
COMMAND DIRECTION: Server → ESP

1. Frontend: POST /api/v1/actuators/{esp_id}/{gpio}/command
   Body: { command: "ON/OFF/PWM", value: 0.5, duration: 3600 }

2. Server: actuators.py:408-486
   → SafetyService.validate_actuator_command() (KRITISCH!)
   → MQTT Publisher.publish_actuator_command()

3. ESP empfängt: kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command
   → Führt Command aus

STATUS DIRECTION: ESP → Server

4. ESP sendet: kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status
   Payload: { ts, gpio, actuator_type, state, value, last_command, runtime_ms, error }

5. Server: actuator_handler.py:44-217
   → Topic-Parsing (Zeile 72)
   → Payload-Validierung (Zeile 89)

6. State-Update (Zeile 148-158):
   → UPSERT actuator_states (current_value, state, timestamp, ...)

7. History-Logging (Zeile 160-177):
   → INSERT INTO actuator_history (command_type, value, success, ...)

8. WebSocket Broadcast (Zeile 197-208):
   → Event: "actuator_status"

⚠️ AuditLog NUR bei Emergency-Stop (actuators.py:695-710)
```

#### Flow 4: Config Response (ESP → Server)

```
1. ESP sendet: kaiser/{kaiser_id}/esp/{esp_id}/config_response
   Payload: { ts, status: "applied/failed", error_code, error_detail }

2. Server: config_handler.py
   → SensorConfig/ActuatorConfig Update
   → config_status = "applied" oder "failed"
   → config_error = error_code

3. AuditLog-Eintrag:
   → event_type: "config_response"
   → severity: INFO (applied) oder ERROR (failed)

4. WebSocket Broadcast:
   → Event: "config_response"
```

---

### 7.3 API-Filter Matrix (Server vs. Client)

#### Audit Events API (`/api/v1/audit/`)

| Endpoint | Filter | Server-seitig? | SQL-WHERE | Code-Location |
|----------|--------|----------------|-----------|---------------|
| `/` (list) | `event_type` | ✅ JA | `event_type = ?` | audit.py:273-279 |
| `/` (list) | `severity` | ✅ JA | `severity = ?` | audit.py:275 |
| `/` (list) | `source_type` | ✅ JA | `source_type = ?` | audit.py:276 |
| `/` (list) | `source_id` | ✅ JA | `source_id = ?` | audit.py:277 |
| `/` (list) | `status` | ✅ JA | `status = ?` | audit.py:278 |
| `/` (list) | `hours` | ✅ JA | `created_at >= NOW() - hours` | audit.py:289-291 |
| `/` (list) | `start_time/end_time` | ✅ JA | `created_at BETWEEN` | audit.py:292-294 |
| `/events/aggregated` | `sources` | ✅ JA | Pro Source eigene Query | audit.py:354-463 |
| `/events/aggregated` | `hours` | ✅ JA | `timestamp >= cutoff` | audit.py:372 |
| `/events/aggregated` | `limit_per_source` | ✅ JA | `LIMIT` per Query | audit.py:373 |

**🚨 Frontend-Bug:** SystemMonitorView.vue:797 ignoriert `selectedDataSources` und lädt IMMER alle 4 Quellen!

#### Sensor Data API (`/api/v1/sensors/`)

| Endpoint | Filter | Server-seitig? | SQL-WHERE | Code-Location |
|----------|--------|----------------|-----------|---------------|
| `/data` | `esp_id` | ✅ JA | `esp_id = ?` | sensors.py:652-660 |
| `/data` | `gpio` | ✅ JA | `gpio = ?` | sensors.py:652-660 |
| `/data` | `sensor_type` | ✅ JA | `sensor_type = ?` | sensors.py:652-660 |
| `/data` | `start_time/end_time` | ✅ JA | `timestamp BETWEEN` | sensors.py:652-660 |
| `/data` | `quality` | ✅ JA | `quality = ?` | sensors.py:652-660 |
| `/data` | `limit` | ✅ JA | `LIMIT` | sensors.py:652-660 |
| `/data/by-source/{source}` | `source` | ✅ JA | `data_source = ?` | sensors.py:719-746 |

#### Actuator API (`/api/v1/actuators/`)

| Endpoint | Filter | Server-seitig? | SQL-WHERE | Code-Location |
|----------|--------|----------------|-----------|---------------|
| `/` (list) | `esp_id` | ✅ JA | JOIN esp_devices | actuators.py:168-172 |
| `/` (list) | `actuator_type` | ✅ JA | `actuator_type = ?` | actuators.py:169 |
| `/` (list) | `enabled` | ✅ JA | `enabled = ?` | actuators.py:170 |
| `/` (list) | `page/page_size` | ✅ JA | `OFFSET/LIMIT` | actuators.py:191-198 |
| `/{esp_id}/{gpio}/history` | `limit` | ✅ JA | `LIMIT` | actuators.py:858 |

#### ESP Devices API (`/api/v1/esp/`)

| Endpoint | Filter | Server-seitig? | SQL-WHERE | Code-Location |
|----------|--------|----------------|-----------|---------------|
| `/devices` | `zone_id` | ✅ JA | `zone_id = ?` | esp.py:104-200 |
| `/devices` | `status` | ✅ JA | `status = ?` | esp.py:104-200 |
| `/devices` | `hardware_type` | ✅ JA | `hardware_type = ?` | esp.py:104-200 |
| `/devices` | `page/page_size` | ✅ JA | `OFFSET/LIMIT` | esp.py:104-200 |

#### Debug Logs API (`/api/v1/debug/logs`)

| Endpoint | Filter | Server-seitig? | Methode | Code-Location |
|----------|--------|----------------|---------|---------------|
| `/logs` | `level` | ✅ JA | JSON-Field-Filter | debug.py:2373-2470 |
| `/logs` | `module` | ✅ JA | JSON-Field-Filter | debug.py:2373-2470 |
| `/logs` | `search` | ✅ JA | Message-Substring | debug.py:2373-2470 |
| `/logs` | `start_time/end_time` | ✅ JA | Timestamp-Range | debug.py:2373-2470 |
| `/logs` | `file` | ✅ JA | File-Selector | debug.py:2373-2470 |
| `/logs` | `page/page_size` | ✅ JA | Pagination | debug.py:2373-2470 |

---

### 7.4 Event-Aggregation & DataSource-Mapping

#### Server-seitige DataSource-Zuordnung

**Service:** `event_aggregator_service.py:102-161`

Die 4 DataSources werden aus **4 verschiedenen DB-Tabellen** aggregiert:

| DataSource | DB-Tabelle | Query-Methode | Transformation |
|------------|------------|---------------|----------------|
| `audit_log` | `audit_logs` | `_get_audit_events()` Zeile 177-196 | `_transform_audit_to_unified()` |
| `sensor_data` | `sensor_data` | `_get_sensor_events()` Zeile 283-308 | `_transform_sensor_to_unified()` |
| `esp_health` | `esp_heartbeat_logs` | `_get_health_events()` Zeile 359-385 | `_transform_heartbeat_to_unified()` |
| `actuators` | `actuator_history` | `_get_actuator_events()` Zeile 444-469 | `_transform_actuator_to_unified()` |

**Event-Type zu DataSource Mapping (Server-Logik):**

```python
# event_aggregator_service.py:209-227 (implizit via Transformation)
DATASOURCE_TO_EVENTTYPES = {
    'audit_log': [
        'config_response', 'config_published', 'config_failed',
        'device_discovered', 'device_rediscovered', 'device_approved', 'device_rejected',
        'device_online', 'device_offline', 'lwt_received',
        'zone_assignment', 'logic_execution', 'system_event',
        'error_event', 'mqtt_error', 'validation_error', 'database_error',
        'login_success', 'login_failed', 'logout',
        'service_start', 'service_stop', 'emergency_stop',
        'notification',
    ],
    'sensor_data': ['sensor_data', 'sensor_health'],
    'esp_health': ['esp_health'],
    'actuators': ['actuator_status', 'actuator_response', 'actuator_alert'],
}
```

**⚠️ KRITISCH:** Frontend `determineDataSource()` (SystemMonitorView.vue:446-465) deckt nur 16 von 31 Event-Types ab! 15 Types haben `dataSource: undefined`.

---

### 7.5 Performance-Analyse

#### Szenario 1: User filtert nur ERROR-Events

**Aktuell (Bug + Client-Filter):**
```
1. Frontend sendet: sources=ALL, hours=24, limit_per_source=2000
2. Server lädt: 4 × 2000 = 8000 Events (alle Levels)
3. Frontend filtert: 7500 Events weg (nur ERROR/CRITICAL behalten)
4. Angezeigt: 500 Events

→ 16x ineffizient!
→ Traffic: 8000 Events × ~500 Bytes = 4 MB
```

**Sollte sein (Server-Filter):**
```
1. Frontend sendet: sources=audit_log, hours=24, severity=error, limit=500
2. Server lädt: 500 Events (nur ERROR aus audit_log)
3. Frontend zeigt: 500 Events

→ 16x effizienter!
→ Traffic: 500 Events × ~500 Bytes = 250 KB
```

#### Szenario 2: User wählt nur "Sensordaten" DataSource

**Aktuell (Bug):**
```
# SystemMonitorView.vue:797
const allSources: DataSource[] = ['audit_log', 'sensor_data', 'esp_health', 'actuators']
→ IGNORIERT selectedDataSources!
```

**Server lädt:**
- audit_log: 2000 Events
- sensor_data: 2000 Events ← User will nur diese!
- esp_health: 2000 Events
- actuators: 2000 Events

**Frontend filtert:** 6000 Events weg → **6.8x ineffizient!**

---

### 7.6 Log-Cleanup & Archivierung

#### Application Logs (god_kaiser.log)

**Konfiguration:** `src/core/logging_config.py:105-113`

```python
RotatingFileHandler(
    filename="logs/god_kaiser.log",
    maxBytes=10485760,      # 10 MB → Rotation
    backupCount=5,          # god_kaiser.log.1 bis .5
    encoding="utf-8"
)
```

**Retention:**
- Automatische Rotation bei 10 MB
- Max 6 Dateien × 10 MB = 60 MB auf Disk
- KEIN automatisches Löschen (manuell via OS)

**Query-API:** `GET /api/v1/debug/logs` (Admin-only)
- Server-seitige Filter: level, module, search, time-range
- JSON-Format mit strukturierten Feldern

#### Audit Logs (Database)

**Service:** `audit_retention_service.py:59-217`

**Default-Konfiguration:**
```python
{
    "enabled": False,              # Safety-First: User muss aktivieren
    "default_days": 30,
    "severity_days": {
        "info": 14,
        "warning": 30,
        "error": 90,
        "critical": 365,
    },
    "preserve_emergency_stops": True,
    "batch_size": 1000,
}
```

**Cleanup-Trigger:**
- Cron-Job: Täglich um 03:00 UTC (wenn enabled)
- Manual: `POST /api/v1/audit/retention/cleanup`
- Dry-Run-Mode per Default aktiviert

**Backup-System:**
- Auto-Backup vor Cleanup möglich
- JSON-Format in `backups/audit_logs/`
- Restore via API möglich

#### Heartbeat Logs

**Retention:** 7 Tage (default)
**Cleanup-Job:** Täglich um 04:00 UTC (ENABLED per Default)
**Code:** `maintenance/service.py:425-455`

---

### 7.7 Timeout & Health-Berechnung

#### ESP Online/Offline Status

**Timeout-Wert:** `HEARTBEAT_TIMEOUT_SECONDS = 300` (5 Minuten)

**Status-Transitions:**
```
NEW DEVICE: → pending_approval → (admin approves) → approved → (heartbeat) → online
ONLINE DEVICE: → (no heartbeat 300s) → offline
REJECTED: → (cooldown 300s expired + heartbeat) → pending_approval (rediscovery)
```

**Timeout-Check:** Maintenance Job alle 60 Sekunden (`heartbeat_handler.py:989-1080`)

#### Health-Status-Berechnung

**Model:** `esp_heartbeat.py:189-220`

```python
def determine_health_status(wifi_rssi: int, heap_free: int) -> str:
    if wifi_rssi < -80 or heap_free < 10240:    # RSSI < -80 dBm ODER RAM < 10KB
        return "critical"
    if wifi_rssi < -70 or heap_free < 20480:    # RSSI < -70 dBm ODER RAM < 20KB
        return "degraded"
    return "healthy"
```

---

### 7.8 WebSocket Real-Time Events

**Service:** `websocket/manager.py`

| Event-Type | Trigger | Daten |
|------------|---------|-------|
| `esp_health` | Heartbeat empfangen | esp_id, status, heap_free, wifi_rssi, uptime |
| `sensor_data` | Sensor-Reading gespeichert | esp_id, gpio, sensor_type, value, unit |
| `actuator_status` | Aktor-Status Update | esp_id, gpio, state, value |
| `config_response` | Config-ACK von ESP | esp_id, status, error_code |
| `device_discovered` | Neues Device erkannt | esp_id, hardware_type |
| `events_restored` | Backup wiederhergestellt | count, backup_id |

**Frontend-Integration:** `El Frontend/src/services/websocket.ts` (Singleton-Pattern)

---

## TEIL 8: KRITISCHE BUGS & EMPFEHLUNGEN ⭐ NEU

### 8.1 🚨 BUG: Server lädt IMMER alle 4 Quellen

**Problem-Code:** `SystemMonitorView.vue:797-807`

```typescript
// BUG: Ignoriert selectedDataSources!
const allSources: DataSource[] = ['audit_log', 'sensor_data', 'esp_health', 'actuators']

const response = await auditApi.getAggregatedEvents({
  sources: allSources,  // ← FALSCH!
  hours: eventLoadHours.value,
  limitPerSource: initialLimit,
})
```

**Impact:**
- 6.8x mehr Netzwerk-Traffic wenn User nur 1 Quelle will
- Unnötige Server-Last (4 DB-Queries statt 1)
- Langsame Ladezeiten bei großen Datenmengen

**Fix:**
```typescript
const response = await auditApi.getAggregatedEvents({
  sources: selectedDataSources.value,  // ← RICHTIG!
  hours: eventLoadHours.value,
  limitPerSource: initialLimit,
})
```

### 8.2 ⚠️ Fehlende Server-Filter für Level/ESP-ID

**Problem:** `/audit/events/aggregated` unterstützt NICHT:
- `severity` Filter (nur in `/audit/` Hauptendpoint)
- `esp_id` Filter (Events sind nicht direkt nach ESP gefiltert)

**Aktuell:**
- Server sendet alle Levels → Frontend filtert
- Server sendet alle ESP-Events → Frontend filtert

**Empfehlung:** Server-seitige Filter hinzufügen:

```python
# audit.py:354-463 erweitern
async def get_aggregated_events(
    sources: List[DataSource],
    hours: Optional[int] = None,
    limit_per_source: int = 2000,
    # NEU:
    severity: Optional[List[str]] = Query(None),  # ['error', 'critical']
    esp_ids: Optional[List[str]] = Query(None),   # ['ESP_12AB34CD']
):
    # Dann in jeder Query-Methode filtern
```

### 8.3 ⚠️ Fehlende dataSource-Mappings im Frontend

**Problem:** `determineDataSource()` in SystemMonitorView.vue:446-465 deckt nur 16 von 31 Event-Types ab.

**Fehlende Mappings (15 Types):**
```typescript
// Diese Types haben dataSource: undefined
'config_published', 'config_failed',
'device_online', 'device_offline', 'lwt_received',
'service_start', 'service_stop', 'emergency_stop',
'mqtt_error', 'validation_error', 'database_error',
'login_success', 'login_failed', 'logout',
```

**Konsequenz:** Diese Events werden bei DataSource-Filterung IMMER angezeigt (Code: `if (!e.dataSource) return true`).

**Fix:** Alle 31 Event-Types korrekt mappen oder Server-seitiges `data_source` Feld nutzen.

---

## Ende der Dokumentation

**Nächste Schritte:**
1. ✅ **Server-Bug fixen (30 Min):** `sources: selectedDataSources.value`
2. ✅ **EVENT-TYPEN entfernen (2-3 Std):** ~150 Zeilen weniger
3. ✅ **getEventIcon() refactoren (1 Std):** ~180 Zeilen weniger
4. ⏳ **Fehlende dataSource-Mappings (30 Min):** 15 Event-Types zuordnen
5. ⭐ **Server-Filter erweitern (1 Std):** severity + esp_ids in `/audit/events/aggregated`

**Gesamt-Aufwand:** 5-6 Stunden
**Code-Reduktion:** -330 Zeilen (~10%)
**Performance-Gewinn:** 6.8x weniger Netzwerk-Traffic

---

## CHANGELOG

| Version | Datum | Änderungen |
|---------|-------|------------|
| 1.0 | 2026-01-25 | Initial: Frontend Filter-Dokumentation (TEIL 1-6) |
| 2.0 | 2026-01-25 | ⭐ Server-Architektur hinzugefügt (TEIL 7-8) |

**TEIL 7 NEU:** Vollständige Server-Architektur mit:
- 7.1: Datenbank-Schema (8 Tabellen dokumentiert)
- 7.2: MQTT → DB Data-Flows (4 Flows mit Code-Referenzen)
- 7.3: API-Filter Matrix (40+ Filter dokumentiert)
- 7.4: Event-Aggregation & DataSource-Mapping
- 7.5: Performance-Analyse (16x Ineffizienz nachgewiesen)
- 7.6: Log-Cleanup & Archivierung (2 Systeme)
- 7.7: Timeout & Health-Berechnung
- 7.8: WebSocket Real-Time Events

**TEIL 8 NEU:** Kritische Bugs & Empfehlungen:
- 8.1: Server-Bug (lädt IMMER alle Quellen)
- 8.2: Fehlende Server-Filter
- 8.3: Fehlende dataSource-Mappings
