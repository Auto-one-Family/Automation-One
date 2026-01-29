# Wokwi ESP32-Simulation - Analyse-Bericht

**Datum:** 2026-01-27
**Analyst:** Claude Code (Opus 4.5)

---

## 1. Konfiguration

### wokwi.toml
- **Firmware:** `.pio/build/wokwi_simulation/firmware.bin` + `.elf`
- **Version:** 1
- **RFC2217 Serial Port:** 4000 (externes Logging)
- **Network Gateway:** `true` (host.wokwi.internal → localhost)
- **Baud Rate:** 115200
- **GDB Debugging:** Optional, Port 3333 (deaktiviert)

### diagram.json
- **ESP32-Typ:** `wokwi-esp32-devkit-v1` (WROOM)
- **Komponenten:**
  - 1x DS18B20 Temperatur-Sensor (22.5°C vorkonfiguriert)
  - 1x Grüne LED
  - 1x 4.7kΩ Pull-Up Widerstand (OneWire)
  - 1x 220Ω Vorwiderstand (LED)
- **GPIO-Belegung:**
  - GPIO 4 → DS18B20 DQ (OneWire Data)
  - GPIO 5 → LED (über 220Ω)
  - GND.1 → DS18B20 GND
  - GND.2 → LED Kathode
  - 3V3 → DS18B20 VCC
- **WiFi Gateway:** ja (`gateway = true` in wokwi.toml)

### platformio.ini (wokwi_simulation)
- **Basis:** `extends = env:esp32_dev` (erbt alle esp32_dev Flags)
- **Zusätzliche Flags:**
  - `WOKWI_SIMULATION=1`
  - `WOKWI_WIFI_SSID="Wokwi-GUEST"` (offenes Netzwerk)
  - `WOKWI_WIFI_PASSWORD=""` (kein Passwort)
  - `WOKWI_MQTT_HOST="host.wokwi.internal"` (→ localhost)
  - `WOKWI_MQTT_PORT=1883` (kein TLS)
  - `WOKWI_ESP_ID="ESP_00000001"` (feste ID)
- **Geerbte Flags:** ESP32_DEV_MODE, MAX_SENSORS=20, MAX_ACTUATORS=12, alle Kernel-Features

---

## 2. Build-Ergebnis

- **Status:** ERFOLG
- **Warnungen:** Keine kritischen (Build-Prozess sauber)
- **Output-Dateien:**
  - `firmware.bin` — 1.148.656 Bytes (1.09 MB)
  - `firmware.elf` — 18.443.952 Bytes (Debug-Symbols)
  - `firmware.map` — 13.520.533 Bytes
- **RAM:** 22.3% (73.140 / 327.680 Bytes)
- **Flash:** 87.1% (1.142.073 / 1.310.720 Bytes)
- **Build-Dauer:** 38.9 Sekunden

### Unterschied zu esp32_dev
Der Wokwi-Build ist identisch zum esp32_dev plus 6 Wokwi-spezifische Defines. Gleiche Libraries, gleiche Partition-Table. Flash-Verbrauch ist nahezu identisch.

---

## 3. Firmware-Code: Wokwi-Anpassungen

Der `#ifdef WOKWI_SIMULATION` Guard wird an **10 Stellen** im Code verwendet:

| Datei | Zeile(n) | Anpassung |
|-------|----------|-----------|
| `main.cpp:128` | UART Init | 500ms Delay (statt 100ms) für virtuellen Serial |
| `main.cpp:157` | Watchdog | **Komplett deaktiviert** (`WDT_DISABLED`) |
| `main.cpp:172` | Boot-Button | Factory-Reset-Check übersprungen (GPIO 0 floated) |
| `main.cpp:359` | Provisioning | AP-Mode übersprungen, direkt WiFi-Connect |
| `main.cpp:1543` | Loop Watchdog | `esp_task_wdt_reset()` übersprungen |
| `config_manager.cpp:68` | Credentials | Compile-Time WiFi/MQTT statt NVS |
| `config_manager.cpp:1260` | ESP-ID | Feste ID `ESP_00000001` statt MAC-basiert |
| `config_manager.cpp:1506,1662,1981` | NVS | Sensor/Actuator Config nur in RAM (kein NVS) |
| `config_manager.cpp:1702,2098` | NVS Load | Gibt `false` zurück (keine persistenten Daten) |
| `onewire_bus.cpp:66` | Debug | Wokwi-spezifische Logmeldung |
| `provision_manager.cpp:820` | Server-IP | Fallback auf `host.wokwi.internal` |
| `provision_manager.cpp:833` | MQTT-Port | Default 1883 statt 8883 (kein TLS) |

