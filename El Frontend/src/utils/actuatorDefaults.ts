/**
 * Actuator Type Configuration
 *
 * Defines default values, safety parameters, and metadata for each actuator type.
 * Based on ESP32 firmware (El Trabajante) actuator definitions.
 *
 * Phase 7: ActuatorSidebar Integration
 */

// =============================================================================
// Interfaces
// =============================================================================

export interface ActuatorTypeConfig {
  /** Human-readable label: "Pumpe" */
  label: string
  /** Lucide icon name */
  icon: string
  /** Tooltip description */
  description: string
  /** Category for grouping in sidebar */
  category: ActuatorCategoryId
  /** Is this a PWM actuator? (vs binary on/off) */
  isPwm: boolean
  /** Default PWM value (0.0 for OFF) */
  defaultValue: number
  // =========================================================================
  // Safety Defaults (from ESP32 RuntimeProtection)
  // =========================================================================
  /** Max runtime in seconds before auto-shutoff (0 = no limit) */
  maxRuntimeSeconds: number
  /** Cooldown in seconds between activations (0 = no cooldown) */
  cooldownSeconds: number
  // =========================================================================
  // Feature Flags
  // =========================================================================
  /** Supports aux_gpio (e.g., valves for H-bridge direction) */
  supportsAuxGpio: boolean
  /** Supports inverted logic (LOW = ON) */
  supportsInvertedLogic: boolean
}

/**
 * Actuator Category IDs for grouping
 */
export type ActuatorCategoryId = 'pump' | 'valve' | 'relay' | 'pwm'

/**
 * Category Configuration
 */
export interface ActuatorCategory {
  name: string
  icon: string
  order: number
}

// =============================================================================
// Category Configuration
// =============================================================================

/**
 * ACTUATOR_CATEGORIES
 *
 * Categories for grouping actuator types in the sidebar.
 * Used by ActuatorSidebar.vue for collapsible sections.
 */
export const ACTUATOR_CATEGORIES: Record<ActuatorCategoryId, ActuatorCategory> = {
  pump: { name: 'Pumpen', icon: 'Droplet', order: 1 },
  valve: { name: 'Ventile', icon: 'Zap', order: 2 },
  relay: { name: 'Relais', icon: 'Power', order: 3 },
  pwm: { name: 'PWM', icon: 'Gauge', order: 4 },
}

// =============================================================================
// Actuator Type Configuration
// =============================================================================

/**
 * ACTUATOR_TYPE_CONFIG
 *
 * Central configuration for all actuator types.
 * Based on ESP32 firmware: pump, valve, relay, pwm
 *
 * Used by:
 * - ActuatorSidebar (drag items)
 * - ESPOrbitalLayout (add modal)
 * - ActuatorCard (display)
 */
export const ACTUATOR_TYPE_CONFIG: Record<string, ActuatorTypeConfig> = {
  'pump': {
    label: 'Pumpe',
    icon: 'Droplet',
    description: 'Wasserpumpe mit RuntimeProtection. Automatische Abschaltung nach max. Laufzeit.',
    category: 'pump',
    isPwm: false,
    defaultValue: 0,
    // Safety: 1h max runtime, 30s cooldown (ESP32 defaults)
    maxRuntimeSeconds: 3600,
    cooldownSeconds: 30,
    supportsAuxGpio: false,
    supportsInvertedLogic: true,
  },

  'valve': {
    label: 'Ventil',
    icon: 'Zap',
    description: 'Magnetventil oder Kugelventil. Unterstützt aux_gpio für H-Bridge Direction.',
    category: 'valve',
    isPwm: false,
    defaultValue: 0,
    // No timeout for valves (they can stay open indefinitely)
    maxRuntimeSeconds: 0,
    cooldownSeconds: 0,
    supportsAuxGpio: true,
    supportsInvertedLogic: true,
  },

  'relay': {
    label: 'Relais',
    icon: 'Power',
    description: 'Allzweck-Relais für Beleuchtung, Heizung, etc.',
    category: 'relay',
    isPwm: false,
    defaultValue: 0,
    // No automatic timeout
    maxRuntimeSeconds: 0,
    cooldownSeconds: 0,
    supportsAuxGpio: false,
    supportsInvertedLogic: true,
  },

  'pwm': {
    label: 'PWM',
    icon: 'Gauge',
    description: 'PWM-gesteuerte Aktoren (Lüfter, dimmbare LEDs). Wert 0-100%.',
    category: 'pwm',
    isPwm: true,
    defaultValue: 0,
    // No automatic timeout
    maxRuntimeSeconds: 0,
    cooldownSeconds: 0,
    supportsAuxGpio: false,
    supportsInvertedLogic: false, // PWM doesn't support inverted logic
  },
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get actuator type configuration
 */
export function getActuatorConfig(type: string): ActuatorTypeConfig | undefined {
  return ACTUATOR_TYPE_CONFIG[type]
}

/**
 * Get human-readable label for actuator type
 */
export function getActuatorLabel(type: string): string {
  return ACTUATOR_TYPE_CONFIG[type]?.label || type
}

/**
 * Get actuator type options for dropdowns
 */
export function getActuatorTypeOptions(): Array<{ value: string; label: string }> {
  return Object.entries(ACTUATOR_TYPE_CONFIG).map(([value, config]) => ({
    value,
    label: config.label,
  }))
}

/**
 * Check if actuator type is PWM-based
 */
export function isPwmActuator(type: string): boolean {
  return ACTUATOR_TYPE_CONFIG[type]?.isPwm ?? false
}

/**
 * Check if actuator type supports aux_gpio
 */
export function supportsAuxGpio(type: string): boolean {
  return ACTUATOR_TYPE_CONFIG[type]?.supportsAuxGpio ?? false
}

/**
 * Check if actuator type supports inverted logic
 */
export function supportsInvertedLogic(type: string): boolean {
  return ACTUATOR_TYPE_CONFIG[type]?.supportsInvertedLogic ?? false
}

/**
 * Get safety defaults for actuator type
 */
export function getActuatorSafetyDefaults(type: string): {
  maxRuntime: number
  cooldown: number
} {
  const config = ACTUATOR_TYPE_CONFIG[type]
  return {
    maxRuntime: config?.maxRuntimeSeconds ?? 0,
    cooldown: config?.cooldownSeconds ?? 0,
  }
}

/**
 * Get actuator icon (Lucide icon name)
 */
export function getActuatorIcon(type: string): string {
  return ACTUATOR_TYPE_CONFIG[type]?.icon || 'Power'
}

/**
 * Get all actuator types grouped by category
 */
export function getActuatorTypesByCategory(): Record<
  ActuatorCategoryId,
  Array<{ type: string; config: ActuatorTypeConfig }>
> {
  const grouped: Record<ActuatorCategoryId, Array<{ type: string; config: ActuatorTypeConfig }>> = {
    pump: [],
    valve: [],
    relay: [],
    pwm: [],
  }

  for (const [type, config] of Object.entries(ACTUATOR_TYPE_CONFIG)) {
    grouped[config.category].push({ type, config })
  }

  return grouped
}
