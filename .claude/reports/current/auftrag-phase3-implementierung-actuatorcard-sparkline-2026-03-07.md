# Auftrag: Phase 3 Implementierung — ActuatorCard Informativ + Sparkline Aussagekraeftig

> **Datum:** 2026-03-07
> **Ziel-Repo:** auto-one (El Frontend)
> **Typ:** Implementierung — Code schreiben, testen, committen
> **Prioritaet:** HOCH
> **Geschaetzter Aufwand:** ~6-7h (2 Teilauftraege, teilweise parallelisierbar)
> **Abhaengigkeit:** Phase 0 + Phase 1 muessen ERLEDIGT sein (Toggle-Guard auf monitor-mode, Mock-Daten sauber, AbortController)

---

## Ziel und Motivation

Monitor L2 (`/monitor/:zoneId`) ist die Read-Only Zone-Detail-Ansicht. Aktuell zeigen die Cards dort nur Rohdaten — ein Sensorwert ohne Kontext ("23.5°C") und ein Aktor-Status ohne Erklaerung ("Ein"). Das reicht nicht.

**Situational Awareness (Endsley 2023)** hat 3 Level: (1) Perception — Daten sehen, (2) Comprehension — Daten verstehen, (3) Projection — Entwicklung einschaetzen. Aktuell liefert Monitor L2 nur Level 1. Phase 3 hebt es auf Level 2+3:

- **ActuatorCard:** Statt nur "Ein/Aus" → "Ein (weil Temp > 28°C, Regel 'Kuehlung', zuletzt 14:23)" = Level 2 (Comprehension)
- **Sparkline:** Statt nur Linie → Linie mit Schwellwert-Zonen und Trendpfeil = Level 3 (Projection)

**5-Sekunden-Regel:** Das Haupt-Dashboard muss in unter 5 Sekunden beantworten "Muss ich handeln?". Dafuer muessen Trend, Schwellwert-Naehe und Aktor-Gruende SOFORT visuell erkennbar sein — ohne Klick, ohne Tooltip.

---

## Systemkontext

AutomationOne hat 3 Schichten:
- **El Trabajante** (ESP32 Firmware, C++) — Sensoren auslesen, Aktoren schalten
- **El Servador** (FastAPI Backend, Python) — Zentrale Verarbeitung, Datenbank, Logic Engine
- **El Frontend** (Vue 3 + TypeScript) — Visualisierung, Konfiguration

**Dieser Auftrag betrifft NUR El Frontend.** Kein Backend-Code, keine Firmware.

**Monitor = Beobachten + Verstehen.** Wer Aktoren schalten will, baut sich ein Steuerungs-Dashboard im Editor (`/editor`). Monitor L2 zeigt Aktor-Kontext (Regeln, Ausloeser, Status) — schaltet aber NICHT.

---

## Was NICHT gemacht wird

- Kein neuer Backend-Endpoint (clientseitige Filterung reicht bei <100 Rules)
- Keine neue SparklineChart-Komponente (`LiveLineChart` mit `compact`-Modus reicht)
- Kein Achievement-System oder Gamification-Animationen
- Keine Aenderungen an Phase 4-8 Items
- Kein `resolution`-Parameter (Phase 7)
- Keine Aenderungen am Editor oder QuickActionBall
- Keine Aenderungen an `LiveLineChart.vue` selbst (nur dessen Nutzung anpassen)

---

# Teilauftrag 3.1: ActuatorCard Informativ (monitor-mode)

## IST-Zustand

`ActuatorCard.vue` (`components/devices/ActuatorCard.vue`, ~209 Zeilen):
- Props: `actuator: ActuatorWithContext`, `mode: 'monitor' | 'config'`
- Im `monitor`-mode zeigt die Card: Name, binaer Ein/Aus, Emergency-Stopp-Badge, "Bedient Subzone"-Label
- Toggle-Button ist seit Phase 1 auf `v-if="mode === 'config'"` beschraenkt
- Kein PWM-Badge (obwohl Backend `pwm_value` liefert)
- Keine Referenz zu Logic Rules oder Execution History

## SOLL-Zustand

Im `monitor`-mode zeigt die ActuatorCard zusaetzlich:

