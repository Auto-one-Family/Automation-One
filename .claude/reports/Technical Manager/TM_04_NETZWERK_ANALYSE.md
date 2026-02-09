# TM-Auftrag 04: Netzwerk – Analyse, Modelle, Kontrolle, Segmentierung

**Verfasser:** Robin (System-Kontext)  
**Format:** Einzelgespräch mit Technical Manager  
**Ziel:** Aktuellen Stand erfassen, Modelle erklären, volle Kontrolle und professionelle Debugbarkeit

---

## 0. Referenzdokumente für TM (Robin mitliefern)

**Diese Dateien zuerst lesen – sie liefern die Grundlage für gezielte Analyse.**

| Priorität | Pfad (relativ zu Projektroot) | Inhalt |
|-----------|-------------------------------|--------|
| 1 | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Schema, QoS, Richtung (ESP→Server, Server→ESP), `kaiser/god/esp/{id}/...` |
| 2 | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | 7 Datenflüsse – HTTP, MQTT, WebSocket-Ketten |
| 3 | `.claude/skills/mqtt-debug/SKILL.md` | MQTT-Diagnose, `mosquitto_sub`, Topic-Filter, Log-Pfade |
| 4 | `.claude/reference/debugging/LOG_LOCATIONS.md` | Sektion 6: MQTT Traffic – Capture, Topics, `kaiser/#` |
| 5 | `.claude/reference/api/WEBSOCKET_EVENTS.md` | WS-Events – `sensor_data`, `device_approved`, etc. |
| 6 | `docker-compose.yml` | `networks`, `ports`, `automationone-net` |

**Report:** `.claude/reports/current/NETWORK_DEBUG_REPORT.md` – letzter Netzwerk-Report.

---

## 1. Referenzdateien für TM-Session hochladen

| # | Datei | Zweck |
|---|-------|-------|
| 1 | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Schema |
| 2 | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | 7 Datenflüsse |
| 3 | `.claude/reports/current/NETWORK_DEBUG_REPORT.md` | Letzter Netzwerk-Report |
| 4 | `.claude/skills/mqtt-debug/SKILL.md` | MQTT-Diagnose |
| 5 | `.claude/skills/system-control/SKILL.md` | Ports, Health |
| 6 | `docker-compose.yml` | networks, ports |
| 7 | `docker/mosquitto/mosquitto.conf` | MQTT-Broker |
| 8 | `El Trabajante/wokwi.toml` | Wokwi-Gateway |

---

## 2. IST-Zustand (Fakten)

### 2.1 Architektur

```
El Frontend (Vue 3) ← HTTP/WS → El Servador (FastAPI) ← MQTT → El Trabajante (ESP32)
```

- **REST:** localhost:8000
- **WebSocket:** ws://localhost:8000/ws
- **MQTT:** localhost:1883 (Docker-Internal), 9001 (WebSocket, Host)

### 2.2 Ports

| Port | Exponiert | Nutzung |
|------|-----------|---------|
| 5432 | Ja | PostgreSQL |
| 1883 | Nein | MQTT (nur Docker-Netz) |
| 9001 | Ja | MQTT WebSocket |
| 8000 | Ja | REST + WebSocket |
| 5173 | Ja | Frontend Dev |
| 3000 | Ja | Grafana |
| 9090 | Ja | Prometheus |
| 3100 | Ja | Loki |

### 2.3 Docker-Netzwerk

- **Netz:** `automationone-net` (bridge).
- **Service-Discovery:** Container-Namen (postgres, mqtt-broker, el-servador, el-frontend).
- **E2E:** `docker exec automationone-mqtt mosquitto_pub` – kein Host-Port 1883 nötig.

### 2.4 MQTT-Topics

