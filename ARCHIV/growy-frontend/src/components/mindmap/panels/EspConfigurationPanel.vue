<template>
  <div class="esp-configuration-panel">
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-memory" color="success" class="mr-2" />
        ESP Konfiguration
      </v-card-title>

      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.id"
              label="ESP ID"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Eindeutige ID des ESP-Geräts"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.name"
              label="ESP Name"
              variant="outlined"
              density="comfortable"
              hint="Benutzerfreundlicher Name des ESP-Geräts"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="configData.zoneName"
              :items="availableZones"
              label="Zone"
              variant="outlined"
              density="comfortable"
              hint="Zone für diesen ESP auswählen"
              persistent-hint
              @update:model-value="moveEspToZone"
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.kaiserId"
              label="Zugeordneter Kaiser"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Edge Controller für diesen ESP"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-chip :color="getHealthColor()" variant="tonal" class="mr-2">
              <v-icon :icon="getHealthIcon()" class="mr-1" />
              {{ getHealthLabel() }}
            </v-chip>
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.lastSeen"
              label="Letztes Signal"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Zeitpunkt des letzten Signals"
              persistent-hint
            />
          </v-col>
        </v-row>

        <!-- ESP-Details -->
        <v-row v-if="espDevice">
          <v-col cols="12">
            <v-card variant="outlined" class="mt-4">
              <v-card-title class="text-subtitle-1"> ESP-Details </v-card-title>
              <v-card-text>
                <v-row>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="espDevice.ip"
                      label="IP-Adresse"
                      variant="outlined"
                      density="comfortable"
                      readonly
                    />
                  </v-col>

                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="espDevice.mac"
                      label="MAC-Adresse"
                      variant="outlined"
                      density="comfortable"
                      readonly
                    />
                  </v-col>
                </v-row>

                <v-row>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="espDevice.firmware"
                      label="Firmware Version"
                      variant="outlined"
                      density="comfortable"
                      readonly
                    />
                  </v-col>

                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="espDevice.uptime"
                      label="Uptime"
                      variant="outlined"
                      density="comfortable"
                      readonly
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- 🆕 NEU: ESP-Aktionen -->
        <v-row v-if="showActions">
          <v-col cols="12">
            <v-card variant="outlined" class="mt-4">
              <v-card-title class="text-subtitle-1">ESP-Aktionen</v-card-title>
              <v-card-text>
                <v-row>
                  <v-col cols="12" md="4">
                    <v-btn
                      color="primary"
                      variant="outlined"
                      prepend-icon="mdi-refresh"
                      @click="restartEsp"
                      block
                    >
                      Neustart
                    </v-btn>
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-btn
                      color="warning"
                      variant="outlined"
                      prepend-icon="mdi-update"
                      @click="startOTA"
                      block
                    >
                      OTA Update
                    </v-btn>
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-btn
                      color="info"
                      variant="outlined"
                      prepend-icon="mdi-tune"
                      @click="() => {}"
                      block
                    >
                      Erweiterte Einstellungen
                    </v-btn>
                  </v-col>
                </v-row>
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
import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'

