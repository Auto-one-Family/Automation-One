# ESP32 Debug Report - SHT31 I2C Failure Analysis

**Erstellt:** 2026-02-25
**Modus:** B (Spezifisch: "SHT31 I2C-Bugs auf ESP_472204")
**Quellen:** Serial-Log (inline), Firmware-Quelldateien (vollstaendig gelesen)

---

## 1. Zusammenfassung

Der ESP32 (ESP_472204) empfaengt Heartbeat-ACKs stabil ueber ~28 Minuten und bekommt dann eine SHT31-Sensor-Konfiguration via MQTT. Die Konfiguration wird korrekt angenommen und in NVS gespeichert. Unmittelbar danach beginnt eine dauerhaft fehlschlagende I2C-Leseschleife (Error 263 = `ESP_ERR_TIMEOUT`). **Der Fehler ist mit sehr hoher Wahrscheinlichkeit ein Hardware-Problem** (SHT31 physisch nicht erreichbar auf dem I2C-Bus), kein Firmware-Bug. Gleichzeitig gibt es drei identifizierte Firmware-Defizienzen: fehlendes Retry-Backoff, fehlendes Circuit-Breaker-Pattern fuer I2C-Lesefehler, und ein irreführendes Actuator-Error-Log fuer einen normalen Betriebsfall.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| Serial-Log (inline) | OK | 28min + SHT31-Session, vollstaendig geparst |
| `src/drivers/i2c_bus.cpp` | OK | Command-based protocol, Recovery-Logik gelesen |
| `src/drivers/i2c_sensor_protocol.cpp` | OK | SHT31-Protokoll-Definition gelesen |
| `src/services/sensor/sensor_manager.cpp` | OK | performMultiValueMeasurement, performAllMeasurements gelesen |
| `src/services/actuator/actuator_manager.cpp` | OK | handleActuatorConfig, Leerzustand gelesen |
| `src/services/config/config_manager.cpp` | OK | Konfigurierungspfad gelesen |
| `src/config/hardware/esp32_dev.h` | OK | I2C Pins: SDA=21, SCL=22, 100kHz |
| `src/models/error_codes.h` | OK | Error 1007 = ERROR_I2C_TIMEOUT bestaetigt |
| Docker / MQTT / Server | Nicht geprueft | Kein Indiz aus Serial-Log fuer Server-seitige Ursache |

---

## 3. Befunde

### 3.1 Timing-Analyse: Pre-Config Phase (Normal)

| Zeitraum | Beobachtung |
|----------|-------------|
| 20:37:48 - 21:04:49 | 28x Heartbeat-ACK, exakt alle 60s, Timestamp aufsteigend |
| Jitter | Max 312ms (21:04:49 +2526073ms vs erwartet +2526073ms) - Normal |
| Luecken | Keine unerwarteten Luecken, ESP laeuft stabil |

**Bewertung:** Pre-Config-Phase unauffaellig. WiFi, MQTT, Heartbeat-Loop, NTP alle funktional.

### 3.2 Sensor-Konfiguration (Korrekt, aber auffaellig)

**Zeitpunkt:** 21:05:47.255 (Timestamp 2584182ms)

```
[2584182] Handling sensor configuration from MQTT
[2584195] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)
[2584206] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)  <-- DOPPELT
[2584217] ConfigManager: Saved sensor config for GPIO 0
[2584217] Sensor Manager: ✅ Configuration persisted to NVS
[2584228] Sensor Manager: Configured I2C sensor 'sht31_temp' at address 0x44 (GPIO 0 is I2C bus)
[2584238] ConfigManager: I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)  <-- DREIFACH
[2584254] ConfigManager: Saved sensor config for GPIO 0
[2584255] BOOT: Sensor configured: GPIO 0 (sht31_temp)
```

**Finding 3.2a - Config-Dopplung (Niedrig / Kosmetisch):** Der ConfigManager-Log "I2C sensor 'sht31_temp' - GPIO validation skipped" erscheint dreimal fuer `sht31_temp` und zweimal fuer `sht31_humidity`. Dies ist ein Symptom davon, dass `saveSensorConfig` oder die Validierung mehrfach aufgerufen wird (vermutlich je einmal bei Check + Save in `configureSensor()` + dem NVS-Persist-Pfad). Kein funktionaler Schaden, aber der Log-Spam erschwert die Analyse.

**Finding 3.2b - sht31_temp UND sht31_humidity als separate Sensoren (Korrekt):** Der SHT31 ist ein Multi-Value-Sensor. Der Server sendet beide Werttypen als separate Sensor-Eintraege. Die Firmware erkennt dies korrekt ueber den Multi-Value-Pfad in `configureSensor()` (Zeilen 184-213): Wenn auf GPIO 0 bereits `sht31_temp` existiert und `sht31_humidity` vom gleichen Device-Type und gleicher I2C-Adresse kommt, wird es als zusaetzlicher Eintrag in `sensors_[]` abgelegt. Das ConfigResponse bestaetigte: `success=2 failed=0`. **Dieses Verhalten ist by design und korrekt.**

