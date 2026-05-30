# Monitor L2/L3 CSV-Download — Analyse-Report

**AUT-382** | Datum: 2026-05-12 | Analyst: auto-debugger  
**Kategorie:** tracing-gap  
**Screenshot:** `screenshot-monitor-l2-download.png`

---

## Klarstellung: Level-Taxonomie

> **Wichtige Korrektur:** Der CSV-Export-Button befindet sich **nicht auf L2** (Device-Ebene), sondern auf **L3** (Sensor-Detail-SlideOver).
>
> - **L1** = `/monitor` — Zonenübersicht mit ZonePlate-Kacheln  
> - **L2** = `/monitor/{zone_slug}` — Device-Ebene mit Sensor-Cards pro ESP  
> - **L3** = `/monitor/{zone_slug}/sensor/{esp_id}-gpio{gpio}` — Sensor-Detail-SlideOver (`openSensorDetail()`)

Der CSV-Download-Button erscheint nur im L3-SlideOver, **nicht** auf L2.

---

## Analyse-Scope 1: Frontend

### 1. Vue-Komponente mit Download-Button

**Datei:** `El Frontend/src/views/MonitorView.vue:2717–2723`

```html
<template #footer v-if="selectedDetailSensor">
  <div class="sensor-detail__actions">
    <button class="sensor-detail__action-btn"
            @click="exportDetailCsv"
            :disabled="detailReadings.length === 0">
      <Download :size="14" />
      CSV Export
    </button>
  </div>
</template>
```

Der Button ist in einem `<SlideOver>`-Footer und wird ausgeblendet wenn kein Sensor ausgewählt ist (`v-if="selectedDetailSensor"`). Er ist deaktiviert wenn keine Readings geladen sind.

**Trigger für das SlideOver** (L3-Öffnung): `MonitorView.vue:2445`

```html
<button class="monitor-sensor-card__detail-btn"
        @click.stop="openSensorDetail(sensor)">
  <ChevronRight class="w-4 h-4" />
  <span>Zeitreihe anzeigen</span>
</button>
```

### 2. Store / Composable für Download-Trigger

**KEIN Store, KEIN Composable.** Die Funktion `exportDetailCsv()` ist eine lokale Funktion direkt in `MonitorView.vue:975–993`:

```typescript
function exportDetailCsv() {
  if (!detailReadings.value.length) return
  const sensor = selectedDetailSensor.value
  const unit = sensor?.unit || ''
  const header = 'timestamp,raw_value,processed_value,unit,quality'
  const rows = detailReadings.value.map(r => {
    const processedVal = r.processed_value ?? r.raw_value
    const rowUnit = r.unit || unit
    return `${r.timestamp},${r.raw_value},${processedVal},${rowUnit},${r.quality}`
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sensor-data_${sensor?.espId}_gpio${sensor?.gpio}_${Date.now()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
```

**Paralleles System (NICHT in MonitorView genutzt):**  
- `El Frontend/src/composables/useExportCsv.ts` — eigenständiger API-Call mit `resolution`-Parameter  
- `El Frontend/src/components/dashboard-widgets/ExportCsvDialog.vue` — Dialog mit Zeitraum + Resolution-Auswahl  
- Wird nur in `HistoricalChartWidget.vue:100` und `MultiSensorWidget.vue:60` verwendet, **nicht** in MonitorView.

### 3. API-Call-Struktur

Der CSV-Export macht **keinen eigenen API-Call** — er exportiert die bereits geladenen `detailReadings`.

Die Daten werden via `fetchDetailData()` geladen: `MonitorView.vue:720–741`

```typescript
async function fetchDetailData() {
  if (!selectedDetailSensor.value) return
  detailLoading.value = true
  try {
    const response = await sensorsApi.queryData({
      esp_id: selectedDetailSensor.value.espId,
      gpio: selectedDetailSensor.value.gpio,
      sensor_type: selectedDetailSensor.value.sensorType || undefined,
      start_time: detailStartTime.value,
      end_time: detailEndTime.value,
      limit: 1000,
    })
    detailReadings.value = response.readings ?? []
  } catch (err) { ... }
}
```

- **Methode:** GET  
- **URL:** `/api/v1/sensors/data` via `sensorsApi.queryData` (`El Frontend/src/api/sensors.ts:115–119`)  
- **Parameter:** `esp_id`, `gpio`, `sensor_type`, `start_time` (ISO-String), `end_time` (ISO-String), `limit: 1000`  
- **Kein `resolution`-Parameter** (anders als `useExportCsv`)  
- **Kein `offset`-Parameter** — max 1000 Datenpunkte pro Export

### 4. Zeitraum-Eingabe (date_from / date_to) — aktiv oder auskommentiert?

**JA, vollständig aktiv implementiert.** `TimeRangeSelector`-Komponente: `MonitorView.vue:2617–2620`

