# Konsolidierter Report: Wokwi-Integration

**Erstellt:** 2026-02-11T14:30:00Z
**Branch:** feature/docs-cleanup
**Quellordner:** `.technical-manager/inbox/agent-reports/`
**Anzahl Reports:** 3

## Einbezogene Reports

| # | Report | Thema | Zeilen |
|---|--------|-------|--------|
| 1 | wokwi-analysis-2026-02-10.md | Wokwi-Setup, Approval-Flow, Seeds, CI, Test-Infrastruktur | 852 |
| 2 | wokwi-esp32-analysis-2026-02-11.md | ESP32-Side: Boot, Heartbeat, Serial-Patterns, Device-ID | 430 |
| 3 | wokwi-esp32-development-2026-02-11.md | Code-Tracing, Registration Gate, Multi-ESP-ID Design | 632 |

---

## 1. Wokwi-Analyse (2026-02-10)

### 1.1 Setup & Konfiguration

**wokwi.toml** (`El Trabajante/wokwi.toml`):
```toml
[wokwi]
version = 1
firmware = ".pio/build/wokwi_simulation/firmware.bin"
elf = ".pio/build/wokwi_simulation/firmware.elf"
rfc2217ServerPort = 4000

[wokwi.network]
gateway = true  # Erlaubt externe MQTT-Verbindungen

[wokwi.serial]
baud = 115200
```

- `gateway = true` aktiviert Netzwerk-Zugriff
- ESP32 verbindet sich zu `host.wokwi.internal` (automatisch aufgeloest zu localhost/Host-Rechner)
- MQTT Broker Port 1883 auf Host muss erreichbar sein

**diagram.json** (`El Trabajante/diagram.json`) Hardware-Komponenten:
- ESP32 DevKit v1
- DS18B20 Temperature Sensor (OneWire, GPIO 4)
- DHT22 (GPIO 15)
- Potentiometer Analog (GPIO 34)
- 3x LEDs (GPIO 5, 13, 14)
- Emergency Button (GPIO 27)

### 1.2 Szenarien-Struktur

**Gesamt:** 165 YAML Scenario-Dateien in 13 Kategorien
**Pfad:** `El Trabajante/tests/wokwi/scenarios/`

| Kategorie | Count | Beschreibung |
|-----------|-------|--------------|
| `01-boot` | 2 | Boot-Sequenz, Safe-Mode |
| `02-sensor` | 5 | Sensor-Auslesung (DS18B20, DHT22, Analog) |
| `03-actuator` | 7 | Actuator-Steuerung (LED, PWM, Timeout) |
| `04-zone` | 2 | Zone/Subzone Assignment via MQTT |
| `05-emergency` | 3 | Emergency-Stop Broadcast/ESP |
| `06-config` | 2 | Sensor/Actuator Config via MQTT |
| `07-combined` | 2 | Sensor+Actuator E2E, Multi-Device |
| `08-i2c` | 20 | I2C Bus-Tests (Recovery, Errors) |
| `08-onewire` | 29 | OneWire Protocol-Tests |
| `09-hardware` | 9 | Hardware-Features |
| `09-pwm` | 18 | PWM Control-Tests |
| `10-nvs` | 40 | NVS Storage-Tests |
| `gpio` | 24 | GPIO Conflict/Status |

### 1.3 CI-Integration

**Workflow:** `.github/workflows/wokwi-tests.yml`
**Trigger:** Push/PR zu `El Trabajante/**`

**Pipeline:**
1. **Build-Job:** Firmware bauen (PlatformIO, Umgebung `wokwi_simulation`)
2. **12 Test-Jobs** (parallel): Boot, Sensor, MQTT Connection, Actuator, Zone, Emergency, Config, Sensor Flow, Actuator Flow, Combined Flow
3. **Summary-Job:** Konsolidiert alle Ergebnisse

**CI testet 24 explizite Szenarien** in 10 Kategorien. 15 davon mit MQTT-Injection.

**MQTT-Setup in CI:**
```yaml
- name: Start Mosquitto MQTT Broker
  run: |
    docker run -d --name mosquitto -p 1883:1883 \
      -v /tmp/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro \
      eclipse-mosquitto:2
```

