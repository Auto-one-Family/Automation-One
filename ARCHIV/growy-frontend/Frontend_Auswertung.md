# 🧭 **VOLLSTÄNDIGE MQTT-KOMMUNIKATIONSDOKUMENTATION - Growy Frontend v3.6.0**

## 📋 **1. VOLLSTÄNDIGE TOPIC-DOKUMENTATION**

### 📥 **SUBSCRIBE TOPICS (Frontend empfängt)**

#### **Essential Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/heartbeat",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (15-60s Zyklus)",
  "payload": {
    "esp_id": "esp32_001",
    "timestamp": 1703123456789,
    "state": "NORMAL",
    "system_state": "NORMAL",
    "uptime_seconds": 86400,
    "free_heap": 123456,
    "wifi_rssi": -45,
    "active_sensors": 5,
    "mqtt_connected": true,
    "hardware_mode": true,
    "raw_mode": false,
    "time_quality": "excellent",
    "warnings": [],
    "iso_timestamp": "2023-12-21T10:30:45.123Z",
    "kaiser_id": "raspberry_pi_central",
    "kaiser_id_changed": false,
    "esp_id_changed": false,
    "master_zone_changed": false,
    "subzone_changed": false,
    "previous_kaiser_id": null,
    "kaiser_id_change_timestamp": null,
    "advanced_features": ["i2c_support", "pi_integration"],
    "network": {
      "wifi_connected": true,
      "wifi_reconnects": 2,
      "mqtt_reconnects": 1
    },
    "broker_ip": "192.168.1.100",
    "broker_port": 1883
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/status",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Zustand-Änderung)",
  "payload": {
    "esp_id": "esp32_001",
    "timestamp": 1703123456789,
    "state": "NORMAL",
    "system_state": "NORMAL",
    "webserver_active": true,
    "safe_mode": false,
    "emergency_stop": false,
    "hardware_mode": true,
    "raw_mode": false,
    "time_quality": "excellent",
    "warnings": [],
    "iso_timestamp": "2023-12-21T10:30:45.123Z",
    "kaiser_id": "raspberry_pi_central",
    "kaiser_id_changed": false,
    "esp_id_changed": false,
    "master_zone_changed": false,
    "subzone_changed": false,
    "previous_kaiser_id": null,
    "kaiser_id_change_timestamp": null,
    "health_summary": {
      "free_heap_current": 123456,
      "free_heap_minimum": 100000,
      "uptime_seconds": 86400,
      "cpu_usage_percent": 15
    }
  }
}
```

#### **Sensor Data Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (2-30s Zyklus je Sensor)",
  "payload": {
    "esp_id": "esp32_001",
    "gpio": 21,
    "value": 23.5,
    "unit": "°C",
    "type": "SENSOR_TEMP_DS18B20",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z",
    "quality": "excellent",
    "raw_value": 235,
    "raw_mode": false,
    "hardware_mode": true,
    "warnings": [],
    "time_quality": "excellent",
    "context": "temperature_reading",
    "sensor": "DS18B20_001",
    "kaiser_id": "raspberry_pi_central",
    "zone_id": "greenhouse_1",
    "sensor_name": "Temperatur Sensor 1",
    "subzone_id": "zone_a",
    "sensor_type": "SENSOR_CUSTOM_PI_ENHANCED",
    "i2c_address": "0x48",
    "sensor_hint": "temperature",
    "raw_data": [0x12, 0x34, 0x56],
    "data_length": 3
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/master/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (hierarchische Struktur)",
  "payload": {
    "esp_id": "esp32_001",
    "master_zone_id": "greenhouse_master",
    "subzone_id": "zone_a",
    "gpio": 21,
    "value": 23.5,
    "unit": "°C",
    "type": "SENSOR_TEMP_DS18B20",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z",
    "quality": "excellent",
    "raw_value": 235,
    "raw_mode": false,
    "hardware_mode": true,
    "warnings": [],
    "time_quality": "excellent",
    "context": "temperature_reading",
    "sensor": "DS18B20_001",
    "kaiser_id": "raspberry_pi_central",
    "zone_id": "greenhouse_1",
    "sensor_name": "Temperatur Sensor 1"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/sensor_data",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (Legacy Backend v3.5.0)",
  "payload": {
    "esp_id": "esp32_001",
    "gpio": 21,
    "value": 23.5,
    "unit": "°C",
    "type": "SENSOR_TEMP_DS18B20",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z",
    "quality": "excellent",
    "raw_value": 235,
    "raw_mode": false,
    "hardware_mode": true,
    "warnings": [],
    "time_quality": "excellent",
    "context": "temperature_reading",
    "sensor": "DS18B20_001",
    "kaiser_id": "raspberry_pi_central",
    "zone_id": "greenhouse_1",
    "sensor_name": "Temperatur Sensor 1",
    "subzone_id": "zone_a"
  }
}
```

