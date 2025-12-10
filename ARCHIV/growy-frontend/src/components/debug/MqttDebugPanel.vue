<template>
  <div class="bg-white rounded-lg p-4">
    <div class="d-flex justify-space-between align-center mb-4">
      <h2 class="text-h6">MQTT Debug Panel</h2>
      <div class="text-caption text-grey">
        Last Message: {{ mqttStore.value.formattedLastMessageTime }}
      </div>
    </div>

    <!-- Connection Status -->
    <div class="mb-4">
      <div class="d-flex align-center">
        <v-icon
          :color="mqttStore.value.isConnected ? 'success' : 'error'"
          :icon="mqttStore.value.isConnected ? 'mdi-wifi' : 'mdi-wifi-off'"
          class="mr-2"
        />
        <span>{{ mqttStore.value.isConnected ? 'Connected' : 'Disconnected' }}</span>
      </div>
    </div>

    <!-- System Health -->
    <div class="mb-4">
      <h3 class="text-subtitle-1 font-weight-medium mb-2">System Health</h3>
      <v-row>
        <v-col cols="12" sm="6">
          <v-card variant="outlined" class="pa-3">
            <div class="text-caption text-grey">Free Heap</div>
            <div class="text-h6">{{ mqttStore.value.systemHealth.freeHeap }} bytes</div>
            <div class="text-caption text-grey">
              Updated: {{ formatRelativeTime(mqttStore.value.systemHealth.lastUpdate) }}
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6">
          <v-card variant="outlined" class="pa-3">
            <div class="text-caption text-grey">CPU Usage</div>
            <div class="text-h6">{{ mqttStore.value.systemHealth.cpuUsage }}%</div>
            <div class="text-caption text-grey">
              Uptime: {{ formatUptime(mqttStore.value.systemHealth.uptime) }}
            </div>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Message Log -->
    <div>
      <div class="d-flex justify-space-between align-center mb-2">
        <h3 class="text-subtitle-1 font-weight-medium">Message Log</h3>
        <v-btn size="small" variant="text" @click="clearMessages">Clear</v-btn>
      </div>
      <v-card variant="outlined" class="message-log pa-2" max-height="300">
        <div v-for="(msg, index) in mqttStore.value.messages" :key="index" class="mb-2">
          <div class="d-flex align-center">
            <span class="text-caption text-grey mr-2">{{ formatDateTime(msg.timestamp) }}</span>
            <span class="text-caption font-weight-medium mr-2">{{ msg.topic }}</span>
          </div>
          <pre class="message-content text-body-2 pa-1">{{
            JSON.stringify(msg.message, null, 2)
          }}</pre>
        </div>
      </v-card>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatDateTime, formatRelativeTime, formatDuration } from '@/utils/time'

export default defineComponent({
  name: 'MqttDebugPanel',

  setup() {
    const centralDataHub = useCentralDataHub()
    const mqttStore = computed(() => centralDataHub.mqttStore)

    // ✅ MIGRIERT: Uptime-Formatierung durch zentrale Utility mit Konvertierung
    const formatUptime = (seconds) => {
      if (!seconds) return 'N/A'
      return formatDuration(seconds * 1000) // Konvertierung: Sekunden → Millisekunden
    }

    const clearMessages = () => {
      mqttStore.value.messages = []
    }

    return {
      mqttStore,
      formatDateTime,
      formatRelativeTime,
      formatUptime,
      clearMessages,
    }
  },
})
</script>

<style scoped>
.message-log {
  overflow-y: auto;
}

.message-content {
  background-color: rgb(246, 248, 250);
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
}
</style>
