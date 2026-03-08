# Phase 3 Analyse: ActuatorCard Informativ + Sparkline Aussagekraeftig

**Datum:** 2026-03-07
**Typ:** Reine Analyse — kein Code geschrieben
**Analyst:** Claude (VS Code Agent, frontend-development + server-development Skills)
**Abhaengigkeit:** Phase 0 (Mock-Daten sauber) + Phase 1 (Toggle-Guard) muessen erledigt sein

---

## Executive Summary

Die Analyse zeigt: **Sparkline ist weiter als angenommen** — der Cache (`useSparklineCache.ts`) ist bereits instanziiert, der SensorCard-Slot befuellt, und `LiveLineChart` rendert im compact-Modus. Was fehlt: Threshold-Zonen, Y-Achsen-Kontext und Trend-Berechnung.

**ActuatorCard ist minimal** (209 Zeilen) — zeigt nur Name, Ein/Aus, PWM, Not-Stopp. Fuer Phase 3 muessen Rule-Verknuepfung, Execution-History und Condition-Kurztext hinzugefuegt werden. Die Infrastruktur existiert: `logic.store` hat `executionHistory[]`, Backend hat `logic_execution_history`-Tabelle, und `generateRuleDescription()` existiert in `types/logic.ts`.

**Geschaetzter Aufwand Phase 3:**
- 3.1 ActuatorCard informativ: ~3-4h (Hauptaufwand: `getRulesForActuator()` + UI)
- 3.2 Sparkline aussagekraeftig: ~2-3h (Hauptaufwand: Trend-Berechnung + Threshold-Durchreichung)

---

## A: Logic Rule → Actuator Verknuepfung

### A1: LogicRule Interface

**Datei:** `El Frontend/src/types/logic.ts:12-28`

```typescript
interface LogicRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  conditions: LogicCondition[]           // 1+ Conditions
  logic_operator: 'AND' | 'OR'          // Kombination der Conditions
  actions: LogicAction[]                 // 1+ Actions (Union-Type)
  priority: number                       // Niedrig = hoeher priorisiert
  cooldown_seconds?: number
  max_executions_per_hour?: number
  last_triggered?: string                // ISO timestamp
  execution_count?: number
  last_execution_success?: boolean | null
  created_at: string
  updated_at: string
}
```

**Kritisch fuer Phase 3:** `actions[]` ist ein Array von `LogicAction` (Union-Type), `last_execution_success` wird vom WS `logic_execution` Event aktualisiert (logic.store.ts:445-450).

### A2: ActuatorAction Struktur

**Datei:** `El Frontend/src/types/logic.ts:85-93`

```typescript
interface ActuatorAction {
  type: 'actuator' | 'actuator_command'
  esp_id: string                         // Target ESP
  gpio: number                           // Target GPIO (0-39)
  command: 'ON' | 'OFF' | 'PWM' | 'TOGGLE'
  value?: number                         // PWM: 0.0-1.0
  duration?: number                      // Auto-off nach N Sekunden
  duration_seconds?: number              // Backend-Alias
}
```

**Referenzierung:** Aktor wird ueber `esp_id` + `gpio` identifiziert (NICHT ueber actuator_id). Konsistent ueber alle Schichten.

**Weitere Action-Typen:**
- `NotificationAction`: type='notification', channel=email/webhook/websocket
- `DelayAction`: type='delay', seconds=number
- `PluginAction`: type='plugin'|'autoops_trigger', plugin_id=string
- `DiagnosticsAction`: type='run_diagnostic', check_name?=string

### A3: getRulesForActuator

- **Existiert:** NEIN — muss implementiert werden
- **Aehnliche Funktionen:**
  - `getRulesForZone(zoneId)` (logic.store.ts:301-320): Filtert ueber ESP-IDs via `extractEspIdsFromRule()`
  - `extractEspIdsFromRule(rule)` (types/logic.ts): Sammelt ESP-IDs aus Conditions + Actions, aber KEINE GPIO-Infos
- **Erweiterbarkeit:** `extractEspIdsFromRule()` kann NICHT direkt erweitert werden (gibt Set<string> zurueck), aber das Pattern kann analog fuer GPIO-Level-Matching verwendet werden

**Vorgeschlagene Implementierung** (in logic.store.ts, ~8 Zeilen):
```typescript
function getRulesForActuator(espId: string, gpio: number): LogicRule[] {
  return rules.value
    .filter(rule =>
      rule.actions.some(action =>
        (action.type === 'actuator' || action.type === 'actuator_command') &&
        action.esp_id === espId &&
        action.gpio === gpio
      )
    )
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
}
```

