<template>
  <div class="esp-pin-configuration">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-pin" color="success" class="mr-2" />
      <h4 class="text-subtitle-1 font-weight-medium">Pin-Konfiguration</h4>
    </div>

    <!-- NEU: Compact-Mode für Tree-View -->
    <div v-if="compact" class="compact-pin-view">
      <v-row>
        <v-col cols="12" md="6">
          <div class="text-caption text-grey mb-2">
            <v-icon icon="mdi-thermometer" size="16" class="mr-1" />
            Sensoren
          </div>

          <div class="compact-pin-grid">
            <div v-for="(pin, type) in getSensorPins()" :key="type" class="compact-pin-item">
              <v-text-field
                v-model="pin.value"
                :label="pin.label"
                type="number"
                variant="outlined"
                density="compact"
                :error="!isPinValid(pin.value)"
                placeholder="GPIO"
                class="compact-pin-field"
                @input="handlePinInputChange(type, $event)"
              />
            </div>
          </div>
        </v-col>

        <v-col cols="12" md="6">
          <div class="text-caption text-grey mb-2">
            <v-icon icon="mdi-cog" size="16" class="mr-1" />
            Aktoren
          </div>

          <div class="compact-pin-grid">
            <div v-for="(pin, type) in getActuatorPins()" :key="type" class="compact-pin-item">
              <v-text-field
                v-model="pin.value"
                :label="pin.label"
                type="number"
                variant="outlined"
                density="compact"
                :error="!isPinValid(pin.value)"
                placeholder="GPIO"
                class="compact-pin-field"
                @input="handlePinInputChange(type, $event)"
              />
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- Compact-Mode Actions -->
      <div class="d-flex justify-end mt-4">
        <v-btn
          color="primary"
          size="small"
          variant="tonal"
          prepend-icon="mdi-content-save"
          @click="savePinConfiguration"
          :disabled="!isConfigurationValid || !mqttStore.value.isConnected"
          :loading="saving"
        >
          Speichern
        </v-btn>
      </div>
    </div>

    <!-- Bestehender Full-Mode -->
    <div v-else>
      <!-- ✅ MIGRIERT: Pin-Grid aus PinConfiguration.vue -->
      <div v-for="zone in pinConfig.zones" :key="zone.id" class="mb-4">
        <div class="d-flex align-center justify-space-between mb-2">
          <h5 class="text-subtitle-2 font-weight-medium">Zone {{ zone.id }}</h5>
          <v-btn
            v-if="zone.id !== 1"
            icon="mdi-delete"
            size="x-small"
            variant="text"
            color="error"
            @click="removeZone(zone.id)"
          />
        </div>

        <v-row>
          <!-- Sensoren -->
          <v-col cols="12" md="6">
            <div class="text-caption text-grey mb-2">
              <v-icon icon="mdi-thermometer" size="16" class="mr-1" />
              Sensoren
            </div>

            <v-text-field
              v-model="zone.pins.ds18b20"
              label="DS18B20"
              type="number"
              variant="outlined"
              density="compact"
              :error="!isPinValid(zone.pins.ds18b20)"
              :error-messages="!isPinValid(zone.pins.ds18b20) ? 'Ungültiger Pin' : ''"
              placeholder="GPIO"
              class="mb-2"
            />

            <v-text-field
              v-model="zone.pins.soilSensor"
              label="Bodenfeuchte"
              type="number"
              variant="outlined"
              density="compact"
              :error="!isPinValid(zone.pins.soilSensor)"
              :error-messages="!isPinValid(zone.pins.soilSensor) ? 'Ungültiger Pin' : ''"
              placeholder="GPIO"
              class="mb-2"
            />

            <v-text-field
              v-model="zone.pins.flowSensor"
              label="Durchfluss"
              type="number"
              variant="outlined"
              density="compact"
              :error="!isPinValid(zone.pins.flowSensor)"
              :error-messages="!isPinValid(zone.pins.flowSensor) ? 'Ungültiger Pin' : ''"
              placeholder="GPIO"
            />
          </v-col>

          <!-- Aktoren -->
          <v-col cols="12" md="6">
            <div class="text-caption text-grey mb-2">
              <v-icon icon="mdi-cog" size="16" class="mr-1" />
              Aktoren
            </div>

            <v-text-field
              v-model="zone.pins.humidifier"
              label="Luftbefeuchter"
              type="number"
              variant="outlined"
              density="compact"
              :error="!isPinValid(zone.pins.humidifier)"
              :error-messages="!isPinValid(zone.pins.humidifier) ? 'Ungültiger Pin' : ''"
              placeholder="GPIO"
              class="mb-2"
            />

            <v-text-field
              v-model="zone.pins.valve"
              label="Ventil"
              type="number"
              variant="outlined"
              density="compact"
              :error="!isPinValid(zone.pins.valve)"
              :error-messages="!isPinValid(zone.pins.valve) ? 'Ungültiger Pin' : ''"
              placeholder="GPIO"
              class="mb-2"
            />

            <v-text-field
              v-model="zone.pins.pump"
              label="Pumpe"
              type="number"
              variant="outlined"
              density="compact"
              :error="!isPinValid(zone.pins.pump)"
              :error-messages="!isPinValid(zone.pins.pump) ? 'Ungültiger Pin' : ''"
              placeholder="GPIO"
            />
          </v-col>
        </v-row>
      </div>

      <!-- Action Buttons -->
      <div class="d-flex justify-space-between align-center mt-4">
        <v-btn
          color="success"
          size="small"
          variant="outlined"
          prepend-icon="mdi-plus"
          @click="addZone"
        >
          Zone hinzufügen
        </v-btn>

        <div class="d-flex gap-2">
          <v-btn color="secondary" size="small" variant="outlined" @click="resetPinConfiguration">
            Zurücksetzen
          </v-btn>
          <v-btn
            color="primary"
            size="small"
            variant="tonal"
            prepend-icon="mdi-content-save"
            @click="savePinConfiguration"
            :disabled="!isConfigurationValid || !mqttStore.value.isConnected"
            :loading="saving"
          >
            Speichern
          </v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, ref, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

