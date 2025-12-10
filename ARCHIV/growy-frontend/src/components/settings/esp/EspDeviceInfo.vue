<template>
  <div class="esp-device-info">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-information" color="primary" class="mr-2" />
      <h4 class="text-subtitle-1 font-weight-medium">Geräteinformationen</h4>
    </div>

    <v-row>
      <v-col cols="12" md="6">
        <v-text-field
          v-model="deviceConfig.friendlyName"
          label="Anzeigename"
          placeholder="Gewächshaus 1 - Tomaten"
          variant="outlined"
          density="comfortable"
          :readonly="readonly"
          @update:model-value="saveDeviceConfig"
        />
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field
          v-model="deviceInfo.server_address"
          label="IP-Adresse"
          variant="outlined"
          density="comfortable"
          readonly
          prepend-inner-icon="mdi-wifi"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <v-select
          v-model="deviceConfig.board_type"
          label="Board-Typ"
          :items="boardTypeOptions"
          item-title="name"
          item-value="value"
          variant="outlined"
          density="comfortable"
          :readonly="readonly"
          @update:model-value="saveBoardType"
        />
      </v-col>
      <v-col cols="12" md="6">
        <v-chip :color="deviceInfo.safeMode ? 'warning' : 'success'" variant="tonal" class="mt-4">
          <v-icon
            :icon="deviceInfo.safeMode ? 'mdi-shield-alert' : 'mdi-shield-check'"
            class="mr-2"
          />
          {{ deviceInfo.safeMode ? 'SafeMode aktiv' : 'Normaler Modus' }}
        </v-chip>
      </v-col>
    </v-row>

    <!-- Connection Status -->
    <v-row class="mt-4">
      <v-col cols="12" md="4">
        <v-card variant="tonal" class="pa-4 text-center">
          <v-icon
            :color="connectionStatus.wifi ? 'success' : 'error'"
            :icon="connectionStatus.wifi ? 'mdi-wifi' : 'mdi-wifi-off'"
            size="large"
            class="mb-2"
          />
          <div class="text-subtitle-2">WiFi</div>
          <div class="text-caption text-grey">
            {{ connectionStatus.wifi ? 'Verbunden' : 'Nicht verbunden' }}
          </div>
          <div v-if="deviceInfo.wifiRssi" class="text-caption text-grey">
            Signal: {{ deviceInfo.wifiRssi }} dBm
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="tonal" class="pa-4 text-center">
          <v-icon
            :color="connectionStatus.mqtt ? 'success' : 'error'"
            :icon="connectionStatus.mqtt ? 'mdi-server-network' : 'mdi-server-network-off'"
            size="large"
            class="mb-2"
          />
          <div class="text-subtitle-2">MQTT Broker</div>
          <div class="text-caption text-grey">
            {{ connectionStatus.mqtt ? 'Verbunden' : 'Nicht verbunden' }}
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="tonal" class="pa-4 text-center">
          <v-icon
            :color="connectionStatus.pi ? 'success' : 'error'"
            :icon="connectionStatus.pi ? 'mdi-raspberry-pi' : 'mdi-raspberry-pi-off'"
            size="large"
            class="mb-2"
          />
          <div class="text-subtitle-2">Pi Server</div>
          <div class="text-caption text-grey">
            {{ connectionStatus.pi ? 'Erreichbar' : 'Nicht erreichbar' }}
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Device Statistics -->
    <v-row class="mt-4">
      <v-col cols="12" md="3">
        <v-card variant="tonal" class="pa-4">
          <div class="text-subtitle-2 text-primary mb-2">Uptime</div>
          <div class="text-h6">{{ formatUptime(deviceInfo.uptime) }}</div>
          <div class="text-caption text-grey">Betriebszeit</div>
        </v-card>
      </v-col>
      <v-col cols="12" md="3">
        <v-card variant="tonal" class="pa-4">
          <div class="text-subtitle-2 text-success mb-2">Free Heap</div>
          <div class="text-h6">{{ formatBytes(deviceInfo.freeHeap) }}</div>
          <div class="text-caption text-grey">Verfügbarer Speicher</div>
        </v-card>
      </v-col>
      <v-col cols="12" md="3">
        <v-card variant="tonal" class="pa-4">
          <div class="text-subtitle-2 text-warning mb-2">CPU Usage</div>
          <div class="text-h6">{{ deviceInfo.cpuUsage || 0 }}%</div>
          <div class="text-caption text-grey">CPU Auslastung</div>
        </v-card>
      </v-col>
      <v-col cols="12" md="3">
        <v-card variant="tonal" class="pa-4">
          <div class="text-subtitle-2 text-info mb-2">Firmware</div>
          <div class="text-h6">{{ deviceInfo.firmware_version || 'Unbekannt' }}</div>
          <div class="text-caption text-grey">Aktuelle Version</div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatDuration } from '@/utils/time'

