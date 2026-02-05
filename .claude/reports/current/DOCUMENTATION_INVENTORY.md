# Dokumentations-Inventar

**Erstellt:** 2026-02-04
**Analysiert von:** Claude Code Agent

---

## 1. Übersicht

### Statistik

| Kategorie | Anzahl Dateien | Gesamt-Zeilen | Bemerkung |
|-----------|----------------|---------------|-----------|
| Skills | 7 | ~3.155 | 3 SKILL.md + 2 MODULE_REGISTRY + databases + README |
| References | 11 | ~9.313 | API, Errors, Patterns, Debugging, Testing |
| Agents | 12 | ~4.498 | 6 Debug + 3 Dev + 2 Operator + Readme |
| Rules | 1 | 198 | rules.md |
| Reports (current) | 6 | ~959 | BugsFound + README + AGENT_DUPLICATE_ANALYSIS |
| Archive | 17 | (nicht gezählt) | Backups, alte Reports |
| **Gesamt** | ~54 aktiv | ~18.123 | ohne Archive |

### Ordnerstruktur

```
.claude/
├── CLAUDE.md                    ← Router-Datei (60 Zeilen)
├── skills/                      ← Entwicklungs-Skills
│   ├── README.md
│   ├── esp32-development/
│   │   ├── SKILL.md            (364 Z.)
│   │   └── MODULE_REGISTRY.md  (713 Z.)
│   ├── server-development/
│   │   ├── SKILL.md            (431 Z.)
│   │   ├── MODULE_REGISTRY.md  (639 Z.)
│   │   └── databases.md        (38 Z.)
│   └── frontend-development/
│       └── SKILL.md            (918 Z.)
├── agents/                      ← KI-Agenten
│   ├── Readme.md               (134 Z.)
│   ├── esp32-debug.md          (289 Z.)
│   ├── meta-analyst.md         (251 Z.)
│   ├── db-inspector.md         (178 Z.)
│   ├── system-control.md       (143 Z.)
│   ├── esp32/
│   │   └── ESP32_DEV_AGENT.md  (464 Z.)
│   ├── server/
│   │   ├── SERVER_DEBUG_AGENT.md (366 Z.)
│   │   └── server_dev_agent.md (551 Z.)
│   ├── mqtt/
│   │   ├── MQTT_DEBUG_AGENT.md (528 Z.)
│   │   └── mqtt_dev_agent.md   (611 Z.)
│   └── System_Operators/
│       ├── System-Control.md   (264 Z.)
│       └── DB-Inspector.md     (161 Z.)
├── reference/                   ← Referenz-Dokumentation
│   ├── api/
│   │   ├── MQTT_TOPICS.md      (1059 Z.)
│   │   ├── REST_ENDPOINTS.md   (1032 Z.)
│   │   └── WEBSOCKET_EVENTS.md (1034 Z.)
│   ├── errors/
│   │   └── ERROR_CODES.md      (972 Z.)
│   ├── patterns/
│   │   ├── COMMUNICATION_FLOWS.md (839 Z.)
│   │   └── ARCHITECTURE_DEPENDENCIES.md (480 Z.)
│   ├── debugging/
│   │   ├── LOG_LOCATIONS.md    (741 Z.)
│   │   ├── CI_PIPELINE.md      (363 Z.)
│   │   └── ACCESS_LIMITATIONS.md (318 Z.)
│   └── testing/
│       ├── SYSTEM_OPERATIONS_REFERENCE.md (1279 Z.)
│       └── TEST_WORKFLOW.md    (667 Z.)
├── rules/
│   └── rules.md                (198 Z.)
├── reports/
│   ├── README.md               (68 Z.)
│   ├── current/                ← Aktuelle Reports
│   │   └── AGENT_DUPLICATE_ANALYSIS.md (349 Z.)
│   ├── BugsFound/              ← Bug-Tracking
│   │   ├── Bug_Katalog.md      (296 Z.)
│   │   ├── Esp32_Firmware.md   (212 Z.)
│   │   ├── Server.md           (44 Z.)
│   │   ├── Frontend.md         (44 Z.)
│   │   └── Userbeobachtungen.md (0 Z.)
│   └── archive/                ← 24 Session-Ordner
└── archive/                     ← Backups
    ├── agents_backup_20260202/
    ├── skills_backup_20260202/
    └── reports/
```

