<template>
  <div class="bg-white rounded-lg shadow p-4 sub-zone-card">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center">
        <h3 class="text-lg font-medium text-gray-900">{{ subZone.name }}</h3>
        <v-tooltip v-if="subZone.description" location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" icon="mdi-information" size="small" class="ml-2 text-gray-500" />
          </template>
          <template #default>
            {{ subZone.description }}
          </template>
        </v-tooltip>
      </div>
    </div>

    <!-- Sensors -->
    <div v-if="sensors.length" :class="`grid grid-cols-${sensorGridCols} gap-4 mb-4`">
      <div
        v-for="sensor in sensors"
        :key="`sensor-${sensor.espId}-${sensor.gpio}`"
        class="bg-gray-50 rounded-lg p-3 flex flex-col items-center justify-center relative sensor-hover-wrapper"
        :style="{ minHeight: `${responsiveDisplay.getTouchTargetSize()}px` }"
        draggable="true"
        @dragstart="handleDragStart($event, sensor)"
        @dragend="handleDragEnd"
        :class="{ dragging: isDragging }"
      >
        <!-- 🆕 NEU: Warning-Badge -->
        <div v-if="sensor.warnings && sensor.warnings.length > 0" class="absolute top-1 right-1">
          <v-badge
            :content="sensor.warnings.length"
            :color="getWarningColor(sensor.warnings)"
            size="small"
          />
        </div>

        <!-- 🆕 NEU: Drag-Indikator -->
        <div class="absolute top-1 left-1 drag-indicator">
          <v-icon icon="mdi-drag" size="small" color="grey" />
        </div>

        <!-- 🆕 NEU: Sensor-Status mit verbesserten Tooltips -->
        <div class="text-center">
          <div class="flex items-center justify-center mb-2">
            <v-icon :icon="getSensorIcon(sensor.type)" size="small" class="mr-2" />
            <span class="text-sm font-medium">{{ sensor.name }}</span>
            <!-- 🆕 NEU: Status-Chip mit erklärendem Tooltip -->
            <v-tooltip location="top">
              <template #activator="{ props }">
                <v-chip
                  v-bind="props"
                  :color="getSensorStatusColor(sensor)"
                  size="x-small"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ getSensorStatusText(sensor) }}
                </v-chip>
              </template>
              {{ getSensorStatusTooltip(sensor) }}
            </v-tooltip>
          </div>

          <div class="text-lg font-bold" :class="getValueColor(sensor)">
            {{ formatSensorValue(sensor) }}
          </div>

          <div class="text-xs text-gray-500">
            {{ formatLastUpdate(sensor.lastUpdate) }}
          </div>
        </div>

        <!-- 🆕 NEU: Hardware/Simulation-Mode-Badge -->
        <div v-if="sensor.hardware_mode !== undefined" class="text-xs mt-1">
          <v-chip
            :color="sensor.hardware_mode ? 'success' : 'warning'"
            size="x-small"
            variant="tonal"
          >
            {{ sensor.hardware_mode ? 'Hardware' : 'Simulation' }}
          </v-chip>
        </div>

        <div v-if="sensor.lastUpdate && shouldShowSensorDetails" class="text-xs text-gray-400 mt-1">
          {{ formatLastUpdate(sensor.lastUpdate) }}
        </div>
      </div>
    </div>

    <!-- Actuators -->
    <div v-if="actuators.length" :class="`grid grid-cols-${actuatorGridCols} gap-4`">
      <div
        v-for="actuator in actuators"
        :key="`actuator-${actuator.espId}-${actuator.gpio}`"
        class="bg-gray-50 rounded-lg p-3"
        :style="{ minHeight: `${touchTargetSize}px` }"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <v-icon :icon="getActuatorIcon(actuator.type)" size="small" class="mr-2" />
            <span class="text-sm font-medium text-gray-500">{{ actuator.name }}</span>
          </div>

          <!-- ✅ NEU: Override-Indikator -->
          <div class="flex items-center gap-1">
            <v-chip
              v-if="getActuatorStatusInfo(actuator).isOverride"
              size="x-small"
              color="warning"
              variant="tonal"
            >
              <v-icon icon="mdi-hand" size="x-small" class="mr-1" />
              Override
            </v-chip>

            <v-btn
              :icon="getActuatorStatusInfo(actuator).state ? 'mdi-power' : 'mdi-power-off'"
              size="small"
              :color="getActuatorStatusInfo(actuator).state ? 'success' : ''"
              :disabled="mqttStore.value.isSafeMode"
              @click="handleActuatorToggle(actuator.gpio)"
            />

            <!-- ✅ NEU: Override-Reset Button -->
            <v-btn
              v-if="getActuatorStatusInfo(actuator).isOverride"
              icon="mdi-refresh"
              size="x-small"
              color="info"
              variant="text"
              @click="clearActuatorOverride(actuator.gpio)"
            >
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Manuellen Override zurücksetzen"
                tooltip-title="Reset"
              />
            </v-btn>
          </div>
        </div>

        <!-- ✅ NEU: Status-Details -->
        <div
          v-if="getActuatorStatusInfo(actuator).source !== 'UNKNOWN' && shouldShowActuatorDetails"
          class="mt-2 text-xs text-gray-400"
        >
          <div>Quelle: {{ getActuatorStatusInfo(actuator).source }}</div>
          <div v-if="getActuatorStatusInfo(actuator).reason">
            Grund: {{ getActuatorStatusInfo(actuator).reason }}
          </div>
        </div>
      </div>
    </div>

    <!-- ✅ NEU: Dynamische Empty-State-Nachricht -->
    <div
      v-if="!sensors.length && !actuators.length"
      :class="`${getEmptyStateColor()} p-4 rounded-lg text-sm`"
    >
      <div class="flex items-center mb-2">
        <v-icon :icon="getEmptyStateIcon()" size="small" class="mr-2" />
        <span class="font-medium">{{ getEmptyStateTitle() }}</span>
      </div>
      <div class="text-xs">
        {{ getEmptyStateMessage() }}
      </div>
      <v-btn
        v-if="shouldShowSetupButton"
        size="x-small"
        color="primary"
        variant="text"
        @click="navigateToSetup"
        class="mt-2"
      >
        {{ getEmptyStateActionText() }}
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useResponsiveDisplay } from '@/composables/useResponsiveDisplay'
import { formatRelativeTime } from '@/utils/time'
import HelpfulHints from '@/components/common/HelpfulHints.vue'

