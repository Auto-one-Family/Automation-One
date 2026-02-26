# SHT31 Frontend-Handling — Vollständige IST-Analyse

> **Datum:** 2026-02-25
> **Scope:** Kompletter Datenpfad SHT31 (1 Sensor → 2 Werte) durch Server-API und Frontend-Stack
> **Methode:** Statische Code-Analyse aller relevanten Dateien

---

## Teil A: Server-API-Verträge

### IST-Zustand

#### Multi-Value-Registry (`sensor_type_registry.py`)

Der Server definiert Multi-Value-Sensoren zentral in `MULTI_VALUE_SENSORS`:

```python
# El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py
MULTI_VALUE_SENSORS = {
    "sht31": {
        "device_type": "sht31",
        "values": [
            {"sensor_type": "sht31_temp", "unit": "°C", "description": "Temperature"},
            {"sensor_type": "sht31_humidity", "unit": "%RH", "description": "Relative Humidity"},
        ],
        "interface": "i2c",
        "default_address": 0x44,
    },
    "bmp280": { ... }  # analog aufgebaut
}
```

Hilfsfunktionen:
- `normalize_sensor_type(raw)` → Lowercase-Normalisierung
- `is_multi_value_sensor(sensor_type)` → Prüft ob Base-Type (z.B. "sht31") multi-value ist
- `get_all_value_types_for_device(device_type)` → Returns `["sht31_temp", "sht31_humidity"]`
- `get_device_type_from_sensor_type(sensor_type)` → "sht31_temp" → "sht31"

#### REST-API: POST `/api/v1/sensors/{esp_id}/{gpio}` (Zeilen 407-499 in `sensors.py`)

Multi-Value-Splitting findet im API-Layer statt (NICHT im Service):

1. `is_multi_value_sensor(request.sensor_type)` prüft ob Splitting nötig
2. `get_all_value_types_for_device()` liefert Sub-Typen
3. Für JEDEN Sub-Typ wird ein separater `SensorConfig`-Eintrag in der DB erstellt (gleiche GPIO, gleiche I2C-Adresse, unterschiedlicher `sensor_type`)
4. **Rückgabe:** Nur die ERSTE Sensor-Config-Response (sht31_temp). Die zweite (sht31_humidity) wird still erstellt, aber nicht zurückgegeben.

#### REST-API: GET `/api/v1/sensors/{esp_id}/{gpio}` (Zeile 277)

- Unterstützt optionalen `?sensor_type=` Query-Parameter
- Ohne `sensor_type`: Gibt den ERSTEN Treffer für gpio zurück
- Beide Sub-Sensoren teilen sich `gpio=0` (I2C-Placeholder)

#### REST-API: GET `/api/v1/sensors/{esp_id}` (List)

- Returns flache Liste aller Sensoren
- Jeder Sub-Typ (sht31_temp, sht31_humidity) als separater Eintrag mit eigenem `latest_value`

#### Pydantic-Schemas (`sensor.py`)

- `SensorConfigCreate`: Hat `i2c_address`, `interface_type`, `provides_values` Felder
- `SensorConfigResponse`: Enthält `latest_value`, `latest_quality`, `latest_timestamp`, `config_status`
- `SensorReading`: Hat `sensor_type`-Feld zur Multi-Value-Unterscheidung
- `SENSOR_TYPES`-Liste: `["ph", "temperature", "humidity", ...]` — enthält NICHT "sht31_temp" oder "sht31_humidity"

#### WebSocket: `sensor_data` Events

- Kommen als separate Messages pro Sub-Wert
- Jede Message enthält `esp_id`, `gpio`, `sensor_type` (z.B. "sht31_temp"), `value`, `unit`, `quality`

#### Business-Logic (`sensor_service.py`)

- `create_or_update_config()` operiert auf Einzelsensor (gpio + sensor_type) — KEIN Multi-Value-Awareness
- Das Splitting liegt ausschließlich im API-Layer (`sensors.py`)

### Bewertung

- **Server-seitige Trennung** ist sauber: 1 physischer Sensor → 2 DB-Einträge
- **Registry-Pattern** ist konsistent und erweiterbar
- **Splitting im API-Layer** statt im Service ist eine architektonische Entscheidung — funktioniert, aber Business-Logic ist im Router verstreut

### Lücken

| # | Lücke | Schwere |
|---|-------|---------|
| A1 | POST-Response gibt nur ERSTEN Sub-Sensor zurück — Frontend erfährt nicht direkt, dass 2 Einträge erstellt wurden | Mittel |
| A2 | `SENSOR_TYPES`-Validierungsliste enthält keine Multi-Value-Sub-Typen (sht31_temp, sht31_humidity) — unklar ob Validierung diese blockiert | Mittel |
| A3 | GET ohne `?sensor_type=` bei gpio=0 gibt nur ERSTEN Treffer zurück — zweiter Sub-Sensor nicht adressierbar | Hoch |
| A4 | BME280 existiert im Frontend als Multi-Value, aber NICHT in Server-Registry `MULTI_VALUE_SENSORS` (nur bmp280) | Hoch |

