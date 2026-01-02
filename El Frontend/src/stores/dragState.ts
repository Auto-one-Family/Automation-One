/**
 * Drag State Store (Industrial-Grade)
 *
 * Globaler State für Drag-and-Drop-Operationen.
 * Ermöglicht visuelles Feedback über Komponenten hinweg.
 *
 * Features:
 * - Sensor-Typ Drag aus Sidebar
 * - Sensor-Satellite Drag für Auto-Opening Chart
 * - ESP-Cards können auf Drag-State reagieren (dashed border)
 * - Zentrale Payload-Verwaltung
 * - Safety-Cleanup: Automatisches Reset bei hängendem State
 * - Globale Event-Listener für Edge-Cases
 *
 * @version 2.0 - Industrial-Grade mit Safety-Cleanup
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximale Zeit (ms) die ein Drag-Vorgang dauern darf.
 * Nach diesem Timeout wird der State automatisch zurückgesetzt.
 * Verhindert "hängende" UI-States bei fehlgeschlagenen Drag-Events.
 */
const DRAG_TIMEOUT_MS = 30000 // 30 Sekunden

/**
 * Debug-Modus aktivieren (für Entwicklung)
 */
const DEBUG = import.meta.env.DEV

// =============================================================================
// Types
// =============================================================================

/**
 * Payload für Sensor-Typ-Drag aus der Sidebar
 */
export interface SensorTypeDragPayload {
  action: 'add-sensor'
  sensorType: string
  label: string
  defaultUnit: string
  icon: string
}

/**
 * Payload für Sensor-Satellite-Drag für Chart-Analyse
 */
export interface SensorDragPayload {
  type: 'sensor'
  espId: string
  gpio: number
  sensorType: string
  name: string
  unit: string
}

/**
 * Drag-Statistiken für Debugging
 */
interface DragStats {
  startCount: number
  endCount: number
  timeoutCount: number
  lastDragDuration: number
}

// =============================================================================
// Store
// =============================================================================

