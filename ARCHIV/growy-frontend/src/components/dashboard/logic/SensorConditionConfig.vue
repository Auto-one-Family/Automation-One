<template>
  <div class="sensor-condition-config">
    <v-row>
      <v-col cols="12" md="6">
        <v-select
          v-model="config.operator"
          :items="operators"
          label="Operator"
          item-title="label"
          item-value="value"
          variant="outlined"
          density="comfortable"
        />
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field
          v-model.number="config.threshold"
          label="Schwellenwert"
          type="number"
          :step="getStepValue()"
          variant="outlined"
          density="comfortable"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <v-text-field
          v-model="config.hysteresis"
          label="Hysterese"
          type="number"
          :step="getStepValue()"
          variant="outlined"
          density="comfortable"
          hint="Verzögerung für Ein-/Ausschaltung"
          persistent-hint
        />
      </v-col>
      <v-col cols="12" md="6">
        <v-select
          v-model="config.conditionType"
          :items="conditionTypes"
          label="Bedingungstyp"
          item-title="label"
          item-value="value"
          variant="outlined"
          density="comfortable"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-textarea
          v-model="config.description"
          label="Beschreibung"
          placeholder="Beschreibung der Bedingung..."
          variant="outlined"
          density="comfortable"
          rows="2"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-alert type="info" variant="tonal" density="compact">
          <div class="text-body-2">
            <strong>Aktueller Sensorwert:</strong> {{ element.config.value
            }}{{ element.config.unit }}
          </div>
          <div class="text-caption mt-1">
            Bedingung: {{ element.config.name }} {{ config.operator }} {{ config.threshold
            }}{{ element.config.unit }}
          </div>
        </v-alert>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  element: { type: Object, required: true },
})

const emit = defineEmits(['update'])

const config = ref({
  operator: props.element.config.operator || '>',
  threshold: props.element.config.threshold || 0,
  hysteresis: props.element.config.hysteresis || 0,
  conditionType: props.element.config.conditionType || 'threshold',
  description: props.element.config.description || '',
})

const operators = [
  { label: 'Größer als', value: '>' },
  { label: 'Kleiner als', value: '<' },
  { label: 'Gleich', value: '==' },
  { label: 'Größer gleich', value: '>=' },
  { label: 'Kleiner gleich', value: '<=' },
  { label: 'Ungleich', value: '!=' },
]

const conditionTypes = [
  { label: 'Schwellenwert', value: 'threshold' },
  { label: 'Bereich', value: 'range' },
  { label: 'Trend', value: 'trend' },
]

const getStepValue = () => {
  const sensorType = props.element.config.type
  if (sensorType === 'SENSOR_TEMP_DS18B20') return 0.1
  if (sensorType === 'SENSOR_MOISTURE') return 1
  if (sensorType === 'SENSOR_PH_DFROBOT') return 0.01
  if (sensorType === 'SENSOR_EC_GENERIC') return 0.1
  return 0.1
}

// Update parent when config changes
watch(
  config,
  (newConfig) => {
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
.sensor-condition-config {
  padding: 16px 0;
}
</style>
