# Analyse A: Firmware-Logikverarbeitung — Config Mismatch Loop

**Datum:** 2026-03-10
**Typ:** Code-Analyse (kein Fix, nur IST-Zustand Dokumentation)
**Zusammenhang:** Analyse A von 3 (A = Firmware-Logik, B = Server-Kommunikation, C = Logging)
**Betroffener ESP:** ESP_472204 (Symptom: sensor_count:18, actuator_count:0, Loop alle ~30s)

---

## Zusammenfassung

Alle drei vermuteten Bugs sind **BESTAETIGT**. Die Code-Traces zeigen lueckenlose Kausalketten:

| Bug | Verdacht | Befund | Severity |
|-----|----------|--------|----------|
| Bug 1: Sensor-Akkumulation | findSensorConfig() nur erster GPIO-Match | **BESTAETIGT** — Kein Sibling-Check in configureSensor() | HIGH |
| Bug 2: Fehlender Actuator-NVS-Load | loadActuatorConfig() nie aufgerufen | **BESTAETIGT** — Funktion existiert, Aufruf fehlt in setup() | HIGH |
| Bug 3: Actuator Count Drift | Count bei Reconfig nicht re-inkrementiert | **BESTAETIGT** — removeActuator() dekrementiert, configureActuator() nicht | MEDIUM |

---

## Bug 1: Sensor-Akkumulation durch kaputte Deduplizierung

### A1-01: findSensorConfig() Trace

**Datei:** [sensor_manager.cpp:1401-1408](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L1401-L1408)

```cpp
SensorConfig* SensorManager::findSensorConfig(uint8_t gpio) {
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio == gpio) {
            return &sensors_[i];        // ← ERSTER Match, sofortiger Return
        }
    }
    return nullptr;
}
```

**Signatur:** `SensorConfig* findSensorConfig(uint8_t gpio)` (non-const und const Variante)
**Algorithmus:** Lineare Suche ueber `sensors_[0..sensor_count_-1]`
**Abbruchbedingung:** Erster Match auf `gpio` — sofortiger Return
**Vergleichsfelder:** NUR `gpio`. Kein Vergleich von `sensor_type`, `i2c_address` oder `onewire_address`.

**Andere Find-Funktionen:** Keine. Es gibt kein `findSensorByType()`, kein `findAllSensorsOnGPIO()`, kein `findSensorByGPIOAndType()`.

- [x] Funktion mit exakter Signatur, Zeile und vollstaendigem Algorithmus dokumentiert
- [x] Klar belegt: Nur erster Match wird zurueckgegeben
- [x] Alle Vergleichsfelder aufgelistet: NUR gpio

### A1-02: configureSensor() Deduplizierungslogik Trace

**Datei:** [sensor_manager.cpp:200-287](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L200-L287)

**Vollstaendiger Code-Pfad fuer sht31_humidity Config-Push (GPIO 0, wenn sht31_temp bereits existiert):**

```
1. configureSensor(config) aufgerufen                        [Zeile 200]
   config = {gpio=0, sensor_type="sht31_humidity", active=true}

2. findSensorCapability("sht31_humidity")                     [Zeile 215]
   → SHT31_HUMIDITY_CAP: {is_i2c=true, i2c_address=0x44, device_type="sht31"}

3. existing = findSensorConfig(0)                             [Zeile 219]
   → &sensors_[0] = sht31_temp (ERSTER GPIO=0 Match!)
   → sensors_[1] = sht31_humidity wird NICHT gefunden

4. existing != nullptr → Enter "sensor exists" Branch         [Zeile 220]

5. is_i2c_sensor=true AND existing->sensor_type("sht31_temp") != config.sensor_type("sht31_humidity")
   → Enter I2C Multi-Value Branch                            [Zeile 223]

6. existing_cap = findSensorCapability("sht31_temp")          [Zeile 225]
   → SHT31_TEMP_CAP: {is_i2c=true, i2c_address=0x44, device_type="sht31"}

7. Pruefung: existing_cap->is_i2c(true) AND
   existing_cap->i2c_address(0x44) == capability->i2c_address(0x44) AND
   device_type("sht31") == device_type("sht31")              [Zeile 226-228]
   → ALLE Bedingungen true

8. → "Same I2C device, different value type - this is allowed" [Zeile 229]

9. sensors_[sensor_count_] = config                           [Zeile 237]
   → NEUER Eintrag an Position sensor_count_ (z.B. Index 2)
   → OHNE zu pruefen ob sht31_humidity BEREITS in sensors_[] existiert!

10. sensor_count_++                                            [Zeile 240]

11. configManager.saveSensorConfig(config)                     [Zeile 242]
    → NVS: Findet sht31_humidity per GPIO+sensor_type → Update in place
    → NVS-Count bleibt korrekt (2)!

12. return true                                                [Zeile 251]
```

