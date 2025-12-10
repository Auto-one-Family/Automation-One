<template>
  <UnifiedCard
    variant="outlined"
    class="database-logs-card"
    title="📊 Protokolle & Datenbank-Logs"
    icon="mdi-database"
    :show-header-actions="true"
    :show-actions="true"
  >
    <!-- Header Actions -->
    <template #header-actions>
      <!-- Status-Chip -->
      <v-chip :color="getCardStatusColor()" size="small" variant="tonal">
        {{ getStatusText() }}
      </v-chip>
    </template>

    <!-- Content -->
    <template #content>
      <!-- 🆕 NEU: Geführte Filterführung -->
      <v-row class="mb-4" v-if="showFilterGuidance">
        <v-col cols="12">
          <v-alert type="info" variant="tonal" class="mb-4">
            <template #prepend>
              <v-icon icon="mdi-lightbulb" />
            </template>
            <div class="d-flex align-center justify-space-between">
              <span><strong>Geführte Suche:</strong> {{ currentGuidanceStep }}</span>
              <v-btn size="small" variant="text" @click="showFilterGuidance = false">
                Überspringen
              </v-btn>
            </div>
          </v-alert>
        </v-col>
      </v-row>

      <!-- Filter-Sektion -->
      <v-row class="mb-4">
        <v-col cols="12" md="3">
          <v-select
            v-model="filters.dataType"
            label="Daten-Typ"
            :items="dataTypeOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            clearable
            @update:model-value="debouncedLoadData"
          >
            <template #append>
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Wählen Sie den Typ der Daten, die Sie analysieren möchten"
                tooltip-title="Daten-Typ"
                tooltip-details="Sensordaten, Aktor-Zustände, ESP-Geräte, etc."
              />
            </template>
          </v-select>
        </v-col>

        <v-col cols="12" md="3">
          <v-select
            v-model="filters.espId"
            label="Feld-Gerät"
            :items="espDeviceOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            clearable
            @update:model-value="debouncedLoadData"
          >
            <template #append>
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Wählen Sie ein spezifisches Feld-Gerät (ESP)"
                tooltip-title="Feld-Gerät"
                tooltip-details="Filtert Daten nach ESP-ID"
              />
            </template>
          </v-select>
        </v-col>

        <v-col cols="12" md="3">
          <v-select
            v-model="filters.sensorType"
            label="Sensor-Typ"
            :items="sensorTypeOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            clearable
            @update:model-value="debouncedLoadData"
          >
            <template #append>
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Wählen Sie einen spezifischen Sensor-Typ"
                tooltip-title="Sensor-Typ"
                tooltip-details="Filtert nach Sensor-Kategorien"
              />
            </template>
          </v-select>
        </v-col>

        <v-col cols="12" md="3">
          <v-select
            v-model="filters.timeRange"
            label="Zeitraum"
            :items="timeRangeOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            @update:model-value="debouncedLoadData"
          >
            <template #append>
              <HelpfulHints
                :use-tooltip-mode="true"
                tooltip-text="Wählen Sie den Zeitraum für die Datenanalyse"
                tooltip-title="Zeitraum"
                tooltip-details="Letzte Stunde, Tag, Woche, etc."
              />
            </template>
          </v-select>
        </v-col>
      </v-row>

      <!-- 🆕 NEU: Erweiterte Filter -->
      <v-row class="mb-4" v-if="showAdvancedFilters">
        <v-col cols="12" md="3">
          <v-select
            v-model="filters.zoneId"
            label="Zone"
            :items="zoneOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            clearable
            @update:model-value="debouncedLoadData"
          />
        </v-col>

        <v-col cols="12" md="3">
          <v-select
            v-model="filters.subzoneId"
            label="Subzone"
            :items="subzoneOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            clearable
            @update:model-value="debouncedLoadData"
          />
        </v-col>

        <v-col cols="12" md="3">
          <v-select
            v-model="filters.logLevel"
            label="Log-Level"
            :items="logLevelOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            clearable
            @update:model-value="debouncedLoadData"
          />
        </v-col>

        <v-col cols="12" md="3">
          <v-text-field
            v-model="filters.searchTerm"
            label="Suche"
            variant="outlined"
            density="comfortable"
            clearable
            prepend-inner-icon="mdi-magnify"
            @update:model-value="debouncedLoadData"
            placeholder="Nach Text suchen..."
          />
        </v-col>
      </v-row>

      <!-- Filter-Aktionen -->
      <v-row class="mb-4">
        <v-col cols="12">
          <div class="d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-btn
                size="small"
                variant="text"
                @click="showAdvancedFilters = !showAdvancedFilters"
                prepend-icon="mdi-filter-variant"
              >
                {{ showAdvancedFilters ? 'Einfache Filter' : 'Erweiterte Filter' }}
              </v-btn>

              <v-btn
                size="small"
                variant="text"
                @click="resetFilters"
                prepend-icon="mdi-refresh"
                class="ml-2"
              >
                Filter zurücksetzen
              </v-btn>

              <v-btn
                size="small"
                variant="text"
                @click="startFilterGuidance"
                prepend-icon="mdi-help-circle"
                class="ml-2"
              >
                Hilfe
              </v-btn>
            </div>

            <div class="d-flex align-center">
              <v-chip size="small" color="info" variant="tonal" class="mr-2">
                {{ totalRecords }} Einträge
              </v-chip>

              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                prepend-icon="mdi-download"
                @click="exportData"
                :loading="exporting"
                :disabled="!hasData"
              >
                Export
              </v-btn>
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- 🆕 NEU: Daten-Visualisierung -->
      <v-row v-if="hasData && showVisualization" class="mb-4">
        <v-col cols="12">
          <v-card variant="tonal" class="mt-4 pa-3">
            <div class="d-flex align-center mb-2">
              <v-icon icon="mdi-chart-line" class="mr-2" />
              <span class="text-subtitle-2">Daten-Visualisierung</span>
              <v-spacer />
              <v-btn size="small" variant="text" @click="showVisualization = false">
                <v-icon icon="mdi-close" />
              </v-btn>
            </div>
            <div class="text-caption text-grey">
              {{ getVisualizationDescription() }}
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Daten-Tabelle -->
      <v-row>
        <v-col cols="12">
          <v-data-table
            :headers="tableHeaders"
            :items="tableData"
            :loading="loading"
            :items-per-page="itemsPerPage"
            :page="currentPage"
            :server-items-length="totalRecords"
            @update:options="handleTableUpdate"
            class="elevation-1"
            density="comfortable"
            hover
          >
            <!-- 🆕 NEU: Custom Cell Templates -->
            <template #[`item.timestamp`]="{ item }">
              <div class="d-flex flex-column">
                <span class="text-body-2">{{ formatTimestamp(item.timestamp) }}</span>
                <span class="text-caption text-grey">{{ formatRelativeTime(item.timestamp) }}</span>
              </div>
            </template>

            <template #[`item.esp_id`]="{ item }">
              <div class="d-flex align-center">
                <v-icon icon="mdi-chip" size="small" class="mr-1" />
                <span class="text-body-2">{{ item.esp_id }}</span>
              </div>
            </template>

            <template #[`item.sensor_type`]="{ item }">
              <v-chip :color="getDataTypeColor(item.sensor_type)" size="x-small" variant="tonal">
                {{ getDataTypeLabel(item.sensor_type) }}
              </v-chip>
            </template>

            <template #[`item.processed_value`]="{ item }">
              <div class="d-flex align-center">
                <span class="text-body-2">{{ formatValue(item) }}</span>
                <v-chip v-if="item.unit" size="x-small" variant="outlined" class="ml-1">
                  {{ item.unit }}
                </v-chip>
              </div>
            </template>

            <template #[`item.status`]="{ item }">
              <v-chip :color="getItemStatusColor(item.status)" size="x-small" variant="tonal">
                {{ item.status }}
              </v-chip>
            </template>

            <template #[`item.actions`]="{ item }">
              <div class="d-flex align-center">
                <v-btn icon="mdi-eye" size="x-small" variant="text" @click="viewDetails(item)">
                  <HelpfulHints
                    :use-tooltip-mode="true"
                    tooltip-text="Details anzeigen"
                    tooltip-title="Details"
                  />
                </v-btn>
                <v-btn icon="mdi-chart-line" size="x-small" variant="text" @click="showChart(item)">
                  <HelpfulHints
                    :use-tooltip-mode="true"
                    tooltip-text="Chart anzeigen"
                    tooltip-title="Chart"
                  />
                </v-btn>
              </div>
            </template>
          </v-data-table>
        </v-col>
      </v-row>

      <!-- 🆕 NEU: Pagination -->
      <v-row v-if="totalPages > 1" class="mt-4">
        <v-col cols="12">
          <div class="d-flex align-center justify-space-between">
            <div class="text-caption text-grey">
              Seite {{ currentPage }} von {{ totalPages }} ({{ totalRecords }} Einträge)
            </div>
            <v-pagination
              v-model="currentPage"
              :length="totalPages"
              :total-visible="7"
              @update:model-value="handlePageChange"
            />
          </div>
        </v-col>
      </v-row>
    </template>

    <!-- Actions -->
    <template #actions>
      <v-btn
        size="small"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-refresh"
        @click="loadData"
        :loading="loading"
      >
        Aktualisieren
      </v-btn>

      <v-btn
        size="small"
        color="secondary"
        variant="tonal"
        prepend-icon="mdi-chart-line"
        @click="showVisualization = !showVisualization"
        :disabled="!hasData"
      >
        {{ showVisualization ? 'Chart ausblenden' : 'Chart anzeigen' }}
      </v-btn>

      <v-spacer />

      <v-btn
        size="small"
        color="warning"
        variant="tonal"
        prepend-icon="mdi-delete"
        @click="clearLogs"
        :loading="clearing"
        :disabled="!hasData"
      >
        Logs löschen
      </v-btn>
    </template>
  </UnifiedCard>

  <!-- 🆕 NEU: Detail-Dialog -->
  <v-dialog v-model="showDetailDialog" max-width="600">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-information" class="mr-2" />
        Datensatz-Details
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="showDetailDialog = false" />
      </v-card-title>
      <v-card-text>
        <v-list density="compact" variant="text">
          <v-list-item v-for="(value, key) in selectedRecord" :key="key">
            <template #prepend>
              <v-icon icon="mdi-tag" size="small" />
            </template>
            <v-list-item-title class="text-body-2">{{ formatFieldName(key) }}</v-list-item-title>
            <template #append>
              <span class="text-body-2">{{ formatFieldValue(key, value) }}</span>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="tonal" @click="showDetailDialog = false">Schließen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- 🆕 NEU: Chart-Dialog -->
  <v-dialog v-model="showChartDialog" max-width="800">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-chart-line" class="mr-2" />
        Daten-Visualisierung
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="showChartDialog = false" />
      </v-card-title>
      <v-card-text>
        <div class="chart-container" style="height: 400px">
          <!-- Hier würde ein Chart-Component eingefügt werden -->
          <div class="text-center pa-8">
            <v-icon icon="mdi-chart-line" size="64" color="grey-lighten-1" />
            <div class="text-h6 mt-4">Chart-Visualisierung</div>
            <div class="text-body-2 text-grey">
              Chart-Component für {{ selectedRecord?.espId }} - {{ selectedRecord?.dataType }}
            </div>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="tonal" @click="showChartDialog = false">Schließen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useDatabaseLogsStore } from '@/stores/databaseLogs'
