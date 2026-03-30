# FIX-ED-1 — Widget Smart Defaults: Range, Titel & Platzierung

> **Typ:** Fix-Auftrag (Code aendern)
> **Schicht:** Frontend (El Frontend — Vue 3 / TypeScript)
> **Prioritaet:** P0 (Kritisch) — beeintraechtigt jede Sensor-Wechsel-Interaktion im Dashboard
> **Geschaetzter Aufwand:** 2-3 Stunden
> **Abhaengigkeiten:** Keine — kann sofort umgesetzt werden. P8-A2 (3-Zonen-ConfigPanel) ist NICHT Voraussetzung.
> **Vorgaenger:** ANALYSE-ED-1 (reine Analyse, kein Code geaendert)

---

## Kontext: Was dieses System ist und wie es funktioniert

AutomationOne hat einen Dashboard-Editor (Route `/editor/:id`) in dem der User Sensor- und Aktor-Widgets frei auf einem 12-Spalten-Grid (GridStack.js) platzieren kann. Es gibt **10 Widget-Typen**, registriert in `useDashboardWidgets.ts` ueber 4 Registrierungspunkte:

1. `widgetComponentMap` — Vue-Komponenten-Imports
2. `WIDGET_TYPE_META` — Metadaten (Icon, Label)
3. `WIDGET_DEFAULT_CONFIGS` — Initiale Config-Werte
4. `mountWidgetToElement` — Mounting-Logik

Die 10 Typen: `line-chart`, `gauge`, `sensor-card`, `historical`, `multi-sensor`, `actuator-card`, `actuator-runtime`, `esp-health`, `alarm-list`, `statistics`.

### Sensor-Typ-Defaults (SENSOR_TYPE_CONFIG)

Die Datei `sensorDefaults.ts` enthaelt eine Map `SENSOR_TYPE_CONFIG` die fuer jeden bekannten Sensor-Typ Default-Werte liefert:

| Sensor-Typ | Label | Unit | Min | Max | Category |
|------------|-------|------|-----|-----|----------|
| `ds18b20` | Temperatur | °C | -55 | 125 | temperature |
| `sht31_temp` | Temperatur | °C | -40 | 125 | temperature |
| `sht31_humidity` | Luftfeuchte | %RH | 0 | 100 | air |
| `bme280_temp` | Temperatur | °C | -40 | 85 | temperature |
| `bme280_humidity` | Feuchte | %RH | 0 | 100 | air |
| `bme280_pressure` | Druck | hPa | 300 | 1100 | air |
| `bmp280_temp` | Temperatur | °C | -40 | 85 | temperature |
| `bmp280_pressure` | Druck | hPa | 300 | 1100 | air |
| `pH` | pH-Wert | pH | 0 | 14 | water |
| `EC` | Leitfaehigkeit | µS/cm | 0 | 5000 | water |
| `flow` | Durchfluss | L/min | 0 | 100 | water |
| `level` | Fuellstand | % | 0 | 100 | water |
| `co2` | CO2 | ppm | 400 | 5000 | air |
| `light` | Licht | lux | 0 | 100000 | light |
| `moisture` | Bodenfeuchte | % | 0 | 100 | soil |
| `vpd` | VPD | kPa | 0 | 3 | air |
| `analog` | Analog-Eingang | raw | 0 | 4095 | other |
| `digital` | Digital-Eingang | — | 0 | 1 | other |

Diese Map wird an zwei Stellen genutzt:
1. **Bei der Auto-Generierung** (`generateZoneDashboard` in `dashboard.store.ts`) — korrekt
2. **Beim Sensor-Wechsel** (`handleSensorChange` in `WidgetConfigPanel.vue`) — **fehlerhaft**

### Wie die Widget-Konfiguration fliessen SOLL

```
User waehlt Sensor im WidgetConfigPanel
    |
    v
sensorId wird geparst: "ESP_472204:0:sht31_humidity"
    → espId = "ESP_472204"
    → gpio = 0
    → sensorType = "sht31_humidity"
    |
    v
SENSOR_TYPE_CONFIG["sht31_humidity"] liefert:
    → label = "Luftfeuchte"
    → unit = "%RH"
    → min = 0
    → max = 100
    → category = "air"
    |
    v
Widget-Config wird aktualisiert:
    → sensorId = "ESP_472204:0:sht31_humidity"
    → yMin = 0        (aus SENSOR_TYPE_CONFIG)
    → yMax = 100       (aus SENSOR_TYPE_CONFIG)
    → title = "Luftfeuchte"  (aus SENSOR_TYPE_CONFIG.label)
    |
    v
Widget rendert mit korrekten Defaults
```

### Wie die Unit-Anzeige funktioniert (KORREKT — nicht anfassen)

Die **Einheit** (unit) in Widgets kommt NICHT aus der gespeicherten Widget-Config, sondern aus dem Pinia-Store (`currentSensor.unit`). Das bedeutet: Nach einem Sensor-Wechsel zeigt das Widget sofort die korrekte Einheit. Dieses Pattern ist korrekt und muss erhalten bleiben. Die Unit wird live aus dem Store geholt, nicht aus der Config persistiert.

