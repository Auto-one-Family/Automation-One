# UX-Konzept: Fertigation-Integration in Monitor/HardwareView
**AUT-15 — Fertigation-Messung und Kalibrierung in bestehender Monitor/HardwareView-Architektur**

**Datum:** 2026-04-14  
**Scope:** Frontend-UX für EC/pH Inflow vs. Runoff, Kalibrierung, Monitor-Integration  
**Status:** Entwurf zur Diskussion

---

## Kontext & Ziel

AutomationOne hat eine bewährte 3-Level-Zoom-Architektur in MonitorView + HardwareView:

- **L1 (Monitor Zone Tiles):** Zone-Überblick mit KPI-Grid (Temp Ø, Humidity Ø, etc.)
- **L2 (Monitor Zone Detail):** Subzone-Accordion mit Sensor/Aktor-Karten (read-only)
- **L3 (SlideOver):** Sensor-Detail + Zeitreihe (Historische Charts)

Fertigation (EC/pH Inflow vs. Runoff) soll sich **nahtlos** in diese Struktur einfügen.

**Operator-Perspektive (Gärtner):** Lagebild → Diagnose → Forensik

---

## 1. Monitor L1: EC-Differenz als KPI in ZoneTileCard

### Aktuelle Architektur

`ZoneTileCard.vue` (Z. 96–121): 3er-Grid aus aggregateZoneSensors()  
`useZoneKPIs.ts` (Z. 215–235): aggregiert Zone-Sensoren pro Typ — **keine Paar-Logik**

### Empfohlene Lösung: Option A (Hybrid)

**A1: KPI-Eintrag nur bei measurement_role-Paaren**

Prüfe in `useZoneKPIs.ts`:
- Sensoren mit `measurement_role: 'inflow'` + `'runoff'` erkannt?
- Falls ja → berechne `deltaEC = runoff_value - inflow_value`
- Neuer KPI: **"ΔEC"** mit Wert + Farbcodierung

**A2: Integration in aggregation Object**

```typescript
export interface ZoneAggregation {
  sensorTypes: Array<{ type, label, unit, avg, count }>
  fertigationPair?: {
    type: 'ec' | 'ph'
    inflowValue: number | null
    runoffValue: number | null
    delta: number | null
    quality: 'good' | 'warning' | 'alarm'
  }
}
```

**Backend:** measurement_role in `sensor_metadata` (JSON, keine neue Spalte)

```json
{
  "measurement_role": "inflow",
  "pair_sensor_id": "uuid-runoff",
  "pair_name": "EC-Runoff (G32)"
}
```

### Betroffene Dateien

| Datei | Zeilen |
|-------|--------|
| `El Frontend/src/composables/useZoneKPIs.ts` | 18, 215–235 |
| `El Frontend/src/components/monitor/ZoneTileCard.vue` | 96–121, 533+ |
| `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` | 50–113 |

---

## 2. Monitor L2: Sensor-Interaktion & On-Demand-Button

### Empfohlene Lösung: 3-teilig

**L2a: Operating-Mode Indikator**
- Badge im Footer (on_demand, continuous, scheduled, paused)
- Symbol + Text

**L2b: On-Demand "Jetzt messen" Button**
- Sichtbar nur wenn `operating_mode === 'on_demand'`
- MQTT-Publish an `sensor/{gpio}/measure`
- 5s timeout, Spinner, Toast bei Erfolg

**L2c: Staleness für on_demand Prominenter**
- Orange Badge wenn >1h alt
- Tooltip: "On-Demand. Klick 'Jetzt messen'."

### Betroffene Dateien

| Datei |
|-------|
| `El Frontend/src/components/devices/SensorCard.vue` |
| `El Frontend/src/composables/useZoneGrouping.ts` |

---

## 3. Kalibrier-Status & Schnellzugang

### Empfohlene Lösung: 3-stufig

**3A: Kalibrier-Alter-Badge in SensorCard**

Backend: `get_calibration_age_days()` aus `calibration_data.metadata.normalized_at` oder CalibrationSession

```python
# Neues Feld in SensorResponse:
calibration_age_days: Optional[int]
```

