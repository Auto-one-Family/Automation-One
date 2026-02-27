# AutoOps E2E-Test: Bodenfeuchtesensor (Moisture)

**Datum:** 2026-02-27 18:08-18:16 UTC
**Modus:** Full E2E (Mock-ESP → Server → DB → Kalibrierung → Diagnostik)
**Mock-ESP:** MOCK_MOISTURE01 (Zone: testzone-moisture)
**Sensor:** GPIO 34, Typ: moisture, Interface: ANALOG

---

## Ergebnis-Übersicht

| Phase | Test | Ergebnis |
|-------|------|----------|
| 1 | Health-Check (Server + MQTT + DB) | ✅ PASS |
| 2 | Mock-ESP erstellt und online | ✅ PASS |
| 3 | Typ-Normalisierung (moisture registriert) | ✅ PASS |
| 4 | 3 Feuchtigkeitswerte gespeichert + Processing | ✅ PASS |
| 5 | 2-Punkt Kalibrierung (linear) | ✅ PASS |
| 6 | Alias soil_moisture → moisture | ⚠️ PARTIAL |
| 7 | Debug/Diagnostik | ⚠️ ISSUES |
| 8 | Cleanup (ESP + Zone gelöscht) | ✅ PASS |

**Gesamtbewertung: 6/8 PASS, 2/8 PARTIAL/ISSUES**

---

## Phase 1: Health-Check

```
Server:  healthy (v2.0.0, uptime 3913s)
MQTT:    ✅ connected
DB:      ✅ connected
Disk:    ✅ ok
Liveness: alive=true
Readiness: ready=true
```

## Phase 2: Mock-ESP Erstellung

- ESP ID: `MOCK_MOISTURE01`
- Zone: `testzone-moisture` / `Testzone-Moisture`
- Sensor: GPIO 34, moisture, ANALOG, raw_mode=true
- Status: online, connected=true
- Auto-Heartbeat: 30s Intervall
- Heartbeat erfolgreich gesendet und bestätigt

## Phase 3: Typ-Normalisierung

- sensor_type in DB: `moisture` ✅ (nicht soil_moisture)
- interface_type: `ANALOG` ✅
- gpio: `34` ✅
- SENSOR_TYPE_MAPPING: `"soil_moisture" → "moisture"` existiert in Code ✅

## Phase 4: Sensor-Daten Processing

### Simulation (via Mock Override + Heartbeat)

| Wert | raw_value | In DB gespeichert | Processing-Ergebnis |
|------|-----------|-------------------|---------------------|
| DRY | 3100 | ✅ | 5.9% (quality: poor) |
| WET | 1500 | ✅ | 100.0% (quality: poor) |
| MEDIUM | 2300 | ✅ | 52.9% (quality: good) |

### Processing-Details (/api/v1/sensors/process)

- Voltage-Konversion: raw → Spannung (0-3.3V)
- Default-Mapping: linear zwischen dry_value und wet_value
- Processing Time: < 6ms (Anforderung: <10ms) ✅
- Metadata enthält: voltage, calibrated, inverted, raw_value

### Anmerkung

- `processed_value` in sensor_data Tabelle: `null` (raw_mode=true, Processing nur on-demand via /process Endpoint)
- Quality in DB: `critical` (wird vom Heartbeat-Handler gesetzt, nicht vom Processing)

## Phase 5: Kalibrierung

### Kalibrierungs-Request

```json
{
  "esp_id": "MOCK_MOISTURE01",
  "gpio": 34,
  "sensor_type": "moisture",
  "calibration_points": [
    {"raw": 3200, "reference": 0},
    {"raw": 1500, "reference": 100}
  ],
  "method": "linear",
  "save_to_config": true
}
```

### Ergebnis

```json
{
  "success": true,
  "calibration": {
    "dry_value": 3200.0,
    "wet_value": 1500.0,
    "method": "linear",
    "points": 2
  },
  "saved": true
}
```

### Verifizierung nach Kalibrierung

- raw=2300 mit Kalibrierung → **52.9%** (erwartet ~53%) ✅
- `calibrated: true` in Response-Metadata ✅
- Kalibrierung in sensor_config DB gespeichert ✅

## Phase 6: Alias-Test (soil_moisture → moisture)

### Code-Analyse

