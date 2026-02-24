# Debug-Logs

Log-Verzeichnisstruktur fuer AutomationOne Debug-Sessions und persistente Logs.

## Verzeichnisse

| Verzeichnis | Beschreibung | Persistenz |
|-------------|--------------|------------|
| `server/` | Server JSON-Logs (Bind-Mount von Docker) | Persistent (RotatingFileHandler: 10MB x 10) |
| `postgres/` | PostgreSQL Query/Connection Logs | Persistent (Daily Rotation) |
| `current/` | Aktuelle Debug-Session Logs | Wird bei neuer Session geleert |
| `archive/` | Archivierte Sessions | Permanent |
| `wokwi/` | Wokwi Test-Logs (Serial, MQTT, Reports) | Permanent |
| `backend/` | pytest/Coverage Output | Permanent |
| `frontend/` | Vitest/Playwright Output | Permanent |
| `mqtt/` | MQTT File-Logs (aktuell deaktiviert) | - |

## Persistente Logs (immer verfuegbar)

| Datei | Format | Erzeugt durch |
|-------|--------|---------------|
| `server/god_kaiser.log` | JSON (1 Zeile pro Event) | Server RotatingFileHandler |
| `postgres/postgresql-YYYY-MM-DD.log` | Text (SQL + Connection) | PostgreSQL logging_collector |

## Session-Logs (nach start_session.sh)

| Datei | Format | Erzeugt durch |
|-------|--------|---------------|
| `current/god_kaiser.log` | Symlink → server/god_kaiser.log | start_session.sh |
| `current/mqtt_traffic.log` | Text mit Timestamps | start_session.sh (mosquitto_sub) |
| `current/esp32_serial.log` | Text (Serial Output) | User manuell (Wokwi/PIO) |
| `current/STATUS.md` | Markdown | start_session.sh |

## Session starten

```bash
./scripts/debug/start_session.sh mein-test
# Dann ESP32 separat starten:
cd "El Trabajante" && wokwi-cli . --timeout 300000 --serial-log-file ../logs/current/esp32_serial.log
```

## Hinweise

- `current/` wird bei neuer Session archiviert und dann geleert
- Server-Logs in `server/` existieren IMMER wenn der Server jemals lief
- ESP32 Serial-Log erfordert MANUELLE Aktion (Wokwi oder PIO Monitor)
- MQTT-Payload-Capture nur bei laufender Session (mosquitto_sub)