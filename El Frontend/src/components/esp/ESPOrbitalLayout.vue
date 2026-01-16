<script setup lang="ts">
/**
 * ESPHorizontalLayout Component (formerly ESPOrbitalLayout)
 *
 * Displays sensors and actuators in a horizontal 3-column layout:
 * - Left column: Sensors (vertically stacked)
 * - Center column: ESP Card
 * - Right column: Actuators (vertically stacked)
 *
 * Features:
 * - Side-by-side layout: no overlap, all elements always visible
 * - Responsive: mobile = vertical stack, tablet/desktop = horizontal
 * - Drag & drop for adding sensors from sidebar
 * - Click to select/highlight satellites
 * - Chart panel expands within center card (not overlaying satellites)
 */

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { X, Heart, Settings2, Loader2, Pencil, Check, Trash2, ScanLine, AlertCircle, Info, Thermometer, Plus, CheckSquare, Square } from 'lucide-vue-next'
import ESPCard from './ESPCard.vue'
import { getWifiStrength, type WifiStrengthInfo } from '@/utils/wifiStrength'
import { formatRelativeTime } from '@/utils/formatters'
import SensorSatellite from './SensorSatellite.vue'
import ActuatorSatellite from './ActuatorSatellite.vue'
import AnalysisDropZone from './AnalysisDropZone.vue'
import GpioPicker from './GpioPicker.vue'
import Badge from '@/components/common/Badge.vue'
import type { ESPDevice } from '@/api/esp'
import type { MockSensor, MockActuator, QualityLevel, ChartSensor, MockSensorConfig } from '@/types'
import { espApi } from '@/api/esp'
import { sensorsApi } from '@/api/sensors'
import { getStateInfo } from '@/utils/labels'
import { useEspStore } from '@/stores/esp'
import { useDragStateStore } from '@/stores/dragState'
import { useToast } from '@/composables/useToast'
import { useGpioStatus } from '@/composables/useGpioStatus'
import {
  SENSOR_TYPE_CONFIG,
  getSensorUnit,
  getSensorDefault,
  getSensorTypeOptions,
  // Phase 6: Multi-Value Sensor Support
  getDeviceTypeFromSensorType,
  getSensorTypesForDevice,
  getMultiValueDeviceConfig
} from '@/utils/sensorDefaults'
import {
  getActuatorLabel,
  getActuatorTypeOptions,
  isPwmActuator,
  supportsAuxGpio,
  supportsInvertedLogic,
  getActuatorSafetyDefaults
} from '@/utils/actuatorDefaults'
import { getRecommendedGpios } from '@/utils/gpioConfig'
import type { MockActuatorConfig } from '@/types'

interface Props {
  /** The ESP device data */
  device: ESPDevice
  /** Whether to show connection lines (default: true) */
  showConnections?: boolean
  /** Compact mode for dashboard view (default: false) */
  compactMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showConnections: true,
  compactMode: false
})

const espStore = useEspStore()
const dragStore = useDragStateStore()
const toast = useToast()

const emit = defineEmits<{
  sensorClick: [gpio: number]
  actuatorClick: [gpio: number]
  sensorDropped: [sensor: ChartSensor]
  /** Heartbeat request (Mock ESPs only) */
  heartbeat: [device: ESPDevice]
  /** Delete request - opens confirmation dialog */
  delete: [device: ESPDevice]
  /** Settings popover request */
  settings: [device: ESPDevice]
  /** Name was updated via inline edit */
  'name-updated': [payload: { deviceId: string; name: string | null }]
}>()

// =============================================================================
// Analysis Drop Zone State
// =============================================================================
const analysisExpanded = ref(false)

// Track if chart was auto-opened (to auto-close when drag ends)
const wasAutoOpened = ref(false)

// Handle sensor dropped into analysis zone
function handleSensorDrop(sensor: ChartSensor) {
  emit('sensorDropped', sensor)
}

// =============================================================================
// Add Sensor Drop Handler State
// =============================================================================
const isDragOver = ref(false)
const showAddSensorModal = ref(false)

// Default sensor type for new sensors
const defaultSensorType = 'DS18B20'

// New sensor form state (Phase 2B: Operating Mode erweitert)
const newSensor = ref<MockSensorConfig & { operating_mode?: string; timeout_seconds?: number }>({
  gpio: 0,
  sensor_type: defaultSensorType,
  name: '',
  subzone_id: '',
  raw_value: getSensorDefault(defaultSensorType),
  unit: getSensorUnit(defaultSensorType),
  quality: 'good',
  raw_mode: true,
  // Operating Mode (Phase 2B)
  operating_mode: 'continuous',
  timeout_seconds: 180
})

// Sensor type options for dropdown
const sensorTypeOptions = getSensorTypeOptions()

// GPIO Validation State (Phase 5 GpioPicker Integration)
const sensorGpioValid = ref(false)

// OneWire scan pin (Phase 6 - must be declared before watchers that use it)
const oneWireScanPin = ref(4)

// Watch for sensor type changes and update unit/initial value + Operating Mode (Phase 2B)
watch(() => newSensor.value.sensor_type, (newType) => {
  const config = SENSOR_TYPE_CONFIG[newType]
  if (config) {
    newSensor.value.unit = config.unit
    newSensor.value.raw_value = config.defaultValue
    // Operating Mode aktualisieren (Phase 2B)
    newSensor.value.operating_mode = config.recommendedMode || 'continuous'
    newSensor.value.timeout_seconds = config.recommendedTimeout ?? 180
  }
  
  // DS18B20/OneWire: Auto-set GPIO to scan pin (Phase 6)
  if (newType.toLowerCase().includes('ds18b20')) {
    newSensor.value.gpio = oneWireScanPin.value
  }
})

// Watch oneWireScanPin: Auto-update GPIO when scan pin changes (Phase 6)
watch(oneWireScanPin, (newPin) => {
  if (isOneWireSensor.value) {
    newSensor.value.gpio = newPin
  }
})

// ============================================================================
// OPERATING MODE HELPERS (Phase 2B)
// ============================================================================

/**
 * Empfohlener Operating Mode für den ausgewählten Sensor-Typ.
 * Wird aus sensorDefaults.ts gelesen oder Default 'continuous'.
 */
const recommendedMode = computed(() => {
  const config = SENSOR_TYPE_CONFIG[newSensor.value.sensor_type]
  return config?.recommendedMode || 'continuous'
})

/**
 * Ob der ausgewählte Sensor-Typ On-Demand unterstützt.
 */
const supportsOnDemand = computed(() => {
  const config = SENSOR_TYPE_CONFIG[newSensor.value.sensor_type]
  return config?.supportsOnDemand ?? false
})

// ============================================================================
// ONEWIRE SCAN HELPERS (Phase 6 - DS18B20)
// ============================================================================

/**
 * Check if selected sensor type is a OneWire sensor (DS18B20).
 */
const isOneWireSensor = computed(() => {
  const sensorType = newSensor.value.sensor_type.toLowerCase()
  return sensorType.includes('ds18b20')
})

/**
 * Get OneWire scan state for current device.
 */
const oneWireScanState = computed(() => {
  return espStore.getOneWireScanState(espId.value)
})

/**
 * Get only NEW (not yet configured) devices from scan results.
 * 
 * OneWire Multi-Device Support: Filter out already_configured devices
 * so we only show/count NEW devices that can be added.
 */
const newOneWireDevices = computed(() => {
  return oneWireScanState.value.scanResults.filter(
    device => !device.already_configured
  )
})

/**
 * Count of NEW (not yet configured) devices.
 */
const newOneWireDeviceCount = computed(() => {
  return newOneWireDevices.value.length
})

/**
 * Count of SELECTED new devices (only devices that can actually be added).
 */
const selectedNewDeviceCount = computed(() => {
  const state = oneWireScanState.value
  return newOneWireDevices.value.filter(device =>
    state.selectedRomCodes.includes(device.rom_code)
  ).length
})

/**
 * Check if all NEW (not already configured) devices are selected.
 * 
 * OneWire Multi-Device Support: Only consider new devices for "select all".
 */
const allOneWireDevicesSelected = computed(() => {
  const newDevices = newOneWireDevices.value
  if (newDevices.length === 0) return false
  return newDevices.every(device =>
    oneWireScanState.value.selectedRomCodes.includes(device.rom_code)
  )
})

/**
 * Check if a device is already configured (helper for template).
 */
function isDeviceConfigured(romCode: string): boolean {
  const device = oneWireScanState.value.scanResults.find(d => d.rom_code === romCode)
  return device?.already_configured ?? false
}

/**
 * Trigger OneWire bus scan on the ESP.
 */
async function handleOneWireScan() {
  try {
    await espStore.scanOneWireBus(espId.value, oneWireScanPin.value)
  } catch (err) {
    console.error('[ESPOrbitalLayout] OneWire scan failed:', err)
  }
}

/**
 * Format ROM code for display (with colons).
 * "28FF641E8D3C0C79" → "28:FF:64:1E:8D:3C:0C:79"
 */
function formatRomCode(rom: string): string {
  return rom.match(/.{1,2}/g)?.join(':') || rom
}

/**
 * Shorten ROM code for compact display.
 * "28FF641E8D3C0C79" → "28FF...0C79"
 */
function shortenRomCode(rom: string): string {
  if (rom.length <= 8) return rom
  return `${rom.slice(0, 4)}...${rom.slice(-4)}`
}

/**
 * Toggle device selection in scan results.
 * 
 * OneWire Multi-Device Support: Prevents toggling already_configured devices.
 */
function toggleOneWireDevice(romCode: string) {
  // Don't allow toggling already_configured devices
  if (isDeviceConfigured(romCode)) {
    return
  }
  espStore.toggleRomSelection(espId.value, romCode)
}

/**
 * Select or deselect all NEW OneWire devices.
 * 
 * OneWire Multi-Device Support: Only toggles new devices, not already_configured ones.
 */
function toggleAllOneWireDevices() {
  if (allOneWireDevicesSelected.value) {
    // Deselect all
    espStore.deselectAllOneWireDevices(espId.value)
  } else {
    // Select only NEW (not already_configured) devices
    const newRomCodes = newOneWireDevices.value.map(d => d.rom_code)
    espStore.selectSpecificRomCodes(espId.value, newRomCodes)
  }
}

/**
 * Add multiple OneWire sensors (bulk add from scan results).
 * 
 * OneWire Multi-Device Support: Skips already_configured devices.
 */
async function addMultipleOneWireSensors() {
  const state = oneWireScanState.value
  
  // Filter to only NEW (not already_configured) devices
  const romCodesToAdd = state.selectedRomCodes.filter(romCode => {
    const device = state.scanResults.find(d => d.rom_code === romCode)
    return device && !device.already_configured
  })
  
  if (romCodesToAdd.length === 0) {
    toast.warning('Bitte wähle mindestens ein neues Gerät aus')
    return
  }
  
  const pin = oneWireScanPin.value
  let successCount = 0
  let failCount = 0
  
  for (const romCode of romCodesToAdd) {
    try {
      // Find device info from scan results
      const device = state.scanResults.find(d => d.rom_code === romCode)
      const deviceType = device?.device_type || 'ds18b20'
      
      const config = {
        sensor_type: deviceType.toUpperCase(),  // DS18B20
        gpio: pin,
        onewire_address: romCode,
        interface_type: 'ONEWIRE' as const,
        operating_mode: 'continuous',
        timeout_seconds: 180,
        raw_mode: true,
        name: `Temp ${romCode.slice(-4)}`,  // Auto-name: "Temp 0C79"
      }
      
      await espStore.addSensor(espId.value, config)
      successCount++
      
    } catch (err) {
      console.error(`[ESPOrbitalLayout] Failed to add OneWire sensor ${romCode}:`, err)
      failCount++
    }
  }
  
  // Summary toast
  if (successCount > 0 && failCount === 0) {
    toast.success(`${successCount} DS18B20-Sensor(en) erfolgreich hinzugefügt`)
  } else if (successCount > 0 && failCount > 0) {
    toast.warning(`${successCount} erfolgreich, ${failCount} fehlgeschlagen`)
  } else if (failCount > 0) {
    toast.error(`Alle ${failCount} Sensor(en) fehlgeschlagen`)
  }
  
  // Reset and close modal
  espStore.clearOneWireScan(espId.value)
  showAddSensorModal.value = false
  resetNewSensor()
  
  // Refresh GPIO status after adding sensors
  espStore.fetchGpioStatus(espId.value)
}

