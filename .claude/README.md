# Claude Documentation Index

> **Zweck:** Zentrale Übersicht aller Claude-Dokumentation für präzise Referenzierung  
> **Für KI-Agenten:** Diese README zeigt, welche Datei für welche Aufgabe verwendet werden muss

---

## 🎯 HAUPTDOKUMENTATIONEN (MUSS LESEN)

### ESP32 Firmware (El Trabajante)

**📄 `CLAUDE.md`** (Root-Verzeichnis) - ⭐ **HAUPTDOKUMENTATION ESP32** (v4.3)

**Verwenden für:**
- ✅ ESP32 Code-Änderungen
- ✅ ESP32 Build/Test-Workflows
- ✅ ESP32 Architektur-Verständnis
- ✅ ESP32 Modul-Navigation
- ✅ ESP32 KI-Agenten Workflow
- ✅ Server-Integration-Verständnis

**Enthält:**
- Quick Decision Tree
- Modul-Dokumentation Navigation
- KI-Agenten Workflow (ESP32-spezifisch)
- Test-Philosophie
- MQTT-Protokoll-Kurzreferenz
- Safety-Constraints
- Fehlercode-Referenz
- **NEU:** Section 11.1 - Server-Integration Verhaltensregeln für ESP32-Code
  - MQTT-Topic-Konventionen
  - Payload-Struktur
  - Device-Registration (kein Auto-Discovery)
  - Safety-Constraints (Server-seitig)
  - Pi-Enhanced-Processing-Integration
  - Logic-Engine-Integration

**Verweise auf:**
- `El Trabajante/docs/API_REFERENCE.md` - API-Details
- `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT-Spezifikation
- `El Trabajante/docs/system-flows/` - System-Flows
- `El Servador/docs/ESP32_TESTING.md` - ESP32 Tests
- `.claude/CLAUDE_SERVER.md` - Server-Dokumentation (Cross-Referenzen)

---

### God-Kaiser Server (El Servador)

**📄 `.claude/CLAUDE_SERVER.md`** - ⭐ **HAUPTDOKUMENTATION SERVER** (v3.0)

**Verwenden für:**
- ✅ Server Code-Änderungen
- ✅ Server Build/Test-Workflows
- ✅ Server Architektur-Verständnis
- ✅ Server Modul-Navigation
- ✅ Server KI-Agenten Workflow
- ✅ MQTT-Handler-Implementierung
- ✅ Sensor-Library-Erstellung
- ✅ Automation-Rule-Implementierung

**Enthält:**
- Quick Decision Tree (Server-spezifisch)
- Server-Startup-Sequenz (detailliert mit Code-Locations)
- Modul-Dokumentation Navigation (Server)
- KI-Agenten Workflow (Server-spezifisch)
- Kritische Dateien pro Aufgabentyp (Section 3)
- MQTT Topic-Referenz (Server-Perspektive) mit QoS-Levels
- MQTT-Architektur-Details (Subscriber, Publisher, Client)
- Database Schema & Migration
- Coding Standards
- Entwickler-Workflows
- Implementierungs-Status
- **NEU:** Detaillierte Abläufe (Section 18): Sensor-Daten, Actuator-Commands, Logic-Engine, Heartbeat

**Verweise auf:**
- `El Servador/docs/ESP32_TESTING.md` - ESP32 Tests
- `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT-Spezifikation
- `El Servador/god_kaiser_server/src/` - Source Code
- `.claude/CLAUDE.md` - ESP32-Firmware-Dokumentation (Cross-Referenzen)

---

## 🧪 TEST-DOKUMENTATIONEN

### Haupt-Test-Dokumentation

**📄 `.claude/commands/full-test.md`** - ⭐ **EMPFOHLEN: Kompletter Test-Workflow**

**Verwenden für:**
- ✅ Komplette Test-Suite (ESP32 + Server)
- ✅ Cross-Component Validation
- ✅ Test-Report-Format
- ✅ Troubleshooting

**Enthält:**
- ESP32 Tests (Server-orchestriert, ~140 Tests)
- Server Tests (Python, Unit/Integration/E2E)
- **Integration Tests (34 Tests, 2025-12-03)** - Handler-Tests mit echten ESP32-Payloads
- Cross-Component Validation (MQTT Topics, Payloads)
- Dokumentations-Konsistenz-Prüfung
- Report-Format
- Fehler-Kategorisierung

