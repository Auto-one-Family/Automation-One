<script setup lang="ts">
/**
 * ZoneRulesSection — Regeln für diese Zone (Monitor L2)
 *
 * Displays rules that reference sensors/actuators in the selected zone.
 * Data: logicStore.getRulesForZone(zoneId)
 * Click on rule → navigate to /logic/:ruleId
 * Bei >10 Regeln: nur erste 5 + Link "Weitere X Regeln — Im Regeln-Tab anzeigen"
 */
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Zap, ExternalLink } from 'lucide-vue-next'
import { useLogicStore } from '@/shared/stores/logic.store'
import RuleCardCompact from '@/components/logic/RuleCardCompact.vue'
import type { LogicRule } from '@/types/logic'

const RULES_VISIBLE_THRESHOLD = 10
const MAX_DISPLAYED_WHEN_OVER = 5

interface Props {
  zoneId: string | null
}

const props = defineProps<Props>()
const logicStore = useLogicStore()
const router = useRouter()

const rulesForZone = computed<LogicRule[]>(() => {
  if (!props.zoneId) return []
  return logicStore.getRulesForZone(props.zoneId)
})

const displayedRules = computed<LogicRule[]>(() => {
  const rules = rulesForZone.value
  if (rules.length <= RULES_VISIBLE_THRESHOLD) return rules
  return rules.slice(0, MAX_DISPLAYED_WHEN_OVER)
})

const hasMoreRules = computed(() => rulesForZone.value.length > RULES_VISIBLE_THRESHOLD)

const hiddenRulesCount = computed(() =>
  hasMoreRules.value ? rulesForZone.value.length - MAX_DISPLAYED_WHEN_OVER : 0
)

function goToLogicTab() {
  router.push({ name: 'logic' })
}

function isRuleActive(ruleId: string): boolean {
  return logicStore.isRuleActive(ruleId)
}

onMounted(() => {
  if (logicStore.rules.length === 0) {
    logicStore.fetchRules()
  }
})

watch(() => props.zoneId, (zoneId) => {
  if (zoneId && logicStore.rules.length === 0) {
    logicStore.fetchRules()
  }
})
</script>

<template>
  <section v-if="zoneId" class="zone-rules-section monitor-section">
    <div class="zone-rules-section__header">
      <h3 class="monitor-section__title">Zonenweite Regeln ({{ rulesForZone.length }})</h3>
      <span class="zone-rules-section__scope">Wirken auf ganze Zone</span>
    </div>

    <!-- Empty State -->
    <div
      v-if="rulesForZone.length === 0"
      class="zone-rules-section__empty"
    >
      <Zap class="zone-rules-section__empty-icon" />
      <p class="zone-rules-section__empty-text">Keine Automatisierungen für diese Zone</p>
      <p class="zone-rules-section__empty-hint">
        Regeln können im Regeln-Tab erstellt werden
      </p>
      <button
        type="button"
        class="zone-rules-section__empty-link"
        aria-label="Zum Regeln-Tab navigieren"
        @click="goToLogicTab"
      >
        <ExternalLink class="zone-rules-section__empty-link-icon" />
        Zum Regeln-Tab
      </button>
    </div>

    <!-- Rules Grid -->
    <div v-else class="zone-rules-section__content">
      <ul
        class="zone-rules-section__grid monitor-card-grid"
        role="list"
      >
        <li
          v-for="rule in displayedRules"
          :key="rule.id"
          class="zone-rules-section__grid-item"
        >
          <RuleCardCompact
            :rule="rule"
            :is-active="isRuleActive(rule.id)"
            :lifecycle="logicStore.getLifecycleEntry(rule.id)"
            :quick-actions="true"
          />
        </li>
      </ul>
      <div
        v-if="hasMoreRules"
        class="zone-rules-section__more"
      >
        <span class="zone-rules-section__more-text">
          Weitere {{ hiddenRulesCount }} Regeln
        </span>
        <button
          type="button"
          class="zone-rules-section__more-link"
          :aria-label="`Weitere ${hiddenRulesCount} Regeln im Regeln-Tab anzeigen`"
          @click="goToLogicTab"
        >
          <ExternalLink class="zone-rules-section__more-icon" />
          Im Regeln-Tab anzeigen
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.zone-rules-section.monitor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: 0;
  padding: var(--space-3);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--color-info);
  border-radius: var(--radius-md);
  background: var(--glass-bg);
}

.zone-rules-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.monitor-section__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin: 0;
}

.zone-rules-section__scope {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
}

.zone-rules-section__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.zone-rules-section__grid {
  list-style: none;
  margin: 0;
  padding: 0;
}

.zone-rules-section__grid.monitor-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  gap: var(--space-3);
}

.zone-rules-section__grid-item {
  min-width: 0;
}

.zone-rules-section__more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
}

.zone-rules-section__more-text {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.zone-rules-section__more-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-iridescent-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast);
}

.zone-rules-section__more-link:hover {
  color: var(--color-iridescent-1);
}

.zone-rules-section__more-link:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 2px;
}

.zone-rules-section__more-icon {
  width: 14px;
  height: 14px;
}

.zone-rules-section__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  background: var(--color-bg-secondary);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}

.zone-rules-section__empty-icon {
  width: 32px;
  height: 32px;
}

.zone-rules-section__empty-text {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  margin: 0;
}

.zone-rules-section__empty-hint {
  font-size: var(--text-xs);
  margin: 0;
}

.zone-rules-section__empty-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-iridescent-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  margin-top: var(--space-2);
  transition: color var(--transition-fast);
}

.zone-rules-section__empty-link:hover {
  color: var(--color-iridescent-1);
}

.zone-rules-section__empty-link:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 2px;
}

.zone-rules-section__empty-link-icon {
  width: 14px;
  height: 14px;
}
</style>
