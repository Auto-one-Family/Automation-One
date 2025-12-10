<template>
  <div class="zone-tree-view">
    <!-- View Toggle -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-view-list" class="mr-2" />
        Ansicht wechseln
      </v-card-title>
      <v-card-text>
        <v-btn-toggle v-model="viewMode" mandatory color="primary" variant="outlined">
          <v-btn value="list" prepend-icon="mdi-view-list"> Listenansicht </v-btn>
          <v-btn value="tree" prepend-icon="mdi-file-tree"> Baumansicht </v-btn>
        </v-btn-toggle>
      </v-card-text>
    </v-card>

    <!-- Tree View -->
    <v-expand-transition>
      <v-card v-if="viewMode === 'tree' && selectedEsp" variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-file-tree" class="mr-2" />
          ESP Hierarchie
        </v-card-title>
        <v-card-text>
          <!-- ✅ NEU: Subzone-Validierung Warnung -->
          <v-alert
            v-if="hasInvalidSubzones"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            icon="mdi-alert"
          >
            <strong>Subzone-Warnung:</strong>
            {{ invalidSubzonesCount }} Subzone{{ invalidSubzonesCount > 1 ? 'n' : '' }}
            {{ invalidSubzonesCount > 1 ? 'sind' : 'ist' }} nicht registriert und werden automatisch
            erstellt.
          </v-alert>

          <v-treeview
            :items="treeData"
            v-model:active="activeItems"
            v-model:open="openItems"
            activatable
            hoverable
            dense
            class="zone-tree"
          >
            <template #label="{ item }">
              <div class="d-flex align-center justify-space-between w-100">
                <div class="d-flex align-center">
                  <v-tooltip location="top">
                    <template #activator="{ props }">
                      <v-icon
                        v-bind="props"
                        :icon="getItemIcon(item)"
                        :color="getItemColor(item)"
                        class="mr-2"
                        size="small"
                      />
                    </template>
                    <span>{{ getItemTooltip(item) }}</span>
                  </v-tooltip>
                  <span class="text-body-2">{{ item.name }}</span>
                </div>

                <!-- Status Indicators -->
                <div class="d-flex align-center">
                  <v-tooltip v-if="item.status === 'pending'" location="top">
                    <template #activator="{ props }">
                      <v-chip
                        v-bind="props"
                        size="x-small"
                        color="warning"
                        variant="tonal"
                        class="mr-2"
                      >
                        Pending
                      </v-chip>
                    </template>
                    <span>Wartet auf Bestätigung</span>
                  </v-tooltip>

                  <v-tooltip v-if="item.status === 'unknown'" location="top">
                    <template #activator="{ props }">
                      <v-chip
                        v-bind="props"
                        size="x-small"
                        color="error"
                        variant="tonal"
                        class="mr-2"
                      >
                        Unknown
                      </v-chip>
                    </template>
                    <span>Subzone nicht registriert</span>
                  </v-tooltip>

                  <v-tooltip v-if="item.gpio" location="top">
                    <template #activator="{ props }">
                      <v-chip v-bind="props" size="x-small" color="info" variant="tonal">
                        GPIO {{ item.gpio }}
                      </v-chip>
                    </template>
                    <span>Zugewiesener GPIO Pin</span>
                  </v-tooltip>
                </div>
              </div>
            </template>
          </v-treeview>
        </v-card-text>
      </v-card>
    </v-expand-transition>

    <!-- List View (existing) -->
    <v-expand-transition>
      <div v-if="viewMode === 'list'">
        <slot name="list-view" />
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useDevicesStore } from '@/stores/devices'

const props = defineProps({
  selectedEsp: {
    type: Object,
    default: null,
  },
})

const centralDataHub = useCentralDataHub()
const espStore = computed(() => centralDataHub.espManagement)
const devicesStore = useDevicesStore()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive state
const viewMode = ref('list')
const activeItems = ref([])
const openItems = ref([])