**Verweise auf:**
- `El Servador/docs/ESP32_TESTING.md` - Vollständige ESP32 Test-Dokumentation
- `El Servador/docs/MQTT_TEST_PROTOCOL.md` - MQTT Command-Spezifikation

### Weitere Test-Dokumentationen

| Datei | Zweck | Wann verwenden |
|-------|-------|----------------|
| **`.claude/commands/esp-test.md`** | ESP32 Tests (Kurz) | Schnellstart für ESP32-Tests |
| **`.claude/commands/server-test.md`** | Server Tests (Kurz) | Schnellstart für Server-Tests |
| **`.claude/commands/esp-test-category.md`** | Legacy PlatformIO Tests | Nur für Legacy PlatformIO Tests |
| **`.claude/TEST_WORKFLOW.md`** | Detaillierter PlatformIO Workflow | Legacy PlatformIO Test-Details |

**⚠️ HINWEIS:** Alle Test-Dokumentationen verweisen auf `/full-test` für vollständige Informationen.

---

## 📚 WEITERE DOKUMENTATIONEN

### ESP32 Development Workflows

**📄 `.claude/WORKFLOW_PATTERNS.md`**

**Verwenden für:**
- ✅ Neuen Actuator-Driver hinzufügen
- ✅ Neuen Sensor-Type hinzufügen (Pi-Enhanced)
- ✅ Test-Patterns (Dual-Mode, RAII)
- ✅ GPIO Conflict Debugging

**Enthält:**
- Step-by-Step Anleitungen
- Code-Beispiele (verifiziert gegen echten Code)
- Common Pitfalls

---

### ESP32 Architektur-Abhängigkeiten

**📄 `.claude/ARCHITECTURE_DEPENDENCIES.md`**

**Verwenden für:**
- ✅ Dependency-Graph verstehen
- ✅ Singleton-Pattern verstehen
- ✅ Initialization-Order verstehen
- ✅ Neue Komponenten hinzufügen

**Enthält:**
- Core Managers Dependencies
- Singleton-Hierarchie
- Common Patterns
- Initialization Order

---

### Pi-Server Refactoring (Legacy)

**📄 `.claude/PI_SERVER_REFACTORING.md`**

**Verwenden für:**
- ✅ Historische Referenz (Server-Refactoring)
- ✅ Migrations-Strategie verstehen
- ✅ Architektur-Transformation verstehen

**⚠️ HINWEIS:** Für aktuelle Server-Dokumentation siehe `.claude/CLAUDE_SERVER.md` (v3.0)

---

## 🗂️ COMMANDS-ORDNER

**Location:** `.claude/commands/`

**Zweck:** Vorgefertigte Cursor-Commands für häufige Aufgaben

| Command | Beschreibung | Hauptdokumentation |
|---------|--------------|-------------------|
| **`full-test.md`** | ⭐ Kompletter Test-Workflow | ESP32 + Server Tests |
| **`esp-build.md`** | ESP32 Build-Command | Build-Workflows |
| **`esp-test.md`** | ESP32 Test-Command (Kurz) | Verweist auf `/full-test` |
| **`esp-test-category.md`** | Legacy PlatformIO Tests | Legacy Test-Kategorien |
| **`server-test.md`** | Server-Test-Command (Kurz) | Verweist auf `/full-test` |

**Hinweis:** `CLAUDE_SERVER.md` befindet sich jetzt direkt in `.claude/` (nicht in `commands/`)

---

## 🚀 VERWENDUNGS-RICHTLINIEN FÜR CLAUDE

### Entscheidungsbaum: Welche Datei verwenden?

#### 🔧 "Ich will Code ändern"

**ESP32 Code:**
1. **Erste Anlaufstelle:** `CLAUDE.md` (Root) - Section 0: Quick Decision Tree
2. **Modul finden:** `CLAUDE.md` Section 9: Modul-Dokumentation Navigation
3. **Workflow folgen:** `CLAUDE.md` Section 10: KI-Agenten Workflow
4. **Pattern-Beispiele:** `.claude/WORKFLOW_PATTERNS.md`

