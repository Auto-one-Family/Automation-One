# Auftrag an @esp32-dev
Datum: 2026-02-11 12:00

## Das Kernproblem – für jeden Agent verständlich

### Warum die ESP32 Native Unit Tests nicht bauen

Das ESP32-Projekt hat ein **Unit-Test-System das auf dem `native`-Environment** von PlatformIO läuft – also auf dem Host-PC (x86_64, Windows/MinGW), NICHT auf einem ESP32. Ziel ist: reine Logik-Tests ohne Hardware, schnelles Feedback, CI-fähig.

**Was bereits funktioniert:** `test/test_infra/test_topic_builder.cpp` – 12/12 Tests PASS. Das beweist: die grundlegende Infrastruktur (PlatformIO native, Unity-Framework, Arduino-Mock, Build-Pipeline) funktioniert.

**Was noch NICHT funktioniert:** `test/test_managers/test_gpio_manager_mock.cpp` – baut nicht, weil `gpio_manager.cpp` direkt ~20+ Arduino-Funktionen aufruft (`pinMode`, `digitalWrite`, `digitalRead`, `delayMicroseconds`, `Serial.printf`, Konstanten `INPUT`/`OUTPUT`/`LOW`/`HIGH` etc.), die auf `platform = native` nicht existieren.

### Warum "mehr Mocks" der falsche Weg ist

Man könnte den `test/mocks/Arduino.h`-Mock um alle fehlenden Funktionen erweitern. Das wäre aber ein Anti-Pattern:
- Jede neue Arduino-Funktion in Production-Code erfordert Mock-Erweiterung
- Der Mock wächst unbegrenzt und wird fragil
- Bugs im Mock sind von Bugs im Production-Code nicht unterscheidbar
- Es testet den Mock, nicht die Logik

### Warum HAL der richtige Weg ist

Es existiert BEREITS eine **vollständig designte HAL-Architektur** die genau dieses Problem löst:

```
src/drivers/hal/
├── igpio_hal.h          ← Pure Virtual Interface (13 Methoden)
└── esp32_gpio_hal.h     ← Production Implementation (delegiert an Arduino API)

test/mocks/
└── mock_gpio_hal.h      ← Test Mock (In-Memory State Tracking, 220+ Zeilen, vollständig)

test/helpers/
└── gpio_manager_test_helper.h  ← Friend Helper (inject/reset/inspect)
```

Die Architektur ist fertig designed, der Mock ist vollständig implementiert, der TestHelper existiert, der `GPIOManager` hat bereits:
- `friend class GPIOManagerTestHelper;` Deklaration
- `IGPIOHal* gpio_hal_;` Member
- `#ifndef UNIT_TEST` Guard für Production-HAL

**Was fehlt:** `gpio_manager.cpp` ruft immer noch direkt Arduino-Funktionen auf statt über `gpio_hal_->` zu gehen. Die HAL-Integration ist vorbereitet aber nicht verdrahtet.

### Das zweite Problem: Entry-Point

Die Test-Dateien verwenden aktuell nur das Arduino-Pattern:

```cpp
void setup() { UNITY_BEGIN(); ... UNITY_END(); }
void loop() {}
```

Auf `platform = native` erwartet PlatformIO ein `int main()`. Der Build-Flag `-DARDUINO=0` setzt das Macro auf 0, aber `#ifdef ARDUINO` ist trotzdem `true` weil das Macro existiert (nur der Wert ist 0). Tests brauchen einen dualen Entry-Point.

---

## Aufgabe

### Phase 1: Analyse (NICHT überspringen)

1. **gpio_manager.cpp komplett lesen.** Jede Stelle identifizieren wo direkt Arduino-Funktionen aufgerufen werden:
   - `::pinMode()`, `::digitalWrite()`, `::digitalRead()`, `::analogRead()`
   - `delayMicroseconds()`, `delay()`, `millis()`
   - `Serial.printf()`, `Serial.println()` etc.
   - Konstanten: `INPUT`, `OUTPUT`, `INPUT_PULLUP`, `INPUT_PULLDOWN`, `HIGH`, `LOW`
   
