# R1-FE Analyse-Bericht: Logic Engine Frontend IST-Zustand

**Erstellt:** 2026-04-01
**Auftrag:** [auftrag-R1-FE-logic-frontend-analyse.md](auftrag-R1-FE-logic-frontend-analyse.md)
**Analysiert:** El Frontend Rule Builder (7 Blöcke)
**Status:** Vollständig — KEIN Code geändert

---

## Block 1: RuleNodePalette

### Dateien & Zeilen

- `El Frontend/src/components/rules/RuleNodePalette.vue` — 608 Zeilen
- Relevanter Bereich: Zeilen 45–238 (`categories` Array), Zeilen 240–261 (`onDragStart`, `matchesSearch`)

### Befunde

**Kategorien und Items:**

| Kategorie | ID | Anzahl Items |
|-----------|-----|-------------|
| Bedingungen | `condition` | 10 |
| Logik | `logic` | 2 |
| Aktionen | `action` | 5 |
| Klimasteuerung | `template` | 2 |

**Alle Condition-Items** (Zeilen 51–131):

| Label | interner `type` | `defaults.sensorType` | Operator-Default |
|-------|-----------------|----------------------|-----------------|
| Sensor | `sensor` | `'DS18B20'` | `'>'` |
| Feuchtigkeit | `sensor` | `'SHT31'` | `'<'` |
| pH-Wert | `sensor` | `'pH'` | `'between'` |
| Licht | `sensor` | `'light'` | `'<'` |
| CO2 | `sensor` | `'co2'` | `'>'` |
| Bodenfeuchte | `sensor` | `'moisture'` | `'<'` |
| EC-Wert | `sensor` | `'EC'` | `'between'` |
| Füllstand | `sensor` | `'level'` | `'<'` |
| Zeitfenster | `time` | — | — |
| Diagnose-Status | `diagnostics_status` | — | `'=='` |

**Logik-Items** (Zeilen 138–154):

| Label | `type` | `defaults.operator` |
|-------|--------|---------------------|
| UND | `logic` | `'AND'` |
| ODER | `logic` | `'OR'` |

**Aktions-Items** (Zeilen 161–201):

| Label | `type` | defaults |
|-------|--------|---------|
| Aktor steuern | `actuator` | `{ command: 'ON' }` |
| Benachrichtigung | `notification` | `{ channel: 'websocket', target: '', messageTemplate: '' }` |
| Verzögerung | `delay` | `{ seconds: 60 }` |
| Plugin ausführen | `plugin` | `{ pluginId: '', config: {} }` |
| Diagnose starten | `run_diagnostic` | `{ checkName: '' }` |

**Template-Items / Klimasteuerung** (Zeilen 207–237):

| Label | `type` | `defaults.operator` | Kategorie |
|-------|--------|---------------------|-----------|
| Kühlung (Hysterese) | `sensor` | `'hysteresis'` | `'template'` |
| Befeuchtung (Hysterese) | `sensor` | `'hysteresis'` | `'template'` |

Note: Template-Sektion heißt in der Kategorie-Liste `'template'`, aber die Items haben `type: 'sensor'` — identisch zu normalen Sensor-Conditions.

**Drag-Payload (Zeilen 240–261):**

```typescript
// MIME-Type: 'application/rulenode'
// Payload:
{
  type: item.type,         // z.B. 'sensor', 'actuator'
  label: item.label,       // z.B. 'Feuchtigkeit'
  defaults: item.defaults  // z.B. { sensorType: 'SHT31', operator: '<', value: 40 }
}
```

**Suchfunktion:** Filtert nach `label`, `description`, `type` (case-insensitive). Suche gilt kategorienübergreifend.

**Struktur:** Collapsible-Sektionen mit `<Transition name="palette-collapse">`. Collapse-State per `ref(false)` in-memory (kein localStorage).

### Bewertung

**Funktional identische Knoten (nur anderer `sensorType`-Default):**
- Sensor, Feuchtigkeit, pH-Wert, Licht, CO2, Bodenfeuchte, EC-Wert, Füllstand — ALLE 8 haben `type: 'sensor'`
- Der Unterschied liegt ausschließlich in `defaults.sensorType`
- Sobald der User einen ESP auswählt, wird `sensorType` aus dem echten Sensor-Dropdown überschrieben
- Die Defaults sind rein kosmetisch/convenience

**Genuinely eigenständige Knoten:**
- `time` — anderer Condition-Typ, eigene UI
- `diagnostics_status` — anderer Condition-Typ, eigene UI
- `logic` (AND/OR) — eigener Knoten-Typ
- `actuator`, `notification`, `delay`, `plugin`, `run_diagnostic` — Action-Typen

**Palette-Reduktion möglich:** Die 8 Sensor-Knoten könnten auf einen einzigen "Sensor"-Knoten reduziert werden. Der sensorType-Default-Trick bringt minimal Komfort (ESP-unabhängige Vorbelegung), erzeugt aber Verwirrung weil "Feuchtigkeit" und "Sensor" im Editor identisch aussehen.

