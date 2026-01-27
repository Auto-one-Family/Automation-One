<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Settings, AlertTriangle, Sparkles, Radio } from 'lucide-vue-next'
import StatusPill from './StatusPill.vue'

type StatusFilter = 'online' | 'offline' | 'warning' | 'safemode'
type TypeFilter = 'all' | 'mock' | 'real'

interface Props {
  onlineCount: number
  offlineCount: number
  warningCount: number
  safeModeCount: number
  pendingCount?: number
  activeFilters: Set<StatusFilter>
  hasProblems?: boolean
  problemMessage?: string
  // Type filter props (consolidated from DashboardView)
  filterType?: TypeFilter
  totalCount?: number
  mockCount?: number
  realCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  hasProblems: false,
  problemMessage: '',
  pendingCount: 0,
  filterType: 'all',
  totalCount: 0,
  mockCount: 0,
  realCount: 0
})

const emit = defineEmits<{
  toggleFilter: [filter: StatusFilter]
  'update:filterType': [filter: TypeFilter]
  createMockEsp: []
  openSettings: []
  openPendingDevices: [event: MouseEvent]
}>()

// Has pending devices to show special button
const hasPendingDevices = computed(() => props.pendingCount > 0)

const isFilterActive = (filter: StatusFilter) => props.activeFilters.has(filter)

const barClasses = computed(() => {
  const base = 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors duration-300'

  if (props.hasProblems && props.warningCount > 0) {
    return `${base} bg-red-950/30 border-red-500/30`
  }

  return `${base} bg-gray-800/50 border-gray-700/50`
})
</script>

<template>
  <div :class="barClasses">
    <!-- Warning Banner (when problems exist) -->
    <div
      v-if="hasProblems && problemMessage"
      class="w-full flex items-center gap-2 text-amber-400 text-sm pb-2 border-b border-amber-500/20 sm:hidden"
    >
      <AlertTriangle class="w-4 h-4 flex-shrink-0" />
      <span>{{ problemMessage }}</span>
    </div>

    <!-- Left Side: Status Pills + Type Filter -->
    <div class="flex items-center gap-2 flex-wrap">
      <!-- Status Filter Pills -->
      <StatusPill
        type="online"
        :count="onlineCount"
        label="Online"
        :active="isFilterActive('online')"
        @click="emit('toggleFilter', 'online')"
      />
      <StatusPill
        type="offline"
        :count="offlineCount"
        label="Offline"
        :active="isFilterActive('offline')"
        @click="emit('toggleFilter', 'offline')"
      />
      <StatusPill
        v-if="warningCount > 0"
        type="warning"
        :count="warningCount"
        label="Fehler"
        :active="isFilterActive('warning')"
        @click="emit('toggleFilter', 'warning')"
      />
      <StatusPill
        v-if="safeModeCount > 0"
        type="safemode"
        :count="safeModeCount"
        label="Safe Mode"
        :active="isFilterActive('safemode')"
        @click="emit('toggleFilter', 'safemode')"
      />

      <!-- Divider -->
      <div class="type-filter-divider" />

      <!-- Type Filter Buttons (consolidated from separate row) -->
      <div class="type-filter-group">
        <button
          :class="['type-filter-btn', filterType === 'all' ? 'type-filter-btn--active' : '']"
          @click="emit('update:filterType', 'all')"
        >
          Alle ({{ totalCount }})
        </button>
        <button
          :class="['type-filter-btn', filterType === 'mock' ? 'type-filter-btn--active type-filter-btn--mock' : '']"
          @click="emit('update:filterType', 'mock')"
        >
          Mock ({{ mockCount }})
        </button>
        <button
          :class="['type-filter-btn', filterType === 'real' ? 'type-filter-btn--active type-filter-btn--real' : '']"
          @click="emit('update:filterType', 'real')"
        >
          Real ({{ realCount }})
        </button>
      </div>

      <!-- Problem indicator on desktop -->
      <div
        v-if="hasProblems && problemMessage"
        class="hidden sm:flex items-center gap-2 text-amber-400 text-sm ml-2 pl-3 border-l border-gray-700"
      >
        <AlertTriangle class="w-4 h-4 flex-shrink-0" />
        <span class="max-w-xs truncate">{{ problemMessage }}</span>
      </div>
    </div>

    <!-- Right Side: Quick Actions -->
    <div class="action-bar__buttons">
      <!-- Primary: Pending/Devices Button -->
      <button
        :class="[
          'action-bar__btn',
          hasPendingDevices ? 'action-bar__btn--iridescent' : 'action-bar__btn--default'
        ]"
        @click="(e) => emit('openPendingDevices', e)"
        :title="hasPendingDevices ? 'Neue Geräte warten auf Genehmigung' : 'Geräte verwalten'"
      >
        <component :is="hasPendingDevices ? Sparkles : Radio" class="w-4 h-4" />
        <span class="action-bar__btn-text">
          {{ hasPendingDevices ? `${pendingCount} Neue` : 'Geräte' }}
        </span>
      </button>

      <!-- Secondary: Create Mock ESP -->
      <button
        class="action-bar__btn action-bar__btn--secondary"
        @click="emit('createMockEsp')"
        title="Test-ESP erstellen"
      >
        <Plus class="w-4 h-4" />
        <span class="action-bar__btn-text">Mock</span>
      </button>

      <!-- Tertiary: Settings -->
      <button
        class="action-bar__btn action-bar__btn--ghost"
        @click="emit('openSettings')"
        title="Einstellungen"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Button Container */
