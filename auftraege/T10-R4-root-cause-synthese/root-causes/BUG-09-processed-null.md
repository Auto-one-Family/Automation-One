# Root-Cause: BUG-09 — DS18B20 processed_value null

## Symptom
Mock-DS18B20 Readings: `processed_value: null`, `unit: ""`. Auch nach BUG-08 Fix wuerde Processing fehlen.

## Reproduktion
1. DS18B20 sendet Daten (falls BUG-08 gefixt)
2. `SELECT processed_value, unit FROM sensor_data WHERE sensor_config_id = <ds18b20_id> LIMIT 5;`
3. `processed_value = NULL`, `unit = ""`
→ Kein Processing, rohe Werte ohne Einheit

## Root Cause
- **Datei:** `sensor_handler.py:717-718`
- **Funktion:** Default-Zuweisung fuer `raw_mode`
- **Problem:** Invertierter Default: `if "raw_mode" not in payload: payload["raw_mode"] = True`. Mock-DS18B20 sendet Payload OHNE `raw_mode`-Feld → Default `raw_mode=True` → Processing-Pipeline wird komplett uebersprungen → `processed_value=None`, `unit=""`. Zusaetzlich: `DS18B20Processor` hat `pi_enhanced=False` als Default, kein Fallback `processed_value = raw_value`.

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: ALLE DS18B20-Sensoren die kein `raw_mode=false` explizit senden
- Welche Daten: processed_value bleibt NULL, unit bleibt leer
- Welche Funktionen: Charts zeigen raw statt processed, Unit-Anzeige leer

## Fix-Vorschlag
1. Default aendern: `payload["raw_mode"] = False` (Processing aktiv als Default)
2. Oder Fallback in Processing-Pipeline: `if processed_value is None: processed_value = raw_value`
3. Unit aus sensor_type_registry holen statt aus Payload

## Fix-Komplexitaet
- [x] Einzeiler
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: BUG-08 (Daten muessen erst gespeichert werden koennen)
- Blockiert: — (standalone nach BUG-08)

## Verifikation nach Fix
```query
SELECT processed_value, unit FROM sensor_data sd
JOIN sensor_configs sc ON sd.sensor_config_id = sc.id
WHERE sc.sensor_type = 'ds18b20' ORDER BY sd.created_at DESC LIMIT 5;
→ SOLL: processed_value != NULL, unit != ""
```
