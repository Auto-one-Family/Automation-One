<template>
  <UnifiedCard
    :title="zoneName"
    :subtitle="`${espDevices.length} ESPs`"
    :icon="getZoneIcon()"
    :icon-color="getZoneColor()"
    variant="outlined"
    class="mindmap-node zone-node"
    :class="{
      expanded: isExpanded,
      unconfigured: isUnconfigured,
      'drag-over': isDragOver,
    }"
    :interactive="true"
    :show-header-actions="true"
    :show-expand-button="true"
    :expanded="isExpanded"
    @click="$emit('expand')"
    @expand="$emit('expand')"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Header Actions -->
    <template #header-actions>
      <!-- ✅ OPTIMIERT: Multi-Kaiser Indikator - nur wenn relevant -->
      <div v-if="hasMultipleKaisers" class="kaiser-indicators mr-2">
        <v-tooltip text="Diese Zone enthält ESPs von mehreren Kaisern">
          <template v-slot:activator="{ props }">
            <v-icon
              v-bind="props"
              icon="mdi-account-multiple"
              size="small"
              color="warning"
              class="mr-1"
            />
          </template>
        </v-tooltip>

        <!-- Kaiser-Punkte als visuelle Indikatoren -->
        <div class="kaiser-dots">
          <div
            v-for="kaiserId in uniqueKaisers"
            :key="kaiserId"
            class="kaiser-dot"
            :style="{ backgroundColor: centralConfig.value.getKaiserColor(kaiserId) }"
            :title="centralConfig.value.getKaiserDisplayName(kaiserId)"
          />
        </div>
      </div>

      <!-- ✅ OPTIMIERT: Default ESP Indikator - nur wenn relevant -->
      <v-chip v-if="isDefault" size="x-small" color="warning" variant="tonal" class="mr-2">
        <v-icon icon="mdi-help-circle" size="x-small" class="mr-1" />
        Unkonfiguriert
      </v-chip>

      <v-btn icon="mdi-cog" @click.stop="openZoneConfig" />
      <v-btn icon="mdi-plus" @click.stop="addEspToZone" />
      <v-btn
        v-if="!isUnconfigured && !isDefault"
        icon="mdi-delete"
        @click.stop="$emit('delete-zone')"
      />
    </template>

    <!-- Content -->
    <template #content>
      <v-expand-transition>
        <div v-if="isExpanded">
          <!-- ✅ OPTIMIERT: Kompakte Zone-Statistiken -->
          <div class="zone-overview mb-4">
            <v-row>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold text-success">{{ espDevices.length }}</div>
                  <div class="text-caption">Feldgeräte</div>
                </div>
              </v-col>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold text-info">{{ onlineEspCount }}</div>
                  <div class="text-caption">Online</div>
                </div>
              </v-col>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold text-warning">{{ sensorCount }}</div>
                  <div class="text-caption">Sensoren</div>
                </div>
              </v-col>
            </v-row>
          </div>

          <!-- ✅ OPTIMIERT: Default ESP Information - nur wenn relevant -->
          <div v-if="isDefault" class="default-esp-info mb-4">
            <v-alert type="warning" variant="tonal" class="mb-4">
              <template #prepend>
                <v-icon icon="mdi-help-circle" />
              </template>
              <div>
                <strong>Unkonfigurierter ESP:</strong> Konfiguriere es, um es zu aktivieren.
                <br />
                <strong>Hinweis:</strong> Echtes ESP übernimmt diese Konfiguration.
              </div>
            </v-alert>
          </div>

          <!-- ✅ OPTIMIERT: ESP-Übersicht - nur wenn ESPs vorhanden -->
          <div v-if="espDevices.length > 0" class="esp-overview-section mb-4">
            <h4 class="text-subtitle-1 font-weight-medium mb-3">
              <v-icon icon="mdi-memory" size="small" class="mr-1" />
              Feldgeräte in dieser Zone
            </h4>
            <div class="esp-grid">
              <div
                v-for="espId in espDevices"
                :key="espId"
                class="esp-preview"
                @click="selectEsp(espId)"
              >
                <!-- ✅ OPTIMIERT: Kaiser-bewusste ESP-Darstellung -->
                <div
                  class="esp-container"
                  :style="{
                    borderLeft: `4px solid ${getKaiserColorForEsp(espId)}`,
                  }"
                >
                  <v-chip
                    :color="getEspStatusColor(espId)"
                    size="small"
                    variant="tonal"
                    class="esp-chip"
                  >
                    <v-icon icon="mdi-memory" size="small" class="mr-1" />
                    {{ getEspFriendlyName(espId) }}
                  </v-chip>

                  <!-- Kaiser-Badge für Multi-Kaiser Zonen -->
                  <v-chip
                    v-if="hasMultipleKaisers"
                    :color="getKaiserColorForEsp(espId)"
                    size="x-small"
                    variant="flat"
                    class="kaiser-badge mt-1"
                  >
                    {{ getKaiserDisplayNameForEsp(espId) }}
                  </v-chip>
                </div>
              </div>
            </div>
          </div>

          <!-- ✅ OPTIMIERT: System-Erklärung nur bei Problemen -->
          <div
            v-if="systemExplanation && systemExplanation.healthStatus !== 'good'"
            class="zone-explanation-section"
          >
            <v-alert
              :type="systemExplanation.healthStatus === 'good' ? 'info' : 'warning'"
              variant="tonal"
              class="mb-4"
            >
              <template #prepend>
                <v-icon icon="mdi-information" size="large" />
              </template>
              <div class="explanation-content">
                <h4 class="text-h6 font-weight-medium mb-2">{{ systemExplanation.title }}</h4>
                <p class="text-body-2 mb-3">
                  {{ systemExplanation.description }}
                </p>
                <div v-if="systemExplanation.healthMessage" class="mb-3">
                  <v-chip
                    :color="systemExplanation.healthStatus === 'good' ? 'success' : 'warning'"
                    size="small"
                    variant="tonal"
                  >
                    <v-icon
                      :icon="
                        systemExplanation.healthStatus === 'good' ? 'mdi-check-circle' : 'mdi-alert'
                      "
                      size="small"
                      class="mr-1"
                    />
                    {{ systemExplanation.healthMessage }}
                  </v-chip>
                </div>
              </div>
            </v-alert>
          </div>

          <!-- ESP-Liste in dieser Zone -->
          <div class="esp-grid">
            <MindmapEspNode
              v-for="esp in espDevices"
              :key="esp"
              :esp="esp"
              :zone-name="zoneName"
              :draggable="true"
              @dragstart="startDrag"
              @dragend="stopDrag"
              @configure="configureEsp"
              @delete="deleteEsp"
              @move="moveEsp"
            />
          </div>
        </div>
      </v-expand-transition>
    </template>
  </UnifiedCard>

  <!-- ✅ OPTIMIERT: Zone-Konfigurations-Modal -->
  <v-dialog
    v-model="showZoneConfigModal"
    :max-width="600"
    :fullscreen="isMobile"
    persistent
    @click:outside="closeZoneConfig"
    @keydown.esc="closeZoneConfig"
  >
    <v-card>
      <v-card-title class="d-flex align-center bg-success text-white">
        <v-icon icon="mdi-map-marker" class="mr-2" />
        {{ zoneName }} - Konfiguration
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="closeZoneConfig" />
      </v-card-title>

      <v-card-text class="pt-4">
        <ZoneConfigurationPanel
          :zone-name="zoneName"
          :esp-devices="espDevices"
          :kaiser-id="kaiserId"
          :show-actions="true"
          @update="handleZoneConfigUpdate"
          @save="handleZoneConfigSave"
          @cancel="closeZoneConfig"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useSystemExplanations } from '@/composables/useSystemExplanations'

