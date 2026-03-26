# Frontend Debug Report

**Erstellt:** 2026-03-26
**Modus:** B (Spezifisch: "VPD-Werte im Frontend – Empfang, Darstellung, Filterung")
**Quellen:** Docker-Logs (el-frontend), sensorDefaults.ts, sensor.store.ts (shared), esp.ts (store), useSensorOptions.ts, useDashboardWidgets.ts, useZoneKPIs.ts, GaugeWidget.vue, SensorCardWidget.vue, LineChartWidget.vue, HistoricalChartWidget.vue, HistoricalChart.vue, SensorColumn.vue, SensorSatellite.vue, types/index.ts, WEBSOCKET_EVENTS.md (Referenz)

---

## 1. Zusammenfassung

VPD ist im Frontend als virtuelle Sensor-Kategorie (PB-01) implementiert: konfiguriert in `SENSOR_TYPE_CONFIG['vpd']` und `VIRTUAL_SENSOR_META.vpd`, aber nicht als eigene Sensor-Klasse behandelt. VPD-Daten werden ueber denselben `sensor_data` WebSocket-Event-Pfad empfangen wie physische Sensoren. Der Server berechnet den VPD-Wert und sendet ihn mit `sensor_type: "vpd"` — das Frontend zeigt ihn genauso wie jeden anderen Sensor.

Drei Luecken gefunden: VPD wird von `getSensorAggCategory()` als `'air' -> 'humidity'` gemappt und damit mit echten Luftfeuchte-Werten (%) in denselben Aggregations-Bucket gemischt (falsche Einheit). VPD=0 hat kein spezifisches Null-Handling. `SensorCardWidget` zeigt VPD mit 1 Dezimalstelle statt den konfigurierten 2.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| Docker-Logs el-frontend | OK | Nur Vite-Start, keine Runtime-Errors |
| Server Health /api/v1/health/live | OK | alive: true |
| Server Health /api/v1/health/detailed | BLOCKED | Auth required (401) |
| sensorDefaults.ts | OK | VPD-Config vorhanden, Aggregations-Bug gefunden |
| sensor.store.ts (shared) | OK | handleSensorData analysiert, korrekte exactMatch-Logik |
| esp.ts | OK | Delegiert an sensor.store.ts |
| useSensorOptions.ts | OK | Kein VPD-Filter — VPD wie physische Sensoren behandelt |
| useZoneKPIs.ts | FINDING | VPD faellt in humidity-Bucket der Aggregation |
| GaugeWidget.vue | OK | Skalierung via SENSOR_TYPE_CONFIG korrekt |
| SensorCardWidget.vue | FINDING | toFixed(1) statt decimals=2 |
| LineChartWidget.vue | OK | last_read watch korrekt |
| HistoricalChartWidget.vue | OK | Delegiert korrekt |
| HistoricalChart.vue | OK | VPD-Zonen-Annotationen vollstaendig |
| types/index.ts | OK | interface_type VIRTUAL vorhanden |

---

## 3. Befunde

### 3.1 VPD-Konfiguration in sensorDefaults.ts

- **Schwere:** Informativ
- **Detail:** VPD ist als `SENSOR_TYPE_CONFIG['vpd']` konfiguriert mit `min: 0`, `max: 3`, `unit: 'kPa'`, `decimals: 2`, `category: 'air'`. Zusaetzlich existiert `VIRTUAL_SENSOR_META.vpd` mit Formula-Referenz (Magnus-Tetens). Die Konfiguration ist inhaltlich korrekt.
- **Evidenz:** `sensorDefaults.ts:514-524` und `sensorDefaults.ts:532-537`

### 3.2 VPD landet im falschen Aggregations-Bucket (Hauptbefund)

- **Schwere:** Mittel
- **Detail:** Die Funktion `getSensorAggCategory()` prueft Sensor-Typen per String-Pattern. VPD trifft keinen dieser Patterns (temp, humid, pressure, co2, light, moisture, ph, ec, flow). Damit faellt VPD in den Fallback-Pfad: `SENSOR_TYPE_CONFIG['vpd'].category = 'air'` wird via `categoryToAgg['air'] = 'humidity'` gemappt. VPD-Werte in kPa landen damit im selben Aggregations-Bucket wie Luftfeuchte-Werte in Prozent. Der Zone-KPI-Durchschnitt wird dadurch verfaelscht — z.B. wenn VPD=1.2 kPa und Luftfeuchte=65% gemittelt werden.
- **Evidenz:** `sensorDefaults.ts:1281-1308` (getSensorAggCategory), `sensorDefaults.ts:1296-1305` (Fallback-Mapping air->humidity)

