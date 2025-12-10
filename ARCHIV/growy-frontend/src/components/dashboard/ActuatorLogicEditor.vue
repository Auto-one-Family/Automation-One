<template>
  <v-navigation-drawer
    :model-value="isOpen"
    @update:model-value="(value) => emit('update:isOpen', value)"
    location="right"
    width="600"
    temporary
    class="actuator-logic-editor"
  >
    <template #prepend>
      <v-toolbar density="compact" color="primary">
        <v-icon icon="mdi-lightning-bolt" class="mr-2" />
        <span class="text-h6">Aktor-Logik Editor</span>
        <v-spacer />
        <v-btn icon="mdi-close" @click="closeEditor" />
      </v-toolbar>
    </template>

    <v-container fluid class="pa-4">
      <!-- Aktor-Übersicht -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon :icon="getActuatorIcon(actuator?.type)" class="mr-2" color="warning" />
          {{ actuator?.name || 'Unbekannter Aktor' }}
          <v-chip size="small" color="warning" variant="tonal" class="ml-2">
            GPIO {{ actuator?.gpio }}
          </v-chip>
        </v-card-title>
        <v-card-text>
          <div class="d-flex align-center justify-space-between">
            <div>
              <div class="text-caption text-grey">Typ</div>
              <div class="text-body-2">{{ getActuatorTypeLabel(actuator?.type) }}</div>
            </div>
            <div>
              <div class="text-caption text-grey">Status</div>
              <v-chip :color="getActuatorStatusColor(actuator)" size="small" variant="tonal">
                {{ getActuatorStatusText(actuator) }}
              </v-chip>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Logik-Konfiguration -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-cog" class="mr-2" />
          Logik-Konfiguration
          <v-spacer />
          <v-switch
            v-model="logicConfig.enabled"
            label="Aktiviert"
            density="compact"
            hide-details
          />
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="logicConfig.name"
            label="Logik-Name"
            placeholder="z.B. Temperatur-basierte Lüftung"
            variant="outlined"
            density="comfortable"
            class="mb-3"
          />

          <v-textarea
            v-model="logicConfig.description"
            label="Beschreibung"
            placeholder="Beschreibung der Logik..."
            variant="outlined"
            density="comfortable"
            rows="2"
            class="mb-3"
          />
        </v-card-text>
      </v-card>

      <!-- 🆕 NEU: Validierungs-Status-Bar -->
      <v-card variant="outlined" class="mb-4 validation-status-card">
        <v-card-title class="d-flex align-center">
          <v-icon :icon="getValidationIcon()" :color="getValidationColor()" class="mr-2" />
          Validierungsstatus
          <v-spacer />
          <v-chip :color="getValidationColor()" size="small" variant="tonal">
            {{ getValidationStatus() }}
          </v-chip>
        </v-card-title>

        <!-- 🆕 NEU: Validierungs-Details -->
        <v-card-text
          v-if="validationState.errors.length > 0 || validationState.warnings.length > 0"
        >
          <v-alert
            v-for="error in validationState.errors"
            :key="error"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            {{ error }}
          </v-alert>

          <v-alert
            v-for="warning in validationState.warnings"
            :key="warning"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            {{ warning }}
          </v-alert>
        </v-card-text>

        <!-- 🆕 NEU: Empfehlungen -->
        <v-card-text v-if="validationState.recommendations.length > 0">
          <div class="text-caption text-grey mb-2">Empfehlungen:</div>
          <v-list density="compact">
            <v-list-item
              v-for="recommendation in validationState.recommendations"
              :key="recommendation"
              density="compact"
            >
              <template #prepend>
                <v-icon icon="mdi-lightbulb-outline" size="small" color="info" />
              </template>
              <v-list-item-title class="text-caption">{{ recommendation }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <!-- Drag & Drop Logik-Bereich -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-vector-polyline" class="mr-2" />
          Logik-Flow
          <v-spacer />
          <v-btn
            icon="mdi-play"
            size="small"
            color="success"
            variant="tonal"
            @click="startLogicProcess"
            :disabled="!logicConfig.enabled"
          >
            <HelpfulHints
              :use-tooltip-mode="true"
              tooltip-text="Logik-Prozess starten"
              tooltip-title="Start"
            />
          </v-btn>
          <v-btn
            icon="mdi-stop"
            size="small"
            color="error"
            variant="tonal"
            @click="stopLogicProcess"
            class="ml-2"
          >
            <HelpfulHints
              :use-tooltip-mode="true"
              tooltip-text="Logik-Prozess stoppen"
              tooltip-title="Stop"
            />
          </v-btn>
        </v-card-title>
        <v-card-text>
          <div
            ref="logicCanvas"
            class="logic-canvas"
            @dragover.prevent="handleDragOver"
            @drop.prevent="handleDrop"
            @dragleave.prevent="handleDragLeave"
            :class="{ 'drag-over': isDragOver }"
          >
            <!-- Logik-Elemente -->
            <div
              v-for="element in logicElements"
              :key="element.id"
              class="logic-element"
              :class="[element.type, { selected: selectedElement?.id === element.id }]"
              :style="{ left: element.x + 'px', top: element.y + 'px' }"
              draggable="true"
              @dragstart="handleElementDragStart($event, element)"
              @drop="handleElementDrop($event, element)"
              @dragover.prevent="handleDragOver"
              @dragleave.prevent="handleDragLeave"
              @click="selectElement(element)"
            >
              <div class="element-header">
                <v-icon :icon="getElementIcon(element.type)" size="small" />
                <span class="element-title">{{ element.title }}</span>
                <v-btn
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click.stop="removeElement(element)"
                />
              </div>
              <div class="element-content">
                {{ element.description }}
              </div>
            </div>

            <!-- Verbindungslinien -->
            <svg class="connections-svg">
              <line
                v-for="connection in connections"
                :key="connection.id"
                :x1="connection.x1"
                :y1="connection.y1"
                :x2="connection.x2"
                :y2="connection.y2"
                stroke="#1976d2"
                stroke-width="2"
                marker-end="url(#arrowhead)"
              />
            </svg>

            <!-- Drop-Zone Hinweis -->
            <div v-if="logicElements.length === 0" class="drop-zone-hint">
              <v-icon icon="mdi-plus" size="48" color="grey-lighten-1" class="mb-4" />
              <h3 class="text-h6 text-grey mb-2">Logik-Elemente hierher ziehen</h3>
              <p class="text-body-2 text-grey-darken-1">
                Ziehen Sie Sensoren, Timer oder Events aus der Seitenleiste hierher
              </p>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Element-Palette -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-palette" class="mr-2" />
          Element-Palette
        </v-card-title>
        <v-card-text>
          <div class="element-palette">
            <!-- Sensoren -->
            <div class="palette-section">
              <h4 class="text-subtitle-2 mb-2">Sensoren</h4>
              <div class="palette-items">
                <div
                  v-for="sensor in availableSensors"
                  :key="`sensor-${sensor.espId}-${sensor.gpio}`"
                  class="palette-item sensor"
                  draggable="true"
                  @dragstart="handlePaletteDragStart($event, 'sensor', sensor)"
                >
                  <v-icon :icon="getSensorIcon(sensor.type)" size="small" />
                  <span>{{ sensor.name }}</span>
                </div>
              </div>
            </div>

            <!-- Timer -->
            <div class="palette-section">
              <h4 class="text-subtitle-2 mb-2">Timer</h4>
              <div class="palette-items">
                <div
                  class="palette-item timer"
                  draggable="true"
                  @dragstart="handlePaletteDragStart($event, 'timer', {})"
                >
                  <v-icon icon="mdi-clock" size="small" />
                  <span>Zeitplan</span>
                </div>
              </div>
            </div>

            <!-- Events -->
            <div class="palette-section">
              <h4 class="text-subtitle-2 mb-2">Events</h4>
              <div class="palette-items">
                <div
                  class="palette-item event"
                  draggable="true"
                  @dragstart="handlePaletteDragStart($event, 'event', {})"
                >
                  <v-icon icon="mdi-calendar" size="small" />
                  <span>Ereignis</span>
                </div>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- 🆕 NEU: Logik-Template-Bibliothek -->
      <LogicTemplateLibrary
        :current-logic="currentLogicConfig"
        @template-dropped="handleTemplateDropped"
      />

      <!-- 🆕 NEU: Speichern-Button mit Validierung -->
      <v-card variant="outlined" class="mb-4">
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="6">
              <v-btn
                block
                color="primary"
                @click="saveLogicWithValidation"
                :loading="saving"
                :disabled="!validationState.isValid"
                variant="tonal"
              >
                <v-icon :icon="validationState.isValid ? 'mdi-check' : 'mdi-alert'" class="mr-2" />
                {{ validationState.isValid ? 'Logik speichern' : 'Validierungsfehler beheben' }}
              </v-btn>
            </v-col>
            <v-col cols="12" sm="6">
              <v-btn block color="secondary" @click="exportLogic" variant="tonal">
                <v-icon icon="mdi-download" class="mr-2" />
                Exportieren
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Sicherheitseinstellungen -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-shield" class="mr-2" />
          Sicherheitseinstellungen
        </v-card-title>
        <v-card-text>
          <v-switch
            v-model="logicConfig.failsafeEnabled"
            label="Failsafe aktiviert"
            density="compact"
            class="mb-3"
          />

          <v-select
            v-model="logicConfig.failsafeState"
            :items="[
              { title: 'Aktor ausschalten', value: false },
              { title: 'Aktor einschalten', value: true },
            ]"
            label="Failsafe-Zustand"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="comfortable"
            :disabled="!logicConfig.failsafeEnabled"
          />
        </v-card-text>
      </v-card>

      <!-- Aktionen -->
      <div class="d-flex gap-2">
        <v-btn
          color="info"
          @click="showLogs = !showLogs"
          variant="outlined"
          prepend-icon="mdi-text-box"
        >
          Logs
        </v-btn>
        <v-btn color="error" @click="resetLogic" variant="outlined" prepend-icon="mdi-refresh">
          Zurücksetzen
        </v-btn>
      </div>
    </v-container>

    <!-- Logs-Drawer -->
    <v-navigation-drawer
      v-model="showLogs"
      location="right"
      width="400"
      temporary
      class="logic-logs-drawer"
    >
      <template #prepend>
        <v-toolbar density="compact" color="info">
          <v-icon icon="mdi-text-box" class="mr-2" />
          <span>Logik-Logs</span>
          <v-spacer />
          <v-btn icon="mdi-close" @click="showLogs = false" />
        </v-toolbar>
      </template>

      <v-container fluid class="pa-4">
        <div v-for="log in actuatorLogs" :key="log.id" class="log-entry mb-3">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-grey">
              {{ formatDateTime(log.timestamp) }}
            </span>
            <v-chip :color="getLogColor(log.eventType)" size="x-small" variant="tonal">
              {{ log.eventType }}
            </v-chip>
          </div>
          <div class="text-body-2">{{ log.data.message }}</div>
        </div>
      </v-container>
    </v-navigation-drawer>

    <!-- Element-Konfigurations-Dialog -->
    <v-dialog v-model="showElementConfig" max-width="500">
      <v-card>
        <v-card-title> {{ selectedElement?.title }} konfigurieren </v-card-title>
        <v-card-text>
          <component
            :is="getElementConfigComponent(selectedElement?.type)"
            v-if="selectedElement"
            :element="selectedElement"
            @update="updateElement"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showElementConfig = false">Schließen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-navigation-drawer>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useSensorRegistryStore } from '@/stores/sensorRegistry'