import MindmapEspNode from './MindmapEspNode.vue'
import ZoneConfigurationPanel from './panels/ZoneConfigurationPanel.vue'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

// Props
const props = defineProps({
  zoneName: {
    type: String,
    required: true,
  },
  espDevices: {
    type: Array,
    default: () => [],
  },
  kaiserId: {
    type: String,
    default: null,
  },
  isExpanded: {
    type: Boolean,
    default: false,
  },
  isUnconfigured: {
    type: Boolean,
    default: false,
  },
  isDragOver: {
    type: Boolean,
    default: false,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
})

// Emits
const emit = defineEmits([
  'expand',
  'drop',
  'add-esp',
  'delete-zone',
  'configure-zone',
  'update',
  'drag-over',
  'drag-leave',
  'select-esp',
])

// Stores
const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)
const mqttStore = computed(() => centralDataHub.mqttStore)
const { getCachedExplanation } = useSystemExplanations()

// ✅ OPTIMIERT: Reactive Data für Modal
const showZoneConfigModal = ref(false)

// ✅ OPTIMIERT: Computed Properties
const isMobile = computed(() => {
  return window.innerWidth < 768
})

const onlineEspCount = computed(() => {
  return props.espDevices.filter((espId) => {
    const device = mqttStore.value.espDevices.get(espId)
    return device && device.status === 'online'
  }).length
})

