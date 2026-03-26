# PB-05 Analyse: Subzone-Vergleichs-Widget

> **Datum:** 2026-03-26
> **Typ:** Analyse-Bericht (kein Code)
> **Status:** ABGESCHLOSSEN

---

## Zusammenfassung (TL;DR)

**Empfehlung: Option A — Multi-Sensor-Chart erweitern** mit einem "Compare Mode" Toggle. Die bestehende Chart-Logik (Zoom, TimeScale, Live-Updates, Dual-Y, Min/Max-Bänder) ist zu wertvoll um sie zu duplizieren. Ein neuer Widget-Typ würde ~70% Code-Dopplung bedeuten. Stattdessen bekommt MultiSensorWidget einen "Auto-Fill by Sensor Type" Modus, der alle Sensoren eines Typs in der aktuellen Zone automatisch als Datasets einfügt — mit Subzone-Namen als Labels.

**Aufwand MVP:** ~6-8h Implementierung (3 Dateien ändern, 1 neue Utility)

---

## Block 1: Multi-Sensor-Chart für Vergleiche nutzbar?

### 1.1 — Aktueller vs. Wunsch-Flow

| Aspekt | Aktuell | Wunsch (Compare Mode) |
|--------|---------|----------------------|
| Sensor-Auswahl | Manuell, einzeln per Chip-UI | Auto: sensorType + Zone → alle passenden Sensoren |
| Labels | `sensor.name` oder `sensor_type` | Subzone-Name: "Pflanze 1", "Pflanze 2" |
| Trigger | User klickt "+" pro Sensor | Toggle "Subzonen vergleichen" → Auto-Fill |
| Max Sensoren | Unbegrenzt (wird unlesbar) | Capped bei 4 (UI-Limit) |

**Fazit:** Das ist eine Erweiterung des bestehenden Multi-Sensor-Charts, kein neuer Widget-Typ. Der "Compare Mode" ist ein alternativer Konfigurations-Pfad im selben Widget.

### 1.2 — "Auto-Fill by Sensor Type" Modus

**Vorgeschlagener Config-Flow:**

```
┌─ MultiSensorWidget ──────────────────────────┐
│                                               │
│  ○ Manuell (aktuell)    ● Vergleichs-Modus   │  ← Toggle
│                                               │
│  Sensortyp: [▼ temperature        ]          │  ← Dropdown
│  Zone:      [▼ Zelt Wohnzimmer    ]          │  ← Auto aus Dashboard-zoneId
│                                               │
│  Gefunden: 3 Sensoren in 3 Subzonen           │
│  ☑ Pflanze 1 (ESP_472204:4)                   │
│  ☑ Pflanze 2 (ESP_472204:5)                   │
│  ☑ Pflanze 3 (ESP_8A1B2C:7)                   │
│  ☐ Pflanze 4 (ESP_8A1B2C:8) [max 4]          │
│                                               │
└───────────────────────────────────────────────┘
```

**Config-Felder (neu):**

```typescript
config: {
  // Bestehend:
  dataSources?: string      // "espId:gpio:sensorType,..."
  timeRange?: string
  // Neu:
  compareMode?: boolean     // Toggle: manual vs. compare
  compareSensorType?: string // z.B. "temperature"
  compareZoneId?: string    // Zone-Filter (default: dashboard.zoneId)
}
```

Wenn `compareMode === true`, werden `dataSources` automatisch berechnet aus `useSensorOptions(compareZoneId)` gefiltert nach `compareSensorType`. Der User kann einzelne Sensoren an/abwählen (Checkboxen).

### 1.3 — Labeling: Subzone-Name statt ESP-ID

