<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMockEspStore } from '@/stores/mockEsp'
import { Power, AlertTriangle } from 'lucide-vue-next'

const mockEspStore = useMockEspStore()

onMounted(() => {
  mockEspStore.fetchAll()
})

const allActuators = computed(() => {
  return mockEspStore.mockEsps.flatMap(esp =>
    esp.actuators.map(actuator => ({
      ...actuator,
      esp_id: esp.esp_id,
      esp_state: esp.system_state,
    }))
  )
})

async function toggleActuator(espId: string, gpio: number, currentState: boolean) {
  await mockEspStore.setActuatorState(espId, gpio, !currentState)
}

async function emergencyStopAll() {
  if (confirm('Trigger emergency stop on ALL mock ESPs?')) {
    for (const esp of mockEspStore.mockEsps) {
      await mockEspStore.emergencyStop(esp.esp_id, 'Global emergency stop from UI')
    }
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-dark-100">Actuators</h1>
        <p class="text-dark-400 mt-1">All actuators across mock ESPs</p>
      </div>
      <button class="btn-danger" @click="emergencyStopAll">
        <AlertTriangle class="w-4 h-4 mr-2" />
        Emergency Stop All
      </button>
    </div>

    <div v-if="mockEspStore.isLoading" class="text-center py-12 text-dark-400">
      Loading actuators...
    </div>

    <div v-else-if="allActuators.length === 0" class="card p-12 text-center">
      <Power class="w-12 h-12 text-dark-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-dark-200 mb-2">No Actuators</h3>
      <p class="text-dark-400">
        Create a mock ESP and add actuators to see them here
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="actuator in allActuators"
        :key="`${actuator.esp_id}-${actuator.gpio}`"
        class="card"
        :class="{ 'border-red-500/30': actuator.emergency_stopped }"
      >
        <div class="card-header flex items-center gap-3">
          <div
            :class="[
              'w-10 h-10 rounded-lg flex items-center justify-center',
              actuator.state ? 'bg-green-500/20' : 'bg-dark-700'
            ]"
          >
            <Power :class="['w-5 h-5', actuator.state ? 'text-green-400' : 'text-dark-400']" />
          </div>
          <div class="flex-1">
            <p class="font-medium text-dark-100">{{ actuator.name || `GPIO ${actuator.gpio}` }}</p>
            <p class="text-xs text-dark-400">{{ actuator.esp_id }} · {{ actuator.actuator_type }}</p>
          </div>
        </div>
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span :class="['badge', actuator.state ? 'badge-success' : 'badge-gray']">
                {{ actuator.state ? 'ON' : 'OFF' }}
              </span>
              <span v-if="actuator.emergency_stopped" class="badge badge-danger">
                E-STOP
              </span>
            </div>
            <button
              class="btn-secondary btn-sm"
              :disabled="actuator.emergency_stopped"
              @click="toggleActuator(actuator.esp_id, actuator.gpio, actuator.state)"
            >
              {{ actuator.state ? 'Turn OFF' : 'Turn ON' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
