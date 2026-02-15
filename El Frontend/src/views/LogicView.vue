<script setup lang="ts">
/**
 * LogicView (Rules Editor)
 *
 * Node-RED-inspired visual automation editor for AutomationOne.
 * Full-featured rule editor with drag-and-drop node composition.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────────┐
 * │ Toolbar: [← Back] [Rule ▼] [Name] [Desc] ... [Actions]     │
 * ├──────────┬───────────────────────────┬───────────────────────┤
 * │ Node     │                           │ Config Panel          │
 * │ Palette  │     Vue Flow Canvas       │ (when node selected)  │
 * │          │                           │                       │
 * ├──────────┴───────────────────────────┴───────────────────────┤
 * │ Execution History (collapsible bottom panel)                 │
 * └──────────────────────────────────────────────────────────────┘
 *
 * @see RuleFlowEditor.vue - Canvas with custom nodes
 * @see RuleNodePalette.vue - Draggable node palette
 * @see RuleConfigPanel.vue - Node configuration
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Plus,
  Save,
  Play,
  Trash2,
  ChevronDown,
  History,
  Workflow,
  Check,
  X,
  AlertCircle,
  Maximize2,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff,
  Zap,
  GitBranch,
} from 'lucide-vue-next'
import { useLogicStore } from '@/stores/logic'
import { useUiStore } from '@/shared/stores'
import { useToast } from '@/composables/useToast'
import { createLogger } from '@/utils/logger'
import type { LogicRule } from '@/types/logic'
import type { Node } from '@vue-flow/core'
import RuleFlowEditor from '@/components/rules/RuleFlowEditor.vue'
import RuleNodePalette from '@/components/rules/RuleNodePalette.vue'
import RuleConfigPanel from '@/components/rules/RuleConfigPanel.vue'

const logger = createLogger('LogicView')
const logicStore = useLogicStore()
const uiStore = useUiStore()
const toast = useToast()

// ======================== STATE ========================

const selectedRuleId = ref<string | null>(null)
const selectedNode = ref<Node | null>(null)
const isCreatingNew = ref(false)
const isSaving = ref(false)
const isTesting = ref(false)
const showHistory = ref(false)
const showRuleDropdown = ref(false)
const hasUnsavedChanges = ref(false)

// New rule form
const newRuleName = ref('')
const newRuleDescription = ref('')

// Editor ref
const editorRef = ref<InstanceType<typeof RuleFlowEditor> | null>(null)

// ======================== COMPUTED ========================

const selectedRule = computed<LogicRule | null>(() => {
  if (!selectedRuleId.value) return null
  return logicStore.getRuleById(selectedRuleId.value) || null
})

const ruleCount = computed(() => logicStore.rules.length)
const enabledCount = computed(() => logicStore.enabledRules.length)

const toolbarTitle = computed(() => {
  if (isCreatingNew.value) return 'Neue Regel'
  if (selectedRule.value) return selectedRule.value.name
  return 'Regel auswählen'
})

// ======================== LIFECYCLE ========================

onMounted(() => {
  logicStore.fetchRules()
  logicStore.subscribeToWebSocket()
})

onUnmounted(() => {
  logicStore.unsubscribeFromWebSocket()
})

// ======================== RULE MANAGEMENT ========================

async function selectRule(ruleId: string) {
  if (hasUnsavedChanges.value) {
    const confirmed = await uiStore.confirm({
      title: 'Ungespeicherte Änderungen',
      message: 'Ungespeicherte Änderungen verwerfen?',
      variant: 'warning',
    })
    if (!confirmed) return
  }
  selectedRuleId.value = ruleId
  selectedNode.value = null
  isCreatingNew.value = false
  hasUnsavedChanges.value = false
  showRuleDropdown.value = false
}

async function startNewRule() {
  if (hasUnsavedChanges.value) {
    const confirmed = await uiStore.confirm({
      title: 'Ungespeicherte Änderungen',
      message: 'Ungespeicherte Änderungen verwerfen?',
      variant: 'warning',
    })
    if (!confirmed) return
  }
  selectedRuleId.value = null
  selectedNode.value = null
  isCreatingNew.value = true
  hasUnsavedChanges.value = false
  newRuleName.value = ''
  newRuleDescription.value = ''
  showRuleDropdown.value = false
  editorRef.value?.clearCanvas()
}

function cancelNewRule() {
  isCreatingNew.value = false
  newRuleName.value = ''
  newRuleDescription.value = ''
  hasUnsavedChanges.value = false
}

async function saveRule() {
  if (!editorRef.value) return

  const graphData = editorRef.value.graphToRuleData()

  if (graphData.conditions.length === 0) {
    toast.error('Mindestens eine Bedingung erforderlich')
    return
  }

  if (graphData.actions.length === 0) {
    toast.error('Mindestens eine Aktion erforderlich')
    return
  }

  isSaving.value = true

  try {
    if (isCreatingNew.value) {
      if (!newRuleName.value.trim()) {
        toast.error('Regelname erforderlich')
        isSaving.value = false
        return
      }

      const created = await logicStore.createRule({
        name: newRuleName.value.trim(),
        description: newRuleDescription.value.trim() || undefined,
        enabled: false,
        conditions: graphData.conditions as unknown[],
        logic_operator: graphData.logic_operator,
        actions: graphData.actions as unknown[],
      })

      selectedRuleId.value = created.id
      isCreatingNew.value = false
      hasUnsavedChanges.value = false
      toast.success(`Regel "${created.name}" erstellt`)
      logger.info('Rule created', { id: created.id, name: created.name })
    } else if (selectedRule.value) {
      await logicStore.updateRule(selectedRule.value.id, {
        conditions: graphData.conditions as unknown[],
        logic_operator: graphData.logic_operator,
        actions: graphData.actions as unknown[],
      })

      hasUnsavedChanges.value = false
      toast.success('Regel gespeichert')
      logger.info('Rule updated', { id: selectedRule.value.id })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Speichern fehlgeschlagen'
    toast.error(msg)
    logger.error('Save failed', err)
  } finally {
    isSaving.value = false
  }
}

async function testRule() {
  if (!selectedRule.value) return

  isTesting.value = true
  try {
    const result = await logicStore.testRule(selectedRule.value.id)
    if (result) {
      toast.success('Bedingungen erfüllt — Aktionen würden ausgeführt')
    } else {
      toast.info('Bedingungen NICHT erfüllt — keine Aktion')
    }
  } catch (err) {
    toast.error('Test fehlgeschlagen')
    logger.error('Test failed', err)
  } finally {
    isTesting.value = false
  }
}

async function toggleRule() {
  if (!selectedRule.value) return

  try {
    const newState = await logicStore.toggleRule(selectedRule.value.id)
    toast.success(newState ? 'Regel aktiviert' : 'Regel deaktiviert')
  } catch (err) {
    toast.error('Toggle fehlgeschlagen')
  }
}

async function deleteRule() {
  if (!selectedRule.value) return

  const confirmed = await uiStore.confirm({
    title: 'Regel löschen',
    message: `Regel "${selectedRule.value.name}" wirklich löschen?`,
    variant: 'danger',
    confirmText: 'Löschen',
  })
  if (!confirmed) return

  try {
    await logicStore.deleteRule(selectedRule.value.id)
    selectedRuleId.value = null
    selectedNode.value = null
    hasUnsavedChanges.value = false
    toast.success('Regel gelöscht')
  } catch (err) {
    toast.error('Löschen fehlgeschlagen')
  }
}

// ======================== NODE EVENTS ========================

function onNodeSelected(node: Node | null) {
  selectedNode.value = node
}

function onNodeDataUpdate(nodeId: string, data: Record<string, unknown>) {
  editorRef.value?.updateNodeData(nodeId, data)
  hasUnsavedChanges.value = true
}

function onDeleteNode(nodeId: string) {
  editorRef.value?.deleteNode(nodeId)
  selectedNode.value = null
  hasUnsavedChanges.value = true
  toast.info('Knoten entfernt')
}

function onDuplicateNode(nodeId: string) {
  editorRef.value?.duplicateNode(nodeId)
  hasUnsavedChanges.value = true
  toast.success('Knoten dupliziert')
}

function onGraphChanged() {
  hasUnsavedChanges.value = true
}

// ======================== EXECUTION HISTORY ========================

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Close dropdown on outside click
function onClickOutsideDropdown(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.rule-selector')) {
    showRuleDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutsideDropdown)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutsideDropdown)
})
</script>

<template>
  <div class="rules-view">
    <!-- ======================== TOOLBAR ======================== -->
    <div class="rules-toolbar">
      <div class="rules-toolbar__left">
        <!-- Back to Dashboard -->
        <RouterLink to="/" class="toolbar-back" title="Zurück zum Dashboard">
          <ArrowLeft class="w-4 h-4" />
        </RouterLink>

        <!-- Rule Selector -->
        <div class="rule-selector">
          <button
            class="rule-selector__trigger"
            :aria-expanded="showRuleDropdown"
            aria-haspopup="listbox"
            @click.stop="showRuleDropdown = !showRuleDropdown"
          >
            <Workflow class="rule-selector__icon" />
            <span class="rule-selector__name">{{ toolbarTitle }}</span>
            <span
              v-if="hasUnsavedChanges"
              class="rule-selector__unsaved"
              title="Ungespeicherte Änderungen"
            >*</span>
            <ChevronDown
              class="rule-selector__chevron"
              :class="{ 'rule-selector__chevron--open': showRuleDropdown }"
            />
          </button>

          <!-- Dropdown -->
          <Transition name="dropdown">
            <div v-if="showRuleDropdown" class="rule-selector__dropdown">
              <div class="rule-selector__dropdown-header">
                <span>{{ ruleCount }} Regeln ({{ enabledCount }} aktiv)</span>
              </div>
              <div class="rule-selector__dropdown-list">
                <button
                  v-for="rule in logicStore.rules"
                  :key="rule.id"
                  class="rule-selector__dropdown-item"
                  :class="{ 'rule-selector__dropdown-item--active': selectedRuleId === rule.id }"
                  @click="selectRule(rule.id)"
                >
                  <span
                    class="rule-selector__dropdown-dot"
                    :class="rule.enabled ? 'rule-selector__dropdown-dot--enabled' : 'rule-selector__dropdown-dot--disabled'"
                  />
                  <span class="rule-selector__dropdown-name">{{ rule.name }}</span>
                  <span v-if="logicStore.isRuleActive(rule.id)" class="rule-selector__dropdown-flash">
                    LIVE
                  </span>
                </button>
                <div v-if="logicStore.rules.length === 0" class="rule-selector__dropdown-empty">
                  Keine Regeln vorhanden
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- New Rule Input (when creating) -->
        <div v-if="isCreatingNew" class="new-rule-inputs">
          <input
            v-model="newRuleName"
            type="text"
            class="new-rule-input"
            placeholder="Regelname..."
            autofocus
          />
          <input
            v-model="newRuleDescription"
            type="text"
            class="new-rule-input new-rule-input--desc"
            placeholder="Beschreibung (optional)"
          />
        </div>
      </div>

      <div class="rules-toolbar__right">
        <!-- New Rule -->
        <button
          v-if="!isCreatingNew"
          class="toolbar-btn toolbar-btn--accent"
          title="Neue Regel"
          aria-label="Neue Regel erstellen"
          @click="startNewRule"
        >
          <Plus class="w-4 h-4" />
          <span class="toolbar-btn__label">Neu</span>
        </button>

        <!-- Cancel New -->
        <button
          v-if="isCreatingNew"
          class="toolbar-btn"
          title="Abbrechen"
          aria-label="Neue Regel abbrechen"
          @click="cancelNewRule"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Save -->
        <button
          class="toolbar-btn toolbar-btn--save"
          :class="{ 'toolbar-btn--pulse': hasUnsavedChanges }"
          :disabled="isSaving || (!isCreatingNew && !selectedRule)"
          title="Speichern"
          aria-label="Regel speichern"
          @click="saveRule"
        >
          <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
          <Save v-else class="w-4 h-4" />
          <span class="toolbar-btn__label">Speichern</span>
        </button>

        <!-- Divider -->
        <div class="toolbar-divider" aria-hidden="true" />

        <!-- Test -->
        <button
          class="toolbar-btn"
          :disabled="!selectedRule || isTesting"
          title="Regel testen (ohne Ausführung)"
          aria-label="Regel testen"
          @click="testRule"
        >
          <Loader2 v-if="isTesting" class="w-4 h-4 animate-spin" />
          <Play v-else class="w-4 h-4" />
          <span class="toolbar-btn__label">Test</span>
        </button>

        <!-- Toggle -->
        <button
          class="toolbar-btn"
          :class="{ 'toolbar-btn--enabled': selectedRule?.enabled }"
          :disabled="!selectedRule"
          :title="selectedRule?.enabled ? 'Regel deaktivieren' : 'Regel aktivieren'"
          :aria-label="selectedRule?.enabled ? 'Regel deaktivieren' : 'Regel aktivieren'"
          :aria-pressed="selectedRule?.enabled ?? false"
          @click="toggleRule"
        >
          <Eye v-if="selectedRule?.enabled" class="w-4 h-4" />
          <EyeOff v-else class="w-4 h-4" />
        </button>

        <!-- Delete -->
        <button
          class="toolbar-btn toolbar-btn--danger"
          :disabled="!selectedRule"
          title="Regel löschen"
          aria-label="Regel löschen"
          @click="deleteRule"
        >
          <Trash2 class="w-4 h-4" />
        </button>

        <!-- Divider -->
        <div class="toolbar-divider" aria-hidden="true" />

        <!-- History toggle -->
        <button
          class="toolbar-btn"
          :class="{ 'toolbar-btn--active': showHistory }"
          title="Ausführungshistorie"
          aria-label="Ausführungshistorie anzeigen"
          :aria-pressed="showHistory"
          @click="showHistory = !showHistory"
        >
          <History class="w-4 h-4" />
        </button>

        <!-- Fit View -->
        <button
          class="toolbar-btn"
          title="Ansicht anpassen"
          aria-label="Ansicht anpassen"
          @click="editorRef?.fitView()"
        >
          <Maximize2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- ======================== MAIN CONTENT ======================== -->
    <div class="rules-content">
      <!-- Loading -->
      <div v-if="logicStore.isLoading && logicStore.rules.length === 0" class="rules-loading">
        <Loader2 class="w-8 h-8 animate-spin" style="color: var(--color-iridescent-2)" />
        <span>Lade Regeln...</span>
      </div>

      <!-- No rule selected and not creating -->
      <div
        v-else-if="!selectedRule && !isCreatingNew"
        class="rules-empty"
      >
        <!-- Animated background mesh -->
        <div class="rules-empty__bg">
          <div class="rules-empty__bg-grid" />
          <div class="rules-empty__bg-glow" />
        </div>

        <div class="rules-empty__content">
          <!-- Animated flow illustration -->
          <div class="rules-empty__illustration">
            <div class="rules-empty__flow">
              <div class="rules-empty__flow-node rules-empty__flow-node--sensor">
                <Zap class="w-5 h-5" />
              </div>
              <div class="rules-empty__flow-line">
                <svg width="80" height="2" viewBox="0 0 80 2">
                  <line x1="0" y1="1" x2="80" y2="1" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" class="rules-empty__flow-dash" />
                </svg>
              </div>
              <div class="rules-empty__flow-node rules-empty__flow-node--logic">
                <GitBranch class="w-5 h-5" />
              </div>
              <div class="rules-empty__flow-line">
                <svg width="80" height="2" viewBox="0 0 80 2">
                  <line x1="0" y1="1" x2="80" y2="1" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" class="rules-empty__flow-dash" />
                </svg>
              </div>
              <div class="rules-empty__flow-node rules-empty__flow-node--action">
                <Workflow class="w-5 h-5" />
              </div>
            </div>
            <div class="rules-empty__flow-labels">
              <span>Bedingung</span>
              <span>Logik</span>
              <span>Aktion</span>
            </div>
          </div>

          <h2 class="rules-empty__title">Automatisierung</h2>
          <p class="rules-empty__desc">
            Erstelle visuelle Regeln, um Aktoren basierend auf Sensordaten und Zeitplänen zu steuern.
          </p>

          <div class="rules-empty__actions">
            <button class="rules-empty__cta" @click="startNewRule">
              <Plus class="w-4.5 h-4.5" />
              <span>Neue Regel erstellen</span>
            </button>
            <p class="rules-empty__hint">
              Bausteine auf die Arbeitsfläche ziehen und verbinden
            </p>
          </div>

          <!-- Existing rules quick list -->
          <div v-if="logicStore.rules.length > 0" class="rules-empty__list">
            <h3 class="rules-empty__list-title">
              <Workflow class="w-3.5 h-3.5" />
              {{ logicStore.rules.length }} {{ logicStore.rules.length === 1 ? 'Regel' : 'Regeln' }} vorhanden
            </h3>
            <div class="rules-empty__list-items">
              <button
                v-for="rule in logicStore.rules"
                :key="rule.id"
                class="rules-empty__list-item"
                @click="selectRule(rule.id)"
              >
                <span
                  class="rules-empty__list-dot"
                  :class="rule.enabled ? 'rules-empty__list-dot--on' : 'rules-empty__list-dot--off'"
                />
                <span class="rules-empty__list-name">{{ rule.name }}</span>
                <span class="rules-empty__list-meta">
                  {{ rule.conditions.length }} {{ rule.conditions.length === 1 ? 'Bedingung' : 'Bedingungen' }}
                  <span class="rules-empty__list-arrow">&rarr;</span>
                  {{ rule.actions.length }} {{ rule.actions.length === 1 ? 'Aktion' : 'Aktionen' }}
                </span>
                <span v-if="rule.enabled" class="rules-empty__list-badge">Aktiv</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Editor (rule selected or creating new) -->
      <template v-else>
        <!-- Node Palette -->
        <RuleNodePalette />

        <!-- Canvas -->
        <RuleFlowEditor
          ref="editorRef"
          :rule="selectedRule"
          @node-selected="onNodeSelected"
          @graph-changed="onGraphChanged"
        />

        <!-- Config Panel -->
        <RuleConfigPanel
          :node="selectedNode"
          @update:data="onNodeDataUpdate"
          @close="selectedNode = null"
          @delete-node="onDeleteNode"
          @duplicate-node="onDuplicateNode"
        />
      </template>
    </div>

    <!-- ======================== EXECUTION HISTORY ======================== -->
    <Transition name="history-slide">
      <div v-if="showHistory" class="rules-history">
        <div class="rules-history__inner">
          <div class="rules-history__header">
            <span class="rules-history__title">
              <History class="w-4 h-4" />
              Letzte Ausführungen
            </span>
            <button class="rules-history__close" @click="showHistory = false" aria-label="Historie schließen">
              <ChevronDown class="w-4 h-4" />
            </button>
          </div>
          <div class="rules-history__list">
            <div
              v-for="(exec, i) in logicStore.recentExecutions"
              :key="i"
              class="rules-history__item"
              :class="{ 'rules-history__item--success': exec.success, 'rules-history__item--fail': !exec.success }"
            >
              <span class="rules-history__item-time">{{ formatTimestamp(exec.timestamp) }}</span>
              <span class="rules-history__item-name">{{ exec.rule_name }}</span>
              <span class="rules-history__item-status">
                <Check v-if="exec.success" class="w-3 h-3" />
                <AlertCircle v-else class="w-3 h-3" />
              </span>
              <span class="rules-history__item-detail">
                {{ exec.trigger.sensor_type }} {{ exec.trigger.value }}
                → {{ exec.action.command }}
              </span>
            </div>
            <div v-if="logicStore.recentExecutions.length === 0" class="rules-history__empty">
              Noch keine Ausführungen in dieser Session
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.rules-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-primary);
}

/* ======================== TOOLBAR ======================== */

