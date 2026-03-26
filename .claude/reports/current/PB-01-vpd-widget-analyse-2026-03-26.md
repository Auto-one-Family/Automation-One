# PB-01 Analyse: VPD-Widget — Zeitreihe & Backend-Persistierung

> **Datum:** 2026-03-26
> **Typ:** Analyse-Bericht (kein Code)
> **Status:** Abgeschlossen

---

## Executive Summary

VPD-Berechnung existiert serverseitig (`zone_kpi_service.py`), wird aber weder persistiert noch als Zeitreihe angeboten. Das Frontend zeigt VPD nirgends an — weder in ZoneTiles noch als Widget. Das Widget-System ist bereit für VPD: `HistoricalChartWidget` und `GaugeWidget` funktionieren mit minimalen Anpassungen, sofern VPD als `sensor_data` persistiert wird. **Growth-Phase existiert bereits vollständig** im Backend (`zone_contexts.growth_phase`), wird aber im Monitor nicht genutzt.

**Empfehlung:** Option A (Server-Persistierung) mit Hybrid-Ansatz — VPD bei jedem Temp/RH-Eingang berechnen und als `sensor_data` speichern. Bestehende Widgets, APIs und Aggregation funktionieren dann 1:1.

---

## Block 1: Backend VPD-Persistierung

### 1.1 — VPD-Berechnung: Wo und Wie

**Datei:** `El Servador/god_kaiser_server/src/services/zone_kpi_service.py`

**Funktion `_calculate_vpd`** (Zeilen 33–41):
```python
def _calculate_vpd(temp_c: float, humidity_pct: float) -> float:
    svp = 0.6108 * math.exp((17.27 * temp_c) / (temp_c + 237.3))
    vpd = svp * (1.0 - humidity_pct / 100.0)
    return round(max(vpd, 0.0), 3)
```

| Aspekt | Befund |
|--------|--------|
| **Formel** | Magnus-Tetens Approximation |
| **VPD-Typ** | **Air-VPD** (kein Leaf-Temperature-Offset) |
| **Einheit** | kPa, 3 Dezimalstellen |
| **Temp-Priorität** | `sht31_temp` > `bmp280_temp` > `ds18b20` |
| **Humidity-Priorität** | `sht31_humidity` > `bmp280_humidity` |
| **Input-Quelle** | `sensor_data` DB-Tabelle via `_get_latest_sensor_value()` (SQL, kein Cache) |

**Methode `calculate_vpd(zone_id)`** (Zeilen 67–80): Holt den neuesten Temp- und Humidity-Wert aus der DB für eine Zone, berechnet VPD, gibt `{"vpd": float, "temp": float, "humidity": float}` zurück. Wird nur on-demand bei API-Aufruf ausgeführt.

**API-Endpoint:** `GET /v1/zone/context/{zone_id}/kpis` — liefert VPD + DLI + Growth + Health als Bundle.

### 1.2 — Kann VPD persistiert werden?

**`sensor_data` Tabelle** (`src/db/models/sensor.py`, Zeilen 296–451):
- `sensor_type: String(50)` — **kein Enum**, freie Strings → `'vpd'` technisch möglich
- `unit: String(20)` — `'kPa'` passt
- `processing_mode: String(20)` — `'computed'` als neuer Wert möglich

**Blocker: `gpio` ist NOT NULL** (Zeile 337–341, `Mapped[int]`, `nullable=False`).
- UNIQUE-Constraint: `(esp_id, gpio, sensor_type, timestamp)`
- Ein berechneter VPD-Wert hat keinen physischen GPIO

**Lösungsoptionen für GPIO-Blocker:**

| Option | Bewertung |
|--------|-----------|
| `gpio = -1` (Sentinel) | Funktioniert ohne Migration, aber semantisch unsauber |
| `gpio` nullable machen | Korrekt, braucht Alembic-Migration, bricht ggf. andere Queries |
| Neue Tabelle `derived_data` | Sauberste Lösung, aber dupliziert Schema + Repository-Code |
| **`gpio = 0` + `data_source = 'COMPUTED'`** | Pragmatisch, `data_source`-Feld existiert bereits (String(20)), kein GPIO 0 im realen Betrieb |

