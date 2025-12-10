<template>
  <v-dialog
    v-model="showModal"
    :max-width="getDialogMaxWidth()"
    :fullscreen="isMobile"
    :persistent="false"
    :retain-focus="false"
    :scrollable="true"
    @click:outside="handleCancel"
    @keydown.esc="handleCancel"
    class="mindmap-configuration-modal"
  >
    <v-card class="configuration-modal-card">
      <!-- Dialog Header -->
      <v-card-title class="d-flex align-center bg-primary text-white">
        <v-icon :icon="getConfigIcon()" class="mr-2" />
        {{ getConfigTitle() }}
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="handleCancel" class="text-white" />
      </v-card-title>

      <v-card-text class="pa-4">
        <!-- Dynamischer Inhalt basierend auf Config-Type -->
        <div v-if="configType === 'god'">
          <GodConfigurationPanel
            :god-data="configData"
            :show-actions="true"
            @update="handleConfigUpdate"
            @save="handlePanelSave"
            @cancel="handleCancel"
          />
        </div>

        <div v-else-if="configType === 'kaiser'">
          <KaiserConfigurationPanel
            :kaiser="configData"
            :esp-devices="getKaiserEsps()"
            :show-actions="true"
            @update="handleConfigUpdate"
            @save="handlePanelSave"
            @cancel="handleCancel"
          />
        </div>

        <div v-else-if="configType === 'zone'">
          <ZoneConfigurationPanel
            :zone-name="configData.name"
            :esp-devices="configData.esps"
            :kaiser-id="configData.kaiserId"
            :show-actions="true"
            @update="handleConfigUpdate"
            @save="handlePanelSave"
            @cancel="handleCancel"
            @add-esp="handleAddEsp"
            @refresh-zone="handleRefreshZone"
            @delete-zone="handleDeleteZone"
          />
        </div>

        <div v-else-if="configType === 'esp'">
          <EspConfigurationPanel
            :esp="configData.esp"
            :zone-name="configData.zoneName"
            :kaiser-id="configData.kaiserId"
            :show-actions="true"
            @update="handleConfigUpdate"
            @save="handlePanelSave"
            @cancel="handleCancel"
            @refresh-esp="handleRefreshEsp"
            @restart-esp="handleRestartEsp"
            @delete-esp="handleDeleteEsp"
          />
        </div>

        <div v-else>
          <v-alert type="warning" class="mb-4">
            Unbekannter Konfigurationstyp: {{ configType }}
          </v-alert>
        </div>
      </v-card-text>

      <!-- ✅ ENTFERNT: Dialog Actions - Panel übernimmt jetzt die Speicherung -->
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

// Konfigurations-Panels
import GodConfigurationPanel from './panels/GodConfigurationPanel.vue'
import KaiserConfigurationPanel from './panels/KaiserConfigurationPanel.vue'
import ZoneConfigurationPanel from './panels/ZoneConfigurationPanel.vue'
import EspConfigurationPanel from './panels/EspConfigurationPanel.vue'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  configType: {
    type: String,
    default: null,
  },
  configData: {
    type: Object,
    default: () => ({}),
  },
})

// Emits
const emit = defineEmits(['update:modelValue', 'save', 'cancel'])

// Stores
const centralDataHub = useCentralDataHub()

// Computed Properties
const showModal = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const isMobile = computed(() => {
  return window.innerWidth < 768
})

// Methods
const getDialogMaxWidth = () => {
  if (isMobile.value) return '100%'

  switch (props.configType) {
    case 'god':
      return '600px'
    case 'kaiser':
      return '800px'
    case 'zone':
      return '700px'
    case 'esp':
      return '800px'
    default:
      return '600px'
  }
}

const getConfigIcon = () => {
  switch (props.configType) {
    case 'god':
      return 'mdi-brain'
    case 'kaiser':
      return 'mdi-crown'
    case 'zone':
      return 'mdi-map-marker'
    case 'esp':
      return 'mdi-memory'
    default:
      return 'mdi-cog'
  }
}

const getConfigTitle = () => {
  switch (props.configType) {
    case 'god':
      return 'God Pi Konfiguration'
    case 'kaiser':
      return 'Kaiser Konfiguration'
    case 'zone':
      return 'Zone Konfiguration'
    case 'esp':
      return 'ESP Konfiguration'
    default:
      return 'Konfiguration'
  }
}

const getKaiserEsps = () => {
  if (props.configType === 'kaiser' && props.configData.id) {
    return centralDataHub.getKaiserEspIds(props.configData.id) || []
  }
  return []
}

const handleConfigUpdate = (updatedData) => {
  // Konfigurationsdaten aktualisieren
  console.log('[Modal] Config updated:', updatedData)
}

// ✅ NEU: Panel-Save-Event-Handler
const handlePanelSave = (panelData) => {
  console.log('[Modal] Panel saved:', panelData)
  emit('save', panelData) // An Parent weiterleiten
  showModal.value = false
}

// ✅ ENTFERNT: handleSave() - Panel übernimmt jetzt die Speicherung

const handleCancel = () => {
  emit('cancel')
  showModal.value = false
}

// Event-Handler für Zone-Aktionen
const handleAddEsp = () => {
  console.log('Add ESP to zone')
}

const handleRefreshZone = () => {
  console.log('Refresh zone')
}

const handleDeleteZone = () => {
  console.log('Delete zone')
}

// Event-Handler für ESP-Aktionen
const handleRefreshEsp = () => {
  console.log('Refresh ESP')
}

const handleRestartEsp = () => {
  console.log('Restart ESP')
}

const handleDeleteEsp = () => {
  console.log('Delete ESP')
}
</script>

<style scoped>
.mindmap-configuration-modal {
  z-index: 1000;
}

.configuration-modal-card {
  max-height: 90vh;
  overflow-y: auto;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .configuration-modal-card {
    max-height: 100vh;
  }
}
</style>
