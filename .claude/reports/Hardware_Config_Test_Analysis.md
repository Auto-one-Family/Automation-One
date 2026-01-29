# Hardware Configuration Test Analysis Report

> **Erstellt:** 2026-01-28
> **Version:** 1.0
> **Analyst:** Claude Code (Embedded V&V Engineer)
> **Bezug:** Test-Entwicklungsanweisung Hardware Configuration

---

## Executive Summary

Diese Analyse vergleicht die **spezifizierten** Hardware-Konfigurationswerte mit der **tatsächlichen Implementierung** und identifiziert Testlücken sowie erforderliche Anpassungen.

### Kernbefund

Die tatsächliche Implementierung weicht in mehreren Punkten von der Spezifikation ab:

| Aspekt | Spezifikation | Tatsächlich | Status |
|--------|---------------|-------------|--------|
| Board-Konstante | `BOARD_NAME` | `BOARD_TYPE` | Abweichung |
| Helper-Functions | `isSafePin()`, `isReservedPin()` | Nicht vorhanden | Nicht implementiert |
| Resource-Limits | In Hardware-Header | In `platformio.ini` | Architektur-Unterschied |
| Memory-Config | `FLASH_SIZE`, `MIN_FREE_HEAP` | Nicht vorhanden | Nicht implementiert |
| ADC-Only Pins | `ADC_ONLY_PINS` | `INPUT_ONLY_PINS` | Namensabweichung |

---

## 1. Tatsächliche Hardware-Konfigurationen

### 1.1 ESP32-WROOM-32 (`esp32_dev.h`)

```cpp
// BOARD IDENTIFICATION
#define BOARD_TYPE "ESP32_WROOM_32"
#define MAX_GPIO_PINS 24

namespace HardwareConfig {
    // RESERVED PINS (6 Pins)
    const uint8_t RESERVED_GPIO_PINS[] = {0, 1, 2, 3, 12, 13};
    const uint8_t RESERVED_PIN_COUNT = 6;

    // SAFE GPIO PINS (16 Pins)
    const uint8_t SAFE_GPIO_PINS[] = {
        4, 5, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
    };
    const uint8_t SAFE_PIN_COUNT = 16;

    // INPUT-ONLY PINS (4 Pins)
    const uint8_t INPUT_ONLY_PINS[] = {34, 35, 36, 39};
    const uint8_t INPUT_ONLY_PIN_COUNT = 4;

    // I2C
    constexpr uint8_t I2C_SDA_PIN = 21;
    constexpr uint8_t I2C_SCL_PIN = 22;
    constexpr uint32_t I2C_FREQUENCY = 100000;

    // PWM
    constexpr uint8_t PWM_CHANNELS = 16;
    constexpr uint32_t PWM_FREQUENCY = 1000;
    constexpr uint8_t PWM_RESOLUTION = 12;

    // ADC
    constexpr uint8_t ADC_RESOLUTION = 12;
    constexpr uint16_t ADC_MAX_VALUE = 4095;

    // OneWire
    constexpr uint8_t DEFAULT_ONEWIRE_PIN = 4;

    // Board Features
    constexpr uint8_t LED_PIN = 5;
    constexpr uint8_t BUTTON_PIN = 0;
}
```

### 1.2 XIAO ESP32-C3 (`xiao_esp32c3.h`)

```cpp
// BOARD IDENTIFICATION
#define BOARD_TYPE "XIAO_ESP32C3"
#define MAX_GPIO_PINS 12

namespace HardwareConfig {
    // RESERVED PINS (3 Pins)
    const uint8_t RESERVED_GPIO_PINS[] = {0, 1, 3};
    const uint8_t RESERVED_PIN_COUNT = 3;

    // SAFE GPIO PINS (9 Pins)
    const uint8_t SAFE_GPIO_PINS[] = {2, 4, 5, 6, 7, 8, 9, 10, 21};
    const uint8_t SAFE_PIN_COUNT = 9;

    // KEINE INPUT_ONLY_PINS!
    // (ESP32-C3 ist flexibler als ESP32 WROOM)

    // I2C (ANDERE PINS als WROOM!)
    constexpr uint8_t I2C_SDA_PIN = 4;
    constexpr uint8_t I2C_SCL_PIN = 5;
    constexpr uint32_t I2C_FREQUENCY = 100000;

    // PWM (weniger Kanäle!)
    constexpr uint8_t PWM_CHANNELS = 6;
    constexpr uint32_t PWM_FREQUENCY = 1000;
    constexpr uint8_t PWM_RESOLUTION = 12;

    // ADC
    constexpr uint8_t ADC_RESOLUTION = 12;
    constexpr uint16_t ADC_MAX_VALUE = 4095;

    // OneWire (anderer Pin!)
    constexpr uint8_t DEFAULT_ONEWIRE_PIN = 6;

    // Board Features
    constexpr uint8_t LED_PIN = 21;
    constexpr uint8_t BUTTON_PIN = 0;
}
```

