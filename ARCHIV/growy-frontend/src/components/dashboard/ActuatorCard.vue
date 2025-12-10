<template>
  <div class="actuator-card">
    <UnifiedCard
      variant="outlined"
      class="h-100"
      :title="actuator.name"
      :icon="getActuatorIcon(actuator.type)"
      icon-color="warning"
      :show-header-actions="true"
      :show-actions="true"
      :show-expand-button="true"
      :expanded="showDetails"
      @expand="showDetails = !showDetails"
    >
      <!-- Header Actions -->
      <template #header-actions>
        <v-chip size="x-small" color="warning" variant="tonal" class="mr-2">
          GPIO {{ actuator.gpio }}
        </v-chip>

        <!-- 🆕 NEU: Sicherheits-Indikator -->
        <v-chip
          v-if="actuator.isActive"
          size="x-small"
          color="warning"
          variant="tonal"
          class="mr-2"
        >
          <v-icon icon="mdi-alert" size="x-small" class="mr-1" />
          Aktiv
        </v-chip>

        <!-- 🆕 NEU: Live-Aktivitätsanzeige -->
        <v-chip v-if="isRecentlyActive" size="x-small" color="success" variant="tonal" class="mr-2">
          <v-icon icon="mdi-clock-outline" size="x-small" class="mr-1" />
          {{ formatLastActivity() }}
        </v-chip>

        <!-- Status LED -->
        <div class="d-flex align-center">
          <div
            class="status-led mr-2"
            :class="getActuatorStatusClass(actuator)"
            :title="getActuatorStatusText(actuator)"
          />
          <v-btn
            icon="mdi-cog"
            size="small"
            variant="text"
            @click="openLogicEditor"
            :disabled="!mqttStore.value.isConnected"
          >
            <HelpfulHints
              :use-tooltip-mode="true"
              tooltip-text="Logik konfigurieren"
              tooltip-title="Konfigurieren"
            />
          </v-btn>
        </div>
      </template>

      <!-- Content -->
      <template #content>
        <div class="d-flex align-center justify-space-between mb-3">
          <div>
            <div class="text-caption text-grey">Typ</div>
            <div class="text-body-2">{{ getActuatorTypeLabel(actuator.type) }}</div>
          </div>
          <div>
            <div class="text-caption text-grey">Status</div>
            <v-chip :color="getActuatorStatusColor(actuator)" size="x-small" variant="tonal">
              {{ getActuatorStatusText(actuator) }}
            </v-chip>
          </div>
        </div>

        <!-- 🆕 NEU: Laufzeit-Indikator für Motoren -->
        <div v-if="isMotorType && actuator.runtime" class="mb-3">
          <div class="d-flex align-center justify-space-between">
            <span class="text-caption text-grey">Laufzeit</span>
            <v-chip size="x-small" color="info" variant="tonal">
              <v-icon icon="mdi-timer" size="x-small" class="mr-1" />
              {{ formatRuntime(actuator.runtime) }}
            </v-chip>
          </div>
        </div>

        <!-- 🆕 NEU: Aktuelle Abhängigkeiten -->
        <div v-if="actuator.dependencies && actuator.dependencies.length > 0" class="mb-4">
          <div class="text-caption text-grey mb-2">Aktuelle Logik:</div>
          <v-chip
            v-for="dep in actuator.dependencies"
            :key="dep.id"
            size="small"
            variant="outlined"
            class="mr-2 mb-2"
          >
            <v-icon :icon="getDependencyIcon(dep.type)" size="small" class="mr-1" />
            {{ formatDependency(dep) }}
          </v-chip>
        </div>

        <!-- 🆕 NEU: Logik bearbeiten Button -->
        <v-btn
          color="primary"
          variant="tonal"
          size="small"
          prepend-icon="mdi-lightning-bolt"
          @click="openLogicEditor"
          :disabled="!mqttStore.value.isConnected"
          class="mb-3"
        >
          Logik bearbeiten
        </v-btn>

        <!-- 🆕 NEU: Logik-Status -->
        <div v-if="logicStatus" class="mb-3">
          <div class="text-caption text-grey">Logik-Status</div>
          <div class="d-flex align-center">
            <v-chip :color="logicStatus.color" size="x-small" variant="tonal">
              <v-icon :icon="logicStatus.icon" size="x-small" class="mr-1" />
              {{ logicStatus.text }}
            </v-chip>
          </div>
        </div>

        <!-- Letzte Aktivität -->
        <div v-if="actuator.lastUpdate" class="mt-3">
          <div class="text-caption text-grey">Letzte Aktivität</div>
          <div class="text-body-2">{{ formatLastUpdate(actuator.lastUpdate) }}</div>
        </div>

        <!-- Details-Expansion -->
        <v-expand-transition>
          <div v-show="showDetails">
            <v-divider class="mt-3 mb-3" />
            <div class="text-caption text-grey mb-2">Technische Details</div>
            <v-list density="compact" variant="text">
              <v-list-item>
                <template #prepend>
                  <v-icon icon="mdi-chip" size="small" />
                </template>
                <v-list-item-title class="text-body-2">ESP-ID</v-list-item-title>
                <template #append>
                  <span class="text-body-2">{{ actuator.espId }}</span>
                </template>
              </v-list-item>

              <v-list-item>
                <template #prepend>
                  <v-icon icon="mdi-pin" size="small" />
                </template>
                <v-list-item-title class="text-body-2">GPIO Pin</v-list-item-title>
                <template #append>
                  <span class="text-body-2">{{ actuator.gpio }}</span>
                </template>
              </v-list-item>

              <v-list-item v-if="actuator.subzoneId">
                <template #prepend>
                  <v-icon icon="mdi-view-grid" size="small" />
                </template>
                <v-list-item-title class="text-body-2">Subzone</v-list-item-title>
                <template #append>
                  <span class="text-body-2">{{ actuator.subzoneId }}</span>
                </template>
              </v-list-item>

              <!-- 🆕 NEU: Laufzeit-Details -->
              <v-list-item v-if="actuator.runtime">
                <template #prepend>
                  <v-icon icon="mdi-timer" size="small" />
                </template>
                <v-list-item-title class="text-body-2">Gesamtlaufzeit</v-list-item-title>
                <template #append>
                  <span class="text-body-2">{{ formatRuntime(actuator.runtime) }}</span>
                </template>
              </v-list-item>

              <!-- 🆕 NEU: Letzte Aktivität Details -->
              <v-list-item v-if="actuator.lastActivity">
                <template #prepend>
                  <v-icon icon="mdi-clock-outline" size="small" />
                </template>
                <v-list-item-title class="text-body-2">Letzte Aktivität</v-list-item-title>
                <template #append>
                  <span class="text-body-2">{{ formatLastActivity() }}</span>
                </template>
              </v-list-item>
            </v-list>
          </div>
        </v-expand-transition>
      </template>

      <!-- Actions -->
      <template #actions>
        <v-btn
          :icon="actuator.state ? 'mdi-power-off' : 'mdi-power'"
          size="small"
          :color="actuator.state ? 'error' : 'success'"
          :disabled="mqttStore.value.isSafeMode || !mqttStore.value.isConnected"
          @click="handleActuatorToggle"
          variant="tonal"
        >
          <HelpfulHints
            :use-tooltip-mode="true"
            :tooltip-text="actuator.state ? 'Aktor ausschalten' : 'Aktor einschalten'"
            :tooltip-title="actuator.state ? 'Ausschalten' : 'Einschalten'"
          />
        </v-btn>

        <v-btn
          icon="mdi-lightning-bolt"
          size="small"
          variant="text"
          @click="openLogicEditor"
          :disabled="!mqttStore.value.isConnected"
        >
          <HelpfulHints
            :use-tooltip-mode="true"
            tooltip-text="Logik-Editor öffnen"
            tooltip-title="Logik"
          />
        </v-btn>

        <v-spacer />

        <v-btn
          icon="mdi-information"
          size="small"
          variant="text"
          @click="showDetails = !showDetails"
        >
          <HelpfulHints
            :use-tooltip-mode="true"
            tooltip-text="Details anzeigen"
            tooltip-title="Details"
          />
        </v-btn>
      </template>
    </UnifiedCard>

    <!-- Logik-Editor -->
    <ActuatorLogicEditor
      :actuator="actuator"
      :is-open="showLogicEditor"
      @close="showLogicEditor = false"
      @logic-saved="handleLogicSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'
