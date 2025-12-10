<template>
  <div class="sensor-alert-config">
    <!-- Alert aktivieren/deaktivieren -->
    <v-switch
      v-model="localConfig.enabled"
      label="Alerts für diesen Sensor aktivieren"
      color="warning"
      class="mb-4"
    />

    <div v-if="localConfig.enabled">
      <!-- Threshold-Konfiguration -->
      <div class="mb-6">
        <h5 class="text-subtitle-2 mb-3">Grenzwerte</h5>
        <div v-for="(threshold, index) in localConfig.thresholds" :key="index" class="mb-3">
          <v-row>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model.number="threshold.min"
                label="Minimum"
                type="number"
                variant="outlined"
                density="compact"
                :suffix="sensor.unit"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model.number="threshold.max"
                label="Maximum"
                type="number"
                variant="outlined"
                density="compact"
                :suffix="sensor.unit"
              />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field
                v-model="threshold.name"
                label="Name"
                variant="outlined"
                density="compact"
                placeholder="z.B. Normalbereich"
              />
            </v-col>
            <v-col cols="12" sm="1">
              <v-btn
                icon="mdi-delete"
                color="error"
                variant="text"
                size="small"
                @click="removeThreshold(index)"
              />
            </v-col>
          </v-row>
        </div>
        <v-btn prepend-icon="mdi-plus" variant="outlined" size="small" @click="addThreshold">
          Grenzwert hinzufügen
        </v-btn>
      </div>

      <!-- Kritische Grenzwerte -->
      <div class="mb-6">
        <h5 class="text-subtitle-2 mb-3">Kritische Grenzwerte</h5>
        <div v-for="(threshold, index) in localConfig.criticalThresholds" :key="index" class="mb-3">
          <v-row>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model.number="threshold.min"
                label="Kritisches Minimum"
                type="number"
                variant="outlined"
                density="compact"
                :suffix="sensor.unit"
                color="error"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model.number="threshold.max"
                label="Kritisches Maximum"
                type="number"
                variant="outlined"
                density="compact"
                :suffix="sensor.unit"
                color="error"
              />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field
                v-model="threshold.name"
                label="Name"
                variant="outlined"
                density="compact"
                placeholder="z.B. Kritisch"
              />
            </v-col>
            <v-col cols="12" sm="1">
              <v-btn
                icon="mdi-delete"
                color="error"
                variant="text"
                size="small"
                @click="removeCriticalThreshold(index)"
              />
            </v-col>
          </v-row>
        </div>
        <v-btn
          prepend-icon="mdi-plus"
          variant="outlined"
          size="small"
          color="error"
          @click="addCriticalThreshold"
        >
          Kritischen Grenzwert hinzufügen
        </v-btn>
      </div>

      <!-- Offline-Timeout -->
      <div class="mb-6">
        <h5 class="text-subtitle-2 mb-3">Offline-Erkennung</h5>
        <v-text-field
          v-model.number="localConfig.offlineTimeout"
          label="Offline-Timeout (Millisekunden)"
          type="number"
          variant="outlined"
          density="compact"
          hint="Zeit nach der ein Sensor als offline gilt"
          persistent-hint
        />
      </div>

      <!-- Trend-Analyse -->
      <div class="mb-6">
        <h5 class="text-subtitle-2 mb-3">Trend-Analyse</h5>
        <v-switch
          v-model="localConfig.trendAnalysis"
          label="Trend-Analyse aktivieren"
          color="info"
          hide-details
        />
        <div class="text-caption text-grey mt-1">Erkennt kritische Trends in den Sensor-Daten</div>
      </div>

      <!-- Benachrichtigungskanäle -->
      <div class="mb-6">
        <h5 class="text-subtitle-2 mb-3">Benachrichtigungskanäle</h5>
        <v-row>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="localConfig.notificationChannels.snackbar"
              label="Snackbar"
              color="primary"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="localConfig.notificationChannels.sound"
              label="Sound"
              color="warning"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="localConfig.notificationChannels.email"
              label="E-Mail"
              color="info"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="localConfig.notificationChannels.push"
              label="Push"
              color="success"
              hide-details
            />
          </v-col>
        </v-row>
      </div>

      <!-- Speichern/Abbrechen -->
      <div class="d-flex gap-2">
        <v-btn color="primary" variant="tonal" @click="saveConfig" :loading="saving">
          Konfiguration speichern
        </v-btn>
        <v-btn variant="outlined" @click="resetConfig"> Zurücksetzen </v-btn>
        <v-btn color="error" variant="outlined" @click="deleteConfig"> Alerts löschen </v-btn>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, watch } from 'vue'
