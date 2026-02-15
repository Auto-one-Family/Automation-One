import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { createLogger } from '@/utils/logger'

import './styles/main.css'

const app = createApp(App)
const logger = createLogger('Global')

app.use(createPinia())
app.use(router)

// Global Vue Error Handler - structured logging
app.config.errorHandler = (err, instance, info) => {
  logger.error('Vue error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    component: instance?.$options?.name || 'Unknown',
    info,
  })
}

app.config.warnHandler = (msg, instance, trace) => {
  logger.warn('Vue warning', {
    message: msg,
    component: instance?.$options?.name || 'Unknown',
    trace,
  })
}

// Global Unhandled Promise Rejection Handler
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled rejection', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
  })
})

// Global window.onerror Handler - catches synchronous JS errors
window.onerror = (message, source, lineno, colno, error) => {
  logger.error('Uncaught error', {
    message: String(message),
    source,
    lineno,
    colno,
    stack: error?.stack,
  })
}

app.mount('#app')
