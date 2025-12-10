<template>
  <div class="dashboard-view">
    <v-container fluid>
      <!-- 🆕 NEU: Breadcrumb Navigation -->
      <BreadcrumbNavigation />

      <!-- Header -->
      <v-row>
        <v-col cols="12">
          <div class="d-flex align-center mb-6">
            <v-icon icon="mdi-view-dashboard" size="32" color="primary" class="mr-3" />
            <div>
              <h1 class="text-h4 font-weight-bold">Dashboard</h1>
              <p class="text-body-1 text-grey-darken-1 mt-1">
                System-Übersicht und Echtzeit-Monitoring
              </p>
            </div>
            <!-- 🆕 NEU: Dashboard-Hilfe -->
            <v-spacer />
            <HelpfulHints
              :use-tooltip-mode="true"
              tooltip-icon="mdi-help-circle-outline"
              tooltip-text="Das Dashboard zeigt eine Übersicht aller System-Komponenten. Nutzen Sie die Hilfe-Buttons (?) in jeder Sektion für detaillierte Informationen."
              tooltip-title="Dashboard-Hilfe"
              tooltip-location="left"
              :tooltip-examples="[
                'Klicken Sie auf Zone-Karten für Details',
                'Nutzen Sie Drag & Drop für Vergleiche',
                'Aktoren können manuell oder automatisch gesteuert werden',
              ]"
              :tooltip-shortcuts="[
                { key: 'F5', description: 'Seite neu laden' },
                { key: 'Ctrl+R', description: 'Verbindung erneuern' },
              ]"
            />
          </div>
        </v-col>
      </v-row>

      <!-- ✅ KONSOLIDIERT: Zentrale System-Status-Anzeige -->
      <SystemStatusBar />

      <!-- 🟢 ESSENTIELL (immer sichtbar) -->
      <v-row v-if="selectedEspId">
        <v-col cols="12">
          <SystemStateCard :esp-id="selectedEspId" />
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12">
          <DashboardControls />
        </v-col>
      </v-row>

      <!-- 🟡 WICHTIG (einklappbar) -->
      <v-expansion-panels
        v-model="expandedPanels"
        multiple
        :class="{ 'mobile-panels': $vuetify.display.mobile }"
      >
        <!-- Mobile: Nur Live-Daten standardmäßig geöffnet -->
        <v-expansion-panel value="live-data" :default-open="$vuetify.display.mobile">
          <v-expansion-panel-title>
            <v-icon icon="mdi-chart-line" class="mr-2" />
            <span class="d-none d-sm-inline">📊 Live-Daten & Monitoring</span>
            <span class="d-sm-none">📊 Live-Daten</span>
            <v-chip size="small" color="success" variant="tonal" class="ml-2">
              {{ getLiveDataCount() }} aktive Sensoren
            </v-chip>
            <!-- 🆕 NEU: Live-Daten Hilfe -->
            <v-spacer />
            <HelpfulHints
              :use-tooltip-mode="true"
              tooltip-icon="mdi-help-circle-outline"
              tooltip-text="Live-Daten zeigen Echtzeit-Werte aller Sensoren und den aktuellen Status aller Aktoren."
              tooltip-title="Live-Daten"
              tooltip-location="left"
              :tooltip-examples="[
                'Sensor-Werte werden automatisch aktualisiert',
                'Aktoren können direkt gesteuert werden',
                'Warnungen werden farblich hervorgehoben',
              ]"
            />
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row v-if="selectedEsp">
              <v-col cols="12" :md="selectedEsp ? 6 : 12">
                <ZoneCard :esp="selectedEsp" />
              </v-col>
              <v-col cols="12" :md="selectedEsp ? 6 : 12">
                <SubZoneCard :esp="selectedEsp" />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12">
                <ActuatorMonitor />
              </v-col>
            </v-row>
            <v-row v-if="selectedEsp">
              <v-col cols="12">
                <SensorDataVisualization />
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- Mobile: Analyse-Panels minimiert -->
        <v-expansion-panel value="analysis" :default-open="!$vuetify.display.mobile">
          <v-expansion-panel-title>
            <v-icon icon="mdi-chart-multiline" class="mr-2" />
            <span class="d-none d-sm-inline">📈 Datenanalyse & Export</span>
            <span class="d-sm-none">📈 Analyse</span>
            <v-chip size="small" color="info" variant="tonal" class="ml-2">
              {{ getAnalysisCount() }} Panels
            </v-chip>
            <!-- 🆕 NEU: Analyse Hilfe -->
            <v-spacer />
            <HelpfulHints
              :use-tooltip-mode="true"
              tooltip-icon="mdi-help-circle-outline"
              tooltip-text="Datenanalyse-Tools ermöglichen die Auswertung historischer Daten und den Export von Berichten."
              tooltip-title="Datenanalyse"
              tooltip-location="left"
              :tooltip-examples="[
                'Vergleichen Sie verschiedene Zeiträume',
                'Exportieren Sie Daten als CSV/JSON',
                'Erstellen Sie benutzerdefinierte Berichte',
              ]"
            />
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <UnifiedInteractionZone />
            <DatabaseLogsCard />
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel value="development">
          <v-expansion-panel-title>
            <v-icon icon="mdi-tools" class="mr-2" />
            <span class="d-none d-sm-inline">🛠️ Entwickler-Tools</span>
            <span class="d-sm-none">🛠️ Tools</span>
            <v-chip size="small" color="warning" variant="tonal" class="ml-2"> Debug </v-chip>
            <!-- 🆕 NEU: Entwickler-Tools Hilfe -->
            <v-spacer />
            <HelpfulHints
              :use-tooltip-mode="true"
              tooltip-icon="mdi-help-circle-outline"
              tooltip-text="Entwickler-Tools bieten erweiterte Funktionen für System-Debugging und -Optimierung."
              tooltip-title="Entwickler-Tools"
              tooltip-location="left"
              :tooltip-examples="[
                'MQTT-Topic-Monitoring',
                'System-Logs einsehen',
                'Performance-Metriken analysieren',
              ]"
            />
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <AutoDashboardGenerator />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- No ESP Selected State -->
      <v-row v-if="!selectedEsp">
        <v-col cols="12">
          <v-card variant="outlined" class="text-center py-12">
            <v-icon icon="mdi-chip" size="64" color="grey-lighten-1" class="mb-4" />
            <h3 class="text-h5 text-grey mb-2">Kein ESP-Gerät ausgewählt</h3>
            <p class="text-body-1 text-grey-darken-1 mb-4">
              Wählen Sie ein ESP-Gerät aus, um die Zone-Übersicht zu sehen
            </p>
            <v-btn color="primary" variant="outlined" prepend-icon="mdi-settings" to="/settings">
              Zu den Einstellungen
            </v-btn>
          </v-card>
        </v-col>
      </v-row>

      <!-- Quick Actions -->
      <v-row>
        <v-col cols="12">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-lightning-bolt" class="mr-2" color="primary" />
              Schnellaktionen
              <v-chip size="small" color="info" variant="tonal" class="ml-2"> Tools </v-chip>
              <!-- 🆕 NEU: Schnellaktionen Hilfe -->
              <v-spacer />
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-icon="mdi-help-circle-outline"
                tooltip-text="Schnellaktionen ermöglichen den direkten Zugriff auf häufig verwendete Funktionen."
                tooltip-title="Schnellaktionen"
                tooltip-location="left"
                :tooltip-examples="[
                  'Zonen verwalten für System-Konfiguration',
                  'Einstellungen für System-Parameter',
                  'Debug-Tools für Fehlerbehebung',
                ]"
              />
            </v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="12" sm="6" md="3">
                  <v-btn
                    block
                    color="primary"
                    variant="outlined"
                    prepend-icon="mdi-map-marker"
                    to="/zones"
                    class="mb-2"
                  >
                    Zonen verwalten
                  </v-btn>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-btn
                    block
                    color="secondary"
                    variant="outlined"
                    prepend-icon="mdi-cog"
                    to="/settings"
                    class="mb-2"
                  >
                    Einstellungen
                  </v-btn>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-btn
                    block
                    color="info"
                    variant="outlined"
                    prepend-icon="mdi-bug"
                    to="/dev"
                    class="mb-2"
                  >
                    Debug Tools
                  </v-btn>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-chip block color="info" variant="tonal" prepend-icon="mdi-wifi" class="mb-2">
                    Auto-Reconnect
                  </v-chip>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- System Information -->
      <v-row>
        <v-col cols="12" md="6">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-information" class="mr-2" color="primary" />
              System Information
              <v-chip size="small" color="secondary" variant="tonal" class="ml-2"> Status </v-chip>
              <!-- 🆕 NEU: System-Information Hilfe -->
              <v-spacer />
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-icon="mdi-help-circle-outline"
                tooltip-text="System-Informationen zeigen den aktuellen Status aller Komponenten und Verbindungen."
                tooltip-title="System-Information"
                tooltip-location="left"
                :tooltip-examples="[
                  'MQTT-Verbindungsstatus prüfen',
                  'ESP-Geräte-Status überwachen',
                  'System-Logs einsehen',
                ]"
              />
            </v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-wifi" :color="mqttStore.isConnected ? 'success' : 'error'" />
                  </template>
                  <v-list-item-title>MQTT Verbindung</v-list-item-title>
                  <template #append>
                    <v-chip
                      :color="mqttStore.isConnected ? 'success' : 'error'"
                      size="small"
                      variant="tonal"
                    >
                      {{ mqttStore.isConnected ? 'Verbunden' : 'Getrennt' }}
                    </v-chip>
                  </template>
                </v-list-item>
                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-chip" color="info" />
                  </template>
                  <v-list-item-title>ESP Geräte</v-list-item-title>
                  <template #append>
                    <v-chip color="info" size="small" variant="tonal">
                      {{ systemStatus.onlineEspCount }}/{{ systemStatus.espCount }}
                    </v-chip>
                  </template>
                </v-list-item>
                <v-list-item>
                  <template #prepend>
                    <v-icon
                      icon="mdi-shield"
                      :color="mqttStore.isSafeMode ? 'warning' : 'success'"
                    />
                  </template>
                  <v-list-item-title>Safe Mode</v-list-item-title>
                  <template #append>
                    <v-chip
                      :color="mqttStore.isSafeMode ? 'warning' : 'success'"
                      size="small"
                      variant="tonal"
                    >
                      {{ mqttStore.isSafeMode ? 'Aktiv' : 'Inaktiv' }}
                    </v-chip>
                  </template>
                </v-list-item>
                <v-list-item v-if="mqttStore.isEmergencyStop">
                  <template #prepend>
                    <v-icon icon="mdi-stop-circle" color="error" />
                  </template>
                  <v-list-item-title>Emergency Stop</v-list-item-title>
                  <template #append>
                    <v-chip color="error" size="small" variant="tonal"> Aktiv </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-speedometer" class="mr-2" color="primary" />
              Performance-Metriken
              <v-chip size="small" color="info" variant="tonal" class="ml-2"> Live </v-chip>
              <!-- 🆕 NEU: Performance-Metriken Hilfe -->
              <v-spacer />
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-icon="mdi-help-circle-outline"
                tooltip-text="Performance-Metriken zeigen die Systemleistung und Ressourcennutzung in Echtzeit."
                tooltip-title="Performance-Metriken"
                tooltip-location="left"
                :tooltip-examples="[
                  'CPU- und Speicher-Auslastung',
                  'Netzwerk-Performance',
                  'Datenbank-Performance',
                ]"
              />
            </v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-memory" color="info" />
                  </template>
                  <v-list-item-title>Speicher-Auslastung</v-list-item-title>
                  <template #append>
                    <v-chip size="x-small" color="info" variant="tonal">
                      {{ getMemoryUsage() }}%
                    </v-chip>
                  </template>
                </v-list-item>

                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-cpu-64-bit" color="warning" />
                  </template>
                  <v-list-item-title>CPU-Auslastung</v-list-item-title>
                  <template #append>
                    <v-chip size="x-small" color="warning" variant="tonal">
                      {{ getCpuUsage() }}%
                    </v-chip>
                  </template>
                </v-list-item>

                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-database" color="success" />
                  </template>
                  <v-list-item-title>Datenbank-Performance</v-list-item-title>
                  <template #append>
                    <v-chip size="x-small" color="success" variant="tonal">
                      {{ getDatabasePerformance() }}ms
                    </v-chip>
                  </template>
                </v-list-item>

                <v-list-item>
                  <template #prepend>
                    <v-icon icon="mdi-network" color="primary" />
                  </template>
                  <v-list-item-title>Netzwerk-Latenz</v-list-item-title>
                  <template #append>
                    <v-chip size="x-small" color="primary" variant="tonal">
                      {{ getNetworkLatency() }}ms
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import SystemStateCard from '@/components/dashboard/SystemStateCard.vue'
import ZoneCard from '@/components/dashboard/ZoneCard.vue'
import SubZoneCard from '@/components/dashboard/SubZoneCard.vue'
import SensorDataVisualization from '@/components/dashboard/SensorDataVisualization.vue'
import SystemStatusBar from '@/components/common/SystemStatusBar.vue'
import AutoDashboardGenerator from '@/components/dashboard/AutoDashboardGenerator.vue'
import DashboardControls from '@/components/dashboard/DashboardControls.vue'
import UnifiedInteractionZone from '@/components/dashboard/UnifiedInteractionZone.vue'
import ActuatorMonitor from '@/components/dashboard/ActuatorMonitor.vue'
import DatabaseLogsCard from '@/components/dashboard/DatabaseLogsCard.vue'
import BreadcrumbNavigation from '@/components/common/BreadcrumbNavigation.vue'

