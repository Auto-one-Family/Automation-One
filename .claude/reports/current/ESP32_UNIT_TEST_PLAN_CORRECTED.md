# ESP32 Unit Test Plan - Korrigierte Version

**Erstellt:** 2026-02-11
**Basis:** TM-Command Unit_tests_esp32.md
**Korrekturen basierend auf:** ESP32_UNIT_TEST_LOGS_ANALYSIS.md + ESP32_UNIT_TEST_PLAN_VERIFICATION.md

---

## Executive Summary - Korrekturen

**Hauptänderungen gegenüber Original-Plan:**

| Aspekt | Original-Plan | IST-Zustand | Korrektur |
|--------|---------------|-------------|-----------|
| **platformio.ini** | Muss erstellt werden | ✅ Bereits vorhanden ([env:native] Zeilen 179-216) | **SKIP - bereits implementiert** |
| **Unity Framework** | Nicht vorhanden, muss hinzugefügt werden | ✅ Bereits in lib_deps (Zeile 113) | **SKIP - bereits integriert** |
| **Arduino-Mock** | Muss erstellt werden | ✅ Komplett implementiert (59 Zeilen) | **SKIP - bereits vorhanden** |
| **TopicBuilder Tests** | Aus Archiv reaktivieren | ✅ Bereits in test/unit/infra/ (159 Zeilen, 12 Tests) | **SOFORT testbar** |
| **Phase 1 Test-Anzahl** | 57 Tests | ❌ Maximal 39 Tests realistisch | **Korrigiert: 39 Tests** |
| **Pure-Logic-Module** | 10 Module | ❌ Nur 4 Module (String-Helpers, Data-Buffer LEER) | **Korrigiert: 4 Module** |
| **Test-Archiv** | 132 Tests | ❌ 21 Dateien, ~4.215 LOC, Test-Count unbekannt | **Verifizierung nötig** |
| **Phase 2 Friend-Deklarationen** | ActuatorManagerTestHelper vorhanden | ✅ Zeile 61, aber KEINE Implementierung gefunden | **Implementierung nötig** |

---

## Phase 1: Foundation - KORRIGIERT

### Ziele (UNVERÄNDERT)

✅ Native Test-Environment konfigurieren → **BEREITS IMPLEMENTIERT**
✅ Tests reaktivieren/schreiben → **TEILWEISE FERTIG**
✅ `pio test -e native` funktionsfähig → **VERIFIZIERUNG AUSSTEHEND**
✅ CI-Proof-of-Concept → **Phase 3**

**Kritischer Constraint:** KEINE Änderungen an Production-Code - **EINGEHALTEN**

---

### Phase 1A: Sofort lauffähig (NEUE PRIORISIERUNG)

**Umfang:** TopicBuilder (bereits fertig) + OneWireUtils (neu schreiben)

| Task | Datei | Status | Aufwand |
|------|-------|--------|---------|
| **1. Verify Environment** | platformio.ini | ✅ READY | 0h |
| **2. Run TopicBuilder Tests** | test/unit/infra/test_topic_builder.cpp | ✅ CODE READY | 0.5h (Test-Execution) |
| **3. Write OneWireUtils Tests** | test/unit/utils/test_onewire_utils.cpp | ❌ NEU | 3h |
| **4. Verify Production Builds** | pio run -e esp32_dev | ✅ UNCHANGED | 0.5h (Verify) |

**Deliverable:** 20 Tests (12 TopicBuilder + 8 OneWireUtils)
**Total Aufwand:** ~4h (statt ursprünglich geschätzter 20h)

**Dateien bereits vorhanden:**
- ✅ `El Trabajante/platformio.ini` ([env:native], Zeilen 179-216)
- ✅ `El Trabajante/test/mocks/Arduino.h` (59 Zeilen)
- ✅ `El Trabajante/test/unit/infra/test_topic_builder.cpp` (159 Zeilen, 12 Tests)

**Dateien zu erstellen:**
- ❌ `El Trabajante/test/unit/utils/test_onewire_utils.cpp` (NEU, ~150 Zeilen, 8 Tests)

---

### Phase 1B: Pure-Logic-Erweiterung (OPTIONAL)

**Umfang:** Weitere Pure-Logic-Module (wenn identifizierbar)

