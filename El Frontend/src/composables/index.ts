/**
 * Composables
 *
 * Vue 3 Composition API utilities for reusable logic.
 *
 * Usage:
 * import { useModal, useSwipeNavigation, useToast } from '@/composables'
 */

export { useModal, useModals } from './useModal'
export {
  useSwipeNavigation,
  useSidebarSwipe,
  useEdgeSwipe,
} from './useSwipeNavigation'
export { useZoneDragDrop, ZONE_UNASSIGNED, ZONE_UNASSIGNED_DISPLAY_NAME } from './useZoneDragDrop'
export { useToast } from './useToast'
export { useWebSocket } from './useWebSocket'
export { useConfigResponse } from './useConfigResponse'
export { useQueryFilters } from './useQueryFilters'
export type { MonitorFilters, MonitorCategory, SeverityLevel, TimeRange } from './useQueryFilters'
export { useGpioStatus } from './useGpioStatus'
export { useKeyboardShortcuts } from './useKeyboardShortcuts'
export type { KeyboardShortcut } from './useKeyboardShortcuts'
export { useContextMenu } from './useContextMenu'
export { useCommandPalette } from './useCommandPalette'
export type { CommandItem } from './useCommandPalette'
