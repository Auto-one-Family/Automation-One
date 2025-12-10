<template>
  <div class="pin-assignment-zone">
    <!-- VERFÜGBARE PINS -->
    <div class="available-pins-section">
      <h4 class="section-title">
        <v-icon icon="mdi-pin" class="mr-2" />
        🔌 Verfügbare Anschlüsse
        <v-chip size="small" color="info" variant="tonal" class="ml-2">
          {{ availablePins.length }}
        </v-chip>
      </h4>

      <div class="pin-grid">
        <div
          v-for="pin in availablePins"
          :key="pin"
          class="pin-card"
          draggable="true"
          @dragstart="startDrag(pin, $event)"
          @dragend="endDrag"
        >
          <div class="pin-header">
            <v-chip color="grey" size="small" variant="tonal"> GPIO {{ pin }} </v-chip>
            <v-icon icon="mdi-drag" size="small" color="grey" />
          </div>
          <div class="pin-type">{{ getPinType(pin) }}</div>
          <div class="pin-description">{{ getPinDescription(pin) }}</div>
        </div>
      </div>
    </div>

    <!-- SUBZONEN ALS DROP-TARGETS -->
    <div class="subzones-section">
      <h4 class="section-title">
        <v-icon icon="mdi-map-marker" class="mr-2" />
        🏠 Bereiche
        <v-chip size="small" color="secondary" variant="tonal" class="ml-2">
          {{ subzones.length }}
        </v-chip>
      </h4>

      <div class="subzones-grid">
        <div
          v-for="subzone in subzones"
          :key="subzone.id"
          class="subzone-dropzone"
          :class="{
            'drag-over': isDragOver === subzone.id,
            'has-pins': subzone.pins && subzone.pins.length > 0,
          }"
          @dragover.prevent="handleDragOver(subzone.id, $event)"
          @dragleave="handleDragLeave"
          @drop="handleDrop(subzone, $event)"
        >
          <div class="subzone-header">
            <h5 class="subzone-name">{{ subzone.name }}</h5>
            <v-chip
              v-if="subzone.pins && subzone.pins.length > 0"
              size="small"
              color="success"
              variant="tonal"
            >
              {{ subzone.pins.length }} Pins
            </v-chip>
          </div>

          <!-- BEREITS ZUGEORDNETE PINS -->
          <div v-if="subzone.pins && subzone.pins.length > 0" class="assigned-pins">
            <v-chip
              v-for="pin in subzone.pins"
              :key="pin.gpio"
              :color="getPinColor(pin.type)"
              size="small"
              variant="tonal"
              closable
              @click:close="removePin(subzone.id, pin)"
            >
              <v-icon :icon="getPinIcon(pin.type)" size="x-small" class="mr-1" />
              {{ pin.name }} (GPIO {{ pin.gpio }})
            </v-chip>
          </div>

          <!-- DROP-INDIKATOR -->
          <div v-if="isDragOver === subzone.id" class="drop-indicator">
            <v-icon icon="mdi-plus-circle" size="large" color="primary" />
            <div class="drop-text">Pin hier zuordnen</div>
          </div>

          <!-- EMPTY STATE -->
          <div v-if="!subzone.pins || subzone.pins.length === 0" class="empty-state">
            <v-icon icon="mdi-pin-off" size="32" color="grey-lighten-1" />
            <div class="empty-text">Keine Pins zugeordnet</div>
            <div class="empty-hint">Pins hierher ziehen</div>
          </div>
        </div>
      </div>
    </div>

    <!-- PIN-KONFIGURATION MODAL -->
    <v-dialog v-model="showPinConfigModal" max-width="500">
      <v-card>
        <v-card-title>
          <v-icon icon="mdi-pin" class="mr-2" />
          Pin {{ selectedPin }} konfigurieren
        </v-card-title>

        <v-card-text>
          <v-form ref="pinConfigForm">
            <v-text-field
              v-model="pinConfig.name"
              label="Pin-Name"
              hint="z.B. 'Temperatursensor' oder 'Wasserpumpe'"
              persistent-hint
              variant="outlined"
              density="comfortable"
              class="mb-4"
              :rules="[(v) => !!v || 'Name ist erforderlich']"
            />

            <v-select
              v-model="pinConfig.type"
              label="Pin-Typ"
              :items="pinTypeOptions"
              hint="Wählen Sie den Typ des angeschlossenen Geräts"
              persistent-hint
              variant="outlined"
              density="comfortable"
              class="mb-4"
              :rules="[(v) => !!v || 'Typ ist erforderlich']"
            />

            <v-select
              v-if="pinConfig.type === 'sensor'"
              v-model="pinConfig.sensorType"
              label="Sensor-Typ"
              :items="sensorTypeOptions"
              variant="outlined"
              density="comfortable"
              class="mb-4"
            />

            <v-select
              v-if="pinConfig.type === 'actuator'"
              v-model="pinConfig.actuatorType"
              label="Aktor-Typ"
              :items="actuatorTypeOptions"
              variant="outlined"
              density="comfortable"
              class="mb-4"
            />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-btn @click="showPinConfigModal = false">Abbrechen</v-btn>
          <v-btn
            color="primary"
            @click="confirmPinConfig"
            :disabled="!pinConfig.name || !pinConfig.type"
          >
            Konfigurieren
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'
import {
  createPinDragData,
  parseDragData,
  validateDragData,
  setDragEffect,
} from '@/utils/dragDropUtils'

