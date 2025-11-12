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

- **Keys**:

  - `sensor_count` (uint8_t) - Anzahl konfigurierter Sensoren

  - `sensor_{i}_gpio` (uint8_t) - GPIO-Pin (i = 0-9)

  - `sensor_{i}_type` (String) - Sensor-Typ (z.B. "ph_sensor")

  - `sensor_{i}_name` (String) - Sensor-Name

  - `sensor_{i}_subzone` (String) - Subzone-ID

  - `sensor_{i}_active` (bool) - Aktiv?

## Actuator Configuration

- **Namespace**: `actuator_config`

- **Keys**:

  - `actuator_count` (uint8_t) - Anzahl konfigurierter Aktoren

  - `actuator_{i}_gpio` (uint8_t) - GPIO-Pin (i = 0-7)

  - `actuator_{i}_type` (String) - Aktor-Typ (z.B. "pump")

  - `actuator_{i}_name` (String) - Aktor-Name

  - `actuator_{i}_subzone` (String) - Subzone-ID

  - `actuator_{i}_active` (bool) - Aktiv?

## System Configuration

- **Namespace**: `system_config`

- **Keys**:

  - `esp_id` (String) - ESP-ID (MAC-basiert)

  - `device_name` (String) - User-definierter Name

  - `current_state` (uint8_t) - SystemState als Integer

  - `safe_mode_reason` (String) - Grund für Safe-Mode

## Notes

- Alle String-Keys haben Max-Länge 255

- Bool-Keys werden als uint8_t gespeichert (0/1)

- Namespaces sind isoliert (kein Key-Konflikt zwischen Namespaces)

