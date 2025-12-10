/**
 * Snackbar Utilities - Sichere Snackbar-Verwendung mit Fallback-Mechanismen
 *
 * Diese Datei stellt sichere Wrapper-Funktionen für die GlobalSnackbar bereit,
 * die automatisch Fallback-Mechanismen verwenden, wenn die Snackbar nicht verfügbar ist.
 */

/**
 * Sichere Snackbar-Verwendung mit Fallback
 * @param {string} type - Snackbar-Typ ('success', 'error', 'info', 'warning')
 * @param {string} message - Nachricht
 * @param {Object} options - Zusätzliche Optionen
 */
export function safeSnackbar(type, message, options = {}) {
  try {
    if (
      window.$snackbar &&
      typeof window.$snackbar[`show${type.charAt(0).toUpperCase() + type.slice(1)}`] === 'function'
    ) {
      const method = `show${type.charAt(0).toUpperCase() + type.slice(1)}`
      window.$snackbar[method](message, options)
      return true
    } else {
      // Fallback: Console-Log mit entsprechendem Icon
      const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️',
      }
      console.log(`${icons[type] || '📝'} ${message}`)
      return false
    }
  } catch (error) {
    console.warn(`Snackbar error (${type}):`, error.message)
    // Fallback: Console-Log
    console.log(`📝 ${message}`)
    return false
  }
}

/**
 * Sichere Success-Snackbar
 * @param {string} message - Erfolgsnachricht
 * @param {Object} options - Zusätzliche Optionen
 */
export function safeSuccess(message, options = {}) {
  return safeSnackbar('success', message, options)
}

/**
 * Sichere Error-Snackbar
 * @param {string} message - Fehlernachricht
 * @param {Object} options - Zusätzliche Optionen
 */
export function safeError(message, options = {}) {
  return safeSnackbar('error', message, options)
}

/**
 * Sichere Info-Snackbar
 * @param {string} message - Informationsnachricht
 * @param {Object} options - Zusätzliche Optionen
 */
export function safeInfo(message, options = {}) {
  return safeSnackbar('info', message, options)
}

/**
 * Sichere Warning-Snackbar
 * @param {string} message - Warnnachricht
 * @param {Object} options - Zusätzliche Optionen
 */
export function safeWarning(message, options = {}) {
  return safeSnackbar('warning', message, options)
}

/**
 * Prüft ob Snackbar verfügbar ist
 * @returns {boolean} - True wenn Snackbar verfügbar
 */
export function isSnackbarAvailable() {
  return !!(window.$snackbar && typeof window.$snackbar.showSuccess === 'function')
}

/**
 * Wartet auf Snackbar-Verfügbarkeit
 * @param {number} maxWait - Maximale Wartezeit in ms
 * @returns {Promise<boolean>} - True wenn Snackbar verfügbar
 */
export function waitForSnackbar(maxWait = 5000) {
  return new Promise((resolve) => {
    if (isSnackbarAvailable()) {
      resolve(true)
      return
    }

    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      if (isSnackbarAvailable()) {
        clearInterval(checkInterval)
        resolve(true)
      } else if (Date.now() - startTime > maxWait) {
        clearInterval(checkInterval)
        resolve(false)
      }
    }, 100)
  })
}

/**
 * Snackbar mit Retry-Logic
 * @param {string} type - Snackbar-Typ
 * @param {string} message - Nachricht
 * @param {Object} options - Optionen
 * @param {number} maxRetries - Maximale Wiederholungsversuche
 */
export async function retrySnackbar(type, message, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    if (safeSnackbar(type, message, options)) {
      return true
    }

    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)))
    }
  }

  return false
}

// Exportiere alle Funktionen als Default-Objekt
export default {
  safeSnackbar,
  safeSuccess,
  safeError,
  safeInfo,
  safeWarning,
  isSnackbarAvailable,
  waitForSnackbar,
  retrySnackbar,
}
