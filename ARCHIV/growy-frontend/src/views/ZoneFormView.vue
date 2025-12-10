<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCentralDataHub } from '@/stores/centralDataHub'

const router = useRouter()
const route = useRoute()
const centralDataHub = useCentralDataHub()
const zonesStore = computed(() => centralDataHub.zoneRegistry)
const mqttStore = computed(() => centralDataHub.mqttStore)

const loading = ref(false)
const isEdit = ref(false)
const formData = ref({
  id: '',
  espId: '',
  name: '',
  subZones: [],
})

// Get available ESP devices from MQTT store
const availableEspDevices = computed(() => {
  const devices = []
  mqttStore.value.espDevices.forEach((device, espId) => {
    devices.push({
      title: `ESP ${espId}`,
      value: espId,
      subtitle: device.lastHeartbeat ? 'Online' : 'Offline',
    })
  })
  return devices
})

onMounted(async () => {
  if (route.params.id) {
    isEdit.value = true
    const zone = zonesStore.value.getZone(route.params.id)
    if (zone) {
      formData.value = {
        id: zone.id,
        espId: zone.espId,
        name: zone.name,
        subZones: Array.from(zone.subZones.values()).map((subZone) => ({
          id: subZone.id,
          name: subZone.name,
          description: subZone.description,
        })),
      }
    } else {
      // Zone not found, redirect back to zones list
      window.$snackbar?.showError('Zone nicht gefunden')
      router.push('/zones')
      return
    }
  } else {
    // For new zones, set default ESP ID if available
    if (availableEspDevices.value.length > 0) {
      formData.value.espId = availableEspDevices.value[0].value
    }
  }
})

async function handleSubmit() {
  loading.value = true
  try {
    // Validate form data
    if (!formData.value.name.trim()) {
      throw new Error('Zone-Name ist erforderlich')
    }

    if (!formData.value.espId) {
      throw new Error('ESP Device ist erforderlich')
    }

    // Check if ESP device is available
    if (!availableEspDevices.value.some((device) => device.value === formData.value.espId)) {
      throw new Error(`ESP Device ${formData.value.espId} ist nicht verfügbar`)
    }

    if (isEdit.value) {
      await zonesStore.value.updateZone(formData.value)
      window.$snackbar?.showSuccess('Zone erfolgreich aktualisiert')
    } else {
      await zonesStore.value.createZone(formData.value)
      window.$snackbar?.showSuccess('Zone erfolgreich erstellt')
    }

    // Navigate back to zones list and force refresh
    await router.push('/zones')
    // Force a small delay to ensure the store is updated
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Reset form data for new zones
    if (!isEdit.value) {
      formData.value = {
        id: '',
        espId: availableEspDevices.value.length > 0 ? availableEspDevices.value[0].value : '',
        name: '',
        subZones: [],
      }
    }
  } catch (error) {
    console.error('Failed to save zone:', error)
    window.$snackbar?.showError(`Fehler beim Speichern der Zone: ${error.message}`)
  } finally {
    loading.value = false
  }
}

function addSubZone() {
  formData.value.subZones.push({
    id: `sz_${Date.now()}`,
    name: '',
    description: '',
    sensors: [],
    actuators: [],
  })
}

function removeSubZone(index) {
  formData.value.subZones.splice(index, 1)
}
</script>

<template>
  <div class="zone-form pa-4">
    <div class="max-w-3xl mx-auto">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-h4">{{ isEdit ? 'Zone bearbeiten' : 'Neue Zone' }}</h1>
        <p class="text-subtitle-1 text-grey-darken-1">
          {{
            isEdit ? 'Bearbeiten Sie die Einstellungen der Zone.' : 'Erstellen Sie eine neue Zone.'
          }}
        </p>
      </div>

      <!-- Connection Status -->
      <v-alert v-if="!mqttStore.value.isConnected" type="warning" variant="tonal" class="mb-6">
        <div class="d-flex align-center justify-space-between">
          <div>
            <strong>Keine MQTT-Verbindung</strong>
            <div class="text-body-2">
              Verbinden Sie sich mit dem MQTT-Broker, um Zonen zu erstellen.
            </div>
          </div>
        </div>
      </v-alert>

      <!-- Form -->
      <v-form @submit.prevent="handleSubmit">
        <v-card variant="outlined" class="mb-6">
          <v-card-text>
            <v-row>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formData.espId"
                  label="ESP ID"
                  :items="availableEspDevices"
                  item-title="title"
                  item-value="value"
                  placeholder="ESP Device auswählen"
                  hint="Die ID des ESP-Geräts"
                  persistent-hint
                  required
                  :disabled="isEdit"
                  variant="outlined"
                  density="comfortable"
                >
                  <template #item="{ item, props }">
                    <v-list-item v-bind="props">
                      <v-list-item-title>{{ item.raw.title }}</v-list-item-title>
                      <v-list-item-subtitle>{{ item.raw.subtitle }}</v-list-item-subtitle>
                    </v-list-item>
                  </template>
                </v-select>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.name"
                  label="Name"
                  placeholder="z.B. Gewächshaus 1"
                  hint="Ein aussagekräftiger Name für die Zone"
                  persistent-hint
                  required
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- SubZones -->
        <v-card variant="outlined" class="mb-6">
          <v-card-title class="d-flex justify-space-between align-center">
            <span>Unterzonen</span>
            <v-btn color="primary" variant="text" prepend-icon="mdi-plus" @click="addSubZone">
              Unterzone hinzufügen
            </v-btn>
          </v-card-title>

          <v-card-text>
            <v-expansion-panels>
              <v-expansion-panel v-for="(subZone, index) in formData.subZones" :key="subZone.id">
                <v-expansion-panel-title>
                  {{ subZone.name || `Neue Unterzone ${index + 1}` }}
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-row>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="subZone.name"
                        label="Name"
                        placeholder="z.B. Tomaten"
                        variant="outlined"
                        density="comfortable"
                      />
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="subZone.description"
                        label="Beschreibung"
                        placeholder="Optional"
                        variant="outlined"
                        density="comfortable"
                      />
                    </v-col>
                  </v-row>

                  <div class="d-flex justify-end">
                    <v-btn color="error" variant="text" @click="removeSubZone(index)">
                      Unterzone löschen
                    </v-btn>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <div v-if="formData.subZones.length === 0" class="text-center py-4 text-grey">
              Keine Unterzonen vorhanden
            </div>
          </v-card-text>
        </v-card>

        <!-- Actions -->
        <div class="d-flex justify-end gap-4">
          <v-btn variant="outlined" @click="router.push('/zones')"> Abbrechen </v-btn>
          <v-btn
            color="primary"
            type="submit"
            :loading="loading"
            :disabled="!mqttStore.value.isConnected"
          >
            {{ isEdit ? 'Speichern' : 'Erstellen' }}
          </v-btn>
        </div>
      </v-form>
    </div>
  </div>
</template>

<style scoped>
.zone-form {
  min-height: calc(100vh - 4rem);
  background-color: rgb(249, 250, 251);
}

.gap-4 {
  gap: 1rem;
}
</style>
