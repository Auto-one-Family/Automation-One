# Auftrag: Uebersicht-Tab Redesign (HardwareView Level 1)

**Erstellt:** 2026-02-26
**Status:** OFFEN
**Prioritaet:** HOCH — Kernauftrag fuer Dashboard-UX
**Geschaetzter Aufwand:** ~8-12h
**Voraussetzung:** Hardware-Testlauf abgeschlossen (ESP32+SHT31 laeuft)
**Ziel-Agent:** frontend-development (auto-one Repo)

---

## IST-Zustand (Screenshot 2026-02-26)

Das Dashboard zeigt Route `/hardware` (HardwareView, Level 1 — Zone Accordion).

### Zone "test" (ZonePlate)

```
┌─────────────────────────────────────────────────────────────┐  ← iridescent Border
│  ˅  test                                 1 ESP  1/1 Online ⋮│  ← Zone-Header
│                                                             │
│  ┌───────────────────────────┐                              │
│  │ ● Mock #CD10       [MOCK] │                              │
│  │ ● Online              2S  │                              │
│  │ 🌡 Temp 0C79    0  °C ▬▬  │  ← PROBLEM: "Temp 0C79"    │
│  │ 🌡 SHT31       22  °C ▬▬  │  ← PROBLEM: "SHT31"        │
│  │ Öffnen                    │                              │
│  └───────────────────────────┘                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
   + Zone erstellen                                            ← Dashed Border
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘

                         ... Leerraum ...

┌─────────────────────────────────────────────────────────────┐
│ 🏠 NICHT ZUGEWIESEN  ❶                                   ˅ │  ← UnassignedDropBar
│                                                             │
│  ┌───────────────────────────┐                              │
│  │ [SIM] Mock #1C68          │  ← PROBLEM: "SIM" statt     │
│  │ ● Gerade eben             │     "MOCK" (inkonsistent)    │
│  └───────────────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

### Was bereits funktioniert (NICHT anfassen)
- Zone-Accordion auf/zuklappbar mit Chevron
- Zone-Header zeigt "1 ESP 1/1 Online" — klar und lesbar
- Drei-Punkt-Menue rechts oben im Zone-Header
- DeviceMiniCard zeigt bereits: Status-Dot, Online-Text, Sensor-Count (2S), einzelne Sensorzeilen mit Thermometer-Icons, Spark-Bars, "Oeffnen"-Link
- [MOCK] Badge auf der Card (lila)
- UnassignedDropBar am unteren Rand mit Count-Badge und Expand/Collapse
- "+ Zone erstellen" Placeholder mit gestrichelter Border
- Iridescent Border um Zonen
- Glasmorphism-Hintergrund

### Was KONKRET falsch ist

**Problem 1 — Sensor-Namen sind kryptisch:**
- `Temp 0C79` → Das ist `sensor_name` mit abgeschnittenem Device-ID-Suffix. Muss `Temperatur` heissen.
- `SHT31` → Das ist der `sensor_type` (Basis-Typ). Muss aufgeloest werden: SHT31 ist ein Multi-Value-Device mit Temperatur UND Luftfeuchte. Aktuell fehlt die Humidity komplett.

**Problem 2 — Multi-Value-Device nicht aufgeloest:**
- SHT31 hat 2 Werte (sht31_temp + sht31_humidity), zeigt aber nur EINEN Eintrag "SHT31 → 22 °C"
- Die Humidity (z.B. 45% RH) fehlt komplett in der Card
- Ursache: Die Card iteriert ueber `props.device.sensors` (Typ `unknown[]`) und nutzt den rohen `sensor.name` statt Multi-Value aufzuloesen. Die Fallback-Kette in Zeile ~144 ist `sensor.name || config?.label || sType` — zeigt also zuerst den rohen Server-Namen (z.B. "Temp 0C79")

**Problem 3 — "Temp 0C79" zeigt 0°C:**
- Dieser Sensor-Eintrag ist ein Artefakt aus der alten Konfiguration (vor dem Lifecycle-Fix)
- Wert 0°C ist Muell-Daten — stammt aus der Zeit wo SHT31 nur als Single-Value konfiguriert war
- Nach DB-Cleanup + Neu-Konfiguration sollte nur noch EIN SHT31-Eintrag mit 2 Werten existieren
- Die Card muss trotzdem robust sein: Wenn ein Sensor 0°C liefert, sollte klar sein ob das ein echter Wert oder stale Data ist

**Problem 4 — Spark-Bars ohne Aussagekraft:**
- Die gruenen horizontalen Balken (▬▬) neben den Werten sind CSS-Spark-Bars
- Sie zeigen den normalisierten Wert proportional zum Wertebereich
- Bei 0°C ist der Balken leer, bei 22°C ist er teilweise gefuellt
- Ohne Referenz-Skala, Label oder Tooltip sind die Bars bedeutungslos
- Sie nehmen Platz ein ohne Information zu vermitteln

**Problem 5 — Badge-Inkonsistenz Mock/SIM:**
- In der Zone: `[MOCK]` (lila Badge, via ESPCardBase Zeile 52)
- In der UnassignedDropBar: `[SIM]` (lila Badge, via UnassignedDropBar Zeile 211)
- Beide sind Mock-Devices, gleiche Farbe (`mock` variant = lila) — aber verschiedene Badge-TEXTE
- Root Cause: ESPCardBase nutzt `'MOCK'/'REAL'`, UnassignedDropBar nutzt `'SIM'/'HW'`
- Muss konsistent sein: EIN Begriff

**Problem 6 — Zone-Header ohne Aggregation:**
- Zone "test" zeigt `1 ESP 1/1 Online` — das ist gut als Status
- Aber keine Sensor-Aggregation: Welche Temperatur herrscht in der Zone? Welche Luftfeuchte?
- Bei einer Zone mit 1 Device waere z.B. `22°C | 45% RH` direkt im Header hilfreich
- Bei mehreren Devices: Durchschnittswerte

**Problem 7 — "Oeffnen"-Link statt Klick-auf-Card:**
- Die Card hat einen expliziten "Oeffnen"-Link unten
- Besser: Die gesamte Card ist klickbar (Standard-Pattern), "Oeffnen" als separater Link ist unueblich
- Card braucht `cursor: pointer` und Hover-Feedback

---

## Abgrenzung — was ist DIESER Auftrag, was NICHT

### DIESER Auftrag (Level 1 Darstellung)
- Sensor-Namen menschenlesbar machen (Typ-Labels statt rohe Namen/IDs)
- Multi-Value-Devices korrekt aufloesen (SHT31 → Temperatur + Luftfeuchte)
- Spark-Bars ersetzen durch aussagekraeftige Darstellung
- Badge-Konsistenz (MOCK/SIM vereinheitlichen)
- Zone-Header mit aggregierten Sensor-Werten
- Card-Klick statt "Oeffnen"-Link
- Subzone-Chips wenn Subzonen existieren

### NICHT dieser Auftrag (andere Auftraege)
- Level 2/3 (ESPOrbitalLayout, SensorSatellite) → bleibt wie es ist
- Monitor-Tab, Editor-Tab → nicht betroffen
- Store-Logik, Datenfluss → korrekt, nur Darstellung aendern
- Drag-Drop-Mechanik in useZoneDragDrop.ts → funktioniert, DnD-Fixes separat
- ESPCardBase + useESPStatus Composable → separat (`auftrag-hardware-tab-css-settings-ux.md`)
- Perspektiven-Toggle Grid/Monitor → separat (`auftrag-view-architektur-dashboard-integration.md`)
- SystemStatusBar global → separat (`auftrag-unified-monitoring-ux.md`)
- CSS-Extraktion (btn--primary, Teleport-Fix) → separat (`auftrag-hardware-tab-css-settings-ux.md`)

### Abhaengigkeiten
1. **Dieser Auftrag kann SOFORT starten** — keine Blocker
2. Block C (Sensor-Konsolidierung Helper) sollte VOR Block A und B laufen, da beide die Helper nutzen
3. Kompatibel mit spaeteren Auftraegen (ESPCardBase, Perspektiven-Toggle, DnD)

---

## Block A: DeviceMiniCard — Sensor-Darstellung fixen (3-4h)

**Datei:** `src/components/dashboard/DeviceMiniCard.vue`
**Referenz:** `src/utils/sensorDefaults.ts`, `src/utils/formatters.ts`

Die DeviceMiniCard hat bereits ein gutes Grundlayout. Es muss NICHT komplett umgebaut werden. Die Aenderungen betreffen die Sensor-Zeilen innerhalb der Card.

### A1: Sensor-Zeilen mit menschenlesbaren Labels

**IST:**
```
🌡 Temp 0C79    0  °C ▬▬
🌡 SHT31       22  °C ▬▬
```

**SOLL:**
```
🌡 Temperatur      22.0 °C
💧 Luftfeuchte     45.2 %RH
```

**Regeln:**
- Sensor-Typ-Label aus `SENSOR_TYPE_CONFIG[type].label` verwenden, NICHT `sensor_name`
- Icon aus `SENSOR_TYPE_CONFIG[type].icon` — verschiedene Icons je Typ (Thermometer, Droplets, Gauge, Sun, etc.)
- Wert formatiert mit `formatSensorValueWithUnit(value, type)` — eine Dezimalstelle
- Unit direkt hinter dem Wert, kein Pfeil-Separator (→)
- Kein Device-ID-Suffix im Label

**Label-Zuordnung (nach Aufloesung durch groupSensorsByBaseType — kurze Labels OHNE Geraete-Suffix):**

| Aufgeloester sensor_type | Anzeige-Label (SOLL) | Icon (IST im Code) | Unit (IST) |
|--------------------------|---------------------|---------------------|------------|
| `sht31_temp` | Temperatur | Thermometer | °C |
| `sht31_humidity` | Luftfeuchte | Droplets | % RH |
| `DS18B20` / `ds18b20` | Temperatur | Thermometer | °C |
| `BME280` (als bme280_temp) | Temperatur | Thermometer | °C |
| `BME280_humidity` | Luftfeuchte | Droplets | % RH |
| `BME280_pressure` | Luftdruck | Gauge | hPa |
| `moisture` | Bodenfeuchte | Droplets | % |
| `pH` | pH-Wert | Droplet | pH |
| `EC` | Leitfaehigkeit | Zap | µS/cm |
| `light` | Licht | Sun | lux |
| `co2` | CO2 | Cloud | ppm |
| `flow` | Durchfluss | Waves | L/min |

**HINWEIS:** Die kurzen Labels ("Temperatur", "Luftfeuchte") kommen aus dem `groupSensorsByBaseType` Helper (Block C), der die MULTI_VALUE_DEVICES.values[].label nutzt — dort stehen bereits Kurzlabels. Fuer Single-Value-Sensoren (DS18B20, pH etc.) muessen die SENSOR_TYPE_CONFIG Labels gekuerzt werden (Geraete-Suffix entfernen). Siehe Block C4.

### A2: Multi-Value-Devices aufloesen

**IST:** SHT31 zeigt als 1 Zeile "SHT31 → 22 °C" — Humidity fehlt

**SOLL:** SHT31 zeigt als 2 Zeilen:
```
🌡 Temperatur      22.0 °C
💧 Luftfeuchte     45.2 %RH
```

**Implementierung:**
- `MULTI_VALUE_DEVICES` aus sensorDefaults.ts nutzen um zu erkennen dass SHT31 Temp+Humidity liefert
- Ueber die aufgeloesten Wert-Typen (`sht31_temp`, `sht31_humidity`) iterieren, NICHT ueber den Basis-Typ
- Nutze den neuen Helper `groupSensorsByBaseType()` (Block C) um `props.device.sensors` (unknown[]) zu gruppieren
- **Fallback-Kette umdrehen:** Zuerst `SENSOR_TYPE_CONFIG[type].label`, dann `sensor.name` als Fallback (aktuell ist es umgekehrt — Zeile ~144)
- Jeder Wert-Typ bekommt eine eigene Zeile mit eigenem Icon und Label

### A3: Spark-Bars entfernen

**IST:** Gruene horizontale 3px-Balken rechts neben den Werten, proportional zum Wertebereich

**SOLL:** Spark-Bars komplett entfernen — sowohl Template-Code ALS AUCH CSS-Klassen (`.device-mini-card__spark-bar` und `.device-mini-card__spark-fill`, ca. Zeilen 538-550). Sie liefern ohne Referenz-Skala keine brauchbare Information und nehmen Platz weg.

**Stattdessen — Quality-Indikator per Textfarbe:**
- Wert im normalen Bereich → Standard-Textfarbe (`var(--color-text)`)
- Wert ausserhalb Plausibilitaetsbereich → orange Text (`var(--color-warning)`)
- Wert = 0 bei einem Sensor der nie 0 sein sollte (z.B. Luftfeuchte) → gedimmt + `?` Suffix (`var(--color-text-muted)`) als Hinweis auf fragwuerdige Daten
- Kein Wert vorhanden → `--` anzeigen in gedimmter Farbe

### A4: "Oeffnen"-Link durch Card-Klick ersetzen

**IST:** "Oeffnen" als blauer Text-Link unter den Sensoren

**SOLL:**
- "Oeffnen"-Link entfernen
- Card hat bereits `cursor: pointer`, Hover-Shadow und emittiert ein `click` Event mit `originRect` — das funktioniert. HardwareView ruft `zoomToDevice(deviceId)` auf, das `router.push({ name: 'hardware-esp', params: { zoneId, espId: deviceId } })` ausfuehrt. **Kein neuer Code noetig fuer die Klick-Navigation — nur den "Oeffnen"-Link-Text entfernen.**
- Hover-State leicht verbessern: Zum bestehenden Shadow einen minimalen `scale(1.01)` Transform ergaenzen (subtle, nicht aufdringlich)
- Kleines Chevron-Icon (ChevronRight, 14px, `var(--color-text-muted)`) rechts unten in der Card als visueller Drill-Down-Hint — ChevronRight ist bereits im Projekt importiert (AccordionSection u.a.)

### A5: Badge-Konsistenz (MOCK/SIM)

**IST:** Zone-Card (via ESPCardBase) zeigt `[MOCK]` (lila, variant `mock`), UnassignedDropBar zeigt `[SIM]` (ebenfalls lila variant `mock` — nur der TEXT ist anders, Farbe ist identisch). Root Cause: `UnassignedDropBar.vue` Zeile 211: `isMock(device) ? 'SIM' : 'HW'`, waehrend `ESPCardBase.vue` Zeile 52: `isMock.value ? 'MOCK' : 'REAL'`

**SOLL:** Einheitlich `[MOCK]` fuer alle Mock-Devices. Ein Badge-Text, eine Farbe:
- `[MOCK]` → `var(--color-mock)` (lila) — Software-generierte Testdaten
- Kein Badge fuer Real-Devices — Real ist der Default, braucht keinen Badge

**Implementierung:** Badge wird in `ESPCardBase` bestimmt via `isMock.value ? 'MOCK' : 'REAL'`. `BaseBadge.vue` (Pfad: `src/shared/design/primitives/BaseBadge.vue`) hat die Varianten `mock` und `real`. Das Backend liefert KEINEN SIM-Zustand — `ESPDevice` hat kein `is_simulator` oder `source` Feld. Was aktuell als `[SIM]` in der UnassignedDropBar erscheint, muss auf `[MOCK]` vereinheitlicht werden. Die UnassignedDropBar rendert Devices moeglicherweise ueber einen anderen Code-Pfad als ZonePlate — dort den Badge-Text pruefen und angleichen.

**TODO (spaeter, nicht in diesem Auftrag):** Wenn Wokwi-Simulator-Devices unterschieden werden sollen, braucht das Backend ein neues Feld (z.B. `device_source: 'mock' | 'simulator' | 'hardware'`). Dann kann ein `[SIM]` Badge mit eigener Farbe eingefuehrt werden.

### A6: Compact-Modus (UnassignedDropBar) anpassen

Der Compact-Modus in der UnassignedDropBar muss die gleichen Badge-Regeln befolgen (A5). Ausserdem:
- Status-Zeile "Gerade eben" beibehalten (ist der Last-Seen-Timestamp — gut)
- Falls Sensoren vorhanden: 1-Zeilen-Summary unter dem Namen: `22°C 45%` (kompakt, ohne Labels)
- Falls keine Sensoren: nur Name + Badge + Last-Seen

---

## Block B: ZonePlate — Header-Aggregation und Subzonen (2-3h)

**Datei:** `src/components/dashboard/ZonePlate.vue`
**Referenz:** `src/utils/sensorDefaults.ts`

### B1: Aggregierte Sensor-Werte im Zone-Header

**IST:**
```
˅  test                                 1 ESP  1/1 Online ⋮
```

**SOLL:**
```
˅  test           22.0°C  45%RH         1 ESP  1/1 Online ⋮
```

**Design:**
- Aggregierte Werte stehen ZWISCHEN Zone-Name und ESP-Count
- Werte in `var(--color-text-muted)` (dezenter als der Zone-Name)
- Schriftgroesse `text-xs` (kleiner als Zone-Name)
- Trennzeichen zwischen Werten: 2 Leerzeichen (kein Pipe, zu visuell schwer)
- Icons weglassen im Header — zu viel Noise auf der Ueberblicksebene

**Aggregationslogik je nach Device-Anzahl:**
- **0 Devices:** Keine Werte anzeigen
- **1 Device:** Direkte Werte des Devices: `22.0°C  45%RH`
- **2-5 Devices:** Durchschnitt: `Ø 21.5°C  Ø 52%RH`
- **6+ Devices:** Durchschnitt + Ausreisser-Count wenn vorhanden: `Ø 22°C  Ø 48%RH  ⚠1`

**Welche Sensor-Typen anzeigen:**
- Maximal 3 verschiedene Sensor-Typen im Header (die haeufigsten)
- Temperatur und Luftfeuchte haben Vorrang (am universellsten)
- Nutze `aggregateZoneSensors()` Helper (Block C)

### B2: Zone-Status-Indikator verfeinern

**IST:** `1/1 Online` als weisser Text — funktioniert, aber kein Farb-Feedback

**SOLL:** Farbiger Status-Dot VOR dem Text:
- `● 1/1 Online` (gruen) — `var(--color-success)` — alle Devices online
- `● 2/3 Online` (gelb) — `var(--color-warning)` — mindestens 1 offline/stale
- `● 0/3 Offline` (rot) — `var(--color-error)` — alle offline (tokens.css Zeile 67: `--color-error: #f87171`)
- `● - Leer` (grau) — `var(--color-text-muted)` — keine Devices

