// ✅ ERWEITERT: Strukturierte Fehlerbehandlung
import { storage } from './storage'

// ✅ NEU: Error-Kategorien für bessere Behandlung
const ERROR_CATEGORIES = {
  NETWORK: 'network',
  VALIDATION: 'validation',
  PERMISSION: 'permission',
  SYSTEM: 'system',
  USER: 'user',
  UNKNOWN: 'unknown',
  // 🆕 NEU: Hierarchische God-Kaiser Fehler-Kategorien
  GOD_KAISER: 'god_kaiser',
  CROSS_KAISER: 'cross_kaiser',
  ESP_OWNERSHIP: 'esp_ownership',
  COMMAND_CHAIN: 'command_chain',
}

// ✅ NEU: Error-Typen mit spezifischen Behandlungen
const ERROR_TYPES = {
  MQTT_CONNECTION_FAILED: {
    category: ERROR_CATEGORIES.NETWORK,
    userMessage: 'Verbindung zum MQTT-Server fehlgeschlagen',
    technicalMessage: 'MQTT connection failed',
    retryable: true,
    maxRetries: 3,
  },
  MQTT_PUBLISH_FAILED: {
    category: ERROR_CATEGORIES.NETWORK,
    userMessage: 'Nachricht konnte nicht gesendet werden',
    technicalMessage: 'MQTT publish failed',
    retryable: true,
    maxRetries: 2,
  },
  VALIDATION_ERROR: {
    category: ERROR_CATEGORIES.VALIDATION,
    userMessage: 'Ungültige Eingabe',
    technicalMessage: 'Validation error',
    retryable: false,
  },
  PERMISSION_DENIED: {
    category: ERROR_CATEGORIES.PERMISSION,
    userMessage: 'Keine Berechtigung für diese Aktion',
    technicalMessage: 'Permission denied',
    retryable: false,
  },
  SYSTEM_ERROR: {
    category: ERROR_CATEGORIES.SYSTEM,
    userMessage: 'Systemfehler aufgetreten',
    technicalMessage: 'System error',
    retryable: true,
    maxRetries: 1,
  },
  USER_CANCELLED: {
    category: ERROR_CATEGORIES.USER,
    userMessage: 'Aktion vom Benutzer abgebrochen',
    technicalMessage: 'User cancelled',
    retryable: false,
  },
  // 🆕 NEU: God-Kaiser spezifische Error-Typen
  ESP_OWNERSHIP_CONFLICT: {
    category: ERROR_CATEGORIES.ESP_OWNERSHIP,
    userMessage: 'ESP-Besitzkonflikt - God-Autorisation erforderlich',
    technicalMessage: 'ESP ownership conflict',
    retryable: true,
    maxRetries: 2,
  },
  KAISER_ID_CONFLICT: {
    category: ERROR_CATEGORIES.GOD_KAISER,
    userMessage: 'Kaiser-ID-Konflikt - Eindeutige ID erforderlich',
    technicalMessage: 'Kaiser ID conflict',
    retryable: true,
    maxRetries: 1,
  },
  COMMAND_CHAIN_TIMEOUT: {
    category: ERROR_CATEGORIES.COMMAND_CHAIN,
    userMessage: 'Befehlskette-Timeout - Netzwerk prüfen',
    technicalMessage: 'Command chain timeout',
    retryable: true,
    maxRetries: 3,
  },
  CROSS_KAISER_COMMUNICATION_FAILED: {
    category: ERROR_CATEGORIES.CROSS_KAISER,
    userMessage: 'Cross-Kaiser-Kommunikation fehlgeschlagen',
    technicalMessage: 'Cross-kaiser communication failed',
    retryable: true,
    maxRetries: 2,
  },
  GOD_AUTHORIZATION_FAILED: {
    category: ERROR_CATEGORIES.GOD_KAISER,
    userMessage: 'God-Autorisation fehlgeschlagen',
    technicalMessage: 'God authorization failed',
    retryable: false,
  },
}

// ✅ NEU: Error-Handler-Klasse
class ErrorHandler {
  constructor() {
    this.errorLog = []
    this.maxLogSize = 100
    this.retryCounts = new Map()

    // 🆕 NEU: Hierarchische Fehlerbehandlung
    this.hierarchicalErrorHandler = new HierarchicalErrorHandler()
  }

  // ✅ NEU: Strukturierte Fehlerbehandlung
  handleError(error, context = {}) {
    const errorInfo = this.parseError(error, context)

    // 🆕 NEU: Hierarchische Fehlerbehandlung prüfen
    if (this.isHierarchicalError(errorInfo)) {
      return this.hierarchicalErrorHandler.handleHierarchicalError(errorInfo)
    }

    // Error loggen
    this.logError(errorInfo)

    // Benutzerfreundliche Nachricht anzeigen
    this.showUserFriendlyError(errorInfo)

    // Technische Details loggen
    this.logTechnicalError(errorInfo)

    // Retry-Logik wenn möglich
    if (errorInfo.retryable && errorInfo.retryCount < errorInfo.maxRetries) {
      this.handleRetry(errorInfo)
    }

    return errorInfo
  }

  // 🆕 NEU: Hierarchische Fehler erkennen
  isHierarchicalError(errorInfo) {
    return [
      ERROR_CATEGORIES.GOD_KAISER,
      ERROR_CATEGORIES.CROSS_KAISER,
      ERROR_CATEGORIES.ESP_OWNERSHIP,
      ERROR_CATEGORIES.COMMAND_CHAIN,
    ].includes(errorInfo.category)
  }

