<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useEspManagementStore } from '@/stores/espManagement'
import { useActuatorLogicStore } from '@/stores/actuatorLogic'
import EspDeviceInfo from '@/components/settings/esp/EspDeviceInfo.vue'
import EspPinConfiguration from '@/components/settings/esp/EspPinConfiguration.vue'
import EspActuatorConfiguration from '@/components/settings/esp/EspActuatorConfiguration.vue'
import EspZoneManagement from '@/components/settings/esp/EspZoneManagement.vue'
import { getFriendlyDeviceName } from '@/utils/userFriendlyTerms'
import { safeInfo } from '@/utils/snackbarUtils'

const route = useRoute()
const router = useRouter()
const centralDataHub = useCentralDataHub()
const espStore = useEspManagementStore()
const actuatorLogic = useActuatorLogicStore()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)

// ESP-Auswahl synchronisieren
const selectedEspId = computed({
  get: () => centralConfig.value.selectedEspId,
  set: (value) => {
    centralConfig.value.setSelectedEspId(value)
    // Update URL wenn ESP geändert wird
    if (value && route.params.espId !== value) {
      router.push({ name: 'devices', params: { espId: value } })
    }
  },
})

// ESP-Devices mit menschenfreundlichen Namen
const espDevices = computed(() => {
  return Array.from(mqttStore.value.espDevices.keys()).map((espId) => {
    const device = mqttStore.value.espDevices.get(espId)
    const zone = centralConfig.value.getZoneForEsp(espId)
    const friendlyName = device?.friendlyName || getFriendlyDeviceName('esp', espId)
    const zoneName = zone && zone !== centralConfig.value.getDefaultZone ? ` - ${zone}` : ''

    return {
      value: espId,
      title: `${friendlyName}${zoneName}`,
      subtitle: device?.board_type || device?.boardType || 'ESP32 DevKit',
      status: device?.status || 'offline',
      ipAddress: device?.server_address || device?.ipAddress || 'Unbekannt',
    }
  })
})

// ✅ NEU: Hierarchische Subzone-Anzeige
const hierarchicalSubzones = computed(() => {
  if (!selectedEspId.value) return []

  const espId = selectedEspId.value
  const subzones = espStore.getSubzones(espId)

  return subzones.map((subzone) => ({
    ...subzone,
    zone: centralConfig.value.getZoneForEsp(espId),
    kaiserId: centralConfig.value.getKaiserForEsp(espId),
    sensors: getSensorsForSubzone(espId, subzone.id),
    actuators: getActuatorsForSubzone(espId, subzone.id),
    crossEspLogics: actuatorLogic.getCrossEspLogicsBySubzone(subzone.id),
    hierarchy: {
      parentZone: centralConfig.value.getZoneForEsp(espId),
      siblingSubzones: getSiblingSubzones(espId, subzone.id),
      childDevices: getChildDevices(espId, subzone.id),
    },
  }))
})

// ✅ ENTFERNT: Ungenutzte Subzone-Management-Actions
// Subzone-Erstellung erfolgt über EspZoneManagement.vue Komponente
// Pin-Zuordnung erfolgt über EspPinConfiguration.vue Komponente

const showCrossEspLogics = (subzoneId) => {
  const logics = actuatorLogic.getCrossEspLogicsBySubzone(subzoneId)
  if (logics.length > 0) {
    // Cross-ESP Logic-Dialog öffnen
    showCrossEspLogicDialog.value = true
    selectedCrossEspLogics.value = logics
  } else {
    safeInfo('Keine Cross-ESP Logiken für diese Subzone gefunden')
  }
}

// ✅ NEU: Zusätzliche Subzone-Actions
const editSubzone = (subzoneId) => {
  // TODO: Implementierung für Subzone-Bearbeitung
  safeInfo(`Subzone ${subzoneId} bearbeiten`)
}

const addDeviceToSubzone = (subzoneId) => {
  // TODO: Implementierung für Gerät zu Subzone hinzufügen
  safeInfo(`Gerät zu Subzone ${subzoneId} hinzufügen`)
}