**MQTT Injection Pattern:**
```yaml
- name: Run LED ON Test
  run: |
    timeout 120 wokwi-cli . --timeout 90000 \
      --scenario tests/wokwi/scenarios/03-actuator/actuator_led_on.yaml &
    WOKWI_PID=$!
    sleep 25  # Wait for boot
    docker exec mosquitto mosquitto_pub \
      -t "kaiser/god/esp/ESP_00000001/actuator/5/command" \
      -m '{"command":"ON","value":1.0}'
    wait $WOKWI_PID
```

### 1.4 Device Approval Flow

**WICHTIGSTER BEFUND:** Es gibt **keinen Device-Approval-Flow** im System. Devices werden bei Discovery (via MQTT-Heartbeat) automatisch mit Status "online" registriert. Das `pending_approval`-Feature in der Datenbank ist vorhanden aber **NICHT** im Discovery-Handler implementiert.

**DB-Modell** (`esp.py:142-174`): Felder `approved_at`, `approved_by` existieren, werden aber nicht gesetzt.

**Auto-Registration** (`discovery_handler.py:115-138`):
```python
new_esp = ESPDevice(
    device_id=esp_id_str,
    status="online",  # DIREKT ONLINE, kein "pending_approval"
    capabilities=payload.get("capabilities", {}),
    metadata={"auto_registered": True},
)
```

### 1.5 MQTT vs HTTP Analyse

| Feature | Protokoll | ESP32-Code | Server-Code | Wokwi-Support |
|---------|-----------|------------|-------------|---------------|
| Provisioning (Initial) | HTTP | provision_manager.cpp | Nicht noetig | WebServer auf ESP |
| Device Discovery | MQTT | Heartbeat in main.cpp | heartbeat_handler.py | Gateway aktiv |
| Sensor Data | MQTT | sensor_manager.cpp | sensor_data_handler.py | Tested in CI |
| Actuator Commands | MQTT | actuator_manager.cpp | actuator_command_handler.py | Tested in CI |
| Config Updates | MQTT | mqtt_client.cpp | config_handler.py | Tested in CI |
| Device Registration | NICHT VORHANDEN | Kein HTTP POST | Kein Endpoint | Wuerde funktionieren |
| Approval Request | NICHT VORHANDEN | Kein Code | Kein Handler | Wuerde funktionieren |

**Zusammenfassung:** HTTP wird NUR fuer initiales Provisioning (Captive Portal) verwendet. MQTT ist das primaere Protokoll fuer alle Runtime-Kommunikation. Wokwi unterstuetzt beides.

### 1.6 Seed-Strategie

**Seed-Script:** `scripts/seed_wokwi_esp.py`
```python
ESPDevice(
    device_id="ESP_00000001",
    name="Wokwi Simulation ESP",
    hardware_type="ESP32_WROOM",
    status="offline",  # Wird auf "online" bei erstem Heartbeat
    kaiser_id="god",
    capabilities={"max_sensors": 20, "max_actuators": 12, "wokwi": True},
)
```

### 1.7 Alternativen fuer Approval-Flow

| Alternative | Aufwand | Pro | Contra |
|-------------|---------|-----|--------|
| 1. Seeds optimieren (EMPFOHLEN) | 2-4h | Schnell, konsistent | Testet nicht Discovery |
| 2. Server-seitiger "Wokwi-Mode" | 6-8h | Vollautomatisch | Test-Code in Production |
| 3. MQTT-basierter Approval | 12-16h | Production-ready Feature | Grosser Scope |
| 4. Pre-approved Device-Tokens | 1-2h | Minimal-invasiv | Nicht skalierbar |

### 1.8 Test-Infrastruktur Analyse

**CI-Coverage-Diskrepanz:** CI testet 24 explizite Szenarien, aber TEST_ENGINE_REFERENCE.md behauptet 138 (85% Coverage). Hypothese: Fehlende 114 Szenarien werden durch Python-Runner getestet.

**Makefile-Targets fuer Wokwi fehlen KOMPLETT.** Dokumentiert in TEST_ENGINE_REFERENCE.md aber nicht implementiert.