---

## Block 2: RuleConfigPanel — Sensor-Bedingung

### Dateien & Zeilen

- `El Frontend/src/components/rules/RuleConfigPanel.vue`
- ESP-Dropdown: Zeilen 182–198, 323–335
- Sensor-Dropdown: Zeilen 201–228, 247–301, 338–390
- Operator-Dropdown: Zeilen 396–411
- Hysterese: Zeilen 413–465
- `between`: Zeilen 467–488
- Schwellwert: Zeilen 490–499

### Befunde

**ESP-Dropdown:**
- Befüllung: `espStore.devices.map(...)` — Computed `espDevices` (Zeilen 182–198)
- Wenn die gespeicherte `espId` nicht mehr im Store ist: Fallback-Eintrag `"${espId} (nicht gefunden)"` wird eingefügt
- ESP-Wechsel: `handleSensorEspChange()` → setzt `gpio: undefined`, `sensorType: ''`

**Sensor-Dropdown:**
- Device-aware: `availableSensors` computed (Zeilen 201–212) — filtert `device.sensors` nach gewähltem ESP
- Value-Format: `"gpio:sensorType"` (z.B. `"0:sht31_humidity"`) für Multi-Value-Disambiguierung
- Bei Multi-Value-Basistypen (SHT31, BME280): Warning-Hint angezeigt, User muss expliziten Subtyp wählen
- Fallback bei fehlendem ESP-Data: manuelle GPIO + Sensor-Typ Eingabe (Zeilen 362–389)

**Alle Operatoren** (Zeilen 84–93):

| interner Wert | Anzeige-Label | UI-Felder |
|--------------|---------------|-----------|
| `'>'` | `'größer als (>)'` | `value` |
| `'>='` | `'größer gleich (≥)'` | `value` |
| `'<'` | `'kleiner als (<)'` | `value` |
| `'<='` | `'kleiner gleich (≤)'` | `value` |
| `'=='` | `'gleich (=)'` | `value` |
| `'!='` | `'ungleich (≠)'` | `value` |
| `'between'` | `'zwischen (↔)'` | `min`, `max` |
| `'hysteresis'` | `'Hysterese (Ein/Aus-Schwellen)'` | `activateAbove`, `deactivateBelow`, `activateBelow`, `deactivateAbove` |

**Hysterese-UI im Detail** (Zeilen 413–465):

```
Kühlung (Ein wenn > X, Aus wenn < Y):
  - "Ein wenn > (Kühlung)" → updateField('activateAbove', ...)
  - "Aus wenn < (Kühlung)" → updateField('deactivateBelow', ...)

Heizung (Ein wenn < X, Aus wenn > Y):
  - "Ein wenn < (Heizung)" → updateField('activateBelow', ...)
  - "Aus wenn > (Heizung)" → updateField('deactivateAbove', ...)
```

- User KANN beide Modi (Kühlung + Heizung) gleichzeitig ausfüllen — keine gegenseitige Deaktivierung
- Leere Felder → `null` via `parseNumericOrNull()` (Zeile 154–156):
  ```typescript
  function parseNumericOrNull(value: string): number | null {
    return value === '' ? null : Number(value)
  }
  ```
- Isiert-Kennzeichnung via `isHysteresis: true` im Node-Data und/oder `operator: 'hysteresis'`

**Operator-Change-Handler** (Zeilen 400–411):
```typescript
@change="(e) => {
  const v = (e.target as HTMLSelectElement).value
  updateField('operator', v)
  updateField('isHysteresis', v === 'hysteresis')
}"
```
`isHysteresis` wird als Flag gesetzt wenn Operator zu `'hysteresis'` wechselt.

**Was passiert bei Nicht-Sensor-Knoten:** Jeder Node-Typ hat seinen eigenen `<template v-if="nodeType === '...'">` Block. Kein gemeinsames Rendering.

### Bewertung

- **Einseitiger Operator-Mechanismus:** Bei einfachen Operatoren (`>`, `<`, etc.) gibt es **kein Feld für eine Gegen-Aktion**. Kein Hinweis für den User dass "Temperatur > 28°C → Lüfter AN" bedeutet der Lüfter läuft ewig.
- **Hysterese-UI:** Beide Modi gleichzeitig ausfüllbar. Das ist technisch valid (Kühl- + Heizregelung), aber die UI erklärt nicht, dass bei gleichzeitig gefüllten Feldern **beide** `HysteresisCondition`-Felder an die API gesendet werden.
- **Kein "Automatisch"-Modus:** Kein Konzept von "ON wenn TRUE, OFF wenn FALSE" für einfache Operatoren.

---

## Block 3: RuleConfigPanel — Aktor-Aktion

### Dateien & Zeilen

- `El Frontend/src/components/rules/RuleConfigPanel.vue`
- Aktor-Section: Zeilen 575–673

### Befunde

**Felder:**

