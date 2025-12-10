<template>
  <v-dialog v-model="show" max-width="900" persistent>
    <UnifiedCard
      :title="getDialogTitle()"
      icon="mdi-map-marker"
      variant="elevated"
      :loading="saving"
      :error="error"
    >
      <template #content>
        <!-- ZONE-ÜBERSICHT -->
        <div class="zone-overview mb-6">
          <h3 class="text-h6 mb-4">🏠 Zone-Struktur</h3>

          <div class="zone-hierarchy">
            <!-- HAUPTZONEN -->
            <div class="main-zones">
              <div
                v-for="zone in mainZones"
                :key="zone.id"
                class="zone-item"
                :class="{ selected: selectedZone?.id === zone.id }"
                @click="selectZone(zone)"
              >
                <div class="zone-header">
                  <v-icon icon="mdi-map-marker" class="mr-2" />
                  <span class="zone-name">{{ zone.name }}</span>
                  <v-chip size="small" color="info" variant="tonal" class="ml-2">
                    {{ zone.espCount }} ESPs
                  </v-chip>
                </div>

                <!-- SUBZONEN -->
                <div v-if="zone.subzones && zone.subzones.length > 0" class="subzones">
                  <div
                    v-for="subzone in zone.subzones"
                    :key="subzone.id"
                    class="subzone-item"
                    :class="{ selected: selectedSubzone?.id === subzone.id }"
                    @click.stop="selectSubzone(subzone)"
                  >
                    <v-icon icon="mdi-map-marker-multiple" size="small" class="mr-2" />
                    <span class="subzone-name">{{ subzone.name }}</span>
                    <v-chip size="x-small" color="secondary" variant="tonal" class="ml-2">
                      {{ subzone.deviceCount }} Geräte
                    </v-chip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ZONE-KONFIGURATION -->
        <div v-if="selectedZone" class="zone-configuration">
          <h3 class="text-h6 mb-4">
            {{ isEditing ? 'Zone bearbeiten' : 'Neue Zone erstellen' }}
          </h3>

          <v-form ref="zoneForm">
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="zoneForm.name"
                  label="Zone-Name"
                  hint="z.B. 'Gewächshaus', 'Garten' oder 'Büro'"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'Name ist erforderlich']"
                  class="mb-4"
                />

                <v-textarea
                  v-model="zoneForm.description"
                  label="Beschreibung"
                  hint="Optionale Beschreibung der Zone"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                  rows="3"
                  class="mb-4"
                />

                <v-select
                  v-model="zoneForm.type"
                  label="Zone-Typ"
                  :items="zoneTypeOptions"
                  hint="Wählen Sie den passenden Zone-Typ"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                  class="mb-4"
                />
              </v-col>

              <v-col cols="12" md="6">
                <v-select
                  v-model="zoneForm.location"
                  label="Standort"
                  :items="locationOptions"
                  hint="Allgemeiner Standort der Zone"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                  class="mb-4"
                />

                <v-switch
                  v-model="zoneForm.autoAssign"
                  label="Automatische ESP-Zuordnung"
                  color="primary"
                  hide-details
                  class="mb-4"
                />

                <v-switch
                  v-model="zoneForm.enableMonitoring"
                  label="Monitoring aktivieren"
                  color="success"
                  hide-details
                  class="mb-4"
                />
              </v-col>
            </v-row>
          </v-form>
        </div>

        <!-- ESP-ZUORDNUNG -->
        <div v-if="selectedZone" class="esp-assignment mt-6">
          <h3 class="text-h6 mb-4">📱 ESP-Geräte zuordnen</h3>

          <HelpfulHints context="zoneAssignment" class="mb-4" />

          <div class="esp-selection">
            <v-select
              v-model="selectedEspIds"
              :items="availableEspDevices"
              item-title="name"
              item-value="id"
              label="ESP-Geräte auswählen"
              hint="Wählen Sie ESP-Geräte für diese Zone"
              persistent-hint
              variant="outlined"
              density="comfortable"
              multiple
              chips
              closable-chips
              class="mb-4"
            />

            <!-- ZUGEORDNETE ESPS -->
            <div
              v-if="selectedZone.espDevices && selectedZone.espDevices.length > 0"
              class="assigned-esps"
            >
              <h4 class="text-subtitle-2 mb-2">Zugeordnete ESPs:</h4>
              <div class="esp-chips">
                <v-chip
                  v-for="esp in selectedZone.espDevices"
                  :key="esp.id"
                  :color="esp.status === 'online' ? 'success' : 'error'"
                  size="small"
                  variant="tonal"
                  closable
                  @click:close="removeEspFromZone(esp.id)"
                >
                  <v-icon
                    :icon="esp.status === 'online' ? 'mdi-wifi' : 'mdi-wifi-off'"
                    size="x-small"
                    class="mr-1"
                  />
                  {{ esp.name }}
                </v-chip>
              </div>
            </div>
          </div>
        </div>

        <!-- SUBZONE-VERWALTUNG -->
        <div v-if="selectedZone" class="subzone-management mt-6">
          <div class="d-flex align-center justify-space-between mb-4">
            <h3 class="text-h6">🏠 Bereiche verwalten</h3>
            <v-btn color="primary" size="small" prepend-icon="mdi-plus" @click="addSubzone">
              Bereich hinzufügen
            </v-btn>
          </div>

          <div class="subzones-list">
            <div
              v-for="subzone in selectedZone.subzones"
              :key="subzone.id"
              class="subzone-config-item"
            >
              <div class="subzone-config-header">
                <v-text-field
                  v-model="subzone.name"
                  label="Bereich-Name"
                  variant="outlined"
                  density="compact"
                  class="flex-grow-1 mr-2"
                />
                <v-btn
                  icon="mdi-delete"
                  size="small"
                  color="error"
                  variant="text"
                  @click="removeSubzone(subzone.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #actions>
        <v-btn @click="cancel" :disabled="saving"> Abbrechen </v-btn>
        <v-btn color="primary" @click="save" :loading="saving" :disabled="!isFormValid">
          {{ isEditing ? 'Aktualisieren' : 'Erstellen' }}
        </v-btn>
      </template>
    </UnifiedCard>
  </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from './UnifiedCard.vue'
