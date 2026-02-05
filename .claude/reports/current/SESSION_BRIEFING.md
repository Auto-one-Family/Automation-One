# SESSION_BRIEFING.md

**Erstellt:** 2026-02-05
**Session:** Neue Debug/Development Session
**System Manager Version:** 2.0

---

## 1. PROJEKT-GRUNDLAGEN

### 1.1 Architektur

**AutomationOne** ist ein IoT-Framework für Gewächshausautomation mit **Server-Zentrischem Prinzip:**

```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
```

| Komponente | Technologie | Rolle |
|------------|-------------|-------|
| **El Frontend** | Vue 3, TypeScript, Pinia, Tailwind | Dashboard, Visualisierung |
| **El Servador** | Python, FastAPI, SQLAlchemy, MQTT | ALLE Intelligenz, Business-Logic |
| **El Trabajante** | C++, PlatformIO, ESP32 | Dummer Agent - RAW-Daten senden, Commands empfangen |

**KRITISCH:** ESP32 implementiert **KEINE** Business-Logic. Alle Entscheidungen erfolgen auf dem Server.

### 1.2 Konventionen

| Bereich | Konvention | Beispiel |
|---------|------------|----------|
| ESP32 C++ | snake_case | `sensor_manager`, `handle_mqtt_message` |
| Python | snake_case | `sensor_service`, `handle_sensor_data` |
| Vue/TS | camelCase | `sensorData`, `handleSensorUpdate` |
| Error-Codes ESP32 | 1000-4999 | 1011 = I2C_ERROR |
| Error-Codes Server | 5000-5999 | 5001 = ESP_DEVICE_NOT_FOUND |

---

## 2. AKTUELLER SYSTEM-STATUS

### 2.1 Git-Status

| Attribut | Wert |
|----------|------|
| **Branch** | `feature/docs-cleanup` |
| **Uncommitted Changes** | ~50+ Dateien (Agents, Skills, Server-Code) |
| **Letzter Commit** | `f2d2405` - feat(agents): Dev-Agents für Server und MQTT hinzugefügt |

**Hinweis:** Viele `.claude/` Dokumentations-Dateien wurden reorganisiert (Agents, Skills, Referenzen).

### 2.2 Services

| Service | Port | Status |
|---------|------|--------|
| **MQTT Broker (Mosquitto)** | 1883 | ✅ RUNNING (Windows Service) |
| **Server (FastAPI)** | 8000 | ❌ NOT RUNNING |

**→ Server muss vor Debug-Sessions gestartet werden:**
```bash
cd "El Servador/god_kaiser_server" && poetry run uvicorn src.main:app --reload
```

### 2.3 Letzte Reports

| Report | Pfad |
|--------|------|
| Agent-Duplikat-Analyse | `.claude/reports/current/AGENT_DUPLICATE_ANALYSIS.md` |
| Dokumentations-Inventar | `.claude/reports/current/DOCUMENTATION_INVENTORY.md` |

---

## 3. SESSION-KONTEXT

### 3.1 Hardware-Konfiguration

**⚠️ Keine Hardware-Info angegeben.**

Für Hardware-Tests bitte angeben:
- ESP32: physisch oder Wokwi?
- Sensoren: welche an welchem GPIO?
- Aktoren: welche an welchem GPIO?

### 3.2 Test-Fokus

**⚠️ Kein spezifischer Test-Fokus angegeben.**

Mögliche Fokus-Bereiche:
- Boot-Sequenz verifizieren
- Sensor-Datenfluss testen
- Actuator-Commands testen
- E2E-Flow verifizieren
- Bug-Fixing (BUG-006, BUG-008)

---

## 4. AGENT-KOMPENDIUM

### 4.1 Operators (System-Steuerung)

#### system-control

**Domäne:** Systemsteuerung, Server/MQTT-Operations, Hardware-Operationen

**Aktivieren wenn:**
- Server starten/stoppen
- MQTT-Traffic live beobachten
- REST-API Aufrufe ausführen
- ESP32 flashen und monitoren
- Debug-Sessions koordinieren

**Benötigte Inputs:**
- Welche Operation soll ausgeführt werden?
- Ziel-ESP-ID (falls relevant)

**Optimale Arbeitsweise:**
1. Referenz lesen: `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`
2. Voraussetzungen prüfen (Server online? MQTT erreichbar?)
3. Befehl ausführen
4. Ergebnis verifizieren

