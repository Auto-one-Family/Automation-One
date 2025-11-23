---
description: Kompletter Test-Workflow für ESP32 + Server
---

# Full System Test

Führe einen kompletten Test-Durchlauf für beide Hauptkomponenten aus.

## Aufgabe

### 1. ESP32 Tests (El Trabajante)

```bash
cd "El Trabajante"

# Build-Check für beide Environments
echo "🔨 Building XIAO ESP32-C3..."
pio run -e seeed_xiao_esp32c3

echo "🔨 Building ESP32 Dev..."
pio run -e esp32_dev

# Unit Tests
echo "🧪 Running ESP32 Tests..."
pio test
```

**Ergebnisse:**
- Build Status (beide Environments)
- Binary-Größen und Flash-Auslastung
- Test-Ergebnisse (passed/failed)
- Memory-Leaks (falls erkannt)

### 2. Server Tests (El Servador)

```bash
cd "El Servador"

# Code Quality Checks
echo "🔍 Code Quality Check..."
poetry run black --check god_kaiser_server/
poetry run ruff check god_kaiser_server/

# Unit Tests mit Coverage
echo "🧪 Running Python Tests..."
poetry run pytest -v --cov=god_kaiser_server --cov-report=term-missing

# Integration Tests
echo "🔗 Running Integration Tests..."
poetry run pytest tests/integration/ -v
```

**Ergebnisse:**
- Code-Style (Black, Ruff)
- Test Coverage (Target: >85%)
- Unit Test Results
- Integration Test Results

### 3. Cross-Component Validation

**MQTT Topic Kompatibilität:**
- Vergleiche ESP32 Topic-Schemas mit Server-Handlern
- Prüfe ob alle Topics auf beiden Seiten implementiert sind
- Validiere Payload-Strukturen (JSON-Schemas)

**Payload Schema Validation:**
- ESP32 Sensor Data Format ↔ Server Sensor Handler
- Server Actuator Commands ↔ ESP32 Actuator Parser
- Health Status Messages ↔ Health Monitor

**Prüfungen:**
```bash
# Topics im ESP32 Code
grep -r "kaiser/god/esp" "El Trabajante/src/"

# Topics im Server Code
grep -r "kaiser/god/esp" "El Servador/god_kaiser_server/src/mqtt/"
```

### 4. Dokumentations-Konsistenz

Prüfe ob Dokumentation aktuell ist:
- `CLAUDE.md` - Projekt-Übersicht
- `Roadmap.md` - Entwicklungsstand
- `MQTT_Protocoll.md` - Topic-Schemas
- System Flows - Aktuell?

### 5. Zusammenfassung

**Report-Format:**
```
====================================
FULL SYSTEM TEST REPORT
====================================

ESP32 BUILDS:
✅ XIAO ESP32-C3: 523KB / 1.2MB Flash (43%)
✅ ESP32 Dev: 687KB / 3.0MB Flash (22%)

ESP32 TESTS:
✅ 24/24 tests passed

SERVER TESTS:
✅ 156/156 tests passed
✅ Coverage: 87.3%

CODE QUALITY:
✅ Black: All files formatted
✅ Ruff: No issues

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

## Bei Fehlern

1. **Kategorisiere Fehler:**
   - Build-Fehler (ESP32)
   - Test-Fehler (Unit/Integration)
   - Schema-Inkonsistenzen
   - Dokumentations-Lücken

2. **Priorisiere Fixes:**
   - CRITICAL: Build-Fehler, Test-Failures
   - HIGH: Schema-Inkonsistenzen
   - MEDIUM: Code-Style, Coverage-Gaps
   - LOW: Doku-Updates

3. **Erstelle Action-Plan:**
   - Welche Dateien müssen geändert werden?
   - Welche Tests müssen angepasst werden?
   - Welche Dokumentation aktualisieren?

## Empfohlene Nutzung

**Vor jedem Commit:**
```bash
/full-test
```

**Vor Pull Request:**
```bash
/full-test
# Bei PASS: PR erstellen
# Bei FAIL: Fixes durchführen
```

**Nach größeren Refactorings:**
```bash
/full-test
# Prüfe ob alles noch kompatibel ist
```
