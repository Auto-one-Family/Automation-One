<script setup lang="ts">
/**
 * RuleConfigPanel
 *
 * Right sidebar for configuring selected node properties.
 * Dynamically renders form fields based on node type:
 * - sensor: ESP, GPIO, sensor type, operator, value
 * - time: start/end hour, days of week
 * - logic: AND/OR toggle
 * - actuator: ESP, GPIO, command, value, duration
 * - notification: channel, target, message
 * - delay: seconds
 * - plugin: plugin selection with dynamic config from schema
 */

import { computed, watch, ref } from 'vue'
import {
  X,
  Thermometer,
  Clock,
  GitMerge,
  Power,
  Bell,
  Timer,
  Puzzle,
  Trash2,
  Copy,
} from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'
import { getSensorDisplayName, isMultiValueBaseType } from '@/utils/sensorDefaults'
import { pluginsApi, type PluginDTO } from '@/api/plugins'
import type { Node } from '@vue-flow/core'
import type { MockSensor, MockActuator } from '@/types'

interface Props {
  node: Node | null
  validationErrors?: Record<string, string[]>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:data': [nodeId: string, data: Record<string, unknown>]
  close: []
  'delete-node': [nodeId: string]
  'duplicate-node': [nodeId: string]
}>()

const espStore = useEspStore()

// Load available plugins for plugin node config
const availablePlugins = ref<PluginDTO[]>([])
const pluginsLoaded = ref(false)

async function loadPlugins() {
  if (pluginsLoaded.value) return
  try {
    availablePlugins.value = await pluginsApi.list()
    pluginsLoaded.value = true
  } catch {
    // Non-critical — show empty list
  }
}

const nodeTypeLabels: Record<string, string> = {
  sensor: 'Sensor-Bedingung',
  time: 'Zeitfenster',
  logic: 'Logik-Verknüpfung',
  actuator: 'Aktor-Aktion',
  notification: 'Benachrichtigung',
  delay: 'Verzögerung',
  plugin: 'Plugin-Aktion',
}

const nodeTypeIcons: Record<string, typeof Thermometer> = {
  sensor: Thermometer,
  time: Clock,
  logic: GitMerge,
  actuator: Power,
  notification: Bell,
  delay: Timer,
  plugin: Puzzle,
}

const operatorOptions = [
  { value: '>', label: 'größer als (>)' },
  { value: '>=', label: 'größer gleich (≥)' },
  { value: '<', label: 'kleiner als (<)' },
  { value: '<=', label: 'kleiner gleich (≤)' },
  { value: '==', label: 'gleich (=)' },
  { value: '!=', label: 'ungleich (≠)' },
  { value: 'between', label: 'zwischen (↔)' },
  { value: 'hysteresis', label: 'Hysterese (Ein/Aus-Schwellen)' },
]

const sensorTypeOptions = [
  { value: 'DS18B20', label: 'DS18B20 (Temperatur)' },
  { value: 'sht31_temp', label: 'SHT31 Temperatur (°C)' },
  { value: 'sht31_humidity', label: 'SHT31 Luftfeuchtigkeit (%RH)' },
  { value: 'bmp280_temp', label: 'BMP280 Temperatur (°C)' },
  { value: 'bmp280_pressure', label: 'BMP280 Druck (hPa)' },
  { value: 'bme280_temp', label: 'BME280 Temperatur (°C)' },
  { value: 'bme280_humidity', label: 'BME280 Luftfeuchtigkeit (%RH)' },
  { value: 'bme280_pressure', label: 'BME280 Druck (hPa)' },
  { value: 'pH', label: 'pH-Sensor' },
  { value: 'EC', label: 'EC (Leitfähigkeit)' },
  { value: 'moisture', label: 'Bodenfeuchte' },
  { value: 'light', label: 'Lichtsensor' },
  { value: 'co2', label: 'CO2-Sensor' },
  { value: 'flow', label: 'Durchflusssensor' },
  { value: 'level', label: 'Füllstandsensor' },
]

const commandOptions = [
  { value: 'ON', label: 'Einschalten (ON)' },
  { value: 'OFF', label: 'Ausschalten (OFF)' },
  { value: 'PWM', label: 'PWM-Wert setzen' },
  { value: 'TOGGLE', label: 'Umschalten (TOGGLE)' },
]

