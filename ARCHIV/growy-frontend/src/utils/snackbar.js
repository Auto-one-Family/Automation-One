// ✅ NEU: Sichere Snackbar-Utilities
export const safeSnackbar = {
  showSuccess(message, options = {}) {
    try {
      if (window.$snackbar?.showSuccess) {
        window.$snackbar.showSuccess(message, options)
      } else {
        console.log('✅ Success:', message)
      }
    } catch (error) {
      console.warn('Snackbar error:', error.message)
    }
  },

  showError(message, options = {}) {
    try {
      if (window.$snackbar?.showError) {
        window.$snackbar.showError(message, options)
      } else {
        console.error('❌ Error:', message)
      }
    } catch (error) {
      console.warn('Snackbar error:', error.message)
    }
  },

  showInfo(message, options = {}) {
    try {
      if (window.$snackbar?.showInfo) {
        window.$snackbar.showInfo(message, options)
      } else {
        console.log('ℹ️ Info:', message)
      }
    } catch (error) {
      console.warn('Snackbar error:', error.message)
    }
  },

  showWarning(message, options = {}) {
    try {
      if (window.$snackbar?.showWarning) {
        window.$snackbar.showWarning(message, options)
      } else {
        console.warn('⚠️ Warning:', message)
      }
    } catch (error) {
      console.warn('Snackbar error:', error.message)
    }
  },

  showAck(espId, command, success, data = null) {
    try {
      if (window.$snackbar?.showAck) {
        window.$snackbar.showAck(espId, command, success, data)
      } else {
        const status = success ? '✅' : '❌'
        console.log(
          `${status} ACK: ${command} für ESP ${espId} ${success ? 'erfolgreich' : 'fehlgeschlagen'}`,
        )
      }
    } catch (error) {
      console.warn('Snackbar ACK error:', error.message)
    }
  },
}

// ✅ NEU: Snackbar-Performance-Monitoring
export const snackbarMetrics = {
  calls: 0,
  errors: 0,
  successRate: 0,

  trackCall() {
    this.calls++
    this.updateSuccessRate()
  },

  trackError() {
    this.errors++
    this.updateSuccessRate()
  },

  updateSuccessRate() {
    this.successRate = this.calls > 0 ? ((this.calls - this.errors) / this.calls) * 100 : 0
  },

  getStats() {
    return {
      calls: this.calls,
      errors: this.errors,
      successRate: this.successRate,
    }
  },
}
