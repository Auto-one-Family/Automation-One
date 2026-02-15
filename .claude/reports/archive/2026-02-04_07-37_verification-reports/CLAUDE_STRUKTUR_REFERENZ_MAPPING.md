# .claude Struktur & Referenz-Mapping

**Erstellt:** 2026-02-04
**Zweck:** Vollständige Übersicht aller Dateien und Agenten-Referenzen

---

## 1. Ordnerstruktur

```
.claude/
├── CLAUDE.md                              1.7K   - Agent-Router (Haupt-Einstiegspunkt)
│
├── agents/                                       - Debug/Operations Agenten
│   ├── Readme.md                          8.0K   - Agenten-Übersicht
│   ├── db-inspector.md                    8.0K   - DB Inspector (Root-Level)
│   ├── esp32-debug.md                    16.0K   - ESP32 Debug (Root-Level)
│   ├── mqtt-debug.md                      8.0K   - MQTT Debug (Root-Level)
│   ├── provisioning-debug.md              8.0K   - Provisioning Debug
│   ├── server_debug.md                    8.0K   - Server Debug (Root-Level)
│   ├── system-control.md                  8.0K   - System Control (Root-Level)
│   │
│   ├── esp32/
│   │   └── ESP32_DEV_AGENT.md            12.0K   - ESP32 Development Agent (erweitert)
│   ├── mqtt/
│   │   └── MQTT_DEBUG_AGENT.md           20.0K   - MQTT Debug Agent (erweitert)
│   ├── server/
│   │   └── SERVER_DEBUG_AGENT.md         16.0K   - Server Debug Agent (erweitert)
│   └── System_Operators/
│       ├── DB-Inspector.md                8.0K   - DB Inspector (Variante)
│       └── System-Control.md              8.0K   - System Control (Variante)
│
├── skills/                                       - Entwicklungs-Skills
│   ├── README.md                          3.4K   - Skills-Übersicht
│   ├── esp32-development/
│   │   ├── SKILL.md                      12.0K   - ESP32 C++ Entwicklung
│   │   └── MODULE_REGISTRY.md            20.0K   - ESP32 API-Referenz
│   ├── server-development/
│   │   ├── SKILL.md                      16.0K   - Python/FastAPI Entwicklung
│   │   ├── MODULE_REGISTRY.md            32.0K   - Server Module Registrierung
│   │   └── databases.md                   4.0K   - Datenbank-Schema
│   └── frontend-development/
│       └── SKILL.md                      32.0K   - Vue 3/TypeScript Frontend
│
├── reference/                                    - Zentrale Dokumentation
│   ├── api/
│   │   ├── MQTT_TOPICS.md                28.0K   - MQTT Topic-Schema
│   │   ├── REST_ENDPOINTS.md             28.0K   - REST-API Dokumentation
│   │   └── WEBSOCKET_EVENTS.md           24.0K   - WebSocket Events
│   ├── errors/
│   │   └── ERROR_CODES.md                36.0K   - Error-Codes (ESP32+Server)
│   ├── debugging/
│   │   ├── LOG_LOCATIONS.md              24.0K   - Log-Dateien und Pfade
│   │   ├── CI_PIPELINE.md                12.0K   - CI/CD-Pipeline
│   │   └── ACCESS_LIMITATIONS.md         12.0K   - Zugriffsbeschränkungen
│   ├── patterns/
│   │   ├── COMMUNICATION_FLOWS.md        44.0K   - Kommunikationsflüsse
│   │   └── ARCHITECTURE_DEPENDENCIES.md  16.0K   - Abhängigkeiten
│   └── testing/
│       ├── SYSTEM_OPERATIONS_REFERENCE.md 32.0K  - Operationen (DB, Server, MQTT)
│       └── TEST_WORKFLOW.md              24.0K   - Test-Workflow
│
├── reports/                                      - Test-Berichte
│   ├── README.md
│   ├── current/                                  - 13 aktuelle Reports
│   │   ├── SHT31_FLOW_ANALYSIS.md        69.0K
│   │   ├── ESP32_MODULE_ANALYSIS_REPORT.md
│   │   ├── Server_Codebase_Analyse.md
│   │   └── ... (10 weitere)
│   ├── archive/                                  - 23 Test-Sessions
│   │   ├── 2026-02-01_23-42_test-ohne-server/
│   │   ├── ... bis ...
│   │   └── 2026-02-03_23-26_onewire-e2e-test/
│   └── BugsFound/
│       ├── Bug_Katalog.md                11.0K
│       ├── Esp32_Firmware.md              6.9K
│       ├── Server.md                      0.9K
│       ├── Frontend.md                    0.9K
│       └── Userbeobachtungen.md           0.0K   - (leer)
│
├── rules/
│   └── rules.md                           6.0K   - Entwicklungsregeln
│
├── archive/                                      - Historische Backups
│   ├── agents_backup_20260202/                   - Agent-Backups
│   ├── skills_backup_20260202/                   - Skill-Backups
│   ├── reports/                                  - Alte Reports
│   └── SKILL_server_v5.1_backup.md       54.0K   - Server-Skill v5.1
│
└── settings.json                          2.3K   - Konfiguration
```

