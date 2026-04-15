# Bericht: L2 Subzone-KPI-Zeile (`getSubzoneKPIs`) vs. `AggCategory` / `aggregateZoneSensors`

**Run-ID:** `monitor-l2-subzone-kpis-2026-04-10`  
**Datum:** 2026-04-10  
**Modus:** IST-Analyse (repo-verifiziert), **keine Produkt-Implementierung** in diesem Lauf.

## 1. Problem in einem Satz

`getSubzoneKPIs` in `MonitorView.vue` bildet **einen Mittelwert pro `SENSOR_TYPE_CONFIG.category`** — für `category: 'air'` werden **verschiedene physikalische Größen** (z. B. %RH, hPa, ppm) in **einem** Bucket gemischt und mit **einer** Einheit ausgegeben; `aggregateZoneSensors` nutzt dagegen **feinere `AggCategory`-Buckets** und trennt u. a. Luftfeuchte, Druck und CO₂.

## 2. Evidence: `getSubzoneKPIs` (Monitor L2)

Gruppierung erfolgt über `cfg?.category` (Fallback `'other'`), nicht über `getSensorAggCategory`. Pro Kategorie werden Rohwerte summiert und gemittelt; die Einheit kommt von `getSensorUnit(sensor_type)` beim **ersten** Vorkommen der Gruppe.

```1738:1765:El Frontend/src/views/MonitorView.vue
// Subzone KPI helper: representative sensor values for header
function getSubzoneKPIs(sensors: { sensor_type: string; raw_value: number | null; unit: string; quality: string }[]): string {
  const typeMap = new Map<string, { sum: number; count: number; unit: string }>()
  for (const s of sensors) {
    // VPD (kPa) must not mix with humidity (%) — both share category 'air'
    if (s.sensor_type === 'vpd') continue
    // Group by SENSOR_TYPE_CONFIG category (temperature, water, air, etc.)
    const cfg = SENSOR_TYPE_CONFIG[s.sensor_type]
    const groupKey = cfg?.category || 'other'
    if (!typeMap.has(groupKey)) {
      typeMap.set(groupKey, { sum: 0, count: 0, unit: getSensorUnit(s.sensor_type) !== 'raw' ? getSensorUnit(s.sensor_type) : (s.unit || '') })
    }
    const entry = typeMap.get(groupKey)!
    // Skip null/undefined AND uninitialized values (raw_value=0 with unknown quality)
    if (s.raw_value === null || s.raw_value === undefined) continue
    if (s.raw_value === 0 && (!s.quality || s.quality === 'unknown')) continue
    entry.sum += s.raw_value
    entry.count++
  }

  const parts: string[] = []
  for (const [, v] of typeMap) {
    if (v.count > 0) {
      const avg = v.count > 1 ? v.sum / v.count : v.sum
      parts.push(`${Number.isInteger(avg) ? avg : avg.toFixed(1)}${v.unit}`)
    }
  }
  return parts.slice(0, 3).join(' · ')
}
```

**Folge:** Alle Sensortypen mit `category: 'air'` landen in **demselben** `typeMap`-Eintrag `groupKey === 'air'`. Ein Mittel aus z. B. 50 %RH, 1013 hPa und 800 ppm ist **dimensionslos** und für den Operator irreführend; die angezeigte Einheit entspricht nur dem ersten gemeldeten Typ der Gruppe.

## 3. Evidence: `getSensorAggCategory` und `aggregateZoneSensors` (Zonen-KPI)

Hier werden Sensortypen über **Heuristiken** (`humid`, `pressure`, `co2`, …) und ggf. Config-Fallback auf **`AggCategory`** abgebildet; `vpd` wird explizit auf `'other'` gesetzt und in der Aggregation übersprungen.

```1273:1310:El Frontend/src/utils/sensorDefaults.ts
type AggCategory = 'temperature' | 'humidity' | 'pressure' | 'light' | 'co2' | 'moisture' | 'ph' | 'ec' | 'flow' | 'other'

function getSensorAggCategory(sensorType: string): AggCategory {
  const lower = sensorType.toLowerCase()
  if (lower.includes('temp') || lower === 'ds18b20') return 'temperature'
  if (lower.includes('humid')) return 'humidity'
  if (lower.includes('pressure')) return 'pressure'
  if (lower.includes('light') || lower.includes('lux')) return 'light'
  if (lower.includes('co2')) return 'co2'
  if (lower.includes('moisture') || lower.includes('soil')) return 'moisture'
  if (lower === 'ph') return 'ph'
  if (lower === 'ec') return 'ec'
  if (lower.includes('flow')) return 'flow'
  if (lower === 'vpd') return 'other' // VPD (kPa) must not mix with humidity (%)
  // ...
}
```

