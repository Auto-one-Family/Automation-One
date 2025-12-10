<!-- 🆕 NEU: Logic Test Panel für automatisierte Logik-Validierung -->
<template>
  <v-card variant="outlined" class="logic-test-panel">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-test-tube" class="mr-2" />
      Logik-Test & Simulation
      <v-spacer />
      <v-chip :color="getOverallStatusColor()" size="small" variant="tonal">
        {{ getOverallStatusText() }}
      </v-chip>
      <!-- ✅ NEU: Wizard-Button -->
      <LogicWizardEditor class="ml-2" />
    </v-card-title>

    <v-card-text>
      <!-- Test-Konfiguration -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-cog" class="mr-2" />
            Test-Konfiguration
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row>
              <v-col cols="12" md="6">
                <v-select
                  v-model="selectedEspId"
                  label="ESP-Gerät"
                  :items="availableEspDevices"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="comfortable"
                  @update:model-value="onEspChanged"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="selectedGpio"
                  label="GPIO-Pin"
                  :items="availableGpios"
                  variant="outlined"
                  density="comfortable"
                  :disabled="!selectedEspId"
                />
              </v-col>
            </v-row>

            <v-row v-if="selectedEspId && selectedGpio">
              <v-col cols="12" md="6">
                <v-btn
                  color="primary"
                  variant="elevated"
                  prepend-icon="mdi-play"
                  @click="runTests"
                  :loading="runningTests"
                  :disabled="!canRunTests"
                >
                  Tests ausführen
                </v-btn>
              </v-col>
              <v-col cols="12" md="6">
                <v-btn
                  color="info"
                  variant="elevated"
                  prepend-icon="mdi-chart-line"
                  @click="startSimulation"
                  :loading="runningSimulation"
                  :disabled="!canRunSimulation"
                >
                  Simulation starten
                </v-btn>
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Test-Ergebnisse -->
      <v-expansion-panels v-if="testResults" class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-clipboard-check" class="mr-2" />
            Test-Ergebnisse
            <v-chip size="x-small" :color="getTestStatusColor()" class="ml-2">
              {{ testResults.passed }}/{{ testResults.totalTests }}
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <!-- Test-Zusammenfassung -->
            <v-row class="mb-4">
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6 text-success">{{ testResults.passed }}</div>
                  <div class="text-caption">Bestanden</div>
                </v-card>
              </v-col>
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6 text-error">{{ testResults.failed }}</div>
                  <div class="text-caption">Fehlgeschlagen</div>
                </v-card>
              </v-col>
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6 text-warning">{{ testResults.skipped }}</div>
                  <div class="text-caption">Übersprungen</div>
                </v-card>
              </v-col>
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6 text-info">
                    {{ testResults.summary.successRate.toFixed(1) }}%
                  </div>
                  <div class="text-caption">Erfolgsrate</div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Detaillierte Test-Ergebnisse -->
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Typ</th>
                  <th>Status</th>
                  <th>Dauer</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="result in testResults.testResults" :key="result.id">
                  <td>{{ result.name }}</td>
                  <td>
                    <v-chip size="x-small" variant="tonal">
                      {{ result.type }}
                    </v-chip>
                  </td>
                  <td>
                    <v-chip
                      :color="getTestResultColor(result.status)"
                      size="x-small"
                      variant="tonal"
                    >
                      {{ result.status }}
                    </v-chip>
                  </td>
                  <td>{{ result.duration }}ms</td>
                  <td>
                    <v-btn
                      v-if="result.details"
                      size="x-small"
                      variant="text"
                      @click="showTestDetails(result)"
                    >
                      Details
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <!-- Empfehlungen -->
            <v-alert
              v-if="testResults.summary.recommendations?.length > 0"
              type="info"
              variant="tonal"
              class="mt-4"
            >
              <template v-slot:prepend>
                <v-icon icon="mdi-lightbulb" />
              </template>
              <div class="font-weight-medium mb-2">Empfehlungen:</div>
              <ul class="mb-0">
                <li v-for="rec in testResults.summary.recommendations" :key="rec.message">
                  {{ rec.message }}
                </li>
              </ul>
            </v-alert>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Live-Simulation -->
      <v-expansion-panels v-if="simulationData" class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-chart-line" class="mr-2" />
            Live-Simulation
            <v-chip size="x-small" :color="getSimulationStatusColor()" class="ml-2">
              {{ simulationData.status }}
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <!-- Simulations-Zusammenfassung -->
            <v-row class="mb-4">
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6">{{ simulationData.dataPoints.length }}</div>
                  <div class="text-caption">Datenpunkte</div>
                </v-card>
              </v-col>
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6">{{ simulationData.triggers.length }}</div>
                  <div class="text-caption">Trigger</div>
                </v-card>
              </v-col>
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6">
                    {{ simulationData.summary.activePercentage.toFixed(1) }}%
                  </div>
                  <div class="text-caption">Aktiv-Zeit</div>
                </v-card>
              </v-col>
              <v-col cols="12" md="3">
                <v-card variant="tonal" class="text-center pa-3">
                  <div class="text-h6">
                    {{ simulationData.summary.averageConfidence.toFixed(2) }}
                  </div>
                  <div class="text-caption">Konfidenz</div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Trigger-Events -->
            <div v-if="simulationData.triggers.length > 0" class="mb-4">
              <div class="text-subtitle-2 mb-2">Trigger-Events:</div>
              <v-table density="compact">
                <thead>
                  <tr>
                    <th>Zeitpunkt</th>
                    <th>Typ</th>
                    <th>Von</th>
                    <th>Nach</th>
                    <th>Grund</th>
                    <th>Konfidenz</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="trigger in simulationData.triggers.slice(-5)" :key="trigger.timestamp">
                    <td>{{ formatTime(trigger.timestamp) }}</td>
                    <td>{{ trigger.type }}</td>
                    <td>
                      <v-chip
                        :color="trigger.fromState ? 'success' : 'grey'"
                        size="x-small"
                        variant="tonal"
                      >
                        {{ trigger.fromState ? 'Aktiv' : 'Inaktiv' }}
                      </v-chip>
                    </td>
                    <td>
                      <v-chip
                        :color="trigger.toState ? 'success' : 'grey'"
                        size="x-small"
                        variant="tonal"
                      >
                        {{ trigger.toState ? 'Aktiv' : 'Inaktiv' }}
                      </v-chip>
                    </td>
                    <td>{{ trigger.reason }}</td>
                    <td>{{ (trigger.confidence * 100).toFixed(1) }}%</td>
                  </tr>
                </tbody>
              </v-table>
            </div>

            <!-- Aktions-Buttons -->
            <v-row>
              <v-col cols="12" md="6">
                <v-btn
                  color="warning"
                  variant="outlined"
                  prepend-icon="mdi-stop"
                  @click="stopSimulation"
                  :disabled="simulationData.status !== 'running'"
                >
                  Simulation stoppen
                </v-btn>
              </v-col>
              <v-col cols="12" md="6">
                <v-btn
                  color="info"
                  variant="outlined"
                  prepend-icon="mdi-download"
                  @click="exportSimulationData"
                  :disabled="simulationData.status !== 'completed'"
                >
                  Daten exportieren
                </v-btn>
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Erklärbarkeit -->
      <v-expansion-panels v-if="explanation" class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-information" class="mr-2" />
            Logik-Erklärung
            <v-chip size="x-small" :color="getConfidenceColor()" class="ml-2">
              {{ (explanation.confidence * 100).toFixed(1) }}%
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <!-- Erklärungs-Schritte -->
            <div v-for="step in explanation.steps" :key="step.step" class="mb-4">
              <v-card variant="outlined" class="pa-3">
                <div class="d-flex align-center mb-2">
                  <v-chip size="small" color="primary" class="mr-2">
                    Schritt {{ step.step }}
                  </v-chip>
                  <span class="font-weight-medium">{{ step.title }}</span>
                  <v-spacer />
                  <v-chip
                    :color="step.status === 'completed' ? 'success' : 'warning'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ step.status }}
                  </v-chip>
                </div>
                <div class="text-caption mb-2">{{ step.description }}</div>

                <!-- Schritt-Details -->
                <div v-if="step.data" class="text-caption">
                  <pre class="bg-grey-lighten-4 pa-2 rounded">{{
                    JSON.stringify(step.data, null, 2)
                  }}</pre>
                </div>
              </v-card>
            </div>

            <!-- Finale Entscheidung -->
            <v-card variant="tonal" class="pa-3 mt-4">
              <div class="text-subtitle-2 mb-2">Finale Entscheidung:</div>
              <div class="d-flex align-center">
                <v-chip
                  :color="explanation.finalDecision.state ? 'success' : 'grey'"
                  size="small"
                  variant="tonal"
                  class="mr-2"
                >
                  {{ explanation.finalDecision.state ? 'Aktiv' : 'Inaktiv' }}
                </v-chip>
                <span class="text-caption">
                  Quelle: {{ explanation.finalDecision.source }} | Grund:
                  {{ explanation.finalDecision.reason }}
                </span>
              </div>
            </v-card>

            <!-- Empfehlungen -->
            <v-alert
              v-if="explanation.recommendations?.length > 0"
              type="info"
              variant="tonal"
              class="mt-4"
            >
              <template v-slot:prepend>
                <v-icon icon="mdi-lightbulb" />
              </template>
              <div class="font-weight-medium mb-2">Empfehlungen:</div>
              <ul class="mb-0">
                <li v-for="rec in explanation.recommendations" :key="rec.message">
                  {{ rec.message }}
                </li>
              </ul>
            </v-alert>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>

    <!-- Test-Details Dialog -->
    <v-dialog v-model="showTestDetailsDialog" max-width="600">
      <v-card>
        <v-card-title>Test-Details</v-card-title>
        <v-card-text>
          <div v-if="selectedTestResult">
            <div class="mb-3"><strong>Test:</strong> {{ selectedTestResult.name }}</div>
            <div class="mb-3">
              <strong>Erwartet:</strong>
              <pre class="bg-grey-lighten-4 pa-2 rounded mt-1">{{
                JSON.stringify(selectedTestResult.expected, null, 2)
              }}</pre>
            </div>
            <div class="mb-3">
              <strong>Tatsächlich:</strong>
              <pre class="bg-grey-lighten-4 pa-2 rounded mt-1">{{
                JSON.stringify(selectedTestResult.actual, null, 2)
              }}</pre>
            </div>
            <div v-if="selectedTestResult.details">
              <strong>Details:</strong>
              <pre class="bg-grey-lighten-4 pa-2 rounded mt-1">{{
                JSON.stringify(selectedTestResult.details, null, 2)
              }}</pre>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showTestDetailsDialog = false">Schließen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

