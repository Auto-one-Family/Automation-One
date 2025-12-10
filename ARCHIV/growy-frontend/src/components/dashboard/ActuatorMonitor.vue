<template>
  <v-card variant="outlined" class="actuator-monitor">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-lightning-bolt" class="mr-2" color="warning" />
      Aktor-Monitor
      <v-chip size="small" color="warning" variant="tonal" class="ml-2">
        {{ filteredActuators.length }} Aktoren
      </v-chip>
      <v-spacer />
      <v-btn
        icon="mdi-refresh"
        size="small"
        variant="text"
        @click="refreshActuators"
        :loading="refreshing"
      />
    </v-card-title>

    <v-card-text>
      <!-- Filter-Sektion -->
      <div class="mb-4">
        <v-row>
          <v-col cols="12" md="3">
            <v-select
              v-model="filters.type"
              :items="actuatorTypes"
              label="Aktor-Typ"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="comfortable"
              clearable
              prepend-inner-icon="mdi-filter"
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="filters.status"
              :items="statusOptions"
              label="Status"
              variant="outlined"
              density="comfortable"
              clearable
              prepend-inner-icon="mdi-state-machine"
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="filters.zone"
              :items="availableZones"
              label="Zone"
              variant="outlined"
              density="comfortable"
              clearable
              prepend-inner-icon="mdi-map-marker"
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-text-field
              v-model="filters.search"
              label="Suche"
              variant="outlined"
              density="comfortable"
              clearable
              prepend-inner-icon="mdi-magnify"
            />
          </v-col>
        </v-row>
      </div>

      <!-- Aktoren-Tabelle -->
      <v-data-table
        :headers="headers"
        :items="filteredActuators"
        :loading="refreshing"
        density="comfortable"
        class="actuator-table"
      >
        <!-- Name Column -->
        <template #[`item.name`]="{ item }">
          <div class="d-flex align-center">
            <v-icon :icon="getActuatorIcon(item.type)" size="small" class="mr-2" color="warning" />
            <span class="font-weight-medium">{{ item.name }}</span>
          </div>
        </template>

        <!-- Zone Column -->
        <template #[`item.zone`]="{ item }">
          <v-chip size="x-small" variant="tonal" color="primary">
            {{ item.zone || 'Hauptzone' }}
          </v-chip>
        </template>

        <!-- GPIO Column -->
        <template #[`item.gpio`]="{ item }">
          <code class="text-caption">{{ item.gpio }}</code>
        </template>

        <!-- Type Column -->
        <template #[`item.type`]="{ item }">
          <v-chip size="x-small" variant="tonal">
            {{ getActuatorTypeLabel(item.type) }}
          </v-chip>
        </template>

        <!-- Status Column -->
        <template #[`item.status`]="{ item }">
          <div class="d-flex align-center">
            <v-chip
              :color="getActuatorStatusColor(item)"
              size="x-small"
              variant="tonal"
              class="mr-2"
            >
              {{ getActuatorStatusText(item) }}
            </v-chip>
            <!-- Status-Indikator -->
            <v-icon
              v-if="item.pendingState !== undefined"
              icon="mdi-sync"
              size="small"
              color="info"
              class="mr-1"
            />
            <v-icon
              v-else-if="item.confirmedState !== item.desiredState"
              icon="mdi-alert"
              size="small"
              color="error"
              class="mr-1"
            />
          </div>
        </template>

        <!-- Last Change Column -->
        <template #[`item.lastChange`]="{ item }">
          <span class="text-caption">
            {{ formatLastChange(item.lastUpdate) }}
          </span>
        </template>

        <!-- Actions Column -->
        <template #[`item.actions`]="{ item }">
          <div class="d-flex gap-1">
            <v-btn
              :icon="item.state ? 'mdi-power-off' : 'mdi-power'"
              size="x-small"
              :color="item.state ? 'error' : 'success'"
              :disabled="mqttStore.value.isSafeMode || item.pendingState !== undefined"
              @click="toggleActuator(item)"
              variant="tonal"
            >
              <HelpfulHints
                :use-tooltip-mode="true"
                :tooltip-text="`${item.state ? 'Deaktivieren' : 'Aktivieren'} von ${item.name}`"
                :tooltip-title="`${item.state ? 'Ausschalten' : 'Einschalten'}`"
              />
            </v-btn>

            <v-btn icon="mdi-cog" size="x-small" variant="text" @click="configureActuator(item)">
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Aktor-Konfiguration öffnen"
                tooltip-title="Konfigurieren"
              />
            </v-btn>

            <!-- ✅ NEU: Konfiguration übertragen -->
            <v-btn
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              @click="openCopyDialog(item)"
              :disabled="!hasLogicConfiguration(item)"
            >
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Konfiguration auf andere Aktoren übertragen"
                tooltip-title="Kopieren"
              />
            </v-btn>

            <v-btn
              icon="mdi-chart-line"
              size="x-small"
              variant="text"
              @click="showActuatorHistory(item)"
            >
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Aktor-Verlauf anzeigen"
                tooltip-title="Verlauf"
              />
            </v-btn>
          </div>
        </template>
      </v-data-table>

      <!-- Bulk Actions -->
      <div v-if="filteredActuators.length > 0" class="mt-4">
        <v-divider class="mb-3" />
        <div class="d-flex align-center justify-space-between">
          <span class="text-caption text-grey">
            {{ filteredActuators.length }} Aktoren ausgewählt
          </span>
          <div class="d-flex gap-2">
            <v-btn
              color="success"
              size="small"
              variant="tonal"
              @click="bulkActivate"
              :disabled="mqttStore.value.isSafeMode"
            >
              Alle aktivieren
            </v-btn>
            <v-btn
              color="error"
              size="small"
              variant="tonal"
              @click="bulkDeactivate"
              :disabled="mqttStore.value.isSafeMode"
            >
              Alle deaktivieren
            </v-btn>
          </div>
        </div>
      </div>
    </v-card-text>

    <!-- ✅ NEU: Konfiguration-Kopier-Dialog -->
    <v-dialog v-model="showCopyDialog" max-width="600">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-content-copy" class="mr-2" />
          Konfiguration übertragen: {{ selectedActuator?.name }}
        </v-card-title>

        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Wählen Sie die Ziel-Aktoren aus, auf die diese Konfiguration übertragen werden soll.
          </v-alert>

          <!-- Ziel-Aktoren Auswahl -->
          <v-list>
            <v-list-item
              v-for="targetActuator in compatibleTargetActuators"
              :key="`${targetActuator.espId}-${targetActuator.gpio}`"
            >
              <template v-slot:prepend>
                <v-checkbox
                  v-model="selectedTargetActuators"
                  :value="`${targetActuator.espId}-${targetActuator.gpio}`"
                  hide-details
                />
              </template>

              <v-list-item-title>
                {{ targetActuator.name }}
              </v-list-item-title>

              <v-list-item-subtitle>
                ESP {{ targetActuator.espId }} (GPIO {{ targetActuator.gpio }}) -
                {{ targetActuator.zone }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>

          <!-- Kopier-Optionen -->
          <v-expansion-panels class="mt-4">
            <v-expansion-panel>
              <v-expansion-panel-title>
                <v-icon icon="mdi-cog" class="mr-2" />
                Kopier-Optionen
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-checkbox
                  v-model="copyOptions.adaptSensorReferences"
                  label="Sensor-Referenzen an Ziel-ESP anpassen"
                  hide-details
                />
                <v-checkbox
                  v-model="copyOptions.copyTimers"
                  label="Timer-Konfiguration kopieren"
                  hide-details
                />
                <v-checkbox
                  v-model="copyOptions.copyFailsafe"
                  label="Failsafe-Einstellungen kopieren"
                  hide-details
                />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCopyDialog = false" variant="text"> Abbrechen </v-btn>
          <v-btn
            color="primary"
            @click="copyConfiguration"
            :loading="copying"
            :disabled="selectedTargetActuators.length === 0"
          >
            Konfiguration übertragen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Aktor-Verlauf Dialog -->
    <v-dialog v-model="showHistoryDialog" max-width="800">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon :icon="getActuatorIcon(selectedActuator?.type)" class="mr-2" />
          Verlauf: {{ selectedActuator?.name }}
        </v-card-title>
        <v-card-text>
          <div v-if="actuatorHistory.length > 0">
            <v-timeline density="compact">
              <v-timeline-item
                v-for="event in actuatorHistory"
                :key="event.timestamp"
                :color="getEventColor(event)"
                size="small"
              >
                <div class="d-flex justify-space-between align-center">
                  <div>
                    <div class="font-weight-medium">{{ event.action }}</div>
                    <div class="text-caption text-grey">{{ event.description }}</div>
                  </div>
                  <div class="text-caption">
                    {{ formatDateTime(event.timestamp) }}
                  </div>
                </div>
              </v-timeline-item>
            </v-timeline>
          </div>
          <v-alert v-else type="info" variant="tonal">
            Kein Verlauf verfügbar für diesen Aktor.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showHistoryDialog = false" variant="text"> Schließen </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatDateTime, formatRelativeTime } from '@/utils/time'
import HelpfulHints from '@/components/common/HelpfulHints.vue'
import { safeSnackbar } from '@/utils/snackbarUtils'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const actuatorLogic = computed(() => centralDataHub.actuatorLogic)

// Reactive Data
const refreshing = ref(false)
const showHistoryDialog = ref(false)
const selectedActuator = ref(null)
const actuatorHistory = ref([])

// ✅ NEU: Kopier-Dialog State
const showCopyDialog = ref(false)
const selectedTargetActuators = ref([])
const copying = ref(false)
const copyOptions = ref({
  adaptSensorReferences: true,
  copyTimers: true,
  copyFailsafe: true,
})

// Filter
const filters = ref({
  type: null,
  status: null,
  zone: null,
  search: '',
})

// Table Headers
const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Zone', key: 'zone', sortable: true },
  { title: 'GPIO', key: 'gpio', sortable: true, width: '80px' },
  { title: 'Typ', key: 'type', sortable: true },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Letzter Wechsel', key: 'lastChange', sortable: true },
  { title: 'Aktionen', key: 'actions', sortable: false, width: '120px' },
]

