<script setup lang="ts">
/**
 * RuleCardCompact — Read-only compact rule card for Monitor L2
 *
 * Shows: Status dot, name, last execution. Optional 1-line badge.
 * Click navigates to LogicView (/logic/:ruleId).
 * No toggle, no delete — Monitor is read-only.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, AlertCircle } from 'lucide-vue-next'
import { formatRelativeTime } from '@/utils/formatters'
import type { LogicRule, SensorCondition, ActuatorAction, RuleIntentLifecycle } from '@/types/logic'

interface Props {
  rule: LogicRule
  /** Whether this rule is currently executing (glow effect) */
  isActive?: boolean
  /** Zone names for L1 Monitor (answers "Where?"). L2 omits — zone is implicit. */
  zoneNames?: string[]
  lifecycle?: RuleIntentLifecycle | null
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  zoneNames: () => [],
})

const router = useRouter()

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

function navigateToRule() {
  router.push({ name: 'logic-rule', params: { ruleId: props.rule.id } })
}
</script>

<template>
  <button
    type="button"
    class="rule-card-compact"
    :class="{
      'rule-card-compact--active': isActive,
      'rule-card-compact--error': hasError,
    }"
    :aria-label="statusAriaLabel"
    aria-live="polite"
    @click="navigateToRule"
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
  </button>
</template>

<style scoped>
.rule-card-compact {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
  width: 100%;
}

.rule-card-compact:hover {
  border-color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
}

.rule-card-compact:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 2px;
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
