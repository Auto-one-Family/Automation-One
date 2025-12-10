// ✅ NEU: DOM-spezifische Fehlerbehandlung und Race-Condition-Prävention
import { errorHandler } from './errorHandler'

// ✅ NEU: DOM-Error-Kategorien
const DOM_ERROR_TYPES = {
  ELEMENT_NOT_FOUND: {
    category: 'dom',
    userMessage: 'Element nicht gefunden',
    technicalMessage: 'DOM element not found',
    retryable: true,
    maxRetries: 3,
  },
  PARENT_NODE_MISSING: {
    category: 'dom',
    userMessage: 'Übergeordnetes Element nicht verfügbar',
    technicalMessage: 'Parent node missing',
    retryable: true,
    maxRetries: 5,
  },
  ELEMENT_NOT_READY: {
    category: 'dom',
    userMessage: 'Element noch nicht bereit',
    technicalMessage: 'DOM element not ready',
    retryable: true,
    maxRetries: 10,
  },
  MOUNT_ERROR: {
    category: 'dom',
    userMessage: 'Komponente konnte nicht geladen werden',
    technicalMessage: 'Component mount error',
    retryable: true,
    maxRetries: 2,
  },
  UNMOUNT_ERROR: {
    category: 'dom',
    userMessage: 'Komponente konnte nicht entladen werden',
    technicalMessage: 'Component unmount error',
    retryable: false,
  },
}

// ✅ NEU: DOM-Error-Handler-Klasse
class DOMErrorHandler {
  constructor() {
    this.retryQueue = new Map()
    this.domReadyCallbacks = []
    this.elementRegistry = new Map()
  }

  // ✅ NEU: DOM-Ready-Check
  isDOMReady() {
    return document.readyState === 'complete' || document.readyState === 'interactive'
  }

  // ✅ NEU: Warte auf DOM-Ready
  waitForDOM() {
    return new Promise((resolve) => {
      if (this.isDOMReady()) {
        resolve()
      } else {
        document.addEventListener('DOMContentLoaded', resolve)
        document.addEventListener('load', resolve)
      }
    })
  }

  // ✅ NEU: Element-Validierung
  validateElement(element, context = {}) {
    try {
      if (!element) {
        throw new Error('Element is null or undefined')
      }

      if (!element.$el && !element.parentNode) {
        throw new Error('Element has no DOM representation')
      }

      // Prüfe Parent-Node
      const parentNode = element.$el?.parentNode || element.parentNode
      if (!parentNode) {
        throw new Error('Element has no parent node')
      }

      return true
    } catch (error) {
      this.handleDOMError(error, {
        ...context,
        elementType: element?.constructor?.name,
      })
      return false
    }
  }

  // ✅ NEU: Sichere Element-Initialisierung
  async initializeElement(element, context = {}) {
    const elementId = context.elementId || `element_${Date.now()}`

    try {
      // Warte auf DOM-Ready
      await this.waitForDOM()

      // Validierung
      if (!this.validateElement(element, context)) {
        return false
      }

      // Element registrieren
      this.elementRegistry.set(elementId, {
        element,
        context,
        initialized: true,
        timestamp: Date.now(),
      })

      console.log(`✅ Element initialized: ${elementId}`)
      return true
    } catch (error) {
      this.handleDOMError(error, { ...context, elementId })
      return false
    }
  }

  // ✅ NEU: DOM-Error behandeln
  handleDOMError(error, context = {}) {
    const errorInfo = this.parseDOMError(error, context)

    // Error loggen
    errorHandler.error(`DOM Error: ${errorInfo.technicalMessage}`, error, context)

    // Retry-Logik für DOM-Fehler
    if (errorInfo.retryable && errorInfo.retryCount < errorInfo.maxRetries) {
      this.scheduleRetry(errorInfo)
    }

    return errorInfo
  }