Dot-Groesse: 8px, gleicher Stil wie der Status-Dot auf der DeviceMiniCard.

### B3: Subzone-Chips (wenn Subzonen vorhanden)

**IST:** Keine Subzone-Darstellung auf Level 1

**SOLL:** Wenn eine Zone Subzonen hat, Chips direkt unter dem Zone-Header:
```
˅  Gewaechshaus    22°C  48%RH          3 ESP  3/3 Online ⋮
   [Kammer A ●]  [Kammer B ●]  [Trocknung ●]
```

- Chips als kleine Pills (Border-Radius, kein Hintergrund, nur Border + Text)
- Farbiger Dot (4px) im Chip = Subzone-Status (gruen/gelb/rot)
- Klick auf Chip → filtert die DeviceMiniCards innerhalb der Zone auf diese Subzone
- Klick auf bereits aktiven Chip → Filter aufheben (alle anzeigen)
- **Datenquelle:** ZonePlate hat bereits ein `subzoneGroups` computed das Devices nach `device.subzone_id` / `device.subzone_name` gruppiert — darauf direkt aufbauen. `zone.store.ts` speichert KEINE Subzone-Liste, die Daten kommen von den Device-Properties selbst
- Wenn Zone keine Subzonen hat → keine Chips anzeigen (kein leerer Platz)

