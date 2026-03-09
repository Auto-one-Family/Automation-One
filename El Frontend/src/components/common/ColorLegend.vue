<script setup lang="ts">
/**
 * ColorLegend — Status Color Reference Popover
 *
 * Shows a visual legend explaining the meaning of status colors
 * used throughout the application. Triggered by an info icon
 * in the TopBar. Uses CSS design tokens for all colors.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { Palette } from 'lucide-vue-next'

const isOpen = ref(false)

function toggle() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape' && isOpen.value) {
    close()
    e.stopPropagation()
  }
}

onMounted(() => document.addEventListener('keydown', handleEsc))
onUnmounted(() => document.removeEventListener('keydown', handleEsc))

const legendItems = [
  {
    color: 'var(--color-success)',
    label: 'Online / OK',
    description: 'Gerät verbunden, Wert im Normalbereich',
  },
  {
    color: 'var(--color-warning)',
    label: 'Warnung',
    description: 'Schwellwert nah oder Sensor-Drift erkannt',
  },
  {
    color: 'var(--color-error)',
    label: 'Alarm / Fehler',
    description: 'Schwellwert überschritten oder Gerät offline',
  },
  {
    color: 'var(--color-status-offline)',
    label: 'Keine Daten',
    description: 'Deaktiviert oder keine Verbindung',
  },
  {
    color: 'var(--color-mock)',
    label: 'Test-Gerät',
    description: 'Simuliertes ESP (Mock) für Entwicklung',
  },
  {
    color: 'var(--color-real)',
    label: 'Hardware-Gerät',
    description: 'Echtes ESP32-Gerät (Real)',
  },
]
</script>

<template>
  <div class="color-legend">
    <button
      class="color-legend__trigger"
      title="Farb-Legende anzeigen"
      @click="toggle"
    >
      <Palette class="color-legend__icon" />
    </button>

    <Transition name="legend-pop">
      <div v-if="isOpen" class="color-legend__popover">
        <div class="color-legend__header">
          <span class="color-legend__title">Farb-Legende</span>
        </div>
        <ul class="color-legend__list">
          <li
            v-for="item in legendItems"
            :key="item.label"
            class="color-legend__item"
          >
            <span
              class="color-legend__dot"
              :style="{ backgroundColor: item.color }"
            />
            <div class="color-legend__text">
              <span class="color-legend__label">{{ item.label }}</span>
              <span class="color-legend__desc">{{ item.description }}</span>
            </div>
          </li>
        </ul>
      </div>
    </Transition>

    <!-- Click-away overlay -->
    <div
      v-if="isOpen"
      class="color-legend__backdrop"
      @click="close"
    />
  </div>
</template>

<style scoped>
.color-legend {
  position: relative;
  display: flex;
  align-items: center;
}

.color-legend__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: transparent;
  border: none;
}

.color-legend__trigger:hover {
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
}

.color-legend__icon {
  width: 16px;
  height: 16px;
}

/* Popover */
.color-legend__popover {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-2));
  width: 280px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-floating);
  z-index: var(--z-dropdown);
  overflow: hidden;
}

.color-legend__header {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--glass-border);
}

.color-legend__title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.color-legend__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.color-legend__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.color-legend__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  margin-top: 4px;
  box-shadow: 0 0 4px currentColor;
}

.color-legend__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.color-legend__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

.color-legend__desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
}

/* Backdrop */
.color-legend__backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-dropdown) - 1);
}

/* Transitions */
.legend-pop-enter-active {
  transition: all var(--duration-fast) var(--ease-out);
}

.legend-pop-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}

.legend-pop-enter-from,
.legend-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