// ✅ NEU: Hilfsmethoden für Subzone-Daten
const getSensorsForSubzone = (espId, subzoneId) => {
  const device = espStore.getEspDevice(espId)
  if (!device) return []

  const subzone = device.subzones.get(subzoneId)
  return subzone?.sensors ? Array.from(subzone.sensors.values()) : []
}

const getActuatorsForSubzone = (espId, subzoneId) => {
  const device = espStore.getEspDevice(espId)
  if (!device) return []

  const subzone = device.subzones.get(subzoneId)
  return subzone?.actuators ? Array.from(subzone.actuators.values()) : []
}

const getSiblingSubzones = (espId, subzoneId) => {
  const device = espStore.getEspDevice(espId)
  if (!device) return []

  return Array.from(device.subzones.keys()).filter((id) => id !== subzoneId)
}

const getChildDevices = (espId, subzoneId) => {
  const sensors = getSensorsForSubzone(espId, subzoneId)
  const actuators = getActuatorsForSubzone(espId, subzoneId)
  return [...sensors, ...actuators].map((device) => device.name)
}

const getSubzoneColor = (subzone) => {
  if (subzone.crossEspLogics.length > 0) return 'warning'
  if (subzone.sensors.length > 0 && subzone.actuators.length > 0) return 'success'
  if (subzone.sensors.length > 0) return 'info'
  if (subzone.actuators.length > 0) return 'secondary'
  return 'grey'
}

const getDeviceIcon = (type) => {
  if (type.startsWith('SENSOR_')) return 'mdi-thermometer'
  if (type.startsWith('ACTUATOR_')) return 'mdi-cog'
  return 'mdi-help-circle'
}

// ✅ NEU: Dialog-States
const showCrossEspLogicDialog = ref(false)
const selectedCrossEspLogics = ref([])

// Responsive Layout
const isMobile = ref(false)
const isTablet = ref(false)

const updateResponsiveState = () => {
  const width = window.innerWidth
  isMobile.value = width < 768
  isTablet.value = width >= 768 && width < 1024
}

// Automatische ESP-Auswahl beim Mount
onMounted(() => {
  updateResponsiveState()
  window.addEventListener('resize', updateResponsiveState)

  // ESP aus URL-Parameter oder automatisch erste ESP
  if (route.params.espId) {
    centralConfig.value.setSelectedEspId(route.params.espId)
  } else if (espDevices.value.length > 0 && !selectedEspId.value) {
    centralConfig.value.autoSelectFirstEsp()
  }
})

// Watch für ESP-Änderungen aus MindMap
watch(
  () => centralConfig.value.selectedEspId,
  (newEspId) => {
    if (newEspId && route.name === 'devices') {
      // ESP ist ausgewählt, zeige Pin-Konfiguration
      safeInfo(`Gerät ${getFriendlyDeviceName('esp', newEspId)} ausgewählt`)
    }
  },
)

// Cleanup
onUnmounted(() => {
  window.removeEventListener('resize', updateResponsiveState)
})
</script>