import { useStatusHandling } from '@/composables/useStatusHandling'
import UnifiedCard from '@/components/common/UnifiedCard.vue'
import HelpfulHints from '@/components/common/HelpfulHints.vue'
import { formatRelativeTime, formatDateTime } from '@/utils/time'
import { storage } from '@/utils/storage'
import { determineUnit, formatValueWithUnit } from '@/utils/sensorUnits'

// Stores
const centralDataHub = useCentralDataHub()
const databaseLogsStore = useDatabaseLogsStore()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)

// ✅ NEUE STATUS-LOGIK VERWENDEN
const { getStatusColor } = useStatusHandling()
// Reactive State
const showChartDialog = ref(false)
const showFilterGuidance = ref(false)
const autoReloadEnabled = ref(false)
const autoReloadInterval = ref(15) // Sekunden
const autoReloadTimer = ref(null)
const viewMode = ref(storage.load('database_logs_view_mode', 'table'))
const exporting = ref(false)

// 🆕 NEU: Missing State Variables
const showAdvancedFilters = ref(false)
const showVisualization = ref(false)
const showDetailDialog = ref(false)
const selectedRecord = ref(null)
const clearing = ref(false)

// 🆕 NEU: Pagination State
const itemsPerPage = ref(25)
const currentPage = ref(1)
const totalRecords = ref(0)
const totalPages = ref(1)

