/** Minimal actuator labels for Phyta palette + wizard (subset of El Frontend). */

export interface ActuatorTypeConfig {
  label: string
  icon: string
  description?: string
}

export const ACTUATOR_TYPE_CONFIG: Record<string, ActuatorTypeConfig> = {
  pump: {
    label: 'Pumpe',
    icon: 'CircleDot',
    description: 'Fördert Flüssigkeit — z. B. Nährlösung.',
  },
  valve: {
    label: 'Ventil',
    icon: 'ToggleLeft',
    description: 'Steuert den Durchfluss ein und aus.',
  },
  pwm: {
    label: 'Leistungsregler',
    icon: 'SlidersHorizontal',
    description: 'Dimmbar — Lüfter, LED oder Heizung.',
  },
  relay: {
    label: 'Schalter',
    icon: 'Power',
    description: 'Ein/Aus — Beleuchtung, Steckdose, Relais.',
  },
  /** Server-normalized interface types (fallback only). */
  digital: {
    label: 'Schalter',
    icon: 'Power',
    description: 'Digitaler Ein/Aus-Ausgang.',
  },
}

/** Interface types stored in DB — logical function comes from hardware_type or name. */
const INTERFACE_ACTUATOR_TYPES = new Set(['digital', 'pwm', 'servo'])

const LOGICAL_ACTUATOR_TYPES = new Set(['pump', 'valve', 'relay', 'pwm'])

export function getActuatorConfig(actuatorType: string): ActuatorTypeConfig | null {
  const key = actuatorType.toLowerCase()
  return ACTUATOR_TYPE_CONFIG[key] ?? null
}

export function getActuatorLabel(actuatorType: string): string {
  return getActuatorConfig(actuatorType)?.label ?? actuatorType
}

/**
 * Resolve logical function (pump/valve/relay/pwm) — never prefer bare "digital" when hardware_type exists.
 */
export function resolveActuatorFunctionType(actuator: {
  actuator_type: string
  hardware_type?: string | null
  name?: string | null
}): string {
  const hw = actuator.hardware_type?.trim().toLowerCase()
  if (hw && LOGICAL_ACTUATOR_TYPES.has(hw)) return hw

  const type = actuator.actuator_type.trim().toLowerCase()
  if (LOGICAL_ACTUATOR_TYPES.has(type)) return type

  const name = actuator.name?.trim().toLowerCase() ?? ''
  if (name.includes('pumpe') || name.includes('pump')) return 'pump'
  if (name.includes('ventil') || name.includes('valve')) return 'valve'
  if (name.includes('lampe') || name.includes('licht') || name.includes('light')) return 'relay'

  if (type === 'pwm') return 'pwm'
  if (INTERFACE_ACTUATOR_TYPES.has(type)) return 'relay'

  return type
}

export function getActuatorFunctionLabel(functionType: string): string {
  return getActuatorLabel(functionType)
}

export function getActuatorDisplayName(actuator: {
  actuator_type: string
  hardware_type?: string | null
  name?: string | null
}): string {
  const functionType = resolveActuatorFunctionType(actuator)
  const typeLabel = getActuatorFunctionLabel(functionType)
  const custom = actuator.name?.trim()
  const iface = actuator.actuator_type.trim().toLowerCase()

  if (
    !custom
    || custom.toLowerCase() === iface
    || custom.toLowerCase() === functionType
    || custom.toLowerCase() === actuator.actuator_type.toLowerCase()
  ) {
    return typeLabel
  }

  return custom
}

/** Operator status suffix with en-dash (e.g. "– aus", "– 42 %"). */
export function formatActuatorStatusLine(
  state?: string | null,
  pwmValue?: number | null,
  functionType?: string,
): string {
  const raw = (state ?? '').trim()
  const upper = raw.toUpperCase()
  const isPwm = functionType === 'pwm' || (pwmValue != null && pwmValue > 0 && !upper.includes('OFF'))

  if (isPwm && pwmValue != null && pwmValue > 0) {
    const percent = pwmValue <= 1 ? Math.round(pwmValue * 100) : Math.round(pwmValue)
    return `– ${percent} %`
  }

  if (upper.includes('ON') || upper === '1' || upper === 'TRUE' || upper === 'ACTIVE') {
    return '– ein'
  }
  if (upper.includes('OFF') || upper === '0' || upper === 'FALSE' || upper === 'INACTIVE') {
    return '– aus'
  }
  if (!raw) return '—'
  return `– ${raw}`
}

/** @deprecated Use formatActuatorStatusLine — kept for callers expecting plain state words. */
export function formatActuatorState(state?: string | null, pwmValue?: number | null): string {
  const line = formatActuatorStatusLine(state, pwmValue, pwmValue != null && pwmValue > 0 ? 'pwm' : undefined)
  if (line.startsWith('– ')) return line.slice(2)
  return line
}