### Wie Auto-Dashboards generiert werden (KORREKT — Kontext fuer Verstaendnis)

`generateZoneDashboard()` in `dashboard.store.ts` erstellt automatisch Zone-Dashboards. Dabei wird fuer jeden Sensor der Zone ein Widget erzeugt, basierend auf `CATEGORY_WIDGET_MAP`:

```
temperature, light → line-chart (Zeitreihen-Trend)
air, water, soil   → gauge (Echtzeit-Einzelwert)
other              → sensor-card (einfache Anzeige)
```

Die Widget-Config wird korrekt aus SENSOR_TYPE_CONFIG gefuellt:
```typescript
// dashboard.store.ts, generateZoneDashboard:
yMin: config.min,    // z.B. 0 fuer VPD
yMax: config.max,    // z.B. 3 fuer VPD
title: s.name || config?.label || s.sensorType,
sensorId: `${s.espId}:${s.gpio}:${s.sensorType}`,
```

**Das Auto-Generierungs-Pattern selbst ist korrekt.** Das Problem entsteht erst, wenn der User danach den Sensor im Widget wechselt.

---

## 5 Bugs: Was genau kaputt ist und warum

### Bug 1 (KRITISCH): Y-Range wird bei Sensor-Wechsel NICHT aktualisiert

**Datei:** `WidgetConfigPanel.vue`, Funktion `handleSensorChange()`

**IST-Verhalten:**
Ein VPD-Gauge-Widget hat `yMin=0, yMax=3` (korrekt fuer VPD, 0-3 kPa). Der User wechselt den Sensor auf `sht31_humidity` (Luftfeuchte, 0-100 %RH). Erwartet: Gauge zeigt Bogen von 0-100. Tatsaechlich: Gauge zeigt Bogen von 0-3 — der Luftfeuchte-Wert 45 %RH sprengt den Bogen oder wird auf Maximum geclippt.

**Root Cause:**
```typescript
// WidgetConfigPanel.vue, handleSensorChange — AKTUELLER CODE:
if (localConfig.value.yMin == null && localConfig.value.yMax == null) {
  updates.yMin = cfg.min
  updates.yMax = cfg.max
}
```

Die Bedingung prueft: "Sind yMin UND yMax BEIDE null?" Bei auto-generierten Widgets sind yMin und yMax IMMER gesetzt (z.B. `yMin=0, yMax=3` fuer VPD). `0 == null` ergibt `false` (der `==` Operator behandelt 0 NICHT als null). Also wird die Bedingung nie wahr und die Range wird nie aktualisiert.

**Warum das in GaugeWidget.vue hart durchschlaegt:**
```typescript
// GaugeWidget.vue:
const effectiveMin = computed(() => props.yMin ?? sensorTypeDefaults.value?.min ?? 0)
const effectiveMax = computed(() => props.yMax ?? sensorTypeDefaults.value?.max ?? 100)
```

Der `??` (Nullish Coalescing) Operator gibt den linken Wert zurueck wenn er NICHT null/undefined ist. `props.yMax = 3` (Zahl, nicht null) → `3 ?? 100` ergibt `3`. Der SENSOR_TYPE_CONFIG-Fallback (100 fuer Feuchte) wird nie erreicht. Der Gauge-Arc reicht nur bis 3 — ein Feuchte-Wert von 45 %RH ist weit ausserhalb.

**Warum das in LineChartWidget.vue weniger schlimm ist:**
LineChartWidget nutzt `suggestedMin`/`suggestedMax` (Chart.js weiche Grenzen). Wenn Daten ausserhalb liegen, expandiert Chart.js die Achse automatisch. Der Chart zeigt die Daten korrekt — aber die Y-Achsen-Skalierung ist suboptimal (z.B. -40 bis 125°C fuer Feuchte-Daten die bei 40-60 %RH liegen).

**Wichtig:** Der `??`-Operator in GaugeWidget.vue ist NICHT der Bug — er arbeitet korrekt. Der Bug liegt ausschliesslich in `handleSensorChange()`, die die Config-Werte nicht aktualisiert.

---

### Bug 2 (HOCH): Widget-Titel wird bei Sensor-Wechsel NICHT aktualisiert

**Datei:** `WidgetConfigPanel.vue`, Funktion `handleSensorChange()`

**IST-Verhalten:**
Ein Widget mit Titel "VPD (berechnet)" wird auf den Sensor `sht31_humidity` gewechselt. Erwartet: Titel zeigt "Luftfeuchte". Tatsaechlich: Titel bleibt "VPD (berechnet)". Der User sieht ein Widget mit Titel "VPD (berechnet)" das %RH-Werte anzeigt — maximale Verwirrung.

**Root Cause:**
```typescript
// WidgetConfigPanel.vue, handleSensorChange:
function handleSensorChange(sensorId: string) {
  const sType = findSensorType(sensorId)
  const updates: Record<string, any> = { sensorId }
  // ... nur Y-Range wird (bedingt) aktualisiert
  // KEIN Code der den Titel anfasst
}
```

