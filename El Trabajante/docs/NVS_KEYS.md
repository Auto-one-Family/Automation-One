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

**File:** `src/services/config/config_manager.cpp` (lines 170-244)

**Phase 7 Keys (Hierarchical Zone Info):**

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `zone_id` | String | `""` (empty) | Max 64 chars | Primary zone identifier (Phase 7) |
| `master_zone_id` | String | `""` (empty) | Max 64 chars | Parent master zone ID (Phase 7) |
| `zone_name` | String | `""` (empty) | Max 64 chars | Human-readable zone name (Phase 7) |
| `zone_assigned` | bool | `false` | - | Zone assignment status flag (Phase 7) |

**Existing Keys (Kaiser Communication):**

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `kaiser_id` | String | `""` (empty) | Max 64 chars | Kaiser instance identifier |
| `kaiser_name` | String | `""` (empty) | Max 64 chars | Human-readable Kaiser name |
| `connected` | bool | `false` | - | MQTT connection status |
| `id_generated` | bool | `false` | - | Kaiser ID generation flag |

**Legacy Keys (Backward Compatibility):**

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `legacy_master_zone_id` | String | `""` (empty) | Max 64 chars | Legacy master zone ID |
| `legacy_master_zone_name` | String | `""` (empty) | Max 64 chars | Legacy master zone name |
| `is_master_esp` | bool | `false` | - | Legacy master ESP flag |

**Implementation:**

```cpp
// Loading (config_manager.cpp:170-204)
kaiser.zone_id = storageManager.getStringObj("zone_id", "");
kaiser.master_zone_id = storageManager.getStringObj("master_zone_id", "");
kaiser.zone_name = storageManager.getStringObj("zone_name", "");
kaiser.zone_assigned = storageManager.getBool("zone_assigned", false);
kaiser.kaiser_id = storageManager.getStringObj("kaiser_id", "");
kaiser.kaiser_name = storageManager.getStringObj("kaiser_name", "");
kaiser.connected = storageManager.getBool("connected", false);
kaiser.id_generated = storageManager.getBool("id_generated", false);

// Saving (config_manager.cpp:206-244)
storageManager.putString("zone_id", kaiser.zone_id);
storageManager.putString("master_zone_id", kaiser.master_zone_id);
storageManager.putString("zone_name", kaiser.zone_name);
storageManager.putBool("zone_assigned", kaiser.zone_assigned);
storageManager.putString("kaiser_id", kaiser.kaiser_id);
storageManager.putString("kaiser_name", kaiser.kaiser_name);
storageManager.putBool("connected", kaiser.connected);
storageManager.putBool("id_generated", kaiser.id_generated);
```

#### Subzone Configuration (Namespace: `subzone_config`)

**Phase 9 Keys:**

| Key | Type | Default | Constraint | Description |
|-----|------|---------|------------|-------------|
| `subzone_ids` | String | `""` | Comma-separated | **Master list** of all subzone IDs (e.g., "irr_A,irr_B,clim_1") |
| `subzone_{subzone_id}_id` | String | `""` | Max 32 chars | Subzone identifier |
| `subzone_{subzone_id}_name` | String | `""` | Max 64 chars | Human-readable name |
| `subzone_{subzone_id}_parent` | String | `""` | Max 64 chars | Parent zone ID |
| `subzone_{subzone_id}_gpios` | String | `""` | Comma-separated | GPIO list (e.g., "4,5,6") |
| `subzone_{subzone_id}_safe_mode` | bool | `true` | - | Safe-mode status |
| `subzone_{subzone_id}_timestamp` | uint32 | `0` | - | Creation timestamp |

**Hinweis:** Der `subzone_ids` Key ist der Master-Index für alle konfigurierten Subzones. Er wird automatisch bei `saveSubzoneConfig()` und `removeSubzoneConfig()` aktualisiert.

**Implementation:**

