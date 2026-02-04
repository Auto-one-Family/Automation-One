# AutomationOne - KI-Agent Router

> **Projekt:** IoT-Framework für Gewächshausautomation
> **Prinzip:** Server-Zentrisch. ESP32 = dumme Agenten. ALLE Logik auf Server.
```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
```

---

## Skills (Entwicklung)

| Trigger | Skill |
|---------|-------|
| ESP32, C++, Sensor, Aktor, GPIO, PlatformIO, Wokwi | `esp32-development` |
| Python, FastAPI, MQTT-Handler, Database, API | `server-development` |
| Vue 3, TypeScript, Pinia, WebSocket, Dashboard | `frontend-development` |

## Agenten (Debugging)

| Agent | Trigger-Keywords |
|-------|------------------|
| `esp32-debug` | Serial, Boot, NVS, GPIO-Fehler, Watchdog, Crash |
| `server-debug` | FastAPI, Handler, Error 5xxx, god_kaiser.log |
| `mqtt-debug` | Topic, Payload, QoS, Publish, Subscribe, Broker |
| `provisioning-debug` | AP-Mode, Approval, Config-Push, Lifecycle |
| `db-inspector` | Schema, Query, Migration, Alembic |
| `system-control` | Start, Stop, Build, Flash, Commands |

## Referenzen

| Pfad | Inhalt |
|------|--------|
| `reference/api/` | MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS |
| `reference/errors/` | ERROR_CODES (ESP32: 1000-4999, Server: 5000-5999) |
| `reference/patterns/` | COMMUNICATION_FLOWS, ARCHITECTURE |

## Regeln

1. **Server-Zentrisch** → Logic NIEMALS auf ESP32
2. **Patterns erweitern** → Bestehenden Code analysieren
3. **Build verifizieren** → `pio run` / `pytest` vor Abschluss

## Workflow

```
SKILL → ANALYSE → REFERENZ → IMPLEMENTIEREN → VERIFIZIEREN
```

---

*Details in Skills. Commands in `system-control`. Diese Datei ist NUR Router.*