**Sensor Type Registry** (`src/sensors/sensor_type_registry.py`):
- `SENSOR_TYPE_MAPPING`: Kein VPD-Eintrag
- `MULTI_VALUE_SENSORS`: Kein VPD-Eintrag
- `SENSOR_TYPE_MOCK_DEFAULTS`: Kein VPD-Eintrag
- Registry ist auf physische ESP32-Sensoren ausgelegt — VPD passt nicht ins Schema

**Derived Metrics Konzept:** Existiert nicht. Kein Service, kein Pattern, kein Beispiel für berechnete Metriken.

**Background-Service-Infrastruktur:** `CentralScheduler` in `src/services/maintenance/service.py` — 6+ registrierte Jobs. Ein neuer `compute_vpd`-Job könnte hier eingehängt werden, aber das Intervall-Pattern (periodic) passt nicht ideal — VPD sollte event-driven bei jedem neuen Temp/RH-Wert berechnet werden.

### 1.3 — Architektur-Optionen: Bewertung

#### Option A: Server-Persistierung (EMPFOHLEN)

**Beschreibung:** VPD wird im `SensorDataHandler` bei jedem eingehenden `sht31_temp` oder `sht31_humidity` Wert berechnet und als `sensor_data`-Row mit `sensor_type='vpd'` gespeichert.

**Wiederverwendete Module:**
- `SensorDataHandler` (`src/mqtt/handlers/sensor_handler.py`) — Hook nach Temp/RH-Verarbeitung
- `SensorRepository.save_data()` — identisches INSERT
- `_calculate_vpd()` aus `zone_kpi_service.py` — Formel extrahieren in shared util
- Alle bestehenden Query-Endpoints (`GET /sensors/data`) — funktionieren 1:1
- Aggregation (`1m/5m/1h/1d`) — funktioniert 1:1
- `HistoricalChartWidget` — funktioniert 1:1

**Neue Dateien/Änderungen:**
- `src/sensors/vpd_calculator.py` (neu) — extrahierte VPD-Formel + Lookup-Logik
- `sensor_handler.py` — Hook nach Temp/RH-Speicherung: "Hat diese Zone auch den komplementären Wert? → VPD berechnen & speichern"
- `SENSOR_TYPE_CONFIG` im Frontend — neuer Eintrag `vpd: { label, unit, min, max }`
- `gpio=0` + `data_source='COMPUTED'` — kein Schema-Change nötig

**Performance (7d, 5min-Aggregation):**
- ~2016 Datenpunkte — identisch zu jedem anderen Sensor
- Kein zusätzlicher Query-Overhead, da bestehende Aggregation genutzt wird
- Zusätzlicher Speicher: ~1 Row pro Temp/RH-Eingang × Anzahl Zonen mit SHT31

**Vorteil:** Alle bestehenden Widgets, APIs, Aggregation, WebSocket-Events funktionieren sofort. VPD ist ein "normaler Sensor" im System.

**Nachteil:** Doppelte Datenhaltung (T + RH + VPD statt nur T + RH). Bei 5min-Intervall und 10 Zonen: ~2880 extra Rows/Tag — vernachlässigbar.

#### Option B: On-the-fly API

**Beschreibung:** Neuer Endpoint `GET /v1/sensors/vpd-history?zone_id=X&from=...&to=...` berechnet VPD aus gespeicherten T/RH-Paaren.

**Wiederverwendete Module:**
- `SensorRepository.query_data()` — 2x (Temp + Humidity)
- `_calculate_vpd()` — auf jeden Zeitpunkt anwenden
- Aggregationslogik müsste dupliziert werden (eigene Bucket-Logik)

**Neue Dateien:**
- `src/api/v1/vpd.py` (neu) — Endpoint + Join-Logik
- Frontend: Neuer API-Client, angepasstes Widget das diesen Endpoint nutzt

**Performance (7d, 5min):**
- 2 DB-Queries (Temp + RH), jeder ~2016 Rows
- Zeitpunkt-Matching (T und RH haben nicht exakt gleiche Timestamps) → Nearest-Neighbor-Join nötig
- Berechnung: 2016× VPD-Formel — CPU-trivial
- **Problem:** Aggregation müsste selbst implementiert werden, da PostgreSQL `date_trunc` nicht auf berechnete Werte anwendbar