| Feld | UI-Element | Stored as | Zeile |
|------|-----------|-----------|-------|
| ESP-Gerät | `<select>` | `localData.espId` | 578–588 |
| Aktor | `<select>` (device-aware) | `localData.gpio` | 591–607 |
| Befehl | `<select>` | `localData.command` | 634–644 |
| PWM-Wert | `<input type="range">` (0-100%) | `localData.pwmValue` | 646–657 |
| Maximale Laufzeit | `<input type="number">` (Sekunden) | `localData.duration` | 659–672 |

**Commands** (Zeilen 113–118):

| value | label |
|-------|-------|
| `'ON'` | `'Einschalten (ON)'` |
| `'OFF'` | `'Ausschalten (OFF)'` |
| `'PWM'` | `'PWM-Wert setzen'` |
| `'TOGGLE'` | `'Umschalten (TOGGLE)'` |

**PWM-Feld:** Nur sichtbar wenn `command === 'PWM'` (Zeile 646). Slider 0–100, gespeichert als Integer `pwmValue`. In `graphToRuleData()` wird es als `pwmValue / 100` (0.0–1.0) an die API übergeben.

**Duration-Feld:** Kommentar in Zeilen 243–245:
```
// L3-FE-3: Duration vs. device safety limit warning — skipped.
// max_runtime_seconds is on MockActuatorConfig (sent during config push),
// not on MockActuator (live state in store). Would require extra API call.
```
→ Kein Vergleich mit Geräte-Limit implementiert.

**Bidirektionalität:** Kein "ON wenn Bedingung TRUE, OFF wenn FALSE" Konzept. User braucht zwei separate Aktor-Knoten mit ON und OFF Commands für bidirektionale Steuerung.

**Mehr Befehle pro Knoten:** Nicht möglich. Ein Knoten = ein Befehl.

### Bewertung

- Die Befehl-Auswahl ist klar. Das Grundproblem liegt nicht in der UI sondern im fehlenden Konzept.
- **Fehlender "Automatisch"-Modus:** "ON wenn Bedingung zutrifft, automatisch OFF wenn nicht" wäre das, was 90% der Nutzer wollen. Stattdessen müssen sie verstehen, dass sie zwei Knoten brauchen — oder Hysterese nutzen.
- **TOGGLE** ist für einfache Fälle gefährlich: Beim Neustart des Servers stimmt der Toggle-Zustand nicht mehr.

---

## Block 4: RuleFlowEditor — Graph-zu-Daten-Konvertierung (KERNANALYSE)

### Dateien & Zeilen

- `El Frontend/src/components/rules/RuleFlowEditor.vue`
- `graphToRuleData()`: Zeilen 613–740
- `ruleToGraph()`: Zeilen 382–608
- Watch/Load: Zeilen 744–772
- `onConnect`: Zeilen 323–360

### Befunde

---

#### `graphToRuleData()` — Graph → API-Payload (Zeilen 613–740)

**Signatur:**
```typescript
function graphToRuleData(): {
  conditions: LogicCondition[]
  actions: LogicAction[]
  logic_operator: 'AND' | 'OR'
}
```

**Algorithmus:**
```
Iteriert nodes.value (alle VueFlow-Nodes)
  switch node.type:
    'sensor':
      if isHysteresis → HysteresisCondition
      else → SensorCondition
    'time' → TimeCondition
    'logic' → setzt logicOperator = node.data.operator (letzte logic-Node gewinnt)
    'actuator' → ActuatorAction (pwmValue /100 → value 0.0–1.0)
    'notification' → NotificationAction
    'delay' → DelayAction
    'plugin' → PluginAction (merged cfg_* fields)
    'diagnostics_status' → DiagnosticsCondition
    'run_diagnostic' → DiagnosticsAction
```

**KRITISCHER BEFUND: Edges werden KOMPLETT IGNORIERT** (Zeile 622):
```typescript
for (const node of nodes.value) {   // ← nur nodes, kein edges
  switch (node.type) { ... }
}
```
`edges.value` wird in `graphToRuleData()` niemals gelesen. Die visuelle Verbindungsstruktur (welcher Sensor zu welchem Aktor) geht beim Speichern vollständig verloren. Das Backend bekommt nur eine flache Liste aller Conditions + alle Actions + globaler Operator.

**Hysterese-Serialisierung** (Zeilen 626–643):
```typescript
const hyst: HysteresisCondition = {
  type: 'hysteresis',
  esp_id: node.data.espId || '',
  gpio: node.data.gpio || 0,
  ...(node.data.sensorType ? { sensor_type: node.data.sensorType } : {}),
}
if (node.data.activateAbove != null && node.data.deactivateBelow != null) {
  hyst.activate_above = Number(node.data.activateAbove)
  hyst.deactivate_below = Number(node.data.deactivateBelow)
}
if (node.data.activateBelow != null && node.data.deactivateAbove != null) {
  hyst.activate_below = Number(node.data.activateBelow)
  hyst.deactivate_above = Number(node.data.deactivateAbove)
}
```
→ Beide Hysterese-Modi (Kühlung + Heizung) können gleichzeitig in einem einzigen `HysteresisCondition`-Objekt gespeichert werden.