// Computed Properties
const allActuators = computed(() => {
  const actuators = []

  mqttStore.value.espDevices.forEach((device, espId) => {
    if (device.actuators) {
      device.actuators.forEach((actuator) => {
        actuators.push({
          ...actuator,
          espId,
          zone: device.zone || 'Hauptzone',
        })
      })
    }
  })

  return actuators
})

const filteredActuators = computed(() => {
  let filtered = allActuators.value

  // Type Filter
  if (filters.value.type) {
    filtered = filtered.filter((actuator) => actuator.type === filters.value.type)
  }

  // Status Filter
  if (filters.value.status) {
    filtered = filtered.filter((actuator) => {
      const status = getActuatorStatusText(actuator)
      return status === filters.value.status
    })
  }

  // Zone Filter
  if (filters.value.zone) {
    filtered = filtered.filter((actuator) => actuator.zone === filters.value.zone)
  }

  // Search Filter
  if (filters.value.search) {
    const search = filters.value.search.toLowerCase()
    filtered = filtered.filter(
      (actuator) =>
        actuator.name.toLowerCase().includes(search) ||
        actuator.type.toLowerCase().includes(search) ||
        actuator.zone.toLowerCase().includes(search),
    )
  }

  return filtered
})

const actuatorTypes = [
  { label: 'Relais', value: 'ACTUATOR_RELAY' },
  { label: 'Pumpe', value: 'ACTUATOR_PUMP' },
  { label: 'Ventil', value: 'ACTUATOR_VALVE' },
  { label: 'LED', value: 'ACTUATOR_LED' },
  { label: 'Motor', value: 'ACTUATOR_MOTOR' },
  { label: 'Heizung', value: 'ACTUATOR_HEATER' },
  { label: 'Lüfter', value: 'ACTUATOR_FAN' },
  { label: 'Befeuchter', value: 'ACTUATOR_HUMIDIFIER' },
]