1. **PWM-Prozent-Badge:** Wenn `actuator.pwm_value > 0` → "75%" als Badge neben dem Status
2. **Verknuepfte Regeln (max 2):** Name + Status-Dot (gruen=aktiv, grau=deaktiviert) + Condition-Kurztext
3. **Letzte Execution:** "Zuletzt: vor 5 Min (Temp > 28°C)" — Zeitpunkt relativ + Trigger-Grund
4. **Bei >2 Regeln:** "+N weitere" als klickbarer Link zu `/logic` (Deep-Link)

**Warum Kontext statt nur Status:** "Luefter: Ein" ist nutzlos. "Luefter: Ein (weil Temp > 28°C seit 14:23, Regel 'Kuehlung')" erklaert WARUM — das entspricht Level 2 der Situational Awareness. Der Nutzer sieht nicht nur DASS etwas an ist, sondern VERSTEHT die Ursache.

**Design-Regeln:**
- Kompakte Status-Cards: Status-Dot (ein Icon), Name + letzte Ausfuehrung — maximal 2-3 Zeilen pro Regel
- Progressive Disclosure: L2 = Uebersicht, Klick → LogicView fuer volle Details
- Keine Konfiguration im Monitor: Kein Toggle, kein Delete, nur Anzeige + Deep-Link
- Konsistente Farben: `--color-status-success` (aktiv/gruen), `--color-status-error` (Fehler/rot), `--color-text-muted` (deaktiviert/grau)

## Schritt 3.1.1: `getRulesForActuator()` im Logic Store

**Datei:** `shared/stores/logic.store.ts`

**Kontext:** Es existiert bereits `getRulesForZone(zoneId)` das ueber ESP-IDs filtert. `extractEspIdsFromRule(rule)` sammelt ESP-IDs aus Conditions + Actions. Fuer Aktoren brauchen wir einen Filter auf Action-Ebene mit `esp_id` + `gpio`.

**Implementierung:**