// 🆕 NEU: Filter Options
const zoneOptions = ref([])
const subzoneOptions = ref([])
const logLevelOptions = ref([
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
  { label: 'Critical', value: 'critical' },
])

// Computed Properties für Store-Zugriff
const loading = computed(() => databaseLogsStore.isLoading)
const error = computed(() => databaseLogsStore.getError)

const tableData = computed(() => databaseLogsStore.getFilteredData)
const filters = computed(() => databaseLogsStore.filters)

// Computed Properties
const hasData = computed(() => tableData.value.length > 0)

const canLoadData = computed(() => {
  return centralConfig.value.getServerUrl && mqttStore.value.isConnected
})

// 🆕 NEU: Filterführung
const currentGuidanceStep = computed(() => {
  const steps = [
    'Wählen Sie zuerst den Daten-Typ aus',
    'Wählen Sie ein Feld-Gerät (optional)',
    'Definieren Sie den Zeitraum',
    'Klicken Sie "Daten laden" um zu starten',
  ]
  return steps[Math.min(filters.value.currentStep || 0, steps.length - 1)]
})

// ✅ KORRIGIERT: Lokale Funktion umbenennen um Konflikt zu vermeiden
const getCardStatusColor = () => {
  return getStatusColor(
    { loading: loading.value, error: error.value, hasData: hasData.value },
    'loading',
  )
}

