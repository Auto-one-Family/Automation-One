<template>
  <v-card variant="outlined" class="mb-4">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-cog" class="mr-2" color="primary" />
      Aktor-Logik: {{ actuator.name }}
      <v-chip size="small" color="info" variant="tonal" class="ml-2">Priorität</v-chip>
    </v-card-title>

    <v-card-text>
      <!-- Aktueller Status -->
      <v-alert :type="getStatusAlertType()" variant="tonal" class="mb-4" density="compact">
        <template v-slot:prepend>
          <v-icon :icon="getStatusIcon()" />
        </template>
        <div class="d-flex justify-space-between align-center">
          <span>
            <strong>Status:</strong> {{ getStatusText() }}
            <span v-if="statusInfo.reason" class="text-caption">({{ statusInfo.reason }})</span>
          </span>
          <v-chip v-if="statusInfo.isOverride" size="x-small" color="warning" variant="tonal">
            <v-icon icon="mdi-hand" size="x-small" class="mr-1" />
            Override
          </v-chip>
        </div>
      </v-alert>

      <!-- Prioritäts-Hierarchie -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-priority-high" class="mr-2" />
            Prioritäts-Hierarchie
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="compact">
              <v-list-item
                v-for="(priority, level) in priorityLevels"
                :key="level"
                :class="{ 'bg-primary-lighten-5': statusInfo.source === level }"
              >
                <template v-slot:prepend>
                  <v-icon
                    :icon="getPriorityIcon(level)"
                    :color="getPriorityColor(level)"
                    size="small"
                  />
                </template>
                <v-list-item-title class="text-caption">
                  {{ getPriorityLabel(level) }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">
                  Priorität: {{ priority }}
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-chip
                    v-if="statusInfo.source === level"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                  >
                    Aktiv
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Aktor-Steuerung -->
      <div class="d-flex gap-2 mb-4">
        <v-btn
          :color="statusInfo.state ? 'success' : ''"
          :variant="statusInfo.state ? 'elevated' : 'outlined'"
          :disabled="mqttStore.value.isSafeMode"
          @click="toggleActuator"
          :loading="loading"
        >
          <v-icon :icon="statusInfo.state ? 'mdi-power' : 'mdi-power-off'" class="mr-2" />
          {{ statusInfo.state ? 'Aktiv' : 'Inaktiv' }}
        </v-btn>

        <v-btn
          v-if="statusInfo.isOverride"
          color="info"
          variant="outlined"
          size="small"
          @click="clearOverride"
          :loading="loading"
        >
          <v-icon icon="mdi-refresh" size="small" class="mr-1" />
          Override zurücksetzen
        </v-btn>

        <v-btn color="warning" variant="outlined" size="small" @click="showLogicConfig = true">
          <v-icon icon="mdi-cog" size="small" class="mr-1" />
          Logik konfigurieren
        </v-btn>
      </div>

      <!-- Logik-Statistiken -->
      <v-row>
        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" density="compact">
            <v-card-text class="text-center pa-2">
              <div class="text-h6">{{ logicStats.totalLogics }}</div>
              <div class="text-caption">Logik-Konfigurationen</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" density="compact">
            <v-card-text class="text-center pa-2">
              <div class="text-h6">{{ logicStats.activeProcesses }}</div>
              <div class="text-caption">Aktive Prozesse</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" density="compact">
            <v-card-text class="text-center pa-2">
              <div class="text-h6">{{ logicStats.totalTimers }}</div>
              <div class="text-caption">Timer-Konfigurationen</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" density="compact">
            <v-card-text class="text-center pa-2">
              <div class="text-h6">{{ logicStats.totalLogs }}</div>
              <div class="text-caption">Log-Einträge</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Logik-Konfiguration Dialog -->
    <v-dialog v-model="showLogicConfig" max-width="800">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-cog" class="mr-2" />
          Aktor-Logik konfigurieren: {{ actuator.name }}
        </v-card-title>
        <v-card-text>
          <ActuatorLogicEditor
            :esp-id="espId"
            :gpio="actuator.gpio"
            :actuator-type="actuator.type"
            @saved="onLogicSaved"
            @cancelled="showLogicConfig = false"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import ActuatorLogicEditor from './logic/ActuatorLogicEditor.vue'

const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
  actuator: {
    type: Object,
    required: true,
  },
})

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const actuatorLogic = computed(() => centralDataHub.actuatorLogic)

const loading = ref(false)
const showLogicConfig = ref(false)

