<script setup lang="ts">
/**
 * RuleCard Component
 *
 * Compact card showing a logic rule with flow badges:
 * [Sensor] -> [Condition] -> [Action]
 * Status dot, last execution timestamp, execution counter.
 */

import { computed, ref } from 'vue'
import { Zap, Clock, Trash2, AlertCircle } from 'lucide-vue-next'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import type { LogicRule, SensorCondition, ActuatorAction, RuleIntentLifecycle } from '@/types/logic'

interface Props {
  /** The logic rule */
  rule: LogicRule
  /** Whether this rule is currently selected in the editor */
  isSelected: boolean
  /** Whether this rule is currently executing (flash effect) */
  isActive?: boolean
  /** Number of executions in last 24h */
  executionCount?: number
  lifecycle?: RuleIntentLifecycle | null
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  executionCount: 0,
})

const emit = defineEmits<{
  select: [ruleId: string]
  toggle: [ruleId: string, enabled: boolean]
  delete: [ruleId: string]
}>()

const isToggling = ref(false)

/** Status label + color based on enabled state and last execution */
const statusInfo = computed(() => {
  if (props.lifecycle?.state === 'terminal_conflict') {
    return { label: 'Konflikt', cssClass: 'rule-card__status-label--warning' }
  }
  if (props.lifecycle?.state === 'terminal_integration_issue') {
    return { label: 'Integration', cssClass: 'rule-card__status-label--error' }
  }
  if (props.lifecycle?.state === 'terminal_failed') {
    return { label: 'Fehler', cssClass: 'rule-card__status-label--error' }
  }
  if (props.lifecycle?.state === 'terminal_success') {
    return { label: 'Erfolg', cssClass: 'rule-card__status-label--active' }
  }
  if (props.lifecycle?.state === 'accepted') {
    return { label: 'Angenommen', cssClass: 'rule-card__status-label--pending' }
  }
  if (props.lifecycle?.state === 'pending_activation') {
    return { label: 'Aktivierung...', cssClass: 'rule-card__status-label--pending' }
  }
  if (props.lifecycle?.state === 'pending_execution') {
    return { label: 'Ausfuehrung...', cssClass: 'rule-card__status-label--pending' }
  }
  if (props.rule.enabled) {
    return { label: 'Aktiv', cssClass: 'rule-card__status-label--active' }
  }
  return { label: 'Deaktiviert', cssClass: 'rule-card__status-label--disabled' }
})

/** Whether last execution failed */
const hasError = computed(
  () =>
    props.lifecycle?.state === 'terminal_failed' ||
    props.lifecycle?.state === 'terminal_integration_issue' ||
    props.rule.last_execution_success === false
)

async function handleToggle() {
  isToggling.value = true
  emit('toggle', props.rule.id, !props.rule.enabled)
  // Reset after short delay (parent handles actual async)
  setTimeout(() => { isToggling.value = false }, 800)
}

/** Extract first sensor condition for display */
const sensorBadge = computed(() => {
  const cond = props.rule.conditions.find(
    c => c.type === 'sensor' || c.type === 'sensor_threshold'
  ) as SensorCondition | undefined

  if (!cond) {
    const timeCond = props.rule.conditions.find(c => c.type === 'time_window' || c.type === 'time')
    if (timeCond) return { label: 'Zeit', detail: '' }
    return null
  }

  return {
    label: cond.sensor_type,
    detail: `${cond.operator} ${cond.value}`,
  }
})

/** Extract first actuator action for display */
const actionBadge = computed(() => {
  const action = props.rule.actions.find(
    a => a.type === 'actuator' || a.type === 'actuator_command'
  ) as ActuatorAction | undefined

  if (!action) {
    const notif = props.rule.actions.find(a => a.type === 'notification')
    if (notif) return { label: 'Benachrichtigung', command: '' }
    return null
  }

  return {
    label: 'Aktor',
    command: action.command,
  }
})

/** Format last triggered timestamp */
const lastTriggeredText = computed(() => {
  if (!props.rule.last_triggered) return 'Noch nie'
  try {
    return formatDistanceToNow(new Date(props.rule.last_triggered), {
      addSuffix: true,
      locale: de,
    })
  } catch {
    return 'Unbekannt'
  }
})
</script>