import { useActuatorLogicValidation } from '@/utils/actuatorLogicValidation'
import { formatDateTime } from '@/utils/time'
import HelpfulHints from '@/components/common/HelpfulHints.vue'
import SensorConditionConfig from './logic/SensorConditionConfig.vue'
import TimerConfig from './logic/TimerConfig.vue'
import EventConfig from './logic/EventConfig.vue'
import LogicTemplateLibrary from './LogicTemplateLibrary.vue'

// Props
const props = defineProps({
  actuator: { type: Object, required: true },
  isOpen: { type: Boolean, default: false },
})

// Emits
const emit = defineEmits(['close', 'logic-saved', 'update:isOpen'])

// Stores
const centralDataHub = useCentralDataHub()
const actuatorLogic = computed(() => centralDataHub.actuatorLogic)
const sensorRegistry = useSensorRegistryStore()
const validation = useActuatorLogicValidation()

// 🆕 NEU: Validierungs-State
const validationState = ref({
  isValid: false,
  errors: [],
  warnings: [],
  safety: { safe: true, warnings: [] },
  performance: { performant: true, issues: [] },
  recommendations: [],
})

// Reactive Data
const logicCanvas = ref(null)
const isDragOver = ref(false)
const selectedElement = ref(null)
const showLogs = ref(false)
const showElementConfig = ref(false)
const saving = ref(false)

