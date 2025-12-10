<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useDeviceSynchronization } from '@/composables/useDeviceSynchronization'
import DeviceTreeView from '@/components/device/DeviceTreeView.vue'
import BreadcrumbNavigation from '@/components/common/BreadcrumbNavigation.vue'

const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)
const deviceSync = useDeviceSynchronization()
const selectedEspId = computed(() => centralConfig.value.getSelectedEspId)
const activeTab = ref(0)

onMounted(() => {
  if (!selectedEspId.value) {
    centralConfig.value.autoSelectFirstEsp()
  }

  // Initialisiere zentrale Synchronisation
  deviceSync.setupAutoSync()
})

// Watch for ESP selection changes to update DeviceTreeView
watch(selectedEspId, (newEspId) => {
  if (newEspId && activeTab.value === 1) {
    // Trigger update in DeviceTreeView when ESP changes
    console.log('ESP selection changed in ZonesView:', newEspId)
  }
})
</script>

<template>
  <div class="device-management-view">
    <v-container fluid>
      <!-- 🆕 NEU: Breadcrumb Navigation -->
      <BreadcrumbNavigation />

      <!-- Header -->
      <v-row>
        <v-col cols="12">
          <div class="d-flex align-center mb-6">
            <v-icon icon="mdi-devices-group" size="32" color="primary" class="mr-3" />
            <div>
              <h1 class="text-h4 font-weight-bold">Geräteverwaltung</h1>
              <p class="text-body-1 text-grey-darken-1 mt-1">
                ESP-Geräte, Zonen und Subzonen verwalten
              </p>
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- Device Management Tabs -->
      <v-row>
        <v-col cols="12">
          <v-card variant="outlined" class="mb-6">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-devices-group" class="mr-2" color="primary" />
              Geräteverwaltung
              <v-chip size="small" color="info" variant="tonal" class="ml-2"> Tools </v-chip>
            </v-card-title>
            <v-card-text>
              <v-tabs v-model="activeTab" color="primary" align-tabs="start" class="mb-4">
                <v-tab value="0" prepend-icon="mdi-view-grid">
                  <span class="d-none d-sm-inline">Card-Ansicht</span>
                  <span class="d-sm-none">Cards</span>
                </v-tab>
                <v-tab value="1" prepend-icon="mdi-account-tree">
                  <span class="d-none d-sm-inline">Tree-Ansicht</span>
                  <span class="d-sm-none">Tree</span>
                </v-tab>
              </v-tabs>

              <v-window v-model="activeTab">
                <v-window-item value="0">
                  <!-- Card-basierte Geräteverwaltung -->
                  <div class="text-center py-8">
                    <v-icon icon="mdi-cog" size="64" color="grey-lighten-1" />
                    <h3 class="text-h6 mt-4 mb-2">Geräteverwaltung</h3>
                    <p class="text-body-2 text-grey mb-4">
                      Verwende die Tree-Ansicht für die Geräteverwaltung oder gehe zu den
                      Einstellungen für die MindMap-Konfiguration.
                    </p>
                    <v-btn color="primary" variant="tonal" prepend-icon="mdi-cog" to="/settings">
                      Zu den Einstellungen
                    </v-btn>
                  </div>
                </v-window-item>
                <v-window-item value="1">
                  <!-- Tree-basierte Geräteverwaltung -->
                  <DeviceTreeView :esp-id="selectedEspId" />
                </v-window-item>
              </v-window>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<style scoped>
.device-management-view {
  padding-top: 16px;
  padding-bottom: 32px;
}

/* Responsive improvements */
@media (max-width: 600px) {
  .device-management-view {
    padding-top: 8px;
    padding-bottom: 16px;
  }
}
</style>
