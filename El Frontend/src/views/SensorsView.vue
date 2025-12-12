<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMockEspStore } from '@/stores/mockEsp'
import { Thermometer, Gauge } from 'lucide-vue-next'

const mockEspStore = useMockEspStore()

onMounted(() => {
  mockEspStore.fetchAll()
})

const allSensors = computed(() => {
  return mockEspStore.mockEsps.flatMap(esp =>
    esp.sensors.map(sensor => ({
      ...sensor,
      esp_id: esp.esp_id,
      esp_state: esp.system_state,
    }))
  )
})

function getQualityColor(quality: string): string {
  switch (quality) {
    case 'excellent':
    case 'good': return 'badge-success'
    case 'fair': return 'badge-info'
    case 'poor': return 'badge-warning'
    case 'bad':
    case 'stale': return 'badge-danger'
    default: return 'badge-gray'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-dark-100">Sensors</h1>
      <p class="text-dark-400 mt-1">All sensors across mock ESPs</p>
    </div>

    <div v-if="mockEspStore.isLoading" class="text-center py-12 text-dark-400">
      Loading sensors...
    </div>

    <div v-else-if="allSensors.length === 0" class="card p-12 text-center">
      <Thermometer class="w-12 h-12 text-dark-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-dark-200 mb-2">No Sensors</h3>
      <p class="text-dark-400">
        Create a mock ESP and add sensors to see them here
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="sensor in allSensors"
        :key="`${sensor.esp_id}-${sensor.gpio}`"
        class="card"
      >
        <div class="card-header flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <Gauge class="w-5 h-5 text-purple-400" />
          </div>
          <div class="flex-1">
            <p class="font-medium text-dark-100">{{ sensor.name || `GPIO ${sensor.gpio}` }}</p>
            <p class="text-xs text-dark-400">{{ sensor.esp_id }} · {{ sensor.sensor_type }}</p>
          </div>
        </div>
        <div class="card-body">
          <div class="flex items-end justify-between">
            <div>
              <p class="text-3xl font-bold font-mono text-dark-100">
                {{ sensor.raw_value.toFixed(2) }}
              </p>
              <p class="text-sm text-dark-400">{{ sensor.unit }}</p>
            </div>
            <span :class="['badge', getQualityColor(sensor.quality)]">
              {{ sensor.quality }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
