# Server Dev Report: NTP Fix Teil C — time_valid in Heartbeat + Sensor Handler

## Modus: B (Implementierung)

## Auftrag
ESP32-Geraete senden `time_valid: true/false` in Heartbeat- und Sensor-Payloads.
- C1: heartbeat_handler.py — INFO-Log wenn `time_valid=false`
- C2: sensor_handler.py — `time_valid` in Timestamp-Verarbeitung beruecksichtigen

## Codebase-Analyse

### Analysierte Dateien
- `src/mqtt/handlers/heartbeat_handler.py` — Zeilen 254-262 (ts_raw-Block, BUG-06 fix)
- `src/mqtt/handlers/sensor_handler.py` — Zeilen 379-396 (esp32_timestamp_raw-Block, BUG-05 fix)

### Gefundene Patterns
- Heartbeat: `payload["ts"]` -> `ts_raw`-Variable, `datetime.now(timezone.utc)` fuer ts<=0
- Sensor: `payload.get("ts", payload.get("timestamp"))` -> `esp32_timestamp_raw`-Variable, gleiche Fallback-Logik
- Logging: `logger.info("ESP %s: ...", esp_id_str)` — Positional-Args (nicht f-string, ruff-konform)
- Default fuer fehlendes Flag: `payload.get("time_valid", True)` — rueckwaertskompatibel mit alter Firmware

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|---------|
| 1 | Struktur & Einbindung | Aenderungen in bestehenden Methoden, keine neuen Dateien, kein __init__.py-Update noetig |
| 2 | Namenskonvention | `time_valid` snake_case, konsistent mit Payload-Key |
| 3 | Rueckwaertskompatibilitaet | Default `True` fuer alten Firmware-Stand ohne `time_valid`-Feld — kein Breaking Change |
| 4 | Wiederverwendbarkeit | Inline-Pattern analog zum bestehenden BUG-05/06-Fix — kein neuer Service noetig |
| 5 | Speicher & Ressourcen | Keine neuen Objekte, keine Long-Running-State-Aenderung |
| 6 | Fehlertoleranz | `payload.get()` mit Default schuetzt gegen fehlende Keys; kein ERROR fuer time_valid=false |
| 7 | Seiteneffekte | Kein neues DB-Feld, keine anderen Handler betroffen, Safety-Service unveraendert |
| 8 | Industrielles Niveau | Vollstaendig implementiert, keine Stubs, kein TODO |

## Cross-Layer Impact

| Bereich | Betroffen | Aktion |
|---------|-----------|--------|
| DB Schema | Nein | Kein neues Feld |
| MQTT Payload | Nein (empfangend) | Kein Payload-Format-Aenderung |
| REST API | Nein | Keine Response-Aenderung |
| Frontend | Nein | Kein neues Event/Feld |
| ESP32 (El Trabajante) | Sendet `time_valid` (Teil A/B des Auftrags) | Dieser Server-Teil konsumiert das Flag |

## Ergebnis

### C1 — heartbeat_handler.py
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
**Position:** Nach `await esp_repo.update_status(...)` (nach BUG-06-ts-Block, Zeile 262)

Eingefuegt (Zeilen 264-270):
```python
# Log time_valid status — info only, no error (expected during boot)
time_valid = payload.get("time_valid", True)  # Default True for old firmware
if not time_valid:
    logger.info(
        "ESP %s: time not synchronized (time_valid=false, using server timestamp)",
        esp_id_str,
    )
```

Der bestehende `ts_raw`-Block (BUG-06 fix) bleibt unveraendert.

### C2 — sensor_handler.py
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
**Position:** Step 9, Timestamp-Block (frueherer BUG-05 fix), Zeilen 379-396

Erweiterter Block:
- `time_valid = payload.get("time_valid", True)` eingefuegt vor `esp32_timestamp_raw`
- Bedingung erweitert: `not time_valid OR None OR <= 0 OR < 1577836800` (2020-01-01 Mindestwert)
- Variablenname `esp32_timestamp_raw` unveraendert (Codebase-konform)

## Verifikation
```
ruff check src/mqtt/handlers/ --fix
-> All checks passed!
```

## Empfehlung
Kein weiterer Agent noetig fuer diesen Server-Teil. Die ESP32-seitige Implementierung
(Senden von `time_valid`) gehoert zu Teilen A/B dieses NTP-Fix-Auftrags.
