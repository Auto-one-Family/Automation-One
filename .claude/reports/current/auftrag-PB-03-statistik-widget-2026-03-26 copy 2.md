# PB-03: Statistik-Widget (Stats-Endpoint → Widget)

> **Stand:** 2026-03-26
> **Typ:** Implementierungs-Auftrag (auto-one Repo, El Frontend)
> **Vorbedingung:** Editor Phase A KOMPLETT, Phase 7 D1-D4 KOMPLETT
> **Aufwand:** ~2-3h
> **Ziel:** Neuen Widget-Typ `statistics` erstellen, der den existierenden Stats-Endpoint anbindet und Min/Avg/Max/StdDev/Count als KPI-Card darstellt

---

## Kontext und Entscheidung

AutomationOne hat einen Stats-Endpoint (`GET /api/v1/sensors/{esp_id}/{gpio}/stats`), der von keinem einzigen Widget genutzt wird. Der Dashboard-Editor zeigt bislang ausschliesslich Echtzeitwerte (SensorCard) und Zeitreihen (HistoricalChart, MultiSensorChart). Statistische Kennzahlen ueber einen Zeitraum fehlen vollstaendig.

Im professionellen Gartenbau sind Statistiken essenziell: "Was war die minimale Nachttemperatur der letzten 7 Tage?" oder "Wie stark schwankt die Luftfeuchte?" Diese Fragen beantwortet kein Zeitreihen-Chart auf einen Blick — dafuer braucht man aggregierte Kennzahlen.

**Entscheidung: Neuer Widget-Typ `statistics`, keine Erweiterung von SensorCard.**

Begruendung: SensorCard ist auf Echtzeit-WebSocket-Daten ausgelegt (ein Live-Wert, keine API-Call-Logik). Das Statistik-Widget hat eine andere Datenquelle (REST-API-Aufruf statt WebSocket), eine andere Konfiguration (Zeitraum-Parameter zusaetzlich zur sensorId) und eine andere Mindestgroesse. Diese drei Unterschiede rechtfertigen einen eigenen Typ. Einen "mode: stats" in SensorCard einzubauen wuerde die Komponente mit bedingter Logik fuer zwei grundlegend verschiedene Datenpfade belasten.

---

## System-Kontext (Pflichtlektuere fuer den Agenten)

### Widget-Registrierung: Das 4-Stellen-Muster

Jeder Widget-Typ ist an exakt 4 Stellen registriert. Alle 4 muessen konsistent aktualisiert werden — ein vergessener Eintrag fuehrt zu einem TypeScript-Fehler oder einem Runtime-Crash:

1. **`WidgetType` Union-Type** in `shared/stores/dashboard.store.ts` — TypeScript-Typ fuer alle gueltigen Widget-Typen. Aktuell z.B. `'sensor-card' | 'line-chart' | 'gauge' | ...`
2. **`componentMap` Record** in `composables/useDashboardWidgets.ts` — bildet Typ-String auf Vue-Komponente ab
3. **`WIDGET_TYPE_META` Array** in `composables/useDashboardWidgets.ts` — enthaelt Name, Beschreibung, Kategorie und Groessen fuer den Widget-Picker (AddWidgetDialog). Wichtig: `category` ist ein **Pflichtfeld**, `icon` muss eine importierte Lucide-Component sein (kein String), Groessen-Properties heissen `w`/`h` (nicht `defaultW`/`defaultH`)
4. **`WIDGET_DEFAULT_CONFIGS` Record** in `composables/useDashboardWidgets.ts` — Standardkonfiguration die beim Erstellen eines neuen Widgets gesetzt wird

Zusaetzlich gibt es eine **Props-Bridge** in `useDashboardWidgets.ts` innerhalb der Funktion `mountWidgetToElement()` (ca. Z.226-278). Diese nutzt eine **flache if-Kette** (KEIN switch/case, KEIN per-type Mapping) die ALLE Config-Props einzeln prueft und generisch an alle Widget-Typen weiterreicht. Neue Props werden als zusaetzliche if-Zeilen ergaenzt.

