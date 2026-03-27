# ESP32 Debug Report - Serial Analysis FW01

**Erstellt:** 2026-03-26
**Modus:** B (Spezifisch: "GPIO 13 reserviert - Aktor-Konfiguration schlaegt fehl vs. GPIO 14 Erfolg")
**Quellen:** Serial Output 1 (GPIO 13 fehlgeschlagen), Serial Output 2 (GPIO 14 erfolgreich), vollstaendiger Code-Scan El Trabajante/src/

---

## 1. Zusammenfassung

Serial Output 1 schlaegt beim Konfigurieren eines Relay-Aktors auf GPIO 13 fehl, weil GPIO 13 in der Board-Konfiguration `esp32_dev.h` als **reservierter System-Pin** definiert ist (Flash Voltage Strapping Pin). GPIO 14 ist kein reservierter Pin und funktioniert problemlos. Ausserdem sind in Output 1 drei strukturelle Anomalien identifiziert: (1) Der `validateSensorConfig`-Aufruf fuer I2C-Sensoren wird dreifach statt zweifach ausgefuehrt, weil `saveSensorConfig` in `main.cpp:2784` eine dritte Validierung ausloest. (2) `sht31_humidity` fehlt in Output 1 komplett, was auf einen unterschiedlichen Sensor-Payload hinweist. (3) NVS-Save-Logs fuer GPIO 0 und GPIO 4 erscheinen jeweils zweimal durch zwei separate `saveSensorConfig`-Aufrufe in verschiedenen Code-Pfaden. Kein Systemausfall, aber GPIO 13 ist dauerhaft nicht verwendbar.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| Serial Output 1 (GPIO 13) | FEHLER | ERROR_GPIO_RESERVED (1001), ERROR_ACTUATOR_INIT_FAILED (1051) |
| Serial Output 2 (GPIO 14) | OK | Vollstaendige Boot- und Befehlssequenz erfolgreich |
| esp32_dev.h (HardwareConfig) | Gelesen | GPIO 13 in RESERVED_GPIO_PINS[] |
| gpio_manager.cpp | Gelesen | requestPin() Zeile 165-237 |
| pump_actuator.cpp | Gelesen | begin() Zeile 29-76 |
| config_manager.cpp | Gelesen | saveSensorConfig() Zeile 1583-1753, validateSensorConfig() Zeile 2069-2100 |
| sensor_manager.cpp | Gelesen | configureSensor() Zeile 200-417 |
| actuator_manager.cpp | Gelesen | configureActuator() Zeile 187-287, handleActuatorConfig() Zeile 739-816 |
| main.cpp | Gelesen | handleSensorConfig() Zeile 2568-2632, handleActuatorConfig() Zeile 2812-2825, parseAndConfigureSensorWithTracking() Zeile 2638-2793 |
| error_tracker.cpp | Gelesen | logErrorToLogger() Zeile 254-270 |
| error_codes.h | Gelesen | ERROR_GPIO_RESERVED=1001, ERROR_ACTUATOR_INIT_FAILED=1051 |
| config_response.cpp | Gelesen | publishWithFailures() Zeile 99-130 |

---

## 3. Zeilenweise Analyse - Serial Output 1 (GPIO 13 FEHLGESCHLAGEN)

### Sensor-Konfigurationsblock (SHT31 Temp)

```
[    196930] [INFO    ] [CONFIG  ] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)
```
**Code:** `config_manager.cpp:2082-2083` in `validateSensorConfig()`
**Erklaerung:** Der ConfigManager prueft via `SensorCapabilityRegistry`, ob `sht31_temp` ein I2C-Sensor ist. Da er es ist (`capability->is_i2c == true`), wird die Standard-GPIO-Validierung uebersprungen und sofort `true` zurueckgegeben. Dies ist **Aufrufreihenfolge 1 von 3** - ausgeloest durch `configManager.validateSensorConfig(config)` in `main.cpp:2735` innerhalb von `parseAndConfigureSensorWithTracking()`.

```
[    196941] [INFO    ] [CONFIG  ] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)
```
**Code:** `config_manager.cpp:2082-2083` in `validateSensorConfig()`
**Erklaerung:** **Aufrufreihenfolge 2 von 3** - ausgeloest durch `configManager.saveSensorConfig(config)` in `sensor_manager.cpp:250` (innerhalb des "Already exists - update in place" Pfads fuer Multi-Value-Sensoren). `saveSensorConfig` ruft zu Beginn `validateSensorConfig()` auf (Zeile 1587).

```
[    196948] [INFO    ] [CONFIG  ] ConfigManager: Saved sensor config for GPIO 0
```
**Code:** `config_manager.cpp:1747`
**Erklaerung:** NVS-Save Nummer 1 fuer `sht31_temp`. Ausgefuehrt durch `saveSensorConfig()` in `sensor_manager.cpp:250` (erster NVS-Write aus dem SensorManager-Pfad).

```
[    196948] [INFO    ] [SENSOR  ]   ✅ Configuration persisted to NVS
```
**Code:** `sensor_manager.cpp:253`
**Erklaerung:** Bestaetigung des NVS-Saves aus dem "Update in place" Codepfad fuer Multi-Value-Sensoren (`sensor_manager.cpp:250-254`).