<template>
  <div class="devices-view">
    <v-container fluid>
      <!-- Header -->
      <v-row>
        <v-col cols="12">
          <div class="d-flex align-center mb-6">
            <v-icon icon="mdi-devices" size="32" color="primary" class="mr-3" />
            <div>
              <h1 class="text-h4 font-weight-bold">Geräteverwaltung</h1>
              <p class="text-body-1 text-grey-darken-1 mt-1">
                Pin-Konfiguration und Hardware-Einstellungen
              </p>
            </div>
            <v-spacer />

            <!-- ESP-Auswahl Dropdown -->
            <v-select
              v-model="selectedEspId"
              :items="espDevices"
              label="ESP-Gerät auswählen"
              variant="outlined"
              density="comfortable"
              class="max-w-xs"
              item-title="title"
              item-value="value"
              :disabled="espDevices.length === 0"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props">
                  <template #prepend>
                    <v-icon
                      :color="item.raw.status === 'online' ? 'success' : 'error'"
                      :icon="item.raw.status === 'online' ? 'mdi-wifi' : 'mdi-wifi-off'"
                    />
                  </template>
                  <v-list-item-title>{{ item.raw.title }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ item.raw.subtitle }} • {{ item.raw.ipAddress }}
                  </v-list-item-subtitle>
                </v-list-item>
              </template>
            </v-select>
          </div>
        </v-col>
      </v-row>

      <!-- Empty State -->
      <v-row v-if="espDevices.length === 0">
        <v-col cols="12">
          <v-card variant="outlined" class="text-center py-8">
            <v-icon icon="mdi-devices-off" size="64" color="grey-lighten-1" />
            <h3 class="text-h6 mt-4 mb-2">Keine Geräte verfügbar</h3>
            <p class="text-body-2 text-grey mb-4">
              Verbinden Sie sich mit dem System, um Geräte zu verwalten.
            </p>
            <v-chip color="info" variant="tonal" prepend-icon="mdi-wifi">
              Auto-Reconnect aktiv
            </v-chip>
          </v-card>
        </v-col>
      </v-row>

      <!-- Pin-Konfigurations-Komponenten -->
      <template v-else-if="selectedEspId">
        <!-- Geräteinformationen -->
        <v-row>
          <v-col cols="12">
            <v-card variant="outlined" class="mb-4">
              <v-card-title class="d-flex align-center">
                <v-icon icon="mdi-information" color="primary" class="mr-2" />
                Geräteinformationen
                <v-chip size="small" color="primary" variant="tonal" class="ml-2">
                  {{ getFriendlyDeviceName('esp', selectedEspId) }}
                </v-chip>
              </v-card-title>
              <v-card-text>
                <EspDeviceInfo :esp-id="selectedEspId" />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Pin-Konfiguration und Aktoren -->
        <v-row>
          <!-- Pin-Konfiguration -->
          <v-col cols="12" :md="isTablet ? 12 : 6">
            <v-card variant="outlined" class="mb-4 h-100">
              <v-card-title class="d-flex align-center">
                <v-icon icon="mdi-pin" color="success" class="mr-2" />
                Anschluss-Belegung
                <v-chip size="small" color="success" variant="tonal" class="ml-2">
                  Sensoren & Aktoren
                </v-chip>
              </v-card-title>
              <v-card-text>
                <EspPinConfiguration :esp-id="selectedEspId" />
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Aktor-Konfiguration -->
          <v-col cols="12" :md="isTablet ? 12 : 6">
            <v-card variant="outlined" class="mb-4 h-100">
              <v-card-title class="d-flex align-center">
                <v-icon icon="mdi-cog" color="info" class="mr-2" />
                Aktor-Steuerung
                <v-chip size="small" color="info" variant="tonal" class="ml-2">
                  Logik & Prioritäten
                </v-chip>
              </v-card-title>
              <v-card-text>
                <EspActuatorConfiguration :esp-id="selectedEspId" />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- ✅ NEU: Subzone-Hierarchie-Anzeige -->
        <v-row v-if="hierarchicalSubzones.length > 0">
          <v-col cols="12">
            <v-card variant="outlined" class="mb-4">
              <v-card-title class="d-flex align-center">
                <v-icon icon="mdi-map-marker-multiple" color="secondary" class="mr-2" />
                Subzone-Hierarchie
                <v-chip size="small" color="secondary" variant="tonal" class="ml-2">
                  {{ hierarchicalSubzones.length }} Subzones
                </v-chip>
              </v-card-title>
              <v-card-text>
                <div class="subzone-hierarchy">
                  <v-row>
                    <v-col
                      v-for="subzone in hierarchicalSubzones"
                      :key="subzone.id"
                      cols="12"
                      md="6"
                      lg="4"
                    >
                      <v-card class="subzone-card" :class="`border-${getSubzoneColor(subzone)}`">
                        <v-card-title class="d-flex align-center">
                          <v-icon
                            :icon="`mdi-map-marker`"
                            :color="getSubzoneColor(subzone)"
                            class="mr-2"
                          />
                          <span class="text-h6">{{ subzone.name }}</span>
                          <v-spacer />
                          <v-chip
                            v-if="subzone.crossEspLogics.length > 0"
                            color="warning"
                            size="small"
                            @click="showCrossEspLogics(subzone.id)"
                          >
                            {{ subzone.crossEspLogics.length }} Cross-ESP
                          </v-chip>
                        </v-card-title>

                        <v-card-text>
                          <div class="subzone-info">
                            <p class="text-caption">{{ subzone.description }}</p>
                            <p class="text-caption">
                              <strong>Zone:</strong> {{ subzone.zone }} | <strong>GPIO:</strong>
                              {{ subzone.gpioRange?.start }}-{{ subzone.gpioRange?.end }}
                            </p>
                          </div>

                          <!-- Geräte-Liste -->
                          <div class="devices-list mt-3">
                            <h6 class="text-subtitle-2">Sensoren ({{ subzone.sensors.length }})</h6>
                            <v-list density="compact">
                              <v-list-item
                                v-for="sensor in subzone.sensors"
                                :key="`sensor-${sensor.gpio}`"
                                :prepend-icon="getDeviceIcon(sensor.type)"
                              >
                                <v-list-item-title>{{ sensor.name }}</v-list-item-title>
                                <v-list-item-subtitle>GPIO {{ sensor.gpio }}</v-list-item-subtitle>
                              </v-list-item>
                            </v-list>

                            <h6 class="text-subtitle-2 mt-3">
                              Aktoren ({{ subzone.actuators.length }})
                            </h6>
                            <v-list density="compact">
                              <v-list-item
                                v-for="actuator in subzone.actuators"
                                :key="`actuator-${actuator.gpio}`"
                                :prepend-icon="getDeviceIcon(actuator.type)"
                              >
                                <v-list-item-title>{{ actuator.name }}</v-list-item-title>
                                <v-list-item-subtitle
                                  >GPIO {{ actuator.gpio }}</v-list-item-subtitle
                                >
                              </v-list-item>
                            </v-list>
                          </div>
                        </v-card-text>

                        <v-card-actions>
                          <v-btn variant="text" size="small" @click="editSubzone(subzone.id)">
                            Bearbeiten
                          </v-btn>
                          <v-btn
                            variant="text"
                            size="small"
                            @click="addDeviceToSubzone(subzone.id)"
                          >
                            Gerät hinzufügen
                          </v-btn>
                        </v-card-actions>
                      </v-card>
                    </v-col>
                  </v-row>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Zone-Management -->
        <v-row>
          <v-col cols="12">
            <v-card variant="outlined" class="mb-4">
              <v-card-title class="d-flex align-center">
                <v-icon icon="mdi-map" color="warning" class="mr-2" />
                Zonen-Management
                <v-chip size="small" color="warning" variant="tonal" class="ml-2">
                  Hierarchie & Gruppierung
                </v-chip>
              </v-card-title>
              <v-card-text>
                <EspZoneManagement :esp-id="selectedEspId" />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </template>

      <!-- ESP-Auswahl erforderlich -->
      <v-row v-else>
        <v-col cols="12">
          <v-card variant="outlined" class="text-center py-8">
            <v-icon icon="mdi-devices" size="64" color="grey-lighten-1" />
            <h3 class="text-h6 mt-4 mb-2">Gerät auswählen</h3>
            <p class="text-body-2 text-grey mb-4">
              Wählen Sie ein ESP-Gerät aus, um die Pin-Konfiguration zu bearbeiten.
            </p>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<style scoped>
.devices-view {
  padding-top: 16px;
  padding-bottom: 32px;
  min-height: calc(100vh - 4rem);
  background-color: rgb(249, 250, 251);
}

.max-w-xs {
  max-width: 300px;
}

.h-100 {
  height: 100%;
}

/* Responsive improvements */
@media (max-width: 768px) {
  .devices-view {
    padding-top: 8px;
    padding-bottom: 16px;
  }

  .max-w-xs {
    max-width: 100%;
  }
}

/* Smooth transitions */
.v-card {
  transition: all 0.3s ease;
}

.v-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Status indicators */
.v-chip {
  transition: color 0.3s ease;
}
</style>
