<script setup lang="ts">
/**
 * ActuatorSidebar Component (Phase 7)
 *
 * Sidebar mit verfügbaren Aktor-Typen, gruppiert nach Kategorien.
 * Aktoren können per Drag-and-Drop auf ESPs gezogen werden,
 * um einen neuen Aktor zu diesem ESP hinzuzufügen.
 *
 * Features:
 * - Aktor-Typen gruppiert nach Kategorien (Pumpen, Ventile, Relais, PWM)
 * - Smart Collapse: Kategorien mit nur 1 Element werden direkt angezeigt (kein Chevron)
 * - Lucide Icons (konsistent mit Rest der App)
 * - Globaler Drag-State via dragStateStore
 * - Responsive Design mit clamp() für besseres Zoom-Verhalten
 * - Verbesserte Tooltips mit vollständigem Namen + Beschreibung
 */

import { ref, computed, watch, type Component } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Droplet,
  Zap,
  Power,
  Gauge,
  Settings,
} from 'lucide-vue-next'
import {
  ACTUATOR_TYPE_CONFIG,
  ACTUATOR_CATEGORIES,
  type ActuatorTypeConfig,
  type ActuatorCategoryId
} from '@/utils/actuatorDefaults'
import { useDragStateStore } from '@/stores/dragState'

const dragStore = useDragStateStore()

// Sidebar collapsed state
const isCollapsed = ref(false)

// Expanded categories (default: all expanded since there are only 4 types)
const expandedCategories = ref<Set<ActuatorCategoryId>>(new Set(['pump', 'valve', 'relay', 'pwm']))

// Reactive state for dragging actuator type
const draggingActuatorType = ref<string | null>(null)

// Watch dragStore for cleanup when drag ends by any means
watch(() => dragStore.isDraggingActuatorType, (isDragging) => {
  if (!isDragging) {
    draggingActuatorType.value = null
  }
})

// Icon mapping: Lucide icon name string -> Component
const iconComponents: Record<string, Component> = {
  Droplet,
  Zap,
  Power,
  Gauge,
  Settings,
}

// Interface for draggable actuator type
interface DraggableActuatorType {
  type: string
  config: ActuatorTypeConfig
  iconComponent: Component
}

// Interface for category with its actuator types
interface CategoryGroup {
  id: ActuatorCategoryId
  name: string
  iconComponent: Component
  types: DraggableActuatorType[]
}

// Computed: Aktor-Typen gruppiert nach Kategorien
const categorizedActuatorTypes = computed<CategoryGroup[]>(() => {
  // Alle Aktor-Typen mit Config
  const actuatorTypes = Object.entries(ACTUATOR_TYPE_CONFIG)
    .map(([type, config]) => ({
      type,
      config,
      iconComponent: iconComponents[config.icon] || Power,
    }))

  // Nach Kategorien gruppieren
  return Object.entries(ACTUATOR_CATEGORIES)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([categoryId, categoryConfig]) => {
      const types = actuatorTypes.filter(a => a.config.category === categoryId)
      return {
        id: categoryId as ActuatorCategoryId,
        name: categoryConfig.name,
        iconComponent: iconComponents[categoryConfig.icon] || Settings,
        types,
      }
    })
    .filter(cat => cat.types.length > 0) // Leere Kategorien ausblenden
})

// Toggle category expanded state
function toggleCategory(categoryId: ActuatorCategoryId) {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId)
  } else {
    expandedCategories.value.add(categoryId)
  }
}

// Handle drag start - set actuator type data for drop target
function onActuatorTypeDragStart(event: DragEvent, actuator: DraggableActuatorType) {
  if (!event.dataTransfer) return

  const dragData = {
    action: 'add-actuator' as const,
    actuatorType: actuator.type,
    label: actuator.config.label,
    icon: actuator.config.icon,
    isPwm: actuator.config.isPwm,
  }

  event.dataTransfer.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer.setData('text/plain', actuator.type)  // Fallback
  event.dataTransfer.effectAllowed = 'copy'

  // Update global drag state
  dragStore.startActuatorTypeDrag(dragData)

  // Set reactive state for visual feedback
  draggingActuatorType.value = actuator.type
}

