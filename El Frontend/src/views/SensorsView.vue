<script setup lang="ts">
/**
 * SensorsView (with Actuators Tab)
 *
 * Combined view for Sensors and Actuators with tab navigation.
 * URL query parameter ?tab=actuators switches to actuators tab.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import type { QualityLevel } from '@/types'
import { getQualityLabel } from '@/utils/labels'
import {
  Thermometer,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Power,
  Plus,
  Pencil,
  Trash2,
  Check,
  Activity,
} from 'lucide-vue-next'
import { subzonesApi } from '@/api/subzones'
import { useZoneGrouping, ZONE_UNASSIGNED } from '@/composables/useZoneGrouping'
import EmergencyStopButton from '@/components/safety/EmergencyStopButton.vue'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import SensorConfigPanel from '@/components/esp/SensorConfigPanel.vue'
import ActuatorConfigPanel from '@/components/esp/ActuatorConfigPanel.vue'
import SensorCard from '@/components/devices/SensorCard.vue'
import ActuatorCard from '@/components/devices/ActuatorCard.vue'

type TabType = 'sensors' | 'actuators'
type ActuatorStateFilter = 'on' | 'off' | 'emergency'

const route = useRoute()
const router = useRouter()
const espStore = useEspStore()

// =============================================================================
// Tab State
// =============================================================================
const activeTab = ref<TabType>('sensors')

// Initialize from URL query parameter
watch(
  () => route.query.tab,
  (tab) => {
    if (tab === 'actuators') {
      activeTab.value = 'actuators'
    } else {
      activeTab.value = 'sensors'
    }
  },
  { immediate: true }
)

// Switch tab and update URL
function setActiveTab(tab: TabType) {
  activeTab.value = tab
  const query = tab === 'actuators' ? { tab: 'actuators' } : {}
  router.replace({ path: '/sensors', query })
}

// Accordion collapse state (default: all expanded, so empty = none collapsed)
const collapsedZones = ref<Set<string>>(new Set())
const collapsedSubzones = ref<Set<string>>(new Set())

function toggleZone(zoneKey: string) {
  if (collapsedZones.value.has(zoneKey)) {
    collapsedZones.value.delete(zoneKey)
  } else {
    collapsedZones.value.add(zoneKey)
  }
  collapsedZones.value = new Set(collapsedZones.value)
}
function toggleSubzone(subzoneKey: string) {
  if (collapsedSubzones.value.has(subzoneKey)) {
    collapsedSubzones.value.delete(subzoneKey)
  } else {
    collapsedSubzones.value.add(subzoneKey)
  }
  collapsedSubzones.value = new Set(collapsedSubzones.value)
}
function isZoneExpanded(zoneKey: string): boolean {
  return !collapsedZones.value.has(zoneKey)
}
function isSubzoneExpanded(subzoneKey: string): boolean {
  return !collapsedSubzones.value.has(subzoneKey)
}

// =============================================================================
// Subzone Management
// =============================================================================
const creatingSubzoneForZone = ref<string | null>(null)
const newSubzoneName = ref('')
const editingSubzoneId = ref<string | null>(null)
const editingSubzoneName = ref('')
const subzoneActionLoading = ref(false)

function startCreateSubzone(zoneId: string | null) {
  creatingSubzoneForZone.value = zoneId ?? ZONE_UNASSIGNED
  newSubzoneName.value = ''
}

function cancelCreateSubzone() {
  creatingSubzoneForZone.value = null
  newSubzoneName.value = ''
}

async function confirmCreateSubzone(zoneId: string | null) {
  if (!newSubzoneName.value.trim()) return
  subzoneActionLoading.value = true
  try {
    // Find an ESP in this zone to assign the subzone to
    const espInZone = espStore.devices.find(d => (d.zone_id || null) === zoneId)
    if (!espInZone) return
    const espId = espStore.getDeviceId(espInZone)
    const subzoneId = newSubzoneName.value.trim().toLowerCase().replace(/\s+/g, '_')
    await subzonesApi.assignSubzone(espId, {
      subzone_id: subzoneId,
      subzone_name: newSubzoneName.value.trim(),
      parent_zone_id: zoneId || undefined,
      assigned_gpios: [],
    })
    await espStore.fetchAll()
    cancelCreateSubzone()
  } catch {
    // Error handled by API interceptor
  } finally {
    subzoneActionLoading.value = false
  }
}

function startRenameSubzone(subzoneId: string, currentName: string) {
  editingSubzoneId.value = subzoneId
  editingSubzoneName.value = currentName
}

function cancelRenameSubzone() {
  editingSubzoneId.value = null
  editingSubzoneName.value = ''
}

async function saveSubzoneName(subzoneId: string, zoneId: string | null) {
  if (!editingSubzoneName.value.trim()) return
  subzoneActionLoading.value = true
  try {
    // Find an ESP that has this subzone
    const espWithSubzone = espStore.devices.find(d => d.subzone_id === subzoneId)
    if (!espWithSubzone) { cancelRenameSubzone(); return }
    const espId = espStore.getDeviceId(espWithSubzone)
    await subzonesApi.assignSubzone(espId, {
      subzone_id: subzoneId,
      subzone_name: editingSubzoneName.value.trim(),
      parent_zone_id: zoneId || undefined,
      assigned_gpios: [],
    })
    await espStore.fetchAll()
    cancelRenameSubzone()
  } catch {
    // Error handled by API interceptor
  } finally {
    subzoneActionLoading.value = false
  }
}

async function deleteSubzone(subzoneId: string) {
  if (!confirm(`Subzone "${subzoneId}" wirklich löschen?`)) return
  subzoneActionLoading.value = true
  try {
    // Find an ESP that has this subzone
    const espWithSubzone = espStore.devices.find(d => d.subzone_id === subzoneId)
    if (!espWithSubzone) return
    const espId = espStore.getDeviceId(espWithSubzone)
    await subzonesApi.removeSubzone(espId, subzoneId)
    await espStore.fetchAll()
  } catch {
    // Error handled by API interceptor
  } finally {
    subzoneActionLoading.value = false
  }
}

// =============================================================================
// SlideOver Config Panels
// =============================================================================
const showSensorPanel = ref(false)
const showActuatorPanel = ref(false)
const selectedSensorConfig = ref<{ espId: string; gpio: number; sensorType: string; unit: string } | null>(null)
const selectedActuatorConfig = ref<{ espId: string; gpio: number; actuatorType: string } | null>(null)

const lastClickedSensorName = ref<string | null>(null)

function openSensorConfig(sensor: { esp_id: string; gpio: number; sensor_type: string; unit: string; name?: string | null }) {
  lastClickedSensorName.value = sensor.name || sensor.sensor_type
  selectedSensorConfig.value = {
    espId: sensor.esp_id,
    gpio: sensor.gpio,
    sensorType: sensor.sensor_type,
    unit: sensor.unit,
  }
  showSensorPanel.value = true
}

// Zone of the currently selected sensor (for cross-navigation to monitor)
const selectedSensorZoneId = computed(() => {
  if (!selectedSensorConfig.value) return null
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === selectedSensorConfig.value!.espId)
  return device?.zone_id ?? null
})

function closeSensorPanel() {
  showSensorPanel.value = false
  setTimeout(() => { selectedSensorConfig.value = null }, 300)
}

function openActuatorConfig(actuator: { esp_id: string; gpio: number; actuator_type: string }) {
  selectedActuatorConfig.value = {
    espId: actuator.esp_id,
    gpio: actuator.gpio,
    actuatorType: actuator.actuator_type,
  }
  showActuatorPanel.value = true
}

function closeActuatorPanel() {
  showActuatorPanel.value = false
  setTimeout(() => { selectedActuatorConfig.value = null }, 300)
}

// =============================================================================
// Common Filter State
// =============================================================================
const showFilters = ref(false)
const filterEspId = ref('')

// Sensor-specific filters
const filterSensorType = ref<string[]>([])
const filterQuality = ref<QualityLevel[]>([])
const qualityLevels: QualityLevel[] = ['excellent', 'good', 'fair', 'poor', 'bad', 'stale']

// Actuator-specific filters
const filterActuatorType = ref<string[]>([])
const filterState = ref<ActuatorStateFilter[]>([])
const stateFilters: { value: ActuatorStateFilter; label: string }[] = [
  { value: 'on', label: 'Ein' },
  { value: 'off', label: 'Aus' },
  { value: 'emergency', label: 'Not-Stopp' },
]

// =============================================================================
// Available Filter Options (computed from data)
// =============================================================================
const availableEspIds = computed(() => {
  return espStore.devices.map(esp => espStore.getDeviceId(esp)).sort()
})

const availableSensorTypes = computed(() => {
  const types = new Set<string>()
  espStore.devices.forEach(esp => {
    if (esp.sensors) {
      (esp.sensors as { sensor_type: string }[]).forEach(sensor => types.add(sensor.sensor_type))
    }
  })
  return Array.from(types).sort()
})

const availableActuatorTypes = computed(() => {
  const types = new Set<string>()
  espStore.devices.forEach(esp => {
    if (esp.actuators) {
      (esp.actuators as { actuator_type: string }[]).forEach(actuator => types.add(actuator.actuator_type))
    }
  })
  return Array.from(types).sort()
})

// =============================================================================
// Lifecycle
// =============================================================================
onMounted(async () => {
  // Initial load via REST (WebSocket is handled by esp store)
  await espStore.fetchAll()

  // Deep-link: ?sensor={espId}-gpio{gpio} opens SensorConfigPanel
  const sensorParam = route.query.sensor as string | undefined
  if (sensorParam) {
    const match = sensorParam.match(/^(.+)-gpio(\d+)$/)
    if (match) {
      const [, espId, gpioStr] = match
      const gpio = parseInt(gpioStr, 10)
      const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
      if (device) {
        const sensor = (device.sensors as { gpio: number; sensor_type: string; unit?: string; name?: string | null }[])
          ?.find(s => s.gpio === gpio)
        if (sensor) {
          openSensorConfig({
            esp_id: espId,
            gpio,
            sensor_type: sensor.sensor_type,
            unit: sensor.unit ?? '',
            name: sensor.name,
          })
        }
      }
    }
  }
})

// =============================================================================
// Sensor & Actuator Data via Composable (zone/subzone grouping)
// =============================================================================
const {
  allSensors, filteredSensors, sensorsByZone,
  allActuators, filteredActuators, actuatorsByZone,
} = useZoneGrouping({
  filterEspId,
  filterSensorType,
  filterQuality,
  filterActuatorType,
  filterState,
})

const hasSensorFilters = computed(() => {
  return filterEspId.value !== '' ||
    filterSensorType.value.length > 0 ||
    filterQuality.value.length > 0
})

const actuatorStats = computed(() => {
  const stats = { on: 0, off: 0, emergency: 0 }
  allActuators.value.forEach(actuator => {
    if (actuator.emergency_stopped) stats.emergency++
    else if (actuator.state) stats.on++
    else stats.off++
  })
  return stats
})

const hasActuatorFilters = computed(() => {
  return filterEspId.value !== '' ||
    filterActuatorType.value.length > 0 ||
    filterState.value.length > 0
})

// =============================================================================
// Combined hasActiveFilters based on current tab
// =============================================================================
const hasActiveFilters = computed(() => {
  return activeTab.value === 'sensors' ? hasSensorFilters.value : hasActuatorFilters.value
})

const activeFilterCount = computed(() => {
  if (activeTab.value === 'sensors') {
    return filterSensorType.value.length + filterQuality.value.length + (filterEspId.value ? 1 : 0)
  } else {
    return filterActuatorType.value.length + filterState.value.length + (filterEspId.value ? 1 : 0)
  }
})

// =============================================================================
// Filter Actions
// =============================================================================
function clearFilters() {
  filterEspId.value = ''
  if (activeTab.value === 'sensors') {
    filterSensorType.value = []
    filterQuality.value = []
  } else {
    filterActuatorType.value = []
    filterState.value = []
  }
}

function toggleSensorType(type: string) {
  const index = filterSensorType.value.indexOf(type)
  if (index === -1) {
    filterSensorType.value.push(type)
  } else {
    filterSensorType.value.splice(index, 1)
  }
}

function toggleQuality(quality: QualityLevel) {
  const index = filterQuality.value.indexOf(quality)
  if (index === -1) {
    filterQuality.value.push(quality)
  } else {
    filterQuality.value.splice(index, 1)
  }
}

function toggleActuatorType(type: string) {
  const index = filterActuatorType.value.indexOf(type)
  if (index === -1) {
    filterActuatorType.value.push(type)
  } else {
    filterActuatorType.value.splice(index, 1)
  }
}

function toggleStateFilter(state: ActuatorStateFilter) {
  const index = filterState.value.indexOf(state)
  if (index === -1) {
    filterState.value.push(state)
  } else {
    filterState.value.splice(index, 1)
  }
}

// =============================================================================
// Actuator Actions
// =============================================================================
async function toggleActuator(espId: string, gpio: number, currentState: boolean) {
  await espStore.sendActuatorCommand(espId, gpio, currentState ? 'OFF' : 'ON')
}

</script>

<template>
  <div class="h-full overflow-auto space-y-4 md:space-y-6">
    <!-- Header with Tabs -->
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2 justify-end">
          <button
            class="btn-secondary flex items-center gap-2"
            @click="showFilters = !showFilters"
          >
            <Filter class="w-4 h-4" />
            <span>Filter</span>
            <span v-if="activeFilterCount > 0" class="badge badge-info text-xs">
              {{ activeFilterCount }}
            </span>
            <component :is="showFilters ? ChevronUp : ChevronDown" class="w-4 h-4" />
          </button>
          <!-- Emergency Stop (only on actuators tab) -->
          <EmergencyStopButton v-if="activeTab === 'actuators'" />
        </div>

      <!-- Tab Navigation -->
      <div class="tab-navigation">
        <button
          :class="['tab-btn', activeTab === 'sensors' ? 'tab-btn--active' : '']"
          @click="setActiveTab('sensors')"
        >
          <Thermometer class="w-4 h-4" />
          <span>Sensoren</span>
          <span class="tab-count">{{ allSensors.length }}</span>
        </button>
        <button
          :class="['tab-btn', activeTab === 'actuators' ? 'tab-btn--active' : '']"
          @click="setActiveTab('actuators')"
        >
          <Power class="w-4 h-4" />
          <span>Aktoren</span>
          <span class="tab-count">{{ allActuators.length }}</span>
        </button>
      </div>
    </div>

    <!-- Actuator Quick Stats (only on actuators tab) -->
    <div v-if="activeTab === 'actuators'" class="grid grid-cols-3 gap-2 md:gap-4">
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-green-400">{{ actuatorStats.on }}</p>
        <p class="text-xs md:text-sm text-dark-400">Aktiv (ON)</p>
      </div>
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-dark-400">{{ actuatorStats.off }}</p>
        <p class="text-xs md:text-sm text-dark-400">Inaktiv (OFF)</p>
      </div>
      <div class="card p-3 md:p-4 text-center">
        <p class="text-2xl md:text-3xl font-bold text-red-400">{{ actuatorStats.emergency }}</p>
        <p class="text-xs md:text-sm text-dark-400">Not-Stopp</p>
      </div>
    </div>

    <!-- Filter Panel -->
    <Transition name="slide">
      <div v-if="showFilters" class="card p-4">
        <div class="flex flex-col lg:flex-row gap-4">
          <!-- ESP ID Filter (common) -->
          <div class="flex-1">
            <label class="label">ESP ID</label>
            <div class="relative">
              <input
                v-model="filterEspId"
                type="text"
                class="input pr-8"
                placeholder="Nach ESP ID suchen..."
                list="esp-ids-components"
              />
              <datalist id="esp-ids-components">
                <option v-for="id in availableEspIds" :key="id" :value="id" />
              </datalist>
              <button
                v-if="filterEspId"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200"
                @click="filterEspId = ''"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Sensor Type Filter (sensors tab) -->
          <template v-if="activeTab === 'sensors'">
            <div class="flex-1">
              <label class="label">Sensor Typ</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="type in availableSensorTypes"
                  :key="type"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                    filterSensorType.includes(type)
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                  ]"
                  @click="toggleSensorType(type)"
                >
                  {{ type }}
                </button>
              </div>
            </div>

            <div class="flex-1">
              <label class="label">Qualität</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="quality in qualityLevels"
                  :key="quality"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                    filterQuality.includes(quality)
                      ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                  ]"
                  @click="toggleQuality(quality)"
                >
                  {{ getQualityLabel(quality) }}
                </button>
              </div>
            </div>
          </template>

          <!-- Actuator Type Filter (actuators tab) -->
          <template v-if="activeTab === 'actuators'">
            <div class="flex-1">
              <label class="label">Aktor Typ</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="type in availableActuatorTypes"
                  :key="type"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                    filterActuatorType.includes(type)
                      ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                  ]"
                  @click="toggleActuatorType(type)"
                >
                  {{ type }}
                </button>
              </div>
            </div>

            <div class="flex-1">
              <label class="label">Status</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="state in stateFilters"
                  :key="state.value"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm transition-colors touch-target',
                    filterState.includes(state.value)
                      ? state.value === 'on' ? 'bg-green-500/30 text-green-300 border border-green-500/50'
                      : state.value === 'emergency' ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                      : 'bg-dark-500/30 text-dark-200 border border-dark-400/50'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-600'
                  ]"
                  @click="toggleStateFilter(state.value)"
                >
                  {{ state.label }}
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Clear Filters -->
        <div v-if="hasActiveFilters" class="mt-4 pt-4 border-t border-dark-700">
          <button class="btn-ghost text-sm" @click="clearFilters">
            <X class="w-4 h-4 mr-1" />
            Alle Filter zurücksetzen
          </button>
        </div>
      </div>
    </Transition>

    <!-- Loading State -->
    <div v-if="espStore.isLoading" class="text-center py-12 text-dark-400">
      <div class="animate-spin w-8 h-8 border-2 border-dark-600 border-t-blue-500 rounded-full mx-auto mb-4" />
      Lade {{ activeTab === 'sensors' ? 'Sensoren' : 'Aktoren' }}...
    </div>

    <!-- ========== SENSORS TAB CONTENT ========== -->
    <template v-else-if="activeTab === 'sensors'">
      <!-- Empty State -->
      <div v-if="allSensors.length === 0" class="card p-8 md:p-12 text-center">
        <Thermometer class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine Sensoren</h3>
        <p class="text-dark-400">
          Erstelle einen Mock ESP mit Sensoren, um sie hier zu sehen
        </p>
      </div>

      <!-- No Results (filters active) -->
      <div v-else-if="filteredSensors.length === 0 && hasSensorFilters" class="card p-8 md:p-12 text-center">
        <Filter class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine passenden Sensoren</h3>
        <p class="text-dark-400 mb-4">
          Kein Sensor entspricht den aktuellen Filtern
        </p>
        <button class="btn-secondary" @click="clearFilters">
          Filter zurücksetzen
        </button>
      </div>

      <!-- Sensor List grouped by Zone → Subzone -->
      <div v-else class="space-y-4">
        <div
          v-for="zone in sensorsByZone"
          :key="zone.zoneId ?? '__unassigned__'"
          class="sensors-zone-section"
        >
          <!-- Zone Header (accordion) -->
          <div class="sensors-zone-header-row">
            <button
              :class="['sensors-zone-header', { 'sensors-zone-header--collapsed': !isZoneExpanded(zone.zoneId ?? '__unassigned__') }]"
              @click="toggleZone(zone.zoneId ?? '__unassigned__')"
            >
              <ChevronRight
                :class="['sensors-zone-chevron', { 'sensors-zone-chevron--expanded': isZoneExpanded(zone.zoneId ?? '__unassigned__') }]"
              />
              <span class="sensors-zone-name">{{ zone.zoneName }}</span>
              <span class="sensors-zone-count">{{ zone.sensorCount }} {{ zone.sensorCount === 1 ? 'Sensor' : 'Sensoren' }}</span>
            </button>
            <button
              v-if="zone.zoneId"
              class="sensors-subzone-add-btn"
              title="Subzone hinzufügen"
              @click.stop="startCreateSubzone(zone.zoneId)"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Subzone</span>
            </button>
          </div>

          <!-- Inline create subzone -->
          <div
            v-if="creatingSubzoneForZone === (zone.zoneId ?? '__unassigned__')"
            class="sensors-subzone-create"
          >
            <input
              v-model="newSubzoneName"
              class="sensors-subzone-create__input"
              placeholder="Name der neuen Subzone"
              @keydown.enter="confirmCreateSubzone(zone.zoneId)"
              @keydown.escape="cancelCreateSubzone"
            />
            <button
              class="sensors-subzone-create__confirm"
              :disabled="!newSubzoneName.trim() || subzoneActionLoading"
              @click="confirmCreateSubzone(zone.zoneId)"
            >
              <Check class="w-3.5 h-3.5" />
            </button>
            <button
              class="sensors-subzone-create__cancel"
              @click="cancelCreateSubzone"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Subzones (nested accordion) -->
          <Transition name="accordion">
            <div v-show="isZoneExpanded(zone.zoneId ?? '__unassigned__')" class="sensors-zone-content">
              <div
                v-for="subzone in zone.subzones"
                :key="subzone.subzoneId ?? '__none__'"
                class="sensors-subzone"
              >
                <div
                  v-if="zone.subzones.length > 1 || subzone.subzoneName"
                  class="sensors-subzone-header-row"
                >
                  <!-- Inline rename mode -->
                  <template v-if="editingSubzoneId === subzone.subzoneId && subzone.subzoneId">
                    <div class="sensors-subzone-rename">
                      <input
                        v-model="editingSubzoneName"
                        class="sensors-subzone-rename__input"
                        @keydown.enter="saveSubzoneName(subzone.subzoneId!, zone.zoneId)"
                        @keydown.escape="cancelRenameSubzone"
                      />
                      <button
                        class="sensors-subzone-create__confirm"
                        :disabled="!editingSubzoneName.trim() || subzoneActionLoading"
                        @click="saveSubzoneName(subzone.subzoneId!, zone.zoneId)"
                      >
                        <Check class="w-3.5 h-3.5" />
                      </button>
                      <button
                        class="sensors-subzone-create__cancel"
                        @click="cancelRenameSubzone"
                      >
                        <X class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </template>

                  <!-- Normal subzone header -->
                  <template v-else>
                    <button
                      :class="['sensors-subzone-header', { 'sensors-subzone-header--collapsed': !isSubzoneExpanded(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`) }]"
                      @click="toggleSubzone(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`)"
                    >
                      <ChevronRight
                        :class="['sensors-zone-chevron', { 'sensors-zone-chevron--expanded': isSubzoneExpanded(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`) }]"
                      />
                      <span class="sensors-subzone-name">{{ subzone.subzoneName || 'Keine Subzone' }}</span>
                      <span class="sensors-zone-count">{{ subzone.sensors.length }} {{ subzone.sensors.length === 1 ? 'Sensor' : 'Sensoren' }}</span>
                    </button>
                    <div v-if="subzone.subzoneId" class="sensors-subzone-actions">
                      <button
                        class="sensors-subzone-action-btn"
                        title="Umbenennen"
                        @click.stop="startRenameSubzone(subzone.subzoneId!, subzone.subzoneName)"
                      >
                        <Pencil class="w-3 h-3" />
                      </button>
                      <button
                        class="sensors-subzone-action-btn sensors-subzone-action-btn--danger"
                        title="Löschen"
                        @click.stop="deleteSubzone(subzone.subzoneId!)"
                      >
                        <Trash2 class="w-3 h-3" />
                      </button>
                    </div>
                  </template>
                </div>
                <Transition name="accordion">
                  <div
                    v-show="zone.subzones.length <= 1 && !subzone.subzoneName ? true : isSubzoneExpanded(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`)"
                    class="sensors-subzone-cards"
                  >
                    <SensorCard
                      v-for="sensor in subzone.sensors"
                      :key="`${sensor.esp_id}-${sensor.gpio}`"
                      :sensor="sensor"
                      mode="config"
                      @configure="openSensorConfig"
                    />
                  </div>
                </Transition>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </template>

    <!-- ========== ACTUATORS TAB CONTENT ========== -->
    <template v-else-if="activeTab === 'actuators'">
      <!-- Empty State -->
      <div v-if="allActuators.length === 0" class="card p-8 md:p-12 text-center">
        <Power class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine Aktoren</h3>
        <p class="text-dark-400">
          Erstelle einen Mock ESP mit Aktoren, um sie hier zu sehen
        </p>
      </div>

      <!-- No Results (filters active) -->
      <div v-else-if="filteredActuators.length === 0 && hasActuatorFilters" class="card p-8 md:p-12 text-center">
        <Filter class="w-12 h-12 text-dark-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-dark-200 mb-2">Keine passenden Aktoren</h3>
        <p class="text-dark-400 mb-4">
          Kein Aktor entspricht den aktuellen Filtern
        </p>
        <button class="btn-secondary" @click="clearFilters">
          Filter zurücksetzen
        </button>
      </div>

      <!-- Actuator List grouped by Zone → Subzone -->
      <div v-else class="space-y-4">
        <div
          v-for="zone in actuatorsByZone"
          :key="zone.zoneId ?? '__unassigned__'"
          class="sensors-zone-section"
        >
          <!-- Zone Header (accordion) -->
          <div class="sensors-zone-header-row">
            <button
              :class="['sensors-zone-header', { 'sensors-zone-header--collapsed': !isZoneExpanded(zone.zoneId ?? '__unassigned__') }]"
              @click="toggleZone(zone.zoneId ?? '__unassigned__')"
            >
              <ChevronRight
                :class="['sensors-zone-chevron', { 'sensors-zone-chevron--expanded': isZoneExpanded(zone.zoneId ?? '__unassigned__') }]"
              />
              <span class="sensors-zone-name">{{ zone.zoneName }}</span>
              <span class="sensors-zone-count">{{ zone.actuatorCount }} {{ zone.actuatorCount === 1 ? 'Aktor' : 'Aktoren' }}</span>
            </button>
            <button
              v-if="zone.zoneId"
              class="sensors-subzone-add-btn"
              title="Subzone hinzufügen"
              @click.stop="startCreateSubzone(zone.zoneId)"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Subzone</span>
            </button>
          </div>

          <!-- Inline create subzone -->
          <div
            v-if="creatingSubzoneForZone === (zone.zoneId ?? '__unassigned__')"
            class="sensors-subzone-create"
          >
            <input
              v-model="newSubzoneName"
              class="sensors-subzone-create__input"
              placeholder="Name der neuen Subzone"
              @keydown.enter="confirmCreateSubzone(zone.zoneId)"
              @keydown.escape="cancelCreateSubzone"
            />
            <button
              class="sensors-subzone-create__confirm"
              :disabled="!newSubzoneName.trim() || subzoneActionLoading"
              @click="confirmCreateSubzone(zone.zoneId)"
            >
              <Check class="w-3.5 h-3.5" />
            </button>
            <button
              class="sensors-subzone-create__cancel"
              @click="cancelCreateSubzone"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Subzones (nested accordion) -->
          <Transition name="accordion">
            <div v-show="isZoneExpanded(zone.zoneId ?? '__unassigned__')" class="sensors-zone-content">
              <div
                v-for="subzone in zone.subzones"
                :key="subzone.subzoneId ?? '__none__'"
                class="sensors-subzone"
              >
                <div
                  v-if="zone.subzones.length > 1 || subzone.subzoneName"
                  class="sensors-subzone-header-row"
                >
                  <!-- Inline rename mode -->
                  <template v-if="editingSubzoneId === subzone.subzoneId && subzone.subzoneId">
                    <div class="sensors-subzone-rename">
                      <input
                        v-model="editingSubzoneName"
                        class="sensors-subzone-rename__input"
                        @keydown.enter="saveSubzoneName(subzone.subzoneId!, zone.zoneId)"
                        @keydown.escape="cancelRenameSubzone"
                      />
                      <button
                        class="sensors-subzone-create__confirm"
                        :disabled="!editingSubzoneName.trim() || subzoneActionLoading"
                        @click="saveSubzoneName(subzone.subzoneId!, zone.zoneId)"
                      >
                        <Check class="w-3.5 h-3.5" />
                      </button>
                      <button
                        class="sensors-subzone-create__cancel"
                        @click="cancelRenameSubzone"
                      >
                        <X class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </template>

                  <!-- Normal subzone header -->
                  <template v-else>
                    <button
                      :class="['sensors-subzone-header', { 'sensors-subzone-header--collapsed': !isSubzoneExpanded(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`) }]"
                      @click="toggleSubzone(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`)"
                    >
                      <ChevronRight
                        :class="['sensors-zone-chevron', { 'sensors-zone-chevron--expanded': isSubzoneExpanded(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`) }]"
                      />
                      <span class="sensors-subzone-name">{{ subzone.subzoneName || 'Keine Subzone' }}</span>
                      <span class="sensors-zone-count">{{ subzone.actuators.length }} {{ subzone.actuators.length === 1 ? 'Aktor' : 'Aktoren' }}</span>
                    </button>
                    <div v-if="subzone.subzoneId" class="sensors-subzone-actions">
                      <button
                        class="sensors-subzone-action-btn"
                        title="Umbenennen"
                        @click.stop="startRenameSubzone(subzone.subzoneId!, subzone.subzoneName)"
                      >
                        <Pencil class="w-3 h-3" />
                      </button>
                      <button
                        class="sensors-subzone-action-btn sensors-subzone-action-btn--danger"
                        title="Löschen"
                        @click.stop="deleteSubzone(subzone.subzoneId!)"
                      >
                        <Trash2 class="w-3 h-3" />
                      </button>
                    </div>
                  </template>
                </div>
                <Transition name="accordion">
                  <div
                    v-show="zone.subzones.length <= 1 && !subzone.subzoneName ? true : isSubzoneExpanded(`${zone.zoneId ?? '__u'}-${subzone.subzoneId ?? '__n'}`)"
                    class="sensors-subzone-cards"
                  >
                    <ActuatorCard
                      v-for="actuator in subzone.actuators"
                      :key="`${actuator.esp_id}-${actuator.gpio}`"
                      :actuator="actuator"
                      mode="config"
                      @configure="openActuatorConfig"
                      @toggle="toggleActuator"
                    />
                  </div>
                </Transition>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </template>

    <!-- Sensor Config SlideOver -->
    <SlideOver
      :open="showSensorPanel"
      :title="selectedSensorConfig ? (lastClickedSensorName || selectedSensorConfig.sensorType) : 'Sensor konfigurieren'"
      width="lg"
      @close="closeSensorPanel"
    >
      <SensorConfigPanel
        v-if="selectedSensorConfig"
        :esp-id="selectedSensorConfig.espId"
        :gpio="selectedSensorConfig.gpio"
        :sensor-type="selectedSensorConfig.sensorType"
        :unit="selectedSensorConfig.unit"
      />
      <!-- Cross-link to Monitor (Live data) -->
      <button
        v-if="selectedSensorConfig && selectedSensorZoneId"
        class="sensors-view__monitor-link"
        @click="router.push({
          name: 'monitor-sensor',
          params: {
            zoneId: selectedSensorZoneId,
            sensorId: `${selectedSensorConfig.espId}-gpio${selectedSensorConfig.gpio}`,
          },
        })"
      >
        <Activity class="w-4 h-4" />
        <span>Live-Daten im Monitor anzeigen</span>
        <ChevronRight class="w-4 h-4 ml-auto" />
      </button>
    </SlideOver>

    <!-- Actuator Config SlideOver -->
    <SlideOver
      :open="showActuatorPanel"
      :title="selectedActuatorConfig?.actuatorType || 'Aktor'"
      width="lg"
      @close="closeActuatorPanel"
    >
      <ActuatorConfigPanel
        v-if="selectedActuatorConfig"
        :esp-id="selectedActuatorConfig.espId"
        :gpio="selectedActuatorConfig.gpio"
        :actuator-type="selectedActuatorConfig.actuatorType"
      />
    </SlideOver>
  </div>
</template>

<style scoped>
/* Tab Navigation */
.tab-navigation {
  display: flex;
  gap: 0.25rem;
  background-color: var(--color-bg-tertiary, #1a1a2e);
  padding: 0.25rem;
  border-radius: 0.5rem;
  width: fit-content;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
  color: var(--color-text-muted, #6b7280);
  transition: all 0.2s;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--color-text-primary, #f3f4f6);
}

.tab-btn--active {
  background: linear-gradient(135deg, var(--color-iridescent-1, #a78bfa), var(--color-iridescent-2, #818cf8));
  color: white;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 9999px;
  background-color: rgba(255, 255, 255, 0.15);
}

.tab-btn:not(.tab-btn--active) .tab-count {
  background-color: var(--color-bg-secondary, #1e1e2e);
}

/* Slide transition for filter panel */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 500px;
}

/* Zone/Subzone accordion */
.sensors-zone-section {
  background: var(--color-bg-tertiary, #1a1a2e);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.sensors-zone-header,
.sensors-subzone-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background var(--transition-fast);
}

.sensors-zone-header:hover,
.sensors-subzone-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.sensors-zone-chevron {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  transition: transform var(--transition-fast);
  color: var(--color-text-muted);
}

.sensors-zone-chevron--expanded {
  transform: rotate(90deg);
}

.sensors-zone-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensors-subzone-header {
  padding: var(--space-2) var(--space-4);
  padding-left: var(--space-8);
  font-weight: 500;
  font-size: var(--text-xs);
}

.sensors-subzone-name {
  flex: 1;
  color: var(--color-text-secondary);
}

.sensors-zone-count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 400;
}

.sensors-zone-content {
  padding: 0 var(--space-4) var(--space-4);
}

.sensors-subzone {
  margin-bottom: var(--space-2);
}

.sensors-subzone:last-child {
  margin-bottom: 0;
}

.sensors-subzone-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
  padding-left: var(--space-4);
  padding-top: var(--space-2);
}

.sensors-subzone-header + .sensors-subzone-cards {
  padding-left: var(--space-8);
}

.accordion-enter-active,
.accordion-leave-active {
  transition: all var(--transition-base);
}

.accordion-enter-from,
.accordion-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
}

.accordion-enter-to,
.accordion-leave-from {
  max-height: 2000px;
}

/* Zone header row with add button */
.sensors-zone-header-row {
  display: flex;
  align-items: center;
}

.sensors-zone-header-row .sensors-zone-header {
  flex: 1;
}

.sensors-subzone-add-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  margin-right: var(--space-2);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.sensors-subzone-add-btn:hover {
  color: var(--color-accent-bright);
  border-color: var(--color-accent);
  background: rgba(139, 92, 246, 0.08);
}

/* Subzone header row with actions */
.sensors-subzone-header-row {
  display: flex;
  align-items: center;
}

.sensors-subzone-header-row .sensors-subzone-header {
  flex: 1;
}

.sensors-subzone-actions {
  display: flex;
  gap: var(--space-1);
  margin-right: var(--space-2);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.sensors-subzone-header-row:hover .sensors-subzone-actions {
  opacity: 1;
}

.sensors-subzone-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensors-subzone-action-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary);
}

.sensors-subzone-action-btn--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
}

/* Create / Rename inline forms */
.sensors-subzone-create,
.sensors-subzone-rename {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  padding-left: var(--space-8);
}

.sensors-subzone-create__input,
.sensors-subzone-rename__input {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-quaternary);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  outline: none;
}

.sensors-subzone-create__confirm,
.sensors-subzone-create__cancel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensors-subzone-create__confirm {
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-success);
}

.sensors-subzone-create__confirm:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.25);
}

.sensors-subzone-create__confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sensors-subzone-create__cancel {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-text-muted);
}

.sensors-subzone-create__cancel:hover {
  background: rgba(239, 68, 68, 0.2);
  color: var(--color-error);
}

/* Cross-link to Monitor */
.sensors-view__monitor-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding: var(--space-3);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-accent-bright);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  width: 100%;
  text-align: left;
}

.sensors-view__monitor-link:hover {
  border-color: var(--color-accent);
  background: rgba(59, 130, 246, 0.06);
}

</style>
