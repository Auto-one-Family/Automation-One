# Phase 2: Produktionstestfeld aufbauen — ⚠️ CODE FERTIG, DEPLOY OFFEN

> **Voraussetzung:** [Phase 0](./PHASE_0_ERROR_TAXONOMIE.md) ✅ abgeschlossen
> **Parallel zu:** [Phase 1](./PHASE_1_WOKWI_SIMULATION.md) ✅ abgeschlossen
> **Nachfolger:** [Phase 3](./PHASE_3_KI_ERROR_ANALYSE.md) (Sensordaten muessen fliessen), [Phase 4](./PHASE_4_INTEGRATION.md)
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 2"
> **Aktualisiert:** 2026-02-23 (Frontend-Implementierung verifiziert, Logging-Sektionen ergaenzt)

---

## Ziel

Echter ESP32 mit echten Sensoren. Vollstaendiger Docker-Stack mit Monitoring. Frontend-Luecken schliessen (Kalibrierungs-Wizard + Zeitreihen-View). End-to-End Datenpfad verifiziert: ESP32 → MQTT → Server → DB → Frontend.

---

## Schritt 2.1: Docker-Stack hochfahren und verifizieren — 🔲 DEPLOYMENT OFFEN

### Voraussetzungen pruefen

**Agent:** `system-control` (Ops-Modus)
**Skill:** `/system-control`

| Check | Erwartung | Kommando |
|-------|-----------|----------|
| Docker Desktop laeuft | Running | `docker info` |
| Kein lokaler Mosquitto | Kein Service auf Port 1883 | `docker compose ps mqtt-broker` |
| Ports frei | 1883, 5432, 8000, 5173, 3000, 9090, 3100 | `docker compose ps` |

### Stack-Start-Sequenz

```bash
# Schritt 1: Core-Stack (4 Services)
docker compose up -d

# Schritt 2: Warten auf Health-Checks
# Startup-Order (erzwungen durch Docker):
# postgres + mqtt-broker (parallel) → el-servador → el-frontend

# Schritt 3: Monitoring-Stack (7 Services)
docker compose --profile monitoring up -d

# Schritt 4: Health verifizieren
docker compose ps  # Alle 11+ Services "healthy" oder "running"
```

### Erwartete Services (13 total)

| Service | Port | Health-Check | Profil |
|---------|------|-------------|--------|
| postgres | 5432 | pg_isready | core |
| mqtt-broker | 1883, 9001 | mosquitto_pub | core |
| el-servador | 8000 | /health | core |
| el-frontend | 5173 | HTTP 200 | core |
| grafana | 3000 | /api/health | monitoring |
| prometheus | 9090 | /-/ready | monitoring |
| loki | 3100 | /ready | monitoring |
| promtail | 9080 | /ready | monitoring |
| cadvisor | 8080 | /healthz | monitoring |
| postgres-exporter | 9187 | /metrics | monitoring |
| mosquitto-exporter | 9234 | /metrics | monitoring |
| adminer | 8080 | HTTP 200 | devtools |
| serial-logger | - | - | hardware |

> **[VERIFY-PLAN] Service-Korrekturen:**
> - `adminer` existiert NICHT in docker-compose.yml (kein Devtools-Service definiert). Service muss hinzugefuegt werden oder aus Tabelle entfernt werden
> - `serial-logger` heisst im Compose `esp32-serial-logger`, Container: `automationone-esp32-serial`
> - `cadvisor` und `adminer` teilen Port 8080 → Konflikt wenn beide laufen. Adminer muesste anderen Port nutzen
> - MQTT-Broker Health-Check: Plan sagt `mosquitto_pub`, tatsaechlich: `mosquitto_sub -t $$SYS/#` (korrekt im Compose)
> - Promtail Port: Plan sagt 9080, tatsaechlich: Port 9080 nur intern (nicht published). Korrekt, aber Health-Check nur im Container

### Verifikation

```bash
# API erreichbar
curl -s http://localhost:8000/ | python -m json.tool

# Health-Check
curl -s http://localhost:8000/health

# Frontend erreichbar
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173

# Grafana erreichbar
curl -s -u admin:Admin123# http://localhost:3000/api/health

# Prometheus erreichbar
curl -s http://localhost:9090/-/ready
```

### Skill fuer Diagnose bei Problemen

**Skill:** `/auto-ops:ops-diagnose`
**Agent:** `auto-ops` (Operations-Rolle)