  // ✅ NEU: Error parsen und kategorisieren
  parseError(error, context = {}) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: this.determineErrorType(error),
      category: ERROR_CATEGORIES.UNKNOWN,
      userMessage: 'Ein unerwarteter Fehler ist aufgetreten',
      technicalMessage: error.message || 'Unknown error',
      stack: error.stack,
      context,
      retryable: false,
      retryCount: 0,
      maxRetries: 0,
      severity: 'error',
      // Erweiterung:
      error_type: error.error_type || error.errorType || context.error_type || 'unknown',
      error_code: error.error_code || error.errorCode || context.error_code || 'GENERIC_ERROR',
      recovery_action:
        error.recovery_action || error.recoveryAction || context.recovery_action || null,
    }

    // Error-Typ-spezifische Informationen
    const errorType = ERROR_TYPES[errorInfo.type]
    if (errorType) {
      Object.assign(errorInfo, errorType)
      errorInfo.userMessage = errorType.userMessage
      errorInfo.technicalMessage = errorType.technicalMessage
    }

    // Kontext-spezifische Anpassungen
    this.adaptErrorForContext(errorInfo, context)

    return errorInfo
  }

  // ✅ NEU: Error-Typ bestimmen
  determineErrorType(error) {
    if (error.message?.includes('MQTT')) {
      if (error.message?.includes('connection')) return 'MQTT_CONNECTION_FAILED'
      if (error.message?.includes('publish')) return 'MQTT_PUBLISH_FAILED'
    }

    // 🆕 NEU: Hierarchische Error-Typen erkennen
    if (error.message?.includes('ESP ownership')) return 'ESP_OWNERSHIP_CONFLICT'
    if (error.message?.includes('Kaiser ID')) return 'KAISER_ID_CONFLICT'
    if (error.message?.includes('Command chain timeout')) return 'COMMAND_CHAIN_TIMEOUT'
    if (error.message?.includes('Cross-kaiser')) return 'CROSS_KAISER_COMMUNICATION_FAILED'
    if (error.message?.includes('God authorization')) return 'GOD_AUTHORIZATION_FAILED'

    if (error.name === 'ValidationError') return 'VALIDATION_ERROR'
    if (error.name === 'PermissionError') return 'PERMISSION_DENIED'
    if (error.name === 'UserCancelledError') return 'USER_CANCELLED'

    return 'SYSTEM_ERROR'
  }

  // ✅ NEU: Kontext-spezifische Anpassungen
  adaptErrorForContext(errorInfo, context) {
    if (context.espId) {
      errorInfo.userMessage += ` (ESP: ${context.espId})`
    }

    if (context.kaiserId) {
      errorInfo.userMessage += ` (Kaiser: ${context.kaiserId})`
    }

    if (context.action) {
      errorInfo.userMessage += ` bei ${context.action}`
    }

    if (context.retryCount) {
      errorInfo.retryCount = context.retryCount
    }
    if (context.error_type) errorInfo.error_type = context.error_type
    if (context.error_code) errorInfo.error_code = context.error_code
    if (context.recovery_action) errorInfo.recovery_action = context.recovery_action
    if (context.context) errorInfo.context = context.context
  }

  // ✅ NEU: Benutzerfreundliche Fehlermeldung anzeigen
  showUserFriendlyError(errorInfo) {
    // Globale Snackbar verwenden
    if (window.$snackbar) {
      const snackbarOptions = {
        color: this.getErrorColor(errorInfo.severity),
        timeout: this.getErrorTimeout(errorInfo.category),
        action: errorInfo.retryable ? 'Wiederholen' : null,
        actionCallback: errorInfo.retryable ? () => this.retryError(errorInfo) : null,
      }

      window.$snackbar.showError(errorInfo.userMessage, snackbarOptions)
    } else {
      // Fallback: Console
      console.error('User Error:', errorInfo.userMessage)
    }
  }

  // ✅ NEU: Technische Fehler loggen
  logTechnicalError(errorInfo) {
    console.error('Technical Error:', {
      id: errorInfo.id,
      type: errorInfo.type,
      category: errorInfo.category,
      message: errorInfo.technicalMessage,
      stack: errorInfo.stack,
      context: errorInfo.context,
      timestamp: new Date(errorInfo.timestamp).toISOString(),
    })
  }

  // ✅ NEU: Error loggen
  logError(errorInfo) {
    this.errorLog.unshift(errorInfo)

    // Log-Größe begrenzen
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize)
    }

    // Persistierung
    storage.save('error_log', this.errorLog)
  }

  // ✅ NEU: Retry-Logik
  handleRetry(errorInfo) {
    const retryKey = `${errorInfo.type}-${errorInfo.context?.espId || 'global'}`
    const currentRetries = this.retryCounts.get(retryKey) || 0

    if (currentRetries < errorInfo.maxRetries) {
      this.retryCounts.set(retryKey, currentRetries + 1)

      // Retry mit exponentieller Verzögerung
      const delay = Math.pow(2, currentRetries) * 1000
      setTimeout(() => {
        this.retryError(errorInfo)
      }, delay)
    }
  }

  // ✅ NEU: Error wiederholen
  retryError(errorInfo) {
    const retryContext = {
      ...errorInfo.context,
      retryCount: errorInfo.retryCount + 1,
      isRetry: true,
    }

    // Event auslösen für Retry-Handler
    window.dispatchEvent(
      new CustomEvent('error-retry', {
        detail: { errorInfo, retryContext },
      }),
    )
  }

  // ✅ NEU: Error-Farbe bestimmen
  getErrorColor(severity) {
    const colors = {
      error: 'error',
      warning: 'warning',
      info: 'info',
    }
    return colors[severity] || 'error'
  }

  // ✅ NEU: Error-Timeout bestimmen
  getErrorTimeout(category) {
    const timeouts = {
      [ERROR_CATEGORIES.NETWORK]: 8000,
      [ERROR_CATEGORIES.VALIDATION]: 5000,
      [ERROR_CATEGORIES.PERMISSION]: 6000,
      [ERROR_CATEGORIES.SYSTEM]: 10000,
      [ERROR_CATEGORIES.USER]: 3000,
      [ERROR_CATEGORIES.UNKNOWN]: 5000,
      // 🆕 NEU: Hierarchische Timeouts
      [ERROR_CATEGORIES.GOD_KAISER]: 12000,
      [ERROR_CATEGORIES.CROSS_KAISER]: 10000,
      [ERROR_CATEGORIES.ESP_OWNERSHIP]: 8000,
      [ERROR_CATEGORIES.COMMAND_CHAIN]: 15000,
    }
    return timeouts[category] || 5000
  }

  // ✅ NEU: Error-ID generieren
  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // ✅ NEU: Benutzerfreundliche Fehlermeldungen
  getUserFriendlyMessage(error) {
    const errorMessages = {
      NETWORK_ERROR: 'Verbindungsfehler - Prüfen Sie Ihre Internetverbindung',
      MQTT_CONNECTION_FAILED: 'MQTT-Verbindung fehlgeschlagen - Broker erreichbar?',
      DEVICE_NOT_FOUND: 'Gerät nicht gefunden - Wurde es entfernt?',
      PERMISSION_DENIED: 'Keine Berechtigung - Administrator kontaktieren',
      TIMEOUT: 'Zeitüberschreitung - Versuchen Sie es erneut',
      VALIDATION_ERROR: 'Ungültige Eingabe - Prüfen Sie die Daten',
      // 🆕 NEU: Hierarchische Fehlermeldungen
      ESP_OWNERSHIP_CONFLICT: 'ESP-Besitzkonflikt - God-Autorisation erforderlich',
      KAISER_ID_CONFLICT: 'Kaiser-ID-Konflikt - Eindeutige ID erforderlich',
      COMMAND_CHAIN_TIMEOUT: 'Befehlskette-Timeout - Netzwerk prüfen',
      CROSS_KAISER_COMMUNICATION_FAILED: 'Cross-Kaiser-Kommunikation fehlgeschlagen',
      GOD_AUTHORIZATION_FAILED: 'God-Autorisation fehlgeschlagen',
      DEFAULT: 'Ein unerwarteter Fehler ist aufgetreten',
    }

    const errorType = this.getErrorType(error)
    return errorMessages[errorType] || errorMessages.DEFAULT
  }

  // ✅ NEU: Fehler-Typ-Klassifikation
  getErrorType(error) {
    if (error.message?.includes('Network Error')) return 'NETWORK_ERROR'
    if (error.message?.includes('MQTT')) return 'MQTT_CONNECTION_FAILED'
    if (error.message?.includes('404')) return 'DEVICE_NOT_FOUND'
    if (error.message?.includes('403')) return 'PERMISSION_DENIED'
    if (error.message?.includes('timeout')) return 'TIMEOUT'
    if (error.message?.includes('validation')) return 'VALIDATION_ERROR'
    // 🆕 NEU: Hierarchische Error-Typen
    if (error.message?.includes('ESP ownership')) return 'ESP_OWNERSHIP_CONFLICT'
    if (error.message?.includes('Kaiser ID')) return 'KAISER_ID_CONFLICT'
    if (error.message?.includes('Command chain timeout')) return 'COMMAND_CHAIN_TIMEOUT'
    if (error.message?.includes('Cross-kaiser')) return 'CROSS_KAISER_COMMUNICATION_FAILED'
    if (error.message?.includes('God authorization')) return 'GOD_AUTHORIZATION_FAILED'
    return 'DEFAULT'
  }

  // ✅ NEU: Automatische Fehler-Wiederherstellung
  async attemptRecovery(error) {
    const recoveryStrategies = {
      NETWORK_ERROR: () => this.retryConnection(),
      MQTT_CONNECTION_FAILED: () => this.reconnectMQTT(),
      DEVICE_NOT_FOUND: () => this.refreshDeviceList(),
      TIMEOUT: () => this.retryOperation(),
      // 🆕 NEU: Hierarchische Wiederherstellungsstrategien
      ESP_OWNERSHIP_CONFLICT: () =>
        this.hierarchicalErrorHandler.resolveEspOwnershipConflict(error),
      KAISER_ID_CONFLICT: () => this.hierarchicalErrorHandler.resolveKaiserIdConflict(error),
      COMMAND_CHAIN_TIMEOUT: () => this.hierarchicalErrorHandler.resolveCommandChainTimeout(error),
      CROSS_KAISER_COMMUNICATION_FAILED: () =>
        this.hierarchicalErrorHandler.retryCrossKaiserCommunication(error),
    }

    const errorType = this.getErrorType(error)
    const strategy = recoveryStrategies[errorType]

    if (strategy) {
      try {
        await strategy()
        return { success: true, message: 'Automatische Wiederherstellung erfolgreich' }
      } catch {
        return { success: false, message: 'Wiederherstellung fehlgeschlagen' }
      }
    }

    return { success: false, message: 'Keine Wiederherstellungsstrategie verfügbar' }
  }

  // ✅ NEU: Retry-Strategien
  async retryConnection() {
    // Implementierung für Verbindungs-Wiederherstellung
    console.log('Attempting connection recovery...')
  }

  async reconnectMQTT() {
    // Implementierung für MQTT-Wiederherstellung
    console.log('Attempting MQTT reconnection...')
  }

  async refreshDeviceList() {
    // Implementierung für Device-List-Refresh
    console.log('Refreshing device list...')
  }

  async retryOperation() {
    // Implementierung für Operation-Retry
    console.log('Retrying operation...')
  }

  // ✅ NEU: Error-Log abrufen
  getErrorLog(limit = null) {
    if (limit) {
      return this.errorLog.slice(0, limit)
    }
    return this.errorLog
  }

  // ✅ NEU: Error-Statistiken abrufen
  getErrorStats() {
    const stats = {
      total: this.errorLog.length,
      byCategory: {},
      byType: {},
      recent: this.errorLog.filter((error) => Date.now() - error.timestamp < 24 * 60 * 60 * 1000)
        .length,
    }

    this.errorLog.forEach((error) => {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1
    })

    return stats
  }

  // ✅ NEU: Error-Log löschen
  clearErrorLog() {
    this.errorLog = []
    storage.remove('error_log')
  }

  // ✅ NEU: Error-Log wiederherstellen
  restoreErrorLog() {
    const savedLog = storage.load('error_log', [])
    if (Array.isArray(savedLog)) {
      this.errorLog = savedLog.slice(0, this.maxLogSize)
    }
  }

  // ✅ NEU: Warn-Methode für nicht-kritische Fehler
  warn(message, error = null, context = {}) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: 'WARNING',
      category: ERROR_CATEGORIES.SYSTEM,
      userMessage: message,
      technicalMessage: error?.message || message,
      stack: error?.stack,
      context,
      retryable: false,
      retryCount: 0,
      maxRetries: 0,
      severity: 'warning',
    }

    this.logError(errorInfo)

    // Warnung in Console (nur in Development)
    if (import.meta.env.DEV) {
      console.warn('⚠️', message, error || '')
    }

    return errorInfo
  }

  // ✅ NEU: Log-Methode für Informationsmeldungen
  log(message, data = null) {
    const logInfo = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: 'INFO',
      category: ERROR_CATEGORIES.SYSTEM,
      userMessage: message,
      technicalMessage: message,
      context: { data },
      retryable: false,
      retryCount: 0,
      maxRetries: 0,
      severity: 'info',
    }

    // Log nur in Development oder wenn explizit gewünscht
    if (import.meta.env.DEV) {
      console.log('ℹ️', message, data || '')
    }

    return logInfo
  }

  // ✅ NEU: Error-Methode für Fehlerbehandlung (Backward Compatibility)
  error(message, error = null, context = {}) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: 'ERROR',
      category: ERROR_CATEGORIES.SYSTEM,
      userMessage: message,
      technicalMessage: error?.message || message,
      stack: error?.stack,
      context,
      retryable: false,
      retryCount: 0,
      maxRetries: 0,
      severity: 'error',
    }

    // Error loggen
    this.logError(errorInfo)

    // Benutzerfreundliche Nachricht anzeigen
    this.showUserFriendlyError(errorInfo)

    // Technische Details loggen
    this.logTechnicalError(errorInfo)

    // Error in Console (nur in Development)
    if (import.meta.env.DEV) {
      console.error('❌', message, error || '')
    }

    return errorInfo
  }

  // ✅ NEU: Info-Methode für Informationsmeldungen (Backward Compatibility)
  info(message, data = null) {
    const infoData = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: 'INFO',
      category: ERROR_CATEGORIES.SYSTEM,
      userMessage: message,
      technicalMessage: message,
      context: { data },
      retryable: false,
      retryCount: 0,
      maxRetries: 0,
      severity: 'info',
    }

    // Info nur in Development oder wenn explizit gewünscht
    if (import.meta.env.DEV) {
      console.info('ℹ️', message, data || '')
    }

    return infoData
  }
}

