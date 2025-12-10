import { defineStore } from 'pinia'
import { safeSuccess, safeError, safeInfo } from '@/utils/snackbarUtils'
import { useCentralDataHub } from './centralDataHub'

export const useMindmapStore = defineStore('mindmap', {
  state: () => ({
    // WebSocket-Verbindung
    websocket: null,
    connected: false,
    connecting: false,
    error: null,

    // Hierarchie-Daten
    hierarchy: null,
    lastUpdate: null,

    // Real-time Updates
    realTimeUpdates: [],
    maxUpdates: 100,

    // Performance-Tracking
    performanceStats: {
      messagesProcessed: 0,
      averageLatency: 0,
      lastReset: Date.now(),
    },
  }),

  getters: {
    isConnected: (state) => state.connected,

    getHierarchy: (state) => state.hierarchy,

    getGodData: (state) => state.hierarchy?.god || null,

    getKaisers: (state) => state.hierarchy?.kaisers || [],

    getEspCount: (state) => {
      if (!state.hierarchy?.kaisers) return 0
      return state.hierarchy.kaisers.reduce((total, kaiser) => {
        return total + (kaiser.esp_count || 0)
      }, 0)
    },

    getOnlineEspCount: (state) => {
      if (!state.hierarchy?.kaisers) return 0
      return state.hierarchy.kaisers.reduce((total, kaiser) => {
        return total + (kaiser.online_esp_count || 0)
      }, 0)
    },
  },

  actions: {
    // WebSocket-Verbindung herstellen
    async connectWebSocket() {
      if (this.connecting || this.connected) return

      this.connecting = true
      this.error = null

      try {
        const centralConfig = useCentralDataHub().centralConfig
        const wsUrl = `ws://${centralConfig.serverIP}:80/ws/mindmap`

        console.log('[Mindmap] Connecting to WebSocket:', wsUrl)

        // ✅ NEU: Timeout für WebSocket-Verbindung
        const connectionTimeout = setTimeout(() => {
          if (this.websocket && this.websocket.readyState === WebSocket.CONNECTING) {
            console.log('[Mindmap] WebSocket connection timeout - using offline mode')
            this.websocket.close()
            this.connecting = false
            safeInfo('Mindmap läuft im Offline-Modus - WebSocket nicht erreichbar')
          }
        }, 3000) // 3 Sekunden Timeout

        this.websocket = new WebSocket(wsUrl)

        this.websocket.onopen = () => {
          clearTimeout(connectionTimeout)
          console.log('[Mindmap] WebSocket connected')
          this.connected = true
          this.connecting = false
          safeSuccess('Mindmap-WebSocket verbunden')
        }

        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event.data)
        }

        this.websocket.onerror = () => {
          clearTimeout(connectionTimeout)
          console.log('[Mindmap] WebSocket error - using offline mode')
          this.error = 'WebSocket-Verbindungsfehler'
          this.connecting = false
          safeInfo('Mindmap läuft im Offline-Modus - WebSocket nicht erreichbar')
        }

        this.websocket.onclose = () => {
          clearTimeout(connectionTimeout)
          console.log('[Mindmap] WebSocket disconnected')
          this.connected = false
          this.connecting = false
          safeInfo('Mindmap-WebSocket getrennt')
        }
      } catch (error) {
        console.log('[Mindmap] Failed to connect WebSocket - using offline mode:', error)
        this.error = error.message
        this.connecting = false
        safeInfo('Mindmap läuft im Offline-Modus - WebSocket nicht erreichbar')
      }
    },

    // WebSocket-Verbindung trennen
    disconnectWebSocket() {
      if (this.websocket) {
        this.websocket.close()
        this.websocket = null
      }
      this.connected = false
      this.connecting = false
    },

    // WebSocket-Nachrichten verarbeiten
    handleWebSocketMessage(data) {
      try {
        const update = JSON.parse(data)
        const startTime = performance.now()

        console.log('[Mindmap] Received WebSocket update:', update.type)

        // Update-Typ verarbeiten
        switch (update.type) {
          case 'esp_discovery':
            this.handleEspDiscovery(update.data)
            break
          case 'esp_heartbeat':
            this.handleEspHeartbeat(update.data)
            break
          case 'esp_zone_config':
            this.handleEspZoneConfig(update.data)
            break
          case 'esp_setup':
            this.handleEspSetup(update.data)
            break
          case 'esp_logic_config':
            this.handleEspLogicConfig(update.data)
            break
          case 'zone_aggregation':
            this.handleZoneAggregation(update.data)
            break
          case 'esp_moved':
            this.handleEspMoved(update.data)
            break
          case 'mindmap_hierarchy':
            this.handleHierarchyUpdate(update.data)
            break
          default:
            console.warn('[Mindmap] Unknown update type:', update.type)
        }

        // Performance-Tracking
        const processingTime = performance.now() - startTime
        this.updatePerformanceStats(processingTime)

        // Update zur Historie hinzufügen
        this.addRealTimeUpdate(update)
      } catch (error) {
        console.error('[Mindmap] Failed to parse WebSocket message:', error)
      }
    },

    // Hierarchie-Update verarbeiten
    handleHierarchyUpdate(data) {
      console.log('[Mindmap] Updating hierarchy:', data)
      this.hierarchy = data
      this.lastUpdate = Date.now()

      // CentralDataHub synchronisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('mindmap_hierarchy', data)
      }
    },

    // ESP Discovery verarbeiten
    handleEspDiscovery(data) {
      console.log('[Mindmap] ESP discovered:', data.esp_id)

      // CentralDataHub aktualisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('esp_discovery', data)
      }
    },

    // ESP Heartbeat verarbeiten
    handleEspHeartbeat(data) {
      // CentralDataHub aktualisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('esp_heartbeat', data)
      }
    },

    // ESP Zone Config verarbeiten
    handleEspZoneConfig(data) {
      console.log('[Mindmap] ESP zone config updated:', data.esp_id)

      // CentralDataHub aktualisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('esp_zone_config', data)
      }
    },

    // ESP Setup verarbeiten
    handleEspSetup(data) {
      console.log('[Mindmap] ESP setup completed:', data.esp_id)

      // CentralDataHub aktualisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('esp_setup', data)
      }
    },

    // ESP Logic Config verarbeiten
    handleEspLogicConfig(data) {
      console.log('[Mindmap] ESP logic config updated:', data.esp_id)

      // CentralDataHub aktualisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('esp_logic_config', data)
      }
    },

    // Zone Aggregation verarbeiten
    handleZoneAggregation(data) {
      console.log('[Mindmap] Zone aggregation updated:', data.zone_name)

      // CentralDataHub aktualisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('zone_aggregation', data)
      }
    },

    // ESP Moved verarbeiten
    handleEspMoved(data) {
      console.log('[Mindmap] ESP moved:', data.esp_id, 'from', data.from_owner, 'to', data.to_owner)

      // CentralDataHub aktualisieren
      const centralDataHub = useCentralDataHub()
      if (centralDataHub) {
        centralDataHub.updateHierarchicalState('esp_moved', data)
      }
    },

    // Hierarchie-Daten abrufen (HTTP API)
    async fetchHierarchy() {
      try {
        const centralConfig = useCentralDataHub().centralConfig

        // ✅ NEU: Timeout für Fetch-Request
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 Sekunden Timeout

        const response = await fetch(`http://${centralConfig.serverIP}:80/api/mindmap/hierarchy`, {
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const hierarchy = await response.json()
        console.log('[Mindmap] Fetched hierarchy:', hierarchy)

        this.hierarchy = hierarchy
        this.lastUpdate = Date.now()

        // CentralDataHub synchronisieren
        const centralDataHub = useCentralDataHub()
        if (centralDataHub) {
          centralDataHub.updateHierarchicalState('mindmap_hierarchy', hierarchy)
        }

        return hierarchy
      } catch (error) {
        // ✅ NEU: Bessere Fehlerbehandlung für Offline-Modus
        if (
          error.name === 'AbortError' ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('net::ERR_CONNECTION_TIMED_OUT')
        ) {
          console.log('[Mindmap] Backend nicht erreichbar - verwende Offline-Modus')

          // ✅ NEU: Fallback-Hierarchie für Offline-Modus
          const fallbackHierarchy = this.createFallbackHierarchy()
          this.hierarchy = fallbackHierarchy
          this.lastUpdate = Date.now()

          // CentralDataHub synchronisieren
          const centralDataHub = useCentralDataHub()
          if (centralDataHub) {
            centralDataHub.updateHierarchicalState('mindmap_hierarchy', fallbackHierarchy)
          }

          safeInfo('Mindmap läuft im Offline-Modus - Backend nicht erreichbar')
          return fallbackHierarchy
        }

        console.error('[Mindmap] Failed to fetch hierarchy:', error)
        safeError(`Hierarchie-Abruf fehlgeschlagen: ${error.message}`)
        throw error
      }
    },

    // ✅ KORRIGIERT: Fallback-Hierarchie für Offline-Modus
    createFallbackHierarchy() {
      const centralConfig = useCentralDataHub().centralConfig

      return {
        god: {
          id: centralConfig.getGodId,
          name: centralConfig.godName,
          status: 'offline',
          type: 'central_controller',
          godAsKaiser: centralConfig.isGodKaiser,
          kaiserId: centralConfig.getGodKaiserId,
          kaiserCount: 0, // ✅ KORRIGIERT: God ist Kaiser
          espCount: 0,
          onlineEspCount: 0,
        },
        kaisers: [], // ✅ KORRIGIERT: Keine anderen Kaiser
      }
    },

    // Real-time Update zur Historie hinzufügen
    addRealTimeUpdate(update) {
      this.realTimeUpdates.unshift({
        ...update,
        timestamp: Date.now(),
      })

      // Maximale Anzahl Updates begrenzen
      if (this.realTimeUpdates.length > this.maxUpdates) {
        this.realTimeUpdates = this.realTimeUpdates.slice(0, this.maxUpdates)
      }
    },

    // Performance-Statistiken aktualisieren
    updatePerformanceStats(processingTime) {
      const stats = this.performanceStats
      stats.messagesProcessed++

      // Durchschnittliche Latenz aktualisieren
      const totalTime = stats.averageLatency * (stats.messagesProcessed - 1) + processingTime
      stats.averageLatency = totalTime / stats.messagesProcessed
    },

    // Performance-Statistiken zurücksetzen
    resetPerformanceStats() {
      this.performanceStats = {
        messagesProcessed: 0,
        averageLatency: 0,
        lastReset: Date.now(),
      }
    },

    // Real-time Updates löschen
    clearRealTimeUpdates() {
      this.realTimeUpdates = []
    },

    // Auto-Reconnect bei Verbindungsverlust
    setupAutoReconnect() {
      if (this.websocket) {
        this.websocket.addEventListener('close', () => {
          console.log('[Mindmap] WebSocket closed, attempting reconnect in 5s...')
          setTimeout(() => {
            if (!this.connected) {
              this.connectWebSocket()
            }
          }, 5000)
        })
      }
    },
  },
})