```html
<TimeRangeSelector
  v-model="detailPreset"
  @range-change="onDetailRangeChange"
/>
```

Verfügbare Presets (aus `TimeRangeSelector.vue`):
`1 Std` | `6 Std` | `12 Std` | `24 Std` (Default) | `7 Tage` | `Benutzerdefiniert` (mit `<input type="datetime-local">`)

State: `detailStartTime` und `detailEndTime` (`MonitorView.vue:655–657`)  
→ Der CSV-Export exportiert implizit den gewählten Zeitraum, da er `detailReadings.value` verwendet.

### 5. Sensor-/Spalten-Auswahl

**FEHLT KOMPLETT** — weder aktiv noch auskommentiert.  
Die CSV-Ausgabe hat immer diese fixe Struktur:
```
timestamp,raw_value,processed_value,unit,quality
```
Kein Mechanismus für Spaltenauswahl vorhanden.

### 6. Download-Button: direkt in MonitorView oder separater Komponente?

**Direkt in `MonitorView.vue:2717`**. Keine separate Download-Komponente in der Monitor-Ansicht.

---

## Analyse-Scope 2: Server

### 6. Endpoint für CSV-Download-Request

**FEHLT KOMPLETT.** Es existiert kein dedizierter CSV-Download-Endpoint im gesamten Server.  
Die Suche über alle Router-Dateien liefert keinen Treffer für CSV-Export von Sensordaten.

Das `csv`-Modul wird nur für Upload in `El Servador/god_kaiser_server/src/api/v1/multispeq.py:17` genutzt.

**Nächstes Äquivalent:** `GET /api/v1/sensors/data` — liefert JSON, kein CSV.

### 7. Query-Parameter des Sensor-Data-Endpoints

`El Servador/god_kaiser_server/src/api/v1/sensors.py:1355–1389`

```python
async def query_sensor_data(
    db: DBSession,
    current_user: ActiveUser,
    esp_id: Optional[str] = None,
    gpio: Optional[int] = None,             # ge=0, le=39
    sensor_type: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    quality: Optional[str] = None,
    zone_id: Optional[str] = None,
    subzone_id: Optional[str] = None,
    sensor_config_id: Optional[str] = None,
    limit: int = 100,                       # ge=1, le=1000
    resolution: Optional[str] = None,       # pattern: raw|1m|5m|1h|1d
    before_timestamp: Optional[datetime] = None,   # Cursor-Pagination
)
```

### 8. Abgefragte DB-Tabellen

- **`sensor_data`** (primär) — `src/db/repositories/sensor_repo.py:705`  
- **`sensor_configs`** (sekundär, bei `sensor_config_id`) — `sensor_repo.py:669`

### 9. Selektierte Felder in der CSV (hypothetisch)

Der Endpoint liefert JSON, kein CSV. Felder der JSON-Response:

**Raw-Mode:** `timestamp`, `raw_value`, `processed_value`, `unit`, `quality`, `sensor_type`, `zone_id`, `subzone_id`  
**Aggregated-Mode:** `timestamp` (bucket), `raw_value` (avg_raw), `processed_value` (avg_processed), `unit`, `quality="aggregated"`, `sensor_type`, `min_value`, `max_value`, `sample_count`

### 10. date_from / date_to / limit / offset Parameter

| Parameter | Status | Detail |
|-----------|--------|--------|
| `start_time` | **vorhanden** | Äquivalent zu `date_from`, `sensors.py:1367` |
| `end_time` | **vorhanden** | Äquivalent zu `date_to`, `sensors.py:1368` |
| `limit` | **vorhanden** | max 1000, `sensors.py:1377` |
| `offset` | **FEHLT** | Nur Cursor-Pagination via `before_timestamp` |
| `date_from`/`date_to` (exakter Name) | **FEHLT** | Parameter heißen `start_time`/`end_time` |

Default: letzte 24h wenn kein Zeitraum angegeben (`sensors.py:1413–1420`).

### 11. CSV-Serialisierungs-Logik

**FEHLT KOMPLETT.** Kein `csv`-Modul, kein `io.StringIO`, keine `StreamingResponse` für Sensordaten.  
Antwort ist immer `SensorDataResponse` (JSON).

---

## Gemeinsame Analyse (Monitor-L3-Seite)

### 12. Zeitraum-Mechanismus Server-seitig

`start_time`/`end_time`-Konvention existiert in mehreren Endpoints:
- `GET /sensors/data` — `sensors.py:1367–1368`
- `GET /sensors/{esp_id}/{gpio}/stats` — `sensors.py:1652–1653`

Konvention ist **übertragbar** auf einen neuen CSV-Endpoint.

### 13. fields/columns-Parameter-Logik

