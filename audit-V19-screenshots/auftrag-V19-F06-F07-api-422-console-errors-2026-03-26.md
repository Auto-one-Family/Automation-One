# V19-F06+F07 — API 422 Errors + TypeError bei Chart-Daten auf Monitor L2

> **Typ:** Bugfix (Frontend — API-Aufrufe + Fehlerbehandlung)
> **Erstellt:** 2026-03-26
> **Prioritaet:** MEDIUM
> **Geschaetzter Aufwand:** ~2-3h
> **Abhaengigkeit:** Keine

---

## Kontext

### Systemarchitektur

AutomationOne hat 3 Schichten: El Trabajante (ESP32 Firmware), El Servador (FastAPI Backend), El Frontend (Vue 3). Der Frontend-Stack ist Vue 3 + TypeScript + Pinia + Chart.js 4.x (vue-chartjs). NICHT ECharts.

Monitor L2 (`/monitor/:zoneId`) zeigt Inline-Dashboard-Panels mit Chart-Widgets. Diese Widgets rufen `GET /api/v1/sensors/data` auf um historische Zeitreihendaten zu laden.

### Sensordaten-Endpoint

`GET /api/v1/sensors/data` in `El Servador/god_kaiser_server/src/api/v1/sensors.py` (Zeile ~1219-1253).

**Pflichtparameter:** `esp_id` (String, z.B. `ESP_MOCK_E92BAA` — kein UUID-Format), `gpio` (int, 0-39), `sensor_type` (z.B. `sht31_temp`, `vpd`).

**Optionale Parameter:** `start_time` / `end_time` (ISO-8601), `resolution` (validiert per Regex `^(raw|1m|5m|1h|1d)$`), `quality`, `zone_id`, `subzone_id`, `sensor_config_id`, `limit` (1-1000), `before_timestamp`.

**Wichtig:** Die Parameter heissen `start_time` und `end_time` — NICHT `start` und `end`. Jeder unbekannte Query-Parameter loest ebenfalls einen 422 aus.

### sensorId-Format

Das Frontend nutzt das Format `espId:gpio:sensorType` als zusammengesetzten Bezeichner. Dieses Format wird durch `parseSensorId()` aus `El Frontend/src/composables/useSensorId.ts` geparst. Der Fallback fuer 2-teilige Legacy-IDs (nur `espId:gpio`) setzt `sensorType = null`. `parseSensorId()` gibt `{ isValid: false }` zurueck wenn der Input `undefined`, `null` oder unvollstaendig ist.

### Auto-Resolution

`El Frontend/src/utils/autoResolution.ts` berechnet automatisch den optimalen `resolution`-Parameter basierend auf dem gewaehlten Zeitbereich. Das funktioniert korrekt und darf nicht geaendert werden.

### Widget-Mount-Logik

`El Frontend/src/composables/useDashboardWidgets.ts` mountet Widgets in GridStack-Elemente und reicht `config.sensorId` als Prop durch. Kritischer Punkt in Zeile 239: `if (config.sensorId)` — ein leerer String `""` ist falsy und wird NICHT durchgereicht, was zum Prop-Default `""` im Widget fuehrt. Daraus resultieren Widgets mit leerer sensorId die trotzdem einen API-Call versuchen.

---

## IST-Zustand

Beim Laden von Monitor L2 erscheinen in der Browser-Console:

1. **F06:** `GET /api/v1/sensors/data → HTTP 422` "Request validation error". Die betroffenen Historical-Chart- und Multi-Sensor-Chart-Widgets zeigen danach "Keine Daten fuer den gewaehlten Zeitraum" oder "Noch keine Daten verfuegbar".

2. **F07:** `TypeError: Cannot read properties of undefined (reading ...)` aus `chunk-LNAROW3X.js` (Chart.js-Bundle). Tritt im Kontext eines Chart-Rendering-Vorgangs auf.

Der Fehler tritt NICHT bei allen Widgets auf — manche Charts laden korrekt, manche nicht. Das deutet auf ein Problem bei bestimmten Widget-Konfigurationen (ungueltige sensorId) oder bei bestimmten Request-Parametern.

Der Audit-Bericht (V19-F06) nennt als Verdacht: eine ungueltige `source`-Zeichenkette oder falsche Sensor-IDs in der Anfrage. Moeglicherweise werden auch verwaiste Widget-Konfigurationen von Auto-Dashboards geloeschter Zonen abgefragt — diese haben dann keine gueltige sensorId mehr.

---

## SOLL-Zustand

