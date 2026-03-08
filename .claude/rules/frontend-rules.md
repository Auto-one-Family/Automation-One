---
paths:
  - "El Frontend/**"
---

# Frontend Rules (El Frontend)

> **Scope:** Nur fuer Dateien in `El Frontend/`

---

## 1. Architektur-Prinzipien

### Vue 3 Composition API (IMMER)

```vue
<!-- RICHTIG -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
</script>

<!-- FALSCH: Options API -->
<script>
export default {
  data() { return {} },
  methods: {}
}
</script>
```

### State-Management

| State-Typ | Loesung |
|-----------|---------|
| Lokaler Component State | `ref()`, `reactive()` |
| Shared/Global State | Pinia Store |
| Server State | API-Call + Store |
| URL State | `useRoute()`, `useQueryFilters()` |

### Data Flow

```
API (src/api/) → Store (src/stores/) → Component (src/components/)
                       ↑
              WebSocket (real-time updates)
```

---

## 2. TypeScript-Konventionen

### Naming

| Element | Convention | Beispiel |
|---------|------------|----------|
| Komponenten | PascalCase | `ESPCard.vue`, `SensorSatellite.vue` |
| Composables | camelCase mit `use` Prefix | `useWebSocket`, `useToast` |
| Stores | camelCase mit `use` Prefix | `useEspStore`, `useAuthStore` |
| Types/Interfaces | PascalCase | `ESPDevice`, `SensorConfig` |
| Funktionen | camelCase | `formatDate()`, `getSensorUnit()` |
| Konstanten | UPPER_SNAKE_CASE | `MAX_SENSORS`, `API_TIMEOUT` |

### Import-Reihenfolge

```typescript
// 1. Vue Core
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Ref, ComputedRef } from 'vue'

// 2. Vue Router / Pinia
import { useRoute, useRouter } from 'vue-router'
import { useEspStore } from '@/stores/esp'

// 3. Externe Libraries
import { format } from 'date-fns'

// 4. Lokale Imports (@/ Alias)
import { espApi } from '@/api/esp'
import type { ESPDevice } from '@/types'
import { formatSensorValue } from '@/utils/formatters'
```

### @/ Alias (IMMER verwenden)

```typescript
// RICHTIG
import { ESPDevice } from '@/types'
import { useEspStore } from '@/stores/esp'

// FALSCH
import { ESPDevice } from '../../../types'
import { useEspStore } from '../../stores/esp'
```

---

## 3. Component-Patterns

### Script Setup (Standard)

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ESPDevice } from '@/types'

// Props mit TypeScript
const props = defineProps<{
  deviceId: string
  showDetails?: boolean
}>()

// Emits mit TypeScript
const emit = defineEmits<{
  (e: 'update', device: ESPDevice): void
  (e: 'delete'): void
}>()

// State
const isLoading = ref(false)

// Computed
const device = computed(() => /* ... */)

// Methods
async function handleClick() { /* ... */ }

// Lifecycle
onMounted(() => { /* ... */ })
onUnmounted(() => { /* cleanup */ })
</script>
```

### Props-Definition

```typescript
// Mit Defaults
const props = withDefaults(defineProps<{
  title: string
  showIcon?: boolean
}>(), {
  showIcon: true
})

// Ohne Defaults
const props = defineProps<{
  deviceId: string
}>()
```

### Emits-Definition

```typescript
const emit = defineEmits<{
  (e: 'update', value: string): void
  (e: 'delete'): void
  (e: 'change', oldValue: string, newValue: string): void
}>()
```

---

## 4. Store-Patterns (Pinia)

### Store-Struktur (Setup Syntax)

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useFeatureStore = defineStore('feature', () => {
  // State
  const items = ref<Item[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const itemCount = computed(() => items.value.length)

  // Actions
  async function fetchAll(): Promise<void> {
    isLoading.value = true
    try {
      const response = await api.getAll()
      items.value = response.data.data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error'
    } finally {
      isLoading.value = false
    }
  }

  // Reset
  function $reset(): void {
    items.value = []
    isLoading.value = false
    error.value = null
  }

  return { items, isLoading, error, itemCount, fetchAll, $reset }
})
```

### Store-Nutzung in Components

```typescript
import { useEspStore } from '@/stores/esp'

const espStore = useEspStore()

// State zugreifen
espStore.devices
espStore.isLoading

// Actions aufrufen
await espStore.fetchAll()
```

---

## 5. API-Patterns

### API-Client-Struktur

