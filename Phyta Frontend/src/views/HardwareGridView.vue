<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Cpu } from 'lucide-vue-next'
import ZoneSection from '@/components/grid/ZoneSection.vue'
import OrbitalView from '@/components/orbital/OrbitalView.vue'
import ConfigWizardModal from '@/components/wizard/ConfigWizardModal.vue'
import EmergencyStopButton from '@/components/safety/EmergencyStopButton.vue'
import { usePhytaSystemConnection } from '@/composables/usePhytaSystemConnection'
import { phytaWebSocket } from '@/services/websocket'
import { useEspStore } from '@/stores/espStore'

const espStore = useEspStore()
const { connectionIndicatorClass, connectionTooltip } = usePhytaSystemConnection()
const centeredEspId = ref<string | null>(null)
const originRect = ref<DOMRect | null>(null)
const lastOpenedEspId = ref<string | null>(null)
const wizardOpen = ref(false)
const wizardPayload = ref<{
  kind: 'sensor' | 'actuator'
  type: string
  espId: string
  deviceIndex?: number
} | null>(null)

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
  lastOpenedEspId.value = payload.deviceId
}

function closeOrbital(): void {
  centeredEspId.value = null
  originRect.value = null
  const espId = lastOpenedEspId.value
  if (espId) {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-esp-id="${espId}"]`)
      el?.focus()
    })
  }
}

function zoneLabel(zoneId: string): string {
  const first = espStore.devicesByZone.get(zoneId)?.[0]
  return first?.zone_name || zoneId
}

function deviceIndexInZone(espId: string): number | undefined {
  const device = espStore.findDevice(espId)
  if (!device) return undefined
  const zone = device.zone_id?.trim() || '__unassigned__'
  const list = espStore.devicesByZone.get(zone) ?? []
  const idx = list.findIndex((d) => (d.device_id || d.esp_id) === espId)
  return idx >= 0 ? idx + 1 : undefined
}

function handleWizardDrop(p: { kind: 'sensor' | 'actuator'; type: string; espId: string }): void {
  wizardPayload.value = {
    ...p,
    deviceIndex: deviceIndexInZone(p.espId),
  }
  wizardOpen.value = true
}
</script>

<template>
  <div class="phyta-page">
    <header class="hardware-page__header">
      <div class="hardware-page__title-row">
        <Cpu :size="24" class="text-iridescent-2" aria-hidden="true" />
        <h1 class="hardware-page__title">Meine Geräte</h1>
      </div>
      <div class="hardware-page__actions">
        <span
          :class="connectionIndicatorClass"
          role="status"
          :title="connectionTooltip"
          :aria-label="connectionTooltip"
        >
          <span class="connection-indicator__dot" aria-hidden="true" />
        </span>
        <EmergencyStopButton compact />
      </div>
    </header>

    <div
      v-if="espStore.isLoading"
      class="hardware-page__status"
      role="status"
    >
      Geräte werden geladen…
    </div>

    <div
      v-else-if="espStore.error"
      class="hardware-page__error"
      role="alert"
    >
      {{ espStore.error }}
    </div>

    <template v-else>
      <div class="hardware-zones">
        <ZoneSection
          v-for="zoneId in espStore.zoneIds"
          :key="zoneId"
          :zone-id="zoneId"
          :zone-label="zoneLabel(zoneId)"
          :devices="espStore.devicesByZone.get(zoneId) ?? []"
          @open-device="openOrbital"
        />
      </div>
      <p
        v-if="!espStore.devices.length"
        class="hardware-page__empty"
      >
        Keine Geräte gefunden. Bitte zuerst anmelden und Geräte freigeben.
      </p>
    </template>

    <OrbitalView
      v-if="centeredEspId && espStore.findDevice(centeredEspId)"
      :device="espStore.findDevice(centeredEspId)!"
      :origin-rect="originRect"
      :device-index="deviceIndexInZone(centeredEspId)"
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

<style scoped>
.hardware-page__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.hardware-page__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.hardware-page__title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--color-text-primary);
}

.hardware-page__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.hardware-page__status {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.hardware-page__error {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-error) 40%, transparent);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  font-size: var(--text-base);
  color: var(--color-error);
}

.hardware-page__empty {
  padding: var(--space-6);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-secondary);
  text-align: center;
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.hardware-zones {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-content: start;
}
</style>
