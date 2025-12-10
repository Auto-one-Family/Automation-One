<template>
  <div class="sensor-configuration">
    <v-alert type="info" variant="tonal" class="mb-4">
      <strong>Sensoren verwalten:</strong>
      Hier können Sie die konfigurierten Sensoren und Aktoren für dieses ESP-Gerät verwalten.
    </v-alert>

    <!-- Sensor Overview -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Konfigurierte Sensoren & Aktoren</span>
        <v-chip :color="getOverallStatusColor()" size="small" variant="tonal">
          {{ sensors.length + actuators.length }} Geräte
        </v-chip>
      </v-card-title>
      <v-card-text>
        <div v-if="sensors.length === 0 && actuators.length === 0" class="text-center py-4">
          <v-icon icon="mdi-thermometer-off" size="48" color="grey-lighten-1" />
          <p class="text-grey mt-2">Keine Sensoren oder Aktoren konfiguriert</p>
          <p class="text-caption text-grey">
            Gehen Sie zum Tab "Pin-Konfiguration" um Sensoren hinzuzufügen
          </p>
        </div>

        <!-- Sensors -->
        <div v-if="sensors.length > 0" class="mb-4">
          <h5 class="text-subtitle-1 mb-3">
            <v-icon icon="mdi-thermometer" class="mr-2" color="info" />
            Sensoren ({{ sensors.length }})
          </h5>
          <v-list>
            <v-list-item
              v-for="sensor in sensors"
              :key="sensor.id"
              :class="{ 'sensor-error': sensor.error }"
            >
              <template #prepend>
                <v-icon
                  :icon="getSensorIcon(sensor.type)"
                  :color="sensor.active ? 'success' : 'grey'"
                />
              </template>
              <v-list-item-title>{{ sensor.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ getSensorTypeName(sensor.type) }} | Pin {{ sensor.pin }} | {{ sensor.subzone }}
              </v-list-item-subtitle>
              <template #append>
                <v-switch
                  v-model="sensor.active"
                  @change="toggleSensor(sensor)"
                  :loading="sensor.updating"
                  density="compact"
                />
                <v-btn icon="mdi-pencil" size="small" variant="text" @click="editSensor(sensor)" />
                <v-btn
                  icon="mdi-delete"
                  size="small"
                  variant="text"
                  color="error"
                  @click="removeSensor(sensor)"
                />
              </template>
            </v-list-item>
          </v-list>
        </div>

        <!-- Actuators -->
        <div v-if="actuators.length > 0">
          <h5 class="text-subtitle-1 mb-3">
            <v-icon icon="mdi-cog" class="mr-2" color="warning" />
            Aktoren ({{ actuators.length }})
          </h5>
          <v-list>
            <v-list-item
              v-for="actuator in actuators"
              :key="actuator.id"
              :class="{ 'actuator-error': actuator.error }"
            >
              <template #prepend>
                <v-icon
                  :icon="getActuatorIcon(actuator.type)"
                  :color="actuator.active ? 'success' : 'grey'"
                />
              </template>
              <v-list-item-title>{{ actuator.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ getActuatorTypeName(actuator.type) }} | Pin {{ actuator.pin }} |
                {{ actuator.subzone }}
              </v-list-item-subtitle>
              <template #append>
                <v-switch
                  v-model="actuator.active"
                  @change="toggleActuator(actuator)"
                  :loading="actuator.updating"
                  density="compact"
                />
                <v-btn
                  icon="mdi-pencil"
                  size="small"
                  variant="text"
                  @click="editActuator(actuator)"
                />
                <v-btn
                  icon="mdi-delete"
                  size="small"
                  variant="text"
                  color="error"
                  @click="removeActuator(actuator)"
                />
              </template>
            </v-list-item>
          </v-list>
        </div>
      </v-card-text>
    </v-card>

    <!-- Sensor Statistics -->
    <v-card v-if="sensors.length > 0" variant="outlined">
      <v-card-title>
        <v-icon icon="mdi-chart-line" class="mr-2" />
        Sensor-Statistiken
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="4">
            <v-card variant="tonal" class="pa-3 text-center">
              <v-icon icon="mdi-thermometer" size="32" color="info" class="mb-2" />
              <div class="text-h6">{{ activeSensorsCount }}</div>
              <div class="text-caption">Aktive Sensoren</div>
            </v-card>
          </v-col>
          <v-col cols="12" md="4">
            <v-card variant="tonal" class="pa-3 text-center">
              <v-icon icon="mdi-clock" size="32" color="warning" class="mb-2" />
              <div class="text-h6">{{ lastReadingTime }}</div>
              <div class="text-caption">Letzte Messung</div>
            </v-card>
          </v-col>
          <v-col cols="12" md="4">
            <v-card variant="tonal" class="pa-3 text-center">
              <v-icon icon="mdi-alert" size="32" color="error" class="mb-2" />
              <div class="text-h6">{{ errorCount }}</div>
              <div class="text-caption">Fehler</div>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Edit Sensor Dialog -->
    <v-dialog v-model="showEditDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-pencil" class="mr-2" color="primary" />
          {{ editingItem?.type?.startsWith('SENSOR') ? 'Sensor' : 'Aktor' }} bearbeiten
        </v-card-title>
        <v-card-text>
          <v-form ref="editForm" v-model="editFormValid">
            <v-text-field
              v-model="editingItem.name"
              label="Name"
              variant="outlined"
              density="comfortable"
              required
              :rules="[(v) => !!v || 'Name ist erforderlich']"
            />
            <v-select
              v-model="editingItem.subzoneId"
              label="Subzone"
              :items="subzoneOptions"
              item-title="name"
              item-value="id"
              variant="outlined"
              density="comfortable"
              required
              :rules="[(v) => !!v || 'Subzone ist erforderlich']"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showEditDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveEdit" :loading="savingEdit" :disabled="!editFormValid">
            Speichern
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

