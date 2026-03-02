# AutoOps Debug & Fix Report — 2026-03-02

## System Status
- **ESP32 (ESP_472204)**: Online, stabil im Netz (192.168.0.148)
- **SHT31**: sht31_temp (~19.9°C) + sht31_humidity (~17.3%RH) auf GPIO 0, I2C Addr 68
- **Server**: God-Kaiser online, MQTT connected, healthy
- **Loki**: Keine Server-Errors in den letzten 5 Minuten
- **Frontend**: Monitor + Editor funktional, °C korrekt dargestellt

---

## Bug #1: SHT31 MultiValue Chart Mixing (FIXED)

**Problem:** Bei Multi-Value Sensoren (SHT31: Temperatur + Luftfeuchtigkeit auf gleichem GPIO) wurden Werte in Charts vermischt. Nach dem ersten gesendeten Wert wurden Temperatur- und Humidity-Daten in denselben Chart geschrieben.

**Root Cause:** Sensor-IDs und Keys enthielten keinen `sensor_type`, wodurch Multi-Value Sensoren auf demselben GPIO kollidieren:
- Chart-ID: `${espId}_${gpio}` → identisch für sht31_temp UND sht31_humidity
- API-Queries: kein `sensor_type` Filter → gemischte Ergebnisse
- WebSocket-Handler: nur GPIO-Filter → alle sensor_types akzeptiert

**Fixes (10 Edits in 5 Dateien):**

| Datei | Fix |
|-------|-----|
| `AnalysisDropZone.vue` | sensorId: `${espId}_${gpio}_${sensorType}` |
| `MultiSensorChart.vue` | API query: `sensor_type` Parameter hinzugefügt |
| `MultiSensorChart.vue` | WS handler: `sensor_type` Filter für Multi-Value |
| `MonitorView.vue` | `fetchDetailData`, `fetchExpandedChartData`, overlay: sensor_type |
| `useSparklineCache.ts` | `getSensorKey()` akzeptiert `sensorType` Parameter |
| `MultiSensorWidget.vue` | dataSources Format: `espId:gpio:sensorType` |

**Verifikation:** TypeScript check passed, Vite build (44s) passed.

---

## Bug #2: Unit-Encoding °C → Â°C (NICHT REPRODUZIERBAR)

**Untersuchung:**
- DB: `°C` = hex `c2b043` (korrektes UTF-8) ✓
- API Response: `c2b043` (korrekt) ✓
- Frontend (Playwright): `°C` korrekt dargestellt ✓

**Fazit:** War vermutlich ein Terminal-Encoding-Artefakt. Kein Code-Fix nötig.

---

## Relay als Pumpe auf Pin 27 (KONFIGURIERT)

**API Call:** `POST /api/v1/actuators/ESP_472204/27`
```json
{
  "actuator_type": "relay",
  "name": "Water Pump",
  "max_runtime_seconds": 1800,
  "cooldown_seconds": 60,
  "metadata": {"purpose": "irrigation", "device": "pump"}
}
```
**Status:** `config_status: "pending"` — wird bei nächstem ESP Config-Sync angewendet.
**Sichtbar im Monitor:** "0/4 Aktoren" (1 new actuator hinzugefügt)

---

## Logic Engine Review (4 KRITISCHE FIXES)

### Fix 1: Cross-Sensor Key mit sensor_type (CRITICAL)
**File:** `services/logic_engine.py` (`_load_cross_sensor_values`)
**Problem:** Sensor-Values Key war `ESP:GPIO` — bei SHT31 lieferte Cross-Sensor Lookup den falschen Wert (Temp statt Humidity oder umgekehrt).
**Fix:** Key-Format: `ESP:GPIO:sensor_type` (mit Fallback auf untyped Key).

### Fix 2: Sensor Evaluator Cross-Sensor Type Filter (CRITICAL)
**File:** `services/logic/conditions/sensor_evaluator.py` (`_get_cross_sensor_value`)
**Problem:** Cross-Sensor Lookup prüfte nicht `sensor_type` — bei Multi-Value Sensoren konnte Humidity-Wert als Temperatur interpretiert werden.
**Fix:** Typed Key zuerst prüfen, bei untyped Key `sensor_type` Mismatch erkennen.

