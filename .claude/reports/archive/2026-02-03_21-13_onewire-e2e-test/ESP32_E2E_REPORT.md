# ESP32 E2E Debug Report

> **Session:** 2026-02-03_21-13_onewire-e2e-test
> **Agent:** esp32-debug
> **Analysiert:** 2026-02-03 21:24+
> **Log-Datei:** `logs/current/esp32_serial.log` (319 Zeilen)
> **ESP-ID:** ESP_472204

---

## Executive Summary

| Phase | Status | Kritische Befunde |
|-------|--------|-------------------|
| Boot | ✅ PASS | Sauber, alle Module initialisiert |
| WiFi | ✅ PASS | Verbunden in ~2s, RSSI: -45 dBm (gut) |
| MQTT | ✅ PASS | Verbunden, alle 11 Topic-Subscriptions OK |
| Heartbeat | ✅ PASS | Initial gesendet, ACKs empfangen |
| OneWire Discovery | 🔴 FAIL | **Keine Geräte gefunden (Zeile 194)** |
| Sensor Config | 🔴 FAIL | **GPIO-Konflikt Error 1002 (Zeile 266-268)** |
| Actuator Config | ✅ PASS | GPIO 26 erfolgreich konfiguriert |
| Actuator Commands | ✅ PASS | ON/OFF funktionieren korrekt |

**GESAMTERGEBNIS: 🟡 TEILWEISE ERFOLGREICH**
- Actuator-Flow: 100% funktional
- Sensor-Flow: 0% funktional (OneWire-Hardware-Problem + GPIO-Konflikt)

---

## Phase 1: Boot-Sequenz

### Boot-Banner ✅
```
Zeile 22-24:
╔════════════════════════════════════════╗
║  ESP32 Sensor Network v4.0 (Phase 2)  ║
╚════════════════════════════════════════╝
```
**Status:** Korrekt erschienen gemäß `main.cpp:140-145`

### Hardware-Info
| Attribut | Wert | Zeile |
|----------|------|-------|
| Chip Model | ESP32-D0WD-V3 | 25 |
| CPU Frequency | 240 MHz | 26 |
| Free Heap | 265608 bytes | 27 |

### GPIO Safe-Mode Initialization
| GPIO | Status | Zeile |
|------|--------|-------|
| GPIO 4 | ⚠️ Verification failed (got 0) | 32-33 |
| GPIO 26 | ⚠️ Verification failed (got 0) | 34-35 |
| GPIO 21 | ✅ I2C_SDA reserviert | 36 |
| GPIO 22 | ✅ I2C_SCL reserviert | 37 |

**Bewertung:** Die Warnings für GPIO 4/26 sind erwartet (Pull-up Verification im Safe-Mode).

### Config Manager Phase 1
| Config | Status | Details | Zeile |
|--------|--------|---------|-------|
| WiFi | ✅ Loaded | SSID: Vodafone-6F44, Server: 192.168.0.194 | 56 |
| Zone | ✅ Loaded | Zone: test_zone, Kaiser: god | 60 |
| System | ✅ Loaded | ESP ID: ESP_472204, Boot #4 | 63, 82 |

**NVS Warnings (ignorierbar):**
- `legacy_master_zone_id NOT_FOUND` (Zeile 58, 67)
- `legacy_master_zone_name NOT_FOUND` (Zeile 59, 68)
- `safe_mode_reason NOT_FOUND` (Zeile 62, 71)

### Watchdog
```
Zeile 84-89:
✅ Watchdog: 60s timeout, auto-reboot enabled
   Feed requirement: Every 10s
```

### Phase 1 Complete ✅
```
Zeile 94-107:
╔════════════════════════════════════════╗
║   Phase 1: Core Infrastructure READY  ║
╚════════════════════════════════════════╝
```

---

## Phase 2: Communication Layer

### WiFi Verbindung ✅