### Flaches Config-Interface

AutomationOne nutzt ein **flaches Config-Interface fuer alle Widget-Typen**. Es gibt keinen Type-Discriminator — alle optionalen Felder aller Widget-Typen leben in derselben TypeScript-Schnittstelle im Dashboard-Store. Neue Felder werden als optionale Properties ergaenzt.

Aktuell relevante Felder (Auszug aus dem Interface in `dashboard.store.ts` ca. Zeile 38-58):
- `sensorId?: string` — 3-teilige ID (espId:gpio:sensorType)
- `timeRange?: '1h' | '6h' | '24h' | '7d' | 'custom'` — Zeitraum als **Literal-Union** (KEIN freier String!)
- `title?: string` — Optionaler Titel

**Wichtig:** `'30d'` fehlt aktuell im `timeRange` Union-Typ. Damit das statistics-Widget `'30d'` nutzen kann, MUSS `'30d'` zum Union-Typ ergaenzt werden: `'1h' | '6h' | '24h' | '7d' | '30d' | 'custom'`.

Neue Felder die ergaenzt werden muessen:
- `showStdDev?: boolean` — Standardabweichung anzeigen (default: true)
- `showQuality?: boolean` — Datenqualitaets-Verteilung anzeigen (default: false)

### sensorId-Format und useSensorId

Alle Sensoren werden durch eine 3-teilige ID referenziert: `espId:gpio:sensorType`

Beispiel: `"ESP_472204:0:sht31_temp"`. Das Parsing ist **zentralisiert** im Composable `composables/useSensorId.ts`. Dieser Composable liefert `espId`, `gpio`, `sensorType` aus einem sensorId-String. Alle Widgets nutzen diesen Composable — nie selbst parsen. Es gibt einen Legacy-Fallback fuer 2-teilige IDs (ohne sensorType).

**Signatur-Hinweis:** `useSensorId` erwartet `Ref<string> | (() => string)` — NICHT `Ref<string | undefined>`. Da `sensorId` im Widget optional ist (`string | undefined`), muss ein Getter mit Fallback verwendet werden: `useSensorId(() => props.sensorId ?? '')`.

### Stats-Endpoint — vollstaendige API-Signatur

Der Endpoint existiert bereits und ist im Frontend-API-Client implementiert.

**Endpoint:**
```
GET /api/v1/sensors/{esp_id}/{gpio}/stats
```

**Query-Parameter (alle optional):**
- `start_time` — ISO 8601 Timestamp (z.B. `2026-03-19T00:00:00Z`)
- `end_time` — ISO 8601 Timestamp
- `sensor_type` — Sensor-Typ-String (z.B. `sht31_temp`)

**Frontend API-Client** (bereits implementiert in `El Frontend/src/api/sensors.ts:144-158`):
```typescript
sensorsApi.getStats(espId: string, gpio: number, params?: {
  start_time?: string,
  end_time?: string,
  sensor_type?: string
}): Promise<SensorStatsResponse>
```

**TypeScript-Typen** (bereits implementiert in `El Frontend/src/types/index.ts:799-822`):
```typescript
interface SensorStats {
  min_value: number | null
  max_value: number | null
  avg_value: number | null
  std_dev: number | null
  reading_count: number
  quality_distribution: Record<QualityLevel, number>
  // QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'stale' | 'error'
  // KEIN time_range in SensorStats!
}

interface SensorStatsResponse {
  success: boolean
  esp_id: string
  gpio: number
  sensor_type: string
  stats: SensorStats
  time_range: { start: string; end: string }  // time_range gehoert zur Response, NICHT zu SensorStats
  // KEIN unit-Feld in der Response!
}
```

