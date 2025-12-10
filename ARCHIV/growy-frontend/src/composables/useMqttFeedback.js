import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

/**
 * Composable für zentralisierte MQTT-Feedback-Verwaltung
 *
 * Bietet eine einheitliche Schnittstelle für:
 * - SafeMode-Informationen
 * - GPIO-Konflikte
 * - Validierungsfehler
 * - Erfolgsmeldungen
 *
 * @returns {Object} Feedback-Funktionen und -Daten
 */
export function useMqttFeedback() {
  const centralDataHub = useCentralDataHub()
  const mqttStore = computed(() => centralDataHub.storeReferences.mqtt)

  // ✅ Safe Mode Feedback
  const safeModeInfo = computed(() => {
    const devices = Array.from(mqttStore.value.espDevices.values())
    const safeModeDevices = devices.filter((d) => d.safeMode)

    return {
      hasSafeMode: safeModeDevices.length > 0,
      devices: safeModeDevices,
      reasons: safeModeDevices.map((d) => d.safeModeEnterReason).filter(Boolean),
      totalDevices: devices.length,
      safeModeCount: safeModeDevices.length,
    }
  })

  // ✅ GPIO Conflict Feedback
  const gpioConflicts = computed(() => {
    return Array.from(mqttStore.value.gpioConflicts?.values() || [])
  })

  // ✅ Validation Errors Feedback
  const validationErrors = computed(() => {
    return Array.from(mqttStore.value.validationErrors?.values() || [])
  })

  // ✅ Success Messages Queue
  const successMessages = ref([])

  const addSuccessMessage = (message, options = {}) => {
    const messageEntry = {
      id: Date.now() + Math.random(),
      message,
      timestamp: Date.now(),
      ...options,
    }

    successMessages.value.unshift(messageEntry)

    // Keep only last 10 messages
    if (successMessages.value.length > 10) {
      successMessages.value = successMessages.value.slice(0, 10)
    }

    // Auto-remove after timeout (default: 5 seconds)
    const timeout = options.timeout || 5000
    setTimeout(() => {
      removeSuccessMessage(messageEntry.id)
    }, timeout)
  }

  const removeSuccessMessage = (messageId) => {
    const index = successMessages.value.findIndex((msg) => msg.id === messageId)
    if (index > -1) {
      successMessages.value.splice(index, 1)
    }
  }

  const clearSuccessMessages = () => {
    successMessages.value = []
  }

  // ✅ Error Messages Queue
  const errorMessages = ref([])

  const addErrorMessage = (message, options = {}) => {
    const messageEntry = {
      id: Date.now() + Math.random(),
      message,
      timestamp: Date.now(),
      ...options,
    }

    errorMessages.value.unshift(messageEntry)

    // Keep only last 10 error messages
    if (errorMessages.value.length > 10) {
      errorMessages.value = errorMessages.value.slice(0, 10)
    }

    // Auto-remove after timeout (default: 8 seconds for errors)
    const timeout = options.timeout || 8000
    setTimeout(() => {
      removeErrorMessage(messageEntry.id)
    }, timeout)
  }

  const removeErrorMessage = (messageId) => {
    const index = errorMessages.value.findIndex((msg) => msg.id === messageId)
    if (index > -1) {
      errorMessages.value.splice(index, 1)
    }
  }

  const clearErrorMessages = () => {
    errorMessages.value = []
  }

  // ✅ Warning Messages Queue
  const warningMessages = ref([])

  const addWarningMessage = (message, options = {}) => {
    const messageEntry = {
      id: Date.now() + Math.random(),
      message,
      timestamp: Date.now(),
      ...options,
    }

    warningMessages.value.unshift(messageEntry)

    // Keep only last 10 warning messages
    if (warningMessages.value.length > 10) {
      warningMessages.value = warningMessages.value.slice(0, 10)
    }

    // Auto-remove after timeout (default: 6 seconds for warnings)
    const timeout = options.timeout || 6000
    setTimeout(() => {
      removeWarningMessage(messageEntry.id)
    }, timeout)
  }

  const removeWarningMessage = (messageId) => {
    const index = warningMessages.value.findIndex((msg) => msg.id === messageId)
    if (index > -1) {
      warningMessages.value.splice(index, 1)
    }
  }

  const clearWarningMessages = () => {
    warningMessages.value = []
  }

  // ✅ System Health Summary
  const systemHealthSummary = computed(() => {
    const devices = Array.from(mqttStore.value.espDevices.values())
    const onlineDevices = devices.filter((d) => d.status === 'online')
    const offlineDevices = devices.filter((d) => d.status === 'offline')

    return {
      totalDevices: devices.length,
      onlineDevices: onlineDevices.length,
      offlineDevices: offlineDevices.length,
      safeModeDevices: safeModeInfo.value.safeModeCount,
      hasConflicts: gpioConflicts.value.length > 0 || validationErrors.value.length > 0,
      conflictCount: gpioConflicts.value.length + validationErrors.value.length,
      lastUpdate: devices.length > 0 ? Math.max(...devices.map((d) => d.lastUpdate || 0)) : null,
    }
  })

  // ✅ Quick Actions
  const clearAllMessages = () => {
    clearSuccessMessages()
    clearErrorMessages()
    clearWarningMessages()
  }

  const getActiveMessages = () => {
    return {
      success: successMessages.value,
      errors: errorMessages.value,
      warnings: warningMessages.value,
    }
  }

  const hasActiveMessages = computed(() => {
    return (
      successMessages.value.length > 0 ||
      errorMessages.value.length > 0 ||
      warningMessages.value.length > 0
    )
  })

  // ✅ Legacy Compatibility Helpers
  const showLegacyNotification = (type, message, options = {}) => {
    switch (type) {
      case 'success':
        addSuccessMessage(message, options)
        break
      case 'error':
        addErrorMessage(message, options)
        break
      case 'warning':
        addWarningMessage(message, options)
        break
      default:
        addSuccessMessage(message, options)
    }
  }

  return {
    // Data
    safeModeInfo,
    gpioConflicts,
    validationErrors,
    successMessages,
    errorMessages,
    warningMessages,
    systemHealthSummary,
    hasActiveMessages,

    // Actions
    addSuccessMessage,
    addErrorMessage,
    addWarningMessage,
    removeSuccessMessage,
    removeErrorMessage,
    removeWarningMessage,
    clearSuccessMessages,
    clearErrorMessages,
    clearWarningMessages,
    clearAllMessages,
    getActiveMessages,
    showLegacyNotification,
  }
}
