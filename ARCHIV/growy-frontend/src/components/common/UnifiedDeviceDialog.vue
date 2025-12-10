<template>
  <v-dialog v-model="show" max-width="800" persistent>
    <UnifiedCard
      :title="getDialogTitle()"
      :icon="getDialogIcon()"
      variant="elevated"
      :loading="saving"
      :error="error"
    >
      <template #content>
        <!-- EINFACHE TAB-NAVIGATION -->
        <v-tabs v-model="activeTab" centered class="mb-4">
          <v-tab value="basic">
            <v-icon icon="mdi-information" class="mr-2" />
            Grundeinstellungen
          </v-tab>
          <v-tab value="pins" v-if="deviceType === 'esp'">
            <v-icon icon="mdi-pin" class="mr-2" />
            Anschlüsse
          </v-tab>
          <v-tab value="zones" v-if="deviceType === 'esp'">
            <v-icon icon="mdi-map-marker" class="mr-2" />
            Standort
          </v-tab>
          <v-tab value="advanced" v-if="showAdvancedTab">
            <v-icon icon="mdi-tune" class="mr-2" />
            Erweitert
          </v-tab>
        </v-tabs>

        <v-window v-model="activeTab" class="mt-4">
          <!-- BASIC SETTINGS: Nur essentieller Krams -->
          <v-window-item value="basic">
            <div class="basic-settings">
              <v-text-field
                v-model="formData.displayName"
                label="Anzeigename"
                hint="z.B. 'Gewächshaus Nord' oder 'Klimacontroller'"
                persistent-hint
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />

              <v-select
                v-model="formData.deviceType"
                label="Gerätetyp"
                :items="deviceTypeOptions"
                hint="Wählen Sie den passenden Gerätetyp"
                persistent-hint
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />

              <v-text-field
                v-model="formData.description"
                label="Beschreibung"
                hint="Optionale Beschreibung für bessere Organisation"
                persistent-hint
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />

              <!-- Device-spezifische Felder -->
              <div v-if="deviceType === 'kaiser'" class="kaiser-specific">
                <v-text-field
                  v-model="formData.kaiserId"
                  label="Kaiser ID"
                  hint="Eindeutige ID für diesen Edge Controller"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                  class="mb-4"
                />
              </div>

              <div v-if="deviceType === 'esp'" class="esp-specific">
                <v-text-field
                  v-model="formData.espId"
                  label="ESP ID"
                  hint="Eindeutige ID für dieses Feldgerät"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                  class="mb-4"
                />
              </div>
            </div>
          </v-window-item>

          <!-- PIN CONFIG: Mit Drag & Drop -->
          <v-window-item value="pins" v-if="deviceType === 'esp'">
            <div class="pin-configuration">
              <HelpfulHints context="pinConfiguration" />

              <PinDragDropZone
                :esp-id="formData.espId"
                :available-pins="availablePins"
                :configured-pins="configuredPins"
                @pin-assigned="handlePinAssignment"
                @pin-removed="handlePinRemoval"
              />
            </div>
          </v-window-item>

          <!-- ZONE ASSIGNMENT -->
          <v-window-item value="zones" v-if="deviceType === 'esp'">
            <div class="zone-assignment">
              <HelpfulHints context="zoneAssignment" />

              <v-select
                v-model="formData.zone"
                label="Zone zuweisen"
                :items="availableZones"
                hint="Wählen Sie eine Zone für dieses Gerät"
                persistent-hint
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />

              <v-text-field
                v-model="formData.subzone"
                label="Bereich (optional)"
                hint="Spezifischer Bereich innerhalb der Zone"
                persistent-hint
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />

              <!-- Zone Preview -->
              <v-card v-if="formData.zone" variant="outlined" class="mt-4">
                <v-card-title class="text-subtitle-2">
                  <v-icon icon="mdi-map-marker" class="mr-2" />
                  Zone-Vorschau
                </v-card-title>
                <v-card-text>
                  <div class="zone-preview">
                    <div class="zone-info">
                      <strong>{{ formData.zone }}</strong>
                      <span v-if="formData.subzone"> → {{ formData.subzone }}</span>
                    </div>
                    <div class="zone-stats">
                      <v-chip size="small" color="info" variant="tonal">
                        {{ getZoneDeviceCount(formData.zone) }} Geräte
                      </v-chip>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-window-item>

          <!-- ADVANCED SETTINGS -->
          <v-window-item value="advanced" v-if="showAdvancedTab">
            <div class="advanced-settings">
              <HelpfulHints context="advancedSettings" />

              <v-switch
                v-model="formData.autoConnect"
                label="Automatisch verbinden"
                color="primary"
                hide-details
                class="mb-4"
              />

              <v-switch
                v-model="formData.debugMode"
                label="Debug-Modus"
                color="warning"
                hide-details
                class="mb-4"
              />

              <v-select
                v-model="formData.priority"
                label="Priorität"
                :items="priorityOptions"
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />
            </div>
          </v-window-item>
        </v-window>
      </template>

      <template #actions>
        <v-btn @click="cancel" :disabled="saving"> Abbrechen </v-btn>
        <v-btn color="primary" @click="save" :loading="saving" :disabled="!isFormValid">
          Speichern
        </v-btn>
      </template>
    </UnifiedCard>
  </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from './UnifiedCard.vue'