**Vorteil:** Kein zusätzlicher Speicher, immer aktuell.

**Nachteil:** Zeitpunkt-Matching-Komplexität, eigene Aggregation, nicht mit bestehenden Widgets kompatibel, langsamer bei großen Zeiträumen.

#### Option C: Frontend-Berechnung

**Beschreibung:** Widget holt T + RH Zeitreihen und berechnet VPD clientseitig in JavaScript.

**Wiederverwendete Module:**
- `sensorsApi.queryData()` — 2x (Temp + Humidity)
- Chart-Komponenten — eigenes Dataset mit berechneten Werten

**Neue Dateien:**
- `src/utils/vpdCalculator.ts` (neu) — VPD-Formel
- Neues Widget oder erweitertes `MultiSensorChart` mit computed-Dataset

**Performance (7d, 5min):**
- 2× 2016 Datenpunkte transferiert (statt 1× 2016 für VPD)
- Client-CPU für 2016× Berechnungen — trivial
- Timestamp-Matching im Frontend — fehleranfällig

**Vorteil:** Keine Backend-Änderung.

**Nachteil:** Doppelte Datenmenge über HTTP, Timestamp-Matching-Komplexität im Frontend, nicht in bestehenden Widgets nutzbar, keine Server-Aggregation, VPD nicht in Alarmsystem nutzbar.

### 1.4 — Empfehlung

**Option A (Server-Persistierung)** ist klar überlegen:

1. **Systemkonsistenz:** VPD wird zum "normalen Sensor" — alle bestehenden Patterns greifen
2. **Widget-Kompatibilität:** `HistoricalChartWidget`, `GaugeWidget`, `MultiSensorChart` funktionieren ohne Änderung
3. **Aggregation:** PostgreSQL `date_trunc` funktioniert 1:1
4. **WebSocket:** `sensor_data`-Events propagieren VPD automatisch ans Frontend
5. **Alarmfähig:** VPD könnte zukünftig ins Alarmsystem eingebunden werden
6. **Speicherkosten:** Marginal (~3 KB/Tag pro Zone)

**Implementierungsstrategie:** Event-driven im `SensorDataHandler` — bei jedem `sht31_temp` oder `sht31_humidity` Eingang prüfen ob der komplementäre Wert für dieselbe Zone/Device existiert, dann VPD berechnen und als `sensor_data` Row mit `gpio=0`, `sensor_type='vpd'`, `data_source='COMPUTED'` speichern.

---

## Block 2: Frontend VPD-Widget-Typen

### 2.0 — Widget-Registrierung (4 Stellen in einer Datei)

Alle 4 Registrierungspunkte liegen in **`El Frontend/src/composables/useDashboardWidgets.ts`**:

| Punkt | Zeilen | Beschreibung |
|-------|--------|-------------|
| `widgetComponentMap` | 77–87 | Component-Import-Map (9 Typen) |
| `WIDGET_TYPE_META` | 90–100 | Label, Icon, Größe, Kategorie |
| `WIDGET_DEFAULT_CONFIGS` | 103–113 | Default-Props pro Typ |
| `mountWidgetToElement` | 235–252 | Prop-Pass-Liste (config → component-props) |

**Aktuell 9 Widget-Typen:** `line-chart`, `gauge`, `sensor-card`, `actuator-card`, `historical`, `esp-health`, `alarm-list`, `actuator-runtime`, `multi-sensor`

### 2.1 — VPD-Zeitverlauf (Historical Chart)

**Basis:** `HistoricalChartWidget.vue` + `HistoricalChart.vue`

