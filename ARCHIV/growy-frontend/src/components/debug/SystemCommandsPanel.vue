<template>
  <div class="bg-white rounded-lg p-4">
    <div class="d-flex justify-space-between align-center mb-4">
      <h2 class="text-h6">System Commands Panel</h2>
      <div class="text-caption text-grey">
        Last Command:
        {{
          systemCommands.lastCommand
            ? formatRelativeTime(systemCommands.lastCommand.timestamp)
            : 'None'
        }}
      </div>
    </div>

    <!-- ESP Selection -->
    <div class="mb-4">
      <v-select
        v-model="selectedEspId"
        label="Zielsystem auswählen"
        :items="espDevicesWithType"
        item-title="title"
        item-value="value"
        placeholder="Feld-Gerät oder Kaiser-System auswählen"
        variant="outlined"
        density="comfortable"
      >
        <template #item="{ item, props }">
          <v-list-item v-bind="props">
            <template #prepend>
              <v-icon
                :color="item.raw.isPi ? 'warning' : 'success'"
                :icon="item.raw.isPi ? 'mdi-raspberry-pi' : 'mdi-chip'"
              />
            </template>
            <v-list-item-title>{{ item.raw.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ item.raw.subtitle }}</v-list-item-subtitle>
            <template #append>
              <v-chip :color="item.raw.isPi ? 'warning' : 'success'" size="small" variant="tonal">
                {{ item.raw.isPi ? 'Kaiser' : 'ESP' }}
              </v-chip>
            </template>
          </v-list-item>
        </template>
      </v-select>
    </div>

    <!-- System Control Commands -->
    <v-expansion-panels class="mb-4">
      <v-expansion-panel>
        <v-expansion-panel-title>System Control</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-wrap gap-2">
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              @click="sendCommand('getSystemStatus')"
              :loading="systemCommands.loading"
            >
              Get Status
            </v-btn>
            <v-btn
              color="warning"
              variant="tonal"
              size="small"
              @click="sendCommand('enableSafeMode')"
              :loading="systemCommands.loading"
            >
              Safe Mode
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              size="small"
              @click="sendCommand('restartSystem')"
              :loading="systemCommands.loading"
            >
              Restart
            </v-btn>
            <v-btn
              color="info"
              variant="tonal"
              size="small"
              @click="sendCommand('syncTime')"
              :loading="systemCommands.loading"
            >
              Sync Time
            </v-btn>
            <v-btn
              color="success"
              variant="tonal"
              size="small"
              @click="sendCommand('startMeasurements')"
              :loading="systemCommands.loading"
            >
              Start Measurements
            </v-btn>
            <v-btn
              color="warning"
              variant="tonal"
              size="small"
              @click="sendCommand('stopMeasurements')"
              :loading="systemCommands.loading"
            >
              Stop Measurements
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Pi Integration Commands -->
      <v-expansion-panel>
        <v-expansion-panel-title>Pi Integration</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="mb-3">
            <v-text-field
              v-model="piUrl"
              label="Pi Server URL"
              placeholder="http://192.168.1.101:8080"
              variant="outlined"
              density="comfortable"
            />
          </div>
          <div class="d-flex flex-wrap gap-2">
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              @click="sendCommand('getPiStatus')"
              :loading="systemCommands.loading"
            >
              Pi Status
            </v-btn>
            <v-btn
              color="success"
              variant="tonal"
              size="small"
              @click="sendCommand('setPiUrl')"
              :loading="systemCommands.loading"
            >
              Set Pi URL
            </v-btn>
            <v-btn
              color="info"
              variant="tonal"
              size="small"
              @click="sendCommand('getPiHealthCheck')"
              :loading="systemCommands.loading"
            >
              Health Check
            </v-btn>
            <v-btn
              color="warning"
              variant="tonal"
              size="small"
              @click="sendCommand('getPiSensorStatistics')"
              :loading="systemCommands.loading"
            >
              Sensor Stats
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Actuator Control Commands -->
      <v-expansion-panel>
        <v-expansion-panel-title>Actuator Control</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="mb-3">
            <v-row>
              <v-col cols="12" md="3">
                <v-text-field
                  v-model="actuatorGpio"
                  label="GPIO"
                  type="number"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" md="3">
                <v-text-field
                  v-model="actuatorValue"
                  label="Value (0-1)"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="actuatorReason"
                  label="Reason"
                  placeholder="manual"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
            </v-row>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              @click="sendCommand('controlActuator')"
              :loading="systemCommands.loading"
            >
              Control Actuator
            </v-btn>
            <v-btn
              color="success"
              variant="tonal"
              size="small"
              @click="sendCommand('controlActuatorBinary', { state: true })"
              :loading="systemCommands.loading"
            >
              Turn On
            </v-btn>
            <v-btn
              color="warning"
              variant="tonal"
              size="small"
              @click="sendCommand('controlActuatorBinary', { state: false })"
              :loading="systemCommands.loading"
            >
              Turn Off
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              size="small"
              @click="sendCommand('emergencyStop')"
              :loading="systemCommands.loading"
            >
              Emergency Stop
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Configuration Commands -->
      <v-expansion-panel>
        <v-expansion-panel-title>Configuration</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-wrap gap-2">
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              @click="sendCommand('requestZoneConfig')"
              :loading="systemCommands.loading"
            >
              Request Config
            </v-btn>
            <v-btn
              color="warning"
              variant="tonal"
              size="small"
              @click="sendCommand('resetWiFiConfig')"
              :loading="systemCommands.loading"
            >
              Reset WiFi
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              size="small"
              @click="sendCommand('factoryReset')"
              :loading="systemCommands.loading"
            >
              Factory Reset
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Command History -->
    <div>
      <div class="d-flex justify-space-between align-center mb-2">
        <h3 class="text-subtitle-1 font-weight-medium">Command History</h3>
        <v-btn size="small" variant="text" @click="clearHistory">Clear</v-btn>
      </div>
      <v-card variant="outlined" class="command-history pa-2" max-height="300">
        <div v-for="(cmd, index) in systemCommands.commandHistory" :key="index" class="mb-2">
          <div class="d-flex align-center">
            <v-chip :color="cmd.success !== false ? 'success' : 'error'" size="small" class="mr-2">
              {{ cmd.success !== false ? '✓' : '✗' }}
            </v-chip>
            <span class="text-caption text-grey mr-2">{{ formatDateTime(cmd.timestamp) }}</span>
            <span class="text-caption font-weight-medium mr-2">{{ cmd.espId }}</span>
            <span class="text-body-2">{{ cmd.command }}</span>
          </div>
          <div v-if="cmd.error" class="text-caption text-error ml-4">Error: {{ cmd.error }}</div>
        </div>
      </v-card>
    </div>

    <!-- Error Display -->
    <v-alert
      v-if="systemCommands.error"
      type="error"
      variant="tonal"
      class="mt-4"
      closable
      @click:close="systemCommands.clearError()"
    >
      {{ systemCommands.error }}
    </v-alert>

    <!-- Safety Confirmation Dialog -->
    <v-dialog v-model="showSafetyDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-alert" color="warning" class="mr-2" />
          Sicherheitsbestätigung
        </v-card-title>
        <v-card-text>
          <p class="text-body-1 mb-3">
            Sie sind dabei, den Befehl <strong>{{ pendingCommand?.command }}</strong> an
            <strong>{{ getTargetGodName(pendingCommand?.espId) }}</strong> zu senden.
          </p>
          <p class="text-body-2 text-grey"><strong>Topic:</strong> {{ pendingCommand?.topic }}</p>
          <p class="text-body-2 text-grey">
            <strong>Payload:</strong> {{ JSON.stringify(pendingCommand?.payload, null, 2) }}
          </p>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            Sind Sie sicher, dass Sie diesen Befehl ausführen möchten?
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showSafetyDialog = false">Abbrechen</v-btn>
          <v-btn
            color="warning"
            @click="executePendingCommand"
            :loading="executingCommand"
            variant="tonal"
          >
            Befehl ausführen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatDateTime, formatRelativeTime } from '@/utils/time'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const systemCommands = computed(() => centralDataHub.systemCommands)

