# Analyse-Auftrag: P4-NVS Sensor-Read + Multi-Rule-Konflikte

**Ziel-Repo:** auto-one (Alle 3 Schichten — Schwerpunkt Firmware)
**Typ:** Analyse (KEIN Code aendern, nur IST-Zustand dokumentieren)
**Prioritaet:** HIGH
**Datum:** 2026-03-31
**Geschaetzter Aufwand:** ~3-4h
**Abhaengigkeit:** SAFETY-P4 (implementiert), SAFETY-RTOS-IMPL (implementiert)
**Kontext:** Vor Umsetzung von SAFETY-P4-NVS muessen 5 offene Fragen geklaert werden, die den Erfolg der Offline-Rule-Persistierung direkt beeinflussen.

---

## Hintergrund

SAFETY-P4 hat eine 4-State-Machine fuer Offline-Hysterese implementiert: max 8 Rules, Config-Push vom Server, OfflineModeManager evaluiert Rules im Offline-Mode. SAFETY-P4-NVS soll diese Rules in NVS persistieren, damit sie nach einem ESP32-Power-Cycle sofort verfuegbar sind — auch ohne Server.

**5 offene Fragen** muessen VOR der NVS-Implementierung geklaert werden, weil sie das Design beeinflussen:

1. **Sensor-Read lokal:** Kann der ESP die Sensorwerte fuer Offline-Hysterese ueberhaupt lokal lesen und interpretieren — oder liefert der ValueCache nur Rohwerte die ohne Server-Processing sinnlos sind?
2. **Multi-Rule-Konflikte:** Was passiert wenn mehrere Rules denselben Aktor steuern?
3. **Boot-Timing:** Wie verhindert man dass Rules bei leerem ValueCache feuern?
4. **NVS-Schema:** Individual-Keys vs. Blob — was wurde tatsaechlich implementiert?
5. **Rule-Update-Race:** Was passiert wenn ein Config-Push unterwegs verloren geht?

---

## Block A: Sensor-Read im Offline-Mode (KERN-FRAGE)

### A1: Was liefert getSensorValue(gpio, sensor_type)?

**Gefundene Implementierung:**

```
sensor_manager.h:126-127   getSensorValue(uint8_t gpio, const char* sensor_type) const
sensor_manager.cpp:1698-1716  Implementierung
sensor_manager.cpp:1574-1576  updateValueCache() Aufruf aus publishSensorReading()
```

Der ValueCache wird befuellt in `publishSensorReading()` (aufgerufen aus `performAllMeasurements()` und `performMultiValueMeasurement()`):

```cpp
// sensor_manager.cpp:1574-1576
void SensorManager::publishSensorReading(const SensorReading& reading) {
    // SAFETY-P4: Always update value cache regardless of MQTT connectivity
    updateValueCache(reading.gpio, reading.sensor_type.c_str(), reading.processed_value);
    // ...
}
```

**Entscheidend:** Der ValueCache wird IMMER befuellt — auch wenn MQTT disconnected ist. Das `reading.processed_value` kommt aus `applyLocalConversion()`.

**getSensorValue() Verhalten bei Cache-Miss:**
```cpp
// sensor_manager.cpp:1698-1716
float SensorManager::getSensorValue(uint8_t gpio, const char* sensor_type) const {
    for (uint8_t i = 0; i < value_cache_count_; i++) {
        const ValueCacheEntry& entry = value_cache_[i];
        if (!entry.valid) continue;
        if (entry.gpio != gpio) continue;
        if (strncmp(entry.sensor_type, sensor_type, 23) != 0) continue;
        // Check stale timeout
        if (millis() - entry.timestamp_ms >= VALUE_CACHE_STALE_MS) {
            return NAN;  // Stale → NAN
        }
        return entry.value;
    }
    return NAN;  // Not found → NAN
}
```

**Stale-Timeout:** 5 Minuten (`VALUE_CACHE_STALE_MS = 300000UL`, sensor_manager.h:160)
**Cache-Size:** 20 Slots (`MAX_VALUE_CACHE_ENTRIES = 20`, sensor_manager.h:161)

### A2: Library-Output vs. Raw-Wert pro Sensortyp

**applyLocalConversion() — vollstaendige Analyse** (sensor_manager.cpp:60-87):