const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
  subZone: {
    type: Object,
    required: true,
    default: () => ({
      id: '',
      name: '',
      description: '',
      sensors: new Map(),
      actuators: new Map(),
    }),
  },
})

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const sensorRegistry = computed(() => centralDataHub.sensorRegistry)
const actuatorLogic = computed(() => centralDataHub.actuatorLogic)
const responsiveDisplay = useResponsiveDisplay()

// 🆕 NEU: Drag & Drop State
const isDragging = ref(false)

// 🆕 NEU: Drag & Drop Handler
const handleDragStart = (event, sensor) => {
  isDragging.value = true
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(
    'application/json',
    JSON.stringify({
      espId: sensor.espId,
      gpio: sensor.gpio,
      type: sensor.type,
      name: sensor.name,
      value: sensor.value,
      subZoneId: props.subZone.id,
      zoneId: props.espId,
    }),
  )
}

const handleDragEnd = () => {
  isDragging.value = false
}

// Computed Properties
const sensors = computed(() => {
  const zoneSensors = props.subZone?.sensors ? Array.from(props.subZone.sensors.values()) : []

  // 🆕 NEU: Sensor Registry Daten integrieren mit robuster Fehlerbehandlung
  const registrySensors = sensorRegistry.value
    .getSensorsByEsp(props.espId)
    .filter((sensor) => sensor.subzoneId === props.subZone.id)

  // Zone-Sensoren mit Registry-Daten erweitern
  return zoneSensors.map((zoneSensor) => {
    const registrySensor = registrySensors.find((rs) => rs.gpio === zoneSensor.gpio)
    if (registrySensor) {
      return {
        ...zoneSensor,
        // Registry-Daten haben Vorrang für aktuelle Werte
        value: registrySensor.value !== null ? registrySensor.value : zoneSensor.value,
        lastUpdate: registrySensor.lastUpdate || zoneSensor.lastUpdate,
        unit: registrySensor.unit || zoneSensor.unit,
        name: registrySensor.name || zoneSensor.name,
        description: registrySensor.description || zoneSensor.description,
        warnings: registrySensor.warnings || [],
        hardware_mode: registrySensor.hardware_mode,
      }
    }
    return zoneSensor
  })
})

