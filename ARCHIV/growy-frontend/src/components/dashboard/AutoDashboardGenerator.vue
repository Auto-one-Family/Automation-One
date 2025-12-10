<template>
  <v-card variant="outlined" class="auto-dashboard-generator">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-magic-staff" class="mr-2" />
      Intelligenter Dashboard-Generator
      <v-chip size="small" color="success" variant="tonal" class="ml-2">
        {{ detectedSensors.length }} Sensoren erkannt
      </v-chip>
    </v-card-title>

    <v-card-text>
      <!-- Automatische Sensor-Analyse -->
      <div v-if="sensorAnalysis.length > 0" class="sensor-analysis mb-4">
        <h4 class="text-h6 mb-3">Erkannte Sensor-Gruppen:</h4>
        <div class="sensor-groups">
          <v-card v-for="group in sensorAnalysis" :key="group.type" variant="tonal" class="mb-3">
            <v-card-title class="d-flex align-center">
              <v-icon :icon="getSensorIcon(group.type)" class="mr-2" />
              {{ group.label }} ({{ group.sensors.length }} Sensoren)
              <v-spacer />
              <v-btn color="primary" variant="tonal" size="small" @click="createLogicalArea(group)">
                Bereich erstellen
              </v-btn>
            </v-card-title>
            <v-card-text>
              <div class="sensor-list">
                <div
                  v-for="sensor in group.sensors"
                  :key="`${sensor.espId}-${sensor.gpio}`"
                  class="sensor-item"
                >
                  <span class="text-caption">
                    ESP {{ sensor.espId }} - GPIO {{ sensor.gpio }}: {{ sensor.name }}
                  </span>
                  <span class="text-caption text-grey"> {{ sensor.value }}{{ sensor.unit }} </span>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </div>

      <!-- Vorgeschlagene Dashboard-Layouts -->
      <div v-if="suggestedLayouts.length > 0" class="suggested-layouts">
        <h4 class="text-h6 mb-3">Vorgeschlagene Dashboard-Layouts:</h4>
        <v-row>
          <v-col v-for="layout in suggestedLayouts" :key="layout.id" cols="12" md="6" lg="4">
            <v-card
              variant="outlined"
              :class="{ 'layout-selected': selectedLayout === layout.id }"
              @click="selectLayout(layout.id)"
            >
              <v-card-title>{{ layout.name }}</v-card-title>
              <v-card-text>
                <p class="text-caption">{{ layout.description }}</p>
                <div class="layout-preview">
                  <v-chip
                    v-for="area in layout.logicalAreas"
                    :key="area.id"
                    size="x-small"
                    variant="tonal"
                    class="mr-1 mb-1"
                  >
                    {{ area.name }}
                  </v-chip>
                </div>
              </v-card-text>
              <v-card-actions>
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  @click.stop="applyLayout(layout)"
                >
                  Anwenden
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- Power-User Schnellkonfiguration -->
      <v-expansion-panels class="mt-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-lightning-bolt" class="mr-2" />
            Power-User Schnellkonfiguration
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="power-user-config">
              <v-row>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="quickConfig.sensorTypes"
                    :items="availableSensorTypes"
                    label="Sensor-Typen auswählen"
                    multiple
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="quickConfig.timeInterval"
                    :items="timeIntervalOptions"
                    label="Standard-Zeitintervall"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
              </v-row>
              <v-btn color="primary" @click="generateQuickDashboard" :loading="generating">
                Dashboard generieren
              </v-btn>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const logicalAreas = computed(() => centralDataHub.logicalAreas)
const dashboardGenerator = computed(() => centralDataHub.dashboardGenerator)

const selectedLayout = ref(null)
const generating = ref(false)
const quickConfig = ref({
  sensorTypes: [],
  timeInterval: '1h',
})

// Computed
const detectedSensors = computed(() => {
  const sensors = []
  mqttStore.value.espDevices.forEach((device, espId) => {
    device.subzones?.forEach((subzone) => {
      subzone.sensors?.forEach((sensor) => {
        sensors.push({
          ...sensor,
          espId,
          subzoneId: subzone.id,
        })
      })
    })
  })
  return sensors
})

