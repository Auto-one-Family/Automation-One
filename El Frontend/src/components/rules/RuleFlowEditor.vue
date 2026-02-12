<script setup lang="ts">
/**
 * RuleFlowEditor
 *
 * Node-RED-inspired visual rule editor using Vue Flow.
 * Custom node types for AutomationOne's sensor → logic → actuator pipeline.
 *
 * Features:
 * - Custom glassmorphism nodes for each type (sensor, time, logic, actuator, notification, delay)
 * - Animated iridescent edges
 * - Drag & drop from palette to canvas
 * - Rule ↔ Graph conversion
 * - Live execution flash (via logicStore.activeExecutions)
 * - Auto-layout for imported rules
 */

import { ref, watch, nextTick } from 'vue'
import { VueFlow, Position, MarkerType, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, Connection } from '@vue-flow/core'
import { Handle } from '@vue-flow/core'
import {
  Thermometer,
  Clock,
  GitMerge,
  Power,
  Bell,
  Timer,
  Droplets,
  Gauge,
  Sun,
  Wind,
  Waves,
  Leaf,
  Zap,
  AlertCircle,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { LogicRule, SensorCondition, TimeCondition, ActuatorAction, NotificationAction, DelayAction, LogicCondition, LogicAction } from '@/types/logic'
import { useLogicStore } from '@/stores/logic'
import { useEspStore } from '@/stores/esp'

// Vue Flow CSS
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

interface Props {
  rule: LogicRule | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'node-selected': [node: Node | null]
  'graph-changed': []
}>()

const logicStore = useLogicStore()
const espStore = useEspStore()

// Vue Flow instance
const {
  nodes,
  edges,
  addNodes,
  addEdges,
  removeNodes,
  removeEdges,
  onConnect,
  project,
  fitView,
  onNodeClick,
  getNode,
} = useVueFlow({
  defaultEdgeOptions: {
    animated: true,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  },
  fitViewOnInit: true,
  snapToGrid: true,
  snapGrid: [20, 20] as [number, number],
})

const flowWrapper = ref<HTMLElement | null>(null)
const isDragOver = ref(false)
let nodeIdCounter = 0

// Sensor icon mapping
const sensorIcons: Record<string, Component> = {
  DS18B20: Thermometer,
  SHT31: Droplets,
  BME280: Droplets,
  pH: Gauge,
  EC: Zap,
  moisture: Waves,
  light: Sun,
  co2: Wind,
  flow: Waves,
  level: Leaf,
}

// Operator display mapping
const operatorDisplay: Record<string, string> = {
  '>': '>',
  '>=': '≥',
  '<': '<',
  '<=': '≤',
  '==': '=',
  '!=': '≠',
  between: '↔',
}

// Command display mapping
const commandDisplay: Record<string, string> = {
  ON: 'AN',
  OFF: 'AUS',
  PWM: 'PWM',
  TOGGLE: '⇄',
}

// ======================== DROP HANDLING ========================

function onDragOverCanvas(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false

  const rawData = event.dataTransfer?.getData('application/rulenode')
  if (!rawData) return

  const data = JSON.parse(rawData)
  const bounds = flowWrapper.value?.getBoundingClientRect()
  if (!bounds) return

  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })

  const id = `${data.type}-${Date.now()}-${nodeIdCounter++}`
  const nodeData = getDefaultNodeData(data.type, data.defaults || {})

  addNodes([
    {
      id,
      type: data.type,
      position,
      data: nodeData,
    },
  ])

  emit('graph-changed')
}

// ======================== DEFAULT NODE DATA ========================

function getDefaultNodeData(type: string, defaults: Record<string, unknown> = {}): Record<string, unknown> {
  switch (type) {
    case 'sensor':
      return {
        espId: '',
        gpio: 0,
        sensorType: defaults.sensorType || 'DS18B20',
        operator: defaults.operator || '>',
        value: defaults.value ?? 25,
        min: defaults.min,
        max: defaults.max,
        ...defaults,
      }
    case 'time':
      return {
        startHour: defaults.startHour ?? 8,
        endHour: defaults.endHour ?? 18,
        daysOfWeek: defaults.daysOfWeek || [1, 2, 3, 4, 5],
        ...defaults,
      }
    case 'logic':
      return {
        operator: defaults.operator || 'AND',
        ...defaults,
      }
    case 'actuator':
      return {
        espId: '',
        gpio: 0,
        command: defaults.command || 'ON',
        pwmValue: defaults.pwmValue,
        duration: defaults.duration,
        ...defaults,
      }
    case 'notification':
      return {
        channel: defaults.channel || 'websocket',
        target: defaults.target || '',
        messageTemplate: defaults.messageTemplate || '',
        ...defaults,
      }
    case 'delay':
      return {
        seconds: defaults.seconds ?? 60,
        ...defaults,
      }
    default:
      return { ...defaults }
  }
}