**Server Code:**
1. **Erste Anlaufstelle:** `.claude/CLAUDE_SERVER.md` - Section 0: Quick Decision Tree
2. **Startup verstehen:** `CLAUDE_SERVER.md` Section 2: Server-Startup-Sequenz
3. **Modul finden:** `CLAUDE_SERVER.md` Section 12: Modul-Dokumentation Navigation
4. **Workflow folgen:** `CLAUDE_SERVER.md` Section 13: KI-Agenten Workflow
5. **Aufgabentyp:** `CLAUDE_SERVER.md` Section 3: Kritische Dateien pro Aufgabentyp
6. **Abläufe verstehen:** `CLAUDE_SERVER.md` Section 18: Kritische Funktionen & Abläufe
7. **Migration:** `CLAUDE_SERVER.md` Section 7.4: Database Migration

#### 🧪 "Ich will Tests ausführen"

**Kompletter Test-Workflow:**
1. **Hauptdatei:** `.claude/commands/full-test.md` - Kompletter Workflow
2. **ESP32 Tests:** `El Servador/docs/ESP32_TESTING.md` - Vollständige Dokumentation
3. **Server Tests:** `.claude/CLAUDE_SERVER.md` Section 7.2

**Schnellstart:**
- ESP32 Tests: `.claude/commands/esp-test.md`
- Server Tests: `.claude/commands/server-test.md`

#### 🐛 "Ich habe einen Fehler"

**ESP32 Fehler:**
1. **Build-Fehler:** `.claude/commands/esp-build.md` + `platformio.ini`
2. **Test-Fehler:** `.claude/commands/full-test.md` Section "Bei Fehlern"
3. **Runtime-Fehler:** `CLAUDE.md` Section 6: Fehlercode-Referenz
4. **MQTT-Problem:** `El Trabajante/docs/Mqtt_Protocoll.md`
5. **GPIO-Konflikt:** `CLAUDE.md` Section 5.2

**Server Fehler:**
1. **Build-Fehler:** `.claude/CLAUDE_SERVER.md` Section 7.1
2. **Test-Fehler:** `.claude/commands/full-test.md` Section "Bei Fehlern"
3. **Runtime-Fehler:** `.claude/CLAUDE_SERVER.md` Section 10: Häufige Fehler
4. **MQTT-Problem:** `El Trabajante/docs/Mqtt_Protocoll.md` + `.claude/CLAUDE_SERVER.md` Section 4
5. **Database-Fehler:** `.claude/CLAUDE_SERVER.md` Section 7.4

#### 📖 "Ich will verstehen wie X funktioniert"

**ESP32:**
1. **System-Flow:** `El Trabajante/docs/system-flows/`
2. **MQTT-Protokoll:** `El Trabajante/docs/Mqtt_Protocoll.md`
3. **API einer Klasse:** `El Trabajante/docs/API_REFERENCE.md`
4. **Modul-Abhängigkeiten:** `.claude/ARCHITECTURE_DEPENDENCIES.md`

**Server:**
1. **System-Flow:** `El Trabajante/docs/system-flows/` (gilt für beide)
2. **MQTT-Protokoll:** `El Trabajante/docs/Mqtt_Protocoll.md` + `.claude/CLAUDE_SERVER.md` Section 4
3. **MQTT-Architektur:** `.claude/CLAUDE_SERVER.md` Section 4.4 (Subscriber, Publisher, Client)
4. **API-Endpunkte:** `.claude/CLAUDE_SERVER.md` Section 3.2
5. **Architektur:** `.claude/CLAUDE_SERVER.md` Section 1-2
6. **Detaillierte Abläufe:** `.claude/CLAUDE_SERVER.md` Section 18 (Sensor, Actuator, Logic, Heartbeat)

#### ➕ "Ich will neues Feature hinzufügen"

**ESP32 Feature:**
1. **Sensor:** `CLAUDE.md` Section 12 (Pi-Enhanced) oder `.claude/WORKFLOW_PATTERNS.md`
2. **Aktor:** `.claude/WORKFLOW_PATTERNS.md` Section 1
3. **MQTT-Topic:** `CLAUDE.md` Section 10, Schritt 6
4. **Error-Code:** `El Trabajante/src/models/error_codes.h`
5. **Test:** `CLAUDE.md` Section 3.2 (Dual-Mode-Pattern)

