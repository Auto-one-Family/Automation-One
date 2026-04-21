<script setup lang="ts">
/**
 * RuleTemplateCard Component
 *
 * Displays a rule template with icon, name, description, and category badge.
 * Used in LogicView empty state.
 */

import type { RuleTemplate } from '@/config/rule-templates'
import { RULE_TEMPLATE_CATEGORIES } from '@/config/rule-templates'
import BaseCard from '@/shared/design/primitives/BaseCard.vue'

interface Props {
  /** The rule template to display */
  template: RuleTemplate
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'use-template': [template: RuleTemplate]
}>()

const category = RULE_TEMPLATE_CATEGORIES[props.template.category]
</script>

<template>
  <BaseCard glass hoverable>
    <div class="rule-template-card" @click="emit('use-template', template)">
      <div class="rule-template-card__header">
        <component
          :is="template.icon"
          class="rule-template-card__icon"
          :style="{ color: category?.color ?? 'var(--color-accent)' }"
        />
        <span
          class="rule-template-card__category"
          :style="{ color: category?.color, borderColor: category?.color + '40' }"
        >
          {{ category?.label ?? template.category }}
        </span>
      </div>

      <h4 class="rule-template-card__title">{{ template.name }}</h4>
      <p class="rule-template-card__description" :title="template.description">{{ template.description }}</p>

      <div class="rule-template-card__meta">
        <span class="rule-template-card__meta-chip">{{ template.rule.conditions.length }} Bedingungen</span>
        <span class="rule-template-card__meta-chip">{{ template.rule.actions.length }} Aktion{{ template.rule.actions.length > 1 ? 'en' : '' }}</span>
        <span class="rule-template-card__meta-chip">Prio {{ template.rule.priority }}</span>
      </div>

      <button
        class="rule-template-card__action"
        @click.stop="emit('use-template', template)"
      >
        Verwenden
      </button>
    </div>
  </BaseCard>
</template>

<style scoped>
.rule-template-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-1);
  cursor: pointer;
}

.rule-template-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rule-template-card__icon {
  width: 24px;
  height: 24px;
}

.rule-template-card__category {
  font-size: var(--text-xxs);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border: 1px solid;
  border-radius: var(--radius-sm);
}

.rule-template-card__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.rule-template-card__description {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.4;
  min-height: 2.8em;
}

.rule-template-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.rule-template-card__meta-chip {
  font-size: var(--text-xxs);
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}

.rule-template-card__action {
  align-self: flex-start;
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.rule-template-card__action:hover {
  color: white;
  background: var(--color-accent);
}
</style>
