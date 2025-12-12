<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useMockEspStore } from '@/stores/mockEsp'
import { Cpu, Thermometer, Power, Activity, AlertTriangle } from 'lucide-vue-next'

const mockEspStore = useMockEspStore()

onMounted(() => {
  mockEspStore.fetchAll()
})

const stats = computed(() => [
  {
    name: 'Mock ESPs',
    value: mockEspStore.espCount,
    icon: Cpu,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    name: 'Online',
    value: mockEspStore.onlineEsps.length,
    icon: Activity,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    name: 'Total Sensors',
    value: mockEspStore.mockEsps.reduce((sum, esp) => sum + esp.sensors.length, 0),
    icon: Thermometer,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  {
    name: 'Total Actuators',
    value: mockEspStore.mockEsps.reduce((sum, esp) => sum + esp.actuators.length, 0),
    icon: Power,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
])

const emergencyCount = computed(() =>
  mockEspStore.mockEsps.filter(esp =>
    esp.system_state === 'SAFE_MODE' || esp.actuators.some(a => a.emergency_stopped)
  ).length
)
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div>
      <h1 class="text-2xl font-bold text-dark-100">Dashboard</h1>
      <p class="text-dark-400 mt-1">AutomationOne Debug Overview</p>
    </div>

    <!-- Emergency Alert -->
    <div
      v-if="emergencyCount > 0"
      class="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl"
    >
      <AlertTriangle class="w-6 h-6 text-red-400" />
      <div>
        <p class="font-medium text-red-400">Emergency Stop Active</p>
        <p class="text-sm text-red-400/80">{{ emergencyCount }} device(s) in safe mode or emergency stopped</p>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="stat in stats"
        :key="stat.name"
        class="card p-5"
      >
        <div class="flex items-center gap-4">
          <div :class="[stat.bgColor, 'p-3 rounded-xl']">
            <component :is="stat.icon" :class="[stat.color, 'w-6 h-6']" />
          </div>
          <div>
            <p class="text-2xl font-bold text-dark-100">{{ stat.value }}</p>
            <p class="text-sm text-dark-400">{{ stat.name }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="card">
      <div class="card-header">
        <h3 class="font-semibold text-dark-100">Quick Actions</h3>
      </div>
      <div class="card-body">
        <div class="flex flex-wrap gap-3">
          <RouterLink to="/mock-esp" class="btn-primary">
            <Cpu class="w-4 h-4 mr-2" />
            Manage Mock ESPs
          </RouterLink>
          <RouterLink to="/mqtt-log" class="btn-secondary">
            <Activity class="w-4 h-4 mr-2" />
            View MQTT Log
          </RouterLink>
          <RouterLink to="/sensors" class="btn-secondary">
            <Thermometer class="w-4 h-4 mr-2" />
            Sensor Control
          </RouterLink>
          <RouterLink to="/actuators" class="btn-secondary">
            <Power class="w-4 h-4 mr-2" />
            Actuator Control
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Active Mock ESPs -->
    <div class="card">
      <div class="card-header flex items-center justify-between">
        <h3 class="font-semibold text-dark-100">Active Mock ESPs</h3>
        <RouterLink to="/mock-esp" class="text-sm text-blue-400 hover:text-blue-300">
          View all →
        </RouterLink>
      </div>
      <div class="card-body">
        <div v-if="mockEspStore.isLoading" class="text-center py-8 text-dark-400">
          Loading...
        </div>
        <div v-else-if="mockEspStore.mockEsps.length === 0" class="text-center py-8 text-dark-400">
          No mock ESPs created yet.
          <RouterLink to="/mock-esp" class="text-blue-400 hover:underline ml-1">
            Create one
          </RouterLink>
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="esp in mockEspStore.mockEsps.slice(0, 5)"
            :key="esp.esp_id"
            class="flex items-center justify-between p-3 bg-dark-800 rounded-lg"
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
                <p class="font-medium text-dark-100">{{ esp.esp_id }}</p>
                <p class="text-xs text-dark-400">
                  {{ esp.sensors.length }} sensors · {{ esp.actuators.length }} actuators
                </p>
              </div>
            </div>
            <span
              :class="[
                'badge',
                esp.system_state === 'OPERATIONAL' ? 'badge-success' :
                esp.system_state === 'SAFE_MODE' ? 'badge-warning' :
                esp.system_state === 'ERROR' ? 'badge-danger' : 'badge-gray'
              ]"
            >
              {{ esp.system_state }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
