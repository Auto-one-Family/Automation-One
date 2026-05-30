<script setup lang="ts">
import { computed, ref } from 'vue'
import { OctagonX } from 'lucide-vue-next'
import { apiClient } from '@/api/client'
import { emergencyStop } from '@/api/actuators'
import {
  formatDeviceContextCaption,
  getDeviceDisplayName,
} from '@/composables/usePhytaDeviceDisplay'
import { useEspStore } from '@/stores/espStore'
import { getSensorConfig } from '@/utils/sensorDefaults'
import { getActuatorConfig } from '@/utils/actuatorDefaults'

interface Props {
  payload: {
    kind: 'sensor' | 'actuator'
    type: string
    espId: string
    deviceIndex?: number
  }
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const espStore = useEspStore()
const tab = ref(0)
const name = ref('')
const saving = ref(false)
const error = ref<string | null>(null)
const emergencyLoading = ref(false)

const device = computed(() => espStore.findDevice(props.payload.espId))
const deviceTitle = computed(() =>
  device.value
    ? getDeviceDisplayName(device.value, props.payload.deviceIndex)
    : props.payload.espId,
)
const deviceContextCaption = computed(() =>
  device.value ? formatDeviceContextCaption(device.value, props.payload.deviceIndex) : '',
)

const sensorConfig = computed(() =>
  props.payload.kind === 'sensor' ? getSensorConfig(props.payload.type) : null,
)

const typeLabel = computed(() => {
  if (props.payload.kind === 'sensor') {
    return sensorConfig.value?.label ?? props.payload.type
  }
  return getActuatorConfig(props.payload.type)?.label ?? props.payload.type
})

const tabs = computed(() => {
  if (props.payload.kind === 'sensor') {
    return ['Allgemein', 'Schwellen', 'Hardware', 'Live']
  }
  return ['Allgemein', 'Sicherheit', 'Hardware', 'Live']
})

async function save(): Promise<void> {
  saving.value = true
  error.value = null
  try {
    if (props.payload.kind === 'sensor') {
      await apiClient.post(`/esp/devices/${props.payload.espId}/sensors`, {
        gpio: 0,
        sensor_type: props.payload.type,
        name: name.value || props.payload.type,
        active: true,
      })
    } else {
      await apiClient.post(`/esp/devices/${props.payload.espId}/actuators`, {
        gpio: 0,
        actuator_type: props.payload.type,
        name: name.value || props.payload.type,
        active: true,
      })
    }
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Speichern fehlgeschlagen'
  } finally {
    saving.value = false
  }
}

async function handleEmergencyStop(): Promise<void> {
  emergencyLoading.value = true
  error.value = null
  try {
    await emergencyStop(`Not-Aus aus Wizard (${deviceTitle.value})`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Not-Aus fehlgeschlagen'
  } finally {
    emergencyLoading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 glass-overlay"
      aria-label="Wizard schließen"
      @click="emit('close')"
    />
    <div class="relative z-10 w-full max-w-lg glass-panel iridescent-border rounded-xl p-6">
      <h3 class="text-lg font-semibold">
        {{ payload.kind === 'sensor' ? 'Sensor' : 'Aktor' }} — {{ typeLabel }}
      </h3>
      <p class="mt-1 text-sm font-medium text-dark-200">{{ deviceTitle }}</p>
      <p
        v-if="deviceContextCaption"
        class="mt-0.5 text-xs text-dark-400"
      >
        {{ deviceContextCaption }}
      </p>

      <nav class="mt-4 flex flex-wrap gap-1" role="tablist">
        <button
          v-for="(label, i) in tabs"
          :key="label"
          type="button"
          role="tab"
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          :class="tab === i ? 'bg-accent text-white' : 'text-dark-400 hover:bg-dark-800'"
          :aria-selected="tab === i"
          @click="tab = i"
        >
          {{ label }}
        </button>
      </nav>

      <!-- Allgemein -->
      <div v-if="tab === 0" class="mt-4 space-y-3">
        <div>
          <label class="block text-sm text-dark-300" for="wizard-name">Name</label>
          <input
            id="wizard-name"
            v-model="name"
            class="phyta-input mt-1"
            :placeholder="typeLabel"
            aria-label="Name"
          />
        </div>
        <p class="text-xs text-dark-400">
          Typ: <span class="font-mono text-dark-200">{{ payload.type }}</span>
        </p>
      </div>

      <!-- Schwellen (Sensor) / Sicherheit (Aktor) -->
      <div v-else-if="tab === 1" class="mt-4 space-y-4">
        <template v-if="payload.kind === 'sensor' && sensorConfig">
          <p class="text-sm text-dark-300">{{ sensorConfig.description }}</p>
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-lg border border-glass-border bg-dark-900 p-3">
              <dt class="text-xxs uppercase text-dark-400">Minimum</dt>
              <dd class="font-mono text-accent-bright">{{ sensorConfig.min }} {{ sensorConfig.unit }}</dd>
            </div>
            <div class="rounded-lg border border-glass-border bg-dark-900 p-3">
              <dt class="text-xxs uppercase text-dark-400">Maximum</dt>
              <dd class="font-mono text-accent-bright">{{ sensorConfig.max }} {{ sensorConfig.unit }}</dd>
            </div>
            <div class="col-span-2 rounded-lg border border-glass-border bg-dark-900 p-3">
              <dt class="text-xxs uppercase text-dark-400">Einheit · Dezimalstellen</dt>
              <dd class="font-mono text-dark-100">{{ sensorConfig.unit }} · {{ sensorConfig.decimals }}</dd>
            </div>
          </dl>
        </template>
        <template v-else-if="payload.kind === 'actuator'">
          <p v-if="getActuatorConfig(payload.type)?.description" class="text-sm text-dark-300">
            {{ getActuatorConfig(payload.type)?.description }}
          </p>
          <p class="text-sm text-dark-300">
            Sicherheitsrelevante Aktionen für dieses Gerät. Not-Aus stoppt alle Aktoren systemweit.
          </p>
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm font-bold text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
            :disabled="emergencyLoading"
            aria-label="Not-Aus auslösen"
            @click="handleEmergencyStop"
          >
            <OctagonX :size="18" aria-hidden="true" />
            {{ emergencyLoading ? 'Stoppt…' : 'NOT-AUS (alle Aktoren)' }}
          </button>
        </template>
        <p v-else class="text-sm text-dark-400">Keine Schwellen-Konfiguration für diesen Typ.</p>
      </div>

      <!-- Hardware -->
      <div v-else-if="tab === 2" class="mt-4">
        <p class="text-sm text-dark-400">
          GPIO-Zuweisung und Bus-Scan folgen in einer späteren Phase (I2C-Scan unter
          <span class="font-mono text-dark-300">/hardware/:espId/scan</span>).
        </p>
      </div>

      <!-- Live / Verlauf -->
      <div v-else class="mt-4">
        <p class="text-sm text-dark-400">
          Live-Werte erscheinen nach Speichern im Orbital-Layout via WebSocket.
        </p>
      </div>

      <p v-if="error" class="mt-3 text-sm text-danger" role="alert">{{ error }}</p>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm text-dark-300 hover:bg-dark-800"
          @click="emit('close')"
        >
          Abbrechen
        </button>
        <button
          type="button"
          class="phyta-btn-primary px-4 py-2 text-sm"
          :disabled="saving"
          aria-label="Speichern"
          @click="save"
        >
          {{ saving ? 'Speichert…' : 'Speichern' }}
        </button>
      </div>
    </div>
  </div>
</template>
