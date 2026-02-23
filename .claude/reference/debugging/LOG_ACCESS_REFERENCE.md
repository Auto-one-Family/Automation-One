# Log-Zugriff -- Agent-Referenz

> **Version:** 2.0 | **Stand:** 2026-02-23
> **Zweck:** Zentrale Referenz fuer Log-Dateien, Prioritaeten und Erstellung
> **Verknuepfung:** [LOG_LOCATIONS.md](LOG_LOCATIONS.md) fuer Pfade und Capture-Methoden

---

## 1. Agent -> Log-Hierarchie (Prioritaet beim Lesen)

| Agent | Primaer (immer verfuegbar) | Session-Logs (nach start_session.sh) | Fallback |
|-------|---------------------------|--------------------------------------|----------|
| server-debug | `logs/server/god_kaiser.log` (JSON, 10MB x 10 Rotation) | `logs/current/god_kaiser.log` (Symlink) | `docker compose logs --tail=100 el-servador` |
| mqtt-debug | `docker compose logs --tail=100 mqtt-broker` | `logs/current/mqtt_traffic.log` (Payload-Capture) | Loki `{compose_service="mqtt-broker"}` |
| frontend-debug | `docker compose logs --tail=100 el-frontend` | - | Loki `{compose_service="el-frontend"}`, Playwright MCP `browser_console_messages` |
| esp32-debug | `logs/current/esp32_serial.log` (manuell durch User) | Same | `logs/wokwi/serial/` (Makefile-Tests) |
| db-inspector | `logs/postgres/postgresql-YYYY-MM-DD.log` | - | `docker compose logs --tail=50 postgres` |
| test-log-analyst | `logs/backend/`, `logs/frontend/`, `logs/wokwi/reports/` | - | CI: `gh run view --log`, Artifacts |

**Regeln:**
- Debug-Agents haben Terminal (Bash) fuer `docker compose logs` und `curl`
- `logs/server/god_kaiser.log` existiert IMMER wenn Server jemals lief (persistentes Bind-Mount)
- `logs/current/` Dateien existieren NUR nach `scripts/debug/start_session.sh`
- ESP32 Serial-Log erfordert MANUELLE User-Aktion (Wokwi `--serial-log-file` oder PIO Monitor Redirect)

---

## 2. Wer erstellt welche Dateien

| Quelle | Erstellt von | Zeitpunkt | Anmerkung |
|--------|--------------|-----------|-----------|
| `logs/server/god_kaiser.log` | Server (RotatingFileHandler) | Automatisch | JSON-Format, 10MB x 10 Rotation |
| `logs/postgres/postgresql-YYYY-MM-DD.log` | PostgreSQL (logging_collector) | Automatisch | Daily Rotation, UTC |
| `logs/current/mqtt_traffic.log` | `start_session.sh` | Session-Start | mosquitto_sub Capture mit Timestamps |
| `logs/current/god_kaiser.log` | `start_session.sh` (Symlink) | Session-Start | Zeigt auf `logs/server/god_kaiser.log` |
| `logs/current/esp32_serial.log` | User (manuell) | Waehrend Test | Wokwi: `--serial-log-file`, PIO: `> file 2>&1` |
| `logs/current/STATUS.md` | `start_session.sh` | Session-Start | Agent-Kontext, Docker-Status |
| `logs/wokwi/serial/*.log` | Makefile wokwi-test-* | CI/lokale Tests | Automatisch bei Wokwi-Szenarien |

> **ACHTUNG:** Die frueheren Eintraege zu `server_loki_errors.log`, `mqtt_broker_loki.log`, `frontend_loki.log` und `frontend_container.log` waren FALSCH. `start_session.sh` erzeugt diese Dateien NICHT. Loki-Exports muessen manuell via `curl` abgerufen werden.

---

## 3. Loki / Docker Logs Verfuegbarkeit

| Quelle | Wann verfuegbar | Agent-Zugriff |
|--------|-----------------|---------------|
| Loki (`localhost:3100`) | Nur bei `docker compose --profile monitoring up` | `curl` in Bash Tool |
| `docker compose logs <service>` | Immer wenn Container laeuft/lief | Bash Tool (IMMER mit `--tail=N`) |
| Browser Console | Nur bei laufendem Frontend | Playwright MCP `browser_console_messages` (NUR Hauptkontext) |

### Loki-Labels (verifiziert)

| Label | Werte |
|-------|-------|
| `compose_service` | `el-servador`, `mqtt-broker`, `el-frontend`, `postgres`, `loki`, `promtail`, `prometheus`, `grafana`, `esp32-serial-logger` |
| `level` | Server: `INFO`/`WARNING`/`ERROR`/`DEBUG`/`CRITICAL`. Frontend: `info`/`warn`/`error`/`debug` (nach Logger-Update). ESP32: `info`/`warning`/`error`/`debug` |
| `logger` | Server only: Python module path (z.B. `src.mqtt.handlers.sensor_handler`) |
| `component` | Frontend: Vue component name. ESP32: `mqtt`/`sensor`/`logger`/`wifi`/`app` |

### Loki-Queries fuer Agents

```bash
# Server Errors (letzte Stunde)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador",level="ERROR"}' \
  --data-urlencode 'limit=50'

# MQTT Broker Events
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="mqtt-broker"}' \
  --data-urlencode 'limit=50'

# Frontend Errors
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-frontend",level="error"}' \
  --data-urlencode 'limit=50'

# ESP32 Serial (nur bei Hardware-Profil + ser2net Bridge)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="esp32-serial-logger"}' \
  --data-urlencode 'limit=50'
```

---

## 4. ESP32 Serial-Capture Workflow

ESP32 Serial-Logging ist der einzige Log-Pfad der MANUELLE User-Aktion erfordert:

### Wokwi (Simulation)
```bash
cd "El Trabajante"
wokwi-cli . --timeout 90000 --serial-log-file "logs/current/esp32_serial.log"
```

### Hardware (Echter ESP32)
```bash
# PowerShell (EMPFOHLEN fuer COM-Port)
pio device monitor --baud 115200 2>&1 | Tee-Object -FilePath "logs/current/esp32_serial.log"

# Git Bash (falls COM-Port erreichbar)
pio device monitor --baud 115200 > logs/current/esp32_serial.log 2>&1
```

### Docker Hardware-Profil (ser2net Bridge)
```bash
# Voraussetzung: ser2net auf Host laeuft und COM-Port auf TCP:3333 bridged
docker compose --profile hardware up esp32-serial-logger
# → Logs via Promtail → Loki: {compose_service="esp32-serial-logger"}
```

---

## 5. Verweis

- **Pfad-Details:** [LOG_LOCATIONS.md](LOG_LOCATIONS.md)
- **Flow-Kontext:** [flow_reference.md](../testing/flow_reference.md) F1.2-F1.4
- **Session-Script:** `scripts/debug/start_session.sh`
- **Analyse-Report:** `.claude/reports/current/LOGGING_INFRASTRUCTURE_ANALYSIS.md`
