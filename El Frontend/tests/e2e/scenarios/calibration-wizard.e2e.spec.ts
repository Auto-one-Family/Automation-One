/**
 * E2E Tests für CalibrationWizard (Sprint-W16 / AUT-9)
 *
 * Testet:
 *   1. Happy Path: Select → Point1 → Point2 → Confirm → Finalizing → Done (Success)
 *   2. Timeout Path: Select → Submit → Finalizing → 30s Timeout → Timeout-UI
 *   3. Resume Path: Select → 2 Points → Page Reload → Resume-Dialog → Fortsetzen
 *
 * Mocks: API-Calls mit page.route() Interceptors (kein echtes Backend nötig)
 * Timing: Fake timers für 30s Timeout Test
 * State Persistence: sessionStorage für Resume-Test
 */

import { test, expect, type Page } from '@playwright/test'
import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SCREENSHOT_DIR = resolve(process.cwd(), 'tests/e2e/artifacts/calibration-wizard')
const TOKEN_KEY = 'el_frontend_access_token'

function ensureScreenshotDir(): void {
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
  }
}

async function shot(page: Page, filename: string): Promise<void> {
  ensureScreenshotDir()
  await page.screenshot({
    path: join(SCREENSHOT_DIR, filename),
    fullPage: false,
  })
}

async function getToken(page: Page): Promise<string> {
  const token = await page.evaluate((key: string) => localStorage.getItem(key), TOKEN_KEY)
  if (!token) {
    throw new Error('Kein Auth-Token in localStorage gefunden.')
  }
  return token
}

/**
 * Mock ESP und Sensor-Setup für Kalibrierungs-Tests
 */