**Server Feature:**
1. **Sensor-Library:** `.claude/CLAUDE_SERVER.md` Section 3.1
2. **API-Endpoint:** `.claude/CLAUDE_SERVER.md` Section 3.2
3. **MQTT-Handler:** `.claude/CLAUDE_SERVER.md` Section 3.3 (mit Thread-Pool-Details)
4. **Database-Model:** `.claude/CLAUDE_SERVER.md` Section 3.4
5. **Automation-Rule:** `.claude/CLAUDE_SERVER.md` Section 3.5 (mit Logic-Engine-Flow)
6. **Abläufe verstehen:** `.claude/CLAUDE_SERVER.md` Section 18 (für komplexe Features)
7. **Test:** `El Servador/docs/ESP32_TESTING.md`

---

## 📋 DOKUMENTATIONS-HIERARCHIE

```
ROOT-LEVEL
├── CLAUDE.md ⭐ ESP32 Hauptdokumentation
│   └── Verweist auf: El Trabajante/docs/, .claude/WORKFLOW_PATTERNS.md
│
└── .claude/
    ├── README.md (DIESE DATEI) ⭐ Dokumentations-Index (v3.0)
    ├── CLAUDE_SERVER.md ⭐ Server Hauptdokumentation (v3.0)
    │   └── Enthält: Startup-Sequenz, MQTT-Architektur, Detaillierte Abläufe (Section 18)
    ├── CLAUDE.md ⭐ ESP32 Hauptdokumentation (v4.3)
    │   └── Enthält: Server-Integration Verhaltensregeln (Section 11.1)
    │
    ├── commands/
    │   ├── full-test.md ⭐ Kompletter Test-Workflow
    │   ├── esp32/ (ESP32-spezifische Commands)
    │   ├── server/ (Server-spezifische Commands)
    │   └── integration/ (Integration-Commands)
    │
    ├── WORKFLOW_PATTERNS.md (Development Workflows)
    ├── ARCHITECTURE_DEPENDENCIES.md (ESP32 Dependencies)
    ├── TEST_WORKFLOW.md (Test-Workflow)
    ├── PHASE_3_4_IMPLEMENTATION_PLAN.md (Historisch - Phasen abgeschlossen)
    └── PI_SERVER_REFACTORING.md (Historisch - Refactoring abgeschlossen)

El Servador/
├── god_kaiser_server/
│   ├── tests/integration/
│   │   ├── test_server_esp32_integration.py (34 Tests)
│   │   └── BUGS_FOUND.md (Bug-Dokumentation)
│   ├── alembic/versions/
│   │   └── c6fb9c8567b5_*.py (ActuatorState Migration)
│   └── god_kaiser_dev.db (SQLite Dev-DB)
└── docs/
    ├── ESP32_TESTING.md (v1.1)
    └── ...
```

---

## ✅ QUALITÄTS-CHECKLISTE

