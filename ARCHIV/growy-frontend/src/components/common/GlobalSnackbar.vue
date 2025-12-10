<template>
  <div class="global-snackbar">
    <!-- Standard Snackbar -->
    <v-snackbar
      ref="snackbar"
      v-model="showSnackbar"
      :color="snackbarColor"
      :timeout="snackbarTimeout"
      :location="snackbarLocation"
      :variant="snackbarVariant"
    >
      <div class="d-flex align-center">
        <v-icon :icon="snackbarIcon" class="mr-2" />
        <span>{{ snackbarMessage }}</span>
      </div>

      <template #actions>
        <v-btn v-if="snackbarAction" variant="text" @click="executeSnackbarAction">
          {{ snackbarActionText }}
        </v-btn>
        <v-btn variant="text" @click="showSnackbar = false"> Schließen </v-btn>
      </template>
    </v-snackbar>

    <!-- System ACK Notifications -->
    <v-snackbar
      v-model="showAckNotification"
      color="info"
      timeout="5000"
      location="top"
      variant="tonal"
    >
      <div class="d-flex align-center">
        <v-icon icon="mdi-check-circle" class="mr-2" />
        <div>
          <div class="font-weight-medium">{{ ackNotification.title }}</div>
          <div class="text-caption">{{ ackNotification.message }}</div>
        </div>
      </div>

      <template #actions>
        <v-btn variant="text" size="small" @click="showAckDetails = true"> Details </v-btn>
        <v-btn variant="text" size="small" @click="showAckNotification = false"> Schließen </v-btn>
      </template>
    </v-snackbar>

    <!-- ACK Details Dialog -->
    <v-dialog v-model="showAckDetails" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-check-circle" class="mr-2" color="success" />
          System ACK Details
        </v-card-title>
        <v-card-text>
          <div v-if="ackNotification.details">
            <v-row>
              <v-col cols="12" md="6">
                <v-card variant="tonal" class="pa-3">
                  <div class="text-subtitle-2 text-primary mb-2">ACK Information</div>
                  <div class="text-caption">
                    <strong>ESP-ID:</strong> {{ ackNotification.details.espId }}<br />
                    <strong>Command:</strong> {{ ackNotification.details.command }}<br />
                    <strong>Status:</strong>
                    <v-chip
                      :color="ackNotification.details.success ? 'success' : 'error'"
                      size="small"
                      variant="tonal"
                      class="ml-1"
                    >
                      {{ ackNotification.details.success ? 'Erfolgreich' : 'Fehler' }}
                    </v-chip>
                  </div>
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card variant="tonal" class="pa-3">
                  <div class="text-subtitle-2 text-secondary mb-2">Zeitstempel</div>
                  <div class="text-caption">
                    <strong>Empfangen:</strong>
                    {{ formatISOTimestamp(ackNotification.details.timestamp) }}<br />
                    <strong>Relativ:</strong>
                    {{ formatRelativeTime(ackNotification.details.timestamp) }}<br />
                    <strong>Dauer:</strong> {{ ackNotification.details.duration || 'N/A' }}
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Additional Data -->
            <v-expansion-panels class="mt-4" v-if="ackNotification.details.data">
              <v-expansion-panel>
                <v-expansion-panel-title>
                  <v-icon icon="mdi-code-json" class="mr-2" />
                  Zusätzliche Daten
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-textarea
                    :model-value="JSON.stringify(ackNotification.details.data, null, 2)"
                    readonly
                    variant="outlined"
                    rows="8"
                    class="font-family-monospace"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAckDetails = false">Schließen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { formatISOTimestamp } from '@/utils/time'
import { errorHandler } from '@/utils/errorHandler'

// Snackbar state
const snackbar = ref(null)
const showSnackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')
const snackbarTimeout = ref(5000)
const snackbarLocation = ref('bottom')
const snackbarVariant = ref('elevated')
const snackbarIcon = ref('mdi-check')
const snackbarAction = ref(null)
const snackbarActionText = ref('')

// ACK Notification state
const showAckNotification = ref(false)
const showAckDetails = ref(false)
const ackNotification = ref({
  title: '',
  message: '',
  details: null,
})

