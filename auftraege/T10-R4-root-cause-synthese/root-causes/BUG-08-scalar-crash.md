# Root-Cause: BUG-08 — MultipleResultsFound (scalar_one_or_none Crash)

## Symptom
`MultipleResultsFound` Exception 110x/30min bei 2x DS18B20 auf GPIO 4. DS18B20-Daten werden NICHT gespeichert → Datenverlust.

## Reproduktion
1. MOCK_A3592B7E hat 2x DS18B20 auf GPIO 4 (verschiedene onewire_addresses)
2. Sensor-Daten kommen via MQTT
3. `sensor_repo.get_by_esp_gpio_and_type(esp_id, gpio=4, sensor_type='temperature')` → findet 2 Rows
4. `scalar_one_or_none()` wirft `MultipleResultsFound`
→ 110 Exceptions/30min, DS18B20-Daten seit Start nicht gespeichert

## Root Cause
- **Datei:** `sensor_repo.py:103-109`
- **Funktion:** `get_by_esp_gpio_and_type()`
- **Problem:** Query filtert nur nach `(esp_id, gpio, sensor_type)` — NICHT nach `onewire_address`. Bei 2+ DS18B20 auf gleichem GPIO (OneWire-Bus) liefert die Query 2 Rows → `scalar_one_or_none()` crasht. Die korrekte 4-Way-Methode `get_by_esp_gpio_type_and_onewire()` existiert bereits auf Zeile 864, wird aber vom Aufrufer (sensor_handler) NICHT verwendet.

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: JEDER ESP mit 2+ DS18B20 auf gleichem GPIO
- Welche Daten: DS18B20-Readings werden NICHT gespeichert (kompletter Datenverlust)
- Welche Funktionen: Sensor-Datenpipeline, Charts, Monitor, Alerts fuer DS18B20

## Fix-Vorschlag
Aufrufer in `sensor_handler.py` muss `get_by_esp_gpio_type_and_onewire()` verwenden wenn `onewire_address` im MQTT-Payload vorhanden. Fallback auf `get_by_esp_gpio_and_type()` nur wenn kein `onewire_address` im Payload. Alternativ: alte Methode um optionalen `onewire_address`-Parameter erweitern.

## Fix-Komplexitaet
- [ ] Einzeiler
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [x] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: BUG-09 (processed null — Daten muessen erst gespeichert werden), BUG-12 (Duplikate im Monitor)

## Verifikation nach Fix
```query
{compose_service="el-servador"} |= "MultipleResultsFound"
→ SOLL: 0 Treffer in 30 Minuten

SELECT COUNT(*) FROM sensor_data sd
JOIN sensor_configs sc ON sd.sensor_config_id = sc.id
WHERE sc.sensor_type = 'ds18b20'
AND sc.esp_id = (SELECT id FROM esp_devices WHERE device_id LIKE '%A3592B7E')
AND sd.created_at > NOW() - interval '10 minutes';
→ SOLL: > 0 (Daten werden wieder gespeichert)
```