import HelpfulHints from '@/components/common/HelpfulHints.vue'
import { formatUnixTimestamp, formatDuration } from '@/utils/time'
import ActuatorLogicEditor from './ActuatorLogicEditor.vue'

const props = defineProps({
  actuator: { type: Object, required: true },
})

const emit = defineEmits(['actuator-toggle', 'actuator-value', 'logic-saved'])

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const actuatorLogic = computed(() => centralDataHub.actuatorLogic)

const showDetails = ref(false)
const showLogicEditor = ref(false)
const actuatorState = ref(props.actuator.state || false)

// Computed Properties
const logicStatus = computed(() => {
  const logic = actuatorLogic.value.getActuatorLogic(props.actuator.espId, props.actuator.gpio)
  if (!logic) {
    return { text: 'Keine Logik', color: 'grey', icon: 'mdi-close-circle' }
  }

  if (!logic.enabled) {
    return { text: 'Deaktiviert', color: 'grey', icon: 'mdi-pause-circle' }
  }

  const process = actuatorLogic.value
    .getActiveProcesses()
    .find((p) => p.espId === props.actuator.espId && p.gpio === props.actuator.gpio)

  if (process) {
    return { text: 'Aktiv', color: 'success', icon: 'mdi-play-circle' }
  }

  return { text: 'Bereit', color: 'info', icon: 'mdi-check-circle' }
})

