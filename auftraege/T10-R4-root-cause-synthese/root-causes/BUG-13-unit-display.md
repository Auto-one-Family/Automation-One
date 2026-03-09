# Root-Cause: BUG-13 — Komponenten-Tabelle zeigt sensor_type statt unit

## Symptom
Komponenten-Tabelle zeigt "22,00 ds18b20" statt "22,00 Grad-C" — `sensor_type` wird als Einheit angezeigt.

## Reproduktion
1. Komponenten-View oeffnen (/sensors)
2. MOCK_A3592B7E → DS18B20 Zeile
3. Wert-Spalte: "22,00 ds18b20" statt "22,00 Grad-C"
→ Falsche Einheit in Tabelle

## Root Cause
- **Datei:** Frontend Komponenten-View (SensorInventoryView oder aehnlich)
- **Funktion:** Wert-Formatierung
- **Problem:** Die Komponente nutzt `sensor_type` als Fallback wenn `unit` leer ist (BUG-09: `unit=""` weil `raw_mode=True`). Statt "kein Unit" → "ds18b20" als Pseudo-Unit. Teilweise Folge von BUG-03 (Double-UTF8) und BUG-09 (leere unit).

## Betroffene Schicht
- [ ] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Alle Sensoren mit leerer `unit` in DB
- Welche Daten: Nur Anzeige betroffen
- Welche Funktionen: Komponenten-Tabelle, ggf. weitere Views

## Fix-Vorschlag
1. Frontend: Wenn `unit` leer, aus sensor_type_registry die Default-Unit holen (z.B. ds18b20 → "Grad-C") statt `sensor_type` als Fallback
2. Oder: BUG-09 Fix (raw_mode Default) loest das Problem auf Backend-Seite, da dann `unit` korrekt befuellt wird

## Fix-Komplexitaet
- [x] Einzeiler
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: BUG-09 (leere unit), BUG-03 (falsche unit)
- Blockiert: — (standalone)

## Verifikation nach Fix
```
Komponenten-View → DS18B20 Zeile
→ SOLL: "22,00 Grad-C" (nicht "22,00 ds18b20")
```