### Code-Referenzen

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Servador/.../sensors/sensor_type_registry.py` | 1-180 | Multi-Value-Definitionen |
| `El Servador/.../api/v1/sensors.py` | 277, 407-499 | GET mit sensor_type param, POST Splitting |
| `El Servador/.../schemas/sensor.py` | Komplett | Pydantic-Schemas |
| `El Servador/.../services/sensor_service.py` | 87-166 | create_or_update_config (Einzelsensor) |

---

## Teil B: Frontend Sensor-Type-System

### IST-Zustand

#### `SENSOR_TYPE_CONFIG` (`sensorDefaults.ts`)

Das zentrale Type-Registry hat MEHRERE Einträge für SHT31-Varianten:

| Key | Unit | Label | Zweck |
|-----|------|-------|-------|
| `'SHT31'` | `°C` | SHT31 (Temp + Humidity) | Base-Type (DnD, AddModal) |
| `'sht31'` | `°C` | SHT31 | Lowercase-Variante |
| `'sht31_temp'` | `°C` | SHT31 Temperatur | Sub-Typ für Temp-Wert |
| `'sht31_humidity'` | `% RH` | SHT31 Feuchtigkeit | Sub-Typ für Feuchte-Wert |
| `'SHT31_humidity'` | `% RH` | SHT31 Feuchtigkeit | PascalCase-Variante |

#### `MULTI_VALUE_DEVICES` (`sensorDefaults.ts`, Zeile ~540)

```typescript
MULTI_VALUE_DEVICES: {
  sht31: {
    label: 'SHT31 (Temp + Humidity)',
    sensorTypes: ['sht31_temp', 'sht31_humidity'],
    values: [
      { key: 'sht31_temp', label: 'Temperatur', unit: '°C', icon: 'Thermometer' },
      { key: 'sht31_humidity', label: 'Feuchtigkeit', unit: '% RH', icon: 'Droplet' },
    ],
    interface: 'i2c',
    i2cAddress: '0x44',
  },
  bmp280: { ... },
  bme280: { ... },  // nur Frontend, NICHT auf Server
}
```

#### Hilfsfunktionen (`sensorDefaults.ts`)

| Funktion | Eingabe | Ausgabe | Nutzung |
|----------|---------|---------|---------|
| `isMultiValueSensorType(type)` | "sht31" | true | sensor.store.ts |
| `getDeviceTypeFromSensorType(type)` | "sht31_temp" | "sht31" | SensorSatellite |
| `getSensorTypesForDevice(device)` | "sht31" | ["sht31_temp", "sht31_humidity"] | sensor.store.ts |
| `getMultiValueDeviceConfig(device)` | "sht31" | Full config object | SensorSatellite |
| `getValueConfigForSensorType(type)` | "sht31_temp" | {key, label, unit, icon} | SensorSatellite |
| `inferInterfaceType(type)` | "sht31*" | "I2C" | AddSensorModal, ConfigPanel |
| `getSensorTypeOptions()` | — | ALL SENSOR_TYPE_CONFIG entries | AddSensorModal dropdown |
| `getI2CAddressOptions(type)` | "sht31" | [{value:0x44,...}, {value:0x45,...}] | AddSensorModal |

#### `BASE_TYPE_TO_DEVICE` Mapping (`sensorDefaults.ts`)

```typescript
BASE_TYPE_TO_DEVICE: {
  'sht31': 'sht31',
  'SHT31': 'sht31',
  'sht31_temp': 'sht31',
  'sht31_humidity': 'sht31',
  // analog für bmp280, bme280
}
```

#### Sensor-Schemas (`sensor-schemas.ts`)

SHT31-Schema (Key: `'SHT31'`, Zeilen 73-133):
- **Hardware-Gruppe:** I2C-Adresse (Dropdown 0x44/0x45), I2C-Bus, Interface=I2C (disabled)
- **Messung:** interval_ms
- **Thresholds:** temp_threshold_min/max UND humidity_threshold_min/max (kombiniert in einem Formular)
- **Kein GPIO-Picker** (korrekt für I2C)

### Bewertung

- **MULTI_VALUE_DEVICES-Registry** ist gut strukturiert und spiegelt die Server-Seite
- **Hilfsfunktionen** sind umfassend und decken alle Lookup-Szenarien ab
- **Case-Varianten** (SHT31, sht31, SHT31_humidity) sind defensiv angelegt — aber redundant

### Lücken

| # | Lücke | Schwere |
|---|-------|---------|
| B1 | `getSensorTypeOptions()` gibt ALLE Einträge aus SENSOR_TYPE_CONFIG zurück — Sub-Typen (sht31_temp, sht31_humidity) erscheinen als wählbare Optionen im AddSensorModal-Dropdown neben dem Base-Type "SHT31" | Hoch |
| B2 | Base-Type-Einträge 'SHT31' und 'sht31' haben `unit: '°C'` — dies ist nur die Temperatur-Unit, Feuchtigkeit fehlt. Bei Verwendung als Einzelsensor (nicht als Multi-Value) wäre die Unit falsch für den Feuchte-Wert | Mittel |
| B3 | BME280 existiert in `MULTI_VALUE_DEVICES` im Frontend, aber NICHT in Server's `MULTI_VALUE_SENSORS` (nur bmp280) — Frontend-Server-Inkonsistenz | Hoch |
| B4 | 5 Case-Varianten für SHT31 im SENSOR_TYPE_CONFIG — fragil, da jede neue Stelle eine bestimmte Schreibweise erwarten könnte | Niedrig |
| B5 | `sensor-schemas.ts` SHT31-Schema hat Key `'SHT31'` (PascalCase) — `getSensorSchema()` macht case-sensitiven Lookup. Ein Aufruf mit `'sht31'` würde kein Schema finden | Mittel |

### Code-Referenzen

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Frontend/src/utils/sensorDefaults.ts` | Komplett (796 Zeilen) | Type-System, Multi-Value-Registry, Hilfsfunktionen |
| `El Frontend/src/config/sensor-schemas.ts` | 73-133 | SHT31-Formular-Schema |