// 🆕 NEU: Hierarchische Fehlerbehandlung-Klasse
class HierarchicalErrorHandler {
  constructor() {
    this.conflictResolutionStrategies = new Map()
    this.retryDelays = {
      esp_ownership: 2000,
      kaiser_id: 1000,
      command_chain: 5000,
      cross_kaiser: 3000,
    }

    // ✅ NEU: Error-Isolation und Recovery-Strategien
    this.errorIsolation = {
      storeErrors: new Map(), // Map<storeName, { count, lastError, recoveryAttempts }>
      crossStoreErrors: new Map(), // Map<errorType, { affectedStores, severity }>
      recoveryStrategies: new Map(), // Map<errorType, recoveryFunction>
      isolationEnabled: true, // 🔒 Error-Isolation aktiviert
    }

    // ✅ NEU: Hierarchische Error-Propagation
    this.errorPropagation = {
      propagationRules: new Map(), // Map<errorType, propagationPath>
      errorChains: new Map(), // Map<chainId, { errors, depth, resolved }>
      maxPropagationDepth: 5, // 🔒 Max Propagation-Tiefe
      propagationEnabled: true, // 🔒 Error-Propagation aktiviert
    }

    // ✅ NEU: Recovery-Strategien
    this.recoveryStrategies = {
      STORE_ISOLATION: 'store_isolation',
      GRADUAL_DEGRADATION: 'gradual_degradation',
      FALLBACK_MODE: 'fallback_mode',
      AUTOMATIC_RETRY: 'automatic_retry',
      MANUAL_INTERVENTION: 'manual_intervention',
    }
  }

