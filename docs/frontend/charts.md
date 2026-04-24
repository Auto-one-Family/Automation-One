# Charts — Frontend-Dokumentation

## Übersicht

Das AutomationOne Dashboard nutzt [Chart.js](https://www.chartjs.org/) via `vue-chartjs`
für alle Datenvisualisierungen. Die Chart-Komponenten befinden sich unter
`El Frontend/src/components/charts/`.

| Komponente | Zweck |
|---|---|
| `HistoricalChart.vue` | Zeitreihen mit Threshold-Lines, Gap-Erkennung, Stats-Overlay |
| `LiveLineChart.vue` | Echtzeit-Linie (Sensor-Stream) |
| `MultiSensorChart.vue` | Mehrere Sensoren überlagert |
| `GaugeChart.vue` | Radial-Gauge für Einzelwerte |
| `StatusBarChart.vue` | Horizontale Status-Bars |

## Gap-Handling (AUT-113)

### Problemstellung

Wenn ein ESP32-Gerät offline geht (Stromausfall, Netzwerkfehler, Neustart),
entstehen Lücken in den Sensordaten. Ohne Behandlung zeichnet Chart.js eine
durchgehende Linie, die nicht-existente Daten suggeriert.

### Heuristik

Die Gap-Erkennung verwendet eine robuste Heuristik, die auch bei wenigen
Datenpunkten (sparse data) funktioniert:

```
medianIntervalMs   = Median aller Abstände zwischen aufeinanderfolgenden Punkten
resolutionMs       = Millisekunden der Server-Aggregations-Resolution (5m → 300.000)
expectedIntervalMs = max(medianIntervalMs, resolutionMs)
gapThreshold       = expectedIntervalMs × 3
```

**Sonderfall Sparse Data (< 5 Punkte):**
Bei weniger als 5 Datenpunkten ist der Median unzuverlässig. In diesem Fall
wird die Server-Resolution bevorzugt:

```
expectedIntervalMs = resolutionMs  (wenn verfügbar, sonst medianMs)
```

### Gap-Marker

Pro erkannter Lücke werden **zwei** Null-Marker eingefügt:

1. `+1ms` nach dem letzten gültigen Punkt (Linienbruch)
2. `-1ms` vor dem nächsten gültigen Punkt (Linienbruch)

Beide Marker tragen `_gap: true` zur Unterscheidung von echten Null-Werten.

### Visuelle Darstellung

| Element | Beschreibung |
|---|---|
| **Box-Annotation** | Grau/schraffiertes Overlay über den Lückenbereich |
| **Hover-Tooltip** | Zeigt Dauer und Zeitfenster der Lücke |
| **Gap-Info-Leiste** | Unter dem Chart: "X Lücken erkannt — Bereiche ohne Daten sind markiert" |
| **Sparse-Banner** | Warnung bei < 5 echten Datenpunkten im sichtbaren Fenster |

### Prop-API

```typescript
interface Props {
  // ... bestehende Props ...

  /**
   * Steuerung der Gap-Markierung:
   * - 'auto':    Automatische Erkennung + halbtransparentes Overlay (Default)
   * - 'hatched': Erkennung + diagonal-schraffiertes Canvas-Pattern
   * - 'off':     Keine Gap-Markierung
   */
  gapMarkingMode?: 'auto' | 'hatched' | 'off'
}
```

### CSS-Tokens

Die Gap-Overlay-Farben sind als Design-Tokens definiert:

```css
--color-chart-gap:        rgba(90, 90, 117, 0.10);  /* Füllfarbe */
--color-chart-gap-stroke:  rgba(90, 90, 117, 0.25);  /* Randfarbe */
```

Zugriff in JS via `tokens.chartGap` und `tokens.chartGapStroke` aus `@/utils/cssTokens`.

### Utility-Funktionen

Alle Gap-Detection-Funktionen sind testbar in `@/utils/gapDetection.ts` extrahiert:

| Funktion | Beschreibung |
|---|---|
| `resolutionToMs(resolution)` | Resolution-String → Millisekunden |
| `computeExpectedInterval(median, resolution, count)` | Erwartetes Intervall |
| `calculateMedianInterval(points)` | Median der Abstände |
| `detectGaps(points, interval, multiplier)` | Lücken finden → `GapInfo[]` |
| `insertGapMarkers(points, interval, multiplier)` | Null-Marker einfügen |
| `countRealDataPoints(points)` | Echte (nicht-gap) Punkte zählen |
| `formatGapDuration(ms)` | Dauer menschenlesbar formatieren |

### Tests

- **Unit**: `tests/unit/components/charts.test.ts` — umfangreiche Tests für alle
  Gap-Detection-Funktionen inkl. Edge Cases (sparse data, 2-Punkt-Szenario)
- **E2E**: `tests/e2e/scenarios/historical-chart-gaps.spec.ts` — Playwright-Tests
  mit gemockten API-Responses für sparse und gap-behaftete Daten

### Resolution-Mapping

| Resolution | Millisekunden | Erwartete Punkte/h |
|---|---|---|
| raw | 0 (→ Median) | variabel |
| 1m | 60.000 | 60 |
| 5m | 300.000 | 12 |
| 1h | 3.600.000 | 1 |
| 1d | 86.400.000 | 0,04 |