```typescript
import api from './index'
import type { AxiosResponse } from 'axios'

interface ApiResponse<T> {
  status: string
  data: T
}

export async function getItems(): Promise<AxiosResponse<ApiResponse<Item[]>>> {
  return api.get('/items')
}

export async function createItem(data: CreateRequest): Promise<AxiosResponse<ApiResponse<Item>>> {
  return api.post('/items', data)
}
```

### API-Aufrufe in Stores (NICHT in Components)

```typescript
// RICHTIG: Im Store
async function fetchDevice(id: string): Promise<void> {
  const response = await espApi.getDevice(id)
  updateDevice(response.data.data)
}

// FALSCH: Im Component
onMounted(async () => {
  const response = await espApi.getDevice(props.id)  // NEIN!
  device.value = response.data.data
})
```

---

## 6. Composable-Patterns

### Standard-Struktur

```typescript
import { ref, computed, onUnmounted } from 'vue'
import type { Ref, ComputedRef } from 'vue'

interface UseFeatureOptions {
  autoLoad?: boolean
}

interface UseFeatureReturn {
  data: Ref<Data | null>
  isLoading: Ref<boolean>
  load: () => Promise<void>
  cleanup: () => void
}

export function useFeature(options: UseFeatureOptions = {}): UseFeatureReturn {
  const { autoLoad = true } = options

  const data = ref<Data | null>(null)
  const isLoading = ref(false)

  async function load(): Promise<void> {
    isLoading.value = true
    try {
      data.value = await fetchData()
    } finally {
      isLoading.value = false
    }
  }

  function cleanup(): void {
    data.value = null
  }

  // Auto-cleanup
  onUnmounted(cleanup)

  // Auto-load
  if (autoLoad) {
    load()
  }

  return { data, isLoading, load, cleanup }
}
```

### Cleanup (IMMER in onUnmounted)

```typescript
const subscriptionId = ref<string | null>(null)

onMounted(() => {
  subscriptionId.value = ws.subscribe(filters, callback)
})

onUnmounted(() => {
  if (subscriptionId.value) {
    ws.unsubscribe(subscriptionId.value)
  }
})
```

---

## 7. WebSocket-Patterns

### Event-Handler registrieren

```typescript
import { useWebSocket } from '@/composables'

const { on, cleanup } = useWebSocket()

const unsubscribers: (() => void)[] = []

onMounted(() => {
  unsubscribers.push(on('esp_health', handleHealth))
  unsubscribers.push(on('sensor_data', handleSensorData))
})

onUnmounted(() => {
  unsubscribers.forEach(unsub => unsub())
  cleanup()
})
```

### Store-Integration

```typescript
// Im Store
function initWebSocket(): void {
  const ws = websocketService

  wsUnsubscribers.push(
    ws.on('esp_health', (msg) => {
      updateDeviceHealth(msg.payload)
    })
  )
}

function cleanupWebSocket(): void {
  wsUnsubscribers.forEach(unsub => unsub())
  wsUnsubscribers.length = 0
}
```

---

## 8. Styling (Tailwind CSS)

### Utility-First

```vue
<template>
  <!-- RICHTIG: Tailwind Utilities -->
  <div class="flex items-center gap-4 p-4 bg-white rounded-lg shadow-md">
    <span class="text-sm font-medium text-gray-700">{{ label }}</span>
  </div>

  <!-- FALSCH: Custom CSS -->
  <div class="custom-card">
    <span class="custom-label">{{ label }}</span>
  </div>
</template>
```

### Responsive Design

```vue
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <!-- Responsive Grid -->
</div>
```

### Dark Mode (falls vorhanden)

```vue
<div class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
```

---

## 9. Type-Definitionen

### Interface-Struktur

```typescript
// Entity Types
export interface ESPDevice {
  esp_id: string
  name: string
  zone_id: string | null
  is_online: boolean
  last_heartbeat: string | null
}

// Request Types
export interface CreateESPRequest {
  name: string
  zone_id?: string
}

// Response Types (API)
export interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}
```

### Type Guards

```typescript
function isESPDevice(obj: unknown): obj is ESPDevice {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'esp_id' in obj &&
    typeof (obj as ESPDevice).esp_id === 'string'
  )
}
```

---

## 10. Fehlerbehandlung

### Try-Catch in Async Functions

```typescript
async function loadData(): Promise<void> {
  isLoading.value = true
  error.value = null
  try {
    const response = await api.getData()
    data.value = response.data.data
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unbekannter Fehler'
    toast.error('Laden fehlgeschlagen')
  } finally {
    isLoading.value = false
  }
}
```