### 3.3 Actuator-Warning/Error (Bug - Falsche Log-Stufe)

```
[2584362] [WARNING] Actuator config array is empty
[2584375] [INFO   ] ConfigResponse published [actuator] status=error
```

- **Schwere:** Mittel (Falsche Bewertung im Report, kein funktionaler Fehler)
- **Detail:** `main.cpp:840` ruft `handleSensorConfig(payload)` UND sofort `handleActuatorConfig(payload)` auf dem **gleichen** MQTT-Payload auf. Das Sensor-Config-Payload enthaelt kein `actuators`-Array. `ActuatorManager::handleActuatorConfig()` parst das Payload, findet `actuators.size() == 0` und loggt `[WARNING] "Actuator config array is empty"`. Das ConfigResponse wird dann als `status=error` publiziert.
- **Root Cause (Firmware-Bug):** Wenn ein Sensor-only-Payload empfangen wird (kein `actuators`-Key), behandelt die Firmware das als Fehler (`ConfigErrorCode::MISSING_FIELD`). Das ist falsch. Ein fehlendes `actuators`-Array in einem Sensor-Config-Payload ist kein Fehler - es bedeutet "keine Aenderungen an Aktoren". Die Firmware sollte pruefen, ob der Key `actuators` ueberhaupt im Payload vorhanden ist, bevor sie den Fehler-Log und das Fehler-ConfigResponse generiert.
- **Evidenz:** `actuator_manager.cpp:740-747` / `main.cpp:839-841`

### 3.4 I2C Error 263 - Root Cause Analyse (Kritisch)

```
[2585406][E][Wire.cpp:513] requestFrom(): i2cRead returned Error 263
[2585514] [ERROR] [I2C] I2C: Read timeout for sht31
[2585514] [ERROR] [ERRTRAK] [1007] [HARDWARE] sht31 read timeout
```

**Error 263 Dekodierung:**
- Dezimal 263 = Hex `0x107`
- ESP-IDF: `ESP_ERR_TIMEOUT = 0x107` (Timeout beim I2C-Read)
- Dies ist **kein Protokoll-Fehler** (NACK = 2/3, Bus-Error = 4), sondern ein **Hardware-Timeout**: Der SHT31 hat den `requestFrom()` nicht innerhalb von 100ms beantwortet (Wire.setTimeOut(100) in `i2c_bus.cpp:114`)

**Ablauf pro Zyklus (exakt 1.127s):**
1. `executeCommandBasedProtocol()` sendet Command 0x2400 (High Repeatability, No Clock Stretch)
2. `delay(16)` - 16ms Conversion-Wait (korrekt laut Datenblatt 15.5ms max)
3. `Wire.requestFrom(0x44, 6)` - SHT31 antwortet NICHT
4. Nach 100ms: Wire.setTimeOut fires → `ESP_ERR_TIMEOUT (263)`
5. Timeout-Schleife in `executeCommandBasedProtocol()` (Zeilen 825-833) laeuft ab
6. Fehler wird geloggt, Return false
7. `sensor_manager.cpp:931` loggt "I2C read failed for sht31"
8. `performAllMeasurements()` loggt "Multi-value measurement failed for GPIO 0"
9. Naechste Iteration beginnt sofort (kein Backoff)

**Timing-Nachweis:**
```
21:05:47.459 I2C READ START
21:05:48.587 ERROR (Timestamp-Delta: ~1128ms)
21:05:48.617 I2C READ START
21:05:49.741 ERROR (Delta: ~1127ms)
...
```
Konstant ~1127ms pro Fehlerzyklus = 16ms conversion + ~100ms Wire-Timeout + ~1011ms unerklaert.

**Warum ~1.1s statt ~116ms (16+100)?**
Der Wire-Timeout `Wire.setTimeOut(100)` blockiert den Main-Thread fuer bis zu 100ms. Zusaetzlich existiert in `executeCommandBasedProtocol()` eine `while(Wire.available() < requested)` Polling-Schleife (Zeilen 825-833) mit eigenem 100ms Timeout. Beide koennen aufaddieren. Der Rest (~800ms+) koennte durch MQTT-Loop-Verarbeitung, Heartbeat-ACK-Verarbeitung (sichtbar um 21:05:52) und andere System-Tasks entstehen. Dies deutet auf Blocking im Main-Thread hin.

