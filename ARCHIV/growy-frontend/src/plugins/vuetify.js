// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'

// ✅ NEU: Erweiterte Vuetify-Konfiguration mit Dark Mode Support und Slot-Optimierung
const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#2196f3',
          secondary: '#64748b',
          success: '#4caf50',
          warning: '#ffc107',
          error: '#f44336',
          info: '#03a9f4',
        },
      },
      dark: {
        colors: {
          primary: '#60a5fa',
          secondary: '#94a3b8',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#06b6d4',
        },
      },
    },
  },
  // ✅ NEU: Slot-Optimierung für VDefaultsProvider
  defaults: {
    VBtn: {
      variant: 'text',
    },
    VIcon: {
      size: 'small',
    },
    VTooltip: {
      location: 'top',
    },
  },
})

export default vuetify
