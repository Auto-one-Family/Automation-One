<script setup lang="ts">
/**
 * CalibrationWizard Component
 *
 * Step-by-step sensor calibration for pH/EC 2-point linear calibration.
 * Flow: Select sensor -> Capture point 1 -> Capture point 2 -> Confirm -> Done
 *
 * State management delegated to useCalibrationWizard composable (F-P1).
 */

import { computed, onUnmounted, ref, watch } from 'vue'
import { Activity, ArrowLeft, Check, FlaskConical, Radar, RefreshCw, ShieldCheck, X } from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'
import { useCalibrationWizard } from '@/composables/useCalibrationWizard'
import CalibrationStep from './CalibrationStep.vue'

const espStore = useEspStore()

interface Props {
  skipSelect?: boolean
  espId?: string
  gpio?: number
  sensorType?: string
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  skipSelect: false,
  espId: undefined,
  gpio: undefined,
  sensorType: undefined,
  compact: false,
})

// All wizard state from composable
const {
  phase,
  selectedEspId,
  selectedGpio,
  selectedSensorType,
  ecPreset,
  points,
  calibrationResult,
  errorMessage,
  isSubmitting,
  isMeasuring,
  lastRawValue,
  measurementQuality,
  isFreshMeasurement,
  measurementRequestId,
  lifecycleState,
  lifecycleMessage,
  hasUnsavedWork,
  currentSessionId,
  sensorTypePresets,
  EC_PRESETS,
  currentPreset,
  getSuggestedReference,
  getReferenceLabel,
  selectSensor,
  onPoint1Captured,
  onPoint2Captured,
  submitCalibration,
  triggerLiveMeasurement,
  deletePoint,
  goBack,
  handleAbort,
  confirmLeave,
  reset,
} = useCalibrationWizard({
  skipSelect: props.skipSelect,
  espId: props.espId,
  gpio: props.gpio,
  sensorType: props.sensorType,
})

// Available ESPs from store
const availableDevices = computed(() =>
  espStore.devices.filter(d => espStore.getDeviceId(d))
)

const normalizedSelectedType = computed(() => String(selectedSensorType.value || '').toLowerCase())
const selectedDevice = computed(() =>
  availableDevices.value.find((device) => espStore.getDeviceId(device) === selectedEspId.value),
)
const selectedSensorContext = computed(() => {
  if (!selectedDevice.value || selectedGpio.value == null) {
    return null
  }
  const sensorTypeNeedle = normalizedSelectedType.value
  const sensor = (selectedDevice.value.sensors ?? []).find((entry: any) =>
    Number(entry.gpio) === selectedGpio.value
    && (
      !sensorTypeNeedle
      || String(entry.sensor_type ?? '').toLowerCase() === sensorTypeNeedle
      || (
        sensorTypeNeedle === 'moisture'
        && String(entry.sensor_type ?? '').toLowerCase() === 'soil_moisture'
      )
    ),
  )
  return sensor ?? null
})

const deviceConnectivity = computed(() => {
  if (!selectedDevice.value) return 'offline'
  return (selectedDevice.value as any).is_online ? 'online' : 'offline'
})

const lifecycleTone = computed<'neutral' | 'success' | 'warning' | 'critical'>(() => {
  if (lifecycleState.value === 'terminal_success') return 'success'
  if (lifecycleState.value === 'terminal_timeout' || lifecycleState.value === 'pending') return 'warning'
  if (
    lifecycleState.value === 'terminal_failed'
    || lifecycleState.value === 'terminal_integration_issue'
  ) {
    return 'critical'
  }
  return 'neutral'
})

const lifecycleLabel = computed(() => {
  const labels: Record<string, string> = {
    idle: 'Idle',
    accepted: 'Accepted',
    pending: 'Pending',
    terminal_success: 'Terminal Success',
    terminal_failed: 'Terminal Failed',
    terminal_timeout: 'Terminal Timeout',
    terminal_integration_issue: 'Terminal Integration Issue',
  }
  return labels[lifecycleState.value] ?? lifecycleState.value
})

