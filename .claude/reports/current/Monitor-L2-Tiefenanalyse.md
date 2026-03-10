# Monitor L2 Analyse-Report — Zone-Detail Tiefenanalyse

> **Erstellt:** 2026-03-10
> **Typ:** Analyse (kein Code geaendert)
> **Datei:** MonitorView.vue (~2400 Zeilen), Route `/monitor/:zoneId`

---

## 1. Komponentenbaum (mit Dateipfaden)

### Routing-Bedingungen (MonitorView.vue)

```
isDashboardView = !!route.params.dashboardId   (Zeile 136)
isZoneDetail    = !!route.params.zoneId         (Zeile 137)
```

```
MonitorView.vue
├── L3 Dashboard: v-if="isDashboardView"         (Zeile 1682)
│   └── DashboardViewer
├── L1/L2: v-else                                 (Zeile 1687)
│   ├── L1: v-if="!isZoneDetail"                  (Zeile 1692)
│   └── L2: v-else                                (Zeile 1894)
│       ├── BaseSkeleton v-if="zoneMonitorLoading" (Zeile 1896)
│       ├── ErrorState v-else-if="zoneMonitorError" (Zeile 1897)
│       └── div v-else ref="monitorContentRef"     (Zeile ~1900)
└── L3 SlideOver (global, nicht in v-else)         (Zeile 2217)
```

### Importierte Komponenten in L2

| Komponente | Datei | Zeile Import | L2-Verwendung |
|---|---|---|---|
| `ViewTabBar` | `@/components/common/ViewTabBar.vue` | 66 | Immer sichtbar (Tab-Leiste) |
| `BaseSkeleton` | `@/shared/design/primitives/BaseSkeleton.vue` | 71 | Loading-Gate |
| `ErrorState` | `@/shared/design/patterns/ErrorState.vue` | 72 | API-Error + Retry |
| `SensorCard` | `@/components/devices/SensorCard.vue` | 67 | Sensor-Kacheln |
| `ActuatorCard` | `@/components/devices/ActuatorCard.vue` | 68 | Aktor-Kacheln |
| `LiveLineChart` | `@/components/charts/LiveLineChart.vue` | 41 | Sparkline im SensorCard #sparkline Slot |
| `Line` (vue-chartjs) | `vue-chartjs` | 40 | Expanded 1h-Chart |
| `ZoneRulesSection` | `@/components/monitor/ZoneRulesSection.vue` | 73 | "Regeln fuer diese Zone" |
| `InlineDashboardPanel` | `@/components/dashboard/InlineDashboardPanel.vue` | 70 | Eingebettete Dashboards |
| `SlideOver` | `@/shared/design/primitives/SlideOver.vue` | 38 | L3 Sensor-Detail |

### Stores in L2

| Store | Import | Verwendung |
|---|---|---|
| `useEspStore` | `@/stores/esp` | Device-Daten, `fetchAll()`, `sendActuatorCommand()` |
| `useZoneStore` | `@/shared/stores/zone.store` | `zoneEntities`, `activeZones`, `archivedZones` |
| `useDashboardStore` | `@/shared/stores/dashboard.store` | Breadcrumb, Layouts, `generateZoneDashboard()`, Inline-Panels |
| `useLogicStore` | `@/shared/stores/logic.store` | `getRulesForZone()`, `getRulesForActuator()`, `getLastExecutionForActuator()` |

### Composables in L2

| Composable | Verwendung |
|---|---|
| `useZoneGrouping` | Fallback-Gruppierung (wenn API fehlt) |
| `useSubzoneResolver` | Lazy GPIO→Subzone Aufloesung (nur bei API-Error) |
| `useSparklineCache` | Sparkline-Daten (Initial Load + WS-Updates) |
| `useSwipeNavigation` | Swipe-Geste fuer Zone-Navigation |

---

## 2. Gruppierungslogik — Code-Pfad (KRITISCH)

### Vollstaendiger Datenfluss

```
┌─────────────────────────────────────────────────────────────────────┐
│ Route-Wechsel: /monitor/:zoneId                                     │
│     ↓                                                               │
│ watch(selectedZoneId) → fetchZoneMonitorData()                      │
│     ↓                                                               │
│ zonesApi.getZoneMonitorData(zoneId, abortSignal)                    │
│     ↓                                                               │
│ GET /api/v1/zone/{zoneId}/monitor-data                              │
│     ↓ Response: ZoneMonitorData                                     │
│ zoneMonitorData.value = data                                        │
│     ↓                                                               │
│ zoneSensorGroup (computed, Zeile 1151)                               │
│   → if zoneMonitorData && !error: API-Daten → ZoneGroup-Shape       │
│   → else: Fallback useZoneGrouping + useSubzoneResolver              │
│     ↓                                                               │
│ zoneActuatorGroup (computed, Zeile 1178)                             │
│   → identisches Muster fuer Aktoren                                 │
│     ↓                                                               │
│ filteredSensorSubzones (computed, Zeile 108)                         │
│   → Subzone-Filter anwenden                                        │
│ filteredActuatorSubzones (computed, Zeile 114)                       │
│     ↓                                                               │
│ Template v-for (SENSOREN-Sektion, Zeile ~1990)                       │
│   → Accordion pro Subzone → SensorCard[]                            │
│ Template v-for (AKTOREN-Sektion, Zeile ~2080)                        │
│   → Accordion pro Subzone → ActuatorCard[]                           │
└─────────────────────────────────────────────────────────────────────┘
```

