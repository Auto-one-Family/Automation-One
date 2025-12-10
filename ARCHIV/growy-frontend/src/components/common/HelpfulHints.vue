<template>
  <div class="helpful-hints">
    <!-- NEU: TOOLTIP-MODUS (nur wenn useTooltipMode = true) -->
    <v-tooltip
      v-if="useTooltipMode"
      :location="tooltipLocation"
      :max-width="tooltipMaxWidth"
      :open-delay="tooltipOpenDelay"
    >
      <template #activator="{ props }">
        <v-icon
          v-bind="props"
          :icon="tooltipIcon"
          :size="tooltipSize"
          :color="tooltipColor"
          :class="tooltipIconClass"
          @click.stop="handleTooltipClick"
        />
      </template>

      <div class="tooltip-content">
        <div v-if="tooltipTitle" class="font-weight-medium mb-1">{{ tooltipTitle }}</div>
        <div class="text-caption">{{ tooltipText }}</div>
        <div v-if="tooltipDetails" class="text-caption text-grey mt-1">{{ tooltipDetails }}</div>

        <!-- NEU: Examples aus TooltipHelp.vue -->
        <div v-if="tooltipExamples && tooltipExamples.length > 0" class="mt-2">
          <div class="text-caption font-weight-medium text-primary mb-1">Beispiele:</div>
          <div
            v-for="(example, index) in tooltipExamples"
            :key="index"
            class="text-caption text-grey"
          >
            • {{ example }}
          </div>
        </div>

        <!-- NEU: Shortcuts aus TooltipHelp.vue -->
        <div v-if="tooltipShortcuts && tooltipShortcuts.length > 0" class="mt-2">
          <div class="text-caption font-weight-medium text-primary mb-1">Tastenkombinationen:</div>
          <div
            v-for="(shortcut, index) in tooltipShortcuts"
            :key="index"
            class="text-caption text-grey"
          >
            <kbd class="shortcut-key">{{ shortcut.key }}</kbd> {{ shortcut.description }}
          </div>
        </div>
      </div>
    </v-tooltip>

    <!-- KONTEXT-SPEZIFISCHE HILFE -->
    <v-alert v-if="showHint" :type="hintType" variant="tonal" class="mb-4" :icon="hintIcon">
      <div class="d-flex align-center">
        <div class="flex-grow-1">
          <div class="font-weight-medium">{{ hintTitle }}</div>
          <div class="text-caption mt-1">{{ hintText }}</div>
        </div>
        <v-btn icon="mdi-close" size="small" variant="text" @click="dismissHint" />
      </div>
    </v-alert>

    <!-- QUICK-TIPS FÜR AKTUELLE AKTION -->
    <div v-if="quickTips.length > 0" class="quick-tips-section">
      <v-chip-group class="mb-4">
        <v-chip
          v-for="tip in quickTips"
          :key="tip.id"
          :prepend-icon="tip.icon"
          size="small"
          variant="tonal"
          :color="tip.color"
          class="quick-tip-chip"
        >
          {{ tip.text }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- PROGRESS-INDIKATOR FÜR ERSTE SCHRITTE -->
    <div v-if="showProgress" class="progress-section">
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-2 d-flex align-center">
          <v-icon icon="mdi-progress-check" class="mr-2" />
          Erste Schritte
        </v-card-title>
        <v-card-text>
          <v-progress-linear
            :model-value="progressValue"
            :color="progressColor"
            height="8"
            rounded
            class="mb-2"
          />
          <div class="text-caption">{{ progressText }}</div>
        </v-card-text>
      </v-card>
    </div>

    <!-- KONTEXT-MENÜ FÜR ERWEITERTE HILFE -->
    <v-menu v-model="showHelpMenu" :close-on-content-click="false">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          icon="mdi-help-circle-outline"
          size="small"
          variant="text"
          color="info"
          class="help-button"
        />
      </template>

      <v-card min-width="300">
        <v-card-title class="text-subtitle-2">
          <v-icon icon="mdi-help" class="mr-2" />
          Hilfe & Tipps
        </v-card-title>

        <v-card-text>
          <div class="help-content">
            <div v-for="helpItem in helpItems" :key="helpItem.id" class="help-item mb-3">
              <div class="help-item-title d-flex align-center">
                <v-icon :icon="helpItem.icon" size="small" class="mr-2" />
                {{ helpItem.title }}
              </div>
              <div class="help-item-text text-caption">{{ helpItem.text }}</div>
            </div>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-btn size="small" variant="text" @click="showHelpMenu = false"> Schließen </v-btn>
          <v-spacer />
          <v-btn size="small" color="primary" variant="text" @click="openDocumentation">
            Dokumentation
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

// Props
const props = defineProps({
  context: {
    type: String,
    default: 'general',
  },
  showProgress: {
    type: Boolean,
    default: false,
  },
  userLevel: {
    type: String,
    default: 'beginner', // beginner, intermediate, expert
    validator: (value) => ['beginner', 'intermediate', 'expert'].includes(value),
  },

  // NEU: TOOLTIP-KOMPATIBILITÄT
  useTooltipMode: { type: Boolean, default: false },
  tooltipText: { type: String, default: '' },
  tooltipTitle: { type: String, default: '' },
  tooltipDetails: { type: String, default: '' },
  tooltipIcon: { type: String, default: 'mdi-help-circle' },
  tooltipLocation: { type: String, default: 'top' },
  tooltipSize: { type: String, default: 'small' },
  tooltipColor: { type: String, default: 'grey' },
  tooltipMaxWidth: { type: Number, default: 300 },
  tooltipOpenDelay: { type: Number, default: 500 },
  tooltipIconClass: { type: String, default: 'cursor-help' },
  tooltipExamples: { type: Array, default: () => [] },
  tooltipShortcuts: { type: Array, default: () => [] },
})

// Emits
const emit = defineEmits(['tooltip-click'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive Data
const showHint = ref(false)
const showHelpMenu = ref(false)
const dismissedHints = ref(new Set())

// NEU: Tooltip Click Handler
const handleTooltipClick = () => {
  emit('tooltip-click')
}

// Computed Properties
const hintConfig = computed(() => {
  const hints = {
    pinConfiguration: {
      title: '💡 Pin-Konfiguration',
      text: 'Ziehen Sie Pins zu den gewünschten Bereichen. GPIO 4 & 5 sind ideal für Sensoren.',
      type: 'info',
      icon: 'mdi-lightbulb',
    },
    firstTimeSetup: {
      title: '🚀 Willkommen!',
      text: 'Beginnen Sie mit der Mindmap-Ansicht für einen Gesamtüberblick.',
      type: 'success',
      icon: 'mdi-hand-wave',
    },
    dragAndDrop: {
      title: '🖱️ Drag & Drop',
      text: 'ESPs zwischen Zonen verschieben oder Pins zu Bereichen zuordnen.',
      type: 'info',
      icon: 'mdi-cursor-move',
    },
    zoneAssignment: {
      title: '🏠 Zone zuweisen',
      text: 'Wählen Sie eine Zone für Ihr Gerät. Zonen helfen bei der Organisation.',
      type: 'info',
      icon: 'mdi-map-marker',
    },
    advancedSettings: {
      title: '⚙️ Erweiterte Einstellungen',
      text: 'Diese Einstellungen sind für fortgeschrittene Benutzer gedacht.',
      type: 'warning',
      icon: 'mdi-tune',
    },
    connectionIssues: {
      title: '🔌 Verbindungsprobleme',
      text: 'Prüfen Sie die Netzwerkverbindung und MQTT-Broker-Einstellungen.',
      type: 'error',
      icon: 'mdi-wifi-off',
    },
    deviceConfiguration: {
      title: '📱 Gerät einrichten',
      text: 'Geben Sie einen aussagekräftigen Namen ein und wählen Sie den Gerätetyp.',
      type: 'info',
      icon: 'mdi-cog',
    },
  }

  return hints[props.context] || hints.general
})

const hintTitle = computed(() => hintConfig.value.title)
const hintText = computed(() => hintConfig.value.text)
const hintType = computed(() => hintConfig.value.type)
const hintIcon = computed(() => hintConfig.value.icon)

const quickTips = computed(() => {
  const tips = {
    pinConfiguration: [
      { id: 'pin1', text: 'GPIO 4 & 5 für I2C', icon: 'mdi-connection', color: 'info' },
      { id: 'pin2', text: 'ADC-Pins für analoge Sensoren', icon: 'mdi-gauge', color: 'success' },
      { id: 'pin3', text: 'PWM-Pins für Aktoren', icon: 'mdi-pulse', color: 'warning' },
    ],
    firstTimeSetup: [
      { id: 'setup1', text: 'Mindmap für Überblick', icon: 'mdi-graph', color: 'primary' },
      {
        id: 'setup2',
        text: 'Device Tree für Details',
        icon: 'mdi-account-tree',
        color: 'secondary',
      },
      { id: 'setup3', text: 'Advanced für Experten', icon: 'mdi-tune', color: 'warning' },
    ],
    dragAndDrop: [
      {
        id: 'drag1',
        text: 'ESPs zwischen Zonen ziehen',
        icon: 'mdi-cursor-move',
        color: 'primary',
      },
      { id: 'drag2', text: 'Pins zu Subzonen zuordnen', icon: 'mdi-pin', color: 'success' },
      { id: 'drag3', text: 'Rechtsklick für Optionen', icon: 'mdi-dots-vertical', color: 'info' },
    ],
    zoneAssignment: [
      { id: 'zone1', text: 'Bestehende Zone wählen', icon: 'mdi-map-marker', color: 'primary' },
      { id: 'zone2', text: 'Neue Zone erstellen', icon: 'mdi-plus', color: 'success' },
      { id: 'zone3', text: 'Subzone definieren', icon: 'mdi-map-marker-multiple', color: 'info' },
    ],
    advancedSettings: [
      { id: 'adv1', text: 'Debug-Modus für Entwickler', icon: 'mdi-bug', color: 'warning' },
      { id: 'adv2', text: 'Performance-Optimierung', icon: 'mdi-speedometer', color: 'success' },
      { id: 'adv3', text: 'Log-Level anpassen', icon: 'mdi-file-document', color: 'info' },
    ],
  }

  return tips[props.context] || []
})

const progressValue = computed(() => {
  // Berechne Fortschritt basierend auf Kontext
  const progressMap = {
    firstTimeSetup: 25,
    pinConfiguration: 50,
    zoneAssignment: 75,
    advancedSettings: 90,
  }

  return progressMap[props.context] || 0
})

const progressColor = computed(() => {
  if (progressValue.value < 30) return 'warning'
  if (progressValue.value < 70) return 'info'
  return 'success'
})

const progressText = computed(() => {
  const texts = {
    firstTimeSetup: 'Grundkonfiguration abgeschlossen',
    pinConfiguration: 'Pin-Zuordnung in Bearbeitung',
    zoneAssignment: 'Zone-Zuweisung fast fertig',
    advancedSettings: 'Erweiterte Konfiguration verfügbar',
  }

  return texts[props.context] || 'Fortschritt wird berechnet...'
})

const helpItems = computed(() => {
  const items = {
    pinConfiguration: [
      {
        id: 'help1',
        title: 'Pin-Typen verstehen',
        text: 'GPIO-Pins können als Input (Sensoren) oder Output (Aktoren) konfiguriert werden.',
        icon: 'mdi-pin',
      },
      {
        id: 'help2',
        title: 'I2C-Pins',
        text: 'GPIO 4 (SDA) und 5 (SCL) sind für I2C-Kommunikation optimiert.',
        icon: 'mdi-connection',
      },
      {
        id: 'help3',
        title: 'ADC-Pins',
        text: 'Pins 32-39 können analoge Signale lesen (0-3.3V).',
        icon: 'mdi-gauge',
      },
    ],
    zoneAssignment: [
      {
        id: 'help1',
        title: 'Zonen organisieren',
        text: 'Zonen helfen dabei, Geräte logisch zu gruppieren.',
        icon: 'mdi-map-marker',
      },
      {
        id: 'help2',
        title: 'Subzonen erstellen',
        text: 'Subzonen ermöglichen eine feinere Organisation innerhalb von Zonen.',
        icon: 'mdi-map-marker-multiple',
      },
    ],
    general: [
      {
        id: 'help1',
        title: 'Erste Schritte',
        text: 'Beginnen Sie mit der Mindmap-Ansicht für einen Überblick.',
        icon: 'mdi-graph',
      },
      {
        id: 'help2',
        title: 'Drag & Drop',
        text: 'Nutzen Sie Drag & Drop für intuitive Bedienung.',
        icon: 'mdi-cursor-move',
      },
    ],
  }

  return items[props.context] || items.general
})

// Methods
const dismissHint = () => {
  dismissedHints.value.add(props.context)
  showHint.value = false
  localStorage.setItem('dismissedHints', JSON.stringify(Array.from(dismissedHints.value)))
}

const openDocumentation = () => {
  // Öffne Dokumentation in neuem Tab
  window.open('/docs', '_blank')
}

const shouldShowHint = () => {
  // Prüfe ob Hint bereits verworfen wurde
  if (dismissedHints.value.has(props.context)) {
    return false
  }

  // Kontext-spezifische Logik
  switch (props.context) {
    case 'firstTimeSetup':
      return !localStorage.getItem('firstTimeSetupCompleted')
    case 'connectionIssues':
      return !mqttStore.value.isConnected
    case 'pinConfiguration':
      return props.showProgress && progressValue.value < 50
    default:
      return true
  }
}

// Lifecycle
onMounted(() => {
  // Lade verworfenen Hints aus localStorage
  const saved = localStorage.getItem('dismissedHints')
  if (saved) {
    try {
      dismissedHints.value = new Set(JSON.parse(saved))
    } catch (error) {
      console.warn('Failed to load dismissed hints:', error)
    }
  }

  // Zeige Hint basierend auf Kontext
  showHint.value = shouldShowHint()
})
</script>

<style scoped>
.helpful-hints {
  position: relative;
}

.quick-tips-section {
  margin-bottom: 16px;
}

.quick-tip-chip {
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-tip-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.progress-section {
  margin-bottom: 16px;
}

.help-button {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
}

.help-content {
  max-height: 300px;
  overflow-y: auto;
}

.help-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--v-theme-outline);
}

.help-item:last-child {
  border-bottom: none;
}

.help-item-title {
  font-weight: 500;
  font-size: 0.875rem;
  margin-bottom: 4px;
  color: var(--v-theme-on-surface);
}

.help-item-text {
  color: var(--v-theme-on-surface-variant);
  line-height: 1.4;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .help-button {
    position: static;
    margin-bottom: 8px;
  }

  .quick-tip-chip {
    font-size: 0.75rem;
  }
}

/* Dark theme adjustments */
.v-theme--dark .help-item {
  border-bottom-color: var(--v-theme-outline);
}

/* NEU: TOOLTIPHELP-STYLES */
.tooltip-content {
  line-height: 1.4;
}

.cursor-help {
  cursor: help;
}

.shortcut-key {
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 2px 6px;
  font-family: monospace;
  font-size: 0.8em;
  color: #333;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.cursor-help:hover {
  opacity: 0.8;
  transform: scale(1.1);
  transition: all 0.2s ease;
}
</style>
