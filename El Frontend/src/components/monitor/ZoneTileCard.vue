<script setup lang="ts">
import { computed } from 'vue'
import { formatAggregatedValue } from '@/utils/sensorDefaults'
import { formatRelativeTime } from '@/utils/formatters'
import { CheckCircle2, AlertTriangle, Minus, XCircle, Clock, Zap } from 'lucide-vue-next'
import type { ZoneKPI, ZoneHealthStatus } from '@/composables/useZoneKPIs'
import { HEALTH_STATUS_CONFIG as DEFAULT_HEALTH_CONFIG } from '@/composables/useZoneKPIs'
import type { LogicRule } from '@/types/logic'

interface Props {
  zone: ZoneKPI
  isStale?: boolean
  healthConfig?: Record<ZoneHealthStatus, { label: string; colorClass: string }>
  rules?: LogicRule[]
  totalRuleCount?: number
  isRuleActive?: (ruleId: string) => boolean
}

const props = withDefaults(defineProps<Props>(), {
  isStale: false,
  healthConfig: () => DEFAULT_HEALTH_CONFIG,
  rules: () => [],
  totalRuleCount: 0,
})

const hasAnyActiveRule = computed(() => {
  if (!props.isRuleActive || !props.rules.length) return false
  return props.rules.some(r => props.isRuleActive!(r.id))
})

const extraRuleCount = computed(() => {
  return Math.max(0, props.totalRuleCount - props.rules.length)
})

const emit = defineEmits<{
  (e: 'click', zoneId: string): void
}>()

function handleClick(): void {
  emit('click', props.zone.zoneId)
}
</script>

<template>
  <button
    :class="['monitor-zone-tile', `monitor-zone-tile--${zone.healthStatus}`]"
    @click="handleClick"
  >
    <!-- Header: Zone Name + Status Ampel -->
    <div class="monitor-zone-tile__header">
      <h3 class="monitor-zone-tile__name">{{ zone.zoneName }}</h3>
      <span :class="['monitor-zone-tile__status', healthConfig[zone.healthStatus].colorClass]">
        <CheckCircle2 v-if="zone.healthStatus === 'ok'" class="w-3.5 h-3.5" />
        <AlertTriangle v-else-if="zone.healthStatus === 'warning'" class="w-3.5 h-3.5" />
        <Minus v-else-if="zone.healthStatus === 'empty'" class="w-3.5 h-3.5" />
        <XCircle v-else class="w-3.5 h-3.5" />
        <span>{{ healthConfig[zone.healthStatus].label }}</span>
      </span>
    </div>
    <!-- Health Reason (only for warning/alarm) -->
    <div v-if="zone.healthReason" class="monitor-zone-tile__reason">
      {{ zone.healthReason }}
    </div>

    <!-- KPIs from aggregateZoneSensors -->
    <slot name="kpis">
      <div v-if="zone.aggregation.sensorTypes.length > 0" class="monitor-zone-tile__kpis">
        <div
          v-for="st in zone.aggregation.sensorTypes"
          :key="st.type"
          class="monitor-zone-tile__kpi"
        >
          <span class="monitor-zone-tile__kpi-label">{{ st.label }}</span>
          <span class="monitor-zone-tile__kpi-value">
            {{ formatAggregatedValue(st, zone.aggregation.deviceCount) }}
          </span>
        </div>
      </div>
      <div v-else class="monitor-zone-tile__kpis-empty">
        Keine Sensordaten
      </div>
    </slot>

    <!-- Extra slot (for Phase 3 mini-widgets) -->
    <slot name="extra" />

    <!-- Rules Summary (L1 compact, max 2 rules) -->
    <div v-if="totalRuleCount > 0" class="monitor-zone-tile__rules-summary">
      <div class="monitor-zone-tile__rules-header">
        <Zap class="w-3 h-3" />
        <span :class="{ 'monitor-zone-tile__rules-label--active': hasAnyActiveRule }">
          {{ totalRuleCount }} {{ totalRuleCount === 1 ? 'Regel' : 'Regeln' }}
        </span>
      </div>
      <div v-for="rule in rules" :key="rule.id" :class="['monitor-zone-tile__rule', { 'monitor-zone-tile__rule--active': isRuleActive?.(rule.id) }]">
        <span class="monitor-zone-tile__rule-name">{{ rule.name }}</span>
      </div>
      <span v-if="extraRuleCount > 0" class="monitor-zone-tile__rules-extra">
        + {{ extraRuleCount }} weitere
      </span>
    </div>

    <!-- Footer: ESP-Count + Sensor/Actuator Counts + Last Activity -->
    <slot name="footer">
      <div class="monitor-zone-tile__footer">
        <div class="monitor-zone-tile__counts">
          <span class="monitor-zone-tile__count">
            {{ zone.totalDevices > 0 ? `${zone.onlineDevices}/${zone.totalDevices} online` : '—' }}
          </span>
          <span :class="['monitor-zone-tile__count', {
            'monitor-zone-tile__count--ok': zone.activeSensors === zone.sensorCount && zone.sensorCount > 0,
            'monitor-zone-tile__count--warn': zone.activeSensors < zone.sensorCount && zone.activeSensors > 0,
            'monitor-zone-tile__count--alarm': zone.sensorCount > 0 && zone.activeSensors === 0,
          }]">
            {{ zone.activeSensors }}/{{ zone.sensorCount }} Sensoren
          </span>
          <span :class="['monitor-zone-tile__count', {
            'monitor-zone-tile__count--ok': zone.activeActuators > 0,
          }]">
            {{ zone.actuatorCount }} {{ zone.actuatorCount === 1 ? 'Aktor' : 'Aktoren' }}<template v-if="zone.activeActuators > 0"> · {{ zone.activeActuators }} aktiv</template>
          </span>
          <span v-if="zone.mobileGuestCount > 0" class="monitor-zone-tile__count monitor-zone-tile__count--mobile">
            + {{ zone.mobileGuestCount }} mobil
          </span>
        </div>
        <div class="monitor-zone-tile__activity" :class="{ 'monitor-zone-tile__activity--stale': isStale }">
          <Clock class="w-3 h-3" />
          <span>{{ zone.lastActivity ? formatRelativeTime(zone.lastActivity) : 'Keine Daten' }}</span>
        </div>
      </div>
    </slot>
  </button>
