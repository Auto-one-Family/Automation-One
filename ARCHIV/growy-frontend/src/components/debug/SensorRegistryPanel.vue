<template>
  <div class="space-y-6">
    <div class="bg-white shadow rounded-lg p-6">
      <h2 class="text-lg font-semibold mb-4">
        <slot name="title">
          {{ getTitle() }}
        </slot>
      </h2>

      <!-- Registry Statistics -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-blue-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-blue-600">{{ sensorStats.total }}</div>
          <div class="text-sm text-blue-600">Total Sensors</div>
        </div>
        <div class="bg-green-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-green-600">{{ sensorStats.active }}</div>
          <div class="text-sm text-green-600">Active Sensors</div>
        </div>
        <div class="bg-red-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-red-600">{{ sensorStats.inactive }}</div>
          <div class="text-sm text-red-600">Inactive Sensors</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-gray-600">
            {{ Object.keys(sensorStats.byType).length }}
          </div>
          <div class="text-sm text-gray-600">Sensor Types</div>
        </div>
      </div>

      <!-- Actions - nur anzeigen wenn showActions=true -->
      <div v-if="showActions" class="flex space-x-4 mb-6">
        <v-btn
          color="primary"
          variant="tonal"
          @click="restoreSensors"
          :loading="sensorRegistry.loading"
        >
          Restore from Storage
        </v-btn>
        <v-btn
          color="warning"
          variant="tonal"
          @click="clearRegistry"
          :loading="sensorRegistry.loading"
        >
          Clear Registry
        </v-btn>
        <v-btn color="info" variant="tonal" @click="exportRegistry"> Export Data </v-btn>
      </div>

      <!-- Sensor Type Filter - nur anzeigen wenn nicht ESP-spezifisch -->
      <div v-if="!espId" class="mb-4">
        <v-select
          v-model="selectedSensorType"
          label="Filter by Sensor Type"
          :items="sensorTypeOptions"
          item-title="label"
          item-value="value"
          variant="outlined"
          density="comfortable"
          clearable
        />
      </div>

      <!-- ESP Filter - nur anzeigen wenn nicht ESP-spezifisch -->
      <div v-if="!espId" class="mb-4">
        <v-select
          v-model="selectedEspId"
          label="Feld-Gerät Filter"
          :items="espDeviceOptions"
          item-title="label"
          item-value="value"
          variant="outlined"
          density="comfortable"
          clearable
        />
      </div>

      <!-- Sensors Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th
                v-if="!espId"
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                ESP-ID
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                GPIO
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Subzone
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Type
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Name
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Value
              </th>
              <!-- 🆕 NEU: Backend v3.5.0 Spalten -->
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Raw Value
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Mode
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Warnings
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Time Quality
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Last Update
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                v-if="showActions"
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="sensor in filteredSensors" :key="sensor.id">
              <td
                v-if="!espId"
                class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"
              >
                {{ sensor.espId }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                GPIO {{ sensor.gpio }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ sensor.subzoneId || 'N/A' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <v-chip size="small" variant="tonal" color="primary">
                  {{ sensor.type }}
                </v-chip>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ sensor.name }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <span :class="getValueColor(sensor)">
                  {{ formatValue(sensor) }}
                </span>
              </td>
              <!-- 🆕 NEU: Backend v3.5.0 Zellen -->
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ sensor.raw_value || '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <div class="flex flex-col gap-1">
                  <v-chip
                    v-if="sensor.raw_mode !== undefined"
                    :color="sensor.raw_mode ? 'info' : 'grey'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ sensor.raw_mode ? 'RAW' : 'PROC' }}
                  </v-chip>
                  <v-chip
                    v-if="sensor.hardware_mode !== undefined"
                    :color="sensor.hardware_mode ? 'success' : 'warning'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ sensor.hardware_mode ? 'HW' : 'SIM' }}
                  </v-chip>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <div
                  v-if="sensor.warnings && sensor.warnings.length > 0"
                  class="flex flex-wrap gap-1"
                >
                  <v-chip
                    v-for="warning in sensor.warnings"
                    :key="warning"
                    :color="getWarningColor(warning)"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ warning }}
                  </v-chip>
                </div>
                <span v-else class="text-green-600">OK</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <v-chip
                  v-if="sensor.time_quality"
                  :color="getTimeQualityColor(sensor.time_quality)"
                  size="x-small"
                  variant="tonal"
                >
                  {{ sensor.time_quality }}
                </v-chip>
                <span v-else>—</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatLastUpdate(sensor.lastUpdate) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <v-chip :color="getSensorStatusColor(sensor)" size="small" variant="tonal">
                  {{ getStatusText(sensor) }}
                </v-chip>
              </td>
              <td v-if="showActions" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <v-btn
                  icon="mdi-delete"
                  size="small"
                  variant="text"
                  color="error"
                  @click="removeSensor(sensor.espId, sensor.gpio)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- No sensors message -->
      <div v-if="filteredSensors.length === 0" class="text-center py-8 text-gray-500">
        {{ getNoSensorsMessage() }}
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useStatusHandling } from '@/composables/useStatusHandling'
import { formatRelativeTime } from '@/utils/time'