const centralDataHub = useCentralDataHub()

// ✅ KONSOLIDIERT: Einheitliche Store-Referenzen über CentralDataHub
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)
const dashboardStore = computed(() => centralDataHub.dashboardGenerator)
const zoneRegistry = computed(() => centralDataHub.zoneRegistry)

// 🆕 NEU: Expansion Panel State
const expandedPanels = ref(['live-data']) // Standard: Live-Daten geöffnet

// ✅ NEU: Zentrale ESP-Auswahl über CentralDataHub
const selectedEspId = computed(() => centralDataHub.getSelectedEspId)

// ✅ NEU: ESP-Daten über CentralDataHub
const selectedEsp = computed(() => centralDataHub.getSelectedEsp)

// 🆕 NEU: Performance-Metriken State
const performanceMetrics = ref({
  memoryUsage: 0,
  cpuUsage: 0,
  databasePerformance: 0,
  networkLatency: 0,
})

// 🆕 NEU: Performance-Metriken aktualisieren
const updatePerformanceMetrics = () => {
  // Simulierte Performance-Daten (in echten Implementierung würden diese von Backend kommen)
  performanceMetrics.value = {
    memoryUsage: Math.floor(Math.random() * 30) + 20, // 20-50%
    cpuUsage: Math.floor(Math.random() * 40) + 10, // 10-50%
    databasePerformance: Math.floor(Math.random() * 50) + 10, // 10-60ms
    networkLatency: Math.floor(Math.random() * 20) + 5, // 5-25ms
  }
}

