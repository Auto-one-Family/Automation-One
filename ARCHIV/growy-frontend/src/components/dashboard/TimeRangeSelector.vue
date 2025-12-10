<template>
  <v-card variant="outlined" class="time-range-selector">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-clock-outline" class="mr-2" />
      Zeitbereich & Mittelwerte
      <v-spacer />
      <v-btn icon="mdi-plus" size="small" variant="text" @click="addCustomTimeRange">
        <v-tooltip location="top">
          <template #activator="{ props }">
            <span v-bind="props">Benutzerdefinierten Zeitbereich hinzufügen</span>
          </template>
          <span>Neuen Zeitbereich definieren</span>
        </v-tooltip>
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- Standard-Zeitbereiche -->
      <div class="standard-time-ranges mb-4">
        <h4 class="text-subtitle-1 mb-2">Standard-Zeitbereiche:</h4>
        <v-btn-toggle
          v-model="selectedTimeRange"
          mandatory
          color="primary"
          variant="outlined"
          density="comfortable"
        >
          <v-btn v-for="range in standardTimeRanges" :key="range.value" :value="range.value">
            {{ range.label }}
          </v-btn>
        </v-btn-toggle>
      </div>

      <!-- Benutzerdefinierte Zeitbereiche -->
      <div v-if="customTimeRanges.length > 0" class="custom-time-ranges mb-4">
        <h4 class="text-subtitle-1 mb-2">Benutzerdefinierte Zeitbereiche:</h4>
        <div class="custom-ranges-list">
          <v-card v-for="range in customTimeRanges" :key="range.id" variant="tonal" class="mb-2">
            <v-card-text class="py-2">
              <div class="d-flex align-center justify-space-between">
                <div>
                  <span class="font-weight-medium">{{ range.name }}</span>
                  <span class="text-caption text-grey ml-2">
                    {{ formatTimeRange(range.duration) }}
                  </span>
                </div>
                <div class="d-flex align-center">
                  <v-chip
                    :color="range.isActive ? 'success' : 'grey'"
                    size="x-small"
                    variant="tonal"
                    class="mr-2"
                  >
                    {{ range.isActive ? 'Aktiv' : 'Inaktiv' }}
                  </v-chip>
                  <v-btn
                    icon="mdi-delete"
                    size="x-small"
                    variant="text"
                    color="error"
                    @click="removeCustomTimeRange(range.id)"
                  />
                </div>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </div>

      <!-- Mittelwert-Konfiguration -->
      <div class="aggregation-config mb-4">
        <h4 class="text-subtitle-1 mb-2">Mittelwert-Berechnung:</h4>
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="aggregationMethod"
              :items="aggregationMethods"
              label="Berechnungsmethode"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model.number="aggregationInterval"
              type="number"
              label="Intervall (Minuten)"
              variant="outlined"
              density="comfortable"
              :min="1"
              :max="1440"
            />
          </v-col>
        </v-row>
      </div>

      <!-- Zeitreihen-Vergleich -->
      <div class="time-series-comparison">
        <h4 class="text-subtitle-1 mb-2">Zeitreihen-Vergleich:</h4>
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="comparisonMode"
              :items="comparisonModes"
              label="Vergleichsmodus"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="selectedComparisonRange"
              :items="availableComparisonRanges"
              label="Vergleichszeitraum"
              variant="outlined"
              density="comfortable"
              :disabled="comparisonMode === 'none'"
            />
          </v-col>
        </v-row>
      </div>

      <!-- Live-Vorschau -->
      <div class="live-preview mt-4">
        <h4 class="text-subtitle-1 mb-2">Live-Vorschau:</h4>
        <div class="preview-stats">
          <v-row>
            <v-col cols="12" md="3">
              <v-card variant="tonal" class="text-center pa-2">
                <div class="text-caption text-grey">Aktueller Wert</div>
                <div class="text-h6">{{ currentValue }}</div>
              </v-card>
            </v-col>
            <v-col cols="12" md="3">
              <v-card variant="tonal" class="text-center pa-2">
                <div class="text-caption text-grey">Mittelwert</div>
                <div class="text-h6">{{ averageValue }}</div>
              </v-card>
            </v-col>
            <v-col cols="12" md="3">
              <v-card variant="tonal" class="text-center pa-2">
                <div class="text-caption text-grey">Minimum</div>
                <div class="text-h6">{{ minValue }}</div>
              </v-card>
            </v-col>
            <v-col cols="12" md="3">
              <v-card variant="tonal" class="text-center pa-2">
                <div class="text-caption text-grey">Maximum</div>
                <div class="text-h6">{{ maxValue }}</div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTimeRangeStore } from '@/stores/timeRange'

const timeRangeStore = useTimeRangeStore()

const selectedTimeRange = ref('1h')
const aggregationMethod = ref('average')
const aggregationInterval = ref(5)
const comparisonMode = ref('none')
const selectedComparisonRange = ref(null)

// Computed
const standardTimeRanges = [
  { label: '5 Min', value: '5min' },
  { label: '15 Min', value: '15min' },
  { label: '1 Std', value: '1h' },
  { label: '6 Std', value: '6h' },
  { label: '24 Std', value: '24h' },
  { label: '7 Tage', value: '7d' },
]

const customTimeRanges = computed(() => {
  return timeRangeStore.getCustomTimeRanges
})

const aggregationMethods = [
  { title: 'Durchschnitt', value: 'average' },
  { title: 'Minimum', value: 'min' },
  { title: 'Maximum', value: 'max' },
  { title: 'Summe', value: 'sum' },
  { title: 'Median', value: 'median' },
]

const comparisonModes = [
  { title: 'Kein Vergleich', value: 'none' },
  { title: 'Vorheriger Zeitraum', value: 'previous' },
  { title: 'Gleicher Zeitraum gestern', value: 'yesterday' },
  { title: 'Gleicher Zeitraum letzte Woche', value: 'lastWeek' },
  { title: 'Benutzerdefiniert', value: 'custom' },
]

const availableComparisonRanges = computed(() => {
  return standardTimeRanges.map((range) => ({
    title: range.label,
    value: range.value,
  }))
})

// Live-Vorschau (Simulation)
const currentValue = computed(() => '23.5°C')
const averageValue = computed(() => '22.8°C')
const minValue = computed(() => '20.1°C')
const maxValue = computed(() => '25.3°C')

// Methods
function addCustomTimeRange() {
  timeRangeStore.createCustomTimeRange({
    name: 'Benutzerdefiniert',
    duration: 30, // Minuten
    isActive: true,
  })
}

function removeCustomTimeRange(rangeId) {
  timeRangeStore.removeCustomTimeRange(rangeId)
}

function formatTimeRange(minutes) {
  if (minutes < 60) return `${minutes} Min`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} Std`
  return `${Math.floor(minutes / 1440)} Tage`
}

// Watchers
watch(selectedTimeRange, (newRange) => {
  timeRangeStore.setActiveTimeRange(newRange)
})

watch(aggregationMethod, (newMethod) => {
  timeRangeStore.setAggregationMethod(newMethod)
})

watch(aggregationInterval, (newInterval) => {
  timeRangeStore.setAggregationInterval(newInterval)
})
</script>

<style scoped>
.time-range-selector {
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

.preview-stats {
  display: grid;
  gap: 1rem;
}

.custom-ranges-list {
  max-height: 300px;
  overflow-y: auto;
}
</style>
