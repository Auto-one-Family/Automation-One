<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub?.mqttStore || null)

// 🆕 NEU: Kaiser Mode Detection
const isKaiserMode = computed(() => {
  try {
    return centralDataHub.isKaiserMode
  } catch (error) {
    console.warn('Error checking kaiser mode:', error.message)
    return false
  }
})

// Dummy-Daten für die Entwicklung
const systemStatus = ref({
  online: true,
  lastUpdate: new Date().toISOString(),
  activeZones: 2,
  totalDevices: 4,
  alerts: [],
})

// 🆕 NEU: Kaiser-ID-Konflikt-UI
const showConflictDetails = ref(false)

// 🆕 NEU: Kaiser Functions
async function registerWithGod() {
  try {
    if (!mqttStore.value?.registerWithGod) {
      console.warn('MQTT Store not ready for God registration')
      return
    }
    await mqttStore.value.registerWithGod()
    window.$snackbar?.showSuccess('Successfully registered with God Pi')
  } catch (error) {
    console.error('God registration failed:', error)
    window.$snackbar?.showError('Failed to register with God Pi')
  }
}

function toggleAutonomousMode() {
  if (!mqttStore.value?.kaiser) {
    console.warn('MQTT Store kaiser not ready')
    return
  }
  mqttStore.value.kaiser.autonomousMode = !mqttStore.value.kaiser.autonomousMode
  mqttStore.value.saveKaiserConfig?.()
  window.$snackbar?.showInfo(
    `Autonomous mode ${mqttStore.value.kaiser.autonomousMode ? 'enabled' : 'disabled'}`,
  )
}

async function emergencyStopAll() {
  const confirm = window.confirm(
    'EMERGENCY STOP: This will stop all actuators immediately. Continue?',
  )
  if (confirm) {
    try {
      if (!mqttStore.value?.emergencyStopAll) {
        console.warn('MQTT Store not ready for emergency stop')
        return
      }
      await mqttStore.value.emergencyStopAll()
      window.$snackbar?.showSuccess('Emergency stop executed for all devices')
    } catch (error) {
      console.error('Emergency stop failed:', error)
      window.$snackbar?.showError('Emergency stop failed')
    }
  }
}

function showKaiserStatus() {
  const status = {
    kaiserId: centralDataHub.getUnifiedKaiserId,
    godConnected: mqttStore.value.kaiser.godConnection.connected,
    autonomousMode: mqttStore.value.kaiser.autonomousMode,
    pushEvents: mqttStore.value.kaiser.syncStats.pushEvents,
    godCommands: mqttStore.value.kaiser.syncStats.godCommands,
    failedSyncs: mqttStore.value.kaiser.syncStats.failedSyncs,
  }

  const message = `Kaiser Status:
ID: ${status.kaiserId}
God Pi: ${status.godConnected ? 'Connected' : 'Disconnected'}
Autonomous: ${status.autonomousMode ? 'Enabled' : 'Disabled'}
Push Events: ${status.pushEvents}
God Commands: ${status.godCommands}
Failed Syncs: ${status.failedSyncs}`

  window.$snackbar?.showInfo(message, { timeout: 8000 })
}

// 🆕 NEU: Kaiser Activation Functions
function activateKaiserMode() {
  const kaiserId = prompt(
    'Geben Sie eine Kaiser ID ein (z.B. greenhouse_kaiser_01):',
    'greenhouse_kaiser_01',
  )
  if (kaiserId && kaiserId.trim()) {
    mqttStore.value.setKaiserId(kaiserId.trim())
    mqttStore.value.saveKaiserConfig()
    window.$snackbar?.showSuccess(`Kaiser-Modus aktiviert: ${kaiserId}`)
    // Reload page to show Kaiser UI
    setTimeout(() => location.reload(), 1000)
  }
}

function showKaiserInfo() {
  const info = `👑 Kaiser Controller Features:

• God Pi Integration: Zentrale Synchronisation mit God Pi Server
• Autonomous Mode: Autonome Operation ohne manuelle Eingriffe
• Emergency Controls: Notfall-Stopp für alle ESP-Geräte
• Push-Sync: Automatische Event-Synchronisation
• Edge Controller: Erweiterte Edge-Funktionalität

Aktivieren Sie den Kaiser-Modus, um diese Features zu nutzen!`

  window.$snackbar?.showInfo(info, { timeout: 12000 })
}

// 🆕 NEU: ID-Konflikt-Funktionen (konsistent mit anderen Komponenten)
async function resolveConflict(espId, action, type = 'kaiser') {
  try {
    await mqttStore.value.resolveIdConflict(type, espId, action)
  } catch (error) {
    console.error('Fehler beim Lösen des Konflikts:', error)
  }
}

