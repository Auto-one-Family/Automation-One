/**
 * Structured logger factory for frontend components.
 * Outputs JSON to stdout (Docker → Promtail → Loki) with level/component labels.
 * Also logs human-readable format to browser console for dev convenience.
 */

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

const configuredLevel: LogLevel = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOG_LEVEL) || 'debug'
) as LogLevel

const levelIndex = LOG_LEVELS.indexOf(configuredLevel)

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= levelIndex
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

function structuredLog(level: LogLevel, component: string, args: unknown[]): void {
  const entry = JSON.stringify({
    level,
    component,
    message: formatArgs(args),
    timestamp: new Date().toISOString(),
  })
  // Structured JSON goes to stdout (captured by Docker json-file → Promtail → Loki)
  // Use console methods so Docker log driver picks it up with correct stream
  switch (level) {
    case 'error':
      console.error(entry)
      break
    case 'warn':
      console.warn(entry)
      break
    default:
      console.log(entry)
  }
}

export function createLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`
  return {
    debug: (...args: unknown[]) => {
      if (!shouldLog('debug')) return
      structuredLog('debug', namespace, args)
      if (import.meta.env?.DEV) console.debug(prefix, ...args)
    },
    info: (...args: unknown[]) => {
      if (!shouldLog('info')) return
      structuredLog('info', namespace, args)
      if (import.meta.env?.DEV) console.info(prefix, ...args)
    },
    warn: (...args: unknown[]) => {
      if (!shouldLog('warn')) return
      structuredLog('warn', namespace, args)
      if (import.meta.env?.DEV) console.warn(prefix, ...args)
    },
    error: (...args: unknown[]) => {
      if (!shouldLog('error')) return
      structuredLog('error', namespace, args)
      if (import.meta.env?.DEV) console.error(prefix, ...args)
    },
  }
}
