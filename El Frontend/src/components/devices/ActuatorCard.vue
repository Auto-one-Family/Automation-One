<script setup lang="ts">
/**
 * ActuatorCard — Unified actuator card for config and monitor views
 *
 * Config mode: Name, type, ESP-ID, GPIO, state badge, toggle, settings hint
 * Monitor mode: State badge (read-only), PWM value for PWM actuators, no toggle,
 *               linked rules with status dots, last execution with trigger reason
 */
import { computed } from 'vue'
import {
  Power, ChevronRight, WifiOff,
  ToggleRight, Waves, GitBranch, Fan, Flame, Lightbulb, Cog, Activity,
} from 'lucide-vue-next'
import type { ActuatorWithContext } from '@/composables/useZoneGrouping'
import type { LogicRule, ExecutionHistoryItem } from '@/types/logic'
import { formatConditionShort } from '@/types/logic'
import { formatRelativeTime, ZONE_STALE_THRESHOLD_MS } from '@/utils/formatters'
import { getActuatorTypeInfo } from '@/utils/labels'

interface Props {
  actuator: ActuatorWithContext
  mode: 'monitor' | 'config'
  linkedRules?: LogicRule[]
  lastExecution?: ExecutionHistoryItem | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  configure: [actuator: ActuatorWithContext]
  toggle: [espId: string, gpio: number, currentState: boolean]
}>()

const displayName = computed(() =>
  props.actuator.name || `GPIO ${props.actuator.gpio}`
)

// Scope badge (T13-R3 WP4): only show for non-default scopes with DB config
const scopeBadge = computed(() => {
  const scope = props.actuator.device_scope
  if (!scope || scope === 'zone_local') return null
  if (scope === 'multi_zone') return { text: 'Multi-Zone', cls: 'actuator-card__scope-badge--multi-zone' }
  if (scope === 'mobile') return { text: 'Mobil', cls: 'actuator-card__scope-badge--mobile' }
  return null
})

const scopeTooltip = computed(() => {
  if (scopeBadge.value?.text !== 'Multi-Zone') return ''
  const zones = props.actuator.assigned_zones
  if (!zones?.length) return ''
  return `Bedient: ${zones.join(', ')}`
})

// 6.2-A: ESP-Offline indicator (parity with SensorCard)
const isEspOffline = computed(() =>
  !!props.actuator.esp_state && props.actuator.esp_state !== 'OPERATIONAL'
)

// 6.2-B: Stale detection — ESP heartbeat older than threshold
const isStale = computed(() => {
  const lastSeen = props.actuator.last_seen
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() > ZONE_STALE_THRESHOLD_MS
})

// 6.2-C: Type-specific icon via shared getActuatorTypeInfo (same source as ActuatorSatellite)
const actuatorIcon = computed(() => {
  const iconName = getActuatorTypeInfo(props.actuator.actuator_type).icon.toLowerCase()
  if (iconName.includes('toggle')) return ToggleRight
  if (iconName.includes('waves') || iconName.includes('pump')) return Waves
  if (iconName.includes('branch') || iconName.includes('valve')) return GitBranch
  if (iconName.includes('fan')) return Fan
  if (iconName.includes('flame') || iconName.includes('heater')) return Flame
  if (iconName.includes('lightbulb') || iconName.includes('light')) return Lightbulb
  if (iconName.includes('cog') || iconName.includes('motor')) return Cog
  if (iconName.includes('activity')) return Activity
  return Power
})

// Fix-U: Actuator-level stale detection (separate from ESP-stale)
const isActuatorStale = computed(() => {
  const lastCmd = props.actuator.last_command_at
  if (!lastCmd) return true
  const ts = new Date(lastCmd).getTime()
  if (ts < new Date('2000-01-01').getTime()) return true
  return false
})

const lastCommandAge = computed(() => {
  const lastCmd = props.actuator.last_command_at
  if (!lastCmd) return 'Nie bestaetigt'
  const ts = new Date(lastCmd).getTime()
  if (ts < new Date('2000-01-01').getTime()) return 'Nie bestaetigt'
  return formatRelativeTime(lastCmd)
})

