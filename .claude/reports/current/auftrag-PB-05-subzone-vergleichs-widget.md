# PB-05: Subzone-Vergleichs-Modus im Multi-Sensor-Widget

> **Stand:** 2026-03-26
> **Typ:** Implementierungs-Auftrag (auto-one Repo, El Frontend)
> **Vorbedingung:** Editor Phase A KOMPLETT, Phase 7 D1-D4 KOMPLETT
> **Aufwand:** ~3-4h
> **Ziel:** "Compare Mode" im bestehenden MultiSensorWidget — User waehlt Sensortyp + Zone, System findet automatisch alle passenden Subzone-Sensoren und zeigt sie als beschriftetes Overlay-Chart

---

## Kontext und Entscheidung

Die zentrale Frage im Gartenbau lautet: "Sind alle Pflanzen gleichmaessig versorgt?" Die Antwort erfordert den Vergleich des **gleichen Sensortyps ueber verschiedene Subzonen**. Beispiel: Temperatur-Vergleich zwischen "Pflanze 1" und "Pflanze 2" in Zone "Zelt Wohnzimmer" — gibt es Hotspots?

**Entscheidung: Option A — Multi-Sensor-Chart erweitern, KEIN neuer Widget-Typ.**

Begruendung: Der bestehende `multi-sensor` Widget-Typ rendert bereits mehrere Sensoren als Overlay-Chart (Chart.js `Line` mit mehreren Datasets). Er hat Zeitreihen, Server-Aggregation und Zone-Kontext bereits fertig. Ein neuer Widget-Typ wuerde dieselbe Chart-Logik duplizieren. Der Compare Mode ist eine Konfigurations-Erweiterung, keine neue Visualisierungsklasse.

Was sich aendert: MultiSensorWidget.vue bekommt einen Toggle "Vergleichs-Modus". Im Compare Mode waehlt der User nur sensorType + Zone — das System erledigt den Rest (Sensor-Lookup, Dataset-Aufbau, Subzone-Labels).

---

## System-Kontext (Pflichtlektuere fuer den Agenten)

### Widget-Registrierung (4-Stellen-Muster)

Jeder Widget-Typ ist an exakt 4 Stellen registriert:
1. `WidgetType` Union-Type (TypeScript)
2. `componentMap` Record (Typ → Vue-Komponente)
3. `WIDGET_TYPE_META` Array (Name, Beschreibung, min-Groesse)
4. `WIDGET_DEFAULT_CONFIGS` Record (Typ → Standardkonfiguration)

Bei diesem Auftrag wird **kein neuer Widget-Typ** hinzugefuegt. Die 4-Stellen-Registrierung bleibt unveraendert. Der bestehende Eintrag `multi-sensor` gilt weiterhin.

### Flaches Config-Interface

AutomationOne nutzt ein **flaches Config-Interface fuer alle Widget-Typen** — es gibt keinen Type-Discriminator. Alle optionalen Felder aller Widget-Typen landen in derselben TypeScript-Schnittstelle. Neue Felder werden einfach als optionale Properties hinzugefuegt.

### sensorId-Format

Alle Sensoren in AutomationOne werden durch eine 3-teilige ID referenziert:

```
espId:gpio:sensorType
```

Beispiel: `"ESP_123:0:sht31_temp"`. Das Parsing dieser ID ist **zentralisiert** im Composable `composables/useSensorId.ts`. Alle Widgets nutzen dieses Composable — nie selbst parsen. Der Composable hat auch einen Legacy-Fallback fuer 2-teilige IDs (ohne sensorType).

### dataSources-Format

Im Multi-Sensor-Widget werden mehrere Sensoren als komma-separierter String in `config.dataSources` gespeichert:

```
"espId1:gpio1:sensorType1,espId2:gpio2:sensorType2"
```

Dieser String wird beim Render in einzelne sensorId-Strings aufgeteilt und dann pro sensorId ein Dataset aufgebaut. Im Compare Mode wird `dataSources` aus den Auto-Fill-Ergebnissen generiert, nicht manuell eingegeben.

### useSensorOptions Composable

`composables/useSensorOptions.ts` liefert eine hierarchisch gruppierte Sensor-Liste:

```
Zone
  └── Subzone ("Pflanze 1")
        └── Sensor {sensorId, sensorType, subzoneName, subzoneId, label}
  └── Subzone ("Pflanze 2")
        └── Sensor {sensorId, sensorType, subzoneName, subzoneId, label}
```

