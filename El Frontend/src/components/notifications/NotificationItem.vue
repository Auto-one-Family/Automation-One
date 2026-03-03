<script setup lang="ts">
/**
 * NotificationItem — Single notification row in the drawer
 *
 * Features:
 * - Severity dot (left)
 * - Title (bold when unread) + body (1 line truncated)
 * - Relative time (right)
 * - Expandable details (source, ESP, zone, deep-links)
 * - Action buttons: mark read, navigate to sensor/rule/grafana
 */

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Check, CheckCheck, ChevronDown, ChevronUp,
  Activity, Workflow, BarChart3, ShieldCheck, Mail
} from 'lucide-vue-next'
import { formatRelativeTime } from '@/utils/formatters'
import type { NotificationDTO } from '@/api/notifications'

interface Props {
  notification: NotificationDTO
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'mark-read': [id: string]
  'acknowledge': [id: string]
  'resolve': [id: string]
}>()

const router = useRouter()
const isExpanded = ref(false)

const severityDotClass = computed(() => {
  switch (props.notification.severity) {
    case 'critical': return 'item__dot--critical'
    case 'warning': return 'item__dot--warning'
    case 'info': return 'item__dot--info'
    default: return 'item__dot--info'
  }
})

const metadata = computed(() => props.notification.metadata || {})
const hasEspId = computed(() => !!metadata.value.esp_id)
const hasRuleId = computed(() => !!metadata.value.rule_id)
const hasSensorType = computed(() => !!metadata.value.sensor_type)

// Email delivery status from metadata (Phase C V1.1)
const emailStatus = computed(() => metadata.value.email_status as string | undefined)
const emailProvider = computed(() => metadata.value.email_provider as string | undefined)
const hasEmailInfo = computed(() => !!emailStatus.value)

const canAcknowledge = computed(() => props.notification.status === 'active')
const canResolve = computed(() =>
  props.notification.status === 'active' || props.notification.status === 'acknowledged'
)
const isResolved = computed(() => props.notification.status === 'resolved')
const isAutoResolved = computed(() =>
  isResolved.value && metadata.value.grafana_status === 'resolved'
)

const statusLabel = computed(() => {
  switch (props.notification.status) {
    case 'active': return 'Aktiv'
    case 'acknowledged': return 'Gesehen'
    case 'resolved': return 'Erledigt'
    default: return ''
  }
})

const statusClass = computed(() => {
  switch (props.notification.status) {
    case 'active': return 'item__status--active'
    case 'acknowledged': return 'item__status--acknowledged'
    case 'resolved': return 'item__status--resolved'
    default: return ''
  }
})

function handleMarkRead(): void {
  if (!props.notification.is_read) {
    emit('mark-read', props.notification.id)
  }
}

function handleAcknowledge(): void {
  emit('acknowledge', props.notification.id)
}

function handleResolve(): void {
  emit('resolve', props.notification.id)
}

function navigateToSensor(): void {
  const espId = metadata.value.esp_id as string
  if (espId) {
    router.push(`/hardware/${espId}`)
  }
}

function navigateToRule(): void {
  const ruleId = metadata.value.rule_id as string
  if (ruleId) {
    router.push(`/logic/${ruleId}`)
  }
}
</script>

