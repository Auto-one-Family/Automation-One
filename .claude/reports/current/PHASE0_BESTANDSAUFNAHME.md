# Phase 0 -- Bestandsaufnahme fuer Hardware-Test (SHT31 + ESP_472204)

**Datum:** 2026-02-25
**Branch:** fix/trockentest-bugs

---

## 0.1 -- DB-Zustand

### Docker Stack Status

| Service | Container | Status |
|---------|-----------|--------|
| PostgreSQL | automationone-postgres | Up 21min (healthy) |
| MQTT Broker | automationone-mqtt | Up 21min (healthy) |
| FastAPI Server | automationone-server | Up 21min (healthy) |
| Vue Frontend | automationone-frontend | Up 21min (healthy) |
| Grafana | automationone-grafana | Up 21min (healthy) |
| Loki | automationone-loki | Up 21min (healthy) |
| Prometheus | automationone-prometheus | Up 21min (healthy) |
| Alloy | automationone-alloy | Up 21min (healthy) |
| cAdvisor | automationone-cadvisor | Up 21min (healthy) |
| pgAdmin | automationone-pgadmin | **Restarting (crash loop)** |
| Mosquitto Exporter | automationone-mosquitto-exporter | Up 21min |
| PG Exporter | automationone-postgres-exporter | Up 21min (healthy) |
| MQTT Logger | automationone-mqtt-logger | Up 21min |

**DB Size:** 12 MB

### esp_devices (7 Eintraege)

| device_id | zone_name | hardware_type | status | ip_address | firmware_version | last_seen | created_at |
|-----------|-----------|---------------|--------|------------|------------------|-----------|------------|
| MOCK_25045525 | - | ESP32_WROOM | approved | - | - | 2026-02-16 09:04 | 2026-02-15 18:12 |
| MOCK_E1BD1447 | - | ESP32_WROOM | approved | - | - | 2026-02-16 09:04 | 2026-02-15 18:12 |
| MOCK_7CE9A94D | test | MOCK_ESP32 | offline | 127.0.0.1 | MOCK_1.0.0 | 2026-02-16 09:38 | 2026-02-15 18:49 |
| MOCK_5D5ADA49 | Test | MOCK_ESP32 | offline | 127.0.0.1 | MOCK_1.0.0 | 2026-02-23 23:48 | 2026-02-15 18:52 |
| **ESP_472204** | **Echt** | **ESP32_WROOM** | **offline** | **192.168.0.148** | **(leer)** | **2026-02-25 13:01** | **2026-02-20 22:24** |
| MOCK_0954B2B1 | - | MOCK_ESP32 | online | 127.0.0.1 | MOCK_1.0.0 | 2026-02-25 13:16 | 2026-02-23 17:15 |
| VERIFY_FIX | - | ESP32_WROOM | pending_approval | - | - | 2026-02-25 11:34 | 2026-02-25 11:34 |

### sensor_configs (1 Eintrag)

| device_id | sensor_type | gpio | i2c_address | interface_type | interval_ms | enabled | provides_values |
|-----------|-------------|------|-------------|----------------|-------------|---------|-----------------|
| ESP_472204 | sht31 | 0 | 68 (0x44) | I2C | 30000 | true | ["temperature", "humidity"] |

### sensor_data (4 Eintraege total, 0 fuer ESP_472204)

| device_id | sensor_type | raw_value | processed_value | quality | unit | timestamp |
|-----------|-------------|-----------|-----------------|---------|------|-----------|
| VERIFY_FIX | sht31 | 99990 | 999.9 | critical | C | 2026-02-25 11:34:45 |
| VERIFY_FIX | sht31 | 2250 | 22.5 | good | C | 2026-02-25 11:34:29 |
| MOCK_0954B2B1 | temperature | 2350 | (null) | good | C | 2026-02-23 20:03:20 |
| MOCK_5D5ADA49 | temperature | 2350 | (null) | good | C | 2026-02-23 13:36:56 |