function clearAllConflicts() {
  const confirm = window.confirm('Alle ID-Konflikte löschen?')
  if (confirm) {
    mqttStore.value.clearAllIdConflicts()
    window.$snackbar?.showInfo('Alle ID-Konflikte gelöscht')
  }
}

function getConflictTypeName(type) {
  const names = {
    kaiser: 'Kaiser-ID',
    masterZone: 'Master-Zone-ID',
    subzone: 'Subzone-ID',
    espId: 'ESP-ID',
  }
  return names[type] || type
}
</script>

<template>
  <div class="dashboard">
    <!-- 🆕 NEU: Kaiser Status Header (nur wenn Kaiser-Modus aktiv) -->
    <div
      v-if="isKaiserMode"
      class="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 shadow rounded-lg p-6"
    >
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">
            👑 Kaiser Controller: {{ centralDataHub.getUnifiedKaiserId }}
          </h2>
          <p class="text-gray-600">
            Edge Controller für autonome Operation und God Pi Synchronisation
          </p>
        </div>
        <div class="text-right">
          <div class="flex items-center space-x-4">
            <!-- God Connection Status -->
            <div class="text-center">
              <div class="text-sm text-gray-600">God Pi</div>
              <div class="flex items-center">
                <div
                  :class="[
                    'w-3 h-3 rounded-full mr-2',
                    mqttStore.value.kaiser.godConnection.connected ? 'bg-green-500' : 'bg-red-500',
                  ]"
                ></div>
                <span class="text-sm font-medium">
                  {{
                    mqttStore.value.kaiser.godConnection.connected ? 'Connected' : 'Disconnected'
                  }}
                </span>
              </div>
            </div>

            <!-- Autonomous Mode -->
            <div class="text-center" v-if="mqttStore.value.kaiser.autonomousMode">
              <div class="text-sm text-gray-600">Mode</div>
              <div class="flex items-center">
                <span class="text-sm font-medium text-orange-600">🤖 Autonomous</span>
              </div>
            </div>

            <!-- Sync Stats -->
            <div class="text-center">
              <div class="text-sm text-gray-600">Sync</div>
              <div class="text-sm font-medium">
                {{ mqttStore.value.kaiser.syncStats.pushEvents }} events
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 🆕 NEU: Kaiser Activation Section (nur wenn Kaiser-Modus NICHT aktiv) -->
    <div v-else class="mb-8 bg-gradient-to-r from-yellow-50 to-orange-50 shadow rounded-lg p-6">
      <div class="text-center">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">👑 Kaiser Controller Integration</h2>
        <p class="text-gray-600 mb-6">
          Aktivieren Sie den Kaiser-Modus, um erweiterte Edge Controller Funktionen zu nutzen.
        </p>
        <div class="flex justify-center space-x-4">
          <button
            class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium"
            @click="activateKaiserMode"
          >
            Kaiser-Modus aktivieren
          </button>
          <button
            class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium"
            @click="showKaiserInfo"
          >
            Mehr erfahren
          </button>
        </div>
      </div>
    </div>

    <!-- 🆕 NEU: ID-Konflikte Anzeige (konsistent mit anderen Komponenten) -->
    <div
      v-if="mqttStore?.value?.hasIdConflicts"
      class="mb-8 bg-yellow-50 border border-yellow-200 shadow rounded-lg p-6"
    >
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-yellow-800 mb-2">⚠️ ID-Konflikte erkannt</h2>
          <p class="text-yellow-700">
            {{ mqttStore?.value?.getAllConflicts?.length || 0 }} Konflikt(e) erkannt
          </p>
        </div>
        <div class="flex gap-2">
          <button
            class="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium"
            @click="showConflictDetails = !showConflictDetails"
          >
            {{ showConflictDetails ? 'Verstecken' : 'Details' }}
          </button>
          <button
            class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium"
            @click="clearAllConflicts"
          >
            Alle löschen
          </button>
        </div>
      </div>

      <!-- Konflikt-Details -->
      <div v-if="showConflictDetails" class="mt-4">
        <div
          v-for="conflict in mqttStore?.value?.getAllConflicts || []"
          :key="`${conflict.type}-${conflict.espId}`"
          class="bg-white p-4 rounded-lg border border-yellow-300 mb-3"
        >
          <div class="flex items-center justify-between">
            <div>
              <strong class="text-gray-900"
                >{{ getConflictTypeName(conflict.type) }} - ESP {{ conflict.espId }}</strong
              >
              <br />
              <span class="text-sm text-gray-600">
                Gerät:
                <code class="bg-gray-100 px-1 rounded">{{ conflict.conflict.deviceId }}</code>
                <br />
                Aktuell:
                <code class="bg-blue-100 px-1 rounded">{{ conflict.conflict.currentId }}</code>
              </span>
            </div>
            <div class="flex gap-2">
              <button
                class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                @click="resolveConflict(conflict.espId, 'adopt', conflict.type)"
              >
                Übernehmen
              </button>
              <button
                class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                @click="resolveConflict(conflict.espId, 'ignore', conflict.type)"
              >
                Ignorieren
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- System Status Overview -->
    <div class="mb-8 bg-white shadow rounded-lg p-6">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">System Status</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="stat-card bg-green-50 p-4 rounded-lg">
          <div class="text-sm text-green-600 font-medium">System Status</div>
          <div class="text-2xl font-bold text-green-700">
            {{ systemStatus.online ? 'Online' : 'Offline' }}
          </div>
        </div>

        <div class="stat-card bg-blue-50 p-4 rounded-lg">
          <div class="text-sm text-blue-600 font-medium">Aktive Zonen</div>
          <div class="text-2xl font-bold text-blue-700">
            {{ systemStatus.activeZones }}
          </div>
        </div>

        <div class="stat-card bg-purple-50 p-4 rounded-lg">
          <div class="text-sm text-purple-600 font-medium">Geräte</div>
          <div class="text-2xl font-bold text-purple-700">
            {{ systemStatus.totalDevices }}
          </div>
        </div>

        <div class="stat-card bg-gray-50 p-4 rounded-lg">
          <div class="text-sm text-gray-600 font-medium">Letztes Update</div>
          <div class="text-lg font-bold text-gray-700">
            {{ new Date(systemStatus.lastUpdate).toLocaleTimeString() }}
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="mb-8 bg-white shadow rounded-lg p-6">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Schnellzugriff</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          class="quick-action-btn bg-indigo-50 hover:bg-indigo-100 p-4 rounded-lg text-center"
        >
          <span class="block text-2xl mb-2">🌱</span>
          <span class="text-sm font-medium text-indigo-700">Neue Zone</span>
        </button>

        <button class="quick-action-btn bg-green-50 hover:bg-green-100 p-4 rounded-lg text-center">
          <span class="block text-2xl mb-2">📊</span>
          <span class="text-sm font-medium text-green-700">Statistiken</span>
        </button>

        <button
          class="quick-action-btn bg-yellow-50 hover:bg-yellow-100 p-4 rounded-lg text-center"
        >
          <span class="block text-2xl mb-2">⚙️</span>
          <span class="text-sm font-medium text-yellow-700">Konfiguration</span>
        </button>

        <button class="quick-action-btn bg-blue-50 hover:bg-blue-100 p-4 rounded-lg text-center">
          <span class="block text-2xl mb-2">📱</span>
          <span class="text-sm font-medium text-blue-700">Geräte</span>
        </button>
      </div>

      <!-- 🆕 NEU: Kaiser Quick Actions (nur im Kaiser-Modus) -->
      <div v-if="isKaiserMode" class="mt-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">👑 Kaiser Actions</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            class="quick-action-btn bg-purple-50 hover:bg-purple-100 p-4 rounded-lg text-center"
            @click="registerWithGod"
          >
            <span class="block text-2xl mb-2">👑</span>
            <span class="text-sm font-medium text-purple-700">Register with God</span>
          </button>

          <button
            class="quick-action-btn bg-orange-50 hover:bg-orange-100 p-4 rounded-lg text-center"
            @click="toggleAutonomousMode"
          >
            <span class="block text-2xl mb-2">🤖</span>
            <span class="text-sm font-medium text-orange-700">
              {{ mqttStore.value.kaiser.autonomousMode ? 'Disable' : 'Enable' }} Autonomous
            </span>
          </button>

          <button
            class="quick-action-btn bg-red-50 hover:bg-red-100 p-4 rounded-lg text-center"
            @click="emergencyStopAll"
          >
            <span class="block text-2xl mb-2">🛑</span>
            <span class="text-sm font-medium text-red-700">Emergency Stop</span>
          </button>

          <button
            class="quick-action-btn bg-cyan-50 hover:bg-cyan-100 p-4 rounded-lg text-center"
            @click="showKaiserStatus"
          >
            <span class="block text-2xl mb-2">📈</span>
            <span class="text-sm font-medium text-cyan-700">Kaiser Status</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Placeholder for Zone Overview -->
    <div class="mb-8 bg-white shadow rounded-lg p-6">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Zonen Übersicht</h2>
      <p class="text-gray-500">Hier werden die Zonen-Karten angezeigt...</p>
    </div>
  </div>
</template>
