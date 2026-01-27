# Wokwi Server + ESP Start - Anleitung

## Gefundene Informationen

Das Start-Script `scripts/start-wokwi-dev.ps1` startet automatisch:

1. **Mosquitto MQTT Broker** (Docker Container)
2. **God-Kaiser Server** (FastAPI, Port 8000)
3. **Wokwi ESP32 Simulation** (optional)

## Voraussetzungen

✅ **Alle erfüllt:**
- Docker: Installiert (Version 29.1.3)
- Poetry: Installiert (Version 2.2.1)
- PlatformIO: Gefunden
- Wokwi CLI: Gefunden
- WOKWI_CLI_TOKEN: Gesetzt

⚠️ **Problem:** Docker Desktop läuft nicht!

## Start-Prozess

```powershell
# 1. WOKWI_CLI_TOKEN setzen (falls nicht in Environment)
$env:WOKWI_CLI_TOKEN = "wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725"

# 2. Script starten
cd scripts
.\start-wokwi-dev.ps1

# Oder mit Firmware-Build:
.\start-wokwi-dev.ps1 -BuildFirmware

# Oder nur Server (ohne Wokwi):
.\start-wokwi-dev.ps1 -SkipWokwi
```

## Was das Script macht

1. **Voraussetzungen prüfen** (Docker, Poetry, PlatformIO, Token)
2. **Mosquitto starten** (Docker Container `mosquitto-wokwi` auf Port 1883)
3. **Wokwi ESP seeden** (Datenbank-Eintrag für ESP_WOKWI001)
4. **Firmware bauen** (optional, mit `-BuildFirmware`)
5. **Server starten** (PowerShell Background Job, Port 8000)
6. **Server-Bereitschaft prüfen** (Health-Check auf /health)
7. **Wokwi starten** (wokwi-cli mit Timeout 0 = unbegrenzt)

## Logs

**Server-Logs:**
- Console Output: PowerShell Job
- Datei: `El Servador/god_kaiser_server/logs/god_kaiser.log`

**Wokwi-Logs:**
- Serial Output: Wokwi CLI Console
- Datei: `El Trabajante/logs/wokwi_serial.log` (wenn Serial Logger läuft)

**MQTT-Logs:**
- Docker Container Logs: `docker logs mosquitto-wokwi`

## Aktueller Status

❌ **Docker läuft nicht** - muss gestartet werden
- Docker Desktop muss gestartet sein
- Dann: `docker ps` sollte funktionieren


