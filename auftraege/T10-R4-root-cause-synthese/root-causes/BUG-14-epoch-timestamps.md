# Root-Cause: BUG-14 — 134 Epoch-0 Timestamps in sensor_data

## Symptom
134 sensor_data-Zeilen mit `created_at = 1970-01-01` fuer ESP_00000001 DS18B20 GPIO 4. Alle mit identischen Werten: raw=360, processed=22.5, processing_mode=pi_enhanced.

## Reproduktion
1. `SELECT COUNT(*) FROM sensor_data WHERE created_at < '1971-01-01';` → 134
2. Alle gehoeren zu ESP_00000001 (Wokwi)
→ Historische Daten-Altlast durch BUG-05

## Root Cause
- **Datei:** Keine eigene — direkte FOLGE von BUG-05
- **Problem:** BUG-05 (fehlender ts<=0 Guard) hat 134 Rows mit Epoch-Timestamp erzeugt. Die Daten sind korrekt (Werte plausibel), aber durch den falschen Timestamp unerreichbar via API-Zeitfilter.

## Betroffene Schicht
- [x] El Servador (Backend — Daten-Altlast)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Nur ESP_00000001 (Wokwi)
- Welche Daten: 134 Rows mit falschen Timestamps
- Welche Funktionen: Historische Charts/Analysen

## Fix-Vorschlag
Einmaliges SQL-UPDATE nach BUG-05 Fix:
```sql
UPDATE sensor_data SET created_at = NOW()
WHERE created_at < '1971-01-01';
```
Oder: Rows loeschen wenn nicht benoetigt (Wokwi-Testdaten).

## Fix-Komplexitaet
- [x] Einzeiler (SQL-Cleanup)
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: BUG-05 (erst fix, dann cleanup — sonst entstehen neue Rows)
- Blockiert: — (standalone Cleanup)

## Verifikation nach Fix
```query
SELECT COUNT(*) FROM sensor_data WHERE created_at < '1971-01-01';
→ SOLL: 0
```
