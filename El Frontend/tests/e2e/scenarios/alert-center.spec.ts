/**
 * Alert-Center / Notification-Drawer / Quick-Alert-Panel — Referenz-Flow (P4)
 *
 * Stabile data-testid; P1-Absicherung: Fehlertoast bei fehlgeschlagenem Ack (REST-Mock).
 * Voraussetzung: globalSetup-Auth (playwright.config.ts). Voller Stack für Integrationsläufe.
 */

import { test, expect } from '@playwright/test'

const E2E_ACK_FAIL_ID = 'e2e-p1-ack-fail'

const mockNotification = {
  id: E2E_ACK_FAIL_ID,
  user_id: 1,
  channel: 'in_app',
  severity: 'warning' as const,
  category: 'data_quality' as const,
  title: 'E2E Ack Failure',
  body: 'Playwright',
  metadata: {},
  source: 'sensor_threshold' as const,
  is_read: false,
  is_archived: false,
  digest_sent: false,
  parent_notification_id: null,
  fingerprint: null,
  created_at: new Date().toISOString(),
  updated_at: null,
  read_at: null,
  status: 'active' as const,
  acknowledged_at: null,
  acknowledged_by: null,
  resolved_at: null,
  correlation_id: null,
}

test.describe('Alert Center / Notification Drawer', () => {
  test('opens drawer from bell and can focus active-alerts tab', async ({ page }) => {
    await page.goto('/hardware')
    await page.waitForLoadState('domcontentloaded')

    await page.getByTestId('notification-drawer-trigger').click()
    await expect(page.getByTestId('notification-drawer-panel')).toBeVisible()

    await page.getByTestId('alert-status-tab-active').click()
    await expect(page.getByTestId('alert-status-tab-active')).toHaveClass(/drawer__status-tab--active/)
  })

  test('opens Quick Alert panel from FAB (data-testid)', async ({ page }) => {
    await page.goto('/hardware')
    await page.waitForLoadState('domcontentloaded')

    await page.getByTestId('quick-action-fab-toggle').click()
    await page.getByTestId('quick-action-item-global-alerts').click()
    await expect(page.getByTestId('quick-alert-panel')).toBeVisible()
  })

  test('P1 Finalität: Fehlertoast wenn Acknowledge per REST fehlschlägt', async ({ page }) => {
    await page.route('**/api/v1/notifications**', async (route) => {
      const req = route.request()
      const url = req.url()
      const method = req.method()

      if (method === 'PATCH' && url.includes(`/${E2E_ACK_FAIL_ID}/acknowledge`)) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'E2E: Acknowledge absichtlich fehlgeschlagen' }),
        })
        return
      }

      if (method === 'GET' && url.includes('/unread-count')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            unread_count: 1,
            highest_severity: 'warning',
          }),
        })
        return
      }

      if (method === 'GET' && url.includes('/alerts/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            active_count: 1,
            acknowledged_count: 0,
            resolved_today_count: 0,
            critical_active: 0,
            warning_active: 1,
            mean_time_to_acknowledge_s: null,
            mean_time_to_resolve_s: null,
          }),
        })
        return
      }

      if (method === 'GET' && /\/api\/v1\/notifications\?/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [mockNotification],
            pagination: {
              page: 1,
              page_size: 50,
              total_items: 1,
              total_pages: 1,
            },
          }),
        })
        return
      }

      await route.continue()
    })

    await page.goto('/hardware')
    await page.waitForLoadState('domcontentloaded')

    await page.getByTestId('notification-drawer-trigger').click()
    await expect(page.getByTestId('notification-drawer-panel')).toBeVisible()

    await page.getByTestId(`notification-alert-ack-${E2E_ACK_FAIL_ID}`).click()

    const errorToast = page.locator('.toast.toast--error').first()
    await expect(errorToast).toBeVisible()
    await expect(errorToast).toContainText(/E2E: Acknowledge absichtlich fehlgeschlagen/)
  })
})
