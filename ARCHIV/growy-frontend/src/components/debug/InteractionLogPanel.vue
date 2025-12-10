<template>
  <v-card class="interaction-log-panel" variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-clipboard-list" class="mr-2" color="primary" />
      Interaction Log (Dev-Modus)
      <v-spacer />

      <!-- 🆕 NEU: Statistiken -->
      <v-chip :color="getStatsColor()" size="small" variant="tonal" class="ml-2">
        {{ logStats.total }} Einträge
      </v-chip>

      <!-- 🆕 NEU: Log löschen -->
      <v-btn
        icon="mdi-delete"
        size="small"
        variant="text"
        @click="clearLog"
        class="ml-2"
        :disabled="logStats.total === 0"
      >
        <v-tooltip location="top">
          <template #activator="{ props }">
            <span v-bind="props">Log löschen</span>
          </template>
        </v-tooltip>
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- 🆕 NEU: Export-Sektion -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-download" class="mr-2" />
          Export
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="6">
              <v-btn
                block
                color="primary"
                variant="tonal"
                @click="exportAsCSV"
                :disabled="filteredLog.length === 0"
              >
                <v-icon icon="mdi-file-csv" class="mr-2" />
                Als CSV exportieren
              </v-btn>
            </v-col>
            <v-col cols="12" sm="6">
              <v-btn
                block
                color="secondary"
                variant="tonal"
                @click="exportAsJSON"
                :disabled="filteredLog.length === 0"
              >
                <v-icon icon="mdi-code-json" class="mr-2" />
                Als JSON exportieren
              </v-btn>
            </v-col>
          </v-row>

          <!-- 🆕 NEU: Export-Optionen -->
          <v-expansion-panels class="mt-4">
            <v-expansion-panel>
              <v-expansion-panel-title>Export-Optionen</v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-row>
                  <v-col cols="12" sm="6">
                    <v-select
                      v-model="exportOptions.timeRange"
                      :items="timeRangeOptions"
                      label="Zeitraum"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-select
                      v-model="exportOptions.includeDetails"
                      :items="detailOptions"
                      label="Details"
                      density="compact"
                    />
                  </v-col>
                </v-row>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
      </v-card>

      <!-- 🆕 NEU: Filter-Optionen -->
      <div class="filter-section mb-4">
        <v-row>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="selectedType"
              :items="typeOptions"
              label="Typ filtern"
              density="compact"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="selectedAction"
              :items="actionOptions"
              label="Aktion filtern"
              density="compact"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="selectedSuccess"
              :items="successOptions"
              label="Erfolg filtern"
              density="compact"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="selectedMode"
              :items="modeOptions"
              label="Modus filtern"
              density="compact"
              variant="outlined"
              clearable
            />
          </v-col>
        </v-row>
      </div>

      <!-- 🆕 NEU: Statistiken -->
      <div class="stats-section mb-4">
        <v-row>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" class="text-center pa-2">
              <div class="text-h6">{{ logStats.total }}</div>
              <div class="text-caption">Gesamt</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" class="text-center pa-2">
              <div class="text-h6">{{ logStats.successRate.toFixed(1) }}%</div>
              <div class="text-caption">Erfolgsrate</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" class="text-center pa-2">
              <div class="text-h6">{{ logStats.recentActivity }}</div>
              <div class="text-caption">Letzte Stunde</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" class="text-center pa-2">
              <div class="text-h6">{{ filteredLog.length }}</div>
              <div class="text-caption">Gefiltert</div>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- 🆕 NEU: Log-Einträge -->
      <div class="log-entries">
        <div v-if="filteredLog.length === 0" class="text-center py-8">
          <v-icon icon="mdi-clipboard-text" size="large" color="grey-lighten-1" class="mb-4" />
          <div class="text-h6 text-grey mb-2">Keine Log-Einträge</div>
          <div class="text-body-2 text-grey-lighten-1">
            {{
              logStats.total === 0
                ? 'Noch keine Interaktionen protokolliert'
                : 'Keine Einträge entsprechen den Filtern'
            }}
          </div>
        </div>

        <div v-else class="log-entry-list">
          <div
            v-for="entry in filteredLog"
            :key="entry.id"
            class="log-entry mb-2 pa-3"
            :class="getEntryClass(entry)"
          >
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center">
                <v-icon :icon="getEntryIcon(entry)" size="small" class="mr-2" />
                <div>
                  <div class="text-body-2 font-weight-medium">
                    {{ getEntryTitle(entry) }}
                  </div>
                  <div class="text-caption text-grey-lighten-1">
                    {{ formatTimestamp(entry.timestamp) }}
                  </div>
                </div>
              </div>

              <div class="d-flex align-center">
                <v-chip :color="getEntryColor(entry)" size="x-small" variant="tonal" class="mr-2">
                  {{ entry.type }}
                </v-chip>

                <v-chip :color="entry.success ? 'success' : 'error'" size="x-small" variant="tonal">
                  {{ entry.success ? '✓' : '✗' }}
                </v-chip>
              </div>
            </div>

            <!-- 🆕 NEU: Erweiterte Details -->
            <div v-if="entry.elementType || entry.elementName || entry.mode" class="mt-2">
              <div class="text-caption">
                <span v-if="entry.elementType">Typ: {{ entry.elementType }}</span>
                <span v-if="entry.elementName" class="ml-2">Name: {{ entry.elementName }}</span>
                <span v-if="entry.mode" class="ml-2">Modus: {{ entry.mode }}</span>
              </div>
            </div>

            <!-- 🆕 NEU: Fehler-Details -->
            <div v-if="entry.reason" class="mt-2">
              <div class="text-caption text-error">Grund: {{ entry.reason }}</div>
            </div>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue'