const statusOptions = ['Aktiv', 'Inaktiv', 'Wird geschaltet...', 'Nicht bestätigt']

const availableZones = computed(() => {
  const zones = new Set()
  allActuators.value.forEach((actuator) => {
    zones.add(actuator.zone)
  })
  return Array.from(zones).sort()
})

// ✅ NEU: Kompatible Ziel-Aktoren
const compatibleTargetActuators = computed(() => {
  if (!selectedActuator.value) return []

  return allActuators.value.filter((actuator) => {
    // Nicht den Quell-Aktor
    if (
      actuator.espId === selectedActuator.value.espId &&
      actuator.gpio === selectedActuator.value.gpio
    ) {
      return false
    }

    // Gleicher Typ (optional)
    return actuator.type === selectedActuator.value.type
  })
})

// ✅ NEU: Prüfen ob Aktor Logik-Konfiguration hat
const hasLogicConfiguration = (actuator) => {
  return actuatorLogic.value.getActuatorLogic(actuator.espId, actuator.gpio) !== null
}

// Methods
const getActuatorIcon = (type) => {
  const icons = {
    ACTUATOR_RELAY: 'mdi-power',
    ACTUATOR_PUMP: 'mdi-pump',
    ACTUATOR_VALVE: 'mdi-valve',
    ACTUATOR_LED: 'mdi-lightbulb',
    ACTUATOR_MOTOR: 'mdi-engine',
    ACTUATOR_HEATER: 'mdi-fire',
    ACTUATOR_FAN: 'mdi-fan',
    ACTUATOR_HUMIDIFIER: 'mdi-air-humidifier',
  }
  return icons[type] || 'mdi-power'
}