// Props
const props = defineProps({
  esp: {
    type: [String, Object],
    required: true,
  },
  zoneName: {
    type: String,
    default: null,
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
const emit = defineEmits(['update', 'move', 'save', 'cancel'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)

// Computed Properties
const espDevice = computed(() => {
  if (typeof props.esp === 'string') {
    return mqttStore.value.espDevices.get(props.esp) || { id: props.esp, name: props.esp }
  }
  return props.esp
})

const availableZones = computed(() => {
  return centralConfig.value.zones?.available || ['🕳️ Unkonfiguriert']
})

// Reactive Data
const configData = ref({
  id: espDevice.value.id || espDevice.value.espId || props.esp,
  name: espDevice.value.espFriendlyName || espDevice.value.espUsername || props.esp,
  zoneName: props.zoneName || '🕳️ Unkonfiguriert',
  kaiserId: props.kaiserId || 'god_pi_central',
  status: espDevice.value.status || 'offline',
  lastSeen: espDevice.value.lastHeartbeat
    ? new Date(espDevice.value.lastHeartbeat).toLocaleString()
    : 'Nie',
})

const originalData = ref(JSON.parse(JSON.stringify(configData.value)))
const saving = ref(false)

// Computed Properties
const hasChanges = computed(() => {
  return JSON.stringify(configData.value) !== JSON.stringify(originalData.value)
})

// 🆕 NEU: Echte ESP-Management-Funktionen
const saveEspName = async () => {
  try {
    const device = mqttStore.value.espDevices.get(configData.value.id)
    if (device) {
      device.espFriendlyName = configData.value.name
      mqttStore.value.espDevices.set(configData.value.id, device)
      safeSuccess('ESP-Name gespeichert')
    }
  } catch (error) {
    console.error('Failed to save ESP name:', error)
    safeError('Fehler beim Speichern des ESP-Namens')
  }
}

const moveEspToZone = async (newZone) => {
  try {
    const oldZone = centralConfig.value.getZoneForEsp(configData.value.id)
    await centralConfig.value.moveEspToZone(configData.value.id, newZone, oldZone)
    configData.value.zoneName = newZone
    safeSuccess(`ESP zu Zone "${newZone}" verschoben`)
    emit('move', configData.value.id, newZone)
  } catch (error) {
    console.error('Failed to move ESP to zone:', error)
    safeError('Fehler beim Verschieben des ESP')
  }
}

const restartEsp = async () => {
  try {
    await mqttStore.value.sendSystemCommand(configData.value.id, 'restart')
    safeSuccess('ESP-Neustart initiiert')
  } catch (error) {
    console.error('Failed to restart ESP:', error)
    safeError('Fehler beim Neustart des ESP')
  }
}

const startOTA = async () => {
  try {
    await mqttStore.value.sendSystemCommand(configData.value.id, 'ota_update')
    safeSuccess('OTA Update für ESP gestartet')
  } catch (error) {
    console.error('Failed to start OTA update:', error)
    safeError('Fehler beim Starten des OTA Updates')
  }
}

// Methods
const getHealthColor = () => {
  const status = configData.value.status
  switch (status) {
    case 'online':
      return 'success'
    case 'offline':
      return 'error'
    default:
      return 'grey'
  }
}

const getHealthIcon = () => {
  const status = configData.value.status
  switch (status) {
    case 'online':
      return 'mdi-wifi'
    case 'offline':
      return 'mdi-wifi-off'
    default:
      return 'mdi-help'
  }
}

const getHealthLabel = () => {
  const status = configData.value.status
  switch (status) {
    case 'online':
      return 'Online'
    case 'offline':
      return 'Offline'
    default:
      return 'Unbekannt'
  }
}

// ✅ NEU: Save/Cancel Handler für Panel-Integration
const handleSave = async () => {
  if (!hasChanges.value) return

  saving.value = true
  try {
    // ESP-Name speichern
    await saveEspName()

    // Zone-Änderung speichern falls geändert
    if (configData.value.zoneName !== originalData.value.zoneName) {
      await moveEspToZone(configData.value.zoneName)
    }

    // Original-Daten aktualisieren
    originalData.value = JSON.parse(JSON.stringify(configData.value))

    // Events emittieren
    emit('update', configData.value)
    emit('save', configData.value)

    console.log('[EspPanel] ESP configuration saved successfully')
    safeSuccess('ESP Konfiguration gespeichert')
  } catch (error) {
    console.error('[EspPanel] Failed to save ESP configuration:', error)
    safeError('Fehler beim Speichern der ESP Konfiguration')
  } finally {
    saving.value = false
  }
}

const handleCancel = () => {
  // Reset to original data
  configData.value = JSON.parse(JSON.stringify(originalData.value))
  emit('cancel')
}

// Watch für Änderungen
watch(
  () => configData.value.name,
  (newName) => {
    if (newName !== espDevice.value.espFriendlyName) {
      saveEspName()
    }
  },
)

// Watch für Props-Änderungen
watch(
  () => espDevice.value,
  (newDevice) => {
    configData.value = {
      id: newDevice.id || newDevice.espId || props.esp,
      name: newDevice.espFriendlyName || newDevice.espUsername || props.esp,
      zoneName: props.zoneName || '🕳️ Unkonfiguriert',
      kaiserId: props.kaiserId || 'god_pi_central',
      status: newDevice.status || 'offline',
      lastSeen: newDevice.lastHeartbeat
        ? new Date(newDevice.lastHeartbeat).toLocaleString()
        : 'Nie',
    }
  },
  { deep: true },
)
</script>

<style scoped>
.esp-configuration-panel {
  width: 100%;
}

.esp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
