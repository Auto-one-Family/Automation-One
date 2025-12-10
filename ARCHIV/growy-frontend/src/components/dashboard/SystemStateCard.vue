<template>
  <UnifiedCard
    variant="outlined"
    class="system-state-card"
    title="System State"
    icon="mdi-information-outline"
    :show-header-actions="true"
    :show-actions="true"
  >
    <!-- Header Actions -->
    <template #header-actions>
      <!-- 🆕 NEU: Kaiser-ID-Konflikt Badge -->
      <v-chip v-if="hasKaiserIdConflict" color="warning" size="small" variant="tonal" class="mr-2">
        <v-icon start size="small">mdi-alert-circle</v-icon>
        Kaiser-ID Konflikt
      </v-chip>

      <v-chip :color="getSystemStateColor(device.systemState)" size="small" variant="tonal">
        {{ device.systemState || 'UNKNOWN' }}
      </v-chip>
    </template>

    <!-- Content -->
    <template #content>
      <v-row>
        <!-- System State Information -->
        <v-col cols="12" md="6">
          <div class="text-subtitle-2 mb-2">System Information</div>
          <v-list density="compact" variant="text">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-web" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> WebServer Status </v-list-item-title>
              <template #append>
                <div class="text-right">
                  <v-chip
                    :color="device.webserverActive ? 'warning' : 'success'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ device.webserverActive ? 'Setup Mode' : 'Operational' }}
                  </v-chip>
                  <div class="text-xs text-gray-600 mt-1">
                    {{ getWebServerGuidance(device) }}
                  </div>
                </div>
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-connection" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> Connection Status </v-list-item-title>
              <template #append>
                <v-chip
                  :color="device.connectionEstablished ? 'success' : 'error'"
                  size="x-small"
                  variant="tonal"
                >
                  {{ device.connectionEstablished ? 'Established' : 'Not Connected' }}
                </v-chip>
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-shield-check" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> Safe Mode </v-list-item-title>
              <template #append>
                <v-tooltip v-if="device.safeMode && device.safeModeEnterReason" location="top">
                  <template #activator="{ props }">
                    <v-chip
                      v-bind="props"
                      :color="device.safeMode ? 'warning' : 'success'"
                      size="x-small"
                      variant="tonal"
                      class="cursor-help"
                      data-test="safe-mode-chip"
                    >
                      {{ device.safeMode ? 'Enabled' : 'Disabled' }}
                    </v-chip>
                  </template>
                  <div class="text-center">
                    <div class="font-weight-medium">Safe Mode aktiviert</div>
                    <div class="text-caption">Grund: {{ device.safeModeEnterReason }}</div>
                    <div v-if="device.safeModeEnterTimestamp" class="text-caption">
                      Zeit: {{ formatUnixTimestamp(device.safeModeEnterTimestamp, 'relative') }}
                    </div>
                    <div v-if="device.safeModeDuration" class="text-caption">
                      Dauer: {{ formatDuration(device.safeModeDuration) }}
                    </div>
                  </div>
                </v-tooltip>
                <v-chip
                  v-else
                  :color="device.safeMode ? 'warning' : 'success'"
                  size="x-small"
                  variant="tonal"
                  data-test="safe-mode-chip"
                >
                  {{ device.safeMode ? 'Enabled' : 'Disabled' }}
                </v-chip>
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-clock-outline" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> Last Update </v-list-item-title>
              <template #append>
                <div class="text-right">
                  <div class="text-xs font-family-monospace">
                    {{ formatLastUpdate(device.lastUpdate) }}
                  </div>
                  <div class="text-xs text-gray-600">
                    {{ device.uptime ? formatUptime(device.uptime) : 'Unknown' }}
                  </div>
                </div>
              </template>
            </v-list-item>

            <v-list-item v-if="device.server_address || device.ipAddress">
              <template #prepend>
                <v-icon icon="mdi-ip-network" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> IP Address </v-list-item-title>
              <template #append>
                <div class="text-right">
                  <div class="text-xs font-family-monospace">
                    {{ device.server_address || device.ipAddress }}
                  </div>
                  <div class="text-xs text-gray-600">
                    {{ device.macAddress ? device.macAddress : 'No MAC' }}
                  </div>
                </div>
              </template>
            </v-list-item>

            <v-list-item v-if="device.board_type || device.boardType">
              <template #prepend>
                <v-icon icon="mdi-chip" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> Board Type </v-list-item-title>
              <template #append>
                <div class="text-right">
                  <div class="text-xs">{{ device.board_type || device.boardType }}</div>
                  <div class="text-xs text-gray-600">
                    {{
                      device.firmware_version
                        ? `v${device.firmware_version}`
                        : device.firmwareVersion
                          ? `v${device.firmwareVersion}`
                          : 'Unknown version'
                    }}
                  </div>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-col>

        <!-- System Health (optional) -->
        <v-col v-if="showSystemHealth" cols="12" md="6">
          <div class="text-subtitle-2 mb-2">System Health</div>
          <v-list density="compact" variant="text">
            <v-list-item v-if="device.cpuUsage !== undefined">
              <template #prepend>
                <v-icon :icon="getCpuUsageStatus(device.cpuUsage).icon" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> CPU Usage </v-list-item-title>
              <template #append>
                <v-chip :color="getCpuUsageColor(device.cpuUsage)" size="x-small" variant="tonal">
                  {{ device.cpuUsage.toFixed(1) }}%
                </v-chip>
              </template>
            </v-list-item>

            <v-list-item v-if="device.memoryUsage !== undefined">
              <template #prepend>
                <v-icon :icon="getMemoryStatus(device.memoryUsage).icon" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> Memory Usage </v-list-item-title>
              <template #append>
                <v-chip :color="getMemoryColor(device.memoryUsage)" size="x-small" variant="tonal">
                  {{ device.memoryUsage.toFixed(1) }}%
                </v-chip>
              </template>
            </v-list-item>

            <v-list-item v-if="device.freeHeap !== undefined">
              <template #prepend>
                <v-icon icon="mdi-memory" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> Free Heap </v-list-item-title>
              <template #append>
                <div class="text-right">
                  <div class="text-xs font-family-monospace">
                    {{ formatBytes(device.freeHeap) }}
                  </div>
                  <div class="text-xs text-gray-600">
                    {{ device.totalHeap ? `Total: ${formatBytes(device.totalHeap)}` : '' }}
                  </div>
                </div>
              </template>
            </v-list-item>

            <v-list-item v-if="device.uptime !== undefined">
              <template #prepend>
                <v-icon :icon="getUptimeStatus(device.uptime).icon" size="small" />
              </template>
              <v-list-item-title class="text-body-2"> Uptime </v-list-item-title>
              <template #append>
                <v-chip :color="getUptimeColor(device.uptime)" size="x-small" variant="tonal">
                  {{ formatUptime(device.uptime) }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>
    </template>

    <!-- Actions -->
    <template #actions>
      <!-- Setup Mode Actions -->
      <v-card-actions v-if="device.webserverActive || isSetupMode">
        <v-btn
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-wifi"
          @click="showSetupInstructions"
        >
          Setup Instructions
        </v-btn>
        <v-btn
          size="small"
          color="info"
          variant="tonal"
          prepend-icon="mdi-web"
          @click="showWebServerInfo"
        >
          WebServer Info
        </v-btn>
        <v-spacer />
        <v-btn variant="tonal" size="small" @click="refreshStatus" :loading="refreshing">
          <v-icon icon="mdi-refresh" class="mr-1" />
          Refresh
        </v-btn>
      </v-card-actions>

      <!-- Operational Mode Actions -->
      <v-card-actions v-else>
        <v-btn
          size="small"
          color="success"
          variant="tonal"
          prepend-icon="mdi-check-circle"
          disabled
        >
          Operational
        </v-btn>
        <v-spacer />
        <v-btn variant="tonal" size="small" @click="refreshStatus" :loading="refreshing">
          <v-icon icon="mdi-refresh" class="mr-1" />
          Refresh
        </v-btn>
      </v-card-actions>

      <!-- 🆕 NEU: Kaiser Actions -->
      <v-card-actions v-if="isKaiserMode && mqttStore.value.kaiser.godConnection.connected">
        <v-btn
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-account-plus"
          @click="registerWithGod"
          :loading="registering"
        >
          Re-register with God
        </v-btn>
        <v-btn
          size="small"
          color="warning"
          variant="tonal"
          prepend-icon="mdi-robot"
          @click="toggleAutonomousMode"
        >
          {{ mqttStore.value.kaiser.autonomousMode ? 'Disable' : 'Enable' }} Autonomous
        </v-btn>
        <v-spacer />
        <v-btn variant="tonal" size="small" @click="refreshStatus" :loading="refreshing">
          <v-icon icon="mdi-refresh" class="mr-1" />
          Refresh
        </v-btn>
      </v-card-actions>
    </template>
  </UnifiedCard>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'
import { formatUnixTimestamp, formatDuration } from '@/utils/time'
import {
  getCpuUsageColor,
  getCpuUsageStatus,
  getMemoryColor,
  getMemoryStatus,
  getUptimeColor,
  getUptimeStatus,
  formatBytes,
  formatUptime,
} from '@/utils/systemHealth'
import { safeSuccess, safeInfo } from '@/utils/snackbarUtils'

const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
  // ✅ NEU: Props für erweiterte Systeminformationen
  showSystemHealth: {
    type: Boolean,
    default: false,
  },
})

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const refreshing = ref(false)
const registering = ref(false)

