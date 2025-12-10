<template>
  <UnifiedCard
    :title="esp.name || esp"
    :subtitle="esp"
    icon="mdi-memory"
    :icon-color="getHealthColor()"
    :status="getHealthLabel()"
    variant="outlined"
    class="mindmap-node esp-node"
    :class="{
      expanded: isExpanded,
      dragging: isDragging,
      unconfigured: !zoneName,
    }"
    :interactive="true"
    :show-header-actions="true"
    :show-expand-button="true"
    :expanded="isExpanded"
    :draggable="draggable"
    @click="$emit('expand')"
    @expand="$emit('expand')"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Header Actions -->
    <template #header-actions>
      <!-- ✅ OPTIMIERT: Zone-Zuordnung - nur wenn vorhanden -->
      <v-chip v-if="zoneName" size="x-small" color="success" variant="tonal" class="mr-2">
        <v-icon icon="mdi-map-marker" size="x-small" class="mr-1" />
        {{ zoneName }}
      </v-chip>

      <v-btn icon="mdi-cog" @click.stop="$emit('configure')" />
      <v-btn icon="mdi-delete" @click.stop="$emit('delete')" />
    </template>

    <!-- Content -->
    <template #content>
      <v-expand-transition>
        <div v-if="isExpanded">
          <!-- ✅ OPTIMIERT: Kompakte ESP-Statistiken -->
          <div class="esp-overview mb-4">
            <v-row>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold text-success">{{ sensorCount }}</div>
                  <div class="text-caption">Sensoren</div>
                </div>
              </v-col>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold text-info">{{ actuatorCount }}</div>
                  <div class="text-caption">Aktoren</div>
                </div>
              </v-col>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h5 font-weight-bold" :class="getHealthColorClass()">
                    {{ getHealthLabel() }}
                  </div>
                  <div class="text-caption">Status</div>
                </div>
              </v-col>
            </v-row>
          </div>

          <!-- ✅ OPTIMIERT: ESP-Konfiguration direkt in der Mindmap -->
          <EspConfigurationPanel
            :esp="esp"
            :zone-name="zoneName"
            :kaiser-id="kaiserId"
            @update="updateEspData"
            @move="moveEsp"
          />
        </div>
      </v-expand-transition>
    </template>
  </UnifiedCard>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { eventBus, MQTT_EVENTS } from '@/utils/eventBus'

// Konfigurations-Panel
import EspConfigurationPanel from './panels/EspConfigurationPanel.vue'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

// Props
const props = defineProps({
  esp: {
    type: [String, Object],
    required: true,
  },
  zoneName: {
    type: String,
    default: null,
  },
  kaiserId: {
    type: String,
    default: null,
  },
  isExpanded: {
    type: Boolean,
    default: false,
  },
  draggable: {
    type: Boolean,
    default: false,
  },
})

// Emits
const emit = defineEmits([
  'expand',
  'configure',
  'delete',
  'update',
  'move',
  'dragstart',
  'dragend',
  'transfer',
])

// Expose transferEspToKaiser for parent components
defineExpose({
  transferEspToKaiser,
})

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive Data
const isDragging = ref(false)

// ✅ OPTIMIERT: Computed Properties
const espDevice = computed(() => {
  if (typeof props.esp === 'string') {
    return mqttStore.value.espDevices.get(props.esp) || { id: props.esp, name: props.esp }
  }
  return props.esp
})

// ✅ OPTIMIERT: Sensor- und Aktor-Anzahl
const sensorCount = computed(() => {
  const device = espDevice.value
  if (!device || !device.sensors) return 0
  return device.sensors.size || 0
})

const actuatorCount = computed(() => {
  const device = espDevice.value
  if (!device || !device.actuators) return 0
  return device.actuators.size || 0
})

// ✅ OPTIMIERT: Methods
const getHealthStatus = () => {
  const device = espDevice.value
  if (!device) return 'unknown'

  // Verwende bestehende Health-Logik
  if (device.status === 'online' || device.connected) return 'online'
  if (device.status === 'offline' || !device.connected) return 'offline'
  return 'unknown'
}

const getHealthLabel = () => {
  const status = getHealthStatus()
  switch (status) {
    case 'online':
      return 'Online'
    case 'offline':
      return 'Offline'
    default:
      return 'Unbekannt'
  }
}

const getHealthColor = () => {
  const status = getHealthStatus()
  switch (status) {
    case 'online':
      return 'success'
    case 'offline':
      return 'error'
    default:
      return 'grey'
  }
}

const getHealthColorClass = () => {
  const status = getHealthStatus()
  switch (status) {
    case 'online':
      return 'text-success'
    case 'offline':
      return 'text-error'
    default:
      return 'text-grey'
  }
}

const handleDragStart = (event) => {
  if (props.draggable) {
    isDragging.value = true
    console.log(`[EspNode] Starting drag for ESP: ${props.esp}`)

    // Setze Drag-Daten
    event.dataTransfer.setData('text/plain', props.esp)
    event.dataTransfer.effectAllowed = 'move'

    // Verwende globales Drag & Drop System
    centralDataHub.startDrag(props.esp)

    // Emit an Parent
    emit('dragstart', props.esp)
  }
}

const handleDragEnd = () => {
  if (props.draggable) {
    isDragging.value = false
    console.log(`[EspNode] Ending drag for ESP: ${props.esp}`)

    // Verwende globales Drag & Drop System
    centralDataHub.stopDrag()

    // Emit an Parent
    emit('dragend')
  }
}

const updateEspData = (updatedData) => {
  emit('update', updatedData)
}

const moveEsp = (newZone) => {
  emit('move', props.esp, newZone)
}

// ✅ NEU: ESP-Transfer-Methode für Cross-Kaiser-Management
const transferEspToKaiser = async (targetKaiserId) => {
  const currentKaiserId = props.kaiserId || centralDataHub.centralConfig?.kaiserId

  // Validierung
  if (currentKaiserId === targetKaiserId) {
    console.warn('[EspNode] Transfer to same Kaiser ignored')
    return
  }

  try {
    // Event für ESP-Transfer
    eventBus.emit(MQTT_EVENTS.ESP_KAISER_TRANSFER, {
      espId: props.esp,
      fromKaiser: currentKaiserId,
      toKaiser: targetKaiserId,
      timestamp: Date.now(),
      transferReason: 'user_mindmap_action',
    })

    console.log(
      `[EspNode] ESP ${props.esp} transfer initiated: ${currentKaiserId} → ${targetKaiserId}`,
    )
  } catch (error) {
    console.error('[EspNode] ESP transfer failed:', error)
  }
}
</script>

<style scoped>
/* ✅ OPTIMIERT: Mindmap-spezifische Styles für UnifiedCard */
.mindmap-node {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  overflow: hidden;
}

.mindmap-node:hover {
  transform: translateY(-2px);
}

.mindmap-node.expanded {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
}

/* ✅ OPTIMIERT: ESP-Übersicht */
.esp-overview {
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

/* Spezifische Node-Typen */
.esp-node {
  border-left: 4px solid #4caf50;
  min-width: 250px;
}

.esp-node.unconfigured {
  border-left: 4px solid #ff9800;
}

/* Drag & Drop */
.esp-node.dragging {
  opacity: 0.5;
  transform: rotate(5deg);
}

/* Animations */
.v-expand-transition-enter-active,
.v-expand-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .mindmap-node {
    max-width: 100%;
  }
}
</style>
