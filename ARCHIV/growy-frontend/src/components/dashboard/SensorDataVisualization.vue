<template>
  <div class="sensor-data-visualization">
    <!-- Header mit Live-Status -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center justify-space-between">
        <div class="d-flex align-center">
          <v-icon icon="mdi-chart-line" class="mr-2" />
          Live Sensor Data
          <v-chip
            v-if="isConnected"
            color="success"
            size="small"
            variant="tonal"
            class="ml-2"
            prepend-icon="mdi-wifi"
          >
            Live
          </v-chip>
        </div>
        <div class="d-flex align-center gap-2">
          <v-btn
            size="small"
            variant="text"
            :icon="autoRefresh ? 'mdi-pause' : 'mdi-play'"
            @click="autoRefresh = !autoRefresh"
          >
            <v-tooltip location="top">
              <template #activator="{ props }">
                <span v-bind="props">
                  {{ autoRefresh ? 'Auto-refresh aktiv' : 'Auto-refresh pausiert' }}
                </span>
              </template>
              <span>{{ autoRefresh ? 'Auto-refresh aktiv' : 'Auto-refresh pausiert' }}</span>
            </v-tooltip>
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            icon="mdi-refresh"
            @click="refreshData"
            :loading="refreshing"
          >
            <v-tooltip location="top">
              <template #activator="{ props }">
                <span v-bind="props">Daten aktualisieren</span>
              </template>
              <span>Daten manuell aktualisieren</span>
            </v-tooltip>
          </v-btn>
        </div>
      </v-card-title>
    </v-card>

    <!-- Vergleichs-Dropfeld für kombinierte Analysen (wird später integriert) -->
    <!-- <ComparisonVisualizer ... /> -->
  </div>
</template>

<script>
// Entferne alle nicht mehr benötigten Importe und Methoden
export default {
  name: 'SensorDataVisualization',
  // Die Logik für das Vergleichs-Dropfeld wird später ergänzt
}
</script>

<style scoped>
.sensor-data-visualization {
  max-width: 1200px;
  margin: 0 auto;
}

.sensor-card-updated {
  animation: pulse 0.5s ease-in-out;
}

.sensor-chip-updated {
  animation: pulse 0.5s ease-in-out;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}
</style>