const getActuatorTypeLabel = (type) => {
  const labels = {
    ACTUATOR_RELAY: 'Relais',
    ACTUATOR_PUMP: 'Pumpe',
    ACTUATOR_VALVE: 'Ventil',
    ACTUATOR_LED: 'LED',
    ACTUATOR_MOTOR: 'Motor',
    ACTUATOR_HEATER: 'Heizung',
    ACTUATOR_FAN: 'Lüfter',
    ACTUATOR_HUMIDIFIER: 'Befeuchter',
  }
  return labels[type] || type
}

const getActuatorStatusColor = (actuator) => {
  if (actuator.pendingState !== undefined) return 'info'
  if (actuator.confirmedState !== actuator.desiredState) return 'error'
  if (actuator.confirmedState) return 'success'
  return 'grey'
}

const getActuatorStatusText = (actuator) => {
  if (actuator.pendingState !== undefined) return 'Wird geschaltet...'
  if (actuator.confirmedState !== actuator.desiredState) return 'Nicht bestätigt'
  if (actuator.confirmedState) return 'Aktiv'
  return 'Inaktiv'
}

const formatLastChange = (timestamp) => {
  if (!timestamp) return '—'
  return formatRelativeTime(timestamp)
}

const refreshActuators = async () => {
  refreshing.value = true
  try {
    // Status aller ESPs aktualisieren
    for (const [espId] of mqttStore.value.espDevices) {
      await mqttStore.value.sendSystemCommand(espId, 'status_request', {})
    }
    safeSnackbar('success', 'Aktor-Status aktualisiert')
  } catch (error) {
    console.error('Failed to refresh actuators:', error)
    safeSnackbar('error', 'Fehler beim Aktualisieren')
  } finally {
    refreshing.value = false
  }
}

const toggleActuator = async (actuator) => {
  try {
    const newState = !actuator.state
    await mqttStore.value.sendActuatorCommand(
      actuator.espId,
      actuator.gpio,
      'set_value',
      newState ? 1 : 0,
    )
    safeSnackbar('success', `${actuator.name} ${newState ? 'aktiviert' : 'deaktiviert'}`)
  } catch (error) {
    console.error('Failed to toggle actuator:', error)
    safeSnackbar('error', `Fehler beim Umschalten: ${error.message}`)
  }
}