```
[    196958] [INFO    ] [SENSOR  ] Sensor Manager: Updated existing multi-value sensor 'sht31_temp' on GPIO 0
```
**Code:** `sensor_manager.cpp:255-256`
**Erklaerung:** `configureSensor()` hat `sht31_temp` als bereits existierenden Multi-Value-Sensor erkannt (gleicher GPIO 0, gleicher `sensor_type`). Der Sensor wurde in-place aktualisiert. Bestaetigung der erfolgreichen Aktualisierung.

```
[    196969] [INFO    ] [CONFIG  ] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)
```
**Code:** `config_manager.cpp:2082-2083` in `validateSensorConfig()`
**Erklaerung:** **Aufrufreihenfolge 3 von 3 - ANOMALIE.** Dieser dritte Aufruf kommt aus `main.cpp:2784` innerhalb von `parseAndConfigureSensorWithTracking()` - dort wird nach dem `sensorManager.configureSensor(config)` Aufruf (Zeile 2765) nochmals `configManager.saveSensorConfig(config)` aufgerufen (Zeile 2784). Dieser zusaetzliche `saveSensorConfig`-Aufruf loest erneut `validateSensorConfig()` aus.

```
[    196986] [INFO    ] [CONFIG  ] ConfigManager: Saved sensor config for GPIO 0
```
**Code:** `config_manager.cpp:1747`
**Erklaerung:** NVS-Save Nummer 2 fuer `sht31_temp` - ausgeloest durch den redundanten `saveSensorConfig`-Aufruf in `main.cpp:2784`. Der Sensor ist identisch zu Save Nummer 1 - dieser Write ist idempotent (gleicher GPIO + gleicher sensor_type findet `existing_index >= 0` in NVS und ueberschreibt ihn), aber unnoetig.

```
[    196987] [INFO    ] [BOOT    ] Sensor configured: GPIO 0 (sht31_temp)
```
**Code:** `main.cpp:2790`
**Erklaerung:** Abschluss-Log von `parseAndConfigureSensorWithTracking()` bei Erfolg. TAG="BOOT" weil `main.cpp` `static const char* TAG = "BOOT"` (Zeile 56) verwendet.

### Sensor-Konfigurationsblock (DS18B20)

```
[    196998] [INFO    ] [SENSOR  ] Sensor Manager: Updating existing sensor on GPIO 4
```
**Code:** `sensor_manager.cpp:286`
**Erklaerung:** `configureSensor()` findet einen bereits vorhandenen Sensor auf GPIO 4 (`findSensorConfig(4)` != nullptr). Das ist der "Runtime reconfiguration: Update existing sensor" Pfad.

```
[    197007] [INFO    ] [CONFIG  ] ConfigManager: Saved sensor config for GPIO 4
```
**Code:** `config_manager.cpp:1747`
**Erklaerung:** NVS-Save Nummer 1 fuer ds18b20 GPIO 4. Ausgeloest durch `configManager.saveSensorConfig(config)` in `sensor_manager.cpp:308`.

```
[    197007] [INFO    ] [SENSOR  ]   ✅ Configuration persisted to NVS
```
**Code:** `sensor_manager.cpp:311`
**Erklaerung:** Bestaetigung des NVS-Saves aus `sensor_manager.cpp:308-311`.

```
[    197018] [INFO    ] [SENSOR  ] Sensor Manager: Updated sensor on GPIO 4 (ds18b20)
```
**Code:** `sensor_manager.cpp:314-315`
**Erklaerung:** Abschluss-Log des "Update existing sensor" Pfads. Sensor wurde erfolgreich aktualisiert.

```
[    197027] [INFO    ] [CONFIG  ] ConfigManager: Saved sensor config for GPIO 4
```
**Code:** `config_manager.cpp:1747`
**Erklaerung:** NVS-Save Nummer 2 fuer ds18b20 - erneut aus dem redundanten `configManager.saveSensorConfig(config)` in `main.cpp:2784`. Idempotent, aber unnoetig.

```
[    197027] [INFO    ] [BOOT    ] Sensor configured: GPIO 4 (ds18b20)
```
**Code:** `main.cpp:2790`

### Config-Response Sensoren

```
[    197044] [INFO    ] [CFGRESP ] ConfigResponse published [sensor] status=success success=3 failed=0
```
**Code:** `config_response.cpp:121` via `ConfigResponseBuilder::publishWithFailures()`
**Erklaerung:** Der `handleSensorConfig` in `main.cpp:2626-2631` zaehlt `success_count=3`. Das bedeutet, der Sensor-Payload enthielt tatsaechlich **3 Sensor-Eintraege**, nicht 2. Da `sht31_humidity` im Log nicht sichtbar ist (aber `success=3`), wurde es zwischen dem sht31_temp- und dem ds18b20-Eintrag verarbeitet. Es fehlen die `"GPIO validation skipped"` und `"Saved sensor config"` Logs fuer `sht31_humidity` - was bedeutet, `sht31_humidity` wurde **als neuer I2C-Sensor hinzugefuegt** (nicht als Update), wodurch der Code-Pfad `sensor_manager.cpp:399-416` ("Add I2C sensor") durchlaufen wurde. Dieser Pfad hat KEINEN Log-Eintrag fuer das erfolgreiche Hinzufuegen eines Multi-Value-Sensors mit dem beschriebenen Log-Text "Updated existing multi-value sensor". Stattdessen: "Sensor Manager: Configured I2C sensor..." - dieser Log fehlt im Output 1. Das ist eine weitere Anomalie - moeglicherweise wurde das Log durch Timing oder Pufferung verschluckt.

