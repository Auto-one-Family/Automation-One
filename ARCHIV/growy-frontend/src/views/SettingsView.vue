<script setup>
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useResponsiveDisplay } from '@/composables/useResponsiveDisplay'

import CentralizedMindmap from '@/components/mindmap/CentralizedMindmap.vue'
import DeviceTreeView from '@/components/device/DeviceTreeView.vue'
import AdvancedConfigurationPanel from '@/components/settings/AdvancedConfigurationPanel.vue'
import UnifiedCard from '@/components/common/UnifiedCard.vue'
import SystemOverviewCard from '@/components/common/SystemOverviewCard.vue'
import { getFriendlyTerm } from '@/utils/userFriendlyTerms'

import { safeInfo } from '@/utils/snackbarUtils'

// ✅ CentralDataHub verwenden
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub?.mqttStore || null)
const centralConfig = computed(() => centralDataHub?.centralConfig || null)

// ✅ Router für URL-Parameter
const route = useRoute()
const router = useRouter()

// ✅ Responsive Design
const { isMobile } = useResponsiveDisplay()

// ✅ State-Management zwischen Tabs
const settingsState = reactive({
  activeTab: 'mindmap',
  selectedEspFromMindmap: null,
  selectedEspFromTree: null,
  pendingConfigurations: new Map(),
  crossTabCommunication: true,
  isLoading: false,
  error: null,
})

// Reactive Data
const selectedDeviceId = ref(null)

// ✅ NEU: URL-Parameter-Verarbeitung
const initializeFromUrl = () => {
  // Tab aus URL-Parameter lesen
  if (route.query.tab) {
    const validTabs = ['mindmap', 'devices', 'advanced']
    if (validTabs.includes(route.query.tab)) {
      settingsState.activeTab = route.query.tab
    }
  }

  // ESP-ID aus URL-Parameter lesen
  if (route.query.espId) {
    settingsState.selectedEspFromMindmap = route.query.espId
    selectedDeviceId.value = route.query.espId
    centralConfig.value.setSelectedEspId(route.query.espId)
  }
}

// ✅ NEU: URL-Synchronisation
const updateUrl = () => {
  const query = { ...route.query }

  if (settingsState.activeTab !== 'mindmap') {
    query.tab = settingsState.activeTab
  } else {
    delete query.tab
  }

  if (settingsState.selectedEspFromMindmap) {
    query.espId = settingsState.selectedEspFromMindmap
  } else {
    delete query.espId
  }

  // Nur URL aktualisieren wenn sich etwas geändert hat
  if (JSON.stringify(query) !== JSON.stringify(route.query)) {
    router.replace({ query })
  }
}

// Computed Properties
const pageTitle = computed(() => getFriendlyTerm('settings'))

const pageSubtitle = computed(() => 'System-Konfiguration und Geräte-Verwaltung')

// ✅ Tab-übergreifende Kommunikation
const handleDeviceSelect = (deviceId) => {
  selectedDeviceId.value = deviceId
  settingsState.selectedEspFromMindmap = deviceId

  if (deviceId.startsWith('esp')) {
    centralConfig.value?.setSelectedEspId?.(deviceId)

    // Auto-Switch zu Device Tree wenn gewünscht
    if (settingsState.crossTabCommunication && settingsState.activeTab === 'mindmap') {
      settingsState.activeTab = 'devices'
    }
  }

  // ✅ NEU: URL aktualisieren
  updateUrl()
}

const handleDeviceConfigure = () => {
  // Öffne Konfigurations-Dialog für unkonfigurierte ESPs
  safeInfo('Konfiguration für unkonfiguriertes Gerät')
}

// ✅ Neue Event-Handler für DeviceTreeView
const handleEspChange = (espId) => {
  settingsState.selectedEspFromTree = espId
  if (espId && espId !== settingsState.selectedEspFromMindmap) {
    settingsState.selectedEspFromMindmap = espId
    centralConfig.value.setSelectedEspId(espId)
  }
}

const handlePinConfigure = async (pinConfig) => {
  try {
    settingsState.isLoading = true

    // ✅ Sicherheits-Checks
    if (!pinConfig.espId || !pinConfig.gpio || !pinConfig.type) {
      throw new Error('Unvollständige Pin-Konfiguration')
    }

    // ✅ ESP Management Store verwenden
    const espManagement = centralDataHub.espManagement
    await espManagement.configurePinAssignment(pinConfig.espId, pinConfig)

    // ✅ MQTT Synchronisation
    const kaiserId = centralConfig.value.getKaiserForEsp(pinConfig.espId)
    if (kaiserId) {
      await mqttStore.value.publish(`kaiser/${kaiserId}/esp/${pinConfig.espId}/config`, pinConfig)
    }

    // ✅ Erfolgs-Feedback
    safeInfo('Pin erfolgreich konfiguriert')
  } catch (error) {
    console.error('Pin configuration error:', error)
    safeInfo(`Fehler: ${error.message}`)
    throw error
  } finally {
    settingsState.isLoading = false
  }
}

