# Editor Datenanalyse Phase A — Ausfuehrbarer Plan

> **Stand:** 2026-03-25
> **Typ:** Agenten-ausfuehrbarer Auftrag (auto-one Repo)
> **Basis:** Auftrag 8.0/8.2 (Analysen), A1 Roadmap, INV-1, Chart.js Best Practices
> **Voraussetzung:** A1 Phase 1+2 KOMPLETT, 8.3a-c KOMPLETT, PA-01/PA-02a/PA-03a ERLEDIGT
> **Ziel:** 3 verbleibende Teilauftraege ausfuehren, dann A1 Phase 3 + Editor Phase B entblocken

---

## Ueberblick — Was ist erledigt, was bleibt

Phase A ist die Grundlage fuer alle weiteren Editor-Erweiterungen (Phase B: VPD, Dual-Y, Statistik-Widget; Phase C: Korrelation, Heatmap). Ohne Phase A sind Phase B+C und A1 Phase 3 (Mini-Widgets in ZoneTileCard) blockiert.

### Bereits erledigt (kein Handlungsbedarf)

| Aufgabe | Was wurde gemacht | Nachweis |
|---------|-------------------|----------|
| **PA-01** sensorId-Parser | `useSensorId` Composable in `composables/useSensorId.ts`. Alle 4 Widgets (LineChart, Gauge, SensorCard, Historical) importieren es. Legacy-Fallback (2-teilige IDs) implementiert. | Commit `3a750b3` |
| **PA-02a** Sensor-Dedup | Alle 6 Widgets haben seen-Set Dedup (WidgetConfigPanel, MultiSensor, SensorCard, LineChart, Historical, Gauge). | 8.3b abgeschlossen |
| **PA-03a** Server-Aggregation | Backend hat funktionierende `resolution`-Aggregation: `sensor_repo.py:487-607` mit `date_trunc` fuer 1m/5m/1h/1d. API-Endpoint `sensors.py:1242-1324` wertet `resolution` aus. Schema: `SensorDataQuery.resolution` + `SensorDataResponse` mit min/max/avg/count. | INV-1c implementiert |
| **PA-03b (HistoricalChart)** | `HistoricalChartWidget.vue` nutzt `getAutoResolution()` aus `utils/autoResolution.ts`. Mapping: <=1h→raw, <=6h→5m, <=7d→1h, >7d→1d. Min/Max-Band wird gerendert. | Commit `3a750b3` |

### Verbleibende Auftraege

| # | Auftrag | Aufwand | Entblockt |
|---|---------|---------|-----------|
| **PA-02b** | Zone-gruppierte Sensor-Auswahl | ~2-3h | A1 Phase 3 (Mini-Widgets) |
| **PA-02c** | Dashboard→Widget Zone-Kontext-Propagation | ~1-2h | A1 Phase 3 (Mini-Widgets) |
| **PA-03b** | MultiSensorChart resolution-Integration | ~1h | Editor Phase B (7d Multi-Sensor) |

**Optionaler Bonus (Nice-to-have):**

| # | Auftrag | Aufwand | Warum optional |
|---|---------|---------|----------------|
| **PA-03c** | Chart.js LTTB Decimation | ~1h | Server-Aggregation reduziert Datenmenge bereits; LTTB ist Restglaettung |

---

## Abhaengigkeitsdiagramm

```
PA-02b Zone-Sensor-Auswahl ──┐
                              ├──→ A1 Phase 3 (Mini-Widgets in ZoneTileCard)
PA-02c Zone-Kontext ──────────┘

PA-03b MultiSensor resolution ────→ Editor Phase B (VPD, Dual-Y, Statistik, 7d-Charts)

PA-03c LTTB Decimation (optional, parallel)
```

**Reihenfolge:** PA-02b zuerst (eigenstaendig), PA-02c danach (braucht PA-02b). PA-03b parallel zu PA-02b moeglich. PA-03c jederzeit.

---

## PA-02b — Zone-gruppierte Sensor-Auswahl im Widget-Editor

### Kontext