**Unit-Bezug:** `unit` existiert NICHT in `SensorStatsResponse`. Die Einheit muss aus `SENSOR_TYPE_CONFIG` (in `utils/sensorDefaults.ts`) bezogen werden: `SENSOR_TYPE_CONFIG[sensorType]?.unit`. Nicht neu definieren, nicht aus der Response erwarten.

Beide Typen muessen im Widget importiert und genutzt werden — nicht neu definieren.

### Zeitraum-Berechnung: start_time und end_time

Das Statistik-Widget bekommt vom User einen `timeRange`-String (z.B. `'7d'`, `'24h'`, `'30d'`). Daraus muss `start_time` und `end_time` berechnet werden. Dieses Pattern existiert bereits in `HistoricalChartWidget.vue` und `autoResolution.ts`.

Berechnung:
- `end_time` = `new Date().toISOString()` (jetzt)
- `start_time` = `end_time` minus Zeitraum

Zeitraum-Map (analog zu HistoricalChart):
```
'1h'  -> 1 Stunde
'6h'  -> 6 Stunden
'24h' -> 24 Stunden
'7d'  -> 7 Tage
'30d' -> 30 Tage
```

### useSensorOptions Composable

`composables/useSensorOptions.ts` liefert eine hierarchisch gruppierte Sensor-Liste. Der Widget-Config-Panel nutzt diesen Composable fuer die Sensor-Dropdown-Auswahl. Alle relevanten Felder:
- `groupedSensorOptions` — Array von `{label: zoneName, subgroups: [{label: subzoneName, options: [{value: sensorId, label, sensorType}]}]}`
- `filterZoneId` — optionaler Ref zum Filtern auf eine Zone

Der `WidgetConfigPanel.vue` zeigt den Sensor-Dropdown bereits fuer alle Widget-Typen die `hasSensorField === true` haben. Fuer das statistics-Widget muss `hasSensorField` auf `true` gesetzt werden.

### WidgetConfigPanel: Zeitraum-Selector

Es gibt bereits ein Zeitraum-Selector-Pattern in `WidgetConfigPanel.vue`. Die Logik ist an `hasTimeRange` verankert — ein computed boolean der bestimmt ob der Zeitraum-Selector angezeigt wird. Aktuell enthaelt `hasTimeRange` **nur** `['historical']` (NICHT `line-chart` oder `multi-sensor`). Das statistics-Widget muss in dieses Array aufgenommen werden.

### Bestehende Stats-Nutzung als Referenz

Zwei Stellen im Frontend rufen bereits `sensorsApi.getStats()` auf — diese als Implementierungs-Referenz nutzen:
1. `HistoricalChart.vue:188` — Parallel-Fetch neben dem Chart-Datenabruf, zeigt Stats als Overlay unter dem Chart
2. `MonitorView.vue:747` — `fetchDetailStats()` bei Sensor-Detail-Click in L2

Das Pattern ist: `watch()` auf relevante Dependencies (sensorId, timeRange), ruft `sensorsApi.getStats()` auf, speichert Ergebnis in lokalem `ref`, zeigt Lade-Spinner und Fehler-State. **Hinweis:** `watchEffect` mit `async` Callback ist ein Anti-Pattern (Cleanup-Race-Condition) — stattdessen `watch()` mit `{ immediate: true }` verwenden.

### TILE_ALLOWED_WIDGET_TYPES

`TILE_ALLOWED_WIDGET_TYPES` ist definiert in `MonitorView.vue:934` und `AddWidgetDialog.vue:54` (NICHT in InlineDashboardPanel). Nur Widget-Typen in dieser Liste werden in Zone-Tiles (MonitorView L1) erlaubt. Die Liste enthaelt aktuell `gauge` und `sensor-card`.

