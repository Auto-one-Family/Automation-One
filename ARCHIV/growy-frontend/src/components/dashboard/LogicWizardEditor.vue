<!-- ✅ NEU: Low-Code Logic Wizard Editor -->
<template>
  <v-dialog v-model="showWizard" max-width="900" persistent>
    <template #activator="{ props }">
      <v-btn v-bind="props" color="primary" size="large" variant="elevated">
        <v-icon icon="mdi-wizard-hat" class="mr-2" />
        Regel-Assistent
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center bg-primary text-white">
        <v-icon icon="mdi-wizard-hat" class="mr-2" />
        Einfache Regel-Erstellung
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="closeWizard" class="text-white" />
      </v-card-title>

      <v-stepper v-model="currentStep" :items="wizardSteps">
        <!-- SCHRITT 1: Aktor auswählen -->
        <template v-slot:item="{ item }">
          <v-card-text v-if="item.value === 1" class="pa-6">
            <h3 class="text-h5 mb-4">Welchen Aktor möchten Sie steuern?</h3>

            <v-row>
              <v-col v-for="actuator in availableActuators" :key="actuator.key" cols="12" md="6">
                <v-card
                  :class="{ 'border-primary': selectedActuator?.key === actuator.key }"
                  @click="selectActuator(actuator)"
                  class="cursor-pointer"
                >
                  <v-card-text>
                    <div class="d-flex align-center">
                      <v-icon :icon="actuator.icon" size="32" class="mr-3" />
                      <div>
                        <div class="text-h6">{{ actuator.name }}</div>
                        <div class="text-caption">{{ actuator.description }}</div>
                      </div>
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-card-text>

          <!-- SCHRITT 2: Bedingung auswählen -->
          <v-card-text v-if="item.value === 2" class="pa-6">
            <h3 class="text-h5 mb-4">Wann soll der Aktor aktiviert werden?</h3>

            <v-tabs v-model="conditionType" class="mb-4">
              <v-tab value="sensor">Sensor-Wert</v-tab>
              <v-tab value="timer">Zeitplan</v-tab>
              <v-tab value="manual">Manuell</v-tab>
            </v-tabs>

            <!-- Sensor-Bedingung -->
            <div v-if="conditionType === 'sensor'">
              <v-row>
                <v-col cols="12" md="4">
                  <v-select
                    v-model="selectedSensor"
                    :items="availableSensors"
                    label="Sensor auswählen"
                    item-title="name"
                    item-value="key"
                  />
                </v-col>
                <v-col cols="12" md="3">
                  <v-select v-model="conditionOperator" :items="operators" label="Bedingung" />
                </v-col>
                <v-col cols="12" md="3">
                  <v-text-field v-model="conditionThreshold" label="Schwellenwert" type="number" />
                </v-col>
                <v-col cols="12" md="2">
                  <v-text-field v-model="conditionUnit" label="Einheit" readonly />
                </v-col>
              </v-row>
            </div>

            <!-- Timer-Bedingung -->
            <div v-if="conditionType === 'timer'">
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="timerStart"
                    label="Start-Zeit"
                    type="time"
                    :error="!!timerValidationError"
                    :error-messages="timerValidationError"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="timerEnd"
                    label="End-Zeit"
                    type="time"
                    :error="!!timerValidationError"
                    :error-messages="timerValidationError"
                  />
                </v-col>
                <!-- ✅ KRITISCH: Timer-Validierungs-Fehler anzeigen -->
                <v-col cols="12" v-if="timerValidationError">
                  <v-alert type="error" variant="tonal" density="compact">
                    {{ timerValidationError }}
                  </v-alert>
                </v-col>
                <v-col cols="12">
                  <v-chip-group v-model="selectedDays" multiple>
                    <v-chip value="1">Mo</v-chip>
                    <v-chip value="2">Di</v-chip>
                    <v-chip value="3">Mi</v-chip>
                    <v-chip value="4">Do</v-chip>
                    <v-chip value="5">Fr</v-chip>
                    <v-chip value="6">Sa</v-chip>
                    <v-chip value="0">So</v-chip>
                  </v-chip-group>
                </v-col>
              </v-row>
            </div>
          </v-card-text>

          <!-- SCHRITT 3: Vorschau & Test -->
          <v-card-text v-if="item.value === 3" class="pa-6">
            <h3 class="text-h5 mb-4">Regel-Vorschau</h3>

            <v-card variant="outlined" class="mb-4">
              <v-card-text>
                <div class="text-h6 mb-2">Erstellte Regel:</div>
                <div class="text-body-1">
                  <strong>{{ selectedActuator?.name }}</strong> wird aktiviert, wenn
                  <span v-if="conditionType === 'sensor'">
                    <strong>{{ selectedSensorName }}</strong> {{ conditionOperator }}
                    {{ conditionThreshold }}{{ conditionUnit }}
                  </span>
                  <span v-if="conditionType === 'timer'">
                    zwischen {{ timerStart }} und {{ timerEnd }} Uhr an {{ selectedDaysText }}
                  </span>
                </div>
              </v-card-text>
            </v-card>

            <!-- Live-Test -->
            <v-btn color="info" @click="testRule" :loading="testing" variant="tonal">
              <v-icon icon="mdi-play" class="mr-2" />
              Regel testen
            </v-btn>

            <div v-if="testResult" class="mt-4">
              <v-alert :type="testResult.success ? 'success' : 'warning'" variant="tonal">
                {{ testResult.message }}
              </v-alert>
            </div>
          </v-card-text>
        </template>
      </v-stepper>

      <!-- Navigation -->
      <v-card-actions class="pa-4">
        <v-btn v-if="currentStep > 1" @click="previousStep" variant="outlined">
          <v-icon icon="mdi-arrow-left" class="mr-2" />
          Zurück
        </v-btn>

        <v-spacer />

        <v-btn
          v-if="currentStep < wizardSteps.length"
          @click="nextStep"
          :disabled="!canProceed"
          color="primary"
          variant="elevated"
        >
          Weiter
          <v-icon icon="mdi-arrow-right" class="ml-2" />
        </v-btn>

        <v-btn
          v-if="currentStep === wizardSteps.length"
          @click="saveRule"
          color="success"
          variant="elevated"
          :loading="saving"
        >
          <v-icon icon="mdi-check" class="mr-2" />
          Regel speichern
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
// import { useActuatorLogicStore } from '@/stores/actuatorLogic'
import { useEspManagementStore } from '@/stores/espManagement'
// import { useCentralConfigStore } from '@/stores/centralConfig'
// ✅ KRITISCH: Zeit-Validierung importieren
import { validateTimeRange } from '@/utils/time'