```typescript
// Neue exportierte Funktion im logic.store
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

**Action-Typen die Aktoren referenzieren:**
- `ActuatorAction`: `type='actuator'` oder `type='actuator_command'`
- Referenziert den Aktor ueber `esp_id: string` + `gpio: number` (NICHT ueber actuator_id)
- Hat: `command: 'ON' | 'OFF' | 'PWM' | 'TOGGLE'`, `value?: number` (PWM 0.0-1.0), `duration?: number`

**Andere Action-Typen (NICHT filtern):** `notification`, `delay`, `plugin`, `autoops_trigger`, `run_diagnostic`

**Return im Store:** Die Funktion muss im `return { ... }` des Store-Setup exportiert werden.

## Schritt 3.1.2: `getLastExecutionForActuator()` im Logic Store

**Datei:** `shared/stores/logic.store.ts`

**Kontext:** Der Store hat bereits:
- `executionHistory: ExecutionHistoryItem[]` — REST + WS merged, dedupliziert, max 50 Eintraege
- `loadExecutionHistory(ruleId?)` — Fetch + Merge + Sort
- WS-Event `logic_execution` liefert: `{ rule_id, rule_name, trigger: {esp_id, gpio, sensor_type, value, timestamp}, action: {esp_id, gpio, command, value}, success, message, timestamp }`

**Implementierung:**

```typescript
function getLastExecutionForActuator(espId: string, gpio: number): ExecutionHistoryItem | null {
  const actuatorRules = getRulesForActuator(espId, gpio)
  const ruleIds = new Set(actuatorRules.map(r => r.id))

  return executionHistory.value
    .filter(exec => ruleIds.has(exec.rule_id))
    .sort((a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime())
    [0] ?? null
}
```

**Wichtig:** `loadExecutionHistory()` muss in MonitorView's `onMounted` aufgerufen werden (einmalig, max 50 Eintraege, kein Performance-Problem). Pruefen ob das bereits geschieht — wenn nicht, hinzufuegen.

## Schritt 3.1.3: `formatConditionShort(rule)` Utility

**Datei:** `types/logic.ts` (neben dem bestehenden `generateRuleDescription()`)

**Kontext:** Es gibt bereits 3 Stellen die Conditions als Text rendern (in `generateRuleDescription`, `RuleCardCompact.shortDescription`, `RuleCard.sensorBadge`), aber keine standalone Funktion. Die existierenden sind in Komponenten-Computed dupliziert.

**Condition-Typen im System (Union Type `LogicCondition`):**

| Typ | Felder | Kurztext-Beispiel |
|-----|--------|-------------------|
| `sensor` / `sensor_threshold` | esp_id, gpio, sensor_type, operator, value | "Temperatur > 28°C" |
| `time_window` / `time` | start_hour, end_hour, days_of_week? | "06:00–20:00" |
| `hysteresis` | activate_above, deactivate_below | "Ein >28, Aus <25" |
| `compound` | logic (AND/OR), conditions[] (rekursiv) | Verschachtelt |
| `diagnostics_status` | check_name, expected_status | "[diagnostics]" |

**Condition-Action-Modell:** N:M — ALLE Conditions zusammen (via `rule.logic_operator: 'AND' | 'OR'`) bestimmen ob ALLE Actions ausgefuehrt werden. Es gibt KEINE 1:1-Zuordnung Condition→Action. Der Kurztext zeigt die GESAMTE Condition der Rule.

**Hilfsfunktionen die bereits existieren:**
- `getSensorLabel(type)` aus `sensorDefaults.ts` — gibt lesbaren Namen ("Temperatur", "pH-Wert")
- `getSensorUnit(type)` aus `sensorDefaults.ts` — gibt Einheit ("°C", "pH", "%RH")

**Implementierung:**

```typescript
export function formatConditionShort(rule: LogicRule): string {
  if (!rule.conditions?.length) return 'Keine Bedingung'

  const parts = rule.conditions.map(cond => {
    if (cond.type === 'sensor' || cond.type === 'sensor_threshold') {
      const label = getSensorLabel(cond.sensor_type) || cond.sensor_type
      const unit = getSensorUnit(cond.sensor_type)
      const op = cond.operator === '>=' ? '≥' : cond.operator === '<=' ? '≤' : cond.operator
      if (cond.operator === 'between') {
        return `${label} ${cond.min ?? '?'}–${cond.max ?? '?'}${unit}`
      }
      return `${label} ${op} ${cond.value}${unit}`
    }
    if (cond.type === 'hysteresis') {
      const label = getSensorLabel(cond.sensor_type) || 'Hysterese'
      return `${label} Ein >${cond.activate_above ?? '?'}, Aus <${cond.deactivate_below ?? '?'}`
    }
    if (cond.type === 'time_window' || cond.type === 'time') {
      return `${String(cond.start_hour).padStart(2, '0')}:00–${String(cond.end_hour).padStart(2, '0')}:00`
    }
    if (cond.type === 'compound') {
      return '[Komplex]'
    }
    return `[${cond.type}]`
  })

  const op = rule.logic_operator === 'OR' ? ' ODER ' : ' UND '
  return parts.join(op)
}
```

**Ergebnis-Beispiele:**
- `"Temperatur > 28°C"` (einfache Sensor-Condition)
- `"Temperatur > 28°C UND 06:00–20:00"` (Sensor + Zeit)
- `"Temperatur Ein >28, Aus <25"` (Hysterese)

**Einheiten IMMER anzeigen** — der Kontext ist entscheidend fuer das Verstaendnis. "28" allein ist nutzlos, "28°C" gibt sofort Orientierung.

## Schritt 3.1.4: ActuatorCard Template erweitern

**Datei:** `components/devices/ActuatorCard.vue`

**Neue Props:**

```typescript
// Zusaetzlich zu den bestehenden Props
linkedRules?: LogicRule[]              // Von MonitorView durchgereicht
lastExecution?: ExecutionHistoryItem   // Von MonitorView durchgereicht
```

**Template-Aenderungen im monitor-mode (NACH dem bestehenden Body-Bereich):**

### PWM-Badge
Wenn `actuator.pwm_value` vorhanden und > 0: Badge neben dem Status mit `${Math.round(actuator.pwm_value * 100)}%`.
- CSS-Klasse: `actuator-card__pwm-badge`
- Farbe: `var(--color-text-secondary)`

### Rules-Section
Neuer Bereich `actuator-card__rules` — nur wenn `linkedRules?.length > 0`:

```html
<div v-if="mode === 'monitor' && linkedRules?.length" class="actuator-card__rules">
  <!-- Pro Rule (max 2): -->
  <div v-for="rule in displayedRules" :key="rule.id" class="actuator-card__rule-item">
    <span class="actuator-card__rule-dot"
      :class="{ 'is-active': rule.enabled, 'is-error': rule.last_execution_success === false }"
    />
    <span class="actuator-card__rule-name">{{ rule.name }}</span>
    <span class="actuator-card__rule-condition">{{ formatConditionShort(rule) }}</span>
  </div>
  <!-- Overflow: -->
  <router-link v-if="linkedRules.length > 2" :to="'/logic'" class="actuator-card__rules-more">
    +{{ linkedRules.length - 2 }} weitere
  </router-link>
</div>
```

**Computed:**
```typescript
const displayedRules = computed(() => (props.linkedRules ?? []).slice(0, 2))
```

### Letzte Execution
Unter der Rules-Section, nur wenn `lastExecution` vorhanden:

```html
<div v-if="mode === 'monitor' && lastExecution" class="actuator-card__last-execution">
  Zuletzt: {{ formatRelativeTime(lastExecution.triggered_at) }}
  <span v-if="lastExecution.trigger_data?.sensor_type" class="actuator-card__execution-reason">
    ({{ formatTriggerReason(lastExecution) }})
  </span>
</div>
```

**Hilfsfunktion `formatTriggerReason`** (im Script-Block der Komponente):
```typescript
function formatTriggerReason(exec: ExecutionHistoryItem): string {
  const trigger = exec.trigger_data
  if (!trigger) return ''
  const label = getSensorLabel(trigger.sensor_type) || trigger.sensor_type
  const unit = getSensorUnit(trigger.sensor_type)
  return `${label} ${trigger.value}${unit}`
}
```

**`formatRelativeTime`** — es gibt wahrscheinlich bereits eine solche Funktion im Projekt (z.B. in `formatters.ts` oder `utils/`). Suche danach. Falls nicht vorhanden, eine einfache Version:
```typescript
function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours}h`
  return `vor ${Math.floor(hours / 24)}d`
}
```