.rules-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
  z-index: 20;
}

.rules-toolbar__left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.rules-toolbar__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Back to Dashboard */
.toolbar-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  transition: all var(--transition-fast);
}

.toolbar-back:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

/* Rule Selector */
.rule-selector {
  position: relative;
}

.rule-selector__trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4375rem 0.75rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 180px;
}

.rule-selector__trigger:hover {
  border-color: var(--color-iridescent-2);
}

.rule-selector__trigger:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 1px;
}

.rule-selector__icon {
  width: 16px;
  height: 16px;
  color: var(--color-iridescent-2);
  flex-shrink: 0;
}

.rule-selector__name {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-selector__unsaved {
  color: var(--color-warning);
  font-weight: 700;
  font-size: 1.125rem;
  line-height: 1;
}

.rule-selector__chevron {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
}

.rule-selector__chevron--open {
  transform: rotate(180deg);
}

/* Dropdown */
.rule-selector__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 300px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  z-index: 50;
  overflow: hidden;
}

.rule-selector__dropdown-header {
  padding: 0.625rem 0.875rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--glass-border);
}

.rule-selector__dropdown-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 0.375rem;
}

.rule-selector__dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}

.rule-selector__dropdown-item:hover {
  background: var(--color-bg-tertiary);
}

.rule-selector__dropdown-item--active {
  background: rgba(129, 140, 248, 0.1);
  color: var(--color-iridescent-2);
}

