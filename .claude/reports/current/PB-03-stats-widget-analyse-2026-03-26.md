# PB-03 Analyse: Statistik-Widget — Stats-Endpoint → Widget

> **Datum:** 2026-03-26
> **Typ:** Analyse (kein Code)
> **Status:** ABGESCHLOSSEN

---

## 1. Vollständige API-Dokumentation

### 1.1 Stats-Endpoints — Übersicht

Es existieren **3 stats-relevante Endpoints** im Backend:

| # | Pfad | Zweck | Für Widget nutzbar? |
|---|------|-------|---------------------|
| A | `GET /api/v1/sensors/{esp_id}/{gpio}/stats` | Min/Max/Avg/StdDev für einen Sensor | **JA — Primär-Kandidat** |
| B | `GET /api/v1/sensors/data/stats/by-source` | Count nach Datenquelle (production/mock/test) | Nein (Admin-Tool) |
| C | `GET /api/v1/sensors/{sensor_id}/runtime` | Uptime/Maintenance aus JSONB | Nein (anderer Zweck) |

Zusätzlich liefert der bestehende Data-Endpoint aggregierte Werte:

| # | Pfad | Zweck | Für Widget nutzbar? |
|---|------|-------|---------------------|
| D | `GET /api/v1/sensors/data?resolution=1d` | Zeitreihen mit min/max/avg pro Bucket | Alternativ (clientseitige Berechnung) |

---

### 1.2 Primär-Endpoint: `GET /api/v1/sensors/{esp_id}/{gpio}/stats`

**Definiert in:** `El Servador/god_kaiser_server/src/api/v1/sensors.py:1510`
**Repository:** `sensor_repo.py:753` → `get_stats()`

#### Pfad-Parameter

| Name | Typ | Pflicht |
|------|-----|---------|
| `esp_id` | `str` | ja |
| `gpio` | `int` | ja |

#### Query-Parameter

| Name | Typ | Default | Pflicht | Beschreibung |
|------|-----|---------|---------|--------------|
| `start_time` | `datetime` | now - 24h | nein | Zeitbereich-Start |
| `end_time` | `datetime` | now | nein | Zeitbereich-Ende |
| `sensor_type` | `str` | `None` | nein | Für Multi-Value-Sensoren (z.B. `sht31_temp`) |

#### Response-Body (`SensorStatsResponse`)

```json
{
  "success": true,
  "esp_id": "ESP_472204",
  "gpio": 4,
  "sensor_type": "sht31_temp",
  "stats": {
    "min_value": 18.2,
    "max_value": 27.1,
    "avg_value": 22.4,
    "std_dev": 2.3,
    "reading_count": 2016,
    "quality_distribution": { "good": 1900, "fair": 100, "poor": 16 }
  },
  "time_range": {
    "start": "2026-03-19T00:00:00Z",
    "end": "2026-03-26T00:00:00Z"
  }
}
```

**Schema-Definitionen:**
- `SensorStatsResponse` → `El Servador/.../schemas/sensor.py:704`
- `SensorStats` → `El Servador/.../schemas/sensor.py:675`

---

### 1.3 Aggregationen — Vollständige Tabelle

| Aggregation | Vorhanden? | Feld-Name | SQL-Funktion |
|-------------|-----------|-----------|--------------|
| Minimum | ✅ | `min_value` | `MIN(COALESCE(processed_value, raw_value))` |
| Maximum | ✅ | `max_value` | `MAX(COALESCE(processed_value, raw_value))` |
| Durchschnitt | ✅ | `avg_value` | `AVG(COALESCE(processed_value, raw_value))` |
| Standardabweichung | ✅ | `std_dev` | `STDDEV_POP(...)` (PostgreSQL) / Python-Fallback (SQLite) |
| Median | ❌ | — | Nicht implementiert |
| Count | ✅ | `reading_count` | `COUNT(*)` |
| Zeitraum | ✅ | `time_range` | Aus Query-Parametern |
| Quality-Verteilung | ✅ | `quality_distribution` | Separate GROUP BY query |
| Percentile (P5/P95) | ❌ | — | Nicht implementiert |
| Trend | ❌ | — | Keine lineare Regression |

