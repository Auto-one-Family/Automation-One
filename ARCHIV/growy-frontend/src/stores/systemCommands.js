import { defineStore } from 'pinia'
import { eventBus, MQTT_EVENTS } from '@/utils/eventBus'

export const useSystemCommandsStore = defineStore('systemCommands', {
  state: () => ({
    loading: false,
    error: null,
    lastCommand: null,
    commandHistory: [], // Store last 50 commands for debugging
  }),

  getters: {
    getLastCommand: (state) => state.lastCommand,
    getCommandHistory: (state) => state.commandHistory,
  },

  actions: {
    // System Control Commands
    async restartSystem(espId) {
      return this.sendCommand(espId, 'restart')
    },

    async enableSafeMode(espId) {
      return this.sendCommand(espId, 'safe_mode')
    },

    async getSystemStatus(espId) {
      return this.sendCommand(espId, 'system_status')
    },

    async startMeasurements(espId) {
      return this.sendCommand(espId, 'start_measurements')
    },

    async stopMeasurements(espId) {
      return this.sendCommand(espId, 'stop_measurements')
    },

    async syncTime(espId) {
      return this.sendCommand(espId, 'sync_time')
    },

    async resetWiFiConfig(espId) {
      return this.sendCommand(espId, 'reset_wifi_config')
    },

    async factoryReset(espId) {
      return this.sendCommand(espId, 'factory_reset')
    },

    // Pi Integration Commands
    async getPiStatus(espId) {
      return this.sendCommand(espId, 'pi_status')
    },

    async setPiUrl(espId, piUrl) {
      return this.sendCommand(espId, 'pi_set_url', { pi_url: piUrl })
    },

    async configurePiSensor(espId, gpio, sensorType, sensorName, subzoneId) {
      return this.sendCommand(espId, 'configure_pi_sensor', {
        gpio,
        sensor_type: sensorType,
        sensor_name: sensorName,
        subzone_id: subzoneId,
      })
    },

    async installPiLibrary(espId, libraryName, libraryCode, version = '1.0.0') {
      return this.sendCommand(espId, 'pi_install_library', {
        library_name: libraryName,
        library_code: libraryCode,
        version,
      })
    },

    async removePiSensor(espId, gpio, reason = 'maintenance') {
      return this.sendCommand(espId, 'pi_remove_sensor', {
        gpio,
        reason,
      })
    },

    async getPiSensorStatistics(espId) {
      return this.sendCommand(espId, 'pi_sensor_statistics')
    },

    async getPiHealthCheck(espId) {
      return this.sendCommand(espId, 'pi_health_check')
    },

    // Actuator Control Commands
    async configureActuator(espId, gpio, actuatorType, actuatorName, subzoneId) {
      return this.sendCommand(espId, 'configure_actuator', {
        gpio,
        actuator_type: actuatorType,
        actuator_name: actuatorName,
        subzone_id: subzoneId,
      })
    },

    async controlActuator(espId, gpio, value, reason = 'manual') {
      return this.sendCommand(espId, 'control_actuator', {
        gpio,
        value,
        reason,
      })
    },

    async controlActuatorBinary(espId, gpio, state, reason = 'manual') {
      return this.sendCommand(espId, 'control_actuator_binary', {
        gpio,
        state,
        reason,
      })
    },

    // ✅ LÖSUNG: Event-basierte Kommunikation mit MQTT Store
    async emergencyStop(espId, gpio = null, reason = 'emergency') {
      const { useMqttStore } = await import('./mqtt')
      const mqttStore = useMqttStore()
      return await mqttStore.emergencyStop(espId, gpio, reason)
    },

    async emergencyStopAll() {
      const { useMqttStore } = await import('./mqtt')
      const mqttStore = useMqttStore()
      return await mqttStore.emergencyStopAll()
    },

    async removeActuator(espId, gpio, reason = 'maintenance') {
      return this.sendCommand(espId, 'remove_actuator', {
        gpio,
        reason,
      })
    },

    async getActuatorStatus(espId) {
      return this.sendCommand(espId, 'actuator_status')
    },

    // Sensor Configuration Commands
    async configureSensor(espId, gpio, sensorType, sensorName, subzoneId) {
      return this.sendCommand(espId, 'configure_sensor', {
        gpio,
        sensor_type: sensorType,
        sensor_name: sensorName,
        subzone_id: subzoneId,
      })
    },

    async removeSensor(espId, gpio, reason = 'maintenance') {
      return this.sendCommand(espId, 'remove_sensor', {
        gpio,
        reason,
      })
    },

    async getSensorStatus(espId) {
      return this.sendCommand(espId, 'sensor_status')
    },

    // Zone Configuration Commands
    async requestZoneConfig(espId) {
      return this.sendCommand(espId, 'config_request')
    },

    async updateZoneConfig(espId, config) {
      return this.sendCommand(espId, 'config_update', { config })
    },

    async deleteZoneConfig(espId) {
      return this.sendCommand(espId, 'config_delete')
    },

    // Helper method to send commands
    async sendCommand(espId, command, payload = {}) {
      this.loading = true
      this.error = null

      try {
        const fullPayload = {
          command,
          ...payload,
          timestamp: Date.now(),
        }

        // Log command to history
        this.logCommand(espId, command, fullPayload)

        // Send command via Event-System
        eventBus.emit(MQTT_EVENTS.SYSTEM_COMMAND, {
          espId,
          command,
          payload,
          timestamp: Date.now(),
        })

        this.lastCommand = {
          espId,
          command,
          payload: fullPayload,
          timestamp: Date.now(),
          success: true,
        }

        return true
      } catch (error) {
        console.error(`Command ${command} failed:`, error)
        this.error = error.message

        this.lastCommand = {
          espId,
          command,
          payload: { command, ...payload },
          timestamp: Date.now(),
          success: false,
          error: error.message,
        }

        throw error
      } finally {
        this.loading = false
      }
    },

    // Log command to history
    logCommand(espId, command, payload) {
      const commandLog = {
        espId,
        command,
        payload,
        timestamp: Date.now(),
      }

      this.commandHistory.unshift(commandLog)

      // Keep only last 50 commands
      if (this.commandHistory.length > 50) {
        this.commandHistory.pop()
      }
    },

    // Clear command history
    clearCommandHistory() {
      this.commandHistory = []
    },

    // Clear error
    clearError() {
      this.error = null
    },

    // Get command statistics
    getCommandStats() {
      const total = this.commandHistory.length
      const successful = this.commandHistory.filter((cmd) => cmd.success !== false).length
      const failed = total - successful

      return {
        total,
        successful,
        failed,
        successRate: total > 0 ? (successful / total) * 100 : 0,
      }
    },
  },
})
