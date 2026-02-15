<script setup lang="ts">
/**
 * ToastContainer Component
 *
 * Renders toast notifications in bottom-right corner with:
 * - Smooth enter/leave animations
 * - Progress bar for auto-dismiss countdown
 * - Action buttons (Retry, Undo, etc.)
 * - Accessible: aria-live regions
 */

import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X
} from 'lucide-vue-next'
import { useToast, type Toast, type ToastAction } from '@/composables/useToast'

const { toasts, dismiss } = useToast()

// Icon mapping by toast type
const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

function getIcon(type: Toast['type']) {
  return iconMap[type]
}

function getAriaLive(type: Toast['type']): 'assertive' | 'polite' {
  return type === 'error' ? 'assertive' : 'polite'
}

async function handleAction(toastId: string, action: ToastAction) {
  try {
    await action.onClick()
  } finally {
    dismiss(toastId)
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-label="Benachrichtigungen">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast', `toast--${toast.type}`]"
          role="alert"
          :aria-live="getAriaLive(toast.type)"
        >
          <!-- Icon -->
          <div class="toast__icon-wrapper">
            <component :is="getIcon(toast.type)" class="toast__icon" />
          </div>

          <!-- Content -->
          <div class="toast__content">
            <p class="toast__message">{{ toast.message }}</p>

            <!-- Action buttons -->
            <div v-if="toast.actions?.length" class="toast__actions">
              <button
                v-for="(action, idx) in toast.actions"
                :key="idx"
                :class="['toast__action', `toast__action--${action.variant || 'secondary'}`]"
                @click="handleAction(toast.id, action)"
              >
                {{ action.label }}
              </button>
            </div>
          </div>

          <!-- Dismiss button -->
          <button
            class="toast__close"
            @click="dismiss(toast.id)"
            aria-label="Schließen"
          >
            <X class="w-4 h-4" />
          </button>

          <!-- Progress bar for auto-dismiss -->
          <div
            v-if="!toast.persistent"
            class="toast__progress"
            :style="{ animationDuration: `${toast.duration}ms` }"
          />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 400px;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  position: relative;
  overflow: hidden;
}

/* Type-specific accents */
.toast--success {
  border-left: 3px solid var(--color-success, #34d399);
}

.toast--error {
  border-left: 3px solid var(--color-error, #f87171);
}

.toast--warning {
  border-left: 3px solid var(--color-warning, #fbbf24);
}

.toast--info {
  border-left: 3px solid var(--color-iridescent-1, #60a5fa);
}

/* Icon */
.toast__icon-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.toast--success .toast__icon {
  color: var(--color-success, #34d399);
}

.toast--error .toast__icon {
  color: var(--color-error, #f87171);
}

.toast--warning .toast__icon {
  color: var(--color-warning, #fbbf24);
}

.toast--info .toast__icon {
  color: var(--color-iridescent-1, #60a5fa);
}

/* Content */
.toast__content {
  flex: 1;
  min-width: 0;
}

.toast__message {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  line-height: 1.4;
  word-wrap: break-word;
}

/* Actions */
.toast__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.toast__action {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toast__action--primary {
  background-color: var(--color-iridescent-1, #60a5fa);
  color: white;
}

.toast__action--primary:hover {
  background-color: var(--color-iridescent-2, #a78bfa);
}

.toast__action--secondary {
  background-color: rgba(255, 255, 255, 0.1);
  color: var(--color-text-secondary);
  border: 1px solid var(--glass-border);
}

.toast__action--secondary:hover {
  background-color: rgba(255, 255, 255, 0.15);
  color: var(--color-text-primary);
}

/* Close button */
.toast__close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.2s ease;
}

.toast__close:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
}

/* Progress bar */
.toast__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  background: currentColor;
  opacity: 0.2;
  animation: toast-progress linear forwards;
}

.toast--success .toast__progress {
  color: var(--color-success, #34d399);
}

.toast--error .toast__progress {
  color: var(--color-error, #f87171);
}

.toast--warning .toast__progress {
  color: var(--color-warning, #fbbf24);
}

.toast--info .toast__progress {
  color: var(--color-iridescent-1, #60a5fa);
}

@keyframes toast-progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

/* Transition animations */
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.2s ease-in forwards;
}

.toast-move {
  transition: transform 0.3s ease;
}

@keyframes toast-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toast-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

/* Mobile responsive */
@media (max-width: 480px) {
  .toast-container {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    max-width: none;
  }
}
</style>