Das `statistics`-Widget darf **NICHT** in `TILE_ALLOWED_WIDGET_TYPES` aufgenommen werden. Eine KPI-Card mit 4+ Kennzahlen braucht mindestens w:4/h:3 und ist zu gross fuer die kompakten Zone-Tiles (max-height 120px). Das ist eine bewusste Design-Entscheidung.

### Design-Tokens

AutomationOne nutzt 129 Design-Tokens mit semantischen Prefixes. Kein `--ao-*` Prefix — die korrekten Prefixes sind `--color-*`, `--glass-*`, `--space-*`, `--elevation-*`, `--text-*`.

Wichtige Tokens fuer das Statistik-Widget:
- `--glass-bg` — Hintergrund fuer Cards (Glassmorphism)
- `--glass-border` — Border fuer Cards
- `--color-text-primary` — Haupttext (KPI-Werte)
- `--color-text-secondary` — Sekundaertext (Labels, Einheiten)
- `--color-status-good` — Gruener Status (hohe Datenqualitaet)
- `--color-status-warning` — Gelber Status (mittlere Datenqualitaet)
- `--color-status-alarm` — Roter Status (niedrige Datenqualitaet)
- `--space-1` bis `--space-6` — Abstands-Tokens (kleinster: `--space-1` = 4px, kein `--space-px`)
- `--text-xs` = 11px (kleinster Token; sub-11px-Werte fuer Badges koennen hardcoded sein)

---

## IST-Zustand

- `GET /api/v1/sensors/{esp_id}/{gpio}/stats` Endpoint **existiert** und liefert min, max, avg, std_dev, count, quality_distribution
- `sensorsApi.getStats()` **existiert** in `El Frontend/src/api/sensors.ts:144-158`
- `SensorStats` + `SensorStatsResponse` TypeScript-Typen **existieren** in `El Frontend/src/types/index.ts:799-822`
- `SensorStatsResponse` hat **kein `unit`-Feld** — Einheit kommt aus `SENSOR_TYPE_CONFIG`
- `quality_distribution` nutzt `QualityLevel` mit 7 Stufen: `excellent | good | fair | poor | bad | stale | error`
- `timeRange` Union-Typ enthaelt **kein `'30d'`** — muss ergaenzt werden
- Der Endpoint wird von **keinem Widget** genutzt (nur von HistoricalChart und MonitorView direkt)
- Es gibt **kein `statistics`** Widget im WidgetType-Union, kein Eintrag in componentMap/META/DEFAULT_CONFIGS
- `WidgetConfigPanel.vue` kennt `hasSensorField` und `hasTimeRange` — beide Mechanismen existieren, muessen nur fuer den neuen Typ aktiviert werden
- `hasTimeRange` enthaelt aktuell nur `['historical']`
- `showStdDev` und `showQuality` existieren **nicht** im Config-Interface des Dashboard-Stores

---

## SOLL-Zustand

Nach der Implementierung:

- Neuer Widget-Typ `statistics` ist an allen 4 Registrierungsstellen eingetragen
- `'30d'` ist zum `timeRange` Union-Typ ergaenzt
- `StatisticsWidget.vue` existiert in `components/dashboard-widgets/`
- Im Widget-Picker (AddWidgetDialog) erscheint "Statistik" in der Kategorie "Sensoren" mit Icon und Beschreibung
- Das Widget ruft `sensorsApi.getStats()` auf, zeigt Min/Avg/Max/StdDev + Count
- Unit wird aus `SENSOR_TYPE_CONFIG[sensorType]?.unit` bezogen (nicht aus der API-Response)
- Zeitraum-Auswahl (1h/6h/24h/7d/30d) funktioniert im WidgetConfigPanel
- Sensor-Auswahl ueber `useSensorOptions` funktioniert (gleiche Dropdown-Logik wie andere Widgets)
- Lade-Spinner beim Datenabruf, Fehler-State bei API-Fehler, Leer-State bei fehlender sensorId
- `statistics` ist **nicht** in `TILE_ALLOWED_WIDGET_TYPES`
- Kein Backend-Change noetig

