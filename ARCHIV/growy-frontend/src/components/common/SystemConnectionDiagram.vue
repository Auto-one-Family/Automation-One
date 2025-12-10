<template>
  <div class="system-diagram pa-4">
    <h4 class="text-center mb-4">{{ getSystemTitle() }} - Netzwerk-Architektur</h4>

    <div class="diagram-container">
      <!-- Aktuelles System (Hervorgehoben) -->
      <div class="system-node current" :class="getCurrentSystemClass()">
        <div class="system-header">
          <v-icon :icon="getCurrentSystemIcon()" size="x-large" />
          <h3>{{ getCurrentGodName() }}</h3>
          <v-chip :color="getCurrentSystemColor()" size="small">
            {{ getCurrentSystemType() }}
          </v-chip>
        </div>

        <div class="port-connections">
          <div class="port-item">
            <v-icon icon="mdi-web" color="success" />
            <span>HTTP: {{ centralConfig.value.httpPort }}</span>
          </div>
          <div class="port-item">
            <v-icon icon="mdi-wifi" color="primary" />
            <span>WebSocket: {{ centralConfig.value.mqttPortFrontend }}</span>
          </div>
          <div class="port-item">
            <v-icon icon="mdi-message" color="warning" />
            <span>MQTT: 1883</span>
          </div>
        </div>
      </div>

      <!-- Verbindungslinien -->
      <div class="connections">
        <div class="connection-line">
          <div class="line http"></div>
          <span class="connection-label">Browser → Web-Interface</span>
        </div>
        <div class="connection-line">
          <div class="line websocket"></div>
          <span class="connection-label">Dashboard → Live-Daten</span>
        </div>
        <div class="connection-line">
          <div class="line mqtt"></div>
          <span class="connection-label">{{ getMqttConnectionLabel() }}</span>
        </div>
      </div>

      <!-- Verbundene Systeme -->
      <div class="connected-systems">
        <div v-for="system in getConnectedSystems()" :key="system.name" class="connected-system">
          <v-icon :icon="system.icon" :color="system.color" />
          <span>{{ system.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)

// System-Information
function getCurrentGodName() {
  try {
    // ✅ KORRIGIERT: Zeige immer den benutzerfreundlichen God-Namen
    if (centralConfig.value.godName && centralConfig.value.godName !== 'Mein IoT System') {
      return centralConfig.value.godName
    }
    return 'God Pi'
  } catch (error) {
    console.warn('Error getting god name:', error.message)
    return 'God Pi'
  }
}

function getCurrentSystemType() {
  try {
    if (centralDataHub.isKaiserMode) return 'EDGE CONTROLLER'
    if (centralDataHub.isGodMode) return 'GOD PI'
    return 'CONTROL SYSTEM'
  } catch (error) {
    console.warn('Error getting system type:', error.message)
    return 'CONTROL SYSTEM'
  }
}

function getCurrentSystemIcon() {
  try {
    if (centralDataHub.isKaiserMode) return 'mdi-server'
    return 'mdi-server'
  } catch (error) {
    console.warn('Error getting system icon:', error.message)
    return 'mdi-server'
  }
}

function getCurrentSystemColor() {
  try {
    if (centralDataHub.isKaiserMode) return 'primary'
    return 'secondary'
  } catch (error) {
    console.warn('Error getting system color:', error.message)
    return 'secondary'
  }
}

function getCurrentSystemClass() {
  try {
    if (centralDataHub.isKaiserMode) return 'kaiser'
    return 'god-pi'
  } catch (error) {
    console.warn('Error getting system class:', error.message)
    return 'god-pi'
  }
}

function getMqttConnectionLabel() {
  try {
    if (centralDataHub.isKaiserMode) return 'ESP32 → Kaiser'
    return 'Kaiser/ESP32 → God Pi'
  } catch (error) {
    console.warn('Error getting MQTT connection label:', error.message)
    return 'Kaiser/ESP32 → God Pi'
  }
}

function getConnectedSystems() {
  try {
    const systems = []

    if (centralDataHub.isKaiserMode) {
      // Kaiser sieht: God Pi + ESP32
      systems.push(
        { name: 'God Pi Server', icon: 'mdi-server', color: 'secondary' },
        { name: 'ESP32 Devices', icon: 'mdi-memory', color: 'success' },
      )
    } else {
      // God Pi sieht: Kaiser Controllers + ESP32
      systems.push(
        { name: 'Kaiser Controllers', icon: 'mdi-server', color: 'primary' },
        { name: 'ESP32 Network', icon: 'mdi-memory', color: 'success' },
      )
    }

    return systems
  } catch (error) {
    console.warn('Error getting connected systems:', error.message)
    return [
      { name: 'Kaiser Controllers', icon: 'mdi-server', color: 'primary' },
      { name: 'ESP32 Network', icon: 'mdi-memory', color: 'success' },
    ]
  }
}

function getSystemTitle() {
  return getCurrentGodName()
}
</script>

<style scoped>
.system-diagram {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 8px;
}

.diagram-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  align-items: center;
}

.system-node {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 500px;
}

.system-node.current {
  border: 3px solid #2196f3;
  box-shadow: 0 6px 20px rgba(33, 150, 243, 0.3);
}

.system-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.port-connections {
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
  gap: 1rem;
}

.port-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #f8f9fa;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 500;
}

.connections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 400px;
}

.connection-line {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.line {
  height: 3px;
  flex: 1;
  border-radius: 2px;
}

.line.http {
  background: #4caf50;
}
.line.websocket {
  background: #2196f3;
}
.line.mqtt {
  background: #ff9800;
}

.connection-label {
  font-size: 0.875rem;
  color: #666;
  white-space: nowrap;
}

.connected-systems {
  display: flex;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.connected-system {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
</style>