// Watch for modal close to cleanup scan state
watch(() => showAddSensorModal.value, (isOpen) => {
  if (!isOpen) {
    // Clear scan results when modal closes
    espStore.clearOneWireScan(espId.value)
    oneWireScanPin.value = 4  // Reset to default pin
  }
})

// Reset new sensor form to defaults (Phase 2B: Operating Mode erweitert)
function resetNewSensor() {
  newSensor.value = {
    gpio: 0,
    sensor_type: defaultSensorType,
    name: '',
    subzone_id: '',
    raw_value: getSensorDefault(defaultSensorType),
    unit: getSensorUnit(defaultSensorType),
    quality: 'good',
    raw_mode: true,
    // Operating Mode reset (Phase 2B)
    operating_mode: 'continuous',
    timeout_seconds: 180
  }
  // Reset GPIO validation state
  sensorGpioValid.value = false
}

/**
 * Handle GPIO validation changes from GpioPicker.
 * Updates the validation state for the Add Sensor button.
 *
 * @param valid - Whether the selected GPIO is valid
 * @param message - Validation error message (if any)
 */
function onSensorGpioValidation(valid: boolean, message: string | null): void {
  sensorGpioValid.value = valid
  if (!valid && message) {
    console.debug('[ESPOrbitalLayout] GPIO validation:', message)
  }
}

// =============================================================================
// ADD ACTUATOR STATE (Phase 7)
// =============================================================================
const showAddActuatorModal = ref(false)
const defaultActuatorType = 'relay'

// New actuator form state
const newActuator = ref<MockActuatorConfig>({
  gpio: 0,
  aux_gpio: 255,              // 255 = nicht verwendet (ESP32 Default)
  actuator_type: defaultActuatorType,
  name: '',
  state: false,
  pwm_value: 0,
  min_value: 0,
  max_value: 100,
  // Safety-Felder (aus ESP32 RuntimeProtection)
  max_runtime_seconds: 0,     // 0 = kein Timeout
  cooldown_seconds: 0,        // 0 = kein Cooldown
  inverted_logic: false,      // LOW = ON
})

// Actuator type options for dropdown
const actuatorTypeOptions = getActuatorTypeOptions()

// GPIO Validation State for actuator
const actuatorGpioValid = ref(false)
const actuatorAuxGpioValid = ref(true) // aux_gpio is optional, default valid

// Computed for aux_gpio to handle undefined→null conversion for GpioPicker
const actuatorAuxGpio = computed({
  get: (): number | null => newActuator.value.aux_gpio ?? 255,
  set: (value: number | null) => { newActuator.value.aux_gpio = value }
})

// Watch for actuator type changes and update safety defaults
watch(() => newActuator.value.actuator_type, (newType) => {
  const defaults = getActuatorSafetyDefaults(newType)
  newActuator.value.max_runtime_seconds = defaults.maxRuntime
  newActuator.value.cooldown_seconds = defaults.cooldown
  // Reset aux_gpio if new type doesn't support it
  if (!supportsAuxGpio(newType)) {
    newActuator.value.aux_gpio = 255
  }
  // Reset inverted_logic if new type doesn't support it
  if (!supportsInvertedLogic(newType)) {
    newActuator.value.inverted_logic = false
  }
})

// Reset new actuator form to defaults
function resetNewActuator() {
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

/**
 * Handle GPIO validation changes from GpioPicker for actuator.
 */
function onActuatorGpioValidation(valid: boolean, message: string | null): void {
  actuatorGpioValid.value = valid
  if (!valid && message) {
    console.debug('[ESPOrbitalLayout] Actuator GPIO validation:', message)
  }
}

/**
 * Handle aux GPIO validation changes from GpioPicker for valve.
 */
function onActuatorAuxGpioValidation(valid: boolean, message: string | null): void {
  // aux_gpio=255 means "not used", which is always valid
  actuatorAuxGpioValid.value = valid || newActuator.value.aux_gpio === 255
  if (!valid && message && newActuator.value.aux_gpio !== 255) {
    console.debug('[ESPOrbitalLayout] Actuator aux GPIO validation:', message)
  }
}

// Error-Code-Mapping für benutzerfreundliche Meldungen (ESP32 → Frontend)
const ACTUATOR_ERROR_MESSAGES: Record<number, string> = {
  1050: 'Aktor-Status konnte nicht gesetzt werden',
  1051: 'Aktor-Initialisierung fehlgeschlagen',
  1052: 'Aktor nicht gefunden',
  1053: 'GPIO-Konflikt mit einem Sensor',
  1001: 'GPIO ist vom System reserviert',
  1002: 'GPIO wird bereits verwendet',
  1030: 'PWM-Controller konnte nicht initialisiert werden',
  1031: 'Alle PWM-Kanäle sind belegt (max. 16)',
}

// Add actuator to ESP
async function addActuator() {
  try {
    await espStore.addActuator(espId.value, {
      gpio: newActuator.value.gpio,
      actuator_type: newActuator.value.actuator_type,
      name: newActuator.value.name || undefined,
      state: newActuator.value.state,
      pwm_value: newActuator.value.pwm_value,
      aux_gpio: newActuator.value.aux_gpio !== 255 ? newActuator.value.aux_gpio : undefined,
      inverted_logic: newActuator.value.inverted_logic,
      max_runtime_seconds: newActuator.value.max_runtime_seconds,
      cooldown_seconds: newActuator.value.cooldown_seconds,
    })

    const actuatorLabel = getActuatorLabel(newActuator.value.actuator_type)
    toast.success(`Aktor "${actuatorLabel}" auf GPIO ${newActuator.value.gpio} hinzugefügt`)

    showAddActuatorModal.value = false
    resetNewActuator()

    // Refresh ESP data und GPIO-Status
    await Promise.all([
      espStore.fetchAll(),
      espStore.fetchGpioStatus(espId.value)
    ])
  } catch (error: any) {
    // HTTP 409 GPIO_CONFLICT
    if (error?.response?.status === 409) {
      const detail = error.response.data?.detail
      if (detail?.error === 'GPIO_CONFLICT') {
        toast.error(`GPIO ${detail.gpio} nicht verfügbar: ${detail.message}`)
        await espStore.fetchGpioStatus(espId.value)
        return
      }
    }
    // Config Response mit Error-Code (WebSocket Event)
    if (error?.error_code) {
      const friendlyMsg = ACTUATOR_ERROR_MESSAGES[error.error_code] || `Fehler ${error.error_code}`
      toast.error(`${friendlyMsg}: ${error.detail || ''}`)
      return
    }
    // Generic Error
    const errorMsg = error?.response?.data?.detail || error?.message || 'Unbekannter Fehler'
    toast.error(`Fehler beim Hinzufügen des Aktors: ${errorMsg}`)
  }
}

// =============================================================================
// EDIT SENSOR STATE (Phase 2F)
// =============================================================================
const showEditSensorModal = ref(false)
const editingSensor = ref<{
  gpio: number
  sensor_type: string
  name: string | null
  operating_mode: string | null  // null = use type default
  timeout_seconds: number | null // null = use type default
  schedule_config: { type: string; expression: string } | null // Schedule configuration
  // Type defaults for comparison
  typeDefaultMode: string
  typeDefaultTimeout: number
} | null>(null)

// Cron Presets for easy selection
const CRON_PRESETS = [
  { label: 'Jede Stunde', value: '0 * * * *', description: 'Zur vollen Stunde' },
  { label: 'Alle 6 Stunden', value: '0 */6 * * *', description: '00:00, 06:00, 12:00, 18:00' },
  { label: 'Täglich um 8:00', value: '0 8 * * *', description: 'Einmal täglich' },
  { label: 'Alle 15 Minuten', value: '*/15 * * * *', description: '00, 15, 30, 45' },
  { label: 'Alle 30 Minuten', value: '*/30 * * * *', description: '00 und 30' },
  { label: 'Wochentags 9:00', value: '0 9 * * 1-5', description: 'Mo-Fr um 9:00' },
]

// Loading & Error State for Edit Modal
const isEditSaving = ref(false)
const editError = ref<string | null>(null)
const isMeasuring = ref(false)
const measureSuccess = ref<string | null>(null)

// =============================================================================
// EDIT MODAL COMPUTED (Phase 2F)
// =============================================================================

// Check if current value differs from type default
const editHasModeOverride = computed(() => {
  if (!editingSensor.value) return false
  return editingSensor.value.operating_mode !== null
})

const editHasTimeoutOverride = computed(() => {
  if (!editingSensor.value) return false
  return editingSensor.value.timeout_seconds !== null
})

// Effective values (what will actually be used)
const editEffectiveMode = computed(() => {
  if (!editingSensor.value) return 'continuous'
  return editingSensor.value.operating_mode ?? editingSensor.value.typeDefaultMode
})

const editEffectiveTimeout = computed(() => {
  if (!editingSensor.value) return 180
  return editingSensor.value.timeout_seconds ?? editingSensor.value.typeDefaultTimeout
})

// Check if on_demand is supported for this sensor type
const editSupportsOnDemand = computed(() => {
  if (!editingSensor.value) return false
  const config = SENSOR_TYPE_CONFIG[editingSensor.value.sensor_type]
  return config?.supportsOnDemand ?? false
})

// Get sensor label for display
function getSensorLabel(sensorType: string): string {
  const config = SENSOR_TYPE_CONFIG[sensorType]
  return config?.label || sensorType
}

// =============================================================================
// Debug Logger
// =============================================================================
function log(message: string, data?: Record<string, unknown>): void {
  const style = 'background: #3b82f6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
  const label = `ESPLayout:${espId.value}`
  if (data) {
    console.log(`%c[${label}]%c ${message}`, style, 'color: #60a5fa;', data)
  } else {
    console.log(`%c[${label}]%c ${message}`, style, 'color: #60a5fa;')
  }
}

// =============================================================================
// Drop Event Handlers (for adding sensors via drag from sidebar)
// =============================================================================

function onDragEnter(event: DragEvent) {
  // Prüfe ob das ein VueDraggable-Event ist (ESP-Card-Reordering)
  // VueDraggable setzt keine dataTransfer-Typen, native Drags schon
  const types = event.dataTransfer?.types || []
  const isVueDraggable = types.length === 0 || types.includes('text/plain')

  log('dragenter', {
    isDraggingSensorType: dragStore.isDraggingSensorType,
    isDraggingSensor: dragStore.isDraggingSensor,
    isDraggingActuatorType: dragStore.isDraggingActuatorType,
    types: Array.from(types),
    isVueDraggable,
    target: (event.target as Element)?.className?.slice?.(0, 50) || (event.target as Element)?.tagName,
  })

  // KRITISCH: Wenn weder SensorType noch Sensor noch ActuatorType gedraggt wird,
  // ist es wahrscheinlich ein VueDraggable-Event (ESP-Card-Reordering)
  // In diesem Fall NICHT reagieren, um VueDraggable nicht zu stören!
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    log('dragenter IGNORED - likely VueDraggable ESP-Card reordering')
    return
  }

  // React visually if dragging a sensor or actuator type from sidebar (for adding new items)
  if (dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType) {
    isDragOver.value = true
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
    log('isDragOver = true (sensor/actuator type from sidebar)')
  }
  // Sensor-Satellite-Drags (für Chart) werden durchgelassen zur AnalysisDropZone
}

function onDragOver(event: DragEvent) {
  // KRITISCH: Wenn weder SensorType noch Sensor noch ActuatorType gedraggt wird,
  // ist es wahrscheinlich ein VueDraggable-Event (ESP-Card-Reordering)
  // In diesem Fall NICHT preventDefault() aufrufen, um VueDraggable nicht zu stören!
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    // VueDraggable ESP-Card-Reordering - durchlassen ohne Intervention
    return
  }

  // KRITISCH: preventDefault() muss aufgerufen werden um Drop zu erlauben!
  // Ohne preventDefault() zeigt der Browser "nicht zulässig" (roter Kreis)

  if (dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType) {
    // Sensor/Aktor-Typ aus Sidebar → Drop auf ESP-Card erlauben (zum Hinzufügen)
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  } else if (dragStore.isDraggingSensor) {
    // Sensor-Satellite für Chart → Drop auf AnalysisDropZone erlauben
    // Wir erlauben den Drop hier, die AnalysisDropZone entscheidet ob sie ihn annimmt
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }
}

