<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import ZoneSection from '@/components/grid/ZoneSection.vue'
import OrbitalView from '@/components/orbital/OrbitalView.vue'
import ConfigWizardModal from '@/components/wizard/ConfigWizardModal.vue'
import { phytaWebSocket } from '@/services/websocket'
import { useEspStore } from '@/stores/espStore'

const espStore = useEspStore()
const centeredEspId = ref<string | null>(null)
const originRect = ref<DOMRect | null>(null)
const wizardOpen = ref(false)
const wizardPayload = ref<{ kind: 'sensor' | 'actuator'; type: string; espId: string } | null>(null)

onMounted(async () => {
  try {
    await espStore.fetchAll()
    phytaWebSocket.connect()
  } catch {
    /* error state in template */
  }
})

onUnmounted(() => {
  phytaWebSocket.disconnect()
})

function openOrbital(payload: { deviceId: string; originRect: DOMRect }): void {
  centeredEspId.value = payload.deviceId
  originRect.value = payload.originRect
}

function closeOrbital(): void {
  centeredEspId.value = null
  originRect.value = null
}

function zoneLabel(zoneId: string): string {
  const first = espStore.devicesByZone.get(zoneId)?.[0]
  return first?.zone_name || zoneId
}

function handleWizardDrop(p: { kind: 'sensor' | 'actuator'; type: string; espId: string }): void {
  wizardPayload.value = p
  wizardOpen.value = true
}

</script>

<template>
  <div class="hardware-grid min-h-screen p-6">
    <header class="mb-8">
      <h1 class="text-2xl font-semibold tracking-tight">Phyta Hardware</h1>
      <p class="mt-1 text-sm text-dark-400">
        Live-Backend · Heartbeat 70s/120s
      </p>
    </header>

    <div
      v-if="espStore.isLoading"
      class="text-dark-400"
      role="status"
    >
      Geräte werden geladen…
    </div>

    <div
      v-else-if="espStore.error"
      class="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger"
    >
      {{ espStore.error }}
    </div>

    <template v-else>
      <ZoneSection
        v-for="zoneId in espStore.zoneIds"
        :key="zoneId"
        :zone-id="zoneId"
        :zone-label="zoneLabel(zoneId)"
        :devices="espStore.devicesByZone.get(zoneId) ?? []"
        @open-device="openOrbital"
      />
      <p
        v-if="!espStore.devices.length"
        class="text-dark-400"
      >
        Keine ESP-Geräte gefunden. Bitte zuerst in El Frontend einloggen und Geräte freigeben.
      </p>
    </template>

    <OrbitalView
      v-if="centeredEspId && espStore.findDevice(centeredEspId)"
      :device="espStore.findDevice(centeredEspId)!"
      :origin-rect="originRect"
      @close="closeOrbital"
      @wizard-drop="handleWizardDrop"
    />

    <ConfigWizardModal
      v-if="wizardOpen && wizardPayload"
      :payload="wizardPayload"
      @close="wizardOpen = false"
    />
  </div>
</template>