| Sensortyp | Korrekter Key-Name | ValueCache liefert | Einheit | Berechnung |
|-----------|-------------------|-------------------|---------|------------|
| SHT31 Temp | `sht31_temp` | Physikalischer Wert | °C | `-45.0 + 175.0 × (raw / 65535.0)` |
| SHT31 Humidity | `sht31_humidity` | Physikalischer Wert | %RH | `100.0 × (raw / 65535.0)` |
| DS18B20 | `ds18b20` | Physikalischer Wert | °C | `(float)(int32_t)raw × 0.0625` |
| BMP280 Temp | `bmp280_temp` | Physikalischer Wert | °C | `raw / 100.0` (centidegrees) |
| BMP280 Pressure | `bmp280_pressure` | Physikalischer Wert | hPa | `raw / 100.0` (centipascals) |
| BME280 Temp | `bme280_temp` | Physikalischer Wert | °C | `raw / 100.0` |
| BME280 Pressure | `bme280_pressure` | Physikalischer Wert | hPa | `raw / 100.0` |
| BME280 Humidity | `bme280_humidity` | Physikalischer Wert | % | `raw / 1024.0` |
| pH | `ph` | **RAW ADC-Wert** | ADC 0-4095 | `(float)raw_value` — kein Mapping |
| EC | `ec` | **RAW ADC-Wert** | ADC 0-4095 | `(float)raw_value` — kein Mapping |
| Bodenfeuchte | `moisture` | **RAW ADC-Wert** | ADC 0-4095 | `(float)raw_value` — kein Mapping |

**Hinweis Sensor-Typ-Namen:** Die korrekten Keys sind aus `sensor_registry.cpp` (Zeilen 11-131). Die Namen `sht31_temp` / `sht31_humidity` werden als `server_sensor_type` nach `getServerSensorType()` normalisiert bevor sie im ValueCache gespeichert werden. Der `sensor_value_type` in der OfflineRule muss EXAKT diesem String entsprechen.

### A3: ValueCache-Befuellung — Physikalisch oder Raw?

**Datenfluss:**
```
performAllMeasurements()
  └─ performMeasurementForConfig() / performMultiValueMeasurement()
       └─ Hardware-Read (I2C/OneWire/ADC) → raw_value (uint32_t)
       └─ applyLocalConversion(server_sensor_type, raw_value) → conv.value (float)
       └─ reading.processed_value = conv.value
  └─ publishSensorReading(reading)
       └─ updateValueCache(gpio, sensor_type, processed_value)  ← ValueCache befuellt
       └─ mqtt_client_->publish(payload mit "raw" + "value")    ← MQTT (falls connected)
```

**Konklusion Block A:**

Der MQTT-Payload enthaelt BEIDE Felder: `"raw"` (integer) + `"value"` (float, konvertiert). Der Server nutzt `"raw"` fuer seine eigene Verarbeitung (`raw_mode: true`). Der ValueCache speichert `processed_value` = das konvertierte `"value"`.

### Ergebnis-Tabelle Block A

| Sensortyp | ValueCache liefert | Einheit | Offline-Hysterese moeglich? | Begruendung |
|-----------|-------------------|---------|----------------------------|-------------|
| SHT31 Temp (`sht31_temp`) | Physikalisch | °C | **JA** | applyLocalConversion liefert °C, Thresholds in °C sinnvoll |
| SHT31 Humidity (`sht31_humidity`) | Physikalisch | %RH | **JA** | applyLocalConversion liefert %RH, Thresholds in % sinnvoll |
| DS18B20 (`ds18b20`) | Physikalisch | °C | **JA** | raw × 0.0625 = °C, Thresholds in °C sinnvoll |
| BMP280 Pressure (`bmp280_pressure`) | Physikalisch | hPa | **JA** | centipascal / 100 = hPa |
| BMP280 Temp (`bmp280_temp`) | Physikalisch | °C | **JA** | centidegrees / 100 = °C |
| BME280 Humidity (`bme280_humidity`) | Physikalisch | % | **JA** | raw / 1024 = % |
| pH (`ph`) | **RAW ADC** | ADC 0-4095 | **EINGESCHRAENKT** | Threshold muss in ADC-Einheiten definiert werden, nicht in pH |
| EC (`ec`) | **RAW ADC** | ADC 0-4095 | **EINGESCHRAENKT** | Threshold muss in ADC-Einheiten, nicht in mS/cm |
| Bodenfeuchte (`moisture`) | **RAW ADC** | ADC 0-4095 | **EINGESCHRAENKT** | Threshold muss in ADC-Einheiten, nicht in % |