const channelOptions = [
  { value: 'websocket', label: 'WebSocket (Dashboard)' },
  { value: 'email', label: 'E-Mail' },
  { value: 'webhook', label: 'Webhook' },
]

const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// Local editable copy of node data
const localData = ref<Record<string, unknown>>({})

// Sync when node changes
watch(
  () => props.node,
  (newNode) => {
    if (newNode) {
      localData.value = { ...newNode.data }
      // Lazy-load plugins when a plugin node is selected
      if (newNode.type === 'plugin') {
        loadPlugins()
      }
    }
  },
  { immediate: true, deep: true }
)

// Emit on changes
function updateField(key: string, value: unknown) {
  localData.value[key] = value
  if (props.node) {
    emit('update:data', props.node.id, { ...localData.value })
  }
}

function parseNumericOrNull(value: string): number | null {
  return value === '' ? null : Number(value)
}

function toggleDay(day: number) {
  const days = (localData.value.daysOfWeek as number[]) || []
  const idx = days.indexOf(day)
  const updated = idx >= 0 ? days.filter((d) => d !== day) : [...days, day].sort()
  updateField('daysOfWeek', updated)
}

function isDayActive(day: number): boolean {
  const days = (localData.value.daysOfWeek as number[]) || []
  return days.includes(day)
}

const nodeType = computed(() => props.node?.type || '')
const hasValidationErrors = computed(() => Object.keys(props.validationErrors ?? {}).length > 0)

function fieldError(field: string): string | null {
  const list = props.validationErrors?.[field]
  return list?.[0] ?? null
}

// Warn when rule uses base type (SHT31, BME280) instead of explicit sub-type
const showMultiValueBaseTypeWarning = computed(() => {
  if (nodeType.value !== 'sensor') return false
  const st = localData.value.sensorType as string
  return st ? isMultiValueBaseType(st) : false
})
const typeLabel = computed(() => nodeTypeLabels[nodeType.value] || 'Unbekannt')
const typeIcon = computed(() => nodeTypeIcons[nodeType.value] || Thermometer)

// Available ESP devices for selectors (with zone context + fallback for unknown IDs)
const espDevices = computed(() => {
  const devices = espStore.devices.map((d) => {
    const id = espStore.getDeviceId(d)
    const baseName = d.name || id
    const zoneName = d.zone_name || d.zone_id
    return {
      id,
      name: zoneName ? `${baseName} — ${zoneName}` : baseName,
    }
  })
  // If the node's saved espId is not in the device list, show it as unknown
  const currentEspId = localData.value.espId as string
  if (currentEspId && !devices.find(d => d.id === currentEspId)) {
    devices.unshift({ id: currentEspId, name: `${currentEspId} (nicht gefunden)` })
  }
  return devices
})

// Device-aware: sensors on the currently selected ESP (sensor config)
const availableSensors = computed(() => {
  const espId = localData.value.espId as string
  if (!espId) return []
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  if (!device?.sensors) return []
  return (device.sensors as MockSensor[]).map(s => ({
    gpio: s.gpio,
    sensorType: s.sensor_type,
    config_id: s.config_id,
    label: `${getSensorDisplayName({ sensor_type: s.sensor_type, name: s.name })} (GPIO ${s.gpio})`,
  }))
})

// Device-aware: actuators on the currently selected ESP (actuator config)
const availableActuators = computed(() => {
  const espId = localData.value.espId as string
  if (!espId) return []
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
  if (!device?.actuators) return []
  return (device.actuators as MockActuator[]).map(a => ({
    gpio: a.gpio,
    actuatorType: a.actuator_type,
    name: a.name || `${a.actuator_type} (GPIO ${a.gpio})`,
    label: a.name
      ? `${a.name} – ${a.actuator_type} (GPIO ${a.gpio})`
      : `${a.actuator_type} (GPIO ${a.gpio})`,
  }))
})

// Handle ESP change in sensor config → reset sensor-specific fields
function handleSensorEspChange(espId: string) {
  updateField('espId', espId)
  updateField('gpio', undefined)
  updateField('sensorType', '')
}

