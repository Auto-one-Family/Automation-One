<script setup lang="ts">
/**
 * AddSensorModal Component
 *
 * Extracted from ESPOrbitalLayout: Modal for adding a new sensor to an ESP device.
 * Supports:
 * - Standard GPIO sensors (dropdown type selection + GpioPicker)
 * - OneWire/DS18B20 sensors (bus scan, multi-select, bulk add)
 * - Operating mode configuration (continuous, on_demand, scheduled, paused)
 * - Subzone assignment
 */

import { ref, computed, watch } from 'vue'
import { Loader2, ScanLine, AlertCircle, Info, Thermometer, Plus, CheckSquare, Square, Check } from 'lucide-vue-next'
import GpioPicker from './GpioPicker.vue'
import { Badge, BaseModal } from '@/shared/design/primitives'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'
import {
  SENSOR_TYPE_CONFIG,
  MULTI_VALUE_DEVICES,
  getSensorUnit,
  getSensorDefault,
  getSensorTypeOptions,
  inferInterfaceType,
  getI2CAddressOptions,
} from '@/utils/sensorDefaults'
import { getRecommendedGpios } from '@/utils/gpioConfig'
import type { MockSensorConfig } from '@/types'
import { createLogger } from '@/utils/logger'

const logger = createLogger('AddSensorModal')

interface Props {
  /** Whether the modal is visible */
  modelValue: boolean
  /** ESP device ID to add sensor to */
  espId: string
  /** Pre-selected sensor type from drag-and-drop (optional) */
  initialSensorType?: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** Emitted when sensor(s) added successfully */
  added: []
}>()

const espStore = useEspStore()
const toast = useToast()

// ── Form State ───────────────────────────────────────────────────────

const defaultSensorType = 'DS18B20'
const sensorTypeOptions = getSensorTypeOptions()

const newSensor = ref<MockSensorConfig & { operating_mode?: string; timeout_seconds?: number }>({
  gpio: 0,
  sensor_type: defaultSensorType,
  name: '',
  subzone_id: '',
  raw_value: getSensorDefault(defaultSensorType),
  unit: getSensorUnit(defaultSensorType),
  quality: 'good',
  raw_mode: true,
  operating_mode: 'continuous',
  timeout_seconds: 180,
})

const sensorGpioValid = ref(false)
const oneWireScanPin = ref(4)

// ── Sensor Type Watchers ─────────────────────────────────────────────

watch(() => newSensor.value.sensor_type, (newType) => {
  const config = SENSOR_TYPE_CONFIG[newType]
  if (config) {
    newSensor.value.unit = config.unit
    newSensor.value.raw_value = config.defaultValue
    newSensor.value.operating_mode = config.recommendedMode || 'continuous'
    newSensor.value.timeout_seconds = config.recommendedTimeout ?? 180
  }
  if (newType.toLowerCase().includes('ds18b20')) {
    newSensor.value.gpio = oneWireScanPin.value
  }
  // Pre-select default I2C address when switching to I2C sensor
  if (inferInterfaceType(newType) === 'I2C') {
    const options = getI2CAddressOptions(newType)
    selectedI2CAddress.value = options.length > 0 ? options[0].value : null
  } else {
    selectedI2CAddress.value = null
  }
})

watch(oneWireScanPin, (newPin) => {
  if (isOneWireSensor.value) {
    newSensor.value.gpio = newPin
  }
})

// Reset form and apply initial type when modal opens, cleanup when closes
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    resetForm()
    // Apply drag-provided sensor type (if any)
    if (props.initialSensorType) {
      const match = sensorTypeOptions.find(
        opt => opt.value.toLowerCase() === props.initialSensorType!.toLowerCase()
      )
      if (match) {
        logger.info('[DnD] Pre-selecting sensor type from drag', { type: match.value })
        newSensor.value.sensor_type = match.value
      } else {
        logger.warn('[DnD] Sensor type from drag not found in options', { type: props.initialSensorType })
      }
    }
  } else {
    espStore.clearOneWireScan(props.espId)
    oneWireScanPin.value = 4
  }
})

// Pre-select sensor type when dropped from sidebar (safety net for mid-open prop changes)
watch(() => props.initialSensorType, (newType) => {
  if (newType) {
    const match = sensorTypeOptions.find(
      opt => opt.value.toLowerCase() === newType.toLowerCase()
    )
    if (match) {
      logger.info('[DnD] initialSensorType watcher fired', { type: match.value })
      newSensor.value.sensor_type = match.value
    }
  }
})