// ✅ Stores für zukünftige Erweiterungen
// const actuatorLogicStore = useActuatorLogicStore()
const espStore = useEspManagementStore()
// const centralConfig = useCentralConfigStore()

// Wizard State
const showWizard = ref(false)
const currentStep = ref(1)

// ✅ ERWEITERT: Wizard-Steps mit Cross-ESP-Schritt
const wizardSteps = [
  {
    title: 'Aktor auswählen',
    subtitle: 'Welchen Aktor möchten Sie steuern?',
    icon: 'mdi-cog',
  },
  {
    title: 'Trigger definieren',
    subtitle: 'Wann soll der Aktor aktiviert werden?',
    icon: 'mdi-lightning-bolt',
  },
  {
    title: 'Bedingungen (optional)',
    subtitle: 'Zusätzliche Bedingungen für die Aktivierung',
    icon: 'mdi-filter',
  },
  {
    title: 'Cross-ESP Konfiguration',
    subtitle: 'Cross-ESP und Cross-Subzone Einstellungen',
    icon: 'mdi-connection',
  },
  {
    title: 'Vorschau & Speichern',
    subtitle: 'Logic überprüfen und speichern',
    icon: 'mdi-eye',
  },
]

// ✅ NEU: Cross-ESP Konfiguration
const crossEspConfig = ref({
  enabled: false,
  involvedEsps: [],
  involvedSubzones: [],
  complexity: 'low', // 'low', 'medium', 'high'
  estimatedLatency: 100,
})

// Bestehende reactive data...
const selectedActuator = ref(null)
const selectedSensor = ref(null)
const conditionType = ref('sensor')
const conditionOperator = ref('>')
const conditionThreshold = ref('')
const conditionUnit = ref('°C')
const timerStart = ref('08:00')
const timerEnd = ref('18:00')
const selectedDays = ref([1, 2, 3, 4, 5])
const testing = ref(false)
const saving = ref(false)
const testResult = ref(null)

// ✅ KRITISCH: Timer-Validierungs-State
const timerValidationError = ref(null)

// ✅ KRITISCH: Timer-Validierungs-Funktion
const validateWizardTimer = () => {
  const validation = validateTimeRange(timerStart.value, timerEnd.value)
  timerValidationError.value = validation.error
  return validation.valid
}

