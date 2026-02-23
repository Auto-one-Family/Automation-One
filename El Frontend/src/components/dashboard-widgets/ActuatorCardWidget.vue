<script setup lang="ts">
/**
 * ActuatorCardWidget
 *
 * Compact actuator status card for dashboard.
 * Shows ON/OFF state, PWM value, last command source, and emergency status.
 */

import { ref, computed } from 'vue'
import { useEspStore } from '@/stores/esp'
import WidgetWrapper from './WidgetWrapper.vue'
import { Zap, Power, AlertTriangle } from 'lucide-vue-next'

interface Props {
  widgetId: string
  config?: {
    espId?: string
    gpio?: number
  }
}

const props = withDefaults(defineProps<Props>(), {
  config: () => ({}),
})

const emit = defineEmits<{
  remove: []
  'update-config': [config: Record<string, unknown>]
}>()

const espStore = useEspStore()

const selectedEspId = ref(props.config.espId || '')
const selectedGpio = ref(props.config.gpio ?? -1)

const actuator = computed(() => {
  if (!selectedEspId.value || selectedGpio.value < 0) return null
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  if (!device) return null
  return ((device as any).actuators || []).find((a: any) => a.gpio === selectedGpio.value) || null
})

const deviceName = computed(() => {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedEspId.value)
  return device?.name || selectedEspId.value
})

const isOn = computed(() => {
  if (!actuator.value) return false
  return actuator.value.state === 'ON' || actuator.value.current_state === true || actuator.value.value > 0
})

const isEmergencyStopped = computed(() => {
  return actuator.value?.emergency_stopped === true
})

const pwmValue = computed(() => {
  if (!actuator.value?.is_pwm) return null
  return actuator.value.value ?? actuator.value.pwm_value ?? 0
})

const availableActuators = computed(() => {
  const actuators: { espId: string; gpio: number; label: string }[] = []
  for (const device of espStore.devices) {
    const deviceId = espStore.getDeviceId(device)
    for (const a of ((device as any).actuators || [])) {
      actuators.push({
        espId: deviceId,
        gpio: a.gpio,
        label: `${device.name || deviceId} / ${a.name || a.actuator_type} (GPIO ${a.gpio})`,
      })
    }
  }
  return actuators
})

function selectActuator(espId: string, gpio: number) {
  selectedEspId.value = espId
  selectedGpio.value = gpio
  emit('update-config', { espId, gpio })
}
</script>

<template>
  <WidgetWrapper
    title="Aktor"
    :icon="Zap"
    @remove="$emit('remove')"
  >
    <div v-if="!actuator" class="widget-empty">
      <p>Aktor auswählen</p>
    </div>
    <div v-else class="actuator-card-content">
      <div class="actuator-name">{{ actuator.name || actuator.actuator_type }}</div>

      <div class="actuator-status" :class="{ 'status--on': isOn, 'status--emergency': isEmergencyStopped }">
        <AlertTriangle v-if="isEmergencyStopped" class="status-icon status-icon--emergency" />
        <Power v-else class="status-icon" />
        <span class="status-text">
          {{ isEmergencyStopped ? 'E-STOP' : isOn ? 'EIN' : 'AUS' }}
        </span>
      </div>

      <div v-if="pwmValue != null" class="actuator-pwm">
        <div class="pwm-bar">
          <div class="pwm-fill" :style="{ width: `${Math.min(100, (pwmValue / 255) * 100)}%` }" />
        </div>
        <span class="pwm-value">{{ Math.round((pwmValue / 255) * 100) }}%</span>
      </div>

      <div class="actuator-meta">
        <span class="actuator-device">{{ deviceName }}</span>
      </div>
    </div>

    <template #config="{ close }">
      <div class="widget-config-inner">
        <label class="config-label">Aktor</label>
        <select
          class="config-select"
          :value="`${selectedEspId}:${selectedGpio}`"
          @change="(e) => {
            const [esp, gpio] = (e.target as HTMLSelectElement).value.split(':')
            selectActuator(esp, parseInt(gpio))
          }"
        >
          <option value=":-1" disabled>Aktor wählen...</option>
          <option
            v-for="a in availableActuators"
            :key="`${a.espId}:${a.gpio}`"
            :value="`${a.espId}:${a.gpio}`"
          >
            {{ a.label }}
          </option>
        </select>
        <button class="config-close-btn" @click="close()">Schließen</button>
      </div>
    </template>
  </WidgetWrapper>
</template>

<style scoped>
.actuator-card-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  gap: var(--space-2);
  padding: var(--space-1);
}

.actuator-name {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actuator-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: rgba(133, 133, 160, 0.05);
}

.actuator-status.status--on {
  background: rgba(52, 211, 153, 0.1);
}

.actuator-status.status--emergency {
  background: rgba(248, 113, 113, 0.12);
}

.status-icon {
  width: 18px;
  height: 18px;
  color: var(--color-text-muted);
}

.status--on .status-icon {
  color: var(--color-success);
}

.status-icon--emergency {
  color: var(--color-error) !important;
}

.status-text {
  font-size: var(--text-sm);
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-primary);
}

.actuator-pwm {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.pwm-bar {
  flex: 1;
  height: 4px;
  background: var(--color-bg-quaternary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.pwm-fill {
  height: 100%;
  background: var(--color-accent-bright);
  border-radius: var(--radius-full);
  transition: width var(--transition-base);
}

.pwm-value {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  min-width: 30px;
  text-align: right;
}

.actuator-meta {
  display: flex;
  align-items: center;
}

.actuator-device {
  font-size: 10px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.widget-config-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.config-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.config-select {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-xs);
  font-family: inherit;
}

.config-close-btn {
  align-self: flex-end;
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.config-close-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}
</style>