### Aktuator-Konfigurationsblock (GPIO 13 - FEHLER)

```
[    197045] [INFO    ] [BOOT    ] Handling actuator configuration from MQTT
```
**Code:** `main.cpp:2813`
**Erklaerung:** `handleActuatorConfig()` in `main.cpp` wird aufgerufen (TAG="BOOT").

```
[    197056] [INFO    ] [ACTUATOR] Handling actuator configuration from MQTT
```
**Code:** `actuator_manager.cpp:740`
**Erklaerung:** `ActuatorManager::handleActuatorConfig()` wird aufgerufen (TAG="ACTUATOR"). Das doppelte Log ist NORMAL - `main.cpp:2813` loggt zuerst, dann `actuator_manager.cpp:740`.

```
[    197068] [ERROR   ] [GPIO    ] GPIOManager: Attempted to request reserved pin 13
```
**Code:** `gpio_manager.cpp:168`
**Erklaerung:** `GPIOManager::requestPin(13, "actuator", "Luftbefeuchter")` wird aufgerufen. Zu Beginn von `requestPin()` prueft `isReservedPin(gpio)` (Zeile 167). GPIO 13 ist in `HardwareConfig::RESERVED_GPIO_PINS[] = {0,1,2,3,12,13}` (esp32_dev.h:31-38) als **Flash Voltage Strapping Pin** reserviert. Pruefschleife in `gpio_manager.cpp:574-580` findet Treffer und gibt `false` zurueck. LOG_E auf Zeile 168.

```
[    197068] [ERROR   ] [PUMP    ] PumpActuator: failed to reserve GPIO 13
```
**Code:** `pump_actuator.cpp:46`
**Erklaerung:** `gpio_manager_->requestPin(gpio_, "actuator", config_.actuator_name.c_str())` gibt `false` zurueck (Zeile 45). Die If-Bedingung auf Zeile 45 trifft zu. LOG_E auf Zeile 46.

```
[    197079] [ERROR   ] [ERRTRAK ] [1001] [HARDWARE] Pump GPIO busy: 13
```
**Code:** `error_tracker.cpp:255-257` via `pump_actuator.cpp:47-49`
**Erklaerung:** `errorTracker.trackError(ERROR_GPIO_RESERVED, ERROR_SEVERITY_ERROR, ("Pump GPIO busy: " + String(gpio_)).c_str())` wird aufgerufen (pump_actuator.cpp:47-49). `ERROR_GPIO_RESERVED = 1001` (error_codes.h:17). `logErrorToLogger()` baut den String `"[1001] [HARDWARE] Pump GPIO busy: 13"` und loggt ihn als ERROR mit TAG="ERRTRAK". Die Kategorie "HARDWARE" kommt aus `getCategoryString(1001)` -> 1001 liegt im Bereich 1000-1999 -> "HARDWARE".

```
[    197084] [ERROR   ] [ACTUATOR] Driver initialization failed for GPIO 13
```
**Code:** `actuator_manager.cpp:252`
**Erklaerung:** `driver->begin(config)` gibt `false` zurueck (Zeile 251). LOG_E auf Zeile 252: `"Driver initialization failed for GPIO " + String(config.gpio)`.

```
[    197084] [ERROR   ] [ERRTRAK ] [1051] [HARDWARE] Driver init failed
```
**Code:** `error_tracker.cpp:255-257` via `actuator_manager.cpp:253-255`
**Erklaerung:** `errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED, ERROR_SEVERITY_ERROR, "Driver init failed")` wird aufgerufen (actuator_manager.cpp:253-255). `ERROR_ACTUATOR_INIT_FAILED = 1051` (error_codes.h:62). Kategorie: "HARDWARE" (1051 liegt im Bereich 1000-1999).

```
[    197099] [ERROR   ] [ACTUATOR] Failed to configure actuator on GPIO 13 type=relay name=Luftbefeuchter heap=191376
```
**Code:** `actuator_manager.cpp:794-797`
**Erklaerung:** `configureActuator(config)` gibt `false` zurueck. Der Error-Handler in `handleActuatorConfig()` (Zeile 793-802) loggt den vollstaendigen Fehlerkontext inkl. heap-Groesse (191376 Bytes = ~187 KB, normal fuer diesen Zeitpunkt).

```
[    197114] [INFO    ] [CFGRESP ] ConfigResponse published [actuator] status=error
```
**Code:** `config_response.cpp:48-49` via `ConfigResponseBuilder::publishError()`
**Erklaerung:** `ConfigResponseBuilder::publishError()` wird aufgerufen (actuator_manager.cpp:799-802). Da `configured=0` und `total=1`, wird der Error-Branch ausgefuehrt. Das Log "status=error" kommt von `config_response.cpp:48-49`.

---

## 4. Zeilenweise Analyse - Serial Output 2 (GPIO 14 ERFOLGREICH)

### Sensor-Konfigurationsblock (SHT31 Temp + Humidity + DS18B20)

```
[    438147] [INFO    ] [SENSOR  ]   ✅ Configuration persisted to NVS
[    438147] [INFO    ] [SENSOR  ] Sensor Manager: Updated existing multi-value sensor 'sht31_temp' on GPIO 0
```
**Code:** `sensor_manager.cpp:253-256` - identischer Pfad wie Output 1

