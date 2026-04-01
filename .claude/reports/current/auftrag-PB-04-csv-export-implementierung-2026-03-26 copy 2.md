# PB-04 Implementierung: CSV-Export fuer Sensordaten

**Datum:** 2026-03-26
**Typ:** Implementierungsauftrag (Frontend-Agent, auto-one Repo)
**Scope:** MVP — Frontend-only CSV-Export aus bestehender Sensor-Data API
**Status:** IMPLEMENTIERT (2026-03-26) — Build gruen (vue-tsc -b && vite build)
**Aufwand:** ~3-4h
**Abhaengigkeiten:** Keine — Editor Phase A (useSensorOptions, useSensorId) ist KOMPLETT
**Agent:** Self-contained — ohne Zugriff auf externe Dokumente ausfuehrbar

---

## Hintergrund und Ziel

Gaertner, Forscher und Cannabis-Anwender brauchen Rohdaten fuer externe Analyse (Excel, R, Python, Kundenberichte, Compliance-Dokumentation). AutomationOne hat alle Daten (sensor_data Tabelle mit Zeitreihen, Server-Aggregation mit resolution-Parameter), aber bisher keine Export-Funktion.

**MVP-Scope (Option C — Hybrid):** Das Frontend nutzt die bestehende `GET /api/v1/sensors/data` API mit aggregierten Daten (resolution-Parameter), konvertiert die JSON-Response clientseitig zu CSV und loest einen Browser-Download aus. Kein neuer Backend-Endpoint noetig. Die Aggregation (z.B. 1h-Schnitt fuer 30-Tage-Export) haelt die Datenmenge handhabbar.

**Abgrenzung von bestehenden Export-Stellen:**
- `MonitorView.vue` hat einen anonymen Inline-CSV-Export (ca. Zeile 660-684) — exportiert die `detailReadings` des aktuell ausgewaehlten Sensors als CSV (timestamp,raw_value,processed_value,unit,quality). Es gibt keine benannte Export-Funktion.
- `SensorHistoryView.vue` hat eine `exportCsv()` Funktion — exportiert ebenfalls CSV (timestamp,raw_value,processed_value,unit,quality).

**Ergebnis dieses Auftrags:** Ein Export-Icon im Widget-Header (HistoricalChartWidget + MultiSensorChartWidget). Klick oeffnet ein kompaktes Konfigurations-Dialog. Download wird als `.csv` im Browser ausgeloest.

---

## IST-Zustand

### Bestehende Infrastruktur (nutzen, nicht neu schreiben)

**Sensor-Data API:**
```
GET /api/v1/sensors/data
  ?esp_id=<uuid>
  &gpio=<int>
  &sensor_type=<string>
  &start_time=<ISO8601>
  &end_time=<ISO8601>
  &resolution=<raw|1m|5m|1h|1d>
  &limit=<int>
```
Response-Format: `SensorDataResponse` mit `readings: SensorReading[]`:
```json
{
  "success": true,
  "esp_id": "...",
  "gpio": 0,
  "sensor_type": "sht31_temp",
  "resolution": "1h",
  "readings": [
    {
      "timestamp": "2026-03-26T10:00:00+00:00",
      "raw_value": 22.4,
      "processed_value": 22.4,
      "unit": "°C",
      "quality": "good",
      "min_value": 21.8,
      "max_value": 23.1,
      "sample_count": 12
    }
  ],
  "count": 1,
  "time_range": { "start": "...", "end": "..." }
}
```
**Wichtig:** Response ist KEIN einfaches Array. Aggregierte Felder heissen `min_value`/`max_value`/`sample_count`. Es gibt KEIN `avg` Feld — `processed_value` IST der Aggregationswert bei aggregierten Daten.

**useSensorId Composable** (`src/composables/useSensorId.ts`):
- Parsed `espId:gpio:sensorType` aus dem Widget-Config `sensorId` Feld
- Liefert `{ espId, gpio, sensorType }` als reaktive Werte

**autoResolution.ts** (`src/utils/autoResolution.ts`):
- Berechnet automatisch die passende Aggregationsstufe fuer einen Zeitraum
- Bereits in HistoricalChartWidget und MultiSensorChartWidget genutzt

