<script setup lang="ts">
/**
 * SensorConfigPanel — Three-Zone Sensor Configuration
 *
 * Zone 1 (Basic, always visible): Name, Unit, Enabled, Subzone
 * Zone 2 (Accordion): Thresholds & Alarms, Operation & Interval, Calibration
 * Zone 3 (Accordion - Expert): Hardware (GPIO/I2C/OneWire), Live Preview
 *
 * Used inside ESPSettingsSheet as SlideOver panel (HardwareView only, Route /hardware).
 */

import { ref, computed, onMounted, watch } from 'vue'
import { Save, RotateCcw, Beaker, Gauge, Settings, Cpu, Trash2, X } from 'lucide-vue-next'
import { sensorsApi } from '@/api/sensors'
import { espApi } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useUiStore } from '@/shared/stores/ui.store'
import { useToast } from '@/composables/useToast'
import { useCalibration } from '@/composables/useCalibration'
import { inferInterfaceType } from '@/utils/sensorDefaults'
import { roundToDecimals } from '@/utils/formatters'
import { SENSOR_TYPE_CONFIG, getSensorUnit } from '@/utils/sensorDefaults'
import { AccordionSection } from '@/shared/design/primitives'
import RangeSlider from '@/shared/design/primitives/RangeSlider.vue'
import LiveDataPreview from './LiveDataPreview.vue'
import AlertConfigSection from '@/components/devices/AlertConfigSection.vue'
import RuntimeMaintenanceSection from '@/components/devices/RuntimeMaintenanceSection.vue'
import DeviceMetadataSection from '@/components/devices/DeviceMetadataSection.vue'
import LinkedRulesSection from '@/components/devices/LinkedRulesSection.vue'
import SubzoneAssignmentSection from '@/components/devices/SubzoneAssignmentSection.vue'
import type { DeviceMetadata } from '@/types/device-metadata'
import { parseDeviceMetadata, mergeDeviceMetadata } from '@/types/device-metadata'
import type { SensorConfigCreate } from '@/types'

interface Props {
  espId: string
  gpio: number
  sensorType: string
  unit?: string
  /** Sensor config UUID from database (required for DELETE on real ESPs) */
  configId?: string
  showMetadata?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  unit: '',
  configId: undefined,
  showMetadata: true,
})

const emit = defineEmits<{
  deleted: []
  saved: []
}>()

const toast = useToast()
const espStore = useEspStore()
const uiStore = useUiStore()
const calibration = useCalibration()

// =============================================================================
// State
// =============================================================================
const loading = ref(true)
const saving = ref(false)
const sensorDbId = ref<string | null>(null)

// Basic fields
const name = ref('')
const description = ref('')
const unitValue = ref('')
const enabled = ref(true)

// Subzone
const subzoneId = ref<string | null>(null)

// Operating mode (Block C: Phase 2B)
const operatingMode = ref<'continuous' | 'on_demand' | 'scheduled' | 'paused'>('continuous')
const timeoutSeconds = ref(0)
// schedule_config (Auftrag 5): nur bei operating_mode=scheduled relevant
const scheduleConfig = ref<{ type: string; expression: string } | null>(null)

/** Cron presets for scheduled mode (matches EditSensorModal) */
const CRON_PRESETS = [
  { label: 'Jede Stunde', value: '0 * * * *', description: 'Zur vollen Stunde' },
  { label: 'Alle 6 Stunden', value: '0 */6 * * *', description: '00:00, 06:00, 12:00, 18:00' },
  { label: 'Täglich um 8:00', value: '0 8 * * *', description: 'Einmal täglich' },
  { label: 'Alle 15 Minuten', value: '*/15 * * * *', description: '00, 15, 30, 45' },
  { label: 'Alle 30 Minuten', value: '*/30 * * * *', description: '00 und 30' },
  { label: 'Wochentags 9:00', value: '0 9 * * 1-5', description: 'Mo-Fr um 9:00' },
]

// Interface-specific
const interfaceType = computed(() => inferInterfaceType(props.sensorType))
const gpioPin = ref(props.gpio)
const i2cAddress = ref('0x44')
const i2cBus = ref(0)
const measureRangeMin = ref(0)
const measureRangeMax = ref(100)
const pulsesPerLiter = ref(450)

// Thresholds
const alarmLow = ref(0)
const warnLow = ref(0)
const warnHigh = ref(100)
const alarmHigh = ref(100)

// Calibration
const currentRawValue = ref(0)

// Device Metadata
const metadata = ref<DeviceMetadata>({})

// =============================================================================
// Computed
// =============================================================================

const sensorConfig = computed(() => SENSOR_TYPE_CONFIG[props.sensorType])
const defaultUnit = computed(() => getSensorUnit(props.sensorType) || props.unit || '')

