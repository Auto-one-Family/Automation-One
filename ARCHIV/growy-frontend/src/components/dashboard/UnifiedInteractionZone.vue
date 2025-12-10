<template>
  <v-card class="unified-interaction-zone" variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-vector-polyline" class="mr-2" color="primary" />
      Interaktive Analyse
      <v-spacer />

      <!-- 🆕 NEU: Modus-Indikator -->
      <v-chip :color="getModeColor()" size="small" variant="tonal" class="ml-2">
        <v-icon :icon="getModeIcon()" size="small" class="mr-1" />
        {{ getModeLabel() }}
      </v-chip>

      <!-- 🆕 NEU: Modus-Umschaltung -->
      <v-btn
        icon="mdi-swap-horizontal"
        size="small"
        variant="text"
        @click="toggleMode"
        class="ml-2"
      >
        <v-tooltip location="top">
          <template #activator="{ props }">
            <span v-bind="props">Modus wechseln</span>
          </template>
        </v-tooltip>
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- 🆕 NEU: Modus-Vorschau -->
      <v-alert
        v-if="showModePreview"
        :type="currentMode === 'comparison' ? 'info' : 'warning'"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <div class="d-flex align-center justify-space-between">
          <span>
            <v-icon :icon="getModeIcon()" size="small" class="mr-2" />
            {{ getModePreviewText() }}
          </span>
          <v-btn size="x-small" variant="text" @click="confirmModeSwitch"> Bestätigen </v-btn>
        </div>
      </v-alert>

      <!-- 🆕 NEU: Intelligente Drop-Zone -->
      <div
        class="unified-drop-zone"
        @dragover="handleDragOver"
        @drop="handleDrop"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        :class="{ 'drag-over': isDragOver }"
      >
        <div v-if="interactionElements.length === 0" class="drop-zone-empty">
          <v-icon :icon="getModeIcon()" size="large" color="grey" class="mb-4" />
          <div class="text-h6 text-grey">{{ getModeDescription() }}</div>
          <div class="text-body-2 text-grey-lighten-1">
            {{ getModeInstructions() }}
          </div>

          <!-- 🆕 NEU: Modus-spezifische Drop-Hinweise -->
          <div v-if="currentMode === 'comparison'" class="drop-hint text-info mt-4">
            <v-icon icon="mdi-information" size="small" class="mr-2" />
            Ziehe zwei Sensoren oder Zonen zum Vergleichen hierher
          </div>

          <div v-if="currentMode === 'logic'" class="drop-hint text-warning mt-4">
            <v-icon icon="mdi-lightning-bolt" size="small" class="mr-2" />
            Ziehe mindestens einen Sensor und einen Aktor für eine neue Logik
          </div>
        </div>

        <!-- 🆕 NEU: Interaktive Elemente -->
        <div v-else class="interaction-elements">
          <div class="d-flex flex-wrap gap-2 mb-4">
            <v-chip
              v-for="element in interactionElements"
              :key="element.id"
              closable
              @click:close="removeElement(element)"
              :color="getElementColor(element.type)"
              variant="tonal"
            >
              <v-icon :icon="getElementIcon(element.type)" size="small" class="mr-1" />
              {{ element.name }}
              <!-- 🆕 NEU: Erklärende Tooltips -->
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <v-icon v-bind="props" icon="mdi-information" size="x-small" class="ml-1" />
                </template>
                {{ getElementTooltip(element) }}
              </v-tooltip>
            </v-chip>
          </div>

          <!-- 🆕 NEU: Logik-Validierung -->
          <v-alert
            v-if="currentMode === 'logic' && !hasValidLogicConfiguration()"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            <v-icon icon="mdi-alert" size="small" class="mr-2" />
            Unvollständige Logik-Konfiguration: Mindestens ein Sensor und ein Aktor erforderlich
          </v-alert>

          <!-- 🆕 NEU: Dynamische Darstellung basierend auf Modus -->
          <div v-if="currentMode === 'comparison' && interactionElements.length >= 2">
            <SensorComparisonChart
              :sensors="getComparisonSensors()"
              :time-range="timeRange"
              @done="handleComparisonDone"
            />
          </div>

          <div v-else-if="currentMode === 'logic' && hasValidLogicConfiguration()">
            <ActuatorLogicEditor
              :actuator="getPrimaryActuator()"
              :sensors="getLogicSensors()"
              :timers="getLogicTimers()"
              @logic-saved="handleLogicSaved"
            />
          </div>

          <!-- 🆕 NEU: Zu wenig Daten Warnung -->
          <div
            v-else-if="currentMode === 'comparison' && interactionElements.length === 1"
            class="text-center py-8"
          >
            <v-icon icon="mdi-chart-line" size="large" color="grey-lighten-1" class="mb-4" />
            <div class="text-h6 text-grey mb-2">Nicht genug Daten für Vergleich</div>
            <div class="text-body-2 text-grey-lighten-1">
              Ziehen Sie mindestens einen weiteren Sensor hierher für einen aussagekräftigen
              Vergleich
            </div>
          </div>
        </div>
      </div>
    </v-card-text>

    <!-- 🆕 NEU: Feedback-Snackbar -->
    <v-snackbar v-model="showFeedback" :color="feedbackColor" timeout="3000">
      {{ feedbackMessage }}
    </v-snackbar>
  </v-card>
