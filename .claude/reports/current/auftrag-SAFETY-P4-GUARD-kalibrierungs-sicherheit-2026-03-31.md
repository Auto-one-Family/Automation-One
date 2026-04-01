# Auftrag SAFETY-P4-GUARD: Kalibrierungs-Sicherheitsguard fuer Offline-Rules

**Ziel-Repo:** auto-one (Backend + Firmware)
**Typ:** Implementierung
**Prioritaet:** CRITICAL
**Datum:** 2026-03-31
**Geschaetzter Aufwand:** ~3-4h
**Abhaengigkeit:** SAFETY-P4 (implementiert), ANALYSE-P4-NVS (erledigt)

---

## Das Problem — Warum dieser Auftrag sicherheitskritisch ist

Die Firmware hat eine Funktion `applyLocalConversion()` (sensor_manager.cpp:60-87), die Sensor-Rohwerte in physikalische Einheiten umrechnet. Diese Funktion arbeitet **unterschiedlich** je nach Sensortyp:

**Digitale Sensoren — lokale Umrechnung funktioniert:**
- SHT31: `-45.0 + 175.0 × (raw / 65535.0)` → °C / %RH
- DS18B20: `raw × 0.0625` → °C
- BMP280/BME280: `raw / 100.0` → °C / hPa / %

**Analoge Sensoren — KEINE lokale Umrechnung:**
- pH: `(float)raw_value` → ADC 0-4095 (NICHT pH!)
- EC: `(float)raw_value` → ADC 0-4095 (NICHT mS/cm!)
- Bodenfeuchte: `(float)raw_value` → ADC 0-4095 (NICHT %!)

Der ValueCache (20 Slots, 5min Stale) speichert `processed_value`, also das Ergebnis von `applyLocalConversion()`. Fuer digitale Sensoren sind das physikalische Werte — fuer analoge Sensoren sind das **ADC-Rohwerte**.

**Das Sicherheitsproblem:**

Die Offline-Rules haben Schwellwerte in **physikalischen Einheiten**. Beispiel: Eine Logic-Rule "Dosierpumpe AN wenn pH > 7.5" wird als Offline-Rule mit `activate_above: 7.5` an den ESP gesendet.

Im Offline-Mode liest `evaluateOfflineRules()` den ValueCache:
- ValueCache liefert fuer pH: `2048.0` (ADC-Rohwert)
- Vergleich: `2048.0 > 7.5` → **true** → Dosierpumpe AN!
- **Das ist falsch und gefaehrlich.** Die Pumpe laeuft, obwohl der ESP keine Ahnung hat ob der pH-Wert tatsaechlich ueber 7.5 liegt.

**Umgekehrt:** Rule "Bewaesserung AN wenn Bodenfeuchte < 30%":
- ValueCache liefert: `3100.0` (ADC, trockener Boden)
- Vergleich: `3100.0 < 30.0` → **false** → Bewaesserung bleibt AUS
- Zufaellig sicher — aber nur weil der ADC-Wert groesser ist als der Threshold. Bei nassem Boden (`ADC = 800`) waere `800 < 30` auch false. Die Rule feuert NIE.

**Konsequenz:** Offline-Rules fuer kalibrierungspflichtige Sensoren sind entweder gefaehrlich (pH/EC → falsches Einschalten) oder nutzlos (Bodenfeuchte → feuert nie). Beides ist inakzeptabel.

---

## Die Loesung — Zweischichtige Absicherung

Die konsistenteste Loesung fuer AutomationOne: **Kalibrierungspflichtige Sensoren werden aus Offline-Rules ausgeschlossen.** Aktoren die an solche Sensoren gekoppelt sind, fallen auf den P1-Mechanismus zurueck: `default_state = OFF` bei Netzwerkverlust. Das ist das sichere Verhalten.

Zwei Schichten (Defense-in-Depth):

