# Auftrag T08-Fix2: Display-Konsistenz — MiniCard-Namen, SHT31 Info-Text, GPIO-Anzeige, Mock-Defaults

> **Bezug:** T02-T08 Verifikationsbericht (NB5, NB11, NB12) + UX-Audit-Erkenntnisse
> **Prioritaet:** NIEDRIG — Visuelle Inkonsistenzen und irrefuehrende Labels, kein Datenverlust
> **Bereich:** El Frontend (Vue 3 + TypeScript) + El Servador (FastAPI/Python, minimal)
> **Datum:** 2026-03-07
> **Voraussetzung:** T08-Fix1 muss ZUERST umgesetzt werden (Fix1 aendert die Datenstruktur, Fix2 liest daraus)

---

## Kontext und Design-Prinzipien

AutomationOne hat 3 Schichten:
- **El Trabajante** (ESP32 Firmware) — Sensoren auslesen, Aktoren schalten
- **El Servador** (FastAPI/Python Backend) — Zentrale Verarbeitung, PostgreSQL, MQTT
- **El Frontend** (Vue 3 + TypeScript Dashboard) — Visualisierung, Konfiguration

Die HardwareView zeigt Devices in einem **3-Level-Zoom**: L1 (Zone-Uebersicht mit Zone-Tiles und DeviceMiniCards), L2 (Orbital Device-Detail mit Sensor/Aktuator-Satellites), L3 (Modals/SlideOver). Der MonitorView zeigt Live-Sensordaten in SensorCards mit Sparklines.

**5-Sekunden-Regel:** Das Dashboard muss innerhalb von 5 Sekunden beantworten ob alles in Ordnung ist. Inkonsistente Sensor-Namen zwischen Views verletzen das — der Nutzer fragt sich "Ist 'Temperatur' auf L1 dasselbe wie 'Klima Boden' auf L2?" und muss unnoetig nachdenken. Jede zusaetzliche kognitive Last erhoehe die Fehlerquote bei zeitkritischen Entscheidungen.

**Konsistenz-Prinzip (aus fuehrenden IoT-Plattformen abgeleitet):** Gleiche Daten muessen ueberall gleich dargestellt werden. Home Assistant, ThingsBoard und Grafana nutzen alle den **user-definierten Custom-Namen** als primaere Anzeige und den technischen Typ nur als Fallback oder Tooltip. Wenn ein Sensor "Klima Boden" heisst, muss er ueberall "Klima Boden" heissen — auf L1, L2, im Monitor, in Logs und in der API-Response.

**Information on Demand:** Sensor-Namen muessen auf den ERSTEN Blick erkennbar sein. Tooltips sind ein Fallback fuer besonders lange Namen, nicht der primaere Weg. Der Aktuator-Satellite im Orbital zeigt bereits den vollen Namen — Sensoren muessen gleich behandelt werden (Konsistenz innerhalb derselben Komponente).

**Reaktive Formulare:** Informationstexte in Konfigurationsdialogen muessen IMMER den aktuellen Formular-Zustand widerspiegeln. Ein statischer Info-Text der die aktuelle Auswahl ignoriert vermittelt dem Nutzer ein falsches Sicherheitsgefuehl (er denkt, die Einstellung wurde bernommen, obwohl der Text sich nicht aktualisiert hat).

**GPIO-0-Regel:** GPIO 0 ist ein ESP32 Strapping Pin, der beim Booten den Flash-Modus beeinflusst und NIEMALS als Sensor-Pin konfiguriert werden darf. I2C-Sensoren (SHT31, BMP280, BME280) kommunizieren ueber den gemeinsamen I2C-Bus (SDA=GPIO 21, SCL=GPIO 22) — sie haben keinen eigenen dedizierten GPIO. Im System wird `gpio=0` als Platzhalter fuer I2C-Sensoren gespeichert. Das ist technisch vertretbar, aber im UI **irrefuehrend**: Ein unerfahrener Nutzer koennte denken, der Sensor haenge an GPIO 0 — dem gefaehrlichen Strapping Pin.

**Plausible Mock-Defaults:** Wenn Mock-Sensoren mit 0.0 starten, verlieren sie ihren Trainings-Nutzen. Der Nutzer kann nicht sehen wie ein korrekter Sensor-Zustand aussieht, welche Schwellwerte sinnvoll sind, oder ob Kalibrierung noetig waere. Realistische Startwerte machen Mock-Devices sofort nutzbar als Orientierungshilfe.

