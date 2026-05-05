# SI-3 EditorView (Widgets) — Phase-C-Endausbau + mode-Prop + MultiSensor

**Datum:** 2026-05-06
**Strang:** 3 von 8 — Frontend-Konsolidierung 2026
**Linear-Issue:** AUT-240
**Scope:** Widget/Editor-System — InlineDashboardPanel, WidgetShell-Kandidat, MultiSensorWidget, dashboard.store, Phase-C-Endausbau

---

## 1. mode-Prop-Analyse

### 1.1 Prop-Definition

Datei: `El Frontend/src/components/dashboard/InlineDashboardPanel.vue` (Zeilen 31–41)

```ts
mode?: 'view' | 'manage' | 'side-panel'
// Default: 'view'
```

Der vierte Wert `'inline'` existiert **nicht** in der Prop-Union. Die Component-API kennt nur die drei oben genannten Werte. Der D4-Kommentar im File-Header (Zeile 9–13) listet ebenfalls korrekt nur `view`, `manage`, `side-panel`.

### 1.2 Aktive Verwendungsstellen

| Mode-Wert | Datei | Zeile | Kontext |
|-----------|-------|-------|---------|
| `mode="view"` | `El Frontend/src/views/CustomDashboardView.vue` | 1129 | DashboardViewer — Vorschau-Panel |
| `mode="view"` | `El Frontend/src/views/MonitorView.vue` | 2127 | Monitor L1 cross-zone inline Panel |
| `mode="manage"` | `El Frontend/src/views/MonitorView.vue` | 2448 | Monitor manage-Modus Instanz 1 |
| `mode="manage"` | `El Frontend/src/views/MonitorView.vue` | 2472 | Monitor manage-Modus Instanz 2 |
| `mode="side-panel"` | `El Frontend/src/views/HardwareView.vue` | 1154 | HardwareView L2 Side-Panel |
| `mode="side-panel"` | `El Frontend/src/views/MonitorView.vue` | 2484 | Monitor Side-Panel |

**Grep-Ergebnis `mode="inline"`:** Keine Treffer im gesamten `El Frontend/`-Baum.

### 1.3 Befund

`mode="inline"` existiert weder in der Prop-Typdefinition noch als aktive Verwendungsstelle. Der String `inline` taucht ausschließlich im CSS-Klassennamen `inline-dashboard` und in der `DashboardTarget.placement`-Type (`'inline' | 'side-panel' | 'bottom-panel'`) auf — das ist ein unabhängiges Konzept auf Store-Ebene für Render-Targeting, nicht für den mode-Prop.

**Empfehlung (kein Code-Eingriff):** Kein Handlungsbedarf. Der Legacy-Befund aus dem Auftragstext war ein Fehlalarm — `mode="inline"` wurde nie eingesetzt. Die Prop-Union `'view' | 'manage' | 'side-panel'` ist vollständig und sauber. Keine Entfernung nötig.

---

## 2. Widget-Inventar-Tabelle

Grundlage: `El Frontend/src/composables/useDashboardWidgets.ts` — `widgetComponentMap` (13 Einträge), `WIDGET_TYPE_META` (13 Einträge), alle Widget-Dateien in `El Frontend/src/components/dashboard-widgets/`.

Das Header-Rendering in `InlineDashboardPanel` und im GridStack-Editor erfolgt durch `useDashboardWidgets.createWidgetElement()` (Zeile 187–257 des Composable). Wenn `showWidgetHeader = false` (gesetzt im InlineDashboardPanel), entfällt der äußere Header komplett — die Widgets selbst sind dann allein verantwortlich.

