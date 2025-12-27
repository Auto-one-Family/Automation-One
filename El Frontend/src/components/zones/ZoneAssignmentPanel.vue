<template>
  <div class="zone-panel">
    <Card>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <MapPin class="w-5 h-5 text-dark-300" />
            <span class="font-medium">Zone</span>
          </div>
          <!-- Status Badge - show zone_name (human-readable) with zone_id as tooltip -->
          <Badge v-if="saving" variant="warning" size="sm" pulse>
            Speichern...
          </Badge>
          <Badge v-else-if="currentZoneName || currentZoneId" variant="success" size="sm" :title="currentZoneId ? `Zone-ID: ${currentZoneId}` : undefined">
            {{ currentZoneName || currentZoneId }}
          </Badge>
          <Badge v-else variant="gray" size="sm">
            Nicht zugewiesen
          </Badge>
        </div>
      </template>

      <!-- Error Message -->
      <div v-if="errorMessage" class="error-banner">
        <AlertCircle class="w-4 h-4 flex-shrink-0" />
        <span>{{ errorMessage }}</span>
        <button class="ml-auto" @click="errorMessage = ''">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Success Message -->
      <div v-if="successMessage" class="success-banner">
        <CheckCircle class="w-4 h-4 flex-shrink-0" />
        <span>{{ successMessage }}</span>
        <button class="ml-auto" @click="successMessage = ''">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Simple Zone Input -->
      <div class="space-y-3">
        <Input
          v-model="zoneInput"
          label="Zonenname"
          placeholder="z.B. Zelt 1, Gewächshaus, Outdoor"
          helper="Menschenfreundlicher Name. Die technische Zone-ID wird automatisch generiert."
          :disabled="saving"
        />

        <!-- Show generated zone_id preview -->
        <div v-if="zoneInput && generatedZoneId" class="text-xs" style="color: var(--color-text-muted)">
          Technische Zone-ID: <code class="font-mono bg-dark-800 px-1 rounded">{{ generatedZoneId }}</code>
        </div>

        <div class="flex gap-2">
          <Button
            v-if="(currentZoneName || currentZoneId) && zoneInput !== (currentZoneName || currentZoneId)"
            variant="secondary"
            size="sm"
            :disabled="saving"
            @click="zoneInput = currentZoneName || currentZoneId || ''"
          >
            Zurücksetzen
          </Button>

          <Button
            v-if="currentZoneId"
            variant="danger"
            size="sm"
            :loading="saving && isRemoving"
            :disabled="saving"
            @click="removeZone"
          >
            <X class="w-4 h-4 mr-1" />
            Entfernen
          </Button>

          <div class="flex-1"></div>

          <Button
            variant="primary"
            size="sm"
            :loading="saving && !isRemoving"
            :disabled="!zoneInput || !generatedZoneId || generatedZoneId === currentZoneId || saving"
            @click="saveZone"
          >
            <Check class="w-4 h-4 mr-1" />
            {{ currentZoneId ? 'Ändern' : 'Zuweisen' }}
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { MapPin, Check, X, AlertCircle, CheckCircle } from 'lucide-vue-next'
import Card from '@/components/common/Card.vue'
import Input from '@/components/common/Input.vue'
import Button from '@/components/common/Button.vue'
import Badge from '@/components/common/Badge.vue'
import { zonesApi } from '@/api/zones'

// Props
interface Props {
  espId: string
  currentZoneId?: string
  currentZoneName?: string
  currentMasterZoneId?: string
  isMock?: boolean  // Whether this is a Mock ESP (no server API call needed)
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'zone-updated', zoneData: { zone_id: string; zone_name?: string; master_zone_id?: string }): void
  (e: 'zone-error', error: string): void
}>()

// State - use zone_name for display (human-readable), zone_id is technical
const zoneInput = ref(props.currentZoneName || props.currentZoneId || '')
const saving = ref(false)
const isRemoving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

/**
 * Generate technical zone_id from human-readable zone_name
 * Mirrors server-side logic in debug.py and mock_esp_manager.py
 * "Zelt 1" -> "zelt_1", "Gewächshaus Nord" -> "gewaechshaus_nord"
 */
