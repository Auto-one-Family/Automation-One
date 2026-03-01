<script setup lang="ts">
/**
 * LinkedRulesSection — Display of Logic Rules linked to a sensor/actuator
 *
 * Shows which rules reference this device (sensor as trigger, actuator as target).
 * Lazy-loads rules from logic store on mount if not yet fetched.
 * Click on a rule navigates to LogicView with deep-link.
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Link2, ArrowRight, ExternalLink } from 'lucide-vue-next'
import { useLogicStore } from '@/shared/stores/logic.store'

interface Props {
  espId: string
  gpio: number
  deviceType: 'sensor' | 'actuator'
}

const props = defineProps<Props>()
const router = useRouter()
const logicStore = useLogicStore()

const linkedRules = computed(() => {
  return logicStore.connections.filter((c) => {
    if (props.deviceType === 'sensor') {
      return c.sourceEspId === props.espId && c.sourceGpio === props.gpio
    }
    return c.targetEspId === props.espId && c.targetGpio === props.gpio
  })
})

function navigateToRule(ruleId: string) {
  router.push({ name: 'logic-rule', params: { ruleId } })
}

onMounted(() => {
  if (logicStore.rules.length === 0) {
    logicStore.fetchRules()
  }
})
</script>

<template>
  <div class="linked-rules">
    <!-- Empty State -->
    <div v-if="linkedRules.length === 0" class="linked-rules__empty">
      <Link2 class="w-5 h-5" style="color: var(--color-text-muted)" />
      <p class="linked-rules__empty-text">Keine verknüpften Regeln</p>
      <p class="linked-rules__empty-hint">
        Regeln können im Regeln-Tab erstellt werden
      </p>
    </div>

    <!-- Rules List -->
    <div v-else class="linked-rules__list">
      <button
        v-for="rule in linkedRules"
        :key="rule.ruleId"
        class="linked-rules__item"
        @click="navigateToRule(rule.ruleId)"
      >
        <div class="linked-rules__item-header">
          <span class="linked-rules__item-name">{{ rule.ruleName }}</span>
          <span
            :class="['badge', rule.enabled ? 'badge-success' : 'badge-gray']"
          >
            {{ rule.enabled ? 'Aktiv' : 'Inaktiv' }}
          </span>
        </div>
        <p class="linked-rules__item-desc">{{ rule.ruleDescription }}</p>
        <div class="linked-rules__item-meta">
          <span>{{ rule.sourceEspId }}:{{ rule.sourceGpio }}</span>
          <ArrowRight class="w-3 h-3" />
          <span>{{ rule.targetEspId }}:{{ rule.targetGpio }}</span>
          <span v-if="rule.isCrossEsp" class="badge badge-info linked-rules__cross-badge">
            Cross-ESP
          </span>
          <ExternalLink class="linked-rules__nav-icon" />
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.linked-rules {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.linked-rules__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  text-align: center;
}

.linked-rules__empty-text {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  margin: 0;
}

.linked-rules__empty-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0;
}

.linked-rules__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.linked-rules__item {
  padding: var(--space-3);
  background: var(--color-bg-quaternary, rgba(255, 255, 255, 0.04));
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  width: 100%;
  color: inherit;
  font: inherit;
}

.linked-rules__item:hover {
  border-color: var(--color-accent);
  background: rgba(59, 130, 246, 0.04);
}

.linked-rules__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.linked-rules__item-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.linked-rules__item-desc {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-2);
  line-height: 1.4;
}

.linked-rules__item-meta {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.linked-rules__cross-badge {
  font-family: var(--font-body);
  margin-left: var(--space-1);
}

.linked-rules__nav-icon {
  width: 12px;
  height: 12px;
  margin-left: auto;
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.linked-rules__item:hover .linked-rules__nav-icon {
  opacity: 1;
  color: var(--color-accent-bright);
}
</style>