import { logicTestEngine } from '@/utils/logicTestEngine'
import { logicSimulation } from '@/utils/logicSimulation'
import { logicExplainability } from '@/utils/logicExplainability'
import LogicWizardEditor from './LogicWizardEditor.vue'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive data
const selectedEspId = ref('')
const selectedGpio = ref('')
const runningTests = ref(false)
const runningSimulation = ref(false)
const testResults = ref(null)
const simulationData = ref(null)
const explanation = ref(null)
const showTestDetailsDialog = ref(false)
const selectedTestResult = ref(null)

// Computed properties
const availableEspDevices = computed(() => {
  const devices = []
  mqttStore.value.espDevices.forEach((device, espId) => {
    devices.push({
      title: `ESP ${espId}`,
      value: espId,
    })
  })
  return devices
})

const availableGpios = computed(() => {
  if (!selectedEspId.value) return []

  const device = mqttStore.value.espDevices.get(selectedEspId.value)
  if (!device?.actuators) return []

  return Array.from(device.actuators.keys()).map((gpio) => ({
    title: `GPIO ${gpio}`,
    value: gpio,
  }))
})

const canRunTests = computed(() => {
  return selectedEspId.value && selectedGpio.value && !runningTests.value
})

const canRunSimulation = computed(() => {
  return selectedEspId.value && selectedGpio.value && !runningSimulation.value
})

