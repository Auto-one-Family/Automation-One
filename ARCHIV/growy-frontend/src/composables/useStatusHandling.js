// src/composables/useStatusHandling.js
import { computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

export function useStatusHandling() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = computed(() => centralDataHub.mqttStore)

  // ✅ ERWEITERTE STATUS-COLOR-MAPPING (kompatibel mit bestehenden Implementierungen)
  const getStatusColor = (status, context = 'default', format = 'vuetify') => {
    const statusColors = {
      online: 'success',
      offline: 'error',
      warning: 'warning',
      error: 'error',
      info: 'info',
      primary: 'primary',
      secondary: 'secondary',
      grey: 'grey',
    }

    // ✅ FORMAT-UNTERSTÜTZUNG (für MindmapKaiserNode Tailwind Kompatibilität)
    if (format === 'tailwind') {
      const tailwindMap = {
        success: 'text-success',
        error: 'text-error',
        warning: 'text-warning',
        info: 'text-info',
        primary: 'text-primary',
        secondary: 'text-secondary',
        grey: 'text-grey',
      }
      return tailwindMap[statusColors[status] || 'grey'] || 'text-grey'
    }

    // ✅ CONTEXT-SPEZIFISCHE LOGIK (basierend auf bestehenden Implementierungen)
    switch (context) {
      case 'connection':
        // ConnectionStatus.vue Logik beibehalten
        if (!mqttStore.value.isConnected) return 'warning'
        if (mqttStore.value.connectionQuality === 'poor') return 'error'
        if (mqttStore.value.connectionQuality === 'good') return 'warning'
        return 'success'

      case 'sensor': {
        // SensorRegistryPanel.vue Logik beibehalten
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
        if (!status.lastUpdate || status.lastUpdate < fiveMinutesAgo) return 'error'
        return 'success'
      }

      case 'loading':
        // DatabaseLogsCard.vue Logik beibehalten
        if (status.loading) return 'info'
        if (status.error) return 'error'
        if (status.hasData) return 'success'
        return 'grey'

      default:
        // UnifiedCard.vue Logik beibehalten
        return statusColors[status] || 'grey'
    }
  }

  // ✅ BESTEHENDE COMPOSABLE FUNKTIONEN INTEGRIEREN (keine Konflikte)
  const getHealthColor = (score) => {
    // useDeviceHealthScore.js Logik übernehmen
    if (score >= 90) return 'success'
    if (score >= 70) return 'info'
    if (score >= 50) return 'warning'
    return 'error'
  }

  const getSensorColor = (type) => {
    // useSensorAggregation.js Logik übernehmen
    const colors = {
      SENSOR_TEMP_DS18B20: 'orange',
      SENSOR_MOISTURE: 'blue',
      SENSOR_PH_DFROBOT: 'purple',
      SENSOR_EC_GENERIC: 'green',
      SENSOR_LIGHT: 'yellow',
      SENSOR_PRESSURE: 'indigo',
      SENSOR_CO2: 'red',
      SENSOR_AIR_QUALITY: 'teal',
      SENSOR_FLOW: 'cyan',
      SENSOR_LEVEL: 'brown',
    }
    return colors[type] || 'grey'
  }

  return {
    getStatusColor,
    getHealthColor,
    getSensorColor,
  }
}