---

## Betroffene Dateien (EXAKT)

| # | Datei | Aenderung | ~Zeilen |
|---|-------|-----------|---------|
| 1a | `shared/stores/dashboard.store.ts` ca. Z.26 | `'statistics'` zu WidgetType Union | 1 |
| 1b | `shared/stores/dashboard.store.ts` ca. Z.38-58 | `'30d'` zu timeRange Union ergaenzen | 1 |
| 1c | `shared/stores/dashboard.store.ts` ca. Z.38-58 | `showStdDev?: boolean` + `showQuality?: boolean` zum Config-Interface | 2 |
| 2a | `composables/useDashboardWidgets.ts` Imports | `import StatisticsWidget` | 1 |
| 2b | `composables/useDashboardWidgets.ts` ca. Z.87 | `componentMap`-Eintrag: `'statistics': StatisticsWidget` | 1 |
| 2c | `composables/useDashboardWidgets.ts` ca. Z.100 | `WIDGET_TYPE_META`-Eintrag (mit `category: 'Sensoren'`, Icon als Component) | 4 |
| 2d | `composables/useDashboardWidgets.ts` ca. Z.113 | `WIDGET_DEFAULT_CONFIGS`-Eintrag | 3 |
| 2e | `composables/useDashboardWidgets.ts` ca. Z.251 | 2 if-Zeilen in `mountWidgetToElement()` fuer `showStdDev` + `showQuality` | 2 |
| 3 | **NEU:** `components/dashboard-widgets/StatisticsWidget.vue` | Widget-Komponente | ~180 |
| 4a | `components/dashboard-widgets/WidgetConfigPanel.vue` | `'statistics'` in `hasSensorField`-Array | 1 |
| 4b | `components/dashboard-widgets/WidgetConfigPanel.vue` | `'statistics'` in `hasTimeRange`-Array (aktuell nur `['historical']`) | 1 |
| 4c | `components/dashboard-widgets/WidgetConfigPanel.vue` | `widgetTypeLabels`-Eintrag: `'statistics': 'Statistik'` | 1 |
| 4d | `components/dashboard-widgets/WidgetConfigPanel.vue` | Checkboxen fuer `showStdDev` + `showQuality` (am bestehenden Pattern orientieren) | ~10 |

**Keine Backend-Aenderungen.** Keine Aenderungen an TILE_ALLOWED_WIDGET_TYPES.

---

## Implementierungs-Schritte

### Schritt 1 — Dashboard Store erweitern (dashboard.store.ts)

**Datei:** `shared/stores/dashboard.store.ts`

**1.1 — WidgetType Union:**
`'statistics'` als neues Union-Member ergaenzen. Die Union hat die Form `type WidgetType = 'sensor-card' | 'line-chart' | ... `. Einfach `| 'statistics'` anhaengen.

**1.2 — timeRange Union erweitern:**
`'30d'` zum bestehenden timeRange Literal-Union ergaenzen. Aktuell: `'1h' | '6h' | '24h' | '7d' | 'custom'`. Neu: `'1h' | '6h' | '24h' | '7d' | '30d' | 'custom'`.

**1.3 — Config-Interface:**
In der Widget-Config-Interface-Definition (ca. Z.38-58) zwei neue optionale Properties ergaenzen:
```typescript
showStdDev?: boolean   // Standardabweichung anzeigen, default: true
showQuality?: boolean  // Datenqualitaets-Verteilung anzeigen, default: false
```
Diese Properties werden nur vom statistics-Widget genutzt, aber das flache Interface teilen alle Typen — das ist das bewusste Design-Pattern von AutomationOne.

---

### Schritt 2 — Widget in useDashboardWidgets registrieren (4 Stellen + Props-Bridge)

**Datei:** `composables/useDashboardWidgets.ts`