Es gibt schlicht keinen Code-Pfad der `title` bei Sensor-Wechsel aktualisiert. Die Funktion setzt nur `sensorId` und (bedingt) `yMin`/`yMax`.

**Verschaerfend:** Der Titel wird bei der Auto-Generierung korrekt gesetzt (`s.name || config?.label || s.sensorType`), aber nach dem Wechsel nie angefasst.

---

### Bug 3 (HOCH): Leere Widgets zeigen "Sensor auswaehlen" ohne Kontext

**Datei:** Verschiedene Widget-Komponenten + `generateZoneDashboard()`

**IST-Verhalten:**
Ein Gauge-Widget mit dem Titel "Luftfeuchte" zeigt im Dashboard nur "Sensor auswaehlen" — obwohl es als Luftfeuchte-Widget erstellt wurde. Der User versteht nicht, warum ein Widget das "Luftfeuchte" heisst keinen Sensor hat.

**Root Cause:**
In `generateZoneDashboard()` wird die `sensorId` so erzeugt:
```typescript
sensorId: s.espId ? `${s.espId}:${s.gpio}:${s.sensorType}` : undefined,
```

Wenn `s.espId` leer oder `undefined` ist (z.B. weil der Sensor noch keinem ESP zugeordnet ist, oder weil die Store-Daten zum Zeitpunkt der Generierung noch nicht geladen waren), wird `sensorId = undefined` gesetzt. Das Widget erhaelt einen Titel ("Luftfeuchte" aus SENSOR_TYPE_CONFIG.label), aber keine Datenquelle.

**Fehlende Nutzer-Fuehrung:** Der Leer-Zustand "Sensor auswaehlen" gibt dem User keinen Hinweis, WELCHEN Sensor-Typ er waehlen soll. Das Widget weiss seinen Typ (es hat einen Titel), zeigt diesen Kontext aber nicht im Leer-Zustand.

---

### Bug 4 (MITTEL): Manuell hinzugefuegte Widgets stapeln sich

**Datei:** `CustomDashboardView.vue`, Funktion `addWidget()`

**IST-Verhalten:**
Wenn der User ueber den Widget-Katalog (FAB / QuickWidgetPanel) ein neues Widget hinzufuegt, wird es ohne explizite Position platziert:

```typescript
// CustomDashboardView.vue, addWidget:
const itemEl = grid.addWidget({
  w: widgetDef.w,
  h: widgetDef.h,
  minW: widgetDef.minW,
  minH: widgetDef.minH,
  id,
  // KEIN x, KEIN y
})
```

GridStack ist mit `float: true` konfiguriert. Ohne explizites `x/y` platziert GridStack das Widget in die erste freie Luecke oben-links. Wenn keine Luecke passt, werden Widgets uebereinander gestapelt (Ueberlappung). Das passiert besonders bei grossen Widgets (z.B. `multi-sensor` mit w=8, h=5).

**Wichtig:** Auto-generierte Dashboards haben dieses Problem NICHT — `generateZoneDashboard()` berechnet explizite Positionen. Nur manuell ueber den Katalog hinzugefuegte Widgets sind betroffen.

---

### Bug 5 (NIEDRIG): Unbekannter Sensor-Typ fuehrt zu keinem Fallback

**Datei:** `WidgetConfigPanel.vue`, Funktion `handleSensorChange()`

**IST-Verhalten:**
Wenn ein Sensor mit einem Typ ausgewaehlt wird der NICHT in SENSOR_TYPE_CONFIG existiert (z.B. ein neuer, noch nicht registrierter Sensor-Typ), gibt `SENSOR_TYPE_CONFIG[sType]` `undefined` zurueck. Die Y-Range wird nicht aktualisiert, der Titel nicht geaendert. Das Widget behaelt die Werte des vorherigen Sensors — die fuer den neuen Sensor-Typ voellig falsch sein koennen.

**SOLL:** Bei unbekanntem Sensor-Typ sollte die Y-Range auf `null` gesetzt werden (= Auto-Scaling durch Chart.js) und der Titel auf den rohen `sensorType`-String.

---

## SOLL-Zustand: Wie es nach dem Fix funktionieren muss

### Sensor-Wechsel-Flow (komplett)

```
User waehlt neuen Sensor im WidgetConfigPanel
    |
    v
handleSensorChange(sensorId) wird aufgerufen
    |
    v
sensorType wird aus sensorId extrahiert (via findSensorType / useSensorId)
    |
    v
SENSOR_TYPE_CONFIG[sensorType] nachschlagen
    |
    +--> Config GEFUNDEN (z.B. "sht31_humidity"):
    |       → yMin = config.min (0)
    |       → yMax = config.max (100)
    |       → Titel-Update: Nur wenn aktueller Titel ein Auto-Titel ist
    |           (= in SENSOR_TYPE_CONFIG.label-Werten enthalten, oder leer)
    |           Dann: title = config.label ("Luftfeuchte")
    |           Sonst (manueller Titel): title bleibt unveraendert
    |
    +--> Config NICHT GEFUNDEN (unbekannter Typ):
            → yMin = null (Auto-Scaling aktivieren)
            → yMax = null (Auto-Scaling aktivieren)
            → Titel-Update: title = sensorType (Roh-String als Fallback)
```