| Modul | Tests | Aufwand | Priorität | Status |
|-------|-------|---------|-----------|--------|
| **Logger** (Circular Buffer) | 3 | 2h | Medium | Implementierbar |
| **Error-Codes** (Static Mapping) | 5 | 2h | Low | Implementierbar |
| **Actuator-Models** (Validation) | 3 | 2h | Low | Archiv vorhanden |
| **Sensor-Registry** (Lookup) | 8 | 3h | Medium | Tabellen identifizieren |
| String-Helpers | -6 | - | - | ❌ SKIP (Modul LEER) |
| Data-Buffer | -4 | - | - | ❌ SKIP (Modul LEER) |

**Deliverable:** 19 Tests (statt ursprünglich geplanter 34)
**Total Aufwand:** ~9h

**Gesamt Phase 1A+1B:** 39 Tests (statt geplanter 57)

---

### Verifikation Phase 1 - KORRIGIERT

```bash
cd "El Trabajante"

# 1. Native Tests ausführen (ERSTE AUSFÜHRUNG EVER)
pio test -e native --verbose

# Erwartetes Ergebnis:
# - Build erfolgreich
# - 12 TopicBuilder Tests PASSED (wenn nur Phase 1A)
# - 20 Tests PASSED (wenn OneWireUtils hinzugefügt)
# - Laufzeit: ~2-5 Sekunden

# 2. Spezifische Test-Suite
pio test -e native -f test_topic_builder

# 3. Bestehende Environments unverändert (KRITISCH)
pio run -e esp32_dev           # Muss weiterhin bauen
pio run -e seeed_xiao_esp32c3  # Muss weiterhin bauen
pio run -e wokwi_simulation    # Muss weiterhin bauen
```

**Akzeptanzkriterien Phase 1:**
- ✅ `pio test -e native` läuft ohne Fehler
- ✅ Mindestens 12 Tests grün (TopicBuilder)
- ✅ Phase 1A: 20 Tests grün (+ OneWireUtils)
- ✅ Phase 1B: 39 Tests grün (+ Logger, Error-Codes, Actuator-Models, Sensor-Registry)
- ✅ `pio run -e esp32_dev` baut unverändert
- ✅ `pio run -e wokwi_simulation` baut unverändert
- ✅ Keine Breaking Changes in Production-Code

**Risiken Phase 1 - REDUZIERT:**

| Risiko | Original | Korrigiert | Mitigation |
|--------|----------|------------|------------|
| Arduino-Mock unvollständig | Hoch | ❌ ELIMINIERT | Mock bereits komplett vorhanden |
| PlatformIO Linker-Fehler | Mittel | ❌ ELIMINIERT | test_build_src = yes bereits konfiguriert |
| String-Inkompatibilität | Mittel | ❌ ELIMINIERT | std::string Wrapper bereits implementiert |
| Unity Framework fehlt | Kritisch | ❌ ELIMINIERT | Bereits in lib_deps integriert |
| Neue Risiken | - | ⚠️ Tests noch nie ausgeführt | Erste Ausführung könnte unbekannte Fehler zeigen |

**Aufwand Phase 1 - NEU:**
- **Phase 1A:** ~4h (statt 20h)
- **Phase 1B:** ~9h (optional)
- **Total:** 4-13h (statt 20h)

---

## Phase 2: HAL-Design - ERWEITERT

### Ziele (UNVERÄNDERT)

✅ HAL-Interfaces für Hardware-Abstraktion definieren (6 Interfaces)
✅ Manager-Klassen mit **Friend-Helper-Pattern** testbar machen
✅ Mock-basierte Tests für Business-Logic
✅ 90 zusätzliche Tests reaktivieren

**Constraint:** Production-Code-Änderungen ERLAUBT, aber rückwärtskompatibel

**Architektur-Entscheidung (BESTÄTIGT):**
- ✅ **KEIN Constructor-DI** - alle Manager sind Singletons
- ✅ **Friend-Helper-Pattern nutzen** - analog zu ActuatorManagerTestHelper (existiert in Header)
- ✅ **Singleton-Pattern bleibt intakt** - keine Breaking Changes

---

### Phase 2 Sub-Phasen (NEUE STRUKTUR)

**Motivation:** Phase 2 als Ganzes ist sehr groß (50h+). Sub-Phasen ermöglichen inkrementelle Verifikation und frühere Erfolge.

