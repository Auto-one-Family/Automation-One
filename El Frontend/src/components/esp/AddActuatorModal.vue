<script setup lang="ts">
/**
 * AddActuatorModal Component
 *
 * Extracted from ESPOrbitalLayout: Modal for adding a new actuator to an ESP device.
 * Supports:
 * - Actuator type selection (relay, pump, fan, lamp, heater, valve)
 * - GPIO selection with validation
 * - Aux GPIO for H-bridge valves
 * - PWM value for PWM actuators
 * - Safety settings (max runtime, cooldown)
 * - Inverted logic for relay modules
 */

import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'
import GpioPicker from './GpioPicker.vue'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'
import {
  getActuatorTypeOptions,
  isPwmActuator,
  supportsAuxGpio,
  supportsInvertedLogic,
  getActuatorSafetyDefaults,
} from '@/utils/actuatorDefaults'
import type { MockActuatorConfig } from '@/types'
import { createLogger } from '@/utils/logger'

const logger = createLogger('AddActuatorModal')

interface Props {
  modelValue: boolean
  espId: string
  /** Pre-selected actuator type from drag-and-drop (optional) */
  initialActuatorType?: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  added: []
}>()

const espStore = useEspStore()
const toast = useToast()

// ── Form State ───────────────────────────────────────────────────────

const defaultActuatorType = 'relay'
const actuatorTypeOptions = getActuatorTypeOptions()

const newActuator = ref<MockActuatorConfig>({
  gpio: 0,
  aux_gpio: 255,
  actuator_type: defaultActuatorType,
  name: '',
  state: false,
  pwm_value: 0,
  min_value: 0,
  max_value: 100,
  max_runtime_seconds: 0,
  cooldown_seconds: 0,
  inverted_logic: false,
})

const actuatorGpioValid = ref(false)
const actuatorAuxGpioValid = ref(true)

const actuatorAuxGpio = computed({
  get: (): number | null => newActuator.value.aux_gpio ?? 255,
  set: (value: number | null) => { newActuator.value.aux_gpio = value },
})

// ── Watchers ─────────────────────────────────────────────────────────

watch(() => newActuator.value.actuator_type, (newType) => {
  const defaults = getActuatorSafetyDefaults(newType)
  newActuator.value.max_runtime_seconds = defaults.maxRuntime
  newActuator.value.cooldown_seconds = defaults.cooldown
  if (!supportsAuxGpio(newType)) newActuator.value.aux_gpio = 255
  if (!supportsInvertedLogic(newType)) newActuator.value.inverted_logic = false
})

// Pre-select actuator type when dropped from sidebar
watch(() => props.initialActuatorType, (newType) => {
  if (newType) {
    const match = actuatorTypeOptions.find(
      opt => opt.value.toLowerCase() === newType.toLowerCase()
    )
    if (match) {
      newActuator.value.actuator_type = match.value
    }
  }
})

// ── Actions ──────────────────────────────────────────────────────────

function close() {
  emit('update:modelValue', false)
}

function resetForm() {
  const defaults = getActuatorSafetyDefaults(defaultActuatorType)
  newActuator.value = {
    gpio: 0,
    aux_gpio: 255,
    actuator_type: defaultActuatorType,
    name: '',
    state: false,
    pwm_value: 0,
    min_value: 0,
    max_value: 100,
    max_runtime_seconds: defaults.maxRuntime,
    cooldown_seconds: defaults.cooldown,
    inverted_logic: false,
  }
  actuatorGpioValid.value = false
  actuatorAuxGpioValid.value = true
}

async function addActuator() {
  try {
    await espStore.addActuator(props.espId, newActuator.value)
    toast.success('Aktor erfolgreich hinzugefügt')
    close()
    resetForm()
    espStore.fetchGpioStatus(props.espId)
    emit('added')
  } catch (err) {
    logger.error('Failed to add actuator', err)
  }
}

function onActuatorGpioValidation(valid: boolean): void {
  actuatorGpioValid.value = valid
}

function onActuatorAuxGpioValidation(valid: boolean): void {
  actuatorAuxGpioValid.value = valid
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click.self="close">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Aktor hinzufügen</h3>
          <button class="modal-close" @click="close"><X :size="20" /></button>
        </div>

        <div class="modal-body">
          <!-- GPIO -->
          <div class="form-group">
            <label class="form-label">GPIO Pin</label>
            <GpioPicker v-model="newActuator.gpio" :esp-id="espId" component-category="actuator" :show-recommendations="true" @validation="onActuatorGpioValidation" />
          </div>

          <!-- Actuator Type -->
          <div class="form-group">
            <label class="form-label">Aktor-Typ</label>
            <select v-model="newActuator.actuator_type" class="form-select">
              <option v-for="opt in actuatorTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>

          <!-- Name -->
          <div class="form-group">
            <label class="form-label">Name (optional)</label>
            <input v-model="newActuator.name" type="text" class="form-input" placeholder="z.B. Wasserpumpe 1" maxlength="100" />
          </div>

          <!-- Aux GPIO -->
          <div v-if="supportsAuxGpio(newActuator.actuator_type)" class="form-group">
            <label class="form-label">Aux-GPIO (Direction-Pin) <span class="form-label-hint">Optional</span></label>
            <GpioPicker v-model="actuatorAuxGpio" :esp-id="espId" component-category="actuator" :show-recommendations="true" :allow-empty="true" empty-value="255" empty-label="Nicht verwendet" @validation="onActuatorAuxGpioValidation" />
          </div>

          <!-- PWM -->
          <div v-if="isPwmActuator(newActuator.actuator_type)" class="form-group">
            <label class="form-label">PWM-Wert <span class="form-label-hint">{{ Math.round((newActuator.pwm_value || 0) * 100) }}%</span></label>
            <input v-model.number="newActuator.pwm_value" type="range" min="0" max="1" step="0.01" class="form-range" />
          </div>

          <!-- Max Runtime -->
          <div v-if="newActuator.actuator_type === 'pump'" class="form-group">
            <label class="form-label">Max. Laufzeit <span class="form-label-hint">Sekunden (0 = kein Limit)</span></label>
            <input v-model.number="newActuator.max_runtime_seconds" type="number" min="0" max="86400" class="form-input" placeholder="3600" />
          </div>

          <!-- Cooldown -->
          <div v-if="newActuator.actuator_type === 'pump'" class="form-group">
            <label class="form-label">Cooldown <span class="form-label-hint">Sekunden</span></label>
            <input v-model.number="newActuator.cooldown_seconds" type="number" min="0" max="3600" class="form-input" placeholder="30" />
          </div>

          <!-- Inverted Logic -->
          <div v-if="supportsInvertedLogic(newActuator.actuator_type)" class="form-group form-group--checkbox">
            <label class="form-checkbox">
              <input v-model="newActuator.inverted_logic" type="checkbox" />
              <span class="form-checkbox-label">Invertierte Logik (LOW = ON)</span>
            </label>
            <p class="form-hint">Für Relais-Module die bei LOW schalten</p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn--secondary" @click="close">Abbrechen</button>
          <button class="btn btn--primary" :disabled="!actuatorGpioValid || (supportsAuxGpio(newActuator.actuator_type) && !actuatorAuxGpioValid)" @click="addActuator">Hinzufügen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Modal styles are inherited from global/parent scope */
</style>