Der optionale Parameter `filterZoneId` (als Ref) begrenzt die Liste auf eine Zone. Die Rueckgabe-Struktur:

```typescript
// SensorOptionGroup (Zone-Ebene)
{ label: string,         // Zone-Name
  zoneId: string,
  subgroups: SensorSubgroup[] }

// SensorSubgroup (Subzone-Ebene)
{ label: string,         // Subzone-Name ("Pflanze 1")
  subzoneId: string,
  options: SensorOption[] }

// SensorOption (Sensor-Ebene) — definiert in useSensorOptions.ts:12-18
{ value: string,         // sensorId: "espId:gpio:sensorType"
  label: string,         // Display-Name
  sensorType: string,    // z.B. "sht31_temp"
  espId: string,
  gpio: number }
```

**Wichtig:** `SensorOption` hat KEIN `subzoneName` oder `subzoneId` — diese Felder liegen auf Subgroup-Ebene. Der Auto-Fill-Algorithmus muss deshalb ueber `subzone.label` und `subzone.subzoneId` gehen, nicht ueber die Option selbst.

### Dashboard → Widget Zone-Kontext

Die `zoneId` fliesst von aussen in jedes Widget:

```
DashboardLayout.zoneId
  → useDashboardWidgets (Options: zoneId)
    → InlineDashboardPanel (Prop: zoneId)
      → Widget-Komponente (Prop: zoneId)
        → WidgetConfigPanel (Prop: zoneId)
          → useSensorOptions(filterZoneId = ref(zoneId))
```

Im Compare Mode wird `compareZoneId` aus der Config gelesen. Wenn `compareZoneId` leer ist, faellt der Widget auf `zoneId` (den Dashboard-Kontext) zurueck. Damit funktioniert der Compare Mode "out of the box" wenn das Widget in einem Zone-Dashboard sitzt.

### ChartSensor-Aufbau im MultiSensorWidget

MultiSensorWidget.vue baut ein Array `ChartSensor[]` auf und uebergibt es an MultiSensorChart.vue. Jedes Element hat die Struktur:

```typescript
// Vollstaendiges Interface (types/index.ts:861-869) — alle 7 Felder MUESSEN gesetzt werden
interface ChartSensor {
  id: string          // Unique-Key: `${espId}_${gpio}_${sensorType}`
  espId: string
  gpio: number
  sensorType: string
  name: string        // Dataset-Label in der Legende
  unit: string        // Einheit (z.B. "°C", "%") — aus espStore Sensor-Daten aufloesen
  color: string       // Linienfarbe aus CHART_COLORS
}
```

`buildChartSensors` im Compare Mode muss alle 7 Felder setzen — insbesondere `id` (fuer Chart.js Key-Tracking) und `unit` (fuer Y-Achsen-Beschriftung). Fehlende Felder fuehren zu TypeScript-Fehlern.

MultiSensorChart.vue empfaengt dieses Array und macht pro Element einen API-Call und baut ein Chart.js Dataset. Die Chart-Komponente "sieht" keinen Unterschied zwischen manuellem und Compare Mode — sie bekommt immer ein fertiges `ChartSensor[]`.

### Design-Tokens

AutomationOne hat 129 CSS-Tokens in `tokens.css` mit semantischen Prefixes:
- `--color-*` fuer Farben (Status: `--color-success`, `--color-warning`, `--color-error`)
- `--glass-*` fuer Glassmorphism (Hintergrund, Blur)
- `--space-*` fuer Abstände (kleinster Token: `--space-1` = 4px, kein `--space-px`)
- `--elevation-*` fuer Schatten

**Kein `--ao-*` Prefix.** Sub-10px font-sizes (9px, 10px) sind fuer Badges erlaubt unter dem Token-Minimum.

### Chart-Bibliothek

AutomationOne nutzt **Chart.js 4.x mit vue-chartjs**. NICHT ECharts. Alle Chart-Konfiguration erfolgt ueber Chart.js-Optionen-Objekte. Fuer Subzone-Vergleiche gilt: gleicher Sensortyp = gleiche Y-Achse. Eine einzelne Y-Achse ist korrekt und ausreichend fuer den Compare Mode.

---

## IST-Zustand

### MultiSensorWidget.vue