**sensorsApi** (`src/api/sensors.ts`):
- Enthaelt `sensorsApi.queryData(query?: SensorDataQuery)` — liefert `SensorDataResponse` mit `readings: SensorReading[]`
- Dieselbe Funktion wird fuer den CSV-Export verwendet (keine neue API-Funktion noetig)

**HistoricalChartWidget.vue** (`src/components/dashboard-widgets/HistoricalChartWidget.vue`):
- Zeigt Zeitreihe fuer EINEN Sensor
- Hat KEINEN Widget-Header mit Controls — nur einen `historical-widget__info` Bereich mit Sensor-Name
- Nutzt `useSensorId` zum Parsen der sensorId

**MultiSensorWidget.vue** (`src/components/dashboard-widgets/MultiSensorWidget.vue`):
- Zeigt mehrere Sensoren in einem Chart (wrapped `MultiSensorChart.vue`)
- Hat `dataSources: string` (komma-separiert, Format: `espId:gpio:sensorType,espId:gpio:sensorType`)
- Nutzt `useSensorOptions` fuer Sensor-Auswahl

### Was fehlt

- Kein Export-Icon / -Button in Widget-Headern
- Keine `useExportCsv` Composable oder Export-Utility
- Kein Konfigurations-Dialog fuer Zeitraum / Aggregation
- Keine Dateinamen-Logik

---

## SOLL-Zustand

### Neue Datei: `src/composables/useExportCsv.ts`

Zentraler Composable fuer CSV-Export-Logik. Kapselt:
1. API-Aufruf mit den Export-Parametern
2. JSON → CSV Konvertierung
3. Browser-Download ausfuehren

**Interface:**

```typescript
// Export-Parameter fuer einen einzelnen Sensor
interface CsvExportParams {
  espId: string
  gpio: number
  sensorType: string
  sensorName: string    // Fuer Dateinamen und CSV-Header
  zoneName?: string     // Optional — fuer Dateinamen
  startTime: Date
  endTime: Date
  resolution: SensorDataResolution  // 'raw' | '1m' | '5m' | '1h' | '1d' (aus @/types)
}

// Return-Wert des Composable
interface UseExportCsv {
  isExporting: Ref<boolean>
  exportError: Ref<string | null>
  exportSensorCsv: (params: CsvExportParams) => Promise<void>
}
```

**CSV-Format (exakt):**

```
timestamp,sensor_type,sensor_name,zone,value,unit
2026-03-26T10:00:00Z,sht31_temp,SHT31 Temperatur,Zelt Wohnzimmer,22.4,°C
2026-03-26T11:00:00Z,sht31_temp,SHT31 Temperatur,Zelt Wohnzimmer,22.1,°C
```

Spalten:
- `timestamp` — ISO 8601, UTC (das Format aus der API, keine Konvertierung in lokale Zeit)
- `sensor_type` — unveraendert aus API (z.B. `sht31_temp`)
- `sensor_name` — der `sensorName` Parameter (aus Widget-Config oder Sensor-Config)
- `zone` — `zoneName` Parameter oder leer wenn nicht bekannt
- `value` — `processed_value` (ist der Aggregationswert bei aggregierten Daten, Fallback: `raw_value`)
- `unit` — aus einer internen Map `SENSOR_TYPE_UNITS` (unten definiert)

**Dateinamen-Konvention:**
```
{zone_slug}_{sensor_type}_{from_date}_{to_date}.csv
Beispiel: Zelt_Wohnzimmer_sht31_temp_2026-03-19_2026-03-26.csv
```
Umlaute ersetzen: ae/oe/ue/ss. Leerzeichen durch Underscore. Dateinamen max. 100 Zeichen.

**Einheiten-Map (in der Composable definieren):**
```typescript
const SENSOR_TYPE_UNITS: Record<string, string> = {
  sht31_temp: '°C',
  sht31_humidity: '%RH',
  temperature: '°C',
  humidity: '%RH',
  ph: 'pH',
  ec: 'µS/cm',
  pressure: 'hPa',
  co2: 'ppm',
  light: 'lux',
  soil_moisture: '%',
  flow: 'L/min',
}
```

**Implementierungs-Pattern:**