**IST:** Labels werden in [MultiSensorWidget.vue:51-74](El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue#L51-L74) aufgebaut:
```typescript
name: sensor?.name || sensor?.sensor_type || `GPIO ${gpio}`
```

**Subzone-Name verfügbar?** Ja, über 3 Wege:
1. `device.subzones.find(sz => sz.assigned_gpios.includes(gpio))?.subzone_name`
2. `useSubzoneResolver` Map: `${espId}-${gpio}` → `{subzoneName}`
3. `useSensorOptions` → `subgroup.label` (= Subzone-Name)

**SOLL (Compare Mode):**
```typescript
// Compare Mode: Subzone-Name als Label
name: subzoneName || sensor?.name || `GPIO ${gpio}`
```

**Betroffene Stelle:** [MultiSensorWidget.vue](El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue) — ChartSensor-Aufbau (Zeile ~51-74).

---

## Block 2: Neuer Widget-Typ vs. Erweiterung

### 2.1 — Option A: Multi-Sensor-Chart erweitern (EMPFOHLEN)

| Pro | Contra |
|-----|--------|
| Kein neuer Widget-Typ (spart 8 Registrierungsstellen) | MultiSensorWidget wird komplexer (~40 Zeilen mehr) |
| Wiederverwendung: Chart.js-Setup, Zoom, TimeScale, Live-Updates, Min/Max-Bänder, Dual-Y-Achse | Zwei Modi (Manual + Compare) in einem Widget |
| User kann zwischen Modi wechseln ohne Widget zu löschen | — |
| `dataSources`-Format bleibt identisch (kompatibel) | — |

### 2.2 — Option B: Neuer Widget-Typ `subzone-compare`

| Pro | Contra |
|-----|--------|
| Klarer Fokus, einfachere Config | **~70% Code-Dopplung** mit MultiSensorChart |
| Eigene Default-Größe möglich | 8 Registrierungsstellen: Component, widgetComponentMap, WIDGET_TYPE_META, WIDGET_DEFAULT_CONFIGS, WidgetType-Union, mountWidgetToElement, WidgetConfigPanel, AddWidgetDialog |
| — | Parallele Wartung zweier Chart-Widgets |
| — | User muss wissen welches Widget er braucht |

### 2.3 — Empfehlung: Option A

**Begründung:**
1. Die Chart-Logik in [MultiSensorChart.vue](El Frontend/src/components/charts/MultiSensorChart.vue) (~730 Zeilen) ist zu komplex um sie zu duplizieren: TimeScale, Auto-Resolution, Live-Updates via WebSocket, Min/Max-Bänder, Dual-Y-Achse, 5000-Punkt-Capping.
2. Der Unterschied zwischen "manuell 3 Sensoren wählen" und "automatisch 3 Sensoren eines Typs laden" ist nur ein Config-Unterschied — die Chart-Darstellung ist identisch.
3. `dataSources` bleibt das gleiche Format (`"espId:gpio:sensorType,..."`) — der Chart sieht keinen Unterschied.
4. Die Registrierung eines neuen Widget-Typs erfordert Änderungen an 8 Stellen (siehe [useDashboardWidgets.ts](El Frontend/src/composables/useDashboardWidgets.ts)).

---

## Block 3: Daten-Query für Vergleiche

### 3.1 — API: Kein Batch-Endpoint vorhanden

**IST-Zustand:** `GET /v1/sensors/data` akzeptiert:
- `esp_id`, `gpio`, `sensor_type` — einzelner Sensor
- `zone_id`, `subzone_id` — Filter, aber Response enthält gemischte Sensoren
- `sensor_config_id` — einzelne Config-UUID
- `resolution` — `raw|1m|5m|1h|1d`

**Kein Batch-Endpoint** für `sensor_ids=[id1,id2,id3]`.

**Aktuelles Verhalten im MultiSensorChart:** N parallele API-Calls, einer pro Sensor ([MultiSensorChart.vue:512-625](El Frontend/src/components/charts/MultiSensorChart.vue#L512-L625)):
```typescript
// Für jeden Sensor parallel:
sensorsApi.queryData({ esp_id, gpio, sensor_type, start_time, end_time, limit: 5000, resolution })
```

**Performance-Einschätzung für 4 Subzonen:**

| Zeitraum | Resolution | Punkte/Sensor | Total (4 Sensoren) | Bewertung |
|----------|-----------|---------------|---------------------|-----------|
| 1h | raw | ~720 | ~2.880 | Schnell |
| 24h | 5m | ~288 | ~1.152 | Schnell |
| 7d | 1h | ~168 | ~672 | Schnell |
| 30d | 1d | ~30 | ~120 | Schnell |

**Fazit:** 4 parallele Calls mit max. ~2000 Punkten pro Call sind kein Problem. Ein Batch-Endpoint wäre Nice-to-have (spart HTTP-Overhead), ist aber für Phase B nicht notwendig. Für Phase C (Zone-zu-Zone mit 8+ Sensoren) könnte ein Batch-Endpoint sinnvoll werden.

### 3.2 — Subzone-Metadaten im Frontend

**"Alle Sensoren eines Typs in Zone X" finden — Algorithmus:**

```typescript
// Via useSensorOptions(ref(zoneId)):
const { groupedSensorOptions } = useSensorOptions(ref(compareZoneId))

const matchingSensors = groupedSensorOptions.value
  .flatMap(zone => zone.subgroups)
  .flatMap(subzone => subzone.options.map(opt => ({
    ...opt,
    subzoneName: subzone.label,    // Subzone-Name direkt verfügbar
    subzoneId: subzone.subzoneId,  // Subzone-ID direkt verfügbar
  })))
  .filter(opt => opt.sensorType === compareSensorType)
```

**useSensorOptions liefert alles was nötig ist:**
- `SensorOptionGroup.label` = Zone-Name
- `SensorSubgroup.label` = Subzone-Name
- `SensorSubgroup.subzoneId` = Subzone-ID
- `SensorOption.sensorType` = Sensor-Typ zum Filtern
- `SensorOption.value` = `"espId:gpio:sensorType"` (direkt als dataSource nutzbar)

**Kein neuer API-Call nötig** — die Daten sind bereits im espStore.

### 3.3 — Farb-Zuordnung pro Subzone

**IST-Zustand:** 8 feste Farben in [chartColors.ts](El Frontend/src/utils/chartColors.ts), Index-basierte Rotation:
```typescript
export const CHART_COLORS = [
  '#60a5fa', '#34d399', '#fbbf24', '#f87171',
  '#a78bfa', '#22d3ee', '#fb923c', '#f472b6',
]
```

**Problem:** Index-basiert = instabil. Wenn Sensor 2 entfernt wird, verschieben sich alle Farben.

**Lösung für Compare Mode:** Subzone-basierte Farbzuordnung mit deterministischem Hash:
```typescript
// Neue Utility: getSubzoneChartColor(subzoneId: string): string
// Deterministischer Hash → Index in CHART_COLORS
// "Pflanze 1" = immer Blau, "Pflanze 2" = immer Grün (stabil)
```

Alternative (einfacher): Alphabetische Sortierung der Subzonen → feste Index-Zuordnung. "Pflanze 1" = Index 0 = Blau, "Pflanze 2" = Index 1 = Grün. Stabil solange keine Subzonen umbenannt werden.

**Empfehlung:** Alphabetische Sortierung reicht für MVP. Hash-basierte Farben sind Phase C.

---

## Block 4: Erweiterte Vergleichs-Features (Bewertung)

### 4.1 — Delta-Chart (Differenz zwischen Subzonen)

| Aspekt | Einschätzung |
|--------|-------------|
| Chart.js-Machbarkeit | Ja: berechnetes Dataset `deltaData = sensorA.map((p,i) => p.y - sensorB[i]?.y)` |
| Frontend vs. Backend | Frontend-Berechnung reicht (kleine Datenmengen, gleiche Timestamps durch Resolution) |
| Komplexität | Mittel: Timestamp-Alignment nötig (Sensoren liefern nicht exakt gleiche Timestamps) |
| Nutzen | Hoch für fortgeschrittene Nutzer, niedrig für Einsteiger |
| **Empfehlung** | **Phase C** — MVP braucht erst den Overlay-Chart als Basis |

### 4.2 — Statistik-Overlay auf Vergleichs-Chart

| Aspekt | Einschätzung |
|--------|-------------|
| Min/Max/Avg pro Subzone | Server liefert bereits `min_value`, `max_value` bei aggregierten Resolutions |
| Chart.js Annotations | `chartjs-plugin-annotation` für horizontale Linien (Avg pro Subzone) |
| Interaktion mit PB-03 | Stats-API (`GET /{esp_id}/{gpio}/stats`) liefert `min`, `max`, `avg`, `stddev` — wiederverwendbar |
| **Empfehlung** | **Phase B** machbar als optionaler Toggle, aber nicht MVP-kritisch |

### 4.3 — Zone-zu-Zone-Vergleich

| Aspekt | Einschätzung |
|--------|-------------|
| Scope | Gleicher sensorType über verschiedene ZONEN |
| Widget-Typ | Gleicher Compare Mode, aber ohne `filterZoneId` → `useSensorOptions(undefined)` |
| Problem | Welchen Sensor pro Zone nehmen? Aggregat? Oder explizit "Zone A Sensor 1 vs. Zone B Sensor 1"? |
| Datenmodell | `useZoneKPIs` aggregiert nur pro Zone, keine Per-Sensor Auswahl |
| **Empfehlung** | **Phase C** — erfordert UX-Entscheidung (Aggregat vs. explizite Auswahl) |

---

## Betroffene Dateien

### Muss geändert werden (MVP):

| Datei | Änderung | Aufwand |
|-------|----------|---------|
| [MultiSensorWidget.vue](El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue) | Compare Mode Toggle, Auto-Fill UI, Subzone-Label-Logik | ~3h |
| [dashboard.store.ts](El Frontend/src/shared/stores/dashboard.store.ts) | `compareMode`, `compareSensorType`, `compareZoneId` in Config-Interface | ~15min |
| [useDashboardWidgets.ts](El Frontend/src/composables/useDashboardWidgets.ts) | Neue Config-Felder in mountWidgetToElement Props-Mapping | ~15min |

### Kann unverändert bleiben:

| Datei | Grund |
|-------|-------|
| [MultiSensorChart.vue](El Frontend/src/components/charts/MultiSensorChart.vue) | Empfängt fertige `ChartSensor[]` — kein Unterschied ob manuell oder auto-filled |
| [useSensorOptions.ts](El Frontend/src/composables/useSensorOptions.ts) | Liefert bereits Zone→Subzone→Sensor Hierarchie mit sensorType |
| [chartColors.ts](El Frontend/src/utils/chartColors.ts) | CHART_COLORS-Palette reicht (8 Farben > 4 Max-Subzonen) |
| [WidgetConfigPanel.vue](El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue) | multi-sensor Config ist im Widget selbst, nicht im Panel |
| Server-Endpoints | Kein Batch-Endpoint nötig, 4 parallele Calls sind performant |

### Optional (Nice-to-have):

| Datei | Änderung | Wann |
|-------|----------|------|
| Neue Utility `subzoneCompareHelper.ts` | Logik für "finde alle Sensoren eines Typs in Zone" + Subzone-Label-Resolution | Bei Bedarf extrahieren |

---

## Aufwand-Schätzung MVP

| Schritt | Aufwand |
|---------|---------|
| 1. Config-Interface erweitern (store + useDashboardWidgets) | 30min |
| 2. Compare Mode UI in MultiSensorWidget (Toggle + Dropdowns + Checkboxen) | 3h |
| 3. Auto-Fill Logik (useSensorOptions → Filter → dataSources) | 1h |
| 4. Subzone-Label Resolution im ChartSensor-Aufbau | 1h |
| 5. Alphabetische Subzone-Sortierung für stabile Farben | 30min |
| 6. Build-Verifikation + manueller Test | 1h |
| **Total** | **~7h** |

---

## Abgrenzung Phase B vs. Phase C

### Phase B (MVP — dieser Auftrag):
- Compare Mode Toggle in MultiSensorWidget
- Auto-Fill: sensorType + Zone → alle passenden Sensoren (max 4)
- Subzone-Namen als Dataset-Labels
- Stabile Farben via alphabetische Sortierung
- 4 parallele API-Calls (kein Batch)

### Phase C (später):
- Delta-Chart (Differenz zwischen Subzonen)
- Zone-zu-Zone-Vergleich
- Hash-basierte deterministische Farbzuordnung
- Batch-API-Endpoint für mehrere Sensoren
- Statistik-Overlay (Min/Max/Avg Annotations)
- Heatmap-Visualisierung (Zone × Zeit Matrix)

---

## Interaktion mit anderen PB-Aufträgen

| Auftrag | Interaktion |
|---------|-------------|
| **PB-02 (Dual-Y-Achse)** | Kein Konflikt: Compare Mode vergleicht gleichen sensorType → gleiche Y-Achse. Dual-Y aktiviert sich nur bei gemischten Typen (Manual Mode). |
| **PB-03 (Statistik-Widget)** | Synergie: Stats-API (`/{esp_id}/{gpio}/stats`) kann für Statistik-Overlay im Compare Mode wiederverwendet werden (Phase C). |
| **PB-04 (Threshold-Lines)** | Synergie: Threshold-Annotations können im Compare Mode als "Zielbereich" angezeigt werden (z.B. optimale Temperatur 20-25°C). |

---

*Bericht erstellt: 2026-03-26 | Agent: Claude Opus 4.6 | Keine Code-Änderungen*