### Error-State in Components

```vue
<template>
  <LoadingState v-if="isLoading" />
  <ErrorState v-else-if="error" :message="error" @retry="load" />
  <div v-else>
    <!-- Content -->
  </div>
</template>
```

---

## 11. Build-Verifikation

### Vor jedem Commit

```bash
cd "El Frontend" && npm run build
```

### Type-Check

```bash
cd "El Frontend" && npm run type-check
```

### Lint

```bash
cd "El Frontend" && npm run lint
```

---

## 12. Verbotene Aktionen

| Aktion | Grund |
|--------|-------|
| Options API | Composition API ist Standard |
| Relative Imports zu src/ | @/ Alias verwenden |
| API-Calls in Components | Immer ueber Stores |
| Fehlende Cleanup in onUnmounted | Memory Leaks |
| Inline Styles | Tailwind CSS verwenden |
| `any` Type | Explizite Types definieren |
| Magic Strings | Labels in utils/labels.ts |

---

## Figma MCP Integration

### Required Flow (bei jeder Figma-Implementierung)

1. `get_design_context` fuer den Figma-Node ausfuehren
2. Falls Response zu gross: `get_metadata` fuer Node-Map, dann gezielt `get_design_context`
3. `get_screenshot` fuer visuelle Referenz
4. Erst DANACH Assets herunterladen und implementieren
5. Figma-Output (React + Tailwind) in Auto-One Konventionen uebersetzen
6. Visuell gegen Figma validieren vor Abschluss

### Design Token Mapping (Figma -> Auto-One)

```
IMPORTANT: Figma-Output kommt als React + Tailwind. Uebersetzen nach:
- Framework:    React -> Vue 3 (Script Setup + Composition API)
- Styling:      Tailwind-Klassen beibehalten, CSS Variables ergaenzen
- Farben:       NIEMALS hex hardcoden -> var(--color-*) aus styles/tokens.css
- Spacing:      4px Grid: var(--space-1) bis var(--space-12)
- Radius:       var(--radius-sm|md|lg|full) - nur 4 Stufen
- Elevation:    var(--elevation-flat|raised|floating) - nur 3 Stufen
- Typography:   var(--text-xs|sm|base|lg|xl|2xl|display), Font: Outfit
- Glass:        .glass-panel, .glass-overlay, .iridescent-border aus glass.css
- Transitions:  var(--transition-fast|base|slow)
- Z-Index:      var(--z-*) Skala aus tokens.css
```

### Component Rules

```
- IMPORTANT: Zuerst shared/design/ pruefen -> BaseBadge, BaseButton, BaseCard,
  BaseInput, BaseModal, BaseSelect, BaseSkeleton, BaseSpinner, BaseToggle
- Layout: AppShell, Sidebar, TopBar aus shared/design/layout/
- Patterns: ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer
- Neue Komponenten in src/components/{bereich}/ ablegen
- IMMER <script setup lang="ts"> + defineProps<Props>() + defineEmits
- Icons: lucide-vue-next (KEIN neues Icon-Paket installieren)
- Imports: @/ Alias (KEINE relativen ../.. Pfade)
- Tailwind-Klassen: dark-* Palette aus tailwind.config.js
- Dark Theme ONLY - keine Light-Mode Styles
- Cleanup in onUnmounted() fuer Subscriptions/Listeners
```

### Asset Rules

```
- IMPORTANT: Figma MCP localhost-URLs direkt verwenden (KEINE Platzhalter)
- IMPORTANT: KEINE neuen Icon-Pakete installieren - nur lucide-vue-next
- Assets nach El Frontend/public/assets/ speichern
- SVGs als Vue-Komponenten wenn interaktiv, sonst als Datei
```

### Tailwind Config Referenz

```
Farben:     dark-50..950, iridescent-1..4, accent, success, warning, danger, info, mock, real, esp-*
Fonts:      font-sans (Outfit), font-mono (JetBrains Mono)
Font-Sizes: text-xs..text-display (11px..32px, base=14px)
Shadows:    shadow-glass, shadow-card-hover, shadow-iridescent, shadow-raised, shadow-floating
Animations: animate-shimmer, animate-fade-in, animate-slide-up, animate-scale-in, animate-breathe
Radius:     rounded-sm(6), rounded-md(10), rounded-lg(16)
Screens:    3xl(1600px), 4xl(1920px)
```
