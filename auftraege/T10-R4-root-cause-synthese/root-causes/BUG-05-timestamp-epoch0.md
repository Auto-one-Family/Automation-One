# Root-Cause: BUG-05 — Timestamp Epoch 0

## Symptom
Wokwi sendet `ts: 0`. 134 Readings in DB mit `created_at = 1970-01-01`. API-Zeitfilter (`WHERE created_at > NOW() - interval '24h'`) findet nichts → Daten existieren aber sind unsichtbar.

## Reproduktion
1. Wokwi-ESP starten (kein NTP-Sync)
2. Firmware sendet Sensor-Daten mit `ts: 0`
3. `SELECT COUNT(*) FROM sensor_data WHERE created_at < '1971-01-01';` → 134 Rows
→ Daten in DB aber ueber API unerreichbar

## Root Cause
- **Datei:** `sensor_handler.py:329-337`
- **Funktion:** Timestamp-Konvertierung
- **Problem:** Kein Guard fuer `ts <= 0`. Bei `ts=0` → `datetime.fromtimestamp(0)` → `1970-01-01 00:00:00`. Validation in Zeile 680-727 prueft nur ob `ts` vorhanden und `int` ist, NICHT ob `ts > 0`. Gleiches Problem in `heartbeat_handler.py:202` (→ BUG-06).

**Kausale Verkettung:** BUG-05 → BUG-06 (ts=0 → last_seen=1970 → Maintenance setzt offline → Flicker) → BUG-14 (134 Epoch-Rows in DB)

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: ALLE Wokwi-ESPs und ALLE ESPs ohne NTP-Sync
- Welche Daten: Sensor-Readings gespeichert aber unerreichbar via API
- Welche Funktionen: Live-Daten, Charts, Monitor — alle leer fuer betroffene ESPs

## Fix-Vorschlag
Server-Timestamp-Fallback an 2 Stellen:
1. `sensor_handler.py:329`: `if ts_value is None or ts_value <= 0: esp32_timestamp = datetime.now(timezone.utc).replace(tzinfo=None)`
2. `heartbeat_handler.py:202`: `if ts_value <= 0: last_seen = datetime.now(timezone.utc)`

## Fix-Komplexitaet
- [x] Einzeiler (2 Stellen)
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: BUG-06 (Flicker), BUG-14 (Epoch-Rows)

## Verifikation nach Fix
```query
SELECT COUNT(*) FROM sensor_data WHERE created_at < '1971-01-01';
→ SOLL: 0 neue Rows (alte koennen via UPDATE korrigiert werden)

{compose_service="el-servador"} |= "1970-01-01"
→ SOLL: 0 Treffer
```
