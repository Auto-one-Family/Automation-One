# SESSION_BRIEFING: 2026-02-06

**Erstellt:** 2026-02-06T[aktuell]
**Zielgruppe:** Technical Manager
**Zweck:** Vollständige System-Übersicht für Session-Orchestrierung

---

## 1. PROJEKT-GRUNDLAGEN

### Architektur-Prinzip: Server-Zentrisch

```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
```

| Komponente | Verantwortung |
|------------|---------------|
| **ESP32 (El Trabajante)** | RAW-Daten senden, Befehle empfangen, GPIO steuern |
| **Server (El Servador)** | ALLE Intelligenz, Validierung, Business-Logic, Persistenz |
| **Frontend (El Frontend)** | Visualisierung, User-Interaktion |

**NIEMALS** Business-Logic auf ESP32 implementieren!

### Konventionen

| Komponente | Namenskonvention | Beispiel |
|------------|------------------|----------|
| ESP32 C++ | snake_case | `sensor_manager.h` |
| Python | snake_case | `sensor_handler.py` |
| Vue/TS | camelCase | `handleSensorData()` |
| Error-Codes | Ranges | ESP32: 1000-4999, Server: 5000-5999 |

---

## 2. AKTUELLER SYSTEM-STATUS

### Infrastruktur

| Komponente | Status | Details |
|------------|--------|---------|
| Git Branch | `feature/docs-cleanup` | ~70 uncommitted changes (Refactoring-Session) |
| Docker Stack | **ALL HEALTHY** | 8 Container, Up 42+ Minuten |
| Server | **Running** | Port 8000 (automationone-server) |
| MQTT-Broker | **Running** | Port 1883, 9001 (automationone-mqtt) |
| PostgreSQL | **Running** | Port 5432 (automationone-postgres) |
| Frontend | **Running** | Port 5173 (automationone-frontend) |
| Grafana | **Running** | Port 3000 (Monitoring) |
| Loki | **Running** | Port 3100 (Log-Aggregation) |
| Prometheus | **Running** | Port 9090 (Metriken) |

### Docker Container Details

```
automationone-frontend     Up (healthy)   :5173
automationone-grafana      Up (healthy)   :3000
automationone-loki         Up (healthy)   :3100
automationone-mqtt         Up (healthy)   :1883, :9001
automationone-postgres     Up (healthy)   :5432
automationone-prometheus   Up (healthy)   :9090
automationone-promtail     Up             (Log-Shipping)
automationone-server       Up (healthy)   :8000
```

### Letzte Git-Aktivität

| Commit | Message |
|--------|---------|
| 3f77818 | docs: add security reference and Docker rules |
| 0807fb6 | chore(reports): archive old debug session reports |
| fbf18ce | refactor(debug): overhaul session startup script |
| f0b8c89 | docs: update agent routing and reference documentation |
| 9cfac83 | feat(logging): improve error handling and log management |

### Bekannte Bugs

| Bug | Beschreibung |
|-----|--------------|
| #1 | ESP-Webportal nicht mehr erreichbar nach falscher IP-Konfiguration (WiFi korrekt, MQTT/IP falsch). ESP registriert sich beim Server, aber Webportal-Zugang verloren. |

### Aktuelle Reports

Keine Reports im current-Ordner vorhanden (frische Session).

---

## 3. SESSION-KONTEXT

### Hardware-Konfiguration

| GPIO | Komponente | Typ | Interface |
|------|------------|-----|-----------|
| 21 | SDA | I2C Data | I2C |
| 22 | SCL | I2C Clock | I2C |

**I2C-Bus:** Standard-Pins (GPIO 21/22)
**Mögliche I2C-Sensoren:** SHT31 (0x44/0x45), BMP280/BME280 (0x76/0x77)

### System-Zustand

| Aspekt | Status |
|--------|--------|
| NVS (ESP32) | **NICHT gelöscht** - ESP hat gespeicherte Konfiguration |
| Datenbank | **Voll** - Daten aus vorherigen Sessions vorhanden |
| ESP-Registrierung | Vermutlich bereits registriert (NVS intact) |

