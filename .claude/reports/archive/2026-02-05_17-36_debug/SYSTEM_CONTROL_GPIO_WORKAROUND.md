# SYSTEM_CONTROL: GPIO:0 Workaround Test für SHT31

**Timestamp:** 2026-02-05 18:03-18:35 UTC
**Operator:** system-control
**Target Device:** ESP_472204

---

## 1. Ausgangssituation

| Parameter | Wert |
|-----------|------|
| Problem | SHT31-Config mit gpio: 21 rejected (Error 1002: GPIO_CONFLICT) |
| Ursache | GPIO 21 ist als I2C_SDA vom System reserviert |
| Hypothese | I2C-Sensoren sollten mit gpio: 0 konfiguriert werden |

---

## 2. Durchgeführte Operationen

### 2.1 Login

| Parameter | Wert |
|-----------|------|
| Endpoint | POST /api/v1/auth/login |
| Username | admin |
| Status | **SUCCESS** |

### 2.2 Alter Sensor löschen

| Parameter | Wert |
|-----------|------|
| Endpoint | DELETE /api/v1/sensors/ESP_472204/21 |
| Sensor ID | dd5223e5-3e5d-4428-8dbb-ec265570efbe |
| Status | **SUCCESS** |

### 2.3 Neuer Sensor mit gpio: 0

| Parameter | Wert |
|-----------|------|
| Endpoint | POST /api/v1/sensors/ESP_472204/0 |
| Status | **SUCCESS** |

**Request Body:**
```json
{
  "esp_id": "ESP_472204",
  "gpio": 0,
  "sensor_type": "temperature",
  "name": "SHT31 Temp/Humidity",
  "enabled": true,
  "interval_ms": 30000,
  "interface_type": "I2C",
  "i2c_address": 68,
  "provides_values": ["sht31_temp", "sht31_humidity"]
}
```

**Response (Sensor erstellt):**
```json
{
  "id": "8ab79dfd-7cb3-41d4-95ce-0f11114b507c",
  "esp_id": "6fde94fc-3985-4e98-a3df-888e44ee25ac",
  "esp_device_id": "ESP_472204",
  "gpio": 0,
  "sensor_type": "temperature",
  "name": "SHT31 Temp/Humidity",
  "enabled": true,
  "interval_ms": 30000,
  "interface_type": "I2C",
  "i2c_address": 68,
  "provides_values": ["sht31_temp", "sht31_humidity"],
  "created_at": "2026-02-05T18:03:35.934715"
}
```

---

## 3. Code-Analyse: ESP32 sensor_manager.cpp

**Datei:** `El Trabajante/src/managers/sensor_manager.cpp` (Lines 249-306)

### Erkenntnisse

1. **I2C-Sensoren benötigen KEINE individuelle GPIO-Reservation**
   ```cpp
   // I2C Sensor: Use I2C bus, NO GPIO reservation needed
   // GPIO 21/22 are already reserved by I2CBusManager as "system"
   ```

2. **GPIO-Wert wird NUR für Logging verwendet:**
   ```cpp
   LOG_INFO("Configured I2C sensor at 0x" + String(i2c_address, HEX) +
            " (GPIO " + String(config.gpio) + " is I2C bus)");
   ```

3. **I2C-Adress-Conflict-Detection ist implementiert:**
   - Prüft ob Adresse bereits von anderem Sensor verwendet wird
   - Error Code: ERROR_I2C_ADDRESS_CONFLICT

4. **GPIO 21/22 sind global durch I2CBusManager reserviert:**
   - Keine per-Sensor GPIO-Reservation nötig
   - Alle I2C-Sensoren teilen den Bus

---

## 4. Ergebnis-Matrix

| Ebene | Status | Details |
|-------|--------|---------|
| API (Server) | **SUCCESS** | Sensor mit gpio: 0 in DB angelegt |
| MQTT Config-Push | **NICHT VERIFIZIERT** | mosquitto_sub nicht verfügbar |
| ESP32 Config-Apply | **NICHT VERIFIZIERT** | Serial Monitor nicht beobachtet |
| Sensor-Daten | **AUSSTEHEND** | Verifikation erforderlich |

---

## 5. Empfehlung für I2C-Sensoren

### Best Practice: `gpio: 0` verwenden

**Begründung:**
- Vermeidet GPIO-Conflicts mit GPIO 21/22
- Klare Semantik: "Bus-Sensor, kein dedizierter GPIO"
- Server akzeptiert `gpio: 0` ohne Fehler
- ESP32 Code nutzt GPIO nur für Logging bei I2C

**Konfigurationsbeispiel:**
```json
{
  "gpio": 0,
  "interface_type": "I2C",
  "i2c_address": 68
}
```

---

## 6. Limitierungen dieser Analyse

| Problem | Auswirkung |
|---------|------------|
| mosquitto_sub nicht im PATH | MQTT Config-Response nicht beobachtbar |
| Server-Logs veraltet (27h+) | Keine Log-Verifikation möglich |
| Kein Serial Monitor | ESP32-Verhalten nicht verifiziert |

---

## 7. Nächste Schritte

### Zur Verifikation erforderlich:

1. **esp32-debug Agent** - Serial Monitor analysieren:
   - Wurde Config-Message empfangen?
   - Erscheint Error 1002 noch?
   - Wird SHT31 initialisiert?
   - Werden Sensor-Daten gesendet?

2. **mqtt-debug Agent** - Falls MQTT-Tools verfügbar:
   - Config-Push auf `kaiser/god/esp/ESP_472204/config`
   - Config-Response auf `kaiser/god/esp/ESP_472204/config_response`

3. **Frontend prüfen**:
   - Erscheinen Sensor-Daten im Dashboard?
   - Sensor-Status: active/inactive?

---

## 8. Zusammenfassung

| Aufgabe | Status |
|---------|--------|
| Alter Sensor (gpio: 21) löschen | **SUCCESS** |
| Neuer Sensor (gpio: 0) anlegen | **SUCCESS** |
| Code-Analyse durchgeführt | **SUCCESS** |
| ESP32-Verifikation | **AUSSTEHEND** |

**Hypothese:** `gpio: 0` wird funktionieren, da der ESP32-Code bei I2C-Sensoren keine GPIO-Reservation durchführt und der GPIO-Wert nur für Logging verwendet wird.

**Verifikation erforderlich durch esp32-debug Agent.**

---

**Report Ende**
