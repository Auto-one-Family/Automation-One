<script setup lang="ts">
/**
 * SystemHealthWidget Component
 *
 * Displays Server/MQTT/DB health status with colored indicators.
 * Polls GET /v1/health/esp every 30 seconds.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { Activity, RefreshCw } from 'lucide-vue-next'
import { getFleetHealth, type FleetHealthResponse } from '@/api/health'
import WidgetCard from './WidgetCard.vue'

const POLL_INTERVAL_MS = 30_000

const healthData = ref<FleetHealthResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

interface HealthIndicator {
  label: string
  status: 'ok' | 'warning' | 'error' | 'unknown'
}

function getIndicators(): HealthIndicator[] {
  if (!healthData.value) {
    return [
      { label: 'Server', status: 'unknown' },
      { label: 'MQTT', status: 'unknown' },
      { label: 'Devices', status: 'unknown' },
    ]
  }

  const h = healthData.value

  // Server is reachable if we got a response
  const serverStatus: HealthIndicator['status'] = h.success ? 'ok' : 'error'

  // MQTT health derived from device connectivity
  const onlineRatio = h.total_devices > 0 ? h.online_count / h.total_devices : 0
  const mqttStatus: HealthIndicator['status'] =
    h.total_devices === 0 ? 'unknown' :
    onlineRatio >= 0.8 ? 'ok' :
    onlineRatio >= 0.5 ? 'warning' : 'error'

  // Device health
  const deviceStatus: HealthIndicator['status'] =
    h.total_devices === 0 ? 'unknown' :
    h.error_count > 0 ? 'error' :
    h.offline_count > 0 ? 'warning' : 'ok'

  return [
    { label: 'Server', status: serverStatus },
    { label: 'MQTT', status: mqttStatus },
    { label: 'Devices', status: deviceStatus },
  ]
}

async function fetchHealth(): Promise<void> {
  try {
    healthData.value = await getFleetHealth()
    error.value = null
  } catch (err) {
    error.value = 'Nicht erreichbar'
  } finally {
    loading.value = false
  }
}

async function handleRetry(): Promise<void> {
  loading.value = true
  error.value = null
  await fetchHealth()
}

onMounted(() => {
  fetchHealth()
  pollTimer = setInterval(fetchHealth, POLL_INTERVAL_MS)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

const STATUS_COLORS: Record<string, string> = {
  ok: 'var(--color-status-success)',
  warning: 'var(--color-status-warning)',
  error: 'var(--color-status-error)',
  unknown: 'var(--color-text-muted)',
}
</script>

<template>
  <WidgetCard
    title="System Health"
    :icon="Activity"
    :loading="loading"
    :error="error"
  >
    <template #actions>
      <button
        class="health-widget__refresh"
        title="Aktualisieren"
        aria-label="Health-Status aktualisieren"
        @click="handleRetry"
      >
        <RefreshCw class="health-widget__refresh-icon" />
      </button>
    </template>

    <div class="health-widget__indicators" aria-live="polite">
      <div
        v-for="indicator in getIndicators()"
        :key="indicator.label"
        class="health-widget__indicator"
      >
        <span
          class="health-widget__dot"
          :style="{ backgroundColor: STATUS_COLORS[indicator.status] }"
          :title="indicator.status"
        />
        <span class="health-widget__label">{{ indicator.label }}</span>
        <span class="health-widget__status">{{ indicator.status }}</span>
      </div>
    </div>

    <div v-if="healthData" class="health-widget__stats">
      <div class="health-widget__stat">
        <span class="health-widget__stat-value">{{ healthData.online_count }}</span>
        <span class="health-widget__stat-label">Online</span>
      </div>
      <div class="health-widget__stat">
        <span class="health-widget__stat-value">{{ healthData.total_sensors }}</span>
        <span class="health-widget__stat-label">Sensoren</span>
      </div>
      <div class="health-widget__stat">
        <span class="health-widget__stat-value">{{ healthData.total_actuators }}</span>
        <span class="health-widget__stat-label">Aktoren</span>
      </div>
    </div>

    <template #footer>
      <span v-if="healthData">
        {{ healthData.total_devices }} Geräte registriert
      </span>
    </template>
  </WidgetCard>
</template>

<style scoped>
.health-widget__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.health-widget__refresh:hover {
  background: var(--color-bg-tertiary);
}

.health-widget__refresh-icon {
  width: 12px;
  height: 12px;
  color: var(--color-text-muted);
}

.health-widget__indicators {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.health-widget__indicator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.health-widget__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.health-widget__label {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
  flex: 1;
}

.health-widget__status {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.health-widget__stats {
  display: flex;
  gap: var(--space-4);
  padding-top: var(--space-2);
  border-top: 1px solid var(--glass-border);
}

.health-widget__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.health-widget__stat-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.health-widget__stat-label {
  font-size: 10px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
