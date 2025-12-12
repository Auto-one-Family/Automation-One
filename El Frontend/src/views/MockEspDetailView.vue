<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMockEspStore } from '@/stores/mockEsp'
import type { MockSensorConfig, MockActuatorConfig, MockSystemState, QualityLevel } from '@/types'
import {
  ArrowLeft, Heart, AlertTriangle, Plus, Trash2, Power, X,
  Thermometer, Gauge, RefreshCw
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const mockEspStore = useMockEspStore()

const espId = computed(() => route.params.espId as string)
const esp = computed(() => mockEspStore.mockEsps.find(e => e.esp_id === espId.value))
const zoneLabel = computed(() => esp.value?.zone_id ? `Zone: ${esp.value.zone_id}` : 'Zone: –')

// Modals
const showAddSensorModal = ref(false)
const showAddActuatorModal = ref(false)
const showBatchSensorModal = ref(false)

// New sensor form
const newSensor = ref<MockSensorConfig>({
  gpio: 0,
  sensor_type: 'DS18B20',
  name: '',
  subzone_id: '',
  raw_value: 0,
  unit: '°C',
  quality: 'good',
  raw_mode: true,
})

// New actuator form
const newActuator = ref<MockActuatorConfig>({
  gpio: 0,
  actuator_type: 'relay',
  name: '',
  state: false,
  pwm_value: 0,
})

// Sensor value editing
const editingSensorGpio = ref<number | null>(null)
const editingSensorValue = ref(0)
const editingSensorQuality = ref<QualityLevel>('good')
const editingSensorPublish = ref(true)

const batchSensorValues = ref<Record<number, number>>({})
const batchPublish = ref(true)

onMounted(async () => {
  if (mockEspStore.mockEsps.length === 0) {
    await mockEspStore.fetchAll()
  }
})

watch(espId, async () => {
  if (!esp.value) {
    await mockEspStore.fetchAll()
  }
})

async function triggerHeartbeat() {
  await mockEspStore.triggerHeartbeat(espId.value)
}

async function toggleSafeMode() {
  if (!esp.value) return
  const newState: MockSystemState = esp.value.system_state === 'SAFE_MODE' ? 'OPERATIONAL' : 'SAFE_MODE'
  await mockEspStore.setState(espId.value, newState, 'Manual toggle')
}

async function emergencyStop() {
  if (confirm('Trigger emergency stop? This will stop all actuators.')) {
    await mockEspStore.emergencyStop(espId.value, 'Manual emergency stop from UI')
  }
}

async function clearEmergency() {
  await mockEspStore.clearEmergency(espId.value)
}

async function addSensor() {
  await mockEspStore.addSensor(espId.value, newSensor.value)
  showAddSensorModal.value = false
  newSensor.value = { gpio: 0, sensor_type: 'DS18B20', name: '', subzone_id: '', raw_value: 0, unit: '°C', quality: 'good', raw_mode: true }
}

async function addActuator() {
  await mockEspStore.addActuator(espId.value, newActuator.value)
  showAddActuatorModal.value = false
  newActuator.value = { gpio: 0, actuator_type: 'relay', name: '', state: false, pwm_value: 0 }
}

function startEditSensor(gpio: number, currentValue: number, quality: QualityLevel) {
  editingSensorGpio.value = gpio
  editingSensorValue.value = currentValue
  editingSensorQuality.value = quality
  editingSensorPublish.value = true
}

async function saveSensorValue() {
  if (editingSensorGpio.value === null) return
  await mockEspStore.setSensorValue(
    espId.value,
    editingSensorGpio.value,
    editingSensorValue.value,
    editingSensorQuality.value,
    editingSensorPublish.value
  )
  editingSensorGpio.value = null
}

function openBatchModal() {
  if (!esp.value) return
  const values: Record<number, number> = {}
  esp.value.sensors.forEach(sensor => {
    values[sensor.gpio] = sensor.raw_value
  })
  batchSensorValues.value = values
  batchPublish.value = true
  showBatchSensorModal.value = true
}

async function saveBatchSensorValues() {
  if (!esp.value) return
  await mockEspStore.setBatchSensorValues(esp.value.esp_id, batchSensorValues.value, batchPublish.value)
  showBatchSensorModal.value = false
}

async function toggleActuator(gpio: number, currentState: boolean) {
  await mockEspStore.setActuatorState(espId.value, gpio, !currentState)
}

async function removeSensor(gpio: number) {
  if (!esp.value) return
  if (!confirm(`Remove sensor on GPIO ${gpio}? This returns the pin to safe mode.`)) return
  await mockEspStore.removeSensor(esp.value.esp_id, gpio)
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}h ${m}m ${s}s`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button & Header -->
    <div class="flex items-center gap-4">
      <button class="btn-ghost" @click="router.push('/mock-esp')">
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-dark-100 font-mono">{{ espId }}</h1>
          <div class="flex flex-wrap gap-3 mt-1 text-sm">
            <span class="text-dark-400">Mock ESP32 Device Details</span>
            <span class="badge badge-gray">{{ zoneLabel }}</span>
          </div>
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary" @click="triggerHeartbeat">
          <Heart class="w-4 h-4 mr-2" />
          Heartbeat
        </button>
        <button
          class="btn-secondary"
          :class="esp?.system_state === 'SAFE_MODE' ? 'text-yellow-400' : ''"
          @click="toggleSafeMode"
        >
          <AlertTriangle class="w-4 h-4 mr-2" />
          {{ esp?.system_state === 'SAFE_MODE' ? 'Exit System Safe Mode' : 'Enter System Safe Mode' }}
        </button>
        <button class="btn-danger" @click="emergencyStop">
          Emergency Stop
        </button>
      </div>
    </div>

    <div v-if="!esp" class="text-center py-12 text-dark-400">
      Loading ESP details...
    </div>

    <template v-else>
      <!-- Status Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card p-4">
          <p class="text-sm text-dark-400">State</p>
          <p class="text-lg font-semibold" :class="{
            'text-green-400': esp.system_state === 'OPERATIONAL',
            'text-yellow-400': esp.system_state === 'SAFE_MODE',
            'text-red-400': esp.system_state === 'ERROR',
            'text-dark-300': !['OPERATIONAL', 'SAFE_MODE', 'ERROR'].includes(esp.system_state)
          }">
            {{ esp.system_state }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-dark-400">Uptime</p>
          <p class="text-lg font-semibold text-dark-100">{{ formatUptime(esp.uptime) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-dark-400">Heap Free</p>
          <p class="text-lg font-semibold text-dark-100">{{ Math.round(esp.heap_free / 1024) }} KB</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-dark-400">WiFi RSSI</p>
          <p class="text-lg font-semibold text-dark-100">{{ esp.wifi_rssi }} dBm</p>
        </div>
      </div>

      <!-- Sensors Section -->
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <h3 class="font-semibold text-dark-100 flex items-center gap-2">
            <Thermometer class="w-5 h-5 text-purple-400" />
            Sensors ({{ esp.sensors.length }})
          </h3>
          <div class="flex gap-2">
            <button class="btn-secondary btn-sm" @click="openBatchModal">
              <RefreshCw class="w-4 h-4 mr-1" />
              Batch Update
            </button>
            <button class="btn-secondary btn-sm" @click="showAddSensorModal = true">
            <Plus class="w-4 h-4 mr-1" />
            Add Sensor
            </button>
          </div>
        </div>
        <div class="card-body">
          <div v-if="esp.sensors.length === 0" class="text-center py-6 text-dark-400">
            No sensors configured
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="sensor in esp.sensors"
              :key="sensor.gpio"
              class="flex items-center justify-between p-3 bg-dark-800 rounded-lg"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Gauge class="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p class="font-medium text-dark-100">
                    {{ sensor.name || `GPIO ${sensor.gpio}` }}
                  </p>
                  <p class="text-xs text-dark-400">
                    {{ sensor.sensor_type }} · GPIO {{ sensor.gpio }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-4">
                <div v-if="editingSensorGpio === sensor.gpio" class="flex items-center gap-3 flex-wrap">
                  <input
                    v-model.number="editingSensorValue"
                    type="number"
                    step="0.1"
                    class="input w-24 text-sm"
                  />
                  <select v-model="editingSensorQuality" class="input text-sm w-32">
                    <option value="excellent">excellent</option>
                    <option value="good">good</option>
                    <option value="fair">fair</option>
                    <option value="poor">poor</option>
                    <option value="bad">bad</option>
                    <option value="stale">stale</option>
                  </select>
                  <label class="flex items-center gap-2 text-sm text-dark-200">
                    <input type="checkbox" v-model="editingSensorPublish" />
                    Publish
                  </label>
                  <button class="btn-primary btn-sm" @click="saveSensorValue">Save</button>
                  <button class="btn-ghost btn-sm" @click="editingSensorGpio = null">
                    <X class="w-4 h-4" />
                  </button>
                </div>
                <template v-else>
                  <div class="text-right">
                    <p class="text-lg font-mono text-dark-100">
                      {{ sensor.raw_value.toFixed(2) }} {{ sensor.unit }}
                    </p>
                    <div class="flex justify-end gap-2">
                      <span :class="['badge', sensor.quality === 'good' ? 'badge-success' : 'badge-warning']">
                        {{ sensor.quality }}
                      </span>
                      <span v-if="sensor.subzone_id" class="badge badge-gray">Subzone: {{ sensor.subzone_id }}</span>
                    </div>
                  </div>
                  <button
                    class="btn-ghost btn-sm"
                    @click="startEditSensor(sensor.gpio, sensor.raw_value, sensor.quality)"
                  >
                    Edit
                  </button>
                  <button
                    class="btn-ghost btn-sm text-red-400"
                    @click="removeSensor(sensor.gpio)"
                  >
                    Remove
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actuators Section -->
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <h3 class="font-semibold text-dark-100 flex items-center gap-2">
            <Power class="w-5 h-5 text-orange-400" />
            Actuators ({{ esp.actuators.length }})
          </h3>
          <div class="flex gap-2">
            <button
              v-if="esp.actuators.some(a => a.emergency_stopped)"
              class="btn-secondary btn-sm text-yellow-400"
              @click="clearEmergency"
            >
              Clear Emergency
            </button>
            <button class="btn-secondary btn-sm" @click="showAddActuatorModal = true">
              <Plus class="w-4 h-4 mr-1" />
              Add Actuator
            </button>
          </div>
        </div>
        <div class="card-body">
          <div v-if="esp.actuators.length === 0" class="text-center py-6 text-dark-400">
            No actuators configured
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="actuator in esp.actuators"
              :key="actuator.gpio"
              class="flex items-center justify-between p-3 bg-dark-800 rounded-lg"
              :class="{ 'border border-red-500/30': actuator.emergency_stopped }"
            >
              <div class="flex items-center gap-3">
                <div
                  :class="[
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    actuator.state ? 'bg-green-500/20' : 'bg-dark-700'
                  ]"
                >
                  <Power :class="['w-5 h-5', actuator.state ? 'text-green-400' : 'text-dark-400']" />
                </div>
                <div>
                  <p class="font-medium text-dark-100">
                    {{ actuator.name || `GPIO ${actuator.gpio}` }}
                  </p>
                  <p class="text-xs text-dark-400">
                    {{ actuator.actuator_type }} · GPIO {{ actuator.gpio }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-4">
                <div class="text-right">
                  <span :class="['badge', actuator.state ? 'badge-success' : 'badge-gray']">
                    {{ actuator.state ? 'ON' : 'OFF' }}
                  </span>
                  <span v-if="actuator.emergency_stopped" class="badge badge-danger ml-2">
                    E-STOP
                  </span>
                </div>
                <button
                  class="btn-secondary btn-sm"
                  :disabled="actuator.emergency_stopped"
                  @click="toggleActuator(actuator.gpio, actuator.state)"
                >
                  {{ actuator.state ? 'Turn OFF' : 'Turn ON' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Add Sensor Modal -->
    <div v-if="showAddSensorModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div class="card w-full max-w-md">
        <div class="card-header flex items-center justify-between">
          <h3 class="font-semibold text-dark-100">Add Sensor</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showAddSensorModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="card-body space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">GPIO</label>
              <input v-model.number="newSensor.gpio" type="number" min="0" max="39" class="input" />
            </div>
            <div>
              <label class="label">Type</label>
              <select v-model="newSensor.sensor_type" class="input">
                <option value="DS18B20">DS18B20 (Temp)</option>
                <option value="SHT31">SHT31 (Temp+Humidity)</option>
                <option value="pH">pH Sensor</option>
                <option value="EC">EC Sensor</option>
                <option value="analog">Analog</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Name (optional)</label>
            <input v-model="newSensor.name" class="input" placeholder="e.g., Water Temperature" />
          </div>
          <div>
            <label class="label">Subzone (optional)</label>
            <input v-model="newSensor.subzone_id" class="input" placeholder="e.g., greenhouse_row_1" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Initial Value</label>
              <input v-model.number="newSensor.raw_value" type="number" step="0.1" class="input" />
            </div>
            <div>
              <label class="label">Unit</label>
              <input v-model="newSensor.unit" class="input" placeholder="°C" />
            </div>
          </div>
          <div class="flex gap-3 pt-4">
            <button class="btn-secondary flex-1" @click="showAddSensorModal = false">Cancel</button>
            <button class="btn-primary flex-1" @click="addSensor">Add Sensor</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Batch Sensor Update Modal -->
    <div v-if="showBatchSensorModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div class="card w-full max-w-2xl">
        <div class="card-header flex items-center justify-between">
          <h3 class="font-semibold text-dark-100">Batch Update Sensors</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showBatchSensorModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="card-body space-y-4">
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-sm text-dark-200">
              <input type="checkbox" v-model="batchPublish" />
              Publish after update
            </label>
          </div>
          <div class="space-y-3 max-h-96 overflow-y-auto">
            <div
              v-for="sensor in esp?.sensors || []"
              :key="sensor.gpio"
              class="flex items-center justify-between gap-3 p-3 bg-dark-800 rounded-lg"
            >
              <div>
                <p class="font-medium text-dark-100">{{ sensor.name || `GPIO ${sensor.gpio}` }}</p>
                <p class="text-xs text-dark-400">{{ sensor.sensor_type }} · GPIO {{ sensor.gpio }}</p>
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="batchSensorValues[sensor.gpio]"
                  type="number"
                  step="0.1"
                  class="input w-28 text-sm"
                />
                <span class="text-sm text-dark-300">{{ sensor.unit }}</span>
              </div>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button class="btn-secondary flex-1" @click="showBatchSensorModal = false">Cancel</button>
            <button class="btn-primary flex-1" @click="saveBatchSensorValues">Save Batch</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Actuator Modal -->
    <div v-if="showAddActuatorModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div class="card w-full max-w-md">
        <div class="card-header flex items-center justify-between">
          <h3 class="font-semibold text-dark-100">Add Actuator</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showAddActuatorModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="card-body space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">GPIO</label>
              <input v-model.number="newActuator.gpio" type="number" min="0" max="39" class="input" />
            </div>
            <div>
              <label class="label">Type</label>
              <select v-model="newActuator.actuator_type" class="input">
                <option value="relay">Relay</option>
                <option value="pump">Pump</option>
                <option value="valve">Valve</option>
                <option value="fan">Fan (PWM)</option>
                <option value="pwm">PWM Generic</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Name (optional)</label>
            <input v-model="newActuator.name" class="input" placeholder="e.g., Main Pump" />
          </div>
          <div class="flex gap-3 pt-4">
            <button class="btn-secondary flex-1" @click="showAddActuatorModal = false">Cancel</button>
            <button class="btn-primary flex-1" @click="addActuator">Add Actuator</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
