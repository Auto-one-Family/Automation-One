/**
 * useDeviceActions Composable
 *
 * Reusable device action logic extracted from ESPOrbitalLayout/DeviceHeaderBar:
 * - Inline name editing (double-click → input → Enter/Escape)
 * - Heartbeat trigger (Mock ESPs only)
 * - WiFi signal info
 * - Device state info
 *
 * Used by:
 * - ESPOrbitalLayout (compact mode header)
 * - DeviceHeaderBar (standalone)
 * - Future: DeviceDetailView
 */

import { ref, computed, nextTick } from 'vue'
import type { ESPDevice } from '@/api/esp'
import { espApi } from '@/api/esp'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'
import { getStateInfo } from '@/utils/labels'
import { getWifiStrength, type WifiStrengthInfo } from '@/utils/wifiStrength'
import { formatRelativeTime, DATA_STALE_THRESHOLD_S } from '@/utils/formatters'
import { createLogger } from '@/utils/logger'

const logger = createLogger('DeviceActions')

export function useDeviceActions(device: () => ESPDevice) {
  const espStore = useEspStore()
  const toast = useToast()

  // ── Identity ───────────────────────────────────────────────────────

  const espId = computed(() => device().device_id || device().esp_id || '')
  const isMock = computed(() => espApi.isMockEsp(espId.value))
  const displayName = computed(() => device().name || null)
  const isOnline = computed(() => device().status === 'online' || device().connected === true)

  const systemState = computed(() => {
    if (isMock.value && 'system_state' in device()) {
      return (device() as any).system_state
    }
    return device().status || 'unknown'
  })

  const stateInfo = computed(() => {
    if (isMock.value) return getStateInfo(systemState.value)
    const status = device().status || 'unknown'
    if (status === 'online') return { label: 'Online', variant: 'success' }
    if (status === 'offline') return { label: 'Offline', variant: 'gray' }
    if (status === 'error') return { label: 'Error', variant: 'danger' }
    return { label: 'Unknown', variant: 'gray' }
  })

  // ── WiFi ───────────────────────────────────────────────────────────

  const wifiInfo = computed<WifiStrengthInfo>(() => getWifiStrength(device().wifi_rssi))

  const wifiColorClass = computed(() => {
    switch (wifiInfo.value.quality) {
      case 'excellent': case 'good': return 'wifi--good'
      case 'fair': return 'wifi--fair'
      default: return 'wifi--poor'
    }
  })

  const wifiTooltip = computed(() =>
    device().wifi_rssi
      ? `WiFi: ${device().wifi_rssi} dBm (${wifiInfo.value.label})`
      : 'WiFi: Keine Daten'
  )

  // ── Heartbeat ──────────────────────────────────────────────────────

  const heartbeatLoading = ref(false)

  const isHeartbeatFresh = computed(() => {
    const lastSeen = device().last_heartbeat || device().last_seen
    if (!lastSeen) return false
    const diff = Date.now() - new Date(lastSeen).getTime()
    return diff < DATA_STALE_THRESHOLD_S * 1000
  })

  const heartbeatTooltip = computed(() => {
    const ts = device().last_heartbeat || device().last_seen
    if (!ts) return 'Kein Heartbeat empfangen'
    if (isMock.value) return `Letzter Heartbeat: ${formatRelativeTime(ts)} (Klick = manuell senden)`
    return `Letzter Heartbeat: ${formatRelativeTime(ts)}`
  })

  const heartbeatText = computed(() =>
    formatRelativeTime(device().last_heartbeat || device().last_seen || '')
  )

  async function triggerHeartbeat(): Promise<void> {
    if (!isMock.value || heartbeatLoading.value) return
    heartbeatLoading.value = true
    try {
      await espStore.triggerHeartbeat(espId.value)
      logger.info(`Heartbeat triggered for ${espId.value}`)
    } catch (err) {
      logger.error(`Failed to trigger heartbeat for ${espId.value}`, err)
    } finally {
      setTimeout(() => { heartbeatLoading.value = false }, 1000)
    }
  }

  // ── Name Editing ───────────────────────────────────────────────────

  const isEditingName = ref(false)
  const editedName = ref('')
  const isSavingName = ref(false)
  const saveError = ref<string | null>(null)
  const nameInputRef = ref<HTMLInputElement | null>(null)

  function startEditName() {
    editedName.value = displayName.value || ''
    isEditingName.value = true
    saveError.value = null
    nextTick(() => {
      nameInputRef.value?.focus()
      nameInputRef.value?.select()
    })
  }

  function cancelEditName() {
    isEditingName.value = false
    saveError.value = null
  }

  async function saveName(): Promise<{ deviceId: string; name: string | null } | null> {
    if (isSavingName.value) return null
    const trimmed = editedName.value.trim()
    const newName = trimmed || null

    if (newName === displayName.value) {
      isEditingName.value = false
      return null
    }

    isSavingName.value = true
    saveError.value = null

    try {
      await espStore.updateDevice(espId.value, { name: newName ?? undefined })
      isEditingName.value = false
      toast.success(newName ? `Gerätename: "${newName}"` : 'Gerätename entfernt')
      return { deviceId: espId.value, name: newName }
    } catch (err) {
      saveError.value = 'Speichern fehlgeschlagen'
      logger.error('Failed to save name', err)
      return null
    } finally {
      isSavingName.value = false
    }
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveName()
    if (e.key === 'Escape') cancelEditName()
  }

  return {
    // Identity
    espId,
    isMock,
    displayName,
    isOnline,
    systemState,
    stateInfo,

    // WiFi
    wifiInfo,
    wifiColorClass,
    wifiTooltip,

    // Heartbeat
    heartbeatLoading,
    isHeartbeatFresh,
    heartbeatTooltip,
    heartbeatText,
    triggerHeartbeat,

    // Name Editing
    isEditingName,
    editedName,
    isSavingName,
    saveError,
    nameInputRef,
    startEditName,
    cancelEditName,
    saveName,
    handleNameKeydown,
  }
}
