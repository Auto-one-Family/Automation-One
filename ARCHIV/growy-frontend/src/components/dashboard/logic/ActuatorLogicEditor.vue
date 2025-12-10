<template>
  <div>
    <v-form @submit.prevent="saveLogic">
      <!-- Grundkonfiguration -->
      <v-row>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="logicConfig.name"
            label="Logik-Name"
            placeholder="Temperatur-Regelung"
            variant="outlined"
            density="comfortable"
            required
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="logicConfig.description"
            label="Beschreibung"
            placeholder="Regelt die Temperatur basierend auf Sensor-Daten"
            variant="outlined"
            density="comfortable"
          />
        </v-col>
      </v-row>

      <!-- Bedingungen -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-thermometer" class="mr-2" />
            Sensor-Bedingungen
            <v-chip
              v-if="hasCrossEspConditions"
              size="x-small"
              color="warning"
              variant="tonal"
              class="ml-2"
            >
              Cross-ESP
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div v-for="(condition, index) in logicConfig.conditions" :key="index" class="mb-3">
              <v-card variant="outlined" class="pa-3">
                <v-row>
                  <!-- ✅ NEU: GlobalSensorSelect verwenden -->
                  <v-col cols="12" md="6">
                    <GlobalSensorSelect
                      v-model="condition.sensorReference"
                      :current-actuator-esp-id="props.espId"
                      @update:model-value="updateConditionSensor(index, $event)"
                    />
                  </v-col>
                  <v-col cols="12" md="2">
                    <v-select
                      v-model="condition.operator"
                      label="Operator"
                      :items="operators"
                      variant="outlined"
                      density="comfortable"
                    />
                  </v-col>
                  <v-col cols="12" md="2">
                    <v-text-field
                      v-model.number="condition.threshold"
                      label="Schwellwert"
                      type="number"
                      variant="outlined"
                      density="comfortable"
                    />
                  </v-col>
                  <v-col cols="12" md="2" class="d-flex align-center">
                    <v-btn
                      color="error"
                      icon="mdi-delete"
                      variant="text"
                      @click="removeCondition(index)"
                    />
                  </v-col>
                </v-row>
              </v-card>
            </div>
            <v-btn color="primary" variant="outlined" prepend-icon="mdi-plus" @click="addCondition">
              Bedingung hinzufügen
            </v-btn>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Timer -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-clock" class="mr-2" />
            Timer-Konfiguration
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div v-for="(timer, index) in logicConfig.timers" :key="index" class="mb-3">
              <v-card variant="outlined" class="pa-3">
                <v-row>
                  <v-col cols="12" md="3">
                    <v-text-field
                      v-model="timer.name"
                      label="Timer-Name"
                      placeholder="Tages-Timer"
                      variant="outlined"
                      density="comfortable"
                    />
                  </v-col>
                  <v-col cols="12" md="2">
                    <v-text-field
                      v-model="timer.startTime"
                      label="Start"
                      type="time"
                      variant="outlined"
                      density="comfortable"
                      :error="!!getTimerValidationError(index, 'startTime')"
                      :error-messages="getTimerValidationError(index, 'startTime')"
                    />
                  </v-col>
                  <v-col cols="12" md="2">
                    <v-text-field
                      v-model="timer.endTime"
                      label="Ende"
                      type="time"
                      variant="outlined"
                      density="comfortable"
                      :error="!!getTimerValidationError(index, 'endTime')"
                      :error-messages="getTimerValidationError(index, 'endTime')"
                    />
                  </v-col>
                  <v-col cols="12" md="3">
                    <v-select
                      v-model="timer.days"
                      label="Wochentage"
                      :items="weekdays"
                      multiple
                      variant="outlined"
                      density="comfortable"
                    />
                  </v-col>
                  <v-col cols="12" md="2" class="d-flex align-center">
                    <v-btn
                      color="error"
                      icon="mdi-delete"
                      variant="text"
                      @click="removeTimer(index)"
                    />
                  </v-col>
                </v-row>
              </v-card>
            </div>
            <v-btn color="primary" variant="outlined" prepend-icon="mdi-plus" @click="addTimer">
              Timer hinzufügen
            </v-btn>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Sicherheitseinstellungen -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-shield" class="mr-2" />
            Sicherheitseinstellungen
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row>
              <v-col cols="12" md="6">
                <v-switch
                  v-model="logicConfig.failsafeEnabled"
                  label="Failsafe aktiviert"
                  color="warning"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-switch
                  v-model="logicConfig.failsafeState"
                  label="Failsafe-Zustand: Aktiv"
                  color="error"
                  :disabled="!logicConfig.failsafeEnabled"
                />
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Aktions-Buttons -->
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" @click="$emit('cancelled')"> Abbrechen </v-btn>
        <v-btn color="primary" type="submit" :loading="loading" :disabled="!isValid">
          Logik speichern
        </v-btn>
      </v-card-actions>
    </v-form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import GlobalSensorSelect from './GlobalSensorSelect.vue'
// ✅ KRITISCH: Zeit-Validierung importieren
import { validateTimeString, validateTimeRange } from '@/utils/time'

const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
  gpio: {
    type: Number,
    required: true,
  },
  actuatorType: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['saved', 'cancelled'])

const centralDataHub = useCentralDataHub()

const loading = ref(false)

// ✅ BESTEHEND: Verwende vorhandene Logic-Konfiguration
const logicConfig = ref({
  name: '',
  description: '',
  conditions: [],
  timers: [],
  events: [],
  failsafeEnabled: true,
  failsafeState: false,
  enabled: true,
})

