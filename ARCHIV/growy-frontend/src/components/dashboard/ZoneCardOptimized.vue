<template>
  <UnifiedCard
    :title="getZoneDisplayName(zone)"
    :icon="'mdi-view-grid'"
    :status="zone.status"
    :compact="centralDataHub.isMobile"
    :interactive="true"
    :show-actions="true"
    @click="handleZoneClick"
  >
    <!-- Aggregations Section -->
    <div
      v-if="centralDataHub.uiConfig.showAggregations && zoneAggregations.length > 0"
      class="mb-4"
    >
      <div class="d-flex align-center mb-2">
        <v-icon icon="mdi-chart-line" size="small" class="mr-2 text-gray-500" />
        <span class="text-sm font-medium text-gray-600">Sensor-Zusammenfassung</span>
        <v-tooltip location="top">
          <template v-slot:activator="{ props }">
            <v-icon v-bind="props" icon="mdi-information" size="small" class="ml-2 text-gray-400" />
          </template>
          Zeigt Durchschnitt, Minimum und Maximum aller Sensoren dieser Zone im gewählten
          Zeitfenster
        </v-tooltip>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <v-tooltip v-for="agg in zoneAggregations" :key="`agg-${agg.type}`" location="top">
          <template v-slot:activator="{ props }">
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
          <div class="text-center">
            <div class="font-weight-medium">{{ agg.label }} - Zusammenfassung</div>
            <div class="text-caption">Durchschnitt: {{ agg.avg.toFixed(1) }}{{ agg.unit }}</div>
            <div class="text-caption">
              Bereich: {{ agg.min.toFixed(1) }} - {{ agg.max.toFixed(1) }}{{ agg.unit }}
            </div>
            <div class="text-caption">{{ agg.count }} Sensoren</div>
          </div>
        </v-tooltip>
      </div>
    </div>

    <!-- Actuators Section -->
    <div v-if="zoneActuators.length > 0" class="mb-4">
      <div class="d-flex align-center mb-3">
        <v-icon icon="mdi-lightning-bolt" size="small" class="mr-2 text-orange-500" />
        <span class="text-sm font-medium text-gray-600">Aktoren</span>
        <v-tooltip location="top">
          <template v-slot:activator="{ props }">
            <v-icon v-bind="props" icon="mdi-information" size="small" class="ml-2 text-gray-400" />
          </template>
          Steuerbare Aktoren in dieser Zone
        </v-tooltip>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

    <!-- Actions -->
    <template #actions>
      <v-btn
        variant="text"
        :to="zone.espId ? `/zone/${zone.espId}/config` : ''"
        :disabled="!centralDataHub.mqttStore.value.isConnected || !zone.espId"
      >
        Konfigurieren
      </v-btn>
      <v-btn
        variant="text"
        color="primary"
        :loading="refreshing"
        @click="refreshStatus"
        :disabled="!centralDataHub.mqttStore.value.isConnected"
      >
        Aktualisieren
      </v-btn>
    </template>
  </UnifiedCard>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'
import ActuatorCard from '@/components/dashboard/ActuatorCard.vue'
import SubZoneCard from '@/components/dashboard/SubZoneCard.vue'

const props = defineProps({
  zone: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['zone-click', 'actuator-toggle', 'actuator-value', 'logic-saved'])

const centralDataHub = useCentralDataHub()
const refreshing = ref(false)

// Computed Properties
const zoneAggregations = computed(() => {
  if (!props.zone.espId) return []
  return centralDataHub.getSensorAggregations(props.zone.espId)
})

const zoneActuators = computed(() => {
  if (!props.zone.espId) return []

  const mqttStore = centralDataHub.mqttStore
  const device = mqttStore.value.espDevices.get(props.zone.espId)
  if (!device?.subzones) return []

  const actuators = []
  device.subzones.forEach((subzone) => {
    if (subzone.actuators) {
      actuators.push(
        ...subzone.actuators.map((actuator) => ({
          ...actuator,
          espId: props.zone.espId,
          subzoneName: subzone.name,
        })),
      )
    }
  })

  return actuators
})

const subZones = computed(() => {
  if (!props.zone.espId) return []

  const mqttStore = centralDataHub.mqttStore
  const device = mqttStore.value.espDevices.get(props.zone.espId)
  return device?.subzones || []
})

// Methods
function getZoneDisplayName(zone) {
  return zone.name || zone.espId || 'Unbekannte Zone'
}

function getSensorColor(type) {
  const sensorColors = {
    SENSOR_TEMP_DS18B20: 'red',
    SENSOR_MOISTURE: 'blue',
    SENSOR_LIGHT: 'yellow',
    SENSOR_HUMIDITY: 'green',
  }
  return sensorColors[type] || 'grey'
}

function getSensorIcon(type) {
  const sensorIcons = {
    SENSOR_TEMP_DS18B20: 'mdi-thermometer',
    SENSOR_MOISTURE: 'mdi-water',
    SENSOR_LIGHT: 'mdi-white-balance-sunny',
    SENSOR_HUMIDITY: 'mdi-water-percent',
  }
  return sensorIcons[type] || 'mdi-sensor'
}

function getSensorDisplayName(type) {
  const sensorNames = {
    SENSOR_TEMP_DS18B20: 'Temperatur',
    SENSOR_MOISTURE: 'Feuchtigkeit',
    SENSOR_LIGHT: 'Licht',
    SENSOR_HUMIDITY: 'Luftfeuchtigkeit',
  }
  return sensorNames[type] || type
}

function formatAggregationValue(agg) {
  return `${agg.avg.toFixed(1)}${agg.unit}`
}

function handleZoneClick() {
  emit('zone-click', props.zone)
}

function handleActuatorToggle(actuator) {
  emit('actuator-toggle', actuator)
}

function handleActuatorValue(actuator, value) {
  emit('actuator-value', actuator, value)
}

function handleLogicSaved(actuator) {
  emit('logic-saved', actuator)
}

async function refreshStatus() {
  refreshing.value = true
  try {
    // Verwende zentrale Datenabfrage
    await centralDataHub.getOptimizedDeviceData(props.zone.espId)
  } catch (error) {
    centralDataHub.handleError(error, 'refresh-zone-status')
  } finally {
    refreshing.value = false
  }
}
</script>

<style scoped>
.grid {
  display: grid;
}

.grid-cols-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.gap-4 {
  gap: 1rem;
}

.space-y-6 > * + * {
  margin-top: 1.5rem;
}

@media (min-width: 768px) {
  .md\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .lg\:grid-cols-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