// ======================== CONNECT HANDLING ========================

onConnect((connection: Connection) => {
  addEdges([
    {
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      animated: true,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
    },
  ])
  emit('graph-changed')
})

// ======================== NODE SELECTION ========================

onNodeClick(({ node }) => {
  emit('node-selected', node)
})

// ======================== RULE ↔ GRAPH CONVERSION ========================

/**
 * Convert a LogicRule to Vue Flow nodes and edges
 */
function ruleToGraph(rule: LogicRule): { nodes: Node[]; edges: Edge[] } {
  const resultNodes: Node[] = []
  const resultEdges: Edge[] = []
  const COLUMN_SPACING = 300
  const ROW_SPACING = 140

  // Create condition nodes (left column, x=50)
  const conditionIds: string[] = []
  rule.conditions.forEach((cond, i) => {
    const id = `cond-${i}`
    conditionIds.push(id)

    if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
      const sc = cond as SensorCondition
      resultNodes.push({
        id,
        type: 'sensor',
        position: { x: 50, y: 60 + i * ROW_SPACING },
        data: {
          espId: sc.esp_id,
          gpio: sc.gpio,
          sensorType: sc.sensor_type,
          operator: sc.operator,
          value: sc.value,
          min: sc.min,
          max: sc.max,
        },
      })
    } else if (cond.type === 'time_window' || cond.type === 'time') {
      const tc = cond as TimeCondition
      resultNodes.push({
        id,
        type: 'time',
        position: { x: 50, y: 60 + i * ROW_SPACING },
        data: {
          startHour: tc.start_hour,
          endHour: tc.end_hour,
          daysOfWeek: tc.days_of_week || [],
        },
      })
    }
  })

  // Create logic gate if multiple conditions
  let sourceIds = conditionIds
  if (rule.conditions.length > 1) {
    const logicId = 'logic-0'
    const avgY = (rule.conditions.length - 1) * ROW_SPACING / 2 + 60
    resultNodes.push({
      id: logicId,
      type: 'logic',
      position: { x: 50 + COLUMN_SPACING, y: avgY },
      data: { operator: rule.logic_operator },
    })

    // Connect conditions → logic gate
    conditionIds.forEach((condId) => {
      resultEdges.push({
        id: `e-${condId}-${logicId}`,
        source: condId,
        target: logicId,
        animated: true,
        type: 'smoothstep',
        markerEnd: MarkerType.ArrowClosed,
      })
    })

    sourceIds = [logicId]
  }

  // Create action nodes (right column)
  const actionX = rule.conditions.length > 1 ? 50 + COLUMN_SPACING * 2 : 50 + COLUMN_SPACING
  rule.actions.forEach((action, i) => {
    const id = `action-${i}`

    if (action.type === 'actuator' || action.type === 'actuator_command') {
      const aa = action as ActuatorAction
      resultNodes.push({
        id,
        type: 'actuator',
        position: { x: actionX, y: 60 + i * ROW_SPACING },
        data: {
          espId: aa.esp_id,
          gpio: aa.gpio,
          command: aa.command,
          pwmValue: aa.value,
          duration: aa.duration,
        },
      })
    } else if (action.type === 'notification') {
      const na = action as NotificationAction
      resultNodes.push({
        id,
        type: 'notification',
        position: { x: actionX, y: 60 + i * ROW_SPACING },
        data: {
          channel: na.channel,
          target: na.target,
          messageTemplate: na.message_template,
        },
      })
    } else if (action.type === 'delay') {
      const da = action as DelayAction
      resultNodes.push({
        id,
        type: 'delay',
        position: { x: actionX, y: 60 + i * ROW_SPACING },
        data: { seconds: da.seconds },
      })
    }

    // Connect source → action
    sourceIds.forEach((srcId) => {
      resultEdges.push({
        id: `e-${srcId}-${id}`,
        source: srcId,
        target: id,
        animated: true,
        type: 'smoothstep',
        markerEnd: MarkerType.ArrowClosed,
      })
    })
  })

  return { nodes: resultNodes, edges: resultEdges }
}

/**
 * Convert Vue Flow graph back to LogicRule partial
 */