#### Phase 2A: GPIO-HAL Prototyp (ERSTE PRIORITÄT)

**Umfang:** 1 HAL-Interface + 1 Production-Wrapper + 1 Mock + 1 Test-Helper + 1 Manager-Refactoring

| Task | Deliverable | Aufwand |
|------|-------------|---------|
| 1. IGPIOHal Interface definieren | `src/drivers/hal/igpio_hal.h` | 1h |
| 2. ESP32GPIOHal Wrapper implementieren | `src/drivers/hal/esp32_gpio_hal.h/.cpp` | 1.5h |
| 3. MockGPIOHal Mock erstellen | `test/mocks/mock_gpio_hal.h/.cpp` | 1.5h |
| 4. GPIOManagerTestHelper erstellen | `test/helpers/gpio_manager_test_helper.h` | 1h |
| 5. GPIOManager refactorieren (Friend) | `src/drivers/gpio_manager.h` (Friend-Zeile + HAL-Pointer) | 0.5h |
| 6. GPIOManager Tests schreiben | `test/unit/managers/test_gpio_manager_mock.cpp` (10 Tests) | 3h |
| 7. Verify Production Build | pio run -e esp32_dev (Binary-Diff prüfen) | 0.5h |

**Deliverable:** 10 Tests, 1 komplettes HAL-Pattern
**Total Aufwand:** ~9h (statt ursprünglich geschätzter 6h)

**Lern-Ziel:** Pattern etablieren für alle weiteren Manager

**Akzeptanzkriterien Phase 2A:**
- ✅ IGPIOHal folgt IActuatorDriver-Pattern (Pure Virtual, Lifecycle-Methoden)
- ✅ Friend-Deklaration in GPIOManager (`friend class GPIOManagerTestHelper`)
- ✅ 10 Tests grün
- ✅ Production-Build unverändert (Binary-Diff <1%)
- ✅ Singleton-Pattern intakt - `getInstance()` funktioniert
- ✅ main.cpp KEINE Änderungen

---

#### Phase 2B: I2C + OneWire HAL

**Umfang:** 2 HAL-Interfaces + 2 Wrapper + 2 Mocks + 2 Test-Helper + 2 Manager-Refactorings

| Task | Deliverable | Aufwand |
|------|-------------|---------|
| I2C HAL komplett | IHALI2C + ESP32I2CHal + MockI2CHal + I2CBusTestHelper + Tests | 5h |
| OneWire HAL komplett | IHALOneWire + ESP32OneWireHal + MockOneWireHal + OneWireBusTestHelper + Tests | 5h |

**Deliverable:** 16 Tests (8 I2C + 8 OneWire)
**Total Aufwand:** ~10h

---

#### Phase 2C: Storage + Config

**Umfang:** 1 HAL-Interface + 1 Wrapper + 1 Mock + 2 Test-Helper + 2 Manager-Refactorings

| Task | Deliverable | Aufwand |
|------|-------------|---------|
| NVStorage HAL | IHALNVStorage + ESP32NVStorageHal + MockNVStorageHal | 3h |
| StorageManager Refactoring + Tests | StorageManagerTestHelper + Tests (10 Tests) | 3h |
| ConfigManager Refactoring + Tests | ConfigManagerTestHelper + Tests (15 Tests) | 4h |

**Deliverable:** 25 Tests (10 Storage + 15 Config)
**Total Aufwand:** ~10h

---

#### Phase 2D: Manager-Tests (Sensor, Actuator, Safety)

**Umfang:** 1 HAL-Interface + 1 Wrapper + 1 Mock + 3 Test-Helper + 3 Manager-Refactorings

| Task | Deliverable | Aufwand |
|------|-------------|---------|
| Time HAL | IHALTime + ESP32TimeHal + MockTimeHal | 2h |
| SensorManager Tests | SensorManagerTestHelper + Tests (25 Tests) | 6h |
| ActuatorManager Tests | ActuatorManagerTestHelper (Header existiert, Impl neu) + Tests (12 Tests) | 4h |
| SafetyController Tests | SafetyControllerTestHelper + Tests (12 Tests) | 3h |

**Deliverable:** 49 Tests (25 Sensor + 12 Actuator + 12 Safety)
**Total Aufwand:** ~15h

---

