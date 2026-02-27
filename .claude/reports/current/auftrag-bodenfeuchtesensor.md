# Auftrag: Bodenfeuchtesensor-Implementierung (Kapazitiv / DFRobot SEN0193)

> **Erstellt:** 2026-02-27
> **Status:** BEREIT ZUR IMPLEMENTIERUNG
> **Erstellt von:** Automation-Experte (Life-Repo), basierend auf Erstanalyse 2026-02-27
> **Ziel-Repo:** auto-one
> **Geschaetzter Aufwand:** ~4-5h gesamt (5 Bloecke)
> **Prioritaet:** HOCH — naechster Sensor nach SHT31 Hardware-Test
> **Robins Hardware:** DFRobot SEN0193 V1.0 (Gravity Analog Capacitive, 3.3V, Corrosion Resistant)

---

## Kontext (self-contained)

Die Bodenfeuchtesensor-Integration ist **85% fertig**. Die vollstaendige Erstanalyse (`auftrag-erstanalyse-bodenfeuchtesensor.md`) hat ergeben:

- `moisture.py` (430 Zeilen, 31 Tests) ist VOLLSTAENDIG implementiert
- `MOISTURE_CAP` und `SENSOR_TYPE_MAP`-Eintrag in `sensor_registry.cpp` existieren
- AddSensorModal, CalibrationWizard, gpioConfig.ts, sensor-schemas.ts sind vorhanden
- `SENSOR_TYPE_CONFIG['moisture']` in `sensorDefaults.ts` ist korrekt konfiguriert

**Das zentrale Problem in ALLEN 3 Schichten:** Ein Naming-Mismatch. Der kanonische Name ist `"moisture"`, aber 5 Stellen im Frontend, 1 Stelle im Backend und 1 Stelle in der Firmware nutzen `"soil_moisture"`. Es fehlt ein Alias-Eintrag in jeder Registry.

**pH/EC sind die Referenz-Implementierungen.** Wo die Analyse "wie pH/EC" sagt, ist das Pattern identisch.

---

## Schritt 0: Vorbedingung pruefen (ZUERST ausfuehren, ~5min)

Bevor Block 2 bewertet werden kann, muss die Arduino-ESP32-Version feststehen:

```bash
# Im auto-one Repo Root ausfuehren:
grep -n "platform\|framework\|board\|arduino\|espressif32" El\ Trabajante/platformio.ini
```

**Bewertungsmatrix:**

| Ergebnis | Arduino-ESP32 Version | ADC-Default | Block 2 Pflicht? |
|----------|-----------------------|-------------|------------------|
| `platform = espressif32` Versionsnummer >= 5.x | v2.x+ | ADC_11db (0-3100mV) | NEIN — Safety-Net |
| `platform = espressif32` Versionsnummer < 5.x | v1.x | ADC_0db (0-1100mV) | JA — KRITISCH |
| Kein Versionssuffix, aktuell installiert | Wahrscheinlich v2.x+ | ADC_11db | NEIN — Safety-Net |

**Hintergund:** In Arduino-ESP32 v2.x+ ist `ADC_ATTEN_DB_11` der DEFAULT fuer `analogRead()`. Der DFRobot SEN0193 gibt 0-3.0V aus — passt exakt in den 11dB-Messbereich (100-3100mV). Falls v2.x+ → Block 2 reduziert sich auf Safety-Net (empfohlen, aber nicht blockierend).

```bash
# Zusaetzlicher Check — aktuelle Attenuation in der Codebase:
grep -rn "analogSetPinAttenuation\|ADC_ATTEN\|analogSetAttenuation" El\ Trabajante/src/
# Erwartetes Ergebnis: 0 Treffer (keiner setzt Attenuation explizit)
```

```bash
# Analog-Pfad lokalisieren (fuer Block 2):
grep -n "readRawAnalog\|analogRead" El\ Trabajante/src/services/sensor/sensor_manager.cpp | head -20
# Erwartetes Ergebnis: readRawAnalog() bei ~Zeile 1279-1289
```

---

## Block 1: Naming-Aliase — ALLE 3 Schichten (~30min)

**Prio: BLOCKER — ohne diesen Block laeuft nichts End-to-End**

Der kanonische Name bleibt `"moisture"`. `"soil_moisture"` wird als Alias hinzugefuegt. Beide muessen in jeder Registry funktionieren.

### 1.1 — Firmware: sensor_registry.cpp

**Datei:** `El Trabajante/src/models/sensor_registry.cpp`

Lese zuerst den Bereich um Zeile 175-185 um den genauen Kontext zu sehen:

```bash
grep -n "soil_moisture\|MOISTURE_CAP\|\"moisture\"\|\"ec\"\|\"ph\"" El\ Trabajante/src/models/sensor_registry.cpp
```

**Erwartetes IST (Zeile ~179):**
```cpp
{"moisture", &MOISTURE_CAP},
```

**SOLL — 1 Zeile direkt darunter einfuegen:**
```cpp
{"moisture", &MOISTURE_CAP},
{"soil_moisture", &MOISTURE_CAP},  // Alias — identisch mit moisture
```

**Referenz:** Bei pH/EC ist das Pattern identisch:
```cpp
{"ph", &PH_CAP},
{"ec", &EC_CAP},
```
(Kein Alias noetig dort, weil Frontend konsistent `"ph"`/`"ec"` nutzt — bei moisture ist das nicht so.)

**Akzeptanzkriterium Block 1.1:** `grep -c "soil_moisture" El\ Trabajante/src/models/sensor_registry.cpp` gibt `1` zurueck.

---

