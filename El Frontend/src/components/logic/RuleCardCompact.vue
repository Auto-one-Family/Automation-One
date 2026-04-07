<script setup lang="ts">
/**
 * RuleCardCompact
 *
 * Compact card for monitor rule overview with optional quick interaction mode:
 * - default: click navigates to /logic/:ruleId
 * - quick mode: card expands with safe toggle, basic edit fields and recent ON/OFF history
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, AlertCircle, ChevronDown, Save, ExternalLink, Power } from 'lucide-vue-next'
import { formatDateTime, formatRelativeTime } from '@/utils/formatters'
import { useUiStore } from '@/shared/stores/ui.store'
import { useLogicStore } from '@/shared/stores/logic.store'
import { useToast } from '@/composables/useToast'
import type {
  LogicRule,
  SensorCondition,
  ActuatorAction,
  RuleIntentLifecycle,
  ExecutionHistoryItem,
} from '@/types/logic'

interface Props {
  rule: LogicRule
  /** Whether this rule is currently executing (glow effect) */
  isActive?: boolean
  /** Zone names for L1 Monitor (answers "Where?"). L2 omits — zone is implicit. */
  zoneNames?: string[]
  lifecycle?: RuleIntentLifecycle | null
  quickActions?: boolean
  historyLimit?: number
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  quickActions: false,
  historyLimit: 6,
})

const router = useRouter()
const uiStore = useUiStore()
const logicStore = useLogicStore()
const toast = useToast()
const isExpanded = ref(false)
const isSaving = ref(false)
const isToggling = ref(false)
const historyRequested = ref(false)
const quickName = ref(props.rule.name)
const quickFirstNodeDraft = ref<Record<string, unknown> | null>(null)
const sensorOperatorOptions = ['>', '>=', '<', '<=', '==', '!=', 'between'] as const

/** Status dot + label based on enabled and last execution */
const statusInfo = computed(() => {
  if (props.lifecycle?.state === 'terminal_conflict') {
    return { label: 'Konflikt', cssClass: 'rule-card-compact__status--warning' }
  }
  if (props.lifecycle?.state === 'terminal_integration_issue') {
    return { label: 'Integration', cssClass: 'rule-card-compact__status--error' }
  }
  if (props.lifecycle?.state === 'terminal_failed') {
    return { label: 'Fehler', cssClass: 'rule-card-compact__status--error' }
  }
  if (props.lifecycle?.state === 'terminal_success') {
    return { label: 'Erfolg', cssClass: 'rule-card-compact__status--active' }
  }
  if (props.lifecycle?.state === 'accepted') {
    return { label: 'Angenommen', cssClass: 'rule-card-compact__status--pending' }
  }
  if (props.lifecycle?.state === 'pending_activation') {
    return { label: 'Aktivierung...', cssClass: 'rule-card-compact__status--pending' }
  }
  if (props.lifecycle?.state === 'pending_execution') {
    return { label: 'Ausfuehrung...', cssClass: 'rule-card-compact__status--pending' }
  }
  if (props.rule.enabled) {
    return { label: 'Aktiv', cssClass: 'rule-card-compact__status--active' }
  }
  return { label: 'Deaktiviert', cssClass: 'rule-card-compact__status--disabled' }
})

const hasError = computed(
  () =>
    props.lifecycle?.state === 'terminal_failed' ||
    props.lifecycle?.state === 'terminal_integration_issue' ||
    props.rule.last_execution_success === false
)

/** Dynamic aria-label including status for screen readers (ARIA-live announces changes). */
const statusAriaLabel = computed(() => {
  const base = `Regel ${props.rule.name} öffnen`
  if (hasError.value) return `${base}. Status: Fehler.`
  if (props.isActive) return `${base}. Wird ausgeführt.`
  return `${base}. ${statusInfo.value.label}.`
})

/** Optional 1-line badge: first condition + action */
const shortDescription = computed(() => {
  const cond = props.rule.conditions.find(
    c => c.type === 'sensor' || c.type === 'sensor_threshold'
  ) as SensorCondition | undefined
  const action = props.rule.actions.find(
    a => a.type === 'actuator' || a.type === 'actuator_command'
  ) as ActuatorAction | undefined

  if (!cond && !action) {
    const timeCond = props.rule.conditions.find(c => c.type === 'time_window' || c.type === 'time')
    if (timeCond) return 'Zeitbasiert'
    return null
  }

  const condPart = cond ? `${cond.sensor_type} ${cond.operator} ${cond.value}` : ''
  const actionPart = action ? `→ ${action.command}` : ''
  return [condPart, actionPart].filter(Boolean).join(' ')
})

