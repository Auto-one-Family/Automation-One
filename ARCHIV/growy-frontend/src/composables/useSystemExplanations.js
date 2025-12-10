import { useCentralDataHub } from '@/stores/centralDataHub'
import { computed } from 'vue'

/**
 * Composable für dynamische System-Erklärungen
 *
 * Bietet kontextuelle Erklärungen basierend auf:
 * - Node-Typ (God, Kaiser, Zone, ESP)
 * - System-Status und -Zustand
 * - Anzahl verbundener Geräte
 * - Aktuelle System-Gesundheit
 *
 * @returns {Object} System-Erklärungs-Funktionen und -Daten
 */
export function useSystemExplanations() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = computed(() => centralDataHub.storeReferences.mqtt)

  // ✅ Basis-System-Erklärungen
  const SYSTEM_EXPLANATIONS = {
    god: {
      title: 'Wie funktioniert das God-System?',
      description:
        'Der God Pi ist der zentrale Computer, der alle Kaiser-Systeme koordiniert. Er sammelt Daten von allen Edge Controllern und trifft übergeordnete Entscheidungen für das gesamte System.',
      features: [
        { icon: 'mdi-database', text: 'Zentrale Datenverwaltung' },
        { icon: 'mdi-brain', text: 'Übergeordnete Entscheidungen' },
        { icon: 'mdi-crown', text: 'Kaiser-Koordination' },
        { icon: 'mdi-cog', text: 'System-weite Logik' },
        { icon: 'mdi-chart-line', text: 'Aggregierte Analysen' },
        { icon: 'mdi-shield', text: 'Sicherheitsüberwachung' },
      ],
      dynamicDescription: (context) => {
        const kaiserCount = context.kaiserCount || 0
        const totalEspCount = context.totalEspCount || 0

        if (kaiserCount === 0) {
          return 'Der God Pi wartet auf die Verbindung zu Kaiser-Systemen. Sobald Kaiser-Systeme hinzugefügt werden, beginnt die zentrale Koordination.'
        } else if (kaiserCount === 1) {
          return `Der God Pi koordiniert ${kaiserCount} Kaiser-System mit ${totalEspCount} Feldgeräten. Das System ist bereit für erweiterte Funktionen.`
        } else {
          return `Der God Pi koordiniert ${kaiserCount} Kaiser-Systeme mit insgesamt ${totalEspCount} Feldgeräten. Das System arbeitet in voller Kapazität.`
        }
      },
    },

    kaiser: {
      title: 'Wie funktioniert das Kaiser-System?',
      description:
        'Das Kaiser-System ist ein Edge Controller, der zwischen dem God Pi und den ESP-Geräten vermittelt. Es überwacht lokale Prozesse und führt autonome Entscheidungen durch.',
      features: [
        { icon: 'mdi-server', text: 'Edge Computing' },
        { icon: 'mdi-wifi', text: 'Lokale Netzwerkverwaltung' },
        { icon: 'mdi-cog', text: 'Autonome Entscheidungen' },
        { icon: 'mdi-memory', text: 'ESP-Koordination' },
        { icon: 'mdi-chart-area', text: 'Lokale Datenanalyse' },
        { icon: 'mdi-shield-check', text: 'Sicherheitsüberwachung' },
      ],
      dynamicDescription: (context) => {
        const espCount = context.espCount || 0
        const onlineEspCount = context.onlineEspCount || 0
        const zoneCount = context.zoneCount || 0

        if (espCount === 0) {
          return 'Das Kaiser-System ist bereit für ESP-Geräte. Sobald Feldgeräte hinzugefügt werden, beginnt die lokale Koordination und Überwachung.'
        } else if (onlineEspCount === 0) {
          return `Das Kaiser-System verwaltet ${espCount} konfigurierte ESP-Geräte in ${zoneCount} Zonen. Alle Geräte sind derzeit offline.`
        } else {
          return `Das Kaiser-System verwaltet ${espCount} ESP-Geräte in ${zoneCount} Zonen. ${onlineEspCount} Geräte sind online und aktiv.`
        }
      },
    },

    zone: {
      title: 'Wie funktioniert die Zone?',
      description:
        'Zonen sind logische Bereiche, die ESP-Geräte gruppieren. Sie ermöglichen eine organisierte Verwaltung und gezielte Steuerung von Geräten in bestimmten Bereichen.',
      features: [
        { icon: 'mdi-map-marker', text: 'Logische Gruppierung' },
        { icon: 'mdi-cog', text: 'Zonen-spezifische Logik' },
        { icon: 'mdi-drag', text: 'Drag & Drop Verwaltung' },
        { icon: 'mdi-chart-box', text: 'Aggregierte Daten' },
        { icon: 'mdi-shield', text: 'Zonen-Sicherheit' },
        { icon: 'mdi-tune', text: 'Individuelle Konfiguration' },
      ],
      dynamicDescription: (context) => {
        const espCount = context.espCount || 0
        const onlineEspCount = context.onlineEspCount || 0
        const isUnconfigured = context.isUnconfigured || false

        if (isUnconfigured) {
          return 'Diese Zone enthält unkonfigurierte ESP-Geräte. Konfigurieren Sie die Geräte oder verschieben Sie sie in spezifische Zonen für bessere Organisation.'
        } else if (espCount === 0) {
          return 'Diese Zone ist leer. Ziehen Sie ESP-Geräte hierher oder fügen Sie neue Geräte hinzu, um die Zone zu nutzen.'
        } else if (onlineEspCount === 0) {
          return `Diese Zone enthält ${espCount} ESP-Geräte, die derzeit offline sind. Überprüfen Sie die Verbindung der Geräte.`
        } else {
          return `Diese Zone enthält ${espCount} ESP-Geräte, davon ${onlineEspCount} online. Die Zone arbeitet optimal.`
        }
      },
    },

    esp: {
      title: 'Wie funktioniert das ESP-Gerät?',
      description:
        'ESP-Geräte sind die Feldgeräte, die Sensoren und Aktoren verwalten. Sie sammeln Daten und führen lokale Steuerungsaufgaben aus.',
      features: [
        { icon: 'mdi-memory', text: 'Sensoren & Aktoren' },
        { icon: 'mdi-wifi', text: 'Drahtlose Kommunikation' },
        { icon: 'mdi-cog', text: 'Lokale Logik' },
        { icon: 'mdi-chart-line', text: 'Datenaufzeichnung' },
        { icon: 'mdi-shield', text: 'Sicherheitsmodus' },
        { icon: 'mdi-tune', text: 'Konfigurierbar' },
      ],
      dynamicDescription: (context) => {
        const status = context.status || 'unknown'
        const sensorCount = context.sensorCount || 0
        const actuatorCount = context.actuatorCount || 0

        switch (status) {
          case 'online':
            return `Das ESP-Gerät ist online und verwaltet ${sensorCount} Sensoren und ${actuatorCount} Aktoren. Es arbeitet optimal.`
          case 'offline':
            return `Das ESP-Gerät ist offline. Es hat ${sensorCount} Sensoren und ${actuatorCount} Aktoren konfiguriert.`
          case 'setup':
            return 'Das ESP-Gerät ist im Setup-Modus. Konfigurieren Sie es über das WiFi-Hotspot oder die direkte Verbindung.'
          case 'error':
            return `Das ESP-Gerät meldet einen Fehler. Überprüfen Sie die Konfiguration und Verbindung.`
          default:
            return `Das ESP-Gerät hat ${sensorCount} Sensoren und ${actuatorCount} Aktoren. Der Status wird überprüft.`
        }
      },
    },
  }

  // ✅ Dynamische Kontext-Generierung
  const getSystemContext = (nodeType, nodeId = null) => {
    const context = {}

    switch (nodeType) {
      case 'god': {
        const kaisers = Array.from(mqttStore.value.kaiserDevices?.values() || [])
        context.kaiserCount = kaisers.length
        context.totalEspCount = Array.from(mqttStore.value.espDevices.values()).length
        context.onlineKaiserCount = kaisers.filter((k) => k.status === 'online').length
        break
      }

      case 'kaiser': {
        if (nodeId) {
          const kaiser = mqttStore.value.kaiserDevices?.get(nodeId)
          const espsForKaiser = Array.from(mqttStore.value.espDevices.values()).filter(
            (esp) => esp.kaiserId === nodeId,
          )

          context.espCount = espsForKaiser.length
          context.onlineEspCount = espsForKaiser.filter((esp) => esp.status === 'online').length
          context.zoneCount = new Set(espsForKaiser.map((esp) => esp.zone).filter(Boolean)).size
          context.kaiserStatus = kaiser?.status || 'unknown'
        }
        break
      }

      case 'zone': {
        if (nodeId) {
          const espsInZone = Array.from(mqttStore.value.espDevices.values()).filter(
            (esp) => esp.zone === nodeId,
          )

          context.espCount = espsInZone.length
          context.onlineEspCount = espsInZone.filter((esp) => esp.status === 'online').length
          context.isUnconfigured = nodeId === 'unconfigured'
          context.zoneName = nodeId === 'unconfigured' ? 'Unkonfiguriert' : nodeId
        }
        break
      }

      case 'esp': {
        if (nodeId) {
          const esp = mqttStore.value.espDevices.get(nodeId)
          if (esp) {
            context.status = esp.status || 'unknown'
            context.sensorCount = esp.sensors?.size || 0
            context.actuatorCount = esp.actuators?.size || 0
            context.lastHeartbeat = esp.lastHeartbeat
            context.systemState = esp.systemState
          }
        }
        break
      }
    }

    return context
  }

  // ✅ Hauptfunktionen für Komponenten
  const getExplanation = (nodeType, nodeId = null) => {
    const explanation = SYSTEM_EXPLANATIONS[nodeType]
    if (!explanation) return null

    const context = getSystemContext(nodeType, nodeId)

    return {
      title: explanation.title,
      description: explanation.dynamicDescription
        ? explanation.dynamicDescription(context)
        : explanation.description,
      features: explanation.features,
      context,
    }
  }

  // ✅ Erweiterte Erklärungen mit System-Gesundheit
  const getHealthAwareExplanation = (nodeType, nodeId = null) => {
    const baseExplanation = getExplanation(nodeType, nodeId)
    if (!baseExplanation) return null

    const context = baseExplanation.context

    // Gesundheit-basierte Anpassungen
    let healthStatus = 'good'
    let healthMessage = ''

    switch (nodeType) {
      case 'god': {
        const offlineKaisers = context.kaiserCount - context.onlineKaiserCount
        if (offlineKaisers > 0) {
          healthStatus = 'warning'
          healthMessage = `${offlineKaisers} Kaiser-System(e) offline`
        }
        break
      }

      case 'kaiser': {
        if (context.onlineEspCount === 0 && context.espCount > 0) {
          healthStatus = 'warning'
          healthMessage = 'Alle ESP-Geräte offline'
        } else if (context.kaiserStatus === 'offline') {
          healthStatus = 'error'
          healthMessage = 'Kaiser-System offline'
        }
        break
      }

      case 'zone': {
        if (context.onlineEspCount === 0 && context.espCount > 0) {
          healthStatus = 'warning'
          healthMessage = 'Alle ESP-Geräte in Zone offline'
        }
        break
      }

      case 'esp': {
        if (context.status === 'offline') {
          healthStatus = 'error'
          healthMessage = 'ESP-Gerät offline'
        } else if (context.status === 'error') {
          healthStatus = 'error'
          healthMessage = 'ESP-Gerät meldet Fehler'
        }
        break
      }
    }

    return {
      ...baseExplanation,
      healthStatus,
      healthMessage,
    }
  }

  // ✅ Performance-optimierte Caching
  const explanationCache = new Map()
  const CACHE_TIMEOUT = 30 * 1000 // 30 Sekunden

  const getCachedExplanation = (nodeType, nodeId = null) => {
    const cacheKey = `${nodeType}-${nodeId || 'default'}`
    const cached = explanationCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      return cached.explanation
    }

    const explanation = getHealthAwareExplanation(nodeType, nodeId)
    explanationCache.set(cacheKey, {
      explanation,
      timestamp: Date.now(),
    })

    return explanation
  }

  // ✅ Cache-Invalidierung
  const invalidateCache = (nodeType = null, nodeId = null) => {
    if (nodeType) {
      const cacheKey = `${nodeType}-${nodeId || 'default'}`
      explanationCache.delete(cacheKey)
    } else {
      explanationCache.clear()
    }
  }

  return {
    // Hauptfunktionen
    getExplanation,
    getHealthAwareExplanation,
    getCachedExplanation,

    // Cache-Management
    invalidateCache,

    // Direkte Zugriffe
    SYSTEM_EXPLANATIONS,
    getSystemContext,
  }
}
