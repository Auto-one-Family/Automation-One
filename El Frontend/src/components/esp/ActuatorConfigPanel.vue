<script setup lang="ts">
/**
 * ActuatorConfigPanel — Three-Zone Actuator Configuration
 *
 * Zone 1 (Basic, always visible): Control (ON/OFF/PWM), Name, Enabled, Subzone
 * Zone 2 (Accordion): Type-specific settings (Pump/Valve/PWM/Relay)
 * Zone 3 (Accordion - Expert): Safety status, Emergency Stop
 *
 * Used inside ESPSettingsSheet as SlideOver panel.
 */

import { ref, computed, onMounted, watch } from 'vue'
import { Save, Power, AlertOctagon, Zap, Clock, Shield, Settings } from 'lucide-vue-next'
import { actuatorsApi } from '@/api/actuators'
import { subzonesApi } from '@/api/subzones'
import { espApi } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'
import { AccordionSection } from '@/shared/design/primitives'
import type { MockActuator } from '@/types'
import DeviceMetadataSection from '@/components/devices/DeviceMetadataSection.vue'
import LinkedRulesSection from '@/components/devices/LinkedRulesSection.vue'
import type { DeviceMetadata } from '@/types/device-metadata'
import { parseDeviceMetadata, mergeDeviceMetadata } from '@/types/device-metadata'

interface Props {
  espId: string
  gpio: number
  actuatorType: string
}

const props = defineProps<Props>()

const toast = useToast()
const espStore = useEspStore()

// =============================================================================
// State
// =============================================================================
const loading = ref(true)
const saving = ref(false)
const commandLoading = ref(false)

// Basic fields
const name = ref('')
const description = ref('')
const enabled = ref(true)

// Subzone
const subzoneId = ref<string | null>(null)
const availableSubzones = ref<{ id: string; name: string }[]>([])

// Type-specific fields
const maxRuntime = ref(3600) // seconds
const minPause = ref(60) // seconds
const maxOpenTime = ref(3600) // seconds
const isNormalClosed = ref(true)
const pwmFrequency = ref(5000) // Hz
const powerLimit = ref(100) // %
const switchDelay = ref(50) // ms

// Device Metadata
const metadata = ref<DeviceMetadata>({})

// =============================================================================
// Computed
// =============================================================================
const isMock = computed(() => espApi.isMockEsp(props.espId))
const isPump = computed(() => props.actuatorType.toLowerCase() === 'pump')
const isValve = computed(() => props.actuatorType.toLowerCase() === 'valve')
const isPWM = computed(() => props.actuatorType.toLowerCase() === 'pwm')
const isRelay = computed(() => props.actuatorType.toLowerCase() === 'relay')

/** Live actuator state from store */
const liveActuator = computed<MockActuator | null>(() => {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
  const actuators = (device?.actuators as MockActuator[]) || []
  return actuators.find(a => a.gpio === props.gpio) ?? null
})

const isOn = computed(() => !!liveActuator.value?.state)
const isEmergencyStopped = computed(() => !!liveActuator.value?.emergency_stopped)
const currentPwmValue = ref(0)

/** Storage key prefix for accordion persistence */
const accordionKey = computed(() => `actuator-${props.espId}-${props.gpio}`)

// =============================================================================
// Load existing config
// =============================================================================
onMounted(async () => {
  const isMock = espApi.isMockEsp(props.espId)

  // Load actuator config from server (real devices only)
  if (!isMock) {
    try {
      const config = await actuatorsApi.get(props.espId, props.gpio)
      if (config) {
        name.value = (config as any).name || ''
        description.value = (config as any).description || ''
        enabled.value = (config as any).enabled !== false
        maxRuntime.value = (config as any).max_on_duration_ms ? Math.round((config as any).max_on_duration_ms / 1000) : 3600
        minPause.value = (config as any).min_pause_seconds || 60
        maxOpenTime.value = (config as any).max_open_time_seconds || 3600
        isNormalClosed.value = (config as any).active_high !== true
        pwmFrequency.value = (config as any).frequency || 5000
        powerLimit.value = (config as any).duty_max || 100
        switchDelay.value = (config as any).switch_delay_ms || 50

        if ((config as any).subzone_id) {
          subzoneId.value = (config as any).subzone_id
        }

        // Device metadata
        metadata.value = parseDeviceMetadata((config as any).metadata)
      }
    } catch {
      // No existing config
    }
  } else if (liveActuator.value) {
    // Mock device: read config from store
    const act = liveActuator.value as any
    name.value = act.name || ''
    description.value = act.description || ''
    enabled.value = act.enabled !== false
  }
  loading.value = false

  // Load existing subzone from device store (more reliable than config)
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
  if (device?.subzone_id && !subzoneId.value) {
    subzoneId.value = device.subzone_id
  }

  // Load available subzones (real devices only)
  if (!isMock) {
    try {
      const result = await subzonesApi.getSubzones(props.espId)
      if (result && Array.isArray(result)) {
        availableSubzones.value = result.map((sz: any) => ({
          id: sz.subzone_id || sz.id,
          name: sz.subzone_name || sz.name || sz.subzone_id || sz.id,
        }))
      }
    } catch {
      // No subzones available — that's fine
    }
  }
})

