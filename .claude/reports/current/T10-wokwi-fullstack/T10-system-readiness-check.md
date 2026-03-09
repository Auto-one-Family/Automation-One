# T10 System Readiness Check — Wokwi Full-Stack Test

**Datum:** 2026-03-08
**Status:** BEREIT (mit einem Hinweis zu Loki/Monitoring-Profil)

---

## 1. Docker Compose Services

### Core Services (immer aktiv, kein Profil)

| Service | Container-Name | Port(s) | Image |
|---------|---------------|---------|-------|
| postgres | `automationone-postgres` | `5432:5432` | postgres:16-alpine |
| mqtt-broker | `automationone-mqtt` | `1883:1883`, `9001:9001` (WS) | eclipse-mosquitto:2 |
| el-servador | `automationone-server` | `8000:8000` | ./El Servador/Dockerfile |
| el-frontend | `automationone-frontend` | `5173:5173` | ./El Frontend/Dockerfile (dev target) |

### Monitoring Services (Profil: `monitoring` — laut .env DEFAULT aktiv)

| Service | Container-Name | Port(s) | Image |
|---------|---------------|---------|-------|
| loki | `automationone-loki` | `3100:3100` | grafana/loki:3.4 |
| alloy | `automationone-alloy` | `12345:12345` | grafana/alloy:v1.13.1 |
| prometheus | `automationone-prometheus` | `9090:9090` | prom/prometheus:v3.2.1 |
| grafana | `automationone-grafana` | `3000:3000` | grafana/grafana:11.5.2 |
| cadvisor | `automationone-cadvisor` | `8080:8080` | gcr.io/cadvisor/cadvisor:v0.49.1 |
| postgres-exporter | `automationone-postgres-exporter` | intern:9187 | prometheuscommunity/postgres-exporter |
| mosquitto-exporter | `automationone-mosquitto-exporter` | `9234:9234` | sapcc/mosquitto-exporter:0.8.0 |

### Optionale Services (manuell)

| Service | Container-Name | Port | Profil |
|---------|---------------|------|--------|
| pgadmin | `automationone-pgadmin` | `5050:80` | `devtools` |
| esp32-serial-logger | `automationone-esp32-serial` | — | `hardware` |

**HINWEIS:** `.env` setzt `COMPOSE_PROFILES=monitoring` — Monitoring-Stack startet automatisch mit `docker compose up -d`.

---

## 2. MQTT Broker Konfiguration

- **Container:** `automationone-mqtt`
- **Port:** `1883` (MQTT), `9001` (WebSocket)
- **Anonymous Access:** `allow_anonymous true` — kein Auth erforderlich
- **Wokwi Private Gateway:** ESP32 verbindet zu `host.wokwi.internal:1883` — wird automatisch zu `localhost` aufgeloest wenn `gateway = true` in wokwi.toml gesetzt ist (KONFIGURIERT)
- **Windows Firewall:** Port 1883 muss freigegeben sein (Hinweis in wokwi.toml dokumentiert)
- **Persistence:** Aktiv (`/mosquitto/data/`)
- **Logging:** stdout -> Docker json-file -> Alloy -> Loki

---

## 3. Wokwi-Konfiguration

**Datei:** `El Trabajante/wokwi.toml`

| Parameter | Wert | Status |
|-----------|------|--------|
| version | 1 | OK |
| firmware | `.pio/build/wokwi_simulation/firmware.bin` | Environment: `wokwi_simulation` |
| elf | `.pio/build/wokwi_simulation/firmware.elf` | OK |
| rfc2217ServerPort | `4000` | Serial-Zugriff via `rfc2217://localhost:4000` |
| gateway | `true` | AKTIVIERT — host.wokwi.internal -> localhost |
| baud | `115200` | Muss Serial.begin() im Firmware entsprechen |

**Build-Befehl vor T10:**
```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/pio.exe run -e wokwi_simulation
```

**Wokwi-CLI starten:**
```bash
cd "El Trabajante"
wokwi-cli --timeout 60000
```

**WICHTIG:** Firmware-Build mit Environment `wokwi_simulation` (NICHT `esp32_dev`).

---

## 4. PostgreSQL Verbindung

**Container:** `automationone-postgres`
**Credentials aus .env:**