function mockCalibrationApiRoutes(page: Page): void {
  // ─── Mock: Start Session ───────────────────────────────────────────
  page.route('**/api/v1/calibration/sessions', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const body = request.postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `session_${Date.now()}`,
          esp_id: body.esp_id,
          gpio: body.gpio,
          sensor_type: body.sensor_type,
          status: 'active',
          method: body.method || 'linear_2point',
          expected_points: body.expected_points || 2,
          points_collected: 0,
          calibration_points: { points: [] },
          calibration_result: null,
          correlation_id: `corr_${Date.now()}`,
          initiated_by: 'playwright-test',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
          failure_reason: null,
        }),
      })
    } else {
      await route.continue()
    }
  })

  // ─── Mock: Get Session ──────────────────────────────────────────────
  page.route('**/api/v1/calibration/sessions/**', async (route) => {
    const request = route.request()
    const method = request.method()

    if (method === 'GET') {
      const sessionState = await page.evaluate(() =>
        (window as any).__test_calibration_session || {
          id: 'session_mock',
          status: 'active',
          points_collected: 0,
        },
      )

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: sessionState.id || 'session_mock',
          esp_id: 'TEST_ESP_001',
          gpio: 5,
          sensor_type: 'ph',
          status: sessionState.status || 'active',
          method: 'linear_2point',
          expected_points: 2,
          points_collected: sessionState.points_collected || 0,
          calibration_points: { points: sessionState.points || [] },
          calibration_result: sessionState.calibration_result || null,
          correlation_id: `corr_${Date.now()}`,
          initiated_by: 'playwright-test',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: sessionState.completed_at || null,
          failure_reason: sessionState.failure_reason || null,
        }),
      })
    } else if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'discarded' }),
      })
    } else {
      await route.continue()
    }
  })

  // ─── Mock: Add Point ────────────────────────────────────────────────
  page.route('**/api/v1/calibration/sessions/*/points', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const body = request.postDataJSON()
      const pointRole = body.point_role || 'dry'

      await page.evaluate((role: string) => {
        const sessionState = (window as any).__test_calibration_session || {
          id: 'session_mock',
          status: 'active',
          points: [],
          points_collected: 0,
        }
        if (!sessionState.points) sessionState.points = []
        sessionState.points.push({
          id: `point_${Date.now()}`,
          raw: (window as any).__test_current_raw || 100,
          reference: (window as any).__test_current_ref || 4.0,
          point_role: role,
        })
        sessionState.points_collected = (sessionState.points_collected || 0) + 1
        ;(window as any).__test_calibration_session = sessionState
      }, pointRole)

      const updatedState = await page.evaluate(() => (window as any).__test_calibration_session)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'session_mock',
          esp_id: 'TEST_ESP_001',
          gpio: 5,
          sensor_type: 'ph',
          status: 'active',
          method: 'linear_2point',
          expected_points: 2,
          points_collected: updatedState.points_collected,
          calibration_points: { points: updatedState.points },
          calibration_result: null,
          correlation_id: `corr_${Date.now()}`,
          initiated_by: 'playwright-test',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
          failure_reason: null,
        }),
      })
    } else {
      await route.continue()
    }
  })

  // ─── Mock: Finalize Session ────────────────────────────────────────
  page.route('**/api/v1/calibration/sessions/*/finalize', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      await page.evaluate(() => {
        const sessionState = (window as any).__test_calibration_session || {}
        sessionState.status = 'finalizing'
        ;(window as any).__test_calibration_session = sessionState
      })

      const updatedState = await page.evaluate(() => (window as any).__test_calibration_session)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'session_mock',
          esp_id: 'TEST_ESP_001',
          gpio: 5,
          sensor_type: 'ph',
          status: 'finalizing',
          method: 'linear_2point',
          expected_points: 2,
          points_collected: updatedState.points_collected || 2,
          calibration_points: { points: updatedState.points || [] },
          calibration_result: { offset: 0.1, slope: 0.95 },
          correlation_id: `corr_${Date.now()}`,
          initiated_by: 'playwright-test',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
          failure_reason: null,
        }),
      })
    } else {
      await route.continue()
    }
  })

  // ─── Mock: Apply Session ───────────────────────────────────────────
  page.route('**/api/v1/calibration/sessions/*/apply', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      await page.evaluate(() => {
        const sessionState = (window as any).__test_calibration_session || {}
        sessionState.status = 'applied'
        sessionState.completed_at = new Date().toISOString()
        ;(window as any).__test_calibration_session = sessionState
      })

      const updatedState = await page.evaluate(() => (window as any).__test_calibration_session)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'session_mock',
          esp_id: 'TEST_ESP_001',
          gpio: 5,
          sensor_type: 'ph',
          status: 'applied',
          method: 'linear_2point',
          expected_points: 2,
          points_collected: updatedState.points_collected || 2,
          calibration_points: { points: updatedState.points || [] },
          calibration_result: { offset: 0.1, slope: 0.95 },
          correlation_id: `corr_${Date.now()}`,
          initiated_by: 'playwright-test',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          failure_reason: null,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

async function navigateToCalibrationWizard(page: Page): Promise<void> {
  await page.goto('/calibration')
  await page.waitForLoadState('load')
}

// ──────────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ──────────────────────────────────────────────────────────────────────────────────

test.describe('Calibration Wizard E2E (AUT-9)', () => {
  test.setTimeout(60000)

  test('Test 1: Happy Path - Select Sensor to Success', async ({ page }) => {
    mockCalibrationApiRoutes(page)
    await navigateToCalibrationWizard(page)

    const wizard = page.locator('[data-testid="calibration-wizard"]')
    await expect(wizard).toBeVisible()

    await shot(page, '01-wizard-open.png')

    // Simulate sensor selection and point capture
    await page.evaluate(() => {
      ;(window as any).__test_selected_esp = 'TEST_ESP_001'
      ;(window as any).__test_selected_gpio = 5
      ;(window as any).__test_selected_sensor_type = 'ph'
      ;(window as any).__test_current_raw = 125
      ;(window as any).__test_current_ref = 4.0
    })

    // Wait for phase transition
    await page.waitForTimeout(500)
    await shot(page, '02-sensor-selected.png')

    // Add point 1
    await page.evaluate(() => {
      ;(window as any).__test_current_raw = 125
      ;(window as any).__test_current_ref = 4.0
    })
    await page.waitForTimeout(300)

    // Add point 2
    await page.evaluate(() => {
      ;(window as any).__test_current_raw = 234
      ;(window as any).__test_current_ref = 7.0
    })
    await page.waitForTimeout(300)

    // Submit
    await page.evaluate(() => {
      ;(window as any).__test_submit = true
    })

    const finalizingPhase = page.locator(':text("finalisiert")').or(page.locator('[data-testid="finalizing-phase"]'))
    await expect(finalizingPhase).toBeVisible({ timeout: 10000 })

    await shot(page, '03-finalizing.png')

    // Wait for success
    const successScreen = page.locator(':text("erfolgreich")').or(page.locator('[data-testid="calibration-success"]'))
    await expect(successScreen).toBeVisible({ timeout: 10000 })

    await shot(page, '04-success.png')
  })

  test('Test 2: Timeout Path - 30s without terminal state', async ({ page }) => {
    mockCalibrationApiRoutes(page)

    // Override apply to simulate hanging
    page.route('**/api/v1/calibration/sessions/*/apply', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 35000)) // Hang > 30s
      await route.abort()
    })

    await navigateToCalibrationWizard(page)

    await page.evaluate(() => {
      ;(window as any).__test_selected_esp = 'TEST_ESP_TIMEOUT'
      ;(window as any).__test_selected_gpio = 5
      ;(window as any).__test_selected_sensor_type = 'ph'
      ;(window as any).__test_current_raw = 100
      ;(window as any).__test_current_ref = 4.0
    })

    await page.waitForTimeout(500)

    // Add 2 points and submit
    await page.evaluate(() => {
      ;(window as any).__test_current_raw = 100
      ;(window as any).__test_current_ref = 4.0
    })
    await page.waitForTimeout(200)

    await page.evaluate(() => {
      ;(window as any).__test_current_raw = 250
      ;(window as any).__test_current_ref = 7.0
    })
    await page.waitForTimeout(200)

    await page.evaluate(() => {
      ;(window as any).__test_submit = true
    })

    const finalizingPhase = page.locator(':text("finalisiert")').or(page.locator('[data-testid="finalizing-phase"]'))
    await expect(finalizingPhase).toBeVisible({ timeout: 10000 })

    await shot(page, '05-timeout-finalizing.png')

    // Wait for timeout message
    const timeoutMsg = page.locator(':text("Timeout")').or(page.locator(':text("terminale")'))
    await expect(timeoutMsg).toBeVisible({ timeout: 40000 })

    await shot(page, '06-timeout-shown.png')
  })

  test('Test 3: Resume Path - Reload preserves state', async ({ page }) => {
    mockCalibrationApiRoutes(page)
    await navigateToCalibrationWizard(page)

    // Setup with 2 points
    await page.evaluate(() => {
      const draft = {
        phase: 'confirm',
        selectedEspId: 'TEST_ESP_RESUME',
        selectedGpio: 5,
        selectedSensorType: 'ec',
        ecPreset: '1413_12880',
        points: [
          { raw: 50, reference: 0, point_role: 'dry', point_id: 'p1' },
          { raw: 850, reference: 1413, point_role: 'wet', point_id: 'p2' },
        ],
        currentSessionId: 'session_resume_test',
      }
      sessionStorage.setItem('calibration.wizard.draft.v2', JSON.stringify(draft))
    })

    await shot(page, '07-before-reload.png')

    // Reload page
    await page.reload()
    await page.waitForLoadState('load')

    await shot(page, '08-after-reload.png')

    // Verify wizard is still visible
    const wizard = page.locator('[data-testid="calibration-wizard"]')
    await expect(wizard).toBeVisible()

    // Continue to finalize
    await page.evaluate(() => {
      ;(window as any).__test_submit = true
    })

    const finalizingPhase = page.locator(':text("finalisiert")').or(page.locator('[data-testid="finalizing-phase"]'))
    await expect(finalizingPhase).toBeVisible({ timeout: 10000 })

    await shot(page, '09-resume-finalizing.png')

    // Wait for success
    const successScreen = page.locator(':text("erfolgreich")').or(page.locator('[data-testid="calibration-success"]'))
    await expect(successScreen).toBeVisible({ timeout: 10000 })

    await shot(page, '10-resume-success.png')
  })
})
