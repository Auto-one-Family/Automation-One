<template>
  <div class="warning-configuration-panel">
    <v-card variant="outlined">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-alert-circle" class="mr-2" />
        Warning Configuration
      </v-card-title>
      <v-card-text>
        <v-alert type="info" variant="tonal" density="compact" class="mb-4" icon="mdi-information">
          <strong>Backend v3.5.0 Warning System:</strong>
          Konfigurieren Sie Warning-Einstellungen für Sensoren. Warnings werden automatisch erkannt
          und im UI angezeigt.
        </v-alert>

        <!-- Warning Statistics -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-red-50 p-4 rounded-lg">
            <div class="text-2xl font-bold text-red-600">{{ warningStats.total }}</div>
            <div class="text-sm text-red-600">Total Warnings</div>
          </div>
          <div class="bg-orange-50 p-4 rounded-lg">
            <div class="text-2xl font-bold text-orange-600">
              {{ warningStats.byWarningType.sensor_disconnected || 0 }}
            </div>
            <div class="text-sm text-orange-600">Disconnected</div>
          </div>
          <div class="bg-yellow-50 p-4 rounded-lg">
            <div class="text-2xl font-bold text-yellow-600">
              {{ warningStats.byWarningType.raw_value_out_of_range || 0 }}
            </div>
            <div class="text-sm text-yellow-600">Out of Range</div>
          </div>
          <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-2xl font-bold text-blue-600">
              {{ warningStats.byWarningType.library_not_loaded || 0 }}
            </div>
            <div class="text-sm text-blue-600">Library Issues</div>
          </div>
        </div>

        <!-- Warning Configuration -->
        <v-expansion-panels variant="accordion" class="mb-4">
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon icon="mdi-cog" class="mr-2" />
              Warning Settings
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-row>
                <v-col cols="12" md="6">
                  <v-switch
                    v-model="warningConfig.sensor_disconnected_enabled"
                    label="Sensor Disconnected Warnings"
                    color="error"
                    hide-details
                  />
                  <v-text-field
                    v-model="warningConfig.sensor_disconnected_threshold"
                    label="Disconnected Threshold (raw_value)"
                    type="number"
                    variant="outlined"
                    density="comfortable"
                    class="mt-2"
                    hint="Raw value below this threshold triggers disconnected warning"
                    persistent-hint
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-switch
                    v-model="warningConfig.raw_value_out_of_range_enabled"
                    label="Raw Value Out of Range Warnings"
                    color="warning"
                    hide-details
                  />
                  <v-text-field
                    v-model="warningConfig.raw_value_range_min"
                    label="Min Raw Value"
                    type="number"
                    variant="outlined"
                    density="comfortable"
                    class="mt-2"
                  />
                  <v-text-field
                    v-model="warningConfig.raw_value_range_max"
                    label="Max Raw Value"
                    type="number"
                    variant="outlined"
                    density="comfortable"
                    class="mt-2"
                  />
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>

          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon icon="mdi-clock" class="mr-2" />
              Time Quality Settings
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-row>
                <v-col cols="12" md="6">
                  <v-switch
                    v-model="warningConfig.time_quality_enabled"
                    label="Time Quality Monitoring"
                    color="info"
                    hide-details
                  />
                  <v-select
                    v-model="warningConfig.time_quality_threshold"
                    label="Time Quality Threshold"
                    :items="timeQualityOptions"
                    item-title="label"
                    item-value="value"
                    variant="outlined"
                    density="comfortable"
                    class="mt-2"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="warningConfig.time_quality_timeout"
                    label="Time Quality Timeout (ms)"
                    type="number"
                    variant="outlined"
                    density="comfortable"
                    hint="Timeout for time quality assessment"
                    persistent-hint
                  />
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <!-- Warning Actions -->
        <div class="flex space-x-4 mb-4">
          <v-btn color="primary" variant="tonal" @click="saveWarningConfig" :loading="loading">
            Save Configuration
          </v-btn>
          <v-btn color="secondary" variant="tonal" @click="resetWarningConfig">
            Reset to Defaults
          </v-btn>
          <v-btn color="info" variant="tonal" @click="exportWarningConfig"> Export Config </v-btn>
        </div>

        <!-- Warning Test -->
        <v-card variant="tonal" class="mb-4">
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-test-tube" class="mr-2" />
            Warning Test
          </v-card-title>
          <v-card-text>
            <v-alert
              type="info"
              variant="tonal"
              density="compact"
              class="mb-3"
              icon="mdi-information"
            >
              <strong>Test Warnings:</strong>
              Generieren Sie Test-Warnings um das Warning-System zu validieren.
            </v-alert>

            <div class="flex space-x-4">
              <v-btn
                color="error"
                variant="tonal"
                @click="generateTestWarning('sensor_disconnected')"
                :disabled="!mqttStore.value.isConnected"
              >
                Test Disconnected
              </v-btn>
              <v-btn
                color="warning"
                variant="tonal"
                @click="generateTestWarning('raw_value_out_of_range')"
                :disabled="!mqttStore.value.isConnected"
              >
                Test Out of Range
              </v-btn>
              <v-btn
                color="info"
                variant="tonal"
                @click="generateTestWarning('library_not_loaded')"
                :disabled="!mqttStore.value.isConnected"
              >
                Test Library Issue
              </v-btn>
              <v-btn
                color="success"
                variant="tonal"
                @click="clearAllWarnings"
                :disabled="!mqttStore.value.isConnected"
              >
                Clear All Warnings
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { storage } from '@/utils/storage'

