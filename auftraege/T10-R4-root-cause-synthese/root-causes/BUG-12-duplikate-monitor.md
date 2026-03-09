# Root-Cause: BUG-12 — Doppelte Sensor-Eintraege in Monitor

## Symptom
Monitor Widget-Dropdown und Komponenten-Tabelle zeigen 2 DS18B20-Eintraege mit gleichem Display-Name fuer MOCK_A3592B7E.

## Reproduktion
1. Monitor-View oeffnen
2. Widget-Dropdown fuer MOCK_A3592B7E → 2x DS18B20 mit gleichem Namen
3. Komponenten-Tabelle → 2 Zeilen fuer DS18B20 ohne Unterscheidungsmerkmal
→ Benutzer kann nicht erkennen welcher DS18B20 welcher ist

## Root Cause
- **Datei:** Frontend Monitor/Komponenten-View (genaue Komponente aus T10-R3)
- **Funktion:** Sensor-Listing ohne Disambiguierung
- **Problem:** 2 DS18B20-Configs auf MOCK_A3592B7E GPIO 4 mit verschiedenen `onewire_address`-Werten aber gleichem `sensor_name` und `sensor_type`. Frontend zeigt `sensor_name` als Label ohne `onewire_address` als Disambiguierungs-Suffix. Widget-Dropdown und Komponenten-Tabelle nutzen keinen Unique-Key-basiert auf `config_id`.

## Betroffene Schicht
- [ ] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Jeder ESP mit 2+ Sensoren gleichen Typs auf gleichem GPIO
- Welche Daten: Nur Anzeige betroffen
- Welche Funktionen: Monitor Widget-Dropdown, Komponenten-Tabelle

## Fix-Vorschlag
Sensor-Labels disambiguieren wenn gleicher `sensor_type` auf gleichem GPIO: `sensor_name (ROM: ...last4)` oder `sensor_name (onewire_address[-4:])`. Alle Selektoren muessen `config_id` als Value verwenden, nicht `sensor_type + gpio`.

## Fix-Komplexitaet
- [ ] Einzeiler
- [x] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: BUG-08 (gleicher Root Cause — OneWire Multi-Sensor)
- Blockiert: — (standalone)

## Verifikation nach Fix
```
Monitor → Widget-Dropdown → MOCK_A3592B7E
→ SOLL: 2 DS18B20 mit unterscheidbaren Namen (z.B. "DS18B20 (39362D)" und "DS18B20 (3C0C79)")
```