```
[    438158] [INFO    ] [CONFIG  ] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)
```
**Code:** `config_manager.cpp:2082-2083` - dritter validateSensorConfig-Aufruf (Redundanz-Aufruf aus main.cpp:2784)

```
[    438174] [INFO    ] [CONFIG  ] ConfigManager: Saved sensor config for GPIO 0
[    438175] [INFO    ] [BOOT    ] Sensor configured: GPIO 0 (sht31_temp)
```
**Code:** `config_manager.cpp:1747`, `main.cpp:2790` - zweiter NVS-Save und Abschluss-Log

**NEUE ZEILEN in Output 2 (fehlen in Output 1):**

```
[    438186] [INFO    ] [CONFIG  ] ConfigManager: I2C sensor 'sht31_humidity' - GPIO validation skipped (uses I2C bus)
```
**Code:** `config_manager.cpp:2082-2083`
**Erklaerung:** Erster `validateSensorConfig`-Aufruf fuer `sht31_humidity` aus `main.cpp:2735`. In Output 1 fehlt dieser Block komplett - in Output 1 wurde `sht31_humidity` offenbar als NEUER Sensor (nicht Update) verarbeitet und der "Configured I2C sensor"-Log wurde nicht emittiert (oder kam vor dem ausgeschnittenen Bereich).

```
[    438197] [INFO    ] [SENSOR  ] Sensor Manager: Updating existing sensor on GPIO 0
```
**Code:** `sensor_manager.cpp:286`
**Erklaerung:** Beachtenswert: fuer `sht31_humidity` wird hier der allgemeine "Updating existing sensor on GPIO 0" Pfad verwendet - NICHT der Multi-Value-Pfad "Updated existing multi-value sensor". Das bedeutet: `findSensorConfig(0)` findet den Sensor und `existing->sensor_type == config.sensor_type` (sht31_humidity == sht31_humidity). Also ein einfaches Update, kein Multi-Value-Add.

```
[    438197] [INFO    ] [CONFIG  ] ConfigManager: I2C sensor 'sht31_humidity' - GPIO validation skipped (uses I2C bus)
[    438213] [INFO    ] [CONFIG  ] ConfigManager: Saved sensor config for GPIO 0
[    438214] [INFO    ] [SENSOR  ]   ✅ Configuration persisted to NVS
[    438224] [INFO    ] [SENSOR  ] Sensor Manager: Updated sensor on GPIO 0 (sht31_humidity)
[    438235] [INFO    ] [CONFIG  ] ConfigManager: I2C sensor 'sht31_humidity' - GPIO validation skipped (uses I2C bus)
[    438251] [INFO    ] [CONFIG  ] ConfigManager: Saved sensor config for GPIO 0
[    438251] [INFO    ] [BOOT    ] Sensor configured: GPIO 0 (sht31_humidity)
```
**Code:** identisches Pattern wie sht31_temp - zwei NVS-Saves, drei validateSensorConfig-Aufrufe

### DS18B20 und Config-Response - identisch zu Output 1

```
[    438263-438292] [SENSOR/CONFIG/BOOT] DS18B20 auf GPIO 4 - identisches Pattern
[    438309] [CFGRESP] ConfigResponse published [sensor] status=success success=3 failed=0
```

### Aktuator-Konfigurationsblock (GPIO 14 - ERFOLG)

```
[    438333] [INFO    ] [GPIO    ] GPIOManager: Pin 14 allocated to Luftbefeuchter
```
**Code:** `gpio_manager.cpp:229`
**Erklaerung:** `requestPin(14, "actuator", "Luftbefeuchter")` - GPIO 14 ist NICHT in `RESERVED_GPIO_PINS`. Die Pruefschleife in `isReservedPin()` findet keinen Treffer. Weiterhin ist GPIO 14 nicht in `pins_` als vergeben (`owner[0] == '\0'`). Daher: Allokation erfolgreich. LOG_I auf gpio_manager.cpp:229.

```
[    438334] [INFO    ] [PUMP    ] PumpActuator initialized on GPIO 14
```
**Code:** `pump_actuator.cpp:74`
**Erklaerung:** `begin()` laeuft vollstaendig durch: GPIO-Reservierung OK, `configurePinMode(14, OUTPUT)` OK, `digitalWrite(14, LOW)` gesetzt, `initialized_ = true`. LOG_I auf Zeile 74.

```
[    438345] [INFO    ] [CONFIG  ] ConfigManager: Saving Actuator configurations...
[    438356] [INFO    ] [CONFIG  ] ConfigManager: Actuator configurations saved successfully (1 actuators)
[    438356] [INFO    ] [ACTUATOR]   ✅ Configuration persisted to NVS
[    438366] [INFO    ] [ACTUATOR] Actuator configured on GPIO 14 type: relay
```
**Code:** `config_manager.cpp:2103`, `actuator_manager.cpp:280-284`
**Erklaerung:** Nach erfolgreichem `configureActuator()` wird `configManager.saveActuatorConfig(actuators, count)` aufgerufen. "relay" als type - intern wird `PumpActuator` fuer Relay-Type verwendet (actuator_manager.cpp:180-181: `ActuatorTypeTokens::RELAY` -> `new PumpActuator()`).

```
[    438385] [INFO    ] [CFGRESP ] ConfigResponse published [actuator] status=success
```
**Code:** `config_response.cpp:48-49` via `ConfigResponseBuilder::publishSuccess()`