export default defineComponent({
  name: 'WarningConfigurationPanel',

  setup() {
    const centralDataHub = useCentralDataHub()
    const sensorRegistry = computed(() => centralDataHub.sensorRegistry)
    const mqttStore = computed(() => centralDataHub.mqttStore)
    const loading = ref(false)

    // Warning configuration
    const warningConfig = ref({
      sensor_disconnected_enabled: true,
      sensor_disconnected_threshold: 0,
      raw_value_out_of_range_enabled: true,
      raw_value_range_min: 0,
      raw_value_range_max: 4095,
      time_quality_enabled: true,
      time_quality_threshold: 'poor',
      time_quality_timeout: 5000,
    })

    // Time quality options
    const timeQualityOptions = [
      { label: 'Good', value: 'good' },
      { label: 'Poor', value: 'poor' },
      { label: 'Unknown', value: 'unknown' },
    ]

    // Computed properties
    const warningStats = computed(() => {
      return sensorRegistry.value.getWarningStats
    })

    // Methods
    const saveWarningConfig = async () => {
      try {
        loading.value = true
        storage.save('warning_config', warningConfig.value)
        window.$snackbar?.showSuccess('Warning configuration saved')
      } catch (error) {
        console.error('Failed to save warning config:', error)
        window.$snackbar?.showError('Failed to save warning configuration')
      } finally {
        loading.value = false
      }
    }

    const resetWarningConfig = () => {
      if (confirm('Reset warning configuration to defaults?')) {
        warningConfig.value = {
          sensor_disconnected_enabled: true,
          sensor_disconnected_threshold: 0,
          raw_value_out_of_range_enabled: true,
          raw_value_range_min: 0,
          raw_value_range_max: 4095,
          time_quality_enabled: true,
          time_quality_threshold: 'poor',
          time_quality_timeout: 5000,
        }
        storage.save('warning_config', warningConfig.value)
        window.$snackbar?.showSuccess('Warning configuration reset to defaults')
      }
    }

    const exportWarningConfig = () => {
      const data = {
        config: warningConfig.value,
        stats: warningStats.value,
        exportTime: new Date().toISOString(),
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `warning-config-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      window.$snackbar?.showSuccess('Warning configuration exported')
    }

    const generateTestWarning = async (warningType) => {
      try {
        const testPayload = {
          esp_id: 'test_esp',
          gpio: 21,
          type: 'SENSOR_TEMP_DS18B20',
          value: 23.5,
          raw_value: warningType === 'sensor_disconnected' ? 0 : 2156,
          raw_mode: true,
          hardware_mode: true,
          warnings: [warningType],
          time_quality: 'poor',
          timestamp: Date.now(),
          iso_timestamp: new Date().toISOString(),
        }

        const topic = `kaiser/${mqttStore.value?.getKaiserId?.() || 'default_kaiser'}/esp/test_esp/test_payload_${warningType}`
        await mqttStore.value.publish(topic, testPayload)

        window.$snackbar?.showSuccess(`Test warning '${warningType}' generated`)
      } catch (error) {
        console.error('Failed to generate test warning:', error)
        window.$snackbar?.showError('Failed to generate test warning')
      }
    }

    const clearAllWarnings = async () => {
      try {
        // Clear warnings from all sensors
        const sensors = sensorRegistry.value.getAllSensors
        sensors.forEach((sensor) => {
          if (sensor.warnings && sensor.warnings.length > 0) {
            sensor.warnings = []
            sensorRegistry.value.updateSensorData(sensor.espId, sensor.gpio, sensor)
          }
        })

        window.$snackbar?.showSuccess('All warnings cleared')
      } catch (error) {
        console.error('Failed to clear warnings:', error)
        window.$snackbar?.showError('Failed to clear warnings')
      }
    }

    // Load configuration on mount
    onMounted(() => {
      const savedConfig = storage.load('warning_config', null)
      if (savedConfig) {
        warningConfig.value = { ...warningConfig.value, ...savedConfig }
      }
    })

    return {
      sensorRegistry,
      mqttStore,
      loading,
      warningConfig,
      timeQualityOptions,
      warningStats,
      saveWarningConfig,
      resetWarningConfig,
      exportWarningConfig,
      generateTestWarning,
      clearAllWarnings,
    }
  },
})
</script>

<style scoped>
.warning-configuration-panel {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