  // ✅ NEU: Error-Isolation für Store-Fehler
  isolateStoreError(storeName, error) {
    if (!this.errorIsolation.isolationEnabled) return false

    const storeError = this.errorIsolation.storeErrors.get(storeName) || {
      count: 0,
      lastError: null,
      recoveryAttempts: 0,
      lastRecovery: null,
      isolationLevel: 'none', // 🔒 NEU: Isolation-Level-Tracking
    }

    storeError.count++
    storeError.lastError = {
      message: error.message,
      timestamp: Date.now(),
      type: error.type || 'unknown',
      severity: this.determineErrorSeverity(error), // 🔒 NEU: Severity-Bestimmung
    }

    this.errorIsolation.storeErrors.set(storeName, storeError)

    // 🔒 NEU: Automatische Recovery-Strategie basierend auf Fehler-Schwere
    if (storeError.count >= 3) {
      return this.applyRecoveryStrategy(storeName, storeError)
    }

    return false
  }

  // ✅ NEU: Recovery-Strategien anwenden
  applyRecoveryStrategy(storeName, storeError) {
    const strategy = this.determineRecoveryStrategy(storeName, storeError)

    console.log(`🔄 Applying recovery strategy for ${storeName}: ${strategy}`)

    switch (strategy) {
      case this.recoveryStrategies.STORE_ISOLATION:
        return this.isolateStore(storeName)
      case this.recoveryStrategies.GRADUAL_DEGRADATION:
        return this.enableGradualDegradation(storeName)
      case this.recoveryStrategies.FALLBACK_MODE:
        return this.enableFallbackMode(storeName)
      case this.recoveryStrategies.AUTOMATIC_RETRY:
        return this.retryStoreOperation(storeName)
      case this.recoveryStrategies.MANUAL_INTERVENTION:
        return this.requestManualIntervention(storeName)
      default:
        return false
    }
  }