| Widget-Typ | Datei | eigener interner Header | Action-Buttons intern | Last-Update sichtbar | Legend-Platz |
|------------|-------|-------------------------|-----------------------|----------------------|--------------|
| `line-chart` | `LineChartWidget.vue` | Nein — kein interner Header-Block; Sensor-Selector als Dropdown | Sensor-Dropdown | Nein | Chart-nativ (tooltip only) |
| `gauge` | `GaugeWidget.vue` | Nein — kein eigener Header; Tile-Semantik-Labels per Tooltip | Sensor-Dropdown | Nein | Kein Legend-Bereich |
| `sensor-card` | `SensorCardWidget.vue` | Nein — zeigt Sensor-Name als Wert-Label | Sensor-Dropdown | Trend-Icon (kein Timestamp) | Kein Legend-Bereich |
| `historical` | `HistoricalChartWidget.vue` | Ja — Zeitraum-Tabs (1h/6h/24h/7d/30d) + Export-Button | Zeitraum-Tabs, Export-Button | Nein | Chart-nativ |
| `multi-sensor` | `MultiSensorWidget.vue` | Ja — Mode-Toggle (Vergleich), Chip-Leiste, Export | Mode-Toggle, Add/Remove-Chips, Export, Actuator-Add | Nein | Chip-Leiste als funktionale Legend |
| `actuator-card` | `ActuatorCardWidget.vue` | Nein — kein Header; zeigt Aktor-Name als Label | Actuator-Dropdown | Nein | Kein Legend-Bereich |
| `actuator-runtime` | `ActuatorRuntimeWidget.vue` | Ja — Zeitraum-Select (1h/6h/24h/7d) | Zeitraum-Select | Nein | Chart-nativ (Bar-Colors) |
| `esp-health` | `ESPHealthWidget.vue` | Nein — Device-Liste ohne eigenen Titel | Kein interaktives Control | Nein | Kein Legend-Bereich |
| `alarm-list` | `AlarmListWidget.vue` | Nein — nur Icon+Label in List-Items | Kein interaktives Control | Relative Zeit pro Item | Kein Legend-Bereich |
| `statistics` | `StatisticsWidget.vue` | Ja — Zeitraum-Select + optionale Badges | Zeitraum-Select | Nein | KPI-Kacheln als semantische Gliederung |
| `fertigation-pair` | `FertigationPairWidget.vue` | Ja — Zeitraum-Select, KPI-Karten | Zeitraum-Select | Nein | Chart-nativ + KPI-Farbkodierung |
| `comparison-boxplot` | `BoxplotWidget.vue` | Ja — intern: Chart-Title via Chart.js-Plugin | Kein expliziter Button | Nein | Chart.js-Legend (unten) |
| `correlation-scatter` | `CorrelationScatterWidget.vue` | Ja — `headerTitle` computed (`x vs y`), Date-Range-Select | Date-Range-Select | Nein | Chart.js-Legend (falls Regression) |

### 2.1 Inkonsistenzen

1. **Action-Button-Placement:** 7 von 13 Widgets haben interne Controls; 6 haben keine. Kein einheitliches Slot-System.
2. **Last-Update-Timestamp:** Fehlt in allen Widgets als explizites UI-Element. `alarm-list` zeigt relative Zeit pro Item — das ist semantisch verschieden von einem Widget-Update-Timestamp.
3. **Legend-Placement:** 5 Widgets nutzen Chart.js-interne Legends, 3 nutzen Chip-/Kachel-Systeme, 5 haben kein Legend-Konzept.
4. **WidgetWrapper.vue** (`El Frontend/src/components/dashboard-widgets/WidgetWrapper.vue`) definiert einen Header mit `gs-drag-handle`-Klasse — wird aber von keinem Widget referenziert. Das Komponent ist ein Dead Code-Kandidat (kein `import WidgetWrapper` im Repo außer der eigenen Datei).

---

## 3. WidgetShell.vue als Kanon-Kandidat

### 3.1 Existenz

`El Frontend/src/components/dashboard-widgets/WidgetShell.vue` existiert **nicht**. `WidgetWrapper.vue` ist die nächste Entsprechung, wird aber wie oben gezeigt von keinem Widget aktiv genutzt.

Bezug zu AUT-201: Ein `WidgetShell`-Konzept muss neu erstellt werden. Basis wäre `WidgetWrapper.vue` (bestehende Props-Signatur: `title`, `widgetId`, `showConfig`) plus folgende Erweiterungen:

- `lastUpdatedAt?: string` — rendert relative Zeit im Header
- `actions?: VNode[]` — Slot für Widget-spezifische Action-Buttons
- `legendSlot?` — optionaler Footer-Bereich für Legends außerhalb des Chart-Canvas

### 3.2 Kanon-Kandidatenanalyse