1. **Server (primaer):** `config_builder.py` erstellt KEINE Offline-Rules fuer analoge Sensoren
2. **Firmware (sekundaer):** `evaluateOfflineRules()` erkennt analoge Sensortypen und erzwingt Safe-Shutdown

### Warum nicht ADC-Thresholds vom Server senden?

Theoretisch koennte der Server die Kalibrierungskurve umkehren und ADC-Schwellwerte berechnen (z.B. "pH 7.5 = ADC 1842 bei Kalibrierung slope=0.0034, offset=1.2"). Das waere aber:
- **Fragil:** Kalibrierung aendert sich (Re-Kalibrierung, Drift, Sensorwechsel). Der ESP haette veraltete ADC-Thresholds.
- **Architektur-Bruch:** Kalibrierungs-Logik gehoert auf den Server (Pi-Enhanced Processing). ADC-Threshold-Berechnung waere Business-Logic auf dem Config-Builder — widerspricht der Server-Centric-Architektur.
- **Ueberkomplex:** Fuer den Offline-Fall ist "sicher abschalten" die professionelle Loesung. Tasmota und ESPHome haben ebenfalls keine lokale Kalibrierung — lokale Automationen arbeiten nur mit direkt lesbaren Werten.

---

## Implementierung

### Schritt 1: Server — Analog-Filter in `_build_offline_rules()` (Backend)

**Datei:** `El Servador/god_kaiser_server/src/services/config_builder.py`

**Stelle:** Funktion `_extract_offline_rule()` — diese Funktion erstellt eine einzelne Offline-Rule aus einer Cross-ESP-Logic-Rule. Hier muss der Filter rein.

**IST-Zustand (vereinfacht):**

```python
def _extract_offline_rule(self, logic_rule, esp_id, session):
    # Prueft ob die Rule fuer diesen ESP ist
    # Prueft ob Sensor + Aktor auf demselben ESP
    # Baut OfflineRule Dict zusammen
    # Gibt Dict zurueck oder None
```

**SOLL-Zustand — Analog-Filter einfuegen:**

```python
# Kalibrierungspflichtige Sensortypen — koennen auf dem ESP nicht lokal ausgewertet werden.
# Der ESP hat keine Kalibrierungsparameter (slope, offset, calibration_points).
# applyLocalConversion() liefert fuer diese Typen nur den ADC-Rohwert (0-4095),
# nicht den physikalischen Wert. Thresholds in physikalischen Einheiten (pH, mS/cm, %)
# wuerden gegen Rohwerte verglichen → falsches oder kein Triggern.
# Aktoren die an diese Sensoren gekoppelt sind fallen auf P1 zurueck (default_state = OFF).
CALIBRATION_REQUIRED_SENSOR_TYPES = {"ph", "ec", "moisture"}

def _extract_offline_rule(self, rule, esp_id):
    # ... bestehende Logik ...

    # NEU: Kalibrierungspflichtige Sensoren ausfiltern
    # sensor_value_type steht in Zeile ~421 der Funktion als: sensor_value_type = hysteresis_cond.get("sensor_type") or ""
    base_sensor_type = sensor_value_type.lower().split("_")[0]  # "ph" aus "ph", "ec" aus "ec"

    if base_sensor_type in CALIBRATION_REQUIRED_SENSOR_TYPES:
        logger.warning(
            "Offline-Rule fuer Logic-Rule %s uebersprungen: Sensor '%s' ist "
            "kalibrierungspflichtig (kein lokales Processing auf ESP). "
            "Aktor GPIO %s faellt auf default_state (OFF) bei Server-Ausfall.",
            rule.rule_name, sensor_value_type, actuator_gpio
        )
        return None

    # ... Rest der bestehenden Logik ...
```

**Wo genau den sensor_type lesen:** Die Logic-Rule hat Conditions. Jede Condition hat einen `sensor_type`. Der Code in `_extract_offline_rule()` liest diesen bereits — dort den Filter einfuegen, BEVOR die OfflineRule gebaut wird.

**Betroffene sensor_types im System:**