// Props
const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
  availablePins: {
    type: Array,
    default: () => [],
  },
  configuredPins: {
    type: Array,
    default: () => [],
  },
})

// Emits
const emit = defineEmits(['pin-assigned', 'pin-removed'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const espManagement = computed(() => centralDataHub.espManagement)

// Reactive Data
const isDragOver = ref(null)
const showPinConfigModal = ref(false)
const selectedPin = ref(null)
const selectedSubzone = ref(null)
const pinConfig = ref({
  name: '',
  type: '',
  sensorType: '',
  actuatorType: '',
})

// Computed Properties
const subzones = computed(() => {
  if (!props.espId) return []

  const device = mqttStore.value.espDevices.get(props.espId)
  if (!device || !device.subzones) return []

  return Array.from(device.subzones.values()).map((subzone) => ({
    id: subzone.id,
    name: subzone.name,
    pins: getPinsForSubzone(subzone.id),
  }))
})

// Pin Configuration Options
const pinTypeOptions = computed(() => [
  { title: '🌡️ Sensor', value: 'sensor' },
  { title: '⚡ Aktor', value: 'actuator' },
])

const sensorTypeOptions = computed(() => [
  { title: '🌡️ Temperatur (DS18B20)', value: 'SENSOR_TEMP_DS18B20' },
  { title: '💧 Bodenfeuchte', value: 'SENSOR_SOIL' },
  { title: '💧 Luftfeuchte (DHT22)', value: 'SENSOR_HUMIDITY' },
  { title: '🌪️ Luftdruck (BMP280)', value: 'SENSOR_PRESSURE' },
  { title: '☀️ Lichtstärke (LDR)', value: 'SENSOR_LIGHT' },
  { title: '💧 Durchfluss', value: 'SENSOR_FLOW' },
])

const actuatorTypeOptions = computed(() => [
  { title: '💧 Wasserpumpe', value: 'AKTOR_PUMP' },
  { title: '💡 LED', value: 'AKTOR_LED' },
  { title: '🔥 Heizung', value: 'AKTOR_HEATER' },
  { title: '💨 Lüfter', value: 'AKTOR_FAN' },
  { title: '🔌 Relais', value: 'AKTOR_RELAIS' },
  { title: '🚪 Ventil', value: 'AKTOR_VALVE' },
])

// Methods
const getPinType = (pin) => {
  // GPIO-Typ basierend auf Pin-Nummer
  if (
    [
      0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39,
    ].includes(pin)
  ) {
    return 'Digital I/O'
  }
  if ([25, 26].includes(pin)) {
    return 'DAC (Digital-Analog)'
  }
  if ([32, 33, 34, 35, 36, 39].includes(pin)) {
    return 'ADC (Analog-Digital)'
  }
  return 'Spezial'
}

const getPinDescription = (pin) => {
  const descriptions = {
    0: 'Boot-Modus (nicht für Sensoren)',
    2: 'Built-in LED',
    4: 'I2C SDA (häufig verwendet)',
    5: 'I2C SCL (häufig verwendet)',
    12: 'Boot-Modus (nicht für Sensoren)',
    13: 'SPI MOSI',
    14: 'SPI CLK',
    15: 'SPI CS',
    16: 'UART2 RX',
    17: 'UART2 TX',
    18: 'SPI MISO',
    19: 'SPI SS',
    21: 'I2C SDA (alternativ)',
    22: 'I2C SCL (alternativ)',
    23: 'SPI MOSI (alternativ)',
    25: 'DAC1',
    26: 'DAC2',
    27: 'GPIO (allgemein)',
    32: 'ADC1_CH4',
    33: 'ADC1_CH5',
    34: 'ADC1_CH6 (nur Input)',
    35: 'ADC1_CH7 (nur Input)',
    36: 'ADC1_CH0 (nur Input)',
    39: 'ADC1_CH3 (nur Input)',
  }

  return descriptions[pin] || 'Allgemeiner GPIO-Pin'
}

const getPinColor = (type) => {
  return type === 'sensor' ? 'success' : 'warning'
}

const getPinIcon = (type) => {
  return type === 'sensor' ? 'mdi-thermometer' : 'mdi-cog'
}

const getPinsForSubzone = (subzoneId) => {
  return props.configuredPins.filter((pin) => {
    // ✅ KORRIGIERT: Beide Eigenschaften prüfen für Rückwärtskompatibilität
    return pin.subzone === subzoneId || pin.subzoneId === subzoneId
  })
}

// Drag & Drop Methods
const startDrag = (pin, event) => {
  const dragData = createPinDragData(pin, props.espId)
  event.dataTransfer.setData('application/json', JSON.stringify(dragData))
  setDragEffect(event, 'copy')
}

const endDrag = () => {
  // Drag beendet
}

const handleDragOver = (subzoneId, event) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  isDragOver.value = subzoneId
}

const handleDragLeave = (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    isDragOver.value = null
  }
}