// Watch live PWM value
watch(liveActuator, (act) => {
  if (act && typeof act.pwm_value === 'number') {
    currentPwmValue.value = act.pwm_value
  }
}, { immediate: true, deep: true })

// =============================================================================
// Commands
// =============================================================================
async function toggleActuator() {
  commandLoading.value = true
  try {
    const command = isOn.value ? 'OFF' : 'ON'
    await espStore.sendActuatorCommand(props.espId, props.gpio, command)
  } catch {
    // Toast handled by store
  } finally {
    commandLoading.value = false
  }
}

async function setPwmValue(value: number) {
  commandLoading.value = true
  try {
    await espStore.sendActuatorCommand(props.espId, props.gpio, 'PWM', value)
    currentPwmValue.value = value
  } catch {
    // Toast handled by store
  } finally {
    commandLoading.value = false
  }
}

async function emergencyStop() {
  commandLoading.value = true
  try {
    if (isMock.value) {
      // Mock: use store emergency stop (debug API)
      await espStore.emergencyStop(props.espId, 'Manueller Stopp ueber Konfigurations-Panel')
    } else {
      // Real: use actuators API
      await actuatorsApi.emergencyStop({
        esp_id: props.espId,
        gpio: props.gpio,
        reason: 'Manueller Stopp ueber Konfigurations-Panel',
      })
    }
    toast.warning('Emergency-Stop ausgeloest')
  } catch {
    toast.error('Emergency-Stop fehlgeschlagen')
  } finally {
    commandLoading.value = false
  }
}

