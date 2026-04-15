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

import { ref, computed, onUnmounted, getCurrentInstance, watch, type Ref, type ComputedRef } from 'vue'
import { calibrationApi } from '@/api/calibration'
import type { CalibrationPoint, CalibrateResponse } from '@/api/calibration'
import { sensorsApi } from '@/api/sensors'
import { formatUiApiError, toUiApiError } from '@/api/uiApiError'
import { useUiStore } from '@/shared/stores/ui.store'
import { useWebSocket } from '@/composables/useWebSocket'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardPhase = 'select' | 'point1' | 'point2' | 'confirm' | 'finalizing' | 'done' | 'error'

export type CalibrationSensorType = 'ph' | 'ec' | 'moisture' | 'soil_moisture' | 'temperature'

export type EcPresetId = '0_1413' | '1413_12880' | 'custom'

export interface SensorTypePreset {
  label: string
  point1Label: string
  point1Ref: number
  point2Label?: string
  point2Ref?: number
  expectedPoints: 1 | 2
  calibrationMethod: 'moisture_2point' | 'ph_2point' | 'ec_1point'
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
  isFreshMeasurement: Ref<boolean>
  lastMeasurementAt: Ref<number | null>
  measurementRequestId: Ref<string | null>
  lifecycleState: Ref<CalibrationLifecycleState>
  lifecycleMessage: Ref<string>
  hasUnsavedWork: ComputedRef<boolean>

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
  overwritePoint: (role: 'dry' | 'wet' | 'buffer_high' | 'buffer_low' | 'reference', point: CalibrationPoint) => Promise<void>
  deletePoint: (role: 'dry' | 'wet' | 'buffer_high' | 'buffer_low' | 'reference') => Promise<void>
  goBack: () => void
  handleAbort: () => Promise<void>
  confirmLeave: () => Promise<boolean>
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
    point1Label: 'pH-Pufferloesung (z.B. pH 7,0)',
    point1Ref: 7.0,
    point2Label: 'pH-Pufferloesung (z.B. pH 4,0)',
    point2Ref: 4.0,
    expectedPoints: 2,
    calibrationMethod: 'ph_2point',
  },
  ec: {
    label: 'EC-Sensor',
    point1Label: 'Referenzloesung (z.B. 1413 µS/cm)',
    point1Ref: 1413,
    expectedPoints: 1,
    calibrationMethod: 'ec_1point',
  },
  moisture: {
    label: 'Feuchtigkeitssensor',
    point1Label: 'Trockener Zustand (0%)',
    point1Ref: 0,
    point2Label: 'Vollstaendig nass (100%)',
    point2Ref: 100,
    expectedPoints: 2,
    calibrationMethod: 'moisture_2point',
  },
  soil_moisture: {
    label: 'Feuchtigkeitssensor',
    point1Label: 'Trockener Zustand (0%)',
    point1Ref: 0,
    point2Label: 'Vollstaendig nass (100%)',
    point2Ref: 100,
    expectedPoints: 2,
    calibrationMethod: 'moisture_2point',
  },
  temperature: {
    label: 'Temperatursensor',
    point1Label: 'Eiswasser (0°C)',
    point1Ref: 0,
    point2Label: 'Kochendes Wasser (100°C)',
    point2Ref: 100,
    expectedPoints: 2,
    calibrationMethod: 'moisture_2point',
  },
}

export type CalibrationLifecycleState =
  | 'idle'
  | 'accepted'
  | 'pending'
  | 'terminal_success'
  | 'terminal_failed'
  | 'terminal_timeout'
  | 'terminal_integration_issue'

interface CalibrationDraft {
  phase: WizardPhase
  selectedEspId: string
  selectedGpio: number | null
  selectedSensorType: string
  ecPreset: EcPresetId
  points: CalibrationPoint[]
  currentSessionId: string | null
}

const DRAFT_STORAGE_KEY = 'calibration.wizard.draft.v2'
const TERMINAL_SESSION_STATUSES = new Set(['applied', 'rejected', 'failed', 'expired'])

