<template>
  <UnifiedCard
    title="System-Übersicht"
    icon="mdi-monitor-dashboard"
    variant="elevated"
    class="system-overview-card"
    :loading="!isSystemReady"
  >
    <v-row class="system-metrics-grid">
      <!-- ESP32 Geräte (erweitert) -->
      <v-col cols="12" sm="6" md="3">
        <v-tooltip
          location="top"
          max-width="350"
          open-delay="200"
          close-delay="1000"
          content-class="interactive-tooltip"
        >
          <template #activator="{ props }">
            <div v-bind="props" class="metric-box clickable" @click="openDeviceDiagnostics">
              <v-icon icon="mdi-chip" color="info" size="24" class="mb-2" />
              <div class="metric-label">ESP32 Geräte</div>
              <div class="metric-value">{{ onlineDevices }}/{{ totalDevices }}</div>
              <div class="metric-detail">{{ offlineDevices }} offline</div>
            </div>
          </template>
          <div class="tooltip-content-wrapper">
            <div class="tooltip-title">ESP32 Feldgeräte Status</div>
            <div class="tooltip-section">
              <strong>{{ onlineDevices }}</strong> von <strong>{{ totalDevices }}</strong> Geräten
              sind online
            </div>
            <div v-if="offlineDevices > 0" class="tooltip-section text-warning">
              ⚠️ {{ offlineDevices }} Geräte nicht erreichbar
            </div>
            <div v-if="lastDeviceUpdate" class="tooltip-section">
              Letzte Aktualisierung: {{ lastDeviceUpdate }}
            </div>
            <div class="tooltip-actions">
              <v-btn
                size="small"
                color="primary"
                variant="outlined"
                @click="openDeviceDiagnostics"
                class="action-btn"
              >
                GERÄTE-DIAGNOSE ÖFFNEN
              </v-btn>
            </div>
          </div>
        </v-tooltip>
      </v-col>

      <!-- Aktive Sensoren -->
      <v-col cols="12" sm="6" md="3">
        <v-tooltip
          location="top"
          max-width="350"
          open-delay="200"
          close-delay="1000"
          content-class="interactive-tooltip"
        >
          <template #activator="{ props }">
            <div v-bind="props" class="metric-box clickable" @click="openPinConfiguration">
              <v-icon icon="mdi-gauge" color="success" size="24" class="mb-2" />
              <div class="metric-label">Aktive Sensoren</div>
              <div class="metric-value">{{ activeSensors }}</div>
              <div class="metric-detail">{{ totalPins }} Pins konfiguriert</div>
            </div>
          </template>
          <div class="tooltip-content-wrapper">
            <div class="tooltip-title">Sensor-Netzwerk Status</div>
            <div class="tooltip-section">
              <strong>{{ activeSensors }}</strong> Sensoren senden Daten
            </div>
            <div class="tooltip-section">{{ totalPins }} GPIO-Pins sind konfiguriert</div>
            <div v-if="sensorTypes.length > 0" class="tooltip-section">
              Typen: {{ sensorTypes.join(', ') }}
            </div>
            <div v-if="lastSensorData" class="tooltip-section">
              Letzte Messung: {{ lastSensorData }}
            </div>
            <div class="tooltip-actions">
              <v-btn
                size="small"
                color="primary"
                variant="outlined"
                @click="openPinConfiguration"
                class="action-btn"
              >
                PIN-KONFIGURATION ÖFFNEN
              </v-btn>
            </div>
          </div>
        </v-tooltip>
      </v-col>

      <!-- Netzwerk Status (NEU statt Safe Mode) -->
      <v-col cols="12" sm="6" md="3">
        <v-tooltip
          location="top"
          max-width="350"
          open-delay="200"
          close-delay="1000"
          content-class="interactive-tooltip"
        >
          <template #activator="{ props }">
            <div v-bind="props" class="metric-box clickable" @click="openNetworkDiagnostics">
              <v-icon :icon="getNetworkIcon()" :color="getNetworkColor()" size="24" class="mb-2" />
              <div class="metric-label">Netzwerk</div>
              <div class="metric-value">{{ networkStatus }}</div>
              <div class="metric-detail">{{ connectionDetails }}</div>
            </div>
          </template>
          <div class="tooltip-content-wrapper">
            <div class="tooltip-title">Netzwerk-Diagnostik</div>
            <div class="tooltip-section">
              <strong>MQTT Broker:</strong>
              {{ mqttStore?.connected ? '🟢 Verbunden' : '🔴 Getrennt' }}
            </div>
            <div class="tooltip-section">
              <strong>Verbindungsqualität:</strong> {{ getDetailedQuality() }}
            </div>
            <div v-if="!mqttStore?.connected" class="tooltip-section text-error">
              <strong>Problem:</strong> Keine Verbindung zum Broker<br />
              <small>Klicken um Netzwerk-Einstellungen zu öffnen</small>
            </div>
            <div v-if="packetLoss > 5" class="tooltip-section text-warning">
              <strong>Warnung:</strong> Hoher Paketverlust ({{ packetLoss }}%)<br />
              <small>Netzwerk-Stabilität prüfen</small>
            </div>
            <div class="tooltip-actions">
              <v-btn
                size="small"
                color="primary"
                variant="outlined"
                @click="openNetworkDiagnostics"
                class="action-btn"
              >
                NETZWERK-EINSTELLUNGEN ÖFFNEN
              </v-btn>
            </div>
          </div>
        </v-tooltip>
      </v-col>

      <!-- System Health -->
      <v-col cols="12" sm="6" md="3">
        <v-tooltip
          location="top"
          max-width="350"
          open-delay="200"
          close-delay="1000"
          content-class="interactive-tooltip"
        >
          <template #activator="{ props }">
            <div v-bind="props" class="metric-box clickable" @click="openSystemDiagnostics">
              <v-icon :icon="getHealthIcon()" :color="getHealthColor()" size="24" class="mb-2" />
              <div class="metric-label">System Health</div>
              <div class="metric-value">{{ systemHealthStatus }}</div>
              <div class="metric-detail">{{ lastUpdateTime }}</div>
            </div>
          </template>
          <div class="tooltip-content-wrapper">
            <div class="tooltip-title">System-Zustand</div>

            <!-- Kritische Probleme EXAKT erklären -->
            <div v-if="systemHealthStatus === 'Critical'" class="tooltip-section text-error">
              <strong>🚨 Kritischer Zustand:</strong><br />
              <span v-if="onlineDevices === 0 && totalDevices > 0">
                Alle {{ totalDevices }} Geräte sind offline
              </span>
              <span v-else-if="deviceAvailability < 30">
                Nur {{ deviceAvailability }}% der Geräte sind erreichbar
              </span>
              <span v-else> Schwerwiegende Systemprobleme erkannt </span>
              <br /><small>Klicken um Geräte-Diagnose zu öffnen</small>
            </div>

            <div v-else-if="systemHealthStatus === 'Warning'" class="tooltip-section text-warning">
              <strong>⚠️ Aufmerksamkeit erforderlich:</strong><br />
              <span v-if="offlineDevices > 0">
                {{ offlineDevices }} von {{ totalDevices }} Geräten offline
              </span>
              <span v-if="packetLoss > 10">
                Netzwerk-Instabilität: {{ packetLoss }}% Paketverlust
              </span>
            </div>

            <div v-else class="tooltip-section text-success">
              <strong>✅ System funktioniert normal</strong><br />
              {{ onlineDevices }}/{{ totalDevices }} Geräte online
            </div>

            <!-- Handlungsoptionen -->
            <div class="tooltip-actions">
              <v-btn
                size="small"
                color="primary"
                variant="outlined"
                @click="openSystemDiagnostics"
                class="action-btn"
              >
                SYSTEM-DIAGNOSE ÖFFNEN
              </v-btn>
            </div>
          </div>
        </v-tooltip>
      </v-col>
    </v-row>

    <!-- Emergency Actions (NUR wenn nötig) -->
    <v-row v-if="hasEmergencyState" class="mt-2">
      <v-col cols="12">
        <v-alert type="warning" variant="tonal" density="compact" class="emergency-alert">
          <div class="d-flex align-center justify-space-between">
            <span>⚠️ System erfordert Aufmerksamkeit</span>
            <v-btn color="warning" size="small" variant="outlined" @click="handleEmergencyAction">
              Prüfen
            </v-btn>
          </div>
        </v-alert>
      </v-col>
    </v-row>
  </UnifiedCard>