---

## Block C: Sensor-Konsolidierung Helper (2-3h)

**Datei:** `src/utils/sensorDefaults.ts` (erweitern)

Dieser Block liefert die Helper-Funktionen die Block A und B brauchen. **MUSS ZUERST implementiert werden.**

### C1: groupSensorsByBaseType()

**WICHTIG — Datenstruktur:** `props.device.sensors` ist `unknown[]`. Jeder Sensor hat Felder wie `sensor_type`, `raw_value`, `name`, `unit`, `gpio`, `quality`. Ein typisiertes Interface definieren:

```typescript
/** Typisierung fuer die rohen Sensor-Daten aus props.device.sensors */
interface RawSensor {
  sensor_type: string
  raw_value: number | null
  name: string
  unit?: string
  gpio?: number
  quality?: number
}

interface GroupedSensor {
  baseType: string              // z.B. 'sht31', 'ds18b20', 'bme280'
  label: string                 // z.B. 'SHT31' (Display-Name des Basis-Geraets)
  values: {
    type: string                // z.B. 'sht31_temp'
    label: string               // z.B. 'Temperatur'
    value: number | null        // z.B. 22.0
    unit: string                // z.B. '°C'
    icon: string                // z.B. 'Thermometer' (Lucide Icon-Name)
    quality: 'normal' | 'warning' | 'stale' | 'unknown'
  }[]
}

/**
 * Gruppiert Sensoren eines Devices nach Basis-Typ.
 *
 * Eingabe: [{sensor_type: 'sht31_temp', raw_value: 22.0}, {sensor_type: 'sht31_humidity', raw_value: 45.2}]
 * Ausgabe: [{baseType: 'sht31', label: 'SHT31', values: [{type: 'sht31_temp', label: 'Temperatur', ...}, ...]}]
 *
 * Einzelwert-Sensoren (DS18B20) → eine Gruppe mit einem Wert.
 * Multi-Value-Sensoren (SHT31, BME280) → eine Gruppe mit mehreren Werten.
 */
export function groupSensorsByBaseType(sensors: RawSensor[]): GroupedSensor[]
```

