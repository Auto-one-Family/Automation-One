import { describe, it, expect } from 'vitest'
import { formatAlertLifecycleFailureMessage } from '@/utils/alertLifecycleUi'
import type { AlertLifecycleFailure } from '@/shared/stores/alert-center.store'

describe('formatAlertLifecycleFailureMessage', () => {
  it('gibt nur die Nachricht zurück wenn keine Request-ID', () => {
    const f: AlertLifecycleFailure = {
      success: false,
      message: 'Alert konnte nicht bestätigt werden.',
      requestId: null,
    }
    expect(formatAlertLifecycleFailureMessage(f)).toBe('Alert konnte nicht bestätigt werden.')
  })

  it('hängt Request-ID für Operator-Forensik an (Konzept 6.2)', () => {
    const f: AlertLifecycleFailure = {
      success: false,
      message: 'Server-Störung. Die Aktion konnte nicht abgeschlossen werden.',
      requestId: 'req-abc-123',
    }
    expect(formatAlertLifecycleFailureMessage(f)).toBe(
      'Server-Störung. Die Aktion konnte nicht abgeschlossen werden. (Request-ID: req-abc-123)',
    )
  })
})
