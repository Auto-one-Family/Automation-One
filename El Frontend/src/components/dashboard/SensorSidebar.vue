<script setup lang="ts">
/**
 * SensorSidebar Component
 *
 * Sidebar mit verfügbaren Sensor-Typen, gruppiert nach Kategorien.
 * Sensoren können per Drag-and-Drop auf ESPs gezogen werden,
 * um einen neuen Sensor zu diesem ESP hinzuzufügen.
 *
 * Features:
 * - Sensor-Typen gruppiert nach Kategorien (Temperatur, Wasser, Boden, etc.)
 * - Kollabierbare Kategorien
 * - Lucide Icons (konsistent mit Rest der App)
 * - Globaler Drag-State via dragStateStore
 * - Kompakte Darstellung (80px breit)
 */

import { ref, computed, watch, type Component } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Thermometer,
  Droplet,
  Droplets,
  Zap,
  Sun,
  Cloud,
  Gauge,
  Waves,
  Layers,
  Activity,
  ToggleLeft,
  Leaf,
  Wind,
  Settings,
} from 'lucide-vue-next'
import {
  SENSOR_TYPE_CONFIG,
  SENSOR_CATEGORIES,
  type SensorTypeConfig,
  type SensorCategoryId
} from '@/utils/sensorDefaults'
import { useDragStateStore } from '@/stores/dragState'

const dragStore = useDragStateStore()

// Sidebar collapsed state
const isCollapsed = ref(false)

// Expanded categories (default: temperature and water expanded)
const expandedCategories = ref<Set<SensorCategoryId>>(new Set(['temperature', 'water']))

// ISSUE-001 fix: Reactive state for dragging sensor type instead of direct DOM manipulation
// This ensures cleanup even when dragend doesn't fire (Escape key, tab switch, etc.)
const draggingSensorType = ref<string | null>(null)

// Watch dragStore for cleanup when drag ends by any means
watch(() => dragStore.isDraggingSensorType, (isDragging) => {
  if (!isDragging) {
    draggingSensorType.value = null
  }
})

// Icon mapping: Lucide icon name string -> Component
const iconComponents: Record<string, Component> = {
  Thermometer,
  Droplet,
  Droplets,
  Zap,
  Sun,
  Cloud,
  Gauge,
  Waves,
  Layers,
  Activity,
  ToggleLeft,
  Leaf,
  Wind,
  Settings,
}

// Basis-Sensor-Typen (keine Untertypen wie SHT31_humidity, BME280_pressure)
// Diese repräsentieren die physischen Hardware-Sensoren
const BASE_SENSOR_TYPES = [
  'DS18B20',   // Temperatur (wasserdicht)
  'SHT31',     // Temperatur + Feuchtigkeit (I2C)
  'BME280',    // Temperatur + Feuchtigkeit + Druck (I2C)
  'pH',        // pH-Wert (analog)
  'EC',        // Leitfähigkeit (analog)
  'moisture',  // Bodenfeuchte (analog)
  'light',     // Lichtstärke
  'co2',       // CO2-Konzentration
  'flow',      // Durchflussmesser
  'level',     // Füllstandssensor
] as const

// Kurzlabels für kompakte Sidebar-Darstellung
const SHORT_LABELS: Record<string, string> = {
  'DS18B20': 'Temp',
  'SHT31': 'T+H',
  'BME280': 'T+H+P',
  'pH': 'pH',
  'EC': 'EC',
  'moisture': 'Feuchte',
  'light': 'Licht',
  'co2': 'CO2',
  'flow': 'Flow',
  'level': 'Level',
}

// Interface for draggable sensor type
interface DraggableSensorType {
  type: string
  shortLabel: string
  config: SensorTypeConfig
  iconComponent: Component
}

// Interface for category with its sensor types
interface CategoryGroup {
  id: SensorCategoryId
  name: string
  iconComponent: Component
  types: DraggableSensorType[]
}