### 1.2 — Backend: sensor_type_registry.py

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`

```bash
grep -n "moisture\|soil_moisture" El\ Servador/god_kaiser_server/src/sensors/sensor_type_registry.py
```

**Erwartetes IST (Zeile ~64):**
```python
"moisture": "moisture",
```

**SOLL — 1 Zeile direkt darunter einfuegen:**
```python
"moisture": "moisture",
"soil_moisture": "moisture",  # Alias — normalize_sensor_type() gibt "moisture" zurueck
```

**Warum:** `normalize_sensor_type("soil_moisture")` gibt aktuell `"soil_moisture"` als Passthrough zurueck. `LibraryLoader` findet dann keinen `MoistureSensorProcessor`. Mit dem Alias gibt `normalize_sensor_type("soil_moisture")` korrekt `"moisture"` zurueck.

**Akzeptanzkriterium Block 1.2:** Bestehende Unit-Tests laufen durch:
```bash
cd El\ Servador && python -m pytest tests/unit/test_moisture_processor.py -v
# Erwartung: 31 tests passed
```

---

### 1.3 — Frontend: sensorDefaults.ts

**Datei:** `El Frontend/src/utils/sensorDefaults.ts`

```bash
grep -n "'moisture'\|'soil_moisture'" El\ Frontend/src/utils/sensorDefaults.ts | head -10
```

**Erwartetes IST (Zeile ~388):**
```typescript
'moisture': {
  label: 'Bodenfeuchte',
  unit: '%',
  min: 0,
  max: 100,
  decimals: 0,
  icon: 'Droplets',
  category: 'soil',
  // ...
},
```

**SOLL — [verify-plan KORRIGIERT] Bestehenden `moisture`-Block ERWEITERN (NICHT ersetzen!) + Alias-Eintrag direkt dahinter:**

**WARNUNG:** Der bestehende `moisture`-Eintrag (Zeile 388-402) hat Felder die im bisherigen SOLL fehlten und bei Copy-Paste VERLOREN gehen wuerden! Korrekt ist:
```typescript
'moisture': {
  label: 'Bodenfeuchte',
  unit: '%',
  min: 0,
  max: 100,
  decimals: 0,
  icon: 'Droplets',
  defaultValue: 50,                                   // BESTEHEND — nicht loeschen!
  description: 'Bodenfeuchtigkeit in Prozent. Kapazitiver oder resistiver Sensor.',  // BESTEHEND
  category: 'soil',
  recommendedMode: 'continuous',                       // BESTEHEND
  recommendedTimeout: 300,                             // BESTEHEND
  supportsOnDemand: false,                             // BESTEHEND
  defaultIntervalSeconds: 60,                          // NEU: Messung alle 60s
  recommendedGpios: [32, 33, 34, 35, 36, 39],         // NEU: ADC1 Pins
},
'soil_moisture': {                                     // NEU: Alias-Eintrag
  label: 'Bodenfeuchte',
  unit: '%',
  min: 0,
  max: 100,
  decimals: 0,
  icon: 'Droplets',
  defaultValue: 50,
  description: 'Bodenfeuchtigkeit in Prozent. Kapazitiver oder resistiver Sensor.',
  category: 'soil',
  recommendedMode: 'continuous',
  recommendedTimeout: 300,
  supportsOnDemand: false,
  defaultIntervalSeconds: 60,
  recommendedGpios: [32, 33, 34, 35, 36, 39],
},
```

**[verify-plan BESTAETIGT]:** `defaultIntervalSeconds` (Zeile 39) und `recommendedGpios` (Zeile 48) sind im `SensorTypeConfig`-Interface definiert. Beide Felder koennen hinzugefuegt werden.

**Hintergrund — Key-Inkonsistenz in der Codebase (aus Erstanalyse):**

| Datei | Key | Zeile |
|-------|-----|-------|
| `sensorDefaults.ts` | `'moisture'` | :388 |
| `eventTransformer.ts` | `'soil_moisture'` | :50 |
| `gpioConfig.ts` | `'soil_moisture'` | :554 |
| `sensor-schemas.ts` | `'soil_moisture'` | :387 |
| `rule-templates.ts` | `'soil_moisture'` | :92 |
| `ComponentCard.vue` | `'soil_moisture'` | :71 |
| `RuleFlowEditor.vue` | `'moisture'` | :108 |
| `RuleConfigPanel.vue` | `'moisture'` | :80 |
| `RuleNodePalette.vue` | `'moisture'` | :93 |

Mit dem Alias in `sensorDefaults.ts` funktionieren BEIDE Keys korrekt.

**Akzeptanzkriterium Block 1.3:**
```bash
cd El\ Frontend && npm run build
# Erwartung: Build ohne Fehler
```

```bash
# Verify: Beide Keys im Build erreichbar:
grep -c "'soil_moisture'" El\ Frontend/src/utils/sensorDefaults.ts
# Erwartung: >= 1
```

---

### 1.4 — Commit Block 1

```bash
git add El\ Trabajante/src/models/sensor_registry.cpp \
        El\ Servador/god_kaiser_server/src/sensors/sensor_type_registry.py \
        El\ Frontend/src/utils/sensorDefaults.ts
git commit -m "fix: add soil_moisture alias in all three registries

- sensor_registry.cpp: {'soil_moisture': &MOISTURE_CAP} entry
- sensor_type_registry.py: 'soil_moisture': 'moisture' normalization
- sensorDefaults.ts: soil_moisture alias + defaultIntervalSeconds + recommendedGpios