// ── Computed ─────────────────────────────────────────────────────────

const isOneWireSensor = computed(() => newSensor.value.sensor_type.toLowerCase().includes('ds18b20'))
const isI2CSensor = computed(() => inferInterfaceType(newSensor.value.sensor_type) === 'I2C')
const i2cAddressOptions = computed(() => getI2CAddressOptions(newSensor.value.sensor_type))
const selectedI2CAddress = ref<number | null>(null)
const oneWireScanState = computed(() => espStore.getOneWireScanState(props.espId))
const newOneWireDevices = computed(() => oneWireScanState.value.scanResults.filter(d => !d.already_configured))
const newOneWireDeviceCount = computed(() => newOneWireDevices.value.length)
const selectedNewDeviceCount = computed(() =>
  newOneWireDevices.value.filter(d => oneWireScanState.value.selectedRomCodes.includes(d.rom_code)).length
)
const allOneWireDevicesSelected = computed(() => {
  if (newOneWireDevices.value.length === 0) return false
  return newOneWireDevices.value.every(d => oneWireScanState.value.selectedRomCodes.includes(d.rom_code))
})

const recommendedMode = computed(() => {
  const config = SENSOR_TYPE_CONFIG[newSensor.value.sensor_type]
  return config?.recommendedMode || 'continuous'
})

const supportsOnDemand = computed(() => {
  const config = SENSOR_TYPE_CONFIG[newSensor.value.sensor_type]
  return config?.supportsOnDemand ?? false
})

const oneWireScanPins = computed(() => getRecommendedGpios('ds18b20', 'sensor'))

// ── Actions ──────────────────────────────────────────────────────────

function close() {
  emit('update:modelValue', false)
}

function resetForm() {
  newSensor.value = {
    gpio: 0,
    sensor_type: defaultSensorType,
    name: '',
    subzone_id: '',
    raw_value: getSensorDefault(defaultSensorType),
    unit: getSensorUnit(defaultSensorType),
    quality: 'good',
    raw_mode: true,
    operating_mode: 'continuous',
    timeout_seconds: 180,
  }
  sensorGpioValid.value = false
  selectedI2CAddress.value = null
}

async function addSensor() {
  try {
    const sensorData: any = { ...newSensor.value }
    if (isI2CSensor.value && selectedI2CAddress.value !== null) {
      sensorData.interface_type = 'I2C'
      sensorData.i2c_address = selectedI2CAddress.value
      sensorData.gpio = 0
    }
    await espStore.addSensor(props.espId, sensorData)

    // Multi-value sensors create multiple configs on the server
    const mvDevice = MULTI_VALUE_DEVICES[sensorData.sensor_type.toLowerCase()]
    if (mvDevice) {
      toast.success(`${mvDevice.label}: ${mvDevice.values.length} Messwerte erstellt`)
    } else {
      toast.success('Sensor erfolgreich hinzugefügt')
    }

    close()
    resetForm()
    espStore.fetchGpioStatus(props.espId)
    emit('added')
  } catch (err) {
    logger.error('Failed to add sensor', err)
  }
}

async function handleOneWireScan() {
  try {
    await espStore.scanOneWireBus(props.espId, oneWireScanPin.value)
  } catch (err) {
    logger.error('OneWire scan failed', err)
  }
}

function toggleOneWireDevice(romCode: string) {
  const device = oneWireScanState.value.scanResults.find(d => d.rom_code === romCode)
  if (device?.already_configured) return
  espStore.toggleRomSelection(props.espId, romCode)
}

function toggleAllOneWireDevices() {
  if (allOneWireDevicesSelected.value) {
    espStore.deselectAllOneWireDevices(props.espId)
  } else {
    espStore.selectSpecificRomCodes(props.espId, newOneWireDevices.value.map(d => d.rom_code))
  }
}

