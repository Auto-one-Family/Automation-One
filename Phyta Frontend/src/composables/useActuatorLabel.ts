import { computed, unref, type MaybeRef } from 'vue'
import {
  formatActuatorStatusLine,
  getActuatorDisplayName,
  getActuatorFunctionLabel,
  resolveActuatorFunctionType,
} from '@/utils/actuatorDefaults'
import type { PhytaActuatorConfig } from '@/types/esp'

/**
 * Operator-facing actuator labels — function from config (hardware_type / palette type), not interface type.
 */
export function useActuatorLabel(actuator: MaybeRef<PhytaActuatorConfig>) {
  const functionType = computed(() => resolveActuatorFunctionType(unref(actuator)))

  const functionLabel = computed(() => getActuatorFunctionLabel(functionType.value))

  /** Title line: custom display_name or function (Pumpe, Ventil, …). */
  const label = computed(() => getActuatorDisplayName(unref(actuator)))

  /** Status suffix: "– aus", "– ein", "– 42 %". */
  const statusLine = computed(() =>
    formatActuatorStatusLine(unref(actuator).state, unref(actuator).pwm_value, functionType.value),
  )

  /** Full operator phrase for tooltips / secondary line. */
  const operatorLine = computed(() => {
    const status = statusLine.value
    if (!status || status === '—') return label.value
    return `${label.value} ${status}`
  })

  return { label, functionLabel, functionType, statusLine, operatorLine }
}