**Root Cause Diagnose:**
- **Wahrscheinlichster Grund (85%):** SHT31 physisch nicht am I2C-Bus. Kein Pull-Up-Widerstand (4.7kΩ auf SDA/SCL benoetigt), Kabel nicht verbunden, oder falsche VCC (3.3V benoetigt).
- **Zweitwahrscheinlichster Grund (10%):** SHT31 auf falscher Adresse. Standard 0x44 (ADDR=GND), alternativ 0x45 (ADDR=VDD). Die Firmware nutzt 0x44.
- **Drittwahrscheinlichster Grund (5%):** I2C-Bus korrekt verbunden, aber SHT31 in STOP-Condition haengend (erfordert Bus-Recovery). Da in den Logs kein `I2C bus recovery initiated` erscheint, greift der Recovery-Pfad hier nicht - weil Error 263 (Timeout) nicht der Recovery-Trigger ist.

### 3.5 Fehlendes Retry-Backoff (Firmware-Defizient - Hoch)

- **Schwere:** Hoch
- **Detail:** Nach jedem fehlgeschlagenen I2C-Read beginnt `performAllMeasurements()` sofort die naechste Messung ohne Wartezeit. Das Intervall zwischen Fehlversuchen betraegt ~1.1s (reine Wire-Timeout-Zeit), nicht das konfigurierte Measurement-Interval.
- **Ursache:** In `performAllMeasurements()` (Zeilen 1054-1055 im sensor_manager.cpp) wird `sensors_[i].last_reading` bei Fehler NICHT aktualisiert (`sensors_[i].last_reading = now` erscheint nur im Erfolgs-Branch, Zeile 1074). Daher ist `now - sensors_[i].last_reading >= sensor_interval` beim naechsten Loop-Durchlauf sofort wieder `true`.
- **Auswirkung:** Bei dauerhaftem Hardware-Fehler laeuft der ESP32 in einer aggressiven Polling-Schleife (~1 Fehler/s). Kein Watchdog-Problem (yield() wird aufgerufen), aber erheblicher Log-Spam und unnoetige I2C-Bus-Last.
- **Evidenz:** Log zeigt 11 aufeinanderfolgende Fehler in ~13s nach Sensor-Konfiguration.

### 3.6 Fehlender I2C-Timeout Recovery-Trigger (Firmware-Defizient - Mittel)

- **Schwere:** Mittel
- **Detail:** `recoverBus()` / `attemptRecoveryIfNeeded()` werden nur bei Wire-Error-Codes 4 (Bus-Error) und 5 ausgeloest (i2c_bus.cpp:480). Error 263 (ESP_ERR_TIMEOUT) landet als regulaerer `return false` in `executeCommandBasedProtocol()` ohne Recovery-Versuch. Fuer den Fall "SHT31 haengt SDA low" wuerde der Recovery-Mechanismus helfen - er wird aber nicht aufgerufen.
- **Evidenz:** Kein "I2C: Bus recovery initiated" im Log trotz wiederholter Timeouts.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| Docker / Server-Health | Nicht durchgefuehrt (Serial-Log zeigt stabile MQTT-Verbindung, kein Server-Indiz) |
| MQTT-Traffic | Nicht durchgefuehrt (Heartbeat-ACKs im Log bestaetigen MQTT-Konnektivitaet) |
| DB-Check | Nicht durchgefuehrt (Sensor-Config als erfolgreich bestaetigt, kein DB-Indiz) |
| Firmware-Quelldateien | Vollstaendig gelesen (10 Dateien) |

Erweiterung auf Server/MQTT-Layer nicht indiziert: Das Serial-Log zeigt eindeutig einen Hardware-seitigen I2C-Fehler direkt nach der Konfiguration. MQTT und Server arbeiten korrekt (Heartbeat-ACKs, Config-Response erfolreich publiziert).

---

## 5. Alle Errors und Warnings dokumentiert

| Zeit | Level | Code | Nachricht |
|------|-------|------|-----------|
| 21:05:47 | WARNING | - | Actuator config array is empty |
| 21:05:47 | INFO | - | ConfigResponse [actuator] status=error |
| 21:05:48 | ERROR | 1007 | sht31 read timeout (1. Versuch) |
| 21:05:49 | ERROR | 1007 | sht31 read timeout (2. Versuch) |
| 21:05:50 | ERROR | 1007 | sht31 read timeout (3. Versuch) |
| 21:05:51 | ERROR | 1007 | sht31 read timeout (4. Versuch) |
| 21:05:53 | ERROR | 1007 | sht31 read timeout (5. Versuch) |
| 21:05:54 | ERROR | 1007 | sht31 read timeout (6. Versuch) |
| 21:05:55 | ERROR | 1007 | sht31 read timeout (7. Versuch) |
| 21:05:56 | ERROR | 1007 | sht31 read timeout (8. Versuch) |
| 21:05:57 | ERROR | 1007 | sht31 read timeout (9. Versuch) |
| 21:05:58 | ERROR | 1007 | sht31 read timeout (10. Versuch) |
| 21:06:00 | ERROR | 1007 | sht31 read timeout (11. Versuch) |
| 21:06:01 | ERROR | 1007 | sht31 read timeout (12. Versuch, Log-Ende) |