const handleDrop = (subzone, event) => {
  event.preventDefault()
  isDragOver.value = null

  try {
    const data = parseDragData(event)

    if (!data) {
      safeError('Ungültige Drag-Daten')
      return
    }

    const validation = validateDragData(data, 'pin')
    if (!validation.valid) {
      safeError(`Validierungsfehler: ${validation.reason}`)
      return
    }

    if (data.espId === props.espId) {
      selectedPin.value = data.pin
      selectedSubzone.value = subzone
      showPinConfigModal.value = true
    }
  } catch (error) {
    console.error('Drop handling failed:', error)
    safeError('Fehler beim Verarbeiten des Pins')
  }
}

const confirmPinConfig = async () => {
  try {
    const pinData = {
      espId: props.espId,
      gpio: selectedPin.value,
      name: pinConfig.value.name,
      type: pinConfig.value.type,
      subzoneId: selectedSubzone.value.id,
      sensorType: pinConfig.value.sensorType,
      actuatorType: pinConfig.value.actuatorType,
    }

    // ✅ KORRIGIERT: Verwende ESP Management Store API
    await espManagement.value.configurePinAssignment(props.espId, {
      gpio: selectedPin.value,
      type:
        pinConfig.value.type === 'sensor'
          ? pinConfig.value.sensorType
          : pinConfig.value.actuatorType,
      name: pinConfig.value.name,
      subzone: selectedSubzone.value.id,
      category: pinConfig.value.type === 'sensor' ? 'sensor' : 'actuator',
    })

    emit('pin-assigned', pinData)
    safeSuccess(`Pin ${selectedPin.value} erfolgreich konfiguriert`)

    // Modal schließen und Form zurücksetzen
    showPinConfigModal.value = false
    resetPinConfig()
  } catch (error) {
    console.error('Pin configuration failed:', error)
    safeError(`Fehler bei Pin-Konfiguration: ${error.message}`)
  }
}

const removePin = async (subzoneId, pin) => {
  try {
    // ✅ KORRIGIERT: Verwende ESP Management Store API
    await espManagement.value.removePinAssignment(props.espId, pin.gpio, 'manual')
    emit('pin-removed', { subzoneId, pin })
    safeSuccess(`Pin ${pin.gpio} entfernt`)
  } catch (error) {
    console.error('Pin removal failed:', error)
    safeError(`Fehler beim Entfernen des Pins: ${error.message}`)
  }
}

const resetPinConfig = () => {
  pinConfig.value = {
    name: '',
    type: '',
    sensorType: '',
    actuatorType: '',
  }
  selectedPin.value = null
  selectedSubzone.value = null
}

// Watch for modal close to reset form
watch(showPinConfigModal, (newValue) => {
  if (!newValue) {
    resetPinConfig()
  }
})
</script>

<style scoped>
.pin-assignment-zone {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  font-size: 1.1rem;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--v-theme-on-surface);
}

.pin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.pin-card {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  background: white;
  cursor: grab;
  transition: all 0.2s ease;
}

.pin-card:hover {
  border-color: var(--v-theme-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.pin-card:active {
  cursor: grabbing;
}

.pin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.pin-type {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--v-theme-primary);
  margin-bottom: 4px;
}

.pin-description {
  font-size: 0.75rem;
  color: var(--v-theme-on-surface-variant);
  line-height: 1.3;
}

.subzones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.subzone-dropzone {
  border: 2px dashed #e0e0e0;
  border-radius: 12px;
  padding: 16px;
  background: #fafafa;
  min-height: 120px;
  transition: all 0.2s ease;
  position: relative;
}

.subzone-dropzone.drag-over {
  border-color: var(--v-theme-primary);
  background: rgba(var(--v-theme-primary), 0.05);
  transform: scale(1.02);
}

.subzone-dropzone.has-pins {
  border-style: solid;
  border-color: var(--v-theme-success);
  background: rgba(var(--v-theme-success), 0.05);
}

.subzone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.subzone-name {
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  color: var(--v-theme-on-surface);
}

.assigned-pins {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.drop-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(var(--v-theme-primary), 0.1);
  border-radius: 8px;
  padding: 16px;
  border: 2px dashed var(--v-theme-primary);
}

.drop-text {
  margin-top: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--v-theme-primary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80px;
  text-align: center;
}

.empty-text {
  font-size: 0.875rem;
  color: var(--v-theme-on-surface-variant);
  margin-top: 8px;
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--v-theme-outline);
  margin-top: 4px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .pin-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  .subzones-grid {
    grid-template-columns: 1fr;
  }

  .pin-card,
  .subzone-dropzone {
    padding: 8px;
  }
}

/* Dark theme adjustments */
.v-theme--dark .pin-card {
  background: var(--v-theme-surface);
  border-color: var(--v-theme-outline);
}

.v-theme--dark .subzone-dropzone {
  background: var(--v-theme-surface-variant);
  border-color: var(--v-theme-outline);
}
</style>