Nutzt `MULTI_VALUE_DEVICES`, `BASE_TYPE_TO_DEVICE` und `SENSOR_TYPE_CONFIG` um Basis-Typen und Wert-Typen zu mappen.

**ACHTUNG — MULTI_VALUE_DEVICES Keys:** Die Registry hat lowercase Keys: `sht31`, `bmp280`. BME280 wird separat als `BME280_CONFIG` erstellt und via `MULTI_VALUE_DEVICES['bme280']` eingefuegt. Der Helper muss case-insensitive matchen oder den `BASE_TYPE_TO_DEVICE` Lookup nutzen.

### C2: aggregateZoneSensors()

```typescript
interface ZoneAggregation {
  sensorTypes: {
    type: string              // z.B. 'temperature' (abstrahierter Typ)
    label: string             // z.B. 'Temperatur'
    avg: number
    min: number
    max: number
    count: number
    unit: string
  }[]
  deviceCount: number
  onlineCount: number
}

/**
 * Erstellt Zone-Aggregation aus allen Devices einer Zone.
 * Fasst gleiche Sensor-Kategorien zusammen (alle Temperatur-Sensoren,
 * egal ob SHT31, DS18B20 oder BME280).
 *
 * Sortierung: Temperatur > Luftfeuchte > Rest alphabetisch
 * Maximal 3 Sensor-Typen zurueckgeben.
 */
export function aggregateZoneSensors(devices: Device[]): ZoneAggregation
```