const sensorCount = computed(() => {
  let totalSensors = 0
  props.espDevices.forEach((espId) => {
    const device = mqttStore.value.espDevices.get(espId)
    if (device && device.sensors) {
      totalSensors += device.sensors.size
    }
  })
  return totalSensors
})

// ✅ OPTIMIERT: System-Erklärung nur bei Problemen
const systemExplanation = computed(() => {
  // Nur Erklärung anzeigen wenn Zone Probleme hat
  if (onlineEspCount.value === props.espDevices.length && props.espDevices.length > 0) return null
  return getCachedExplanation('zone', props.zoneName)
})

// ✅ OPTIMIERT: Multi-Kaiser Visualisierung
const hasMultipleKaisers = computed(() => {
  const kaisers = new Set()
  props.espDevices.forEach((espId) => {
    kaisers.add(centralConfig.value.getKaiserForEsp(espId))
  })
  return kaisers.size > 1
})

const uniqueKaisers = computed(() => {
  const kaisers = new Set()
  props.espDevices.forEach((espId) => {
    kaisers.add(centralConfig.value.getKaiserForEsp(espId))
  })
  return Array.from(kaisers)
})

// Kaiser-Farbe für ESP ermitteln
const getKaiserColorForEsp = (espId) => {
  const kaiserId = centralConfig.value.getKaiserForEsp(espId)
  return centralConfig.value.getKaiserColor(kaiserId)
}

// Kaiser-Name für ESP ermitteln
const getKaiserDisplayNameForEsp = (espId) => {
  const kaiserId = centralConfig.value.getKaiserForEsp(espId)
  return centralConfig.value.getKaiserDisplayName(kaiserId)
}

// Methods
const getZoneIcon = () => {
  if (props.isUnconfigured) {
    return 'mdi-alert-circle-outline'
  }
  return centralConfig.value.getZoneIcon(props.zoneName) || 'mdi-map-marker'
}

const getZoneColor = () => {
  if (props.isUnconfigured) {
    return 'grey'
  }
  return centralConfig.value.getZoneColor(props.zoneName) || 'primary'
}

const handleDragOver = (event) => {
  event.preventDefault()
  centralDataHub.setDragOverZone(props.zoneName)
  emit('drag-over', event, props.zoneName)
}

const handleDragLeave = () => {
  centralDataHub.clearDragOverZone()
  emit('drag-leave')
}

const handleDrop = () => {
  const draggedEspId = centralDataHub.getDraggedEspId()
  if (draggedEspId) {
    console.log(`[ZoneNode] Dropping ESP ${draggedEspId} into zone ${props.zoneName}`)
    emit('drop', props.zoneName)
  }
}

const startDrag = (espId) => {
  // Drag-Event an Parent weiterleiten
  console.log(`[ZoneNode] Starting drag for ESP: ${espId}`)
  // Hier könnte man ein globales Event oder Store verwenden
  // Für jetzt leiten wir es über die Parent-Komponente weiter
}

const stopDrag = () => {
  // Drag-Event an Parent weiterleiten
  console.log('[ZoneNode] Stopping drag')
  // Hier könnte man ein globales Event oder Store verwenden
}

