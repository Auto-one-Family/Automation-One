<template>
  <div class="bg-white shadow rounded-lg p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-semibold">MQTT Configuration</h2>
      <div class="text-sm text-gray-500">
        Last Updated: {{ formatRelativeTime(lastConfigUpdate) }}
      </div>
    </div>

    <!-- Broker Configuration -->
    <div class="mb-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Broker Settings</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Broker URL </label>
          <input
            v-model="config.brokerUrl"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="0.0.35.41"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Port </label>
          <input
            v-model.number="config.port"
            type="number"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="9001"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Client ID </label>
          <input
            v-model="config.clientId"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="growy_frontend_client"
          />
        </div>
      </div>
    </div>

    <!-- Authentication -->
    <div class="mb-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Authentication</h3>
      <div class="space-y-4">
        <div class="flex items-center">
          <input
            v-model="config.useAuth"
            type="checkbox"
            class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label class="ml-2 block text-sm text-gray-900"> Use Authentication </label>
        </div>

        <div v-if="config.useAuth" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"> Username </label>
            <input
              v-model="config.username"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"> Password </label>
            <input
              v-model="config.password"
              type="password"
              class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- SSL/TLS Configuration -->
    <div class="mb-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">SSL/TLS Settings</h3>
      <div class="space-y-4">
        <div class="flex items-center">
          <input
            v-model="config.useSSL"
            type="checkbox"
            class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label class="ml-2 block text-sm text-gray-900"> Use SSL/TLS </label>
        </div>

        <div v-if="config.useSSL" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"> CA Certificate </label>
            <textarea
              v-model="config.caCert"
              rows="4"
              class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Paste CA certificate here..."
            ></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- Advanced Settings -->
    <div class="mb-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Advanced Settings</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Keep Alive Interval (seconds)
          </label>
          <input
            v-model.number="config.keepAlive"
            type="number"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Reconnect Period (ms)
          </label>
          <input
            v-model.number="config.reconnectPeriod"
            type="number"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"> Connect Timeout (ms) </label>
          <input
            v-model.number="config.connectTimeout"
            type="number"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-between items-center">
      <div>
        <button
          @click="saveConfig"
          class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Save Configuration
        </button>
        <button
          @click="resetConfig"
          class="ml-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatRelativeTime } from '@/utils/time'

export default defineComponent({
  name: 'ConfigurationPanel',

  setup() {
    const centralDataHub = useCentralDataHub()
    const mqttStore = computed(() => centralDataHub.mqttStore)
    const lastConfigUpdate = ref(null)

    const defaultConfig = {
      brokerUrl: '0.0.35.41',
      port: 9001,
      clientId: `growy_frontend_${Math.random().toString(16).substring(2, 8)}`,
      useAuth: false,
      username: '',
      password: '',
      useSSL: false,
      caCert: '',
      keepAlive: 60,
      reconnectPeriod: 1000,
      connectTimeout: 30000,
    }

    const config = ref({ ...defaultConfig })

    // Load current configuration if available
    if (mqttStore.value.config) {
      config.value = { ...mqttStore.value.config }
      lastConfigUpdate.value = Date.now()
    }

    const saveConfig = () => {
      try {
        mqttStore.value.updateConfig(config.value)
        lastConfigUpdate.value = Date.now()
        window.$snackbar?.showSuccess('Configuration saved successfully')
      } catch (error) {
        console.error('Failed to save configuration:', error)
        window.$snackbar?.showError('Failed to save configuration')
      }
    }

    const resetConfig = () => {
      config.value = { ...defaultConfig }
      lastConfigUpdate.value = Date.now()
      window.$snackbar?.showInfo('Configuration reset to defaults')
    }

    return {
      config,
      lastConfigUpdate,
      saveConfig,
      resetConfig,
      formatRelativeTime,
    }
  },
})
</script>
