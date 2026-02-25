<script setup lang="ts">
/**
 * SensorConfigPanel — Full Sensor Configuration (Redesigned)
 *
 * Replaces the previous DynamicForm-based panel with a comprehensive
 * configuration interface organized in sections:
 *
 * 1. Basic fields (name, zone, unit, active)
 * 2. Interface-specific fields (GPIO/I2C/OneWire)
 * 3. Threshold configuration (4-point range slider)
 * 4. Calibration wizard (pH/EC only)
 * 5. Live preview chart
 *
 * Used inside a SlideOver panel on ESP detail view.
 */

import { ref, computed, onMounted, watch } from 'vue'
import { Save, RotateCcw, ChevronDown, ChevronRight, Beaker } from 'lucide-vue-next'
import { sensorsApi } from '@/api/sensors'
import { subzonesApi } from '@/api/subzones'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'
import { useCalibration } from '@/composables/useCalibration'
import { inferInterfaceType } from '@/utils/sensorDefaults'
import { SENSOR_TYPE_CONFIG, getSensorUnit } from '@/utils/sensorDefaults'
import RangeSlider from '@/shared/design/primitives/RangeSlider.vue'
import LiveDataPreview from './LiveDataPreview.vue'

interface Props {
  espId: string
  gpio: number
  sensorType: string
  unit?: string
}

const props = withDefaults(defineProps<Props>(), {
  unit: '',
})

const toast = useToast()
const espStore = useEspStore()
const calibration = useCalibration()

// =============================================================================
// State
// =============================================================================
const loading = ref(true)
const saving = ref(false)

// Basic fields
const name = ref('')
const description = ref('')
const unitValue = ref('')
const enabled = ref(true)

// Subzone
const subzoneId = ref<string | null>(null)
const availableSubzones = ref<{ id: string; name: string }[]>([])

// Interface-specific
const interfaceType = computed(() => inferInterfaceType(props.sensorType))
const gpioPin = ref(props.gpio)
const i2cAddress = ref('0x44')
const i2cBus = ref(0)
const measureRangeMin = ref(0)
const measureRangeMax = ref(100)
const pulsesPerLiter = ref(450)

// Thresholds
const showThresholds = ref(false)
const alarmLow = ref(0)
const warnLow = ref(0)
const warnHigh = ref(100)
const alarmHigh = ref(100)

// Calibration
const showCalibration = ref(false)
const currentRawValue = ref(0)

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
  return t === 'ph' || t === 'ec'
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

