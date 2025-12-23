<template>
  <div class="zone-panel">
    <Card>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <MapPin class="w-5 h-5 text-dark-300" />
            <span class="font-medium">Zone</span>
          </div>
          <!-- Status Badge -->
          <Badge v-if="saving" variant="warning" size="sm" pulse>
            Speichern...
          </Badge>
          <Badge v-else-if="currentZoneId" variant="success" size="sm">
            {{ currentZoneId }}
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
          label="Zone"
          placeholder="z.B. Zelt 1, Gewächshaus, Outdoor"
          helper="Name der Zone in der dieses Gerät arbeitet"
          :disabled="saving"
        />

        <div class="flex gap-2">
          <Button
            v-if="currentZoneId && zoneInput !== currentZoneId"
            variant="secondary"
            size="sm"
            :disabled="saving"
            @click="zoneInput = currentZoneId"
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
            :disabled="!zoneInput || zoneInput === currentZoneId || saving"
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
import { ref, watch } from 'vue'
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
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'zone-updated', zoneData: { zone_id: string; zone_name?: string; master_zone_id?: string }): void
  (e: 'zone-error', error: string): void
}>()

// State
const zoneInput = ref(props.currentZoneId || '')
const saving = ref(false)
const isRemoving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Watch for prop changes
watch(() => props.currentZoneId, (newVal) => {
  if (!saving.value) {
    zoneInput.value = newVal || ''
  }
})

async function saveZone() {
  if (!zoneInput.value) return

  saving.value = true
  isRemoving.value = false
  errorMessage.value = ''
  successMessage.value = ''

  try {
    // Call the Zone API - only send defined fields
    const request: { zone_id: string; zone_name?: string; master_zone_id?: string } = {
      zone_id: zoneInput.value,
      zone_name: zoneInput.value,
    }
    // Only add master_zone_id if it exists
    if (props.currentMasterZoneId) {
      request.master_zone_id = props.currentMasterZoneId
    }

    const response = await zonesApi.assignZone(props.espId, request)

    console.log('[ZoneAssignmentPanel] API response:', response)

    if (response.success) {
      // Server has updated the zone - emit success
      // Note: The server updates the database directly, and MQTT is sent to ESP
      // ESP will confirm via heartbeat - we don't need to wait for ACK here
      successMessage.value = response.mqtt_sent
        ? `Zone "${zoneInput.value}" zugewiesen (MQTT gesendet)`
        : `Zone "${zoneInput.value}" in Datenbank gespeichert`

      emit('zone-updated', {
        zone_id: zoneInput.value,
        zone_name: zoneInput.value,
        master_zone_id: undefined
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