### Implikationen

- ESP32 wird beim Boot seine gespeicherte Konfiguration laden
- Server hat bereits Device-Einträge, Sensor-Configs, historische Daten
- Keine "Clean State" Session - Aufbau auf bestehendem Zustand

---

## 4. AGENT-KOMPENDIUM

### 4.1 System-Operators

#### system-control

**Domäne:** System-Operationen, Befehlsketten ausführen

**Zweck:** Führt Operationen im echten System aus um Test-Sessions zu starten. Generiert durch seine Aktionen die Log-Daten die Debug-Agents später analysieren.

**Spezielle Rolle im Workflow:**
- Wird als ERSTER Agent nach diesem Briefing aktiviert
- Führt Befehlsketten aus (ESP verbinden, Server-Kommunikation, etc.)
- Erstellt am Ende einen **Operations-Bericht**: Wann wurde was ausgeführt
- Dieser Bericht ist Grundlage für Debug-Agents und Technical Manager

**Aktivieren wenn:**
- Test-Session gestartet werden soll
- System-Operationen ausgeführt werden müssen
- MQTT-Traffic beobachtet werden soll
- API-Calls ausgeführt werden sollen
- ESP-Registrierung/Konfiguration durchgeführt werden soll

**Benötigte Inputs:**
- Welche Operationen ausführen
- Erwartetes Ergebnis
- Reihenfolge der Befehle

**Output:** `.claude/reports/current/SYSTEM_CONTROL_REPORT.md`

**NICHT aktivieren für:** Log-Analyse (→ Debug-Agents), Code-Änderungen (→ Dev-Agents)

---

#### db-inspector

**Domäne:** Database Queries, Schema-Analyse, Data Cleanup

**Zweck:** Prüft Datenbank-Zustand, führt Queries aus, findet Orphaned Records, bereinigt Test-Daten

**Aktivieren wenn:**
- Device-Registrierung prüfen (esp_devices Tabelle)
- Sensor-Daten verifizieren (sensor_data, sensor_configs)
- Actuator-Zustände prüfen (actuator_states, actuator_history)
- Schema-Probleme untersuchen
- Cleanup von Mock-ESPs oder Test-Daten
- Audit-Logs analysieren

**Benötigte Inputs:**
- Was geprüft werden soll
- Spezifische Tabellen/Device-IDs (falls bekannt)
- Ob Cleanup gewünscht (DELETE-Operationen)

**Wichtige Tabellen:**
- `esp_devices` - Registrierte ESPs mit Status
- `sensor_configs` / `sensor_data` - Sensor-Konfiguration und Messwerte
- `actuator_configs` / `actuator_states` - Aktor-Konfiguration und Zustände
- `esp_heartbeat_logs` - Heartbeat-Historie
- `audit_logs` - System-Audit-Trail

**Output:** Query-Ergebnisse, Schema-Info, Cleanup-Bestätigung

**NICHT aktivieren für:** Log-Analyse, Code-Änderungen, MQTT-Traffic

---

### 4.2 Debug-Agents (Log-Analyse)

#### esp32-debug

**Domäne:** ESP32 Serial-Logs, Firmware-Verhalten

**Zweck:** Analysiert Serial-Output, verifiziert Boot-Sequenzen, interpretiert Error-Codes 1000-4999

**Aktivieren wenn:**
- Serial-Log vorliegt (`logs/esp32/` oder PlatformIO Monitor)
- Boot-Fehler, WiFi-Probleme, MQTT-Connect-Fehler
- GPIO-Konflikte, Watchdog-Timeouts
- NVS-Probleme, Config-Loading-Fehler
- I2C-Kommunikationsprobleme (relevant für diese Session!)
- Error-Codes im Range 1000-4999

**Benötigte Inputs:**
- Log-Datei Pfad oder Live-Monitor Output
- Test-Modus (BOOT/CONFIG/SENSOR/ACTUATOR/E2E)
- Spezifischer Fokus/Fragen

