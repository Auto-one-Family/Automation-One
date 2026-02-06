# SERVER DEBUG: Config-Push Verifikation

**Datum:** 2026-02-05 19:14 UTC+1
**Agent:** server-debug
**Kontext:** ESP_472204 SHT31-Sensor Config-Push Analyse

---

## 1. Executive Summary

| Aspekt | Status | Details |
|--------|--------|---------|
| Config-Push vom Server | OK | Config wurde korrekt gebaut und via MQTT gesendet |
| MQTT Delivery | OK | Message wurde erfolgreich an Broker publiziert |
| ESP32 Config-Response | FAILED | ESP hat mit CONFIG_FAILED geantwortet |
| Sensor hat Daten | NEIN | Keine Sensor-Readings empfangen |
| **Root Cause** | **GPIO 0 ist ungeeignet für I2C-Sensor** | GPIO 0 = Boot-Strapping Pin |

---

## 2. Chronologische Ereignisse (18:03:28 - 18:03:36)

### 2.1 Sensor Delete (alter Sensor GPIO 21)
```
18:03:28 - Sensor deleted: ESP_472204 GPIO 21 by admin
18:03:28 - Built config payload for ESP_472204: 0 sensors, 0 actuators
18:03:28 - Publishing config to ESP_472204: 0 sensor(s), 0 actuator(s)
18:03:28 - Config published successfully to ESP_472204
```

### 2.2 Neuer Sensor Create (GPIO 0, I2C Address 68)
```
18:03:35 - Sensor created: ESP_472204 GPIO 0 by admin
18:03:35 - Built config payload for ESP_472204: 1 sensors, 0 actuators
18:03:35 - Publishing config to ESP_472204: 1 sensor(s), 0 actuator(s)
18:03:35 - Config published successfully to ESP_472204
18:03:35 - Config sent to ESP_472204: ['sensors', 'actuators']
```

### 2.3 ESP32 Config-Response (FAILURE)
```
18:03:36 - Error event saved: id=7ed20845..., esp_id=ESP_472204, error_code=1002, severity=error
18:03:36 - Config FAILED on ESP_472204: sensor - All 1 item(s) failed to configure
18:03:36 -    GPIO 0: CONFIG_FAILED - Failed to configure sensor on GPIO 0
18:03:36 - Processing config failure: ESP_472204 sensor GPIO 0 - CONFIG_FAILED
18:03:36 - Processed 1 config failures for ESP_472204
```

---

## 3. Sensor-Status in Datenbank

```
Sensor ID:      8ab79dfd-7cb3-41d4-95ce-0f11114b507c
ESP ID:         6fde94fc-3985-4e98-a3df-888e44ee25ac
Device ID:      ESP_472204
GPIO:           0
Sensor Type:    temperature
I2C Address:    68 (= 0x44 hex)
Config Status:  FAILED
Config Error:   CONFIG_FAILED
Latest Value:   NULL (keine Daten)
Last Reading:   NULL (nie)
Enabled:        true
```

---

## 4. Config-Push Mechanismus

### 4.1 Automatischer Push
Der Server pusht Config **automatisch** nach CRUD-Operationen:
- Nach Sensor create/update/delete
- Nach Actuator create/update/delete
- **Kein manueller Endpoint notwendig**

### 4.2 Flow
```
1. API Endpoint (POST /api/v1/sensors/{esp_id}/{gpio})
2. SensorRepository.create()
3. ConfigPayloadBuilder.build_combined_config()
4. ConfigMappingEngine.apply_sensor_mapping()
5. Publisher.publish_config() → MQTT Topic
6. ESP32 empfängt → ConfigManager::processConfig()
7. ESP32 sendet config_response → Server
8. ConfigHandler.handle_config_ack() → DB Update
```

### 4.3 Gesendetes Config-Payload (rekonstruiert)
```json
{
  "sensors": [
    {
      "sensor_name": "...",
      "sensor_type": "temperature",
      "gpio": 0,
      "active": true,
      "sample_interval_ms": 30000,
      "i2c_address": 68,
      "raw_mode": true
    }
  ],
  "actuators": [],
  "timestamp": 1738778615
}
```

---

## 5. Heartbeat GPIO-Mismatch Warnings

Kontinuierliche Warnings alle 60 Sekunden:
```
GPIO status item 0 validation failed for ESP_472204: 1 validation error for GpioStatusItem
GPIO count mismatch for ESP_472204: reported=3, actual=2
```

