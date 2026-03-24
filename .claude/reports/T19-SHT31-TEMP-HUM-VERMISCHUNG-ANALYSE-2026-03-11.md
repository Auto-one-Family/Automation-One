# T-19: SHT31 Temp/Hum Vermischung im Logic-Editor — Analysebericht

**Datum:** 2026-03-11  
**Typ:** Analyse (kein Fix)  
**Priorität:** HOCH (Blocker für Hysterese)  
**Bezug:** T18-V6 Hysterese-Test, Auftrag 8.1, Screenshots T-19 (image.png bis image5.png)

---

## 1. Executive Summary

**Root Cause:** Der Logic-Editor (RuleConfigPanel) bietet bei Multi-Value-Sensoren (SHT31) **keine saubere Trennung** zwischen `sht31_temp` und `sht31_humidity`. Die Sensor-Auswahl verwendet `gpio` als Dropdown-Key und -Value — bei zwei Sensoren auf demselben GPIO (temp + humidity) entstehen Duplikate, und `selectSensor()` wählt immer den **ersten** Treffer. Zusätzlich bietet der manuelle Fallback nur `"SHT31"`, nicht die Subtypen. Die Logic Engine und der HysteresisConditionEvaluator arbeiten korrekt; das Problem liegt ausschließlich im Frontend-Editor.

---

## 2. Gold-Standard-Pfade (funktionieren korrekt)

### 2.1 Monitor L2 — SensorCards „Temp&Hum (Temperatur)“ vs „Temp&Hum (Luftfeuchte)“

| Komponente | Datei | Logik |
|------------|-------|-------|
| Zone Monitor API | Server liefert Subzones mit Sensoren | Jeder Sensor hat `esp_id`, `gpio`, `sensor_type` (sht31_temp, sht31_humidity getrennt) |
| zoneDeviceGroup | `MonitorView.vue` L1159–1205 | `sz.sensors` enthält pro Eintrag `sensor_type` |
| groupSensorsByBaseType | `sensorDefaults.ts` L1116–1192 | Gruppiert nach `sensor_type`; Multi-Value: `sht31_temp` → „Temperatur“, `sht31_humidity` → „Luftfeuchte“ |
| getSensorDisplayName | `sensorDefaults.ts` L897–906 | `{ sensor_type: 'sht31_temp', name: 'Temp&Hum' }` → „Temp&Hum (Temperatur)“ |

**Kern:** Die Monitor-Daten kommen von der Zone-API mit bereits getrennten `sensor_type`-Einträgen. `groupSensorsByBaseType` und `getSensorDisplayName` nutzen `sensor_type` für die Anzeige.

### 2.2 Diagramm „Vergleichen mit“ — Detail-Modal

| Komponente | Datei | Logik |
|------------|-------|-------|
| availableOverlaySensors | `MonitorView.vue` L469–490 | Iteriert `sz.sensors`; Key: `s.config_id` oder `${esp_id}-${gpio}-${sensor_type}` |
| sensorsApi.queryData | `MonitorView.vue` L521–526 | Übergibt `sensor_type: sensorType` für Multi-Value-Filter |
| HistoricalChart | `HistoricalChart.vue` L248 | Filtert nach `sensor_type` — verhindert Cross-Type-Updates |

**Kern:** Der Key enthält `sensor_type`; die API erhält `sensor_type` für präzise Abfragen.

### 2.3 Logic Engine (Backend)

| Komponente | Datei | Logik |
|------------|-------|-------|
| get_rules_by_trigger_sensor | `logic_repo.py` L58–126 | Filtert nach `esp_id`, `gpio` **und** `sensor_type` (Zeile 121: `cond_sensor_type == sensor_type_lower`) |
| _load_cross_sensor_values | `logic_engine.py` L874–990 | Verwendet `esp_id:gpio:sensor_type` als Key; `sensor_repo.get_latest_reading(..., sensor_type=sensor_type)` |
| HysteresisConditionEvaluator | `hysteresis_evaluator.py` L237–264 | `_matches_sensor()` prüft `sensor_type` (optional, case-insensitive) |

**Kern:** Die Engine trennt `sht31_temp` und `sht31_humidity` korrekt. Regeln mit `sensor_type: "sht31_humidity"` werden nur bei `sht31_humidity`-Triggern ausgewertet.

---

## 3. Editor-Pfade (Problematisch)

### 3.1 RuleConfigPanel — Sensor-Dropdown

**Datei:** `El Frontend/src/components/rules/RuleConfigPanel.vue`

