# 🧠 **MINDMAP-SYSTEM ARCHITEKTUR - BACKEND INTEGRATION**

## 📋 **ÜBERSICHT**

Das Mindmap-System ist eine hierarchische Darstellung des gesamten IoT-Systems mit drei Hauptebenen:

1. **God Level** (Zentrale Steuerung)
2. **Kaiser Level** (Edge Controller)
3. **ESP Level** (Feldgeräte in Zonen)

## 🏗️ **SYSTEM-HIERARCHIE**

### **1. GOD LEVEL (Zentrale)**

```
God Pi (Zentrale Steuerung)
├── Kaiser-Koordination
├── Zentrale Datenverwaltung
├── Übergeordnete Entscheidungen
└── System-weite Logik
```

**Backend-Anforderungen:**

- **MQTT Broker**: Zentrale Kommunikation
- **Datenbank**: Aggregierte Systemdaten
- **API**: REST-Endpoints für God-Funktionen
- **WebSocket**: Echtzeit-Updates

### **2. KAISER LEVEL (Edge Controller)**

```
Kaiser (Edge Controller)
├── ESP-Koordination
├── Lokale Netzwerkverwaltung
├── Autonome Entscheidungen
└── Edge Computing
```

**Backend-Anforderungen:**

- **Kaiser-ID**: Eindeutige Identifikation
- **ESP-Management**: Verwaltung zugeordneter ESPs
- **Zone-Management**: Logische Gruppierung
- **Status-Tracking**: Online/Offline-Status

### **3. ESP LEVEL (Feldgeräte)**

```
Zone (Logische Gruppierung)
├── ESP-Geräte
├── Sensoren & Aktoren
├── Lokale Logik
└── Drahtlose Kommunikation
```

**Backend-Anforderungen:**

- **ESP-ID**: Eindeutige Geräte-Identifikation
- **Zone-Zuordnung**: Logische Gruppierung
- **Sensor/Aktor-Management**: GPIO-Verwaltung
- **Status-Monitoring**: Echtzeit-Status

## 🔌 **ESP-VERBINDUNGSPROTOKOLL**

### **1. ESP-Registrierung**

**MQTT Topics für ESP-Registrierung:**

```
kaiser/{kaiser_id}/esp/{esp_id}/register
```

**Payload-Struktur:**

```json
{
  "esp_id": "esp_001",
  "kaiser_id": "kaiser_server",
  "zone": "zone_1",
  "friendly_name": "ESP Sensor 1",
  "capabilities": {
    "sensors": ["temperature", "humidity"],
    "actuators": ["relay_1", "pwm_1"]
  },
  "gpio_config": {
    "sensors": {
      "temperature": { "pin": 4, "type": "dht22" },
      "humidity": { "pin": 4, "type": "dht22" }
    },
    "actuators": {
      "relay_1": { "pin": 5, "type": "relay" },
      "pwm_1": { "pin": 6, "type": "pwm" }
    }
  },
  "system_state": "OPERATIONAL",
  "timestamp": 1640995200
}
```

### **2. ESP-Status-Updates**

**MQTT Topics für Status-Updates:**

```
kaiser/{kaiser_id}/esp/{esp_id}/status
```

**Payload-Struktur:**

```json
{
  "esp_id": "esp_001",
  "status": "online",
  "system_state": "OPERATIONAL",
  "health": {
    "cpu_usage_percent": 15.5,
    "free_heap_current": 204800,
    "uptime_seconds": 86400,
    "last_update": 1640995200
  },
  "sensor_data": {
    "temperature": { "value": 23.5, "unit": "°C" },
    "humidity": { "value": 65.2, "unit": "%" }
  },
  "actuator_states": {
    "relay_1": { "state": "off", "value": 0 },
    "pwm_1": { "state": "on", "value": 0.75 }
  },
  "timestamp": 1640995200
}
```

### **3. ESP-Konfiguration**

**MQTT Topics für Konfiguration:**

```
kaiser/{kaiser_id}/esp/{esp_id}/config
```

**Payload-Struktur:**

```json
{
  "esp_id": "esp_001",
  "zone": "zone_1",
  "friendly_name": "ESP Sensor 1",
  "gpio_config": {
    "sensors": {
      "temperature": { "pin": 4, "type": "dht22", "enabled": true },
      "humidity": { "pin": 4, "type": "dht22", "enabled": true }
    },
    "actuators": {
      "relay_1": { "pin": 5, "type": "relay", "enabled": true },
      "pwm_1": { "pin": 6, "type": "pwm", "enabled": true }
    }
  },
  "logic_config": {
    "enabled": true,
    "rules": [
      {
        "id": "rule_1",
        "condition": "temperature > 25",
        "action": "relay_1 = on",
        "enabled": true
      }
    ]
  },
  "timestamp": 1640995200
}
```

