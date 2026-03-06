<script setup lang="ts">
/**
 * CalibrationStep Component
 *
 * A single calibration point capture step.
 * Shows instructions, a live raw-value display, and a reference input.
 */

import { ref, computed, watch } from 'vue'
import { sensorsApi } from '@/api/sensors'

interface Props {
  stepNumber: number
  totalSteps: number
  espId: string
  gpio: number
  sensorType: string
  /** Suggested reference value (e.g. 4.0 for pH buffer) */
  suggestedReference?: number
  /** Label for the reference solution */
  referenceLabel?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'captured', payload: { raw: number; reference: number }): void
}>()

const rawValue = ref<number | null>(null)
const referenceValue = ref<number>(props.suggestedReference ?? 0)
const isReading = ref(false)

watch(
  () => props.suggestedReference,
  (val) => {
    if (val !== undefined) referenceValue.value = val
  },
  { immediate: false }
)
const readError = ref<string | null>(null)

const canCapture = computed(() => rawValue.value !== null && referenceValue.value !== undefined)

async function readCurrentValue() {
  isReading.value = true
  readError.value = null
  try {
    const response = await sensorsApi.queryData({
      esp_id: props.espId,
      gpio: props.gpio,
      sensor_type: props.sensorType,
      limit: 1,
    })
    if (response.readings.length > 0) {
      rawValue.value = response.readings[0].raw_value
    } else {
      readError.value = 'Kein aktueller Messwert verfuegbar'
    }
  } catch {
    readError.value = 'Fehler beim Lesen des Sensorwerts'
  } finally {
    isReading.value = false
  }
}

function capture() {
  if (rawValue.value === null) return
  emit('captured', { raw: rawValue.value, reference: referenceValue.value })
}
</script>

<template>
  <div class="calibration-step">
    <div class="calibration-step__header">
      <span class="calibration-step__badge">{{ stepNumber }} / {{ totalSteps }}</span>
      <h3 class="calibration-step__title">
        Kalibrierpunkt {{ stepNumber }}
      </h3>
    </div>

    <p v-if="referenceLabel" class="calibration-step__instruction">
      Sensor in <strong>{{ referenceLabel }}</strong> eintauchen und stabilisieren lassen.
    </p>

    <!-- Live raw value -->
    <div class="calibration-step__reading">
      <div class="calibration-step__reading-label">Aktueller Rohwert (ADC)</div>
      <div class="calibration-step__reading-value" :class="{ 'calibration-step__reading-value--empty': rawValue === null }">
        {{ rawValue !== null ? rawValue.toFixed(1) : '—' }}
      </div>
      <button
        class="calibration-step__read-btn"
        :disabled="isReading"
        @click="readCurrentValue"
      >
        {{ isReading ? 'Lese...' : 'Wert lesen' }}
      </button>
      <div v-if="readError" class="calibration-step__error-row">
        <span class="calibration-step__error">{{ readError }}</span>
        <button
          class="calibration-step__retry-btn"
          :disabled="isReading"
          @click="readCurrentValue"
        >
          Erneut versuchen
        </button>
      </div>
    </div>

    <!-- Reference value input -->
    <div class="calibration-step__reference">
      <label class="calibration-step__label" :for="`ref-${stepNumber}`">
        Referenzwert (bekannt)
      </label>
      <input
        :id="`ref-${stepNumber}`"
        v-model.number="referenceValue"
        type="number"
        step="any"
        class="calibration-step__input"
      />
    </div>

    <button
      class="calibration-step__capture-btn"
      :disabled="!canCapture"
      @click="capture"
    >
      Punkt uebernehmen
    </button>
  </div>
</template>

<style scoped>
.calibration-step {
  background: var(--color-bg-secondary, #111118);
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  border-radius: 0.75rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.calibration-step__header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.calibration-step__badge {
  background: var(--color-iridescent-1, #a78bfa);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.calibration-step__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary, #eaeaf2);
  margin: 0;
}

.calibration-step__instruction {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #8585a0);
  line-height: 1.5;
  margin: 0;
}

.calibration-step__reading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--color-bg-tertiary, #0d0d14);
  border-radius: 0.5rem;
}

.calibration-step__reading-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #8585a0);
}

.calibration-step__reading-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-iridescent-1, #a78bfa);
}

.calibration-step__reading-value--empty {
  color: var(--color-text-muted, #484860);
}

.calibration-step__read-btn {
  padding: 0.375rem 1rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  background: var(--color-bg-secondary, #111118);
  color: var(--color-text-primary, #eaeaf2);
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-step__read-btn:hover:not(:disabled) {
  border-color: var(--color-iridescent-1, #a78bfa);
  background: rgba(167,139,250,0.08);
}

.calibration-step__read-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.calibration-step__error {
  font-size: 0.75rem;
  color: var(--color-error, #ef4444);
}

.calibration-step__error-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.calibration-step__retry-btn {
  padding: 0.375rem 1rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-warning, #fbbf24);
  background: transparent;
  color: var(--color-warning, #fbbf24);
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-step__retry-btn:hover:not(:disabled) {
  background: rgba(251, 191, 36, 0.1);
}

.calibration-step__retry-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.calibration-step__reference {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.calibration-step__label {
  font-size: 0.75rem;
  color: var(--color-text-muted, #8585a0);
}

.calibration-step__input {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: 'JetBrains Mono', monospace;
  border-radius: 0.375rem;
  border: 1px solid var(--glass-border, rgba(133,133,160,0.12));
  background: var(--color-bg-tertiary, #0d0d14);
  color: var(--color-text-primary, #eaeaf2);
  outline: none;
  transition: border-color 0.15s;
}

.calibration-step__input:focus {
  border-color: var(--color-iridescent-1, #a78bfa);
}

.calibration-step__capture-btn {
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

.calibration-step__capture-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.calibration-step__capture-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}
</style>
