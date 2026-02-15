# Auftrag: ESP32 Native Unit Test Integration
Datum: 2026-02-11 01:00
**Modus: PLAN** – Erstelle einen vollständigen Implementierungsplan, keine direkte Umsetzung.
**Mehrere Agents können gestartet werden, aber der Plan muss ohne Pause fertig werden.**

---

## Context

### Systemarchitektur
AutomationOne ist ein server-zentrisches IoT-Framework für Gewächshausautomation:
- **El Trabajante (ESP32):** Dumme Agenten. Sensoren lesen, Aktoren steuern, MQTT senden/empfangen.
- **El Servador (FastAPI):** ALLE Business-Logik. MQTT-Handler, DB, API.
- **Kommunikation:** ESP32 ↔ MQTT ↔ Server (kein HTTP nach Provisioning)

### IST-Zustand ESP32 Unit Tests

**KRITISCH: 0% native Test-Coverage.**

**Was existiert:**
- **21 archivierte Unity-Tests** in `El Trabajante/test/_archive/` (nicht kompilierbar wegen fehlender Linking-Config)
- **Archivierungsgrund:** PlatformIO Unity Framework linkt NUR Test-Dateien, NICHT Production-Code → `undefined reference` Errors
- **Lösung war bekannt aber nie umgesetzt:** `test_build_src = true` in platformio.ini
- **165 Wokwi Scenarios** (YAML-basiert, Serial-Log-Validation) – kein Ersatz für Unit Tests
- **~140 Server-orchestrierte pytest-Tests** – testen MQTT-Schnittstelle, nicht Firmware-interne Logik

**platformio.ini Environments (aktuell):**
```ini
[env:seeed_xiao_esp32c3]    # Production (Xiao ESP32C3)
[env:esp32_dev]             # Production (ESP32 Dev Board)
[env:wokwi_simulation]      # Simulation (extends esp32_dev, WOKWI_SIMULATION=1)
```
→ Kein `[env:native]`, kein `[env:esp32dev_test]`, kein `test_build_src`

**Archivierte Tests mit guten Patterns:**
- `infra_topic_builder.cpp` – Pure String-Logic, sofort reaktivierbar
- `actuator_manager.cpp` – Dual-Mode Tests (Production + Virtual), MockMQTTBroker, RAII-Cleanup
- `comm_mqtt_client.cpp`, `infra_config_manager.cpp`, etc. – 21 Files total

**Test-Helpers vorhanden:**
- `test/helpers/mock_mqtt_broker.h`
- `test/helpers/temporary_test_actuator.h`
- Weitere Helper-Header in `test/helpers/`

### Hardware-Abstraction Layer (HAL)

**Nur 1 Interface existiert:**
```
El Trabajante/src/services/actuator/actuator_drivers/iactuator_driver.h
```
→ IActuatorDriver mit Implementierungen: pwm_actuator, pump_actuator, valve_actuator

**Fehlende Interfaces für testbare Architektur:**
- ❌ IGPIODriver (GPIO-Operations)
- ❌ II2CBus (I2C-Operations)
- ❌ IOneWireBus (OneWire-Operations)
- ❌ IStorageManager (NVS-Persistence)
- ❌ IWiFiManager (WiFi-Operations)

**Konsequenz:** Module wie ConfigManager, SensorManager haben harte Hardware-Dependencies → nicht nativ testbar ohne HAL-Interfaces.

### Nativ testbare Module (kein HAL nötig)

| Modul | Pfad | Test-Potential |
|-------|------|---------------|
| **TopicBuilder** | `utils/topic_builder.cpp` | 60+ Tests (20+ Funktionen × 3 Edge-Cases) |
| **StringHelpers** | `utils/string_helpers.cpp` | 20+ Tests |
| **DataBuffer** | `utils/data_buffer.cpp` | 15+ Tests |
| **ErrorCodes** | `models/error_codes.h` | Constants-Validation |
| **SensorRegistry** | `models/sensor_registry.cpp` | Registry-Logic |
| **OnewireUtils** | `utils/onewire_utils.cpp` | CRC-Validation |
| **ConfigResponse** | `services/config/config_response.cpp` | Parsing-Logic |

### Module die HAL-Interfaces brauchen

| Modul | Benötigtes Interface |
|-------|---------------------|
| ConfigManager | IStorageManager (NVS-Mock) |
| CircuitBreaker | ITimeProvider (Time-Mock) |
| SafetyController | IGPIODriver (GPIO-Mock) |
| HealthMonitor | Sensor-Mocks |

### PlatformIO Best Practices (aus Web-Research)

**Standard Test-Ordnerstruktur:**
```
test/
├── test_desktop/       # Native PC-Tests (env:native)
│   ├── test_topic_builder/
│   │   └── test_main.cpp
│   └── test_string_helpers/
│       └── test_main.cpp
├── test_embedded/      # On-Device Tests (env:esp32dev_test)
│   └── test_hardware/
│       └── test_main.cpp
└── test_common/        # Tests die in BEIDEN Environments laufen
    └── test_error_codes/
        └── test_main.cpp
```

**platformio.ini Pattern:**
```ini
[env:native]
platform = native
test_build_src = true
test_ignore = test_embedded
build_flags = -D UNIT_TEST -D NATIVE_TEST
lib_compat_mode = off

[env:esp32dev_test]
extends = env:esp32_dev
test_build_src = true
test_ignore = test_desktop
build_flags =
    ${env:esp32_dev.build_flags}
    -D UNIT_TEST
```

