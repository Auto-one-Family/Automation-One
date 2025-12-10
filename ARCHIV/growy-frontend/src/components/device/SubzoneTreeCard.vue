<template>
  <UnifiedCard
    variant="outlined"
    :title="subzone.name"
    icon="mdi-map-marker"
    icon-color="secondary"
    :class="{ 'drop-zone-active': isDropZoneActive }"
    show-header-actions
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <template #header-actions>
      <v-chip color="secondary" size="small" variant="tonal" class="mr-2">
        {{ totalDevices }} Geräte
      </v-chip>
      <v-menu>
        <template #activator="{ props }">
          <v-btn icon="mdi-dots-vertical" variant="text" size="small" v-bind="props" />
        </template>
        <v-list density="compact">
          <v-list-item @click="$emit('edit', subzone)">
            <template #prepend>
              <v-icon icon="mdi-pencil" size="small" />
            </template>
            <v-list-item-title>Bearbeiten</v-list-item-title>
          </v-list-item>
          <v-list-item @click="$emit('delete', subzone.id)" color="error">
            <template #prepend>
              <v-icon icon="mdi-delete" size="small" color="error" />
            </template>
            <v-list-item-title class="text-error">Löschen</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <template #content>
      <!-- Drop Zone Indicator -->
      <div v-if="isDropZoneActive" class="drop-zone-indicator pa-4 text-center">
        <v-icon icon="mdi-plus" size="32" color="primary" />
        <div class="text-subtitle-1 mt-2">Pin hier ablegen</div>
      </div>

      <!-- Sensoren -->
      <div v-if="sensors.length > 0" class="mb-3">
        <h6 class="text-caption text-grey mb-2 d-flex align-center">
          <v-icon icon="mdi-thermometer" size="small" class="mr-1" />
          Sensoren ({{ sensors.length }})
        </h6>
        <div class="d-flex flex-wrap gap-1">
          <v-chip
            v-for="sensor in sensors"
            :key="`sensor-${sensor.gpio}`"
            size="x-small"
            color="success"
            variant="tonal"
            class="mb-1"
          >
            <v-icon :icon="getSensorIcon(sensor.type)" size="x-small" class="mr-1" />
            GPIO {{ sensor.gpio }}: {{ sensor.name }}
          </v-chip>
        </div>
      </div>

      <!-- Aktoren -->
      <div v-if="actuators.length > 0">
        <h6 class="text-caption text-grey mb-2 d-flex align-center">
          <v-icon icon="mdi-cog" size="small" class="mr-1" />
          Aktoren ({{ actuators.length }})
        </h6>
        <div class="d-flex flex-wrap gap-1">
          <v-chip
            v-for="actuator in actuators"
            :key="`actuator-${actuator.gpio}`"
            size="x-small"
            color="warning"
            variant="tonal"
            class="mb-1"
          >
            <v-icon :icon="getActuatorIcon(actuator.type)" size="x-small" class="mr-1" />
            GPIO {{ actuator.gpio }}: {{ actuator.name }}
          </v-chip>
        </div>
      </div>

      <!-- Leere Subzone -->
      <div v-if="sensors.length === 0 && actuators.length === 0" class="text-center py-3">
        <v-icon icon="mdi-map-marker-off" size="32" color="grey-lighten-1" />
        <p class="text-caption text-grey mt-2">Keine Geräte zugewiesen</p>
        <p class="text-caption text-grey">Pins hier ablegen oder konfigurieren</p>
      </div>
    </template>
  </UnifiedCard>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
  subzone: {
    type: Object,
    required: true,
  },
  unconfiguredPins: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['edit', 'delete', 'pin-drop'])

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)

// Reactive state
const isDropZoneActive = ref(false)

// Computed properties
const deviceInfo = computed(() => {
  return mqttStore.value.espDevices.get(props.espId) || {}
})

const sensors = computed(() => {
  const subzoneData = deviceInfo.value.subzones?.get(props.subzone.id)
  return subzoneData?.sensors ? Array.from(subzoneData.sensors.values()) : []
})

const actuators = computed(() => {
  const subzoneData = deviceInfo.value.subzones?.get(props.subzone.id)
  return subzoneData?.actuators ? Array.from(subzoneData.actuators.values()) : []
})

const totalDevices = computed(() => {
  return sensors.value.length + actuators.value.length
})

// Methods
const getSensorIcon = (type) => {
  const icons = {
    SENSOR_TEMP_DS18B20: 'mdi-thermometer',
    SENSOR_SOIL: 'mdi-water-percent',
    SENSOR_FLOW: 'mdi-water',
    SENSOR_HUMIDITY: 'mdi-water-percent',
    SENSOR_PRESSURE: 'mdi-gauge',
    SENSOR_LIGHT: 'mdi-white-balance-sunny',
  }
  return icons[type] || 'mdi-thermometer'
}

const getActuatorIcon = (type) => {
  const icons = {
    AKTOR_RELAIS: 'mdi-switch',
    AKTOR_PUMP: 'mdi-pump',
    AKTOR_VALVE: 'mdi-valve',
    AKTOR_HUMIDIFIER: 'mdi-water',
    AKTOR_FAN: 'mdi-fan',
    AKTOR_LIGHT: 'mdi-lightbulb',
  }
  return icons[type] || 'mdi-cog'
}

// Drag & Drop handlers
const handleDragOver = (event) => {
  event.preventDefault()
  isDropZoneActive.value = true
}

const handleDragLeave = (event) => {
  // Only deactivate if leaving the card entirely
  if (!event.currentTarget.contains(event.relatedTarget)) {
    isDropZoneActive.value = false
  }
}

const handleDrop = (event) => {
  event.preventDefault()
  isDropZoneActive.value = false

  const pinData = event.dataTransfer.getData('application/json')
  if (pinData) {
    try {
      const pin = JSON.parse(pinData)
      emit('pin-drop', {
        pin: pin.pin,
        subzoneId: props.subzone.id,
        espId: props.espId,
      })
    } catch (error) {
      console.error('Invalid pin data:', error)
    }
  }
}
</script>

<style scoped>
.subzone-tree-card {
  transition: all 0.3s ease;
  min-height: 200px;
}

.subzone-tree-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.drop-zone-active {
  background-color: rgba(var(--v-theme-primary), 0.05);
  border: 2px dashed rgb(var(--v-theme-primary));
}

.drop-zone-indicator {
  background-color: rgba(var(--v-theme-primary), 0.1);
  border-radius: 8px;
  border: 2px dashed rgb(var(--v-theme-primary));
}
</style>
