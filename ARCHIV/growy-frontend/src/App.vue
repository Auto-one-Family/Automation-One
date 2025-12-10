<script setup>
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'
import SystemStatusBar from '@/components/common/SystemStatusBar.vue'
import TopNavigation from '@/components/layouts/TopNavigation.vue'
import MobileNavigation from '@/components/common/MobileNavigation.vue'
import LoadingStates from '@/components/common/LoadingStates.vue'

const snackbar = ref(null)
const loadingStates = ref(null)

// ✅ KORRIGIERT: Robustere Snackbar-Initialisierung
onMounted(() => {
  // ✅ NEU: Sofortige Initialisierung mit Retry-Logic
  const initializeSnackbar = () => {
    try {
      if (snackbar.value) {
        window.$snackbar = snackbar.value
        console.log('✅ GlobalSnackbar initialized successfully')
        return true
      } else {
        console.warn('⚠️ Snackbar ref not available')
        return false
      }
    } catch (error) {
      console.error('❌ Error initializing GlobalSnackbar:', error)
      return false
    }
  }

  // ✅ NEU: Retry-Logic für Snackbar-Initialisierung
  let retryCount = 0
  const maxRetries = 5

  const attemptInitialization = () => {
    if (initializeSnackbar() || retryCount >= maxRetries) {
      return
    }

    retryCount++
    setTimeout(attemptInitialization, 100 * retryCount)
  }

  // Starte Initialisierung
  attemptInitialization()

  // ✅ NEU: LoadingStates Initialisierung
  try {
    if (loadingStates.value) {
      window.$loadingStates = loadingStates.value
      console.log('✅ LoadingStates initialized successfully')
    }
  } catch (error) {
    console.error('❌ Error initializing LoadingStates:', error)
  }
})
</script>

<template>
  <v-app>
    <SystemStatusBar />
    <TopNavigation />
    <MobileNavigation />

    <v-main>
      <div class="bg-grey-lighten-1 min-h-screen">
        <RouterView />
      </div>
    </v-main>

    <GlobalSnackbar ref="snackbar" />
    <LoadingStates ref="loadingStates" />
  </v-app>
</template>

<style>
@import '@/assets/main.css';

/* ✅ NEU: Erweiterte globale Styles */
:root {
  /* Design System Variablen */
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  --transition-fast: 150ms;
  --transition-normal: 200ms;
  --transition-slow: 300ms;
}

/* Global responsive improvements */
.v-container {
  max-width: none;
  padding: 0;
  margin: 0;
}

/* ✅ NEU: Konsistente Card-Styles mit Design System */
.v-card {
  border-radius: var(--border-radius-lg) !important;
  transition: box-shadow var(--transition-normal) ease;
}

.v-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
}

.v-card-title {
  font-weight: 600 !important;
  letter-spacing: 0.025em !important;
}

/* ✅ NEU: Konsistente Input-Styles */
.v-text-field,
.v-select,
.v-textarea {
  --v-field-border-radius: var(--border-radius-md);
  margin-bottom: var(--spacing-md) !important;
}

/* ✅ NEU: Verbesserte Abstände für Textfeld-Komponenten */
.v-text-field .v-field__details,
.v-select .v-field__details,
.v-textarea .v-field__details {
  margin-top: var(--spacing-xs) !important;
  min-height: 20px !important;
}

/* ✅ NEU: Abstand zwischen aufeinanderfolgenden Textfeldern */
.v-text-field + .v-text-field,
.v-select + .v-text-field,
.v-textarea + .v-text-field,
.v-text-field + .v-select,
.v-select + .v-select,
.v-textarea + .v-select {
  margin-top: var(--spacing-sm) !important;
}

/* ✅ NEU: Abstand zwischen Textfeldern und Buttons */
.v-text-field + .v-btn,
.v-select + .v-btn,
.v-textarea + .v-btn,
.v-text-field + .d-flex,
.v-select + .d-flex,
.v-textarea + .d-flex {
  margin-top: var(--spacing-md) !important;
}

/* ✅ NEU: Abstand für Form-Gruppen */
.v-form .v-row {
  margin-bottom: var(--spacing-md) !important;
}