| Variable | Wert |
|----------|------|
| POSTGRES_USER | `god_kaiser` |
| POSTGRES_PASSWORD | `password` |
| POSTGRES_DB | `god_kaiser_db` |
| Port | `5432` |

### psql-Befehlsvorlage (Copy-Paste)

```bash
# Health-Check
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT version();"

# ESP-Devices anzeigen
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, status, zone_id, created_at FROM esp_devices ORDER BY created_at DESC LIMIT 10;"

# Sensor-Configs anzeigen
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT sc.config_id, sc.esp_id, sc.gpio, sc.sensor_type, sc.sensor_name, sc.i2c_address \
   FROM sensor_configs sc ORDER BY sc.created_at DESC LIMIT 20;"

# Heartbeats (letzten 5 je ESP)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, timestamp, rssi FROM esp_heartbeats ORDER BY timestamp DESC LIMIT 10;"

# Sensor-Readings
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, gpio, sensor_type, value, unit, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 10;"
```

---

## 5. MQTT-Befehlsvorlagen (Copy-Paste)

```bash
# Alle Topics beobachten (10 Messages, 15s Timeout)
mosquitto_sub -h localhost -p 1883 -t "kaiser/#" -v -C 10 -W 15

# Heartbeats beobachten (3 Messages, 60s Timeout)
mosquitto_sub -h localhost -p 1883 -t "kaiser/god/esp/+/system/heartbeat" -v -C 3 -W 60

# Sensor-Daten beobachten (5 Messages, 30s Timeout)
mosquitto_sub -h localhost -p 1883 -t "kaiser/god/esp/+/sensor/+/data" -v -C 5 -W 30

# Registration-Request beobachten (Wokwi-ESP registriert sich)
mosquitto_sub -h localhost -p 1883 -t "kaiser/god/esp/+/system/registration" -v -C 1 -W 30

# Actuator-Commands beobachten
mosquitto_sub -h localhost -p 1883 -t "kaiser/god/esp/+/actuator/+/command" -v -C 5 -W 30

# Test-Heartbeat publizieren (Mock)
mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/god/esp/WOKWI-TEST-01/system/heartbeat" \
  -m '{"device_id":"WOKWI-TEST-01","rssi":-60,"free_heap":120000,"timestamp":1741392000}'

# Retained Messages loeschen (bei Cleanup)
mosquitto_pub -h localhost -p 1883 -t "kaiser/god/esp/WOKWI-TEST-01/system/heartbeat" -n -r
```

---

## 6. Loki-Konfiguration

**Endpoint:** `http://localhost:3100`
**Auth:** Keine (auth_enabled: false)
**Retention:** 168h (7 Tage)
**Schema:** v13 (tsdb)

### Labels (indiziert, fuer Stream-Selektion)

| Label | Werte | Verwendung |
|-------|-------|-----------|
| `compose_service` | `el-servador`, `el-frontend`, `mqtt-broker`, `postgres`, `loki` | Service-Filter |
| `level` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` | Level-Filter |
| `container` | Container-Name | Container-Filter |
| `compose_project` | `auto-one` | Projekt-Filter |

### Loki-Query-Vorlagen (Copy-Paste)

```bash
# Server-Logs der letzten 5 Minuten (curl)
curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"}' \
  --data-urlencode 'start='"$(date -d '-5 minutes' +%s000000000 2>/dev/null || date -v -5M +%s)000000000" \
  --data-urlencode 'end='"$(date +%s)000000000" \
  --data-urlencode 'limit=50' | jq '.data.result[].values[] | .[1]'

# Fehler-Logs aller Services
curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_project="auto-one", level="ERROR"}' \
  --data-urlencode 'start='"$(date -d '-5 minutes' +%s)000000000" \
  --data-urlencode 'end='"$(date +%s)000000000" \
  --data-urlencode 'limit=20' | jq '.data.result[].values[] | .[1]'

# MQTT-Broker-Logs
curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="mqtt-broker"}' \
  --data-urlencode 'start='"$(date -d '-5 minutes' +%s)000000000" \
  --data-urlencode 'end='"$(date +%s)000000000" \
  --data-urlencode 'limit=20' | jq '.'