// Logik-Konfiguration
const logicConfig = ref({
  name: '',
  description: '',
  enabled: true,
  conditions: [],
  timers: [],
  events: [],
  failsafeEnabled: true,
  failsafeState: false,
})

// Logik-Elemente
const logicElements = ref([])
const connections = ref([])
let elementCounter = 0

// Computed Properties
const availableSensors = computed(() => {
  return sensorRegistry.getSensorsByEsp(props.actuator?.espId) || []
})

const actuatorLogs = computed(() => {
  if (!props.actuator) return []
  return actuatorLogic.value.getActuatorLogs(props.actuator.espId, props.actuator.gpio)
})

const currentLogicConfig = computed(() => {
  return {
    name: logicConfig.value.name,
    description: logicConfig.value.description,
    enabled: logicConfig.value.enabled,
    conditions: logicElements.value
      .filter((el) => el.type === 'sensor')
      .map((el) => ({
        sensorGpio: el.config.gpio,
        operator: el.config.operator,
        threshold: el.config.threshold,
        sensorType: el.config.type,
      })),
    timers: logicElements.value.filter((el) => el.type === 'timer').map((el) => el.config),
    events: logicElements.value.filter((el) => el.type === 'event').map((el) => el.config),
    failsafeEnabled: logicConfig.value.failsafeEnabled,
    failsafeState: logicConfig.value.failsafeState,
  }
})