</template>

<style scoped>
.monitor-zone-tile {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border-left: 3px solid var(--glass-border);
  /* Reset button defaults */
  font: inherit;
  color: inherit;
  text-align: left;
  width: 100%;
}

.monitor-zone-tile:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 2px;
}

.monitor-zone-tile--ok {
  border-left-color: var(--color-success);
}

.monitor-zone-tile--warning {
  border-left-color: var(--color-warning);
}

.monitor-zone-tile--alarm {
  border-left-color: var(--color-error);
}

.monitor-zone-tile:hover {
  border-color: var(--color-accent);
  border-left-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.monitor-zone-tile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.monitor-zone-tile__name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* Status Ampel: Farbe + Text + Icon (doppelte Kodierung) */
.monitor-zone-tile__status {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.zone-status--ok {
  color: var(--color-success);
}

.zone-status--warning {
  color: var(--color-warning);
}

.zone-status--alarm {
  color: var(--color-error);
}

.zone-status--empty {
  color: var(--color-text-muted);
}

.monitor-zone-tile--empty {
  opacity: 0.7;
  border-style: dashed;
}

.monitor-zone-tile__reason {
  font-size: var(--text-xs, 11px);
  color: var(--color-text-muted);
  margin-top: calc(-1 * var(--space-2));
  padding: 0 var(--space-1);
}

.monitor-zone-tile--warning .monitor-zone-tile__reason {
  color: var(--color-warning);
  opacity: 0.85;
}

.monitor-zone-tile--alarm .monitor-zone-tile__reason {
  color: var(--color-error);
  opacity: 0.85;
}

/* KPIs */
.monitor-zone-tile__kpis {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.monitor-zone-tile__kpi {
  display: flex;
  flex-direction: column;
  gap: 1px; /* no token for 1px — smallest is --space-1 (4px) */
}

.monitor-zone-tile__kpi-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.monitor-zone-tile__kpi-value {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.monitor-zone-tile__kpis-empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}

/* Footer: counts + activity — margin-top: auto pushes footer to bottom in equal-height tiles */
.monitor-zone-tile__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--glass-border);
  margin-top: auto;
}

.monitor-zone-tile__counts {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-xs);
}

.monitor-zone-tile__count {
  color: var(--color-text-muted);
}

.monitor-zone-tile__count--ok {
  color: var(--color-success);
}

.monitor-zone-tile__count--warn {
  color: var(--color-warning);
}

.monitor-zone-tile__count--alarm {
  color: var(--color-error);
}

.monitor-zone-tile__count--mobile {
  color: var(--color-text-secondary);
  font-style: italic;
}

.monitor-zone-tile__activity {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.monitor-zone-tile__activity--stale {
  color: var(--color-warning);
}

/* Rules Summary */
.monitor-zone-tile__rules-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-xs);
}

.monitor-zone-tile__rules-header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
}

.monitor-zone-tile__rules-label--active {
  color: var(--color-info);
}

.monitor-zone-tile__rule {
  padding-left: calc(12px + var(--space-1)); /* icon width + gap alignment */
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
}

.monitor-zone-tile__rule--active {
  color: var(--color-text-secondary);
  text-shadow: 0 0 8px rgba(96, 165, 250, 0.4);
}

.monitor-zone-tile__rule-name {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.monitor-zone-tile__rules-extra {
  padding-left: calc(12px + var(--space-1));
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