function onDragLeave(event: DragEvent) {
  // KRITISCH: Ignorieren wenn es ein VueDraggable-Event ist
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    return
  }

  // Only reset if leaving the container entirely
  const target = event.currentTarget as HTMLElement
  const related = event.relatedTarget as HTMLElement
  if (!target.contains(related)) {
    isDragOver.value = false
    log('dragleave - isDragOver = false')
  }
}

function onDrop(event: DragEvent) {
  // KRITISCH: Ignorieren wenn es ein VueDraggable-Event ist
  if (!dragStore.isDraggingSensorType && !dragStore.isDraggingSensor && !dragStore.isDraggingActuatorType) {
    log('DROP IGNORED - likely VueDraggable ESP-Card reordering')
    return
  }

  log('DROP on ESPLayout', {
    hasJsonData: !!event.dataTransfer?.getData('application/json'),
    types: event.dataTransfer?.types,
  })

  event.preventDefault()
  isDragOver.value = false

  const jsonData = event.dataTransfer?.getData('application/json')
  if (!jsonData) {
    log('DROP - no JSON data, ignoring')
    return
  }

  try {
    const payload = JSON.parse(jsonData)
    log('DROP payload parsed', payload)

    if (payload.action === 'add-sensor') {
      log('DROP - add-sensor action, opening modal')
      // Pre-fill form with dragged sensor type
      newSensor.value.sensor_type = payload.sensorType
      newSensor.value.unit = getSensorUnit(payload.sensorType)
      newSensor.value.raw_value = getSensorDefault(payload.sensorType)
      // Find next available GPIO - Phase 5: Dynamic GPIO Selection
      // Priority 1: Use actual available GPIOs from server (dynamicAvailableGpios)
      // Priority 2: Fall back to recommended GPIOs for sensor type if status not loaded
      const usedGpios = sensors.value.map(s => s.gpio)
      let candidateGpios: number[]

      if (dynamicAvailableGpios.value.length > 0) {
        // Server knows which GPIOs are available
        candidateGpios = dynamicAvailableGpios.value
      } else {
        // Fallback: sensor-type-specific recommendations filtered by already-used
        const recommendedForType = getRecommendedGpios(payload.sensorType, 'sensor')
        candidateGpios = recommendedForType.filter(g => !usedGpios.includes(g))
      }

      const nextGpio = candidateGpios[0] || 0
      newSensor.value.gpio = nextGpio
      // Open modal
      showAddSensorModal.value = true
    } else if (payload.action === 'add-actuator') {
      log('DROP - add-actuator action, opening modal')
      // Pre-fill form with dragged actuator type
      newActuator.value.actuator_type = payload.actuatorType
      // Apply safety defaults for this type
      const defaults = getActuatorSafetyDefaults(payload.actuatorType)
      newActuator.value.max_runtime_seconds = defaults.maxRuntime
      newActuator.value.cooldown_seconds = defaults.cooldown
      // Find next available GPIO for actuators (no input_only pins!)
      const usedActuatorGpios = actuators.value.map(a => a.gpio)
      let candidateGpios: number[]

      if (dynamicAvailableGpios.value.length > 0) {
        // Server knows which GPIOs are available
        candidateGpios = dynamicAvailableGpios.value
      } else {
        // Fallback: actuator-type-specific recommendations filtered by already-used
        const recommendedForType = getRecommendedGpios(payload.actuatorType, 'actuator')
        candidateGpios = recommendedForType.filter(g => !usedActuatorGpios.includes(g))
      }

      const nextGpio = candidateGpios[0] || 0
      newActuator.value.gpio = nextGpio
      // Open modal
      showAddActuatorModal.value = true
    } else if (payload.type === 'sensor') {
      log('DROP - sensor for chart, should be handled by AnalysisDropZone')
    } else {
      log('DROP - unknown payload type', { type: payload.type, action: payload.action })
    }
  } catch (error) {
    log('DROP ERROR - failed to parse', { error })
  }
}

// Add sensor to ESP
// Phase 2B: Keine isMock-Blockade mehr!
// Der Store entscheidet welche API verwendet wird.
// Phase 5: Toast-Notifications und HTTP 409 Error-Handling hinzugefügt
// Phase 6: Multi-Value Sensor Support (SHT31, BMP280, etc.)
async function addSensor() {
  try {
    const deviceType = getDeviceTypeFromSensorType(newSensor.value.sensor_type)

    if (deviceType) {
      // MULTI-VALUE: Register ALL sensor_types for this device (PARALLEL!)
      const sensorTypes = getSensorTypesForDevice(deviceType)
      const deviceConfig = getMultiValueDeviceConfig(deviceType)

      // Add all sensor_types in parallel
      await Promise.all(
        sensorTypes.map(sensorType =>
          espStore.addSensor(espId.value, {
            gpio: newSensor.value.gpio,
            sensor_type: sensorType,
            name: newSensor.value.name || deviceConfig?.label,
            subzone_id: newSensor.value.subzone_id,
            // Operating Mode Felder für Real-ESPs
            operating_mode: newSensor.value.operating_mode,
            timeout_seconds: newSensor.value.timeout_seconds,
          })
        )
      )

      // Success Toast
      toast.success(`${deviceConfig?.label ?? deviceType} auf GPIO ${newSensor.value.gpio} hinzugefügt (${sensorTypes.length} Messwerte)`)
    } else {
      // SINGLE-VALUE: Normal behavior
      await espStore.addSensor(espId.value, {
        ...newSensor.value,
        // Operating Mode Felder für Real-ESPs
        operating_mode: newSensor.value.operating_mode,
        timeout_seconds: newSensor.value.timeout_seconds,
      })

      // Success Toast
      const sensorLabel = SENSOR_TYPE_CONFIG[newSensor.value.sensor_type]?.label || newSensor.value.sensor_type
      toast.success(`Sensor "${sensorLabel}" auf GPIO ${newSensor.value.gpio} hinzugefügt`)
    }

    showAddSensorModal.value = false
    resetNewSensor()

    // Refresh ESP data und GPIO-Status
    await Promise.all([
      espStore.fetchAll(),
      espStore.fetchGpioStatus(espId.value)
    ])
  } catch (error: any) {
    console.error('[ESPOrbitalLayout] Failed to add sensor:', error)

    // Handle GPIO conflict (HTTP 409) - Phase 5
    if (error?.response?.status === 409) {
      const detail = error.response.data?.detail
      if (detail?.error === 'GPIO_CONFLICT') {
        const conflictInfo = detail.message || `Belegt von ${detail.conflict_component}`
        toast.error(`GPIO ${detail.gpio} nicht verfügbar: ${conflictInfo}`)
        // Refresh GPIO status to get current state
        await espStore.fetchGpioStatus(espId.value)
      } else {
        toast.error(`GPIO-Konflikt: ${detail?.message || 'Der GPIO-Pin ist bereits belegt.'}`)
      }
    } else {
      // Generic error
      const errorMsg = error?.response?.data?.detail || error?.message || 'Unbekannter Fehler'
      toast.error(`Fehler beim Hinzufügen des Sensors: ${errorMsg}`)
    }
  }
}

// =============================================================================
// EDIT SENSOR HANDLERS (Phase 2F)
// =============================================================================

/**
 * Open edit modal for a sensor
 */
function openEditSensorModal(gpio: number) {
  const sensor = sensors.value.find(s => s.gpio === gpio)
  if (!sensor) {
    console.error('[ESPOrbitalLayout] Sensor not found:', gpio)
    return
  }

  // Reset error/success states
  editError.value = null
  measureSuccess.value = null
  isEditSaving.value = false
  isMeasuring.value = false

  // Get type defaults
  const typeConfig = SENSOR_TYPE_CONFIG[sensor.sensor_type] || {}
  const typeDefaultMode = typeConfig.recommendedMode || 'continuous'
  const typeDefaultTimeout = typeConfig.recommendedTimeout ?? 180

  // Initialize edit state
  // null means "use type default"
  // Parse existing schedule_config if present
  const existingSchedule = sensor.schedule_config as { type?: string; expression?: string } | null
  const scheduleConfig = existingSchedule?.expression
    ? { type: 'cron', expression: existingSchedule.expression }
    : null

  editingSensor.value = {
    gpio: sensor.gpio,
    sensor_type: sensor.sensor_type,
    name: sensor.name || null,
    // If sensor has override different from default, use it; otherwise null (= use default)
    operating_mode: sensor.operating_mode && sensor.operating_mode !== typeDefaultMode
      ? sensor.operating_mode
      : null,
    timeout_seconds: sensor.timeout_seconds !== undefined && sensor.timeout_seconds !== typeDefaultTimeout
      ? sensor.timeout_seconds
      : null,
    // Schedule configuration for scheduled mode
    schedule_config: scheduleConfig,
    // Store defaults for comparison
    typeDefaultMode,
    typeDefaultTimeout,
  }

  showEditSensorModal.value = true
}

/**
 * Reset a field to type default
 */
function resetToTypeDefault(field: 'operating_mode' | 'timeout_seconds') {
  if (!editingSensor.value) return

  if (field === 'operating_mode') {
    editingSensor.value.operating_mode = null
  } else if (field === 'timeout_seconds') {
    editingSensor.value.timeout_seconds = null
  }
}

/**
 * Set override value (when user changes from default)
 */
function setOverrideValue(field: 'operating_mode' | 'timeout_seconds', value: string | number) {
  if (!editingSensor.value) return

  if (field === 'operating_mode') {
    editingSensor.value.operating_mode = value as string
  } else if (field === 'timeout_seconds') {
    editingSensor.value.timeout_seconds = value as number
  }
}

/**
 * Set cron expression from preset or custom input
 */
function setCronExpression(expression: string) {
  if (!editingSensor.value) return
  editingSensor.value.schedule_config = expression
    ? { type: 'cron', expression }
    : null
}

/**
 * Save sensor configuration
 */
async function saveEditSensor() {
  if (!editingSensor.value) return

  isEditSaving.value = true
  editError.value = null

  try {
    // Prepare schedule_config for API
    const scheduleConfig = editingSensor.value.operating_mode === 'scheduled' && editingSensor.value.schedule_config
      ? editingSensor.value.schedule_config
      : undefined

    const gpio = editingSensor.value.gpio
    const sensorLabel = getSensorLabel(editingSensor.value.sensor_type)

    await espStore.updateSensorConfig(espId.value, gpio, {
      name: editingSensor.value.name,
      operating_mode: editingSensor.value.operating_mode,
      timeout_seconds: editingSensor.value.timeout_seconds,
      schedule_config: scheduleConfig,
    })

    console.log(`[ESPOrbitalLayout] Sensor GPIO ${gpio} aktualisiert`)

    // Success Toast (Phase 5)
    toast.success(`Sensor "${sensorLabel}" (GPIO ${gpio}) aktualisiert`)

    showEditSensorModal.value = false
    editingSensor.value = null

    // Refresh ESP data
    await espStore.fetchAll()
  } catch (err: any) {
    console.error('[ESPOrbitalLayout] Failed to update sensor:', err)
    editError.value = err.message || 'Fehler beim Speichern der Sensor-Konfiguration'
  } finally {
    isEditSaving.value = false
  }
}

/**
 * Cancel edit
 */
function cancelEditSensor() {
  showEditSensorModal.value = false
  editingSensor.value = null
  editError.value = null
  measureSuccess.value = null
  isEditSaving.value = false
  isMeasuring.value = false
}

/**
 * Trigger immediate measurement for on-demand sensors
 */
