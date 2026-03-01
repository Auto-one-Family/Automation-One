# Erstanalyse: Monitor-Konsolidierung

> **Datum:** 2026-03-01
> **Basis-Auftrag:** `auftrag-monitor-komponentenlayout-erstanalyse.md`
> **Status:** ABGESCHLOSSEN
> **Zweck:** Architektonische Grundlage fuer die Implementierung (Auftraege 1-3)

---

## 1. Live-System-Zustand (AutoOps Debug)

| Komponente | Status | Details |
|-----------|--------|---------|
| **el-frontend** | UP (healthy) | Vite 6.4.1 dev-mode, Port 5173, Build OK |
| **el-servador** | UP (healthy) | FastAPI, Port 8000, Health endpoint OK |
| **MQTT Broker** | UP (healthy) | Mosquitto, Port 1883/9001 |
| **PostgreSQL** | UP (healthy) | 2871 sensor_data Eintraege |
| **WebSocket** | Funktional | Server sendet Sensor-Daten alle 30s |

### Datengrundlage

| Device | Zone | Status | Sensoren | Aktoren | Subzone |
|--------|------|--------|----------|---------|---------|
| MOCK_95A49FCB | Test | **online** | 1 (SHT31) | 0 | - |
| MOCK_0CBACD10 | test | offline | 2 (SHT31, DS18B20) | 0 | - |
| MOCK_57A7B22F | Testneu | offline | 0 | 0 | - |
| MOCK_98D427EA | testneu | offline | 0 | 0 | - |

**Limitierungen fuer Tests:**
- Keine Aktoren konfiguriert → Aktor-Cards nur mit Mock-Daten testbar
- Keine Subzonen konfiguriert → Subzone-Gruppierung nur strukturell verifizierbar
- Nur 1 Online-Device → Sparkline-Daten nur fuer MOCK_95A49FCB

---

## 2. IST-Zustand: MonitorView.vue (985 Zeilen)

### Architektur

```
Route: /monitor (L1), /monitor/:zoneId (L2)
Datenquelle: useEspStore() + useZoneDragDrop().groupDevicesByZone()
```

### Level 1 — Zone-Tiles (ZoneKPI)

- **Funktioniert:** Zone-Tiles mit KPI-Aggregation (Temp-Durchschnitt, Humidity-Durchschnitt, Alarm-Count)
- **Gut:** `qualityToStatus()` Mapping, Sensor-Count pro Zone
- **Problem:** Hartcodierte Sensor-Type-Erkennung fuer Temperatur/Humidity:
  ```typescript
  // Zeile 133-138: Fragile Type-Checks
  s.sensor_type?.toLowerCase().includes('temperature') || s.sensor_type === 'DS18B20'
  s.sensor_type?.toLowerCase().includes('humidity') || s.sensor_type === 'SHT31_humidity'
  ```
  → Sollte `SENSOR_TYPE_CONFIG` oder `groupSensorsByBaseType()` nutzen
- **Fehlt:** Cross-Zone-Dashboard-Sektion (Block 2 des Auftrags)
- **Fehlt:** Kein Status-Dot pro Zone (nur Alarm-Badge)

### Level 2 — Sensor/Aktor-Cards (flach, KEINE Subzonen)

- **Struktur:** Flache Liste `zoneSensors` / `zoneActuators` — filtert Devices by `zone_id`
- **KEIN** Zone→Subzone Nesting (Kernproblem — Block 1 des Auftrags)
- **ConfigPanel-SlideOvers:** SensorConfigPanel + ActuatorConfigPanel vorhanden → muessen fuer Read-Only Monitor entfernt werden
- **Sparkline-Cache:** 30 Punkte max, 5s Deduplizierung — funktioniert
- **Expanded-Panel:** Gauge + LiveLineChart + HistoricalChart + TimeRange-Buttons — gutes Pattern
- **Aktor-Toggle:** `toggleActuator()` mit ON/OFF Command — kann im Monitor bleiben (Aktorsteuerung = Monitor-relevant)

### Wiederverwendbare Teile

| Element | Zeilen | Wiederverwendung |
|---------|--------|-----------------|
| `ZoneKPI` Interface + Computed | 97-154 | Kann in Composable extrahiert werden |
| `qualityToStatus()` | 289-295 | Sollte nach utils ausgelagert werden |
| `sparklineCache` Pattern | 49-84 | Identisch in SensorsView — Composable-Kandidat |
| Sensor-Card Template | 362-467 | Gutes Pattern fuer L2 |
| Expanded Chart Panel | 411-466 | Wiederverwendbar als eigene Komponente |