**Bedeutung:**
- ESP meldet 3 GPIOs im Heartbeat (vermutlich physisch angeschlossene Hardware)
- Server kennt nur 2 GPIOs (konfigurierte Sensoren/Aktoren)
- Das ist ein separates Problem, nicht direkt mit Config-Failure verbunden

---

## 6. Root Cause Analyse

### 6.1 GPIO 0 Problem
**GPIO 0 ist ein Boot-Strapping Pin auf ESP32:**
- Wird bei Boot geprüft um Modus zu bestimmen (Flash vs. Run)
- Muss beim Boot HIGH sein für normale Ausführung
- **Nicht für allgemeinen I/O geeignet**, insbesondere nicht für I2C

### 6.2 Korrekte GPIO-Konfiguration für SHT31
SHT31 ist ein I2C-Sensor. Standard ESP32 I2C Pins:
- **SDA:** GPIO 21
- **SCL:** GPIO 22

Alternative I2C Pins (ESP32 erlaubt beliebige GPIOs für Software-I2C):
- Vermeiden: GPIO 0, 1, 3, 6-11 (Boot/Flash/System)
- Empfohlen: GPIO 4, 5, 13-19, 21, 22, 23, 25-27, 32, 33

### 6.3 Error Code 1002 Bedeutung
```
1002 = CONFIG_FAILED (aus esp32_error_mapping.py)
Beschreibung: "Konfigurationsfehler auf dem ESP32"
```

Der ESP32 konnte den Sensor auf GPIO 0 nicht initialisieren, vermutlich weil:
1. GPIO 0 als Boot-Pin reserviert ist
2. I2C-Bus auf GPIO 0 nicht initialisierbar
3. Wire Library blockiert auf diesem Pin

---

## 7. Empfehlungen

### 7.1 Sofort-Fix
1. **Sensor auf korrekten GPIO umkonfigurieren:**
   ```bash
   # DELETE aktueller Sensor
   curl -X DELETE http://localhost:8000/api/v1/sensors/ESP_472204/0

   # CREATE mit korrektem GPIO (z.B. GPIO 21 für SDA)
   curl -X POST http://localhost:8000/api/v1/sensors/ESP_472204/21 \
     -H "Content-Type: application/json" \
     -d '{
       "sensor_type": "temperature",
       "sensor_name": "SHT31 Greenhouse",
       "i2c_address": 68,
       "sample_interval_ms": 30000
     }'
   ```

### 7.2 Frontend-Validierung
Im Frontend sollte GPIO-Auswahl für I2C-Sensoren auf empfohlene Pins beschränkt werden:
- GPIO 21 (SDA) - Standard
- GPIO 22 (SCL) - Standard
- Oder andere nicht-reservierte Pins

### 7.3 Server-seitige Validierung
Optional: GPIO-Validierung im `sensors.py` API Endpoint hinzufügen:
```python
RESTRICTED_GPIOS = {0, 1, 3, 6, 7, 8, 9, 10, 11}  # Boot/Flash pins
if gpio in RESTRICTED_GPIOS:
    raise HTTPException(400, f"GPIO {gpio} is reserved for system use")
```

---

## 8. Offene Fragen für ESP32-Debug

1. Warum meldet ESP 3 GPIOs im Heartbeat, Server kennt nur 2?
2. Was ist die tatsächliche Hardwarekonfiguration des ESP_472204?
3. Welche Firmware-Version läuft auf dem ESP? Unterstützt sie SHT31?

---

## 9. Zusammenfassung

| Komponente | Funktioniert | Problem |
|------------|--------------|---------|
| Server Config-Build | JA | - |
| MQTT Publish | JA | - |
| ESP32 Config-Receive | JA | - |
| ESP32 Sensor-Init | **NEIN** | GPIO 0 ist Boot-Pin, nicht I2C-fähig |
| Config-Response | JA | Failure korrekt gemeldet |
| DB Status Update | JA | config_status=failed gesetzt |
| Sensor Data Flow | **NEIN** | Keine Daten, da Sensor nicht initialisiert |

**Fazit:** Server-Seite funktioniert korrekt. Das Problem liegt in der Wahl von GPIO 0 für einen I2C-Sensor. Der Sensor muss auf einen geeigneten GPIO (z.B. 21) umkonfiguriert werden.

---

*Report erstellt von server-debug Agent*
