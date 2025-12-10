<template>
  <div class="bg-white rounded-lg p-4">
    <div class="mb-6">
      <div class="d-flex justify-space-between align-center">
        <h2 class="text-h6">ESP Device Simulator</h2>
        <div class="text-caption text-grey">Last Update: {{ formatRelativeTime(lastUpdate) }}</div>
      </div>
      <v-divider class="my-2" />

      <!-- Device Configuration -->
      <v-row>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="deviceConfig.espId"
            label="ESP-ID"
            hint="z.B. ESP32_001"
            persistent-hint
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="deviceConfig.subzoneId"
            label="Subzone ID"
            hint="z.B. zone1"
            persistent-hint
          />
        </v-col>
      </v-row>

      <!-- Sensors Configuration -->
      <div class="my-4">
        <div class="d-flex justify-space-between align-center mb-2">
          <h3 class="text-h6">Sensors</h3>
          <v-btn size="small" prepend-icon="mdi-plus" @click="addSensor"> Add Sensor </v-btn>
        </div>

        <v-expansion-panels>
          <v-expansion-panel
            v-for="(sensor, index) in deviceConfig.sensors"
            :key="`sensor-${index}`"
          >
            <v-expansion-panel-title>
              {{ getSensorTypeLabel(sensor.type) }} (GPIO {{ sensor.gpio }})
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-row>
                <v-col cols="12" md="4">
                  <v-select v-model="sensor.type" :items="sensorTypes" label="Sensor Type" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model.number="sensor.gpio"
                    type="number"
                    label="GPIO Pin"
                    :rules="[(v) => allowedGpios.includes(v) || 'Invalid GPIO']"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="sensor.name" label="Sensor Name" />
                </v-col>
                <v-col cols="12">
                  <div class="d-flex align-center">
                    <v-text-field
                      v-model.number="sensor.value"
                      type="number"
                      :label="getSensorValueLabel(sensor.type)"
                      class="flex-grow-1 mr-2"
                    />
                    <v-btn
                      color="error"
                      icon="mdi-delete"
                      size="small"
                      @click="removeSensor(index)"
                    />
                  </div>
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>

      <!-- Actuators Configuration -->
      <div class="my-4">
        <div class="d-flex justify-space-between align-center mb-2">
          <h3 class="text-h6">Actuators</h3>
          <v-btn size="small" prepend-icon="mdi-plus" @click="addActuator"> Add Actuator </v-btn>
        </div>

        <v-expansion-panels>
          <v-expansion-panel
            v-for="(actuator, index) in deviceConfig.actuators"
            :key="`actuator-${index}`"
          >
            <v-expansion-panel-title>
              {{ getActuatorTypeLabel(actuator.type) }} (GPIO {{ actuator.gpio }})
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-row>
                <v-col cols="12" md="4">
                  <v-select v-model="actuator.type" :items="actuatorTypes" label="Actuator Type" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model.number="actuator.gpio"
                    type="number"
                    label="GPIO Pin"
                    :rules="[(v) => allowedGpios.includes(v) || 'Invalid GPIO']"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="actuator.name" label="Actuator Name" />
                </v-col>
                <v-col cols="12">
                  <div class="d-flex align-center">
                    <template v-if="isAnalogActuator(actuator.type)">
                      <v-slider
                        v-model="actuator.state"
                        :min="0"
                        :max="1"
                        :step="0.1"
                        label="State"
                        class="flex-grow-1 mr-2"
                      />
                    </template>
                    <template v-else>
                      <v-switch v-model="actuator.state" label="State" class="flex-grow-1 mr-2" />
                    </template>
                    <v-btn
                      color="error"
                      icon="mdi-delete"
                      size="small"
                      @click="removeActuator(index)"
                    />
                  </div>
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>

      <!-- Simulation Control -->
      <div class="d-flex justify-space-between align-center mb-4">
        <v-btn
          :color="isSimulating ? 'error' : 'success'"
          :loading="loading"
          @click="toggleSimulation"
          variant="elevated"
          prepend-icon="mdi-play"
        >
          {{ isSimulating ? 'Stop Simulation' : 'Start Simulation' }}
        </v-btn>
      </div>

      <!-- Topic Preview Section -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-eye" class="mr-2" />
            MQTT Topic Vorschau
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-alert type="info" variant="tonal" density="compact" class="mb-3">
              <strong>Wird gesendet an:</strong> Vorschau der MQTT-Topics vor dem Publish
            </v-alert>

            <div v-for="sensor in deviceConfig.sensors" :key="sensor.gpio" class="mb-2">
              <div class="text-caption text-grey">Sensor {{ sensor.name }}:</div>
              <code class="text-body-2 pa-1 bg-grey-lighten-4 rounded">
                {{ buildSensorTopic(sensor) }}
              </code>
            </div>

            <div v-for="actuator in deviceConfig.actuators" :key="actuator.gpio" class="mb-2">
              <div class="text-caption text-grey">Aktor {{ actuator.name }}:</div>
              <code class="text-body-2 pa-1 bg-grey-lighten-4 rounded">
                {{ buildActuatorTopic(actuator) }}
              </code>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Erfolgs-Feedback Section -->
      <v-card v-if="lastPublishResult" variant="tonal" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon
            :color="lastPublishResult.success ? 'success' : 'error'"
            :icon="lastPublishResult.success ? 'mdi-check-circle' : 'mdi-alert-circle'"
            class="mr-2"
          />
          Letzter Publish: {{ lastPublishResult.success ? 'Erfolgreich' : 'Fehlgeschlagen' }}
        </v-card-title>
        <v-card-text>
          <div class="text-caption text-grey mb-2">
            {{ formatRelativeTime(lastPublishResult.timestamp) }}
          </div>
          <div v-if="lastPublishResult.topics" class="mb-2">
            <div class="text-caption font-weight-medium">Gesendete Topics:</div>
            <div v-for="topic in lastPublishResult.topics" :key="topic" class="text-body-2">
              <code class="pa-1 bg-grey-lighten-4 rounded">{{ topic }}</code>
            </div>
          </div>
          <div v-if="lastPublishResult.error" class="text-caption text-error">
            Fehler: {{ lastPublishResult.error }}
          </div>
        </v-card-text>
      </v-card>

      <!-- Test Presets Section -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-content-save" class="mr-2" />
            Test-Presets
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="d-flex gap-2 mb-3">
              <v-btn color="primary" variant="tonal" size="small" @click="saveCurrentAsPreset">
                Aktuelle Konfiguration speichern
              </v-btn>
            </div>

            <div v-if="testPresets.length > 0">
              <div class="text-caption text-grey mb-2">Gespeicherte Presets:</div>
              <v-list density="compact">
                <v-list-item
                  v-for="preset in testPresets"
                  :key="preset.id"
                  :class="{ 'bg-primary-lighten-5': selectedPreset === preset.id }"
                >
                  <template #prepend>
                    <v-icon icon="mdi-content-save-outline" />
                  </template>
                  <v-list-item-title>{{ preset.name }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ formatRelativeTime(preset.timestamp) }} •
                    {{ preset.config.sensors.length }} Sensoren,
                    {{ preset.config.actuators.length }} Aktoren
                  </v-list-item-subtitle>
                  <template #append>
                    <v-btn
                      icon="mdi-content-copy"
                      variant="text"
                      size="small"
                      @click="loadPreset(preset)"
                    />
                    <v-btn
                      icon="mdi-delete"
                      variant="text"
                      size="small"
                      color="error"
                      @click="deletePreset(preset.id)"
                    />
                  </template>
                </v-list-item>
              </v-list>
            </div>
            <v-alert v-else type="info" variant="tonal" density="compact">
              Keine Test-Presets gespeichert. Speichern Sie Ihre aktuelle Konfiguration als Preset.
            </v-alert>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- ✅ ENTFERNT: Status Messages werden durch GlobalSnackbar ersetzt -->
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, reactive, onMounted, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatRelativeTime } from '@/utils/time'
import { storage } from '@/utils/storage'
import { buildTopic, validateSensorPayload } from '@/utils/mqttTopics'
import { handleError } from '@/utils/errorHandler'

