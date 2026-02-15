/**
 * Accessibility Tests — Schicht 4
 *
 * Uses @axe-core/playwright to scan pages for WCAG 2.1 AA violations.
 * Covers all major routes: Login, Dashboard, Sensors, Logic, etc.
 *
 * axe-core automatically detects:
 * - Missing labels on form elements
 * - Poor color contrast
 * - Missing ARIA properties
 * - Duplicate IDs
 * - Keyboard navigation issues
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN PAGE — Public, no auth required
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Accessibility — Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    // Filter for critical and serious violations only
    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    if (criticalViolations.length > 0) {
      const report = criticalViolations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
        help: v.helpUrl,
      }))
      console.log('Critical violations:', JSON.stringify(report, null, 2))
    }

    expect(
      criticalViolations,
      `Found ${criticalViolations.length} critical/serious accessibility violations`
    ).toHaveLength(0)
  })

  test('login form has labeled inputs', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const results = await new AxeBuilder({ page })
      .withRules(['label'])
      .analyze()

    const labelViolations = results.violations.filter(
      (v) => v.id === 'label'
    )
    expect(labelViolations).toHaveLength(0)
  })

  test('login page images have alt text', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const results = await new AxeBuilder({ page })
      .withRules(['image-alt'])
      .analyze()

    expect(results.violations.filter((v) => v.id === 'image-alt')).toHaveLength(0)
  })

  test('login page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const results = await new AxeBuilder({ page })
      .withRules(['heading-order'])
      .analyze()

    const headingViolations = results.violations.filter(
      (v) => v.id === 'heading-order'
    )
    expect(headingViolations).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATED PAGES — Requires auth state
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Accessibility — Authenticated Pages', () => {
  // Skip these tests if no auth state available (CI without backend)
  test.beforeEach(async ({ page }) => {
    try {
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Check if we got redirected to login (no auth)
      if (page.url().includes('/login')) {
        test.skip()
      }
    } catch {
      test.skip()
    }
  })

  test('dashboard has no critical accessibility violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      // Exclude known dynamic areas that may have transient issues
      .exclude('.chart-container')
      .analyze()

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(criticalViolations).toHaveLength(0)
  })

  test('sensors view has no critical accessibility violations', async ({ page }) => {
    await page.goto('/sensors')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(criticalViolations).toHaveLength(0)
  })

  test('logic view has no critical accessibility violations', async ({ page }) => {
    await page.goto('/logic')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(criticalViolations).toHaveLength(0)
  })

  test('settings view has no critical accessibility violations', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(criticalViolations).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIVE ACCESSIBILITY
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Interactive Accessibility', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login form is keyboard navigable', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Tab through form elements
    await page.keyboard.press('Tab')
    const firstFocused = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase()
    )
    // First focused should be an input or link
    expect(['input', 'a', 'button']).toContain(firstFocused)

    // Tab to next element
    await page.keyboard.press('Tab')
    const secondFocused = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase()
    )
    expect(['input', 'a', 'button']).toContain(secondFocused)
  })

  test('focused elements have visible focus indicator', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const input = page.locator('input').first()
    await input.focus()
    await page.waitForTimeout(200)

    // Focus should produce either a ring, outline, or border change
    const styles = await input.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        outline: style.outline,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        borderColor: style.borderColor,
      }
    })

    const hasFocusIndicator =
      styles.outline !== 'none' ||
      styles.outlineWidth !== '0px' ||
      styles.boxShadow !== 'none'

    expect(hasFocusIndicator).toBe(true)
  })

  test('buttons have sufficient touch target size', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const submitBtn = page.locator('button[type="submit"]')
    if (await submitBtn.count() > 0) {
      const box = await submitBtn.boundingBox()
      expect(box).toBeTruthy()
      if (box) {
        // WCAG 2.1 requires 44×44px minimum for touch targets
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
})
