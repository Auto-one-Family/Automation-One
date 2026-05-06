<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useDashboardStore } from '@/shared/stores/dashboard.store'
import { useAlertCenterStore } from '@/shared/stores'

const router = useRouter()
const espStore = useEspStore()
const dashStore = useDashboardStore()
const alertStore = useAlertCenterStore()

const onlineCount = computed(() => dashStore.statusCounts.online)
const offlineCount = computed(() => dashStore.statusCounts.offline)
const alarmCount = computed(() => alertStore.alertStats?.active_count ?? 0)

const hasMockDevices = computed(() => espStore.mockDevices.length > 0)
const showDevTypeToggle = computed(
  () => import.meta.env.MODE === 'development' || hasMockDevices.value
)

function navigateAndFilter(statusKey: 'online' | 'offline') {
  router.push('/hardware')
  dashStore.resetFilters()
  dashStore.toggleStatusFilter(statusKey)
}
</script>

<template>
  <div class="hds" aria-label="Gerätestatus">
    <button
      class="hds__chip hds__chip--online"
      :title="`${onlineCount} Geräte online — in Hardware filtern`"
      @click="navigateAndFilter('online')"
    >
      <span class="hds__dot hds__dot--online" aria-hidden="true" />
      <span class="hds__label">{{ onlineCount }} Online</span>
    </button>

    <button
      class="hds__chip hds__chip--offline"
      :title="`${offlineCount} Geräte offline — in Hardware filtern`"
      @click="navigateAndFilter('offline')"
    >
      <span class="hds__dot hds__dot--offline" aria-hidden="true" />
      <span class="hds__label">{{ offlineCount }} Offline</span>
    </button>

    <span
      v-if="alarmCount > 0"
      class="hds__chip hds__chip--alarm"
      :title="`${alarmCount} aktive Alarme`"
    >
      <span class="hds__label" aria-hidden="true">&#9888;</span>
      <span class="hds__label">{{ alarmCount }}</span>
    </span>

    <template v-if="showDevTypeToggle">
      <span class="hds__sep" aria-hidden="true" />
      <div class="hds__type-segment" aria-label="Gerätetyp-Filter">
        <button
          :class="['hds__type-btn', { 'hds__type-btn--active': dashStore.filterType === 'all' }]"
          @click="dashStore.filterType = 'all'"
        >Alle <span class="hds__type-count">{{ dashStore.deviceCounts.all }}</span></button>
        <button
          :class="['hds__type-btn', 'hds__type-btn--mock', { 'hds__type-btn--active': dashStore.filterType === 'mock' }]"
          @click="dashStore.filterType = 'mock'"
        >Mock <span class="hds__type-count">{{ dashStore.deviceCounts.mock }}</span></button>
        <button
          :class="['hds__type-btn', 'hds__type-btn--real', { 'hds__type-btn--active': dashStore.filterType === 'real' }]"
          @click="dashStore.filterType = 'real'"
        >Real <span class="hds__type-count">{{ dashStore.deviceCounts.real }}</span></button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hds {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.hds__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.hds__chip:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border-hover);
}

.hds__chip--online {
  color: var(--color-success);
}

.hds__chip--offline {
  color: var(--color-text-muted);
}

.hds__chip--alarm {
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.25);
  cursor: default;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hds__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.hds__dot--online {
  background-color: var(--color-success);
  box-shadow: 0 0 4px var(--color-success);
}

.hds__dot--offline {
  background-color: var(--color-text-muted);
}

.hds__label {
  font-variant-numeric: tabular-nums;
}

.hds__sep {
  width: 1px;
  height: 14px;
  background: var(--glass-border);
  flex-shrink: 0;
  margin: 0 var(--space-1);
}

.hds__type-segment {
  display: flex;
  gap: 1px;
  background: var(--color-bg-primary);
  padding: 2px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
}

.hds__type-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.hds__type-btn:hover {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.hds__type-btn--active {
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.hds__type-btn--mock.hds__type-btn--active {
  color: var(--color-mock);
}

.hds__type-btn--real.hds__type-btn--active {
  color: var(--color-real);
}

.hds__type-count {
  font-size: var(--text-xxs);
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.hds__type-btn--active .hds__type-count {
  opacity: 1;
}

@media (max-width: 767px) {
  .hds__type-segment {
    display: none;
  }

  .hds__sep {
    display: none;
  }
}

@media (max-width: 1366px), (max-height: 820px) {
  .hds__chip,
  .hds__type-segment {
    background: var(--color-bg-tertiary);
    border-color: var(--glass-border-hover);
    box-shadow: none;
  }
}
</style>