### 3.3 Kein VPD-spezifisches Null-Wert-Handling

- **Schwere:** Mittel
- **Detail:** In zwei Stellen werden Null-Werte herausgefiltert:
  - `MonitorView.vue:1559`: `if (s.raw_value === 0 && (!s.quality || s.quality === 'unknown')) continue`
  - `sensorDefaults.ts:1401`: `if (val.value === 0 && val.quality === 'unknown') continue`

  Fuer VPD ist raw_value=0 kein valider Messwert (entsteht wenn Server Temp/Humidity noch nicht vorliegen). Wenn der Server VPD=0 mit `quality: "good"` oder `quality: "fair"` sendet, wird der Wert als valid behandelt und angezeigt. Kein VPD-spezifischer Null-Check vorhanden.
- **Evidenz:** `MonitorView.vue:1557-1559`, `sensorDefaults.ts:1399-1401`

### 3.4 WebSocket sensor_data Empfang fuer VPD — korrekt

- **Schwere:** Kein Problem
- **Detail:** VPD-Daten werden vom Server via `sensor_data` WebSocket-Event gesendet (identischer Pfad wie DS18B20, SHT31). `sensor.store.ts:handleSensorData()` sucht per `exactMatch` nach `gpio + sensor_type`. Wenn der Server VPD mit korrekter `esp_id`, `gpio` und `sensor_type: "vpd"` sendet, greift der exactMatch und `raw_value` wird korrekt aktualisiert. Kein Frontend-Bug in der Empfangslogik.
- **Evidenz:** `sensor.store.ts:119-131`

### 3.5 SensorCardWidget zeigt VPD mit falscher Praezision

- **Schwere:** Niedrig
- **Detail:** `SensorCardWidget.vue:109` rendert `(currentSensor.raw_value ?? 0).toFixed(1)`. VPD ist in `SENSOR_TYPE_CONFIG['vpd'].decimals = 2` konfiguriert. Das Widget ignoriert `decimals` und nutzt hartkodiertes `.toFixed(1)`. VPD 1.23 kPa wird als "1.2 kPa" dargestellt — ein kPa-Wert ist bei 1 Dezimalstelle zu ungenau.
- **Evidenz:** `SensorCardWidget.vue:109`, `sensorDefaults.ts:519`

### 3.6 HistoricalChart VPD-Annotationszonen korrekt

- **Schwere:** Kein Problem — positiver Befund
- **Detail:** `HistoricalChart.vue:452-491` implementiert vollstaendige VPD-Zonen-Hintergrundbaender (0-0.4 rot, 0.4-0.8 gelb, 0.8-1.2 gruen, 1.2-1.6 gelb, 1.6-3.0 rot). Aktiviert via `props.sensorType === 'vpd'`. Korrekt implementiert.
- **Evidenz:** `HistoricalChart.vue:455-491`

### 3.7 GaugeWidget Skala fuer VPD korrekt

- **Schwere:** Kein Problem — positiver Befund
- **Detail:** `GaugeWidget.vue:73-74` nutzt `SENSOR_TYPE_CONFIG` fuer effectiveMin/Max. Fuer VPD ergibt das `min: 0`, `max: 3` — korrekte Skala ohne manuelle Konfiguration.
- **Evidenz:** `GaugeWidget.vue:67-74`

### 3.8 useSensorOptions — kein VIRTUAL-Kennzeichen

