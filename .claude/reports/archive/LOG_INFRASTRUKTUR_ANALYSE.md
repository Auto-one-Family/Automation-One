# Log-Infrastruktur Analyse

**Erstellt:** 2026-02-06
**Status:** IST-Analyse abgeschlossen
**Scope:** session.sh + alle Log-Quellen (ESP32, Server, MQTT, DB, Frontend, Docker)

---

## session.sh IST-Zustand

### Übersicht

**Script:** `scripts/debug/start_session.sh` (1095 Zeilen, Version 4.0)
**Zweck:** Initialisiert Debug-Session mit MQTT-Capture, Server-Start, STATUS.md-Generierung
**Plattform:** Windows (Git Bash/MSYS/WSL), Linux, macOS

### Zeile-für-Zeile Dokumentation

| Zeilen | Funktion | Details |
|--------|----------|---------|
| 1-24 | Header | Shebang, Version 4.0, SYSTEM_MANAGER Integration |
| 25 | Error-Handling | `set -e` - Script bricht bei Fehler ab |
| 30-48 | Initialisierung | PROJECT_ROOT, LOGS_DIR, REPORTS_DIR, OS-Erkennung |
| 53-111 | Argumente | `[session-name]`, `--with-server`, `--mode [boot\|config\|sensor\|actuator\|e2e]` |
| 126-134 | **KRITISCH** | `rm -f "$LOGS_DIR"/*.log` - Löscht Logs OHNE Archivierung! |
| 135-151 | Cleanup | `rm -f "$REPORTS_DIR"/*.md` - Löscht alte Reports |
| 156-181 | MQTT-Check | Port 1883 prüfen (netstat), bricht ab wenn nicht verfügbar |
| 193-241 | Poetry-Suche | 5 Fallback-Pfade für Poetry (PATH, AppData, LocalAppData, ~/.local/bin, UserProfile) |
| 242-340 | Server-Start | `poetry run uvicorn` im Hintergrund, 30s Polling auf Port 8000 |
| 341-361 | Health-Check | curl auf `http://localhost:8000/health` |
| 367-382 | Log-Symlink | `ln -sf` zu god_kaiser.log, Fallback auf `cp` für Windows |
| 388-425 | MQTT-Capture | `mosquitto_sub -t "kaiser/#" -v > mqtt_traffic.log &` |
| 428-540 | STATUS.md Basis | Session-Info, Git-Status, Docker-Status, Hardware-Tabelle |
| 541-628 | Test-Patterns | **Hardcoded Code-Locations** (z.B. `wifi_manager.cpp:149`) |
| 629-926 | E2E-Patterns | Sensor-Config, Actuator-Config, Commands (nur bei `--mode e2e`) |
| 968-983 | Session-Info | Speichert Variablen in `.session_info` für stop_session.sh |
| 988-1022 | COM-Port | Erkennt ESP32 COM-Port, nutzt ihn aber nicht als Default |
| 1023-1070 | ESP32-Kommandos | Gibt 4 Optionen aus (Wokwi, Flash+Monitor, Monitor-only, Reset) |

### Docker-Integration

**session.sh ist für "native" Development konzipiert (Poetry, nicht Docker):**

- Führt **KEINE** `docker compose up/down` aus
- Prüft nur `docker compose ps` für STATUS.md-Output
- Startet Server via `poetry run uvicorn`, nicht via Docker
- MQTT-Capture via native `mosquitto_sub`, nicht via Docker

### Konflikte mit Docker-Flow

| Konflikt | session.sh | docker-compose.yml | Problem |
|----------|-----------|-------------------|---------|
| Health-Check Endpoint | `/health` | `/api/v1/health/live` | Unterschiedliche Endpoints |
| Health-Check Warten | 30s Polling-Loop | `start_period: 30s` + `condition: service_healthy` | Ignoriert Docker-Orchestrierung |
| Server-Start | Poetry direkt | Container mit depends_on | Parallele Deployment-Strategien |
| MQTT-Traffic | Native mosquitto_sub | `make mqtt-sub` in Container | Mögliche Race Condition |
| DB-Migration | **FEHLT** | `make db-migrate` | Server kann mit veraltetem Schema starten |