### Smart-Titel-Logik (erklaert)

Die Herausforderung: Wenn der User seinen Gauge manuell "Gewaechshaus Sued — Feuchte" genannt hat, darf ein Sensor-Wechsel diesen Titel NICHT auf "Luftfeuchte" zuruecksetzen. Das wuerde den User-Intent zerstoeren.

**Loesung — Auto-Titel-Erkennung:**
Ein Titel gilt als "automatisch generiert" wenn er einem der folgenden Muster entspricht:
1. Er ist `undefined`, `null` oder ein Leerstring
2. Er entspricht exakt einem `label`-Wert aus SENSOR_TYPE_CONFIG (z.B. "Luftfeuchte", "Temperatur", "VPD", "pH-Wert", etc.)
3. Er entspricht exakt einem bekannten `sensorType`-Key (z.B. "sht31_humidity", "ds18b20")

In diesen Faellen ist der Titel nicht vom User customized und darf ueberschrieben werden. In ALLEN anderen Faellen bleibt der Titel erhalten.

**Implementierung:** Eine Hilfsfunktion `isAutoGeneratedTitle(title)`:
```typescript
function isAutoGeneratedTitle(title: string | undefined | null): boolean {
  if (!title) return true
  const knownLabels = new Set(
    Object.values(SENSOR_TYPE_CONFIG).map(c => c.label)
  )
  const knownTypes = new Set(Object.keys(SENSOR_TYPE_CONFIG))
  return knownLabels.has(title) || knownTypes.has(title)
}
```

---

## Fix-Bloecke: Exakte Anweisungen

### Fix-Block 1: handleSensorChange — Range & Titel (KRITISCH)

**Datei:** `src/components/dashboard-widgets/WidgetConfigPanel.vue`
**Funktion:** `handleSensorChange(sensorId: string)`

**Schritt 1:** Hilfsfunktion hinzufuegen (oberhalb von `handleSensorChange`, innerhalb des `<script setup>`):

```typescript
/**
 * Prueft ob ein Widget-Titel automatisch generiert wurde
 * (und daher bei Sensor-Wechsel ueberschrieben werden darf).
 * Manuell gesetzte Titel bleiben erhalten.
 */
function isAutoGeneratedTitle(title: string | undefined | null): boolean {
  if (!title) return true
  const knownLabels = new Set(
    Object.values(SENSOR_TYPE_CONFIG).map(c => c.label)
  )
  const knownTypes = new Set(Object.keys(SENSOR_TYPE_CONFIG))
  return knownLabels.has(title) || knownTypes.has(title)
}
```

**Schritt 2:** `handleSensorChange` ersetzen. Die gesamte Funktion soll so aussehen:

```typescript
function handleSensorChange(sensorId: string) {
  const sType = findSensorType(sensorId)
  const updates: Record<string, any> = { sensorId }

  if (sType) {
    const cfg = SENSOR_TYPE_CONFIG[sType]
    if (cfg) {
      // Y-Range IMMER aus SENSOR_TYPE_CONFIG aktualisieren.
      // Der User kann danach manuell ueberschreiben — aber beim
      // Sensor-Wechsel sind die alten Werte fuer den neuen Typ sinnlos.
      updates.yMin = cfg.min
      updates.yMax = cfg.max

      // Titel nur aktualisieren wenn er auto-generiert ist.
      // Manuell gesetzte Titel (z.B. "Gewaechshaus Sued") bleiben erhalten.
      if (isAutoGeneratedTitle(localConfig.value.title)) {
        updates.title = cfg.label
      }
    } else {
      // Unbekannter Sensor-Typ: Auto-Scaling aktivieren,
      // Roh-Typ als Titel-Fallback
      updates.yMin = null
      updates.yMax = null
      if (isAutoGeneratedTitle(localConfig.value.title)) {
        updates.title = sType
      }
    }
  }

  localConfig.value = { ...localConfig.value, ...updates }
  emit('update:config', localConfig.value)
}
```

**Warum IMMER die Range aktualisieren (kein null-Check mehr):**
Die urspruengliche Idee war "manuell gesetzte Ranges nicht ueberschreiben". Aber: Wenn ein User den Sensor von VPD (0-3 kPa) auf Feuchte (0-100 %RH) wechselt, ist die alte Range 0-3 fuer Feuchte IMMER falsch — egal ob manuell oder auto-generiert. Die richtige Strategie ist: Bei Sensor-Wechsel immer die typ-korrekten Defaults setzen. Falls der User danach eine Custom-Range will, kann er sie im ConfigPanel anpassen. Das folgt dem Prinzip "Sensible Defaults, Manual Override" (Progressive Disclosure Zone 2: Y-Range ist in der Darstellungs-Zone, nicht im Kern).

