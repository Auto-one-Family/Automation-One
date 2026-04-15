# Fertigation Widget Integration Reference

**Status:** Erstellt 2026-04-14  
**Relevante Komponenten:** FertigationPairWidget, useFertigationKPIs, MultiSensorChart, Backend Sensor-Endpoints

---

## Überblick

Das Fertigation-Widget vergleicht Inflow- und Runoff-Sensoren (EC oder pH) und berechnet Differenzen mit Trend-Analyse. Der Datenfluss folgt dem Standard-Pattern: Backend-API → Frontend-Store/Composable → Vue-Komponente mit WebSocket-Live-Updates.

---

## Datenfluss (End-to-End)

| Schritt | Komponente | Prozess | Datenpfad |
|---------|-----------|---------|-----------|
| 1. Init | FertigationPairWidget (Zeile 73) | Props für `inflowSensorId` + `runoffSensorId` werden als Refs an Composable übergeben | Props: `inflowSensorId`, `runoffSensorId` (Strings, Sensor-Config-IDs) |
| 2. Bootstrap | `useFertigationKPIs.ts:408-410` | `onMounted()`: Ruft `loadInitialData()` + `setupWebSocketListeners()` auf | Refs: `inflowSensorIdRef`, `runoffSensorIdRef` |
| 3. REST-Query | `sensorsApi.queryData()` (El Frontend/src/api/sensors.ts:115-120) | Client-API-Call mit Query-Params | `{ sensor_config_id: inflowSensorId.value, limit: 100 }` |
| 4. Backend GET | `GET /v1/sensors/data` (El Servador/src/api/v1/sensors.py:1267-1373) | FastAPI-Endpoint mit Query-Params, Datenbankabfrage | `sensor_config_id` → `sensor_config_id=resolved_config_id` (UUID) |
| 5. DB-Query | `SensorRepository.query_data()` (sensors.py:1360-1372) | SQL-Select mit Zeitbereich und Sensor-Filter | Filtert auf `sensor_config_id`, `start_time`, `end_time`, `limit=100` |
| 6. Response | SensorDataResponse (el Servador/schemas) | Liste von Sensor-Lesevorgängen mit `processed_value` | Array: `[{ timestamp, processed_value, quality, ... }]` |
| 7. KPI-Calc | `useFertigationKPIs.ts:241-296` | `updateKPIFromReadings()` extrahiert neueste Werte, berechnet Differenz | `difference = runoffValue - inflowValue` |
| 8. WS-Listen | `useFertigationKPIs.ts:302-402` | Registriert zwei `sensor_data` Listener für beide Sensor-Config-IDs | Event `sensor_data` mit `data.config_id` Matching |
| 9. WS-Update | Payload: `{ config_id: string, value: number, timestamp: string, ... }` (sensor_handler.py) | Partielles Update für Inflow/Runoff, Neuberechnung von Differenz und Trend | Nur relevante Seite aktualisiert, andere Seite bleibt erhalten |
| 10. Render | FertigationPairWidget Template (Zeile 176-322) | Zeigt KPIs, Differenz mit Farb-Status, Chart | Computed: `formattedDifference`, `differenceClass`, `healthColorClass` |
| 11. Chart | MultiSensorChart.vue (Zeile 314-319) | Historische + Live-Daten für beide Sensoren | Props: `sensors` Array mit Inflow/Runoff-Paar |

---

## Backend API-Vertrag

### Sensor-Daten abfragen (REST Bootstrap)

**Endpoint:** `GET /v1/sensors/data`  
**Source:** El Servador/god_kaiser_server/src/api/v1/sensors.py:1267-1373

**Request-Parameter:**
```typescript
{
  sensor_config_id: "12345678-1234-1234-1234-123456789abc",  // UUID als String
  limit: 100,                                                  // Max 1000
  start_time?: "2026-04-14T00:00:00Z",                        // ISO-String, default: now - 24h
  end_time?: "2026-04-14T23:59:59Z",                          // ISO-String, default: now
  resolution?: "raw" | "1m" | "5m" | "1h" | "1d"             // default: "raw"
}
```