**Handlungsbedarf:**
- Analoge Sensoren (pH, EC, Moisture): Der Server muss die Offline-Rule-Thresholds in ADC-Einheiten senden (d.h. den kalibrierten Umkehrmapping anwenden bevor er Thresholds in den Config-Push schreibt), ODER: der Server erstellt keine Offline-Rules fuer analoge Sensoren.
- Die Firmware-Seite benoetigt keine Aenderung — sie speichert was sie bekommt.
- Minimalaufwand fuer ADC-Mapping: Lineare Interpolation (~10 Zeilen). Jedoch: Dies waere Business-Logic auf dem ESP32, was der Server-Centric-Architektur widerspricht. **Empfehlung: Server sendet kalibrierte ADC-Thresholds.**

---

## Block B: Multi-Rule-Konflikte (Derselbe Aktor, mehrere Rules)

### B1: Evaluierungsreihenfolge im OfflineModeManager

**Gefundene Implementierung** (offline_mode_manager.cpp:87-143):

```cpp
void OfflineModeManager::evaluateOfflineRules() {
    if (offline_rule_count_ == 0) return;

    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        OfflineRule& rule = offline_rules_[i];

        if (!rule.enabled || rule.server_override) continue;

        float val = sensorManager.getSensorValue(rule.sensor_gpio, rule.sensor_value_type);

        if (isnan(val)) {
            // NAN → Rule UEBERSPRUNGEN (nicht triggered!)
            continue;
        }

        bool new_state = rule.is_active;
        // Heating mode check ...
        // Cooling mode check ...

        if (new_state != rule.is_active) {
            rule.is_active = new_state;
            actuatorManager.controlActuatorBinary(rule.actuator_gpio, new_state);
        }
    }
}
```

**Evaluierungsreihenfolge:** Strikt sequentiell, Index 0 → N-1.

### B2: Aktuelles Verhalten bei Konflikt

**Analyse des Szenarios (RH=43%, Temp=31°C):**

```
Evaluation Zyklus (jede 5s):
  Rule 0: sensor=SHT31_humidity, val=43%, activate_below=45% → 43 < 45 → new_state=ON
    → rule[0].is_active=ON → actuatorManager.controlActuatorBinary(GPIO_BEFEUCHTER, ON)

  Rule 1: sensor=SHT31_temp, val=31°C, deactivate_above=30°C → 31 > 30, rule[1].is_active=ON?
    → Wenn Rule 1 bereits aktiv war (ON) → 31 > 30 → new_state=OFF
    → rule[1].is_active=OFF → actuatorManager.controlActuatorBinary(GPIO_BEFEUCHTER, OFF)

Endzustand: GPIO_BEFEUCHTER = OFF (Rule 1 gewinnt, da letzte Evaluierung)
```

**Verhalten:**
- **Evaluierungsreihenfolge:** sequentiell (Index 0 → N-1)
- **Konfliktaufloesung:** last-wins (kein Priority-System, kein Safety-First AUS > AN)
- **Kein Flapping innerhalb Zyklus:** Jede Rule prueft ihren eigenen `is_active` State
- **server_override pro Rule, nicht pro Aktor:** Wenn Rule 0 server_override=true, Rule 1 nicht — beide koennen denselben Aktor trotzdem unabhaengig setzen

**Deterministisch?** Ja — der Ausgang ist vorhersehbar wenn die Rule-Reihenfolge bekannt ist.

### B3: Blockiert das den NVS-Auftrag?

**Nein.** Das Konflikt-Verhalten existiert bereits im RAM-Only-Betrieb. NVS aendert nichts an der Evaluierungslogik — es persistiert nur dieselben Rules. Der NVS-Auftrag kann ohne Konfliktloesung umgesetzt werden.

**Empfehlung fuer Server/TM:** Der Server MUSS sicherstellen, dass keine zwei Rules denselben `actuator_gpio` steuern wenn die intendierte Logik Safety-First erfordert. Alternativ: Serverseitige Rule-Validierung bei Config-Build.