const lastTriggeredText = computed(() =>
  formatRelativeTime(props.rule.last_triggered)
)

/** Zone badge text: "Zone1, Zone2" or "Zone1 +2" when >2 zones. Fallback "—" when no zones (5s rule: "Wo?" always answerable). */
const zoneBadgeText = computed(() => {
  if (!props.zoneNames || props.zoneNames.length === 0) return '—'
  if (props.zoneNames.length <= 2) return props.zoneNames.join(', ')
  return `${props.zoneNames[0]} +${props.zoneNames.length - 1}`
})

const hasQuickChanges = computed(() => {
  const originalFirstNodeJson = props.rule.conditions[0] ? JSON.stringify(props.rule.conditions[0]) : ''
  const draftFirstNodeJson = quickFirstNodeDraft.value ? JSON.stringify(quickFirstNodeDraft.value) : ''
  return quickName.value.trim() !== props.rule.name || draftFirstNodeJson !== originalFirstNodeJson
})

const historyForRule = computed(() => {
  return logicStore.executionHistory
    .filter(entry => entry.rule_id === props.rule.id)
    .sort((a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime())
    .slice(0, props.historyLimit)
})

function syncQuickFields(): void {
  quickName.value = props.rule.name
  quickFirstNodeDraft.value = props.rule.conditions[0]
    ? JSON.parse(JSON.stringify(props.rule.conditions[0])) as Record<string, unknown>
    : null
}

const firstNodeType = computed(() => {
  const type = quickFirstNodeDraft.value?.type
  return typeof type === 'string' ? type : ''
})

function updateFirstNodeField(key: string, value: unknown): void {
  if (!quickFirstNodeDraft.value) return
  quickFirstNodeDraft.value = {
    ...quickFirstNodeDraft.value,
    [key]: value,
  }
}

function asStringField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumberField(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function onFirstNodeNumberInput(key: string, raw: string): void {
  if (raw.trim() === '') {
    updateFirstNodeField(key, undefined)
    return
  }
  const parsed = Number(raw)
  if (Number.isFinite(parsed)) updateFirstNodeField(key, parsed)
}

function onFirstNodeDaysInput(raw: string): void {
  const parsed = raw
    .split(',')
    .map(token => Number(token.trim()))
    .filter(num => Number.isInteger(num) && num >= 0 && num <= 6)
  updateFirstNodeField('days_of_week', parsed)
}

function onFirstNodeConditionsJsonInput(raw: string): void {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (Array.isArray(parsed)) updateFirstNodeField('conditions', parsed)
  } catch {
    // invalid JSON while typing is ignored
  }
}

const firstNodeDaysText = computed(() => {
  const days = quickFirstNodeDraft.value?.days_of_week
  if (!Array.isArray(days)) return ''
  return days.join(', ')
})

function extractActionCommand(entry: ExecutionHistoryItem): 'ON' | 'OFF' | 'OTHER' {
  const buckets = [entry.action_outcomes, entry.actions_executed]
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue
    for (const item of bucket) {
      if (!item || typeof item !== 'object') continue
      const command = (item as Record<string, unknown>).command
      if (typeof command !== 'string') continue
      const normalized = command.toUpperCase()
      if (normalized === 'ON') return 'ON'
      if (normalized === 'OFF') return 'OFF'
      return 'OTHER'
    }
  }
  return 'OTHER'
}

function navigateToRule() {
  router.push({ name: 'logic-rule', params: { ruleId: props.rule.id } })
}

async function handleMainClick(): Promise<void> {
  if (!props.quickActions) {
    navigateToRule()
    return
  }

  isExpanded.value = !isExpanded.value
  if (isExpanded.value) {
    syncQuickFields()
    if (!historyRequested.value) {
      historyRequested.value = true
      await logicStore.loadExecutionHistory(props.rule.id)
    }
  }
}