---

## Teil C: Sensor-Hinzufügen-Flow

### IST-Zustand

#### Drag-and-Drop: ComponentSidebar → ESPOrbitalLayout → AddSensorModal

1. **ComponentSidebar** (`ComponentSidebar.vue`, Zeile 84-95):
   - `BASE_SENSOR_TYPES` enthält `'SHT31'` (PascalCase)
   - Kurzlabel: `'SHT31' → 'T+H'` (Temp + Humidity)
   - DnD-Dragdata: `{ action: 'add-sensor', sensorType: 'SHT31', label, defaultUnit, icon }`
   - DragStore wird mit `startSensorTypeDrag(dragData)` informiert

2. **ESPOrbitalLayout** (`ESPOrbitalLayout.vue`, Zeile ~229):
   - Drop-Handler extrahiert `sensorType` aus DragData
   - Setzt `droppedSensorType` Ref
   - Öffnet `AddSensorModal` mit `initial-sensor-type="droppedSensorType"`

3. **AddSensorModal** (`AddSensorModal.vue`):
   - **Dropdown:** `sensorTypeOptions = getSensorTypeOptions()` — zeigt ALLE Typen inkl. Sub-Typen
   - **initialSensorType-Matching** (Zeile ~180): Sucht in sensorTypeOptions per Lowercase-Vergleich
   - **I2C-Erkennung:** `isI2CSensor` computed → zeigt I2C-Adresse-Dropdown, versteckt GPIO-Picker
   - **Address-Defaults:** `getI2CAddressOptions()` + automatische Vorauswahl der Standard-Adresse
   - **Submit:** Ruft `espStore.addSensor()` auf mit:
     ```
     { sensor_type, gpio: 0, i2c_address, interface_type: 'I2C', ... }
     ```
   - **Nach Add:** Prüft `MULTI_VALUE_DEVICES[sensorType]` → zeigt Toast "SHT31 erstellt 2 Sensor-Einträge (Temperatur + Feuchtigkeit)"

#### esp.ts `addSensor()` (Zeile 664-775)

- **Mock ESP:** `debugApi.addSensor(espId, sensorConfig)` — lokale Mock-Erstellung
- **Real ESP:** `sensorsApi.createOrUpdate(espId, gpio, config)` mit:
  - `interfaceType = inferInterfaceType(sensor_type)` → "I2C" für sht31
  - `defaultI2CAddress` aus Registry
  - POST an Server → Server splittet in 2 DB-Einträge
- **Nach Success:** `fetchDevice(deviceId)` refresh → holt aktualisierte Sensor-Liste

#### Manueller Add (ohne DnD)

- User kann AddSensorModal auch direkt öffnen (Plus-Button)
- Dropdown zeigt alle Typen inkl. Sub-Typen (sht31_temp, sht31_humidity, SHT31, sht31)
- User könnte "sht31_temp" einzeln als Typ wählen → Server würde nur EINEN Sensor anlegen (kein Splitting, da Sub-Typ kein Multi-Value-Base-Type ist)

### Bewertung

- **DnD-Flow** für SHT31 ist funktional: ComponentSidebar → ESPOrbitalLayout → AddSensorModal → espStore → Server → Refresh
- **I2C-Handling** im AddSensorModal korrekt: GPIO-Picker versteckt, I2C-Adresse angezeigt, gpio=0 gesetzt
- **Multi-Value-Toast** informiert User über 2-Sensor-Erstellung

### Lücken

| # | Lücke | Schwere |
|---|-------|---------|
| C1 | AddSensorModal-Dropdown zeigt Sub-Typen (sht31_temp, sht31_humidity) als wählbare Optionen — User könnte Sub-Typ direkt wählen, was KEINEN Multi-Value-Split auf dem Server auslöst | Hoch |
| C2 | DnD sendet 'SHT31' (PascalCase), AddSensorModal matched per Lowercase — funktioniert, aber `initialSensorType`-Matching ist fragil bei neuen Varianten | Niedrig |
| C3 | POST-Response gibt nur ERSTEN Sub-Sensor zurück — `addSensor()` erfährt den Erfolg des zweiten nur indirekt über `fetchDevice()` | Mittel |
| C4 | Mock-ESP `addSensor()` geht durch `debugApi` — unklar ob Multi-Value-Splitting für Mocks implementiert ist | Mittel |
| C5 | `addSensor()` setzt `gpio: 0` hart für I2C — wenn 2 verschiedene I2C-Sensoren (SHT31 + BMP280) am gleichen ESP sind, teilen sich alle gpio=0 | Hoch |