| Timestamp | Event | Zeile |
|-----------|-------|-------|
| [790] | WiFiManager initialized | 112 |
| [791] | Connecting to WiFi: Vodafone-6F44 | 113 |
| [3223] | ⚠️ WiFi Warning: NO_AP_FOUND (kurzer Scan) | 114 |
| [3409] | ✅ **WiFi connected! IP: 192.168.0.148** | 115 |
| [3409] | WiFi RSSI: -45 dBm | 116 |

**Verbindungszeit:** ~2.6 Sekunden (< 10s Erwartung ✅)
**Signalstärke:** -45 dBm (Excellent)

### NTP Synchronization ✅

| Timestamp | Event | Zeile |
|-----------|-------|-------|
| [3420-3461] | NTP servers configured | 121-124 |
| [6004-6036] | ✅ **NTP Sync Successful** | 125-130 |

**Unix Timestamp:** 1770149674
**Formatted:** 2026-02-03T20:14:34Z

### MQTT Verbindung ✅

| Timestamp | Event | Zeile |
|-----------|-------|-------|
| [6057] | MQTT connect() called | 133 |
| [6141] | Connecting to broker: 192.168.0.194:1883 | 137 |
| [6433] | mqtt_.connect() returned true | 143 |
| [6475] | ✅ **MQTT connected!** | 145 |
| [6515] | ✅ **Initial heartbeat sent** | 151 |

**Verbindungszeit:** ~2 Sekunden nach WiFi (< 5s Erwartung ✅)
**Last-Will Topic:** `kaiser/god/esp/ESP_472204/system/will`

### Topic Subscriptions ✅

| Topic | Zeile |
|-------|-------|
| `kaiser/god/esp/ESP_472204/system/command` | 152 |
| `kaiser/god/esp/ESP_472204/config` | 153 |
| `kaiser/broadcast/emergency` | 154 |
| `kaiser/god/esp/ESP_472204/actuator/+/command` | 155 |
| `kaiser/god/esp/ESP_472204/actuator/emergency` | 156 |
| `kaiser/god/esp/ESP_472204/zone/assign` | 157 |
| `kaiser/god/esp/ESP_472204/subzone/assign` | 158 |
| `kaiser/god/esp/ESP_472204/subzone/remove` | 159 |
| `kaiser/god/esp/ESP_472204/sensor/+/command` | 160 |
| `kaiser/god/esp/ESP_472204/system/heartbeat/ack` | 161 |

**Alle 11 Subscriptions erfolgreich.**

### Phase 2 Complete ✅
```
Zeile 164-166:
╔════════════════════════════════════════╗
║   Phase 2: Communication Layer READY  ║
╚════════════════════════════════════════╝
```

---

## Phase 3: Hardware Abstraction Layer

### I2C Bus Manager ✅
| Attribut | Wert | Zeile |
|----------|------|-------|
| SDA | GPIO 21 | 187 |
| SCL | GPIO 22 | 188 |
| Frequency | 100 kHz | 189 |

### OneWire Bus Manager 🔴 KRITISCH

| Timestamp | Event | Status | Zeile |
|-----------|-------|--------|-------|
| [6764] | OneWireBus: Using hardware default pin GPIO 4 | ✅ | 192 |
| [6775] | GPIOManager: Pin 4 allocated to OneWireBus | ✅ | 193 |
| [6775] | **OneWire bus reset failed - no devices present or bus error** | 🔴 | 194 |

**KRITISCHES PROBLEM:**
- Kein DS18B20 gefunden
- Keine "DS18B20: Found X devices" Meldung
- Keine "ROM: 28-XX-..." Meldung

**Mögliche Ursachen:**
1. DS18B20 nicht angeschlossen
2. Falsche Verkabelung (Data-Pin nicht auf GPIO 4)
3. **4.7kΩ Pull-up Widerstand fehlt** (häufigste Ursache)
4. Defekter Sensor

### PWM Controller ✅
| Attribut | Wert | Zeile |
|----------|------|-------|
| Channels | 16 | 202 |
| Default Frequency | 1000 Hz | 203 |
| Default Resolution | 12 bits | 204 |