```cpp
// Saving (config_manager.cpp:450-484)
storageManager.putString("subzone_" + subzone_id + "_id", config.subzone_id);
storageManager.putString("subzone_" + subzone_id + "_name", config.subzone_name);
storageManager.putString("subzone_" + subzone_id + "_parent", config.parent_zone_id);
storageManager.putBool("subzone_" + subzone_id + "_safe_mode", config.safe_mode_active);
storageManager.putULong("subzone_" + subzone_id + "_timestamp", config.created_timestamp);
// GPIO-Array als komma-separierte String
String gpio_string = "4,5,6";  // Beispiel
storageManager.putString("subzone_" + subzone_id + "_gpios", gpio_string);

// Loading (config_manager.cpp:486-520)
config.subzone_id = storageManager.getStringObj("subzone_" + subzone_id + "_id", "");
config.subzone_name = storageManager.getStringObj("subzone_" + subzone_id + "_name", "");
config.parent_zone_id = storageManager.getStringObj("subzone_" + subzone_id + "_parent", "");
config.safe_mode_active = storageManager.getBool("subzone_" + subzone_id + "_safe_mode", true);
config.created_timestamp = storageManager.getULong("subzone_" + subzone_id + "_timestamp", 0);
// GPIO-Array aus komma-separiertem String laden
String gpio_string = storageManager.getStringObj("subzone_" + subzone_id + "_gpios", "");
// Parse comma-separated string to vector
```

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
| `sensor_{i}_mode` | String | `"continuous"` | Max 16 chars | **✅ Phase 2C** Operating Mode (continuous, on_demand, paused, scheduled) |
| `sensor_{i}_interval` | uint32_t | `30000` | 1000-300000 | **✅ Phase 2C** Measurement Interval in Milliseconds |

**Note:** Sensor-Array-Elemente haben **keine Default-Values**. Keys werden nur geschrieben, wenn ein Sensor konfiguriert wird.

**Phase 2C Operating Modes:**
- `continuous`: Sensor misst automatisch im konfigurierten Intervall
- `on_demand`: Sensor misst nur auf MQTT-Command (via `/sensor/{gpio}/command`)
- `paused`: Sensor misst nicht (GPIO bleibt reserviert)
- `scheduled`: Sensor misst auf Server-getriggerte Commands (Phase 2D)

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

  - `sensor_{i}_subzone` (String) - Subzone-Zuordnung (z.B. "zone_1", "zone_2") (entspricht `subzone_id` im SensorConfig)

  - `sensor_{i}_active` (bool) - Aktiv?

  - `sensor_{i}_raw_mode` (bool) - Raw-Mode aktiv? (immer `true` für Server-Centric Architecture)

  - `sensor_{i}_mode` (String) - **✅ Phase 2C** Operating Mode ("continuous", "on_demand", "paused", "scheduled")

  - `sensor_{i}_interval` (uint32_t) - **✅ Phase 2C** Mess-Intervall in Millisekunden (1000-300000, default: 30000)

## Actuator Configuration

- **Namespace**: `actuator_config`

- **Keys** (pro Aktor: **10 Keys** × max 20 Aktoren = **200 Keys**):

  - `actuator_count` (uint8_t) - Anzahl konfigurierter Aktoren (0-20)

  - `actuator_{i}_gpio` (uint8_t) - GPIO-Pin (i = 0-19)

  - `actuator_{i}_aux_gpio` (uint8_t) - **✅ NEU (Phase 5)** Auxiliary GPIO (z.B. Ventil-Richtungspin, H-Bridge) (255 = unused)

  - `actuator_{i}_type` (String) - Aktor-Typ ("pump", "pwm", "valve", "relay")

  - `actuator_{i}_name` (String) - Aktor-Name für UI

  - `actuator_{i}_subzone` (String) - Subzone-Zuordnung (entspricht `subzone_id` im ActuatorConfig)

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

  - `current_state` (uint8_t) - SystemState (0-11, siehe Mqtt_Protocoll.md State-Values)
    - 0: BOOT
    - 1: WIFI_SETUP
    - 2: WIFI_CONNECTED
    - 3: MQTT_CONNECTING
    - 4: MQTT_CONNECTED
    - 5: AWAITING_USER_CONFIG
    - 6: ZONE_CONFIGURED
    - 7: SENSORS_CONFIGURED
    - 8: OPERATIONAL
    - 9: LIBRARY_DOWNLOADING
    - 10: SAFE_MODE
    - 11: ERROR

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
- Sensors: 1 + (8 × 20) = 161 Keys (bei 20 Sensoren, **+2 Keys Phase 2C: mode, interval**)
- Actuators: 1 + (10 × 20) = 201 Keys (bei 20 Aktoren)
- **TOTAL: ~380 Keys** (bei voller Auslastung)

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