---

## 2. Skills

### 2.1 esp32-development (1.077 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| SKILL.md | 364 | ESP32 Firmware-Entwicklung, Build Commands, Workflows |
| MODULE_REGISTRY.md | 713 | API-Dokumentation aller ESP32 Manager-Klassen |

**Sections in SKILL.md:**
- Quick Reference, Build Commands, Initialisierungs-Reihenfolge
- Sensor-Workflow, Actuator-Workflow, MQTT-Patterns
- Safety-Patterns, Error-Handling, Singleton-Pattern
- Regeln, Workflow

**Sections in MODULE_REGISTRY.md:**
- 13 Manager-Klassen (GPIO, Sensor, Actuator, Config, MQTT, Time, Safety, Topic, Error, Health, Circuit, I2C, OneWire)
- Sensor-Registry, IActuatorDriver Interface
- Data Structures, Error-Code Ranges, NVS Keys, QoS Reference

### 2.2 server-development (1.108 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| SKILL.md | 431 | God-Kaiser Server Entwicklung, Python/FastAPI |
| MODULE_REGISTRY.md | 639 | Services API, REST Endpoints, Database Models |
| databases.md | 38 | Datenbank-Übersicht (PostgreSQL, SQLite, NVS) |

**Sections in SKILL.md:**
- Quick Reference, Architektur-Prinzip, Startup-Sequenz
- MQTT Layer, REST API, Database
- Workflow für häufige Aufgaben, Kritische Regeln
- Services Inventar, Scheduler & Jobs
- Referenz-Dokumentation, Workflow

**Sections in MODULE_REGISTRY.md:**
- 10 Haupt-Sections (Services API, MQTT Topics, REST Endpoints, Database Models, Pydantic Schemas, Config-Klassen, Handler-Dateien, Repository Pattern, Sensor Libraries, Error Codes)

### 2.3 frontend-development (918 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| SKILL.md | 918 | El Frontend Vue 3 Dashboard, TypeScript, Pinia |

**Sections in SKILL.md:**
- Quick Reference, Ordnerstruktur (detailliert)
- API-Layer, State Management (Pinia Stores)
- WebSocket-System, Routing
- Utilities, Zone Management
- Mock ESP Architektur, Lifecycle & Cleanup
- Fehlerquellen/Troubleshooting, Dokumentations-Matrix
- KI-Agenten Workflow, Komponenten-Patterns
- Referenz-Dokumentation, Versions-Historie

---

## 3. References

### 3.1 api/ (3.125 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| MQTT_TOPICS.md | 1.059 | Vollständige MQTT Topic-Referenz, Payloads, QoS |
| REST_ENDPOINTS.md | 1.032 | ~170 REST Endpoints, Pydantic Schemas |
| WEBSOCKET_EVENTS.md | 1.034 | Alle WebSocket Events mit Payloads |

### 3.2 errors/ (972 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| ERROR_CODES.md | 972 | ESP32 (1000-4999), Server (5000-5999) Error Codes |

**Sections:** Quick-Lookup, Code-Ranges, ESP32 Hardware/Service/Communication/Application Errors, Server Config/MQTT/Validation/Database/Service/Audit/Sequence Errors, Code-Locations, Synchronisations-Analyse, Troubleshooting, Code-Verwendungs-Matrix

### 3.3 patterns/ (1.319 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| COMMUNICATION_FLOWS.md | 839 | 10 System-Flows (Sensor, Actuator, Emergency, Zone, Config, Heartbeat, Logic Engine, WebSocket, Circuit Breaker, Architektur-Prinzip) |
| ARCHITECTURE_DEPENDENCIES.md | 480 | Core Managers, Dependency Graph, Adding New Components, Common Patterns, Initialization Order, Server-Side Sensor Libraries |

