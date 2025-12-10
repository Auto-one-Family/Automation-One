<template>
  <div class="device-tree-view">
    <!-- Global Filter Section -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-filter" class="mr-2" />
        Globale Filter
      </v-card-title>
      <v-card-text>
        <v-row>
          <!-- Search Bar -->
          <v-col cols="12" md="6">
            <v-text-field
              v-model="searchQuery"
              label="🔍 Suche nach ESP-Namen oder Subzonen"
              placeholder="z.B. ESP001, Tomaten, Gewächshaus..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-magnify"
              clearable
            />
          </v-col>

          <!-- Status Filter -->
          <v-col cols="12" md="6">
            <v-select
              v-model="statusFilter"
              label="🔘 Status-Filter"
              :items="statusFilterOptions"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="comfortable"
              clearable
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- ESP Selection -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-chip" class="mr-2" />
        ESP-Gerät auswählen
      </v-card-title>
      <v-card-text>
        <v-select
          v-model="selectedEspId"
          :items="filteredEspDevices"
          item-title="name"
          item-value="id"
          label="ESP-Gerät"
          variant="outlined"
          density="comfortable"
          @update:model-value="onEspChange"
        />
      </v-card-text>
    </v-card>

    <!-- Tree View für ausgewähltes ESP -->
    <v-expand-transition>
      <div v-if="selectedEspId" class="device-tree-content">
        <!-- ESP Header Card -->
        <v-card variant="elevated" class="mb-4 esp-header-card">
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-chip" color="primary" class="mr-2" />
            <span class="text-h6">{{
              selectedEspDevice?.espFriendlyName || `ESP ${selectedEspId}`
            }}</span>
            <v-spacer />
            <v-chip color="info" size="small" variant="tonal">
              {{ selectedEspDevice?.zone || 'Unkonfiguriert' }}
            </v-chip>
          </v-card-title>
        </v-card>

        <!-- Subzone Cards -->
        <div v-if="sortedSubzones.length > 0" class="subzone-section">
          <h3 class="text-h5 mb-4 d-flex align-center">
            <v-icon icon="mdi-map-marker-multiple" color="secondary" class="mr-2" />
            Subzonen
            <v-chip color="secondary" size="small" variant="tonal" class="ml-2">
              {{ sortedSubzones.length }}
            </v-chip>
          </h3>

          <v-row>
            <v-col v-for="subzone in sortedSubzones" :key="subzone.id" cols="12" md="6" lg="4">
              <SubzoneTreeCard
                :esp-id="selectedEspId"
                :subzone="subzone"
                :unconfigured-pins="unconfiguredPins"
                @edit="editSubzone"
                @delete="deleteSubzone"
                @pin-drop="handlePinDrop"
              />
            </v-col>
          </v-row>
        </div>

        <!-- Unkonfigurierte Pins -->
        <div v-if="unconfiguredPins.length > 0" class="unconfigured-pins-section mt-6">
          <h3 class="text-h5 mb-4 d-flex align-center">
            <v-icon icon="mdi-pin-off" color="warning" class="mr-2" />
            Verfügbare Pins
            <v-chip color="warning" size="small" variant="tonal" class="ml-2">
              {{ unconfiguredPins.length }}
            </v-chip>
          </h3>

          <HelpfulHints context="pinConfiguration" class="mb-4" />

          <!-- NEU: PinDragDropZone für bessere Pin-Konfiguration -->
          <PinDragDropZone
            :esp-id="selectedEspId"
            :available-pins="unconfiguredPins"
            :configured-pins="configuredPins"
            @pin-assigned="handlePinAssigned"
            @pin-removed="handlePinRemoved"
            class="mb-4"
          />

          <!-- Fallback: Alte Pin-Cards (nur wenn PinDragDropZone nicht verfügbar) -->
          <div v-if="showLegacyPinCards" class="legacy-pin-cards">
            <v-alert type="info" variant="tonal" class="mb-4">
              <strong>Pin-Konfiguration:</strong>
              Ziehen Sie Pins in Subzonen oder konfigurieren Sie sie direkt.
            </v-alert>

            <v-row>
              <v-col v-for="pin in unconfiguredPins" :key="pin" cols="12" sm="6" md="4" lg="3">
                <PinTreeCard :esp-id="selectedEspId" :pin="pin" @configure="configurePin" />
              </v-col>
            </v-row>
          </div>
        </div>
      </div>
    </v-expand-transition>

    <!-- No ESP Selected State -->
    <v-card v-if="!selectedEspId" variant="outlined" class="text-center py-12">
      <v-icon icon="mdi-chip" size="64" color="grey-lighten-1" class="mb-4" />
      <h3 class="text-h5 text-grey mb-2">Kein ESP-Gerät ausgewählt</h3>
      <p class="text-body-1 text-grey-darken-1 mb-4">
        Wählen Sie ein ESP-Gerät aus, um die Tree-Ansicht zu nutzen
      </p>
    </v-card>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useDeviceSynchronization } from '@/composables/useDeviceSynchronization'