**FEHLT KOMPLETT** — kein `fields`- oder `columns`-Parameter im gesamten Server.

### 14. Export-Format-Infrastruktur

| Infrastruktur | Status | Datei |
|---------------|--------|-------|
| `import csv` für Export | **NEIN** | — |
| `io.StringIO` CSV-Buffer | **NEIN** | — |
| `pandas` für Export | **NEIN** | — |
| `StreamingResponse` für Daten-Export | **NEIN** | — |
| `csv.DictReader` für Upload | **JA** | `multispeq.py:222` (nur Ingest) |
| `FileResponse` | **JA** | `backups.py:224`, `debug.py:3043` (Backup-Downloads) |

### 15. Vollständige Schichtkette

```
Frontend-Button (MonitorView.vue:2717)
  → exportDetailCsv() — client-seitig, kein API-Call
  → detailReadings.value (bereits im Memory geladen)
  → Blob + URL.createObjectURL → Browser-Download
```

```
Datenladen (separat):
Frontend fetchDetailData() (MonitorView.vue:720)
  → sensorsApi.queryData() (src/api/sensors.ts:115)
  → GET /api/v1/sensors/data
  → Route Handler query_sensor_data() (sensors.py:1355)
  → SensorRepository.query_data() (sensor_repo.py:627)
  → SELECT * FROM sensor_data WHERE ... ORDER BY timestamp DESC LIMIT 1000
  → SensorDataResponse JSON
  → detailReadings.value gesetzt
```

### 16. Authentifizierung

`GET /api/v1/sensors/data` ist hinter **`ActiveUser`** (JWT) geschützt — `sensors.py:1358`.  
Kein separater CSV-Endpoint, daher keine abweichende Auth-Anforderung.

---

## OQ-Antworten (Offene Fragen)

| OQ | Frage | Antwort |
|----|-------|---------|
| **OQ-1** | Existiert Monitor-L2-CSV-Endpoint vollständig oder Stub? | **FEHLT KOMPLETT** — kein CSV-Endpoint, nur JSON via `GET /sensors/data`. CSV wird client-seitig aus bereits geladenen Daten erzeugt. |
| **OQ-3** | `date_from`/`date_to`-Konvention in anderen Endpoints? | **JA** — als `start_time`/`end_time` in `sensors.py` und Stats-Endpoint. Übertragbar. |
| **OQ-5** | `StreamingResponse`-Infrastruktur vorhanden? | **NEIN** für Daten-Export. Nur für AI-Streaming (`ai.py:107`). Neu aufbauen bei großen Zeiträumen. |
| **OQ-6** | Button direkt in MonitorView oder separater Komponente? | **Direkt in `MonitorView.vue:2717`** im SlideOver-Footer. Scope: lokale Änderung dieser Komponente. |

---

## Gap-Analyse

### Was bereits implementiert ist (kein Aufwand)

- ✅ **Zeitraum-Selektor** im L3-SlideOver: `TimeRangeSelector` mit 5 Presets + Custom-Range
- ✅ **API-Endpoint** für Sensor-Daten: `GET /api/v1/sensors/data` mit `start_time`, `end_time`, `limit`, `resolution`
- ✅ **Sensor-Filterung**: `esp_id`, `gpio`, `sensor_type` als Parameter vorhanden
- ✅ **Client-seitige CSV-Erzeugung**: `exportDetailCsv()` funktioniert für geladene Daten
- ✅ **Alternatives Export-Composable**: `useExportCsv.ts` + `ExportCsvDialog.vue` existiert, wird nur nicht in MonitorView genutzt

### Was fehlt komplett (Neubau)

- ❌ **Server-seitiger CSV-Endpoint** — falls Export > 1000 Datenpunkte benötigt wird
- ❌ **Spalten-/Sensor-Auswahl** im Frontend (welche Felder sollen in CSV)
- ❌ **`columns`/`fields`-Parameter** im Server-Endpoint
- ❌ **`StreamingResponse`** für große CSV-Exports
- ❌ **Limit > 1000** — aktuell hard-cap bei 1000 Datenpunkten per Request

### Was vorhanden aber unvollständig ist (Erweiterung)

- ⚠️ **`exportDetailCsv()`** exportiert nur aktuell geladene Daten (max 1000 Punkte) — kein vollständiger Bulk-Export für große Zeiträume
- ⚠️ **`useExportCsv.ts` + `ExportCsvDialog.vue`** existiert als sauberere Alternative, wird aber in MonitorView ignoriert — Konsolidierung auf dieses System sinnvoll
- ⚠️ **Kein `resolution`-Parameter** in `fetchDetailData()` — `useExportCsv` hat diesen bereits, MonitorView nicht
- ⚠️ **Impliziter Zeitraum** — Der Zeitraum steuert den geladenen Datensatz, aber der CSV-Export-Button macht das nicht transparent