**Output:** Operations-Bericht mit Timestamps, MQTT-Flow-Dokumentation

**NICHT aktivieren für:** Log-Analyse, DB-Queries, Code-Änderungen

---

#### db-inspector

**Domäne:** Datenbank-Inspektion und Cleanup (SQLite/PostgreSQL)

**Aktivieren wenn:**
- Device-Registrierung prüfen
- Sensor-Daten verifizieren
- Audit-Logs analysieren
- Orphaned Records finden
- Stale Data bereinigen
- Schema prüfen

**Benötigte Inputs:**
- Was soll geprüft werden? (ESPs, Sensoren, Aktoren, Logs)
- Cleanup nötig? (Bestätigung erforderlich!)

**Optimale Arbeitsweise:**
1. Referenz lesen: Section 1 in SYSTEM_OPERATIONS_REFERENCE.md
2. DB-Existenz prüfen
3. SELECT vor DELETE (immer!)
4. Kaskaden beachten bei Löschungen

**Output:** Strukturierte Tabellen, Cleanup-Empfehlungen

**NICHT aktivieren für:** Server-Logs, MQTT-Traffic, Code-Änderungen

---

### 4.2 Debug-Agents (Log-Analyse)

#### esp32-debug

**Domäne:** ESP32 Serial-Log Analyse

**Aktivieren wenn:**
- Boot-Probleme
- WiFi/MQTT-Verbindungsfehler
- Sensor-Initialisierung fehlgeschlagen
- GPIO-Fehler
- Watchdog-Resets
- Error-Codes 1000-4999

**Benötigte Inputs:**
- Session-Kontext aus `logs/current/STATUS.md`
- Serial-Log aus `logs/current/esp32_serial.log`
- Test-Modus: BOOT/CONFIG/SENSOR/ACTUATOR/E2E

**Optimale Arbeitsweise:**
1. STATUS.md lesen (Modus, erwartete Patterns)
2. Boot-Sequenz verifizieren
3. JEDEN [ERROR] und [CRITICAL] dokumentieren
4. Timing analysieren

**Output:** `.claude/reports/current/ESP32_[MODUS]_REPORT.md`

**NICHT aktivieren für:** Server-Logs, MQTT-Traffic, DB-Queries

---

#### server-debug

**Domäne:** Server-Log Analyse (god_kaiser.log)

**Aktivieren wenn:**
- Handler-Fehler
- Startup-Probleme
- Error-Codes 5000-5699
- Database-Operationen fehlgeschlagen
- WebSocket-Events

**Benötigte Inputs:**
- Session-Kontext aus `logs/current/STATUS.md`
- Server-Log aus `logs/current/god_kaiser.log`
- Fokus: boot/sensor/actuator/config/e2e

**Optimale Arbeitsweise:**
1. STATUS.md lesen
2. JSON-Logs parsen (jede Zeile = ein JSON-Objekt)
3. Nach Level filtern: CRITICAL > ERROR > WARNING
4. Logger-Namen → Handler zuordnen

**Output:** `.claude/reports/current/SERVER_[MODUS]_REPORT.md`

**NICHT aktivieren für:** ESP32 Serial-Logs, MQTT-Traffic (Topics/Payloads)

---

#### mqtt-debug

**Domäne:** MQTT-Traffic Analyse (mosquitto_sub -v Logs)

**Aktivieren wenn:**
- Message-Sequenzen validieren
- Fehlende Responses identifizieren
- Timing-Gaps analysieren
- Payload-Struktur prüfen
- LWT-Messages untersuchen

**Benötigte Inputs:**
- Session-Kontext aus `logs/current/STATUS.md`
- MQTT-Traffic aus `logs/current/mqtt_traffic.log`
- Fokus: heartbeat/sensor/actuator/config/e2e

**Optimale Arbeitsweise:**
1. STATUS.md lesen
2. Traffic parsen: Topic + Payload trennen
3. Request-Response-Paare matchen
4. Timing zwischen Messages analysieren

**Output:** `.claude/reports/current/MQTT_[MODUS]_REPORT.md`

**NICHT aktivieren für:** ESP32-internes Verhalten, Server-Handler-Verhalten

---

#### meta-analyst

**Domäne:** Cross-Report-Analyse, Widersprüche, Problemketten

**Aktivieren wenn:**
- Alle Debug-Agents abgeschlossen
- CONSOLIDATED_REPORT.md erstellt
- TM möchte Report-Vergleich
- Widersprüche zwischen Reports vermuten
- Zeitliche Problemsequenzen analysieren
- LETZTE Analyse-Instanz im Test-Flow

