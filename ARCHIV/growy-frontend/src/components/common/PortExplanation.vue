<template>
  <v-card variant="outlined" class="mb-6">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-network" class="mr-2" />
      Port-Konfiguration & Verbindungen
      <v-spacer />
      <v-btn
        icon="mdi-help-circle-outline"
        size="small"
        variant="text"
        @click="showHelp = !showHelp"
      />
    </v-card-title>

    <!-- Port-Übersicht Karten -->
    <v-card-text>
      <v-row>
        <v-col cols="12" md="4">
          <v-card variant="tonal" color="success" class="pa-4 text-center">
            <v-icon icon="mdi-web" size="large" class="mb-2" />
            <div class="text-h4 font-weight-bold">{{ httpPort }}</div>
            <div class="text-subtitle-1 font-weight-medium">HTTP API</div>
            <div class="text-caption">{{ getHttpDescription() }}</div>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card variant="tonal" color="primary" class="pa-4 text-center">
            <v-icon icon="mdi-monitor-dashboard" size="large" class="mb-2" />
            <div class="text-h4 font-weight-bold">{{ mqttPortFrontend }}</div>
            <div class="text-subtitle-1 font-weight-medium">MQTT WebSocket</div>
            <div class="text-caption">Dashboard Echtzeit-Verbindung</div>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card variant="tonal" color="warning" class="pa-4 text-center">
            <v-icon icon="mdi-memory" size="large" class="mb-2" />
            <div class="text-h4 font-weight-bold">1883</div>
            <div class="text-subtitle-1 font-weight-medium">MQTT Native</div>
            <div class="text-caption">ESP32-Geräte Verbindung</div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Erweiterte Hilfe -->
      <v-expand-transition>
        <div v-if="showHelp" class="mt-4">
          <v-divider class="mb-4" />
          <SystemConnectionDiagram />
        </div>
      </v-expand-transition>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import SystemConnectionDiagram from './SystemConnectionDiagram.vue'

const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)
const showHelp = ref(false)

// Computed values
const httpPort = computed(() => centralConfig.value.httpPort)
const mqttPortFrontend = computed(() => centralConfig.value.mqttPortFrontend)

// Dynamische Beschreibungen
function getHttpDescription() {
  if (centralDataHub.isKaiserMode) {
    return 'Kaiser Edge Controller API'
  } else if (centralDataHub.isGodMode) {
    return 'God Pi Central API'
  }
  return 'System API & Web-Interface'
}
</script>
