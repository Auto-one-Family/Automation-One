# Auftrag P8-A6 — Aktor-Analytics: Runtime-KPIs, Timeline & Korrelation

**Typ:** Feature — Server + Frontend
**Schwere:** HIGH
**Aufwand:** ~6-8h (3 Phasen)
**Ziel-Agent:** server-dev (Phase B Server-Teil), frontend-dev (Phase A, B Frontend, C)
**Abhaengigkeit:** Keine (aber groesster Block, empfohlen als letzter P8-Auftrag)
**Roadmap:** `roadmap-P8-v2-implementation-2026-03-27.md`

---

## Kontext

AutomationOne ist ein IoT-Framework mit drei Schichten:

1. **El Trabajante** (ESP32 Firmware) — liest Sensoren, schaltet Aktoren. 4 Aktor-Typen: Pumpe, Ventil, PWM, Relay.
2. **El Servador** (FastAPI Server) — PostgreSQL mit 31 Tabellen, 263 REST-Endpoints, 13 MQTT-Handler.
3. **El Frontend** (Vue 3 Dashboard) — 10 Widget-Typen, Chart.js (vue-chartjs), GridStack.js Widget-Builder.

**Chart-Library: Chart.js 4.x mit vue-chartjs.** NICHT ECharts. Wichtige Faehigkeiten:
- **Dual-Y-Achsen:** Benannte Scales (`y`, `y1`), `yAxisID` pro Dataset, `position: 'left'`/`'right'`, `grid.drawOnChartArea: false` auf rechter Achse
- **TimeScale:** `type: 'time'` mit `chartjs-adapter-date-fns` (bereits installiert). Konfiguration: `autoSkip: true`, `maxTicksLimit: 8`, `displayFormats` fuer HH:mm, dd.MM. etc.
- **Annotations:** `chartjs-plugin-annotation` (bereits installiert). Vertikale Linien: `type: 'line'`, `scaleID: 'x'`, `value: timestamp`
- **Bar-Datasets als Hintergrund:** `barPercentage: 1.0`, `categoryPercentage: 1.0` fuer volle Breite. Dataset `order` Property steuert Render-Reihenfolge (niedrigerer Wert = hinter hoeheren)
- **Bedingte Annotations:** `display: (ctx) => isFinite(value)` — nur anzeigen wenn Wert vorhanden

**Bestehende Server-Infrastruktur (bereits vorhanden, nur nicht im Frontend genutzt):**

```
actuator_states (Tabelle):
  esp_id, gpio, actuator_type
  current_value: Float — 0.0 (OFF) oder 1.0 (ON bei Relay), 0.0-1.0 bei PWM
  target_value: Float  — gleicher Wertebereich wie current_value
  state                — 'on' / 'off' / 'pwm' / 'unknown' / 'error' / 'emergency_stop'
  last_command_timestamp
  runtime_seconds      — seit letzter Aktivierung
  metadata (JSON)

actuator_history (Tabelle):
  esp_id, gpio, actuator_type
  command_type         — 'set', 'stop', 'emergency_stop'
  value                — 0.0/1.0 fuer Relay, 0.0-1.0 fuer PWM
  timestamp
  success, error_message
  Indizes: esp_gpio_timestamp, command_type_timestamp

API-Endpoints (bereits vorhanden):
  GET /actuators/{actuator_id}/runtime
    → runtime_stats (JSON), computed_uptime_hours, maintenance_overdue
    → Fokus: Wartung, NICHT Live-KPIs

  GET /actuators/{esp_id}/{gpio}/history
    → Pfad-Schema: esp_id und gpio, NICHT actuator_id/UUID
    → Parameter: limit (max 100, Constraint le=100 in actuators.py:1218), start_time, end_time
    → Response: Liste von entries (KEINE Aggregation wie duty_cycle oder total_cycles)
    → ACHTUNG: Frontend-API-Client (actuatorsApi) hat KEINEN getHistory()-Aufruf — muss erstellt werden

  actuator_history.value:
    → Optional[float] — None fuer Stop-Commands (actuator.py:417-420)
    → Block-Berechnungen muessen null-safe sein (value > 0 Check → value != null && value > 0)

  actuator_history.data_source:
    → 'production' oder 'simulation' — bei Queries ggf. filtern, sonst Mock/Real gemischt
```