**Benötigte Inputs:**
- ALLE DREI Logs: esp32_serial.log, mqtt_traffic.log, god_kaiser.log
- Problem-Beschreibung

**Optimale Arbeitsweise:**
1. Log-Validierung ZUERST (Timestamps prüfen!)
2. Alle drei Logs lesen
3. Error-Codes dekodieren (rc=-2 = Timeout)
4. Ein Root-Cause identifizieren

**Output:** `.claude/reports/current/PROVISIONING_REPORT.md`

**NICHT aktivieren für:** Sensor-Daten, Actuator-Commands, Business-Logik

---

### 4.3 Dev-Agents (Pattern-konforme Implementierung)

#### esp32-dev

**Domäne:** ESP32 C++ Code-Implementierung

**Aktivieren wenn:**
- Sensor hinzufügen
- Actuator erstellen
- Driver implementieren
- Service erweitern
- NVS-Key hinzufügen
- MQTT erweitern (ESP32-Seite)
- Error-Code definieren
- GPIO-Logik

**Benötigte Inputs:**
- Was soll implementiert werden?
- Welches existierende Pattern soll erweitert werden?

**Optimale Arbeitsweise:**
1. SKILL.md lesen: `.claude/skills/esp32-development/SKILL.md`
2. MODULE_REGISTRY.md lesen
3. Ähnliche Implementation in Codebase finden
4. Pattern kopieren und erweitern
5. `pio run -e esp32_dev` verifizieren

**Output:** Analyse-Report, Implementierungsplan, oder Code-Dateien

**NICHT aktivieren für:** Server-Code, Log-Analyse, Python-Code

---

#### server-dev

**Domäne:** Server Python Code-Implementierung

**Aktivieren wenn:**
- MQTT Handler hinzufügen
- REST Endpoint erstellen
- Repository erweitern
- Service implementieren
- Pydantic Schema erstellen
- Database Model hinzufügen
- Sensor Library erstellen
- Logic Engine erweitern

**Benötigte Inputs:**
- Was soll implementiert werden?
- Welches existierende Pattern soll erweitert werden?

**Optimale Arbeitsweise:**
1. SKILL.md lesen: `.claude/skills/server-development/SKILL.md`
2. Ähnliche Implementation finden
3. Pattern kopieren und erweitern
4. `poetry run pytest` verifizieren

**Output:** Analyse-Report, Implementierungsplan, oder Code-Dateien

**NICHT aktivieren für:** ESP32-Code, Log-Analyse, C++ Code

---

#### mqtt-dev

**Domäne:** MQTT Topic-Implementation (Server UND ESP32)

**Aktivieren wenn:**
- Neues Topic hinzufügen
- Handler erstellen
- Publisher erweitern
- Subscriber erweitern
- Payload-Schema definieren
- QoS festlegen

**Benötigte Inputs:**
- Topic-Spezifikation
- Richtung: ESP→Server, Server→ESP, bidirektional
- Payload-Struktur

**Optimale Arbeitsweise:**
1. MQTT_TOPICS.md lesen
2. Server topics.py prüfen
3. ESP32 topic_builder.h prüfen
4. **BEIDE Seiten synchron implementieren**

**Output:** Analyse-Report, Implementierungsplan, oder Code-Dateien (Server + ESP32)

**NICHT aktivieren für:** Log-Analyse, Traffic-Debugging

---

## 5. REFERENZ-VERZEICHNIS

| Referenz | Pfad | Inhalt |
|----------|------|--------|
| **SYSTEM_OPERATIONS** | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Alle Befehle, Credentials, Workflows |
| **COMMUNICATION_FLOWS** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | 7 Datenflüsse mit Code-Locations |
| **ERROR_CODES** | `.claude/reference/errors/ERROR_CODES.md` | ESP32: 1000-4999, Server: 5000-5999 |
| **MQTT_TOPICS** | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Schema, Payloads, QoS |

### Skill-Dokumentation

| Skill | Pfad |
|-------|------|
| ESP32 Development | `.claude/skills/esp32-development/SKILL.md` |
| Server Development | `.claude/skills/server-development/SKILL.md` |
| Frontend Development | `.claude/skills/frontend-development/SKILL.md` |

---

## 6. WORKFLOW-STRUKTUR