### 1.3 Resource-Limits (aus `platformio.ini`)

| Parameter | ESP32-WROOM | XIAO ESP32-C3 |
|-----------|-------------|---------------|
| `MAX_SENSORS` | 20 | 10 |
| `MAX_ACTUATORS` | 12 | 6 |
| `MAX_LIBRARY_SIZE` | 65536 | 32768 |
| `MQTT_MAX_PACKET_SIZE` | 2048 | 1024 |

---

## 2. Spezifikation vs. Implementierung

### 2.1 Board-Identifikation

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-ID-001 | `BOARD_NAME` vorhanden | `BOARD_TYPE` vorhanden | Ja (Serial-Output) |
| HW-ID-002 | `BOARD_VARIANT` vorhanden | Nicht vorhanden | Nein |
| HW-ID-003 | Board in Heartbeat | Nicht implementiert | Nein |
| HW-ID-004 | Board in Serial-Output | Ja ("Board Type:") | Ja |

**Anpassung:** Tests auf `BOARD_TYPE` anpassen, HW-ID-002 und HW-ID-003 entfallen.

### 2.2 GPIO Safe-List

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-GPIO-001 | `SAFE_PIN_COUNT == sizeof(array)` | Implementiert | Ja (Boot-Log) |
| HW-GPIO-002 | Alle Safe-Pins nutzbar | Implementiert | Ja (Wokwi) |
| HW-GPIO-003 | Reserved nicht in Safe-List | Implementiert | Ja (Code-Review) |
| HW-GPIO-004 | `isSafePin(safe) → true` | Keine Helper-Function | Nein |
| HW-GPIO-005 | `isSafePin(reserved) → false` | Keine Helper-Function | Nein |
| HW-GPIO-006 | `isSafePin(99) → false` | Keine Helper-Function | Nein |

**Anpassung:** HW-GPIO-004 bis HW-GPIO-006 entfallen, da keine Helper-Functions existieren. Tests basieren auf GPIOManager-Verhalten.

### 2.3 Reserved Pins

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-RES-001 | GPIO 0 reserviert | Ja | Ja (Existing Test) |
| HW-RES-002 | UART-Pins reserviert | GPIO 1, 3 | Ja (Existing Test) |
| HW-RES-003 | Flash-Pins reserviert | GPIO 6-11 NICHT in Config! | Indirekt |
| HW-RES-004 | Sensor auf Reserved ablehnen | Implementiert | Ja (Existing Test) |
| HW-RES-005 | Actuator auf Reserved ablehnen | Implementiert | Ja (Existing Test) |

**Wichtig:** Flash-Pins (GPIO 6-11) sind NICHT explizit in `RESERVED_GPIO_PINS`, aber auch NICHT in `SAFE_GPIO_PINS`. GPIOManager lehnt sie ab, weil sie nicht in der Safe-List sind.

### 2.4 Input-Only Pins (ADC-Only in Spezifikation)

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-ADC-001 | `isAdcOnlyPin(34) → true` | Keine Helper-Function | Nein |
| HW-ADC-002 | ADC-Only als Sensor OK | GPIO 34-39 NICHT in Safe-List! | Nein |
| HW-ADC-003 | ADC-Only als Actuator NICHT OK | GPIO 34-39 NICHT in Safe-List! | Ja (indirekt) |
| HW-ADC-004 | `ADC_RESOLUTION == 12` | Implementiert | Ja (Compile-Time) |
| HW-ADC-005 | `ADC_MAX_VALUE == 4095` | Implementiert | Ja (Compile-Time) |