- **Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/...`
- **Beispiele:** `.../sensor/{gpio}/data`, `.../actuator/{gpio}/command`, `.../system/heartbeat`

---

## 3. Offene Fragen (für TM)

1. **Modelle:** Welche Netzwerk-Modelle (Layer, Protokolle, Abhängigkeiten) sollen dokumentiert werden? Wo sind sie beschrieben?
2. **Funktionsweise:** Wie soll der Datenfluss HTTP → Server → MQTT → ESP und zurück für Debug-Sessions erklärt werden?
3. **Volle Kontrolle:** Welche Knöpfe/Schnittstellen will Robin für Netzwerk-Operationen (Ports an/aus, Broker-Neustart, Traffic-Filter)?
4. **Segmentierung:** Sollen Frontend, Backend, MQTT, DB in separate Netze? Welche Kommunikation zwischen Segmenten ist erlaubt?
5. **Port-Netzwerk:** Sind die aktuellen Port-Mappings korrekt? Welche Ports sind für Produktion vs. Dev vs. CI unterschiedlich?
6. **Debugbarkeit:** Welche Tools/Logs/Befehle sind für professionelle Netzwerk-Diagnose nötig? (z.B. Prometheus, Loki, tcpdump, mosquitto_sub)

---

## 4. Bereiche für Detail-Analyse

| Bereich | Dateien | Fokus |
|---------|---------|-------|
| Docker networks | docker-compose.yml | Bridge, Subnet |
| MQTT-Broker | mosquitto.conf, docker | Listener, ACL, Persistenz |
| Port-Mappings | Alle compose-Dateien | host:container |
| REST/WS | REST_ENDPOINTS, WEBSOCKET_EVENTS | Endpoints |
| MQTT-Topics | MQTT_TOPICS.md | Schema, QoS |

### 4.1 Wo suchen / Was suchen

| Schicht | Wo suchen | Was suchen |
|---------|-----------|------------|
| **MQTT** | `docker/mosquitto/mosquitto.conf` | `listener 1883`, `listener 9001`, `allow_anonymous` |
| **Topics** | `MQTT_TOPICS.md` | `sensor/{gpio}/data`, `actuator/{gpio}/command`, `system/heartbeat` |
| **WebSocket** | `WEBSOCKET_EVENTS.md`, Frontend `useWebSocket` | `sensor_data`, `device_approved`, Reconnect-Logik |
| **Ports** | `docker-compose.yml` | 1883 (nicht Host), 9001 (Host), 8000, 5173 |
| **Flows** | `COMMUNICATION_FLOWS.md` | Request-Ketten HTTP→MQTT→ESP |

### 4.2 Agent-Befehle für gezielte Analyse

| Analyse-Ziel | Agent | TM-Befehl (Kern) |
|--------------|-------|------------------|
| MQTT-Traffic, Topic-Flow | mqtt-debug | Analysiere `logs/mqtt/` – welche Topics, Payloads, Timing |
| Port-Status, Health | system-control | `docker compose ps`, `curl localhost:8000/api/v1/health/live` |
| WebSocket-Events | frontend-debug | Prüfe `espStore.handleSensorData`, `sensor_data` Event |
| Topic-Konsistenz | mqtt-dev | Vergleiche MQTT_TOPICS.md mit Server-Handler-Subscriptions |

---

## 5. Empfohlene Agents & Skills

| Zweck | Agent | Skill |
|-------|-------|-------|
| MQTT-Traffic | mqtt-debug | mqtt-debug |
| Stack, Ports | system-control | system-control |
| MQTT-Entwicklung | mqtt-dev | mqtt-development |
| Flow-Konsistenz | agent-manager | agent-manager |

---

## 6. Verknüpfung mit anderen Punkten

- **Punkt 1 (Wokwi):** Wokwi-Gateway, MQTT-Netz.
- **Punkt 2 (Docker):** Netzwerk-Definition.
- **Punkt 5 (Frontend):** WebSocket, API-URL.

---

## 7. Randinformationen (Full-Stack-Kontext)

| Kontext | Info |
|---------|------|
| **Datenfluss** | ESP32 → MQTT (1883) → Server Handler → DB + WebSocket → Frontend |
| **MQTT lokal** | Port 1883 nicht am Host; `docker exec automationone-mqtt mosquitto_pub` für Tests |
| **WebSocket** | `ws://localhost:8000/ws` – Events: `sensor_data`, `device_approved`, `heartbeat` |