---

## Schritt 2.2: ESP32 flashen und konfigurieren — 🔲 HARDWARE OFFEN

### Hardware-Minimum

| Komponente | Minimum | Optional |
|-----------|---------|----------|
| ESP32 DevKit | 1 Stueck | Weitere fuer Skalierungstest |
| DS18B20 Temperatursensor | 1 Stueck (mit 4.7k Pull-Up) | DHT22, pH-Sensor |
| USB-Kabel | Data-faehig (nicht nur Ladekabel!) | - |
| WiFi-Netzwerk | ESP32 + Host im selben Netz | - |

### Firmware flashen

**Skill:** `/esp32-development`
**Agent:** `esp32-dev`

**ACHTUNG (aus MEMORY.md):** COM-Ports sind von Git Bash NICHT erreichbar. Upload und Monitor muessen ueber PowerShell oder PlatformIO IDE Terminal erfolgen.

```powershell
# In PowerShell (NICHT Git Bash):
cd "El Trabajante"

# Build
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev

# Flash (COM-Port anpassen)
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev -t upload

# Serial Monitor
~/.platformio/penv/Scripts/pio.exe device monitor -b 115200
```

### ESP32 konfigurieren via Provisioning Portal

**Quelle:** `El Trabajante/src/services/provisioning/provision_manager.h`

1. ESP32 startet in AP-Modus (kein WiFi in NVS)
2. SSID: `AutoOne-ESP_XXXXXXXX` (Chip-ID), Password: `provision`
3. Browser: `http://192.168.4.1`
4. Eingeben:
   - WiFi SSID: (lokales Netzwerk)
   - WiFi Password: (Netzwerk-Passwort)
   - MQTT Broker IP: (Host-IP, z.B. `192.168.1.100`)
5. Save → ESP32 rebootet und verbindet sich

### ESP32 im Server registrieren

**Zwei Optionen:**

**Option A: Automatisch via MQTT**
- ESP32 sendet Heartbeat → Server erstellt automatisch Device-Eintrag
- Vorteil: Zero-Config
- Nachteil: Device hat noch keine Zone/Konfiguration

**Option B: Manuell via API**
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123#"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# ESP registrieren (ESP-ID aus Serial-Monitor ablesen)
curl -s -X POST http://localhost:8000/api/v1/devices/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"esp_id":"ESP_XXXXXXXX","name":"Testfeld ESP32","location":"Gewaechshaus"}'
```

### Verifikation: E2E Datenpfad

```
ESP32 Serial → "MQTT connected" ✓
           → "Initial heartbeat sent" ✓
           → "Sensor data published" ✓

Server Logs → "Heartbeat received from ESP_XXXXXXXX" ✓
           → "Sensor data stored" ✓

Database   → sensor_data Tabelle hat neue Eintraege ✓

Frontend   → Dashboard zeigt ESP als "online" ✓
           → Live-Werte werden angezeigt ✓