// Props
const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
})

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive Data
const showEditDialog = ref(false)
const editingItem = ref(null)
const savingEdit = ref(false)
const editForm = ref(null)
const editFormValid = ref(false)

// Computed Properties
const deviceInfo = computed(() => {
  return mqttStore.value.espDevices.get(props.espId) || {}
})

const sensors = computed(() => {
  const pins = deviceInfo.value.pins || {}
  return Object.entries(pins)
    .filter(([, config]) => config.type?.startsWith('SENSOR'))
    .map(([pin, config]) => ({
      id: `sensor_${pin}`,
      pin: parseInt(pin),
      ...config,
      updating: false,
    }))
})

const actuators = computed(() => {
  const pins = deviceInfo.value.pins || {}
  return Object.entries(pins)
    .filter(([, config]) => config.type?.startsWith('AKTOR'))
    .map(([pin, config]) => ({
      id: `actuator_${pin}`,
      pin: parseInt(pin),
      ...config,
      updating: false,
    }))
})

const subzoneOptions = computed(() => {
  const subzones = deviceInfo.value.subzones || []
  return subzones.map((subzone) => ({
    id: subzone.id,
    name: subzone.name,
  }))
})

const activeSensorsCount = computed(() => {
  return sensors.value.filter((sensor) => sensor.active).length
})

