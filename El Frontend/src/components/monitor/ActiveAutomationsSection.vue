<script setup lang="ts">
/**
 * ActiveAutomationsSection — Aktive Automatisierungen (Monitor L1)
 *
 * Displays all enabled rules across zones. Compact overview: count + top 5 rules + link to Logic tab.
 * Data: logicStore.enabledRules (no zone filter on L1)
 * Click on rule → navigate to /logic/:ruleId
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Zap, ExternalLink } from 'lucide-vue-next'
import { useLogicStore } from '@/shared/stores/logic.store'
import RuleCardCompact from '@/components/logic/RuleCardCompact.vue'
import type { LogicRule } from '@/types/logic'

const MAX_DISPLAYED = 5

const logicStore = useLogicStore()
const router = useRouter()

/** Top rules: errors first, then by priority, then name. Max 5. */
const topRules = computed<LogicRule[]>(() => {
  const enabled = logicStore.enabledRules
  const sorted = [...enabled].sort((a, b) => {
    const aErr = a.last_execution_success === false ? 0 : 1
    const bErr = b.last_execution_success === false ? 0 : 1
    if (aErr !== bErr) return aErr - bErr
    const aPrio = a.priority ?? 0
    const bPrio = b.priority ?? 0
    if (aPrio !== bPrio) return aPrio - bPrio
    return (a.name || '').localeCompare(b.name || '')
  })
  return sorted.slice(0, MAX_DISPLAYED)
})

const enabledCount = computed(() => logicStore.enabledRules.length)

const hasMoreRules = computed(() => enabledCount.value > MAX_DISPLAYED)

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
</script>

<template>
  <section class="active-automations-section monitor-section">
    <h3 class="monitor-section__title">Aktive Automatisierungen ({{ enabledCount }})</h3>

    <!-- Empty State -->
    <div
      v-if="enabledCount === 0"
      class="active-automations-section__empty"
    >
      <Zap class="active-automations-section__empty-icon" />
      <p class="active-automations-section__empty-text">Keine aktiven Automatisierungen</p>
      <p class="active-automations-section__empty-hint">
        Regeln können im Regeln-Tab erstellt und aktiviert werden
      </p>
      <button
        type="button"
        class="active-automations-section__empty-link"
        @click="goToLogicTab"
      >
        <ExternalLink class="active-automations-section__empty-link-icon" />
        Zum Regeln-Tab
      </button>
    </div>

    <!-- Rules Grid -->
    <div v-else class="active-automations-section__content">
      <ul
        class="active-automations-section__grid monitor-card-grid"
        role="list"
      >
        <li
          v-for="rule in topRules"
          :key="rule.id"
          class="active-automations-section__grid-item"
        >
          <RuleCardCompact
            :rule="rule"
            :is-active="isRuleActive(rule.id)"
            :zone-names="logicStore.getZonesForRule(rule)"
            :lifecycle="logicStore.getLifecycleEntry(rule.id)"
            :quick-actions="true"
          />
        </li>
      </ul>
      <div class="active-automations-section__footer">
        <button
          type="button"
          class="active-automations-section__link"
          :aria-label="hasMoreRules ? `Alle ${enabledCount} Regeln anzeigen` : 'Alle Regeln im Regeln-Tab bearbeiten'"
          @click="goToLogicTab"
        >
          <ExternalLink class="active-automations-section__link-icon" />
          {{ hasMoreRules ? `Alle ${enabledCount} Regeln anzeigen` : 'Alle Regeln' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.active-automations-section {
  margin-bottom: var(--space-10);
}

.active-automations-section__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.active-automations-section__footer {
  display: flex;
  justify-content: flex-start;
}

.active-automations-section__link {
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

.active-automations-section__link:hover {
  color: var(--color-iridescent-1);
}

.active-automations-section__link:focus-visible,
.active-automations-section__empty-link:focus-visible {
  outline: 2px solid var(--color-iridescent-2);
  outline-offset: 2px;
}

.active-automations-section__link-icon {
  width: 14px;
  height: 14px;
}

.active-automations-section__empty {
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

.active-automations-section__empty-icon {
  width: 32px;
  height: 32px;
}

.active-automations-section__empty-text {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  margin: 0;
}

.active-automations-section__empty-hint {
  font-size: var(--text-xs);
  margin: 0;
}

.active-automations-section__empty-link {
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

.active-automations-section__empty-link:hover {
  color: var(--color-iridescent-1);
}

.active-automations-section__empty-link-icon {
  width: 14px;
  height: 14px;
}

/* Semantische Liste: Grid-Layout beibehalten, Listenstil aus */
.active-automations-section__grid {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* Responsive: bei schmalem Viewport (z. B. 320px) eine Spalte, lesbar */
.active-automations-section__grid.monitor-card-grid {
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
}
</style>