| sensor_type (DB) | `base_sensor_type` | Ausfiltern? | Begruendung |
|-------------------|-------------------|-------------|-------------|
| `ph` | `ph` | **JA** | ADC-Rohwert, Kalibrierung noetig |
| `ec` | `ec` | **JA** | ADC-Rohwert, Kalibrierung noetig |
| `moisture` | `moisture` | **JA** | ADC-Rohwert, Dry/Wet-Mapping noetig |
| `sht31_temp` | `sht31` | NEIN | applyLocalConversion liefert °C |
| `sht31_humidity` | `sht31` | NEIN | applyLocalConversion liefert %RH |
| `ds18b20` | `ds18b20` | NEIN | applyLocalConversion liefert °C |
| `bmp280_temp` | `bmp280` | NEIN | applyLocalConversion liefert °C |
| `bmp280_pressure` | `bmp280` | NEIN | applyLocalConversion liefert hPa |
| `bme280_*` | `bme280` | NEIN | applyLocalConversion liefert phys. Werte |
| `vpd` | `vpd` | **JA** (bereits gefiltert) | interface_type=VIRTUAL, wird nicht an ESP gesendet |

**Hinweis:** Der bestehende VIRTUAL-Filter in `build_combined_config()` filtert VPD bereits aus dem Config-Push. Dieser neue Filter ergaenzt das Pattern — analog wie VIRTUAL gefiltert wird, werden jetzt auch kalibrierungspflichtige Sensortypen gefiltert, aber spezifisch fuer Offline-Rules.

### Schritt 2: Server — Test fuer den Analog-Filter

**Datei:** `El Servador/god_kaiser_server/tests/unit/test_config_builder_offline_rules.py` (die 13 bestehenden Offline-Rule-Tests — verifiziert).

**Neue Tests (3 Stueck):**

```python
def test_offline_rule_skips_ph_sensor():
    """Logic-Rule mit pH-Sensor darf KEINE Offline-Rule erzeugen."""
    logic_rule = create_test_logic_rule(
        condition_sensor_type="ph",
        condition_gpio=34,  # ADC1-Pin
        actuator_gpio=27
    )
    result = config_builder._extract_offline_rule(logic_rule, esp_id, session)
    assert result is None  # Gefiltert!

def test_offline_rule_skips_ec_sensor():
    """Logic-Rule mit EC-Sensor darf KEINE Offline-Rule erzeugen."""
    logic_rule = create_test_logic_rule(
        condition_sensor_type="ec",
        condition_gpio=35,
        actuator_gpio=26
    )
    result = config_builder._extract_offline_rule(logic_rule, esp_id, session)
    assert result is None

def test_offline_rule_allows_sht31_sensor():
    """Logic-Rule mit SHT31 MUSS Offline-Rule erzeugen (digitaler Sensor)."""
    logic_rule = create_test_logic_rule(
        condition_sensor_type="sht31_humidity",
        condition_gpio=0,  # I2C
        actuator_gpio=27
    )
    result = config_builder._extract_offline_rule(logic_rule, esp_id, session)
    assert result is not None  # Erlaubt!
    assert result["sensor_value_type"] == "sht31_humidity"
```

### Schritt 3: Firmware — Defense-in-Depth Guard

**Datei:** `src/services/safety/offline_mode_manager.cpp`

**Stelle:** In `evaluateOfflineRules()`, VOR dem ValueCache-Read. Die Firmware kennt die analogen Sensortypen und erzwingt Safe-State falls eine solche Rule trotzdem ankommt (Server-Bug, manuelle Config-Manipulation, veraltete NVS-Daten).

**IST-Zustand** (offline_mode_manager.cpp:87-143, vereinfacht):

```cpp
void OfflineModeManager::evaluateOfflineRules() {
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        OfflineRule& rule = offline_rules_[i];
        if (!rule.enabled || rule.server_override) continue;

        float val = sensorManager.getSensorValue(rule.sensor_gpio, rule.sensor_value_type);
        if (isnan(val)) continue;

        // Hysterese-Evaluierung ...
    }
}
```