const isI2C = computed(() => interfaceType.value === 'I2C')
const isOneWire = computed(() => interfaceType.value === 'ONEWIRE')
const isAnalog = computed(() => interfaceType.value === 'ANALOG')
const isDigital = computed(() => props.sensorType.toLowerCase().includes('flow'))

const needsCalibration = computed(() => {
  const t = props.sensorType.toLowerCase()
  return t === 'ph' || t === 'ec' || t === 'moisture' || t === 'soil_moisture'
})

/** ADC1-only pins for analog sensors */
const adc1Pins = [32, 33, 34, 35, 36, 39]

/** I2C address options per sensor type */
const i2cAddressOptions = computed(() => {
  const t = props.sensorType.toLowerCase()
  if (t.includes('sht31')) return [{ value: '0x44', label: '0x44 (Default)' }, { value: '0x45', label: '0x45 (Alt)' }]
  if (t.includes('bmp280') || t.includes('bme280')) return [{ value: '0x76', label: '0x76 (Default)' }, { value: '0x77', label: '0x77 (Alt)' }]
  return [{ value: '0x44', label: '0x44' }, { value: '0x45', label: '0x45' }, { value: '0x76', label: '0x76' }, { value: '0x77', label: '0x77' }]
})

/** Storage key prefix for accordion persistence */
const accordionKey = computed(() => `sensor-${props.espId}-${props.gpio}`)

// =============================================================================
// Load existing config
// =============================================================================
onMounted(async () => {
  const isMock = espApi.isMockEsp(props.espId)

  // Load sensor config from server (Real + Mock — Single Source of Truth).
  // Pass sensorType for multi-value sensors (e.g. SHT31) so backend returns the correct config.
  try {
    const config = await sensorsApi.get(props.espId, props.gpio, props.sensorType)
    if (config) {
      sensorDbId.value = config.id ? String(config.id) : null
      name.value = config.name || ''
      const configExt = config as unknown as Record<string, unknown>
      description.value = (configExt.description as string) || ''
      unitValue.value = (configExt.unit as string) || defaultUnit.value
      enabled.value = config.enabled !== false
      const i2cVal = config.i2c_address
      i2cAddress.value = i2cVal != null ? `0x${Number(i2cVal).toString(16)}` : '0x44'
      i2cBus.value = (configExt.i2c_bus as number) ?? 0

      // Subzone (C1: backend returns subzone_id in GET response)
      subzoneId.value = config.subzone_id ?? null

      // Operating mode (Block C: backend returns operating_mode, timeout_seconds)
      operatingMode.value = (config.operating_mode as 'continuous' | 'on_demand' | 'scheduled' | 'paused') || 'continuous'
      timeoutSeconds.value = config.timeout_seconds ?? 0

      // schedule_config (Auftrag 5: backend returns schedule_config)
      const sc = configExt.schedule_config as { type?: string; expression?: string } | null | undefined
      scheduleConfig.value =
        sc?.expression && sc?.type === 'cron'
          ? { type: 'cron', expression: sc.expression }
          : null

      if (config.threshold_min != null) alarmLow.value = roundToDecimals(config.threshold_min, 2)
      if (config.warning_min != null) warnLow.value = roundToDecimals(config.warning_min, 2)
      if (config.warning_max != null) warnHigh.value = roundToDecimals(config.warning_max, 2)
      if (config.threshold_max != null) alarmHigh.value = roundToDecimals(config.threshold_max, 2)

      metadata.value = parseDeviceMetadata(config.metadata)
    }
  } catch {
    // No config in DB — use defaults or Mock fallback (C2)
    if (isMock) {
      const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
      const sensor = device?.sensors
        ? (device.sensors as any[]).find(
            (s) =>
              s.gpio === props.gpio &&
              (!props.sensorType || s.sensor_type === props.sensorType)
          )
        : null

      if (sensor) {
        name.value = sensor.name ?? ''
        unitValue.value = sensor.unit ?? defaultUnit.value
        subzoneId.value = sensor.subzone_id ?? null
        operatingMode.value = (sensor as any).operating_mode || 'continuous'
        timeoutSeconds.value = (sensor as any).timeout_seconds ?? 0
        const sc = (sensor as any).schedule_config
        scheduleConfig.value =
          sc?.expression && sc?.type === 'cron'
            ? { type: 'cron', expression: sc.expression }
            : null
      } else {
        unitValue.value = defaultUnit.value
      }
    } else {
      unitValue.value = defaultUnit.value
      operatingMode.value = 'continuous'
      timeoutSeconds.value = 0
      scheduleConfig.value = null
    }

    if (sensorConfig.value) {
      const { min, max } = sensorConfig.value
      const range = max - min
      alarmLow.value = roundToDecimals(min, 2)
      warnLow.value = roundToDecimals(min + range * 0.1, 2)
      warnHigh.value = roundToDecimals(max - range * 0.1, 2)
      alarmHigh.value = roundToDecimals(max, 2)
    }
  }
  loading.value = false
})