// Handle ESP change in actuator config → reset actuator-specific fields
function handleActuatorEspChange(espId: string) {
  updateField('espId', espId)
  updateField('gpio', undefined)
}

// L3-FE-3: Duration vs. device safety limit warning — skipped.
// max_runtime_seconds is on MockActuatorConfig (sent during config push),
// not on MockActuator (live state in store). Would require extra API call.

// Computed for sensor dropdown: value "gpio:sensorType" for multi-value disambiguation
const sensorDropdownValue = computed({
  get: () => {
    const gp = localData.value.gpio as number | undefined
    const st = localData.value.sensorType as string | undefined
    if (gp === undefined || gp === null) return ''
    const match = availableSensors.value.find(s => s.gpio === gp && s.sensorType === st)
    if (match) return `${gp}:${st}`
    // Base type (SHT31, BME280): don't auto-select — force user to choose explicit sub-type
    if (st && isMultiValueBaseType(st)) return ''
    // Fallback: first sensor with same gpio (legacy rules without sensorType)
    const fallback = availableSensors.value.find(s => s.gpio === gp)
    return fallback ? `${gp}:${fallback.sensorType}` : ''
  },
  set: (v: string | number) => selectSensor(v),
})

// Select sensor from device-aware dropdown → auto-fill gpio + sensorType
// Value format: "gpio:sensorType" (e.g. "0:sht31_humidity") for multi-value disambiguation
function selectSensor(value: string | number) {
  if (value === '' || value === undefined || value === null) {
    updateField('gpio', undefined)
    updateField('sensorType', '')
    return
  }
  let gpio: number
  let sensorType: string
  const strVal = String(value)
  if (strVal.includes(':')) {
    const [g, t] = strVal.split(':')
    gpio = parseInt(g, 10)
    sensorType = t || ''
  } else {
    gpio = typeof value === 'number' ? value : parseInt(strVal, 10)
    sensorType = availableSensors.value.find(s => s.gpio === gpio)?.sensorType ?? ''
  }
  const sensor = availableSensors.value.find(s => s.gpio === gpio && s.sensorType === sensorType)
  if (sensor) {
    updateField('gpio', sensor.gpio)
    updateField('sensorType', sensor.sensorType)
  }
}

// Select actuator from device-aware dropdown → auto-fill gpio
function selectActuator(value: string) {
  if (!value) {
    updateField('gpio', undefined)
    return
  }
  const gpio = Number(value)
  const actuator = availableActuators.value.find(a => a.gpio === gpio)
  if (actuator) {
    updateField('gpio', actuator.gpio)
  }
}
</script>

