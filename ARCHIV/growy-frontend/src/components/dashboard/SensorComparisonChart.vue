<template>
  <div class="sensor-comparison-chart">
    <!-- Chart Header mit Tooltips -->
    <div class="chart-header mb-4">
      <div class="d-flex align-center justify-space-between">
        <div class="d-flex align-center">
          <v-icon icon="mdi-chart-multiline" class="mr-2" color="primary" />
          <span class="text-h6">Sensor-Vergleich</span>

          <!-- 🆕 NEU: Erklärender Tooltip -->
          <v-tooltip location="top">
            <template v-slot:activator="{ props }">
              <v-icon v-bind="props" icon="mdi-help-circle-outline" size="small" class="ml-2" />
            </template>
            <div class="text-center">
              <div class="font-weight-medium">Sensor-Vergleich</div>
              <div class="text-caption">
                Zeigt die Werte von {{ sensors.length }} Sensoren im Zeitverlauf an.
                {{ getChartDescription() }}
              </div>
            </div>
          </v-tooltip>

          <v-chip
            v-if="sensors.length"
            :color="getComparisonStatusColor()"
            size="small"
            class="ml-2"
          >
            {{ sensors.length }} Sensoren
          </v-chip>
        </div>

        <!-- Chart Type Selector mit Tooltips -->
        <v-select
          v-model="selectedChartType"
          :items="availableChartTypes"
          item-title="name"
          item-value="value"
          density="compact"
          hide-details
          variant="outlined"
          size="small"
          style="max-width: 150px"
        >
          <template v-slot:item="{ item, props }">
            <v-list-item v-bind="props">
              <template v-slot:prepend>
                <v-icon :icon="getChartTypeIcon(item.value)" />
              </template>
              <v-list-item-title>{{ item.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ getChartTypeDescription(item.value) }}</v-list-item-subtitle>
            </v-list-item>
          </template>
        </v-select>
      </div>
    </div>

    <!-- Chart Content mit Einheiten -->
    <div v-if="sensors.length > 0" class="chart-content">
      <!-- Line Chart für Zeitreihen -->
      <div v-if="selectedChartType === 'line'" class="line-chart-container">
        <canvas ref="lineChartCanvas" width="600" height="300"></canvas>
      </div>

      <!-- Bar Chart für Vergleichswerte -->
      <div v-else-if="selectedChartType === 'bar'" class="bar-chart-container">
        <canvas ref="barChartCanvas" width="600" height="300"></canvas>
      </div>

      <!-- Radar Chart für Sensor-Profile -->
      <div v-else-if="selectedChartType === 'radar'" class="radar-chart-container">
        <canvas ref="radarChartCanvas" width="400" height="400"></canvas>
      </div>

      <!-- Scatter Plot für Korrelationen -->
      <div v-else-if="selectedChartType === 'scatter'" class="scatter-chart-container">
        <canvas ref="scatterChartCanvas" width="600" height="300"></canvas>
      </div>

      <!-- 🆕 NEU: Erweiterte Sensor Legend mit Einheiten -->
      <div class="sensor-legend mt-4">
        <div class="d-flex flex-wrap gap-2">
          <div
            v-for="(sensor, index) in sensors"
            :key="`legend-${sensor.espId}-${sensor.gpio}`"
            class="d-flex align-center"
          >
            <div
              class="legend-color mr-2"
              :style="{ backgroundColor: getSensorColor(index) }"
            ></div>
            <v-tooltip location="top">
              <template v-slot:activator="{ props }">
                <span v-bind="props" class="text-sm cursor-help">
                  {{ sensor.name }} ({{ sensor.espId }})
                </span>
              </template>
              <div class="text-center">
                <div class="font-weight-medium">{{ sensor.name }}</div>
                <div class="text-caption">ESP: {{ sensor.espId }}</div>
                <div class="text-caption">GPIO: {{ sensor.gpio }}</div>
                <div class="text-caption">Aktueller Wert: {{ formatValueWithUnit(sensor) }}</div>
                <div class="text-caption">{{ getSensorTypeDescription(sensor.type) }}</div>
              </div>
            </v-tooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state text-center py-8">
      <v-icon icon="mdi-chart-line" size="large" color="grey" class="mb-4" />
      <div class="text-h6 text-grey">Keine Sensoren zum Vergleichen</div>
      <div class="text-body-2 text-grey-lighten-1">
        Ziehen Sie Sensoren aus den Zonen hierher, um sie zu vergleichen
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, watch } from 'vue'

