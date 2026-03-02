/**
 * Quick Action Store
 *
 * State management for the Quick Action Ball (FAB) component.
 * Tracks menu state, context-dependent actions, and alert badge data
 * from notification-inbox.store.ts.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNotificationInboxStore } from './notification-inbox.store'
import type { Component } from 'vue'

// ── Types ───────────────────────────────────────────────────────────────

export interface QuickAction {
  id: string
  label: string
  icon: Component
  /** Category for grouping in menu */
  category: 'context' | 'global' | 'navigation'
  /** Action handler */
  handler: () => void | Promise<void>
  /** Keyboard shortcut hint (display only) */
  shortcutHint?: string
  /** Whether the action is currently disabled */
  disabled?: boolean
  /** Badge count (e.g., unread notifications) */
  badge?: number
  /** Badge variant for styling */
  badgeVariant?: 'critical' | 'warning' | 'info'
}

export type ViewContext =
  | 'hardware'
  | 'monitor'
  | 'logic'
  | 'system-monitor'
  | 'editor'
  | 'settings'
  | 'sensors'
  | 'other'

/** Sub-panel routing: which panel is shown inside the FAB */
export type QuickActionPanel = 'menu' | 'alerts' | 'navigation' | 'widgets'

// ── Store ───────────────────────────────────────────────────────────────

export const useQuickActionStore = defineStore('quick-action', () => {
  // State
  const isMenuOpen = ref(false)
  const activePanel = ref<QuickActionPanel>('menu')
  const currentView = ref<ViewContext>('other')
  const contextActions = ref<QuickAction[]>([])
  const globalActions = ref<QuickAction[]>([])

  // Computed: alert summary from notification inbox
  const alertSummary = computed(() => {
    const inbox = useNotificationInboxStore()
    return {
      unreadCount: inbox.unreadCount,
      highestSeverity: inbox.highestSeverity,
      badgeText: inbox.badgeText,
    }
  })

  const hasActiveAlerts = computed(() => alertSummary.value.unreadCount > 0)

  const isCritical = computed(
    () => alertSummary.value.highestSeverity === 'critical',
  )

  const isWarning = computed(
    () => alertSummary.value.highestSeverity === 'warning',
  )

  /** All actions: context-specific first, then global */
  const allActions = computed<QuickAction[]>(() => [
    ...contextActions.value,
    ...globalActions.value,
  ])

  // Actions
  function toggleMenu(): void {
    if (isMenuOpen.value) {
      closeMenu()
    } else {
      isMenuOpen.value = true
    }
  }

  function openMenu(): void {
    isMenuOpen.value = true
  }

  function closeMenu(): void {
    isMenuOpen.value = false
    activePanel.value = 'menu'
  }

  function setActivePanel(panel: QuickActionPanel): void {
    activePanel.value = panel
    if (!isMenuOpen.value) {
      isMenuOpen.value = true
    }
  }

  function setViewContext(view: ViewContext): void {
    currentView.value = view
  }

  function setContextActions(actions: QuickAction[]): void {
    contextActions.value = actions
  }

  function setGlobalActions(actions: QuickAction[]): void {
    globalActions.value = actions
  }

  function executeAction(actionId: string): void {
    const action = allActions.value.find((a) => a.id === actionId)
    if (action && !action.disabled) {
      const panelBefore = activePanel.value
      action.handler()
      // Only close if handler didn't navigate to a sub-panel
      if (activePanel.value === panelBefore) {
        closeMenu()
      }
    }
  }

  return {
    // State
    isMenuOpen,
    activePanel,
    currentView,
    contextActions,
    globalActions,

    // Computed
    alertSummary,
    hasActiveAlerts,
    isCritical,
    isWarning,
    allActions,

    // Actions
    toggleMenu,
    openMenu,
    closeMenu,
    setActivePanel,
    setViewContext,
    setContextActions,
    setGlobalActions,
    executeAction,
  }
})