// Methods
function onEspChanged() {
  selectedGpio.value = ''
  testResults.value = null
  simulationData.value = null
  explanation.value = null
}

async function runTests() {
  if (!canRunTests.value) return

  runningTests.value = true
  try {
    testResults.value = await logicTestEngine.runTestSuite(selectedEspId.value, selectedGpio.value)

    // Erklärung generieren
    explanation.value = await logicExplainability.explainLogicDecision(
      selectedEspId.value,
      selectedGpio.value,
    )

    window.$snackbar?.showSuccess(
      `Tests abgeschlossen: ${testResults.value.passed}/${testResults.value.totalTests} bestanden`,
    )
  } catch (error) {
    console.error('Test error:', error)
    window.$snackbar?.showError(`Test-Fehler: ${error.message}`)
  } finally {
    runningTests.value = false
  }
}

async function startSimulation() {
  if (!canRunSimulation.value) return

  runningSimulation.value = true
  try {
    simulationData.value = await logicSimulation.startForecastSimulation(
      selectedEspId.value,
      selectedGpio.value,
      {
        duration: 60 * 60 * 1000, // 1 Stunde
        interval: 30 * 1000, // 30 Sekunden
        includeTrends: true,
        includeHistorical: true,
      },
    )

    window.$snackbar?.showInfo('Simulation gestartet')
  } catch (error) {
    console.error('Simulation error:', error)
    window.$snackbar?.showError(`Simulations-Fehler: ${error.message}`)
  } finally {
    runningSimulation.value = false
  }
}