### A4: Backend Logic-API Filter

**Datei:** `El Servador/god_kaiser_server/src/api/v1/logic.py:58-133`

**Vorhandene Filter auf `GET /v1/logic/rules`:**
- `enabled: Optional[bool]`
- `page: int = 1`
- `page_size: int = 20`

**Status:** KEINE Filter fuer `actuator_esp_id` oder `actuator_gpio`. Die Filterung muss **clientseitig** erfolgen — alle Rules sind bereits im `logic.store` geladen (via `fetchRules()`), daher ist eine clientseitige Filterung performant und ausreichend. Ein Backend-Filter waere nur bei >1000 Rules relevant.

**Empfehlung:** Clientseitig filtern via `getRulesForActuator()` im Store.

---

## B: Execution History

### B1: Datenbank-Schema

**Tabelle existiert:** JA — `logic_execution_history`
**Datei:** `El Servador/god_kaiser_server/src/db/models/logic.py:233-331`

| Spalte | Typ | Index | Beschreibung |
|--------|-----|-------|-------------|
| `id` | UUID | PK | Execution Record ID |
| `logic_rule_id` | UUID FK | YES | Foreign Key zu Rule (CASCADE) |
| `trigger_data` | JSON | NO | Snapshot: `{esp_id, gpio, sensor_type, value, timestamp, zone_id, subzone_id}` |
| `actions_executed` | JSON | NO | Array der ausgefuehrten Actions |
| `success` | Boolean | YES | Ausfuehrung erfolgreich? |
| `error_message` | String(500) | NO | Fehlermeldung bei Misserfolg |
| `execution_time_ms` | Integer | NO | Dauer in Millisekunden |
| `timestamp` | DateTime(tz) | YES (3x) | Ausfuehrungs-Zeitpunkt |
| `execution_metadata` | JSON | NO | Optional: retry_count, etc. |

**Indices (Time-Series-optimiert):**
```
idx_logic_rule_timestamp (logic_rule_id, timestamp)
idx_success_timestamp_logic (success, timestamp)
idx_timestamp_desc_logic (timestamp DESC)
```

### B2: Logic Engine Execution-Flow

**Datei:** `El Servador/god_kaiser_server/src/services/logic_engine.py`

**Flow:**
1. `evaluate_sensor_data()` (Zeile ~138) — Trigger nach Sensor-Daten-Speicherung
2. `_evaluate_rule()` (Zeile ~305) — Cooldown/Rate-Limit pruefen → Conditions evaluieren → Actions ausfuehren
3. `log_execution()` — Erstellt `LogicExecutionHistory` Record in DB
4. `broadcast("logic_execution", ...)` — Sendet WS-Event ans Frontend
5. Bei Exception: Rollback, error_message speichern, Metrics

### B3: WebSocket Event `logic_execution` Payload

**Server sendet** (logic_engine.py:704-721):
```python
{
    "rule_id": str(rule_id),
    "rule_name": rule_name,
    "trigger": {
        "esp_id": str,
        "gpio": int,
        "sensor_type": str,
        "value": float,
        "timestamp": float  # Unix seconds
    },
    "action": {
        "esp_id": str,
        "gpio": int,
        "command": str,
        "value": float?
    },
    "success": bool,
    "message": str,
    "timestamp": float  # Unix seconds
}
```

**Frontend verarbeitet** (logic.store.ts:403-451):
1. Parse zu `LogicExecutionEvent`
2. Add zu `recentExecutions[]` (max 20)
3. Falls `historyLoaded`: Add zu `executionHistory[]` (max 50)
4. Mark Rule als ACTIVE in `activeExecutions` Map (2s Glow)
5. Update `rule.last_triggered`, `rule.execution_count`, `rule.last_execution_success`

**Wichtig fuer Phase 3:** Das WS-Event enthaelt `action.esp_id` + `action.gpio` — damit kann direkt gefiltert werden welcher Aktor betroffen war.

### B4: Frontend-Zugriff auf letzte Execution

**REST API** (api/logic.ts:155-167):
```typescript
getExecutionHistory(params?: {
  rule_id?: string
  success?: boolean
  start_time?: string
  end_time?: string
  limit?: number  // 1-100, default 50
}): Promise<ExecutionHistoryResponse>
```

**Backend:** `GET /v1/logic/execution_history` — Default: letzte 7 Tage, max 100 Eintraege

**Store State:**
- `executionHistory: ExecutionHistoryItem[]` — REST + WS merged, dedupliziert, max 50
- `loadExecutionHistory(ruleId?)` — Fetch + Merge + Sort (logic.store.ts:356-393)