**Warum der Titel NICHT immer ueberschrieben wird:**
Im Gegensatz zur Range hat der Titel keinen technischen Zusammenhang mit dem Sensor-Typ. Ein User der sein Widget "Pflanze 1 — Klima" nennt, will diesen Namen behalten — unabhaengig davon welchen Sensor er waehlt. Deshalb die `isAutoGeneratedTitle`-Pruefung: Nur Default-Titel werden ersetzt.

---

### Fix-Block 2: Leerer Widget-Zustand mit Kontext (HOCH)

**Dateien:** Alle 6 sensor-basierten Widget-Komponenten:
- `src/components/dashboard-widgets/GaugeWidget.vue`
- `src/components/dashboard-widgets/LineChartWidget.vue`
- `src/components/dashboard-widgets/HistoricalChartWidget.vue`
- `src/components/dashboard-widgets/MultiSensorWidget.vue`
- `src/components/dashboard-widgets/SensorCardWidget.vue`
- `src/components/dashboard-widgets/StatisticsWidget.vue`

**IST:** Wenn `sensorId` fehlt, zeigen die Widgets nur "Sensor auswaehlen" — ohne Hinweis welcher Sensor-Typ erwartet wird.

**SOLL:** Der Leer-Zustand soll den Widget-Titel als Kontext nutzen:
- Wenn `title` vorhanden: "Sensor auswaehlen fuer **{title}**" (z.B. "Sensor auswaehlen fuer Luftfeuchte")
- Wenn kein `title`: "Sensor auswaehlen" (wie bisher)

**ACHTUNG — Kein pauschales Template kopieren:** Jedes Widget hat seinen EIGENEN Leer-Zustand-Stil. Es gibt KEINE einheitliche `.widget-empty-state` CSS-Klasse. Beispiele:
- **GaugeWidget.vue** nutzt ein `<p>` Tag (ca. Zeile 158): `<p>Sensor auswählen:</p>`
- Andere Widgets nutzen `<div>`, `<span>` oder eigene Klassen

**Vorgehen pro Widget:**
1. Die Datei oeffnen und den bestehenden Leer-Zustand suchen (Suchbegriff: `Sensor` oder `auswählen` oder `auswaehlen`)
2. Den bestehenden Text erweitern — das umgebende HTML-Element und CSS NICHT aendern
3. Nur den Textinhalt anpassen:

```
<!-- Vorher (Beispiel GaugeWidget): -->
<p>Sensor auswählen:</p>

<!-- Nachher: -->
<p>Sensor auswählen{{ props.title ? ` für ${props.title}` : '' }}</p>
```

**Kein neues CSS noetig.** Die Aenderung ist rein im Text, das umgebende Element bleibt identisch.

**Wichtig:** Falls ein Widget keinen expliziten Leer-Zustand hat (sondern einfach nichts rendert), muss KEIN neuer Leer-Zustand eingefuehrt werden. Nur bestehende "Sensor auswaehlen"-Texte erhalten den Kontext.

---

### Fix-Block 3: Smart Widget Placement (MITTEL)

**Datei:** `src/views/CustomDashboardView.vue`, Funktion `addWidget()`

**Ziel:** Neue Widgets sollen in die erste freie Position gesetzt werden statt uebereinander zu stapeln.

**Schritt 1:** Hilfsfunktion `findFirstFreePosition` hinzufuegen. Diese kann direkt in der CustomDashboardView-Datei stehen (z.B. im `<script setup>` Block) oder als eigene Utility-Funktion:

```typescript
/**
 * Findet die erste freie Position im Grid fuer ein Widget mit gegebener Breite/Hoehe.
 * Scannt das Grid zeilenweise von oben-links nach unten-rechts.
 *
 * @param widgets - Bereits platzierte Widgets mit x, y, w, h
 * @param newW - Breite des neuen Widgets (in Grid-Einheiten, max 12)
 * @param newH - Hoehe des neuen Widgets (in Grid-Einheiten)
 * @param columns - Anzahl Spalten im Grid (Standard: 12)
 * @returns {x, y} - Position fuer das neue Widget
 */
function findFirstFreePosition(
  widgets: Array<{ x: number; y: number; w: number; h: number }>,
  newW: number,
  newH: number,
  columns: number = 12
): { x: number; y: number } {
  // Maximale Reihe bestimmen (um den Scan-Bereich zu begrenzen)
  let maxRow = 0
  for (const widget of widgets) {
    const bottom = (widget.y ?? 0) + (widget.h ?? 1)
    if (bottom > maxRow) maxRow = bottom
  }
  // Etwas Puffer nach unten fuer die Suche
  maxRow += newH + 2

  // Belegungsmatrix erstellen
  const occupied = new Set<string>()
  for (const widget of widgets) {
    const wx = widget.x ?? 0
    const wy = widget.y ?? 0
    const ww = widget.w ?? 1
    const wh = widget.h ?? 1
    for (let row = wy; row < wy + wh; row++) {
      for (let col = wx; col < wx + ww; col++) {
        occupied.add(`${col},${row}`)
      }
    }
  }

  // Zeilenweise nach freier Position suchen
  for (let row = 0; row < maxRow; row++) {
    for (let col = 0; col <= columns - newW; col++) {
      let fits = true
      for (let r = row; r < row + newH && fits; r++) {
        for (let c = col; c < col + newW && fits; c++) {
          if (occupied.has(`${c},${r}`)) {
            fits = false
          }
        }
      }
      if (fits) {
        return { x: col, y: row }
      }
    }
  }

  // Fallback: unterhalb aller Widgets, links ausgerichtet
  return { x: 0, y: maxRow }
}
```