### Ergebnis Block B

- **Evaluierungsreihenfolge:** sequentiell (Index 0 → N-1)
- **Konfliktaufloesung:** last-wins (Rule mit hoeherem Index gewinnt)
- **Blockiert P4-NVS:** **NEIN**
- **Handlungsbedarf:** Server-seitige Validierung empfohlen (keine zwei Rules mit identischem `actuator_gpio`), aber nicht Blocker fuer NVS.

---

## Block C: Boot-Timing — ValueCache bei Start leer

### C1: Wann wird der ValueCache erstmals befuellt?

**Safety-Task Loop** (safety_task.cpp:47-111, Loop-Intervall: 10ms):

```
Loop Iteration 1 (nach Task-Start):
  1. Cross-Core Notifications (non-blocking)
  2. sensorManager.performAllMeasurements()   ← Erster Mess-Versuch
  3. actuatorManager.processActuatorLoops()
  4. checkServerAckTimeout()
  5. processActuatorCommandQueue()
  6. processSensorCommandQueue()
  7. processConfigUpdateQueue()
  8. healthMonitor.loop()
  9. offlineModeManager.checkDelayTimer()
  10. if (isOfflineActive()): evaluateOfflineRules() ← NICHT aktiv bei Boot
  11. vTaskDelay(10ms)
```

**Erste Messung:** Bereits im ersten Loop-Zyklus. Latenz bis zum ersten ValueCache-Eintrag:
- SHT31 (I2C): ~50ms fuer Single-Shot-Measurement
- DS18B20 (OneWire): bis ~750ms (12-bit Conversion)
- Analoge Sensoren: <1ms (ADC-Read)

**ValueCache nach erstem Zyklus:** Alle konfigurierten Sensoren befuellt, sofern Hardware antwortet.

### C2: Was macht evaluateOfflineRules() wenn ValueCache leer ist?

**Wenn NAN zurueckgegeben wird** (offline_mode_manager.cpp:101-106):

```cpp
float val = sensorManager.getSensorValue(rule.sensor_gpio, rule.sensor_value_type);

if (isnan(val)) {
    // Sensor stale or unavailable — skip, keep current state
    LOG_D(TAG, ...);
    continue;  // ← Rule wird UEBERSPRUNGEN
}
```

**Kein falsches Triggern bei leerem Cache.** `is_active` bleibt unveraendert (initialisiert mit `false` nach NVS-Load — `offline_rules_[i].is_active = false` in `loadOfflineRulesFromNVS()`).

### C3: Existierender Grace-Period-Mechanismus

**Der 30s-Timer ist der natuerliche Boot-Guard:**

```
Boot → Firmware start → SAFETY-P4 mode_ = ONLINE
  → WiFi verbindet
  → MQTT verbindet
  → Falls MQTT sofort again offline: onDisconnect() → mode_ = DISCONNECTED, timer start
  → Erst nach 30s: mode_ = OFFLINE_ACTIVE
  → In diesen 30s: 30.000ms / 30ms_Messintervall ≈ 1000 Messzyklen
  → ValueCache nach 30s gut gefuellt
```

**Sonderfall: Power-Cycle ohne WiFi (direkt offline nach Boot):**
```
Boot → WiFi verbindet nicht → MQTT verbindet nicht → onDisconnect() direkt
  → Disconnect-Timer laeuft von Boot
  → In 30s schafft performAllMeasurements() ~30 Zyklen (bei 30s Messintervall)
  → Mindestens 1 SHT31-Messung, evtl. keine DS18B20 (750ms Latenz, aber immer noch <30s)
  → Nach 30s: OFFLINE_ACTIVE → ValueCache hat mindestens 1 Eintrag pro Sensor
```

### Ergebnis Block C

- **Erster ValueCache-Eintrag nach Boot:** <1 Zyklus (10ms Loop) + Sensor-Latenz (~50ms SHT31, ~750ms DS18B20)
- **Verhalten bei leerem Cache:** Rule wird **uebersprungen** (isnan → continue), kein falsches Triggern
- **Grace Period vorhanden:** 30s DISCONNECTED-Timer ist der natuerliche Boot-Guard
- **Blockiert P4-NVS:** **NEIN**
- **Handlungsbedarf:** **KEIN** zusaetzlicher Boot-Guard noetig. Das 30s-Fenster reicht fuer erste Messungen.