const props = defineProps({
  espId: { type: String, required: true },
  readonly: { type: Boolean, default: false },
  // NEU: Compact-Mode Props
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['pin-change'])

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const espManagement = computed(() => centralDataHub.espManagement)

// ✅ MIGRIERT: Pin-Konfiguration aus PinConfiguration.vue
const saving = ref(false)
const pinConfig = reactive({
  zones: [
    {
      id: 1,
      pins: {
        ds18b20: '',
        soilSensor: '',
        flowSensor: '',
        humidifier: '',
        valve: '',
        pump: '',
      },
    },
  ],
})

// ✅ KONSISTENT: Verwende bestehende Validierung
const selectedEsp = computed(() => mqttStore.value.espDevices.get(props.espId))
const getAvailablePins = computed(() => {
  if (!selectedEsp.value) return espManagement.value.availablePins
  const boardType = selectedEsp.value.board_type || selectedEsp.value.boardType || 'ESP32_DEVKIT'
  return espManagement.value.getAvailablePinsForBoard(boardType)
})

const ALLOWED_GPIOS = computed(() => getAvailablePins.value)

// ✅ MIGRIERT: Methoden aus PinConfiguration.vue
const isPinValid = (pin) => {
  if (!pin) return true
  const pinNum = Number(pin)
  return ALLOWED_GPIOS.value.includes(pinNum) && pinNum !== 15
}

const isConfigurationValid = computed(() => {
  if (!props.espId) return false

  // Pin-Validierung (aus PinConfiguration.vue)
  const hasEmptyPins = pinConfig.zones.some((zone) => Object.values(zone.pins).some((pin) => !pin))
  if (hasEmptyPins) return false

  const hasInvalidPins = pinConfig.zones.some((zone) =>
    Object.values(zone.pins).some((pin) => !isPinValid(pin)),
  )
  if (hasInvalidPins) return false

  // Pin-Konflikte prüfen
  const usedPins = new Set()
  for (const zone of pinConfig.zones) {
    for (const pin of Object.values(zone.pins)) {
      if (usedPins.has(pin)) return false
      usedPins.add(pin)
    }
  }

  return true
})

// NEU: Atomic Debounce mit Sequence-ID Protection
const debounceSequenceId = ref(0)
const saveTimeout = ref(null)

// NEU: Compact-Mode Event Handler mit Race-Condition-Protection
const handlePinInputChange = (type, value) => {
  const zone = pinConfig.zones[0]
  zone.pins[type] = value

  // ⚡ ATOMIC DEBOUNCE: Sequence-ID für Race-Condition-Protection
  const currentSequenceId = ++debounceSequenceId.value

  // Sofortiges MQTT-Publish für Tree-View
  if (props.compact && isConfigurationValid.value) {
    // Atomic Debounce mit Sequence-ID-Validation
    clearTimeout(saveTimeout.value)
    saveTimeout.value = setTimeout(() => {
      // ⚡ RACE-CONDITION-CHECK: Nur ausführen wenn Sequence-ID noch aktuell
      if (currentSequenceId === debounceSequenceId.value) {
        savePinConfiguration()
      }
    }, 1000)
  }

  // NEU: Sofortiges Event-Emit für Parent-Komponenten
  emit('pin-change', {
    espId: props.espId,
    type,
    value,
    sequenceId: currentSequenceId,
    config: {
      zones: pinConfig.zones.map((zone) => ({
        id: zone.id,
        pins: zone.pins,
      })),
    },
  })
}

// NEU: Debounced save für Compact-Mode
const publishPinConfigurationImmediately = async () => {
  if (!isConfigurationValid.value || !mqttStore.value.isConnected) return

  try {
    const topic = `kaiser/${mqttStore.value.kaiser.id}/esp/${props.espId}/zone/config`
    const config = {
      zones: pinConfig.zones.map((zone) => ({
        id: zone.id,
        pins: zone.pins,
      })),
    }

    await mqttStore.value.publish(topic, config)
    console.log(`[Tree-View] Pin configuration published immediately for ESP ${props.espId}`)
  } catch (error) {
    console.error('[Tree-View] Failed to publish pin configuration immediately:', error)
  }
}

// NEU: Enhanced savePinConfiguration mit Tree-View Support
const savePinConfiguration = async () => {
  if (!isConfigurationValid.value || !mqttStore.value.isConnected) return

  saving.value = true
  try {
    const topic = `kaiser/${mqttStore.value.kaiser.id}/esp/${props.espId}/zone/config`
    const config = {
      zones: pinConfig.zones.map((zone) => ({
        id: zone.id,
        pins: zone.pins,
      })),
    }

    await mqttStore.value.publish(topic, config)
    emit('pin-change', { espId: props.espId, config })
    window.$snackbar?.showSuccess('Pin-Konfiguration gespeichert')

    // NEU: Sofortiges MQTT-Publish für Tree-View
    if (props.compact) {
      await publishPinConfigurationImmediately()
    }
  } catch (error) {
    console.error('Fehler beim Speichern der Pin-Konfiguration:', error)
    window.$snackbar?.showError('Fehler beim Speichern der Pin-Konfiguration')
  } finally {
    saving.value = false
  }
}

// ✅ MIGRIERT: Zone-Management aus PinConfiguration.vue
const addZone = () => {
  pinConfig.zones.push({
    id: pinConfig.zones.length + 1,
    pins: {
      ds18b20: '',
      soilSensor: '',
      flowSensor: '',
      humidifier: '',
      valve: '',
      pump: '',
    },
  })
}

const removeZone = (zoneId) => {
  const index = pinConfig.zones.findIndex((z) => z.id === zoneId)
  if (index !== -1) {
    pinConfig.zones.splice(index, 1)
    pinConfig.zones.forEach((zone, idx) => {
      zone.id = idx + 1
    })
  }
}

const resetPinConfiguration = () => {
  pinConfig.zones = [
    {
      id: 1,
      pins: {
        ds18b20: '',
        soilSensor: '',
        flowSensor: '',
        humidifier: '',
        valve: '',
        pump: '',
      },
    },
  ]
}

// NEU: Compact-Mode Methods
const getSensorPins = () => {
  const zone = pinConfig.zones[0] // Erste Zone für Compact-View
  return {
    ds18b20: { value: zone.pins.ds18b20, label: 'DS18B20' },
    soilSensor: { value: zone.pins.soilSensor, label: 'Bodenfeuchte' },
    flowSensor: { value: zone.pins.flowSensor, label: 'Durchfluss' },
  }
}

const getActuatorPins = () => {
  const zone = pinConfig.zones[0] // Erste Zone für Compact-View
  return {
    humidifier: { value: zone.pins.humidifier, label: 'Luftbefeuchter' },
    valve: { value: zone.pins.valve, label: 'Ventil' },
    pump: { value: zone.pins.pump, label: 'Pumpe' },
  }
}

// ✅ KONSISTENT: Load existing configuration
watch(
  () => props.espId,
  (newEspId) => {
    if (newEspId) {
      loadExistingConfiguration()
    }
  },
  { immediate: true },
)

const loadExistingConfiguration = () => {
  // TODO: Load existing pin configuration from device
  console.log('Loading pin configuration for ESP:', props.espId)
}
</script>

<style scoped>
.esp-pin-configuration {
  width: 100%;
}

/* NEU: Compact-Mode Styles */
.compact-pin-view {
  .compact-pin-grid {
    display: grid;
    gap: 8px;
  }

  .compact-pin-field {
    font-size: 0.875rem;
  }
}

@media (max-width: 768px) {
  .compact-pin-grid {
    grid-template-columns: 1fr;
  }
}
</style>