### Konflikte mit Makefile

| Target | Makefile | session.sh | Überlappung |
|--------|----------|-----------|-------------|
| `make up` | `docker compose up -d` | Startet Server via Poetry | Unterschiedliche Deployment-Methoden |
| `make logs-server` | `docker logs el-servador` | Liest Host-Datei | Unterschiedliche Log-Quellen |
| `make mqtt-sub` | `mosquitto_sub` in Docker | Native mosquitto_sub | Beide können gleichzeitig laufen |
| `make health` | curl `/api/v1/health/live` | curl `/health` | Unterschiedliche Endpoints |

---

## Log-Locations Matrix

### ESP32 (El Trabajante)

| Log-Typ | IST-Pfad (Host) | IST-Pfad (Container) | Format | Rotation | Lücke |
|---------|-----------------|---------------------|--------|----------|-------|
| Serial Output | `logs/current/esp32_serial.log` | N/A | Plain text `[timestamp] [LEVEL] message` | NEIN | Wächst unbegrenzt |
| Crash Dumps | Nicht persistent | N/A | Stack trace | NEIN | Verloren bei Reboot |

**Capture-Methode:**
```bash
# Wokwi Simulation
wokwi-cli . --timeout 300000 --serial-log-file ../logs/current/esp32_serial.log

# Echte Hardware
pio device monitor --port COM3 --baud 115200 2>&1 | tee logs/current/esp32_serial.log
```

**PlatformIO-Konfiguration:** `El Trabajante/platformio.ini`
- Monitor-Speed: 115200
- Filter: `esp32_exception_decoder`, `time`, `log2file`, `default`

**Fehlend:**
- Remote-Log-Upload zu Server (keine MQTT-Topic für Logs)
- Zentrale Sammlung für mehrere ESP32s
- Log-Rotation (Datei wächst unbegrenzt)
- Automatischer Capture-Start

### Server (El Servador)

| Log-Typ | IST-Pfad (Host) | IST-Pfad (Container) | Format | Rotation | Lücke |
|---------|-----------------|---------------------|--------|----------|-------|
| god_kaiser.log | `El Servador/god_kaiser_server/logs/god_kaiser.log` | `/app/logs/god_kaiser.log` | JSON | 10MB, 100 Backups | Keine Cleanup-Policy |
| Console | `logs/current/server_console.log` | stdout | Text | NEIN | Nur bei `--with-server` |
| Request Logs | In god_kaiser.log integriert | In god_kaiser.log | JSON | 10MB | Request-ID Filter aktiv |

**Konfiguration:** `src/core/logging_config.py`
```python
# Log-Format
{
    "timestamp": "YYYY-MM-DD HH:MM:SS",
    "level": "INFO",
    "logger": "mqtt.handlers.heartbeat_handler",
    "message": "New ESP discovered",
    "module": "heartbeat_handler",
    "function": "process_message",
    "line": 250,
    "request_id": "req-abc123"
}

# Rotation
max_bytes = 10485760  # 10 MB
backup_count = 100
```

**Fehlend:**
- Automatische Cleanup alter Backups (100 x 10MB = 1GB möglich)
- Separate Audit-Logs für kritische Operationen

### MQTT (Mosquitto)

| Log-Typ | IST-Pfad (Host) | IST-Pfad (Container) | Format | Rotation | Lücke |
|---------|-----------------|---------------------|--------|----------|-------|
| mosquitto.log | Named Volume (verborgen) | `/mosquitto/log/mosquitto.log` | Plain `2026-02-06T12:34:56 message` | NEIN | **Host-Zugriff fehlt** |
| Traffic Capture | `logs/current/mqtt_traffic.log` | N/A | `topic payload` | NEIN | **Kein Timestamp, kein QoS** |
| Connection Events | In mosquitto.log | In mosquitto.log | Plain | NEIN | Nicht separat filterbar |

**Konfiguration:** `docker/mosquitto/mosquitto.conf`
```
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
connection_messages true
```

