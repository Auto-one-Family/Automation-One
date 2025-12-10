<template>
  <UnifiedCard
    variant="outlined"
    title="GPIO {{ pin }}"
    icon="mdi-pin"
    icon-color="info"
    interactive
    show-actions
    @click="showConfigDialog = true"
  >
    <template #content>
      <div class="text-center py-3">
        <v-icon icon="mdi-pin-off" size="32" color="grey-lighten-1" />
        <p class="text-caption text-grey mt-2">Nicht konfiguriert</p>
        <p class="text-caption text-grey">Klicken zum Konfigurieren</p>
      </div>
    </template>

    <template #actions>
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-plus"
        @click.stop="showConfigDialog = true"
        block
      >
        Konfigurieren
      </v-btn>
    </template>
  </UnifiedCard>

  <!-- Pin-Konfigurations-Dialog bleibt unverändert -->
  <v-dialog v-model="showConfigDialog" max-width="500">
    <v-card>
      <v-card-title>Pin {{ pin }} konfigurieren</v-card-title>
      <v-card-text>
        <v-form ref="configForm" v-model="configValid">
          <v-select
            v-model="pinConfig.type"
            label="Gerätetyp"
            :items="deviceTypes"
            item-title="name"
            item-value="value"
            variant="outlined"
            density="comfortable"
            required
            :rules="[(v) => !!v || 'Gerätetyp ist erforderlich']"
          />
          <v-text-field
            v-model="pinConfig.name"
            label="Name"
            placeholder="z.B. Temperatursensor"
            variant="outlined"
            density="comfortable"
            required
            :rules="[(v) => !!v || 'Name ist erforderlich']"
          />
          <v-select
            v-model="pinConfig.subzoneId"
            label="Subzone"
            :items="subzoneOptions"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            required
            :rules="[(v) => !!v || 'Subzone ist erforderlich']"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="showConfigDialog = false">Abbrechen</v-btn>
        <v-btn
          color="primary"
          @click="configurePin"
          :loading="configuring"
          :disabled="!configValid"
        >
          Konfigurieren
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

const props = defineProps({
  espId: {
    type: String,
    required: true,
  },
  pin: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['configure'])

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const espStore = computed(() => centralDataHub.espManagement)

// Reactive state
const showConfigDialog = ref(false)
const configuring = ref(false)
const configForm = ref(null)
const configValid = ref(false)
const pinConfig = ref({
  type: '',
  name: '',
  subzoneId: '',
})

// Computed properties
const deviceInfo = computed(() => {
  return mqttStore.value.espDevices.get(props.espId) || {}
})

const subzoneOptions = computed(() => {
  const subzones = deviceInfo.value.subzones || []
  return subzones.map((subzone) => ({
    id: subzone.id,
    name: subzone.name,
  }))
})

const deviceTypes = computed(() => {
  return [
    { name: 'Temperatursensor (DS18B20)', value: 'SENSOR_TEMP_DS18B20' },
    { name: 'Bodensensor', value: 'SENSOR_SOIL' },
    { name: 'Durchflusssensor', value: 'SENSOR_FLOW' },
    { name: 'Feuchtigkeitssensor', value: 'SENSOR_HUMIDITY' },
    { name: 'Drucksensor', value: 'SENSOR_PRESSURE' },
    { name: 'Lichtsensor', value: 'SENSOR_LIGHT' },
    { name: 'Relais', value: 'AKTOR_RELAIS' },
    { name: 'Pumpe', value: 'AKTOR_PUMP' },
    { name: 'Ventil', value: 'AKTOR_VALVE' },
    { name: 'Befeuchter', value: 'AKTOR_HUMIDIFIER' },
    { name: 'Ventilator', value: 'AKTOR_FAN' },
    { name: 'Beleuchtung', value: 'AKTOR_LIGHT' },
  ]
})

// Methods
const configurePin = async () => {
  if (!configForm.value?.validate()) return

  configuring.value = true
  try {
    // Verwende bestehende ESP Management Store API
    await espStore.value.configurePinAssignment(props.espId, {
      gpio: props.pin,
      type: pinConfig.value.type,
      name: pinConfig.value.name,
      subzone: pinConfig.value.subzoneId,
      category: pinConfig.value.type.startsWith('SENSOR_') ? 'sensor' : 'actuator',
    })

    emit('configure', {
      espId: props.espId,
      pin: props.pin,
      type: pinConfig.value.type,
      name: pinConfig.value.name,
      subzoneId: pinConfig.value.subzoneId,
    })

    showConfigDialog.value = false

    // Reset form
    pinConfig.value = { type: '', name: '', subzoneId: '' }

    window.$snackbar?.showSuccess('Pin erfolgreich konfiguriert')
  } catch (error) {
    console.error('Pin configuration failed:', error)
    window.$snackbar?.showError('Fehler bei der Pin-Konfiguration')
  } finally {
    configuring.value = false
  }
}
</script>

<style scoped>
/* Entferne .pin-tree-card Styles - UnifiedCard übernimmt Styling */
</style>