**Fazit:** Für Minimal Viable (Min/Max/Avg/Count) ist ALLES vorhanden. StdDev ist Bonus und ebenfalls da.

---

### 1.4 Zone/Subzone-Filtering

| Feature | Stats-Endpoint (`/stats`) | Data-Endpoint (`/data`) |
|---------|---------------------------|-------------------------|
| `zone_id` Filter | ❌ NEIN | ✅ JA |
| `subzone_id` Filter | ❌ NEIN | ✅ JA |
| `sensor_config_id` Filter | ❌ NEIN | ✅ JA (T13-R2) |

**Konsequenz:** Der Stats-Endpoint filtert nur nach `esp_id` + `gpio` + `sensor_type`. Für ein Widget das EINEN Sensor darstellt (PB-03 Scope), ist das **ausreichend** — der Sensor wird über `sensorId` (= `espId:gpio:sensorType`) eindeutig identifiziert.

---

### 1.5 Performance

| Aspekt | Status |
|--------|--------|
| Aggregation in SQL | ✅ JA — `MIN/MAX/AVG/STDDEV_POP/COUNT` direkt in PostgreSQL |
| Python-Postprocessing | Nur SQLite-Fallback für StdDev |
| Caching | ❌ Kein Caching |
| Index auf `sensor_data` | `(esp_id, gpio, timestamp)` — passt für diesen Query |

**Erwartete Performance:** Für 7d bei 1 Sensor (ca. 2000–10000 Datenpunkte) sollte die SQL-Aggregation im einstelligen Millisekunden-Bereich liegen. Für 30d (ca. 8000–40000 Datenpunkte) immer noch < 50ms. Kein Caching nötig für Phase B.

---

## 2. Bestehende Aggregation in sensor_repo.py

### 2.1 Resolution-Aggregation (`_query_aggregated`)

**Datei:** `sensor_repo.py:582-632`

Die bestehende `GET /api/v1/sensors/data?resolution=1d` Query liefert pro Zeitbucket:

```
(bucket, avg_raw, avg_processed, min_val, max_val, sample_count, sensor_type, unit)
```

| Resolution | SQL-Bucket |
|-----------|------------|
| `1m` | `date_trunc('minute', timestamp)` |
| `5m` | `date_trunc('hour') + 5min * floor(minute/5)` |
| `1h` | `date_trunc('hour', timestamp)` |
| `1d` | `date_trunc('day', timestamp)` |

**Theoretisch möglich:** Ein Widget könnte `resolution=1d` + `start_time` + `end_time` abfragen und clientseitig `Math.min()/max()/avg()` über die Buckets berechnen. **ABER:** Das wäre unpräziser als der Stats-Endpoint (Aggregation über Aggregate vs. Aggregation über Rohdaten) und unnötig komplex.

**Empfehlung:** Stats-Endpoint direkt nutzen, nicht den Data-Endpoint mit clientseitiger Nachberechnung.

### 2.2 Gap-Analyse: Was fehlt im Backend?

| Feature | Status | Aufwand wenn nötig |
|---------|--------|--------------------|
| Min/Max/Avg/Count | ✅ Vorhanden | — |
| StdDev | ✅ Vorhanden | — |
| Median | ❌ Fehlt | `PERCENTILE_CONT(0.5)` — 1 Zeile SQL |
| P5/P95 Percentile | ❌ Fehlt | `PERCENTILE_CONT(0.05/0.95)` — 2 Zeilen SQL |
| Trend (steigend/fallend) | ❌ Fehlt | Lineare Regression — komplexer, ~20 Zeilen |
| `sensor_config_id`-Filter | ❌ Fehlt im Stats-Endpoint | ~10 Zeilen (analog zu `query_data`) |

**Für Phase B:** KEIN Backend-Change nötig. Alles was das Minimal-Viable-Widget braucht, existiert bereits.

---

## 3. Widget-Design

### 3.1 Neuer Typ vs. Erweiterung — Empfehlung

#### Option A: Neuer Widget-Typ `statistics` (EMPFOHLEN)

