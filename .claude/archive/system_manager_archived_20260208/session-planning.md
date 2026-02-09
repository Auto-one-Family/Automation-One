---
name: session-planning
description: |
  Hardware-Test Session-Planung für AutomationOne.
  Erstellt vollständige Testpläne für ESP32↔Server Integration.
  AKTIVIEREN BEI: Session-Start, "plane Test", "erstelle Testplan", "Session vorbereiten",
  "Hardware-Test", "ESP uploaden", "Projektstatus", "was ist der Stand".
  OUTPUT: Strukturierter Plan für Technical Manager (Claude.ai).
allowed-tools: Read, Grep, Glob, Bash
---

# Session-Planning Skill

## Zweck

Dieser Skill erstellt vollständige **Hardware-Test Session-Pläne** für das AutomationOne-Projekt. Der Plan informiert den **Technical Manager** (Robin via Claude.ai) über:

1. Aktuellen Projektstatus
2. Geplantes Testszenario
3. Benötigte Agents und ihre Zuständigkeiten
4. Relevante Dokumentation
5. Erwartete Ergebnisse

---

## User-Input Template

**Erfrage vom User falls nicht vorhanden:**

```
Bitte gib mir folgende Informationen für die Session-Planung:

1. **ESP-Upload:** [Serial-Log, Code-Snippet, oder "keiner"]
2. **Hardware-Setup:** [Welche Sensoren/Actuatoren an welchen GPIOs?]
3. **Server-Status:** [läuft/gestoppt, DB-Zustand]
4. **Provisioning-Phase:** [pending/approved/configured/active]
5. **Test-Fokus:** [Was soll heute getestet werden?]
```

---

## Analyse-Workflow

### Schritt 1: System-Status erfassen

```bash
# Git-Status
git status --short
git branch --show-current

# Server prüfen
pgrep -f "uvicorn.*god_kaiser" > /dev/null && echo "SERVER: ✓ Running" || echo "SERVER: ✗ Stopped"

# MQTT-Broker prüfen  
netstat -ano 2>/dev/null | grep -q "1883" && echo "MQTT: ✓ Running" || echo "MQTT: ✗ Stopped"

# Firmware-Version
grep -E "^version|monitor_speed" "El Trabajante/platformio.ini" 2>/dev/null

# Letzte Änderungen
git log --oneline -3
```

### Schritt 2: Codebase-Kontext laden

```bash
# Aktive Bug-Liste
cat ".claude/reports/BugsFound/Bug_Katalog.md" 2>/dev/null | head -50

# Letzte Session-Reports
ls -la ".claude/reports/current/" 2>/dev/null

# Archivierte Sessions (letzte 3)
ls -d .claude/reports/archive/*/ 2>/dev/null | tail -3
```

### Schritt 3: Hardware-Mapping (aus User-Input)

Erstelle Tabelle basierend auf User-Angaben:

| GPIO | Komponente | Typ | Interface | Erwartete Topics |
|------|------------|-----|-----------|------------------|
| 4 | DS18B20 | Sensor | OneWire | `sensor/4/data` |
| 5 | DHT22 | Sensor | Digital | `sensor/5/data` |
| 16 | Relay | Actuator | Digital | `actuator/16/command` |

---

## Plan-Output Template