const props = defineProps({
  espId: { type: String, required: true },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['device-config-change'])

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const espManagement = computed(() => centralDataHub.espManagement)

// ✅ NEU: Device Config für erweiterte Konfiguration
const deviceConfig = ref({
  friendlyName: '',
  board_type: 'ESP32_DEVKIT',
})

// ✅ NEU: Board Type Options aus espManagement Store
const boardTypeOptions = computed(() => {
  const configs = espManagement.value.boardPinConfigs
  return Object.entries(configs).map(([value, config]) => ({
    name: config.name,
    value: value,
  }))
})

// Computed Properties
const deviceInfo = computed(() => {
  return mqttStore.value.espDevices.get(props.espId) || {}
})

const connectionStatus = computed(() => {
  const device = deviceInfo.value
  return {
    wifi: device.wifiConnected || false,
    mqtt: device.mqttConnected || false,
    pi: device.piConnected || false,
  }
})

// ✅ NEU: Initialisiere deviceConfig
const initializeDeviceConfig = () => {
  deviceConfig.value.friendlyName = deviceInfo.value.friendlyName || ''
  deviceConfig.value.board_type =
    deviceInfo.value.board_type || deviceInfo.value.boardType || 'ESP32_DEVKIT'
}

// ✅ NEU: Watch für deviceInfo Änderungen
watch(
  deviceInfo,
  () => {
    if (props.espId) {
      initializeDeviceConfig()
    }
  },
  { immediate: true },
)

// ✅ NEU: Device Config speichern
const saveDeviceConfig = async () => {
  try {
    const device = mqttStore.value.espDevices.get(props.espId)
    if (device) {
      device.friendlyName = deviceConfig.value.friendlyName
      await mqttStore.value.sendSystemCommand(props.espId, 'update_device_config', {
        friendlyName: deviceConfig.value.friendlyName,
        timestamp: Date.now(),
      })
      emit('device-config-change', { espId: props.espId, config: deviceConfig.value })
      window.$snackbar?.showSuccess('Gerätename aktualisiert')
    }
  } catch (error) {
    console.error('Failed to save device config:', error)
    window.$snackbar?.showError(`Fehler beim Speichern: ${error.message}`)
  }
}

// ✅ NEU: Board Type speichern
const saveBoardType = async () => {
  try {
    const device = mqttStore.value.espDevices.get(props.espId)
    if (device) {
      device.board_type = deviceConfig.value.board_type
      device.boardType = deviceConfig.value.board_type // Backward compatibility
      await mqttStore.value.sendSystemCommand(props.espId, 'update_board_type', {
        board_type: deviceConfig.value.board_type,
        timestamp: Date.now(),
      })
      emit('device-config-change', { espId: props.espId, config: deviceConfig.value })
      window.$snackbar?.showSuccess('Board-Typ aktualisiert')
    }
  } catch (error) {
    console.error('Failed to save board type:', error)
    window.$snackbar?.showError(`Fehler beim Speichern: ${error.message}`)
  }
}

// ✅ MIGRIERT: Uptime-Formatierung durch zentrale Utility mit Konvertierung
const formatUptime = (uptime) => {
  if (!uptime) return 'Unbekannt'
  return formatDuration(uptime * 1000) // Konvertierung: Sekunden → Millisekunden
}

const formatBytes = (bytes) => {
  if (!bytes) return 'Unbekannt'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}
</script>

<style scoped>
.esp-device-info {
  width: 100%;
}
</style>