---

## 4. Test-Szenarien

### Verfügbare Szenarien (14 total)

| Kategorie | Szenario | CI/CD Integriert |
|-----------|----------|-----------------|
| **01-boot** | `boot_full.yaml` | Ja |
| **01-boot** | `boot_safe_mode.yaml` | Ja |
| **02-sensor** | `sensor_heartbeat.yaml` | Ja |
| **02-sensor** | `sensor_ds18b20_read.yaml` | Ja |
| **03-actuator** | `actuator_led_on.yaml` | Nein |
| **03-actuator** | `actuator_pwm.yaml` | Nein |
| **03-actuator** | `actuator_status_publish.yaml` | Nein |
| **03-actuator** | `actuator_emergency_clear.yaml` | Nein |
| **04-zone** | `zone_assignment.yaml` | Nein |
| **04-zone** | `subzone_assignment.yaml` | Nein |
| **05-emergency** | `emergency_broadcast.yaml` | Nein |
| **05-emergency** | `emergency_esp_stop.yaml` | Nein |
| **06-config** | `config_sensor_add.yaml` | Nein |
| **06-config** | `config_actuator_add.yaml` | Nein |

Plus 2 Legacy-Szenarien im Root (`boot_test.yaml`, `mqtt_connection.yaml`).

### CI/CD Workflow (wokwi-tests.yml)

5 Jobs: `build-firmware` → parallel `boot-tests`, `sensor-tests`, `mqtt-connection-test` → `test-summary`

- Build: Ubuntu latest, PlatformIO, Firmware als Artifact
- Tests: Mosquitto Docker, Wokwi CLI, 90s Timeout, Logs als Artifacts (7 Tage)
- Summary: Markdown-Tabelle in GitHub Step Summary

### boot_test.yaml prüft
- Phase 0: ESP32 Boot, Chip Model, Watchdog
- Phase 1: GPIO Safe-Mode, Logger, ConfigManager, Wokwi-Mode
- Phase 2: WiFi Connect, MQTT Connect
- Phase 3: I2C Bus Init
- Phase 4-5: Sensor/Actuator System
- Heartbeat (bestätigt vollständigen Boot)

### mqtt_connection.yaml prüft
- WiFi Connected + IP
- MQTTClient Init
- MQTT Connected
- Topic Subscriptions
- Initial Heartbeat
- Free Heap (stabile Operation)

---

## 5. Logs-Zugriff

| Log-Typ | Speicherort | Befehl |
|---------|-------------|--------|
| Serial (lokal) | stdout / RFC2217 Port 4000 | `wokwi-cli . --timeout 0` |
| Serial (persistent) | `El Trabajante/logs/wokwi_serial.log` | Serial Logger Script |
| CI/CD | GitHub Actions | `gh run view <id> --log` |
| CI/CD Artifacts | Download | `gh run download <id>` |
| MQTT Traffic | Broker | `mosquitto_sub -h localhost -t "kaiser/#" -v` |

---

## 6. Limitierungen

### Bestätigt funktioniert
- WiFi-Verbindung (Wokwi-GUEST, IP 10.13.37.2)
- MQTT-Verbindung zu localhost via `host.wokwi.internal`
- DS18B20 OneWire Sensor-Simulation (Wert konfigurierbar)
- LED/GPIO Output
- Serial Monitor (115200 Baud)
- NTP Time Sync
- Heartbeat Publishing
- MQTT Topic Subscriptions
- Boot-Sequenz (alle 5 Phasen)
- RFC2217 Serial Port (externes Logging)