.rule-selector__dropdown-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rule-selector__dropdown-dot--enabled {
  background: var(--color-success);
}

.rule-selector__dropdown-dot--disabled {
  background: var(--color-text-muted);
}

.rule-selector__dropdown-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-selector__dropdown-flash {
  font-size: 0.5625rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  background: rgba(52, 211, 153, 0.2);
  color: var(--color-success);
  animation: pulse-dot 2s infinite;
  letter-spacing: 0.08em;
}

.rule-selector__dropdown-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

/* New rule inputs */
.new-rule-inputs {
  display: flex;
  gap: 0.5rem;
}

.new-rule-input {
  padding: 0.4375rem 0.625rem;
  font-size: 0.8125rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color var(--transition-fast);
  width: 180px;
}

.new-rule-input--desc {
  width: 240px;
}

.new-rule-input:focus {
  border-color: var(--color-iridescent-2);
}

.new-rule-input::placeholder {
  color: var(--color-text-muted);
}

/* Toolbar Buttons */
.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.625rem;
  font-size: var(--text-sm);
  font-weight: 500;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.toolbar-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.toolbar-btn:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 1px;
}

.toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.toolbar-btn__label {
  display: none;
}

@media (min-width: 1200px) {
  .toolbar-btn__label {
    display: inline;
  }
}