- Keine HTTP 422 Fehler beim normalen Navigieren durch Monitor L2 (Zone mit gueltigen Sensoren oeffnen).
- Kein TypeError in der Console beim Laden von Charts.
- Widgets mit ungueltiger oder fehlender sensorId senden KEINEN API-Request — stattdessen zeigen sie einen Hinweis: "Kein Sensor konfiguriert" oder "Widget-Konfiguration unvollstaendig".
- Widgets mit gueltiger sensorId zeigen korrekte Daten (keine Regression).
- `vue-tsc --noEmit` und `npm run build` laufen ohne Fehler durch.

---

## Analyse-Leitfaden

### F06: Root Cause des 422

**Schritt 1 — Request analysieren:**
Browser DevTools → Network → fehlgeschlagenen `GET /sensors/data` Request oeffnen. Die exakten Query-Parameter aus der Request-URL dokumentieren. Folgende Fehlerkandidaten pruefen:

- `esp_id` leer, `"undefined"`, oder `"null"` (String-Wert, nicht echter null)
- `gpio` ist kein Integer oder ausserhalb 0-39 (z.B. wird `"null"` oder `"undefined"` als String gesendet)
- `sensor_type` fehlt oder ist leer
- `start_time`/`end_time` ist kein gueltiges ISO-8601-Datum
- `resolution` hat einen Wert der nicht `raw|1m|5m|1h|1d` entspricht
- Ein unbekannter Parameter (`source` oder aehnlich) wird gesendet — das Backend validiert strikt

**Schritt 2 — sensorId pruefen:**
Wenn `parseSensorId()` auf eine ungueltige sensorId angewendet wird (`isValid: false`), enthalten `espId`, `gpio` oder `sensorType` `null`-Werte. Wenn diese direkt als Query-Parameter uebergeben werden (als String `"null"`), schlaegt die Backend-Validierung fehl.

**Schritt 3 — Guard vor dem API-Call:**
In den Widget-Komponenten (`HistoricalChartWidget.vue`, `MultiSensorWidget.vue`) und in `sensors.ts` pruefen, ob der API-Call mit validierten Parametern aufgerufen wird. Wenn `espId`, `gpio` oder `sensorType` null/leer/ungueltig sind: Request NICHT abschicken.

```typescript
// Beispiel-Guard vor dem API-Call
const { espId, gpio, sensorType, isValid } = parseSensorId(props.sensorId)
if (!isValid) {
  // Fehler-State setzen, KEIN API-Call
  error.value = 'Kein Sensor konfiguriert'
  return
}
```

### F07: TypeError absichern

**Situation im Code:**
`El Frontend/src/components/charts/HistoricalChart.vue` hat bereits einen Template-Guard (Zeile ~609-619):
- `v-if="loading"` → Lade-Anzeige
- `v-else-if="error"` → Error-Text
- `v-else-if="dataBuffer.length === 0"` → "Keine Daten"-Hinweis
- `v-else` → `<Line>`-Rendering

**Konsequenz:** Wenn der 422-Fehler im `catch`-Block korrekt als `error.value` gesetzt wird, sollte der `<Line>`-Component NICHT gerendert werden und kein TypeError auftreten.

**Zu pruefen — moegliche Race Conditions:**
- Wird der `catch`-Block im `fetch`-Flow auch bei 422-Responses aufgerufen? Axios wirft bei 4xx-Responses standardmaessig einen Error — pruefen ob das korrekt abgefangen wird.
- Gibt es einen Moment zwischen dem Start des Fetches und dem Setzen von `loading = true` wo ein Render-Cycle mit `undefined`-Daten auftreten kann?
- `MultiSensorChart.vue` hat per-Sensor Error-Handling (catch pro Sensor). Pruefen ob `chartData` nach einem fehlgeschlagenen Fetch `undefined` sein kann (statt `[]`) — das wuerde den TypeError erklaeren.

**Defensiver Guard falls noetig:**
```typescript
// In computed chartData — defensiv
const chartData = computed(() => {
  if (!sensorData.value || sensorData.value.length === 0) {
    return null
  }
  return transformToChartFormat(sensorData.value)
})
```

```html
<!-- Im Template: Chart nur rendern wenn Daten vorhanden -->
<Line v-if="chartData && chartData.datasets && chartData.datasets.length > 0" ... />
```

### Unterschied: Kein Sensor vs. Keine Daten

Diese Unterscheidung ist wichtig fuer die Fehlermeldung:
- **Ungueltige sensorId:** "Widget-Konfiguration unvollstaendig. Bitte Sensor auswaehlen." (Konfigurationsproblem)
- **Gueltiger Sensor, API-Fehler:** "Sensordaten konnten nicht geladen werden." (technisches Problem, nicht "keine Daten fuer diesen Zeitraum")
- **Gueltiger Sensor, leere Antwort:** "Keine Daten fuer den gewaehlten Zeitraum." (normale Situation)

