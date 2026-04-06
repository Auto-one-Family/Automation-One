/**
 * useCalibrationWizard Composable
 *
 * Orchestrates the full calibration wizard flow:
 *   select → point1 → point2 → confirm → done | error
 *
 * Consolidates phase machine, EC presets, sensor type presets,
 * device selection, API submission, and navigation logic.
 *
 * Delegates math/point-state to useCalibration (pure computation layer).
 *
 * Phase: F-P1 (State-Refactor)
 */

import { ref, computed, onUnmounted, getCurrentInstance, type Ref, type ComputedRef } from 'vue'
import { calibrationApi } from '@/api/calibration'
import type { CalibrationPoint, CalibrateResponse } from '@/api/calibration'
import { sensorsApi } from '@/api/sensors'
import { formatUiApiError, toUiApiError } from '@/api/uiApiError'
import { useUiStore } from '@/shared/stores/ui.store'
import { useWebSocket } from '@/composables/useWebSocket'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardPhase = 'select' | 'point1' | 'point2' | 'confirm' | 'done' | 'error'

export type CalibrationSensorType = 'ph' | 'ec' | 'moisture' | 'soil_moisture' | 'temperature'

export type EcPresetId = '0_1413' | '1413_12880' | 'custom'

export interface SensorTypePreset {
  label: string
  point1Label: string
  point1Ref: number
  point2Label: string
  point2Ref: number
}

export interface UseCalibrationWizardOptions {
  /** If true, skip the 'select' phase (device already known) */
  skipSelect?: boolean
  /** Pre-selected ESP ID */
  espId?: string
  /** Pre-selected GPIO */
  gpio?: number
  /** Pre-selected sensor type */
  sensorType?: string
}

export interface UseCalibrationWizardReturn {
  // Phase machine
  phase: Ref<WizardPhase>
  isActive: ComputedRef<boolean>

  // Selection state
  selectedEspId: Ref<string>
  selectedGpio: Ref<number | null>
  selectedSensorType: Ref<string>
  ecPreset: Ref<EcPresetId>

  // Data
  points: Ref<CalibrationPoint[]>
  calibrationResult: Ref<CalibrateResponse | null>
  errorMessage: Ref<string>
  isSubmitting: Ref<boolean>

  // F-P2: Live trigger state
  isMeasuring: Ref<boolean>
  lastRawValue: Ref<number | null>
  measurementQuality: Ref<string>
  currentSessionId: Ref<string | null>

  // Presets
  sensorTypePresets: Record<string, SensorTypePreset>
  EC_PRESETS: typeof EC_PRESETS
  currentPreset: ComputedRef<SensorTypePreset | undefined>

  // Helpers
  getSuggestedReference: (stepNumber: 1 | 2) => number | undefined
  getReferenceLabel: (stepNumber: 1 | 2) => string | undefined

