# VPD-Frontend-Darstellung — Vollanalyse und Fixes

> **Typ:** Analyse + Bugfix (Frontend — 3 zusammenhaengende Darstellungsprobleme)
> **Erstellt:** 2026-03-26
> **Prioritaet:** HIGH
> **Geschaetzter Aufwand:** ~2-3h (Analyse + Fixes + Verifikation)
> **Abhaengigkeit:** Backend-Auftrag (P4 Broadcast-Fix) sollte idealerweise zuerst implementiert sein
> **Betroffene Schicht:** El Frontend (Vue 3)
> **Ersetzt:** V19-F01 (Bug 2 Frontend-Teil), V19-F03 (teilweise)

---

## Ueberblick

Auch wenn der Backend alle VPD-Werte korrekt berechnet und speichert, hat das Frontend drei Darstellungsprobleme die dazu fuehren, dass VPD-Daten falsch angezeigt oder falsch aggregiert werden. Diese Probleme existieren UNABHAENGIG von den Backend-Bugs und muessen separat gefixt werden.

**Die 3 Problembereiche:**

| # | Problem | Schwere | Betroffene Stellen |
|---|---------|---------|-------------------|
| F1 | VPD landet im Humidity-Aggregations-Bucket | MEDIUM | sensorDefaults.ts, useZoneKPIs.ts, MonitorView.vue (zwei separate Aggregationspfade!) |
| F2 | SensorCardWidget zeigt VPD mit 1 Dezimalstelle statt 2 | LOW | SensorCardWidget.vue |
| F3 | Kein VPD-spezifisches Null-Wert-Handling | MEDIUM | MonitorView.vue, sensorDefaults.ts |

---

## Systemkontext: Wie VPD im Frontend dargestellt wird

### VPD-Konfiguration in sensorDefaults.ts

VPD ist in `SENSOR_TYPE_CONFIG` konfiguriert (ca. Zeile 514-524):
- `min: 0`, `max: 3`, `unit: 'kPa'`, `decimals: 2`, `category: 'air'`

Zusaetzlich existiert `VIRTUAL_SENSOR_META.vpd` (ca. Zeile 532-537) mit Formula-Referenz (Magnus-Tetens). Diese Konfiguration ist inhaltlich korrekt.

### VPD-Datenfluss im Frontend

```
WebSocket sensor_data Event (oder REST-API beim Laden)
    -> sensor.store.ts: handleSensorData()
    -> exactMatch: gpio + sensor_type
    -> raw_value wird in Store geschrieben
    -> Reaktive Updates an alle Komponenten die den Sensor nutzen:
       - SensorCard.vue (Monitor L2)
       - SensorCardWidget.vue (Dashboard)
       - GaugeWidget.vue (Dashboard)
       - HistoricalChart.vue (Zeitreihe mit VPD-Zonen-Annotationen)
       - useZoneKPIs.ts (Zone-Tile-Aggregation auf Monitor L1)
```

### Was korrekt funktioniert

- WebSocket-Empfang (exactMatch-Logik in sensor.store.ts)
- GaugeWidget (nutzt SENSOR_TYPE_CONFIG fuer min/max — korrekte Skala 0-3)
- HistoricalChart VPD-Annotationszonen (5 Baender: rot 0-0.4, gelb 0.4-0.8, gruen 0.8-1.2, gelb 1.2-1.6, rot 1.6-3.0)

---

## F1: VPD landet im Humidity-Aggregations-Bucket (MEDIUM)

### IST-Zustand

Die Funktion `getSensorAggCategory()` in `sensorDefaults.ts` (ca. Zeile 1281-1308) bestimmt, in welchen Aggregations-Bucket ein Sensor-Typ faellt. Sie prueft per String-Pattern:

```typescript
const lower = sensorType.toLowerCase()
if (lower.includes('temp')) return 'temperature'
if (lower.includes('humid')) return 'humidity'
if (lower.includes('pressure')) return 'pressure'
// ... weitere Patterns fuer co2, light, moisture, ph, ec, flow
```

VPD matcht KEINES dieser Patterns. Daher greift der Fallback-Pfad:
1. `SENSOR_TYPE_CONFIG['vpd'].category` = `'air'`
2. `categoryToAgg['air']` = `'humidity'`
3. VPD wird in den `humidity`-Bucket einsortiert