- `SENSOR_TYPE_MAPPING["soil_moisture"] = "moisture"` → korrekt implementiert
- `normalize_sensor_type("soil_moisture")` → returns "moisture" (nach reload)
- `library_loader.get_processor("soil_moisture")` → returns MoistureSensorProcessor (nach reload)

### Laufzeit-Test

| Endpoint | Ergebnis | Ursache |
|----------|----------|---------|
| `/process` mit `soil_moisture` | ❌ 404 | Server-Worker hat altes Modul im Speicher |
| `/process` mit `moisture` | ✅ 200 | Kanonischer Typ funktioniert |
| Docker exec normalize_test | ✅ | Neuer Python-Prozess lädt aktuelle Datei |

### Root Cause

- Uvicorn läuft **ohne `--reload`** Flag
- Code-Änderung (soil_moisture Mapping) wurde nach dem letzten Server-Start hinzugefügt
- Der Singleton `LibraryLoader` und das Modul-Level `SENSOR_TYPE_MAPPING` sind gecacht
- **Fix:** `docker compose restart el-servador`

## Phase 7: Diagnostik

### Gesunde Metriken

- ESP Status: online ✅
- Sensor Enabled: true ✅
- Kalibrierung gespeichert: dry=3200, wet=1500 ✅
- Daten-Freshness: alle < 300s ✅
- Keine Stale Data ✅

### Gefundene Issues

#### Issue 1: Implausible Value Warning (Severity: MEDIUM)

```
WARNING - Implausible sensor value: esp_id=MOCK_MOISTURE01, gpio=34,
sensor_type=moisture, value=1500.0, limits={'min': 0.0, 'max': 100.0}
```

**Problem:** Die Plausibilitätsprüfung im sensor_handler vergleicht den **RAW-Wert** (ADC 0-4095) gegen die **PROCESSED-Grenzen** (0-100%). Raw=1500 ist ein valider ADC-Wert, wird aber als "implausible" gemeldet weil 1500 > 100 (die processed %-Grenze).

**Impact:** Falsche Warnungen in Server-Logs, könnten zu unnötigen Alerts führen.

**Fix:** Plausibilitätsgrenzen für moisture-Sensor müssen für RAW-Werte definiert werden (z.B. min=0, max=4095 für ANALOG).

#### Issue 2: config_status bleibt "pending" (Severity: LOW)

Der Sensor config_status wird nie auf "active" gesetzt. Vermutlich fehlt ein Transition-Trigger nach erfolgreicher erster Datenübertragung.

#### Issue 3: latest_value = None (Severity: LOW)

Das `latest_value` Feld in der sensor_config wird nicht aus den tatsächlichen sensor_data Readings aktualisiert. Nur `latest_timestamp` und `latest_quality` werden gesetzt.

## Phase 8: Cleanup

- Mock-ESP Simulation gestoppt ✅
- Mock-ESP MOCK_MOISTURE01 gelöscht (HTTP 204) ✅
- Deletion verifiziert (HTTP 404) ✅
- Zone testzone-moisture leer (0 Devices) ✅
- Kein Datenmüll zurückgelassen ✅

---

## Pass-Kriterien Bewertung

| Kriterium | Ergebnis |
|-----------|----------|
| ✅ Mock-ESP erfolgreich erstellt und online | PASS |
| ✅ Moisture-Sensor mit korrektem Typ `moisture` registriert | PASS |
| ✅ 3 Feuchtigkeitswerte (trocken/feucht/mittel) gespeichert | PASS |
| ✅ Kalibrierung erfolgreich mit 2-Punkt linear | PASS |
| ✅ Kalibrierter Wert korrekt (~53% für raw 2300) | PASS (52.9%) |
| ⚠️ Alias soil_moisture → moisture Normalisierung | PARTIAL (Code korrekt, Server-Restart nötig) |
| ⚠️ Debug findet keine kritischen Issues | 3 non-critical Issues gefunden |
| ✅ Cleanup erfolgreich, kein Datenmüll | PASS |

---

## Action Items

1. **[HIGH]** Server neu starten um soil_moisture Mapping zu aktivieren: `docker compose restart el-servador`
2. **[MEDIUM]** Plausibilitätsgrenzen für moisture-Sensor korrigieren: RAW-Werte (0-4095) statt processed (0-100%)
3. **[LOW]** config_status Transition von "pending" → "active" implementieren
4. **[LOW]** latest_value aus sensor_data aktualisieren
5. **[OPTIONAL]** Uvicorn mit `--reload` in Development-Mode starten
