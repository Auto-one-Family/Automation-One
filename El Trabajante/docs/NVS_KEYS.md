# NVS-Keys - Migration von main.cpp

Diese Dokumentation listet alle NVS-Keys auf, die von StorageManager verwendet werden.

## WiFi Configuration

- **Namespace**: `wifi_config`

- **Keys**:

  - `ssid` (String) - WiFi SSID

  - `password` (String) - WiFi Password

  - `server_address` (String) - God-Kaiser Server IP

  - `mqtt_port` (uint16_t) - MQTT Port (default: 8883)

  - `mqtt_username` (String) - MQTT Username (optional)

  - `mqtt_password` (String) - MQTT Password (optional)

## Kaiser/Zone Configuration

- **Namespace**: `zone_config`

- **Keys**:

  - `kaiser_id` (String) - Kaiser ID (UUID)

  - `kaiser_name` (String) - Kaiser Name

  - `master_zone_id` (String) - Master Zone ID

  - `master_zone_name` (String) - Master Zone Name

  - `is_master_esp` (bool) - Ist dieses ESP Master?

## Sensor Configuration

- **Namespace**: `sensor_config`

- **Keys** (pro Sensor: 8 Keys × max 20 Sensoren = 160 Keys):

  - `sensor_count` (uint8_t) - Anzahl konfigurierter Sensoren (0-20)

  - `sensor_{i}_gpio` (uint8_t) - GPIO-Pin (i = 0-19)

  - `sensor_{i}_type` (String) - Sensor-Typ (z.B. "DHT22", "DS18B20", "BMP280")

  - `sensor_{i}_name` (String) - Sensor-Name für UI

  - `sensor_{i}_active` (bool) - Aktiv?

  - `sensor_{i}_interval_ms` (uint16_t) - Leseintervall in Millisekunden

  - `sensor_{i}_offset` (float) - Kalibrations-Offset

  - `sensor_{i}_unit` (String) - Einheit (z.B. "°C", "%", "hPa")

## Actuator Configuration

- **Namespace**: `actuator_config`

- **Keys** (pro Aktor: 9 Keys × max 20 Aktoren = 180 Keys):

  - `actuator_count` (uint8_t) - Anzahl konfigurierter Aktoren (0-20)

  - `actuator_{i}_gpio` (uint8_t) - GPIO-Pin (i = 0-19)

  - `actuator_{i}_type` (String) - Aktor-Typ (z.B. "RELAY", "PWM", "SERVO")

  - `actuator_{i}_name` (String) - Aktor-Name für UI

  - `actuator_{i}_active` (bool) - Aktiv?

  - `actuator_{i}_inverted` (bool) - Invertierte Logik? (LOW = ON)

  - `actuator_{i}_pwm_freq` (uint16_t) - PWM-Frequenz (Hz) - nur für PWM/SERVO

  - `actuator_{i}_pwm_channel` (uint8_t) - PWM-Kanal - nur für PWM/SERVO

  - `actuator_{i}_default_state` (uint8_t) - Standard-Zustand (0=OFF, 1=ON)

## System Configuration

- **Namespace**: `system_config`

- **Keys**:

  - `esp_id` (String) - ESP-ID (MAC-basiert, z.B. "ESP_AABBCC")

  - `device_name` (String) - User-definierter Name

  - `current_state` (uint8_t) - SystemState (0=BOOT, 1=SAFE_MODE, 2=CONFIG_MODE, 3=CONNECTING, 4=OPERATIONAL, 5=ERROR)

  - `safe_mode_reason` (String) - Grund für Safe-Mode

  - `boot_count` (uint16_t) - Anzahl der Boots (für Diagnostik)

  - `last_error` (String) - Letzte Fehlermeldung

## Zone Configuration - Subzonen Details

- **Namespace**: `zone_config`

- **Subzone Keys** (pro Subzone: 3 Keys × max 10 Subzonen = 30 Keys):

  - `subzone_count` (uint8_t) - Anzahl der Subzonen (0-10)

  - `subzone_{i}_id` (String) - Subzone ID (i = 0-9)

  - `subzone_{i}_name` (String) - Subzone Name

  - `subzone_{i}_active` (bool) - Ist diese Subzone aktiv?

## MQTT Topics - Zusätzliche Topics

Das System unterstützt **18 MQTT Topic-Patterns** (nicht nur 13):

**Zusätzliche Topics über die Standard-13 hinaus:**

- `kaiser/{kaiser_id}/zone/{master_zone_id}/status` - Zone-Status
- `kaiser/{kaiser_id}/zone/{master_zone_id}/subzone/{subzone_id}/status` - Subzone-Status
- `kaiser/{kaiser_id}/esp/{esp_id}/will` - Last Will Topic
- `kaiser/{kaiser_id}/esp/{esp_id}/config/request` - Konfig-Anfrage
- `kaiser/{kaiser_id}/esp/{esp_id}/config/response` - Konfig-Antwort

## Memory Usage

**Realistisches Memory-Profil nach Phase 1 Init:**

- WiFi Stack: ~15KB
- Config Structs (20 Sensoren + 20 Aktoren): ~8KB
- MQTT Buffers: ~10KB
- Logger Buffer: ~5KB
- **Gesamtsumme: ~50KB** (nicht <10KB wie ursprünglich angenommen)

## Notes

- Alle String-Keys haben Max-Länge 255
- Bool-Keys werden als uint8_t gespeichert (0/1)
- Float-Keys nutzen Preferences putFloat/getFloat (4 Bytes)
- Namespaces sind isoliert (kein Key-Konflikt zwischen Namespaces)
- **WICHTIG:** Sensor/Actuator Configs sind Arrays mit dynamischer Länge (sensor_count/actuator_count)