---

## 3. IST-Zustand: SensorsView.vue (~1638 Zeilen)

### Architektur

```
Route: /sensors (?tab=actuators)
Datenquelle: useEspStore()
Struktur: Tabs → Zone-Accordion → Subzone-Accordion → Cards
```

### Zone/Subzone-Gruppierung (KERN-ASSET fuer Block 1)

**`sensorsByZone` Computed (Z.387-434):**
```
1. Iteriert alle filteredSensors
2. Gruppiert nach zone_id → subzone_id
3. Sortiert: Named Subzones zuerst, "Keine Subzone" am Ende
4. Zones: Benannte Zonen zuerst, "Nicht zugewiesen" am Ende
```

**`actuatorsByZone` Computed (Z.524-571):** — Identische Logik, nur fuer Aktoren

**Problem:** Beide Computeds sind DUPLIZIERT (~90 Zeilen 2x). Perfekter Kandidat fuer Composable-Extraktion (`useZoneGrouping.ts`).

### CRUD-Logik (NICHT portieren)

- Subzone erstellen/umbenennen/loeschen (Z.100-188) — bleibt in SensorsView
- Inline-Create-Input (Z.907-931) — bleibt in SensorsView
- Inline-Rename-Input (Z.946-968) — bleibt in SensorsView

### Filter-System

| Filter | Sensor-Tab | Aktor-Tab |
|--------|-----------|-----------|
| ESP ID (text) | filterEspId | filterEspId |
| Type (multi) | filterSensorType | filterActuatorType |
| Quality/State (multi) | filterQuality | filterState |

→ Filter-Logik kann in useZoneGrouping integriert werden (optional)

### Accordion-State

- `collapsedZones` / `collapsedSubzones` — In-Memory `Set<string>`
- **Kein** localStorage-Persistenz (im Gegensatz zu HardwareView)
- → Auftrag fordert localStorage-Persistenz fuer MonitorView

### Wiederverwendbare Teile

| Element | Zeilen | Wiederverwendung |
|---------|--------|-----------------|
| `sensorsByZone` Computed | 387-434 | KERN: Nach Composable extrahieren |
| `actuatorsByZone` Computed | 524-571 | KERN: Nach Composable extrahieren |
| Zone-Accordion Template | 877-1057 | Pattern-Vorlage fuer MonitorView L2 |
| Subzone-Accordion Template | 933-1053 | Pattern-Vorlage fuer MonitorView L2 |
| Sparkline-Cache | 193-222 | Identisch zu MonitorView — Composable |
| SensorWithContext Interface | 322-335 | Shared Type |
| ActuatorWithContext Interface | 445-458 | Shared Type |

---

## 4. IST-Zustand: CustomDashboardView.vue (~897 Zeilen)

### DashboardLayout Interface (dashboard.store.ts)

```typescript
interface DashboardLayout {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  widgets: DashboardWidget[]
  // FEHLT: scope, zoneId, autoGenerated, sensorId
}
```

**9 Widget-Typen:** line-chart, gauge, sensor-card, historical, multi-sensor, actuator-card, actuator-runtime, esp-health, alarm-list

**Persistenz:** NUR localStorage (`automation-one-dashboard-layouts`)

### Was fehlt fuer Block 2 + 3

- `scope: 'zone' | 'cross-zone' | 'sensor-detail'` Feld
- `zoneId?: string` Feld
- `autoGenerated?: boolean` Feld
- `sensorId?: string` Feld
- `crossZoneDashboards` Computed
- `zoneDashboards(zoneId)` Computed/Getter

---

## 5. IST-Zustand: Weitere Komponenten

### SensorHistoryView.vue (~515 Zeilen)

- **Route:** `/sensor-history`
- **Basis:** vue-chartjs (Line), TimeRangeSelector, sensorsApi.queryData()
- **Eignung fuer L3:** Kann als SlideOver oder als inline-Expansion in MonitorView L2 wiederverwendet werden
- **Vorteil SlideOver:** Kein neuer Route noetig, Focus+Context bleibt erhalten

### ViewTabBar.vue (127 Zeilen)

