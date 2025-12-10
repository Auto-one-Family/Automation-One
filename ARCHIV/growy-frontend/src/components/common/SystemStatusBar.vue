<template>
  <div class="system-status-bar">
    <!-- ✅ KORRIGIERT: Loading State -->
    <v-alert
      v-if="!isSystemReady"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
      icon="mdi-loading"
    >
      <div class="d-flex align-center">
        <v-progress-circular indeterminate size="16" width="2" class="mr-2" />
        <span>System wird initialisiert...</span>
      </div>
    </v-alert>

    <!-- ✅ KORRIGIERT: Normale UI nur wenn System bereit -->
    <template v-else>
      <!-- Safe Mode Banner (konsolidiert) -->
      <v-alert
        v-if="systemStatus.safeMode"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
        icon="mdi-shield-alert"
      >
        <div class="d-flex align-center justify-space-between">
          <div>
            <strong>Safe Mode aktiviert</strong>
            <div class="text-caption">
              Grund: {{ safeModeReason }} | Aktiv seit:
              {{ formatUnixTimestamp(safeModeTimestamp, 'relative') }}
            </div>
          </div>
          <v-btn
            size="small"
            color="warning"
            variant="tonal"
            @click="disableSafeMode"
            :loading="disabling"
          >
            Safe Mode deaktivieren
          </v-btn>
        </div>
      </v-alert>

      <!-- Connection Status (konsolidiert) -->
      <v-system-bar
        v-if="!systemStatus.connected || systemStatus.connectionQuality === 'poor'"
        :color="getConnectionStatusColor()"
        class="px-4"
        height="42"
      >
        <div class="d-flex align-center justify-space-between w-100">
          <div class="d-flex align-center">
            <v-icon :icon="getConnectionStatusIcon()" class="mr-2" />
            <span class="text-body-2">
              {{ getConnectionStatusMessage() }}
            </span>
            <span
              v-if="systemStatus.connected && systemStatus.connectionUptime > 0"
              class="text-caption ml-2"
            >
              ({{ formatUptime(systemStatus.connectionUptime) }})
            </span>
          </div>
          <div class="d-flex align-center">
            <v-btn
              v-if="!systemStatus.connecting"
              variant="text"
              size="small"
              class="ml-4"
              @click="reconnect"
              color="white"
              prepend-icon="mdi-refresh"
            >
              Emergency Reconnect
            </v-btn>
            <v-progress-circular
              v-else
              indeterminate
              size="16"
              width="2"
              color="white"
              class="ml-4"
            />
          </div>
        </div>
      </v-system-bar>

      <!-- System Metrics (Desktop only) -->
      <div
        v-if="systemStatus.connected"
        class="d-none d-lg-flex align-center justify-center py-2 px-4 bg-grey-lighten-5"
      >
        <div class="d-flex align-center system-metrics">
          <!-- Device Count -->
          <div class="metric-item d-flex align-center">
            <v-icon icon="mdi-chip" color="info" size="16" class="mr-1" />
            <span class="metric-text text-caption"
              >{{ onlineDeviceCount }}/{{ totalDeviceCount }} ESP32</span
            >
          </div>

          <!-- System Uptime -->
          <div class="metric-item d-flex align-center ml-4">
            <v-icon icon="mdi-clock-outline" color="grey" size="16" class="mr-1" />
            <span class="metric-text text-caption">{{ formattedUptime }}</span>
          </div>

          <!-- Safe Mode Indicator -->
          <div v-if="systemStatus.safeMode" class="metric-item d-flex align-center ml-4">
            <v-icon icon="mdi-shield-alert" color="warning" size="16" class="mr-1" />
            <span class="metric-text text-caption">Safe Mode</span>
          </div>

          <!-- Kaiser Mode Indicator -->
          <div v-if="systemStatus.kaiserMode" class="metric-item d-flex align-center ml-4">
            <v-icon icon="mdi-server" color="primary" size="16" class="mr-1" />
            <span class="metric-text text-caption">Kaiser Mode</span>
          </div>
        </div>
      </div>

      <!-- Emergency Stop Status -->
      <v-alert
        v-if="systemStatus.emergencyStop"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
        icon="mdi-alert-octagon"
      >
        <div class="d-flex align-center justify-space-between">
          <div>
            <strong>NOTSTOPP aktiviert</strong>
            <div class="text-caption">
              Alle Aktoren wurden gestoppt | Aktiv seit:
              {{ formatUnixTimestamp(systemStatus.emergencyStopTimestamp, 'relative') }}
            </div>
          </div>
          <v-btn
            size="small"
            color="error"
            variant="tonal"
            @click="clearEmergencyStop"
            :loading="clearingEmergency"
          >
            NOTSTOPP aufheben
          </v-btn>
        </div>
      </v-alert>

      <!-- System Health Status -->
      <v-alert
        v-if="systemStatus.healthIssues.length > 0"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
        icon="mdi-heart-pulse"
      >
        <div class="d-flex align-center justify-space-between">
          <div>
            <strong>System-Gesundheit</strong>
            <div class="text-caption">
              {{ systemStatus.healthIssues.length }} Problem(e) erkannt
            </div>
          </div>
          <v-btn
            size="small"
            color="warning"
            variant="tonal"
            @click="showHealthDetails = !showHealthDetails"
          >
            {{ showHealthDetails ? 'Verstecken' : 'Details' }}
          </v-btn>
        </div>

        <!-- Health Details -->
        <div v-if="showHealthDetails" class="mt-3">
          <div v-for="issue in systemStatus.healthIssues" :key="issue.id" class="mb-2">
            <div class="d-flex align-center">
              <v-icon :icon="issue.icon" size="small" :color="issue.severity" class="mr-2" />
              <span class="text-caption">{{ issue.message }}</span>
            </div>
          </div>
        </div>
      </v-alert>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatUnixTimestamp, formatDuration } from '@/utils/time'

