<template>
  <v-card class="comparison-visualizer" variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-chart-multiline" class="mr-2" color="primary" />
      <!-- 🆕 NEU: Eindeutige Panel-Bezeichnung -->
      <span>{{ panelName || `Analysepanel #${panelId}` }}</span>
      <v-spacer />

      <!-- 🆕 NEU: Intelligente Vorschläge -->
      <v-chip
        v-if="suggestedComparison"
        size="small"
        color="info"
        variant="tonal"
        class="ml-2"
        @click="applySuggestion"
      >
        <v-icon icon="mdi-lightbulb" size="small" class="mr-1" />
        {{ suggestedComparison.label }}
      </v-chip>

      <!-- 🆕 NEU: Panel-Management -->
      <v-menu>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" icon="mdi-dots-vertical" size="small" variant="text" />
        </template>
        <v-list>
          <v-list-item @click="renamePanel">
            <template v-slot:prepend>
              <v-icon>mdi-pencil</v-icon>
            </template>
            <v-list-item-title>Umbenennen</v-list-item-title>
          </v-list-item>
          <v-list-item @click="duplicatePanel">
            <template v-slot:prepend>
              <v-icon>mdi-content-copy</v-icon>
            </template>
            <v-list-item-title>Duplizieren</v-list-item-title>
          </v-list-item>
          <v-list-item @click="deletePanel" color="error">
            <template v-slot:prepend>
              <v-icon>mdi-delete</v-icon>
            </template>
            <v-list-item-title>Löschen</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn
        v-if="selectedSensors.length > 0"
        icon="mdi-undo"
        variant="text"
        size="small"
        @click="undoLastAction"
        :disabled="undoStack.length === 0"
      >
        <v-tooltip location="top">
          <template #activator="{ props }">
            <span v-bind="props">Rückgängig</span>
          </template>
        </v-tooltip>
      </v-btn>
      <v-btn
        v-if="selectedSensors.length > 0"
        icon="mdi-delete"
        variant="text"
        size="small"
        color="error"
        @click="clearAll"
      >
        <v-tooltip location="top">
          <template #activator="{ props }">
            <span v-bind="props">Alle löschen</span>
          </template>
        </v-tooltip>
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- 🆕 NEU: Verbesserte Drop-Zone mit klarer Kennzeichnung -->
      <div
        class="drop-zone"
        @dragover="onDragOver"
        @drop="onDrop"
        @dragenter="onDragEnter"
        @dragleave="onDragLeave"
        :class="{ 'drag-over': isDragOver }"
      >
        <div v-if="selectedSensors.length === 0" class="drop-zone-empty">
          <v-icon icon="mdi-plus-circle-outline" size="large" color="grey" class="mb-4" />
          <div class="text-h6 text-grey">Diagrammfläche – hier Sensoren ablegen</div>
          <div class="text-body-2 text-grey-lighten-1">
            Ziehen Sie Sensoren aus den Zonen hierher, um sie zu vergleichen
          </div>

          <!-- 🆕 NEU: Intelligente Vorschläge -->
          <div v-if="availableSensors.length > 0" class="mt-4">
            <div class="text-caption text-grey mb-2">Vorgeschlagene Vergleiche:</div>
            <div class="d-flex flex-wrap gap-2">
              <v-chip
                v-for="suggestion in comparisonSuggestions"
                :key="suggestion.id"
                size="small"
                variant="outlined"
                @click="applySuggestion(suggestion)"
                class="cursor-pointer"
              >
                {{ suggestion.label }}
              </v-chip>
            </div>
          </div>

          <!-- 🆕 NEU: Panel-ID Anzeige -->
          <div class="text-caption text-grey mt-2">Panel-ID: {{ panelId }}</div>
        </div>

        <!-- Selected Sensors List -->
        <div v-else class="selected-sensors-list">
          <div class="d-flex flex-wrap gap-2 mb-4">
            <v-chip
              v-for="sensor in selectedSensors"
              :key="sensorKey(sensor)"
              closable
              @click:close="removeSensor(sensor)"
              :color="getSensorTypeColor(sensor.type)"
              variant="tonal"
            >
              <v-icon :icon="getSensorIcon(sensor.type)" size="small" class="mr-1" />
              {{ sensor.name }} ({{ sensor.espId }})
            </v-chip>
          </div>

          <!-- 🆕 NEU: Sensor Comparison Chart -->
          <SensorComparisonChart :sensors="comparisonSensors" :time-range="timeRange" />
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script>
import { defineComponent, ref, computed } from 'vue'
import { useDashboardGeneratorStore } from '@/stores/dashboardGenerator'
import { useTimeRangeStore } from '@/stores/timeRange'
import { useSensorRegistryStore } from '@/stores/sensorRegistry'
import SensorComparisonChart from './SensorComparisonChart.vue'