Das äußere Header-System in `useDashboardWidgets.createWidgetElement()` (DOM-API, kein Vue-Template) ist der de-facto Kanon für den GridStack-Editor. Für `InlineDashboardPanel` ist `showWidgetHeader = false` gesetzt — die Widgets übernehmen selbst. Dieses Split-Modell ist Ursprung der Inkonsistenz.

Ein kanonischer `WidgetShell.vue` müsste beide Kontexte abbilden:
- Editor-Modus: mit Drag-Handle, Config-Gear, Remove-X
- Inline-Modus: ohne Drag-Handle, mit optionalem Manage-Toolbar via `v-if="manageMode"`

---

## 4. MultiSensorWidget useSensorId-Konsolidierung

### 4.1 Manueller split(':') in Widget-Dateien

Grep-Ergebnis über `El Frontend/src/components/dashboard-widgets/`:

| Datei | Zeile | Code | Kontext |
|-------|-------|------|---------|
| `MultiSensorWidget.vue` | 373 | `const parts = actuatorId.split(':')` | `formatActuatorLabel()` — Aktor-Label für Chip |
| `MultiSensorWidget.vue` | 409 | `const parts = id.split(':')` | `fetchActuatorHistory()` — Actuator-History-API-Call |
| `ActuatorCardWidget.vue` | 56 | `const [eId, gpioStr] = localActuatorId.value.split(':')` | `currentActuator` computed |
| `ActuatorCardWidget.vue` | 63 | `localActuatorId.value?.split(':')[0]` | `espId` computed |
| `ActuatorCardWidget.vue` | 64 | `localActuatorId.value?.split(':')[1]` | `gpio` computed |

### 4.2 Kanonische Implementierung

Datei: `El Frontend/src/composables/useSensorId.ts`

- `useSensorId(ref)` — reaktiv, gibt `{ espId, gpio, sensorType, isValid }` zurück
- `parseSensorId(value)` — pure Funktion, nicht-reaktiv

`parseSensorId` unterstützt nur das Sensor-Format `espId:gpio:sensorType`. Für Aktoren ist das Format `espId:gpio` (2-Part) bzw. `espId:gpio:actuatorType` (3-Part in MultiSensorWidget). `parseSensorId` mit 2-Part: `isValid = true`, `sensorType = null` — das ist korrekt für Aktoren.

### 4.3 Diff: Manuell vs. Kanonisch

**MultiSensorWidget.vue Zeile 373 (`formatActuatorLabel`):**
```ts
// Aktuell (manuell):
const parts = actuatorId.split(':')
if (parts.length < 3) return actuatorId
const [espId, gpioStr, actType] = parts

// Kanonisch via parseSensorId:
const parsed = parseSensorId(actuatorId)  // bereits importiert (Zeile 21)
if (!parsed.isValid || parsed.gpio === null) return actuatorId
const { espId, gpio: gpioNum, sensorType: actType } = parsed
```

**MultiSensorWidget.vue Zeile 409 (`fetchActuatorHistory`):**
```ts
// Aktuell (manuell):
const parts = id.split(':')
if (parts.length < 3) return { id, entries: [] }
const [espId, gpioStr] = parts
const gpio = parseInt(gpioStr, 10)

// Kanonisch:
const parsed = parseSensorId(id)
if (!parsed.isValid || !parsed.espId || parsed.gpio === null) return { id, entries: [] }
const { espId, gpio } = parsed
```

**ActuatorCardWidget.vue Zeilen 56, 63–64:**
```ts
// Aktuell (manuell, 3 separate .split(':') Aufrufe):
const [eId, gpioStr] = localActuatorId.value.split(':')
const espId = computed(() => localActuatorId.value?.split(':')[0] || '')
const gpio = computed(() => parseInt(localActuatorId.value?.split(':')[1] || '0'))

// Kanonisch (useSensorId importieren):
const { espId, gpio, isValid } = useSensorId(localActuatorId)
// currentActuator:
const currentActuator = computed(() => {
  if (!isValid.value || !espId.value || gpio.value === null) return null
  ...
})
```

