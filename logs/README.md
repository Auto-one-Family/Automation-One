# Debug-Logs

Hier landen alle Log-Dateien während Debug-Sessions.

## Ordner

| Ordner | Beschreibung |
|--------|--------------|
| `current/` | Aktuelle Debug-Session - wird bei neuer Session geleert |
| `archive/` | Archivierte Sessions - bleiben erhalten |

## Log-Dateien

| Datei | Quelle | Erzeugt durch |
|-------|--------|---------------|
| `esp32_serial.log` | ESP32 Serial Output | Wokwi CLI oder PlatformIO Monitor |
| `server_console.log` | Server stdout/stderr | Uvicorn mit Umleitung |
| `god_kaiser.log` | Server Structured Log | Automatisch (Symlink) |
| `mqtt_traffic.log` | MQTT Messages | mosquitto_sub |

## Session starten

```bash
# Option 1: Script verwenden
./scripts/debug/start_session.sh mein-test

# Option 2: Manuell
# Terminal 1 - MQTT
mosquitto_sub -h localhost -t "kaiser/#" -v > logs/current/mqtt_traffic.log &

# Terminal 2 - Server (falls nicht schon läuft)
cd "El Servador/god_kaiser_server"
poetry run uvicorn src.main:app --reload > ../../logs/current/server_console.log 2>&1 &

# Terminal 3 - ESP32 (Wokwi)
cd "El Trabajante"
wokwi-cli . --timeout 300000 --serial-log-file ../logs/current/esp32_serial.log
```

## Session beenden

```bash
# Option 1: Script
./scripts/debug/stop_session.sh

# Option 2: Manuell
# Prozesse mit Ctrl+C beenden
# Logs nach archive/ verschieben falls gewünscht
```

## Hinweise

- `current/` Logs werden bei neuer Session überschrieben
- Wichtige Logs vor neuer Session sichern oder archivieren
- `god_kaiser.log` liegt eigentlich in `El Servador/god_kaiser_server/logs/`