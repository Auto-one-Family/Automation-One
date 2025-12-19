# API Payload Examples - Frontend Views

**Erstellt:** 2025-12-19
**Letztes Update:** 2025-12-19
**Zweck:** Vollständige Payload-Beispiele für alle API-Calls

**API-Basis-URL:** `/api/v1` (via Frontend-Proxy zu Backend)
**Backend-Pfad:** `El Servador/god_kaiser_server/src/api/v1/`

---

## 1. Mock-ESP-Management

**Backend-Datei:** `debug.py`

### 1.1 Mock-ESP erstellen

**Endpoint:** `POST /api/v1/debug/mock-esp`

**Request:**
```json
{
  "esp_id": "ESP_MOCK_A1B2C3",
  "zone_id": "gewächshaus",
  "auto_heartbeat": true,
  "heartbeat_interval_seconds": 60,
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "DS18B20",
      "name": "Wassertemperatur",
      "subzone_id": "tank_1",
      "raw_value": 22.5,
      "unit": "°C",
      "quality": "good",
      "raw_mode": true
    },
    {
      "gpio": 21,
      "sensor_type": "SHT31",
      "name": "Luftfeuchtigkeit",
      "raw_value": 65.0,
      "unit": "%",
      "quality": "excellent",
      "raw_mode": true
    }
  ],
  "actuators": [
    {
      "gpio": 5,
      "actuator_type": "relay",
      "name": "Hauptpumpe",
      "state": false,
      "pwm_value": 0
    }
  ]
}
```

**Response:**
```json
{
  "id": 123,
  "esp_id": "ESP_MOCK_A1B2C3",
  "zone_id": "gewächshaus",
  "zone_name": "Gewächshaus",
  "master_zone_id": null,
  "hardware_type": "MOCK_ESP32_WROOM",
  "system_state": "OPERATIONAL",
  "connected": true,
  "uptime": 0,
  "heap_free": 245760,
  "wifi_rssi": -45,
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "DS18B20",
      "name": "Wassertemperatur",
      "subzone_id": "tank_1",
      "raw_value": 22.5,
      "unit": "°C",
      "quality": "good",
      "raw_mode": true
    },
    {
      "gpio": 21,
      "sensor_type": "SHT31",
      "name": "Luftfeuchtigkeit",
      "subzone_id": null,
      "raw_value": 65.0,
      "unit": "%",
      "quality": "excellent",
      "raw_mode": true
    }
  ],
  "actuators": [
    {
      "gpio": 5,
      "actuator_type": "relay",
      "name": "Hauptpumpe",
      "state": false,
      "pwm_value": 0,
      "emergency_stopped": false
    }
  ],
  "auto_heartbeat": true,
  "heartbeat_interval_seconds": 60,
  "created_at": "2025-12-19T10:30:00Z",
  "updated_at": "2025-12-19T10:30:00Z"
}
```

### 1.2 Liste aller Mock-ESPs

**Endpoint:** `GET /api/v1/debug/mock-esp`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "esp_id": "ESP_MOCK_A1B2C3",
      "zone_id": "gewächshaus",
      "zone_name": "Gewächshaus",
      "system_state": "OPERATIONAL",
      "connected": true,
      "sensors": [...],
      "actuators": [...]
    },
    {
      "id": 124,
      "esp_id": "ESP_REAL_D4E5F6",
      "zone_id": "labor",
      "system_state": "SAFE_MODE",
      "connected": false,
      "sensors": [],
      "actuators": []
    }
  ],
  "total": 2
}
```

### 1.3 Heartbeat triggern

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/heartbeat`

**Response:**
```json
{
  "success": true,
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T10:35:00Z",
  "message_published": true,
  "payload": {
    "esp_id": "ESP_MOCK_A1B2C3",
    "uptime": 300,
    "heap_free": 242880,
    "wifi_rssi": -47,
    "system_state": "OPERATIONAL"
  }
}
```

### 1.4 System-State setzen

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/state`

**Request:**
```json
{
  "state": "SAFE_MODE",
  "reason": "Manueller Wechsel durch User"
}
```

**Response:**
```json
{
  "success": true,
  "message": "System state changed to SAFE_MODE",
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T10:40:00Z"
}
```

---

## 2. Sensor-Management

### 2.1 Sensor hinzufügen

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/sensors`