const selectedEspId = ref('')

// ✅ NEU: ESP-spezifische dynamische URL Konstruktion
const piUrl = computed(() => {
  const device = mqttStore.value.espDevices.get(selectedEspId.value)
  if (device?.serverAddress && device?.httpPort) {
    return `http://${device.serverAddress}:${device.httpPort}`
  }
  return 'http://192.168.1.101:8080' // Fallback für Backward Compatibility
})

const actuatorGpio = ref(5)
const actuatorValue = ref(0.5)
const actuatorReason = ref('manual')

// Safety Confirmation Variables
const showSafetyDialog = ref(false)
const pendingCommand = ref(null)
const executingCommand = ref(false)

const espDevicesWithType = computed(() => {
  const devices = []

  // ESP-Geräte hinzufügen
  mqttStore.value.espDevices.forEach((device, espId) => {
    devices.push({
      title: `ESP ${espId}`,
      value: espId,
      subtitle: device.lastHeartbeat ? 'Online' : 'Offline',
      isPi: false,
      type: 'esp',
    })
  })

  // Kaiser-System hinzufügen (basierend auf vorhandener Kaiser-ID Logik)
  if (mqttStore.value?.getKaiserId !== 'default_kaiser') {
    devices.push({
      title: `Kaiser ${mqttStore.value?.getKaiserId || 'default_kaiser'}`,
      value: 'kaiser_system',
      subtitle: 'Bibliothek-System',
      isPi: true,
      type: 'kaiser',
    })
  }

  return devices
})

