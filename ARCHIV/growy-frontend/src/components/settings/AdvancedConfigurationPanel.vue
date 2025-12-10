<template>
  <div class="advanced-configuration-panel">
    <!-- Header -->
    <div class="d-flex align-center mb-6">
      <v-icon icon="mdi-tune" size="32" color="primary" class="mr-3" />
      <div>
        <h2 class="text-h5 font-weight-bold">Advanced Configuration</h2>
        <p class="text-body-2 text-grey-darken-1 mt-1">
          Erweiterte System-Konfiguration und Debug-Tools
        </p>
      </div>
    </div>

    <!-- Configuration Sections -->
    <v-row>
      <!-- System Health -->
      <v-col cols="12" md="6">
        <UnifiedCard title="System Health" icon="mdi-heart-pulse" variant="outlined" class="mb-4">
          <div class="system-health-grid">
            <div class="health-item">
              <div class="health-label">MQTT Status</div>
              <v-chip
                :color="mqttStore.value.connected ? 'success' : 'error'"
                size="small"
                variant="tonal"
              >
                {{ mqttStore.value.connected ? 'Connected' : 'Disconnected' }}
              </v-chip>
            </div>

            <div class="health-item">
              <div class="health-label">ESP Devices</div>
              <v-chip color="info" size="small" variant="tonal">
                {{ mqttStore.value.espDevices.size }} Online
              </v-chip>
            </div>

            <div class="health-item">
              <div class="health-label">Kaiser Mode</div>
              <v-chip
                :color="centralDataHub.isKaiserMode ? 'warning' : 'grey'"
                size="small"
                variant="tonal"
              >
                {{ centralDataHub.isKaiserMode ? 'Active' : 'Inactive' }}
              </v-chip>
            </div>

            <div class="health-item">
              <div class="health-label">Safe Mode</div>
              <v-chip
                :color="mqttStore.value.isSafeMode ? 'warning' : 'success'"
                size="small"
                variant="tonal"
              >
                {{ mqttStore.value.isSafeMode ? 'Enabled' : 'Disabled' }}
              </v-chip>
            </div>
          </div>

          <v-btn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-refresh"
            @click="refreshSystemHealth"
            :loading="refreshing"
            class="mt-3"
          >
            Refresh Status
          </v-btn>
        </UnifiedCard>
      </v-col>

      <!-- Quick Actions -->
      <v-col cols="12" md="6">
        <UnifiedCard
          title="Quick Actions"
          icon="mdi-lightning-bolt"
          variant="outlined"
          class="mb-4"
        >
          <div class="quick-actions-grid">
            <v-btn
              color="primary"
              variant="outlined"
              prepend-icon="mdi-cog"
              @click="openDeveloperTools"
              class="action-btn"
            >
              Developer Tools
            </v-btn>

            <v-btn
              color="secondary"
              variant="outlined"
              prepend-icon="mdi-database"
              @click="openDatabaseLogs"
              class="action-btn"
            >
              Database Logs
            </v-btn>

            <v-btn
              color="warning"
              variant="outlined"
              prepend-icon="mdi-restart"
              @click="restartSystem"
              :loading="restarting"
              class="action-btn"
            >
              Restart System
            </v-btn>
          </div>
        </UnifiedCard>
      </v-col>
    </v-row>

    <!-- Configuration Options -->
    <v-row>
      <v-col cols="12">
        <UnifiedCard
          title="System Configuration"
          icon="mdi-settings"
          variant="outlined"
          class="mb-4"
        >
          <v-row>
            <v-col cols="12" md="6">
              <v-switch
                v-model="configOptions.autoConnect"
                label="Auto-Connect MQTT"
                color="primary"
                hide-details
                class="mb-4"
              />

              <v-switch
                v-model="configOptions.debugMode"
                label="Debug Mode"
                color="warning"
                hide-details
                class="mb-4"
              />

              <v-switch
                v-model="configOptions.performanceMode"
                label="Performance Mode"
                color="success"
                hide-details
                class="mb-4"
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-select
                v-model="configOptions.logLevel"
                label="Log Level"
                :items="logLevels"
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />

              <v-select
                v-model="configOptions.cacheTimeout"
                label="Cache Timeout"
                :items="cacheTimeouts"
                variant="outlined"
                density="comfortable"
                class="mb-4"
              />

              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="mdi-content-save"
                @click="saveConfiguration"
                :loading="saving"
                class="mt-2"
              >
                Save Configuration
              </v-btn>
            </v-col>
          </v-row>
        </UnifiedCard>
      </v-col>
    </v-row>

    <!-- System Information -->
    <v-row>
      <v-col cols="12">
        <UnifiedCard title="System Information" icon="mdi-information" variant="outlined">
          <v-row>
            <v-col cols="12" md="4">
              <div class="info-item">
                <div class="info-label">Frontend Version</div>
                <div class="info-value">{{ systemInfo.frontendVersion }}</div>
              </div>
            </v-col>

            <v-col cols="12" md="4">
              <div class="info-item">
                <div class="info-label">Backend Version</div>
                <div class="info-value">{{ systemInfo.backendVersion || 'Unknown' }}</div>
              </div>
            </v-col>

            <v-col cols="12" md="4">
              <div class="info-item">
                <div class="info-label">Last Update</div>
                <div class="info-value">{{ formatLastUpdate(systemInfo.lastUpdate) }}</div>
              </div>
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <div class="d-flex justify-space-between align-center">
            <div>
              <div class="text-caption text-grey">Memory Usage</div>
              <div class="text-body-2">{{ systemInfo.memoryUsage }} MB</div>
            </div>

            <div>
              <div class="text-caption text-grey">Uptime</div>
              <div class="text-body-2">{{ formatUptime(systemInfo.uptime) }}</div>
            </div>

            <div>
              <div class="text-caption text-grey">Active Connections</div>
              <div class="text-body-2">{{ systemInfo.activeConnections }}</div>
            </div>
          </div>
        </UnifiedCard>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'