| Aspekt | Befund |
|--------|--------|
| Akzeptiert beliebigen `sensor_type`? | **Ja** — `sensor_type` wird als String an API übergeben, kein Whitelist-Check |
| Funktioniert mit persistiertem VPD (Option A)? | **Ja, 1:1** — Query `sensor_type='vpd'` liefert Daten, Chart zeigt sie |
| Aggregation (5m, 1h, 1d)? | **Ja** — `resolution`-Parameter wird durchgereicht |
| Min/Max-Band? | **Ja** — bereits implementiert für aggregierte Daten (Zeilen 312–339) |
| Background-Zonen-Bänder? | **Teilweise** — `chartjs-plugin-annotation@3.1.0` ist installiert, aktuell nur `type: 'line'` genutzt. `type: 'box'` wird unterstützt aber muss hinzugefügt werden |
| Dual-Y-Achse? | **Nein** — nur in `MultiSensorChart`. Für VPD allein nicht nötig |

**Aufwand für VPD-Zonen-Bänder:** ~20 Zeilen Code in `HistoricalChart.vue` — Box-Annotations für die VPD-Bereiche (0.4–0.8 gelb, 0.8–1.2 grün, 1.2–1.6 gelb, >1.6 rot) als `chartOptions.plugins.annotation.annotations`. Kein neuer Widget-Typ nötig.

**Fehlende Voraussetzung:** `SENSOR_TYPE_CONFIG` in `sensorDefaults.ts` braucht einen `vpd`-Eintrag:
```typescript
vpd: { label: 'VPD', unit: 'kPa', min: 0, max: 3.0, icon: '...' }
```

### 2.2 — VPD-Gauge

**Basis:** `GaugeWidget.vue` + `GaugeChart.vue`

| Aspekt | Befund |
|--------|--------|
| Dynamische Farbzonen? | **Ja** — `GaugeThreshold[]` aus `warnLow/warnHigh/alarmLow/alarmHigh` Props |
| Sensor-Typ-abhängig? | **Indirekt** — `SENSOR_TYPE_CONFIG[sensorType].min/max` für Scale, Farben aus Threshold-Props |
| VPD-Zonen konfigurierbar? | **Ja** — `alarmLow=0.4, warnLow=0.8, warnHigh=1.2, alarmHigh=1.6, yMin=0, yMax=3.0` |
| Echtzeit-Wert? | **Braucht VPD im ESP-Store** — liest `currentSensor.raw_value` (Zeile 129) |

**Einschränkung:** Das 4-Punkt-Threshold-System (alarm-warn-ok-warn-alarm) kann nur EINE Optimalzone definieren. VPD-Bereiche überlappen je nach Wachstumsphase (vegetativ 0.8–1.2, Blüte 1.0–1.5). **Ohne Phasen-Kontext reicht die feste Zone 0.8–1.2 als Default.**

**Fehlende Voraussetzung:** VPD muss als "Sensor" im `espStore.devices` erscheinen. Bei Option A wird VPD als `sensor_data` gespeichert → der Server muss VPD auch in die Device-Sensor-Liste aufnehmen, oder `useSensorOptions.ts` muss um virtuelle Sensoren erweitert werden.

### 2.3 — VPD-Heatmap (Neuer Widget-Typ)

**Status:** Nicht mit bestehenden Komponenten baubar.

| Aspekt | Befund |
|--------|--------|
| `chartjs-chart-matrix` installiert? | **Nein** |
| Kompatibel mit Chart.js 4.x? | Ja — `chartjs-chart-matrix@2.x` ist Chart.js 4 kompatibel |
| Bundle-Größe | ~15 KB gzipped |
| Registrierung | 4 Stellen in `useDashboardWidgets.ts` |
| Datenquelle | T+RH Paare (historisch oder live) → Matrix {x: T, y: RH, v: VPD} |
| Echtzeit-Marker | Letzter T/RH-Wert als hervorgehobener Punkt |

**Aufwand-Schätzung:**
- Neue Dependency: `npm install chartjs-chart-matrix`
- Neue Komponente: `VPDHeatmapChart.vue` (~150 Zeilen)
- Neues Widget: `VPDHeatmapWidget.vue` (~80 Zeilen)
- Widget-Registrierung: 4 Einträge
- **Geschätzt: 4–6h Implementierung**

**Empfehlung:** Heatmap ist Phase C — VPD-Zeitverlauf und Gauge decken 90% des Nutzens ab. Heatmap ist ein "nice to have" für Power-User.

### 2.4 — MultiSensorChart: T + RH + VPD zusammen

**Basis:** `MultiSensorWidget.vue` + `MultiSensorChart.vue`

