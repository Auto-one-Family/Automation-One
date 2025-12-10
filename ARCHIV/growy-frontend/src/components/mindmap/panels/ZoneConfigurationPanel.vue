<template>
  <div class="zone-configuration-panel">
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-map-marker" color="success" class="mr-2" />
        Zone Konfiguration
      </v-card-title>

      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.name"
              label="Zone Name"
              variant="outlined"
              density="comfortable"
              hint="Benutzerfreundlicher Name der Zone"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.kaiserId"
              label="Zugehöriger Kaiser"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Edge Controller für diese Zone"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.espCount"
              label="ESP Count"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Anzahl der Feldgeräte in dieser Zone"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.onlineCount"
              label="Online ESPs"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Anzahl der online Feldgeräte"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <v-textarea
              v-model="configData.description"
              label="Zone Beschreibung"
              variant="outlined"
              density="comfortable"
              hint="Optionale Beschreibung der Zone"
              persistent-hint
              rows="3"
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <v-chip :color="getZoneStatusColor()" variant="tonal" class="mr-2">
              <v-icon :icon="getZoneStatusIcon()" class="mr-1" />
              {{ getZoneStatusText() }}
            </v-chip>
          </v-col>
        </v-row>

        <!-- ESP-Liste -->
        <v-row v-if="espDevices.length > 0">
          <v-col cols="12">
            <v-card variant="outlined" class="mt-4">
              <v-card-title class="text-subtitle-1">
                Feldgeräte in dieser Zone ({{ espDevices.length }})
              </v-card-title>
              <v-card-text>
                <div class="esp-list">
                  <v-chip
                    v-for="esp in espDevices"
                    :key="esp"
                    :color="getEspStatusColor(esp)"
                    variant="tonal"
                    class="mr-2 mb-2"
                  >
                    <v-icon :icon="getEspStatusIcon(esp)" size="small" class="mr-1" />
                    {{ getEspFriendlyName(esp) }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- 🆕 NEU: Speichern/Abbrechen-Buttons -->
        <v-row v-if="showActions">
          <v-col cols="12">
            <v-divider class="my-4" />
            <div class="d-flex gap-2 justify-end">
              <v-btn
                color="error"
                variant="outlined"
                prepend-icon="mdi-close"
                @click="handleCancel"
                :disabled="saving"
              >
                Abbrechen
              </v-btn>
              <v-btn
                color="success"
                variant="elevated"
                prepend-icon="mdi-content-save"
                @click="handleSave"
                :loading="saving"
                :disabled="!hasChanges"
              >
                Speichern
              </v-btn>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'

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
  showActions: {
    type: Boolean,
    default: false,
  },
})

// Emits
const emit = defineEmits(['update', 'save', 'cancel'])

// Stores
const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive Data
const configData = ref({
  name: '',
  kaiserId: '',
  espCount: 0,
  onlineCount: 0,
  description: '',
})

const originalData = ref({})
const saving = ref(false)

// 🆕 NEU: Computed Properties
const hasChanges = computed(() => {
  return JSON.stringify(configData.value) !== JSON.stringify(originalData.value)
})

// Methods
const loadConfigData = () => {
  configData.value = {
    name: props.zoneName || '',
    kaiserId: props.kaiserId || '',
    espCount: props.espDevices.length || 0,
    onlineCount: getOnlineEspCount(),
    description: getZoneDescription(),
  }
  originalData.value = JSON.parse(JSON.stringify(configData.value))
}

const getOnlineEspCount = () => {
  return props.espDevices.filter((espId) => {
    const device = mqttStore.value.espDevices.get(espId)
    return device && device.status === 'online'
  }).length
}

const getZoneDescription = () => {
  // Hier könnte man eine Zone-Beschreibung aus dem Store laden
  return centralConfig.value.getZoneDescription?.(props.zoneName) || ''
}

const handleSave = async () => {
  if (!hasChanges.value) return

  saving.value = true
  try {
    // Speichere Zone-Konfiguration
    // Hier würde die Zone-Konfiguration gespeichert werden

    // Update original data
    originalData.value = JSON.parse(JSON.stringify(configData.value))

    // Emit events
    emit('update', configData.value)
    emit('save', configData.value)

    safeSuccess('Zone Konfiguration gespeichert')
  } catch (error) {
    console.error('Failed to save zone configuration:', error)
    safeError('Fehler beim Speichern der Konfiguration')
  } finally {
    saving.value = false
  }
}

const handleCancel = () => {
  // Reset to original data
  configData.value = JSON.parse(JSON.stringify(originalData.value))
  emit('cancel')
}

// 🆕 NEU: Helper Methods
const getZoneStatusColor = () => {
  if (props.zoneName === '🕳️ Unkonfiguriert') return 'grey'
  return 'success'
}

const getZoneStatusIcon = () => {
  if (props.zoneName === '🕳️ Unkonfiguriert') return 'mdi-alert-circle'
  return 'mdi-check-circle'
}

const getZoneStatusText = () => {
  if (props.zoneName === '🕳️ Unkonfiguriert') return 'Unkonfiguriert'
  return 'Aktiv'
}

const getEspStatusColor = (espId) => {
  const device = mqttStore.value.espDevices.get(espId)
  if (!device) return 'grey'

  if (device.status === 'online') return 'success'
  if (device.status === 'offline') return 'error'
  return 'warning'
}

const getEspStatusIcon = (espId) => {
  const device = mqttStore.value.espDevices.get(espId)
  if (!device) return 'mdi-help-circle'

  if (device.status === 'online') return 'mdi-wifi'
  if (device.status === 'offline') return 'mdi-wifi-off'
  return 'mdi-wifi-strength-2'
}

const getEspFriendlyName = (espId) => {
  const device = mqttStore.value.espDevices.get(espId)
  return device?.friendlyName || espId
}

// Watch for prop changes
watch(
  () => [props.zoneName, props.espDevices, props.kaiserId],
  () => {
    loadConfigData()
  },
  { immediate: true, deep: true },
)
</script>

<style scoped>
/* Zone Configuration Panel Styles */

.esp-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* 🆕 NEU: Button Styles */
.d-flex.gap-2 {
  gap: 0.5rem;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .d-flex.gap-2 {
    flex-direction: column;
  }

  .d-flex.gap-2 .v-btn {
    width: 100%;
  }
}
</style>