### Code-Referenzen

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Frontend/src/components/dashboard/ComponentSidebar.vue` | 84-95, 159-195 | BASE_SENSOR_TYPES, DnD-Handler |
| `El Frontend/src/components/esp/ESPOrbitalLayout.vue` | ~229 | Drop-Handler |
| `El Frontend/src/components/esp/AddSensorModal.vue` | Komplett (781 Zeilen) | Sensor-Typ-Dropdown, I2C-Handling, Submit |
| `El Frontend/src/stores/esp.ts` | 664-775 | addSensor() — Mock vs Real |
| `El Frontend/src/api/sensors.ts` | createOrUpdate() | POST-Request |

---

## Teil D: Sensor-Anzeige und Live-Daten

### IST-Zustand

#### WebSocket-Empfang: `sensor.store.ts` (305 Zeilen)

**Drei-Handler-Hybrid-Logik** für eingehende `sensor_data` Events:

1. **`handleKnownMultiValueSensor()`** (Registry-basiert):
   - Prüft `isMultiValueSensorType(data.sensor_type)` ODER `getDeviceTypeFromSensorType(data.sensor_type)`
   - Findet/erstellt Sensor-Objekt nach GPIO
   - Setzt `is_multi_value = true`, `device_type = deviceType`
   - Speichert in `sensor.multi_values[data.sensor_type]` = `{ value, unit, quality, timestamp }`
   - Setzt `raw_value` / `unit` vom ERSTEN Registry-Wert als Primärwert
   - `quality` = `getWorstQuality()` über alle Multi-Values

2. **`handleDynamicMultiValueSensor()`** (Auto-Detect):
   - Greift wenn unterschiedlicher `sensor_type` auf gleicher GPIO eintrifft
   - Konvertiert bestehenden Single-Value-Sensor zu Multi-Value
   - Erstellt `multi_values`-Dict nachträglich

3. **`handleSingleValueSensorData()`** (Fallback):
   - Standard-Update: `raw_value`, `unit`, `quality`, `timestamp`

#### ESP Orbital View: `SensorSatellite.vue` (716 Zeilen)

**Volle Multi-Value-Unterstützung:**

- Props: `deviceType`, `multiValues`, `isMultiValue`
- `valueCount`: 1, 2 oder 3 Werte → Grid-Layout passt sich an
- `displayLabel`: Extrahiert "SHT31" aus "SHT31 (Temp + Humidity)"
- `formattedValues`: Mapped `multi_values` zu Display-Daten mit Registry-Reihenfolge
- `displayQuality`: Aggregiertes Worst-Quality über alle Werte
- GPIO-Badge nur bei Multi-Value-Sensoren angezeigt
- Draggable für Multi-Sensor-Chart

#### SensorColumn.vue (145 Zeilen)

- Rendert Liste von `SensorSatellite`-Komponenten
- Passt `device_type`, `multi_values`, `is_multi_value` Props durch
- 2-Spalten-Layout bei >5 Sensoren

#### SensorValueCard.vue (539 Zeilen)

- **KEIN Multi-Value-Support**
- Zeigt nur `raw_value`/`processed_value`, eine Unit, ein Quality-Badge
- GPIO in technischen Details ohne I2C-Unterscheidung
- Operating-Mode-Badge, Stale-Warning, Measure-Button für On-Demand

#### SensorsView.vue (Sensor-Tab, ab Zeile 854)

- Flat-List-Darstellung: Jeder Sensor als einzelne Karte
- `SensorWithContext` Interface: `{ gpio, sensor_type, name, raw_value, unit, quality, esp_id, ... }`
- Gruppiert nach Zone → Subzone → Sensorkarten
- **Keine Multi-Value-Gruppierung**: sht31_temp und sht31_humidity erscheinen als 2 SEPARATE Karten
- Sparkline pro Sensor (key: `espId-gpio`) — bei Multi-Value teilen sich beide Sub-Sensoren den gleichen Sparkline-Key (da gleiche GPIO)
- Click öffnet SensorConfigPanel via `openSensorConfig(sensor)`

#### SensorOverviewWidget.vue (207 Zeilen)

- Dashboard-Widget mit Live-Line-Chart
- Sensor-Auswahl: `"espId:gpio"` Key
- **Kein Multi-Value-Support**: Beide Sub-Typen teilen gpio=0, daher gleicher Key
- Matched eingehende WS-Messages nach `espId:gpio` — erhält BEIDE Sub-Werte, kann sie nicht unterscheiden

#### SensorHistoryView.vue (437 Zeilen)

- Zeitreihen-Visualisierung mit ESP/GPIO/SensorType-Filtern
- `sensor_type` als optionaler Textfeld-Filter (Freitext, kein Dropdown)
- `sensorsApi.queryData()` unterstützt `sensor_type`-Filter → kann sht31_temp und sht31_humidity getrennt abfragen
- Chart zeigt nur EINEN Dataset — kein Multi-Line für beide SHT31-Werte gleichzeitig

### Bewertung

- **ESP Orbital View** (SensorSatellite): Exzellente Multi-Value-Darstellung — zeigt beide Werte in einer Karte, Registry-basierte Reihenfolge, Quality-Aggregation
- **sensor.store.ts**: Robuste Hybrid-Logik mit 3 Fallback-Ebenen
- **SensorsView**: Zeigt Sub-Typen als getrennte Karten — keine Multi-Value-Gruppierung
- **Widgets/History**: Keine Multi-Value-Awareness

### Lücken

| # | Lücke | Schwere |
|---|-------|---------|
| D1 | SensorsView zeigt sht31_temp und sht31_humidity als 2 SEPARATE Karten — keine Gruppierung zu einem physischen Sensor | Mittel |
| D2 | SensorsView Sparkline-Key `espId-gpio` ist für Multi-Value-Sensoren identisch (beide gpio=0) — Sparkline zeigt nur den letzten eingehenden Wert beider Typen gemischt | Hoch |
| D3 | SensorOverviewWidget matcht nach `espId:gpio` — kann sht31_temp und sht31_humidity nicht unterscheiden, da beide gpio=0 haben | Hoch |
| D4 | SensorHistoryView zeigt nur EINEN Dataset — keine Möglichkeit, beide SHT31-Werte überlagert im selben Chart zu sehen | Mittel |
| D5 | SensorHistoryView `sensor_type`-Filter ist Freitext — User muss "sht31_temp" oder "sht31_humidity" kennen und manuell tippen | Niedrig |
| D6 | SensorValueCard hat keinen Multi-Value-Support — zeigt nur einzelne Werte, kein physischer Sensor-Kontext | Mittel |

### Code-Referenzen

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Frontend/src/shared/stores/sensor.store.ts` | Komplett (305 Zeilen) | Hybrid-Empfangslogik, Multi-Value-Handling |
| `El Frontend/src/components/esp/SensorSatellite.vue` | Komplett (716 Zeilen) | Multi-Value-Darstellung |
| `El Frontend/src/components/esp/SensorColumn.vue` | Komplett (145 Zeilen) | Sensor-Liste |
| `El Frontend/src/components/esp/SensorValueCard.vue` | Komplett (539 Zeilen) | Einzelwert-Darstellung |
| `El Frontend/src/views/SensorsView.vue` | 322-356, 1005-1050 | Flat-List Sensor-Karten, Sparkline |
| `El Frontend/src/components/widgets/SensorOverviewWidget.vue` | Komplett (207 Zeilen) | Dashboard-Widget |
| `El Frontend/src/views/SensorHistoryView.vue` | Komplett (437 Zeilen) | Zeitreihen-View |