async function toggleRuleSafely(): Promise<void> {
  if (isToggling.value) return

  const enabling = !props.rule.enabled
  const confirmed = await uiStore.confirm({
    title: enabling ? 'Regel aktivieren?' : 'Regel deaktivieren?',
    message: enabling
      ? `Regel "${props.rule.name}" wird sofort wieder scharf geschaltet. Fortfahren?`
      : `Regel "${props.rule.name}" wird deaktiviert und löst nicht mehr aus. Fortfahren?`,
    variant: enabling ? 'warning' : 'info',
    confirmText: enabling ? 'Sicher aktivieren' : 'Deaktivieren',
    cancelText: 'Abbrechen',
  })

  if (!confirmed) return

  isToggling.value = true
  try {
    const enabled = await logicStore.toggleRule(props.rule.id)
    toast.success(enabled ? 'Regel aktiviert' : 'Regel deaktiviert')
  } catch {
    toast.error(logicStore.error ?? 'Regel konnte nicht umgeschaltet werden')
  } finally {
    isToggling.value = false
  }
}

async function saveQuickSettings(): Promise<void> {
  if (isSaving.value || !hasQuickChanges.value) return
  const normalizedName = quickName.value.trim()
  if (!normalizedName) {
    toast.error('Regelname darf nicht leer sein')
    return
  }

  if (props.rule.conditions.length === 0) {
    toast.error('Regel hat keinen ersten Knoten zum Bearbeiten')
    return
  }

  if (!quickFirstNodeDraft.value) {
    toast.error('Erster Knoten ist nicht verfügbar')
    return
  }
  if (typeof quickFirstNodeDraft.value.type !== 'string') {
    toast.error('Erster Knoten benötigt ein Feld "type"')
    return
  }

  isSaving.value = true
  try {
    const updatedConditions = [...props.rule.conditions]
    updatedConditions[0] = quickFirstNodeDraft.value as unknown as (typeof updatedConditions)[number]
    await logicStore.updateRule(props.rule.id, {
      name: normalizedName,
      conditions: updatedConditions,
    })
    toast.success('Regel und erster Knoten gespeichert')
    syncQuickFields()
  } catch {
    toast.error(logicStore.error ?? 'Regel konnte nicht gespeichert werden')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <article
    class="rule-card-compact"
    :class="{
      'rule-card-compact--active': isActive,
      'rule-card-compact--error': hasError,
      'rule-card-compact--expanded': quickActions && isExpanded,
    }"
  >
    <button
      type="button"
      class="rule-card-compact__summary"
      :aria-label="statusAriaLabel"
      aria-live="polite"
      @click="handleMainClick"
    >
      <div class="rule-card-compact__header">
        <span
          class="rule-card-compact__status-dot"
          :class="[
            rule.enabled ? 'rule-card-compact__status-dot--on' : 'rule-card-compact__status-dot--off',
            { 'rule-card-compact__status-dot--error': hasError },
          ]"
          :title="statusInfo.label"
        />
        <span class="rule-card-compact__name">{{ rule.name }}</span>
        <span class="rule-card-compact__status" :class="statusInfo.cssClass">
          {{ statusInfo.label }}
        </span>
        <AlertCircle
          v-if="hasError"
          class="rule-card-compact__error-icon"
          :title="'Letzte Ausführung fehlgeschlagen'"
        />
      </div>
      <div class="rule-card-compact__footer">
        <span v-if="zoneNames !== undefined" class="rule-card-compact__zone-badge">
          {{ zoneBadgeText }}
        </span>
        <span v-if="shortDescription" class="rule-card-compact__badge">
          {{ shortDescription }}
        </span>
        <span class="rule-card-compact__time">
          <Clock class="rule-card-compact__time-icon" />
          {{ lastTriggeredText }}
        </span>
      </div>
      <span v-if="quickActions" class="rule-card-compact__expand-hint">
        <ChevronDown class="rule-card-compact__expand-icon" :class="{ 'rule-card-compact__expand-icon--open': isExpanded }" />
      </span>
    </button>

    <Transition name="rule-compact-expand">
      <div v-if="quickActions && isExpanded" class="rule-card-compact__quick-panel">
        <div class="rule-card-compact__quick-fields">
          <label class="rule-card-compact__field">
            <span class="rule-card-compact__field-label">Name</span>
            <input v-model="quickName" class="rule-card-compact__input" type="text" maxlength="96">
          </label>

          <div v-if="quickFirstNodeDraft" class="rule-card-compact__node-form">
            <template v-if="firstNodeType === 'sensor' || firstNodeType === 'sensor_threshold'">
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">ESP ID</span>
                <input
                  class="rule-card-compact__input"
                  :value="asStringField(quickFirstNodeDraft.esp_id)"
                  @input="updateFirstNodeField('esp_id', ($event.target as HTMLInputElement).value)"
                >
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">GPIO</span>
                <input
                  class="rule-card-compact__input"
                  type="number"
                  :value="asNumberField(quickFirstNodeDraft.gpio)"
                  @input="onFirstNodeNumberInput('gpio', ($event.target as HTMLInputElement).value)"
                >
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Sensor-Typ</span>
                <input
                  class="rule-card-compact__input"
                  :value="asStringField(quickFirstNodeDraft.sensor_type)"
                  @input="updateFirstNodeField('sensor_type', ($event.target as HTMLInputElement).value)"
                >
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Operator</span>
                <select
                  class="rule-card-compact__input"
                  :value="asStringField(quickFirstNodeDraft.operator)"
                  @change="updateFirstNodeField('operator', ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="op in sensorOperatorOptions" :key="op" :value="op">{{ op }}</option>
                </select>
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Wert</span>
                <input
                  class="rule-card-compact__input"
                  type="number"
                  :value="asNumberField(quickFirstNodeDraft.value)"
                  @input="onFirstNodeNumberInput('value', ($event.target as HTMLInputElement).value)"
                >
              </label>
              <div class="rule-card-compact__field-row">
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">Min (between)</span>
                  <input
                    class="rule-card-compact__input"
                    type="number"
                    :value="asNumberField(quickFirstNodeDraft.min)"
                    @input="onFirstNodeNumberInput('min', ($event.target as HTMLInputElement).value)"
                  >
                </label>
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">Max (between)</span>
                  <input
                    class="rule-card-compact__input"
                    type="number"
                    :value="asNumberField(quickFirstNodeDraft.max)"
                    @input="onFirstNodeNumberInput('max', ($event.target as HTMLInputElement).value)"
                  >
                </label>
              </div>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Subzone ID (optional)</span>
                <input
                  class="rule-card-compact__input"
                  :value="asStringField(quickFirstNodeDraft.subzone_id)"
                  @input="updateFirstNodeField('subzone_id', ($event.target as HTMLInputElement).value)"
                >
              </label>
            </template>

            <template v-else-if="firstNodeType === 'hysteresis'">
              <div class="rule-card-compact__field-row">
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">activate_above</span>
                  <input class="rule-card-compact__input" type="number" :value="asNumberField(quickFirstNodeDraft.activate_above)" @input="onFirstNodeNumberInput('activate_above', ($event.target as HTMLInputElement).value)">
                </label>
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">deactivate_below</span>
                  <input class="rule-card-compact__input" type="number" :value="asNumberField(quickFirstNodeDraft.deactivate_below)" @input="onFirstNodeNumberInput('deactivate_below', ($event.target as HTMLInputElement).value)">
                </label>
              </div>
              <div class="rule-card-compact__field-row">
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">activate_below</span>
                  <input class="rule-card-compact__input" type="number" :value="asNumberField(quickFirstNodeDraft.activate_below)" @input="onFirstNodeNumberInput('activate_below', ($event.target as HTMLInputElement).value)">
                </label>
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">deactivate_above</span>
                  <input class="rule-card-compact__input" type="number" :value="asNumberField(quickFirstNodeDraft.deactivate_above)" @input="onFirstNodeNumberInput('deactivate_above', ($event.target as HTMLInputElement).value)">
                </label>
              </div>
            </template>

            <template v-else-if="firstNodeType === 'time' || firstNodeType === 'time_window'">
              <div class="rule-card-compact__field-row">
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">Start-Stunde</span>
                  <input class="rule-card-compact__input" type="number" min="0" max="23" :value="asNumberField(quickFirstNodeDraft.start_hour)" @input="onFirstNodeNumberInput('start_hour', ($event.target as HTMLInputElement).value)">
                </label>
                <label class="rule-card-compact__field">
                  <span class="rule-card-compact__field-label">End-Stunde</span>
                  <input class="rule-card-compact__input" type="number" min="0" max="23" :value="asNumberField(quickFirstNodeDraft.end_hour)" @input="onFirstNodeNumberInput('end_hour', ($event.target as HTMLInputElement).value)">
                </label>
              </div>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Wochentage (0-6, komma-getrennt)</span>
                <input class="rule-card-compact__input" :value="firstNodeDaysText" @input="onFirstNodeDaysInput(($event.target as HTMLInputElement).value)">
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Timezone</span>
                <input class="rule-card-compact__input" :value="asStringField(quickFirstNodeDraft.timezone)" @input="updateFirstNodeField('timezone', ($event.target as HTMLInputElement).value)">
              </label>
            </template>

            <template v-else-if="firstNodeType === 'diagnostics_status'">
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Check Name</span>
                <input class="rule-card-compact__input" :value="asStringField(quickFirstNodeDraft.check_name)" @input="updateFirstNodeField('check_name', ($event.target as HTMLInputElement).value)">
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Expected Status</span>
                <input class="rule-card-compact__input" :value="asStringField(quickFirstNodeDraft.expected_status)" @input="updateFirstNodeField('expected_status', ($event.target as HTMLInputElement).value)">
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Operator</span>
                <input class="rule-card-compact__input" :value="asStringField(quickFirstNodeDraft.operator)" @input="updateFirstNodeField('operator', ($event.target as HTMLInputElement).value)">
              </label>
            </template>

            <template v-else-if="firstNodeType === 'compound'">
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Logik</span>
                <select class="rule-card-compact__input" :value="asStringField(quickFirstNodeDraft.logic)" @change="updateFirstNodeField('logic', ($event.target as HTMLSelectElement).value)">
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </label>
              <label class="rule-card-compact__field">
                <span class="rule-card-compact__field-label">Sub-Conditions (JSON)</span>
                <textarea
                  class="rule-card-compact__input rule-card-compact__textarea"
                  :value="JSON.stringify(quickFirstNodeDraft.conditions ?? [], null, 2)"
                  rows="6"
                  spellcheck="false"
                  @input="onFirstNodeConditionsJsonInput(($event.target as HTMLTextAreaElement).value)"
                />
              </label>
            </template>
          </div>

          <div v-else class="rule-card-compact__history-empty">Kein erster Knoten verfügbar</div>
        </div>

        <div class="rule-card-compact__quick-actions">
          <button
            type="button"
            class="rule-card-compact__action-btn rule-card-compact__action-btn--toggle"
            :disabled="isToggling"
            @click="toggleRuleSafely"
          >
            <Power class="rule-card-compact__action-icon" />
            {{ rule.enabled ? 'Sicher deaktivieren' : 'Sicher aktivieren' }}
          </button>
          <button
            type="button"
            class="rule-card-compact__action-btn rule-card-compact__action-btn--save"
            :disabled="isSaving || !hasQuickChanges"
            @click="saveQuickSettings"
          >
            <Save class="rule-card-compact__action-icon" />
            Basis speichern
          </button>
          <button type="button" class="rule-card-compact__action-btn" @click="navigateToRule">
            <ExternalLink class="rule-card-compact__action-icon" />
            Vollständig bearbeiten
          </button>
        </div>

        <div class="rule-card-compact__history">
          <div class="rule-card-compact__history-title">Verlauf (ON/OFF)</div>
          <ul v-if="historyForRule.length > 0" class="rule-card-compact__history-list">
            <li v-for="entry in historyForRule" :key="entry.id" class="rule-card-compact__history-item">
              <span
                class="rule-card-compact__history-command"
                :class="{
                  'rule-card-compact__history-command--on': extractActionCommand(entry) === 'ON',
                  'rule-card-compact__history-command--off': extractActionCommand(entry) === 'OFF',
                }"
              >
                {{ extractActionCommand(entry) }}
              </span>
              <span class="rule-card-compact__history-time">{{ formatDateTime(entry.triggered_at) }}</span>
            </li>
          </ul>
          <div v-else class="rule-card-compact__history-empty">Noch keine Ausführungshistorie verfügbar</div>
        </div>
      </div>
    </Transition>
  </article>
  