import { safeInfo } from '@/utils/snackbarUtils'

// Props (für zukünftige Verwendung)
// const props = defineProps({
//   selectedEsp: {
//     type: String,
//     default: null,
//   },
// })

// Router
const router = useRouter()

// ✅ CentralDataHub verwenden
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive state
const refreshing = ref(false)

const restarting = ref(false)
const saving = ref(false)

// Configuration options
const configOptions = reactive({
  autoConnect: true,
  debugMode: false,
  performanceMode: true,
  logLevel: 'info',
  cacheTimeout: '5min',
})

// System information
const systemInfo = reactive({
  frontendVersion: '3.5.0',
  backendVersion: null,
  lastUpdate: Date.now(),
  memoryUsage: 0,
  uptime: 0,
  activeConnections: 0,
})

// Options
const logLevels = [
  { title: 'Error', value: 'error' },
  { title: 'Warning', value: 'warning' },
  { title: 'Info', value: 'info' },
  { title: 'Debug', value: 'debug' },
]

const cacheTimeouts = [
  { title: '1 Minute', value: '1min' },
  { title: '5 Minutes', value: '5min' },
  { title: '15 Minutes', value: '15min' },
  { title: '30 Minutes', value: '30min' },
]

// Methods
const refreshSystemHealth = async () => {
  try {
    refreshing.value = true

    // Update system information
    systemInfo.memoryUsage = Math.round(performance.memory?.usedJSHeapSize / 1024 / 1024) || 0
    systemInfo.uptime = performance.now()
    systemInfo.activeConnections = mqttStore.value.espDevices.size

    safeInfo('System health refreshed')
  } catch (error) {
    console.error('Error refreshing system health:', error)
    safeInfo('Error refreshing system health')
  } finally {
    refreshing.value = false
  }
}

const openDeveloperTools = () => {
  router.push('/dev')
}

const openDatabaseLogs = () => {
  router.push('/dashboard')
  // TODO: Navigate to database logs section
}

const restartSystem = async () => {
  try {
    restarting.value = true

    const confirmRestart = confirm('Are you sure you want to restart the system?')
    if (!confirmRestart) return

    // TODO: Implement system restart
    safeInfo('System restart initiated')
  } catch (error) {
    console.error('System restart failed:', error)
    safeInfo('System restart failed')
  } finally {
    restarting.value = false
  }
}

const saveConfiguration = async () => {
  try {
    saving.value = true

    // TODO: Save configuration to backend
    await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API call

    safeInfo('Configuration saved successfully')
  } catch (error) {
    console.error('Error saving configuration:', error)
    safeInfo('Error saving configuration')
  } finally {
    saving.value = false
  }
}

const formatLastUpdate = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

const formatUptime = (uptime) => {
  const hours = Math.floor(uptime / 3600000)
  const minutes = Math.floor((uptime % 3600000) / 60000)
  return `${hours}h ${minutes}m`
}

// Initialize
onMounted(() => {
  refreshSystemHealth()
})
</script>

<style scoped>
.advanced-configuration-panel {
  max-width: 1200px;
  margin: 0 auto;
}

.system-health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.health-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.health-label {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.action-btn {
  height: 40px;
  font-size: 0.875rem;
}

.info-item {
  margin-bottom: 16px;
}

.info-label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.info-value {
  font-size: 1rem;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}

/* Responsive */
@media (max-width: 768px) {
  .system-health-grid {
    grid-template-columns: 1fr;
  }

  .quick-actions-grid {
    grid-template-columns: 1fr;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