const getStatusText = () => {
  if (loading.value) return 'Lädt...'
  if (error.value) return 'Fehler'
  if (hasData.value) return `${tableData.value.length} Datensätze`
  return 'Keine Daten'
}

// Options für Filter
const dataTypeOptions = [
  { label: 'Sensordaten', value: 'sensor_data' },
  { label: 'Aktor-Zustände', value: 'actuator_states' },
  { label: 'ESP-Geräte', value: 'esp_devices' },
  { label: 'GPIO-Nutzung', value: 'gpio_usage' },
  { label: 'SafeMode-Historie', value: 'safe_mode_history' },
  { label: 'Statistiken', value: 'statistics' },
]

const timeRangeOptions = [
  { label: 'Letzte Stunde', value: '1h' },
  { label: 'Letzte 24 Stunden', value: '24h' },
  { label: 'Letzte 7 Tage', value: '7d' },
  { label: 'Letzte 30 Tage', value: '30d' },
  { label: 'Alle Daten', value: 'all' },
]

const espDeviceOptions = computed(() => {
  const devices = []
  mqttStore.value.espDevices.forEach((device, espId) => {
    devices.push({
      label: `ESP ${espId}`,
      value: espId,
    })
  })
  return devices
})

const sensorTypeOptions = computed(() => {
  const types = new Set()
  tableData.value.forEach((item) => {
    if (item.sensor_type) {
      types.add(item.sensor_type)
    }
  })
  return Array.from(types).map((type) => ({
    label: type,
    value: type,
  }))
})