function stopSimulation() {
  if (simulationData.value) {
    logicSimulation.stopSimulation(simulationData.value.id)
    simulationData.value.status = 'stopped'
    window.$snackbar?.showInfo('Simulation gestoppt')
  }
}

function exportSimulationData() {
  if (!simulationData.value) return

  const dataStr = JSON.stringify(simulationData.value, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)

  const link = document.createElement('a')
  link.href = url
  link.download = `simulation_${selectedEspId.value}_${selectedGpio.value}_${Date.now()}.json`
  link.click()

  URL.revokeObjectURL(url)
  window.$snackbar?.showSuccess('Simulations-Daten exportiert')
}

function showTestDetails(result) {
  selectedTestResult.value = result
  showTestDetailsDialog.value = true
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString()
}

// Status-Farben
function getOverallStatusColor() {
  if (testResults.value) {
    if (testResults.value.failed === 0) return 'success'
    if (testResults.value.passed > 0) return 'warning'
    return 'error'
  }
  return 'grey'
}

function getOverallStatusText() {
  if (testResults.value) {
    if (testResults.value.failed === 0) return 'Alle Tests bestanden'
    if (testResults.value.passed > 0) return 'Teilweise bestanden'
    return 'Alle Tests fehlgeschlagen'
  }
  return 'Keine Tests'
}

function getTestStatusColor() {
  if (!testResults.value) return 'grey'
  if (testResults.value.failed === 0) return 'success'
  if (testResults.value.passed > 0) return 'warning'
  return 'error'
}

function getTestResultColor(status) {
  switch (status) {
    case 'passed':
      return 'success'
    case 'failed':
      return 'error'
    case 'skipped':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'grey'
  }
}

function getSimulationStatusColor() {
  if (!simulationData.value) return 'grey'
  switch (simulationData.value.status) {
    case 'running':
      return 'info'
    case 'completed':
      return 'success'
    case 'stopped':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'grey'
  }
}

function getConfidenceColor() {
  if (!explanation.value) return 'grey'
  const confidence = explanation.value.confidence
  if (confidence >= 0.8) return 'success'
  if (confidence >= 0.6) return 'warning'
  return 'error'
}

// Lifecycle
onMounted(() => {
  // Automatisch ersten ESP auswählen
  if (availableEspDevices.value.length > 0) {
    selectedEspId.value = availableEspDevices.value[0].value
  }
})

onUnmounted(() => {
  // Alle Simulationen stoppen
  logicSimulation.stopAllSimulations()
})
</script>

<style scoped>
.logic-test-panel {
  max-height: 80vh;
  overflow-y: auto;
}
</style>