function generateZoneId(zoneName: string): string {
  if (!zoneName) return ''
  let zoneId = zoneName.toLowerCase()
  // Replace German umlauts
  zoneId = zoneId.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  // Replace spaces and special chars with underscores
  zoneId = zoneId.replace(/[^a-z0-9]+/g, '_')
  // Remove leading/trailing underscores
  zoneId = zoneId.replace(/^_+|_+$/g, '')
  return zoneId
}

// Computed zone_id from user input
const generatedZoneId = computed(() => generateZoneId(zoneInput.value))

// Watch for prop changes - prefer zone_name for input
watch([() => props.currentZoneName, () => props.currentZoneId], ([newName, newId]) => {
  if (!saving.value) {
    zoneInput.value = newName || newId || ''
  }
})

async function saveZone() {
  if (!zoneInput.value) return

  const zoneName = zoneInput.value
  const zoneId = generatedZoneId.value

  if (!zoneId) {
    errorMessage.value = 'Ungültiger Zonenname - bitte alphanumerische Zeichen verwenden'
    return
  }

  saving.value = true
  isRemoving.value = false
  errorMessage.value = ''
  successMessage.value = ''

  try {
    // Build request with generated zone_id and user-provided zone_name
    const request: { zone_id: string; zone_name?: string; master_zone_id?: string } = {
      zone_id: zoneId,        // Technical ID (lowercase, no spaces)
      zone_name: zoneName,     // Human-readable name
    }
    // Only add master_zone_id if it exists
    if (props.currentMasterZoneId) {
      request.master_zone_id = props.currentMasterZoneId
    }

    console.log('[ZoneAssignmentPanel] Sending request:', request)
    const response = await zonesApi.assignZone(props.espId, request)

    console.log('[ZoneAssignmentPanel] API response:', response)

    if (response.success) {
      // Server has updated the zone - emit success
      // Note: The server updates the database directly, and MQTT is sent to ESP
      // ESP will confirm via heartbeat - we don't need to wait for ACK here
      successMessage.value = response.mqtt_sent
        ? `Zone "${zoneName}" zugewiesen (MQTT gesendet)`
        : `Zone "${zoneName}" in Datenbank gespeichert`

      emit('zone-updated', {
        zone_id: zoneId,
        zone_name: zoneName,
        master_zone_id: props.currentMasterZoneId
      })

      // Clear success message after 3 seconds
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    } else {
      errorMessage.value = response.message || 'Zone-Zuweisung fehlgeschlagen'
      emit('zone-error', errorMessage.value)
    }
  } catch (error: unknown) {
    console.error('[ZoneAssignmentPanel] API error:', error)
    const axiosError = error as { response?: { data?: { detail?: string } } }
    const message = axiosError.response?.data?.detail
      || (error instanceof Error ? error.message : 'Unbekannter Fehler')
    errorMessage.value = `Fehler: ${message}`
    emit('zone-error', errorMessage.value)
  } finally {
    saving.value = false
  }
}

async function removeZone() {
  saving.value = true
  isRemoving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    // Call the Zone API to remove assignment
    const response = await zonesApi.removeZone(props.espId)

    console.log('[ZoneAssignmentPanel] Remove response:', response)

    if (response.success) {
      // Server has removed the zone
      successMessage.value = 'Zone-Zuweisung entfernt'
      zoneInput.value = ''

      emit('zone-updated', {
        zone_id: '',
        zone_name: undefined,
        master_zone_id: undefined
      })

      // Clear success message after 3 seconds
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    } else {
      errorMessage.value = response.message || 'Zone-Entfernung fehlgeschlagen'
      emit('zone-error', errorMessage.value)
    }
  } catch (error: unknown) {
    console.error('[ZoneAssignmentPanel] Remove error:', error)
    const axiosError = error as { response?: { data?: { detail?: string } } }
    const message = axiosError.response?.data?.detail
      || (error instanceof Error ? error.message : 'Unbekannter Fehler')
    errorMessage.value = `Fehler: ${message}`
    emit('zone-error', errorMessage.value)
  } finally {
    saving.value = false
    isRemoving.value = false
  }
}
</script>

<style scoped>
.zone-panel {
  margin-bottom: 16px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.5rem;
  color: var(--color-error, #ef4444);
  font-size: 0.875rem;
}

.success-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 0.5rem;
  color: var(--color-success, #22c55e);
  font-size: 0.875rem;
}
</style>