#### **Actuator Status Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Zustand-Änderung)",
  "payload": {
    "esp_id": "esp32_001",
    "gpio": 5,
    "type": "ACTUATOR_RELAY",
    "name": "Pumpe 1",
    "status": "active",
    "state": true,
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Fehlern)",
  "payload": {
    "esp_id": "esp32_001",
    "gpio": 5,
    "type": "ACTUATOR_RELAY",
    "name": "Pumpe 1",
    "alert_type": "overload",
    "message": "Aktor überlastet",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

#### **Health & Monitoring Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/health/broadcast",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (periodisch)",
  "payload": {
    "esp_id": "esp32_001",
    "timestamp": 1703123456789,
    "health": {
      "free_heap_current": 123456,
      "free_heap_minimum": 100000,
      "uptime_seconds": 86400,
      "cpu_usage_percent": 15
    },
    "network": {
      "wifi_connected": true,
      "wifi_rssi": -45,
      "wifi_reconnects": 2,
      "mqtt_connected": true,
      "mqtt_reconnects": 1
    },
    "devices": {
      "active_sensors": 5,
      "sensor_failures": 0,
      "active_actuators": 3,
      "actuator_failures": 0,
      "pi_available": true
    },
    "errors": {
      "total_errors": 2,
      "last_error": "Sensor timeout",
      "last_error_age_ms": 300000
    }
  }
}
```

#### **Library Management Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/library/ready",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Library-Bereitschaft)",
  "payload": {
    "esp_id": "esp32_001",
    "library_name": "DHT22",
    "version": "1.0.0",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/library/installed",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (nach Installation)",
  "payload": {
    "esp_id": "esp32_001",
    "library_name": "DHT22",
    "version": "1.0.0",
    "checksum": "abc123def456",
    "install_success": true,
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/library/error",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Library-Fehlern)",
  "payload": {
    "esp_id": "esp32_001",
    "library_name": "DHT22",
    "error_type": "installation_failed",
    "error_message": "Library konnte nicht installiert werden",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

#### **Error & Alert Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/alert/error",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Fehlern)",
  "payload": {
    "esp_id": "esp32_001",
    "error_type": "sensor_failure",
    "component": "DS18B20_001",
    "message": "Sensor antwortet nicht",
    "context": "temperature_reading",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

#### **Safe Mode Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/safe_mode",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Safe Mode Änderung)",
  "payload": {
    "esp_id": "esp32_001",
    "safe_mode": true,
    "safe_pins": [5, 6, 7],
    "total_available_pins": 12,
    "pins_in_safe_mode": 3,
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

#### **Broadcast Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/broadcast/emergency",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei Notfällen)",
  "payload": {
    "message": "Emergency situation detected",
    "severity": "critical",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/broadcast/system_update",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (bei System-Updates)",
  "payload": {
    "message": "System update available",
    "version": "3.6.0",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

#### **Zone Response Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/zone/response",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (nach Zone-Konfiguration)",
  "payload": {
    "esp_id": "esp32_001",
    "status": "success",
    "kaiser_zone": "raspberry_pi_central",
    "master_zone": "greenhouse_master",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/subzone/response",
  "type": "subscribe",
  "qos": 1,
  "trigger": "ESP publish (nach Subzone-Konfiguration)",
  "payload": {
    "esp_id": "esp32_001",
    "status": "success",
    "subzones": [
      {
        "id": "zone_a",
        "name": "Zone A",
        "description": "Hauptgewächshaus"
      }
    ],
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

#### **Pi Integration Topics (QoS 1)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/status",
  "type": "subscribe",
  "qos": 1,
  "trigger": "Pi publish (Status-Updates)",
  "payload": {
    "esp_id": "esp32_001",
    "pi_id": "default",
    "status": "connected",
    "url": "http://192.168.1.100:8080",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/health",
  "type": "subscribe",
  "qos": 1,
  "trigger": "Pi publish (Health-Updates)",
  "payload": {
    "esp_id": "esp32_001",
    "pi_id": "default",
    "health": {
      "cpu_usage": 15.5,
      "memory_usage": 45.2,
      "disk_usage": 23.1,
      "uptime": 86400
    },
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/sensor/{sensor_id}/statistics",
  "type": "subscribe",
  "qos": 1,
  "trigger": "Pi publish (Sensor-Statistiken)",
  "payload": {
    "esp_id": "esp32_001",
    "pi_id": "default",
    "sensor_id": "temp_001",
    "statistics": {
      "avg_value": 23.5,
      "min_value": 18.2,
      "max_value": 28.7,
      "readings_count": 1440,
      "period_hours": 24
    },
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/library/response",
  "type": "subscribe",
  "qos": 1,
  "trigger": "Pi publish (Library-Antworten)",
  "payload": {
    "esp_id": "esp32_001",
    "pi_id": "default",
    "library_name": "DHT22",
    "action": "installed",
    "success": true,
    "message": "Library erfolgreich installiert",
    "timestamp": 1703123456789,
    "iso_timestamp": "2023-12-21T10:30:45.123Z"
  }
}
```