---

## Teil E: Sensor-Konfiguration und -Bearbeitung

### IST-Zustand

#### SensorConfigPanel.vue (SlideOver-Panel)

- **Props:** `espId`, `gpio`, `sensorType`, `unit`
- **Öffnungskontext:** Pro sensor_type — wenn von SensorsView geöffnet, kennt es den konkreten Sub-Typ
- **Interface-Erkennung:** `inferInterfaceType(props.sensorType)` → "I2C" für sht31*
- **I2C-Adressen:** `i2cAddressOptions` hat sht31-spezifische Optionen (0x44/0x45)
- **Config laden:** `sensorsApi.get(props.espId, props.gpio)` — OHNE sensor_type Parameter
  - Bei gpio=0 mit 2 Sub-Sensoren: Server gibt nur ERSTEN Treffer zurück
- **Config speichern:** `sensorsApi.createOrUpdate(espId, gpio, config)` mit aktuellem `sensorType`
- **Threshold-Bereich:** Konfiguriert über RangeSlider (4 Werte: alarmLow, warnLow, warnHigh, alarmHigh)
- **Subzone-Zuweisung:** Per Dropdown, pro Sensor konfigurierbar
- **Sensor-Typ angezeigt:** Als disabled Input-Feld (nicht änderbar)
- **Live-Vorschau:** Zeigt aktuelle Werte über ESP-Store-Watch, matcht nach GPIO

#### EditSensorModal.vue (337 Zeilen)

- **Einzelsensor-Editor:** Operiert auf `EditableSensor` (gpio + sensor_type)
- Editierbar: Name, Operating Mode, Timeout, Schedule
- **Delete:** Nur für Mock-ESPs (`props.isMock`)
- **Kein Multi-Value-Awareness:** Bearbeitet immer nur EINEN Sub-Sensor

#### SensorConfigPanel: Öffnung aus SensorsView

```typescript
function openSensorConfig(sensor) {
  selectedSensorConfig.value = {
    espId: sensor.esp_id,
    gpio: sensor.gpio,        // gpio=0 für I2C
    sensorType: sensor.sensor_type,  // z.B. "sht31_temp"
    unit: sensor.unit,
  }
  showSensorPanel.value = true
}
```

→ Öffnet Panel immer mit konkretem Sub-Typ, NICHT mit Base-Type

### Bewertung

- **SensorConfigPanel** funktioniert pro Sub-Typ — User muss 2x konfigurieren (einmal für sht31_temp, einmal für sht31_humidity)
- **API-Call** `sensorsApi.get(espId, gpio)` ohne sensor_type ist problematisch für Multi-Value
- **Live-Vorschau** matcht nach GPIO — bei Multi-Value kein Sub-Typ-Filtering

### Lücken

| # | Lücke | Schwere |
|---|-------|---------|
| E1 | `sensorsApi.get(espId, gpio)` OHNE sensor_type-Parameter — bei gpio=0 mit 2 Sub-Sensoren wird nur der ERSTE Eintrag geladen, Config des zweiten Sub-Sensors möglicherweise falsch dargestellt | Hoch |
| E2 | Kein Multi-Value-Gruppeneditor: User muss für SHT31 zweimal die Config öffnen (einmal für Temp, einmal für Humidity) — Name, I2C-Adresse, Subzone müssten synchron gehalten werden | Mittel |
| E3 | Live-Vorschau-Watch matcht nach GPIO (`sensors.find(s => s.gpio === props.gpio)`) — bei Multi-Value wird nur der ERSTE Treffer angezeigt, nicht der zur props.sensorType passende Wert | Hoch |
| E4 | EditSensorModal Delete nur für Mocks — Real-ESP SHT31 kann nicht gelöscht werden | Mittel |
| E5 | Threshold-Konfiguration pro Sub-Typ statt pro physischem Sensor — Temperature-Thresholds und Humidity-Thresholds werden getrennt konfiguriert, obwohl das SHT31-Form-Schema (`sensor-schemas.ts`) beides kombiniert | Mittel |

### Code-Referenzen

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | 1-233 | Config-Laden, Speichern, I2C-Optionen |
| `El Frontend/src/components/esp/EditSensorModal.vue` | Komplett (337 Zeilen) | Einzelsensor-Editor |
| `El Frontend/src/views/SensorsView.vue` | 234-243 | openSensorConfig() Aufruf |
| `El Frontend/src/api/sensors.ts` | get(), createOrUpdate() | API-Calls |