**Empfehlung fuer "Letzte Execution eines Aktors":**
```typescript
function getLastExecutionForActuator(espId: string, gpio: number): ExecutionHistoryItem | null {
  const rules = getRulesForActuator(espId, gpio)
  const ruleIds = new Set(rules.map(r => r.id))

  return executionHistory.value
    .filter(exec => ruleIds.has(exec.rule_id))
    .sort((a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime())
    [0] ?? null
}
```

Alternativ: WS-Event `logic_execution` direkt filtern via `action.esp_id === espId && action.gpio === gpio`.

---

## C: Condition-Extraktion als lesbarer Text

### C1: Condition-Interface

**Datei:** `El Frontend/src/types/logic.ts:34-77`

**Union Type `LogicCondition`:**

| Typ | Felder | Beispiel |
|-----|--------|---------|
| **SensorCondition** | type='sensor'\|'sensor_threshold', esp_id, gpio, sensor_type, operator (`>`\|`>=`\|`<`\|`<=`\|`==`\|`!=`\|`between`), value, min?, max?, subzone_id? | `temp > 28` |
| **TimeCondition** | type='time_window'\|'time', start_hour, end_hour, days_of_week? (0=Mo ISO 8601) | `06:00-20:00` |
| **HysteresisCondition** | type='hysteresis', esp_id, gpio, sensor_type?, activate_above?, deactivate_below?, activate_below?, deactivate_above? | `Ein >28, Aus <25` |
| **CompoundCondition** | type='compound', logic='AND'\|'OR', conditions[] (rekursiv) | Verschachtelt |
| **DiagnosticsCondition** | type='diagnostics_status', check_name, expected_status, operator? | `wifi == healthy` |

### C2: Relevante Felder fuer Kurztext

| Interface-Feld | Lesbarer Text | Quelle |
|----------------|--------------|--------|
| `sensor_type` | "Temperatur", "pH-Wert" | `getSensorLabel(type)` aus sensorDefaults.ts |
| `operator` | `>` → `>`, `>=` → `≥`, `between` → `↔` | `opMap` in generateRuleDescription (logic.ts:189-197) |
| `value` | "28" | Direkt aus Condition |
| Unit | "°C", "pH" | `getSensorUnit(type)` aus sensorDefaults.ts |
| `activate_above`/`deactivate_below` | "Ein >28, Aus <25" | Hysterese-Format |

### C3: Bestehende Rendering-Logik

**3 existierende Rendering-Stellen:**

1. **`generateRuleDescription(condition, action)`** — `types/logic.ts:185-207`
   ```typescript
   // Ergebnis: "temperature > 25 → AN"
   // Nutzt opMap fuer Symbole, cmd-Mapping ON→AN/OFF→AUS
   ```
   **Wiederverwendbar:** JA — aber braucht sowohl Condition ALS AUCH Action als Parameter.

2. **`RuleCardCompact.vue:52-69`** — `shortDescription` Computed:
   ```typescript
   // Findet erste SensorCondition + erste ActuatorAction
   // Format: "temperature > 25 → ON"
   // Fallback: "Zeitbasiert"
   ```

3. **`RuleCard.vue:61-77`** — `sensorBadge` Computed:
   ```typescript
   // Format: { label: "temperature", detail: "> 25" }
   ```

**Status:** Keine standalone `formatConditionShort()` Funktion. Logik ist in Komponenten dupliziert.

### C4: Condition-Action-Zuordnung

**Modell: N:M** — ALLE Conditions zusammen (via `logic_operator`) bestimmen ob ALLE Actions ausgefuehrt werden.

```
Rule {
  conditions: [C1, C2]     // Kombiniert mit AND/OR
  logic_operator: 'AND'
  actions: [A1, A2, A3]    // ALLE ausgefuehrt wenn Conditions TRUE
}
```

Es gibt KEINE 1:1-Zuordnung Condition→Action. Fuer die ActuatorCard bedeutet das: Der Kurztext zeigt die GESAMTE Condition der Rule, nicht eine Teil-Condition.

**Vorgeschlagene Funktion `formatConditionShort(rule)`** (15 Zeilen):
```typescript
function formatConditionShort(rule: LogicRule): string {
  if (!rule.conditions?.length) return 'Keine Bedingung'

  const parts = rule.conditions.map(cond => {
    if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
      const label = getSensorLabel(cond.sensor_type) || cond.sensor_type
      const unit = getSensorUnit(cond.sensor_type)
      return `${label} ${cond.operator} ${cond.value}${unit}`
    }
    if (cond.type === 'hysteresis') {
      return `Hysterese ${cond.activate_above ?? '?'}/${cond.deactivate_below ?? '?'}`
    }
    if (cond.type === 'time_window' || cond.type === 'time') {
      return `${cond.start_hour}:00–${cond.end_hour}:00`
    }
    return `[${cond.type}]`
  })

  const op = rule.logic_operator === 'OR' ? ' ODER ' : ' UND '
  return parts.join(op)
  // Ergebnis: "Temperatur > 28°C UND 06:00–20:00"
}
```