```

**Agent:** `/auto-ops:ops-inspect-backend` (ESP → MQTT → Server → DB pruefen)

---

## Schritt 2.3: Frontend-Luecken schliessen — ⚠️ CODE FERTIG, SIDEBAR FEHLT

### Prioritaet 1: Kalibrierungs-Wizard — ✅ IMPLEMENTIERT

**Skill:** `/frontend-development`
**Agent:** `frontend-dev`

**Implementierungsstatus (verifiziert 2026-02-23):**

| Datei | Status | Pfad |
|-------|--------|------|
| CalibrationWizard.vue | ✅ Erstellt | `El Frontend/src/components/calibration/CalibrationWizard.vue` |
| CalibrationStep.vue | ✅ Erstellt | `El Frontend/src/components/calibration/CalibrationStep.vue` |
| calibration.ts (API) | ✅ Erstellt | `El Frontend/src/api/calibration.ts` |
| CalibrationView.vue | ✅ Erstellt | `El Frontend/src/views/CalibrationView.vue` |
| Route `/calibration` | ✅ In Router | `El Frontend/src/router/index.ts` |
| **Sidebar-Link** | **❌ FEHLT** | `El Frontend/src/shared/design/layout/Sidebar.vue` |

**Backend-Referenz (korrigiert):**
- Endpoint: `POST /api/v1/sensors/process/calibrate` (in `sensor_processing.py`)
- Logik: `base_processor.calibrate()` Methode der Sensor-Libraries
- DB: `sensor_repo.update_calibration()`

### Prioritaet 2: Historische Zeitreihen-View — ✅ IMPLEMENTIERT

**Skill:** `/frontend-development`
**Agent:** `frontend-dev`

**Implementierungsstatus (verifiziert 2026-02-23):**

| Datei | Status | Pfad |
|-------|--------|------|
| TimeRangeSelector.vue | ✅ Erstellt | `El Frontend/src/components/charts/TimeRangeSelector.vue` |
| SensorHistoryView.vue | ✅ Erstellt | `El Frontend/src/views/SensorHistoryView.vue` |
| Route `/sensor-history` | ✅ In Router | `El Frontend/src/router/index.ts` |
| **Sidebar-Link** | **❌ FEHLT** | `El Frontend/src/shared/design/layout/Sidebar.vue` |

**Bestehende Chart-Infrastruktur:**
- `GaugeChart.vue`, `LiveLineChart.vue`, `StatusBarChart.vue`, `MultiSensorChart.vue` (in `components/charts/`)
- Chart.js Dependencies: `chart.js ^4.5.0`, `chartjs-adapter-date-fns ^3.0.0`, `vue-chartjs ^5.3.2`, `chartjs-plugin-annotation`
- API: `GET /api/v1/sensors/data?esp_id=X&start_time=...&end_time=...`

### ❌ Verbleibende Frontend-Luecke: Sidebar-Navigation

Die Routes `/calibration` und `/sensor-history` existieren im Router, aber es fehlen die **Navigations-Links in der Sidebar**. Ohne diese sind die Views nur ueber direkte URL-Eingabe erreichbar.

**Fix noetig in:** `El Frontend/src/shared/design/layout/Sidebar.vue`
**Agent:** `frontend-dev`
**Aufwand:** ~5 Minuten

### Prioritaet 3 (spaeter): Analyse-Profile Dashboard

Nicht fuer ersten Testlauf noetig. Kann iterativ nachgezogen werden.

### Prioritaet 4 (spaeter): Admin/User-Management

JWT/RBAC funktioniert bereits. Admin-UI ist Nice-to-Have.

### Verifikation Frontend

```bash
# Frontend Build erfolgreich
cd "El Frontend" && npm run build

# Vitest Tests bestehen
cd "El Frontend" && npx vitest run