### Status-Dot CSS

```css
.actuator-card__rule-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);  /* Deaktiviert/Grau */
  flex-shrink: 0;
}
.actuator-card__rule-dot.is-active {
  background: var(--color-status-success);  /* Aktiv/Gruen */
}
.actuator-card__rule-dot.is-error {
  background: var(--color-status-error);  /* Fehler/Rot */
}
```

**Active-Glow:** Wenn `logicStore.activeExecutions.has(rule.id)` → zusaetzliche CSS-Klasse `is-executing` mit sanftem Glow/Pulse (2s, analog zum bestehenden Glow-Pattern in LogicView). Aber NUR wenn der logicStore in der Komponente importiert ist — falls nicht, als optionalen Prop `activeRuleIds?: Set<string>` durchreichen.

### Gesamtlayout im monitor-mode

```
┌─────────────────────────────────────┐
│ [Icon] Luefter 01          [Ein 75%] │  ← Name + Status + PWM-Badge
│ Bedient: Hintere Ecke                │  ← Bestehend
│─────────────────────────────────────│
│ ● Kuehlung: Temperatur > 28°C       │  ← Rule 1: Dot + Name + Condition
│ ○ Nachtabsenkung: 22:00–06:00       │  ← Rule 2: Dot + Name + Condition
│ Zuletzt: vor 5 Min (Temperatur 29°C)│  ← Letzte Execution
└─────────────────────────────────────┘
```

## Schritt 3.1.5: MonitorView — Rules + History an ActuatorCard durchreichen

**Datei:** `views/MonitorView.vue`

**Was zu tun ist:**

1. **logicStore importieren** (falls noch nicht): `const logicStore = useLogicStore()`
2. **executionHistory laden** in `onMounted` (falls noch nicht): `logicStore.loadExecutionHistory()`
3. **Rules laden** falls noch nicht: `logicStore.fetchRules()` (pruefen ob bereits in onMounted)

**Im Template wo ActuatorCards gerendert werden** (Subzone-Accordion, Aktor-Bereich):

```html
<ActuatorCard
  :actuator="actuator"
  mode="monitor"
  :linked-rules="logicStore.getRulesForActuator(actuator.esp_id, actuator.gpio)"
  :last-execution="logicStore.getLastExecutionForActuator(actuator.esp_id, actuator.gpio)"
/>
```

**Performance-Hinweis:** `getRulesForActuator` ist eine reine Filter-Operation auf `rules.value` (typisch <100 Rules). Kein Caching noetig. Falls spaeter Performance-Probleme auftreten → `computed` Wrapper mit Memo.

---

# Teilauftrag 3.2: Sparkline Aussagekraeftig

## IST-Zustand

**useSparklineCache.ts** (164 Zeilen):
- Sammelt `ChartDataPoint[]` pro Sensor-Key (`${espId}-${gpio}-${sensorType}`)
- Max 30 Punkte FIFO, Deduplizierung bei 5s-Intervall
- Deep-Watch auf `espStore.devices`, neue Punkte bei Wertaenderung oder >5s
- `loadInitialData()` holt historische Daten via API (batched, max 5 parallel)