**Multi-Value-Sensoren im Display:** Ein physischer Multi-Value-Sensor (SHT31, BMP280, BME280) erzeugt nach Fix1-C mehrere logische `sensor_configs` in der DB. Ein SHT31 wird zu `sht31_temp` + `sht31_humidity` (2 Eintraege), ein BMP280 zu `bmp280_temp` + `bmp280_pressure` (2 Eintraege), ein BME280 zu `bme280_temp` + `bme280_humidity` + `bme280_pressure` (3 Eintraege). Jeder logische Sensor ist ein eigenstaendiger Datensatz mit eigenem Namen, eigener Unit und eigener DB-ID. Im Display muss jeder Sub-Sensor als **separate Zeile/Satellite/Card** erscheinen — auf der MiniCard (L1), im Orbital (L2) und im Monitor. Die I2C-Adresse ist fuer alle Sub-Sensoren eines physischen Sensors identisch (z.B. beide SHT31-Werte auf 0x44). Die Unterscheidung erfolgt ueber den **Namen** (z.B. "Klima Decke Temperature" vs. "Klima Decke Humidity") und den **sensor_type** (`sht31_temp` vs. `sht31_humidity`), nicht ueber die Adresse.

Nach T08-Fix1 (Sensor-Config-Pipeline) sind die Daten korrekt in der DB. Dieser Auftrag stellt sicher, dass die **Anzeige** ueberall konsistent ist und keine irrefuehrenden Labels gezeigt werden.

---

## Fix L1: MiniCard zeigt Base-Type statt Custom-Name (NB12) — NIEDRIG

### IST (Screenshot S16 aus T02-T08 Verifikationsbericht)

Die DeviceMiniCard auf L1 zeigt fuer den SHT31 den **Base-Type** "Temperatur" statt den konfigurierten Custom-Namen "Klima Decke":

```
┌─ Mock #64E9 ──────────────────┐
│  ● Online           [MOCK]     │
│  Temp 9ABC        0 °C         │  ← DS18B20: auto-name (NB7 behebt das in Fix1-F)
│  Temperatur       19.2 °C      │  ← SHT31: zeigt "Temperatur" statt "Klima Decke"
└────────────────────────────────┘
```

Zum Vergleich: Das Orbital (L2) zeigt denselben Sensor korrekt als "Klima Decke" (Screenshot S15). Der Monitor zeigt je nach Datenquelle (simulation_config vs. sensor_configs) ebenfalls inkonsistente Namen — dieses Problem wird durch T08-Fix1-B (Dual-Storage-Sync) behoben, aber die MiniCard muss ausserdem auf den richtigen Feldnamen zugreifen.

**Root Cause (aus Verifikationsbericht):** MiniCard nutzt `sensor_type` (den technischen Bezeichner wie "sht31" oder "temperature") anstelle des `name`-Feldes aus der Sensor-Konfiguration.

**Multi-Value-Konsequenz:** Nach Fix1-C erzeugt ein einzelner SHT31 **zwei** logische Sensor-Eintraege (`sht31_temp` + `sht31_humidity`) in der DB, ein BME280 sogar **drei** (`bme280_temp` + `bme280_humidity` + `bme280_pressure`). Die MiniCard muss ALLE Sub-Sensoren als separate Zeilen mit ihren jeweiligen Custom-Namen anzeigen. Der Screenshot S16 zeigt nur eine SHT31-Zeile — das liegt daran, dass Fix1-C dort noch nicht angewendet war. Nach Fix1 erscheinen zwei (bzw. drei) Zeilen pro Multi-Value-Sensor, die aber ohne Fix2 noch die technischen Base-Types statt der Custom-Namen anzeigen wuerden.

### SOLL

Die DeviceMiniCard muss den `name`-Wert aus der Sensor-Konfiguration anzeigen, nicht den `sensor_type`. Nach Fix1-C erzeugt ein Multi-Value-Sensor (z.B. SHT31) **mehrere logische Eintraege** — jeder erscheint als eigene Zeile auf der MiniCard:

```
┌─ Mock #64E9 ─────────────────────────┐
│  ● Online                    [MOCK]   │
│  Wassertemp B.1        24.5 °C        │  ← DS18B20: User-Name (nach Fix1-F)
│  Klima Decke Temp.     19.2 °C        │  ← sht31_temp: Custom-Name aus Fix1-C expand_multi_value()
│  Klima Decke Feuchte   55.0 %RH       │  ← sht31_humidity: Custom-Name aus Fix1-C expand_multi_value()
└───────────────────────────────────────┘
```

**Namensgebung bei Multi-Value-Sensoren:** Fix1-C generiert Sub-Sensor-Namen ueber `expand_multi_value()` nach dem Schema `"{user_name} {measurement}"`. Wenn der User "Klima Decke" eingibt, entstehen z.B. "Klima Decke Temperature" und "Klima Decke Humidity" als `name`-Feld in der DB. Die MiniCard zeigt diesen vollen Namen an — die `displayName()`-Funktion greift nur auf das `name`-Feld zu, das bereits den Sub-Sensor-Suffix enthaelt. Es wird kein zusaetzlicher Split oder Suffix in Fix2 benoetigt.

**Fallback-Reihenfolge:**
1. `sensor.name` — wenn vorhanden und nicht leer: anzeigen (z.B. "Klima Decke")
2. Fallback auf formatierten `sensor_type` mit Gross-Anfangsbuchstabe (z.B. "sht31_temp" → "Sht31 Temp") — wenn kein Name gesetzt
3. KEIN raw `sensor_type` ohne Formatierung zeigen (z.B. nie "sht31_temp" direkt)