// Tabellen-Headers basierend auf Daten-Typ
const tableHeaders = computed(() => {
  const baseHeaders = [
    { title: 'ESP ID', key: 'esp_id', sortable: true },
    { title: 'GPIO', key: 'gpio', sortable: true },
    { title: 'Zeitstempel', key: 'timestamp', sortable: true },
  ]

  switch (filters.value.dataType) {
    case 'sensor_data':
      return [
        ...baseHeaders,
        { title: 'Sensor-Typ', key: 'sensor_type', sortable: true },
        { title: 'Messwert', key: 'processed_value', sortable: true },
        { title: 'Einheit', key: 'unit', sortable: false },
      ]
    case 'actuator_states':
      return [
        ...baseHeaders,
        { title: 'Aktor-Typ', key: 'actuator_type', sortable: true },
        { title: 'Zustand', key: 'state', sortable: true },
        { title: 'Quelle', key: 'source', sortable: true },
      ]
    case 'esp_devices':
      return [
        { title: 'ESP ID', key: 'esp_id', sortable: true },
        { title: 'Status', key: 'status', sortable: true },
        { title: 'Board-Typ', key: 'board_type', sortable: true },
        { title: 'Zone', key: 'zone', sortable: true },
        { title: 'Letztes Update', key: 'last_update', sortable: true },
      ]
    case 'gpio_usage':
      return [
        { title: 'ESP ID', key: 'esp_id', sortable: true },
        { title: 'GPIO', key: 'gpio', sortable: true },
        { title: 'Typ', key: 'type', sortable: true },
        { title: 'Name', key: 'name', sortable: true },
        { title: 'Subzone', key: 'subzone', sortable: true },
      ]
    case 'safe_mode_history':
      return [
        { title: 'ESP ID', key: 'esp_id', sortable: true },
        { title: 'Eingetreten', key: 'entered_at', sortable: true },
        { title: 'Verlassen', key: 'left_at', sortable: true },
        { title: 'Grund', key: 'reason', sortable: true },
        { title: 'Dauer', key: 'duration', sortable: true },
      ]
    default:
      return baseHeaders
  }
})

// Methods
const loadData = async () => {
  if (!canLoadData.value) {
    window.$snackbar?.showError('Keine Verbindung zum Server')
    return
  }

  try {
    await databaseLogsStore.loadData()

    // Warnung bei vielen Daten
    if (tableData.value.length > 1000) {
      window.$snackbar?.showWarning(
        `${tableData.value.length} Datensätze geladen. Export für bessere Performance empfohlen.`,
      )
    }
  } catch (err) {
    console.error('Fehler beim Laden der Daten:', err)
    window.$snackbar?.showError(`Fehler beim Laden: ${err.message}`)
  }
}

const debouncedLoadData = () => {
  // Einfache Debounce-Implementierung
  clearTimeout(debounceTimer.value)
  debounceTimer.value = setTimeout(loadData, 500)
}

// 🆕 NEU: Auto-Reload Methods
const startAutoReload = () => {
  if (autoReloadTimer.value) {
    clearInterval(autoReloadTimer.value)
  }

  autoReloadTimer.value = setInterval(() => {
    if (canLoadData.value) {
      loadData()
    }
  }, autoReloadInterval.value * 1000)
}

const stopAutoReload = () => {
  if (autoReloadTimer.value) {
    clearInterval(autoReloadTimer.value)
    autoReloadTimer.value = null
  }
}

// 🆕 NEU: Filterführung Methods
const startFilterGuidance = () => {
  showFilterGuidance.value = true
  databaseLogsStore.startFilterGuidance()
}

const formatValue = (item) => {
  if (item.processed_value === null || item.processed_value === undefined) {
    return '—'
  }

  const unit = item.unit || determineUnit(item.sensor_type)
  return formatValueWithUnit(item.processed_value, unit)
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '—'

  // Dynamische Formatierung basierend auf Anzahl der Daten
  if (tableData.value.length > 100) {
    return formatDateTime(timestamp, 'time') // Nur Uhrzeit
  }
  return formatDateTime(timestamp, 'datetime') // Datum + Uhrzeit
}

// 🆕 NEU: Missing Methods
const resetFilters = () => {
  databaseLogsStore.resetFilters()
}

const exportData = async () => {
  exporting.value = true
  try {
    await databaseLogsStore.exportData()
    window.$snackbar?.showSuccess('Daten erfolgreich exportiert')
  } catch (error) {
    window.$snackbar?.showError(`Export fehlgeschlagen: ${error.message}`)
  } finally {
    exporting.value = false
  }
}

const clearLogs = async () => {
  clearing.value = true
  try {
    await databaseLogsStore.clearLogs()
    window.$snackbar?.showSuccess('Logs erfolgreich gelöscht')
    loadData()
  } catch (error) {
    window.$snackbar?.showError(`Löschen fehlgeschlagen: ${error.message}`)
  } finally {
    clearing.value = false
  }
}