const qualityStatus = computed<'good' | 'suspect' | 'error'>(() => {
  const quality = String(measurementQuality.value ?? '').toLowerCase()
  if (quality === 'error' || lifecycleTone.value === 'critical') return 'error'
  if (quality === 'good' && isFreshMeasurement.value) return 'good'
  return 'suspect'
})

const qualityLabel = computed(() => {
  if (qualityStatus.value === 'good') return 'Good'
  if (qualityStatus.value === 'error') return 'Error'
  return 'Suspect'
})

type MasteryStageId = 'prep' | 'capture' | 'validate' | 'terminal'
const phaseRank: Record<string, number> = {
  select: 0,
  point1: 1,
  point2: 1,
  confirm: 2,
  done: 3,
  error: 3,
}
const masteryStages = computed(() => {
  const currentRank = phaseRank[phase.value] ?? 0
  const terminalCta = lifecycleState.value === 'terminal_success'
    ? 'Naechster Sensor oder Betrieb fortsetzen.'
    : lifecycleState.value === 'terminal_timeout'
      ? 'Session pruefen und Kalibrierung erneut ausfuehren.'
      : lifecycleState.value === 'terminal_failed' || lifecycleState.value === 'terminal_integration_issue'
        ? 'Fehlerursache pruefen und letzte Aktion wiederholen.'
        : 'Auf terminale Rueckmeldung warten.'
  const stages: Array<{ id: MasteryStageId; label: string; action: string; rank: number }> = [
    { id: 'prep', label: 'Vorbereitung', action: 'Sensor, Zone und Subzone bestaetigen.', rank: 0 },
    { id: 'capture', label: 'Messpunktaufnahme', action: 'Frische Messung starten und Punkt uebernehmen.', rank: 1 },
    { id: 'validate', label: 'Validierung', action: 'Punkte vergleichen und Kalibrierauftrag senden.', rank: 2 },
    { id: 'terminal', label: 'Terminaler Abschluss', action: terminalCta, rank: 3 },
  ]
  return stages.map((stage) => ({
    ...stage,
    isDone: currentRank > stage.rank,
    isCurrent: currentRank === stage.rank,
  }))
})

const currentNextAction = computed(() =>
  masteryStages.value.find((stage) => stage.isCurrent)?.action
  ?? masteryStages.value[masteryStages.value.length - 1]?.action
  ?? '',
)

const feedbackClass = ref('')
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

watch(lifecycleState, (state) => {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer)
    feedbackTimer = null
  }
  if (state === 'terminal_success') {
    feedbackClass.value = 'calibration-wizard--fx-success'
  } else if (state === 'terminal_timeout') {
    feedbackClass.value = 'calibration-wizard--fx-timeout'
  } else if (state === 'terminal_failed' || state === 'terminal_integration_issue') {
    feedbackClass.value = 'calibration-wizard--fx-error'
  } else {
    feedbackClass.value = ''
  }
  if (feedbackClass.value) {
    feedbackTimer = setTimeout(() => {
      feedbackClass.value = ''
    }, 200)
  }
})

onUnmounted(() => {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer)
    feedbackTimer = null
  }
})

const availableDeviceSensors = computed(() =>
  availableDevices.value.map((device) => {
    const sensors = (device.sensors ?? []).filter((sensor: any) => {
      if (!normalizedSelectedType.value) {
        return false
      }
      const sensorType = String(sensor.sensor_type ?? '').toLowerCase()
      if (normalizedSelectedType.value === 'moisture') {
        return sensorType === 'moisture' || sensorType === 'soil_moisture'
      }
      return sensorType === normalizedSelectedType.value
    })
    return {
      device,
      sensors,
    }
  }),
)

defineExpose({
  confirmLeave,
  hasUnsavedWork,
})
</script>