Der Dashboard-Editor (CustomDashboardView) erlaubt Nutzern, Widgets zu erstellen und zu konfigurieren. Jedes Widget braucht eine Datenquelle — typischerweise einen Sensor. Die Sensor-Auswahl ist aktuell eine flache Liste aller Sensoren aller Zonen ohne jede Gruppierung. Bei einer typischen Installation mit 3-5 Zonen und 4-8 Sensoren pro Zone (12-40 Sensoren) ist diese Liste unbrauchbar: Der Nutzer sieht "SHT31 Temperatur" dreimal ohne zu wissen welche Zone gemeint ist.

### IST-Zustand

- `WidgetConfigPanel.vue` iteriert `espStore.devices` und baut eine flache `<select>`-Liste
- Jeder Sensor erscheint als `{sensor_name || sensor_type} ({espId}:{gpio}:{sensorType})`
- Keine Gruppierung nach Zone oder Subzone
- `espStore.devices` enthaelt pro Device: `zone_id`, `zone_name`, und `sensors[]` Array
- Jeder Sensor in `sensors[]` hat `subzone_id`, `subzone_name`, `sensor_type`, `sensor_name`, `gpio`
- Seen-Set Dedup ist in allen 6 Widgets vorhanden (verhindert SHT31-Duplikate)
- `useSensorId` Composable existiert fuer sensorId-Parsing (`espId:gpio:sensorType`)

### SOLL-Zustand

Sensor-Auswahl gruppiert nach Zone → Subzone → Sensor. Das folgt dem hierarchischen Drill-Down-Pattern (Zone → Device → Sensor) das sich als Standard fuer IoT-Topologie-Views etabliert hat. Einstellungen gehoeren zu dem Objekt das sie betreffen — die Sensor-Auswahl muss den raeumlichen Kontext (Zone/Subzone) zeigen, weil Sensoren physisch an einem Ort sitzen.

**Visuelles Ziel:**
```
Zone: Zelt Wohnzimmer
  Pflanze 1
    SHT31 Temperatur (ESP_472204:0:sht31_temp)
    SHT31 Feuchte (ESP_472204:0:sht31_humidity)
  Nicht zugewiesen
    Relay PWR (ESP_472204:27:relay)
Zone: Technikzone
  EC Sensor (ESP_891003:2:ec)
  pH Sensor (ESP_891003:3:ph)
Nicht zugewiesen (kein Zone-Kontext)
  ...
```

### Technischer Ansatz

**Neues Composable: `useSensorOptions.ts`**

Erstelle `El Frontend/src/composables/useSensorOptions.ts`:

1. Importiere `espStore.devices` (reactive)
2. Baue eine computed `groupedSensorOptions` die Sensoren hierarchisch gruppiert:
   - **Ebene 1:** Zone (via `device.zone_id` + `device.zone_name`). Devices ohne Zone → Gruppe "Nicht zugewiesen"
   - **Ebene 2:** Subzone (via `sensor.subzone_id` + `sensor.subzone_name`). Sensoren ohne Subzone → direkt unter Zone
   - **Ebene 3:** Sensor mit Label `{sensor_name || sensor_type}` und Value `{espId}:{gpio}:{sensorType}`
3. Dedup via seen-Set (sensorId als Key) — ersetzt die bisherige Widget-lokale Dedup
4. Optionaler Parameter `filterZoneId?: string` — wenn gesetzt, nur Sensoren dieser Zone zeigen (fuer Zone-Dashboards, siehe PA-02c)
5. Sortierung: Zonen alphabetisch, Subzonen alphabetisch, Sensoren nach sensor_type

**TypeScript-Interface:**
```typescript
interface SensorOptionGroup {
  label: string           // Zone-Name oder "Nicht zugewiesen"
  zoneId: string | null
  subgroups: {
    label: string         // Subzone-Name oder leer
    subzoneId: string | null
    options: {
      label: string       // "SHT31 Temperatur" oder sensor_name
      value: string       // "ESP_472204:0:sht31_temp"
      sensorType: string  // "sht31_temp"
      espId: string
      gpio: number
    }[]
  }[]
}
```

**WidgetConfigPanel.vue anpassen:**

1. Importiere `useSensorOptions` statt eigener Sensor-Listen-Logik
2. Ersetze flaches `<select>` durch gruppiertes Dropdown:
   - Nutze native `<optgroup>` fuer Zonen (einfachste Loesung, beste Accessibility)
   - Label-Format: `{zoneName} / {subzoneName}` als optgroup-Label, Sensor-Name als Option
