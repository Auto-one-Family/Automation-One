# Root-Cause: BUG-07 — Weak WiFi Log-Spam

## Symptom
Jeder Wokwi-Heartbeat loggt `Weak WiFi signal on ESP_00000001: rssi=-72 dBm`. ~1 Warning pro Heartbeat (~alle 30-60s).

## Reproduktion
1. Wokwi-ESP laeuft (oder Mock-ESP)
2. Heartbeat-Handler empfaengt RSSI-Wert
3. RSSI < -70 → Warning geloggt
→ ~80 Warnings/30min, reine Log-Noise

## Root Cause
- **Datei:** `heartbeat_handler.py:1091-1093`
- **Funktion:** WiFi-Signal-Check
- **Problem:** Statischer Schwellwert `-70 dBm` ohne Filter fuer `hardware_type`. Wokwi-Simulation sendet festen RSSI-Wert `-72 dBm`. Kein Unterschied zwischen echtem ESP (wo die Warnung sinnvoll ist) und Simulation (wo sie nur Noise erzeugt). Inkonsistenz: 3 verschiedene Schwellwerte im Codebase (-70, -70, -75 in Tests).

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: ALLE Wokwi/Mock-ESPs
- Welche Daten: Keine Datenverluste, nur Log-Noise
- Welche Funktionen: Log-Analyse erschwert durch Noise

## Fix-Vorschlag
`hardware_type`-Filter: `if wifi_rssi < -70 and esp_device.hardware_type not in ("MOCK", "WOKWI", "SIMULATION"): logger.warning(...)`

## Fix-Komplexitaet
- [x] Einzeiler
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: — (standalone)

## Verifikation nach Fix
```query
{compose_service="el-servador"} |= "Weak WiFi" |= "MOCK"
→ SOLL: 0 Treffer
```