```typescript
// JSON → CSV Konvertierung (ohne externe Library)
// SensorReading Typ aus @/types
function jsonToCsv(readings: SensorReading[], sensorName: string, zoneName: string, sensorType: string): string {
  const unit = SENSOR_TYPE_UNITS[sensorType] ?? ''
  const header = 'timestamp,sensor_type,sensor_name,zone,value,unit'
  const rows = readings.map(point => {
    const value = point.processed_value ?? point.raw_value ?? ''
    const ts = point.timestamp  // Bleibt UTC/ISO8601 wie von API geliefert
    return `${ts},${sensorType},${sensorName},${zoneName ?? ''},${value},${unit}`
  })
  return [header, ...rows].join('\n')
}

// Browser-Download ausfuehren (ohne externe Library — nur Web-APIs)
function triggerDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
```

**Fehlerbehandlung:** `isExporting` auf `false` setzen und `exportError` befuellen bei API-Fehler oder leerer Response. `exportError` nach 5 Sekunden zuruecksetzen (setTimeout).

---

### Neue Komponente: `src/components/dashboard-widgets/ExportCsvDialog.vue`

Kompakter Dialog fuer Export-Konfiguration vor dem Download. Verwendet `BaseModal` (Import: `@/shared/design/primitives/BaseModal.vue`).

**Props:**
```typescript
interface Props {
  open: boolean
  sensorId: string            // Format: espId:gpio:sensorType
  sensorName?: string         // Anzeigename aus Widget-Config
  zoneName?: string           // Zone-Name fuer Dateinamen
  defaultFrom?: Date          // Vorausgefuellt mit aktuellem Widget-Zeitraum
  defaultTo?: Date
}

// Emits
defineEmits<{
  close: []
  'update:open': [value: boolean]
}>()
```

**UI-Aufbau (kompakt, in BaseModal):**

```
┌─────────────────────────────────────┐
│  CSV Export · SHT31 Temperatur      │
│                                      │
│  Zeitraum                            │
│  [Letzte 24h ▼]                      │
│  (Optionen: 1h | 6h | 24h | 7d | 30d)│
│                                      │
│  Aggregation                         │
│  [1h Durchschnitt ▼]                 │
│  (Optionen: 5m | 1h | 1d | Raw)      │
│  Hinweis: 30d × Raw = ~43.200 Zeilen │
│                                      │
│  [Abbrechen]  [Download CSV]         │
└─────────────────────────────────────┘
```

**Zeitraum-Preset-Map:**
```typescript
const TIME_PRESETS = [
  { label: 'Letzte 1 Stunde', hours: 1 },
  { label: 'Letzte 6 Stunden', hours: 6 },
  { label: 'Letzte 24 Stunden', hours: 24 },
  { label: 'Letzte 7 Tage', hours: 168 },
  { label: 'Letzte 30 Tage', hours: 720 },
]
```

**Aggregations-Empfehlung automatisch setzen:** Wenn der User den Zeitraum wechselt, wird die Resolution automatisch angepasst (gleiche Logik wie `autoResolution.ts`):
- ≤ 6h → 5m
- ≤ 7d → 1h
- > 7d → 1d

**Datenmenge-Warnung anzeigen** wenn berechnete Zeilen > 10.000:
```typescript
const estimatedRows = computed(() => {
  const hours = selectedPreset.value.hours
  const pointsPerHour: Record<string, number> = { '5m': 12, '1h': 1, '1d': 1/24, raw: 60 }
  return Math.round(hours * (pointsPerHour[selectedResolution.value] ?? 1))
})
// Wenn estimatedRows.value > 10000: Warn-Text "Grosse Datenmenge – kann einige Sekunden dauern"
```

