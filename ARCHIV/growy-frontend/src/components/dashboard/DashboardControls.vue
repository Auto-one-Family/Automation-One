<template>
  <div class="dashboard-controls">
    <v-card variant="outlined" class="pa-4">
      <div class="d-flex flex-wrap gap-4 align-center">
        <!-- Layout-Auswahl -->
        <v-select
          v-model="activeLayout"
          :items="layoutOptions"
          item-title="name"
          item-value="value"
          label="Layout"
          density="compact"
          variant="outlined"
          style="min-width: 150px"
          @update:model-value="onLayoutChange"
        />

        <!-- Zeitraum-Auswahl -->
        <v-select
          v-model="activeTimeRange"
          :items="timeRangeOptions"
          item-title="label"
          item-value="id"
          label="Zeitraum"
          density="compact"
          variant="outlined"
          style="min-width: 150px"
          @update:model-value="onTimeRangeChange"
        />

        <!-- Vergleichsmodus -->
        <v-switch
          v-model="comparisonMode"
          label="Zeitvergleich"
          density="compact"
          hide-details
          @update:model-value="onComparisonToggle"
        />

        <!-- Aggregationsmethode -->
        <v-select
          v-if="comparisonMode"
          v-model="aggregationMethod"
          :items="aggregationOptions"
          item-title="name"
          item-value="value"
          label="Aggregation"
          density="compact"
          variant="outlined"
          style="min-width: 150px"
          @update:model-value="onAggregationChange"
        />

        <!-- Toggles -->
        <div class="d-flex gap-2">
          <v-btn-toggle
            v-model="showAggregations"
            mandatory
            density="compact"
            @update:model-value="onAggregationsToggle"
          >
            <v-btn value="true" size="small">
              <v-icon>mdi-chart-line</v-icon>
            </v-btn>
            <v-btn value="false" size="small">
              <v-icon>mdi-numeric</v-icon>
            </v-btn>
          </v-btn-toggle>

          <v-btn-toggle
            v-model="showCharts"
            mandatory
            density="compact"
            @update:model-value="onChartsToggle"
          >
            <v-btn value="true" size="small">
              <v-icon>mdi-chart-box</v-icon>
            </v-btn>
            <v-btn value="false" size="small">
              <v-icon>mdi-view-list</v-icon>
            </v-btn>
          </v-btn-toggle>
        </div>

        <!-- Export/Import -->
        <v-menu>
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon="mdi-dots-vertical" size="small" variant="text" />
          </template>
          <v-list>
            <v-list-item @click="exportConfig">
              <template v-slot:prepend>
                <v-icon>mdi-download</v-icon>
              </template>
              <v-list-item-title>Exportieren</v-list-item-title>
            </v-list-item>
            <v-list-item @click="importConfig">
              <template v-slot:prepend>
                <v-icon>mdi-upload</v-icon>
              </template>
              <v-list-item-title>Importieren</v-list-item-title>
            </v-list-item>
            <v-divider />
            <v-list-item @click="undo" :disabled="!canUndo">
              <template v-slot:prepend>
                <v-icon>mdi-undo</v-icon>
              </template>
              <v-list-item-title>Rückgängig</v-list-item-title>
            </v-list-item>
            <v-list-item @click="redo" :disabled="!canRedo">
              <template v-slot:prepend>
                <v-icon>mdi-redo</v-icon>
              </template>
              <v-list-item-title>Wiederholen</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </v-card>

    <!-- Hidden file input for import -->
    <input
      ref="fileInput"
      type="file"
      accept=".json"
      style="display: none"
      @change="onFileSelected"
    />
  </div>
</template>

<script>
import { defineComponent, ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

export default defineComponent({
  name: 'DashboardControls',

  setup() {
    const centralDataHub = useCentralDataHub()
    const dashboardStore = computed(() => centralDataHub.dashboardGenerator)
    const fileInput = ref(null)

    // Reactive values
    const activeLayout = ref(dashboardStore.value.activeConfig.layout)
    const activeTimeRange = ref(dashboardStore.value.activeConfig.timeRange)
    const comparisonMode = ref(dashboardStore.value.comparisonMode.enabled)
    const aggregationMethod = ref(dashboardStore.value.comparisonMode.aggregationMethod)
    const showAggregations = ref(dashboardStore.value.activeConfig.showAggregations)
    const showCharts = ref(dashboardStore.value.activeConfig.showCharts)

    // Computed values
    const layoutOptions = computed(() => {
      return Object.entries(dashboardStore.value.layoutConfigs).map(([value, config]) => ({
        value,
        name: config.name,
      }))
    })

    const timeRangeOptions = computed(() => {
      return [...dashboardStore.value.timeRanges.quick, ...dashboardStore.value.timeRanges.custom]
    })

    const aggregationOptions = computed(() => {
      return Object.entries(dashboardStore.value.aggregationMethods).map(([value, method]) => ({
        value,
        name: method.name,
      }))
    })

    const canUndo = computed(() => dashboardStore.value.canUndo)
    const canRedo = computed(() => dashboardStore.value.canRedo)

    // Event handlers
    const onLayoutChange = (layout) => {
      dashboardStore.value.setActiveLayout(layout)
    }

    const onTimeRangeChange = (timeRange) => {
      dashboardStore.value.setActiveTimeRange(timeRange)
    }

    const onComparisonToggle = (enabled) => {
      dashboardStore.value.toggleComparisonMode(enabled)
    }

    const onAggregationChange = (method) => {
      dashboardStore.value.setAggregationMethod(method)
    }

    const onAggregationsToggle = (show) => {
      dashboardStore.value.setShowAggregations(show === 'true')
    }

    const onChartsToggle = (show) => {
      dashboardStore.value.setShowCharts(show === 'true')
    }

    const exportConfig = () => {
      dashboardStore.value.exportDashboardConfigAsFile()
    }

    const importConfig = () => {
      fileInput.value?.click()
    }

    const onFileSelected = (event) => {
      const file = event.target.files?.[0]
      if (file) {
        dashboardStore.value.importDashboardConfigFromFile(file)
      }
      event.target.value = '' // Reset input
    }

    const undo = () => {
      dashboardStore.value.undo()
    }

    const redo = () => {
      dashboardStore.value.redo()
    }

    return {
      fileInput,
      activeLayout,
      activeTimeRange,
      comparisonMode,
      aggregationMethod,
      showAggregations,
      showCharts,
      layoutOptions,
      timeRangeOptions,
      aggregationOptions,
      canUndo,
      canRedo,
      onLayoutChange,
      onTimeRangeChange,
      onComparisonToggle,
      onAggregationChange,
      onAggregationsToggle,
      onChartsToggle,
      exportConfig,
      importConfig,
      onFileSelected,
      undo,
      redo,
    }
  },
})
</script>

<style scoped>
.dashboard-controls {
  margin-bottom: 1rem;
}
</style>