**Szenarien-Qualitaet:**
- Boot/Core: Sehr gut
- Actuator/Config: Gut
- Extended (NVS, PWM, I2C): Teilweise unvollstaendig

**Nicht getestete Features:**
- Provisioning-Flow (Wokwi-Limitation)
- WiFi/MQTT-Reconnect
- OTA Firmware Update
- Deep-Sleep/Wake-Up
- Watchdog-Reset

---

## 2. ESP32-Side Analysis (2026-02-11)

### 2.1 Boot Sequence unter WOKWI_SIMULATION

**Compile-Time Configuration** (`platformio.ini:136-154`):
```ini
[env:wokwi_simulation]
extends = env:esp32_dev
build_flags =
    ${env:esp32_dev.build_flags}
    -D WOKWI_SIMULATION=1
    -D WOKWI_WIFI_SSID=\"Wokwi-GUEST\"
    -D WOKWI_WIFI_PASSWORD=\"\"
    -D WOKWI_MQTT_HOST=\"host.wokwi.internal\"
    -D WOKWI_MQTT_PORT=1883
    -D WOKWI_ESP_ID=\"ESP_00000001\"
```

**ConfigManager Credential-Injection** (`config_manager.cpp:71-111`):
```cpp
#ifdef WOKWI_SIMULATION
  config.ssid = "Wokwi-GUEST";
  config.server_address = "host.wokwi.internal";
  config.configured = true;  // Provisioning bypassed
  wifi_config_loaded_ = true;
  return true;
#endif
```

**Wokwi-spezifische Vereinfachungen:**
- Watchdog deaktiviert (`main.cpp:164-167`)
- Factory Reset Check uebersprungen (`main.cpp:179-242`)
- Boot ist vereinfacht fuer Testing

### 2.2 Boot Serial Output Pattern

```
[WOKWI] Serial initialized - simulation mode active
ESP32 Sensor Network v4.0 (Phase 2)
Chip Model: ESP32-D0WDQ6, CPU Frequency: 240 MHz
[GPIO] GPIO SAFE-MODE INITIALIZATION
[CORE] Phase 1: Core Infrastructure READY
[WiFi] WiFi connected successfully
[MQTT] MQTT connected successfully
[COMM] Phase 2: Communication Layer READY
[HAL] Phase 3: Hardware Abstraction READY
[SENSOR] Phase 4: Sensor System READY
[ACTUATOR] Phase 5: Actuator System READY
```

Validiert gegen `boot_full.yaml`.

### 2.3 MQTT Topics & Payloads