**ActuatorAction-Serialisierung** (Zeilen 671–686):
```typescript
const cmd = (node.data.command || 'ON').toUpperCase()
const pwmVal = node.data.pwmValue !== undefined
  ? node.data.pwmValue / 100
  : (cmd === 'OFF' ? 0.0 : 1.0)
actions.push({
  type: 'actuator',
  esp_id: node.data.espId || '',
  gpio: node.data.gpio || 0,
  command: cmd,
  value: pwmVal,
  ...(node.data.duration ? { duration_seconds: node.data.duration } : { duration_seconds: 0 }),
})
```
→ `value` wird immer gesetzt (0.0 für OFF, 1.0 für ON, slider/100 für PWM).

**Validierung:** Keine Validierung in `graphToRuleData()`. Die Funktion sendet auch leere/unkonfigurierte Nodes (z.B. `esp_id: ''`, `gpio: 0`).

---

#### `ruleToGraph()` — API-Payload → Graph (Zeilen 382–608)

**Algorithmus:**
```
1. Für jede Condition in rule.conditions:
   - sensor/sensor_threshold → 'sensor'-Node bei x=50, y=60+row*140
   - time/time_window → 'time'-Node
   - hysteresis → 'sensor'-Node mit operator:'hysteresis', isHysteresis:true
   - diagnostics_status → 'diagnostics_status'-Node
   - compound → FLATTENING: Nur Sub-Conditions werden als einzelne Nodes gerendert

2. IMMER ein 'logic'-Node erstellen (ID: 'logic-0') bei x=350, y=avgY
   → logic_operator aus rule.logic_operator

3. Für ALLE condition-IDs: Edge condId → 'logic-0' erzeugen

4. sourceIds = ['logic-0']

5. Für jede Action in rule.actions:
   - actuator → 'actuator'-Node bei x=650
   - notification → 'notification'-Node
   - delay → 'delay'-Node
   - plugin → 'plugin'-Node (cfg_* Expansion)
   - run_diagnostic → 'run_diagnostic'-Node
   
   Für jede sourceId: Edge sourceId → actionId erzeugen
```

**KRITISCHER BEFUND: Edges werden SYNTHETISIERT, nicht aus Daten geladen.**
- Beim Laden: ALLE Conditions werden mit dem einzigen Logic-Gate verbunden
- Das Logic-Gate wird mit ALLEN Actions verbunden
- Es ist eine fixe Stern-Topologie (Star-topology): alle → 1 → alle
- Keine Edge-Daten werden vom Server geladen (weil keine gespeichert werden)

**Positionen:** Werden neu berechnet, nicht gespeichert (kein `position`-Feld in der API).

**Compound-Conditions:** Werden beim Laden FLACHGEMACHT (Zeilen 462–487). Nur Sub-Conditions werden als individuelle Nodes dargestellt. Die Compound-Hierarchie geht verloren.

---

#### VueFlow-Integration

- VueFlow-Version: `@vue-flow/core` (aus den Imports)
- Verwendete VueFlow-Features: Nodes, Edges, Handles, Custom Node Templates (`#node-sensor`, `#node-time`, etc.), Background, Controls, MiniMap, `useVueFlow()` composable
- **Custom Node-Typen** (als VueFlow Slot-Templates, nicht externe Komponenten):
  - `#node-sensor` — mit einzelnem Source-Handle rechts
  - `#node-time` — mit einzelnem Source-Handle rechts
  - `#node-logic` — mit Target-Handle links und Source-Handle rechts
  - `#node-actuator` — mit einzelnem Target-Handle links
  - `#node-notification` — mit einzelnem Target-Handle links
  - `#node-delay` — mit einzelnem Target-Handle links
  - `#node-plugin` — mit einzelnem Target-Handle links
  - `#node-diagnostics_status` — mit einzelnem Source-Handle rechts
  - `#node-run_diagnostic` — mit einzelnem Target-Handle links

**Handles pro Node-Typ:**

| Node-Typ | Target-Handle | Source-Handle |
|----------|--------------|---------------|
| sensor | — | rechts |
| time | — | rechts |
| diagnostics_status | — | rechts |
| logic | links | rechts |
| actuator | links | — |
| notification | links | — |
| delay | links | — |
| plugin | links | — |
| run_diagnostic | links | — |

→ **Kein Routing möglich über Handle-System.** Jeder Knoten hat maximal 1 Output-Handle und 1 Input-Handle.

**Verbindungs-Validierung** (`isValidConnection()` in logic.store.ts, Zeilen 610–633):
```typescript
// Geblockt:
// - Selbst-Schleifen
// - actuator/notification als Source
// - sensor/time → actuator/notification direkt (muss durch logic)
// Erlaubt: alles andere
```