function graphToRuleData(): {
  conditions: LogicCondition[]
  actions: LogicAction[]
  logic_operator: 'AND' | 'OR'
} {
  const conditions: LogicCondition[] = []
  const actions: LogicAction[] = []
  let logicOperator: 'AND' | 'OR' = 'AND'

  for (const node of nodes.value) {
    switch (node.type) {
      case 'sensor':
        conditions.push({
          type: 'sensor',
          esp_id: node.data.espId || '',
          gpio: node.data.gpio || 0,
          sensor_type: node.data.sensorType || 'DS18B20',
          operator: node.data.operator || '>',
          value: node.data.value ?? 0,
          ...(node.data.min !== undefined ? { min: node.data.min } : {}),
          ...(node.data.max !== undefined ? { max: node.data.max } : {}),
        } as SensorCondition)
        break

      case 'time':
        conditions.push({
          type: 'time_window',
          start_hour: node.data.startHour || 0,
          end_hour: node.data.endHour || 23,
          ...(node.data.daysOfWeek?.length ? { days_of_week: node.data.daysOfWeek } : {}),
        } as TimeCondition)
        break

      case 'logic':
        logicOperator = node.data.operator || 'AND'
        break

      case 'actuator':
        actions.push({
          type: 'actuator',
          esp_id: node.data.espId || '',
          gpio: node.data.gpio || 0,
          command: node.data.command || 'ON',
          ...(node.data.pwmValue !== undefined ? { value: node.data.pwmValue / 100 } : {}),
          ...(node.data.duration ? { duration: node.data.duration } : {}),
        } as ActuatorAction)
        break

      case 'notification':
        actions.push({
          type: 'notification',
          channel: node.data.channel || 'websocket',
          target: node.data.target || '',
          message_template: node.data.messageTemplate || '',
        } as NotificationAction)
        break

      case 'delay':
        actions.push({
          type: 'delay',
          seconds: node.data.seconds || 60,
        } as DelayAction)
        break
    }
  }

  return { conditions, actions, logic_operator: logicOperator }
}

// ======================== LOAD RULE INTO GRAPH ========================

watch(
  () => props.rule,
  (newRule) => {
    if (newRule) {
      const graph = ruleToGraph(newRule)
      // Clear existing and set new
      nodes.value = graph.nodes as typeof nodes.value
      edges.value = graph.edges as typeof edges.value
      nextTick(() => fitView({ padding: 0.3 }))
    } else {
      nodes.value = []
      edges.value = []
    }
  },
  { immediate: true }
)

// ======================== EXPOSED METHODS ========================

function updateNodeData(nodeId: string, data: Record<string, unknown>) {
  const node = getNode.value(nodeId)
  if (node) {
    node.data = { ...data }
    emit('graph-changed')
  }
}

function deleteNode(nodeId: string) {
  // Remove connected edges first
  const connectedEdges = edges.value.filter(
    (e) => e.source === nodeId || e.target === nodeId
  )
  removeEdges(connectedEdges.map((e) => e.id))
  removeNodes([nodeId])
  emit('node-selected', null)
  emit('graph-changed')
}

function duplicateNode(nodeId: string) {
  const node = getNode.value(nodeId)
  if (!node) return

  const newId = `${node.type}-${Date.now()}-${nodeIdCounter++}`
  addNodes([
    {
      id: newId,
      type: node.type!,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data },
    },
  ])
  emit('graph-changed')
}

function clearCanvas() {
  nodes.value = []
  edges.value = []
  emit('node-selected', null)
  emit('graph-changed')
}

// Check if a node belongs to an active rule execution
function isNodeActive(_nodeId: string): boolean {
  if (!props.rule) return false
  return logicStore.isRuleActive(props.rule.id)
}

// Get ESP device name for display
function getEspName(espId: string): string {
  if (!espId) return '?'
  const device = espStore.devices.find((d) => espStore.getDeviceId(d) === espId)
  return device?.name || espId.slice(-6)
}

// Format time with leading zero
function padHour(h: number): string {
  return String(h).padStart(2, '0') + ':00'
}

defineExpose({
  graphToRuleData,
  updateNodeData,
  deleteNode,
  duplicateNode,
  clearCanvas,
  fitView: () => fitView({ padding: 0.3 }),
})
</script>