// Computed: Sensor-Typen gruppiert nach Kategorien
const categorizedSensorTypes = computed<CategoryGroup[]>(() => {
  // Alle Basis-Sensor-Typen mit Config
  const sensorTypes = BASE_SENSOR_TYPES
    .filter(type => SENSOR_TYPE_CONFIG[type])
    .map(type => {
      const config = SENSOR_TYPE_CONFIG[type]
      return {
        type,
        shortLabel: SHORT_LABELS[type] || type,
        config,
        iconComponent: iconComponents[config.icon] || Activity,
      }
    })

  // Nach Kategorien gruppieren
  return Object.entries(SENSOR_CATEGORIES)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([categoryId, categoryConfig]) => {
      const types = sensorTypes.filter(s => s.config.category === categoryId)
      return {
        id: categoryId as SensorCategoryId,
        name: categoryConfig.name,
        iconComponent: iconComponents[categoryConfig.icon] || Settings,
        types,
      }
    })
    .filter(cat => cat.types.length > 0) // Leere Kategorien ausblenden
})

// Toggle category expanded state
function toggleCategory(categoryId: SensorCategoryId) {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId)
  } else {
    expandedCategories.value.add(categoryId)
  }
}

// Handle drag start - set sensor type data for drop target
// ISSUE-001 fix: Use reactive state instead of direct DOM manipulation
function onSensorTypeDragStart(event: DragEvent, sensor: DraggableSensorType) {
  if (!event.dataTransfer) return

  const dragData = {
    action: 'add-sensor' as const,
    sensorType: sensor.type,
    label: sensor.config.label,
    defaultUnit: sensor.config.unit,
    icon: sensor.config.icon,
  }

  event.dataTransfer.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer.setData('text/plain', sensor.type)  // Fallback
  event.dataTransfer.effectAllowed = 'copy'

  // Update global drag state
  dragStore.startSensorTypeDrag(dragData)

  // Set reactive state for visual feedback (replaces direct DOM manipulation)
  draggingSensorType.value = sensor.type
}

function onSensorTypeDragEnd() {
  // Clear global drag state - this also triggers the watch which clears draggingSensorType
  dragStore.endDrag()
  // Explicitly clear for immediate feedback (watch is async)
  draggingSensorType.value = null
}

// Toggle sidebar
function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <aside
    class="sensor-sidebar"
    :class="{ 'sensor-sidebar--collapsed': isCollapsed }"
  >
    <!-- Toggle Button -->
    <button
      class="sensor-sidebar__toggle"
      @click="toggleSidebar"
      :title="isCollapsed ? 'Sensoren einblenden' : 'Sensoren ausblenden'"
    >
      <component :is="isCollapsed ? ChevronLeft : ChevronRight" class="w-4 h-4" />
    </button>

    <!-- Sidebar Content -->
    <div v-show="!isCollapsed" class="sensor-sidebar__content">
      <!-- Header -->
      <div class="sensor-sidebar__header">
        <span class="sensor-sidebar__title">Sensoren</span>
        <span class="sensor-sidebar__hint">Auf ESP ziehen</span>
      </div>

      <!-- Categorized Sensor Type List -->
      <div class="sensor-sidebar__categories">
        <div
          v-for="category in categorizedSensorTypes"
          :key="category.id"
          class="sensor-category"
        >
          <!-- Category Header (clickable to expand/collapse) -->
          <button
            class="sensor-category__header"
            @click="toggleCategory(category.id)"
            :title="`${category.name} ${expandedCategories.has(category.id) ? 'einklappen' : 'ausklappen'}`"
          >
            <component
              :is="category.iconComponent"
              class="sensor-category__icon"
              :size="14"
            />
            <span class="sensor-category__name">{{ category.name }}</span>
            <ChevronDown
              class="sensor-category__chevron"
              :class="{ 'sensor-category__chevron--collapsed': !expandedCategories.has(category.id) }"
              :size="14"
            />
          </button>

          <!-- Category Content (sensor types) -->
          <Transition name="collapse">
            <div
              v-if="expandedCategories.has(category.id)"
              class="sensor-category__content"
            >
              <!-- ISSUE-001 fix: Use reactive class binding instead of direct DOM manipulation -->
              <div
                v-for="sensor in category.types"
                :key="sensor.type"
                class="sensor-type"
                :class="{ 'sensor-type--dragging': draggingSensorType === sensor.type }"
                draggable="true"
                @dragstart="onSensorTypeDragStart($event, sensor)"
                @dragend="onSensorTypeDragEnd"
                :title="sensor.config.description"
              >
                <component
                  :is="sensor.iconComponent"
                  class="sensor-type__icon"
                  :size="20"
                  :stroke-width="1.5"
                />
                <span class="sensor-type__label">{{ sensor.shortLabel }}</span>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sensor-sidebar {
  position: relative;
  width: 100px;
  min-width: 100px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease;
  overflow: hidden;
}