**Konsequenz:** In `useZoneKPIs.ts` werden Zone-KPI-Durchschnitte berechnet. VPD-Werte in kPa (z.B. 1.19) werden mit Luftfeuchte-Werten in Prozent (z.B. 55%) gemittelt. Das verfaelscht den angezeigten Humidity-Durchschnitt auf der Zone-Tile in Monitor L1.

**Beispiel:** Wenn eine Zone 1 Humidity-Sensor (55%) und 1 VPD-Sensor (1.19 kPa) hat, zeigt der Humidity-KPI `(55 + 1.19) / 2 = 28.1%` — voellig falsch.

### SOLL-Zustand

VPD darf NICHT in den Humidity-Bucket gemischt werden. VPD soll entweder:
- **Option A (einfach):** Eine eigene AggCategory `'vpd'` bekommen und als separate KPI-Zeile in der Zone-Tile angezeigt werden
- **Option B (minimal):** AggCategory `'other'` bekommen und aus den Hauptaggregationen ausgeschlossen werden

### Analyse-Schritte

1. `sensorDefaults.ts` oeffnen, `getSensorAggCategory()` finden (ca. Zeile 1281).
2. Verifizieren dass VPD in den Fallback faellt. (Erwartung: Ja, weil 'vpd' keinen der String-Patterns matcht)
3. `useZoneKPIs.ts` oeffnen. Pruefen wie `getSensorAggCategory()` dort verwendet wird.
4. Pruefen ob eine eigene AggCategory ohne groessere Aenderungen moeglich ist (wie werden AggCategories in der Zone-Tile-Card dargestellt?).

### Fix

**Option A (empfohlen):**

In `getSensorAggCategory()`, VOR dem Fallback-Block:
```typescript
if (lower === 'vpd') return 'vpd'
```

Dann in der Zone-Tile-Darstellung (`useZoneKPIs.ts` oder `ZoneTileCard.vue`):
- Falls `'vpd'` als AggCategory nicht unterstuetzt ist → als separate KPI-Zeile mit Einheit "kPa" anzeigen
- Falls der Code nur bekannte Categories rendert und unbekannte ignoriert → VPD wird einfach ausgeblendet (akzeptabel als Zwischenloesung)

**WICHTIG — Zweiter Aggregationspfad:**
`MonitorView.vue:getSubzoneKPIs()` (Zeile 1563) gruppiert Sensoren per `cfg?.category` — NICHT per `getSensorAggCategory()`. Da `sht31_humidity` und `vpd` BEIDE `category: 'air'` haben, werden VPD (kPa) und Humidity (%RH) auch dort im selben Bucket gemischt. Der `getSensorAggCategory()`-Fix allein reicht also NICHT. In `getSubzoneKPIs()` muss VPD entweder vor dem sum-Addieren ausgeschlossen werden, oder `getSensorAggCategory()` muss auch dort statt `cfg?.category` genutzt werden.

**Option B (minimal, falls A zu aufwaendig):**

```typescript
if (lower === 'vpd') return 'other'  // Nicht in Humidity mischen
```

---

## F2: SensorCardWidget zeigt VPD mit falscher Praezision (LOW)

### IST-Zustand

`SensorCardWidget.vue` (ca. Zeile 109) rendert den Sensorwert mit hartkodiertem `.toFixed(1)`:

```typescript
{{ (currentSensor.raw_value ?? 0).toFixed(1) }}
```

VPD ist in `SENSOR_TYPE_CONFIG['vpd'].decimals = 2` konfiguriert. Das Widget ignoriert diese Konfiguration. VPD 1.19 kPa wird als "1.2 kPa" dargestellt. Fuer VPD ist die zweite Dezimalstelle relevant — der Unterschied zwischen 1.1 und 1.2 kPa ist fuer die Pflanzengesundheit signifikant.

**Hinweis:** Dieses Problem betrifft ALLE Sensor-Typen mit `decimals != 1`. Aktuell ist VPD der einzige mit `decimals: 2`, aber zukuenftige Sensoren koennten ebenfalls betroffen sein.

### SOLL-Zustand