import SubzoneTreeCard from './SubzoneTreeCard.vue'
import PinTreeCard from './PinTreeCard.vue'
import PinDragDropZone from '@/components/common/PinDragDropZone.vue'
import HelpfulHints from '@/components/common/HelpfulHints.vue'

const props = defineProps({
  espId: {
    type: String,
    default: null,
  },
})

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)
const deviceSync = useDeviceSynchronization()

// Reactive state
const selectedEspId = ref(props.espId || centralConfig.value.getSelectedEspId)
const searchQuery = ref('')
const statusFilter = ref('')
const sortMode = ref('alphabetical') // alphabetical, type, lastModified

// Computed properties
const availableEspDevices = computed(() => {
  const devices = []
  deviceSync.synchronizedEspDevices.value.forEach((device) => {
    devices.push({
      id: device.espId,
      name: `${device.espFriendlyName || `ESP ${device.espId}`} (${device.zone || 'Unkonfiguriert'})`,
      status: device.status || 'offline',
      zone: device.zone,
    })
  })
  return devices
})

const filteredEspDevices = computed(() => {
  let devices = availableEspDevices.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    devices = devices.filter(
      (device) =>
        device.name.toLowerCase().includes(query) || device.zone?.toLowerCase().includes(query),
    )
  }

  // Status filter
  if (statusFilter.value) {
    devices = devices.filter((device) => device.status === statusFilter.value)
  }

  return devices
})

const selectedEspDevice = computed(() => {
  return deviceSync.synchronizedEspDevices.value.find(
    (device) => device.espId === selectedEspId.value,
  )
})

const subzones = computed(() => {
  if (!selectedEspId.value) return []
  return deviceSync.synchronizedSubzones.value(selectedEspId.value)
})

const sortedSubzones = computed(() => {
  let sorted = [...subzones.value]

  switch (sortMode.value) {
    case 'alphabetical':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'type':
      return sorted.sort((a, b) => {
        const aHasSensors = a.sensors?.size > 0
        const bHasSensors = b.sensors?.size > 0
        const aHasActuators = a.actuators?.size > 0
        const bHasActuators = b.actuators?.size > 0

        // Sensoren zuerst, dann Aktoren, dann leer
        if (aHasSensors && !bHasSensors) return -1
        if (!aHasSensors && bHasSensors) return 1
        if (aHasActuators && !bHasActuators) return -1
        if (!aHasActuators && bHasActuators) return 1
        return a.name.localeCompare(b.name)
      })
    case 'lastModified':
      return sorted.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
    default:
      return sorted
  }
})

const unconfiguredPins = computed(() => {
  if (!selectedEspId.value) return []
  return deviceSync.availablePins.value(selectedEspId.value)
})

const configuredPins = computed(() => {
  if (!selectedEspId.value) return []
  return deviceSync.configuredPins.value(selectedEspId.value)
})

const statusFilterOptions = computed(() => [
  { label: 'Nur Online', value: 'online' },
  { label: 'Nur Offline', value: 'offline' },
  { label: 'Nur mit Fehlern', value: 'error' },
  { label: 'Nur unkonfiguriert', value: 'unconfigured' },
])

const showLegacyPinCards = computed(() => {
  // Zeige Legacy-Cards nur wenn PinDragDropZone nicht funktioniert
  return false // PinDragDropZone ist immer verfügbar
})

// Methods
const onEspChange = (espId) => {
  selectedEspId.value = espId
  // Verwende bestehende zentrale ESP-Auswahl
  centralConfig.value.setSelectedEspId(espId)
}

