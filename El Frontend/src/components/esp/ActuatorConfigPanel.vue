<script setup lang="ts">
/**
 * ActuatorConfigPanel Component
 *
 * Similar to SensorConfigPanel but for actuator types.
 * Uses getActuatorSchema for relay/pwm/etc.
 */

import { ref, onMounted, computed } from 'vue'
import { Save } from 'lucide-vue-next'
import { actuatorsApi } from '@/api/actuators'
import { useToast } from '@/composables/useToast'
import { getActuatorSchema } from '@/config/sensor-schemas'
import { DynamicForm } from '@/components/forms'

interface Props {
  /** ESP device ID */
  espId: string
  /** GPIO pin number */
  gpio: number
  /** Actuator type string */
  actuatorType: string
}

const props = defineProps<Props>()

const toast = useToast()
const schema = computed(() => getActuatorSchema(props.actuatorType))
const formData = ref<Record<string, unknown>>({})
const loading = ref(true)
const saving = ref(false)

onMounted(async () => {
  try {
    const config = await actuatorsApi.get(props.espId, props.gpio)
    if (config) {
      formData.value = { ...config }
    }
  } catch {
    formData.value = { gpio: props.gpio }
  } finally {
    loading.value = false
  }
})

async function handleSave(): Promise<void> {
  saving.value = true

  try {
    await actuatorsApi.createOrUpdate(props.espId, props.gpio, formData.value as any)
    toast.success('Aktuator-Konfiguration gespeichert')
  } catch (err) {
    const msg = (err as any)?.response?.data?.detail ?? 'Fehler beim Speichern'
    toast.error(msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="actuator-config-panel">
    <DynamicForm
      :schema="schema"
      v-model="formData"
      :loading="loading"
      :disabled="saving"
    >
      <template #actions>
        <button
          class="actuator-config-panel__save"
          :disabled="saving || loading"
          @click="handleSave"
        >
          <Save class="actuator-config-panel__save-icon" />
          <span>{{ saving ? 'Speichert...' : 'Speichern' }}</span>
        </button>
      </template>
    </DynamicForm>
  </div>
</template>

<style scoped>
.actuator-config-panel__save {
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

.actuator-config-panel__save:hover:not(:disabled) {
  filter: brightness(1.1);
}

.actuator-config-panel__save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.actuator-config-panel__save-icon {
  width: 14px;
  height: 14px;
}
</style>