// =============================================================================
// Load existing config
// =============================================================================
onMounted(async () => {
  try {
    const config = await sensorsApi.get(props.espId, props.gpio)
    if (config) {
      name.value = (config as any).name || ''
      description.value = (config as any).description || ''
      unitValue.value = (config as any).unit || defaultUnit.value
      enabled.value = (config as any).enabled !== false
      i2cAddress.value = (config as any).i2c_address || '0x44'
      i2cBus.value = (config as any).i2c_bus || 0

      // Subzone
      if ((config as any).subzone_id) {
        subzoneId.value = (config as any).subzone_id
      }

      // Thresholds
      if ((config as any).threshold_min != null) alarmLow.value = (config as any).threshold_min
      if ((config as any).warning_min != null) warnLow.value = (config as any).warning_min
      if ((config as any).warning_max != null) warnHigh.value = (config as any).warning_max
      if ((config as any).threshold_max != null) alarmHigh.value = (config as any).threshold_max
    }
  } catch {
    // No existing config — use defaults
    unitValue.value = defaultUnit.value
    if (sensorConfig.value) {
      alarmLow.value = sensorConfig.value.min
      warnLow.value = sensorConfig.value.min + (sensorConfig.value.max - sensorConfig.value.min) * 0.1
      warnHigh.value = sensorConfig.value.max - (sensorConfig.value.max - sensorConfig.value.min) * 0.1
      alarmHigh.value = sensorConfig.value.max
    }
  } finally {
    loading.value = false
  }

  // Load existing subzone from device store (more reliable than config)
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
  if (device?.subzone_id && !subzoneId.value) {
    subzoneId.value = device.subzone_id
  }

  // Load available subzones for this ESP
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

// =============================================================================
// Save
// =============================================================================
async function handleSave() {
  saving.value = true
  try {
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
    }

    if (isI2C.value) {
      config.i2c_address = i2cAddress.value
      config.i2c_bus = i2cBus.value
    }

    if (isDigital.value) {
      config.pulses_per_liter = pulsesPerLiter.value
    }

    if (isAnalog.value) {
      config.measure_range_min = measureRangeMin.value
      config.measure_range_max = measureRangeMax.value
    }

    // Subzone assignment
    config.subzone_id = subzoneId.value

    // Calibration data
    const calData = calibration.getCalibrationData()
    if (calData) {
      config.calibration = calData
    }

    await sensorsApi.createOrUpdate(props.espId, props.gpio, config as any)
    toast.success('Sensor-Konfiguration gespeichert')
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
      <!-- ═══ SECTION: Basic Fields ═══════════════════════════════════════ -->
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

        <!-- Subzone assignment -->
        <div class="sensor-config__field">
          <label class="sensor-config__label">Subzone</label>
          <select v-model="subzoneId" class="sensor-config__select">
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

      <!-- ═══ SECTION: Interface-Specific Fields ═══════════════════════════ -->
      <section class="sensor-config__section">
        <h3 class="sensor-config__section-title">
          Hardware —
          <span class="sensor-config__interface-badge">{{ interfaceType }}</span>
        </h3>

        <!-- ANALOG: GPIO (ADC1 only) + Range -->
        <template v-if="isAnalog">
          <div class="sensor-config__field">
            <label class="sensor-config__label">GPIO Pin (nur ADC1)</label>
            <select v-model.number="gpioPin" class="sensor-config__select">
              <option v-for="pin in adc1Pins" :key="pin" :value="pin">
                GPIO {{ pin }}
              </option>
            </select>
            <span class="sensor-config__helper">Analoge Sensoren können nur ADC1-Pins verwenden</span>
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
            I2C-Sensoren teilen sich den Bus — kein GPIO-Pin nötig.
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
              <option :value="0">Bus 0 — Wire (GPIO 21/22)</option>
              <option :value="1">Bus 1 — Wire1 (konfigurierbar)</option>
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
            OneWire-Sensoren werden automatisch erkannt. Mehrere DS18B20 können denselben GPIO teilen.
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
      </section>

      <!-- ═══ SECTION: Thresholds ═════════════════════════════════════════ -->
      <section class="sensor-config__section">
        <button class="sensor-config__accordion" @click="showThresholds = !showThresholds">
          <component :is="showThresholds ? ChevronDown : ChevronRight" class="w-4 h-4" />
          <span>Schwellwerte</span>
        </button>

        <div v-if="showThresholds" class="sensor-config__accordion-content">
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
              <label class="sensor-config__label sensor-config__label--alarm">Alarm ↓</label>
              <input v-model.number="alarmLow" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
            </div>
            <div class="sensor-config__field sensor-config__field--quarter">
              <label class="sensor-config__label sensor-config__label--warn">Warn ↓</label>
              <input v-model.number="warnLow" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
            </div>
            <div class="sensor-config__field sensor-config__field--quarter">
              <label class="sensor-config__label sensor-config__label--warn">Warn ↑</label>
              <input v-model.number="warnHigh" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
            </div>
            <div class="sensor-config__field sensor-config__field--quarter">
              <label class="sensor-config__label sensor-config__label--alarm">Alarm ↑</label>
              <input v-model.number="alarmHigh" type="number" step="0.1" class="sensor-config__input sensor-config__input--sm" />
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ SECTION: Calibration (pH/EC only) ══════════════════════════ -->
      <section v-if="needsCalibration" class="sensor-config__section">
        <button class="sensor-config__accordion" @click="showCalibration = !showCalibration">
          <component :is="showCalibration ? ChevronDown : ChevronRight" class="w-4 h-4" />
          <Beaker class="w-4 h-4" />
          <span>Kalibrierung</span>
        </button>

        <div v-if="showCalibration" class="sensor-config__accordion-content">
          <!-- Current raw value display -->
          <div class="sensor-config__cal-current">
            <span class="sensor-config__cal-label">Aktueller Rohwert:</span>
            <span class="sensor-config__cal-value">{{ currentRawValue.toFixed(0) }} ADC</span>
          </div>

          <!-- Not started -->
          <template v-if="!calibration.isActive.value">
            <button
              class="sensor-config__cal-start"
              @click="calibration.startCalibration(sensorType.toLowerCase() === 'ph' ? 'pH' : 'EC')"
            >
              <Beaker class="w-4 h-4" />
              Kalibrierung starten
            </button>
          </template>

          <!-- pH Calibration Wizard -->
          <template v-else-if="calibration.calibrationType.value === 'pH'">
            <!-- Step 1: pH 4.0 -->
            <div v-if="calibration.step.value === 'point1'" class="sensor-config__cal-step">
              <h4>Schritt 1: pH 4.0 Pufferlösung</h4>
              <p>Sensor in pH 4.0 Lösung tauchen und warten bis der Wert stabil ist.</p>
              <div class="sensor-config__cal-raw">Rohwert: <strong>{{ currentRawValue.toFixed(0) }}</strong> ADC</div>
              <button class="sensor-config__cal-btn" @click="calibration.setPoint1(currentRawValue, 4.0)">
                Kalibrierungspunkt 1 setzen (pH 4.0)
              </button>
            </div>

            <!-- Step 2: pH 7.0 -->
            <div v-else-if="calibration.step.value === 'point2'" class="sensor-config__cal-step">
              <h4>Schritt 2: pH 7.0 Pufferlösung</h4>
              <p>Sensor in pH 7.0 Lösung tauchen und warten bis der Wert stabil ist.</p>
              <div class="sensor-config__cal-raw">
                Punkt 1: {{ calibration.point1.value?.rawValue.toFixed(0) }} ADC → pH 4.0 ✓
              </div>
              <div class="sensor-config__cal-raw">Rohwert: <strong>{{ currentRawValue.toFixed(0) }}</strong> ADC</div>
              <button class="sensor-config__cal-btn" @click="calibration.setPoint2(currentRawValue, 7.0)">
                Kalibrierungspunkt 2 setzen (pH 7.0)
              </button>
            </div>

            <!-- Complete -->
            <div v-else-if="calibration.step.value === 'complete'" class="sensor-config__cal-step sensor-config__cal-step--complete">
              <h4>Kalibrierung abgeschlossen ✓</h4>
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
                  Zurücksetzen
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
              <button class="sensor-config__cal-btn" @click="calibration.setPoint1(currentRawValue, 0)">
                Nullpunkt setzen
              </button>
            </div>

            <!-- Step 2: Solution -->
            <div v-else-if="calibration.step.value === 'point2'" class="sensor-config__cal-step">
              <h4>Schritt 2: Kalibrierlösung</h4>
              <p>Elektrode in Kalibrierlösung (1413 µS/cm) tauchen.</p>
              <div class="sensor-config__cal-raw">Rohwert: <strong>{{ currentRawValue.toFixed(0) }}</strong> ADC</div>
              <button class="sensor-config__cal-btn" @click="calibration.setPoint2(currentRawValue, 1413)">
                Kalibrierungspunkt setzen (1413 µS/cm)
              </button>
            </div>

            <!-- Complete -->
            <div v-else-if="calibration.step.value === 'complete'" class="sensor-config__cal-step sensor-config__cal-step--complete">
              <h4>EC-Kalibrierung abgeschlossen ✓</h4>
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
                  Zurücksetzen
                </button>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- ═══ SECTION: Live Preview ═══════════════════════════════════════ -->
      <section class="sensor-config__section sensor-config__section--preview">
        <h3 class="sensor-config__section-title">Live-Vorschau</h3>
        <div class="sensor-config__preview">
          <LiveDataPreview :esp-id="espId" :gpio="gpio" :unit="unitValue || defaultUnit" />
        </div>
      </section>

      <!-- ═══ SAVE BUTTON ════════════════════════════════════════════════ -->
      <div class="sensor-config__actions">
        <button
          class="sensor-config__save"
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
.sensor-config {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
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
   SECTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--glass-border);
}

.sensor-config__section:last-of-type {
  border-bottom: none;
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

/* ═══════════════════════════════════════════════════════════════════════════
   ACCORDION
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__accordion {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: color var(--transition-fast);
}

.sensor-config__accordion:hover {
  color: var(--color-text-primary);
}

.sensor-config__accordion-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-2);
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

.sensor-config__cal-actions {
  display: flex;
  gap: var(--space-2);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE PREVIEW
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__section--preview {
  max-height: 240px;
}

.sensor-config__preview {
  height: 180px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

.sensor-config__actions {
  padding-top: var(--space-2);
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
</style>