// 🆕 NEU: Live-Aktivitäts-Computed Properties
const isRecentlyActive = computed(() => {
  if (!props.actuator.lastActivity) return false
  const lastActivity = new Date(props.actuator.lastActivity)
  const now = new Date()
  const diffMs = now - lastActivity
  return diffMs < 5 * 60 * 1000 // 5 Minuten
})

const isMotorType = computed(() => {
  return ['ACTUATOR_MOTOR', 'ACTUATOR_PUMP', 'ACTUATOR_FAN'].includes(props.actuator.type)
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

const getActuatorStatusClass = (actuator) => {
  const baseClass = 'status-led'
  if (actuator?.pendingState !== undefined) return `${baseClass} status-pending`
  if (actuator?.confirmedState !== actuator?.desiredState) return `${baseClass} status-error`
  if (actuator?.confirmedState) return `${baseClass} status-active`
  return `${baseClass} status-inactive`
}

const formatLastUpdate = (timestamp) => {
  return formatUnixTimestamp(timestamp)
}

// 🆕 NEU: Live-Aktivitäts-Formatierung
const formatLastActivity = () => {
  if (!props.actuator.lastActivity) return 'Nie aktiv'

  const lastActivity = new Date(props.actuator.lastActivity)
  const now = new Date()
  const diffMs = now - lastActivity

  if (diffMs < 60000) return 'Gerade eben'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h`
  return lastActivity.toLocaleDateString()
}

// ✅ MIGRIERT: Laufzeit-Formatierung durch zentrale Utility
const formatRuntime = (runtimeMs) => formatDuration(runtimeMs)

// 🆕 NEU: Abhängigkeiten formatieren
const formatDependency = (dep) => {
  switch (dep.type) {
    case 'sensor':
      return `${dep.sensorName} ${dep.operator} ${dep.value}${dep.unit}`
    case 'timer':
      return `${dep.startTime} - ${dep.endTime}`
    case 'event':
      return `Event: ${dep.eventName}`
    default:
      return dep.description
  }
}

// 🆕 NEU: Abhängigkeiten-Icons
const getDependencyIcon = (type) => {
  const icons = {
    sensor: 'mdi-thermometer',
    timer: 'mdi-clock',
    event: 'mdi-calendar',
  }
  return icons[type] || 'mdi-help-circle'
}

// 🆕 NEU: Sicherheitsbestätigung für Aktor-Steuerung
const handleActuatorToggle = () => {
  const action = actuatorState.value ? 'aktivieren' : 'deaktivieren'
  const confirmMessage = `Aktor "${props.actuator.name}" wirklich ${action}?`

  if (confirm(confirmMessage)) {
    emit('actuator-toggle', props.actuator.gpio, actuatorState.value)
  } else {
    // Zurück zum ursprünglichen Zustand
    actuatorState.value = !actuatorState.value
  }
}

// 🆕 NEU: Logik-Editor öffnen
const openLogicEditor = () => {
  showLogicEditor.value = true
}

const handleLogicSaved = (logicConfig) => {
  emit('logic-saved', logicConfig)
  window.$snackbar?.showSuccess('Aktor-Logik gespeichert')
}
</script>

<style scoped>
.actuator-card {
  height: 100%;
}

.status-led {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.status-led.status-active {
  background-color: #4caf50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
}

.status-led.status-inactive {
  background-color: #9e9e9e;
}

.status-led.status-pending {
  background-color: #2196f3;
  animation: pulse 1.5s infinite;
}

.status-led.status-error {
  background-color: #f44336;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

.cursor-pointer {
  cursor: pointer;
}

.actuator-controls {
  border-top: 1px solid #e0e0e0;
  padding-top: 12px;
}

.logic-status {
  border-top: 1px solid #e0e0e0;
  padding-top: 12px;
}
</style>