.action-bar__buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Base Button */
.action-bar__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.5rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-bar__btn-text {
  display: none;
}

@media (min-width: 640px) {
  .action-bar__btn-text {
    display: inline;
  }
}

/* Default State */
.action-bar__btn--default {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.action-bar__btn--default:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

/* Iridescent State (Pending Devices Active) */
.action-bar__btn--iridescent {
  position: relative;
  color: white;
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.2) 0%,
    rgba(129, 140, 248, 0.2) 50%,
    rgba(167, 139, 250, 0.2) 100%
  );
  border-color: transparent;
  overflow: hidden;
  animation: iridescent-pulse 2.5s ease-in-out infinite;
}

.action-bar__btn--iridescent::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    var(--color-iridescent-1) 0%,
    var(--color-iridescent-2) 33%,
    var(--color-iridescent-3) 66%,
    var(--color-iridescent-4) 100%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: iridescent-shift 3s ease-in-out infinite;
  pointer-events: none;
}

/* Shimmer overlay */
.action-bar__btn--iridescent::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1),
    transparent
  );
  animation: shimmer 3s ease-in-out infinite;
  pointer-events: none;
}

.action-bar__btn--iridescent:hover {
  transform: translateY(-1px);
  box-shadow:
    0 4px 12px rgba(96, 165, 250, 0.3),
    0 0 20px rgba(129, 140, 248, 0.2);
}

@keyframes iridescent-pulse {
  0%, 100% {
    box-shadow:
      0 0 8px rgba(96, 165, 250, 0.2),
      0 0 16px rgba(129, 140, 248, 0.1);
  }
  50% {
    box-shadow:
      0 0 12px rgba(96, 165, 250, 0.4),
      0 0 24px rgba(129, 140, 248, 0.2);
  }
}

@keyframes iridescent-shift {
  0%, 100% {
    filter: hue-rotate(0deg);
  }
  50% {
    filter: hue-rotate(30deg);
  }
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  50%, 100% {
    left: 200%;
  }
}

/* Secondary (Mock ESP) */
.action-bar__btn--secondary {
  color: var(--color-emerald-400, #34d399);
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.2);
}

.action-bar__btn--secondary:hover {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.3);
}

/* Ghost (Settings) */
.action-bar__btn--ghost {
  padding: 0.5rem;
  color: var(--color-text-tertiary);
  background: transparent;
}

.action-bar__btn--ghost:hover {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.05);
}

/* ============================================
   Type Filter (consolidated from DashboardView)
   ============================================ */

/* Divider between Status Pills and Type Filter */
.type-filter-divider {
  width: 1px;
  height: 24px;
  background: var(--color-border, rgba(255, 255, 255, 0.1));
  margin: 0 0.25rem;
}

/* Type Filter Button Group */
.type-filter-group {
  display: flex;
  gap: 0.25rem;
  background-color: var(--color-bg-tertiary, rgba(30, 30, 40, 0.5));
  padding: 0.25rem;
  border-radius: 0.5rem;
}

/* Type Filter Button */
.type-filter-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  color: var(--color-text-muted, #9ca3af);
  transition: all 0.2s;
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;
}

.type-filter-btn:hover {
  color: var(--color-text-primary, #f3f4f6);
}

.type-filter-btn--active {
  background-color: var(--color-bg-secondary, rgba(55, 55, 70, 0.8));
  color: var(--color-text-primary, #f3f4f6);
}

.type-filter-btn--mock.type-filter-btn--active {
  color: var(--color-mock, #a78bfa);
}

.type-filter-btn--real.type-filter-btn--active {
  color: var(--color-real, #60a5fa);
}

/* Responsive: Hide divider on very small screens */
@media (max-width: 480px) {
  .type-filter-divider {
    display: none;
  }

  .type-filter-group {
    margin-top: 0.5rem;
    width: 100%;
    justify-content: center;
  }
}
</style>