**SOLL-Zustand — Analog-Guard einfuegen:**

```cpp
// Kalibrierungspflichtige Sensortypen. Der ValueCache liefert fuer diese Typen
// nur den ADC-Rohwert (0-4095), nicht den physikalischen Wert.
// Offline-Hysterese-Thresholds sind in physikalischen Einheiten definiert.
// Vergleich ADC vs. phys. Einheit = sinnlos und potenziell gefaehrlich.
// Defense-in-Depth: Server sollte diese Rules nicht senden, aber falls doch
// (Bug, veraltete NVS-Daten), wird der Aktor hier sicher abgeschaltet.
static bool requiresCalibration(const char* sensor_value_type) {
    return (strcmp(sensor_value_type, "ph") == 0 ||
            strcmp(sensor_value_type, "ec") == 0 ||
            strcmp(sensor_value_type, "moisture") == 0);
}

void OfflineModeManager::evaluateOfflineRules() {
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        OfflineRule& rule = offline_rules_[i];
        if (!rule.enabled || rule.server_override) continue;

        // NEU: Kalibrierungspflichtige Sensoren → Aktor sicher abschalten
        if (requiresCalibration(rule.sensor_value_type)) {
            if (rule.is_active) {
                rule.is_active = false;
                actuatorManager.controlActuatorBinary(rule.actuator_gpio, false);
                LOG_W("OFFLINE", "Rule %u: sensor '%s' requires calibration — "
                       "forcing actuator GPIO %u OFF (safe state)",
                       i, rule.sensor_value_type, rule.actuator_gpio);
            }
            continue;  // Rule ueberspringen, nicht evaluieren
        }

        float val = sensorManager.getSensorValue(rule.sensor_gpio, rule.sensor_value_type);
        if (isnan(val)) continue;

        // ... bestehende Hysterese-Evaluierung unveraendert ...
    }
}
```

**Verhalten:**
- Analoge Rule vorhanden + Rule war aktiv (ON) → Aktor wird AUS geschaltet, einmalig Warning-Log
- Analoge Rule vorhanden + Rule war inaktiv (OFF) → bleibt AUS, kein redundantes Log
- Digitale Rule → unveraendert, Hysterese wie bisher
- Guard feuert **nur einmal** pro Rule (durch `if (rule.is_active)` Check) — kein Log-Spam

**Warum `false` und nicht `default_state`:** `controlActuatorBinary(gpio, false)` schaltet AUS. Fuer kalibrierungspflichtige Sensoren (pH-Dosierpumpe, EC-Dosierpumpe) ist AUS IMMER der sichere Zustand. `default_state` waere auch AUS (Config-Default), aber hier ist die Absicht explizit: "Wir wissen nicht was der Sensorwert bedeutet → abschalten."

### Schritt 4: Firmware — Test-Logging fuer Verifikation

In `evaluateOfflineRules()` am Anfang der Methode (nur bei `LOG_LEVEL >= DEBUG`):

```cpp
void OfflineModeManager::evaluateOfflineRules() {
    LOG_D("OFFLINE", "Evaluating %u offline rules (mode: %s)",
          offline_rule_count_, stateToString(mode_));

    // Einmalig nach Boot: Zusammenfassung welche Rules aktiv/gefiltert sind
    static bool first_evaluation = true;
    if (first_evaluation && offline_rule_count_ > 0) {
        first_evaluation = false;
        uint8_t filtered = 0;
        for (uint8_t i = 0; i < offline_rule_count_; i++) {
            if (requiresCalibration(offline_rules_[i].sensor_value_type)) filtered++;
        }
        if (filtered > 0) {
            LOG_W("OFFLINE", "%u of %u rules filtered (calibration-required sensors). "
                  "Associated actuators remain in safe state (OFF).",
                  filtered, offline_rule_count_);
        }
    }

    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        // ... Guard + Evaluierung wie oben ...
    }
}
```

---

## Akzeptanzkriterien