### WO wird die Trennung SENSOREN/AKTOREN erzeugt?

**Die Trennung entsteht durch ZWEI separate computed properties:**

- `zoneSensorGroup` (Zeile 1151): Mappt `data.subzones[].sensors` → `SensorWithContext[]`
- `zoneActuatorGroup` (Zeile 1178): Mappt `data.subzones[].actuators` → `ActuatorWithContext[]`

Beide nutzen dieselben Subzone-Daten, aber filtern jeweils nur Sensoren bzw. Aktoren heraus. Im Template werden sie in ZWEI getrennte `<section>`-Bloecke gerendert:

```
SENSOREN (N)          ← Sektionsueberschrift mit sensorCount
  ├── Subzone A       ← Accordion
  │   └── SensorCard[]
  ├── Subzone B
  │   └── SensorCard[]
  └── Keine Subzone
      └── SensorCard[]

AKTOREN (N)           ← Sektionsueberschrift mit actuatorCount
  ├── Subzone A       ← GLEICHE Subzone nochmal!
  │   └── ActuatorCard[]
  ├── Subzone B
  │   └── ActuatorCard[]
  └── Keine Subzone
      └── ActuatorCard[]
```

**→ Das ist das Kernproblem:** Jede Subzone erscheint ZWEIMAL.

### Server-Response vs. Frontend-Aufteilung

Die Server-Response (`ZoneMonitorData`) liefert Subzones mit **BEIDEN** Geraetetypen zusammen:

```typescript
// types/monitor.ts
interface SubzoneGroup {
  subzone_id: string | null
  subzone_name: string
  sensors: SubzoneSensorEntry[]    // ← beides in EINER Subzone
  actuators: SubzoneActuatorEntry[]
}
```

Das Frontend **trennt** diese dann in zwei separate Computed Properties. Die Trennung ist also eine reine Frontend-Entscheidung — der Server liefert bereits die "richtige" Struktur (Subzone-primaer).

### "Keine Subzone"-Behandlung

- Server liefert `subzone_id: null` fuer nicht zugeordnete Geraete
- `useZoneGrouping` verwendet intern `SUBZONE_NONE = '__none__'` als Sentinel, normalisiert auf `subzoneId: null`
- Angezeigter Name: `'Keine Subzone'`
- CSS-Klasse: `monitor-subzone--unassigned` (Zeile 1990)
- Sortierung: Subzonen mit `subzoneId === null` werden **ans Ende** sortiert

### Shared Devices (multi_zone)

- `device_scope` und `assigned_zones` Felder sind in `SensorWithContext`/`ActuatorWithContext` deklariert
- `useZoneGrouping` setzt sie **nicht explizit** — sie kommen nur mit wenn der ESP-Store sie schon traegt (via `...sensor` Spread)
- **Kein spezielles Filtering in L2:** Die Server-API `getZoneMonitorData()` liefert nur Geraete die zu DIESER Zone gehoeren — Multi-Zone-Geraete werden Server-seitig inkludiert wenn die Zone in `assigned_zones` steht
- **Kein visueller Hinweis im Accordion-Header** dass ein Shared Device gezeigt wird — nur das Scope-Badge auf der individuellen Card

### Mobile Devices

- Aktuell **keine spezielle Behandlung** in L2
- Die Server-API muesste mobile Devices basierend auf `active_zone_id` inkludieren
- **Kein "Aktiv seit..." Hinweis** implementiert
- **Kein visueller Unterschied** zu normalen Devices ausser dem Scope-Badge "Mobil"

---

## 3. SensorCard Anatomie

**Datei:** `El Frontend/src/components/devices/SensorCard.vue`

### Props

```typescript
interface Props {
  sensor: SensorWithContext   // required
  mode: 'monitor' | 'config' // required
  trend?: TrendDirection      // optional: 'rising' | 'stable' | 'falling'
}
```

### Emits

```typescript
{ configure: [sensor: SensorWithContext]   // config-mode
  click:     [sensor: SensorWithContext] } // monitor-mode → Parent oeffnet L3 SlideOver
```

### Monitor-Mode Aufbau

```
┌──────────────────────────────────────┐
│ [Typ-Icon] displayName   ●OK        │  ← Header: Icon + Name + Quality-Dot+Label
│                                      │
│        22.5 °C  ↗                    │  ← KPI: Wert (1.5rem mono bold) + Unit + Trend
│                                      │
│ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌    │  ← #sparkline Slot (32px, LiveLineChart)
│                                      │
│ ESP_ABC  [Subzone] [MZ] [Stale]     │  ← Footer: ESP-ID + Badges
└──────────────────────────────────────┘
```

### Icon-Fallback (3-stufig)

1. Exakter Treffer: `SENSOR_TYPE_CONFIG[sensor_type]?.icon` → `ICON_MAP` Lookup
2. Suffix-Matching: `bme280_pressure` → sucht `pressure` in SENSOR_TYPE_CONFIG
3. Default: `CircleDot` (Lucide)

ICON_MAP: Thermometer, Droplets, Wind, Sun, Gauge, Leaf, Activity

### Name-Anzeige (`displayName`)