# Manuell im Browser pruefen
# http://localhost:5173 → Kalibrierung erreichbar
# http://localhost:5173 → Zeitreihen-View erreichbar
```

**Agent:** `/auto-ops:ops-inspect-frontend` (Browser → Vue → API → Server → DB pruefen)

---

## Schritt 2.4: Kritischer Pfad verifizieren — 🔲 OFFEN (nach Deploy)

### E2E Checkliste

| # | Anforderung | Test | Agent |
|---|-------------|------|-------|
| 1 | Sensordaten fliessen E2E | ESP Serial → DB check → Frontend check | `auto-ops` (backend-inspector) |
| 2 | Kalibrierung funktioniert | Swagger UI oder Wizard → DB pruefen | `server-debug` |
| 3 | Live-Daten im Frontend | WebSocket-Events → Dashboard-Update | `frontend-debug` |
| 4 | Logic Engine reagiert | Regel erstellen → Actuator schaltet | `server-debug` |
| 5 | Safety-System aktiv | Emergency-Stop via API → ESP reagiert | `mqtt-debug` |

### MCP-gestuetzte Diagnose

| Szenario | MCP-Server | Aktion |
|----------|-----------|--------|
| Sensor-Wert fehlt in DB | Database MCP | `SELECT * FROM sensor_data WHERE esp_id='X' ORDER BY timestamp DESC LIMIT 10` |
| Frontend zeigt falsche Daten | Playwright MCP | Navigate zu Dashboard, Screenshot |
| MQTT-Nachricht kommt nicht an | Docker MCP | Container-Logs, mosquitto_sub |
| Code-Impact pruefen | Serena MCP | `find_referencing_symbols` fuer geaenderte Funktion |

---

## Schritt 2.5: Chaos Engineering (nach Basis-Stabilitaet) — 🔲 OFFEN

### Voraussetzung

Schritt 2.1-2.4 muessen abgeschlossen sein. Der Stack laeuft stabil mit echtem ESP32 und Sensordaten.

### Chaos-Tests

| # | Fehlertyp | Docker-Befehl | Was wird getestet | Erwartetes Verhalten |
|---|-----------|---------------|-------------------|---------------------|
| 1 | Server Crash | `docker pause automationone-server` | Circuit Breaker | ESP32 buffert offline, Server recovered |
| 2 | DB Ausfall | `docker stop automationone-postgres` | Graceful Degradation | Server meldet "degraded", keine Crashes |
| 3 | MQTT Ausfall | `docker pause automationone-mqtt-broker` | Offline Buffer | ESP32 reconnected, buffered data resent |
| 4 | Netzwerk-Latenz | `docker exec el-servador tc qdisc add dev eth0 root netem delay 500ms` | MQTT QoS | Nachrichten kommen verzoegert aber an |

> **[VERIFY-PLAN] Chaos-Tests Container-Namen Korrektur:**
> - Chaos-Test 3: Container heisst `automationone-mqtt` (NICHT `automationone-mqtt-broker`)
> - Chaos-Test 4: `docker exec el-servador` → korrekt: `docker exec automationone-server`. Ausserdem: `tc` (iproute2) ist in Alpine-basierten Images NICHT installiert. `netem` braucht `NET_ADMIN` capability und `iproute2` Package
> - Chaos-Test 5: `docker update --memory` braucht `--memory-swap` und Kernel cgroup-Support
> - `docker pause` ist hook-blocked (enthaelt `docker` keyword). Workaround: User muss manuell ausfuehren
| 5 | RAM-Limit | `docker update --memory 128m automationone-server` | Memory Management | Server bleibt stabil oder graceful restart |

### Monitoring waehrend Chaos-Tests

| Was beobachten | Wo | Tool |
|----------------|-----|------|
| Grafana-Alerts feuern korrekt | http://localhost:3000/alerting | Browser |
| Prometheus-Metriken reagieren | http://localhost:9090/graph | PromQL |
| Loki-Logs zeigen Error-Codes | http://localhost:3000/explore | LogQL |
| ESP32 Serial zeigt Reconnect | PlatformIO Monitor | Serial |
| Frontend zeigt Degraded-Status | http://localhost:5173 | Browser |

### Agent/Skill

**Skill:** `/auto-ops:ops-diagnose` (waehrend und nach Chaos-Tests)
**Agent:** `auto-ops` (Operations-Rolle)

---

## Produktions-Logging fuer Testlauf (KRITISCH)

> Diese Sektion beschreibt wo jede Schicht loggt und wie Agents die Logs erreichen.
> **Ohne korrekte Log-Pfade sind Debug-Agents blind.**

### Schicht 1: ESP32 Serial-Logs (Echter ESP)

| Aspekt | Detail |
|--------|--------|
| **Quelle** | ESP32 Serial-Output ueber USB (115200 baud) |
| **Format** | Text: `[TIMESTAMP] [LEVEL] [COMPONENT] Message` |
| **Capture lokal** | `pio device monitor -b 115200 > logs/current/esp32_serial.log` (PowerShell!) |
| **Capture (kein tty)** | PlatformIO IDE Terminal oder PowerShell (Git Bash kann NICHT auf COM-Ports) |
| **Pfad** | `logs/current/esp32_serial.log` (manuell erstellt, KEIN Docker-Mount) |
| **Rotation** | Keine (manuelle Dateiverwaltung) |
| **Agent** | `esp32-debug` liest via Read-Tool |
| **Loki** | NUR ueber `esp32-serial-logger` Docker-Service (Profile: hardware) |

**ACHTUNG:** Der `esp32-serial-logger`-Service (Container: `automationone-esp32-serial`) muss den richtigen COM-Port konfiguriert haben UND das `hardware` Docker-Profil muss aktiv sein.

### Schicht 2: MQTT-Broker (Mosquitto)

| Aspekt | Detail |
|--------|--------|
| **Quelle** | Mosquitto Container stdout |
| **Format** | Text: `TIMESTAMP: <message>` (kein JSON) |
| **Docker-Log** | `docker compose logs mqtt-broker` oder `docker compose logs -f mqtt-broker` |
| **Datei-Log** | `logs/mqtt/mosquitto.log` (Bind-Mount: `./logs/mqtt/ → /mosquitto/log`) |
| **Loki-Label** | `{compose_service="mqtt-broker"}` |
| **Rotation** | Keine automatische Rotation (Mosquitto schreibt append-only) |
| **Agent** | `mqtt-debug` liest Docker-Logs oder Loki |
| **Live-MQTT-Traffic** | `make mqtt-sub` (= `mosquitto_sub -h localhost -t 'kaiser/#' -v`) |

**Tipp fuer Testlauf:** Vor Tests `docker compose logs mqtt-broker --since=5m` um relevanten Zeitfenster zu begrenzen.

### Schicht 3: Server (God-Kaiser FastAPI)

| Aspekt | Detail |
|--------|--------|
| **Quelle** | Python `logging` → RotatingFileHandler + StreamHandler |
| **Format** | JSON: `{"timestamp", "level", "logger", "message", "extra": {...}}` |
| **Datei-Log** | `logs/server/god_kaiser.log` (Bind-Mount: `./logs/server/ → /app/logs`) |
| **Docker-Log** | `docker compose logs el-servador` |
| **Loki-Label** | `{compose_service="el-servador"}` (Promtail extrahiert: level, logger) |
| **Rotation** | 10 MB × 10 Dateien (RotatingFileHandler) |
| **Metriken** | `GET /api/v1/health/metrics` (Prometheus-Format, 27 Metriken) |
| **Agent** | `server-debug` liest `logs/server/god_kaiser.log` via Read-Tool |

**Wichtige Logger-Namen:**
- `god_kaiser.mqtt.handler` — MQTT Handler-Verarbeitung (Sensor, Heartbeat, Error)
- `god_kaiser.services.logic_engine` — Logic Engine Regelauswertung
- `god_kaiser.api` — REST API Requests
- `god_kaiser.websocket` — WebSocket-Events und Broadcasts
- `god_kaiser.db` — Database-Operationen

### Schicht 4: PostgreSQL

| Aspekt | Detail |
|--------|--------|
| **Quelle** | PostgreSQL internes Logging |
| **Format** | Text: `YYYY-MM-DD HH:MM:SS.mmm UTC [PID] LOG/WARNING/ERROR: message` |
| **Datei-Log** | `logs/postgres/postgresql-YYYY-MM-DD.log` (Bind-Mount: `./logs/postgres/ → /var/log/postgresql`) |
| **Docker-Log** | `docker compose logs postgres` |
| **Loki-Label** | `{compose_service="postgres"}` |
| **Rotation** | Taeglich neue Datei + Groessenrotation bei 50 MB |
| **Agent** | `db-inspector` liest via Read-Tool oder `docker compose exec postgres psql` |

**Fuer Testlauf relevant:**
- Slow Queries (> 200ms) werden als WARNING geloggt
- Connection-Probleme bei Server-Restart sichtbar
- Schema-Migrationen via Alembic hinterlassen Logs

### Schicht 5: Frontend (Vue 3 / Vite)

| Aspekt | Detail |
|--------|--------|
| **Quelle** | Vite dev-server stdout (Container) + Browser-Console (Client) |
| **Format** | Text (Vite-Log + HMR-Events) |
| **Docker-Log** | `docker compose logs el-frontend` |
| **Loki-Label** | `{compose_service="el-frontend"}` |
| **Browser-Console** | NICHT direkt von Agents zugreifbar (Blind Spot!) |
| **Rotation** | Keine (Docker-Log-Rotation greift) |
| **Agent** | `frontend-debug` liest Docker-Logs via Bash |
| **MCP** | Playwright MCP kann Browser-Console ueber `browser_console_messages` abrufen |

**Blind Spot:** Browser-seitige JavaScript-Fehler, WebSocket-Verbindungsprobleme und Vue-Reaktivitaets-Issues sind NUR ueber Browser-Console sichtbar. Der User muss diese Informationen liefern ODER Playwright MCP wird genutzt.

### Schicht 6: Monitoring-Stack (Loki/Promtail/Prometheus/Grafana)

| Service | Log-Quelle | Loki-Label | Agent-Zugriff |
|---------|-----------|------------|---------------|
| Loki | `docker compose logs loki` | - | Bash |
| Promtail | `docker compose logs promtail` | - | Bash |
| Prometheus | `docker compose logs prometheus` | - | Bash |
| Grafana | `docker compose logs grafana` | - | Bash |

**Loki-Queries fuer Testlauf:**
```logql
# Alle Errors der letzten 5 Minuten (alle Services)
{compose_service=~".+"} |= "error" | json | level="ERROR"