**Optimale Arbeitsweise:**
- Klaren Fokus geben (nicht "analysiere alles")
- Spezifische Fragen stellen
- Zeitraum/Zeilen eingrenzen

**Output:** `.claude/reports/current/ESP32_[MODUS]_REPORT.md`

**NICHT aktivieren für:** Server-Logs, MQTT-Broker-Logs, Code-Änderungen

---

#### server-debug

**Domäne:** Server JSON-Logs, Handler-Verhalten

**Zweck:** Analysiert god_kaiser.log, Handler-Fehler, Error-Codes 5000-5699

**Aktivieren wenn:**
- Server-Log vorliegt (`logs/server/god_kaiser.log`)
- Handler-Exceptions, Startup-Probleme
- MQTT-Handler-Fehler (sensor_handler, actuator_handler, heartbeat_handler)
- Database-Fehler, Validation-Errors
- WebSocket-Probleme
- Error-Codes im Range 5000-5699

**Benötigte Inputs:**
- Log-Datei Pfad (default: `logs/server/god_kaiser.log`)
- Zeitraum/Kontext
- Spezifische Fragen

**Output:** `.claude/reports/current/SERVER_[MODUS]_REPORT.md`

**NICHT aktivieren für:** ESP32-Logs, MQTT-Traffic-Analyse, Code-Änderungen

---

#### mqtt-debug

**Domäne:** MQTT-Traffic, Topic-Sequenzen, Timing

**Zweck:** Analysiert MQTT-Messages, prüft Sequenzen, identifiziert Timing-Gaps

**Aktivieren wenn:**
- MQTT-Traffic Log vorliegt (`logs/mqtt/`)
- Topic-Probleme, fehlende ACKs
- Timing-Gaps zwischen Messages
- Payload-Validierung nötig
- Heartbeat-Sequenzen prüfen
- Sensor-Data oder Actuator-Command Flow verifizieren

**Benötigte Inputs:**
- Traffic-Log Pfad oder Live-Capture
- Erwartete Topic-Sequenz
- Zeitraum

**MQTT-Capture starten:**
```bash
docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v
```

**Output:** `.claude/reports/current/MQTT_[MODUS]_REPORT.md`

**NICHT aktivieren für:** Log-Inhalte interpretieren, Code-Änderungen

---

#### frontend-debug

**Domäne:** Vue 3 Dashboard, Build-Errors, WebSocket

**Zweck:** Analysiert Frontend Build-Errors, TypeScript-Fehler, WebSocket-Events, Pinia State

**Aktivieren wenn:**
- Vite Build-Errors
- TypeScript Compilation-Fehler
- WebSocket-Verbindungsprobleme
- Pinia Store-Probleme
- Component-Lifecycle-Issues
- API-Fehler (Axios)

**Benötigte Inputs:**
- Build-Output oder Browser-Console-Logs
- Betroffene Komponente/View
- Reproduktionsschritte

**Output:** `.claude/reports/current/FRONTEND_[MODUS]_REPORT.md`

**NICHT aktivieren für:** Backend-Logs, MQTT-Traffic, ESP32-Code

---

#### meta-analyst

**Domäne:** Cross-Report-Analyse, Problemvergleich

**Zweck:** Vergleicht ALLE Reports zeitlich und inhaltlich, dokumentiert Widersprüche und Problemketten. Letzte Analyse-Instanz im Test-Flow.

**Aktivieren wenn:**
- NACH allen Debug-Agents aktiviert
- Reports aus verschiedenen Quellen verglichen werden müssen
- Zeitliche Zusammenhänge rekonstruiert werden müssen
- Widersprüche zwischen Reports aufgedeckt werden sollen
- Cross-Layer Korrelation nötig (ESP32 → Server → Frontend)

**Benötigte Inputs:**
- Alle Reports in `.claude/reports/current/`
- Session-Kontext
- Spezifischer Analyse-Fokus (falls vorhanden)