<template>
  <Transition name="config-slide">
    <div v-if="node" class="config-panel">
      <!-- Header -->
      <div class="config-panel__header">
        <div class="config-panel__type">
          <div class="config-panel__type-icon" :class="`config-panel__type-icon--${nodeType}`">
            <component :is="typeIcon" class="w-4 h-4" />
          </div>
          <span class="config-panel__type-label">{{ typeLabel }}</span>
        </div>
        <button class="config-panel__close" @click="emit('close')">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Body -->
      <div class="config-panel__body">
        <div v-if="hasValidationErrors" class="config-validation-summary">
          <strong>Validierungsfehler:</strong>
          <ul>
            <li v-for="(messages, field) in validationErrors" :key="field">
              {{ field }}: {{ messages[0] }}
            </li>
          </ul>
        </div>
        <!-- ======================== SENSOR CONFIG ======================== -->
        <template v-if="nodeType === 'sensor'">
          <div class="config-field">
            <label class="config-label">ESP-Gerät</label>
            <select
              class="config-select"
              :class="{ 'config-input--invalid': fieldError('espId') }"
              :value="localData.espId"
              @change="handleSensorEspChange(($event.target as HTMLSelectElement).value)"
            >
              <option value="">-- ESP wählen --</option>
              <option v-for="esp in espDevices" :key="esp.id" :value="esp.id">
                {{ esp.name }}
              </option>
            </select>
            <p v-if="fieldError('espId')" class="config-hint config-hint--error">{{ fieldError('espId') }}</p>
          </div>

          <!-- Device-aware sensor selection -->
          <template v-if="localData.espId && availableSensors.length > 0">
            <div class="config-field">
              <label class="config-label">Sensor</label>
              <select
                class="config-select"
                :value="sensorDropdownValue"
                @change="selectSensor(($event.target as HTMLSelectElement).value)"
              >
                <option value="">-- Sensor wählen --</option>
                <option v-for="s in availableSensors" :key="`${s.gpio}-${s.sensorType}`" :value="`${s.gpio}:${s.sensorType}`">
                  {{ s.label }}
                </option>
              </select>
              <p v-if="localData.gpio != null && localData.sensorType" class="config-hint">
                GPIO {{ localData.gpio }} · {{ localData.sensorType }}
              </p>
              <p v-if="showMultiValueBaseTypeWarning" class="config-hint config-hint--warn">
                Diese Regel nutzt den Basis-Sensortyp „{{ localData.sensorType }}“. Bitte wählen Sie explizit einen Subtyp (z. B. SHT31 Temperatur oder SHT31 Luftfeuchtigkeit) für zuverlässige Auswertung.
              </p>
            </div>
          </template>

          <!-- Fallback: manual input when ESP has no sensor data -->
          <template v-else-if="localData.espId">
            <div class="config-field">
              <p class="config-hint config-hint--warn">Keine Sensoren konfiguriert – manuelle Eingabe</p>
            </div>
            <div class="config-field">
              <label class="config-label">GPIO Pin</label>
              <input
                type="number"
                class="config-input"
                :value="localData.gpio"
                min="0"
                max="39"
                @input="updateField('gpio', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
            <div class="config-field">
              <label class="config-label">Sensor-Typ</label>
              <select
                class="config-select"
                :value="localData.sensorType"
                @change="updateField('sensorType', ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in sensorTypeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </template>

          <!-- No ESP selected hint -->
          <div v-else class="config-field">
            <p class="config-hint">Wähle zuerst ein ESP-Gerät aus.</p>
          </div>

          <div class="config-field">
            <label class="config-label">Operator</label>
            <select
              class="config-select"
              :class="{ 'config-input--invalid': fieldError('operator') }"
              :value="localData.operator"
              @change="(e) => {
                const v = (e.target as HTMLSelectElement).value
                updateField('operator', v)
                updateField('isHysteresis', v === 'hysteresis')
              }"
            >
              <option v-for="opt in operatorOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <p v-if="fieldError('operator')" class="config-hint config-hint--error">{{ fieldError('operator') }}</p>
          </div>

          <!-- Hysterese: Kühlung (Ein > X, Aus < Y) oder Heizung (Ein < X, Aus > Y) -->
          <template v-if="localData.operator === 'hysteresis' || localData.isHysteresis === true">
            <p class="config-hint">Kühlung: Ein wenn Wert über Schwellwert, Aus wenn unter.</p>
            <div class="config-field-row">
              <div class="config-field config-field--half">
                <label class="config-label">Ein wenn > (Kühlung)</label>
                <input
                  type="number"
                  class="config-input"
                  :value="localData.activateAbove"
                  step="0.1"
                  placeholder="z.B. 28"
                  @input="updateField('activateAbove', parseNumericOrNull(($event.target as HTMLInputElement).value))"
                />
              </div>
              <div class="config-field config-field--half">
                <label class="config-label">Aus wenn < (Kühlung)</label>
                <input
                  type="number"
                  class="config-input"
                  :value="localData.deactivateBelow"
                  step="0.1"
                  placeholder="z.B. 24"
                  @input="updateField('deactivateBelow', parseNumericOrNull(($event.target as HTMLInputElement).value))"
                />
              </div>
            </div>
            <p class="config-hint">Heizung: Ein wenn Wert unter Schwellwert, Aus wenn über.</p>
            <div class="config-field-row">
              <div class="config-field config-field--half">
                <label class="config-label">Ein wenn < (Heizung)</label>
                <input
                  type="number"
                  class="config-input"
                  :value="localData.activateBelow"
                  step="0.1"
                  placeholder="z.B. 18"
                  @input="updateField('activateBelow', parseNumericOrNull(($event.target as HTMLInputElement).value))"
                />
              </div>
              <div class="config-field config-field--half">
                <label class="config-label">Aus wenn > (Heizung)</label>
                <input
                  type="number"
                  class="config-input"
                  :value="localData.deactivateAbove"
                  step="0.1"
                  placeholder="z.B. 22"
                  @input="updateField('deactivateAbove', parseNumericOrNull(($event.target as HTMLInputElement).value))"
                />
              </div>
            </div>
          </template>

          <div v-else-if="localData.operator === 'between'" class="config-field-row">
            <div class="config-field config-field--half">
              <label class="config-label">Min</label>
              <input
                type="number"
                class="config-input"
                :value="localData.min"
                step="0.1"
                @input="updateField('min', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
            <div class="config-field config-field--half">
              <label class="config-label">Max</label>
              <input
                type="number"
                class="config-input"
                :value="localData.max"
                step="0.1"
                @input="updateField('max', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
          </div>

          <div v-else class="config-field">
            <label class="config-label">Schwellwert</label>
            <input
              type="number"
              class="config-input"
              :class="{ 'config-input--invalid': fieldError('value') }"
              :value="localData.value"
              step="0.1"
              @input="updateField('value', Number(($event.target as HTMLInputElement).value))"
            />
            <p v-if="fieldError('value')" class="config-hint config-hint--error">{{ fieldError('value') }}</p>
          </div>
        </template>

        <!-- ======================== TIME CONFIG ======================== -->
        <template v-if="nodeType === 'time'">
          <div class="config-field-row">
            <div class="config-field config-field--half">
              <label class="config-label">Von</label>
              <input
                type="number"
                class="config-input"
                :value="localData.startHour"
                min="0"
                max="23"
                @input="updateField('startHour', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
            <div class="config-field config-field--half">
              <label class="config-label">Bis</label>
              <input
                type="number"
                class="config-input"
                :value="localData.endHour"
                min="0"
                max="23"
                @input="updateField('endHour', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
          </div>

          <div class="config-field">
            <label class="config-label">Wochentage</label>
            <div class="config-days">
              <button
                v-for="(label, idx) in dayLabels"
                :key="idx"
                class="config-day"
                :class="{ 'config-day--active': isDayActive(idx) }"
                @click="toggleDay(idx)"
              >
                {{ label }}
              </button>
            </div>
          </div>
        </template>

        <!-- ======================== LOGIC CONFIG ======================== -->
        <template v-if="nodeType === 'logic'">
          <div class="config-field">
            <label class="config-label">Verknüpfung</label>
            <div class="config-toggle-group">
              <button
                class="config-toggle-btn"
                :class="{ 'config-toggle-btn--active': localData.operator === 'AND' }"
                @click="updateField('operator', 'AND')"
              >
                UND
              </button>
              <button
                class="config-toggle-btn"
                :class="{ 'config-toggle-btn--active': localData.operator === 'OR' }"
                @click="updateField('operator', 'OR')"
              >
                ODER
              </button>
            </div>
            <p class="config-hint">
              {{ localData.operator === 'AND'
                ? 'Alle verbundenen Bedingungen müssen erfüllt sein.'
                : 'Mindestens eine verbundene Bedingung muss erfüllt sein.'
              }}
            </p>
          </div>
        </template>

        <!-- ======================== ACTUATOR CONFIG ======================== -->
        <template v-if="nodeType === 'actuator'">
          <div class="config-field">
            <label class="config-label">ESP-Gerät</label>
            <select
              class="config-select"
              :class="{ 'config-input--invalid': fieldError('espId') }"
              :value="localData.espId"
              @change="handleActuatorEspChange(($event.target as HTMLSelectElement).value)"
            >
              <option value="">-- ESP wählen --</option>
              <option v-for="esp in espDevices" :key="esp.id" :value="esp.id">
                {{ esp.name }}
              </option>
            </select>
            <p v-if="fieldError('espId')" class="config-hint config-hint--error">{{ fieldError('espId') }}</p>
          </div>

          <!-- Device-aware actuator selection -->
          <template v-if="localData.espId && availableActuators.length > 0">
            <div class="config-field">
              <label class="config-label">Aktor</label>
              <select
                class="config-select"
                :value="localData.gpio ?? ''"
                @change="selectActuator(($event.target as HTMLSelectElement).value)"
              >
                <option value="">-- Aktor wählen --</option>
                <option v-for="a in availableActuators" :key="a.gpio" :value="a.gpio">
                  {{ a.label }}
                </option>
              </select>
              <p v-if="localData.gpio != null" class="config-hint">
                GPIO {{ localData.gpio }} · {{ availableActuators.find(a => a.gpio === localData.gpio)?.actuatorType || '' }}
              </p>
            </div>
          </template>

          <!-- Fallback: manual GPIO input when ESP has no actuator data -->
          <template v-else-if="localData.espId">
            <div class="config-field">
              <p class="config-hint config-hint--warn">Keine Aktoren konfiguriert – manuelle Eingabe</p>
            </div>
            <div class="config-field">
              <label class="config-label">GPIO Pin</label>
              <input
                type="number"
                class="config-input"
                :value="localData.gpio"
                min="0"
                max="39"
                @input="updateField('gpio', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
          </template>

          <!-- No ESP selected hint -->
          <div v-else class="config-field">
            <p class="config-hint">Wähle zuerst ein ESP-Gerät aus.</p>
          </div>

          <div class="config-field">
            <label class="config-label">Befehl</label>
            <select
              class="config-select"
              :class="{ 'config-input--invalid': fieldError('command') }"
              :value="localData.command"
              @change="updateField('command', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in commandOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <p v-if="fieldError('command')" class="config-hint config-hint--error">{{ fieldError('command') }}</p>
          </div>

          <div v-if="localData.command === 'PWM'" class="config-field">
            <label class="config-label">PWM-Wert (0-100%)</label>
            <input
              type="range"
              class="config-range"
              :value="(localData.pwmValue as number) ?? 50"
              min="0"
              max="100"
              @input="updateField('pwmValue', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="config-range-value">{{ (localData.pwmValue as number) ?? 50 }}%</span>
          </div>

          <div class="config-field">
            <label class="config-label">Maximale Laufzeit pro Ausfuehrung (Sek.)</label>
            <input
              type="number"
              class="config-input"
              :value="localData.duration"
              min="0"
              placeholder="0 = Keine"
              @input="updateField('duration', Number(($event.target as HTMLInputElement).value) || undefined)"
            />
            <p class="config-hint">
              Wie lange der Aktor maximal laeuft, wenn diese Regel feuert. Nach Ablauf schaltet die Firmware sauber ab — Aktor ist sofort wieder verfuegbar. 0 = kein Limit (Geraete-Sicherheitslimit greift als Fallback).
            </p>
          </div>
        </template>

        <!-- ======================== NOTIFICATION CONFIG ======================== -->
        <template v-if="nodeType === 'notification'">
          <div class="config-field">
            <label class="config-label">Kanal</label>
            <select
              class="config-select"
              :value="localData.channel"
              @change="updateField('channel', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in channelOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="config-field">
            <label class="config-label">Ziel</label>
            <input
              type="text"
              class="config-input"
              :value="localData.target"
              placeholder="z.B. admin@example.com"
              @input="updateField('target', ($event.target as HTMLInputElement).value)"
            />
          </div>

          <div class="config-field">
            <label class="config-label">Nachricht</label>
            <textarea
              class="config-textarea"
              :value="String(localData.messageTemplate ?? '')"
              placeholder="Temperatur {value}°C überschritten!"
              rows="3"
              @input="updateField('messageTemplate', ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <p class="config-hint">
              Variablen: {value}, {sensor_type}, {esp_id}, {timestamp}
            </p>
          </div>
        </template>

        <!-- ======================== DELAY CONFIG ======================== -->
        <template v-if="nodeType === 'delay'">
          <div class="config-field">
            <label class="config-label">Wartezeit (Sekunden)</label>
            <input
              type="number"
              class="config-input"
              :value="localData.seconds"
              min="1"
              max="86400"
              @input="updateField('seconds', Number(($event.target as HTMLInputElement).value))"
            />
            <p class="config-hint">
              {{ localData.seconds ? `= ${Math.floor((localData.seconds as number) / 60)} Min. ${(localData.seconds as number) % 60} Sek.` : '' }}
            </p>
          </div>
        </template>

        <!-- ======================== PLUGIN CONFIG ======================== -->
        <template v-if="nodeType === 'plugin'">
          <div class="config-field">
            <label class="config-label">Plugin</label>
            <select
              class="config-select"
              :value="localData.pluginId"
              @change="updateField('pluginId', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">-- Plugin wählen --</option>
              <option
                v-for="p in availablePlugins"
                :key="p.plugin_id"
                :value="p.plugin_id"
                :disabled="!p.is_enabled"
              >
                {{ p.display_name }}{{ !p.is_enabled ? ' (deaktiviert)' : '' }}
              </option>
            </select>
          </div>

          <template v-if="localData.pluginId">
            <div class="config-field">
              <p class="config-hint">
                {{ availablePlugins.find(p => p.plugin_id === localData.pluginId)?.description || '' }}
              </p>
            </div>

            <!-- Dynamic config fields from plugin config_schema -->
            <template
              v-for="(schemaDef, key) in (availablePlugins.find(p => p.plugin_id === localData.pluginId)?.config_schema || {})"
              :key="key"
            >
              <div v-if="(schemaDef as Record<string, unknown>)?.type === 'boolean'" class="config-field">
                <label class="config-label">
                  {{ (schemaDef as Record<string, unknown>).label || key }}
                </label>
                <div class="config-toggle-group">
                  <button
                    class="config-toggle-btn"
                    :class="{ 'config-toggle-btn--active': localData[`cfg_${key}`] !== false }"
                    @click="updateField(`cfg_${key}`, true)"
                  >
                    An
                  </button>
                  <button
                    class="config-toggle-btn"
                    :class="{ 'config-toggle-btn--active': localData[`cfg_${key}`] === false }"
                    @click="updateField(`cfg_${key}`, false)"
                  >
                    Aus
                  </button>
                </div>
              </div>
              <div v-else-if="(schemaDef as Record<string, unknown>)?.type === 'number' || (schemaDef as Record<string, unknown>)?.type === 'integer'" class="config-field">
                <label class="config-label">
                  {{ (schemaDef as Record<string, unknown>).label || key }}
                </label>
                <input
                  type="number"
                  class="config-input"
                  :value="localData[`cfg_${key}`] ?? (schemaDef as Record<string, unknown>).default"
                  @input="updateField(`cfg_${key}`, Number(($event.target as HTMLInputElement).value))"
                />
              </div>
              <div v-else-if="(schemaDef as Record<string, unknown>)?.type === 'select'" class="config-field">
                <label class="config-label">
                  {{ (schemaDef as Record<string, unknown>).label || key }}
                </label>
                <select
                  class="config-select"
                  :value="(localData[`cfg_${key}`] ?? (schemaDef as Record<string, unknown>).default ?? '') as string"
                  @change="updateField(`cfg_${key}`, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="opt in ((schemaDef as Record<string, unknown>).options as string[]) || []"
                    :key="opt"
                    :value="opt"
                  >
                    {{ opt }}
                  </option>
                </select>
              </div>
              <div v-else-if="(schemaDef as Record<string, unknown>)?.type === 'string'" class="config-field">
                <label class="config-label">
                  {{ (schemaDef as Record<string, unknown>).label || key }}
                </label>
                <input
                  type="text"
                  class="config-input"
                  :value="localData[`cfg_${key}`] ?? (schemaDef as Record<string, unknown>).default ?? ''"
                  @input="updateField(`cfg_${key}`, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </template>
          </template>
        </template>
      </div>

      <!-- Footer Actions -->
      <div class="config-panel__footer">
        <button class="config-action config-action--duplicate" @click="emit('duplicate-node', node!.id)">
          <Copy class="w-3.5 h-3.5" />
          Duplizieren
        </button>
        <button class="config-action config-action--delete" @click="emit('delete-node', node!.id)">
          <Trash2 class="w-3.5 h-3.5" />
          Löschen
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.config-panel {
  width: 288px;
  min-width: 288px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--glass-border);
  overflow: hidden;
}

