# Claude Documentation Index

> **Zweck:** Zentrale Übersicht aller Claude-Dokumentation für präzise Referenzierung

---

## 📚 Dokumentations-Struktur

### 🎯 Hauptdokumente (nach Themengebiet)

| Datei | Themengebiet | Wann nutzen |
|-------|--------------|-------------|
| **PI_SERVER_REFACTORING.md** | Pi-Server Refactoring | Komplette Command-Spezifikation für Server-Umbau von Monolith zu modularer FastAPI-Architektur |
| **WORKFLOW_PATTERNS.md** | ESP32 Development Workflows | Step-by-Step Anleitungen (Actuator/Sensor hinzufügen, Testing-Pattern) |
| **ARCHITECTURE_DEPENDENCIES.md** | ESP32 Architektur-Abhängigkeiten | Modul-Abhängigkeiten verstehen, Singleton-Pattern, Initialization-Order |
| **TEST_WORKFLOW.md** | Test-Workflows | Test-Ausführung, Test-Kategorien, CI/CD-Integration |

---

## 🗂️ Themen-Zuordnung

### Pi-Server (El Servador)
**Zuständige Datei:** `PI_SERVER_REFACTORING.md`

**Inhalt:**
- ✅ MQTT-Protokoll-Konformität (Topics, Message-Formate, QoS)
- ✅ Server-Centric Architektur (Pi-Enhanced Sensor Processing)
- ✅ Architektur-Transformation (Monolith → Modular)
- ✅ API-Design (REST + WebSocket)
- ✅ Kommunikationsmuster (Sensor-Reading, Actuator-Command, Config)
- ✅ Fehlerbehandlung & Ausfallsicherheit
- ✅ Datenbank-Schema (SQLAlchemy Models)
- ✅ Testing-Strategie (Unit, Integration, ESP32-Mocks, E2E)
- ✅ Code-Qualität & Best Practices
- ✅ 6-Phasen Migrations-Strategie
- ✅ Kommunikations-Matrix (HTTP/MQTT/WebSocket-Flows)
- ✅ Prioritäts-System (🔴 Kritisch, 🟡 Hoch, 🟢 Mittel)
- ✅ Detaillierte Dateistruktur-Übersicht