3. Entferne Widget-lokale Dedup-Logik (jetzt zentral im Composable)

**Alle 6 Widgets die Sensor-Listen haben:** WidgetConfigPanel, MultiSensorWidget, SensorCardWidget, LineChartWidget, HistoricalChartWidget, GaugeWidget — alle sollen `useSensorOptions` nutzen statt eigener Listen. Die meisten delegieren die Sensor-Auswahl an WidgetConfigPanel; nur MultiSensorWidget hat eine eigene Multi-Select-Liste.

### Einschraenkungen

- KEIN custom Dropdown-Komponent bauen — native `<optgroup>` reicht fuer Phase A
- KEIN Drag-and-Drop Sensor-Auswahl — das ist Phase C
- KEINE Chip-basierte Multi-Auswahl in Single-Sensor-Widgets — nur MultiSensorWidget braucht Multi-Select
- `useSensorOptions` darf KEINE API-Calls machen — nur reaktiv auf `espStore.devices` hoeren

### Akzeptanzkriterien

1. `useSensorOptions.ts` existiert als Composable mit `groupedSensorOptions` computed
2. WidgetConfigPanel zeigt Sensoren gruppiert nach Zone → Subzone (optgroup oder Sections)
3. Bei 0 Zonen (alle Sensoren ungezont): Fallback auf flache Liste mit "Nicht zugewiesen"-Header
4. Bei 1 Zone: Zone-Header trotzdem zeigen (konsistent)
5. Dedup zentral im Composable — kein Widget hat eigene seen-Set-Logik mehr
6. `filterZoneId` Parameter funktioniert: wenn gesetzt, nur Sensoren einer Zone sichtbar
7. `vue-tsc` und `vite build` fehlerfrei
8. Bestehende Widget-Konfigurationen (gespeicherte sensorIds) funktionieren weiterhin — keine Migration noetig

---

## PA-02c — Dashboard→Widget Zone-Kontext-Propagation

### Kontext

Ein Dashboard kann einer Zone zugeordnet sein (z.B. "Zelt Wohnzimmer Dashboard"). Diese Zuordnung existiert bereits im Datenmodell (`DashboardLayout.scope = 'zone'`, `DashboardLayout.zoneId`), wird beim Generieren gesetzt (`generateZoneDashboard()` in `dashboard.store.ts` Z.807-814), aber NICHT an die Widgets durchgereicht. Widgets wissen nicht welcher Zone ihr Dashboard gehoert. Folge: Sensor-Auswahl zeigt immer alle Zonen, auch wenn das Dashboard nur fuer eine Zone gedacht ist.

Fuer A1 Phase 3 (Mini-Widgets in ZoneTileCard) ist Zone-Kontext essentiell: Die MonitorView L1 zeigt Zone-Kacheln. Jede Kachel hat einen `extra`-Slot fuer Mini-Widgets. Diese Mini-Widgets MUESSEN automatisch wissen welcher Zone sie gehoeren, damit sie die richtigen Sensoren anzeigen.

### IST-Zustand

- `dashboard.store.ts`: `DashboardLayout` Interface hat `scope?: 'global' | 'zone'` und `zoneId?: string` (Z.84-85)
- `generateZoneDashboard()` setzt `scope: 'zone'` und `zoneId` korrekt (Z.807-814)
- `useDashboardWidgets.ts`: Rendert Widgets, reicht aber KEIN `zoneId` durch — Widgets erhalten nur `config` (ihre eigene Widget-Config)
- `InlineDashboardPanel.vue`: Rendert ein eingebettetes Dashboard (z.B. in MonitorView L2 Sidebar), hat KEINEN `zoneId` Prop
- `CustomDashboardView.vue`: Haupt-Editor-View, liest `dashboardStore.currentLayout` — koennte `zoneId` dort auslesen
- Widget-Komponenten: Keines hat einen `zoneId` Prop

### SOLL-Zustand

Zone-Kontext fliesst vom Dashboard-Layout bis in die Widget-Konfiguration:

```
DashboardLayout.zoneId
  ↓
useDashboardWidgets(options: { zoneId })
  ↓
Widget-Komponente empfaengt props.zoneId
  ↓
useSensorOptions(filterZoneId = props.zoneId)
  ↓
Sensor-Dropdown zeigt nur Sensoren dieser Zone
```

### Technischer Ansatz

