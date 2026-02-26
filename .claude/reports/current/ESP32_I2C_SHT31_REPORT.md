# ESP32 Debug Report – I2C / SHT31 Fail-Loop

**Erstellt:** 2026-02-25
**Modus:** B (Spezifisch: "ESP_472204 – endloser I2C-Fail-Loop nach SHT31 Config-Push")
**Quellen:** ESP32 Serial-Log (via User), Firmware-Quellen direkt analysiert

---

## 1. Zusammenfassung

Nach einem MQTT-Config-Push um 21:05:47 konfiguriert der ESP_472204 zwei SHT31-Sensoren
korrekt und startet sofort den Mess-Loop. Der I2C-Bus ist zwar im Firmware-Boot (setup())
initialisiert worden, der eigentliche Fehler ist jedoch: **kein SHT31 ist physisch angeschlossen**.
`Wire.requestFrom()` liefert `ESP_ERR_TIMEOUT` (ESP-IDF Error 263), weil kein Slave auf 0x44
antwortet. Auf Software-Ebene gibt es einen zweiten unabhaengigen Bug: Die Firmware
aktualisiert `sensors_[i].last_reading` nach einem fehlgeschlagenen Multi-Value-Read NICHT
– der naechste Loop-Durchlauf triggert daher sofort den naechsten Versuch, was den
beobachteten ~1.1s-Retry-Takt erklaert. Ein dedizierter Circuit Breaker fuer I2C-Reads
existiert nicht. Das Ergebnis ist ein endloser, schrittweiser Retry-Spam ohne Backoff
oder automatischen Stop.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| ESP32 Serial-Log (User-Input) | OK | Vollstaendig fuer den relevanten Zeitraum |
| `src/drivers/i2c_bus.cpp` | OK | Vollstaendig gelesen |
| `src/drivers/i2c_bus.h` | OK | Vollstaendig gelesen |
| `src/drivers/i2c_sensor_protocol.cpp` | OK | SHT31 Protocol-Definition gelesen |
| `src/drivers/i2c_sensor_protocol.h` | OK | Vollstaendig gelesen |
| `src/services/sensor/sensor_manager.cpp` | OK | Vollstaendig gelesen |
| `src/services/sensor/sensor_manager.h` | OK | Vollstaendig gelesen |
| `src/services/config/config_manager.cpp` | OK | I2C-Validierungslogik gelesen |
| `src/models/sensor_registry.cpp` | OK | SHT31 Capability-Definitionen gelesen |
| `src/models/error_codes.h` | OK | Fehlercodes 1007-1019 gelesen |
| `src/config/hardware/esp32_dev.h` | OK | I2C-Pin-Konfiguration gelesen |
| `src/main.cpp` (Auszug) | OK | Boot-Sequenz Step 11/12, loop() gelesen |
| `src/error_handling/circuit_breaker.h` | OK | CB-Interface gelesen |
| `src/services/sensor/sensor_drivers/temp_sensor_sht31.*` | LEER | Stub-Datei (1 Zeile), kein SHT31-spezifischer Driver |
| `src/services/sensor/sensor_drivers/i2c_sensor_generic.*` | LEER | Stub-Datei (1 Zeile) |

---

## 3. Befunde

### 3.1 Fehler 263 – ESP_ERR_TIMEOUT: SHT31 nicht angeschlossen (Hardware)

- **Schwere:** Hoch
- **Detail:** Der ESP-IDF I2C-Stack meldet Error 263 (`ESP_ERR_TIMEOUT = 0x107`). Dieser
  Code tritt auf, wenn `Wire.requestFrom()` keinen ACK vom Slave erhaelt, weil kein Geraet
  auf Adresse 0x44 antwortet. Das ist der primaire Root-Cause-Indikator fuer fehlende
  Hardware.
- **Evidenz Log:**
  ```
  [E][Wire.cpp:513] requestFrom(): i2cRead returned Error 263
  [ERROR] [I2C] I2C: Read timeout for sht31
  [ERROR] [ERRTRAK] [1007] [HARDWARE] sht31 read timeout
  ```