// Methods
function showSuccess(message, timeout = 5000) {
  try {
    snackbarMessage.value = message
    snackbarColor.value = 'success'
    snackbarIcon.value = 'mdi-check-circle'
    snackbarTimeout.value = timeout
    showSnackbar.value = true
  } catch (error) {
    errorHandler.error('Failed to show success snackbar', error, { message, timeout })
  }
}

function showError(message, timeout = 5000) {
  try {
    snackbarMessage.value = message
    snackbarColor.value = 'error'
    snackbarIcon.value = 'mdi-alert-circle'
    snackbarTimeout.value = timeout
    showSnackbar.value = true
  } catch (error) {
    errorHandler.error('Failed to show error snackbar', error, { message, timeout })
  }
}

function showInfo(message, timeout = 5000) {
  try {
    snackbarMessage.value = message
    snackbarColor.value = 'info'
    snackbarIcon.value = 'mdi-information'
    snackbarTimeout.value = timeout
    showSnackbar.value = true
  } catch (error) {
    errorHandler.error('Failed to show info snackbar', error, { message, timeout })
  }
}

function showWarning(message, timeout = 5000) {
  try {
    snackbarMessage.value = message
    snackbarColor.value = 'warning'
    snackbarIcon.value = 'mdi-alert'
    snackbarTimeout.value = timeout
    showSnackbar.value = true
  } catch (error) {
    errorHandler.error('Failed to show warning snackbar', error, { message, timeout })
  }
}

function showAck(espId, command, success, data = null) {
  const title = success ? 'ACK empfangen' : 'ACK Fehler'
  const message = `${command} für ESP ${espId} ${success ? 'erfolgreich' : 'fehlgeschlagen'}`

  ackNotification.value = {
    title,
    message,
    details: {
      espId,
      command,
      success,
      timestamp: Date.now(),
      data,
    },
  }

  showAckNotification.value = true
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Unknown'
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date

  if (diffMs < 60000) return 'Just now'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`
  return date.toLocaleDateString()
}

function executeSnackbarAction() {
  if (snackbarAction.value) {
    snackbarAction.value()
  }
}

// ✅ NEU: Erweiterte Snackbar-Methoden für Alert-System
function showAlert(options) {
  snackbarMessage.value = options.message || 'Alert'
  snackbarColor.value = options.color || 'warning'
  snackbarIcon.value = options.icon || 'mdi-alert'
  snackbarTimeout.value = options.timeout || 10000
  snackbarLocation.value = options.location || 'top'
  snackbarVariant.value = options.variant || 'tonal'

  // Alert-spezifische Aktionen
  if (options.actions && options.actions.length > 0) {
    snackbarAction.value = options.actions[0]
    snackbarActionText.value = snackbarAction.value.text
  } else {
    snackbarAction.value = null
    snackbarActionText.value = ''
  }

  showSnackbar.value = true
}

// ✅ KORRIGIERT: Robustere globale Exposition
onMounted(() => {
  try {
    // ✅ NEU: DOM-Element-Validierung
    const initializeSnackbar = () => {
      try {
        // ✅ NEU: DOM-Element-Validierung
        if (!snackbar.value || !snackbar.value.$el) {
          console.warn('⚠️ Snackbar DOM element not ready')
          return false
        }

        // ✅ NEU: Parent-Node-Validierung
        const parentNode = snackbar.value.$el.parentNode
        if (!parentNode) {
          console.warn('⚠️ Snackbar parent node not available')
          return false
        }

        window.$snackbar = {
          showSuccess,
          showError,
          showInfo,
          showWarning,
          showAck,
          showAlert,
        }
        console.log('✅ GlobalSnackbar initialized successfully')
        return true
      } catch (error) {
        console.error('❌ Error initializing GlobalSnackbar:', error)
        return false
      }
    }

    // ✅ NEU: Sofortige Exposition versuchen
    if (!initializeSnackbar()) {
      // Fallback: Verzögerte Exposition
      setTimeout(initializeSnackbar, 50)
    }
  } catch (error) {
    console.error('❌ Error in GlobalSnackbar onMounted:', error)
  }
})
</script>

<style scoped>
.global-snackbar {
  position: fixed;
  z-index: 9999;
}
</style>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
