# Debug Scripts

> **Zweck:** Helper-Scripts für Debug-Sessions

## Verfügbare Scripts

| Script | Beschreibung | Status |
|--------|--------------|--------|
| `start_session.sh` | Neue Debug-Session starten | TODO |
| `stop_session.sh` | Session beenden und archivieren | TODO |
| `capture_esp32_wokwi.sh` | Wokwi mit Log-Capture starten | TODO |
| `capture_esp32_hardware.sh` | PlatformIO Monitor mit Log | TODO |
| `capture_mqtt.sh` | MQTT Traffic aufzeichnen | TODO |
| `capture_server.sh` | Server mit Console-Log starten | TODO |

## Verwendung

```bash
# Session starten
./scripts/debug/start_session.sh boot-test

# Einzelne Captures
./scripts/debug/capture_mqtt.sh
./scripts/debug/capture_server.sh

# Session beenden
./scripts/debug/stop_session.sh
```