export default defineComponent({
  name: 'DeviceSimulator',

  setup() {
    const centralDataHub = useCentralDataHub()
    const mqttStore = computed(() => centralDataHub.mqttStore)
    const espManagement = computed(() => centralDataHub.espManagement)

    const isSimulating = ref(false)
    const loading = ref(false)
    const lastUpdate = ref(null)
    const lastPublishResult = ref(null)

    // Test Presets Management
    const testPresets = ref([])
    const selectedPreset = ref(null)

    // Lade gespeicherte Presets
    onMounted(() => {
      const savedPresets = storage.load('debug_test_presets', [])
      testPresets.value = savedPresets
    })

    const saveCurrentAsPreset = () => {
      const preset = {
        id: Date.now(),
        name: `Test Setup ${testPresets.value.length + 1}`,
        timestamp: Date.now(),
        config: {
          espId: deviceConfig.espId,
          subzoneId: deviceConfig.subzoneId,
          sensors: [...deviceConfig.sensors],
          actuators: [...deviceConfig.actuators],
        },
      }

      testPresets.value.push(preset)
      storage.save('debug_test_presets', testPresets.value)
      window.$snackbar?.showSuccess('Test-Preset gespeichert')
    }

    const loadPreset = (preset) => {
      deviceConfig.espId = preset.config.espId
      deviceConfig.subzoneId = preset.config.subzoneId
      deviceConfig.sensors = [...preset.config.sensors]
      deviceConfig.actuators = [...preset.config.actuators]
      selectedPreset.value = preset.id
      window.$snackbar?.showSuccess(`Preset "${preset.name}" geladen`)
    }

    const deletePreset = (presetId) => {
      testPresets.value = testPresets.value.filter((p) => p.id !== presetId)
      storage.save('debug_test_presets', testPresets.value)
      window.$snackbar?.showSuccess('Preset gelöscht')
    }

    // ✅ KONSISTENT: Verwende bestehende GPIO-Konfiguration aus ESP Management
    const allowedGpios = computed(() => espManagement.value.getAvailablePins)

    // ✅ KONSISTENT: Verwende bestehende Sensor-Typen aus Devices Store
    const sensorTypes = [
      { title: 'Temperature (DS18B20)', value: 'SENSOR_TEMP_DS18B20' },
      { title: 'Soil Moisture', value: 'SENSOR_MOISTURE' },
      { title: 'Flow', value: 'SENSOR_FLOW' },
      { title: 'pH (DFRobot)', value: 'SENSOR_PH_DFROBOT' },
      { title: 'EC (Generic)', value: 'SENSOR_EC_GENERIC' },
      { title: 'Pressure', value: 'SENSOR_PRESSURE' },
      { title: 'CO2', value: 'SENSOR_CO2' },
      { title: 'Air Quality', value: 'SENSOR_AIR_QUALITY' },
    ]

    const actuatorTypes = [
      { title: 'Humidifier', value: 'humidifier' },
      { title: 'Valve', value: 'valve' },
      { title: 'Pump', value: 'pump' },
      { title: 'Relay', value: 'relay' },
      { title: 'Fan', value: 'fan' },
      { title: 'LED Strip', value: 'led_strip' },
      { title: 'Servo', value: 'servo' },
    ]

    const deviceConfig = reactive({
      espId: 'ESP32_SIM_001',
      subzoneId: 'zone1',
      sensors: [],
      actuators: [],
    })

    let simulationInterval = null

    // ✅ NEU: Topic-Konstruktion mit bestehenden Utilities
    const buildSensorTopic = (sensor) => {
      const kaiserId = mqttStore.value?.getKaiserId?.() || 'default_kaiser'
      return buildTopic(
        kaiserId,
        deviceConfig.espId,
        `subzone/${deviceConfig.subzoneId}/sensor/${sensor.gpio}/data`,
      )
    }

    const buildActuatorTopic = (actuator) => {
      const kaiserId = mqttStore.value?.getKaiserId?.() || 'default_kaiser'
      return buildTopic(kaiserId, deviceConfig.espId, `actuator/${actuator.gpio}/status`)
    }

    const addSensor = () => {
      deviceConfig.sensors.push({
        type: 'SENSOR_TEMP_DS18B20',
        gpio: allowedGpios.value[0],
        name: `Sensor ${deviceConfig.sensors.length + 1}`,
        value: 0,
      })
    }

    const removeSensor = (index) => {
      deviceConfig.sensors.splice(index, 1)
    }

    const addActuator = () => {
      deviceConfig.actuators.push({
        type: 'humidifier',
        gpio: allowedGpios.value[0],
        name: `Actuator ${deviceConfig.actuators.length + 1}`,
        state: false,
      })
    }

    const removeActuator = (index) => {
      deviceConfig.actuators.splice(index, 1)
    }

    const getSensorTypeLabel = (type) => {
      return sensorTypes.find((t) => t.value === type)?.title || type
    }

    const getActuatorTypeLabel = (type) => {
      return actuatorTypes.find((t) => t.value === type)?.title || type
    }

    const getSensorValueLabel = (type) => {
      const units = {
        SENSOR_TEMP_DS18B20: '°C',
        SENSOR_MOISTURE: '%',
        SENSOR_FLOW: 'L/min',
        SENSOR_PH_DFROBOT: 'pH',
        SENSOR_EC_GENERIC: 'µS/cm',
        SENSOR_PRESSURE: 'hPa',
        SENSOR_CO2: 'ppm',
        SENSOR_AIR_QUALITY: 'IAQ',
      }
      return `Value (${units[type] || ''})`
    }

    const isAnalogActuator = (type) => {
      return ['humidifier', 'pump', 'fan', 'led_strip', 'servo'].includes(type)
    }

    // ✅ KONSISTENT: Verwende bestehende MQTT Store Methoden
    // ✅ KORREKTUR: Server-kompatible Payload-Struktur
    const publishDeviceData = async () => {
      if (!mqttStore.value.canPerformMqttOperation()) {
        handleError(new Error('MQTT nicht verbunden oder nicht bereit'), {
          action: 'MQTT-Operation',
          espId: deviceConfig.espId,
        })
        return
      }

      try {
        lastUpdate.value = Date.now()
        lastPublishResult.value = null // Clear previous result

        const topics = []
        const errors = []

        // Publish sensor data
        for (const sensor of deviceConfig.sensors) {
          const topic = buildSensorTopic(sensor)

          // ✅ KORREKTUR: Flache Struktur für Server-Kompatibilität
          const payload = {
            esp_id: deviceConfig.espId,
            gpio: sensor.gpio,
            sensor_type: sensor.type,
            raw_data: sensor.value * 1000, // Simuliere Raw-Wert
            timestamp: Date.now(),
            // ✅ KONSISTENT: Backend v3.5.0 Felder
            raw_value: sensor.value * 1000,
            raw_mode: false,
            hardware_mode: false, // Simulator-Modus
            time_quality: 'good',
            iso_timestamp: new Date().toISOString(),
            subzone_id: deviceConfig.subzoneId,
            warnings: [],
          }

          // ✅ KORREKTUR: Verwende bestehende Validierung
          const validation = validateSensorPayload(payload)
          if (!validation.isValid) {
            errors.push({
              topic,
              error: `Validierungsfehler: ${validation.errors.join(', ')}`,
            })
            continue
          }

          try {
            await mqttStore.value.publish(topic, payload)
            topics.push({ topic, success: true })
          } catch (error) {
            errors.push({ topic, error: error.message })
          }
        }

        // Publish actuator data
        for (const actuator of deviceConfig.actuators) {
          const topic = buildActuatorTopic(actuator)
          const payload = {
            esp_id: deviceConfig.espId,
            gpio: actuator.gpio,
            actuator_type: actuator.type,
            state: actuator.state,
            timestamp: Date.now(),
          }

          try {
            await mqttStore.value.publish(topic, payload)
            topics.push({ topic, success: true })
          } catch (error) {
            errors.push({ topic, error: error.message })
          }
        }

        // ✅ KORREKTUR: Verwende bestehende Notification-Struktur
        if (errors.length > 0) {
          const errorMessage = `Fehler beim Publizieren: ${errors.length} von ${topics.length + errors.length} Topics fehlgeschlagen`
          window.$snackbar?.showError(errorMessage, { timeout: 8000 })
          lastPublishResult.value = { success: false, errors, topics }
        } else {
          window.$snackbar?.showSuccess(`Erfolgreich: ${topics.length} Topics publiziert`)
          lastPublishResult.value = { success: true, topics }
        }
      } catch (error) {
        // ✅ KORREKTUR: Verwende bestehende Error-Handler-Struktur
        handleError(error, {
          action: 'DeviceSimulator.publishDeviceData',
          espId: deviceConfig.espId,
          context: 'MQTT-Publish',
        })
        lastPublishResult.value = { success: false, error: error.message }
      }
    }

    const toggleSimulation = async () => {
      if (isSimulating.value) {
        clearInterval(simulationInterval)
        isSimulating.value = false
        window.$snackbar?.showInfo('Simulation stopped')
      } else {
        if (!mqttStore.value.canPerformMqttOperation()) {
          handleError(new Error('MQTT nicht verbunden oder nicht bereit'), {
            action: 'Simulation Start',
            espId: deviceConfig.espId,
          })
          return
        }

        loading.value = true
        try {
          await publishDeviceData()
          simulationInterval = setInterval(publishDeviceData, 5000)
          isSimulating.value = true
          window.$snackbar?.showSuccess('Simulation started')
        } catch (error) {
          handleError(error, {
            action: 'Simulation Start',
            espId: deviceConfig.espId,
            context: 'DeviceSimulator',
          })
        } finally {
          loading.value = false
        }
      }
    }

    // ✅ ENTFERNT: showNotification wird durch einheitliches Error-Handling ersetzt

    return {
      mqttStore,
      deviceConfig,
      isSimulating,
      loading,
      lastUpdate,
      lastPublishResult,
      allowedGpios,
      sensorTypes,
      actuatorTypes,
      addSensor,
      removeSensor,
      addActuator,
      removeActuator,
      getSensorTypeLabel,
      getActuatorTypeLabel,
      getSensorValueLabel,
      isAnalogActuator,
      toggleSimulation,
      formatRelativeTime,
      testPresets,
      selectedPreset,
      saveCurrentAsPreset,
      loadPreset,
      deletePreset,
      buildSensorTopic,
      buildActuatorTopic,
    }
  },
})
</script>