`getSensorDisplayName({ sensor_type, name })` — Multi-Value-Disambiguierung:
- `sht31_temp` + name="Temp&Hum" → **"Temp&Hum (Temperatur)"**
- `sht31_humidity` + name="Temp&Hum" → **"Temp&Hum (Luftfeuchte)"**
- Single-Value mit Custom-Name → Name direkt
- Kein Name → SENSOR_TYPE_CONFIG Label (z.B. "Temperatur")

### Quality-Status

- `effectiveQualityStatus`: Bei Stale (>120s) → Override auf `'warning'`
- Dot: 8px Kreis, Farben: `--color-success/warning/error/text-muted`
- Label: "OK" / "Warnung" / "Kritisch" / "Offline" / "Veraltet"

### KPI-Wert

```typescript
formatValue(value: number | null | undefined): string
  // null/undefined → '--'
  // Ganzzahl → toString()
  // Dezimal → toFixed(1)  // KEIN Locale-Format (Punkt, nicht Komma!)
```

Unit: `sensor.unit` (wenn nicht 'raw') → `SENSOR_TYPE_CONFIG` Fallback → leerer String

### Sparkline

- **Kein eigenes Rendering** — nur named slot `#sparkline`
- MonitorView injiziert `LiveLineChart` (compact mode) mit:
  - `sensor-type` → auto Y-Range aus SENSOR_TYPE_CONFIG
  - `thresholds` → farbige Schwellwert-Zonen
  - `data` → aus `sparklineCache`
- Hoehe: 32px Container, `overflow: hidden`
- Bei Stale: `opacity: 0.5`, `filter: saturate(0.3)`

### Stale-Erkennung (>120 Sekunden)

- Trigger: `getDataFreshness(sensor.last_read)` returned `'stale'`
- Visuelle Markierung:
  - `opacity: 0.7` auf der ganzen Karte
  - `border-left: 3px solid var(--color-warning)` — primaeres Signal
  - Quality Override auf "Veraltet" (gelber Dot)
  - Footer-Badge: Clock-Icon + `formatRelativeTime(last_read)`

### ESP-Offline-Indikator

- Trigger: `esp_state !== 'OPERATIONAL'`
- `opacity: 0.5`
- Footer-Badge: WifiOff-Icon + "ESP offline"
- Hat Vorrang vor Stale-Badge (v-if / v-else-if Kette)

### Scope-Badges

| Scope | Badge-Text | Farbe |
|---|---|---|
| `zone_local` oder null | kein Badge | — |
| `multi_zone` | "Multi-Zone" | blau (rgba 96,165,250) |
| `mobile` | "Mobil" | orange (rgba 251,146,60) |

Tooltip: `"Bedient: Zone A, Zone B"` (aus `assigned_zones`)

### Trend-Pfeil

- `TrendingUp` / `Minus` / `TrendingDown` Icons (14px)
- Immer `--color-text-muted` (neutral, kein Farbkodierung)
- Nur gerendert wenn `trend` Prop gesetzt
- `title`-Attribut: "Steigend" / "Stabil" / "Fallend"

### Click-Verhalten

- Monitor-Mode: `emit('click', sensor)` → MonitorView oeffnet L3 SlideOver
- Config-Mode: `emit('configure', sensor)`
- **Kein** direktes `router.push()` in der Karte

---

## 4. ActuatorCard Anatomie

**Datei:** `El Frontend/src/components/devices/ActuatorCard.vue`

### Props

```typescript
interface Props {
  actuator: ActuatorWithContext
  mode: 'monitor' | 'config'
  linkedRules?: LogicRule[]                  // nur monitor
  lastExecution?: ExecutionHistoryItem | null // nur monitor
}
```

### Emits

```typescript
{ configure: [actuator: ActuatorWithContext]
  toggle: [espId: string, gpio: number, currentState: boolean] }
```

### Monitor-Mode Aufbau

```
┌──────────────────────────────────────┐
│ [⏻] Luftbefeuchter                  │  ← Header: Power-Icon (40x40, gruen/grau) + Name
│ ESP_ABC · pump                       │  ← Meta-Zeile
│ Bedient: To Delete                   │  ← Subzone-Label
│                                      │
│ [Aus]  [75%]  [MZ]                   │  ← Badges: State + PWM + Scope
│                                      │
│ ● Temp > 28°C → ON                  │  ← Linked Rule 1 (max 2)
│ ● Humidity < 40% → ON               │  ← Linked Rule 2
│ +3 weitere                           │  ← Link zu /logic
│                                      │
│ Zuletzt: vor 5 Min. (Regel)         │  ← Last Execution
└──────────────────────────────────────┘
```

### Toggle-Button

```html
<button v-if="mode !== 'monitor'" ...>  <!-- NICHT im DOM bei monitor -->
```

**Vollstaendig ausgeblendet in Monitor-Mode** (`v-if`, nicht `v-show`).

> **Inkonsistenz:** MonitorView verdrahtet `@toggle="toggleActuator"`, aber der Button der das Event emittiert ist im Monitor-Mode ausgeblendet. Der Handler existiert, wird aber nie aufgerufen.

### PWM-Anzeige

- `pwm_value > 0`: Badge mit `"75%"` (gerundet)
- `actuator_type === 'pwm'` und `pwm_value === 0`: Text "PWM: 0%"
- Sonst: nichts

