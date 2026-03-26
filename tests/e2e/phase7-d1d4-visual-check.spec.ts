/**
 * Phase 7 D1-D4 Visual Functional Test
 *
 * Systematic visual verification of all D1-D4 features.
 * Navigates through the frontend, takes screenshots at each step,
 * and documents findings.
 *
 * Run: npx playwright test tests/e2e/phase7-d1d4-visual-check.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = 'tests/screenshots/phase7-d1d4-verification';

// Auth credentials (created via docker exec for testing)
const AUTH = { username: 'playwright_test', password: 'Test1234!' };

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  const usernameField = page.getByRole('textbox', { name: 'Benutzername' });
  if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await usernameField.fill(AUTH.username);
    await page.getByRole('textbox', { name: 'Passwort' }).fill(AUTH.password);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.waitForURL('**/hardware', { timeout: 10000 });
  }
}

test.describe('Block A: Monitor L1 — Zone-Uebersicht (D2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
  });

  test('A1: L1 zeigt nur Zone-Tiles', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-monitor-l1-overview.png`,
    });

    // Zone-Tiles should be visible
    await expect(page.getByRole('button', { name: /MOCK ZONE/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Zelt Wohnzimmer/ })).toBeVisible();
  });

  test('A2: Nichts nach Zone-Tiles (full page)', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-monitor-l1-scrolled-bottom.png`,
      fullPage: true,
    });
  });

  test('A3: FAB sichtbar', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const fab = page.getByRole('button', { name: 'Quick Actions öffnen' }).last();
    await expect(fab).toBeVisible();
    await fab.screenshot({
      path: `${SCREENSHOT_DIR}/03-monitor-l1-fab-visible.png`,
    });
  });

  test('A4: Zone-Tile Detail bei Hover', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const zoneTile = page.getByRole('button', { name: /MOCK ZONE/ });
    await zoneTile.hover();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/04-monitor-l1-zone-tile-detail.png`,
    });
  });
});

test.describe('Block B: Monitor L2 — Zone-Detail + Hover-Toolbar (D4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
  });

  test('B1: L2 Zone-Detail Navigation', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /MOCK ZONE/ }).click();
    await page.waitForURL('**/monitor/mock_zone');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/06-monitor-l2-zone-detail.png`,
    });

    await expect(page.url()).toContain('/monitor/mock_zone');
  });

  test('B2: Full-Page L2 Scroll', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor/mock_zone`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/07-monitor-l2-full-scroll.png`,
      fullPage: true,
    });
  });

  test('B3-B7: Widget Hover-Toolbar Workflow', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor/mock_zone`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scroll down to widget area
    await page.keyboard.press('End');
    await page.waitForTimeout(1000);

    // Find a gauge widget and hover
    const gaugeWidget = page.locator('.widget-wrapper').first();
    if (await gaugeWidget.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gaugeWidget.hover();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/08-monitor-l2-widget-hover-toolbar.png`,
      });

      // B4: Click configure
      const configBtn = page.locator('.widget-toolbar__btn').first();
      if (await configBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await configBtn.click();
        await page.waitForTimeout(500);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/09-monitor-l2-widget-config-panel.png`,
        });

        // B5: Close config panel
        const closeBtn = page.getByRole('button', { name: 'Schließen' });
        if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeBtn.click();
          await page.waitForTimeout(500);
        }

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/10-monitor-l2-config-panel-closed.png`,
        });
      }

      // B6: Click remove
      await gaugeWidget.hover();
      await page.waitForTimeout(500);
      const removeBtn = page.locator('.widget-toolbar__btn--danger').first();
      if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await removeBtn.click();
        await page.waitForTimeout(500);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/11-monitor-l2-widget-remove-confirm.png`,
        });

        // B7: Cancel removal
        await page.getByRole('button', { name: 'Abbrechen' }).click();
        await page.waitForTimeout(500);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/12-monitor-l2-widget-remove-cancelled.png`,
        });
      }
    }
  });

  test('B8: FAB auf L2 sichtbar', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor/mock_zone`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const fab = page.getByRole('button', { name: 'Quick Actions öffnen' }).last();
    await expect(fab).toBeVisible();
    await fab.screenshot({
      path: `${SCREENSHOT_DIR}/13-monitor-l2-fab-visible.png`,
    });
  });
});

test.describe('Block C: FAB + AddWidgetDialog (D3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
  });

  test('C1: FAB oeffnet Menue mit Widget-Typen', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const fab = page.getByRole('button', { name: 'Quick Actions öffnen' }).last();
    await fab.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/14-fab-menu-open.png`,
    });

    // Verify 9 widget types exist
    const menu = page.getByRole('menu', { name: 'Quick Actions' }).last();
    await expect(menu).toBeVisible();

    // Sensor widgets (5)
    await expect(menu.getByRole('menuitem', { name: /Linien-Chart/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Gauge-Chart/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Sensor-Karte/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Historische Zeitreihe/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Multi-Sensor-Chart/ })).toBeVisible();

    // Actuator widgets (2)
    await expect(menu.getByRole('menuitem', { name: /Aktor-Status/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Aktor-Laufzeit/ })).toBeVisible();

    // System widgets (2)
    await expect(menu.getByRole('menuitem', { name: /ESP-Health/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Alarm-Liste/ })).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/16-fab-dialog-widget-types.png`,
    });
  });
});

test.describe('Block D: Dashboard Editor — Loeschen + Bulk (D1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
  });

  test('D1-D4: Editor Dashboard-Liste mit Trash + Auto-Badge + Bulk-Button', async ({ page }) => {
    await page.goto(`${BASE_URL}/editor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/24-editor-dashboard-list.png`,
    });

    // Open dashboard dropdown
    const dashboardDropdown = page.getByRole('button', { name: /Mock Zone Dashboard/ });
    await dashboardDropdown.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/25-editor-dashboard-dropdown-trash.png`,
    });

    // Verify bulk cleanup button
    const bulkBtn = page.getByRole('button', { name: /Auto-generierte aufräumen/ });
    await expect(bulkBtn).toBeVisible();

    // Verify trash icons exist
    const trashButtons = page.getByRole('button', { name: 'Dashboard löschen' });
    expect(await trashButtons.count()).toBeGreaterThan(0);
  });

  test('D5-D6: Bulk-Cleanup-Modal oeffnet und schliesst', async ({ page }) => {
    await page.goto(`${BASE_URL}/editor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Open dropdown and click bulk cleanup
    await page.getByRole('button', { name: /Mock Zone Dashboard/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Auto-generierte aufräumen/ }).click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/28-editor-bulk-cleanup-modal.png`,
    });

    // Verify modal content
    await expect(page.getByRole('heading', { name: /Auto-generierte Dashboards/ })).toBeVisible();

    // D6: Cancel
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/29-editor-bulk-cleanup-cancelled.png`,
    });
  });

  test('D7-D8: Einzelnes Dashboard loeschen und abbrechen', async ({ page }) => {
    await page.goto(`${BASE_URL}/editor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Open dropdown and click a trash icon
    await page.getByRole('button', { name: /Mock Zone Dashboard/ }).click();
    await page.waitForTimeout(500);

    const trashButtons = page.getByRole('button', { name: 'Dashboard löschen' });
    const lastTrash = trashButtons.last();
    await lastTrash.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/30-editor-single-delete-confirm.png`,
    });

    // Verify confirmation dialog
    await expect(page.getByRole('heading', { name: /Dashboard löschen/ })).toBeVisible();

    // D8: Cancel
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/31-editor-single-delete-cancelled.png`,
    });
  });
});