**Response Shape:**
```typescript
{
  success: true,
  esp_id?: string,
  gpio?: number,
  readings: [
    {
      timestamp: "2026-04-14T12:00:00Z",        // ISO-String
      raw_value: 1.234,
      processed_value: 1.245,                    // Nach Kalibrierung, null wenn nicht PI-enhanced
      quality: "good" | "degraded" | "error",
      sensor_type: "ec" | "ph",
      unit: "mS/cm" | "pH",
      zone_id?: string,
      subzone_id?: string,
      min_value?: number,                        // Nur bei aggregierten Daten
      max_value?: number,
      sample_count?: number
    }
  ],
  has_more: boolean,
  next_cursor?: string                           // ISO-Timestamp für Paginierung
}
```

**Implementierung in sensorsApi** (El Frontend/src/api/sensors.ts:115-120):
```typescript
async queryData(query?: SensorDataQuery): Promise<SensorDataResponse> {
  const response = await api.get<SensorDataResponse>('/sensors/data', {
    params: query,
  })
  return response.data
}
```

---

## WebSocket Event-Struktur (Live-Updates)

**Event:** `sensor_data`  
**Handler Location:** `useFertigationKPIs.ts:302-402`

**Payload Shape (per sensor_handler.py):**
```typescript
{
  config_id: "12345678-1234-1234-1234-123456789abc",  // Identifiziert welcher Sensor aktualisiert
  value: 1.250,                                        // Primäres Feld (Display-Wert)
  processed_value?: 1.250,
  reading_value?: 1.250,
  timestamp: "2026-04-14T12:30:45.123Z",             // ISO-String oder Unix ms
  raw_value?: 1.240,
  quality?: "good",
  esp_id?: "ESP_ABC123",
  gpio?: 34,
  sensor_type?: "ec",
  unit?: "mS/cm"
}
```

**Matching-Logik** (useFertigationKPIs.ts:305-307):
```typescript
if (data && data.config_id === inflowSensorId.value) {
  // Update inflow side only
} else if (data && data.config_id === runoffSensorId.value) {
  // Update runoff side only
}
```

---

## Frontend Widget-Architektur

### Props-Interface (FertigationPairWidget.vue:30-49)

```typescript
interface Props {
  inflowSensorId: string              // Sensor-Config UUID (identifiziert eindeutig)
  runoffSensorId: string              // Sensor-Config UUID
  sensorType: 'ec' | 'ph'             // Bestimmt Einheit, Thresholds, Label
  diffWarningThreshold?: number       // default: 0.5 mS/cm oder pH-Einheit
  diffCriticalThreshold?: number      // default: 0.8 mS/cm oder pH-Einheit
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d'  // default: '24h'
  title?: string                      // Fallback: "EC Fertigation" oder "pH Fertigation"
  zoneLabel?: string                  // Zusatzinfo unter Titel
  referenceBands?: ReferenceBand[]    // Optional: Referenzbereiche anzeigen
}

interface ReferenceBand {
  label: string
  min: number
  max: number
  color?: string
}
```

### KPI-Composable (useFertigationKPIs.ts:93-427)

**Initialisierung:**
```typescript
const { kpi, isLoading, error, reload } = useFertigationKPIs({
  inflowSensorId: inflowSensorIdRef,      // Ref<string>
  runoffSensorId: runoffSensorIdRef,      // Ref<string>
  timeRange: timeRangeRef,                // Ref<'1h' | '6h' | '24h' | '7d' | '30d'>
  diffWarningThreshold: diffWarningRef,   // Ref<number>
  diffCriticalThreshold: diffCriticalRef  // Ref<number>
})
```

**Returned KPI-Object** (FertigationKPI Interface, useFertigationKPIs.ts:66-87):
```typescript
{
  inflowValue: number | null              // Latest processed_value for inflow
  runoffValue: number | null              // Latest processed_value for runoff
  difference: number | null               // runoff - inflow
  differenceTrend: 'up' | 'down' | 'stable' | null  // Calculated from last 10 readings
  healthStatus: 'ok' | 'warning' | 'alarm'
  healthReason: string                    // Human-readable explanation
  lastInflowTime: string | null           // ISO timestamp
  lastRunoffTime: string | null           // ISO timestamp
  stalenessSeconds: number | null         // Time diff between inflow/runoff readings
  dataQuality: 'good' | 'degraded' | 'error'
}
```