</template>

<script>
import { defineComponent, ref } from 'vue'
import SensorComparisonChart from './SensorComparisonChart.vue'
import ActuatorLogicEditor from './ActuatorLogicEditor.vue'
import { useDashboardGeneratorStore } from '@/stores/dashboardGenerator'

export default defineComponent({
  name: 'UnifiedInteractionZone',

  components: {
    SensorComparisonChart,
    ActuatorLogicEditor,
  },

  setup() {
    const dashboardGenerator = useDashboardGeneratorStore()
    const interactionElements = ref([])
    const isDragOver = ref(false)
    const currentMode = ref('comparison') // 'comparison' | 'logic'
    const timeRange = ref('1hour')
    const showModePreview = ref(false)
    const pendingModeSwitch = ref(null)
    const showFeedback = ref(false)
    const feedbackMessage = ref('')
    const feedbackColor = ref('success')

    // 🆕 NEU: Zentrale Drop-Validierung pro Modus
    const validDropTypesByMode = {
      comparison: ['sensor', 'zone'],
      logic: ['sensor', 'actuator', 'timer'],
    }

    // 🆕 NEU: Factory für InteractionElemente
    const createInteractionElement = ({ type, name, data }) => ({
      id: `element_${Date.now()}_${Math.random()}`,
      type,
      name,
      data,
      timestamp: Date.now(),
    })

    // 🆕 NEU: Zentrale Drop-Validierung
    const isValidDrop = (type) => {
      return validDropTypesByMode[currentMode.value]?.includes(type) || false
    }

    // 🆕 NEU: Elemente nach Nutzung entfernen
    const clearInteractionElements = () => {
      interactionElements.value = []
    }

    // 🆕 NEU: Modus-Management
    const toggleMode = () => {
      const newMode = currentMode.value === 'comparison' ? 'logic' : 'comparison'
      showModePreview.value = true
      pendingModeSwitch.value = newMode
    }

    const confirmModeSwitch = () => {
      if (pendingModeSwitch.value) {
        currentMode.value = pendingModeSwitch.value
        showModePreview.value = false
        pendingModeSwitch.value = null
        filterElementsForMode()
        showFeedbackMessage(`Modus gewechselt zu: ${getModeLabel()}`, 'info')
      }
    }

    const filterElementsForMode = () => {
      if (currentMode.value === 'comparison') {
        // Nur Sensoren und Zonen für Vergleich
        interactionElements.value = interactionElements.value.filter(
          (el) => el.type === 'sensor' || el.type === 'zone',
        )
      } else {
        // Sensoren, Aktoren und Timer für Logik
        interactionElements.value = interactionElements.value.filter(
          (el) => el.type === 'sensor' || el.type === 'actuator' || el.type === 'timer',
        )
      }
    }

    // 🆕 NEU: Drag & Drop Handler mit verbesserter Validierung
    const handleDragOver = (event) => {
      event.preventDefault()
      event.stopPropagation()

      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'))
        const canDrop = isValidDrop(data.type)
        if (canDrop) {
          isDragOver.value = true
        }
      } catch {
        // Ungültige Daten - keine Drop-Zone anzeigen
        isDragOver.value = false
      }
    }

    const handleDragEnter = (event) => {
      event.preventDefault()
      event.stopPropagation()

      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'))
        const canDrop = isValidDrop(data.type)
        if (canDrop) {
          isDragOver.value = true
        }
      } catch {
        // Ungültige Daten - keine Drop-Zone anzeigen
        isDragOver.value = false
      }
    }

    const handleDragLeave = (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        isDragOver.value = false
      }
    }

    const handleDrop = (event) => {
      event.preventDefault()
      event.stopPropagation()
      isDragOver.value = false

      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'))

        // 🆕 NEU: Validierung vor Verarbeitung
        if (!isValidDrop(data.type)) {
          // 🆕 NEU: Validierungsfehler loggen
          dashboardGenerator.logValidationError(data, 'Ungültiger Element-Typ für diesen Modus')
          showFeedbackMessage('Ungültiger Element-Typ für diesen Modus', 'warning')
          return
        }

        // 🆕 NEU: Factory für Element-Erstellung
        const element = createInteractionElement({
          type: data.type,
          name: data.name || data.zoneId || data.sensorId,
          data: data,
        })

        if (element) {
          interactionElements.value.push(element)

          // 🆕 NEU: Erfolgreichen Drop loggen
          dashboardGenerator.logDropAction({
            ...data,
            mode: currentMode.value,
          })

          // 🆕 NEU: Automatischer Modus-Wechsel basierend auf Elementen
          autoSwitchMode()

          // 🆕 NEU: Feedback
          showFeedbackMessage(`${element.name} hinzugefügt`, 'success')
        }
      } catch (err) {
        console.error('Drop handling failed:', err)
        // 🆕 NEU: Fehler loggen
        dashboardGenerator.logValidationError(
          { type: 'unknown' },
          'Drop-Verarbeitung fehlgeschlagen',
        )
        showFeedbackMessage('Fehler beim Hinzufügen des Elements', 'error')
      }
    }

    // 🆕 NEU: Automatischer Modus-Wechsel
    const autoSwitchMode = () => {
      const hasActuator = interactionElements.value.some((el) => el.type === 'actuator')
      const hasSensor = interactionElements.value.some((el) => el.type === 'sensor')
      const hasTimer = interactionElements.value.some((el) => el.type === 'timer')

      if (hasActuator && (hasSensor || hasTimer)) {
        if (currentMode.value !== 'logic') {
          showModePreview.value = true
          pendingModeSwitch.value = 'logic'
        }
      } else if (interactionElements.value.length >= 2) {
        if (currentMode.value !== 'comparison') {
          showModePreview.value = true
          pendingModeSwitch.value = 'comparison'
        }
      }
    }

    // 🆕 NEU: Element entfernen
    const removeElement = (element) => {
      const index = interactionElements.value.findIndex((el) => el.id === element.id)
      if (index > -1) {
        interactionElements.value.splice(index, 1)

        // 🆕 NEU: Element-Entfernung loggen
        dashboardGenerator.addLogEntry({
          type: 'remove',
          action: 'element_removed',
          elementType: element.type,
          elementName: element.name,
          mode: currentMode.value,
          success: true,
        })

        autoSwitchMode()
        showFeedbackMessage(`${element.name} entfernt`, 'info')
      }
    }

    // 🆕 NEU: Logik-Validierung
    const hasValidLogicConfiguration = () => {
      const hasActuator = interactionElements.value.some((el) => el.type === 'actuator')
      const hasSensor = interactionElements.value.some((el) => el.type === 'sensor')
      return hasActuator && hasSensor
    }

    // 🆕 NEU: Modus-spezifische Hilfsfunktionen
    const getModeColor = () => {
      return currentMode.value === 'comparison' ? 'info' : 'warning'
    }

    const getModeIcon = () => {
      return currentMode.value === 'comparison' ? 'mdi-chart-multiline' : 'mdi-lightning-bolt'
    }

    const getModeLabel = () => {
      return currentMode.value === 'comparison' ? 'Vergleich' : 'Logik'
    }

    const getModeDescription = () => {
      return currentMode.value === 'comparison'
        ? 'Sensor- und Zonenvergleich'
        : 'Aktor-Logik erstellen'
    }

    const getModeInstructions = () => {
      return currentMode.value === 'comparison'
        ? 'Ziehen Sie Sensoren oder Zonen hierher für Vergleiche'
        : 'Ziehen Sie Sensoren, Aktoren und Timer hierher für Logikregeln'
    }

    const getModePreviewText = () => {
      const mode = pendingModeSwitch.value || currentMode.value
      return mode === 'comparison' ? 'Wechsel zu Vergleichsmodus' : 'Wechsel zu Logikmodus'
    }

    // 🆕 NEU: Element-spezifische Funktionen
    const getElementColor = (type) => {
      const colors = {
        sensor: 'success',
        actuator: 'warning',
        timer: 'info',
        zone: 'primary',
      }
      return colors[type] || 'grey'
    }

    const getElementIcon = (type) => {
      const icons = {
        sensor: 'mdi-thermometer',
        actuator: 'mdi-lightning-bolt',
        timer: 'mdi-clock',
        zone: 'mdi-view-grid',
      }
      return icons[type] || 'mdi-help'
    }

    // 🆕 NEU: Element-spezifische Tooltips
    const getElementTooltip = (element) => {
      if (element.type === 'sensor') {
        return 'Dieser Sensor zeigt die Messwerte an.'
      } else if (element.type === 'actuator') {
        return 'Dieser Aktor führt eine Aktion aus.'
      } else if (element.type === 'timer') {
        return 'Dieser Timer startet eine Wiederholung.'
      } else if (element.type === 'zone') {
        return 'Diese Zone gruppiert mehrere Sensoren.'
      }
      return 'Ein interaktives Element.'
    }

    // 🆕 NEU: Vergleichs-Sensoren extrahieren
    const getComparisonSensors = () => {
      return interactionElements.value.filter((el) => el.type === 'sensor').map((el) => el.data)
    }

    // 🆕 NEU: Logik-Elemente extrahieren
    const getPrimaryActuator = () => {
      return interactionElements.value.find((el) => el.type === 'actuator')?.data
    }

    const getLogicSensors = () => {
      return interactionElements.value.filter((el) => el.type === 'sensor').map((el) => el.data)
    }

    const getLogicTimers = () => {
      return interactionElements.value.filter((el) => el.type === 'timer').map((el) => el.data)
    }

    // 🆕 NEU: Feedback-System
    const showFeedbackMessage = (message, color = 'success') => {
      feedbackMessage.value = message
      feedbackColor.value = color
      showFeedback.value = true
    }

    // 🆕 NEU: Event Handler mit automatischem Aufräumen
    const handleLogicSaved = () => {
      // 🆕 NEU: Logik-Speicherung loggen
      dashboardGenerator.addLogEntry({
        type: 'logic',
        action: 'logic_saved',
        mode: currentMode.value,
        elementCount: interactionElements.value.length,
        success: true,
      })

      showFeedbackMessage('Logikregel erfolgreich gespeichert', 'success')
      // 🆕 NEU: Elemente nach erfolgreicher Logik-Speicherung entfernen
      setTimeout(() => {
        clearInteractionElements()
      }, 2000)
    }

    // 🆕 NEU: Vergleich abgeschlossen Handler
    const handleComparisonDone = () => {
      // 🆕 NEU: Vergleich-Abschluss loggen
      dashboardGenerator.addLogEntry({
        type: 'comparison',
        action: 'comparison_completed',
        mode: currentMode.value,
        elementCount: interactionElements.value.length,
        success: true,
      })

      showFeedbackMessage('Vergleich abgeschlossen', 'success')
      // 🆕 NEU: Elemente nach Vergleich entfernen
      setTimeout(() => {
        clearInteractionElements()
      }, 2000)
    }

    return {
      interactionElements,
      isDragOver,
      currentMode,
      timeRange,
      showModePreview,
      showFeedback,
      feedbackMessage,
      feedbackColor,
      toggleMode,
      confirmModeSwitch,
      handleDragOver,
      handleDragEnter,
      handleDragLeave,
      handleDrop,
      removeElement,
      hasValidLogicConfiguration,
      getModeColor,
      getModeIcon,
      getModeLabel,
      getModeDescription,
      getModeInstructions,
      getModePreviewText,
      getElementColor,
      getElementIcon,
      getElementTooltip,
      getComparisonSensors,
      getPrimaryActuator,
      getLogicSensors,
      getLogicTimers,
      handleLogicSaved,
      handleComparisonDone,
      clearInteractionElements,
    }
  },
})
</script>

<style scoped>
.unified-interaction-zone {
  transition: all 0.2s ease;
}

.unified-drop-zone {
  min-height: 300px;
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  transition: all 0.2s ease;
}

.unified-drop-zone.drag-over {
  border-color: #2196f3;
  background: rgba(33, 150, 243, 0.05);
}

.drop-zone-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
}

.interaction-elements {
  min-height: 200px;
}

.drop-hint {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