`SensorCardWidget.vue` soll `decimals` aus `SENSOR_TYPE_CONFIG` nutzen, mit Fallback auf 1 falls nicht konfiguriert.

### Fix

**Hinweis:** `SENSOR_TYPE_CONFIG` ist in SensorCardWidget.vue aktuell NICHT importiert und muss als neuer Import hinzugefuegt werden.

```typescript
// In SensorCardWidget.vue <script setup>:
import { SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'

const decimals = computed(() => {
  const sType = parsedSensorType.value || currentSensor.value?.sensor_type
  return SENSOR_TYPE_CONFIG[sType ?? '']?.decimals ?? 1
})

// Im Template:
// ALT: {{ (currentSensor.raw_value ?? 0).toFixed(1) }}
// NEU: {{ (currentSensor.raw_value ?? 0).toFixed(decimals) }}
```

**Zweite betroffene Stelle:** `SensorCard.vue` (Monitor L2) hat in Zeile 206 ebenfalls `toFixed(1)` hartkodiert. Muss analog gefixt werden — gleicher Import von `SENSOR_TYPE_CONFIG`, gleiche computed-Logik fuer `decimals`.

**Zusaetzlich pruefen:** Ob es weitere Stellen in anderen Widgets gibt, die `toFixed()` mit einem hartkodiertem Wert nutzen statt `SENSOR_TYPE_CONFIG.decimals`. Falls ja, alle korrigieren.

---

## F3: Kein VPD-spezifisches Null-Wert-Handling (MEDIUM)

### IST-Zustand

An zwei Stellen im Frontend werden Sensor-Null-Werte gefiltert:

**Stelle 1 — MonitorView.vue (ca. Zeile 1575, in `getSubzoneKPIs()`):**
```typescript
if (s.raw_value === 0 && (!s.quality || s.quality === 'unknown')) continue
```

**Stelle 2 — sensorDefaults.ts (ca. Zeile 1401):**
```typescript
if (val.value === 0 && val.quality === 'unknown') continue
```

Beide filtern nur Werte mit `quality='unknown'` oder fehlender quality. Der Backend-Bug (Scheduler erzeugt VPD=0, siehe Backend-Auftrag P1) sendet VPD=0 mit `quality='good'`. Dieser Wert passiert beide Filter und wird als gueltiger Messwert angezeigt.

**Physikalische Realitaet:** VPD=0.0 kPa bedeutet 100% relative Luftfeuchtigkeit — in einem normalen Anbau-Setup physikalisch unrealistisch. VPD-Werte unter 0.1 kPa sind ein starker Indikator fuer fehlerhafte Daten.

**Wichtig:** Dieses Problem wird durch den Backend-Fix P1 (Scheduler VIRTUAL-Filter) an der Quelle behoben — nach dem Backend-Fix werden keine neuen VPD=0 Werte mehr produziert. Der Frontend-Fix ist ein zusaetzlicher Schutz fuer Robustheit.

### SOLL-Zustand

Das Frontend soll VPD-Werte mit `raw_value <= 0.0` als ungueltig behandeln und nicht in Aggregationen oder Anzeigen einbeziehen — unabhaengig von der quality. Fuer andere Sensor-Typen aendert sich nichts (0 kann ein valider Wert sein, z.B. bei Temperatur).

### Analyse-Schritte

1. Beide Filter-Stellen finden und den Kontext verstehen.
2. Pruefen ob es eine zentrale Stelle gibt, an der Sensor-Werte auf Gueltigkeit geprueft werden (z.B. in einer Utility-Funktion oder einem Composable).
3. Pruefen ob `SENSOR_TYPE_CONFIG` eine `minValid`-Property hat oder ob eine sinnvoll waere.

### Fix

**Option A (gezielt, VPD-spezifisch):**

An den beiden Filter-Stellen einen zusaetzlichen VPD-Check:
```typescript
// Nach dem bestehenden Null-Filter:
if (s.sensor_type === 'vpd' && s.raw_value <= 0) continue
```

**Option B (generisch, zukunftssicher):**

In `SENSOR_TYPE_CONFIG` eine optionale `minValid`-Property einfuehren:
```typescript
vpd: {
  min: 0, max: 3, unit: 'kPa', decimals: 2, category: 'air',
  minValid: 0.01  // Werte <= minValid werden als ungueltig behandelt
}
```

