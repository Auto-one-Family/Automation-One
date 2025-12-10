<script setup>
import { ref, computed, onMounted } from 'vue'
import { getFriendlyTerm, getFriendlyDeviceName } from '@/utils/userFriendlyTerms'
import { getTooltipText } from '@/utils/tooltipTexts'
import { useResponsiveDisplay } from '@/composables/useResponsiveDisplay'
import { useStoreInitialization } from '@/composables/useStoreInitialization'

// ✅ NEU: Sichere Store-Initialisierung über Composable
const {
  mqttStore,
  centralConfig,
  storesInitialized,
  initializationError,
  isMqttStoreAvailable,
  initializeStores,
} = useStoreInitialization()

// ✅ NEU: Responsive Display Integration
const { getResponsiveCols } = useResponsiveDisplay()

// ✅ NEU: Benutzerfreundliche ESP-Auswahl
const selectedDeviceId = ref(null)

const activeTab = ref(0)

// ✅ NEU: Automatische ESP-Auswahl über bestehende Struktur mit Error Handling
const initializeEspSelection = async () => {
  try {
    if (
      centralConfig.value?.autoSelectFirstEsp &&
      typeof centralConfig.value.autoSelectFirstEsp === 'function'
    ) {
      centralConfig.value.autoSelectFirstEsp()
    }
    if (centralConfig.value?.selectedEspId) {
      selectedDeviceId.value = centralConfig.value.selectedEspId
    }
  } catch (error) {
    console.warn('Error during ESP selection initialization:', error.message)
  }
}

// ✅ NEU: Computed Properties mit sicheren Null-Checks
const espDevices = computed(() => {
  if (!mqttStore.value?.espDevices) return []
  return Array.from(mqttStore.value.espDevices.keys() || [])
})

const hasEspDevices = computed(() => {
  return espDevices.value.length > 0
})

const pageTitle = computed(() => getFriendlyTerm('development'))

const pageSubtitle = computed(
  () => 'Entwickler-Tools und System-Diagnose für erweiterte Konfiguration',
)

// ✅ NEU: Benutzerfreundliche Tab-Labels
const tabLabels = computed(() => ({
  0: { label: getFriendlyTerm('mqtt'), icon: 'mdi-wifi', mobile: 'MQTT' },
  1: { label: 'Konfiguration', icon: 'mdi-cog', mobile: 'Config' },
  2: { label: 'System Commands', icon: 'mdi-console', mobile: 'Commands' },
  3: { label: 'Sensor Registry', icon: 'mdi-thermometer', mobile: 'Sensors' },
  4: { label: 'Device Simulator', icon: 'mdi-sim', mobile: 'Sim' },
  5: { label: 'Warning Config', icon: 'mdi-alert', mobile: 'Warnings' },
  6: { label: 'Interaction Log', icon: 'mdi-message-text', mobile: 'Log' },
}))

// ✅ NEU: Einheitliche Device-Auswahl mit Error Handling
const handleDeviceSelect = (deviceId) => {
  try {
    selectedDeviceId.value = deviceId
    if (deviceId && deviceId.startsWith('esp') && centralConfig.value?.setSelectedEspId) {
      centralConfig.value.setSelectedEspId(deviceId)
    }
  } catch (error) {
    console.warn('Error during device selection:', error.message)
  }
}

// ✅ NEU: Import der modernisierten Komponenten
import MqttDebugPanel from '@/components/debug/MqttDebugPanel.vue'
import DeviceSimulator from '@/components/debug/DeviceSimulator.vue'
import ConfigurationPanel from '@/components/debug/ConfigurationPanel.vue'
import SystemCommandsPanel from '@/components/debug/SystemCommandsPanel.vue'
import SensorRegistryPanel from '@/components/debug/SensorRegistryPanel.vue'
import WarningConfigurationPanel from '@/components/debug/WarningConfigurationPanel.vue'
import InteractionLogPanel from '@/components/debug/InteractionLogPanel.vue'

// ✅ NEU: OnMounted mit Error Handling
onMounted(async () => {
  try {
    await initializeStores()
    if (storesInitialized.value) {
      await initializeEspSelection()
    }
  } catch (error) {
    console.error('DevelopmentView initialization failed:', error)
  }
})
</script>

