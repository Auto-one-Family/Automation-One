<template>
  <div class="esp-zone-management">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-map-marker" color="primary" class="mr-2" />
      <h4 class="text-subtitle-1 font-weight-medium">Zone-Verwaltung</h4>
    </div>

    <!-- Zone-Auswahl -->
    <v-select
      v-model="selectedZone"
      label="Zone"
      :items="availableZones"
      variant="outlined"
      density="comfortable"
      :disabled="readonly"
      @update:model-value="onZoneChange"
    />

    <!-- Subzone-Management (aus ZoneManagement.vue) -->
    <v-expansion-panels v-if="selectedZone" variant="accordion" class="mt-3">
      <v-expansion-panel>
        <v-expansion-panel-title>
          <v-icon icon="mdi-map-marker-multiple" class="mr-2" />
          Subzones ({{ subzones.length }})
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <!-- Subzone-Liste -->
          <v-list density="compact">
            <v-list-item v-for="subzone in subzones" :key="subzone.id" class="mb-2">
              <template #prepend>
                <v-avatar color="primary" size="32" variant="tonal">
                  <v-icon icon="mdi-map-marker" size="16" />
                </v-avatar>
              </template>
              <v-list-item-title>{{ subzone.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ subzone.description }}</v-list-item-subtitle>
              <template #append>
                <v-btn
                  v-if="!readonly"
                  icon="mdi-pencil"
                  variant="text"
                  size="small"
                  @click="editSubzone(subzone)"
                />
                <v-btn
                  v-if="!readonly && canDeleteSubzone(subzone.id)"
                  icon="mdi-delete"
                  variant="text"
                  size="small"
                  color="error"
                  @click="deleteSubzone(subzone.id)"
                />
              </template>
            </v-list-item>
          </v-list>

          <!-- Neue Subzone hinzufügen -->
          <v-btn
            v-if="!readonly"
            color="success"
            size="small"
            variant="outlined"
            prepend-icon="mdi-plus"
            @click="showAddSubzoneDialog = true"
            class="mt-3"
          >
            Subzone hinzufügen
          </v-btn>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Add Subzone Dialog -->
    <v-dialog v-model="showAddSubzoneDialog" max-width="500">
      <v-card>
        <v-card-title>Neue Subzone erstellen</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newSubzone.id"
            label="Subzone ID"
            placeholder="greenhouse_1"
            variant="outlined"
            density="comfortable"
          />
          <v-text-field
            v-model="newSubzone.name"
            label="Name"
            placeholder="Greenhouse Zone 1"
            variant="outlined"
            density="comfortable"
          />
          <v-textarea
            v-model="newSubzone.description"
            label="Beschreibung"
            placeholder="Main greenhouse for tomatoes"
            variant="outlined"
            density="comfortable"
            rows="3"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAddSubzoneDialog = false">Abbrechen</v-btn>
          <v-btn
            color="primary"
            @click="createSubzone"
            :loading="savingSubzone"
            :disabled="!newSubzone.id || !newSubzone.name"
          >
            Erstellen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

const props = defineProps({
  espId: { type: String, required: true },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['zone-change'])

const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)
const mqttStore = computed(() => centralDataHub.mqttStore)

// ✅ KONSISTENT: Verwende bestehende Store-Logik
const selectedZone = computed({
  get: () => centralConfig.value.getZoneForEsp(props.espId),
  set: (zone) => centralConfig.value.setZone(props.espId, zone),
})

const availableZones = computed(() => centralConfig.value.getAvailableZones)
const subzones = computed(() => {
  const device = mqttStore.value.espDevices.get(props.espId)
  return device ? Array.from(device.subzones?.values() || []) : []
})

// Dialog state
const showAddSubzoneDialog = ref(false)
const savingSubzone = ref(false)
const newSubzone = ref({
  id: '',
  name: '',
  description: '',
})

const onZoneChange = (newZone) => {
  emit('zone-change', { espId: props.espId, oldZone: selectedZone.value, newZone })
}

const createSubzone = async () => {
  savingSubzone.value = true
  try {
    // TODO: Implement subzone creation via MQTT
    console.log('Creating subzone:', newSubzone.value)
    window.$snackbar?.showSuccess('Subzone erstellt')
    showAddSubzoneDialog.value = false
    newSubzone.value = { id: '', name: '', description: '' }
  } catch (error) {
    console.error('Failed to create subzone:', error)
    window.$snackbar?.showError('Fehler beim Erstellen der Subzone')
  } finally {
    savingSubzone.value = false
  }
}

const editSubzone = (subzone) => {
  console.log('Edit subzone:', subzone)
  window.$snackbar?.showInfo('Subzone-Bearbeitung wird implementiert')
}

const deleteSubzone = async (subzoneId) => {
  try {
    // TODO: Implement subzone deletion via MQTT
    console.log('Deleting subzone:', subzoneId)
    window.$snackbar?.showSuccess('Subzone gelöscht')
  } catch (error) {
    console.error('Failed to delete subzone:', error)
    window.$snackbar?.showError('Fehler beim Löschen der Subzone')
  }
}

const canDeleteSubzone = (subzoneId) => {
  // Check if subzone can be deleted (no devices assigned)
  console.log('Checking if subzone can be deleted:', subzoneId)
  return true // TODO: Implement proper check
}
</script>

<style scoped>
.esp-zone-management {
  width: 100%;
}
</style>