export default defineComponent({
  name: 'SensorRegistryPanel',

  /**
   * @prop {String|null} espId - Optional. Zeigt nur Sensoren dieses ESP.
   * @prop {Boolean} showActions - Optional. Blendet Debug-Funktionen ein/aus.
   */
  props: {
    espId: {
      type: String,
      default: null,
    },
    showActions: {
      type: Boolean,
      default: true,
    },
  },

  setup(props) {
    const centralDataHub = useCentralDataHub()
    const sensorRegistry = computed(() => centralDataHub.sensorRegistry)
    const mqttStore = computed(() => centralDataHub.mqttStore)

    // ✅ NEUE STATUS-LOGIK VERWENDEN
    const { getStatusColor } = useStatusHandling()

    const selectedSensorType = ref(null)
    const selectedEspId = ref(null)

    // Computed properties
    const sensorStats = computed(() => {
      if (props.espId) {
        // ESP-spezifische Statistiken
        const espSensors = sensorRegistry.value.getSensorsByEsp(props.espId)
        const active = espSensors.filter((s) => {
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
          return s.lastUpdate && s.lastUpdate > fiveMinutesAgo
        }).length

        return {
          total: espSensors.length,
          active,
          inactive: espSensors.length - active,
          byType: {},
          byEsp: {},
        }
      }
      return sensorRegistry.value.getSensorStats
    })

    const sensorTypeOptions = computed(() => {
      const types = Object.keys(sensorStats.value.byType)
      return types.map((type) => ({
        label: type,
        value: type,
      }))
    })

    const espDeviceOptions = computed(() => {
      const esps = Object.keys(sensorStats.value.byEsp)
      return esps.map((espId) => ({
        label: espId,
        value: espId,
      }))
    })

    const filteredSensors = computed(() => {
      let sensors = props.espId
        ? sensorRegistry.value.getSensorsByEsp(props.espId)
        : sensorRegistry.value.getAllSensors

      if (selectedSensorType.value) {
        sensors = sensors.filter((sensor) => sensor.type === selectedSensorType.value)
      }

      if (selectedEspId.value && !props.espId) {
        sensors = sensors.filter((sensor) => sensor.espId === selectedEspId.value)
      }

      return sensors.sort((a, b) => b.lastUpdate - a.lastUpdate)
    })

    // Methods
    const getTitle = () => {
      if (props.espId) {
        return `ESP ${props.espId} - Sensoren`
      }
      return 'Sensor Registry Debug Panel'
    }

    const getNoSensorsMessage = () => {
      if (props.espId) {
        return `Keine Sensoren für ESP ${props.espId} gefunden`
      }
      return 'No sensors found in registry'
    }

    const formatValue = (sensor) => {
      if (sensor.value === null || sensor.value === undefined) return 'N/A'
      return `${sensor.value.toFixed(1)}${sensor.unit ? ` ${sensor.unit}` : ''}`
    }

    const formatLastUpdate = (timestamp) => {
      if (!timestamp) return 'Never'
      return formatRelativeTime(timestamp)
    }

    const getValueColor = (sensor) => {
      if (sensor.value === null || sensor.value === undefined) return 'text-gray-400'

      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      if (sensor.lastUpdate < fiveMinutesAgo) return 'text-gray-400'

      return 'text-gray-900'
    }

    // ✅ BESTEHENDE FUNKTION ERSETZEN (Zeile 382-386)
    const getSensorStatusColor = (sensor) => {
      return getStatusColor(sensor, 'sensor') // Context: 'sensor'
    }

    const getStatusText = (sensor) => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      if (!sensor.lastUpdate || sensor.lastUpdate < fiveMinutesAgo) return 'Inactive'
      return 'Active'
    }

    // 🆕 NEU: Warning-Farbe basierend auf Warning-Typ
    const getWarningColor = (warning) => {
      const colors = {
        sensor_disconnected: 'error',
        processing_failed: 'error',
        raw_value_out_of_range: 'warning',
        library_not_loaded: 'info',
      }
      return colors[warning] || 'grey'
    }

    // 🆕 NEU: Zeitqualität-Farbe
    const getTimeQualityColor = (quality) => {
      const colors = {
        good: 'success',
        poor: 'warning',
        unknown: 'grey',
      }
      return colors[quality] || 'grey'
    }

    const restoreSensors = async () => {
      try {
        sensorRegistry.value.restoreSensors()
        window.$snackbar?.showSuccess('Sensor registry restored from storage')
      } catch (error) {
        console.error('Failed to restore sensors:', error)
        window.$snackbar?.showError('Failed to restore sensor registry')
      }
    }

    const clearRegistry = async () => {
      if (confirm('Are you sure you want to clear the entire sensor registry?')) {
        try {
          sensorRegistry.value.clearRegistry()
          window.$snackbar?.showSuccess('Sensor registry cleared')
        } catch (error) {
          console.error('Failed to clear registry:', error)
          window.$snackbar?.showError('Failed to clear sensor registry')
        }
      }
    }

    const removeSensor = async (espId, gpio) => {
      if (confirm(`Remove sensor GPIO ${gpio} from ESP ${espId}?`)) {
        try {
          sensorRegistry.value.removeSensor(espId, gpio)
          window.$snackbar?.showSuccess('Sensor removed from registry')
        } catch (error) {
          console.error('Failed to remove sensor:', error)
          window.$snackbar?.showError('Failed to remove sensor')
        }
      }
    }

    const exportRegistry = () => {
      const data = {
        sensors: Array.from(sensorRegistry.value.sensors.entries()),
        stats: sensorStats.value,
        exportTime: new Date().toISOString(),
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sensor-registry-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      window.$snackbar?.showSuccess('Sensor registry exported')
    }

    return {
      sensorRegistry,
      mqttStore,
      selectedSensorType,
      selectedEspId,
      sensorStats,
      sensorTypeOptions,
      espDeviceOptions,
      filteredSensors,
      getTitle,
      getNoSensorsMessage,
      formatValue,
      formatLastUpdate,
      getValueColor,
      getSensorStatusColor,
      getStatusText,
      getWarningColor,
      getTimeQualityColor,
      restoreSensors,
      clearRegistry,
      removeSensor,
      exportRegistry,
    }
  },
})
</script>