</template>

<style scoped>
.rule-card-compact {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  transition: all var(--transition-fast);
  width: 100%;
}

.rule-card-compact__summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.rule-card-compact:hover {
  border-color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
}

.rule-card-compact__summary:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 2px;
}

.rule-card-compact__expand-hint {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.rule-card-compact__expand-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.rule-card-compact__expand-icon--open {
  transform: rotate(180deg);
}

.rule-card-compact__quick-panel {
  border-top: 1px dashed var(--glass-border);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.rule-card-compact__quick-fields {
  display: grid;
  gap: var(--space-2);
}

.rule-card-compact__node-form {
  display: grid;
  gap: var(--space-2);
}

.rule-card-compact__field {
  display: grid;
  gap: 4px;
}

.rule-card-compact__field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.rule-card-compact__field-label {
  font-size: 10px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.rule-card-compact__input {
  width: 100%;
  min-height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  padding: 0 var(--space-2);
}

.rule-card-compact__textarea {
  min-height: 160px;
  padding: var(--space-2);
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  line-height: 1.35;
}

.rule-card-compact__quick-actions {
  display: grid;
  gap: var(--space-2);
}

.rule-card-compact__action-btn {
  min-height: 44px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: var(--text-xs);
  cursor: pointer;
}

.rule-card-compact__action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.rule-card-compact__action-btn--toggle {
  border-color: color-mix(in srgb, var(--color-warning) 35%, var(--glass-border));
}

.rule-card-compact__action-btn--save {
  border-color: color-mix(in srgb, var(--color-info) 35%, var(--glass-border));
}

.rule-card-compact__action-icon {
  width: 12px;
  height: 12px;
}

.rule-card-compact__history {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-1);
}

.rule-card-compact__history-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
}

.rule-card-compact__history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-1);
}