</template>

<script setup>
import { computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

const centralDataHub = useCentralDataHub()

// ✅ System Ready Check
const isSystemReady = computed(() => {
  return (
    centralDataHub.isStoresReady &&
    centralDataHub.mqttStore &&
    centralDataHub.mqttStore.value &&
    typeof centralDataHub.mqttStore.value === 'object'
  )
})

// ✅ REAL VERFÜGBARE DATEN aus der Analyse
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)

// Device Counts mit Fallback
const onlineDevices = computed(() => {
  try {
    if (!mqttStore.value?.espDevices) return 0
    return Array.from(mqttStore.value.espDevices.values()).filter(
      (device) => device.status === 'online' || device.connected,
    ).length
  } catch {
    return 0
  }
})

const totalDevices = computed(() => {
  try {
    if (!mqttStore.value?.espDevices) return 0
    return mqttStore.value.espDevices.size
  } catch {
    return 0
  }
})

// ✅ NEU: Erweiterte Device-Statistiken
const offlineDevices = computed(() => totalDevices.value - onlineDevices.value)

const activeSensors = computed(() => {
  try {
    if (!mqttStore.value?.espDevices) return 0
    return Array.from(mqttStore.value.espDevices.values()).reduce(
      (total, device) => total + (device.activeSensors || 0),
      0,
    )
  } catch {
    return 0
  }
})