Fixes naming mismatch: canonical name is 'moisture', frontend/schemas use 'soil_moisture'.
Both keys now work end-to-end in all three layers."
```

---

## Block 2: ADC-Attenuation Safety-Net (Firmware, ~15-30min)

**Prio:** Haengt von Schritt 0 ab. Bei Arduino-ESP32 v2.x+ = EMPFOHLEN (Safety-Net). Bei v1.x = KRITISCH.

### 2.1 — Vorbereitung

Lese zuerst den tatsaechlichen `readRawAnalog()`-Code:

```bash
grep -n "readRawAnalog\|analogRead\|gpio_hal\|INPUT" El\ Trabajante/src/services/sensor/sensor_manager.cpp | grep -A 15 "readRawAnalog"
```

**Erwartetes IST (Zeile 1279-1289) — [verify-plan KORRIGIERT]:**
```cpp
uint32_t SensorManager::readRawAnalog(uint8_t gpio) {  // [Korrektur: Return uint32_t, Param uint8_t — NICHT int]
    if (!initialized_) {
        return 0;
    }
    // [Korrektur: Nutzt gpio_manager_, NICHT direktes pinMode()]
    gpio_manager_->configurePinMode(gpio, INPUT);
    return analogRead(gpio);
}
```

### 2.2 — Fix: Attenuation explizit setzen

**SOLL — `analogSetPinAttenuation` VOR `analogRead` einfuegen:**

```cpp
uint32_t SensorManager::readRawAnalog(uint8_t gpio) {  // [Korrektur: uint32_t + uint8_t]
    if (!initialized_) {
        return 0;
    }
    gpio_manager_->configurePinMode(gpio, INPUT);  // [Korrektur: gpio_manager_, nicht pinMode]
    analogSetPinAttenuation(gpio, ADC_ATTEN_DB_11);  // Safety-Net: 100-3100mV Messbereich
                                                       // Bei Arduino-ESP32 v2.x+ ist dies bereits
                                                       // der Default, schadet aber nicht.
                                                       // Bei v1.x: PFLICHT fuer DFRobot SEN0193
                                                       // (0-3.0V Output wuerde sonst saettigen)
    return analogRead(gpio);
}
```

**Warum explizit:** Macht den Intent im Code sichtbar. Schuetzt bei Arduino-ESP32-Versionswechsel. Gilt auch fuer pH/EC-Sensoren (gleiche Lese-Funktion).

**Falls `readRawAnalog()` den HAL `esp32_gpio_hal.h` nutzt statt direktem `analogRead()`:** Attenuation direkt in den HAL-Wrapper einfuegen, nicht in `sensor_manager.cpp`. Grep vorher:
```bash
grep -n "readRawAnalog\|esp32_gpio_hal\|analogRead" El\ Trabajante/src/drivers/hal/esp32_gpio_hal.h
```

### 2.3 — Build-Verifikation

```bash
cd El\ Trabajante && pio run
# Erwartung: SUCCESS — keine Compilier-Fehler
```

```bash
# Verify: Attenuation ist jetzt gesetzt
grep -rn "analogSetPinAttenuation\|ADC_ATTEN_DB_11" El\ Trabajante/src/
# Erwartung: 1 Treffer in sensor_manager.cpp (oder esp32_gpio_hal.h)
```

### 2.x — System-Status (verify-plan Update 2026-02-27, neuer Computer)

**Verfügbare Tools:**
| Tool | Status | Workaround |
|------|--------|------------|
| PlatformIO CLI | NICHT installiert | Build-Verifikation in IDE oder manuell |
| pytest (lokal) | NICHT installiert | `MSYS_NO_PATHCONV=1 docker exec automationone-server python -m pytest ...` |
| pytest (Container) | v9.0.2 VORHANDEN | Tests-Verzeichnis NICHT gemounted — nur `/app/src/` |
| Python (lokal) | v3.12 | Für einfache Scripts |
| Node/npx (lokal) | VORHANDEN | `npx vue-tsc --noEmit` funktioniert |
| Docker Stack | VOLLSTÄNDIG running + healthy | `MSYS_NO_PATHCONV=1` bei docker exec nötig (Git Bash) |

**Inline-Test-Pattern (statt pytest):**
```bash
MSYS_NO_PATHCONV=1 docker exec automationone-server python -c "
import sys; sys.path.insert(0, '/app')
from src.sensors.sensor_type_registry import normalize_sensor_type
print(normalize_sensor_type('soil_moisture'))  # Erwartung: 'moisture'
"
```

**Block 1+2 Verifikation (2026-02-27 durchgeführt):**
- `normalize_sensor_type('soil_moisture')` → `'moisture'` ✅
- `LibraryLoader.get_processor('soil_moisture')` → `MoistureSensorProcessor` ✅
- `MoistureSensorProcessor.process(2143)` → `value=62.2, unit=%, quality=good` ✅
- `MoistureSensorProcessor.process(2050, calibration={dry:2800, wet:1300})` → `value=50.0` ✅
- Frontend Build (`vue-tsc --noEmit`) → keine Fehler ✅

### 2.4 — Commit Block 2

```bash
git add El\ Trabajante/src/services/sensor/sensor_manager.cpp
git commit -m "fix: set ADC_ATTEN_DB_11 explicitly in readRawAnalog()

Safety-net for all analog sensors (moisture, pH, EC).
At Arduino-ESP32 v2.x+ this is already the default (100-3100mV range).
At v1.x this is critical: without it, DFRobot SEN0193 (0-3.0V output)
would saturate the ADC (0-1.1V range).

Explicit setting is self-documenting and protects against version changes."
```

---

## Block 3: useCalibration.ts erweitern (~30-45min, REDUZIERT)

**Prio: MITTEL — [verify-plan NEUBEWERTUNG 2026-02-27]**

**WICHTIGE ERKENNTNIS:** Die CalibrationWizard-Architektur ist ANDERS als im Original-Plan angenommen:

| Komponente | Nutzt | Status moisture |
|------------|-------|----------------|
| `CalibrationWizard.vue` | `calibrationApi` (eigene API-Schicht) | **FUNKTIONIERT BEREITS** — hat `moisture`-Preset (Zeile 55-61), ruft `/api/v1/sensors/calibrate` direkt auf |
| `SensorConfigPanel.vue` | `useCalibration.ts` (Composable) | **BROKEN** — Zeile 382: `startCalibration(sensorType === 'ph' ? 'pH' : 'EC')` → moisture wird als 'EC' behandelt |

**Konsequenz:** Block 3 Scope ist KLEINER als geplant:
- CalibrationWizard.vue → KEIN Umbau nötig (funktioniert!)
- useCalibration.ts → NUR Typ-Erweiterung für SensorConfigPanel
- SensorConfigPanel.vue → Ternary-Fix Zeile 382 + moisture-Template

**Option B (eigenes Composable) wird NICHT empfohlen** — der Aufwand rechtfertigt sich nicht, da CalibrationWizard.vue die Hauptroute ist.

### 3.1 — IST-Zustand analysieren

```bash
# Aktuelle Struktur des Composable:
grep -n "type\|interface\|pH\|EC\|null\|getCalibrationData\|slope\|offset\|dry\|wet" \
  El\ Frontend/src/composables/useCalibration.ts | head -40