---

## Block D: NVS-Schema — IST-Zustand vs. Auftrag

### D1: Was wurde tatsaechlich implementiert?

**Individual-Keys** — implementiert in `offline_mode_manager.cpp`:

```
Namespace: "offline"  (Zeile 163, 197, 293)

Schreib-Keys (saveOfflineRulesToNVS):
  ofr_count     → uint8  (Zeile 298)
  ofr_{i}_en    → uint8  (Zeile 303)
  ofr_{i}_agpio → uint8  (Zeile 307)
  ofr_{i}_sgpio → uint8  (Zeile 311)
  ofr_{i}_svtyp → string (Zeile 315)
  ofr_{i}_actb  → float  (Zeile 319)
  ofr_{i}_deaa  → float  (Zeile 323)
  ofr_{i}_acta  → float  (Zeile 327)
  ofr_{i}_deab  → float  (Zeile 331)

Lese-Keys (loadOfflineRulesFromNVS):
  Identisch — kein Mismatch zwischen Write und Read
```

**Maximale NVS-Key-Anzahl:** 1 (ofr_count) + 8 Rules × 8 Keys = **65 NVS-Entries** (Namespace "offline")

### D2: Partial-Write-Risiko bewerten

**Szenario:** ESP32 schreibt Rule-Update fuer Rule 0 (8 Keys), Stromverlust nach Key 4.

```
Geschriebene Keys:  ofr_0_en, ofr_0_agpio, ofr_0_sgpio, ofr_0_svtyp
Nicht geschrieben: ofr_0_actb (neuer Wert!), ofr_0_deaa, ofr_0_acta, ofr_0_deab
Resultat nach Reboot: ofr_0_actb/deaa/acta/deab = ALTE Werte aus vorheriger NVS-Schreibung
```

**Zeitfenster:** Jeder NVS-Write (Flash-Seiten-Operation) dauert ca. 2-5ms. Fuer 8 Keys: **~16-40ms Risiko-Fenster**.

**ESP32 NVS-Mechanismus:** NVS schreibt page-by-page. Innerhalb einer NVS-Page sind Writes durch den NVS-internen CRC abgesichert — ein unvollstaendiger Write einer Seite wird beim naechsten Boot erkannt und als "dirty" markiert. **Aber:** Der CRC sichert den einzelnen Key-Value-Eintrag, nicht die atomare Konsistenz mehrerer Keys.

**Shadow-Copy-Mechanismus (vorhanden, gut):**
```cpp
// Change-detection: skip NVS write if nothing changed
if (offline_rule_count_ == shadow_rule_count_ &&
    memcmp(offline_rules_, offline_rules_shadow_,
           sizeof(OfflineRule) * offline_rule_count_) == 0) {
    return;  // ← Kein Write → kein Risiko
}
```
Writes passieren nur wenn sich wirklich etwas geaendert hat — das minimiert das Risikofenster erheblich.

**Kleine Inkonsistenz im Shadow-Copy-Update** (Zeile 330):
```cpp
// Update shadow copy
memcpy(offline_rules_shadow_, offline_rules_, sizeof(OfflineRule) * MAX_OFFLINE_RULES);
//                                                                    ^^^^^^^^^^^^^^^^^
// Sollte offline_rule_count_ sein, aber MAX_OFFLINE_RULES ist korrekt
// (Arrays sind gleich gross, kein Memory-Bug — nur kosmetisch)
```

### D3: Empfehlung

**Individual-Keys beibehalten ist akzeptabel** fuer diesen Use-Case:
1. Risikofenster klein (~24ms pro Rule-Update)
2. Shadow-Copy verhindert unnoetige Writes
3. Im schlimmsten Fall (Partial-Write): inkonsistente Rule → unkorrekte Hysterese fuer 1 Rule bis naechster Config-Push
4. **Kein Datenverlust fuer Aktor oder Sensor** — nur die Thresholds koennten falsch sein

**Blob-Alternative waere atomar**, aber erfordert Umschreiben von Load/Save. Nicht blockierend.

### Ergebnis Block D

