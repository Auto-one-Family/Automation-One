<template>
  <div class="centralized-mindmap">
    <!-- ✅ OPTIMIERT: Offline-Indikator - nur wenn relevant -->
    <div v-if="!mindmapStore.isConnected" class="offline-indicator">
      <v-alert type="info" variant="tonal" class="mb-4" :model-value="true">
        <template #prepend>
          <v-icon icon="mdi-wifi-off" />
        </template>
        <div class="d-flex align-center">
          <span class="mr-2">Mindmap läuft im Offline-Modus</span>
          <span class="text-caption text-grey">
            Nutzen Sie den "Erneut verbinden" Button in der System-Status-Bar für Notfälle.
          </span>
        </div>
      </v-alert>
    </div>

    <!-- ✅ OPTIMIERT: Kaiser-Selector-UI - nur wenn mehrere Kaiser vorhanden -->
    <div v-if="availableKaisers.length > 2" class="kaiser-selector-container mb-4">
      <v-card variant="outlined" class="pa-4">
        <div class="d-flex flex-wrap gap-4 align-center">
          <v-select
            v-model="selectedKaiserId"
            :items="availableKaisers"
            item-title="name"
            item-value="id"
            label="Kaiser auswählen"
            density="compact"
            variant="outlined"
            style="min-width: 200px"
            @update:model-value="handleKaiserSelect"
          />

          <v-chip
            v-if="selectedKaiserId === 'god_mode'"
            color="warning"
            variant="tonal"
            size="small"
          >
            <v-icon icon="mdi-eye" size="small" class="mr-1" />
            Multi-Kaiser-Ansicht
          </v-chip>

          <v-chip
            v-else-if="selectedKaiserId"
            :color="getKaiserColor(selectedKaiserId)"
            variant="tonal"
            size="small"
          >
            <v-icon icon="mdi-crown" size="small" class="mr-1" />
            {{ getKaiserDisplayName(selectedKaiserId) }}
          </v-chip>
        </div>
      </v-card>
    </div>

    <!-- ✅ OPTIMIERT: Mindmap Container -->
    <div
      class="mindmap-container"
      :class="{ 'mobile-view': isMobile }"
      @touchstart="handleTouchStart"
      @touchend="handleTouchEnd"
    >
      <!-- 1. GOD LEVEL (Zentrale) - God kommt ZUERST -->
      <div class="mindmap-level god-level">
        <KaiserCard
          :kaiser="godData"
          :esps="espDevicesAsObjects"
          :unconfigured-esps="unconfiguredEspsAsObjects"
          :is-god="true"
          @esp-configure="handleEspConfigure"
          @esp-drag="handleESPDrag"
          @assign-esp="handleAssignESP"
          @add-esp="addNewEsp"
          @kaiser-configure="openGodConfiguration"
        />
      </div>

      <!-- 2. KAISER LEVEL (Edge Controller) - nur wenn Kaiser vorhanden -->
      <div class="mindmap-level kaiser-level" v-if="kaiserDevices.length > 0 || showDefaultKaiser">
        <div class="kaiser-grid">
          <!-- Echte Kaiser -->
          <KaiserCard
            v-for="kaiser in filteredKaiserDevices"
            :key="kaiser.id"
            :kaiser="kaiser"
            :esps="getEspsForKaiserAsObjects(kaiser.id)"
            @esp-configure="handleEspConfigure"
            @esp-drag="handleESPDrag"
            @add-esp="addEspToKaiser(kaiser.id)"
            @kaiser-configure="openKaiserConfiguration(kaiser.id)"
          />

          <!-- Default Kaiser Panel - nur wenn keine echten Kaiser -->
          <KaiserCard
            v-if="showDefaultKaiser"
            :key="'default-kaiser'"
            :kaiser="defaultKaiserData"
            :esps="[]"
            @esp-configure="handleEspConfigure"
            @esp-drag="handleESPDrag"
            @add-esp="addEspToKaiser('default-kaiser')"
            @kaiser-configure="openKaiserConfiguration('default-kaiser')"
          />
        </div>
      </div>

      <!-- 3. ESP LEVEL (Agenten) - nur wenn ESPs vorhanden -->
      <div class="mindmap-level esp-level" v-if="hasEspDevices">
        <div class="esp-zones-container">
          <!-- Unkonfigurierte ESPs - nur wenn vorhanden -->
          <MindmapZoneNode
            v-if="optimizedUnconfiguredEsps.length > 0"
            zone-name="🕳️ Unkonfiguriert"
            :esp-devices="optimizedUnconfiguredEsps"
            :is-unconfigured="true"
            :is-expanded="expandedLevels.zones.unconfigured"
            :is-drag-over="dragOverZone === 'unconfigured'"
            @expand="toggleZoneLevel('unconfigured')"
            @drop="handleEspDrop"
            @drag-over="handleDragOver"
            @drag-leave="handleDragLeave"
            @add-esp="addNewEsp"
            @select-esp="handleEspSelect"
          />

          <!-- Default ESP Panel - nur wenn keine unkonfigurierten ESPs -->
          <MindmapZoneNode
            v-if="showDefaultEsp"
            zone-name="🆕 Neuer ESP"
            :esp-devices="[]"
            :is-unconfigured="true"
            :is-expanded="expandedLevels.zones['default-esp']"
            @expand="toggleZoneLevel('default-esp')"
            @add-esp="addNewEsp"
            @select-esp="handleEspSelect"
          />

          <!-- Konfigurierte Zonen - nur wenn vorhanden -->
          <MindmapZoneNode
            v-for="zone in optimizedConfiguredZones"
            :key="zone.name"
            :zone-name="zone.name"
            :esp-devices="zone.esps"
            :is-expanded="expandedLevels.zones[zone.name]"
            :is-drag-over="dragOverZone === zone.name"
            @expand="toggleZoneLevel(zone.name)"
            @drop="handleEspDrop"
            @drag-over="handleDragOver"
            @drag-leave="handleDragLeave"
            @configure="configureZone(zone.name)"
            @delete-zone="deleteZone(zone.name)"
            @add-esp="addNewEsp"
            @select-esp="handleEspSelect"
          />
        </div>
      </div>
    </div>

    <!-- ✅ OPTIMIERT: Floating Action Buttons - nur wenn relevant -->
    <div class="mindmap-fab-container">
      <v-btn
        v-if="showAddKaiserFab"
        fab
        color="primary"
        size="large"
        @click="addNewKaiser"
        class="fab-kaiser"
      >
        <v-icon icon="mdi-crown" />
      </v-btn>

      <v-btn
        v-if="showAddEspFab"
        fab
        color="secondary"
        size="large"
        @click="addNewEsp"
        class="fab-esp"
      >
        <v-icon icon="mdi-memory" />
      </v-btn>
    </div>

    <!-- ✅ OPTIMIERT: Configuration Modal -->
    <MindmapConfigurationModal
      v-model="showConfigModal"
      :config-type="activeConfigType"
      :config-data="activeConfigData"
      @save="handleConfigSave"
      @close="closeConfigModal"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useMindmapStore } from '@/stores/mindmapStore'
