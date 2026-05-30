<script setup lang="ts">
import { ref } from 'vue'
import { apiClient } from '@/api/client'

interface Props {
  payload: { kind: 'sensor' | 'actuator'; type: string; espId: string }
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const tab = ref(0)
const name = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

async function save(): Promise<void> {
  saving.value = true
  error.value = null
  try {
    if (props.payload.kind === 'sensor') {
      await apiClient.post(`/esp/devices/${props.payload.espId}/sensors`, {
        gpio: 0,
        sensor_type: props.payload.type,
        name: name.value || props.payload.type,
        active: true,
      })
    } else {
      await apiClient.post(`/esp/devices/${props.payload.espId}/actuators`, {
        gpio: 0,
        actuator_type: props.payload.type,
        name: name.value || props.payload.type,
        active: true,
      })
    }
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Speichern fehlgeschlagen'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 glass-overlay"
      aria-label="Wizard schließen"
      @click="emit('close')"
    />
    <div class="relative z-10 w-full max-w-lg glass-panel rounded-xl p-6">
      <h3 class="text-lg font-semibold">
        {{ payload.kind === 'sensor' ? 'Sensor' : 'Aktor' }} — {{ payload.type }}
      </h3>
      <nav class="mt-4 flex gap-2 text-xs">
        <button
          v-for="(label, i) in ['Allgemein', 'Schwellen', 'Hardware', 'Live']"
          :key="label"
          type="button"
          class="rounded px-2 py-1"
          :class="tab === i ? 'bg-accent text-white' : 'text-dark-400'"
          @click="tab = i"
        >
          {{ label }}
        </button>
      </nav>
      <div v-if="tab === 0" class="mt-4">
        <label class="block text-sm text-dark-300">Name</label>
        <input
          v-model="name"
          class="mt-1 w-full rounded-lg border border-glass-border bg-dark-900 px-3 py-2 text-dark-100"
          aria-label="Name"
        />
      </div>
      <p v-if="error" class="mt-3 text-sm text-danger">{{ error }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-dark-300 hover:bg-dark-800"
          @click="emit('close')"
        >
          Abbrechen
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50"
          :disabled="saving"
          aria-label="Speichern"
          @click="save"
        >
          {{ saving ? 'Speichert…' : 'Speichern' }}
        </button>
      </div>
    </div>
  </div>
</template>