// ✅ NEU: Cached Device Data über CentralDataHub
const device = computed(() => {
  return centralDataHub.getCachedData(`device-${props.espId}`, () => {
    return mqttStore.value.espDevices.get(props.espId) || {}
  })
})

// 🆕 NEU: Kaiser Mode Detection über CentralDataHub
const isKaiserMode = computed(() => {
  return centralDataHub.isKaiserMode
})

// ✅ NEU: Setup-Mode Detection über bestehende Struktur
const isSetupMode = computed(() => {
  return device.value?.setupMode === true
})

// 🆕 NEU: Kaiser-ID-Konflikt Detection über CentralDataHub
const hasKaiserIdConflict = computed(() => {
  return mqttStore.value.idConflicts.kaiser.has(props.espId)
})

function getSystemStateColor(state) {
  switch (state) {
    case 'OPERATIONAL':
      return 'success'
    case 'WIFI_SETUP':
    case 'MQTT_CONNECTING':
      return 'warning'
    case 'ERROR':
      return 'error'
    case 'LIBRARY_DOWNLOADING':
      return 'info'
    default:
      return 'grey'
  }
}

function getWebServerGuidance(device) {
  if (device.webserverActive) {
    return 'ESP in setup mode - configure via WiFi hotspot'
  } else if (device.systemState === 'OPERATIONAL') {
    return 'ESP operational - configure via this dashboard'
  } else if (device.systemState === 'MQTT_CONNECTING') {
    return 'ESP connecting to MQTT broker'
  } else if (device.systemState === 'WIFI_SETUP') {
    return 'ESP in WiFi setup mode'
  } else if (device.systemState === 'BOOT') {
    return 'ESP is booting up'
  } else {
    return 'Check ESP status'
  }
}