**2.1 — Import:**
```typescript
import StatisticsWidget from '@/components/dashboard-widgets/StatisticsWidget.vue'
```

**2.2 — componentMap:**
```typescript
'statistics': StatisticsWidget,
```

**2.3 — WIDGET_TYPE_META:**
```typescript
{
  type: 'statistics',
  label: 'Statistik',
  description: 'Min / Avg / Max und Standardabweichung fuer einen Sensor ueber einen Zeitraum',
  icon: BarChart3,       // Importierte Component aus lucide-vue-next, KEIN String!
  w: 4,                  // Default-Breite (Property heisst 'w', NICHT 'defaultW')
  h: 3,                  // Default-Hoehe (Property heisst 'h', NICHT 'defaultH')
  minW: 3,
  minH: 2,
  category: 'Sensoren',  // PFLICHTFELD fuer die Gruppierung im AddWidgetDialog
}
```
`BarChart3` aus `lucide-vue-next` verwenden — `BarChart2` existiert NICHT im Projekt. Alternativ ein passenderes Icon waehlen falls in den Imports bereits ein besseres vorhanden ist. Das Meta-Objekt-Format exakt an den bestehenden Eintraegen ausrichten (gleiche Property-Namen, gleiche Reihenfolge).

**2.4 — WIDGET_DEFAULT_CONFIGS:**
```typescript
'statistics': {
  timeRange: '7d',
  showStdDev: true,
  showQuality: false,
}
```

**2.5 — Props-Bridge in mountWidgetToElement():**
Die Props-Bridge in `mountWidgetToElement()` (ca. Z.226-278) nutzt eine flache if-Kette — KEIN switch/case, KEIN per-type Mapping. Alle Config-Props werden einzeln geprueft und generisch an alle Widget-Typen weitergereicht. Zwei neue if-Zeilen nach den bestehenden ergaenzen:
```typescript
if (config.showStdDev != null) props.showStdDev = config.showStdDev
if (config.showQuality != null) props.showQuality = config.showQuality
```

---

### Schritt 3 — StatisticsWidget.vue erstellen (neue Datei)

**Datei:** `components/dashboard-widgets/StatisticsWidget.vue` (NEU)

**Props:**
```typescript
interface Props {
  sensorId: string | undefined
  timeRange: string       // '1h' | '6h' | '24h' | '7d' | '30d'
  showStdDev: boolean
  showQuality: boolean
  title?: string
  zoneId?: string         // Kontext vom Dashboard, wird nicht direkt genutzt aber als Prop erwartet
}
```

**Daten-Logik:**

sensorId-Parsing ueber `useSensorId` mit Getter-Fallback (weil `sensorId` optional ist):
```typescript
const { espId, gpio, sensorType } = useSensorId(() => props.sensorId ?? '')
```

Unit aus `SENSOR_TYPE_CONFIG` beziehen (NICHT aus der API-Response — das Feld existiert dort nicht):
```typescript
import { SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'
const unit = computed(() => {
  if (!sensorType.value) return undefined
  return SENSOR_TYPE_CONFIG[sensorType.value]?.unit
})
```

Aus `timeRange` werden `start_time` und `end_time` berechnet (analog zu HistoricalChart):
```typescript
const endTime = computed(() => new Date().toISOString())
const startTime = computed(() => {
  const end = new Date(endTime.value)
  const ranges: Record<string, number> = {
    '1h':  1  * 60 * 60 * 1000,
    '6h':  6  * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d':  7  * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }
  return new Date(end.getTime() - (ranges[props.timeRange] ?? ranges['7d'])).toISOString()
})
```