.toolbar-btn--accent {
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-2));
  border-color: transparent;
  color: white;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.2);
}

.toolbar-btn--accent:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.3);
  border-color: transparent;
  color: white;
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-2));
}

.toolbar-btn--save {
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
}

.toolbar-btn--save:hover:not(:disabled) {
  border-color: var(--glass-border-hover);
  background: var(--color-bg-hover);
}

.toolbar-btn--pulse {
  border-color: var(--color-iridescent-2);
  background: rgba(129, 140, 248, 0.08);
  animation: save-glow 2s ease-in-out infinite;
}

@keyframes save-glow {
  0%, 100% { box-shadow: none; }
  50% { box-shadow: 0 0 12px rgba(129, 140, 248, 0.25); }
}

.toolbar-btn--enabled {
  color: var(--color-success);
  background: rgba(52, 211, 153, 0.08);
}

.toolbar-btn--enabled:hover:not(:disabled) {
  background: rgba(52, 211, 153, 0.12);
  color: var(--color-success);
}

.toolbar-btn--danger:hover:not(:disabled) {
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.08);
}

.toolbar-btn--active {
  background: rgba(129, 140, 248, 0.1);
  color: var(--color-iridescent-2);
}

.toolbar-btn--active:hover:not(:disabled) {
  background: rgba(129, 140, 248, 0.15);
  color: var(--color-iridescent-2);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--glass-border);
  margin: 0 2px;
}