```markdown
# 📋 Session-Plan: [YYYY-MM-DD] - [TEST-FOKUS]

**Erstellt:** [Timestamp]
**Für:** Technical Manager (Robin)
**Modus:** Plan Mode (read-only Analyse)

---

## 1️⃣ System-Ist-Zustand

### Infrastruktur

| Komponente | Status | Details |
|------------|--------|---------|
| Git Branch | `[branch]` | [clean/dirty] |
| Server | [✓/✗] | PID [X] auf Port 8000 |
| MQTT-Broker | [✓/✗] | Port 1883 |
| PostgreSQL | [✓/✗] | god_kaiser DB |

### ESP32-Zustand

| Attribut | Wert |
|----------|------|
| MAC-Adresse | [aus Log/User] |
| Firmware-Version | [aus platformio.ini] |
| Provisioning-Phase | [pending/approved/configured/active] |
| Letzte Aktivität | [Timestamp] |

### Hardware-Konfiguration

| GPIO | Komponente | Typ | Interface | Config-Status |
|------|------------|-----|-----------|---------------|
| [X] | [Name] | [Sensor/Actuator] | [I2C/OneWire/Digital/Analog] | [configured/pending] |

---

## 2️⃣ Test-Szenario

### Ziel
> [Klare Beschreibung was getestet wird]

### Scope
- [ ] ESP32 Boot-Sequenz
- [ ] MQTT-Verbindung
- [ ] Sensor-Datenerfassung
- [ ] Server-Verarbeitung
- [ ] Datenbank-Persistenz
- [ ] WebSocket-Frontend-Update

### Voraussetzungen

**Infrastruktur:**
- [ ] Server gestartet: `cd "El Servador" && poetry run uvicorn ...`
- [ ] MQTT-Broker läuft
- [ ] Database migriert: `poetry run alembic upgrade head`

**Hardware:**
- [ ] ESP32 geflasht mit aktueller Firmware
- [ ] Sensoren korrekt verkabelt
- [ ] Serial-Monitor bereit: `pio device monitor`

### Test-Ablauf

| # | Aktion | Erwartetes Ergebnis | Verifikation |
|---|--------|---------------------|--------------|
| 1 | ESP32 einschalten | Boot-Log zeigt WiFi-Connect | Serial-Monitor |
| 2 | MQTT-Connect | `system/heartbeat` empfangen | mosquitto_sub |
| 3 | Sensor-Read | `sensor/X/data` mit Payload | Server-Log |
| 4 | DB-Check | Neuer Eintrag in sensor_readings | db-inspector |

---

## 3️⃣ Agent-Koordination

### Empfohlene Agent-Reihenfolge

| Phase | Agent | Modus | Aufgabe |
|-------|-------|-------|---------|
| **Pre-Test** | system-control | Bash | Server + MQTT starten |
| **Pre-Test** | db-inspector | Query | DB-Zustand prüfen |
| **Analyse** | esp32-debug | Report | Boot-Log analysieren |
| **Monitor** | mqtt-debug | Live | Traffic überwachen |
| **Verify** | server-debug | Report | Server-Logs prüfen |
| **Verify** | db-inspector | Query | Daten verifizieren |

### Agent-Aktivierung

```bash
# System-Control für Infrastruktur
> Use system-control to start the server and verify MQTT broker

# ESP32-Debug für Boot-Analyse
> Use esp32-debug to analyze the uploaded serial log

# MQTT-Debug für Traffic-Monitoring
> Use mqtt-debug to monitor traffic on kaiser/# topics