const centralDataHub = useCentralDataHub()
const disabling = ref(false)
const clearingEmergency = ref(false)
const showHealthDetails = ref(false)

// ✅ KORRIGIERT: Echte System-Bereitschafts-Prüfung
const isSystemReady = computed(() => {
  return (
    centralDataHub.isStoresReady &&
    centralDataHub.mqttStore &&
    centralDataHub.mqttStore.value &&
    typeof centralDataHub.mqttStore.value === 'object'
  )
})

// ✅ KORRIGIERT: Sichere Computed Properties
const systemStatus = computed(() => {
  // Nur ausführen wenn System bereit
  if (!isSystemReady.value) {
    return {
      connected: false,
      connecting: false,
      connectionQuality: 'unknown',
      connectionUptime: 0,
      safeMode: false,
      kaiserMode: false,
      kaiserConnected: false,
      emergencyStop: false,
      emergencyStopTimestamp: null,
      healthIssues: [],
    }
  }

  const mqttStore = centralDataHub.mqttStore.value

  return {
    // Connection Status
    connected: mqttStore.isConnected || false,
    connecting: mqttStore.connecting || false,
    connectionQuality: mqttStore.connectionQuality || 'unknown',
    connectionUptime: mqttStore.connectionUptime || 0,

    // Safe Mode Status
    safeMode: centralDataHub.isSafeMode || false,

    // Kaiser Mode Status
    kaiserMode: centralDataHub.isKaiserMode || false,
    kaiserConnected: mqttStore.kaiser?.godConnection?.connected || false,

    // Emergency Stop Status
    emergencyStop: mqttStore.systemStatus?.emergencyStop || false,
    emergencyStopTimestamp: mqttStore.systemStatus?.lastUpdate || null,

    // Health Issues
    healthIssues: getHealthIssues(),
  }
})

const safeModeReason = computed(() => {
  if (!isSystemReady.value) return 'Unbekannt'
  const mqttStore = centralDataHub.mqttStore.value
  const device = Array.from(mqttStore.espDevices.values()).find((d) => d.safeMode)
  return device?.safeModeEnterReason || 'Unbekannt'
})

const safeModeTimestamp = computed(() => {
  if (!isSystemReady.value) return Date.now()
  const mqttStore = centralDataHub.mqttStore.value
  const device = Array.from(mqttStore.espDevices.values()).find((d) => d.safeMode)
  return device?.safeModeEnterTimestamp || Date.now()
})

// ✅ NEU: System Metrics Computed Properties
const onlineDeviceCount = computed(() => {
  try {
    if (!isSystemReady.value || !centralDataHub.mqttStore.value?.espDevices) return 0
    return Array.from(centralDataHub.mqttStore.value.espDevices.values()).filter(
      (device) => device.status === 'online' || device.connected,
    ).length
  } catch {
    return 0
  }
})

const totalDeviceCount = computed(() => {
  try {
    if (!isSystemReady.value || !centralDataHub.mqttStore.value?.espDevices) return 0
    return centralDataHub.mqttStore.value.espDevices.size
  } catch {
    return 0
  }
})

const formattedUptime = computed(() => {
  try {
    if (!isSystemReady.value) return ''
    const uptime = centralDataHub.mqttStore.value?.connectionUptime || 0
    return formatUptime(uptime)
  } catch {
    return ''
  }
})

// Methods
function getConnectionStatusColor() {
  if (!systemStatus.value.connected) return 'warning'
  if (systemStatus.value.connectionQuality === 'poor') return 'error'
  if (systemStatus.value.connectionQuality === 'good') return 'warning'
  return 'success'
}