- **Begruendung:** Error 263 entsteht in `executeCommandBasedProtocol()` beim
  `Wire.requestFrom()` nach dem 16ms Conversion-Delay. Der SDA-Bus haelt sich nach dem
  Command-Write nicht zurueck – ein tatsaechlich angeschlossener SHT31 wuerde innerhalb
  von 15.5ms bereit sein. Das `Wire.setTimeOut(100)` in `I2CBusManager::begin()` laesst
  100ms zu – laenger als die SHT31-Spec. Trotzdem Timeout = kein Slave vorhanden.

### 3.2 Fehlende I2C-Re-Initialisierung nach Config-Push (Software-Frage, KEIN Bug)

- **Schwere:** Niedrig (kein echter Bug, Design-by-Intent)
- **Detail:** Im Serial-Log taucht kein `I2C Wire.begin()` nach dem Config-Push auf.
  Dieses Verhalten ist KORREKT. `I2CBusManager::begin()` wird einmalig in `setup()` bei
  Boot-Step 11 aufgerufen. Bei `begin()` wird `initialized_` auf `true` gesetzt. Bei
  erneutem Aufruf prueft `begin()` als ersten Schritt `if (initialized_) return true;`.
  Der Config-Push (MQTT-Handler) ruft `sensorManager.configureSensor()` auf, nicht
  `i2cBusManager.begin()`. Letzteres ist korrekt – der I2C-Bus laeuft bereits.
- **Verifizierung:** `sensor_manager.cpp` Zeile 257-261:
  ```cpp
  if (!i2c_bus_->isInitialized()) {
      LOG_E(TAG, "Sensor Manager: I2C bus not initialized");
      return false;  // Wuerde im Log erscheinen - tut es nicht
  }
  ```
  Da diese Meldung im Log NICHT erscheint, war der Bus beim Config-Push korrekt
  initialisiert.

### 3.3 GPIO 0 im Log – KEIN Pin-Konflikt (Design)

- **Schwere:** Keine (Verwirrend, aber korrekt)
- **Detail:** Das Serial-Log zeigt `Sensor configured: GPIO 0 (sht31_temp)` und
  `ConfigManager: Saved sensor config for GPIO 0`. GPIO 0 ist der Boot-Button-Pin und
  RESERVED in `esp32_dev.h`. Auf den ersten Blick wirkt das wie ein Pin-Konflikt.
- **Erklaerung:** Fuer I2C-Sensoren wird `config.gpio` vom Server als Platzhalter-GPIO
  gesendet. `ConfigManager::validateSensorConfig()` prueft bei I2C-Sensoren explizit
  KEINE GPIO-Validation:
  ```cpp
  if (is_i2c_sensor) {
      LOG_I(TAG, "ConfigManager: I2C sensor '" + config.sensor_type +
               "' - GPIO validation skipped (uses I2C bus)");
      return true;  // <-- Sofortiger Return, kein GPIO-Check!
  }
  ```
  `sensor_manager.cpp` Zeile 253: "I2C Sensor: Use I2C bus, NO GPIO reservation needed".
  Der gespeicherte GPIO-Wert 0 ist ein Server-Artefakt fuer die Datenbank-Zuordnung, er
  wird nicht als physischer Pin verwendet. Der echte I2C-Bus laeuft auf GPIO 21 (SDA)
  und GPIO 22 (SCL), definiert in `esp32_dev.h`:
  ```cpp
  constexpr uint8_t I2C_SDA_PIN = 21;
  constexpr uint8_t I2C_SCL_PIN = 22;
  ```
  `Wire.begin(21, 22, 100000)` wird in `I2CBusManager::begin()` aufgerufen.

### 3.4 BUG: Fehlender Backoff bei I2C-Read-Fail – Endloser Retry-Loop (Software)

