<script setup lang="ts">
/**
 * MultiSensorChart Component
 *
 * Industrietaugliches Chart für Multi-Sensor-Analyse.
 * Kombiniert historische Daten mit Live-WebSocket-Updates.
 *
 * Features:
 * - Historische Daten aus API (wenn verfügbar)
 * - Live-Updates via WebSocket (Echtzeit-Daten)
 * - Fallback für Mock-ESPs ohne historische Daten
 * - Robustes Error-Handling mit Retry-Logik
 * - Automatische Daten-Aggregation für große Zeiträume
 * - Memory-effiziente Datenpunkt-Limitierung
 *
 * Phase 4: Charts & Drag-Drop (Industrial-Grade)
 */

import { ref, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { sensorsApi } from '@/api/sensors'
import { websocketService } from '@/services/websocket'
import type { ChartSensor, SensorReading } from '@/types'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
)

// =============================================================================
// Constants
// =============================================================================

/** Maximum data points per sensor (Memory-Schutz) */
const MAX_DATA_POINTS = 1000

/** Retry configuration */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
} as const

/** Time range configurations */
const TIME_RANGES = {
  '1h': { ms: 60 * 60 * 1000, label: '1 Stunde' },
  '6h': { ms: 6 * 60 * 60 * 1000, label: '6 Stunden' },
  '24h': { ms: 24 * 60 * 60 * 1000, label: '24 Stunden' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, label: '7 Tage' },
  '30d': { ms: 30 * 24 * 60 * 60 * 1000, label: '30 Tage' },
} as const

// =============================================================================
// Props & Emits
// =============================================================================

interface Props {
  /** Sensoren die angezeigt werden sollen */
  sensors: ChartSensor[]
  /** Zeitraum-Preset */
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d'
  /** Chart-Höhe in Pixeln */
  height?: number
  /** Auto-Refresh-Intervall in Sekunden (0 = deaktiviert) */
  refreshInterval?: number
  /** Y-Achse Minimum (undefined = auto) */
  yMin?: number
  /** Y-Achse Maximum (undefined = auto) */
  yMax?: number
  /** Live-Updates aktivieren */
  enableLiveUpdates?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  timeRange: '24h',
  height: 300,
  refreshInterval: 0,
  yMin: undefined,
  yMax: undefined,
  enableLiveUpdates: true,
})

const emit = defineEmits<{
  /** Wird gefeuert wenn Daten geladen wurden */
  dataLoaded: [sensorId: string, pointCount: number]
  /** Wird gefeuert bei Fehlern */
  error: [message: string]
}>()

// =============================================================================
// State
// =============================================================================

/** Loading-State für initiales Laden */
const isLoading = ref(false)

/** Error-State mit Retry-Zähler */
const error = ref<{ message: string; retryCount: number } | null>(null)

/**
 * Sensor-Daten Map: sensorId → SensorReading[]
 * Verwendet shallowRef für Performance (Chart.js mutiert nicht)
 */
const sensorData = shallowRef<Map<string, SensorReading[]>>(new Map())

/** Live-Daten die via WebSocket empfangen wurden */
const liveDataPoints = ref<Map<string, SensorReading[]>>(new Map())

/** WebSocket-Subscription-IDs für Cleanup */
const wsSubscriptionIds = ref<string[]>([])

/** Refresh-Timer */
let refreshTimer: ReturnType<typeof setInterval> | null = null

/** Retry-Timer */
let retryTimer: ReturnType<typeof setTimeout> | null = null

// =============================================================================
// Debug Logger
// =============================================================================
function log(message: string, data?: Record<string, unknown>): void {
  const style = 'background: #14b8a6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
  if (data) {
    console.log(`%c[MultiSensorChart]%c ${message}`, style, 'color: #5eead4;', data)
  } else {
    console.log(`%c[MultiSensorChart]%c ${message}`, style, 'color: #5eead4;')
  }
}

// =============================================================================
// Computed
// =============================================================================

/** Zeitraum in Millisekunden */
const timeRangeMs = computed(() => {
  return TIME_RANGES[props.timeRange]?.ms || TIME_RANGES['24h'].ms
})

/** Zeitraum-Label für Anzeige */
const timeRangeLabel = computed(() => {
  return TIME_RANGES[props.timeRange]?.label || '24 Stunden'
})