**Fehlend:**
- Bind-Mount statt Named Volume (für Host-Zugriff)
- Log-Rotation (Datei wächst unbegrenzt)
- Traffic-Capture mit Timestamps und QoS

### PostgreSQL

| Log-Typ | IST-Pfad (Host) | IST-Pfad (Container) | Format | Rotation | Lücke |
|---------|-----------------|---------------------|--------|----------|-------|
| Query-Logs | **NICHT KONFIGURIERT** | - | - | - | **KOMPLETT FEHLEND** |
| Slow-Query | **NICHT KONFIGURIERT** | - | - | - | **KOMPLETT FEHLEND** |
| Error-Logs | Nur Docker stdout | - | - | - | Nicht persistent |
| Connection-Logs | Nur Docker stdout | - | - | - | Nicht persistent |

**docker-compose.yml:**
```yaml
postgres:
  image: postgres:16-alpine
  volumes:
    - postgres_data:/var/lib/postgresql/data
  # KEINE Log-Konfiguration!
```

**KRITISCHE LÜCKE:** PostgreSQL-Logging ist vollständig deaktiviert!
- Keine SQL-Query-Logs
- Keine Slow-Query-Detection
- Keine Audit-Logs für DB-Operationen
- Nur Crash-Logs über Container-stdout

### Frontend (El Frontend)

| Log-Typ | IST-Pfad (Host) | IST-Pfad (Container) | Format | Rotation | Lücke |
|---------|-----------------|---------------------|--------|----------|-------|
| Vite Dev-Server | stdout | stdout | Plain | - | Nicht persistent |
| Build-Errors | stdout/stderr | stdout/stderr | Plain | - | Nicht persistent |
| Browser Console | **NICHT ERFASST** | - | - | - | **KOMPLETT FEHLEND** |
| Runtime-Errors | **NICHT ERFASST** | - | - | - | **Kein Error-Tracking** |
| WebSocket Events | **NICHT ERFASST** | - | - | - | Keine Persistierung |

**Vorhandene Error-Handling-Infrastruktur:**
- `src/api/errors.ts` - API Error-Klassen
- `src/composables/useToast.ts` - Toast-Notifications
- `src/components/error/ErrorDetailsModal.vue` - Error-UI
- `src/components/error/TroubleshootingPanel.vue` - Troubleshooting

**Fehlend:**
- Globaler Vue Error-Handler (`app.config.errorHandler`)
- Browser-Console-Capture zu Server
- Client-seitiges Error-Tracking (Sentry, etc.)
- Build-Error-Persistierung

### Docker

| Aspekt | IST-Status | Details |
|--------|------------|---------|
| Log-Driver | Default (json-file) | Nicht explizit konfiguriert |
| Log-Rotation | Docker-Default | max-size: 10m, max-file: 3 (Container-Level) |
| docker compose logs | Verfügbar | `make logs`, `make logs-server`, `make logs-mqtt` |
| Named Volumes | 3 Volumes | postgres_data, mosquitto_data, mosquitto_log |

---

## Fehlende Log-Quellen

### KRITISCH

1. **PostgreSQL Query-Logging**
   - Keine SQL-Statements geloggt
   - Keine Slow-Query-Detection
   - Kein Audit-Trail für DB-Operationen
   - **Impact:** Debugging von DB-Problemen unmöglich

2. **Frontend Browser-Console**
   - Client-seitige JavaScript-Errors werden nicht erfasst
   - Keine Korrelation zu Server-Requests
   - **Impact:** Frontend-Bugs bleiben unentdeckt

### WICHTIG

3. **Mosquitto-Logs Host-Zugriff**
   - Logs in Named Volume (verborgen)
   - Nur via `docker exec` oder `docker logs` lesbar
   - **Impact:** Debug-Agents können nicht direkt lesen

4. **MQTT-Traffic Timestamps**
   - Aktuelles Format: `topic payload`
   - Kein Zeitstempel, keine QoS-Info
   - **Impact:** Timing-Analyse von MQTT-Flows nicht möglich

### NICE-TO-HAVE

5. **WebSocket Events**
   - Frontend↔Server WebSocket-Kommunikation nicht geloggt
   - **Impact:** Real-time Debugging erschwert

