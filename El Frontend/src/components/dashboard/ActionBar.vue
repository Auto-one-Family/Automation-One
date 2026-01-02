<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Wifi, Settings, AlertTriangle } from 'lucide-vue-next'
import StatusPill from './StatusPill.vue'

type StatusFilter = 'online' | 'offline' | 'warning' | 'safemode'

interface Props {
  onlineCount: number
  offlineCount: number
  warningCount: number
  safeModeCount: number
  activeFilters: Set<StatusFilter>
  hasProblems?: boolean
  problemMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  hasProblems: false,
  problemMessage: ''
})

const emit = defineEmits<{
  toggleFilter: [filter: StatusFilter]
  createMockEsp: []
  showRealEspInfo: []
  openSettings: []
}>()

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

    <!-- Left Side: Status Pills -->
    <div class="flex items-center gap-2 flex-wrap">
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
    <div class="flex items-center gap-2">
      <!-- Create Mock ESP Button -->
      <button
        class="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg"
        @click="emit('createMockEsp')"
      >
        <Plus class="w-4 h-4" />
        <span class="hidden sm:inline">Mock ESP</span>
      </button>

      <!-- Real ESP Info Button -->
      <button
        class="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg"
        @click="emit('showRealEspInfo')"
      >
        <Wifi class="w-4 h-4" />
        <span class="hidden sm:inline">Real ESP</span>
      </button>

      <!-- Settings Dropdown (optional, shown on larger screens) -->
      <button
        class="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
        @click="emit('openSettings')"
        title="Dashboard Einstellungen"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.btn-primary {
  @apply bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-medium
         hover:from-emerald-500 hover:to-emerald-400
         active:from-emerald-700 active:to-emerald-600
         transition-all duration-200 shadow-lg shadow-emerald-500/20;
}

.btn-secondary {
  @apply bg-gray-700/50 text-gray-300 border border-gray-600
         hover:bg-gray-600/50 hover:text-white
         transition-all duration-200;
}
</style>