<template>
  <div
    ref="flowWrapper"
    class="flow-editor"
    :class="{ 'flow-editor--dragover': isDragOver }"
    @dragover="onDragOverCanvas"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Empty state hint -->
    <div v-if="nodes.length === 0" class="flow-editor__empty">
      <div class="flow-editor__empty-content">
        <AlertCircle class="flow-editor__empty-icon" />
        <p class="flow-editor__empty-title">Leere Arbeitsfläche</p>
        <p class="flow-editor__empty-desc">
          Ziehe Bausteine aus der linken Palette hierher, um deine Automatisierung zu erstellen.
        </p>
        <p class="flow-editor__empty-hint">
          Bedingungen → Logik → Aktionen
        </p>
      </div>
    </div>

    <!-- Drop overlay -->
    <Transition name="fade">
      <div v-if="isDragOver" class="flow-editor__drop-overlay">
        <div class="flow-editor__drop-text">Hier ablegen</div>
      </div>
    </Transition>

    <VueFlow
      :class="{ 'flow-active': props.rule && logicStore.isRuleActive(props.rule.id) }"
      :default-zoom="1"
      :min-zoom="0.3"
      :max-zoom="2"
    >
      <!-- ======================== SENSOR NODE ======================== -->
      <template #node-sensor="{ data, id }">
        <div
          class="rule-node rule-node--sensor"
          :class="{ 'rule-node--active': isNodeActive(id) }"
        >
          <Handle type="source" :position="Position.Right" class="handle-source" />
          <div class="rule-node__header">
            <component
              :is="sensorIcons[data.sensorType] || Thermometer"
              class="rule-node__icon"
            />
            <span class="rule-node__type">{{ data.sensorType }}</span>
          </div>
          <div class="rule-node__body">
            <div v-if="data.espId" class="rule-node__detail">
              <span class="rule-node__detail-label">ESP</span>
              <span class="rule-node__detail-value">{{ getEspName(data.espId) }}</span>
            </div>
            <div class="rule-node__condition">
              <template v-if="data.operator === 'between'">
                {{ data.min }} {{ operatorDisplay.between }} {{ data.max }}
              </template>
              <template v-else>
                {{ operatorDisplay[data.operator] || data.operator }} {{ data.value }}
              </template>
            </div>
          </div>
        </div>
      </template>

      <!-- ======================== TIME NODE ======================== -->
      <template #node-time="{ data, id }">
        <div
          class="rule-node rule-node--time"
          :class="{ 'rule-node--active': isNodeActive(id) }"
        >
          <Handle type="source" :position="Position.Right" class="handle-source" />
          <div class="rule-node__header">
            <Clock class="rule-node__icon" />
            <span class="rule-node__type">Zeitfenster</span>
          </div>
          <div class="rule-node__body">
            <div class="rule-node__condition">
              {{ padHour(data.startHour) }} – {{ padHour(data.endHour) }}
            </div>
            <div v-if="data.daysOfWeek?.length" class="rule-node__days">
              {{ data.daysOfWeek.map((d: number) => ['So','Mo','Di','Mi','Do','Fr','Sa'][d]).join(' ') }}
            </div>
          </div>
        </div>
      </template>

      <!-- ======================== LOGIC NODE ======================== -->
      <template #node-logic="{ data, id }">
        <div
          class="rule-node rule-node--logic"
          :class="{ 'rule-node--active': isNodeActive(id) }"
        >
          <Handle type="target" :position="Position.Left" class="handle-target" />
          <Handle type="source" :position="Position.Right" class="handle-source" />
          <div class="rule-node__gate">
            <GitMerge class="rule-node__gate-icon" />
            <span class="rule-node__gate-label">{{ data.operator }}</span>
          </div>
        </div>
      </template>

      <!-- ======================== ACTUATOR NODE ======================== -->
      <template #node-actuator="{ data, id }">
        <div
          class="rule-node rule-node--actuator"
          :class="{ 'rule-node--active': isNodeActive(id) }"
        >
          <Handle type="target" :position="Position.Left" class="handle-target" />
          <div class="rule-node__header">
            <Power class="rule-node__icon" />
            <span class="rule-node__type">Aktor</span>
          </div>
          <div class="rule-node__body">
            <div v-if="data.espId" class="rule-node__detail">
              <span class="rule-node__detail-label">ESP</span>
              <span class="rule-node__detail-value">{{ getEspName(data.espId) }}</span>
            </div>
            <div class="rule-node__command" :class="`rule-node__command--${data.command?.toLowerCase()}`">
              {{ commandDisplay[data.command] || data.command }}
              <template v-if="data.command === 'PWM'"> {{ data.pwmValue ?? 0 }}%</template>
            </div>
            <div v-if="data.duration" class="rule-node__duration">
              {{ data.duration }}s Auto-Off
            </div>
          </div>
        </div>
      </template>

      <!-- ======================== NOTIFICATION NODE ======================== -->
      <template #node-notification="{ data, id }">
        <div
          class="rule-node rule-node--notification"
          :class="{ 'rule-node--active': isNodeActive(id) }"
        >
          <Handle type="target" :position="Position.Left" class="handle-target" />
          <div class="rule-node__header">
            <Bell class="rule-node__icon" />
            <span class="rule-node__type">{{ data.channel === 'email' ? 'E-Mail' : data.channel === 'webhook' ? 'Webhook' : 'Dashboard' }}</span>
          </div>
          <div class="rule-node__body">
            <div v-if="data.target" class="rule-node__detail">
              <span class="rule-node__detail-value rule-node__detail-value--truncate">{{ data.target }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ======================== DELAY NODE ======================== -->
      <template #node-delay="{ data, id }">
        <div
          class="rule-node rule-node--delay"
          :class="{ 'rule-node--active': isNodeActive(id) }"
        >
          <Handle type="target" :position="Position.Left" class="handle-target" />
          <Handle type="source" :position="Position.Right" class="handle-source" />
          <div class="rule-node__header">
            <Timer class="rule-node__icon" />
            <span class="rule-node__type">Verzögerung</span>
          </div>
          <div class="rule-node__body">
            <div class="rule-node__condition">
              {{ data.seconds >= 60 ? `${Math.floor(data.seconds / 60)}m ${data.seconds % 60}s` : `${data.seconds}s` }}
            </div>
          </div>
        </div>
      </template>

      <!-- Background, Controls, MiniMap -->
      <Background :gap="20" :size="1" pattern-color="rgba(255,255,255,0.03)" />
      <Controls position="bottom-left" />
      <MiniMap
        :pannable="true"
        :zoomable="true"
        :node-color="miniMapNodeColor"
      />
    </VueFlow>
  </div>
</template>

<script lang="ts">
// MiniMap color function (must be in Options API or script block)
function miniMapNodeColor(node: Node): string {
  const colors: Record<string, string> = {
    sensor: '#60a5fa',
    time: '#fbbf24',
    logic: '#a78bfa',
    actuator: '#c084fc',
    notification: '#34d399',
    delay: '#707080',
  }
  return colors[node.type || ''] || '#707080'
}
</script>

<style scoped>
.flow-editor {
  flex: 1;
  position: relative;
  min-height: 0;
  border: 2px solid transparent;
  transition: border-color var(--transition-base);
}

.flow-editor--dragover {
  border-color: var(--color-iridescent-2);
}

/* Empty state */
.flow-editor__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
}