#### **Discovery Topics (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/discovery/esp32_nodes",
  "type": "subscribe",
  "qos": 0,
  "trigger": "ESP publish (bei Netzwerkscan)",
  "payload": {
    "scanner_id": "esp32_scanner_001",
    "timestamp": 1703123456789,
    "discovery_type": "normal",
    "id_generated": false,
    "esp_id": "esp32_001",
    "kaiser_id": "raspberry_pi_central",
    "master_zone_id": "greenhouse_master",
    "subzone_id": "zone_a",
    "esp_username": "esp32_001",
    "esp_friendly_name": "Gewächshaus ESP",
    "esp_zone": "greenhouse_1",
    "connection_established": true,
    "board_type": "ESP32_DEVKIT",
    "chip_model": "ESP32",
    "firmware_version": "3.5.0",
    "broker_ip": "192.168.1.100",
    "broker_port": 1883,
    "http_port": 8080,
    "server_address": "192.168.1.100",
    "subzone_ids": ["zone_a", "zone_b"]
  }
}
```

#### **Config Topics (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/config",
  "type": "subscribe",
  "qos": 0,
  "trigger": "ESP publish (nach Konfiguration)",
  "payload": {
    "esp_id": "esp32_001",
    "timestamp": 1703123456789,
    "kaiser_id": "raspberry_pi_central",
    "esp_username": "esp32_001",
    "esp_friendly_name": "Gewächshaus ESP",
    "esp_zone": "greenhouse_1",
    "esp_password": "password123",
    "connection_established": true,
    "broker_ip": "192.168.1.100",
    "broker_port": 1883,
    "http_port": 8080,
    "server_address": "192.168.1.100",
    "hardware_mode": true,
    "raw_mode": false,
    "raw_value": null,
    "time_quality": "excellent",
    "warnings": [],
    "context": null,
    "kaiser_id_changed": false,
    "esp_id_changed": false
  }
}
```

### 📤 **PUBLISH TOPICS (Frontend sendet)**