**Save/Load API** (über `logicStore` → `logicApi`):
- Speichern: `POST /logic/rules` oder `PUT /logic/rules/{id}` mit `{ name, conditions, logic_operator, actions, ... }`
- Kein Edge-Feld in der Payload
- Laden: `GET /logic/rules/{id}` → `LogicRule` → `ruleToGraph()` → synthetisierte Edges

### Bewertung

- **Informationsverlust bei Save → Load:** Edge-Topologie, Node-Positionen, Compound-Hierarchie — alles verloren
- **Root-Cause Multi-Node-Bug:** Da `graphToRuleData()` Edges ignoriert, wird die visuelle "welcher Sensor zu welchem Aktor"-Zuordnung niemals serialisiert. Backend bekommt flache Listen und verbindet alles mit allem.
- **Erweiterbarkeit für Edge-Routing:** Technisch möglich — `edges.value` enthält alle Daten (`source`, `target`, `sourceHandle`, `targetHandle`). Aufwand: (1) Edge-Daten in API-Payload aufnehmen (neues Feld `graph_layout`), (2) Backend speichert es opak, (3) `ruleToGraph()` nutzt gespeicherte Edges statt zu synthetisieren.
- **Action-Routing:** Würde erfordern, dass pro Condition-Action-Verbindung eine separate Regel oder ein Sub-Rule-System entsteht. Nicht trivial mit dem aktuellen flachen Datenmodell.

---

## Block 5: TypeScript-Typen (logic.ts)

### Dateien & Zeilen

- `El Frontend/src/types/logic.ts` — 360 Zeilen

### Befunde

**`LogicRule` Interface** (Zeilen 14–30):
```typescript
interface LogicRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  conditions: LogicCondition[]    // Flat array
  logic_operator: 'AND' | 'OR'   // ONE global operator
  actions: LogicAction[]
  priority: number
  cooldown_seconds?: number
  max_executions_per_hour?: number
  last_triggered?: string
  execution_count?: number
  last_execution_success?: boolean | null
  created_at: string
  updated_at: string
}
```
→ **Kein `graph_edges` Feld, kein Routing-Feld**, kein `node_positions` Feld.

**`LogicCondition` Union Type** (Zeile 36):
```typescript
type LogicCondition =
  | SensorCondition
  | TimeCondition
  | HysteresisCondition
  | CompoundCondition
  | DiagnosticsCondition
```

**`SensorCondition`** (Zeilen 38–48):
```typescript
interface SensorCondition {
  type: 'sensor' | 'sensor_threshold'
  esp_id: string
  gpio: number
  sensor_type: string
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between'
  value: number
  min?: number
  max?: number
  subzone_id?: string | null
}
```
→ `operator` ist `KEIN 'hysteresis'` — Hysterese hat einen eigenen Typ.

**`HysteresisCondition`** (Zeilen 57–66):
```typescript
interface HysteresisCondition {
  type: 'hysteresis'
  esp_id: string
  gpio: number
  sensor_type?: string
  activate_above?: number     // Kühlung: Ein wenn > X
  deactivate_below?: number   // Kühlung: Aus wenn < Y
  activate_below?: number     // Heizung: Ein wenn < X
  deactivate_above?: number   // Heizung: Aus wenn > Y
}
```
→ **Alle 4 Schwellwert-Felder optional.** Ein leeres `HysteresisCondition`-Objekt ist TypeScript-valide, aber semantisch sinnlos.

**`TimeCondition`** (Zeilen 51–55):
```typescript
interface TimeCondition {
  type: 'time_window' | 'time'
  start_hour: number
  end_hour: number
  days_of_week?: number[]   // 0=Mo, 6=So (ISO 8601)
}
```

**`CompoundCondition`** (Zeilen 68–72):
```typescript
interface CompoundCondition {
  type: 'compound'
  logic: 'AND' | 'OR'
  conditions: LogicCondition[]  // Rekursiv
}
```
→ Theoretisch verschachtelbar. Praktisch: Frontend flacht es beim Laden ab (Block 4).

**`DiagnosticsCondition`** (Zeilen 74–79):
```typescript
interface DiagnosticsCondition {
  type: 'diagnostics_status'
  check_name: string
  expected_status: 'healthy' | 'warning' | 'critical' | 'error'
  operator?: '==' | '!='
}
```

**`LogicAction` Union Type** (Zeile 85):
```typescript
type LogicAction =
  | ActuatorAction
  | NotificationAction
  | DelayAction
  | PluginAction
  | DiagnosticsAction
```

**`ActuatorAction`** (Zeilen 87–95):
```typescript
interface ActuatorAction {
  type: 'actuator' | 'actuator_command'
  esp_id: string
  gpio: number
  command: 'ON' | 'OFF' | 'PWM' | 'TOGGLE'
  value?: number            // PWM 0.0–1.0
  duration?: number         // Alias (Frontend)
  duration_seconds?: number // Backend-Feldname
}
```
→ Zwei Aliase für dasselbe Feld (`duration` / `duration_seconds`).