**Lifecycle:**
- `onMounted()` (Zeile 408-410): Lädt initiale Daten, registriert WS-Listener
- `onUnmounted()` (Zeile 413-418): Cleanup aller WebSocket-Subscriptions
- `watch([inflowSensorId, runoffSensorId])` (Zeile 421-424): Refetch bei ID-Änderung

### Trend-Berechnung (useFertigationKPIs.ts:132-147)

```typescript
function calculateTrend(diffs: number[]): 'up' | 'down' | 'stable' | null {
  if (diffs.length < 3) return null
  
  const recent = diffs.slice(-5)           // Last 5 differences
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2))
  const secondHalf = recent.slice(Math.floor(recent.length / 2))
  
  const avgFirst = sum(firstHalf) / firstHalf.length
  const avgSecond = sum(secondHalf) / secondHalf.length
  
  const diff = avgSecond - avgFirst
  const threshold = 0.05                    // 5% stability margin
  
  if (Math.abs(diff) < threshold) return 'stable'
  return diff > 0 ? 'up' : 'down'
}
```

---

## Dashboard-Store Integration (Dashboard Persistence)

**Widget Type:** `'fertigation-pair'`

**Default Config** (useDashboardWidgets.ts:114-126):
```typescript
'fertigation-pair': {
  sensorType: 'ec',
  timeRange: '24h',
  diffWarningThreshold: 0.5,
  diffCriticalThreshold: 0.8
}
```

**Props-Mapping aus Config** (useDashboardWidgets.ts:276-283):
```typescript
// FertigationPairWidget props
if (config.inflowSensorId) props.inflowSensorId = config.inflowSensorId
if (config.runoffSensorId) props.runoffSensorId = config.runoffSensorId
if (config.sensorType) props.sensorType = config.sensorType
if (config.diffWarningThreshold != null) props.diffWarningThreshold = config.diffWarningThreshold
if (config.diffCriticalThreshold != null) props.diffCriticalThreshold = config.diffCriticalThreshold
if (config.referenceBands) props.referenceBands = config.referenceBands
if (config.title) props.title = config.title
```

---

## Chart-Integration (MultiSensorChart)

**ChartSensors Array** (FertigationPairWidget.ts:133-154):
```typescript
const chartSensors = computed<ChartSensor[]>(() => {
  return [
    {
      id: `inflow_${inflowSensorIdRef.value}`,
      espId: 'mock-esp',                    // Für Mock-Fallback
      gpio: 0,                              // Dummy-Wert
      sensorType: props.sensorType,
      name: 'Inflow',
      color: '#10b981',                     // green-500
      unit: sensorConfig.value?.unit || ''
    },
    {
      id: `runoff_${runoffSensorIdRef.value}`,
      espId: 'mock-esp',
      gpio: 1,
      sensorType: props.sensorType,
      name: 'Runoff',
      color: '#ef4444',                     // red-500
      unit: sensorConfig.value?.unit || ''
    }
  ]
})
```

**Chart Props** (FertigationPairWidget.vue:314-319):
```vue
<MultiSensorChart
  :sensors="chartSensors"
  :time-range="timeRangeRef"
  :height="300"
  :enable-live-updates="true"
/>
```

**Chart-Datenpfad** (MultiSensorChart.vue:40-47):
- Lädt historische Daten via `sensorsApi.queryData()` für beide Sensoren
- Registriert WebSocket-Listener auf `sensor_data` Events
- Dedupliziert Datenpunkte nach ID + Timestamp
- Rendert zwei Linien (Inflow grün, Runoff rot)

---

## Health-Status-Berechnung

**Logik** (useFertigationKPIs.ts:153-191):

| Bedingung | Status | Grund |
|-----------|--------|-------|
| `dataQuality === 'error'` | `alarm` | "Keine Sensordaten verfügbar" |
| `dataQuality === 'degraded'` | `warning` | "Nur ein Sensor liefert Daten" |
| `difference === null` | `alarm` | "Differenz kann nicht berechnet werden" |
| `stalenessSeconds > 300` | `warning` | "Messungen sind XXs auseinander" |
| `\|difference\| >= diffCriticalThreshold` | `alarm` | "Differenz ... über kritischem Schwellwert" |
| `\|difference\| >= diffWarningThreshold` | `warning` | "Differenz ... über Warnschwelle" |
| Sonst | `ok` | "" |

---

## Bekannte Lücken & Limitierungen

