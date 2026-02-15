/**
 * ESP Components
 *
 * Core components for ESP device visualization and management.
 *
 * Layout:
 *   ESPOrbitalLayout — Main 3-column layout (sensors | ESP card | actuators)
 *   DeviceHeaderBar  — Compact device header (name, status, WiFi, zone, heartbeat)
 *   SensorColumn     — Sensor satellite column (left side)
 *   ActuatorColumn   — Actuator satellite column (right side)
 *
 * Cards:
 *   ESPCard          — Full ESP card (non-compact mode)
 *   SensorValueCard  — Standalone sensor value display
 *   SensorSatellite  — Sensor satellite (draggable for chart)
 *   ActuatorSatellite — Actuator satellite with command controls
 *   ConnectionLines  — SVG connection lines between components
 *
 * Modals:
 *   AddSensorModal   — Create sensor (GPIO, type, OneWire scan, operating mode)
 *   AddActuatorModal  — Create actuator (GPIO, type, safety settings)
 *   EditSensorModal  — Edit sensor config (mode, timeout, cron scheduling)
 */

// Layout components
export { default as ESPOrbitalLayout } from './ESPOrbitalLayout.vue'
export { default as DeviceHeaderBar } from './DeviceHeaderBar.vue'
export { default as SensorColumn } from './SensorColumn.vue'
export { default as ActuatorColumn } from './ActuatorColumn.vue'

// Card components
export { default as ESPCard } from './ESPCard.vue'
export { default as SensorValueCard } from './SensorValueCard.vue'
export { default as SensorSatellite } from './SensorSatellite.vue'
export { default as ActuatorSatellite } from './ActuatorSatellite.vue'
export { default as ConnectionLines } from './ConnectionLines.vue'

// Modal components
export { default as AddSensorModal } from './AddSensorModal.vue'
export { default as AddActuatorModal } from './AddActuatorModal.vue'
export { default as EditSensorModal } from './EditSensorModal.vue'

// Type exports
export type { SensorItem } from './SensorColumn.vue'
export type { ActuatorItem } from './ActuatorColumn.vue'
export type { EditableSensor } from './EditSensorModal.vue'







