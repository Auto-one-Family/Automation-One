/**
 * Status Indicator CSS Tests — Schicht 2
 *
 * Verifies status dots, loading states, skeleton screens, and empty states.
 * These are critical UI elements that communicate system health.
 */

import { test, expect } from '@playwright/test'
import { TOKEN_RGB, hasActiveAnimation } from '../helpers/css'

test.describe('Status Indicator Styles', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Inject test elements
    await page.evaluate(() => {
      const container = document.createElement('div')
      container.id = 'status-test-container'
      container.style.padding = '20px'
      container.innerHTML = `
        <div class="status-dot status-online" id="dot-online"></div>
        <div class="status-dot status-offline" id="dot-offline"></div>
        <div class="status-dot status-error" id="dot-error"></div>
        <div class="status-dot status-warning" id="dot-warning"></div>
        <div class="status-dot status-dot-pulse" id="dot-pulse" style="background-color: var(--color-success);"></div>
        <div class="skeleton skeleton-text" id="skeleton-text"></div>
        <div class="skeleton skeleton-card" id="skeleton-card"></div>
        <div class="skeleton skeleton-circle" id="skeleton-circle" style="width:32px;height:32px;"></div>
        <div class="empty-state" id="empty-state">
          <div class="empty-state-icon" id="empty-icon">📦</div>
          <div class="empty-state-title" id="empty-title">Keine Daten</div>
          <div class="empty-state-description" id="empty-desc">Beschreibung</div>
        </div>
        <div class="error-state" id="error-state">
          <span class="error-state-icon" id="error-icon">⚠️</span>
          <span class="error-state-message" id="error-msg">Verbindung fehlgeschlagen</span>
        </div>
      `
      document.body.appendChild(container)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // STATUS DOTS
  // ═══════════════════════════════════════════════════════════════════════

  test('.status-dot has 8px diameter', async ({ page }) => {
    const dot = page.locator('#dot-online')
    await expect(dot).toHaveCSS('width', '8px')
    await expect(dot).toHaveCSS('height', '8px')
  })

  test('.status-dot is fully round', async ({ page }) => {
    const dot = page.locator('#dot-online')
    const radius = await dot.evaluate((el) =>
      getComputedStyle(el).borderRadius
    )
    expect(radius).toBe('50%')
  })

  test('.status-online has success color', async ({ page }) => {
    const dot = page.locator('#dot-online')
    await expect(dot).toHaveCSS('background-color', TOKEN_RGB['--color-success'])
  })

  test('.status-online has glow shadow', async ({ page }) => {
    const dot = page.locator('#dot-online')
    const shadow = await dot.evaluate((el) =>
      getComputedStyle(el).boxShadow
    )
    expect(shadow).not.toBe('none')
    expect(shadow).toContain('rgb')
  })

  test('.status-offline has muted color', async ({ page }) => {
    const dot = page.locator('#dot-offline')
    await expect(dot).toHaveCSS('background-color', TOKEN_RGB['--color-text-muted'])
  })

  test('.status-error has error color with glow', async ({ page }) => {
    const dot = page.locator('#dot-error')
    await expect(dot).toHaveCSS('background-color', TOKEN_RGB['--color-error'])

    const shadow = await dot.evaluate((el) =>
      getComputedStyle(el).boxShadow
    )
    expect(shadow).not.toBe('none')
  })

  test('.status-warning has warning color', async ({ page }) => {
    const dot = page.locator('#dot-warning')
    await expect(dot).toHaveCSS('background-color', TOKEN_RGB['--color-warning'])
  })

  test('.status-dot-pulse has animation', async ({ page }) => {
    const dot = page.locator('#dot-pulse')
    const isAnimated = await hasActiveAnimation(dot)
    expect(isAnimated).toBe(true)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // SKELETON LOADING
  // ═══════════════════════════════════════════════════════════════════════

  test('.skeleton has animated background', async ({ page }) => {
    const skeleton = page.locator('#skeleton-text')
    const isAnimated = await hasActiveAnimation(skeleton)
    expect(isAnimated).toBe(true)
  })

  test('.skeleton-text has correct height', async ({ page }) => {
    const skeleton = page.locator('#skeleton-text')
    const height = parseFloat(await skeleton.evaluate((el) =>
      getComputedStyle(el).height
    ))
    expect(height).toBe(16)
  })

  test('.skeleton-card has rounded corners and height', async ({ page }) => {
    const skeleton = page.locator('#skeleton-card')
    const radius = parseFloat(await skeleton.evaluate((el) =>
      getComputedStyle(el).borderRadius
    ))
    // radius-lg = 16px
    expect(radius).toBe(16)

    const height = parseFloat(await skeleton.evaluate((el) =>
      getComputedStyle(el).height
    ))
    // 128px (h-32)
    expect(height).toBe(128)
  })

  test('.skeleton-circle has full border-radius', async ({ page }) => {
    const skeleton = page.locator('#skeleton-circle')
    const radius = await skeleton.evaluate((el) =>
      getComputedStyle(el).borderRadius
    )
    expect(radius).toBe('50%')
  })

  // ═══════════════════════════════════════════════════════════════════════
  // EMPTY STATE
  // ═══════════════════════════════════════════════════════════════════════

  test('.empty-state is centered', async ({ page }) => {
    const state = page.locator('#empty-state')
    await expect(state).toHaveCSS('text-align', 'center')
  })

  test('.empty-state-icon has muted color', async ({ page }) => {
    const icon = page.locator('#empty-icon')
    await expect(icon).toHaveCSS('color', TOKEN_RGB['--color-text-muted'])
  })

  test('.empty-state-title has secondary text color', async ({ page }) => {
    const title = page.locator('#empty-title')
    await expect(title).toHaveCSS('color', TOKEN_RGB['--color-text-secondary'])
  })

  // ═══════════════════════════════════════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════════════════════════════════════

  test('.error-state has red border and background', async ({ page }) => {
    const state = page.locator('#error-state')
    const bg = await state.evaluate((el) =>
      getComputedStyle(el).backgroundColor
    )
    expect(bg).toContain('rgba')

    const border = await state.evaluate((el) =>
      getComputedStyle(el).borderStyle
    )
    expect(border).toBe('solid')
  })

  test('.error-state-message has error color', async ({ page }) => {
    const msg = page.locator('#error-msg')
    await expect(msg).toHaveCSS('color', TOKEN_RGB['--color-error'])
  })

  test('.error-state has flex layout', async ({ page }) => {
    const state = page.locator('#error-state')
    await expect(state).toHaveCSS('display', 'flex')
    await expect(state).toHaveCSS('align-items', 'center')
  })
})
