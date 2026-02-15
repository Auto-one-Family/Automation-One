<script setup lang="ts">
/**
 * SensorConfigPanel Component
 *
 * Loads sensor schema by type, fetches current config,
 * and provides DynamicForm for editing + save.
 */

import { ref, onMounted, computed } from 'vue'
import { Save } from 'lucide-vue-next'
import { sensorsApi } from '@/api/sensors'
import { useToast } from '@/composables/useToast'
import { getSensorSchema } from '@/config/sensor-schemas'
import { DynamicForm } from '@/components/forms'
import LiveDataPreview from './LiveDataPreview.vue'

interface Props {
  /** ESP device ID */
  espId: string
  /** GPIO pin number */
  gpio: number
  /** Sensor type string */
  sensorType: string
  /** Unit for live preview */
  unit?: string
}

const props = withDefaults(defineProps<Props>(), {
  unit: '',
})

const toast = useToast()
const schema = computed(() => getSensorSchema(props.sensorType))
const formData = ref<Record<string, unknown>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const config = await sensorsApi.get(props.espId, props.gpio)
    if (config) {
      formData.value = { ...config }
    }
  } catch {
    // No existing config - start with defaults
    formData.value = { gpio: props.gpio }
  } finally {
    loading.value = false
  }
})

async function handleSave(): Promise<void> {
  saving.value = true
  error.value = null

  try {
    await sensorsApi.createOrUpdate(props.espId, props.gpio, formData.value as any)
    toast.success('Konfiguration gespeichert')
  } catch (err) {
    const msg = (err as any)?.response?.data?.detail ?? 'Fehler beim Speichern'
    error.value = msg
    toast.error(msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="sensor-config-panel">
    <div class="sensor-config-panel__form">
      <DynamicForm
        :schema="schema"
        v-model="formData"
        :loading="loading"
        :disabled="saving"
      >
        <template #actions>
          <button
            class="sensor-config-panel__save"
            :disabled="saving || loading"
            @click="handleSave"
          >
            <Save class="sensor-config-panel__save-icon" />
            <span>{{ saving ? 'Speichert...' : 'Speichern' }}</span>
          </button>
        </template>
      </DynamicForm>
    </div>

    <div class="sensor-config-panel__preview">
      <LiveDataPreview
        :esp-id="espId"
        :gpio="gpio"
        :unit="unit"
      />
    </div>
  </div>
</template>

<style scoped>
.sensor-config-panel {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-4);
  align-items: start;
}

.sensor-config-panel__form {
  min-width: 0;
}

.sensor-config-panel__preview {
  width: 180px;
  flex-shrink: 0;
}

.sensor-config-panel__save {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: 13px;
  font-weight: 500;
  color: white;
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sensor-config-panel__save:hover:not(:disabled) {
  filter: brightness(1.1);
}

.sensor-config-panel__save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sensor-config-panel__save-icon {
  width: 14px;
  height: 14px;
}

@media (max-width: 640px) {
  .sensor-config-panel {
    grid-template-columns: 1fr;
  }

  .sensor-config-panel__preview {
    width: 100%;
  }
}
</style>