.sensor-sidebar--collapsed {
  width: 24px;
  min-width: 24px;
}

.sensor-sidebar__toggle {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem 0 0 0.375rem;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: all 0.2s;
  z-index: 10;
}

.sensor-sidebar__toggle:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-color: var(--color-iridescent-1);
}

.sensor-sidebar__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.625rem;
  gap: 0.5rem;
  overflow-y: auto;
}

.sensor-sidebar__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--glass-border);
}

.sensor-sidebar__title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.sensor-sidebar__hint {
  font-size: 0.6rem;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.sensor-sidebar__categories {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  overflow-y: auto;
}

/* Category */
.sensor-category {
  border-bottom: 1px solid var(--glass-border);
}

.sensor-category:last-child {
  border-bottom: none;
}

.sensor-category__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.375rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.15s ease;
}

.sensor-category__header:hover {
  background: rgba(167, 139, 250, 0.08);
  color: var(--color-text-primary);
}

.sensor-category__icon {
  flex-shrink: 0;
  color: var(--color-iridescent-1);
  opacity: 0.8;
}

.sensor-category__header:hover .sensor-category__icon {
  opacity: 1;
}

.sensor-category__name {
  flex: 1;
  font-size: 0.7rem;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sensor-category__chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform 0.2s ease;
}

.sensor-category__header:hover .sensor-category__chevron {
  color: var(--color-text-secondary);
}

.sensor-category__chevron--collapsed {
  transform: rotate(-90deg);
}

.sensor-category__content {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.375rem 0.125rem;
}

/* Collapse Transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 500px;
}

/* Sensor Type Pill */
.sensor-type {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0.375rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  cursor: grab;
  transition: all 0.15s ease;
  user-select: none;
}

.sensor-type:hover {
  background: rgba(167, 139, 250, 0.12);
  border-color: var(--color-iridescent-1);
  transform: scale(1.02);
  box-shadow: 0 2px 8px rgba(167, 139, 250, 0.15);
}

.sensor-type:hover .sensor-type__icon {
  color: var(--color-iridescent-2);
}

.sensor-type:active,
.sensor-type--dragging {
  cursor: grabbing;
  transform: scale(0.95);
  opacity: 0.7;
  border-color: var(--color-iridescent-2);
  box-shadow: 0 0 12px rgba(167, 139, 250, 0.4);
}

.sensor-type__icon {
  color: var(--color-iridescent-1);
  transition: color 0.15s ease;
}

.sensor-type__label {
  font-size: 0.6rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-align: center;
  margin-top: 0.25rem;
  line-height: 1.2;
}

/* Scrollbar Styling */
.sensor-sidebar__categories::-webkit-scrollbar {
  width: 3px;
}

.sensor-sidebar__categories::-webkit-scrollbar-track {
  background: transparent;
}

.sensor-sidebar__categories::-webkit-scrollbar-thumb {
  background: var(--glass-border);
  border-radius: 2px;
}

.sensor-sidebar__categories::-webkit-scrollbar-thumb:hover {
  background: var(--color-iridescent-1);
}
</style>