// ✅ KRITISCH: Watch für sofortige Timer-Validierung
watch([timerStart, timerEnd], validateWizardTimer)

// Computed Properties
const availableActuators = computed(() => {
  const actuators = []
  const devices = espStore.getEspDevices()

  devices.forEach((device, espId) => {
    device.actuators?.forEach((actuator, gpio) => {
      actuators.push({
        key: `${espId}-${gpio}`,
        espId,
        gpio: parseInt(gpio),
        type: actuator.type,
        name: actuator.name,
        description: getActuatorDescription(actuator.type),
        icon: getActuatorIcon(actuator.type),
      })
    })
  })

  return actuators
})

const availableSensors = computed(() => {
  const sensors = []
  const devices = espStore.getEspDevices()

  devices.forEach((device, espId) => {
    device.sensors?.forEach((sensor, gpio) => {
      sensors.push({
        key: `${espId}-${gpio}`,
        espId,
        gpio: parseInt(gpio),
        type: sensor.type,
        name: sensor.name,
        subzoneId: sensor.subzoneId,
        description: `${sensor.name} (${espId})`,
      })
    })
  })

  return sensors
})

// ✅ NEU: Cross-ESP Computed Properties (für zukünftige Erweiterungen)
// const availableEsps = computed(() => {
//   const devices = espStore.getEspDevices()
//   return Array.from(devices.keys()).map((espId) => ({
//     espId,
//     name: `${espId} (${centralConfig.getZoneForEsp(espId)})`,
//     zone: centralConfig.getZoneForEsp(espId),
//     kaiserId: centralConfig.getKaiserForEsp(espId),
//   }))
// })

// const availableSubzones = computed(() => {
//   const subzones = []
//   const devices = espStore.getEspDevices()

//   devices.forEach((device, espId) => {
//     device.subzones?.forEach((subzone, subzoneId) => {
//       subzones.push({
//         subzoneId,
//         name: subzone.name,
//         espId,
//         zone: centralConfig.getZoneForEsp(espId),
//         description: `${subzone.name} (${espId})`,
//       })
//     })
//   })

//   return subzones
// })

// const complexityOptions = computed(() => [
//   { value: 'low', title: 'Einfach', subtitle: '1 ESP, 1 Subzone' },
//   { value: 'medium', title: 'Mittel', subtitle: '2-3 ESPs, 2-3 Subzones' },
//   { value: 'high', title: 'Komplex', subtitle: '4+ ESPs, 4+ Subzones' },
// ])

const operators = [
  { title: 'Größer als', value: '>' },
  { title: 'Kleiner als', value: '<' },
  { title: 'Gleich', value: '==' },
  { title: 'Größer gleich', value: '>=' },
  { title: 'Kleiner gleich', value: '<=' },
]

// Methods
function selectActuator(actuator) {
  selectedActuator.value = actuator
  nextStep()
}

function nextStep() {
  if (currentStep.value < wizardSteps.length) {
    currentStep.value++
  }
}

// ✅ ENTFERNT: prevStep() - wird durch previousStep() ersetzt

// ✅ NEU: Cross-ESP Logic-Erstellung (für zukünftige Erweiterungen)
// const createCrossEspLogic = async () => {
//   const logicConfig = {
//     id: `logic_${Date.now()}`,
//     name: `Cross-ESP Logic ${Date.now()}`,
//     description: 'Cross-ESP Logic erstellt über Wizard',

//     // Aktor-Referenz
//     actuatorReference: {
//       espId: selectedActuator.value.espId,
//       subzoneId: selectedActuator.value.subzoneId,
//       gpio: selectedActuator.value.gpio,
//       deviceType: selectedActuator.value.type,
//     },

//     // Trigger mit Cross-ESP-Support
//     triggers: [
//       {
//         type: 'sensor_threshold',
//         sensorReference: {
//           espId: selectedSensor.value.espId,
//           subzoneId: selectedSensor.value.subzoneId,
//           gpio: selectedSensor.value.gpio,
//           deviceType: selectedSensor.value.type,
//         },
//         condition: conditionOperator.value,
//         value: parseFloat(conditionThreshold.value),
//         unit: conditionUnit.value,
//       },
//     ],

//     // Bedingungen mit Cross-ESP-Support
//     conditions: [],