/* ======================== MAIN CONTENT ======================== */

.rules-content {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Loading state */
.rules-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: var(--color-text-muted);
}

/* ======================== EMPTY / LANDING STATE ======================== */

.rules-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* Animated background */
.rules-empty__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.rules-empty__bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
  background-size: 40px 40px;
}

.rules-empty__bg-glow {
  position: absolute;
  top: 30%;
  left: 50%;
  width: 600px;
  height: 400px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    ellipse at center,
    rgba(129, 140, 248, 0.06) 0%,
    rgba(167, 139, 250, 0.03) 40%,
    transparent 70%
  );
  animation: empty-glow-pulse 6s ease-in-out infinite;
}

@keyframes empty-glow-pulse {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
}

.rules-empty__content {
  text-align: center;
  max-width: 520px;
  padding: 2rem;
  position: relative;
  z-index: 1;
  animation: empty-fade-in 0.5s ease-out;
}

@keyframes empty-fade-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Flow illustration */
.rules-empty__illustration {
  margin-bottom: 2rem;
}

.rules-empty__flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 0.75rem;
}

.rules-empty__flow-node {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  border: 1.5px solid;
  background: var(--color-bg-secondary);
  transition: all 0.3s ease;
}

.rules-empty__flow-node--sensor {
  color: var(--color-iridescent-1);
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow: 0 0 20px rgba(96, 165, 250, 0.1);
  animation: node-float 3s ease-in-out infinite;
}