**Design-Token-Vorgaben** (tokens.css — KEINE ao-* Prefixes):
- Dialog-Hintergrund: `var(--glass-bg)` mit `backdrop-filter: blur(8px)`
- Primaeraktion (Download): `var(--color-accent)` (#3b82f6)
- Warn-Text: `var(--color-warning)`
- Spacing: `var(--space-3)` (12px) Innen-Abstand, `var(--space-2)` (8px) zwischen Elementen
- Font: `var(--text-sm)` fuer Labels, `var(--text-xs)` fuer Hinweis-Text
- Select-Elemente: native `<select>` mit `var(--glass-bg)` Background — KEIN Custom-Dropdown
- Touch-Targets: Mind. 44px Hoehe fuer alle interaktiven Elemente

---

### Aenderung: `src/components/dashboard-widgets/HistoricalChartWidget.vue`

**IST:** Widget hat `historical-widget__info` mit Sensor-Name. Kein Widget-Header mit Controls — kein `widget-controls` div, kein `TimeRangeSelector`, kein Refresh-Button.

**SOLL:** Export-Icon (`Download` aus lucide-vue-next) im `historical-widget__info` Bereich hinzufuegen, neben dem Sensor-Namen.

**IST (schematisch):**
```html
<div class="historical-widget__info">
  <span class="historical-widget__sensor-name">
    {{ parsedSensor.sensor.name || parsedSensor.sensor.sensor_type }}
  </span>
</div>
```

**SOLL:**
```html
<div class="historical-widget__info">
  <span class="historical-widget__sensor-name">
    {{ parsedSensor.sensor.name || parsedSensor.sensor.sensor_type }}
  </span>
  <button
    class="historical-widget__export-btn"
    title="Als CSV exportieren"
    @click="openExportDialog"
  >
    <Download :size="14" />
  </button>
</div>
```

**Neue Lokale State in HistoricalChartWidget:**
```typescript
const showExportDialog = ref(false)

function openExportDialog() {
  showExportDialog.value = true
}
```

**ExportCsvDialog einbinden** am Ende des Templates:
```html
<ExportCsvDialog
  v-model:open="showExportDialog"
  :sensor-id="widgetConfig.sensorId"
  :sensor-name="resolvedSensorName"
  :zone-name="zoneNameFromContext"
  :default-from="currentChartFrom"
  :default-to="currentChartTo"
/>
```

Dabei:
- `resolvedSensorName` — aus der Sensor-Options-Liste oder Widget-Config-Name holen; wenn nicht vorhanden: `sensorType` aus `useSensorId` als Fallback
- `zoneNameFromContext` — aus dem `zoneId` Prop; Aufloesung via `zoneStore.zoneEntities.find(z => z.id === zoneId)?.name` (Store exportiert `zoneEntities: Ref<ZoneEntity[]>`, keine `getZone()` Methode)
- `currentChartFrom` / `currentChartTo` — die aktuell im Widget eingestellten Zeitraum-Grenzen; als `defaultFrom`/`defaultTo` fuer den Dialog vorausfuellen

---

### Aenderung: `src/components/dashboard-widgets/MultiSensorWidget.vue`

**IST:** Widget ohne Export-Button.

**SOLL:** Export-Icon im Widget. Da MultiSensorWidget mehrere Sensoren hat (via `dataSources` Prop, komma-separiert), exportiert es JEDEN konfigurierten Sensor als SEPARATE CSV-Datei (nacheinander, nicht gezipped).

**Besonderheit Multi-Sensor:** Die Sensor-IDs muessen aus `dataSources` (komma-separiert) geparsed werden: `dataSources.split(',').map(s => s.trim())` liefert ein Array von `espId:gpio:sensorType` Strings.

**Empfehlung (simpler):** Export-Icon oeffnet keinen Dialog sondern exportiert ALLE konfigurierten Sensoren direkt (mit kurzer 200ms Verzoegerung zwischen den Downloads damit der Browser sie nicht blockiert). Toast-Notification via `useToast` (`@/composables/useToast.ts`, breit genutzt im Projekt — 42+ Dateien).

**Toast-Nutzung:** `const toast = useToast(); toast.success(\`${sensorCount} CSV-Dateien heruntergeladen\`)`

---

### Widget-Registrierung: KEINE Aenderung noetig

CSV-Export ist kein neuer Widget-Typ. Es ist eine Erweiterung bestehender Widgets (HistoricalChart + MultiSensorChart). Die 4-Stellen-Registrierung (WidgetType Union, componentMap, META, DEFAULT_CONFIGS) bleibt unveraendert.

---

## Betroffene Dateien

| Datei | Aenderungstyp | Aufwand |
|-------|--------------|---------|
| `src/composables/useExportCsv.ts` | NEU erstellen | ~45 min |
| `src/components/dashboard-widgets/ExportCsvDialog.vue` | NEU erstellen | ~60 min |
| `src/components/dashboard-widgets/HistoricalChartWidget.vue` | Erweitern (Export-Button + Dialog) | ~30 min |
| `src/components/dashboard-widgets/MultiSensorWidget.vue` | Erweitern (Export-Button, Multi-Download) | ~30 min |

**Keine Aenderungen an:**
- Backend/API (kein neuer Endpoint)
- Widget-Registrierung (kein neuer Widget-Typ)
- Dashboard-Store
- Pinia Stores
- Andere Widget-Typen (GaugeWidget, SensorCardWidget etc.)
- BaseModal (`src/shared/design/primitives/BaseModal.vue` — wird nur verwendet, nicht veraendert)
- autoResolution.ts (wird nur verwendet)

---

## Reihenfolge der Implementierung

1. `useExportCsv.ts` erstellen und isoliert testen (Browser-Download in Konsole pruefbar)
2. `ExportCsvDialog.vue` erstellen — nutzt `useExportCsv` und `BaseModal` (Import: `@/shared/design/primitives/BaseModal.vue`)
3. `HistoricalChartWidget.vue` erweitern — Export-Button + Dialog einbinden (in `dashboard-widgets/`)
4. `MultiSensorWidget.vue` erweitern — direkt-Download ohne Dialog (einfacherer Weg)

---

## Akzeptanzkriterien

| # | Kriterium | PASS wenn |
|---|-----------|-----------|
| 1 | Export-Button sichtbar | Download-Icon erscheint im HistoricalChartWidget Header |
| 2 | Dialog oeffnet sich | Klick auf Icon oeffnet ExportCsvDialog mit BaseModal |
| 3 | Zeitraum vorausgefuellt | Dialog zeigt aktuellen Widget-Zeitraum als Default |
| 4 | CSV-Download | Klick auf "Download CSV" loest Datei-Download im Browser aus |
| 5 | CSV-Format korrekt | Header-Zeile + Datenzeilen, UTF-8, Komma-getrennt |
| 6 | Dateinamen-Konvention | `zone_sensortype_from_to.csv` Format, Umlaute ersetzt |
| 7 | Aggregation passt | Bei 30d-Export: 1d-Aggregation Standard (< 800 Zeilen) |
| 8 | Warn-Text grosse Daten | Hinweis erscheint bei geschaetzten > 10.000 Zeilen |
| 9 | Multi-Sensor Export | Alle konfigurierten Sensoren werden als separate CSVs heruntergeladen |
| 10 | Keine Leerzeilen im CSV | Zeilen ohne `processed_value` UND ohne `raw_value` werden uebersprungen |
| 11 | Fehler behandelt | API-Fehler zeigt `exportError` im Dialog (kein unbehandelter Crash) |
| 12 | TypeScript clean | `vue-tsc --noEmit` ohne neue Fehler |

---

## Einschraenkungen (was NICHT gemacht wird)

- KEIN neuer Backend-Endpoint — Frontend nutzt bestehende JSON-API
- KEIN Excel/XLSX-Export — nur CSV im MVP
- KEIN geplanter/automatischer Export (Scheduled Reports)
- KEIN Email-Versand — nur Browser-Download
- KEIN Multi-Sensor in einer CSV-Datei — getrennte Dateien pro Sensor
- KEINE externe CSV-Library (PapaParse o.ae.) — nur native Browser-APIs und String-Manipulation
- KEIN Export aus GaugeWidget, SensorCardWidget, AlarmListWidget oder StatisticsWidget
- KEIN Export aus MonitorView direkt — nur aus Widget-Kontext
- KEINE Aenderung der bestehenden inline CSV-Export Funktion in MonitorView.vue
- KEINE Rohdaten-Option (raw) fuer Zeitraeume > 24h — Risiko Browser-Crash bei zu grossen Datenmengen

---

## Commit-Message

```
feat(widgets): CSV export for HistoricalChart and MultiSensor widgets

Add useExportCsv composable for sensor data CSV download via existing
GET /sensors/data API. Add ExportCsvDialog with time-range presets and
auto-resolution. Extend HistoricalChartWidget and MultiSensorWidget
with download icon in widget header.

- No new backend endpoint (frontend-only CSV generation)
- Filenames follow zone_sensortype_from_to.csv convention
- Browser download via Blob + URL.createObjectURL
- Auto-resolution: ≤6h→5m, ≤7d→1h, >7d→1d
```
