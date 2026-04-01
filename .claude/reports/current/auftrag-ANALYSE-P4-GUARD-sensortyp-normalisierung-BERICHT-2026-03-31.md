# Analyse-Bericht: P4-GUARD Sensor-Typ-Normalisierungskette + Alias-Lücken

**Typ:** Analyse (kein Code geändert)
**Datum:** 2026-03-31
**Bearbeitet von:** Claude (Code-Analyse aller 3 Schichten)
**Status:** ABGESCHLOSSEN — vollständige IST-Dokumentation + Fix-Empfehlung

---

## Zusammenfassung

Der SAFETY-P4-GUARD hat eine verifizierte Lücke bei `"soil_moisture"`. Zusätzlich wurden
4 weitere Befunde identifiziert: Case-Sensitivity-Probleme im Frontend-Dropdown, ein
Bug in `rule-templates.ts`, dysfunktionale Offline-Rules durch Uppercase-Typ-Strings, und
eine fehlende Normalisierung im Firmware-GUARD für alle Aliase.

**Kritischster Befund:** `"soil_moisture"` bypassed **beide** Schutzschichten (Server + Firmware).
Die "zufällige Sicherheit" durch ValueCache-Mismatch ist kein Defense-in-Depth.

---

## Block A: Sensor-Typ-Landschaft — Alle Aliase

### A1: SENSOR_TYPE_MAPPING (sensor_type_registry.py, Zeilen 43–83)

Vollständige Map — verifiziert im aktuellen Code:

| Alias (Input) | Normalisiert zu | Kalibrierungspflichtig | Anmerkung |
|---|---|---|---|
| `"temperature_sht31"` | `"sht31_temp"` | NEIN | I2C Digital |
| `"humidity_sht31"` | `"sht31_humidity"` | NEIN | I2C Digital |
| `"sht31_temp"` | `"sht31_temp"` | NEIN | Identity |
| `"sht31_humidity"` | `"sht31_humidity"` | NEIN | Identity |
| `"temperature_ds18b20"` | `"ds18b20"` | NEIN | OneWire Digital |
| `"ds18b20"` | `"ds18b20"` | NEIN | Identity |
| `"pressure_bmp280"` | `"bmp280_pressure"` | NEIN | I2C Digital |
| `"temperature_bmp280"` | `"bmp280_temp"` | NEIN | I2C Digital |
| `"bmp280_pressure"` | `"bmp280_pressure"` | NEIN | Identity |
| `"bmp280_temp"` | `"bmp280_temp"` | NEIN | Identity |
| `"ph_sensor"` | `"ph"` | **JA** | ADC Analog |
| `"ph"` | `"ph"` | **JA** | Identity |
| `"ec_sensor"` | `"ec"` | **JA** | ADC Analog |
| `"ec"` | `"ec"` | **JA** | Identity |
| `"moisture"` | `"moisture"` | **JA** | Identity |
| `"soil_moisture"` | `"moisture"` | **JA** | **Alias — LÜCKE** |
| `"pressure_bme280"` | `"bme280_pressure"` | NEIN | I2C Digital |
| `"temperature_bme280"` | `"bme280_temp"` | NEIN | I2C Digital |
| `"humidity_bme280"` | `"bme280_humidity"` | NEIN | I2C Digital |
| `"bme280_pressure"` | `"bme280_pressure"` | NEIN | Identity |
| `"bme280_temp"` | `"bme280_temp"` | NEIN | Identity |
| `"bme280_humidity"` | `"bme280_humidity"` | NEIN | Identity |
| `"mhz19_co2"` | `"mhz19_co2"` | NEIN | UART (physische ppm) |
| `"scd30_co2"` | `"scd30_co2"` | NEIN | I2C (physische ppm) |
| `"light"` | `"light"` | NEIN | I2C Lux (kein analog LDR registriert) |
| `"tsl2561"` | `"light"` | NEIN | I2C Digital |
| `"bh1750"` | `"light"` | NEIN | I2C Digital |
| `"flow"` | `"flow"` | NEIN | Pulse Counter (L/min) |
| `"yfs201"` | `"flow"` | NEIN | Alias |

**Sicherheitsrelevante Aliase auf kalibrierungspflichtige Typen (3 Stück):**
- `"ph_sensor"` → `"ph"` — Server-GUARD fängt ab (`split("_")[0]` = `"ph"`)
- `"ec_sensor"` → `"ec"` — Server-GUARD fängt ab (`split("_")[0]` = `"ec"`)
- `"soil_moisture"` → `"moisture"` — **Server-GUARD MISSES** (`split("_")[0]` = `"soil"`)