//     // Cross-ESP Metadaten
//     crossEspMetadata: {
//       involvedKaisers: [
//         ...new Set(
//           crossEspConfig.value.involvedEsps.map((esp) => centralConfig.getKaiserForEsp(esp)),
//         ),
//       ],
//       involvedZones: [
//         ...new Set(
//           crossEspConfig.value.involvedEsps.map((esp) => centralConfig.getZoneForEsp(esp)),
//         ),
//       ],
//       involvedEsps: crossEspConfig.value.involvedEsps,
//       involvedSubzones: crossEspConfig.value.involvedSubzones,
//       crossEspComplexity: crossEspConfig.value.complexity,
//       estimatedLatency: crossEspConfig.value.estimatedLatency,
//       reliabilityScore: calculateReliabilityScore(crossEspConfig.value),
//     },
//   }

//   try {
//     await actuatorLogicStore.createCrossEspLogic(logicConfig)
//     window.$snackbar?.showSuccess('Cross-ESP Logic erfolgreich erstellt')
//     closeWizard()
//   } catch (error) {
//     window.$snackbar?.showError(`Logic-Erstellung fehlgeschlagen: ${error.message}`)
//   }
// }

// ✅ NEU: Hilfsmethoden für Cross-ESP (für zukünftige Erweiterungen)
// const calculateReliabilityScore = (config) => {
//   let score = 0.95 // Basis-Score

//   // Komplexität reduziert Score
//   if (config.complexity === 'medium') score -= 0.05
//   if (config.complexity === 'high') score -= 0.1

//   // Latenz reduziert Score
//   if (config.estimatedLatency > 200) score -= 0.05
//   if (config.estimatedLatency > 400) score -= 0.1

//   return Math.max(0.7, score) // Minimum 0.7
// }

// ✅ ENTFERNT: Ungenutzte Hilfsmethoden (für zukünftige Erweiterungen)
// const getEspName = (espId) => {
//   return espId
// }

// const getZoneForEsp = (espId) => {
//   return centralConfig.getZoneForEsp(espId)
// }

// ✅ NEU: Fehlende Methoden für Template-Funktionalität
function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

function canProceed() {
  if (currentStep.value === 1) return selectedActuator.value
  if (currentStep.value === 2) {
    if (conditionType.value === 'timer') {
      // ✅ KRITISCH: Timer-Validierung für Schritt 2
      return validateWizardTimer()
    }
    return selectedSensor.value
  }
  if (currentStep.value === 3) return true
  if (currentStep.value === 4) return true
  return true
}

function testRule() {
  testing.value = true
  // Simuliere Test
  setTimeout(() => {
    testResult.value = {
      success: true,
      message: 'Regel-Test erfolgreich - Aktor würde aktiviert werden',
    }
    testing.value = false
  }, 1000)
}

function saveRule() {
  // ✅ KRITISCH: Timer-Validierung vor Speicherung
  if (conditionType.value === 'timer' && !validateWizardTimer()) {
    window.$snackbar?.showError(`Timer-Validierung: ${timerValidationError.value}`)
    return
  }

  saving.value = true
  // Simuliere Speichern
  setTimeout(() => {
    saving.value = false
    closeWizard()
  }, 1000)
}

// ✅ Computed Properties für Template
const selectedSensorName = computed(() => {
  const sensor = availableSensors.value.find((s) => s.key === selectedSensor.value)
  return sensor?.name || 'Unbekannter Sensor'
})

const selectedDaysText = computed(() => {
  const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return selectedDays.value.map((day) => dayNames[day]).join(', ')
})

function closeWizard() {
  showWizard.value = false
  currentStep.value = 1
  selectedActuator.value = null
  selectedSensor.value = null
  conditionThreshold.value = ''
  testResult.value = null
  crossEspConfig.value = {
    enabled: false,
    involvedEsps: [],
    involvedSubzones: [],
    complexity: 'low',
    estimatedLatency: 100,
  }
}

// Helper Functions
function getActuatorDescription(type) {
  const descriptions = {
    ACTUATOR_PUMP: 'Wasserpumpe für Bewässerung',
    ACTUATOR_LED: 'LED-Beleuchtung',
    ACTUATOR_HEATER: 'Heizung für Temperaturregelung',
    ACTUATOR_RELAY: 'Allgemeiner Schalter',
  }
  return descriptions[type] || 'Aktor'
}

function getActuatorIcon(type) {
  const icons = {
    ACTUATOR_PUMP: 'mdi-water-pump',
    ACTUATOR_LED: 'mdi-lightbulb',
    ACTUATOR_HEATER: 'mdi-fire',
    ACTUATOR_RELAY: 'mdi-toggle-switch',
  }
  return icons[type] || 'mdi-cog'
}
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

.border-primary {
  border: 2px solid rgb(var(--v-theme-primary));
}
</style>
