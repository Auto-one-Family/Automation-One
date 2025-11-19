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

- **Keys** (pro Sensor: 6 Keys × max 20 Sensoren = 120 Keys):

  - `sensor_count` (uint8_t) - Anzahl konfigurierter Sensoren (0-20)

  - `sensor_{i}_gpio` (uint8_t) - GPIO-Pin (i = 0-19)

  - `sensor_{i}_type` (String) - Sensor-Typ (z.B. "ph_sensor", "temperature_ds18b20", "soil_moisture")

  - `sensor_{i}_name` (String) - Sensor-Name für UI

  - `sensor_{i}_subzone` (String) - Subzone-Zuordnung (z.B. "zone_1", "zone_2")

  - `sensor_{i}_active` (bool) - Aktiv?

  - `sensor_{i}_raw_mode` (bool) - Raw-Mode aktiv? (immer `true` für Server-Centric Architecture)

## Actuator Configuration

- **Namespace**: `actuator_config`

- **Keys** (pro Aktor: **10 Keys** × max 20 Aktoren = **200 Keys**):

  - `actuator_count` (uint8_t) - Anzahl konfigurierter Aktoren (0-20)

  - `actuator_{i}_gpio` (uint8_t) - GPIO-Pin (i = 0-19)

  - `actuator_{i}_aux_gpio` (uint8_t) - **✅ NEU (Phase 5)** Auxiliary GPIO (z.B. Ventil-Richtungspin, H-Bridge) (255 = unused)

  - `actuator_{i}_type` (String) - Aktor-Typ ("pump", "pwm", "valve", "relay")

  - `actuator_{i}_name` (String) - Aktor-Name für UI

  - `actuator_{i}_subzone` (String) - Subzone-Zuordnung

  - `actuator_{i}_active` (bool) - Aktiv?

  - `actuator_{i}_critical` (bool) - **✅ NEU (Phase 5)** Kritisches System (z.B. Bewässerungspumpe) - Safety-Priorität

  - `actuator_{i}_inverted` (bool) - Invertierte Logik? (LOW = ON)

  - `actuator_{i}_default_state` (bool) - Standard-Zustand (false=OFF, true=ON)

  - `actuator_{i}_default_pwm` (uint8_t) - **✅ NEU (Phase 5)** Standard-PWM-Wert (0-255) für PWM-Aktoren

> **Phase-Status:** ✅ **AKTUALISIERT (Phase 5)** - Die NVS-Speicher-Funktionalität ist vollständig implementiert (`ConfigManager::saveActuatorConfig()` / `loadActuatorConfig()`), wird aber in Phase 5 bewusst **NICHT verwendet** (Server-Centric Option 2). Stattdessen erfolgt Actuator-Konfiguration **ausschließlich via MQTT** (`/config` Topic mit `actuators[]` Array). Die NVS-Keys dienen als **Fallback-Mechanismus** für Phase 6 (Hybrid/Persistenz-Mode) und als **Defense-in-Depth** gegen Server-Fehlkonfigurationen (GPIO-Konflikt-Check bleibt aktiv).
>
> **Architektur-Hinweis:** Siehe `docs/ZZZ.md` - "Server-Centric Pragmatic Deviations" für Details zur bewussten Nicht-Nutzung von NVS-Persistenz in Phase 5.

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

**Realistisches Memory-Profil nach Phase 5 Complete:**

- WiFi Stack: ~15KB
- Config Structs (20 Sensoren + 20 Aktoren): ~8KB
- MQTT Buffers: ~10KB
- Logger Buffer: ~5KB
- **ActuatorManager (Phase 5):**
  - RegisteredActuator Array (12 slots): ~2KB
  - Driver Virtual Tables: ~1KB
  - Safety-Controller State: ~1KB
- **Gesamtsumme: ~54KB** (von 320KB verfügbar)

## Notes

- Alle String-Keys haben Max-Länge 255
- Bool-Keys werden als uint8_t gespeichert (0/1)
- Float-Keys nutzen Preferences putFloat/getFloat (4 Bytes)
- Namespaces sind isoliert (kein Key-Konflikt zwischen Namespaces)
- **WICHTIG:** Sensor/Actuator Configs sind Arrays mit dynamischer Länge (sensor_count/actuator_count)

