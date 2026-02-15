/**
 * Dashboard Components
 *
 * Components for the three-level zoom dashboard:
 * - Level 1: ESP-Orbital view (ActionBar, ZoneGroups, CrossEspConnections)
 * - Level 2: Komponentenübersicht (ComponentCard for all sensors+actuators)
 * - Level 3: Zonen-Navigator (ZonePlate with device dots and subzone areas)
 * - Navigation: LevelNavigation tabs (ESPs | Komponenten | Zonen)
 */

// Navigation
export { default as LevelNavigation } from './LevelNavigation.vue'

// Level 1: ESP-Orbital
export { default as ActionBar } from './ActionBar.vue'
export { default as StatCard } from './StatCard.vue'
export { default as StatusPill } from './StatusPill.vue'
export { default as ComponentSidebar } from './ComponentSidebar.vue'
export { default as SensorSidebar } from './SensorSidebar.vue'
export { default as ActuatorSidebar } from './ActuatorSidebar.vue'
export { default as UnassignedDropBar } from './UnassignedDropBar.vue'
export { default as CrossEspConnectionOverlay } from './CrossEspConnectionOverlay.vue'

// Level 2: Komponentenübersicht
export { default as ComponentCard } from './ComponentCard.vue'
export type { ComponentCardItem } from './ComponentCard.vue'

// Level 3: Zonen-Navigator
export { default as ZonePlate } from './ZonePlate.vue'