**SensorCard.vue** hat Named-Slot `sparkline` (32px Hoehe, `overflow: hidden`)

**MonitorView.vue** befuellt den Slot BEREITS:
```vue
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

**LiveLineChart.vue** hat BEREITS:
- `compact: boolean` — versteckt Achsen, Tooltips, Grid
- `sensorType: string` — Auto Y-Range aus SENSOR_TYPE_CONFIG
- `thresholds: ThresholdConfig` — `{ alarmLow, alarmHigh, warnLow, warnHigh }`
- `showThresholds: boolean` — Threshold-Zonen via `chartjs-plugin-annotation`
- Threshold-Farben: Rot `rgba(239, 68, 68, 0.5)`, Orange `rgba(234, 179, 8, 0.4)`

**Was FEHLT:**
- `:sensor-type` Prop wird NICHT uebergeben → keine automatische Y-Achse
- `:thresholds` wird NICHT uebergeben → keine Schwellwert-Zonen
- Kein Trendpfeil neben dem Wert
- Kein Zeitbezug-Label

## SOLL-Zustand

1. **Y-Achse mit Kontext:** `LiveLineChart` bekommt `sensorType` → automatische `suggestedMin/Max` aus `SENSOR_TYPE_CONFIG`
2. **Schwellwert-Zonen:** Halbtransparente Hintergrund-Bereiche (gruen = OK, rot = Alarm) aus `SENSOR_TYPE_CONFIG`
3. **Trendpfeil:** Neben dem Sensorwert in der SensorCard: ↗ (steigend), → (stabil), ↘ (fallend)
4. **Zeitbezug:** "~2.5 Min" Label unter/neben der Sparkline (30 Punkte × 5s = ~2.5 Minuten)

**Design-Regeln fuer Sparklines in IoT-Cards:**
- Sparklines in Sensor-Karten geben sofortigen Trend-Kontext zum aktuellen Wert
- Bei 32px Hoehe: Linie JA, Threshold-Zonen JA (halbtransparent), Achsen/Labels NEIN (hidden in compact)
- Trend-Pfeil gehoert NEBEN den Wert (nicht ins Chart) — er bezieht sich auf den Wert, nicht auf die Sparkline
- Trend-Pfeil neutral gefaerbt (`var(--color-text-muted)`) — die Bewertung ob gut/schlecht kommt aus der Schwellwert-Zone, nicht aus der Pfeilrichtung. Steigende Temperatur ist bei 22°C kein Problem, bei 34°C schon — der Schwellwert-Hintergrund zeigt das

## Schritt 3.2.1: `sensorType` Prop an LiveLineChart durchreichen

**Datei:** `views/MonitorView.vue`

**Aenderung:** Im `#sparkline` Slot das `sensor-type` Prop hinzufuegen:

```vue
<template #sparkline>
  <LiveLineChart
    v-if="sparklineCache.get(getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type))?.length"
    :data="sparklineCache.get(getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type))"
    compact
    height="32px"
    :max-data-points="30"
    :sensor-type="sensor.sensor_type"
    :show-thresholds="true"
  />
</template>
```

**Effekt:** LiveLineChart nutzt automatisch `SENSOR_TYPE_CONFIG[sensorType].min` und `.max` als `suggestedMin`/`suggestedMax` fuer die Y-Achse. Chart.js `suggestedMin/Max` passt sich automatisch an wenn Daten ausserhalb liegen.

**Vollstaendiges Sensor-Typ-Mapping (aus `sensorDefaults.ts`):**

| Sensor-Typ | Min | Max | Unit |
|------------|-----|-----|------|
| DS18B20 / ds18b20 | -55 | 125 | °C |
| pH | 0 | 14 | pH |
| EC | 0 | 5000 | µS/cm |
| sht31_temp | -40 | 125 | °C |
| sht31_humidity | 0 | 100 | %RH |
| bme280_temp | -40 | 85 | °C |
| bme280_humidity | 0 | 100 | %RH |
| bme280_pressure | 300 | 1100 | hPa |
| analog | 0 | 4095 | raw |
| light | 0 | 100000 | lux |
| co2 | 400 | 5000 | ppm |
| moisture | 0 | 100 | % |
| flow | 0 | 100 | L/min |

## Schritt 3.2.2: Default-Thresholds fuer Sparkline

**Datei:** `views/MonitorView.vue`