### C3: formatAggregatedValue()

```typescript
/**
 * Formatiert einen aggregierten Wert fuer den Zone-Header.
 *
 * 1 Device:   "22.0°C"
 * 2-5:        "Ø 21.5°C"
 * 6+:         "Ø 22°C"
 */
export function formatAggregatedValue(
  agg: ZoneAggregation['sensorTypes'][0],
  deviceCount: number
): string
```

### C4: Typ-Labels sicherstellen

**ACHTUNG — Tatsaechliche Keys in SENSOR_TYPE_CONFIG (Case-Sensitiv!):**

Die Keys im Code nutzen gemischtes Casing. Tabelle zeigt IST-Keys und was angepasst werden muss:

| IST Key in Code | IST label | IST icon | IST unit | SOLL label (kurz, ohne Geraet) |
|-----------------|-----------|----------|----------|-------------------------------|
| `sht31` (Base) | SHT31 | Thermometer | °C | (nicht direkt anzeigen — via sht31_temp/humidity) |
| `sht31_temp` | Temperatur (SHT31) | Thermometer | °C | Temperatur |
| `sht31_humidity` | Luftfeuchtigkeit (SHT31) | Droplets | % RH | Luftfeuchte |
| `DS18B20` | Temperatur (DS18B20) | Thermometer | °C | Temperatur |
| `ds18b20` | Temperatur (DS18B20) | Thermometer | °C | Temperatur |
| `BME280` (Base) | Temperatur (BME280) | Thermometer | °C | (nicht direkt anzeigen — via bme280_temp/humidity/pressure) |
| `BME280_humidity` | Luftfeuchtigkeit (BME280) | Droplets | % RH | Luftfeuchte |
| `BME280_pressure` | Luftdruck (BME280) | Gauge | hPa | Luftdruck |
| `moisture` | Bodenfeuchte | Droplets | % | Bodenfeuchte |
| `pH` | pH-Wert | Droplet | pH | pH-Wert |
| `EC` | Leitfaehigkeit (EC) | Zap | µS/cm | Leitfaehigkeit |
| `light` | Lichtsensor | Sun | lux | Licht |
| `co2` | CO2-Sensor | Cloud | ppm | CO2 |
| `flow` | Durchflusssensor | Waves | L/min | Durchfluss |