async function sendCommand(command, additionalPayload = {}) {
  if (!selectedEspId.value) {
    window.$snackbar?.showError('Bitte wählen Sie ein Zielsystem aus')
    return
  }

  // Safety Check für kritische Commands
  if (requiresSafetyConfirmation(command)) {
    const topic = `kaiser/${mqttStore.value?.getKaiserId || 'default_kaiser'}/esp/${selectedEspId.value}/system/command`
    const payload = { command, ...additionalPayload }

    pendingCommand.value = { command, espId: selectedEspId.value, topic, payload }
    showSafetyDialog.value = true
    return
  }

  await executeCommand(command, additionalPayload)
}

async function executeCommand(command, additionalPayload = {}) {
  try {
    let payload = { ...additionalPayload }

    // Handle special cases
    switch (command) {
      case 'setPiUrl':
        payload = { pi_url: piUrl.value }
        break
      case 'controlActuator':
        payload = {
          gpio: actuatorGpio.value,
          value: actuatorValue.value,
          reason: actuatorReason.value,
        }
        break
      case 'controlActuatorBinary':
        payload = {
          gpio: actuatorGpio.value,
          ...payload,
          reason: actuatorReason.value,
        }
        break
      case 'emergencyStop':
        payload = {
          gpio: actuatorGpio.value,
          reason: 'emergency',
        }
        break
    }

    await systemCommands.value[command](selectedEspId.value, payload)
    window.$snackbar?.showSuccess(`Befehl ${command} erfolgreich gesendet`)
  } catch (error) {
    console.error(`Failed to send command ${command}:`, error)
    window.$snackbar?.showError(`Befehl ${command} fehlgeschlagen: ${error.message}`)
  }
}

async function executePendingCommand() {
  if (!pendingCommand.value) return

  executingCommand.value = true
  try {
    await executeCommand(pendingCommand.value.command, pendingCommand.value.payload)
    showSafetyDialog.value = false
    pendingCommand.value = null
  } finally {
    executingCommand.value = false
  }
}

function requiresSafetyConfirmation(command) {
  const criticalCommands = [
    'restartSystem',
    'enableSafeMode',
    'emergencyStop',
    'factoryReset',
    'resetWiFiConfig',
  ]
  return criticalCommands.includes(command)
}

function getTargetGodName(espId) {
  if (espId === 'kaiser_system') return `Kaiser ${mqttStore.value?.getKaiserId || 'default_kaiser'}`
  return `ESP ${espId}`
}

function clearHistory() {
  systemCommands.value.clearCommandHistory()
}
</script>

<style scoped>
.command-history {
  overflow-y: auto;
}
</style>