test.describe('Block E: Route-Redirect (D2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
  });

  test('E1: /monitor/dashboard/{id} redirects to /editor/{id}', async ({ page }) => {
    await page.goto(`${BASE_URL}/monitor/dashboard/fake-id-12345`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/32-monitor-dashboard-redirect.png`,
    });

    // Should redirect to editor
    expect(page.url()).toContain('/editor/');
    // Should NOT show old "Mock Zone Dashboard" page with 3 buttons
    await expect(page.getByText('Dashboard Builder')).toBeVisible();
  });
});

test.describe('Block F: Responsive Check', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('F1: Tablet (768x1024) Monitor L1', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/33-tablet-monitor-l1.png`,
    });

    // Zone tiles should be visible
    await expect(page.getByRole('button', { name: /MOCK ZONE/ })).toBeVisible();
  });

  test('F2: FAB auf Tablet funktioniert', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const fab = page.getByRole('button', { name: 'Quick Actions öffnen' }).last();
    await fab.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/34-tablet-fab-menu.png`,
    });

    const menu = page.getByRole('menu', { name: 'Quick Actions' }).last();
    await expect(menu).toBeVisible();
  });

  test('F3: Mobile (375x812) Monitor L1', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/monitor`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/35-mobile-monitor-l1.png`,
    });

    // Zone tiles should be visible on mobile
    await expect(page.getByRole('button', { name: /MOCK ZONE/ })).toBeVisible();
  });

  test('F4: Widget Toolbar auf Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/monitor/mock_zone`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scroll to widget area
    await page.keyboard.press('End');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/36-mobile-widget-toolbar.png`,
    });

    // Reset viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
  });
});