const sensorAnalysis = computed(() => {
  const analysis = {}

  detectedSensors.value.forEach((sensor) => {
    const type = sensor.type
    if (!analysis[type]) {
      analysis[type] = {
        type,
        label: getSensorTypeLabel(type),
        sensors: [],
      }
    }
    analysis[type].sensors.push(sensor)
  })

  return Object.values(analysis).sort((a, b) => b.sensors.length - a.sensors.length)
})

const suggestedLayouts = computed(() => {
  return dashboardGenerator.value.generateSuggestedLayouts(sensorAnalysis.value)
})

const availableSensorTypes = computed(() => {
  return sensorAnalysis.value.map((group) => ({
    title: group.label,
    value: group.type,
  }))
})

const timeIntervalOptions = [
  { title: '5 Minuten', value: '5min' },
  { title: '15 Minuten', value: '15min' },
  { title: '1 Stunde', value: '1h' },
  { title: '6 Stunden', value: '6h' },
  { title: '24 Stunden', value: '24h' },
  { title: '7 Tage', value: '7d' },
]

// Methods
function createLogicalArea(sensorGroup) {
  const areaName = `${sensorGroup.label} Bereich`
  const area = logicalAreas.value.createLogicalArea({
    name: areaName,
    sensorTypes: [sensorGroup.type],
    sensors: sensorGroup.sensors.map((s) => ({
      espId: s.espId,
      gpio: s.gpio,
      type: s.type,
    })),
    timeInterval: '1h',
    criticalRanges: generateDefaultCriticalRanges(sensorGroup.type),
  })

  window.$snackbar?.showSuccess(`Logischer Bereich "${areaName}" erstellt`)
  return area
}

function selectLayout(layoutId) {
  selectedLayout.value = layoutId
}

function applyLayout(layout) {
  dashboardGenerator.value.applyLayout(layout)
  window.$snackbar?.showSuccess(`Layout "${layout.name}" angewendet`)
}

function generateQuickDashboard() {
  generating.value = true

  setTimeout(() => {
    const layout = dashboardGenerator.value.generateQuickLayout({
      sensorTypes: quickConfig.value.sensorTypes,
      timeInterval: quickConfig.value.timeInterval,
      sensors: detectedSensors.value.filter((s) => quickConfig.value.sensorTypes.includes(s.type)),
    })

    dashboardGenerator.value.applyLayout(layout)
    generating.value = false
    window.$snackbar?.showSuccess('Dashboard generiert')
  }, 1000)
}

function generateDefaultCriticalRanges(sensorType) {
  const ranges = {
    SENSOR_TEMP_DS18B20: [
      { min: 15, max: 30, color: 'warning', description: 'Temperatur-Bereich' },
    ],
    SENSOR_MOISTURE: [{ min: 40, max: 80, color: 'warning', description: 'Feuchtigkeits-Bereich' }],
    SENSOR_LIGHT: [{ min: 1000, max: 10000, color: 'warning', description: 'Licht-Bereich' }],
  }

  return ranges[sensorType] || []
}

function getSensorTypeLabel(type) {
  const labels = {
    SENSOR_TEMP_DS18B20: 'Temperatur',
    SENSOR_MOISTURE: 'Feuchtigkeit',
    SENSOR_LIGHT: 'Licht',
    SENSOR_PRESSURE: 'Druck',
    SENSOR_CO2: 'CO2',
  }
  return labels[type] || type
}

function getSensorIcon(type) {
  const icons = {
    SENSOR_TEMP_DS18B20: 'mdi-thermometer',
    SENSOR_MOISTURE: 'mdi-water-percent',
    SENSOR_LIGHT: 'mdi-white-balance-sunny',
    SENSOR_PRESSURE: 'mdi-gauge',
    SENSOR_CO2: 'mdi-molecule-co2',
  }
  return icons[type] || 'mdi-help-circle'
}

onMounted(() => {
  // Automatische Analyse beim Mount
  console.log('Auto-generating dashboard suggestions...')
})
</script>

<style scoped>
.auto-dashboard-generator {
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

.layout-selected {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.sensor-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 0.5rem;
}

.sensor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: rgba(var(--v-theme-surface), 0.5);
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-outline), 0.2);
}

.layout-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.power-user-config {
  padding: 1rem 0;
}
</style>