**Schritt 2:** In `addWidget()` die Position berechnen und setzen:

```typescript
function addWidget(type: string) {
  // ... bestehende Logik fuer widgetDef, id, config ...

  // Aktuelle Widgets aus dem Layout holen
  const currentWidgets = (dashStore.activeLayout?.widgets ?? []).map(w => ({
    x: w.x ?? 0,
    y: w.y ?? 0,
    w: w.w ?? 1,
    h: w.h ?? 1,
  }))

  const pos = findFirstFreePosition(currentWidgets, widgetDef.w, widgetDef.h)

  const itemEl = grid.addWidget({
    x: pos.x,       // NEU: explizite X-Position
    y: pos.y,       // NEU: explizite Y-Position
    w: widgetDef.w,
    h: widgetDef.h,
    minW: widgetDef.minW,
    minH: widgetDef.minH,
    id,
  })

  // ... Rest der Funktion bleibt unveraendert ...
}
```

**Warum NICHT `float: false`:** GridStack mit `float: false` komprimiert alle Widgets nach oben. Das zerstoert intentionale Layout-Luecken. Wenn ein User bewusst ein Widget in der Mitte platziert hat (z.B. einen Gauge zwischen zwei Charts fuer visuelle Gruppierung), wuerde `float: false` es nach oben ziehen. Die Smart-Placement-Loesung respektiert das bestehende Layout und fuegt neue Widgets nur in echte Luecken ein.

**Gilt NUR fuer den Widget-Katalog (manuelles Hinzufuegen).** Die Auto-Generierung (`generateZoneDashboard`) berechnet bereits eigene Positionen und ist NICHT betroffen.

---

### Fix-Block 4: dashboard.store.ts addWidget — Smart Placement (MITTEL)

**Datei:** `src/shared/stores/dashboard.store.ts`, Action `addWidget()` (ca. Zeile 1050)

**Wichtig — Zwei unabhaengige Code-Pfade:**
Fix-Block 3 (CustomDashboardView) und Fix-Block 4 (dashboard.store.ts) sind **komplett unabhaengige Code-Pfade**. CustomDashboardView.addWidget() nutzt die GridStack-API direkt (DOM-basiert). dashStore.addWidget() schreibt in das Store-Array und wird vom AddWidgetDialog aufgerufen. Beide muessen separat gefixt werden.

**IST-Zustand des echten addWidget (ca. 8 Zeilen):**
Die bestehende Funktion hat diese Signatur und dieses Pattern:
```typescript
// dashboard.store.ts, addWidget — AKTUELLER CODE (vereinfacht):
function addWidget(layoutId: string, config: Omit<DashboardWidget, 'id'>) {
  const layout = layouts.value.find(l => l.id === layoutId)
  if (!layout) return

  const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const widget = { id, ...config }
  const updatedWidgets = [...(layout.widgets ?? []), widget]
  saveLayout(layoutId, updatedWidgets)
}
```

Kritische Details zum bestehenden Code:
- **Parameter-Typ:** `Omit<DashboardWidget, 'id'>` (NICHT `Partial<WidgetConfig>`)
- **ID-Generierung:** Inline (`widget-${Date.now()}-...`), KEINE `generateWidgetId()` Funktion
- **`saveLayout(layoutId, widgets)`:** Erwartet ZWEI Argumente (layoutId + komplettes Widget-Array). `saveLayout` ruft intern bereits `persistLayouts()` und `syncLayoutToServer()` auf — diese NICHT nochmal separat aufrufen
- **`WIDGET_DEFAULT_CONFIGS`** ist im Store NICHT verfuegbar (lebt in `useDashboardWidgets.ts`). Die w/h-Werte kommen bereits aus dem uebergebenen `config`-Objekt

**Caller-Kontext:** AddWidgetDialog.vue uebergibt aktuell **hardcoded `x: 0, y: 0`** (ca. Zeile 185-186). Das bedeutet: Jedes neue Widget landet oben-links, egal ob dort schon eins liegt.

**SOLL-Aenderung — Position berechnen und config.x/y ueberschreiben:**