**MultiSensorWidget.vue:**
- Unterstuetzt bereits Dual-Y-Achsen (implementiert in PB-02)
- Nutzt `parseSensorId()` aus `useSensorId.ts` (MultiSensorWidget.vue:125, Zeile 152) fuer ID-Parsing
- Nutzt `useSensorOptions` Composable fuer Sensor-Dropdown
- Sensor-Auswahl passiert INNERHALB des Widgets (Chip-UI, Zeile 182-193), NICHT im WidgetConfigPanel
- multi-sensor ist NICHT in `hasSensorField` (WidgetConfigPanel.vue:46)
- Eigene TimeRange-Chips (Zeile 37-38): `'1h' | '6h' | '24h' | '7d'`
- Aktuell: NUR Sensoren, KEINE Aktoren

**ActuatorRuntimeWidget.vue:**
- Aktuell zeigt nur: `state` (ON/OFF Badge) + `last_command_at` (Timestamp)
- Datenquelle: `useEspStore` → MockActuator Objekt
- WICHTIG: `MockActuator.state` ist boolean (types/index.ts:309), NICHT String. Live-KPIs (runtime_seconds, duty_cycle) sind NICHT im MockActuator-Interface → Phase A MUSS immer die API aufrufen, nicht nur den Store lesen.
- KEINE Anzeige von: runtime_seconds, Duty Cycle, Zyklen, History, Timeline

---

## Phase A — ActuatorRuntime KPI-Anzeige (~2h, nur Frontend)

### IST
Widget zeigt nur ON/OFF Status + `last_command_at`. Heisst "Runtime" aber zeigt keine Laufzeit.

### SOLL

**Layout (innerhalb bestehender Widget-Groesse):**
```
┌─────────────────────────────────┐
│ ⚡ Pumpe 1               [ON]  │  ← Status-Badge (bestehend, farbig)
│                                 │
│  Laufzeit heute      2h 34m    │  ← runtime_seconds, formatiert
│  Duty Cycle          42%       │  ← Berechnet: ON-Time / Gesamt-Time
│  Zyklen heute        12        │  ← Anzahl ON→OFF Wechsel
│  Avg. Zyklus         12.8 min  │  ← Laufzeit / Zyklen
│                                 │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░  42%    │  ← CSS Duty-Cycle-Bar
└─────────────────────────────────┘
```

**Duty-Cycle-Bar:** Reiner CSS-Balken — KEIN Chart.js fuer einen simplen Balken:
```css
.duty-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
}
.duty-bar__on {
  background: var(--color-success);
  /* width via inline-style: z.B. width: 42% */
}
.duty-bar__off {
  background: var(--color-neutral);
  opacity: 0.3;
  flex: 1;
}
```

**Datenquellen (Prioritaets-Reihenfolge):**
1. **Bevorzugt:** `GET /actuators/{actuator_id}/runtime` — falls `runtime_stats` die noetige Aggregation liefert (Laufzeit, Zyklen, Duty Cycle). ACHTUNG: Pfad nutzt `actuator_id` (UUID), nicht esp_id/gpio.
2. **Falls nicht ausreichend:** `GET /actuators/{esp_id}/{gpio}/history?start_time=<today_00:00>&limit=100` laden und Client-seitig berechnen:
   - Laufzeit: Summe aller ON-Intervalle (set→stop Timestamps)
   - Zyklen: Anzahl `command_type: 'set'` Eintraege
   - Duty Cycle: Laufzeit / (jetzt - Tagesbeginn) × 100
   - Avg. Zyklus: Laufzeit / Zyklen
   - WICHTIG: `value` ist `Optional[float]` — None bei Stop-Commands. ON-Erkennung: `value != null && value > 0`
   - WICHTIG: `actuatorsApi.getHistory()` existiert NOCH NICHT im Frontend-API-Client — muss in Phase A oder B erstellt werden