<template>
  <div class="development-view">
    <v-container fluid>
      <!-- Header -->
      <v-row>
        <v-col cols="12">
          <div class="d-flex align-center mb-6">
            <v-icon icon="mdi-bug" size="32" color="primary" class="mr-3" />
            <div>
              <h1 class="text-h4 font-weight-bold">{{ pageTitle }}</h1>
              <p class="text-body-1 text-grey-darken-1 mt-1">
                {{ pageSubtitle }}
              </p>
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- ✅ NEU: Loading State für Store-Initialisierung -->
      <v-row v-if="!storesInitialized && !initializationError">
        <v-col cols="12">
          <v-card variant="outlined" class="text-center py-8">
            <v-progress-circular indeterminate color="primary" size="64" />
            <h3 class="text-h6 mt-4 mb-2">Stores werden initialisiert...</h3>
            <p class="text-body-2 text-grey mb-4">
              Bitte warten Sie, während die System-Komponenten geladen werden.
            </p>
          </v-card>
        </v-col>
      </v-row>

      <!-- ✅ NEU: Error State für Store-Initialisierung -->
      <v-row v-if="initializationError">
        <v-col cols="12">
          <v-card variant="outlined" class="text-center py-8">
            <v-icon icon="mdi-alert-circle" size="64" color="error" />
            <h3 class="text-h6 mt-4 mb-2">Initialisierungsfehler</h3>
            <p class="text-body-2 text-grey mb-4">
              {{ initializationError }}
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-refresh"
              @click="initializeStores"
            >
              Erneut versuchen
            </v-btn>
          </v-card>
        </v-col>
      </v-row>

      <!-- ✅ NEU: Zentrale ESP-Auswahl -->
      <v-row v-if="storesInitialized && hasEspDevices && isMqttStoreAvailable">
        <v-col cols="12">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-memory" class="mr-2" color="success" />
              {{ getFriendlyTerm('fieldDevices') }} auswählen
              <v-chip size="small" color="success" variant="tonal" class="ml-2">
                {{ espDevices.length }}
                {{
                  espDevices.length === 1
                    ? getFriendlyTerm('fieldDevice')
                    : getFriendlyTerm('fieldDevices')
                }}
              </v-chip>
            </v-card-title>
            <v-card-text>
              <v-select
                v-model="selectedDeviceId"
                :items="espDevices"
                :item-title="(espId) => getFriendlyDeviceName('esp', espId)"
                item-value="espId"
                :label="`${getFriendlyTerm('fieldDevice')} auswählen`"
                placeholder="Wählen Sie ein Gerät für Debug-Operationen"
                variant="outlined"
                density="comfortable"
                @update:model-value="handleDeviceSelect"
                v-tooltip="getTooltipText('actions', 'select')"
              />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Debug Tools Tabs -->
      <v-row v-if="storesInitialized && isMqttStoreAvailable">
        <v-col cols="12">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-tools" class="mr-2" color="primary" />
              Debug Tools
              <v-chip size="small" color="warning" variant="tonal" class="ml-2">
                Entwickler
              </v-chip>
            </v-card-title>
            <v-card-text>
              <v-tabs v-model="activeTab" color="primary" align-tabs="start" class="mb-4">
                <v-tab
                  v-for="(tab, index) in tabLabels"
                  :key="index"
                  :value="index.toString()"
                  :prepend-icon="tab.icon"
                >
                  <span class="d-none d-sm-inline">{{ tab.label }}</span>
                  <span class="d-sm-none">{{ tab.mobile }}</span>
                </v-tab>
              </v-tabs>

              <v-window v-model="activeTab">
                <v-window-item value="0">
                  <MqttDebugPanel />
                </v-window-item>
                <v-window-item value="1">
                  <ConfigurationPanel />
                </v-window-item>
                <v-window-item value="2">
                  <SystemCommandsPanel :esp-id="selectedDeviceId" />
                </v-window-item>
                <v-window-item value="3">
                  <SensorRegistryPanel :esp-id="selectedDeviceId" />
                </v-window-item>
                <v-window-item value="4">
                  <DeviceSimulator />
                </v-window-item>
                <v-window-item value="5">
                  <WarningConfigurationPanel />
                </v-window-item>
                <v-window-item value="6">
                  <InteractionLogPanel />
                </v-window-item>
              </v-window>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Development Status -->
      <v-row v-if="storesInitialized && isMqttStoreAvailable">
        <v-col :cols="getResponsiveCols(12, 6, 6)">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-information" class="mr-2" color="primary" />
              Debug Status
              <v-chip size="small" color="info" variant="tonal" class="ml-2"> Info </v-chip>
            </v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item>
                  <template #prepend>
                    <v-icon
                      icon="mdi-wifi"
                      :color="mqttStore.value?.isConnected ? 'success' : 'error'"
                    />
                  </template>
                  <v-list-item-title>{{ getFriendlyTerm('mqtt') }} Verbindung</v-list-item-title>
                  <template #append>
                    <v-chip
                      :color="mqttStore.value?.isConnected ? 'success' : 'error'"
                      size="small"
                      variant="tonal"
                    >
                      {{
                        mqttStore.value?.isConnected
                          ? getFriendlyTerm('connected')
                          : getFriendlyTerm('disconnected')
                      }}
                    </v-chip>
                  </template>
                </v-list-item>
                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-message" color="info" />
                  </template>
                  <v-list-item-title>Nachrichten</v-list-item-title>
                  <template #append>
                    <v-chip color="info" size="small" variant="tonal">
                      {{ mqttStore.value?.messages?.length || 0 }}
                    </v-chip>
                  </template>
                </v-list-item>
                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-chip" color="secondary" />
                  </template>
                  <v-list-item-title>{{ getFriendlyTerm('fieldDevices') }}</v-list-item-title>
                  <template #append>
                    <v-chip color="secondary" size="small" variant="tonal">
                      {{ mqttStore.value?.espDevices?.size || 0 }}
                    </v-chip>
                  </template>
                </v-list-item>
                <v-list-item>
                  <template #prepend>
                    <v-icon
                      icon="mdi-alert"
                      :color="mqttStore.value?.hasIdConflicts ? 'warning' : 'success'"
                    />
                  </template>
                  <v-list-item-title>ID Konflikte</v-list-item-title>
                  <template #append>
                    <v-chip
                      :color="mqttStore.value?.hasIdConflicts ? 'warning' : 'success'"
                      size="small"
                      variant="tonal"
                    >
                      {{ mqttStore.value?.hasIdConflicts ? 'Vorhanden' : 'Keine' }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col :cols="getResponsiveCols(12, 6, 6)">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-lightning-bolt" class="mr-2" color="primary" />
              Schnellaktionen
              <v-chip size="small" color="warning" variant="tonal" class="ml-2"> Debug </v-chip>
            </v-card-title>
            <v-card-text>
              <v-row>
                <v-col :cols="getResponsiveCols(12, 6, 6)">
                  <v-btn
                    block
                    color="secondary"
                    variant="outlined"
                    prepend-icon="mdi-delete"
                    @click="mqttStore.value?.messages && (mqttStore.value.messages = [])"
                    class="mb-2"
                    v-tooltip="getTooltipText('actions', 'clear')"
                  >
                    Nachrichten löschen
                  </v-btn>
                </v-col>
                <v-col :cols="getResponsiveCols(12, 6, 6)">
                  <v-btn
                    block
                    color="secondary"
                    variant="outlined"
                    prepend-icon="mdi-delete"
                    @click="mqttStore.value?.messages && (mqttStore.value.messages = [])"
                    class="mb-2"
                    v-tooltip="getTooltipText('actions', 'clear')"
                  >
                    Nachrichten löschen
                  </v-btn>
                </v-col>
                <v-col :cols="getResponsiveCols(12, 6, 6)">
                  <v-btn
                    block
                    color="info"
                    variant="outlined"
                    prepend-icon="mdi-download"
                    @click="activeTab = 1"
                    class="mb-2"
                    v-tooltip="getTooltipText('actions', 'export')"
                  >
                    Config Export
                  </v-btn>
                </v-col>
                <v-col :cols="getResponsiveCols(12, 6, 6)">
                  <v-btn
                    block
                    color="warning"
                    variant="outlined"
                    prepend-icon="mdi-test-tube"
                    @click="activeTab = 5"
                    class="mb-2"
                    v-tooltip="getTooltipText('actions', 'test')"
                  >
                    Simulator
                  </v-btn>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- ✅ OPTIMIERT: Empty State ohne Connect-Button - SystemStatusBar übernimmt Emergency-Connect -->
      <v-row v-if="storesInitialized && isMqttStoreAvailable && !mqttStore.value?.connected">
        <v-col cols="12">
          <v-card variant="outlined" class="text-center py-8">
            <v-icon icon="mdi-wifi-off" size="64" color="grey-lighten-1" />
            <h3 class="text-h6 mt-4 mb-2">Keine Verbindung verfügbar</h3>
            <p class="text-body-2 text-grey mb-4">
              Verbinde dich mit dem System, um Debug-Tools zu nutzen.
            </p>
            <p class="text-caption text-grey">
              Nutzen Sie den "Erneut verbinden" Button in der System-Status-Bar für Notfälle.
            </p>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<style scoped>
.development-view {
  padding-top: 16px;
  padding-bottom: 32px;
}

/* ✅ NEU: Responsive improvements */
@media (max-width: 600px) {
  .development-view {
    padding-top: 8px;
    padding-bottom: 16px;
  }
}

/* ✅ NEU: Smooth transitions */
.v-row {
  transition: all 0.3s ease;
}

/* ✅ NEU: Tab-Responsive-Optimierung */
@media (max-width: 768px) {
  .v-tabs {
    overflow-x: auto;
  }

  .v-tab {
    min-width: auto;
    padding: 0 12px;
  }
}
</style>