### 3.4 testing/ (1.946 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| SYSTEM_OPERATIONS_REFERENCE.md | 1.279 | Vollständige Befehls-Referenz (DB, Server, REST-API, MQTT, ESP32, Workflows, Troubleshooting, Pfade) |
| TEST_WORKFLOW.md | 667 | Test-Systeme (pytest, Wokwi), Log-System, Error-Codes, Database Tests, CI/CD |

### 3.5 debugging/ (1.422 Zeilen)

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| LOG_LOCATIONS.md | 741 | Alle Log-Quellen (Server, pytest, Wokwi, ESP32, MQTT, GitHub Actions), Multi-Log Capture, Windows-Hinweise |
| CI_PIPELINE.md | 363 | GitHub Actions Workflows, Artifact-System, Troubleshooting |
| ACCESS_LIMITATIONS.md | 318 | KI-Zugriffsbeschränkungen, Workarounds, Kommunikations-Muster |

---

## 4. Agents

### 4.1 Debug-Agents

| Agent | Datei | Zeilen | Primäre Referenzen |
|-------|-------|--------|-------------------|
| esp32-debug | `agents/esp32-debug.md` | 289 | ERROR_CODES, MQTT_TOPICS, COMMUNICATION_FLOWS |
| server-debug | `agents/server/SERVER_DEBUG_AGENT.md` | 366 | ERROR_CODES, MQTT_TOPICS |
| mqtt-debug | `agents/mqtt/MQTT_DEBUG_AGENT.md` | 528 | MQTT_TOPICS, COMMUNICATION_FLOWS |
| meta-analyst | `agents/meta-analyst.md` | 251 | (alle Reports) |

### 4.2 Dev-Agents

| Agent | Datei | Zeilen | Primäre Referenzen |
|-------|-------|--------|-------------------|
| esp32-dev | `agents/esp32/ESP32_DEV_AGENT.md` | 464 | SKILL.md, MODULE_REGISTRY |
| server-dev | `agents/server/server_dev_agent.md` | 551 | COMMUNICATION_FLOWS, ARCHITECTURE, MQTT_TOPICS, REST_ENDPOINTS, ERROR_CODES |
| mqtt-dev | `agents/mqtt/mqtt_dev_agent.md` | 611 | MQTT_TOPICS, COMMUNICATION_FLOWS, ERROR_CODES |

### 4.3 System-Operators

| Agent | Datei | Zeilen | Primäre Referenzen |
|-------|-------|--------|-------------------|
| system-control | `agents/system-control.md` | 143 | SYSTEM_OPERATIONS_REFERENCE |
| db-inspector | `agents/db-inspector.md` | 178 | SYSTEM_OPERATIONS_REFERENCE |
| System-Control (alt) | `agents/System_Operators/System-Control.md` | 264 | SYSTEM_OPERATIONS_REFERENCE |
| DB-Inspector (alt) | `agents/System_Operators/DB-Inspector.md` | 161 | SYSTEM_OPERATIONS_REFERENCE |

---

## 5. Duplikate & Überschneidungen

### 5.1 Dateinamen-Duplikate

