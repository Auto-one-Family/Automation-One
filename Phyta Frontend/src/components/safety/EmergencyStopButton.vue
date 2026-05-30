<script setup lang="ts">
import { ref } from 'vue'
import { OctagonX } from 'lucide-vue-next'
import { emergencyStop } from '@/api/actuators'

interface Props {
  compact?: boolean
}

defineProps<Props>()

const isLoading = ref(false)
const showConfirm = ref(false)
const error = ref<string | null>(null)

async function handleEmergencyStop(): Promise<void> {
  showConfirm.value = false
  isLoading.value = true
  error.value = null
  try {
    await emergencyStop('Manueller Notfall-Stopp über Geräte-Übersicht')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Not-Aus fehlgeschlagen'
  } finally {
    isLoading.value = false
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') showConfirm.value = false
}

function openConfirm(): void {
  showConfirm.value = true
  document.addEventListener('keydown', onKeydown, { once: true })
}
</script>

<template>
  <button
    type="button"
    class="emergency-btn"
    :class="{
      'emergency-btn--loading': isLoading,
      'emergency-btn--compact': compact,
    }"
    :disabled="isLoading"
    title="NOTFALL-STOPP: Alle Aktoren sofort abschalten"
    aria-label="Not-Aus: Alle Aktoren sofort abschalten"
    @click="openConfirm"
  >
    <OctagonX :size="16" aria-hidden="true" />
    <span class="hidden sm:inline">NOT-AUS</span>
  </button>

  <Teleport to="body">
    <div
      v-if="showConfirm"
      class="emergency-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-stop-title"
      @click.self="showConfirm = false"
    >
      <div class="emergency-dialog">
        <OctagonX :size="40" class="emergency-dialog__icon" aria-hidden="true" />
        <h3 id="emergency-stop-title" class="emergency-dialog__title">NOTFALL-STOPP</h3>
        <p class="emergency-dialog__text">
          Dies stoppt <strong>alle Aktoren auf allen Geräten</strong> sofort. Fortfahren?
        </p>
        <p v-if="error" class="emergency-dialog__error" role="alert">{{ error }}</p>
        <div class="emergency-dialog__actions">
          <button type="button" class="emergency-dialog__cancel" @click="showConfirm = false">
            Abbrechen
          </button>
          <button
            type="button"
            class="emergency-dialog__confirm"
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
  gap: var(--space-1);
  padding: 6px var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  color: var(--color-error);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-error) 22%, transparent) 0%,
    color-mix(in srgb, var(--color-error) 14%, transparent) 100%
  );
  border: 1.5px solid var(--color-error-border);
  box-shadow:
    0 0 12px color-mix(in srgb, var(--color-error) 26%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--color-text-inverse) 8%, transparent);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.emergency-btn:hover:not(:disabled) {
  color: var(--color-text-inverse);
  transform: scale(1.03);
  box-shadow: 0 0 24px color-mix(in srgb, var(--color-error) 42%, transparent);
}

.emergency-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emergency-btn--compact {
  padding: 6px var(--space-2);
  font-size: var(--text-xs);
}

.emergency-btn--compact span {
  display: none;
}

.emergency-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-safety);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--backdrop-color);
  backdrop-filter: blur(var(--backdrop-blur));
}

.emergency-dialog {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  max-width: 360px;
  width: 90%;
  text-align: center;
  box-shadow:
    0 0 60px color-mix(in srgb, var(--color-error) 22%, transparent),
    var(--elevation-floating);
  animation: scale-in 0.2s var(--ease-out) forwards;
}

.emergency-dialog__icon {
  color: var(--color-error);
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
  margin-bottom: var(--space-4);
  line-height: var(--leading-normal);
}

.emergency-dialog__error {
  font-size: var(--text-sm);
  color: var(--color-error);
  margin-bottom: var(--space-3);
}

.emergency-dialog__actions {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
}

.emergency-dialog__cancel {
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  cursor: pointer;
}

.emergency-dialog__confirm {
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text-inverse);
  background: var(--color-error);
  border: none;
  cursor: pointer;
}

.emergency-dialog__confirm:disabled {
  opacity: 0.5;
}
</style>