**HINWEIS:** Base-Typ-Keys (`sht31`, `BME280`) haben Labels wie "SHT31" — diese werden NICHT direkt in der Card angezeigt. Der `groupSensorsByBaseType` Helper loest sie auf in die Wert-Typen (`sht31_temp`, `sht31_humidity`). Die MULTI_VALUE_DEVICES Registry hat eigene kurze Labels (z.B. "Temperatur", "Luftfeuchtigkeit") ohne Geraete-Suffix — diese nutzen.

**Aenderungen an SENSOR_TYPE_CONFIG:**
1. Labels: Geraete-Suffix entfernen — `"Temperatur (SHT31)"` → `"Temperatur"`. Der `groupSensorsByBaseType` Helper zeigt den Geraetetyp separat wenn noetig
2. Labels: `"Luftfeuchtigkeit"` → `"Luftfeuchte"` (kuerzer, passt besser in Cards)
3. Units: `"% RH"` → `"%RH"` (ohne Leerzeichen, kompakter)
4. Icons NICHT aendern — bestehende Icons beibehalten (pH bleibt Droplet, co2 bleibt Cloud)

**Lowercase-Aliase ergaenzen** fuer konsistenten Lookup: `soil_moisture` → `moisture`, `ph` → `pH`, `ec` → `EC`, `bme280_temp` → `BME280`, `bme280_humidity` → `BME280_humidity`, `bme280_pressure` → `BME280_pressure`, `ds18b20` → `DS18B20`. Alternativ: Lookup-Funktion die case-insensitive matcht.

---

## Block D: HardwareView Layout-Anpassungen (1-2h)

**Datei:** `src/views/HardwareView.vue`

### D1: Zone-Reihenfolge

**IST:** Zonen in Store-Reihenfolge (unbestimmt)

**SOLL:**
1. Zonen mit Offline/Warning-Devices zuerst (Probleme nach oben)
2. Zonen mit Online-Devices
3. Leere Zonen zuletzt
4. Alphabetisch innerhalb gleicher Kategorie
5. UnassignedDropBar bleibt fixiert am unteren Rand (ist keine sortierbare Zone)

### D2: Leere-Zone-State

**IST:** Zone ohne Devices zeigt leeren Accordion-Body

**SOLL:** `EmptyState.vue` (existiert unter `src/shared/design/patterns/EmptyState.vue`, Props: `icon`, `title`, `description`, `actionText`) mit:
- Icon: `PackageOpen` (Lucide) — **MUSS importiert werden**, ist noch nicht im Projekt verwendet
- Text (title): "Keine Geraete zugewiesen"
- Subtext (description): "Ziehe Geraete aus der Leiste unten in diese Zone"
- Wenn ein Device ueber die Zone gedraggt wird: gestrichelte Border + leichter Hintergrund-Highlight als Drop-Target-Indikator

### D3: Zone-Accordion Collapse-Persistenz

**IST:** Collapse-State geht bei Seiten-Reload verloren

**SOLL:**
- Collapse-State in `localStorage` persistieren (Key: `ao-zone-collapse-${zoneId}`)
- Default beim ersten Besuch: Alle Zonen aufgeklappt (bis max 4 Zonen), ab 5+ nur die erste aufgeklappt
- Zonen mit Problemen (Offline-Devices): Immer aufgeklappt, unabhaengig vom gespeicherten State
- Animation: `max-height` Transition (200ms ease-out) — falls nicht bereits vorhanden

---

