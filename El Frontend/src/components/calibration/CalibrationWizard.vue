<script setup lang="ts">
/**
 * CalibrationWizard Component
 *
 * Step-by-step sensor calibration for pH/EC 2-point linear calibration.
 * Flow: Select sensor -> Capture point 1 -> Capture point 2 -> Confirm -> Done
 *
 * State management delegated to useCalibrationWizard composable (F-P1).
 */

import { computed } from 'vue'
import { ArrowLeft, Check, FlaskConical, RefreshCw, X } from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'
import { useCalibrationWizard } from '@/composables/useCalibrationWizard'
import CalibrationStep from './CalibrationStep.vue'

const espStore = useEspStore()

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
  reset,
} = useCalibrationWizard()

// Available ESPs from store
const availableDevices = computed(() =>
  espStore.devices.filter(d => espStore.getDeviceId(d))
)
</script>

<template>
  <div class="calibration-wizard">
    <div class="calibration-wizard__header">
      <FlaskConical :size="20" class="calibration-wizard__icon" />
      <h2 class="calibration-wizard__title">Sensor-Kalibrierung</h2>
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
        <div v-for="device in availableDevices" :key="espStore.getDeviceId(device)" class="calibration-wizard__device-row">
          <span class="calibration-wizard__device-name">{{ device.name || espStore.getDeviceId(device) }}</span>
          <div class="calibration-wizard__gpio-chips">
            <button
              v-for="sensor in (device.sensors ?? [])"
              :key="`${espStore.getDeviceId(device)}-${(sensor as any).gpio}`"
              class="calibration-wizard__gpio-chip"
              @click="selectSensor(espStore.getDeviceId(device), (sensor as any).gpio, selectedSensorType)"
            >
              GPIO {{ (sensor as any).gpio }}
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
      <div v-if="calibrationResult?.calibration" class="calibration-wizard__result-data">
        <pre class="calibration-wizard__result-pre">{{ JSON.stringify(calibrationResult.calibration, null, 2) }}</pre>
      </div>
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
</style>