**`extractSensorConditions()`** (Zeilen 306–328):
```typescript
export function extractSensorConditions(conditions: LogicCondition[]): SensorCondition[]
```
- Rekursiv durch Compound-Conditions
- Hysterese-Conditions werden zu synthetischen `SensorCondition` gemappt (`operator: '>'`, `value: activate_above ?? activate_below ?? 0`)
- Wird in `extractConnections()` und `extractEspIdsFromRule()` genutzt

**Kein Edge-Routing im Type-System:** Weder in `LogicRule`, `LogicCondition` noch `LogicAction` gibt es ein Feld für die Graph-Topologie.

### Bewertung

- **Type-System ist streng genug für das aktuelle Modell.** TypeScript erkennt fehlende Required-Fields.
- **`HysteresisCondition` zu locker:** Alle Schwellwert-Felder optional — ein komplett leeres Objekt ist valide.
- **Doppelte Aliase:** `duration` vs. `duration_seconds` in `ActuatorAction` — historisches Relikt, potentielle Quelle für Off-by-one Bugs.
- **Kein Routing-Typ:** Für Action-Routing müsste ein neues Feld wie `graph_layout?: { edges: Array<{source: string, target: string}> }` in `LogicRule` ergänzt werden (optional, rückwärtskompatibel).

---

## Block 6: Logik-Verknüpfung (Compound/AND/OR)

### Dateien & Zeilen

- `RuleFlowEditor.vue`, Zeilen 490–514 (`ruleToGraph`), 667–669 (`graphToRuleData`)
- `RuleConfigPanel.vue`, Zeilen 545–572 (Logic-Config-UI)
- `logic.store.ts`, Zeilen 610–633 (`isValidConnection`)

### Befunde

**Darstellung des AND/OR-Knotens:**
- Separater Node-Typ `'logic'` auf der Canvas (nicht eine Eigenschaft der Regel)
- Visuell: kleines Gate mit AND/OR Label, `GitMerge`-Icon
- Handles: Target links (empfängt Conditions), Source rechts (sendet zu Actions)

**Anzahl Logic-Knoten:**
- Beliebig viele Logic-Knoten platzierbar (UI blockiert es nicht)
- `graphToRuleData()` extrahiert nur den **letzten** Logic-Knoten im Array (Zeile 667–669):
  ```typescript
  case 'logic':
    logicOperator = node.data.operator || 'AND'
    break
  ```
  → Bei mehreren Logic-Knoten gewinnt der zuletzt iterierte. Welcher das ist hängt von `nodes.value` Reihenfolge ab (undeterministisch aus User-Sicht).

**Default ohne Logic-Knoten:**
- `logicOperator` initialisiert mit `'AND'` (Zeile 620)
- Wenn kein Logic-Knoten auf der Canvas: `logic_operator: 'AND'` wird trotzdem an die API gesendet

**Compound-Ausdruck `(A AND B) OR C`:**
- **NICHT MÖGLICH** mit dem aktuellen Modell
- `LogicRule.logic_operator` ist ein einziger globaler String
- `CompoundCondition` existiert im Type-System (Zeilen 68–72), aber das Frontend-Editor hat keinen Knoten-Typ dafür
- `ruleToGraph()` flacht Compound-Conditions ab (Zeile 462–487): Die Hierarchie geht beim Laden verloren

**Edges zum AND/OR-Knoten:**
- Edges werden beim Speichern ignoriert (Block 4 — `graphToRuleData()` liest keine Edges)
- Der Logic-Knoten dient im Frontend nur als visueller Platzhalter/Router
- Tatsächliche AND/OR-Semantik kommt von `rule.logic_operator`, nicht von den Edges

**Verbindungs-Einschränkungen** (`isValidConnection`, Zeile 627):
```typescript
// sensor/time → actuator/notification direkt = VERBOTEN
// Muss durch logic gehen
if ((sourceNodeType === 'sensor' || sourceNodeType === 'time') &&
    (targetNodeType === 'actuator' || targetNodeType === 'notification')) {
  return { valid: false, reason: '...' }
}
```
→ Diese Regel erzwingt den Logic-Knoten als Zwischenstation, ist aber rein visuell. Da Edges ignoriert werden hat sie keinen Einfluss auf die gespeicherten Daten.

### Bewertung

- **AND/OR-System für nicht-technische User:** Visuell verständlich — BUT: Multiple Logic-Knoten führen zu undefiniertem Verhalten. Der letzte Logic-Knoten im Array gewinnt still.
- **Gaertner-Szenarien:** Ein flaches `AND` (alle müssen zutreffen) oder `OR` (eine reicht) deckt 80% der typischen Fälle ab. Nur komplexe Szenarien (z.B. `(Temp > 28 OR CO2 > 1000) AND Zeitfenster`) würden verschachtelte Logik brauchen.
- **Ausreichend:** Ein flaches AND/OR mit globalem Operator reicht für die meisten Gaertner-Szenarien.

---