.v-form .v-col {
  margin-bottom: var(--spacing-sm) !important;
}

/* ✅ NEU: Spezielle Abstände für Card-Inhalte */
.v-card-text .v-text-field:last-child,
.v-card-text .v-select:last-child,
.v-card-text .v-textarea:last-child {
  margin-bottom: 0 !important;
}

/* ✅ NEU: Abstand für Action-Buttons */
.d-flex.justify-end,
.d-flex.justify-space-between {
  margin-top: var(--spacing-md) !important;
  padding-top: var(--spacing-md) !important;
  border-top: 1px solid rgba(0, 0, 0, 0.12) !important;
  padding-bottom: var(--spacing-sm) !important;
  margin-bottom: var(--spacing-md) !important;
}

/* ✅ NEU: Spezielle Abstände für v-card-actions */
.v-card-actions {
  margin-top: var(--spacing-md) !important;
  padding-top: var(--spacing-md) !important;
  border-top: 1px solid rgba(0, 0, 0, 0.12) !important;
  padding-bottom: var(--spacing-sm) !important;
  margin-bottom: var(--spacing-md) !important;
}

/* ✅ NEU: Abstand zwischen Textfeldern und Action-Buttons */
.v-text-field + .v-card-actions,
.v-select + .v-card-actions,
.v-textarea + .v-card-actions,
.v-text-field + .d-flex.justify-end,
.v-select + .d-flex.justify-end,
.v-textarea + .d-flex.justify-end,
.v-text-field + .d-flex.justify-space-between,
.v-select + .d-flex.justify-space-between,
.v-textarea + .d-flex.justify-space-between {
  margin-top: var(--spacing-lg) !important;
}

/* ✅ NEU: Abstand zwischen Action-Buttons und nachfolgenden Elementen */
.v-card-actions + .v-text-field,
.d-flex.justify-end + .v-text-field,
.d-flex.justify-space-between + .v-text-field,
.v-card-actions + .v-select,
.d-flex.justify-end + .v-select,
.d-flex.justify-space-between + .v-select,
.v-card-actions + .v-textarea,
.d-flex.justify-end + .v-textarea,
.d-flex.justify-space-between + .v-textarea {
  margin-top: var(--spacing-lg) !important;
}

/* ✅ NEU: Abstand für Form-Actions */
.v-form .d-flex.justify-end,
.v-form .d-flex.justify-space-between {
  margin-top: var(--spacing-lg) !important;
  padding-top: var(--spacing-md) !important;
  border-top: 1px solid rgba(0, 0, 0, 0.12) !important;
  padding-bottom: var(--spacing-sm) !important;
  margin-bottom: var(--spacing-md) !important;
}

/* ✅ NEU: Abstand für Expansion Panel Actions */
.v-expansion-panel-text .d-flex.justify-end,
.v-expansion-panel-text .d-flex.justify-space-between {
  margin-top: var(--spacing-md) !important;
  padding-top: var(--spacing-sm) !important;
  border-top: 1px solid rgba(0, 0, 0, 0.08) !important;
  padding-bottom: var(--spacing-xs) !important;
  margin-bottom: var(--spacing-sm) !important;
}

/* ✅ NEU: Verbesserte Hint-Abstände */
.v-text-field .v-messages,
.v-select .v-messages,
.v-textarea .v-messages {
  margin-top: var(--spacing-xs) !important;
  min-height: 16px !important;
}

/* ✅ NEU: Konsistente Button-Styles */
.v-btn {
  border-radius: var(--border-radius-md) !important;
  font-weight: 500 !important;
  letter-spacing: 0.025em !important;
  transition: all var(--transition-normal) ease;
}

.v-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

/* ✅ NEU: Konsistente Chip-Styles */
.v-chip {
  border-radius: var(--border-radius-xl) !important;
}

/* ✅ NEU: Konsistente Alert-Styles */
.v-alert {
  border-radius: var(--border-radius-md) !important;
  margin-bottom: var(--spacing-md) !important;
}

/* ✅ NEU: Abstand für Expansion Panels */
.v-expansion-panel-text {
  padding-top: var(--spacing-md) !important;
  padding-bottom: var(--spacing-md) !important;
}

