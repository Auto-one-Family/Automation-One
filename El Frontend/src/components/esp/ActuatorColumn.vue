<script setup lang="ts">
/**
 * ActuatorColumn Component
 *
 * Extracted from ESPOrbitalLayout: Renders the right column of actuator satellites.
 * Handles actuator selection.
 *
 * Used in:
 * - ESPOrbitalLayout (right column)
 * - Future: DeviceDetailView standalone actuator panel
 */

import { computed } from 'vue'
import { Plus, Workflow, ExternalLink } from 'lucide-vue-next'
import ActuatorSatellite from './ActuatorSatellite.vue'
import RuleCardCompact from '@/components/logic/RuleCardCompact.vue'
import { useLogicStore } from '@/shared/stores/logic.store'
import type { LogicRule } from '@/types/logic'

/** Actuator data shape from device.actuators array */
export interface ActuatorItem {
  gpio: number
  actuator_type: string
  /** Original ESP32 hardware type (relay, pump, valve, pwm) for icon lookup */
  hardware_type?: string | null
  name: string | null
  state: boolean
  pwm_value?: number
  last_command_at?: string | null
  emergency_stopped?: boolean
  device_scope?: 'zone_local' | 'multi_zone' | 'mobile' | null
  assigned_zones?: string[] | null
}

interface ActuatorRuntimeInfo {
  lastTriggeredAt?: string | null
  triggerReason?: string | null
  triggerRuleName?: string | null
}

interface Props {
  espId: string
  actuators: ActuatorItem[]
  actuatorRuntimeMap?: Record<number, ActuatorRuntimeInfo | undefined>
  selectedGpio?: number | null
  showConnections?: boolean
  layout?: 'stack' | 'grid'
  showRulesSection?: boolean
  maxDisplayedRules?: number
}

const props = withDefaults(defineProps<Props>(), {
  actuatorRuntimeMap: () => ({}),
  selectedGpio: null,
  showConnections: true,
  layout: 'stack',
  showRulesSection: false,
  maxDisplayedRules: 4,
})

const emit = defineEmits<{
  'actuator-click': [gpio: number]
}>()

const logicStore = useLogicStore()

const linkedRules = computed<LogicRule[]>(() => {
  if (!props.showRulesSection || props.actuators.length === 0) return []

  const byId = new Map<string, LogicRule>()
  for (const actuator of props.actuators) {
    const rulesForActuator = logicStore.getRulesForActuator(props.espId, actuator.gpio)
    for (const rule of rulesForActuator) {
      if (!byId.has(rule.id)) byId.set(rule.id, rule)
    }
  }

  return [...byId.values()].sort((a, b) => {
    const prio = (a.priority ?? 0) - (b.priority ?? 0)
    if (prio !== 0) return prio
    return a.name.localeCompare(b.name)
  })
})

const displayedRules = computed<LogicRule[]>(() => linkedRules.value.slice(0, props.maxDisplayedRules))
const hiddenRulesCount = computed<number>(() => Math.max(0, linkedRules.value.length - displayedRules.value.length))
</script>

