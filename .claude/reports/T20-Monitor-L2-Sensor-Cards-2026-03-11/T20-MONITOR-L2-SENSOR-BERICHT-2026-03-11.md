# T-20: Monitor L2 Sensor-Cards — Analysebericht

**Datum:** 2026-03-11  
**Typ:** Frontend-Debug (MonitorView Ebene 2)  
**Priorität:** HOCH  
**Bezug:** SHT31 Temp/Hum, Live-Updates, Seitenpanel

---

## 1. Executive Summary

Zwei getrennte Root Causes:

| Problem | Ursache | Betroffene Komponente |
|---------|---------|------------------------|
| **Sensor-Cards zeigen nie aktuellen Wert** | `zoneDeviceGroup` nutzt ausschließlich `zoneMonitorData` (API-Snapshot). Kein Merge mit WebSocket `sensor_data`. Daten werden nur bei Zone-Wechsel neu geladen. | MonitorView L2, SensorCard |
| **Temp/Hum vermischt im Seitenpanel** | `detailLiveValue` sucht Sensor nur nach `gpio`, nicht nach `sensor_type`. Bei SHT31 (2 Sensoren auf GPIO 0) liefert `.find(s => s.gpio === gpio)` den ersten Treffer — zufällig temp oder humidity. | MonitorView L3 SlideOver |

**Warum „Vergleichen mit“ korrekt ist:** Die Overlay-Sensoren nutzen `sensor_type` im API-Key (`esp_id-gpio-sensor_type`) und in `sensorsApi.queryData(..., sensor_type)`. Jeder Overlay bekommt die richtigen Daten.

---

## 2. Datenfluss-Übersicht

### 2.1 Sensor-Cards (L2 Grid)

```
zoneMonitorData (ref) ← fetchZoneMonitorData() ← GET /zone/{zoneId}/monitor-data
       ↓
zoneDeviceGroup (computed) ← data.subzones[].sensors (API-Snapshot)
       ↓
SensorCard :sensor="sensor"  ← sensor.raw_value aus API
```

**WebSocket:** `sensor_data` → espStore → sensorStore.handleSensorData → `devices[].sensors`  
**Problem:** `zoneDeviceGroup` liest **nie** aus `espStore.devices`. Es nutzt nur `zoneMonitorData`, das nur bei Zone-Wechsel neu gefetcht wird.

### 2.2 Seitenpanel (L3 SlideOver) — Live-Wert oben

```
selectedDetailSensor (espId, gpio, sensorType)
       ↓
detailLiveValue (computed) ← espStore.devices.find(...).sensors.find(s => s.gpio === gpio)
       ↓
{{ formatStatValue(detailLiveValue.value) }}
```

**Problem:** Die Suche `sensors.find(s => s.gpio === selectedDetailSensor.value!.gpio)` ignoriert `sensor_type`. Bei SHT31 gibt es zwei Sensoren mit `gpio: 0`:
- `sht31_temp`
- `sht31_humidity`

`.find()` gibt den ersten zurück — je nach Array-Reihenfolge temp oder humidity. Daher die Vermischung.

### 2.3 Seitenpanel — Historische Daten (Chart)

```
fetchDetailData() → sensorsApi.queryData({ esp_id, gpio, sensor_type })
       ↓
detailReadings ← API mit korrektem sensor_type
```

**Korrekt:** Die API erhält `sensor_type` und liefert die richtigen Zeitreihen.

---

## 3. Code-Referenzen

### 3.1 zoneDeviceGroup — keine Live-Daten

**Datei:** `El Frontend/src/views/MonitorView.vue` L1159–1190

```ts
const zoneDeviceGroup = computed<ZoneDeviceSubzone[]>(() => {
  const data = zoneMonitorData.value  // ← NUR API, kein espStore
  if (data && !zoneMonitorError.value) {
    return data.subzones.map(sz => ({
      ...
      sensors: sz.sensors.map(s => ({
        ...s,
        raw_value: s.raw_value ?? 0,  // ← aus API-Snapshot
        ...
      })),
      ...
    }))
  }
  // Fallback: useZoneGrouping (auch kein Live-Merge)
  ...
})
```

### 3.2 detailLiveValue — falsche Sensor-Suche

**Datei:** `El Frontend/src/views/MonitorView.vue` L721–736

```ts
const detailLiveValue = computed(() => {
  if (!selectedDetailSensor.value) return null
  const device = espStore.devices.find(d =>
    espStore.getDeviceId(d) === selectedDetailSensor.value!.espId
  )
  if (!device) return null
  const sensor = (device.sensors as MockSensor[] | undefined)?.find(
    s => s.gpio === selectedDetailSensor.value!.gpio  // ← FEHLT: sensor_type!
  )
  if (!sensor) return null
  return {
    value: sensor.raw_value,
    ...
  }
})
```

**Fix:** `sensor_type` in die Suche aufnehmen:

```ts
const sensor = (device.sensors as MockSensor[] | undefined)?.find(
  s => s.gpio === selectedDetailSensor.value!.gpio &&
       s.sensor_type === selectedDetailSensor.value!.sensorType
)
```

### 3.3 fetchZoneMonitorData — nur bei Zone-Wechsel