**Kritischer Unterschied:** Die Spezifikation ging davon aus, dass GPIO 34-39 als Sensoren (Inputs) nutzbar sind. **Tatsächlich sind sie NICHT in der SAFE_GPIO_PINS-Liste!** Das bedeutet, sie können weder als Sensor noch als Actuator verwendet werden.

### 2.5 I2C Configuration

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-I2C-001 | I2C_SDA_PIN definiert | WROOM: 21, XIAO: 4 | Ja |
| HW-I2C-002 | I2C_SCL_PIN definiert | WROOM: 22, XIAO: 5 | Ja |
| HW-I2C-003 | SDA != SCL | Implementiert | Ja (Code) |
| HW-I2C-004 | I2C-Pins in Safe-List | WROOM: 21, 22 ✓; XIAO: 4, 5 ✓ | Ja |
| HW-I2C-005 | Frequenz gültig | 100000 Hz | Ja |
| HW-I2C-006 | Board-spezifische Pins | Implementiert | Ja (Boot-Log) |

### 2.6 Resource Limits

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-LIM-001 | `MAX_SENSORS > 0` | In platformio.ini | Ja (Runtime) |
| HW-LIM-002 | `MAX_ACTUATORS > 0` | In platformio.ini | Ja (Runtime) |
| HW-LIM-003 | Sensor-Limit durchgesetzt | Implementiert in SensorManager | Ja (Wokwi) |
| HW-LIM-004 | Actuator-Limit durchgesetzt | Implementiert in ActuatorManager | Ja (Wokwi) |
| HW-LIM-005 | Subzone-Limit durchgesetzt | Unklar | Prüfen |
| HW-LIM-006 | Board-spezifische Limits | platformio.ini | Ja |

### 2.7 PWM Configuration

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-PWM-001 | PWM_CHANNELS definiert | WROOM: 16, XIAO: 6 | Ja (Compile-Time) |
| HW-PWM-002 | PWM_TIMERS definiert | Nicht implementiert! | Nein |
| HW-PWM-003 | Default-Resolution gültig | 12-bit | Ja |
| HW-PWM-004 | Default-Frequency gültig | 1000 Hz | Ja |
| HW-PWM-005 | Board-spezifische Channels | Implementiert | Ja |

### 2.8 Memory Configuration

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-MEM-001 | FLASH_SIZE definiert | Nicht implementiert | Nein |
| HW-MEM-002 | NVS_SIZE definiert | Nicht implementiert | Nein |
| HW-MEM-003 | MIN_FREE_HEAP definiert | Nicht implementiert | Nein |
| HW-MEM-004 | Heap-Check bei Boot | Nicht implementiert | Nein |
| HW-MEM-005 | Board-spezifische Limits | Nicht implementiert | Nein |

**Anpassung:** Alle HW-MEM-* Tests entfallen, da Memory-Configuration nicht implementiert ist.

### 2.9 Cross-Board Compatibility

| Spez-ID | Spezifikation | Tatsächlich | Testbar? |
|---------|---------------|-------------|----------|
| HW-CROSS-001 | Gleiche Namespace-Struktur | Implementiert | Ja (Compile) |
| HW-CROSS-002 | Gleiche Helper-Functions | Nicht vorhanden | Nein |
| HW-CROSS-003 | Gleiche Interface-Konstanten | Teilweise | Ja (Code-Review) |
| HW-CROSS-004 | Board-Switch kompiliert | Implementiert | Ja (CI/CD) |
| HW-CROSS-005 | Kein BOARD_xxx → Error | Nicht implementiert | Nein |

---

## 3. Existierende GPIO-Tests

### 3.1 Verzeichnis: `tests/wokwi/scenarios/gpio/` (24 Dateien)

