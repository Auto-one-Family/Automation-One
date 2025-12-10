import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'

// ✅ NEU: Composable für sichere Store-Initialisierung
export function useStoreInitialization() {
  const centralDataHub = ref(null)
  const storesInitialized = ref(false)
  const initializationError = ref(null)
  const isLoading = ref(false)

  // ✅ NEU: Sichere Store-Referenzen
  const mqttStore = ref(null)
  const centralConfig = ref(null)
  const espManagement = ref(null)
  const sensorRegistry = ref(null)
  const piIntegration = ref(null)
  const actuatorLogic = ref(null)
  const systemCommands = ref(null)
  const dashboardGenerator = ref(null)

  // ✅ KORRIGIERT: Sichere Store-Referenzen mit Proxy-Handling
  const isMqttStoreAvailable = computed(() => {
    return (
      mqttStore.value &&
      (typeof mqttStore.value.getKaiserId === 'function' ||
        typeof mqttStore.value.getKaiserId === 'string')
    )
  })

  const isCentralConfigAvailable = computed(() => {
    return (
      centralConfig.value &&
      (typeof centralConfig.value.getCurrentKaiserId === 'function' ||
        typeof centralConfig.value.getCurrentKaiserId === 'string')
    )
  })

  const isEspManagementAvailable = computed(() => {
    return espManagement.value && typeof espManagement.value.getAvailablePins === 'function'
  })

  const isSensorRegistryAvailable = computed(() => {
    return sensorRegistry.value && typeof sensorRegistry.value.getAllSensors === 'function'
  })

  const isPiIntegrationAvailable = computed(() => {
    return piIntegration.value && typeof piIntegration.value.checkPiStatus === 'function'
  })

  const isActuatorLogicAvailable = computed(() => {
    return actuatorLogic.value && typeof actuatorLogic.value.logicEngine === 'object'
  })

  const isSystemCommandsAvailable = computed(() => {
    return systemCommands.value && typeof systemCommands.value.sendCommand === 'function'
  })

  const isDashboardGeneratorAvailable = computed(() => {
    return (
      dashboardGenerator.value && typeof dashboardGenerator.value.getSensorGroupKey === 'function'
    )
  })

  // ✅ NEU: Alle kritischen Stores verfügbar
  const areCriticalStoresAvailable = computed(() => {
    return isMqttStoreAvailable.value && isCentralConfigAvailable.value
  })

  // ✅ NEU: Alle Stores verfügbar
  const areAllStoresAvailable = computed(() => {
    return (
      isMqttStoreAvailable.value &&
      isCentralConfigAvailable.value &&
      isEspManagementAvailable.value &&
      isSensorRegistryAvailable.value &&
      isPiIntegrationAvailable.value &&
      isActuatorLogicAvailable.value &&
      isSystemCommandsAvailable.value &&
      isDashboardGeneratorAvailable.value
    )
  })

  // ✅ NEU: Store-Initialisierung mit Error Handling und Retry-Logic
  const initializeStores = async () => {
    if (isLoading.value) return false

    isLoading.value = true
    initializationError.value = null

    try {
      console.log('🔄 Starting store initialization...')

      // ✅ NEU: CentralDataHub initialisieren
      centralDataHub.value = useCentralDataHub()

      // ✅ NEU: Warte auf Store-Initialisierung mit Retry-Logic
      let retryCount = 0
      const maxRetries = 3
      let storesLoaded = false

      while (retryCount < maxRetries && !storesLoaded) {
        try {
          if (centralDataHub.value && typeof centralDataHub.value.initializeSystem === 'function') {
            await centralDataHub.value.initializeSystem()
            storesLoaded = true
            console.log('✅ CentralDataHub system initialized successfully')
          } else {
            throw new Error('CentralDataHub initializeSystem method not available')
          }
        } catch (error) {
          retryCount++
          console.warn(`⚠️ Store initialization attempt ${retryCount} failed:`, error.message)

          if (retryCount < maxRetries) {
            // Warte vor dem nächsten Versuch
            await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
          } else {
            throw new Error(
              `Store initialization failed after ${maxRetries} attempts: ${error.message}`,
            )
          }
        }
      }

      // ✅ NEU: Sichere Store-Referenzen abrufen mit Validierung
      console.log('🔄 Loading store references...')

      // Lade Stores einzeln mit Error Handling
      try {
        mqttStore.value = centralDataHub.value?.mqttStore
        console.log('MQTT Store loaded:', !!mqttStore.value)
      } catch (error) {
        console.warn('Failed to load MQTT Store:', error.message)
      }

      try {
        centralConfig.value = centralDataHub.value?.centralConfig
        console.log('CentralConfig Store loaded:', !!centralConfig.value)
      } catch (error) {
        console.warn('Failed to load CentralConfig Store:', error.message)
      }

      try {
        espManagement.value = centralDataHub.value?.espManagement
        console.log('EspManagement Store loaded:', !!espManagement.value)
      } catch (error) {
        console.warn('Failed to load EspManagement Store:', error.message)
      }

      try {
        sensorRegistry.value = centralDataHub.value?.sensorRegistry
        console.log('SensorRegistry Store loaded:', !!sensorRegistry.value)
      } catch (error) {
        console.warn('Failed to load SensorRegistry Store:', error.message)
      }

      try {
        piIntegration.value = centralDataHub.value?.piIntegration
        console.log('PiIntegration Store loaded:', !!piIntegration.value)
      } catch (error) {
        console.warn('Failed to load PiIntegration Store:', error.message)
      }

      try {
        actuatorLogic.value = centralDataHub.value?.actuatorLogic
        console.log('ActuatorLogic Store loaded:', !!actuatorLogic.value)
      } catch (error) {
        console.warn('Failed to load ActuatorLogic Store:', error.message)
      }

      try {
        systemCommands.value = centralDataHub.value?.systemCommands
        console.log('SystemCommands Store loaded:', !!systemCommands.value)
      } catch (error) {
        console.warn('Failed to load SystemCommands Store:', error.message)
      }

      try {
        dashboardGenerator.value = centralDataHub.value?.dashboardGenerator
        console.log('DashboardGenerator Store loaded:', !!dashboardGenerator.value)
      } catch (error) {
        console.warn('Failed to load DashboardGenerator Store:', error.message)
      }

      // ✅ NEU: Validierung der kritischen Stores mit detaillierter Fehleranalyse
      console.log('🔄 Validating critical stores...')

      if (!mqttStore.value) {
        throw new Error('MQTT Store konnte nicht geladen werden')
      }

      if (!centralConfig.value) {
        throw new Error('CentralConfig Store konnte nicht geladen werden')
      }

      // ✅ NEU: Zusätzliche Validierung der Store-Getter (nicht Funktionen)
      const mqttKaiserId = mqttStore.value.getKaiserId
      if (typeof mqttKaiserId !== 'function' && typeof mqttKaiserId !== 'string') {
        console.warn('MQTT Store getKaiserId getter not available, attempting to initialize...')

        // Warte kurz und versuche es erneut
        await new Promise((resolve) => setTimeout(resolve, 500))

        const retryKaiserId = mqttStore.value.getKaiserId
        if (typeof retryKaiserId !== 'function' && typeof retryKaiserId !== 'string') {
          throw new Error('MQTT Store getKaiserId getter nicht verfügbar')
        }
      }

      const centralKaiserId = centralConfig.value.getCurrentKaiserId
      if (typeof centralKaiserId !== 'function' && typeof centralKaiserId !== 'string') {
        console.warn(
          'CentralConfig Store getCurrentKaiserId getter not available, attempting to initialize...',
        )

        // Warte kurz und versuche es erneut
        await new Promise((resolve) => setTimeout(resolve, 500))

        const retryCentralKaiserId = centralConfig.value.getCurrentKaiserId
        if (
          typeof retryCentralKaiserId !== 'function' &&
          typeof retryCentralKaiserId !== 'string'
        ) {
          throw new Error('CentralConfig Store getCurrentKaiserId getter nicht verfügbar')
        }
      }

      storesInitialized.value = true
      console.log('✅ Stores initialized successfully via useStoreInitialization')
      console.log('Store status:', {
        mqtt: isMqttStoreAvailable.value,
        centralConfig: isCentralConfigAvailable.value,
        espManagement: isEspManagementAvailable.value,
        sensorRegistry: isSensorRegistryAvailable.value,
        piIntegration: isPiIntegrationAvailable.value,
        actuatorLogic: isActuatorLogicAvailable.value,
        systemCommands: isSystemCommandsAvailable.value,
        dashboardGenerator: isDashboardGeneratorAvailable.value,
      })

      return true
    } catch (error) {
      console.error('❌ Store initialization failed:', error)
      initializationError.value = error.message
      storesInitialized.value = false
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ✅ NEU: Store-Reset für Tests
  const resetStores = () => {
    centralDataHub.value = null
    mqttStore.value = null
    centralConfig.value = null
    espManagement.value = null
    sensorRegistry.value = null
    piIntegration.value = null
    actuatorLogic.value = null
    systemCommands.value = null
    dashboardGenerator.value = null
    storesInitialized.value = false
    initializationError.value = null
    isLoading.value = false
  }

  // ✅ NEU: Store-Status abrufen
  const getStoreStatus = () => {
    return {
      initialized: storesInitialized.value,
      loading: isLoading.value,
      error: initializationError.value,
      stores: {
        mqtt: isMqttStoreAvailable.value,
        centralConfig: isCentralConfigAvailable.value,
        espManagement: isEspManagementAvailable.value,
        sensorRegistry: isSensorRegistryAvailable.value,
        piIntegration: isPiIntegrationAvailable.value,
        actuatorLogic: isActuatorLogicAvailable.value,
        systemCommands: isSystemCommandsAvailable.value,
        dashboardGenerator: isDashboardGeneratorAvailable.value,
      },
    }
  }

  return {
    // Store-Referenzen
    centralDataHub,
    mqttStore,
    centralConfig,
    espManagement,
    sensorRegistry,
    piIntegration,
    actuatorLogic,
    systemCommands,
    dashboardGenerator,

    // Status
    storesInitialized,
    initializationError,
    isLoading,

    // Computed Properties
    isMqttStoreAvailable,
    isCentralConfigAvailable,
    isEspManagementAvailable,
    isSensorRegistryAvailable,
    isPiIntegrationAvailable,
    isActuatorLogicAvailable,
    isSystemCommandsAvailable,
    isDashboardGeneratorAvailable,
    areCriticalStoresAvailable,
    areAllStoresAvailable,

    // Methods
    initializeStores,
    resetStores,
    getStoreStatus,
  }
}