## SOLL-Design komplett (ASCII-Mockup des Endergebnisses)

### Zone mit 1 Device (SHT31 Multi-Value, Real-ESP):
```
┌─────────────────────────────────────────────────────────────────┐
│ ˅  Gewaechshaus     22.0°C  45%RH       1 ESP  ● 1/1 Online ⋮ │
│    [Kammer A ●]  [Kammer B ●]                                   │
│                                                                 │
│  ┌────────────────────────────────┐                             │
│  │ ● ESP_472204                   │                             │
│  │ ● Online                   2S  │                             │
│  │ 🌡 Temperatur      22.0 °C     │                             │
│  │ 💧 Luftfeuchte     45.2 %RH    │                             │
│  │                            ›   │  ← Chevron als Drill-Down   │
│  └────────────────────────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Zone mit 3 Devices (gemischt Mock + Real):
```
┌─────────────────────────────────────────────────────────────────┐
│ ˅  Outdoor        Ø 19.3°C  Ø 62%RH    3 ESP  ● 2/3 Online ⋮ │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ ● ESP_472204         │  │ ● Mock #AB12  [MOCK] │             │
│  │ ● Online         2S  │  │ ● Online         1S  │             │
│  │ 🌡 Temperatur 21.0°C │  │ 🌡 Temperatur 22.0°C │             │
│  │ 💧 Luftfeu.  55.0%RH │  │                   ›  │             │
│  │                   ›  │  └──────────────────────┘             │
│  └──────────────────────┘  ┌──────────────────────┐             │
│                            │ ● ESP_891BC7         │             │
│                            │ ● Offline        3S  │ ← rote Dot │
│                            │ 🌡 Temperatur   --    │ ← kein Wert│
│                            │ 💧 Luftfeu.    --     │             │
│                            │                   ›  │             │
│                            └──────────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Leere Zone:
```
┌─────────────────────────────────────────────────────────────────┐
│ ˅  Lager                                0 ESP  ● - Leer     ⋮ │
│                                                                 │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│    📦 Keine Geraete zugewiesen                                  │
│       Ziehe Geraete aus der Leiste unten in diese Zone          │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### UnassignedDropBar (Compact-Modus):
```
┌─────────────────────────────────────────────────────────────────┐
│ 🏠 NICHT ZUGEWIESEN  ❷                                       ˅ │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ [MOCK] Mock #1C68    │  │ [MOCK] Mock #2D99    │             │
│  │ ● Gerade eben        │  │ ● Vor 2 Min          │             │
│  │ 22°C  45%            │  │ --                    │ ← keine    │
│  └──────────────────────┘  └──────────────────────┘    Sensoren │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Dateien die bearbeitet werden

| Datei | Aenderung | Block |
|-------|-----------|-------|
| `src/utils/sensorDefaults.ts` | groupSensorsByBaseType, aggregateZoneSensors, formatAggregatedValue, Labels ergaenzen | C (ZUERST) |
| `src/components/dashboard/DeviceMiniCard.vue` | Sensor-Labels, Multi-Value-Aufloesung, Spark-Bars entfernen, Card klickbar, Badge-Konsistenz, Chevron | A |
| `src/components/dashboard/ZonePlate.vue` | Header-Aggregation, Status-Dot, Subzone-Chips | B |
| `src/views/HardwareView.vue` | Zone-Sortierung, Leere-Zone-State, Accordion-Persistenz | D |
| `src/shared/design/primitives/BaseBadge.vue` | Badge-Text/Farb-Konsistenz pruefen (MOCK vs SIM vereinheitlichen) | A5 |

**Keine neuen Dateien.** Alles in bestehenden Dateien.

---

## Reihenfolge der Implementierung

1. **Block C zuerst** — Helper-Funktionen die Block A und B brauchen
2. **Block A** — DeviceMiniCard Sensor-Darstellung (groesster visueller Impact)
3. **Block B** — ZonePlate Header-Aggregation (nutzt Block C Helper)
4. **Block D** — HardwareView Layout (unabhaengig, kann auch parallel zu B)

---

## Verifikation

Nach jedem Block:
1. `npm run type-check` — keine TypeScript-Fehler
2. `npm run test` — Vitest-Tests gruen (besonders sensorDefaults-Tests)
3. Manuell im Browser pruefen:

**Block C:**
- Unit-Tests fuer groupSensorsByBaseType mit SHT31, BME280, DS18B20
- Unit-Tests fuer aggregateZoneSensors mit 0, 1, 3, 7 Devices

**Block A:**
- DeviceMiniCard zeigt "Temperatur 22.0 °C" statt "Temp 0C79 → 0"
- SHT31-Device zeigt Temperatur UND Luftfeuchte als separate Zeilen
- Keine Spark-Bars mehr sichtbar
- Hover auf Card zeigt Pointer-Cursor + Shadow
- Klick auf Card navigiert zu Level 2
- Mock-Devices: [MOCK] Badge konsistent in Zone und UnassignedDropBar
- Wert 0°C bei Temp zeigt fragwuerdige Daten visuell an (gedimmt)