---

## 2. Agenten-Inventar

### 2.1 esp32-debug

**Pfad (Root):** `.claude/agents/esp32-debug.md` (16K)
**Pfad (Erweitert):** `.claude/agents/esp32/ESP32_DEV_AGENT.md` (12K)
**YAML-Name:** `esp32-debug`
**Tools:** `Read, Grep, Glob`

**Referenzierte Dateien:**

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Input | `logs/current/STATUS.md` | ❌ FEHLT |
| Input | `logs/current/esp32_serial.log` | ❌ FEHLT |
| Output | `.claude/reports/current/ESP32_[MODUS]_REPORT.md` | - |
| Reference | `.claude/reference/errors/ERROR_CODES.md` | ✅ |
| Reference | `.claude/reference/api/MQTT_TOPICS.md` | ✅ |
| Skill | `.claude/skills/esp32-development/SKILL.md` | ✅ |
| Skill | `.claude/skills/esp32-development/MODULE_REGISTRY.md` | ✅ |

### 2.2 server-debug

**Pfad (Root):** `.claude/agents/server_debug.md` (8K)
**Pfad (Erweitert):** `.claude/agents/server/SERVER_DEBUG_AGENT.md` (16K)
**YAML-Name:** `server-debug`
**Tools:** `Read, Grep, Glob`

**Referenzierte Dateien:**

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Input | `logs/current/STATUS.md` | ❌ FEHLT |
| Input | `logs/current/god_kaiser.log` | ❌ FEHLT |
| Fallback | `El Servador/god_kaiser_server/logs/god_kaiser.log` | ✅ |
| Output | `.claude/reports/current/SERVER_[MODUS]_REPORT.md` | - |
| Reference | `.claude/reference/errors/ERROR_CODES.md` | ✅ |
| Reference | `.claude/reference/debugging/LOG_LOCATIONS.md` | ✅ |
| Skill | `.claude/skills/server-development/SKILL.md` | ✅ |

### 2.3 mqtt-debug

**Pfad (Root):** `.claude/agents/mqtt-debug.md` (8K)
**Pfad (Erweitert):** `.claude/agents/mqtt/MQTT_DEBUG_AGENT.md` (20K)
**YAML-Name:** `mqtt-debug`
**Tools:** `Read, Grep, Glob`

**Referenzierte Dateien:**

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Input | `logs/current/STATUS.md` | ❌ FEHLT |
| Input | `logs/current/mqtt_traffic.log` | ❌ FEHLT |
| Output | `.claude/reports/current/MQTT_[MODUS]_REPORT.md` | - |
| Reference | `.claude/reference/api/MQTT_TOPICS.md` | ✅ |
| Reference | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | ✅ |

