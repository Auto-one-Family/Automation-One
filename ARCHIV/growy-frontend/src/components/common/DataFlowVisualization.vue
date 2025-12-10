<template>
  <div class="data-flow-visualization">
    <v-divider class="my-3" />
    <v-alert type="info" variant="tonal" density="compact" class="mb-3">
      <strong>Hinweis:</strong> Diese Konfiguration ist kritisch für die Systemfunktion. Die Ports
      sind für verschiedene Kommunikationsarten optimiert.
    </v-alert>

    <!-- Datenfluss-Diagramm -->
    <div class="flow-diagram mb-3">
      <div class="text-subtitle-2 font-weight-medium mb-2">Datenfluss:</div>
      <div class="d-flex align-center justify-space-between">
        <div class="text-center">
          <v-icon icon="mdi-thermometer" color="primary" size="large" />
          <div class="text-caption">Agenten</div>
          <div class="text-caption text-grey">Sensoren</div>
        </div>
        <v-icon icon="mdi-arrow-right" color="grey" />
        <div class="text-center">
          <v-icon icon="mdi-server" color="warning" size="large" />
          <div class="text-caption">Zentrale</div>
          <div class="text-caption text-grey">Backend</div>
        </div>
        <v-icon icon="mdi-arrow-right" color="grey" />
        <div class="text-center">
          <v-icon icon="mdi-monitor" color="success" size="large" />
          <div class="text-caption">Dashboard</div>
          <div class="text-caption text-grey">Frontend</div>
        </div>
      </div>
    </div>

    <!-- Port-Erklärungen -->
    <div class="port-explanations">
      <div class="text-subtitle-2 font-weight-medium mb-2">Port-Erklärungen:</div>

      <v-expansion-panels variant="accordion" class="mb-3">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <div class="d-flex align-center">
              <v-icon icon="mdi-api" color="info" class="mr-2" />
              <span>HTTP API (Port {{ centralConfig.value.httpPort }})</span>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="text-body-2">
              <p>
                <strong>Verwendung:</strong>
                {{ centralConfig.value.getPortExplanations?.http?.useCase }}
              </p>
              <p>
                <strong>Protokoll:</strong>
                {{ centralConfig.value.getPortExplanations?.http?.protocol }}
              </p>
              <p>
                <strong>Richtung:</strong>
                {{ centralConfig.value.getPortExplanations?.http?.direction }}
              </p>
              <p>
                <strong>Beispiel:</strong>
                {{ centralConfig.value.getPortExplanations?.http?.example }}
              </p>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel>
          <v-expansion-panel-title>
            <div class="d-flex align-center">
              <v-icon icon="mdi-devices" color="primary" class="mr-2" />
              <span>Agent MQTT (Port {{ centralConfig.value.mqttPortESP32 }})</span>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="text-body-2">
              <p>
                <strong>Verwendung:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttESP32?.useCase }}
              </p>
              <p>
                <strong>Protokoll:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttESP32?.protocol }}
              </p>
              <p>
                <strong>Richtung:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttESP32?.direction }}
              </p>
              <p>
                <strong>Beispiel:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttESP32?.example }}
              </p>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel>
          <v-expansion-panel-title>
            <div class="d-flex align-center">
              <v-icon icon="mdi-monitor" color="success" class="mr-2" />
              <span>Dashboard MQTT (Port {{ centralConfig.value.mqttPortFrontend }})</span>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="text-body-2">
              <p>
                <strong>Verwendung:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttFrontend?.useCase }}
              </p>
              <p>
                <strong>Protokoll:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttFrontend?.protocol }}
              </p>
              <p>
                <strong>Richtung:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttFrontend?.direction }}
              </p>
              <p>
                <strong>Beispiel:</strong>
                {{ centralConfig.value.getPortExplanations?.mqttFrontend?.example }}
              </p>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <!-- URL-Vorschau -->
    <div class="url-preview mb-3">
      <div class="text-caption text-grey mb-2">Aktuelle URLs:</div>
      <v-chip color="info" size="small" variant="tonal" class="mr-2 mb-2">
        API: http://{{ centralConfig.value.serverIP }}:{{ centralConfig.value.httpPort }}
      </v-chip>
      <v-chip color="primary" size="small" variant="tonal" class="mr-2 mb-2">
        Agenten: mqtt://{{ centralConfig.value.serverIP }}:{{ centralConfig.value.mqttPortESP32 }}
      </v-chip>
      <v-chip color="success" size="small" variant="tonal" class="mb-2">
        Dashboard: ws://{{ centralConfig.value.serverIP }}:{{
          centralConfig.value.mqttPortFrontend
        }}
      </v-chip>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)
</script>

<style scoped>
.data-flow-visualization {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
}

.flow-diagram {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.port-explanations {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.url-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .flow-diagram .d-flex {
    flex-direction: column;
    gap: 1rem;
  }

  .flow-diagram .d-flex > div {
    margin: 0.5rem 0;
  }
}
</style>