// ✅ Bidirektionale Synchronisation
watch(
  () => settingsState.selectedEspFromTree,
  (newEspId) => {
    if (newEspId && newEspId !== settingsState.selectedEspFromMindmap) {
      settingsState.selectedEspFromMindmap = newEspId
      selectedDeviceId.value = newEspId
    }
  },
)

// ✅ NEU: Tab-Änderungen überwachen für URL-Synchronisation
watch(
  () => settingsState.activeTab,
  (newTab) => {
    try {
      // Tab-spezifische Initialisierung
      if (newTab === 'devices' && !settingsState.selectedEspFromMindmap) {
        const firstEsp = centralConfig.value.getSelectedEspId
        if (firstEsp) {
          settingsState.selectedEspFromMindmap = firstEsp
        }
      }

      // ✅ NEU: URL aktualisieren
      updateUrl()
    } catch (error) {
      tabErrorHandlers[newTab]?.(error)
    }
  },
)

// ✅ Error Boundary für jede Tab
const tabErrorHandlers = {
  mindmap: (error) => {
    console.error('Mindmap Error:', error)
    safeInfo('Mindmap-Fehler: Bitte Seite neu laden')
  },
  devices: (error) => {
    console.error('Device Tree Error:', error)
    safeInfo('Device Tree-Fehler: Zurück zur Mindmap')
    settingsState.activeTab = 'mindmap'
  },
  advanced: (error) => {
    console.error('Advanced Config Error:', error)
    safeInfo('Konfigurations-Fehler: Einstellungen gespeichert')
  },
}

// ✅ Sicherheits-Checks vor kritischen Aktionen (für zukünftige Verwendung)
// const safetyChecks = {
//   pinConfiguration: (espId, gpio) => {
//     const device = mqttStore.value.espDevices.get(espId)
//     if (!device) throw new Error(`ESP ${espId} nicht gefunden`)
//     if (device.pinAssignments?.has(gpio)) {
//       return confirm(`GPIO ${gpio} bereits belegt. Überschreiben?`)
//     }
//     return true
//   }
// }

// Automatische ESP-Auswahl beim Mount
onMounted(() => {
  centralConfig.value.autoSelectFirstEsp()

  // ✅ Initialisierung aus URL
  initializeFromUrl()

  // ✅ Error Handling für Tab-Wechsel
  watch(
    () => settingsState.activeTab,
    (newTab) => {
      try {
        // Tab-spezifische Initialisierung
        if (newTab === 'devices' && !settingsState.selectedEspFromMindmap) {
          const firstEsp = centralConfig.value.getSelectedEspId
          if (firstEsp) {
            settingsState.selectedEspFromMindmap = firstEsp
          }
        }
      } catch (error) {
        tabErrorHandlers[newTab]?.(error)
      }
    },
  )
})
</script>

