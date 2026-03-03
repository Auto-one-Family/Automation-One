<script setup lang="ts">
/**
 * PluginsView
 *
 * Phase 4C.2: Plugin Management UI.
 * Displays all AutoOps plugins with grid layout, detail slide-over,
 * config dialog, and execution history.
 */

import { ref, computed, onMounted } from 'vue'
import { Puzzle, Settings, History, RefreshCw } from 'lucide-vue-next'
import { usePluginsStore } from '@/shared/stores/plugins.store'
import PluginCard from '@/components/plugins/PluginCard.vue'
import PluginConfigDialog from '@/components/plugins/PluginConfigDialog.vue'
import PluginExecutionHistory from '@/components/plugins/PluginExecutionHistory.vue'
import SlideOver from '@/shared/design/primitives/SlideOver.vue'
import AccordionSection from '@/shared/design/primitives/AccordionSection.vue'
import type { PluginDetailDTO } from '@/api/plugins'

const pluginsStore = usePluginsStore()

// ======================== STATE ========================

const activePluginId = ref<string | null>(null)
const showConfigDialog = ref(false)
const executingPluginId = ref<string | null>(null)
const activeFilter = ref<'all' | 'enabled' | 'disabled'>('all')

// ======================== COMPUTED ========================

const filteredPlugins = computed(() => {
  switch (activeFilter.value) {
    case 'enabled':
      return pluginsStore.enabledPlugins
    case 'disabled':
      return pluginsStore.disabledPlugins
    default:
      return pluginsStore.plugins
  }
})

const activePlugin = computed<PluginDetailDTO | null>(() =>
  pluginsStore.selectedPlugin,
)

const enabledCount = computed(() => pluginsStore.enabledPlugins.length)
const totalCount = computed(() => pluginsStore.plugins.length)

// ======================== METHODS ========================

async function selectPlugin(pluginId: string) {
  activePluginId.value = pluginId
  await pluginsStore.fetchPluginDetail(pluginId)
  await pluginsStore.fetchHistory(pluginId)
}

function closeDetail() {
  activePluginId.value = null
  pluginsStore.selectedPlugin = null
}

async function handleExecute(pluginId: string) {
  executingPluginId.value = pluginId
  await pluginsStore.executePlugin(pluginId)
  executingPluginId.value = null

  // Refresh detail if open
  if (activePluginId.value === pluginId) {
    await pluginsStore.fetchPluginDetail(pluginId)
    await pluginsStore.fetchHistory(pluginId)
  }
}

async function handleToggle(pluginId: string, enabled: boolean) {
  await pluginsStore.togglePlugin(pluginId, enabled)
}

function openConfigDialog() {
  showConfigDialog.value = true
}

async function handleSaveConfig(config: Record<string, unknown>) {
  if (!activePluginId.value) return
  await pluginsStore.updateConfig(activePluginId.value, config)
  showConfigDialog.value = false

  // Refresh detail
  await pluginsStore.fetchPluginDetail(activePluginId.value)
}

async function refreshPlugins() {
  await pluginsStore.fetchPlugins()
}

// ======================== LIFECYCLE ========================

onMounted(async () => {
  await pluginsStore.fetchPlugins()
})
</script>