**1. `useDashboardWidgets.ts` erweitern:**

- Neuer optionaler Parameter in den Composable-Options: `zoneId?: Ref<string | undefined>`
- Beim Rendern jeder Widget-Komponente: `zoneId` als Prop mitgeben (via dynamic component `:zoneId="options.zoneId?.value"`)
- Kein Breaking Change — `zoneId` ist optional, bestehende Aufrufe ohne `zoneId` funktionunveraendert

**2. `InlineDashboardPanel.vue` erweitern:**

- Neuer optionaler Prop: `zoneId?: string`
- Wird an `useDashboardWidgets` durchgereicht
- MonitorView L2 nutzt InlineDashboardPanel bereits fuer Sidebar-Charts — dort `zoneId` der aktuellen Zone mitgeben

**3. `CustomDashboardView.vue` erweitern:**

- `zoneId` aus `dashboardStore.currentLayout.zoneId` auslesen
- An `useDashboardWidgets` durchreichen
- Kein UI-Aenderung noetig — der Effekt ist dass WidgetConfigPanel die Sensor-Liste automatisch vorfiltert

**4. Widget-Komponenten:**

- Alle Widgets die `WidgetConfigPanel` nutzen, erhalten `zoneId` als optionalen Prop
- `WidgetConfigPanel` gibt `zoneId` an `useSensorOptions(filterZoneId)` weiter
- Bei `zoneId = undefined` (globales Dashboard): Alle Sensoren zeigen (bisheriges Verhalten)
- Bei `zoneId = 'abc-123'` (Zone-Dashboard): Nur Sensoren dieser Zone, andere Zonen eingeklappt/ausgegraut

### Einschraenkungen

- KEIN automatisches Setzen von `sensorId` beim Widget-Erstellen — nur die Auswahl vorfiltern
- KEINE Aenderung am Dashboard-Persistenz-Format — `zoneId` ist bereits im Layout gespeichert
- KEIN neuer API-Call — Zone-Info kommt aus `espStore.devices` (bereits geladen)
- `zoneId`-Prop ist IMMER optional — Widgets muessen auch ohne funktionieren

### Akzeptanzkriterien

1. `useDashboardWidgets` akzeptiert optionales `zoneId` und reicht es an Widget-Komponenten
2. `InlineDashboardPanel` akzeptiert optionales `zoneId` Prop
3. `CustomDashboardView` liest `zoneId` aus aktuellem Layout und gibt es weiter
4. Bei Zone-Dashboard (`scope='zone'`): WidgetConfigPanel zeigt primaer Sensoren der Dashboard-Zone
5. Bei globalem Dashboard: Alle Sensoren sichtbar (kein Regression)
6. MonitorView L2 Sidebar-Charts erhalten `zoneId` der aktuellen Zone
7. `vue-tsc` und `vite build` fehlerfrei

---

## PA-03b — MultiSensorChart resolution-Integration

### Kontext

Der HistoricalChartWidget nutzt bereits Server-seitige Aggregation via `getAutoResolution()` aus `utils/autoResolution.ts`. Das Mapping ist: <=1h→raw, <=6h→5m, <=7d→1h, >7d→1d. Der Server antwortet mit aggregierten Daten (avg, min, max, count pro Zeitfenster). Das HistoricalChart rendert Min/Max als halbtransparentes Band um die Hauptlinie.

Der MultiSensorChart (`MultiSensorWidget.vue` / `MultiSensorChart.vue`) nutzt diese Aggregation NICHT. Er arbeitet noch mit `limit: MAX_DATA_POINTS` (hartes Limit) ohne `resolution`-Parameter. Bei Zeitraeumen >6h fehlen Datenpunkte — die Kurve hat Luecken oder zeigt nur die neuesten N Punkte.

### IST-Zustand

- `MultiSensorChart.vue` (oder `MultiSensorWidget.vue`) ruft API mit `limit: MAX_DATA_POINTS` auf (Z.~546)
- Kein `resolution`-Parameter im API-Call
- `getAutoResolution(timeRange)` existiert bereits in `utils/autoResolution.ts` — muss nur importiert und genutzt werden
- Backend akzeptiert `resolution` auf `GET /sensors/data` und liefert aggregierte Daten mit `min_value`, `max_value`, `sample_count`
- HistoricalChart zeigt Min/Max-Band — MultiSensorChart koennte das gleiche Pattern nutzen, aber bei Multi-Sensor-Overlays wird das visuell zu voll. Empfehlung: Bei Multi-Sensor nur die Durchschnittslinie zeigen, KEIN Min/Max-Band.