// Watch live sensor value for calibration
watch(
  () => {
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
    const sensors = (device?.sensors as any[]) || []
    return sensors.find(s => s.gpio === props.gpio)
  },
  (sensor) => {
    if (sensor && typeof sensor.raw_value === 'number') {
      currentRawValue.value = sensor.raw_value
    }
  },
  { immediate: true, deep: true }
)

function setCronExpression(expression: string) {
  scheduleConfig.value = expression.trim()
    ? { type: 'cron', expression: expression.trim() }
    : null
}

// =============================================================================
// Delete
// =============================================================================
const deleting = ref(false)

async function confirmAndDelete() {
  const confirmed = await uiStore.confirm({
    title: 'Sensor entfernen',
    message: 'Der Sensor wird unwiderruflich aus diesem Gerät entfernt. Historische Daten bleiben erhalten.',
    variant: 'danger',
    confirmText: 'Entfernen',
  })
  if (!confirmed) return

  deleting.value = true
  const isMock = espApi.isMockEsp(props.espId)
  try {
    if (isMock) {
      await espStore.removeSensor(props.espId, props.gpio)
    } else if (props.configId) {
      await sensorsApi.delete(props.espId, props.configId)
    } else {
      toast.error('Sensor-Config-ID fehlt — Löschung nicht möglich')
      return
    }
    toast.success('Sensor entfernt')
    emit('deleted')
  } catch {
    toast.error('Sensor konnte nicht entfernt werden')
  } finally {
    deleting.value = false
  }
}