.flow-editor__empty-content {
  text-align: center;
  max-width: 320px;
}

.flow-editor__empty-icon {
  width: 48px;
  height: 48px;
  color: var(--color-text-muted);
  opacity: 0.4;
  margin: 0 auto 1rem;
}

.flow-editor__empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.flow-editor__empty-desc {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

.flow-editor__empty-hint {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-iridescent-2);
  opacity: 0.6;
}

/* Drop overlay */
.flow-editor__drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(129, 140, 248, 0.05);
  border: 2px dashed var(--color-iridescent-2);
  border-radius: var(--radius-lg);
  z-index: 10;
  pointer-events: none;
}

.flow-editor__drop-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-iridescent-2);
  padding: 0.75rem 1.5rem;
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  border-radius: var(--radius-xl);
  border: 1px solid rgba(129, 140, 248, 0.3);
}

/* ======================== CUSTOM NODES ======================== */

.rule-node {
  min-width: 170px;
  max-width: 220px;
  background: rgba(18, 18, 26, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  overflow: hidden;
}

.rule-node:hover {
  border-color: var(--glass-border-hover);
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.4);
  transform: translateY(-1px);
}

/* Active flash (rule executing) */
.rule-node--active {
  animation: node-pulse 0.6s ease;
}

@keyframes node-pulse {
  0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); }
  50% { box-shadow: 0 0 30px rgba(96, 165, 250, 0.4); }
  100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); }
}

/* Type-specific accent colors */
.rule-node--sensor {
  border-top: 3px solid var(--color-iridescent-1);
}

.rule-node--time {
  border-top: 3px solid var(--color-warning);
}

.rule-node--logic {
  border-top: 3px solid var(--color-iridescent-3);
  min-width: auto;
  max-width: none;
}