// Performance-Metriken Getter
const getMemoryUsage = () => performanceMetrics.value.memoryUsage
const getCpuUsage = () => performanceMetrics.value.cpuUsage
const getDatabasePerformance = () => performanceMetrics.value.databasePerformance
const getNetworkLatency = () => performanceMetrics.value.networkLatency

// 🆕 NEU: Computed für Panel-Statistiken
const getLiveDataCount = () => {
  if (!selectedEsp.value) return 0
  // Vereinfachte Zählung basierend auf verfügbaren ESP-Geräten
  return mqttStore.value.espDevices.size
}

const getAnalysisCount = () => {
  return dashboardStore.value.comparisonPanels.size
}

// Computed properties for dashboard
const systemStatus = computed(() => ({
  connected: mqttStore.value.isConnected,
  quality: mqttStore.value.connectionQuality,
  uptime: mqttStore.value.connectionUptime,
  espCount: mqttStore.value.espDevices.size,
  onlineEspCount: Array.from(mqttStore.value.espDevices.values()).filter(
    (esp) => esp.status === 'online',
  ).length,
  emergencyStop: mqttStore.value.isEmergencyStop,
  safeMode: mqttStore.value.isSafeMode,
}))

// 🆕 NEU: Dynamische Komponenten-Updates
watch(
  () => mqttStore.value.espDevices,
  (newDevices, oldDevices) => {
    // Automatisch neue ESP-Geräte erkennen
    const newEspIds = Array.from(newDevices.keys()).filter((id) => !oldDevices.has(id))

    if (newEspIds.length > 0 && !selectedEspId.value) {
      // Automatisch erstes neues Gerät auswählen
      centralConfig.value.setSelectedEspId(newEspIds[0])
    }

    // Dashboard neu generieren bei Änderungen
    if (newDevices.size !== oldDevices.size) {
      dashboardStore.value.autoGenerateDashboard()
    }
  },
  { deep: true },
)