// =============================================================================
// Save
// =============================================================================
async function handleSave() {
  saving.value = true
  try {
    // Block A: Real AND Mock — persist via Backend (Single Source of Truth: subzone_configs)
    const config: Record<string, unknown> = {
      esp_id: props.espId,
      gpio: props.gpio,
      sensor_type: props.sensorType,
      name: name.value || null,
      description: description.value || null,
      unit: unitValue.value || null,
      enabled: enabled.value,
      interface_type: interfaceType.value,
      threshold_min: alarmLow.value,
      threshold_max: alarmHigh.value,
      warning_min: warnLow.value,
      warning_max: warnHigh.value,
      operating_mode: operatingMode.value,
      timeout_seconds: timeoutSeconds.value,
    }

    // schedule_config (Auftrag 5): nur bei scheduled senden
    if (operatingMode.value === 'scheduled' && scheduleConfig.value?.expression) {
      config.schedule_config = { type: 'cron', expression: scheduleConfig.value.expression }
    } else if (operatingMode.value !== 'scheduled') {
      config.schedule_config = null
    }

    if (isI2C.value) {
      const parsed = i2cAddress.value != null
        ? parseInt(String(i2cAddress.value).replace(/^0x/i, ''), 16)
        : null
      config.i2c_address = Number.isNaN(parsed) ? null : parsed
      config.i2c_bus = i2cBus.value
    }

    if (isDigital.value) {
      config.pulses_per_liter = pulsesPerLiter.value
    }

    if (isAnalog.value) {
      config.measure_range_min = measureRangeMin.value
      config.measure_range_max = measureRangeMax.value
    }

    // Block B1: Normalize "Keine Subzone" — never send "__none__" to API
    const rawSubzone = subzoneId.value
    config.subzone_id =
      rawSubzone === '__none__' || rawSubzone == null || rawSubzone === ''
        ? null
        : rawSubzone

    config.metadata = mergeDeviceMetadata(null, metadata.value)

    const calData = calibration.getCalibrationData()
    if (calData) {
      config.calibration = calData
    }

    const result = await sensorsApi.createOrUpdate(props.espId, props.gpio, config as unknown as SensorConfigCreate)
    if (result?.id) {
      sensorDbId.value = String(result.id)
    }
    toast.success('Sensor-Konfiguration gespeichert')
    emit('saved')
  } catch (err) {
    const msg = (err as any)?.response?.data?.detail ?? 'Fehler beim Speichern'
    toast.error(msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="sensor-config" :class="{ 'sensor-config--loading': loading }">
    <div v-if="loading" class="sensor-config__loading">Lade Konfiguration...</div>

    <template v-else>
      <!-- ═══ ZONE 1: BASIC (always visible) ══════════════════════════════ -->
      <section class="sensor-config__section">
        <h3 class="sensor-config__section-title">Grundeinstellungen</h3>

        <div class="sensor-config__field">
          <label class="sensor-config__label">Name</label>
          <input
            v-model="name"
            type="text"
            class="sensor-config__input"
            placeholder="z.B. pH Becken Ost"
          />
        </div>

        <div class="sensor-config__field">
          <label class="sensor-config__label">Beschreibung</label>
          <input
            v-model="description"
            type="text"
            class="sensor-config__input"
            placeholder="Optional"
          />
        </div>

        <div class="sensor-config__row">
          <div class="sensor-config__field sensor-config__field--half">
            <label class="sensor-config__label">Einheit</label>
            <input v-model="unitValue" type="text" class="sensor-config__input" />
          </div>
          <div class="sensor-config__field sensor-config__field--half">
            <label class="sensor-config__label">Sensor-Typ</label>
            <input :value="sensorType" type="text" class="sensor-config__input" disabled />
          </div>
        </div>

        <div class="sensor-config__field sensor-config__field--toggle">
          <label class="sensor-config__label">Aktiv</label>
          <button
            :class="['sensor-config__toggle', { 'sensor-config__toggle--on': enabled }]"
            @click="enabled = !enabled"
          >
            <span class="sensor-config__toggle-dot" />
          </button>
        </div>

        <!-- Subzone assignment (with create-new option) -->
        <div class="sensor-config__field">
          <SubzoneAssignmentSection
            v-model="subzoneId"
            :esp-id="espId"
            :gpio="gpio"
            :zone-id="espStore.devices.find(d => espStore.getDeviceId(d) === espId)?.zone_id ?? null"
          />
        </div>

        <!-- Betriebsmodus (Block C) -->
        <div class="sensor-config__field">
          <label class="sensor-config__label">Betriebsmodus</label>
          <select v-model="operatingMode" class="sensor-config__select">
            <option value="continuous">Dauerbetrieb</option>
            <option value="on_demand">Bei Bedarf</option>
            <option value="scheduled">Zeitgesteuert</option>
            <option value="paused">Pausiert</option>
          </select>
        </div>

        <!-- Stale-Timeout (nur bei Dauerbetrieb) -->
        <div v-if="operatingMode === 'continuous'" class="sensor-config__field">
          <label class="sensor-config__label">Stale-Timeout (Sekunden)</label>
          <input
            v-model.number="timeoutSeconds"
            type="number"
            min="0"
            max="86400"
            class="sensor-config__input"
          />
          <span class="sensor-config__helper">0 = kein Timeout (Stale-Erkennung deaktiviert)</span>
        </div>

        <!-- schedule_config (Auftrag 5: nur bei Zeitgesteuert) -->
        <div v-if="operatingMode === 'scheduled'" class="sensor-config__field sensor-config__schedule">
          <label class="sensor-config__label">Zeitplan (Cron)</label>
          <span class="sensor-config__helper">Server-gesteuerte Messung nach Zeitplan</span>
          <div class="sensor-config__schedule-presets">
            <button
              v-for="preset in CRON_PRESETS"
              :key="preset.value"
              type="button"
              class="sensor-config__preset-btn"
              :class="{ 'sensor-config__preset-btn--active': scheduleConfig?.expression === preset.value }"
              :title="preset.description"
              @click="setCronExpression(preset.value)"
            >
              {{ preset.label }}
            </button>
          </div>
          <input
            :value="scheduleConfig?.expression ?? ''"
            type="text"
            class="sensor-config__input sensor-config__input--mono"
            placeholder="z.B. 0 */6 * * *"
            @input="setCronExpression(($event.target as HTMLInputElement).value)"
          />
          <span class="sensor-config__helper">Format: Minute Stunde Tag Monat Wochentag</span>
        </div>
      </section>

      <!-- ═══ ZONE 2: ADVANCED (Accordion sections) ═══════════════════════ -->

      <!-- Haupt-Schwellen: Basiskonfiguration für den Sensor. Werden an createOrUpdate gesendet.
           Alert-spezifische Overrides: AlertConfigSection (eigener Save PATCH /sensors/{id}/alert-config). -->
      <AccordionSection
        title="Sensor-Schwellwerte (Basis)"
        :storage-key="`${accordionKey}-thresholds`"
        :icon="Gauge"
      >
        <RangeSlider
          :min="sensorConfig?.min ?? 0"
          :max="sensorConfig?.max ?? 100"
          :alarm-low="alarmLow"
          :warn-low="warnLow"
          :warn-high="warnHigh"
          :alarm-high="alarmHigh"
          :unit="unitValue"
          :step="0.1"
          @update:alarm-low="alarmLow = $event"
          @update:warn-low="warnLow = $event"
          @update:warn-high="warnHigh = $event"
          @update:alarm-high="alarmHigh = $event"
        />

        <div class="sensor-config__threshold-inputs">
          <div class="sensor-config__field sensor-config__field--quarter">
            <label class="sensor-config__label sensor-config__label--alarm">Alarm &#8595;</label>
            <input v-model.number="alarmLow" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
          </div>
          <div class="sensor-config__field sensor-config__field--quarter">
            <label class="sensor-config__label sensor-config__label--warn">Warn &#8595;</label>
            <input v-model.number="warnLow" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
          </div>
          <div class="sensor-config__field sensor-config__field--quarter">
            <label class="sensor-config__label sensor-config__label--warn">Warn &#8593;</label>
            <input v-model.number="warnHigh" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
          </div>
          <div class="sensor-config__field sensor-config__field--quarter">
            <label class="sensor-config__label sensor-config__label--alarm">Alarm &#8593;</label>
            <input v-model.number="alarmHigh" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
          </div>
        </div>
      </AccordionSection>

      <!-- Calibration (pH/EC only) -->
      <AccordionSection
        v-if="needsCalibration"
        title="Kalibrierung"
        :storage-key="`${accordionKey}-calibration`"
        :icon="Beaker"
      >
        <!-- Current raw value display -->
        <div class="sensor-config__cal-current">
          <span class="sensor-config__cal-label">Aktueller Rohwert:</span>
          <span class="sensor-config__cal-value">{{ currentRawValue.toFixed(0) }} ADC</span>
        </div>

        <!-- Not started -->
        <template v-if="!calibration.isActive.value">
          <button
            class="sensor-config__cal-start"
            @click="calibration.startCalibration(
              sensorType.toLowerCase() === 'ph' ? 'pH'
              : sensorType.toLowerCase() === 'moisture' || sensorType.toLowerCase() === 'soil_moisture' ? 'moisture'
              : 'EC'
            )"
          >
            <Beaker class="w-4 h-4" />
            Kalibrierung starten
          </button>
        </template>

        <!-- pH Calibration Wizard -->
        <template v-else-if="calibration.calibrationType.value === 'pH'">
          <!-- Step 1: pH 4.0 -->
          <div v-if="calibration.step.value === 'point1'" class="sensor-config__cal-step">
            <h4>Schritt 1: pH 4.0 Pufferloesung</h4>
            <p>Sensor in pH 4.0 Loesung tauchen und warten bis der Wert stabil ist.</p>
            <div class="sensor-config__cal-raw">Rohwert: <strong>{{ currentRawValue.toFixed(0) }}</strong> ADC</div>
            <div class="sensor-config__cal-actions">
              <button class="sensor-config__cal-btn" @click="calibration.setPoint1(currentRawValue, 4.0)">
                Kalibrierungspunkt 1 setzen (pH 4.0)
              </button>
              <button class="sensor-config__cal-btn sensor-config__cal-btn--abort" @click="calibration.resetCalibration()">
                <X class="w-3 h-3" />
                Abbrechen
              </button>
            </div>
          </div>

          <!-- Step 2: pH 7.0 -->
          <div v-else-if="calibration.step.value === 'point2'" class="sensor-config__cal-step">
            <h4>Schritt 2: pH 7.0 Pufferloesung</h4>
            <p>Sensor in pH 7.0 Loesung tauchen und warten bis der Wert stabil ist.</p>
            <div class="sensor-config__cal-raw">
              Punkt 1: {{ calibration.point1.value?.rawValue.toFixed(0) }} ADC &rarr; pH 4.0 &#10003;
            </div>
            <div class="sensor-config__cal-raw">Rohwert: <strong>{{ currentRawValue.toFixed(0) }}</strong> ADC</div>
            <div class="sensor-config__cal-actions">
              <button class="sensor-config__cal-btn" @click="calibration.setPoint2(currentRawValue, 7.0)">
                Kalibrierungspunkt 2 setzen (pH 7.0)
              </button>
              <button class="sensor-config__cal-btn sensor-config__cal-btn--abort" @click="calibration.resetCalibration()">
                <X class="w-3 h-3" />
                Abbrechen
              </button>
            </div>
          </div>

          <!-- Complete -->
          <div v-else-if="calibration.step.value === 'complete'" class="sensor-config__cal-step sensor-config__cal-step--complete">
            <h4>Kalibrierung abgeschlossen &#10003;</h4>
            <div class="sensor-config__cal-result">
              <span>Steigung: {{ calibration.result.value?.slope }}</span>
              <span>Offset: {{ calibration.result.value?.offset }}</span>
            </div>
            <div class="sensor-config__cal-actions">
              <button class="sensor-config__cal-btn sensor-config__cal-btn--save" @click="handleSave">
                Kalibrierung speichern
              </button>
              <button class="sensor-config__cal-btn sensor-config__cal-btn--reset" @click="calibration.resetCalibration()">
                <RotateCcw class="w-3 h-3" />
                Zuruecksetzen
              </button>
            </div>
          </div>
        </template>

        <!-- EC Calibration Wizard -->
        <template v-else-if="calibration.calibrationType.value === 'EC'">
          <!-- Step 1: Dry -->
          <div v-if="calibration.step.value === 'point1'" class="sensor-config__cal-step">
            <h4>Schritt 1: Trockene Elektrode (Luft)</h4>
            <p>Elektrode in der Luft halten (trocken).</p>
            <div class="sensor-config__cal-raw">Rohwert: <strong>{{ currentRawValue.toFixed(0) }}</strong> ADC</div>
            <div class="sensor-config__cal-actions">
              <button class="sensor-config__cal-btn" @click="calibration.setPoint1(currentRawValue, 0)">
                Nullpunkt setzen
              </button>
              <button class="sensor-config__cal-btn sensor-config__cal-btn--abort" @click="calibration.resetCalibration()">
                <X class="w-3 h-3" />
                Abbrechen
              </button>
            </div>
          </div>

          <!-- Step 2: Solution -->
          <div v-else-if="calibration.step.value === 'point2'" class="sensor-config__cal-step">
            <h4>Schritt 2: Kalibrierlosung</h4>
            <p>Elektrode in Kalibrierlosung (1413 &micro;S/cm) tauchen.</p>
            <div class="sensor-config__cal-raw">Rohwert: <strong>{{ currentRawValue.toFixed(0) }}</strong> ADC</div>
            <div class="sensor-config__cal-actions">
              <button class="sensor-config__cal-btn" @click="calibration.setPoint2(currentRawValue, 1413)">
                Kalibrierungspunkt setzen (1413 &micro;S/cm)
              </button>
              <button class="sensor-config__cal-btn sensor-config__cal-btn--abort" @click="calibration.resetCalibration()">
                <X class="w-3 h-3" />
                Abbrechen
              </button>
            </div>
          </div>

          <!-- Complete -->
          <div v-else-if="calibration.step.value === 'complete'" class="sensor-config__cal-step sensor-config__cal-step--complete">
            <h4>EC-Kalibrierung abgeschlossen &#10003;</h4>
            <div class="sensor-config__cal-result">
              <span>Faktor: {{ calibration.result.value?.slope }}</span>
              <span>Offset: {{ calibration.result.value?.offset }}</span>
            </div>
            <div class="sensor-config__cal-actions">
              <button class="sensor-config__cal-btn sensor-config__cal-btn--save" @click="handleSave">
                Kalibrierung speichern
              </button>
              <button class="sensor-config__cal-btn sensor-config__cal-btn--reset" @click="calibration.resetCalibration()">
                <RotateCcw class="w-3 h-3" />
                Zuruecksetzen
              </button>
            </div>
          </div>
        </template>

        <!-- Moisture Calibration (dry/wet ADC boundaries) -->
        <template v-else-if="calibration.calibrationType.value === 'moisture'">
          <div class="sensor-config__cal-step">
            <h4>Bodenfeuchte-Kalibrierung</h4>
            <p>ADC-Grenzwerte fuer trockenen und nassen Boden festlegen.</p>

            <div class="sensor-config__field">
              <label class="sensor-config__label">Trocken-Wert (ADC)</label>
              <input
                v-model.number="calibration.dryValue.value"
                type="number"
                class="sensor-config__input"
                min="0"
                max="4095"
              />
              <span class="sensor-config__helper">ADC-Wert bei trockenem Boden (typisch ~3200)</span>
            </div>

            <div class="sensor-config__field">
              <label class="sensor-config__label">Nass-Wert (ADC)</label>
              <input
                v-model.number="calibration.wetValue.value"
                type="number"
                class="sensor-config__input"
                min="0"
                max="4095"
              />
              <span class="sensor-config__helper">ADC-Wert bei nassem Boden (typisch ~1500)</span>
            </div>

            <div class="sensor-config__cal-actions">
              <button class="sensor-config__cal-btn sensor-config__cal-btn--save" @click="handleSave">
                Kalibrierung speichern
              </button>
              <button class="sensor-config__cal-btn sensor-config__cal-btn--reset" @click="calibration.resetCalibration()">
                <RotateCcw class="w-3 h-3" />
                Zuruecksetzen
              </button>
            </div>
          </div>
        </template>
      </AccordionSection>

      <!-- ═══ ZONE 3: EXPERT (Hardware + Preview) ═════════════════════════ -->

      <!-- Hardware / Interface -->
      <AccordionSection
        title="Hardware & Interface"
        :storage-key="`${accordionKey}-hardware`"
        :icon="Cpu"
      >
        <div class="sensor-config__interface-badge-row">
          Interface:
          <span class="sensor-config__interface-badge">{{ interfaceType }}</span>
        </div>

        <!-- ANALOG: GPIO (ADC1 only) + Range -->
        <template v-if="isAnalog">
          <div class="sensor-config__field">
            <label class="sensor-config__label">GPIO Pin (nur ADC1)</label>
            <select v-model.number="gpioPin" class="sensor-config__select">
              <option v-for="pin in adc1Pins" :key="pin" :value="pin">
                GPIO {{ pin }}
              </option>
            </select>
            <span class="sensor-config__helper">Analoge Sensoren koennen nur ADC1-Pins verwenden</span>
          </div>
          <div class="sensor-config__row">
            <div class="sensor-config__field sensor-config__field--half">
              <label class="sensor-config__label">Messbereich Min</label>
              <input v-model.number="measureRangeMin" type="number" class="sensor-config__input" />
            </div>
            <div class="sensor-config__field sensor-config__field--half">
              <label class="sensor-config__label">Messbereich Max</label>
              <input v-model.number="measureRangeMax" type="number" class="sensor-config__input" />
            </div>
          </div>
        </template>

        <!-- I2C: Address + Bus (NO GPIO!) -->
        <template v-else-if="isI2C">
          <div class="sensor-config__info-box">
            I2C-Sensoren teilen sich den Bus &mdash; kein GPIO-Pin noetig.
            Standard: SDA=GPIO 21, SCL=GPIO 22.
          </div>
          <div class="sensor-config__field">
            <label class="sensor-config__label">I2C-Adresse</label>
            <select v-model="i2cAddress" class="sensor-config__select">
              <option v-for="opt in i2cAddressOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="sensor-config__field">
            <label class="sensor-config__label">I2C-Bus</label>
            <select v-model.number="i2cBus" class="sensor-config__select">
              <option :value="0">Bus 0 &mdash; Wire (GPIO 21/22)</option>
              <option :value="1">Bus 1 &mdash; Wire1 (konfigurierbar)</option>
            </select>
          </div>
        </template>

        <!-- OneWire: GPIO + Address -->
        <template v-else-if="isOneWire">
          <div class="sensor-config__field">
            <label class="sensor-config__label">GPIO Pin</label>
            <select v-model.number="gpioPin" class="sensor-config__select">
              <option v-for="pin in [4, 5, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27]" :key="pin" :value="pin">
                GPIO {{ pin }}
              </option>
            </select>
          </div>
          <div class="sensor-config__info-box">
            OneWire-Sensoren werden automatisch erkannt. Mehrere DS18B20 koennen denselben GPIO teilen.
          </div>
        </template>

        <!-- Digital: GPIO + Pulses -->
        <template v-else-if="isDigital">
          <div class="sensor-config__field">
            <label class="sensor-config__label">GPIO Pin</label>
            <select v-model.number="gpioPin" class="sensor-config__select">
              <option v-for="pin in [4, 5, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27]" :key="pin" :value="pin">
                GPIO {{ pin }}
              </option>
            </select>
          </div>
          <div class="sensor-config__field">
            <label class="sensor-config__label">Impulse pro Liter</label>
            <input v-model.number="pulsesPerLiter" type="number" class="sensor-config__input" min="1" />
            <span class="sensor-config__helper">Kalibrierungsfaktor des Durchfluss-Sensors</span>
          </div>
        </template>
      </AccordionSection>

      <!-- Live Preview -->
      <AccordionSection
        title="Live-Vorschau"
        :storage-key="`${accordionKey}-preview`"
        :icon="Settings"
      >
        <div class="sensor-config__preview">
          <LiveDataPreview :esp-id="espId" :gpio="gpio" :unit="unitValue || defaultUnit" />
        </div>
      </AccordionSection>

      <!-- ═══ ALERT CONFIGURATION (Phase 4A.7) ═════════════════════════ -->
      <AccordionSection
        v-if="sensorDbId"
        title="Alert-Konfiguration"
        :storage-key="`${accordionKey}-alert-config`"
      >
        <AlertConfigSection
          :entity-id="sensorDbId"
          entity-type="sensor"
          :fetch-fn="sensorsApi.getAlertConfig"
          :update-fn="sensorsApi.updateAlertConfig"
        />
      </AccordionSection>

      <!-- ═══ RUNTIME & MAINTENANCE (Phase 4A.8) ══════════════════════ -->
      <AccordionSection
        v-if="sensorDbId"
        title="Laufzeit & Wartung"
        :storage-key="`${accordionKey}-runtime`"
      >
        <RuntimeMaintenanceSection
          :entity-id="sensorDbId"
          entity-type="sensor"
          :fetch-fn="sensorsApi.getRuntime"
          :update-fn="sensorsApi.updateRuntime"
        />
      </AccordionSection>

      <!-- ═══ DEVICE INFO (Metadata) ═════════════════════════════════════ -->
      <AccordionSection
        v-if="showMetadata"
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
          device-type="sensor"
        />
      </AccordionSection>

      <!-- ═══ ACTIONS ══════════════════════════════════════════════════════ -->
      <div class="sensor-config__actions">
        <button
          class="sensor-config__save"
          :disabled="saving || loading"
          @click="handleSave"
        >
          <Save class="w-4 h-4" />
          {{ saving ? 'Speichert...' : 'Speichern' }}
        </button>
        <button
          class="sensor-config__delete"
          :disabled="deleting || loading"
          @click="confirmAndDelete"
        >
          <Trash2 class="w-4 h-4" />
          Sensor entfernen
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sensor-config {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sensor-config--loading {
  opacity: 0.6;
}

.sensor-config__loading {
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-muted);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTIONS (Zone 1)
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--glass-border);
}

.sensor-config__section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FIELDS
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sensor-config__field--half { flex: 1; }
.sensor-config__field--quarter { flex: 1; min-width: 0; }

.sensor-config__field--toggle {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.sensor-config__row {
  display: flex;
  gap: var(--space-3);
}

.sensor-config__label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.sensor-config__label--alarm { color: var(--color-status-alarm); }
.sensor-config__label--warn { color: var(--color-status-warning); }

.sensor-config__input {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-base);
  font-family: var(--font-body);
  transition: border-color var(--transition-fast);
}

.sensor-config__input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.sensor-config__input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sensor-config__input--sm {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
  font-family: var(--font-mono);
}

.sensor-config__input--mono {
  font-family: var(--font-mono);
}

/* schedule_config (Auftrag 5) */
.sensor-config__schedule {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sensor-config__schedule-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.sensor-config__preset-btn {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensor-config__preset-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-text-primary);
}

.sensor-config__preset-btn--active {
  background: var(--color-accent-dim);
  border-color: var(--color-accent);
  color: var(--color-accent-bright);
}

.sensor-config__select {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-base);
  cursor: pointer;
}