### Wo aendern

**DeviceMiniCard.vue** — Die Komponente die auf L1 in der Zone-Tile die Sensorwerte als Liste zeigt.

Suchen nach der Stelle wo `sensor_type` oder ein aehnliches Feld fuer den Label-Text genutzt wird. Ersetzen durch:

```typescript
// Hilfsfunktion (kann als Composable oder inline computed definiert werden)
const displayName = (sensor: SensorConfig): string => {
  if (sensor.name && sensor.name.trim().length > 0) {
    return sensor.name
  }
  // Fallback: sensor_type formatieren (z.B. "sht31_temp" → "Sht31 Temp")
  return sensor.sensor_type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
```

**Datenquelle pruefen:** Die MiniCard liest vermutlich aus `device.sensors` (aus dem espStore). Nach T08-Fix1-B sind simulation_config und sensor_configs synchron — der `name`-Wert ist in beiden Quellen identisch. Pruefen aus welcher Quelle die MiniCard laedt und sicherstellen dass das `name`-Feld enthalten ist.

**Kein text-transform: uppercase:** Die Namen sollen in normaler Gross-/Kleinschreibung angezeigt werden (wie vom Nutzer eingegeben). CSS `text-transform: uppercase` oder `text-transform: lowercase` duerfen nicht auf den Namen-Text angewendet werden — das wuerde z.B. "Klima Decke" zu "KLIMA DECKE" verfremden.

**Platzbedarf:** Falls der Custom-Name laenger ist als der bisherige Base-Type, muss der Text sauber gekuerzt werden (`text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`). Ein `title`-Attribut mit dem vollen Namen erlaubt den Nutzer per Tooltip den vollen Text zu lesen.

### Validierung

```
1. SHT31 mit Custom-Name "Klima Decke" konfigurieren (via AddSensorModal)
2. L1 MiniCard zeigt "Klima Decke" (nicht "Temperatur" oder "sht31")
3. L2 Orbital zeigt "Klima Decke"
4. Monitor zeigt "Klima Decke"
5. Alle 3 Views zeigen IDENTISCHEN Namen
6. DS18B20 ohne Custom-Name zeigt "Ds18b20" (formatierter Fallback), nicht "ds18b20" (raw)
7. Langer Name (>20 Zeichen): Ellipsis sichtbar, Tooltip mit vollem Namen bei Hover
8. SHT31 "Klima Decke" hinzufuegen → MiniCard zeigt ZWEI Zeilen (Temp + Humidity), nicht eine
9. BME280 hinzufuegen → MiniCard zeigt DREI Zeilen (Temp + Humidity + Pressure)
10. Zwei SHT31 (0x44 + 0x45) → MiniCard zeigt VIER Zeilen (je 2 pro physischem Sensor)
```

---

## Fix L2: SHT31 Info-Text reagiert nicht auf I2C-Adress-Aenderung (NB11) — NIEDRIG

### IST (Screenshot S14)

Im AddSensorModal zeigt der Info-Text beim SHT31:
```
ℹ SHT31, auf I2C 0x44, misst Temperatur + Luftfeuchte, alle 30s
```

Dieser Text ist **statisch** — er aendert sich NICHT wenn der User die I2C-Adresse von "0x44 (Standard)" auf "0x45 (ADDR HIGH)" wechselt. Der Info-Text zeigt weiterhin "I2C 0x44", obwohl der User 0x45 ausgewaehlt hat.

**Warum das ein Problem ist:** Der Info-Banner soll dem Nutzer bestaetigen was er gerade konfiguriert. Wenn er sagt "0x44", obwohl 0x45 gewaehlt ist, vermittelt er ein falsches Sicherheitsgefuehl. Der Nutzer koennte denken, der Text sei die tatsaechliche Einstellung und nicht sein Dropdown. Das ist besonders problematisch wenn 2 SHT31 auf demselben Device konfiguriert werden (0x44 + 0x45) — der Nutzer muss die Adresse korrekt unterscheiden koennen.

### SOLL

Der Info-Text muss **reaktiv** auf die I2C-Adress-Auswahl reagieren:

```
Wenn I2C-Dropdown = 0x44: "SHT31, auf I2C 0x44, misst Temperatur + Luftfeuchte, alle 30s"
Wenn I2C-Dropdown = 0x45: "SHT31, auf I2C 0x45, misst Temperatur + Luftfeuchte, alle 30s"
```

Erweiterung auf weitere reaktive Felder falls vorhanden (z.B. Messintervall):
```
"SHT31, auf I2C 0x45, misst Temperatur + Luftfeuchte, alle 60s"  ← wenn Intervall 60s
```

### Wo aendern

**AddSensorModal.vue** — Der Info-Text (das blaue ℹ-Banner unter dem Sensor-Typ-Dropdown).

