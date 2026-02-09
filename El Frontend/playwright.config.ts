import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration
 *
 * Purpose: Browser-based E2E tests for AutomationOne Vue 3 Dashboard
 * Architecture: Playwright on HOST, backend services in Docker
 *
 * Usage:
 *   make e2e-up                    # Start Docker services
 *   npx playwright test            # Run all E2E tests
 *   npx playwright test --ui       # Interactive UI mode
 *   npx playwright test --debug    # Debug mode
 *   make e2e-down                  # Stop Docker services
 *
 * Auth Flow:
 *   globalSetup logs in once, saves token to .playwright/auth-state.json
 *   All tests reuse this auth state (storageState)
 */

export default defineConfig({
  // Test directory
  testDir: './tests/e2e/scenarios',

  // Test file pattern
  testMatch: '**/*.spec.ts',

  // Run tests in parallel (but scenarios within a file run sequentially)
  fullyParallel: true,

  // Fail the build on CI if test.only is left in
  forbidOnly: !!process.env.CI,

  // Retry on CI only (flaky test recovery)
  retries: process.env.CI ? 1 : 0,

  // Limit parallel workers on CI (resource constraints)
  workers: process.env.CI ? 2 : undefined,

  // Reporter configuration (CI + local: logs/frontend/playwright/)
  reporter: [
    ['html', { outputFolder: '../../logs/frontend/playwright/playwright-report', open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['github' as const]] : []),
  ],

  // Global setup/teardown for auth
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  // Shared settings for all projects
  use: {
    // Base URL for all page.goto() calls
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',

    // Reuse auth state from global setup
    storageState: '.playwright/auth-state.json',

    // Collect trace on first retry (debugging)
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on first retry
    video: 'on-first-retry',

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Longer timeout for WebSocket-based tests
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // Global test timeout (30s for WebSocket tests)
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Output directory for artifacts (CI + local: logs/frontend/playwright/)
  outputDir: '../../logs/frontend/playwright/test-results',

  // Projects: Chromium only for speed
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox and WebKit can be enabled later if needed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Web server is managed externally via Docker
  // No webServer config needed - we use make e2e-up
})
