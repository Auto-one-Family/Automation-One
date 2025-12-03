---
description: Kompletter Test-Workflow für ESP32 + Server (EMPFOHLEN)
---

# Full System Test - Kompletter Test-Workflow

> **Empfohlene Test-Dokumentation** - Führt alle Tests für ESP32 und Server aus

**Vollständige Dokumentation:**
- **ESP32 Tests:** `El Servador/docs/ESP32_TESTING.md` (Server-orchestriert, ~140 Tests)
- **Integration Tests:** `tests/integration/test_server_esp32_integration.py` (34 Tests) - NEU 2025-12-03
- **Server Tests:** Siehe Section 2 unten
- **Legacy PlatformIO Tests:** `.claude/commands/esp32/test-category.md` (archiviert)

---

## Übersicht: Zwei Test-Systeme

### 1. Server-Orchestrierte ESP32 Tests (EMPFOHLEN) ✅

**Location:** `El Servador/god_kaiser_server/tests/esp32/`  
**Framework:** pytest (Python)  
**Status:** ✅ Produktionsreif  
**Tests:** ~140 Tests (Communication, Infrastructure, Actuator, Sensor, Integration, Cross-ESP, Performance)

**Vorteile:**
- ✅ Hardware-unabhängig (MockESP32Client)
- ✅ Schnell (~140 Tests in <10s)
- ✅ CI/CD-ready
- ✅ Keine PlatformIO Build-Zeit

**Vollständige Dokumentation:** `El Servador/docs/ESP32_TESTING.md`

### 2. Legacy PlatformIO Tests (ARCHIVIERT) ⚠️

**Location:** `El Trabajante/test/_archive/`
**Framework:** Unity (C++)
**Status:** Archiviert (PlatformIO-Linker-Probleme)
**Dokumentation:** `.claude/commands/esp32/test-category.md`, `El Trabajante/test/_archive/README.md`

---

## 1. ESP32 Tests (Server-orchestriert) ✅

### Schnellstart

```bash
cd "El Servador"
poetry install
poetry run pytest god_kaiser_server/tests/esp32/ -v
```

### Test-Kategorien (~140 Tests)

| Kategorie | Anzahl | Beschreibung | Datei |
|-----------|--------|--------------|-------|
| **Communication** | ~20 | MQTT Connectivity, Ping/Pong, Response Times | `test_communication.py` |
| **Infrastructure** | ~30 | Config Management, Topics, System Status | `test_infrastructure.py` |
| **Actuator** | ~40 | Digital/PWM Control, Emergency Stop | `test_actuator.py` |
| **Sensor** | ~30 | Sensor Reading, Pi-Enhanced Processing | `test_sensor.py` |
| **Integration** | ~20 | Full System Workflows, End-to-End | `test_integration.py` |
| **Cross-ESP** | ~15 | Multi-Device Orchestration | `test_cross_esp.py` |
| **Performance** | ~15 | Load Testing, Throughput | `test_performance.py` |

**GESAMT: ~140 Tests**

### Spezifische Test-Kategorie ausführen

```bash
cd "El Servador"

# Communication Tests
poetry run pytest god_kaiser_server/tests/esp32/test_communication.py -v

# Infrastructure Tests
poetry run pytest god_kaiser_server/tests/esp32/test_infrastructure.py -v

# Actuator Tests
poetry run pytest god_kaiser_server/tests/esp32/test_actuator.py -v

# Sensor Tests
poetry run pytest god_kaiser_server/tests/esp32/test_sensor.py -v

# Integration Tests
poetry run pytest god_kaiser_server/tests/esp32/test_integration.py -v

# Cross-ESP Tests
poetry run pytest god_kaiser_server/tests/esp32/test_cross_esp.py -v

# Performance Tests
poetry run pytest god_kaiser_server/tests/esp32/test_performance.py -v
```

### Mit Coverage

```bash
cd "El Servador"
poetry run pytest god_kaiser_server/tests/esp32/ --cov=god_kaiser_server/tests/esp32/mocks --cov-report=html
# Coverage-Report: htmlcov/index.html
```

### ESP32 Firmware Build-Check (optional)

Nach ESP32-Code-Änderungen sollte auch die Firmware kompilieren:

```bash
cd "El Trabajante"

# Build für XIAO ESP32-C3
~/.platformio/penv/Scripts/platformio.exe run -e seeed_xiao_esp32c3

# Build für ESP32 Dev
~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev
```

**Ergebnisse:**
- Binary-Größen und Flash-Auslastung
- Build-Status (beide Environments)
- Kompilierungs-Fehler

---

## 2. Server Tests (Python) ✅

### Schnellstart

```bash
cd "El Servador"
poetry install
poetry run pytest -v --tb=short
```

### Test-Typen

| Typ | Location | Tests | Beschreibung |
|-----|----------|-------|--------------|
| **Unit Tests** | `tests/unit/` | ~20 | Isolierte Komponenten-Tests (Repositories, Services, Core) |
| **Integration Tests** | `tests/integration/` | **34** | Handler-Tests mit ESP32-Payloads (NEU 2025-12-03) |
| **E2E Tests** | `tests/e2e/` | ~5 | End-to-End (benötigt laufenden Server) |
| **ESP32 Tests** | `tests/esp32/` | ~100 | Server-orchestrierte ESP32-Tests (siehe Section 1) |

### Handler Integration Tests (NEU)

**Location:** `tests/integration/test_server_esp32_integration.py`

```bash
cd "El Servador/god_kaiser_server"
python -m pytest tests/integration/test_server_esp32_integration.py -v --no-cov
```

**Test-Klassen:** TopicParsing, SensorHandler, ActuatorHandler, HeartbeatHandler, PiEnhanced, CompleteWorkflows

### Mit Coverage

```bash
cd "El Servador"
poetry run pytest --cov=god_kaiser_server --cov-report=term-missing --cov-report=html
```

**Coverage-Ziele:**
- **Minimum:** 70% Coverage
- **Target:** 85% Coverage
- **Critical Modules:** 90%+ (core, services, mqtt)

### Code-Quality-Checks

```bash
cd "El Servador"

# Formatierung prüfen
poetry run black --check god_kaiser_server/

# Formatierung anwenden
poetry run black god_kaiser_server/

# Linting
poetry run ruff check god_kaiser_server/

# Type-Checking (optional)
poetry run mypy god_kaiser_server/
```

---

## 3. Cross-Component Validation

### MQTT Topic Kompatibilität

Vergleiche ESP32 Topic-Schemas mit Server-Handlern:

```bash
# Topics im ESP32 Code
grep -r "kaiser/god/esp" "El Trabajante/src/"

# Topics im Server Code
grep -r "kaiser/god/esp" "El Servador/god_kaiser_server/src/mqtt/"
```

**Prüfungen:**
- Alle Topics auf beiden Seiten implementiert?
- Payload-Strukturen kompatibel?
- QoS-Levels konsistent?

### Payload Schema Validation

**Vergleiche:**
- ESP32 Sensor Data Format ↔ Server Sensor Handler
- Server Actuator Commands ↔ ESP32 Actuator Parser
- Health Status Messages ↔ Health Monitor

**Referenzen:**
- `El Trabajante/docs/Mqtt_Protocoll.md` - Vollständige MQTT-Spezifikation
- `El Servador/docs/MQTT_TEST_PROTOCOL.md` - MQTT Test Command-Spezifikation

---

## 4. Dokumentations-Konsistenz

Prüfe ob Dokumentation aktuell ist:

- ✅ `CLAUDE.md` - Projekt-Übersicht
- ✅ `CLAUDE_SERVER.md` - Server-Dokumentation
- ✅ `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT Topic-Schemas
- ✅ `El Trabajante/docs/system-flows/` - System Flows
- ✅ `El Servador/docs/ESP32_TESTING.md` - ESP32 Test-Dokumentation

---

## 5. Zusammenfassung & Report-Format

**Vollständiger Test-Report:**

```
====================================
FULL SYSTEM TEST REPORT
====================================

ESP32 BUILDS:
✅ XIAO ESP32-C3: 523KB / 1.2MB Flash (43%)
✅ ESP32 Dev: 687KB / 3.0MB Flash (22%)

ESP32 TESTS (Server-orchestriert):
✅ 140/140 tests passed
✅ Coverage: 85.2%