| Datei | Abgedeckte Tests | Status |
|-------|------------------|--------|
| `gpio_boot_first.yaml` | HW-ID-004 (teilweise) | Erweitern |
| `gpio_boot_pin_count.yaml` | HW-GPIO-001 | OK |
| `gpio_boot_i2c_auto.yaml` | HW-I2C-004, HW-I2C-006 | OK |
| `gpio_boot_mode_verify.yaml` | GPIO-Modus | OK |
| `gpio_reservation_success.yaml` | HW-GPIO-002 | OK |
| `gpio_reservation_conflict.yaml` | Konflikt-Erkennung | OK |
| `gpio_reservation_invalid.yaml` | HW-RES-001-005 | OK |
| `gpio_reservation_release.yaml` | Pin-Release | OK |
| `gpio_reservation_owner.yaml` | Owner-Tracking | OK |
| `gpio_safe_mode_*.yaml` (3) | Safe-Mode | OK |
| `gpio_subzone_*.yaml` (4) | Subzone-Management | OK |
| `gpio_edge_*.yaml` (4) | Edge-Cases | OK |
| `gpio_integration_*.yaml` (4) | Integration | OK |

---

## 4. Testlücken-Analyse

### 4.1 Neue Tests erforderlich

| Test-ID | Beschreibung | Priorität |
|---------|--------------|-----------|
| HW-I2C-001 | I2C-SDA-Pin in Boot-Log verifizieren | Mittel |
| HW-I2C-002 | I2C-SCL-Pin in Boot-Log verifizieren | Mittel |
| HW-I2C-005 | I2C-Frequenz in Boot-Log verifizieren | Niedrig |
| HW-PWM-001 | PWM-Channels in Boot-Log verifizieren | Niedrig |
| HW-PWM-003 | PWM-Resolution bei Actuator-Config verifizieren | Mittel |
| HW-LIM-003 | Sensor-Limit-Durchsetzung | Hoch |
| HW-LIM-004 | Actuator-Limit-Durchsetzung | Hoch |
| HW-INPUT-001 | Input-Only-Pin als Sensor (GPIO 34) | Hoch |
| HW-INPUT-002 | Input-Only-Pin als Actuator ablehnen | Hoch |
| HW-BOARD-001 | Board-Type in Serial-Output | Mittel |

### 4.2 Tests die entfallen

| Test-ID | Grund |
|---------|-------|
| HW-ID-002 | `BOARD_VARIANT` nicht implementiert |
| HW-ID-003 | Board nicht in Heartbeat |
| HW-GPIO-004-006 | Keine Helper-Functions |
| HW-ADC-001-002 | GPIO 34-39 nicht in Safe-List |
| HW-MEM-001-005 | Memory-Config nicht implementiert |
| HW-CROSS-002, 005 | Nicht implementiert |

---

## 5. Kritische Erkenntnisse

### 5.1 Input-Only Pins (GPIO 34-39) auf ESP32-WROOM

**Problem:** Die Spezifikation nahm an, dass GPIO 34-39 als Analog-Sensoren nutzbar sind:
```
HW-ADC-002: ADC-Only als Sensor OK → configureSensor(gpio:34, analog) → true
```

**Tatsächlich:** GPIO 34-39 sind NICHT in `SAFE_GPIO_PINS`:
```cpp
const uint8_t SAFE_GPIO_PINS[] = {
    4, 5, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
    // 34, 35, 36, 39 FEHLEN!
};
```

**Konsequenz:** ADC-Inputs können nur über GPIO 32, 33 erfolgen (ADC1_CH4, ADC1_CH5).

**Empfehlung:** Entweder:
1. `SAFE_GPIO_PINS` erweitern um GPIO 34-39 (nur als INPUT nutzbar)
2. Separate `ADC_INPUT_PINS` Array für Analog-Sensoren

### 5.2 Flash-Pins nicht explizit reserviert

**Problem:** GPIO 6-11 (Flash-Pins) sind weder in `RESERVED_GPIO_PINS` noch in `SAFE_GPIO_PINS`.

**Verhalten:** GPIOManager lehnt sie ab, weil sie nicht "safe" sind - aber die Fehlermeldung ist "not in safe pins" statt "reserved".

**Empfehlung:** Flash-Pins explizit zu `RESERVED_GPIO_PINS` hinzufügen für klarere Fehlermeldungen.

### 5.3 XIAO hat keine Input-Only Pins

**Unterschied:** ESP32-C3 (XIAO) hat keine Input-Only Beschränkung - alle GPIOs können Input oder Output sein.

**Konsequenz:** Tests für Input-Only müssen Board-spezifisch sein.

---

## 6. Angepasste Test-Matrix