function getConnectionStatusIcon() {
  if (!systemStatus.value.connected) return 'mdi-alert'
  if (systemStatus.value.connectionQuality === 'poor') return 'mdi-wifi-off'
  if (systemStatus.value.connectionQuality === 'good') return 'mdi-wifi-strength-2'
  return 'mdi-wifi'
}

function getConnectionStatusMessage() {
  if (!systemStatus.value.connected) {
    return 'Keine Verbindung zum MQTT-Broker'
  }
  if (systemStatus.value.connectionQuality === 'poor') {
    return 'Schwache Verbindung zum MQTT-Broker'
  }
  if (systemStatus.value.connectionQuality === 'good') {
    return 'Verbindung zum MQTT-Broker (eingeschränkt)'
  }
  return 'Verbindung zum MQTT-Broker'
}

// ✅ MIGRIERT: Uptime-Formatierung durch zentrale Utility mit Konvertierung
function formatUptime(uptime) {
  if (!uptime) return ''
  return formatDuration(uptime * 1000) // Konvertierung: Sekunden → Millisekunden
}

function getHealthIssues() {
  const issues = []

  // ✅ KORRIGIERT: Sichere Null-Checks
  if (!isSystemReady.value) {
    return issues
  }

  const mqttStore = centralDataHub.mqttStore.value

  // Connection Quality Issues
  if (mqttStore.connectionQuality === 'poor') {
    issues.push({
      id: 'connection-poor',
      message: 'Schwache Verbindungsqualität',
      severity: 'warning',
      icon: 'mdi-wifi-strength-1',
    })
  }

  // Device Timeout Issues
  const now = Date.now()
  const timeoutThreshold = 5 * 60 * 1000 // 5 Minuten

  // ✅ KORRIGIERT: Sichere Null-Checks für espDevices
  if (mqttStore.espDevices) {
    for (const [espId, device] of mqttStore.espDevices.entries()) {
      if (device.lastUpdate && now - device.lastUpdate > timeoutThreshold) {
        issues.push({
          id: `timeout-${espId}`,
          message: `ESP ${espId} antwortet nicht`,
          severity: 'error',
          icon: 'mdi-clock-alert',
        })
      }
    }
  }

  // Kaiser Connection Issues
  if (centralDataHub.isKaiserMode && !mqttStore.value.kaiser?.godConnection?.connected) {
    issues.push({
      id: 'kaiser-disconnected',
      message: 'Kaiser nicht mit God Pi verbunden',
      severity: 'warning',
      icon: 'mdi-crown-off',
    })
  }

  // God Pi Mode Issues (entfernt - Legacy-Funktionalität)

  return issues
}

async function disableSafeMode() {
  if (!isSystemReady.value) return
  disabling.value = true
  try {
    const mqttStore = centralDataHub.mqttStore.value
    // ✅ KORRIGIERT: Sichere Null-Checks
    if (mqttStore && mqttStore.espDevices) {
      for (const [espId, device] of mqttStore.espDevices.entries()) {
        if (device.safeMode) {
          await mqttStore.disableSafeMode(espId)
        }
      }
    }
  } catch (error) {
    centralDataHub.handleError(error, 'disable-safe-mode')
  } finally {
    disabling.value = false
  }
}

async function reconnect() {
  if (!isSystemReady.value) return
  try {
    const mqttStore = centralDataHub.mqttStore.value
    // ✅ KORRIGIERT: Sichere Null-Checks
    if (mqttStore && mqttStore.reconnect) {
      await mqttStore.reconnect()
    }
  } catch (error) {
    centralDataHub.handleError(error, 'reconnect')
  }
}

async function clearEmergencyStop() {
  if (!isSystemReady.value) return
  clearingEmergency.value = true
  try {
    const mqttStore = centralDataHub.mqttStore.value
    // ✅ KORRIGIERT: Sichere Null-Checks
    if (mqttStore && mqttStore.clearEmergencyStop) {
      await mqttStore.clearEmergencyStop()
    }
  } catch (error) {
    centralDataHub.handleError(error, 'clear-emergency-stop')
  } finally {
    clearingEmergency.value = false
  }
}

// Lifecycle
let statusUpdateInterval

onMounted(() => {
  // Status alle 30 Sekunden aktualisieren
  statusUpdateInterval = setInterval(() => {
    centralDataHub.updateSystemStatus()
  }, 30000)
})

onUnmounted(() => {
  if (statusUpdateInterval) {
    clearInterval(statusUpdateInterval)
  }
})
</script>

<style scoped>
.system-status-bar {
  position: relative;
  z-index: 100;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .enhanced-navigation {
    height: 64px !important;
  }

  .brand-section {
    min-width: auto;
  }

  .system-icon-container {
    padding: 6px;
  }
}

/* ✅ NEU: System Metrics Styles */
.system-metrics {
  gap: 16px;
}

.metric-item {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.metric-text {
  font-weight: 500;
  color: rgba(0, 0, 0, 0.7);
}
</style>