```

**HINWEIS:** Loki ist im `monitoring`-Profil — bei `COMPOSE_PROFILES=monitoring` automatisch aktiv.
Wenn Loki nicht verfuegbar ist, alternativ Docker-Logs direkt:
```bash
docker logs automationone-server --tail 50
docker logs automationone-mqtt --tail 20
```

---

## 7. Server REST-API Vorlagen (Copy-Paste)

```bash
# Health-Check
curl -s http://localhost:8000/api/v1/health/live | jq

# Login (Token holen)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123#"}' | jq -r '.access_token')

# Alle ESPs anzeigen
curl -s http://localhost:8000/api/v1/esp/devices | jq '.data[] | {device_id, status, zone_id}'

# Pending ESPs anzeigen (Wokwi-ESP nach Registration)
curl -s http://localhost:8000/api/v1/esp/devices?status=pending | jq

# ESP genehmigen
curl -s -X POST "http://localhost:8000/api/v1/esp/devices/WOKWI-TEST-01/approve" | jq

# Sensor-Daten anzeigen
curl -s "http://localhost:8000/api/v1/sensors/WOKWI-TEST-01" | jq
```

---

## 8. Bestehende Reports

### T09 Reports (vorhanden)
- `.claude/reports/current/T09-verify/T09-verifikation-bericht-2026-03-08.md` — Vollstaendiger Verifikations-Bericht (11/12 Phasen PASS)
- `.claude/reports/current/T09-verify/auftrag-T09-fixA-frontend-multi-value-identifikation-2026-03-08.md`
- `.claude/reports/current/T09-verify/auftrag-T09-fixB-backend-api-absicherung-datenhygiene-2026-03-08.md`
- `.claude/reports/current/T09-verify/screenshots/` — Screenshot-Verzeichnis

### T10 Reports (neu erstellt)
- `.claude/reports/current/T10-wokwi-fullstack/T10-system-readiness-check.md` — dieser Report
- `.claude/reports/current/T10-wokwi-fullstack/screenshots/` — ERSTELLT (leer, bereit)

---

## 9. Blocker-Analyse

| # | Bereich | Status | Anmerkung |
|---|---------|--------|-----------|
| 1 | MQTT Anonymous | KEIN BLOCKER | `allow_anonymous true` aktiv |
| 2 | Wokwi Gateway | KEIN BLOCKER | `gateway = true` konfiguriert |
| 3 | Firmware-Build | PRUEFEN | Muss `wokwi_simulation` Environment exitieren in platformio.ini |
| 4 | Loki-Profil | KEIN BLOCKER | `.env` setzt `COMPOSE_PROFILES=monitoring` — Loki automatisch aktiv |
| 5 | Windows Firewall | PRUEFEN | Port 1883 muss fuer Wokwi-Gateway offen sein |
| 6 | WOKWI_CLI_TOKEN | OK | In .env vorhanden (`wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725`) |

### Zu pruefen vor T10-Start

```bash
# 1. platformio.ini auf wokwi_simulation Environment pruefen
grep -A 5 "wokwi_simulation" "El Trabajante/platformio.ini"

# 2. Docker-Stack Status
docker compose ps

# 3. MQTT erreichbar
mosquitto_sub -h localhost -p 1883 -t "test/#" -v -C 1 -W 5 || echo "MQTT nicht erreichbar"

# 4. Server Health
curl -s http://localhost:8000/api/v1/health/live | jq '.status'
```

---

## 10. Quick-Start fuer T10

```bash
# Schritt 1: Docker-Stack starten (falls nicht laufend)
cd "c:/Users/robin/Documents/PlatformIO/Projects/Auto-one"
docker compose up -d

# Schritt 2: Status pruefen
docker compose ps

# Schritt 3: Firmware bauen (wokwi_simulation)
cd "c:/Users/robin/Documents/PlatformIO/Projects/Auto-one/El Trabajante"
~/.platformio/penv/Scripts/pio.exe run -e wokwi_simulation

# Schritt 4: Wokwi starten
# (im El Trabajante Verzeichnis)
wokwi-cli --timeout 60000

# Schritt 5: MQTT beobachten (paralleles Terminal)
mosquitto_sub -h localhost -p 1883 -t "kaiser/#" -v -C 50 -W 120
```