async function triggerMeasureNow() {
  if (!editingSensor.value) return

  isMeasuring.value = true
  editError.value = null
  measureSuccess.value = null

  try {
    const result = await sensorsApi.triggerMeasurement(espId.value, editingSensor.value.gpio)
    measureSuccess.value = `Messung angefordert (ID: ${result.request_id.slice(0, 8)}...)`
    console.log('[ESPOrbitalLayout] Measurement triggered:', result)

    // Auto-clear success message after 5 seconds
    setTimeout(() => {
      measureSuccess.value = null
    }, 5000)

    // Refresh to get new data after a short delay
    setTimeout(async () => {
      await espStore.fetchAll()
    }, 2000)
  } catch (err: any) {
    console.error('[ESPOrbitalLayout] Failed to trigger measurement:', err)
    editError.value = err.message || 'Fehler bei der Messungsanforderung'
  } finally {
    isMeasuring.value = false
  }
}

/**
 * Remove sensor from ESP (only for Mock ESPs)
 * Closes the edit modal and deletes the sensor via API
 */
async function removeSensor() {
  if (!editingSensor.value) return
  if (!isMock.value) {
    toast.error('Sensor löschen ist nur für Mock ESPs verfügbar')
    return
  }

  const gpio = editingSensor.value.gpio
  const sensorLabel = getSensorLabel(editingSensor.value.sensor_type)

  // Confirmation dialog
  if (!confirm(`Sensor "${sensorLabel}" an GPIO ${gpio} wirklich entfernen?`)) {
    return
  }

  isEditSaving.value = true
  editError.value = null

  try {
    await espStore.removeSensor(espId.value, gpio)
    console.log(`[ESPOrbitalLayout] Sensor GPIO ${gpio} entfernt`)
    toast.success(`Sensor "${sensorLabel}" (GPIO ${gpio}) entfernt`)

    // Close modal
    showEditSensorModal.value = false
    editingSensor.value = null

    // Refresh ESP data
    await espStore.fetchAll()
  } catch (err: any) {
    console.error('[ESPOrbitalLayout] Failed to remove sensor:', err)
    editError.value = err.message || 'Fehler beim Entfernen des Sensors'
  } finally {
    isEditSaving.value = false
  }
}

// =============================================================================
// Refs
// =============================================================================
const containerRef = ref<HTMLElement | null>(null)
const centerRef = ref<HTMLElement | null>(null)

// Selected satellite state
const selectedGpio = ref<number | null>(null)
const selectedType = ref<'sensor' | 'actuator' | null>(null)

// =============================================================================
// Computed: Device Data
// =============================================================================
const sensors = computed<MockSensor[]>(() => {
  return (props.device?.sensors as MockSensor[]) || []
})

const actuators = computed<MockActuator[]>(() => {
  return (props.device?.actuators as MockActuator[]) || []
})

const espId = computed(() => {
  return props.device?.esp_id || props.device?.device_id || ''
})

const isMock = computed(() => {
  return espApi.isMockEsp(espId.value)
})

// GPIO Status für dynamische GPIO-Auswahl (Phase 5)
const { availableGpios: dynamicAvailableGpios } = useGpioStatus(espId)

const isOnline = computed(() => {
  return props.device?.status === 'online' || props.device?.connected === true
})

const systemState = computed(() => {
  if (isMock.value && 'system_state' in props.device) {
    return (props.device as any).system_state
  }
  return props.device?.status || 'unknown'
})

const stateInfo = computed(() => {
  if (isMock.value) {
    return getStateInfo(systemState.value)
  }
  const status = props.device?.status || 'unknown'
  if (status === 'online') return { label: 'Online', variant: 'success' }
  if (status === 'offline') return { label: 'Offline', variant: 'gray' }
  if (status === 'error') return { label: 'Error', variant: 'danger' }
  return { label: 'Unknown', variant: 'gray' }
})

const totalItems = computed(() => {
  return sensors.value.length + actuators.value.length
})

/**
 * Determine if sensors should use multi-row layout.
 * - ≤5 sensors: single row (horizontal)
 * - >5 sensors: 2-column grid (wraps into multiple rows)
 */
const sensorsUseMultiRow = computed(() => {
  return sensors.value.length > 5
})

/**
 * Connection quality based on WiFi RSSI
 * @deprecated - Use wifiInfo.quality instead (provides more detailed levels)
 */
// const connectionQuality = computed(() => {
//   if (!isOnline.value) return 'poor'
//   const rssi = props.device?.wifi_rssi
//   if (rssi === undefined || rssi === null) return 'fair'
//   if (rssi > -60) return 'good'
//   if (rssi >= -75) return 'fair'
//   return 'poor'
// })
//
// const connectionTooltip = computed(() => {
//   if (!isOnline.value) return 'Keine Verbindung'
//   switch (connectionQuality.value) {
//     case 'good': return 'Verbindung: Stabil'
//     case 'fair': return 'Verbindung: Schwach'
//     case 'poor': return 'Verbindung: Kritisch'
//     default: return 'Verbindung: Unbekannt'
//   }
// })

// =============================================================================
// WiFi Signal Strength (Phase 1)
// =============================================================================

/** WiFi strength info from RSSI value */
const wifiInfo = computed<WifiStrengthInfo>(() => getWifiStrength(props.device?.wifi_rssi))

/** WiFi color class based on signal quality */
const wifiColorClass = computed(() => {
  switch (wifiInfo.value.quality) {
    case 'excellent':
    case 'good':
      return 'text-emerald-400'
    case 'fair':
      return 'text-yellow-400'
    case 'poor':
      return 'text-orange-400'
    case 'none':
      return 'text-red-400'
    default:
      return 'text-slate-500'
  }
})

/** WiFi tooltip with technical dBm value for experts */
const wifiTooltip = computed(() => {
  if (props.device?.wifi_rssi === undefined || props.device?.wifi_rssi === null) {
    return 'WiFi-Signalstärke: Keine Daten verfügbar'
  }
  const simNote = isMock.value ? ' (simuliert)' : ''
  return `WiFi: ${props.device.wifi_rssi} dBm${simNote}`
})

// =============================================================================
// Heartbeat Indicator (Phase 1)
// =============================================================================

/** Loading state for heartbeat button */
const heartbeatLoading = ref(false)

/**
 * Check if heartbeat is "fresh" (< 30 seconds ago)
 * Used for pulse animation on heartbeat icon
 */
const isHeartbeatFresh = computed(() => {
  const timestamp = props.device?.last_heartbeat || props.device?.last_seen
  if (!timestamp) return false

  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  return diffSec >= 0 && diffSec < 30
})

/**
 * Heartbeat tooltip based on device type
 */
const heartbeatTooltip = computed(() => {
  const timestamp = props.device?.last_heartbeat || props.device?.last_seen
  const relativeTime = timestamp ? formatRelativeTime(timestamp) : 'Nie'

  if (isMock.value) {
    return `Letzter Heartbeat: ${relativeTime}\nKlicken zum manuellen Senden`
  }
  return `Letzter Heartbeat: ${relativeTime}\n(Real ESPs senden automatisch)`
})

/**
 * Heartbeat click handler
 * - Mock ESP: Emits heartbeat event
 * - Real ESP: Shows info tooltip (no action)
 */
async function handleHeartbeatClick() {
  if (!isMock.value) {
    // Real ESPs can't trigger heartbeat manually - tooltip explains this
    return
  }

  heartbeatLoading.value = true
  emit('heartbeat', props.device)

  // Reset loading after a short delay (actual response comes via WebSocket)
  setTimeout(() => {
    heartbeatLoading.value = false
  }, 1500)
}

/**
 * Settings click handler - opens settings popover
 */
function handleSettingsClick() {
  emit('settings', props.device)
}

// =============================================================================
// Name Editing (Phase 3)
// =============================================================================

const isEditingName = ref(false)
const editedName = ref('')
const isSavingName = ref(false)
const saveError = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

/** Display name or fallback */
const displayName = computed(() => props.device?.name || null)

/**
 * Start inline editing of the device name
 */
function startEditName() {
  editedName.value = props.device?.name || ''
  isEditingName.value = true
  saveError.value = ''
  // Focus the input after DOM update
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

/**
 * Cancel name editing, reset to original value
 */
function cancelEditName() {
  isEditingName.value = false
  editedName.value = ''
  saveError.value = ''
}

/**
 * Save the new name via API
 */
async function saveName() {
  if (isSavingName.value) return

  const newName = editedName.value.trim() || null
  const deviceId = espId.value

  // No change? Just close
  if (newName === (props.device?.name || null)) {
    cancelEditName()
    return
  }

  isSavingName.value = true
  saveError.value = ''

  try {
    await espStore.updateDevice(deviceId, { name: newName || undefined })
    isEditingName.value = false
    emit('name-updated', { deviceId, name: newName })
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    saveError.value = axiosError.response?.data?.detail || 'Fehler beim Speichern'
    // Keep edit mode open on error
    setTimeout(() => {
      saveError.value = ''
    }, 3000)
  } finally {
    isSavingName.value = false
  }
}

/**
 * Handle keyboard events in name input
 */
function handleNameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveName()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditName()
  }
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleSensorClick(gpio: number) {
  // Phase 2F: Öffne Edit-Modal statt nur Selektion zu toggeln
  openEditSensorModal(gpio)
  // Auch Event emittieren für externe Handler
  emit('sensorClick', gpio)
}

function handleActuatorClick(gpio: number) {
  if (selectedGpio.value === gpio && selectedType.value === 'actuator') {
    selectedGpio.value = null
    selectedType.value = null
  } else {
    selectedGpio.value = gpio
    selectedType.value = 'actuator'
  }
  emit('actuatorClick', gpio)
}

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  // Component mounted - no special initialization needed for horizontal layout
})

onUnmounted(() => {
  // Cleanup handled by Vue reactivity
})

// =============================================================================
// Auto-Opening Chart when Sensor is Dragged
// =============================================================================

/**
 * Check if a sensor from THIS ESP is being dragged.
 * Used to immediately activate drop target (before visual opening).
 */
const isSensorFromThisEspDragging = computed(() =>
  dragStore.isDraggingSensor && dragStore.draggingSensorEspId === espId.value
)

/**
 * Watch for sensor drag state changes.
 * Auto-opens the chart IMMEDIATELY when a sensor from THIS ESP is being dragged.
 *
 * WICHTIG: Die DropZone wird während des Drags als OVERLAY angezeigt (position: absolute),
 * damit das Layout stabil bleibt und das Drag-Event nicht unterbrochen wird.
 * Nach dem Drop wechselt sie in den normalen Inline-Modus.
 */
watch(
  () => isSensorFromThisEspDragging.value,
  (isDraggingFromThisEsp) => {
    log('isSensorFromThisEspDragging changed', {
      isDraggingFromThisEsp,
      analysisExpanded: analysisExpanded.value,
      wasAutoOpened: wasAutoOpened.value,
    })

    if (isDraggingFromThisEsp) {
      // Sofort öffnen - kein Delay, da wir Overlay-Modus verwenden
      // Overlay verhindert Layout-Shifts die Drag unterbrechen könnten
      if (!analysisExpanded.value) {
        wasAutoOpened.value = true // ZUERST setzen - aktiviert Overlay-Modus
        analysisExpanded.value = true
        log('Auto-opening chart (overlay mode)')
      }
    } else {
      // Nach Drag-Ende: Overlay-Modus beenden, Chart bleibt aber offen
      // Kurze Verzögerung damit Drop-Event verarbeitet werden kann
      if (wasAutoOpened.value) {
        log('Drag ended, transitioning from overlay to inline mode')
        setTimeout(() => {
          wasAutoOpened.value = false
          log('wasAutoOpened = false (inline mode now)')
          // Chart bleibt geöffnet im normalen Inline-Modus
        }, 300)
      }
    }
  }
)

// Wenn User manuell schließt, auch wasAutoOpened zurücksetzen
watch(
  () => analysisExpanded.value,
  (expanded) => {
    if (!expanded) {
      wasAutoOpened.value = false
    }
  }
)
</script>