async function addMultipleOneWireSensors() {
  const state = oneWireScanState.value
  const romCodesToAdd = state.selectedRomCodes.filter(rc => {
    const d = state.scanResults.find(dev => dev.rom_code === rc)
    return d && !d.already_configured
  })
  if (romCodesToAdd.length === 0) {
    toast.warning('Bitte wähle mindestens ein neues Gerät aus')
    return
  }
  let successCount = 0
  let failCount = 0
  for (const romCode of romCodesToAdd) {
    try {
      const device = state.scanResults.find(d => d.rom_code === romCode)
      await espStore.addSensor(props.espId, {
        sensor_type: (device?.device_type || 'ds18b20').toUpperCase(),
        gpio: oneWireScanPin.value,
        onewire_address: romCode,
        interface_type: 'ONEWIRE' as any,
        operating_mode: 'continuous',
        timeout_seconds: 180,
        raw_mode: true,
        name: `Temp ${romCode.slice(-4)}`,
      })
      successCount++
    } catch (err) {
      logger.error(`Failed to add OneWire sensor ${romCode}`, err)
      failCount++
    }
  }
  if (successCount > 0 && failCount === 0) toast.success(`${successCount} DS18B20-Sensor(en) hinzugefügt`)
  else if (successCount > 0) toast.warning(`${successCount} erfolgreich, ${failCount} fehlgeschlagen`)
  else toast.error(`Alle ${failCount} Sensor(en) fehlgeschlagen`)

  espStore.clearOneWireScan(props.espId)
  close()
  resetForm()
  espStore.fetchGpioStatus(props.espId)
  emit('added')
}

function formatRomCode(rom: string): string {
  return rom.match(/.{1,2}/g)?.join(':') || rom
}

function shortenRomCode(rom: string): string {
  if (rom.length <= 8) return rom
  return `${rom.slice(0, 4)}...${rom.slice(-4)}`
}

function onSensorGpioValidation(valid: boolean, _message: string | null): void {
  sensorGpioValid.value = valid
}
</script>