.rules-empty__flow-node--logic {
  color: var(--color-iridescent-3);
  border-color: rgba(167, 139, 250, 0.3);
  box-shadow: 0 0 20px rgba(167, 139, 250, 0.1);
  animation: node-float 3s ease-in-out 0.3s infinite;
}

.rules-empty__flow-node--action {
  color: var(--color-iridescent-4);
  border-color: rgba(192, 132, 252, 0.3);
  box-shadow: 0 0 20px rgba(192, 132, 252, 0.1);
  animation: node-float 3s ease-in-out 0.6s infinite;
}

@keyframes node-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.rules-empty__flow-line {
  width: 80px;
  color: var(--color-text-muted);
  opacity: 0.4;
  display: flex;
  align-items: center;
}

.rules-empty__flow-dash {
  animation: dash-flow 1.5s linear infinite;
}

@keyframes dash-flow {
  from { stroke-dashoffset: 14; }
  to { stroke-dashoffset: 0; }
}

.rules-empty__flow-labels {
  display: flex;
  justify-content: center;
  gap: 80px;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
}

.rules-empty__title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.625rem;
  letter-spacing: -0.01em;
}

.rules-empty__desc {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--leading-loose);
  margin-bottom: 2rem;
  max-width: 380px;
  margin-left: auto;
  margin-right: auto;
}