// Methods
const getActuatorIcon = (type) => {
  const icons = {
    ACTUATOR_RELAY: 'mdi-power',
    ACTUATOR_PUMP: 'mdi-pump',
    ACTUATOR_VALVE: 'mdi-valve',
    ACTUATOR_LED: 'mdi-lightbulb',
    ACTUATOR_MOTOR: 'mdi-engine',
    ACTUATOR_HEATER: 'mdi-fire',
    ACTUATOR_FAN: 'mdi-fan',
    ACTUATOR_HUMIDIFIER: 'mdi-air-humidifier',
  }
  return icons[type] || 'mdi-power'
}

const getActuatorTypeLabel = (type) => {
  const labels = {
    ACTUATOR_RELAY: 'Relais',
    ACTUATOR_PUMP: 'Pumpe',
    ACTUATOR_VALVE: 'Ventil',
    ACTUATOR_LED: 'LED',
    ACTUATOR_MOTOR: 'Motor',
    ACTUATOR_HEATER: 'Heizung',
    ACTUATOR_FAN: 'Lüfter',
    ACTUATOR_HUMIDIFIER: 'Befeuchter',
  }
  return labels[type] || type
}

const getActuatorStatusColor = (actuator) => {
  if (actuator?.pendingState !== undefined) return 'info'
  if (actuator?.confirmedState !== actuator?.desiredState) return 'error'
  if (actuator?.confirmedState) return 'success'
  return 'grey'
}