.rule-node--actuator {
  border-top: 3px solid var(--color-iridescent-4);
}

.rule-node--notification {
  border-top: 3px solid var(--color-success);
}

.rule-node--delay {
  border-top: 3px solid var(--color-text-muted);
}

/* Node inner layout */
.rule-node__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem 0.25rem;
}

.rule-node__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.rule-node--sensor .rule-node__icon { color: var(--color-iridescent-1); }
.rule-node--time .rule-node__icon { color: var(--color-warning); }
.rule-node--actuator .rule-node__icon { color: var(--color-iridescent-4); }
.rule-node--notification .rule-node__icon { color: var(--color-success); }
.rule-node--delay .rule-node__icon { color: var(--color-text-muted); }

.rule-node__type {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.rule-node__body {
  padding: 0.25rem 0.75rem 0.625rem;
}

.rule-node__detail {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.25rem;
}

.rule-node__detail-label {
  font-size: 0.625rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.rule-node__detail-value {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.rule-node__detail-value--truncate {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-node__condition {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.rule-node__days {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  margin-top: 0.125rem;
  letter-spacing: 0.05em;
}

/* Logic gate node */
.rule-node__gate {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
}

.rule-node__gate-icon {
  width: 18px;
  height: 18px;
  color: var(--color-iridescent-3);
}

.rule-node__gate-label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-iridescent-3);
  letter-spacing: 0.05em;
}

/* Actuator command badge */
.rule-node__command {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  margin-top: 0.125rem;
}

.rule-node__command--on {
  background: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
}

.rule-node__command--off {
  background: rgba(248, 113, 113, 0.15);
  color: var(--color-error);
}

.rule-node__command--pwm {
  background: rgba(96, 165, 250, 0.15);
  color: var(--color-iridescent-1);
}

.rule-node__command--toggle {
  background: rgba(251, 191, 36, 0.15);
  color: var(--color-warning);
}

.rule-node__duration {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}

/* ======================== HANDLE STYLING ======================== */

:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-bg-quaternary);
  border: 2px solid var(--color-iridescent-2);
  transition: all 0.15s ease;
}

:deep(.vue-flow__handle:hover) {
  background: var(--color-iridescent-2);
  box-shadow: 0 0 10px var(--color-iridescent-2);
  transform: scale(1.4);
}

:deep(.vue-flow__handle-connecting) {
  background: var(--color-iridescent-1);
  box-shadow: 0 0 14px var(--color-iridescent-1);
}

:deep(.vue-flow__handle-valid) {
  background: var(--color-success);
  border-color: var(--color-success);
  box-shadow: 0 0 10px var(--color-success);
}

/* ======================== EDGE STYLING ======================== */

:deep(.vue-flow__edge-path) {
  stroke: var(--color-iridescent-2);
  stroke-width: 2;
}

:deep(.vue-flow__edge.animated .vue-flow__edge-path) {
  stroke-dasharray: 6 4;
  animation: edge-flow 1.5s linear infinite;
}

:deep(.vue-flow__edge:hover .vue-flow__edge-path) {
  stroke: var(--color-iridescent-1);
  stroke-width: 3;
  filter: drop-shadow(0 0 4px var(--color-iridescent-1));
}

:deep(.vue-flow__edge .vue-flow__edge-interaction) {
  stroke-width: 20;
}

:deep(.vue-flow__arrowhead) {
  fill: var(--color-iridescent-2);
}

@keyframes edge-flow {
  from { stroke-dashoffset: 10; }
  to { stroke-dashoffset: 0; }
}

/* ======================== VUE FLOW THEME OVERRIDES ======================== */

:deep(.vue-flow) {
  background: var(--color-bg-primary);
}

:deep(.vue-flow__pane) {
  cursor: default;
}

:deep(.vue-flow__selection) {
  background: rgba(129, 140, 248, 0.08);
  border: 1px solid rgba(129, 140, 248, 0.3);
}

:deep(.vue-flow__minimap) {
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

:deep(.vue-flow__minimap-mask) {
  fill: rgba(10, 10, 15, 0.7);
}

:deep(.vue-flow__controls) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: transparent;
  border: none;
  box-shadow: none;
}

:deep(.vue-flow__controls-button) {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

:deep(.vue-flow__controls-button:hover) {
  background: var(--color-bg-tertiary);
  border-color: var(--color-iridescent-2);
  color: var(--color-text-primary);
}

:deep(.vue-flow__controls-button svg) {
  fill: currentColor;
  width: 14px;
  height: 14px;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