```

**Erwartetes IST (Zeile 35) — [verify-plan KORRIGIERT]:**
```typescript
// ACHTUNG: Es gibt KEINEN separaten Typ "CalibrationSensorType".
// Der Typ ist inline am ref definiert:
const calibrationType = ref<'pH' | 'EC' | null>(null)
```

**Erwartetes IST (Zeile 100-130) — getCalibrationData() — [verify-plan KORRIGIERT]:**
```typescript
// Return-Typ ist Record<string, unknown>, NICHT CalibrationResult:
function getCalibrationData(): Record<string, unknown> | null {
  if (calibrationType.value === 'pH') {  // [Korrektur: calibrationType, nicht sensorType]
    return { type: 'linear_2point', slope: ..., offset: ..., point1_raw: ..., ... }
  }
  if (calibrationType.value === 'EC') {
    return { type: 'linear_2point', slope: ..., offset: ..., ... }
  }
  return null  // moisture faellt hier durch
}
```

**Wichtige Erkenntnis aus Erstanalyse:** Moisture braucht EINEN ANDEREN Return-Shape als pH/EC:
- pH/EC: `{ slope: number, offset: number }` (lineare Regression gegen Referenz-Standard)
- moisture: `{ dry_value: number, wet_value: number, invert?: boolean }` (direkte ADC-Rohwerte)

Eine einfache Type-Union-Erweiterung reicht NICHT. Es gibt zwei Loesungsansaetze:

### 3.2 — Entscheidung: Erweiterung oder eigenes Composable

**OPTION A: useCalibration.ts erweitern (empfohlen, weniger Scope-Creep)**

Voraussetzung: `getCalibrationData()` gibt eine Union zurueck, die beide Shapes unterstuetzt.

```typescript
// sensorDefaults.ts oder types/index.ts — neues Interface hinzufuegen:
export interface MoistureCalibrationData {
  dry_value: number    // ADC-Rohwert bei trockenem Sensor (typisch 2800-3200)
  wet_value: number    // ADC-Rohwert bei nassem Sensor (typisch 1200-1600)
  invert?: boolean     // false = hoher ADC = trocken (DFRobot Standard)
}

// types/index.ts oder useCalibration.ts:
export interface PhEcCalibrationData {
  slope: number
  offset: number
}

export type CalibrationData = PhEcCalibrationData | MoistureCalibrationData
```

**Erweiterung von useCalibration.ts:**

```typescript
// Zeile 35 — Inline-Type am ref erweitern [verify-plan KORRIGIERT]:
const calibrationType = ref<'pH' | 'EC' | 'moisture' | null>(null)