```1400:1407:El Frontend/src/utils/sensorDefaults.ts
        const category = getSensorAggCategory(val.type)
        if (category === 'other') continue // Skip uncategorized
```

**Abgleich:** Für typische Keys wie `sht31_humidity`, `bme280_pressure`, `co2` liefern die String-Regeln **getrennte** `AggCategory`-Werte (`humidity`, `pressure`, `co2`). Das widerspricht der **einen** gemeinsamen `'air'`-Gruppe in `getSubzoneKPIs`.

## 4. Alle `sensor_type` mit `category: 'air'` in `SENSOR_TYPE_CONFIG`

Stand `El Frontend/src/utils/sensorDefaults.ts` (nur Einträge mit `category: 'air'`):

| sensor_type | Kurzbeschreibung | typische Einheit |
|-------------|------------------|------------------|
| `sht31_humidity` | SHT31 Luftfeuchte | %RH |
| `SHT31_humidity` | Alias API/DB | %RH |
| `BME280_humidity` | BME280 Feuchte | %RH |
| `BME280_pressure` | Luftdruck | hPa |
| `bmp280_pressure` | BMP280 Druck | hPa |
| `bme280_humidity` | BME280 Feuchte | %RH |
| `bme280_pressure` | BME280 Druck | hPa |
| `co2` | CO₂ | ppm |
| `vpd` | VPD (virtuell) | kPa |

**Hinweis VPD:** In `getSubzoneKPIs` wird `vpd` **hart übersprungen** (`continue`) — konsistent mit der Intention, VPD (kPa) nicht mit %RH zu vermischen; gleichzeitig trägt `vpd` in der Config ebenfalls `category: 'air'`. Für **Zonen-Aggregation** wird VPD über `getSensorAggCategory` → `'other'` und anschließendes `continue` ebenfalls nicht in die KPI-Liste aufgenommen — fachlich nachvollziehbar, aber **anders implementiert** (explicit skip vs. `other`).

## 5. Risiko für den Operator

- **Falsche Zahl:** Mittelwert über nicht vergleichbare Größen.
- **Falsche Einheit:** Die erste Sensorzeile der Gruppe `air` bestimmt die angehängte Einheit — kann zu plausibel aussehenden, inhaltlich falschen Anzeigen führen.

## 6. Minimal-Repro (Fixture-Idee, kein Laufzeitnachweis)

In **einer Subzone** gleichzeitig: SHT (Feuchte), CO₂-Sensor, BME/BMP (Druck) — alle liefern gültige `raw_value`. Erwartung bei aktuellem Code: **ein** „air“-Segment in der KPI-Zeile, das aus %RH, ppm und hPa gemischt ist (ggf. nur erste zwei Größen sichtbar wegen `parts.slice(0, 3)` über **Kategorien**, nicht über Sensoren).

## 7. SOLL-Empfehlung (Refactor-Pfad, ohne Implementierung)

1. **Gruppierung an `getSensorAggCategory` ausrichten** (oder gemeinsame Hilfsfunktion `getSubzoneKpiGroupKey(sensor_type)` intern auf dieselbe Semantik wie `AggCategory` / String-Regeln), sodass L2-Subzone-KPIs und Zonen-KPIs **dieselbe fachliche Zerlegung** nutzen.
2. **Alternative:** Statt eines Mittelwerts pro Gruppe **max. ein repräsentativer Wert pro `AggCategory`** (z. B. Priorität wie `CATEGORY_PRIORITY`) — konsistent mit „max. 3 Teile“ in der UI.
3. **Tests:** Unit-Test für `getSubzoneKPIs` (exportiert oder über dedizierte Pure-Function extrahiert) mit gemockten Sensoren `sht31_humidity`, `co2`, `bme280_pressure` — Erwartung: **drei** getrennte Zahlen/Einheiten, kein gemeinsamer `air`-Mittelwert.

## 8. Implementierungs-Gate

Änderungen am Produktcode nur nach expliziter Freigabe (Steuerdatei / Robin). Vor größeren Refactors: Skill **`verify-plan`** gegen geplante Pfade und Tests.

## 9. Referenzen (Repo)

- `El Frontend/src/views/MonitorView.vue` — `getSubzoneKPIs`
- `El Frontend/src/utils/sensorDefaults.ts` — `SENSOR_TYPE_CONFIG`, `getSensorAggCategory`, `aggregateZoneSensors`, `CATEGORY_PRIORITY` / `CATEGORY_LABELS` / `CATEGORY_UNITS`