- **Schwere:** Mittel (kein Absturz, aber ressourcenverschwendend und log-flutend)
- **Detail:** In `performAllMeasurements()` wird `sensors_[i].last_reading = now` NUR
  bei ERFOLGREICHEM Read aktualisiert:
  ```cpp
  // Zeile 1071-1075 (sensor_manager.cpp)
  if (count == 0) {
      LOG_W(TAG, "Sensor Manager: Multi-value measurement failed for GPIO ...");
      // last_reading wird NICHT gesetzt!
  } else {
      sensors_[i].last_reading = now;  // Nur bei Erfolg
  }
  ```
  Da `last_reading` bei 0 bleibt (initial), ist die Interval-Bedingung
  `now - sensors_[i].last_reading < sensor_interval` sofort wieder erfuellt beim
  naechsten loop()-Durchlauf. Der Main-Loop laeuft mit einer `delay(1)` am Ende
  (Wokwi-kompatibel) oder einer `yield()`, was einen effektiven Retry-Takt von
  ~1.1s erklaert (16ms Conversion-Delay + 100ms Wire-Timeout + Loop-Overhead).
- **Konsequenz:** 13+ konsekutive Fails in 14 Sekunden, kein automatischer Stop.

### 3.5 BUG: Kein Circuit Breaker fuer I2C-Read-Operationen (Software)

- **Schwere:** Mittel (Design-Luecke)
- **Detail:** Der `CircuitBreaker`-Mechanismus ist im Projekt implementiert und aktiv
  fuer MQTT (5 failures → 30s OPEN) und WiFi (10 failures → 60s OPEN). Fuer I2C-Reads
  im `SensorManager` existiert kein analoger Schutzmechanismus. Der `I2CBusManager`
  hat einen Recovery-Mechanismus (`attemptRecoveryIfNeeded()`), der aber nur fuer
  Wire-Fehlercode 4/5 (Bus stuck) anspringt, NICHT fuer Error 263 / Timeout.
  Bei dauerhaft fehlendem Geraet (NACK / keine Antwort) greift kein automatischer
  Stop-Mechanismus.
- **Vergleich:** OneWire-Sensoren haben 3 Retries mit 100ms Delay (`MAX_RETRIES = 3`,
  `RETRY_DELAY_MS = 100`), aber danach wiederholt der SensorManager den naechsten
  Mess-Zyklus ohne Pause. I2C hat nicht einmal diese 3 Retries auf SensorManager-Ebene.

### 3.6 I2C Bus Recovery greift NICHT fuer diesen Fehlertyp

- **Schwere:** Info
- **Detail:** `I2CBusManager::attemptRecoveryIfNeeded()` (Zeile 478 i2c_bus.cpp) prueft:
  ```cpp
  if (error_code != 4 && error_code != 5) {
      return false;  // Not a recoverable error
  }
  ```
  Error 263 (ESP_ERR_TIMEOUT bei `requestFrom`) wird als internes Wire-Timeout
  behandelt, nicht als Wire-Error-Code 4/5. Die Recovery-Methode (9 SCL-Pulse +
  STOP) wird daher nie aufgerufen. Das ist korrekt – ein stuck I2C bus waere
  ein anderes Problem. Hier ist schlicht kein Sensor da.

---

## 4. Ursachen-Kette (Root Cause Chain)

```
SHT31 physisch NICHT angeschlossen (kein Pull-up, keine SDA/SCL Verbindung)
  │
  └── Wire.requestFrom(0x44, 6) → ESP-IDF wartet bis Timeout (100ms)
         │
         └── Error 263 (ESP_ERR_TIMEOUT) wird von i2cRead zurueck gemeldet
                │
                ├── I2CBusManager::executeCommandBasedProtocol() gibt false zurueck
                │      → ERROR_I2C_TIMEOUT (1007) wird getrackt
                │
                └── SensorManager::performMultiValueMeasurement() gibt count=0 zurueck
                       │
                       └── performAllMeasurements():
                              count == 0 → last_reading wird NICHT gesetzt
                              └── naechster Loop: Bedingung sofort wieder erfuellt
                                     → naechster Versuch nach ~1.1s
                                     → ENDLOSER LOOP ohne Backoff oder Circuit Breaker
```

---

## 5. Hardware vs. Software Bewertung