| Limitation | Auswirkung | Grund | Lösung |
|-----------|-----------|-------|--------|
| Keine `measurement_role` im Produktionscode | Sensor-Paare reine ID-Zuordnung | `sensor_metadata` Feld existiert, aber wird nicht für Rol­len-Semantik genutzt | ADR-001 siehe unten; Server könnte `measurement_role` validieren |
| Reine ID-Paarung über Widget-Config | Keine serverseitige Validierung | Frontend wählt beliebige zwei Sensor-IDs | Dashboard-Admin trägt Verantwortung für saubere Konfiguration |
| Kein dedizierter Fertigation-Backend-Endpoint | Zwei separate REST-Calls + WS-Listener | Nutzt generischen `/sensors/data` Endpoint | Könnte `/sensors/fertigation/{inflow_id}/{runoff_id}` hinzufügen |
| Chart-Datenpunkt-Limit 1000 | Große Zeiträume werden aggregiert | MultiSensorChart.MAX_DATA_POINTS = 1000 | Server nutzt Auto-Resolution bei großem Zeitbereich |
| Keine dekadierte Alarming-Integration | KPI-Health ist lokal im Widget | Keine Weiterleitung zu zentralem Alarming | Könnte via `onUpdate:config` Events an Global-State propagieren |

---

## Verwendungsbeispiel

```vue
<script setup lang="ts">
import FertigationPairWidget from '@/components/dashboard-widgets/FertigationPairWidget.vue'

const config = {
  inflowSensorId: '12345678-abcd-1234-abcd-123456789abc',  // EC-Sensor Zufluss
  runoffSensorId: '87654321-dcba-4321-dcba-987654321def',  // EC-Sensor Ausfluss
  sensorType: 'ec' as const,
  timeRange: '24h' as const,
  diffWarningThreshold: 0.5,
  diffCriticalThreshold: 0.8,
  title: 'Fertigation EC-Control Zone A',
  zoneLabel: 'Zone A - Gewächshaus 1',
  referenceBands: [
    { label: 'Optimal', min: 0.1, max: 0.3, color: '#10b981' },
    { label: 'Warnung', min: 0.3, max: 0.5, color: '#f59e0b' },
  ]
}
</script>

<template>
  <FertigationPairWidget
    :inflow-sensor-id="config.inflowSensorId"
    :runoff-sensor-id="config.runoffSensorId"
    :sensor-type="config.sensorType"
    :time-range="config.timeRange"
    :diff-warning-threshold="config.diffWarningThreshold"
    :diff-critical-threshold="config.diffCriticalThreshold"
    :title="config.title"
    :zone-label="config.zoneLabel"
    :reference-bands="config.referenceBands"
  />
</template>
```

---

## Testing-Hinweise

**Test-Daten generieren:**
```bash
# Im Backend: Mock-Sensor-Readings mit bekannten Sensor-Config-IDs
curl -X POST http://localhost:8000/v1/sensors/data/mock \
  -H "Content-Type: application/json" \
  -d '{
    "sensor_config_ids": [
      "12345678-abcd-1234-abcd-123456789abc",
      "87654321-dcba-4321-dcba-987654321def"
    ],
    "count": 100,
    "time_range_hours": 24
  }'
```

**Unit-Test Pattern (useFertigationKPIs.ts):**
- Mock `sensorsApi.queryData()` mit bekannten Readings
- Mock WebSocket-Events mit `config_id` Matching
- Assert: `kpi.value.difference`, `kpi.value.healthStatus`, `kpi.value.differenceTrend`

**Integration-Test:**
- Starte Mock-ESP mit zwei EC-Sensoren
- Dashboard mit FertigationPairWidget laden
- Simuliere WebSocket-Updates via `websocketService.emit()`
- Prüfe Chart-Render und KPI-Updates

---

## Referenzen

- **Component:** `El Frontend/src/components/dashboard-widgets/FertigationPairWidget.vue`
- **Composable:** `El Frontend/src/composables/useFertigationKPIs.ts`
- **Chart:** `El Frontend/src/components/charts/MultiSensorChart.vue`
- **API Client:** `El Frontend/src/api/sensors.ts` (queryData method)
- **Backend Endpoint:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` (GET /v1/sensors/data)
- **MQTT Ingest:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- **Widget Registry:** `El Frontend/src/composables/useDashboardWidgets.ts`
- **Config Panel:** `El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue`