Hinweis: `parseSensorId` ist in `MultiSensorWidget.vue` bereits importiert (Zeile 21: `import { parseSensorId } from '@/composables/useSensorId'`). Die manuellen Splits auf Zeilen 373 und 409 sind also redundant gegenüber dem bereits vorhandenen Import.

### 4.4 Unit-Resolver-Fallback-Kette

Aktuell ermittelte `unit`-Quellen im Widget-Code:

| Datei | Zeile | Code | Kommentar |
|-------|-------|------|-----------|
| `MultiSensorWidget.vue` | 161 | `sensor?.unit \|\| SENSOR_TYPE_CONFIG[sensorType]?.unit \|\| ''` | Compare-Mode Fallback-Kette |
| `MultiSensorWidget.vue` | 187 | `sensor?.unit \|\| SENSOR_TYPE_CONFIG[sensorType]?.unit \|\| ''` | Manual-Mode Fallback-Kette |
| `LineChartWidget.vue` | 76 | `sensor.unit \|\| ''` | Nur Store-Unit, kein SENSOR_TYPE_CONFIG-Fallback |
| `HistoricalChartWidget.vue` | 114 | `:unit="parsedSensor.sensor.unit \|\| ''"` | Nur Store-Unit, kein SENSOR_TYPE_CONFIG-Fallback |

**Einheitliche kanonische Fallback-Kette (Empfehlung, kein Code-Eingriff):**

```
1. sensor.unit (aus espStore — Konfigurations-Unit aus DB)
2. SENSOR_TYPE_CONFIG[sensorType]?.unit (aus sensorDefaults.ts — Default-Unit per Typ)
3. '' (leerer String — kein undefined/null im Template)
```

`LineChartWidget` und `HistoricalChartWidget` fehlt Stufe 2. Wenn ein Sensor `unit = ''` aus dem Store hat (Pflichtfeld DB, aber leer befüllbar), zeigen diese Widgets kein Unit-Label, obwohl `SENSOR_TYPE_CONFIG` einen Default hätte.

---

## 5. Phase-C-Spezifikation (Konzept-Level)

### 5.1 Korrelation — Zwei-Sensor-Scatter mit Pearson/Spearman

**Bestehende Infrastruktur:**
- `CorrelationScatterWidget.vue` existiert (`El Frontend/src/components/dashboard-widgets/CorrelationScatterWidget.vue`) für MultispeQ-spezifische X-Sensor-vs-Metadaten-Korrelation (AUT-220).
- Server-Endpoint: `GET /v1/sensors/multispeq/correlation` — liefert `(x, y, plant_id)` Tuples aus `SensorData` für virtuelle MultispeQ-ESPs (Datei: `El Servador/god_kaiser_server/src/api/v1/multispeq.py` Zeile 547–).

**Was fehlt für Zwei-Sensor-Scatter (reguläre IoT-Sensoren):**
- Ein eigenständiger Widget-Typ `sensor-correlation` oder Erweiterung `correlation-scatter` um einen Modus `sensor_vs_sensor` (2 echte Sensor-IDs statt x_sensor_type + y_metadata_key).
- Server-Touchpoint: Kein dedizierter Endpoint für Sensor-vs-Sensor-Korrelation existiert. Benötigt würde ein `GET /v1/sensors/correlation?sensor_a=espId:gpio:type&sensor_b=espId:gpio:type&date_range=7d` — liefert aligned time-series Punkte `{a, b, timestamp}`. Alternativ: Client-seitige Ausrichtung zweier parallel gezogener Zeitreihen aus dem bestehenden historischen Endpoint.
- Pearson/Spearman: Client-seitige Berechnung ausreichend für Datenmenge bis ~10k Punkte. Keine Server-Abhängigkeit erforderlich — nur das Alignment muss server-seitig oder über den bestehenden `/v1/sensors/{esp_id}/{gpio}/history`-Endpoint erfolgen.
- **Blocker:** Kein aligned-Daten-Endpoint für zwei beliebige Sensoren. Der bestehende History-Endpoint gibt pro Sensor separate Zeitreihen — Client muss timestamp-alignen (nearest-neighbor oder bucket-snap).

### 5.2 Heatmap (chartjs-chart-matrix)