// Zeile 47 — startCalibration Signatur erweitern:
function startCalibration(type: 'pH' | 'EC' | 'moisture') {

// Zeile 100-130 — getCalibrationData() um moisture-Case erweitern [verify-plan KORRIGIERT]:
function getCalibrationData(): Record<string, unknown> | null {  // Record, NICHT CalibrationData
  if (calibrationType.value === 'pH') {  // calibrationType, nicht sensorType
    return { type: 'linear_2point', slope: ..., offset: ..., ... }
  }
  if (calibrationType.value === 'EC') {
    return { type: 'linear_2point', slope: ..., offset: ..., ... }
  }
  if (calibrationType.value === 'moisture') {
    // moisture hat ANDERE Felder als pH/EC:
    // ACHTUNG: dryValue/wetValue existieren noch NICHT als refs — muessen angelegt werden!
    return {
      type: 'moisture_2point',
      dry_value: dryValue.value,
      wet_value: wetValue.value,
      invert: false,
      calibrated_at: new Date().toISOString(),
    }
  }
  return null
}
```

**OPTION B: Eigenes `useMoistureCalibration.ts` Composable (sauberer, aber mehr Dateien)**

Neue Datei `El Frontend/src/composables/useMoistureCalibration.ts`:
```typescript
import { ref, computed } from 'vue'
import type { MoistureCalibrationData } from '@/types'

export function useMoistureCalibration() {
  const dryValue = ref<number>(3200)   // DFRobot Default-Trocken
  const wetValue = ref<number>(1500)   // DFRobot Default-Nass
  const invert = ref<boolean>(false)

  const calibrationData = computed<MoistureCalibrationData>(() => ({
    dry_value: dryValue.value,
    wet_value: wetValue.value,
    invert: invert.value,
  }))

  const isValid = computed<boolean>(() =>
    dryValue.value > wetValue.value &&  // Trocken-ADC muss hoeher sein als Nass-ADC
    dryValue.value > 0 &&
    wetValue.value > 0
  )

  return { dryValue, wetValue, invert, calibrationData, isValid }
}
```

**Empfehlung:** Option A wenn das bestehende CalibrationWizard.vue das `useCalibration`-Composable direkt importiert und der Umbau minimal ist. Option B wenn der Umbau groesser als 30min waere. Im Zweifel Option B nehmen — selbstaendige Composables sind einfacher zu testen.

### 3.3 — Bezug zur Server-Seite (moisture.py)

Server erwartet in `calibration_data` (DB-Feld, JSON):
```json
{
  "dry_value": 3200,
  "wet_value": 1500,
  "invert": false
}
```

Kalibrierungs-Endpoint: `El Servador/god_kaiser_server/src/api/sensor_processing.py:232-260` (POST /api/v1/sensors/calibrate)
[verify-plan: Endpoint-Route korrigiert. Body braucht SensorCalibrateRequest mit calibration_points[], NICHT nur dry_value/wet_value]

Das Frontend muss exakt diese Keys senden. Kein Mapping noetig wenn das Interface wie oben definiert wird.

**Kalibrierungs-Formel im Server (moisture.py:143-152):**
```python
moisture_percent = (raw_value - dry_value) / (wet_value - dry_value) * 100
# Defaults falls kein calibration_data: dry=3200, wet=1500
```

### 3.4 — CalibrationWizard-Integration pruefen

```bash
# Pruefe ob CalibrationWizard das moisture-Preset nutzt:
grep -n "moisture\|soil_moisture\|dry\|wet" El\ Frontend/src/components/calibration/CalibrationWizard.vue | head -20
# Erwartung: Zeilen 55-62 haben moisture-Preset (laut Erstanalyse)
```

**Falls CalibrationWizard.vue das useCalibration-Composable importiert:**
```bash
grep -n "useCalibration\|import" El\ Frontend/src/components/calibration/CalibrationWizard.vue | head -10
```

Wenn ja: Nach Option A oder B vorgehen und CalibrationWizard entsprechend anpassen.

Falls CalibrationWizard.vue eigenstaendig arbeitet und `getCalibrationData()` nicht aufruft: Block 3 ist FERTIG sobald das Interface/Composable definiert ist. DynamicForm-Route funktioniert bereits als Alternative.

### 3.5 — Akzeptanzkriterium Block 3

```bash
cd El\ Frontend && npm run build
# Erwartung: TypeScript-Fehler = 0
```

Manueller Test im Browser (nach Block 5 Integration-Test):
- Sensor-Settings oeffnen fuer einen moisture-Sensor
- Calibration-Wizard aufrufen
- Trocken-Wert eingeben, Nass-Wert eingeben
- "Kalibrieren" klicken → API-Call landet bei sensor_processing.py mit korrekten dry_value/wet_value

### 3.6 — Commit Block 3

```bash
git add El\ Frontend/src/composables/useCalibration.ts \
        El\ Frontend/src/composables/useMoistureCalibration.ts \  # falls Option B
        El\ Frontend/src/types/index.ts
git commit -m "feat: extend calibration composable for moisture sensor

moisture calibration uses dry_value/wet_value (ADC raw values) instead of
slope/offset (linear regression) — fundamentally different shape than pH/EC.

Option A: extended useCalibration.ts type union + new branch in getCalibrationData()
Option B: separate useMoistureCalibration.ts composable (preferred if > 30min refactor)

MoistureCalibrationData: { dry_value: number, wet_value: number, invert?: boolean }
Matches moisture.py calibrate() expected JSON structure exactly."
```

---

## Block 4: SoilMoistureConfig — Sensor-spezifische Darstellung (~1h)

**Prio: NIEDRIG fuer V1 — AddSensorModal funktioniert, aber Kalibrierungs-UX ist generisch**

Dieser Block ist OPTIONAL fuer den ersten funktionierenden Test. Er verbessert die UX, ist aber keine Voraussetzung fuer Block 5.

### 4.1 — IST-Zustand pruefen

```bash
# Gibt es bereits eine moisture-spezifische Config-Komponente?
find El\ Frontend/src/components -name "*[Mm]oisture*" -o -name "*[Ss]oil*" | grep -v node_modules
# Falls Ergebnis: vorhanden → pruefen und anpassen
# Falls kein Ergebnis: neu erstellen (optional, erst nach Block 5)
```

```bash
# SensorConfigPanel als Referenz-Implementierung ansehen:
ls El\ Frontend/src/components/esp/
grep -n "moisture\|soil\|pH\|EC" El\ Frontend/src/components/esp/AddSensorModal.vue | head -20
```

### 4.2 — Optionale SoilMoistureConfig-Erweiterung

Falls ein separates Config-Panel gewuenscht wird, basiert es auf dem SensorConfigPanel-Pattern. Minimal-Anforderungen:

**Pin-Auswahl:** Nur ADC1-Pins anzeigen (GPIO 32, 33, 34, 35, 36, 39). gpioConfig.ts:554 hat bereits die korrekte ADC1-Liste fuer `'soil_moisture'`.

**Kalibrierung:** Trocken/Nass-Rohwerte. Zwei Inputs mit Placeholder-Text:
- "Trocken-Wert (Luft, typisch 2800-3200)"
- "Nass-Wert (Wasser, typisch 1200-1600)"
- "Invert: Nein" (Checkbox, Default false)

**Live-Rohwert:** Falls WebSocket den aktuellen `raw`-Wert uebertraegt, diesen anzeigen — hilft beim Kalibrieren. Das `raw`-Feld ist im MQTT-Payload vorhanden (`"raw": 2143`).

**Farbkodierung (optional):** Bereichsfarben fuer Feuchtigkeits-Gauge:
```typescript
// Referenz: moisture.py Quality-Bewertung
const MOISTURE_COLORS = {
  critical_dry: { range: [0, 10], color: '#ef4444' },     // rot
  warning_dry: { range: [10, 20], color: '#f97316' },     // orange
  good: { range: [20, 80], color: '#22c55e' },            // gruen
  warning_wet: { range: [80, 95], color: '#f97316' },     // orange
  oversaturated: { range: [95, 100], color: '#ef4444' },  // rot
}
```

### 4.3 — SlideOver-Integration

AddSensorModal oeffnet via ESPSettingsSheet oder direktem Klick. Das SlideOver-Pattern ist in der Codebase standardisiert. Moisture-spezifische Felder koennen direkt in AddSensorModal als Conditional eingebaut werden (bevorzugt, kein neues File noetig):

```bash
# Wie sieht der Conditional-Block fuer Interface-Typ in AddSensorModal aus?
grep -n "ANALOG\|I2C\|interface_type\|inferInterface" El\ Frontend/src/components/esp/AddSensorModal.vue | head -20
```

Falls AddSensorModal bereits einen `ANALOG`-Branch hat: Dort moisture-spezifische Felder als weiteren Conditional hinzufuegen wenn `sensorType === 'moisture' || sensorType === 'soil_moisture'`.

### 4.4 — Commit Block 4

```bash
git add El\ Frontend/src/components/esp/AddSensorModal.vue  # oder neue Datei
git commit -m "feat: soil moisture sensor UX improvements

- ADC1-pin selection limited to GPIO 32/33/34/35/36/39
- dry_value/wet_value calibration inputs with typical range hints
- optional: moisture-specific color coding for quality ranges (0-10% red, 20-80% green)
- integrates with SlideOver pattern via AddSensorModal conditional branch"
```

---

## Block 5: Integration-Test E2E (~1h)

**Prio: HOCH — bestaetigt dass der gesamte Stack funktioniert**

### 5.1 — Voraussetzungen

```bash
# Docker-Stack muss laufen:
docker compose ps
# Erwartung: el-servador, mqtt-broker (mosquitto), postgres alle "healthy"

# Backend-Health pruefen:
# [verify-plan KORRIGIERT: Endpoint war /health, richtig ist /api/v1/health/live]
curl http://localhost:8000/api/v1/health/live
# Erwartung: {"status": "ok", ...}
```

### 5.2 — Server Integration-Test: soil_moisture via Mock-MQTT

```bash
# Neuen Integration-Test erstellen oder bestehenden pruefen:
find El\ Servador -name "test_moisture*" -o -name "*moisture*test*" | grep -v __pycache__
# Erwartung: god_kaiser_server/tests/unit/test_moisture_processor.py (31 Unit-Tests, VORHANDEN)
# Pruefen ob Integration-Test fehlt:
find El\ Servador -path "*/integration/*moisture*" | grep -v __pycache__
```

**Neuen Test erstellen** (falls Integration-Test fehlt):

Datei: `El Servador/god_kaiser_server/tests/integration/test_moisture_mqtt_flow.py`
[verify-plan KORRIGIERT: Pfad war El Servador/tests/integration/ — richtig ist El Servador/god_kaiser_server/tests/integration/]

```python
"""Integration test: moisture sensor MQTT -> processing -> DB"""
import pytest
import json

MQTT_PAYLOAD_MOISTURE = {
    "esp_id": "MOCK_TEST_ESP",
    "seq": 1,
    "gpio": 32,
    "sensor_type": "moisture",     # kanonischer Name
    "raw": 2143,
    "value": 2143.0,
    "unit": "raw",
    "quality": "good",
    "ts": 1700000000,
    "raw_mode": True
}

MQTT_PAYLOAD_SOIL_MOISTURE = {
    **MQTT_PAYLOAD_MOISTURE,
    "sensor_type": "soil_moisture",  # Alias — muss nach "moisture" normiert werden
    "seq": 2,
}

def test_moisture_normalize_sensor_type():
    """sensor_type_registry normalisiert 'soil_moisture' -> 'moisture'"""
    from god_kaiser_server.src.sensors.sensor_type_registry import normalize_sensor_type
    assert normalize_sensor_type("moisture") == "moisture"
    assert normalize_sensor_type("soil_moisture") == "moisture"  # Alias funktioniert nach Block 1.2

def test_moisture_processor_loaded_for_soil_moisture():
    """LibraryLoader findet MoistureSensorProcessor auch fuer 'soil_moisture'"""
    # [verify-plan KORRIGIERT: get_processor existiert NICHT in base_processor]
    # [Korrekt: LibraryLoader.get_processor() via library_loader]
    from god_kaiser_server.src.sensors.library_loader import LibraryLoader
    loader = LibraryLoader.get_instance()
    processor_moisture = loader.get_processor("moisture")
    processor_soil = loader.get_processor("soil_moisture")
    assert processor_moisture is not None
    assert processor_soil is not None
    assert type(processor_moisture) == type(processor_soil)  # gleiche Klasse

def test_moisture_processing_default_calibration():
    """moisture.py rechnet ADC 2143 mit Default-Kalibrierung korrekt um"""
    from god_kaiser_server.src.sensors.sensor_libraries.active.moisture import MoistureSensorProcessor
    processor = MoistureSensorProcessor()
    # Default: dry=3200, wet=1500
    # Formel: (2143 - 3200) / (1500 - 3200) * 100 = (-1057) / (-1700) * 100 = ~62.2%
    # [verify-plan KORRIGIERT: Parameter heisst 'calibration' NICHT 'calibration_data']
    # Signatur: process(self, raw_value, calibration=None, params=None)
    result = processor.process(raw_value=2143, calibration=None)
    assert result is not None
    assert 55 <= result.value <= 70  # Erwartung: ~62%  [ProcessingResult hat .value Attribut]
    assert result.unit == '%'
    assert result.quality in ('good', 'fair')

def test_moisture_processing_custom_calibration():
    """moisture.py nutzt dry_value/wet_value aus calibration"""
    from god_kaiser_server.src.sensors.sensor_libraries.active.moisture import MoistureSensorProcessor
    processor = MoistureSensorProcessor()
    calibration = {"dry_value": 2800, "wet_value": 1300}
    # [verify-plan KORRIGIERT: 'invert' gehoert in params, NICHT calibration]
    result = processor.process(raw_value=2050, calibration=calibration)
    # Formel: (2050 - 2800) / (1300 - 2800) * 100 = (-750) / (-1500) * 100 = 50%
    assert result is not None
    assert 45 <= result.value <= 55

# IM REPO PRUEFEN: Wie werden MQTT-Messages in Integration-Tests simuliert?
# Referenz: bestehende Integration-Tests (z.B. für SHT31, pH, EC) anschauen
# grep -rn "mqtt\|publish\|handler" El\ Servador/tests/integration/ | head -20
```

```bash
# Tests ausfuehren:
# [verify-plan KORRIGIERT: Pfade innerhalb god_kaiser_server/]
cd El\ Servador && python -m pytest god_kaiser_server/tests/unit/test_moisture_processor.py \
  god_kaiser_server/tests/integration/test_moisture_mqtt_flow.py -v
# Erwartung: Alle Tests grueen
```

### 5.3 — Manueller E2E-Test via MQTT-Inject

```bash
# MQTT-Message mit 'moisture' senden (kanonischer Name):
# [verify-plan KORRIGIERT: Topic-Pattern war falsch. Richtig: kaiser/god/esp/{esp_id}/sensor/{gpio}/data]
mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_0954B2B1/sensor/32/data" \
  -m '{"esp_id":"MOCK_0954B2B1","seq":1,"gpio":32,"sensor_type":"moisture","raw":2143,"value":2143.0,"unit":"raw","quality":"good","ts":1700000000,"raw_mode":true}'

# Warten (3 Sekunden) dann DB pruefen:
sleep 3
psql -h localhost -U god_kaiser -d god_kaiser_db -c \
  "SELECT sensor_type, value, unit, quality, created_at FROM sensor_data WHERE sensor_type='moisture' ORDER BY created_at DESC LIMIT 3;"
```

**Erwartete DB-Eintraege:**
```
sensor_type | value | unit | quality  | created_at
------------+-------+------+----------+---------------------------
moisture    | 62.2  | %    | good     | 2026-02-27 ...
```

```bash
# MQTT-Message mit 'soil_moisture' senden (Alias-Test nach Block 1):
# [verify-plan KORRIGIERT: Topic-Pattern war falsch]
mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_0954B2B1/sensor/32/data" \
  -m '{"esp_id":"MOCK_0954B2B1","seq":2,"gpio":32,"sensor_type":"soil_moisture","raw":1800,"value":1800.0,"unit":"raw","quality":"good","ts":1700000001,"raw_mode":true}'

# DB pruefen — sensor_type muss 'moisture' sein (normalisiert):
sleep 3
psql -h localhost -U god_kaiser -d god_kaiser_db -c \
  "SELECT sensor_type, value, unit, quality FROM sensor_data WHERE seq=2 AND esp_id='MOCK_0954B2B1';"
# Erwartung: sensor_type='moisture', value~=82.4% (nass)
```

### 5.4 — Frontend-Verifikation

```bash
# Browser oeffnen: http://localhost:5173
# Navigieren zu: HardwareView > MOCK_0954B2B1 > Sensor "moisture"
# Erwartung:
# - Gauge zeigt Prozentwert (~62%)
# - Unit: "%"
# - Icon: Droplets
# - Label: "Bodenfeuchte"
# - Quality-Badge: "good"
```

```bash
# WebSocket pruefen (DevTools > Network > WS):
# Erwartete Message nach MQTT-Publish:
# {"type": "sensor_data", "esp_id": "MOCK_0954B2B1", "sensor_type": "moisture", "value": 62.2, ...}
```

### 5.5 — Kalibrierungs-Test

```bash
# Kalibrierung setzen via API:
# [verify-plan KORRIGIERT: Endpoint ist POST /api/v1/sensors/calibrate (NICHT /sensors/{esp_id}/{gpio}/calibrate)]
# [verify-plan KORRIGIERT: Body braucht esp_id, gpio, sensor_type, calibration_points — NICHT nur dry_value/wet_value]
# SensorCalibrateRequest-Schema: esp_id + gpio + sensor_type + calibration_points[]
# IM REPO PRUEFEN: Exaktes CalibrationPoint-Schema in El Servador/god_kaiser_server/src/api/schemas.py:197+
curl -X POST http://localhost:8000/api/v1/sensors/calibrate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"esp_id": "MOCK_0954B2B1", "gpio": 32, "sensor_type": "moisture", "calibration_points": [{"raw_value": 2800, "reference_value": 0}, {"raw_value": 1300, "reference_value": 100}]}'
# Erwartung: 200 OK

# Neue MQTT-Message senden und pruefen ob neue calibration_data genutzt wird:
mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_0954B2B1/sensor/32/data" \
  -m '{"esp_id":"MOCK_0954B2B1","seq":3,"gpio":32,"sensor_type":"moisture","raw":2050,"value":2050.0,"unit":"raw","quality":"good","ts":1700000002,"raw_mode":true}'

sleep 3
psql -h localhost -U god_kaiser -d god_kaiser_db -c \
  "SELECT value FROM sensor_data WHERE seq=3 AND esp_id='MOCK_0954B2B1';"
# Erwartung: ~50% (mit dry=2800/wet=1300: (2050-2800)/(1300-2800)*100 = 50%)
```

### 5.6 — Commit Block 5

```bash
# [verify-plan KORRIGIERT: Pfad war El Servador/tests/ — richtig ist El Servador/god_kaiser_server/tests/]
git add El\ Servador/god_kaiser_server/tests/integration/test_moisture_mqtt_flow.py
git commit -m "test: integration tests for moisture sensor mqtt flow

- normalize_sensor_type: 'soil_moisture' -> 'moisture' (alias test)
- LibraryLoader: MoistureSensorProcessor found for both keys
- processing with default calibration: ADC 2143 -> ~62%
- processing with custom calibration: dry_value/wet_value from calibration_data

Covers the full path: MQTT payload -> sensor_type_registry -> moisture.py -> DB"
```

---

## Akzeptanzkriterien (gesamt)

| Block | Akzeptanzkriterium | Verifizierungsbefehl |
|-------|-------------------|---------------------|
| **0** | Arduino-ESP32-Version bekannt | `grep platform platformio.ini` |
| **1.1** | `soil_moisture` in sensor_registry.cpp | `grep -c "soil_moisture" .../sensor_registry.cpp` → `1` |
| **1.2** | `normalize_sensor_type("soil_moisture")` → `"moisture"` | pytest test_moisture_processor.py |
| **1.3** | `SENSOR_TYPE_CONFIG['soil_moisture']` kein Fallback mehr | npm run build + Vitest |
| **2** | `readRawAnalog()` setzt Attenuation explizit | `grep -rn "ADC_ATTEN_DB_11" .../sensor_manager.cpp` → `1` |
| **3** | CalibrationWizard kann moisture-Kalibrierung speichern | npm run build + manueller Browser-Test |
| **4** | AddSensorModal zeigt nur ADC1-Pins (32-39) fuer moisture | Manuell im Browser |
| **5** | MQTT `sensor_type=soil_moisture` landet als `moisture` in DB | mosquitto_pub + DB-Query |
| **5** | ADC 2143 → ~62% mit Default-Kalibrierung | DB-Wert nach MQTT-Inject |
| **5** | Frontend-Gauge zeigt Prozent, Label "Bodenfeuchte" | Browser-Check |

---

## Reihenfolge und Commit-Strategie

```
Schritt 0: platformio.ini pruefen (5min, kein Commit)
    ↓
Block 1: Naming-Aliase (3 Dateien, 3 Einzeiler, 30min) → 1 Commit
    ↓
Block 2: ADC-Attenuation (1 Zeile, 15-30min) → 1 Commit
    ↓
Block 3: useCalibration erweitern (1-2h) → 1 Commit
    ↓
Block 4: SoilMoistureConfig UX (optional, 1h) → 1 Commit
    ↓
Block 5: Integration-Test + E2E-Verifikation (1h) → 1 Commit
```

Jeder Block ist unabhaengig commitbar und testbar. Block 1 und Block 2 sind selbst-contained und koennen bei Bedarf in einem einzigen PR zusammengefasst werden.

---

## Bekannte Einschraenkungen (was dieser Auftrag NICHT abdeckt)

Diese Features sind dokumentiert und fuer V2 vorgesehen:

| Feature | Status | Begruendung |
|---------|--------|-------------|
| **Temperaturkompensation** | V2 | Benoetigt Cross-Sensor-Logic auf Server (moisture.py + DS18B20/SHT31 in einer Pipeline). Aufwand ~4h. Drift: ~1-3% Feuchte pro 10°C |
| **Polynomial-Kalibrierung** | V2 | 3+ Kalibrierungspunkte statt 2-Punkt. R²=0.92-0.98 statt 0.85-0.87. moisture.py erweiterbar |
| **Substrat-Profile** | V2 | soil_type-Parameter in calibration_data: Erde/Kokos/Perlit/Steinwolle. Verschiedene Kalibrierungskurven |
| **ESP-seitiger Median-Filter** | V2-Optional | Median(5) in readRawAnalog(): ~1ms Overhead, eliminiert ADC-Rauschen. Wissenschaftlich validiert: R²=0.918-0.983 auch OHNE ESP-Filter |
| **EC/pH-Querverweise** | V2 | EC beeinflusst moisture-Messung bei hoher Salzkonzentration (>2000 µS/cm) |
| **Multi-Sensor-Support** | V2 | Mehrere moisture-Sensoren am selben ESP auf verschiedenen GPIO-Pins (GPIO 32, 33, 34...). Technisch moeglich, nicht explizit getestet |
| **Outdoor/IP65-Sensor** | V2 | DFRobot SEN0308 (IP65, 1.5m Kabel). Gleiche Schnittstelle, aber andere Kalibrierungswerte |
| **Langzeit-Drift-Kompensation** | V2 | <0.5% RH-Drift/Jahr (vergleichbar SHT31). Jaehrliche Re-Kalibrierung empfohlen |
| **Wokwi-Simulation** | V2 | Wokwi-Szenario fuer moisture-Sensor fehlt. Kein ADC-Wert-Mockup vorhanden |

---

## Referenz-Dateien (alle verifiziert, 2026-02-27)

### Firmware (El Trabajante)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| `El Trabajante/src/models/sensor_registry.cpp` | 125-131, 179 | MOISTURE_CAP + SENSOR_TYPE_MAP (Alias fehlt) |
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | 1279-1289 | readRawAnalog(uint8_t) → uint32_t — kein analogSetPinAttenuation [verify-plan: Signatur korrigiert] |
| `El Trabajante/src/drivers/hal/esp32_gpio_hal.h` | 104-105 | analogRead HAL-Wrapper |
| `El Trabajante/src/config/hardware/esp32_dev.h` | 47, 101 | SAFE_GPIO_PINS, ADC2-Kommentar, ADC_MAX_VALUE=4095 |
| `El Trabajante/platformio.ini` | — | Arduino-ESP32-Version (Schritt 0 pruefen!) |

### Backend (El Servador)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py` | 36-430 | MoistureSensorProcessor — VOLLSTAENDIG (31 Tests) |
| `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` | 64 | Alias `"soil_moisture"` fehlt → 1 Zeile Fix |
| `El Servador/god_kaiser_server/src/api/sensor_processing.py` | 232-390 | Calibration-Endpoint (vorhanden) |
| `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` | 84, 229, 769 | Physikalische Limits, raw_mode, calibration_data |
| `El Servador/god_kaiser_server/src/schemas/sensor.py` | 48, 135-139, 161-164 | Schema + Validierung |
| `El Servador/god_kaiser_server/src/services/gpio_validation_service.py` | 78-90, 120 | ADC1_SAFE_PINS = {32,33,34,35,36,39} |
| `El Servador/god_kaiser_server/src/db/models/sensor.py` | 144-148 | calibration_data JSON-Feld |
| `El Servador/god_kaiser_server/src/utils/sensor_formatters.py` | 36, 64, 83 | Server kennt "soil_moisture" als Display-Name (teilweise) |
| `El Servador/tests/unit/test_moisture_processor.py` | 1-253 | 31 Unit-Tests (vorhanden, laufen) |

### Frontend (El Frontend)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| `El Frontend/src/utils/sensorDefaults.ts` | 388 | `'moisture'` Eintrag (Alias fehlt) |
| `El Frontend/src/composables/useCalibration.ts` | 35, 103-129 | NUR pH/EC — moisture fehlt |
| `El Frontend/src/components/esp/AddSensorModal.vue` | — | Analog-Flow vorhanden |
| `El Frontend/src/utils/gpioConfig.ts` | 553-554 | `'soil_moisture': [32,33,34,35,36,39]` (ADC1 korrekt) |
| `El Frontend/src/utils/eventTransformer.ts` | 50 | `'soil_moisture'` → `'Bodenfeuchte'` (vorhanden) |
| `El Frontend/src/config/sensor-schemas.ts` | 387-432 | `soil_moisture` mit dry_value/wet_value (vorhanden) | [verify-plan: Pfad korrigiert von utils/ zu config/]
| `El Frontend/src/components/calibration/CalibrationWizard.vue` | 55-62 | moisture-Preset Trocken/Nass (vorhanden) | [verify-plan: Pfad korrigiert, Unterordner calibration/]

---

## Wissenschaftliche Basis (5 Papers)

Diese Papers begruenden die Implementierungsentscheidungen:

| Paper | Key Finding fuer Implementierung |
|-------|----------------------------------|
| **Abdelmoneim et al. (Sensors 2025, 25(2):343)** | Lineare 2-Punkt-Kalibrierung (moisture.py) reicht fuer V1 (R²=0.85-0.87). RMSE=4.5-4.9% — ausreichend fuer Bewaesserungssteuerung |
| **Hidayat et al. (Sensors 2024, 24(24):8156)** | Polynomiale Kalibrierung (+0.06 R²) ist V2-Feature. Auch ohne ESP-seitigen Filter: R²=0.918-0.983 mit server-seitiger Kalibrierung |
| **Guemueser et al. (Sensors 2025, 25(5):1461)** | DFRobot SEN0193 R²=0.94 fuer organisches Substrat. Substrat-Profile sind wichtig (V2). In feingesiebten Substraten: R²=0.75 |
| **Bogena et al. (Sensors 2023, 23(5):2451)** | 3.3V-Betrieb liefert R²=0.871 vs 0.798 bei 5V — ESP32 3.3V ist OPTIMAL. Individuelle Kalibrierung PFLICHT (Sensor-zu-Sensor-Variation ±500 ADC) |
| **Espressif Arduino-ESP32 Docs (v2.x+)** | ADC_ATTEN_DB_11 ist Default ab v2.x — kein expliziter Aufruf noetig, aber empfohlen fuer Selbst-Dokumentation |

Vollstaendige Referenz: `wissen/iot-automation/kapazitiver-bodenfeuchtesensor-esp32-integration.md` (19 Quellen)

---

## Zugehoerige Dokumente (Life-Repo)

| Dokument | Inhalt |
|----------|--------|
| `arbeitsbereiche/automation-one/auftrag-erstanalyse-bodenfeuchtesensor.md` | 8-teilige Erstanalyse mit verify-plan (Grundlage dieses Auftrags) |
| `wissen/iot-automation/kapazitiver-bodenfeuchtesensor-esp32-integration.md` | Vollstaendige technische Referenz (19 Quellen, 2026-02-27) |
| `wissen/iot-automation/esp32-sensor-hardware-referenz.md` | GPIO-Plan, ADC-Regeln, alle 9 Sensortypen |
| `wissen/iot-automation/esp32-sensor-kalibrierung-ph-ec.md` | pH/EC-Kalibrierung als Referenz-Implementierung |
| `arbeitsbereiche/automation-one/auftrag-device-sensor-lifecycle-fix.md` | SHT31-Fix — Referenz fuer Block-Struktur und Commit-Pattern |