### Bestätigt NICHT funktioniert / eingeschränkt
- **Watchdog (esp_task_wdt):** Deaktiviert in Simulation (nicht unterstützt)
- **NVS/Preferences:** Nicht persistent — Config nur in RAM
- **Boot-Button (GPIO 0):** Floatet LOW, Factory-Reset übersprungen
- **TLS/SSL MQTT:** Nicht konfiguriert (Port 1883, kein TLS)
- **VS Code Wokwi Extension Netzwerk:** Eingeschränkter Support, CLI bevorzugen
- **MQTT nach Standby:** Verbindung geht verloren, Neustart nötig (Bug T)
- **DNS nach erstem Fehler:** Hostname-Resolution kann fehlschlagen (Bug in Wokwi?)

### Ungetestet / Unklar
- I2C Sensor-Simulation (SHT31, BME280) — kein Device in diagram.json
- PWM-Actuator-Simulation
- Timing-Genauigkeit von `millis()`
- Mehrkanalige OneWire-Busse
- Multi-Sensor-Betrieb
- Actuator/Zone/Emergency-Szenarien (03-06, nicht in CI)

### Bekannte Bugs

| Bug | Status | Beschreibung | Lösung |
|-----|--------|--------------|--------|
| **Bug R** | GEFIXT | Timezone-Anzeige 1h falsch im Frontend | `normalizeTimestamp()` in formatters.ts |
| **Bug S** | GEFIXT | Ungültige ESP-ID `ESP_WOKWI001` in DB | Gelöscht, korrekt: `ESP_00000001` |
| **Bug T** | BEKANNT | MQTT-Verbindung geht nach PC-Standby verloren | Wokwi CLI neu starten |
| **Firewall** | GEFIXT | Windows Firewall blockierte Port 1883 | Firewall-Regel hinzugefügt |
| **kaiser_id leer** | GEFIXT | Topics `kaiser//esp/...` statt `kaiser/god/esp/...` | Default `"god"` in system_types.h |
| **DNS leer** | BEKANNT | DNS Failed nach erstem Verbindungsfehler | Wokwi neu starten oder IP verwenden |

---

## 7. Server-Integration

- **ESP in DB registrieren:** `poetry run python scripts/seed_wokwi_esp.py` (ESP_00000001)
- **End-to-End verifiziert:** Ja (Stand 2026-01-06)
  - Wokwi → WiFi → MQTT → Mosquitto → Server empfängt Heartbeat
  - ESP erscheint als "online" im Frontend
- **Voraussetzungen:**
  1. Mosquitto läuft als Windows Service (Port 1883)
  2. Windows Firewall erlaubt Port 1883
  3. Server läuft (`uvicorn`)
  4. ESP_00000001 in DB registriert
  5. Firmware gebaut (`pio run -e wokwi_simulation`)

---

## 8. Empfehlungen

### Geeignet für Wokwi-Tests
- Boot-Sequenz und Initialisierungs-Reihenfolge
- WiFi/MQTT Connectivity
- Heartbeat und Diagnostics Publishing
- OneWire DS18B20 Sensor-Reading (simulierter Wert)
- LED/GPIO Output-Verifizierung
- Config-Manager Wokwi-Modus
- MQTT Topic-Korrektheit
- End-to-End Server-Integration (Heartbeat → DB)
- CI/CD Regression-Tests

### NICHT geeignet / braucht echte Hardware
- Watchdog-Verhalten und Recovery
- NVS Persistenz über Neustarts
- TLS/SSL MQTT-Verbindungen
- Echte Sensor-Kalibrierung und Drift
- I2C Multi-Device Bus-Probleme
- PWM-Timing-Präzision
- Factory-Reset via Boot-Button
- Langzeit-Stabilitätstests (MQTT-Reconnect nach Standby)

### Nächste Schritte
1. **CI/CD erweitern:** Actuator-, Zone-, Emergency-Szenarien (03-06) in Workflow integrieren
2. **MQTT Injection:** `helpers/mqtt_inject.py` nutzen um Server→ESP Commands in CI zu testen
3. **I2C Devices:** SHT31 oder BME280 zu diagram.json hinzufügen
4. **Wokwi Scenarios Coverage:** Aktuell nur 4/14 Szenarien in CI integriert