const getActuatorStatusText = (actuator) => {
  if (actuator?.pendingState !== undefined) return 'Wird geschaltet...'
  if (actuator?.confirmedState !== actuator?.desiredState) return 'Nicht bestätigt'
  if (actuator?.confirmedState) return 'Aktiv'
  return 'Inaktiv'
}

const getSensorIcon = (type) => {
  const icons = {
    SENSOR_TEMP_DS18B20: 'mdi-thermometer',
    SENSOR_MOISTURE: 'mdi-water-percent',
    SENSOR_FLOW: 'mdi-pump',
    SENSOR_PH_DFROBOT: 'mdi-test-tube',
    SENSOR_EC_GENERIC: 'mdi-flash',
    SENSOR_PRESSURE: 'mdi-gauge',
    SENSOR_CO2: 'mdi-molecule-co2',
    SENSOR_AIR_QUALITY: 'mdi-air-filter',
    SENSOR_CUSTOM_PI_ENHANCED: 'mdi-chip',
    SENSOR_LIGHT: 'mdi-white-balance-sunny',
    SENSOR_LEVEL: 'mdi-waves',
  }
  return icons[type] || 'mdi-help-circle'
}

const getElementIcon = (type) => {
  const icons = {
    sensor: 'mdi-thermometer',
    timer: 'mdi-clock',
    event: 'mdi-calendar',
    condition: 'mdi-function-variant',
  }
  return icons[type] || 'mdi-help-circle'
}

const getLogColor = (eventType) => {
  const colors = {
    CONFIGURED: 'success',
    PROCESS_STARTED: 'info',
    PROCESS_STOPPED: 'warning',
    ACTUATOR_ACTIVATED: 'success',
    ACTUATOR_DEACTIVATED: 'warning',
    EVALUATION_ERROR: 'error',
    FAILSAFE_ACTIVATED: 'error',
  }
  return colors[eventType] || 'grey'
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
    const rect = logicCanvas.value.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    addLogicElement(data.type, data.config, x, y)
  } catch (error) {
    console.error('Failed to parse dropped data:', error)
  }
}

const handlePaletteDragStart = (event, type, config) => {
  event.dataTransfer.setData('application/json', JSON.stringify({ type, config }))
}

// ✅ NEU: Erweiterte Drag&Drop-Handler
const handleElementDragStart = (event, element) => {
  event.dataTransfer.setData(
    'application/json',
    JSON.stringify({
      elementId: element.id,
      type: 'logic-element',
    }),
  )
}

const handleElementDrop = (event, targetElement) => {
  try {
    const data = JSON.parse(event.dataTransfer.getData('application/json'))

    if (data.type === 'logic-element') {
      // Element-Hierarchie ändern
      const draggedElement = logicElements.value.find((e) => e.id === data.elementId)
      const targetIndex = logicElements.value.findIndex((e) => e.id === targetElement.id)

      if (draggedElement && targetIndex !== -1) {
        // Element an neue Position verschieben
        const draggedIndex = logicElements.value.findIndex((e) => e.id === data.elementId)
        logicElements.value.splice(draggedIndex, 1)
        logicElements.value.splice(targetIndex, 0, draggedElement)

        updateHierarchyAfterDrag()
      }
    } else {
      // Neues Element hinzufügen
      const rect = logicCanvas.value.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      addLogicElement(data.type, data.config, x, y)
    }
  } catch (error) {
    console.error('Failed to handle element drop:', error)
  }
}