---

## Teil F: Kalibrierung und History

### IST-Zustand

#### CalibrationWizard.vue

- **Sensor-Typ-Presets:** pH, EC, Moisture, Temperature
- **KEIN SHT31-Preset** — SHT31 ist ein "factory-calibrated" Sensor, Kalibrierung normalerweise nicht nötig
- **Flow:** Select Sensor Type → Select ESP/GPIO → 2-Punkt-Kalibrierung → Submit
- **GPIO-Auswahl:** Zeigt alle Sensoren des ESP, filtert nicht nach Typ
- **Submit:** `sensorsApi.calibrate(espId, gpio, sensorType, points, 'linear', true)`
- **Methode:** 2-Punkt Linear (fest kodiert)

#### SensorConfigPanel: Kalibrierung (eingebettet)

- `needsCalibration` computed: `sensorType === 'ph' || sensorType === 'ec'`
- **SHT31 wird NICHT als kalibrierungsbedürftig eingestuft** — was korrekt ist
- `useCalibration()` Composable liefert Kalibrationsdaten für pH/EC
- Config speichert `calibration`-Daten wenn vorhanden

#### SensorHistoryView.vue

- **Standalone-View** unter `/sensor-history`
- **Filter:** ESP-Gerät (Dropdown), GPIO (Number-Input), SensorType (Freitext)
- **Query:** `sensorsApi.queryData({ esp_id, gpio, sensor_type, start_time, end_time, limit: 1000 })`
- **Chart:** Ein Dataset, `processed_value ?? raw_value`, Zeitachse
- **CSV Export:** Alle Readings als CSV Download
- **Kein Multi-Value-Overlay:** Kann nicht beide SHT31-Werte gleichzeitig zeigen

#### sensors API Client (`sensors.ts`)

- `sensorsApi.queryData(query)`: Unterstützt `sensor_type` Filter → kann sht31_temp und sht31_humidity getrennt abfragen
- `sensorsApi.calibrate(espId, gpio, sensorType, points, method, saveToConfig)`: Pro Sub-Typ
- `sensorsApi.getStats(espId, gpio)`: OHNE sensor_type — kann bei Multi-Value nicht Sub-Typ-spezifische Stats liefern

### Bewertung

- **Kalibrierung:** SHT31 als factory-calibrated korrekt nicht kalibrierungsbedürftig. Aber kein Hinweis für den User, warum keine Kalibrierung angeboten wird
- **History:** Funktional für Einzelabfragen, aber keine Multi-Value-Overlay-Möglichkeit

### Lücken

| # | Lücke | Schwere |
|---|-------|---------|
| F1 | SensorHistoryView kann nicht beide SHT31-Werte gleichzeitig in einem Chart anzeigen — erfordert 2 separate Abfragen | Mittel |
| F2 | SensorHistoryView sensor_type-Filter ist Freitext statt Dropdown — User muss interne Sub-Typ-Namen kennen | Niedrig |
| F3 | `sensorsApi.getStats(espId, gpio)` ohne sensor_type-Parameter — bei gpio=0 liefert Server-Stats möglicherweise gemischte Werte beider Sub-Typen | Hoch |
| F4 | CalibrationWizard GPIO-Auswahl filtert nicht nach gewähltem sensor_type — User sieht alle GPIOs auch wenn sie nicht zum gewählten Typ passen | Niedrig |
| F5 | Kein UI-Hinweis für SHT31, dass Kalibrierung normalerweise nicht nötig ist — Panel zeigt nur kein Calibration-Section, ohne Erklärung | Niedrig |