const totalPins = computed(() => {
  try {
    if (!centralConfig.value?.getAllConfiguredPins) return 0
    return centralConfig.value.getAllConfiguredPins().length
  } catch {
    return 0
  }
})

const systemHealthStatus = computed(() => {
  const onlinePercentage =
    totalDevices.value > 0 ? Math.round((onlineDevices.value / totalDevices.value) * 100) : 0

  if (onlinePercentage >= 90) return 'Excellent'
  if (onlinePercentage >= 70) return 'Good'
  if (onlinePercentage >= 50) return 'Warning'
  return 'Critical'
})

const getHealthIcon = () => {
  const status = systemHealthStatus.value
  switch (status) {
    case 'Excellent':
      return 'mdi-heart'
    case 'Good':
      return 'mdi-heart-outline'
    case 'Warning':
      return 'mdi-alert-circle'
    case 'Critical':
      return 'mdi-alert-octagon'
    default:
      return 'mdi-help-circle'
  }
}

const getHealthColor = () => {
  const status = systemHealthStatus.value
  switch (status) {
    case 'Excellent':
      return 'success'
    case 'Good':
      return 'info'
    case 'Warning':
      return 'warning'
    case 'Critical':
      return 'error'
    default:
      return 'grey'
  }
}

const lastUpdateTime = computed(() => {
  try {
    const lastUpdate = mqttStore.value?.systemHealth?.lastUpdate
    if (!lastUpdate) return 'Nie'
    return new Date(lastUpdate).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Unbekannt'
  }
})

// ✅ NEU: Netzwerk-spezifische Computed Properties
const networkStatus = computed(() => {
  try {
    if (!mqttStore.value?.connected) return 'Getrennt'
    const quality = mqttStore.value?.connectionQuality || 'unknown'
    switch (quality) {
      case 'excellent':
        return 'Ausgezeichnet'
      case 'good':
        return 'Gut'
      case 'poor':
        return 'Schlecht'
      default:
        return 'Unbekannt'
    }
  } catch {
    return 'Unbekannt'
  }
})

const connectionDetails = computed(() => {
  try {
    if (!mqttStore.value?.connected) return 'Keine Verbindung'
    const quality = mqttStore.value?.connectionQuality || 'unknown'
    switch (quality) {
      case 'excellent':
        return 'Stabile Verbindung'
      case 'good':
        return 'Normale Verbindung'
      case 'poor':
        return 'Instabile Verbindung'
      default:
        return 'Verbindung prüfen'
    }
  } catch {
    return 'Verbindung prüfen'
  }
})