# DB-Inspector für Daten-Verifikation
> Use db-inspector to check sensor_readings table
```

---

## 4️⃣ Referenz-Dokumentation

### Für diesen Test relevant

| Dokument | Pfad | Relevante Sections |
|----------|------|-------------------|
| **COMMUNICATION_FLOWS** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | §1 Sensor-Flow, §6 Heartbeat |
| **MQTT_TOPICS** | `.claude/reference/api/MQTT_TOPICS.md` | sensor/*, system/*, config/* |
| **ERROR_CODES** | `.claude/reference/errors/ERROR_CODES.md` | ESP: 1000-1999, Server: 5100-5199 |
| **LOG_LOCATIONS** | `.claude/reference/debugging/LOG_LOCATIONS.md` | Server-Logs, Serial-Monitor |

### Quick-Links für Agents

- ESP32 Skill: `.claude/skills/esp32-development/SKILL.md`
- Server Skill: `.claude/skills/server-development/SKILL.md`
- System-Ops: `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`

---

## 5️⃣ Bekannte Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| WiFi-Timeout | Mittel | Test-Stopp | Credentials prüfen, RSSI checken |
| MQTT-Disconnect | Niedrig | Datenverlust | QoS 1 für wichtige Topics |
| DB-Lock | Niedrig | Server-Error | Concurrent-Sessions vermeiden |

---

## 6️⃣ Erfolgs-Kriterien

### Minimum Viable Test ✓
- [ ] ESP32 bootet ohne Fehler (Error-Code 0)
- [ ] MQTT-Verbindung etabliert
- [ ] Mindestens 1 Sensor-Reading in DB

### Vollständiger Test ✓✓
- [ ] Alle konfigurierten Sensoren senden Daten
- [ ] Server verarbeitet alle Messages
- [ ] WebSocket-Update erreicht Frontend

### Edge-Case Coverage ✓✓✓
- [ ] Reconnect nach WiFi-Verlust
- [ ] Graceful Degradation bei Sensor-Fehler
- [ ] Circuit-Breaker Aktivierung getestet

---

## 7️⃣ Post-Test Actions

Nach erfolgreichem Test:
1. Session-Reports archivieren: `mv .claude/reports/current/* .claude/reports/archive/[DATE]_[NAME]/`
2. Bug-Katalog aktualisieren falls nötig
3. Technical Manager über Ergebnisse informieren

---

## 8️⃣ Nächste Schritte

1. **Plan bestätigen** - User reviewed diesen Plan
2. **Plan Mode verlassen** - `Shift+Tab` → Normal Mode
3. **Infrastruktur starten** - system-control Agent
4. **Test durchführen** - Agent-Sequenz wie oben
5. **Ergebnisse dokumentieren** - Reports erstellen
```

---

## Agent-Empfehlungen für Technical Manager

SYSTEM_MANAGER erstellt Empfehlungen - er führt KEINE Agents aus!

### Verfügbare Agents (für SESSION_BRIEFING)

```yaml
esp32-debug:
  beschreibung: "Serial-Log Analyse, Boot-Sequenz, Sensor-Init"
  tools: [Read, Grep, Glob]
  output: ESP32_*_REPORT.md
  empfehlen_wenn: ESP32-Log vorhanden, Boot-Probleme

server-debug:
  beschreibung: "Server-Log Analyse, Handler-Tracing, DB-Ops"
  tools: [Read, Grep, Glob, Bash]
  output: SERVER_*_REPORT.md
  empfehlen_wenn: Server-Errors, Handler-Probleme

mqtt-debug:
  beschreibung: "MQTT Traffic-Analyse, Topic-Matching, Payload-Validation"
  tools: [Read, Grep, Glob, Bash]
  output: MQTT_*_REPORT.md
  empfehlen_wenn: Kommunikationsprobleme, fehlende Messages

db-inspector:
  beschreibung: "Database Queries, Schema-Checks, Migration-Status"
  tools: [Read, Grep, Bash]
  output: Query-Ergebnisse
  empfehlen_wenn: Daten-Inkonsistenzen, ESP-Registration

system-control:
  beschreibung: "Service-Management, Status-Checks, Build-Commands"
  tools: [Read, Grep, Bash]
  output: Befehls-Ergebnisse
  empfehlen_wenn: System starten/stoppen nötig
```

### Kopierfertige Auftrags-Templates (für SESSION_BRIEFING)

```markdown
**esp32-debug Auftrag:**
Du bist esp32-debug.
Analysiere: [Problem aus Finding]
Log: logs/current/esp32_serial.log
Fokus: [Zeilen/Pattern]
Output: .claude/reports/current/ESP32_[MODUS]_REPORT.md

**server-debug Auftrag:**
Du bist server-debug.
Analysiere: [Problem aus Finding]
Log: logs/current/god_kaiser.log
Fokus: [Handler/Error-Code]
Output: .claude/reports/current/SERVER_[MODUS]_REPORT.md

**mqtt-debug Auftrag:**
Du bist mqtt-debug.
Analysiere: [Problem aus Finding]
Log: logs/current/mqtt_traffic.log
Fokus: [Topics/Sequenzen]
Output: .claude/reports/current/MQTT_[MODUS]_REPORT.md
```

**WICHTIG:** Diese Aufträge werden vom Technical Manager an den User weitergegeben, der sie im Edit Mode ausführt.

---

## Dateien in diesem Skill-Ordner

```
.claude/skills/session-planning/
├── SKILL.md                    ← Diese Datei
├── templates/
│   └── SESSION_PLAN_TEMPLATE.md  ← Vorlage für Plans
└── examples/
    └── EXAMPLE_SESSION_PLAN.md   ← Beispiel-Session
```

**Hinweis:** Templates und Examples werden nur bei Bedarf geladen (Progressive Disclosure).

---

**Version:** 1.0
**Referenz:** Haupt-Skill in `SKILL.md`