# Backend-Inventar AUT-306: U1 + U3 + U5

**Analysiert:** 2026-05-09 | **Subtasks:** AUT-307 (U1), AUT-309 (U3), AUT-311 (U5)

---

## U1 — sensor_handler.py: pH/EC Konversions-Pfad

**Befund:** RAW-Passthrough bestätigt für `pi_enhanced=False`. EC hat bereits vollständige ATC-Implementierung (AUT-299). pH hat Processor, aber Handler-Block fehlt.

### Entscheidungsbaum processed_value (sensor_handler.py:300–403)

| Branch | Bedingung | processed_value |
|--------|-----------|-----------------|
| Pi-Enhanced | `pi_enhanced=True` und `raw_mode=True` | Processor.process() via `_trigger_pi_enhanced_processing()` |
| EC-ATC-Pre-Block | `sensor_type == "ec"` + pi_enhanced | `_try_get_ec_temperature()` → ECSensorProcessor mit Temp |
| Local | `raw_mode=False` | `value` (ESP hat lokal verarbeitet) |
| DS18B20 Safety-Net | ds18b20 + raw_mode | raw_int16 × 0.0625 |
| **RAW-Passthrough** | **alle anderen (inkl. pH ohne pi_enhanced)** | **`raw_value`** (Zeile 402) |

### EC-ATC-Block (AUT-299 — bereits implementiert)

`sensor_handler.py:313–338`: eigener Block für EC, der vor `_trigger_pi_enhanced_processing()` läuft:
- `_try_get_ec_temperature()` sucht Temp-Sensor in 2 Prioritätsstufen
- Schreibt `ec_extra_params["temperature_compensation"]` und `ec_extra_params["_atc_source"]`
- Metadata-Keys: `temp_compensation_value` und `temp_source` (Zeile 503–508)

### pH — Status

- `PHSensorProcessor._apply_temperature_compensation()` implementiert (`ph_sensor.py:275–300`)
- **Handler-Block fehlt**: kein `if sensor_type == "ph":` analog zum EC-Block
- Direkte Portierung möglich: `_try_get_ec_temperature()` zu `_try_get_atc_temperature()` umbenennen, von pH+EC teilen

### Code-Belege

| Datei:Zeile | Inhalt |
|-------------|--------|
| `sensor_handler.py:307` | pi_enhanced Gate |
| `sensor_handler.py:313–338` | EC-ATC-Block (AUT-299) |
| `sensor_handler.py:341–378` | `_trigger_pi_enhanced_processing()` |
| `sensor_handler.py:402–403` | RAW-Passthrough Fallback |
| `sensor_handler.py:503–508` | EC: metadata `temp_compensation_value` + `temp_source` |
| `sensor_handler.py:510` | save_data Callpoint 1 (alle Live-Sensoren) |
| `sensor_handler.py:836` | save_data Callpoint 2 (VPD-Computed) |
| `ph_sensor.py:275–300` | `_apply_temperature_compensation()` — fertig |
| `ec_sensor.py:183–186` | ATC in ECSensorProcessor.process() |

**Antwort auf TM-Frage:** Server ist kanonische Stelle. EC bereits fertig. pH: Processor fertig, Handler-Block fehlt.

---

## U3 — _try_compute_vpd Hook: Pattern-Analyse

**Befund:** VPD ist kein Vorbild für pH/EC. EC-ATC-Pattern (Pre-Processing) ist das kanonische Vorbild.

### VPD Hook-Mechanismus

| Merkmal | Wert |
|---------|------|
| Position | `sensor_handler.py:634–654` |
| Trigger | `if sensor_type == "sht31_temp":` |
| Wartemodell | `await self._try_compute_vpd(...)` — inline, nach save+commit |
| Fehlerbehandlung | try/except — VPD-Fehler blockt nie Hauptverarbeitung |
| Output | **neue sensor_data-Zeile** (gpio=0, type="vpd"), NICHT die triggernde Zeile |
| Metadata | `{"source_temp_type": "sht31_temp", "source_rh_type": "sht31_humidity"}` |

### Warum VPD kein Vorbild für pH ist

VPD erzeugt eine **neue** abgeleitete Zeile. pH/EC müssen ihre **eigene** Zeile mit kompensiertem `processed_value` schreiben. Das ist das EC-Pre-Processing-Pattern.

### EC-ATC als kanonisches Vorbild für pH

`_try_get_ec_temperature()` (`sensor_handler.py:929–1011`):
1. Priorität 1: Explizit verlinkter Temp-Sensor via `sensor_config.temp_sensor_config_id` (cross-ESP)
2. Priorität 2: Same-ESP auto-discovery (sensor_type "temperature" oder "sht31_temp")
3. Max-Age: `_ATC_MAX_AGE = timedelta(minutes=5)` (Zeile 927)

Minimale Anpassungen für pH:
1. `if sensor_type == "ph":` Block in `handle_sensor_data()` nach EC-Block (~Zeile 312)
2. `_try_get_ec_temperature()` → `_try_get_atc_temperature(sensor_type)` umbenennen
3. `ph_extra_params["temperature_compensation"] = atc_temp` setzen
4. Metadata analog EC befüllen

---

## U5 — sensor_data.metadata Erweiterbarkeit

**Befund:** JSON-Feld, schema-los erweiterbar. Keine Migration nötig. Kein QualityLevel-Enum.

| Frage | Antwort |
|-------|---------|
| SQL-Typ | `JSON` (PostgreSQL als Text, kein JSONB) — `db/models/sensor.py:444–449` |
| Migration nötig? | **Nein** — AUT-299 hat `temp_compensation_value`/`temp_source` ohne Migration eingeführt |
| QualityLevel-Enum? | Keines — `QUALITY_LEVELS`-Liste in `schemas/sensor.py:56–69` (frei erweiterbar) |
| metadata in Stats? | Nicht abgefragt — `/stats` liefert nur numerische Aggregate (min/max/avg/std/count) |

### QUALITY_LEVELS-Liste (schemas/sensor.py:56–69)

```python
QUALITY_LEVELS = [
    "excellent", "good", "fair", "poor", "bad",
    "stale", "suspect", "critical", "error",
    "degraded", "aggregated", "unknown",
]
```

Für AUT-306 `quality`-Werte (`ok`, `cached_temp`, `default_25c`, `temp_read_failed`) in `sensor_metadata` statt in `quality` — kein Enum-Eintrag nötig.

---

## Konsolidierung: Kanonische Stelle

| Dimension | Befund |
|-----------|--------|
| pH/EC raw→processed | Server (`_trigger_pi_enhanced_processing()` bei `pi_enhanced=True`) |
| EC-ATC | Bereits vollständig (AUT-299) |
| pH-ATC | Processor fertig, Handler-Block fehlt |
| Vorbild-Pattern | EC-ATC-Block (Zeilen 313–338) — nicht VPD |
| metadata erweiterbar | Ja, ohne Migration |
| Firmware bleibt | RAW-Passthrough (AUT-210-konform) |