- User waehlt Sensoren manuell einzeln (beliebige Typen mischbar)
- Config-Felder: `dataSources` (komma-separierter sensorId-String), `timeRange`
- Dataset-Label-Aufbau (IST): `name: sensor?.name || sensor?.sensor_type || 'GPIO ${gpio}'`
- Keine Subzone-Information im Label
- Keine automatische Sensor-Auswahl

### dashboard.store.ts

- Config-Interface hat `dataSources`, `timeRange` und andere Widget-spezifische Felder
- Keine Compare-Mode-Felder vorhanden

### useDashboardWidgets.ts

- Mappt Config-Felder auf Widget-Props
- Keine Compare-Mode-Felder im Props-Mapping

---

## SOLL-Zustand

### Neue Config-Felder (flaches Interface)

```typescript
// In der Widget-Config-Schnittstelle (shared/types oder dashboard.store.ts):
compareMode?: boolean       // Toggle: false = manuell (bisheriges Verhalten), true = Auto-Fill
compareSensorType?: string  // z.B. "sht31_temp", "temperature", "humidity"
compareZoneId?: string      // Zone-Filter; leer = Dashboard-zoneId verwenden
```

**Wichtig:** Diese Felder sind optional. Wenn `compareMode` nicht gesetzt oder `false` ist, verhält sich das Widget exakt wie bisher (Rueckwaertskompatibilitaet).

### MultiSensorWidget.vue — Compare Mode UI

**Toggle:**
- Ein einfacher Toggle/Switch "Vergleichs-Modus" im Widget-Config-Bereich
- Wenn `compareMode === false` (default): bestehende manuelle Sensor-Auswahl unberuehrt
- Wenn `compareMode === true`: manuelle Auswahl ausgeblendet, stattdessen zwei Dropdowns:
  - Dropdown 1: Sensortyp (z.B. "Temperatur (sht31_temp)")
  - Dropdown 2: Zone (default: Dashboard-zoneId, wahlweise andere Zone)

**Auto-Fill-Algorithmus:**

```typescript
// Import: useSensorOptions, compareZoneId als Ref
const effectiveZoneId = computed(() => props.config.compareZoneId || props.zoneId || '')
const { groupedSensorOptions } = useSensorOptions(effectiveZoneId)

const compareSensors = computed(() => {
  if (!props.config.compareMode || !props.config.compareSensorType) return []

  return groupedSensorOptions.value
    .flatMap(zone => zone.subgroups)
    .flatMap(subzone =>
      subzone.options
        .filter(opt => opt.sensorType === props.config.compareSensorType)
        .map(opt => ({
          sensorId: opt.value,           // "espId:gpio:sensorType"
          subzoneName: subzone.label,    // "Pflanze 1", "Pflanze 2"
          subzoneId: subzone.subzoneId
        }))
    )
    .slice(0, 4)  // Maximum 4 Sensoren (Lesbarkeits-Limit)
})
```

**Subzone-Label im Compare Mode:**

```typescript
// Dataset-Label-Aufbau:
// IST: name: sensor?.name || sensor?.sensor_type || `GPIO ${gpio}`
// SOLL (nur wenn compareMode === true):
//   name: subzoneName || sensor?.name || `GPIO ${gpio}`

const buildChartSensors = computed((): ChartSensor[] => {
  if (props.config.compareMode) {
    // Compare Mode: aus compareSensors[] aufbauen
    return compareSensors.value.map((cs, index) => {
      const parsed = parseSensorId(cs.sensorId)  // useSensorId Composable
      // parseSensorId gibt nullable Felder zurueck (espId: string|null, gpio: number|null).
      // Ungueltige Eintraege rausfiltern — sollte nicht vorkommen da useSensorOptions
      // nur gueltige sensorIds liefert, aber TypeScript braucht den Guard.
      if (!parsed.isValid || !parsed.espId || parsed.gpio === null) return null

      // Unit-Aufloesung: Gleiche Logik wie im manuellen Modus nutzen.
      // espStore.sensors hat Sensor-Objekte mit .unit Feld.
      // Lookup: espStore.sensors.find(s => s.esp_id === espId && s.gpio === gpio)?.unit
      const sensor = espStore.sensors.find(
        s => s.esp_id === parsed.espId && s.gpio === parsed.gpio
      )

      return {
        id: `${parsed.espId}_${parsed.gpio}_${parsed.sensorType || 'unknown'}`,
        espId: parsed.espId,
        gpio: parsed.gpio,
        sensorType: parsed.sensorType || 'unknown',
        name: cs.subzoneName || parsed.sensorType || `GPIO ${parsed.gpio}`,
        unit: sensor?.unit || '',
        color: CHART_COLORS[index % CHART_COLORS.length]
      }
    }).filter(Boolean) as ChartSensor[]
  }
  // Manueller Modus: bisherige Logik unveraendert
  // ...
})
```

