/**
 * useToast Composable
 *
 * Lightweight toast notification system with:
 * - Singleton pattern for shared state
 * - Auto-dismiss with configurable duration
 * - Action buttons (Retry, Undo, etc.)
 * - Multiple toast stacking
 */

import { reactive, computed, type ComputedRef } from 'vue'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
  variant?: 'primary' | 'secondary'
}

export interface ToastOptions {
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  persistent?: boolean
  actions?: ToastAction[]
}

export interface Toast extends ToastOptions {
  id: string
  createdAt: number
}

interface ToastState {
  toasts: Toast[]
}

// Default durations
const DEFAULT_DURATION = 5000
const ERROR_DURATION = 8000

// Singleton state - shared across all components
const state = reactive<ToastState>({
  toasts: []
})

// Generate unique ID
function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function useToast() {
  /**
   * Show a toast notification
   * @returns Toast ID for programmatic removal
   */
  function show(options: ToastOptions): string {
    const id = generateId()
    const duration = options.duration ??
      (options.type === 'error' ? ERROR_DURATION : DEFAULT_DURATION)

    const toast: Toast = {
      ...options,
      id,
      duration,
      createdAt: Date.now()
    }

    state.toasts.push(toast)

    // Auto-dismiss unless persistent
    if (!options.persistent) {
      setTimeout(() => {
        dismiss(id)
      }, duration)
    }

    return id
  }

  /**
   * Show success toast
   */
  function success(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): string {
    return show({ message, type: 'success', ...options })
  }

  /**
   * Show error toast
   */
  function error(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): string {
    return show({ message, type: 'error', ...options })
  }

  /**
   * Show warning toast
   */
  function warning(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): string {
    return show({ message, type: 'warning', ...options })
  }

  /**
   * Show info toast
   */
  function info(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): string {
    return show({ message, type: 'info', ...options })
  }

  /**
   * Dismiss a specific toast by ID
   */
  function dismiss(id: string): void {
    const index = state.toasts.findIndex(t => t.id === id)
    if (index !== -1) {
      state.toasts.splice(index, 1)
    }
  }

  /**
   * Clear all toasts
   */
  function clear(): void {
    state.toasts.splice(0, state.toasts.length)
  }

  // Computed reactive list for ToastContainer
  const toasts: ComputedRef<Toast[]> = computed(() => state.toasts)

  return {
    show,
    success,
    error,
    warning,
    info,
    dismiss,
    clear,
    toasts
  }
}