.config-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.config-panel__type {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.config-panel__type-icon {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

.config-panel__type-icon--sensor {
  background: rgba(96, 165, 250, 0.1);
  color: var(--color-iridescent-1);
}

.config-panel__type-icon--time {
  background: rgba(251, 191, 36, 0.1);
  color: var(--color-warning);
}

.config-panel__type-icon--logic {
  background: rgba(167, 139, 250, 0.1);
  color: var(--color-iridescent-3);
}

.config-panel__type-icon--actuator {
  background: rgba(192, 132, 252, 0.1);
  color: var(--color-iridescent-4);
}

.config-panel__type-icon--notification {
  background: rgba(52, 211, 153, 0.1);
  color: var(--color-success);
}

.config-panel__type-icon--delay {
  background: rgba(133, 133, 160, 0.1);
  color: var(--color-text-secondary);
}

.config-panel__type-icon--plugin {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning);
}

.config-panel__type-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.config-panel__close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.config-panel__close:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.config-panel__body {
  flex: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.config-validation-summary {
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
  color: var(--color-error);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.625rem;
  font-size: 0.75rem;
}

.config-validation-summary ul {
  margin: 0.25rem 0 0;
  padding-left: 1rem;
}

.config-field--half {
  flex: 1;
}

.config-field-row {
  display: flex;
  gap: 0.75rem;
}

.config-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.config-input,
.config-select,
.config-textarea {
  width: 100%;
  padding: 0.5rem 0.625rem;
  font-size: var(--text-sm);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  outline: none;
  transition: all var(--transition-fast);
}

.config-input:focus,
.config-select:focus,
.config-textarea:focus {
  border-color: rgba(129, 140, 248, 0.4);
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.06);
}

.config-input--invalid {
  border-color: var(--color-error);
}

.config-input::placeholder,
.config-textarea::placeholder {
  color: var(--color-text-muted);
}

.config-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23707080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  padding-right: 1.75rem;
  cursor: pointer;
}