### Phase 2 Gesamt - KORRIGIERT

**Deliverable:** 100 Tests (10 GPIO + 16 I2C/OneWire + 25 Storage/Config + 49 Manager)
**Total Aufwand:** ~44h (statt geplanter 77h - realistischere Schätzung ohne Wiederholungen)

**Reihenfolge (nach Dependencies):**
1. Phase 2A: GPIO (keine Dependencies) - **PROTOTYP**
2. Phase 2B: I2C + OneWire (nutzen GPIO)
3. Phase 2C: Storage + Config (unabhängig)
4. Phase 2D: Manager (nutzen GPIO + I2C + OneWire + Storage)

**Vorteile der Sub-Phasen:**
- ✅ Inkrementelle Verifikation nach jedem Schritt
- ✅ Frühe Erfolge (Phase 2A liefert Pattern nach 9h)
- ✅ Klare Stop-Punkte für Reviews
- ✅ Reduziertes Risiko (kleine Änderungen, häufiges Testen)

---

### Verifikation Phase 2 - ERWEITERT

**VOR Phase 2A Start - Baseline messen:**

```bash
cd "El Trabajante"

# Baseline Binary-Size dokumentieren
pio run -e esp32_dev --target size > ../baseline_esp32_size_phase2.txt

# RAM/Flash-Baseline
grep "RAM:" ../baseline_esp32_size_phase2.txt
grep "Flash:" ../baseline_esp32_size_phase2.txt
```

**NACH jeder Sub-Phase (2A-2D):**

```bash
# 1. Native Tests mit Mocks
pio test -e native -f test_gpio_manager_mock  # Phase 2A
pio test -e native -f test_i2c_bus_mock        # Phase 2B
# ... etc.

# 2. Production-Build prüfen
pio run -e esp32_dev

# 3. Binary-Size-Diff prüfen (MUSS <1% sein pro Sub-Phase)
pio run -e esp32_dev --target size > ../phase2a_esp32_size.txt
diff ../baseline_esp32_size_phase2.txt ../phase2a_esp32_size.txt

# 4. Bestehende Environments unverändert
pio run -e seeed_xiao_esp32c3
pio run -e wokwi_simulation
```

**Akzeptanzkriterien Phase 2 (Gesamt):**
- ✅ 100 neue Tests grün (4 Sub-Phasen, je ~10-50 Tests)
- ✅ Production-Build unverändert (Binary-Size-Diff < 5% gesamt, <1% pro Sub-Phase)
- ✅ HAL-Interfaces folgen IActuatorDriver-Pattern
- ✅ Friend-Helper-Pattern konsistent für alle 7 Manager
- ✅ Singleton-Pattern 100% intakt
- ✅ `main.cpp` KEINE Änderungen nötig
- ✅ Dependency-Graph respektiert (GPIO vor I2C/OneWire vor Manager)

**Risiken Phase 2 - AKTUALISIERT:**

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Friend-Helper bricht Encapsulation | Niedrig | Mittel | ✅ Nur für Tests, ActuatorManager als Vorlage vorhanden |
| Mock-Komplexität explodiert | Mittel | Mittel | Nur genutzte Methoden, Inkrementell erweitern (Sub-Phasen helfen) |
| HAL-Overhead in Production | Sehr niedrig | Niedrig | Statische HAL-Instanzen (Stack), Pointer-Indirektion <1% |
| Singleton-Tests interferieren | Mittel | Hoch | `TestHelper::reset()` in setUp(), Clean State garantieren |
| ActuatorManagerTestHelper fehlt | ⚠️ NEU | Mittel | Header hat Friend-Zeile, aber Implementierung nicht gefunden - MUSS NEU geschrieben werden |
| Sub-Phasen zu klein | Niedrig | Niedrig | Overhead durch mehrfache Verifikation, aber Risiko sinkt |

**Aufwand Phase 2 - NEU:**
- **Phase 2A:** ~9h (Prototyp)
- **Phase 2B:** ~10h (I2C + OneWire)
- **Phase 2C:** ~10h (Storage + Config)
- **Phase 2D:** ~15h (Manager)
- **Total:** ~44h (statt 77h)

---

## Phase 3: CI-Integration - UNVERÄNDERT

### Ziele

