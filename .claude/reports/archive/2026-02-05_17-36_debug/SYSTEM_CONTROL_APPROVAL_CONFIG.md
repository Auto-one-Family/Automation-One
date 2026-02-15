# SYSTEM_CONTROL: ESP_472204 Approval & SHT31 Config

**Timestamp:** 2026-02-05 17:54-17:57 UTC
**Operator:** system-control
**Target Device:** ESP_472204

---

## 1. Login

| Parameter | Wert |
|-----------|------|
| Endpoint | POST /api/v1/auth/login |
| Username | admin |
| Status | **SUCCESS** |
| Token Type | Bearer JWT |
| Expires In | 1800s |

---

## 2. Device Approval

| Parameter | Wert |
|-----------|------|
| Endpoint | POST /api/v1/esp/devices/ESP_472204/approve |
| Status | **SUCCESS** |
| Previous State | pending_approval |
| New State | approved → online |
| Approved By | admin |
| Approved At | 2026-02-05T17:54:21.893063Z |

**Approval Request Body:**
```json
{
  "name": "Greenhouse Sensor 1",
  "zone_id": "greenhouse",
  "zone_name": "Greenhouse"
}
```

**MQTT Heartbeat ACK nach Approval:**
```json
{"status": "online", "config_available": false, "server_time": 1770314122}
```

---

## 3. SHT31 Sensor Konfiguration

| Parameter | Wert |
|-----------|------|
| Endpoint | POST /api/v1/sensors/ESP_472204/21 |
| DB Status | **SUCCESS** (Sensor in DB angelegt) |
| ESP Config | **FAILED** (GPIO-Konflikt) |

**Request Body:**
```json
{
  "esp_id": "ESP_472204",
  "gpio": 21,
  "sensor_type": "temperature",
  "name": "SHT31 Temp/Humidity",
  "enabled": true,
  "interval_ms": 30000,
  "interface_type": "I2C",
  "i2c_address": 68,
  "provides_values": ["sht31_temp", "sht31_humidity"]
}
```

**Server Response (DB angelegt):**
```json
{
  "id": "dd5223e5-3e5d-4428-8dbb-ec265570efbe",
  "esp_device_id": "ESP_472204",
  "gpio": 21,
  "sensor_type": "temperature",
  "name": "SHT31 Temp/Humidity",
  "interface_type": "I2C",
  "i2c_address": 68,
  "provides_values": ["sht31_temp", "sht31_humidity"]
}
```

---

## 4. Config-Push via MQTT

**Topic:** `kaiser/god/esp/ESP_472204/config`

**Payload:**
```json
{
  "sensors": [{
    "gpio": 21,
    "sensor_type": "temperature",
    "sensor_name": "SHT31 Temp/Humidity",
    "subzone_id": "",
    "active": true,
    "sample_interval_ms": 30000,
    "raw_mode": true,
    "operating_mode": "continuous",
    "measurement_interval_seconds": 30,
    "interface_type": "I2C",
    "onewire_address": "",
    "i2c_address": 68
  }],
  "actuators": [],
  "correlation_id": "fcf6fced-f95c-4d17-8641-4f87e66e4a78",
  "timestamp": 1770314155
}
```

---

## 5. ESP32 Config Response - ERROR

**Topic:** `kaiser/god/esp/ESP_472204/config_response`

**Error Response:**
```json
{
  "status": "error",
  "type": "sensor",
  "count": 0,
  "failed_count": 1,
  "message": "All 1 item(s) failed to configure",
  "failures": [{
    "type": "sensor",
    "gpio": 21,
    "error_code": 1002,
    "error": "GPIO_CONFLICT",
    "detail": "GPIO 21 already used by system (I2C_SDA)"
  }],
  "correlation_id": "fcf6fced-f95c-4d17-8641-4f87e66e4a78"
}
```

**System Error Event:**
```json
{
  "error_code": 1002,
  "severity": 2,
  "category": "HARDWARE",
  "message": "GPIO conflict for sensor",
  "context": {"esp_id": "ESP_472204", "uptime_ms": 397324}
}
```

---

## 6. Root Cause Analysis

### Problem
Der ESP32 reserviert GPIO 21 und 22 für den I2C-Bus (SDA/SCL). Wenn ein I2C-Sensor mit `gpio: 21` konfiguriert wird, erkennt der ESP32 dies als GPIO-Konflikt.

### ESP32 GPIO-Status (aus Heartbeat)
```json
[
  {"gpio": 4, "owner": "bus/onewire/4", "component": "OneWireBus"},
  {"gpio": 21, "owner": "system", "component": "I2C_SDA"},
  {"gpio": 22, "owner": "system", "component": "I2C_SCL"}
]
```

### Architektur-Problem
- **Server:** Sendet `gpio: 21` für I2C-Sensor (SDA-Pin)
- **ESP32:** Reserviert GPIO 21/22 als System-Pins für I2C-Bus
- **Konflikt:** ESP32 erwartet, dass I2C-Sensoren NICHT mit physischen Bus-Pins konfiguriert werden

### Erwartetes Verhalten bei I2C-Sensoren
I2C-Sensoren sollten vermutlich mit:
- `gpio: 0` oder `gpio: null` (kein dedizierter GPIO)
- `i2c_address: 68` als eindeutiger Identifier

konfiguriert werden, da sie den gemeinsamen I2C-Bus nutzen.

---

## 7. Aktueller Status

| Metrik | Wert |
|--------|------|
| Device Status | **online** |
| Device in DB | Ja (approved) |
| Sensor in DB | Ja (1 Sensor) |
| Sensor auf ESP | **Nein** (0 Sensoren, Config rejected) |
| Sensor-Daten | **Keine** (latest_value: null) |

**Device Details:**
```json
{
  "device_id": "ESP_472204",
  "name": "Greenhouse Sensor 1",
  "zone_id": "greenhouse",
  "status": "online",
  "sensor_count": 1,
  "actuator_count": 0
}
```

---

## 8. Zusammenfassung

| Aufgabe | Status |
|---------|--------|
| Login | SUCCESS |
| Device Approval | SUCCESS |
| Sensor in DB | SUCCESS |
| Config-Push MQTT | SUCCESS |
| ESP32 Config Apply | **FAILED** (Error 1002: GPIO_CONFLICT) |
| Sensor-Daten | **KEINE** |

---

## 9. Empfohlene Aktionen

1. **Code-Fix erforderlich:** I2C-Sensoren sollten `gpio: 0` oder spezielles Handling für Bus-basierte Sensoren erhalten
2. **Betroffene Dateien:**
   - `El Servador/god_kaiser_server/src/services/config_builder.py` (Config-Generierung)
   - `El Trabajante/src/managers/sensor_manager.cpp` (GPIO-Validierung)
3. **Workaround:** Sensor mit `gpio: 0` konfigurieren (falls unterstützt)

---

**Report Ende**