// Phase 2.3: "Bedient Subzone(n)" — fallback "Zone-weit"
const servedSubzoneLabel = computed(() => {
  const name = props.actuator.subzone_name ?? ''
  const id = props.actuator.subzone_id ?? ''
  if (typeof name === 'string' && name.trim()) return name
  if (typeof id === 'string' && id.trim()) return id
  return 'Zone-weit'
})

// Monitor-mode: show max 2 rules
const displayedRules = computed(() => (props.linkedRules ?? []).slice(0, 2))

// Monitor-mode: PWM percentage badge
const pwmPercent = computed(() => {
  const val = props.actuator.pwm_value
  if (val != null && val > 0) return `${Math.round(val * 100)}%`
  return null
})

function handleClick() {
  if (props.mode === 'config') {
    emit('configure', props.actuator)
  }
}

function handleToggle(event: Event) {
  event.stopPropagation()
  emit('toggle', props.actuator.esp_id, props.actuator.gpio, props.actuator.state)
}
</script>

<template>
  <div
    :class="[
      'actuator-card',
      `actuator-card--${mode}`,
      {
        'actuator-card--emergency': actuator.emergency_stopped,
        'actuator-card--offline': isEspOffline,
        'actuator-card--stale': isStale && !isEspOffline,
      },
    ]"
    @click="handleClick"
  >
    <div class="actuator-card__header">
      <div
        :class="[
          'actuator-card__icon',
          actuator.state ? 'actuator-card__icon--on' : 'actuator-card__icon--off',
        ]"
      >
        <component :is="actuatorIcon" :class="['w-5 h-5', actuator.state ? 'text-green-400' : 'text-dark-400']" />
      </div>
      <div class="actuator-card__info">
        <p class="actuator-card__name">{{ displayName }}</p>
        <p class="actuator-card__meta">{{ actuator.esp_id }} · {{ getActuatorTypeInfo(actuator.actuator_type).label }}</p>
        <p class="actuator-card__served">
          <span class="actuator-card__served-label">Bedient:</span>
          <span class="actuator-card__served-value">{{ servedSubzoneLabel }}</span>
        </p>
      </div>
      <ChevronRight
        v-if="mode === 'config'"
        class="w-4 h-4 text-dark-500 flex-shrink-0"
      />
    </div>
    <div class="actuator-card__body">
      <div class="actuator-card__badges">
        <span :class="['badge', actuator.state ? 'badge-success' : 'badge-gray']">
          {{ actuator.state ? 'Ein' : 'Aus' }}
        </span>
        <span v-if="mode === 'monitor' && pwmPercent" class="actuator-card__pwm-badge">
          {{ pwmPercent }}
        </span>
        <span v-if="actuator.emergency_stopped" class="badge badge-danger">
          Not-Stopp
        </span>
        <span v-if="scopeBadge" :class="['actuator-card__scope-badge', scopeBadge.cls]" :title="scopeTooltip">{{ scopeBadge.text }}</span>
        <span v-if="isEspOffline" class="actuator-card__badge actuator-card__badge--offline">
          <WifiOff :size="12" /> ESP offline
        </span>
        <span
          v-if="(isActuatorStale || isStale) && lastCommandAge"
          class="actuator-card__badge actuator-card__badge--stale"
        >
          {{ lastCommandAge }}
        </span>
      </div>
      <span v-if="mode === 'monitor' && actuator.actuator_type === 'pwm' && !pwmPercent" class="actuator-card__pwm">
        PWM: 0%
      </span>
      <button
        v-if="mode !== 'monitor'"
        class="btn-secondary btn-sm flex-shrink-0 touch-target"
        :disabled="actuator.emergency_stopped || isEspOffline || isStale"
        :title="isEspOffline ? 'ESP ist offline' : isStale ? 'Status veraltet' : ''"
        @click="handleToggle"
      >
        {{ actuator.state ? 'Ausschalten' : 'Einschalten' }}
      </button>
    </div>

    <!-- Monitor-mode: Linked rules -->
    <div v-if="mode === 'monitor' && linkedRules?.length" class="actuator-card__rules">
      <div v-for="rule in displayedRules" :key="rule.id" class="actuator-card__rule-item">
        <span
          class="actuator-card__rule-dot"
          :class="{
            'is-active': rule.enabled,
            'is-error': rule.last_execution_success === false,
          }"
        />
        <span class="actuator-card__rule-name">{{ rule.name }}</span>
        <span class="actuator-card__rule-condition">{{ formatConditionShort(rule) }}</span>
      </div>
      <router-link
        v-if="linkedRules.length > 2"
        to="/logic"
        class="actuator-card__rules-more"
      >
        +{{ linkedRules.length - 2 }} weitere
      </router-link>
    </div>

    <!-- Monitor-mode: Last execution -->
    <div v-if="mode === 'monitor' && lastExecution" class="actuator-card__last-execution">
      Zuletzt: {{ formatRelativeTime(lastExecution.triggered_at) }}
      <span v-if="lastExecution.trigger_reason" class="actuator-card__execution-reason">
        ({{ lastExecution.trigger_reason }})
      </span>
    </div>
  </div>