SERVER TESTS:
✅ 170+/170+ tests passed
✅ Coverage: 87.3%
✅ Unit Tests: ~20/20 passed
✅ Handler Integration Tests: 34/34 passed (NEU 2025-12-03)
✅ ESP32 Mock Tests: ~100/100 passed
✅ E2E Tests: ~5/5 passed

CODE QUALITY:
✅ Black: All files formatted
✅ Ruff: No issues
✅ MyPy: No type errors

CROSS-COMPONENT:
✅ MQTT Topics: Compatible
✅ Payload Schemas: Valid
⚠️  Warning: 2 deprecated topics found

DOCUMENTATION:
✅ All docs up-to-date

====================================
OVERALL: ✅ PASS
====================================
```

---

## Bei Fehlern

### 1. Kategorisiere Fehler

- **Build-Fehler (ESP32):** Kompilierungs-Errors, Linker-Probleme
- **Test-Fehler (Unit/Integration):** Assertion-Failures, Import-Errors
- **Schema-Inkonsistenzen:** MQTT Topic/Payload-Mismatches
- **Dokumentations-Lücken:** Veraltete oder fehlende Docs

### 2. Priorisiere Fixes

- **CRITICAL:** Build-Fehler, Test-Failures
- **HIGH:** Schema-Inkonsistenzen
- **MEDIUM:** Code-Style, Coverage-Gaps
- **LOW:** Doku-Updates

### 3. Erstelle Action-Plan

- Welche Dateien müssen geändert werden?
- Welche Tests müssen angepasst werden?
- Welche Dokumentation aktualisieren?

### Häufige Probleme

**ESP32 Tests:**
- Import-Errors: `poetry install`
- Fixture-Errors: Check `conftest.py`
- Assertion-Failures: Verifiziere MQTT-Protokoll

**Server Tests:**
- Database-Errors: Prüfe Alembic-Migrations
- Import-Errors: Prüfe PYTHONPATH
- Coverage-Lücken: Fehlende Tests schreiben

**Cross-Component:**
- Topic-Mismatches: Prüfe `Mqtt_Protocoll.md`
- Payload-Inkonsistenzen: Vergleiche JSON-Schemas

---

## Empfohlene Nutzung

### Vor jedem Commit

```bash
/full-test
# Bei allen Tests grün: Commit OK
# Bei Fehlern: Fixen und erneut testen
```

### Vor Pull Request

```bash
/full-test
# Bei PASS: PR erstellen
# Bei FAIL: Fixes durchführen
```

### Nach größeren Refactorings

```bash
/full-test
# Prüfe ob alles noch kompatibel ist
# Validiere Cross-Component-Kompatibilität
```

### Nach ESP32-Firmware-Änderungen

```bash
/full-test
# Prüfe ob MQTT-Protokoll noch kompatibel ist
# Validiere Build-Status
```

### Nach Server-Änderungen (MQTT-Handler)

```bash
/full-test
# Verifiziere dass ESP32-Kommunikation noch funktioniert
# Prüfe Cross-ESP-Tests
```

---

## Related Documentation

### Hauptdokumentation

- **ESP32 Testing Guide:** `El Servador/docs/ESP32_TESTING.md` - Vollständige ESP32 Test-Dokumentation
- **MQTT Test Protocol:** `El Servador/docs/MQTT_TEST_PROTOCOL.md` - MQTT Command-Spezifikation
- **MQTT Protocol Spec:** `El Trabajante/docs/Mqtt_Protocoll.md` - Vollständige MQTT-Spezifikation

### Weitere Ressourcen

- **Test Workflow:** `.claude/TEST_WORKFLOW.md` - Detaillierter PlatformIO Test-Workflow (Legacy)
- **Legacy PlatformIO Tests:** `.claude/commands/esp32/test-category.md` - Legacy Test-Kategorien
- **ESP32 Build:** `.claude/commands/esp32/build.md` - Build-Commands
- **Server Build:** `.claude/CLAUDE_SERVER.md` Section 7 - Server-Workflows

---

**Letzte Aktualisierung:** 2025-12-03  
**Version:** 2.1 (Mit Handler Integration Tests)
