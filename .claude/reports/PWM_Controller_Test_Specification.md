# PWM Controller Test Specification

> **Erstellt:** 2026-01-28
> **Version:** 1.0
> **Modul:** PWM Controller (pwm_controller.cpp / pwm_controller.h)
> **Analyst:** Claude Code (Embedded V&V Engineer)

---

## 1. Implementierungsanalyse

### 1.1 Tatsächlich implementierte Methoden

| Methode | Beschreibung | Implementiert |
|---------|--------------|---------------|
| `begin()` | Initialisierung mit Hardware-Defaults | Ja |
| `end()` | Deinitialisierung, alle Kanäle freigeben | Ja |
| `attachChannel(gpio, channel_out)` | GPIO an PWM-Kanal anhängen | Ja |
| `detachChannel(channel)` | Kanal trennen und GPIO freigeben | Ja |
| `setFrequency(channel, frequency)` | Frequenz setzen (1-40MHz) | Ja |
| `setResolution(channel, resolution_bits)` | Auflösung setzen (1-16 Bit) | Ja |
| `write(channel, duty_cycle)` | Absoluter Duty-Cycle | Ja |
| `writePercent(channel, percent)` | Prozentualer Duty-Cycle (0-100) | Ja |
| `isChannelAttached(channel)` | Kanal-Status prüfen | Ja |
| `getChannelForGPIO(gpio)` | Kanal für GPIO finden | Ja |
| `getChannelStatus()` | Status aller Kanäle als String | Ja |

### 1.2 NICHT implementierte Features (aus Anweisungs-Spezifikation)

| Feature | Status | Kommentar |
|---------|--------|-----------|
| `stopChannel()` | NICHT implementiert | Emergency via ActuatorManager |
| `stopAllChannels()` | NICHT implementiert | Emergency via SafetyController |
| `setFade()` | NICHT implementiert | Hardware-Fade nicht genutzt |
| `getDuty()` | NICHT implementiert | Kein Duty-Readback |
| `getDutyPercent()` | NICHT implementiert | Kein Percent-Readback |
| `invertOutput()` | NICHT implementiert | Kein Invert-Support |

### 1.3 Hardware-Konfiguration (ESP32 WROOM)

```
PWM_CHANNELS = 16     (XIAO: 6)
PWM_FREQUENCY = 1000 Hz (Default)
PWM_RESOLUTION = 12 Bit (0-4095)
```

### 1.4 Architektur-Integration