// Computed properties
const treeData = computed(() => {
  if (!props.selectedEsp) return []

  const espId = props.selectedEsp.espId
  const subzones = espStore.value.getSubzones(espId)
  const pendingAssignments = espStore.value.getPendingAssignments(espId)

  return [
    {
      id: espId,
      name: `ESP ${espId}`,
      icon: 'mdi-chip',
      color: 'primary',
      children: subzones.map((subzone) => ({
        id: subzone.id,
        name: subzone.name,
        icon: 'mdi-map-marker',
        color: 'secondary',
        status: espStore.value.getSubzoneStatus(espId, subzone.id),
        children: [
          // Current sensors
          ...getSensorsForSubzone(espId, subzone.id).map((sensor) => ({
            id: `sensor_${sensor.gpio}`,
            name: sensor.name,
            icon: getDeviceIcon(sensor.type),
            color: 'success',
            gpio: sensor.gpio,
            status: espStore.value.getSensorStatus(espId, sensor.gpio),
            type: 'sensor',
          })),
          // Current actuators
          ...getActuatorsForSubzone(espId, subzone.id).map((actuator) => ({
            id: `actuator_${actuator.gpio}`,
            name: actuator.name,
            icon: getDeviceIcon(actuator.type),
            color: 'info',
            gpio: actuator.gpio,
            status: espStore.value.getSensorStatus(espId, actuator.gpio),
            type: 'actuator',
          })),
          // Pending assignments for this subzone
          ...pendingAssignments
            .filter((assignment) => assignment.subzone === subzone.id)
            .map((assignment) => ({
              id: `pending_${assignment.pendingId}`,
              name: assignment.name,
              icon: getDeviceIcon(assignment.type),
              color: 'warning',
              gpio: assignment.gpio,
              status: 'pending',
              type: assignment.category,
            })),
        ],
      })),
    },
  ]
})

// ✅ NEU: Subzone-Validierung
const hasInvalidSubzones = computed(() => {
  if (!props.selectedEsp) return false
  const espId = props.selectedEsp.espId
  const pending = espStore.value.getPendingAssignments(espId)
  if (!pending) return false

  const device = espStore.value.getEspDevice(espId)
  const existingSubzoneIds = device ? Array.from(device.subzones.keys()) : []

  return pending.some((assignment) => !existingSubzoneIds.includes(assignment.subzone))
})

const invalidSubzonesCount = computed(() => {
  if (!props.selectedEsp) return 0
  const espId = props.selectedEsp.espId
  const pending = espStore.value.getPendingAssignments(espId)
  if (!pending) return 0

  const device = espStore.value.getEspDevice(espId)
  const existingSubzoneIds = device ? Array.from(device.subzones.keys()) : []

  const invalidSubzones = new Set()
  pending.forEach((assignment) => {
    if (!existingSubzoneIds.includes(assignment.subzone)) {
      invalidSubzones.add(assignment.subzone)
    }
  })

  return invalidSubzones.size
})

// Methods
function getSensorsForSubzone(espId, subzoneId) {
  const device = espStore.value.getEspDevice(espId)
  if (!device) return []

  const subzone = device.subzones.get(subzoneId)
  return subzone?.sensors ? Array.from(subzone.sensors.values()) : []
}

function getActuatorsForSubzone(espId, subzoneId) {
  const device = espStore.value.getEspDevice(espId)
  if (!device) return []

  const subzone = device.subzones.get(subzoneId)
  return subzone?.actuators ? Array.from(subzone.actuators.values()) : []
}

function getDeviceIcon(type) {
  const deviceInfo = devicesStore.getDeviceTypeInfo(type)
  return deviceInfo?.icon || 'mdi-help-circle'
}

function getItemIcon(item) {
  return item.icon || 'mdi-help-circle'
}

function getItemColor(item) {
  if (item.status === 'pending') return 'warning'
  if (item.status === 'unknown') return 'error'
  return item.color || 'grey'
}

function getItemTooltip(item) {
  if (item.status === 'pending') {
    return 'Wartet auf Bestätigung'
  }
  if (item.status === 'unknown') {
    return 'Subzone nicht registriert'
  }

  switch (item.type) {
    case 'sensor':
      return 'Sensor - misst Daten'
    case 'actuator':
      return 'Aktor - führt Aktionen aus'
    default:
      return item.name
  }
}

// ✅ NEU: Automatische TreeView-Aktualisierung bei ACK-Updates
watch(
  () => mqttStore.value.lastSensorUpdate,
  (update) => {
    if (update && update.espId === props.selectedEsp?.espId) {
      console.log('🔄 TreeView updated from sensor ACK')
      // TreeView wird automatisch neu gerendert durch computed treeData
    }
  },
)

watch(
  () => mqttStore.value.lastActuatorUpdate,
  (update) => {
    if (update && update.espId === props.selectedEsp?.espId) {
      console.log('🔄 TreeView updated from actuator ACK')
      // TreeView wird automatisch neu gerendert durch computed treeData
    }
  },
)

// Expose view mode to parent
defineExpose({
  viewMode,
})
</script>

<style scoped>
.zone-tree-view {
  max-width: 1200px;
  margin: 0 auto;
}

.zone-tree {
  max-height: 600px;
  overflow-y: auto;
}

.zone-tree :deep(.v-treeview-node__root) {
  padding: 4px 0;
}

.zone-tree :deep(.v-treeview-node__label) {
  font-size: 0.875rem;
}
</style>