### 2.4 provisioning-debug

**Pfad:** `.claude/agents/provisioning-debug.md` (8K)
**YAML-Name:** `provisioning-debug`
**Tools:** `Read, Grep, Glob`

**Referenzierte Dateien:**

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Input | `logs/current/STATUS.md` | ❌ FEHLT |
| Input | `logs/current/esp32_serial.log` | ❌ FEHLT |
| Input | `logs/current/mqtt_traffic.log` | ❌ FEHLT |
| Input | `logs/current/god_kaiser.log` | ❌ FEHLT |
| Fallback | `El Servador/god_kaiser_server/logs/god_kaiser.log` | ✅ |
| Output | `.claude/reports/current/[PROVISIONING]_REPORT.md` | - |
| Reference | `.claude/reference/errors/ERROR_CODES.md` | ✅ |

### 2.5 db-inspector

**Pfad (Root):** `.claude/agents/db-inspector.md` (8K)
**Pfad (Variante):** `.claude/agents/System_Operators/DB-Inspector.md` (8K)
**YAML-Name:** `db-inspector`
**Tools:** `Read, Bash, Grep, Glob`

**Referenzierte Dateien:**

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Reference | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | ✅ |
| Database | `El Servador/god_kaiser_server/god_kaiser_dev.db` | ✅ |

### 2.6 system-control

**Pfad (Root):** `.claude/agents/system-control.md` (8K)
**Pfad (Variante):** `.claude/agents/System_Operators/System-Control.md` (8K)
**YAML-Name:** `system-control`
**Tools:** `Read, Bash, Grep, Glob`

**Referenzierte Dateien:**

| Typ | Pfad | Existiert |
|-----|------|-----------|
| Reference | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | ✅ |
| Log | `El Servador/god_kaiser_server/logs/god_kaiser.log` | ✅ |
| Output | `.claude/reports/current/[DEBUG]_REPORT.md` | - |

---

## 3. Reference-Dateien Inventar