## Block 7: Edge-Handling und Graph-Topologie

### Dateien & Zeilen

- `RuleFlowEditor.vue`
- `onConnect`: Zeilen 323–360
- Edges in `ruleToGraph()`: Zeilen 503–595
- Handle-Deklarationen: Template, Zeilen 1026, 1081, 1111–1112, 1127, 1161, 1187, 1209, 1229, 1253

### Befunde

**Edge-Erstellung (`onConnect`, Zeilen 323–360):**
```typescript
onConnect((connection: Connection) => {
  // 1. Validierung via logicStore.isValidConnection()
  // 2. Wenn valid: addEdges([{ id, source, target, sourceHandle, targetHandle, animated, type, markerEnd }])
  // 3. logicStore.pushToHistory(nodes, edges)  ← Edges werden in der History gespeichert!
})
```

**Edge-Daten-Struktur:**
```typescript
{
  id: `e-${source}-${target}-${Date.now()}`,
  source: string,           // Node-ID der Quelle
  target: string,           // Node-ID des Ziels
  sourceHandle?: string,    // Handle-ID (meist null/undefined — nur ein Handle pro Seite)
  targetHandle?: string,    // Handle-ID (meist null/undefined)
  animated: true,
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
}
```

**Handles pro Node:**

| Node-Typ | Handles |
|----------|---------|
| sensor | 1x Source (rechts) |
| time | 1x Source (rechts) |
| diagnostics_status | 1x Source (rechts) |
| logic | 1x Target (links) + 1x Source (rechts) |
| actuator | 1x Target (links) |
| notification | 1x Target (links) |
| delay | 1x Target (links) |
| plugin | 1x Target (links) |
| run_diagnostic | 1x Target (links) |

→ **Kein Multi-Handle.** Jeder Knoten hat maximal einen Input- und einen Output-Port.

**Werden Edge-Daten gespeichert?**
- In der **Undo-History** (logic.store.ts `pushToHistory`): JA — `edges` werden als Teil des Snapshots gespeichert (`JSON.parse(JSON.stringify(edges.value))`)
- In der **API-Payload** (`graphToRuleData()`): NEIN — Edges werden nicht gelesen
- In der **Datenbank** (via REST API): NEIN

**Edge-Typen:** Keine spezifischen Edge-Typen wie `condition-to-logic` oder `logic-to-action`. Alle Edges sind `'smoothstep'`.

**Edge-Labels:** Keine Labels auf Edges.

**Direkte Sensor → Aktor Verbindung:**
- UI-Validierung: `isValidConnection()` blockiert es — Toast-Warning erscheint
- Wenn trotzdem versucht (z.B. bei Lade-Fehler): Wird geblockt

**VueFlow Edge-Export:**
- VueFlow bietet Standard-Unterstützung für Edge-Export via `edges.value` (verfügbar in `useVueFlow()`)
- Das ist bereits **in Verwendung für die Undo-History** (edges werden gespeichert und restored)
- Aufwand für API-Integration: Gering. `edges.value` müsste nur in `graphToRuleData()` gelesen und in den API-Payload aufgenommen werden.

### Bewertung

- **Edge-Daten sind vorhanden und werden für Undo verwendet**, aber niemals zur API gesendet
- **Aufwand für Edge-Routing in API:** ~4 Stunden. Kein grundlegendes Redesign nötig:
  1. `graphToRuleData()` ergänzen um `edges: edges.value.map(e => ({ source: e.source, target: e.target }))` 
  2. `LogicRule` um optionales `graph_layout?: { edges: Array<{source, target}> }` erweitern
  3. Backend speichert es opak (JSON-Feld)
  4. `ruleToGraph()` nutzt gespeicherte Edges wenn vorhanden, synthetisiert sonst (Rückwärtskompatibilität)
- **Edge-Properties für Routing:** Reichen für Identifizierung aus (`source` und `target` Node-ID). Handle-IDs wären für Erweiterungen nützlich.

---

## Nicht-dokumentierte Dateien in `components/rules/`

Zwei Dateien existieren, die im Auftrag nicht erwähnt waren:

**`RuleCard.vue`** — Liste der gespeicherten Regeln in der LogicView-Seitenleiste (Regel-Karten mit Name, Status-Toggle, Konditions-Summary via `formatConditionShort()`).

**`RuleTemplateCard.vue`** — Zeigt vorkonfigurierte Regel-Templates aus `src/config/rule-templates.ts` an. Beim Klick: `'use-template'`-Event an LogicView → `loadFromRuleData()` in RuleFlowEditor.

**`src/config/rule-templates.ts`** — 6 vorkonfigurierte Templates:
- `temp-alarm`: Temperatur > 30 → Aktor AN
- `irrigation-schedule`: Zeitfenster + Bodenfeuchte < 30 → Pumpe AN
- Weitere: Hysterese-Kühlung, Nacht-Abschaltung, pH-Alarm, Sicherheits-Check

---

## Zusammenfassung

### Was funktioniert gut