| Aspekt | Befund |
|--------|--------|
| Overlay multiple sensor types? | **Ja** — designed dafür |
| Dual-Y-Achse? | **Ja** — automatisch bei ≥2 verschiedenen Units (Zeilen 234–252) |
| T (°C) + RH (%RH) + VPD (kPa) zusammen? | **Ja** — 3 Units → 2 Y-Achsen (links: erste Unit, rechts: zweite, dritte teilt links) |
| VPD als Datasource? | Nur wenn VPD in `sensor_data` persistiert wird (Option A) |
| WebSocket Live-Updates? | **Ja** — subscribes to `sensor_data` events |

**Empfehlung:** MultiSensorChart ist das mächtigste VPD-Tool — T + RH + VPD auf einen Blick mit automatischer Dual-Y-Achse. Funktioniert 1:1 mit Option A, kein neuer Widget-Typ nötig.

### 2.5 — Chart.js Plugin-Inventar

| Package | Version | Status |
|---------|---------|--------|
| `chart.js` | `^4.5.0` | ✓ Installiert |
| `vue-chartjs` | `^5.3.2` | ✓ Installiert |
| `chartjs-adapter-date-fns` | `^3.0.0` | ✓ Installiert |
| `chartjs-plugin-annotation` | `^3.1.0` | ✓ Installiert (box-Annotations möglich) |
| `chartjs-plugin-zoom` | `^2.2.0` | ✓ Installiert |
| `chartjs-chart-matrix` | — | ✗ Nicht installiert (nur für Heatmap nötig) |

---

## Block 3: Wachstumsphasen-Kontext

### 3.1 — Growth Phase existiert bereits

**Überraschungsbefund:** `growth_phase` ist **vollständig implementiert** auf allen Ebenen:

| Ebene | Datei | Status |
|-------|-------|--------|
| DB-Model | `src/db/models/zone_context.py:92` | `String(50)`, nullable |
| Migration | `alembic/versions/add_zone_context_table.py` | Vorhanden |
| Pydantic Schema | `src/schemas/zone_context.py:58-63` | `Optional[str]` |
| Frontend API-Typ | `src/api/inventory.ts:21` | `growth_phase: string \| null` |
| Frontend Editor | `src/components/inventory/ZoneContextEditor.vue:54-73` | 18 Phasen definiert |

**Definierte Phasen (18 Stück):**
`seedling`, `clone`, `vegetative`, `pre_flower`, `flower_week_1`…`flower_week_10`, `flush`, `harvest`, `drying`, `curing`

### 3.2 — Brauchen wir Wachstumsphasen für Phase B?

**Minimal Viable VPD-Widget (OHNE Phasen):**
- Feste VPD-Zonen: 0.0–0.4 (zu niedrig/rot), 0.4–0.8 (niedrig/gelb), 0.8–1.2 (optimal/grün), 1.2–1.6 (hoch/gelb), >1.6 (zu hoch/rot)
- Deckt den allgemeinen Anwendungsfall ab
- Nutzer kann Threshold-Werte im Widget-Config manuell anpassen

**VPD-Widget MIT Phasen (Phase C):**
- `growth_phase` aus `ZoneContext` lesen → Threshold-Presets pro Phase
- Z.B. `vegetative` → optimal 0.8–1.2, `flower_week_5` → optimal 1.0–1.5
- Phase-Selector im Widget-Config oder automatisch aus Zone-Context

**Empfehlung:** Phase B mit festen Default-Zonen. Growth-Phase-Integration als Phase C Feature — die Infrastruktur (`zone_contexts.growth_phase`) existiert bereits, es fehlt nur die Verknüpfung Widget ↔ ZoneContext.

---

## Ergebnis

### 1. Architektur-Empfehlung: Option A (Server-Persistierung)

VPD bei jedem eingehenden Temp/RH-Wert event-driven berechnen und als `sensor_data` Row speichern. Begründung:
- Alle bestehenden Widgets, APIs, Aggregation, WebSocket-Events funktionieren 1:1
- VPD wird ein "normaler Sensor" — kein Sonderbehandlung nötig
- Speicherkosten marginal (~3 KB/Tag/Zone)
- Zukunftsfähig für Alarm-Integration