### Linked Rules (max 2)

| Dot-Farbe | Bedingung |
|---|---|
| Grau (`--color-text-muted`) | Default (disabled) |
| Gruen (`--color-status-success`) | `rule.enabled === true` |
| Rot (`--color-status-error`) | `rule.last_execution_success === false` |

- `formatConditionShort(rule)`: "Temperatur > 28°C", "06:00-20:00", "[Komplex]"
- Bei >2 Regeln: `router-link to="/logic"` mit "+N weitere"

### Subzone-Anzeige ("Bedient: ...")

```typescript
servedSubzoneLabel = actuator.subzone_name || actuator.subzone_id || '—'
```

**Unterschied zu SensorCard:** ActuatorCard zeigt `'—'` (em-dash), SensorCard zeigt `'Keine Subzone'`.

### FEHLENDE Informationen in ActuatorCard

| Was fehlt | Warum relevant |
|---|---|
| **ESP-Offline-Indikator** | `esp_state` Feld existiert in `ActuatorWithContext`, wird aber **ignoriert** (SensorCard wertet es aus!) |
| **Stale-Erkennung** | Kein Timestamp-Check, keine visuelle Markierung |
| **Aktuator-Typ-Icon** | Immer Power-Icon, keine Unterscheidung Pumpe/Ventil/PWM/Relay |
| **Dauer des Zustands** | "Laeuft seit 12 Min." fehlt |
| **PWM-Visualisierung** | Nur Text, kein Balken/Fortschritt |
| **Emergency-Stop-Grund** | Nur boolean, kein Grund-Feld |

### Vergleich SensorCard vs. ActuatorCard

| Aspekt | SensorCard | ActuatorCard |
|---|---|---|
| Stale/Offline Detection | vollstaendig | **fehlt komplett** |
| KPI-Wert | prominente Zahl (1.5rem mono bold) | nur Ein/Aus Badge |
| Sparkline | slot-basiert | nicht vorhanden |
| Rules-Kontext | keiner | max 2 Rules + Status-Dots |
| Subzone-Fallback | "Keine Subzone" | "—" (em-dash) |
| ESP-offline | ja (opacity, badge) | **nein** |
| Variable Hoehe | **ja** — unterschiedliche Kartenhöhen im selben Grid |

---

## 5. Accordion-Verhalten

### State-Speicherung

```typescript
collapsedSubzones = ref<Set<string>>(new Set())
// localStorage-Key: `ao-monitor-subzone-collapse-${zoneId}`
// getSubzoneKey(zoneId, subzoneId): `"${zoneId ?? '__u'}-${subzoneId ?? '__n'}"`
```

### Smart Defaults

```
Zaehle unique named subzoneIds (nicht null):
  ≤ 4 Subzonen  → alle offen (collapsedSubzones = {})
  > 4 Subzonen  → nur erste named + "Keine Subzone" offen, Rest geschlossen
```

### Lade-Reihenfolge

1. `watch(selectedZoneId)` → `loadAccordionState(zoneId)` (Zeile 1427)
2. `loadAccordionState`: localStorage → bei Erfolg: gespeicherter State; bei Fehler/leer: `applySmartDefaults()`
3. Zweiter `watch([zoneSensorGroup, zoneActuatorGroup])` (Zeile 1439): prueft `smartDefaultsApplied`, falls nicht und kein localStorage → erneut `applySmartDefaults()` → `smartDefaultsApplied = true`

### Accordion-Header Sichtbarkeit

- Header nur wenn `subzones.length > 1 || subzone.subzoneName`
- Bei genau einer Subzone ohne Name: **kein Header, Inhalt direkt sichtbar**
- Content `v-show`: Single-subzone-ohne-Name → immer sichtbar; sonst → ueber `collapsedSubzones`

### Leere Subzones

**Sensor-Sektion:**
- Leerer Hint **nur** wenn `sensors.length === 0 AND !subzoneHasActuators(subzoneId)`
- Text: "Keine Geraete zugeordnet" (kompakt, kein Link)

**Aktor-Sektion:**
- Leerer Hint **nur** wenn `actuators.length === 0 AND !subzoneHasSensors(subzoneId) AND Zone hat ueberhaupt keine Sensoren`
- Drei-fache Bedingung verhindert doppelte Leer-Meldungen

### Aggregationszeile im Accordion-Header

Die Aggregationszeile ("41.4RH · 18.6°C") wird **NICHT** in den L2-Accordions gerendert. Sie existiert nur in L1 (ZonePlate im HardwareView). Die L2-Accordion-Header zeigen nur den Subzone-Namen.

> **Befund:** Im Kontext-Dokument referenzierte Aggregation bezieht sich auf HardwareView L1, nicht Monitor L2.

---

## 6. Datenfluss-Diagramm