**Der Kern-Bug:** Zwischen Schritt 3 und Schritt 9 wird NICHT geprueft ob `sht31_humidity` bereits irgendwo in `sensors_[]` existiert. Die Funktion erkennt korrekt dass es sich um einen Multi-Value-Sensor handelt (Schritt 5-7), prueft aber nur den ERSTEN GPIO-Match (sht31_temp) statt ALLE Eintraege zu durchsuchen.

**Fehlende Pruefung (wuerde Bug verhindern):**
```
// FEHLT zwischen Zeile 228 und 237:
// Pruefen ob config.sensor_type bereits in sensors_[] existiert
for (uint8_t k = 0; k < sensor_count_; k++) {
    if (sensors_[k].gpio == config.gpio &&
        sensors_[k].sensor_type == config.sensor_type) {
        // Bereits vorhanden → Update statt Add
        sensors_[k] = config;
        return true;
    }
}
```

- [x] Vollstaendiger Code-Pfad von Config-Push bis Eintrag in sensors_[]
- [x] Exakte Bedingung: I2C + anderer Typ + gleicher device_type → NEUER Eintrag
- [x] BESTAETIGT: sht31_humidity wird NICHT gefunden weil findSensorConfig(0) nur sht31_temp zurueckgibt

### A1-03: sensors_[] Datenstruktur und Count-Logik