### Server-Side

- [x] `_extract_offline_rule()` gibt `None` zurueck fuer sensor_type `ph`, `ec`, `moisture`
- [x] Warning-Log erscheint fuer jede gefilterte Rule (mit Logic-Rule-ID + sensor_type)
- [x] Bestehende 13 Offline-Rule-Tests laufen weiterhin PASS
- [x] 3 neue Tests fuer den Analog-Filter: PASS

### Firmware-Side

- [ ] `requiresCalibration()` erkennt `"ph"`, `"ec"`, `"moisture"` korrekt
- [ ] Wenn eine analoge Rule in den OfflineModeManager gelangt (z.B. aus NVS nach Firmware-Update): Aktor wird AUS geschaltet, Warning-Log erscheint
- [ ] Digitale Rules (SHT31, DS18B20, BMP280, BME280) funktionieren unveraendert
- [ ] Build kompiliert ohne Warnings (`pio run -e esp32_dev`)

### Integrations-Test (Hardware oder Wokwi)

- [ ] **KERN-TEST:** ESP hat eine Logic-Rule "Relay AN wenn humidity < 45%" (SHT31) UND eine Logic-Rule "Pumpe AN wenn pH > 7.5". Server geht offline → ESP wechselt in OFFLINE_ACTIVE → Relay wird per Hysterese gesteuert (Humidity-Rule laeuft) → Pumpe bleibt AUS (pH-Rule gefiltert) → Log zeigt "calibration-required" Warning

---

## Was NICHT gemacht wird

- **Keine ADC-Threshold-Umrechnung auf Server oder ESP** — das waere fragil und architekturwidrig
- **Keine neuen Sensor-Processing-Libraries auf der Firmware** — Server-Centric bleibt bestehen
- **Keine Aenderung an der OfflineRule Struct** — kein neues Feld noetig (der Guard basiert auf `sensor_value_type` String-Matching)
- **Kein Frontend-Code** — das ist eine Backend+Firmware Sicherheitsmassnahme
- **Keine Aenderung an bestehenden Rules** — nur neue Rules werden gefiltert, NVS-gespeicherte alte Rules werden durch den Firmware-Guard abgefangen

---

## Beziehung zu anderen Auftraegen

- **SAFETY-P4-NVS-FINAL:** Dieser Auftrag (GUARD) sollte VOR oder PARALLEL zu P4-NVS-FINAL umgesetzt werden. Der NVS-Auftrag persistiert Rules — der Guard stellt sicher, dass persistierte Rules mit analogen Sensoren beim naechsten Boot sicher behandelt werden.
- **SAFETY-P1:** Der P1-Mechanismus (alle Aktoren → default_state bei Disconnect) bleibt unveraendert. Der Guard arbeitet INNERHALB von P4 — er bestimmt, welche Rules im Offline-Mode evaluiert werden duerfen.
- **VPD:** VPD (interface_type=VIRTUAL) wird bereits durch den bestehenden VIRTUAL-Filter im Config-Push ausgeschlossen. Kein zusaetzlicher Guard noetig.

---

## Empfohlener Agent

**Backend:** `server-dev` fuer `config_builder.py` Aenderung + Tests
**Firmware:** `esp32-dev` fuer `offline_mode_manager.cpp` Guard

**Reihenfolge:** Backend zuerst (Filter), dann Firmware (Guard). Oder parallel — beide sind unabhaengig testbar.

---

## Zusammenfassung

| Was | Wo | Aufwand |
|-----|-----|---------|
| Analog-Filter in `_extract_offline_rule()` | `config_builder.py` | ~1h |
| 3 neue Tests | Test-Datei config_builder | ~30min |
| `requiresCalibration()` Guard | `offline_mode_manager.cpp` | ~1h |
| Boot-Zusammenfassung Log | `offline_mode_manager.cpp` | ~15min |
| Test + Verifikation | Hardware oder Wokwi | ~1h |
| **Gesamt** | | **~3-4h** |