**Strategie:** Fuer Phase 3 nutzen wir `SENSOR_TYPE_CONFIG` als Fallback-Quelle. Die Idee: Der "normale" Bereich liegt im mittleren 60% des Sensor-Ranges, Warn-Bereiche in den aeusseren 20%, Alarm-Bereiche in den aeusseren 10%.

**Implementierung als Computed/Hilfsfunktion im MonitorView:**

```typescript
import { SENSOR_TYPE_CONFIG } from '@/utils/sensorDefaults'

function getDefaultThresholds(sensorType: string): ThresholdConfig | undefined {
  const config = SENSOR_TYPE_CONFIG[sensorType]
  if (!config?.min == null || config?.max == null) return undefined

  const range = config.max - config.min
  return {
    alarmLow: config.min + range * 0.1,
    warnLow: config.min + range * 0.2,
    warnHigh: config.max - range * 0.2,
    alarmHigh: config.max - range * 0.1,
  }
}
```

**Template-Aenderung:**
```vue
<LiveLineChart
  ...
  :thresholds="getDefaultThresholds(sensor.sensor_type)"
  :show-thresholds="!!getDefaultThresholds(sensor.sensor_type)"
/>
```

**Spaeter (Phase 7 Enhancement):** Per-Sensor Alert-Config ueber `sensorsApi.getAlertConfig()` laden. Das ueberschreibt dann die Defaults. Fuer Phase 3 reichen die SENSOR_TYPE_CONFIG-Defaults — sie zeigen dem Nutzer den typischen Bereich.

## Schritt 3.2.3: `calculateTrend()` Utility

**Neue Datei:** `utils/trendUtils.ts`

**Algorithmus:** Lineare Regression (Least Squares) — O(n), <1ms fuer 30 Punkte, robust gegen Einzelausreisser, liefert direkt die Steigung als Trend-Indikator.

**Warum nicht Letzte-N-Differenz:** Rauschempfindlich, instabil bei einzelnen Spikes.
**Warum nicht EMA:** Initialwert-Problem, liefert keinen direkten Trend-Wert.

```typescript
export type TrendDirection = 'rising' | 'stable' | 'falling'

export interface TrendResult {
  direction: TrendDirection
  slope: number  // Steigung pro Datenpunkt
}

// Sensor-typ-spezifische Schwellwerte fuer Trend-Erkennung
// Bedeutung: Ab welcher Steigung (pro Datenpunkt) gilt der Trend als "steigend"?
const TREND_THRESHOLDS: Record<string, number> = {
  // Temperatur: 0.2°C pro Punkt (bei 5s Intervall = 0.2°C/5s = signifikant)
  ds18b20: 0.2,
  sht31_temp: 0.2,
  bme280_temp: 0.2,
  // pH: 0.05 pro Punkt (pH ist logarithmisch, 0.1 Aenderung ist viel)
  ph: 0.05,
  // Luftfeuchtigkeit: 0.5% pro Punkt (1% Aenderung ist normal)
  sht31_humidity: 0.5,
  bme280_humidity: 0.5,
  // EC: 2.0 µS/cm pro Punkt (EC schwankt staerker)
  ec: 2.0,
  // Druck: 0.5 hPa pro Punkt
  bme280_pressure: 0.5,
  // CO2: 5 ppm pro Punkt
  co2: 5,
  // Bodenfeuchte: 0.5% pro Punkt
  moisture: 0.5,
  // Durchfluss: 0.2 L/min pro Punkt
  flow: 0.2,
  // Licht: 100 lux pro Punkt
  light: 100,
}

const DEFAULT_TREND_THRESHOLD = 0.1

export function calculateTrend(
  points: ChartDataPoint[],
  sensorType?: string
): TrendResult {
  if (points.length < 5) return { direction: 'stable', slope: 0 }

  const threshold = (sensorType && TREND_THRESHOLDS[sensorType]) ?? DEFAULT_TREND_THRESHOLD
  const n = points.length
  const values = points.map(p => p.value)

  // Lineare Regression: Steigung der Ausgleichsgeraden
  const meanX = (n - 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - meanX) * (values[i] - meanY)
    denominator += (i - meanX) ** 2
  }

  const slope = denominator === 0 ? 0 : numerator / denominator
  const direction: TrendDirection =
    slope > threshold ? 'rising' :
    slope < -threshold ? 'falling' :
    'stable'

  return { direction, slope }
}
```