**Jede Dokumentation muss:**
- ✅ Präzise Quell-Referenzen enthalten (Datei-Pfade, Line-Numbers)
- ✅ Code-Beispiele verifiziert gegen echten Code
- ✅ Klare Section-Struktur (## Headlines)
- ✅ Version + Aktualisierungs-Datum am Ende
- ✅ Kein Copy-Paste aus anderen Dateien (Redundanz vermeiden)
- ✅ Verweise auf andere relevante Dokumentationen

---

## 🔄 AKTUALISIERUNGS-WORKFLOW

**Regel:** Jede Datei deckt EIN Themengebiet ab. Keine Redundanzen.

**Wenn neue Information hinzukommt:**

1. **Identifiziere Themengebiet:**
   - ESP32 Code? → `CLAUDE.md`
   - Server Code? → `.claude/CLAUDE_SERVER.md`
   - ESP32 Development Workflow? → `.claude/WORKFLOW_PATTERNS.md`
   - ESP32 Architektur? → `.claude/ARCHITECTURE_DEPENDENCIES.md`
   - Testing? → `.claude/commands/full-test.md`
   - Build? → `.claude/commands/esp-build.md`

2. **Prüfe auf Redundanzen:**
   - Information schon in anderer Datei? → Nicht duplizieren!
   - Information passt zu mehreren Themen? → Wähle primäres Themengebiet
   - Verweise auf andere Dokumentationen hinzufügen

3. **Update ausführen:**
   - Information zur zuständigen Datei hinzufügen
   - **Version-Nummer** erhöhen (am Ende der Datei)
   - **Letzte Aktualisierung** Datum aktualisieren
   - Diese README aktualisieren falls nötig

---

## 📋 GELÖSCHTE/KONSOLIDIERTE REDUNDANZEN

**Konsolidiert (2025-01):**
- ✅ Test-Dokumentationen konsolidiert → `/full-test.md` als Hauptdatei
- ✅ `esp-test.md` und `server-test.md` vereinfacht zu kurzen Verweisen
- ✅ `TEST_WORKFLOW.md` aktualisiert mit Verweisen auf `/full-test`
- ✅ `esp-test-category.md` mit Legacy-Hinweis versehen

**Struktur bereinigt:**
- ✅ `El Servador/` Struktur konsolidiert (alembic.ini, pyproject.toml, etc.)
- ✅ `pi_server_ALT/` gelöscht (alter ESP32-Code)
- ✅ Doppelte Dateien entfernt

**Hinzugefügt (2025-12-03):**
- ✅ 34 Integration-Tests für MQTT-Handler
- ✅ Alembic-Migration funktionsfähig (env.py, script.py.mako gefixt)
- ✅ Bug-Fixes dokumentiert in `tests/integration/BUGS_FOUND.md`
- ✅ Database-Migration dokumentiert in `CLAUDE_SERVER.md` Section 7.4

**Aktualisiert (2025-12-08):**
- ✅ `CLAUDE_SERVER.md` auf v3.0 aktualisiert (Startup-Sequenz, MQTT-Architektur, Detaillierte Abläufe)
- ✅ `CLAUDE.md` auf v4.3 aktualisiert (Server-Integration Verhaltensregeln)
- ✅ Cross-Referenzen zwischen ESP32 und Server-Dokumentation verbessert
- ✅ Alle Code-Locations und Abläufe dokumentiert

---

## 🎯 SCHNELLREFERENZ FÜR CLAUDE

### Bei ESP32-Aufgaben:
1. **Erste Anlaufstelle:** `CLAUDE.md` (Root) - Section 0: Quick Reference
2. **Workflow:** `CLAUDE.md` Section 8: KI-Agenten Workflow
3. **Server-Integration:** `CLAUDE.md` Section 11.1: Verhaltensregeln
4. **Patterns:** `.claude/WORKFLOW_PATTERNS.md`
5. **Tests:** `/full-test` oder `El Servador/docs/ESP32_TESTING.md`

### Bei Server-Aufgaben:
1. **Erste Anlaufstelle:** `.claude/CLAUDE_SERVER.md` - Section 0: Quick Decision Tree
2. **Startup verstehen:** `CLAUDE_SERVER.md` Section 2: Server-Startup-Sequenz
3. **Workflow:** `CLAUDE_SERVER.md` Section 13: KI-Agenten Workflow
4. **Aufgabentyp:** `CLAUDE_SERVER.md` Section 3: Kritische Dateien pro Aufgabentyp
5. **Abläufe:** `CLAUDE_SERVER.md` Section 18: Detaillierte Abläufe
6. **Tests:** `/full-test` oder `CLAUDE_SERVER.md` Section 7.2

### Bei Test-Aufgaben:
1. **Kompletter Workflow:** `.claude/commands/full-test.md`
2. **ESP32 Tests:** `El Servador/docs/ESP32_TESTING.md`
3. **Server Tests:** `.claude/CLAUDE_SERVER.md` Section 7.2

### Bei MQTT-Aufgaben:
1. **ESP32-Perspektive:** `CLAUDE.md` Section 4: MQTT-Protokoll
2. **Server-Perspektive:** `CLAUDE_SERVER.md` Section 4: MQTT Topic-Referenz
3. **Vollständige Spezifikation:** `El Trabajante/docs/Mqtt_Protocoll.md`
4. **Architektur:** `CLAUDE_SERVER.md` Section 4.4: MQTT-Architektur-Details

---

**Letzte Aktualisierung:** 2025-12-08  
**Version:** 3.0 (Aktualisiert mit CLAUDE_SERVER.md v3.0, CLAUDE.md v4.3, Cross-Referenzen)
