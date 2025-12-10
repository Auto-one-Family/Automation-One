<template>
  <UnifiedCard
    class="zone-card mb-6"
    variant="outlined"
    :title="getZoneDisplayName(zone)"
    icon="mdi-view-grid"
    :compact="centralDataHub.isMobile"
    :interactive="true"
    :loading="refreshing"
    :error="errorMessage"
    :show-header-actions="true"
    :show-actions="true"
    draggable="true"
    @dragstart="handleZoneDragStart"
    @dragend="handleZoneDragEnd"
    @dragover="handleDragOver"
    @drop="handleDrop"
    @contextmenu="handleContextMenu($event, 'zone', zone)"
    @click="handleCardClick"
    :class="{
      'drag-over': isDragOver,
      dragging: isZoneDragging,
      'returning-to-position': isReturningToPosition,
    }"
  >
    <!-- Header Actions Slot -->
    <template #header-actions>
      <!-- 🆕 NEU: Drag-Indikator -->
      <div class="drag-indicator">
        <v-icon icon="mdi-drag" size="small" color="grey" />
        <span class="text-caption text-grey ml-1">Ziehen</span>
      </div>
    </template>

    <!-- 🆕 NEU: Drop-Zone-Indikator -->
    <div v-if="isDragOver" class="drop-zone-overlay">
      <v-icon icon="mdi-plus-circle" size="large" color="primary" />
      <div class="text-caption">Zone hier ablegen für Vergleich</div>
    </div>

    <!-- 🆕 NEU: Aggregations nur bei aktiviertem Toggle -->
    <div v-if="showAggregations && zoneAggregations.length > 0" class="mb-6">
      <div class="flex items-center mb-2">
        <v-icon icon="mdi-chart-line" size="small" class="mr-2 text-gray-500" />
        <span class="text-sm font-medium text-gray-600">Sensor-Zusammenfassung</span>
        <v-tooltip location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" icon="mdi-information" size="small" class="ml-2 text-gray-400" />
          </template>
          <template #default>
            Zeigt Durchschnitt, Minimum und Maximum aller Sensoren dieser Zone im gewählten
            Zeitfenster
          </template>
        </v-tooltip>
      </div>
      <div class="flex flex-wrap gap-2">
        <v-tooltip v-for="agg in zoneAggregations" :key="`agg-${agg.type}`" location="top">
          <template #activator="{ props }">
            <v-chip
              v-bind="props"
              :color="getSensorColor(agg.type)"
              size="small"
              variant="tonal"
              class="cursor-help"
            >
              <v-icon :icon="getSensorIcon(agg.type)" size="small" class="mr-1" />
              {{ getSensorDisplayName(agg.type) }}: {{ formatAggregationValue(agg) }}
            </v-chip>
          </template>
          <template #default>
            <div class="text-center">
              <div class="font-weight-medium">{{ agg.label }} - Zusammenfassung</div>
              <div class="text-caption">Durchschnitt: {{ agg.avg.toFixed(1) }}{{ agg.unit }}</div>
              <div class="text-caption">
                Bereich: {{ agg.min.toFixed(1) }} - {{ agg.max.toFixed(1) }}{{ agg.unit }}
              </div>
              <div class="text-caption">{{ agg.count }} Sensoren</div>
            </div>
          </template>
        </v-tooltip>
      </div>
    </div>

    <!-- Safe Mode Warning -->
    <div v-if="mqttStore.value.isSafeMode" class="mb-6">
      <v-alert type="warning" variant="tonal" density="compact" icon="mdi-alert">
        System is in Safe Mode. Configure pins to enable control.
      </v-alert>
    </div>

    <!-- ✅ NEU: Aktoren-Sektion -->
    <div v-if="zoneActuators.length > 0" class="mb-6">
      <div class="flex items-center mb-3">
        <v-icon icon="mdi-lightning-bolt" size="small" class="mr-2 text-orange-500" />
        <span class="text-sm font-medium text-gray-600">Aktoren</span>
        <v-tooltip location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" icon="mdi-information" size="small" class="ml-2 text-gray-400" />
          </template>
          <template #default> Steuerbare Aktoren in dieser Zone </template>
        </v-tooltip>
      </div>

      <div :class="`grid grid-cols-${getDynamicActuatorCols()} gap-4`">
        <ActuatorCard
          v-for="actuator in zoneActuators"
          :key="`actuator-${actuator.espId}-${actuator.gpio}`"
          :actuator="actuator"
          @actuator-toggle="handleActuatorToggle"
          @actuator-value="handleActuatorValue"
          @logic-saved="handleLogicSaved"
        />
      </div>
    </div>

    <!-- SubZones -->
    <div class="space-y-6">
      <SubZoneCard
        v-for="subZone in subZones"
        :key="`subzone-${subZone.id}`"
        :esp-id="zone.espId"
        :sub-zone="subZone"
        @actuator-toggle="handleActuatorToggle"
        @actuator-value="handleActuatorValue"
      />
    </div>

    <!-- Actions Slot -->
    <template #actions>
      <v-btn
        variant="text"
        :to="zone.espId ? `/zone/${zone.espId}/config` : ''"
        :disabled="!mqttStore.value.isConnected || !zone.espId"
        :loading="refreshing"
      >
        <v-tooltip v-if="!mqttStore.value.isConnected || !zone.espId" location="top">
          <template #activator="{ props }">
            <span v-bind="props"> Configure </span>
          </template>
          {{ getConfigureButtonTooltip() }}
        </v-tooltip>
        <span v-else>Configure</span>
      </v-btn>
      <v-btn
        variant="text"
        color="primary"
        :loading="refreshing"
        @click="refreshStatus"
        :disabled="!mqttStore.value.isConnected"
      >
        Refresh
      </v-btn>
    </template>

    <!-- 🆕 NEU: Context Menu -->
    <ContextMenu
      v-model="showContextMenu"
      :context="contextMenuData"
      :position="contextMenuPosition"
      @action="handleContextMenuAction"
    />
  </UnifiedCard>
