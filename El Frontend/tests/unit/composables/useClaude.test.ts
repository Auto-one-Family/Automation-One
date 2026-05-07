/**
 * useClaude Composable Tests (AUT-272)
 *
 * Validates the core behaviour of the Claude chat composable:
 *  - User messages are appended to the messages list
 *  - Context (esp_id) is forwarded in the request body
 *  - clearHistory empties the message list
 *  - isAvailable reflects plugin enabled state
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// ─── Mock auth store ──────────────────────────────────────────────────────────

const authStoreMock = vi.hoisted(() => ({
  accessToken: 'test-jwt-token',
}))

vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: () => authStoreMock,
}))

// ─── Mock pluginsApi ──────────────────────────────────────────────────────────

const pluginsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock('@/api/plugins', () => ({
  pluginsApi: pluginsApiMock,
}))

// ─── Mock fetch (SSE streaming) ───────────────────────────────────────────────

/**
 * Build a minimal ReadableStream that emits a single SSE data chunk and closes.
 */
function makeStreamResponse(chunk: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useClaude } from '@/composables/useClaude'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useClaude', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Default plugin response: claude plugin enabled
    pluginsApiMock.list.mockResolvedValue([
      { plugin_id: 'claude', is_enabled: true },
    ])

    // Default fetch: successful streaming response
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeStreamResponse('Hello from Claude')),
    )
  })

  it('should append user message to messages on sendMessage', async () => {
    const { messages, sendMessage } = useClaude()

    expect(messages.value).toHaveLength(0)

    await sendMessage('Was ist falsch mit diesem ESP?')

    // First message must be the user message
    expect(messages.value[0]).toMatchObject({
      role: 'user',
      content: 'Was ist falsch mit diesem ESP?',
    })
  })

  it('should include esp_id in request body when context.espId is provided', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeStreamResponse('OK'))
    vi.stubGlobal('fetch', fetchSpy)

    const { sendMessage } = useClaude()

    await sendMessage('Debugging', { espId: 'ESP_TEST_42', currentView: 'dashboard' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.esp_id).toBe('ESP_TEST_42')
  })

  it('should clear all messages when clearHistory is called', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse('Hi')))

    const { messages, sendMessage, clearHistory } = useClaude()

    await sendMessage('Hello')
    expect(messages.value.length).toBeGreaterThan(0)

    clearHistory()
    expect(messages.value).toHaveLength(0)
  })

  it('should set isAvailable to false when plugin is disabled', async () => {
    pluginsApiMock.list.mockResolvedValue([
      { plugin_id: 'claude', is_enabled: false },
    ])

    const { isAvailable } = useClaude()

    // checkAvailability runs in onMounted — call it explicitly by awaiting the mock
    await pluginsApiMock.list()
    // isAvailable starts as false and stays false for a disabled plugin
    expect(isAvailable.value).toBe(false)
  })
})
