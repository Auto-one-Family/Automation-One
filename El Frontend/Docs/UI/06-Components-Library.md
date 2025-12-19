# Frontend Components Library - Dokumentation

**Erstellt:** 2025-12-19
**Status:** ✅ Vollständig implementiert
**Total Components:** 14 Komponenten kategorisiert

---

## 1. Common Components (Reusable UI)

### 1.1 LoadingState

**Datei:** `src/components/common/LoadingState.vue`
**Zweck:** Spinner + Text wenn Daten geladen werden
**Props:**
```typescript
interface Props {
  text?: string  // z.B. "Lade ESPs..."
}
```
**Beispiel:**
```vue
<LoadingState v-if="isLoading" text="Lade ESP-Geräte..." />
```
**Verwendung in Views:**
- MockEspView (ESP-Liste laden)
- MockEspDetailView (Single ESP laden)
- Dashboard (Stats laden)
- Sensors, Actuators, Logs (Alle Views)

---

### 1.2 EmptyState

**Datei:** `src/components/common/EmptyState.vue`
**Zweck:** "Keine Daten" Zustand mit Call-to-Action
**Props:**
```typescript
interface Props {
  icon?: Component        // z.B. Plus, Search
  title: string          // "Keine Sensoren"
  description: string    // "Fügen Sie einen Sensor hinzu..."
  actionText?: string    // "Sensor hinzufügen"
}
interface Emits {
  action: () => void
}
```
**Beispiel:**
```vue
<EmptyState
  :icon="Plus"
  title="Keine Sensoren"
  description="Fügen Sie einen Sensor hinzu"
  action-text="Hinzufügen"
  @action="showAddSensorModal = true"
/>
```

---

### 1.3 ErrorState

**Datei:** `src/components/common/ErrorState.vue`
**Zweck:** Fehler-Banner mit Retry + Dismiss
**Props:**
```typescript
interface Props {
  message: string        // Fehlermeldung
  showDismiss?: boolean  // Dismiss-Button anzeigen
}
interface Emits {
  retry: () => void
  dismiss: () => void
}
```
**Beispiel:**
```vue
<ErrorState
  v-if="error"
  :message="error"
  show-dismiss
  @retry="mockEspStore.fetchAll"
  @dismiss="mockEspStore.clearError"
/>
```

---

### 1.4 Badge

**Datei:** `src/components/common/Badge.vue`
**Zweck:** Status-Label (MOCK, REAL, Online, Error, etc.)
**Props:**
```typescript
interface Props {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'mock' | 'real' | 'gray'
  dot?: boolean          // Farbiger Punkt vor Text
  pulse?: boolean        // Pulsing Animation (für Online-Status)
  size?: 'sm' | 'md'    // Größe
}
```
**Beispiel:**
```vue
<!-- MOCK Badge -->
<Badge variant="mock" size="sm">MOCK</Badge>

<!-- Online mit Pulse -->
<Badge variant="success" dot pulse size="sm">Online</Badge>

<!-- Error Badge -->
<Badge variant="danger">ERROR</Badge>
```
**Variants:**
- `success` - Grün (Online, Good, Active)
- `warning` - Orange (Caution, Poor Quality)
- `danger` - Rot (Error, E-Stop, Critical)
- `info` - Blau (Info, Fair Quality)
- `mock` - Lila (Mock Hardware)
- `real` - Grün (Real Hardware)
- `gray` - Grau (Inactive, Neutral)

---

### 1.5 Button Styles (CSS-only, keine Komponente)

**Verwendung:**
```html
<!-- Primary (Iridescent) -->
<button class="btn-primary">Erstellen</button>

<!-- Secondary (Glass) -->
<button class="btn-secondary">Abbrechen</button>

<!-- Danger (Red) -->
<button class="btn-danger">Löschen</button>

<!-- Ghost (Transparent) -->
<button class="btn-ghost">Link-ähnlich</button>

<!-- Sizes -->
<button class="btn-primary btn-sm">Small</button>
```