```
┌─ Route-Wechsel (/monitor/:zoneId) ────────────────────────────────┐
│                                                                     │
│  watch(selectedZoneId)                                              │
│     ↓                                                               │
│  Reset: subzoneFilter=null, expandedSensor=null, smartDefaults=false│
│     ↓                                                               │
│  fetchZoneMonitorData()                                             │
│     ├── abort previous AbortController                              │
│     ├── zoneMonitorLoading = true                                   │
│     ├── Guard: Zone muss in espStore.devices existieren             │
│     │                                                               │
│     ↓ API: GET /zone/{id}/monitor-data + AbortSignal               │
│     │                                                               │
│     ├── Success: zoneMonitorData.value = data                       │
│     │     ↓                                                         │
│     │   zoneSensorGroup (computed) → ZoneGroup mit Subzone-Sensoren │
│     │   zoneActuatorGroup (computed) → ZoneGroup mit Subzone-Aktoren│
│     │     ↓                                                         │
│     │   Subzone-Filter → filteredSensorSubzones/Actuator            │
│     │     ↓                                                         │
│     │   Accordion Smart Defaults (localStorage oder ≤4 Logik)       │
│     │     ↓                                                         │
│     │   Sparkline loadInitialData(sensors) via useSparklineCache    │
│     │     ↓                                                         │
│     │   Template: SENSOREN + AKTOREN Sektionen                      │
│     │                                                               │
│     ├── AbortError: silently ignored                                │
│     │                                                               │
│     └── Error: zoneMonitorError = message                           │
│           ↓                                                         │
│         watch(zoneMonitorError) → subzoneResolver.buildResolver()   │
│           ↓                                                         │
│         Fallback: useZoneGrouping + useSubzoneResolver              │
│                                                                     │
│  Live-Updates:                                                       │
│     espStore.devices (WS sensor_data) → sparklineCache Watcher      │
│     ABER: zoneMonitorData ist ein Snapshot, wird NICHT per WS       │
│           aktualisiert. Nur der Fallback-Pfad ist vollstaendig      │
│           reaktiv auf WS-Updates.                                    │
│                                                                     │
│  Zone-Navigation: ArrowLeft/Right + Swipe → router.replace(nextZone)│
│     → Triggers watch(selectedZoneId) → neuer Fetch-Zyklus           │
└─────────────────────────────────────────────────────────────────────┘
```

### Sparkline-Integration

1. `useSparklineCache()` instanziiert (Zeile 143)
2. Watcher auf `zoneSensorGroup` (Zeile 1323-1334): bei neuen Zone-Daten → `loadSparklineHistory(sensors)`
3. `loadInitialData()`: `sensorsApi.queryData()` fuer letzte 30 Punkte pro Sensor, max 5 parallel
4. Live-Updates: espStore.devices deep-Watcher → neue Punkte bei Value-Aenderung oder >5s
5. `mergeAndDeduplicate()`: historische + Live-Punkte, 5s Dedup, chronologisch, max 30

### Kritischer Hinweis: API-Snapshot vs. Live-Updates

Die primaere Datenquelle `zoneMonitorData` (von `getZoneMonitorData()`) ist ein **einmaliger Snapshot**. Wenn sich Sensorwerte per WebSocket aendern, werden die **Sparklines** aktualisiert (via sparklineCache), aber die **Zahlenwerte in den SensorCards** zeigen weiterhin die API-Snapshot-Werte.

Nur der Fallback-Pfad (useZoneGrouping) ist vollstaendig reaktiv, weil er direkt auf `espStore.devices` arbeitet.

---

## 7. "Regeln fuer diese Zone" Analyse

**Datei:** `El Frontend/src/components/monitor/ZoneRulesSection.vue`

### Props

```typescript
interface Props {
  zoneId: string | null
}
// Keine Emits — Navigation via useRouter intern
```

### Datenquelle

- `logicStore.fetchRules()` in `onMounted` (wenn Store leer)
- `logicStore.getRulesForZone(zoneId)`: Cross-referenziert `espStore.devices` → findet ESPs in der Zone → filtert Regeln nach diesen ESP-IDs
- Sortierung: priority, dann name

### RuleCardCompact zeigt

| Element | Inhalt |
|---|---|
| Status-Dot (8px) | gruen=enabled, grau=disabled, rot=error |
| Name | rule.name (truncated, 12px, bold) |
| Status-Text | "Aktiv" / "Deaktiviert" / "Fehler" |
| AlertCircle | bei `last_execution_success === false` |
| shortDescription | erste Condition + erste Action (z.B. "temperature >= 25 → ON") |
| Last-Triggered | Clock-Icon + relative Zeit |
| **Zone-Badge** | **Wird in L2 NICHT angezeigt** (zoneNames prop leer — Zone ist implizit) |

### Threshold-Logik

```typescript
const RULES_VISIBLE_THRESHOLD = 10
const MAX_DISPLAYED_WHEN_OVER = 5
```

- ≤10 Regeln: alle anzeigen
- >10 Regeln: erste 5 + "Weitere X Regeln — Im Regeln-Tab anzeigen"
- Header zeigt immer echten Total-Count

### Empty State

- Zap-Icon, "Keine Automatisierungen fuer diese Zone"
- Button "Zum Regeln-Tab" → `router.push({ name: 'logic' })`

### Click → Navigation

`router.push({ name: 'logic-rule', params: { ruleId: rule.id } })` — navigiert **weg** von Monitor zu LogicView.

### Platz-Verbrauch

- Rules stacked in `flex-direction: column; gap: var(--space-4)`
- Empty State: `padding: --space-6 --space-4` (groesster Padding-Block)
- "More"-Bar: dashed border, `--color-bg-tertiary` Hintergrund

---

## 8. Zone-Dashboards Analyse

### Laden

