<template>
  <UnifiedCard
    :title="kaiser.name"
    :subtitle="kaiser.kaiserId"
    icon="mdi-crown"
    icon-color="primary"
    :status="kaiser.status"
    variant="outlined"
    class="mindmap-node kaiser-node"
    :class="{ expanded: isExpanded, 'drop-zone-active': isDropZoneActive }"
    :interactive="true"
    :show-header-actions="true"
    :show-expand-button="true"
    :expanded="isExpanded"
    @click="$emit('expand')"
    @expand="$emit('expand')"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleEspDrop"
  >
    <!-- Header Actions -->
    <template #header-actions>
      <!-- ✅ OPTIMIERT: Default Kaiser Indikator - nur wenn relevant -->
      <v-chip v-if="isDefault" size="x-small" color="warning" variant="tonal" class="mr-2">
        <v-icon icon="mdi-help-circle" size="x-small" class="mr-1" />
        Unkonfiguriert
      </v-chip>

      <v-btn icon="mdi-cog" @click.stop="openKaiserConfig" />
      <v-btn icon="mdi-plus" @click.stop="$emit('add-esp')" />
      <v-btn v-if="canDelete && !isDefault" icon="mdi-delete" @click.stop="$emit('delete')" />
    </template>

    <!-- Content -->
    <template #content>
      <v-expand-transition>
        <div v-if="isExpanded">
          <!-- ✅ OPTIMIERT: Kompakte Kaiser-Statistiken -->
          <div class="kaiser-overview mb-4">
            <v-row>
              <v-col cols="6">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold text-primary">{{ espDevices.length }}</div>
                  <div class="text-caption">Feldgeräte</div>
                </div>
              </v-col>
              <v-col cols="6">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold" :class="getNodeStatusColor(kaiser.status)">
                    {{ kaiser.status }}
                  </div>
                  <div class="text-caption">Status</div>
                </div>
              </v-col>
            </v-row>
          </div>

          <!-- ✅ OPTIMIERT: Default Kaiser Information - nur wenn relevant -->
          <div v-if="isDefault" class="default-kaiser-info mb-4">
            <v-alert type="warning" variant="tonal" class="mb-4">
              <template #prepend>
                <v-icon icon="mdi-help-circle" />
              </template>
              <div>
                <strong>Unkonfigurierter Kaiser:</strong> Konfiguriere ihn, um ihn zu aktivieren.
                <br />
                <strong>Hinweis:</strong> Echter Kaiser übernimmt diese Konfiguration.
              </div>
            </v-alert>
          </div>

          <!-- ✅ OPTIMIERT: ESP-Übersicht - nur wenn ESPs vorhanden -->
          <div v-if="espDevices.length > 0" class="esp-overview-section mb-4">
            <h4 class="text-subtitle-1 font-weight-medium mb-3">
              <v-icon icon="mdi-memory" size="small" class="mr-1" />
              Feldgeräte ({{ espDevices.length }})
            </h4>
            <div class="esp-grid">
              <div
                v-for="espId in espDevices"
                :key="espId"
                class="esp-preview"
                @click="selectEsp(espId)"
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
              </div>
            </div>
          </div>

          <!-- ✅ OPTIMIERT: System-Erklärung nur bei Problemen -->
          <div
            v-if="systemExplanation && systemExplanation.healthStatus !== 'good'"
            class="kaiser-explanation-section"
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

          <!-- ESP-Liste unter diesem Kaiser -->
          <div class="esp-list">
            <MindmapEspNode
              v-for="esp in espDevices"
              :key="esp"
              :esp="esp"
              :kaiser-id="kaiser.id"
              @configure="configureEsp"
              @delete="deleteEsp"
            />
          </div>
        </div>
      </v-expand-transition>
    </template>
  </UnifiedCard>

  <!-- ✅ OPTIMIERT: Kaiser-Konfigurations-Modal -->
  <v-dialog
    v-model="showKaiserConfigModal"
    :max-width="600"
    :fullscreen="isMobile"
    persistent
    @click:outside="closeKaiserConfig"
    @keydown.esc="closeKaiserConfig"
  >
    <v-card>
      <v-card-title class="d-flex align-center bg-primary text-white">
        <v-icon icon="mdi-crown" class="mr-2" />
        {{ kaiser.name }} - Konfiguration
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="closeKaiserConfig" />
      </v-card-title>

      <v-card-text class="pt-4">
        <KaiserConfigurationPanel
          :kaiser="kaiser"
          :esp-devices="espDevices"
          :show-actions="true"
          @update="handleKaiserConfigUpdate"
          @save="handleKaiserConfigSave"
          @cancel="closeKaiserConfig"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useRemoteKaiserStore } from '@/stores/remoteKaiser'
import { useSystemExplanations } from '@/composables/useSystemExplanations'
import { useStatusHandling } from '@/composables/useStatusHandling'
import { eventBus, MQTT_EVENTS } from '@/utils/eventBus'

import MindmapEspNode from './MindmapEspNode.vue'
import KaiserConfigurationPanel from './panels/KaiserConfigurationPanel.vue'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

