# Root-Cause: BUG-15 — MOCK_D75008E2 Ghost-Device

## Symptom
14 Warnungen "Sensor GPIO0_sht31_temp not in config" fuer MOCK_D75008E2 — ein Device das NICHT in esp_devices existiert.

## Reproduktion
1. Docker-Stack starten
2. Loki: `{compose_service="el-servador"} |= "MOCK_D75008E2"` → 14 Warnings
3. `SELECT * FROM esp_devices WHERE device_id = 'MOCK_D75008E2';` → 0 Rows
→ Scheduler generiert Daten fuer nicht-existentes Device

## Root Cause
- **Datei:** `simulation/scheduler.py`
- **Funktion:** Mock-Device-Scheduling
- **Problem:** Scheduler hat eine residuale Konfiguration (Hard-coded oder aus alter Config-Datei) fuer MOCK_D75008E2. Beim Start versucht er Sensor-Daten zu generieren, findet aber keine sensor_configs → Warning-Log. Die Warnings treten nur nach Restart auf (einmalig).

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Nur MOCK_D75008E2 (nicht-existent)
- Welche Daten: Keine Datenverluste
- Welche Funktionen: Log-Noise nach Docker-Restart

## Fix-Vorschlag
Scheduler-Config gegen aktuelle `esp_devices`-Tabelle validieren beim Start. Device-IDs die nicht in DB existieren → ueberspringen + einmalige Info-Meldung statt wiederholter Warnings.

## Fix-Komplexitaet
- [ ] Einzeiler
- [x] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: — (standalone)

## Verifikation nach Fix
```query
{compose_service="el-servador"} |= "MOCK_D75008E2"
→ SOLL: 0 Treffer (oder maximal 1 Info-Meldung "Skipping non-existent device")
```