| Zeile | Code | Problem |
|-------|------|---------|
| 184–191 | `availableSensors` | Mappt `device.sensors` → `{ gpio, sensorType, label }` — korrekt, wenn API zwei Einträge liefert |
| 296 | `:value="s.gpio"` | **Dropdown-Value = GPIO** — bei SHT31 zwei Einträge mit gleichem `gpio` |
| 295 | `:key="s.gpio"` | **Duplicate Keys** — Vue rendert nur einen Eintrag pro GPIO |
| 231 | `selectSensor(value)` | `value` ist GPIO; `find(s => s.gpio === gpio)` liefert **ersten** Treffer |

**Folge:** Bei `device.sensors = [{ gpio: 0, sensor_type: 'sht31_temp' }, { gpio: 0, sensor_type: 'sht31_humidity' }]` erscheint nur ein Dropdown-Eintrag (Key-Kollision), und bei Auswahl wird immer der erste Sensor (`sht31_temp`) gesetzt — nie `sht31_humidity`.

### 3.2 Manueller Fallback — sensorTypeOptions

**Datei:** `RuleConfigPanel.vue` L94–105

```ts
{ value: 'SHT31', label: 'SHT31 (Temp + Feuchte)' }
```

**Problem:** Es gibt nur einen Eintrag `SHT31`, keine Optionen für `sht31_temp` oder `sht31_humidity`. Wenn der User manuell eingibt (keine Sensoren vom ESP), wird `sensor_type: "SHT31"` gespeichert. Die Logic Engine matcht `"sht31"` (lowercase) nicht mit `"sht31_humidity"` — Regel wird bei Luftfeuchtigkeits-Trigger **nicht** gefunden.

### 3.3 RuleFlowEditor — SENSOR_CONFIG

**Datei:** `RuleFlowEditor.vue` L133–144

```ts
SHT31: { icon: Droplets, unit: '%', label: 'Luftfeuchte' }
```

**Problem:** Nur ein Eintrag für SHT31; keine Einträge für `sht31_temp` oder `sht31_humidity`. Die Node-Anzeige zeigt immer „Luftfeuchte“ und `%`, auch wenn die Regel `sht31_temp` nutzt.

### 3.4 graphToRuleData — Hysteresis

**Datei:** `RuleFlowEditor.vue` L618–627

```ts
const hyst: HysteresisCondition = {
  type: 'hysteresis',
  esp_id: node.data.espId || '',
  gpio: node.data.gpio || 0,
  ...(node.data.sensorType ? { sensor_type: node.data.sensorType as string } : {}),
}
```

**Bewertung:** `sensor_type` wird korrekt aus `node.data.sensorType` übernommen. Das Problem ist, dass `node.data.sensorType` im Editor falsch gesetzt wird (siehe 3.1, 3.2).

### 3.5 ruleToGraph — Hysteresis laden

**Datei:** `RuleFlowEditor.vue` L421–440

```ts
sensorType: hc.sensor_type || 'hysteresis',
```

**Bewertung:** Lädt `sensor_type` korrekt aus der API-Response. Wenn die Regel korrekt `sht31_humidity` enthält, wird sie korrekt in den Node übernommen. Das Problem ist die **Erstellung** neuer Regeln im Editor.

---

## 4. Hypothesen-Prüfung

| # | Hypothese | Ergebnis |
|---|-----------|----------|
| H1 | Editor zeigt nur einen Eintrag „Temp&Hum“ pro GPIO | **Bestätigt** — Dropdown nutzt `gpio` als Key/Value; Duplikate kollidieren |
| H2 | Editor speichert `sensor_type: "sht31"` oder `sensor_name` | **Teilweise** — Manueller Fallback speichert `"SHT31"`; Device-Dropdown speichert `sensor_type` des ersten Treffers (oft `sht31_temp`) |
| H3 | `get_by_esp_and_gpio` findet 2 Configs und liefert nur eine | **Nicht relevant** — Die API liefert beide; das Problem ist die Frontend-Dropdown-Logik |
| H4 | Logic Engine matcht nur auf `esp_id` + `gpio` | **Widerlegt** — `get_rules_by_trigger_sensor` filtert explizit nach `sensor_type` (Zeile 121) |

---

## 5. Root Cause — Zusammenfassung

1. **Dropdown-Key/Value = GPIO:** Bei Multi-Value-Sensoren (SHT31) haben zwei Sensoren denselben GPIO. Das Dropdown kann sie nicht unterscheiden; Vue zeigt nur einen Eintrag, `selectSensor` wählt den ersten.
2. **Manueller Fallback:** `sensorTypeOptions` enthält nur `"SHT31"`, nicht `sht31_temp`/`sht31_humidity`. Regeln mit `sensor_type: "SHT31"` matchen nicht mit MQTT-`sht31_humidity`.
3. **SENSOR_CONFIG:** RuleFlowEditor hat keine Einträge für `sht31_temp`/`sht31_humidity`; Anzeige ist immer „Luftfeuchte“/`%`.

