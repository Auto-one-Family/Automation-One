# Root-Cause: BUG-03 — Unit-Encoding Double-UTF8

## Symptom
API gibt `"\u00c2\u00b0C"` zurueck (= "Celsius" mit Mojibake). Frontend zeigt je nach Rendering "Celsius" oder "Grad-C".

## Reproduktion
1. ESP_472204 SHT31-D sendet Messwert mit Unit-Feld
2. `curl -s http://localhost:8000/api/v1/sensors/<ESP_UUID>`
3. unit-Feld zeigt `\u00c2\u00b0C` statt `°C`
→ Doppel-Kodierung sichtbar

## Root Cause
- **Datei:** `sensor_handler.py:329`
- **Funktion:** Payload-Verarbeitung, `unit = payload.get("unit", "")`
- **Problem:** ESP32-Firmware sendet `°C` als Latin-1 Byte `0xB0 0x43`. MQTT-Payload wird als UTF-8 interpretiert. `0xB0` ist kein gueltiges UTF-8 Start-Byte → wird als `0xC3 0xB0` re-kodiert. Ergebnis: Double-UTF8 (`\u00c2\u00b0C` = "Celsius-C"). Es gibt KEINEN Encoding-Sanitizer im sensor_handler oder in den Pydantic-Schemas.

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Alle ESP32 mit Nicht-ASCII-Einheiten
- Welche Daten: Unit-Strings (Grad-C, Mikro-S/cm, %RH)
- Welche Funktionen: Kosmetisch — Werte korrekt, nur Einheiten-Anzeige betroffen

## Fix-Vorschlag
Encoding-Sanitizer im sensor_handler: `unit.encode('latin-1', errors='ignore').decode('utf-8', errors='replace')`. Oder besser: Unit-Lookup aus sensor_type_registry statt aus Payload uebernehmen (Server kennt die korrekte Unit pro Sensor-Typ).

## Fix-Komplexitaet
- [x] Einzeiler
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: BUG-13 (teilweise — falscher unit-String → falsches Display)

## Verifikation nach Fix
```query
SELECT unit, encode(unit::bytea, 'hex') FROM sensor_configs WHERE unit LIKE '%°%';
→ SOLL: Hex = c2b043 (korrektes UTF-8 fuer °C)
```