Der Text ist vermutlich ein statischer String pro Sensor-Typ. Aendern zu einem `computed` das die aktuell ausgewaehlten Werte einbezieht:

```vue
<template>
  <div class="info-banner" role="status" aria-live="polite">
    {{ sensorTypeInfo }}
  </div>
</template>

<script setup lang="ts">
// selectedType: ref<string> — z.B. 'sht31', 'ds18b20', etc.
// selectedI2CAddress: ref<string> — z.B. '0x44', '0x45'
// selectedInterval: ref<number> — z.B. 30 (Sekunden)

const sensorTypeInfo = computed((): string => {
  if (!selectedType.value) return ''

  if (selectedType.value === 'sht31') {
    const addr = selectedI2CAddress.value || '0x44'
    const interval = selectedInterval.value || 30
    return `SHT31, auf I2C ${addr}, misst Temperatur + Luftfeuchte (erstellt 2 Sensor-Eintraege), alle ${interval}s`
  }

  if (selectedType.value === 'bmp280') {
    const addr = selectedI2CAddress.value || '0x76'
    return `BMP280, auf I2C ${addr}, misst Temperatur + Luftdruck (erstellt 2 Sensor-Eintraege)`
  }

  if (selectedType.value === 'bme280') {
    const addr = selectedI2CAddress.value || '0x76'
    return `BME280, auf I2C ${addr}, misst Temperatur + Luftfeuchte + Luftdruck (erstellt 3 Sensor-Eintraege)`
  }

  if (selectedType.value === 'ds18b20') {
    return `DS18B20, auf OneWire (GPIO ${selectedGpio.value || 4}), misst Temperatur`
  }

  // Generischer Fallback fuer andere Sensor-Typen
  return `${selectedType.value}, misst ${getSensorMeasurementLabel(selectedType.value)}`
})
</script>
```

**ARIA-Hinweis:** Das Info-Banner bekommt `role="status"` und `aria-live="polite"`. Damit liest ein Screen Reader die Aenderung automatisch vor wenn der Nutzer die I2C-Adresse wechselt — ohne den Fokus zu unterbrechen.

**Komponentenvariablen pruefen:** Die Variablennamen (`selectedType`, `selectedI2CAddress`, `selectedInterval`) muessen mit den tatsaechlichen ref-Namen im AddSensorModal.vue abgeglichen werden. Die Logik ist identisch, nur die Namen koennen abweichen.

### Validierung

```
1. AddSensorModal oeffnen, SHT31 auswaehlen
2. Info-Text zeigt "I2C 0x44"
3. I2C-Adresse auf 0x45 wechseln
4. Info-Text aktualisiert sich SOFORT zu "I2C 0x45" (kein Reload noetig)
5. BMP280 auswaehlen: Info-Text zeigt "BMP280, auf I2C 0x76, ... (erstellt 2 Sensor-Eintraege)"
6. BME280 auswaehlen: Info-Text zeigt "...(erstellt 3 Sensor-Eintraege)" — User weiss VORHER dass 3 Eintraege entstehen
7. DS18B20 auswaehlen: Info-Text zeigt "DS18B20, auf OneWire (GPIO 4)" — kein Multi-Value-Hinweis (1 Eintrag)
8. Screen Reader (oder aria-live Tester): Aenderung wird angesagt
```

---

## Fix L3: I2C-Sensor GPIO-Anzeige im Orbital (NB-Beobachtung) — NIEDRIG

### IST (Screenshot S13)

Der SHT31 Sensor-Satellite im Orbital (HardwareView L2) zeigt "GPIO 0". Der SHT31 ist ein I2C-Sensor — er haengt am I2C-Bus (SDA=GPIO 21, SCL=GPIO 22), nicht an einem eigenen GPIO. `gpio=0` ist der Platzhalter-Wert fuer I2C-Sensoren in der DB (weil kein dedizierter GPIO benoetigt wird — die Kommunikation laeuft ueber den Bus, identifiziert durch die I2C-Adresse).

Das ist technisch nicht falsch, aber **aktiv irrefuehrend**: GPIO 0 ist ein ESP32 Strapping Pin und darf nie als Sensor-Pin konfiguriert werden. Ein Nutzer oder Techniker, der das Dashboard sieht, koennte:
- Denken, der Sensor haengt physisch an GPIO 0 und den Pin falsch verdrahten
- Eine Fehlerdiagnose einleiten weil "GPIO 0 sollte nicht genutzt werden"
- Zwei I2C-Sensoren gleichen Typs nicht unterscheiden koennen (beide zeigen "GPIO 0")

### SOLL

Fuer I2C-Sensoren: Die I2C-Adresse als primaeren Identifier anzeigen, nicht den GPIO-Platzhalter:

```
Klima Decke Temp.    (I2C 0x44)   ← sht31_temp: Name + I2C-Adresse
Klima Decke Feuchte  (I2C 0x44)   ← sht31_humidity: GLEICHE Adresse, anderer Name
Klima Dach Temp.     (I2C 0x45)   ← zweiter SHT31, andere Adresse
Klima Dach Feuchte   (I2C 0x45)   ← zweiter SHT31, Humidity
BMP280 Temp.         (I2C 0x76)   ← bmp280_temp
BMP280 Druck         (I2C 0x76)   ← bmp280_pressure: GLEICHE Adresse wie Temp
DS18B20              (GPIO 4)     ← OneWire: GPIO bleibt, physischer Pin
DS18B20              (GPIO 5)     ← zweiter OneWire-Bus
```

**Multi-Value und I2C-Adresse:** Alle Sub-Sensoren eines physischen Multi-Value-Sensors teilen sich die I2C-Adresse — das ist physikalisch korrekt (ein SHT31-Chip hat EINE Adresse und liefert zwei Messwerte). Die Unterscheidung im Orbital erfolgt ueber den Sensor-Namen (Fix L1), nicht ueber die I2C-Adresse. Das I2C-Label ist ein physischer Identifier (welcher Chip am Bus), kein logischer (welcher Messwert).

**Option A (empfohlen):** Adresse in Klammern hinter dem Sensor-Typ anzeigen — ersetzt "GPIO 0" komplett bei I2C:
```
"I2C 0x44"  (fuer SHT31 auf Standard-Adresse)
```

**Option B:** GPIO-Zeile bei I2C-Sensoren komplett weglassen und stattdessen nur die I2C-Adresse als Chip/Badge zeigen.

**Kein Hybrid:** Nicht "GPIO 0 (I2C 0x44)" — das ist verwirrend. Entweder GPIO (fuer OneWire/Analog/Digital) oder I2C-Adresse (fuer I2C), nie beides gleichzeitig.

### Sensor-Interface-Typen im System

```
interface_type = 'i2c'      → Adresse anzeigen: "I2C 0x{hex(i2c_address)}"
interface_type = 'onewire'  → GPIO anzeigen: "GPIO {gpio}"
interface_type = 'analog'   → GPIO anzeigen: "GPIO {gpio} (ADC)"
interface_type = 'digital'  → GPIO anzeigen: "GPIO {gpio}"
```

### Wo aendern

**SensorSatellite.vue** (oder die Komponente die den Sensor-Satellite im Orbital rendert). Suchen nach der Stelle wo der GPIO-Text generiert wird:

```typescript
// Computed fuer den Interface-Label
const interfaceLabel = computed((): string => {
  // I2C: Adresse als Hex anzeigen, nicht GPIO 0
  if (sensor.interface_type === 'i2c' || sensor.sensor_type?.startsWith('sht31') || sensor.sensor_type?.startsWith('bmp') || sensor.sensor_type?.startsWith('bme')) {
    if (sensor.i2c_address) {
      const hexAddr = `0x${sensor.i2c_address.toString(16).toUpperCase().padStart(2, '0')}`
      return `I2C ${hexAddr}`
    }
    return 'I2C'  // Fallback wenn keine Adresse bekannt
  }
  // OneWire/Analog/Digital: GPIO-Pin anzeigen
  if (sensor.gpio !== null && sensor.gpio !== undefined && sensor.gpio !== 0) {
    return `GPIO ${sensor.gpio}`
  }
  return ''  // Kein Label wenn kein sinnvoller Wert
})
```

**Hex-Formatierung:** I2C-Adressen immer in Hex mit "0x"-Praefix und mindestens 2 Stellen anzeigen. `0x44`, `0x45`, `0x76` — nicht "68" (Dezimal) oder "44" (Hex ohne Praefix).

**Fallback-Logik:** Falls `interface_type` nicht gesetzt ist, den `sensor_type` als Hinweis nutzen (alle bekannten I2C-Typen: sht31, bmp280, bme280). Langfristig sollte `interface_type` immer gesetzt sein (das stellt T08-Fix1 sicher).

### Validierung

```
1. SHT31 (0x44) hinzufuegen
2. Orbital Satellite zeigt "I2C 0x44" (nicht "GPIO 0")
3. Zweiten SHT31 (0x45) hinzufuegen
4. Orbital zeigt "I2C 0x44" und "I2C 0x45" — klar unterscheidbar
5. DS18B20 auf GPIO 4: Orbital zeigt "GPIO 4" (unveraendert)
6. BMP280 auf 0x76: Orbital zeigt "I2C 0x76" fuer BEIDE Satellites (bmp280_temp + bmp280_pressure)
7. Sensor ohne interface_type und ohne bekannten I2C-Typ: Kein Label (kein "GPIO 0")
8. SHT31 Multi-Value: Beide Satellites (sht31_temp + sht31_humidity) zeigen "I2C 0x44" — Unterscheidung ueber Namen
9. Zwei SHT31 (0x44 + 0x45): 4 Satellites im Orbital, korrekt aufgeteilt: 2x "I2C 0x44" + 2x "I2C 0x45"
```

---

## Fix L4: SHT31 Mock-Startwert 0°C im Monitor (NB5) — NIEDRIG