---

## 6. Chirurgische Fix-Vorschläge

### 6.1 RuleConfigPanel — Sensor-Dropdown (Priorität 1)

**Änderung:** Dropdown-Key und -Value auf `gpio:sensor_type` (oder eindeutigen Key) umstellen.

- **Key:** `:key="\`${s.gpio}-${s.sensorType}\`"` (oder `s.config_id` falls vorhanden)
- **Value:** `:value="\`${s.gpio}:${s.sensorType}\`"` (z.B. `"0:sht31_humidity"`)
- **selectSensor:** `value` parsen → `gpio` und `sensorType` extrahieren; `find(s => s.gpio === gpio && s.sensorType === sensorType)`

**Datei:** `RuleConfigPanel.vue` L286–303, L224–236

### 6.2 sensorTypeOptions — Multi-Value-Subtypen (Priorität 2)

**Änderung:** Für SHT31 und BME280 die Subtypen ergänzen:

```ts
{ value: 'sht31_temp', label: 'SHT31 Temperatur (°C)' },
{ value: 'sht31_humidity', label: 'SHT31 Luftfeuchtigkeit (%RH)' },
```

Optional: Diese nur im manuellen Fallback anzeigen, wenn der Device-Dropdown keine Sensoren hat.

**Datei:** `RuleConfigPanel.vue` L94–105

### 6.3 RuleFlowEditor — SENSOR_CONFIG erweitern (Priorität 3)

**Änderung:** Einträge für Subtypen hinzufügen:

```ts
sht31_temp:    { icon: Thermometer, unit: '°C',  label: 'Temperatur' },
sht31_humidity:{ icon: Droplets,    unit: '%RH', label: 'Luftfeuchte' },
```

**Datei:** `RuleFlowEditor.vue` L133–144

### 6.4 Fallback: Bestehende Regeln mit „SHT31“

Regeln, die bereits `sensor_type: "SHT31"` gespeichert haben, werden von der Engine nicht getroffen. Optionen:

- **Migration:** Beim Laden einer Regel `"SHT31"` → `"sht31_humidity"` mappen (Heuristik: Hysterese mit %-Schwellen → humidity)
- **Hinweis:** Im Editor Warnung anzeigen, wenn `sensor_type` ein Base-Type ist (SHT31, BME280) und zur Subtyp-Auswahl auffordern

---

## 7. Referenz-Dateien

| Bereich | Datei | Relevante Zeilen |
|---------|-------|-----------------|
| Editor Sensor-Dropdown | `RuleConfigPanel.vue` | 179–191, 224–236, 286–303, 94–105 |
| graphToRuleData | `RuleFlowEditor.vue` | 612–639 |
| ruleToGraph | `RuleFlowEditor.vue` | 421–440 |
| SENSOR_CONFIG | `RuleFlowEditor.vue` | 133–144 |
| get_rules_by_trigger_sensor | `logic_repo.py` | 58–126 |
| _load_cross_sensor_values | `logic_engine.py` | 874–990 |
| HysteresisConditionEvaluator | `hysteresis_evaluator.py` | 237–264 |
| Monitor/Dashboard | `sensorDefaults.ts` | 1116–1192, 897–906, MULTI_VALUE_DEVICES |
| Monitor Zone | `MonitorView.vue` | 469–490, 1159–1205 |

---

## 8. Anhang: Sensor-Datenfluss

```
API sensors.list() → device.sensors = [
  { gpio: 0, sensor_type: 'sht31_temp', name: 'Temp&Hum' },
  { gpio: 0, sensor_type: 'sht31_humidity', name: 'Temp&Hum' }
]

RuleConfigPanel availableSensors → [
  { gpio: 0, sensorType: 'sht31_temp', label: 'Temp&Hum – sht31_temp (GPIO 0)' },
  { gpio: 0, sensorType: 'sht31_humidity', label: 'Temp&Hum – sht31_humidity (GPIO 0)' }
]

Dropdown (aktuell): value=0, key=0 → beide Einträge kollidieren
selectSensor(0) → find(s => s.gpio === 0) → erstes Element (sht31_temp)

Fix: value="0:sht31_humidity", key="0-sht31_humidity"
selectSensor("0:sht31_humidity") → parse → find(s => s.gpio === 0 && s.sensorType === 'sht31_humidity')
```

---

*Bericht erstellt am 2026-03-11. Keine Code-Änderungen vorgenommen.*