| Dateiname | Vorkommen | Status |
|-----------|-----------|--------|
| SKILL.md | 3x (skills/*/SKILL.md) | **OK** - jeder Skill hat eigene |
| MODULE_REGISTRY.md | 2x (esp32, server) | **OK** - unterschiedlicher Inhalt |
| Readme.md / README.md | 3x | **OK** - verschiedene Ordner |
| SERVER_DEBUG_AGENT.md | 1x aktiv + 1x archiv | **OK** - Archiv-Backup |
| MQTT_DEBUG_AGENT.md | 1x aktiv + 1x archiv | **OK** - Archiv-Backup |

### 5.2 Agent-Duplikate (PROBLEM!)

| Aktiv (flach) | Aktiv (Unterordner) | Zeilen | Problem |
|---------------|---------------------|--------|---------|
| `agents/system-control.md` | `agents/System_Operators/System-Control.md` | 143 vs 264 | **DUPLIKAT** |
| `agents/db-inspector.md` | `agents/System_Operators/DB-Inspector.md` | 178 vs 161 | **DUPLIKAT** |

**Empfehlung:** Die Unterordner-Versionen in `System_Operators/` sollten nach `.claude/archive/` verschoben werden, da die flachen Versionen (`system-control.md`, `db-inspector.md`) das aktuelle Format sind.

### 5.3 Report-Duplikate in Archive

| Dateiname | Vorkommen | Grund |
|-----------|-----------|-------|
| ESP32_BOOT_REPORT.md | 2x | Verschiedene Sessions |
| ESP32_CONFIG_REPORT.md | 6x | Verschiedene Sessions |
| SERVER_BOOT_REPORT.md | 3x | Verschiedene Sessions |
| MQTT_BOOT_REPORT.md | 3x | Verschiedene Sessions |

**Status:** Akzeptabel - jede Session hat eigene Reports im Session-Ordner.

---

## 6. Archive-Struktur

### Haupt-Archive

```
.claude/archive/
├── agents_backup_20260202/         ← Alte Agent-Struktur (v2.x)
│   ├── esp32/ESP32_DEBUG_AGENT.md
│   ├── server/SERVER_DEBUG_AGENT.md
│   ├── mqtt/MQTT_DEBUG_AGENT.md
│   ├── Provisioning/PROVISIONING_DEBUG_AGENT.md
│   └── Readme.md
├── skills_backup_20260202/         ← Alte Skill-Struktur
│   ├── esp32/CLAUDE_Esp32.md
│   ├── server/CLAUDE_SERVER.md, Datenbanken.md
│   ├── Frontend/CLAUDE_FRONTEND.md
│   └── README.md
├── reports/                        ← Legacy Reports
│   ├── E2E_BUG_REPORT.md
│   ├── Storage_Manager_API_Audit_Report.md
│   └── Dokustruktur.md
└── SKILL_server_v5.1_backup.md     ← Backup vor Refactoring
```

### Report-Archive (24 Sessions)

```
.claude/reports/archive/
├── 2026-02-01_23-42_test-ohne-server/
├── 2026-02-01_23-44_phase2-test/
├── 2026-02-01_23-46_pid-fix-test/
├── 2026-02-01_23-47_test-mit-server/
├── 2026-02-02_03-24_dry-run-test-1/
├── 2026-02-02_03-26_dry-run-test-3/
├── 2026-02-02_03-37_test-fix/
├── 2026-02-02_03-47_esp32-fulltest/
├── 2026-02-02_05-37_esp32-fulltest/
├── 2026-02-02_05-52_esp32-fulltest/
├── 2026-02-02_15-04_esp32-fulltest/
├── 2026-02-02_16-51_esp32-fulltest/
├── 2026-02-02_19-23_provisioning-test/
├── 2026-02-02_19-29_provisioning-test/
├── 2026-02-02_19-37_provisioning-test/
├── 2026-02-02_20-50_provisioning-test/
├── 2026-02-02_23-24_provisioning-test/
├── 2026-02-03_00-00_provisioning-test/
├── 2026-02-03_00-44_provisioning-test/
├── 2026-02-03_21-13_onewire-e2e-test/
├── 2026-02-03_22-26_onewire-e2e-test/
├── 2026-02-03_23-26_onewire-e2e-test/
└── 2026-02-04_07-37_verification-reports/
```

**Namenskonvention:** `YYYY-MM-DD_HH-MM_session-name/`

---

## 7. Referenz-Matrix

### Welcher Agent nutzt welche Referenz?

| Agent | SKILL | MODULE_REG | MQTT_TOPICS | REST_ENDPOINTS | ERROR_CODES | COMM_FLOWS | ARCH_DEP | SYS_OPS_REF | LOG_LOC |
|-------|-------|------------|-------------|----------------|-------------|------------|----------|-------------|---------|
| esp32-debug | - | - | ○ | - | ● | ○ | - | - | ○ |
| server-debug | - | - | ○ | - | ● | - | - | - | ○ |
| mqtt-debug | - | - | ● | - | - | ● | - | - | ○ |
| meta-analyst | - | - | - | - | - | - | - | - | ● |
| esp32-dev | ● | ● | ○ | - | ○ | ● | ● | - | - |
| server-dev | ● | ● | ● | ● | ● | ● | ● | - | - |
| mqtt-dev | ○ | - | ● | - | ● | ● | - | - | - |
| system-control | - | - | - | - | - | - | - | ● | - |
| db-inspector | - | - | - | - | - | - | - | ● | - |

**Legende:** ● Primär (explizit referenziert), ○ Sekundär (über Readme), - Nicht verwendet

### Welcher Skill nutzt welche Referenz?

| Skill | MQTT_TOPICS | REST_ENDPOINTS | WS_EVENTS | ERROR_CODES | COMM_FLOWS | TEST_WORKFLOW | LOG_LOC |
|-------|-------------|----------------|-----------|-------------|------------|---------------|---------|
| esp32-development | ○ | - | - | ● | ● | ○ | - |
| server-development | ● | ● | - | ● | ● | ● | - |
| frontend-development | ○ | ● | ● | ● | ● | ○ | ○ |

---

## 8. Empfehlungen

### Sofort beheben (Duplikate)

- [ ] `agents/System_Operators/System-Control.md` → archivieren (Duplikat von `agents/system-control.md`)
- [ ] `agents/System_Operators/DB-Inspector.md` → archivieren (Duplikat von `agents/db-inspector.md`)
- [ ] Nach Archivierung: `agents/System_Operators/` Ordner löschen

### Fehlende Dokumentation

- [ ] **frontend-development/MODULE_REGISTRY.md** fehlt (ESP32 und Server haben je eine)
- [ ] **reference/debugging/LOG_SYSTEM.md** wird in skills/README.md referenziert, existiert aber nicht (LOG_LOCATIONS.md existiert)

### Verbesserungen

- [ ] `reports/BugsFound/Userbeobachtungen.md` ist leer (0 Zeilen) - löschen oder befüllen
- [ ] Archive-Ordner `.claude/archive/reports/` enthält Legacy-Reports, die nach `reports/archive/legacy/` verschoben werden könnten

### Archiv-Kandidaten

- [ ] Leere Session-Archive prüfen (einige enthalten möglicherweise nur 1-2 Dateien)
- [ ] `archive/skills_backup_20260202/` kann nach erfolgreicher Migration gelöscht werden
- [ ] `archive/agents_backup_20260202/` kann nach Bestätigung der neuen Agent-Struktur gelöscht werden

---

## 9. Zusammenfassung

Die `.claude` Infrastruktur ist gut organisiert mit klarer Trennung:

| Kategorie | Zweck | Wichtigste Dateien |
|-----------|-------|-------------------|
| **Skills** | Entwicklungs-Anleitungen pro Komponente | SKILL.md + MODULE_REGISTRY.md |
| **References** | Technische Referenz-Dokumentation | MQTT_TOPICS, REST_ENDPOINTS, ERROR_CODES, COMMUNICATION_FLOWS |
| **Agents** | KI-Agent-Definitionen (Debug + Dev + Operator) | *-debug.md, *_dev_agent.md, system-control.md |
| **Reports** | Session-basierte Analyse-Reports | current/ (aktiv), archive/ (abgeschlossen) |
| **Archive** | Backups und alte Versionen | agents_backup, skills_backup |

**Hauptproblem:** Agent-Duplikate in `System_Operators/` sollten bereinigt werden.

**Gesamtumfang:** ~18.000 Zeilen aktive Dokumentation in ~54 Dateien.