  // Actions
  selectSensor: (espId: string, gpio: number, sensorType: string) => void
  onPoint1Captured: (point: CalibrationPoint) => Promise<void>
  onPoint2Captured: (point: CalibrationPoint) => Promise<void>
  submitCalibration: () => Promise<void>
  triggerLiveMeasurement: () => Promise<void>
  setLastRawValue: (rawValue: number | null, quality?: string) => void
  overwritePoint: (role: 'dry' | 'wet', point: CalibrationPoint) => Promise<void>
  deletePoint: (role: 'dry' | 'wet') => Promise<void>
  goBack: () => void
  handleAbort: () => Promise<void>
  reset: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** EC calibration presets (NIST-certified standards) */
export const EC_PRESETS = {
  '0_1413': { point1: 0, point2: 1413, label: '0 / 1413 µS/cm' },
  '1413_12880': { point1: 1413, point2: 12880, label: '1413 / 12.880 µS/cm' },
} as const

/** Reference values and labels per sensor type */
export const SENSOR_TYPE_PRESETS: Record<string, SensorTypePreset> = {
  ph: {
    label: 'pH-Sensor',
    point1Label: 'pH 4.0 Pufferloesung',
    point1Ref: 4.0,
    point2Label: 'pH 7.0 Pufferloesung',
    point2Ref: 7.0,
  },
  ec: {
    label: 'EC-Sensor',
    point1Label: '1413 µS/cm KCl-Standard',
    point1Ref: 1413,
    point2Label: '12.880 µS/cm KCl-Standard',
    point2Ref: 12880,
  },
  moisture: {
    label: 'Feuchtigkeitssensor',
    point1Label: 'Trockener Zustand (0%)',
    point1Ref: 0,
    point2Label: 'Vollstaendig nass (100%)',
    point2Ref: 100,
  },
  soil_moisture: {
    label: 'Feuchtigkeitssensor',
    point1Label: 'Trockener Zustand (0%)',
    point1Ref: 0,
    point2Label: 'Vollstaendig nass (100%)',
    point2Ref: 100,
  },
  temperature: {
    label: 'Temperatursensor',
    point1Label: 'Eiswasser (0°C)',
    point1Ref: 0,
    point2Label: 'Kochendes Wasser (100°C)',
    point2Ref: 100,
  },
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useCalibrationWizard(
  options: UseCalibrationWizardOptions = {},
): UseCalibrationWizardReturn {
  const uiStore = useUiStore()

  // ── Phase machine ───────────────────────────────────────────────────────
  const phase = ref<WizardPhase>(options.skipSelect ? 'point1' : 'select')

  const isActive = computed(() => phase.value !== 'select')

  // ── Selection state ─────────────────────────────────────────────────────
  const selectedEspId = ref(options.espId ?? '')
  const selectedGpio = ref<number | null>(options.gpio ?? null)
  const selectedSensorType = ref(options.sensorType ?? '')
  const ecPreset = ref<EcPresetId>('1413_12880')

  // ── Data ────────────────────────────────────────────────────────────────
  const points = ref<CalibrationPoint[]>([])
  const calibrationResult = ref<CalibrateResponse | null>(null)
  const errorMessage = ref('')
  const isSubmitting = ref(false)

  // ── F-P2: Live Trigger state ───────────────────────────────────────────
  const isMeasuring = ref(false)
  const lastRawValue = ref<number | null>(null)
  const measurementQuality = ref('unknown')
  const currentSessionId = ref<string | null>(null)

  const ws = useWebSocket({
    filters: {
      types: ['calibration_measurement_received', 'calibration_measurement_failed'],
    },
  })

  const unsubscribeMeasurement = ws.on('calibration_measurement_received', (message) => {
    const data = message.data ?? {}
    if (
      data.esp_id !== selectedEspId.value ||
      data.gpio !== selectedGpio.value
    ) {
      return
    }
    if (
      currentSessionId.value &&
      data.session_id &&
      data.session_id !== currentSessionId.value
    ) {
      return
    }

    const rawValue = Number(data.raw_value ?? data.raw)
    if (Number.isFinite(rawValue)) {
      setLastRawValue(rawValue, String(data.quality ?? 'good'))
    }
  })

  const unsubscribeMeasurementFailed = ws.on('calibration_measurement_failed', (message) => {
    const data = message.data ?? {}
    if (
      data.esp_id !== selectedEspId.value ||
      data.gpio !== selectedGpio.value
    ) {
      return
    }
    measurementQuality.value = 'error'
    errorMessage.value = String(data.error ?? 'Messung fehlgeschlagen')
  })

  const cleanupWebSocketBindings = () => {
    unsubscribeMeasurement()
    unsubscribeMeasurementFailed()
    ws.cleanup()
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      cleanupWebSocketBindings()
    })
  }

  // ── Computed ────────────────────────────────────────────────────────────
  const currentPreset = computed(() => SENSOR_TYPE_PRESETS[selectedSensorType.value])