/* CTA area */
.rules-empty__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 2.5rem;
}

/* CTA Button */
.rules-empty__cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 2rem;
  font-size: var(--text-base);
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, var(--color-iridescent-1) 0%, var(--color-iridescent-2) 50%, var(--color-iridescent-3) 100%);
  background-size: 200% 100%;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.3s var(--ease-out);
  box-shadow:
    0 4px 16px rgba(129, 140, 248, 0.3),
    0 1px 0 rgba(255, 255, 255, 0.15) inset;
  animation: cta-gradient-shift 4s ease-in-out infinite;
}

@keyframes cta-gradient-shift {
  0%, 100% { background-position: 0% center; }
  50% { background-position: 100% center; }
}

.rules-empty__cta:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow:
    0 8px 28px rgba(129, 140, 248, 0.4),
    0 1px 0 rgba(255, 255, 255, 0.2) inset;
}

.rules-empty__cta:active {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 2px 8px rgba(129, 140, 248, 0.2);
}

.rules-empty__hint {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  opacity: 0.6;
  letter-spacing: 0.02em;
}

/* Rules list */
.rules-empty__list {
  text-align: left;
  padding: 1rem;
  background: rgba(13, 13, 22, 0.6);
  backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  max-width: 400px;
  margin: 0 auto;
}