/** Kombinierte Daten: Historisch + Live */
const combinedData = computed(() => {
  const combined = new Map<string, SensorReading[]>()

  for (const sensor of props.sensors) {
    const historical = sensorData.value.get(sensor.id) || []
    const live = liveDataPoints.value.get(sensor.id) || []

    // Merge und sortiere nach Timestamp
    const merged = [...historical, ...live]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Dedupliziere (gleicher Timestamp = überspringen)
    const deduplicated: SensorReading[] = []
    let lastTimestamp = ''
    for (const reading of merged) {
      if (reading.timestamp !== lastTimestamp) {
        deduplicated.push(reading)
        lastTimestamp = reading.timestamp
      }
    }

    // Limitiere auf MAX_DATA_POINTS (behalte neueste)
    const limited = deduplicated.slice(-MAX_DATA_POINTS)
    combined.set(sensor.id, limited)
  }

  return combined
})

/** Prüft ob Live-Daten vorhanden sind */
const hasLiveData = computed(() => {
  for (const sensor of props.sensors) {
    const data = liveDataPoints.value.get(sensor.id) || []
    if (data.length > 0) return true
  }
  return false
})

/** Gesamtzahl der Datenpunkte */
const totalDataPoints = computed(() => {
  let total = 0
  for (const readings of combinedData.value.values()) {
    total += readings.length
  }
  return total
})

/** Berechne Y-Achsen-Bereich automatisch mit Puffer */
const computedYRange = computed(() => {
  let minVal = Infinity
  let maxVal = -Infinity
  let valueCount = 0

  // Sammle alle Y-Werte von allen Sensoren
  for (const [_sensorId, readings] of combinedData.value.entries()) {
    for (const reading of readings) {
      const value = reading.processed_value ?? reading.raw_value
      if (typeof value === 'number' && !isNaN(value)) {
        minVal = Math.min(minVal, value)
        maxVal = Math.max(maxVal, value)
        valueCount++
      }
    }
  }

  // Fallback wenn keine Daten
  if (minVal === Infinity || maxVal === -Infinity) {
    log('computedYRange: no valid data', { valueCount })
    return { min: undefined, max: undefined }
  }

  // 15% Puffer hinzufügen für bessere Lesbarkeit
  const range = maxVal - minVal
  const padding = range > 0 ? range * 0.15 : 1 // Mindestens 1 Einheit Puffer

  const result = {
    min: Math.floor((minVal - padding) * 10) / 10, // Auf 0.1 abrunden
    max: Math.ceil((maxVal + padding) * 10) / 10,  // Auf 0.1 aufrunden
  }

  log('computedYRange calculated', {
    rawMin: minVal,
    rawMax: maxVal,
    range,
    padding,
    resultMin: result.min,
    resultMax: result.max,
    valueCount,
    sensorCount: combinedData.value.size,
  })

  return result
})

/** Chart-Daten im Chart.js Format */
const chartData = computed(() => {
  const datasets = props.sensors.map((sensor) => {
    const readings = combinedData.value.get(sensor.id) || []

    return {
      label: sensor.name,
      data: readings.map((r) => ({
        x: new Date(r.timestamp).getTime(),
        y: r.processed_value ?? r.raw_value,
      })),
      borderColor: sensor.color,
      backgroundColor: `${sensor.color}20`,
      borderWidth: 2,
      pointRadius: readings.length > 100 ? 0 : 2, // Punkte ausblenden bei vielen Daten
      pointHoverRadius: 4,
      tension: 0.3,
      fill: false,
    }
  })

  return { datasets }
})

/** Chart.js Optionen */
const chartOptions = computed(() => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300, // Schnelle Animationen für Live-Updates
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // Eigene Legende in Parent
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: (items: any[]) => {
            if (items.length === 0) return ''
            const date = new Date(items[0].parsed.x)
            return date.toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          },
          label: (item: any) => {
            const sensor = props.sensors[item.datasetIndex]
            const value = item.parsed.y?.toFixed(2) ?? 'N/A'
            return ` ${sensor.name}: ${value} ${sensor.unit}`
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          displayFormats: {
            second: 'HH:mm:ss',
            minute: 'HH:mm',
            hour: 'HH:mm',
            day: 'dd.MM',
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          maxTicksLimit: 8,
        },
      },
      y: {
        beginAtZero: false,
        // Explizite Props haben Vorrang, sonst berechnete Werte
        min: props.yMin ?? computedYRange.value.min,
        max: props.yMax ?? computedYRange.value.max,
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
        },
      },
    },
  }
})

// =============================================================================
// Methods
// =============================================================================

/**
 * Lädt historische Daten für alle Sensoren.
 * Verwendet Retry-Logik bei Fehlern.
 */