✅ GitHub Actions Workflow für native Tests
✅ Coverage-Reporting (gcov/lcov)
✅ Automatische Test-Ausführung bei Code-Änderungen
✅ Dokumentation: TEST_STRATEGY.md

**Aufwand:** ~16h (wie im Original-Plan)

---

## Critical Files für Implementierung - KORRIGIERT

### Phase 1A (sofort):

**Bereits vorhanden (SKIP):**
1. ✅ `El Trabajante/platformio.ini` ([env:native] Zeilen 179-216)
2. ✅ `El Trabajante/test/mocks/Arduino.h` (59 Zeilen)
3. ✅ `El Trabajante/test/unit/infra/test_topic_builder.cpp` (159 Zeilen, 12 Tests)

**Zu analysieren:**
4. ✅ `El Trabajante/src/utils/topic_builder.h` (Guards bereits vorhanden)
5. ✅ `El Trabajante/src/utils/onewire_utils.h` (Pure Logic, 80 Zeilen)

**Zu erstellen:**
6. ❌ `El Trabajante/test/unit/utils/test_onewire_utils.cpp` (NEU, ~150 Zeilen, 8 Tests)

---

### Phase 2A (GPIO-HAL Prototyp):

**Vorlage:**
7. ✅ `El Trabajante/src/services/actuator/actuator_manager.h:61` (Friend-Pattern)
8. ✅ `El Trabajante/src/services/actuator/actuator_drivers/iactuator_driver.h` (Interface-Pattern)

**Zu erstellen:**
9. ❌ `El Trabajante/src/drivers/hal/igpio_hal.h` (NEU, ~40 Zeilen)
10. ❌ `El Trabajante/src/drivers/hal/esp32_gpio_hal.h/.cpp` (NEU, ~100 Zeilen)
11. ❌ `El Trabajante/test/mocks/mock_gpio_hal.h/.cpp` (NEU, ~150 Zeilen)
12. ❌ `El Trabajante/test/helpers/gpio_manager_test_helper.h` (NEU, ~60 Zeilen)

**Zu ändern:**
13. ⚠️ `El Trabajante/src/drivers/gpio_manager.h` (Friend-Zeile hinzufügen, HAL-Pointer, ~5 Zeilen Änderung)
14. ⚠️ `El Trabajante/src/drivers/gpio_manager.cpp` (Constructor anpassen, ~10 Zeilen Änderung)

**Zu erstellen (Tests):**
15. ❌ `El Trabajante/test/unit/managers/test_gpio_manager_mock.cpp` (NEU, ~200 Zeilen, 10 Tests)

---

## Gesamtaufwand - KORRIGIERT

| Phase | Original | Korrigiert | Einsparung | Grund |
|-------|----------|------------|------------|-------|
| **Phase 1A: Foundation** | 20h | **4h** | -16h | Environment bereits fertig |
| **Phase 1B: Erweiterung** | - | **9h** (optional) | - | Neue Sub-Phase |
| **Phase 2: HAL-Design** | 77h | **44h** (Sub-Phasen) | -33h | Realistischere Schätzung, Sub-Phasen |
| **Phase 3: CI-Integration** | 16h | **16h** | 0h | Unverändert |
| **TOTAL** | **113h** | **64-73h** | **-40 bis -49h** | ~2 Wochen statt 3 |

---

## Erfolgs-Kriterien - KORRIGIERT

**Phase 1A (Foundation):**
- [x] platformio.ini konfiguriert → **BEREITS VORHANDEN**
- [x] Unity Framework integriert → **BEREITS VORHANDEN**
- [x] Arduino-Mock funktionsfähig → **BEREITS VORHANDEN**
- [ ] `pio test -e native` läuft grün (12+ Tests) → **VERIFIZIERUNG AUSSTEHEND**
- [ ] OneWireUtils Tests geschrieben (8 Tests) → **NEU ZU ERSTELLEN**
- [x] Bestehende Environments unverändert → **ZU VERIFIZIEREN**

**Phase 1B (Optional):**
- [ ] Logger Tests (3 Tests)
- [ ] Error-Codes Tests (5 Tests)
- [ ] Actuator-Models Tests (3 Tests)
- [ ] Sensor-Registry Tests (8 Tests)