---

## 2. ESP Components

### 2.1 ESPCard

**Datei:** `src/components/esp/ESPCard.vue`
**Zweck:** Card für einzelnes ESP in Grid-View
**Props:**
```typescript
interface Props {
  esp: MockESP
}
interface Emits {
  heartbeat: (espId: string) => void
  'toggle-safe-mode': (espId: string) => void
  delete: (espId: string) => void
}
```
**Features:**
- Status-Indikator (Online/Offline/Safe-Mode/Error)
- Sensor/Actuator Count
- Zone-Info
- Action-Buttons (Heartbeat, Safe-Mode, Delete)
- MOCK vs. REAL Badge
- Hover-Effekte

**Beispiel:**
```vue
<ESPCard
  v-for="esp in esps"
  :key="esp.esp_id"
  :esp="esp"
  @heartbeat="handleHeartbeat"
  @toggle-safe-mode="handleToggleSafeMode"
  @delete="handleDelete"
/>
```

---

### 2.2 SensorValueCard

**Datei:** `src/components/esp/SensorValueCard.vue`
**Zweck:** Einzelner Sensor-Wert Card (z.B. in SensorsView Grid)
**Props:**
```typescript
interface Props {
  sensor: Sensor
  espId: string
}
```
**Features:**
- Sensor-Icon + Name
- Numerischer Wert + Unit
- Quality-Badge (Good, Fair, Poor, etc.)
- Sensor-Typ Subtext
- Hover-Effekt

---

## 3. Dashboard Components

### 3.1 StatCard

**Datei:** `src/components/dashboard/StatCard.vue`
**Zweck:** Große Stat-Anzeige (Anzahl ESPs, Sensoren, etc.)
**Props:**
```typescript
interface Props {
  title: string              // "ESP-Geräte"
  value: string | number     // 12
  subtitle?: string          // "8 online"
  icon?: Component           // Cpu
  iconColor?: string         // "text-iridescent-1"
  iconBgColor?: string       // "bg-iridescent-1/10"
  loading?: boolean          // Spinner statt Wert
}
```
**Beispiel:**
```vue
<StatCard
  title="ESP-Geräte"
  :value="stats.devices"
  :subtitle="`${stats.online} online`"
  :icon="Cpu"
  icon-color="text-iridescent-1"
  icon-bg-color="bg-iridescent-1/10"
  :loading="isLoading"
/>
```

---

## 4. Database Components

Diese Komponenten sind für den DatabaseExplorerView zusammengefügt.

### 4.1 DataTable

**Datei:** `src/components/database/DataTable.vue`
**Zweck:** Dynamische Daten-Tabelle mit Pagination/Sortierung
**Props:**
```typescript
interface Props {
  columns: DataTableColumn[]  // Column-Definitionen
  rows: Record<string, any>[] // Data-Rows
  loading?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}
```

### 4.2 FilterPanel

**Datei:** `src/components/database/FilterPanel.vue`
**Zweck:** Dynamic Filter-UI für Tabellen
**Props:**
```typescript
interface Props {
  schema: ColumnSchema[]    // Datenbank-Schema
  filters: Record<string, FilterValue>
}
```

### 4.3 TableSelector

**Datei:** `src/components/database/TableSelector.vue`
**Zweck:** Dropdown um Tabelle auszuwählen
**Props:**
```typescript
interface Props {
  tables: string[]
  selected: string
}
interface Emits {
  select: (table: string) => void
}
```

### 4.4 Pagination

**Datei:** `src/components/database/Pagination.vue`
**Zweck:** Pagination Controls (Previous, Page-Numbers, Next)
**Props:**
```typescript
interface Props {
  currentPage: number
  totalPages: number
  pageSize?: number
}
```

### 4.5 RecordDetailModal

