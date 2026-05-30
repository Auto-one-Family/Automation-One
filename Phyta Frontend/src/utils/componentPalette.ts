import type { Component } from 'vue'
import {
  CircleDot,
  Cloud,
  Droplet,
  Droplets,
  Gauge,
  Power,
  SlidersHorizontal,
  Sun,
  Thermometer,
  ToggleLeft,
  Waves,
  Zap,
} from 'lucide-vue-next'
import { getActuatorConfig } from '@/utils/actuatorDefaults'
import { getSensorConfig, getSensorLabel } from '@/utils/sensorDefaults'

const ICON_MAP: Record<string, Component> = {
  Thermometer,
  Droplets,
  Gauge,
  Droplet,
  Zap,
  Sun,
  Cloud,
  Waves,
  CircleDot,
  ToggleLeft,
  SlidersHorizontal,
  Power,
}

export type PaletteCategory = 'all' | 'klima' | 'wasser' | 'licht' | 'energie' | 'digital'

export const PALETTE_CATEGORY_LABELS: Record<Exclude<PaletteCategory, 'all'>, string> = {
  klima: 'Klima',
  wasser: 'Wasser',
  licht: 'Licht',
  energie: 'Energie',
  digital: 'Digital',
}

/** M-1/M-2 verified palette ids — do not add types without server check. */
export const PALETTE_SENSOR_IDS = [
  'ds18b20',
  'sht31',
  'bme280',
  'ph',
  'ec',
  'moisture',
  'bh1750',
  'co2',
  'flow',
] as const

export const PALETTE_ACTUATOR_IDS = ['pump', 'valve', 'pwm', 'relay'] as const

export type PaletteSensorId = (typeof PALETTE_SENSOR_IDS)[number]
export type PaletteActuatorId = (typeof PALETTE_ACTUATOR_IDS)[number]

const SENSOR_CATEGORIES: Record<PaletteSensorId, Exclude<PaletteCategory, 'all'>> = {
  ds18b20: 'klima',
  sht31: 'klima',
  bme280: 'klima',
  co2: 'klima',
  ph: 'wasser',
  ec: 'wasser',
  moisture: 'wasser',
  flow: 'wasser',
  bh1750: 'licht',
}

const ACTUATOR_CATEGORIES: Record<PaletteActuatorId, Exclude<PaletteCategory, 'all'>> = {
  pump: 'wasser',
  valve: 'wasser',
  pwm: 'energie',
  relay: 'digital',
}

const SENSOR_PALETTE_ICONS: Record<string, Component> = {
  ds18b20: Thermometer,
  sht31: Droplets,
  bme280: Gauge,
  ph: Droplet,
  ec: Zap,
  moisture: Droplets,
  bh1750: Sun,
  co2: Cloud,
  flow: Waves,
}

/** Short chip label for compact palette grid. */
const SENSOR_SHORT_LABELS: Record<string, string> = {
  ds18b20: 'Temp.',
  sht31: 'Klima',
  bme280: 'Klima',
  ph: 'pH',
  ec: 'EC',
  moisture: 'Boden',
  bh1750: 'Licht',
  co2: 'CO₂',
  flow: 'Fluss',
}

export interface PaletteItem {
  id: string
  label: string
  shortLabel: string
  icon: Component
  kind: 'sensor' | 'actuator'
  category: Exclude<PaletteCategory, 'all'>
  hint?: string
}

function resolveIcon(name: string, fallback: Component): Component {
  return ICON_MAP[name] ?? fallback
}

export function getPaletteSensorLabel(sensorId: string): string {
  return getSensorLabel(sensorId)
}

export function buildPaletteItems(): { sensors: PaletteItem[]; actuators: PaletteItem[] } {
  const sensors: PaletteItem[] = PALETTE_SENSOR_IDS.map((id) => {
    const config = getSensorConfig(id)
    const label = getSensorLabel(id)
    return {
      id,
      kind: 'sensor' as const,
      label,
      shortLabel: SENSOR_SHORT_LABELS[id] ?? label,
      category: SENSOR_CATEGORIES[id],
      icon: SENSOR_PALETTE_ICONS[id] ?? Thermometer,
      hint: config?.description,
    }
  })

  const actuators: PaletteItem[] = PALETTE_ACTUATOR_IDS.map((id) => {
    const config = getActuatorConfig(id)
    return {
      id,
      kind: 'actuator' as const,
      label: config?.label ?? id,
      shortLabel: config?.label ?? id,
      category: ACTUATOR_CATEGORIES[id],
      icon: resolveIcon(config?.icon ?? 'Power', Power),
      hint: config?.description,
    }
  })

  return { sensors, actuators }
}