**Phase 2A (GPIO-HAL Prototyp):**
- [ ] IGPIOHal Interface definiert (folgt IActuatorDriver-Pattern)
- [ ] ESP32GPIOHal Wrapper implementiert
- [ ] MockGPIOHal Mock erstellt
- [ ] GPIOManagerTestHelper erstellt
- [ ] Friend-Deklaration in GPIOManager hinzugefügt
- [ ] 10 Tests grün
- [ ] Production-Build unverändert (Binary-Diff <1%)

**Phase 2B-2D:**
- [ ] I2C + OneWire HAL (16 Tests)
- [ ] Storage + Config HAL (25 Tests)
- [ ] Manager-Tests (49 Tests)

**Phase 3:**
- [ ] GitHub Actions Workflow funktioniert
- [ ] Coverage >70% für testbare Module

**Gesamt:**
- [ ] 139 Tests (20 Phase 1A + 19 Phase 1B + 100 Phase 2)
- [x] Rückwärtskompatibilität zu allen 3 Environments → **ZU VERIFIZIEREN**
- [x] Server-zentrische Architektur bewahrt → **GARANTIERT (keine ESP32 Business-Logic)**
- [ ] Keine Breaking Changes in Public APIs oder main.cpp
- [ ] Friend-Helper-Pattern konsistent über alle Manager

---

## Nächste Schritte - PRIORISIERT

### Sofort (JETZT):

**Option A: Phase 1A Verifikation (Empfohlen)**
```bash
# Robin führt aus:
cd "El Trabajante"
pio test -e native -v

# Erwartetes Ergebnis:
# - 12 TopicBuilder Tests PASSED
# - Laufzeit: ~2-5 Sekunden
```

**Option B: Phase 2A Prototyp starten (Empfohlen wenn Phase 1A grün)**
1. IGPIOHal Interface definieren (Datei: `src/drivers/hal/igpio_hal.h`)
2. ESP32GPIOHal Wrapper implementieren
3. MockGPIOHal Mock erstellen
4. GPIOManagerTestHelper erstellen
5. GPIOManager refactorieren (Friend-Deklaration + HAL-Pointer)
6. Tests schreiben

### Nach Phase 1A Completion:

- TM-Review der Test-Ergebnisse
- Entscheidung: Phase 1B (optional) oder direkt Phase 2A
- OneWireUtils Tests schreiben (falls Phase 1B gewählt)

### Nach Phase 2A Completion:

- Pattern-Review (funktioniert Friend-Helper-Pattern wie erwartet?)
- Binary-Size-Diff prüfen (< 1%?)
- Phase 2B starten (I2C + OneWire HAL nach gleicher Vorlage)

---

## Zusammenfassung der Korrekturen

**Was war richtig im Original-Plan:**
- ✅ Architektur-Entscheidungen (Friend-Helper-Pattern, kein Constructor-DI)
- ✅ HAL-Interface-Design (IActuatorDriver als Vorlage)
- ✅ Dependency-Graph (GPIO vor I2C/OneWire vor Manager)
- ✅ Phase 3 CI-Integration (unverändert)

**Was wurde korrigiert:**
- ✅ Phase 1 Test-Anzahl: 57 → 39 Tests realistisch
- ✅ Phase 1 Pure-Logic-Module: 10 → 4 Module (String-Helpers, Data-Buffer LEER)
- ✅ Phase 1 Environment-Setup: **bereits implementiert** (16h Einsparung)
- ✅ Phase 2 Sub-Phasen: Monolithisch → 4 Sub-Phasen (inkrementelle Verifikation)
- ✅ Phase 2 Aufwand: 77h → 44h (realistischere Schätzung)
- ✅ ActuatorManagerTestHelper: Header vorhanden, aber Implementierung fehlt

**Was bleibt zu tun:**
- [ ] Phase 1A Verifikation: `pio test -e native -v` ausführen
- [ ] OneWireUtils Tests schreiben (3h, 8 Tests)
- [ ] Phase 2A implementieren (9h, GPIO-HAL Prototyp)
- [ ] Phase 2B-2D nach gleichem Pattern (35h)
- [ ] Phase 3 CI-Integration (16h)

**Total Aufwand korrigiert:** 64-73h (statt 113h) - **~40-49h Einsparung**

---

**Ende des korrigierten Plans**

*Dieser Plan basiert auf tatsächlicher Codebase-Analyse und ist sofort umsetzbar.*