### Actuator Commands (Funktionstest)

```
[    464289] [INFO    ] [BOOT    ] MQTT message received: kaiser/god/esp/ESP_EA5484/actuator/14/command
[    464290] [INFO    ] [PUMP    ] PumpActuator GPIO 14 ON
[    464308] [INFO    ] [ACTUATOR] Actuator command executed: GPIO 14 ON = 1.00
```
**Code:** `main.cpp:851`, `pump_actuator.cpp:153`, aktuator_manager.cpp Bereich
**Erklaerung:** Server sendet ON-Command (value >= 0.5). `setValue(1.0)` -> `setBinary(true)` -> `applyState(true, false)`. `PumpActuator::applyState()` schreibt `digitalWrite(14, HIGH)`.

```
[    466848-466867] [BOOT/PUMP/ACTUATOR] GPIO 14 OFF - identisches Pattern
[    487016] [BOOT] MQTT message received: ...heartbeat/ack
```
**Code:** `main.cpp:851` - Heartbeat-ACK vom Server, ESP ist registriert und aktiv

---

## 5. Befunde

### 5.1 KRITISCH: GPIO 13 ist hardware-reserviert (Root Cause)

- **Schwere:** Hoch (konfigurierter Aktor ist komplett nicht funktionsfaehig)
- **Root Cause:** `HardwareConfig::RESERVED_GPIO_PINS[]` in `El Trabajante/src/config/hardware/esp32_dev.h:31-38` enthaelt explizit GPIO 13:
  ```cpp
  const uint8_t RESERVED_GPIO_PINS[] = {
      0,   // Boot Button / Strapping Pin
      1,   // UART0 TX (USB Serial)
      2,   // Boot Strapping Pin
      3,   // UART0 RX (USB Serial)
      12,  // Flash Voltage Strapping Pin
      13   // Flash Voltage Strapping Pin    <-- ROOT CAUSE
  };
  ```
- **Hardware-Begruendung:** GPIO 12 und GPIO 13 auf dem ESP32-WROOM-32 sind Flash-Voltage-Strapping-Pins. GPIO 12 bestimmt die Flash-Versorgungsspannung (HIGH beim Boot = 1.8V Flash, kann Boot verhindern). GPIO 13 teilt diesen Strapping-Kontext. Obwohl GPIO 13 nach dem Boot als normaler GPIO verwendet werden koennte, hat das Framework entschieden, beide Pins dauerhaft zu reservieren, um Fehler bei ungluecklicher Hardware-Konfiguration zu vermeiden.
- **Konsequenz:** Jeder Versuch, GPIO 13 als Aktor- oder Sensor-GPIO zu konfigurieren, schlaegt mit ERROR_GPIO_RESERVED (1001) fehl. Der Server-seitige Konfigurations-Push sendet GPIO 13, der ESP lehnt ihn ab.
- **Evidenz:** Serial Output 1, Zeilen bei Timestamp 197068

### 5.2 HOCH: Doppelter NVS-Save fuer jeden Sensor

- **Schwere:** Mittel (kein Datenverlust, erhoehte NVS-Wear-Leveling-Last)
- **Detail:** Fuer jeden Sensor werden `saveSensorConfig()` und damit `validateSensorConfig()` zweimal aufgerufen:
  1. **Innerhalb `sensorManager.configureSensor()`** in sensor_manager.cpp: an mehreren Stellen (z.B. Zeile 250, 272, 308, 405, 567)
  2. **Ausserhalb in `parseAndConfigureSensorWithTracking()`** in main.cpp:2784 - NACH dem Rueckgabewert von `sensorManager.configureSensor()`
- **Problem-Code:** `main.cpp:2784`:
  ```cpp
  if (!configManager.saveSensorConfig(config)) {
      LOG_E(TAG, "Failed to save sensor config to NVS for GPIO " + String(config.gpio));
      ...
  }
  ```
  Dieser Aufruf ist redundant, weil `configureSensor()` bereits intern `saveSensorConfig()` aufruft und dabei den erfolgreichen NVS-Write bereits bestätigt.
- **Manifestation:** "Saved sensor config for GPIO X" erscheint zweimal im Log (mit leicht unterschiedlichen Timestamps).
- **Evidenz:** Timestamps 196948/196986 (GPIO 0), 197007/197027 (GPIO 4), analog in Output 2

### 5.3 MITTEL: sht31_humidity fehlt in Output 1 (unvollstaendiger Payload-Vergleich)

- **Schwere:** Mittel (Analyse-Hinweis fuer Konfig-Push-Unterschied zwischen den Runs)
- **Detail:** In Output 1 sagt `CFGRESP success=3`, aber im Log sind nur die Log-Eintraege fuer `sht31_temp` und `ds18b20` sichtbar. `sht31_humidity` muss im Payload vorhanden gewesen sein (3 Erfolge), aber seine Konfigurationslog-Zeilen fehlen im dargestellten Ausschnitt. Zwei Erklaerungen:
  - a) Der Log-Ausschnitt beginnt zu spaet und die `sht31_humidity`-Zeilen kamen vor dem gezeigten Bereich
  - b) `sht31_humidity` wurde als NEUER Sensor (nicht Update) verarbeitet und der Code-Pfad `sensor_manager.cpp:399-416` hat weniger sichtbare Logs (kein "Updated existing" sondern "Configured I2C sensor")