## 🗂️ **ZONEN-MANAGEMENT**

### **Zone-Struktur**

```json
{
  "zone_name": "zone_1",
  "kaiser_id": "kaiser_server",
  "description": "Gewächshaus Zone 1",
  "esp_devices": ["esp_001", "esp_002", "esp_003"],
  "online_count": 3,
  "sensor_count": 6,
  "actuator_count": 4,
  "status": "active"
}
```

### **Zone-Konfiguration**

**MQTT Topics:**

```
kaiser/{kaiser_id}/zone/{zone_name}/config
```

**Payload:**

```json
{
  "zone_name": "zone_1",
  "kaiser_id": "kaiser_server",
  "description": "Gewächshaus Zone 1",
  "esp_devices": ["esp_001", "esp_002", "esp_003"],
  "zone_logic": {
    "enabled": true,
    "aggregation_rules": [
      {
        "sensor": "temperature",
        "aggregation": "average",
        "interval": 300
      }
    ]
  },
  "timestamp": 1640995200
}
```

## 🔄 **DRAG & DROP SYSTEM**

### **ESP-Zone-Verschiebung**

**MQTT Topics für ESP-Verschiebung:**

```
kaiser/{kaiser_id}/esp/{esp_id}/move
```

**Payload-Struktur:**

```json
{
  "esp_id": "esp_001",
  "from_zone": "unconfigured",
  "to_zone": "zone_1",
  "kaiser_id": "kaiser_server",
  "timestamp": 1640995200
}
```

**Backend-Antwort:**

```json
{
  "success": true,
  "esp_id": "esp_001",
  "new_zone": "zone_1",
  "message": "ESP erfolgreich in Zone verschoben",
  "timestamp": 1640995200
}
```

## 📊 **SYSTEM-STATUS-MONITORING**

### **God-Level-Status**

```json
{
  "god_id": "god_pi_central",
  "status": "online",
  "kaiser_count": 2,
  "total_esp_count": 8,
  "online_kaiser_count": 2,
  "online_esp_count": 7,
  "system_health": 95,
  "last_update": 1640995200
}
```

### **Kaiser-Level-Status**

```json
{
  "kaiser_id": "kaiser_server",
  "status": "online",
  "esp_count": 4,
  "online_esp_count": 4,
  "zone_count": 2,
  "health": {
    "cpu_usage": 25.5,
    "memory_usage": 45.2,
    "uptime": 86400
  },
  "last_update": 1640995200
}
```

### **Zone-Level-Status**

```json
{
  "zone_name": "zone_1",
  "kaiser_id": "kaiser_server",
  "esp_count": 3,
  "online_esp_count": 3,
  "sensor_count": 6,
  "actuator_count": 4,
  "status": "active",
  "last_update": 1640995200
}
```

## 🔧 **ESP-KONFIGURATIONSPROTOKOLL**

### **1. ESP-Setup-Modus**

**MQTT Topics für Setup:**

```
kaiser/{kaiser_id}/esp/{esp_id}/setup
```

**Setup-Payload:**

```json
{
  "esp_id": "esp_001",
  "setup_mode": true,
  "wifi_config": {
    "ssid": "Growy_Network",
    "password": "secure_password"
  },
  "mqtt_config": {
    "broker": "192.168.1.100",
    "port": 1883,
    "username": "esp_user",
    "password": "esp_password"
  },
  "kaiser_config": {
    "kaiser_id": "kaiser_server",
    "kaiser_ip": "192.168.1.101"
  },
  "timestamp": 1640995200
}
```

### **2. ESP-Logik-Konfiguration**

**MQTT Topics für Logik:**

```
kaiser/{kaiser_id}/esp/{esp_id}/logic
```

**Logik-Payload:**

```json
{
  "esp_id": "esp_001",
  "logic_enabled": true,
  "rules": [
    {
      "id": "rule_1",
      "name": "Temperatur-Kontrolle",
      "condition": {
        "sensor": "temperature",
        "operator": ">",
        "value": 25.0
      },
      "action": {
        "actuator": "relay_1",
        "value": "on",
        "duration": 300
      },
      "enabled": true
    },
    {
      "id": "rule_2",
      "name": "Feuchtigkeits-Kontrolle",
      "condition": {
        "sensor": "humidity",
        "operator": "<",
        "value": 60.0
      },
      "action": {
        "actuator": "pwm_1",
        "value": 0.8,
        "duration": 600
      },
      "enabled": true
    }
  ],
  "timestamp": 1640995200
}
```

