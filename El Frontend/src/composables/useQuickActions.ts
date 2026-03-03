/**
 * useQuickActions — Context-dependent Quick Action definitions
 *
 * Watches the current route and provides view-specific + global actions
 * to the QuickActionBall. Each view gets its own set of actions that
 * are merged with always-available global actions.
 */

import { watch, onUnmounted, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuickActionStore } from '@/shared/stores/quickAction.store'
import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'
import { useUiStore } from '@/shared/stores/ui.store'
import type { QuickAction, ViewContext } from '@/shared/stores/quickAction.store'
import {
  Bell,
  Search,
  ShieldAlert,
  Activity,
  FileText,
  Cpu,
  Navigation,
  LayoutDashboard,
  LayoutGrid,
} from 'lucide-vue-next'

/** Navigate helper — wraps router.push to satisfy void handler signature */
function nav(router: ReturnType<typeof useRouter>, to: string): void {
  void router.push(to)
}

/** Determine ViewContext from route path */
function resolveViewContext(path: string): ViewContext {
  if (path.startsWith('/hardware')) return 'hardware'
  if (path.startsWith('/monitor')) return 'monitor'
  if (path.startsWith('/logic')) return 'logic'
  if (path.startsWith('/system-monitor')) return 'system-monitor'
  if (path.startsWith('/editor')) return 'editor'
  if (path.startsWith('/settings')) return 'settings'
  if (path.startsWith('/sensors')) return 'sensors'
  return 'other'
}

/**
 * Build context-specific actions for the current view.
 *
 * Only functional cross-links — no placeholders, no self-links,
 * no routes that leave context without clear purpose.
 */
function buildContextActions(
  view: ViewContext,
  router: ReturnType<typeof useRouter>,
  quickActionStore: ReturnType<typeof useQuickActionStore>,
): QuickAction[] {
  switch (view) {
    case 'hardware':
      return [
        {
          id: 'hw-live-monitor',
          label: 'Live-Monitor',
          icon: markRaw(Activity),
          category: 'context',
          handler: () => nav(router, '/monitor'),
        },
        {
          id: 'hw-widget-insert',
          label: 'Widget hinzufügen',
          icon: markRaw(LayoutGrid),
          category: 'context',
          handler: () => quickActionStore.setActivePanel('widgets'),
        },
      ]

    case 'monitor':
      return [
        {
          id: 'mon-dashboards',
          label: 'Dashboards',
          icon: markRaw(LayoutDashboard),
          category: 'context',
          handler: () => quickActionStore.setActivePanel('dashboards'),
        },
      ]

    case 'editor':
      return [
        {
          id: 'editor-add-widget',
          label: 'Widget hinzufügen',
          icon: markRaw(LayoutGrid),
          category: 'context',
          handler: () => quickActionStore.setActivePanel('widgets'),
        },
      ]

    case 'logic':
      return [
        {
          id: 'logic-execution-log',
          label: 'Ausführungslog',
          icon: markRaw(FileText),
          category: 'context',
          handler: () => nav(router, '/system-monitor?tab=events'),
        },
      ]

    case 'system-monitor':
      return [
        {
          id: 'sys-log-search',
          label: 'Log-Suche',
          icon: markRaw(Search),
          category: 'context',
          handler: () => nav(router, '/system-monitor?tab=logs'),
        },
        {
          id: 'sys-health-check',
          label: 'Health-Check',
          icon: markRaw(Cpu),
          category: 'context',
          handler: () => nav(router, '/system-monitor?tab=health'),
        },
      ]

    case 'sensors':
      return [
        {
          id: 'sensors-live-monitor',
          label: 'Live-Monitor',
          icon: markRaw(Activity),
          category: 'context',
          handler: () => nav(router, '/monitor'),
        },
      ]

    default:
      return []
  }
}

/** Build global actions (always available) */
function buildGlobalActions(
  quickActionStore: ReturnType<typeof useQuickActionStore>,
  inboxStore: ReturnType<typeof useNotificationInboxStore>,
  uiStore: ReturnType<typeof useUiStore>,
): QuickAction[] {
  return [
    {
      id: 'global-alerts',
      label: 'Alert-Panel',
      icon: markRaw(Bell),
      category: 'global',
      handler: () => quickActionStore.setActivePanel('alerts'),
      badge: inboxStore.unreadCount,
      badgeVariant: inboxStore.highestSeverity === 'critical'
        ? 'critical'
        : inboxStore.highestSeverity === 'warning'
          ? 'warning'
          : 'info',
    },
    {
      id: 'global-navigation',
      label: 'Navigation',
      icon: markRaw(Navigation),
      category: 'global',
      handler: () => quickActionStore.setActivePanel('navigation'),
    },
    {
      id: 'global-emergency',
      label: 'Emergency Stop',
      icon: markRaw(ShieldAlert),
      category: 'global',
      handler: () => {
        /* Triggers EmergencyStopButton via event or direct call */
        window.dispatchEvent(new CustomEvent('emergency-stop-trigger'))
      },
    },
    {
      id: 'global-search',
      label: 'Quick-Search',
      icon: markRaw(Search),
      category: 'global',
      shortcutHint: 'Ctrl+K',
      handler: () => uiStore.toggleCommandPalette(),
    },
  ]
}

/**
 * Composable: watches route changes and updates the quick action store
 * with context-appropriate actions.
 *
 * Must be called inside a component setup function.
 */
export function useQuickActions(): void {
  const route = useRoute()
  const router = useRouter()
  const quickActionStore = useQuickActionStore()
  const inboxStore = useNotificationInboxStore()
  const uiStore = useUiStore()

  const stopWatch = watch(
    () => route.path,
    (path) => {
      const view = resolveViewContext(path)
      quickActionStore.setViewContext(view)
      quickActionStore.setContextActions(buildContextActions(view, router, quickActionStore))
      quickActionStore.setGlobalActions(
        buildGlobalActions(quickActionStore, inboxStore, uiStore),
      )
    },
    { immediate: true },
  )

  onUnmounted(() => {
    stopWatch()
  })
}