| Aspekt | Bewertung |
|--------|-----------|
| Klarheit | Eigener Typ = eindeutige Semantik |
| Registrierung | 4-Stellen-Pattern, gut dokumentiert |
| Konfiguration | Eigene Config-Felder (timeRange, showStdDev, showQuality) |
| Größe (w/h) | `w:4, h:3, minW:3, minH:2` — kompakter als Chart |
| Kategorie | `'Sensoren'` |
| Aufwand | ~200 Zeilen Vue + ~15 Zeilen Registrierung |

#### Option B: Modus im `sensor-card` Widget

| Aspekt | Bewertung |
|--------|-----------|
| SensorCard heute | Zeigt NUR Live-Wert (aktueller `processed_value` aus espStore) |
| Erweiterung | `mode: 'live' | 'stats'` + API-Call + TimeRange-Selector |
| Problem | SensorCard ist kompakt (w:3, h:2) — Stats braucht mehr Platz |
| Problem | SensorCard nutzt nur espStore (kein API-Call), Stats braucht API |
| Aufwand | Ähnlich hoch wie Option A, aber verkompliziert bestehende Komponente |

**Empfehlung: Option A.** Gründe:
1. Stats-Widget hat andere Datenquelle (API-Call vs. WebSocket-Store)
2. Stats-Widget hat andere Config (timeRange, Statistik-Auswahl)
3. Stats-Widget hat andere Mindestgröße
4. Separation of Concerns — kein Bloat in SensorCard

---

### 3.2 Visuelles Konzept

```
┌─────────────────────────────────────┐
│  🌡 Temperatur · Zone A · 7 Tage   │  ← Header: sensor_type + zone + timeRange
│                                      │
│   Min    Avg    Max    σ             │  ← Labels
│  18.2   22.4   27.1   2.3           │  ← Werte (formatStatValue)
│   °C     °C     °C    °C            │  ← Einheiten
│                                      │
│  2016 Messungen · 98% good          │  ← Footer: reading_count + quality
└─────────────────────────────────────┘
```

**Bestehende CSS-Patterns:**
- `HistoricalChart.vue` hat `.historical-chart__stats` / `.historical-chart__stat` (inline Stats-Row)
- `MonitorView.vue` hat `.sensor-detail__stat` / `.sensor-detail__stat-label` / `.sensor-detail__stat-value`
- Beide zeigen Min/Max/Avg als Kacheln — gleiches Pattern, wiederverwendbar

**Kein Chart nötig** für Phase B. Reines Zahlen-Widget (KPI-Card-Pattern). Sparkline wäre Phase C.

---

### 3.3 Konfiguration im WidgetConfigPanel

Benötigte Config-Felder:

| Feld | UI-Element | Bereits vorhanden? |
|------|-----------|---------------------|
| `sensorId` | Sensor-Dropdown | ✅ `useSensorOptions` + WidgetConfigPanel |
| `timeRange` | Button-Group oder Dropdown | ✅ Pattern in HistoricalChart (`1h/6h/24h/7d/30d`) |
| `showStdDev` | Checkbox | ❌ Neues Feld |
| `showQuality` | Checkbox | ❌ Neues Feld |

**WidgetConfigPanel-Änderungen:**
- `hasSensorField`: `'statistics'` hinzufügen
- `hasTimeRange`: `'statistics'` hinzufügen
- Neue computed-Flags für `showStdDev` / `showQuality` ODER als Teil des Widget-Templates (einfacher)

**Dashboard Store Config-Interface erweitern:**
```typescript
// dashboard.store.ts Zeile 38-58
showStdDev?: boolean
showQuality?: boolean
```

---

## 4. Bestehende Nutzung

### 4.1 Wer ruft den Stats-Endpoint auf?

| Stelle | Datei | Wie? |
|--------|-------|------|
| HistoricalChart | `components/charts/HistoricalChart.vue:188` | Parallel-Fetch beim Laden, Ergebnis als Stats-Overlay unter dem Chart |
| MonitorView | `views/MonitorView.vue:747` | In `fetchDetailStats()` wenn Sensor-Detail geöffnet wird |
| **Kein Widget** | — | Stats-API existiert in `sensorsApi.getStats()` (`api/sensors.ts:144`) aber kein Dashboard-Widget nutzt sie |