Stats-Abruf per `watch()` mit `{ immediate: true }` (NICHT `watchEffect` mit async — das ist ein Anti-Pattern wegen Cleanup-Race-Conditions):
```typescript
const stats = ref<SensorStats | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

watch([espId, gpio, sensorType, startTime], async () => {
  if (!espId.value || gpio.value === null || !sensorType.value) return
  isLoading.value = true
  error.value = null
  try {
    const response = await sensorsApi.getStats(espId.value, gpio.value, {
      start_time: startTime.value,
      end_time: endTime.value,
      sensor_type: sensorType.value,
    })
    stats.value = response.stats
  } catch (e) {
    error.value = 'Statistiken konnten nicht geladen werden'
    stats.value = null
  } finally {
    isLoading.value = false
  }
}, { immediate: true })
```

**Template-Struktur:**

```
+-------------------------------------+
|  [Titel oder Sensor-Label]  [7 Tage]|  <- Header
|                                      |
|   Min    Avg    Max    StdDev        |  <- KPI-Grid (3 oder 4 Spalten)
|  18.2   22.4   27.1    2.3          |
|   C      C      C      C            |
|                                      |
|  2016 Messwerte                      |  <- Footer: Count
|  ========.. 95% excellent/good       |  <- Quality (optional, nur bei showQuality)
+-------------------------------------+
```

- **KPI-Grid:** 4 Spalten (Min, Avg, Max, StdDev). StdDev-Spalte nur wenn `showStdDev === true` — sonst 3 Spalten.
- **Jede KPI-Spalte:** Wert gross + Einheit klein + Label darunter
- **Null-Handling:** `null` -> ein em-Dash (nicht "N/A", nicht "null", nicht "NaN")
- **Footer:** Anzahl Datenpunkte (`reading_count`) + Zeitraum-Label
- **Quality-Sektion** (optional, nur bei `showQuality === true`): Fortschrittsbalken basierend auf `quality_distribution`. Die Distribution nutzt 7 `QualityLevel`-Stufen (`excellent | good | fair | poor | bad | stale | error`). Fuer die Anzeige sinnvoll gruppieren: `excellent + good` = gruen (`--color-status-good`), `fair` = gelb (`--color-status-warning`), `poor + bad + stale + error` = rot (`--color-status-alarm`)
- **Lade-State:** Spinner-Icon zentriert (analog zu anderen Widgets)
- **Fehler-State:** Rotes Icon + kurze Fehlermeldung (analog zu anderen Widgets)
- **Kein-Sensor-State:** Wenn `sensorId` fehlt oder leer, Hinweistext "Sensor auswaehlen" anzeigen (kein Crash, kein API-Call)

**CSS:**
Scoped CSS mit BEM-Klassen `.statistics-widget__*`. Keine globalen Klassen. Design-Tokens verwenden (siehe System-Kontext). Kein Tailwind (die anderen dashboard-widgets nutzen auch scoped CSS mit Design-Tokens).

---

### Schritt 4 — WidgetConfigPanel erweitern

**Datei:** `components/dashboard-widgets/WidgetConfigPanel.vue`

**4.1 — hasSensorField:**
`'statistics'` in das bestehende Array aufnehmen. Das exakte Array an den bestehenden Eintraegen ausrichten — einfach `'statistics'` anhaengen.

**4.2 — hasTimeRange:**
Aktuell enthaelt `hasTimeRange` nur `['historical']`. `'statistics'` ergaenzen:
```typescript
const hasTimeRange = computed(() =>
  ['historical', 'statistics'].includes(props.widgetType)
)
```

**4.3 — widgetTypeLabels:**
```typescript
'statistics': 'Statistik',
```

**4.4 — Widget-spezifische Optionen (showStdDev / showQuality):**
Zwei Checkboxen fuer das statistics-Widget ergaenzen. Am bestehenden Pattern fuer Widget-spezifische Optionen orientieren (z.B. wie `showThreshold` beim HistoricalChart gehandhabt wird):
- "Standardabweichung anzeigen" -> bindet an `config.showStdDev`
- "Datenqualitaet anzeigen" -> bindet an `config.showQuality`