<template>
  <div class="settings-view">
    <v-container fluid class="pa-4">
      <!-- ✅ Header bleibt unverändert -->
      <v-row>
        <v-col cols="12">
          <div class="d-flex align-center mb-6">
            <v-icon icon="mdi-cog" size="32" color="primary" class="mr-3" />
            <div>
              <h1 class="text-h4 font-weight-bold">{{ pageTitle }}</h1>
              <p class="text-body-1 text-grey-darken-1 mt-1">
                {{ pageSubtitle }}
              </p>
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- ✅ NEUES Tab-System -->
      <UnifiedCard
        title="System-Konfiguration"
        icon="mdi-cog"
        variant="elevated"
        class="settings-tabs-card"
        :loading="settingsState.isLoading"
        :error="settingsState.error"
      >
        <v-tabs
          v-model="settingsState.activeTab"
          bg-color="primary"
          color="white"
          show-arrows
          class="settings-tabs"
          :class="{ 'mobile-tabs': isMobile }"
        >
          <v-tab value="mindmap" class="font-weight-medium">
            <v-icon icon="mdi-graph" class="mr-2" />
            <span class="d-none d-sm-inline">System Mindmap</span>
            <span class="d-sm-none">Mindmap</span>
          </v-tab>
          <v-tab value="devices" class="font-weight-medium">
            <v-icon icon="mdi-chip" class="mr-2" />
            <span class="d-none d-sm-inline">Device Tree</span>
            <span class="d-sm-none">Devices</span>
          </v-tab>
          <v-tab value="advanced" class="font-weight-medium">
            <v-icon icon="mdi-tune" class="mr-2" />
            <span class="d-none d-sm-inline">Advanced Config</span>
            <span class="d-sm-none">Advanced</span>
          </v-tab>
        </v-tabs>

        <v-window v-model="settingsState.activeTab" class="settings-content">
          <!-- ✅ Tab 1: Mindmap (UNVERÄNDERT) -->
          <v-window-item value="mindmap">
            <div class="pa-4">
              <SystemOverviewCard class="mb-4" />
              <CentralizedMindmap
                :selected-device-id="selectedDeviceId"
                @device-select="handleDeviceSelect"
                @device-configure="handleDeviceConfigure"
              />
            </div>
          </v-window-item>

          <!-- ✅ Tab 2: Device Tree (NEU) -->
          <v-window-item value="devices">
            <div class="pa-4">
              <v-alert
                type="info"
                variant="tonal"
                density="compact"
                class="mb-4"
                icon="mdi-information"
              >
                <div class="d-flex align-center">
                  <div class="flex-grow-1">
                    <div class="font-weight-medium">Device Tree Übersicht</div>
                    <div class="text-caption mt-1">
                      Hier können Sie alle ESP32-Geräte und deren Pin-Konfigurationen verwalten.
                      Nutzen Sie Drag & Drop für intuitive Bedienung.
                    </div>
                  </div>
                </div>
              </v-alert>
              <DeviceTreeView
                :esp-id="settingsState.selectedEspFromMindmap"
                @esp-change="handleEspChange"
                @pin-configure="handlePinConfigure"
              />
            </div>
          </v-window-item>

          <!-- ✅ Tab 3: Advanced (NEU) -->
          <v-window-item value="advanced">
            <div class="pa-4">
              <v-alert
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-4"
                icon="mdi-tune"
              >
                <div class="d-flex align-center">
                  <div class="flex-grow-1">
                    <div class="font-weight-medium">Erweiterte Konfiguration</div>
                    <div class="text-caption mt-1">
                      Diese Einstellungen sind für fortgeschrittene Benutzer gedacht. Änderungen
                      können das Systemverhalten beeinflussen.
                    </div>
                  </div>
                </div>
              </v-alert>
              <AdvancedConfigurationPanel :selected-esp="settingsState.selectedEspFromMindmap" />
            </div>
          </v-window-item>
        </v-window>
      </UnifiedCard>

      <!-- ✅ OPTIMIERT: Empty State ohne Connect-Button - SystemStatusBar übernimmt Emergency-Connect -->
      <v-row v-if="!mqttStore?.value?.connected">
        <v-col cols="12">
          <UnifiedCard
            title="Keine Verbindung verfügbar"
            icon="mdi-wifi-off"
            variant="outlined"
            class="text-center py-8"
          >
            <template #default>
              <v-icon icon="mdi-wifi-off" size="64" color="grey-lighten-1" />
              <p class="text-body-2 text-grey mb-4">
                Verbinde dich mit dem System, um Geräte zu verwalten.
              </p>
              <p class="text-caption text-grey">
                Nutzen Sie den "Erneut verbinden" Button in der System-Status-Bar für Notfälle.
              </p>
            </template>
          </UnifiedCard>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<style scoped>
.settings-view {
  padding-top: 16px;
  padding-bottom: 32px;
}

/* ✅ Modernes Design (Vuetify 3 Standards) */
.settings-tabs-card {
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.settings-tabs {
  .v-tab {
    text-transform: none;
    letter-spacing: normal;
    border-radius: 8px 8px 0 0;
    font-weight: 500;
  }

  .v-tab--selected {
    background-color: rgba(255, 255, 255, 0.1);
  }
}

.settings-content {
  min-height: 600px;
  background: rgb(var(--v-theme-surface));
}

/* ✅ Mobile Optimierungen */
.mobile-tabs {
  .v-tab {
    min-width: auto;
    padding: 8px 12px;
  }

  .v-tab__content {
    flex-direction: column;
  }
}

/* ✅ Responsive improvements */
@media (max-width: 600px) {
  .settings-view {
    padding-top: 8px;
    padding-bottom: 16px;
  }

  .settings-content {
    min-height: 400px;
  }
}

/* ✅ Smooth transitions */
.v-row {
  transition: all 0.3s ease;
}

.v-window-item {
  transition: all 0.3s ease;
}

/* ✅ Accessibility */
.settings-tabs:focus-visible {
  outline: 2px solid var(--v-theme-primary);
  outline-offset: 2px;
}
</style>