- `useDashboardStore()` laedt automatisch: `loadLayouts()` (localStorage) → `fetchLayouts()` (Server API)
- Watcher auf `[selectedZoneId, espStore.devices.length]` triggert `generateZoneDashboard()` beim ersten L2-Besuch

### Auto-Generierung

- `dashStore.generateZoneDashboard()`: Erstellt Layout mit Sensor-LineCharts (volle Breite, h:3), Gauges (halbe Breite, h:2), ActuatorCards (Drittel-Breite, h:2)
- `autoGenerated: true` → "Anpassen" Button: `claimAutoLayout()` → Editor
- Regenerierung wenn `totalSensors + totalActuators !== currentWidgetCount`

### `getDashboardNameSuffix(dash)`

Eindeutige Suffix fuer gleichnamige Dashboards:
- Mit createdAt: `" (12.02.)"` (Datum-Kurzformat)
- Ohne createdAt: `" #a3b2c1"` (letzte 6 ID-Zeichen)
- Beides nicht: leerer String

### Inline-Panels in L2

```typescript
inlineMonitorPanelsL2 = computed(() => {
  const cross = dashStore.inlineMonitorPanelsCrossZone  // scope !== 'zone'
  const forZone = dashStore.inlineMonitorPanelsForZone(zoneId)  // scope === 'zone'
  return [...cross, ...forZone].sort(by target.order)
})
```

- `InlineDashboardPanel`: 12-Spalten CSS-Grid (kein GridStack), Row-Height 80px
- `showConfigButton: false`, `showWidgetHeader: false`
- Nur gerendert wenn `layout && widgets.length > 0`

---

## 9. Use-Case-Bewertung (5 Szenarien)

### UC-A: Gewaechshaus "Zelt Wohnzimmer" (2 SHT31-Sensoren, 1 Aktor, 1 Subzone "To Delete")

| Aspekt | Bewertung |
|---|---|
| **Funktioniert** | SensorCards zeigen disambiguierte Namen ("Temp&Hum (Temperatur)" / "Temp&Hum (Luftfeuchte)"). Sparklines vorhanden. Quality-Status sichtbar. |
| **Verwirrend** | **4 Accordion-Gruppen statt 2:** "Keine Subzone" + "To Delete" je unter SENSOREN und AKTOREN. Die leeren Gruppen zeigen "Keine Geraete zugeordnet", aber nur wenn die Cross-Section-Bedingung erfuellt ist. |
| **Fehlt** | Kein Hinweis warum Sensoren in "Keine Subzone" und Aktor in "To Delete" — kein visueller Zusammenhang zwischen Sensor und dem Aktor den er steuert. |
| **Verbesserung** | Subzone als primaere Gruppierung: "Keine Subzone" zeigt 2 SensorCards, "To Delete" zeigt 1 ActuatorCard. Von 4 auf 2 Accordion-Gruppen. |

### UC-B: Fertigation-Zone (2 Subzones, je 3 Sensoren + 1 Ventil, Shared pH/EC)

| Aspekt | Bewertung |
|---|---|
| **Funktioniert** | Subzone-Filter funktioniert. Sensor- und Aktorkarten grundsaetzlich korrekt. |
| **Verwirrend** | **4 Accordion-Gruppen statt 2.** Zusammengehoerige Sensoren+Ventil einer Subzone werden visuell getrennt. pH/EC-Sensor aus Technikzone hat Scope-Badge "Multi-Zone", aber die Information "Shared Device" ist leicht zu uebersehen. |
| **Fehlt** | Kein Hinweis welcher Sensor welchen Aktor steuert (Regel-Verknuepfung). ActuatorCard zeigt zwar linked Rules, aber die Zuordnung "Substrat-Sensor → Ventil" ist nicht offensichtlich. |
| **Verbesserung** | Subzone-primaer: "Becken Ost" zeigt 3 Sensoren + 1 Ventil zusammen. Shared Device mit deutlichem Banner "Von Zone Technik". |

### UC-C: Klimazone (1 grosse Subzone, 4 Temp/Hum, 2 Luefter, 1 Befeuchter multi_zone)

| Aspekt | Bewertung |
|---|---|
| **Funktioniert** | Grid skaliert (repeat auto-fill minmax 220px). Quality-Dots und Stale-Erkennung. |
| **Verwirrend** | 8 Sensor-Cards (4x2 Multi-Value SHT31) + 3 Aktor-Cards in GETRENNTEN Sektionen. Befeuchter hat Scope-Badge "Multi-Zone", aber die 2. bediente Subzone steht nur im Tooltip. |
| **Fehlt** | ActuatorCard zeigt keinen ESP-Offline-Indikator (SensorCard hat ihn). Bei 8+ Cards wird der Zusammenhang zwischen Sensor und Aktor voellig unklar. |
| **Verbesserung** | Subzone-primaer: Eine Gruppe mit allen 11 Geraeten. Sensoren und Aktoren klar getrennt INNERHALB der Subzone (z.B. mit Sub-Ueberschrift). Befeuchter mit sichtbarem "Auch in: Zone X" Hinweis. |

### UC-D: Mobiler Forscher (0 feste Geraete, mobiler Sensor aktiv)