.rules-empty__list-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 0.5rem;
  padding: 0 0.375rem;
}

.rules-empty__list-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rules-empty__list-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 0.625rem;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}

.rules-empty__list-item:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--glass-border);
}

.rules-empty__list-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rules-empty__list-dot--on {
  background: var(--color-success);
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.4);
}

.rules-empty__list-dot--off {
  background: var(--color-text-muted);
}

.rules-empty__list-name {
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rules-empty__list-meta {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.rules-empty__list-arrow {
  color: var(--color-iridescent-2);
  margin: 0 0.125rem;
}

.rules-empty__list-badge {
  font-size: 0.5625rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* ======================== EXECUTION HISTORY ======================== */

.rules-history {
  display: grid;
  grid-template-rows: 1fr;
  flex-shrink: 0;
  border-top: 1px solid var(--glass-border);
}

.rules-history__inner {
  display: flex;
  flex-direction: column;
  max-height: 200px;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-secondary);
}

.rules-history__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--glass-border);
}

.rules-history__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.rules-history__close {
  padding: 0.25rem;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.rules-history__close:hover {
  color: var(--color-text-primary);
}

.rules-history__list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}

.rules-history__item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.rules-history__item:hover {
  background: var(--color-bg-tertiary);
}

.rules-history__item-time {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  flex-shrink: 0;
  width: 60px;
}

.rules-history__item-name {
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.rules-history__item-status {
  flex-shrink: 0;
}

.rules-history__item--success .rules-history__item-status {
  color: var(--color-success);
}

.rules-history__item--fail .rules-history__item-status {
  color: var(--color-error);
}

.rules-history__item-detail {
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rules-history__empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

/* ======================== TRANSITIONS ======================== */

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
  will-change: opacity, transform;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.history-slide-enter-active,
.history-slide-leave-active {
  transition: grid-template-rows var(--duration-base) var(--ease-out),
              opacity var(--duration-base) var(--ease-out);
  display: grid;
  grid-template-rows: 1fr;
}

.history-slide-enter-from,
.history-slide-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.history-slide-enter-active > *,
.history-slide-leave-active > * {
  overflow: hidden;
}

/* ======================== REDUCED MOTION ======================== */

@media (prefers-reduced-motion: reduce) {
  .rules-empty__flow-node {
    animation: none;
  }

  .rules-empty__flow-dash {
    animation: none;
  }

  .rules-empty__bg-glow {
    animation: none;
  }

  .rules-empty__cta {
    animation: none;
    background-size: 100% 100%;
  }

  .rules-empty__content {
    animation: none;
  }

  .toolbar-btn--pulse {
    animation: none;
    border-color: var(--color-iridescent-2);
  }

  .rule-selector__dropdown-flash {
    animation: none;
  }

  .toolbar-btn:active:not(:disabled) {
    transform: none;
  }

  .toolbar-btn--accent:hover:not(:disabled) {
    transform: none;
  }

  .rules-empty__cta:hover {
    transform: none;
  }

  .rules-empty__cta:active {
    transform: none;
  }

  .dropdown-enter-active,
  .dropdown-leave-active,
  .history-slide-enter-active,
  .history-slide-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