  /** EC reference values from preset, or undefined for custom */
  const ecPointRefs = computed(() => {
    if (selectedSensorType.value !== 'ec') return null
    if (ecPreset.value === 'custom') return { point1: undefined, point2: undefined }
    const preset = EC_PRESETS[ecPreset.value]
    return preset ? { point1: preset.point1, point2: preset.point2 } : null
  })

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getSuggestedReference(stepNumber: 1 | 2): number | undefined {
    if (selectedSensorType.value === 'ec' && ecPointRefs.value) {
      return stepNumber === 1 ? ecPointRefs.value.point1 : ecPointRefs.value.point2
    }
    const preset = currentPreset.value
    return stepNumber === 1 ? preset?.point1Ref : preset?.point2Ref
  }

  function getReferenceLabel(stepNumber: 1 | 2): string | undefined {
    if (selectedSensorType.value === 'ec' && ecPreset.value !== 'custom') {
      const preset = EC_PRESETS[ecPreset.value as keyof typeof EC_PRESETS]
      if (preset) {
        return stepNumber === 1
          ? `${preset.point1} µS/cm KCl-Standard`
          : `${preset.point2} µS/cm KCl-Standard`
      }
    }
    const preset = currentPreset.value
    return stepNumber === 1 ? preset?.point1Label : preset?.point2Label
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  function selectSensor(espId: string, gpio: number, sensorType: string) {
    selectedEspId.value = espId
    selectedGpio.value = gpio
    selectedSensorType.value = sensorType
    points.value = []
    calibrationResult.value = null
    errorMessage.value = ''
    phase.value = 'point1'
  }

  async function ensureSessionStarted(): Promise<string> {
    if (currentSessionId.value) return currentSessionId.value
    const session = await calibrationApi.startSession({
      esp_id: selectedEspId.value,
      gpio: selectedGpio.value ?? 0,
      sensor_type: selectedSensorType.value,
      method: 'linear_2point',
      expected_points: 2,
    })
    currentSessionId.value = session.id
    return session.id
  }

  async function persistPoint(
    role: 'dry' | 'wet',
    point: CalibrationPoint,
    options: { confirmOverwrite?: boolean } = {},
  ): Promise<boolean> {
    if (selectedGpio.value === null || !selectedEspId.value || !selectedSensorType.value) {
      throw new Error('Sensorauswahl unvollstaendig')
    }

    const sessionId = await ensureSessionStarted()
    const hasExistingRole = points.value.some((existing) => existing.point_role === role)
    if (hasExistingRole && options.confirmOverwrite) {
      const overwriteConfirmed = await uiStore.confirm({
        title: 'Kalibrierpunkt ueberschreiben?',
        message: `Der Punkt '${role}' existiert bereits. Soll er durch den neuen Messwert ersetzt werden?`,
        variant: 'warning',
        confirmText: 'Ueberschreiben',
      })
      if (!overwriteConfirmed) {
        return false
      }
    }
    const sessionState = await calibrationApi.addPoint(sessionId, {
      raw_value: point.raw,
      reference_value: point.reference,
      point_role: role,
      overwrite: hasExistingRole,
      quality: measurementQuality.value || 'good',
    })
    const persistedPoints = Array.isArray(sessionState.calibration_points?.points)
      ? sessionState.calibration_points.points
      : []
    const persisted = persistedPoints.find((candidate) => candidate.point_role === role)

    const normalizedPoint: CalibrationPoint = {
      ...point,
      point_role: role,
      point_id: typeof persisted?.id === 'string' ? persisted.id : undefined,
    }

    if (hasExistingRole) {
      points.value = points.value.map((existing) =>
        existing.point_role === role ? normalizedPoint : existing,
      )
      return true
    }

    if (role === 'dry') {
      points.value = [
        normalizedPoint,
        ...points.value.filter((entry) => entry.point_role !== 'dry'),
      ]
      return true
    }

    points.value = [
      ...points.value.filter((entry) => entry.point_role !== 'wet'),
      normalizedPoint,
    ]
    return true
  }

  async function onPoint1Captured(point: CalibrationPoint): Promise<void> {
    const persisted = await persistPoint('dry', point, { confirmOverwrite: true })
    if (persisted) {
      phase.value = 'point2'
    }
  }

  async function onPoint2Captured(point: CalibrationPoint): Promise<void> {
    const persisted = await persistPoint('wet', point, { confirmOverwrite: true })
    if (persisted) {
      phase.value = 'confirm'
    }
  }

  async function submitCalibration(): Promise<void> {
    if (selectedGpio.value === null) return

    const validPoints = points.value.filter((point) =>
      Number.isFinite(point.raw) && Number.isFinite(point.reference),
    )
    if (validPoints.length < 2) {
      phase.value = 'error'
      errorMessage.value = `Kalibrierung benötigt 2 gueltige Punkte, vorhanden: ${validPoints.length}.`
      return
    }

    isSubmitting.value = true
    errorMessage.value = ''
    try {
      const sessionId = await ensureSessionStarted()
      const requiredRoles: Array<'dry' | 'wet'> = ['dry', 'wet']
      const hasAllRoles = requiredRoles.every((role) =>
        points.value.some((point) => point.point_role === role),
      )
      if (!hasAllRoles) {
        for (let index = 0; index < requiredRoles.length; index += 1) {
          const role = requiredRoles[index]
          const point = validPoints[index]
          if (!points.value.some((entry) => entry.point_role === role)) {
            await persistPoint(role, point)
          }
        }
      }

      let sessionState = await calibrationApi.finalizeSession(sessionId)
      sessionState = await calibrationApi.applySession(sessionId)

      calibrationResult.value = {
        success: String(sessionState.status).toLowerCase() === 'applied',
        calibration: sessionState.calibration_result ?? {},
        sensor_type: sessionState.sensor_type,
        method: sessionState.method,
        saved: String(sessionState.status).toLowerCase() === 'applied',
        message: sessionState.failure_reason ?? null,
      }
      phase.value = calibrationResult.value.success ? 'done' : 'error'
      if (!calibrationResult.value.success) {
        errorMessage.value = calibrationResult.value.message ?? 'Kalibrierung fehlgeschlagen'
      }
    } catch (err: unknown) {
      phase.value = 'error'
      const uiError = toUiApiError(err, 'Kalibrierung fehlgeschlagen')
      errorMessage.value = formatUiApiError(uiError)
    } finally {
      isSubmitting.value = false
    }
  }

  /**
   * F-P2: Trigger a live measurement via MQTT command.
   *
   * Sends POST /sensors/{esp_id}/{gpio}/measure to the server,
   * which publishes a sensor command via MQTT. The ESP32 responds
   * on sensor/{gpio}/response, and the CalibrationResponseHandler (S-P5)
   * processes it and broadcasts via WebSocket (S-P6).
   *
   * The raw value is stored in lastRawValue for the wizard to display.
   * The actual point capture still requires user confirmation with a reference value.
   */
  async function triggerLiveMeasurement(): Promise<void> {
    if (selectedGpio.value === null || !selectedEspId.value) return
    isMeasuring.value = true
    errorMessage.value = ''
    try {
      if (!currentSessionId.value) {
        const session = await calibrationApi.startSession({
          esp_id: selectedEspId.value,
          gpio: selectedGpio.value,
          sensor_type: selectedSensorType.value,
          method: 'linear_2point',
          expected_points: 2,
        })
        currentSessionId.value = session.id
      }
      await sensorsApi.triggerMeasurement(selectedEspId.value, selectedGpio.value)
    } catch (err: unknown) {
      errorMessage.value = err instanceof Error ? err.message : 'Messung fehlgeschlagen'
      measurementQuality.value = 'error'
    } finally {
      isMeasuring.value = false
    }
  }

  function setLastRawValue(rawValue: number | null, quality = 'good'): void {
    lastRawValue.value = rawValue
    measurementQuality.value = quality
  }

  async function overwritePoint(role: 'dry' | 'wet', point: CalibrationPoint): Promise<void> {
    if (!currentSessionId.value) {
      throw new Error('Keine aktive Kalibrier-Session vorhanden')
    }
    await persistPoint(role, point, { confirmOverwrite: true })
  }

  async function deletePoint(role: 'dry' | 'wet'): Promise<void> {
    if (!currentSessionId.value) {
      throw new Error('Keine aktive Kalibrier-Session vorhanden')
    }
    const confirmed = await uiStore.confirm({
      title: 'Kalibrierpunkt loeschen?',
      message: `Soll der Punkt '${role}' wirklich aus der Session entfernt werden?`,
      variant: 'warning',
      confirmText: 'Loeschen',
    })
    if (!confirmed) return

    const target = points.value.find((point) => point.point_role === role && point.point_id)
    if (!target?.point_id) {
      throw new Error(`Kalibrierpunkt '${role}' hat keine Point-ID`)
    }
    await calibrationApi.deletePoint(currentSessionId.value, target.point_id)
    points.value = points.value.filter((point) => point.point_role !== role)
    phase.value = role === 'dry' ? 'point1' : 'point2'
  }

  /** Navigate back one phase */
  function goBack() {
    if (isSubmitting.value) return

    const backMap: Partial<Record<WizardPhase, WizardPhase>> = {
      point1: 'select',
      point2: 'point1',
      confirm: 'point2',
      error: 'confirm',
    }
    const target = backMap[phase.value]
    if (target) {
      // If going back past select and skipSelect was used, stay at point1
      if (target === 'select' && options.skipSelect) return
      phase.value = target
    }
  }

  /** Abort with confirmation if data captured */
  async function handleAbort(): Promise<void> {
    if (isSubmitting.value) return

    if (points.value.length > 0) {
      const confirmed = await uiStore.confirm({
        title: 'Kalibrierung abbrechen?',
        message: 'Erfasste Daten gehen verloren. Wirklich abbrechen?',
        variant: 'danger',
      })
      if (!confirmed) return
    }

    if (currentSessionId.value) {
      try {
        await calibrationApi.deleteSession(currentSessionId.value, 'User aborted calibration flow')
      } catch {
        // Best-effort discard, keep local reset deterministic.
      }
    }
    reset()
  }

  /** Reset to initial state */
  function reset() {
    phase.value = options.skipSelect ? 'point1' : 'select'
    if (!options.espId) selectedEspId.value = ''
    if (options.gpio === undefined) selectedGpio.value = null
    if (!options.sensorType) selectedSensorType.value = ''
    ecPreset.value = '1413_12880'
    points.value = []
    calibrationResult.value = null
    errorMessage.value = ''
    isMeasuring.value = false
    lastRawValue.value = null
    measurementQuality.value = 'unknown'
    currentSessionId.value = null
  }

  return {
    // Phase machine
    phase,
    isActive,

    // Selection state
    selectedEspId,
    selectedGpio,
    selectedSensorType,
    ecPreset,

    // Data
    points,
    calibrationResult,
    errorMessage,
    isSubmitting,

    // F-P2: Live trigger state
    isMeasuring,
    lastRawValue,
    measurementQuality,
    currentSessionId,

    // Presets
    sensorTypePresets: SENSOR_TYPE_PRESETS,
    EC_PRESETS,
    currentPreset,

    // Helpers
    getSuggestedReference,
    getReferenceLabel,

    // Actions
    selectSensor,
    onPoint1Captured,
    onPoint2Captured,
    submitCalibration,
    triggerLiveMeasurement,
    setLastRawValue,
    overwritePoint,
    deletePoint,
    goBack,
    handleAbort,
    reset,
  }
}
