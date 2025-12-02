# Claude Documentation Index

> **Zweck:** Zentrale Übersicht aller Claude-Dokumentation für präzise Referenzierung  
> **Für KI-Agenten:** Diese README zeigt, welche Datei für welche Aufgabe verwendet werden muss

---

## 🎯 HAUPTDOKUMENTATIONEN (MUSS LESEN)

### ESP32 Firmware (El Trabajante)

**📄 `CLAUDE.md`** (Root-Verzeichnis) - ⭐ **HAUPTDOKUMENTATION ESP32**

**Verwenden für:**
- ✅ ESP32 Code-Änderungen
- ✅ ESP32 Build/Test-Workflows
- ✅ ESP32 Architektur-Verständnis
- ✅ ESP32 Modul-Navigation
- ✅ ESP32 KI-Agenten Workflow

**Enthält:**
- Quick Decision Tree
- Modul-Dokumentation Navigation
- KI-Agenten Workflow (ESP32-spezifisch)
- Test-Philosophie
- MQTT-Protokoll-Kurzreferenz
- Safety-Constraints
- Fehlercode-Referenz

**Verweise auf:**
- `El Trabajante/docs/API_REFERENCE.md` - API-Details
- `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT-Spezifikation
- `El Trabajante/docs/system-flows/` - System-Flows
- `El Servador/docs/ESP32_TESTING.md` - ESP32 Tests

---

### God-Kaiser Server (El Servador)

**📄 `.claude/commands/CLAUDE_SERVER.md`** - ⭐ **HAUPTDOKUMENTATION SERVER**

**Verwenden für:**
- ✅ Server Code-Änderungen
- ✅ Server Build/Test-Workflows
- ✅ Server Architektur-Verständnis
- ✅ Server Modul-Navigation
- ✅ Server KI-Agenten Workflow

**Enthält:**
- Quick Decision Tree (Server-spezifisch)
- Modul-Dokumentation Navigation (Server)
- KI-Agenten Workflow (Server-spezifisch)
- Kritische Dateien pro Aufgabentyp
- MQTT Topic-Referenz (Server-Perspektive)
- Database Schema
- Coding Standards
- Entwickler-Workflows
- Implementierungs-Status

**Verweise auf:**
- `El Servador/docs/ESP32_TESTING.md` - ESP32 Tests
- `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT-Spezifikation
- `El Servador/god_kaiser_server/src/` - Source Code

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

**⚠️ HINWEIS:** Für aktuelle Server-Dokumentation siehe `.claude/commands/CLAUDE_SERVER.md`

---

## 🗂️ COMMANDS-ORDNER

**Location:** `.claude/commands/`

**Zweck:** Vorgefertigte Cursor-Commands für häufige Aufgaben

| Command | Beschreibung | Hauptdokumentation |
|---------|--------------|-------------------|
| **`CLAUDE_SERVER.md`** | ⭐ Server-Hauptdokumentation | Vollständige Server-Referenz |
| **`full-test.md`** | ⭐ Kompletter Test-Workflow | ESP32 + Server Tests |
| **`esp-build.md`** | ESP32 Build-Command | Build-Workflows |
| **`esp-test.md`** | ESP32 Test-Command (Kurz) | Verweist auf `/full-test` |
| **`esp-test-category.md`** | Legacy PlatformIO Tests | Legacy Test-Kategorien |
| **`server-test.md`** | Server-Test-Command (Kurz) | Verweist auf `/full-test` |

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
1. **Erste Anlaufstelle:** `.claude/commands/CLAUDE_SERVER.md` - Section 0: Quick Decision Tree
2. **Modul finden:** `CLAUDE_SERVER.md` Section 12: Modul-Dokumentation Navigation
3. **Workflow folgen:** `CLAUDE_SERVER.md` Section 13: KI-Agenten Workflow
4. **Aufgabentyp:** `CLAUDE_SERVER.md` Section 3: Kritische Dateien pro Aufgabentyp

#### 🧪 "Ich will Tests ausführen"

**Kompletter Test-Workflow:**
1. **Hauptdatei:** `.claude/commands/full-test.md` - Kompletter Workflow
2. **ESP32 Tests:** `El Servador/docs/ESP32_TESTING.md` - Vollständige Dokumentation
3. **Server Tests:** `.claude/commands/CLAUDE_SERVER.md` Section 7.2

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
1. **Build-Fehler:** `.claude/commands/CLAUDE_SERVER.md` Section 7.1
2. **Test-Fehler:** `.claude/commands/full-test.md` Section "Bei Fehlern"
3. **Runtime-Fehler:** `CLAUDE_SERVER.md` Section 10: Häufige Fehler
4. **MQTT-Problem:** `El Trabajante/docs/Mqtt_Protocoll.md` + `CLAUDE_SERVER.md` Section 4
5. **Database-Fehler:** `CLAUDE_SERVER.md` Section 7.4