6. **ESP32 Remote-Logs**
   - Keine Persistierung von ESP32-Logs auf Server
   - **Impact:** Logs verloren bei Hardware-Disconnect

---

## SOLL-Empfehlungen

### Priorität 1 (MUSS)

| # | Empfehlung | Aufwand | Impact |
|---|------------|---------|--------|
| 1 | **session.sh: Archivierung VOR Löschen** | Gering | Verhindert Datenverlust |
| 2 | **PostgreSQL-Logging aktivieren** | Mittel | Ermöglicht DB-Debugging |
| 3 | **session.sh: DB-Migration vor Server-Start** | Gering | Verhindert Schema-Mismatch |

**PostgreSQL-Logging Implementierung:**
```yaml
# docker-compose.yml
postgres:
  environment:
    POSTGRES_INITDB_ARGS: >
      -c log_statement=all
      -c log_duration=on
      -c log_min_duration_statement=100
  volumes:
    - ./logs/postgres:/var/log/postgresql
```

### Priorität 2 (SOLLTE)

| # | Empfehlung | Aufwand | Impact |
|---|------------|---------|--------|
| 4 | **Mosquitto-Logs als Bind-Mount** | Gering | Host-Zugriff für Debug-Skills |
| 5 | **MQTT-Capture mit Timestamps** | Gering | Timing-Analyse möglich |
| 6 | **Frontend Global Error-Handler** | Mittel | Client-Errors erfasst |

**MQTT-Capture Verbesserung:**
```bash
# Aktuell
mosquitto_sub -t "kaiser/#" -v > mqtt_traffic.log

# SOLL
mosquitto_sub -t "kaiser/#" -v | while read line; do
  echo "[$(date -Iseconds)] $line"
done > mqtt_traffic.log
```

### Priorität 3 (KÖNNTE)

| # | Empfehlung | Aufwand | Impact |
|---|------------|---------|--------|
| 7 | **ESP32-COM-Port als Default nutzen** | Gering | Weniger manuelle Eingabe |
| 8 | **Einheitliches JSON-Format** | Hoch | Bessere Log-Aggregation |
| 9 | **Zentrale Log-Aggregation** | Hoch | Korrelierte Analyse |

---

## Debug-Skills Log-Pfade

Die Skills müssen diese Pfade kennen:

```
logs/current/
├── STATUS.md              → Alle Skills (Session-Kontext)
├── esp32_serial.log       → esp32-debug
├── god_kaiser.log         → server-debug
├── mqtt_traffic.log       → mqtt-debug
├── server_console.log     → server-debug (optional)
└── frontend_errors.log    → frontend-debug (FEHLT!)

logs/archive/
└── {TIMESTAMP}_{session_name}/
    └── (Archivierte Session-Logs)

El Servador/god_kaiser_server/logs/
├── god_kaiser.log         → Primärer Server-Log
└── god_kaiser.log.{1-100} → Rotation-Backups
```

**Fehlende Log-Quelle für frontend-debug:**
- Aktuell kein `frontend_errors.log`
- Skills-Referenz muss aktualisiert werden nach Implementierung

---

## Zusammenfassung

| Bereich | IST-Status | Handlungsbedarf |
|---------|------------|-----------------|
| ESP32 | Funktional, aber manuell | Remote-Upload NICE-TO-HAVE |
| Server | Gut konfiguriert (JSON, Rotation) | Backup-Cleanup SOLLTE |
| MQTT-Broker | Logs in Named Volume | Bind-Mount SOLLTE |
| MQTT-Traffic | Capture ohne Timestamps | Format verbessern SOLLTE |
| PostgreSQL | **KOMPLETT FEHLEND** | Aktivieren **MUSS** |
| Frontend | **KOMPLETT FEHLEND** | Error-Handler **SOLLTE** |
| session.sh | Löscht ohne Archivierung | Archivierung **MUSS** |
| Docker | Standard-Konfiguration | Ausreichend |

---

*Report erstellt für Technical Manager Entscheidung. Implementierung erfordert separaten Dev-Flow.*