```typescript
// dashboard.store.ts, addWidget — NACH DEM FIX:
function addWidget(layoutId: string, config: Omit<DashboardWidget, 'id'>) {
  const layout = layouts.value.find(l => l.id === layoutId)
  if (!layout) return

  const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Smart Placement: Berechnete Position ueberschreibt config.x/y
  const currentWidgets = (layout.widgets ?? []).map(w => ({
    x: w.x ?? 0, y: w.y ?? 0, w: w.w ?? 1, h: w.h ?? 1,
  }))
  const pos = findFirstFreePosition(
    currentWidgets,
    config.w ?? 6,
    config.h ?? 3
  )

  const widget = { id, ...config, x: pos.x, y: pos.y }
  //                               ^^^^^^^^^^^^^^^^^^^^^^^^
  //  WICHTIG: x/y NACH dem config-Spread, damit sie die
  //  hardcoded 0/0 aus AddWidgetDialog ueberschreiben

  const updatedWidgets = [...(layout.widgets ?? []), widget]
  saveLayout(layoutId, updatedWidgets)
}
```

**Kern-Trick:** `{ id, ...config, x: pos.x, y: pos.y }` — die berechneten x/y-Werte stehen NACH dem `...config`-Spread. Dadurch ueberschreiben sie die vom Caller uebergebenen Werte (z.B. `x: 0, y: 0` aus AddWidgetDialog). Das bestehende Pattern (ID-Generierung, saveLayout mit 2 Argumenten) bleibt exakt erhalten.

**Import:** `findFirstFreePosition` aus `src/utils/gridLayout.ts` importieren (gleiche Utility wie Fix-Block 3).

---

## Zwei unabhaengige Placement-Pfade (Fix-Block 3 vs. 4)

Der Editor hat ZWEI unabhaengige Wege, Widgets hinzuzufuegen:

| Pfad | Quelle | Mechanismus | Fix-Block |
|------|--------|------------|-----------|
| **GridStack-direkt** | CustomDashboardView.vue `addWidget()` | `grid.addWidget({...})` — DOM-basiert, GridStack API | Fix-Block 3 |
| **Store-basiert** | AddWidgetDialog.vue → `dashStore.addWidget()` | Array-Mutation + `saveLayout()` | Fix-Block 4 |

Beide Pfade muessen `findFirstFreePosition` nutzen, aber auf unterschiedliche Weise:
- Fix-Block 3: Position berechnen → an GridStack `grid.addWidget({x, y, ...})` uebergeben
- Fix-Block 4: Position berechnen → `config.x/y` ueberschreiben → in Store-Array schreiben

---

## Dateien die geaendert werden muessen

| Datei | Aenderungstyp | Betroffene Funktion |
|-------|---------------|---------------------|
| `src/components/dashboard-widgets/WidgetConfigPanel.vue` | Fix-Block 1 | `handleSensorChange()`, neue `isAutoGeneratedTitle()` |
| `src/components/dashboard-widgets/GaugeWidget.vue` | Fix-Block 2 | Leer-Zustand Text (eigenes HTML-Element, NICHT pauschal kopieren) |
| `src/components/dashboard-widgets/LineChartWidget.vue` | Fix-Block 2 | Leer-Zustand Text |
| `src/components/dashboard-widgets/HistoricalChartWidget.vue` | Fix-Block 2 | Leer-Zustand Text |
| `src/components/dashboard-widgets/MultiSensorWidget.vue` | Fix-Block 2 | Leer-Zustand Text |
| `src/components/dashboard-widgets/SensorCardWidget.vue` | Fix-Block 2 | Leer-Zustand Text |
| `src/components/dashboard-widgets/StatisticsWidget.vue` | Fix-Block 2 | Leer-Zustand Text |
| `src/views/CustomDashboardView.vue` | Fix-Block 3 | `addWidget()` — GridStack-Pfad |
| `src/shared/stores/dashboard.store.ts` | Fix-Block 4 | `addWidget()` — Store-Pfad (~8 Zeilen, minimal erweitern) |
| `src/utils/gridLayout.ts` (NEU) | Fix-Block 3+4 | `findFirstFreePosition()` — gemeinsame Utility |

---

## Dateien die NICHT geaendert werden duerfen

| Datei | Grund |
|-------|-------|
| `src/utils/sensorDefaults.ts` | SENSOR_TYPE_CONFIG ist korrekt — keine Aenderung noetig |
| `src/composables/useSensorId.ts` | sensorId-Parsing ist korrekt |
| `src/composables/useSensorOptions.ts` | Sensor-Dropdown ist korrekt |
| `src/components/charts/LiveLineChart.vue` | Y-Achse nutzt suggestedMin/Max — arbeitet korrekt |
| `src/components/charts/HistoricalChart.vue` | Hat KEINE yMin/yMax Props — vollstaendig auto-scaled |
| `src/components/charts/GaugeChart.vue` | Fallback-Logik (`??`) ist korrekt designed |
| `generateZoneDashboard()` in dashboard.store.ts | Auto-Generierung ist korrekt |
| `tokens.css` | Keine Token-Aenderungen |
| GridStack-Konfiguration (`float: true`) | Muss `true` bleiben |

---

## Akzeptanzkriterien (testbar)

### AK-1: Y-Range aktualisiert sich bei Sensor-Wechsel
1. Ein auto-generiertes VPD-Gauge oeffnen (yMin=0, yMax=3)
2. Sensor wechseln auf `sht31_humidity`
3. **Erwartet:** Gauge-Arc zeigt 0-100 (nicht 0-3)
4. Sensor wechseln auf `pH`
5. **Erwartet:** Gauge-Arc zeigt 0-14