**Quell-Referenzen:**
- `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT-Topics
- `El Trabajante/docs/System_Overview.md` - Server-Centric Architektur
- `El Servador/pi_server_ALT/GOD_KAISER_SERVER_IMPLEMENTIERUNGS_PLAN.md` - Alter Plan
- `El Servador/pi_server_ALT/GOD_KAISER_SERVER_TEIL_2_REST_API_UND_MEHR.md` - API-Spec

---

### ESP32 Firmware (El Trabajante)

#### Development Workflows
**Zuständige Datei:** `WORKFLOW_PATTERNS.md`

**Inhalt:**
- ✅ Adding New Actuator Driver (Step-by-Step)
- ✅ Adding New Sensor Type (Pi-Enhanced Mode)
- ✅ Test Development Pattern (Dual-Mode + RAII)
- ✅ GPIO Conflict Debugging
- ✅ Common Pitfalls (Do's and Don'ts)

**Quell-Referenzen:**
- `El Trabajante/src/services/actuator/actuator_manager.cpp` - Factory Pattern
- `El Trabajante/test/test_sensor_manager.cpp` - Test-Pattern

---

#### Architektur-Abhängigkeiten
**Zuständige Datei:** `ARCHITECTURE_DEPENDENCIES.md`

**Inhalt:**
- ✅ Core Managers (SensorManager, ActuatorManager, ConfigManager)
- ✅ Dependency Graph (Singleton-Hierarchie)
- ✅ Adding New Components (Driver, Manager, Service)
- ✅ Common Patterns (Singleton Access, Factory, RAII)
- ✅ Initialization Order (MainLoop)

**Quell-Referenzen:**
- `El Trabajante/src/services/sensor/sensor_manager.h` - Dependencies
- `El Trabajante/src/services/actuator/actuator_manager.h` - Driver Pattern
- `El Trabajante/src/core/main_loop.cpp` - Initialization Order

---

#### Test-Workflows
**Zuständige Datei:** `TEST_WORKFLOW.md`

**Inhalt:**
- ✅ Übersicht: Zwei Test-Systeme (Server pytest + Legacy PlatformIO)
- ✅ Server-Tests Quickstart (Verweis auf `El Servador/docs/ESP32_TESTING.md`)
- ✅ Legacy PlatformIO Test-Kategorien (archiviert)
- ✅ Test-Ausführung mit Script (`run-test-category.ps1`)
- ✅ Output-Analyse (Unity-Format)
- ✅ Troubleshooting

**Quell-Referenzen:**
- `El Servador/docs/ESP32_TESTING.md` - **VOLLSTÄNDIGE Server-Test-Dokumentation**
- `El Trabajante/test/_archive/README.md` - Legacy Tests Migration
- `El Trabajante/scripts/run-test-category.ps1` - PlatformIO Test-Runner

---

## 🚀 Verwendungs-Richtlinien

### Für Claude: Welche Datei referenzieren?

**Szenario: Neuer Actuator-Driver hinzufügen (ESP32)**
→ Nutze: `WORKFLOW_PATTERNS.md` (Section: "Adding New Actuator Driver")

**Szenario: Pi-Server MQTT-Handler implementieren**
→ Nutze: `PI_SERVER_REFACTORING.md` (Section: "Phase 4: Communication Layer")

**Szenario: Dependency-Graph verstehen (ESP32)**
→ Nutze: `ARCHITECTURE_DEPENDENCIES.md` (Section: "Dependency Graph")

**Szenario: Server-Tests ausführen (pytest)**
→ Nutze: `El Servador/docs/ESP32_TESTING.md` (vollständige Dokumentation)

**Szenario: Legacy PlatformIO Tests verwalten**
→ Nutze: `TEST_WORKFLOW.md` (Section: "Legacy PlatformIO Tests")

**Szenario: Neuen Sensor-Type hinzufügen (Server-Side)**
→ Nutze: `WORKFLOW_PATTERNS.md` (Section: "Adding New Sensor Type") + `PI_SERVER_REFACTORING.md` (Section: "Sensor Processing")

---

## 📁 Commands-Ordner

**Location:** `.claude/commands/`

**Inhalt:** Vorgefertigte Cursor-Commands für häufige Aufgaben

| Command | Beschreibung |
|---------|--------------|
| `esp-build.md` | ESP32 Build-Command |
| `esp-test.md` | ESP32 Test-Command (alle Tests) |
| `esp-test-category.md` | ESP32 Test-Command (spezifische Kategorie) |
| `full-test.md` | Vollständige Test-Suite (ESP + Server) |
| `server-test.md` | Server-Test-Command |

---

## 🔄 Aktualisierungs-Workflow

**Regel:** Jede Datei deckt EIN Themengebiet ab. Keine Redundanzen.

**Wenn neue Information hinzukommt:**

1. **Identifiziere Themengebiet:**
   - Pi-Server Refactoring? → `PI_SERVER_REFACTORING.md`
   - ESP32 Development Workflow? → `WORKFLOW_PATTERNS.md`
   - ESP32 Architektur? → `ARCHITECTURE_DEPENDENCIES.md`
   - Testing? → `TEST_WORKFLOW.md`

2. **Prüfe auf Redundanzen:**
   - Information schon in anderer Datei? → Nicht duplizieren!
   - Information passt zu mehreren Themen? → Wähle primäres Themengebiet

3. **Update ausführen:**
   - Information zur zuständigen Datei hinzufügen
   - **Version-Nummer** erhöhen (am Ende der Datei)
   - **Letzte Aktualisierung** Datum aktualisieren

---

## ✅ Dokumentations-Qualität

**Jede Datei muss:**
- ✅ Präzise Quell-Referenzen enthalten (Datei-Pfade, Line-Numbers)
- ✅ Code-Beispiele verifiziert gegen echten Code
- ✅ Klare Section-Struktur (## Headlines)
- ✅ Version + Aktualisierungs-Datum am Ende
- ✅ Kein Copy-Paste aus anderen Dateien (Redundanz vermeiden)

---

---

## 📋 Gelöschte Redundanzen

**Entfernt am 2025-11-26:**
- ❌ `El Servador/god_kaiser_server/docs/TESTING.md` - Fast leer, alle Infos in `ESP32_TESTING.md`

**Konsolidiert:**
- ✅ `TEST_WORKFLOW.md` - Entrümpelt, verweist auf `ESP32_TESTING.md` für Server-Tests
- ✅ `El Servador/docs/ESP32_TESTING.md` - Einzige vollständige Server-Test-Dokumentation
- ✅ `El Trabajante/test/_archive/README.md` - Legacy Tests Referenz (behalten)

---

**Letzte Aktualisierung:** 2025-11-26
**Version:** 1.1 (Test-Dokumentation konsolidiert)