**Output:** `.claude/reports/current/META_ANALYSIS.md`

**NICHT aktivieren für:** Lösungsvorschläge, direkte Log-Analyse, Code-Änderungen

**SUCHT KEINE LÖSUNGEN** - nur präzise Problemdokumentation mit Quellen

---

### 4.3 Dev-Agents (Code-Implementierung)

#### esp32-dev

**Domäne:** C++ Firmware, Sensor-/Actuator-Driver, PlatformIO

**Zweck:** Analysiert und implementiert ESP32 Firmware-Code

**3 Modi:**
- **Modus A (Analyse):** Codebase analysieren → `*_ANALYSIS.md`
- **Modus B (Plan):** Implementierung planen → `*_PLAN.md`
- **Modus C (Implementierung):** Code schreiben → Code-Dateien

**Aktivieren wenn:**
- Sensor/Actuator hinzufügen
- Driver implementieren (I2C, OneWire, etc.)
- GPIO-Logik ändern
- NVS-Key hinzufügen
- MQTT-Topics auf ESP-Seite erweitern
- Safety-Controller anpassen

**Benötigte Inputs:**
- Modus (A/B/C)
- Problem-/Feature-Beschreibung
- Betroffene Komponente

**Output:** Reports + Code in `El Trabajante/`

**NICHT aktivieren für:** Log-Analyse, Server-Code, Frontend-Code

---

#### server-dev

**Domäne:** Python/FastAPI, Handler, Services, SQLAlchemy

**Zweck:** Analysiert und implementiert Server-Code

**3 Modi:** Wie esp32-dev (A/B/C)

**Aktivieren wenn:**
- MQTT-Handler erstellen/erweitern
- REST-Endpoint hinzufügen
- Repository/Service implementieren
- Pydantic Schema erstellen
- Database-Model hinzufügen
- Logic-Engine erweitern

**Benötigte Inputs:**
- Modus (A/B/C)
- Problem-/Feature-Beschreibung
- Betroffene Komponente

**Output:** Reports + Code in `El Servador/`

**NICHT aktivieren für:** Log-Analyse, ESP32-Code, Frontend-Code

---

#### mqtt-dev

**Domäne:** MQTT-Topics, Payloads (Server + ESP32)

**Zweck:** Implementiert MQTT-Topics auf BEIDEN Seiten (Server + ESP32)

**3 Modi:** Wie esp32-dev (A/B/C)

**Aktivieren wenn:**
- Neues Topic hinzufügen
- Payload-Schema ändern
- Handler + Publisher synchron ändern
- QoS-Level anpassen

**WICHTIG:** Änderungen betreffen IMMER Server UND ESP32!

**Benötigte Inputs:**
- Modus (A/B/C)
- Topic-Name und Zweck
- Payload-Schema

**Output:** Code in beiden Codebases + `MQTT_TOPICS.md` Update

**NICHT aktivieren für:** Log-Analyse, reine Frontend-Änderungen

---

#### frontend-dev

**Domäne:** Vue 3, TypeScript, Pinia, Composition API

**Zweck:** Analysiert und implementiert Frontend-Code (El Frontend)

**3 Modi:** Wie esp32-dev (A/B/C)

**Aktivieren wenn:**
- Vue-Komponente erstellen/ändern
- Composable implementieren
- Pinia Store erweitern
- WebSocket-Handler anpassen
- Dashboard-Elemente hinzufügen

**Benötigte Inputs:**
- Modus (A/B/C)
- Betroffene Komponente/View
- Design-Anforderungen (falls UI-relevant)

**Output:** Reports + Code in `El Frontend/`

**NICHT aktivieren für:** Log-Analyse, Backend-Code, MQTT-Handler

---

### 4.4 Skills (User-aufrufbar)