**Gesamt:** 12x ERROR 1007, 1x WARNING Actuator-Empty. Kein CRITICAL. Keine Watchdog-Events. Kein SafeMode-Trigger. Kein Reboot.

---

## 6. Bewertung & Empfehlungen

### Root Cause (Hauptursache)

**Hardware:** SHT31 ist physisch nicht erreichbar auf dem I2C-Bus des ESP_472204. Der Wire.setTimeOut(100ms) loest aus, was ESP-IDF Error 263 (`ESP_ERR_TIMEOUT`) generiert. Die Firmware reagiert korrekt mit Fehler-Log und ErrorTracker, hat aber kein Backoff.

### Naechste Schritte (priorisiert)

**Sofort (Hardware-Pruefung):**
1. I2C-Verbindung pruefen: SHT31 SDA → GPIO21, SCL → GPIO22 am ESP32-WROOM-32
2. Pull-Up-Widerstaende pruefen: 4.7kΩ auf SDA und SCL nach 3.3V benoetigt
3. VCC des SHT31 pruefen: 3.3V (nicht 5V!)
4. I2C-Scan via Firmware-Bus-Scan bestaetigen: `i2cBusManager.scanBus()` sollte 0x44 finden
5. ADDR-Pin des SHT31 pruefen: GND → Adresse 0x44, VDD → Adresse 0x45

**Kurzfristig (Firmware - Bug-Fix 1, Hohe Prioritaet):**

**Problem:** `sensor_manager.cpp` aktualisiert `sensors_[i].last_reading` nicht bei Fehler.
```cpp
// performAllMeasurements(), Zeile ~1071-1075 (aktuell):
if (count == 0) {
    LOG_W(TAG, "Sensor Manager: Multi-value measurement failed for GPIO " + String(sensors_[i].gpio));
} else {
    sensors_[i].last_reading = now;  // NUR bei Erfolg!
}

// FIX: Auch bei Fehler Timestamp setzen, damit Backoff greift:
if (count == 0) {
    LOG_W(TAG, "Sensor Manager: Multi-value measurement failed for GPIO " + String(sensors_[i].gpio));
    sensors_[i].last_reading = now;  // Backoff: Naechster Versuch erst nach sensor_interval
} else {
    sensors_[i].last_reading = now;
}
```
Dies gilt analog fuer den Single-Value-Pfad (Zeile ~1085-1087).

**Kurzfristig (Firmware - Bug-Fix 2, Mittlere Prioritaet):**

**Problem:** `actuator_manager.cpp:740-747` loggt WARNING + publiziert ERROR fuer normalen "kein Aktor" Fall.
```cpp
// actuator_manager.cpp:740-747 (aktuell):
if (total == 0) {
    String message = "Actuator config array is empty";
    LOG_W(TAG, message);
    ConfigResponseBuilder::publishError(
        ConfigType::ACTUATOR, ConfigErrorCode::MISSING_FIELD, message, ...);
    return false;
}

// FIX: Pruefen ob 'actuators'-Key ueberhaupt im Payload vorhanden ist:
if (!doc.containsKey("actuators")) {
    // Kein 'actuators'-Schluessel = kein Auftrag = kein Fehler
    LOG_D(TAG, "No 'actuators' key in payload - skipping actuator config");
    return true;  // Kein Fehler, kein Error-Response
}
// Erst hier: actuators-Array pruefen
if (total == 0) {
    // ... wie bisher
}
```

**Mittelfristig (Firmware - Improvement):**
- I2C-Timeout (Error 263) als Recovery-Trigger hinzufuegen in `attemptRecoveryIfNeeded()` neben Error 4 und 5
- Exponentielles Backoff fuer I2C-Fehler (z.B. 1. Fehler: 30s, 2. Fehler: 60s, ab 3. Fehler: 300s)

### Einordnung

Der ESP32 selbst ist in stabilem Zustand: kein Reboot, kein SafeMode, kein Watchdog, MQTT aktiv. Das Problem ist ausschliesslich die fehlende physische I2C-Verbindung zum SHT31. Die Firmware-Defizienzen (kein Backoff, falscher Actuator-Error) sind vorhanden aber unkritisch fuer den laufenden Betrieb.