**Stabile Farben:**

Die Farbzuordnung basiert auf der **alphabetischen Sortierung** der Subzone-Namen. Das verhindert, dass "Pflanze 1" mal blau und mal gruen ist, je nachdem in welcher Reihenfolge die API antwortet.

```typescript
const compareSensors = computed(() => {
  return [...rawSensors]
    .sort((a, b) => a.subzoneName.localeCompare(b.subzoneName))  // stabile Reihenfolge
    .slice(0, 4)
})
```

Die Farbpalette `CHART_COLORS` aus `chartColors.ts` (8 Farben) wird sequenziell durch Index vergeben. Maximum 4 Subzonen = immer innerhalb der 8-Farben-Palette.

---

## Betroffene Dateien

### 1. `shared/stores/dashboard.store.ts` (Config-Interface)

**Aenderung:** Drei neue optionale Felder im Widget-Config-Interface.

```typescript
compareMode?: boolean
compareSensorType?: string
compareZoneId?: string
```

Das Config-Interface ist ein inline-Typ innerhalb von `DashboardWidget` in `dashboard.store.ts:38-58` — kein separates Interface. Die drei neuen Felder werden direkt in den bestehenden `config:`-Block eingefuegt, analog zu den vorhandenen Feldern (`dataSources`, `timeRange`, etc.).

**Aufwand:** ~15 Minuten.

### 2. `composables/useDashboardWidgets.ts`

**Aenderung:** Die drei neuen Config-Felder muessen im Props-Mapping enthalten sein, damit sie von `mountWidgetToElement` korrekt an die Widget-Komponente weitergegeben werden.

Konkret: `mountWidgetToElement()` in `useDashboardWidgets.ts:234-252` nutzt eine **explizite if-Kette** fuer das Props-Mapping (KEIN generischer Spread). Die neuen Felder muessen als drei neue if-Bloecke hinzugefuegt werden — analog zum bestehenden Muster:

```typescript
if (config.compareMode != null) props.compareMode = config.compareMode
if (config.compareSensorType) props.compareSensorType = config.compareSensorType
if (config.compareZoneId) props.compareZoneId = config.compareZoneId
```

**Aufwand:** ~15 Minuten.

### 3. `components/dashboard-widgets/MultiSensorWidget.vue`

**Aenderung:** Hauptarbeit. Folgende Ergaenzungen:

1. **Props erweitern:** `compareMode`, `compareSensorType`, `compareZoneId`, `zoneId` (falls nicht schon vorhanden)
2. **useSensorOptions importieren** mit `effectiveZoneId` als computed Ref
3. **`compareSensors` computed** implementieren (Auto-Fill-Algorithmus, alphabetische Sortierung, slice(0, 4))
4. **`buildChartSensors` computed** anpassen: If compareMode → aus compareSensors bauen mit subzoneName als Label, else → bisherige Logik unveraendert
5. **Config-UI-Bereich im Template:** Toggle "Vergleichs-Modus" hinzufuegen. Wenn compareMode: Sensortyp-Dropdown + Zone-Dropdown anzeigen. Wenn !compareMode: bestehende manuelle Sensor-Auswahl anzeigen.
6. **Konsistenz-Refactor:** Bestehenden manuellen Modus (Zeile 52-56) von `sId.split(':')` auf `parseSensorId` aus `useSensorId` umstellen (3-4 Zeilen). Beide Pfade nutzen dann dasselbe Parsing mit Legacy-Fallback.

**Aufwand:** ~3 Stunden.

---

## Was NICHT geaendert wird