| Skill | Trigger | Zweck |
|-------|---------|-------|
| `/collect-reports` | Nach Debug-Agents | Konsolidiert alle Reports in CONSOLIDATED_REPORT.md |
| `/do` | Nach Plan | Führt geplante Implementierung aus |
| `/updatedocs` | Nach Code-Änderungen | Aktualisiert Dokumentation |
| `/verify-plan` | Vor Implementierung | Reality-Check für TM-Pläne |
| `/git-health` | Bei Git-Problemen | Prüft Repository-Zustand |
| `/git-commit` | Nach Änderungen | Bereitet Commits vor |
| `/agent-manager` | Bei Agent-Problemen | Prüft Agent-Konsistenz |

---

## 5. REFERENZ-VERZEICHNIS

### Befehle & Operationen

| Aufgabe | Referenz | Pfad |
|---------|----------|------|
| Server/MQTT/ESP steuern | SYSTEM_OPERATIONS_REFERENCE | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` |
| Docker-Stack verwalten | SYSTEM_OPERATIONS_REFERENCE | Section 0.5-0.7 |
| REST-API aufrufen | SYSTEM_OPERATIONS_REFERENCE | Section 3 |
| DB-Queries | SYSTEM_OPERATIONS_REFERENCE | Section 1 |
| Wokwi-Simulation | SYSTEM_OPERATIONS_REFERENCE | Section 5.3 |

### Protokolle & Patterns

| Thema | Referenz | Pfad |
|-------|----------|------|
| MQTT-Topics | MQTT_TOPICS | `.claude/reference/api/MQTT_TOPICS.md` |
| Datenflüsse (7 Flows) | COMMUNICATION_FLOWS | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| Error-Codes | ERROR_CODES | `.claude/reference/errors/ERROR_CODES.md` |
| REST-Endpoints | REST_ENDPOINTS | `.claude/reference/api/REST_ENDPOINTS.md` |
| WebSocket-Events | WEBSOCKET_EVENTS | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
| Architektur | ARCHITECTURE_DEPENDENCIES | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` |
| Log-Pfade | LOG_LOCATIONS | `.claude/reference/debugging/LOG_LOCATIONS.md` |
| CI-Pipeline | CI_PIPELINE | `.claude/reference/debugging/CI_PIPELINE.md` |

### Kommunikations-Flows (Kurzreferenz)

| Flow | Route | Latenz |
|------|-------|--------|
| A: Sensor-Daten | ESP→Server→Frontend | 50-230ms |
| B: Actuator-Steuerung | Frontend→Server→ESP | 100-290ms |
| C: Emergency Stop | Server→ALL ESPs | <100ms |
| D: Zone Assignment | Server→ESP→Server | 50-150ms |
| E: Config Update | Server→ESP | 100-300ms |
| F: Heartbeat | ESP→Server→Frontend | 20-80ms |
| G: Logic Engine | Server→ESP | 20-100ms |

---

## 6. WORKFLOW-STRUKTUR

### Typischer Test-Workflow

```
1. system-control    → System-Operationen ausführen, Logs generieren
2. Debug-Agents      → Logs analysieren (esp32/server/mqtt/frontend)
3. /collect-reports  → Reports konsolidieren
4. meta-analyst      → Cross-Report-Analyse (optional)
5. Dev-Agents        → Code implementieren (falls Fix nötig)
6. system-control    → Erneut testen
```

### Agent-Entscheidungshilfe

```
Situation                          → Agent
─────────────────────────────────────────────────────
Test-Session starten               → system-control (ERSTER!)
ESP Serial-Log analysieren         → esp32-debug
Server-Log analysieren             → server-debug
MQTT-Traffic analysieren           → mqtt-debug
Frontend-Probleme                  → frontend-debug
Datenbank prüfen                   → db-inspector
Reports vergleichen                → meta-analyst
Code-Fix implementieren            → esp32-dev / server-dev / mqtt-dev / frontend-dev
```

### Debug-Agent Auswahl nach Log-Quelle

