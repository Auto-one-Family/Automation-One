/**
 * useSparklineCache Composable
 *
 * Shared sparkline data cache for sensor live data.
 * Extracts identical logic from MonitorView and SensorsView.
 *
 * Watches espStore.devices and caches recent data points per sensor
 * with 5-second deduplication.
 */

import { ref, watch } from 'vue'
import { useEspStore } from '@/stores/esp'
import type { ChartDataPoint } from '@/components/charts/LiveLineChart.vue'
export type { ChartDataPoint }

const DEFAULT_MAX_POINTS = 30
const DEDUP_INTERVAL_MS = 5000

export function useSparklineCache(maxPoints: number = DEFAULT_MAX_POINTS) {
  const espStore = useEspStore()

  const sparklineCache = ref<Map<string, ChartDataPoint[]>>(new Map())

  function getSensorKey(espId: string, gpio: number, sensorType?: string): string {
    return sensorType ? `${espId}-${gpio}-${sensorType}` : `${espId}-${gpio}`
  }

  watch(
    () => espStore.devices,
    () => {
      for (const device of espStore.devices) {
        const deviceId = espStore.getDeviceId(device)
        const sensors = (device.sensors as { gpio: number; sensor_type?: string; raw_value: number }[]) || []
        for (const s of sensors) {
          if (typeof s.raw_value !== 'number') continue
          const key = getSensorKey(deviceId, s.gpio, s.sensor_type)
          const existing = sparklineCache.value.get(key) || []
          const lastPoint = existing[existing.length - 1]
          const now = new Date()
          // Only add if value changed or >5s elapsed
          if (!lastPoint || s.raw_value !== lastPoint.value ||
              (now.getTime() - new Date(lastPoint.timestamp).getTime()) > DEDUP_INTERVAL_MS) {
            const updated = [...existing, { timestamp: now, value: s.raw_value }]
            if (updated.length > maxPoints) updated.shift()
            sparklineCache.value.set(key, updated)
          }
        }
      }
    },
    { deep: true }
  )

  return {
    sparklineCache,
    getSensorKey,
  }
}