// ✅ BESTEHEND: Verwende vorhandene Logic-Engine
const statusInfo = computed(() => {
  const activeState = actuatorLogic.value.logicEngine.getActiveState(
    props.espId,
    props.actuator.gpio,
  )

  if (activeState) {
    return {
      state: activeState.state,
      source: activeState.source,
      reason: activeState.reason,
      isOverride: activeState.source === 'MANUAL',
      priority: activeState.priority,
    }
  }

  return {
    state: props.actuator.status === 'active' || props.actuator.state === true,
    source: 'UNKNOWN',
    reason: null,
    isOverride: false,
    priority: 0,
  }
})

// ✅ BESTEHEND: Verwende vorhandene Logic-Statistiken
const logicStats = computed(() => {
  return actuatorLogic.value.getLogicStats
})

// ✅ BESTEHEND: Verwende vorhandene Prioritäts-Levels
const priorityLevels = computed(() => {
  return actuatorLogic.value.logicEngine.priorityLevels
})

// ✅ BESTEHEND: Aktor-Steuerung mit Logic-Engine
const toggleActuator = async () => {
  if (mqttStore.value.isSafeMode) {
    window.$snackbar?.showWarning('Aktor-Steuerung im Safe Mode deaktiviert')
    return
  }

  loading.value = true
  try {
    const newState = !statusInfo.value.state
    await actuatorLogic.value.setManualOverride(
      props.espId,
      props.actuator.gpio,
      newState,
      'manual-toggle',
    )

    window.$snackbar?.showSuccess(
      `Aktor ${props.actuator.name} ${newState ? 'aktiviert' : 'deaktiviert'} (Manueller Override)`,
    )
  } catch (error) {
    console.error('Failed to toggle actuator:', error)
    window.$snackbar?.showError(`Fehler beim Umschalten: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// ✅ BESTEHEND: Override zurücksetzen
const clearOverride = async () => {
  loading.value = true
  try {
    await actuatorLogic.value.clearManualOverride(props.espId, props.actuator.gpio)
    window.$snackbar?.showSuccess(
      'Manueller Override zurückgesetzt - Logik-Steuerung wiederhergestellt',
    )
  } catch (error) {
    console.error('Failed to clear override:', error)
    window.$snackbar?.showError(`Fehler beim Zurücksetzen: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// ✅ BESTEHEND: Logik gespeichert
const onLogicSaved = () => {
  showLogicConfig.value = false
  window.$snackbar?.showSuccess('Aktor-Logik erfolgreich konfiguriert')
}

// ✅ BESTEHEND: UI-Helper-Funktionen
const getStatusAlertType = () => {
  if (statusInfo.value.isOverride) return 'warning'
  if (statusInfo.value.state) return 'success'
  return 'info'
}

const getStatusIcon = () => {
  if (statusInfo.value.isOverride) return 'mdi-hand'
  if (statusInfo.value.state) return 'mdi-power'
  return 'mdi-power-off'
}

const getStatusText = () => {
  if (statusInfo.value.isOverride) return 'Manueller Override aktiv'
  if (statusInfo.value.state) return 'Aktiv'
  return 'Inaktiv'
}

const getPriorityIcon = (level) => {
  const icons = {
    EMERGENCY: 'mdi-alert-octagon',
    MANUAL: 'mdi-hand',
    ALERT: 'mdi-alert',
    LOGIC: 'mdi-brain',
    TIMER: 'mdi-clock',
    SCHEDULE: 'mdi-calendar',
    DEFAULT: 'mdi-minus',
  }
  return icons[level] || 'mdi-help'
}

const getPriorityColor = (level) => {
  const colors = {
    EMERGENCY: 'error',
    MANUAL: 'warning',
    ALERT: 'orange',
    LOGIC: 'primary',
    TIMER: 'info',
    SCHEDULE: 'success',
    DEFAULT: 'grey',
  }
  return colors[level] || 'grey'
}

const getPriorityLabel = (level) => {
  const labels = {
    EMERGENCY: 'Notfall-Alerts',
    MANUAL: 'Manuelle Steuerung',
    ALERT: 'Alert-System',
    LOGIC: 'Drag&Drop-Logik',
    TIMER: 'Timer-basierte Logik',
    SCHEDULE: 'Zeitplan',
    DEFAULT: 'Standard-Zustand',
  }
  return labels[level] || level
}
</script>

<style scoped>
.v-card {
  transition: all 0.2s ease-in-out;
}

.v-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
</style>