**Bestehende Infrastruktur:**
- `@sgratzl/chartjs-chart-boxplot` ist bereits registriert (`BoxplotWidget.vue` Zeile 25). Das Package `chartjs-chart-matrix` ist noch nicht installiert.
- Kein Heatmap-Widget oder -Composable vorhanden.

**Drei Einsatzfälle:**

1. **Zeit-Heatmap** (Stundenbucket × Wochentag): zeigt Durchschnittswert eines Sensors als Farbintensität. Server-Touchpoint benötigt: `GET /v1/sensors/{esp_id}/{gpio}/stats/hourly-buckets?date_range=30d` — aggregiert `AVG(processed_value)` nach `(EXTRACT(DOW), EXTRACT(HOUR))`. Kein solcher Endpoint existiert (nur `GET /v1/sensors/{esp_id}/{gpio}/history` und `GET /v1/sensors/{esp_id}/{gpio}/stats`).

2. **Zonen-Klima-Heatmap** (Zone × Sensortyp): zeigt farblich den aktuellen Zustand. Könnte aus `zone_kpi_service.py` abgeleitet werden — der Service existiert (`El Servador/god_kaiser_server/src/services/zone_kpi_service.py`), aber ein dafür optimierter Endpoint (Matrix-Rückgabe Zone × SensorTyp) fehlt.

3. **Korrelations-Matrix** (N Sensoren untereinander): Pearson-Matrix NxN. Server-Touchpoint: kein dedizierter Endpoint. Client-seitige Berechnung realistisch für N <= 8 Sensoren und 7d-Bereich.

**Blockade:** `chartjs-chart-matrix` npm-Installation ausstehend. Kein `package.json`-Eintrag vorhanden.

### 5.3 Alert-Konfig-Widget

Abhängig von SI-7 (Alert-Center-Redesign) — noch nicht planbar, wie im Auftrag korrekt identifiziert. Kein weiteres Vorgehen.

### 5.4 LTTB Decimation (PA-03c)

**Fundstellen `slice(-MAX_DATA_POINTS)` im Chart-Code:**

| Datei | Zeile | Konstante | Wert |
|-------|-------|-----------|------|
| `El Frontend/src/components/charts/MultiSensorChart.vue` | 247 | `MAX_DATA_POINTS` | 1000 |
| `El Frontend/src/components/charts/MultiSensorChart.vue` | 726 | `MAX_DATA_POINTS` | 1000 |

Beide Stellen befinden sich in `MultiSensorChart.vue` — das ist die einzige Chart-Komponente mit explizitem Datenlimit per `slice(-MAX_DATA_POINTS)`.

**Weitere Chart-Komponenten:**
- `LiveLineChart.vue`: `MAX_POINTS = 60` in `LineChartWidget.vue` Zeile 52 — Ringpuffer, kein `slice`, aber hartes 60-Punkte-Limit über Buffer-Pop.
- `HistoricalChart.vue` (nicht direkt auffindbar per Glob — vermutlich in `El Frontend/src/components/charts/`): nutzt historische API-Daten; kein `MAX_DATA_POINTS` sichtbar in verfügbaren Reads.
- `GaugeChart.vue`, `MultiSensorChart.vue` für FertigationPairWidget: keine eigene Datenbegrenzung außerhalb von MultiSensorChart.

**Chart.js 4 `plugins.decimation` LTTB — Relevanz:**

Chart.js 4 hat `plugins.decimation` mit `algorithm: 'lttb'` als eingebautem Feature (keine Zusatzinstallation). LTTB ist relevant bei:
- `MultiSensorWidget` mit Zeitraum `24h` oder `7d`: bis 1000 Punkte pro Sensor × N Sensoren — ab N >= 3 und `7d` werden sichtbare Latenzen auf mobilen Geräten berichtet.
- `HistoricalChartWidget` mit `30d` und Raw-Resolution: potenziell > 10k Punkte, je nach Sampling-Rate.

**Empfehlung (Konzept):** In `MultiSensorChart.vue` `plugins.decimation` mit `algorithm: 'lttb'`, `threshold: 500`, `enabled: timeRangeMinutes > 360` aktivieren. Das `slice(-MAX_DATA_POINTS)` bleibt als oberes Sicherheitsnetz. Für `HistoricalChartWidget` separate Prüfung erforderlich — serverseitiges Downsampling (`autoResolution`-Utility bereits vorhanden in `El Frontend/src/utils/autoResolution.ts`) ist primär, LTTB clientseitig als zweite Stufe.