**Import:** `import { ChartDataPoint } from '@/components/charts/types'` (oder wo auch immer ChartDataPoint definiert ist — pruefen).

**TREND_THRESHOLDS als eigene Konstante** (nicht in SENSOR_TYPE_CONFIG eingebettet) — das haelt die Concerns getrennt und erlaubt spaetere Anpassung ohne SENSOR_TYPE_CONFIG zu aendern.

## Schritt 3.2.4: Trend-Pfeil in SensorCard

**Datei:** `components/devices/SensorCard.vue`

**Neuer optionaler Prop:**

```typescript
trend?: TrendDirection  // 'rising' | 'stable' | 'falling' | undefined
```

**Template-Aenderung:** Neben dem formatierten Sensorwert einen Trend-Pfeil einfuegen:

```html
<!-- Neben dem bestehenden Wert-Display -->
<span v-if="trend" class="sensor-card__trend" :title="trendLabel">
  <TrendingUp v-if="trend === 'rising'" :size="14" />
  <Minus v-if="trend === 'stable'" :size="14" />
  <TrendingDown v-if="trend === 'falling'" :size="14" />
</span>
```

**Icons:** `TrendingUp`, `TrendingDown`, `Minus` sind Lucide-Icons — bereits in MonitorView importiert (Zeile 33). In SensorCard ebenfalls importieren:
```typescript
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
```

**Computed fuer Label (Barrierefreiheit):**
```typescript
const trendLabel = computed(() => {
  if (props.trend === 'rising') return 'Steigend'
  if (props.trend === 'falling') return 'Fallend'
  return 'Stabil'
})
```

**CSS:**
```css
.sensor-card__trend {
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  margin-left: var(--space-1);
}
```

**Trend-Pfeil immer neutral gefaerbt** — KEINE rote/gruene Faerbung auf dem Pfeil selbst. Die Bewertung ob der Trend gut oder schlecht ist, ergibt sich aus der Schwellwert-Zone in der der aktuelle Wert liegt. Ein steigender Wert im gruenen Bereich ist anders zu bewerten als ein steigender Wert der auf den roten Bereich zugeht. Die Sparkline-Hintergrundfarbe zeigt das bereits. Doppelt-Kodierung (neutral Pfeil + farbige Zone) ist korrekt nach Barrierefreiheits-Richtlinien: Nie Farbe als alleiniger Informationstraeger.

## Schritt 3.2.5: Trend-Daten im MonitorView berechnen und durchreichen

**Datei:** `views/MonitorView.vue`

**Implementierung:**

```typescript
import { calculateTrend, type TrendDirection } from '@/utils/trendUtils'

// Hilfsfunktion: Trend fuer einen Sensor berechnen
function getSensorTrend(espId: string, gpio: number, sensorType: string): TrendDirection | undefined {
  const key = getSensorKey(espId, gpio, sensorType)
  const points = sparklineCache.get(key)
  if (!points?.length || points.length < 5) return undefined
  return calculateTrend(points, sensorType).direction
}
```

**Im Template bei SensorCard:**
```vue
<SensorCard
  :sensor="sensor"
  mode="monitor"
  :trend="getSensorTrend(sensor.esp_id, sensor.gpio, sensor.sensor_type)"
>
  <template #sparkline>
    <LiveLineChart ... />
  </template>
</SensorCard>
```

**Performance:** `calculateTrend()` ist O(30) = <1ms. Wird bei jedem Render aufgerufen. Bei 20 Sensoren pro Zone: 20 × <1ms = vernachlaessigbar. Falls spaeter noetig: in ein `computed` mit Cache-Key wrappen.

---

# Reihenfolge und Abhaengigkeiten

```
3.1.1 (getRulesForActuator)     ─┐
3.1.3 (formatConditionShort)     ├─→ 3.1.4 (ActuatorCard Template) ─→ 3.1.5 (MonitorView Durchreichung)
3.1.2 (getLastExecution)        ─┘

3.2.1 (sensorType Prop)         ─→ 3.2.2 (Default Thresholds)
3.2.3 (calculateTrend)          ─→ 3.2.4 (Trend-Pfeil SensorCard) ─→ 3.2.5 (MonitorView Trend)
```

**3.1 und 3.2 sind voneinander UNABHAENGIG** und koennen parallel implementiert werden.