1. **Einzelne einfache Regel** (1 Sensor → Logic → 1 Aktor): Funktioniert korrekt. Genau das Szenario für das der Editor designed wurde.
2. **Hysterese-Templates:** Die vorkonfigurierten Templates `Kühlung (Hysterese)` und `Befeuchtung (Hysterese)` erzeugen valide `HysteresisCondition`-Objekte.
3. **Device-aware Dropdowns:** ESP → Sensor/Aktor-Dropdown mit Auto-Fill aus dem Store ist sauber implementiert.
4. **Undo/Redo:** Vollständig implementiert, inkl. Edge-Snapshot.
5. **VueFlow-Integration:** Custom Nodes, animierte Edges, Minimap, SnapToGrid — solide.
6. **Type-System:** Discriminated Union für Conditions und Actions — TypeScript erkennt Fehler gut.
7. **WebSocket Live-Feedback:** Logic-Execution-Events animieren Nodes beim Feuern einer Regel.

### Was ist problematisch

| # | Problem | Schwere | Ursache |
|---|---------|---------|---------|
| P1 | **Edges werden ignoriert** — `graphToRuleData()` liest nur Nodes, keine Edges | KRITISCH | Design-Entscheidung: Graph-Topologie wird nicht serialisiert |
| P2 | **Alle Aktionen feuern immer** — Bei N Sensoren + M Aktoren werden alle M Aktoren bei JEDER Condition ausgelöst | KRITISCH | Folge von P1: Backend bekommt flache Listen |
| P3 | **Einseitige Operatoren** — `>`, `<`, etc. haben keine OFF-Aktion. Aktor geht nie automatisch aus | HOCH | Fehlendes Konzept "bidirektionale Steuerung" |
| P4 | **Hysterese Dual-Modus** — Beide Felder (Kühlung + Heizung) gleichzeitig ausfüllbar, Backend-Priorisierung unklar | HOCH | UI erzwingt keine Exklusivität |
| P5 | **Multiple Logic-Knoten undeterministisch** — Letzter Knoten im Array gewinnt still | MITTEL | `graphToRuleData()` überschreibt `logicOperator` iterativ |
| P6 | **Compound-Hierarchie verloren** — `CompoundCondition` existiert im Type-System aber wird beim Laden flachgemacht | MITTEL | `ruleToGraph()` iteriert nur eine Ebene tief |
| P7 | **8 redundante Sensor-Knoten** — Alle `type: 'sensor'`, Unterschied nur `defaults.sensorType` | NIEDRIG | Usability-Problem, kein Bug |
| P8 | **Positionen nicht gespeichert** — Jede Regel-Last-Load resettet die Graph-Positionen | NIEDRIG | API-Layout-Feld fehlt |

### Empfehlung für R2/R3

**Für R2 (Datenmodell-Redesign):**

Das fundamentale Problem ist, dass `LogicRule` die **Kausalität** (welcher Sensor steuert welchen Aktor) nicht ausdrückt — nur eine flache Menge von Conditions und Actions. Das Backend evaluiert dann alle Conditions gegen alle Actions.

Zwei Optionen:
1. **Leichtgewichtig:** `graph_layout` Feld in `LogicRule` (optional, opak gespeicherter Edge-Graph). Frontend nutzt es für Visualisierung. Semantik bleibt flat. Löst P2 NICHT — aber löst P1/P5/P8.
2. **Grundlegend:** Neues Datenmodell mit expliziten Condition→Action-Mappings (jedes Mapping ist eine Sub-Rule). Löst P2. Erfordert Backend-Redesign.

**Für R3 (Frontend-Vereinfachung):**

1. **Palette reduzieren:** 8 Sensor-Knoten → 1 generischer "Sensor"-Knoten (P7)
2. **Bidirektionaler Aktor-Knoten:** Command "AUTO" hinzufügen: ON wenn Bedingung TRUE, OFF wenn FALSE (löst P3 ohne Backend-Änderung wenn als 2 Actions serialisiert)
3. **Hysterese-UI:** Cooling/Heating als Radio-Buttons (exklusiv) statt beide immer sichtbar (löst P4)
4. **Logic-Knoten limitieren:** Max. 1 Logic-Knoten per Regel erzwingen (löst P5)

---

**Akzeptanzkriterien-Check:**

- [x] Alle 7 Blöcke vollständig mit Datei:Zeile Referenzen
- [x] `graphToRuleData()` und `ruleToGraph()` exakt dokumentiert
- [x] Alle Condition-Typen und interne Darstellung aufgelistet
- [x] Alle Action-Typen und interne Darstellung aufgelistet
- [x] Edge-Handling geklärt: Was gespeichert wird (Undo-History), was verloren geht (API)
- [x] Hysterese-Felder und Serialisierung exakt dokumentiert
- [x] Palette-Einträge alle aufgelistet mit internem Typ-Namen
- [x] Bericht als Markdown abgelegt

---

*Ende R1-FE Analyse-Bericht.*