---

## D: Sparkline-Datenfluss

### D1: useSparklineCache Detail

**Datei:** `El Frontend/src/composables/useSparklineCache.ts` (164 Zeilen)

**ChartDataPoint Interface** (aus `components/charts/types`):
```typescript
interface ChartDataPoint {
  timestamp: string | Date   // ISO8601 oder Date
  value: number              // Sensor-Rohwert
  label?: string             // Optional, nicht genutzt
}
```

**Konstanten:**
- `DEFAULT_MAX_POINTS = 30`
- `DEDUP_INTERVAL_MS = 5000` (5s)
- `MAX_CONCURRENT_REQUESTS = 5` (API-Throttling)

**Watch-Logik** (Zeile 133-156):
- Deep-Watch auf `espStore.devices`
- Iteriert ueber ALLE Devices → ALLE Sensors
- Key: `${espId}-${gpio}-${sensorType}`
- Neuer Punkt nur wenn: `value_changed OR time > 5s`
- FIFO: Aeltester Punkt entfernt wenn > maxPoints

**loadInitialData()** (Zeile 46-100):
- Batching: max 5 parallele API-Calls
- Skip: Sensoren mit existierenden Daten oder loadedKeys
- API: `sensorsApi.queryData({esp_id, gpio, sensor_type, limit: maxPoints})`
- Merge: Historisch + Live-Points via `mergeAndDeduplicate()`

**mergeAndDeduplicate()** (Zeile 106-131):
- Merge + chronologisch sortieren
- Skip: gleicher Wert + gleicher Timestamp innerhalb 5s
- Cap: `.slice(-max)` — nur neueste maxPoints behalten

### D2: SensorCard Slot-Interface

**Datei:** `El Frontend/src/components/devices/SensorCard.vue:148-150`

```vue
<div v-if="$slots.sparkline" class="sensor-card__sparkline">
  <slot name="sparkline" />
</div>
```

- **Slot-Name:** `sparkline` (Named-Slot)
- **Slot-Props:** KEINE — Parent muss alles liefern
- **CSS:** Hoehe 32px, margin-bottom var(--space-1), overflow hidden

### D3: MonitorView Sparkline-Injection

**WICHTIGE KORREKTUR:** Der Sparkline-Slot wird BEREITS BEFUELLT!

**Datei:** `El Frontend/src/views/MonitorView.vue`

| Zeile | Was |
|-------|-----|
| 92 | `useSparklineCache()` instanziiert |
| 1200-1211 | Watcher auf `zoneSensorGroup` ruft `loadSparklineHistory(sensors)` auf |
| 1793-1801 | `#sparkline` Slot befuellt mit `LiveLineChart` |

```vue
<!-- Zeile 1793-1801: BEREITS IMPLEMENTIERT -->
<template #sparkline>
  <LiveLineChart
    v-if="sparklineCache.get(getSensorKey(...))?.length"
    :data="sparklineCache.get(getSensorKey(...))"
    compact
    height="32px"
    :max-data-points="30"
  />
</template>
```

**Was FEHLT im aktuellen Aufruf:**
- `:sensor-type` Prop (fuer automatische Y-Achse aus SENSOR_TYPE_CONFIG)
- `:thresholds` Prop (fuer Schwellwert-Zonen)
- `:show-thresholds` Prop (true)
- Trend-Pfeil (neues Feature, nicht in LiveLineChart)

### D4: Rendering-Optionen

**Chart-Library:** `chart.js` v4.5 + `vue-chartjs` v5.3 + `chartjs-plugin-annotation` v3.1

**Vorhandene Chart-Komponenten** (`components/charts/`):
- `LiveLineChart.vue` — **BEREITS SPARKLINE-FAEHIG** mit compact-Modus
- `HistoricalChart.vue` — Zeitreihen
- `MultiSensorChart.vue` — Multi-Value Overlay
- `GaugeChart.vue` — Radial

