<script setup lang="ts">
/**
 * ConfirmDialog
 *
 * Promise-based confirmation dialog using BaseModal.
 * Globally mounted in App.vue, reads state from uiStore.
 * Three variants: info (blue), warning (yellow), danger (red).
 */

import { computed, nextTick, ref, watch } from 'vue'
import { AlertTriangle, Info } from 'lucide-vue-next'
import BaseModal from '@/shared/design/primitives/BaseModal.vue'
import { useUiStore } from '@/shared/stores/ui.store'

const uiStore = useUiStore()
const cancelBtnRef = ref<HTMLButtonElement | null>(null)

const state = computed(() => uiStore.confirmState)
const isOpen = computed(() => state.value.isOpen)

const confirmText = computed(() => {
  if (state.value.confirmText) return state.value.confirmText
  return state.value.variant === 'danger' ? 'Löschen' : 'Bestätigen'
})

const cancelText = computed(() => state.value.cancelText || 'Abbrechen')

const iconComponent = computed(() => {
  if (state.value.icon) return state.value.icon
  return state.value.variant === 'info' ? Info : AlertTriangle
})

const variantClass = computed(() => `confirm-dialog--${state.value.variant}`)

const confirmBtnClass = computed(() => {
  switch (state.value.variant) {
    case 'danger': return 'confirm-dialog__btn--danger'
    case 'warning': return 'confirm-dialog__btn--warning'
    default: return 'confirm-dialog__btn--info'
  }
})

function handleConfirm(): void {
  uiStore.resolveConfirm(true)
}

function handleCancel(): void {
  uiStore.resolveConfirm(false)
}

// Auto-focus cancel button when dialog opens (safe default)
watch(isOpen, async (open) => {
  if (open) {
    await nextTick()
    cancelBtnRef.value?.focus()
  }
})
</script>

<template>
  <BaseModal
    :open="isOpen"
    :title="state.title"
    max-width="max-w-md"
    :show-close="false"
    :close-on-overlay="false"
    :close-on-escape="false"
  >
    <div :class="['confirm-dialog', variantClass]">
      <!-- Icon + Message -->
      <div class="confirm-dialog__body">
        <div class="confirm-dialog__icon">
          <component :is="iconComponent" class="w-6 h-6" />
        </div>
        <p class="confirm-dialog__message">{{ state.message }}</p>
      </div>
    </div>

    <template #footer>
      <div class="confirm-dialog__actions">
        <button
          ref="cancelBtnRef"
          class="confirm-dialog__btn confirm-dialog__btn--cancel"
          @click="handleCancel"
        >
          {{ cancelText }}
        </button>
        <button
          :class="['confirm-dialog__btn', confirmBtnClass]"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.confirm-dialog__body {
  display: flex;
  gap: var(--space-4, 16px);
  align-items: flex-start;
}

.confirm-dialog__icon {
  flex-shrink: 0;
  padding: var(--space-2, 8px);
  border-radius: var(--radius-md, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog--info .confirm-dialog__icon {
  background-color: rgba(96, 165, 250, 0.1);
  color: var(--color-info, #60a5fa);
}

.confirm-dialog--warning .confirm-dialog__icon {
  background-color: rgba(251, 191, 36, 0.1);
  color: var(--color-warning, #fbbf24);
}

.confirm-dialog--danger .confirm-dialog__icon {
  background-color: rgba(248, 113, 113, 0.1);
  color: var(--color-error, #f87171);
}

.confirm-dialog__message {
  color: var(--color-text-secondary, #8585a0);
  font-size: var(--text-sm, 14px);
  line-height: 1.5;
  margin: 0;
  padding-top: var(--space-2, 8px);
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3, 12px);
}

.confirm-dialog__btn {
  padding: var(--space-2, 8px) var(--space-4, 16px);
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 120ms) ease;
  min-height: 40px;
  border: none;
}

.confirm-dialog__btn--cancel {
  background-color: var(--color-bg-tertiary, #15151f);
  color: var(--color-text-secondary, #8585a0);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.06));
}

.confirm-dialog__btn--cancel:hover {
  background-color: var(--color-bg-quaternary, #1d1d2a);
  color: var(--color-text-primary, #eaeaf2);
}

.confirm-dialog__btn--cancel:focus-visible {
  outline: 2px solid var(--color-accent, #3b82f6);
  outline-offset: 2px;
}

.confirm-dialog__btn--info {
  background-color: var(--color-info, #60a5fa);
  color: #fff;
}

.confirm-dialog__btn--info:hover {
  background-color: #4d94f8;
}

.confirm-dialog__btn--warning {
  background-color: var(--color-warning, #fbbf24);
  color: #1a1a2e;
}

.confirm-dialog__btn--warning:hover {
  background-color: #f5b014;
}

.confirm-dialog__btn--danger {
  background-color: var(--color-error, #f87171);
  color: #fff;
}

.confirm-dialog__btn--danger:hover {
  background-color: #f55a5a;
}

.confirm-dialog__btn--danger:focus-visible,
.confirm-dialog__btn--info:focus-visible,
.confirm-dialog__btn--warning:focus-visible {
  outline: 2px solid var(--color-accent, #3b82f6);
  outline-offset: 2px;
}
</style>