const lastReadingTime = computed(() => {
  const lastReading = deviceInfo.value.lastSensorReading
  if (!lastReading) return 'Nie'

  const date = new Date(lastReading)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Gerade eben'
  if (diffMins < 60) return `${diffMins} Min`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} Std`
  return `${Math.floor(diffMins / 1440)} Tage`
})

const errorCount = computed(() => {
  return (
    sensors.value.filter((sensor) => sensor.error).length +
    actuators.value.filter((actuator) => actuator.error).length
  )
})

const getOverallStatusColor = () => {
  if (errorCount.value > 0) return 'error'
  if (activeSensorsCount.value === sensors.value.length) return 'success'
  return 'warning'
}

// Methods
const getSensorIcon = (type) => {
  const icons = {
    SENSOR_TEMP_DS18B20: 'mdi-thermometer',
    SENSOR_SOIL: 'mdi-water-percent',
    SENSOR_FLOW: 'mdi-water',
    SENSOR_HUMIDITY: 'mdi-water-percent',
    SENSOR_PRESSURE: 'mdi-gauge',
    SENSOR_LIGHT: 'mdi-white-balance-sunny',
  }
  return icons[type] || 'mdi-thermometer'
}

const getActuatorIcon = (type) => {
  const icons = {
    AKTOR_RELAIS: 'mdi-switch',
    AKTOR_PUMP: 'mdi-pump',
    AKTOR_VALVE: 'mdi-valve',
    AKTOR_HUMIDIFIER: 'mdi-water',
    AKTOR_FAN: 'mdi-fan',
    AKTOR_LIGHT: 'mdi-lightbulb',
  }
  return icons[type] || 'mdi-cog'
}

const getSensorTypeName = (type) => {
  const names = {
    SENSOR_TEMP_DS18B20: 'Temperatursensor',
    SENSOR_SOIL: 'Bodensensor',
    SENSOR_FLOW: 'Durchflusssensor',
    SENSOR_HUMIDITY: 'Feuchtigkeitssensor',
    SENSOR_PRESSURE: 'Drucksensor',
    SENSOR_LIGHT: 'Lichtsensor',
  }
  return names[type] || type
}

const getActuatorTypeName = (type) => {
  const names = {
    AKTOR_RELAIS: 'Relais',
    AKTOR_PUMP: 'Pumpe',
    AKTOR_VALVE: 'Ventil',
    AKTOR_HUMIDIFIER: 'Befeuchter',
    AKTOR_FAN: 'Ventilator',
    AKTOR_LIGHT: 'Beleuchtung',
  }
  return names[type] || type
}

const toggleSensor = async (sensor) => {
  sensor.updating = true
  try {
    const config = {
      espId: props.espId,
      pin: sensor.pin,
      active: sensor.active,
    }

    await mqttStore.value.publishSensorConfig(config)
    window.$snackbar?.showSuccess(`Sensor ${sensor.active ? 'aktiviert' : 'deaktiviert'}`)
  } catch (error) {
    sensor.active = !sensor.active // Revert
    window.$snackbar?.showError('Fehler beim Umschalten')
    console.error('Toggle sensor error:', error)
  } finally {
    sensor.updating = false
  }
}

const toggleActuator = async (actuator) => {
  actuator.updating = true
  try {
    const config = {
      espId: props.espId,
      pin: actuator.pin,
      active: actuator.active,
    }

    await mqttStore.value.publishActuatorConfig(config)
    window.$snackbar?.showSuccess(`Aktor ${actuator.active ? 'aktiviert' : 'deaktiviert'}`)
  } catch (error) {
    actuator.active = !actuator.active // Revert
    window.$snackbar?.showError('Fehler beim Umschalten')
    console.error('Toggle actuator error:', error)
  } finally {
    actuator.updating = false
  }
}

const editSensor = (sensor) => {
  editingItem.value = { ...sensor }
  showEditDialog.value = true
}

const editActuator = (actuator) => {
  editingItem.value = { ...actuator }
  showEditDialog.value = true
}

const saveEdit = async () => {
  if (!editForm.value?.validate()) return

  savingEdit.value = true
  try {
    const config = {
      espId: props.espId,
      pin: editingItem.value.pin,
      name: editingItem.value.name,
      subzoneId: editingItem.value.subzoneId,
    }

    if (editingItem.value.type?.startsWith('SENSOR')) {
      await mqttStore.value.publishSensorConfig(config)
    } else {
      await mqttStore.value.publishActuatorConfig(config)
    }

    window.$snackbar?.showSuccess('Änderungen gespeichert')
    showEditDialog.value = false
  } catch (error) {
    window.$snackbar?.showError('Fehler beim Speichern')
    console.error('Save edit error:', error)
  } finally {
    savingEdit.value = false
  }
}

const removeSensor = async (sensor) => {
  if (!confirm(`Sensor "${sensor.name}" wirklich entfernen?`)) return

  try {
    const config = {
      espId: props.espId,
      pin: sensor.pin,
      action: 'remove',
    }

    await mqttStore.value.publishSensorConfig(config)
    window.$snackbar?.showSuccess('Sensor entfernt')
  } catch (error) {
    window.$snackbar?.showError('Fehler beim Entfernen')
    console.error('Remove sensor error:', error)
  }
}

const removeActuator = async (actuator) => {
  if (!confirm(`Aktor "${actuator.name}" wirklich entfernen?`)) return

  try {
    const config = {
      espId: props.espId,
      pin: actuator.pin,
      action: 'remove',
    }

    await mqttStore.value.publishActuatorConfig(config)
    window.$snackbar?.showSuccess('Aktor entfernt')
  } catch (error) {
    window.$snackbar?.showError('Fehler beim Entfernen')
    console.error('Remove actuator error:', error)
  }
}

// Watch for dialog close
watch(showEditDialog, (newValue) => {
  if (!newValue) {
    editingItem.value = null
  }
})
</script>

<style scoped>
.sensor-configuration {
  width: 100%;
}

.sensor-error,
.actuator-error {
  background: rgba(var(--v-theme-error), 0.05);
  border-left: 4px solid rgb(var(--v-theme-error));
}

.v-list-item {
  border-radius: 8px;
  margin-bottom: 4px;
}

.v-list-item:hover {
  background: rgba(var(--v-theme-primary), 0.05);
}
</style>