---

## 6. dashboard.store.ts Actions-Befund

Datei: `El Frontend/src/shared/stores/dashboard.store.ts`

### 6.1 addWidget (Zeilen 1583–1604)

```ts
function addWidget(layoutId: string, config: Omit<DashboardWidget, 'id'>): DashboardWidget | null
```

- Fehler-Handling: Gibt `null` zurück wenn `layoutId` nicht gefunden — kein `throw`, kein Log. Konsumenten müssen `null` prüfen.
- `findFirstFreePosition` wird aufgerufen — keine Fehlerbehandlung wenn Grid vollständig belegt (Funktion aus `gridLayout.ts` — Verhalten bei vollem Grid unbekannt aus diesem Kontext).
- Kein Toast/Notification bei Fehler — stille `null`-Rückgabe.

### 6.2 removeWidget (Zeilen 1607–1611)

```ts
function removeWidget(layoutId: string, widgetId: string): void
```

- Kein Rückgabewert, kein Log wenn `layoutId` nicht existiert — `filter()` auf nicht-existentem Layout gibt leeres Array, `saveLayout` wird trotzdem mit leerem Array aufgerufen.
- Fehlerfall: Wenn `layoutId` nicht existiert, schreibt `saveLayout` ein leeres Widget-Array — das ist destruktiv ohne Guard. Der bestehende Code prüft `layout` zuerst (`const layout = layouts.value.find(...)`) und returned ohne Aktion wenn nicht gefunden — korrekt. Befund revidiert: der Guard ist vorhanden.

### 6.3 updateWidgetConfig (Zeilen 1614–1620)

```ts
function updateWidgetConfig(layoutId: string, widgetId: string, newConfig: Partial<DashboardWidget['config']>): void
```

- Gleiches Guard-Muster wie `removeWidget` — korrekt.
- Kein Log wenn `widgetId` nicht im Layout existiert — `map()` gibt unverändertes Array zurück, kein Fehler.
- `saveLayout` ruft intern `applyLayoutPatch` auf, welches `syncLayoutToServer` triggert — auch bei No-Op (Widget nicht gefunden). Potenzielle unnötige Server-Syncs bei ungültigem `widgetId`.

### 6.4 bulkDeleteLayouts (Zeilen 1159–1181)

```ts
function bulkDeleteLayouts(layoutIds: string[]): number
```

- Iteriert über `layoutIds`, prüft pro ID ob Layout existiert — korrekt.
- `shouldDeleteOnServer()` prüft: `!serverId` → false, `status === 'local_only'` → false, `stale_server_id === serverId` → false. Logik korrekt.
- Absicherung: Nach Deletion wird `activeLayoutId` auf `layouts.value[0]?.id ?? null` gesetzt — korrekt.
- Kein `persistLayouts()`-Aufruf pro Iteration, nur einmal am Ende — Performance korrekt.
- Kein Log welche IDs tatsächlich gelöscht wurden vs. nicht gefunden — Observability-Lücke.

### 6.5 autoGeneratedLayouts computed

`El Frontend/src/shared/stores/dashboard.store.ts` Zeile 1151:
```ts
const autoGeneratedLayouts = computed(() =>
  layouts.value.filter(l => l.autoGenerated === true)
)
```

Konsumiert in `CustomDashboardView.vue` (Zeile 809) als lokales computed mit identischer Implementierung:
```ts
const autoGeneratedLayouts = computed(() =>
  dashStore.layouts.filter(l => l.autoGenerated === true)
)
```

Das ist eine Duplizierung: Store exportiert `autoGeneratedLayouts` (Zeile 1724), View definiert es nochmals lokal mit `dashStore.layouts.filter()`. Die View-Version umgeht den Store-Export. Inkonsistenz, kein Bug.

---

## 7. Follow-up-Vorschläge

Die folgenden Punkte sind priorisiert nach Risiko/Aufwand-Verhältnis. Kein Code-Eingriff in diesem Strang — nur Dokumentation.