<template>
  <div
    :class="['item', { 'item--unread': !notification.is_read, 'item--resolved': isResolved }]"
    @click="isExpanded = !isExpanded"
  >
    <!-- Top Row -->
    <div class="item__row">
      <span :class="['item__dot', severityDotClass]" />

      <div class="item__content">
        <div class="item__title-row">
          <span :class="['item__title', { 'item__title--unread': !notification.is_read }]">
            {{ notification.title }}
          </span>
          <span v-if="statusLabel" :class="['item__status', statusClass]">
            {{ statusLabel }}
          </span>
          <span v-if="isAutoResolved" class="item__auto-badge">Auto</span>
        </div>
        <span v-if="notification.body" class="item__body">
          {{ notification.body }}
        </span>
      </div>

      <div class="item__meta">
        <span class="item__time">{{ formatRelativeTime(notification.created_at) }}</span>
        <component
          :is="isExpanded ? ChevronUp : ChevronDown"
          class="item__chevron"
        />
      </div>
    </div>

    <!-- Expanded Details -->
    <Transition name="expand">
      <div v-if="isExpanded" class="item__details">
        <div class="item__detail-grid">
          <div v-if="notification.source" class="item__detail">
            <span class="item__detail-label">Quelle</span>
            <span class="item__detail-value">{{ notification.source }}</span>
          </div>
          <div v-if="notification.category" class="item__detail">
            <span class="item__detail-label">Kategorie</span>
            <span class="item__detail-value">{{ notification.category }}</span>
          </div>
          <div v-if="hasEspId" class="item__detail">
            <span class="item__detail-label">ESP</span>
            <span class="item__detail-value">{{ metadata.esp_id }}</span>
          </div>
          <div v-if="hasSensorType" class="item__detail">
            <span class="item__detail-label">Sensor</span>
            <span class="item__detail-value">{{ metadata.sensor_type }}</span>
          </div>
          <div v-if="hasEmailInfo" class="item__detail">
            <span class="item__detail-label">Email</span>
            <span :class="['item__email-status', `item__email-status--${emailStatus}`]">
              <Mail class="item__email-icon" />
              {{ emailStatus === 'sent' ? 'Zugestellt' : emailStatus === 'failed' ? 'Fehlgeschlagen' : 'Ausstehend' }}
              <span v-if="emailProvider" class="item__email-provider">via {{ emailProvider }}</span>
            </span>
          </div>
        </div>

        <div class="item__actions">
          <button
            v-if="canAcknowledge"
            class="item__action item__action--ack"
            title="Alert bestätigen (Acknowledge)"
            @click.stop="handleAcknowledge"
          >
            <ShieldCheck class="item__action-icon" />
            Bestätigen
          </button>
          <button
            v-if="canResolve"
            class="item__action item__action--resolve"
            title="Alert erledigen (Resolve)"
            @click.stop="handleResolve"
          >
            <CheckCheck class="item__action-icon" />
            Erledigen
          </button>
          <button
            v-if="!notification.is_read"
            class="item__action"
            title="Als gelesen markieren"
            @click.stop="handleMarkRead"
          >
            <Check class="item__action-icon" />
            Als gelesen
          </button>
          <button
            v-if="hasEspId"
            class="item__action"
            title="Zum Sensor"
            @click.stop="navigateToSensor"
          >
            <Activity class="item__action-icon" />
            Zum Sensor
          </button>
          <button
            v-if="hasRuleId"
            class="item__action"
            title="Zur Regel"
            @click.stop="navigateToRule"
          >
            <Workflow class="item__action-icon" />
            Zur Regel
          </button>
          <a
            v-if="notification.source === 'grafana'"
            class="item__action"
            href="/grafana/alerting/list"
            target="_blank"
            title="In Grafana öffnen"
            @click.stop
          >
            <BarChart3 class="item__action-icon" />
            In Grafana
          </a>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.item {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--glass-border);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.item:hover {
  background: rgba(255, 255, 255, 0.02);
}

.item--unread {
  background: rgba(96, 165, 250, 0.03);
}

.item__row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

/* Severity Dot */
.item__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  margin-top: 5px;
}

.item__dot--critical {
  background: var(--color-error);
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
}

.item__dot--warning {
  background: var(--color-warning);
}

.item__dot--info {
  background: var(--color-info);
}

/* Resolved item */
.item--resolved {
  opacity: 0.6;
}

/* Content */
.item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Status Badge */
.item__status {
  flex-shrink: 0;
  padding: 1px var(--space-1);
  font-size: 10px;
  font-weight: 600;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  line-height: 1.4;
}

.item__status--active {
  color: var(--color-error);
  background: rgba(248, 113, 113, 0.12);
}

.item__status--acknowledged {
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.12);
}

.item__status--resolved {
  color: var(--color-success);
  background: rgba(52, 211, 153, 0.12);
}

/* Auto-resolve badge */
.item__auto-badge {
  flex-shrink: 0;
  padding: 1px var(--space-1);
  font-size: 9px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.item__title {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.item__title--unread {
  color: var(--color-text-primary);
  font-weight: 600;
}

.item__body {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Meta (time + chevron) */
.item__meta {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.item__time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.item__chevron {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  pointer-events: none;
}

/* Expanded Details */
.item__details {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--glass-border);
}

.item__detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.item__detail {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item__detail-label {
  font-size: 10px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.item__detail-value {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

/* Email Status (Phase C V1.1) */
.item__email-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}

.item__email-status--sent {
  color: var(--color-success);
}

.item__email-status--failed {
  color: var(--color-error);
}

.item__email-status--pending {
  color: var(--color-text-muted);
}

.item__email-icon {
  width: 11px;
  height: 11px;
}

.item__email-provider {
  color: var(--color-text-muted);
  font-size: 10px;
}

/* Action Buttons */
.item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.item__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-decoration: none;
}

.item__action:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--glass-border-hover);
}

.item__action--ack {
  color: var(--color-warning);
  border-color: rgba(251, 191, 36, 0.2);
}

.item__action--ack:hover {
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.08);
  border-color: rgba(251, 191, 36, 0.3);
}

.item__action--resolve {
  color: var(--color-success);
  border-color: rgba(52, 211, 153, 0.2);
}

.item__action--resolve:hover {
  color: var(--color-success);
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.3);
}

.item__action-icon {
  width: 12px;
  height: 12px;
  pointer-events: none;
}

/* Expand Transition */
.expand-enter-active,
.expand-leave-active {
  transition: all var(--transition-fast);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
