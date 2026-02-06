import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Global Vue Error Handler - structured JSON output for Docker json-file driver
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    component: instance?.$options?.name || 'Unknown',
    info,
    timestamp: new Date().toISOString()
  })
}

app.config.warnHandler = (msg, instance, trace) => {
  console.warn('[Vue Warning]', {
    message: msg,
    component: instance?.$options?.name || 'Unknown',
    trace,
    timestamp: new Date().toISOString()
  })
}

// Global Unhandled Promise Rejection Handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
    timestamp: new Date().toISOString()
  })
})

app.mount('#app')
