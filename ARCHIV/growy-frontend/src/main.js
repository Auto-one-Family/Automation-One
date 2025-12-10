import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'

// ✅ NEU: Globale Komponenten-Imports
import AccessibleButton from '@/components/common/AccessibleButton.vue'
import AccessibleIcon from '@/components/common/AccessibleIcon.vue'
import LoadingStates from '@/components/common/LoadingStates.vue'
import MobileNavigation from '@/components/common/MobileNavigation.vue'

// ✅ KORRIGIERT: Async App-Initialisierung mit Race-Condition-Fix
const initializeApp = async () => {
  console.log('🔥 APP START - Initialization Phase')

  // Schritt 1: Pinia erstellen
  const pinia = createPinia()

  // Schritt 2: CentralDataHub VOR Vue-App initialisieren
  console.log('🔥 BEFORE CentralDataHub init')
  const { useCentralDataHub } = await import('./stores/centralDataHub')
  const centralDataHub = useCentralDataHub(pinia)

  // Schritt 3: Stores vollständig initialisieren
  let initAttempts = 0
  const maxInitAttempts = 3

  while (initAttempts < maxInitAttempts) {
    try {
      await centralDataHub.initializeHarmoniousSystem()

      // ✅ Validierung der harmonischen Initialisierung
      console.log('🔍 [Harmony] Validation check:', {
        eventSystemInitialized: centralDataHub.lifecycleManager.eventSystem.initialized,
        mqttStore: !!centralDataHub.storeReferences.mqtt,
        centralConfigStore: !!centralDataHub.storeReferences.centralConfig,
        storeReferencesKeys: Object.keys(centralDataHub.storeReferences),
      })

      if (
        centralDataHub.lifecycleManager.eventSystem.initialized &&
        centralDataHub.storeReferences.mqtt &&
        centralDataHub.storeReferences.centralConfig
      ) {
        console.log('🎵 [Harmony] Harmonious system initialized successfully')

        // ✅ HINZUFÜGEN - Event-basierte Kommunikation initialisieren
        centralDataHub.initializeEventBasedCommunication()
        console.log('🎵 [Event] Event-based communication initialized')

        break
      } else {
        throw new Error('Harmonious system not properly initialized')
      }
    } catch (error) {
      initAttempts++
      console.warn(
        `⚠️ [Harmony] Harmonious initialization attempt ${initAttempts} failed:`,
        error.message,
      )

      if (initAttempts >= maxInitAttempts) {
        console.error(
          '❌ [Harmony] Max harmonious initialization attempts reached, continuing with fallback',
        )
        break
      }

      // Warte vor dem nächsten Versuch
      await new Promise((resolve) => setTimeout(resolve, 1000 * initAttempts))
    }
  }

  console.log('🔥 AFTER CentralDataHub init')

  // Schritt 4: ERST DANN Vue-App erstellen
  console.log('🔥 BEFORE Vue app creation')
  const app = createApp(App)

  // Schritt 5: Plugins hinzufügen
  app.use(pinia)
  app.use(router)
  app.use(vuetify)

  // ✅ NEU: Globale Error-Handler für DOM-Fehler
  app.config.errorHandler = (error, instance, info) => {
    console.error('Vue Error:', error)
    console.error('Component:', instance)
    console.error('Info:', info)

    // ✅ NEU: DOM-spezifische Fehlerbehandlung
    if (error.message?.includes('parentNode')) {
      console.warn('DOM Element not ready, retrying...')
      // Retry-Logic für DOM-abhängige Operationen
      setTimeout(() => {
        if (instance && instance.$nextTick) {
          instance.$nextTick(() => {
            // Force re-render
            instance.$forceUpdate()
          })
        }
      }, 100)
    }
  }

  // ✅ NEU: Globale Komponenten registrieren
  app.component('AccessibleButton', AccessibleButton)
  app.component('AccessibleIcon', AccessibleIcon)
  app.component('LoadingStates', LoadingStates)
  app.component('MobileNavigation', MobileNavigation)

  // ✅ NEU: Globale Slot-Defaults setzen
  app.config.globalProperties.$vuetify = {
    defaults: {
      VBtn: {
        variant: 'text',
      },
      VIcon: {
        size: 'small',
      },
    },
  }

  // ✅ NEU: Sichere Store-Instanzen über CentralDataHub abrufen
  const mqttStore = centralDataHub.mqttStore
  const centralConfigStore = centralDataHub.centralConfig
  const espManagementStore = centralDataHub.espManagement
  const sensorRegistryStore = centralDataHub.sensorRegistry
  const piIntegrationStore = centralDataHub.piIntegration
  const actuatorLogicStore = centralDataHub.actuatorLogic
  const dashboardGeneratorStore = centralDataHub.dashboardGenerator
  const timeRangeStore = centralDataHub.timeRange
  const zoneRegistryStore = centralDataHub.zoneRegistry
  const logicalAreasStore = centralDataHub.logicalAreas

  // ✅ NEU: Validierung der Store-Instanzen
  console.log('Store instances validation:', {
    mqttStore: !!mqttStore,
    centralConfigStore: !!centralConfigStore,
    espManagementStore: !!espManagementStore,
    sensorRegistryStore: !!sensorRegistryStore,
    piIntegrationStore: !!piIntegrationStore,
    actuatorLogicStore: !!actuatorLogicStore,
    dashboardGeneratorStore: !!dashboardGeneratorStore,
    timeRangeStore: !!timeRangeStore,
    zoneRegistryStore: !!zoneRegistryStore,
    logicalAreasStore: !!logicalAreasStore,
  })

  // ✅ NEU: Restore persistent data mit Error Handling
  console.log('Restoring persistent data...')

  try {
    // Central Config initialisieren (Kaiser ID Synchronisation)
    if (centralConfigStore) {
      try {
        centralConfigStore.loadFromStorage()
        centralConfigStore.migrateFromEnvironment()
        console.log(`✅ Central Config initialized - Kaiser ID: ${centralConfigStore.kaiserId}`)
      } catch (error) {
        console.warn('⚠️ Central Config initialization failed:', error.message)
      }
    }

    // MQTT Store initialisieren
    if (mqttStore) {
      try {
        mqttStore.restoreConfig()
        mqttStore.restoreKaiserConfig()
        console.log('✅ MQTT Store initialized')
      } catch (error) {
        console.warn('⚠️ MQTT Store initialization failed:', error.message)
      }
    }

    // Pi Integration Store initialisieren
    if (piIntegrationStore) {
      try {
        piIntegrationStore.restorePiConfig()
        piIntegrationStore.restoreLibraries()
        piIntegrationStore.restoreSensors()
        piIntegrationStore.restoreActuators()
        console.log('✅ Pi Integration Store initialized')
      } catch (error) {
        console.warn('⚠️ Pi Integration Store initialization failed:', error.message)
      }
    }

    // ESP Management Store initialisieren
    if (espManagementStore) {
      try {
        espManagementStore.restorePinAssignments()
        console.log('✅ ESP Management Store initialized')
      } catch (error) {
        console.warn('⚠️ ESP Management Store initialization failed:', error.message)
      }
    }

    // Actuator Logic Store initialisieren
    if (actuatorLogicStore) {
      try {
        actuatorLogicStore.restoreLogicConfig()
        console.log('✅ Actuator Logic Store initialized')
      } catch (error) {
        console.warn('⚠️ Actuator Logic Store initialization failed:', error.message)
      }
    }

    // Sensor Registry Store initialisieren
    if (sensorRegistryStore) {
      try {
        sensorRegistryStore.restoreSensors()
        console.log('✅ Sensor Registry Store initialized')
      } catch (error) {
        console.warn('⚠️ Sensor Registry Store initialization failed:', error.message)
      }
    }

    // Time Range Store initialisieren
    if (timeRangeStore) {
      try {
        timeRangeStore.restoreTimeRange()
        console.log('✅ Time Range Store initialized')
      } catch (error) {
        console.warn('⚠️ Time Range Store initialization failed:', error.message)
      }
    }

    // Zone Registry Store initialisieren
    if (zoneRegistryStore) {
      try {
        zoneRegistryStore.restoreZones()
        console.log('✅ Zone Registry Store initialized')
      } catch (error) {
        console.warn('⚠️ Zone Registry Store initialization failed:', error.message)
      }
    }

    // Logical Areas Store initialisieren
    if (logicalAreasStore) {
      try {
        logicalAreasStore.restoreLogicalAreas()
        console.log('✅ Logical Areas Store initialized')
      } catch (error) {
        console.warn('⚠️ Logical Areas Store initialization failed:', error.message)
      }
    }

    // Dashboard Generator Store initialisieren
    if (dashboardGeneratorStore) {
      try {
        if (dashboardGeneratorStore.restoreDashboards) {
          dashboardGeneratorStore.restoreDashboards()
          console.log('✅ DashboardGenerator Store restored successfully')
        } else {
          console.warn('⚠️ DashboardGenerator Store not ready for restore, initializing...')
          // ✅ NEU: Store manuell initialisieren falls nötig
          dashboardGeneratorStore.initializeSensorGroups()
          dashboardGeneratorStore.loadConfig()
          console.log('✅ DashboardGenerator Store manually initialized')
        }
      } catch (error) {
        console.warn('⚠️ DashboardGenerator Store restore failed:', error.message)
      }
    }

    console.log('✅ All persistent data restored')
  } catch (error) {
    console.warn('⚠️ Some persistent data restoration failed:', error.message)
  }

  // ✅ NEU: Performance-Monitoring mit Cleanup
  const performanceObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'navigation') {
        console.log(`📊 Page Load: ${entry.loadEventEnd - entry.loadEventStart}ms`)
      }
    }
  })
  performanceObserver.observe({ entryTypes: ['navigation'] })

  // ✅ NEU: Cleanup bei App-Beendigung mit Event Listener Cleanup
  const cleanupHandlers = []

  window.addEventListener('beforeunload', () => {
    console.log('🧹 Cleaning up application...')

    // ✅ NEU: Performance Observer stoppen
    try {
      performanceObserver.disconnect()
    } catch (error) {
      console.warn('⚠️ Performance observer cleanup failed:', error.message)
    }

    // ✅ NEU: Event Listener Cleanup
    cleanupHandlers.forEach((handler) => {
      try {
        handler()
      } catch (error) {
        console.warn('⚠️ Cleanup handler failed:', error.message)
      }
    })

    // ✅ NEU: Store Cleanup
    try {
      mqttStore?.cleanup()
      actuatorLogicStore?.cleanup()
    } catch (error) {
      console.warn('⚠️ Store cleanup error:', error.message)
    }
  })

  // ✅ NEU: API Service initialisieren nach Pinia Setup
  try {
    const { apiService } = await import('./services/apiService')
    await apiService.initializeStore()
    console.log('✅ API Service initialized successfully')
  } catch (error) {
    console.warn('⚠️ API Service initialization failed:', error.message)
  }

  // ✅ NEU: Auto-connect MQTT wenn möglich (über CentralDataHub)
  if (centralConfigStore?.isConnected) {
    try {
      await centralDataHub.connectToMqtt()
      console.log('✅ MQTT auto-connected via CentralDataHub')
    } catch (error) {
      console.warn('⚠️ MQTT auto-connect failed:', error.message)
    }
  }

  // Schritt 6: ERST DANN mounten
  console.log('🔥 BEFORE Vue mount')
  app.mount('#app')
  console.log('🔥 AFTER Vue mount')

  return app
}

// ✅ KORRIGIERT: Async App-Initialisierung mit Error Handling
initializeApp().catch((error) => {
  console.error('❌ App initialization failed:', error)
  // Fallback: Basic app ohne Stores
  const fallbackApp = createApp(App)
  fallbackApp.use(createPinia())
  fallbackApp.use(router)
  fallbackApp.use(vuetify)
  fallbackApp.mount('#app')
  console.log('🚀 Fallback application started')
})