### Code-Referenzen

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Frontend/src/components/calibration/CalibrationWizard.vue` | Komplett (~300 Zeilen) | Calibration-Flow |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | 92-95 | needsCalibration computed |
| `El Frontend/src/views/SensorHistoryView.vue` | Komplett (437 Zeilen) | History-View |
| `El Frontend/src/api/sensors.ts` | queryData(), calibrate(), getStats() | API-Methoden |

---

## Teil G: Edge Cases und Fehlerbehandlung

### IST-Zustand

#### Edge Case 1: Mehrere I2C-Sensoren am gleichen ESP (SHT31 + BMP280)

- **gpio=0 Kollision:** Beide Sensoren nutzen gpio=0 als I2C-Placeholder
- **Server:** Unterscheidet durch `sensor_type` (sht31_temp vs bmp280_temp) — 4 DB-Einträge auf gpio=0
- **sensor.store.ts:** Hybrid-Logik sollte nach `sensor_type` UND GPIO matchen
- **SensorSatellite:** Multi-Value-Gruppierung basiert auf `device_type` — SHT31-Werte werden korrekt von BMP280-Werten getrennt
- **SensorsView:** Key `espId-gpio` (z.B. `ESP_12AB-0`) wäre für alle 4 Sub-Sensoren IDENTISCH
- **SensorConfigPanel:** `sensorsApi.get(espId, 0)` ohne sensor_type gibt EINEN von 4 Einträgen zurück — unvorhersehbar welchen

#### Edge Case 2: SHT31 an Adresse 0x45 statt 0x44

- **AddSensorModal:** I2C-Adresse-Dropdown zeigt 0x44 (Default) und 0x45 (Alt) — User kann wählen
- **Server:** `i2c_address` wird im `SensorConfigCreate` Schema akzeptiert und gespeichert
- **Anzeige:** SensorSatellite zeigt keine I2C-Adresse an — wenn 2 SHT31 am gleichen ESP (0x44 + 0x45), nicht unterscheidbar in der UI

#### Edge Case 3: BME280 (3 Werte: Temp + Humidity + Pressure)

- **Frontend:** `MULTI_VALUE_DEVICES.bme280` definiert 3 Werte
- **Server:** `MULTI_VALUE_SENSORS` hat KEIN bme280, nur bmp280 (2 Werte: Temp + Pressure)
- **Konsequenz:** Frontend erwartet 3 Sub-Typen, Server liefert 2 — Humidity-Wert kommt nie an

#### Edge Case 4: WebSocket-Reconnect nach Verbindungsabbruch

- **sensor.store.ts:** Keine explizite Reconnect-Logik — delegiert an WebSocket-Service
- **Multi-Value State:** `multi_values` Dict bleibt im Store erhalten
- **Stale-Detection:** `handleSensorHealth()` setzt `stale` Status basierend auf Server-Maintenance
- **Risk:** Nach Reconnect könnten Multi-Values teilweise aktualisiert werden (z.B. nur sht31_temp kommt, sht31_humidity bleibt alt)

#### Edge Case 5: User wählt Sub-Typ im AddSensorModal

- **Szenario:** User wählt "sht31_temp" statt "SHT31" aus Dropdown
- **Server-Verhalten:** `is_multi_value_sensor("sht31_temp")` → FALSE (nur Base-Types triggern Splitting)
- **Ergebnis:** Server erstellt NUR EINEN Sensor (sht31_temp), kein sht31_humidity
- **Anzeige:** SensorSatellite sieht `is_multi_value=false` → Single-Value-Darstellung

#### Edge Case 6: Mock-ESP SHT31 Erstellung

- **esp.ts addSensor():** Mock-ESPs gehen durch `debugApi.addSensor()` — separater Pfad
- **Multi-Value-Splitting für Mocks:** Abhängig von debugApi-Implementierung — nicht in esp.ts sichtbar
- **Risiko:** Mock-ESPs könnten SHT31 als Single-Sensor erstellen (ohne Splitting)

#### Edge Case 7: Sensor-Löschung bei Multi-Value

- **EditSensorModal:** Delete nur für Mock-ESPs
- **API:** `sensorsApi.delete(espId, gpio)` — ohne sensor_type
- **Risiko:** Bei Löschung eines Sub-Typs (z.B. sht31_temp) bleibt sht31_humidity als "orphan" in der DB

#### Edge Case 8: Stale-Detection bei Multi-Value

- **sensor.store.ts `handleSensorHealth()`:** Setzt `stale` Flag am Sensor-Objekt
- **SensorSatellite:** Zeigt Stale-Indikator über `displayQuality`
- **Risiko:** Wenn nur EIN Sub-Wert stale wird (z.B. sht31_humidity kommt nicht mehr, sht31_temp läuft weiter), wird der Gesamtzustand trotzdem als "worst quality" aggregiert — korrekt, aber User sieht nicht WELCHER Sub-Wert das Problem hat

### Bewertung

- **Multi-I2C-Kollision** (gpio=0) ist das schwerwiegendste architektonische Problem — betrifft mehrere Ansichten und API-Calls
- **Sub-Typ-Selektion im Dropdown** ist ein UX-Problem mit funktionalen Konsequenzen
- **BME280 Frontend/Server-Diskrepanz** würde bei Benutzung sofort auffallen
- **Stale-Detection** ist korrekt implementiert, aber ohne Sub-Wert-Granularität

### Lücken

| # | Lücke | Schwere |
|---|-------|---------|
| G1 | gpio=0 Kollision bei mehreren I2C-Sensoren am gleichen ESP — SensorsView Key, Sparkline, SensorConfigPanel, SensorOverviewWidget können Sub-Sensoren verschiedener Devices nicht unterscheiden | Kritisch |
| G2 | BME280 im Frontend als 3-Wert Multi-Value definiert, Server hat nur BMP280 mit 2 Werten — Frontend erwartet bme280_humidity, Server liefert nie | Hoch |
| G3 | Sub-Typ-Selektion im AddSensorModal erstellt nur 1 statt 2 Sensoren — keine Warnung an User | Hoch |
| G4 | Sensor-Löschung ohne sensor_type-Parameter könnte bei Multi-Value nur einen Sub-Typ löschen und Orphans hinterlassen | Mittel |
| G5 | Kein I2C-Adress-Anzeige in SensorSatellite — 2 SHT31 am gleichen ESP (0x44 + 0x45) nicht unterscheidbar | Mittel |
| G6 | Mock-ESP Multi-Value-Verhalten unklar — Splitting könnte fehlen | Mittel |
| G7 | Stale-Detection zeigt nicht WELCHER Sub-Wert das Problem hat — nur aggregiertes Worst-Quality | Niedrig |

### Code-Referenzen

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Frontend/src/shared/stores/sensor.store.ts` | handleKnownMultiValueSensor(), handleDynamicMultiValueSensor() | Multi-Value WS-Handling |
| `El Frontend/src/components/esp/SensorSatellite.vue` | Multi-Value Rendering | Anzeige-Logik |
| `El Frontend/src/components/esp/AddSensorModal.vue` | getSensorTypeOptions(), Submit | Typ-Auswahl, Erstellung |
| `El Frontend/src/views/SensorsView.vue` | Sparkline-Key, Sensor-Card-Key | Key-Kollision |
| `El Frontend/src/utils/sensorDefaults.ts` | MULTI_VALUE_DEVICES bme280 | Frontend-only Definition |
| `El Frontend/src/api/sensors.ts` | get(), delete() | Fehlende sensor_type Parameter |