**BEFUND: ESP_472204 hat 0 sensor_data Eintraege trotz konfiguriertem SHT31.**

### esp_heartbeat_logs -- ESP_472204 Summary

| Metric | Wert |
|--------|------|
| Total Heartbeats | 145 |
| Erster Heartbeat | 2026-02-20 22:25:02 |
| Letzter Heartbeat | 2026-02-25 12:56:18 |
| Avg RSSI | -46 dBm (gut) |
| Avg Heap Free | 209 KB (gesund) |
| Max Uptime | 5706s (~95 min) |
| Data Source | production |
| Health Status | healthy |
| **sensor_count** | **0** |
| **actuator_count** | **0** |

**BEFUND: Heartbeats zeigen sensor_count=0 -- ESP meldet keine Sensoren aktiv!**

### Audit Logs
- Total: 50 Eintraege

### Row Counts (exakte Zaehlung)

| Tabelle | Rows |
|---------|------|
| esp_devices | 7 |
| sensor_configs | 1 |
| sensor_data | 4 |
| esp_heartbeat_logs | 4773 |
| audit_logs | 50 |
| actuator_configs | 0 |
| actuator_states | 0 |
| user_accounts | 1 |

### Foreign Key Map (esp_devices referenziert von)

| Tabelle | FK-Spalte | ON DELETE |
|---------|-----------|-----------|
| actuator_configs | esp_id | CASCADE |
| actuator_history | esp_id | CASCADE |
| actuator_states | esp_id | CASCADE |
| ai_predictions | target_esp_id | CASCADE |
| esp_heartbeat_logs | esp_id | CASCADE |
| esp_ownership | esp_id | CASCADE |
| sensor_configs | esp_id | CASCADE |
| sensor_data | esp_id | CASCADE |
| subzone_configs | esp_id (-> device_id) | CASCADE |

**Alle 9 abhaengigen Tabellen nutzen CASCADE DELETE.**

---

## 0.2 -- Code-Fix Verifikation

### Check 1: SHT31_BASE_CAP in sensor_registry.cpp -- BESTANDEN

```cpp
// El Trabajante/src/models/sensor_registry.cpp
static const SensorCapability SHT31_TEMP_CAP = { ... };    // Line 10
static const SensorCapability SHT31_HUMIDITY_CAP = { ... }; // Line 18
static const SensorCapability SHT31_BASE_CAP = { ... };     // Line 29

// Registry entries:
{"temperature_sht31", &SHT31_TEMP_CAP},       // Line 144
{"humidity_sht31", &SHT31_HUMIDITY_CAP},       // Line 145
{"sht31_temp", &SHT31_TEMP_CAP},              // Line 146 (normalized)
{"sht31_humidity", &SHT31_HUMIDITY_CAP},       // Line 147 (normalized)
{"sht31", &SHT31_BASE_CAP},                   // Line 148 (base multi-value)
```

### Check 2: Multi-Value-Splitting im Backend -- BESTANDEN

- `sensor_type_registry.py` existiert (7953 Bytes, 2026-02-24)
- Pfad: `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`
- Enthalt: `MULTI_VALUE_SENSORS` Dict, `get_multi_value_sensor_def()`, `is_multi_value_sensor()`, `get_all_value_types_for_device()`
- SHT31 als Multi-Value definiert mit `sht31_temp` und `sht31_humidity` Sub-Typen
- `sensors.py` importiert und nutzt `is_multi_value_sensor`, `get_all_value_types_for_device`
- `sensor_handler.py` referenziert Multi-Value-Lookup

### Check 3: GPIO-Blacklist/Strapping im Backend -- BESTANDEN

- `gpio_validation_service.py` existiert mit vollstaendiger GPIO-Validierung
- ESP32-WROOM Blacklist: GPIO 0 (Boot-Strapping), 1 (UART TX), 2 (Boot-Strapping), 3 (UART RX), 6-11 (Flash SPI), 12 (MTDI Strapping)
- ESP32-C3 separate Blacklist (GPIO 12 ist dort normal)
- `constants.py` dokumentiert Strapping-Pin-Verhalten
- `esp.py` berechnet `reserved_gpios` dynamisch