export default defineComponent({
  name: 'SensorComparisonChart',

  props: {
    sensors: {
      type: Array,
      default: () => [],
    },
    timeRange: {
      type: String,
      default: '1hour',
    },
  },

  setup(props) {
    const selectedChartType = ref('line')
    const lineChartCanvas = ref(null)
    const barChartCanvas = ref(null)
    const radarChartCanvas = ref(null)
    const scatterChartCanvas = ref(null)

    // Verfügbare Chart-Typen
    const availableChartTypes = computed(() => [
      { value: 'line', name: 'Zeitreihe' },
      { value: 'bar', name: 'Vergleich' },
      { value: 'radar', name: 'Profil' },
      { value: 'scatter', name: 'Korrelation' },
    ])

    // Sensor-Farben für Legend
    const getSensorColor = (index) => {
      const colors = ['#2196F3', '#FF9800', '#4CAF50', '#F44336', '#9C27B0', '#00BCD4']
      return colors[index % colors.length]
    }

    // Vergleichs-Status-Farbe
    const getComparisonStatusColor = () => {
      if (props.sensors.length === 0) return 'grey'
      if (props.sensors.length === 1) return 'blue'
      if (props.sensors.length <= 3) return 'green'
      return 'orange'
    }

    // 🆕 NEU: Chart-Beschreibung für Tooltips
    const getChartDescription = () => {
      switch (selectedChartType.value) {
        case 'line':
          return 'Zeitreihen zeigen Werteverläufe über die Zeit.'
        case 'bar':
          return 'Balkendiagramme vergleichen aktuelle Werte.'
        case 'radar':
          return 'Radar-Charts zeigen Sensor-Profile auf einen Blick.'
        case 'scatter':
          return 'Streudiagramme zeigen Korrelationen zwischen Sensoren.'
        default:
          return 'Wählen Sie einen Diagrammtyp aus.'
      }
    }

    // 🆕 NEU: Chart-Typ-Icons
    const getChartTypeIcon = (type) => {
      const icons = {
        line: 'mdi-chart-line',
        bar: 'mdi-chart-bar',
        radar: 'mdi-radar',
        scatter: 'mdi-chart-scatter-plot',
      }
      return icons[type] || 'mdi-chart-line'
    }

    // 🆕 NEU: Chart-Typ-Beschreibungen
    const getChartTypeDescription = (type) => {
      const descriptions = {
        line: 'Zeitreihen für Verlaufsanalyse',
        bar: 'Vergleich aktueller Werte',
        radar: 'Sensor-Profile und -Profile',
        scatter: 'Korrelationen zwischen Sensoren',
      }
      return descriptions[type] || 'Diagrammtyp'
    }

    // 🆕 NEU: Sensor-Wert mit Einheit formatieren
    const formatValueWithUnit = (sensor) => {
      if (!sensor?.value) return 'Kein Wert'

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
        SENSOR_DIGITAL: '',
        SENSOR_SWITCH: '',
      }

      const unit = units[sensor.type] || ''
      const numValue = Number(sensor.value)

      if (sensor.type === 'SENSOR_DIGITAL' || sensor.type === 'SENSOR_SWITCH') {
        return numValue === 1 ? 'An' : 'Aus'
      }

      return `${numValue.toFixed(1)}${unit}`
    }

    // 🆕 NEU: Sensor-Typ-Beschreibung
    const getSensorTypeDescription = (type) => {
      const descriptions = {
        SENSOR_TEMP_DS18B20: 'Temperatursensor (DS18B20)',
        SENSOR_MOISTURE: 'Bodenfeuchtigkeitssensor',
        SENSOR_FLOW: 'Durchflusssensor',
        SENSOR_PH_DFROBOT: 'pH-Sensor (DFRobot)',
        SENSOR_EC_GENERIC: 'Leitfähigkeitssensor',
        SENSOR_PRESSURE: 'Drucksensor',
        SENSOR_CO2: 'CO2-Sensor',
        SENSOR_AIR_QUALITY: 'Luftqualitätssensor',
        SENSOR_LIGHT: 'Lichtsensor',
        SENSOR_LEVEL: 'Füllstandssensor',
        SENSOR_DIGITAL: 'Digitaler Sensor (Ein/Aus)',
        SENSOR_SWITCH: 'Schalter (Ein/Aus)',
      }
      return descriptions[type] || 'Unbekannter Sensortyp'
    }

    // Chart-Initialisierung
    onMounted(() => {
      if (props.sensors.length > 0) {
        initializeChart()
      }
    })

    // Chart bei Sensor-Änderungen neu initialisieren
    watch(
      () => props.sensors,
      () => {
        if (props.sensors.length > 0) {
          initializeChart()
        }
      },
      { deep: true },
    )

    // Chart bei Typ-Änderung neu initialisieren
    watch(selectedChartType, () => {
      if (props.sensors.length > 0) {
        initializeChart()
      }
    })

    // Chart initialisieren
    const initializeChart = () => {
      switch (selectedChartType.value) {
        case 'line':
          initializeLineChart()
          break
        case 'bar':
          initializeBarChart()
          break
        case 'radar':
          initializeRadarChart()
          break
        case 'scatter':
          initializeScatterChart()
          break
      }
    }

    // Line Chart für Zeitreihen
    const initializeLineChart = () => {
      if (!lineChartCanvas.value) return

      const ctx = lineChartCanvas.value.getContext('2d')
      // Hier würde die Chart.js oder ähnliche Bibliothek verwendet werden
      // Für jetzt zeigen wir ein einfaches Canvas-Beispiel
      ctx.clearRect(0, 0, 600, 300)
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, 600, 300)

      // Beispiel-Linien für jeden Sensor
      props.sensors.forEach((sensor, index) => {
        ctx.strokeStyle = getSensorColor(index)
        ctx.lineWidth = 2
        ctx.beginPath()

        for (let x = 0; x < 600; x += 10) {
          const y = 150 + Math.sin(x * 0.01 + index) * 50
          if (x === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      })
    }

    // Bar Chart für Vergleichswerte
    const initializeBarChart = () => {
      if (!barChartCanvas.value) return

      const ctx = barChartCanvas.value.getContext('2d')
      ctx.clearRect(0, 0, 600, 300)
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, 600, 300)

      const barWidth = 500 / props.sensors.length
      props.sensors.forEach((sensor, index) => {
        const x = 50 + index * barWidth
        const height = (Number(sensor.value) || 0) * 2
        const y = 280 - height

        ctx.fillStyle = getSensorColor(index)
        ctx.fillRect(x, y, barWidth - 10, height)

        // Wert-Label
        ctx.fillStyle = '#000'
        ctx.font = '12px Arial'
        ctx.fillText(sensor.name, x, 295)
      })
    }

    // Radar Chart für Sensor-Profile
    const initializeRadarChart = () => {
      if (!radarChartCanvas.value) return

      const ctx = radarChartCanvas.value.getContext('2d')
      ctx.clearRect(0, 0, 400, 400)
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, 400, 400)

      // Einfaches Radar-Chart-Beispiel
      const centerX = 200
      const centerY = 200
      const radius = 150

      // Radar-Grid
      ctx.strokeStyle = '#ddd'
      ctx.lineWidth = 1
      for (let r = 30; r <= radius; r += 30) {
        ctx.beginPath()
        ctx.arc(centerX, centerY, r, 0, 2 * Math.PI)
        ctx.stroke()
      }

      // Sensor-Daten als Radar-Polygon
      props.sensors.forEach((sensor, index) => {
        const value = Number(sensor.value) || 0
        const angle = (index / props.sensors.length) * 2 * Math.PI
        const distance = (value / 100) * radius

        if (index === 0) {
          ctx.beginPath()
          ctx.moveTo(centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance)
        } else {
          ctx.lineTo(centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance)
        }
      })
      ctx.closePath()
      ctx.strokeStyle = '#2196F3'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Scatter Plot für Korrelationen
    const initializeScatterChart = () => {
      if (!scatterChartCanvas.value) return

      const ctx = scatterChartCanvas.value.getContext('2d')
      ctx.clearRect(0, 0, 600, 300)
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, 600, 300)

      // Beispiel-Scatter-Punkte
      props.sensors.forEach((sensor, index) => {
        const value = Number(sensor.value) || 0
        const x = 50 + index * 100
        const y = 250 - value * 2

        ctx.fillStyle = getSensorColor(index)
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, 2 * Math.PI)
        ctx.fill()
      })
    }

    return {
      selectedChartType,
      availableChartTypes,
      lineChartCanvas,
      barChartCanvas,
      radarChartCanvas,
      scatterChartCanvas,
      getSensorColor,
      getComparisonStatusColor,
      getChartDescription,
      getChartTypeIcon,
      getChartTypeDescription,
      formatValueWithUnit,
      getSensorTypeDescription,
      initializeChart,
    }
  },
})
</script>

<style scoped>
.sensor-comparison-chart {
  width: 100%;
  min-height: 400px;
}

.chart-content {
  background: #fff;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.line-chart-container,
.bar-chart-container,
.radar-chart-container,
.scatter-chart-container {
  width: 100%;
  height: 300px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #fafafa;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.sensor-legend {
  border-top: 1px solid #e0e0e0;
  padding-top: 1rem;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}

.empty-state {
  background: #fafafa;
  border-radius: 8px;
  border: 2px dashed #e0e0e0;
}
</style>