import { useDashboardGeneratorStore } from '@/stores/dashboardGenerator'
import { formatRelativeTime } from '@/utils/time'

export default defineComponent({
  name: 'InteractionLogPanel',

  setup() {
    const dashboardGenerator = useDashboardGeneratorStore()

    // 🆕 NEU: Filter-State
    const selectedType = ref(null)
    const selectedAction = ref(null)
    const selectedSuccess = ref(null)
    const selectedMode = ref(null)

    // 🆕 NEU: Export-Optionen
    const exportOptions = ref({
      timeRange: null,
      includeDetails: 'all',
    })

    const timeRangeOptions = [
      { title: 'Alle', value: null },
      { title: 'Letzte Stunde', value: 60 * 60 * 1000 },
      { title: 'Letzte 24 Stunden', value: 24 * 60 * 60 * 1000 },
      { title: 'Letzte Woche', value: 7 * 24 * 60 * 60 * 1000 },
    ]

    const detailOptions = [
      { title: 'Alle Details', value: 'all' },
      { title: 'Nur Erfolgreiche', value: 'success' },
      { title: 'Nur Fehlgeschlagene', value: 'error' },
    ]

    // 🆕 NEU: Computed Properties
    const logStats = computed(() => dashboardGenerator.getLogStats())

    const typeOptions = computed(() => {
      const types = Object.keys(logStats.value.byType)
      return types.map((type) => ({ title: type, value: type }))
    })

    const actionOptions = computed(() => {
      const actions = Object.keys(logStats.value.byAction)
      return actions.map((action) => ({ title: action, value: action }))
    })

    const successOptions = computed(() => [
      { title: 'Erfolgreich', value: true },
      { title: 'Fehlgeschlagen', value: false },
    ])

    const modeOptions = computed(() => [
      { title: 'Vergleich', value: 'comparison' },
      { title: 'Logik', value: 'logic' },
    ])

    const filteredLog = computed(() => {
      let log = dashboardGenerator.getInteractionLog(100)

      if (selectedType.value) {
        log = log.filter((entry) => entry.type === selectedType.value)
      }

      if (selectedAction.value) {
        log = log.filter((entry) => entry.action === selectedAction.value)
      }

      if (selectedSuccess.value !== null) {
        log = log.filter((entry) => entry.success === selectedSuccess.value)
      }

      if (selectedMode.value) {
        log = log.filter((entry) => entry.mode === selectedMode.value)
      }

      return log
    })

    // 🆕 NEU: Helper-Funktionen
    const getStatsColor = () => {
      if (logStats.value.total === 0) return 'grey'
      if (logStats.value.successRate > 80) return 'success'
      if (logStats.value.successRate > 60) return 'warning'
      return 'error'
    }

    const getEntryClass = (entry) => {
      return {
        'log-entry-success': entry.success,
        'log-entry-error': !entry.success,
        'log-entry-drop': entry.type === 'drop',
        'log-entry-validation': entry.type === 'validation',
        'log-entry-logic': entry.type === 'logic',
        'log-entry-comparison': entry.type === 'comparison',
        'log-entry-remove': entry.type === 'remove',
      }
    }

    const getEntryIcon = (entry) => {
      const icons = {
        drop: 'mdi-download',
        validation: 'mdi-alert',
        logic: 'mdi-lightning-bolt',
        comparison: 'mdi-chart-multiline',
        remove: 'mdi-delete',
      }
      return icons[entry.type] || 'mdi-help'
    }

    const getEntryTitle = (entry) => {
      const titles = {
        drop: 'Element hinzugefügt',
        validation: 'Validierungsfehler',
        logic: 'Logik gespeichert',
        comparison: 'Vergleich abgeschlossen',
        remove: 'Element entfernt',
      }
      return titles[entry.type] || entry.action || 'Unbekannte Aktion'
    }

    const getEntryColor = (entry) => {
      const colors = {
        drop: 'success',
        validation: 'error',
        logic: 'warning',
        comparison: 'info',
        remove: 'grey',
      }
      return colors[entry.type] || 'grey'
    }

    const formatTimestamp = (timestamp) => {
      return formatRelativeTime(timestamp)
    }

    // 🆕 NEU: Actions
    const clearLog = () => {
      dashboardGenerator.clearInteractionLog()
    }

    // 🆕 NEU: Export-Funktionen
    const exportAsCSV = () => {
      const filterOptions = {
        type: selectedType.value,
        success: selectedSuccess.value,
        mode: selectedMode.value,
        timeRange: exportOptions.value.timeRange,
      }

      const result = dashboardGenerator.exportInteractionLogAsCSV(filterOptions)
      if (result.success) {
        window.$snackbar?.showSuccess(`CSV Export erfolgreich: ${result.filename}`)
      } else {
        window.$snackbar?.showError('CSV Export fehlgeschlagen')
      }
    }

    const exportAsJSON = () => {
      const filterOptions = {
        type: selectedType.value,
        success: selectedSuccess.value,
        mode: selectedMode.value,
        timeRange: exportOptions.value.timeRange,
      }

      const result = dashboardGenerator.exportInteractionLogAsJSON(filterOptions)
      if (result.success) {
        window.$snackbar?.showSuccess(`JSON Export erfolgreich: ${result.filename}`)
      } else {
        window.$snackbar?.showError('JSON Export fehlgeschlagen')
      }
    }

    // 🆕 NEU: Auto-Refresh für Dev-Modus
    onMounted(() => {
      if (import.meta.env.DEV) {
        setInterval(() => {
          // Force re-render durch computed properties
        }, 5000)
      }
    })

    return {
      selectedType,
      selectedAction,
      selectedSuccess,
      selectedMode,
      exportOptions,
      timeRangeOptions,
      detailOptions,
      logStats,
      typeOptions,
      actionOptions,
      successOptions,
      modeOptions,
      filteredLog,
      getStatsColor,
      getEntryClass,
      getEntryIcon,
      getEntryTitle,
      getEntryColor,
      formatTimestamp,
      clearLog,
      exportAsCSV,
      exportAsJSON,
    }
  },
})
</script>

<style scoped>
.interaction-log-panel {
  max-height: 600px;
  overflow-y: auto;
}

.log-entry {
  border-radius: 8px;
  transition: all 0.2s ease;
}

.log-entry:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.log-entry-success {
  background: rgba(76, 175, 80, 0.05);
  border-left: 3px solid #4caf50;
}

.log-entry-error {
  background: rgba(244, 67, 54, 0.05);
  border-left: 3px solid #f44336;
}

.log-entry-drop {
  border-left-color: #2196f3;
}

.log-entry-validation {
  border-left-color: #ff9800;
}

.log-entry-logic {
  border-left-color: #9c27b0;
}

.log-entry-comparison {
  border-left-color: #00bcd4;
}

.log-entry-remove {
  border-left-color: #607d8b;
}

.log-entry-list {
  max-height: 400px;
  overflow-y: auto;
}

.filter-section {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding: 16px;
}

.stats-section .v-card {
  transition: all 0.2s ease;
}

.stats-section .v-card:hover {
  transform: scale(1.02);
}
</style>