### Check 4: sensor_type_registry.py Existenz -- BESTANDEN

- Datei: `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`
- Groesse: 7953 Bytes
- Letzte Aenderung: 2026-02-24 19:55

**Alle 4 Code-Checks: BESTANDEN**

---

## 0.3 -- MQTT-Broker Status

### Broker-Statistik

| Metrik | Wert |
|--------|------|
| Connected Clients | 3 |
| Broker | automationone-mqtt (healthy) |

### Empfangene Messages (30s Fenster)

```
kaiser/god/esp/ESP_472204/zone/ack
  {"esp_id":"ESP_472204","status":"zone_assigned","zone_id":"echt","master_zone_id":"","ts":1771626300}

kaiser/god/esp/ESP_472204/config_response
  {"status":"error","type":"actuator","count":0,"message":"Actuator config array is empty","error_code":"MISSING_FIELD"}
```

### MQTT-Befunde

| Topic | Status |
|-------|--------|
| `kaiser/god/esp/ESP_472204/zone/ack` | Periodisch gesendet (OK) |
| `kaiser/god/esp/ESP_472204/config_response` | **ERROR: "Actuator config array is empty"** |
| `kaiser/god/esp/ESP_472204/system/heartbeat` | **NICHT empfangen** (15s Timeout) |
| `kaiser/god/esp/ESP_472204/sensor/+/data` | **NICHT empfangen** |

**BEFUND: ESP sendet zone/ack und config_response in Schleife, aber KEINE Heartbeats und KEINE Sensor-Daten.**
Der config_response-Error deutet darauf hin, dass der ESP den Config-Push vom Server erhaelt, aber die Actuator-Config leer ist (korrekt -- keine Aktoren konfiguriert), dies aber als Error meldet.

---

## 0.4 -- Firmware-Version

**NICHT ermittelbar.** Kein `version.h` gefunden. `FIRMWARE_VERSION` / `APP_VERSION` Defines existieren nicht in den Header-Files. Die ESP32-Firmware meldet auch kein `firmware_version` Feld in der DB (Spalte ist leer).

SDK-Version wird dynamisch via `ESP.getSdkVersion()` im Heartbeat verwendet (main.cpp:1111).

---

## Zusammenfassung der Befunde

### Kritische Probleme

1. **ESP_472204 sensor_count=0 in Heartbeats** -- Der ESP meldet, dass er 0 Sensoren aktiv hat, obwohl ein SHT31 in sensor_configs registriert ist. Config-Push-Problem.

2. **Keine Sensor-Daten von ESP_472204** -- 0 Eintraege in sensor_data. Der SHT31 sendet keine Messwerte.

3. **Config-Response Error-Schleife** -- ESP sendet wiederholt `config_response` mit Error "Actuator config array is empty". Dies deutet auf einen Retry-Loop im Config-Handling hin.

4. **Keine Heartbeats aktuell** -- Letzter Heartbeat war 2026-02-25 12:56:18 (vor ca. 45 Minuten). ESP sendet aktuell nur zone/ack und config_response.

5. **ESP Status = offline** -- Trotz aktiver MQTT-Messages ist der Status "offline" in der DB.

### Nicht-kritische Befunde

6. **pgAdmin im Restart-Loop** -- Nicht relevant fuer HW-Test.
7. **6 alte Mock/Test-Devices** -- Aufzuraeumen vor dem naechsten HW-Test.
8. **firmware_version leer** -- Kein Version-Tracking implementiert.

### Naechste Schritte (Empfehlung)

1. ESP-Logs pruefen (Serial) -- warum sensor_count=0 trotz Config?
2. Config-Push-Mechanismus debuggen -- kommt der Config-Push korrekt an?
3. Actuator-Config-Error klaeren -- soll leere Actuator-Config als OK behandelt werden?
4. Alte Test-Devices aufraeumen (nach Genehmigung)
