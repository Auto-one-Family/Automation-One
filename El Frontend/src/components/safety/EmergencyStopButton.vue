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
/* ═══════════════════════════════════════════════════════════════════════════
   EMERGENCY STOP — The ONLY red element in the entire UI
   Visually heavy, always visible, impossible to miss
   ═══════════════════════════════════════════════════════════════════════════ */

.emergency-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 6px var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  color: #fca5a5;
  background: linear-gradient(135deg,
    rgba(239, 68, 68, 0.2) 0%,
    rgba(185, 28, 28, 0.15) 100%
  );
  border: 1.5px solid rgba(239, 68, 68, 0.5);
  box-shadow:
    0 0 12px rgba(239, 68, 68, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

/* Subtle pulse glow when idle — draws eye */
.emergency-btn::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: radial-gradient(
    ellipse at center,
    rgba(239, 68, 68, 0.15) 0%,
    transparent 70%
  );
  animation: emergency-idle-glow 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes emergency-idle-glow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

.emergency-btn:hover:not(:disabled) {
  color: #fee2e2;
  background: linear-gradient(135deg,
    rgba(239, 68, 68, 0.35) 0%,
    rgba(185, 28, 28, 0.25) 100%
  );
  box-shadow:
    0 0 24px rgba(239, 68, 68, 0.35),
    0 0 8px rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.7);
  transform: scale(1.03);
}

.emergency-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emergency-btn--loading {
  animation: pulse-emergency 1s ease-in-out infinite;
}

/* ── Confirmation Dialog ── */
.emergency-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 7, 13, 0.85);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

.emergency-dialog {
  background: var(--color-bg-secondary);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  max-width: 360px;
  width: 90%;
  text-align: center;
  box-shadow:
    0 0 60px rgba(239, 68, 68, 0.15),
    var(--elevation-floating);
  animation: scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.emergency-dialog__icon {
  margin-bottom: var(--space-3);
}

.emergency-dialog__title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-error);
  margin-bottom: var(--space-2);
  letter-spacing: var(--tracking-wide);
}

.emergency-dialog__text {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-6);
  line-height: var(--leading-normal);
}

.emergency-dialog__actions {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
}
</style>
