# Netzwerk-Debug Report — System-Control

**Erstellt:** 2026-02-08  
**Skill:** system-control  
**Zweck:** MQTT + Docker-Netzwerk Diagnose

---

## 1. Ausgeführte Befehle

```
docker compose ps -a
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Invoke-WebRequest http://localhost:8000/api/v1/health/live
Invoke-WebRequest http://localhost:8000/api/v1/health/ready
docker exec automationone-mqtt mosquitto_sub -h localhost -t "#" -v -C 3 -W 5
docker exec automationone-mqtt mosquitto_pub -h localhost -t "kaiser/god/esp/TEST_DEBUG/system/heartbeat" -m '...'
docker port automationone-mqtt
```

---

## 2. Ergebnis

### Container-Status

| Container | Status | Ports |
|-----------|--------|-------|
| automationone-server | Up 2h (healthy) | 8000 |
| automationone-frontend | Up 4h (healthy) | 5173 |
| automationone-mqtt | Up 4h (healthy) | 9001 (WebSocket) |
| automationone-postgres | Up 4h (healthy) | 5432 |
| automationone-grafana | Up 10h (healthy) | 3000 |
| automationone-loki | Up 10h (healthy) | 3100 |
| automationone-prometheus | Up 10h (healthy) | 9090 |
| automationone-promtail | Up 10h | — |
| automationone-pgadmin | Exited (127) | — |

### Health-Checks

| Endpoint | Resultat |
|----------|----------|
| `/api/v1/health/live` | `{"alive": true}` |
| `/api/v1/health/ready` | `{"ready": true, "checks": {"database": true, "mqtt": true, "disk_space": true}}` |

### MQTT

| Test | Resultat |
|------|----------|
| **Subscribe** (`mosquitto_sub -t "#" -C 3`) | Erfolgreich — 3 Nachrichten empfangen |
| **Publish** (`mosquitto_pub` Heartbeat) | Erfolgreich |
| **Broker-Verbindung** | Server meldet `mqtt: true` in ready |

### MQTT-Traffic (Ausschnitt)

```
kaiser/god/esp/MOCK_REALTIMEOC2ESKBF/system/heartbeat
kaiser/god/esp/MOCK_REALTIMEOC2ESKBF/sensor/5/data  {"gpio": 5, "sensor_type": "temperature", "value": 25.5, ...}
kaiser/god/esp/MOCK_SENSORH1QEJK3Y/system/heartbeat
```

---

## 3. Verifikation

- [x] Container laufen (Server, MQTT, Postgres, Frontend)
- [x] Health-Check OK (live + ready)
- [x] MQTT-Broker erreichbar (Publish + Subscribe)
- [x] Server mit MQTT verbunden
- [x] MQTT-Traffic sichtbar (Heartbeats, Sensor-Daten)

---

## 4. Port-Hinweise

| Port | Exponiert an Host | Nutzung |
|------|-------------------|---------|
| 1883 (MQTT) | Nein (nur Docker-Netz) | Server ↔ Broker; E2E-Tests nutzen `docker exec` |
| 9001 (MQTT WS) | Ja (0.0.0.0:9001) | Externe WebSocket-Clients |
| 8000 | Ja | REST API, WebSocket |
| 5173 | Ja | Frontend Dev |

**E2E-Tests:** `mqtt.ts` nutzt `docker exec automationone-mqtt mosquitto_pub` — funktioniert ohne Host-Port 1883.

---

## 5. Fazit

**Netzwerk und MQTT sind funktionsfähig.** Server, MQTT-Broker und Datenbank sind verbunden. MQTT-Traffic (Heartbeats, Sensor-Daten) wird korrekt verarbeitet.

**pgadmin:** Exited (127) — nicht kritisch für E2E; bei Bedarf neu starten.

---

## 6. Nächste Schritte (bei E2E-Problemen)

1. `make e2e-up` — E2E-Stack mit korrekten Env-Vars (JWT, CORS)
2. `make e2e-test` — Playwright-Tests
3. Bei Timeout: Backend-Erreichbarkeit prüfen — `Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health/live" -UseBasicParsing`