**Heartbeat Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`

**Heartbeat Payload** (`mqtt_client.cpp:686-748`):
```json
{
  "esp_id": "ESP_00000001",
  "zone_id": "", "master_zone_id": "",
  "zone_assigned": false,
  "ts": 1735818000, "uptime": 120,
  "heap_free": 180000, "wifi_rssi": -45,
  "sensor_count": 3, "actuator_count": 2,
  "gpio_status": [...], "gpio_reserved_count": 5,
  "config_status": {...}
}
```

**Heartbeat Interval:** 60 Sekunden (`mqtt_client.h:117`)
**KORREKTUR:** esp32-debug Skill sagte faelschlich "~5s". Tatsaechlich: 60s.

**Alle ESP32 Publish-Topics:**
- `kaiser/{id}/esp/{esp}/sensor/{gpio}/data` (QoS 1)
- `kaiser/{id}/esp/{esp}/actuator/{gpio}/status` (QoS 1)
- `kaiser/{id}/esp/{esp}/system/heartbeat` (QoS 0)
- `kaiser/{id}/esp/{esp}/system/error` (QoS 1)
- `kaiser/{id}/esp/{esp}/system/will` (LWT, QoS 1)

### 2.4 Device Approval Fields in NVS

```cpp
static const char* NVS_DEV_APPROVED = "dev_appr";
static const char* NVS_APPR_TS = "appr_ts";
```

**CRITICAL FINDING:** ESP32 hat NVS-Felder fuer Approval, aber unter WOKWI_SIMULATION werden diese NIE GESCHRIEBEN weil Provisioning uebersprungen wird und NVS nicht persistiert.

### 2.5 Wokwi-Specific Code Locations

| Feature | File | Purpose |
|---------|------|---------|
| WOKWI_SIMULATION Guard | config_manager.cpp:71-111 | Compile-time credentials |
| Watchdog Disable | main.cpp:164-167 | Prevent false WDT in sim |
| Factory Reset Disable | main.cpp:179-242 | Prevent false GPIO 0 trigger |
| OneWire Timing | onewire_bus.cpp:66 | Adjust timing for virtual bus |
| Serial Delay | main.cpp:136-139 | 500ms for Wokwi UART init |

---

## 3. ESP32 Development Analysis (2026-02-11)

### 3.1 WOKWI_ESP_ID Trace

**Code Location:** `config_manager.cpp:1325-1360`

```cpp
void ConfigManager::generateESPIdIfMissing() {
  if (system_config_.esp_id.length() == 0) {
    #ifdef WOKWI_SIMULATION
      #ifdef WOKWI_ESP_ID
        system_config_.esp_id = WOKWI_ESP_ID;  // LINE 1332
      #else
        system_config_.esp_id = "ESP_WOKWI001";  // Fallback
      #endif
      saveSystemConfig(system_config_);
      return;
    #endif
    // NORMAL MODE: Generate from MAC address
    WiFi.macAddress(mac);
    snprintf(esp_id, sizeof(esp_id), "ESP_%02X%02X%02X", mac[3], mac[4], mac[5]);
  }
}
```

**Call Chain:** `setup()` → `ConfigManager::begin()` → `loadSystemConfig()` → `generateESPIdIfMissing()` → `WOKWI_ESP_ID = "ESP_00000001"`

### 3.2 confirmRegistration() Trace

**Call Location:** `main.cpp:1660-1671`

```cpp
// MQTT callback: kaiser/{id}/system/heartbeat/ack
if (topic.endsWith("/system/heartbeat/ack")) {
    mqttClient.confirmRegistration();  // LINE 1671
}
```

**Call Chain:**
```
Server heartbeat_handler.py → Publishes heartbeat_ack
  → MQTT Broker → ESP32 callback → confirmRegistration()
```

### 3.3 Registration Gate

**Purpose:** Verhindert Sensor/Actuator-Publishes bis Server die ESP32-Existenz via Heartbeat-ACK bestaetigt.

**Implementation** (`mqtt_client.cpp:520-539`):
```cpp
bool MQTTClient::publish(const String& topic, const String& payload, uint8_t qos) {
    bool is_heartbeat = topic.indexOf("/system/heartbeat") != -1;
    if (!registration_confirmed_ && !is_heartbeat) {
        if ((millis() - registration_start_ms_) > REGISTRATION_TIMEOUT_MS) {
            registration_confirmed_ = true;  // 10s Fallback
        } else {
            return false;  // BLOCKED
        }
    }
    // ... actual publish ...
}
```

| State | Condition | Behavior |
|-------|-----------|----------|
| CLOSED | `registration_confirmed_ = false` | Blocks ALL publishes except heartbeat |
| OPEN | `registration_confirmed_ = true` | All publishes allowed |

**Opening:** Heartbeat ACK (primary) oder 10s Timeout (fallback)
**Closing:** MQTT Disconnect oder Connection Loss

**Serial Output bei Registration:**
```
[MQTT] Publish blocked (awaiting registration): .../sensor/4/data
[INFO] REGISTRATION CONFIRMED BY SERVER
[MQTT] Published: .../sensor/4/data  ← NOW ALLOWED
```

**Impact auf Wokwi:** Heartbeat ACK kommt typischerweise in 1-2s. 10s Timeout als Fallback.

### 3.4 Kaiser ID Population

**Default:** `kaiser_id = "god"` (Struct-Initialisierung in `system_types.h:34-47`)
**Update:** Via MQTT Zone-Assignment-Command (`main.cpp:1362-1439`)
**Wokwi:** Startet immer mit `kaiser_id = "god"` (via `TopicBuilder::setKaiserId("god")` in `setup()`)

### 3.5 Multi-ESP-ID Support Design

**Problem:** Alle Wokwi-Szenarien nutzen `ESP_00000001` (platformio.ini).

**3 Optionen analysiert:**

**Option A: Scenario-Specific Build Flags (EMPFOHLEN)**
```ini
[env:wokwi_esp01]
extends = env:wokwi_simulation
build_flags = ${env:wokwi_simulation.build_flags} -D WOKWI_ESP_ID=\"ESP_00000001\"

