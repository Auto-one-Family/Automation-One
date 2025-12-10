export const config = {
  mqtt: {
    defaultBrokerUrl: '192.168.0.91', // ✅ KORRIGIERT: Aktuelle IP-Adresse
    defaultPort: 9001,
    reconnectAttempts: 10,
    reconnectDelay: 5000,
    keepAlive: 30,
  },

  storage: {
    maxMessages: 1000, // ✅ ERWEITERT: 10x höhere Begrenzung für 50 ESPs
    cleanupInterval: 5 * 60 * 1000, // 5 Minuten
    maxDevices: 50,
  },

  ui: {
    snackbarTimeout: 5000,
    refreshInterval: 30000,
    connectionTimeout: 10000,
  },

  system: {
    defaultKaiserId: 'raspberry_pi_central',
    defaultHttpPort: 8443, // war: 8080
    defaultMqttPortESP32: 1883,
  },
}
