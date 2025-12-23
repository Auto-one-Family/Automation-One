<script setup lang="ts">
/**
 * MockEspDetailView
 * 
 * Detail view for a single Mock ESP device.
 * Shows sensors, actuators, and allows editing values.
 * Uses SENSOR_TYPE_CONFIG for correct units and defaults.
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMockEspStore } from '@/stores/mockEsp'
import type { MockSensorConfig, MockActuatorConfig, MockSystemState, QualityLevel } from '@/types'
import {
  ArrowLeft, Heart, AlertTriangle, Plus, Trash2, Power, X,
  Thermometer, Gauge, RefreshCw
} from 'lucide-vue-next'

// Import utilities
import { 
  SENSOR_TYPE_CONFIG, 
  getSensorUnit, 
  getSensorDefault,
  getSensorLabel,
  getSensorTypeOptions
} from '@/utils/sensorDefaults'
import { 
  getStateInfo, 
  getQualityLabel, 
  QUALITY_LABELS,
  getActuatorTypeLabel 
} from '@/utils/labels'
import {
  formatUptime,
  formatHeapSize,
  formatNumber
} from '@/utils/formatters'

// Components
import Badge from '@/components/common/Badge.vue'
import { LoadingState, EmptyState } from '@/components/common'
import ZoneAssignmentPanel from '@/components/zones/ZoneAssignmentPanel.vue'

const route = useRoute()
const router = useRouter()
const mockEspStore = useMockEspStore()

const espId = computed(() => route.params.espId as string)
const esp = computed(() => mockEspStore.mockEsps.find(e => e.esp_id === espId.value))
const isMock = computed(() => 
  esp.value?.hardware_type?.startsWith('MOCK_') || 
  esp.value?.esp_id?.startsWith('ESP_MOCK_')
)

// Modals
const showAddSensorModal = ref(false)
const showAddActuatorModal = ref(false)
const showBatchSensorModal = ref(false)

// Get all sensor types for dropdown
const sensorTypeOptions = getSensorTypeOptions()

// New sensor form - uses SENSOR_TYPE_CONFIG for defaults
const defaultSensorType = 'DS18B20'
const newSensor = ref<MockSensorConfig>({
  gpio: 0,
  sensor_type: defaultSensorType,
  name: '',
  subzone_id: '',
  raw_value: getSensorDefault(defaultSensorType),
  unit: getSensorUnit(defaultSensorType),
  quality: 'good',
  raw_mode: true,
})

// Watch for sensor type changes and update unit/initial value from SENSOR_TYPE_CONFIG
watch(() => newSensor.value.sensor_type, (newType) => {
  const config = SENSOR_TYPE_CONFIG[newType]
  if (config) {
    newSensor.value.unit = config.unit
    newSensor.value.raw_value = config.defaultValue
  }
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

// Quality options for select
const qualityOptions = Object.entries(QUALITY_LABELS).map(([value, label]) => ({
  value,
  label
}))

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

// Actions
async function triggerHeartbeat() {
  await mockEspStore.triggerHeartbeat(espId.value)
}

async function toggleSafeMode() {
  if (!esp.value) return
  const newState: MockSystemState = esp.value.system_state === 'SAFE_MODE' ? 'OPERATIONAL' : 'SAFE_MODE'
  await mockEspStore.setState(espId.value, newState, 'Manueller Wechsel')
}

async function emergencyStop() {
  if (confirm('Notfall-Stopp auslösen? Alle Aktoren werden gestoppt.')) {
    await mockEspStore.emergencyStop(espId.value, 'Manueller Notfall-Stopp')
  }
}

async function clearEmergency() {
  await mockEspStore.clearEmergency(espId.value)
}

async function deleteEsp() {
  if (!esp.value) return
  const name = esp.value.zone_name || esp.value.zone_id || esp.value.esp_id
  if (confirm(`Mock ESP "${name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
    try {
      await mockEspStore.remove(espId.value)
      router.push('/mock-esp')
    } catch {
      // Error is handled by store
    }
  }
}

async function addSensor() {
  await mockEspStore.addSensor(espId.value, newSensor.value)
  showAddSensorModal.value = false
  // Reset with correct defaults
  newSensor.value = { 
    gpio: 0, 
    sensor_type: defaultSensorType, 
    name: '', 
    subzone_id: '', 
    raw_value: getSensorDefault(defaultSensorType), 
    unit: getSensorUnit(defaultSensorType), 
    quality: 'good', 
    raw_mode: true 
  }
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
  if (!confirm(`Sensor an GPIO ${gpio} entfernen?`)) return
  await mockEspStore.removeSensor(esp.value.esp_id, gpio)
}

// Helper to get state info
const stateInfo = computed(() => esp.value ? getStateInfo(esp.value.system_state) : null)

// Handle zone updates from ZoneAssignmentPanel (after successful ESP ACK)
function handleZoneUpdate(zoneData: { zone_id: string; zone_name?: string; master_zone_id?: string }) {
  console.log('[MockEspDetailView] Zone updated:', zoneData)

  // Update the local ESP data after successful ACK from ESP
  // MockESP uses null for empty values, not undefined
  if (esp.value) {
    esp.value.zone_id = zoneData.zone_id || null
    esp.value.master_zone_id = zoneData.master_zone_id || null
    // Note: MockESP doesn't have zone_name - it's stored on server but not in MockESP
  }
}

// Handle zone errors from ZoneAssignmentPanel
function handleZoneError(error: string) {
  console.error('[MockEspDetailView] Zone error:', error)
  // Error is already displayed in ZoneAssignmentPanel
  // Could add toast notification here if desired
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button & Header -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <button class="btn-ghost self-start" @click="router.push('/mock-esp')">
        <ArrowLeft class="w-5 h-5" />
        <span class="ml-2">Zurück</span>
      </button>
      
      <div class="flex-1">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class="text-2xl font-bold font-mono" style="color: var(--color-text-primary)">
            {{ espId }}
          </h1>
          <Badge v-if="isMock" variant="mock" size="sm">MOCK</Badge>
          <Badge v-else variant="real" size="sm">REAL</Badge>
          <Badge 
            v-if="stateInfo" 
            :variant="stateInfo.variant as any" 
            :pulse="esp?.system_state === 'OPERATIONAL'"
            dot
            size="sm"
          >
            {{ stateInfo.label }}
          </Badge>
        </div>
        <div class="flex flex-wrap gap-2 mt-1 text-sm" style="color: var(--color-text-muted)">
          <span>ESP32 Geräte-Details</span>
          <span v-if="esp?.zone_id">• Zone: {{ esp.zone_id }}</span>
        </div>
      </div>
      
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary btn-sm" @click="triggerHeartbeat">
          <Heart class="w-4 h-4" />
          <span class="hidden sm:inline ml-1">Heartbeat</span>
        </button>
        <button
          class="btn-secondary btn-sm"
          :class="{ 'text-warning': esp?.system_state === 'SAFE_MODE' }"
          @click="toggleSafeMode"
        >
          <AlertTriangle class="w-4 h-4" />
          <span class="hidden sm:inline ml-1">
            {{ esp?.system_state === 'SAFE_MODE' ? 'Safe-Mode beenden' : 'Safe-Mode' }}
          </span>
        </button>
        <button class="btn-danger btn-sm" @click="emergencyStop">
          <span class="hidden sm:inline">Notfall-Stopp</span>
          <span class="sm:hidden">E-Stop</span>
        </button>
        <button class="btn-ghost btn-sm text-error hover:bg-danger/10" @click="deleteEsp" title="Gerät löschen">
          <Trash2 class="w-4 h-4" />
          <span class="hidden sm:inline ml-1">Löschen</span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <LoadingState v-if="mockEspStore.isLoading" text="Lade ESP-Details..." />

    <!-- Not Found -->
    <div v-else-if="!esp" class="card p-8 text-center">
      <p style="color: var(--color-text-muted)">ESP nicht gefunden</p>
    </div>

    <template v-else>
      <!-- Status Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-4">
          <p class="text-sm" style="color: var(--color-text-muted)">Status</p>
          <p class="text-lg font-semibold" :style="{ color: `var(--color-${stateInfo?.variant || 'text-primary'})` }">
            {{ stateInfo?.label || esp.system_state }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm" style="color: var(--color-text-muted)">Uptime</p>
          <p class="text-lg font-semibold" style="color: var(--color-text-primary)">
            {{ formatUptime(esp.uptime) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm" style="color: var(--color-text-muted)">Heap Frei</p>
          <p class="text-lg font-semibold" style="color: var(--color-text-primary)">
            {{ formatHeapSize(esp.heap_free) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm" style="color: var(--color-text-muted)">WiFi Signal</p>
          <p class="text-lg font-semibold" style="color: var(--color-text-primary)">
            {{ esp.wifi_rssi }} dBm
          </p>
        </div>
      </div>

      <!-- Zone Assignment Panel -->
      <ZoneAssignmentPanel
        :esp-id="esp.esp_id"
        :current-zone-id="esp.zone_id ?? undefined"
        :current-zone-name="esp.zone_id ?? undefined"
        :current-master-zone-id="esp.master_zone_id ?? undefined"
        @zone-updated="handleZoneUpdate"
        @zone-error="handleZoneError"
      />

      <!-- Sensors Section -->
      <div class="card">
        <div class="card-header flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-semibold flex items-center gap-2" style="color: var(--color-text-primary)">
            <Thermometer class="w-5 h-5" style="color: var(--color-mock)" />
            Sensoren ({{ esp.sensors.length }})
          </h3>
          <div class="flex gap-2">
            <button v-if="esp.sensors.length > 0" class="btn-secondary btn-sm" @click="openBatchModal">
              <RefreshCw class="w-4 h-4" />
              <span class="hidden sm:inline ml-1">Batch Update</span>
            </button>
            <button class="btn-primary btn-sm" @click="showAddSensorModal = true">
              <Plus class="w-4 h-4" />
              <span class="hidden sm:inline ml-1">Sensor hinzufügen</span>
            </button>
          </div>
        </div>
        <div class="card-body">
          <EmptyState 
            v-if="esp.sensors.length === 0"
            title="Keine Sensoren"
            description="Fügen Sie einen Sensor hinzu, um Messwerte zu simulieren."
            action-text="Sensor hinzufügen"
            @action="showAddSensorModal = true"
          />
          <div v-else class="space-y-3">
            <div
              v-for="sensor in esp.sensors"
              :key="sensor.gpio"
              class="sensor-row"
            >
              <div class="flex items-center gap-3">
                <div class="sensor-icon">
                  <Gauge class="w-5 h-5" />
                </div>
                <div>
                  <p class="font-medium" style="color: var(--color-text-primary)">
                    {{ sensor.name || getSensorLabel(sensor.sensor_type) }}
                  </p>
                  <p class="text-xs" style="color: var(--color-text-muted)">
                    {{ getSensorLabel(sensor.sensor_type) }} · GPIO {{ sensor.gpio }}
                  </p>
                </div>
              </div>
              
              <div class="flex items-center gap-4 flex-wrap justify-end">
                <!-- Editing mode -->
                <div v-if="editingSensorGpio === sensor.gpio" class="flex items-center gap-2 flex-wrap">
                  <input
                    v-model.number="editingSensorValue"
                    type="number"
                    step="0.1"
                    class="input w-24 text-sm"
                  />
                  <select v-model="editingSensorQuality" class="input text-sm w-32">
                    <option v-for="opt in qualityOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                  <label class="flex items-center gap-2 text-sm" style="color: var(--color-text-secondary)">
                    <input type="checkbox" v-model="editingSensorPublish" />
                    Publizieren
                  </label>
                  <button class="btn-primary btn-sm" @click="saveSensorValue">Speichern</button>
                  <button class="btn-ghost btn-sm" @click="editingSensorGpio = null">
                    <X class="w-4 h-4" />
                  </button>
                </div>
                
                <!-- Display mode -->
                <template v-else>
                  <div class="text-right">
                    <p class="text-lg font-mono" style="color: var(--color-text-primary)">
                      {{ formatNumber(sensor.raw_value, SENSOR_TYPE_CONFIG[sensor.sensor_type]?.decimals ?? 2) }}
                      <span class="text-sm" style="color: var(--color-text-secondary)">
                        {{ getSensorUnit(sensor.sensor_type) }}
                      </span>
                    </p>
                    <div class="flex justify-end gap-2 mt-1">
                      <Badge 
                        :variant="sensor.quality === 'good' || sensor.quality === 'excellent' ? 'success' : 'warning'" 
                        size="sm"
                      >
                        {{ getQualityLabel(sensor.quality) }}
                      </Badge>
                      <Badge v-if="sensor.subzone_id" variant="gray" size="sm">
                        {{ sensor.subzone_id }}
                      </Badge>
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button
                      class="btn-ghost btn-sm"
                      @click="startEditSensor(sensor.gpio, sensor.raw_value, sensor.quality)"
                      title="Bearbeiten"
                    >
                      Bearbeiten
                    </button>
                    <button
                      class="btn-ghost btn-sm text-error"
                      @click="removeSensor(sensor.gpio)"
                      title="Entfernen"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actuators Section -->
      <div class="card">
        <div class="card-header flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-semibold flex items-center gap-2" style="color: var(--color-text-primary)">
            <Power class="w-5 h-5" style="color: var(--color-warning)" />
            Aktoren ({{ esp.actuators.length }})
          </h3>
          <div class="flex gap-2">
            <button
              v-if="esp.actuators.some(a => a.emergency_stopped)"
              class="btn-secondary btn-sm text-warning"
              @click="clearEmergency"
            >
              Notfall aufheben
            </button>
            <button class="btn-primary btn-sm" @click="showAddActuatorModal = true">
              <Plus class="w-4 h-4" />
              <span class="hidden sm:inline ml-1">Aktor hinzufügen</span>
            </button>
          </div>
        </div>
        <div class="card-body">
          <EmptyState 
            v-if="esp.actuators.length === 0"
            title="Keine Aktoren"
            description="Fügen Sie einen Aktor hinzu, um Ausgänge zu simulieren."
            action-text="Aktor hinzufügen"
            @action="showAddActuatorModal = true"
          />
          <div v-else class="space-y-3">
            <div
              v-for="actuator in esp.actuators"
              :key="actuator.gpio"
              class="actuator-row"
              :class="{ 'actuator-row--emergency': actuator.emergency_stopped }"
            >
              <div class="flex items-center gap-3">
                <div :class="['actuator-icon', actuator.state ? 'actuator-icon--on' : '']">
                  <Power class="w-5 h-5" />
                </div>
                <div>
                  <p class="font-medium" style="color: var(--color-text-primary)">
                    {{ actuator.name || `GPIO ${actuator.gpio}` }}
                  </p>
                  <p class="text-xs" style="color: var(--color-text-muted)">
                    {{ getActuatorTypeLabel(actuator.actuator_type) }} · GPIO {{ actuator.gpio }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-4">
                <div class="flex gap-2">
                  <Badge :variant="actuator.state ? 'success' : 'gray'" size="sm">
                    {{ actuator.state ? 'Ein' : 'Aus' }}
                  </Badge>
                  <Badge v-if="actuator.emergency_stopped" variant="danger" size="sm">
                    E-STOP
                  </Badge>
                </div>
                <button
                  class="btn-secondary btn-sm"
                  :disabled="actuator.emergency_stopped"
                  @click="toggleActuator(actuator.gpio, actuator.state)"
                >
                  {{ actuator.state ? 'Ausschalten' : 'Einschalten' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Add Sensor Modal -->
    <Teleport to="body">
      <div v-if="showAddSensorModal" class="modal-overlay" @click.self="showAddSensorModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Sensor hinzufügen</h3>
            <button class="modal-close" @click="showAddSensorModal = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">GPIO</label>
                <input v-model.number="newSensor.gpio" type="number" min="0" max="39" class="input" />
              </div>
              <div>
                <label class="label">Sensor-Typ</label>
                <select v-model="newSensor.sensor_type" class="input">
                  <option v-for="opt in sensorTypeOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <div>
              <label class="label">Name (optional)</label>
              <input v-model="newSensor.name" class="input" placeholder="z.B. Wassertemperatur" />
            </div>
            <div>
              <label class="label">Subzone (optional)</label>
              <input v-model="newSensor.subzone_id" class="input" placeholder="z.B. gewaechshaus_reihe_1" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Startwert</label>
                <input v-model.number="newSensor.raw_value" type="number" step="0.1" class="input" />
              </div>
              <div>
                <label class="label">Einheit</label>
                <input v-model="newSensor.unit" class="input" readonly />
                <p class="text-xs mt-1" style="color: var(--color-text-muted)">
                  Wird automatisch vom Sensor-Typ gesetzt
                </p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary flex-1" @click="showAddSensorModal = false">Abbrechen</button>
            <button class="btn-primary flex-1" @click="addSensor">Hinzufügen</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Batch Sensor Update Modal -->
    <Teleport to="body">
      <div v-if="showBatchSensorModal" class="modal-overlay" @click.self="showBatchSensorModal = false">
        <div class="modal-content modal-content--wide">
          <div class="modal-header">
            <h3 class="modal-title">Batch-Update Sensoren</h3>
            <button class="modal-close" @click="showBatchSensorModal = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body space-y-4">
            <label class="flex items-center gap-2 text-sm" style="color: var(--color-text-secondary)">
              <input type="checkbox" v-model="batchPublish" />
              Nach Update publizieren
            </label>
            <div class="space-y-3 max-h-96 overflow-y-auto">
              <div
                v-for="sensor in esp?.sensors || []"
                :key="sensor.gpio"
                class="batch-sensor-row"
              >
                <div>
                  <p class="font-medium" style="color: var(--color-text-primary)">
                    {{ sensor.name || getSensorLabel(sensor.sensor_type) }}
                  </p>
                  <p class="text-xs" style="color: var(--color-text-muted)">
                    {{ getSensorLabel(sensor.sensor_type) }} · GPIO {{ sensor.gpio }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="batchSensorValues[sensor.gpio]"
                    type="number"
                    step="0.1"
                    class="input w-28 text-sm"
                  />
                  <span class="text-sm" style="color: var(--color-text-secondary)">
                    {{ getSensorUnit(sensor.sensor_type) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary flex-1" @click="showBatchSensorModal = false">Abbrechen</button>
            <button class="btn-primary flex-1" @click="saveBatchSensorValues">Speichern</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add Actuator Modal -->
    <Teleport to="body">
      <div v-if="showAddActuatorModal" class="modal-overlay" @click.self="showAddActuatorModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Aktor hinzufügen</h3>
            <button class="modal-close" @click="showAddActuatorModal = false">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">GPIO</label>
                <input v-model.number="newActuator.gpio" type="number" min="0" max="39" class="input" />
              </div>
              <div>
                <label class="label">Typ</label>
                <select v-model="newActuator.actuator_type" class="input">
                  <option value="relay">Relais</option>
                  <option value="pump">Pumpe</option>
                  <option value="valve">Ventil</option>
                  <option value="fan">Lüfter (PWM)</option>
                  <option value="pwm">PWM Generisch</option>
                </select>
              </div>
            </div>
            <div>
              <label class="label">Name (optional)</label>
              <input v-model="newActuator.name" class="input" placeholder="z.B. Hauptpumpe" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary flex-1" @click="showAddActuatorModal = false">Abbrechen</button>
            <button class="btn-primary flex-1" @click="addActuator">Hinzufügen</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Sensor row */
.sensor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.sensor-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background-color: rgba(167, 139, 250, 0.2);
  color: var(--color-mock);
  flex-shrink: 0;
}

/* Actuator row */
.actuator-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  gap: 1rem;
}

.actuator-row--emergency {
  border: 1px solid rgba(248, 113, 113, 0.3);
}

.actuator-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background-color: var(--color-bg-secondary);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: all 0.2s;
}

.actuator-icon--on {
  background-color: rgba(52, 211, 153, 0.2);
  color: var(--color-success);
}

/* Batch sensor row */
.batch-sensor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  gap: 1rem;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(4px);
}

.modal-content {
  width: 100%;
  max-width: 28rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  box-shadow: var(--glass-shadow);
}

.modal-content--wide {
  max-width: 42rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close {
  padding: 0.5rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  transition: all 0.2s;
}

.modal-close:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
}

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
}
</style>