**Farbschema:**
- <30d: Grün (frisch)
- 30–90d: Gelb
- >90d: Rot
- null: Grau (nie)

**3B: Proaktiv in Zone-Health**  
Wenn irgendein Sensor >90d: warning Status + Grund

**3C: Schnellzugang**  
Info-Button (⚙) öffnet HardwareView Sensor-Config

### Betroffene Dateien

| Datei |
|-------|
| `El Servador/god_kaiser_server/src/services/sensor_service.py` |
| `El Servador/god_kaiser_server/src/schemas/sensor.py` |
| `El Frontend/src/components/devices/SensorCard.vue` |

---

## 4. Dashboard-Widget FertigationPairWidget (Follow-Up)

**Phase 3 (Post-AUT-15):** Neuer Widget-Typ als 11. Widget

- Zeigt Inflow, Runoff, Δ
- Farbbar für Abweichung
- Buttons: "Beide kalibrieren", "Jetzt messen"

### Betroffene Dateien

| Datei |
|-------|
| `El Frontend/src/components/dashboard-widgets/FertigationPairWidget.vue` |
| `El Frontend/src/composables/useDashboardWidgets.ts` |

---

## 5. Datenpersistenz: Zone-Wechsel

**Keine Änderung nötig**

On-demand Sensoren: jede Messung hat `timestamp` + `zone_id` → historische Daten bleiben.

---

## 6. Backend Kalibrier-Tracking (Option B)

**Non-invasiv:** Ableitung aus `calibration_data.metadata.normalized_at`

```python
async def get_calibration_age_days(sensor_config_id: UUID) -> Optional[int]:
    """Returns days since calibration, None if never calibrated."""
    # 1. Try metadata.normalized_at
    # 2. Fallback: CalibrationSession.completed_at (status='applied')
    # 3. Return None
```

Exponiere in `SensorResponse.calibration_age_days`

---

## ASCII-Wireframes

### L1: EC-Δ KPI Block

```
┌─────────────────────────────────────┐
│ Growroom A              [✓] OK      │
│                                     │
│ ┌──────┬──────┬──────┐              │
│ │Temp  │RH    │pH-R  │              │
│ │Ø22.4°│Ø65%  │Ø6.8  │              │
│ └──────┴──────┴──────┘              │
│                                     │
│ ┌────────────────────────────┐      │
│ │EC Δ   +0.6 mS/cm      ⚠   │      │
│ └────────────────────────────┘      │
└─────────────────────────────────────┘
```

### L2: SensorCard mit Mode + Kalibrier-Badge

```
┌────────────────────────────────┐
│ 💧 EC-Inflow                   │
│                  [Live] ● Good │
│ 1.40 mS/cm                     │
│                                │
│ ESP32 [Zone-weit] [10d] [On-D] │
│                                │
│         [Jetzt messen] ▶       │
└────────────────────────────────┘
```

---

## Implementierungs-Roadmap

### Phase 2: MVP (AUT-15a)
1. useZoneKPIs: fertigationPair Logik
2. ZoneTileCard: ΔEC-KPI rendern
3. SensorCard: operating_mode Badge + on_demand Button
4. Backend: get_calibration_age_days() Service-Methode
5. SensorCard: Kalibrier-Alter-Badge

### Phase 3: Follow-Up (Post-AUT-15)
- FertigationPairWidget
- Kontextmenü Schnellzugang

---

## Zusammenfassung

| # | Konzept | Lösung | Status |
|---|---------|--------|--------|
| 1 | L1 ΔEC-KPI | Option A: bei Pair erkannt | ✅ MVP |
| 2 | L2 Sensor-Aktion | Mode-Badge + on_demand Button | ✅ MVP |
| 3 | Kalibrier-Status | Option B: aus Metadaten ableiten | ✅ MVP |
| 4 | Dashboard-Widget | FertigationPairWidget (11. Typ) | 📋 Phase 3 |
| 5 | Datenpersistenz | Keine Änderung | ✓ |
| 6 | Backend Tracking | Option B: Service-Methode | ✅ MVP |

---

**Bericht:** 2026-04-14  
**Basis:** Code Evidence ZoneTileCard, useZoneKPIs, SensorCard, sensor_handler.py