[env:wokwi_esp02]
extends = env:wokwi_simulation
build_flags = ${env:wokwi_simulation.build_flags} -D WOKWI_ESP_ID=\"ESP_00000002\"
```

Pro: Production-ready, CI-friendly, keine Code-Aenderungen
Contra: Mehrere Firmware-Binaries, laengere CI-Build-Zeit

**Option B: Runtime ESP ID Override via MQTT** — Komplex, Race Conditions moeglich
**Option C: MAC Address als ESP ID** — Wokwi MAC-Support unzuverlaessig

**Empfehlung:** Option A mit 3 Environments initial, erweiterbar auf 10+.

### 3.6 Wokwi Boot Flow Summary

```
1. PlatformIO compiles with -D WOKWI_SIMULATION=1
2. ESP32 boots → ConfigManager.loadWiFiConfig() → config.configured = true
3. Provisioning SKIPPED
4. WiFi.connect("Wokwi-GUEST") → instant
5. MQTT.connect("host.wokwi.internal:1883")
6. publishHeartbeat(force=true) → kaiser/god/esp/ESP_00000001/system/heartbeat
7. Server receives heartbeat → device registration/status update
```

---

## Priorisierte Problemliste

### KRITISCH
- **Kein Device-Approval-Flow implementiert** — DB-Schema vorhanden, Code fehlt. Devices werden bei Discovery sofort "online" gesetzt.
- **CI-Coverage-Diskrepanz:** 24 vs 138 Szenarien unklar (Python-Runner Status ungeklaert)
- **I2C-Kategorie:** 20 Szenarien, 0% CI-Coverage

### WARNUNG
- **Makefile-Targets fuer Wokwi fehlen komplett** — dokumentiert aber nicht implementiert
- **system/diagnostics hat KEINEN Server-Handler** — ESP32 HealthMonitor published ins Leere
- **Alle Wokwi-Tests nutzen gleiche ESP_00000001** — kein Multi-Device-Test moeglich
- **Heartbeat-Intervall-Mismatch:** esp32-debug Skill sagt "~5s", tatsaechlich 60s
- **Szenarien-Qualitaet (Extended):** NVS/PWM-Szenarien teilweise unvollstaendig

### INFO
- **Registration Gate** ist production-grade Safety-Mechanismus (10s Timeout Fallback)
- **ESP32 Approval-NVS-Felder** existieren aber werden in Wokwi nie geschrieben
- **Wokwi RFC2217 Port 4000** validiert Serial-to-TCP-Bridge Ansatz

---

## Empfehlungen an TM

### Prioritaet 1: Sofort
1. **Makefile-Targets implementieren** (1-2h) — `wokwi-build`, `wokwi-test-boot`, `wokwi-test-full`
2. **CI-Coverage klaeren** (1h) — Python-Runner Status pruefen
3. **system/diagnostics als deprecated markieren** (30min)

### Prioritaet 2: Kurzfristig
4. **Multi-ESP-ID Support** (Option A, 4-6h) — 3 platformio.ini Environments
5. **Seed-Script erweitern** (2h) — 3 Devices + Default Sensors/Actuators
6. **Flaky-Test analysieren** (2h) — boot_full Timeout beheben

### Prioritaet 3: Mittelfristig
7. **Device-Approval-Flow** (12-16h) — MQTT-basiert, Full-Stack
8. **Extended Szenarien-Qualitaet** (8-12h) — NVS/PWM/I2C vervollstaendigen

---

## Quelldateien

- `wokwi-analysis-2026-02-10.md` (852 Zeilen, esp32-dev + test-log-analyst, 2026-02-10)
- `wokwi-esp32-analysis-2026-02-11.md` (430 Zeilen, esp32-debug, 2026-02-11)
- `wokwi-esp32-development-2026-02-11.md` (632 Zeilen, esp32-development, 2026-02-11)

*Konsolidiert am 2026-02-11. Alle Quelldateien archiviert.*