.config-select option {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.config-textarea {
  resize: vertical;
  min-height: 64px;
  font-family: inherit;
  line-height: 1.5;
}

.config-range {
  width: 100%;
  accent-color: var(--color-iridescent-2);
  cursor: pointer;
}

.config-range-value {
  font-size: 0.75rem;
  color: var(--color-iridescent-2);
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.config-hint {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.config-hint--warn {
  color: var(--color-warning);
  font-style: italic;
}

.config-hint--error {
  color: var(--color-error);
}

.config-toggle-group {
  display: flex;
  gap: 1px;
  background: var(--glass-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.config-toggle-btn {
  flex: 1;
  padding: 0.5rem;
  font-size: var(--text-sm);
  font-weight: 600;
  background: var(--color-bg-tertiary);
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  letter-spacing: 0.04em;
}

.config-toggle-btn:hover:not(.config-toggle-btn--active) {
  color: var(--color-text-secondary);
}

.config-toggle-btn--active {
  background: linear-gradient(135deg, var(--color-iridescent-2), var(--color-iridescent-3));
  color: white;
}

.config-days {
  display: flex;
  gap: 4px;
}

.config-day {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  letter-spacing: 0.02em;
}

.config-day:hover:not(.config-day--active) {
  border-color: rgba(129, 140, 248, 0.3);
  color: var(--color-text-primary);
}

.config-day--active {
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-2));
  border-color: transparent;
  color: white;
  box-shadow: 0 2px 6px rgba(96, 165, 250, 0.2);
}

.config-panel__footer {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.config-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.4375rem;
  font-size: 0.6875rem;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.config-action--duplicate {
  color: var(--color-text-secondary);
}

.config-action--duplicate:hover {
  background: rgba(129, 140, 248, 0.08);
  color: var(--color-iridescent-2);
}

.config-action--delete {
  color: var(--color-text-muted);
}

.config-action--delete:hover {
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.08);
}

.config-action:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 1px;
}

.config-toggle-btn:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: -1px;
}

.config-day:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 1px;
}

.config-panel__close:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 1px;
}

/* Slide transition */
.config-slide-enter-active {
  transition: all 0.2s var(--ease-out);
}

.config-slide-leave-active {
  transition: all 0.15s ease-in;
}

.config-slide-enter-from {
  opacity: 0;
  transform: translateX(16px);
}

.config-slide-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .config-slide-enter-active,
  .config-slide-leave-active {
    transition-duration: 0.01ms;
  }

  .config-slide-enter-from,
  .config-slide-leave-to {
    transform: none;
  }
}
</style>