**Request:**
```json
{
  "gpio": 18,
  "sensor_type": "PH",
  "name": "pH-Sensor Tank 2",
  "subzone_id": "tank_2",
  "raw_value": 7.0,
  "unit": "pH",
  "quality": "good",
  "raw_mode": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sensor added successfully",
  "esp_id": "ESP_MOCK_A1B2C3"
}
```

### 2.2 Sensor-Wert setzen

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/sensors/:gpio`

**Request:**
```json
{
  "raw_value": 23.8,
  "quality": "excellent",
  "publish": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sensor value updated and published",
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T10:45:00Z"
}
```

### 2.3 Batch-Sensor-Update

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/sensors/batch`

**Request:**
```json
{
  "values": {
    "4": 22.7,
    "21": 68.5,
    "18": 7.2
  },
  "publish": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Batch sensor values updated and published",
  "esp_id": "ESP_MOCK_A1B2C3",
  "updated_count": 3,
  "timestamp": "2025-12-19T10:50:00Z"
}
```

### 2.4 Sensor entfernen

**Endpoint:** `DELETE /api/v1/debug/mock-esp/:espId/sensors/:gpio`

**Response:**
```json
{
  "success": true,
  "message": "Sensor removed from GPIO 18",
  "esp_id": "ESP_MOCK_A1B2C3"
}
```

---

## 3. Actuator-Management

### 3.1 Actuator hinzufügen

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/actuators`

**Request:**
```json
{
  "gpio": 19,
  "actuator_type": "pwm",
  "name": "Lüfter Geschwindigkeit",
  "state": false,
  "pwm_value": 0
}
```

**Response:**
```json
{
  "success": true,
  "message": "Actuator added successfully",
  "esp_id": "ESP_MOCK_A1B2C3"
}
```

### 3.2 Actuator-State setzen

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/actuators/:gpio`

**Request:**
```json
{
  "state": true,
  "pwm_value": 0.75,
  "publish": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Actuator state updated and published",
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T11:00:00Z"
}
```

### 3.3 Emergency-Stop

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/emergency-stop?reason=manual`

**Response:**
```json
{
  "success": true,
  "message": "Emergency stop triggered",
  "esp_id": "ESP_MOCK_A1B2C3",
  "stopped_actuators": 2,
  "timestamp": "2025-12-19T11:05:00Z"
}
```

### 3.4 Emergency aufheben

**Endpoint:** `POST /api/v1/debug/mock-esp/:espId/clear-emergency`

**Response:**
```json
{
  "success": true,
  "message": "Emergency cleared",
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T11:10:00Z"
}
```

---

## 4. Database-Explorer

### 4.1 Tabellen-Liste

**Endpoint:** `GET /api/v1/debug/db/tables`

**Response:**
```json
{
  "success": true,
  "tables": [
    "users",
    "esps",
    "sensors",
    "actuators",
    "sensor_readings",
    "actuator_commands",
    "audit_logs",
    "zones",
    "subzones"
  ]
}
```

### 4.2 Tabellen-Schema

**Endpoint:** `GET /api/v1/debug/db/esps/schema`

**Response:**
```json
{
  "success": true,
  "table_name": "esps",
  "columns": [
    {
      "name": "id",
      "type": "integer",
      "nullable": false,
      "primary_key": true
    },
    {
      "name": "esp_id",
      "type": "string",
      "nullable": false,
      "unique": true
    },
    {
      "name": "zone_id",
      "type": "string",
      "nullable": true
    },
    {
      "name": "hardware_type",
      "type": "string",
      "nullable": false
    },
    {
      "name": "is_mock",
      "type": "boolean",
      "nullable": false,
      "default": false
    },
    {
      "name": "created_at",
      "type": "datetime",
      "nullable": false
    },
    {
      "name": "updated_at",
      "type": "datetime",
      "nullable": false
    }
  ]
}
```

### 4.3 Tabellen-Daten abfragen

**Endpoint:** `GET /api/v1/debug/db/esps?page=1&page_size=50&sort_by=created_at&sort_order=desc&filters={"zone_id":"gewächshaus"}`

**Response:**
```json
{
  "success": true,
  "table": "esps",
  "data": [
    {
      "id": 123,
      "esp_id": "ESP_MOCK_A1B2C3",
      "zone_id": "gewächshaus",
      "hardware_type": "MOCK_ESP32_WROOM",
      "is_mock": true,
      "created_at": "2025-12-19T10:30:00Z",
      "updated_at": "2025-12-19T10:30:00Z"
    }
  ],
  "total_count": 1,
  "page": 1,
  "page_size": 50
}
```

### 4.4 Einzelner Record

**Endpoint:** `GET /api/v1/debug/db/esps/123`

**Response:**
```json
{
  "success": true,
  "table": "esps",
  "record": {
    "id": 123,
    "esp_id": "ESP_MOCK_A1B2C3",
    "zone_id": "gewächshaus",
    "hardware_type": "MOCK_ESP32_WROOM",
    "is_mock": true,
    "config": {
      "auto_heartbeat": true,
      "heartbeat_interval_seconds": 60
    },
    "created_at": "2025-12-19T10:30:00Z",
    "updated_at": "2025-12-19T10:30:00Z"
  }
}
```

---

## 5. Log-Viewer

### 5.1 Log-Dateien auflisten

**Endpoint:** `GET /api/v1/debug/logs/files`

**Response:**
```json
{
  "files": [
    {
      "name": "app.log",
      "size": 2048576,
      "size_human": "2.0 MB",
      "modified": "2025-12-19T11:00:00Z",
      "is_current": true
    },
    {
      "name": "app.log.1",
      "size": 5242880,
      "size_human": "5.0 MB",
      "modified": "2025-12-18T11:00:00Z",
      "is_current": false
    }
  ],
  "current_file": "app.log"
}
```

### 5.2 Logs abfragen

**Endpoint:** `GET /api/v1/debug/logs?level=ERROR&module=mqtt.handlers&search=connection&file=app.log&start_time=2025-12-19T00:00:00Z&end_time=2025-12-19T23:59:59Z&page=1&page_size=100`

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2025-12-19T10:15:23Z",
      "level": "ERROR",
      "logger": "mqtt.handlers.sensor_handler",
      "module": "sensor_handler",
      "function": "handle_sensor_data",
      "line": 145,
      "message": "Failed to process sensor data: Connection timeout",
      "exception": "TimeoutError: Connection timeout after 30s\n  at handle_sensor_data (sensor_handler.py:145)\n  at process_message (base_handler.py:78)",
      "extra": {
        "esp_id": "ESP_MOCK_A1B2C3",
        "gpio": 4,
        "sensor_type": "DS18B20"
      }
    }
  ],
  "total_count": 1,
  "has_more": false
}
```

