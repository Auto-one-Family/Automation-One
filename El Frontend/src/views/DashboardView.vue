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
import { useMockEspStore } from '@/stores/mockEsp'
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

const mockEspStore = useMockEspStore()

onMounted(() => {
  mockEspStore.fetchAll()
})

// Stats computed from store
const stats = computed(() => {
  const esps = mockEspStore.mockEsps
  const onlineCount = esps.filter(e => e.connected).length
  const totalSensors = esps.reduce((sum, e) => sum + (e.sensors?.length ?? 0), 0)
  const totalActuators = esps.reduce((sum, e) => sum + (e.actuators?.length ?? 0), 0)
  const activeActuators = esps.reduce((sum, e) => 
    sum + (e.actuators?.filter(a => a.state)?.length ?? 0), 0
  )
  
  return {
    devices: esps.length,
    online: onlineCount,
    sensors: totalSensors,
    actuators: totalActuators,
    activeActuators,
  }
})

// Emergency count
const emergencyCount = computed(() =>
  mockEspStore.mockEsps.filter(esp =>
    esp.system_state === 'SAFE_MODE' || 
    esp.system_state === 'ERROR' ||
    esp.actuators?.some(a => a.emergency_stopped)
  ).length
)

// Recent devices (last 5)
const recentDevices = computed(() => 
  mockEspStore.mockEsps.slice(0, 5)
)

// Check if device is mock
const isMock = (esp: any) => 
  esp.hardware_type?.startsWith('MOCK_') || 
  esp.esp_id?.startsWith('ESP_MOCK_')
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
        :loading="mockEspStore.isLoading"
      />
      <StatCard
        title="Sensoren"
        :value="stats.sensors"
        subtitle="Aktive Messungen"
        :icon="Thermometer"
        icon-color="text-mock"
        icon-bg-color="bg-mock/10"
        :loading="mockEspStore.isLoading"
      />
      <StatCard
        title="Aktoren"
        :value="stats.actuators"
        :subtitle="`${stats.activeActuators} eingeschaltet`"
        :icon="Power"
        icon-color="text-warning"
        icon-bg-color="bg-warning/10"
        :loading="mockEspStore.isLoading"
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
              <RouterLink to="/mock-esp" class="btn-primary">
                <Cpu class="w-4 h-4" />
                Mock ESPs verwalten
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
            <RouterLink to="/mock-esp" class="text-link">
              Alle anzeigen
              <ArrowRight class="w-4 h-4 inline ml-1" />
            </RouterLink>
          </div>
          <div class="card-body">
            <!-- Loading -->
            <LoadingState v-if="mockEspStore.isLoading" text="Lade Geräte..." />
            
            <!-- Error -->
            <ErrorState 
              v-else-if="mockEspStore.error" 
              :message="mockEspStore.error"
              @retry="mockEspStore.fetchAll"
            />
            
            <!-- Empty -->
            <EmptyState
              v-else-if="mockEspStore.mockEsps.length === 0"
              :icon="Plus"
              title="Keine Geräte"
              description="Erstellen Sie Ihr erstes Mock-ESP-Gerät, um mit dem Testen zu beginnen."
              action-text="Mock ESP erstellen"
              @action="$router.push('/mock-esp')"
            />
            
            <!-- Device List -->
            <div v-else class="space-y-3">
              <RouterLink
                v-for="esp in recentDevices"
                :key="esp.esp_id"
                :to="`/mock-esp/${esp.esp_id}`"
                class="device-row"
              >
                <div class="flex items-center gap-3">
                  <span
                    :class="[
                      'status-dot',
                      esp.connected && esp.system_state === 'OPERATIONAL'
                        ? 'status-online'
                        : esp.system_state === 'SAFE_MODE'
                        ? 'status-warning'
                        : esp.system_state === 'ERROR'
                        ? 'status-error'
                        : 'status-offline'
                    ]"
                  />
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium font-mono" style="color: var(--color-text-primary)">
                        {{ esp.esp_id }}
                      </span>
                      <Badge :variant="isMock(esp) ? 'mock' : 'real'" size="sm">
                        {{ isMock(esp) ? 'MOCK' : 'REAL' }}
                      </Badge>
                    </div>
                    <p class="text-xs" style="color: var(--color-text-muted)">
                      {{ esp.sensors?.length ?? 0 }} Sensoren · {{ esp.actuators?.length ?? 0 }} Aktoren
                      <span v-if="esp.zone_id"> · {{ esp.zone_id }}</span>
                    </p>
                  </div>
                </div>
                <Badge 
                  :variant="getStateInfo(esp.system_state).variant as any"
                  :pulse="esp.connected && esp.system_state === 'OPERATIONAL'"
                  dot
                  size="sm"
                >
                  {{ getStateInfo(esp.system_state).label }}
                </Badge>
              </RouterLink>
            </div>
          </div>
          <div v-if="mockEspStore.mockEsps.length > 5" class="card-footer">
            <RouterLink to="/mock-esp" class="text-link text-sm">
              {{ mockEspStore.mockEsps.length - 5 }} weitere Geräte anzeigen →
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
                v-for="esp in mockEspStore.mockEsps.filter(e => 
                  e.system_state === 'SAFE_MODE' || 
                  e.system_state === 'ERROR' ||
                  e.actuators?.some(a => a.emergency_stopped)
                )"
                :key="esp.esp_id"
                class="warning-item"
              >
                <RouterLink :to="`/mock-esp/${esp.esp_id}`" class="warning-link">
                  <span class="font-mono text-sm">{{ esp.esp_id }}</span>
                  <Badge 
                    :variant="esp.system_state === 'ERROR' ? 'danger' : 'warning'" 
                    size="sm"
                  >
                    {{ getStateInfo(esp.system_state).label }}
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