### 4.2 Frontend API-Client

```typescript
// El Frontend/src/api/sensors.ts:144-158
sensorsApi.getStats(espId, gpio, { start_time, end_time, sensor_type })
// → GET /sensors/{espId}/{gpio}/stats
// → Returns SensorStatsResponse
```

**TypeScript-Typen vorhanden:** `SensorStats` und `SensorStatsResponse` in `El Frontend/src/types/index.ts:799-822`

### 4.3 Zone-KPIs vs. Stats-Endpoint

`useZoneKPIs.ts` berechnet KPIs **ausschließlich aus Live-WebSocket-Daten** (espStore.devices):
- Zählt: sensorCount, actuatorCount, activeSensors, alarmCount, onlineDevices
- Berechnet: healthStatus (ok/warning/alarm)
- **Kein API-Call** zu `/stats`

Der Stats-Endpoint könnte Zone-KPIs NICHT ersetzen, da er andere Metriken liefert (Min/Max/Avg vs. Counts/Health). Ergänzen ja, ersetzen nein.

---

## 5. Betroffene Dateien für Implementierung

### Backend: KEINE Änderungen nötig

Der Stats-Endpoint liefert alles was Phase B braucht.

### Frontend: 5 Dateien ändern + 1 neue Datei

| # | Datei | Änderung | ~Zeilen |
|---|-------|----------|---------|
| 1 | `shared/stores/dashboard.store.ts:26` | `'statistics'` zu WidgetType Union hinzufügen | 1 |
| 2 | `composables/useDashboardWidgets.ts:17` | Import `StatisticsWidget` | 1 |
| 2b | `composables/useDashboardWidgets.ts:87` | Eintrag in `widgetComponentMap` | 1 |
| 2c | `composables/useDashboardWidgets.ts:100` | Eintrag in `WIDGET_TYPE_META` | 2 |
| 2d | `composables/useDashboardWidgets.ts:113` | Eintrag in `WIDGET_DEFAULT_CONFIGS` | 1 |
| 2e | `composables/useDashboardWidgets.ts:278` | Props-Bridge für `showStdDev`, `showQuality` | 2 |
| 3 | **NEU:** `components/dashboard-widgets/StatisticsWidget.vue` | Widget-Komponente | ~180 |
| 4 | `components/dashboard-widgets/WidgetConfigPanel.vue:42-58` | `'statistics'` in `hasSensorField` + `hasTimeRange` | 2 |
| 4b | `components/dashboard-widgets/WidgetConfigPanel.vue:147` | Label in `widgetTypeLabels` | 1 |

**Gesamt: ~190 Zeilen neuer Code, ~10 Zeilen Registrierung in bestehenden Dateien.**

---

## 6. Aufwand-Schätzung

| Phase | Aufwand | Beschreibung |
|-------|---------|--------------|
| Registrierung (4 Stellen) | 15 min | Typ, Map, Meta, Config, Label |
| StatisticsWidget.vue | 1-2h | Template + API-Call + Formatierung + Empty-State |
| WidgetConfigPanel | 15 min | Computed-Flags + ggf. neue Checkboxen |
| Test (manuell) | 30 min | Widget hinzufügen, Sensor wählen, TimeRange ändern |
| **Gesamt** | **~2-3h** | |

---

## 7. Zusammenfassung der Empfehlungen

1. **Stats-Endpoint ist direkt nutzbar** — keine Backend-Änderungen für Phase B
2. **Neuer Widget-Typ `statistics`** statt Erweiterung von `sensor-card`
3. **Frontend API-Client ist fertig** — `sensorsApi.getStats()` existiert mit TypeScript-Typen
4. **Minimal Viable:** Min/Max/Avg/Count + TimeRange-Selector + Sensor-Dropdown
5. **Phase C Erweiterungen:** Sparkline, Median, Percentile, Trend, Sensor-Vergleich
6. **Kein Scope-Creep:** Ein Sensor pro Widget, keine Zone-übergreifenden Stats