/* ✅ NEU: Mobile-spezifische Anpassungen */
@media (max-width: 600px) {
  .v-container {
    padding: var(--spacing-md) !important;
  }

  .v-card {
    margin-bottom: var(--spacing-md) !important;
  }

  /* Mobile Navigation Spacing */
  .v-main {
    padding-bottom: 80px; /* Platz für Bottom Navigation */
  }

  /* Mobile-spezifische Anpassungen für Textfelder */
  .v-text-field,
  .v-select,
  .v-textarea {
    margin-bottom: var(--spacing-sm) !important;
  }

  .v-text-field + .v-text-field,
  .v-select + .v-text-field,
  .v-textarea + .v-text-field,
  .v-text-field + .v-select,
  .v-select + .v-select,
  .v-textarea + .v-select {
    margin-top: var(--spacing-xs) !important;
  }

  .v-text-field + .v-btn,
  .v-select + .v-btn,
  .v-textarea + .v-btn,
  .v-text-field + .d-flex,
  .v-select + .d-flex,
  .v-textarea + .d-flex {
    margin-top: var(--spacing-sm) !important;
  }

  /* Mobile-spezifische Anpassungen für Action-Buttons */
  .d-flex.justify-end,
  .d-flex.justify-space-between,
  .v-card-actions {
    margin-top: var(--spacing-sm) !important;
    padding-top: var(--spacing-sm) !important;
    padding-bottom: var(--spacing-xs) !important;
    margin-bottom: var(--spacing-sm) !important;
  }

  .v-text-field + .v-card-actions,
  .v-select + .v-card-actions,
  .v-textarea + .v-card-actions,
  .v-text-field + .d-flex.justify-end,
  .v-select + .d-flex.justify-end,
  .v-textarea + .d-flex.justify-end,
  .v-text-field + .d-flex.justify-space-between,
  .v-select + .d-flex.justify-space-between,
  .v-textarea + .d-flex.justify-space-between {
    margin-top: var(--spacing-md) !important;
  }

  .v-card-actions + .v-text-field,
  .d-flex.justify-end + .v-text-field,
  .d-flex.justify-space-between + .v-text-field,
  .v-card-actions + .v-select,
  .d-flex.justify-end + .v-select,
  .d-flex.justify-space-between + .v-select,
  .v-card-actions + .v-textarea,
  .d-flex.justify-end + .v-textarea,
  .d-flex.justify-space-between + .v-textarea {
    margin-top: var(--spacing-md) !important;
  }

  .v-form .d-flex.justify-end,
  .v-form .d-flex.justify-space-between {
    margin-top: var(--spacing-md) !important;
    padding-top: var(--spacing-sm) !important;
    padding-bottom: var(--spacing-xs) !important;
    margin-bottom: var(--spacing-sm) !important;
  }

  .v-expansion-panel-text .d-flex.justify-end,
  .v-expansion-panel-text .d-flex.justify-space-between {
    margin-top: var(--spacing-sm) !important;
    padding-top: var(--spacing-xs) !important;
    padding-bottom: 0 !important;
    margin-bottom: var(--spacing-xs) !important;
  }
}

/* ✅ NEU: Dark Mode Anpassungen */
[data-theme='dark'] {
  --color-background: #181818;
  --color-background-soft: #222222;
  --color-background-mute: #282828;
  --color-border: rgba(84, 84, 84, 0.48);
  --color-border-hover: rgba(84, 84, 84, 0.65);
  --color-heading: #ffffff;
  --color-text: rgba(235, 235, 235, 0.64);
}

/* ✅ NEU: Accessibility Verbesserungen */
.v-btn:focus-visible,
.v-text-field:focus-visible,
.v-select:focus-visible {
  outline: 2px solid var(--v-theme-primary);
  outline-offset: 2px;
}

/* ✅ NEU: Performance-Optimierungen */
.v-card,
.v-btn,
.v-text-field {
  will-change: transform, box-shadow;
}

/* ✅ NEU: Print Styles */
@media print {
  .v-main {
    padding: 0 !important;
  }

  .v-card {
    box-shadow: none !important;
    border: 1px solid #ccc !important;
  }

  .v-btn {
    display: none !important;
  }
}
</style>