**Zeitformat-Hilfsfunktion:**
```typescript
function formatRuntime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}min`
}
```

---

## Phase B — Timeline-Chart + Server-API-Erweiterung (~3h, Server + Frontend)

### Server-Erweiterung

Der bestehende History-Endpoint (`GET /actuators/{esp_id}/{gpio}/history`) hat `limit` mit Constraint `le=100` (Annotated[int, Query(ge=1, le=100)] in actuators.py:1218) und KEINE Aggregation. Fuer die Timeline und KPIs wird eine Aggregation benoetigt.

**Vorbedingung Phase B:**
- `actuatorsApi.getHistory(espId, gpio, params)` als Frontend-API-Client-Funktion erstellen (falls nicht schon in Phase A geschehen)
- `ActuatorHistoryResponse` Schema um optionales `aggregation`-Feld erweitern

**Option 1 (bevorzugt): Bestehenden Endpoint erweitern:**
- Neuen optionalen Query-Parameter `include_aggregation=true`
- `limit` Constraint von `le=100` auf `le=500` erhoehen (oder bei `include_aggregation=true` separaten Query ohne striktes Limit)
- Response wird um `aggregation` Objekt erweitert:

```json
{
  "entries": [
    { "timestamp": "2026-03-27T10:00:00Z", "command_type": "set", "value": 1.0, "success": true },
    { "timestamp": "2026-03-27T10:12:30Z", "command_type": "stop", "value": 0.0, "success": true }
  ],
  "aggregation": {
    "total_runtime_seconds": 9240,
    "total_cycles": 12,
    "duty_cycle_percent": 42.3,
    "avg_cycle_seconds": 770
  },
  "total": 24,
  "from": "2026-03-27T00:00:00Z",
  "to": "2026-03-27T23:59:59Z"
}
```

- Aggregation wird Server-seitig aus `actuator_history` berechnet:
  - `total_runtime_seconds`: Summe aller ON-Intervalle (set-Timestamp bis naechster stop-Timestamp)
  - `total_cycles`: Anzahl `command_type = 'set'` Eintraege im Zeitraum
  - `duty_cycle_percent`: `total_runtime_seconds / Zeitraum-Sekunden * 100`
  - `avg_cycle_seconds`: `total_runtime_seconds / total_cycles` (0 wenn keine Zyklen)
- Falls Aggregation zu aufwaendig: Client-seitige Berechnung bleibt Fallback
- WICHTIG: `value` ist `Optional[float]` — None bei Stop-Commands. Aggregations-Berechnung muss null-safe sein.
- WICHTIG: Bei History-Queries `data_source`-Feld beachten — ggf. nach `'production'` oder `'simulation'` filtern, sonst werden Mock-Daten mit echten gemischt

**Option 2 (Alternative): Neuer dedizierter Endpoint:**
```
GET /actuators/{esp_id}/{gpio}/runtime/daily?date=2026-03-27
```
Liefert nur die Aggregation fuer einen Tag. Leichtgewichtiger, aber ein neuer Endpoint.

### Frontend — Timeline-Darstellung

Neuer Bereich im ActuatorRuntimeWidget: Gantt-artige Timeline.

**Darstellung:**
- Horizontale Zeitachse (Chart.js TimeScale)
- Farbige Bloecke:
  - ON (value > 0): `var(--color-success)` mit Opacity 0.7
  - OFF (value == 0): `var(--color-neutral)` mit Opacity 0.2
  - ERROR (`success: false`): `var(--color-error)` mit Opacity 0.7
  - EMERGENCY (`command_type: 'emergency_stop'`): `var(--color-warning)` mit Opacity 0.9
- Hover auf Block zeigt Tooltip: Dauer + Startzeitpunkt
- Zeitbereich-Umschalter: 1h / 6h / 24h (Default) / 7d — konsistent mit MultiSensorWidget TimeRange-Chips (NICHT 30d, Widget kennt nur 1h/6h/24h/7d)

**Chart.js Implementierung:**
```javascript
{
  type: 'bar',
  data: {
    datasets: [{
      data: blocks.map(b => ({
        x: [b.start, b.end],  // Floating Bars fuer Zeitbereiche
        y: 1
      })),
      backgroundColor: blocks.map(b => getBlockColor(b.state)),
      barPercentage: 1.0,
      categoryPercentage: 1.0
    }]
  },
  options: {
    indexAxis: 'y',  // Horizontale Balken
    scales: {
      x: {
        type: 'time',
        time: { displayFormats: { hour: 'HH:mm', day: 'dd.MM.' } },
        ticks: { autoSkip: true, maxTicksLimit: 8 }
      },
      y: { display: false }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.raw.state}: ${formatDuration(ctx.raw.duration)}`
        }
      }
    }
  }
}
```

**Block-Berechnung aus History-Eintraegen:**
```typescript
interface TimelineBlock {
  start: Date
  end: Date
  state: 'on' | 'off' | 'error' | 'emergency'
  duration: number // Sekunden
}

function historyToBlocks(entries: HistoryEntry[]): TimelineBlock[] {
  // Sortiert nach timestamp ASC
  // Paare bilden: set→stop, stop→set
  // Luecken fuellen mit 'off'-Bloecken
  // WICHTIG: entry.value ist Optional[float] — None/null bei Stop-Commands
  // ON-Erkennung: command_type === 'set' && value != null && value > 0
  // OFF-Erkennung: command_type === 'stop' || value === null || value === 0
  // EMERGENCY: command_type === 'emergency_stop' (unabhaengig von value)
}
```

---

## Phase C — Sensor-Aktor-Korrelation im MultiSensorWidget (~3-4h, Frontend)

### Warum Korrelation ein Alleinstellungsmerkmal ist

Recherche von 28 Quellen zeigt: **Keine IoT-Plattform** bietet native Sensor-Aktor-Korrelation als einzelnes Widget:
- **Grafana:** Cross-Panel-Tooltip-Sync (Crosshair springt ueber Panels), aber KEIN Overlay-Chart. Man muss es manuell bauen.
- **ThingsBoard:** Getrennte Alarm- und Time-Series-Widgets, keine Korrelation.
- **AROYA (Cannabis IoT):** VPD-Trend + Bewaesserungs-Events als Annotationen im gleichen Chart — kommt dem am naechsten.

AutomationOne kann hier ein echtes Differenzierungsmerkmal schaffen: Sensor-Zeitreihe + Aktor-State in EINEM Chart.

### Design-Entscheidung

**MultiSensorWidget erweitern — KEINEN neuen Widget-Typ erstellen.**

Begruendung: MultiSensorWidget hat bereits Dual-Y-Achsen, parst Sensor-IDs, nutzt useSensorOptions. Ein neuer Widget-Typ wuerde eine 11. Registrierung in `useDashboardWidgets.ts` erfordern (4 Stellen: widgetComponentMap, WIDGET_TYPE_META, WIDGET_DEFAULT_CONFIGS, mountWidgetToElement) — unnoetige Komplexitaet.

### Schritt 1 — Aktor-Auswahl INNERHALB MultiSensorWidget

**WICHTIG:** `multi-sensor` ist NICHT in `hasSensorField` (WidgetConfigPanel.vue:46) — die Sensor-Auswahl passiert bereits INNERHALB des MultiSensorWidget selbst (Chip-UI, Zeile 182-193). Die Aktor-Auswahl muss deshalb **analog zur bestehenden Sensor-Chip-UI** im Widget selbst implementiert werden, NICHT im WidgetConfigPanel.

- Neuer Abschnitt im MultiSensorWidget unter den Sensor-Chips: "Aktor hinzufuegen" Button
- Aktor-Dropdown (analog zum Sensor-Dropdown, aber aus der Aktor-Liste des ESP-Stores)
- Config-Feld: `actuatorIds: string[]` (Format: `espId:gpio:actuatorType`, analog zu sensorIds)
- **Max 2 Aktoren pro Chart** — mehr wird visuell unleserlich. Validierung im Widget.
- Aktor-Chips mit X zum Entfernen, visuell leicht von Sensor-Chips unterscheidbar (z.B. anderes Icon oder Farbe)

```html
<!-- Im MultiSensorWidget, UNTER den bestehenden Sensor-Chips -->
<div class="actuator-section">
  <label>Aktoren (optional)</label>
  <select v-model="selectedActuator" @change="addActuator" :disabled="config.actuatorIds?.length >= 2">
    <optgroup v-for="esp in espOptions" :label="esp.name">
      <option v-for="act in esp.actuators" :value="act.id">
        {{ act.label }} ({{ act.type }})
      </option>
    </optgroup>
  </select>
  <div class="actuator-chips">
    <span v-for="id in config.actuatorIds" class="chip chip--actuator">
      {{ formatActuatorLabel(id) }}
      <button @click="removeActuator(id)">×</button>
    </span>
  </div>
</div>
```

### Schritt 2 — Aktor-State als Hintergrund-Overlay

Aktor-History laden fuer den ausgewaehlten Zeitbereich via `GET /actuators/{esp_id}/{gpio}/history?start_time=&end_time=` (oder den in Phase B erweiterten Endpoint).

**Chart.js Implementierung — Dual-Layer-Chart:**

```javascript
// Sensor-Datasets (Linien, primaere + sekundaere Y-Achse)
const sensorDatasets = sensors.map(s => ({
  type: 'line',
  label: s.label,
  data: s.data,
  yAxisID: getYAxisForType(s.sensorType), // 'y' oder 'y1'
  borderColor: s.color,
  order: 2  // Ueber Aktor-Hintergrund rendern
}))

// Aktor-Datasets (Balken als Hintergrund)
const actuatorDatasets = actuators.map(a => ({
  type: 'bar',
  label: a.label,
  data: historyToChartData(a.history), // Zeitbereiche
  yAxisID: 'y-actuator',
  backgroundColor: a.history.map(h =>
    h.value != null && h.value > 0
      ? `rgba(76, 175, 80, ${0.12 * h.value})` // Gruen, Opacity proportional (value ist 0.0-1.0)
      : 'transparent'
  ),
  barPercentage: 1.0,
  categoryPercentage: 1.0,
  order: 0  // HINTER Sensor-Linien rendern (niedrigerer order = weiter hinten)
}))

// Unsichtbare Y-Achse fuer Aktoren
scales: {
  'y-actuator': {
    display: false,
    min: 0,
    max: 1
  }
}
```

**Aktor-Farben (Werte sind 0.0–1.0, NICHT 0–255):**
- ON (value > 0): `rgba(76, 175, 80, 0.12)` — subtiles Gruen im Hintergrund
- OFF (value == 0 oder null): transparent (kein Hintergrund)
- PWM: Opacity proportional zum PWM-Wert: `0.12 * value` (value ist bereits 0.0–1.0)
  - 100% PWM (1.0) = volle 0.12 Opacity
  - 50% PWM (0.5) = halbe 0.06 Opacity
- Die Farben sind absichtlich subtil — der Aktor-Hintergrund darf die Sensor-Linien nicht dominieren
- WICHTIG: `value` ist `Optional[float]` — null bei Stop-Commands. Null-Check VOR Vergleich.

**Legende:** Zeigt Sensor-Name (Farbige Linie) + Aktor-Name (Farbiger Block)

### Schritt 3 — Event-Annotations (optional, Nice-to-have)

Vertikale Linien an den Schaltmomenten (ON/OFF-Wechsel) per `chartjs-plugin-annotation`:

```javascript
annotations: actuatorEvents.slice(-20).map(e => ({
  type: 'line',
  scaleID: 'x',
  value: e.timestamp,
  borderColor: 'rgba(76, 175, 80, 0.5)',
  borderWidth: 1,
  borderDash: [4, 4],
  label: {
    display: false,  // Nur bei Hover sichtbar
    content: `${e.actuatorLabel} ${e.value > 0 ? 'EIN' : 'AUS'}`,
    position: 'start'
  }
}))
```

- Max 20 Annotations pro Chart (bei mehr: nur die neuesten)
- Label nur bei Hover sichtbar (nicht permanent — wuerde Chart ueberlagern)

---

## Einschraenkungen

- Chart.js bleibt (keine ECharts-Migration)
- **KEIN neuer Widget-Typ** — MultiSensorWidget wird erweitert, 10 Widget-Typen bleiben
- Keine neuen npm-Pakete (chartjs-plugin-annotation ist bereits installiert)
- `actuator_history` Tabelle hat bereits die richtigen Indizes
- History-Endpoint Pfad-Schema: `{esp_id}/{gpio}`, NICHT `{actuator_id}/UUID` — aber Runtime-Endpoint nutzt `{actuator_id}` (UUID)
- Import/Export in CustomDashboardView NICHT anfassen
- Phase C haengt von Phase B ab (History-API mit ausreichend Daten)
- **Wertebereiche sind 0.0–1.0** (Float), NICHT 0–255. `current_value: Float` in actuator_states, `value: Optional[float]` in actuator_history
- Aktor-Auswahl fuer MultiSensorWidget passiert IM Widget (Chip-UI), NICHT im WidgetConfigPanel
- TimeRange konsistent halten: 1h / 6h / 24h / 7d (wie MultiSensorWidget)

---

## Was NICHT gemacht wird

- Synchronized Crosshair ueber mehrere Charts (spaeteres Feature)
- Short-Cycling Detection / Anomalie-Erkennung (Analyse-Feature, nicht in diesem Auftrag)
- Mobile Gesture-Navigation (separater Auftrag)
- Neue Tabellen in der DB (bestehende actuator_history + actuator_states reichen)

---

## Vorbedingungen (vor Phase A)

- [ ] `actuatorsApi.getHistory(espId: string, gpio: number, params: { limit?: number, start_time?: string, end_time?: string })` als Frontend-API-Client-Funktion in `actuators.ts` erstellen (existiert noch nicht)
- [ ] Pruefen ob `actuator_history` genuegend Testdaten hat (Mock-ESP Simulation muss Commands loggen)
- [ ] `data_source`-Filterung klaeren: sollen Mock-Daten (simulation) in der Anzeige erscheinen?

## Empfohlene Reihenfolge

```
Vorbedingung: actuatorsApi.getHistory() API-Client erstellen

Phase A (Frontend only, ~2h)
  → ActuatorRuntimeWidget: KPIs + Duty-Cycle-Bar
  → Nutzt GET /actuators/{actuator_id}/runtime ODER Client-seitige Berechnung aus History
  → MUSS API aufrufen — MockActuator im Store hat keine KPI-Felder

Phase B (Server + Frontend, ~3h)
  → Server: History-Endpoint um Aggregation erweitern + limit-Constraint erhoehen (le=100 → le=500)
  → Server: ActuatorHistoryResponse Schema um optionales aggregation-Feld erweitern
  → Frontend: Timeline-Chart im ActuatorRuntimeWidget
  → Phase A kann die Aggregation dann nutzen (Refactor von Client → Server)

Phase C (Frontend only, ~3-4h)
  → MultiSensorWidget: Aktor-Auswahl (Widget-interne Chip-UI) + Hintergrund-Overlay
  → Nutzt Phase B History-API fuer Aktor-Daten
```

---

## Akzeptanzkriterien

**Vorbedingung:**
- [ ] `actuatorsApi.getHistory()` im Frontend-API-Client vorhanden und funktional

**Phase A:**
- [ ] ActuatorRuntimeWidget zeigt: Laufzeit, Duty Cycle, Zyklen, Avg. Zyklusdauer
- [ ] Duty-Cycle-Bar als reiner CSS-Balken (kein Chart.js)
- [ ] Werte korrekt berechnet (Laufzeit = Summe ON-Intervalle, Zyklen = Anzahl set-Befehle)
- [ ] KPI-Daten werden via API geladen (NICHT aus useEspStore/MockActuator — dort fehlen die Felder)
- [ ] Null-safe: `value` kann null sein bei Stop-Commands

**Phase B:**
- [ ] Server: `limit` Constraint von le=100 auf le=500 erhoehen
- [ ] Server: History-Endpoint liefert `aggregation` Objekt (total_runtime, cycles, duty_cycle, avg_cycle)
- [ ] Server: Aggregation ist null-safe (value Optional[float])
- [ ] Timeline-Darstellung mit farbigen ON/OFF/ERROR/EMERGENCY Bloecken
- [ ] Hover-Tooltip auf Bloecken zeigt Dauer + Startzeitpunkt
- [ ] Zeitbereich-Umschalter: 1h / 6h / 24h / 7d (konsistent mit MultiSensorWidget)

**Phase C:**
- [ ] MultiSensorWidget hat "Aktor hinzufuegen" als Widget-interne Chip-UI (NICHT in WidgetConfigPanel)
- [ ] Max 2 Aktoren pro Chart (Validierung)
- [ ] Aktor-State als farbige Hintergrund-Bereiche im Chart
- [ ] PWM-Opacity korrekt: `0.12 * value` (value ist 0.0–1.0, NICHT 0–255)
- [ ] Sensor-Linien UEBER Aktor-Hintergrund (order-Property korrekt)
- [ ] Korrelation visuell erkennbar (z.B. Pumpe EIN → Feuchte steigt)
- [ ] Optional: Schaltmoment-Annotations als gestrichelte vertikale Linien (max 20)