export default defineComponent({
  name: 'ComparisonVisualizer',
  components: {
    SensorComparisonChart,
  },
  setup() {
    const dashboardStore = useDashboardGeneratorStore()
    const timeRangeStore = useTimeRangeStore()
    const sensorRegistry = useSensorRegistryStore()
    const selectedSensors = ref([])
    const undoStack = ref([])
    const isDragOver = ref(false)
    const timeRange = ref('1hour')
    const canUndo = computed(() => undoStack.value.length > 0)

    // ✅ NEU: Panel-Management
    const panelId = ref(`panel_${Date.now()}`)
    const panelName = ref('')

    // ✅ NEU: Comparison-Sensoren aus zentraler Datenquelle
    const comparisonSensors = computed(() => {
      // Nur manuell ausgewählte Sensoren
      return dashboardStore.getComparisonSensorData(selectedSensors.value)
    })

    // 🆕 NEU: Verfügbare Sensoren für Vorschläge
    const availableSensors = computed(() => {
      return sensorRegistry.getAllSensors()
    })

    // 🆕 NEU: Intelligente Vergleichsvorschläge
    const comparisonSuggestions = computed(() => {
      const suggestions = []

      // Temperatur-Vergleiche
      const tempSensors = availableSensors.value.filter(
        (s) => s.type.includes('TEMP') || s.type.includes('temperature'),
      )
      if (tempSensors.length >= 2) {
        suggestions.push({
          id: 'temp-comparison',
          label: '🌡️ Temperatur-Vergleich',
          sensors: tempSensors.slice(0, 2),
          type: 'temperature',
        })
      }

      // Feuchtigkeit-Vergleiche
      const humiditySensors = availableSensors.value.filter(
        (s) => s.type.includes('HUMIDITY') || s.type.includes('MOISTURE'),
      )
      if (humiditySensors.length >= 2) {
        suggestions.push({
          id: 'humidity-comparison',
          label: '💧 Feuchtigkeit-Vergleich',
          sensors: humiditySensors.slice(0, 2),
          type: 'humidity',
        })
      }

      // Aktor-Effizienz (wenn verfügbar)
      const actuators = dashboardStore.getAvailableActuators()
      if (actuators.length > 0) {
        suggestions.push({
          id: 'actuator-efficiency',
          label: '⚡ Aktor-Laufzeiten',
          actuators: actuators,
          type: 'actuator-efficiency',
        })
      }

      return suggestions
    })

    // 🆕 NEU: Vorschlag anwenden
    const applySuggestion = (suggestion) => {
      if (suggestion.sensors) {
        selectedSensors.value = [...suggestion.sensors]
      } else if (suggestion.actuators) {
        // Aktor-spezifische Logik
        console.log('Apply actuator suggestion:', suggestion)
      }

      // Automatisch passende Visualisierung wählen
      setOptimalVisualization(suggestion.type)
    }

    // 🆕 NEU: Optimale Visualisierung wählen
    const setOptimalVisualization = (type) => {
      switch (type) {
        case 'temperature':
          timeRange.value = '24hours'
          break
        case 'humidity':
          timeRange.value = '1hour'
          break
        case 'actuator-efficiency':
          timeRange.value = '7days'
          break
        default:
          timeRange.value = '1hour'
      }
    }

    // Konfigurationen
    const activeTimeRange = ref(timeRangeStore.activeTimeRange)
    const aggregationMethod = ref('avg')
    const axisType = ref('linear')

    const timeRangeOptions = computed(() => timeRangeStore.getAllTimeRanges)
    const aggregationOptions = computed(() =>
      Object.entries(dashboardStore.aggregationMethods).map(([value, method]) => ({
        value,
        name: method.name,
      })),
    )
    const axisTypeOptions = [
      { value: 'linear', label: 'Linear' },
      { value: 'log', label: 'Logarithmisch' },
    ]

    // ✅ NEU: Panel-Management Functions
    const renamePanel = () => {
      const newName = prompt(
        'Panel-Name eingeben:',
        panelName.value || `Analysepanel #${panelId.value}`,
      )
      if (newName) {
        panelName.value = newName
        dashboardStore.updatePanelName(panelId.value, newName)
      }
    }

    const duplicatePanel = () => {
      const newPanel = dashboardStore.duplicatePanel(panelId.value)
      // Navigation zum neuen Panel
      if (newPanel) {
        panelId.value = newPanel.id
        panelName.value = newPanel.name
        selectedSensors.value = [...newPanel.sensors]
      }
    }

    const deletePanel = () => {
      if (confirm('Panel wirklich löschen?')) {
        dashboardStore.deletePanel(panelId.value)
        // Panel zurücksetzen
        panelId.value = `panel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        panelName.value = ''
        selectedSensors.value = []
      }
    }

    // Drag & Drop
    function onDrop(event) {
      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'))
        if (!selectedSensors.value.some((s) => sensorKey(s) === sensorKey(data))) {
          undoStack.value.push([...selectedSensors.value])
          selectedSensors.value.push(data)

          // ✅ NEU: Panel aktualisieren
          dashboardStore.updatePanel(panelId.value, {
            sensors: selectedSensors.value,
          })
        }
      } catch {
        // Fehler beim Parsen ignorieren
      }
    }

    function onDragOver(event) {
      event.dataTransfer.dropEffect = 'copy'
    }

    function onDragEnter() {
      isDragOver.value = true
    }

    function onDragLeave() {
      isDragOver.value = false
    }

    function removeSensor(sensor) {
      undoStack.value.push([...selectedSensors.value])
      selectedSensors.value = selectedSensors.value.filter(
        (s) => sensorKey(s) !== sensorKey(sensor),
      )

      // ✅ NEU: Panel aktualisieren
      dashboardStore.updatePanel(panelId.value, {
        sensors: selectedSensors.value,
      })
    }

    function clearAll() {
      if (selectedSensors.value.length > 0) {
        undoStack.value.push([...selectedSensors.value])
        selectedSensors.value = []

        // ✅ NEU: Panel aktualisieren
        dashboardStore.updatePanel(panelId.value, {
          sensors: [],
        })
      }
    }

    function undoLastAction() {
      if (undoStack.value.length > 0) {
        selectedSensors.value = undoStack.value.pop()

        // ✅ NEU: Panel aktualisieren
        dashboardStore.updatePanel(panelId.value, {
          sensors: selectedSensors.value,
        })
      }
    }

    function sensorKey(sensor) {
      return `${sensor.espId}-${sensor.gpio}`
    }

    function getSensorIcon(type) {
      const group = dashboardStore.getSensorGroupKey(type)
      return group ? dashboardStore.sensorGroups[group].icon : 'mdi-help-circle'
    }

    function getSensorTypeColor(type) {
      const group = dashboardStore.getSensorGroupKey(type)
      return group ? dashboardStore.sensorGroups[group].color : 'grey'
    }

    return {
      selectedSensors,
      comparisonSensors,
      undoStack,
      isDragOver,
      timeRange,
      canUndo,
      panelId,
      panelName,
      availableSensors,
      comparisonSuggestions,
      applySuggestion,
      onDrop,
      onDragOver,
      onDragEnter,
      onDragLeave,
      removeSensor,
      clearAll,
      undoLastAction,
      sensorKey,
      getSensorIcon,
      getSensorTypeColor,
      renamePanel,
      duplicatePanel,
      deletePanel,
      activeTimeRange,
      aggregationMethod,
      axisType,
      timeRangeOptions,
      aggregationOptions,
      axisTypeOptions,
    }
  },
})
</script>

<style scoped>
.comparison-visualizer {
  margin-bottom: 2rem;
}

/* ✅ NEU: Verbesserte Drop-Zone */
.drop-zone {
  min-height: 200px;
  border: 2px dashed #bdbdbd;
  border-radius: 12px;
  background: #fafbfc;
  transition: all 0.2s ease;
  padding: 2rem;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone.drag-over {
  border-color: #2196f3;
  background: #e3f2fd;
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.2);
}

.drop-zone-empty {
  text-align: center;
  color: #bdbdbd;
}

.selected-sensors-list {
  width: 100%;
}

.comparison-chart-container {
  min-height: 220px;
  margin-bottom: 1rem;
}

.cursor-pointer {
  cursor: pointer;
}
</style>
