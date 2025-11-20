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

### Default-Values & Constraints

Diese Tabelle zeigt **Default-Werte**, die verwendet werden, wenn Keys **nicht in NVS** existieren (z.B. First-Boot).

#### WiFi Configuration (Namespace: `wifi_config`)

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `ssid` | String | `""` (empty) | Max 32 chars | WiFi Network Name |
| `password` | String | `""` (empty) | Max 64 chars | WiFi Network Password |
| `server_address` | String | `"192.168.0.198"` | IPv4 or Hostname | MQTT Broker IP/Hostname |
| `mqtt_port` | uint16_t | `8883` | 1-65535 | MQTT Broker Port (8883=TLS, 1883=Plain) |
| `mqtt_username` | String | `""` (empty) | Max 64 chars | MQTT Auth Username (Optional) |
| `mqtt_password` | String | `""` (empty) | Max 64 chars | MQTT Auth Password (Optional) |
| `configured` | bool | `false` | - | WiFi Configuration Status |

#### Zone Configuration (Namespace: `zone_config`)

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `kaiser_id` | String | `""` (empty) | Generated if missing | Kaiser Zone Identifier |
| `kaiser_name` | String | `""` (empty) | Max 64 chars | Human-Readable Kaiser Name |
| `master_zone_id` | String | `""` (empty) | Max 32 chars | Parent Zone Identifier |
| `master_zone_name` | String | `""` (empty) | Max 64 chars | Parent Zone Name |
| `is_master_esp` | bool | `false` | - | Is this ESP the Master? |
| `connected` | bool | `false` | - | Connection Status |

#### System Configuration (Namespace: `system_config`)

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `esp_id` | String | `""` → **Generated** | Format: `ESP_XXXXXX` | Generated from MAC if missing |
| `device_name` | String | `"ESP32"` | Max 32 chars | Human-Readable Device Name |
| `current_state` | uint8_t | `0` (STATE_BOOT) | 0-11 | State Machine Current State |
| `safe_mode_reason` | String | `""` (empty) | Max 128 chars | Reason for Safe-Mode Entry |
| `boot_count` | uint16_t | `0` | 0-65535 | Number of Reboots |

#### Sensor Configuration (Namespace: `sensor_config`)

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `sensor_count` | uint8_t | `0` | 0-20 | Number of Configured Sensors |
| `sensor_{i}_gpio` | uint8_t | N/A | 0-39 | GPIO Pin for Sensor i |
| `sensor_{i}_type` | String | N/A | Max 32 chars | Sensor Type (e.g. "ph_sensor") |
| `sensor_{i}_name` | String | N/A | Max 64 chars | Human-Readable Sensor Name |
| `sensor_{i}_subzone` | String | N/A | Max 32 chars | Subzone Identifier |
| `sensor_{i}_active` | bool | N/A | - | Is Sensor Active? |
| `sensor_{i}_raw_mode` | bool | `true` | - | Raw ADC Mode (true) or Calibrated (false) |

**Note:** Sensor-Array-Elemente haben **keine Default-Values**. Keys werden nur geschrieben, wenn ein Sensor konfiguriert wird.

#### Actuator Configuration (Namespace: `actuator_config`)

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `actuator_count` | uint8_t | `0` | 0-20 | Number of Configured Actuators |
| `actuator_{i}_gpio` | uint8_t | N/A | 0-39 | Primary GPIO Pin |
| `actuator_{i}_aux_gpio` | uint8_t | N/A | 0-39 or 255 | Auxiliary GPIO (255=unused) |
| `actuator_{i}_type` | String | N/A | Max 32 chars | Actuator Type ("pump","pwm","valve","relay") |
| `actuator_{i}_name` | String | N/A | Max 64 chars | Human-Readable Actuator Name |
| `actuator_{i}_subzone` | String | N/A | Max 32 chars | Subzone Identifier |
| `actuator_{i}_active` | bool | N/A | - | Is Actuator Active? |
| `actuator_{i}_critical` | bool | N/A | - | Critical Actuator (true) or Optional (false) |
| `actuator_{i}_inverted` | bool | N/A | - | Inverted Logic (LOW=ON if true) |
| `actuator_{i}_default_state` | bool | N/A | - | Default State (ON/OFF) at Boot |
| `actuator_{i}_default_pwm` | uint8_t | N/A | 0-255 | Default PWM Duty Cycle (0-255) |

**Note:** Actuator-Array-Elemente haben **keine Default-Values**. Keys werden nur geschrieben, wenn ein Aktor konfiguriert wird.

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

### Memory-Usage Summary

**Total Keys (Worst-Case):**
- WiFi: 7 Keys
- Zone: 6 Keys
- System: 5 Keys
- Sensors: 1 + (6 × 20) = 121 Keys (bei 20 Sensoren)
- Actuators: 1 + (10 × 20) = 201 Keys (bei 20 Aktoren)
- **TOTAL: ~340 Keys** (bei voller Auslastung)

**Estimated NVS-Usage:**
- Strings (avg 30 bytes): ~240 Keys × 30 = 7.2 KB
- Integers (4 bytes): ~100 Keys × 4 = 400 bytes
- **TOTAL: ~8 KB** (bei voller Auslastung)

**NVS-Partition:** 20 KB (Standard ESP32)  
**Usage:** ~40% (bei 20 Sensoren + 20 Aktoren)  
**Safe-Margin:** ✅ 60% frei

## Notes

- Alle String-Keys haben Max-Länge 255
- Bool-Keys werden als uint8_t gespeichert (0/1)
- Float-Keys nutzen Preferences putFloat/getFloat (4 Bytes)
- Namespaces sind isoliert (kein Key-Konflikt zwischen Namespaces)
- **WICHTIG:** Sensor/Actuator Configs sind Arrays mit dynamischer Länge (sensor_count/actuator_count)