**Datei:** [sensor_manager.h:135-139](El%20Trabajante/src/services/sensor/sensor_manager.h#L135-L139)

```cpp
#ifndef MAX_SENSORS
  #define MAX_SENSORS 10  // Default fallback
#endif
SensorConfig sensors_[MAX_SENSORS];   // Festes Array, keine dynamische Allokation
uint8_t sensor_count_;                // Separater Zaehler
```

**Build-spezifische MAX_SENSORS Werte** ([platformio.ini](El%20Trabajante/platformio.ini)):

| Environment | MAX_SENSORS | MAX_ACTUATORS |
|-------------|-------------|---------------|
| seeed_xiao_esp32c3 | 10 | 6 |
| esp32_dev | 20 | 12 |
| wokwi_esp01/02/03 | 20 | 12 |

**SensorConfig Felder** ([sensor_types.h:27-76](El%20Trabajante/src/models/sensor_types.h#L27-L76)):
- `gpio` (uint8_t, default 255)
- `sensor_type` (String)
- `sensor_name` (String)
- `subzone_id` (String)
- `active` (bool, default false)
- `operating_mode` (String, default "continuous")
- `measurement_interval_ms` (uint32_t, default 30000)
- `raw_mode` (bool, default true)
- `last_raw_value` (uint32_t)
- `last_reading` (unsigned long)
- `onewire_address` (String)
- `i2c_address` (uint8_t, default 0)
- `cb_state` (SensorCBState, default CLOSED)
- `cb_open_since_ms` (uint32_t)
- `consecutive_failures` (uint8_t)

**Count-Mechanismus:**
- `sensor_count_` ist separater Zaehler (NICHT sensors_.size())
- Heartbeat liest via `getActiveSensorCount()` ([sensor_manager.cpp:620-634](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L620-L634)):
  Iteriert `sensors_[0..sensor_count_-1]`, zaehlt `active == true`
- Da alle hinzugefuegten Sensoren `active = true` gesetzt bekommen, entspricht `getActiveSensorCount()` effektiv `sensor_count_`
- sensors_[] hat KEINE Luecken — removeSensor() shiftet Array und dekrementiert `sensor_count_`

**Verhalten bei MAX_SENSORS Ueberschreitung** ([sensor_manager.cpp:231-233](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L231-L233)):
```cpp
if (sensor_count_ >= MAX_SENSORS) {
    LOG_E(TAG, "Sensor Manager: Maximum sensor count reached");
    return false;  // Kein neuer Eintrag, aber kein Crash
}
```

**ESP_472204 Beobachtung:** sensor_count=18 bei MAX_SENSORS=20 → 16 Config-Pushes seit Boot (2 initial + 16 Duplikate)

- [x] Datenstruktur vollstaendig dokumentiert
- [x] Count-Mechanismus klar: separater Zaehler sensor_count_
- [x] MAX_SENSORS=20 (esp32_dev), Cap bei Ueberschreitung ohne Crash

---

## Bug 2: Fehlender Actuator-NVS-Load beim Boot

### A2-01: Boot-Sequenz fuer Sensoren (REFERENZ — funktioniert korrekt)

**Datei:** [main.cpp:2092-2100](El%20Trabajante/src/main.cpp#L2092-L2100)

```cpp
// Load sensor configs from NVS
SensorConfig sensors[10];
uint8_t loaded_count = 0;
if (configManager.loadSensorConfig(sensors, 10, loaded_count)) {
    LOG_I(TAG, "Loaded " + String(loaded_count) + " sensor configs from NVS");
    for (uint8_t i = 0; i < loaded_count; i++) {
        sensorManager.configureSensor(sensors[i]);
    }
}
```

**Pfad:** main.cpp → configManager.loadSensorConfig() → NVS "sensor_config" Namespace → sensorManager.configureSensor()

**configManager.loadSensorConfig()** ([config_manager.cpp:1792-1911](El%20Trabajante/src/services/config/config_manager.cpp#L1792-L1911)):
- NVS Namespace: `"sensor_config"`
- Count Key: `NVS_SEN_COUNT` (neu) / `NVS_SEN_COUNT_OLD` (legacy)
- Pro Sensor: gpio, sensor_type, sensor_name, subzone_id, active, raw_mode, operating_mode, measurement_interval_ms, onewire_address
- Validierung: gpio != 255 AND sensor_type.length() > 0
- Rueckgabe: gefuelltes Array + loaded_count

- [x] Vollstaendiger Boot-Pfad: main.cpp → configManager → NVS → sensorManager
- [x] Parameter und Rueckgabewerte dokumentiert
- [x] NVS-Namespace: "sensor_config", Keys: sen_cnt, s%d_gpio, s%d_type, etc.

### A2-02: Boot-Sequenz fuer Aktoren (BUG — kein NVS-Load)

**Datei:** [main.cpp:2133-2140](El%20Trabajante/src/main.cpp#L2133-L2140)

```cpp
if (!actuatorManager.begin()) {
    LOG_E(TAG, "Actuator Manager initialization failed!");
    // ...
} else {
    LOG_I(TAG, "Actuator Manager initialized (waiting for MQTT configs)");
    // ← KEIN loadActuatorConfig() Aufruf!
    // ← KEIN configureActuator() Loop!
}
```

**actuatorManager.begin()** ([actuator_manager.cpp:97-111](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L97-L111)):
```cpp
bool ActuatorManager::begin() {
    if (initialized_) return true;
    actuator_count_ = 0;                        // ← Zaehler auf 0
    for (uint8_t i = 0; i < MAX_ACTUATORS; i++) {
        actuators_[i] = RegisteredActuator();    // ← Alle Slots leer
    }
    initialized_ = true;
    return true;
}
```

**Suche nach loadActuatorConfig Aufrufen:**
- `configManager.loadActuatorConfig()` ist **deklariert** ([config_manager.h:88](El%20Trabajante/src/services/config/config_manager.h#L88))
- `configManager.loadActuatorConfig()` ist **implementiert** ([config_manager.cpp:2202-2320](El%20Trabajante/src/services/config/config_manager.cpp#L2202-L2320))
- `configManager.loadActuatorConfig()` wird **NIRGENDS aufgerufen** — nicht in main.cpp, nicht in actuator_manager.cpp, nirgendwo

**configManager.saveActuatorConfig()** wird dagegen aufgerufen — in:
- `configureActuator()` [actuator_manager.cpp:277](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L277) (nach erfolgreichem Configure)
- `removeActuator()` [actuator_manager.cpp:319](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L319) (nach Removal)

**Asymmetrie:** Actuator-Configs werden in NVS **geschrieben** aber nie **gelesen**. Der NVS-Eintrag existiert, wird aber beim naechsten Boot ignoriert.

**Log-Hinweis:** `"waiting for MQTT configs"` deutet darauf hin, dass dies **beabsichtigt** war — der Entwickler erwartete dass Aktoren immer via MQTT konfiguriert werden. Aber der Server erkennt actuator_count=0 im Heartbeat als Mismatch und pusht erneut.

- [x] BESTAETIGT: actuatorManager.begin() laed KEINE Aktoren aus NVS
- [x] BESTAETIGT: loadActuatorConfig() ist deklariert+implementiert aber nirgends aufgerufen
- [x] Boot-Pfad: begin() → actuator_count_=0, Slots leer, initialized_=true
- [x] loadActuatorConfig() wuerde NVS "actuator_config" Namespace lesen (gpio, type, name, subzone_id, active, critical, inverted, default_state, default_pwm)

### A2-03: Konsequenzen des fehlenden NVS-Loads

**Zustand nach Boot:**
- `actuator_count_` = 0
- `actuators_[0..MAX_ACTUATORS-1]` = alle `{in_use=false, gpio=255}`
- Kein Driver instanziiert, kein GPIO reserviert

**Heartbeat-Payload** ([mqtt_client.cpp:725-726](El%20Trabajante/src/services/communication/mqtt_client.cpp#L725-L726)):
```cpp
payload += "\"sensor_count\":" + String(sensorManager.getActiveSensorCount()) + ",";
payload += "\"actuator_count\":" + String(actuatorManager.getActiveActuatorCount()) + ",";
```

`getActiveActuatorCount()` ([actuator_manager.h:35](El%20Trabajante/src/services/actuator/actuator_manager.h#L35)):
```cpp
uint8_t getActiveActuatorCount() const { return actuator_count_; }
```
→ Gibt direkt `actuator_count_` zurueck (KEIN Array-Scan wie bei Sensoren)

**Erster Heartbeat nach Boot:** `actuator_count: 0`
**Server-DB:** 1 actuator_config → Mismatch erkannt → Config Push

**Nach erstem Config Push:**
- `hasActuatorOnGPIO(gpio)` = false (kein Aktor vorhanden)
- `is_reconfiguration = false`
- Neuer Aktor konfiguriert → `actuator_count_++` → actuator_count_ = 1
- **Erster Push funktioniert korrekt!** Erst ab dem zweiten Push greift Bug 3.

- [x] Zustand nach Boot: actuator_count_=0, alle Slots leer
- [x] Heartbeat: Liest actuator_count_ direkt (kein Array-Scan)
- [x] Kausal: Kein NVS-Load → actuator_count=0 → Server erkennt Mismatch → Push-Loop startet

---

## Bug 3: Actuator Count Drift bei Rekonfiguration

### A3-01: configureActuator() Trace

**Datei:** [actuator_manager.cpp:187-287](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L187-L287)

**Szenario A: Neuer Aktor (GPIO nicht belegt)**
```
1. configureActuator(config)                                   [Zeile 187]
2. validateActuatorConfig(config) → true                       [Zeile 193]
3. hasActuatorOnGPIO(config.gpio) → false                      [Zeile 217]
4. is_reconfiguration = false                                  [Zeile 217]
5. getFreeSlot() → &actuators_[0]                              [Zeile 237]
6. createDriver(config.actuator_type) → unique_ptr             [Zeile 246]
7. driver->begin(config) → true                                [Zeile 251]
8. slot->in_use = true, slot->gpio = config.gpio               [Zeile 259-262]
9. is_reconfiguration == false → actuator_count_++             [Zeile 265-266]
   → actuator_count_ von 0 auf 1
10. saveActuatorConfig() → NVS                                  [Zeile 277]
11. return true                                                 [Zeile 286]
```
**Ergebnis:** actuator_count_ = 1 ✓ KORREKT

**Szenario B: Rekonfiguration (GPIO bereits belegt)**
```
1. configureActuator(config)                                   [Zeile 187]
2. validateActuatorConfig(config) → true                       [Zeile 193]
3. hasActuatorOnGPIO(config.gpio) → true                       [Zeile 217]
4. is_reconfiguration = true                                   [Zeile 217]
5. removeActuator(config.gpio)                                 [Zeile 234]
   → actuator_count_ von 1 auf 0 (siehe A3-02)
   → Slot freigegeben
6. getFreeSlot() → freier Slot                                 [Zeile 237]
7. createDriver + begin → neuer Driver                         [Zeile 246-251]
8. slot->in_use = true                                         [Zeile 262]
9. is_reconfiguration == true → KEIN actuator_count_++         [Zeile 265]
   → actuator_count_ BLEIBT bei 0!
10. saveActuatorConfig() → NVS                                  [Zeile 277]
11. return true                                                 [Zeile 286]
```
**Ergebnis:** actuator_count_ = 0 obwohl Aktor in_use ✗ BUG BESTAETIGT

**Beweisfuehrung:** Zeile 265-267:
```cpp
if (!is_reconfiguration) {
    actuator_count_++;   // NUR bei neuem Aktor!
}
```
Bei Reconfig wird Count in removeActuator dekrementiert (Zeile 309), aber hier NICHT wieder inkrementiert.

- [x] Beide Szenarien Zeile fuer Zeile dokumentiert
- [x] BESTAETIGT: Bei Reconfig wird Count dekrementiert aber nicht re-inkrementiert
- [x] Folge: actuator_count_ = 0 obwohl Aktor aktiv und in_use

### A3-02: removeActuator() Trace

**Datei:** [actuator_manager.cpp:289-327](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L289-L327)

```cpp
bool ActuatorManager::removeActuator(uint8_t gpio) {
    RegisteredActuator* actuator = findActuator(gpio);         // [Zeile 290]
    if (!actuator) return false;                                // [Zeile 291-293]

    // Safety: Stop before removal
    if (actuator->driver) {
        actuator->driver->setBinary(false);                    // [Zeile 300]
        actuator->driver->end();                               // [Zeile 301]
        actuator->driver.reset();                              // [Zeile 302]
    }

    actuator->in_use = false;                                  // [Zeile 305]
    actuator->gpio = 255;                                      // [Zeile 306]
    actuator->config = ActuatorConfig();                       // [Zeile 307]
    actuator->emergency_stopped = false;                       // [Zeile 308]
    actuator_count_ = actuator_count_ > 0                      // [Zeile 309]
                    ? actuator_count_ - 1 : 0;                 // Clamped bei 0

    // NVS Persist
    configManager.saveActuatorConfig(actuators, count);        // [Zeile 319]
    return true;
}
```

**Seiteneffekte:**
1. Driver wird gestoppt (`setBinary(false)`)
2. Driver wird deinitialisiert (`end()`)
3. Driver unique_ptr wird freigegeben (`reset()`)
4. Slot wird zurueckgesetzt (in_use=false, gpio=255)
5. Count wird dekrementiert (mit Clamp bei 0)
6. NVS wird aktualisiert

**KEIN GPIO-Release!** `gpioManager.releasePin()` wird NICHT aufgerufen. Das GPIO bleibt reserviert. (Separates Problem, nicht Teil des Count-Bugs.)

**Aufrufer von removeActuator():**
1. `configureActuator()` Zeile 234 — bei Rekonfiguration
2. `configureActuator()` Zeile 200 — bei Deaktivierung (config.active == false)
3. Kein anderer Aufrufer (kein Delete-Command, kein Factory-Reset)

- [x] removeActuator() vollstaendig dokumentiert
- [x] Count-Dekrement: Zeile 309, mit Clamp bei 0
- [x] Aufrufer: configureActuator() (2x, fuer Reconfig und Deaktivierung)

---

## Kaskaden-Simulation (A3-03)

### Voraussetzungen
- ESP32_dev Build: MAX_SENSORS=20, MAX_ACTUATORS=12
- NVS: 2 Sensor-Configs (sht31_temp gpio=0, sht31_humidity gpio=0), 1 Actuator-Config (relay gpio=5)
- Server-DB: 2 sensor_configs, 1 actuator_config

### Zyklus-Tabelle

| Zyklus | Event | sensor_count_ (RAM) | actuator_count_ (RAM) | NVS Sensors | NVS Actuators | Bug |
|--------|-------|---------------------|-----------------------|-------------|---------------|-----|
| **Boot** | NVS Load Sensoren | 2 | — | 2 | 1 | — |
| **Boot** | actuatorManager.begin() | 2 | **0** | 2 | 1 | **Bug 2** |
| **HB 1** | Heartbeat: s=2, a=0 | 2 | 0 | 2 | 1 | — |
| | Server: a-Mismatch (0≠1) → Push | | | | | |
| **Push 1** | configureSensor(sht31_temp) | 2 | 0 | 2 | 1 | — |
| | findSensorConfig(0)→sht31_temp, same type → Update in place | | | | | |
| **Push 1** | configureSensor(sht31_humidity) | **3** | 0 | 2 | 1 | **Bug 1** |
| | findSensorConfig(0)→sht31_temp, diff type, same I2C → ADD NEW | | | | | |
| **Push 1** | configureActuator(relay gpio=5) | 3 | **1** | 2 | 1 | — |
| | hasActuatorOnGPIO(5)=false → NEW → count++ | | | | | |
| **HB 2** | Heartbeat: s=3, a=1 | 3 | 1 | 2 | 1 | — |
| | Server: s-Mismatch (3≠2) → Push | | | | | |
| **Push 2** | configureSensor(sht31_temp) | 3 | 1 | 2 | 1 | — |
| | Update in place (same type) | | | | | |
| **Push 2** | configureSensor(sht31_humidity) | **4** | 1 | 2 | 1 | **Bug 1** |
| | ADD NEW (findSensorConfig returns sht31_temp, not the existing sht31_humidity) | | | | | |
| **Push 2** | configureActuator(relay gpio=5) | 4 | **0** | 2 | 1 | **Bug 3** |
| | hasActuatorOnGPIO(5)=true → RECONFIG → remove(count 1→0) + no increment | | | | | |
| **HB 3** | Heartbeat: s=4, a=0 | 4 | 0 | 2 | 1 | — |
| | Server: s-Mismatch (4≠2) AND a-Mismatch (0≠1) → Push | | | | | |
| **Push 3** | Sensoren: sht31_temp update, sht31_humidity ADD | **5** | 0 | 2 | 1 | **Bug 1** |
| **Push 3** | Aktor: RECONFIG → remove(0→0 clamped) + no increment | 5 | **0** | 2 | 1 | **Bug 3** |
| **HB 4** | Heartbeat: s=5, a=0 | 5 | 0 | 2 | 1 | — |
| **Push 4** | Sensoren +1, Aktor 0 | **6** | **0** | 2 | 1 | Bug 1+3 |
| **HB 5** | Heartbeat: s=6, a=0 | 6 | 0 | 2 | 1 | — |
| ... | ... | ... | ... | ... | ... | ... |
| **Push 16** | sensor_count_ erreicht 18 | **18** | **0** | 2 | 1 | Bug 1+3 |
| **Push 18** | sensor_count_ erreicht MAX_SENSORS=20 | **20** | **0** | 2 | 1 | — |
| **Push 19+** | configureSensor returns false ("Maximum sensor count reached") | 20 | **0** | 2 | 1 | — |
| | **Loop laeuft weiter weil actuator_count immer 0 bleibt** | | | | | |

### Kaskaden-Mechanismus

```
Boot                   ┌─── Bug 2: actuator_count_=0 (kein NVS-Load)
                       │
Heartbeat 1 ──────────►│ Server: Mismatch a=0≠1 → Full Config Push
                       │
Config Push ──────────►├─── Bug 1: sht31_humidity Duplikat → sensor_count_++
                       ├─── Erster Aktor-Push: count wird 1 (korrekt)
                       │
Heartbeat 2 ──────────►│ Server: Mismatch s=3≠2 → Full Config Push
                       │
Config Push 2+ ───────►├─── Bug 1: Weiteres Duplikat → sensor_count_++
                       ├─── Bug 3: Reconfig → removeActuator(1→0) + kein ++
                       │         → actuator_count_ permanent 0
                       │
                       └─── ENDLOS-LOOP (stabilisiert sich NICHT)
```

**Stabilisierung:** Der Loop stabilisiert sich NICHT:
- sensor_count_ stoppt bei MAX_SENSORS=20 (configureSensor schlaegt fehl)
- **ABER:** actuator_count_ bleibt permanent bei 0 (Bug 3 ist irreversibel nach dem zweiten Push)
- Server sieht immer actuator_count=0≠1 → Push geht weiter, alle ~30s

- [x] 5+ Zyklen-Simulation mit exakten Counts
- [x] Klar gezeigt wo Bug 1, 2 und 3 eingreifen
- [x] Loop stabilisiert sich NICHT — actuator_count permanent 0

---

## Zusaetzliche Analyse: I2C-Sensor-Handling (A4-01)

**I2C-Erkennung** ([sensor_manager.cpp:215-216](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L215-L216)):
```cpp
const SensorCapability* capability = findSensorCapability(config.sensor_type);
bool is_i2c_sensor = (capability != nullptr && capability->is_i2c);
```
Kein GPIO-basierter Marker. Erkennung rein ueber `SensorCapability.is_i2c` aus dem Registry.

**Multi-Value Repraesentation:**
- Zwei SEPARATE Eintraege in `sensors_[]` (z.B. sensors_[0]=sht31_temp, sensors_[1]=sht31_humidity)
- Jeder Eintrag hat eigenen `sensor_type`, eigenes `i2c_address` Feld
- I2C-Adresse wird gesetzt in configureSensor Zeile 239:
  `sensors_[sensor_count_].i2c_address = capability->i2c_address`

**Sibling-Erkennung:**
- **VORHANDEN** in configureSensor (Zeile 225-228): Vergleich ueber `device_type` + `i2c_address`
- **UNVOLLSTAENDIG:** Erkennt dass sht31_humidity ein Sibling von sht31_temp ist, prueft aber NICHT ob der Sibling bereits existiert
- Kein separater Mechanismus fuer Sibling-Discovery (z.B. `findAllSiblingsOnDevice()`)

**SensorCapability Struktur** ([sensor_registry.h:21-27](El%20Trabajante/src/models/sensor_registry.h#L21-L27)):
```cpp
struct SensorCapability {
    const char* server_sensor_type;  // "sht31_temp"
    const char* device_type;         // "sht31"
    uint8_t i2c_address;            // 0x44
    bool is_multi_value;             // true
    bool is_i2c;                     // true
};
```

- [x] I2C-Erkennung: via SensorCapability.is_i2c (nicht GPIO-basiert)
- [x] Multi-Value: Separate Eintraege pro Value-Typ
- [x] Sibling-Erkennung: Vorhanden (device_type Vergleich) aber unvollstaendig (kein Existenz-Check)

---

## Zusaetzliche Analyse: NVS-Persistenz der Akkumulation (A4-02)

**saveSensorConfig(single)** ([config_manager.cpp:1621-1650](El%20Trabajante/src/services/config/config_manager.cpp#L1621-L1650)):
```cpp
// Dedup per GPIO + sensor_type (KORREKT fuer Multi-Value!)
for (uint8_t i = 0; i < sensor_count; i++) {
    // ... load stored_gpio and stored_type ...
    if (stored_gpio == config.gpio && stored_type == config.sensor_type) {
        existing_index = i;    // Gefunden → Update in place
        break;
    }
}
uint8_t index = (existing_index >= 0) ? existing_index : sensor_count;
```

**NVS-Dedup funktioniert korrekt** weil sie GPIO + sensor_type vergleicht (nicht nur GPIO wie findSensorConfig).

**NVS-Count bleibt stabil:**
```cpp
// Nur bei neuem Sensor (nicht bei Update):
if (existing_index < 0) {
    success &= storageManager.putUInt8(NVS_SEN_COUNT, sensor_count + 1);
}
```
Da sht31_humidity im NVS per GPIO+Type gefunden wird, bleibt NVS-Count bei 2.

**Duplikate ueberleben KEINEN Reboot:**
- NVS speichert korrekt 2 Sensoren (sht31_temp + sht31_humidity)
- RAM-Duplikate (sensors_[2], sensors_[3], ...) werden NICHT in NVS geschrieben (NVS-Dedup verhindert das)
- Nach Reboot: loadSensorConfig laed 2 → sensor_count_ = 2
- **ABER:** Der Loop startet erneut weil Bug 2 (actuator_count=0) sofort den naechsten Push triggert

**NVS-Write-Trigger fuer Sensor-Configs:**
1. `configureSensor()` ruft `configManager.saveSensorConfig(config)` auf (Zeile 242 und 278)
   → Bei JEDEM Config-Push (sowohl Update als auch Add)
2. `removeSensor()` ruft `configManager.removeSensorConfig(gpio)` auf (Zeile 590)
3. Boot: `configManager.loadSensorConfig()` → Read-Only

- [x] NVS-Write-Trigger: Bei jedem configureSensor() Aufruf
- [x] BESTAETIGT: Duplikate ueberleben Reboot NICHT (NVS deduped korrekt)
- [x] Loop startet nach jedem Reboot erneut wegen Bug 2

---

## Gesamtbild: Kausalkette

```
┌─────────────────────────────────────────────────────────────────────┐
│ ROOT CAUSE: findSensorConfig() vergleicht NUR gpio, nicht type     │
│             + loadActuatorConfig() nie aufgerufen                   │
│             + configureActuator() Count-Logik bei Reconfig broken   │
└─────────┬───────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER: Boot → actuator_count_=0 (Bug 2)                         │
│ → Erster Heartbeat meldet actuator_count:0                          │
│ → Server erkennt Mismatch (0≠1) → Config Push                      │
└─────────┬───────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ESKALATION: Jeder Config Push erzeugt 1 Sensor-Duplikat (Bug 1)   │
│ + Ab 2. Push: actuator_count permanent 0 (Bug 3)                   │
│ → Doppelter Mismatch: sensor_count wachsend, actuator_count=0      │
│ → Server pusht erneut → ENDLOS-LOOP alle ~30s                      │
└─────────┬───────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEADY STATE: sensor_count_=MAX_SENSORS(20), actuator_count_=0     │
│ → configureSensor schlaegt fehl, Aktor wird jedes Mal re-konfiguriert│
│ → Loop laeuft weiter, 30s MQTT Traffic + CPU-Last + NVS-Writes     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Metriken

| Metrik | Wert |
|--------|------|
| Analysierte Dateien | 8 (sensor_manager.cpp/h, actuator_manager.cpp/h, main.cpp, config_manager.cpp/h, mqtt_client.cpp, sensor_registry.cpp/h, sensor_types.h) |
| Getracete Funktionen | 12 (findSensorConfig, configureSensor, removeSensor, getActiveSensorCount, begin/configureActuator/removeActuator, hasActuatorOnGPIO, getActiveActuatorCount, publishHeartbeat, loadSensorConfig, loadActuatorConfig) |
| Bugs bestaetigt | 3/3 |
| Scope-Einhaltung | Keine Code-Aenderungen, keine Server-Analyse |