const viewDetails = (item) => {
  selectedRecord.value = item
  showDetailDialog.value = true
}

const showChart = (item) => {
  selectedRecord.value = item
  showChartDialog.value = true
}

const handleTableUpdate = (options) => {
  itemsPerPage.value = options.itemsPerPage
  currentPage.value = options.page
  loadData()
}

const handlePageChange = (page) => {
  currentPage.value = page
  loadData()
}

const getVisualizationDescription = () => {
  if (!hasData.value) return 'Keine Daten für Visualisierung verfügbar'
  return `Visualisierung für ${tableData.value.length} Datensätze`
}

const getDataTypeColor = (type) => {
  const colors = {
    sensor_data: 'blue',
    actuator_states: 'green',
    esp_devices: 'orange',
    gpio_usage: 'purple',
    safe_mode_history: 'red',
    statistics: 'teal',
  }
  return colors[type] || 'grey'
}

const getDataTypeLabel = (type) => {
  const labels = {
    sensor_data: 'Sensor',
    actuator_states: 'Aktor',
    esp_devices: 'ESP',
    gpio_usage: 'GPIO',
    safe_mode_history: 'SafeMode',
    statistics: 'Statistik',
  }
  return labels[type] || type
}

const getItemStatusColor = (status) => {
  const colors = {
    online: 'success',
    offline: 'error',
    warning: 'warning',
    error: 'error',
    info: 'info',
  }
  return colors[status] || 'grey'
}

const formatFieldName = (key) => {
  const fieldNames = {
    esp_id: 'ESP ID',
    gpio: 'GPIO',
    timestamp: 'Zeitstempel',
    sensor_type: 'Sensor-Typ',
    processed_value: 'Messwert',
    unit: 'Einheit',
    actuator_type: 'Aktor-Typ',
    state: 'Zustand',
    source: 'Quelle',
    status: 'Status',
    board_type: 'Board-Typ',
    zone: 'Zone',
    last_update: 'Letztes Update',
    type: 'Typ',
    name: 'Name',
    subzone: 'Subzone',
    entered_at: 'Eingetreten',
    left_at: 'Verlassen',
    reason: 'Grund',
    duration: 'Dauer',
  }
  return fieldNames[key] || key
}

const formatFieldValue = (key, value) => {
  if (key === 'timestamp' || key === 'entered_at' || key === 'left_at' || key === 'last_update') {
    return formatTimestamp(value)
  }
  if (key === 'processed_value') {
    return formatValue({ processed_value: value, sensor_type: selectedRecord.value?.sensor_type })
  }
  return value?.toString() || '—'
}

// Debounce Timer
const debounceTimer = ref(null)

// Lifecycle
onMounted(() => {
  if (canLoadData.value) {
    loadData()
  }
})

onUnmounted(() => {
  stopAutoReload()
})

// Watchers
watch(
  () => centralConfig.value.getServerUrl,
  (newUrl) => {
    if (newUrl && mqttStore.value.isConnected) {
      loadData()
    }
  },
)

watch(
  () => mqttStore.value.isConnected,
  (connected) => {
    if (connected && centralConfig.value.getServerUrl) {
      loadData()
    }
  },
)

// 🆕 NEU: Auto-Reload Watcher
watch(autoReloadEnabled, (enabled) => {
  if (enabled) {
    startAutoReload()
  } else {
    stopAutoReload()
  }
})

// 🆕 NEU: View-Mode Persistierung
watch(viewMode, (mode) => {
  storage.save('database_logs_view_mode', mode)
})
</script>

<style scoped>
.database-logs-card {
  margin-bottom: 1rem;
}

.v-data-table {
  border-radius: 8px;
}

.font-family-monospace {
  font-family: 'Courier New', monospace;
}

.cursor-pointer {
  cursor: pointer;
}

.database-card {
  transition: transform 0.2s ease;
}

.database-card:hover {
  transform: translateY(-2px);
}

.h-100 {
  height: 100%;
}
</style>