<template>
  <BaseModal
    :open="modelValue"
    title="Sensor hinzufügen"
    max-width="max-w-md"
    @update:open="(v: boolean) => emit('update:modelValue', v)"
    @close="close"
  >
    <div class="modal-form">
      <!-- Sensor Type -->
      <div class="form-group">
        <label class="form-label">Sensor-Typ</label>
        <select v-model="newSensor.sensor_type" class="form-select">
          <option v-for="opt in sensorTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <!-- OneWire Scan Section -->
      <div v-if="isOneWireSensor" class="onewire-scan-section">
        <div class="onewire-scan-header">
          <h4 class="onewire-scan-title">
            <Thermometer :size="16" class="text-blue-400" />
            OneWire-Bus scannen
          </h4>
          <div class="onewire-scan-controls">
            <select v-model="oneWireScanPin" class="form-select form-select--sm">
              <option v-for="pin in oneWireScanPins" :key="pin" :value="pin">GPIO {{ pin }}</option>
            </select>
            <button type="button" class="btn-scan" :disabled="oneWireScanState.isScanning" @click="handleOneWireScan">
              <Loader2 v-if="oneWireScanState.isScanning" class="animate-spin" :size="16" />
              <ScanLine v-else :size="16" />
              {{ oneWireScanState.isScanning ? 'Scanne...' : 'Bus scannen' }}
            </button>
          </div>
        </div>

        <!-- Scan Results -->
        <div v-if="oneWireScanState.scanResults.length > 0" class="onewire-scan-results">
          <div class="onewire-scan-results-header">
            <span class="onewire-scan-results-count">
              {{ oneWireScanState.scanResults.length }} Gerät(e) gefunden
              <span v-if="newOneWireDeviceCount < oneWireScanState.scanResults.length" class="text-gray-400">({{ newOneWireDeviceCount }} neu)</span>
            </span>
            <button v-if="newOneWireDeviceCount > 0" type="button" class="btn-ghost btn-xs" @click="toggleAllOneWireDevices">
              <CheckSquare v-if="allOneWireDevicesSelected" :size="14" /><Square v-else :size="14" />
              {{ allOneWireDevicesSelected ? 'Alle abwählen' : 'Alle auswählen' }}
            </button>
          </div>
          <div class="onewire-device-list">
            <label v-for="device in oneWireScanState.scanResults" :key="device.rom_code"
              class="onewire-device-item" :class="{ 'onewire-device-item--selected': oneWireScanState.selectedRomCodes.includes(device.rom_code) && !device.already_configured, 'onewire-device-item--configured': device.already_configured }">
              <input type="checkbox" :checked="oneWireScanState.selectedRomCodes.includes(device.rom_code)" :disabled="device.already_configured" @change="toggleOneWireDevice(device.rom_code)" />
              <div class="onewire-device-info">
                <code class="onewire-rom-code" :class="{ 'text-gray-500': device.already_configured }" :title="formatRomCode(device.rom_code)">{{ shortenRomCode(device.rom_code) }}</code>
                <Badge v-if="device.already_configured" variant="gray" size="xs"><Check :size="10" class="mr-0.5" />{{ device.sensor_name || 'Konfiguriert' }}</Badge>
                <Badge v-else variant="success" size="xs">Neu</Badge>
              </div>
              <Thermometer :size="16" :class="device.already_configured ? 'text-gray-500' : 'text-blue-400'" />
            </label>
          </div>
          <button v-if="selectedNewDeviceCount > 0" type="button" class="btn btn-primary w-full onewire-bulk-add-btn" @click="addMultipleOneWireSensors">
            <Plus :size="16" />{{ selectedNewDeviceCount }} {{ selectedNewDeviceCount === 1 ? 'neuen Sensor' : 'neue Sensoren' }} hinzufügen
          </button>
          <div v-else-if="newOneWireDeviceCount === 0" class="onewire-all-configured">
            <Check :size="16" class="text-green-400" /><span>Alle gefundenen Geräte sind bereits konfiguriert</span>
          </div>
        </div>
        <div v-else-if="oneWireScanState.scanError" class="onewire-scan-error"><AlertCircle :size="16" /><span>{{ oneWireScanState.scanError }}</span></div>
        <div v-else-if="!oneWireScanState.isScanning && oneWireScanState.lastScanTimestamp && oneWireScanState.scanResults.length === 0" class="onewire-scan-empty onewire-scan-empty--no-devices">
          <AlertCircle :size="20" class="text-yellow-400" />
          <div class="onewire-scan-empty-content">
            <p class="onewire-scan-empty-title">Keine OneWire-Geräte gefunden</p>
            <p class="onewire-scan-empty-hint">• Überprüfe die Verkabelung (GPIO {{ oneWireScanPin }})<br>• 4.7kΩ Pull-up-Widerstand?<br>• Anderen GPIO-Pin versuchen</p>
          </div>
        </div>
        <div v-else-if="!oneWireScanState.isScanning" class="onewire-scan-empty"><Info :size="16" /><span>Klicke "Bus scannen" um OneWire-Geräte auf GPIO {{ oneWireScanPin }} zu finden</span></div>
        <div v-else class="onewire-scan-loading"><Loader2 class="animate-spin" :size="24" /><span>Scanne OneWire-Bus auf GPIO {{ oneWireScanPin }}...</span></div>
      </div>

      <!-- I2C Address (I2C sensors only) -->
      <div v-if="isI2CSensor" class="form-group">
        <label class="form-label">I2C-Adresse</label>
        <select v-model.number="selectedI2CAddress" class="form-select">
          <option v-for="opt in i2cAddressOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <p class="form-hint">
          <Info :size="12" class="inline-block mr-1 opacity-70" />I2C-Bus: SDA/SCL werden automatisch konfiguriert
        </p>
      </div>

      <!-- GPIO (non-OneWire, non-I2C only) -->
      <div v-if="!isOneWireSensor && !isI2CSensor" class="form-group">
        <label class="form-label">GPIO</label>
        <GpioPicker v-model="newSensor.gpio" :esp-id="espId" :sensor-type="newSensor.sensor_type" variant="dropdown" @validation-change="onSensorGpioValidation" />
      </div>

      <!-- Operating Mode -->
      <div class="form-group">
        <label class="form-label">Betriebsmodus
          <span v-if="recommendedMode" class="text-xs text-gray-400 ml-2">(Empfohlen: {{ recommendedMode === 'on_demand' ? 'Auf Abruf' : 'Kontinuierlich' }})</span>
        </label>
        <select v-model="newSensor.operating_mode" class="form-select">
          <option value="continuous">Kontinuierlich</option>
          <option value="on_demand" :disabled="!supportsOnDemand">Auf Abruf {{ !supportsOnDemand ? '(nicht unterstützt)' : '' }}</option>
          <option value="scheduled">Geplant</option>
          <option value="paused">Pausiert</option>
        </select>
      </div>

      <!-- Timeout -->
      <div v-if="newSensor.operating_mode === 'continuous'" class="form-group">
        <label class="form-label">Timeout (Sekunden) <span class="text-xs text-gray-400 ml-2">(0 = kein Timeout)</span></label>
        <input v-model.number="newSensor.timeout_seconds" type="number" min="0" max="86400" class="form-input" placeholder="180" />
      </div>

      <!-- Name -->
      <div class="form-group">
        <label class="form-label">Name (optional)</label>
        <input v-model="newSensor.name" type="text" class="form-input" placeholder="z.B. Wassertemperatur" />
      </div>

      <!-- Subzone -->
      <div class="form-group">
        <label class="form-label">Subzone (optional)</label>
        <input v-model="newSensor.subzone_id" type="text" class="form-input" placeholder="z.B. gewaechshaus_reihe_1" />
      </div>

      <!-- Initial Value + Unit -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Startwert</label>
          <input v-model.number="newSensor.raw_value" type="number" step="0.1" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Einheit</label>
          <input :value="newSensor.unit" type="text" class="form-input form-input--readonly" readonly />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="close">Abbrechen</button>
        <button v-if="!isOneWireSensor" class="btn btn-primary" :disabled="isI2CSensor ? selectedI2CAddress === null : !sensorGpioValid" @click="addSensor">Hinzufügen</button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
