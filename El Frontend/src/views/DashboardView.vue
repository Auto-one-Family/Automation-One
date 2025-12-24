<script setup lang="ts">
/**
 * DashboardView
 *
 * Main dashboard with:
 * - StatCards for key metrics
 * - Zone-grouped ESP overview with drag & drop
 * - ESPOrbitalLayout for visual device display (within zones)
 */

import { ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useZoneDragDrop } from '@/composables'
import {
  Cpu,
  Thermometer,
  Power,
  AlertTriangle,
  Workflow,
  Plus,
  Filter,
  Layers
} from 'lucide-vue-next'

// Components
import StatCard from '@/components/dashboard/StatCard.vue'
import ESPOrbitalLayout from '@/components/esp/ESPOrbitalLayout.vue'
import ZoneGroup from '@/components/zones/ZoneGroup.vue'
import { LoadingState, EmptyState } from '@/components/common'

const espStore = useEspStore()
const { groupDevicesByZone, handleDeviceDrop } = useZoneDragDrop()

// Filter state
const filterType = ref<'all' | 'mock' | 'real'>('all')
const filterStatus = ref<'all' | 'online' | 'offline'>('all')

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

// Filtered ESPs
const filteredEsps = computed(() => {
  let esps = espStore.devices

  // Filter by type
  if (filterType.value === 'mock') {
    esps = esps.filter(e => espStore.isMock(espStore.getDeviceId(e)))
  } else if (filterType.value === 'real') {
    esps = esps.filter(e => !espStore.isMock(espStore.getDeviceId(e)))
  }

  // Filter by status
  if (filterStatus.value === 'online') {
    esps = esps.filter(e => e.status === 'online' || e.connected === true)
  } else if (filterStatus.value === 'offline') {
    esps = esps.filter(e => e.status === 'offline' || e.connected === false)
  }

  return esps
})

// Counts for filter badges
const counts = computed(() => ({
  all: espStore.devices.length,
  mock: espStore.mockDevices.length,
  real: espStore.realDevices.length,
  online: espStore.onlineDevices.length,
  offline: espStore.offlineDevices.length,
}))

// Group filtered ESPs by zone
const zoneGroups = computed(() => {
  return groupDevicesByZone(filteredEsps.value)
})

