# Wokwi ESP Logging Status

## Aktueller Status

**Datum:** 2026-01-11  
**Zeit:** ~02:05 Uhr

### Serial Logger

✅ **Logger Script gestartet:** `wokwi_serial_logger.py` läuft im Hintergrund  
⚠️ **RFC2217 Server:** Port 4000 ist nicht verfügbar  
⚠️ **Log-Datei:** Wird noch nicht geschrieben  

### Erwartetes Verhalten

Der Serial Logger wartet auf:
- Wokwi RFC2217 Server auf Port 4000 (definiert in `wokwi.toml`)
- Serial-Output von der Wokwi Simulation

### Was passieren sollte

Wenn Wokwi läuft:
1. Wokwi startet RFC2217 Server auf Port 4000
2. Serial Logger verbindet sich zu `rfc2217://localhost:4000`
3. Logs werden in `El Trabajante/logs/wokwi_serial.log` geschrieben
4. Debug-Logs in `.cursor/debug.log`

### Mögliche Probleme

1. **Wokwi läuft nicht:** Wokwi Simulation muss gestartet werden
2. **RFC2217 nicht aktiviert:** Wokwi muss mit `rfc2217ServerPort = 4000` in `wokwi.toml` konfiguriert sein
3. **Port bereits belegt:** Ein anderer Prozess verwendet Port 4000

### Nächste Schritte

1. Prüfen ob Wokwi läuft
2. Wenn nicht: Wokwi starten
3. Dann: Logs werden automatisch geschrieben