- 3 Tabs: Uebersicht (/hardware), Monitor (/monitor), Editor (/custom-dashboard)
- Aktiver Tab per Route-Path
- **Keine Aenderung noetig** fuer diesen Auftrag

### Router (index.ts)

- `/monitor` → MonitorView (name: 'monitor')
- `/monitor/:zoneId` → MonitorView (name: 'monitor-zone')
- **Fehlt:** `/monitor/:zoneId/sensor/:sensorId` (fuer L3, Block 4)
- `/sensor-history` → SensorHistoryView (eigene Route)

### Composable: useZoneDragDrop.ts

- `groupDevicesByZone(devices)` — Gruppiert nach zone_id, OHNE Subzone-Nesting
- `ZONE_UNASSIGNED` Konstante exportiert
- **Nicht geeignet** fuer Subzone-Gruppierung → neuer Composable noetig

---

## 6. Identifizierte Bugs und Inkonsistenzen

### Bug 1: Duplizierter Sparkline-Cache

MonitorView (Z.49-84) und SensorsView (Z.193-222) haben **identische** Sparkline-Cache-Logik. Unterschied nur `SPARKLINE_MAX_POINTS` (30 vs 20).

→ **Fix:** Composable `useSparklineCache(maxPoints)` extrahieren

### Bug 2: ZONE_UNASSIGNED Konstante doppelt definiert

- `useZoneDragDrop.ts` exportiert `ZONE_UNASSIGNED = '__unassigned__'`
- `SensorsView.vue` Z.385 definiert `const ZONE_UNASSIGNED = '__unassigned__'` lokal

→ **Fix:** SensorsView soll aus useZoneDragDrop importieren

### Bug 3: Fragile Sensor-Type-Erkennung in MonitorView

```typescript
s.sensor_type?.toLowerCase().includes('temperature') || s.sensor_type === 'DS18B20'
```

SENSOR_TYPE_CONFIG in sensorDefaults.ts hat bereits eine vollstaendige Mapping-Tabelle mit Kategorien. MonitorView nutzt sie nicht.

→ **Fix:** `aggregateZoneSensors()` aus sensorDefaults.ts nutzen statt manuelle Aggregation

### Bug 4: qualityToStatus() dupliziert

MonitorView hat eigenes `qualityToStatus()`. Aehnliche Logik existiert in `getQualityColor()` (SensorsView) und `getESPStatus()` (useESPStatus).

→ **Fix:** Zentralisieren in utils oder als Composable

### Bug 5: Accordion-State ohne Persistenz

SensorsView nutzt In-Memory Sets fuer Accordion-State. Bei Tab-Wechsel geht der Zustand verloren.

→ **Fix:** localStorage-Persistenz wie in HardwareView

---

## 7. Architektur-Entwurf (SOLL-Zustand)

### Neue Composables

#### `useZoneGrouping.ts` (NEU)

```typescript
// Extrahiert aus SensorsView sensorsByZone + actuatorsByZone
export function useZoneGrouping(options?: { filterEspId?: Ref<string> }) {
  // Returns: sensorsByZone, actuatorsByZone, allByZone (combined)
  // Interfaces: SensorWithContext, ActuatorWithContext, SubzoneGroup, ZoneGroup
}
```

#### `useSparklineCache.ts` (NEU)

```typescript
// Extrahiert aus MonitorView + SensorsView
export function useSparklineCache(maxPoints = 30) {
  // Returns: sparklineCache, getSensorKey
  // Auto-watch auf espStore.devices
}
```

### MonitorView Umbau (Block 1-4)

```
Level 1 (/monitor):
├── ViewTabBar
├── Zone-Tiles (bestehend, mit Fix fuer Sensor-Type-Erkennung)
├── Cross-Zone-Dashboard-Links (NEU, Block 2)
│   └── LinkCards → /custom-dashboard?layout={id}
└── EmptyState

Level 2 (/monitor/:zoneId):
├── Breadcrumb: Monitor → [Zone Name]
├── Zone-Dashboards (NEU, Block 3)
│   └── Auto-generierte + User-erstellte Dashboard-Links
├── Subzone-Accordion (NEU, von SensorsView portiert)
│   ├── Subzone A
│   │   ├── SensorCard[] (Read-Only, mit Sparkline + Status-Dot)
│   │   └── ActuatorCard[] (mit Toggle, KEIN Config-Button)
│   └── Subzone B
│       └── ...
└── EmptyState

Level 3 (SlideOver oder /monitor/:zoneId/sensor/:sensorId):
├── Volle Zeitreihe (SensorHistoryView-Logik)
├── TimeRangeSelector
├── Threshold-Linien
└── CSV-Export
```

