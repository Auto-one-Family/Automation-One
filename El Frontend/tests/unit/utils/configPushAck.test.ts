import { describe, expect, it, vi } from 'vitest'
import {
  configPushDbOnlyMessage,
  parseConfigPushFields,
  runConfigSaveAckFlow,
} from '@/utils/configPushAck'

describe('configPushAck', () => {
  it('parses correlation_id and push_status from REST response', () => {
    const fields = parseConfigPushFields({
      correlation_id: 'e962cb55-b604-49ac-82b5-116bebd15bbb',
      push_status: 'queued',
      request_id: 'e962cb55-b604-49ac-82b5-116bebd15bbb',
    })
    expect(fields.correlationId).toBe('e962cb55-b604-49ac-82b5-116bebd15bbb')
    expect(fields.pushStatus).toBe('queued')
  })

  it('db_only message explains missing MQTT path', () => {
    expect(configPushDbOnlyMessage('Sensor pH')).toContain('nicht per MQTT erreicht')
  })

  it('runConfigSaveAckFlow skips ESP wait on db_only', async () => {
    const registerConfigIntentFromRest = vi.fn(() => 'subject-1')
    const waitForConfigTerminal = vi.fn()
    const toast = {
      warning: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    }
    const logger = { info: vi.fn() }
    const result = await runConfigSaveAckFlow(
      {
        response: {
          correlation_id: '11111111-1111-4111-8111-111111111111',
          push_status: 'db_only',
        },
        espId: 'ESP_12345678',
        scope: 'sensor:34:ph',
        summary: 'Sensor pH an GPIO 34',
        dedupeScope: 'ESP_12345678:sensor:34:ph',
      },
      {
        registerConfigIntentFromRest,
        waitForConfigTerminal,
        canEmitTerminalToast: vi.fn(() => true),
      } as never,
      toast as never,
      logger as never,
    )
    expect(result.result).toBe('saved')
    expect(registerConfigIntentFromRest).toHaveBeenCalledOnce()
    expect(waitForConfigTerminal).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledOnce()
  })
})