- **Schwere:** Niedrig
- **Detail:** `useSensorOptions.ts` baut Dropdown-Listen ohne Unterscheidung zwischen physischen und virtuellen Sensoren. `VIRTUAL_SENSOR_META` existiert in sensorDefaults, wird aber in useSensorOptions nicht konsultiert. VPD erscheint im Sensor-Selector wie DS18B20 — kein Hinweis auf berechneten Wert.
- **Evidenz:** `useSensorOptions.ts:75-97`

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `docker compose logs --tail=200 el-frontend` | Nur Vite-Start-Log, keine Runtime-Errors |
| `curl http://localhost:8000/api/v1/health/live` | alive: true |
| `curl http://localhost:8000/api/v1/health/detailed` | 401 Auth required |
| Grep: VPD-Referenzen im Frontend-Source | 3 Dateien: HistoricalChart.vue, sensorDefaults.ts, MonitorView.vue |
| Grep: Null-Wert-Filter raw_value===0 | 2 Stellen, kein VPD-spezifisches Handling |
| Grep: sensor_data Handler-Chain | sensor.store.ts -> exactMatch korrekt |
| Grep: vpd/virtual in esp.ts Store | Kein VPD-Sonderfall im Store |

---

## 5. Blind-Spot-Fragen (an User)

1. **Erscheint VPD im Widget?** Oeffne ein Dashboard mit SensorCard oder Gauge auf VPD-Sensor. Zeigt es einen Wert, 0.00, oder bleibt es leer?

2. **Was sendet der Server fuer VPD?** Browser Network-Tab -> WS-Frames -> suche nach `"sensor_type": "vpd"`. Oder Server-Log: `grep -i "vpd" logs/server/god_kaiser.log | tail -10`

3. **Welcher GPIO wird fuer VPD verwendet?** GPIO=0 ist typisch fuer virtuelle Sensoren. Pruefe im Pinia-Devtools: `espStore.devices[n].sensors` -> Eintrag mit `sensor_type: "vpd"`. Welchen Wert hat `gpio`?

4. **Erscheint VPD in der ZonePlate?** Wenn ja: In welcher KPI-Zeile (Temperatur oder Luftfeuchte)? Das bestaetigt ob der Aggregations-Bucket-Bug sichtbar ist.

5. **Gibt es Browser-Console-Errors beim Laden von Daten mit VPD-Sensor?** Kopiere alle roten Eintraege hierher.

---

## 6. Bewertung & Empfehlung

### Root Cause (identifizierbar)

**Bug A — VPD in Zone-Aggregation fehlerhaft:**
`getSensorAggCategory('vpd')` mappt ueber den Fallback `'air' -> 'humidity'`. VPD-Werte (kPa) landen im Humidity-Bucket und verursachen falsche Durchschnittswerte in ZonePlate-KPIs.

**Fix:** Expliziter VPD-Check in `getSensorAggCategory()` vor dem Fallback:
```typescript
// In getSensorAggCategory(), nach dem flow-Check:
if (lower === 'vpd') return 'other'  // VPD nicht in Humidity-Bucket mischen
```
Alternativ: Eigene AggCategory 'vpd' einfuehren (aufwaendiger, aber sauberer).

**Bug B — SensorCardWidget zeigt VPD mit 1 Dezimalstelle:**
`SensorCardWidget.vue:109` nutzt hartkodiertes `.toFixed(1)` statt der konfigurierten `decimals: 2`.

**Fix:** In `SensorCardWidget.vue` den `decimals`-Wert aus `SENSOR_TYPE_CONFIG` laden:
```typescript
const decimals = computed(() => {
  const sType = parsedSensorType.value || currentSensor.value?.sensor_type
  return SENSOR_TYPE_CONFIG[sType ?? '']?.decimals ?? 1
})
// Template: {{ (currentSensor.raw_value ?? 0).toFixed(decimals) }}
```

### Naechste Schritte

1. Server-Log pruefen (kein Browser noetig): `grep -i "vpd" logs/server/god_kaiser.log | tail -20` — bestaetigt ob VPD-Events gesendet werden und mit welchem GPIO/sensor_type
2. Bug A in `sensorDefaults.ts:getSensorAggCategory()` beheben — VPD aus Humidity-Bucket heraushalten
3. Bug B in `SensorCardWidget.vue` beheben — decimals aus SENSOR_TYPE_CONFIG nutzen

### Lastintensive Ops (Vorschlag, nicht automatisch ausgefuehrt)

- Soll ich `vue-tsc --noEmit` ausfuehren um Type-Korrektheit der vorgeschlagenen Fixes zu pruefen? (ca. 1-3 Min, Befehl: `docker compose exec el-frontend npx vue-tsc --noEmit`)
- Soll ich `npm run build` fuer einen vollstaendigen Build-Check ausfuehren? (ca. 2-5 Min)