### SOLL-Zustand

MultiSensorChart nutzt `getAutoResolution()` fuer den API-Call:

1. Importiere `getAutoResolution` aus `utils/autoResolution.ts`
2. Beim Laden der Sensordaten: `resolution = getAutoResolution(selectedTimeRange)`
3. API-Call: `sensorsApi.queryData({ ..., resolution })` statt `limit: MAX_DATA_POINTS`
4. `limit` beibehalten als Safety-Cap (z.B. `limit: 5000`), aber nicht als primaeren Datenreduktions-Mechanismus
5. Tooltip bei aggregierten Daten (resolution !== 'raw'): Zeige `"23.5°C (Ø, n=120)"` — also Hinweis dass es ein Durchschnitt ist
6. KEIN Min/Max-Band bei Multi-Sensor (zu viele Linien → unleserlich mit Baendern)

### Betroffene Dateien

- `MultiSensorChart.vue` oder `MultiSensorWidget.vue` — API-Call anpassen, resolution importieren
- Keine Backend-Aenderung noetig (resolution existiert)
- Keine neue Datei noetig (`autoResolution.ts` existiert)

### Einschraenkungen

- KEIN Min/Max-Band im Multi-Sensor-Chart — nur Durchschnittslinie pro Sensor
- KEIN neues Zeitfenster-Dropdown — bestehende timeRange-Auswahl nutzen
- KEINE Aenderung an `autoResolution.ts` — bestehendes Mapping verwenden
- Falls MultiSensorChart kein `timeRange`-Konzept hat: Default auf '24h' und spaeter konfigurierbar machen (Phase B)

### Akzeptanzkriterien

1. MultiSensorChart sendet `resolution` Parameter bei API-Calls
2. Bei 7d-Zeitraum: Komplette Kurve sichtbar (nicht abgeschnitten nach 1000 Punkten)
3. Tooltip zeigt bei aggregierten Daten Hinweis auf Durchschnitt
4. `limit` als Safety-Cap beibehalten (>=5000), nicht als primaere Reduktion
5. Keine Regression bei kurzen Zeitraeumen (<=1h bleibt `resolution: 'raw'`)
6. `vue-tsc` und `vite build` fehlerfrei

---

## PA-03c (Optional) — Chart.js LTTB Decimation aktivieren

### Kontext

Chart.js 4 hat einen eingebauten Decimation-Plugin der Datenpunkte visuell reduziert ohne den Kurvenverlauf zu verfaelschen. Der LTTB-Algorithmus (Largest Triangle Three Buckets) behaelt die visuell wichtigsten Punkte bei. Seit PA-03a (Server-Aggregation) und PA-03b (Frontend resolution) liefert der Server bereits reduzierte Datensaetze. LTTB ist damit eine Restglaettung fuer Faelle wo trotzdem >500 Punkte ankommen (z.B. 6h raw = 720 Punkte bei 30s Intervall).

### IST-Zustand

- Kein `decimation`-Plugin konfiguriert in der Codebase
- Hartes `slice(-MAX_DATA_POINTS)` in einigen Widgets — schneidet einfach die aeltesten Punkte ab
- Datenformat ist teilweise `labels[]` + `data[]` (separierte Arrays) statt `{x, y}[]` — das ist inkompatibel mit Decimation

### SOLL-Zustand

LTTB Decimation in LineChart und HistoricalChart aktivieren:

```typescript
// Chart-Options erweitern
const chartOptions = {
  parsing: false,         // VORAUSSETZUNG: Daten als {x, y}[] statt labels[]+data[]
  normalized: true,       // VORAUSSETZUNG: Daten nach x sortiert
  plugins: {
    decimation: {
      enabled: true,
      algorithm: 'lttb',
      samples: 500,       // Auf max 500 sichtbare Punkte reduzieren
      threshold: 800      // Erst ab 800 Punkten aktivieren
    }
  }
}
```

**Voraussetzung — Datenformat-Umstellung:**