// Logik-Elemente
const addLogicElement = (type, config, x, y) => {
  // ✅ NEU: Aktor-Typ-spezifische Validierung
  const actuatorType = props.actuator?.type || 'ACTUATOR_RELAY'
  const validation = actuatorLogic.value.getActuatorTypeValidation(actuatorType)

  // Prüfe, ob Element-Typ für diesen Aktor erlaubt ist
  if (!validation.allowedInputs.includes(type)) {
    window.$snackbar?.showError(
      `${type.toUpperCase()}-Elemente sind nicht erlaubt für ${actuatorType}. ${validation.description}`,
    )
    return
  }

  // Prüfe maximale Anzahl Punkte
  const currentElementsOfType = logicElements.value.filter((e) => e.type === type).length
  if (currentElementsOfType >= validation.maxPoints) {
    window.$snackbar?.showError(
      `Maximal ${validation.maxPoints} ${type.toUpperCase()}-Elemente erlaubt für ${actuatorType}`,
    )
    return
  }

  const element = {
    id: `element-${++elementCounter}`,
    type,
    x,
    y,
    title: getElementTitle(type, config),
    description: getElementDescription(type, config),
    config: { ...config },
    // ✅ NEU: Hierarchie-Information
    hierarchy: {
      level: logicElements.value.length + 1,
      parent: null,
      children: [],
    },
  }

  logicElements.value.push(element)
  updateConnections()

  // ✅ NEU: Hierarchie-Warnung anzeigen
  if (logicElements.value.length > 1) {
    window.$snackbar?.showInfo(
      `Element ${element.title} zur Hierarchie hinzugefügt. Sie können die Reihenfolge per Drag&Drop ändern.`,
    )
  }
}

const getElementTitle = (type, config) => {
  switch (type) {
    case 'sensor':
      return config.name || 'Sensor'
    case 'timer':
      return 'Zeitplan'
    case 'event':
      return 'Event'
    default:
      return 'Element'
  }
}

const getElementDescription = (type, config) => {
  switch (type) {
    case 'sensor':
      return `${config.name} (${config.value}${config.unit})`
    case 'timer':
      return `${config.startTime} - ${config.endTime}`
    case 'event':
      return 'Manueller Trigger'
    default:
      return ''
  }
}

const removeElement = (element) => {
  const index = logicElements.value.findIndex((e) => e.id === element.id)
  if (index > -1) {
    logicElements.value.splice(index, 1)
    updateConnections()
  }
}

const selectElement = (element) => {
  selectedElement.value = element
  showElementConfig.value = true
}

const updateElement = (updatedElement) => {
  const index = logicElements.value.findIndex((e) => e.id === updatedElement.id)
  if (index > -1) {
    logicElements.value[index] = { ...updatedElement }
  }
  showElementConfig.value = false
}

const updateConnections = () => {
  // ✅ NEU: Verbesserte Verbindungen mit Hierarchie
  connections.value = []

  // Sortiere Elemente nach Hierarchie-Level
  const sortedElements = [...logicElements.value].sort(
    (a, b) => a.hierarchy.level - b.hierarchy.level,
  )

  for (let i = 0; i < sortedElements.length - 1; i++) {
    const current = sortedElements[i]
    const next = sortedElements[i + 1]

    connections.value.push({
      id: `connection-${current.id}-${next.id}`,
      x1: current.x + 120, // Element-Breite
      y1: current.y + 25,
      x2: next.x,
      y2: next.y + 25,
      // ✅ NEU: Hierarchie-Information
      fromLevel: current.hierarchy.level,
      toLevel: next.hierarchy.level,
      fromType: current.type,
      toType: next.type,
    })
  }
}

// ✅ NEU: Hierarchie-Update nach Drag&Drop
const updateHierarchyAfterDrag = () => {
  // Aktualisiere Hierarchie-Level basierend auf Position
  logicElements.value.forEach((element, index) => {
    element.hierarchy.level = index + 1
  })

  updateConnections()

  // Zeige Hierarchie-Info
  const hierarchyText = logicElements.value.map((e, i) => `${i + 1}. ${e.title}`).join(' → ')

  if (logicElements.value.length > 1) {
    window.$snackbar?.showInfo(`Neue Hierarchie: ${hierarchyText}`)
  }
}

// Logik-Prozesse
const startLogicProcess = async () => {
  try {
    await actuatorLogic.value.startLogicProcess(props.actuator.espId, props.actuator.gpio)
    window.$snackbar?.showSuccess('Logik-Prozess gestartet')
  } catch (error) {
    console.error('Failed to start logic process:', error)
    window.$snackbar?.showError(`Fehler beim Starten: ${error.message}`)
  }
}