**Datei:** `src/components/database/RecordDetailModal.vue`
**Zweck:** Modal um einzelnen DB-Record in detail zu sehen
**Features:**
- Expandable JSON-Display
- Formatted Datumsanzeige
- Copy-to-Clipboard für Fields

### 4.6 SchemaInfoPanel

**Datei:** `src/components/database/SchemaInfoPanel.vue`
**Zweck:** Zeige DB-Schema (Column-Names, Types, Nullability)
**Props:**
```typescript
interface Props {
  schema: ColumnSchema[]
}
```

---

## 5. Zone Components

### 5.1 ZoneAssignmentPanel

**Datei:** `src/components/zones/ZoneAssignmentPanel.vue`
**Zweck:** Dialog um Zone für ein ESP zu setzen
**Props:**
```typescript
interface Props {
  espId: string
  currentZoneId?: string
  currentZoneName?: string
  currentMasterZoneId?: string
}
interface Emits {
  'zone-updated': (data: { zone_id: string; zone_name?: string; master_zone_id?: string }) => void
}
```

---

## 6. Input Components (CSS-based, keine Komponenten)

**Standard Form Inputs:**
```html
<!-- Text Input -->
<input type="text" class="input" placeholder="Eingabe..." />

<!-- Number Input -->
<input type="number" class="input" min="0" max="100" step="0.1" />

<!-- Select -->
<select class="input">
  <option value="relay">Relais</option>
  <option value="pump">Pumpe</option>
</select>

<!-- Checkbox -->
<input type="checkbox" class="checkbox" />

<!-- Textarea -->
<textarea class="input" rows="5"></textarea>

<!-- Input mit Label -->
<div>
  <label class="label">Label</label>
  <input type="text" class="input" />
</div>

<!-- Input Error-State -->
<input type="text" class="input input-error" />
<p class="text-xs text-red-400 mt-1">Error message</p>
```

---

## 7. Layout Components

### 7.1 MainLayout

**Datei:** `src/components/layout/MainLayout.vue`
**Zweck:** Root-Layout mit Header, Sidebar, Content-Area
**Structure:**
```
MainLayout
├── AppHeader
│   ├── Logo
│   ├── Navigation-Links
│   ├── User-Menu
│   └── Theme-Toggle
├── AppSidebar
│   ├── Navigation-Links
│   └── Collapsible
└── Main Content Area (RouterView)
    └── Page Content
```

### 7.2 AppHeader

**Datei:** `src/components/layout/AppHeader.vue`
**Features:**
- AutomationOne Logo + Brand
- Navigation Links (Home, Devices, Logs, etc.)
- User-Menü (Settings, Logout)
- Theme-Toggle (Dark/Light - wenn implementiert)
- Mobile-Responsive (Hamburger-Menu)

### 7.3 AppSidebar

**Datei:** `src/components/layout/AppSidebar.vue`
**Features:**
- Navigation Tree
- Collapsible Sections (Admin-only, Debug, etc.)
- Active-Link Highlighting
- Icon + Label
- Mobile-Responsive (Overlay-Mode)

---

## 8. Wiederverwendung & Best Practices

### Do's ✅
- ✅ Verwende `Badge` für Status-Anzeige überall
- ✅ Verwende `LoadingState` während API-Calls
- ✅ Verwende `EmptyState` mit aussagekräftigem Text
- ✅ Props mit TypeScript interfaces definieren
- ✅ Emits korrekt typisieren
- ✅ Komponenten-Events als kebab-case (`@toggle-safe-mode`)

### Don'ts ❌
- ❌ Nicht Inline-Styles verwenden (außer Debug)
- ❌ Nicht HTML hardcoding für Status-Texte
- ❌ Nicht Props als `any` typisieren
- ❌ Nicht Komponenten-Logik im Parent verstecken
- ❌ Nicht CSS-Klassen zu hardcoded (verwende Variablen)

---

## 9. Component-Katalog-Matrix

