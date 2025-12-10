# 🚀 MQTT-Port-Architektur Dokumentation

## 📋 **ÜBERSICHT**

Das Growy-System verwendet eine **dreistufige Port-Architektur** für optimale Kommunikation zwischen verschiedenen Systemkomponenten:

- **HTTP API (8080)**: Konfiguration und Datenabfragen
- **MQTT Agenten (1883)**: Native MQTT für ESP32-Sensordaten
- **MQTT Dashboard (9001)**: WebSocket MQTT für Frontend-Live-Daten

## 🏗️ **ARCHITEKTUR-DIAGRAMM**

```
┌─────────────────┐    HTTP API     ┌─────────────────┐    WebSocket MQTT    ┌─────────────────┐
│                 │ ──────────────► │                 │ ───────────────────► │                 │
│   ESP32 Agenten │                 │  Zentrale       │                      │   Dashboard     │
│   (Sensoren)    │                 │  (Backend)      │                      │   (Frontend)    │
│                 │ ◄────────────── │                 │ ◄─────────────────── │                 │
└─────────────────┘   Native MQTT   └─────────────────┘                      └─────────────────┘
```

## 🔌 **PORT-DETAILS**

### **1. HTTP API Port (8080)**

**Zweck:** REST-API für Konfiguration und Datenabfragen

**Verwendung:**

- Geräte-Konfiguration
- Zonenverwaltung
- Historische Daten
- System-Status

**Protokoll:** HTTP/HTTPS
**Richtung:** Bidirektional
**Standard-Port:** 8080

**Beispiel:**

```bash
# Agent konfigurieren
POST http://192.168.0.91:8080/api/config
{
  "esp_id": "esp_001",
  "zone": "Gewächshaus",
  "sensors": ["temperature", "humidity"]
}
```

### **2. MQTT Agenten Port (1883)**

**Zweck:** Native MQTT-Verbindung für ESP32-Sensordaten

**Verwendung:**

- Temperatur-Daten
- Feuchtigkeit-Daten
- pH-Wert-Daten
- Andere Sensor-Messungen

**Protokoll:** MQTT über TCP
**Richtung:** Agenten → Server
**Standard-Port:** 1883

**Beispiel:**

```bash
# ESP32 sendet Temperatur
mosquitto_pub -h 192.168.0.91 -p 1883 -t "kaiser/esp_001/sensors/temperature" -m "23.5"
```

### **3. MQTT Dashboard Port (9001)**

**Zweck:** WebSocket MQTT für Frontend-Live-Daten

**Verwendung:**

- Live-Dashboard
- Echtzeit-Graphen
- Status-Updates
- Benutzer-Interaktionen

**Protokoll:** MQTT über WebSocket
**Richtung:** Server → Dashboard
**Standard-Port:** 9001

**Beispiel:**

```javascript
// Frontend verbindet sich
const client = mqtt.connect('ws://192.168.0.91:9001/mqtt')
client.subscribe('kaiser/+/sensors/+')
```

## 🔧 **KONFIGURATION**

### **Zentrale Konfiguration**

Die Port-Konfiguration wird zentral im `centralConfig` Store verwaltet:

```javascript
// src/stores/centralConfig.js
export const useCentralConfigStore = defineStore('centralConfig', {
  state: () => ({
    httpPort: 8080,
    mqttPortFrontend: 9001, // WebSocket für Frontend
    mqttPortESP32: 1883, // Native MQTT für ESP32

    // Strukturierte Port-Definitionen
    portDefinitions: {
      http: {
        title: 'HTTP API-Port',
        description: 'REST-API für Konfiguration, Geräteverwaltung und Datenabfragen.',
        useCase: 'Geräte-Konfiguration, Zonenverwaltung, Historische Daten',
        protocol: 'HTTP/HTTPS',
        direction: 'Bidirektional',
        example: 'Frontend konfiguriert Agent → POST an 192.168.0.91:8080/api/config',
        icon: 'mdi-api',
        color: 'info',
        standardPort: 8080,
      },
      // ... weitere Port-Definitionen
    },
  }),
})
```

### **Port-Validierung**

```javascript
// Port-Validierung mit Konflikt-Prüfung
validatePorts() {
  const errors = []
  const ports = [
    this.httpPort,
    this.mqttPortESP32,
    this.mqttPortFrontend
  ]

  const uniquePorts = new Set(ports)
  if (uniquePorts.size !== 3) {
    errors.push('Alle Ports müssen unterschiedlich sein')
  }

  return errors
}
```