const stopLogicProcess = async () => {
  try {
    await actuatorLogic.value.stopLogicProcess(props.actuator.espId, props.actuator.gpio)
    window.$snackbar?.showSuccess('Logik-Prozess gestoppt')
  } catch (error) {
    console.error('Failed to stop logic process:', error)
    window.$snackbar?.showError(`Fehler beim Stoppen: ${error.message}`)
  }
}

// Speichern & Laden
const saveLogic = async () => {
  saving.value = true
  try {
    // Logik-Konfiguration aus Elementen erstellen
    const conditions = logicElements.value
      .filter((e) => e.type === 'sensor')
      .map((e) => ({
        sensorGpio: e.config.gpio,
        operator: e.config.operator || '>',
        threshold: e.config.threshold || 0,
      }))

    const timers = logicElements.value
      .filter((e) => e.type === 'timer')
      .map((e) => ({
        name: e.title,
        startTime: e.config.startTime || '08:00',
        endTime: e.config.endTime || '18:00',
        days: e.config.days || [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      }))

    const events = logicElements.value
      .filter((e) => e.type === 'event')
      .map((e) => ({
        type: e.config.type || 'manual',
        enabled: true,
      }))

    const config = {
      ...logicConfig.value,
      conditions,
      timers,
      events,
    }

    await actuatorLogic.value.configureActuatorLogic(
      props.actuator.espId,
      props.actuator.gpio,
      config,
    )

    window.$snackbar?.showSuccess('Aktor-Logik gespeichert')
    emit('logic-saved', config)
  } catch (error) {
    console.error('Failed to save logic:', error)
    window.$snackbar?.showError(`Fehler beim Speichern: ${error.message}`)
  } finally {
    saving.value = false
  }
}

const resetLogic = () => {
  logicElements.value = []
  connections.value = []
  logicConfig.value = {
    name: '',
    description: '',
    enabled: true,
    conditions: [],
    timers: [],
    events: [],
    failsafeEnabled: true,
    failsafeState: false,
  }
}

const exportLogic = () => {
  const exportData = {
    actuator: props.actuator,
    logic: logicConfig.value,
    elements: logicElements.value,
    timestamp: new Date().toISOString(),
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `actuator_logic_${props.actuator?.espId}_${props.actuator?.gpio}_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  window.$snackbar?.showSuccess('Logik exportiert')
}

const closeEditor = () => {
  emit('close')
}

const getElementConfigComponent = (type) => {
  switch (type) {
    case 'sensor':
      return SensorConditionConfig
    case 'timer':
      return TimerConfig
    case 'event':
      return EventConfig
    default:
      return null
  }
}

// 🆕 NEU: Echtzeit-Validierung
const validateLogicInRealTime = async () => {
  const config = {
    ...logicConfig.value,
    actuator: props.actuator,
    conditions: logicElements.value
      .filter((el) => el.type === 'sensor')
      .map((el) => ({
        sensorGpio: el.config.gpio,
        operator: el.config.operator,
        threshold: el.config.threshold,
        sensorType: el.config.type,
      })),
    timers: logicElements.value.filter((el) => el.type === 'timer').map((el) => el.config),
    events: logicElements.value.filter((el) => el.type === 'event').map((el) => el.config),
  }

  const existingLogics = Array.from(actuatorLogic.value.actuatorLogics.values())
  validationState.value = validation.validateComplete(config, existingLogics)
}

// 🆕 NEU: Validierungs-UI-Methoden
const getValidationIcon = () => {
  if (validationState.value.errors.length > 0) return 'mdi-alert-circle'
  if (validationState.value.warnings.length > 0) return 'mdi-alert'
  return 'mdi-check-circle'
}

const getValidationColor = () => {
  if (validationState.value.errors.length > 0) return 'error'
  if (validationState.value.warnings.length > 0) return 'warning'
  return 'success'
}

const getValidationStatus = () => {
  if (validationState.value.errors.length > 0) return 'Fehler'
  if (validationState.value.warnings.length > 0) return 'Warnungen'
  return 'Gültig'
}

// 🆕 NEU: Speichern-Button mit Validierung
const saveLogicWithValidation = async () => {
  if (!validationState.value.isValid) {
    window.$snackbar?.showError('Bitte beheben Sie die Validierungsfehler vor dem Speichern')
    return
  }
  await saveLogic()
}

// 🆕 NEU: Handler für Logik-Template-Bibliothek
const handleTemplateDropped = (template) => {
  // Hier könnte man die Logik-Elemente aus dem Template erstellen
  // Zum Beispiel:
  // template.elements.forEach(element => {
  //   addLogicElement(element.type, element.config, 50 + logicElements.value.length * 120, 50);
  // });
  // template.connections.forEach(connection => {
  //   connections.value.push(connection);
  // });
  // updateHierarchyAfterDrag();
  window.$snackbar?.showInfo(`Template "${template.name}" angewendet.`)
}

// Lifecycle
onMounted(() => {
  // Bestehende Logik laden
  const existingLogic = actuatorLogic.value.getActuatorLogic(
    props.actuator?.espId,
    props.actuator?.gpio,
  )
  if (existingLogic) {
    logicConfig.value = { ...existingLogic }

    // Elemente aus bestehender Logik erstellen
    existingLogic.conditions?.forEach((condition) => {
      const sensor = availableSensors.value.find((s) => s.gpio === condition.sensorGpio)
      if (sensor) {
        addLogicElement(
          'sensor',
          {
            ...sensor,
            operator: condition.operator,
            threshold: condition.threshold,
          },
          50 + logicElements.value.length * 120,
          50,
        )
      }
    })

    existingLogic.timers?.forEach((timer) => {
      addLogicElement('timer', timer, 50 + logicElements.value.length * 120, 150)
    })

    existingLogic.events?.forEach((event) => {
      addLogicElement('event', event, 50 + logicElements.value.length * 120, 250)
    })
  }
})

onUnmounted(() => {
  // Cleanup
})

// 🆕 NEU: Watch für Echtzeit-Validierung
watch(
  [logicConfig, logicElements],
  () => {
    validateLogicInRealTime()
  },
  { deep: true },
)
</script>

<style scoped>
.actuator-logic-editor {
  z-index: 1000;
}

.logic-canvas {
  position: relative;
  min-height: 400px;
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
  transition: all 0.3s ease;
}

.logic-canvas.drag-over {
  border-color: #1976d2;
  background-color: rgba(25, 118, 210, 0.05);
}

.drop-zone-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #9e9e9e;
}

.logic-element {
  position: absolute;
  width: 120px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 8px;
  cursor: move;
  transition: all 0.2s ease;
  z-index: 10;
}

.logic-element:hover {
  border-color: #1976d2;
  box-shadow: 0 2px 8px rgba(25, 118, 210, 0.2);
}

.logic-element.selected {
  border-color: #1976d2;
  background-color: rgba(25, 118, 210, 0.05);
}

.logic-element.sensor {
  border-left: 4px solid #4caf50;
}

.logic-element.timer {
  border-left: 4px solid #ff9800;
}

.logic-element.event {
  border-left: 4px solid #9c27b0;
}

.element-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.element-title {
  font-size: 0.75rem;
  font-weight: 500;
  flex: 1;
  margin-left: 4px;
}

.element-content {
  font-size: 0.625rem;
  color: #666;
  line-height: 1.2;
}

.connections-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

.element-palette {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.palette-section h4 {
  margin-bottom: 8px;
  color: #333;
}

.palette-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.2s ease;
  font-size: 0.875rem;
}

.palette-item:hover {
  background: #e3f2fd;
  border-color: #1976d2;
}

.palette-item:active {
  cursor: grabbing;
}

.palette-item.sensor {
  border-left: 3px solid #4caf50;
}

.palette-item.timer {
  border-left: 3px solid #ff9800;
}

.palette-item.event {
  border-left: 3px solid #9c27b0;
}

.log-entry {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  border-left: 3px solid #1976d2;
}

.logic-logs-drawer {
  z-index: 1001;
}
</style>