### Priorität Hoch

1. **FE-DEV: MultiSensorWidget split-Konsolidierung** — `formatActuatorLabel()` (Zeile 373) und `fetchActuatorHistory()` (Zeile 409) auf `parseSensorId` umstellen. `parseSensorId` ist bereits importiert. Aufwand: ~10 Zeilen, Risiko: niedrig.

2. **FE-DEV: ActuatorCardWidget useSensorId-Migration** — Zeilen 56, 63–64 durch `useSensorId(localActuatorId)` ersetzen. Aufwand: ~5 Zeilen, Risiko: niedrig.

3. **FE-DEV: Unit-Resolver-Kette vereinheitlichen** — `LineChartWidget.vue` (Zeile 76) und `HistoricalChartWidget.vue` (Zeile 114) um `|| SENSOR_TYPE_CONFIG[sensorType]?.unit || ''` erweitern. Aufwand: 2 Zeilen, Risiko: minimal.

### Priorität Mittel

4. **FE-DEV: WidgetWrapper.vue Audit** — Prüfen ob `WidgetWrapper.vue` noch von irgendwo importiert wird (Grep: kein Importeur gefunden). Wenn tatsächlich dead code: mit Bestätigung entfernen (separater Commit).

5. **FE-DEV: autoGeneratedLayouts-Duplikat in CustomDashboardView.vue** — Zeile 809–811 durch `dashStore.autoGeneratedLayouts` ersetzen. Aufwand: 1 Zeile.

6. **FE-DEV: updateWidgetConfig No-Op-Guard** — Wenn `widgetId` nicht in Layout existiert, frühzeitig returnen statt `saveLayout` + Server-Sync zu triggern. Aufwand: ~3 Zeilen.

### Priorität Niedrig / Abhängigkeiten

7. **FE-DEV + SERVER-DEV: Phase C LTTB** — `plugins.decimation` in `MultiSensorChart.vue` für Zeiträume > 6h aktivieren. Server-seitig kein Eingriff nötig (autoResolution bereits implementiert). Abhängig von Phase-C-Timing.

8. **SERVER-DEV: Stunden-Bucket-Aggregation-Endpoint** — `GET /v1/sensors/{esp_id}/{gpio}/stats/hourly-buckets` für Heatmap-Einsatzfall 1. Voraussetzung für Heatmap-Widget. PostgreSQL `percentile_cont` und `EXTRACT`-Pattern bereits in `multispeq.py` etabliert — übertragbares Pattern.

9. **META: WidgetShell.vue erstellen** — Einheitliche Kapselung für Widgets (Header-Slot, Action-Slot, Legend-Slot). Voraussetzung: AUT-201 klärt den Scope. Abhängig von SI-2-Ergebnis (Komponent-Architektur).

---

## Anhang: Datei-Referenzen

| Datei | Relevanz |
|-------|----------|
| `El Frontend/src/components/dashboard/InlineDashboardPanel.vue` | mode-Prop Definition und Render-Logik |
| `El Frontend/src/composables/useDashboardWidgets.ts` | widgetComponentMap, WIDGET_TYPE_META, WIDGET_DEFAULT_CONFIGS, Header-DOM-Generierung |
| `El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue` | split(':') Stellen 373, 409; unit-Resolver |
| `El Frontend/src/composables/useSensorId.ts` | parseSensorId, useSensorId — kanonische Implementierung |
| `El Frontend/src/shared/stores/dashboard.store.ts` | addWidget, removeWidget, updateWidgetConfig, bulkDeleteLayouts, autoGeneratedLayouts |
| `El Frontend/src/components/dashboard-widgets/WidgetWrapper.vue` | Dead-Code-Kandidat |
| `El Frontend/src/components/charts/MultiSensorChart.vue` | MAX_DATA_POINTS = 1000, slice(-MAX_DATA_POINTS) |
| `El Frontend/src/views/CustomDashboardView.vue` | autoGeneratedLayouts Duplikat (Zeile 809) |
| `El Servador/god_kaiser_server/src/api/v1/multispeq.py` | /aggregates und /correlation Endpoints — Basis für Phase-C-Korrelation |
