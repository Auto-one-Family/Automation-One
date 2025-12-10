<template>
  <div class="kaiser-configuration-panel">
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-crown" color="primary" class="mr-2" />
        Kaiser Konfiguration
      </v-card-title>

      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.name"
              label="Kaiser Name"
              variant="outlined"
              density="comfortable"
              hint="Benutzerfreundlicher Name des Edge Controllers"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.kaiserId"
              label="Kaiser ID"
              variant="outlined"
              density="comfortable"
              hint="Eindeutige technische Identifikation"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.esp_count"
              label="ESP Count"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Anzahl der verwalteten Feldgeräte"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.type"
              label="Kaiser Type"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Typ des Edge Controllers"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.pi0ServerIp"
              label="Pi0 Server IP"
              variant="outlined"
              density="comfortable"
              hint="IP-Adresse des Pi0-Servers"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.pi0ServerPort"
              label="Pi0 Server Port"
              variant="outlined"
              density="comfortable"
              hint="Port des Pi0-Servers"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.godConnectionIp"
              label="God Connection IP"
              variant="outlined"
              density="comfortable"
              hint="IP-Adresse der God-Verbindung"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.godConnectionPort"
              label="God Connection Port"
              variant="outlined"
              density="comfortable"
              hint="Port der God-Verbindung"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <v-chip
              :color="configData.status === 'online' ? 'success' : 'error'"
              variant="tonal"
              class="mr-2"
            >
              <v-icon
                :icon="configData.status === 'online' ? 'mdi-wifi' : 'mdi-wifi-off'"
                class="mr-1"
              />
              {{ configData.status }}
            </v-chip>
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRemoteKaiserStore } from '@/stores/remoteKaiser'
import { validateKaiserName } from '@/utils/validation'
import { safeError, safeSuccess } from '@/utils/snackbarUtils'

const props = defineProps({
  kaiser: {
    type: Object,
    required: true,
  },
  espDevices: {
    type: Array,
    default: () => [],
  },
  showActions: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update', 'save', 'cancel'])

// Remote Kaiser Store verwenden
const remoteKaiserStore = useRemoteKaiserStore()

// Lokale UI State
const saving = ref(false)

// Kaiser-Daten für UI
const configData = ref({
  kaiserId: props.kaiser.kaiserId || '',
  name: props.kaiser.name || '',
  pi0ServerIp: props.kaiser.pi0ServerIp || '192.168.1.100',
  pi0ServerPort: props.kaiser.pi0ServerPort || 8080,
  godConnectionIp: props.kaiser.godConnectionIp || '192.168.1.200',
  godConnectionPort: props.kaiser.godConnectionPort || 8443,
})

// Original Daten für Change Detection
const originalData = ref(JSON.parse(JSON.stringify(configData.value)))

// Computed Properties
const hasChanges = computed(() => {
  return JSON.stringify(configData.value) !== JSON.stringify(originalData.value)
})

const selectedKaiser = computed(() => {
  return remoteKaiserStore.selectedKaiser
})

// Validierung
const validateAndSave = async () => {
  // Kaiser-Name Validierung
  const nameValidation = validateKaiserName(configData.value.name)
  if (!nameValidation.valid) {
    safeError(nameValidation.error)
    return false
  }

  // IP-Validierung (vereinfacht)
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!ipPattern.test(configData.value.pi0ServerIp)) {
    safeError('Ungültige Pi0 Server IP-Adresse')
    return false
  }

  if (!ipPattern.test(configData.value.godConnectionIp)) {
    safeError('Ungültige God Connection IP-Adresse')
    return false
  }

  // Port-Validierung
  const isValidPort = (port) => port >= 1 && port <= 65535
  if (!isValidPort(configData.value.pi0ServerPort)) {
    safeError('Ungültiger Pi0 Server Port (1-65535)')
    return false
  }

  if (!isValidPort(configData.value.godConnectionPort)) {
    safeError('Ungültiger God Connection Port (1-65535)')
    return false
  }

  return true
}

// Save Handler
const handleSave = async () => {
  if (!hasChanges.value) return

  if (!(await validateAndSave())) return

  saving.value = true
  try {
    const kaiserId = configData.value.kaiserId

    // Remote Kaiser konfigurieren
    if (kaiserId && remoteKaiserStore.connectedKaisers.has(kaiserId)) {
      // Bestehenden Kaiser aktualisieren
      await remoteKaiserStore.setRemoteKaiserName(kaiserId, configData.value.name)
      await remoteKaiserStore.setRemoteKaiserNetwork(kaiserId, {
        pi0ServerIp: configData.value.pi0ServerIp,
        pi0ServerPort: configData.value.pi0ServerPort,
        godConnectionIp: configData.value.godConnectionIp,
        godConnectionPort: configData.value.godConnectionPort,
      })
    } else {
      // Neuen Kaiser hinzufügen
      const newKaiser = remoteKaiserStore.addRemoteKaiser(configData.value)
      configData.value.kaiserId = newKaiser.kaiserId
      remoteKaiserStore.selectKaiser(newKaiser.kaiserId)
    }

    originalData.value = JSON.parse(JSON.stringify(configData.value))
    emit('update', configData.value)
    emit('save', configData.value)
    safeSuccess('Kaiser-Konfiguration erfolgreich gespeichert')
  } catch (error) {
    console.error('Failed to save kaiser configuration:', error)
    safeError(`Fehler beim Speichern: ${error.message}`)
  } finally {
    saving.value = false
  }
}

// Cancel Handler
const handleCancel = () => {
  configData.value = JSON.parse(JSON.stringify(originalData.value))
  emit('cancel')
}

// Watch für Selected Kaiser
watch(
  selectedKaiser,
  (newKaiser) => {
    if (newKaiser) {
      configData.value = {
        kaiserId: newKaiser.kaiserId,
        name: newKaiser.name,
        pi0ServerIp: newKaiser.pi0ServerIp,
        pi0ServerPort: newKaiser.pi0ServerPort,
        godConnectionIp: newKaiser.godConnectionIp,
        godConnectionPort: newKaiser.godConnectionPort,
      }
      originalData.value = JSON.parse(JSON.stringify(configData.value))
    }
  },
  { immediate: true },
)

// Component Mount
onMounted(() => {
  // Wenn Kaiser-ID vorhanden, als Selected Kaiser setzen
  if (props.kaiser.kaiserId) {
    remoteKaiserStore.selectKaiser(props.kaiser.kaiserId)
  }
})
</script>

<style scoped>
/* Kaiser Configuration Panel Styles */

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