**LiveLineChart compact-Modus** (Datei: `LiveLineChart.vue:47-73`):
- `compact: boolean` — Versteckt Achsen, Tooltips, Grid
- `height: string` — Default '200px', Sparkline '32px'
- `sensorType: string` — Auto Y-Range aus SENSOR_TYPE_CONFIG
- `yMin/yMax: number` — Explizite Ueberschreibung
- `thresholds: ThresholdConfig` — alarmLow/High, warnLow/High
- `showThresholds: boolean` — Threshold-Zonen via `chartjs-plugin-annotation`

**Ergebnis:** KEINE neue SparklineChart-Komponente noetig! LiveLineChart mit `compact` deckt alles ab.

**Threshold-Farben** (LiveLineChart Zeilen 125-164):
- alarmLow/alarmHigh: `rgba(239, 68, 68, 0.5)` — Rot
- warnLow/warnHigh: `rgba(234, 179, 8, 0.4)` — Orange

**32px Hoehe — realistisch darstellbar:**
- Linie: JA (borderWidth 1.5)
- Threshold-Zonen: JA (halbtransparente Bereiche)
- Achsen/Labels: NEIN (hidden in compact mode)
- Trend-Pfeil: NEIN (muss ausserhalb des Charts als eigenes Element)

---

## E: Schwellwert-Quellen

### E1: SensorConfig Model

**Datei:** `El Servador/god_kaiser_server/src/db/models/sensor.py`

**Schwellwert-Felder:**

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `thresholds` | JSON (nullable) | `{min, max, warn_low, warn_high, alarm_low, alarm_high}` |
| `alert_config` | JSON (nullable) | Alert-Suppressions, Custom-Thresholds, Severity-Override |
| `calibration_data` | JSON (nullable) | Offset, Scale fuer kalibrierte Werte |

**Frontend-Zugriff:** Ueber `sensorsApi.getAlertConfig(sensorId)` oder `espStore.devices[].sensors[].thresholds`

### E2: SENSOR_TYPE_CONFIG

**Datei:** `El Frontend/src/utils/sensorDefaults.ts:80-510`

**Vollstaendiges Mapping (Min/Max fuer Y-Achse):**

| Sensor-Typ | Min | Max | Unit | Decimals | Category |
|------------|-----|-----|------|----------|----------|
| DS18B20 / ds18b20 | -55 | 125 | °C | 1 | temperature |
| pH | 0 | 14 | pH | 2 | water |
| EC | 0 | 5000 | µS/cm | 0 | water |
| sht31_temp | -40 | 125 | °C | 1 | temperature |
| sht31_humidity | 0 | 100 | %RH | 0 | air |
| bme280_temp | -40 | 85 | °C | 1 | temperature |
| bme280_humidity | 0 | 100 | %RH | 0 | air |
| bme280_pressure | 300 | 1100 | hPa | 0 | air |
| analog | 0 | 4095 | raw | 0 | other |
| digital | 0 | 1 | — | 0 | other |
| light | 0 | 100000 | lux | 0 | light |
| co2 | 400 | 5000 | ppm | 0 | air |
| moisture | 0 | 100 | % | 0 | soil |
| flow | 0 | 100 | L/min | 1 | water |

**Felder pro Typ:** `label`, `unit`, `min`, `max`, `decimals`, `icon`, `defaultValue`, `category`, `defaultIntervalSeconds?`

### E3: Thresholds aus Logic Rules

**Extraktion moeglich:** JA, aber komplex.

**Pattern:** Fuer einen Sensor (esp_id + gpio + sensor_type) koennen Thresholds aus SensorConditions extrahiert werden:
```typescript
// Alle Rules die diesen Sensor in Conditions referenzieren
const relevantRules = rules.value.filter(rule =>
  rule.conditions.some(c =>
    (c.type === 'sensor' || c.type === 'sensor_threshold') &&
    c.esp_id === espId && c.gpio === gpio
  )
)

// Threshold-Werte sammeln
const thresholds = relevantRules.flatMap(r => r.conditions)
  .filter(c => c.type === 'sensor' && c.esp_id === espId)
  .map(c => ({ operator: c.operator, value: c.value }))
// Ergebnis z.B.: [{ op: '>', value: 28 }, { op: '<', value: 10 }]
```

**Mehrfach-Rules:** JA — ein Sensor kann in 3+ Rules referenziert werden mit verschiedenen Thresholds. Priorisierung: Niedrigster `alarm_low`, hoechster `alarm_high`.

### E4: Y-Achsen-Strategie Empfehlung

**Empfehlung: Option C (Hybrid) — aber PRAGMATISCH**

Da LiveLineChart bereits `sensorType` Prop unterstuetzt und automatisch `SENSOR_TYPE_CONFIG[sensorType].min/max` als `suggestedMin/suggestedMax` nutzt, ist der einfachste Schritt:

1. **Sofort:** `sensorType` Prop an LiveLineChart im MonitorView durchreichen → Auto Y-Range
2. **Spaeter (optional):** Sensor-spezifische `thresholds` aus Alert-Config oder Logic Rules laden

**Begruendung:** SENSOR_TYPE_CONFIG liefert sinnvolle Bereiche (pH 0-14, Temp -55 bis 125). Chart.js `suggestedMin/Max` passt sich automatisch an wenn Daten ausserhalb liegen. Logic-Rule-Thresholds koennen spaeter als Enhancement hinzugefuegt werden.

---

## F: Trend-Berechnung

### F1: Bestehende Trend-Logik

**Existiert:** NEIN — keine Trend-Berechnung im Projekt.

**Gefundene Referenzen:**
- `MonitorView.vue:33` — Import von `TrendingUp`, `TrendingDown`, `Minus` (Lucide Icons) — reine UI-Icons, keine Logik
- Kein `calculateTrend()`, kein `slope`, kein `regression` im Frontend-Code

### F2: Algorithmus-Vergleich

| # | Algorithmus | Beschreibung | Pro | Contra | Fuer 30 Punkte/5s |
|---|-------------|-------------|-----|--------|-------------------|
| 1 | **Letzte-N-Differenz** | `avg(letzte_5) - avg(erste_5)` | Trivial, <1ms | Rauschempfindlich, instabil | Akzeptabel |
| 2 | **Lineare Regression** | Steigung der Ausgleichsgeraden | Robust, mathematisch korrekt, Standard | Minimal komplexer (20 Zeilen) | **EMPFOHLEN** |
| 3 | **EMA** | Exponential Moving Average | Responsive, glaettet gut | Initialwert-Problem, kein direkter Trend-Wert | Nicht ideal |

**Empfehlung: Lineare Regression (Least Squares)**
- O(n) Berechnung, <1ms fuer 30 Punkte
- Robuster gegen einzelne Ausreisser als Differenz
- Liefert direkt die Steigung als Trend-Indikator
- R²-Wert als Konfidenz (optional)

**Implementierung** (~20 Zeilen, in `sensorDefaults.ts` oder neues `trendUtils.ts`):
```typescript
type TrendDirection = 'rising' | 'stable' | 'falling'

function calculateTrend(
  points: ChartDataPoint[],
  threshold: number = 0.1
): { direction: TrendDirection; slope: number } {
  if (points.length < 5) return { direction: 'stable', slope: 0 }

  const n = points.length
  const values = points.map(p => p.value)
  const meanX = (n - 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n

  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY)
    den += (i - meanX) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const direction = slope > threshold ? 'rising' : slope < -threshold ? 'falling' : 'stable'

  return { direction, slope }
}
```

### F3: Trend-Schwellwerte

**Keine TREND_THRESHOLD Konstante im Code gefunden.** Muss definiert werden.

**Empfehlung: Sensor-typ-abhaengig** — weil die Bedeutung von "Aenderung" stark variiert:

| Sensor-Typ | Trend-Schwelle | Begruendung |
|------------|----------------|-------------|
| Temperatur (°C) | ±0.2 pro Punkt | 0.5°C/2.5min ist signifikant |
| pH | ±0.05 pro Punkt | pH ist logarithmisch, 0.1 ist viel |
| Luftfeuchtigkeit (%RH) | ±0.5 pro Punkt | 1% Aenderung ist normal |
| EC (µS/cm) | ±2.0 pro Punkt | EC schwankt staerker |
| Default | ±0.1 pro Punkt | Konservativer Fallback |

**Implementierung als SENSOR_TYPE_CONFIG-Erweiterung:**
```typescript
// Neues optionales Feld in SensorTypeConfig
trendThreshold?: number  // Slope-Schwelle fuer "rising"/"falling"
```

### F4: Trend-Bewertung

**Empfehlung: Nur `trendDirection` — KEIN `trendSentiment`**

**Begruendung:**
- Trend-Pfeil neutral kodiert (kein rot/gruen auf dem Pfeil selbst)
- Die Bewertung ob "gut" oder "schlecht" ergibt sich aus der Schwellwert-Zone:
  - Wert im gruenen Bereich + steigend → kein Alarm
  - Wert im roten Bereich + steigend → Alarm (kommt aus der Sparkline-Farbe)
- Separates `trendSentiment` wuerde eine Bewertungslogik erfordern die sensor-typ-abhaengig ist (steigende Temperatur = schlecht, steigender pH = unklar) — zu komplex fuer Phase 3