## 🎨 **BENUTZEROBERFLÄCHE**

### **GodDeviceCard.vue**

Die `GodDeviceCard.vue` zeigt eine strukturierte Port-Konfiguration:

```vue
<!-- Strukturierte Port-Konfiguration -->
<div class="port-configuration">
  <!-- HTTP API Port -->
  <div class="port-section mb-3">
    <div class="port-header d-flex align-center mb-2">
      <v-icon icon="mdi-api" color="info" class="mr-2" />
      <span class="text-subtitle-2">HTTP API</span>
      <v-chip color="success" size="x-small" variant="tonal" class="ml-2">
        Standard
      </v-chip>
    </div>
    <v-text-field
      v-model="deviceInfo.serverHttpPort"
      label="API-Port"
      :hint="centralConfig.getPortExplanations?.http?.description"
      persistent-hint
    />
  </div>

  <!-- Weitere Port-Sektionen... -->
</div>
```

### **DataFlowVisualization.vue**

Die `DataFlowVisualization.vue` zeigt die Datenfluss-Architektur:

```vue
<!-- Datenfluss-Diagramm -->
<div class="flow-diagram mb-3">
  <div class="d-flex align-center justify-space-between">
    <div class="text-center">
      <v-icon icon="mdi-thermometer" color="primary" size="large" />
      <div class="text-caption">Agenten</div>
    </div>
    <v-icon icon="mdi-arrow-right" color="grey" />
    <div class="text-center">
      <v-icon icon="mdi-server" color="warning" size="large" />
      <div class="text-caption">Zentrale</div>
    </div>
    <v-icon icon="mdi-arrow-right" color="grey" />
    <div class="text-center">
      <v-icon icon="mdi-monitor" color="success" size="large" />
      <div class="text-caption">Dashboard</div>
    </div>
  </div>
</div>
```

## 🧪 **TESTING**

### **Verbindungstests**

```javascript
// Erweiterte Test-Methoden
const testAllConnections = async () => {
  const results = await Promise.allSettled([
    testHttpConnection(),
    testMqttEsp32Connection(),
    testMqttFrontendConnection(),
  ])

  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length
  return { success: successCount === 3, results }
}

const testHttpConnection = async () => {
  try {
    const response = await fetch(`http://${serverIP}:${httpPort}/api/health`, {
      timeout: 3000,
    })
    return response.ok
  } catch {
    return false
  }
}
```

## 🔄 **MIGRATION**

### **Von alter zu neuer Architektur**

Die neue Architektur ist vollständig rückwärtskompatibel:

```javascript
// Alte Methoden rufen neue auf
setMqttPortFrontend(port) {
  return this.setMqttFrontendPort(port)
}

setMqttPortESP32(port) {
  return this.setMqttEsp32Port(port)
}
```

### **Automatische Synchronisation**

```javascript
// Automatische MQTT Store Synchronisation
syncWithMqttStore() {
  try {
    const mqttStore = useMqttStore()
    mqttStore.updateConfig({
      brokerUrl: this.serverIP,
      port: this.mqttPortFrontend
    })
  } catch (error) {
    console.warn('Failed to sync with MQTT store:', error)
  }
}
```

## 🚨 **TROUBLESHOOTING**

### **Häufige Probleme**

1. **Port-Konflikte**

   - Alle drei Ports müssen unterschiedlich sein
   - Standard-Ports: 8080, 1883, 9001

2. **Firewall-Probleme**

   - Port 1883: Native MQTT für ESP32
   - Port 9001: WebSocket MQTT für Browser
   - Port 8080: HTTP API

3. **Verbindungsprobleme**
   - ESP32 verwenden Port 1883 (Native MQTT)
   - Frontend verwendet Port 9001 (WebSocket MQTT)
   - API verwendet Port 8080 (HTTP)

### **Debugging**

```javascript
// Port-Status prüfen
console.log('Port Status:', centralConfig.getPortStatus)
console.log('Port Erklärungen:', centralConfig.getPortExplanations)

// Verbindungen testen
const testResult = await centralConfig.testAllConnections()
console.log('Test Result:', testResult)
```

## 📚 **WEITERE RESSOURCEN**

- [MQTT Protokoll Dokumentation](https://mqtt.org/)
- [WebSocket MQTT Bridge](https://github.com/mqttjs/MQTT.js)
- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Pinia Store Management](https://pinia.vuejs.org/)

---

**Entwickelt für Growy Frontend v3.8.0**  
**Letzte Aktualisierung:** Dezember 2024
