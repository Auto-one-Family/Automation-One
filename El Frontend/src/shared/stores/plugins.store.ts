/**
 * Plugins Store (Phase 4C)
 *
 * Manages AutoOps plugin state: list, detail, execution, config updates.
 * Uses Setup Store pattern (Composition API).
 */

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { pluginsApi } from '@/api/plugins'
import type { PluginDTO, PluginDetailDTO, PluginExecutionDTO } from '@/api/plugins'
import { useToast } from '@/composables/useToast'

export const usePluginsStore = defineStore('plugins', () => {
  // ======================== STATE ========================

  const plugins = ref<PluginDTO[]>([])
  const selectedPlugin = ref<PluginDetailDTO | null>(null)
  const executionHistory = ref<PluginExecutionDTO[]>([])
  const isLoading = ref(false)
  const isExecuting = ref(false)

  // ======================== GETTERS ========================

  const enabledPlugins = computed(() =>
    plugins.value.filter((p) => p.is_enabled),
  )

  const disabledPlugins = computed(() =>
    plugins.value.filter((p) => !p.is_enabled),
  )

  const pluginsByCategory = computed(() => {
    const groups: Record<string, PluginDTO[]> = {}
    for (const plugin of plugins.value) {
      const cat = plugin.category || 'other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(plugin)
    }
    return groups
  })

  /**
   * Plugin lookup by ID (for RuleFlowEditor plugin action config)
   */
  const pluginOptions = computed(() =>
    plugins.value.map((p) => ({
      value: p.plugin_id,
      label: p.display_name,
      disabled: !p.is_enabled,
    })),
  )

  // ======================== ACTIONS ========================

  const toast = useToast()

  async function fetchPlugins(): Promise<void> {
    isLoading.value = true
    try {
      plugins.value = await pluginsApi.list()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Plugins konnten nicht geladen werden')
    } finally {
      isLoading.value = false
    }
  }

  async function fetchPluginDetail(pluginId: string): Promise<void> {
    isLoading.value = true
    try {
      selectedPlugin.value = await pluginsApi.getDetail(pluginId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Plugin-Details nicht verfügbar')
    } finally {
      isLoading.value = false
    }
  }

  async function executePlugin(
    pluginId: string,
    configOverrides?: Record<string, unknown>,
  ): Promise<PluginExecutionDTO | null> {
    isExecuting.value = true
    try {
      const execution = await pluginsApi.execute(pluginId, {
        config_overrides: configOverrides,
      })
      toast.success(`Plugin '${pluginId}' ausgeführt: ${execution.status}`)

      // Refresh plugin list to update last_execution
      await fetchPlugins()

      return execution
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Plugin-Ausführung fehlgeschlagen')
      return null
    } finally {
      isExecuting.value = false
    }
  }

  async function togglePlugin(pluginId: string, enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await pluginsApi.enable(pluginId)
        toast.success(`Plugin '${pluginId}' aktiviert`)
      } else {
        await pluginsApi.disable(pluginId)
        toast.success(`Plugin '${pluginId}' deaktiviert`)
      }

      // Update local state
      const plugin = plugins.value.find((p) => p.plugin_id === pluginId)
      if (plugin) plugin.is_enabled = enabled
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Plugin-Status konnte nicht geändert werden')
    }
  }

  async function updateConfig(
    pluginId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    try {
      await pluginsApi.updateConfig(pluginId, { config })
      toast.success('Plugin-Konfiguration gespeichert')

      // Update local state
      const plugin = plugins.value.find((p) => p.plugin_id === pluginId)
      if (plugin) plugin.config = config
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Konfiguration konnte nicht gespeichert werden')
    }
  }

  async function fetchHistory(pluginId: string, limit: number = 50): Promise<void> {
    try {
      executionHistory.value = await pluginsApi.getHistory(pluginId, limit)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ausführungshistorie nicht verfügbar')
    }
  }

  return {
    // State
    plugins,
    selectedPlugin,
    executionHistory,
    isLoading,
    isExecuting,
    // Getters
    enabledPlugins,
    disabledPlugins,
    pluginsByCategory,
    pluginOptions,
    // Actions
    fetchPlugins,
    fetchPluginDetail,
    executePlugin,
    togglePlugin,
    updateConfig,
    fetchHistory,
  }
})