**Datei:** `MonitorView.vue` L1337–1344

```ts
watch(selectedZoneId, (zoneId) => {
  if (zoneId) fetchZoneMonitorData()
  else { zoneMonitorData.value = null; ... }
}, { immediate: true })
```

Es gibt **keinen** Polling- oder WebSocket-Trigger für ein erneutes `fetchZoneMonitorData()`.

---

## 4. Fix-Vorschläge

### 4.1 Sensor-Cards: Live-Werte (Priorität 1)

**Option A — Merge mit espStore:**  
In `zoneDeviceGroup` die Sensor-Werte aus `espStore.devices` überlagern, wenn ein passender Sensor existiert (esp_id, gpio, sensor_type). So bleiben Subzone-Struktur und API-Daten erhalten, aber `raw_value`, `quality`, `last_read` kommen live aus dem Store.

**Option B — Polling:**  
`fetchZoneMonitorData` alle 30–60 Sekunden erneut aufrufen (z.B. via `setInterval` im Watch auf `selectedZoneId`). Einfacher, aber mehr API-Last und keine Echtzeit.

**Empfehlung:** Option A — konsistent mit dem Rest der App (WebSocket als primäre Live-Quelle).

### 4.2 detailLiveValue: sensor_type ergänzen (Priorität 1)

**Datei:** `MonitorView.vue` L727–729

```ts
// Vorher:
const sensor = (device.sensors as MockSensor[] | undefined)?.find(
  s => s.gpio === selectedDetailSensor.value!.gpio
)

// Nachher:
const sensor = (device.sensors as MockSensor[] | undefined)?.find(
  s => s.gpio === selectedDetailSensor.value!.gpio &&
       (s as { sensor_type?: string }).sensor_type === selectedDetailSensor.value!.sensorType
)
```

Oder mit Typ-Cast auf `MockSensor` (hat `sensor_type`):

```ts
const sensor = (device.sensors as MockSensor[] | undefined)?.find(
  s => s.gpio === selectedDetailSensor.value!.gpio &&
       s.sensor_type === selectedDetailSensor.value!.sensorType
)
```

---

## 5. Screenshots — Verifiziert (2026-03-11)

Alle 6 Screenshots wurden per Playwright MCP gesammelt (Zelt 1, ESP_472204, SHT31).

| Datei | Inhalt | Beobachtung |
|-------|--------|-------------|
| `01-monitor-l1-zonen.png` | Monitor L1, Zone-Übersicht | Zelt 1: 20.1°C · 46%RH, 2/2 Sensoren online |
| `02-monitor-l2-sensor-cards.png` | L2 Sensor-Cards | Tem&Hum (Temperatur): 20.1 °C, Tem&Hum (Luftfeuchte): 46 %RH |
| `03-monitor-l2-nach-60s.png` | L2 nach 60s Wartezeit | **Keine Änderung** der Card-Werte (20.1 / 46) — bestätigt fehlendes Live-Update |
| `04-seitenpanel-temp-geoeffnet.png` | Temperatur-Detail geöffnet | **BUG:** Panel zeigt „sht31_temp“, aber Live-Wert **46,7 °C** — das ist der **Humidity-Wert** (46%RH) mit falscher Einheit! |
| `05-seitenpanel-humidity-geoeffnet.png` | Luftfeuchte-Detail geöffnet | Korrekt: 45,7 %RH, „vor 14 Sekunden“ — aktualisiert sich |
| `06-vergleichen-mit-beide.png` | Beide im Overlay „Vergleichen mit“ | Beide Kurven (Temp °C + Hum %RH) getrennt, Werte stimmen |

**Kernbefund aus Screenshot 04:** Beim Öffnen des **Temperatur**-Panels wird der **Luftfeuchtigkeitswert** (46.7) mit der Einheit °C angezeigt. Das bestätigt die Root Cause: `detailLiveValue` findet den Sensor nur per `gpio`, nicht per `sensor_type`, und trifft dabei den Humidity-Sensor zuerst.

---

## 6. Referenz-Dateien

| Bereich | Datei | Zeilen |
|---------|-------|--------|
| zoneDeviceGroup | `MonitorView.vue` | 1159–1227 |
| detailLiveValue | `MonitorView.vue` | 721–736 |
| fetchZoneMonitorData | `MonitorView.vue` | 1298–1335 |
| SensorCard (raw_value) | `SensorCard.vue` | 194–195 |
| sensor_data Handler | `esp.ts` → `sensor.store.ts` | 1145–1148, 102–123 |
| Zone Monitor API | `zones.ts` | `getZoneMonitorData` |

---

## 7. Zusammenhang mit T19

Der T19-Bericht (SHT31 Temp/Hum im Logic-Editor) behandelt das **RuleConfigPanel** (Dropdown-Key/Value, manueller Fallback).  
T20 behandelt den **Monitor** (Sensor-Cards + SlideOver). Beide betreffen Multi-Value-Sensoren (SHT31), aber unterschiedliche Views und Root Causes.

---

*Bericht erstellt am 2026-03-11. Code-Analyse abgeschlossen; Fixes noch nicht implementiert.*
