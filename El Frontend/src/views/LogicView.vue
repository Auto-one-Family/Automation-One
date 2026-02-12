<script setup lang="ts">
/**
 * LogicView
 *
 * Automation rules management view with:
 * - Rule template grid (empty state)
 * - RuleCard list in sidebar
 * - Rule detail/edit area
 * - Execution feedback via toast and visual flash
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Plus, GitBranch } from 'lucide-vue-next'
import { useLogicStore } from '@/stores/logic'
import { useToast } from '@/composables/useToast'
import type { LogicRule } from '@/types/logic'
import type { RuleTemplate } from '@/config/rule-templates'
import { ruleTemplates } from '@/config/rule-templates'
import RuleTemplateCard from '@/components/rules/RuleTemplateCard.vue'
import RuleCard from '@/components/rules/RuleCard.vue'

const logicStore = useLogicStore()
const toast = useToast()

// State
const selectedRuleId = ref<string | null>(null)
const isCreatingNew = ref(false)
const newRuleName = ref('')

// Computed
const rules = computed(() => logicStore.rules)
const hasRules = computed(() => rules.value.length > 0)

const selectedRule = computed<LogicRule | null>(() => {
  if (!selectedRuleId.value) return null
  return rules.value.find(r => r.id === selectedRuleId.value) ?? null
})

// Load rules on mount
onMounted(() => {
  logicStore.fetchRules()
  logicStore.subscribeToWebSocket()
})

onUnmounted(() => {
  logicStore.unsubscribeFromWebSocket()
})

// Execution feedback via toast
watch(
  () => logicStore.recentExecutions.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      const latest = logicStore.recentExecutions[0]
      if (latest) {
        const rule = rules.value.find(r => r.id === latest.rule_id)
        const name = rule?.name ?? latest.rule_id
        toast.success(`Regel "${name}" ausgeführt`)
      }
    }
  }
)

function handleSelectRule(ruleId: string): void {
  selectedRuleId.value = ruleId
  isCreatingNew.value = false
}

async function handleToggleRule(ruleId: string, enabled: boolean): Promise<void> {
  try {
    await logicStore.toggleRule(ruleId, enabled)
    toast.success(enabled ? 'Regel aktiviert' : 'Regel deaktiviert')
  } catch {
    toast.error('Fehler beim Umschalten der Regel')
  }
}

async function handleDeleteRule(ruleId: string): Promise<void> {
  try {
    await logicStore.deleteRule(ruleId)
    if (selectedRuleId.value === ruleId) {
      selectedRuleId.value = null
    }
    toast.success('Regel gelöscht')
  } catch {
    toast.error('Fehler beim Löschen')
  }
}

function handleUseTemplate(template: RuleTemplate): void {
  isCreatingNew.value = true
  newRuleName.value = template.rule.name
  selectedRuleId.value = null
  // Template data is available for the editor component (Phase 0+1 integration)
}

function handleCreateNew(): void {
  isCreatingNew.value = true
  newRuleName.value = ''
  selectedRuleId.value = null
}

/** Get execution count for a rule in last 24h */
function getExecutionCount(ruleId: string): number {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
  return logicStore.recentExecutions.filter(
    e => e.rule_id === ruleId && new Date(e.timestamp).getTime() > oneDayAgo
  ).length
}
</script>