  // ✅ NEU: Recovery-Strategie bestimmen
  determineRecoveryStrategy(storeName, storeError) {
    // Kritische Stores: Sofortige Isolation
    const criticalStores = ['mqtt', 'centralDataHub', 'actuatorLogic']
    if (criticalStores.includes(storeName)) {
      return this.recoveryStrategies.STORE_ISOLATION
    }

    // Häufige Fehler: Automatischer Retry
    if (storeError.count < 5) {
      return this.recoveryStrategies.AUTOMATIC_RETRY
    }

    // Persistente Fehler: Graduelle Degradation
    if (storeError.count < 10) {
      return this.recoveryStrategies.GRADUAL_DEGRADATION
    }

    // Kritische Fehler: Fallback-Modus
    if (storeError.count < 15) {
      return this.recoveryStrategies.FALLBACK_MODE
    }

    // Letzte Option: Manuelle Intervention
    return this.recoveryStrategies.MANUAL_INTERVENTION
  }

  // ✅ NEU: Store isolieren
  isolateStore(storeName) {
    console.log(`🔒 Isolating store: ${storeName}`)

    // Store in isolierten Modus versetzen
    try {
      const store = this.getStoreInstance(storeName)
      if (store && store.enableIsolationMode) {
        store.enableIsolationMode()
        return true
      }
    } catch (error) {
      console.error(`❌ Failed to isolate store ${storeName}:`, error)
    }

    return false
  }

  // ✅ NEU: Graduelle Degradation aktivieren
  enableGradualDegradation(storeName) {
    console.log(`📉 Enabling gradual degradation for: ${storeName}`)

    try {
      const store = this.getStoreInstance(storeName)
      if (store && store.enableDegradationMode) {
        store.enableDegradationMode()
        return true
      }
    } catch (error) {
      console.error(`❌ Failed to enable degradation for ${storeName}:`, error)
    }

    return false
  }

  // ✅ NEU: Fallback-Modus aktivieren
  enableFallbackMode(storeName) {
    console.log(`🛡️ Enabling fallback mode for: ${storeName}`)

    try {
      const store = this.getStoreInstance(storeName)
      if (store && store.enableFallbackMode) {
        store.enableFallbackMode()
        return true
      }
    } catch (error) {
      console.error(`❌ Failed to enable fallback mode for ${storeName}:`, error)
    }

    return false
  }

  // ✅ NEU: Store-Operation retry
  async retryStoreOperation(storeName) {
    console.log(`🔄 Retrying store operation for: ${storeName}`)

    try {
      const store = this.getStoreInstance(storeName)
      if (store && store.retryLastOperation) {
        await store.retryLastOperation()
        return true
      }
    } catch (error) {
      console.error(`❌ Failed to retry operation for ${storeName}:`, error)
    }

    return false
  }

  // ✅ NEU: Manuelle Intervention anfordern
  requestManualIntervention(storeName) {
    console.log(`🚨 Manual intervention required for: ${storeName}`)

    // Event für UI-Benachrichtigung senden
    try {
      const eventBus = this.getEventBusInstance()
      if (eventBus) {
        eventBus.emit('manual_intervention_required', {
          storeName,
          timestamp: Date.now(),
          severity: 'critical',
        })
      }
    } catch (error) {
      console.error(`❌ Failed to request manual intervention for ${storeName}:`, error)
    }

    return true
  }

  // 🔒 NEU: Error-Severity-Bestimmung
  determineErrorSeverity(error) {
    const criticalErrors = ['connection_failed', 'data_corruption', 'memory_leak', 'system_crash']
    const warningErrors = ['timeout', 'validation_failed', 'permission_denied']

    if (criticalErrors.some((critical) => error.message?.includes(critical))) {
      return 'critical'
    }

    if (warningErrors.some((warning) => error.message?.includes(warning))) {
      return 'warning'
    }

    return 'info'
  }

  // ✅ NEU: Store-Instance abrufen
  async getStoreInstance(storeName) {
    try {
      // Dynamische Store-Abfrage über Pinia
      /* @vite-ignore */
      const storeModule = await import('@/stores/' + storeName)
      return storeModule.useStore()
    } catch (error) {
      console.warn(`⚠️ Store ${storeName} not found:`, error)
      return null
    }
  }

  // ✅ NEU: EventBus-Instance abrufen
  async getEventBusInstance() {
    try {
      const { eventBus } = await import('@/utils/eventBus')
      return eventBus
    } catch (error) {
      console.warn(`⚠️ EventBus not found:`, error)
      return null
    }
  }

  // ✅ NEU: Hierarchische Error-Propagation
  propagateError(errorInfo, sourceStore, targetStores = []) {
    if (!this.errorPropagation.propagationEnabled) return false

    const chainId = this.generateErrorChainId()
    const errorChain = {
      errors: [errorInfo],
      depth: 1,
      resolved: false,
      sourceStore,
      targetStores,
      timestamp: Date.now(),
    }

    this.errorPropagation.errorChains.set(chainId, errorChain)

    // Propagation-Regeln anwenden
    const propagationPath = this.getPropagationPath(errorInfo.type, sourceStore)

    if (
      propagationPath.length > 0 &&
      errorChain.depth < this.errorPropagation.maxPropagationDepth
    ) {
      return this.executeErrorPropagation(chainId, propagationPath)
    }

    return false
  }

  // ✅ NEU: Propagation-Pfad ermitteln
  getPropagationPath(errorType) {
    const propagationRules = {
      store_dependency: ['centralDataHub', 'mqtt'],
      data_inconsistency: ['centralDataHub', 'centralConfig'],
      communication_failure: ['mqtt', 'actuatorLogic'],
      logic_error: ['actuatorLogic', 'centralDataHub'],
    }

    return propagationRules[errorType] || []
  }

  // ✅ NEU: Error-Propagation ausführen
  async executeErrorPropagation(chainId, propagationPath) {
    const errorChain = this.errorPropagation.errorChains.get(chainId)
    if (!errorChain) return false

    console.log(`📡 Propagating error chain ${chainId} to: ${propagationPath.join(', ')}`)

    for (const targetStore of propagationPath) {
      try {
        const store = this.getStoreInstance(targetStore)
        if (store && store.handlePropagatedError) {
          await store.handlePropagatedError(errorChain.errors[0])
          errorChain.depth++
        }
      } catch (error) {
        console.error(`❌ Failed to propagate error to ${targetStore}:`, error)
      }
    }

    return true
  }