#### 📖 "Ich will verstehen wie X funktioniert"

**ESP32:**
1. **System-Flow:** `El Trabajante/docs/system-flows/`
2. **MQTT-Protokoll:** `El Trabajante/docs/Mqtt_Protocoll.md`
3. **API einer Klasse:** `El Trabajante/docs/API_REFERENCE.md`
4. **Modul-Abhängigkeiten:** `.claude/ARCHITECTURE_DEPENDENCIES.md`

**Server:**
1. **System-Flow:** `El Trabajante/docs/system-flows/` (gilt für beide)
2. **MQTT-Protokoll:** `El Trabajante/docs/Mqtt_Protocoll.md` + `CLAUDE_SERVER.md` Section 4
3. **API-Endpunkte:** `CLAUDE_SERVER.md` Section 3.2
4. **Architektur:** `CLAUDE_SERVER.md` Section 1-2

#### ➕ "Ich will neues Feature hinzufügen"

**ESP32 Feature:**
1. **Sensor:** `CLAUDE.md` Section 12 (Pi-Enhanced) oder `.claude/WORKFLOW_PATTERNS.md`
2. **Aktor:** `.claude/WORKFLOW_PATTERNS.md` Section 1
3. **MQTT-Topic:** `CLAUDE.md` Section 10, Schritt 6
4. **Error-Code:** `El Trabajante/src/models/error_codes.h`
5. **Test:** `CLAUDE.md` Section 3.2 (Dual-Mode-Pattern)

**Server Feature:**
1. **Sensor-Library:** `CLAUDE_SERVER.md` Section 3.1
2. **API-Endpoint:** `CLAUDE_SERVER.md` Section 3.2
3. **MQTT-Handler:** `CLAUDE_SERVER.md` Section 3.3
4. **Database-Model:** `CLAUDE_SERVER.md` Section 3.4
5. **Automation-Rule:** `CLAUDE_SERVER.md` Section 3.5
6. **Test:** `El Servador/docs/ESP32_TESTING.md`

---

## 📋 DOKUMENTATIONS-HIERARCHIE

```
ROOT-LEVEL
├── CLAUDE.md ⭐ ESP32 Hauptdokumentation
│   └── Verweist auf: El Trabajante/docs/, .claude/WORKFLOW_PATTERNS.md
│
└── .claude/
    ├── README.md (DIESE DATEI) ⭐ Dokumentations-Index
    │
    ├── commands/
    │   ├── CLAUDE_SERVER.md ⭐ Server Hauptdokumentation
    │   ├── full-test.md ⭐ Kompletter Test-Workflow
    │   ├── esp-test.md (Kurz, verweist auf full-test.md)
    │   ├── server-test.md (Kurz, verweist auf full-test.md)
    │   ├── esp-test-category.md (Legacy PlatformIO)
    │   └── esp-build.md (Build-Commands)
    │
    ├── WORKFLOW_PATTERNS.md (ESP32 Development Workflows)
    ├── ARCHITECTURE_DEPENDENCIES.md (ESP32 Dependencies)
    ├── TEST_WORKFLOW.md (Legacy PlatformIO Tests)
    └── PI_SERVER_REFACTORING.md (Legacy Server Refactoring)
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
   - Server Code? → `.claude/commands/CLAUDE_SERVER.md`
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

---

## 🎯 SCHNELLREFERENZ FÜR CLAUDE

### Bei ESP32-Aufgaben:
1. **Erste Anlaufstelle:** `CLAUDE.md` (Root)
2. **Workflow:** `CLAUDE.md` Section 10
3. **Patterns:** `.claude/WORKFLOW_PATTERNS.md`
4. **Tests:** `/full-test` oder `El Servador/docs/ESP32_TESTING.md`

### Bei Server-Aufgaben:
1. **Erste Anlaufstelle:** `.claude/commands/CLAUDE_SERVER.md`
2. **Workflow:** `CLAUDE_SERVER.md` Section 13
3. **Aufgabentyp:** `CLAUDE_SERVER.md` Section 3
4. **Tests:** `/full-test` oder `CLAUDE_SERVER.md` Section 7.2

### Bei Test-Aufgaben:
1. **Kompletter Workflow:** `.claude/commands/full-test.md`
2. **ESP32 Tests:** `El Servador/docs/ESP32_TESTING.md`
3. **Server Tests:** `.claude/commands/CLAUDE_SERVER.md` Section 7.2

---

**Letzte Aktualisierung:** 2025-01  
**Version:** 2.0 (Konsolidiert mit neuen Hauptdokumentationen und Test-Struktur)
