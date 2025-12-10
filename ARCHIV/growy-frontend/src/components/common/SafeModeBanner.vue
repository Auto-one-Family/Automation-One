<template>
  <v-alert
    v-if="showSafeModeBanner"
    type="warning"
    variant="tonal"
    density="compact"
    class="mb-4"
    icon="mdi-shield-alert"
  >
    <div class="d-flex align-center justify-space-between">
      <div>
        <strong>Safe Mode aktiviert</strong>
        <div class="text-caption">
          Grund: {{ safeModeReason }} | Aktiv seit:
          {{ formatUnixTimestamp(safeModeTimestamp, 'relative') }}
        </div>
      </div>
      <v-btn
        size="small"
        color="warning"
        variant="tonal"
        @click="disableSafeMode"
        :loading="disabling"
      >
        Safe Mode deaktivieren
      </v-btn>
    </div>
  </v-alert>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatUnixTimestamp } from '@/utils/time'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const disabling = ref(false)

const showSafeModeBanner = computed(() => {
  return (
    mqttStore.value.espDevices.size > 0 &&
    Array.from(mqttStore.value.espDevices.values()).some((device) => device.safeMode)
  )
})

const safeModeReason = computed(() => {
  const device = Array.from(mqttStore.value.espDevices.values()).find((d) => d.safeMode)
  return device?.safeModeEnterReason || 'Unbekannt'
})

const safeModeTimestamp = computed(() => {
  const device = Array.from(mqttStore.value.espDevices.values()).find((d) => d.safeMode)
  return device?.safeModeEnterTimestamp || Date.now()
})

async function disableSafeMode() {
  disabling.value = true
  try {
    for (const [espId, device] of mqttStore.value.espDevices.entries()) {
      if (device.safeMode) {
        await mqttStore.value.disableSafeMode(espId)
      }
    }
  } catch (error) {
    console.error('Failed to disable safe mode:', error)
  } finally {
    disabling.value = false
  }
}
</script>