async function fetchData(retryAttempt = 0): Promise<void> {
  log('fetchData called', {
    sensorCount: props.sensors.length,
    sensors: props.sensors.map(s => s.id),
    timeRange: props.timeRange,
    retryAttempt,
  })

  if (props.sensors.length === 0) {
    log('No sensors - skipping fetch')
    sensorData.value = new Map()
    return
  }

  // Nur beim ersten Versuch Loading anzeigen
  if (retryAttempt === 0) {
    isLoading.value = true
    error.value = null
  }

  const now = new Date()
  const startTime = new Date(now.getTime() - timeRangeMs.value)

  log('Fetching data', {
    startTime: startTime.toISOString(),
    endTime: now.toISOString(),
  })

  try {
    const promises = props.sensors.map(async (sensor) => {
      try {
        log(`Querying API for sensor ${sensor.id}`, {
          esp_id: sensor.espId,
          gpio: sensor.gpio,
        })
        const response = await sensorsApi.queryData({
          esp_id: sensor.espId,
          gpio: sensor.gpio,
          start_time: startTime.toISOString(),
          end_time: now.toISOString(),
          limit: MAX_DATA_POINTS,
        })
        log(`API response for ${sensor.id}`, {
          readingsCount: response.readings?.length ?? 0,
          response,
        })
        return { id: sensor.id, readings: response.readings, error: null }
      } catch (err) {
        // Einzelner Sensor-Fehler wird nicht als kritischer Fehler behandelt
        log(`API ERROR for ${sensor.id}`, { error: err })
        return { id: sensor.id, readings: [], error: err }
      }
    })

    const results = await Promise.all(promises)
    const newData = new Map<string, SensorReading[]>()
    let successCount = 0

    results.forEach(({ id, readings }) => {
      newData.set(id, readings)
      if (readings.length > 0) {
        successCount++
        emit('dataLoaded', id, readings.length)
      }
    })

    sensorData.value = newData

    log('fetchData complete', {
      successCount,
      totalSensors: props.sensors.length,
      enableLiveUpdates: props.enableLiveUpdates,
    })

    // Kein Error wenn mindestens ein Sensor Daten hat oder Live-Updates aktiv sind
    if (successCount === 0 && !props.enableLiveUpdates) {
      // Keine historischen Daten - kein Error, nur Info
      log('⚠️ No historical data available - waiting for live updates')
    }

    error.value = null
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Fehler beim Laden der Daten'
    log('fetchData FAILED', { error: err, errorMessage })

    // Retry-Logik
    if (retryAttempt < RETRY_CONFIG.maxAttempts) {
      const delay = Math.min(
        RETRY_CONFIG.baseDelay * Math.pow(2, retryAttempt),
        RETRY_CONFIG.maxDelay
      )
      log(`Retry ${retryAttempt + 1}/${RETRY_CONFIG.maxAttempts} in ${delay}ms`)

      error.value = {
        message: `${errorMessage} (Retry ${retryAttempt + 1}/${RETRY_CONFIG.maxAttempts}...)`,
        retryCount: retryAttempt + 1,
      }

      retryTimer = setTimeout(() => {
        fetchData(retryAttempt + 1)
      }, delay)
    } else {
      error.value = { message: errorMessage, retryCount: retryAttempt }
      emit('error', errorMessage)
    }
  } finally {
    if (retryAttempt === 0 || !error.value) {
      isLoading.value = false
    }
  }
}

/**
 * Manuelles Retry (User-initiated)
 */
function retry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  fetchData(0)
}

/**
 * Richtet WebSocket-Subscriptions für Live-Updates ein.
 */
function setupWebSocketSubscriptions(): void {
  log('setupWebSocketSubscriptions', {
    enableLiveUpdates: props.enableLiveUpdates,
    sensorCount: props.sensors.length,
  })

  if (!props.enableLiveUpdates || props.sensors.length === 0) {
    log('WebSocket subscriptions skipped')
    return
  }

  // Cleanup vorheriger Subscriptions
  cleanupWebSocketSubscriptions()

  // Subscription für jeden Sensor
  for (const sensor of props.sensors) {
    const subscriptionId = websocketService.subscribe(
      {
        types: ['sensor_data'],
        esp_ids: [sensor.espId],
      },
      (message) => {
        handleSensorDataMessage(sensor, message)
      }
    )
    wsSubscriptionIds.value.push(subscriptionId)
    log(`WebSocket subscription created`, {
      sensorId: sensor.id,
      espId: sensor.espId,
      gpio: sensor.gpio,
      subscriptionId,
    })
  }

  log(`✅ ${wsSubscriptionIds.value.length} WebSocket subscriptions aktiv`)
}

/**
 * Verarbeitet eingehende Sensor-Daten via WebSocket.
 */
