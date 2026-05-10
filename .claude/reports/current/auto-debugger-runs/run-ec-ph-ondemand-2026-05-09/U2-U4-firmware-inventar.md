# Firmware-Inventar AUT-306: U2 + U4

**Analysiert:** 2026-05-09 | **Subtasks:** AUT-308 (U2), AUT-310 (U4)

---

## U2 — applyLocalConversion Inventar

**Befund:** pH und EC = RAW-Passthrough bestätigt. Pattern direkt erweiterbar, aber Architektur-Doktrin verhindert Kompensation in Firmware.

### SensorType-Tabelle

| SensorType | Conversion | Formel / Details |
|---|---|---|
| `sht31_temp` | Ja | `-45.0 + 175.0 * (raw / 65535.0)` → °C |
| `sht31_humidity` | Ja | `100.0 * (raw / 65535.0)` → % |
| `ds18b20` | Ja | `(int32_t)raw * 0.0625` → °C (12-bit) |
| `bmp280_temp` | Ja | `raw / 100.0` → °C (Centidegrees) |
| `bme280_temp` | Ja | `raw / 100.0` → °C (Centidegrees) |
| `bmp280_pressure` | Ja | `raw / 100.0` → hPa (Centipascals) |
| `bme280_pressure` | Ja | `raw / 100.0` → hPa (Centipascals) |
| `bme280_humidity` | Ja | `raw / 1024.0` → % |
| `ph` / `ph_sensor` | **RAW-Passthrough** | `(float)raw`, unit="raw", `converted=false` |
| `ec` / `ec_sensor` | **RAW-Passthrough** | `(float)raw`, unit="raw", `converted=false` |
| `moisture` | RAW-Passthrough | `(float)raw`, unit="raw", `converted=false` |
| alle anderen | RAW-Passthrough | Catch-all |

**pH/EC RAW-Passthrough bestätigt:** Catch-all `sensor_manager.cpp:185`: `return { (float)raw_value, "raw", false };`

### Weiterverarbeitung nach applyLocalConversion

1. `conv.value` → `reading_out.processed_value` (Zeilen 1220/1326)
2. `publishSensorReading(reading)` → `updateValueCache(gpio, sensor_type, processed_value)` immer vor MQTT-Publish (Zeile 1892)
3. MQTT-Publish mit raw_value + processed_value + unit

### Code-Belege

| Datei:Zeile | Inhalt |
|-------------|--------|
| `sensor_manager.cpp:159–186` | applyLocalConversion vollständig |
| `sensor_manager.cpp:185` | Catch-all RAW-Passthrough für pH/EC |
| `sensor_manager.cpp:1210` | Aufruf Einzelsensor-Pfad |
| `sensor_manager.cpp:1316` | Aufruf Multi-Value-Pfad (SHT31/BME280) |
| `sensor_manager.cpp:1892` | updateValueCache-Aufruf in publishSensorReading |

---

## U4 — ValueCache Cross-Sensor Fähigkeit

**Befund:** ValueCache IST cross-sensor lesbar — technisch möglich. Aber Architektur-Doktrin verhindert Firmware-seitige Kompensation trotzdem.

### Adressierungs-Schema

Tupel `(gpio: uint8_t, sensor_type: char[24])`. Lineare Suche über `value_cache_count_` Einträge. Kein Index-Array.

| Parameter | Wert |
|-----------|------|
| Max Slots | 20 (`MAX_VALUE_CACHE_ENTRIES`, `sensor_manager.h:197`) |
| Stale-Timeout | 5 Minuten (`VALUE_CACHE_STALE_MS = 300000UL`, `sensor_manager.h:196`) |

### Cross-Sensor Lesbarkeit: JA

`getSensorValue()` ist `public const` in SensorManager — akzeptiert beliebiges gpio/sensor_type-Paar, keine Ownership-Prüfung. Bereits genutzt in `offline_mode_manager.cpp:726`:

```cpp
float val = sensorManager.getSensorValue(rule.sensor_gpio, rule.sensor_value_type);
```

### Einschränkung für applyLocalConversion

applyLocalConversion ist eine `static` free function. Zum Aufrufzeitpunkt ist der letzte Temperaturwert im Cache verfügbar — aber nur wenn der Temp-Sensor bereits früher in `performAllMeasurements()` gemessen wurde und noch nicht stale ist (< 5 min).

### Minimaler Firmware-Umbau (falls gewünscht, aber nicht empfohlen)

1. `applyLocalConversion`-Signatur: `float temperature` Parameter hinzufügen
2. 2 Aufrufstellen anpassen (Zeilen 1210, 1316)
3. Neues Config-Feld `compensation_sensor_gpio` in `SensorConfig`

~20 Zeilen Code + Signatur-Bruch an 2 Stellen.

### Empfehlung: Server-seitig kanonisch

| Aspekt | Firmware-seitig | Server-seitig |
|--------|-----------------|---------------|
| Architektur-Doktrin | Verletzt ("NIEMALS Sensor-Kalibrierung auf ESP32") | Konform |
| Kalibrierungs-Update | Reflash erforderlich | Laufzeit-Config-Push |
| Kompensationsformel-Update | Reflash erforderlich | Deploy ohne Firmware |
| Testbarkeit | Hardware erforderlich | pytest |
| requiresCalibration-Guard | pH/EC explizit excluded (`offline_mode_manager.cpp:492–494`) | — |

**Fazit:** Firmware bleibt RAW-Passthrough für pH/EC. Server ist kanonische Stelle. AUT-210-konform.
