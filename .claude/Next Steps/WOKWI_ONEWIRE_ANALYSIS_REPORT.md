# Wokwi OneWire-Support-Analyse

**Erstellt:** 2026-01-15  
**Status:** Analyse abgeschlossen  
**Priorität:** 🔴 CRITICAL - Blockiert Testing ohne Hardware

---

## 🎯 Ergebnis: ✅ WOKWI UNTERSTÜTZT DS18B20!

Die Analyse zeigt: **OneWire/DS18B20 wird von Wokwi vollständig unterstützt** und ist in diesem Projekt bereits korrekt konfiguriert!

---

## 📋 Task 1.1: Wokwi Projekt-Konfiguration

### diagram.json
**Status:** ✅ Gefunden  
**Pfad:** `El Trabajante/diagram.json`  
**DS18B20 definiert:** ✅ JA (GPIO 4 / D4)

```json
{
  "type": "wokwi-ds18b20",
  "id": "temp1",
  "top": 150,
  "left": 0,
  "attrs": {
    "temperature": "22.5"
  }
}
```

**Verbindungen:** ✅ Korrekt konfiguriert
- `esp:GND.1` → `temp1:GND` (schwarz)
- `esp:3V3` → `temp1:VCC` (rot)
- `esp:D4` → `temp1:DQ` (grün) **← GPIO 4!**
- Pull-up: 4.7kΩ zwischen VCC und DQ ✅

### platformio.ini
**OneWire-Library:** `paulstoffregen/OneWire@^2.3.7` ✅  
**DallasTemperature:** `milesburton/DallasTemperature@^3.11.0` ✅  
**Wokwi-Kompatibilität:** ✅ Voll kompatibel (Standard-Libraries)

### wokwi.toml
**Status:** ✅ Korrekt konfiguriert
- `gateway = true` (für MQTT-Durchleitung)
- `rfc2217ServerPort = 4000` (für Serial-Monitor)
- Firmware-Pfad: `.pio/build/wokwi_simulation/firmware.bin`

---

## 📋 Task 1.2: Wokwi DS18B20-Support

### Offizielle Dokumentation
**Status:** ✅ Vollständig unterstützt

Laut Wokwi-Dokumentation (docs.wokwi.com):
- DS18B20 ist unter "Sensors" als unterstützte Komponente gelistet
- ESP32 (inkl. ESP32-S2, ESP32-S3) wird vollständig unterstützt
- Mehrere DS18B20 auf einem Bus werden unterstützt

### Beispiel-Projekte
Es existieren funktionierende Wokwi-Projekte mit ESP32 + DS18B20:
- Einzelsensor-Projekte
- Multi-Sensor auf einem OneWire-Bus
- Mit OneWire.h und DallasTemperature.h Libraries

### Benötigte Konfiguration (bereits vorhanden!)

**diagram.json Anforderungen:**
```json
{
  "type": "wokwi-ds18b20",
  "id": "temp1",
  "attrs": {
    "temperature": "22.5"  // Simulierte Temperatur
  }
}
```

**Verbindungen:**
- VCC → 3.3V
- GND → GND
- DQ → GPIO mit Pull-up (4.7kΩ)

---

## 📋 Task 1.3: ESP-Code-Analyse

### Hardware-Konfiguration
**Datei:** `El Trabajante/src/config/hardware/esp32_dev.h`

```cpp
constexpr uint8_t DEFAULT_ONEWIRE_PIN = 4;  // ✅ Matcht diagram.json!
```

### OneWire-Scan Command Handler
**Datei:** `El Trabajante/src/main.cpp` (Zeilen 736-808)

```cpp
else if (command == "onewire/scan") {
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  ONEWIRE SCAN COMMAND RECEIVED        ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  uint8_t pin = doc["pin"] | HardwareConfig::DEFAULT_ONEWIRE_PIN;
  // ... Scan-Logik ...
}
```

### onewire_bus.cpp Scan-Implementation
**Datei:** `El Trabajante/src/drivers/onewire_bus.cpp` (Zeilen 139-186)

```cpp
bool OneWireBusManager::scanDevices(uint8_t rom_codes[][8], 
                                     uint8_t max_devices, 
                                     uint8_t& found_count) {
  LOG_INFO("OneWire bus scan started");
  
  onewire_->reset_search();
  
  uint8_t rom[8];
  while (onewire_->search(rom)) {
    // CRC-Check
    if (OneWire::crc8(rom, 7) != rom[7]) {
      LOG_WARNING("OneWire CRC error - device ignored");
      continue;
    }
    // ... Store ROM code ...
  }
  
  LOG_INFO("OneWire bus scan complete: " + String(found_count) + " devices found");
  return true;
}
```