  // ✅ NEU: DOM-Error parsen
  parseDOMError(error, context = {}) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: this.determineDOMErrorType(error),
      category: 'dom',
      userMessage: 'DOM-Fehler aufgetreten',
      technicalMessage: error.message || 'Unknown DOM error',
      stack: error.stack,
      context,
      retryable: false,
      retryCount: 0,
      maxRetries: 0,
    }

    // Error-Typ-spezifische Informationen
    const errorType = DOM_ERROR_TYPES[errorInfo.type]
    if (errorType) {
      Object.assign(errorInfo, errorType)
    }

    return errorInfo
  }

  // ✅ NEU: DOM-Error-Typ bestimmen
  determineDOMErrorType(error) {
    const message = error.message?.toLowerCase() || ''

    if (message.includes('parentnode') || message.includes('parent node')) {
      return 'PARENT_NODE_MISSING'
    }

    if (
      message.includes('not found') ||
      message.includes('null') ||
      message.includes('undefined')
    ) {
      return 'ELEMENT_NOT_FOUND'
    }

    if (message.includes('not ready') || message.includes('not mounted')) {
      return 'ELEMENT_NOT_READY'
    }

    if (message.includes('mount')) {
      return 'MOUNT_ERROR'
    }

    if (message.includes('unmount')) {
      return 'UNMOUNT_ERROR'
    }

    return 'ELEMENT_NOT_FOUND'
  }

  // ✅ NEU: Retry planen
  scheduleRetry(errorInfo) {
    const retryKey = `${errorInfo.type}-${errorInfo.context?.elementId || 'global'}`
    const currentRetries = this.retryQueue.get(retryKey) || 0

    if (currentRetries < errorInfo.maxRetries) {
      this.retryQueue.set(retryKey, currentRetries + 1)

      // Exponentielle Verzögerung für DOM-Retry
      const delay = Math.pow(2, currentRetries) * 100
      setTimeout(() => {
        this.retryDOMOperation(errorInfo)
      }, delay)
    }
  }

  // ✅ NEU: DOM-Operation wiederholen
  retryDOMOperation(errorInfo) {
    const retryContext = {
      ...errorInfo.context,
      retryCount: errorInfo.retryCount + 1,
      isRetry: true,
    }

    // Event auslösen für Retry-Handler
    window.dispatchEvent(
      new CustomEvent('dom-error-retry', {
        detail: { errorInfo, retryContext },
      }),
    )
  }

  // ✅ NEU: Sichere Event-Listener-Registrierung
  addSafeEventListener(element, event, handler, options = {}) {
    try {
      if (!element) {
        throw new Error('Element is null for event listener')
      }

      const target = element.$el || element
      target.addEventListener(event, handler, options)

      // Cleanup-Funktion zurückgeben
      return () => {
        try {
          target.removeEventListener(event, handler, options)
        } catch (error) {
          console.warn('Failed to remove event listener:', error)
        }
      }
    } catch (error) {
      this.handleDOMError(error, { event, elementType: element?.constructor?.name })
      return () => {} // Leere Cleanup-Funktion
    }
  }

  // ✅ NEU: Sichere Komponenten-Lifecycle
  safeMount(component, context = {}) {
    return new Promise((resolve, reject) => {
      this.waitForDOM()
        .then(() => component.mount())
        .then((result) => {
          if (this.validateElement(result, context)) {
            resolve(result)
          } else {
            reject(new Error('Component mount validation failed'))
          }
        })
        .catch((error) => {
          this.handleDOMError(error, { ...context, operation: 'mount' })
          reject(error)
        })
    })
  }

  // ✅ NEU: Sichere Komponenten-Unmount
  safeUnmount(component, context = {}) {
    return new Promise((resolve) => {
      component
        .unmount()
        .then(() => resolve())
        .catch((error) => {
          this.handleDOMError(error, { ...context, operation: 'unmount' })
          // Unmount-Fehler sind nicht kritisch, daher resolve
          resolve()
        })
    })
  }

  // ✅ NEU: Element-Registry abrufen
  getElementInfo(elementId) {
    return this.elementRegistry.get(elementId)
  }

  // ✅ NEU: Registry bereinigen
  cleanupRegistry() {
    const now = Date.now()
    const maxAge = 30 * 60 * 1000 // 30 Minuten

    for (const [id, info] of this.elementRegistry.entries()) {
      if (now - info.timestamp > maxAge) {
        this.elementRegistry.delete(id)
      }
    }
  }

  // ✅ NEU: Error-ID generieren
  generateErrorId() {
    return `dom_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // ✅ NEU: Performance-Monitoring für DOM-Operationen
  measureDOMOperation(operation, callback) {
    const start = performance.now()

    try {
      const result = callback()
      const duration = performance.now() - start

      // Warnung bei langsamen DOM-Operationen
      if (duration > 16) {
        console.warn(`Slow DOM operation: ${operation} took ${duration.toFixed(2)}ms`)
      }

      return result
    } catch (error) {
      const duration = performance.now() - start
      console.error(`DOM operation failed: ${operation} after ${duration.toFixed(2)}ms`, error)
      throw error
    }
  }
}

// ✅ NEU: Singleton-Instanz
export const domErrorHandler = new DOMErrorHandler()

// ✅ NEU: Convenience-Funktionen
export const isDOMReady = () => domErrorHandler.isDOMReady()
export const waitForDOM = () => domErrorHandler.waitForDOM()
export const validateElement = (element, context) =>
  domErrorHandler.validateElement(element, context)
export const initializeElement = (element, context) =>
  domErrorHandler.initializeElement(element, context)
export const addSafeEventListener = (element, event, handler, options) =>
  domErrorHandler.addSafeEventListener(element, event, handler, options)
export const safeMount = (component, context) => domErrorHandler.safeMount(component, context)
export const safeUnmount = (component, context) => domErrorHandler.safeUnmount(component, context)
export const measureDOMOperation = (operation, callback) =>
  domErrorHandler.measureDOMOperation(operation, callback)
