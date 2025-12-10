<template>
  <div class="god-configuration-panel">
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-brain" color="warning" class="mr-2" />
        God Pi Konfiguration
      </v-card-title>

      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.name"
              label="God Name"
              variant="outlined"
              density="comfortable"
              hint="Benutzerfreundlicher Name des God Pi"
              persistent-hint
              @input="(event) => updateGodName(event.target.value)"
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.id"
              label="God ID"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Automatisch generierte God ID"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.kaiserId"
              label="God Kaiser ID"
              variant="outlined"
              density="comfortable"
              readonly
              hint="God ID = Kaiser ID für God"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-switch
              v-model="configData.godAsKaiser"
              label="God als Kaiser"
              hint="God Pi fungiert als Kaiser-System"
              persistent-hint
              @change="(event) => updateGodAsKaiser(event.target.checked)"
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <v-alert type="info" variant="tonal" class="mt-4">
              <template #prepend>
                <v-icon icon="mdi-information" />
              </template>
              <div>
                <strong>God Pi als Kaiser:</strong> Der God Pi fungiert als zentraler Kaiser-System
                und verwaltet alle ESP-Geräte direkt.
                <br />
                <strong>God ID = Kaiser ID:</strong> Die God ID wird automatisch als Kaiser ID
                verwendet.
              </div>
            </v-alert>
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.kaiserCount"
              label="Kaiser Count"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Anzahl der Edge Controller"
              persistent-hint
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model="configData.espCount"
              label="ESP Count"
              variant="outlined"
              density="comfortable"
              readonly
              hint="Anzahl der Feldgeräte"
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
import { ref, watch, computed, nextTick } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { generateGodId, generateGodKaiserId } from '@/utils/deviceIdGenerator'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'
import { validateGodName } from '@/utils/validation'