---

## Zusammenfassung: Alle Lücken nach Schwere

### Kritisch

| ID | Beschreibung |
|----|-------------|
| G1 | gpio=0 Kollision bei mehreren I2C-Sensoren — betrifft Keys, Sparklines, Config-Load, Widgets |

### Hoch

| ID | Beschreibung |
|----|-------------|
| A3 | GET ohne sensor_type bei gpio=0 gibt nur ERSTEN Treffer |
| A4 | BME280 nicht in Server-Registry (nur bmp280) |
| B1 | getSensorTypeOptions() zeigt Sub-Typen im Dropdown |
| B3 | BME280 Frontend/Server-Inkonsistenz |
| C1 | Sub-Typ-Auswahl im AddSensorModal verhindert Multi-Value-Split |
| C5 | gpio=0 hart für alle I2C → Mehrere I2C-Sensoren kollidieren |
| D2 | SensorsView Sparkline-Key identisch für Multi-Value Sub-Sensoren |
| D3 | SensorOverviewWidget kann Sub-Typen nicht unterscheiden |
| E1 | sensorsApi.get() ohne sensor_type → falsches Config-Laden |
| E3 | Live-Vorschau matcht nur nach GPIO, nicht nach sensor_type |
| F3 | sensorsApi.getStats() ohne sensor_type → gemischte Stats |
| G2 | BME280 3-Wert Frontend vs 2-Wert Server |
| G3 | Sub-Typ-Selektion erstellt nur 1 Sensor ohne Warnung |

### Mittel

| ID | Beschreibung |
|----|-------------|
| A1 | POST-Response gibt nur ersten Sub-Sensor zurück |
| A2 | SENSOR_TYPES-Validierungsliste ohne Sub-Typen |
| B2 | Base-Type SHT31/sht31 hat nur °C Unit (nicht Humidity) |
| B5 | sensor-schemas.ts SHT31 Key case-sensitiv |
| C3 | addSensor() erfährt Erfolg des 2. Sub-Sensors nur indirekt |
| C4 | Mock-ESP Multi-Value-Splitting unklar |
| D1 | SensorsView zeigt Sub-Typen als separate Karten |
| D4 | SensorHistoryView kein Multi-Value-Overlay |
| D6 | SensorValueCard ohne Multi-Value-Support |
| E2 | Kein Multi-Value-Gruppeneditor |
| E4 | Real-ESP SHT31 kann nicht gelöscht werden |
| E5 | Threshold-Config pro Sub-Typ statt pro physischem Sensor |
| F1 | SensorHistoryView kein Multi-Chart |
| G4 | Sensor-Löschung könnte Orphans hinterlassen |
| G5 | Keine I2C-Adress-Anzeige in SensorSatellite |
| G6 | Mock-ESP Multi-Value-Verhalten unklar |

### Niedrig

| ID | Beschreibung |
|----|-------------|
| B4 | 5 Case-Varianten für SHT31 fragil |
| C2 | DnD PascalCase-Matching fragil |
| D5 | SensorHistoryView sensor_type Freitext statt Dropdown |
| F2 | SensorHistoryView sensor_type Freitext |
| F4 | CalibrationWizard GPIO-Auswahl nicht nach Typ gefiltert |
| F5 | Kein UI-Hinweis für SHT31 Kalibrierung nicht nötig |
| G7 | Stale-Detection ohne Sub-Wert-Granularität |

---

## Architektur-Diagramm: SHT31 Datenpfad

```
┌─────────────────────┐
│   ESP32 (SHT31)     │
│   I2C Bus → 0x44    │
│   → Raw Temp + Hum  │
└────────┬────────────┘
         │ MQTT: sensor_data
         ▼
┌─────────────────────────────────────────────────────┐
│  Server (sensor_type_registry.py)                    │
│                                                      │
│  POST /sensors/{esp}/{gpio}                          │
│    → is_multi_value_sensor("sht31") = true           │
│    → Split: sht31_temp (DB entry 1, gpio=0)          │
│    →        sht31_humidity (DB entry 2, gpio=0)      │
│    → Response: nur sht31_temp zurückgegeben           │
│                                                      │
│  WS broadcast: 2x sensor_data Events                 │
│    → {sensor_type: "sht31_temp", gpio: 0, value: X}  │
│    → {sensor_type: "sht31_humidity", gpio: 0, value:Y}│
└────────┬────────────────────────────────────────────┘
         │ WebSocket
         ▼
┌─────────────────────────────────────────────────────┐
│  Frontend (sensor.store.ts)                          │
│                                                      │
│  handleKnownMultiValueSensor()                       │
│    → isMultiValueSensorType("sht31_temp") = true     │
│    → deviceType = "sht31"                            │
│    → sensor.multi_values = {                         │
│        sht31_temp: { value, unit: "°C", quality }    │
│        sht31_humidity: { value, unit: "%RH", quality }│
│      }                                               │
│    → is_multi_value = true                           │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────┐  ┌──────────────────────────┐
│ SensorSatellite.vue    │  │ SensorsView.vue           │
│ (ESP Orbital View)     │  │ (Flat List)               │
│                        │  │                           │
│ ✅ Multi-Value-Support │  │ ❌ Keine MV-Gruppierung   │
│ ✅ 2-Wert-Grid-Layout  │  │ ❌ Key-Kollision gpio=0   │
│ ✅ Quality-Aggregation  │  │ ❌ Sparkline-Kollision    │
│ ✅ Registry-Reihenfolge │  │                           │
└────────────────────────┘  └──────────────────────────┘
```