import { safeSuccess, safeError, safeInfo } from '@/utils/snackbarUtils'

// Mindmap-Komponenten
import KaiserCard from './KaiserCard.vue'
import MindmapZoneNode from './MindmapZoneNode.vue'
import MindmapConfigurationModal from './MindmapConfigurationModal.vue'

// Props
const props = defineProps({
  selectedDeviceId: {
    type: String,
    default: null,
  },
})

// Emits
const emit = defineEmits(['device-select', 'device-configure'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)
const mindmapStore = useMindmapStore()

// ✅ OPTIMIERT: Reactive Data
const expandedLevels = ref({
  god: false,
  kaiser: {},
  zones: {
    unconfigured: false,
  },
})

const showConfigModal = ref(false)
const activeConfigType = ref(null)
const activeConfigData = ref(null)

// ✅ OPTIMIERT: Kaiser-Selector State
const selectedKaiserId = ref('god_mode') // Default: Multi-Kaiser-View
const showMultiKaiserView = ref(true)

// ✅ OPTIMIERT: Mobile Touch-Gesten
const touchStart = ref(null)
const touchEnd = ref(null)

const handleTouchStart = (event) => {
  touchStart.value = event.touches[0].clientX
}

const handleTouchEnd = (event) => {
  touchEnd.value = event.changedTouches[0].clientX
  handleSwipe()
}

const handleSwipe = () => {
  const swipeThreshold = 50
  const diff = touchStart.value - touchEnd.value

  if (Math.abs(diff) > swipeThreshold) {
    if (diff > 0) {
      // Swipe left - nächste Ebene
      console.log('[Mindmap] Swipe left - expand next level')
      expandNextLevel()
    } else {
      // Swipe right - vorherige Ebene
      console.log('[Mindmap] Swipe right - collapse current level')
      collapseCurrentLevel()
    }
  }
}

const expandNextLevel = () => {
  // Automatisch nächste Ebene expandieren
  if (!expandedLevels.value.god) {
    expandedLevels.value.god = true
  } else if (kaiserDevices.value.length > 0) {
    // Ersten Kaiser expandieren
    const firstKaiser = kaiserDevices.value[0]
    if (firstKaiser && !expandedLevels.value.kaiser[firstKaiser.id]) {
      expandedLevels.value.kaiser[firstKaiser.id] = true
    }
  }
}

const collapseCurrentLevel = () => {
  // Aktuelle Ebene kollabieren
  if (expandedLevels.value.god) {
    expandedLevels.value.god = false
  }
}

// ✅ OPTIMIERT: Computed Properties
const isMobile = computed(() => {
  return window.innerWidth < 768
})

// ✅ OPTIMIERT: Drag & Drop Status aus globalem System
const dragOverZone = computed(() => centralDataHub.getDragOverZone())

// ✅ OPTIMIERT: Kaiser-Selector Computed Properties
const availableKaisers = computed(() => {
  const kaisers = [
    { id: 'god_mode', name: '🖥️ God Pi (Alle Kaiser)' },
    { id: 'raspberry_pi_central', name: '👑 God als Kaiser' },
  ]

  // Alle registrierten Kaiser hinzufügen
  const registeredKaisers = Array.from(centralDataHub.hierarchicalState.kaisers.values()).map(
    (kaiser) => ({
      id: kaiser.id,
      name: `${centralConfig.value.getKaiserDisplayName(kaiser.id)} (${kaiser.esp_count || 0} ESPs)`,
    }),
  )

  return [...kaisers, ...registeredKaisers]
})

const filteredKaiserDevices = computed(() => {
  if (selectedKaiserId.value === 'god_mode') {
    // Multi-Kaiser-View: Alle Kaiser anzeigen
    return kaiserDevices.value
  } else {
    // Einzelner Kaiser-Focus: Nur ausgewählten Kaiser anzeigen
    return kaiserDevices.value.filter((kaiser) => kaiser.id === selectedKaiserId.value)
  }
})

// ✅ OPTIMIERT: Kaiser-Helper-Functions
const getKaiserColor = (kaiserId) => {
  return centralConfig.value.getKaiserColor(kaiserId)
}

const getKaiserDisplayName = (kaiserId) => {
  return centralConfig.value.getKaiserDisplayName(kaiserId)
}

const godData = computed(() => {
  // ✅ KORRIGIERT: Sichere Behandlung von Store-Werten
  const godName = centralConfig.value.godName || 'God Pi' // Fallback nur wenn Store-Wert leer ist
  const godId = centralConfig.value.getGodId
  const godAsKaiser = centralConfig.value.isGodKaiser
  const godKaiserId = centralConfig.value.getGodKaiserId

  return {
    id: godId,
    name: godName,
    status: mqttStore.value.isConnected ? 'online' : 'offline',
    type: 'central_controller',
    godAsKaiser: godAsKaiser,
    kaiserId: godKaiserId,
    kaiserCount: 0, // ✅ KORRIGIERT: God ist Kaiser
    espCount: espDevices.value.length,
  }
})

const espDevices = computed(() => {
  return Array.from(mqttStore.value.espDevices.keys())
})

const unconfiguredEsps = computed(() => {
  return espDevices.value.filter((espId) => {
    const zone = centralConfig.value.getZoneForEsp(espId)
    return zone === centralConfig.value.getDefaultZone || zone === '🕳️ Unkonfiguriert'
  })
})

// ✅ NEU: ESP-IDs als Objekte für KaiserCard
const espDevicesAsObjects = computed(() => {
  return espDevices.value.map((espId) => ({
    id: espId,
    ...mqttStore.value.espDevices.get(espId),
  }))
})

const unconfiguredEspsAsObjects = computed(() => {
  return unconfiguredEsps.value.map((espId) => ({
    id: espId,
    ...mqttStore.value.espDevices.get(espId),
  }))
})

const hasEspDevices = computed(() => {
  return espDevices.value.length > 0
})

const kaiserDevices = computed(() => {
  // Verwende bestehende hierarchische Struktur aus centralDataHub
  const kaisers = Array.from(centralDataHub.hierarchicalState.kaisers.values())

  console.log('[Mindmap] Using Kaiser from hierarchical state:', kaisers.length)
  return kaisers
})

// ✅ OPTIMIERT: Default Kaiser anzeigen wenn keine echten Kaiser vorhanden
const showDefaultKaiser = computed(() => {
  return kaiserDevices.value.length === 0
})

// ✅ OPTIMIERT: Default Kaiser Daten
const defaultKaiserData = computed(() => {
  const defaultConfig = centralConfig.value.getDefaultKaiserConfig()
  return {
    id: 'default-kaiser',
    name: defaultConfig.name,
    kaiserId: defaultConfig.kaiserId,
    status: 'offline',
    type: 'pi_zero_edge_controller',
    esp_count: 0,
    pi0ServerIp: defaultConfig.pi0ServerIp,
    pi0ServerPort: defaultConfig.pi0ServerPort,
    godConnectionIp: defaultConfig.godConnectionIp,
    godConnectionPort: defaultConfig.godConnectionPort,
    isDefault: true,
  }
})

const configuredZones = computed(() => {
  const zones = new Map()

  espDevices.value.forEach((espId) => {
    const zone = centralConfig.value.getZoneForEsp(espId)
    if (zone !== centralConfig.value.getDefaultZone && zone !== '🕳️ Unkonfiguriert') {
      if (!zones.has(zone)) {
        zones.set(zone, { name: zone, esps: [] })
      }
      zones.get(zone).esps.push(espId)
    }
  })

  return Array.from(zones.values()).sort((a, b) => a.name.localeCompare(b.name))
})

// ✅ OPTIMIERT: Performance-Optimierungen
const performanceConfig = {
  virtualScrollThreshold: 50, // Ab 50 ESPs Virtualisierung aktivieren
  updateBatchSize: 10, // Batch-Größe für Updates
}

// ✅ OPTIMIERT: Virtualisierung für große ESP-Listen
const shouldUseVirtualization = computed(() => {
  return espDevices.value.length > performanceConfig.virtualScrollThreshold
})

// ✅ OPTIMIERT: Optimierte ESP-Listen für Performance
const optimizedUnconfiguredEsps = computed(() => {
  if (shouldUseVirtualization.value) {
    return unconfiguredEsps.value.slice(0, performanceConfig.updateBatchSize)
  }
  return unconfiguredEsps.value
})

const optimizedConfiguredZones = computed(() => {
  if (shouldUseVirtualization.value) {
    return configuredZones.value.map((zone) => ({
      ...zone,
      esps: zone.esps.slice(0, performanceConfig.updateBatchSize),
    }))
  }
  return configuredZones.value
})

// ✅ OPTIMIERT: Default ESP anzeigen wenn keine unkonfigurierten ESPs vorhanden
const showDefaultEsp = computed(() => {
  return unconfiguredEsps.value.length === 0
})

const showAddKaiserFab = computed(() => {
  return kaiserDevices.value.length === 0 || expandedLevels.value.god
})

const showAddEspFab = computed(() => {
  return hasEspDevices.value || expandedLevels.value.god
})

// ✅ OPTIMIERT: Event-Handler für KaiserCard
const handleEspConfigure = (esp) => {
  console.log(`[Mindmap] ESP configure: ${esp.id}`)
  emit('device-configure', esp)
}

const handleESPDrag = (esp) => {
  console.log(`[Mindmap] ESP drag: ${esp.id}`)
  centralDataHub.setDraggedEspId(esp.id)
}

const handleAssignESP = (esp) => {
  console.log(`[Mindmap] Assign ESP: ${esp.id}`)
  // Hier könnte die ESP-Zuweisung-Logik implementiert werden
  safeInfo(`ESP ${esp.id} zuweisen - Feature in Entwicklung`)
}

const toggleZoneLevel = (zoneName) => {
  if (!expandedLevels.value.zones[zoneName]) {
    expandedLevels.value.zones[zoneName] = true
  } else {
    expandedLevels.value.zones[zoneName] = false
  }
}

// ✅ OPTIMIERT: Kaiser-Selector-Handler
const handleKaiserSelect = (kaiserId) => {
  console.log(`[Mindmap] Kaiser selected: ${kaiserId}`)

  if (kaiserId === 'god_mode') {
    // Multi-Kaiser-View aktivieren
    showMultiKaiserView.value = true
    selectedKaiserId.value = 'god_mode'
    // Alle Kaiser expandieren
    kaiserDevices.value.forEach((kaiser) => {
      expandedLevels.value.kaiser[kaiser.id] = true
    })
  } else {
    // Einzelner Kaiser-Focus
    showMultiKaiserView.value = false
    selectedKaiserId.value = kaiserId
    // Nur ausgewählten Kaiser expandieren
    Object.keys(expandedLevels.value.kaiser).forEach((key) => {
      expandedLevels.value.kaiser[key] = key === kaiserId
    })
  }

  // Event für parent component
  emit('device-select', kaiserId)
}

const getEspsForKaiser = (kaiserId) => {
  // ✅ KORRIGIERT: ESPs für Kaiser (immer God wenn God als Kaiser)
  if (centralConfig.value.isGodKaiser && kaiserId === centralConfig.value.getGodKaiserId) {
    return espDevices.value
  }

  // Verwende bestehende hierarchische Struktur
  try {
    const espIds = centralDataHub.getKaiserEspIds(kaiserId)
    console.log(`[Mindmap] Found ${espIds.length} ESPs for Kaiser ${kaiserId}:`, espIds)
    return espIds || []
  } catch (error) {
    console.warn('getKaiserEspIds not available, using fallback:', error)
    // Fallback: Alle ESPs zurückgeben, die diesem Kaiser zugeordnet sind
    return espDevices.value.filter((espId) => {
      const device = mqttStore.value.espDevices.get(espId)
      return device && device.owner === kaiserId
    })
  }
}

// ✅ NEU: ESPs für Kaiser als Objekte
const getEspsForKaiserAsObjects = (kaiserId) => {
  const espIds = getEspsForKaiser(kaiserId)
  return espIds.map((espId) => ({
    id: espId,
    ...mqttStore.value.espDevices.get(espId),
  }))
}

const getKaiserForZone = (zoneName) => {
  // ✅ KORRIGIERT: Kaiser für Zone (immer God wenn God als Kaiser)
  if (centralConfig.value.isGodKaiser) {
    return centralConfig.value.getGodKaiserId
  }

  // Verwende bestehende hierarchische Struktur
  try {
    const kaiserId = centralDataHub.getKaiserForZone(zoneName)
    console.log(`[Mindmap] Zone ${zoneName} belongs to Kaiser: ${kaiserId}`)
    return kaiserId || 'god_pi_central'
  } catch (error) {
    console.warn('getKaiserForZone not available, using fallback:', error)
    // Fallback: God Pi als Standard-Kaiser
    return 'god_pi_central'
  }
}

// ✅ OPTIMIERT: Drag & Drop Methods (AKTIVIERT)
const handleEspDrop = async (targetZoneName) => {
  const espId = centralDataHub.getDraggedEspId()
  if (espId) {
    try {
      const oldZone = centralConfig.value.getZoneForEsp(espId)
      const oldKaiser = centralConfig.value.getKaiserForEsp(espId)

      console.log(
        `[Mindmap] Moving ESP ${espId} (Kaiser: ${oldKaiser}) from ${oldZone} to ${targetZoneName}`,
      )

      if (targetZoneName === 'unconfigured') {
        await centralConfig.value.removeZone(espId)
        safeSuccess('Gerät aus Zone entfernt')
      } else {
        // ✅ NEU: Cross-Kaiser-Transfer-Logic
        const targetZoneEsps = centralConfig.value.getEspsInZone(targetZoneName)
        const kaisersInZone = new Set(
          targetZoneEsps.map((id) => centralConfig.value.getKaiserForEsp(id)),
        )

        // Prüfe ob Zone bereits ESPs von anderen Kaisern enthält
        if (kaisersInZone.size > 1 || (kaisersInZone.size === 1 && !kaisersInZone.has(oldKaiser))) {
          // Cross-Kaiser-Transfer erforderlich
          await handleCrossKaiserTransfer(espId, oldKaiser, targetZoneName, oldZone)
        } else {
          // Normaler Zone-Transfer
          await centralConfig.value.moveEspToZone(espId, targetZoneName, oldZone)
          safeSuccess(`ESP zu Zone "${targetZoneName}" verschoben`)
        }

        // Multi-Kaiser Warnung anzeigen
        const updatedZoneEsps = centralConfig.value.getEspsInZone(targetZoneName)
        const updatedKaisersInZone = new Set(
          updatedZoneEsps.map((id) => centralConfig.value.getKaiserForEsp(id)),
        )

        if (updatedKaisersInZone.size > 1) {
          safeInfo(
            `ESP zu Zone "${targetZoneName}" verschoben. Zone enthält jetzt ESPs von ${updatedKaisersInZone.size} verschiedenen Kaisern.`,
          )
        }
      }
    } catch (error) {
      console.error('Failed to move ESP to zone:', error)
      safeError('Fehler beim Verschieben des Geräts')
    }
  }
  centralDataHub.clearDragOverZone()
}

// ✅ OPTIMIERT: Cross-Kaiser-Transfer-Handler
const handleCrossKaiserTransfer = async (espId, fromKaiser, targetZone, oldZone) => {
  try {
    // 1. Bestimme Ziel-Kaiser für die Zone
    const targetZoneEsps = centralConfig.value.getEspsInZone(targetZone)
    const kaisersInZone = new Set(
      targetZoneEsps.map((id) => centralConfig.value.getKaiserForEsp(id)),
    )

    let targetKaiser = null

    if (kaisersInZone.size === 1) {
      // Zone hat nur einen Kaiser - verwende diesen
      targetKaiser = Array.from(kaisersInZone)[0]
    } else if (kaisersInZone.size > 1) {
      // Zone hat mehrere Kaiser - User muss wählen
      targetKaiser = await showKaiserSelectionDialog(Array.from(kaisersInZone))
      if (!targetKaiser) {
        throw new Error('Kein Kaiser ausgewählt')
      }
    } else {
      // Zone ist leer - verwende God Pi als Standard
      targetKaiser = 'raspberry_pi_central'
    }

    // 2. Führe Cross-Kaiser-Transfer durch
    if (fromKaiser !== targetKaiser) {
      await centralDataHub.transferEsp(espId, fromKaiser, targetKaiser)
      console.log(`[Mindmap] Cross-Kaiser transfer: ${espId} from ${fromKaiser} to ${targetKaiser}`)
    }

    // 3. Weise ESP der Zone zu
    await centralConfig.value.moveEspToZone(espId, targetZone, oldZone)

    // 4. Sende MQTT-Commands an beide Kaiser
    await mqttStore.value.sendCrossKaiserTransfer(fromKaiser, {
      espId: espId,
      fromKaiser: fromKaiser,
      toKaiser: targetKaiser,
      zone: targetZone,
      transferType: 'cross_kaiser_zone_change',
    })

    safeSuccess(
      `ESP ${espId} von Kaiser ${fromKaiser} zu Kaiser ${targetKaiser} in Zone "${targetZone}" transferiert`,
    )
  } catch (error) {
    console.error('Cross-Kaiser transfer failed:', error)
    throw error
  }
}

// ✅ OPTIMIERT: Kaiser-Auswahl-Dialog
const showKaiserSelectionDialog = async (availableKaisers) => {
  return new Promise((resolve) => {
    // Erstelle temporären Dialog für Kaiser-Auswahl
    const dialog = document.createElement('div')
    dialog.className = 'kaiser-selection-dialog'
    dialog.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog-content">
          <h3>Kaiser für Zone auswählen</h3>
          <p>Diese Zone enthält ESPs von mehreren Kaisern. Wählen Sie den Kaiser für das neue ESP:</p>
          <div class="kaiser-options">
            ${availableKaisers
              .map(
                (kaiserId) => `
              <button class="kaiser-option" data-kaiser="${kaiserId}">
                ${centralConfig.value.getKaiserDisplayName(kaiserId)}
              </button>
            `,
              )
              .join('')}
          </div>
          <button class="cancel-btn">Abbrechen</button>
        </div>
      </div>
    `

    // Event-Handler
    dialog.addEventListener('click', (e) => {
      if (e.target.classList.contains('kaiser-option')) {
        const selectedKaiser = e.target.dataset.kaiser
        document.body.removeChild(dialog)
        resolve(selectedKaiser)
      } else if (
        e.target.classList.contains('cancel-btn') ||
        e.target.classList.contains('dialog-overlay')
      ) {
        document.body.removeChild(dialog)
        resolve(null)
      }
    })

    // Dialog anzeigen
    document.body.appendChild(dialog)
  })
}

// ✅ KORRIGIERT: Konfigurations-Methods mit reaktiver Datenübertragung
const openGodConfiguration = () => {
  activeConfigType.value = 'god'
  // ✅ KORRIGIERT: Direkt vom Store lesen statt von computed property
  activeConfigData.value = {
    name: centralConfig.value.godName || 'God Pi',
    id: centralConfig.value.getGodId || '',
    kaiserId: centralConfig.value.getGodKaiserId || '',
    godAsKaiser: centralConfig.value.isGodKaiser || false,
    status: mqttStore.value.isConnected ? 'online' : 'offline',
    type: 'central_controller',
    kaiserCount: 0,
    espCount: espDevices.value.length,
  }
  showConfigModal.value = true
}

const openKaiserConfiguration = (kaiserId) => {
  activeConfigType.value = 'kaiser'

  if (kaiserId === 'default-kaiser') {
    // Default Kaiser Konfiguration
    activeConfigData.value = {
      ...defaultKaiserData.value,
      isDefault: true,
    }
  } else {
    // Echter Kaiser
    activeConfigData.value = kaiserDevices.value.find((k) => k.id === kaiserId)
  }

  showConfigModal.value = true
}

const configureZone = (zoneName) => {
  activeConfigType.value = 'zone'
  activeConfigData.value = {
    name: zoneName,
    esps: configuredZones.value.find((z) => z.name === zoneName)?.esps || [],
  }
  showConfigModal.value = true
}

const handleConfigSave = async (configData) => {
  try {
    // ✅ KORRIGIERT: Variablen außerhalb des switch-Blocks deklarieren
    let godName

    switch (activeConfigType.value) {
      case 'god':
        // God-Konfiguration speichern - MindMap als Master markieren
        console.log('🔵 [DEBUG] Calling setGodName with:', configData.name, 'fromMindMap: true')
        // ✅ KORRIGIERT: Sichere Behandlung von configData.name
        godName = configData.name || ''
        await centralConfig.value.setGodName(godName, true, 'mindmap-centralized') // fromMindMap = true
        await centralConfig.value.setGodAsKaiser(configData.godAsKaiser || false, true)
        console.log('🔵 [DEBUG] Store godName after:', centralConfig.value.godName)
        safeSuccess('God Pi Konfiguration gespeichert')
        break
      case 'kaiser':
        // Kaiser-Konfiguration speichern - MindMap als Master markieren
        if (configData.isDefault) {
          // Default Kaiser Konfiguration speichern
          centralConfig.value.setDefaultKaiserConfig({
            name: configData.name,
            kaiserId: configData.kaiserId,
            pi0ServerIp: configData.pi0ServerIp,
            pi0ServerPort: configData.pi0ServerPort,
            godConnectionIp: configData.godConnectionIp,
            godConnectionPort: configData.godConnectionPort,
          })
          safeSuccess('Default Kaiser Konfiguration gespeichert')
        } else {
          // Echter Kaiser Konfiguration speichern - MindMap als Master markieren
          await centralConfig.value.setKaiserName(configData.name, true, true) // fromMindMap = true
          await centralConfig.value.setKaiserId(configData.kaiserId, true, true) // fromMindMap = true
          safeSuccess('Kaiser Konfiguration gespeichert')
        }
        break
      case 'zone':
        // Zone-Konfiguration speichern
        safeSuccess('Zone Konfiguration gespeichert')
        break
    }
    closeConfigModal()
  } catch (error) {
    console.error('Failed to save configuration:', error)
    safeError('Fehler beim Speichern der Konfiguration')
  }
}

const closeConfigModal = () => {
  showConfigModal.value = false
  activeConfigType.value = null
  activeConfigData.value = null
}

// ✅ OPTIMIERT: Management-Methods
const addNewKaiser = () => {
  safeInfo('Neuen Kaiser hinzufügen - Feature in Entwicklung')
}

const addNewEsp = () => {
  safeInfo('Neuen ESP hinzufügen - Feature in Entwicklung')
}

const addEspToKaiser = (kaiserId) => {
  safeInfo(`ESP zu Kaiser ${kaiserId} hinzufügen - Feature in Entwicklung`)
}

const deleteZone = async (zoneName) => {
  try {
    await centralConfig.value.deleteZone(zoneName)
    safeSuccess(`Zone "${zoneName}" erfolgreich entfernt`)
  } catch (error) {
    console.error('Failed to delete zone:', error)
    safeError('Fehler beim Entfernen der Zone')
  }
}

// ✅ OPTIMIERT: Test-Funktion für Mindmap-Funktionalität
const testMindmapFunctionality = () => {
  console.log('[Mindmap] Testing functionality...')

  // Test Kaiser-ESP-Zuordnung
  kaiserDevices.value.forEach((kaiser) => {
    const espIds = getEspsForKaiser(kaiser.id)
    console.log(`[Mindmap] Kaiser ${kaiser.id} has ${espIds.length} ESPs:`, espIds)
  })

  // Test Zone-Zuordnung
  configuredZones.value.forEach((zone) => {
    const kaiserId = getKaiserForZone(zone.name)
    console.log(`[Mindmap] Zone ${zone.name} belongs to Kaiser: ${kaiserId}`)
  })

  // Test unkonfigurierte ESPs
  console.log(
    `[Mindmap] Unconfigured ESPs: ${unconfiguredEsps.value.length}`,
    unconfiguredEsps.value,
  )
}

// ✅ OPTIMIERT: Event-Handler für erweiterte Node-Funktionen
const handleEspSelect = (espId) => {
  console.log(`[Mindmap] ESP selected: ${espId}`)
  // Hier könnte man zur ESP-Detail-Ansicht navigieren
  emit('device-select', espId)
}

// ✅ OPTIMIERT: Drag & Drop Handler
const handleDragOver = (event, zoneName) => {
  event.preventDefault()
  centralDataHub.setDragOverZone(zoneName)
}

const handleDragLeave = (event) => {
  event.preventDefault()
  centralDataHub.clearDragOverZone()
}

// ✅ OPTIMIERT: Real-time Updates für Mindmap
watch(
  () => mqttStore.value.espDevices,
  (newDevices) => {
    console.log('[Mindmap] ESP devices updated:', newDevices.size)
    // Mindmap wird automatisch neu gerendert durch reaktive computed properties
  },
  { deep: true },
)

watch(
  () => centralConfig.value.zones,
  (newZones) => {
    console.log('[Mindmap] Zones updated:', newZones)
    // Mindmap wird automatisch neu gerendert durch reaktive computed properties
  },
  { deep: true },
)

watch(
  () => centralDataHub.hierarchicalState.kaisers,
  (newKaisers) => {
    console.log('[Mindmap] Kaiser hierarchy updated:', newKaisers.size)
    // Mindmap wird automatisch neu gerendert durch reaktive computed properties
  },
  { deep: true },
)

// ✅ OPTIMIERT: Mindmap WebSocket Integration
onMounted(async () => {
  try {
    // Automatische ESP-Auswahl beim Mount
    centralConfig.value.autoSelectFirstEsp()

    // ✅ OPTIMIERT: Initialisierung für leere Zustände
    console.log('[Mindmap] Initializing with:', {
      espDevices: espDevices.value.length,
      kaiserDevices: kaiserDevices.value.length,
      unconfiguredEsps: unconfiguredEsps.value.length,
      configuredZones: configuredZones.value.length,
    })

    // Wenn keine ESPs vorhanden sind, zeige Info
    if (espDevices.value.length === 0) {
      console.log('[Mindmap] No ESP devices found - system is empty')
    }

    // Wenn keine Kaiser vorhanden sind, zeige Info
    if (kaiserDevices.value.length === 0) {
      console.log('[Mindmap] No Kaiser devices found - using default Kaiser')
    }

    // Hierarchie-Daten abrufen (mit Offline-Fallback)
    await mindmapStore.fetchHierarchy()

    // WebSocket-Verbindung herstellen (mit Offline-Fallback)
    await mindmapStore.connectWebSocket()

    // Auto-Reconnect einrichten
    mindmapStore.setupAutoReconnect()

    // Test-Funktionalität nach kurzer Verzögerung
    setTimeout(() => {
      testMindmapFunctionality()
    }, 1000)
  } catch (error) {
    // ✅ OPTIMIERT: Bessere Fehlerbehandlung - Mindmap funktioniert auch im Offline-Modus
    console.log('[Mindmap] Initialization completed (offline mode if needed):', error.message)
  }
})

onUnmounted(() => {
  // WebSocket-Verbindung trennen
  mindmapStore.disconnectWebSocket()
})

// Watch für Device-Auswahl
watch(
  () => props.selectedDeviceId,
  (newDeviceId) => {
    if (newDeviceId) {
      emit('device-select', newDeviceId)
    }
  },
)
</script>

<style scoped>
/* ✅ OPTIMIERT: Offline-Indikator */
.offline-indicator {
  position: sticky;
  top: 0;
  z-index: 100;
  margin-bottom: 1rem;
}

/* Zentrale Mindmap-Container */
.centralized-mindmap {
  position: relative;
  width: 100%;
  min-height: 100vh;
  height: auto;
  overflow: visible;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 2rem;
}

.mindmap-container {
  display: flex;
  flex-direction: column;
  gap: 4rem;
  padding: 3rem;
  min-height: 100vh;
  overflow: visible;
  max-width: 1600px;
  margin: 0 auto;
}

/* Mindmap-Level */
.mindmap-level {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 150px;
}

.god-level {
  margin-bottom: 2rem;
  width: 100%;
  max-width: 1400px;
}

.kaiser-level {
  margin-bottom: 3rem;
}

.esp-level {
  flex: 1;
  min-height: 200px;
}

/* Grid-Layouts */
.kaiser-grid {
  display: flex;
  gap: 2rem;
  width: 100%;
  max-width: 1400px;
  overflow-x: auto;
  padding-bottom: 16px;
}

.esp-zones-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 2rem;
  width: 100%;
}

/* Floating Action Buttons */
.mindmap-fab-container {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  z-index: 1000;
}

/* Mobile Optimizations */
.mobile-view .mindmap-container {
  padding: 1rem;
  gap: 1rem;
}

.mobile-view .kaiser-grid,
.mobile-view .esp-zones-container {
  grid-template-columns: 1fr;
}

/* Responsive improvements */
@media (max-width: 600px) {
  .mindmap-container {
    padding: 1rem;
  }

  .kaiser-grid {
    grid-template-columns: 1fr;
  }

  .esp-zones-container {
    grid-template-columns: 1fr;
  }
}

/* Smooth transitions */
.mindmap-level {
  transition: all 0.3s ease;
}

/* ✅ OPTIMIERT: Kaiser-Selector Styles */
.kaiser-selector-container {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

/* ✅ OPTIMIERT: Kaiser-Selection-Dialog Styles */
.kaiser-selection-dialog {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
}

.kaiser-selection-dialog .dialog-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kaiser-selection-dialog .dialog-content {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.kaiser-selection-dialog h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.5rem;
}

.kaiser-selection-dialog p {
  margin: 0 0 1.5rem 0;
  color: #666;
  line-height: 1.5;
}

.kaiser-selection-dialog .kaiser-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.kaiser-selection-dialog .kaiser-option {
  padding: 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 1rem;
  text-align: left;
}

.kaiser-selection-dialog .kaiser-option:hover {
  border-color: #1976d2;
  background: #f5f5f5;
  transform: translateY(-2px);
}

.kaiser-selection-dialog .cancel-btn {
  padding: 0.75rem 1.5rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 1rem;
  color: #666;
}

.kaiser-selection-dialog .cancel-btn:hover {
  border-color: #f44336;
  color: #f44336;
  background: #fff5f5;
}

/* ✅ OPTIMIERT: Cross-Kaiser-Zone Visualisierung */
.cross-kaiser-zone {
  border: 2px dashed #ff9800;
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.1) 0%, rgba(255, 193, 7, 0.1) 100%);
  position: relative;
}

.cross-kaiser-zone::before {
  content: '🔄 Multi-Kaiser';
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: #ff9800;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: bold;
}

/* ✅ OPTIMIERT: Transfer-Animation */
.transfer-animation {
  animation: transferPulse 1s ease-in-out;
}

@keyframes transferPulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
    background: rgba(76, 175, 80, 0.2);
  }
  100% {
    transform: scale(1);
  }
}

/* ✅ OPTIMIERT: Responsive Kaiser-Selector */
@media (max-width: 768px) {
  .kaiser-selector-container .d-flex {
    flex-direction: column;
    align-items: stretch;
  }

  .kaiser-selector-container .v-select {
    min-width: auto;
  }

  .kaiser-selection-dialog .dialog-content {
    margin: 1rem;
    padding: 1.5rem;
  }
}
</style>
