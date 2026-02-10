/**
 * Frontend Logger
 *
 * Central structured logging utility for AutomationOne frontend.
 * Produces JSON for Docker/Promtail pipeline or human-readable output for development.
 *
 * Usage:
 *   import { createLogger } from '@/utils/logger'
 *   const logger = createLogger('ESPStore')
 *   logger.error('Device not found', { deviceId: 'ESP_001' })
 */

// =============================================================================
// Types
// =============================================================================

/** Log level hierarchy: error(0) < warn(1) < info(2) < debug(3) */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** Structured log entry for JSON output */
export interface LogEntry {
  level: LogLevel
  component: string
  message: string
  data?: unknown
  timestamp: string
}

/** Logger instance returned by createLogger */
export interface Logger {
  error: (message: string, data?: unknown) => void
  warn: (message: string, data?: unknown) => void
  info: (message: string, data?: unknown) => void
  debug: (message: string, data?: unknown) => void
}

// =============================================================================
// Constants
// =============================================================================

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

/** Configured log level from environment (default: 'info') */
const CONFIGURED_LEVEL: LogLevel =
  (['error', 'warn', 'info', 'debug'].includes(import.meta.env.VITE_LOG_LEVEL)
    ? import.meta.env.VITE_LOG_LEVEL
    : 'info') as LogLevel

/** When true, output human-readable format instead of JSON */
const HUMAN_READABLE: boolean = CONFIGURED_LEVEL === 'debug'

// =============================================================================
// Core
// =============================================================================

/** Check if a log level should be output. error ALWAYS passes (never gated). */
function shouldLog(level: LogLevel): boolean {
  if (level === 'error') return true
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[CONFIGURED_LEVEL]
}

/** Serialize data for JSON output. Handles Error objects (non-enumerable properties). */
function serializeData(data: unknown): unknown {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack }
  }
  return data
}

/**
 * Create a logger instance for a specific component.
 *
 * @param component - Component/module name (e.g., 'ESPStore', 'WebSocket', 'API')
 * @returns Logger instance with error/warn/info/debug methods
 */
export function createLogger(component: string): Logger {
  function log(level: LogLevel, message: string, data?: unknown): void {
    if (!shouldLog(level)) return

    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log

    if (HUMAN_READABLE) {
      const prefix = `[${component}]`
      data !== undefined ? consoleFn(prefix, message, data) : consoleFn(prefix, message)
    } else {
      const entry: LogEntry = {
        level,
        component,
        message,
        timestamp: new Date().toISOString(),
      }
      if (data !== undefined) entry.data = serializeData(data)
      consoleFn(JSON.stringify(entry))
    }
  }

  return {
    error: (message: string, data?: unknown) => log('error', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    debug: (message: string, data?: unknown) => log('debug', message, data),
  }
}
