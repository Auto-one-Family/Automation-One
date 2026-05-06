/**
 * useAlertSuppression Unit Tests — AUT-255
 *
 * Covers all four suppression cases:
 *   none / sensor-only / device-only / both
 * Plus effectiveUntil selection and reactive countdown.
 */

import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useAlertSuppression } from '@/composables/useAlertSuppression'

const FUTURE_ISO = new Date(Date.now() + 3_600_000).toISOString()
const PAST_ISO = new Date(Date.now() - 3_600_000).toISOString()

describe('useAlertSuppression', () => {
  // ── Case: none ──────────────────────────────────────────────────────────────

  it('none — no suppression when both configs are null', () => {
    const { suppression } = useAlertSuppression(ref(null), ref(null))
    expect(suppression.value.isActive).toBe(false)
    expect(suppression.value.source).toBe('none')
    expect(suppression.value.effectiveUntil).toBeNull()
  })

  it('none — no suppression when alerts_enabled is true and no future timestamp', () => {
    const { suppression } = useAlertSuppression(
      ref({ alerts_enabled: true, suppression_until: PAST_ISO }),
      ref(null),
    )
    expect(suppression.value.isActive).toBe(false)
    expect(suppression.value.source).toBe('none')
  })

  // ── Case: sensor-only ────────────────────────────────────────────────────────

  it('sensor-only — suppressed when alerts_enabled is false', () => {
    const { suppression } = useAlertSuppression(
      ref({ alerts_enabled: false }),
      ref(null),
    )
    expect(suppression.value.isActive).toBe(true)
    expect(suppression.value.source).toBe('sensor')
  })

  it('sensor-only — suppressed when suppression_until is in the future', () => {
    const { suppression } = useAlertSuppression(
      ref({ alerts_enabled: true, suppression_until: FUTURE_ISO, suppression_reason: 'calibration' }),
      ref(null),
    )
    expect(suppression.value.isActive).toBe(true)
    expect(suppression.value.source).toBe('sensor')
    expect(suppression.value.sensorReason).toBe('calibration')
    expect(suppression.value.sensorSuppressedUntil).toBe(FUTURE_ISO)
  })

  // ── Case: device-only ────────────────────────────────────────────────────────

  it('device-only — suppressed when propagate_to_children is true', () => {
    const { suppression } = useAlertSuppression(
      ref({ alerts_enabled: true }),
      ref({ propagate_to_children: true, suppression_reason: 'maintenance' }),
    )
    expect(suppression.value.isActive).toBe(true)
    expect(suppression.value.source).toBe('device')
    expect(suppression.value.deviceReason).toBe('maintenance')
  })

  it('device-only — suppressed when device suppression_until is in the future', () => {
    const { suppression } = useAlertSuppression(
      ref(null),
      ref({ suppression_until: FUTURE_ISO, suppression_reason: 'intentionally_offline' }),
    )
    expect(suppression.value.isActive).toBe(true)
    expect(suppression.value.source).toBe('device')
    expect(suppression.value.deviceSuppressedUntil).toBe(FUTURE_ISO)
  })

  // ── Case: both ───────────────────────────────────────────────────────────────

  it('both — source is "both" when sensor and device are both suppressed', () => {
    const { suppression } = useAlertSuppression(
      ref({ alerts_enabled: false, suppression_until: FUTURE_ISO, suppression_reason: 'calibration' }),
      ref({ propagate_to_children: true, suppression_until: FUTURE_ISO, suppression_reason: 'maintenance' }),
    )
    expect(suppression.value.isActive).toBe(true)
    expect(suppression.value.source).toBe('both')
    expect(suppression.value.sensorReason).toBe('calibration')
    expect(suppression.value.deviceReason).toBe('maintenance')
  })

  // ── effectiveUntil ───────────────────────────────────────────────────────────

  it('effectiveUntil — returns the later of the two timestamps', () => {
    const earlier = new Date(Date.now() + 1_000_000).toISOString()
    const later = new Date(Date.now() + 2_000_000).toISOString()
    const { suppression } = useAlertSuppression(
      ref({ alerts_enabled: false, suppression_until: earlier }),
      ref({ propagate_to_children: true, suppression_until: later }),
    )
    expect(suppression.value.effectiveUntil).toBe(later)
  })

  it('effectiveUntil — returns only timestamp when one side has none', () => {
    const { suppression } = useAlertSuppression(
      ref({ alerts_enabled: false, suppression_until: FUTURE_ISO }),
      ref(null),
    )
    expect(suppression.value.effectiveUntil).toBe(FUTURE_ISO)
  })

  // ── Reactive countdown ───────────────────────────────────────────────────────

  it('reactive — suppression activates when config changes to alerts_enabled=false', () => {
    const sensorConfig = ref<{ alerts_enabled?: boolean } | null>({ alerts_enabled: true })
    const { suppression } = useAlertSuppression(sensorConfig, ref(null))
    expect(suppression.value.isActive).toBe(false)

    sensorConfig.value = { alerts_enabled: false }
    expect(suppression.value.isActive).toBe(true)
    expect(suppression.value.source).toBe('sensor')
  })

  it('reactive — suppression deactivates when config changes to alerts_enabled=true', () => {
    const sensorConfig = ref<{ alerts_enabled?: boolean } | null>({ alerts_enabled: false })
    const { suppression } = useAlertSuppression(sensorConfig, ref(null))
    expect(suppression.value.isActive).toBe(true)

    sensorConfig.value = { alerts_enabled: true }
    expect(suppression.value.isActive).toBe(false)
  })

  it('reactive — device suppression activates when propagate_to_children is set', () => {
    const deviceConfig = ref<{ propagate_to_children?: boolean } | null>({ propagate_to_children: false })
    const { suppression } = useAlertSuppression(ref(null), deviceConfig)
    expect(suppression.value.isActive).toBe(false)

    deviceConfig.value = { propagate_to_children: true }
    expect(suppression.value.isActive).toBe(true)
    expect(suppression.value.source).toBe('device')
  })
})
