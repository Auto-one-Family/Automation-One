<script setup lang="ts">
/**
 * DashboardView
 * 
 * Main dashboard with:
 * - StatCards for key metrics
 * - Device overview with ESPCards
 * - Quick actions
 * - System status
 */

import { onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { 
  Cpu, 
  Thermometer, 
  Power, 
  Activity, 
  AlertTriangle,
  Workflow,
  ArrowRight,
  Plus
} from 'lucide-vue-next'

// Components
import StatCard from '@/components/dashboard/StatCard.vue'
import Badge from '@/components/common/Badge.vue'
import { LoadingState, EmptyState, ErrorState } from '@/components/common'

// Utils
import { getStateInfo } from '@/utils/labels'
import { formatRelativeTime, formatUptimeShort } from '@/utils/formatters'

const espStore = useEspStore()

onMounted(() => {
  espStore.fetchAll()
})

// Stats computed from store
const stats = computed(() => {
  const devices = espStore.devices
  const onlineCount = espStore.onlineDevices.length
  const totalSensors = devices.reduce((sum, e) => {
    if (espStore.isMock(espStore.getDeviceId(e))) {
      return sum + ((e as any).sensors?.length ?? 0)
    }
    return sum + (e.sensor_count ?? 0)
  }, 0)
  const totalActuators = devices.reduce((sum, e) => {
    if (espStore.isMock(espStore.getDeviceId(e))) {
      return sum + ((e as any).actuators?.length ?? 0)
    }
    return sum + (e.actuator_count ?? 0)
  }, 0)
  const activeActuators = devices.reduce((sum, e) => {
    if (espStore.isMock(espStore.getDeviceId(e))) {
      return sum + (((e as any).actuators?.filter((a: any) => a.state)?.length ?? 0))
    }
    return sum // Real ESPs don't have actuator state in device object
  }, 0)
  
  return {
    devices: devices.length,
    online: onlineCount,
    sensors: totalSensors,
    actuators: totalActuators,
    activeActuators,
  }
})

// Emergency count
const emergencyCount = computed(() =>
  espStore.devices.filter(device => {
    const deviceId = espStore.getDeviceId(device)
    if (espStore.isMock(deviceId)) {
      const mockDevice = device as any
      return mockDevice.system_state === 'SAFE_MODE' || 
        mockDevice.system_state === 'ERROR' ||
        mockDevice.actuators?.some((a: any) => a.emergency_stopped)
    }
    return device.status === 'error'
  }).length
)

// Recent devices (last 5)
const recentDevices = computed(() => 
  espStore.devices.slice(0, 5)
)
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div>
      <h1 class="text-2xl font-bold" style="color: var(--color-text-primary)">Dashboard</h1>
      <p style="color: var(--color-text-muted)" class="mt-1">AutomationOne System-Übersicht</p>
    </div>

    <!-- Emergency Alert -->
    <div
      v-if="emergencyCount > 0"
      class="emergency-alert"
    >
      <AlertTriangle class="w-6 h-6 flex-shrink-0" />
      <div>
        <p class="font-medium">Achtung: Systemwarnung</p>
        <p class="text-sm opacity-80">
          {{ emergencyCount }} Gerät(e) im Sicherheitsmodus oder mit Notfall-Stopp
        </p>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="ESP-Geräte"
        :value="stats.devices"
        :subtitle="`${stats.online} online`"
        :icon="Cpu"
        icon-color="text-iridescent-1"
        icon-bg-color="bg-iridescent-1/10"
        :loading="espStore.isLoading"
      />
      <StatCard
        title="Sensoren"
        :value="stats.sensors"
        subtitle="Aktive Messungen"
        :icon="Thermometer"
        icon-color="text-mock"
        icon-bg-color="bg-mock/10"
        :loading="espStore.isLoading"
      />
      <StatCard
        title="Aktoren"
        :value="stats.actuators"
        :subtitle="`${stats.activeActuators} eingeschaltet`"
        :icon="Power"
        icon-color="text-warning"
        icon-bg-color="bg-warning/10"
        :loading="espStore.isLoading"
      />
      <StatCard
        title="Automation"
        value="0"
        subtitle="Aktive Regeln"
        :icon="Workflow"
        icon-color="text-success"
        icon-bg-color="bg-success/10"
      />
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column: Devices -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Quick Actions -->
        <div class="card">
          <div class="card-header">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">Schnellzugriff</h3>
          </div>
          <div class="card-body">
            <div class="flex flex-wrap gap-3">
              <RouterLink to="/devices" class="btn-primary">
                <Cpu class="w-4 h-4" />
                ESP-Geräte verwalten
              </RouterLink>
              <RouterLink to="/mqtt-log" class="btn-secondary">
                <Activity class="w-4 h-4" />
                MQTT-Log
              </RouterLink>
              <RouterLink to="/sensors" class="btn-secondary">
                <Thermometer class="w-4 h-4" />
                Sensoren
              </RouterLink>
              <RouterLink to="/actuators" class="btn-secondary">
                <Power class="w-4 h-4" />
                Aktoren
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Active Devices -->
        <div class="card water-reflection">
          <div class="card-header flex items-center justify-between">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">Aktive Geräte</h3>
            <RouterLink to="/devices" class="text-link">
              Alle anzeigen
              <ArrowRight class="w-4 h-4 inline ml-1" />
            </RouterLink>
          </div>
          <div class="card-body">
            <!-- Loading -->
            <LoadingState v-if="espStore.isLoading" text="Lade Geräte..." />
            
            <!-- Error -->
            <ErrorState 
              v-else-if="espStore.error" 
              :message="espStore.error"
              @retry="espStore.fetchAll"
            />
            
            <!-- Empty -->
            <EmptyState
              v-else-if="espStore.devices.length === 0"
              :icon="Plus"
              title="Keine Geräte"
              description="Erstellen Sie Ihr erstes ESP-Gerät, um mit dem Testen zu beginnen."
              action-text="ESP erstellen"
              @action="$router.push('/devices')"
            />
            
            <!-- Device List -->
            <div v-else class="space-y-3">
              <RouterLink
                v-for="device in recentDevices"
                :key="espStore.getDeviceId(device)"
                :to="`/devices/${espStore.getDeviceId(device)}`"
                class="device-row"
              >
                <div class="flex items-center gap-3">
                  <span
                    :class="[
                      'status-dot',
                      (device.status === 'online' || device.connected) && 
                        ((espStore.isMock(espStore.getDeviceId(device)) && (device as any).system_state === 'OPERATIONAL') || 
                         (!espStore.isMock(espStore.getDeviceId(device)) && device.status === 'online'))
                        ? 'status-online'
                        : (espStore.isMock(espStore.getDeviceId(device)) && (device as any).system_state === 'SAFE_MODE')
                        ? 'status-warning'
                        : (espStore.isMock(espStore.getDeviceId(device)) && (device as any).system_state === 'ERROR') || device.status === 'error'
                        ? 'status-error'
                        : 'status-offline'
                    ]"
                  />
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium font-mono" style="color: var(--color-text-primary)">
                        {{ espStore.getDeviceId(device) }}
                      </span>
                      <Badge :variant="espStore.isMock(espStore.getDeviceId(device)) ? 'mock' : 'real'" size="sm">
                        {{ espStore.isMock(espStore.getDeviceId(device)) ? 'MOCK' : 'REAL' }}
                      </Badge>
                    </div>
                    <p class="text-xs" style="color: var(--color-text-muted)">
                      {{ device.sensor_count ?? (device as any).sensors?.length ?? 0 }} Sensoren · 
                      {{ device.actuator_count ?? (device as any).actuators?.length ?? 0 }} Aktoren
                      <span v-if="device.zone_id"> · {{ device.zone_id }}</span>
                    </p>
                  </div>
                </div>
                <Badge 
                  :variant="espStore.isMock(espStore.getDeviceId(device)) 
                    ? (getStateInfo((device as any).system_state).variant as any)
                    : (device.status === 'online' ? 'success' : device.status === 'error' ? 'danger' : 'gray')"
                  :pulse="(device.status === 'online' || device.connected) && 
                    ((espStore.isMock(espStore.getDeviceId(device)) && (device as any).system_state === 'OPERATIONAL') || 
                     (!espStore.isMock(espStore.getDeviceId(device)) && device.status === 'online'))"
                  dot
                  size="sm"
                >
                  {{
                    espStore.isMock(espStore.getDeviceId(device))
                      ? getStateInfo((device as any).system_state).label
                      : device.status || 'unknown'
                  }}
                </Badge>
              </RouterLink>
            </div>
          </div>
          <div v-if="espStore.devices.length > 5" class="card-footer">
            <RouterLink to="/devices" class="text-link text-sm">
              {{ espStore.devices.length - 5 }} weitere Geräte anzeigen →
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Right Column: Status & Info -->
      <div class="space-y-6">
        <!-- System Status -->
        <div class="card">
          <div class="card-header">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">System-Status</h3>
          </div>
          <div class="card-body space-y-4">
            <div class="status-row">
              <span style="color: var(--color-text-secondary)">Backend</span>
              <Badge variant="success" dot pulse size="sm">Verbunden</Badge>
            </div>
            <div class="status-row">
              <span style="color: var(--color-text-secondary)">MQTT Broker</span>
              <Badge variant="success" dot pulse size="sm">Aktiv</Badge>
            </div>
            <div class="status-row">
              <span style="color: var(--color-text-secondary)">Datenbank</span>
              <Badge variant="success" dot size="sm">OK</Badge>
            </div>
            <div class="status-row">
              <span style="color: var(--color-text-secondary)">Geräte Online</span>
              <span style="color: var(--color-text-primary)" class="font-medium">
                {{ stats.online }} / {{ stats.devices }}
              </span>
            </div>
          </div>
        </div>

        <!-- Warnings -->
        <div v-if="emergencyCount > 0" class="card" style="border-color: rgba(251, 191, 36, 0.3)">
          <div class="card-header">
            <h3 class="font-semibold flex items-center gap-2" style="color: var(--color-warning)">
              <AlertTriangle class="w-5 h-5" />
              Warnungen
            </h3>
          </div>
          <div class="card-body">
            <div class="space-y-2">
              <div 
                v-for="device in espStore.devices.filter(d => {
                  const deviceId = espStore.getDeviceId(d)
                  if (espStore.isMock(deviceId)) {
                    const mockDevice = d as any
                    return mockDevice.system_state === 'SAFE_MODE' || 
                      mockDevice.system_state === 'ERROR' ||
                      mockDevice.actuators?.some((a: any) => a.emergency_stopped)
                  }
                  return d.status === 'error'
                })"
                :key="espStore.getDeviceId(device)"
                class="warning-item"
              >
                <RouterLink :to="`/devices/${espStore.getDeviceId(device)}`" class="warning-link">
                  <span class="font-mono text-sm">{{ espStore.getDeviceId(device) }}</span>
                  <Badge 
                    :variant="(espStore.isMock(espStore.getDeviceId(device)) && (device as any).system_state === 'ERROR') || device.status === 'error' ? 'danger' : 'warning'" 
                    size="sm"
                  >
                    {{
                      espStore.isMock(espStore.getDeviceId(device))
                        ? getStateInfo((device as any).system_state).label
                        : device.status || 'unknown'
                    }}
                  </Badge>
                </RouterLink>
              </div>
            </div>
          </div>
        </div>

        <!-- Info Card -->
        <div class="card">
          <div class="card-header">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">Info</h3>
          </div>
          <div class="card-body text-sm" style="color: var(--color-text-secondary)">
            <p>
              <strong>AutomationOne</strong> ist ein modulares Automatisierungssystem 
              für ESP32-basierte IoT-Geräte.
            </p>
            <p class="mt-2">
              Verwenden Sie Mock-ESPs, um Sensoren und Aktoren zu simulieren, 
              bevor echte Hardware verbunden wird.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Emergency alert */
.emergency-alert {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background-color: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 0.75rem;
  color: var(--color-error);
}

/* Device row */
.device-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  transition: all 0.2s;
  text-decoration: none;
}

.device-row:hover {
  background-color: var(--color-bg-hover);
}

/* Status row */
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Warning item */
.warning-item {
  padding: 0.5rem;
  background-color: rgba(251, 191, 36, 0.1);
  border-radius: 0.375rem;
}

.warning-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-decoration: none;
  color: inherit;
}

/* Text link */
.text-link {
  color: var(--color-iridescent-1);
  text-decoration: none;
  transition: color 0.2s;
}

.text-link:hover {
  color: var(--color-iridescent-2);
}
</style>