### IST

Wenn ein Mock-Sensor ohne expliziten Startwert erstellt wird (z.B. per API direkt oder wenn der Frontend-OneWire-Flow den Startwert nicht uebertraegt — NB7, behoben in Fix1-F), zeigt der Monitor `0.0 °C` und `0.0 %RH`. Das ist der Default-Wert `raw_value=0.0` aus der DB.

**Warum das ein Problem ist:** 0.0°C ist kein realistischer Raumtemperaturwert — es ist der Gefrierpunkt. Ein Mock-Device das 0°C anzeigt sieht aus wie ein defekter Sensor. Das ist besonders problematisch fuer:
- Neulinge die das System kennenlernen und denken, die Konfiguration sei kaputt
- Tests die auf Schwellwert-Logik pruefen (0.0°C trifft sofort "zu kalt"-Alerts)
- Demonstrationen bei Kunden (0°C sieht nicht professionell aus)

Realistische Startwerte machen Mock-Devices sofort als Referenz nutzbar. IoT-Simulatoren (Losant, Azure IoT Hub Mock Devices) nutzen alle standardmaessig plausible Startwerte, nicht 0.

### SOLL

Mock-Sensoren erhalten plausible physikalische Default-Startwerte wenn kein expliziter `raw_value` angegeben wurde. Die Defaults kommen aus dem physikalischen Messbereich der Sensoren:

```python
# Plausible Raum-/Gewaechshaus-Defaults fuer Mock-Sensoren
SENSOR_TYPE_MOCK_DEFAULTS: dict[str, dict] = {
    # Temperatur-Sensoren: typische Raumtemperatur
    "sht31_temp":      {"raw_value": 22.0,    "unit": "°C"},
    "ds18b20":         {"raw_value": 20.0,    "unit": "°C"},
    "bmp280_temp":     {"raw_value": 22.0,    "unit": "°C"},
    "bme280_temp":     {"raw_value": 22.0,    "unit": "°C"},
    "temperature":     {"raw_value": 22.0,    "unit": "°C"},

    # Feuchtigkeit: mittlere relative Luftfeuchte
    "sht31_humidity":  {"raw_value": 55.0,    "unit": "%RH"},
    "bme280_humidity": {"raw_value": 55.0,    "unit": "%RH"},
    "humidity":        {"raw_value": 55.0,    "unit": "%RH"},

    # Bodenfeuchte: mittlere Substrat-Feuchte (kapazitiv)
    "moisture":        {"raw_value": 45.0,    "unit": "%"},
    "soil_moisture":   {"raw_value": 45.0,    "unit": "%"},

    # Luftdruck: Normaldruck auf Meereshoehe
    "bmp280_pressure": {"raw_value": 1013.25, "unit": "hPa"},
    "bme280_pressure": {"raw_value": 1013.25, "unit": "hPa"},
    "pressure":        {"raw_value": 1013.25, "unit": "hPa"},

    # Naehrloesung-Parameter: typische Gewaechshaus-Werte
    "ph":              {"raw_value": 6.2,     "unit": "pH"},
    "ec":              {"raw_value": 1500.0,  "unit": "µS/cm"},

    # CO2: typische Raumluft
    "co2":             {"raw_value": 800.0,   "unit": "ppm"},

    # Licht: mittleres Gewaechshaus-Niveau
    "light":           {"raw_value": 25000.0, "unit": "lux"},

    # Durchfluss: Ruhezustand
    "flow":            {"raw_value": 0.0,     "unit": "L/min"},  # Pumpe aus = 0 ist korrekt
}
```

**Logik (Backend):** Beim Erstellen eines Mock-Sensors:
```python
def get_mock_default_raw_value(sensor_type: str, user_provided_raw: float | None) -> float:
    """
    Gibt den plausiblen Default-Startwert fuer einen Mock-Sensor zurueck.
    User-Werte haben immer Vorrang. Defaults nur wenn kein Wert angegeben.
    """
    # User-Wert hat absolute Prioritaet (auch wenn 0.0, wenn explizit gesetzt)
    if user_provided_raw is not None:
        return user_provided_raw

    # Lookup in Defaults (exakter Typ zuerst, dann Base-Typ)
    if sensor_type in SENSOR_TYPE_MOCK_DEFAULTS:
        return SENSOR_TYPE_MOCK_DEFAULTS[sensor_type]["raw_value"]

    # Unbekannter Typ: kein Default, Backend-Default bleibt
    return 0.0
```

**Wichtig — User-Vorrang:** Wenn der User explizit `raw_value=0.0` angibt (z.B. fuer einen Durchfluss-Sensor der gerade aus ist), muss das respektiert werden. Der Default greift NUR wenn `raw_value` in der Anfrage fehlt (`None`) — nicht wenn `0.0` explizit uebergeben wurde. Das Backend muss `Optional[float]` (nicht `float = 0.0`) als Parameter-Typ verwenden.

