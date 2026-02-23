<script setup lang="ts">
/**
 * ESPHealthWidget
 *
 * Overview of all ESP devices with connection status.
 * Shows online/offline counts, RSSI indicators, and uptime.
 * Min grid size: 4x3
 */

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import WidgetWrapper from './WidgetWrapper.vue'
import { Server, Wifi, WifiOff } from 'lucide-vue-next'

interface Props {
  widgetId: string
  config?: {
    zoneFilter?: string | null
    showOfflineOnly?: boolean
  }
}

const props = withDefaults(defineProps<Props>(), {
  config: () => ({}),
})

const emit = defineEmits<{
  remove: []
  'update-config': [config: Record<string, unknown>]
}>()

const router = useRouter()
const espStore = useEspStore()

const zoneFilter = ref<string | null>(props.config.zoneFilter ?? null)
const showOfflineOnly = ref(props.config.showOfflineOnly ?? false)

const filteredDevices = computed(() => {
  let devices = espStore.devices

  if (zoneFilter.value) {
    devices = devices.filter(d => d.zone_id === zoneFilter.value)
  }

  if (showOfflineOnly.value) {
    devices = devices.filter(d => !(d.status === 'online' || d.connected === true))
  }

  // Sort: offline first, then by name
  return [...devices].sort((a, b) => {
    const aOnline = a.status === 'online' || a.connected === true
    const bOnline = b.status === 'online' || b.connected === true
    if (aOnline !== bOnline) return aOnline ? 1 : -1
    const aName = a.name || espStore.getDeviceId(a)
    const bName = b.name || espStore.getDeviceId(b)
    return aName.localeCompare(bName)
  })
})

const onlineCount = computed(() =>
  filteredDevices.value.filter(d => d.status === 'online' || d.connected === true).length
)

const offlineCount = computed(() =>
  filteredDevices.value.filter(d => !(d.status === 'online' || d.connected === true)).length
)

const warningCount = computed(() =>
  filteredDevices.value.filter(d => d.status === 'error' || (d as any).system_state === 'ERROR').length
)

const zones = computed(() => {
  const zoneSet = new Map<string, string>()
  for (const d of espStore.devices) {
    if (d.zone_id) {
      zoneSet.set(d.zone_id, d.zone_name || d.zone_id)
    }
  }
  return Array.from(zoneSet.entries()).map(([id, name]) => ({ id, name }))
})

function getRssiLevel(device: any): number {
  const rssi = device.rssi ?? device.wifi_rssi ?? -100
  if (rssi > -50) return 5
  if (rssi > -60) return 4
  if (rssi > -70) return 3
  if (rssi > -80) return 2
  return 1
}

function getUptime(device: any): string {
  const uptime = device.uptime_seconds ?? device.uptime
  if (!uptime) return '--'
  const hours = Math.floor(uptime / 3600)
  const mins = Math.floor((uptime % 3600) / 60)
  if (hours > 24) return `${Math.floor(hours / 24)}d`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function isOnline(device: any): boolean {
  return device.status === 'online' || device.connected === true
}

function navigateToDevice(device: any) {
  const deviceId = espStore.getDeviceId(device)
  router.push({ path: '/', query: { openSettings: deviceId } })
}
</script>

<template>
  <WidgetWrapper
    title="ESP-Übersicht"
    :icon="Server"
    @remove="$emit('remove')"
  >
    <div class="esp-health-content">
      <!-- Summary Bar -->
      <div class="health-summary">
        <span class="summary-item summary-item--online">{{ onlineCount }} Online</span>
        <span class="summary-divider">/</span>
        <span class="summary-item summary-item--offline">{{ offlineCount }} Offline</span>
        <span v-if="warningCount > 0" class="summary-divider">/</span>
        <span v-if="warningCount > 0" class="summary-item summary-item--warning">{{ warningCount }} Warnung</span>
      </div>

      <!-- Device List -->
      <div v-if="filteredDevices.length === 0" class="widget-empty">
        Keine ESPs{{ zoneFilter ? ' in dieser Zone' : '' }} registriert
      </div>
      <div v-else class="device-list">
        <div
          v-for="device in filteredDevices"
          :key="espStore.getDeviceId(device)"
          class="device-row"
          @click="navigateToDevice(device)"
        >
          <span class="device-dot" :class="{ 'device-dot--online': isOnline(device) }" />
          <span class="device-name">{{ device.name || espStore.getDeviceId(device) }}</span>
          <span class="device-rssi">
            <Wifi v-if="isOnline(device)" class="rssi-icon" />
            <WifiOff v-else class="rssi-icon rssi-icon--off" />
            <span v-if="isOnline(device)" class="rssi-bars">
              <span
                v-for="i in 5"
                :key="i"
                class="rssi-bar"
                :class="{ 'rssi-bar--active': i <= getRssiLevel(device) }"
              />
            </span>
          </span>
          <span class="device-uptime">{{ getUptime(device) }}</span>
        </div>
      </div>
    </div>

    <template #config="{ close }">
      <div class="widget-config-inner">
        <label class="config-label">Zone</label>
        <select
          class="config-select"
          :value="zoneFilter || ''"
          @change="(e) => {
            const val = (e.target as HTMLSelectElement).value || null
            zoneFilter = val
            emit('update-config', { zoneFilter: val, showOfflineOnly: showOfflineOnly })
          }"
        >
          <option value="">Alle Zonen</option>
          <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.name }}</option>
        </select>

        <label class="config-label">
          <input
            type="checkbox"
            :checked="showOfflineOnly"
            @change="(e) => {
              showOfflineOnly = (e.target as HTMLInputElement).checked
              emit('update-config', { zoneFilter, showOfflineOnly })
            }"
          />
          Nur Offline-Geräte zeigen
        </label>
        <button class="config-close-btn" @click="close()">Schließen</button>
      </div>
    </template>
  </WidgetWrapper>
</template>

<style scoped>
.esp-health-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--space-2);
}

.health-summary {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.summary-item--online { color: var(--color-success); }
.summary-item--offline { color: var(--color-error); }
.summary-item--warning { color: var(--color-warning); }
.summary-divider { color: var(--color-text-muted); }

.device-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.device-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.device-row:hover {
  background: var(--color-bg-quaternary);
}

.device-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-text-muted);
  flex-shrink: 0;
}

.device-dot--online {
  background: var(--color-success);
}

.device-name {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.device-rssi {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.rssi-icon {
  width: 12px;
  height: 12px;
  color: var(--color-text-muted);
}

.rssi-icon--off {
  color: var(--color-error);
  opacity: 0.6;
}

.rssi-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 10px;
}

.rssi-bar {
  width: 2px;
  background: var(--color-text-muted);
  opacity: 0.2;
  border-radius: 1px;
}

.rssi-bar:nth-child(1) { height: 2px; }
.rssi-bar:nth-child(2) { height: 4px; }
.rssi-bar:nth-child(3) { height: 6px; }
.rssi-bar:nth-child(4) { height: 8px; }
.rssi-bar:nth-child(5) { height: 10px; }

.rssi-bar--active {
  background: var(--color-success);
  opacity: 1;
}

.device-uptime {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  min-width: 28px;
  text-align: right;
  flex-shrink: 0;
}

.widget-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.widget-config-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.config-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.config-select {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-xs);
  font-family: inherit;
}

.config-close-btn {
  align-self: flex-end;
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.config-close-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}
</style>