**GPIO-Lösung:** `gpio=0` + `data_source='COMPUTED'` — pragmatisch, kein Schema-Change.

### 2. Widget-Plan

| Widget | Typ | Basis | Neue Komponente? | Priorität |
|--------|-----|-------|-------------------|-----------|
| **VPD-Zeitverlauf** | Bestehend | `HistoricalChartWidget` + Box-Annotations | Nein — Config + Annotation-Code | **P1** |
| **VPD-Gauge** | Bestehend | `GaugeWidget` + VPD-Thresholds | Nein — Config-Preset | **P1** |
| **T+RH+VPD Overlay** | Bestehend | `MultiSensorWidget` | Nein — VPD als Datasource auswählen | **P2** |
| **VPD-Heatmap** | Neu | `chartjs-chart-matrix` | Ja — neuer Widget-Typ | **Phase C** |

### 3. Datei-Liste

**Backend (Option A):**

| Datei | Änderung |
|-------|----------|
| `src/services/vpd_calculator.py` | **NEU** — Extrahierte VPD-Formel + Zone-Lookup |
| `src/mqtt/handlers/sensor_handler.py` | Hook nach Temp/RH: VPD berechnen + speichern |
| `src/services/zone_kpi_service.py` | Refactor: `_calculate_vpd` → shared util nutzen |
| `src/sensors/sensor_type_registry.py` | Optional: `vpd` in `SENSOR_TYPE_MAPPING` + `MOCK_DEFAULTS` |

**Frontend:**

| Datei | Änderung |
|-------|----------|
| `src/utils/sensorDefaults.ts` | `vpd` in `SENSOR_TYPE_CONFIG` (label, unit, min, max) |
| `src/components/charts/HistoricalChart.vue` | Box-Annotations für VPD-Zonen-Bänder (~20 Zeilen) |
| `src/composables/useSensorOptions.ts` | Optional: Virtuelle VPD-Sensoren in Dropdown |
| `src/composables/useDashboardWidgets.ts` | Nur bei Heatmap (Phase C): 4 neue Einträge |

### 4. Abhängigkeiten

| Feature | Abhängigkeit | Status |
|---------|-------------|--------|
| VPD-Zeitverlauf | `chartjs-plugin-annotation` Box-Support | ✓ Installiert (v3.1.0) |
| VPD in MultiSensor | Dual-Y-Achse | ✓ Implementiert |
| VPD-Heatmap | `chartjs-chart-matrix` | ✗ Phase C — nicht installiert |
| Phasen-abhängige Zonen | `zone_contexts.growth_phase` | ✓ Existiert — Phase C Integration |
| VPD im Sensor-Dropdown | VPD in ESP-Store oder `useSensorOptions` Erweiterung | ✗ Muss implementiert werden |
| VPD Live-Gauge | VPD als Sensor im `espStore.devices` | ✗ Server muss VPD in Device-Response aufnehmen |

### 5. Aufwand-Schätzung

| Komponente | Aufwand |
|------------|--------|
| Backend: VPD-Calculator Service + Handler-Hook | ~2–3h |
| Backend: sensor_type_registry Anpassung | ~30min |
| Frontend: `SENSOR_TYPE_CONFIG` + sensorDefaults | ~30min |
| Frontend: HistoricalChart Box-Annotations | ~1–2h |
| Frontend: useSensorOptions VPD-Integration | ~1h |
| Frontend: GaugeWidget VPD-Preset-Config | ~30min |
| Test + Verifikation | ~2h |
| **Gesamt Phase B (ohne Heatmap)** | **~8–10h** |
| Phase C: VPD-Heatmap Widget | +4–6h |
| Phase C: Growth-Phase → Widget-Zonen | +2–3h |

---

## Nicht-Scope (explizit ausgeklammert)

- **DLI** (Daily Light Integral) — eigenes Feature, eigene Analyse
- **GDD** (Growing Degree Days) — Phase C
- **Dew Point** — Phase C
- **Leaf-VPD** — braucht Infrarot-Blattsensor, Hardware-Abhängigkeit
- **VPD-Alarme** — logische Erweiterung, aber eigenes Feature