Dann in den Filter-Stellen:
```typescript
const config = SENSOR_TYPE_CONFIG[s.sensor_type]
if (config?.minValid !== undefined && s.raw_value <= config.minValid) continue
```

Option A ist schneller, Option B ist wartbarer fuer zukuenftige Sensor-Typen mit aehnlichen Anforderungen. Empfehlung: Option A als sofortiger Fix, Option B als spaetere Verbesserung.

---

## Relevante Dateien

| Bereich | Datei | Pfad im auto-one Repo |
|---------|-------|----------------------|
| Sensor-Defaults + Aggregation | `sensorDefaults.ts` | `El Frontend/src/utils/sensorDefaults.ts` |
| Zone-KPI-Berechnung | `useZoneKPIs.ts` | `El Frontend/src/composables/useZoneKPIs.ts` |
| Zone-Tile-Darstellung | `ZoneTileCard.vue` | `El Frontend/src/components/monitor/ZoneTileCard.vue` |
| Dashboard Sensor-Card-Widget | `SensorCardWidget.vue` | `El Frontend/src/components/dashboard-widgets/SensorCardWidget.vue` |
| Monitor L2 Sensor-Card | `SensorCard.vue` | `El Frontend/src/components/devices/SensorCard.vue` |
| Monitor-View (Null-Filter) | `MonitorView.vue` | `El Frontend/src/views/MonitorView.vue` |
| Sensor-Store | `sensor.store.ts` | `El Frontend/src/shared/stores/sensor.store.ts` |
| Sensor-Optionen | `useSensorOptions.ts` | `El Frontend/src/composables/useSensorOptions.ts` |

---

## Was NICHT geaendert werden darf

- `SENSOR_TYPE_CONFIG['vpd']` Grundkonfiguration (min, max, unit, decimals, category) — ist korrekt.
- `VIRTUAL_SENSOR_META.vpd` — ist korrekt.
- VPD-Zonen-Annotationen in `HistoricalChart.vue` (die 5 Farbbaender) — sind korrekt.
- GaugeWidget VPD-Skala — nutzt bereits korrekt `SENSOR_TYPE_CONFIG`.
- Null-Wert-Filter fuer andere Sensor-Typen — nur VPD-spezifisches Handling hinzufuegen.
- Der generische WebSocket-Empfangspfad in `sensor.store.ts` — funktioniert korrekt.

---

## Akzeptanzkriterien

### F1 — Aggregation
- [ ] `getSensorAggCategory('vpd')` gibt NICHT `'humidity'` zurueck
- [ ] VPD-Werte werden NICHT mit Humidity-Werten (%) gemittelt
- [ ] Zone-Tile Humidity-KPI zeigt korrekten Durchschnitt (ohne VPD beigemischt)
- [ ] Falls eigene VPD-AggCategory: VPD-KPI wird in der Zone-Tile separat angezeigt

### F2 — Dezimalstellen
- [ ] SensorCardWidget zeigt VPD mit 2 Dezimalstellen (z.B. "1.19 kPa", nicht "1.2 kPa")
- [ ] Andere Sensor-Typen behalten ihre bisherige Darstellung (1 Dezimalstelle, falls nicht anders konfiguriert)
- [ ] Keine weiteren `.toFixed()`-Stellen mit hartkodiertem Wert in den Dashboard-Widgets

### F3 — Null-Wert-Handling
- [ ] VPD-Werte mit `raw_value <= 0` werden in Aggregationen und Anzeigen uebersprungen
- [ ] Nicht-VPD-Sensoren (z.B. Temperatur) mit `raw_value=0` werden weiterhin als gueltig behandelt
- [ ] Bestehende Null-Wert-Filter fuer andere Sensor-Typen funktionieren unveraendert

### Keine Regression
- [ ] `vue-tsc --noEmit` ohne Fehler
- [ ] `npm run build` ohne Fehler
- [ ] Alle bestehenden Sensor-Typen (sht31_temp, sht31_humidity, DS18B20 etc.) zeigen weiterhin korrekte Werte
- [ ] Zone-Tile-KPIs fuer Temperatur und Humidity zeigen korrekte Durchschnitte