// =============================================================================
// Save
// =============================================================================
async function handleSave() {
  saving.value = true
  try {
    if (isMock.value) {
      // Mock: config lives in device_metadata, just show success
      // Name/description changes are cosmetic for mock devices
      toast.success('Aktor-Konfiguration gespeichert')
    } else {
      // Real: save to server via actuators API
      const config: Record<string, unknown> = {
        esp_id: props.espId,
        gpio: props.gpio,
        actuator_type: props.actuatorType,
        name: name.value || null,
        description: description.value || null,
        enabled: enabled.value,
        subzone_id: subzoneId.value,
      }

      if (isPump.value) {
        config.max_on_duration_ms = maxRuntime.value * 1000
        config.min_pause_seconds = minPause.value
      }

      if (isValve.value) {
        config.max_open_time_seconds = maxOpenTime.value
        config.active_high = !isNormalClosed.value
      }

      if (isPWM.value) {
        config.frequency = pwmFrequency.value
        config.duty_max = powerLimit.value
      }

      if (isRelay.value) {
        config.active_high = !isNormalClosed.value
        config.switch_delay_ms = switchDelay.value
      }

      // Device metadata
      config.metadata = mergeDeviceMetadata(null, metadata.value)

      await actuatorsApi.createOrUpdate(props.espId, props.gpio, config as any)
      toast.success('Aktor-Konfiguration gespeichert')
    }
  } catch (err) {
    const msg = (err as any)?.response?.data?.detail ?? 'Fehler beim Speichern'
    toast.error(msg)
  } finally {
    saving.value = false
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}
</script>

<template>
  <div class="actuator-config" :class="{ 'actuator-config--loading': loading }">
    <div v-if="loading" class="actuator-config__loading">Lade Konfiguration...</div>

    <template v-else>
      <!-- ═══ ZONE 1: BASIC (Control + Identity) ═════════════════════════ -->

      <!-- Control Panel -->
      <section class="actuator-config__section actuator-config__section--control">
        <h3 class="actuator-config__section-title">
          <Power class="w-4 h-4" />
          Steuerung
        </h3>

        <div class="actuator-config__state-box" :class="isOn ? 'actuator-config__state-box--on' : 'actuator-config__state-box--off'">
          <div class="actuator-config__state-indicator">
            <span class="actuator-config__state-dot" />
            <span class="actuator-config__state-text">{{ isOn ? 'AKTIV' : 'INAKTIV' }}</span>
          </div>

          <!-- Toggle for non-PWM -->
          <button
            v-if="!isPWM"
            class="actuator-config__toggle-btn"
            :class="{
              'actuator-config__toggle-btn--on': isOn,
              'actuator-config__toggle-btn--emergency': isEmergencyStopped,
            }"
            :disabled="commandLoading || isEmergencyStopped"
            @click="toggleActuator"
          >
            {{ isEmergencyStopped ? 'Not-Stopp aktiv' : commandLoading ? '...' : isOn ? 'Ausschalten' : 'Einschalten' }}
          </button>
        </div>

        <!-- PWM Slider -->
        <div v-if="isPWM" class="actuator-config__pwm-control">
          <label class="actuator-config__label">PWM-Wert: {{ currentPwmValue }}%</label>
          <input
            type="range"
            min="0"
            :max="powerLimit"
            :value="currentPwmValue"
            class="actuator-config__pwm-slider"
            :disabled="isEmergencyStopped"
            @change="setPwmValue(Number(($event.target as HTMLInputElement).value))"
          />
          <div class="actuator-config__pwm-labels">
            <span>0%</span>
            <span>{{ powerLimit }}%</span>
          </div>
        </div>
      </section>

      <!-- Basic Fields -->
      <section class="actuator-config__section">
        <h3 class="actuator-config__section-title">Grundeinstellungen</h3>

        <div class="actuator-config__field">
          <label class="actuator-config__label">Name</label>
          <input v-model="name" type="text" class="actuator-config__input" placeholder="z.B. Bewaesserungspumpe Zone A" />
        </div>

        <div class="actuator-config__field">
          <label class="actuator-config__label">Beschreibung</label>
          <input v-model="description" type="text" class="actuator-config__input" placeholder="Optional" />
        </div>

        <div class="actuator-config__field actuator-config__field--toggle">
          <label class="actuator-config__label">Aktiv</label>
          <button
            :class="['actuator-config__toggle', { 'actuator-config__toggle--on': enabled }]"
            @click="enabled = !enabled"
          >
            <span class="actuator-config__toggle-dot" />
          </button>
        </div>

        <!-- Subzone assignment -->
        <div class="actuator-config__field">
          <label class="actuator-config__label">Subzone</label>
          <select v-model="subzoneId" class="actuator-config__select">
            <option :value="null">Keine Subzone</option>
            <option
              v-for="sz in availableSubzones"
              :key="sz.id"
              :value="sz.id"
            >
              {{ sz.name }}
            </option>
          </select>
        </div>
      </section>

      <!-- ═══ ZONE 2: ADVANCED (Accordion) ════════════════════════════════ -->

      <!-- Type-Specific Settings -->
      <AccordionSection
        title="Typ-Einstellungen"
        :storage-key="`${accordionKey}-type`"
        :icon="Settings"
      >
        <div class="actuator-config__type-badge-row">
          Typ:
          <span class="actuator-config__type-badge">{{ actuatorType }}</span>
        </div>

        <div class="actuator-config__field">
          <label class="actuator-config__label">GPIO Pin</label>
          <select class="actuator-config__select" disabled>
            <option :value="gpio">GPIO {{ gpio }}</option>
          </select>
          <span class="actuator-config__helper">Pin kann nach Erstellung nicht geaendert werden</span>
        </div>

        <!-- Pump -->
        <template v-if="isPump">
          <div class="actuator-config__field">
            <label class="actuator-config__label">Max. Laufzeit (Safety)</label>
            <div class="actuator-config__input-with-unit">
              <input v-model.number="maxRuntime" type="number" min="1" class="actuator-config__input" />
              <span class="actuator-config__unit">Sek. ({{ formatDuration(maxRuntime) }})</span>
            </div>
            <span class="actuator-config__helper">Pumpe schaltet IMMER nach dieser Zeit ab</span>
          </div>
          <div class="actuator-config__field">
            <label class="actuator-config__label">Mindest-Pause zwischen Laeufen</label>
            <div class="actuator-config__input-with-unit">
              <input v-model.number="minPause" type="number" min="0" class="actuator-config__input" />
              <span class="actuator-config__unit">Sek.</span>
            </div>
          </div>
        </template>

        <!-- Valve -->
        <template v-else-if="isValve">
          <div class="actuator-config__field">
            <label class="actuator-config__label">Max. Offen-Zeit (Safety)</label>
            <div class="actuator-config__input-with-unit">
              <input v-model.number="maxOpenTime" type="number" min="1" class="actuator-config__input" />
              <span class="actuator-config__unit">Sek. ({{ formatDuration(maxOpenTime) }})</span>
            </div>
          </div>
          <div class="actuator-config__field actuator-config__field--toggle">
            <label class="actuator-config__label">Normal-Closed (NC)</label>
            <button
              :class="['actuator-config__toggle', { 'actuator-config__toggle--on': isNormalClosed }]"
              @click="isNormalClosed = !isNormalClosed"
            >
              <span class="actuator-config__toggle-dot" />
            </button>
          </div>
        </template>

        <!-- PWM -->
        <template v-else-if="isPWM">
          <div class="actuator-config__field">
            <label class="actuator-config__label">Frequenz</label>
            <div class="actuator-config__input-with-unit">
              <input v-model.number="pwmFrequency" type="number" min="1" max="40000" class="actuator-config__input" />
              <span class="actuator-config__unit">Hz</span>
            </div>
            <span class="actuator-config__helper">Typisch: 1000 Hz (Motoren), 25000 Hz (Luefter)</span>
          </div>
          <div class="actuator-config__field">
            <label class="actuator-config__label">Leistungs-Limit (Safety)</label>
            <div class="actuator-config__input-with-unit">
              <input v-model.number="powerLimit" type="number" min="0" max="100" class="actuator-config__input" />
              <span class="actuator-config__unit">%</span>
            </div>
          </div>
        </template>

        <!-- Relay -->
        <template v-else-if="isRelay">
          <div class="actuator-config__field actuator-config__field--toggle">
            <label class="actuator-config__label">Normal-Closed (NC)</label>
            <button
              :class="['actuator-config__toggle', { 'actuator-config__toggle--on': isNormalClosed }]"
              @click="isNormalClosed = !isNormalClosed"
            >
              <span class="actuator-config__toggle-dot" />
            </button>
          </div>
          <div class="actuator-config__field">
            <label class="actuator-config__label">Schalt-Verzoegerung (Anti-Prellen)</label>
            <div class="actuator-config__input-with-unit">
              <input v-model.number="switchDelay" type="number" min="0" max="5000" class="actuator-config__input" />
              <span class="actuator-config__unit">ms</span>
            </div>
          </div>
        </template>
      </AccordionSection>

      <!-- Safety -->
      <AccordionSection
        title="Safety-Status"
        :storage-key="`${accordionKey}-safety`"
        :icon="Shield"
      >
        <div class="actuator-config__safety-info">
          <div class="actuator-config__safety-row">
            <Clock class="w-3.5 h-3.5" />
            <span>Letzter Befehl: {{ liveActuator?.last_command || '&mdash;' }}</span>
          </div>
          <div class="actuator-config__safety-row">
            <Zap class="w-3.5 h-3.5" />
            <span>Zustand: {{ isOn ? 'Aktiv' : 'Inaktiv' }}</span>
          </div>
          <div v-if="isEmergencyStopped" class="actuator-config__safety-row actuator-config__safety-row--alert">
            <AlertOctagon class="w-3.5 h-3.5" />
            <span>Not-Stopp aktiv — Steuerung gesperrt</span>
          </div>
        </div>

        <!-- Emergency Stop -->
        <button
          class="actuator-config__emergency"
          :disabled="commandLoading"
          @click="emergencyStop"
        >
          <AlertOctagon class="w-5 h-5" />
          NOTFALL-STOPP
        </button>
      </AccordionSection>

      <!-- ═══ DEVICE INFO (Metadata) ═════════════════════════════════════ -->
      <AccordionSection
        title="Geräte-Informationen"
        :storage-key="`${accordionKey}-device-info`"
      >
        <DeviceMetadataSection
          :metadata="metadata"
          @update:metadata="metadata = $event"
        />
      </AccordionSection>

      <!-- ═══ LINKED RULES ════════════════════════════════════════════════ -->
      <AccordionSection
        title="Verknüpfte Regeln"
        :storage-key="`${accordionKey}-linked-rules`"
      >
        <LinkedRulesSection
          :esp-id="espId"
          :gpio="gpio"
          device-type="actuator"
        />
      </AccordionSection>

      <!-- ═══ SAVE BUTTON ════════════════════════════════════════════════ -->
      <div class="actuator-config__actions">
        <button
          class="actuator-config__save"
          :disabled="saving || loading"
          @click="handleSave"
        >
          <Save class="w-4 h-4" />
          {{ saving ? 'Speichert...' : 'Speichern' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.actuator-config {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.actuator-config--loading { opacity: 0.6; }
.actuator-config__loading { padding: var(--space-8); text-align: center; color: var(--color-text-muted); }

/* Sections */
.actuator-config__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--glass-border);
}

.actuator-config__section:last-of-type { border-bottom: none; }

.actuator-config__section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin: 0;
}