<template>
  <div class="calibration-wizard" :class="[{ 'calibration-wizard--compact': compact }, feedbackClass]">
    <div v-if="!compact" class="calibration-wizard__header">
      <FlaskConical :size="20" class="calibration-wizard__icon" />
      <h2 class="calibration-wizard__title">Sensor-Kalibrierung</h2>
    </div>

    <div class="calibration-wizard__hud" role="status" aria-live="polite">
      <div class="calibration-wizard__hud-head">
        <div class="calibration-wizard__hud-chip" :class="`calibration-wizard__hud-chip--${deviceConnectivity}`">
          <Radar :size="14" />
          Device {{ deviceConnectivity === 'online' ? 'Online' : 'Offline' }}
        </div>
        <div class="calibration-wizard__hud-chip" :class="`calibration-wizard__hud-chip--${lifecycleTone}`">
          <Activity :size="14" />
          Contract {{ lifecycleLabel }}
        </div>
        <div class="calibration-wizard__hud-chip" :class="`calibration-wizard__hud-chip--${qualityStatus}`">
          <ShieldCheck :size="14" />
          Qualitaet {{ qualityLabel }}
        </div>
      </div>
      <div class="calibration-wizard__hud-context">
        <span class="calibration-wizard__hud-context-key">Kontext</span>
        <span class="calibration-wizard__summary-mono">{{ selectedEspId || '—' }}</span>
        <span>GPIO {{ selectedGpio ?? '—' }}</span>
        <span>Zone {{ (selectedDevice as any)?.zone_name || (selectedDevice as any)?.zone_id || 'nicht zugewiesen' }}</span>
        <span>Subzone {{ (selectedSensorContext as any)?.subzone_id || 'Zone-weit' }}</span>
      </div>
      <p v-if="lifecycleMessage" class="calibration-wizard__hud-message">{{ lifecycleMessage }}</p>
    </div>

    <div class="calibration-wizard__mastery">
      <div class="calibration-wizard__mastery-row">
        <div
          v-for="stage in masteryStages"
          :key="stage.id"
          class="calibration-wizard__mastery-stage"
          :class="{
            'calibration-wizard__mastery-stage--done': stage.isDone,
            'calibration-wizard__mastery-stage--current': stage.isCurrent,
          }"
        >
          {{ stage.label }}
        </div>
      </div>
      <p class="calibration-wizard__mastery-next">
        <strong>Naechste Aktion:</strong> {{ currentNextAction }}
      </p>
    </div>

    <!-- Phase: Select Sensor -->
    <div v-if="phase === 'select'" class="calibration-wizard__phase">
      <p class="calibration-wizard__desc">
        Waehle einen Sensor fuer die 2-Punkt-Kalibrierung.
      </p>

      <div class="calibration-wizard__type-grid">
        <button
          v-for="(preset, type) in sensorTypePresets"
          :key="type"
          class="calibration-wizard__type-card"
          :class="{ 'calibration-wizard__type-card--selected': selectedSensorType === type }"
          @click="selectedSensorType = type as string"
        >
          <span class="calibration-wizard__type-name">{{ preset.label }}</span>
        </button>
      </div>

      <div v-if="selectedSensorType" class="calibration-wizard__device-list">
        <p class="calibration-wizard__label">ESP-Geraet und GPIO waehlen:</p>
        <div v-for="entry in availableDeviceSensors" :key="espStore.getDeviceId(entry.device)" class="calibration-wizard__device-row">
          <span class="calibration-wizard__device-name">{{ entry.device.name || espStore.getDeviceId(entry.device) }}</span>
          <div class="calibration-wizard__gpio-chips">
            <button
              v-for="sensor in entry.sensors"
              :key="`${espStore.getDeviceId(entry.device)}-${(sensor as any).gpio}-${String((sensor as any).sensor_type ?? '')}`"
              class="calibration-wizard__gpio-chip"
              @click="selectSensor(espStore.getDeviceId(entry.device), (sensor as any).gpio, String((sensor as any).sensor_type ?? selectedSensorType))"
            >
              GPIO {{ (sensor as any).gpio }} - {{ String((sensor as any).sensor_type ?? '') }}
            </button>
          </div>
        </div>
        <p v-if="availableDevices.length === 0" class="calibration-wizard__empty">
          Keine ESP-Geraete verbunden.
        </p>
      </div>
    </div>

    <!-- Phase: Capture Point 1 -->
    <div v-if="phase === 'point1'" class="calibration-wizard__phase">
      <div class="calibration-wizard__actions">
        <button class="calibration-wizard__abort-btn" :disabled="isSubmitting" @click="handleAbort">
          <X :size="14" /> Abbrechen
        </button>
        <button class="calibration-wizard__back-btn" :disabled="isSubmitting" @click="goBack">
          <ArrowLeft :size="14" /> Zurueck
        </button>
      </div>
      <div v-if="selectedSensorType === 'ec'" class="calibration-wizard__ec-preset-row">
        <label class="calibration-wizard__label" for="ec-preset">Kalibrierloesung</label>
        <select
          id="ec-preset"
          v-model="ecPreset"
          class="calibration-wizard__ec-preset"
        >
          <option value="0_1413">{{ EC_PRESETS['0_1413'].label }}</option>
          <option value="1413_12880">{{ EC_PRESETS['1413_12880'].label }}</option>
          <option value="custom">Eigene Werte</option>
        </select>
      </div>
      <CalibrationStep
        :step-number="1"
        :total-steps="2"
        :esp-id="selectedEspId"
        :gpio="selectedGpio!"
        :sensor-type="selectedSensorType"
        :suggested-reference="getSuggestedReference(1)"
        :reference-label="getReferenceLabel(1)"
        :last-raw-value="lastRawValue"
        :is-measuring="isMeasuring"
        :measurement-quality="measurementQuality"
        :is-fresh-measurement="isFreshMeasurement"
        @captured="onPoint1Captured"
        @request-measurement="triggerLiveMeasurement"
      />
    </div>

    <!-- Phase: Capture Point 2 -->
    <div v-if="phase === 'point2'" class="calibration-wizard__phase">
      <div class="calibration-wizard__actions">
        <button class="calibration-wizard__abort-btn" :disabled="isSubmitting" @click="handleAbort">
          <X :size="14" /> Abbrechen
        </button>
        <button class="calibration-wizard__back-btn" :disabled="isSubmitting" @click="goBack">
          <ArrowLeft :size="14" /> Zurueck zu Punkt 1
        </button>
      </div>
      <div v-if="selectedSensorType === 'ec'" class="calibration-wizard__ec-preset-row">
        <label class="calibration-wizard__label" for="ec-preset-2">Kalibrierloesung</label>
        <select
          id="ec-preset-2"
          v-model="ecPreset"
          class="calibration-wizard__ec-preset"
        >
          <option value="0_1413">{{ EC_PRESETS['0_1413'].label }}</option>
          <option value="1413_12880">{{ EC_PRESETS['1413_12880'].label }}</option>
          <option value="custom">Eigene Werte</option>
        </select>
      </div>
      <CalibrationStep
        :step-number="2"
        :total-steps="2"
        :esp-id="selectedEspId"
        :gpio="selectedGpio!"
        :sensor-type="selectedSensorType"
        :suggested-reference="getSuggestedReference(2)"
        :reference-label="getReferenceLabel(2)"
        :last-raw-value="lastRawValue"
        :is-measuring="isMeasuring"
        :measurement-quality="measurementQuality"
        :is-fresh-measurement="isFreshMeasurement"
        @captured="onPoint2Captured"
        @request-measurement="triggerLiveMeasurement"
      />
    </div>

    <!-- Phase: Confirm -->
    <div v-if="phase === 'confirm'" class="calibration-wizard__phase">
      <h3 class="calibration-wizard__subtitle">Zusammenfassung</h3>

      <div class="calibration-wizard__summary">
        <div class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">Sensor</span>
          <span>{{ currentPreset?.label ?? selectedSensorType }}</span>
        </div>
        <div class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">ESP</span>
          <span class="calibration-wizard__summary-mono">{{ selectedEspId }}</span>
        </div>
        <div class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">GPIO</span>
          <span class="calibration-wizard__summary-mono">{{ selectedGpio }}</span>
        </div>
        <div class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">Punkt 1</span>
          <span class="calibration-wizard__summary-mono">
            RAW {{ points[0]?.raw.toFixed(1) }} → Ref {{ points[0]?.reference }}
          </span>
        </div>
        <div v-if="currentSessionId && points[0]?.point_id" class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">Punkt 1 bearbeiten</span>
          <button class="calibration-wizard__inline-action-btn" @click="deletePoint('dry')">
            Punkt 1 loeschen
          </button>
        </div>
        <div class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">Punkt 2</span>
          <span class="calibration-wizard__summary-mono">
            RAW {{ points[1]?.raw.toFixed(1) }} → Ref {{ points[1]?.reference }}
          </span>
        </div>
        <div v-if="currentSessionId && points[1]?.point_id" class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">Punkt 2 bearbeiten</span>
          <button class="calibration-wizard__inline-action-btn" @click="deletePoint('wet')">
            Punkt 2 loeschen
          </button>
        </div>
        <div class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">Methode</span>
          <span>2-Punkt Linear</span>
        </div>
      </div>

      <details class="calibration-wizard__details">
        <summary>Diagnose und Rohdaten</summary>
        <div class="calibration-wizard__summary-row">
          <span class="calibration-wizard__summary-label">Mess-Request</span>
          <span class="calibration-wizard__summary-mono">{{ measurementRequestId ?? 'nicht gesetzt' }}</span>
        </div>
      </details>

      <div class="calibration-wizard__actions">
        <button class="calibration-wizard__abort-btn" :disabled="isSubmitting" @click="handleAbort">
          <X :size="14" /> Abbrechen
        </button>
        <button class="calibration-wizard__back-btn" :disabled="isSubmitting" @click="goBack">
          <ArrowLeft :size="14" /> Zurueck
        </button>
        <button
          class="calibration-wizard__submit-btn"
          :disabled="isSubmitting"
          @click="submitCalibration"
        >
          {{ isSubmitting ? 'Kalibriere...' : 'Kalibrierung ausfuehren' }}
        </button>
      </div>
    </div>

    <!-- Phase: Done -->
    <div v-if="phase === 'done'" class="calibration-wizard__phase calibration-wizard__phase--center">
      <div class="calibration-wizard__done-icon">
        <Check :size="32" />
      </div>
      <h3 class="calibration-wizard__subtitle">Kalibrierung erfolgreich</h3>
      <p class="calibration-wizard__desc">
        {{ calibrationResult?.message ?? 'Parameter wurden gespeichert.' }}
      </p>
      <details v-if="calibrationResult?.calibration" class="calibration-wizard__details calibration-wizard__result-data">
        <summary>Forensik: Kalibrierparameter anzeigen</summary>
        <pre class="calibration-wizard__result-pre">{{ JSON.stringify(calibrationResult.calibration, null, 2) }}</pre>
      </details>
      <button class="calibration-wizard__submit-btn" @click="reset">
        <RefreshCw :size="14" /> Weitere Kalibrierung
      </button>
    </div>

    <!-- Phase: Error -->
    <div v-if="phase === 'error'" class="calibration-wizard__phase calibration-wizard__phase--center">
      <h3 class="calibration-wizard__subtitle calibration-wizard__subtitle--error">Fehler</h3>
      <p class="calibration-wizard__error-msg">{{ errorMessage }}</p>
      <div class="calibration-wizard__actions">
        <button class="calibration-wizard__back-btn" @click="goBack">
          <ArrowLeft :size="14" /> Zurueck
        </button>
        <button class="calibration-wizard__submit-btn" @click="reset">
          Neu starten
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calibration-wizard {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.calibration-wizard--compact {
  max-width: 100%;
}

.calibration-wizard__hud {
  padding: 0.75rem;
  border-radius: 0.625rem;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  background: var(--color-bg-secondary, #111118);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.calibration-wizard__hud-head {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.calibration-wizard__hud-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border-radius: 0.5rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  color: var(--color-text-secondary, #b0b0c0);
}

.calibration-wizard__hud-chip--online,
.calibration-wizard__hud-chip--good,
.calibration-wizard__hud-chip--success {
  border-color: rgba(52, 211, 153, 0.45);
  color: var(--color-success, #34d399);
}

.calibration-wizard__hud-chip--offline,
.calibration-wizard__hud-chip--critical,
.calibration-wizard__hud-chip--error {
  border-color: rgba(248, 113, 113, 0.45);
  color: var(--color-error, #f87171);
}

.calibration-wizard__hud-chip--warning,
.calibration-wizard__hud-chip--suspect,
.calibration-wizard__hud-chip--neutral {
  border-color: rgba(251, 191, 36, 0.45);
  color: var(--color-warning, #fbbf24);
}

.calibration-wizard__hud-context {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #b0b0c0);
}

.calibration-wizard__hud-context-key {
  color: var(--color-text-muted, #8585a0);
}

.calibration-wizard__hud-message {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #b0b0c0);
}

.calibration-wizard__mastery {
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  border-radius: 0.625rem;
  background: var(--color-bg-secondary, #111118);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.calibration-wizard__mastery-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.calibration-wizard__mastery-stage {
  padding: 0.45rem 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  font-size: 0.6875rem;
  text-align: center;
  color: var(--color-text-muted, #8585a0);
}

.calibration-wizard__mastery-stage--current {
  border-color: rgba(167, 139, 250, 0.5);
  color: var(--color-text-primary, #eaeaf2);
  background: rgba(167, 139, 250, 0.08);
}

.calibration-wizard__mastery-stage--done {
  border-color: rgba(52, 211, 153, 0.45);
  color: var(--color-success, #34d399);
}

.calibration-wizard__mastery-next {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #b0b0c0);
}

.calibration-wizard__header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.calibration-wizard__icon {
  color: var(--color-iridescent-1, #a78bfa);
}

.calibration-wizard__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary, #eaeaf2);
  margin: 0;
}

.calibration-wizard__subtitle {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary, #eaeaf2);
  margin: 0;
}

.calibration-wizard__subtitle--error {
  color: var(--color-error, #ef4444);
}

.calibration-wizard__desc {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #8585a0);
  line-height: 1.5;
  margin: 0;
}

.calibration-wizard__label {
  font-size: 0.75rem;
  color: var(--color-text-muted, #8585a0);
  margin: 0 0 0.5rem 0;
}

.calibration-wizard__phase {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.calibration-wizard__phase--center {
  align-items: center;
  text-align: center;
}

/* Type selection grid */
.calibration-wizard__type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.625rem;
}

.calibration-wizard__type-card {
  padding: 0.875rem;
  border-radius: 0.625rem;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  background: var(--color-bg-secondary, #111118);
  color: var(--color-text-primary, #eaeaf2);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.calibration-wizard__type-card:hover {
  border-color: var(--color-iridescent-1, #a78bfa);
  background: rgba(167,139,250,0.06);
}

.calibration-wizard__type-card--selected {
  border-color: var(--color-iridescent-1, #a78bfa);
  background: rgba(167,139,250,0.12);
}

.calibration-wizard__type-name {
  font-size: 0.8125rem;
  font-weight: 600;
}

/* Device list */
.calibration-wizard__device-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.calibration-wizard__device-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.75rem;
  background: var(--color-bg-secondary, #111118);
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  border-radius: 0.5rem;
}

.calibration-wizard__device-name {
  font-size: 0.8125rem;
  color: var(--color-text-primary, #eaeaf2);
  font-weight: 500;
}

.calibration-wizard__gpio-chips {
  display: flex;
  gap: 0.375rem;
}

.calibration-wizard__gpio-chip {
  padding: 0.25rem 0.625rem;
  font-size: 0.6875rem;
  font-family: 'JetBrains Mono', monospace;
  border-radius: 9999px;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  background: var(--color-bg-tertiary, #0d0d14);
  color: var(--color-text-muted, #8585a0);
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-wizard__gpio-chip:hover {
  border-color: var(--color-iridescent-1, #a78bfa);
  color: var(--color-text-primary, #eaeaf2);
}

.calibration-wizard__empty {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #8585a0);
  text-align: center;
  padding: 1rem;
}

/* EC Preset (nur bei sensor_type === ec) */
.calibration-wizard__ec-preset-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.calibration-wizard__ec-preset {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
  border-radius: 0.375rem;
  border: 1px solid var(--glass-border, rgba(133, 133, 160, 0.12));
  background: var(--color-bg-tertiary, #0d0d14);
  color: var(--color-text-primary, #eaeaf2);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.calibration-wizard__ec-preset:hover,
.calibration-wizard__ec-preset:focus {
  border-color: var(--color-iridescent-1, #a78bfa);
}

/* Summary */
.calibration-wizard__summary {
  background: var(--color-bg-secondary, #111118);
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  border-radius: 0.625rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.calibration-wizard__summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8125rem;
  color: var(--color-text-primary, #eaeaf2);
}

.calibration-wizard__summary-label {
  color: var(--color-text-muted, #8585a0);
  font-size: 0.75rem;
}

.calibration-wizard__summary-mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8125rem;
}

.calibration-wizard__inline-action-btn {
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-warning, #fbbf24);
  background: transparent;
  color: var(--color-warning, #fbbf24);
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-wizard__inline-action-btn:hover {
  background: rgba(251, 191, 36, 0.12);
}

/* Actions */
.calibration-wizard__actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.calibration-wizard__back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  background: var(--color-bg-secondary, #111118);
  color: var(--color-text-primary, #eaeaf2);
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-wizard__back-btn:hover {
  border-color: var(--color-text-muted, #8585a0);
}

.calibration-wizard__back-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.calibration-wizard__abort-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-text-muted, #8585a0);
  background: transparent;
  color: var(--color-text-secondary, #8585a0);
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-wizard__abort-btn:hover {
  border-color: var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
  background: rgba(239, 68, 68, 0.08);
}

.calibration-wizard__abort-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.calibration-wizard__submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 1.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: 0.5rem;
  border: none;
  background: var(--color-iridescent-1, #a78bfa);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-wizard__submit-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.calibration-wizard__submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Done */
.calibration-wizard__done-icon {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: rgba(52, 211, 153, 0.15);
  color: var(--color-success, #34d399);
  display: flex;
  align-items: center;
  justify-content: center;
}

.calibration-wizard__result-data {
  width: 100%;
  max-width: 400px;
}

.calibration-wizard__result-pre {
  background: var(--color-bg-tertiary, #0d0d14);
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--color-text-primary, #eaeaf2);
  overflow-x: auto;
  text-align: left;
}

.calibration-wizard__error-msg {
  font-size: 0.875rem;
  color: var(--color-error, #ef4444);
  margin: 0;
}

.calibration-wizard__details {
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  border-radius: 0.5rem;
  padding: 0.625rem;
  background: var(--color-bg-secondary, #111118);
}

.calibration-wizard__details summary {
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #b0b0c0);
}

.calibration-wizard--fx-success {
  animation: calibrationWizardSuccess 180ms ease-out;
}

.calibration-wizard--fx-timeout {
  animation: calibrationWizardTimeout 200ms ease-out;
}

.calibration-wizard--fx-error {
  animation: calibrationWizardError 180ms ease-out;
}

@keyframes calibrationWizardSuccess {
  0% { transform: scale(1); }
  50% { transform: scale(1.008); }
  100% { transform: scale(1); }
}

@keyframes calibrationWizardTimeout {
  0% { transform: translateX(0); }
  35% { transform: translateX(3px); }
  70% { transform: translateX(-3px); }
  100% { transform: translateX(0); }
}

@keyframes calibrationWizardError {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.12); }
  100% { filter: brightness(1); }
}
</style>