Decimation funktioniert NUR mit `parsing: false` + Daten im `{x: timestamp_ms, y: value}` Format. Falls Widgets aktuell `labels[]` + `data[]` nutzen, muss die Daten-Transformation umgebaut werden. Das ist der aufwaendigste Teil.

### Einschraenkungen

- Nur fuer Line-Charts (`type: 'line'`) — Decimation funktioniert NICHT fuer Bar, Gauge, etc.
- Nur wenn `parsing: false` moeglich — pruefe ob Tooltip-Formatierung noch funktioniert
- NICHT fuer MultiSensorChart (dort ist Server-Aggregation ausreichend)
- LTTB kann Spikes verpassen — fuer Alarm-kritische Charts `min-max` Algorithmus statt LTTB erwaegen

### Akzeptanzkriterien

1. Decimation in HistoricalChart und LineChart konfiguriert
2. Daten als `{x: timestamp, y: value}[]` formatiert (nicht labels/data separat)
3. `slice(-MAX_DATA_POINTS)` durch Decimation ersetzt (kein hartes Abschneiden mehr)
4. Bei <800 Punkten: Keine Decimation (alle Punkte sichtbar)
5. Tooltip zeigt weiterhin korrekten Timestamp und Wert
6. `vue-tsc` und `vite build` fehlerfrei

---

## Nicht-Ziele (explizit ausgeschlossen aus Phase A)

- **Neue Widget-Typen** (VPD, Heatmap, Korrelation) → Phase B/C
- **Dual-Y-Achsen** im Multi-Sensor-Chart → Phase B (Konfiguration: `yAxisID: 'y'`/`'y1'`, `position: 'left'`/`'right'`, `grid.drawOnChartArea: false` auf rechter Achse, max 2 Y-Achsen)
- **CSV-Export** → Phase B
- **Subzone-Vergleichs-Widget** → Phase B
- **Alert-Konfiguration aus Widget** → Phase C
- **Virtuelle Sensoren** (VPD, DewPoint, GDD) → Phase B
- **Widget-Config Type-Discriminator** → Nice-to-have
- **Custom Dropdown-Komponente** mit Suche/Filter → Phase B (Phase A nutzt native optgroup)
- **Chip-basierte Multi-Sensor-Auswahl** → Phase B (empfohlen fuer nicht-technische Nutzer wie Gaertner)
- **chartjs-plugin-zoom** → Phase B (nur fuer Historical-Widget, braucht hammerjs Dependency)

---

## Einordnung in Gesamt-Roadmap

| Was | Abhaengigkeit | Status |
|-----|--------------|--------|
| **PA-02b** Zone-Sensor-Auswahl | Keine | **OFFEN — Naechster Schritt** |
| **PA-02c** Zone-Kontext-Propagation | PA-02b | OFFEN |
| **PA-03b** MultiSensor resolution | Keine | OFFEN (parallel zu PA-02b) |
| **PA-03c** LTTB Decimation (optional) | Keine | Nice-to-have |
| **A1 Phase 3** (Mini-Widgets) | PA-02b + PA-02c | WARTEND auf Phase A |
| **Editor Phase B** (VPD, Stats, Dual-Y) | PA-03b | WARTEND auf Phase A |
| **6.7 Cross-Zone** | A1 Phase 1 + B1 | Unabhaengig von Phase A |

### Ausfuehrungsreihenfolge

```
Parallel starten:
  PA-02b Zone-Sensor-Auswahl      (~2-3h)
  PA-03b MultiSensor resolution    (~1h)

Danach:
  PA-02c Zone-Kontext-Propagation  (~1-2h, braucht PA-02b)

Optional:
  PA-03c LTTB Decimation           (~1h)

Gesamt: ~4-6h (ohne PA-03c)
```

### Entblockt nach Abschluss

- **A1 Phase 3:** Mini-Widgets im `extra`-Slot der ZoneTileCard. Braucht PA-02b (Sensor-Optionen Composable) + PA-02c (Zone-Kontext). Mini-Widgets zeigen Live-Daten, keine historischen Charts — PA-03b ist NICHT blockierend fuer A1 Phase 3.
- **Editor Phase B:** VPD-Widget (braucht Dual-Y + berechnete Werte), Statistik-Widget (braucht Stats-Endpoint-Nutzung), Subzone-Vergleich. Braucht PA-03b fuer sinnvolle 7d-Charts in MultiSensor.
