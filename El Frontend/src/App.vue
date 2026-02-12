<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEspStore } from '@/stores/esp'
import { onMounted, onUnmounted, ref, watch, markRaw } from 'vue'
import {
  LayoutDashboard, Settings, Activity, Shield, Users, Wrench,
  Cpu, AlertOctagon, Database, Thermometer, Droplets, Zap, FlaskConical
} from 'lucide-vue-next'
import { ruleTemplates } from '@/config/rule-templates'
import { ToastContainer, ConfirmDialog, ContextMenu } from '@/shared/design'
import ErrorDetailsModal from '@/components/error/ErrorDetailsModal.vue'
import type { ErrorDetailsData } from '@/components/error/ErrorDetailsModal.vue'
import CommandPalette from '@/components/command/CommandPalette.vue'
import { useCommandPalette } from '@/composables/useCommandPalette'
import type { CommandItem } from '@/composables/useCommandPalette'

const authStore = useAuthStore()
const espStore = useEspStore()
const router = useRouter()
const palette = useCommandPalette()

// Error Details Modal state (triggered via CustomEvent from toast actions)
const errorModalOpen = ref(false)
const errorModalData = ref<ErrorDetailsData | null>(null)

function handleShowErrorDetails(e: Event) {
  const detail = (e as CustomEvent).detail as ErrorDetailsData
  errorModalData.value = detail
  errorModalOpen.value = true
}

// ── Command Palette: Static Navigation Commands ──
function registerStaticCommands(): void {
  palette.registerCommands([
    {
      id: 'nav:dashboard',
      label: 'Dashboard',
      category: 'navigation',
      icon: markRaw(LayoutDashboard),
      action: () => router.push('/'),
    },
    {
      id: 'nav:logic',
      label: 'Regeln & Logik',
      category: 'navigation',
      icon: markRaw(Activity),
      searchTerms: ['rules', 'logic', 'automation'],
      action: () => router.push('/logic'),
    },
    {
      id: 'nav:monitor',
      label: 'System Monitor',
      category: 'navigation',
      icon: markRaw(Activity),
      searchTerms: ['monitor', 'logs', 'events'],
      action: () => router.push('/monitor'),
    },
    {
      id: 'nav:settings',
      label: 'Einstellungen',
      category: 'navigation',
      icon: markRaw(Settings),
      searchTerms: ['settings', 'config'],
      action: () => router.push('/settings'),
    },
    {
      id: 'nav:database',
      label: 'Datenbank',
      category: 'navigation',
      icon: markRaw(Database),
      searchTerms: ['database', 'db', 'data'],
      action: () => router.push('/database'),
    },
    {
      id: 'action:create-mock',
      label: 'Mock ESP erstellen',
      category: 'actions',
      icon: markRaw(Cpu),
      searchTerms: ['mock', 'esp', 'device', 'create'],
      action: () => {
        router.push('/')
        // The actual modal is opened via DashboardView
      },
    },
    {
      id: 'action:emergency-stop',
      label: 'NOT-AUS (Emergency Stop)',
      category: 'actions',
      icon: markRaw(AlertOctagon),
      searchTerms: ['emergency', 'stop', 'notaus', 'halt'],
      action: () => {
        espStore.emergencyStop()
      },
    },
    // ── Rule Template Commands (Phase 5.4) ──
    ...ruleTemplates.map(tpl => ({
      id: `rule:${tpl.id}`,
      label: `Regel: ${tpl.name}`,
      category: 'rules' as const,
      icon: markRaw(tpl.icon),
      searchTerms: [tpl.description, tpl.category],
      action: () => router.push({ path: '/logic', query: { template: tpl.id } }),
    })),
    // ── Sensor Type Commands (Phase 5.4) ──
    {
      id: 'sensor:ds18b20',
      label: 'DS18B20 Temperatur',
      category: 'sensors',
      icon: markRaw(Thermometer),
      searchTerms: ['temperature', 'temperatur', 'dallas', 'onewire'],
      action: () => router.push({ path: '/', query: { sensorFilter: 'DS18B20' } }),
    },
    {
      id: 'sensor:sht31',
      label: 'SHT31 Temperatur & Feuchte',
      category: 'sensors',
      icon: markRaw(Droplets),
      searchTerms: ['humidity', 'feuchtigkeit', 'i2c', 'sht'],
      action: () => router.push({ path: '/', query: { sensorFilter: 'SHT31' } }),
    },
    {
      id: 'sensor:ph',
      label: 'pH-Sensor',
      category: 'sensors',
      icon: markRaw(FlaskConical),
      searchTerms: ['ph', 'acid', 'säure', 'alkalisch'],
      action: () => router.push({ path: '/', query: { sensorFilter: 'pH' } }),
    },
    {
      id: 'sensor:relay',
      label: 'Relais-Aktoren',
      category: 'sensors',
      icon: markRaw(Zap),
      searchTerms: ['relay', 'relais', 'schalter', 'actuator', 'aktor'],
      action: () => router.push({ path: '/', query: { sensorFilter: 'relay' } }),
    },
  ])
}

// ── Command Palette: Dynamic Device Commands ──
watch(() => espStore.devices, (devices) => {
  // Remove old device commands
  palette.unregisterByPrefix('device:')

  // Register new device commands
  const deviceCommands: CommandItem[] = devices.map(device => {
    const deviceId = espStore.getDeviceId(device)
    return {
      id: `device:${deviceId}`,
      label: device.name || deviceId,
      category: 'devices' as const,
      icon: markRaw(Cpu),
      searchTerms: [deviceId, (device as any).zone_name || ''].filter(Boolean),
      action: () => {
        router.push({ path: '/', query: { openSettings: deviceId } })
      },
    }
  })
  palette.registerCommands(deviceCommands)
}, { deep: true })

onMounted(async () => {
  await authStore.checkAuthStatus()
  window.addEventListener('show-error-details', handleShowErrorDetails)
  registerStaticCommands()
})

onUnmounted(() => {
  espStore.cleanupWebSocket()
  window.removeEventListener('show-error-details', handleShowErrorDetails)
})
</script>

<template>
  <RouterView />
  <ToastContainer />
  <ConfirmDialog />
  <ContextMenu />
  <CommandPalette />
  <ErrorDetailsModal
    :error="errorModalData"
    :open="errorModalOpen"
    @close="errorModalOpen = false"
  />
</template>