  // ✅ NEU: Error-Chain-ID generieren
  generateErrorChainId() {
    return `error_chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // ✅ NEU: Error-Isolation-Status abrufen
  getErrorIsolationStatus() {
    return {
      isolatedStores: Array.from(this.errorIsolation.storeErrors.entries())
        .filter(([, error]) => error.count >= 3)
        .map(([storeName]) => storeName),
      activeErrorChains: Array.from(this.errorPropagation.errorChains.entries())
        .filter(([, chain]) => !chain.resolved)
        .map(([chainId, chain]) => ({
          chainId,
          depth: chain.depth,
          sourceStore: chain.sourceStore,
          timestamp: chain.timestamp,
        })),
      isolationEnabled: this.errorIsolation.isolationEnabled,
      propagationEnabled: this.errorPropagation.propagationEnabled,
    }
  }

  // ✅ NEU: Error-Isolation zurücksetzen
  resetErrorIsolation(storeName = null) {
    if (storeName) {
      this.errorIsolation.storeErrors.delete(storeName)
      console.log(`🔄 Reset error isolation for: ${storeName}`)
    } else {
      this.errorIsolation.storeErrors.clear()
      this.errorPropagation.errorChains.clear()
      console.log(`🔄 Reset all error isolation`)
    }
  }

  // 🆕 NEU: Hierarchische Fehlerbehandlung
  async handleHierarchicalError(errorInfo) {
    console.log(`[HierarchicalErrorHandler] Handling ${errorInfo.type}:`, errorInfo)

    try {
      // Error-Isolation prüfen
      if (errorInfo.sourceStore) {
        const isolated = this.isolateStoreError(errorInfo.sourceStore, errorInfo)
        if (isolated) {
          console.log(`🔒 Store ${errorInfo.sourceStore} isolated due to error`)
        }
      }

      // Error-Propagation ausführen
      if (errorInfo.propagateTo) {
        this.propagateError(errorInfo, errorInfo.sourceStore, errorInfo.propagateTo)
      }

      switch (errorInfo.type) {
        case 'ESP_OWNERSHIP_CONFLICT':
          return await this.resolveEspOwnershipConflict(errorInfo)
        case 'KAISER_ID_CONFLICT':
          return await this.resolveKaiserIdConflict(errorInfo)
        case 'COMMAND_CHAIN_TIMEOUT':
          return await this.resolveCommandChainTimeout(errorInfo)
        case 'CROSS_KAISER_COMMUNICATION_FAILED':
          return await this.retryCrossKaiserCommunication(errorInfo)
        case 'GOD_AUTHORIZATION_FAILED':
          return await this.handleGodAuthorizationFailure(errorInfo)
        case 'STORE_DEPENDENCY_ERROR':
          return await this.handleStoreDependencyError(errorInfo)
        case 'DATA_INCONSISTENCY_ERROR':
          return await this.handleDataInconsistencyError(errorInfo)
        default:
          return await this.handleGenericHierarchicalError(errorInfo)
      }
    } catch (error) {
      console.error('[HierarchicalErrorHandler] Error in hierarchical error handling:', error)
      return {
        success: false,
        error: error.message,
        fallback: true,
      }
    }
  }

  // 🆕 NEU: ESP-Ownership-Konflikt-Lösung
  async resolveEspOwnershipConflict(errorInfo) {
    const { esp_id, current_owner, requested_owner } = errorInfo.context

    console.log(`[HierarchicalErrorHandler] Resolving ESP ownership conflict: ${esp_id}`)

    try {
      // God hat immer Vorrang
      if (requested_owner === 'god') {
        await this.forceEspTransfer(esp_id, current_owner, 'god')
        return { resolved: true, new_owner: 'god', reason: 'god_priority' }
      }

      // Kaiser-zu-Kaiser Transfer nur mit God-Autorisation
      if (current_owner !== 'god') {
        const authorization = await this.checkGodAuthorization(esp_id, requested_owner)
        if (authorization.authorized) {
          await this.forceEspTransfer(esp_id, current_owner, requested_owner)
          return { resolved: true, new_owner: requested_owner, reason: 'authorized_transfer' }
        } else {
          return { resolved: false, reason: 'unauthorized_transfer', details: authorization.reason }
        }
      }

      // Fallback: ESP bei God belassen
      return { resolved: true, new_owner: 'god', reason: 'fallback_to_god' }
    } catch (error) {
      console.error('[HierarchicalErrorHandler] ESP ownership conflict resolution failed:', error)
      return { resolved: false, error: error.message }
    }
  }

  // 🆕 NEU: Kaiser-ID-Konflikt-Lösung
  async resolveKaiserIdConflict(errorInfo) {
    const { esp_id, device_kaiser_id, current_kaiser_id } = errorInfo.context

    console.log(`[HierarchicalErrorHandler] Resolving Kaiser ID conflict: ${esp_id}`)

    try {
      // Strategie: Device-Kaiser-ID übernehmen (wenn autorisiert)
      const canAdopt = await this.checkKaiserAdoptionPermission(device_kaiser_id)

      if (canAdopt) {
        await this.adoptKaiserId(esp_id, device_kaiser_id)
        return { resolved: true, adopted_id: device_kaiser_id, reason: 'adopted_device_id' }
      } else {
        // Fallback: Device zurücksetzen
        await this.resetDeviceKaiserId(esp_id, current_kaiser_id)
        return { resolved: true, reset_to: current_kaiser_id, reason: 'reset_device_id' }
      }
    } catch (error) {
      console.error('[HierarchicalErrorHandler] Kaiser ID conflict resolution failed:', error)
      return { resolved: false, error: error.message }
    }
  }

  // 🆕 NEU: Command-Chain-Timeout-Lösung
  async resolveCommandChainTimeout(errorInfo) {
    const { command_id, path, timeout_duration } = errorInfo.context

    console.log(
      `[HierarchicalErrorHandler] Resolving command chain timeout: ${command_id} (timeout: ${timeout_duration}ms, path: ${path})`,
    )

    try {
      // Befehlskette abbrechen
      await this.cancelCommandChain(command_id)

      // Timeout-Benachrichtigung senden
      await this.notifyCommandTimeout(command_id, path)

      // Cleanup durchführen
      await this.cleanupCommandChain(command_id)

      return { resolved: true, action: 'timeout_cancelled', command_id, timeout_duration }
    } catch (error) {
      console.error('[HierarchicalErrorHandler] Command chain timeout resolution failed:', error)
      return { resolved: false, error: error.message }
    }
  }

  // 🆕 NEU: Cross-Kaiser-Kommunikation wiederholen
  async retryCrossKaiserCommunication(errorInfo) {
    const { source_kaiser, target_kaiser, command_type } = errorInfo.context

    console.log(
      `[HierarchicalErrorHandler] Retrying cross-kaiser communication: ${source_kaiser} → ${target_kaiser}`,
    )

    try {
      // Netzwerk-Status prüfen
      const networkStatus = await this.checkCrossKaiserNetworkStatus(source_kaiser, target_kaiser)

      if (networkStatus.available) {
        // Kommunikation wiederholen
        const retryResult = await this.retryCrossKaiserCommand(
          source_kaiser,
          target_kaiser,
          command_type,
        )
        return { resolved: true, retry_successful: retryResult.success, command_type }
      } else {
        // Alternative Route verwenden
        const alternativeResult = await this.useAlternativeCrossKaiserRoute(
          source_kaiser,
          target_kaiser,
          command_type,
        )
        return { resolved: true, alternative_route: true, result: alternativeResult }
      }
    } catch (error) {
      console.error('[HierarchicalErrorHandler] Cross-kaiser communication retry failed:', error)
      return { resolved: false, error: error.message }
    }
  }

  // 🆕 NEU: God-Autorisation-Fehler behandeln
  async handleGodAuthorizationFailure(errorInfo) {
    const { esp_id, requested_action, kaiser_id } = errorInfo.context

    console.log(`[HierarchicalErrorHandler] Handling God authorization failure: ${esp_id}`)

    try {
      // God-Verbindung prüfen
      const godConnection = await this.checkGodConnection()

      if (godConnection.available) {
        // Autorisation erneut anfordern
        const reauthorization = await this.requestGodReauthorization(
          esp_id,
          requested_action,
          kaiser_id,
        )
        return { resolved: true, reauthorized: reauthorization.success, action: requested_action }
      } else {
        // Fallback: Lokale Entscheidung
        const localDecision = await this.makeLocalAuthorizationDecision(
          esp_id,
          requested_action,
          kaiser_id,
        )
        return {
          resolved: true,
          local_decision: localDecision.allowed,
          reason: localDecision.reason,
        }
      }
    } catch (error) {
      console.error('[HierarchicalErrorHandler] God authorization failure handling failed:', error)
      return { resolved: false, error: error.message }
    }
  }

  // 🆕 NEU: Generische hierarchische Fehlerbehandlung
  async handleGenericHierarchicalError(errorInfo) {
    console.log(`[HierarchicalErrorHandler] Handling generic hierarchical error: ${errorInfo.type}`)

    // Standard-Retry-Logik
    const retryDelay = this.retryDelays[errorInfo.category] || 1000

    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          // Einfache Wiederholung
          const retryResult = await this.retryHierarchicalOperation(errorInfo)
          resolve({ resolved: true, retry_successful: retryResult.success })
        } catch (error) {
          resolve({ resolved: false, error: error.message })
        }
      }, retryDelay)
    })
  }

  // 🆕 NEU: Hilfsmethoden für hierarchische Fehlerbehandlung
  async forceEspTransfer(espId, fromOwner, toOwner) {
    // CentralDataHub verwenden für ESP-Transfer
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = `kaiser/${toOwner}/esp_transfer`
    const payload = {
      esp_id: espId,
      from_owner: fromOwner,
      to_owner: toOwner,
      forced: true,
      timestamp: Date.now(),
    }

    await mqttStore.publish(topic, payload)
  }

  async checkGodAuthorization(espId, requestedOwner) {
    // God-Autorisation über CentralDataHub anfordern
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = 'god/authorization/check'
    const payload = {
      esp_id: espId,
      requested_owner: requestedOwner,
      timestamp: Date.now(),
    }

    try {
      const response = await mqttStore.request(topic, payload)
      return { authorized: response.authorized, reason: response.reason }
    } catch {
      return { authorized: false, reason: 'authorization_request_failed' }
    }
  }

  async cancelCommandChain(commandId) {
    // CentralDataHub verwenden für Command-Chain-Management
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()

    await centralDataHub.cancelCommandChain(commandId)
  }

  async notifyCommandTimeout(commandId, path) {
    // Timeout-Benachrichtigung über CentralDataHub senden
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = 'god/command_chain/timeout'
    const payload = {
      command_id: commandId,
      path: path,
      timestamp: Date.now(),
    }

    await mqttStore.publish(topic, payload)
  }

  async checkCrossKaiserNetworkStatus(sourceKaiser, targetKaiser) {
    // Netzwerk-Status zwischen Kaisern prüfen
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()

    try {
      const sourceStatus = await centralDataHub.getKaiserData(sourceKaiser)
      const targetStatus = await centralDataHub.getKaiserData(targetKaiser)

      return {
        available: sourceStatus.status === 'online' && targetStatus.status === 'online',
        source_status: sourceStatus.status,
        target_status: targetStatus.status,
      }
    } catch (error) {
      return { available: false, error: error.message }
    }
  }

  async retryCrossKaiserCommand(sourceKaiser, targetKaiser, commandType) {
    // Cross-Kaiser-Befehl wiederholen
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = `kaiser/${targetKaiser}/cross_kaiser/${sourceKaiser}/command`
    const payload = {
      command: commandType,
      retry: true,
      timestamp: Date.now(),
    }

    try {
      await mqttStore.publish(topic, payload)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async useAlternativeCrossKaiserRoute(sourceKaiser, targetKaiser, commandType) {
    // Alternative Route über God verwenden
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = 'god/cross_kaiser/alternative_route'
    const payload = {
      source_kaiser: sourceKaiser,
      target_kaiser: targetKaiser,
      command_type: commandType,
      timestamp: Date.now(),
    }

    try {
      const response = await mqttStore.request(topic, payload)
      return { success: true, result: response }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async checkGodConnection() {
    // God-Verbindung prüfen
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    try {
      const response = await mqttStore.request('god/status', { timestamp: Date.now() })
      return { available: response.status === 'online' }
    } catch (error) {
      return { available: false, error: error.message }
    }
  }

  async requestGodReauthorization(espId, requestedAction, kaiserId) {
    // God-Autorisation erneut anfordern
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = 'god/authorization/request'
    const payload = {
      esp_id: espId,
      requested_action: requestedAction,
      kaiser_id: kaiserId,
      retry: true,
      timestamp: Date.now(),
    }

    try {
      const response = await mqttStore.request(topic, payload)
      return { success: response.authorized }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async makeLocalAuthorizationDecision(espId, requestedAction) {
    // Lokale Entscheidung basierend auf Sicherheitsregeln
    const safetyRules = {
      esp_transfer: { allowed: true, reason: 'local_safety_rule' },
      emergency_stop: { allowed: true, reason: 'emergency_override' },
      system_config: { allowed: false, reason: 'requires_god_authorization' },
    }

    return safetyRules[requestedAction] || { allowed: false, reason: 'unknown_action' }
  }

  async retryHierarchicalOperation(errorInfo) {
    // Generische Wiederholung für hierarchische Operationen
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    try {
      // Einfache Wiederholung der ursprünglichen Operation
      const topic = errorInfo.context.topic
      const payload = { ...errorInfo.context.payload, retry: true }

      await mqttStore.publish(topic, payload)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async checkKaiserAdoptionPermission(deviceKaiserId) {
    // Prüfen ob Device-Kaiser-ID übernommen werden darf
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()

    try {
      const kaiserData = await centralDataHub.getKaiserData(deviceKaiserId)
      return kaiserData.status === 'online' && kaiserData.esp_count < 10 // Max 10 ESPs pro Kaiser
    } catch {
      return false
    }
  }

  async adoptKaiserId(espId, deviceKaiserId) {
    // Device-Kaiser-ID übernehmen
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = `kaiser/${deviceKaiserId}/esp/${espId}/config`
    const payload = {
      kaiser_id: deviceKaiserId,
      adopted: true,
      timestamp: Date.now(),
    }

    await mqttStore.publish(topic, payload)
  }

  async resetDeviceKaiserId(espId, currentKaiserId) {
    // Device-Kaiser-ID zurücksetzen
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()
    const mqttStore = centralDataHub.storeReferences.mqtt

    const topic = `kaiser/${currentKaiserId}/esp/${espId}/config`
    const payload = {
      kaiser_id: currentKaiserId,
      reset: true,
      timestamp: Date.now(),
    }

    await mqttStore.publish(topic, payload)
  }

  async cleanupCommandChain(commandId) {
    // Command-Chain-Cleanup
    const { useCentralDataHub } = await import('@/stores/centralDataHub')
    const centralDataHub = useCentralDataHub()

    await centralDataHub.deleteCommandChain(commandId)
  }

  // 🆕 NEU: Store-Dependency-Fehler behandeln
  async handleStoreDependencyError(errorInfo) {
    const { sourceStore, dependentStore } = errorInfo.context

    console.log(
      `[HierarchicalErrorHandler] Resolving store dependency error: ${sourceStore} -> ${dependentStore}`,
    )

    try {
      // Abhängige Store in Fallback-Modus versetzen
      const isolated = this.isolateStoreError(dependentStore, {
        message: `Dependency error from ${sourceStore}`,
        type: 'store_dependency',
      })

      if (isolated) {
        return { resolved: true, action: 'store_isolated', store: dependentStore }
      }

      return { resolved: false, reason: 'isolation_failed' }
    } catch (err) {
      console.error('[HierarchicalErrorHandler] Store dependency error resolution failed:', err)
      return { resolved: false, error: err.message }
    }
  }

  // 🆕 NEU: Daten-Inkonsistenz-Fehler behandeln
  async handleDataInconsistencyError(errorInfo) {
    const { dataKey, expectedValue, actualValue, affectedStores } = errorInfo.context

    console.log(`[HierarchicalErrorHandler] Resolving data inconsistency: ${dataKey}`)

    try {
      // Betroffene Stores benachrichtigen
      for (const storeName of affectedStores) {
        const store = this.getStoreInstance(storeName)
        if (store && store.handleDataInconsistency) {
          await store.handleDataInconsistency(dataKey, expectedValue, actualValue)
        }
      }

      return { resolved: true, action: 'data_synchronized', dataKey }
    } catch (error) {
      console.error('[HierarchicalErrorHandler] Data inconsistency resolution failed:', error)
      return { resolved: false, error: error.message }
    }
  }
}

// ✅ NEU: Singleton-Instanz
export const errorHandler = new ErrorHandler()

// ✅ NEU: Convenience-Funktionen
export const handleError = (error, context) => errorHandler.handleError(error, context)
export const getErrorLog = (limit) => errorHandler.getErrorLog(limit)
export const getErrorStats = () => errorHandler.getErrorStats()
export const clearErrorLog = () => errorHandler.clearErrorLog()

// ✅ NEU: Backward Compatibility Exports
export const error = (message, error, context) => errorHandler.error(message, error, context)
export const warn = (message, error, context) => errorHandler.warn(message, error, context)
export const log = (message, data) => errorHandler.log(message, data)
export const info = (message, data) => errorHandler.info(message, data)

// 🆕 NEU: Hierarchische Fehlerbehandlung-Funktionen
export const handleHierarchicalError = (error, context) =>
  errorHandler.hierarchicalErrorHandler.handleHierarchicalError(error, context)

// ✅ NEU: Error-Handler initialisieren
export const initializeErrorHandler = () => {
  errorHandler.restoreErrorLog()

  // Global error handler
  window.addEventListener('error', (event) => {
    errorHandler.handleError(event.error, { source: 'global' })
  })

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    errorHandler.handleError(new Error(event.reason), { source: 'promise' })
  })

  console.log('✅ Error Handler mit hierarchischer Fehlerbehandlung initialisiert')
}
