/**
 * GPIO Configuration Utility
 *
 * Provides ESP32 GPIO pin information with recommendations for sensors and actuators.
 * Based on ESP32-WROOM and XIAO ESP32-C3 hardware specifications.
 */

// =============================================================================
// TYPES
// =============================================================================

export type GpioCategory = 'recommended' | 'available' | 'caution' | 'avoid' | 'input_only'

export type GpioFeature = 'ADC' | 'DAC' | 'PWM' | 'I2C' | 'SPI' | 'UART' | 'Touch' | 'RTC'

export type GpioUsage = 'sensor' | 'actuator' | 'both'

export interface GpioPin {
  /** GPIO pin number */
  gpio: number
  /** Category for recommendations */
  category: GpioCategory
  /** German label/description */
  label: string
  /** Available features */
  features: GpioFeature[]
  /** Recommended usage */
  recommendedFor: GpioUsage
  /** Warning message (if any) */
  warning?: string
  /** Additional notes */
  notes?: string
}

export type HardwareType = 'ESP32_WROOM' | 'XIAO_ESP32_C3'

// =============================================================================
// ESP32-WROOM GPIO CONFIGURATION
// =============================================================================

const ESP32_WROOM_PINS: GpioPin[] = [
  // === RECOMMENDED (Safe, versatile pins) ===
  {
    gpio: 13,
    category: 'recommended',
    label: 'GPIO 13',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'both',
  },
  {
    gpio: 14,
    category: 'recommended',
    label: 'GPIO 14',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'both',
  },
  {
    gpio: 16,
    category: 'recommended',
    label: 'GPIO 16',
    features: ['PWM'],
    recommendedFor: 'actuator',
  },
  {
    gpio: 17,
    category: 'recommended',
    label: 'GPIO 17',
    features: ['PWM'],
    recommendedFor: 'actuator',
  },
  {
    gpio: 18,
    category: 'recommended',
    label: 'GPIO 18',
    features: ['PWM', 'SPI'],
    recommendedFor: 'both',
  },
  {
    gpio: 19,
    category: 'recommended',
    label: 'GPIO 19',
    features: ['PWM', 'SPI'],
    recommendedFor: 'both',
  },
  {
    gpio: 23,
    category: 'recommended',
    label: 'GPIO 23',
    features: ['PWM', 'SPI'],
    recommendedFor: 'both',
  },
  {
    gpio: 25,
    category: 'recommended',
    label: 'GPIO 25',
    features: ['ADC', 'DAC', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 26,
    category: 'recommended',
    label: 'GPIO 26',
    features: ['ADC', 'DAC', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 27,
    category: 'recommended',
    label: 'GPIO 27',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'both',
  },

  // === AVAILABLE (Good for specific uses) ===
  {
    gpio: 4,
    category: 'available',
    label: 'GPIO 4',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'both',
  },
  {
    gpio: 5,
    category: 'available',
    label: 'GPIO 5 (Strapping)',
    features: ['PWM'],
    recommendedFor: 'actuator',
    notes: 'Strapping-Pin, muss beim Boot LOW sein',
  },
  {
    gpio: 21,
    category: 'available',
    label: 'GPIO 21 (I2C SDA)',
    features: ['I2C', 'PWM'],
    recommendedFor: 'sensor',
    notes: 'Standard I2C Data',
  },
  {
    gpio: 22,
    category: 'available',
    label: 'GPIO 22 (I2C SCL)',
    features: ['I2C', 'PWM'],
    recommendedFor: 'sensor',
    notes: 'Standard I2C Clock',
  },
  {
    gpio: 32,
    category: 'available',
    label: 'GPIO 32',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'sensor',
  },
  {
    gpio: 33,
    category: 'available',
    label: 'GPIO 33',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'sensor',
  },

  // === INPUT ONLY (No internal pull-up) ===
  {
    gpio: 34,
    category: 'input_only',
    label: 'GPIO 34 (Nur Eingang)',
    features: ['ADC'],
    recommendedFor: 'sensor',
    warning: 'Nur als Eingang verwendbar, kein interner Pull-up',
  },
  {
    gpio: 35,
    category: 'input_only',
    label: 'GPIO 35 (Nur Eingang)',
    features: ['ADC'],
    recommendedFor: 'sensor',
    warning: 'Nur als Eingang verwendbar, kein interner Pull-up',
  },
  {
    gpio: 36,
    category: 'input_only',
    label: 'GPIO 36 / VP (Nur Eingang)',
    features: ['ADC'],
    recommendedFor: 'sensor',
    warning: 'Nur als Eingang verwendbar, Sensor VP',
  },
  {
    gpio: 39,
    category: 'input_only',
    label: 'GPIO 39 / VN (Nur Eingang)',
    features: ['ADC'],
    recommendedFor: 'sensor',
    warning: 'Nur als Eingang verwendbar, Sensor VN',
  },

  // === CAUTION (Usable with care) ===
  {
    gpio: 2,
    category: 'caution',
    label: 'GPIO 2 (Onboard LED)',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'actuator',
    warning: 'Verbunden mit Onboard-LED bei vielen Boards',
  },
  {
    gpio: 12,
    category: 'caution',
    label: 'GPIO 12 (Strapping)',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'both',
    warning: 'Boot schlägt fehl wenn HIGH beim Start',
  },
  {
    gpio: 15,
    category: 'caution',
    label: 'GPIO 15 (Strapping)',
    features: ['ADC', 'PWM', 'Touch'],
    recommendedFor: 'both',
    warning: 'PWM-Signal beim Boot, Strapping-Pin',
  },

  // === AVOID (System reserved) ===
  {
    gpio: 0,
    category: 'avoid',
    label: 'GPIO 0 (Boot-Modus)',
    features: [],
    recommendedFor: 'both',
    warning: 'Steuert Boot-Modus - NICHT VERWENDEN',
  },
  {
    gpio: 1,
    category: 'avoid',
    label: 'GPIO 1 (TX0)',
    features: ['UART'],
    recommendedFor: 'both',
    warning: 'UART0 TX - Debugging - NICHT VERWENDEN',
  },
  {
    gpio: 3,
    category: 'avoid',
    label: 'GPIO 3 (RX0)',
    features: ['UART'],
    recommendedFor: 'both',
    warning: 'UART0 RX - Debugging - NICHT VERWENDEN',
  },
  {
    gpio: 6,
    category: 'avoid',
    label: 'GPIO 6-11 (Flash)',
    features: [],
    recommendedFor: 'both',
    warning: 'Verbunden mit internem Flash - NICHT VERWENDEN',
  },
]

// =============================================================================
// XIAO ESP32-C3 GPIO CONFIGURATION
// =============================================================================

const XIAO_ESP32_C3_PINS: GpioPin[] = [
  // XIAO ESP32-C3 has fewer GPIOs available
  {
    gpio: 2,
    category: 'recommended',
    label: 'D0 / GPIO 2',
    features: ['ADC', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 3,
    category: 'recommended',
    label: 'D1 / GPIO 3',
    features: ['ADC', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 4,
    category: 'recommended',
    label: 'D2 / GPIO 4',
    features: ['ADC', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 5,
    category: 'recommended',
    label: 'D3 / GPIO 5',
    features: ['ADC', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 6,
    category: 'available',
    label: 'D4 / GPIO 6 (I2C SDA)',
    features: ['I2C', 'PWM'],
    recommendedFor: 'sensor',
    notes: 'Standard I2C Data',
  },
  {
    gpio: 7,
    category: 'available',
    label: 'D5 / GPIO 7 (I2C SCL)',
    features: ['I2C', 'PWM'],
    recommendedFor: 'sensor',
    notes: 'Standard I2C Clock',
  },
  {
    gpio: 8,
    category: 'available',
    label: 'D6 / GPIO 8 (SPI SCK)',
    features: ['SPI', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 9,
    category: 'available',
    label: 'D7 / GPIO 9 (SPI MISO)',
    features: ['SPI', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 10,
    category: 'available',
    label: 'D8 / GPIO 10 (SPI MOSI)',
    features: ['SPI', 'PWM'],
    recommendedFor: 'both',
  },
  {
    gpio: 20,
    category: 'caution',
    label: 'D9 / GPIO 20 (RX)',
    features: ['UART'],
    recommendedFor: 'both',
    warning: 'UART RX - Mit Vorsicht verwenden',
  },
  {
    gpio: 21,
    category: 'caution',
    label: 'D10 / GPIO 21 (TX)',
    features: ['UART'],
    recommendedFor: 'both',
    warning: 'UART TX - Mit Vorsicht verwenden',
  },
]

// =============================================================================
// GPIO CONFIG MAP
// =============================================================================

const GPIO_CONFIGS: Record<HardwareType, GpioPin[]> = {
  ESP32_WROOM: ESP32_WROOM_PINS,
  XIAO_ESP32_C3: XIAO_ESP32_C3_PINS,
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get all GPIO pins for a hardware type.
 *
 * @param hardwareType - Hardware type (defaults to ESP32_WROOM)
 * @returns Array of GPIO pin configurations
 */
export function getGpioConfig(hardwareType: HardwareType = 'ESP32_WROOM'): GpioPin[] {
  return GPIO_CONFIGS[hardwareType] || GPIO_CONFIGS.ESP32_WROOM
}

/**
 * Get available GPIO pins (excludes pins already in use).
 *
 * @param hardwareType - Hardware type
 * @param usedPins - Array of already used GPIO pins
 * @returns Filtered array of available GPIO pins
 */
export function getAvailablePins(
  hardwareType: HardwareType = 'ESP32_WROOM',
  usedPins: number[] = []
): GpioPin[] {
  const allPins = getGpioConfig(hardwareType)
  return allPins.filter(pin => !usedPins.includes(pin.gpio))
}

/**
 * Get GPIO pins grouped by category.
 *
 * @param hardwareType - Hardware type
 * @param usedPins - Already used pins (will be marked as unavailable)
 */
export function getGpiosByCategory(
  hardwareType: HardwareType = 'ESP32_WROOM',
  usedPins: number[] = []
): Record<GpioCategory, GpioPin[]> {
  const allPins = getGpioConfig(hardwareType)

  const grouped: Record<GpioCategory, GpioPin[]> = {
    recommended: [],
    available: [],
    input_only: [],
    caution: [],
    avoid: [],
  }

  for (const pin of allPins) {
    if (!usedPins.includes(pin.gpio)) {
      grouped[pin.category].push(pin)
    }
  }

  return grouped
}

/**
 * Get GPIO pins suitable for sensors.
 */
export function getSensorGpios(
  hardwareType: HardwareType = 'ESP32_WROOM',
  usedPins: number[] = []
): GpioPin[] {
  return getAvailablePins(hardwareType, usedPins).filter(
    pin =>
      pin.category !== 'avoid' &&
      (pin.recommendedFor === 'sensor' || pin.recommendedFor === 'both')
  )
}

/**
 * Get GPIO pins suitable for actuators.
 */
export function getActuatorGpios(
  hardwareType: HardwareType = 'ESP32_WROOM',
  usedPins: number[] = []
): GpioPin[] {
  return getAvailablePins(hardwareType, usedPins).filter(
    pin =>
      pin.category !== 'avoid' &&
      pin.category !== 'input_only' &&
      (pin.recommendedFor === 'actuator' || pin.recommendedFor === 'both')
  )
}

/**
 * Get information about a specific GPIO pin.
 */
export function getGpioInfo(
  gpio: number,
  hardwareType: HardwareType = 'ESP32_WROOM'
): GpioPin | undefined {
  return getGpioConfig(hardwareType).find(pin => pin.gpio === gpio)
}

/**
 * Check if a GPIO is recommended for use.
 */
export function isGpioRecommended(
  gpio: number,
  hardwareType: HardwareType = 'ESP32_WROOM'
): boolean {
  const pin = getGpioInfo(gpio, hardwareType)
  return pin?.category === 'recommended'
}

/**
 * Check if a GPIO should be avoided.
 */
export function isGpioAvoid(
  gpio: number,
  hardwareType: HardwareType = 'ESP32_WROOM'
): boolean {
  const pin = getGpioInfo(gpio, hardwareType)
  return pin?.category === 'avoid'
}

/**
 * Get warning message for a GPIO pin.
 */
export function getGpioWarning(
  gpio: number,
  hardwareType: HardwareType = 'ESP32_WROOM'
): string | null {
  const pin = getGpioInfo(gpio, hardwareType)
  return pin?.warning || null
}

/**
 * Get German category label.
 */
export function getCategoryLabel(category: GpioCategory): string {
  const labels: Record<GpioCategory, string> = {
    recommended: 'Empfohlen',
    available: 'Verfügbar',
    input_only: 'Nur Eingang',
    caution: 'Mit Vorsicht',
    avoid: 'Vermeiden',
  }
  return labels[category]
}

/**
 * Get category color class.
 */
export function getCategoryColorClass(category: GpioCategory): string {
  const classes: Record<GpioCategory, string> = {
    recommended: 'text-success',
    available: 'text-info',
    input_only: 'text-warning',
    caution: 'text-warning',
    avoid: 'text-error',
  }
  return classes[category]
}

// =============================================================================
// GPIO RECOMMENDATIONS (Phase 5)
// =============================================================================

/**
 * Get recommended GPIOs for a specific sensor/actuator type.
 *
 * Returns pins that are particularly suitable based on:
 * - Electrical characteristics (ADC for analog sensors)
 * - Common usage patterns
 * - Hardware limitations
 *
 * @param componentType - Sensor or actuator type (e.g., "DS18B20", "pH", "pump")
 * @param category - 'sensor' or 'actuator' (default: 'sensor')
 * @returns Array of recommended GPIO numbers
 *
 * @example
 * getRecommendedGpios('DS18B20', 'sensor')  // [4, 5, 13, 14, 15]
 * getRecommendedGpios('pH', 'sensor')       // [32, 33, 34, 35, 36, 39] (ADC pins)
 * getRecommendedGpios('pump', 'actuator')   // [4, 5, 12, 13, ...]
 */
export function getRecommendedGpios(
  componentType: string,
  category: 'sensor' | 'actuator' = 'sensor'
): number[] {
  // Sensor/Actuator type-based recommendations
  const recommendations: Record<string, number[]> = {
    // Temperature sensors (OneWire) - general purpose GPIOs
    'ds18b20': [4, 5, 13, 14, 15],
    'temperature': [4, 5, 13, 14, 15],

    // I2C sensors - standard I2C pins
    'sht31': [21, 22],
    'bme280': [21, 22],
    'aht20': [21, 22],
    'humidity': [21, 22],
    'i2c': [21, 22],

    // Analog sensors - ADC-capable pins only (ADC1: 32-39)
    'ph': [32, 33, 34, 35, 36, 39],
    'ec': [32, 33, 34, 35, 36, 39],
    'moisture': [32, 33, 34, 35, 36, 39],
    'soil_moisture': [32, 33, 34, 35, 36, 39],
    'water_level': [32, 33, 34, 35, 36, 39],
    'light': [32, 33, 34, 35, 36, 39],
    'ldr': [32, 33, 34, 35, 36, 39],
    'analog': [32, 33, 34, 35, 36, 39],

    // CO2 sensors (usually I2C or UART)
    'co2': [21, 22, 16, 17],
    'scd30': [21, 22],
    'scd40': [21, 22],

    // Pressure sensors (I2C)
    'pressure': [21, 22],
    'bmp280': [21, 22],

    // Flow sensors (digital pulse counting)
    'flow': [4, 5, 13, 14, 15, 16, 17, 18, 19],

    // Actuators - output-capable GPIOs (avoid strapping pins)
    'relay': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27],
    'pump': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27],
    'valve': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27],
    'heater': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27],
    'cooler': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27],

    // PWM actuators - PWM-capable pins
    'pwm': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27],
    'fan': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 25, 26, 27],
    'led': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 25, 26, 27],
    'dimmer': [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 25, 26, 27],
  }

  const normalizedType = componentType.toLowerCase().trim()

  // Direct match
  if (recommendations[normalizedType]) {
    return recommendations[normalizedType]
  }

  // Partial match (e.g., "ds18b20_temperature" matches "ds18b20")
  for (const [key, gpios] of Object.entries(recommendations)) {
    if (normalizedType.includes(key) || key.includes(normalizedType)) {
      return gpios
    }
  }

  // Default based on category
  if (category === 'actuator') {
    // Actuators: output-capable GPIOs
    return [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27]
  }

  // Sensors: all general-purpose GPIOs
  return [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27]
}

// =============================================================================
// DYNAMIC STATUS INTEGRATION (Phase 3)
// =============================================================================

import type { GpioStatusResponse, GpioPinStatus } from '@/types/gpio'

/**
 * Merge static GPIO config with dynamic status from server.
 *
 * Combines hardware-specific pin definitions with actual usage status.
 * Used when you need both static pin info (features, warnings) and
 * dynamic status (available/reserved).
 *
 * @param hardwareType - ESP32 variant
 * @param dynamicStatus - Status from GET /gpio-status (or null if not loaded)
 * @returns Enriched pin list with both static info and usage status
 */
export function mergeGpioConfigWithStatus(
  hardwareType: HardwareType,
  dynamicStatus: GpioStatusResponse | null
): GpioPinStatus[] {
  const staticConfig = getGpioConfig(hardwareType)

  if (!dynamicStatus) {
    // Fallback: Only static info, all marked as unknown
    return staticConfig.map(pin => ({
      gpio: pin.gpio,
      available: false,  // Unknown = unavailable (safe default)
      owner: null,
      component: null,
      name: pin.label,
      statusClass: 'system' as const,
      tooltip: `GPIO ${pin.gpio} - Status unbekannt`
    }))
  }

  return staticConfig.map(pin => {
    // Check if in system pins
    if (dynamicStatus.system.includes(pin.gpio)) {
      return {
        gpio: pin.gpio,
        available: false,
        owner: 'system' as const,
        component: pin.label,
        name: null,
        statusClass: 'system' as const,
        tooltip: `GPIO ${pin.gpio} - System (${pin.label})`
      }
    }

    // Check if reserved
    const reserved = dynamicStatus.reserved.find(r => r.gpio === pin.gpio)
    if (reserved) {
      const ownerLabel = reserved.owner === 'sensor' ? 'Sensor' :
                         reserved.owner === 'actuator' ? 'Aktor' : 'System'
      return {
        gpio: pin.gpio,
        available: false,
        owner: reserved.owner,
        component: reserved.component,
        name: reserved.name,
        statusClass: reserved.owner as 'sensor' | 'actuator' | 'system',
        tooltip: `GPIO ${pin.gpio} - ${ownerLabel}: ${reserved.name || reserved.component}`
      }
    }

    // Available
    if (dynamicStatus.available.includes(pin.gpio)) {
      return {
        gpio: pin.gpio,
        available: true,
        owner: null,
        component: null,
        name: pin.label,
        statusClass: 'available' as const,
        tooltip: `GPIO ${pin.gpio} - Verfügbar (${pin.label})`
      }
    }

    // Unknown (not in any list)
    return {
      gpio: pin.gpio,
      available: false,
      owner: null,
      component: null,
      name: pin.label,
      statusClass: 'system' as const,
      tooltip: `GPIO ${pin.gpio} - Status unbekannt`
    }
  })
}