<template>
  <div
    class="rule-card"
    :class="{
      'rule-card--selected': isSelected,
      'rule-card--active': isActive,
      'rule-card--disabled': !rule.enabled,
      'rule-card--error': hasError,
    }"
    @click="emit('select', rule.id)"
  >
    <!-- Status dot + name + status label -->
    <div class="rule-card__header">
      <button
        class="rule-card__status-dot"
        :class="[
          rule.enabled ? 'rule-card__status-dot--on' : 'rule-card__status-dot--off',
          { 'rule-card__status-dot--error': hasError },
          { 'rule-card__status-dot--toggling': isToggling },
        ]"
        :title="rule.enabled ? 'Aktiv - Klick zum Deaktivieren' : 'Inaktiv - Klick zum Aktivieren'"
        :aria-label="rule.enabled ? 'Regel deaktivieren' : 'Regel aktivieren'"
        @click.stop="handleToggle"
      />
      <span class="rule-card__name">{{ rule.name }}</span>
      <span class="rule-card__status-label" :class="statusInfo.cssClass">
        {{ statusInfo.label }}
      </span>
      <span
        v-if="lifecycle?.state === 'terminal_conflict' && lifecycle.terminal_reason_code"
        class="rule-card__reason-code"
        :title="lifecycle.terminal_reason_text || lifecycle.terminal_reason_code"
      >
        {{ lifecycle.terminal_reason_code }}
      </span>
      <AlertCircle
        v-if="hasError"
        class="rule-card__error-icon"
        :title="rule.last_execution_success === false ? 'Letzte Ausführung fehlgeschlagen' : ''"
      />
      <button
        class="rule-card__delete"
        title="Regel löschen"
        aria-label="Regel löschen"
        @click.stop="emit('delete', rule.id)"
      >
        <Trash2 class="rule-card__delete-icon" />
      </button>
    </div>

    <!-- Flow badges -->
    <div class="rule-card__flow" v-if="sensorBadge || actionBadge">
      <span v-if="sensorBadge" class="rule-card__badge rule-card__badge--sensor">
        {{ sensorBadge.label }}
        <span v-if="sensorBadge.detail" class="rule-card__badge-detail">
          {{ sensorBadge.detail }}
        </span>
      </span>
      <span class="rule-card__arrow">→</span>
      <span class="rule-card__badge rule-card__badge--operator">
        {{ rule.logic_operator }}
      </span>
      <span class="rule-card__arrow">→</span>
      <span v-if="actionBadge" class="rule-card__badge rule-card__badge--action">
        {{ actionBadge.command || actionBadge.label }}
      </span>
    </div>

    <!-- Footer: last execution + count -->
    <div class="rule-card__footer">
      <span class="rule-card__execution">
        <Clock class="rule-card__execution-icon" />
        {{ lastTriggeredText }}
      </span>
      <span v-if="executionCount > 0" class="rule-card__count">
        <Zap class="rule-card__count-icon" />
        {{ executionCount }}x/24h
      </span>
    </div>
  </div>
</template>

<style scoped>
.rule-card {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.rule-card:hover {
  border-color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
}

.rule-card--selected {
  border-color: var(--color-accent);
  background: rgba(59, 130, 246, 0.05);
}

.rule-card--active {
  animation: rule-flash 1.5s ease-out;
}

@keyframes rule-flash {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
    border-color: var(--color-status-success);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
    border-color: var(--glass-border);
  }
}

.rule-card--disabled {
  opacity: 0.6;
}

.rule-card--error {
  border-color: rgba(248, 113, 113, 0.4);
}

.rule-card--error:hover {
  border-color: rgba(248, 113, 113, 0.6);
}

.rule-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.rule-card__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.rule-card__status-dot--on {
  background: var(--color-status-success);
  box-shadow: 0 0 4px var(--color-status-success);
}

.rule-card__status-dot--off {
  background: var(--color-text-muted);
}

.rule-card__status-dot--error {
  background: var(--color-status-error);
  box-shadow: 0 0 4px var(--color-status-error);
}

.rule-card__status-dot--toggling {
  animation: dot-pulse 0.8s ease-in-out;
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.rule-card__status-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.rule-card__status-label--active {
  color: var(--color-status-success);
}

.rule-card__status-label--disabled {
  color: var(--color-text-muted);
}

.rule-card__status-label--error {
  color: var(--color-status-error);
}

.rule-card__status-label--pending {
  color: var(--color-warning);
}

.rule-card__status-label--warning {
  color: var(--color-warning);
}

.rule-card__reason-code {
  font-size: 9px;
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-card__error-icon {
  width: 12px;
  height: 12px;
  color: var(--color-status-error);
  flex-shrink: 0;
}

.rule-card__name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-card__delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
}

.rule-card:hover .rule-card__delete {
  opacity: 1;
}

.rule-card__delete:hover {
  background: rgba(239, 68, 68, 0.1);
}

.rule-card__delete-icon {
  width: 12px;
  height: 12px;
  color: var(--color-status-error);
}

.rule-card__flow {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}

.rule-card__badge {
  font-size: 10px;
  font-family: var(--font-mono);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.rule-card__badge--sensor {
  color: var(--color-accent);
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.rule-card__badge--operator {
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
}

.rule-card__badge--action {
  color: var(--color-status-success);
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.rule-card__badge-detail {
  color: var(--color-text-muted);
  margin-left: 2px;
}

.rule-card__arrow {
  font-size: 10px;
  color: var(--color-text-muted);
}

.rule-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.rule-card__execution,
.rule-card__count {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.rule-card__execution-icon,
.rule-card__count-icon {
  width: 10px;
  height: 10px;
}
</style>