**UI-Rendering:**
```
[TrendingUp ↗] | [Minus →] | [TrendingDown ↘]
Farbe: var(--color-text-secondary) — immer neutral
```

Der Kontext kommt aus der Sparkline-Schwellwert-Zone im Hintergrund.

---

## G: Implementierungsplan Phase 3

### 3.1: ActuatorCard Informativ (~3-4h)

| # | Schritt | Datei(en) | Aufwand | Abhaengigkeit |
|---|---------|-----------|---------|---------------|
| 3.1.1 | `getRulesForActuator(espId, gpio)` im Logic Store | `shared/stores/logic.store.ts` | 30min | — |
| 3.1.2 | `getLastExecutionForActuator(espId, gpio)` im Logic Store | `shared/stores/logic.store.ts` | 30min | 3.1.1 |
| 3.1.3 | `formatConditionShort(rule)` als exportierte Utility | `types/logic.ts` (neben `generateRuleDescription`) | 30min | — |
| 3.1.4 | ActuatorCard erweitern: Props + Template | `components/devices/ActuatorCard.vue` | 1.5h | 3.1.1, 3.1.2, 3.1.3 |
| 3.1.5 | MonitorView: Rules + History an ActuatorCard durchreichen | `views/MonitorView.vue` | 1h | 3.1.4 |

**3.1.4 Details — ActuatorCard Erweiterungen im monitor-mode:**
- Neuer Bereich `actuator-card__rules` unter Body
- Pro verknuepfte Rule: Name + Status-Dot + Condition-Kurztext
- Max 2 Rules anzeigen, bei >2: "+N weitere"
- Letzte Execution: "Zuletzt: vor 5 Min. (Temp > 28°C)" mit `formatRelativeTime()`
- Active-Glow via `logicStore.activeExecutions.has(ruleId)`

**3.1.5 Details — MonitorView Durchreichung:**
- `logicStore.getRulesForActuator(actuator.esp_id, actuator.gpio)` als Computed oder inline
- `logicStore.executionHistory` muss geladen sein (`loadExecutionHistory()` in onMounted)
- Neue Props auf ActuatorCard: `linkedRules?: LogicRule[]`, `lastExecution?: ExecutionHistoryItem`

### 3.2: Sparkline Aussagekraeftig (~2-3h)

| # | Schritt | Datei(en) | Aufwand | Abhaengigkeit |
|---|---------|-----------|---------|---------------|
| 3.2.1 | `sensorType` Prop an LiveLineChart im Sparkline-Slot | `views/MonitorView.vue:1794` | 15min | — |
| 3.2.2 | Thresholds aus SENSOR_TYPE_CONFIG als Fallback laden | `views/MonitorView.vue` | 30min | 3.2.1 |
| 3.2.3 | `calculateTrend()` + `TREND_THRESHOLDS` implementieren | `utils/sensorDefaults.ts` oder neues `utils/trendUtils.ts` | 45min | — |
| 3.2.4 | Trend-Pfeil in SensorCard integrieren | `components/devices/SensorCard.vue` | 45min | 3.2.3 |
| 3.2.5 | Trend-Daten im MonitorView berechnen und durchreichen | `views/MonitorView.vue` | 30min | 3.2.3, 3.2.4 |

**3.2.1 Details — sensorType Prop:**
```vue
<!-- VORHER (Zeile 1794): -->
<LiveLineChart :data="..." compact height="32px" :max-data-points="30" />

<!-- NACHHER: -->
<LiveLineChart :data="..." compact height="32px" :max-data-points="30"
  :sensor-type="sensor.sensor_type"
  :show-thresholds="true"
/>
```

**3.2.2 Details — Thresholds:**
- `SENSOR_TYPE_CONFIG` hat `min`/`max` pro Typ → als `warnLow`/`warnHigh` nutzen (konservativer Bereich)
- Spaeter: Per-Sensor Alert-Config ueber `sensorsApi.getAlertConfig()` (optional, Phase 7)
- Sofort: Default-Thresholds aus Config = 10% vom Rand (wie WidgetConfigPanel Pattern)

**3.2.4 Details — Trend-Pfeil:**
- Neuer optionaler Prop auf SensorCard: `trend?: TrendDirection`
- Neben dem Wert: `<TrendingUp />`, `<Minus />`, `<TrendingDown />` — neutral gefaerbt
- CSS: `sensor-card__trend` mit `var(--color-text-muted)`, 14px Icon