| Frage | Antwort | Begruendung |
|-------|---------|-------------|
| Ist der I2C-Bus initialisiert? | JA | `I2CBusManager::begin()` in setup() erfolgreich, kein Error-Log |
| Wird `Wire.begin(SDA=21, SCL=22)` korrekt aufgerufen? | JA | `esp32_dev.h`: SDA=21, SCL=22, 100kHz |
| Fehlt Wire.begin nach Config-Push? | NEIN | Design-by-Intent: Bus laeuft schon, Re-Init nicht noetig |
| Ist GPIO 0 ein Problem? | NEIN | I2C-Sensoren ignorieren GPIO-Felder fuer physische Pins |
| Ist Error 263 ein Bus-Problem? | NEIN | Bus ist funktional; Error = kein Slave antwortet |
| Ist SHT31 angeschlossen? | NEIN (sehr wahrscheinlich) | Persistentes Timeout auf 0x44, kein einziger erfolgreicher Read |
| Ist es ein Software-Bug? | TEILWEISE | Zwei Bugs: kein Backoff bei Fail, kein I2C Circuit Breaker |

---

## 6. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | Nicht ausgefuehrt (keine laufende Session, Log-Analyse aus User-Input) |
| Server-Log / MQTT-Traffic | Nicht ausgefuehrt (Firmware-Source-Analyse war ausreichend) |
| DB-Query sensor_data | Nicht ausgefuehrt (kein Datenproblem, Hardware-Problem identifiziert) |
| `mosquitto_sub` SHT31-Topic | Nicht ausgefuehrt (klar: kein einziger erfolgreicher Read im Log) |

---

## 7. Bewertung & Empfehlung

### Root Cause (Primaer)

**Hardware: SHT31 Sensor ist nicht physisch angeschlossen.**
ESP_472204 hat validen Config-Push erhalten, I2C-Bus laeuft korrekt auf GPIO 21/22,
aber Adresse 0x44 antwortet nicht. Kein angeschlossener Sensor = dauerhafter Timeout.

### Root Cause (Sekundaer – Software)

**Bug 1: Kein Backoff bei I2C-Read-Fail.**
`sensors_[i].last_reading` wird bei `count == 0` nicht gesetzt. Naechster Loop
triggert sofort neu. Fix: Bei Fail `last_reading = now` setzen (erzwingt Warten
bis zum naechsten Interval).

**Bug 2: Kein Circuit Breaker fuer I2C-Sensor-Reads.**
Analog zu MQTT/WiFi sollte der SensorManager nach N konsekutiven I2C-Fails
eine Pause einlegen (z.B. 5 Fails → 60s Backoff). Verhindert Log-Flut und
CPU-Overhead.

### Naechste Schritte

| Prioritaet | Aktion | Datei |
|------------|--------|-------|
| 1 (sofort) | SHT31 physisch an GPIO 21 (SDA) und GPIO 22 (SCL) anschliessen, 4.7kΩ Pull-ups auf beide Leitungen zu 3.3V | Hardware |
| 2 (sofort) | I2C-Bus-Scan ausfuehren um Verbindung zu verifizieren: `i2cBusManager.scanBus()` | Diagnose |
| 3 (Bug-Fix) | `performAllMeasurements()`: Bei `count == 0` ebenfalls `sensors_[i].last_reading = now` setzen | `sensor_manager.cpp` |
| 4 (Enhancement) | Circuit Breaker fuer I2C-Sensor-Reads implementieren: Nach 5 konsekutiven Fails → 60s Pause pro Sensor | `sensor_manager.cpp` |
| 5 (optional) | `sensor_manager.cpp` Zeile 287-291: `isDevicePresent()` Warning verstaerken – aktuell wird "may be simulation mode" als Erklaerung ausgegeben, was Produktions-Probleme verschleiert | `sensor_manager.cpp` |

### I2C-Verkabelung fuer ESP32-WROOM-32 + SHT31

```
SHT31 VDD  → 3.3V
SHT31 GND  → GND
SHT31 SDA  → ESP32 GPIO 21 (+ 4.7kΩ Pull-up zu 3.3V)
SHT31 SCL  → ESP32 GPIO 22 (+ 4.7kΩ Pull-up zu 3.3V)
SHT31 ADDR → GND (fuer Adresse 0x44)
```
