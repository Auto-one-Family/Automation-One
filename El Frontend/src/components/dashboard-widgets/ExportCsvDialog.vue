<script setup lang="ts">
// Backwards-compatibility wrapper — do not extend.
// HistoricalChartWidget and MultiSensorWidget import this path.
// The actual implementation lives in components/export/ExportDialog.vue.
import { computed } from 'vue'
import ExportDialog from '@/components/export/ExportDialog.vue'
import { parseSensorId } from '@/composables/useSensorId'

interface Props {
  open: boolean
  sensorId: string   // legacy format: "espId:gpio:sensorType"
  sensorName?: string
  zoneName?: string
  defaultFrom?: Date
  defaultTo?: Date
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  'update:open': [value: boolean]
}>()

const parsed = computed(() => parseSensorId(props.sensorId))

const espId = computed(() => parsed.value.espId ?? undefined)
const gpio = computed(() => parsed.value.gpio ?? undefined)
const sensorType = computed(() => parsed.value.sensorType ?? undefined)

const defaultStartTime = computed(() =>
  props.defaultFrom instanceof Date ? props.defaultFrom.toISOString() : undefined
)
const defaultEndTime = computed(() =>
  props.defaultTo instanceof Date ? props.defaultTo.toISOString() : undefined
)
</script>

<template>
  <ExportDialog
    mode="sensor"
    :open="open"
    :esp-id="espId"
    :gpio="gpio"
    :sensor-type="sensorType"
    :sensor-name="sensorName"
    :zone-name="zoneName"
    :default-start-time="defaultStartTime"
    :default-end-time="defaultEndTime"
    @update:open="(v) => emit('update:open', v)"
    @close="emit('close')"
  />
</template>
