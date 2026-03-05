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
  Stethoscope,
  HeartPulse,
  Database,
} from 'lucide-vue-next'

/** Navigate helper — wraps router.push and catches dynamic import failures */
function nav(router: ReturnType<typeof useRouter>, to: string): void {
  router.push(to).catch(() => {
    // Dynamic import failures (ERR_INSUFFICIENT_RESOURCES, chunk load errors)
    // are handled by the global router.onError handler
  })
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
  if (path.startsWith('/plugins')) return 'plugins'
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
        {
          id: 'ctx-full-diagnostic',
          label: 'Volle Diagnose',
          icon: markRaw(Stethoscope),
          category: 'context',
          handler: async () => {
            const { useDiagnosticsStore } = await import('@/shared/stores/diagnostics.store')
            const diagnosticsStore = useDiagnosticsStore()
            await diagnosticsStore.runDiagnostic()
          },
        },
      ]

    case 'plugins':
      return [
        {
          id: 'ctx-healthcheck',
          label: 'HealthCheck ausführen',
          icon: markRaw(HeartPulse),
          category: 'context',
          handler: async () => {
            const { usePluginsStore } = await import('@/shared/stores/plugins.store')
            const pluginsStore = usePluginsStore()
            await pluginsStore.executePlugin('health_check')
          },
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
  router: ReturnType<typeof useRouter>,
  quickActionStore: ReturnType<typeof useQuickActionStore>,
  uiStore: ReturnType<typeof useUiStore>,
): QuickAction[] {
  return [
    {
      id: 'global-alerts',
      label: 'Alert-Panel',
      icon: markRaw(Bell),
      category: 'global',
      handler: () => quickActionStore.setActivePanel('alerts'),
      badge: 0,
      badgeVariant: 'info',
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
    {
      id: 'global-diagnose',
      label: 'Diagnose starten',
      icon: markRaw(Stethoscope),
      category: 'global',
      handler: async () => {
        const { useDiagnosticsStore } = await import('@/shared/stores/diagnostics.store')
        const diagnosticsStore = useDiagnosticsStore()
        await diagnosticsStore.runDiagnostic()
      },
    },
    {
      id: 'global-last-report',
      label: 'Letzter Report',
      icon: markRaw(FileText),
      category: 'global',
      handler: () => nav(router, '/system-monitor?tab=reports'),
    },
    {
      id: 'global-backup-create',
      label: 'Backup erstellen',
      icon: markRaw(Database),
      category: 'global',
      handler: async () => {
        const { backupsApi } = await import('@/api/backups')
        try {
          await backupsApi.createBackup()
        } catch {
          // Error is handled by API interceptor (toast)
        }
      },
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
  const uiStore = useUiStore()

  const stopWatch = watch(
    () => route.path,
    (path) => {
      const view = resolveViewContext(path)
      quickActionStore.setViewContext(view)
      quickActionStore.setContextActions(buildContextActions(view, router, quickActionStore))
      quickActionStore.setGlobalActions(
        buildGlobalActions(router, quickActionStore, uiStore),
      )
    },
    { immediate: true },
  )

  onUnmounted(() => {
    stopWatch()
  })
}