- **MultiSensorChart.vue** — empfaengt fertiges `ChartSensor[]`, sieht keinen Unterschied zwischen Manual und Compare Mode. Keine Aenderung.
- **useSensorOptions.ts** — liefert bereits Zone→Subzone→Sensor mit sensorType. Keine Aenderung.
- **chartColors.ts** — 8 Farben > 4 Max-Subzonen, reicht aus. Keine Aenderung.
- **WidgetConfigPanel.vue** — Multi-Sensor Config ist im Widget selbst (nicht im WidgetConfigPanel). Keine Aenderung.
- **Server-Endpoints** — kein Batch-Endpoint noetig. MultiSensorChart macht bereits N parallele API-Calls (einen pro Sensor). Das bleibt so. Bei 4 Subzonen × 7d × 5min-Aggregation = 4 × 2016 ≈ 8000 Datenpunkte — akzeptabel.
- **Widget-Registrierung** (WidgetType Union, componentMap, META, DEFAULT_CONFIGS) — kein neuer Typ, keine Aenderung an der 4-Stellen-Registrierung.

---

## Abgrenzung: Phase B (dieser Auftrag) vs. Phase C (spaeter)

**Phase B — MVP (dieser Auftrag):**
- Compare Mode Toggle
- Auto-Fill: sensorType + Zone → alle passenden Sensoren automatisch
- Subzone-Namen als Dataset-Labels statt ESP-IDs
- Stabile Farben via alphabetische Subzone-Sortierung
- Maximum 4 Sensoren

**Phase C — spaeter, separate Auftraege:**
- Delta-Chart (Differenz zwischen Subzonen als berechnetes Dataset)
- Zone-zu-Zone-Vergleich (gleicher sensorType ueber verschiedene Zonen, nicht nur Subzonen)
- Hash-basierte Farben pro Subzone-ID (garantiert stabiler als Index-basiert)
- Batch-API-Endpoint wenn Performance bei vielen Subzonen ein Problem wird
- Statistik-Overlay (Min/Max/Avg als Annotation auf jedem Dataset)

---

## Akzeptanzkriterien

1. **Rueckwaertskompatibel:** Bestehende Multi-Sensor-Widgets ohne `compareMode`-Flag verhalten sich exakt wie bisher. Kein `dataSources`-Parsing bricht.
2. **Auto-Fill funktioniert:** User waehlt `compareSensorType = "sht31_temp"` und Zone → Widget zeigt automatisch alle Subzonen dieser Zone mit dem Typ als separate Linien.
3. **Subzone-Labels:** Legende zeigt "Pflanze 1", "Pflanze 2" statt "ESP_123:0:sht31_temp".
4. **Stabile Farben:** Bei gleichem sensorType + Zone zeigt "Pflanze 1" immer dieselbe Farbe (alphabetische Sortierung garantiert das).
5. **Limit:** Nie mehr als 4 Datasets im Compare Mode (`.slice(0, 4)` nach alphabetischer Sortierung).
6. **TypeScript:** Keine neuen `any`-Types. Neue Config-Felder explizit typisiert.
7. **Kein Fehler wenn Zone leer:** Wenn `compareZoneId` und `zoneId` beide leer sind → `compareSensors` gibt leeres Array zurueck → kein Chart, kein Crash. Leerer Zustand mit Hinweis "Bitte Zone auswaehlen".

---

## Einschraenkungen

- KEIN neuer Widget-Typ. Die 4-Stellen-Registrierung (WidgetType, componentMap, META, DEFAULT_CONFIGS) wird nicht angefasst.
- KEIN Zone-zu-Zone-Vergleich in dieser Phase. Nur Subzonen innerhalb einer Zone.
- KEIN Delta-Chart. Nur Overlay (mehrere Linien in einem Chart).
- KEIN neuer Server-Endpoint. Parallele Einzel-Calls bleiben.
- KEIN Dual-Y-Achsen im Compare Mode. Gleicher sensorType = gleiche Y-Achse. Dual-Y ist PB-02 und nicht Teil dieses Auftrags.
- Die vorhandene `useSensorId.ts` (zentrales sensorId-Parsing) MUSS genutzt werden — kein eigenes String-Splitting.
- **Konsistenz-Refactor:** Der manuelle Modus in `MultiSensorWidget.vue:52-56` nutzt aktuell eigenes String-Splitting (`sId.split(':')`) statt `parseSensorId`. Im Zuge dieses Auftrags **beide Pfade** (manuell + compare) auf `parseSensorId` umstellen. Das ist ein minimaler Refactor (3-4 Zeilen), verhindert aber Inkonsistenz innerhalb derselben Datei und stellt sicher, dass der Legacy-Fallback fuer 2-teilige IDs ueberall greift.