.sensor-config__select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.sensor-config__helper {
  font-size: 10px;
  color: var(--color-text-muted);
}

.sensor-config__info-box {
  padding: var(--space-2) var(--space-3);
  background: rgba(96, 165, 250, 0.06);
  border: 1px solid rgba(96, 165, 250, 0.15);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-info);
  line-height: var(--leading-normal);
}

.sensor-config__interface-badge-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-weight: 600;
}

.sensor-config__interface-badge {
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
.sensor-config__toggle {
  position: relative;
  width: 40px;
  height: 22px;
  background: var(--color-bg-quaternary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensor-config__toggle--on {
  background: var(--color-status-good);
  border-color: transparent;
}

.sensor-config__toggle-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
}

.sensor-config__toggle--on .sensor-config__toggle-dot {
  transform: translateX(18px);
}

/* Threshold inputs */
.sensor-config__threshold-inputs {
  display: flex;
  gap: var(--space-2);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CALIBRATION
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__cal-current {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.sensor-config__cal-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.sensor-config__cal-value {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text-primary);
}

.sensor-config__cal-start {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent-dim);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  color: var(--color-accent-bright);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensor-config__cal-start:hover {
  background: rgba(59, 130, 246, 0.2);
}

.sensor-config__cal-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

.sensor-config__cal-step h4 {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.sensor-config__cal-step p {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
}

.sensor-config__cal-step--complete {
  border-color: var(--color-status-good);
  background: rgba(34, 197, 94, 0.04);
}

.sensor-config__cal-raw {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.sensor-config__cal-result {
  display: flex;
  gap: var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.sensor-config__cal-btn {
  padding: var(--space-2) var(--space-3);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensor-config__cal-btn:hover {
  filter: brightness(1.1);
}

.sensor-config__cal-btn--save {
  background: var(--color-status-good);
}

.sensor-config__cal-btn--reset {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--color-text-secondary);
}

.sensor-config__cal-btn--abort {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  background: transparent;
  border: 1px solid var(--color-text-muted);
  color: var(--color-text-secondary);
}

.sensor-config__cal-btn--abort:hover {
  border-color: var(--color-error);
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.08);
}

.sensor-config__cal-actions {
  display: flex;
  gap: var(--space-2);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE PREVIEW
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__preview {
  height: 180px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__actions {
  padding-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sensor-config__save {
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

.sensor-config__save:hover:not(:disabled) {
  filter: brightness(1.1);
}

.sensor-config__save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sensor-config__delete {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  justify-content: center;
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: 1px solid var(--color-status-critical);
  border-radius: var(--radius-sm);
  color: var(--color-status-critical);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensor-config__delete:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
}

.sensor-config__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