## 🚨 **FEHLERBEHANDLUNG**

### **ESP-Fehler-Reporting**

**MQTT Topics:**

```
kaiser/{kaiser_id}/esp/{esp_id}/error
```

**Fehler-Payload:**

```json
{
  "esp_id": "esp_001",
  "error_type": "sensor_error",
  "error_message": "Temperature sensor not responding",
  "severity": "warning",
  "affected_component": "temperature_sensor",
  "suggested_action": "check_connections",
  "timestamp": 1640995200
}
```

### **System-Fehler-Reporting**

**MQTT Topics:**

```
kaiser/{kaiser_id}/system/error
```

**System-Fehler-Payload:**

```json
{
  "kaiser_id": "kaiser_server",
  "error_type": "mqtt_connection_lost",
  "error_message": "Lost connection to MQTT broker",
  "severity": "critical",
  "affected_esps": ["esp_001", "esp_002"],
  "recovery_action": "reconnect_mqtt",
  "timestamp": 1640995200
}
```

## 📡 **REAL-TIME COMMUNICATION**

### **WebSocket-Endpoints**

**God-Level WebSocket:**

```
ws://{god_ip}:{port}/ws/god
```

**Kaiser-Level WebSocket:**

```
ws://{kaiser_ip}:{port}/ws/kaiser/{kaiser_id}
```

**ESP-Level WebSocket:**

```
ws://{kaiser_ip}:{port}/ws/esp/{esp_id}
```

### **WebSocket-Nachrichten**

**Status-Update:**

```json
{
  "type": "status_update",
  "source": "esp_001",
  "data": {
    "status": "online",
    "sensor_data": {...},
    "timestamp": 1640995200
  }
}
```

**Config-Update:**

```json
{
  "type": "config_update",
  "source": "esp_001",
  "data": {
    "zone": "zone_1",
    "gpio_config": {...},
    "timestamp": 1640995200
  }
}
```

## 🔐 **SICHERHEIT**

### **Authentifizierung**

- **MQTT**: Username/Password für jeden ESP
- **WebSocket**: Token-basierte Authentifizierung
- **API**: JWT-Token für God-Level-Zugriff

### **Autorisierung**

- **ESP-Level**: Nur eigene Daten lesen/schreiben
- **Kaiser-Level**: Verwaltung zugeordneter ESPs
- **God-Level**: Vollzugriff auf alle Systeme

## 📋 **IMPLEMENTIERUNGSCHECKLISTE**

### **Backend-Entwickler muss implementieren:**

1. **✅ MQTT Broker Setup**

   - Topic-Struktur: `kaiser/{kaiser_id}/esp/{esp_id}/...`
   - QoS-Level: 1 für Status-Updates, 2 für Konfigurationen
   - Persistence: Nachrichten-Speicherung für Offline-ESPs

2. **✅ ESP-Registrierung**

   - Endpoint: `POST /api/esp/register`
   - Validierung: ESP-ID, Kaiser-ID, Zone-Zuordnung
   - Antwort: Bestätigung mit Konfiguration

3. **✅ Status-Monitoring**

   - Heartbeat-System: Alle 30 Sekunden
   - Offline-Detection: Nach 3 fehlenden Heartbeats
   - Status-Propagation: An alle verbundenen Clients

4. **✅ Zone-Management**

   - CRUD-Operationen für Zonen
   - ESP-Zuordnung zu Zonen
   - Zone-spezifische Logik

5. **✅ Konfigurations-Management**

   - GPIO-Konfiguration
   - Sensor/Aktor-Setup
   - Logik-Regeln

6. **✅ WebSocket-Integration**

   - Real-time Updates
   - Event-basierte Kommunikation
   - Connection-Management

7. **✅ Fehlerbehandlung**
   - Error-Logging
   - Recovery-Mechanismen
   - Benachrichtigungssystem

## 🎯 **ZUSAMMENFASSUNG**

Das Mindmap-System erwartet vom Backend:

1. **Hierarchische Struktur**: God → Kaiser → Zone → ESP
2. **MQTT-basierte Kommunikation**: Für alle ESP-Interaktionen
3. **Real-time Updates**: Über WebSocket für UI-Updates
4. **Konfigurations-Management**: Für ESP-Setup und -Verwaltung
5. **Status-Monitoring**: Für System-Gesundheit
6. **Fehlerbehandlung**: Für robuste Systemoperation

**Wichtig**: Alle ESPs müssen sich über das MQTT-Protokoll registrieren und ihre Status-Updates senden. Das Mindmap-System zeigt diese Daten in Echtzeit an und ermöglicht die Konfiguration über modale Overlays.