**Block B:**
- Zone-Header zeigt "22.0°C 45%RH" nach Zone-Name
- Zone mit 3 Devices zeigt "Ø 21.5°C Ø 52%RH"
- Leere Zone zeigt keine Werte
- Status-Dot vor "1/1 Online" ist gruen
- Subzone-Chips erscheinen wenn Subzonen existieren
- Subzone-Chip-Klick filtert Devices

**Block D:**
- Zonen mit Offline-Devices stehen oben
- Leere Zone zeigt EmptyState mit PackageOpen-Icon
- Accordion-State bleibt nach Reload erhalten

## Commit-Strategie

4 Commits (1 pro Block):
1. `feat(utils): add sensor grouping and zone aggregation helpers`
2. `feat(dashboard): fix DeviceMiniCard sensor labels, multi-value display, and click behavior`
3. `feat(dashboard): add zone header aggregation, status dot, and subzone chips`
4. `feat(dashboard): improve zone ordering, empty states, and collapse persistence`

---

## Was dieser Auftrag BEWUSST NICHT macht

- **Keine ECharts-Sparklines** — braucht Sensor-History-Daten mit resolution-Parameter (noch nicht implementiert). Kommt in separatem Auftrag
- **Keine Zone-Umsortierung per DnD** — Zone-Reihenfolge wird algorithmisch bestimmt
- **Kein Perspektiven-Toggle** → `auftrag-view-architektur-dashboard-integration.md`
- **Kein ESPCardBase Refactoring** → `auftrag-hardware-tab-css-settings-ux.md`
- **Keine DnD-Verbesserungen** → `auftrag-dnd-konsolidierung-interaktion.md`
- **Keine Alert-Integration** → `auftrag-unified-monitoring-ux.md`

---

## Verifizierte Code-Fakten (2026-02-26)

Folgende Fakten wurden gegen den tatsaechlichen Code geprueft:

| Fakt | Status |
|------|--------|
| DeviceMiniCard.vue existiert, hat Spark-Bars + sensor.name + "Oeffnen"-Button | Bestaetigt |
| ZonePlate.vue hat `subzoneGroups` computed (Subzone-Gruppierung) | Bestaetigt |
| HardwareView.vue importiert EmptyState aus `@/shared/design/patterns` | Bestaetigt |
| sensorDefaults.ts hat SENSOR_TYPE_CONFIG, MULTI_VALUE_DEVICES, formatSensorValueWithUnit | Bestaetigt |
| Card emittiert bereits `click` Event → HardwareView ruft `zoomToDevice()` mit `router.push` | Bestaetigt |
| Card hat bereits `cursor: pointer` und Hover-Shadow | Bestaetigt |
| ChevronRight Icon ist im Projekt bereits importiert | Bestaetigt |
| `useZoomNavigation` existiert NICHT — Navigation geht ueber `router.push` direkt | Korrigiert im Plan |
| `sensor_configs` heisst im Code `sensors` (unknown[]) | Korrigiert im Plan |
| SENSOR_TYPE_CONFIG Keys: gemischtes Casing (sht31, DS18B20, BME280, pH, EC) | Korrigiert im Plan |
| Subzone-Daten kommen aus Device-Properties, NICHT aus zone.store.ts | Korrigiert im Plan |
| BaseBadge.vue liegt unter `primitives/`, nicht direkt unter `design/` | Korrigiert im Plan |
| Backend hat keinen SIM-Zustand — nur MOCK/REAL | Korrigiert im Plan |
| `--color-error` existiert in tokens.css (#f87171), `--color-danger` existiert NICHT | Korrigiert im Plan |
| PackageOpen Icon muss importiert werden (noch nicht im Projekt) | Hinweis im Plan |
| MULTI_VALUE_DEVICES Keys: lowercase (sht31, bmp280, bme280) | Hinweis im Plan |

---

## Querverweise

| Thema | Datei |
|-------|-------|
| DnD Zone-Assignment | `frontend-konsolidierung/auftrag-dnd-konsolidierung-interaktion.md` |
| CSS-Sanierung + ESPCardBase | `frontend-konsolidierung/auftrag-hardware-tab-css-settings-ux.md` |
| View-Architektur + Perspektiven | `frontend-konsolidierung/auftrag-view-architektur-dashboard-integration.md` |
| Monitoring + Alerts | `frontend-konsolidierung/auftrag-unified-monitoring-ux.md` |
| DnD Sensor/Aktor Orbital Bugs | `auftrag-dnd-sensor-aktor-drop-fix.md` |
| Dashboard-UX Forschung | `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` |
| Config-Panel UX | `wissen/iot-automation/iot-device-config-panel-ux-patterns.md` |
| Sensor-Konsolidierung Grundlage | `auftrag-device-sensor-lifecycle-fix.md` (Multi-Value-Splitting) |