// Props
const props = defineProps({
  kaiser: {
    type: Object,
    required: true,
  },
  isExpanded: {
    type: Boolean,
    default: false,
  },
  espDevices: {
    type: Array,
    default: () => [],
  },
  canDelete: {
    type: Boolean,
    default: false,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
})

// Emits
const emit = defineEmits(['expand', 'configure', 'delete', 'add-esp', 'update', 'select-esp'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)
const remoteKaiserStore = useRemoteKaiserStore()
const { getCachedExplanation } = useSystemExplanations()

// ✅ NEUE STATUS-LOGIK VERWENDEN
const { getStatusColor } = useStatusHandling()

// ✅ OPTIMIERT: Reactive Data für Modal
const showKaiserConfigModal = ref(false)

// ✅ NEU: Drop-Zone State für ESP-Transfer
const isDropZoneActive = ref(false)

// ✅ OPTIMIERT: Computed Properties
const isMobile = computed(() => {
  return window.innerWidth < 768
})

// ✅ OPTIMIERT: System-Erklärung nur bei Problemen
const systemExplanation = computed(() => {
  // Nur Erklärung anzeigen wenn Kaiser offline oder Probleme hat
  if (props.kaiser.status === 'online' && props.espDevices.length > 0) return null
  return getCachedExplanation('kaiser', props.kaiser.id)
})

// Methods
const configureEsp = (espId) => {
  emit('configure-esp', espId)
}

const deleteEsp = (espId) => {
  emit('delete-esp', espId)
}

const selectEsp = (espId) => {
  emit('select-esp', espId)
}

// ✅ OPTIMIERT: Kaiser-Konfigurations-Modal Methods
const openKaiserConfig = () => {
  showKaiserConfigModal.value = true
}

const closeKaiserConfig = () => {
  showKaiserConfigModal.value = false
}

const handleKaiserConfigUpdate = (updatedData) => {
  emit('update', updatedData)
}

const handleKaiserConfigSave = async (configData) => {
  try {
    // ✅ KORRIGIERT: Verwende remoteKaiserStore für Kaiser-ID-Verwaltung
    if (configData.name) {
      remoteKaiserStore.setKaiserIdFromMindmap(configData.name)
    }

    if (configData.isGod) {
      centralConfig.value.setGodMode(true)
    }

    // Schließe Modal
    closeKaiserConfig()

    // Emit Update
    emit('update', configData)
  } catch (error) {
    console.error('Failed to save kaiser configuration:', error)
  }
}

// ✅ OPTIMIERT: Helper Methods
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

// ✅ BESTEHENDE FUNKTION ERSETZEN (Zeile 305-313)
const getNodeStatusColor = (status) => {
  return getStatusColor(status, 'default', 'tailwind') // Format: 'tailwind'
}

// ✅ NEU: Drop-Zone Event-Handler für ESP-Transfer
const handleDragOver = (event) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  isDropZoneActive.value = true
}

const handleDragLeave = (event) => {
  // Nur deaktivieren wenn wir wirklich den Node verlassen
  if (!event.currentTarget.contains(event.relatedTarget)) {
    isDropZoneActive.value = false
  }
}

const handleEspDrop = async (event) => {
  event.preventDefault()
  isDropZoneActive.value = false

  try {
    const espData = event.dataTransfer.getData('text/plain')
    if (!espData) {
      console.warn('[KaiserNode] No ESP data in drop event')
      return
    }

    // ESP zu diesem Kaiser transferieren
    await acceptEspTransfer(espData)

    console.log(`[KaiserNode] ESP ${espData} accepted by Kaiser ${props.kaiser.kaiserId}`)
  } catch (error) {
    console.error('[KaiserNode] ESP drop failed:', error)
  }
}

const acceptEspTransfer = async (espId) => {
  // Event für ESP-Aufnahme
  eventBus.emit(MQTT_EVENTS.ESP_KAISER_ACCEPT, {
    espId,
    targetKaiserId: props.kaiser.kaiserId,
    timestamp: Date.now(),
  })
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

/* ✅ NEU: Drop-Zone Styles für ESP-Transfer */
.mindmap-node.drop-zone-active {
  border: 2px dashed #2196f3;
  background: rgba(33, 150, 243, 0.05);
  transform: scale(1.02);
}

/* ✅ OPTIMIERT: Kaiser-Übersicht */
.kaiser-overview {
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

/* ✅ OPTIMIERT: Kaiser-Erklärung */
.kaiser-explanation-section {
  margin-bottom: 1.5rem;
}

.explanation-content h4 {
  color: #1976d2;
  margin-bottom: 0.5rem;
}

/* Spezifische Node-Typen */
.kaiser-node {
  border-left: 4px solid #2196f3;
  min-width: 350px;
  max-width: 550px;
}

/* ESP-Liste */
.esp-list {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

/* Animations */
.v-expand-transition-enter-active,
.v-expand-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .mindmap-node {
    max-width: 100%;
  }

  .esp-list {
    grid-template-columns: 1fr;
  }

  .esp-grid {
    justify-content: center;
  }
}
</style>