| Pfad | Größe | Referenziert von |
|------|-------|------------------|
| `.claude/reference/errors/ERROR_CODES.md` | 36K | esp32-debug, server-debug, provisioning-debug |
| `.claude/reference/api/MQTT_TOPICS.md` | 28K | esp32-debug, mqtt-debug |
| `.claude/reference/api/REST_ENDPOINTS.md` | 28K | server-debug |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | 24K | (nicht direkt referenziert) |
| `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | 44K | mqtt-debug |
| `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | 16K | (nicht direkt referenziert) |
| `.claude/reference/debugging/LOG_LOCATIONS.md` | 24K | server-debug |
| `.claude/reference/debugging/CI_PIPELINE.md` | 12K | (nicht direkt referenziert) |
| `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | 12K | (nicht direkt referenziert) |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | 32K | db-inspector, system-control |
| `.claude/reference/testing/TEST_WORKFLOW.md` | 24K | (nicht direkt referenziert) |

---

## 4. Skills-Dateien Inventar

| Pfad | Größe | Referenziert von |
|------|-------|------------------|
| `.claude/skills/esp32-development/SKILL.md` | 12K | esp32-debug |
| `.claude/skills/esp32-development/MODULE_REGISTRY.md` | 20K | esp32-debug |
| `.claude/skills/server-development/SKILL.md` | 16K | server-debug |
| `.claude/skills/server-development/MODULE_REGISTRY.md` | 32K | (nicht direkt von Agenten) |
| `.claude/skills/server-development/databases.md` | 4K | (nicht direkt von Agenten) |
| `.claude/skills/frontend-development/SKILL.md` | 32K | (kein dedizierter Agent) |

---

## 5. Logs-Verzeichnis (außerhalb .claude)

**Pfad:** `logs/`

| Pfad | Typ | Existiert | Referenziert von |
|------|-----|-----------|------------------|
| `logs/` | Ordner | ✅ | - |
| `logs/current/` | Ordner | ✅ (LEER!) | alle Debug-Agenten |
| `logs/current/STATUS.md` | Datei | ❌ FEHLT | esp32, server, mqtt, provisioning |
| `logs/current/esp32_serial.log` | Datei | ❌ FEHLT | esp32-debug, provisioning-debug |
| `logs/current/god_kaiser.log` | Symlink | ❌ FEHLT | server-debug, provisioning-debug |
| `logs/current/mqtt_traffic.log` | Datei | ❌ FEHLT | mqtt-debug, provisioning-debug |
| `logs/archive/` | Ordner | ✅ | - |
| `logs/god_kaiser.log` | Datei | ✅ (26K) | (alte Version im Root) |
| `logs/README.md` | Datei | ✅ | - |

---

## 6. Inkonsistenzen & Fehlende Dateien

### 6.1 KRITISCH: Fehlende Log-Dateien

**Das `logs/current/` Verzeichnis ist LEER!**

| Erwarteter Pfad | Referenziert von | Status |
|-----------------|------------------|--------|
| `logs/current/STATUS.md` | ALLE Debug-Agenten | ❌ FEHLT |
| `logs/current/esp32_serial.log` | esp32-debug, provisioning | ❌ FEHLT |
| `logs/current/god_kaiser.log` | server-debug, provisioning | ❌ FEHLT |
| `logs/current/mqtt_traffic.log` | mqtt-debug, provisioning | ❌ FEHLT |

**Auswirkung:** Alle Debug-Agenten können NICHT wie vorgesehen arbeiten, da ihre primären Input-Dateien fehlen.

### 6.2 Doppelte Agent-Definitionen

Es existieren Agent-Definitionen in zwei Locations:

| Agent | Root-Level | Unterordner |
|-------|------------|-------------|
| esp32-debug | `.claude/agents/esp32-debug.md` | `.claude/agents/esp32/ESP32_DEV_AGENT.md` |
| server-debug | `.claude/agents/server_debug.md` | `.claude/agents/server/SERVER_DEBUG_AGENT.md` |
| mqtt-debug | `.claude/agents/mqtt-debug.md` | `.claude/agents/mqtt/MQTT_DEBUG_AGENT.md` |
| db-inspector | `.claude/agents/db-inspector.md` | `.claude/agents/System_Operators/DB-Inspector.md` |
| system-control | `.claude/agents/system-control.md` | `.claude/agents/System_Operators/System-Control.md` |

**Problem:** Unklar welche Version die "offizielle" ist. Root-Level hat YAML-Frontmatter für Claude Code, Unterordner sind detailliertere Varianten.

### 6.3 Nicht referenzierte Reference-Dateien

| Datei | Beschreibung |
|-------|--------------|
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | Keine Agent-Referenz |
| `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | Keine Agent-Referenz |
| `.claude/reference/debugging/CI_PIPELINE.md` | Keine Agent-Referenz |
| `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | Keine Agent-Referenz |
| `.claude/reference/testing/TEST_WORKFLOW.md` | Keine Agent-Referenz |

### 6.4 Namensinkonsistenz

| Datei | Problem |
|-------|---------|
| `.claude/agents/server_debug.md` | Unterstrich statt Bindestrich (snake_case vs kebab-case) |

Alle anderen Agenten verwenden kebab-case: `esp32-debug.md`, `mqtt-debug.md`, etc.

### 6.5 Leere/Placeholder-Dateien

| Datei | Status |
|-------|--------|
| `.claude/reports/BugsFound/Userbeobachtungen.md` | 0 Bytes (leer) |
| `.claude/archive/claude_esp32_archive.md` | 0 Bytes (leer) |
| `.claude/archive/claude_server_archive.md` | 0 Bytes (leer) |
| `.claude/archive/Claude_Frontend_Archive.md` | 0 Bytes (leer) |

---

## 7. Cross-Reference Matrix

### Welcher Agent liest welche Reference?

| Reference-Datei | esp32 | server | mqtt | prov | db | sys |
|-----------------|:-----:|:------:|:----:|:----:|:--:|:---:|
| ERROR_CODES.md | ✅ | ✅ | - | ✅ | - | - |
| MQTT_TOPICS.md | ✅ | - | ✅ | - | - | - |
| REST_ENDPOINTS.md | - | ✅ | - | - | - | - |
| WEBSOCKET_EVENTS.md | - | - | - | - | - | - |
| COMMUNICATION_FLOWS.md | - | - | ✅ | - | - | - |
| ARCHITECTURE_DEPS.md | - | - | - | - | - | - |
| LOG_LOCATIONS.md | - | ✅ | - | - | - | - |
| SYSTEM_OPS_REF.md | - | - | - | - | ✅ | ✅ |
| TEST_WORKFLOW.md | - | - | - | - | - | - |

### Welcher Agent liest welchen Skill?

| Skill-Datei | esp32 | server | mqtt | prov | db | sys |
|-------------|:-----:|:------:|:----:|:----:|:--:|:---:|
| esp32-dev/SKILL.md | ✅ | - | - | - | - | - |
| esp32-dev/MODULE_REGISTRY.md | ✅ | - | - | - | - | - |
| server-dev/SKILL.md | - | ✅ | - | - | - | - |
| server-dev/MODULE_REGISTRY.md | - | - | - | - | - | - |
| frontend-dev/SKILL.md | - | - | - | - | - | - |

---

## 8. Empfehlungen

### 8.1 KRITISCH: Log-Infrastruktur aufbauen

Die Debug-Agenten sind aktuell nicht funktionsfähig. Benötigt werden:

1. **`logs/current/STATUS.md`** - Template erstellen:
   ```markdown
   # Debug Session Status

   **Datum:** YYYY-MM-DD HH:MM
   **Test-Modus:** [boot|config|live|provisioning|e2e]
   **Hardware:** ESP32 MAC: XX:XX:XX:XX:XX:XX
   **Erwartete Patterns:** [...]
   ```

2. **Symlink-Setup** für `god_kaiser.log`:
   ```bash
   cd logs/current
   ln -s "../../El Servador/god_kaiser_server/logs/god_kaiser.log" god_kaiser.log
   ```

3. **Log-Capture-Skripte** für:
   - `esp32_serial.log` (PlatformIO Serial Monitor Output)
   - `mqtt_traffic.log` (mosquitto_sub -v Output)

### 8.2 Agent-Konsolidierung

**Option A:** Root-Level als primär definieren, Unterordner löschen
**Option B:** Unterordner als erweiterte Dokumentation beibehalten, aber klar kennzeichnen

### 8.3 Namenskonvention vereinheitlichen

`server_debug.md` → `server-debug.md` (kebab-case wie alle anderen)

### 8.4 Leere Dateien aufräumen

Entweder mit Inhalt füllen oder löschen:
- `.claude/reports/BugsFound/Userbeobachtungen.md`
- `.claude/archive/claude_*_archive.md`

### 8.5 Nicht referenzierte References prüfen

Entscheiden ob diese Dateien:
- Von Agenten referenziert werden sollten
- Nur für manuelle Nutzung gedacht sind
- Veraltet und zu archivieren sind

---

## 9. Statistik

| Metrik | Wert |
|--------|------|
| **Gesamt .md-Dateien** | 120+ |
| **Agenten (Root-Level)** | 6 |
| **Agenten (Unterordner)** | 5 |
| **Reference-Dateien** | 11 |
| **Skills-Dateien** | 7 |
| **Rules-Dateien** | 1 |
| **Reports (current)** | 13 |
| **Reports (archive)** | 50+ |
| **Größte Datei** | `SHT31_FLOW_ANALYSIS.md` (69K) |
| **Größte Reference** | `COMMUNICATION_FLOWS.md` (44K) |
| **Fehlendes** | 4 Log-Dateien in `logs/current/` |

---

*Report generiert: 2026-02-04*
