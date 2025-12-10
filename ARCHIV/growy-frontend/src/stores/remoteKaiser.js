import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { generateKaiserId } from '@/utils/deviceIdGenerator'
import { validateKaiserName } from '@/utils/validation'
import { eventBus, MQTT_EVENTS } from '@/utils/eventBus'

export const useRemoteKaiserStore = defineStore('remoteKaiser', () => {
  // Remote Kaiser Verwaltung
  const connectedKaisers = ref(new Map())
  const selectedKaiserId = ref(null)
  const isConnecting = ref(false)

  // Getter
  const selectedKaiser = computed(() => connectedKaisers.value.get(selectedKaiserId.value))

  const availableKaisers = computed(() => Array.from(connectedKaisers.value.values()))

  // Remote Kaiser hinzufügen
  const addRemoteKaiser = (kaiserData) => {
    const kaiserId = kaiserData.kaiserId || generateKaiserId(kaiserData.name || 'Unknown Kaiser')

    const kaiser = {
      kaiserId,
      name: kaiserData.name || 'Unnamed Kaiser',
      ip: kaiserData.ip || '192.168.1.100',
      port: kaiserData.port || 8443,
      pi0ServerIp: kaiserData.pi0ServerIp || '192.168.1.100',
      pi0ServerPort: kaiserData.pi0ServerPort || 8443,
      godConnectionIp: kaiserData.godConnectionIp || '192.168.1.200',
      godConnectionPort: kaiserData.godConnectionPort || 8443,
      status: 'disconnected',
      lastSeen: null,
      isOnline: false,
    }

    connectedKaisers.value.set(kaiserId, kaiser)
    return kaiser
  }

  // Remote Kaiser konfigurieren
  const configureRemoteKaiser = async (kaiserId, config) => {
    const kaiser = connectedKaisers.value.get(kaiserId)
    if (!kaiser) {
      throw new Error(`Kaiser ${kaiserId} not found`)
    }

    // Lokale Kopie aktualisieren
    Object.assign(kaiser, config)

    // An Remote Kaiser senden
    try {
      await sendConfigToRemoteKaiser(kaiser, config)
      kaiser.lastSeen = Date.now()
      kaiser.status = 'configured'
      return true
    } catch (error) {
      console.error(`Failed to configure remote kaiser ${kaiserId}:`, error)
      kaiser.status = 'error'
      throw error
    }
  }

  // Remote Kaiser Name setzen
  const setRemoteKaiserName = async (kaiserId, name) => {
    const validation = validateKaiserName(name)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    return await configureRemoteKaiser(kaiserId, { name })
  }

  // Remote Kaiser Netzwerk konfigurieren
  const setRemoteKaiserNetwork = async (kaiserId, networkConfig) => {
    const { pi0ServerIp, pi0ServerPort, godConnectionIp, godConnectionPort } = networkConfig

    return await configureRemoteKaiser(kaiserId, {
      pi0ServerIp,
      pi0ServerPort,
      godConnectionIp,
      godConnectionPort,
    })
  }

  // API-Kommunikation mit Remote Kaiser
  const sendConfigToRemoteKaiser = async (kaiser, config) => {
    const response = await fetch(`http://${kaiser.ip}:${kaiser.port}/api/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'kaiser_config_update',
        kaiserId: kaiser.kaiserId,
        config,
        timestamp: Date.now(),
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  }

  // Kaiser auswählen für Konfiguration
  const selectKaiser = (kaiserId) => {
    if (connectedKaisers.value.has(kaiserId)) {
      selectedKaiserId.value = kaiserId
      return true
    }
    return false
  }

  // Kaiser entfernen
  const removeRemoteKaiser = (kaiserId) => {
    connectedKaisers.value.delete(kaiserId)
    if (selectedKaiserId.value === kaiserId) {
      selectedKaiserId.value = null
    }
  }

  // ✅ NEU: setKaiserIdFromMindmap Funktion
  const setKaiserIdFromMindmap = (name) => {
    console.log(`[RemoteKaiser] Setting Kaiser ID from Mindmap: "${name}"`)

    // ✅ SICHER: Nur Kaiser-spezifische Properties
    const kaiserId = generateKaiserId(name)

    // ✅ SICHER: LocalStorage für Kaiser (NICHT God)
    localStorage.setItem('selected_kaiser_id', kaiserId)
    selectedKaiserId.value = kaiserId

    // ✅ SICHER: Event nur für Kaiser-System
    eventBus.emit(MQTT_EVENTS.KAISER_ID_CHANGED, {
      oldId: selectedKaiserId.value,
      newId: kaiserId,
      name,
      source: 'mindmap',
      timestamp: Date.now(),
    })

    console.log(`[RemoteKaiser] Kaiser ID set: ${kaiserId}`)
    return kaiserId
  }

  return {
    // State
    connectedKaisers,
    selectedKaiserId,
    isConnecting,

    // Getters
    selectedKaiser,
    availableKaisers,

    // Actions
    addRemoteKaiser,
    configureRemoteKaiser,
    setRemoteKaiserName,
    setRemoteKaiserNetwork,
    selectKaiser,
    removeRemoteKaiser,
    sendConfigToRemoteKaiser,
    setKaiserIdFromMindmap, // ← Diese Zeile hinzugefügt
  }
})