- **Vergleich mit Output 2:** In Output 2 erscheinen vollstaendige sht31_humidity-Logs (438186-438251), weil dort der Update-Pfad (sensor_manager.cpp:286) durchlaufen wird - der Sensor war bereits bekannt.

### 5.4 NIEDRIG: Dreifacher validateSensorConfig-Aufruf fuer I2C-Sensoren

- **Schwere:** Niedrig (Performance, unnoetige Log-Flut)
- **Detail:** Pro I2C-Sensor erscheint "GPIO validation skipped" dreimal:
  1. `main.cpp:2735` -> `configManager.validateSensorConfig(config)` (explizite Vorab-Validierung)
  2. `sensor_manager.cpp:250 oder 308` -> `configManager.saveSensorConfig(config)` -> intern `validateSensorConfig()`
  3. `main.cpp:2784` -> `configManager.saveSensorConfig(config)` -> intern `validateSensorConfig()` (der redundante zweite NVS-Save)
- **Konsequenz:** Drei identische Log-Eintraege pro I2C-Sensor, verwirrend fuer Log-Analyse.

### 5.5 NIEDRIG: Doppeltes "Handling actuator configuration from MQTT"

- **Schwere:** Niedrig (Cosmetic, kein Funktionsfehler)
- **Detail:** `main.cpp:2813` und `actuator_manager.cpp:740` loggen denselben Text mit verschiedenen TAGs (BOOT vs ACTUATOR). Das ist kein Bug, aber verwirrend.
- **Evidenz:** Timestamps 197045 (BOOT) und 197056 (ACTUATOR) in Output 1

---

## 6. Error-Code Erklaerungen

| Code | Name | Definition | Ausloesestelle |
|------|------|------------|----------------|
| 1001 | ERROR_GPIO_RESERVED | "GPIO pin is reserved by system" | `error_codes.h:17` |
| | Ausgeloest durch | `pump_actuator.cpp:47-49` nach `requestPin()` schlaegt fehl | |
| | Formatierung im Log | `[1001] [HARDWARE] Pump GPIO busy: 13` via `error_tracker.cpp:255-257` | |
| 1051 | ERROR_ACTUATOR_INIT_FAILED | "Failed to initialize actuator" | `error_codes.h:62` |
| | Ausgeloest durch | `actuator_manager.cpp:253-255` nachdem `driver->begin()` false zurueckgibt | |
| | Formatierung im Log | `[1051] [HARDWARE] Driver init failed` via `error_tracker.cpp:255-257` | |

**Error-Ketten-Analyse fuer GPIO 13:**

```
requestPin(13) [gpio_manager.cpp:165]
  -> isReservedPin(13) = true [gpio_manager.cpp:167]
  -> LOG_E "Attempted to request reserved pin 13" [gpio_manager.cpp:168]
  -> return false

PumpActuator::begin() [pump_actuator.cpp:29]
  -> requestPin() == false [pump_actuator.cpp:45]
  -> LOG_E "failed to reserve GPIO 13" [pump_actuator.cpp:46]
  -> errorTracker.trackError(1001, "Pump GPIO busy: 13") [pump_actuator.cpp:47-49]
  -> return false

ActuatorManager::configureActuator() [actuator_manager.cpp:187]
  -> driver->begin(config) == false [actuator_manager.cpp:251]
  -> LOG_E "Driver initialization failed for GPIO 13" [actuator_manager.cpp:252]
  -> errorTracker.trackError(1051, "Driver init failed") [actuator_manager.cpp:253-255]
  -> return false

ActuatorManager::handleActuatorConfig() [actuator_manager.cpp:739]
  -> configureActuator() == false [actuator_manager.cpp:793]
  -> LOG_E "Failed to configure actuator on GPIO 13..." [actuator_manager.cpp:794-797]
  -> publishError(ACTUATOR, UNKNOWN_ERROR, ...) [actuator_manager.cpp:799-802]

ConfigResponseBuilder::publishError() [config_response.cpp:21]
  -> publish() [config_response.cpp:42]
  -> "ConfigResponse published [actuator] status=error" [config_response.cpp:48-49]
```

---

## 7. Root Cause Analyse: GPIO 13 vs GPIO 14

| Aspekt | GPIO 13 (FAIL) | GPIO 14 (SUCCESS) |
|--------|---------------|-------------------|
| In RESERVED_GPIO_PINS[] | JA (Index 5) | NEIN |
| In SAFE_GPIO_PINS[] | NEIN | JA (Index 2) |
| Hardware-Grund | Flash Voltage Strapping Pin | Normaler I/O-Pin |
| `isReservedPin()` | true | false |
| `requestPin()` | return false, Zeile 168-169 | Erfolg, Zeile 229 |
| `PumpActuator::begin()` | return false, Zeile 50 | Zeile 74 LOG_I Init OK |
| Error-Codes | 1001, 1051 | keine |
| ConfigResponse | status=error | status=success |
| Funktionstest | nicht moeglich | ON/OFF-Commands erfolgreich |

**Fazit:** GPIO 13 und 14 sind beide als ADC2-Pins in `ADC2_GPIO_PINS[]` (esp32_dev.h:114-117) gelistet. Der entscheidende Unterschied ist die Aufnahme von GPIO 13 in `RESERVED_GPIO_PINS[]`, aber NICHT GPIO 14. GPIO 14 ist ein sicherer, vollstaendig nutzbarer I/O-Pin auf dem ESP32-WROOM-32.