- **Implementierter Ansatz:** Individual-Keys
- **NVS-Namespace:** `"offline"`
- **Max NVS-Keys:** 65 (1 + 8×8)
- **Partial-Write-Risiko:** **Akzeptabel** (kleines Zeitfenster, Shadow-Copy-Schutz)
- **Empfehlung:** **Beibehalten** — kein Blocker fuer NVS-Auftrag

---

## Block E: Config-Push-Reliability + Update-Race

### E1: Config-Push QoS und Zustellung

**Server-Seite** (publisher.py:246):
```python
qos = constants.QOS_CONFIG  # QoS 2 (Exactly once)
```
Config-Push nutzt **QoS 2** ✅

**ESP32-Seite** (mqtt_client.cpp:172):
```cpp
mqtt_cfg.disable_clean_session = 0;  // 0 = clean_session ENABLED!
```
**clean_session = true** (disable_clean_session = 0 bedeutet: Aufraeumen aktiviert)

### E2: Was passiert bei verlorenem Config-Push?

**Auswirkung von clean_session = true:**

```
Szenario:
  1. User aendert Rule im Frontend
  2. Server sendet Config-Push (QoS 2) an Broker
  3. Broker haelt QoS-2-Message fuer ESP32 bereit
  4. ESP32 geht OFFLINE (MQTT-Disconnect) BEVOR die Message zugestellt wurde
  5. Broker erkennt Disconnect → clean_session=true → Broker LOESCHT Session + ausstehende Messages
  6. ESP32 reconnectet → neue Session → bekommt KEINE ausstehenden Messages
  7. Alte Rules bleiben in NVS aktiv!
```

**Korrektur der Plan-Annahme:** Der Plan nimmt an, dass `clean_session = false` → Broker cached QoS-2-Message. **Das ist falsch.** `disable_clean_session = 0` bedeutet clean_session ist AKTIVIERT.

**Konsequenz:** QoS-2 allein genuegt nicht. Wenn der ESP-Disconnect vor Empfang der Config-Push passiert, ist die Message verloren.

### E3: Bewertung des Race-Fensters

**Race-Fenster mit clean_session = true:**

```
Worst-Case:
  t=0s:   User aendert Rule, Server sendet Config-Push (QoS 2)
  t=0.1s: ESP geht offline (Stromausfall, Reset, WiFi-Drop)
  t=0.1s: Broker loescht Session (clean_session=true)
  t=5s:   ESP reconnectet, neue Session → kein ausstehender Push
  t=120s: Naechstes Heartbeat-Fenster → Server sendet neuen Config-Push

  Lücke: 120s mit alten Rules (aus NVS — die Update hat der ESP nie bekommen)
```

**Heartbeat-Cooldown:** `config_push_sent_at` Cooldown = 120s (laut heartbeat_handler.py).

**Retry-Mechanismus:** Kein expliziter Retry bei ausbleibendem ACK. Naechster regulaerer Heartbeat-Push korrigiert.

### Ergebnis Block E

- **Config-Push QoS:** **2** (Exactly once, Server-seitig)
- **clean_session:** **true** (disable_clean_session = 0 auf ESP32)
- **Race-Fenster bei QoS 2 + clean_session=true:** **Relevant** — Broker loescht ausstehende Messages bei Disconnect
- **Retry-Mechanismus:** **Nein** — naechster regulaerer Heartbeat-Push korrigiert nach ~120s
- **Empfehlung:** Fuer den P4-NVS-Auftrag ist das akzeptabel: alte Rules > keine Rules. Die 120s-Luecke ist funktional, nicht sicherheitskritisch. **Optional** (nicht Blocker): `disable_clean_session = 1` setzen, damit Broker die QoS-2-Message bei Reconnect nachliefert.

---

## Ergebnis-Zusammenfassung

### Entscheidungsmatrix fuer P4-NVS-Auftrag