#### **System Commands (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/system/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Admin-Panel)",
  "payload": {
    "command": "restart",
    "data": {},
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0",
    "hardware_mode": true,
    "raw_mode": false,
    "time_quality": "excellent",
    "warnings": [],
    "context": null,
    "kaiser_id_changed": false,
    "esp_id_changed": false
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/system/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Safe Mode)",
  "payload": {
    "command": "safe_mode",
    "data": {
      "enabled": true
    },
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/system/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Status Request)",
  "payload": {
    "command": "get_status",
    "data": {},
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/system/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Health Check)",
  "payload": {
    "command": "get_health",
    "data": {},
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/system/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Actuator Config)",
  "payload": {
    "command": "configure_actuator",
    "data": {
      "gpio": 5,
      "type": "ACTUATOR_RELAY",
      "name": "Pumpe 1",
      "subzone_id": "zone_a"
    },
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/system/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Remove Actuator)",
  "payload": {
    "command": "remove_actuator",
    "data": {
      "gpio": 5,
      "reason": "maintenance"
    },
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Actuator Commands (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Button Click)",
  "payload": {
    "command": "set_value",
    "value": true,
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Toggle)",
  "payload": {
    "command": "toggle",
    "value": null,
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Emergency Commands (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/emergency",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Emergency Button)",
  "payload": {
    "emergency_stop": true,
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/emergency",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Clear Emergency)",
  "payload": {
    "emergency_stop": false,
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Pi Commands (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Pi Management)",
  "payload": {
    "command": "get_status",
    "data": {},
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Pi URL Set)",
  "payload": {
    "command": "set_url",
    "data": {
      "url": "http://192.168.1.100:8080"
    },
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Pi Sensor Config)",
  "payload": {
    "command": "configure_sensor",
    "data": {
      "gpio": 21,
      "type": "SENSOR_TEMP_DS18B20",
      "name": "Temperatur Sensor 1",
      "subzone_id": "zone_a"
    },
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Pi Library Install)",
  "payload": {
    "command": "install_library",
    "data": {
      "name": "DHT22",
      "code": "library code here",
      "version": "1.0.0"
    },
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Pi Sensor Remove)",
  "payload": {
    "command": "remove_sensor",
    "data": {
      "gpio": 21,
      "reason": "maintenance"
    },
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Pi Statistics)",
  "payload": {
    "command": "get_sensor_statistics",
    "data": {},
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Pi Health Check)",
  "payload": {
    "command": "health_check",
    "data": {},
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **I2C Configuration (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/sensor/config",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (I2C Config)",
  "payload": {
    "esp_id": "esp32_001",
    "sensors": [
      {
        "gpio": 21,
        "type": "SENSOR_CUSTOM_PI_ENHANCED",
        "i2c_address": "0x48",
        "sensor_hint": "temperature",
        "subzone_id": "zone_a",
        "name": "I2C Temperatur Sensor"
      }
    ],
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/i2c/scan",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (I2C Scan)",
  "payload": {
    "command": "scan_i2c_devices",
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Zone Configuration (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/zone/config",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Zone Config)",
  "payload": {
    "esp_id": "esp32_001",
    "kaiser_zone": "raspberry_pi_central",
    "master_zone": "greenhouse_master",
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/subzone/config",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Subzone Config)",
  "payload": {
    "esp_id": "esp32_001",
    "subzones": [
      {
        "id": "zone_a",
        "name": "Zone A",
        "description": "Hauptgewächshaus"
      }
    ],
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Actuator Config (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/actuator/config",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Actuator Config)",
  "payload": {
    "esp_id": "esp32_001",
    "actuators": [
      {
        "gpio": 5,
        "type": "ACTUATOR_RELAY",
        "name": "Pumpe 1",
        "subzone_id": "zone_a"
      }
    ],
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Health Request (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/health/request",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Health Request)",
  "payload": {
    "request_type": "full_health_check",
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Library Request (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/library/request",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Library Request)",
  "payload": {
    "library_name": "DHT22",
    "action": "install",
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Error Acknowledge (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/error/acknowledge",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Error Acknowledge)",
  "payload": {
    "error_id": "error_001",
    "acknowledged": true,
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **System Diagnostics (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Diagnostics)",
  "payload": {
    "diagnostic_type": "full_system",
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

#### **Config Request (QoS 0)**

```json
{
  "topic": "kaiser/{kaiser_id}/config/request",
  "type": "publish",
  "qos": 0,
  "trigger": "UI-Interaktion (Config Request)",
  "payload": {
    "request_type": "full_config",
    "timestamp": 1703123456789,
    "server_id": "growy_frontend_v3.6.0"
  }
}
```

## 🧠 **2. MQTT-TRIGGER-MATRIX**

| Funktion (im Code)                | Topic (Schema)                                                          | Trigger-Quelle        | Payload-Struktur (Beispiel)                      |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| sendSystemCommand                 | kaiser/{kaiser_id}/esp/{esp_id}/system/command                          | UI-Action, Automatik  | { command, data, timestamp, ... }                |
| sendActuatorCommand               | kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command                 | UI-Action (Button)    | { command, value, timestamp }                    |
| emergencyStop                     | kaiser/{kaiser_id}/esp/{esp_id}/emergency                               | UI-Action (Emergency) | { emergency_stop: true, timestamp }              |
| sendPiCommand                     | kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command                      | UI, Automatik         | { command, data, timestamp }                     |
| sendI2CConfiguration              | kaiser/{kaiser_id}/esp/{esp_id}/sensor/config                           | UI (I2C-Setup)        | { esp_id, sensors: [ ... ] }                     |
| sendI2CScanCommand                | kaiser/{kaiser_id}/esp/{esp_id}/i2c/scan                                | UI (I2C-Scan)         | { command: 'scan_i2c_devices', ... }             |
| configureZone (espManagement)     | kaiser/{kaiser_id}/esp/{esp_id}/zone/config                             | UI (Zone-Konfig)      | { esp_id, kaiser_zone, master_zone }             |
| configureSubzones (espManagement) | kaiser/{kaiser_id}/esp/{esp_id}/subzone/config                          | UI (Subzone-Konfig)   | { esp_id, subzones: [ ... ] }                    |
| publishDeviceData (Simulator)     | kaiser/{kaiser_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data | Simulation/Test       | { esp_id, subzone_id, sensor: {...}, timestamp } |

Alle Payloads werden dynamisch im jeweiligen Funktionsaufruf gebaut (siehe src/stores/mqtt.js, src/stores/espManagement.js, src/components/debug/DeviceSimulator.vue).

---

## ⏱ 3. REAKTIONSVERHALTEN / TIMING

- **Sensor-Daten:**
  - Empfangszyklus: 2–30s (abhängig vom Sensor/ESP)
  - Verarbeitung: <300ms nach Empfang (`handleSensorData` → State → UI)
  - Vue-Update erfolgt synchron nach State-Änderung
- **Heartbeat/Status:**
  - Heartbeat: alle 15–60s
  - Statusänderung: <1s nach Empfang
- **Konfiguration/Commands:**
  - Publish: sofort bei Nutzeraktion
  - Response/ACK: erwartet <500ms (Timeout-Handling im UI, keine harte Abbruchlogik im Store)
- **Timeout/Fehler:**
  - ESP wird nach 5min ohne Heartbeat automatisch auf offline gesetzt (`checkEspTimeouts`)
  - Fehlerhafte MQTT-Operationen werden im UI angezeigt (Snackbar)
- **Realtime-Garantie:**
  - MQTT.js + Vue State sorgen für <1s End-to-End-Latenz bei normaler Verbindung

---

## 🔄 4. ID-WECHSEL-SZENARIEN

- **kaiser_id_changed:**
  - Erkenntnis im Payload (z.B. `kaiser_id_changed: true`)
  - Topics werden automatisch resubscribt (`syncTopicsForKaiserIdChange`)
  - UI zeigt Info/Warning, alter Zustand wird entladen
- **esp_id_changed, subzone_changed, master_zone_changed:**
  - Erkennung über Payload-Felder
  - Konflikt-Handler (`handleIdConflict`) speichert Konflikt, UI zeigt Warnung
  - Auflösung per UI-Action (adopt/ignore) → sendSystemCommand mit neuem Wert
  - Nach erfolgreichem adopt: lokale Speicherung, Topics werden ggf. angepasst

---

## 🧪 5. KONFIGURATION & SYSTEM-KOMMANDOS

- **system/command:**
  - Kommandos: restart, safe_mode, get_status, get_health, configure_zone, add_subzone, configure_actuator, remove_actuator, ...
  - Payload: { command: '...', data: {...}, timestamp }
- **config:**
  - Senden: kaiser/{kaiser_id}/esp/{esp_id}/config
  - Payload: { esp_id, esp_username, esp_friendly_name, esp_zone, ... }
- **Reaktion auf response/diagnostics/emergency/safe_mode/library/**
  - Siehe Handler in mqtt.js: handleSystemResponse, handleSystemDiagnostics, handleEmergency, handleSafeModeMessage, handleLibraryMessage
  - UI-Feedback via Snackbar, State-Update

---

## 💾 6. PI-INTERFACE-DOKUMENTATION

- **Topics:**
  - kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command (publish)
  - kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/status, .../response, .../health, .../sensor/{sensor_id}/statistics (subscribe)
- **Commands:**
  - get_status, set_url, configure_sensor, install_library, remove_sensor, get_sensor_statistics, health_check
- **Payloads:**
  - publish: { command, data, timestamp }
  - subscribe: { status, health, statistics, ... } (siehe handlePiMessage)
- **Trigger:**
  - UI-Action (z.B. Pi-Konfig), Automatik (z.B. Health-Check)
  - Backend-Prozesse: z.B. automatische Synchronisation nach Sensor-Konfig

---

**ENDE DER DOKUMENTATION – Stand: v3.6.0**
