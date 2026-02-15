/**
 * API Helper for Playwright E2E Tests
 *
 * Provides authenticated API calls via Playwright request API (Node context).
 * Uses localStorage token from the app (set by global-setup).
 *
 * Pattern: Global setup logs in → token in storageState → tests reuse auth.
 * API calls use standalone request fixture (not page.request) to avoid
 * "Target page/context/browser closed" when test times out.
 *
 * VORAUSSETZUNG: Backend muss unter localhost:8000 erreichbar sein.
 * Run: docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --wait
 */

import type { APIRequestContext, Page } from '@playwright/test'

const TOKEN_KEY = 'el_frontend_access_token'

/** API base URL - backend port (E2E: 8000). Matches global-setup login. */
function getApiBase(pageUrl: string): string {
  const origin = new URL(pageUrl).origin
  return process.env.PLAYWRIGHT_API_BASE ?? origin.replace('5173', '8000')
}

export interface CreateMockEspOptions {
  espId: string
  sensors?: Array<{
    gpio: number
    sensor_type: string
    name?: string
    raw_value?: number
  }>
  actuators?: Array<{
    gpio: number
    actuator_type: string
    name?: string
  }>
  zone_id?: string
  zone_name?: string
  auto_heartbeat?: boolean
}

/**
 * Create a Mock ESP via debug API.
 * Requires: page must have navigated to the app (token in localStorage).
 *
 * Uses standalone request fixture (not page.request) to avoid "Target page/context
 * closed" when test times out - the API call is independent of browser lifecycle.
 *
 * Backend must be reachable at localhost:8000. If not, fail fast (15s timeout).
 */
export async function createMockEspWithSensors(
  page: Page,
  request: APIRequestContext,
  options: CreateMockEspOptions
): Promise<{ esp_id: string; success: boolean }> {
  if (!options || typeof options !== 'object' || !options.espId) {
    throw new Error('createMockEspWithSensors: options must be { espId: string, sensors?: [], actuators?: [] }')
  }

  const apiBase = `${getApiBase(page.url())}/api/v1`

  const token = await page.evaluate(
    (key: string) => localStorage.getItem(key),
    TOKEN_KEY
  )
  if (!token) {
    throw new Error('No auth token in localStorage - ensure page has loaded with auth state')
  }

  const sensors = (options.sensors || []).map((s) => ({
    gpio: s.gpio,
    sensor_type: s.sensor_type,
    name: s.name ?? `GPIO ${s.gpio}`,
    raw_value: s.raw_value ?? 0,
  }))

  const actuators = (options.actuators || []).map((a) => ({
    gpio: a.gpio,
    actuator_type: a.actuator_type,
    name: a.name ?? `GPIO ${a.gpio}`,
  }))

  const payload = {
    esp_id: options.espId,
    zone_id: options.zone_id,
    zone_name: options.zone_name,
    sensors,
    actuators,
    auto_heartbeat: options.auto_heartbeat ?? false,
    heartbeat_interval_seconds: 60,
  }

  try {
    const response = await request.post(`${apiBase}/debug/mock-esp`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      data: payload,
      timeout: 15000, // Fail fast if backend unreachable (avoid 30s test timeout race)
    })

    if (!response.ok()) {
      const text = await response.text()
      throw new Error(`createMockEsp failed: ${response.status()} - ${text}`)
    }

    const data = (await response.json()) as { esp_id: string }
    return { esp_id: data.esp_id, success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ECONNREFUSED') || msg.includes('Timeout') || msg.includes('ENOTFOUND')) {
      throw new Error(
        `Backend not reachable at ${apiBase.replace('/api/v1', '')}. ` +
          'Run: docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --wait'
      )
    }
    throw err
  }
}

/**
 * Delete a Mock ESP via debug API.
 * Use in afterEach/afterAll for cleanup.
 */
export async function deleteMockEsp(
  page: Page,
  request: APIRequestContext,
  espId: string
): Promise<void> {
  const apiBase = `${getApiBase(page.url())}/api/v1`

  const token = await page.evaluate(
    (key: string) => localStorage.getItem(key),
    TOKEN_KEY
  )
  if (!token) return

  await request.delete(`${apiBase}/debug/mock-esp/${espId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 5000,
  })
}