# Server-Errors mit Error-Code
{compose_service="el-servador"} | json | message=~"Error Code.*"

# MQTT-Handler-Verarbeitung
{compose_service="el-servador"} | json | logger="god_kaiser.mqtt.handler"

# ESP32 Heartbeat-Events
{compose_service="el-servador"} | json | message=~"heartbeat.*"
```

### Agent-Log-Zugriffs-Matrix (Produktions-Testlauf)

| Agent | Primaere Log-Quelle | Sekundaere Quelle | Zugriffsmethode |
|-------|---------------------|-------------------|-----------------|
| `esp32-debug` | `logs/current/esp32_serial.log` | Docker: `esp32-serial-logger` | Read (Text) |
| `server-debug` | `logs/server/god_kaiser.log` | Loki: `{compose_service="el-servador"}` | Read (JSON, rotating 10MB×10) |
| `mqtt-debug` | Docker: `mqtt-broker` logs | Loki: `{compose_service="mqtt-broker"}` | Bash docker compose logs |
| `frontend-debug` | Docker: `el-frontend` logs | Playwright: browser_console_messages | Bash docker compose logs |
| `db-inspector` | `logs/postgres/postgresql-*.log` | Docker: `postgres` logs | Read (Text, daily rotation) |
| `test-log-analyst` | `logs/wokwi/reports/*.json` | `gh run view` (CI) | Read JSON |
| `meta-analyst` | `.claude/reports/current/*.md` | Cross-Report-Korrelation | Read all reports |
| `auto-ops` | Alle oben + Loki + Prometheus | MCP: Docker, Playwright | Full access |

### Voraussetzungen fuer vollstaendiges Produktions-Logging

- [ ] Core-Stack laeuft: `docker compose up -d` (4 Services)
- [ ] Monitoring-Profil aktiv: `docker compose --profile monitoring up -d` (7 Services)
- [ ] ESP32 Serial-Capture eingerichtet (PowerShell: `pio device monitor > logs/current/esp32_serial.log`)
- [ ] Hardware-Profil aktiv (optional): `docker compose --profile hardware up -d` (serial-logger)
- [ ] Log-Verzeichnisse existieren: `logs/server/`, `logs/mqtt/`, `logs/postgres/`, `logs/current/`
- [ ] Session-Script ausgefuehrt: `scripts/debug/start_session.sh` (erstellt `logs/current/` Symlinks)

---

## Akzeptanzkriterien Phase 2

| # | Kriterium | Verifikation | Status |
|---|-----------|-------------|--------|
| 1 | Docker-Stack 12/13+ healthy | `docker compose ps` zeigt alle healthy | 🔲 |
| 2 | ESP32 verbunden und sendet Daten | Serial: "MQTT connected" + "Sensor data published" | 🔲 |
| 3 | Sensordaten in DB | `SELECT count(*) FROM sensor_data` > 0 | 🔲 |
| 4 | Live-Daten im Frontend sichtbar | Dashboard zeigt aktuelle Werte | 🔲 |
| 5 | Kalibrierungs-Wizard funktioniert | `/calibration` Route erreichbar + Wizard laeuft | ✅ Code, ⚠️ Sidebar |
| 6 | Zeitreihen-View zeigt historische Daten | `/sensor-history` Route + Chart mit Verlauf | ✅ Code, ⚠️ Sidebar |
| 7 | Grafana-Alerts reagieren auf echte Daten | Mindestens 1 Alert korrekt gefeuert | 🔲 |
| 8 | Mindestens 1 Chaos-Test bestanden | Server recovered nach Crash | 🔲 |

---

## Uebergang zu Phase 3

Phase 2 liefert:
- Laufenden Stack mit echten Sensordaten
- Frontend mit Kalibrierung und Zeitreihen
- Basis-Stabilitaet verifiziert

Dies ist die **Voraussetzung fuer [Phase 3: KI-Error-Analyse](./PHASE_3_KI_ERROR_ANALYSE.md)**:
- Sensordaten muessen in der DB fliessen (fuer Isolation Forest)
- Grafana-Alerts muessen funktionieren (fuer Rule-based Analyse)
- Stack muss stabil sein (fuer dauerhaften Betrieb)

---

## Agents & Skills (Zusammenfassung)

| Schritt | Agent/Skill | Aufgabe |
|---------|-------------|---------|
| 2.1 | `system-control` / `/system-control` | Stack hochfahren, Health pruefen |
| 2.1 | `/auto-ops:ops-diagnose` | Bei Problemen: Cross-Layer-Diagnose |
| 2.2 | `esp32-dev` / `/esp32-development` | Firmware flashen, Serial pruefen |
| 2.2 | `/auto-ops:ops-inspect-backend` | E2E Datenpfad verifizieren |
| 2.3 | `frontend-dev` / `/frontend-development` | Kalibrierungs-Wizard + Zeitreihen-View |
| 2.3 | `/auto-ops:ops-inspect-frontend` | Frontend-Integration pruefen |
| 2.4 | `server-debug`, `mqtt-debug`, `frontend-debug` | Kritischer Pfad verifizieren |
| 2.5 | `/auto-ops:ops-diagnose` | Chaos-Test Monitoring |
| Ende | `/verify-plan` | Phase 2 gegen Codebase verifizieren |

---

## /verify-plan Ergebnis (Phase 2) — aktualisiert 2026-02-23

**Plan:** Docker-Stack, ESP32-Flashen, Frontend-Luecken, Chaos Engineering
**Geprueft:** 13 Services, 4 API-Endpoints, 5 Chaos-Tests, 6 Frontend-Dateien, 3 Agent-Referenzen
**Status:** ⚠️ **Code fertig, Deploy + Hardware offen**

### Bestaetigt
- Docker Core-Stack: 4 Services (postgres, mqtt-broker, el-servador, el-frontend) korrekt ✅
- Monitoring-Stack: 7 Services korrekt (loki, promtail, prometheus, grafana, cadvisor, postgres-exporter, mosquitto-exporter) ✅
- PlatformIO-Pfad und COM-Port-Warnung korrekt ✅
- Provisioning Portal korrekt (provision_manager.h, AP-Mode, 192.168.4.1) ✅
- Auth-Credentials korrekt (admin/Admin123#) ✅
- **CalibrationWizard.vue + CalibrationStep.vue + calibration.ts** erstellt ✅
- **CalibrationView.vue** als View erstellt, Route `/calibration` im Router ✅
- **SensorHistoryView.vue + TimeRangeSelector.vue** erstellt ✅
- Route `/sensor-history` im Router ✅
- Chart.js Dependencies + 4 bestehende Chart-Komponenten ✅
- Sensor-Data API existiert (`GET /api/v1/sensors/data`) ✅
- Agent-Referenzen (system-control, esp32-dev, frontend-dev, auto-ops) korrekt ✅
- Phase 0 Grafana-Alerts (26 Regeln) implementiert ✅
- Phase 0 Handler-Integration (12 Metriken) implementiert ✅

### Korrekturen (Status)

**Erledigt (im Plan korrigiert):**
- ~~calibration_service.py → sensor_processing.py~~ ✅ in verify-plan Notiz
- ~~Sensor-Data API Pfad korrigiert~~ ✅ in verify-plan Notiz
- ~~Error-Codes in Chaos-Tests Container-Namen~~ ✅ in verify-plan Notiz

**Noch offen:**
- `adminer` existiert NICHT in docker-compose.yml → aus Tabelle als "nicht definiert" markiert
- Sidebar-Links fuer `/calibration` und `/sensor-history` fehlen in `Sidebar.vue`
- Chaos-Test 4: `tc/netem` nicht in Alpine-Images installiert
- `docker pause` hook-blocked → User muss manuell ausfuehren

### Verbleibende Vorbedingungen
- [x] Phase 0 abgeschlossen (Grafana-Alerts + Metriken + Handler) ✅
- [ ] Sidebar-Links hinzufuegen (frontend-dev, ~5 Min)
- [ ] Docker-Stack deployen und Health verifizieren
- [ ] ESP32-Hardware verfuegbar und im selben Netzwerk
- [ ] Serial-Capture einrichten (PowerShell, NICHT Git Bash)
- [ ] E2E Datenpfad verifizieren (ESP → MQTT → Server → DB → Frontend)

### Zusammenfassung
Der **gesamte Code fuer Phase 2 ist fertig** — Kalibrierungs-Wizard, Zeitreihen-View, Routes, 26 Grafana-Alerts, 27 Prometheus-Metriken, Handler-Integration. Verbleibend sind **operationale Schritte**: Sidebar-Links ergaenzen, Stack deployen, ESP32 flashen, E2E-Pfad verifizieren. Chaos-Tests kommen nach stabiler Basis.