| Aspekt | Bewertung |
|---|---|
| **Funktioniert** | Scope-Badge "Mobil" (orange) wird angezeigt. |
| **Verwirrend** | — |
| **Fehlt** | **Kein "Aktiv seit..." Hinweis.** Kein klarer Unterschied zwischen festem und mobilem Sensor im Layout. Kein Indikator dass der Sensor jederzeit "verschwinden" kann. Kein Handling fuer den Fall dass der Sensor waehrend der Betrachtung den Kontext wechselt (WS-Event `device_context_changed` ist registriert aber hat keine L2-Auswirkung). |
| **Verbesserung** | Eigene Sektion "Mobile Geraete" oder visuell abgehobene Karte mit "Aktiv seit 14:32" und Warn-Hinweis "Kann jederzeit wechseln". |

### UC-E: Wissenschaftliches Projekt (8 diverse Sensoren, 0 Aktoren)

| Aspekt | Bewertung |
|---|---|
| **Funktioniert** | SensorCards mit verschiedenen Typ-Icons. Sparklines mit typ-spezifischen Y-Ranges und Thresholds. Trend-Pfeile. |
| **Verwirrend** | **"AKTOREN (0)" Sektion wird angezeigt** — komplett nutzlos, verschwendet Platz und suggeriert dass Aktoren erwartet werden. Die leeren Aktor-Accordions zeigen "Keine Geraete zugeordnet" pro Subzone (suppression-Logik greift hier: Zone HAT Sensoren, also wird der Aktor-Hint in den meisten Subzones unterdrueckt — aber die SEKTION selbst bleibt sichtbar). |
| **Fehlt** | Bei 8+ Sensoren verschiedener Typen kein Aggregations-/Vergleichs-Widget. "Regeln" Sektion zeigt leeren State obwohl keine Aktoren vorhanden (Regeln machen ohne Aktoren wenig Sinn). |
| **Verbesserung** | AKTOREN-Sektion mit `v-if="actuatorCount > 0"` ausblenden. Regeln-Sektion ebenfalls ausblenden wenn keine Aktoren vorhanden. |

---

## 10. Aenderungsbedarf (kategorisiert)

### KRITISCH — Kernproblem

| ID | Problem | Aufwand | Betroffene Dateien |
|---|---|---|---|
| **K1** | Subzone-Dopplung: Jede Subzone erscheint 2x (unter SENSOREN + AKTOREN). Bei N Subzones = 2N Accordions. | Mittel | MonitorView.vue, types/monitor.ts (Server liefert bereits richtige Struktur) |
| **K2** | API-Snapshot nicht reaktiv: Sensorwerte in Cards werden nach initialem Load nicht per WS aktualisiert. Nur Sparklines sind live. | Mittel | MonitorView.vue (zoneSensorGroup computed muesste WS-Merge machen) |

### HOCH — Inkonsistenzen

| ID | Problem | Aufwand | Betroffene Dateien |
|---|---|---|---|
| **H1** | ActuatorCard ignoriert `esp_state` — kein Offline-Indikator, obwohl SensorCard ihn hat | Klein | ActuatorCard.vue |
| **H2** | Subzone-Fallback-Text: SensorCard "Keine Subzone" vs. ActuatorCard "—" (em-dash) | Klein | ActuatorCard.vue |
| **H3** | AKTOREN (0) Sektion wird angezeigt bei reinen Sensor-Zonen | Klein | MonitorView.vue |
| **H4** | Kein "Aktiv seit..." bei mobilen Sensoren | Mittel | SensorCard.vue, ActuatorCard.vue |
| **H5** | Toggle-Handler verdrahtet aber Button ausgeblendet — toter Code in MonitorView | Klein | MonitorView.vue |
| **H6** | `formatValue()` nutzt `toFixed(1)` (Punkt) statt Locale-Format (Komma fuer DE) | Klein | SensorCard.vue |

### MITTEL — Verbesserungen

| ID | Problem | Aufwand | Betroffene Dateien |
|---|---|---|---|
| **M1** | Aktuator-Typ-Icon fehlt (immer Power-Icon, keine Pumpe/Ventil/Relay-Unterscheidung) | Klein | ActuatorCard.vue |
| **M2** | Sensor-Aktor-Verknuepfung nicht sichtbar (welcher Sensor steuert welchen Aktor?) | Mittel | MonitorView.vue, SensorCard.vue |
| **M3** | Kein Aggregations-Widget im Accordion-Header (Subzone-KPIs wie in L1) | Mittel | MonitorView.vue |
| **M4** | Variable Kartenhoehen — SensorCard und ActuatorCard haben unterschiedliche Hoehen im selben Grid | Klein | CSS-Anpassung |
| **M5** | Regeln-Sektion bei Zonen ohne Aktoren — zeigt leeren State obwohl irrelevant | Klein | MonitorView.vue |

---

## 11. Abhaengigkeiten L2 ↔ L1 ↔ Editor ↔ Hardware

### L2 ↔ L1

| Aspekt | Detail |
|---|---|
| **Shared Stores** | espStore, zoneStore, dashStore (Breadcrumb), logicStore |
| **Route-Uebergabe** | L1 Click → `router.push({ name: 'monitor-zone', params: { zoneId } })`. L2 liest `route.params.zoneId` als `selectedZoneId` |
| **Shared Components** | ViewTabBar, BaseSkeleton, ErrorState |
| **Navigation** | L2 ArrowLeft/Right + Swipe → `router.replace()` mit prevNavZoneId/nextNavZoneId |
| **Zone-Filter** | L1 hat `selectedZoneFilter`, L2 hat `selectedSubzoneFilter` — **nicht synchronisiert**, L2 setzt Subzone-Filter bei Zone-Wechsel auf null |
| **Leere Zonen** | L1 nutzt `getAllZones()` fuer leere Zonen. L2 nutzt `getZoneMonitorData()` — wenn Zone keine Devices hat, schlaegt der Guard in fetchZoneMonitorData fehl (Zone muss in espStore.devices existieren) |