</template>

<script>
import { defineComponent, ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useSensorAggregation } from '@/composables/useSensorAggregation'
import { useSensorValidation } from '@/utils/sensorValidation'
import { useResponsiveDisplay } from '@/composables/useResponsiveDisplay'
import UnifiedCard from '@/components/common/UnifiedCard.vue'
import SubZoneCard from './SubZoneCard.vue'
import ActuatorCard from './ActuatorCard.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'

export default defineComponent({
  name: 'ZoneCard',

  components: {
    UnifiedCard,
    SubZoneCard,
    ActuatorCard,
    ContextMenu,
  },

  props: {
    zone: {
      type: Object,
      required: true,
      default: () => ({
        id: '',
        espId: '',
        name: '',
        status: 'offline',
        subZones: new Map(),
      }),
    },
    // 🆕 NEU: Externe Aggregation-Steuerung
    showAggregations: {
      type: Boolean,
      default: false,
    },
    timeWindow: {
      type: Number,
      default: 5 * 60 * 1000,
    },
    // 🆕 NEU: Position für Drag & Drop
    position: {
      type: Number,
      default: 0,
    },
  },

  setup(props, { emit }) {
    // ✅ KORRIGIERT: Optimierte Reaktivität
    const centralDataHub = useCentralDataHub()

    // ✅ KONSOLIDIERT: Einheitliche Store-Referenzen über CentralDataHub
    const mqttStore = computed(() => centralDataHub.mqttStore)
    const zonesStore = computed(() => centralDataHub.zoneRegistry)
    const zoneRegistry = computed(() => centralDataHub.zoneRegistry)

    const { validateSensorStatus, shouldShowHealthWarning } = useSensorValidation()
    const {
      getEspAggregations,
      getEspAggregationsWithTimeWindow,
      getSensorColor,
      getSensorIcon,
      formatAggregationValue,
    } = useSensorAggregation()

    // ✅ NEU: Responsive Display Integration
    const responsiveDisplay = useResponsiveDisplay()

    // ✅ NEU: Store-Synchronisation und Race-Condition-Vermeidung
    const storeSyncState = ref({
      isSyncing: false,
      lastSync: null,
      pendingUpdates: new Set(),
      syncQueue: [],
      syncTimeout: null,
    })

    // ✅ NEU: Performance-Monitoring
    const performanceMetrics = ref({
      renderTime: 0,
      dataLoadTime: 0,
      cacheHitRate: 0,
      syncLatency: 0,
      errorCount: 0,
    })

    // ✅ NEU: Store-Synchronisation mit Debouncing
    const syncStores = async (force = false) => {
      if (storeSyncState.value.isSyncing && !force) {
        // Queue update für später
        storeSyncState.value.syncQueue.push(Date.now())
        return
      }

      storeSyncState.value.isSyncing = true
      const syncStart = performance.now()

      try {
        // ✅ NEU: Batch-Update für alle Stores
        const updates = Array.from(storeSyncState.value.pendingUpdates)
        storeSyncState.value.pendingUpdates.clear()

        if (updates.length > 0) {
          await Promise.all([
            // MQTT Store synchronisieren
            mqttStore.value.syncDeviceData?.(props.zone.espId),
            // Sensor Registry synchronisieren
            centralDataHub.sensorRegistry.syncSensorsForEsp?.(props.zone.espId),
            // Zone Registry synchronisieren
            zoneRegistry.value.syncZoneData?.(props.zone.id),
          ])

          // ✅ NEU: Cache invalidieren nach Sync
          centralDataHub.clearCache(`zone-sensors-${props.zone.espId}`)
          centralDataHub.clearCache(`zone-actuators-${props.zone.espId}`)
          centralDataHub.clearCache(`zone-aggregations-${props.zone.espId}-${props.timeWindow}`)
        }

        storeSyncState.value.lastSync = Date.now()
        performanceMetrics.value.syncLatency = performance.now() - syncStart
      } catch (error) {
        console.error('Store synchronization failed:', error)
        performanceMetrics.value.errorCount++

        // ✅ NEU: Retry-Logik für Store-Sync
        if (storeSyncState.value.syncQueue.length < 3) {
          setTimeout(() => syncStores(true), 1000)
        }
      } finally {
        storeSyncState.value.isSyncing = false

        // ✅ NEU: Process queued updates
        if (storeSyncState.value.syncQueue.length > 0) {
          const nextUpdate = storeSyncState.value.syncQueue.shift()
          if (nextUpdate) {
            setTimeout(() => syncStores(), 100)
          }
        }
      }
    }

    // ✅ NEU: Debounced Store-Sync
    const debouncedSync = () => {
      if (storeSyncState.value.syncTimeout) {
        clearTimeout(storeSyncState.value.syncTimeout)
      }

      storeSyncState.value.syncTimeout = setTimeout(() => {
        syncStores()
      }, 200) // 200ms Debounce
    }

    // ✅ NEU: Cross-Store-Kommunikation mit Race-Condition-Schutz
    const updateCrossStoreData = async (updateType, data) => {
      const updateId = `${updateType}-${Date.now()}-${Math.random()}`
      storeSyncState.value.pendingUpdates.add(updateId)

      try {
        // ✅ NEU: Atomic Update Pattern
        const updatePromises = []

        switch (updateType) {
          case 'actuator':
            updatePromises.push(
              mqttStore.value.updateActuatorState?.(props.zone.espId, data.gpio, data.state),
              centralDataHub.actuatorLogic.updateActuatorLogic?.(
                props.zone.espId,
                data.gpio,
                data.logic,
              ),
            )
            break

          case 'sensor':
            updatePromises.push(
              centralDataHub.sensorRegistry.updateSensorData?.(
                props.zone.espId,
                data.gpio,
                data.value,
              ),
              mqttStore.value.updateSensorStatus?.(props.zone.espId, data.gpio, data.status),
            )
            break

          case 'zone':
            updatePromises.push(
              zoneRegistry.value.updateZoneData?.(props.zone.id, data),
              centralDataHub.centralConfig.updateZoneMapping?.(props.zone.espId, data.zone),
            )
            break
        }

        await Promise.all(updatePromises)
        debouncedSync()
      } catch (error) {
        console.error(`Cross-store update failed for ${updateType}:`, error)
        storeSyncState.value.pendingUpdates.delete(updateId)
        throw error
      }
    }

    // ✅ NEU: Performance-Monitoring für Render-Zyklen
    const measureRenderPerformance = () => {
      const renderStart = performance.now()

      return () => {
        const renderTime = performance.now() - renderStart
        performanceMetrics.value.renderTime = renderTime

        // ✅ NEU: Warnung bei langsamen Renders
        if (renderTime > 16) {
          // 60fps = 16.67ms
          console.warn(`Slow render detected: ${renderTime.toFixed(2)}ms`)
        }
      }
    }

    // ✅ NEU: Cache-Performance-Monitoring
    const measureCachePerformance = (cacheKey, hit) => {
      if (hit) {
        performanceMetrics.value.cacheHitRate = performanceMetrics.value.cacheHitRate * 0.9 + 0.1
      } else {
        performanceMetrics.value.cacheHitRate = performanceMetrics.value.cacheHitRate * 0.9 + 0.0
      }
    }

    // ✅ NEU: Dynamische Aktor-Grid-Berechnung
    const getDynamicActuatorCols = () => {
      const actuatorCount = props.zone?.actuators
        ? Array.from(props.zone.actuators.values()).length
        : 0
      return responsiveDisplay.getDynamicActuatorCols(actuatorCount)
    }

    // ✅ NEU: Configure-Button Tooltip
    const getConfigureButtonTooltip = () => {
      if (!mqttStore.value.isConnected) {
        return 'MQTT-Verbindung erforderlich'
      }
      if (!props.zone.espId) {
        return 'ESP-Gerät muss zuerst ausgewählt werden'
      }
      return 'Zone konfigurieren'
    }

    // ✅ NEU: Kontextabhängige Button-Konfiguration
    const getConfigureAction = () => {
      if (!mqttStore.value.isConnected)
        return {
          action: 'reconnect',
          text: 'Verbinden',
          icon: 'mdi-wifi',
          color: 'warning',
          disabled: false,
        }
      if (!props.zone.espId)
        return {
          action: 'selectEsp',
          text: 'ESP wählen',
          icon: 'mdi-chip',
          color: 'info',
          disabled: false,
        }
      return {
        action: 'navigate',
        text: 'Configure',
        icon: 'mdi-cog',
        color: 'primary',
        disabled: false,
        to: `/zone/${props.zone.espId}/config`,
      }
    }

    // ✅ NEU: Einheitliche Button-Konfiguration
    const getActionButton = () => {
      const action = getConfigureAction()

      return {
        text: action.text,
        icon: action.icon,
        color: action.color,
        disabled: action.disabled,
        to: action.to,
        onClick: () => handleAction(action.action),
      }
    }

    // ✅ NEU: Action-Handler mit Store-Sync
    const handleAction = async (action) => {
      switch (action) {
        case 'reconnect':
          // ✅ CLEAN CODE: Reconnect entfernt - Auto-reconnect aktiv
          console.log('Auto-reconnect aktiv - manueller Reconnect nicht nötig')
          break
        case 'selectEsp':
          // Emit event für parent component
          emit('select-esp', props.zone)
          break
        case 'navigate':
          // Navigation wird über v-btn :to prop gehandhabt
          break
        default:
          console.warn('Unknown action:', action)
      }
    }

    // 🆕 NEU: Drag & Drop State
    const isZoneDragging = ref(false)
    const isDragOver = ref(false)
    const isReturningToPosition = ref(false)
    const isOutsideHome = ref(false)
    const originalPosition = ref(null)

    // 🆕 NEU: Drag & Drop Handler mit verbesserter Rücksprung-Logik
    const handleZoneDragStart = (event) => {
      isZoneDragging.value = true
      originalPosition.value = { x: event.clientX, y: event.clientY }

      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          type: 'zone',
          zoneId: props.zone.id,
          name: getZoneDisplayName(props.zone),
          espId: props.zone.espId,
          data: props.zone,
        }),
      )
    }

    const handleZoneDragEnd = (event) => {
      isZoneDragging.value = false

      // 🆕 NEU: Prüfe, ob Zone außerhalb ihres logischen Bereichs ist
      isOutsideHome.value = !withinDesignatedZoneContainer(event)

      if (isOutsideHome.value) {
        // 🆕 NEU: Visual Indikator und sanftes Rückspringen
        isReturningToPosition.value = true
        setTimeout(() => {
          emit('position-restore', {
            zoneId: props.zone.id,
            position: originalPosition.value,
            reason: 'Zone muss in ihrem logischen Bereich bleiben',
          })
          isReturningToPosition.value = false
          isOutsideHome.value = false
        }, 300)
      }
    }

    // 🆕 NEU: Container-Validierung
    const withinDesignatedZoneContainer = (event) => {
      // Prüfe, ob das Drop-Ziel innerhalb eines erlaubten Containers ist
      const target = event.relatedTarget || event.target
      if (!target) return false

      // Erlaubte Container-IDs
      const allowedContainers = [
        'zone-container',
        'unified-interaction-zone',
        'comparison-zone',
        'logic-zone',
      ]

      // Prüfe, ob das Ziel oder ein Elternelement ein erlaubter Container ist
      let currentElement = target
      while (currentElement && currentElement !== document.body) {
        if (currentElement.id && allowedContainers.includes(currentElement.id)) {
          return true
        }
        if (currentElement.className && typeof currentElement.className === 'string') {
          // Prüfe auch CSS-Klassen
          if (allowedContainers.some((container) => currentElement.className.includes(container))) {
            return true
          }
        }
        currentElement = currentElement.parentElement
      }

      return false
    }

    // 🆕 NEU: Context Menu State
    const showContextMenu = ref(false)
    const contextMenuData = ref({ type: null, data: null })
    const contextMenuPosition = ref({ x: 0, y: 0 })

    // ✅ KORRIGIERT: Entfernung der ungenutzten computed properties
    // Die Daten werden jetzt über die bestehenden computed properties in der Options API verwendet

    // ✅ KORRIGIERT: Sichere Lifecycle-Handler
    onMounted(() => {
      // ✅ NEU: DOM-Ready-Check vor Store-Operationen
      nextTick(() => {
        try {
          if (!zoneRegistry.value.registerZoneInstance(props.zone.id, 'ZoneCard')) {
            console.warn(`Zone ${props.zone.id} wird bereits dargestellt`)
          }

          // ✅ NEU: Sichere Store-Synchronisation
          syncStores(true)
          measureRenderPerformance()
        } catch (error) {
          console.error('ZoneCard mount error:', error)
        }
      })
    })

    onUnmounted(() => {
      // ✅ NEU: Sichere Cleanup-Operationen
      try {
        zoneRegistry.value.unregisterZoneInstance(props.zone.id)

        if (storeSyncState.value.syncTimeout) {
          clearTimeout(storeSyncState.value.syncTimeout)
        }
      } catch (error) {
        console.error('ZoneCard unmount error:', error)
      }
    })

    // 🆕 NEU: Erweiterte Drag & Drop Handler
    const handleDragOver = (event) => {
      event.preventDefault()
      isDragOver.value = true
    }

    const handleDrop = (event) => {
      event.preventDefault()
      isDragOver.value = false

      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'))

        // 🆕 NEU: Intelligente Drop-Logik
        if (data.type === 'zone' && data.zoneId !== props.zone.id) {
          // Zone-zu-Zone Vergleich
          emit('zone-comparison', {
            sourceZone: data,
            targetZone: props.zone,
          })
        } else if (data.type === 'sensor') {
          // Sensor zu Zone hinzufügen
          emit('sensor-add', {
            sensor: data,
            targetZone: props.zone,
          })
        } else if (data.type === 'actuator') {
          // Aktor zu Zone hinzufügen
          emit('actuator-add', {
            actuator: data,
            targetZone: props.zone,
          })
        }
      } catch (error) {
        console.error('Drop handling failed:', error)
      }
    }

    // 🆕 NEU: Sensor-Status mit Frequenz-Validierung
    const getSensorStatus = (sensor) => {
      if (!sensor.lastReading) {
        return { status: 'unknown', health: 'unknown' }
      }

      return validateSensorStatus(sensor, sensor.lastReading)
    }

    // 🆕 NEU: Health-Warning nur für schnelle Sensoren
    const shouldShowSensorWarning = (sensor) => {
      return shouldShowHealthWarning(sensor)
    }

    // 🆕 NEU: Context Menu Handler
    const handleContextMenu = (event, type, data) => {
      event.preventDefault()
      contextMenuData.value = { type, data }
      contextMenuPosition.value = { x: event.clientX, y: event.clientY }
      showContextMenu.value = true
    }

    const handleContextMenuAction = ({ action, data }) => {
      switch (action) {
        case 'configure':
          // Zone konfigurieren
          break
        case 'compare':
          // Zum Vergleich hinzufügen
          emit('zone-comparison', { sourceZone: data, targetZone: props.zone })
          break
        case 'favorite':
          // Als Favorit markieren
          break
        default:
          console.log('Context menu action:', action, data)
      }
    }

    // 🆕 NEU: Klarnamen-Funktionen
    const getZoneDisplayName = (zone) => {
      return zone.name || `Zone ${zone.espId}`
    }

    const getZoneStatusLabel = (status) => {
      const labels = {
        online: 'Online',
        offline: 'Offline',
        error: 'Fehler',
        maintenance: 'Wartung',
      }
      return labels[status] || status
    }

    const getSensorDisplayName = (type) => {
      const names = {
        TEMP_DS18B20: '🌡️ Temperatur',
        HUMIDITY_DHT22: '💧 Luftfeuchte',
        MOISTURE_GENERIC: '💧 Bodenfeuchte',
        LIGHT_LDR: '☀️ Lichtstärke',
        PRESSURE_BMP280: '🌪️ Luftdruck',
      }
      return names[type] || type
    }

    // 🆕 NEU: Card Click Handler
    const handleCardClick = (event) => {
      // Verhindere Click bei Drag & Drop
      if (isZoneDragging.value) return

      // Emit click event für parent component
      emit('card-click', { zone: props.zone, event })
    }

    return {
      mqttStore,
      zonesStore,
      centralDataHub,
      responsiveDisplay,
      storeSyncState,
      performanceMetrics,
      syncStores,
      updateCrossStoreData,
      measureCachePerformance,
      isZoneDragging,
      isDragOver,
      isReturningToPosition,
      showContextMenu,
      contextMenuData,
      contextMenuPosition,
      handleZoneDragStart,
      handleZoneDragEnd,
      handleDragOver,
      handleDrop,
      handleContextMenu,
      handleContextMenuAction,
      handleCardClick,
      getSensorStatus,
      shouldShowSensorWarning,
      getZoneDisplayName,
      getZoneStatusLabel,
      getSensorDisplayName,
      getEspAggregations,
      getEspAggregationsWithTimeWindow,
      getSensorColor,
      getSensorIcon,
      formatAggregationValue,
      getDynamicActuatorCols,
      getConfigureButtonTooltip,
      getConfigureAction,
      getActionButton,
      handleAction,
    }
  },

  data() {
    return {
      refreshing: false,
      showError: false,
      errorMessage: '',
    }
  },

  computed: {
    // ✅ OPTIMIERT: Caching-Integration mit CentralDataHub
    zoneSensors() {
      if (!this.zone?.espId) return []

      return this.centralDataHub.getCachedData(
        `zone-sensors-${this.zone.espId}`,
        () => {
          const device = this.mqttStore.value.espDevices.get(this.zone.espId)
          return device?.sensors ? Array.from(device.sensors.values()) : []
        },
        30 * 1000, // 30 Sekunden Cache
      )
    },

    zoneActuators() {
      if (!this.zone?.espId) return []

      return this.centralDataHub.getCachedData(
        `zone-actuators-${this.zone.espId}`,
        () => {
          const device = this.mqttStore.value.espDevices.get(this.zone.espId)
          return device?.actuators ? Array.from(device.actuators.values()) : []
        },
        30 * 1000, // 30 Sekunden Cache
      )
    },

    subZones() {
      return this.zone?.subZones ? Array.from(this.zone.subZones.values()) : []
    },

    zoneAggregations() {
      if (!this.showAggregations || !this.zone.espId) return []

      return this.centralDataHub.getCachedData(
        `zone-aggregations-${this.zone.espId}-${this.timeWindow}`,
        () => {
          return this.getEspAggregationsWithTimeWindow(this.zone.espId, this.timeWindow)
        },
        60 * 1000, // 60 Sekunden Cache
      )
    },
  },

  methods: {
    // ✅ ERWEITERT: Performance-Monitoring und Retry-Logik
    async handleActuatorToggle(gpio, state) {
      const startTime = performance.now()
      const maxRetries = 3
      let retryCount = 0

      const attemptToggle = async () => {
        try {
          await this.mqttStore.value.sendActuatorCommand(this.zone.espId, gpio, state)

          // ✅ NEU: Performance-Monitoring
          const duration = performance.now() - startTime
          if (duration > 1000) {
            console.warn(`Slow actuator toggle: ${duration.toFixed(2)}ms`)
            window.$snackbar?.showWarning('Aktor-Steuerung war langsam - prüfen Sie die Verbindung')
          }

          window.$snackbar?.showSuccess(`Aktor ${state ? 'aktiviert' : 'deaktiviert'}`)

          // ✅ NEU: Cross-Store-Update mit Race-Condition-Schutz
          await this.updateCrossStoreData('actuator', {
            gpio,
            state,
            espId: this.zone.espId,
            timestamp: Date.now(),
          })
        } catch (error) {
          retryCount++

          // ✅ NEU: Erweiterte Error-Kategorien
          const errorCategory = this.categorizeError(error)

          if (retryCount < maxRetries && this.shouldRetry(errorCategory)) {
            console.warn(`Actuator toggle retry ${retryCount}/${maxRetries}:`, error.message)

            // Exponential backoff
            const delay = Math.pow(2, retryCount) * 1000
            await new Promise((resolve) => setTimeout(resolve, delay))

            return attemptToggle()
          }

          // Final error handling
          this.handleActuatorError(error, errorCategory, 'toggle', { gpio, state })
        }
      }

      await attemptToggle()
    },

    async handleActuatorValue(gpio, value) {
      const startTime = performance.now()
      const maxRetries = 2
      let retryCount = 0

      const attemptValueChange = async () => {
        try {
          await this.mqttStore.value.sendActuatorValue(this.zone.espId, gpio, value)

          // ✅ NEU: Performance-Monitoring
          const duration = performance.now() - startTime
          if (duration > 1500) {
            console.warn(`Slow actuator value change: ${duration.toFixed(2)}ms`)
            window.$snackbar?.showWarning('Aktor-Wertänderung war langsam')
          }

          window.$snackbar?.showSuccess(`Aktor-Wert auf ${value} gesetzt`)

          // ✅ NEU: Cross-Store-Update mit Race-Condition-Schutz
          await this.updateCrossStoreData('actuator', {
            gpio,
            value,
            espId: this.zone.espId,
            timestamp: Date.now(),
          })
        } catch (error) {
          retryCount++

          const errorCategory = this.categorizeError(error)

          if (retryCount < maxRetries && this.shouldRetry(errorCategory)) {
            console.warn(`Actuator value change retry ${retryCount}/${maxRetries}:`, error.message)

            const delay = Math.pow(2, retryCount) * 1000
            await new Promise((resolve) => setTimeout(resolve, delay))

            return attemptValueChange()
          }

          this.handleActuatorError(error, errorCategory, 'value', { gpio, value })
        }
      }

      await attemptValueChange()
    },

    handleLogicSaved() {
      window.$snackbar?.showSuccess('Aktor-Logik gespeichert')

      // ✅ NEU: Cross-Store-Update für Logik-Updates
      this.updateCrossStoreData('actuator', {
        espId: this.zone.espId,
        logic: 'updated',
        timestamp: Date.now(),
      })
    },

    async refreshStatus() {
      this.refreshing = true
      const startTime = performance.now()

      try {
        await this.mqttStore.value.refreshEspStatus(this.zone.espId)

        // ✅ NEU: Performance-Monitoring
        const duration = performance.now() - startTime
        if (duration > 2000) {
          console.warn(`Slow status refresh: ${duration.toFixed(2)}ms`)
          window.$snackbar?.showWarning('Status-Aktualisierung war langsam')
        }

        window.$snackbar?.showSuccess('Status aktualisiert')

        // ✅ NEU: Cross-Store-Update für Status-Updates
        await this.updateCrossStoreData('zone', {
          espId: this.zone.espId,
          status: 'refreshed',
          timestamp: Date.now(),
        })
      } catch (error) {
        console.error('Status refresh failed:', error)

        const errorCategory = this.categorizeError(error)
        this.handleStatusError(error, errorCategory)
      } finally {
        this.refreshing = false
      }
    },

    // ✅ NEU: Erweiterte Error-Kategorisierung
    categorizeError(error) {
      if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
        return 'timeout'
      }
      if (error.message?.includes('connection') || error.message?.includes('ECONNREFUSED')) {
        return 'connection'
      }
      if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
        return 'permission'
      }
      if (error.message?.includes('not found') || error.message?.includes('404')) {
        return 'not_found'
      }
      if (error.message?.includes('safe mode') || error.message?.includes('disabled')) {
        return 'safe_mode'
      }
      return 'unknown'
    },

    // ✅ NEU: Retry-Entscheidungslogik
    shouldRetry(errorCategory) {
      const retryableCategories = ['timeout', 'connection']
      return retryableCategories.includes(errorCategory)
    },

    // ✅ NEU: Spezialisierte Error-Handler
    handleActuatorError(error, category, action, details) {
      const errorMessages = {
        timeout: `Aktor-${action} Timeout - Verbindung zu langsam`,
        connection: `Aktor-${action} fehlgeschlagen - Keine Verbindung`,
        permission: `Aktor-${action} verweigert - Keine Berechtigung`,
        safe_mode: `Aktor-${action} blockiert - Safe Mode aktiv`,
        not_found: `Aktor nicht gefunden - GPIO ${details.gpio}`,
        unknown: `Aktor-${action} fehlgeschlagen - Unbekannter Fehler`,
      }

      const message = errorMessages[category] || errorMessages.unknown

      // ✅ NEU: Kontextabhängige Error-Aktionen
      if (category === 'safe_mode') {
        window.$snackbar?.showWarning(message, {
          action: {
            text: 'Konfigurieren',
            onClick: () => this.$router.push(`/zone/${this.zone.espId}/config`),
          },
        })
      } else if (category === 'connection') {
        // ✅ CLEAN CODE: Reconnect-Button entfernt - Auto-reconnect aktiv
        window.$snackbar?.showError(message + ' (Auto-reconnect aktiv)')
      } else {
        window.$snackbar?.showError(message)
      }

      // ✅ NEU: Error-Logging für Analytics
      this.logError('actuator', category, action, details, error)
    },

    handleStatusError(error, category) {
      const errorMessages = {
        timeout: 'Status-Aktualisierung Timeout',
        connection: 'Status-Aktualisierung fehlgeschlagen - Keine Verbindung',
        permission: 'Status-Aktualisierung verweigert',
        not_found: `ESP-Gerät ${this.zone.espId} nicht gefunden`,
        unknown: 'Status-Aktualisierung fehlgeschlagen',
      }

      const message = errorMessages[category] || errorMessages.unknown

      if (category === 'connection') {
        // ✅ CLEAN CODE: Reconnect-Button entfernt - Auto-reconnect aktiv
        window.$snackbar?.showError(message + ' (Auto-reconnect aktiv)')
      } else {
        window.$snackbar?.showError(message)
      }

      this.showError = true
      this.errorMessage = message

      this.logError('status', category, 'refresh', { espId: this.zone.espId }, error)
    },

    // ✅ NEU: Error-Logging für Performance-Analytics
    logError(type, category, action, details, error) {
      const errorLog = {
        timestamp: Date.now(),
        type,
        category,
        action,
        details,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        context: {
          espId: this.zone.espId,
          zoneId: this.zone.id,
          userAgent: navigator.userAgent,
          url: window.location.href,
        },
      }

      // ✅ NEU: Lokales Error-Logging
      console.error('Error logged:', errorLog)

      // ✅ NEU: Optional: Remote Error-Reporting
      if (this.shouldReportError(category)) {
        this.reportErrorToAnalytics(errorLog)
      }
    },

    // ✅ NEU: Error-Reporting-Entscheidung
    shouldReportError(category) {
      // Nur kritische Fehler remote reporten
      const criticalCategories = ['connection', 'permission', 'unknown']
      return criticalCategories.includes(category)
    },

    // ✅ NEU: Remote Error-Reporting (Platzhalter)
    reportErrorToAnalytics(errorLog) {
      // Hier könnte Integration mit Error-Tracking-Service erfolgen
      // z.B. Sentry, LogRocket, etc.
      console.log('Error reported to analytics:', errorLog)
    },
  },
})
</script>

<style scoped>
.zone-card {
  position: relative;
  transition: all 0.2s ease;
}

.zone-card.dragging {
  opacity: 0.7;
  transform: scale(0.98);
}

.zone-card.drag-over {
  transform: scale(1.02);
  box-shadow: 0 8px 25px rgba(33, 150, 243, 0.3);
}

/* 🆕 NEU: Soft-Fade Animation beim Zurückspringen */
.zone-card.returning-to-position {
  animation: softReturn 0.3s ease-out;
}

@keyframes softReturn {
  0% {
    transform: scale(0.98);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.01);
    opacity: 0.9;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.drop-zone-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(33, 150, 243, 0.1);
  border: 2px dashed #2196f3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 8px;
}

.drag-indicator {
  opacity: 0.6;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
}

.zone-card:hover .drag-indicator {
  opacity: 1;
}

/* Touch-optimierte Drag & Drop */
@media (max-width: 600px) {
  .zone-card {
    touch-action: pan-y;
  }

  .drag-indicator {
    opacity: 0.8; /* Besser sichtbar auf Touch */
  }

  .drop-zone-overlay {
    border-width: 3px; /* Dicker für Touch */
  }
}
</style>
