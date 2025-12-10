<template>
  <div class="actuator-configuration">
    <!-- Aktor-Übersicht -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-lightning-bolt" class="mr-2" color="warning" />
        Aktor-Konfiguration
        <v-chip size="small" color="warning" variant="tonal" class="ml-2">
          {{ actuators.length }} konfiguriert
        </v-chip>
        <v-spacer />
        <v-btn
          icon="mdi-download"
          size="small"
          variant="text"
          @click="exportActuators"
          :disabled="actuators.length === 0"
        >
          <HelpfulHints
            :use-tooltip-mode="true"
            tooltip-text="Exportiert alle Aktoren als JSON-Datei"
            tooltip-title="Aktoren exportieren"
          />
        </v-btn>
        <v-btn icon="mdi-upload" size="small" variant="text" @click="importActuators">
          <HelpfulHints
            :use-tooltip-mode="true"
            tooltip-text="Importiert Aktoren aus JSON-Datei"
            tooltip-title="Aktoren importieren"
          />
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Bestehende Aktoren -->
        <div v-if="actuators.length > 0" class="mb-4">
          <div class="d-flex align-center mb-3">
            <v-icon icon="mdi-cog" size="small" class="mr-2" />
            <span class="text-subtitle-2">Konfigurierte Aktoren</span>
          </div>

          <v-list density="compact">
            <v-list-item
              v-for="actuator in actuators"
              :key="`actuator-${actuator.gpio}`"
              class="mb-2"
            >
              <template #prepend>
                <div class="d-flex align-center">
                  <v-icon :icon="getActuatorIcon(actuator.type)" color="warning" />
                  <!-- ✅ NEU: Status-Indikator für Bestätigung -->
                  <v-icon
                    v-if="actuator.pendingState !== undefined"
                    icon="mdi-sync"
                    size="small"
                    color="info"
                    class="ml-1"
                  />
                  <v-icon
                    v-else-if="actuator.confirmedState !== actuator.desiredState"
                    icon="mdi-alert"
                    size="small"
                    color="error"
                    class="ml-1"
                  />
                </div>
              </template>

              <v-list-item-title>{{ actuator.name }}</v-list-item-title>
              <v-list-item-subtitle>
                GPIO {{ actuator.gpio }} • {{ getActuatorTypeLabel(actuator.type) }}
                <span v-if="actuator.subzoneId" class="ml-2">
                  • Zone: {{ actuator.subzoneId }}
                </span>
                <!-- ✅ NEU: Status-Anzeige -->
                <span class="ml-2">
                  <v-chip :color="getActuatorStatusColor(actuator)" size="x-small" variant="tonal">
                    {{ getActuatorStatusText(actuator) }}
                  </v-chip>
                </span>
              </v-list-item-subtitle>

              <template #append>
                <v-btn
                  icon="mdi-pencil"
                  variant="text"
                  size="small"
                  @click="editActuator(actuator)"
                />
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  size="small"
                  color="error"
                  @click="removeActuator(actuator.gpio)"
                />
              </template>
            </v-list-item>
          </v-list>
        </div>

        <!-- Neuen Aktor hinzufügen -->
        <v-expansion-panels>
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon icon="mdi-plus" class="mr-2" />
              Neuen Aktor hinzufügen
            </v-expansion-panel-title>

            <v-expansion-panel-text>
              <v-form ref="actuatorForm" v-model="formValid">
                <v-row>
                  <v-col cols="12" md="4">
                    <v-select
                      v-model="newActuator.type"
                      :items="actuatorTypes"
                      label="Aktor-Typ"
                      item-title="label"
                      item-value="value"
                      variant="outlined"
                      density="comfortable"
                      required
                      :rules="[(v) => !!v || 'Aktor-Typ erforderlich']"
                    />
                  </v-col>

                  <v-col cols="12" md="4">
                    <v-text-field
                      v-model.number="newActuator.gpio"
                      label="GPIO Pin"
                      type="number"
                      :items="availablePins"
                      variant="outlined"
                      density="comfortable"
                      required
                      :rules="[
                        (v) => !!v || 'GPIO erforderlich',
                        (v) => availablePins.includes(v) || 'Ungültiger GPIO',
                        (v) => !isGpioConflict(v) || 'GPIO bereits verwendet',
                      ]"
                      :error-messages="getGpioConflictMessage(newActuator.gpio)"
                    />
                  </v-col>

                  <v-col cols="12" md="4">
                    <v-text-field
                      v-model="newActuator.name"
                      label="Aktor-Name"
                      placeholder="z.B. Pumpe 1"
                      variant="outlined"
                      density="comfortable"
                      required
                      :rules="[(v) => !!v || 'Name erforderlich']"
                    />
                  </v-col>
                </v-row>

                <v-row>
                  <v-col cols="12" md="6">
                    <v-select
                      v-model="newActuator.subzoneId"
                      :items="availableSubzones"
                      label="Subzone (optional)"
                      item-title="name"
                      item-value="id"
                      variant="outlined"
                      density="comfortable"
                      clearable
                    />
                  </v-col>

                  <v-col cols="12" md="6" class="d-flex align-center">
                    <v-btn
                      color="success"
                      @click="addActuator"
                      :loading="addingActuator"
                      :disabled="!formValid || isGpioConflict(newActuator.gpio)"
                      variant="tonal"
                      class="mr-2"
                    >
                      Aktor hinzufügen
                    </v-btn>

                    <v-btn @click="resetForm" variant="text" :disabled="addingActuator">
                      Zurücksetzen
                    </v-btn>
                  </v-col>
                </v-row>
              </v-form>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>

    <!-- ✅ NEU: Bulk-Konfiguration -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-format-list-bulleted" class="mr-2" color="info" />
        Bulk-Konfiguration
        <v-chip size="small" color="info" variant="tonal" class="ml-2"> Massenoperationen </v-chip>
      </v-card-title>

      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="bulkConfig.type"
              :items="actuatorTypes"
              label="Aktor-Typ für alle"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="bulkConfig.namePrefix"
              label="Name-Präfix"
              placeholder="z.B. Relais"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="4">
            <v-text-field
              v-model.number="bulkConfig.startGpio"
              label="Start GPIO"
              type="number"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model.number="bulkConfig.count"
              label="Anzahl"
              type="number"
              min="1"
              max="10"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="4" class="d-flex align-center">
            <v-btn
              color="info"
              @click="addBulkActuators"
              :loading="addingBulkActuators"
              :disabled="!isBulkConfigValid"
              variant="tonal"
            >
              {{ bulkConfig.count || 0 }} Aktoren hinzufügen
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Drag & Drop Zone -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-drag" class="mr-2" color="info" />
        Drag & Drop Konfiguration
        <v-chip size="small" color="info" variant="tonal" class="ml-2"> Experimentell </v-chip>
      </v-card-title>

      <v-card-text>
        <div
          class="drop-zone"
          :class="{ 'drop-active': isDragOver }"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <div class="text-center py-8">
            <v-icon icon="mdi-cloud-upload" size="64" color="grey-lighten-1" class="mb-4" />
            <h3 class="text-h6 text-grey mb-2">Aktor-Konfiguration hierher ziehen</h3>
            <p class="text-body-2 text-grey-darken-1">
              Ziehen Sie eine Aktor-Konfiguration hierher, um sie automatisch zu importieren
            </p>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- ✅ NEU: Versteckter File Input für Import -->
    <input
      ref="fileInput"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleFileImport"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import HelpfulHints from '@/components/common/HelpfulHints.vue'