// ✅ NEU: Cross-ESP-Bedingungen erkennen
const hasCrossEspConditions = computed(() => {
  return logicConfig.value.conditions.some(
    (condition) =>
      condition.sensorReference?.espId && condition.sensorReference.espId !== props.espId,
  )
})

// ✅ BESTEHEND: Operatoren
const operators = [
  { title: 'Größer als', value: '>' },
  { title: 'Kleiner als', value: '<' },
  { title: 'Größer gleich', value: '>=' },
  { title: 'Kleiner gleich', value: '<=' },
  { title: 'Gleich', value: '==' },
  { title: 'Ungleich', value: '!=' },
]

// ✅ BESTEHEND: Wochentage
const weekdays = [
  { title: 'Sonntag', value: 0 },
  { title: 'Montag', value: 1 },
  { title: 'Dienstag', value: 2 },
  { title: 'Mittwoch', value: 3 },
  { title: 'Donnerstag', value: 4 },
  { title: 'Freitag', value: 5 },
  { title: 'Samstag', value: 6 },
]

// ✅ BESTEHEND: Validierung
const isValid = computed(() => {
  return (
    logicConfig.value.name &&
    (logicConfig.value.conditions.length > 0 || logicConfig.value.timers.length > 0)
  )
})

// ✅ NEU: Bedingung hinzufügen mit erweitertem Format
const addCondition = () => {
  logicConfig.value.conditions.push({
    sensorReference: { espId: props.espId, gpio: null }, // ✅ NEU: sensorReference statt sensorGpio
    operator: '>',
    threshold: 0,
  })
}

// ✅ BESTEHEND: Bedingung entfernen
const removeCondition = (index) => {
  logicConfig.value.conditions.splice(index, 1)
}

// ✅ NEU: Sensor-Referenz aktualisieren
const updateConditionSensor = (index, sensorRef) => {
  logicConfig.value.conditions[index].sensorReference = sensorRef
}

// ✅ BESTEHEND: Timer hinzufügen
const addTimer = () => {
  logicConfig.value.timers.push({
    name: '',
    startTime: '08:00',
    endTime: '18:00',
    days: [1, 2, 3, 4, 5], // Montag-Freitag
    enabled: true,
  })
}

// ✅ BESTEHEND: Timer entfernen
const removeTimer = (index) => {
  logicConfig.value.timers.splice(index, 1)
}

// ✅ KRITISCH: Timer-Validierungs-Funktionen
const validateTimer = (timer, index) => {
  const startValidation = validateTimeString(timer.startTime)
  const endValidation = validateTimeString(timer.endTime)

  if (!startValidation.valid) {
    return { valid: false, error: `Timer ${index + 1} Start-Zeit: ${startValidation.error}` }
  }

  if (!endValidation.valid) {
    return { valid: false, error: `Timer ${index + 1} End-Zeit: ${endValidation.error}` }
  }

  const rangeValidation = validateTimeRange(timer.startTime, timer.endTime)
  if (!rangeValidation.valid) {
    return { valid: false, error: `Timer ${index + 1}: ${rangeValidation.error}` }
  }

  return { valid: true, error: null }
}

const validateAllTimers = () => {
  return logicConfig.value.timers.every((timer, index) => {
    const validation = validateTimer(timer, index)
    if (!validation.valid) {
      window.$snackbar?.showError(validation.error)
      return false
    }
    return true
  })
}

const getTimerValidationError = (index, field) => {
  const timer = logicConfig.value.timers[index]
  if (!timer) return null

  if (field === 'startTime') {
    const validation = validateTimeString(timer.startTime)
    return validation.error
  }

  if (field === 'endTime') {
    const validation = validateTimeString(timer.endTime)
    return validation.error
  }

  return null
}

// ✅ BESTEHEND: Logik speichern
const saveLogic = async () => {
  if (!isValid.value) {
    window.$snackbar?.showError('Bitte füllen Sie alle erforderlichen Felder aus')
    return
  }

  // ✅ KRITISCH: Timer-Validierung vor Speicherung
  if (logicConfig.value.timers.length > 0 && !validateAllTimers()) {
    return // Stoppe Speicherung bei Validierungsfehlern
  }

  loading.value = true
  try {
    // ✅ BESTEHEND: Verwende vorhandene Logic-Engine
    await centralDataHub.saveActuatorLogic(props.espId, props.gpio, logicConfig.value)

    emit('saved')
  } catch (error) {
    console.error('Failed to save logic:', error)
    window.$snackbar?.showError(`Fehler beim Speichern: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// ✅ NEU: Bestehende Konfiguration laden mit Migration
onMounted(async () => {
  const existingLogic = centralDataHub.getActuatorLogic(props.espId, props.gpio)
  if (existingLogic) {
    // ✅ NEU: Migration von altem Format zu neuem Format
    const migratedLogic = migrateLogicConfig(existingLogic, props.espId)
    logicConfig.value = { ...migratedLogic }
  } else {
    logicConfig.value.name = `Aktor-Logik GPIO ${props.gpio}`
    logicConfig.value.description = `Automatische Steuerung für ${props.actuatorType}`
  }
})

// ✅ NEU: Migration von altem zu neuem Format
const migrateLogicConfig = (oldConfig, actuatorEspId) => {
  const migrated = { ...oldConfig }

  if (migrated.conditions) {
    migrated.conditions = migrated.conditions.map((condition) => {
      if (condition.sensorGpio && !condition.sensorReference) {
        // Migration: sensorGpio → sensorReference
        return {
          ...condition,
          sensorReference: { espId: actuatorEspId, gpio: condition.sensorGpio },
          sensorGpio: undefined, // Entfernen für Rückwärtskompatibilität
        }
      }
      return condition
    })
  }

  return migrated
}
</script>