2. **Kategorisieren nach HAL-Abdeckung:**
   - Welche Aufrufe sind durch `IGPIOHal`-Methoden bereits abgedeckt?
   - Welche fehlen im Interface? (z.B. `delayMicroseconds`, Serial-Logging)
   
3. **Abhängigkeiten prüfen:**
   - Wird `gpio_manager.h` von anderen Dateien in `src/` inkludiert? Welche?
   - Nutzen andere Manager den GPIOManager direkt oder über HAL?
   - Würde eine Änderung am Header Breaking Changes verursachen?

4. **Native Build Config prüfen:**
   - `platformio.ini` Section `[env:native]`: Was wird aktuell kompiliert?
   - `build_src_filter`: Ist `gpio_manager.cpp` enthalten?
   - Fehlende Includes oder lib_deps für native?

### Phase 2: Implementierung

**2a. gpio_manager.cpp HAL-Integration:**

Alle direkten Arduino-Aufrufe in `gpio_manager.cpp` durch `gpio_hal_->`-Aufrufe ersetzen. Dabei:

- **NUR Aufrufe ersetzen die durch `IGPIOHal` abgedeckt sind.** Das Interface hat: `initializeAllPinsToSafeMode()`, `requestPin()`, `releasePin()`, `isPinAvailable()`, `isPinReserved()`, `isPinInSafeMode()`, `pinMode()`, `digitalWrite()`, `digitalRead()`, `analogRead()`, `enableSafeModeForAllPins()`, `getPinInfo()`, `getReservedPinsList()`, `getReservedPinCount()`, `getAvailablePinCount()`, `getPinOwner()`, `getPinComponent()`.

- **Serial-Logging:** NICHT in HAL packen. Stattdessen mit `#ifndef NATIVE_TEST` Guards wrappen oder durch ein Logging-Interface abstrahieren. Serial-Aufrufe in gpio_manager.cpp dienen nur dem Debugging, nicht der GPIO-Logik.

- **Konstanten (INPUT, OUTPUT, HIGH, LOW):** Durch `GPIOMode` Enum ersetzen wo das HAL-Interface GPIOMode verwendet. Für direkten Pin-Zugriff (`configurePinMode` nimmt `uint8_t mode`) muss die Konvertierung in der Production-HAL passieren (ist in `esp32_gpio_hal.h` bereits implementiert).

- **NULL-Safety:** `gpio_hal_` könnte nullptr sein (z.B. im Singleton-Konstruktor bevor HAL injiziert wird). Jede HAL-Methode muss mit nullptr-Check beginnen:
  ```
  if (!gpio_hal_) return false;  // oder sicherer Default
  ```

- **Singleton-Initialisierung:** In nicht-Test-Builds muss `gpio_hal_` auf `&production_gpio_hal_` zeigen. Prüfe dass das im Konstruktor oder in `initializeAllPinsToSafeMode()` korrekt passiert. Das `#ifndef UNIT_TEST`-Guard und `static ESP32GPIOHal production_gpio_hal_` existieren bereits im Header.

**2b. Entry-Point Fix für alle Test-Dateien:**

Sowohl `test_topic_builder.cpp` als auch `test_gpio_manager_mock.cpp` brauchen den dualen Entry-Point. Muster:

```cpp
// Am Ende der Datei, STATT nur setup()/loop():

int runAllTests(void) {
    UNITY_BEGIN();
    RUN_TEST(test_xxx);
    RUN_TEST(test_yyy);
    // ... alle Tests
    return UNITY_END();
}

#if defined(ARDUINO) && ARDUINO > 0
void setup() {
    delay(2000);
    runAllTests();
}
void loop() {}
#else
int main(int argc, char **argv) {
    (void)argc;
    (void)argv;
    return runAllTests();
}
#endif
```

**2c. Arduino.h Mock erweitern (MINIMAL):**

Der Mock in `test/mocks/Arduino.h` braucht NUR die Ergänzungen die nach der HAL-Integration noch fehlen. Das sollte minimal sein – idealerweise nur:
- `INPUT`, `OUTPUT`, `INPUT_PULLUP`, `INPUT_PULLDOWN`, `HIGH`, `LOW` Konstanten (falls noch von gpio_manager.h referenziert)
- `uint8_t` und andere Typen (sind via `<cstdint>` bereits da)