const packetLoss = computed(() => {
  try {
    return mqttStore.value?.packetLoss || 0
  } catch {
    return 0
  }
})

const deviceAvailability = computed(() => {
  try {
    if (totalDevices.value === 0) return 100
    return Math.round((onlineDevices.value / totalDevices.value) * 100)
  } catch {
    return 0
  }
})

const sensorTypes = computed(() => {
  try {
    if (!mqttStore.value?.espDevices) return []
    const types = new Set()
    Array.from(mqttStore.value.espDevices.values()).forEach((device) => {
      if (device.sensors) {
        Object.values(device.sensors).forEach((sensor) => {
          if (sensor.type) types.add(sensor.type)
        })
      }
    })
    return Array.from(types).slice(0, 3) // Max 3 Typen anzeigen
  } catch {
    return []
  }
})

const lastDeviceUpdate = computed(() => {
  try {
    const devices = Array.from(mqttStore.value?.espDevices?.values() || [])
    if (devices.length === 0) return null

    const lastUpdate = Math.max(...devices.map((device) => device.lastUpdate || 0))
    if (lastUpdate === 0) return null

    return new Date(lastUpdate).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
})

const lastSensorData = computed(() => {
  try {
    const devices = Array.from(mqttStore.value?.espDevices?.values() || [])
    if (devices.length === 0) return null

    const lastUpdate = Math.max(...devices.map((device) => device.lastSensorUpdate || 0))
    if (lastUpdate === 0) return null

    return new Date(lastUpdate).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
})

// ✅ NEU: Netzwerk-Hilfsfunktionen
const getNetworkIcon = () => {
  try {
    if (!mqttStore.value?.connected) return 'mdi-wifi-off'
    const quality = mqttStore.value?.connectionQuality || 'unknown'
    switch (quality) {
      case 'excellent':
        return 'mdi-wifi'
      case 'good':
        return 'mdi-wifi'
      case 'poor':
        return 'mdi-wifi-strength-1'
      default:
        return 'mdi-wifi-strength-2'
    }
  } catch {
    return 'mdi-wifi-off'
  }
}

const getNetworkColor = () => {
  try {
    if (!mqttStore.value?.connected) return 'error'
    const quality = mqttStore.value?.connectionQuality || 'unknown'
    switch (quality) {
      case 'excellent':
        return 'success'
      case 'good':
        return 'info'
      case 'poor':
        return 'warning'
      default:
        return 'grey'
    }
  } catch {
    return 'error'
  }
}

const getDetailedQuality = () => {
  try {
    const quality = mqttStore.value?.connectionQuality || 'unknown'
    switch (quality) {
      case 'excellent':
        return 'Ausgezeichnet - Optimale Verbindung'
      case 'good':
        return 'Gut - Stabile Verbindung'
      case 'poor':
        return 'Schlecht - Netzwerk prüfen'
      default:
        return 'Unbekannt - Verbindung testen'
    }
  } catch {
    return 'Unbekannt - Verbindung testen'
  }
}

// ✅ NEU: Click-Handler für Problem-Behebung
const openNetworkDiagnostics = () => {
  try {
    // Prüfe ob Advanced Tab existiert
    if (typeof window.$router !== 'undefined') {
      window.$router.push('/settings?tab=advanced&section=network')
    } else {
      window.$snackbar?.showInfo('Netzwerk-Einstellungen werden geöffnet...')
    }
  } catch (error) {
    console.warn('Navigation error:', error)
    window.$snackbar?.showWarning('Öffnen Sie die Erweiterten Einstellungen manuell')
  }
}

const openSystemDiagnostics = () => {
  try {
    if (typeof window.$router !== 'undefined') {
      window.$router.push('/settings?tab=devices&action=diagnostics')
    } else {
      window.$snackbar?.showInfo('System-Diagnose wird geöffnet...')
    }
  } catch (error) {
    console.warn('Navigation error:', error)
    window.$snackbar?.showWarning('Öffnen Sie das Device Tree Tab manuell')
  }
}

const openDeviceDiagnostics = () => {
  try {
    if (typeof window.$router !== 'undefined') {
      window.$router.push('/settings?tab=devices&action=diagnostics')
    } else {
      window.$snackbar?.showInfo('Geräte-Diagnose wird geöffnet...')
    }
  } catch (error) {
    console.warn('Navigation error:', error)
    window.$snackbar?.showWarning('Öffnen Sie das Device Tree Tab manuell')
  }
}

const openPinConfiguration = () => {
  try {
    if (typeof window.$router !== 'undefined') {
      window.$router.push('/settings?tab=devices&action=configure')
    } else {
      window.$snackbar?.showInfo('Pin-Konfiguration wird geöffnet...')
    }
  } catch (error) {
    console.warn('Navigation error:', error)
  }
}

// Emergency State Detection
const hasEmergencyState = computed(() => {
  return (
    mqttStore.value?.systemStatus?.emergencyStop ||
    false ||
    (onlineDevices.value === 0 && totalDevices.value > 0)
  )
})

// Emergency Action Handler
const handleEmergencyAction = () => {
  // Öffne System-Status-Details oder Emergency-Panel
  window.$snackbar?.showInfo('System-Status wird überprüft...')
}
</script>

<style>
/* ✅ Global Tooltip Styling (NICHT scoped!) */
.interactive-tooltip {
  background: white !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  padding: 0 !important;
}

.interactive-tooltip .v-overlay__content {
  background: transparent !important;
  padding: 0 !important;
}

/* Dunklen Overlay/Border entfernen */
.interactive-tooltip .v-overlay__content {
  background: transparent !important;
  box-shadow: none !important;
}

/* Arrow styling falls vorhanden */
.interactive-tooltip::before {
  display: none !important;
}
</style>

<style scoped>
.system-overview-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.system-metrics-grid {
  margin: -8px;
}

.metric-box {
  text-align: center;
  padding: 16px;
  background: white;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  height: 100%;
  cursor: pointer;
}

.metric-box.clickable {
  cursor: pointer;
}

.metric-box.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  border-color: rgba(var(--v-theme-primary), 0.3);
}

.metric-box:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.metric-label {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.metric-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.87);
}