/* Control Panel */
.actuator-config__state-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
}

.actuator-config__state-box--on {
  background: rgba(34, 197, 94, 0.06);
  border-color: rgba(34, 197, 94, 0.3);
}

.actuator-config__state-box--off {
  background: var(--color-bg-tertiary);
}

.actuator-config__state-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.actuator-config__state-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-status-offline);
}

.actuator-config__state-box--on .actuator-config__state-dot {
  background: var(--color-status-good);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

.actuator-config__state-text {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text-primary);
}

.actuator-config__toggle-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid var(--color-status-good);
  background: transparent;
  color: var(--color-status-good);
}

.actuator-config__toggle-btn:hover { background: rgba(34, 197, 94, 0.1); }

.actuator-config__toggle-btn--on {
  border-color: var(--color-status-alarm);
  color: var(--color-status-alarm);
}

.actuator-config__toggle-btn--on:hover { background: rgba(239, 68, 68, 0.1); }
.actuator-config__toggle-btn--emergency {
  border-color: var(--color-status-alarm);
  color: var(--color-status-alarm);
  opacity: 0.7;
}
.actuator-config__toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* PWM */
.actuator-config__pwm-control {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.actuator-config__pwm-slider {
  width: 100%;
  accent-color: var(--color-accent);
}

.actuator-config__pwm-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--color-text-muted);
}