<template>
  <div
    ref="containerRef"
    class="esp-horizontal-layout"
    :class="{
      'esp-horizontal-layout--has-items': totalItems > 0,
      'esp-horizontal-layout--can-drop': dragStore.isDraggingSensorType || dragStore.isDraggingActuatorType,
      'esp-horizontal-layout--drag-over': isDragOver
    }"
    :data-esp-id="espId"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Left Column: Sensors (only shown if sensors exist) -->
    <div
      v-if="sensors.length > 0"
      class="esp-horizontal-layout__column esp-horizontal-layout__column--sensors"
      :class="{ 'esp-horizontal-layout__column--multi-row': sensorsUseMultiRow }"
    >
      <SensorSatellite
        v-for="sensor in sensors"
        :key="`sensor-${sensor.gpio}`"
        :esp-id="espId"
        :gpio="sensor.gpio"
        :sensor-type="sensor.sensor_type"
        :name="sensor.name"
        :value="sensor.processed_value ?? sensor.raw_value"
        :quality="sensor.quality as QualityLevel"
        :unit="sensor.unit"
        :device-type="sensor.device_type"
        :multi-values="sensor.multi_values"
        :is-multi-value="sensor.is_multi_value"
        :selected="selectedGpio === sensor.gpio && selectedType === 'sensor'"
        :show-connections="showConnections"
        class="esp-horizontal-layout__satellite"
        @click="handleSensorClick(sensor.gpio)"
      />
    </div>

    <!-- Center Column: ESP Card -->
    <div ref="centerRef" class="esp-horizontal-layout__center">
      <!-- Compact Mode: Simple Info Card -->
      <div
        v-if="compactMode"
        :class="['esp-info-compact', isMock ? 'esp-info-compact--mock' : 'esp-info-compact--real']"
      >
        <!-- Header is the drag handle for VueDraggable (esp-drag-handle class) -->
        <div class="esp-info-compact__header esp-drag-handle">
          <!-- Top Row: Name + Settings -->
          <div class="esp-info-compact__top-row">
            <!-- Name Editing (Phase 3) - Edit Mode -->
            <template v-if="isEditingName">
              <div class="esp-info-compact__name-edit" data-no-drag>
                <input
                  ref="nameInputRef"
                  v-model="editedName"
                  type="text"
                  class="esp-info-compact__name-input"
                  placeholder="Gerätename..."
                  :disabled="isSavingName"
                  @keydown="handleNameKeydown"
                  @blur="saveName"
                  @click.stop
                />
                <div class="esp-info-compact__name-actions">
                  <button
                    v-if="isSavingName"
                    class="esp-info-compact__name-btn"
                    disabled
                  >
                    <Loader2 class="w-3 h-3 animate-spin" />
                  </button>
                  <template v-else>
                    <button
                      class="esp-info-compact__name-btn esp-info-compact__name-btn--save"
                      title="Speichern (Enter)"
                      @mousedown.prevent="saveName"
                    >
                      <Check class="w-3 h-3" />
                    </button>
                    <button
                      class="esp-info-compact__name-btn esp-info-compact__name-btn--cancel"
                      title="Abbrechen (Escape)"
                      @mousedown.prevent="cancelEditName"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </template>
                </div>
              </div>
            </template>

            <!-- Name Display Mode (double-click to edit) -->
            <template v-else>
              <div
                class="esp-info-compact__name-display"
                title="Doppelklick zum Bearbeiten"
                @dblclick.stop="startEditName"
              >
                <h3 :class="['esp-info-compact__title', { 'esp-info-compact__title--empty': !displayName }]">
                  {{ displayName || 'Unbenannt' }}
                </h3>
                <Pencil class="esp-info-compact__name-pencil w-3 h-3" />
              </div>
            </template>

            <!-- Settings Icon - always top right -->
            <button
              class="esp-info-compact__settings-btn"
              title="Einstellungen"
              @click.stop="handleSettingsClick"
            >
              <Settings2 class="w-4 h-4" />
            </button>
          </div>

          <!-- Name Edit Error Message -->
          <span v-if="saveError" class="esp-info-compact__name-error">{{ saveError }}</span>

          <!-- Info Row: Type Badge, ESP-ID, Status, WiFi -->
          <div class="esp-info-compact__info-row">
            <Badge :variant="isMock ? 'mock' : 'real'" size="xs">
              {{ isMock ? 'Simuliert' : 'Hardware' }}
            </Badge>
            <span class="esp-info-compact__id">{{ espId }}</span>
            <Badge
              :variant="stateInfo.variant as any"
              :pulse="isOnline && (systemState === 'OPERATIONAL' || device.status === 'online')"
              dot
              size="xs"
            >
              {{ stateInfo.label }}
            </Badge>
            <!-- WiFi Signal Bars -->
            <div class="esp-info-compact__wifi" :title="wifiTooltip">
              <div :class="['esp-info-compact__wifi-bars', wifiColorClass]">
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 1 }]" />
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 2 }]" />
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 3 }]" />
                <span :class="['esp-info-compact__wifi-bar', { active: wifiInfo.bars >= 4 }]" />
              </div>
              <span :class="['esp-info-compact__wifi-label', wifiColorClass]">{{ wifiInfo.label }}</span>
            </div>
          </div>

          <!-- Heartbeat Row -->
          <button
            :class="[
              'esp-info-compact__heartbeat',
              { 'esp-info-compact__heartbeat--fresh': isHeartbeatFresh },
              { 'esp-info-compact__heartbeat--mock': isMock }
            ]"
            :title="heartbeatTooltip"
            :disabled="heartbeatLoading"
            @click.stop="handleHeartbeatClick"
          >
            <Heart
              :class="[
                'w-3 h-3',
                isHeartbeatFresh ? 'esp-info-compact__heart-pulse' : ''
              ]"
            />
            <span class="esp-info-compact__heartbeat-text">
              {{ formatRelativeTime(device.last_heartbeat || device.last_seen || '') }}
            </span>
            <Loader2 v-if="heartbeatLoading" class="w-3 h-3 animate-spin" />
          </button>
        </div>

        <!--
          Analysis Drop Zone - Öffnet sich automatisch bei Sensor-Drag.
          IMMER im DOM (kein v-if!), nur mit CSS versteckt/sichtbar.
        -->
        <AnalysisDropZone
          :esp-id="espId"
          :max-sensors="4"
          :compact="true"
          :class="[
            'esp-info-compact__dropzone',
            {
              'esp-info-compact__dropzone--visible': analysisExpanded,
              'esp-info-compact__dropzone--overlay': wasAutoOpened && analysisExpanded
            }
          ]"
          @sensor-added="handleSensorDrop"
        />
      </div>

      <!-- Full Mode: Full ESP Card (for detail view) -->
      <ESPCard v-else :esp="device" />
    </div>

    <!-- Right Column: Actuators (only shown if actuators exist) -->
    <div v-if="actuators.length > 0" class="esp-horizontal-layout__column esp-horizontal-layout__column--actuators">
      <ActuatorSatellite
        v-for="actuator in actuators"
        :key="`actuator-${actuator.gpio}`"
        :esp-id="espId"
        :gpio="actuator.gpio"
        :actuator-type="actuator.actuator_type"
        :name="actuator.name"
        :state="actuator.state"
        :pwm-value="actuator.pwm_value"
        :emergency-stopped="actuator.emergency_stopped"
        :selected="selectedGpio === actuator.gpio && selectedType === 'actuator'"
        :show-connections="showConnections"
        class="esp-horizontal-layout__satellite"
        @click="handleActuatorClick(actuator.gpio)"
      />
    </div>

    <!-- Drop Indicator Overlay (Phase 2B: für alle ESPs) -->
    <Transition name="fade">
      <div v-if="isDragOver" class="esp-horizontal-layout__drop-indicator">
        <span class="esp-horizontal-layout__drop-text">Sensor hinzufügen</span>
      </div>
    </Transition>
  </div>

  <!-- Add Sensor Modal (Teleport to body) - Phase 2B: für alle ESPs -->
  <Teleport to="body">
    <div v-if="showAddSensorModal" class="modal-overlay" @click.self="showAddSensorModal = false">
      <div class="modal-content">
        <!-- Modal Header -->
        <div class="modal-header">
          <h3 class="modal-title">Sensor hinzufügen</h3>
          <button class="modal-close" @click="showAddSensorModal = false">
            <X :size="20" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <!-- Sensor Type Selection -->
          <div class="form-group">
            <label class="form-label">Sensor-Typ</label>
            <select v-model="newSensor.sensor_type" class="form-select">
              <option
                v-for="option in sensorTypeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <!-- ================================================================== -->
          <!-- ONEWIRE SCAN SECTION (Phase 6 - DS18B20)                           -->
          <!-- Nur sichtbar wenn DS18B20 ausgewählt ist                           -->
          <!-- ================================================================== -->
          <div v-if="isOneWireSensor" class="onewire-scan-section">
            <!-- Scan Header -->
            <div class="onewire-scan-header">
              <h4 class="onewire-scan-title">
                <Thermometer :size="16" class="text-blue-400" />
                OneWire-Bus scannen
              </h4>
              <div class="onewire-scan-controls">
                <!-- GPIO Pin Selection -->
                <select v-model="oneWireScanPin" class="form-select form-select--sm">
                  <option :value="4">GPIO 4</option>
                  <option :value="5">GPIO 5</option>
                  <option :value="13">GPIO 13</option>
                  <option :value="14">GPIO 14</option>
                  <option :value="15">GPIO 15</option>
                  <option :value="16">GPIO 16</option>
                  <option :value="17">GPIO 17</option>
                  <option :value="18">GPIO 18</option>
                  <option :value="19">GPIO 19</option>
                  <option :value="21">GPIO 21</option>
                  <option :value="22">GPIO 22</option>
                  <option :value="23">GPIO 23</option>
                  <option :value="25">GPIO 25</option>
                  <option :value="26">GPIO 26</option>
                  <option :value="27">GPIO 27</option>
                  <option :value="32">GPIO 32</option>
                  <option :value="33">GPIO 33</option>
                </select>
                
                <!-- Scan Button -->
                <button
                  type="button"
                  class="btn btn--scan"
                  :disabled="oneWireScanState.isScanning"
                  @click="handleOneWireScan"
                >
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
                  <span v-if="newOneWireDeviceCount < oneWireScanState.scanResults.length" class="text-gray-400">
                    ({{ newOneWireDeviceCount }} neu)
                  </span>
                </span>
                <!-- Only show select-all button if there are new devices -->
                <button
                  v-if="newOneWireDeviceCount > 0"
                  type="button"
                  class="btn btn--ghost btn--xs"
                  @click="toggleAllOneWireDevices"
                >
                  <CheckSquare v-if="allOneWireDevicesSelected" :size="14" />
                  <Square v-else :size="14" />
                  {{ allOneWireDevicesSelected ? 'Alle abwählen' : 'Alle auswählen' }}
                </button>
              </div>
              
              <!-- Device List -->
              <div class="onewire-device-list">
                <label
                  v-for="device in oneWireScanState.scanResults"
                  :key="device.rom_code"
                  class="onewire-device-item"
                  :class="{
                    'onewire-device-item--selected': oneWireScanState.selectedRomCodes.includes(device.rom_code) && !device.already_configured,
                    'onewire-device-item--configured': device.already_configured
                  }"
                >
                  <input
                    type="checkbox"
                    :checked="oneWireScanState.selectedRomCodes.includes(device.rom_code)"
                    :disabled="device.already_configured"
                    @change="toggleOneWireDevice(device.rom_code)"
                  />
                  
                  <div class="onewire-device-info">
                    <code 
                      class="onewire-rom-code" 
                      :class="{ 'text-gray-500': device.already_configured }"
                      :title="formatRomCode(device.rom_code)"
                    >
                      {{ shortenRomCode(device.rom_code) }}
                    </code>
                    <!-- Status Badge: Neu vs Konfiguriert -->
                    <Badge 
                      v-if="device.already_configured" 
                      variant="secondary" 
                      size="xs"
                      :title="`Bereits konfiguriert als: ${device.sensor_name || 'Unbenannt'}`"
                    >
                      <Check :size="10" class="mr-0.5" />
                      {{ device.sensor_name || 'Konfiguriert' }}
                    </Badge>
                    <Badge v-else variant="success" size="xs">
                      Neu
                    </Badge>
                  </div>
                  
                  <Thermometer 
                    :size="16" 
                    :class="device.already_configured ? 'text-gray-500' : 'text-blue-400'" 
                  />
                </label>
              </div>
              
              <!-- Bulk Add Button (only show if new devices are selected) -->
              <button
                v-if="selectedNewDeviceCount > 0"
                type="button"
                class="btn btn--primary w-full onewire-bulk-add-btn"
                @click="addMultipleOneWireSensors"
              >
                <Plus :size="16" />
                {{ selectedNewDeviceCount }} {{ selectedNewDeviceCount === 1 ? 'neuen Sensor' : 'neue Sensoren' }} hinzufügen
              </button>
              
              <!-- All configured message -->
              <div 
                v-else-if="newOneWireDeviceCount === 0" 
                class="onewire-all-configured"
              >
                <Check :size="16" class="text-green-400" />
                <span>Alle gefundenen Geräte sind bereits konfiguriert</span>
              </div>
            </div>
            
            <!-- Scan Error -->
            <div v-else-if="oneWireScanState.scanError" class="onewire-scan-error">
              <AlertCircle :size="16" />
              <span>{{ oneWireScanState.scanError }}</span>
            </div>
            
            <!-- Empty State: Nach Scan, aber 0 Geräte gefunden -->
            <div 
              v-else-if="!oneWireScanState.isScanning && oneWireScanState.lastScanTimestamp && oneWireScanState.scanResults.length === 0" 
              class="onewire-scan-empty onewire-scan-empty--no-devices"
            >
              <AlertCircle :size="20" class="text-yellow-400" />
              <div class="onewire-scan-empty-content">
                <p class="onewire-scan-empty-title">Keine OneWire-Geräte gefunden</p>
                <p class="onewire-scan-empty-hint">
                  • Überprüfe die Verkabelung (Datenleitung an GPIO {{ oneWireScanPin }})<br>
                  • Stelle sicher, dass ein 4.7kΩ Pull-up-Widerstand installiert ist<br>
                  • Versuche einen anderen GPIO-Pin
                </p>
              </div>
            </div>
            
            <!-- Initial State: Noch nicht gescannt -->
            <div v-else-if="!oneWireScanState.isScanning" class="onewire-scan-empty">
              <Info :size="16" />
              <span>Klicke "Bus scannen" um OneWire-Geräte auf GPIO {{ oneWireScanPin }} zu finden</span>
            </div>
            
            <!-- Scanning Indicator -->
            <div v-else class="onewire-scan-loading">
              <Loader2 class="animate-spin" :size="24" />
              <span>Scanne OneWire-Bus auf GPIO {{ oneWireScanPin }}...</span>
            </div>
          </div>

          <!-- GPIO Selection (NUR für Nicht-OneWire Sensoren!) -->
          <!-- DS18B20 nutzt den GPIO aus dem OneWire-Scan-Pin-Selector -->
          <div v-if="!isOneWireSensor" class="form-group">
            <label class="form-label">GPIO</label>
            <GpioPicker
              v-model="newSensor.gpio"
              :esp-id="espId"
              :sensor-type="newSensor.sensor_type"
              variant="dropdown"
              @validation-change="onSensorGpioValidation"
            />
          </div>

          <!-- ================================================================== -->
          <!-- OPERATING MODE SECTION (Phase 2B)                                  -->
          <!-- ================================================================== -->
          <div class="form-group">
            <label class="form-label">
              Betriebsmodus
              <span
                v-if="recommendedMode"
                class="text-xs text-gray-400 ml-2"
                :title="`Empfohlen für ${newSensor.sensor_type}`"
              >
                (Empfohlen: {{ recommendedMode === 'on_demand' ? 'Auf Abruf' : 'Kontinuierlich' }})
              </span>
            </label>
            <select
              v-model="newSensor.operating_mode"
              class="form-select"
            >
              <option value="continuous">Kontinuierlich</option>
              <option value="on_demand" :disabled="!supportsOnDemand">
                Auf Abruf {{ !supportsOnDemand ? '(nicht unterstützt)' : '' }}
              </option>
              <option value="scheduled">Geplant</option>
              <option value="paused">Pausiert</option>
            </select>
          </div>

          <!-- Timeout (nur bei continuous) -->
          <div
            v-if="newSensor.operating_mode === 'continuous'"
            class="form-group"
          >
            <label class="form-label">
              Timeout (Sekunden)
              <span class="text-xs text-gray-400 ml-2">
                (0 = kein Timeout)
              </span>
            </label>
            <input
              v-model.number="newSensor.timeout_seconds"
              type="number"
              min="0"
              max="86400"
              class="form-input"
              placeholder="180"
            />
          </div>
          <!-- ================================================================== -->
          <!-- END OPERATING MODE SECTION                                         -->
          <!-- ================================================================== -->

          <!-- Name -->
          <div class="form-group">
            <label class="form-label">Name (optional)</label>
            <input
              v-model="newSensor.name"
              type="text"
              class="form-input"
              placeholder="z.B. Wassertemperatur"
            />
          </div>

          <!-- Subzone -->
          <div class="form-group">
            <label class="form-label">Subzone (optional)</label>
            <input
              v-model="newSensor.subzone_id"
              type="text"
              class="form-input"
              placeholder="z.B. gewaechshaus_reihe_1"
            />
          </div>

          <!-- Initial Value + Unit Row -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Startwert</label>
              <input
                v-model.number="newSensor.raw_value"
                type="number"
                step="0.1"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Einheit</label>
              <input
                :value="newSensor.unit"
                type="text"
                class="form-input form-input--readonly"
                readonly
              />
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button class="btn btn--secondary" @click="showAddSensorModal = false">
            Abbrechen
          </button>
          <!-- Single sensor add button (NUR für Nicht-OneWire Sensoren) -->
          <!-- DS18B20 nutzt den Bulk-Add-Button nach OneWire-Scan -->
          <button
            v-if="!isOneWireSensor"
            class="btn btn--primary"
            :disabled="!sensorGpioValid"
            @click="addSensor"
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- =======================================================================
       ADD ACTUATOR MODAL (Phase 7)
       ======================================================================= -->
  <Teleport to="body">
    <div v-if="showAddActuatorModal" class="modal-overlay" @click.self="showAddActuatorModal = false">
      <div class="modal-content">
        <!-- Modal Header -->
        <div class="modal-header">
          <h3 class="modal-title">Aktor hinzufügen</h3>
          <button class="modal-close" @click="showAddActuatorModal = false">
            <X :size="20" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <!-- GPIO -->
          <div class="form-group">
            <label class="form-label">GPIO Pin</label>
            <GpioPicker
              v-model="newActuator.gpio"
              :esp-id="espId"
              component-category="actuator"
              :show-recommendations="true"
              @validation="onActuatorGpioValidation"
            />
          </div>

          <!-- Actuator Type -->
          <div class="form-group">
            <label class="form-label">Aktor-Typ</label>
            <select v-model="newActuator.actuator_type" class="form-select">
              <option v-for="opt in actuatorTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- Name (optional) -->
          <div class="form-group">
            <label class="form-label">Name (optional)</label>
            <input
              v-model="newActuator.name"
              type="text"
              class="form-input"
              placeholder="z.B. Wasserpumpe 1"
              maxlength="100"
            />
          </div>

          <!-- Aux GPIO (only for valves) -->
          <div v-if="supportsAuxGpio(newActuator.actuator_type)" class="form-group">
            <label class="form-label">
              Aux-GPIO (Direction-Pin)
              <span class="form-label-hint">Optional - für H-Bridge Ventile</span>
            </label>
            <GpioPicker
              v-model="actuatorAuxGpio"
              :esp-id="espId"
              component-category="actuator"
              :show-recommendations="true"
              :allow-empty="true"
              empty-value="255"
              empty-label="Nicht verwendet"
              @validation="onActuatorAuxGpioValidation"
            />
          </div>

          <!-- PWM Value (only for PWM actuators) -->
          <div v-if="isPwmActuator(newActuator.actuator_type)" class="form-group">
            <label class="form-label">
              PWM-Wert
              <span class="form-label-hint">{{ Math.round((newActuator.pwm_value || 0) * 100) }}%</span>
            </label>
            <input
              v-model.number="newActuator.pwm_value"
              type="range"
              min="0"
              max="1"
              step="0.01"
              class="form-range"
            />
          </div>

          <!-- Max Runtime (only for pumps) -->
          <div v-if="newActuator.actuator_type === 'pump'" class="form-group">
            <label class="form-label">
              Max. Laufzeit
              <span class="form-label-hint">Sekunden (0 = kein Limit)</span>
            </label>
            <input
              v-model.number="newActuator.max_runtime_seconds"
              type="number"
              min="0"
              max="86400"
              class="form-input"
              placeholder="3600"
            />
          </div>

          <!-- Cooldown (only for pumps) -->
          <div v-if="newActuator.actuator_type === 'pump'" class="form-group">
            <label class="form-label">
              Cooldown
              <span class="form-label-hint">Sekunden zwischen Aktivierungen</span>
            </label>
            <input
              v-model.number="newActuator.cooldown_seconds"
              type="number"
              min="0"
              max="3600"
              class="form-input"
              placeholder="30"
            />
          </div>

          <!-- Inverted Logic (for all except PWM) -->
          <div v-if="supportsInvertedLogic(newActuator.actuator_type)" class="form-group form-group--checkbox">
            <label class="form-checkbox">
              <input
                v-model="newActuator.inverted_logic"
                type="checkbox"
              />
              <span class="form-checkbox-label">Invertierte Logik (LOW = ON)</span>
            </label>
            <p class="form-hint">Für Relais-Module die bei LOW schalten</p>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button class="btn btn--secondary" @click="showAddActuatorModal = false">
            Abbrechen
          </button>
          <button
            class="btn btn--primary"
            :disabled="!actuatorGpioValid || (supportsAuxGpio(newActuator.actuator_type) && !actuatorAuxGpioValid)"
            @click="addActuator"
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- =======================================================================
       EDIT SENSOR MODAL (Phase 2F)
       ======================================================================= -->
  <Teleport to="body">
    <div
      v-if="showEditSensorModal && editingSensor"
      class="modal-overlay"
      @click.self="cancelEditSensor"
    >
      <div class="modal-content">
        <!-- Modal Header -->
        <div class="modal-header modal-header--edit">
          <div>
            <h3 class="modal-title">Sensor bearbeiten</h3>
            <p class="modal-subtitle">
              GPIO {{ editingSensor.gpio }} · {{ getSensorLabel(editingSensor.sensor_type) }}
            </p>
          </div>
          <button class="modal-close" @click="cancelEditSensor">
            <X :size="20" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <!-- Name -->
          <div class="form-group">
            <label class="form-label">Name (optional)</label>
            <input
              v-model="editingSensor.name"
              type="text"
              class="form-input"
              placeholder="z.B. Temperatur Gewächshaus 1"
            />
          </div>

          <!-- Operating Mode -->
          <div class="form-group">
            <div class="form-label-row">
              <label class="form-label">Betriebsmodus</label>
              <button
                v-if="editHasModeOverride"
                class="btn-reset"
                title="Auf Type-Default zurücksetzen"
                @click="resetToTypeDefault('operating_mode')"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Type-Default
              </button>
            </div>

            <select
              :value="editEffectiveMode"
              class="form-select"
              @change="setOverrideValue('operating_mode', ($event.target as HTMLSelectElement).value)"
            >
              <option value="continuous">Kontinuierlich</option>
              <option value="on_demand" :disabled="!editSupportsOnDemand">
                Auf Abruf {{ !editSupportsOnDemand ? '(nicht unterstützt)' : '' }}
              </option>
              <option value="scheduled">Geplant</option>
              <option value="paused">Pausiert</option>
            </select>

            <!-- Type Default Info -->
            <p :class="['form-hint', editHasModeOverride ? 'form-hint--warning' : '']">
              <template v-if="editHasModeOverride">
                ⚠️ Individuell angepasst (Type-Default: {{ editingSensor.typeDefaultMode }})
              </template>
              <template v-else>
                Verwendet Type-Default: {{ editingSensor.typeDefaultMode }}
              </template>
            </p>
          </div>

          <!-- Timeout (nur bei continuous) -->
          <div v-if="editEffectiveMode === 'continuous'" class="form-group">
            <div class="form-label-row">
              <label class="form-label">Timeout (Sekunden)</label>
              <button
                v-if="editHasTimeoutOverride"
                class="btn-reset"
                title="Auf Type-Default zurücksetzen"
                @click="resetToTypeDefault('timeout_seconds')"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Type-Default
              </button>
            </div>

            <input
              :value="editEffectiveTimeout"
              type="number"
              min="0"
              max="86400"
              class="form-input"
              placeholder="180"
              @input="setOverrideValue('timeout_seconds', parseInt(($event.target as HTMLInputElement).value) || 0)"
            />

            <!-- Type Default Info -->
            <p :class="['form-hint', editHasTimeoutOverride ? 'form-hint--warning' : '']">
              <template v-if="editHasTimeoutOverride">
                ⚠️ Individuell angepasst (Type-Default: {{ editingSensor.typeDefaultTimeout }}s)
              </template>
              <template v-else>
                Verwendet Type-Default: {{ editingSensor.typeDefaultTimeout }}s
              </template>
            </p>

            <p class="form-hint">
              0 = Kein Timeout (Warnung deaktiviert)
            </p>
          </div>

          <!-- Info für nicht-continuous Modi -->
          <div v-if="editEffectiveMode !== 'continuous'" class="info-box">
            <template v-if="editEffectiveMode === 'on_demand'">
              <div class="info-box__content">
                <p>ℹ️ <strong>Auf Abruf:</strong> Sensor misst nur bei manueller Anforderung. Kein automatisches Timeout.</p>
                <button
                  class="btn btn--accent btn--sm"
                  :disabled="isMeasuring"
                  @click="triggerMeasureNow"
                >
                  <Loader2 v-if="isMeasuring" class="animate-spin" :size="14" />
                  <span v-else>📏</span>
                  {{ isMeasuring ? 'Messe...' : 'Jetzt messen' }}
                </button>
              </div>
            </template>
            <template v-else-if="editEffectiveMode === 'paused'">
              ℹ️ <strong>Pausiert:</strong> Sensor ist deaktiviert, GPIO bleibt reserviert.
            </template>
            <template v-else-if="editEffectiveMode === 'scheduled'">
              <div class="schedule-config">
                <p class="schedule-config__info">
                  ℹ️ <strong>Geplant:</strong> Messung zu definierten Zeitpunkten (Server-gesteuert).
                </p>

                <!-- Cron Presets -->
                <div class="schedule-config__presets">
                  <label class="form-label">Zeitplan-Vorlagen:</label>
                  <div class="preset-buttons">
                    <button
                      v-for="preset in CRON_PRESETS"
                      :key="preset.value"
                      class="preset-btn"
                      :class="{ 'preset-btn--active': editingSensor?.schedule_config?.expression === preset.value }"
                      :title="preset.description"
                      @click="setCronExpression(preset.value)"
                    >
                      {{ preset.label }}
                    </button>
                  </div>
                </div>

                <!-- Custom Cron Input -->
                <div class="schedule-config__custom">
                  <label class="form-label">Cron-Expression:</label>
                  <input
                    :value="editingSensor?.schedule_config?.expression || ''"
                    type="text"
                    class="form-input form-input--mono"
                    placeholder="z.B. 0 */6 * * * (alle 6 Stunden)"
                    @input="setCronExpression(($event.target as HTMLInputElement).value)"
                  />
                  <p class="form-hint">
                    Format: Minute Stunde Tag Monat Wochentag
                    <br />
                    <code>*</code> = jeder, <code>*/n</code> = alle n, <code>1-5</code> = Bereich
                  </p>
                </div>

                <!-- Current Schedule Display -->
                <div v-if="editingSensor?.schedule_config?.expression" class="schedule-config__current">
                  <span class="schedule-label">Aktuell:</span>
                  <code class="schedule-value">{{ editingSensor.schedule_config.expression }}</code>
                </div>
              </div>
            </template>
          </div>

          <!-- Error Message -->
          <div v-if="editError" class="alert alert--error">
            <span class="alert__icon">⚠️</span>
            <span class="alert__text">{{ editError }}</span>
            <button class="alert__close" @click="editError = null">×</button>
          </div>

          <!-- Success Message -->
          <div v-if="measureSuccess" class="alert alert--success">
            <span class="alert__icon">✅</span>
            <span class="alert__text">{{ measureSuccess }}</span>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer modal-footer--with-delete">
          <!-- Delete Button (nur für Mock ESPs) -->
          <button
            v-if="isMock"
            class="btn btn--danger btn--icon"
            :disabled="isEditSaving"
            title="Sensor entfernen"
            @click="removeSensor"
          >
            <Trash2 :size="16" />
            Entfernen
          </button>

          <!-- Spacer für rechte Ausrichtung der anderen Buttons -->
          <div class="modal-footer__spacer" />

          <button
            class="btn btn--secondary"
            :disabled="isEditSaving"
            @click="cancelEditSensor"
          >
            Abbrechen
          </button>
          <button
            class="btn btn--primary"
            :disabled="isEditSaving"
            @click="saveEditSensor"
          >
            <Loader2 v-if="isEditSaving" class="animate-spin" :size="16" />
            {{ isEditSaving ? 'Speichere...' : 'Speichern' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* =============================================================================
   NEW: Horizontal 3-Column Layout (Sensors | ESP-Card | Actuators)
   Replaces orbital/absolute positioning with side-by-side flexbox
   ============================================================================= */
.esp-horizontal-layout {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: center; /* Center content when columns are hidden */
  gap: 0.5rem; /* Reduced gap for tighter layout */
  padding: 0; /* Removed padding - card provides its own */
  min-height: auto;
  /* Shrink container to fit content */
  width: fit-content;
}

/* =============================================================================
   Left/Right Columns (Sensors & Actuators)
   Dynamic sizing - columns shrink to fit content, no fixed min-width
   ============================================================================= */
.esp-horizontal-layout__column {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  /* Dynamic width based on content - no fixed min-width */
  width: fit-content;
  max-width: 120px;
  flex-shrink: 0;
}

/* Sensors column: Default = single vertical column */
.esp-horizontal-layout__column--sensors {
  /* Vertical column by default (≤5 sensors) */
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  align-items: stretch; /* All same width */
  width: 65px; /* Fixed width for single column */
}

/* Sensors column: Multi-column mode (>5 sensors) = 2 columns side by side */
.esp-horizontal-layout__column--sensors.esp-horizontal-layout__column--multi-row {
  /* Switch to CSS Grid: 2 equal columns */
  display: grid;
  grid-template-columns: repeat(2, 65px);
  gap: 0.375rem;
  width: auto; /* Override single-column width */
}

/* Actuators column: align items to the left (toward center card) */
.esp-horizontal-layout__column--actuators {
  align-items: flex-start;
}

/* Satellite cards in horizontal layout - compact styling */
.esp-horizontal-layout__satellite {
  /* Override any absolute positioning from satellite components */
  position: relative !important;
  transform: none !important;
  left: auto !important;
  top: auto !important;
  /* Fill parent column width */
  width: 100%;
  box-sizing: border-box;
}

/* Empty column placeholder */
.esp-horizontal-layout__empty-column {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  padding: 0.5rem;
  border: 1px dashed var(--glass-border);
  border-radius: 0.375rem;
  opacity: 0.5;
}

.esp-horizontal-layout__empty-label {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  text-align: center;
  white-space: nowrap;
}

/* =============================================================================
   Center Column (ESP Card)
   ============================================================================= */
.esp-horizontal-layout__center {
  flex: 0 1 auto; /* Don't grow, can shrink, auto width */
  min-width: 140px;
  max-width: 240px;
}

/* =============================================================================
   Compact ESP Info Card
   ============================================================================= */
.esp-info-compact {
  position: relative; /* Für absolute Positionierung des Overlay-Dropzone */
  width: 100%;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  outline: none;
  overflow: visible; /* Damit Overlay sichtbar ist */
  user-select: none; /* Verhindert Text-Selection während Drag (blaues Leuchten) */
}

.esp-info-compact:hover {
  border-color: rgba(96, 165, 250, 0.4);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.esp-info-compact:focus-visible {
  outline: 2px solid var(--color-iridescent-1);
  outline-offset: 2px;
}

.esp-info-compact__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

/* =============================================================================
   Mock vs Real Visual Distinction
   ============================================================================= */

.esp-info-compact--mock {
  border-left: 3px solid var(--color-mock, #a78bfa);
  border-color: rgba(167, 139, 250, 0.25);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 0 20px rgba(167, 139, 250, 0.08);
}

.esp-info-compact--mock:hover {
  border-color: rgba(167, 139, 250, 0.4);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.25),
    0 0 25px rgba(167, 139, 250, 0.12);
}

.esp-info-compact--real {
  border-left: 3px solid var(--color-real, #22d3ee);
  border-color: rgba(34, 211, 238, 0.2);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 0 20px rgba(34, 211, 238, 0.06);
}

.esp-info-compact--real:hover {
  border-color: rgba(34, 211, 238, 0.35);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.25),
    0 0 25px rgba(34, 211, 238, 0.1);
}

/* Top Row: Name + Settings (flexbox with space-between) */
.esp-info-compact__top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
}

/* Info Row: Badges, ID, Status, WiFi (compact horizontal) */
.esp-info-compact__info-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.esp-info-compact__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  word-break: break-word;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.esp-info-compact__title--empty {
  color: var(--color-text-muted);
  font-style: italic;
  font-weight: 400;
}

/* =============================================================================
   Name Editing (Phase 3)
   ============================================================================= */

.esp-info-compact__name-display {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  padding: 0.125rem 0.25rem;
  margin: -0.125rem -0.25rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s ease;
}

.esp-info-compact__name-display:hover {
  background-color: var(--glass-bg);
}

.esp-info-compact__name-display:hover .esp-info-compact__name-pencil {
  opacity: 1;
}

.esp-info-compact__name-pencil {
  color: var(--color-text-muted);
  opacity: 0.3;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.esp-info-compact__name-edit {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
}

.esp-info-compact__name-input {
  flex: 1;
  min-width: 0;
  max-width: 120px;
  padding: 0.25rem 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  background-color: transparent;
  border: none;
  border-bottom: 2px solid var(--color-iridescent-1);
  outline: none;
  font-family: inherit;
}

.esp-info-compact__name-input::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}

.esp-info-compact__name-input:disabled {
  opacity: 0.6;
}

.esp-info-compact__name-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.esp-info-compact__name-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 0.25rem;
  background-color: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.esp-info-compact__name-btn:hover:not(:disabled) {
  background-color: var(--glass-bg);
}

.esp-info-compact__name-btn:disabled {
  cursor: not-allowed;
}

.esp-info-compact__name-btn--save:hover:not(:disabled) {
  color: var(--color-success);
  background-color: rgba(34, 197, 94, 0.1);
}

.esp-info-compact__name-btn--cancel:hover:not(:disabled) {
  color: var(--color-error);
  background-color: rgba(239, 68, 68, 0.1);
}

.esp-info-compact__name-error {
  font-size: 0.625rem;
  color: var(--color-error);
  margin-left: 0.25rem;
}

.esp-info-compact__id {
  font-size: 0.5625rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-muted);
  opacity: 0.7;
  letter-spacing: -0.025em;
}

/* Settings Button */
.esp-info-compact__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.esp-info-compact__settings-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
  color: var(--color-text-secondary);
}