Innerhalb 3.1: Schritte 3.1.1 + 3.1.2 + 3.1.3 koennen parallel, dann 3.1.4, dann 3.1.5.
Innerhalb 3.2: Schritte 3.2.1 + 3.2.3 koennen parallel, dann 3.2.2 nach 3.2.1, 3.2.4 nach 3.2.3, dann 3.2.5 als letztes.

---

# Akzeptanzkriterien

## 3.1: ActuatorCard Informativ

- [ ] **AK-3.1.1:** `getRulesForActuator(espId, gpio)` existiert im logic.store und gibt sortierte `LogicRule[]` zurueck
- [ ] **AK-3.1.2:** `getLastExecutionForActuator(espId, gpio)` existiert im logic.store und gibt `ExecutionHistoryItem | null` zurueck
- [ ] **AK-3.1.3:** `formatConditionShort(rule)` existiert in `types/logic.ts`, gibt lesbaren String zurueck mit Sensor-Label + Operator + Wert + Einheit
- [ ] **AK-3.1.4:** ActuatorCard im `monitor`-mode zeigt verknuepfte Regeln (Name + farbiger Status-Dot + Condition-Kurztext)
- [ ] **AK-3.1.5:** ActuatorCard zeigt letzte Execution mit relativem Zeitstempel und Trigger-Grund
- [ ] **AK-3.1.6:** PWM-Aktoren zeigen "75%" als Badge statt nur "Ein"
- [ ] **AK-3.1.7:** Bei >2 Regeln erscheint "+N weitere" Link
- [ ] **AK-3.1.8:** ActuatorCard im `config`-mode bleibt UNVERAENDERT (keine Regression)

## 3.2: Sparkline Aussagekraeftig

- [ ] **AK-3.2.1:** LiveLineChart im Sparkline-Slot bekommt `sensor-type` Prop → Y-Achse hat sinnvollen Bereich
- [ ] **AK-3.2.2:** LiveLineChart bekommt `thresholds` + `show-thresholds` → farbige Hintergrund-Zonen sichtbar
- [ ] **AK-3.2.3:** `calculateTrend()` existiert in `utils/trendUtils.ts` mit Linearer Regression
- [ ] **AK-3.2.4:** `TREND_THRESHOLDS` ist sensor-typ-spezifisch definiert (mindestens Temperatur, pH, Feuchtigkeit, EC)
- [ ] **AK-3.2.5:** SensorCard zeigt Trend-Pfeil (↗/→/↘) neben dem Wert — neutral gefaerbt
- [ ] **AK-3.2.6:** Trend-Pfeil hat `title`-Attribut fuer Barrierefreiheit ("Steigend"/"Stabil"/"Fallend")
- [ ] **AK-3.2.7:** Sparkline mit <5 Datenpunkten zeigt keinen Trend-Pfeil (statt falschem Trend)

## Uebergreifend

- [ ] **AK-G.1:** Keine neuen TypeScript-Fehler (`vue-tsc --noEmit`)
- [ ] **AK-G.2:** Keine neuen ESLint-Fehler
- [ ] **AK-G.3:** Bestehende Tests bleiben gruen
- [ ] **AK-G.4:** Monitor L2 laedt ohne Fehler — Console hat keine neuen Warnings
- [ ] **AK-G.5:** ActuatorCard im `config`-mode (HardwareView) ist UNVERAENDERT
- [ ] **AK-G.6:** Keine hardcoded Farben — alle Farben ueber Design-Tokens (`--color-*`)

---

# Zusammenfassung der betroffenen Dateien

| Datei | Aenderung | Teilauftrag |
|-------|-----------|-------------|
| `shared/stores/logic.store.ts` | +`getRulesForActuator()`, +`getLastExecutionForActuator()`, Export beider Funktionen | 3.1 |
| `types/logic.ts` | +`formatConditionShort()` Export | 3.1 |
| `components/devices/ActuatorCard.vue` | +Props `linkedRules`, `lastExecution`, +Template-Bereiche Rules/Execution/PWM, +CSS | 3.1 |
| `views/MonitorView.vue` | +Rules/History an ActuatorCard durchreichen, +`sensorType`/`thresholds`/`showThresholds` an LiveLineChart, +`getSensorTrend()`, +`getDefaultThresholds()`, +loadExecutionHistory() | 3.1 + 3.2 |
| `utils/trendUtils.ts` | **NEU** — `calculateTrend()`, `TREND_THRESHOLDS`, Types | 3.2 |
| `components/devices/SensorCard.vue` | +Prop `trend`, +Trend-Pfeil-Template, +CSS, +Lucide-Imports | 3.2 |