function onActuatorTypeDragEnd() {
  // Clear global drag state - this also triggers the watch which clears draggingActuatorType
  dragStore.endDrag()
  // Explicitly clear for immediate feedback (watch is async)
  draggingActuatorType.value = null
}

// Toggle sidebar
function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <aside
    class="actuator-sidebar"
    :class="{ 'actuator-sidebar--collapsed': isCollapsed }"
  >
    <!-- Toggle Button -->
    <button
      class="actuator-sidebar__toggle"
      @click="toggleSidebar"
      :title="isCollapsed ? 'Aktoren einblenden' : 'Aktoren ausblenden'"
    >
      <component :is="isCollapsed ? ChevronLeft : ChevronRight" class="w-4 h-4" />
    </button>

    <!-- Sidebar Content -->
    <div v-show="!isCollapsed" class="actuator-sidebar__content">
      <!-- Header -->
      <div class="actuator-sidebar__header">
        <span class="actuator-sidebar__title">Aktoren</span>
        <span class="actuator-sidebar__hint">Auf ESP ziehen</span>
      </div>

      <!-- Categorized Actuator Type List -->
      <div class="actuator-sidebar__categories">
        <div
          v-for="category in categorizedActuatorTypes"
          :key="category.id"
          class="actuator-category"
          :class="{ 'actuator-category--single': category.types.length === 1 }"
        >
          <!-- Category Header: Nur klickbar wenn > 1 Element -->
          <button
            v-if="category.types.length > 1"
            class="actuator-category__header actuator-category__header--collapsible"
            @click="toggleCategory(category.id)"
            :title="`${category.name} (${category.types.length}) ${expandedCategories.has(category.id) ? 'einklappen' : 'ausklappen'}`"
          >
            <component
              :is="category.iconComponent"
              class="actuator-category__icon"
              :size="14"
            />
            <span class="actuator-category__name">{{ category.name }}</span>
            <ChevronDown
              class="actuator-category__chevron"
              :class="{ 'actuator-category__chevron--collapsed': !expandedCategories.has(category.id) }"
              :size="14"
            />
          </button>
          <!-- Für Kategorien mit nur 1 Element: Kein Collapse, direkt Label -->
          <div v-else class="actuator-category__header actuator-category__header--static">
            <component
              :is="category.iconComponent"
              class="actuator-category__icon"
              :size="14"
            />
            <span class="actuator-category__name">{{ category.name }}</span>
          </div>

          <!-- Category Content (actuator types) -->
          <!-- Bei > 1 Element: Collapsible -->
          <Transition v-if="category.types.length > 1" name="collapse">
            <div
              v-if="expandedCategories.has(category.id)"
              class="actuator-category__content"
            >
              <div
                v-for="actuator in category.types"
                :key="actuator.type"
                class="actuator-type"
                :class="{ 'actuator-type--dragging': draggingActuatorType === actuator.type }"
                draggable="true"
                @dragstart="onActuatorTypeDragStart($event, actuator)"
                @dragend="onActuatorTypeDragEnd"
                :title="`${actuator.config.label}\n${actuator.config.description}`"
              >
                <component
                  :is="actuator.iconComponent"
                  class="actuator-type__icon"
                  :size="20"
                  :stroke-width="1.5"
                />
                <span class="actuator-type__label">{{ actuator.config.label }}</span>
              </div>
            </div>
          </Transition>
          <!-- Bei 1 Element: Immer sichtbar, ohne Animation -->
          <div v-else class="actuator-category__content actuator-category__content--always-visible">
            <div
              v-for="actuator in category.types"
              :key="actuator.type"
              class="actuator-type"
              :class="{ 'actuator-type--dragging': draggingActuatorType === actuator.type }"
              draggable="true"
              @dragstart="onActuatorTypeDragStart($event, actuator)"
              @dragend="onActuatorTypeDragEnd"
              :title="`${actuator.config.label}\n${actuator.config.description}`"
            >
              <component
                :is="actuator.iconComponent"
                class="actuator-type__icon"
                :size="20"
                :stroke-width="1.5"
              />
              <span class="actuator-type__label">{{ actuator.config.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.actuator-sidebar {
  position: relative;
  /* Responsive width: min 80px, preferred 100px, max 120px bei Zoom */
  width: clamp(80px, 6rem, 120px);
  min-width: clamp(80px, 6rem, 120px);
  flex-shrink: 0;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease;
  overflow: hidden;
}

.actuator-sidebar--collapsed {
  width: 24px;
  min-width: 24px;
}

.actuator-sidebar__toggle {
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

.actuator-sidebar__toggle:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-color: var(--color-accent-blue);
}

.actuator-sidebar__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.625rem;
  gap: 0.5rem;
  overflow-y: auto;
}

.actuator-sidebar__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--glass-border);
}