### A2: Firmware SENSOR_TYPE_MAP (sensor_registry.cpp, Zeilen 142–183)

Die Firmware-Registry endet bei `MOISTURE_CAP` (Zeile 180) — CO2, Light, Flow sind
**nicht registriert** (Phase-3-Sensoren). `MOISTURE_CAP.server_sensor_type = "moisture"`.

`{"soil_moisture", &MOISTURE_CAP}` (Zeile 180) gilt nur für `findSensorCapability()`
im MQTT-Verarbeitungspfad — **NICHT** für Offline-Rule-Evaluation.

### A3: DB cross_esp_logic — keine Normalisierung beim Write

`cross_esp_logic.trigger_conditions` ist JSONB und wird ohne `normalize_sensor_type()`
gespeichert (Befund Block B1). `"soil_moisture"` landet unverändert in der DB.

---

## Block B: Sensor-Typ-Fluss durch die Offline-Rule-Pipeline

### B1: Logic-Rule Condition → DB — KEINE Normalisierung

**Datei:** [logic_validation.py:118](El Servador/god_kaiser_server/src/db/models/logic_validation.py#L118)

```python
class HysteresisCondition(BaseModel):
    sensor_type: Optional[str] = Field(None, ...)  # Zeile 146 — kein Validator!
```

`HysteresisCondition.sensor_type` ist `Optional[str]` ohne `@field_validator`.
Der `@validates("trigger_conditions")`-Dekorator ruft nur Pydantic-Typ-Validierung auf —
**kein Aufruf von `normalize_sensor_type()`**.

**Ergebnis:** DB speichert den `sensor_type` 1:1 wie vom API-Client gesendet.

### B2: config_builder._extract_offline_rule() — exakte Zeilen

**Datei:** [config_builder.py:429](El Servador/god_kaiser_server/src/services/config_builder.py#L429)

```python
# Zeile 429 — raw DB-Wert, keine Normalisierung:
sensor_value_type: str = hysteresis_cond.get("sensor_type") or ""

# Zeilen 461–472 — GUARD-Check mit split():
base_sensor_type = sensor_value_type.lower().split("_")[0]
if base_sensor_type in self.CALIBRATION_REQUIRED_SENSOR_TYPES:  # {"ph", "ec", "moisture"}
    logger.warning(...)
    return None

# Zeile 476 — bei nicht-gefilterten Rules: ORIGINAL-Wert (nicht normalisiert!):
return {
    ...
    "sensor_value_type": sensor_value_type,
    ...
}
```

**GUARD-Analyse für alle kalibrierungspflichtigen Strings:**

| Input `sensor_value_type` | `.lower().split("_")[0]` | In Filter-Set? | GUARD greift? |
|---|---|---|---|
| `"ph"` | `"ph"` | JA | **JA ✓** |
| `"pH"` | `"ph"` | JA | **JA ✓** |
| `"ph_sensor"` | `"ph"` | JA | **JA ✓** |
| `"ec"` | `"ec"` | JA | **JA ✓** |
| `"EC"` | `"ec"` | JA | **JA ✓** |
| `"ec_sensor"` | `"ec"` | JA | **JA ✓** |
| `"moisture"` | `"moisture"` | JA | **JA ✓** |
| **`"soil_moisture"`** | **`"soil"`** | **NEIN** | **NEIN ✗ — LÜCKE** |

**Fazit Server-GUARD:** Nur `"soil_moisture"` entkommt dem Filter. Alle anderen bekannten
Aliase werden korrekt abgefangen.

### B3: Config-Push JSON → Firmware parseOfflineRules()

**Datei:** [offline_mode_manager.cpp:224](El Trabajante/src/services/safety/offline_mode_manager.cpp#L224)

```cpp
const char* svt = r["sensor_value_type"] | "";
strncpy(offline_rules_[i].sensor_value_type, svt, 23);
```

Kein Alias-Lookup, keine Normalisierung. Was im JSON steht landet verbatim im `sensor_value_type`-Array.

### B4: ValueCache-Key vs. OfflineRule.sensor_value_type — der Kern-Disconnect

**ValueCache-Key-Entstehung** ([sensor_manager.cpp:1039](El Trabajante/src/services/sensor/sensor_manager.cpp#L1039)):
```cpp
String server_sensor_type = getServerSensorType(config->sensor_type);
// getServerSensorType("soil_moisture") → findSensorCapability → MOISTURE_CAP
// → server_sensor_type = "moisture"
reading_out.sensor_type = server_sensor_type;  // = "moisture"

// Zeile 1576:
updateValueCache(reading.gpio, reading.sensor_type.c_str(), reading.processed_value);
// ValueCache-Key = "moisture"
```

**getSensorValue() Vergleich** ([sensor_manager.cpp:1698](El Trabajante/src/services/sensor/sensor_manager.cpp#L1698)):
```cpp
// sensor_type kommt von rule.sensor_value_type = "soil_moisture"
if (strncmp(entry.sensor_type, sensor_type, 23) != 0) continue;
// strncmp("moisture", "soil_moisture", 23) ≠ 0 → kein Match → NAN
```

### Vollständiges Flussdiagramm: `"soil_moisture"` durch alle Schichten

```
Frontend sendet:   "soil_moisture" (z.B. aus rule-templates.ts oder direktem API-Call)
  ↓
API-Layer:         kein Validator auf HysteresisCondition.sensor_type
  ↓
DB:                cross_esp_logic.trigger_conditions → "soil_moisture" gespeichert
  ↓
config_builder:    sensor_value_type = "soil_moisture"
                   base_sensor_type = "soil"  ← split("_")[0]
                   "soil" NOT in {"ph", "ec", "moisture"} → GUARD GREIFT NICHT ✗
  ↓
Config-Push JSON:  {"sensor_value_type": "soil_moisture", ...}
  ↓
Firmware parse:    OfflineRule.sensor_value_type = "soil_moisture"
  ↓
requiresCalibration("soil_moisture"):
                   strcmp("soil_moisture", "ph")      = nein
                   strcmp("soil_moisture", "ec")      = nein
                   strcmp("soil_moisture", "moisture") = nein ← GUARD GREIFT NICHT ✗
  ↓
evaluateOfflineRules():
                   val = getSensorValue(gpio, "soil_moisture")
                   ValueCache-Key = "moisture" (via getServerSensorType)
                   strncmp("moisture", "soil_moisture", 23) ≠ 0 → NAN
  ↓
Ergebnis:          Rule wird ÜBERSPRUNGEN — aber Aktor NICHT explizit OFF gesetzt!
                   → "zufällig sicher", aber kein Defense-in-Depth
```

**Vergleich: `"moisture"` (korrekt):**
```
config_builder: split("_")[0] = "moisture" → IN SET → GUARD GREIFT → return None
→ Rule aus Config-Push ausgeschlossen ✓
Firmware (bei stale NVS): requiresCalibration("moisture") = TRUE → Aktor OFF ✓
```

---

## Block C: Normalisierungslücken im GUARD

### C1: Effektive Lücken — alle bekannten Strings

| sensor_value_type | Server GUARD | Firmware GUARD | ValueCache Match | Effektiver Outcome | Risiko |
|---|---|---|---|---|---|
| `"ph"` | ✓ greift | ✓ greift | MATCH | GEBLOCKT + SICHER | **KEIN** |
| `"pH"` | ✓ greift (.lower) | ✗ misses (case) | NAN | GEBLOCKT (Server) | LOW |
| `"ph_sensor"` | ✓ greift (split→ph) | ✗ misses | NAN | GEBLOCKT (Server) | LOW |
| `"ec"` | ✓ greift | ✓ greift | MATCH | GEBLOCKT + SICHER | **KEIN** |
| `"EC"` | ✓ greift (.lower) | ✗ misses (case) | NAN | GEBLOCKT (Server) | LOW |
| `"ec_sensor"` | ✓ greift (split→ec) | ✗ misses | NAN | GEBLOCKT (Server) | LOW |
| `"moisture"` | ✓ greift | ✓ greift | MATCH | GEBLOCKT + SICHER | **KEIN** |
| **`"soil_moisture"`** | **✗ misses** | **✗ misses** | NAN (Mismatch) | **Nur zufällig sicher** | **MITTEL** |

> **"zufällig sicher":** Rule wird durch ValueCache-NAN übersprungen, aber der Aktor
> wird **nicht** explizit in Safe-State versetzt. Wenn der Aktor bereits ON ist, bleibt er ON.

### C2: Firmware requiresCalibration() — Vollständigkeit

```cpp
// offline_mode_manager.cpp, Zeilen 93–97:
static bool requiresCalibration(const char* sensor_value_type) {
    return (strcmp(sensor_value_type, "ph") == 0 ||
            strcmp(sensor_value_type, "ec") == 0 ||
            strcmp(sensor_value_type, "moisture") == 0);
}
```

- `strcmp` ist **case-sensitive** — `"pH"` → FALSE
- Deckt nur 3 kanonische Formen ab, keine Aliase
- Muss erweitert werden: `"soil_moisture"`, `"ph_sensor"`, `"ec_sensor"`

---

## Block D: Case-Sensitivity und Edge Cases

### D1: String-Vergleiche — Übersicht

| Schicht | Funktion | Case-Verhalten | Risiko |
|---|---|---|---|
| Server config_builder | `.lower().split()` für GUARD | Lowercase erzwungen | Kein Case-Risiko für GUARD |
| Server config_builder | `sensor_value_type` im return dict | **Original (nicht lowercase)** | Config-Push sendet z.B. `"pH"` |
| Firmware requiresCalibration | `strcmp` | **Case-sensitive** | `"pH"` ≠ `"ph"` → GUARD MISSES |
| Firmware getSensorValue | `strncmp` | **Case-sensitive** | `"DS18B20"` ≠ `"ds18b20"` → NAN |
| Firmware findSensorCapability | `toLowerCase()` | **Case-insensitive** | Korrekt für MQTT-Pfad |

**Inkonsistenz:** `findSensorCapability()` ist case-insensitiv, aber `requiresCalibration()` und
`getSensorValue()` sind case-sensitiv. Das führt zu stillem Versagen wenn nicht lowercase normalisiert.

### D2: NVS-Altdaten — Risiko-Bewertung

**Szenario:** ESP hatte vor dem GUARD-Update `"soil_moisture"` in NVS:
1. `loadOfflineRulesFromNVS()` lädt `"soil_moisture"` verbatim
2. `requiresCalibration("soil_moisture")` → FALSE → Firmware-GUARD greift nicht
3. `getSensorValue(gpio, "soil_moisture")` → ValueCache = `"moisture"` → NAN → Rule skip
4. **Kein explizites Ausschalten des Aktors**

**Realistisch?** Gering — `"soil_moisture"` gelangt über normalen UI-Flow nicht in
Hysteresis-Conditions (Block F). Nur via direktem API-Call oder Template-Fehler.

### D3: TimeWindow wird in Offline-Mode ignoriert

`_extract_offline_rule()` sucht die ERSTE Hysteresis-Condition. Bei Rules mit
`[TimeWindow + Hysteresis]` wird nur Hysteresis extrahiert — das TimeWindow wird
in Offline-Mode ignoriert. **Kein Sicherheitsrisiko** (nur Verhaltensänderung).

---

## Block E: applyLocalConversion() — Vollständigkeit

### E1: Verifizierte Branches (sensor_manager.cpp:60–87)

Branches existieren für: `sht31_temp`, `sht31_humidity`, `ds18b20`, `bmp280_temp`,
`bme280_temp`, `bmp280_pressure`, `bme280_pressure`, `bme280_humidity`.

**Alle anderen → `(float)raw_value` Default-Passthrough.**

### E2: Vollständigkeit nach Sensortyp

| Sensortyp | Interface | Konversion Branch | ValueCache-Wert | Offline-Rule sicher? |
|---|---|---|---|---|
| `sht31_temp/humidity` | I2C | JA (Formel) | °C / % | JA |
| `ds18b20` | OneWire | JA (×0.0625) | °C | JA |
| `bmp280/bme280_*` | I2C | JA (/100 etc.) | physische Einheiten | JA |
| `ph` | ADC Analog | **NEIN** → raw | ADC 0–4095 | **NEIN** — GUARD muss blockieren |
| `ec` | ADC Analog | **NEIN** → raw | ADC 0–4095 | **NEIN** — GUARD muss blockieren |
| `moisture` | ADC Analog | **NEIN** → raw | ADC 0–4095 | **NEIN** — GUARD muss blockieren |
| `mhz19_co2` | UART | NEIN → raw | ppm (Library liefert physisch) | JA |
| `scd30_co2` | I2C | NEIN → raw | ppm (physisch) | JA |
| `light` | I2C | NEIN → raw | Lux (physisch, TSL2561/BH1750) | JA |
| `flow` | Pulse | NEIN → raw | L/min (physisch) | JA |

> CO2, Light, Flow: nicht in Firmware-SENSOR_TYPE_MAP (Phase 3). `getServerSensorType()`
> gibt den Original-String zurück. Offline-Rules funktionieren wenn Typ exakt übereinstimmt.

### E3: Blacklist vs. Whitelist

**Aktuell: Blacklist** (`{"ph", "ec", "moisture"}`).
Das `"soil_moisture"`-Problem zeigt die Schwäche: neue Aliase müssen explizit gepflegt werden.

**Whitelist** (`SAFE_FOR_OFFLINE_SENSOR_TYPES`) würde neue Typen per Default blockieren —
sicherer, aber neue digitale Typen müssen freigeschaltet werden.

**Empfehlung:** Normalisierung vor dem GUARD-Check löst das Alias-Problem ohne
Architekturwechsel. Whitelist als Option für zukünftige analoge Sensortypen bewerten.

---

## Block F: Frontend sensor_type Herkunft

### F1: RuleConfigPanel.vue — Hysteresis-Condition Sensor-Dropdown

**Datei:** [RuleConfigPanel.vue:95](El Frontend/src/components/rules/RuleConfigPanel.vue#L95)

```typescript
const sensorTypeOptions = [
  { value: 'DS18B20', label: 'DS18B20 (Temperatur)' },    // ← UPPERCASE
  { value: 'sht31_temp', ... },
  { value: 'sht31_humidity', ... },
  { value: 'bmp280_temp', ... },
  { value: 'bmp280_pressure', ... },
  { value: 'bme280_temp', ... },
  { value: 'bme280_humidity', ... },
  { value: 'bme280_pressure', ... },
  { value: 'pH', label: 'pH-Sensor' },          // ← UPPERCASE "pH"
  { value: 'EC', label: 'EC (Leitfähigkeit)' }, // ← UPPERCASE "EC"
  { value: 'moisture', label: 'Bodenfeuchte' }, // ← KORREKT (lowercase)
  { value: 'light', ... },
  { value: 'co2', ... },
  { value: 'flow', ... },
  { value: 'level', ... },
]
```

**Befunde:**
- `"moisture"` ist im Dropdown (nicht `"soil_moisture"`) → normaler UI-Flow für Hysteresis ist sicher
- `"pH"` / `"EC"` UPPERCASE → Server-GUARD fängt ab (`.lower()`), aber Firmware-GUARD versagt
- `"DS18B20"` UPPERCASE → dysfunktionale Offline-Rules (ValueCache-Key = `"ds18b20"` → strncmp-Mismatch → NAN)

### F2: rule-templates.ts — Bug in Template

**Datei:** [rule-templates.ts:92](El Frontend/src/config/rule-templates.ts#L92)

```typescript
{
  id: 'irrigation-schedule',
  conditions: [
    { type: 'time_window', ... },
    {
      type: 'sensor',          // ← "sensor", NICHT "hysteresis"
      sensor_type: 'soil_moisture',  // ← ALIAS, nicht normalisiert
      operator: '<',
      value: 40,
    },
  ],
}
```

- `type: "sensor"` wird von `_extract_offline_rule()` nicht als Offline-Rule extrahiert
  (sucht nur `type: "hysteresis"`) — **kein direktes Sicherheitsrisiko**
- Template zeigt `"soil_moisture"` als Muster → schlechte Praxis für Nutzer
- Fix: auf `"moisture"` ändern

### F3: Herkunfts-Bewertung

| Herkunft | soil_moisture in Hysteresis möglich? | Risiko |
|---|---|---|
| RuleConfigPanel.vue Dropdown | NEIN (hat nur `"moisture"`) | KEIN UI-Risiko |
| rule-templates.ts "Bewässerungs-Zeitplan" | NEIN (type = "sensor", kein Hysteresis) | INFO |
| Direkter API-Call | JA (kein Validator auf sensor_type) | MITTEL (nur manuell) |

**Fazit Block F:** `"soil_moisture"` gelangt durch normalen UI-Fluss **nicht** in Hysteresis-Conditions.
Die Lücke ist nur via direktem API-Call oder Import-Skript erreichbar.

---

## Block G: Base-Type-Einträge als dysfunktionale Rules

### G1: Uppercase-Problem im Frontend-Dropdown

Wenn eine Hysteresis-Rule mit `sensor_type: "DS18B20"` (UPPERCASE aus Frontend-Dropdown) erstellt wird:
- Server-GUARD: `"ds18b20"` → nicht in Filter-Set → nicht gefiltert (korrekt, kein Kalibrierungsrisiko)
- Config-Push sendet: `"sensor_value_type": "DS18B20"`
- Firmware: `getSensorValue(gpio, "DS18B20")` → ValueCache hat `"ds18b20"` (lowercase) → **Mismatch → NAN → Rule dysfunktional**

**Sicherheitsrisiko:** KEINES. **Usability-Risiko:** DS18B20-Offline-Rules funktionieren nicht.

---

## Ergebnis-Zusammenfassung: Vollständige Alias-Risiko-Matrix

| sensor_value_type | Kalibrierungspfl. | Server GUARD | Firmware GUARD | ValueCache Key | Outcome | Risiko |
|---|---|---|---|---|---|---|
| `"ph"` | JA | ✓ | ✓ | `"ph"` | GEBLOCKT + SICHER | **KEIN** |
| `"pH"` | JA | ✓ (.lower) | ✗ (case) | `"ph"` → NAN | GEBLOCKT (Server) | LOW |
| `"ph_sensor"` | JA | ✓ (split→ph) | ✗ | `"ph"` → NAN | GEBLOCKT (Server) | LOW |
| `"ec"` | JA | ✓ | ✓ | `"ec"` | GEBLOCKT + SICHER | **KEIN** |
| `"EC"` | JA | ✓ (.lower) | ✗ (case) | `"ec"` → NAN | GEBLOCKT (Server) | LOW |
| `"ec_sensor"` | JA | ✓ (split→ec) | ✗ | `"ec"` → NAN | GEBLOCKT (Server) | LOW |
| `"moisture"` | JA | ✓ | ✓ | `"moisture"` | GEBLOCKT + SICHER | **KEIN** |
| **`"soil_moisture"`** | **JA** | **✗ (split→soil)** | **✗** | `"moisture"` → **NAN** | **Zufällig sicher** | **MITTEL** |
| `"DS18B20"` | NEIN | nicht gefiltert | nicht gefiltert | `"ds18b20"` → NAN | DYSFUNKTIONAL | Usability |
| `"mhz19_co2"` | NEIN | nicht gefiltert | nicht gefiltert | `"mhz19_co2"` | FUNKTIONAL | KEIN |
| `"light"` | NEIN | nicht gefiltert | nicht gefiltert | `"light"` | FUNKTIONAL | KEIN |
| `"flow"` | NEIN | nicht gefiltert | nicht gefiltert | `"flow"` | FUNKTIONAL | KEIN |

---

## Fix-Empfehlung: Option B (Normalisierung + Firmware-Defense-in-Depth)

**Begründung:** Option A (nur Server) lässt NVS-Altdaten ungeschützt. Option C (DB-Create)
erfordert Migration. Option B ist minimal-invasiv und schließt alle bekannten Lücken.

### Fix 1 — Server: normalize_sensor_type() in config_builder (KRITISCH, Prio 1)

**Datei:** [config_builder.py:429](El Servador/god_kaiser_server/src/services/config_builder.py#L429)

```python
# Import am Dateianfang (normalize_sensor_type ist bereits in sensor_type_registry.py):
from ..sensors.sensor_type_registry import normalize_sensor_type

# Zeile ~429 — VOR dem GUARD-Check einfügen:
sensor_value_type: str = hysteresis_cond.get("sensor_type") or ""
sensor_value_type = normalize_sensor_type(sensor_value_type)  # NEU: 1 Zeile
# "soil_moisture" → "moisture", "ph_sensor" → "ph", "DS18B20" → "ds18b20"
```

**Effekte:**
- GUARD-Check: `"moisture".split("_")[0]` = `"moisture"` → IN SET → gefiltert ✓
- Config-Push enthält `"moisture"` statt `"soil_moisture"` → ValueCache-Match ✓
- `"DS18B20"` → `normalize_sensor_type("DS18B20")` → `"ds18b20"` (SENSOR_TYPE_MAPPING nutzt `.lower()`) → Offline-Rules funktionieren ✓
- `normalize_sensor_type("pH")` → `SENSOR_TYPE_MAPPING.get("ph")` = `"ph"` → GUARD fängt ab ✓

### Fix 2 — Firmware: requiresCalibration() erweitern (HIGH, Prio 1)

**Datei:** [offline_mode_manager.cpp:93](El Trabajante/src/services/safety/offline_mode_manager.cpp#L93)

Alle bekannten Aliase als Defense-in-Depth für NVS-Altdaten hinzufügen:

```cpp
static bool requiresCalibration(const char* sensor_value_type) {
    return (strcmp(sensor_value_type, "ph") == 0 ||
            strcmp(sensor_value_type, "ph_sensor") == 0 ||    // Alias
            strcmp(sensor_value_type, "ec") == 0 ||
            strcmp(sensor_value_type, "ec_sensor") == 0 ||    // Alias
            strcmp(sensor_value_type, "moisture") == 0 ||
            strcmp(sensor_value_type, "soil_moisture") == 0); // Alias
}
```

**Warum Fix 2 nötig:** NVS-Rules werden beim Boot direkt geladen — ohne Server-Kontakt.
Der Firmware-GUARD ist die EINZIGE Schutzschicht für stale NVS-Daten aus der Zeit vor Fix 1.

### Fix 3 — Frontend: sensorTypeOptions normalisieren (MEDIUM, Prio 2)

**Datei:** [RuleConfigPanel.vue:95](El Frontend/src/components/rules/RuleConfigPanel.vue#L95)

```typescript
// VORHER:
{ value: 'DS18B20', label: 'DS18B20 (Temperatur)' },
{ value: 'pH', label: 'pH-Sensor' },
{ value: 'EC', label: 'EC (Leitfähigkeit)' },

// NACHHER:
{ value: 'ds18b20', label: 'DS18B20 (Temperatur)' },
{ value: 'ph', label: 'pH-Sensor' },
{ value: 'ec', label: 'EC (Leitfähigkeit)' },
```

**Effekt:** Behebt dysfunktionale DS18B20-Offline-Rules. Konsistente Case-Behandlung.

### Fix 4 — Frontend: rule-templates.ts (LOW, Prio 2)

**Datei:** [rule-templates.ts:92](El Frontend/src/config/rule-templates.ts#L92)

```typescript
// VORHER:
sensor_type: 'soil_moisture',

// NACHHER:
sensor_type: 'moisture',
```

Kein direktes Sicherheitsrisiko (type = `"sensor"`), aber schlechtes Muster im Template.

### Optionen-Vergleich

| Option | Beschreibung | Aufwand | Abdeckung |
|---|---|---|---|
| A | `normalize_sensor_type()` in config_builder | 1 Zeile Python | Server-Pfad (nicht NVS) |
| **B (empfohlen)** | Wie A + Firmware-Erweiterung | 1 Zeile Python + 2 C++-Zeilen | Server + Firmware + NVS |
| C | Normalisierung bei Logic-Rule-Create | Validator + DB-Migration | Vollständig — Separater Auftrag |

---

## Befunde-Übersicht (sortiert nach Priorität)

| ID | Befund | Schweregrad | Fix |
|---|---|---|---|
| **B1** | `"soil_moisture"` umgeht Server-GUARD (`split("_")[0]` = "soil") | **MITTEL** | Fix 1 |
| **B2** | `"soil_moisture"` umgeht Firmware-GUARD (`strcmp` mit "moisture") | **MITTEL** | Fix 2 |
| **B3** | Firmware `requiresCalibration()` deckt keine Aliase ab (`ph_sensor`, `ec_sensor`) | LOW | Fix 2 |
| **B4** | Frontend sensorTypeOptions nutzt UPPERCASE (`"DS18B20"`, `"pH"`, `"EC"`) → dysfunktionale Offline-Rules | LOW | Fix 3 |
| **B5** | `rule-templates.ts` "Bewässerungs-Zeitplan" nutzt `"soil_moisture"` (kein Hysteresis-Risiko) | INFO | Fix 4 |
| **B6** | `HysteresisCondition.sensor_type` hat keinen `normalize_sensor_type()` Validator | LOW | Option C (Separater Auftrag) |
| **B7** | TimeWindow-Constraint wird in Offline-Mode ignoriert (nur Hysteresis extrahiert) | INFO | Separate Doku |

---

*Analyse: kein Code geändert. Alle Zeilenreferenzen gegen aktuellen Stand 2026-03-31 verifiziert.*