const configureActuator = (actuator) => {
  // Navigation zu den Einstellungen mit fokussiertem Aktor
  window.$router?.push({
    path: '/settings',
    query: {
      espId: actuator.espId,
      focus: 'actuator',
      actuatorGpio: actuator.gpio,
    },
  })
}

const showActuatorHistory = (actuator) => {
  selectedActuator.value = actuator
  // Simuliere Verlauf (in der echten Implementierung würde hier die Historie geladen)
  actuatorHistory.value = [
    {
      timestamp: Date.now() - 300000, // 5 Minuten ago
      action: 'Aktiviert',
      description: 'Manuell über Dashboard',
      type: 'manual',
    },
    {
      timestamp: Date.now() - 600000, // 10 Minuten ago
      action: 'Deaktiviert',
      description: 'Automatisch nach Zeitplan',
      type: 'automatic',
    },
    {
      timestamp: Date.now() - 900000, // 15 Minuten ago
      action: 'Aktiviert',
      description: 'Durch Temperatur-Sensor',
      type: 'sensor',
    },
  ]
  showHistoryDialog.value = true
}

const getEventColor = (event) => {
  const colors = {
    manual: 'primary',
    automatic: 'info',
    sensor: 'success',
    error: 'error',
  }
  return colors[event.type] || 'grey'
}

const bulkActivate = async () => {
  try {
    const promises = filteredActuators.value.map((actuator) =>
      mqttStore.value.sendActuatorCommand(actuator.espId, actuator.gpio, 'set_value', 1),
    )
    await Promise.all(promises)
    safeSnackbar('success', `${filteredActuators.value.length} Aktoren aktiviert`)
  } catch (error) {
    console.error('Failed to bulk activate:', error)
    safeSnackbar('error', 'Fehler beim Massenaktivierung')
  }
}

const bulkDeactivate = async () => {
  try {
    const promises = filteredActuators.value.map((actuator) =>
      mqttStore.value.sendActuatorCommand(actuator.espId, actuator.gpio, 'set_value', 0),
    )
    await Promise.all(promises)
    safeSnackbar('success', `${filteredActuators.value.length} Aktoren deaktiviert`)
  } catch (error) {
    console.error('Failed to bulk deactivate:', error)
    safeSnackbar('error', 'Fehler beim Massendeaktivierung')
  }
}

// ✅ NEU: Kopier-Dialog öffnen
const openCopyDialog = (actuator) => {
  selectedActuator.value = actuator
  selectedTargetActuators.value = []
  showCopyDialog.value = true
}

// ✅ NEU: Konfiguration kopieren
const copyConfiguration = async () => {
  if (!selectedActuator.value || selectedTargetActuators.value.length === 0) return

  copying.value = true

  try {
    const sourceEspId = selectedActuator.value.espId
    const sourceGpio = selectedActuator.value.gpio

    for (const targetKey of selectedTargetActuators.value) {
      const [targetEspId, targetGpio] = targetKey.split('-')

      await actuatorLogic.value.copyActuatorLogic(
        sourceEspId,
        parseInt(sourceGpio),
        targetEspId,
        parseInt(targetGpio),
        copyOptions.value,
      )
    }

    safeSnackbar(
      'success',
      `Konfiguration erfolgreich auf ${selectedTargetActuators.value.length} Aktoren übertragen`,
    )

    showCopyDialog.value = false
  } catch (error) {
    console.error('Failed to copy configuration:', error)
    safeSnackbar('error', `Fehler beim Kopieren: ${error.message}`)
  } finally {
    copying.value = false
  }
}

// Auto-refresh every 30 seconds
onMounted(() => {
  const interval = setInterval(() => {
    if (!refreshing.value) {
      refreshActuators()
    }
  }, 30000)

  // Cleanup on unmount
  return () => clearInterval(interval)
})
</script>

<style scoped>
.actuator-monitor {
  height: 100%;
}

.actuator-table {
  max-height: 600px;
  overflow-y: auto;
}

.actuator-table :deep(.v-data-table__wrapper) {
  overflow-y: auto;
}
</style>