**Reihenfolge (abhaengigkeitsoptimiert):**
```
3.2.1 (sensorType Prop)           → sofort
3.2.3 (calculateTrend)            → parallel zu 3.2.1
3.2.2 (Thresholds laden)          → nach 3.2.1
3.2.4 (Trend-Pfeil SensorCard)    → nach 3.2.3
3.2.5 (Trend-Daten MonitorView)   → nach 3.2.3 + 3.2.4
```

---

## H: Offene Entscheidungen

### H1: Threshold-Quelle fuer Sparkline (ENTSCHEIDUNG NOETIG)

**Option A:** `SENSOR_TYPE_CONFIG.min/max` als einzige Quelle (einfach, ~15min)
- Pro: Sofort verfuegbar, keine API-Calls
- Contra: Nicht sensor-spezifisch (alle pH-Sensoren gleich)

**Option B:** Per-Sensor Alert-Config via `sensorsApi.getAlertConfig()` (praeziser, ~1h extra)
- Pro: Individuelle Schwellwerte pro Sensor
- Contra: N API-Calls pro Zone-Load (1 pro Sensor)

**Option C:** Logic-Rule-Thresholds extrahieren (komplex, ~2h extra)
- Pro: Zeigt genau die Schwellwerte die Regeln triggern
- Contra: Mehrfach-Rules, Priorisierung unklar

**Empfehlung:** Option A fuer Phase 3, Option B als Enhancement in Phase 7.

### H2: Trend-Pfeil Position (ENTSCHEIDUNG NOETIG)

**Option A:** Neben dem Sensorwert in der SensorCard (kompakt)
**Option B:** Rechts neben der Sparkline (visuell verknuepft)
**Option C:** Im Sparkline-Chart als Overlay (Chart.js Annotation)

**Empfehlung:** Option A — der Trend bezieht sich auf den Wert, nicht auf die Sparkline.

### H3: ActuatorCard — Wie viele Rules anzeigen?

**Option A:** Max 2 Rules inline, "+N weitere" Link
**Option B:** Max 1 Rule inline, "N Regeln" Badge mit Tooltip
**Option C:** Alle Rules in collapsible Section

**Empfehlung:** Option A — 2 Rules passen in die Card, der Rest ist ein Klick entfernt.

### H4: `formatConditionShort` — Mit oder ohne Einheiten?

**Option A:** `"Temperatur > 28°C"` (mit Einheit)
**Option B:** `"Temp > 28"` (gekuerzt, ohne Einheit)

**Empfehlung:** Option A — der Kontext ist wichtig fuer Verstaendnis (Situational Awareness Level 2).

### H5: Execution-History — Wo laden?

**Option A:** `loadExecutionHistory()` in MonitorView onMounted (pauschal)
**Option B:** Lazy-Load nur wenn ActuatorCard mit Rules sichtbar wird
**Option C:** Nur WS-Events nutzen (keine REST-Historie)

**Empfehlung:** Option A — die History ist global (max 50 Eintraege), einmaliger Load.

### H6: `calculateTrend()` — Wo platzieren?

**Option A:** In `utils/sensorDefaults.ts` (nahe bei SENSOR_TYPE_CONFIG)
**Option B:** Neues `utils/trendUtils.ts`
**Option C:** In `useSparklineCache.ts` als Cache-Feature

**Empfehlung:** Option B — eigenstaendige Concern, importierbar von ueberall.

---

## Akzeptanzkriterien-Check

- [x] Block A: LogicRule Interface vollstaendig (types/logic.ts:12-28), ActuatorAction (esp_id + gpio), getRulesForActuator Pseudo-Code
- [x] Block B: Execution History Tabelle existiert (logic.py:233-331), WS-Event Payload dokumentiert, getLastExecutionForActuator Empfehlung
- [x] Block C: 5 Condition-Typen dokumentiert, formatConditionShort Pseudo-Code (15 Zeilen)
- [x] Block D: Sparkline bereits teilweise implementiert (Korrektur!), LiveLineChart compact reicht, keine neue Komponente noetig
- [x] Block E: 3 Schwellwert-Quellen kartiert (SensorConfig, SENSOR_TYPE_CONFIG, Logic Rules), Y-Achsen-Strategie Hybrid empfohlen
- [x] Block F: Lineare Regression empfohlen, sensor-typ-spezifische Schwellwerte vorgeschlagen, Trend neutral ohne Sentiment
- [x] Abschnitt G: Implementierungsplan mit 10 konkreten Schritten, Dateien, Aufwand, Reihenfolge
- [x] Abschnitt H: 6 offene Entscheidungen mit Optionen und Empfehlungen
- [x] KEIN Code geschrieben — nur Analyse und Empfehlungen