async function registerWithGod() {
  registering.value = true
  try {
    await mqttStore.value.registerWithGod()
    // ✅ NEU: Cache invalidieren nach Änderung
    centralDataHub.clearCache()
  } catch (error) {
    console.error('Failed to register with God:', error)
    centralDataHub.handleError(error, 'god-registration')
  } finally {
    registering.value = false
  }
}

function toggleAutonomousMode() {
  mqttStore.value.kaiser.autonomousMode = !mqttStore.value.kaiser.autonomousMode
  mqttStore.value.saveKaiserConfig()
  // ✅ NEU: Cache invalidieren nach Änderung
  centralDataHub.clearCache()
  safeInfo(`Autonomous mode ${mqttStore.value.kaiser.autonomousMode ? 'enabled' : 'disabled'}`)
}

function showSetupInstructions() {
  const espId = props.espId
  const shortId = espId.slice(-6)
  const message = `Connect to WiFi: ESP_Setup_${shortId} (Password: 12345678) then visit 192.168.4.1`

  safeInfo(message, { timeout: 10000 })
}

function showWebServerInfo() {
  const message = `ESP ${props.espId} is in setup mode. The WebServer is active and serving a configuration portal. Connect to the ESP's WiFi hotspot to configure network settings.`

  safeInfo(message, { timeout: 8000 })
}

// ✅ NEU: Optimierte Refresh-Funktion mit CentralDataHub
async function refreshStatus() {
  refreshing.value = true
  try {
    // Cache leeren für frische Daten
    centralDataHub.clearCache()

    // Status aktualisieren
    await mqttStore.value.refreshEspStatus(props.espId)

    // System-Status aktualisieren
    centralDataHub.updateSystemStatus()

    safeSuccess('Status aktualisiert')
  } catch (error) {
    console.error('Status refresh failed:', error)
    centralDataHub.handleError(error, 'status-refresh')
  } finally {
    refreshing.value = false
  }
}

function formatLastUpdate(timestamp) {
  if (!timestamp) return 'Never'
  return formatUnixTimestamp(timestamp, 'relative')
}
</script>

<style scoped>
.system-state-card {
  height: 100%;
}

.font-family-monospace {
  font-family: 'Courier New', monospace;
}
</style>
