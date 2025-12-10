<template>
  <div class="event-config">
    <v-row>
      <v-col cols="12" md="6">
        <v-select
          v-model="config.type"
          :items="eventTypes"
          label="Event-Typ"
          item-title="label"
          item-value="value"
          variant="outlined"
          density="comfortable"
        />
      </v-col>
      <v-col cols="12" md="6">
        <v-switch v-model="config.enabled" label="Event aktiviert" density="compact" />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-textarea
          v-model="config.description"
          label="Beschreibung"
          placeholder="Beschreibung des Events..."
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
            <strong>Event-Typ:</strong> {{ getEventTypeLabel(config.type) }}
          </div>
          <div class="text-caption mt-1">Status: {{ config.enabled ? 'Aktiv' : 'Inaktiv' }}</div>
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
  type: props.element.config.type || 'manual',
  enabled: props.element.config.enabled !== undefined ? props.element.config.enabled : true,
  description: props.element.config.description || '',
})

const eventTypes = [
  { label: 'Manueller Trigger', value: 'manual' },
  { label: 'Kalender-Event', value: 'calendar' },
  { label: 'System-Event', value: 'system' },
]

const getEventTypeLabel = (type) => {
  const eventType = eventTypes.find((et) => et.value === type)
  return eventType ? eventType.label : type
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
.event-config {
  padding: 16px 0;
}
</style>