import HelpfulHints from './HelpfulHints.vue'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  zoneId: {
    type: String,
    default: null,
  },
  initialData: {
    type: Object,
    default: () => ({}),
  },
})

// Emits
const emit = defineEmits(['update:modelValue', 'saved', 'cancelled'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive Data
const show = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const saving = ref(false)
const error = ref(null)
const selectedZone = ref(null)
const selectedSubzone = ref(null)
const selectedEspIds = ref([])

// Form Data
const zoneForm = ref({
  name: '',
  description: '',
  type: '',
  location: '',
  autoAssign: true,
  enableMonitoring: true,
})

// Computed Properties
const isEditing = computed(() => !!props.zoneId)

const zoneTypeOptions = computed(() => [
  { title: '🏡 Wohnbereich', value: 'residential' },
  { title: '🌱 Gewächshaus', value: 'greenhouse' },
  { title: '🏡 Garten', value: 'garden' },
  { title: '🏢 Büro', value: 'office' },
  { title: '🏭 Gewerbe', value: 'commercial' },
  { title: '🌾 Landwirtschaft', value: 'agriculture' },
])

const locationOptions = computed(() => [
  'Innenbereich',
  'Außenbereich',
  'Gewächshaus',
  'Keller',
  'Dachboden',
  'Garten',
  'Balkon',
])

const mainZones = computed(() => {
  // Lade Zonen aus dem System
  const zones = []

  if (mqttStore.value.espDevices) {
    const zoneMap = new Map()

    mqttStore.value.espDevices.forEach((device) => {
      const zoneName = device.zone || '🕳️ Unkonfiguriert'

      if (!zoneMap.has(zoneName)) {
        zoneMap.set(zoneName, {
          id: zoneName,
          name: zoneName,
          espCount: 0,
          espDevices: [],
          subzones: [],
        })
      }

      const zone = zoneMap.get(zoneName)
      zone.espCount++
      zone.espDevices.push({
        id: device.espId,
        name: device.espFriendlyName || `ESP ${device.espId}`,
        status: device.lastHeartbeat ? 'online' : 'offline',
      })
    })

    zones.push(...Array.from(zoneMap.values()))
  }

  return zones
})

const availableESPDevices = computed(() => {
  const devices = []

  if (mqttStore.value.espDevices) {
    mqttStore.value.espDevices.forEach((device) => {
      devices.push({
        id: device.espId,
        name: device.espFriendlyName || `ESP ${device.espId}`,
        status: device.lastHeartbeat ? 'online' : 'offline',
        zone: device.zone,
      })
    })
  }

  return devices
})

const isFormValid = computed(() => {
  return !!zoneForm.value.name && !!zoneForm.value.type
})

// Methods
const getDialogTitle = () => {
  return isEditing.value ? 'Zone bearbeiten' : 'Neue Zone erstellen'
}

const selectZone = (zone) => {
  selectedZone.value = zone
  selectedSubzone.value = null

  // Form mit Zone-Daten füllen
  zoneForm.value = {
    name: zone.name,
    description: zone.description || '',
    type: zone.type || 'residential',
    location: zone.location || 'Innenbereich',
    autoAssign: zone.autoAssign !== false,
    enableMonitoring: zone.enableMonitoring !== false,
  }

  // ESP-IDs für diese Zone setzen
  selectedEspIds.value = zone.espDevices?.map((esp) => esp.id) || []
}

const selectSubzone = (subzone) => {
  selectedSubzone.value = subzone
}

const addSubzone = () => {
  if (!selectedZone.value) return

  const newSubzone = {
    id: `subzone_${Date.now()}`,
    name: 'Neuer Bereich',
    deviceCount: 0,
  }

  if (!selectedZone.value.subzones) {
    selectedZone.value.subzones = []
  }

  selectedZone.value.subzones.push(newSubzone)
}

const removeSubzone = (subzoneId) => {
  if (!selectedZone.value?.subzones) return

  const index = selectedZone.value.subzones.findIndex((s) => s.id === subzoneId)
  if (index > -1) {
    selectedZone.value.subzones.splice(index, 1)
  }
}

const removeEspFromZone = (espId) => {
  if (!selectedZone.value?.espDevices) return

  const index = selectedZone.value.espDevices.findIndex((esp) => esp.id === espId)
  if (index > -1) {
    selectedZone.value.espDevices.splice(index, 1)
  }

  // Aus selectedEspIds entfernen
  const espIndex = selectedEspIds.value.indexOf(espId)
  if (espIndex > -1) {
    selectedEspIds.value.splice(espIndex, 1)
  }
}

const save = async () => {
  if (!isFormValid.value) {
    safeError('Bitte füllen Sie alle erforderlichen Felder aus')
    return
  }

  saving.value = true
  error.value = null

  try {
    const zoneData = {
      id: props.zoneId || `zone_${Date.now()}`,
      ...zoneForm.value,
      espDevices: selectedEspIds.value.map((espId) => {
        const device = availableESPDevices.value.find((d) => d.id === espId)
        return {
          id: espId,
          name: device?.name || `ESP ${espId}`,
          status: device?.status || 'offline',
        }
      }),
      subzones: selectedZone.value?.subzones || [],
    }

    // Zone über Central Config speichern
    await centralDataHub.centralConfig.saveZone(zoneData)

    // ESP-Zuordnungen aktualisieren
    for (const espId of selectedEspIds.value) {
      await mqttStore.value.updateEspZone(espId, zoneData.name)
    }

    safeSuccess(
      `Zone "${zoneData.name}" erfolgreich ${isEditing.value ? 'aktualisiert' : 'erstellt'}`,
    )
    emit('saved', zoneData)
    show.value = false
  } catch (err) {
    console.error('Zone save error:', err)
    error.value = err.message
    safeError(`Fehler beim Speichern: ${err.message}`)
  } finally {
    saving.value = false
  }
}

const cancel = () => {
  emit('cancelled')
  show.value = false
}

// Initialize when dialog opens
watch(show, (newValue) => {
  if (newValue) {
    if (props.zoneId) {
      // Bearbeitungsmodus: Zone laden
      const zone = mainZones.value.find((z) => z.id === props.zoneId)
      if (zone) {
        selectZone(zone)
      }
    } else {
      // Erstellungsmodus: Neue Zone
      selectedZone.value = {
        id: null,
        name: '',
        espCount: 0,
        espDevices: [],
        subzones: [],
      }
      zoneForm.value = {
        name: '',
        description: '',
        type: 'residential',
        location: 'Innenbereich',
        autoAssign: true,
        enableMonitoring: true,
      }
      selectedEspIds.value = []
    }
  }
})
</script>

<style scoped>
.zone-overview {
  max-height: 300px;
  overflow-y: auto;
}

.zone-hierarchy {
  border: 1px solid var(--v-theme-outline);
  border-radius: 8px;
  padding: 16px;
}

.zone-item {
  border: 1px solid var(--v-theme-outline);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.zone-item:hover {
  border-color: var(--v-theme-primary);
  background: rgba(var(--v-theme-primary), 0.05);
}

.zone-item.selected {
  border-color: var(--v-theme-primary);
  background: rgba(var(--v-theme-primary), 0.1);
}

.zone-header {
  display: flex;
  align-items: center;
  font-weight: 500;
}

.zone-name {
  flex-grow: 1;
}

.subzones {
  margin-top: 8px;
  margin-left: 24px;
}

.subzone-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.subzone-item:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
}

.subzone-item.selected {
  background: rgba(var(--v-theme-secondary), 0.2);
}

.subzone-name {
  flex-grow: 1;
  font-size: 0.875rem;
}

.zone-configuration,
.esp-assignment,
.subzone-management {
  border-top: 1px solid var(--v-theme-outline);
  padding-top: 16px;
}

.esp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.subzone-config-item {
  border: 1px solid var(--v-theme-outline);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.subzone-config-header {
  display: flex;
  align-items: center;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .zone-hierarchy {
    padding: 8px;
  }

  .zone-item {
    padding: 8px;
  }

  .subzones {
    margin-left: 16px;
  }
}
</style>