NICHT hinzufügen: `pinMode()`, `digitalWrite()`, `digitalRead()` etc. – die laufen jetzt über HAL.

**2d. platformio.ini [env:native] anpassen:**

```ini
build_src_filter = -<*> +<utils/topic_builder.cpp> +<drivers/gpio_manager.cpp>
```

Falls `gpio_manager.cpp` weitere Source-Files aus `src/` braucht (z.B. Helper-Klassen), diese AUCH in den Filter aufnehmen. Aber NUR was tatsächlich kompiliert werden muss.

Prüfe ob `gpio_manager.h` includes hat die auf native nicht auflösbar sind (z.B. `#include <Arduino.h>`). Wenn ja: Guards setzen.

### Phase 3: Verifikation

1. **Build-Test:**
   ```powershell
   & "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" test -e native -vvv
   ```
   Erwartung: Beide Test-Suites werden entdeckt und gebaut.

2. **Test-Ergebnis:**
   - `test_infra/test_topic_builder.cpp`: 12/12 PASS (Regression-Check)
   - `test_managers/test_gpio_manager_mock.cpp`: 10/10 PASS

3. **ESP32 Build Regression-Check:**
   ```powershell
   & "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e esp32_dev
   ```
   Erwartung: Build erfolgreich. Die HAL-Integration darf ESP32-Builds NICHT brechen.

4. **Wokwi Build Regression-Check:**
   ```powershell
   & "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e wokwi_simulation
   ```
   Erwartung: Build erfolgreich.

---

## Qualitätsanforderungen

### Codestandard
- Ausschließlich vorhandene Patterns nutzen (HAL, Friend-Helper, Mock – alles existiert bereits)
- Vollständige Konsistenz mit dem IGPIOHal Interface
- Rückwärtskompatibel: KEIN anderer Code in `src/` darf brechen
- Keine neuen Dependencies für `[env:native]`

### Was NICHT getan werden soll
- KEINEN neuen Mock-Layer erfinden – MockGPIOHal existiert und ist vollständig
- NICHT die GPIOManager public API ändern – nur interne Implementierung
- NICHT die HAL-Interfaces ändern – sie sind korrekt designed
- NICHT andere Manager (SensorManager, ActuatorManager etc.) anfassen
- KEINEN neuen Test-Helper schreiben – GPIOManagerTestHelper existiert
- NICHT die Wokwi-Environments oder ESP32-Hardware-Environments ändern

### Wenn etwas nicht aufgeht
Wenn bei der Analyse ein Problem auftritt das diesen Plan nicht abdeckt (z.B. gpio_manager.cpp hat Abhängigkeiten die nicht durch HAL abstrahierbar sind, oder das Interface hat eine Lücke), dann:
1. Problem dokumentieren mit exakter Codezeile und Kontext
2. Lösungsvorschlag formulieren
3. NICHT eigenständig das Interface erweitern – das ist eine Architekturentscheidung die zurück zum TM muss

---

## Erfolgskriterium

```
pio test -e native -vvv
→ test_infra/test_topic_builder: 12/12 PASSED
→ test_managers/test_gpio_manager_mock: 10/10 PASSED
→ 22 test cases: 22 succeeded

pio run -e esp32_dev
→ SUCCESS (keine Regression)

pio run -e wokwi_simulation
→ SUCCESS (keine Regression)
```

## Report zurück an
`.technical-manager/inbox/agent-reports/esp32-dev-native-test-hal-fix-2026-02-11.md`

Inhalt des Reports:
1. Analyseergebnis: Welche Arduino-Aufrufe wurden gefunden, wie kategorisiert
2. Änderungen: Welche Dateien geändert, was genau
3. Testergebnis: Vollständiger Output von `pio test -e native -vvv`
4. Regression-Check: ESP32 + Wokwi Build Output
5. Offene Punkte: Alles was nicht aufging oder Follow-Up braucht