**Batch-Create synchronisieren:** Wenn `create_mock_device()` beim Batch-Create Sensoren anlegt, muss dieselbe Default-Logik greifen wie beim Einzel-Add.

### Wo aendern

**Backend:** `debug.py` oder der Service der `add_sensor()` und `create_mock_device()` implementiert.

1. Konstante `SENSOR_TYPE_MOCK_DEFAULTS` in `debug.py` oder `sensor_type_registry.py` definieren
2. In `add_sensor()`: Parameter `raw_value: Optional[float] = None` (statt `float = 0.0`)
3. Default-Lookup-Funktion einbauen, BEVOR der Eintrag in die DB geschrieben wird
4. Gleiches in `create_mock_device()` fuer jeden Sensor im Batch

### Validierung

```
1. SHT31 per API hinzufuegen OHNE raw_value Parameter
   → Orbital zeigt 22.0 °C und 55.0 %RH (nicht 0.0)

2. SHT31 per API hinzufuegen MIT raw_value=25.8
   → Orbital zeigt 25.8 °C (User-Wert hat Vorrang)

3. SHT31 per API hinzufuegen MIT raw_value=0.0 (explizit)
   → Orbital zeigt 0.0 °C (expliziter User-Wert wird respektiert)

4. DS18B20 per API ohne raw_value
   → Orbital zeigt 20.0 °C

5. pH-Sensor per API ohne raw_value
   → Orbital zeigt 6.2 pH

6. BME280 per API ohne raw_value
   → Orbital zeigt 3 Satellites mit je eigenem Default: 22.0°C + 55.0%RH + 1013.25 hPa

7. Mock-Create (Batch): neues Device hat plausible Defaults fuer ALLE Sub-Sensoren
   → SHT31 Batch: sht31_temp=22.0°C, sht31_humidity=55.0%RH (nicht beide 0.0)
   → BME280 Batch: bme280_temp=22.0°C, bme280_humidity=55.0%RH, bme280_pressure=1013.25 hPa
   → Jeder Sub-Sensor bekommt seinen typ-spezifischen Default aus SENSOR_TYPE_MOCK_DEFAULTS
```

---

## Accessibility-Checkliste (fuer alle 4 Fixes)

Diese Punkte muessen bei der Implementierung beachtet werden. Sie sind kein separater Auftrag, sondern Anforderungen an die Qualitaet der Aenderungen:

**Kontrast (WCAG AA):**
- Sensor-Namen auf der MiniCard muessen 4.5:1 Kontrastverhaltnis gegen den Hintergrund haben
- I2C-Adress-Labels ("I2C 0x44") muessen gleichen Kontrast wie GPIO-Labels haben
- Keine neuen Farben einfuehren — bestehende Design-Tokens aus `tokens.css` verwenden

**ARIA fuer reaktiven Info-Text (Fix L2):**
- `role="status"` auf dem Info-Banner
- `aria-live="polite"` damit Screen Reader die Aenderung ankuendigt
- Nicht `aria-live="assertive"` — das wuerde andere Announcements unterbrechen

**Keyboard-Zugang:**
- Die Fixes aendern keine interaktiven Elemente, daher kein neuer Keyboard-Bedarf
- Bestehende Tab-Reihenfolge unveraendert lassen

**Tooltip-Inhalt:**
- Wenn `title`-Attribut fuer langen Sensor-Namen: den vollen Text verwenden, nicht nochmal den gekürzten
- Kein `title` auf nicht-interaktiven Elementen ohne Fallback fuer Touch-Geraete — alternativ `aria-describedby` mit verstecktem Element

---

## Was NICHT gemacht wird

- Keine Aenderung an der Sensor-Config-Pipeline (das ist Fix1) — insbesondere KEIN Multi-Value-Split (Fix1-C), KEIN Key-Format (Fix1-A), KEIN Dual-Storage-Sync (Fix1-B). Fix2 liest und zeigt die bereits durch Fix1 korrekt gesplitteten Eintraege an
- Kein Redesign des Orbital-Layouts oder der Zone-Tile-Struktur
- Keine Aenderung am Zone-Header oder Zone-Tile Grid (Fix6 hat das bereits geloest)
- Keine neuen Sensor-Typen oder neue Felder in der API
- Keine Aenderung am MonitorView-Layout
- Keine Aenderung am SensorConfigPanel oder ActuatorConfigPanel
- Kein Refactoring ueber die vier beschriebenen Fixes hinaus
- Keine Aenderung an Fix6-Layout-Verbesserungen (Normal-Case, Grid, Thin-Space bleiben erhalten)
- Keine Backend-Aenderungen ausser L4 (Mock-Defaults in debug.py)

---

## Technische Abhaengigkeiten