**Key-Insight aus Web-Research:**
- Native Tests brauchen `main()` Funktion (nicht `setup()/loop()`)
- Embedded Tests brauchen `setup()/loop()` (Arduino Framework)
- `#if defined(ESP_PLATFORM)` Guards für Framework-abhängigen Code
- `extern "C"` für Test-Code in C++ Projekten
- `lib_compat_mode = off` für native Tests (umgeht Arduino-Header-Checks)

---

## Focus

**ESP32 Firmware Unit Testing – native (PC) und on-device**

Betroffen:
- `El Trabajante/platformio.ini` (neue Environments)
- `El Trabajante/test/` (neue Test-Struktur)
- `El Trabajante/test/_archive/` (Reaktivierung)
- `El Trabajante/src/` (HAL-Interface-Design, Guards)
- `.github/workflows/` (CI-Integration für native Tests)
- Projekt-Dokumentation (TEST_STRATEGY.md)

---

## Goal

**Einen vollständigen Implementierungsplan erstellen der:**

### Phase 1: Foundation (SOFORT – keine Code-Änderungen an Production)
1. **platformio.ini erweitern** mit `[env:native]` und `[env:esp32dev_test]`
2. **Test-Ordnerstruktur** nach PlatformIO-Standard aufbauen
3. **TopicBuilder-Tests reaktivieren** aus `test/_archive/infra_topic_builder.cpp`
4. **Weitere Pure-Logic-Tests** für StringHelpers, DataBuffer, ErrorCodes, SensorRegistry
5. Verifizieren dass `pio test -e native` erfolgreich läuft

### Phase 2: HAL-Design (nach Phase 1 – Production-Code-Änderungen)
6. **HAL-Interfaces definieren:** IGPIODriver, II2CBus, IOneWireBus, IStorageManager
7. **Mock-Implementierungen** für native Tests
8. **Dependency Injection** in betroffene Manager einbauen (ConfigManager, SafetyController)
9. **Business-Logic-Tests** mit Mocks (ConfigManager, CircuitBreaker)

### Phase 3: CI-Integration
10. **GitHub Actions Workflow** für `pio test -e native`
11. **Coverage-Reporting** (optional: gcov/lcov)
12. **Dokumentation:** TEST_STRATEGY.md mit Architektur-Entscheidungen

### Wichtige Constraints
- **KEINE Business-Logic auf ESP32 hinzufügen** – Server-zentrische Architektur beibehalten
- **Rückwärtskompatibilität:** Bestehende 3 Environments dürfen nicht brechen
- **Bestehende Wokwi-Tests nicht beeinträchtigen**
- **Archivierte Tests als Basis nutzen, nicht blind kopieren** – Patterns übernehmen, an aktuelle Codebase anpassen
- **`#ifdef` Guards:** `UNIT_TEST`, `NATIVE_TEST`, `ESP_PLATFORM` konsistent nutzen
- **Production-Code-Qualität:** Kein Test-Code in Production-Pfaden ohne Guards

### Plan muss enthalten
- Exakte Dateistruktur (welche Files wo)
- platformio.ini Änderungen (vollständig, nicht nur Snippets)
- Prioritierte Test-Liste (welche Tests zuerst, warum)
- HAL-Interface-Signaturen (Header-Files)
- CI-Workflow-Definition
- Risiken und Mitigationen
- Geschätzter Aufwand pro Phase

---

## Success Criterion

1. **Plan ist vollständig und umsetzbar** – ein Dev-Agent kann damit direkt implementieren
2. **platformio.ini Änderungen** sind exakt spezifiziert und rückwärtskompatibel
3. **Mindestens 5 Test-Suites** sind im Plan mit konkreten Test-Cases beschrieben
4. **HAL-Interfaces** haben definierte Signaturen die zum bestehenden Code passen
5. **CI-Integration** ist als GitHub Actions YAML spezifiziert
6. **Keine Widersprüche** zum bestehenden Projekt-Pattern (Naming, Structure, Architecture)
7. **verify-plan kann den Plan gegen die Codebase prüfen**

---

## Relevante Dateien zum Analysieren

| Kategorie | Pfad |
|-----------|------|
| **platformio.ini** | `El Trabajante/platformio.ini` |
| **Archivierte Tests** | `El Trabajante/test/_archive/*.cpp` (alle 21 Files lesen) |
| **Test-Helpers** | `El Trabajante/test/helpers/*.h` |
| **Source Code** (für Testbarkeit) | `El Trabajante/src/utils/*.cpp`, `El Trabajante/src/models/*.cpp` |
| **TopicBuilder** | `El Trabajante/src/utils/topic_builder.h`, `topic_builder.cpp` |
| **Bestehendes Interface** | `El Trabajante/src/services/actuator/actuator_drivers/iactuator_driver.h` |
| **ConfigManager** | `El Trabajante/src/services/config/config_manager.h`, `.cpp` |
| **CircuitBreaker** | `El Trabajante/src/error_handling/circuit_breaker.h`, `.cpp` |
| **Architecture Reference** | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` |
| **Communication Flows** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| **Existing CI** | `.github/workflows/wokwi-tests.yml`, `esp32-tests.yml` |
| **Test Reference** | `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` |

---

## Report zurück an
`.technical-manager/inbox/agent-reports/esp32-native-unit-tests-plan-2026-02-11.md`