---

## Phase 4 & 5: Sensor & Actuator Systems

### Sensor Manager ✅
- Initialisiert (Zeile 222-228)
- Measurement interval: 5000 ms (Zeile 229)
- 0 Sensor configs aus NVS (erwartet - Server-Centric)

### Actuator Manager ✅
- SafetyController initialisiert (Zeile 247-248)
- ActuatorManager initialisiert (Zeile 249-250)
- Wartet auf MQTT configs

---

## Heartbeat Flow

### Initial Heartbeat ✅
```
Zeile 151: [6515] Initial heartbeat sent for ESP registration
```

### Registration Timeout ⚠️
```
Zeile 257: [60027] WARNING: Registration timeout - opening gate (fallback)
```
**Bewertung:** Dies ist erwartetes Verhalten wenn ESP bereits approved ist.

### Heartbeat ACKs ✅
| Uhrzeit | Timestamp | Zeile |
|---------|-----------|-------|
| 21:15:35 | [66564] | 258 |
| 21:16:35 | [126579] | 259 |
| 21:17:35 | [186615] | 260 |
| 21:18:35 | [246700] | 261 |
| 21:19:35 | [306623] | 279 |
| 21:20:35 | [366602] | 280 |
| 21:21:35 | [426605] | 309 |
| 21:22:35 | [486650] | 313 |
| 21:23:35 | [546604] | 317 |
| 21:24:35 | [606616] | 318 |

**Intervall:** Exakt 60 Sekunden ✅

---

## Sensor Configuration 🔴 FEHLER

### Erste Config (21:19:05)

| Timestamp | Level | Message | Zeile |
|-----------|-------|---------|-------|
| [277249] | INFO | Handling sensor configuration from MQTT | 263 |
| [277261] | ⚠️ WARNING | ROM-Code CRC invalid: 28FF641E8D3C0C79 | 264 |
| [277272] | ⚠️ WARNING | [1025] ROM CRC invalid | 265 |
| [277277] | 🔴 **ERROR** | GPIO 4 already in use by: sensor | 266 |
| [277287] | 🔴 **ERROR** | [1002] GPIO conflict for OneWire sensor | 267 |
| [277289] | 🔴 **ERROR** | Failed to configure sensor on GPIO 4 | 268 |
| [277292] | INFO | ConfigResponse [sensor] status=error 0/1 | 269 |

### Zweite Config (21:20:46)

| Timestamp | Level | Message | Zeile |
|-----------|-------|---------|-------|
| [377910] | INFO | Handling sensor configuration from MQTT | 282 |
| [377922] | ⚠️ WARNING | ROM-Code CRC invalid: 28FF641E8D3C0C79 | 283 |
| [377933] | ⚠️ WARNING | [1025] ROM CRC invalid | 284 |
| [377938] | 🔴 **ERROR** | GPIO 4 already in use by: sensor | 285 |
| [377939] | 🔴 **ERROR** | [1002] GPIO conflict for OneWire sensor | 286 |
| [377951] | 🔴 **ERROR** | Failed to configure sensor on GPIO 4 | 287 |
| [377954] | INFO | ConfigResponse [sensor] status=error 0/1 | 288 |

### Error-Code Analyse

| Code | Kategorie | Bedeutung | Referenz |
|------|-----------|-----------|----------|
| 1002 | HARDWARE | GPIO conflict | ERROR_CODES.md |
| 1025 | HARDWARE | ROM CRC invalid | ERROR_CODES.md |

### Root Cause Analysis

**Problem 1: ROM-Code CRC invalid (1025)**
- Server sendet ROM-Code `28FF641E8D3C0C79`
- CRC-Validierung schlägt fehl
- ESP32 fährt trotzdem fort ("server will validate")