---

## 8. Config-Push Flow Dokumentation

Der vollstaendige Weg einer Sensor/Aktor-Konfiguration vom Server zum ESP:

```
Server
  -> MQTT Publish: kaiser/god/esp/{ESP_ID}/system/config
  -> Payload: JSON mit "sensors": [...] und "actuators": [...]

ESP32 MQTT Callback [main.cpp:850-858]
  -> Topic-Match: config_topic
  -> handleSensorConfig(payload)    [main.cpp:857]
  -> handleActuatorConfig(payload)  [main.cpp:858]

handleSensorConfig [main.cpp:2568]
  1. JSON Parse [main.cpp:2572]
  2. correlationId extrahieren [main.cpp:2582-2585]
  3. sensors-Array iterieren [main.cpp:2612]
  4. parseAndConfigureSensorWithTracking() pro Sensor [main.cpp:2614]
     a. JSON-Felder extrahieren (gpio, sensor_type, name, ...) [main.cpp:2652-2730]
     b. configManager.validateSensorConfig(config) [main.cpp:2735]
     c. sensorManager.configureSensor(config) [main.cpp:2765]
        - intern: saveSensorConfig() [sensor_manager.cpp:250/272/308/405]
     d. configManager.saveSensorConfig(config) [main.cpp:2784] <- REDUNDANT
  5. ConfigResponseBuilder::publishWithFailures() [main.cpp:2626]

handleActuatorConfig [main.cpp:2812]
  -> actuatorManager.handleActuatorConfig(payload) [main.cpp:2824]

ActuatorManager::handleActuatorConfig [actuator_manager.cpp:739]
  1. JSON Parse [actuator_manager.cpp:743]
  2. actuators-Array iterieren [actuator_manager.cpp:773]
  3. parseActuatorDefinition() [actuator_manager.cpp:780]
  4. configureActuator(config) [actuator_manager.cpp:793]
     a. GPIO-Konflikt-Check vs. Sensoren [actuator_manager.cpp:208]
     b. createDriver(type) [actuator_manager.cpp:246]
     c. driver->begin(config) [actuator_manager.cpp:251]
        - intern: gpioManager.requestPin() [pump_actuator.cpp:45]
        - intern: gpioManager.configurePinMode(OUTPUT) [pump_actuator.cpp:53]
     d. configManager.saveActuatorConfig() [actuator_manager.cpp:277]
  5. ConfigResponseBuilder::publishSuccess/Error() [actuator_manager.cpp:799/810]
```

**MQTT Topic fuer Config-Push:** `kaiser/god/esp/{ESP_ID}/system/config`
**MQTT Topic fuer Config-Response:** `kaiser/god/esp/{ESP_ID}/system/config/response`

---

## 9. Vergleich Output 1 vs Output 2

| Aspekt | Output 1 | Output 2 |
|--------|----------|----------|
| Timestamp-Start | 196930 ms | 438147 ms (ca. 4 Min. spaeter) |
| Sensor-Payload | sht31_temp, (sht31_humidity verborgen), ds18b20 | sht31_temp, sht31_humidity, ds18b20 |
| sht31_humidity sichtbar im Log | NEIN (wahrscheinlich als "neuer" Sensor hinzugefuegt, weniger Logs) | JA (als Update verarbeitet, vollstaendige Logs) |
| sht31_temp Verarbeitungspfad | Multi-Value Update (Updated existing multi-value sensor) | Multi-Value Update (identisch) |
| Aktor-GPIO | 13 | 14 |
| Aktor-Konfiguration | FEHLER (GPIO reserved) | ERFOLG |
| ConfigResponse Sensor | success=3 failed=0 | success=3 failed=0 |
| ConfigResponse Aktor | status=error | status=success |
| Heartbeat-ACK | nicht sichtbar | ja (487016 ms) |
| Funktionstest Aktor | nicht moeglich | ON (464290ms) + OFF (466849ms) |

**Hauptunterschied:** Zwischen den beiden Runs wurde die Aktor-Konfiguration vom Server von GPIO 13 auf GPIO 14 korrigiert. Der Sensor-Payload ist in beiden Runs identisch (3 Sensoren), aber der Darstellungsunterschied bei `sht31_humidity` erklaert sich durch den Sensor-Status im ESP-RAM: In Output 2 war `sht31_humidity` bereits bekannt (Restart nach Output 1 oder NVS-Laden beim Boot), daher Update-Pfad mit vollstaendigen Logs.

---

## 10. Empfehlungen

### Empfehlung 1 (Hoch): Redundanten saveSensorConfig-Aufruf in main.cpp entfernen

**Datei:** `El Trabajante/src/main.cpp:2784-2788`

Der Aufruf `configManager.saveSensorConfig(config)` nach `sensorManager.configureSensor(config)` ist redundant, weil `configureSensor()` intern bereits `saveSensorConfig()` aufruft. Dieser redundante Aufruf verursacht:
- Doppelte NVS-Writes (erhoehte Wear-Leveling-Last auf Flash)
- Doppelte Log-Eintraege ("Saved sensor config for GPIO X" zweimal)
- Dreifachen Aufruf von `validateSensorConfig()` pro I2C-Sensor (dreifaches "GPIO validation skipped" Log)