<template>
  <div class="logic-view">
    <!-- Empty State: Template Grid -->
    <div v-if="!hasRules && !isCreatingNew" class="logic-view__empty">
      <div class="logic-view__empty-header">
        <GitBranch class="logic-view__empty-icon" />
        <h2 class="logic-view__empty-title">Automatisierung</h2>
        <p class="logic-view__empty-text">
          Erstelle Regeln, um Aktoren basierend auf Sensorwerten und Zeitplänen zu steuern.
          Wähle ein Template als Ausgangspunkt oder starte von vorne.
        </p>
        <button class="logic-view__create-btn" @click="handleCreateNew">
          <Plus class="logic-view__create-icon" />
          Leere Regel erstellen
        </button>
      </div>

      <div class="logic-view__templates">
        <RuleTemplateCard
          v-for="tmpl in ruleTemplates"
          :key="tmpl.id"
          :template="tmpl"
          @use-template="handleUseTemplate"
        />
      </div>
    </div>

    <!-- Main Layout: Sidebar + Editor -->
    <div v-else class="logic-view__main">
      <!-- Left Sidebar: Rule List -->
      <div class="logic-view__sidebar">
        <div class="logic-view__sidebar-header">
          <h3 class="logic-view__sidebar-title">Regeln</h3>
          <button
            class="logic-view__add-btn"
            title="Neue Regel erstellen"
            aria-label="Neue Regel erstellen"
            @click="handleCreateNew"
          >
            <Plus class="logic-view__add-icon" />
          </button>
        </div>

        <div class="logic-view__rule-list">
          <RuleCard
            v-for="rule in rules"
            :key="rule.id"
            :rule="rule"
            :is-selected="rule.id === selectedRuleId"
            :is-active="logicStore.isRuleActive(rule.id)"
            :execution-count="getExecutionCount(rule.id)"
            @select="handleSelectRule"
            @toggle="handleToggleRule"
            @delete="handleDeleteRule"
          />

          <div v-if="rules.length === 0" class="logic-view__no-rules">
            Keine Regeln vorhanden
          </div>
        </div>
      </div>

      <!-- Right: Editor Area -->
      <div class="logic-view__editor">
        <div v-if="isCreatingNew" class="logic-view__editor-content">
          <h3 class="logic-view__editor-title">
            {{ newRuleName || 'Neue Regel' }}
          </h3>
          <p class="logic-view__editor-hint">
            Der Flow-Editor wird von Phase 0+1 bereitgestellt.
            Hier können Regeln mit dem visuellen Node-Editor erstellt werden.
          </p>
        </div>

        <div v-else-if="selectedRule" class="logic-view__editor-content">
          <h3 class="logic-view__editor-title">{{ selectedRule.name }}</h3>
          <p v-if="selectedRule.description" class="logic-view__editor-description">
            {{ selectedRule.description }}
          </p>

          <!-- Rule details -->
          <div class="logic-view__rule-details">
            <div class="logic-view__detail-section">
              <h4 class="logic-view__detail-label">Bedingungen</h4>
              <div
                v-for="(cond, i) in selectedRule.conditions"
                :key="i"
                class="logic-view__detail-item"
              >
                <code>{{ cond.type }}: {{ JSON.stringify(cond).slice(0, 80) }}</code>
              </div>
            </div>

            <div class="logic-view__detail-section">
              <h4 class="logic-view__detail-label">Logik</h4>
              <span class="logic-view__operator-badge">{{ selectedRule.logic_operator }}</span>
            </div>

            <div class="logic-view__detail-section">
              <h4 class="logic-view__detail-label">Aktionen</h4>
              <div
                v-for="(action, i) in selectedRule.actions"
                :key="i"
                class="logic-view__detail-item"
              >
                <code>{{ action.type }}: {{ JSON.stringify(action).slice(0, 80) }}</code>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="logic-view__editor-empty">
          <GitBranch class="logic-view__editor-empty-icon" />
          <p>Wähle eine Regel aus der Liste oder erstelle eine neue.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.logic-view {
  height: 100%;
  overflow: auto;
}

/* Empty State */
.logic-view__empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6);
}

.logic-view__empty-header {
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
}

.logic-view__empty-icon {
  width: 48px;
  height: 48px;
  color: var(--color-text-muted);
  margin: 0 auto var(--space-3);
}

.logic-view__empty-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2);
}

.logic-view__empty-text {
  font-size: 14px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 0 0 var(--space-4);
}

.logic-view__create-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.logic-view__create-btn:hover {
  color: white;
  background: var(--color-accent);
}

.logic-view__create-icon {
  width: 14px;
  height: 14px;
}

.logic-view__templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
}

/* Main Layout */
.logic-view__main {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100%;
  overflow: hidden;
}

/* Sidebar */
.logic-view__sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--glass-border);
  overflow: hidden;
}

.logic-view__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  border-bottom: 1px solid var(--glass-border);
}

.logic-view__sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0;
}

.logic-view__add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--glass-border);
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.logic-view__add-btn:hover {
  border-color: var(--color-accent);
  background: rgba(59, 130, 246, 0.1);
}

.logic-view__add-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-secondary);
}

.logic-view__rule-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.logic-view__no-rules {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  padding: var(--space-4);
}

/* Editor */
.logic-view__editor {
  overflow-y: auto;
  padding: var(--space-4);
}

.logic-view__editor-content {
  max-width: 800px;
}

.logic-view__editor-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2);
}

.logic-view__editor-description {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 var(--space-4);
}

.logic-view__editor-hint {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
  padding: var(--space-4);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px dashed var(--glass-border);
}

.logic-view__rule-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.logic-view__detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.logic-view__detail-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0;
}

.logic-view__detail-item code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-secondary);
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logic-view__operator-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accent);
  padding: 2px 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-sm);
}

.logic-view__editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-3);
  color: var(--color-text-muted);
}

.logic-view__editor-empty-icon {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.logic-view__editor-empty p {
  font-size: 13px;
  margin: 0;
}

@media (max-width: 768px) {
  .logic-view__main {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .logic-view__sidebar {
    border-right: none;
    border-bottom: 1px solid var(--glass-border);
    max-height: 200px;
  }
}
</style>