### 6.1 Tatsächlich testbare Anforderungen (29 Tests)

| Kategorie | Tests | Wokwi | Mock |
|-----------|-------|-------|------|
| Board-Identifikation | 2 | 2 | 0 |
| GPIO Safe-List | 3 | 3 | 0 |
| Reserved Pins | 5 | 5 | 0 |
| Input-Only Pins | 2 | 2 | 0 |
| I2C Configuration | 5 | 3 | 2 |
| Resource Limits | 4 | 2 | 2 |
| PWM Configuration | 4 | 2 | 2 |
| Cross-Board | 2 | 0 | 2 |
| **GESAMT** | **29** | **19** | **10** |

### 6.2 Finaler Test-Plan

**Neue Wokwi-Tests zu erstellen:**
1. `hw_board_type.yaml` - Board-Type Verification
2. `hw_i2c_pins.yaml` - I2C Pin Configuration
3. `hw_input_only_reject.yaml` - Input-Only als Actuator ablehnen
4. `hw_sensor_limit.yaml` - MAX_SENSORS Durchsetzung
5. `hw_actuator_limit.yaml` - MAX_ACTUATORS Durchsetzung
6. `hw_pwm_config.yaml` - PWM Channel/Resolution

**Existierende Tests erweitern:**
- `gpio_boot_pin_count.yaml` - Board-Type hinzufügen
- `gpio_boot_i2c_auto.yaml` - Frequenz-Log hinzufügen

---

## 7. Empfohlene Code-Änderungen

### 7.1 Hardware-Config erweitern (optional)

```cpp
// In esp32_dev.h hinzufügen:

// ADC INPUT PINS (can be used as analog sensors)
const uint8_t ADC_INPUT_PINS[] = {32, 33, 34, 35, 36, 39};
const uint8_t ADC_INPUT_PIN_COUNT = 6;

// Flash Pins explizit reservieren
const uint8_t FLASH_PINS[] = {6, 7, 8, 9, 10, 11};
const uint8_t FLASH_PIN_COUNT = 6;

// Helper Functions
constexpr bool isInArray(uint8_t pin, const uint8_t* arr, uint8_t count) {
    for (uint8_t i = 0; i < count; i++) {
        if (arr[i] == pin) return true;
    }
    return false;
}

inline bool isSafePin(uint8_t pin) {
    return isInArray(pin, SAFE_GPIO_PINS, SAFE_PIN_COUNT);
}

inline bool isReservedPin(uint8_t pin) {
    return isInArray(pin, RESERVED_GPIO_PINS, RESERVED_PIN_COUNT) ||
           isInArray(pin, FLASH_PINS, FLASH_PIN_COUNT);
}

inline bool isInputOnlyPin(uint8_t pin) {
    return isInArray(pin, INPUT_ONLY_PINS, INPUT_ONLY_PIN_COUNT);
}
```

### 7.2 GPIOManager Logging verbessern

```cpp
// In gpio_manager.cpp:
// Bessere Fehlermeldungen mit Pin-Typ:
if (isReservedPin(gpio)) {
    LOG_ERROR("Pin %d is RESERVED (Boot/UART/Flash)", gpio);
} else if (!isSafePin(gpio)) {
    LOG_ERROR("Pin %d is not in safe GPIO list", gpio);
} else if (isInputOnlyPin(gpio) && mode == OUTPUT) {
    LOG_ERROR("Pin %d is INPUT-ONLY, cannot use as OUTPUT", gpio);
}
```

---

## 8. Fazit

Die tatsächliche Implementierung der Hardware-Konfiguration ist **solide aber minimal**. Die Spezifikation enthielt einige **idealisierte Features**, die nicht implementiert sind.

**Wichtigste Anpassungen:**
1. Tests auf `BOARD_TYPE` statt `BOARD_NAME` umstellen
2. Helper-Function-Tests entfallen
3. Memory-Configuration-Tests entfallen
4. Input-Only-Pin-Tests anpassen (GPIO 34-39 nicht nutzbar)
5. Resource-Limit-Tests über platformio.ini Werte

**Von 47 spezifizierten Tests sind 29 tatsächlich umsetzbar.**

---

*Dieser Bericht dient als Grundlage für die angepasste Test-Suite.*