.esp-info-compact__settings-btn:active {
  transform: scale(0.95);
}

/* =============================================================================
   WiFi Signal Bars (Phase 1.1)
   ============================================================================= */

.esp-info-compact__wifi {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: help;
}

.esp-info-compact__wifi-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 12px;
}

.esp-info-compact__wifi-bar {
  width: 2px;
  background-color: var(--color-text-muted);
  border-radius: 1px;
  opacity: 0.25;
  transition: opacity 0.2s ease, background-color 0.2s ease;
}

/* Bar heights: increasing from left to right */
.esp-info-compact__wifi-bar:nth-child(1) { height: 3px; }
.esp-info-compact__wifi-bar:nth-child(2) { height: 5px; }
.esp-info-compact__wifi-bar:nth-child(3) { height: 8px; }
.esp-info-compact__wifi-bar:nth-child(4) { height: 11px; }

/* Active bars inherit color from parent and are fully opaque */
.esp-info-compact__wifi-bar.active {
  opacity: 1;
  background-color: currentColor;
}

.esp-info-compact__wifi-label {
  font-size: 0.5625rem;
  font-weight: 500;
  white-space: nowrap;
}

/* WiFi color classes - these are shared with Tailwind classes */
.text-emerald-400 { color: #34d399; }
.text-yellow-400 { color: #facc15; }
.text-orange-400 { color: #fb923c; }
.text-red-400 { color: #f87171; }
.text-slate-500 { color: #64748b; }

/* =============================================================================
   Heartbeat Indicator (Phase 1.2)
   ============================================================================= */

.esp-info-compact__heartbeat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.375rem;
  font-size: 0.5625rem;
  color: var(--color-text-muted);
  background-color: transparent;
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  cursor: default;
  transition: all 0.2s ease;
}

.esp-info-compact__heartbeat--mock {
  cursor: pointer;
}

.esp-info-compact__heartbeat--mock:hover:not(:disabled) {
  background-color: var(--glass-bg);
  border-color: rgba(244, 114, 182, 0.3);
  color: var(--color-text-secondary);
}

.esp-info-compact__heartbeat:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Fresh heartbeat (< 30s) - show success color */
.esp-info-compact__heartbeat--fresh {
  border-color: rgba(74, 222, 128, 0.3);
  color: var(--color-success);
}

.esp-info-compact__heartbeat-text {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Pulse animation for fresh heartbeat */
.esp-info-compact__heart-pulse {
  animation: heart-pulse 1s ease-in-out infinite;
}

@keyframes heart-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.8;
  }
}

/* Connection quality indicator dot (legacy - kept for backwards compatibility) */
.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: help;
  transition: transform 0.2s;
}

.connection-dot:hover {
  transform: scale(1.3);
}

.connection-dot.good {
  background-color: var(--color-success, #22c55e);
  box-shadow: 0 0 6px var(--color-success, #22c55e);
}

.connection-dot.fair {
  background-color: var(--color-warning, #f59e0b);
  box-shadow: 0 0 6px var(--color-warning, #f59e0b);
}

.connection-dot.poor {
  background-color: var(--color-danger, #ef4444);
  box-shadow: 0 0 6px var(--color-danger, #ef4444);
}

/*
 * DropZone ist IMMER im DOM, aber standardmäßig unsichtbar.
 * Zwei Modi:
 * 1. Normal (manuell geöffnet): Inline-Anzeige, beeinflusst Layout
 * 2. Overlay (auto-geöffnet während Drag): Absolute Position, Layout stabil
 *
 * WICHTIG: Wir verwenden opacity + pointer-events statt visibility,
 * weil visibility: hidden ALLE Pointer-Events blockiert, einschließlich
 * dragover und drop - was Drag & Drop unmöglich macht!
 */
.esp-info-compact__dropzone {
  /* Standardmäßig unsichtbar aber im DOM für Drag-Target */
  opacity: 0;
  pointer-events: none; /* Verhindert Klicks auf unsichtbares Element */
  max-height: 0;
  overflow: hidden;
  transition: opacity 0.15s ease, max-height 0.2s ease, pointer-events 0s;
  margin-top: 0;
}

/* Sichtbarer Zustand - normal (manuell geöffnet) */
.esp-info-compact__dropzone--visible {
  opacity: 1;
  pointer-events: auto; /* Events wieder aktivieren */
  max-height: 350px;
  overflow: visible;
  margin-top: 0.375rem;
}

/* Overlay-Modus (auto-geöffnet während Drag) */
.esp-info-compact__dropzone--overlay {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  /* WICHTIG: z-index muss höher sein als .zone-item--drag (9999) */
  z-index: 10000;
  margin-top: 0.25rem;
  max-height: none;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-success);
  border-radius: 0.5rem;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.25),
              0 0 0 4px rgba(16, 185, 129, 0.1);
  /* KEINE Animation mit transform während Drag - das verursacht Hit-Test-Probleme!
     Die Animation würde das Element verschieben während der Cursor darüber ist,
     was zu sofortigem dragleave führt. Nur opacity-Fade verwenden. */
  animation: dropzone-appear 0.1s ease-out;
}

@keyframes dropzone-appear {
  from {
    opacity: 0;
    /* KEIN transform hier! Verursacht Drag-Drop-Probleme */
  }
  to {
    opacity: 1;
  }
}

/* =============================================================================
   Mobile Layout (< 768px): Vertical Stack
   ============================================================================= */
@media (max-width: 767px) {
  .esp-horizontal-layout {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .esp-horizontal-layout__column {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    max-width: none;
    width: 100%;
  }

  .esp-horizontal-layout__column--sensors {
    order: -1; /* Sensors above center */
    align-items: center;
  }

  .esp-horizontal-layout__column--actuators {
    order: 1; /* Actuators below center */
    align-items: center;
  }

  .esp-horizontal-layout__center {
    max-width: 280px;
    order: 0;
  }

  .esp-horizontal-layout__satellite {
    max-width: 140px;
  }
}

/* =============================================================================
   Tablet Layout (768px - 1023px): Same as desktop but tighter
   ============================================================================= */
@media (min-width: 768px) and (max-width: 1023px) {
  .esp-horizontal-layout {
    gap: 0.5rem;
  }

  .esp-horizontal-layout__column {
    max-width: 120px;
  }

  .esp-horizontal-layout__center {
    max-width: 240px;
  }
}

/* =============================================================================
   Desktop Layout (1024px+): Full horizontal with more space
   ============================================================================= */
@media (min-width: 1024px) {
  .esp-horizontal-layout {
    gap: 0.875rem;
  }

  .esp-horizontal-layout__column {
    max-width: 140px;
  }

  .esp-horizontal-layout__center {
    max-width: 300px;
  }

  .esp-horizontal-layout__satellite {
    max-width: 130px;
  }
}

/* =============================================================================
   Drop Zone Styling (for adding sensors via drag from sidebar)
   ============================================================================= */
.esp-horizontal-layout--can-drop {
  border: 2px dashed var(--color-iridescent-2);
  border-radius: 0.75rem;
  transition: all 0.2s ease;
}

.esp-horizontal-layout--drag-over {
  border-color: var(--color-success);
  background: rgba(16, 185, 129, 0.05);
}

.esp-horizontal-layout__drop-indicator {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 0.75rem;
  pointer-events: none;
  z-index: 100;
}

.esp-horizontal-layout__drop-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-success);
  background: var(--color-bg-secondary);
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  border: 2px solid var(--color-success);
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* =============================================================================
   Modal Styling
   ============================================================================= */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  width: 100%;
  max-width: 28rem;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--glass-border);
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--glass-border);
}

.modal-footer--with-delete {
  justify-content: flex-start;
}

.modal-footer__spacer {
  flex: 1;
}

/* Delete Button Styling */
.btn--danger {
  background-color: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn--danger:hover {
  background-color: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.btn--danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--icon {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

/* Form Elements */
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

/* Buttons */
.btn {
  flex: 1;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn--primary {
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-2));
  color: white;
}

.btn--primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
}

.btn--secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border: 1px solid var(--glass-border);
}

.btn--secondary:hover {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* =============================================================================
   EDIT SENSOR MODAL STYLES (Phase 2F)
   ============================================================================= */

.modal-header--edit {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
}

.modal-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}

.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}

.form-label-row .form-label {
  margin-bottom: 0;
}

.btn-reset {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 500;
  color: var(--color-iridescent-1);
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reset:hover {
  background: rgba(167, 139, 250, 0.1);
  color: var(--color-iridescent-2);
}

.btn-reset svg {
  width: 0.75rem;
  height: 0.75rem;
}

.form-hint {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}

.form-hint--warning {
  color: var(--color-warning, #f59e0b);
}

.info-box {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  padding: 0.75rem;
  line-height: 1.5;
}

.info-box strong {
  color: var(--color-text-primary);
}

.info-box__content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-box__content p {
  margin: 0;
}

/* Alert Messages */
.alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  margin-top: 0.75rem;
}

.alert--error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.alert--success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.alert__icon {
  flex-shrink: 0;
}

.alert__text {
  flex: 1;
}

.alert__close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: inherit;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0.7;
  padding: 0;
  line-height: 1;
}

.alert__close:hover {
  opacity: 1;
}

/* Small Button Variant */
.btn--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  gap: 0.375rem;
}

/* Accent Button (for Measure Now) */
.btn--accent {
  background: var(--color-primary, #3b82f6);
  color: white;
  border: none;
}

.btn--accent:hover:not(:disabled) {
  background: var(--color-primary-hover, #2563eb);
}

.btn--accent:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Animation for loading spinner */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Schedule Configuration Styles */
.schedule-config {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.schedule-config__info {
  margin: 0;
}

.schedule-config__presets {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.preset-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.preset-btn--active {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: white;
}

.schedule-config__custom {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-input--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
}

.schedule-config__current {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.375rem;
}

.schedule-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.schedule-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
  color: var(--color-primary, #3b82f6);
  background: var(--color-bg-secondary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

/* Code styling in hints */
.form-hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  background: var(--color-bg-tertiary);
  padding: 0.0625rem 0.25rem;
  border-radius: 0.25rem;
}

/* Utility classes for SVG icons */
.w-3 {
  width: 0.75rem;
}
.h-3 {
  height: 0.75rem;
}

/* =============================================================================
   OneWire Scan Section (Phase 6 - DS18B20 Support)
   ============================================================================= */

.onewire-scan-section {
  margin-top: 1rem;
  padding: 1rem;
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.05) 0%,
    rgba(96, 165, 250, 0.08) 100%
  );
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
  color: var(--color-text-primary, #ffffff);
  margin: 0;
}

.onewire-scan-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.form-select--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  width: auto;
  min-width: 100px;
}

.btn--scan {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(
    135deg,
    #3b82f6 0%,
    #60a5fa 100%
  );
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn--scan:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.4);
}

.btn--scan:disabled {
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
  color: var(--color-text-secondary, #9ca3af);
  font-weight: 500;
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--color-text-secondary, #9ca3af);
}

.btn--ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.25);
  color: var(--color-text-primary, #ffffff);
}

.btn--xs {
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
  background: var(--color-bg-secondary, rgba(30, 33, 42, 0.8));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.onewire-device-item:hover {
  border-color: rgba(96, 165, 250, 0.4);
  background: var(--color-bg-tertiary, rgba(40, 43, 52, 0.9));
}

.onewire-device-item--selected {
  border-color: rgba(96, 165, 250, 0.6);
  background: rgba(96, 165, 250, 0.1);
}

/* OneWire Multi-Device Support: Already configured devices */
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

/* All devices already configured message */
.onewire-all-configured {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 0.375rem;
  color: #34d399;
  font-size: 0.8125rem;
  margin-top: 0.5rem;
}

.onewire-device-item input[type="checkbox"] {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: #60a5fa;
}

.onewire-device-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.onewire-rom-code {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

/* Bulk Add Button */
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
  color: #f87171;
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
  background: var(--color-bg-tertiary, rgba(40, 43, 52, 0.5));
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 0.375rem;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 0.8125rem;
  justify-content: center;
  margin-top: 1rem;
}

/* No Devices Found State (after scan with 0 results) */
.onewire-scan-empty--no-devices {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-style: solid;
  padding: 1rem;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.onewire-scan-empty--no-devices svg {
  color: #fbbf24;
}

.onewire-scan-empty-content {
  text-align: left;
  width: 100%;
}

.onewire-scan-empty-title {
  font-weight: 600;
  color: var(--color-text-primary, #ffffff);
  margin-bottom: 0.5rem;
}

.onewire-scan-empty-hint {
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #9ca3af);
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
  color: var(--color-text-secondary, #9ca3af);
  font-size: 0.875rem;
  margin-top: 1rem;
}

.onewire-scan-loading svg {
  color: #60a5fa;
}

/* Spin animation for Loader2 */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Text color utilities */
.text-blue-400 {
  color: #60a5fa;
}

/* Width utility */
.w-full {
  width: 100%;
}
</style>