.metric-detail {
  font-size: 0.7rem;
  color: rgba(0, 0, 0, 0.5);
  margin-top: 2px;
  font-weight: 400;
}

.emergency-alert {
  border-left: 4px solid rgb(var(--v-theme-warning));
}

/* ✅ KORRIGIERTES Tooltip-Styling */
.tooltip-content-wrapper {
  padding: 12px;
  background: white;
  border-radius: 8px;
  color: rgba(0, 0, 0, 0.87);
  text-align: left;
  line-height: 1.4;
}

.tooltip-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 8px;
  color: rgb(var(--v-theme-primary));
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding-bottom: 4px;
}

.tooltip-section {
  margin-bottom: 8px;
  line-height: 1.4;
}

.tooltip-section:last-child {
  margin-bottom: 0;
}

.tooltip-content-wrapper .text-error {
  color: rgb(var(--v-theme-error)) !important;
}

.tooltip-content-wrapper .text-warning {
  color: rgb(var(--v-theme-warning)) !important;
}

.tooltip-content-wrapper .text-success {
  color: rgb(var(--v-theme-success)) !important;
}

.tooltip-actions {
  margin-top: 12px;
  text-align: center;
}

.action-btn {
  font-size: 0.75rem !important;
  font-weight: 600 !important;
}

/* Verbesserte Responsive-Optimierung */
@media (max-width: 960px) {
  .system-metrics-grid .v-col {
    padding: 6px;
  }

  .metric-box {
    padding: 12px;
  }
}

@media (max-width: 600px) {
  .system-metrics-grid {
    margin: -4px;
  }

  .metric-box {
    padding: 16px 12px;
  }

  .metric-label {
    font-size: 0.7rem;
  }

  .metric-value {
    font-size: 0.85rem;
  }

  .metric-detail {
    font-size: 0.65rem;
  }
}
</style>
