<template>
  <div class="zone-assignment-panel">
    <v-card class="card">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-map-marker-radius</v-icon>
        Zone Assignment
        <v-spacer />
        <v-chip
          :color="currentZoneId ? 'success' : 'warning'"
          size="small"
          variant="flat"
        >
          {{ currentZoneId ? 'Assigned' : 'Unassigned' }}
        </v-chip>
      </v-card-title>

      <v-card-text>
        <!-- Current Zone Info -->
        <div v-if="currentZoneId" class="current-zone mb-4">
          <v-alert type="info" variant="tonal" density="compact">
            <div class="d-flex flex-column">
              <span class="text-subtitle-2">Current Zone</span>
              <span class="text-h6">{{ currentZoneName || currentZoneId }}</span>
              <span class="text-caption text-medium-emphasis" v-if="currentMasterZoneId">
                Master: {{ currentMasterZoneId }}
              </span>
              <span class="text-caption text-medium-emphasis" v-if="pendingAssignment">
                Waiting for ESP confirmation...
              </span>
            </div>
          </v-alert>
        </div>

        <!-- Assignment Form -->
        <v-form ref="formRef" v-model="formValid" @submit.prevent="assignZone">
          <v-text-field
            v-model="form.zone_id"
            label="Zone ID"
            placeholder="e.g., greenhouse_zone_1"
            :rules="[rules.required, rules.zoneIdFormat]"
            variant="outlined"
            density="comfortable"
            hint="Unique identifier for this zone"
            persistent-hint
            class="mb-3"
          />

          <v-text-field
            v-model="form.master_zone_id"
            label="Master Zone ID (optional)"
            placeholder="e.g., greenhouse_master"
            variant="outlined"
            density="comfortable"
            hint="Parent zone for hierarchy"
            persistent-hint
            class="mb-3"
          />

          <v-text-field
            v-model="form.zone_name"
            label="Zone Name (optional)"
            placeholder="e.g., Greenhouse Section 1"
            :rules="[rules.maxLength(100)]"
            variant="outlined"
            density="comfortable"
            hint="Human-readable name"
            persistent-hint
            class="mb-3"
          />
        </v-form>

        <!-- ACK Status -->
        <div v-if="ackStatus" class="ack-feedback mb-3">
          <v-alert
            :type="ackStatus === 'success' ? 'success' : ackStatus === 'error' ? 'error' : 'info'"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            <div class="d-flex align-center">
              <v-icon v-if="ackStatus === 'success'" class="mr-2">mdi-check-circle</v-icon>
              <v-icon v-else-if="ackStatus === 'error'" class="mr-2">mdi-alert-circle</v-icon>
              <v-icon v-else class="mr-2">mdi-clock-outline</v-icon>
              <span>
                {{ ackStatus === 'pending' ? 'Waiting for ESP confirmation...' :
                   ackStatus === 'success' ? 'Zone assignment confirmed by ESP' :
                   `Zone assignment failed: ${ackMessage || 'Unknown error'}` }}
              </span>
            </div>
          </v-alert>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-btn
          v-if="currentZoneId"
          color="error"
          variant="text"
          :loading="removing"
          :disabled="assigning"
          @click="removeZone"
        >
          <v-icon class="mr-1">mdi-map-marker-off</v-icon>
          Remove Zone
        </v-btn>

        <v-spacer />

        <v-btn
          color="primary"
          variant="flat"
          :loading="assigning"
          :disabled="!formValid || removing"
          @click="assignZone"
        >
          <v-icon class="mr-1">mdi-map-marker-check</v-icon>
          {{ currentZoneId ? 'Update Zone' : 'Assign Zone' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue'
import { zonesApi } from '@/api/zones'
import { useRealTimeData } from '@/composables/useRealTimeData'

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
}>()

// Form state
const formRef = ref()
const formValid = ref(false)
const form = reactive({
  zone_id: props.currentZoneId || '',
  master_zone_id: props.currentMasterZoneId || '',
  zone_name: props.currentZoneName || ''
})

// Loading states
const assigning = ref(false)
const removing = ref(false)

// ACK status
const ackStatus = ref<'pending' | 'success' | 'error' | null>(null)
const ackMessage = ref<string>('')

// Validation rules
const rules = {
  required: (v: string) => !!v || 'Required',
  zoneIdFormat: (v: string) => /^[a-z0-9_]+$/.test(v) || 'Only lowercase letters, numbers, underscores',
  maxLength: (max: number) => (v: string) => v.length <= max || `Max ${max} characters`
}

// Real-time data for zone updates
const { onZoneUpdate, lastZoneUpdate } = useRealTimeData({
  espId: props.espId,
  autoConnect: true
})

// Handle zone assignment confirmations
function handleZoneUpdate(update: any) {
  if (update.esp_id === props.espId) {
    if (update.status === 'zone_assigned') {
      ackStatus.value = 'success'
      ackMessage.value = ''
      emit('zone-updated', {
        zone_id: update.zone_id,
        zone_name: form.zone_name,
        master_zone_id: update.master_zone_id
      })
    } else if (update.status === 'error') {
      ackStatus.value = 'error'
      ackMessage.value = update.message || 'Unknown error'
    }
  }
}

onMounted(() => {
  onZoneUpdate(handleZoneUpdate)
})

onUnmounted(() => {
  // Cleanup handled by useRealTimeData
})

async function assignZone() {
  if (!formRef.value?.validate()) return

  assigning.value = true
  ackStatus.value = 'pending'
  ackMessage.value = ''

  try {
    const result = await zonesApi.assignZone(props.espId, {
      zone_id: form.zone_id,
      master_zone_id: form.master_zone_id || undefined,
      zone_name: form.zone_name || undefined
    })

    if (result.success) {
      // Success - wait for WebSocket confirmation
      console.log('Zone assignment sent, waiting for ESP confirmation...')
    } else {
      throw new Error(result.message || 'Failed to send zone assignment')
    }
  } catch (error: any) {
    console.error('Zone assignment error:', error)
    ackStatus.value = 'error'
    ackMessage.value = error.message || 'Failed to assign zone'
  } finally {
    assigning.value = false
  }
}

async function removeZone() {
  removing.value = true
  ackStatus.value = 'pending'
  ackMessage.value = ''

  try {
    const result = await zonesApi.removeZone(props.espId)

    if (result.success) {
      // Clear form on successful removal request
      form.zone_id = ''
      form.master_zone_id = ''
      form.zone_name = ''
      console.log('Zone removal sent, waiting for ESP confirmation...')
    } else {
      throw new Error(result.message || 'Failed to remove zone')
    }
  } catch (error: any) {
    console.error('Zone removal error:', error)
    ackStatus.value = 'error'
    ackMessage.value = error.message || 'Failed to remove zone'
  } finally {
    removing.value = false
  }
}

// Update form when props change
watch(() => props.currentZoneId, (newZoneId) => {
  form.zone_id = newZoneId || ''
})

watch(() => props.currentZoneName, (newZoneName) => {
  form.zone_name = newZoneName || ''
})

watch(() => props.currentMasterZoneId, (newMasterZoneId) => {
  form.master_zone_id = newMasterZoneId || ''
})
</script>

<style scoped>
.zone-assignment-panel {
  margin-bottom: 16px;
}

.current-zone .v-alert {
  border-radius: 8px;
}

.ack-feedback .v-alert {
  border-radius: 8px;
}

.v-card-actions {
  padding: 16px;
}
</style>