### AK-2: Titel aktualisiert sich bei Auto-Titeln
1. Ein Widget mit Auto-Titel "VPD" oeffnen
2. Sensor wechseln auf `sht31_humidity`
3. **Erwartet:** Titel zeigt "Luftfeuchte"

### AK-3: Manueller Titel bleibt erhalten
1. Ein Widget oeffnen und Titel manuell auf "Mein Custom Gauge" setzen
2. Sensor wechseln auf einen beliebigen anderen Typ
3. **Erwartet:** Titel bleibt "Mein Custom Gauge" (NICHT ueberschrieben)

### AK-4: Unbekannter Sensor-Typ aktiviert Auto-Scaling
1. Wenn moeglich: Einen Sensor mit einem Typ waehlen der NICHT in SENSOR_TYPE_CONFIG existiert
2. **Erwartet:** Y-Range wird null/null (Chart.js Auto-Scaling), Titel zeigt rohen Typ-String
3. **Alternativ (Code-Pruefung):** Im Code verifizieren dass der `else`-Branch (kein cfg) yMin=null, yMax=null setzt

### AK-5: Leerer Widget-Zustand zeigt Kontext
1. Ein Gauge-Widget erstellen ohne Sensor auszuwaehlen, mit Titel "Luftfeuchte"
2. **Erwartet:** Widget zeigt "Sensor auswaehlen fuer Luftfeuchte" (nicht nur "Sensor auswaehlen")

### AK-6: Neue Widgets werden ohne Ueberlappung platziert
1. Ein Dashboard mit 3-4 bestehenden Widgets oeffnen
2. Ueber den FAB/Katalog ein neues Widget hinzufuegen
3. **Erwartet:** Widget erscheint in der ersten freien Luecke, NICHT uebereinander mit einem bestehenden Widget
4. Vorgang 3x wiederholen mit verschiedenen Widget-Typen
5. **Erwartet:** Kein Widget ueberlappt ein anderes

### AK-7: Auto-generierte Dashboards bleiben unveraendert
1. Eine Zone mit mehreren Sensoren haben
2. Auto-Dashboard generieren lassen
3. **Erwartet:** Layout, Positionen, Ranges und Titel sind identisch zum bisherigen Verhalten (Regression-Check)

### AK-8: Build und TypeScript-Checks bestehen
1. `vue-tsc --noEmit` laeuft ohne Fehler
2. `npm run build` laeuft ohne Fehler
3. Keine neuen TypeScript-Warnungen eingefuehrt

---

## Einschraenkungen

- **Chart.js (vue-chartjs)** bleibt Chart-Library — KEIN ECharts
- **Keine neuen npm-Pakete**
- **10 Widget-Typen** bleiben — kein neuer Typ
- **GridStack.js** `float: true` bleibt — NICHT auf `float: false` umstellen
- **tokens.css** nicht veraendern
- **Unit-Anzeige** in Widgets kommt aus dem Pinia-Store (Live-Daten) — diese Logik NICHT anfassen
- **`sensorDefaults.ts`** SENSOR_TYPE_CONFIG bleibt unveraendert — keine neuen generischen Keys ("temperature", "humidity") hinzufuegen
- **`generateZoneDashboard()`** nicht veraendern — die Auto-Generierung ist korrekt
- **GaugeChart.vue / LiveLineChart.vue / HistoricalChart.vue** (die Chart-Render-Komponenten) werden NICHT geaendert — der Bug liegt im ConfigPanel, nicht im Rendering
- Dieser Auftrag aendert NICHT die 3-Zonen-Struktur des ConfigPanels (das ist P8-A2, ein separater Auftrag)

---

## Reihenfolge der Umsetzung

1. **`src/utils/gridLayout.ts` anlegen** — `findFirstFreePosition()` als exportierte Funktion (wird von Block 3+4 gebraucht)
2. **Fix-Block 1** (handleSensorChange) — der Kern-Fix, ~15 Minuten
3. **Fix-Block 2** (Leer-Zustand) — jedes Widget einzeln oeffnen, Leer-Zustand suchen und Text anpassen, ~15 Minuten
4. **Fix-Block 3** (CustomDashboardView.addWidget → GridStack-Pfad) — `findFirstFreePosition` importieren + Position berechnen + an grid.addWidget uebergeben, ~30 Minuten
5. **Fix-Block 4** (dashboard.store.ts addWidget → Store-Pfad) — `findFirstFreePosition` importieren + Position berechnen + config.x/y ueberschreiben via Spread-Reihenfolge, ~15 Minuten
6. **Akzeptanzkriterien pruefen** (AK-1 bis AK-8) — ~30 Minuten

**Fix-Block 3 und 4 sind unabhaengig** — koennen parallel oder in beliebiger Reihenfolge umgesetzt werden. Block 1 und 2 sind ebenfalls unabhaengig voneinander.

**Gesamt:** ~2 Stunden