---

## Vorgehen

**1. Reproduktion:**
Monitor L2 einer Zone mit Sensoren oeffnen. Console und Network-Tab beobachten. Alle 422-Requests dokumentieren (URL + Query-Params). Den Stack-Trace des TypeErrors vollstaendig notieren.

**2. F06 fixen — Request-Validierung:**
In `HistoricalChartWidget.vue` und `MultiSensorWidget.vue` pruefen wo `sensorsApi.queryData()` aufgerufen wird. Vor dem Call `parseSensorId(props.sensorId)` aufrufen und bei `isValid === false` den Call abbrechen und stattdessen einen Fehler-State setzen.

In `StatisticsWidget.vue` denselben Guard einbauen — dieses Widget nutzt `GET /sensors/{e}/{g}/stats` und hat moeglicherweise dasselbe Problem mit ungueltigen Parametern.

**3. F07 fixen — TypeError beseitigen:**
Den exakten Stack-Trace untersuchen. Wenn der Fehler aus `HistoricalChart.vue` kommt: sicherstellen dass der `catch`-Block bei 422 `error.value` setzt und `loading.value = false`. Wenn der Fehler aus `MultiSensorChart.vue` kommt: pruefen ob `chartData` nach einem fehlgeschlagenen Sensor-Fetch `undefined` sein kann.

Kein Einbau eines Guards wenn schon einer existiert — stattdessen den bestehenden Guard auf Luecken pruefen (Race Condition zwischen Fetch-Start und Loading-State).

**4. Verifikation:**
Monitor L2 oeffnen → Console muss frei von 422-Fehlern und TypeErrors sein. Widget mit absichtlich leerer sensorId → muss "Konfiguration unvollstaendig" zeigen, kein Network-Request.

---

## Relevante Dateien

| Bereich | Datei |
|---------|-------|
| Sensordaten-API-Call | `El Frontend/src/api/sensors.ts` (Methode: `sensorsApi.queryData()`) |
| sensorId-Parser | `El Frontend/src/composables/useSensorId.ts` (`parseSensorId()` pure function) |
| Auto-Resolution | `El Frontend/src/utils/autoResolution.ts` |
| HistoricalChart | `El Frontend/src/components/charts/HistoricalChart.vue` |
| MultiSensorChart | `El Frontend/src/components/charts/MultiSensorChart.vue` |
| HistoricalChartWidget | `El Frontend/src/components/dashboard-widgets/HistoricalChartWidget.vue` (Wrapper) |
| MultiSensorWidget | `El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue` (nutzt `parseSensorId()`) |
| StatisticsWidget | `El Frontend/src/components/dashboard-widgets/StatisticsWidget.vue` (nutzt `getStats`) |
| Widget-Mount-Logik | `El Frontend/src/composables/useDashboardWidgets.ts` (Zeile 239: `if (config.sensorId)` guard) |
| InlineDashboardPanel | `El Frontend/src/components/dashboard/InlineDashboardPanel.vue` |
| SensorDataQuery Type | `El Frontend/src/types/index.ts` (Zeile ~757: Interface mit `start_time`/`end_time`) |
| Backend Sensor-Data-Endpoint | `El Servador/god_kaiser_server/src/api/v1/sensors.py` (GET `/data`, Zeile ~1219-1253) |

---

## Was NICHT geaendert werden darf

- Die Backend-Validierung fuer den `/sensors/data` Endpoint — der 422-Response ist korrekt. Ungueltige Parameter muessen clientseitig verhindert werden, nicht serverseitig toleriert.
- Die `autoResolution.ts` Logik — funktioniert korrekt.
- Das sensorId-Format `espId:gpio:sensorType` — ist der Standard.
- Das bestehende `v-if/v-else-if/v-else` Template-Guard-Muster in `HistoricalChart.vue` — erweitern falls noetig, nicht ersetzen.

---

## Akzeptanzkriterien

- [ ] Monitor L2 einer Zone mit gueltigen Sensoren oeffnen → keine HTTP 422 Fehler in der Console
- [ ] Monitor L2 oeffnen → kein `TypeError: Cannot read properties of undefined` in der Console
- [ ] Widget mit leerer oder fehlender sensorId zeigt "Widget-Konfiguration unvollstaendig" (oder aehnlich) und sendet keinen API-Request (pruefbar im Network-Tab: kein Request mit `esp_id=undefined` oder `esp_id=null`)
- [ ] Widget mit gueltiger sensorId eines Sensors mit vorhandenen Messdaten zeigt korrekte Chart-Daten (keine Regression)
- [ ] `vue-tsc --noEmit` und `npm run build` ohne Fehler