<template>
  <div class="plugins-view">
    <!-- Header -->
    <div class="plugins-view__header">
      <div class="plugins-view__title-row">
        <Puzzle class="plugins-view__title-icon" />
        <h1 class="plugins-view__title">AutoOps Plugins</h1>
        <span class="plugins-view__count">
          {{ enabledCount }}/{{ totalCount }} aktiv
        </span>
      </div>

      <div class="plugins-view__toolbar">
        <!-- Filter Chips -->
        <div class="plugins-view__filters">
          <button
            v-for="filter in (['all', 'enabled', 'disabled'] as const)"
            :key="filter"
            class="plugins-view__filter-chip"
            :class="{ 'plugins-view__filter-chip--active': activeFilter === filter }"
            @click="activeFilter = filter"
          >
            {{ filter === 'all' ? 'Alle' : filter === 'enabled' ? 'Aktiv' : 'Deaktiviert' }}
          </button>
        </div>

        <button
          class="plugins-view__refresh-btn"
          :disabled="pluginsStore.isLoading"
          @click="refreshPlugins"
        >
          <RefreshCw
            class="w-4 h-4"
            :class="{ 'animate-spin': pluginsStore.isLoading }"
          />
        </button>
      </div>
    </div>

    <!-- Plugin Grid -->
    <div class="plugins-view__grid">
      <PluginCard
        v-for="plugin in filteredPlugins"
        :key="plugin.plugin_id"
        :plugin="plugin"
        :is-executing="executingPluginId === plugin.plugin_id"
        @select="selectPlugin"
        @execute="handleExecute"
        @toggle="handleToggle"
      />

      <!-- Empty State -->
      <div v-if="filteredPlugins.length === 0 && !pluginsStore.isLoading" class="plugins-view__empty">
        <Puzzle class="plugins-view__empty-icon" />
        <p>Keine Plugins gefunden</p>
      </div>
    </div>

    <!-- Detail SlideOver -->
    <SlideOver
      :open="!!activePluginId"
      :title="activePlugin?.display_name || 'Plugin'"
      @close="closeDetail"
    >
      <template v-if="activePlugin">
        <div class="plugin-detail">
          <!-- Status & Description -->
          <div class="plugin-detail__info">
            <div class="plugin-detail__status-row">
              <span
                class="plugin-detail__status-badge"
                :class="activePlugin.is_enabled
                  ? 'plugin-detail__status-badge--enabled'
                  : 'plugin-detail__status-badge--disabled'"
              >
                {{ activePlugin.is_enabled ? 'Aktiv' : 'Deaktiviert' }}
              </span>
              <span class="plugin-detail__category">
                {{ activePlugin.category }}
              </span>
            </div>
            <p class="plugin-detail__description">{{ activePlugin.description }}</p>
          </div>

          <!-- Quick Actions -->
          <div class="plugin-detail__actions">
            <button
              class="plugin-detail__action-btn plugin-detail__action-btn--execute"
              :disabled="!activePlugin.is_enabled || pluginsStore.isExecuting"
              @click="handleExecute(activePlugin.plugin_id)"
            >
              <RefreshCw class="w-4 h-4" />
              Ausführen
            </button>
            <button
              class="plugin-detail__action-btn plugin-detail__action-btn--config"
              @click="openConfigDialog"
            >
              <Settings class="w-4 h-4" />
              Konfiguration
            </button>
          </div>

          <!-- Capabilities -->
          <AccordionSection
            v-if="activePlugin.capabilities.length > 0"
            title="Fähigkeiten"
            storage-key="ao-plugin-capabilities"
          >
            <div class="plugin-detail__capabilities">
              <span
                v-for="cap in activePlugin.capabilities"
                :key="cap"
                class="plugin-detail__capability-chip"
              >
                {{ cap }}
              </span>
            </div>
          </AccordionSection>

          <!-- Execution History -->
          <AccordionSection
            title="Ausführungshistorie"
            storage-key="ao-plugin-history"
          >
            <template #header-extra>
              <History class="w-3.5 h-3.5" style="color: var(--color-text-muted)" />
            </template>
            <PluginExecutionHistory
              :executions="pluginsStore.executionHistory"
              :is-loading="pluginsStore.isLoading"
            />
          </AccordionSection>
        </div>
      </template>
    </SlideOver>

    <!-- Config Dialog -->
    <PluginConfigDialog
      v-if="activePlugin"
      :visible="showConfigDialog"
      :plugin-id="activePlugin.plugin_id"
      :plugin-name="activePlugin.display_name"
      :config="activePlugin.config"
      :config-schema="activePlugin.config_schema"
      @close="showConfigDialog = false"
      @save="handleSaveConfig"
    />
  </div>
</template>

<style scoped>
.plugins-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem 1.5rem;
  height: 100%;
  overflow-y: auto;
}

.plugins-view__header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.plugins-view__title-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.plugins-view__title-icon {
  width: 22px;
  height: 22px;
  color: var(--color-iridescent-2);
}

.plugins-view__title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.plugins-view__count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: 0.125rem 0.5rem;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
}

.plugins-view__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.plugins-view__filters {
  display: flex;
  gap: 0.375rem;
}

.plugins-view__filter-chip {
  padding: 0.375rem 0.75rem;
  font-size: var(--text-xs);
  font-weight: 500;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.plugins-view__filter-chip:hover {
  border-color: var(--color-iridescent-2);
  color: var(--color-text-primary);
}

.plugins-view__filter-chip--active {
  background: rgba(129, 140, 248, 0.1);
  border-color: var(--color-iridescent-2);
  color: var(--color-iridescent-2);
}

.plugins-view__refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.plugins-view__refresh-btn:hover:not(:disabled) {
  border-color: var(--color-iridescent-2);
  color: var(--color-text-primary);
}

.plugins-view__refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plugins-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.plugins-view__empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem;
  color: var(--color-text-muted);
}

.plugins-view__empty-icon {
  width: 40px;
  height: 40px;
  opacity: 0.3;
}

/* Detail SlideOver Content */
.plugin-detail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.plugin-detail__info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.plugin-detail__status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plugin-detail__status-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
}

.plugin-detail__status-badge--enabled {
  background: rgba(52, 211, 153, 0.1);
  color: var(--color-success);
  border: 1px solid rgba(52, 211, 153, 0.2);
}

.plugin-detail__status-badge--disabled {
  background: rgba(248, 113, 113, 0.1);
  color: var(--color-error);
  border: 1px solid rgba(248, 113, 113, 0.2);
}

.plugin-detail__category {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.plugin-detail__description {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.plugin-detail__actions {
  display: flex;
  gap: 0.5rem;
}

.plugin-detail__action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.plugin-detail__action-btn--execute {
  background: rgba(52, 211, 153, 0.08);
  color: var(--color-success);
  border-color: rgba(52, 211, 153, 0.2);
}

.plugin-detail__action-btn--execute:hover:not(:disabled) {
  background: rgba(52, 211, 153, 0.15);
}

.plugin-detail__action-btn--execute:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.plugin-detail__action-btn--config {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.plugin-detail__action-btn--config:hover {
  color: var(--color-text-primary);
  border-color: var(--color-iridescent-2);
}

.plugin-detail__capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.5rem 0;
}

.plugin-detail__capability-chip {
  font-size: var(--text-xs);
  padding: 0.25rem 0.5rem;
  background: rgba(129, 140, 248, 0.08);
  color: var(--color-iridescent-2);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(129, 140, 248, 0.15);
}
</style>
