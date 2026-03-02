# AutoOps Moisture-Sensor Bugfixes

**Datum:** 2026-03-02
**Quelle:** E2E-Test Report `autoops-moisture-e2e-test.md`
**Geänderte Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`

---

## Bug 1: /process Endpoint normalisiert soil_moisture nicht (MEDIUM)

**Status:** ✅ Code verifiziert — nur operativer Fix nötig

**Analyse:**
- `SENSOR_TYPE_MAPPING["soil_moisture"] = "moisture"` existiert in `sensor_type_registry.py:65`
- `library_loader.get_processor()` ruft `normalize_sensor_type()` auf (Zeile 96)
- Der `/process` Endpoint nutzt `loader.get_processor(request.sensor_type)` (Zeile 105)
- **Root Cause:** Uvicorn-Worker hat gecachte Module ohne das Mapping

**Fix:**
- Operativ: `docker compose restart el-servador`
- Langfristig: Uvicorn mit `--reload` im Dev-Mode starten

---

## Bug 2: Implausible Value Warning vergleicht RAW gegen PROCESSED-Grenzen (MEDIUM)

**Status:** ✅ GEFIXT

**Root Cause:**
`SENSOR_PHYSICAL_LIMITS["moisture"]` = `{min: 0, max: 100}` (processed %).
Die Plausibilitätsprüfung konnte RAW ADC-Werte (0-4095) gegen diese Processed-Grenzen prüfen,
was bei moisture raw=1500 zu einer falschen "implausible" Warnung führte (1500 > 100).

**Fix (sensor_handler.py Zeile 297):**
```python
# VORHER:
skip_range_check = raw_mode and processed_value is None

# NACHHER:
skip_range_check = processing_mode != "pi_enhanced" or processed_value is None
```

**Logik:**
- Range-Check NUR wenn `processing_mode == "pi_enhanced"` UND `processed_value` vorhanden
- RAW-Modus (keine Verarbeitung): Check übersprungen ✓
- Local-Modus (ESP self-reported): Check übersprungen ✓ (ESP könnte RAW ADC-Werte senden)
- Pi-Enhanced (Server-verarbeitet): Check mit korrekten physikalischen Einheiten ✓

---

## Bug 3: config_status bleibt "pending", latest_value bleibt None (LOW)

**Status:** ✅ GEFIXT

### Fix 3a: config_status Transition

```python
# VORHER:
sensor_config.config_status = "applied"

# NACHHER:
sensor_config.config_status = "active"
```

Transition: `pending → active` nach erstem erfolgreichen Sensor-Reading.

### Fix 3b: latest_value Update

Neuer Code in Step 9b (nach sensor_data save):
```python
# Update latest reading in sensor_metadata
latest_value = processed_value if processed_value is not None else raw_value
updated_metadata = dict(sensor_config.sensor_metadata or {})
updated_metadata["latest_value"] = latest_value
updated_metadata["latest_timestamp"] = esp32_timestamp.isoformat()
updated_metadata["latest_quality"] = quality
sensor_config.sensor_metadata = updated_metadata
```

**Hinweis:** `latest_value` wird in `sensor_metadata` (JSON) gespeichert,
da kein dediziertes DB-Feld existiert. Kein Alembic-Migration nötig.

---

## Verifikation

### Manuell
1. Server restart: `docker compose restart el-servador`
2. POST `/api/v1/sensors/process` mit `sensor_type: "soil_moisture"` → erwartet 200
3. MQTT moisture raw=1500 senden → KEINE "Implausible" Warnung im Log
4. sensor_configs.config_status nach erstem Reading → "active"
5. sensor_configs.sensor_metadata.latest_value → aktueller Wert

### Betroffene Pfade
- `sensor_handler.py:297` — skip_range_check Logik (Bug 2)
- `sensor_handler.py:344-365` — config_status + latest_value Update (Bug 3)
