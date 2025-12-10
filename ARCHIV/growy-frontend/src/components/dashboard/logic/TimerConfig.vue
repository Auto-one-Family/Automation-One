<template>
  <div class="timer-config">
    <v-row>
      <v-col cols="12" md="6">
        <v-text-field
          v-model="config.startTime"
          label="Start-Zeit"
          type="time"
          variant="outlined"
          density="comfortable"
          :error="!!validationErrors.startTime"
          :error-messages="validationErrors.startTime"
        />
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field
          v-model="config.endTime"
          label="End-Zeit"
          type="time"
          variant="outlined"
          density="comfortable"
          :error="!!validationErrors.endTime"
          :error-messages="validationErrors.endTime"
        />
      </v-col>
    </v-row>

    <!-- ✅ KRITISCH: Range-Validierungs-Fehler anzeigen -->
    <v-row v-if="validationErrors.range">
      <v-col cols="12">
        <v-alert type="error" variant="tonal" density="compact">
          {{ validationErrors.range }}
        </v-alert>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card variant="outlined" class="mb-3">
          <v-card-title class="text-subtitle-2">Wochentage</v-card-title>
          <v-card-text>
            <div class="d-flex flex-wrap gap-2">
              <v-checkbox
                v-for="day in weekDays"
                :key="day.value"
                v-model="config.days"
                :value="day.value"
                :label="day.label"
                density="compact"
                hide-details
                class="mr-4"
              />
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <v-switch v-model="config.enabled" label="Timer aktiviert" density="compact" />
      </v-col>
      <v-col cols="12" md="6">
        <v-switch v-model="config.repeat" label="Wiederholen" density="compact" />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-textarea
          v-model="config.description"
          label="Beschreibung"
          placeholder="Beschreibung des Timers..."
          variant="outlined"
          density="comfortable"
          rows="2"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-alert type="info" variant="tonal" density="compact">
          <div class="text-body-2"><strong>Timer-Zeitplan:</strong> {{ getTimerSchedule() }}</div>
          <div class="text-caption mt-1">Status: {{ config.enabled ? 'Aktiv' : 'Inaktiv' }}</div>
        </v-alert>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
// ✅ KRITISCH: Zeit-Validierung importieren
import { validateTimeString, validateTimeRange } from '@/utils/time'

const props = defineProps({
  element: { type: Object, required: true },
})

const emit = defineEmits(['update'])

const config = ref({
  startTime: props.element.config.startTime || '08:00',
  endTime: props.element.config.endTime || '18:00',
  days: props.element.config.days || [0, 1, 2, 3, 4, 5, 6],
  enabled: props.element.config.enabled !== undefined ? props.element.config.enabled : true,
  repeat: props.element.config.repeat !== undefined ? props.element.config.repeat : true,
  description: props.element.config.description || '',
})

// ✅ KRITISCH: Validierungs-State hinzufügen
const validationErrors = ref({
  startTime: null,
  endTime: null,
  range: null,
})

// ✅ KRITISCH: Validierungs-Funktionen
const validateStartTime = () => {
  const validation = validateTimeString(config.value.startTime)
  validationErrors.value.startTime = validation.error
  return validation.valid
}

const validateEndTime = () => {
  const validation = validateTimeString(config.value.endTime)
  validationErrors.value.endTime = validation.error
  return validation.valid
}

const validateRange = () => {
  if (!validateStartTime() || !validateEndTime()) {
    validationErrors.value.range = null
    return false
  }

  const validation = validateTimeRange(config.value.startTime, config.value.endTime)
  validationErrors.value.range = validation.error
  return validation.valid
}

// ✅ KRITISCH: Watch für sofortige Validierung
watch(() => config.value.startTime, validateStartTime)
watch(() => config.value.endTime, validateEndTime)
watch([() => config.value.startTime, () => config.value.endTime], validateRange)

const weekDays = [
  { label: 'Mo', value: 1 },
  { label: 'Di', value: 2 },
  { label: 'Mi', value: 3 },
  { label: 'Do', value: 4 },
  { label: 'Fr', value: 5 },
  { label: 'Sa', value: 6 },
  { label: 'So', value: 0 },
]

const getTimerSchedule = () => {
  const selectedDays = weekDays
    .filter((day) => config.value.days.includes(day.value))
    .map((day) => day.label)
    .join(', ')

  return `${config.value.startTime} - ${config.value.endTime} (${selectedDays})`
}

// Update parent when config changes
watch(
  config,
  (newConfig) => {
    // ✅ KRITISCH: Validierung vor Update
    if (!validateRange()) {
      // Zeige erste Validierungs-Fehlermeldung
      const firstError =
        validationErrors.value.startTime ||
        validationErrors.value.endTime ||
        validationErrors.value.range

      if (window.$snackbar) {
        window.$snackbar.showError(`Timer-Validierung: ${firstError}`)
      }
      return // Stoppe Update bei ungültigen Zeiten
    }

    // Nur bei gültigen Zeiten emittieren
    const updatedElement = {
      ...props.element,
      config: {
        ...props.element.config,
        ...newConfig,
      },
    }
    emit('update', updatedElement)
  },
  { deep: true },
)
</script>

<style scoped>
.timer-config {
  padding: 16px 0;
}
</style>