const editSubzone = async (subzone) => {
  try {
    // Verwende zentrale Synchronisations-API für Subzone-Bearbeitung
    const newName = prompt('Neuer Name für Subzone:', subzone.name)
    if (newName && newName !== subzone.name) {
      const result = await deviceSync.editSubzoneSynchronized(
        selectedEspId.value,
        subzone.id,
        newName,
      )

      if (result.success) {
        window.$snackbar?.showSuccess('Subzone erfolgreich umbenannt')
      } else {
        window.$snackbar?.showError(`Fehler: ${result.error}`)
      }
    }
  } catch (error) {
    console.error('Failed to edit subzone:', error)
    window.$snackbar?.showError('Fehler beim Bearbeiten der Subzone')
  }
}

const deleteSubzone = async (subzoneId) => {
  try {
    // Verwende zentrale Synchronisations-API für Subzone-Löschung
    const result = await deviceSync.deleteSubzoneSynchronized(selectedEspId.value, subzoneId)

    if (result.success) {
      window.$snackbar?.showSuccess('Subzone erfolgreich gelöscht')
    } else {
      window.$snackbar?.showError(`Fehler: ${result.error}`)
    }
  } catch (error) {
    console.error('Failed to delete subzone:', error)
    window.$snackbar?.showError('Fehler beim Löschen der Subzone')
  }
}

const configurePin = async (pinData) => {
  try {
    // Verwende zentrale Synchronisations-API
    const result = await deviceSync.configurePinSynchronized(pinData.espId, pinData)

    if (result.success) {
      window.$snackbar?.showSuccess('Pin erfolgreich konfiguriert')
    } else {
      window.$snackbar?.showError(`Fehler: ${result.error}`)
    }
  } catch (error) {
    console.error('Pin configuration failed:', error)
    window.$snackbar?.showError('Fehler bei der Pin-Konfiguration')
  }
}

const handlePinDrop = async (dropData) => {
  try {
    // Verwende zentrale Synchronisations-API für Pin-Zuweisung
    const result = await deviceSync.configurePinSynchronized(dropData.espId, {
      pin: dropData.pin,
      type: 'SENSOR_TEMP_DS18B20', // Default type, kann später geändert werden
      name: `GPIO ${dropData.pin} Sensor`,
      subzoneId: dropData.subzoneId,
    })

    if (result.success) {
      window.$snackbar?.showSuccess('Pin erfolgreich zu Subzone hinzugefügt')
    } else {
      window.$snackbar?.showError(`Fehler: ${result.error}`)
    }
  } catch (error) {
    console.error('Failed to add pin to subzone:', error)
    window.$snackbar?.showError('Fehler beim Hinzufügen des Pins')
  }
}

const handlePinAssigned = (pinData) => {
  console.log('Pin assigned via DragDropZone:', pinData)
  // Pin wurde über DragDropZone zugeordnet
  // MQTT Store wird automatisch aktualisiert
}

const handlePinRemoved = (pinData) => {
  console.log('Pin removed via DragDropZone:', pinData)
  // Pin wurde über DragDropZone entfernt
  // MQTT Store wird automatisch aktualisiert
}

// Watch for prop changes and central config changes
watch(
  () => props.espId,
  (newEspId) => {
    if (newEspId) {
      selectedEspId.value = newEspId
      centralConfig.value.setSelectedEspId(newEspId)
    }
  },
)

// Watch for central config ESP selection changes
watch(
  () => centralConfig.value.getSelectedEspId,
  (newEspId) => {
    if (newEspId && newEspId !== selectedEspId.value) {
      selectedEspId.value = newEspId
    }
  },
)

// Setup automatic synchronization
onMounted(() => {
  deviceSync.setupAutoSync()
})

// Watch for MQTT store changes to update UI
watch(
  () => mqttStore.value.espDevices,
  () => {
    // Trigger reactive updates when ESP devices change
  },
  { deep: true },
)
</script>

<style scoped>
.device-tree-view {
  max-width: 1400px;
  margin: 0 auto;
}

.esp-header-card {
  background: linear-gradient(135deg, var(--v-theme-primary) 0%, var(--v-theme-secondary) 100%);
  color: white;
}

.subzone-section {
  margin-top: 2rem;
}

.unconfigured-pins-section {
  margin-top: 2rem;
}
</style>