const actuators = computed(() => {
  return props.subZone?.actuators ? Array.from(props.subZone.actuators.values()) : []
})

// ✅ NEU: Responsive Grid Columns
const sensorGridCols = computed(() => {
  return responsiveDisplay.getResponsiveCols(1, 2, 3) // Mobile: 1, Tablet: 2, Desktop: 3
})

const actuatorGridCols = computed(() => {
  return responsiveDisplay.getResponsiveCols(1, 2, 3) // Mobile: 1, Tablet: 2, Desktop: 3
})

// ✅ NEU: Touch-friendly Target Size
const touchTargetSize = computed(() => {
  return responsiveDisplay.getTouchTargetSize()
})

// ✅ NEU: Should show details based on display mode
const shouldShowSensorDetails = computed(() => {
  return responsiveDisplay.shouldShowDetail('secondary')
})

const shouldShowActuatorDetails = computed(() => {
  return responsiveDisplay.shouldShowDetail('primary')
})

// ✅ NEU: Should show setup button
const shouldShowSetupButton = computed(() => {
  return mqttStore.value.isConnected && props.espId
})

// Methods
const getSensorIcon = (type) => {
  const icons = {
    TEMP_DS18B20: 'mdi-thermometer',
    HUMIDITY_DHT22: 'mdi-water-percent',
    MOISTURE_GENERIC: 'mdi-water',
    LIGHT_LDR: 'mdi-white-balance-sunny',
    PRESSURE_BMP280: 'mdi-gauge',
  }
  return icons[type] || 'mdi-chip'
}

const getActuatorIcon = (type) => {
  const icons = {
    RELAY: 'mdi-lightning-bolt',
    SERVO: 'mdi-cog',
    MOTOR: 'mdi-engine',
    LED: 'mdi-lightbulb',
  }
  return icons[type] || 'mdi-chip'
}

const getSensorStatusColor = (sensor) => {
  if (!sensor.lastUpdate) return 'grey'

  const now = Date.now()
  const lastUpdate = new Date(sensor.lastUpdate).getTime()
  const diff = now - lastUpdate

  if (diff < 60000) return 'success' // < 1 minute
  if (diff < 300000) return 'warning' // < 5 minutes
  return 'error' // > 5 minutes
}

const getSensorStatusText = (sensor) => {
  if (!sensor.lastUpdate) return 'Offline'

  const now = Date.now()
  const lastUpdate = new Date(sensor.lastUpdate).getTime()
  const diff = now - lastUpdate

  if (diff < 60000) return 'Live'
  if (diff < 300000) return 'Stale'
  return 'Offline'
}

const getSensorStatusTooltip = (sensor) => {
  if (!sensor.lastUpdate) return 'Sensor ist offline oder nicht verbunden'

  const now = Date.now()
  const lastUpdate = new Date(sensor.lastUpdate).getTime()
  const diff = now - lastUpdate

  if (diff < 60000) return 'Sensor sendet aktuelle Daten'
  if (diff < 300000) return 'Sensor sendet veraltete Daten'
  return 'Sensor ist offline oder nicht verbunden'
}

const getValueColor = (sensor) => {
  if (!sensor.value) return 'text-grey'

  // Warnung für extreme Werte
  if (sensor.type === 'TEMP_DS18B20') {
    if (sensor.value > 35 || sensor.value < 5) return 'text-error'
    if (sensor.value > 30 || sensor.value < 10) return 'text-warning'
  }

  if (sensor.type === 'HUMIDITY_DHT22') {
    if (sensor.value > 90 || sensor.value < 20) return 'text-error'
    if (sensor.value > 80 || sensor.value < 30) return 'text-warning'
  }

  return 'text-success'
}

const formatSensorValue = (sensor) => {
  if (sensor.value === null || sensor.value === undefined) return 'N/A'

  const value = parseFloat(sensor.value)
  if (isNaN(value)) return 'N/A'

  // Formatierung je nach Sensor-Typ
  if (sensor.type === 'TEMP_DS18B20') {
    return `${value.toFixed(1)}°C`
  }
  if (sensor.type === 'HUMIDITY_DHT22') {
    return `${value.toFixed(1)}%`
  }
  if (sensor.type === 'MOISTURE_GENERIC') {
    return `${value.toFixed(0)}%`
  }
  if (sensor.type === 'LIGHT_LDR') {
    return `${value.toFixed(0)} lux`
  }
  if (sensor.type === 'PRESSURE_BMP280') {
    return `${value.toFixed(1)} hPa`
  }

  return `${value.toFixed(1)}${sensor.unit || ''}`
}