onMounted(() => {
  // 🆕 NEU: Zone-Layout laden
  zoneRegistry.value.loadZoneLayout()

  // Automatische ESP-Auswahl wenn noch keine ausgewählt
  if (!selectedEspId.value) {
    centralConfig.value.autoSelectFirstEsp()
  }

  // Initial Dashboard generieren
  if (mqttStore.value.espDevices.size > 0) {
    dashboardStore.value.autoGenerateDashboard()
  }

  // 🆕 OPTIMIERT: Performance-Metriken Timer mit CPU-Optimierung
  updatePerformanceMetrics()
  // Aktualisiere Performance-Metriken alle 10 Sekunden (statt 5s) - NON-CRITICAL
  setInterval(updatePerformanceMetrics, 10000) // 10 Sekunden statt 5

  // Automatische Updates alle 60 Sekunden (statt 30s) - NON-CRITICAL
  setInterval(() => {
    if (mqttStore.value.isConnected) {
      dashboardStore.value.refreshDashboardData()
    }
  }, 60000) // 60 Sekunden statt 30
})
</script>

<script>
// Helper functions for connection quality (no longer used after performance metrics update)
// function getConnectionQualityColor(quality) {
//   switch (quality) {
//     case 'excellent':
//       return 'success'
//     case 'good':
//       return 'warning'
//     case 'poor':
//       return 'error'
//     default:
//       return 'grey'
//   }
// }

// function getConnectionQualityText(quality) {
//   switch (quality) {
//     case 'excellent':
//       return 'Exzellent'
//     case 'good':
//       return 'Gut'
//     case 'poor':
//       return 'Schlecht'
//     default:
//       return 'Unbekannt'
//   }
// }
</script>

<style scoped>
.dashboard-view {
  padding-top: 16px;
  padding-bottom: 32px;
}

/* Mobile-spezifische Anpassungen */
.mobile-panels .v-expansion-panel {
  margin-bottom: 8px;
}

.mobile-panels .v-expansion-panel-title {
  min-height: 48px;
  padding: 12px 16px;
}

.mobile-panels .v-expansion-panel-text {
  padding: 12px 16px;
}

/* Responsive improvements */
@media (max-width: 600px) {
  .dashboard-view {
    padding-top: 8px;
    padding-bottom: 16px;
  }
}
</style>