| Frage | Ergebnis | Blockiert P4-NVS? | Handlungsbedarf |
|-------|---------|-------------------|-----------------|
| A: Sensor-Read lokal | Digitale Sensoren (SHT31, DS18B20, BMP280): physikalische Werte ✅. Analoge (pH, EC, Moisture): RAW ADC ⚠️ | **NEIN** | Server muss Offline-Rules fuer analoge Sensoren mit kalibrierten ADC-Thresholds senden ODER analoge Sensoren von Offline-Rules ausschliessen |
| B: Multi-Rule-Konflikte | Last-wins, sequentiell (Index 0→N-1), deterministisch, kein Safety-First | **NEIN** | Serverseitige Validierung empfohlen: keine zwei Rules mit identischem actuator_gpio |
| C: Boot-Timing | 30s Grace Period als natuerlicher Boot-Guard, NAN-Schutz verhindert Fehlzuendung | **NEIN** | Kein zusaetzlicher Guard noetig |
| D: NVS-Schema | Individual-Keys implementiert, Shadow-Copy vorhanden, Partial-Write-Risiko akzeptabel | **NEIN** | Optional: Blob fuer atomaren Write. Nicht Blocker. |
| E: Config-Push-Race | clean_session=true macht QoS-2-Guarantee bei Disconnect wirkungslos, 120s Correction-Delay | **NEIN** | Optional: `disable_clean_session = 1` setzen. Nicht Blocker fuer NVS. |

### Empfehlung

**P4-NVS kann wie beschrieben umgesetzt werden.** Kein Blocker unter den 5 Fragen.

**Anpassungen die vor oder parallel zur NVS-Implementierung bedacht werden sollten:**

**1. Analoge Sensoren in Offline-Rules (Block A — Mittlere Prioritaet):**
Der Server-seitige `config_builder.py` muss bei der Erstellung von Offline-Rules fuer pH/EC/Moisture-Sensoren entscheiden: entweder ADC-kalibrierte Thresholds senden (z.B. `420` statt `6.0 pH`) oder `_extract_offline_rule()` erweitern, um analoge Sensoren zu filtern. Empfehlung: Analoge Sensoren bis zur Kalibrierungsintegration aus Offline-Rules ausschliessen (`sensor_type in ("ph", "ec", "moisture")` → return None in `_extract_offline_rule()`).

**2. clean_session fuer QoS-2-Zustellung (Block E — Niedrige Prioritaet):**
In `mqtt_client.cpp` Zeile 172: `mqtt_cfg.disable_clean_session = 1` setzen, damit bei Reconnect ausstehende QoS-2-Messages (Config-Push) nachgeliefert werden. Setzt voraus, dass der Broker persistente Sessions unterstuetzt (Mosquitto Standard: ja). Verhindert die 120s-Luecke bei Race-Szenario. **Jedoch:** Die Client-ID muss dann konsistent sein (kein zufaelliger Suffix). Pruefen ob `config.client_id` in mqtt_client.cpp bereits stabil ist.

**3. Rule-Konflikt-Dokumentation (Block B — Dokumentation):**
In der TM-Dokumentation / Frontend-UI festhalten, dass bei mehreren Rules mit identischem `actuator_gpio` die Rule mit dem hoechsten Index gewinnt. Server-seitige Warnung beim Config-Build empfehlenswert.

---

## Was NICHT gemacht wurde

- **Kein Code geaendert** — reine Analyse und Dokumentation
- **Keine neuen Rule-Typen designt** — nur Hysterese (wie P4 definiert)
- **Keine Server-Tiefenanalyse** — Block E Server-Seite nur im Umfang der MQTT-Publisher-Konfiguration
- **Keine Frontend-Analyse** — NVS ist rein Firmware-Thema

---

## verify-plan Korrekturen

Die folgenden Abweichungen vom Plan wurden durch Code-Analyse korrigiert:

1. **Sensor-Typ-Namen:** Plan-Tabelle nannte "SHT31 Temp" ohne konkreten Key-Namen. Korrekte Namen: `sht31_temp`, `sht31_humidity`, `ds18b20`, `bmp280_temp`, `bmp280_pressure` (aus sensor_registry.cpp).

2. **DS18B20 Payload-Format:** Plan fragt "int16 (Faktor 16)?". Tatsaechlich: `applyLocalConversion` rechnet `raw × 0.0625` um → ValueCache liefert direkt °C, nicht int16.

3. **clean_session-Annahme falsch:** Plan nimmt `clean_session = false` an. Tatsaechlich: `disable_clean_session = 0` → clean_session = true → QoS-2-Messages gehen bei Disconnect verloren.

4. **NVS-Schema IST-Zustand:** Plan fragt "was wurde implementiert?". Tatsaechlich: Individual-Keys vollstaendig implementiert inkl. Shadow-Copy und Change-Detection.