**Problem 2: GPIO-Konflikt (1002)**
- GPIO 4 wurde bereits in Phase 3 vom OneWire Bus Manager reserviert (Zeile 193)
- Sensor-Config versucht erneute Reservierung
- Erwartete Zustände: "free" oder "onewire_bus/4"
- Tatsächlicher Zustand: "sensor" (falsch klassifiziert)

**Vermutung:** Der OneWire Bus Manager hat GPIO 4 als "sensor" statt "onewire_bus" reserviert, was die nachfolgende Sensor-Konfiguration blockiert.

---

## Actuator Configuration ✅

### Erste Config (21:19:05)

| Timestamp | Event | Zeile |
|-----------|-------|-------|
| [277303] | Handling actuator configuration from MQTT | 270 |
| [277316] | GPIOManager: Pin 26 allocated to Test Relay | 272 |
| [277317] | PumpActuator initialized on GPIO 26 | 273 |
| [277333] | ConfigManager: Actuator configs saved (1) | 275 |
| [277344] | ✅ Configuration persisted to NVS | 276 |
| [277359] | ConfigResponse [actuator] status=success | 278 |

### Zweite Config (21:20:46) - Runtime Reconfiguration

| Timestamp | Event | Zeile |
|-----------|-------|-------|
| [377965] | Runtime reconfiguration on GPIO 26 | 291 |
| [377977] | Removing actuator on GPIO 26 | 292 |
| [377988] | Stopping actuator before removal | 293 |
| [378000] | GPIOManager: Pin 26 released to safe mode | 297 |
| [378037] | Actuator removed from GPIO 26 | 301 |
| [378037] | GPIOManager: Pin 26 allocated to Test Relay E2E | 302 |
| [378048] | PumpActuator initialized on GPIO 26 | 303 |
| [378069] | ConfigManager: Actuator configs saved (1) | 305 |
| [378086] | ConfigResponse [actuator] status=success | 308 |

**Bewertung:** Runtime-Rekonfiguration funktioniert korrekt - alter Actuator wird sauber entfernt bevor neuer konfiguriert wird.

---

## Actuator Commands ✅

### ON Command (21:22:01)

| Timestamp | Event | Zeile |
|-----------|-------|-------|
| [453478] | MQTT received: actuator/26/command | 310 |
| [453480] | PumpActuator GPIO 26 **ON** | 311 |
| [453487] | Actuator command executed: GPIO 26 ON = 1.00 | 312 |

**Latenz:** 9ms (Command → Execution)

### OFF Command (21:22:43)

| Timestamp | Event | Zeile |
|-----------|-------|-------|
| [495357] | MQTT received: actuator/26/command | 314 |
| [495358] | PumpActuator GPIO 26 **OFF** | 315 |
| [495366] | Actuator command executed: GPIO 26 OFF = 0.00 | 316 |

**Latenz:** 9ms (Command → Execution)

**Bewertung:** Commands werden in < 10ms ausgeführt, weit unter der 500ms Erwartung ✅

---

## E2E Verification Checklist

### Boot & Connection
- [x] Boot-Banner erscheint
- [x] WiFi Connected (2.6s < 10s)
- [x] MQTT Connected (2s < 5s nach WiFi)
- [x] Initial Heartbeat gesendet

### Device Registration
- [x] Heartbeat ACKs empfangen
- [x] Device previously approved (Zeile 163)

### Sensor Flow 🔴
- [x] DS18B20 Config an ESP gesendet
- [ ] ~~Config erfolgreich applied~~ → **ERROR: GPIO conflict**
- [ ] ~~ROM-Code erkannt~~ → **Kein Gerät am Bus**
- [ ] ~~Temperatur-Readings erscheinen~~ → Nicht möglich

### Actuator Flow ✅
- [x] Relay Config an ESP gesendet
- [x] GPIO 26 erfolgreich reserviert
- [x] Initial Status: implizit OFF nach Init
- [x] ON-Command → GPIO 26 HIGH
- [x] OFF-Command → GPIO 26 LOW