<template>
  <div
    :class="[
      'actuator-column',
      {
        'actuator-column--empty': actuators.length === 0,
        'actuator-column--grid': layout === 'grid',
      }
    ]"
  >
    <ActuatorSatellite
      v-for="actuator in actuators"
      :key="`actuator-${actuator.gpio}`"
      :esp-id="espId"
      :gpio="actuator.gpio"
      :actuator-type="actuator.actuator_type"
      :hardware-type="actuator.hardware_type"
      :name="actuator.name"
      :state="actuator.state"
      :pwm-value="actuator.pwm_value"
      :last-command-at="actuator.last_command_at"
      :last-triggered-at="actuatorRuntimeMap[actuator.gpio]?.lastTriggeredAt"
      :trigger-reason="actuatorRuntimeMap[actuator.gpio]?.triggerReason"
      :trigger-rule-name="actuatorRuntimeMap[actuator.gpio]?.triggerRuleName"
      :emergency-stopped="actuator.emergency_stopped"
      :device-scope="actuator.device_scope"
      :assigned-zones="actuator.assigned_zones ?? undefined"
      :selected="selectedGpio === actuator.gpio"
      :show-connections="showConnections"
      class="actuator-column__satellite"
      @click="emit('actuator-click', actuator.gpio)"
    />

    <!-- Empty state -->
    <div v-if="actuators.length === 0" class="actuator-column__empty-slot">
      <Plus class="w-3 h-3" />
      <span>Aktoren</span>
    </div>

    <section
      v-if="showRulesSection"
      class="actuator-column__rules-section"
      aria-label="Regeln für diese Aktoren"
    >
      <header class="actuator-column__rules-header">
        <div class="actuator-column__rules-title-wrap">
          <Workflow class="actuator-column__rules-icon" />
          <span class="actuator-column__rules-title">Regeln für Aktoren</span>
          <span class="actuator-column__rules-count">{{ linkedRules.length }}</span>
        </div>
        <RouterLink to="/logic" class="actuator-column__rules-link">
          <ExternalLink class="actuator-column__rules-link-icon" />
          Regeln
        </RouterLink>
      </header>

      <div v-if="displayedRules.length > 0" class="actuator-column__rules-list">
        <RuleCardCompact
          v-for="rule in displayedRules"
          :key="rule.id"
          :rule="rule"
          :is-active="logicStore.isRuleActive(rule.id)"
          :lifecycle="logicStore.getLifecycleEntry(rule.id)"
          :quick-actions="true"
        />
      </div>

      <div v-else class="actuator-column__rules-empty">
        Keine verknüpften Regeln
      </div>

      <div v-if="hiddenRulesCount > 0" class="actuator-column__rules-more">
        +{{ hiddenRulesCount }} weitere im Regeln-Tab
      </div>
    </section>
  </div>
</template>

<style scoped>
.actuator-column {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: stretch;
  width: 100%;
  flex-shrink: 0;
}

/*
 * Optional grid layout for detail/zoom states.
 * Explicitly also targets wrapper class combination to avoid accidental
 * flex override from parent layout classes.
 */
.actuator-column--grid,
.actuator-column--grid.esp-horizontal-layout__column {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
}

.actuator-column--empty {
  width: 56px;
  grid-template-columns: 1fr;
}

.actuator-column__satellite {
  position: relative !important;
  transform: none !important;
  width: 100%;
  animation: satellite-appear 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes satellite-appear {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.actuator-column__empty-slot {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.75rem 0.5rem;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-sm);
  color: rgba(255, 255, 255, 0.2);
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-height: 56px;
}

.actuator-column__empty-slot:hover {
  border-color: rgba(96, 165, 250, 0.2);
  color: rgba(255, 255, 255, 0.35);
}

.actuator-column__rules-section {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
}

.actuator-column__rules-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.actuator-column__rules-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.actuator-column__rules-icon {
  width: 14px;
  height: 14px;
  color: var(--color-iridescent-2);
  flex-shrink: 0;
}

.actuator-column__rules-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.actuator-column__rules-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  border: 1px solid var(--glass-border);
  background: var(--color-bg-tertiary);
  font-size: var(--text-xxs);
  color: var(--color-text-muted);
}

.actuator-column__rules-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  text-decoration: none;
  color: var(--color-iridescent-2);
  font-size: var(--text-xs);
  font-weight: 500;
}

.actuator-column__rules-link:hover {
  color: var(--color-iridescent-1);
}

.actuator-column__rules-link-icon {
  width: 12px;
  height: 12px;
}

.actuator-column__rules-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
}

.actuator-column__rules-empty {
  padding: var(--space-3);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  text-align: center;
}

.actuator-column__rules-more {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>