---

## 6. User-Management

### 6.1 Alle Benutzer

**Endpoint:** `GET /v1/users`

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@auto-one.local",
      "role": "admin",
      "is_active": true,
      "created_at": "2025-12-01T08:00:00Z",
      "updated_at": "2025-12-01T08:00:00Z"
    },
    {
      "id": 2,
      "username": "operator1",
      "email": "operator@auto-one.local",
      "role": "operator",
      "is_active": true,
      "created_at": "2025-12-05T10:00:00Z",
      "updated_at": "2025-12-05T10:00:00Z"
    }
  ],
  "total": 2
}
```

### 6.2 Benutzer erstellen

**Endpoint:** `POST /v1/users`

**Request:**
```json
{
  "username": "viewer1",
  "email": "viewer@auto-one.local",
  "password": "SecurePassword123!",
  "role": "viewer"
}
```

**Response:**
```json
{
  "id": 3,
  "username": "viewer1",
  "email": "viewer@auto-one.local",
  "role": "viewer",
  "is_active": true,
  "created_at": "2025-12-19T11:30:00Z",
  "updated_at": "2025-12-19T11:30:00Z"
}
```

### 6.3 Benutzer aktualisieren

**Endpoint:** `PUT /v1/users/3`

**Request:**
```json
{
  "email": "new.viewer@auto-one.local",
  "role": "operator",
  "is_active": true
}
```

**Response:**
```json
{
  "id": 3,
  "username": "viewer1",
  "email": "new.viewer@auto-one.local",
  "role": "operator",
  "is_active": true,
  "created_at": "2025-12-19T11:30:00Z",
  "updated_at": "2025-12-19T11:35:00Z"
}
```

### 6.4 Passwort zurücksetzen (Admin)

**Endpoint:** `POST /v1/users/3/reset-password`

**Request:**
```json
{
  "new_password": "NewPassword456!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful for user viewer1"
}
```

### 6.5 Eigenes Passwort ändern

**Endpoint:** `POST /v1/users/me/change-password`

**Request:**
```json
{
  "current_password": "OldPassword123!",
  "new_password": "NewPassword789!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## 7. Load-Testing

### 7.1 Bulk-ESP-Erstellung

**Endpoint:** `POST /api/v1/debug/load-test/bulk-create`

**Request:**
```json
{
  "count": 10,
  "zone_id": "test_zone",
  "sensor_count": 3,
  "actuator_count": 2,
  "auto_heartbeat": true
}
```

**Response:**
```json
{
  "success": true,
  "created": [
    {
      "id": 200,
      "esp_id": "ESP_LOAD_000001",
      "zone_id": "test_zone",
      "sensors": [
        {"gpio": 4, "sensor_type": "DS18B20", "raw_value": 22.0},
        {"gpio": 21, "sensor_type": "SHT31", "raw_value": 60.0},
        {"gpio": 18, "sensor_type": "PH", "raw_value": 7.0}
      ],
      "actuators": [
        {"gpio": 5, "actuator_type": "relay", "state": false},
        {"gpio": 19, "actuator_type": "pwm", "state": false}
      ]
    }
  ],
  "total_created": 10,
  "failed": 0
}
```

### 7.2 Simulation starten

**Endpoint:** `POST /api/v1/debug/load-test/simulate`

**Request:**
```json
{
  "duration_seconds": 300,
  "sensor_interval": 5,
  "heartbeat_interval": 60,
  "esp_ids": ["ESP_LOAD_000001", "ESP_LOAD_000002"]
}
```

**Response:**
```json
{
  "success": true,
  "simulation_id": "sim_abc123",
  "started_at": "2025-12-19T12:00:00Z",
  "duration": 300,
  "participating_esps": 2
}
```

### 7.3 Metriken

**Endpoint:** `GET /api/v1/debug/load-test/metrics`

**Response:**
```json
{
  "total_mock_esps": 10,
  "total_sensors": 30,
  "total_actuators": 20,
  "messages_sent_last_minute": 125,
  "average_message_size": 256,
  "memory_usage": 15728640
}
```

### 7.4 Cleanup

**Endpoint:** `POST /api/v1/debug/load-test/cleanup`

**Response:**
```json
{
  "success": true,
  "deleted_count": 10
}
```

---

## 8. System-Config

### 8.1 Alle Config-Einträge

**Endpoint:** `GET /api/v1/debug/config?config_type=mqtt`

**Response:**
```json
{
  "success": true,
  "configs": [
    {
      "id": "1",
      "config_key": "mqtt.broker.host",
      "config_value": "localhost",
      "config_type": "mqtt",
      "description": "MQTT Broker Hostname",
      "is_secret": false,
      "created_at": "2025-12-01T08:00:00Z",
      "updated_at": "2025-12-01T08:00:00Z"
    },
    {
      "id": "2",
      "config_key": "mqtt.broker.port",
      "config_value": 1883,
      "config_type": "mqtt",
      "description": "MQTT Broker Port",
      "is_secret": false,
      "created_at": "2025-12-01T08:00:00Z",
      "updated_at": "2025-12-01T08:00:00Z"
    },
    {
      "id": "3",
      "config_key": "mqtt.broker.password",
      "config_value": "******",
      "config_type": "mqtt",
      "description": "MQTT Broker Password",
      "is_secret": true,
      "created_at": "2025-12-01T08:00:00Z",
      "updated_at": "2025-12-01T08:00:00Z"
    }
  ],
  "total": 3
}
```

### 8.2 Config-Wert aktualisieren

**Endpoint:** `PATCH /api/v1/debug/config/mqtt.broker.port`

**Request:**
```json
{
  "config_value": 1884
}
```

**Response:**
```json
{
  "id": "2",
  "config_key": "mqtt.broker.port",
  "config_value": 1884,
  "config_type": "mqtt",
  "description": "MQTT Broker Port",
  "is_secret": false,
  "created_at": "2025-12-01T08:00:00Z",
  "updated_at": "2025-12-19T12:30:00Z"
}
```

---

## 9. Audit-Log

### 9.1 Audit-Logs mit Filtern

**Endpoint:** `GET /v1/audit?event_type=user.login&severity=info&user_id=1&start_time=2025-12-01T00:00:00Z&end_time=2025-12-31T23:59:59Z&page=1&page_size=50`

**Response:**
```json
{
  "success": true,
  "logs": [
    {
      "id": 1234,
      "event_type": "user.login",
      "event_category": "user",
      "severity": "info",
      "user_id": 1,
      "esp_id": null,
      "description": "User 'admin' logged in successfully",
      "metadata": {
        "ip_address": "192.168.1.100",
        "user_agent": "Mozilla/5.0"
      },
      "created_at": "2025-12-19T12:00:00Z"
    }
  ],
  "total": 1,
  "has_more": false
}
```

### 9.2 Statistiken

**Endpoint:** `GET /v1/audit/statistics`

**Response:**
```json
{
  "total_logs": 5432,
  "by_severity": {
    "info": 4500,
    "warning": 800,
    "error": 120,
    "critical": 12
  },
  "by_category": {
    "user": 1200,
    "esp": 3500,
    "system": 500,
    "sensor": 150,
    "actuator": 82
  },
  "error_rate": {
    "last_hour": 2,
    "last_day": 18,
    "last_week": 132
  }
}
```

### 9.3 Retention-Config

**Endpoint:** `GET /v1/audit/retention`

**Response:**
```json
{
  "retention_days": 90,
  "auto_cleanup_enabled": true,
  "last_cleanup": "2025-12-18T02:00:00Z"
}
```

### 9.4 Retention aktualisieren

**Endpoint:** `PUT /v1/audit/retention`

**Request:**
```json
{
  "retention_days": 120,
  "auto_cleanup_enabled": true
}
```

**Response:**
```json
{
  "retention_days": 120,
  "auto_cleanup_enabled": true,
  "last_cleanup": "2025-12-18T02:00:00Z"
}
```

### 9.5 Manuelles Cleanup

**Endpoint:** `POST /v1/audit/cleanup`

**Response:**
```json
{
  "success": true,
  "deleted_count": 1234
}
```

---

## 10. WebSocket-Messages

### 10.1 Subscribe-Request

**Send:**
```json
{
  "action": "subscribe",
  "filters": {
    "types": ["sensor_data", "actuator_status", "esp_health"],
    "esp_ids": ["ESP_MOCK_A1B2C3"]
  }
}
```

### 10.2 Sensor-Data-Message

**Receive:**
```json
{
  "type": "sensor_data",
  "topic": "kaiser/god/esp/ESP_MOCK_A1B2C3/sensor/4/data",
  "payload": {
    "esp_id": "ESP_MOCK_A1B2C3",
    "gpio": 4,
    "sensor_type": "DS18B20",
    "raw_value": 23.5,
    "quality": "good",
    "raw_mode": true,
    "timestamp": "2025-12-19T12:45:00Z"
  },
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T12:45:00Z"
}
```

### 10.3 Actuator-Status-Message

**Receive:**
```json
{
  "type": "actuator_status",
  "topic": "kaiser/god/esp/ESP_MOCK_A1B2C3/actuator/5/status",
  "payload": {
    "esp_id": "ESP_MOCK_A1B2C3",
    "gpio": 5,
    "actuator_type": "relay",
    "state": true,
    "pwm_value": 0,
    "timestamp": "2025-12-19T12:46:00Z"
  },
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T12:46:00Z"
}
```

### 10.4 ESP-Health-Message

**Receive:**
```json
{
  "type": "esp_health",
  "topic": "kaiser/god/esp/ESP_MOCK_A1B2C3/system/heartbeat",
  "payload": {
    "esp_id": "ESP_MOCK_A1B2C3",
    "uptime": 3600,
    "heap_free": 240000,
    "wifi_rssi": -48,
    "system_state": "OPERATIONAL",
    "timestamp": "2025-12-19T12:47:00Z"
  },
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T12:47:00Z"
}
```

### 10.5 System-Event-Message

**Receive:**
```json
{
  "type": "system_event",
  "topic": "kaiser/god/system/event",
  "payload": {
    "event_type": "esp_disconnected",
    "esp_id": "ESP_MOCK_A1B2C3",
    "reason": "Connection timeout",
    "timestamp": "2025-12-19T12:48:00Z"
  },
  "esp_id": "ESP_MOCK_A1B2C3",
  "timestamp": "2025-12-19T12:48:00Z"
}
```

---

## 11. Auth-Endpoints

### 11.1 Login

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "username": "admin",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@auto-one.local",
    "role": "admin",
    "is_active": true
  }
}
```

### 11.2 Refresh-Token

**Endpoint:** `POST /auth/refresh`

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer"
}
```

### 11.3 Initial-Setup

**Endpoint:** `POST /auth/setup`

**Request:**
```json
{
  "username": "admin",
  "email": "admin@auto-one.local",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@auto-one.local",
    "role": "admin",
    "is_active": true
  }
}
```

---

**Ende API Payload Examples**
