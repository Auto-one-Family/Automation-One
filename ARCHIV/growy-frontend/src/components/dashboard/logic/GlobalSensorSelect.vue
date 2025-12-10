<template>
  <div class="global-sensor-select">
    <!-- ✅ NEU: Kaiser-Auswahl für Cross-Kaiser-Logik -->
    <v-select
      v-model="selectedKaiserId"
      label="Kaiser-System"
      :items="availableKaiserOptions"
      item-title="label"
      item-value="value"
      variant="outlined"
      density="comfortable"
      prepend-inner-icon="mdi-crown"
      :color="getKaiserColor(selectedKaiserId)"
      clearable
    >
      <template v-slot:item="{ props, item }">
        <v-list-item v-bind="props">
          <template v-slot:prepend>
            <v-icon :icon="item.raw.icon" :color="item.raw.color" size="small" />
          </template>
          <v-list-item-title>{{ item.raw.label }}</v-list-item-title>
          <v-list-item-subtitle>{{ item.raw.esp_count }} ESPs</v-list-item-subtitle>
        </v-list-item>
      </template>
    </v-select>

    <!-- ESP-Auswahl -->
    <v-select
      v-model="selectedEspId"
      label="ESP-Gerät"
      :items="availableEspDevices"
      item-title="name"
      item-value="espId"
      variant="outlined"
      density="comfortable"
      prepend-inner-icon="mdi-chip"
      :color="getEspColor(selectedEspId)"
      :disabled="!selectedKaiserId"
    >
      <template v-slot:item="{ props, item }">
        <v-list-item v-bind="props">
          <template v-slot:prepend>
            <v-icon :icon="item.raw.icon" :color="item.raw.color" size="small" />
          </template>
          <v-list-item-title>{{ item.raw.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ item.raw.sensorCount }} Sensoren</v-list-item-subtitle>
        </v-list-item>
      </template>
    </v-select>

    <!-- Sensor-Auswahl -->
    <v-select
      v-model="selectedSensor"
      label="Sensor"
      :items="availableSensors"
      item-title="name"
      item-value="sensor"
      variant="outlined"
      density="comfortable"
      prepend-inner-icon="mdi-thermometer"
      :disabled="!selectedEspId"
    >
      <template v-slot:item="{ props, item }">
        <v-list-item v-bind="props">
          <template v-slot:prepend>
            <v-icon :icon="item.raw.icon" size="small" />
          </template>
          <v-list-item-title>{{ item.raw.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ item.raw.value }}{{ item.raw.unit }}</v-list-item-subtitle>
        </v-list-item>
      </template>
    </v-select>

    <!-- Cross-ESP-Warnung -->
    <v-alert
      v-if="isCrossEspSelection"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-2"
    >
      <template v-slot:prepend>
        <v-icon icon="mdi-alert" />
      </template>
      <div class="text-caption">
        <strong>Cross-ESP-Logik:</strong> Dieser Sensor stammt von einem anderen ESP-Gerät. Stellen
        Sie sicher, dass alle Geräte online sind.
      </div>
    </v-alert>

    <!-- ✅ NEU: Cross-Kaiser-Warnung -->
    <v-alert
      v-if="isCrossKaiserSelection"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-2"
    >
      <template v-slot:prepend>
        <v-icon icon="mdi-crown" />
      </template>
      <div class="text-caption">
        <strong>Cross-Kaiser-Logik:</strong> Dieser Sensor stammt von einem anderen Kaiser-System.
        Stellen Sie sicher, dass alle Kaiser-Systeme online und synchronisiert sind.
      </div>
    </v-alert>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useSensorRegistryStore } from '@/stores/sensorRegistry'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ espId: null, gpio: null, kaiserId: null }),
  },
  currentActuatorEspId: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue'])

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const sensorRegistry = useSensorRegistryStore()

const selectedKaiserId = ref(props.modelValue.kaiserId)
const selectedEspId = ref(props.modelValue.espId)
const selectedSensor = ref(null)

// ESP-Farben für visuelle Unterscheidung
const espColors = ['primary', 'secondary', 'success', 'warning', 'error', 'info']