```
┌─────────────────────────────────────────────────────────────┐
│                     MQTT Command                             │
│          kaiser/god/esp/{id}/actuator/{gpio}/command        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   ActuatorManager                            │
│  - Validiert Command                                         │
│  - Prüft Emergency-Status                                    │
│  - Ruft PWMActuator.setValue() auf                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     PWMActuator                              │
│  - Konvertiert 0.0-1.0 → 0-255                              │
│  - Ruft PWMController.writePercent() auf                     │
│  - Verwaltet Emergency-Status pro Aktor                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   PWMController (DEIN FOKUS)                │
│  - Hardware-Abstraktion über ESP32 LEDC                     │
│  - Kanal-/Timer-Verwaltung                                  │
│  - ledcSetup(), ledcAttachPin(), ledcWrite()               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Angepasste Test-Anforderungen

### Kategorie 1: Initialisierung (5 Tests)

| Test-ID | Beschreibung | Erwartetes Verhalten |
|---------|--------------|---------------------|
| PWM-INIT-001 | Erfolgreiche Initialisierung | `begin()` → true, Logs "PWM Controller initialized" |
| PWM-INIT-002 | Doppelte Initialisierung | Zweiter `begin()` → true (idempotent), Warning-Log |
| PWM-INIT-003 | Initialer Zustand | Alle Kanäle: `attached == false`, `gpio == 255` |
| PWM-INIT-004 | Hardware-Config geladen | `max_channels_ == 16`, `default_frequency_ == 1000` |
| PWM-INIT-005 | Ende der Nutzung | `end()` → Alle Kanäle freigegeben, `initialized_ == false` |

### Kategorie 2: Kanal-Verwaltung (8 Tests)

| Test-ID | Beschreibung | Erwartetes Verhalten |
|---------|--------------|---------------------|
| PWM-CH-001 | Kanal anhängen | `attachChannel(25, ch)` → true, ch == 0 |
| PWM-CH-002 | Duplikat-GPIO | Zweiter `attachChannel(25, ch)` → true, gleicher ch |
| PWM-CH-003 | GPIO Reservation | GPIO wird über GPIOManager reserviert |
| PWM-CH-004 | Mehrere Kanäle | 3x `attachChannel()` → 3 verschiedene Kanäle |
| PWM-CH-005 | Kanal voll | Nach 16x attach → 17. schlägt fehl (-1 äquivalent) |
| PWM-CH-006 | Kanal trennen | `detachChannel(0)` → true, GPIO freigegeben |
| PWM-CH-007 | Nicht-attached Kanal trennen | `detachChannel(99)` → false |
| PWM-CH-008 | Kanal wiederverwenden | `detach()` → `attach()` → gleicher Kanal wieder nutzbar |

### Kategorie 3: Duty Cycle Steuerung (6 Tests)

| Test-ID | Beschreibung | Erwartetes Verhalten |
|---------|--------------|---------------------|
| PWM-DUTY-001 | writePercent 50% | `writePercent(ch, 50.0)` → duty == 2047 (12-Bit) |
| PWM-DUTY-002 | writePercent 0% | `writePercent(ch, 0.0)` → duty == 0 |
| PWM-DUTY-003 | writePercent 100% | `writePercent(ch, 100.0)` → duty == 4095 (12-Bit) |
| PWM-DUTY-004 | writePercent out of range | `writePercent(ch, 150.0)` → false (nicht begrenzt!) |
| PWM-DUTY-005 | write absolut | `write(ch, 2048)` → OK |
| PWM-DUTY-006 | write out of range | `write(ch, 5000)` → false (> 4095 bei 12-Bit) |

### Kategorie 4: Frequenz & Auflösung (5 Tests)

| Test-ID | Beschreibung | Erwartetes Verhalten |
|---------|--------------|---------------------|
| PWM-FREQ-001 | Frequenz ändern | `setFrequency(ch, 25000)` → OK, 25kHz |
| PWM-FREQ-002 | Ungültige Frequenz 0 | `setFrequency(ch, 0)` → false |
| PWM-FREQ-003 | Frequenz > 40MHz | `setFrequency(ch, 50000000)` → false |
| PWM-RES-001 | Auflösung ändern | `setResolution(ch, 8)` → OK, 8-Bit |
| PWM-RES-002 | Ungültige Auflösung | `setResolution(ch, 17)` → false |

### Kategorie 5: Safety & Emergency (4 Tests)

| Test-ID | Beschreibung | Erwartetes Verhalten |
|---------|--------------|---------------------|
| PWM-SAFE-001 | Initial Duty == 0 | Nach `attachChannel()` → duty ist 0 |
| PWM-SAFE-002 | Detach setzt Duty auf 0 | `detachChannel()` ruft `ledcWrite(ch, 0)` auf |
| PWM-SAFE-003 | Emergency via ActuatorManager | `emergencyStopAll()` → alle PWM-Aktoren auf 0% |
| PWM-SAFE-004 | Emergency Clear | Nach `clearEmergencyStop()` → Aktoren wieder steuerbar |

### Kategorie 6: Multi-Channel Szenarien (4 Tests)

| Test-ID | Beschreibung | Erwartetes Verhalten |
|---------|--------------|---------------------|
| PWM-MULTI-001 | 3 Kanäle unabhängig | Kanal 0, 1, 2 mit unterschiedlichen Duty-Werten |
| PWM-MULTI-002 | getChannelForGPIO | `getChannelForGPIO(25)` → korrekter Kanal |
| PWM-MULTI-003 | getChannelForGPIO nicht gefunden | `getChannelForGPIO(99)` → 255 |
| PWM-MULTI-004 | isChannelAttached | `isChannelAttached(0)` → true nach attach |

### Kategorie 7: Integration mit Actuator System (4 Tests)

| Test-ID | Beschreibung | Erwartetes Verhalten |
|---------|--------------|---------------------|
| PWM-INT-001 | PWMActuator nutzt PWMController | Config → PWMActuator.begin() → PWMController.attachChannel() |
| PWM-INT-002 | MQTT Command → PWM Output | MQTT 0.5 → PWMActuator.setValue(0.5) → writePercent(50%) |
| PWM-INT-003 | Actuator Status enthält PWM | Status-JSON enthält `current_pwm` |
| PWM-INT-004 | Emergency stoppt PWM-Aktoren | Broadcast emergency → alle PWM auf 0 |

---

## 3. Gesamt-Testanzahl

| Kategorie | Anzahl |
|-----------|--------|
| Initialisierung | 5 |
| Kanal-Verwaltung | 8 |
| Duty Cycle | 6 |
| Frequenz & Auflösung | 5 |
| Safety & Emergency | 4 |
| Multi-Channel | 4 |
| Integration | 4 |
| **GESAMT** | **36** |

---

## 4. Wichtige Erkenntnisse

### 4.1 Implementierungs-Gap

Die Anweisungs-Spezifikation beschreibt Features, die **NICHT** in der tatsächlichen Implementierung existieren:

- **setFade()** - Hardware-Fade nicht implementiert
- **stopChannel() / stopAllChannels()** - Emergency über ActuatorManager
- **getDuty() / getDutyPercent()** - Kein Duty-Readback

**Empfehlung:** Diese Features sollten entweder:
1. In zukünftigen Phasen implementiert werden, ODER
2. Aus der Spezifikation entfernt werden

### 4.2 Value-Validierung

Die `writePercent()` Methode lehnt Werte außerhalb 0-100 **ab** (gibt false zurück), anstatt sie zu begrenzen. Dies ist unterschiedlich zur Spezifikation, die Clamping erwartet.

```cpp
// Aktuelle Implementierung (pwm_controller.cpp:328-330)
if (percent < 0.0 || percent > 100.0) {
    LOG_ERROR("Invalid percentage...");
    return false;
}
```

### 4.3 GPIO Reservation

Der PWMController arbeitet mit dem GPIOManager zusammen:
1. `attachChannel()` ruft `gpioManager.requestPin(gpio, "actuator", "PWM")` auf
2. `detachChannel()` ruft `gpioManager.releasePin(gpio)` auf

Dies ist kritisch für GPIO-Konflikt-Tests.

---

## 5. Wokwi Test-Implementierung

Die folgenden YAML-Szenarien werden in `El Trabajante/tests/wokwi/scenarios/09-pwm/` erstellt:

| Datei | Tests |
|-------|-------|
| `pwm_init_success.yaml` | PWM-INIT-001 |
| `pwm_init_double.yaml` | PWM-INIT-002 |
| `pwm_init_channels_default.yaml` | PWM-INIT-003, PWM-INIT-004 |
| `pwm_init_end.yaml` | PWM-INIT-005 |
| `pwm_channel_attach.yaml` | PWM-CH-001, PWM-CH-003 |
| `pwm_channel_duplicate.yaml` | PWM-CH-002 |
| `pwm_channel_multi.yaml` | PWM-CH-004 |
| `pwm_channel_detach.yaml` | PWM-CH-006, PWM-CH-007, PWM-CH-008 |
| `pwm_duty_percent.yaml` | PWM-DUTY-001, PWM-DUTY-002, PWM-DUTY-003 |
| `pwm_duty_absolute.yaml` | PWM-DUTY-005, PWM-DUTY-006 |
| `pwm_duty_invalid.yaml` | PWM-DUTY-004 |
| `pwm_frequency_change.yaml` | PWM-FREQ-001, PWM-FREQ-002, PWM-FREQ-003 |
| `pwm_resolution_change.yaml` | PWM-RES-001, PWM-RES-002 |
| `pwm_safety_initial.yaml` | PWM-SAFE-001, PWM-SAFE-002 |
| `pwm_emergency_stop.yaml` | PWM-SAFE-003, PWM-SAFE-004 |
| `pwm_multi_channel.yaml` | PWM-MULTI-001, PWM-MULTI-002, PWM-MULTI-003, PWM-MULTI-004 |
| `pwm_integration_full_flow.yaml` | PWM-INT-001, PWM-INT-002, PWM-INT-003, PWM-INT-004 |

---

*Dieser Report dient als Grundlage für die Wokwi-Szenario-Entwicklung.*