// Handle zone drop event
async function onDeviceDropped(payload: {
  device: any
  fromZoneId: string | null
  toZoneId: string
}) {
  await handleDeviceDrop(payload)
  // Refresh devices after zone change
  await espStore.fetchAll()
}
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

    <!-- Filters -->
    <div class="flex flex-wrap gap-4">
      <!-- Type Filter -->
      <div class="filter-group">
        <span class="filter-label">Typ:</span>
        <div class="filter-buttons">
          <button
            :class="['filter-btn', filterType === 'all' ? 'filter-btn--active' : '']"
            @click="filterType = 'all'"
          >
            Alle ({{ counts.all }})
          </button>
          <button
            :class="['filter-btn', filterType === 'mock' ? 'filter-btn--active filter-btn--mock' : '']"
            @click="filterType = 'mock'"
          >
            Mock ({{ counts.mock }})
          </button>
          <button
            :class="['filter-btn', filterType === 'real' ? 'filter-btn--active filter-btn--real' : '']"
            @click="filterType = 'real'"
          >
            Real ({{ counts.real }})
          </button>
        </div>
      </div>

      <!-- Status Filter -->
      <div class="filter-group">
        <span class="filter-label">Status:</span>
        <div class="filter-buttons">
          <button
            :class="['filter-btn', filterStatus === 'all' ? 'filter-btn--active' : '']"
            @click="filterStatus = 'all'"
          >
            Alle
          </button>
          <button
            :class="['filter-btn', filterStatus === 'online' ? 'filter-btn--active filter-btn--success' : '']"
            @click="filterStatus = 'online'"
          >
            Online ({{ counts.online }})
          </button>
          <button
            :class="['filter-btn', filterStatus === 'offline' ? 'filter-btn--active' : '']"
            @click="filterStatus = 'offline'"
          >
            Offline ({{ counts.offline }})
          </button>
        </div>
      </div>

      <!-- Link to Devices for management -->
      <div class="ml-auto">
        <RouterLink to="/devices" class="btn-secondary">
          <Cpu class="w-4 h-4" />
          Geräte verwalten
        </RouterLink>
      </div>
    </div>

    <!-- Loading -->
    <LoadingState v-if="espStore.isLoading && espStore.devices.length === 0" text="Lade ESP-Geräte..." />

    <!-- Empty State -->
    <EmptyState
      v-else-if="espStore.devices.length === 0"
      :icon="Plus"
      title="Keine ESP-Geräte"
      description="Erstellen Sie Ihr erstes Mock-ESP32-Gerät, um mit dem Testen zu beginnen."
      action-text="Gerät erstellen"
      @action="$router.push('/devices')"
    />

    <!-- No Results (with filters) -->
    <div
      v-else-if="filteredEsps.length === 0"
      class="card p-8 text-center"
    >
      <Filter class="w-12 h-12 mx-auto mb-4" style="color: var(--color-text-muted)" />
      <h3 class="font-semibold mb-2" style="color: var(--color-text-secondary)">
        Keine Ergebnisse
      </h3>
      <p style="color: var(--color-text-muted)" class="mb-4">
        Keine Geräte entsprechen den aktuellen Filtern.
      </p>
      <button class="btn-secondary" @click="filterType = 'all'; filterStatus = 'all'">
        Filter zurücksetzen
      </button>
    </div>

    <!-- Zone-Grouped ESP Grid -->
    <div v-else class="zone-groups-container">
      <ZoneGroup
        v-for="group in zoneGroups"
        :key="group.zoneId"
        :zone-id="group.zoneId"
        :zone-name="group.zoneName"
        :devices="group.devices"
        :is-unassigned="group.zoneId === '__unassigned__'"
        :compact-mode="true"
        :enable-drag-drop="true"
        :default-expanded="true"
        @device-dropped="onDeviceDropped"
      >
        <!-- Use ESPOrbitalLayout for Dashboard (compact view with sensors/actuators) -->
        <template #device="{ device }">
          <div class="esp-orbital-grid__item">
            <ESPOrbitalLayout
              :device="device"
              :show-connections="false"
              :compact-mode="true"
            />
          </div>
        </template>
      </ZoneGroup>

      <!-- Hint for drag & drop -->
      <div v-if="zoneGroups.length > 1" class="drag-hint">
        <Layers class="w-4 h-4" />
        <span>Tipp: Geräte zwischen Zonen verschieben per Drag & Drop</span>
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

/* ESP Orbital Grid */
.esp-orbital-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
  gap: 2rem;
}

@media (max-width: 768px) {
  .esp-orbital-grid {
    grid-template-columns: 1fr;
  }
}

.esp-orbital-grid__item {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  overflow: hidden;
  transition: all 0.2s;
}

.esp-orbital-grid__item:hover {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Filter group */
.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.filter-buttons {
  display: flex;
  gap: 0.25rem;
  background-color: var(--color-bg-tertiary);
  padding: 0.25rem;
  border-radius: 0.5rem;
}

.filter-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  transition: all 0.2s;
  background: transparent;
  border: none;
  cursor: pointer;
}

.filter-btn:hover {
  color: var(--color-text-primary);
}

.filter-btn--active {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.filter-btn--mock.filter-btn--active {
  color: var(--color-mock);
}

.filter-btn--real.filter-btn--active {
  color: var(--color-real);
}

.filter-btn--success.filter-btn--active {
  color: var(--color-success);
}

/* Zone groups container */
.zone-groups-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Drag hint */
.drag-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-tertiary);
  border: 1px dashed var(--glass-border);
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
</style>
