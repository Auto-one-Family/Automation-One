<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { OctagonX } from 'lucide-vue-next'
import { useEspStore } from '@/stores/esp'

const espStore = useEspStore()
const isLoading = ref(false)
const showConfirm = ref(false)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    showConfirm.value = false
  }
}

watch(showConfirm, (open) => {
  if (open) {
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

async function handleEmergencyStop() {
  showConfirm.value = false
  isLoading.value = true
  try {
    await espStore.emergencyStopAll('Manueller Notfall-Stopp über UI')
  } catch {
    // Toast is handled inside emergencyStopAll
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <!-- Emergency Stop Trigger -->
  <button
    class="emergency-btn"
    :class="{ 'emergency-btn--loading': isLoading }"
    :disabled="isLoading"
    title="NOTFALL-STOPP: Alle Aktoren sofort abschalten"
    @click="showConfirm = true"
  >
    <OctagonX class="w-4 h-4" />
    <span class="hidden md:inline">NOT-AUS</span>
  </button>

  <!-- Confirmation Dialog Overlay -->
  <Teleport to="body">
    <div v-if="showConfirm" class="emergency-overlay" @click.self="showConfirm = false">
      <div class="emergency-dialog">
        <div class="emergency-dialog__icon">
          <OctagonX class="w-10 h-10 text-red-400" />
        </div>
        <h3 class="emergency-dialog__title">NOTFALL-STOPP</h3>
        <p class="emergency-dialog__text">
          Dies stoppt <strong>alle Aktoren auf allen Geräten</strong> sofort.
          Fortfahren?
        </p>
        <div class="emergency-dialog__actions">
          <button
            class="btn btn-secondary btn-sm"
            @click="showConfirm = false"
          >
            Abbrechen
          </button>
          <button
            class="btn btn-danger btn-sm"
            :disabled="isLoading"
            @click="handleEmergencyStop"
          >
            STOPP AUSFÜHREN
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.emergency-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  color: rgb(248, 113, 113);
  background: linear-gradient(135deg,
    rgba(239, 68, 68, 0.2) 0%,
    rgba(239, 68, 68, 0.1) 100%
  );
  border: 1px solid rgba(239, 68, 68, 0.4);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.15);
  cursor: pointer;
  transition: all 0.2s;
}

.emergency-btn:hover:not(:disabled) {
  background: linear-gradient(135deg,
    rgba(239, 68, 68, 0.35) 0%,
    rgba(239, 68, 68, 0.2) 100%
  );
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.6);
}

.emergency-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emergency-btn--loading {
  animation: pulse-emergency 1s ease-in-out infinite;
}

@keyframes pulse-emergency {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Confirmation Dialog */
.emergency-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.emergency-dialog {
  background: var(--color-bg-secondary, #12121a);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 1rem;
  padding: 1.5rem;
  max-width: 360px;
  width: 90%;
  text-align: center;
  box-shadow: 0 0 40px rgba(239, 68, 68, 0.15);
}

.emergency-dialog__icon {
  margin-bottom: 0.75rem;
}

.emergency-dialog__title {
  font-size: 1.125rem;
  font-weight: 700;
  color: rgb(248, 113, 113);
  margin-bottom: 0.5rem;
}

.emergency-dialog__text {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #b0b0c0);
  margin-bottom: 1.25rem;
  line-height: 1.5;
}

.emergency-dialog__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}
</style>