.actuator-sidebar__title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.actuator-sidebar__hint {
  font-size: 0.6rem;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.actuator-sidebar__categories {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  overflow-y: auto;
}

/* Category */
.actuator-category {
  border-bottom: 1px solid var(--glass-border);
}

.actuator-category:last-child {
  border-bottom: none;
}

.actuator-category__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.375rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: var(--color-text-secondary);
  transition: all 0.15s ease;
}

/* Collapsible Header (mit Chevron) - interaktiv */
.actuator-category__header--collapsible {
  cursor: pointer;
}

.actuator-category__header--collapsible:hover {
  background: rgba(59, 130, 246, 0.08);
  color: var(--color-text-primary);
}

/* Static Header (ohne Chevron) - nicht interaktiv */
.actuator-category__header--static {
  cursor: default;
  padding-bottom: 0.25rem;
}

/* Kategorien mit nur 1 Element: Kompakter */
.actuator-category--single {
  padding-bottom: 0.25rem;
}

.actuator-category--single .actuator-category__content--always-visible {
  padding-top: 0;
}

.actuator-category__icon {
  flex-shrink: 0;
  color: var(--color-accent-blue);
  opacity: 0.8;
}

.actuator-category__header--collapsible:hover .actuator-category__icon {
  opacity: 1;
}

.actuator-category__name {
  flex: 1;
  font-size: 0.7rem;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actuator-category__chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform 0.2s ease;
}

.actuator-category__header--collapsible:hover .actuator-category__chevron {
  color: var(--color-text-secondary);
}

.actuator-category__chevron--collapsed {
  transform: rotate(-90deg);
}

.actuator-category__content {
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

/* Actuator Type Pill */
.actuator-type {
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

.actuator-type:hover {
  background: rgba(59, 130, 246, 0.12);
  border-color: var(--color-accent-blue);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

.actuator-type:hover .actuator-type__icon {
  color: var(--color-accent-cyan);
}

.actuator-type:active,
.actuator-type--dragging {
  cursor: grabbing;
  opacity: 0.7;
  border-color: var(--color-accent-cyan);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
}

.actuator-type__icon {
  color: var(--color-accent-blue);
  transition: color 0.15s ease;
}

.actuator-type__label {
  font-size: 0.6rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-align: center;
  margin-top: 0.25rem;
  line-height: 1.2;
}

/* Scrollbar Styling */
.actuator-sidebar__categories::-webkit-scrollbar {
  width: 3px;
}

.actuator-sidebar__categories::-webkit-scrollbar-track {
  background: transparent;
}

.actuator-sidebar__categories::-webkit-scrollbar-thumb {
  background: var(--glass-border);
  border-radius: 2px;
}

.actuator-sidebar__categories::-webkit-scrollbar-thumb:hover {
  background: var(--color-accent-blue);
}
</style>