| Komponente | Kategorie | Verwendung | Props | Emits |
|------------|-----------|-----------|-------|-------|
| LoadingState | Common | 10+ Views | `text?` | Keine |
| EmptyState | Common | 8+ Views | `icon?, title, desc, action?` | `action` |
| ErrorState | Common | 5+ Views | `message, showDismiss?` | `retry, dismiss` |
| Badge | Common | 15+ Stellen | `variant?, dot?, pulse?, size?` | Keine |
| ESPCard | ESP | MockEspView | `esp` | `heartbeat, toggle-safe-mode, delete` |
| SensorValueCard | ESP | SensorsView | `sensor, espId` | Keine |
| StatCard | Dashboard | DashboardView | `title, value, subtitle?, icon?, ...` | Keine |
| DataTable | Database | DatabaseExplorerView | `columns, rows, ...` | Pagination-Events |
| FilterPanel | Database | DatabaseExplorerView | `schema, filters` | `filter-changed` |
| TableSelector | Database | DatabaseExplorerView | `tables, selected` | `select` |
| Pagination | Database | DatabaseExplorerView | `currentPage, totalPages, ...` | `page-change` |
| RecordDetailModal | Database | DatabaseExplorerView | `record, schema` | `close` |
| SchemaInfoPanel | Database | DatabaseExplorerView | `schema` | Keine |
| ZoneAssignmentPanel | Zones | MockEspDetailView | `espId, zone?, master?` | `zone-updated` |

---

## 10. CSS Utility Classes

**Color Variables** (defined in main.css):
```css
--color-primary: #60A5FA       /* Blue */
--color-success: #34D399       /* Green */
--color-warning: #FBBF24       /* Amber */
--color-danger: #F87171        /* Red */
--color-info: #06B6D4          /* Cyan */
--color-mock: #A78BFA          /* Purple */
--color-real: #34D399          /* Green */

--color-iridescent-1: #60A5FA  /* Blue accent */
--color-iridescent-2: #A78BFA  /* Purple accent */
--color-iridescent-3: #EC4899  /* Pink accent */

--color-text-primary: #F1F5F9    /* Light text */
--color-text-secondary: #CBD5E1  /* Medium text */
--color-text-muted: #94A3B8      /* Dim text */
--color-text-error: #F87171      /* Error text */

--color-bg-primary: #0F172A      /* Dark background */
--color-bg-secondary: #1E293B    /* Card background */
--color-bg-tertiary: #334155     /* Hover background */
```

**Spacing**:
```css
/* Margin/Padding */
gap-1 to gap-6, p-1 to p-12, m-1 to m-12
flex-1, flex-grow, flex-shrink

/* Display */
grid, grid-cols-1/2/3/4
flex, flex-col, flex-wrap, flex-nowrap
```

**Typography**:
```css
/* Font Size */
text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl

/* Font Weight */
font-light, font-normal, font-medium, font-semibold, font-bold

/* Font Family */
font-sans, font-mono (für Zahlen/IDs)
```

---

## 11. Neue Komponenten entwickeln

**Template:**
```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'

interface Props {
  modelValue?: string
  disabled?: boolean
}

interface Emits {
  'update:modelValue': [value: string]
  change: [value: string]
}

withDefaults(defineProps<Props>(), {
  modelValue: '',
  disabled: false,
})

defineEmits<Emits>()
</script>

<template>
  <div class="component-container">
    <!-- Component content -->
  </div>
</template>

<style scoped>
.component-container {
  /* Styles */
}
</style>
```

**Checklist vor Commit:**
- [ ] Props mit TypeScript interfaces
- [ ] Emits korrekt typisiert
- [ ] Scoped styles (nie global)
- [ ] Accessibility (aria-labels, color-contrast)
- [ ] Mobile-responsive
- [ ] Dark-mode unterstützt
- [ ] Tests geschrieben
- [ ] Dokumentation aktualisiert