### 6.1 Typischer Test-Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TEST-SESSION WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. SESSION-START                                                        │
│     └── SESSION_BRIEFING.md lesen (dieses Dokument)                     │
│     └── Hardware-Info und Test-Fokus bereitstellen                      │
│                                                                          │
│  2. SYSTEM VORBEREITEN (system-control)                                  │
│     └── Server starten: cd "El Servador/god_kaiser_server" &&           │
│         poetry run uvicorn src.main:app --reload                        │
│     └── MQTT-Broker starten (falls nicht läuft)                         │
│     └── Health-Check: curl http://localhost:8000/health                 │
│                                                                          │
│  3. OPERATIONEN AUSFÜHREN (system-control)                               │
│     └── ESP flashen/starten                                             │
│     └── MQTT-Traffic beobachten                                         │
│     └── API-Calls ausführen                                             │
│                                                                          │
│  4. LOGS ANALYSIEREN (Debug-Agents)                                      │
│     └── esp32-debug: Serial-Log                                         │
│     └── server-debug: god_kaiser.log                                    │
│     └── mqtt-debug: mqtt_traffic.log                                    │
│                                                                          │
│  5. FIX IMPLEMENTIEREN (Dev-Agents, falls nötig)                         │
│     └── esp32-dev: ESP32 C++ Code                                       │
│     └── server-dev: Server Python Code                                  │
│     └── mqtt-dev: MQTT Topics (beide Seiten)                            │
│                                                                          │
│  6. VERIFIZIEREN                                                         │
│     └── Build: pio run / pytest                                         │
│     └── Test wiederholen                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Agent-Entscheidungshilfe

| Situation | Agent |
|-----------|-------|
| Server/MQTT starten, API-Calls | `system-control` |
| DB prüfen, Cleanup | `db-inspector` |
| ESP32 Serial-Log analysieren | `esp32-debug` |
| Server-Log analysieren | `server-debug` |
| MQTT-Traffic analysieren | `mqtt-debug` |
| Cross-Report-Analyse | `meta-analyst` |
| ESP32 Code schreiben | `esp32-dev` |
| Server Code schreiben | `server-dev` |
| MQTT Topic implementieren | `mqtt-dev` |

### 6.3 Debug-Agent nach Log-Quelle

| Log-Quelle | Pfad | Debug-Agent |
|------------|------|-------------|
| ESP32 Serial | `logs/current/esp32_serial.log` | `esp32-debug` |
| Server | `logs/current/god_kaiser.log` | `server-debug` |
| MQTT Traffic | `logs/current/mqtt_traffic.log` | `mqtt-debug` |

---

## 7. FÜR DEN TECHNICAL MANAGER

### 7.1 Wie orchestrieren

1. **system-control ZUERST** - Startet Services, generiert Logs
2. **Debug-Agents nach Bedarf** - Analysieren die generierten Logs
3. **Dev-Agents nur bei Code-Änderungen** - Pattern-konform implementieren

### 7.2 Agent-Befehle formulieren

Beispiel-Format für Agent-Aufträge:

```
Du bist [agent-name].

**Kontext:**
- Session: [Datum/Zeit]
- Modus: [BOOT/CONFIG/SENSOR/ACTUATOR/E2E]

**Auftrag:**
[Spezifische Aufgabe]

**Fokus:**
[Bestimmte Dateien, Topics, Error-Codes]

**Fragen:**
1. [Konkrete Frage 1]
2. [Konkrete Frage 2]

**Output:**
[Pfad zum Report]
```

### 7.3 Wichtige Hinweise

- **Server und MQTT sind aktuell NICHT gestartet** - Vor Tests starten!
- **Branch feature/docs-cleanup** - Dokumentations-Änderungen uncommitted
- **BUG-006 und BUG-008** - Höchste Priorität, wahrscheinlich zusammenhängend
- **Keine Hardware-Info** - Für Hardware-Tests muss der User diese angeben

### 7.4 Quick-Commands

```bash
# Server starten
cd "El Servador/god_kaiser_server" && poetry run uvicorn src.main:app --reload

# Health Check
curl http://localhost:8000/health

# MQTT beobachten
mosquitto_sub -h localhost -t "kaiser/#" -v

# ESP32 flashen
cd "El Trabajante" && pio run -e esp32_dev -t upload

# Serial Monitor
cd "El Trabajante" && pio device monitor
```

---

**Ende des Session-Briefings**

*System Manager v2.0 - Erklärt das System, entscheidet NICHTS*