### Fix 3: Cooldown Off-by-One (MEDIUM)
**File:** `services/logic_engine.py` (line 318)
**Problem:** `<` statt `<=` → Rule feuert exakt bei Cooldown-Ende.
**Fix:** `time_since_last.total_seconds() <= rule.cooldown_seconds`

### Fix 4: Between-Operator min/max Swap (LOW)
**File:** `services/logic/conditions/sensor_evaluator.py`
**Problem:** `between` mit min > max → immer False (silent failure).
**Fix:** Auto-swap mit Warning-Log.

**Verifikation:** 818 Unit-Tests passed, 3 skipped.

### Weitere Findings (dokumentiert, nicht gefixt):
| # | Severity | Beschreibung |
|---|----------|--------------|
| 3 | HIGH | Race Condition: Batch locks released after ALL rules (should be per-rule) |
| 4 | HIGH | Hysteresis state in-memory only (lost on server restart) |
| 7 | MEDIUM | WS broadcast failure silent (no retry) |
| 8 | MEDIUM | Sequence executor nested depth check incomplete |
| 9 | MEDIUM | Conflict manager lock TTL hardcoded (60s) |
| 18 | MEDIUM | Rate limiter fail-open on DB error |

---

## SHT31 Dropdown Disambiguation (FIXED)

**Problem:** Sensor-Dropdowns in 5 Dashboard-Widgets zeigten "Zelt Wohnzimmer (ESP_472204)" doppelt — ohne Unterscheidung temp/humidity.

**Fixes (5 Widget-Dateien):**

| Widget | Vorher | Nachher |
|--------|--------|---------|
| GaugeWidget | `ESP:GPIO`, `name (espId)` | `ESP:GPIO:type`, `name (espId — type)` |
| SensorCardWidget | `ESP:GPIO`, `name (espId)` | `ESP:GPIO:type`, `name (espId — type)` |
| LineChartWidget | `ESP:GPIO`, `name (espId GPIO x)` | `ESP:GPIO:type`, `name (espId GPIO x — type)` |
| HistoricalChartWidget | `ESP:GPIO`, `name (espId GPIO x)` | `ESP:GPIO:type`, `name (espId GPIO x — type)` |
| WidgetConfigPanel | `ESP:GPIO`, `name (espId GPIO x)` | `ESP:GPIO:type`, `name (espId GPIO x — type)` |

Alle `currentSensor` Lookups angepasst: `split(':')` → 3 Teile, `sensor_type` Match.

**Verifikation:** TypeScript check passed, Vite build (44s) passed.

---

## Playwright Verification Summary

| View | Status | Details |
|------|--------|---------|
| Monitor | ✅ OK | Zone "Echt" zeigt korrekte Werte, °C richtig, 4/4 Sensoren, 0/4 Aktoren |
| Editor | ✅ OK | Dashboard Builder lädt, Widgets rendern, Gauge zeigt 22.5°C |
| Login | ✅ OK | Auto-redirect, Token-Refresh funktional |
| WebSocket | ✅ OK | Connected, ESP health events empfangen |

---

## Geänderte Dateien (Zusammenfassung)

### Frontend (11 Dateien)
1. `components/esp/AnalysisDropZone.vue` — sensorId mit sensorType
2. `components/charts/MultiSensorChart.vue` — API sensor_type + WS filter
3. `components/dashboard-widgets/MultiSensorWidget.vue` — dataSources format
4. `components/dashboard-widgets/GaugeWidget.vue` — ID + Label + Lookup
5. `components/dashboard-widgets/SensorCardWidget.vue` — ID + Label + Lookup
6. `components/dashboard-widgets/LineChartWidget.vue` — ID + Label + Lookup
7. `components/dashboard-widgets/HistoricalChartWidget.vue` — ID + Label + Lookup
8. `components/dashboard-widgets/WidgetConfigPanel.vue` — ID + Label
9. `composables/useSparklineCache.ts` — getSensorKey mit sensorType
10. `views/MonitorView.vue` — fetchDetailData, overlay, keys
11. `types/index.ts` — ChartSensor.id comment update

### Backend (2 Dateien)
12. `services/logic_engine.py` — Cross-sensor key + cooldown fix
13. `services/logic/conditions/sensor_evaluator.py` — Cross-sensor type filter + between swap
