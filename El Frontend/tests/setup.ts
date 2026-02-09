/**
 * Vitest Global Setup
 *
 * This file runs before each test file.
 * Sets up MSW, Pinia testing utilities, and global mocks.
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { server } from './mocks/server'

// =============================================================================
// MSW Server Setup
// =============================================================================

beforeAll(() => {
  // Start MSW server before all tests
  server.listen({
    onUnhandledRequest: 'warn'
  })
})

afterEach(() => {
  // Reset handlers after each test (clears runtime overrides)
  server.resetHandlers()
  // Clear localStorage
  localStorage.clear()
  // Clear sessionStorage
  sessionStorage.clear()
})

afterAll(() => {
  // Stop MSW server after all tests
  server.close()
})

// =============================================================================
// Pinia Setup (fresh store per test)
// =============================================================================

beforeEach(() => {
  // Create fresh Pinia instance for each test
  setActivePinia(createPinia())
})

// =============================================================================
// Vue Test Utils Global Config
// =============================================================================

// Stub router-link and router-view globally
config.global.stubs = {
  RouterLink: true,
  RouterView: true,
  // Stub teleport to prevent portal issues in jsdom
  teleport: true
}

// =============================================================================
// Global Mocks
// =============================================================================

// Mock window.matchMedia (not available in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

// Mock IntersectionObserver (not available in jsdom)
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: []
}))

// Mock scrollTo (not available in jsdom)
window.scrollTo = vi.fn()

// Mock HTMLCanvasElement.getContext for Chart.js
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => []),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn()
  })),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn()
  }))
}) as unknown as typeof HTMLCanvasElement.prototype.getContext

// =============================================================================
// Console Suppressions (optional - suppress noisy warnings in tests)
// =============================================================================

// Uncomment to suppress Vue warnings in tests
// const originalWarn = console.warn
// console.warn = (...args) => {
//   if (args[0]?.includes?.('[Vue warn]')) return
//   originalWarn(...args)
// }

// =============================================================================
// Type Declarations for globals
// =============================================================================

declare global {
  // eslint-disable-next-line no-var
  var ResizeObserver: typeof ResizeObserver
  // eslint-disable-next-line no-var
  var IntersectionObserver: typeof IntersectionObserver
}

// Make beforeEach available (imported from vitest in tests)
import { beforeEach } from 'vitest'
export { beforeEach }
