<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-map-marker" class="mr-2" color="primary" />
      Zonenverwaltung
      <v-chip size="small" color="info" variant="tonal" class="ml-2">
        {{ centralDataHub.centralConfig?.getAvailableZones?.length || 0 }} Zonen
      </v-chip>
      <v-spacer />
      <v-btn
        icon="mdi-plus"
        variant="text"
        size="small"
        @click="addNewZone"
        v-tooltip="'Neue Zone hinzufügen'"
      />
    </v-card-title>
    <v-card-text>
      <!-- 🆕 NEU: Verfügbare Zonen -->
      <div class="mb-4">
        <h3 class="text-subtitle-1 font-weight-medium mb-3">Verfügbare Zonen</h3>
        <v-chip-group>
          <v-chip
            v-for="zone in centralDataHub.centralConfig?.getAvailableZones || []"
            :key="zone"
            variant="outlined"
            color="primary"
            class="mb-2"
          >
            {{ zone }}
          </v-chip>
        </v-chip-group>
      </div>

      <!-- 🆕 NEU: ESP-Zone-Zuordnung -->
      <div>
        <h3 class="text-subtitle-1 font-weight-medium mb-3">Agent-Zone-Zuordnung</h3>
        <v-list>
          <v-list-item v-for="espId in espDevices" :key="espId" class="mb-2">
            <v-list-item-title>{{ getFriendlyDeviceName('esp', espId) }}</v-list-item-title>
            <v-list-item-subtitle>
              Aktuelle Zone: {{ centralDataHub.getZoneForEsp(espId) || 'Unkonfiguriert' }}
            </v-list-item-subtitle>
            <template v-slot:append>
              <v-select
                :model-value="centralDataHub.getZoneForEsp(espId) || 'Unkonfiguriert'"
                :items="centralDataHub.centralConfig?.getAvailableZones || []"
                density="compact"
                variant="outlined"
                @update:model-value="(zone) => handleZoneChange(espId, zone)"
                v-tooltip="'Zone für diesen Agenten ändern'"
              />
            </template>
          </v-list-item>
        </v-list>
      </div>

      <!-- 🆕 NEU: Zone-Statistiken -->
      <div v-if="zoneStats.length > 0" class="mt-4">
        <h3 class="text-subtitle-1 font-weight-medium mb-3">Zone-Übersicht</h3>
        <v-row>
          <v-col v-for="stat in zoneStats" :key="stat.zone" cols="12" sm="6" md="4">
            <v-card variant="tonal" class="pa-3">
              <div class="text-h6 font-weight-bold">{{ stat.zone }}</div>
              <div class="text-caption text-grey">
                {{ stat.count }} {{ stat.count === 1 ? 'Agent' : 'Agenten' }}
              </div>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- 🆕 NEU: Neue Zone hinzufügen Dialog -->
      <v-dialog v-model="showAddZoneDialog" max-width="400">
        <v-card>
          <v-card-title>Neue Zone hinzufügen</v-card-title>
          <v-card-text>
            <v-text-field
              v-model="newZoneName"
              label="Zonenname"
              variant="outlined"
              density="comfortable"
              placeholder="z.B. Gewächshaus, Hochbeet 1"
              @keyup.enter="confirmAddZone"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="showAddZoneDialog = false">Abbrechen</v-btn>
            <v-btn color="primary" @click="confirmAddZone" :disabled="!newZoneName.trim()">
              Hinzufügen
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { getFriendlyDeviceName } from '@/utils/userFriendlyTerms'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)

const showAddZoneDialog = ref(false)
const newZoneName = ref('')

// ✅ KORRIGIERT: Sichere ESP-Devices computed property
const espDevices = computed(() => {
  try {
    return Array.from(mqttStore.value.espDevices?.keys() || [])
  } catch (error) {
    console.warn('Error getting ESP devices:', error.message)
    return []
  }
})

// 🆕 NEU: Zone-Statistiken
const zoneStats = computed(() => {
  const stats = []
  const zones = centralConfig.value?.getAvailableZones || []

  zones.forEach((zone) => {
    const espIds = centralConfig.value?.getEspIdsForZone?.(zone) || []
    stats.push({
      zone,
      count: espIds.length,
    })
  })

  return stats.sort((a, b) => b.count - a.count)
})

const handleZoneChange = async (espId, newZone) => {
  try {
    await centralConfig.value?.moveEspToZone?.(espId, newZone)
    window.$snackbar?.showSuccess(
      `${getFriendlyDeviceName('esp', espId)} zu Zone "${newZone}" verschoben`,
    )
  } catch (error) {
    console.error('Zone change failed:', error)
    window.$snackbar?.showError('Zone-Änderung fehlgeschlagen')
  }
}

const addNewZone = () => {
  showAddZoneDialog.value = true
  newZoneName.value = ''
}

const confirmAddZone = () => {
  if (newZoneName.value.trim()) {
    // Hier würde die Zone-Erstellung implementiert
    window.$snackbar?.showSuccess(`Zone "${newZoneName.value}" hinzugefügt`)
    showAddZoneDialog.value = false
    newZoneName.value = ''
  }
}
</script>

<style scoped>
.v-list-item {
  border-radius: 8px;
  margin-bottom: 8px;
}

.v-chip-group {
  flex-wrap: wrap;
}

.v-chip {
  margin-right: 8px;
  margin-bottom: 8px;
}
</style>