### Error-Free
- [ ] ~~ESP32 Log: Keine [ERROR]~~ → 6 ERROR Einträge (Sensor-Konfig)
- [x] Keine Watchdog Timeouts
- [x] Keine MQTT Disconnects
- [x] Keine WiFi Disconnects

---

## Diagnose

### Primäres Problem: OneWire Hardware

**Symptom:** "OneWire bus reset failed - no devices present or bus error" (Zeile 194)

**Ursache:** Kein DS18B20 am OneWire-Bus erkannt. Dies verhindert den gesamten Sensor-Flow.

**Prüfschritte:**
1. Verkabelung prüfen (VCC, GND, DATA auf GPIO 4)
2. 4.7kΩ Pull-up Widerstand zwischen VCC und DATA
3. Sensor mit Multimeter prüfen (intakt?)
4. Anderen DS18B20 testen

### Sekundäres Problem: GPIO-Konflikt (1002)

**Symptom:** "GPIO 4 already in use by: sensor"

**Ursache:** Der OneWire Bus Manager registriert GPIO 4 möglicherweise mit falscher Klassifizierung. Wenn der Server dann die Sensor-Config sendet, erkennt der SensorManager den bestehenden Eintrag nicht korrekt.

**Vermutung:** Der Check in `sensor_manager.cpp` erwartet den Zustand "onewire_bus/4", findet aber "sensor".

---

## Recommended Actions

### Sofort (Hardware)

1. **OneWire-Verkabelung prüfen**
   - DS18B20 Data-Pin → GPIO 4
   - DS18B20 VCC → 3.3V
   - DS18B20 GND → GND
   - 4.7kΩ zwischen VCC und Data

2. **Sensor-Test ohne Server**
   - OneWire-Scan-Sketch flashen
   - ROM-Codes manuell auslesen

### Code-Review (Firmware)

3. **GPIO-Reservation prüfen**
   - `oneWireBus.cpp`: Wie wird GPIO 4 reserviert?
   - `sensor_manager.cpp`: Welche Zustände werden als "kompatibel" akzeptiert?
   - Erwartung: "onewire_bus" sollte als kompatibel mit "DS18B20" gelten

### Server-Seite

4. **ROM-Code Validierung**
   - ROM `28FF641E8D3C0C79` - CRC prüfen
   - Format: 8 Bytes, letztes Byte = CRC
   - CRC-8 Dallas/Maxim Algorithmus anwenden

---

## Timeline Summary

| Uhrzeit | Event | Status |
|---------|-------|--------|
| 21:14:28.187 | ESP32 Boot | ✅ |
| 21:14:28.669 | Boot-Banner | ✅ |
| 21:14:31.914 | WiFi Connected | ✅ |
| 21:14:34.547 | NTP Sync | ✅ |
| 21:14:34.985 | MQTT Connected | ✅ |
| 21:14:35.017 | Initial Heartbeat | ✅ |
| 21:14:35.289 | OneWire: No devices | 🔴 |
| 21:19:05.747 | Sensor Config #1 | 🔴 ERROR |
| 21:19:05.853 | Actuator Config #1 | ✅ |
| 21:20:46.403 | Sensor Config #2 | 🔴 ERROR |
| 21:20:46.571 | Actuator Reconfig | ✅ |
| 21:22:01.976 | Actuator ON | ✅ |
| 21:22:43.848 | Actuator OFF | ✅ |

---

## Memory Usage

| Phase | Free Heap | Min Free Heap |
|-------|-----------|---------------|
| Start | 265,608 | - |
| Phase 1 | 264,296 | 258,756 |
| Phase 2 | 207,608 | 206,224 |
| Phase 3 | 208,128 | 203,376 |
| Phase 4 | 209,432 | 203,376 |

**Bewertung:** Stabil, keine Memory-Leaks erkennbar.

---

*Report generiert: 2026-02-03 21:25*
*Agent: esp32-debug v2.0*
*Session: 2026-02-03_21-13_onewire-e2e-test*