export const useDragStateStore = defineStore('dragState', () => {
  // ============================================
  // State
  // ============================================

  /** True wenn ein Sensor-Typ aus der Sidebar gedraggt wird */
  const isDraggingSensorType = ref(false)

  /** Aktueller Drag-Payload (Sensor-Typ-Daten) */
  const sensorTypePayload = ref<SensorTypeDragPayload | null>(null)

  /** True wenn ein Sensor-Satellite für Chart-Analyse gedraggt wird */
  const isDraggingSensor = ref(false)

  /** Aktueller Sensor-Drag-Payload */
  const sensorPayload = ref<SensorDragPayload | null>(null)

  /** ESP-ID des aktuell gedraggten Sensors (für Auto-Open Chart) */
  const draggingSensorEspId = ref<string | null>(null)

  /** Zeitpunkt des Drag-Starts (für Timeout-Detection) */
  const dragStartTime = ref<number | null>(null)

  /** Safety-Timeout Timer ID */
  let safetyTimeoutId: ReturnType<typeof setTimeout> | null = null

  /** Statistiken für Debugging */
  const stats = ref<DragStats>({
    startCount: 0,
    endCount: 0,
    timeoutCount: 0,
    lastDragDuration: 0,
  })

  // ============================================
  // Computed
  // ============================================

  /** True wenn irgendein Drag aktiv ist */
  const isAnyDragActive = computed(() =>
    isDraggingSensorType.value || isDraggingSensor.value
  )

  /** Aktuelle Drag-Dauer in ms (für Debugging) */
  const currentDragDuration = computed(() => {
    if (!dragStartTime.value) return 0
    return Date.now() - dragStartTime.value
  })

  // ============================================
  // Internal Methods
  // ============================================

  /**
   * Startet den Safety-Timeout.
   * Resettet den State automatisch falls dragend nie aufgerufen wird.
   */
  function startSafetyTimeout(): void {
    clearSafetyTimeout()

    safetyTimeoutId = setTimeout(() => {
      if (isAnyDragActive.value) {
        console.warn('[DragState] Safety timeout triggered - resetting stuck drag state')
        stats.value.timeoutCount++
        endDrag()
      }
    }, DRAG_TIMEOUT_MS)
  }

  /**
   * Löscht den Safety-Timeout.
   */
  function clearSafetyTimeout(): void {
    if (safetyTimeoutId) {
      clearTimeout(safetyTimeoutId)
      safetyTimeoutId = null
    }
  }

  /**
   * Debug-Logger
   */
  function log(message: string, data?: Record<string, unknown>): void {
    if (DEBUG) {
      console.debug(`[DragState] ${message}`, data || '')
    }
  }

  // ============================================
  // Actions
  // ============================================

  /**
   * Startet einen Sensor-Typ-Drag aus der Sidebar
   */
  function startSensorTypeDrag(payload: SensorTypeDragPayload): void {
    log('Starting sensor type drag', { sensorType: payload.sensorType })

    // Reset vorheriger State (Sicherheit)
    if (isAnyDragActive.value) {
      log('Warning: Starting new drag while previous drag active - resetting')
      endDrag()
    }

    isDraggingSensorType.value = true
    sensorTypePayload.value = payload
    dragStartTime.value = Date.now()
    stats.value.startCount++

    startSafetyTimeout()
  }

  /**
   * Startet einen Sensor-Satellite-Drag für Chart-Analyse
   */
  function startSensorDrag(payload: SensorDragPayload): void {
    log('Starting sensor drag', { espId: payload.espId, gpio: payload.gpio })

    // Reset vorheriger State (Sicherheit)
    if (isAnyDragActive.value) {
      log('Warning: Starting new drag while previous drag active - resetting')
      endDrag()
    }

    isDraggingSensor.value = true
    sensorPayload.value = payload
    draggingSensorEspId.value = payload.espId
    dragStartTime.value = Date.now()
    stats.value.startCount++

    startSafetyTimeout()
  }

  /**
   * Beendet den aktuellen Drag-Vorgang.
   * Wird sowohl von Components als auch vom Safety-Timeout aufgerufen.
   */
  function endDrag(): void {
    // Berechne Drag-Dauer für Statistiken
    if (dragStartTime.value) {
      stats.value.lastDragDuration = Date.now() - dragStartTime.value
      log('Ending drag', { duration: stats.value.lastDragDuration })
    }

    // State zurücksetzen
    isDraggingSensorType.value = false
    sensorTypePayload.value = null
    isDraggingSensor.value = false
    sensorPayload.value = null
    draggingSensorEspId.value = null
    dragStartTime.value = null
    stats.value.endCount++

    clearSafetyTimeout()
  }

  /**
   * Forciert einen Reset (für manuelle Intervention)
   */
  function forceReset(): void {
    log('Force reset triggered')
    endDrag()
  }

  /**
   * Gibt Debug-Statistiken zurück
   */
  function getStats(): DragStats {
    return { ...stats.value }
  }

  // ============================================
  // Global Event Listeners (Safety Net)
  // ISSUE-003 fix: Proper cleanup to prevent memory leaks during HMR
  // ============================================

  /** Flag to track if listeners are registered (prevents duplicates during HMR) */
  let listenersRegistered = false

  /**
   * Globaler dragend Listener als Safety-Net.
   * Fängt dragend Events ab die nicht von Components behandelt werden.
   */
  function handleGlobalDragEnd(event: DragEvent): void {
    if (isAnyDragActive.value) {
      log('Global dragend caught - ensuring state cleanup', {
        target: (event.target as HTMLElement)?.tagName,
      })
      // Kleine Verzögerung um Component-Handler Zeit zu geben
      setTimeout(() => {
        if (isAnyDragActive.value) {
          log('State still active after global dragend - forcing cleanup')
          endDrag()
        }
      }, 100)
    }
  }

  /**
   * Keydown Handler für Escape-Taste.
   * Ermöglicht manuelles Abbrechen eines Drags.
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isAnyDragActive.value) {
      log('Escape pressed - canceling drag')
      endDrag()
    }
  }

  /**
   * Register global event listeners.
   * Safe to call multiple times - will only register once.
   */
  function registerListeners(): void {
    if (typeof window === 'undefined' || listenersRegistered) return

    window.addEventListener('dragend', handleGlobalDragEnd, { capture: true })
    window.addEventListener('keydown', handleKeyDown)
    listenersRegistered = true
    log('Global event listeners registered')
  }

  /**
   * Cleanup global event listeners.
   * Exportiert für Tests und explizites Cleanup bei Bedarf.
   */
  function cleanup(): void {
    if (typeof window === 'undefined' || !listenersRegistered) return

    window.removeEventListener('dragend', handleGlobalDragEnd, { capture: true })
    window.removeEventListener('keydown', handleKeyDown)
    listenersRegistered = false
    clearSafetyTimeout()
    log('Global event listeners cleaned up')
  }

  // Auto-register listeners on store creation
  registerListeners()

  // ============================================
  // Return
  // ============================================

  return {
    // State (readonly für Components)
    isDraggingSensorType,
    sensorTypePayload,
    isDraggingSensor,
    sensorPayload,
    draggingSensorEspId,

    // Computed
    isAnyDragActive,
    currentDragDuration,

    // Actions
    startSensorTypeDrag,
    startSensorDrag,
    endDrag,
    forceReset,
    getStats,

    // Lifecycle (ISSUE-003 fix)
    cleanup,
  }
})
