/**
 * useAlertSuppression — AUT-255
 *
 * Computes the effective alert suppression state for a sensor by combining
 * sensor-level suppression (alerts_enabled, suppression_until, suppression_reason)
 * with device-level suppression (propagate_to_children).
 *
 * Server contract (read-only):
 * - SensorConfig.alert_config.alerts_enabled (boolean, default true)
 * - SensorConfig.alert_config.suppression_until (ISO DateTime, optional)
 * - SensorConfig.alert_config.suppression_reason ('maintenance'|'intentionally_offline'|'calibration'|'custom')
 * - esp_device.alert_config.propagate_to_children (boolean) — device-wide suppression
 * - esp_device.alert_config.suppression_until / suppression_reason
 */

import { computed, type ComputedRef, type Ref } from 'vue'

export type SuppressionSource = 'sensor' | 'device' | 'both' | 'none'

export interface SuppressionState {
  isActive: boolean
  source: SuppressionSource
  sensorSuppressedUntil: string | null
  deviceSuppressedUntil: string | null
  sensorReason: string | null
  deviceReason: string | null
  /** Later of the two timestamps (sensor vs device), null when neither exists */
  effectiveUntil: string | null
}

export interface SensorAlertConfig {
  alerts_enabled?: boolean
  suppression_until?: string | null
  suppression_reason?: string | null
}

export interface DeviceAlertConfig {
  propagate_to_children?: boolean
  suppression_until?: string | null
  suppression_reason?: string | null
  /** When false, device-level suppression is disabled regardless of propagate flag */
  alerts_enabled?: boolean
}

/** True when an ISO timestamp lies in the future (or is empty/null = no expiry). */
function isFutureOrOpen(iso: string | null | undefined): boolean {
  if (!iso) return true
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return true
  return ts > Date.now()
}

/** True when an ISO timestamp lies strictly in the future. */
function isFuture(iso: string | null | undefined): boolean {
  if (!iso) return false
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return false
  return ts > Date.now()
}

/** Returns the later of two ISO timestamps, or whichever is non-null. */
function laterIso(a: string | null, b: string | null): string | null {
  if (a && b) {
    const ta = Date.parse(a)
    const tb = Date.parse(b)
    if (Number.isNaN(ta)) return b
    if (Number.isNaN(tb)) return a
    return ta >= tb ? a : b
  }
  return a ?? b ?? null
}

/**
 * Computes the effective suppression state for a sensor.
 *
 * Sensor is considered suppressed when:
 *  - alerts_enabled === false, OR
 *  - suppression_until is set and lies in the future
 *
 * Device-level suppression applies when:
 *  - alert_config.propagate_to_children === true, AND
 *  - device alerts_enabled !== false (device disabled = active suppression for children)
 *  - if suppression_until is set, must lie in the future
 */
export function useAlertSuppression(
  sensorAlertConfig: Ref<SensorAlertConfig | null | undefined>,
  deviceAlertConfig: Ref<DeviceAlertConfig | null | undefined>,
): { suppression: ComputedRef<SuppressionState> } {
  const suppression = computed<SuppressionState>(() => {
    const sensor = sensorAlertConfig.value ?? null
    const device = deviceAlertConfig.value ?? null

    // Sensor-level suppression
    const sensorEnabled = sensor?.alerts_enabled !== false
    const sensorUntilFuture = isFuture(sensor?.suppression_until)
    const sensorIsSuppressed =
      sensor != null && (!sensorEnabled || sensorUntilFuture)

    // Device-level suppression: only effective when propagate_to_children is true
    // AND the device suppression itself is active (alerts_enabled false OR until in future)
    const propagate = device?.propagate_to_children === true
    const deviceEnabled = device?.alerts_enabled !== false
    const deviceUntilOpen = isFutureOrOpen(device?.suppression_until)
    const deviceIsSuppressed =
      propagate && (!deviceEnabled || isFuture(device?.suppression_until)) && deviceUntilOpen

    let source: SuppressionSource = 'none'
    if (sensorIsSuppressed && deviceIsSuppressed) source = 'both'
    else if (sensorIsSuppressed) source = 'sensor'
    else if (deviceIsSuppressed) source = 'device'

    const sensorSuppressedUntil = sensor?.suppression_until ?? null
    const deviceSuppressedUntil = device?.suppression_until ?? null

    return {
      isActive: source !== 'none',
      source,
      sensorSuppressedUntil: sensorIsSuppressed ? sensorSuppressedUntil : null,
      deviceSuppressedUntil: deviceIsSuppressed ? deviceSuppressedUntil : null,
      sensorReason: sensorIsSuppressed ? (sensor?.suppression_reason ?? null) : null,
      deviceReason: deviceIsSuppressed ? (device?.suppression_reason ?? null) : null,
      effectiveUntil: laterIso(
        sensorIsSuppressed ? sensorSuppressedUntil : null,
        deviceIsSuppressed ? deviceSuppressedUntil : null,
      ),
    }
  })

  return { suppression }
}

/** Maps suppression_reason enum to German label. */
export function formatSuppressionReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'maintenance':
      return 'Wartung'
    case 'intentionally_offline':
      return 'Geplant offline'
    case 'calibration':
      return 'Kalibrierung'
    case 'custom':
      return 'Benutzerdefiniert'
    default:
      return reason ?? 'Unbekannt'
  }
}