// ✅ NEU: Hierarchische Sensor-Auswahl
const hierarchicalSensorSelect = {
  // Kaiser-Auswahl für Cross-Kaiser-Logik
  async getKaiserOptions() {
    try {
      const hierarchy = await centralDataHub.aggregateGodData()
      return hierarchy.kaisers.map((kaiser) => ({
        value: kaiser.id,
        label: `Kaiser ${kaiser.id} (${kaiser.esp_count} ESPs)`,
        esp_count: kaiser.esp_count,
        icon: 'mdi-crown',
        color: 'warning',
      }))
    } catch (error) {
      console.error('Failed to get kaiser options:', error)
      return []
    }
  },

  // ESP-Auswahl innerhalb Kaiser
  async getEspOptionsForKaiser(kaiserId) {
    try {
      const kaiserData = await centralDataHub.getKaiserData(kaiserId)
      return kaiserData.esp_devices.map((esp) => ({
        value: esp.id,
        label: `ESP ${esp.id} (${esp.sensor_count} Sensoren)`,
        kaiser_id: kaiserId,
        icon: 'mdi-chip',
        color: espColors[Math.floor(Math.random() * espColors.length)],
      }))
    } catch (error) {
      console.error('Failed to get ESP options for kaiser:', error)
      return []
    }
  },

  // Sensor-Auswahl innerhalb ESP
  async getSensorOptionsForEsp(kaiserId, espId) {
    try {
      const espData = await mqttStore.value.request('esp/sensors/get', {
        kaiser_id: kaiserId,
        esp_id: espId,
      })

      return espData.sensors.map((sensor) => ({
        value: sensor.gpio,
        label: `${sensor.type} (GPIO ${sensor.gpio})`,
        esp_id: espId,
        kaiser_id: kaiserId,
        icon: getSensorIcon(sensor.type),
      }))
    } catch (error) {
      console.error('Failed to get sensor options for ESP:', error)
      return []
    }
  },
}

// ✅ NEU: Verfügbare Kaiser-Optionen
const availableKaiserOptions = ref([])

// Verfügbare ESP-Geräte mit Sensoren
const availableEspDevices = ref([])

// Sensoren für ausgewähltes ESP
const availableSensors = computed(() => {
  if (!selectedEspId.value) return []

  return sensorRegistry.getSensorsByEsp(selectedEspId.value).map((sensor) => ({
    sensor: { espId: selectedEspId.value, gpio: sensor.gpio },
    name: `${sensor.name} (GPIO ${sensor.gpio})`,
    value: sensor.value !== null ? sensor.value : '—',
    unit: sensor.unit || '',
    icon: getSensorIcon(sensor.type),
  }))
})

// Cross-ESP-Erkennung
const isCrossEspSelection = computed(() => {
  return selectedEspId.value && selectedEspId.value !== props.currentActuatorEspId
})

// ESP-Farbe ermitteln
const getEspColor = (espId) => {
  const device = availableEspDevices.value.find((d) => d.espId === espId)
  return device?.color || 'primary'
}

// Sensor-Icon ermitteln
const getSensorIcon = (type) => {
  const icons = {
    SENSOR_TEMP_DS18B20: 'mdi-thermometer',
    SENSOR_MOISTURE: 'mdi-water-percent',
    SENSOR_FLOW: 'mdi-pump',
    SENSOR_PH_DFROBOT: 'mdi-test-tube',
    SENSOR_EC_GENERIC: 'mdi-flash',
    SENSOR_PRESSURE: 'mdi-gauge',
    SENSOR_CO2: 'mdi-molecule-co2',
    SENSOR_AIR_QUALITY: 'mdi-air-filter',
    SENSOR_CUSTOM_PI_ENHANCED: 'mdi-chip',
    SENSOR_LIGHT: 'mdi-white-balance-sunny',
    SENSOR_LEVEL: 'mdi-waves',
  }
  return icons[type] || 'mdi-thermometer'
}

// ✅ NEU: Cross-Kaiser-Erkennung
const isCrossKaiserSelection = computed(() => {
  return selectedKaiserId.value && selectedKaiserId.value !== 'current_kaiser'
})

// ✅ NEU: Kaiser-Farbe ermitteln
const getKaiserColor = (kaiserId) => {
  return kaiserId ? 'warning' : 'primary'
}

// Wert-Update
watch(
  [selectedKaiserId, selectedEspId, selectedSensor],
  async ([kaiserId, espId, sensor]) => {
    // Kaiser-Optionen laden
    if (kaiserId && availableKaiserOptions.value.length === 0) {
      availableKaiserOptions.value = await hierarchicalSensorSelect.getKaiserOptions()
    }

    // ESP-Optionen laden
    if (kaiserId) {
      availableEspDevices.value = await hierarchicalSensorSelect.getEspOptionsForKaiser(kaiserId)
    }

    if (espId && sensor) {
      emit('update:modelValue', {
        kaiserId: kaiserId,
        espId: sensor.espId,
        gpio: sensor.gpio,
      })
    }
  },
  { immediate: true },
)
</script>