function handleSensorDataMessage(sensor: ChartSensor, message: any): void {
  const data = message.data

  // Prüfe ob die Daten zu diesem Sensor gehören (GPIO-Match)
  if (data.gpio !== undefined && data.gpio !== sensor.gpio) {
    // Nur alle 5 Sekunden loggen um Console nicht zu fluten
    const now = Date.now()
    const lastLog = (handleSensorDataMessage as any)._lastFilterLog || 0
    if (now - lastLog > 5000) {
      log(`WebSocket data filtered (GPIO mismatch)`, {
        expectedGpio: sensor.gpio,
        receivedGpio: data.gpio,
        sensorId: sensor.id,
      })
      ;(handleSensorDataMessage as any)._lastFilterLog = now
    }
    return
  }

  log(`📡 WebSocket data received for ${sensor.id}`, { data, value: data.value ?? data.raw_value })

  // Erstelle SensorReading aus WebSocket-Daten
  const reading: SensorReading = {
    timestamp: data.timestamp
      ? new Date(typeof data.timestamp === 'number' ? data.timestamp * 1000 : data.timestamp).toISOString()
      : new Date().toISOString(),
    raw_value: data.raw_value ?? data.value ?? 0,
    processed_value: data.processed_value ?? null,
    unit: data.unit ?? sensor.unit,
    quality: data.quality ?? 'good',
  }

  // Füge zu Live-Daten hinzu
  const currentLive = liveDataPoints.value.get(sensor.id) || []
  const updatedLive = [...currentLive, reading].slice(-MAX_DATA_POINTS)

  // Erstelle neue Map für Reaktivität
  const newLiveData = new Map(liveDataPoints.value)
  newLiveData.set(sensor.id, updatedLive)
  liveDataPoints.value = newLiveData

  log(`Live data updated for ${sensor.id}`, { totalPoints: updatedLive.length })
}

/**
 * Räumt WebSocket-Subscriptions auf.
 */
function cleanupWebSocketSubscriptions(): void {
  for (const id of wsSubscriptionIds.value) {
    websocketService.unsubscribe(id)
  }
  wsSubscriptionIds.value = []
}

/**
 * Setzt Live-Daten zurück.
 */
function clearLiveData(): void {
  liveDataPoints.value = new Map()
}

// =============================================================================
// Watchers
// =============================================================================

/**
 * Sensor-IDs als String für zuverlässige Watch-Erkennung.
 * WICHTIG: Array-Mutation mit .push() ändert die Referenz nicht,
 * daher brauchen wir einen abgeleiteten Wert für die Watch.
 */
const sensorIdsString = computed(() => props.sensors.map(s => s.id).sort().join(','))

// Bei Sensor-Änderungen neu laden
watch(
  sensorIdsString,
  (newIds, oldIds) => {
    log('sensorIdsString changed', { newIds, oldIds })
    clearLiveData()
    fetchData()
    setupWebSocketSubscriptions()
  }
)

// Bei Zeitraum-Änderungen neu laden
watch(
  () => props.timeRange,
  () => {
    clearLiveData()
    fetchData()
  }
)

// Bei Y-Achsen-Änderungen Chart aktualisieren (kein Reload nötig)
watch(
  () => [props.yMin, props.yMax],
  () => {
    // Chart.js aktualisiert automatisch durch computed
  }
)

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  // Initiales Laden
  fetchData()

  // WebSocket-Subscriptions einrichten
  setupWebSocketSubscriptions()

  // Auto-Refresh einrichten
  if (props.refreshInterval > 0) {
    refreshTimer = setInterval(fetchData, props.refreshInterval * 1000)
  }
})

onUnmounted(() => {
  // Cleanup
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }

  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }

  cleanupWebSocketSubscriptions()
})
</script>