| Log-Quelle | Pfad | Agent |
|------------|------|-------|
| ESP32 Serial | `logs/esp32/` oder PlatformIO Monitor | esp32-debug |
| Server JSON | `logs/server/god_kaiser.log` | server-debug |
| MQTT Traffic | `docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v` | mqtt-debug |
| Frontend | Browser Console / Vite Output | frontend-debug |
| Alle Reports | `.claude/reports/current/` | meta-analyst |

---

## 7. SESSION-SPEZIFISCHE HINWEISE

### I2C-Konfiguration (GPIO 21/22)

**Standard ESP32 I2C-Pins:**
- GPIO 21 = SDA (Data)
- GPIO 22 = SCL (Clock)

**Unterstützte I2C-Sensoren:**
| Sensor | Adressen | RAW-Mode | Kompensation |
|--------|----------|----------|--------------|
| SHT31 | 0x44, 0x45 | Ja | Server |
| BMP280 | 0x76, 0x77 | Nein | ESP (Adafruit) |
| BME280 | 0x76, 0x77 | Nein | ESP (Adafruit) |

**I2C-Scan durchführen:**
```bash
# Via REST-API (falls implementiert)
curl http://localhost:8000/api/v1/sensors/esp/ESP_XXXXX/i2c/scan
```

### NVS-Zustand (nicht gelöscht)

**Implikationen:**
- ESP lädt beim Boot gespeicherte Konfiguration
- WiFi-Credentials, MQTT-Broker-Adresse, Zone-ID sind persistiert
- Device-ID bleibt gleich
- Sensor/Actuator-Konfiguration wird aus NVS geladen

**Falls Clean-Start gewünscht:**
```bash
# NVS löschen via PlatformIO
cd "El Trabajante"
pio run -e esp32_dev -t erase
```

### Datenbank-Zustand (voll)

**Erwartete Daten:**
- `esp_devices`: Registrierte ESPs aus vorherigen Sessions
- `sensor_data`: Historische Messwerte
- `actuator_history`: Vergangene Commands
- `esp_heartbeat_logs`: Heartbeat-Historie
- `audit_logs`: System-Events

**Schnell-Check via db-inspector:**
```sql
SELECT device_id, name, status, last_seen FROM esp_devices ORDER BY last_seen DESC;
SELECT COUNT(*) as data_points FROM sensor_data WHERE timestamp > datetime('now', '-24 hours');
```

---

## 8. FÜR DEN TECHNICAL MANAGER

### Wie diese Session orchestrieren

1. **Dieses Briefing vollständig lesen**
2. **Agent-Kompendium studieren** - verstehen was jeder Agent kann
3. **system-control zuerst** - Test-Session starten, Logs generieren
4. **Dessen Operations-Bericht lesen** - was wurde ausgeführt
5. **Debug-Agents basierend auf Logs** - analysieren was passiert ist
6. **Entscheidung treffen** - weiterer Debug oder Dev-Agent für Fix

### Hinweise für Agent-Befehle

- Immer spezifischen Kontext mitgeben
- Bei Debug-Agents: Konkrete Fragen formulieren
- Bei Dev-Agents: Modus (A/B/C) angeben
- Output-Pfad angeben (`.claude/reports/current/`)

### Schnellstart-Befehle

**MQTT beobachten:**
```bash
docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v
```

**Server-Health prüfen:**
```bash
curl -s http://localhost:8000/health | jq
```

**ESPs auflisten:**
```bash
curl -s http://localhost:8000/api/v1/esp/devices | jq '.data[] | {device_id, status, last_seen}'
```

**Server-Logs (Errors):**
```bash
docker compose logs -f el-servador | grep -E "ERROR|WARNING"
```

---

## 9. BEKANNTE PROBLEME

| ID | Problem | Status | Workaround |
|----|---------|--------|------------|
| #1 | ESP-Webportal nicht erreichbar nach falscher IP-Konfiguration | Offen | Factory-Reset (Boot-Button 10s) oder NVS-Erase |

---

**Ende des SESSION_BRIEFING**

*Erstellt: 2026-02-06 | System Manager Agent | AutomationOne*