### DashboardLayout Erweiterung (Block 2+3)

```typescript
export interface DashboardLayout {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  widgets: DashboardWidget[]
  // NEU:
  scope?: 'zone' | 'cross-zone' | 'sensor-detail'
  zoneId?: string           // nur bei scope === 'zone'
  autoGenerated?: boolean   // true = auto-update moeglich
  sensorId?: string         // nur bei scope === 'sensor-detail'
}
```

### Entfernungen aus MonitorView

| Element | Aktion | Grund |
|---------|--------|-------|
| SensorConfigPanel SlideOver | ENTFERNEN | Monitor = Read-Only |
| ActuatorConfigPanel SlideOver | ENTFERNEN | Monitor = Read-Only |
| `openSensorConfig()` | ENTFERNEN | Kein Config im Monitor |
| `openActuatorConfig()` | ENTFERNEN | Kein Config im Monitor |
| Config-Button in expanded panel | ENTFERNEN | Read-Only |

### Beibehaltungen

| Element | Grund |
|---------|-------|
| Aktor-Toggle (ON/OFF) | Steuerung gehoert zum Monitoring |
| Sparkline + Expanded Charts | Kern-Feature des Monitors |
| ViewTabBar | Gemeinsame Navigation |

---

## 8. Implementierungsreihenfolge (Empfehlung)

| Schritt | Block | Was | Aufwand |
|---------|-------|-----|---------|
| 1 | Vorbereitung | `useZoneGrouping.ts` Composable extrahieren | Klein |
| 2 | Vorbereitung | `useSparklineCache.ts` Composable extrahieren | Klein |
| 3 | Vorbereitung | ZONE_UNASSIGNED Import-Fix in SensorsView | Trivial |
| 4 | Block 1 | MonitorView L2 mit Subzone-Accordion umbauen | Mittel |
| 5 | Block 1 | ConfigPanels entfernen, Read-Only durchsetzen | Klein |
| 6 | Block 1 | Accordion localStorage-Persistenz | Klein |
| 7 | Block 2 | DashboardLayout Interface erweitern | Klein |
| 8 | Block 2 | Cross-Zone-Dashboard-Links auf L1 | Klein |
| 9 | Block 3 | Zone-Dashboard-Links auf L2 | Klein |
| 10 | Block 4 | Sensor-Detail als SlideOver (L3) | Mittel |
| 11 | Block 5 | Auto-Generierungs-Logik | Mittel |
| 12 | Cleanup | Bug-Fixes (Sensor-Type, qualityToStatus, etc.) | Klein |

---

## 9. Risiken und Abhaengigkeiten

| Risiko | Impact | Mitigation |
|--------|--------|------------|
| SensorsView-Logik-Extraktion bricht bestehende View | Hoch | Composable als Wrapper, SensorsView importiert statt eigener Logik |
| DashboardLayout-Erweiterung bricht bestehende Layouts | Mittel | Neue Felder optional (scope?), Fallback auf alte Layouts |
| Keine Subzone-Testdaten vorhanden | Niedrig | Mock-ESP mit Subzone erstellen oder Struktur-Tests |
| Auto-Generierung kollidiert mit User-Layouts | Mittel | `autoGenerated` Flag strikt pruefen, User-Layout nie ueberschreiben |

---

## 10. Betroffene Dateien (vollstaendig)

| Datei | Aenderungstyp | Bloecke |
|-------|---------------|---------|
| **NEU:** `composables/useZoneGrouping.ts` | Erstellen | 1 |
| **NEU:** `composables/useSparklineCache.ts` | Erstellen | 1 |
| `views/MonitorView.vue` | Umbau (gross) | 1, 2, 3, 4 |
| `views/SensorsView.vue` | Refactor (Import statt lokale Logik) | 1 |
| `shared/stores/dashboard.store.ts` | Interface-Erweiterung | 2, 3, 5 |
| `router/index.ts` | Neue Route (optional fuer L3) | 4 |
| `types/index.ts` | Shared Interfaces | 1 |

---

*Erstanalyse abgeschlossen. Bereit fuer Implementierung Block 1-5.*