const formatLastUpdate = (timestamp) => {
  if (!timestamp) return 'N/A'
  return formatRelativeTime(timestamp)
}

const getWarningColor = (warnings) => {
  const hasError = warnings.some((w) => w.level === 'error')
  const hasWarning = warnings.some((w) => w.level === 'warning')

  if (hasError) return 'error'
  if (hasWarning) return 'warning'
  return 'info'
}

const getActuatorStatusInfo = (actuator) => {
  const logic = actuatorLogic.value.getActuatorLogic(props.espId, actuator.gpio)

  return {
    state: actuator.state || false,
    isOverride: logic?.isOverride || false,
    source: logic?.source || 'UNKNOWN',
    reason: logic?.reason || '',
  }
}

const handleActuatorToggle = async (gpio) => {
  try {
    const currentState = getActuatorStatusInfo({ gpio }).state
    await mqttStore.value.sendActuatorCommand(props.espId, gpio, !currentState)
    window.$snackbar?.showSuccess(`Aktor ${!currentState ? 'aktiviert' : 'deaktiviert'}`)
  } catch (error) {
    console.error('Actuator toggle failed:', error)
    window.$snackbar?.showError('Aktor-Steuerung fehlgeschlagen')
  }
}

const clearActuatorOverride = async (gpio) => {
  try {
    await actuatorLogic.value.clearOverride(props.espId, gpio)
    window.$snackbar?.showSuccess('Manueller Override zurückgesetzt')
  } catch (error) {
    console.error('Override clear failed:', error)
    window.$snackbar?.showError('Override-Reset fehlgeschlagen')
  }
}

// ✅ NEU: Get empty state message based on context
const getEmptyStateMessage = () => {
  if (!mqttStore.value.isConnected) return 'Keine Verbindung zum System'
  if (!props.espId) return 'Kein ESP-Gerät ausgewählt'
  if (props.zone?.status === 'offline') return 'ESP-Gerät offline'
  return 'Keine Geräte konfiguriert'
}

// ✅ NEU: Get empty state color based on context
const getEmptyStateColor = () => {
  if (!mqttStore.value.isConnected) return 'bg-red-50 text-red-700'
  if (!props.espId) return 'bg-yellow-50 text-yellow-700'
  return 'bg-blue-50 text-blue-700'
}

// ✅ NEU: Get empty state icon based on context
const getEmptyStateIcon = () => {
  if (!mqttStore.value.isConnected) return 'mdi-wifi-off'
  if (!props.espId) return 'mdi-chip-off'
  return 'mdi-information'
}

// ✅ NEU: Get empty state title based on context
const getEmptyStateTitle = () => {
  if (!mqttStore.value.isConnected) return 'Verbindung erforderlich'
  if (!props.espId) return 'ESP-Gerät auswählen'
  if (props.zone?.status === 'offline') return 'ESP-Gerät offline'
  return 'Keine Geräte konfiguriert'
}

// ✅ NEU: Get empty state action text based on context
const getEmptyStateActionText = () => {
  if (!mqttStore.value.isConnected) return 'Verbinden'
  if (!props.espId) return 'ESP wählen'
  return 'Geräte hinzufügen'
}

// ✅ NEU: Navigate to setup page
const navigateToSetup = () => {
  if (props.espId) {
    // Router navigation would be handled here
    console.log('Navigate to setup:', props.espId)
  }
}
</script>

<style scoped>
.sub-zone-card {
  transition: all 0.2s ease-in-out;
}

.sub-zone-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
}

/* 🆕 NEU: Drag & Drop Styles */
.sensor-hover-wrapper {
  transition: all 0.2s ease;
  cursor: grab;
}

.sensor-hover-wrapper.dragging {
  opacity: 0.6;
  transform: scale(0.95);
  cursor: grabbing;
}

.drag-indicator {
  opacity: 0.4;
  transition: opacity 0.2s ease;
}

.sensor-hover-wrapper:hover .drag-indicator {
  opacity: 0.8;
}

.sensor-hover-wrapper.dragging .drag-indicator {
  opacity: 1;
}
</style>