### Code-Status: ✅ KORREKT
- Command-Handler vorhanden und korrekt implementiert
- GPIO-Default (4) matcht diagram.json
- Logging ist aktiviert für Debugging
- CRC-Validierung implementiert

---

## 🔍 Warum funktioniert es dann nicht?

### Mögliche Ursachen (nach Priorität):

#### 1. 🔴 MQTT-Verbindung nicht hergestellt
**Problem:** Der ESP im Wokwi empfängt den Scan-Command nicht, weil MQTT nicht verbunden ist.

**Diagnose:**
```bash
# In Wokwi-Console nach diesen Logs suchen:
"MQTT connected"
"Subscribed to: kaiser/god/esp/..."
```

**Lösung:**
1. Mosquitto MQTT-Broker auf Host-Rechner starten
2. Windows Firewall: Port 1883 freigeben
3. In wokwi.toml: `gateway = true` (bereits gesetzt)
4. Host-IP prüfen: `host.wokwi.internal` muss auflösbar sein

#### 2. 🟡 Wokwi-Simulation nicht gestartet
**Problem:** Die Firmware wurde gebaut, aber Wokwi läuft nicht.

**Diagnose:**
```bash
# Build für Wokwi
pio run -e wokwi_simulation

# Wokwi starten
wokwi-cli run --timeout 60000
```

**Lösung:**
1. Firmware bauen: `pio run -e wokwi_simulation`
2. Wokwi starten: `wokwi-cli run`
3. Oder: In VS Code mit Wokwi-Extension öffnen

#### 3. 🟢 OneWire-Timing in Simulation
**Problem:** Wokwi simuliert möglicherweise Timing anders als echte Hardware.

**Diagnose:** Wenn MQTT funktioniert aber Scan 0 Devices zurückgibt:
```bash
# In Wokwi-Console:
"OneWire bus reset failed - no devices present"
```

**Lösung:**
- Wokwi diagram.json neu laden
- DS18B20 Komponente ggf. entfernen und neu hinzufügen
- Verbindungen überprüfen

---

## 📊 Konfigurations-Abgleich

| Komponente | diagram.json | Code | Status |
|------------|--------------|------|--------|
| DS18B20 | ✅ temp1 | - | Definiert |
| GPIO | D4 (=GPIO 4) | DEFAULT_ONEWIRE_PIN = 4 | ✅ Match |
| Pull-up | 4.7kΩ (r1) | - | ✅ Korrekt |
| Board | esp32-devkit-v1 | BOARD_TYPE = "ESP32_WROOM_32" | ✅ Kompatibel |

---

## 🚀 Nächste Schritte

### Sofort tun:
1. **MQTT-Broker starten:**
   ```bash
   cd "El Servador/god_kaiser_server"
   mosquitto -c mosquitto_minimal.conf
   ```

2. **Wokwi starten:**
   ```bash
   cd "El Trabajante"
   pio run -e wokwi_simulation
   wokwi-cli run --timeout 120000
   ```

3. **Log-Output beobachten:**
   - Suche nach: `ONEWIRE SCAN COMMAND RECEIVED`
   - Falls nicht: MQTT-Problem
   - Falls ja aber 0 Devices: Wokwi OneWire-Problem

### Falls Wokwi trotzdem nicht funktioniert:
**Alternative Testing-Strategy:** Mock-ESP verwenden

Der Server hat eine Mock-Implementierung für OneWire-Scan:
- Mock-ESP erstellen (ESP_MOCK_xxx)
- OneWire-Scan auf Mock-ESP liefert 3 simulierte Devices
- Zum Testen der UI/UX ausreichend
- Hardware-Tests mit echtem ESP32 später

---

## 📁 Analysierte Dateien

| Datei | Pfad |
|-------|------|
| diagram.json | `El Trabajante/diagram.json` |
| platformio.ini | `El Trabajante/platformio.ini` |
| wokwi.toml | `El Trabajante/wokwi.toml` |
| esp32_dev.h | `El Trabajante/src/config/hardware/esp32_dev.h` |
| main.cpp | `El Trabajante/src/main.cpp` |
| onewire_bus.cpp | `El Trabajante/src/drivers/onewire_bus.cpp` |
| sensors.py | `El Servador/god_kaiser_server/src/api/v1/sensors.py` |