**Fix:** Entfernen des gesamten Blocks:
```cpp
// ZU ENTFERNEN (main.cpp:2784-2788):
if (!configManager.saveSensorConfig(config)) {
    LOG_E(TAG, "Failed to save sensor config to NVS for GPIO " + String(config.gpio));
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_NVS_WRITE_FAILED, "NVS_WRITE_FAILED",
                           "Failed to save sensor config to NVS");
}
```

Der NVS-Fehlerfall ist bereits intern in `configureSensor()` abgedeckt (sensor_manager.cpp loggt ihn). Falls NVS-Fehler nach oben propagiert werden sollen, muss `configureSensor()` seinen Rueckgabewert entsprechend anpassen (aktuell gibt es `true` zurueck auch wenn NVS-Save fehlschlaegt).

### Empfehlung 2 (Hoch): Server-Konfiguration korrigieren - GPIO 13 auf unterstuetzten Pin aendern

**Ursache:** Der Server schickt GPIO 13 fuer den Aktor "Luftbefeuchter". GPIO 13 ist auf dem ESP32-WROOM-32 reserviert.

**Massnahme (Server-seitig):** Die Device-Konfiguration im Server fuer ESP_EA5484 muss auf einen nicht-reservierten Pin geaendert werden. Verfuegbare sichere Pins gemaess `SAFE_GPIO_PINS[]`: 4, 5, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33. GPIO 14 funktioniert (bewiesen durch Output 2).

**Massnahme (ESP-seitig, optional):** Beim Empfang einer Aktor-Konfiguration mit einem reservierten GPIO koennte der ESP eineklarere Fehlermeldung im CFGRESP-Payload zuruecksenden (z.B. `"error_detail": "GPIO 13 is a reserved strapping pin on ESP32-WROOM-32"`).

### Empfehlung 3 (Mittel): Doppeltes "Handling actuator configuration from MQTT" Log bereinigen

Das Log erscheint zweimal mit unterschiedlichen TAGs ("BOOT" aus main.cpp, "ACTUATOR" aus actuator_manager.cpp). Einer der beiden LOG_I-Aufrufe sollte entfernt oder auf DEBUG-Level reduziert werden.

**Option A:** `main.cpp:2813` auf `LOG_D` aendern (Delegation ist Implementierungsdetail)
**Option B:** `actuator_manager.cpp:740` auf `LOG_D` aendern

### Empfehlung 4 (Niedrig): GPIO-Reservierungsstatus in Config-Response kommunizieren

Wenn `requestPin()` fehlschlaegt wegen `isReservedPin()`, ist der aktuelle CFGRESP-Payload nur `status=error` ohne detaillierte Erklaerung. Der Error-Code 1001 wird nur im Serial-Log sichtbar, nicht im MQTT-Payload. Server-seitig waere es wertvoll, den Grund zu kennen.

**Massnahme:** In `ActuatorManager::handleActuatorConfig()` bei GPIO-Reserved-Fehler gezielt `ConfigErrorCode::GPIO_CONFLICT` mit Detail "GPIO X is a reserved system pin" zuruecksenden, statt `ConfigErrorCode::UNKNOWN_ERROR`.

---

## 11. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| gpio_manager.cpp RESERVED_GPIO_PINS | GPIO 13 bestaetigt als Flash Voltage Strapping Pin in esp32_dev.h:37 |
| pump_actuator.cpp begin() Error-Chain | Vollstaendig nachverfolgt: requestPin -> 1001 -> ACTUATOR 1051 |
| config_manager.cpp saveSensorConfig | Redundanz-Aufruf in main.cpp:2784 bestaetigt |
| sensor_manager.cpp configureSensor | Alle 5 saveSensorConfig-Aufrufe kartiert (Zeilen 250, 272, 308, 405, 567) |
| Relay-Typ in ActuatorManager | Relay wird wie Pump behandelt: createDriver("relay") -> PumpActuator (actuator_manager.cpp:180-181) |
| ADC2-Konflikt GPIO 13+14 | Beide ADC2-Pins - kein Unterschied bei WiFi-Nutzung |
| MQTT-Callback Topic | kaiser/god/esp/{ESP_ID}/system/config (main.cpp:855-858) |

---

## 12. Bewertung

- **Root Cause (GPIO 13 Fehler):** Eindeutig identifiziert. GPIO 13 ist in `RESERVED_GPIO_PINS[]` (esp32_dev.h:37) als Flash Voltage Strapping Pin reserviert. Die Firmware verhalt sich korrekt - der Fehler liegt in der Server-seitigen Konfiguration, die GPIO 13 fuer einen Aktor zuweist.

- **Naechste Schritte (nach Prioritaet):**
  1. Server-Konfiguration fuer ESP_EA5484 anpassen: Aktor "Luftbefeuchter" von GPIO 13 auf einen sicheren Pin umlegen (z.B. GPIO 14 wie in Output 2 demonstriert)
  2. Redundanten `saveSensorConfig`-Aufruf in `main.cpp:2784-2788` entfernen, um doppelte NVS-Writes und dreifache Validierungs-Logs zu eliminieren
  3. Optional: `LOG_I` in `main.cpp:2813` auf `LOG_D` setzen fuer saubereres Log-Output

- **Systemzustand:** Kein Absturz, kein SafeMode, kein Reboot-Loop. Der ESP laeuft stabil weiter. Nur der eine Aktor auf GPIO 13 ist nicht konfigurierbar.
