<template>
  <div
    class="sensor-visualization"
    @mouseenter="handleHover"
    @mouseleave="handleHoverLeave"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    :class="{ 'hover-active': isHovered }"
  >
    <!-- 🚨 NEU: Alert-Indikator -->
    <div v-if="hasActiveAlert" class="alert-indicator">
      <v-icon :icon="getAlertIcon()" :color="getAlertColor()" size="small" class="alert-icon" />
      <v-tooltip location="top">
        <template #activator="{ props }">
          <div v-bind="props" class="alert-badge">
            {{ getAlertMessage() }}
          </div>
        </template>
        <template #default>
          <div class="text-center">
            <div class="font-weight-medium">{{ getAlertTypeName() }}</div>
            <div class="text-caption">{{ getAlertMessage() }}</div>
            <div class="text-caption">{{ formatTimeAgo(activeAlert.timestamp) }}</div>
          </div>
        </template>
      </v-tooltip>
    </div>

    <!-- Kompakte Standard-Anzeige -->
    <div v-if="!isHovered" class="compact-display">
      <div class="text-lg font-bold" :class="getValueColor()">
        {{ formatValue(sensor.value) }}
      </div>
      <div class="text-xs text-gray-500 mt-1">
        {{ sensor.name }}
      </div>
    </div>

    <!-- 🆕 NEU: Intelligente Hover-Positionierung -->
    <div v-else class="expanded-display" :style="getHoverPosition()" ref="hoverContainer">
      <!-- Visualisierungstyp-Auswahl -->
      <div class="visualization-controls mb-3">
        <v-select
          v-model="selectedType"
          :items="availableTypes"
          item-title="name"
          item-value="value"
          density="compact"
          hide-details
          variant="outlined"
          size="small"
          @update:model-value="onTypeChange"
        />
      </div>

      <!-- Line Chart -->
      <div v-if="selectedType === 'line'" class="line-chart">
        <canvas ref="lineChartCanvas" width="300" height="150"></canvas>
      </div>

      <!-- Gauge Chart -->
      <div v-else-if="selectedType === 'gauge'" class="gauge-chart">
        <div class="gauge-container">
          <div class="gauge-value">{{ formatValue(sensor.value) }}</div>
          <div class="gauge-meter">
            <div
              class="gauge-fill"
              :style="{ width: getGaugePercentage() + '%' }"
              :class="getGaugeColor()"
            ></div>
          </div>
          <div class="gauge-labels">
            <span>{{ getGaugeMin() }}</span>
            <span>{{ getGaugeMax() }}</span>
          </div>
        </div>
      </div>

      <!-- Status Indicator -->
      <div v-else-if="selectedType === 'status'" class="status-indicator">
        <v-chip :color="getStatusColor()" size="small" variant="tonal" class="status-chip">
          <v-icon :icon="getStatusIcon()" size="small" class="mr-1" />
          {{ getStatusText() }}
        </v-chip>
      </div>

      <!-- Bar Chart -->
      <div v-else-if="selectedType === 'bar'" class="bar-chart">
        <canvas ref="barChartCanvas" width="300" height="150"></canvas>
      </div>

      <!-- Default Value Display -->
      <div v-else class="default-display">
        <div class="text-2xl font-bold" :class="getValueColor()">
          {{ formatValue(sensor.value) }}
        </div>
      </div>

      <!-- Sensor-Details -->
      <div class="sensor-details mt-3">
        <div class="text-xs text-gray-600">
          <div>ESP: {{ sensor.espId }}</div>
          <div>GPIO: {{ sensor.gpio }}</div>
          <div v-if="sensor.lastUpdate">
            Letztes Update: {{ formatLastUpdate(sensor.lastUpdate) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

export default defineComponent({
  name: 'SensorVisualization',

  props: {
    sensor: {
      type: Object,
      required: true,
    },
    showTypeSelector: {
      type: Boolean,
      default: false,
    },
    timeRange: {
      type: String,
      default: '1hour',
    },
  },

  setup(props) {
    const centralDataHub = useCentralDataHub()
    const dashboardStore = computed(() => centralDataHub.dashboardGenerator)
    const selectedType = ref('line')
    const isHovered = ref(false)
    const lineChartCanvas = ref(null)
    const barChartCanvas = ref(null)
    const hoverContainer = ref(null)

    // Verfügbare Visualisierungstypen
    const availableTypes = computed(() => {
      const types = dashboardStore.value.getAvailableVisualizationsForSensor(props.sensor.type)
      return types.map((type) => ({
        value: type,
        name: dashboardStore.value.getVisualizationTypeLabel(type),
      }))
    })

    // Standard-Typ laden
    onMounted(() => {
      const defaultType = dashboardStore.value.getDefaultVisualizationForSensor(props.sensor.type)
      const savedType = dashboardStore.value.activeVisualizations.perSensor.get(
        `${props.sensor.espId}-${props.sensor.gpio}`,
      )
      selectedType.value = savedType || defaultType
    })

    // Visualisierungstyp ändern
    const onTypeChange = (newType) => {
      dashboardStore.value.setSensorVisualization(props.sensor.espId, props.sensor.gpio, newType)
    }

    // ✅ NEU: Intelligente Positionierung
    const getHoverPosition = () => {
      if (!hoverContainer.value) return {}

      const rect = hoverContainer.value.getBoundingClientRect()
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      }

      // Berechne optimale Position
      let left = '100%'
      let top = '0'
      let marginLeft = '12px'
      let right = undefined
      let bottom = undefined
      let marginRight = undefined

      // Prüfe rechten Rand
      if (rect.right + 320 > viewport.width) {
        left = 'auto'
        right = '100%'
        marginLeft = '0'
        marginRight = '12px'
      }

      // Prüfe unteren Rand
      if (rect.bottom + 200 > viewport.height) {
        top = 'auto'
        bottom = '0'
      }

      return {
        left,
        top,
        right,
        bottom,
        marginLeft,
        marginRight,
      }
    }

    // ✅ NEU: Touch-Unterstützung
    const handleTouchStart = () => {
      isHovered.value = true
    }

    const handleTouchEnd = () => {
      setTimeout(() => {
        isHovered.value = false
      }, 2000) // 2 Sekunden Anzeige bei Touch
    }

    // Hover-Handler
    const handleHover = () => {
      isHovered.value = true
    }
    const handleHoverLeave = () => {
      isHovered.value = false
    }

    // Hilfsfunktionen (wie gehabt)
    const formatValue = (value) => {
      if (!value || isNaN(Number(value))) return '—'
      if (props.sensor.type === 'SENSOR_CUSTOM_PI_ENHANCED') {
        if (props.sensor.rawData && Array.isArray(props.sensor.rawData)) {
          return props.sensor.rawData
            .slice(0, 3)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ')
        }
        return 'Raw Data'
      }
      const units = {
        SENSOR_TEMP_DS18B20: '°C',
        SENSOR_MOISTURE: '%',
        SENSOR_FLOW: 'L/min',
        SENSOR_PH_DFROBOT: 'pH',
        SENSOR_EC_GENERIC: 'µS/cm',
        SENSOR_PRESSURE: 'hPa',
        SENSOR_CO2: 'ppm',
        SENSOR_AIR_QUALITY: 'AQI',
        SENSOR_LIGHT: 'lux',
        SENSOR_LEVEL: 'cm',
      }
      const unit = units[props.sensor.type] || ''
      const numValue = Number(value)
      return `${numValue.toFixed(1)}${unit}`
    }

    const getValueColor = () => {
      if (!props.sensor?.value) return 'text-gray-400'
      const value = Number(props.sensor.value)
      const group = dashboardStore.value.getSensorGroupKey(props.sensor.type)
      if (group) {
        const ranges = dashboardStore.value.sensorGroups[group].criticalRanges
        for (const range of ranges) {
          if (value >= range.min && value <= range.max) {
            return `text-${range.color}-600`
          }
        }
      }
      return 'text-gray-900'
    }

    // Gauge-spezifische Funktionen
    const getGaugePercentage = () => {
      if (!props.sensor?.value) return 0
      const value = Number(props.sensor.value)
      const group = dashboardStore.value.getSensorGroupKey(props.sensor.type)
      if (!group) return 50

      const config = dashboardStore.value.sensorGroups[group].visualization.chartOptions.gauge
      const range = config.max - config.min
      return Math.min(100, Math.max(0, ((value - config.min) / range) * 100))
    }

    const getGaugeColor = () => {
      const percentage = getGaugePercentage()
      if (percentage < 33) return 'bg-success'
      if (percentage < 66) return 'bg-warning'
      return 'bg-error'
    }

    const getGaugeMin = () => {
      const group = dashboardStore.value.getSensorGroupKey(props.sensor.type)
      if (!group) return '0'
      const config = dashboardStore.value.sensorGroups[group].visualization.chartOptions.gauge
      return config.min
    }

    const getGaugeMax = () => {
      const group = dashboardStore.value.getSensorGroupKey(props.sensor.type)
      if (!group) return '100'
      const config = dashboardStore.value.sensorGroups[group].visualization.chartOptions.gauge
      return config.max
    }

    // Status-spezifische Funktionen
    const getStatusColor = () => {
      const value = Number(props.sensor.value || 0)
      const group = dashboardStore.value.getSensorGroupKey(props.sensor.type)
      if (!group) return 'grey'

      const ranges = dashboardStore.value.sensorGroups[group].criticalRanges
      for (const range of ranges) {
        if (value >= range.min && value <= range.max) {
          return range.color
        }
      }
      return 'grey'
    }

    const getStatusIcon = () => {
      const color = getStatusColor()
      const icons = {
        success: 'mdi-check-circle',
        warning: 'mdi-alert-circle',
        error: 'mdi-close-circle',
        grey: 'mdi-help-circle',
      }
      return icons[color] || 'mdi-help-circle'
    }

    const getStatusText = () => {
      const value = Number(props.sensor.value || 0)
      const group = dashboardStore.value.getSensorGroupKey(props.sensor.type)
      if (!group) return 'Unbekannt'

      const ranges = dashboardStore.value.sensorGroups[group].criticalRanges
      for (const range of ranges) {
        if (value >= range.min && value <= range.max) {
          switch (range.color) {
            case 'success':
              return 'Normal'
            case 'warning':
              return 'Warnung'
            case 'error':
              return 'Kritisch'
            default:
              return 'Unbekannt'
          }
        }
      }
      return 'Unbekannt'
    }

    const formatLastUpdate = (timestamp) => {
      if (!timestamp) return 'Unbekannt'
      const now = Date.now()
      const diff = now - timestamp
      const minutes = Math.floor(diff / 60000)
      if (minutes < 1) return 'Gerade eben'
      if (minutes < 60) return `${minutes} Min.`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours} Std.`
      const days = Math.floor(hours / 24)
      return `${days} Tage`
    }

    // ✅ NEU: Alert-System Integration
    const hasActiveAlert = computed(() => {
      const alertKey = `${props.sensor.espId}-${props.sensor.gpio}`
      return dashboardStore.value.alertSystem.activeAlerts.has(alertKey)
    })

    const activeAlert = computed(() => {
      const alertKey = `${props.sensor.espId}-${props.sensor.gpio}`
      return dashboardStore.value.alertSystem.activeAlerts.get(alertKey)
    })

    const getAlertIcon = () => {
      if (!activeAlert.value) return 'mdi-alert'
      return (
        dashboardStore.value.alertSystem.alertTypes[activeAlert.value.type]?.icon || 'mdi-alert'
      )
    }

    const getAlertColor = () => {
      if (!activeAlert.value) return 'grey'
      return dashboardStore.value.alertSystem.alertTypes[activeAlert.value.type]?.color || 'grey'
    }

    const getAlertTypeName = () => {
      if (!activeAlert.value) return ''
      return (
        dashboardStore.value.alertSystem.alertTypes[activeAlert.value.type]?.name ||
        activeAlert.value.type
      )
    }

    const getAlertMessage = () => {
      if (!activeAlert.value) return ''
      return activeAlert.value.data?.message || 'Alert aktiv'
    }

    const formatTimeAgo = (timestamp) => {
      return dashboardStore.value.formatTimeAgo(timestamp)
    }

    return {
      selectedType,
      availableTypes,
      isHovered,
      lineChartCanvas,
      barChartCanvas,
      hoverContainer,
      onTypeChange,
      handleHover,
      handleHoverLeave,
      handleTouchStart,
      handleTouchEnd,
      getHoverPosition,
      formatValue,
      getValueColor,
      getGaugePercentage,
      getGaugeColor,
      getGaugeMin,
      getGaugeMax,
      getStatusColor,
      getStatusIcon,
      getStatusText,
      formatLastUpdate,
      // ✅ NEU: Alert-System Integration
      hasActiveAlert,
      activeAlert,
      getAlertIcon,
      getAlertColor,
      getAlertTypeName,
      getAlertMessage,
      formatTimeAgo,
    }
  },
})
</script>

<style scoped>
.sensor-visualization {
  position: relative;
  transition: all 0.3s ease;
  border-radius: 8px;
  overflow: hidden;
}

/* 🚨 NEU: Alert-Indikator Styles */
.alert-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
}

.alert-icon {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  padding: 2px;
}

.alert-badge {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: help;
}

.sensor-visualization:hover {
  transform: scale(1.02);
}

.compact-display {
  text-align: center;
  padding: 0.5rem;
}

/* ✅ NEU: Verbesserte Hover-Positionierung */
.expanded-display {
  position: absolute;
  min-width: 320px;
  max-width: 420px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  padding: 1rem;
  z-index: 1000;
  transition: all 0.3s ease;
}

/* ✅ NEU: Touch-Optimierung */
@media (max-width: 768px) {
  .expanded-display {
    position: fixed;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-width: 400px;
    margin: 0;
  }
}

.visualization-controls {
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 0.5rem;
}

.line-chart,
.bar-chart {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fafafa;
}

.gauge-container {
  text-align: center;
  padding: 1rem;
}

.gauge-value {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.gauge-meter {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.gauge-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.gauge-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #666;
}

.status-indicator {
  text-align: center;
  padding: 1rem;
}

.status-chip {
  font-size: 1rem;
}

.default-display {
  text-align: center;
  padding: 1rem;
}

.sensor-details {
  border-top: 1px solid #e0e0e0;
  padding-top: 0.5rem;
  font-size: 0.75rem;
  color: #666;
}

.hover-active {
  z-index: 1001;
}
</style>