import { useDashboardGeneratorStore } from '@/stores/dashboardGenerator'

export default defineComponent({
  name: 'SensorAlertConfig',
  props: {
    sensor: {
      type: Object,
      required: true,
    },
    alertConfig: {
      type: Object,
      default: null,
    },
  },
  emits: ['config-updated'],
  setup(props, { emit }) {
    const dashboardStore = useDashboardGeneratorStore()
    const saving = ref(false)

    // Lokale Konfiguration
    const localConfig = ref({
      enabled: false,
      thresholds: [],
      criticalThresholds: [],
      offlineTimeout: 5 * 60 * 1000, // 5 Minuten
      trendAnalysis: false,
      notificationChannels: {
        snackbar: true,
        sound: false,
        email: false,
        push: false,
      },
    })

    // Konfiguration aus Props laden
    watch(
      () => props.alertConfig,
      (newConfig) => {
        if (newConfig) {
          localConfig.value = { ...newConfig }
        } else {
          // Standard-Konfiguration basierend auf Sensor-Typ
          const group = dashboardStore.getSensorGroupKey(props.sensor.type)
          if (group) {
            const sensorGroup = dashboardStore.sensorGroups[group]
            localConfig.value.thresholds = sensorGroup.criticalRanges.map((range, index) => ({
              id: `threshold_${index}`,
              min: range.min,
              max: range.max,
              name: `${sensorGroup.name} ${range.color}`,
            }))
          }
        }
      },
      { immediate: true },
    )

    const addThreshold = () => {
      localConfig.value.thresholds.push({
        id: `threshold_${Date.now()}`,
        min: 0,
        max: 100,
        name: 'Neuer Grenzwert',
      })
    }

    const removeThreshold = (index) => {
      localConfig.value.thresholds.splice(index, 1)
    }

    const addCriticalThreshold = () => {
      localConfig.value.criticalThresholds.push({
        id: `critical_${Date.now()}`,
        min: 0,
        max: 100,
        name: 'Kritischer Grenzwert',
      })
    }

    const removeCriticalThreshold = (index) => {
      localConfig.value.criticalThresholds.splice(index, 1)
    }

    const saveConfig = async () => {
      saving.value = true
      try {
        if (localConfig.value.enabled) {
          const config = await dashboardStore.createAlertConfig(
            props.sensor.espId,
            props.sensor.gpio,
            localConfig.value,
          )
          emit('config-updated', props.sensor.espId, props.sensor.gpio, config)
        } else {
          await dashboardStore.deleteAlertConfig(props.sensor.espId, props.sensor.gpio)
          emit('config-updated', props.sensor.espId, props.sensor.gpio, null)
        }
      } catch (error) {
        console.error('Failed to save alert config:', error)
      } finally {
        saving.value = false
      }
    }

    const resetConfig = () => {
      if (props.alertConfig) {
        localConfig.value = { ...props.alertConfig }
      }
    }

    const deleteConfig = async () => {
      try {
        await dashboardStore.deleteAlertConfig(props.sensor.espId, props.sensor.gpio)
        localConfig.value.enabled = false
        emit('config-updated', props.sensor.espId, props.sensor.gpio, null)
      } catch (error) {
        console.error('Failed to delete alert config:', error)
      }
    }

    return {
      localConfig,
      saving,
      addThreshold,
      removeThreshold,
      addCriticalThreshold,
      removeCriticalThreshold,
      saveConfig,
      resetConfig,
      deleteConfig,
    }
  },
})
</script>