.rule-card-compact__history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 6px 8px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
}

.rule-card-compact__history-command {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
}

.rule-card-compact__history-command--on {
  color: var(--color-status-good);
}

.rule-card-compact__history-command--off {
  color: var(--color-warning);
}

.rule-card-compact__history-time {
  font-size: 10px;
  color: var(--color-text-muted);
}

.rule-card-compact__history-empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.rule-compact-expand-enter-active,
.rule-compact-expand-leave-active {
  transition: all 0.18s ease;
}

.rule-compact-expand-enter-from,
.rule-compact-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.rule-card-compact--active {
  animation: rule-compact-flash 1.5s ease-out;
}

@keyframes rule-compact-flash {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
    border-color: var(--color-status-good);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
    border-color: var(--glass-border);
  }
}

.rule-card-compact--error {
  border-color: rgba(248, 113, 113, 0.4);
  border-left: 3px solid var(--color-status-alarm);
}

.rule-card-compact--error:hover {
  border-color: rgba(248, 113, 113, 0.6);
  border-left-color: var(--color-status-alarm);
}

.rule-card-compact__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.rule-card-compact__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
}

.rule-card-compact__status-dot--on {
  background: var(--color-status-good);
  box-shadow: 0 0 4px var(--color-status-good);
}

.rule-card-compact__status-dot--off {
  background: var(--color-text-muted);
}

.rule-card-compact__status-dot--error {
  background: var(--color-status-alarm);
  box-shadow: 0 0 4px var(--color-status-alarm);
}

.rule-card-compact__name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-card-compact__status {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.rule-card-compact__status--active {
  color: var(--color-status-good);
}

.rule-card-compact__status--disabled {
  color: var(--color-text-muted);
}

.rule-card-compact__status--error {
  color: var(--color-status-alarm);
}

.rule-card-compact__status--warning {
  color: var(--color-warning);
}

.rule-card-compact__status--pending {
  color: var(--color-warning);
}

.rule-card-compact__error-icon {
  width: 12px;
  height: 12px;
  color: var(--color-status-alarm);
  flex-shrink: 0;
}

.rule-card-compact__footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.rule-card-compact__zone-badge {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 8px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-card-compact__badge {
  font-size: 10px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-card-compact__time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--color-text-muted);
}

.rule-card-compact__time-icon {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}
</style>
