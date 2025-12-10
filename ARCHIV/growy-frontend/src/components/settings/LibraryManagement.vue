<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-package-variant" class="mr-2" />
      Python Library Management
      <!-- ✅ NEU: ESP-ID-Anzeige -->
      <v-chip v-if="hasValidEspId" color="primary" size="small" variant="tonal" class="ml-2">
        ESP: {{ safeEspId }}
      </v-chip>
    </v-card-title>
    <v-card-text>
      <!-- ✅ NEU: Warnung bei fehlender ESP-ID -->
      <v-alert v-if="!hasValidEspId" type="warning" variant="tonal" density="compact" class="mb-4">
        <template v-slot:prepend>
          <v-icon icon="mdi-alert" />
        </template>
        Kein ESP-Gerät ausgewählt. Wählen Sie ein ESP-Gerät aus, um Libraries zu verwalten.
      </v-alert>

      <!-- Install New Library -->
      <v-expansion-panels v-if="hasValidEspId" class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon icon="mdi-plus" class="mr-2" />
            Neue Library installieren
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-form @submit.prevent="installLibrary">
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="newLibrary.name"
                    label="Library Name"
                    placeholder="my_sensor_library"
                    hint="Name der Python Library"
                    persistent-hint
                    variant="outlined"
                    density="comfortable"
                    required
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="newLibrary.version"
                    label="Version"
                    placeholder="1.0.0"
                    hint="Version der Library"
                    persistent-hint
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
                <v-col cols="12">
                  <v-textarea
                    v-model="newLibrary.code"
                    label="Python Code"
                    placeholder="# Python Library Code&#10;class MySensor:&#10;    def __init__(self):&#10;        pass&#10;    def read(self):&#10;        return 0.0"
                    hint="Python Code der Library"
                    persistent-hint
                    variant="outlined"
                    density="comfortable"
                    rows="8"
                    required
                  />
                </v-col>
                <v-col cols="12">
                  <v-btn
                    type="submit"
                    color="primary"
                    :loading="piIntegration.loading"
                    variant="tonal"
                    block
                  >
                    Library installieren
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Installed Libraries -->
      <div class="mb-4">
        <h3 class="text-subtitle-1 font-weight-medium mb-3">
          Installierte Libraries ({{ piIntegration.getInstalledLibraries.length }})
        </h3>

        <v-alert
          v-if="piIntegration.getInstalledLibraries.length === 0"
          type="info"
          variant="tonal"
        >
          <template v-slot:prepend>
            <v-icon icon="mdi-information" />
          </template>
          Keine Libraries installiert. Installieren Sie eine Library, um Pi-Enhanced Features zu
          nutzen.
        </v-alert>

        <v-list v-else>
          <v-list-item
            v-for="library in piIntegration.getInstalledLibraries"
            :key="library.name"
            class="mb-2"
          >
            <template v-slot:prepend>
              <v-icon
                :icon="library.status === 'installed' ? 'mdi-check-circle' : 'mdi-clock'"
                :color="library.status === 'installed' ? 'success' : 'warning'"
              />
            </template>

            <v-list-item-title>{{ library.name }}</v-list-item-title>
            <v-list-item-subtitle>
              Version {{ library.version }} •
              {{ library.status === 'installed' ? 'Installiert' : 'Installiere...' }} •
              {{ formatRelativeTime(library.installedAt) }}
            </v-list-item-subtitle>

            <template v-slot:append>
              <v-btn
                icon="mdi-delete"
                variant="text"
                size="small"
                color="error"
                @click="removeLibrary(library.name)"
                :loading="piIntegration.loading"
              />
            </template>
          </v-list-item>
        </v-list>
      </div>

      <!-- Library Cache -->
      <div v-if="piIntegration.getLibraryCache.size > 0">
        <h3 class="text-subtitle-1 font-weight-medium mb-3">
          Library Cache ({{ piIntegration.getLibraryCache.size }})
        </h3>
        <v-list>
          <v-list-item
            v-for="[name, data] in piIntegration.getLibraryCache"
            :key="name"
            class="mb-2"
          >
            <template v-slot:prepend>
              <v-icon icon="mdi-cached" color="info" />
            </template>

            <v-list-item-title>{{ name }}</v-list-item-title>
            <v-list-item-subtitle>
              Version {{ data.version }} •
              {{ formatRelativeTime(data.timestamp) }}
            </v-list-item-subtitle>

            <template v-slot:append>
              <v-btn icon="mdi-eye" variant="text" size="small" @click="viewLibraryCode(name)" />
            </template>
          </v-list-item>
        </v-list>
      </div>

      <!-- Library Code Dialog -->
      <v-dialog v-model="showCodeDialog" max-width="800px">
        <v-card>
          <v-card-title> Library Code: {{ selectedLibrary?.name }} </v-card-title>
          <v-card-text>
            <v-textarea
              :model-value="selectedLibrary?.code || ''"
              readonly
              variant="outlined"
              rows="15"
              class="font-family-monospace"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" variant="tonal" @click="showCodeDialog = false">
              Schließen
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { usePiIntegrationStore } from '@/stores/piIntegration'
import { formatRelativeTime } from '@/utils/time'

const props = defineProps({
  espId: {
    type: String,
    // ✅ KORRIGIERT: Default-Wert für null-Fälle
    default: '',
  },
})

const piIntegration = usePiIntegrationStore()
const showCodeDialog = ref(false)
const selectedLibrary = ref(null)

// ✅ NEU: Computed property für sichere ESP-ID-Verwendung
const safeEspId = computed(() => {
  return props.espId || ''
})

// ✅ NEU: Computed property für ESP-ID-Validität
const hasValidEspId = computed(() => {
  return safeEspId.value && safeEspId.value.trim() !== ''
})

const newLibrary = ref({
  name: '',
  version: '1.0.0',
  code: '',
})

async function installLibrary() {
  // ✅ KORRIGIERT: ESP-ID-Validierung hinzugefügt
  if (!hasValidEspId.value) {
    window.$snackbar?.showError('Kein ESP-Gerät ausgewählt')
    return
  }

  if (!newLibrary.value.name || !newLibrary.value.code) {
    window.$snackbar?.showError('Library Name und Code sind erforderlich')
    return
  }

  try {
    await piIntegration.installLibrary(
      safeEspId.value,
      newLibrary.value.name,
      newLibrary.value.code,
      newLibrary.value.version,
    )

    // Reset form
    newLibrary.value = {
      name: '',
      version: '1.0.0',
      code: '',
    }

    window.$snackbar?.showSuccess('Library wird installiert...')
  } catch {
    window.$snackbar?.showError('Failed to install library')
  }
}

async function removeLibrary(libraryName) {
  try {
    await piIntegration.removeLibrary(libraryName)
    window.$snackbar?.showSuccess('Library entfernt')
  } catch {
    window.$snackbar?.showError('Failed to remove library')
  }
}

function viewLibraryCode(libraryName) {
  const libraryData = piIntegration.getLibraryCache.get(libraryName)
  if (libraryData) {
    selectedLibrary.value = {
      name: libraryName,
      code: libraryData.code,
      version: libraryData.version,
    }
    showCodeDialog.value = true
  }
}
</script>