const addEspToZone = () => {
  emit('add-esp')
}

const configureEsp = (espId) => {
  emit('configure-esp', espId)
}

const deleteEsp = (espId) => {
  emit('delete-esp', espId)
}

const moveEsp = (espId, newZone) => {
  emit('move-esp', espId, newZone)
}

const selectEsp = (espId) => {
  emit('select-esp', espId)
}

// ✅ OPTIMIERT: Zone-Konfigurations-Modal Methods
const openZoneConfig = () => {
  showZoneConfigModal.value = true
}

const closeZoneConfig = () => {
  showZoneConfigModal.value = false
}

const handleZoneConfigUpdate = (updatedData) => {
  emit('update', updatedData)
}

const handleZoneConfigSave = async (configData) => {
  try {
    // Speichere Zone-Konfiguration
    // Hier würde die Zone-Konfiguration gespeichert werden

    // Schließe Modal
    closeZoneConfig()

    // Emit Update
    emit('update', configData)
  } catch (error) {
    console.error('Failed to save zone configuration:', error)
  }
}

const getEspStatusColor = (espId) => {
  const device = mqttStore.value.espDevices.get(espId)
  if (!device) return 'grey'

  if (device.status === 'online') return 'success'
  if (device.status === 'offline') return 'error'
  return 'warning'
}

const getEspFriendlyName = (espId) => {
  const device = mqttStore.value.espDevices.get(espId)
  return device?.friendlyName || espId
}
</script>

<style scoped>
/* ✅ OPTIMIERT: Mindmap-spezifische Styles für UnifiedCard */
.mindmap-node {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  overflow: hidden;
}

.mindmap-node:hover {
  transform: translateY(-2px);
}

.mindmap-node.expanded {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
}

/* ✅ OPTIMIERT: Zone-Übersicht */
.zone-overview {
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

/* ✅ OPTIMIERT: ESP-Übersicht */
.esp-overview-section {
  margin-bottom: 1.5rem;
}

.esp-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.esp-preview {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.esp-preview:hover {
  transform: scale(1.05);
}

.esp-chip {
  cursor: pointer;
}

/* ✅ OPTIMIERT: Zone-Erklärung */
.zone-explanation-section {
  margin-bottom: 1.5rem;
}

.explanation-content h4 {
  color: #1976d2;
  margin-bottom: 0.5rem;
}

/* Spezifische Node-Typen */
.zone-node {
  border-left: 4px solid #4caf50;
  min-width: 320px;
  max-width: 500px;
}

.zone-node.unconfigured {
  border-left: 4px solid #9e9e9e;
  border-style: dashed;
}

/* Drag & Drop */
.zone-node.drag-over {
  border-color: #2196f3;
  background: rgba(33, 150, 243, 0.05);
  transform: scale(1.02);
}

/* ESP-Grid */
.esp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

/* Animations */
.v-expand-transition-enter-active,
.v-expand-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ✅ OPTIMIERT: Multi-Kaiser Visualisierung Styles */
.kaiser-indicators {
  display: flex;
  align-items: center;
  gap: 4px;
}

.kaiser-dots {
  display: flex;
  gap: 2px;
}

.kaiser-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.esp-container {
  position: relative;
  margin-bottom: 8px;
  padding-left: 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.esp-container:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.kaiser-badge {
  font-size: 10px !important;
  height: 16px !important;
  min-width: unset !important;
}

.esp-chip {
  width: 100%;
  justify-content: flex-start;
}

/* Responsive Anpassungen für Multi-Kaiser */
@media (max-width: 768px) {
  .kaiser-badge {
    display: none; /* Kaiser-Badges auf Mobile ausblenden */
  }

  .kaiser-indicators {
    gap: 2px;
  }

  .kaiser-dot {
    width: 6px;
    height: 6px;
  }
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .mindmap-node {
    max-width: 100%;
  }

  .esp-grid {
    grid-template-columns: 1fr;
  }

  .esp-grid {
    justify-content: center;
  }
}
</style>