/** Mindestabstand nach Mess-HTTP wie SensorValueCard (ESP + MQTT). */
const MEASUREMENT_TRIGGER_COOLDOWN_MS = 2000

function normalizeCalibrationSensorType(sensorType: string): string {
  const normalized = sensorType.trim().toLowerCase()
  return normalized === 'soil_moisture' ? 'moisture' : normalized
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
  const isFreshMeasurement = ref(false)
  const lastMeasurementAt = ref<number | null>(null)
  const measurementRequestId = ref<string | null>(null)
  const measurementTriggerAt = ref<number | null>(null)
  const measureCooldownTimerId = ref<ReturnType<typeof setTimeout> | null>(null)
  const lifecycleState = ref<CalibrationLifecycleState>('idle')
  const lifecycleMessage = ref('')

  function clearMeasureCooldownTimer(): void {
    if (measureCooldownTimerId.value !== null) {
      clearTimeout(measureCooldownTimerId.value)
      measureCooldownTimerId.value = null
    }
  }

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

    const intentId = typeof data.intent_id === 'string' ? data.intent_id : null
    const correlationId = typeof data.correlation_id === 'string' ? data.correlation_id : null
    if (!intentId && !correlationId) {
      isFreshMeasurement.value = false
      lifecycleState.value = 'terminal_integration_issue'
      lifecycleMessage.value = 'Messung ohne intent/correlation erhalten und verworfen.'
      return
    }

    const eventReceivedAt = Date.now()
    const triggeredAt = measurementTriggerAt.value ?? 0
    if (eventReceivedAt < triggeredAt) {
      return
    }

    const rawValue = Number(data.raw_value ?? data.raw)
    if (Number.isFinite(rawValue)) {
      setLastRawValue(rawValue, String(data.quality ?? 'good'))
      lastMeasurementAt.value = eventReceivedAt
      isFreshMeasurement.value = true
      lifecycleState.value = 'pending'
      lifecycleMessage.value = 'Frische Messung empfangen.'
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
    isFreshMeasurement.value = false
    lifecycleState.value = 'terminal_failed'
    errorMessage.value = String(data.error ?? 'Messung fehlgeschlagen')
  })

  const cleanupWebSocketBindings = () => {
    clearMeasureCooldownTimer()
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
  const hasUnsavedWork = computed(() =>
    Boolean(currentSessionId.value) ||
    points.value.length > 0 ||
    ['point1', 'point2', 'confirm'].includes(phase.value),
  )

  /** EC reference values from preset, or undefined for custom */
  const ecPointRefs = computed(() => {
    if (selectedSensorType.value !== 'ec') return null
    if (ecPreset.value === 'custom') return { point1: undefined, point2: undefined }
    const preset = EC_PRESETS[ecPreset.value]
    return preset ? { point1: preset.point1, point2: preset.point2 } : null
  })

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getSuggestedReference(stepNumber: 1 | 2): number | undefined {
    const preset = currentPreset.value
    const expectedPoints = preset?.expectedPoints ?? 2

    // For 1-point sensors (EC), only return point1
    if (expectedPoints === 1) {
      return stepNumber === 1 ? preset?.point1Ref : undefined
    }

    // For EC with custom preset, use ecPointRefs
    if (selectedSensorType.value === 'ec' && ecPointRefs.value) {
      return stepNumber === 1 ? ecPointRefs.value.point1 : ecPointRefs.value.point2
    }

    // For others (pH, moisture)
    return stepNumber === 1 ? preset?.point1Ref : preset?.point2Ref
  }

  function getReferenceLabel(stepNumber: 1 | 2): string | undefined {
    const preset = currentPreset.value
    const expectedPoints = preset?.expectedPoints ?? 2

    // For 1-point sensors (EC), only return point1 label
    if (expectedPoints === 1) {
      return stepNumber === 1 ? preset?.point1Label : undefined
    }

    // For EC with preset
    if (selectedSensorType.value === 'ec' && ecPreset.value !== 'custom') {
      const ecPresetData = EC_PRESETS[ecPreset.value as keyof typeof EC_PRESETS]
      if (ecPresetData) {
        return stepNumber === 1
          ? `${ecPresetData.point1} µS/cm KCl-Standard`
          : `${ecPresetData.point2} µS/cm KCl-Standard`
      }
    }

    // For others (pH, moisture)
    return stepNumber === 1 ? preset?.point1Label : preset?.point2Label
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  function selectSensor(espId: string, gpio: number, sensorType: string) {
    const normalizedSensorType = normalizeCalibrationSensorType(sensorType)
    if (!SENSOR_TYPE_PRESETS[normalizedSensorType]) {
      phase.value = 'error'
      errorMessage.value = `Sensor-Typ '${sensorType}' wird im Kalibrierwizard nicht unterstuetzt.`
      return
    }

    if (!Number.isInteger(gpio) || gpio < 0 || gpio > 48) {
      phase.value = 'error'
      errorMessage.value = `GPIO '${gpio}' ist ungueltig.`
      return
    }

    selectedEspId.value = espId
    selectedGpio.value = gpio
    selectedSensorType.value = normalizedSensorType
    points.value = []
    calibrationResult.value = null
    errorMessage.value = ''
    phase.value = 'point1'
    lifecycleState.value = 'idle'
    lifecycleMessage.value = ''
    isFreshMeasurement.value = false
    measurementRequestId.value = null
    measurementTriggerAt.value = null
    clearMeasureCooldownTimer()
    isMeasuring.value = false
  }

  async function ensureSessionStarted(): Promise<string> {
    if (currentSessionId.value) return currentSessionId.value
    const preset = currentPreset.value
    if (!preset) {
      throw new Error('Sensortyp-Preset nicht gefunden')
    }
    const session = await calibrationApi.startSession({
      esp_id: selectedEspId.value,
      gpio: selectedGpio.value ?? 0,
      sensor_type: selectedSensorType.value,
      method: preset.calibrationMethod,
      expected_points: preset.expectedPoints,
    })
    currentSessionId.value = session.id
    return session.id
  }

  async function persistPoint(
    role: 'dry' | 'wet' | 'buffer_high' | 'buffer_low' | 'reference',
    point: CalibrationPoint,
    options: { confirmOverwrite?: boolean } = {},
  ): Promise<boolean> {
    if (selectedGpio.value === null || !selectedEspId.value || !selectedSensorType.value) {
      throw new Error('Sensorauswahl unvollstaendig')
    }

    const sessionId = await ensureSessionStarted()
    const hasExistingRole = points.value.some((existing) => existing.point_role === role)
    if (hasExistingRole && options.confirmOverwrite) {
      const roleLabel = role === 'buffer_high' ? 'High-Buffer'
        : role === 'buffer_low' ? 'Low-Buffer'
        : role === 'reference' ? 'Referenzloesung'
        : role === 'dry' ? 'Trockenzustand'
        : 'Nasszustand'
      const overwriteConfirmed = await uiStore.confirm({
        title: 'Kalibrierpunkt ueberschreiben?',
        message: `Der Punkt '${roleLabel}' existiert bereits. Soll er durch den neuen Messwert ersetzt werden?`,
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
      point_role: role as any,
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
    isFreshMeasurement.value = false

    if (hasExistingRole) {
      points.value = points.value.map((existing) =>
        existing.point_role === role ? normalizedPoint : existing,
      )
      return true
    }

    // Append new point in proper order
    points.value = [...points.value, normalizedPoint]
    return true
  }

  async function onPoint1Captured(point: CalibrationPoint): Promise<void> {
    const preset = currentPreset.value

    let pointRole: 'buffer_high' | 'dry' | 'reference'
    if (selectedSensorType.value === 'ph') {
      pointRole = 'buffer_high'
    } else if (selectedSensorType.value === 'ec') {
      pointRole = 'reference'
    } else {
      pointRole = 'dry'
    }

    const persisted = await persistPoint(pointRole, point, { confirmOverwrite: true })
    if (persisted) {
      // EC 1-point: go directly to confirm
      // pH & Moisture 2-point: go to point2
      if (preset?.expectedPoints === 1) {
        phase.value = 'confirm'
      } else {
        phase.value = 'point2'
      }
    }
  }

  async function onPoint2Captured(point: CalibrationPoint): Promise<void> {
    const pointRole = selectedSensorType.value === 'ph' ? 'buffer_low' : 'wet'

    const persisted = await persistPoint(pointRole, point, { confirmOverwrite: true })
    if (persisted) {
      phase.value = 'confirm'
    }
  }

  async function submitCalibration(): Promise<void> {
    if (selectedGpio.value === null) return

    const preset = currentPreset.value
    if (!preset) {
      phase.value = 'error'
      errorMessage.value = 'Sensortyp-Preset nicht gefunden.'
      return
    }

    const validPoints = points.value.filter((point) =>
      Number.isFinite(point.raw) && Number.isFinite(point.reference),
    )
    if (validPoints.length < preset.expectedPoints) {
      phase.value = 'error'
      errorMessage.value = `Kalibrierung benötigt ${preset.expectedPoints} gueltige Punkte, vorhanden: ${validPoints.length}.`
      return
    }

    isSubmitting.value = true
    lifecycleState.value = 'accepted'
    lifecycleMessage.value = 'Kalibrierauftrag akzeptiert.'
    errorMessage.value = ''
    phase.value = 'finalizing'
    try {
      const sessionId = await ensureSessionStarted()

      // Get required roles based on sensor type
      let requiredRoles: Array<string> = []
      if (selectedSensorType.value === 'ph') {
        requiredRoles = ['buffer_high', 'buffer_low']
      } else if (selectedSensorType.value === 'ec') {
        requiredRoles = ['reference']
      } else {
        requiredRoles = ['dry', 'wet']
      }

      const hasAllRoles = requiredRoles.every((role) =>
        points.value.some((point) => point.point_role === role),
      )
      if (!hasAllRoles) {
        for (let index = 0; index < requiredRoles.length; index += 1) {
          const role = requiredRoles[index]
          const point = validPoints[index]
          if (!points.value.some((entry) => entry.point_role === role)) {
            await persistPoint(role as any, point)
          }
        }
      }

      lifecycleState.value = 'pending'
      lifecycleMessage.value = 'Kalibrierung wird finalisiert...'
      await calibrationApi.finalizeSession(sessionId)
      lifecycleMessage.value = 'Kalibrierung wird angewendet...'
      await calibrationApi.applySession(sessionId)
      const sessionState = await waitForTerminalSession(sessionId)
      const normalizedStatus = String(sessionState.status || '').toLowerCase()

      if (!TERMINAL_SESSION_STATUSES.has(normalizedStatus)) {
        lifecycleState.value = 'terminal_timeout'
        lifecycleMessage.value = `Keine terminale Session-Rueckmeldung erhalten (Status: ${normalizedStatus || 'unbekannt'}).`
        phase.value = 'error'
        errorMessage.value = lifecycleMessage.value
        return
      }

      calibrationResult.value = {
        success: normalizedStatus === 'applied',
        calibration: sessionState.calibration_result ?? {},
        sensor_type: sessionState.sensor_type,
        method: sessionState.method,
        saved: normalizedStatus === 'applied',
        message: sessionState.failure_reason ?? null,
      }
      if (normalizedStatus === 'applied') {
        lifecycleState.value = 'terminal_success'
        lifecycleMessage.value = 'Kalibrierung erfolgreich terminal bestaetigt.'
      } else {
        lifecycleState.value = normalizedStatus === 'expired' ? 'terminal_timeout' : 'terminal_failed'
        lifecycleMessage.value = calibrationResult.value.message ?? `Kalibrierung endete mit Status '${normalizedStatus}'.`
      }
      phase.value = calibrationResult.value.success ? 'done' : 'error'
      if (!calibrationResult.value.success) {
        errorMessage.value = lifecycleMessage.value
      }
    } catch (err: unknown) {
      phase.value = 'error'
      lifecycleState.value = 'terminal_failed'
      const uiError = toUiApiError(err, 'Kalibrierung fehlgeschlagen')
      lifecycleMessage.value = formatUiApiError(uiError)
      errorMessage.value = lifecycleMessage.value
    } finally {
      isSubmitting.value = false
    }
  }

  async function waitForTerminalSession(sessionId: string): Promise<Awaited<ReturnType<typeof calibrationApi.getSession>>> {
    const maxAttempts = 10
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const session = await calibrationApi.getSession(sessionId)
      const normalizedStatus = String(session.status || '').toLowerCase()
      if (TERMINAL_SESSION_STATUSES.has(normalizedStatus)) {
        return session
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    return calibrationApi.getSession(sessionId)
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
    if (isMeasuring.value) return

    clearMeasureCooldownTimer()
    isMeasuring.value = true
    isFreshMeasurement.value = false
    lifecycleState.value = 'accepted'
    lifecycleMessage.value = 'Messauftrag akzeptiert.'
    errorMessage.value = ''
    try {
      if (!currentSessionId.value) {
        const preset = currentPreset.value
        if (!preset) {
          throw new Error('Sensortyp-Preset nicht gefunden')
        }
        const session = await calibrationApi.startSession({
          esp_id: selectedEspId.value,
          gpio: selectedGpio.value,
          sensor_type: selectedSensorType.value,
          method: preset.calibrationMethod,
          expected_points: preset.expectedPoints,
        })
        currentSessionId.value = session.id
      }
      const triggerResult = await sensorsApi.triggerMeasurement(selectedEspId.value, selectedGpio.value)
      measurementRequestId.value = triggerResult.request_id
      measurementTriggerAt.value = Date.now()
      lifecycleState.value = 'pending'
      lifecycleMessage.value = `Messung angefordert (Request-ID: ${triggerResult.request_id}).`
    } catch (err: unknown) {
      errorMessage.value = err instanceof Error ? err.message : 'Messung fehlgeschlagen'
      measurementQuality.value = 'error'
      lifecycleState.value = 'terminal_failed'
      lifecycleMessage.value = errorMessage.value
    } finally {
      clearMeasureCooldownTimer()
      measureCooldownTimerId.value = setTimeout(() => {
        isMeasuring.value = false
        measureCooldownTimerId.value = null
      }, MEASUREMENT_TRIGGER_COOLDOWN_MS)
    }
  }

  function setLastRawValue(rawValue: number | null, quality = 'good'): void {
    lastRawValue.value = rawValue
    measurementQuality.value = quality
  }

  async function overwritePoint(role: 'dry' | 'wet' | 'buffer_high' | 'buffer_low' | 'reference', point: CalibrationPoint): Promise<void> {
    if (!currentSessionId.value) {
      throw new Error('Keine aktive Kalibrier-Session vorhanden')
    }
    await persistPoint(role, point, { confirmOverwrite: true })
  }

  async function deletePoint(role: 'dry' | 'wet' | 'buffer_high' | 'buffer_low' | 'reference'): Promise<void> {
    if (!currentSessionId.value) {
      throw new Error('Keine aktive Kalibrier-Session vorhanden')
    }
    const roleLabel = role === 'buffer_high' ? 'High-Buffer'
      : role === 'buffer_low' ? 'Low-Buffer'
      : role === 'reference' ? 'Referenzloesung'
      : role === 'dry' ? 'Trockenzustand'
      : 'Nasszustand'
    const confirmed = await uiStore.confirm({
      title: 'Kalibrierpunkt loeschen?',
      message: `Soll der Punkt '${roleLabel}' wirklich aus der Session entfernt werden?`,
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

    // Determine which phase to go back to
    if (role === 'reference') {
      phase.value = 'point1'
    } else if (role === 'buffer_high' || role === 'dry') {
      phase.value = 'point1'
    } else {
      phase.value = 'point2'
    }
  }

  /** Navigate back one phase */
  function goBack() {
    if (isSubmitting.value) return

    const backMap: Partial<Record<WizardPhase, WizardPhase>> = {
      point1: 'select',
      point2: 'point1',
      confirm: 'point2',
      finalizing: 'confirm',
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

  async function confirmLeave(): Promise<boolean> {
    if (!hasUnsavedWork.value || isSubmitting.value) {
      return true
    }
    return uiStore.confirm({
      title: 'Kalibrierung verlassen?',
      message: 'Es gibt einen laufenden Kalibriervorgang. Entwurf bleibt gespeichert, wirklich verlassen?',
      variant: 'warning',
      confirmText: 'Verlassen',
    })
  }

  function saveDraft(): void {
    const draft: CalibrationDraft = {
      phase: phase.value,
      selectedEspId: selectedEspId.value,
      selectedGpio: selectedGpio.value,
      selectedSensorType: selectedSensorType.value,
      ecPreset: ecPreset.value,
      points: points.value,
      currentSessionId: currentSessionId.value,
    }
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }

  function clearDraft(): void {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY)
  }

  function restoreDraft(): void {
    const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (!rawDraft) {
      return
    }
    try {
      const parsed = JSON.parse(rawDraft) as Partial<CalibrationDraft>
      if (!parsed || !parsed.selectedEspId || parsed.selectedGpio == null || !parsed.selectedSensorType) {
        return
      }
      if (
        options.espId &&
        options.gpio !== undefined &&
        options.sensorType &&
        (
          options.espId !== parsed.selectedEspId ||
          options.gpio !== parsed.selectedGpio ||
          normalizeCalibrationSensorType(options.sensorType) !== normalizeCalibrationSensorType(parsed.selectedSensorType)
        )
      ) {
        return
      }
      selectedEspId.value = parsed.selectedEspId
      selectedGpio.value = parsed.selectedGpio
      selectedSensorType.value = normalizeCalibrationSensorType(parsed.selectedSensorType)
      ecPreset.value = parsed.ecPreset ?? '1413_12880'
      points.value = Array.isArray(parsed.points) ? parsed.points : []
      currentSessionId.value = parsed.currentSessionId ?? null
      phase.value = parsed.phase ?? (options.skipSelect ? 'point1' : 'select')
      lifecycleState.value = 'pending'
      lifecycleMessage.value = 'Entwurf wiederhergestellt.'
    } catch {
      // Invalid draft payload, ignore.
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!hasUnsavedWork.value) {
      return
    }
    saveDraft()
    event.preventDefault()
    event.returnValue = ''
  }

  if (typeof window !== 'undefined') {
    restoreDraft()
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  watch(
    [phase, points, selectedEspId, selectedGpio, selectedSensorType, currentSessionId],
    () => {
      if (hasUnsavedWork.value) {
        saveDraft()
      } else {
        clearDraft()
      }
    },
    { deep: true },
  )

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
    clearMeasureCooldownTimer()
    isMeasuring.value = false
    lastRawValue.value = null
    measurementQuality.value = 'unknown'
    currentSessionId.value = null
    isFreshMeasurement.value = false
    lastMeasurementAt.value = null
    measurementRequestId.value = null
    measurementTriggerAt.value = null
    measurementTriggerAt.value = null
    lifecycleState.value = 'idle'
    lifecycleMessage.value = ''
    clearDraft()
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
      clearMeasureCooldownTimer()
    })
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
    isFreshMeasurement,
    lastMeasurementAt,
    measurementRequestId,
    lifecycleState,
    lifecycleMessage,
    hasUnsavedWork,

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
    confirmLeave,
    reset,
  }
}