/* Fields */
.actuator-config__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.actuator-config__field--toggle {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.actuator-config__label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.actuator-config__input {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-base);
  font-family: var(--font-body);
}

.actuator-config__input:focus { outline: none; border-color: var(--color-accent); }
.actuator-config__input:disabled { opacity: 0.5; }

.actuator-config__select {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-base);
}

.actuator-config__input-with-unit {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.actuator-config__input-with-unit .actuator-config__input { flex: 1; }

.actuator-config__unit {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.actuator-config__helper {
  font-size: 10px;
  color: var(--color-text-muted);
}

.actuator-config__type-badge-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-weight: 600;
}

.actuator-config__type-badge {
  display: inline-block;
  padding: 1px 6px;
  background: var(--color-accent-dim);
  color: var(--color-accent-bright);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
}

/* Toggle */
.actuator-config__toggle {
  position: relative;
  width: 40px;
  height: 22px;
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.actuator-config__toggle--on { background: var(--color-status-good); border-color: transparent; }

.actuator-config__toggle-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
}

.actuator-config__toggle--on .actuator-config__toggle-dot { transform: translateX(18px); }

/* Safety */
.actuator-config__safety-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.actuator-config__safety-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.actuator-config__safety-row--alert {
  color: var(--color-status-alarm);
  font-weight: 600;
}

.actuator-config__emergency {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: rgba(239, 68, 68, 0.1);
  border: 2px solid var(--color-status-alarm);
  border-radius: var(--radius-md);
  color: var(--color-status-alarm);
  font-size: var(--text-base);
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.actuator-config__emergency:hover {
  background: rgba(239, 68, 68, 0.2);
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.3);
}

.actuator-config__emergency:disabled { opacity: 0.5; cursor: not-allowed; }

/* Actions */
.actuator-config__actions { padding-top: var(--space-2); }

.actuator-config__save {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  justify-content: center;
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.actuator-config__save:hover:not(:disabled) { filter: brightness(1.1); }
.actuator-config__save:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