/* ── Modal Form Layout ─────────────────────────────────────────────── */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

/* ── Form Elements ─────────────────────────────────────────────────── */
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input,
.form-select {
  padding: 0.625rem 0.75rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  transition: border-color 0.15s ease;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-iridescent-1);
}

.form-input--readonly {
  background: var(--color-bg-primary);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.form-select--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  width: auto;
  min-width: 100px;
}

.form-hint {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
}

/* ── OneWire Scan Section ──────────────────────────────────────────── */
.onewire-scan-section {
  margin-top: 0.25rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(96, 165, 250, 0.08));
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 0.5rem;
}

.onewire-scan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.onewire-scan-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.onewire-scan-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn-scan {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-bright) 100%);
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-scan:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.4);
}

.btn-scan:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Scan Results */
.onewire-scan-results {
  margin-top: 1rem;
}

.onewire-scan-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.onewire-scan-results-count {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.btn-ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 0.375rem;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  transition: all 0.15s ease;
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.25);
  color: var(--color-text-primary);
}

.btn-xs {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  gap: 0.25rem;
}

/* Device List */
.onewire-device-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.onewire-device-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-bg-secondary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.onewire-device-item:hover {
  border-color: rgba(96, 165, 250, 0.4);
  background: var(--color-bg-tertiary);
}

.onewire-device-item--selected {
  border-color: rgba(96, 165, 250, 0.6);
  background: rgba(96, 165, 250, 0.1);
}

.onewire-device-item--configured {
  border-color: rgba(156, 163, 175, 0.3);
  background: rgba(107, 114, 128, 0.05);
  opacity: 0.7;
  cursor: not-allowed;
}

.onewire-device-item--configured:hover {
  border-color: rgba(156, 163, 175, 0.3);
  background: rgba(107, 114, 128, 0.05);
}

.onewire-device-item--configured input[type="checkbox"] {
  cursor: not-allowed;
  opacity: 0.5;
}

.onewire-all-configured {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 0.375rem;
  color: var(--color-success);
  font-size: 0.8125rem;
  margin-top: 0.5rem;
}

.onewire-device-item input[type="checkbox"] {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: var(--color-accent-bright);
}

.onewire-device-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.onewire-rom-code {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.8125rem;
  color: var(--color-accent-bright);
  background: rgba(96, 165, 250, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.onewire-bulk-add-btn {
  margin-top: 0.5rem;
}

/* Scan Error */
.onewire-scan-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 0.375rem;
  color: var(--color-error);
  font-size: 0.8125rem;
  margin-top: 1rem;
}

.onewire-scan-error svg {
  flex-shrink: 0;
  margin-top: 0.125rem;
}

/* Scan Empty State */
.onewire-scan-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--color-bg-tertiary);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 0.375rem;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  justify-content: center;
  margin-top: 1rem;
}

.onewire-scan-empty--no-devices {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  padding: 1rem;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.onewire-scan-empty-content {
  text-align: left;
  width: 100%;
}

.onewire-scan-empty-title {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.onewire-scan-empty-hint {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Scan Loading State */
.onewire-scan-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-top: 1rem;
}

.onewire-scan-loading svg {
  color: var(--color-accent-bright);
}
</style>