<template>
  <div class="multi-sensor-chart">
    <!-- Loading State (nur beim initialen Laden) -->
    <div v-if="isLoading && totalDataPoints === 0" class="multi-sensor-chart__loading">
      <div class="multi-sensor-chart__spinner" />
      <span>Lade Sensordaten...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error && totalDataPoints === 0" class="multi-sensor-chart__error">
      <span class="multi-sensor-chart__error-icon">⚠️</span>
      <span>{{ error.message }}</span>
      <button @click="retry" class="multi-sensor-chart__retry-btn">
        Erneut versuchen
      </button>
    </div>

    <!-- Empty State (keine Sensoren ausgewählt) -->
    <div v-else-if="sensors.length === 0" class="multi-sensor-chart__empty">
      <span class="multi-sensor-chart__empty-icon">📊</span>
      <span>Keine Sensoren ausgewählt</span>
      <span class="multi-sensor-chart__empty-hint">
        Ziehe einen Sensor hierher um Daten anzuzeigen
      </span>
    </div>

    <!-- No Data State (Sensoren ausgewählt, aber keine Daten) -->
    <div
      v-else-if="totalDataPoints === 0"
      class="multi-sensor-chart__no-data"
    >
      <span class="multi-sensor-chart__no-data-icon">📈</span>
      <span>Noch keine Daten verfügbar</span>
      <span class="multi-sensor-chart__no-data-hint">
        <template v-if="enableLiveUpdates">
          Warte auf Live-Daten vom Sensor...
        </template>
        <template v-else>
          Keine historischen Daten für {{ timeRangeLabel }}
        </template>
      </span>
      <div v-if="enableLiveUpdates" class="multi-sensor-chart__live-indicator">
        <span class="multi-sensor-chart__live-dot" />
        Live-Updates aktiv
      </div>
    </div>

    <!-- Chart -->
    <div v-else class="multi-sensor-chart__container" :style="{ height: `${height}px` }">
      <!--
        Key erzwingt Re-Render bei:
        - Sensor-Änderungen (neue/entfernte Sensoren)
        - Y-Achsen-Bereich-Änderungen (wenn neue Daten außerhalb des alten Bereichs liegen)
        Ohne Y-Range im Key würde Chart.js die Achsen nicht aktualisieren!
      -->
      <Line
        :key="`chart-${sensors.map(s => s.id).join('-')}-y${computedYRange.min ?? 'auto'}-${computedYRange.max ?? 'auto'}-n${totalDataPoints}`"
        :data="chartData"
        :options="chartOptions"
      />

      <!-- Info-Badge: Datenpunkte & Live-Status -->
      <div class="multi-sensor-chart__info">
        <span class="multi-sensor-chart__info-points">
          {{ totalDataPoints }} Punkte
        </span>
        <span v-if="enableLiveUpdates && hasLiveData" class="multi-sensor-chart__info-live">
          <span class="multi-sensor-chart__live-dot" />
          Live
        </span>
      </div>

      <!-- Loading Overlay (beim Refresh) -->
      <div v-if="isLoading" class="multi-sensor-chart__loading-overlay">
        <div class="multi-sensor-chart__spinner multi-sensor-chart__spinner--small" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.multi-sensor-chart {
  width: 100%;
  position: relative;
}

.multi-sensor-chart__container {
  position: relative;
  width: 100%;
}

/* States */
.multi-sensor-chart__loading,
.multi-sensor-chart__error,
.multi-sensor-chart__empty,
.multi-sensor-chart__no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 1.5rem 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-align: center;
  min-height: 100px;
}

.multi-sensor-chart__error {
  color: var(--color-error);
}

.multi-sensor-chart__error-icon,
.multi-sensor-chart__empty-icon,
.multi-sensor-chart__no-data-icon {
  font-size: 1.25rem;
  margin-bottom: 0.125rem;
}

.multi-sensor-chart__empty-hint,
.multi-sensor-chart__no-data-hint {
  font-size: 0.6875rem;
  opacity: 0.7;
  max-width: 180px;
  line-height: 1.3;
}

/* Retry Button */
.multi-sensor-chart__retry-btn {
  margin-top: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.15s;
}

.multi-sensor-chart__retry-btn:hover {
  border-color: var(--color-iridescent-1);
  background: rgba(167, 139, 250, 0.1);
}

/* Live Indicator */
.multi-sensor-chart__live-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.375rem;
  padding: 0.1875rem 0.4375rem;
  background: rgba(52, 211, 153, 0.1);
  border-radius: 9999px;
  font-size: 0.5625rem;
  color: var(--color-success);
}

.multi-sensor-chart__live-dot {
  width: 5px;
  height: 5px;
  background: var(--color-success);
  border-radius: 50%;
  animation: pulse-live 2s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes pulse-live {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
}

/* Info Badge */
.multi-sensor-chart__info {
  position: absolute;
  bottom: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.1875rem 0.375rem;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 0.1875rem;
  font-size: 0.5625rem;
  color: var(--color-text-muted);
  backdrop-filter: blur(4px);
}

.multi-sensor-chart__info-points {
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: -0.025em;
}

.multi-sensor-chart__info-live {
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  color: var(--color-success);
  font-weight: 500;
}

/* Loading Overlay */
.multi-sensor-chart__loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.5rem;
  pointer-events: none;
}

/* Spinner */
.multi-sensor-chart__spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--color-bg-tertiary);
  border-top-color: var(--color-iridescent-1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.multi-sensor-chart__spinner--small {
  width: 1rem;
  height: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