const props = defineProps({
  espId: { type: String, required: true },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['actuator-change'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const systemCommands = computed(() => centralDataHub.systemCommands)
const centralConfig = computed(() => centralDataHub.centralConfig)

// Reactive Data
const actuatorForm = ref(null)
const fileInput = ref(null)
const formValid = ref(false)
const addingActuator = ref(false)
const addingBulkActuators = ref(false)
const isDragOver = ref(false)

// Neue Aktor-Konfiguration
const newActuator = ref({
  type: '',
  gpio: null,
  name: '',
  subzoneId: null,
})

// ✅ NEU: Bulk-Konfiguration
const bulkConfig = ref({
  type: '',
  namePrefix: '',
  startGpio: null,
  count: 1,
})

// Computed Properties
const actuators = computed(() => {
  const device = mqttStore.value.espDevices.get(props.espId)
  return device?.actuators ? Array.from(device.actuators.values()) : []
})

const availablePins = computed(() => {
  const device = mqttStore.value.espDevices.get(props.espId)
  const boardType = device?.board_type || device?.boardType || 'ESP32_DEVKIT'

  // ✅ BESTEHEND: Nutze vorhandene Pin-Konfiguration
  if (boardType === 'ESP32_C3_XIAO') {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21]
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21]
})

// ✅ NEU: Verwendete Pins (Sensoren + Aktoren)
const usedPins = computed(() => {
  const device = mqttStore.value.espDevices.get(props.espId)
  const sensorPins = device?.sensors ? Array.from(device.sensors.values()).map((s) => s.gpio) : []
  const actuatorPins = actuators.value.map((a) => a.gpio)
  return [...sensorPins, ...actuatorPins]
})

const availableSubzones = computed(() => {
  const device = mqttStore.value.espDevices.get(props.espId)
  const zone = device?.zone
  if (!zone) return []

  // ✅ BESTEHEND: Nutze vorhandene Zone-Struktur
  return centralConfig.value.getSubzonesForZone(zone) || []
})

// ✅ NEU: Bulk-Konfiguration Validierung
const isBulkConfigValid = computed(() => {
  return (
    bulkConfig.value.type &&
    bulkConfig.value.namePrefix &&
    bulkConfig.value.startGpio &&
    bulkConfig.value.count > 0 &&
    bulkConfig.value.count <= 10
  )
})

// ✅ BESTEHEND: Nutze vorhandene Aktor-Typen
const actuatorTypes = [
  { label: 'Relais', value: 'ACTUATOR_RELAY', icon: 'mdi-power' },
  { label: 'Pumpe', value: 'ACTUATOR_PUMP', icon: 'mdi-pump' },
  { label: 'Ventil', value: 'ACTUATOR_VALVE', icon: 'mdi-valve' },
  { label: 'LED', value: 'ACTUATOR_LED', icon: 'mdi-lightbulb' },
  { label: 'Motor', value: 'ACTUATOR_MOTOR', icon: 'mdi-engine' },
  { label: 'Heizung', value: 'ACTUATOR_HEATER', icon: 'mdi-fire' },
  { label: 'Lüfter', value: 'ACTUATOR_FAN', icon: 'mdi-fan' },
  { label: 'Befeuchter', value: 'ACTUATOR_HUMIDIFIER', icon: 'mdi-air-humidifier' },
]

// Methods
const getActuatorIcon = (type) => {
  const actuatorType = actuatorTypes.find((t) => t.value === type)
  return actuatorType?.icon || 'mdi-power'
}

const getActuatorTypeLabel = (type) => {
  const actuatorType = actuatorTypes.find((t) => t.value === type)
  return actuatorType?.label || type
}

// ✅ NEU: GPIO-Konflikt-Erkennung
const isGpioConflict = (gpio) => {
  return usedPins.value.includes(gpio)
}

const getGpioConflictMessage = (gpio) => {
  if (!gpio) return ''
  if (isGpioConflict(gpio)) {
    return 'GPIO bereits für Sensor oder Aktor verwendet'
  }
  return ''
}

// ✅ NEU: Aktor-Status-Logik
const getActuatorStatusColor = (actuator) => {
  if (actuator.pendingState !== undefined) return 'info'
  if (actuator.confirmedState !== actuator.desiredState) return 'error'
  if (actuator.confirmedState) return 'success'
  return 'grey'
}

const getActuatorStatusText = (actuator) => {
  if (actuator.pendingState !== undefined) return 'Wird geschaltet...'
  if (actuator.confirmedState !== actuator.desiredState) return 'Nicht bestätigt'
  if (actuator.confirmedState) return 'Aktiv'
  return 'Inaktiv'
}

const addActuator = async () => {
  if (!formValid.value || isGpioConflict(newActuator.value.gpio)) return

  addingActuator.value = true
  try {
    // ✅ BESTEHEND: Nutze vorhandenes System-Command
    await systemCommands.value.configureActuator(
      props.espId,
      newActuator.value.gpio,
      newActuator.value.type,
      newActuator.value.name,
      newActuator.value.subzoneId,
    )

    emit('actuator-change', {
      type: 'add',
      actuator: newActuator.value,
    })

    resetForm()
    window.$snackbar?.showSuccess('Aktor erfolgreich hinzugefügt')
  } catch (error) {
    console.error('Failed to add actuator:', error)
    window.$snackbar?.showError(`Fehler beim Hinzufügen: ${error.message}`)
  } finally {
    addingActuator.value = false
  }
}

// ✅ NEU: Bulk-Aktoren hinzufügen
const addBulkActuators = async () => {
  if (!isBulkConfigValid.value) return

  addingBulkActuators.value = true
  try {
    const promises = []

    for (let i = 0; i < bulkConfig.value.count; i++) {
      const gpio = bulkConfig.value.startGpio + i

      // Prüfe GPIO-Konflikt
      if (isGpioConflict(gpio)) {
        window.$snackbar?.showWarning(`GPIO ${gpio} übersprungen (bereits verwendet)`)
        continue
      }

      const actuator = {
        type: bulkConfig.value.type,
        gpio: gpio,
        name: `${bulkConfig.value.namePrefix} ${i + 1}`,
        subzoneId: null,
      }

      promises.push(
        systemCommands.value.configureActuator(
          props.espId,
          actuator.gpio,
          actuator.type,
          actuator.name,
          actuator.subzoneId,
        ),
      )
    }

    await Promise.all(promises)

    emit('actuator-change', {
      type: 'bulk-add',
      count: bulkConfig.value.count,
    })

    resetBulkConfig()
    window.$snackbar?.showSuccess(`${bulkConfig.value.count} Aktoren erfolgreich hinzugefügt`)
  } catch (error) {
    console.error('Failed to add bulk actuators:', error)
    window.$snackbar?.showError(`Fehler beim Hinzufügen: ${error.message}`)
  } finally {
    addingBulkActuators.value = false
  }
}

const removeActuator = async (gpio) => {
  try {
    // ✅ BESTEHEND: Nutze vorhandenes System-Command
    await systemCommands.value.sendCommand(props.espId, 'remove_actuator', { gpio })

    emit('actuator-change', {
      type: 'remove',
      gpio,
    })

    window.$snackbar?.showSuccess('Aktor erfolgreich entfernt')
  } catch (error) {
    console.error('Failed to remove actuator:', error)
    window.$snackbar?.showError(`Fehler beim Entfernen: ${error.message}`)
  }
}

const editActuator = (actuator) => {
  newActuator.value = { ...actuator }
  // Öffne das Expansion Panel
}

const resetForm = () => {
  newActuator.value = {
    type: '',
    gpio: null,
    name: '',
    subzoneId: null,
  }
  actuatorForm.value?.resetValidation()
}

// ✅ NEU: Bulk-Konfiguration zurücksetzen
const resetBulkConfig = () => {
  bulkConfig.value = {
    type: '',
    namePrefix: '',
    startGpio: null,
    count: 1,
  }
}

// ✅ NEU: Export-Funktionalität
const exportActuators = () => {
  const exportData = {
    espId: props.espId,
    timestamp: new Date().toISOString(),
    actuators: actuators.value.map((actuator) => ({
      type: actuator.type,
      gpio: actuator.gpio,
      name: actuator.name,
      subzoneId: actuator.subzoneId,
    })),
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `actuators_${props.espId}_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  window.$snackbar?.showSuccess('Aktoren erfolgreich exportiert')
}

// ✅ NEU: Import-Funktionalität
const importActuators = () => {
  fileInput.value?.click()
}

const handleFileImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  try {
    const text = await file.text()
    const importData = JSON.parse(text)

    if (!importData.actuators || !Array.isArray(importData.actuators)) {
      throw new Error('Ungültiges Dateiformat')
    }

    // Bestätigungsdialog
    const confirmed = confirm(
      `Möchten Sie ${importData.actuators.length} Aktoren importieren?\n` +
        'Bestehende Aktoren werden nicht überschrieben.',
    )

    if (!confirmed) return

    const promises = []
    let successCount = 0

    for (const actuator of importData.actuators) {
      // Prüfe GPIO-Konflikt
      if (isGpioConflict(actuator.gpio)) {
        console.warn(`GPIO ${actuator.gpio} übersprungen (bereits verwendet)`)
        continue
      }

      promises.push(
        systemCommands.value
          .configureActuator(
            props.espId,
            actuator.gpio,
            actuator.type,
            actuator.name,
            actuator.subzoneId,
          )
          .then(() => successCount++),
      )
    }

    await Promise.all(promises)

    emit('actuator-change', {
      type: 'import',
      count: successCount,
    })

    window.$snackbar?.showSuccess(`${successCount} Aktoren erfolgreich importiert`)
  } catch (error) {
    console.error('Failed to import actuators:', error)
    window.$snackbar?.showError(`Fehler beim Import: ${error.message}`)
  } finally {
    // Reset file input
    event.target.value = ''
  }
}

// Drag & Drop Handlers
const handleDragOver = (event) => {
  isDragOver.value = true
  event.dataTransfer.dropEffect = 'copy'
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = (event) => {
  isDragOver.value = false

  try {
    const data = JSON.parse(event.dataTransfer.getData('application/json'))
    if (data.type === 'actuator') {
      newActuator.value = {
        type: data.actuatorType,
        gpio: data.gpio,
        name: data.name,
        subzoneId: data.subzoneId,
      }
      window.$snackbar?.showSuccess('Aktor-Konfiguration importiert')
    } else if (data.actuators && Array.isArray(data.actuators)) {
      // Bulk-Import über Drag & Drop
      const promises = []
      let successCount = 0

      for (const actuator of data.actuators) {
        if (isGpioConflict(actuator.gpio)) continue

        promises.push(
          systemCommands.value
            .configureActuator(
              props.espId,
              actuator.gpio,
              actuator.type,
              actuator.name,
              actuator.subzoneId,
            )
            .then(() => successCount++),
        )
      }

      Promise.all(promises).then(() => {
        emit('actuator-change', {
          type: 'import',
          count: successCount,
        })
        window.$snackbar?.showSuccess(`${successCount} Aktoren importiert`)
      })
    }
  } catch (error) {
    console.error('Failed to parse dropped data:', error)
    window.$snackbar?.showError('Ungültige Aktor-Konfiguration')
  }
}
</script>

<style scoped>
.drop-zone {
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  transition: all 0.3s ease;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone.drop-active {
  border-color: #1976d2;
  background-color: rgba(25, 118, 210, 0.05);
}

.drop-zone:hover {
  border-color: #1976d2;
  background-color: rgba(25, 118, 210, 0.02);
}
</style>