</template>

<style scoped>
.actuator-card {
  cursor: pointer;
  transition: all var(--transition-fast);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-tertiary);
  padding: var(--space-3);
}

.actuator-card:hover {
  border-color: var(--color-border-hover, rgba(255, 255, 255, 0.12));
}

.actuator-card--emergency {
  border-color: rgba(248, 113, 113, 0.3);
}

.actuator-card--offline {
  opacity: 0.5;
}

.actuator-card--stale {
  opacity: 0.7;
  border-left: 3px solid var(--color-warning);
}

.actuator-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.actuator-card__icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.actuator-card__icon--on {
  background: rgba(34, 197, 94, 0.15);
}

.actuator-card__icon--off {
  background: var(--color-bg-quaternary, rgba(255, 255, 255, 0.04));
}

.actuator-card__info {
  flex: 1;
  min-width: 0;
}

.actuator-card__name {
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actuator-card__meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actuator-card__served {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin-top: var(--space-1);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 0;
}

.actuator-card__served-label {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.actuator-card__served-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.actuator-card__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.actuator-card__badges {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.actuator-card__pwm {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.actuator-card__pwm-badge {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  background: var(--color-bg-quaternary, rgba(255, 255, 255, 0.04));
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

/* Rules section */
.actuator-card__rules {
  border-top: 1px solid var(--glass-border);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.actuator-card__rule-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  min-width: 0;
}

.actuator-card__rule-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
}

.actuator-card__rule-dot.is-active {
  background: var(--color-status-good);
}

.actuator-card__rule-dot.is-error {
  background: var(--color-status-alarm);
}

.actuator-card__rule-name {
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.actuator-card__rule-condition {
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 2;
  min-width: 0;
}

.actuator-card__rules-more {
  font-size: var(--text-xs);
  color: var(--color-iridescent-2);
  text-decoration: none;
}

.actuator-card__rules-more:hover {
  text-decoration: underline;
}

/* Last execution */
.actuator-card__last-execution {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actuator-card__execution-reason {
  color: var(--color-text-secondary);
}

/* Scope badges (T13-R3 WP4) */
.actuator-card__scope-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
  cursor: default;
}

.actuator-card__scope-badge--multi-zone {
  background: rgba(96, 165, 250, 0.2);
  color: rgb(96, 165, 250);
}

.actuator-card__scope-badge--mobile {
  background: rgba(251, 146, 60, 0.2);
  color: rgb(251, 146, 60);
}

/* Offline badge */
.actuator-card__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.actuator-card__badge--offline {
  color: var(--color-text-muted);
}

.actuator-card__badge--stale {
  color: var(--color-warning);
}
</style>