Dazu ein `hasStatisticsOptions` computed ergaenzen, das nur fuer `'statistics'` `true` ist, und im Template die Checkboxen bedingt rendern.

---

## Abgrenzung: Was NICHT gemacht wird

- **Kein Chart / Sparkline** — Dieses Widget zeigt ausschliesslich KPI-Zahlen. Eine Sparkline waere Phase C.
- **Kein Median / Percentile / Trend** — Der Stats-Endpoint liefert diese Werte nicht. Phase C koennte den Endpoint erweitern, aber das ist nicht Scope dieses Auftrags.
- **Kein Zone-Filter-Parameter** — Der Stats-Endpoint hat keinen `zone_id` Parameter. Die Sensor-Identifikation erfolgt ausschliesslich ueber die sensorId (esp_id + gpio + sensor_type).
- **Keine Multi-Sensor-Statistik** — Ein statistics-Widget zeigt genau einen Sensor. Mehrere Sensoren vergleichen ist Subzone-Vergleich (PB-05).
- **Kein Backend-Change** — Der Endpoint ist fertig, die TypeScript-Typen sind fertig, der API-Client ist fertig.
- **Kein Eintrag in TILE_ALLOWED_WIDGET_TYPES** — Das Widget ist zu gross fuer Zone-Tiles (minH:2, Tiles haben max-height 120px).

---

## Akzeptanzkriterien

- [ ] `vue-tsc --noEmit` laeuft ohne neue Fehler durch
- [ ] Im Widget-Picker (AddWidgetDialog) erscheint "Statistik" in der Kategorie "Sensoren" mit Icon und Beschreibung
- [ ] Ein statistics-Widget kann erstellt, gespeichert und nach Reload wiederhergestellt werden
- [ ] Nach Sensor-Auswahl und Zeitraum-Auswahl werden Min/Avg/Max/Count korrekt angezeigt
- [ ] Unit wird korrekt aus `SENSOR_TYPE_CONFIG` angezeigt (z.B. "C"), nicht aus der API-Response
- [ ] Wenn der Stats-Endpoint `std_dev: null` zurueckgibt, erscheint ein em-Dash statt `null` oder `NaN`
- [ ] Lade-Spinner erscheint waehrend des API-Aufrufs
- [ ] Fehlermeldung erscheint wenn der API-Aufruf scheitert
- [ ] Wenn keine sensorId konfiguriert ist, zeigt das Widget "Sensor auswaehlen" an (kein Crash, kein API-Call)
- [ ] `showStdDev: false` versteckt die StdDev-Spalte (keine leere Spalte, Grid passt sich an)
- [ ] `showQuality: true` zeigt die Quality-Verteilung gruppiert (excellent+good / fair / rest)
- [ ] Das Widget erscheint NICHT in Zone-Tiles (TILE_ALLOWED_WIDGET_TYPES unveraendert)
- [ ] Zeitraum-Aenderung im WidgetConfigPanel loest einen neuen API-Call aus
- [ ] `'30d'` funktioniert als timeRange ohne TypeScript-Fehler
- [ ] Kein bestehender Widget-Typ ist durch die Aenderungen beeinflusst

---

## Einschraenkungen

- **Nur Frontend** — Backend-Dateien nicht anfassen
- **4 Dateien** (3 bestehende + 1 neue) — kein Scope-Creep
- **Kein neues npm-Package** — alle noetigen Abhaengigkeiten (sensorsApi, Composables, Lucide-Icons) sind bereits installiert
- **TypeScript strict** — keine `any`-Typen, alle Props explizit typisiert
- **Scoped CSS** — keine globalen Stil-Klassen hinzufuegen
- **Design-Tokens** — keine hardcodierten Farben ausser sub-11px font-size fuer Badges
- **watch() statt watchEffect()** fuer async Operationen — Cleanup-Race vermeiden

---

## Agent

Frontend-Agent (El Frontend, Vue 3 + TypeScript)