// Props
const props = defineProps({
  godData: {
    type: Object,
    required: true,
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

// Reactive Data
const configData = ref({
  name: '',
  id: '',
  kaiserId: '',
  godAsKaiser: true,
  status: 'offline',
  kaiserCount: 0,
  espCount: 0,
})

const originalData = ref({})
const saving = ref(false)

// 🆕 NEU: Computed Properties
const hasChanges = computed(() => {
  return JSON.stringify(configData.value) !== JSON.stringify(originalData.value)
})

// Methods
const loadConfigData = () => {
  // ✅ KORRIGIERT: Nur laden wenn keine ungespeicherten Änderungen vorhanden
  if (!hasChanges.value || saving.value) {
    configData.value = {
      name: centralConfig.value.godName || '', // Store-Wert direkt verwenden, leerer String erlaubt
      id: centralConfig.value.getGodId || '',
      kaiserId: centralConfig.value.getGodKaiserId || '',
      godAsKaiser: centralConfig.value.isGodKaiser || false,
      status: props.godData.status || 'offline',
      kaiserCount: props.godData.kaiserCount || 0,
      espCount: props.godData.espCount || 0,
    }
    originalData.value = JSON.parse(JSON.stringify(configData.value))
  }
}

// ✅ KORRIGIERT: Automatische ID-Generierung mit leeren Namen
const updateGodName = (newName) => {
  if (newName && newName.trim()) {
    configData.value.id = generateGodId(newName)
    if (configData.value.godAsKaiser) {
      configData.value.kaiserId = generateGodKaiserId(newName)
    }
  } else {
    // Reset IDs wenn Name leer ist (erlaubt leere Namen für Reset-Funktionalität)
    configData.value.id = ''
    if (configData.value.godAsKaiser) {
      configData.value.kaiserId = ''
    }
  }
}

// ✅ KORRIGIERT: God-als-Kaiser-Update mit leeren Namen
const updateGodAsKaiser = (enabled) => {
  if (enabled && configData.value.name && configData.value.name.trim()) {
    configData.value.kaiserId = generateGodKaiserId(configData.value.name)
  } else {
    configData.value.kaiserId = '' // Kein Name gesetzt (erlaubt leere Namen)
  }
}

const handleSave = async () => {
  if (!hasChanges.value) return

  // Validierung hinzufügen
  const validation = validateGodName(configData.value.name)
  if (!validation.valid) {
    safeError(validation.error)
    return
  }

  console.log('[GodPanel] Saving God configuration:', configData.value)
  saving.value = true

  try {
    // God-Name setzen mit Validation - MindMap als Master markieren
    console.log('[GodPanel] Setting godName:', configData.value.name)
    const nameSetSuccess = centralConfig.value.setGodName(
      configData.value.name,
      true,
      'mindmap-god-panel',
    ) // fromMindMap = true, erlaubt leere Namen
    if (!nameSetSuccess) {
      throw new Error('Failed to set God name')
    }

    // God-als-Kaiser setzen - MindMap als Master markieren
    centralConfig.value.setGodAsKaiser(configData.value.godAsKaiser || false, true) // fromMindMap = true

    // Kurze Verzögerung um Store-Update zu ermöglichen
    await nextTick()

    // Werte vom Store zurücklesen für Konsistenz
    const updatedData = {
      ...configData.value,
      id: centralConfig.value.getGodId || '',
      kaiserId: centralConfig.value.getGodKaiserId || '',
    }

    console.log('[GodPanel] Updated config data:', updatedData)

    // Lokale Daten aktualisieren
    configData.value = updatedData
    originalData.value = JSON.parse(JSON.stringify(updatedData))

    // Events emittieren
    emit('update', updatedData)
    emit('save', updatedData)

    console.log('[GodPanel] God configuration saved successfully')
    safeSuccess('God Pi Konfiguration gespeichert')
  } catch (error) {
    console.error('[GodPanel] Failed to save God configuration:', error)
    safeError('Fehler beim Speichern der Konfiguration')
  } finally {
    saving.value = false
  }
}

const handleCancel = () => {
  // Reset to original data (erhält auch leere Namen)
  configData.value = JSON.parse(JSON.stringify(originalData.value))
  emit('cancel')
}

// ✅ KORRIGIERT: Watch für Store-Änderungen mit Race-Condition-Schutz
watch(
  () => [centralConfig.value.godName, centralConfig.value.godAsKaiser],
  (newValues, oldValues) => {
    // ✅ KORRIGIERT: Nur aktualisieren wenn keine Benutzereingabe vorhanden UND nicht beim Speichern
    if (JSON.stringify(newValues) !== JSON.stringify(oldValues)) {
      if (!hasChanges.value && !saving.value) {
        // ✅ KORRIGIERT: Prüfe ob Werte tatsächlich vom Store kommen (nicht von Benutzereingabe)
        const storeName = centralConfig.value.godName || ''
        const storeKaiser = centralConfig.value.godAsKaiser || false

        if (configData.value.name === storeName && configData.value.godAsKaiser === storeKaiser) {
          nextTick(() => {
            loadConfigData() // Nur wenn Store-Werte konsistent sind
          })
        }
      }
    }
  },
  { deep: true, flush: 'post' },
)

// ✅ KORRIGIERT: Watch for prop changes (erhält auch leere Namen)
watch(
  () => props.godData,
  () => {
    // ✅ KORRIGIERT: Race-Condition-Schutz für Prop-Changes
    if (saving.value) {
      console.log('[GodPanel] Skipping prop change during save operation')
      return
    }

    // ✅ KORRIGIERT: Nur laden wenn keine ungespeicherten Änderungen vorhanden
    if (!hasChanges.value) {
      loadConfigData() // Lädt auch leere Namen korrekt
    } else {
      console.log('[GodPanel] Skipping prop change - unsaved changes present')
    }
  },
  { immediate: true, deep: true },
)
</script>

<style scoped>
/* God Configuration Panel Styles */

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