| Fix | Abhaengigkeit von T08-Fix1 |
|-----|---------------------------|
| L1 MiniCard-Namen | Fix1-B (Dual-Storage-Sync) muss `name`-Feld konsistent halten. Fix1-C (Multi-Value-Split) erzeugt die separaten Eintraege (`sht31_temp`, `sht31_humidity`) die als einzelne Zeilen auf der MiniCard erscheinen |
| L2 Info-Text reaktiv | Unabhaengig von Fix1 — rein Frontend-seitig |
| L3 GPIO → I2C-Adresse | Fix1-A (Key-Format) sorgt dafuer dass i2c_address korrekt gespeichert ist. Bei Multi-Value teilen sich alle Sub-Sensoren (z.B. sht31_temp + sht31_humidity) dieselbe i2c_address — das ist korrekt |
| L4 Mock-Defaults | Fix1-C (Multi-Value-Split) stellt sicher dass Defaults fuer sht31_temp UND sht31_humidity separat gesetzt werden. Ohne Fix1-C existiert nur EIN Eintrag ("sht31") und die typ-spezifischen Defaults (22.0°C vs. 55.0%RH) greifen nicht korrekt |

---

## Akzeptanzkriterien

### Fix L1: MiniCard Custom-Name
- [ ] L1 MiniCard zeigt `name` (Custom-Name) statt `sensor_type` (Base-Type)
- [ ] Fallback: wenn kein Name gesetzt → formatierter sensor_type (Title Case, Underscores → Spaces)
- [ ] Kein `text-transform: uppercase/lowercase` auf dem Namen-Text
- [ ] Langer Name: `text-overflow: ellipsis`, Tooltip mit vollem Namen bei Hover
- [ ] Sensor-Name auf MiniCard = Sensor-Name im Orbital = Sensor-Name im Monitor (alle 3 zeigen identisch)
- [ ] SHT31 Multi-Value: MiniCard zeigt 2 separate Zeilen (sht31_temp + sht31_humidity) mit jeweiligem Custom-Namen
- [ ] BME280 Multi-Value: MiniCard zeigt 3 separate Zeilen (Temp + Humidity + Pressure)

### Fix L2: Reaktiver Info-Text
- [ ] Info-Text aktualisiert sich bei I2C-Adress-Wechsel (0x44 → 0x45) ohne Reload
- [ ] Info-Text korrekt fuer alle I2C-Sensor-Typen (sht31, bmp280, bme280) inkl. Multi-Value-Hinweis ("erstellt N Sensor-Eintraege")
- [ ] Info-Text korrekt fuer OneWire-Sensor (ds18b20): zeigt GPIO statt Adresse
- [ ] `role="status"` und `aria-live="polite"` auf dem Info-Banner
- [ ] Bei Wechsel zu anderem Sensortyp: Info-Text wechselt vollstaendig

### Fix L3: I2C-Adresse statt GPIO 0
- [ ] SHT31 Orbital zeigt "I2C 0x44" (nicht "GPIO 0")
- [ ] Zweiter SHT31 (0x45) zeigt "I2C 0x45" — beide klar unterscheidbar
- [ ] DS18B20 zeigt weiterhin "GPIO 4" (OneWire unveraendert)
- [ ] BMP280 zeigt "I2C 0x76" (oder 0x77 je nach Konfiguration)
- [ ] Adresse in Hex mit "0x"-Praefix und 2+ Stellen: "0x44", nie "68" oder "44"
- [ ] Wenn kein i2c_address vorhanden: "I2C" ohne Zahl (nicht "GPIO 0" und nicht leer lassen)
- [ ] Multi-Value: Alle Sub-Sensoren eines physischen Sensors (sht31_temp + sht31_humidity) zeigen dieselbe I2C-Adresse — Unterscheidung ueber Name

### Fix L4: Mock-Defaults
- [ ] SHT31 ohne Startwert → 22.0°C und 55.0%RH im Orbital (nicht 0.0)
- [ ] DS18B20 ohne Startwert → 20.0°C (nicht 0.0)
- [ ] BMP280 ohne Startwert → 22.0°C + 1013.25 hPa (nicht 0.0)
- [ ] User-Startwert (z.B. 25.8) hat Vorrang vor Default → zeigt 25.8 (nicht 22.0)
- [ ] Expliziter raw_value=0.0 (User will 0.0) wird respektiert → zeigt 0.0
- [ ] Durchfluss-Sensor (flow): Default 0.0 bleibt — 0 L/min bei ausgeschalteter Pumpe ist korrekt
- [ ] BME280 ohne Startwert → 3 Sub-Sensoren mit je eigenem Default (22.0°C, 55.0%RH, 1013.25 hPa)
- [ ] Multi-Value Batch-Create: Jeder Sub-Sensor bekommt seinen typ-spezifischen Default aus SENSOR_TYPE_MOCK_DEFAULTS

### Gesamtsystem
- [ ] Bestehende Fix6-Layout-Verbesserungen intakt (Normal-Case, Grid, Thin-Space)
- [ ] TypeScript Build ohne Errors (`vue-tsc --noEmit`)
- [ ] Ruff check bestanden (Backend, nur fuer L4)
- [ ] 0 neue Console-Errors nach den Fixes
- [ ] Bestehende E2E-Tests weiterhin gruen