### L2 ↔ Editor

| Aspekt | Detail |
|---|---|
| **Dashboard-Store** | Singleton `useDashboardStore` shared. Editor `saveLayout()` → sofort in L2 sichtbar via Reaktivitaet |
| **Widget-Rendering** | L2 nutzt `InlineDashboardPanel` (CSS-Grid), Editor nutzt `GridStack` — **unterschiedliche Render-Engines** fuer dieselben Widgets |
| **Widget-Komponenten** | Gleiche Widget-Komponenten (`SensorCardWidget`, `GaugeWidget`, etc.) via `useDashboardWidgets` |
| **Aktor-Toggle** | Editor: Toggle funktional (Dashboard-Editor = bewusster Steuerungs-Kontext). Monitor: Toggle ausgeblendet |

### L2 ↔ Hardware-View

| Aspekt | Detail |
|---|---|
| **Shared Stores** | espStore (Device-Daten, Status) |
| **Shared Components** | SensorCard (`mode='monitor'` vs. `mode='config'`), ActuatorCard (gleich) |
| **Cross-Links** | L2 SensorCard Expanded → "Konfiguration" Button → `/sensors?sensor={espId}-gpio{gpio}` (SensorsView, NICHT HardwareView direkt). Kein direkter Link zu HardwareView. |
| **Konfiguration** | Monitor = read-only. Konfiguration gehoert in HardwareView (SensorConfigPanel, ActuatorConfigPanel). Klare Trennung. |
| **Scope-/Subzone-Aenderungen** | WS-Events `device_scope_changed`, `device_context_changed` sind im espStore registriert und delegieren an zoneStore — aber L2 re-fetcht `getZoneMonitorData()` NICHT bei diesen Events |

### L2 ↔ L3 (SlideOver)

| Aspekt | Detail |
|---|---|
| **Route** | `/monitor/:zoneId/sensor/:sensorId` — Deep-Link-faehig |
| **Sensor-ID-Format** | `{espId}-gpio{gpio}` (z.B. "ESP_12AB34CD-gpio5") |
| **Datenquelle** | Sensor aus espStore.devices via ID-Lookup |
| **Multi-Sensor-Overlay** | Chip-Selektor (max 4), sekundaere Y-Achse bei unterschiedlichen Einheiten |
| **1h-Chart** | `sensorsApi.queryData` Initial-Fetch, 500 Datenpunkte |

---

## 12. Offene Fragen

| # | Frage | Auswirkung |
|---|---|---|
| **F1** | Soll die Subzone-Umstrukturierung (K1) auf Server- oder Frontend-Seite passieren? Server liefert bereits die richtige Struktur (`SubzoneGroup` mit sensors + actuators). | Architektur-Entscheidung |
| **F2** | Wie soll die WS-Reaktivitaet (K2) geloest werden? Merge von WS sensor_data in zoneMonitorData? Oder Fallback-Pfad als primaer? | Performance + Konsistenz |
| **F3** | Soll die "Regeln" Sektion bei Zonen ohne Aktoren ausgeblendet werden? Oder koennte es Sensor-only-Regeln geben (z.B. Benachrichtigungen)? | UX-Entscheidung |
| **F4** | Sollen mobile Devices eine eigene Sektion bekommen oder in den normalen Subzone-Gruppen bleiben? | UX-Entscheidung |
| **F5** | Soll die Sensor→Aktor-Verknuepfung (M2) visuell dargestellt werden? Z.B. als Verbindungslinie oder Cross-Reference-Badge? | Komplexitaet |
| **F6** | Soll `formatValue()` auf Locale-Format (Komma fuer DE) umgestellt werden? Betrifft alle SensorCards global. | Konsistenz mit formatters.ts |
| **F7** | Soll der Guard in `fetchZoneMonitorData()` (Zone muss in espStore.devices existieren) gelockert werden fuer leere Zonen? | Deep-Link + leere Zonen |

---

## Zusammenfassung

**Das Kernproblem ist bestaetigt und klar lokalisiert:** Die Trennung SENSOREN/AKTOREN in MonitorView.vue (Zeilen 1151-1200) erzeugt zwei separate Computed Properties (`zoneSensorGroup`, `zoneActuatorGroup`), die zu doppelten Subzone-Accordions fuehren. Der Server liefert bereits die richtige Struktur (`SubzoneGroup` mit `sensors[]` + `actuators[]`). Die Loesung erfordert primaer Frontend-Umbau: eine einzige `zoneDeviceGroup` computed property statt zwei, und ein Template das Sensoren und Aktoren INNERHALB jeder Subzone getrennt (aber zusammen) rendert.

Sekundaere Probleme: ActuatorCard Inkonsistenzen (kein Offline-Indikator, kein Typ-Icon), API-Snapshot nicht live, fehlende Mobile-Device-Behandlung.