import PinDragDropZone from './PinDragDropZone.vue'
import HelpfulHints from './HelpfulHints.vue'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  deviceType: {
    type: String,
    required: true,
    validator: (value) => ['esp', 'kaiser', 'zone', 'mindmap'].includes(value),
  },
  deviceId: {
    type: String,
    default: null,
  },
  initialData: {
    type: Object,
    default: () => ({}),
  },
  // ✅ NEU: Panel-Modus für Mindmap-Integration
  mode: {
    type: String,
    default: 'dialog', // 'dialog' | 'panel'
    validator: (value) => ['dialog', 'panel'].includes(value),
  },
  // ✅ NEU: Mindmap-Konfiguration
  mindmapConfigType: {
    type: String,
    default: null,
    validator: (value) => !value || ['god', 'kaiser', 'zone', 'esp'].includes(value),
  },
  mindmapConfigData: {
    type: Object,
    default: () => ({}),
  },
})

// Emits
const emit = defineEmits(['update:modelValue', 'saved', 'cancelled'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)

// Reactive Data
const show = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const activeTab = ref('basic')
const saving = ref(false)
const error = ref(null)

// Form Data
const formData = ref({
  displayName: '',
  deviceType: props.deviceType,
  description: '',
  espId: '',
  kaiserId: '',
  zone: '',
  subzone: '',
  autoConnect: true,
  debugMode: false,
  priority: 'normal',
})

// Computed Properties
const deviceTypeOptions = computed(() => {
  const options = {
    esp: [
      { title: '🌡️ Temperatur-Controller', value: 'temp_controller' },
      { title: '💧 Bewässerungs-Controller', value: 'irrigation_controller' },
      { title: '🌱 Klima-Controller', value: 'climate_controller' },
      { title: '🔌 Allgemeiner Controller', value: 'general_controller' },
    ],
    kaiser: [
      { title: '🏠 Haus-Controller', value: 'house_controller' },
      { title: '🏭 Gewerbe-Controller', value: 'commercial_controller' },
      { title: '🌾 Landwirtschafts-Controller', value: 'agriculture_controller' },
    ],
    zone: [
      { title: '🏡 Wohnbereich', value: 'living_area' },
      { title: '🌱 Gewächshaus', value: 'greenhouse' },
      { title: '🏡 Garten', value: 'garden' },
      { title: '🏢 Büro', value: 'office' },
    ],
    mindmap: [
      { title: '🧠 God Pi', value: 'god' },
      { title: '👑 Kaiser', value: 'kaiser' },
      { title: '🗺️ Zone', value: 'zone' },
      { title: '🔌 ESP', value: 'esp' },
    ],
  }
  return options[props.deviceType] || []
})

const availableZones = computed(() => {
  const zones = ['🕳️ Unkonfiguriert']

  // Bestehende Zonen aus dem System
  if (mqttStore.value.espDevices) {
    const existingZones = new Set()
    mqttStore.value.espDevices.forEach((device) => {
      if (device.zone && device.zone !== '🕳️ Unkonfiguriert') {
        existingZones.add(device.zone)
      }
    })
    zones.push(...Array.from(existingZones))
  }

  // Neue Zone-Option
  zones.push('➕ Neue Zone erstellen...')

  return zones
})

const availablePins = computed(() => {
  if (!formData.value.espId) return []

  // Verfügbare GPIO-Pins für ESP32
  const allPins = Array.from({ length: 40 }, (_, i) => i)
  const configuredPins = configuredPins.value.map((pin) => pin.gpio)

  return allPins.filter((pin) => !configuredPins.includes(pin))
})

const configuredPins = computed(() => {
  if (!formData.value.espId) return []

  const device = mqttStore.value.espDevices.get(formData.value.espId)
  if (!device) return []

  const pins = []

  // Sensoren
  if (device.sensors) {
    device.sensors.forEach((sensor, gpio) => {
      pins.push({
        gpio: parseInt(gpio),
        type: 'sensor',
        name: sensor.name,
        sensorType: sensor.type,
      })
    })
  }

  // Aktoren
  if (device.actuators) {
    device.actuators.forEach((actuator, gpio) => {
      pins.push({
        gpio: parseInt(gpio),
        type: 'actuator',
        name: actuator.name,
        actuatorType: actuator.type,
      })
    })
  }

  return pins
})

const showAdvancedTab = computed(() => {
  return props.deviceType === 'esp' || props.deviceType === 'kaiser'
})

const priorityOptions = computed(() => [
  { title: 'Niedrig', value: 'low' },
  { title: 'Normal', value: 'normal' },
  { title: 'Hoch', value: 'high' },
  { title: 'Kritisch', value: 'critical' },
])

const isFormValid = computed(() => {
  if (!formData.value.displayName) return false

  if (props.deviceType === 'esp' && !formData.value.espId) return false
  if (props.deviceType === 'kaiser' && !formData.value.kaiserId) return false

  return true
})

// Methods
const getDialogTitle = () => {
  const titles = {
    esp: 'Feldgerät einrichten',
    kaiser: 'Edge Controller einrichten',
    zone: 'Zone erstellen',
  }
  return titles[props.deviceType] || 'Gerät konfigurieren'
}

const getDialogIcon = () => {
  const icons = {
    esp: 'mdi-memory',
    kaiser: 'mdi-crown',
    zone: 'mdi-map-marker',
  }
  return icons[props.deviceType] || 'mdi-cog'
}

const getZoneDeviceCount = (zoneName) => {
  if (!mqttStore.value.espDevices) return 0

  let count = 0
  mqttStore.value.espDevices.forEach((device) => {
    if (device.zone === zoneName) count++
  })
  return count
}

const handlePinAssignment = (pinData) => {
  console.log('Pin assigned:', pinData)
  // Pin-Zuordnung wird über PinDragDropZone gehandhabt
}

const handlePinRemoval = (pinData) => {
  console.log('Pin removed:', pinData)
  // Pin-Entfernung wird über PinDragDropZone gehandhabt
}

const save = async () => {
  if (!isFormValid.value) {
    safeError('Bitte füllen Sie alle erforderlichen Felder aus')
    return
  }

  saving.value = true
  error.value = null

  try {
    // Device-spezifische Speicherlogik
    if (props.deviceType === 'esp') {
      await saveEspDevice()
    } else if (props.deviceType === 'kaiser') {
      await saveKaiserDevice()
    } else if (props.deviceType === 'zone') {
      await saveZone()
    }

    safeSuccess('Gerät erfolgreich gespeichert')
    emit('saved', formData.value)
    show.value = false
  } catch (err) {
    console.error('Save error:', err)
    error.value = err.message
    safeError(`Fehler beim Speichern: ${err.message}`)
  } finally {
    saving.value = false
  }
}

const saveEspDevice = async () => {
  // ESP-spezifische Speicherlogik
  const deviceConfig = {
    espId: formData.value.espId,
    displayName: formData.value.displayName,
    description: formData.value.description,
    deviceType: formData.value.deviceType,
    zone: formData.value.zone,
    subzone: formData.value.subzone,
    autoConnect: formData.value.autoConnect,
    debugMode: formData.value.debugMode,
    priority: formData.value.priority,
  }

  // Über MQTT Store speichern
  await mqttStore.value.updateEspConfig(deviceConfig)
}

const saveKaiserDevice = async () => {
  // Kaiser-spezifische Speicherlogik
  const kaiserConfig = {
    kaiserId: formData.value.kaiserId,
    displayName: formData.value.displayName,
    description: formData.value.description,
    deviceType: formData.value.deviceType,
    autoConnect: formData.value.autoConnect,
    debugMode: formData.value.debugMode,
    priority: formData.value.priority,
  }

  // Über MQTT Store speichern
  await mqttStore.value.updateKaiserConfig(kaiserConfig)
}

const saveZone = async () => {
  // Zone-spezifische Speicherlogik
  const zoneConfig = {
    name: formData.value.displayName,
    description: formData.value.description,
    deviceType: formData.value.deviceType,
  }

  // Über Central Config speichern
  await centralConfig.value.addZone(zoneConfig)
}

const cancel = () => {
  emit('cancelled')
  show.value = false
}

// Initialize form data when dialog opens
watch(show, (newValue) => {
  if (newValue && props.initialData) {
    formData.value = { ...formData.value, ...props.initialData }
  }
})

// Initialize when deviceId changes
watch(
  () => props.deviceId,
  (newId) => {
    if (newId && props.deviceType === 'esp') {
      formData.value.espId = newId
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.basic-settings,
.pin-configuration,
.zone-assignment,
.advanced-settings {
  max-height: 500px;
  overflow-y: auto;
}

.zone-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.zone-info {
  font-size: 0.875rem;
}

.zone-stats {
  display: flex;
  gap: 8px;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .zone-preview {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
