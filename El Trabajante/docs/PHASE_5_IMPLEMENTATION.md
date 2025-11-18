# Phase 5: Actuator System - Implementierungs-Dokumentation
**Version:** 1.0  
**Datum:** 2025-01-28  
**Zielgruppe:** KI-Agenten (Cursor, Claude) + Entwickler  
**Status:** 📝 IMPLEMENTIERUNGS-ANLEITUNG  
**Abhängig von:** Phase 0 (GPIO Manager ✅), Phase 2 (MQTTClient ✅), Phase 3 (PWMController ✅), Phase 4 (SensorManager ✅)

---

## 📊 Executive Summary

Phase 5 implementiert das **Actuator System** für die ESP32-Firmware. Das System ermöglicht die Steuerung von Aktoren (Pumpen, Ventile, PWM-Dimmer) via MQTT-Commands vom God-Kaiser Server. 

**Kernprinzipien:**
- ✅ **Server-Centric Architektur**: ESP32 macht nur GPIO-Control, keine komplexe Logik
- ✅ **MQTT-basierte Steuerung**: Commands vom Server, Responses zurück
- ✅ **Safety-First**: Emergency-Stop-Mechanismen auf allen Ebenen
- ✅ **Konsistenz**: Folgt exakt den Patterns aus Phase 0-4

**Module zu implementieren:**
1. ✅ `ActuatorManager` - Actuator-Orchestrierung (Skeleton vorhanden, erweitern)
2. ✅ `SafetyController` - Emergency-Stop & Recovery (neu)
3. ✅ `IActuatorDriver` Interface - Driver-Abstraktion (vorhanden)
4. ✅ `PumpActuator` - Pump-Driver (vorhanden, vervollständigen)
5. ✅ `PWMActuator` - PWM-Driver (vorhanden, vervollständigen)
6. ✅ `ValveActuator` - Valve-Driver (vorhanden, vervollständigen)
7. ✅ MQTT-Integration - Command-Handler in main.cpp
8. ✅ TopicBuilder-Erweiterung - Actuator-Topics (teilweise vorhanden)

**Gesamt-Zeilen:** ~1.600 Zeilen Production Code  
**Dauer:** 2 Wochen  
**Qualitäts-Ziel:** 4.9/5 (Industrial-Grade, konsistent mit Phase 0-4)

**Status-Update (2025-11-18):**  
- `ActuatorManager`, `SafetyController`, Pump-/PWM-/Valve-Driver implementiert  
- MQTT-Topics (Command/Response/Alert/Emergency) aktiv, main.cpp abonnierte Wildcards  
- ConfigManager besitzt Actuator-Load/Save-API (Option 3-ready), bleibt für Phase 5 server-centric (Option 2) deaktiviert  
- Neue Unity-Tests: TopicBuilder Phase-5-Topics & ActuatorType-Helper

---

## 🔍 Code-Analyse: Bestehende Implementierung

### ✅ Vorhandene Dateien (Skeleton/Partial)

#### 1. **services/actuator/actuator_manager.h/cpp** - ✅ Skeleton vorhanden
**Status:** Phase 3 Skeleton (89 Zeilen), muss erweitert werden  
**Vorhandene Features:**
- ✅ Singleton Pattern (konsistent mit Phase 1-4)
- ✅ Lifecycle: `begin()`, `end()`
- ✅ PWM-Actuator-Skeleton: `attachPwmActuator()`, `setPwmPercent()`, `detachPwmActuator()`
- ✅ Integration mit PWMController (Phase 3)

**Fehlende Features (Phase 5):**
- ❌ Actuator-Registry (Array von ActuatorConfig)
- ❌ MQTT-Command-Handler (`handleActuatorCommand()`)
- ❌ Actuator-Configuration (`configureActuator()`)
- ❌ Status-Publishing (`publishActuatorStatus()`)
- ❌ Response-Publishing (`publishActuatorResponse()`)
- ❌ Emergency-Stop-Integration (`emergencyStopAll()`)
- ❌ Recovery-Mechanismen (`clearEmergencyStop()`, `resumeOperation()`)

**Konsistenz-Check:**
- ✅ Singleton Pattern (wie WiFiManager, MQTTClient, SensorManager)
- ✅ Logger-Integration (LOG_INFO, LOG_ERROR)
- ✅ ErrorTracker-Integration (errorTracker.trackError())
- ✅ GPIO-Manager-Integration (gpio_manager_->requestPin()) - **HINWEIS:** Verwendet `requestPin()` API, nicht `reservePin()`

#### 2. **services/actuator/safety_controller.h/cpp** - ❌ Leer (neu zu erstellen)
**Status:** Dateien existieren, aber leer  
**Zu implementieren:**
- Emergency-Stop-Mechanismus (alle Aktoren sofort aus)
- Emergency-State-Management (NORMAL, EMERGENCY_ACTIVE, CLEARING, RESUMING)
- Recovery-Mechanismen (schrittweise Reaktivierung)
- Safety-Verification (Pre-Resume Checks)

**Abhängigkeiten:**
- ActuatorManager (für Hardware-Control)
- ErrorTracker (für Error-Logging)
- Logger (für Logging)

#### 3. **services/actuator/actuator_drivers/iactuator_driver.h** - ✅ Interface vorhanden
**Status:** Leer (nur Header-Guard)  
**Zu implementieren:**
```cpp
class IActuatorDriver {
public:
    virtual ~IActuatorDriver() = default;
    virtual bool init(uint8_t gpio) = 0;
    virtual bool setValue(float value) = 0;      // 0.0-1.0 für PWM
    virtual bool setBinary(bool state) = 0;      // ON/OFF für Digital
    virtual bool emergencyStop() = 0;
    virtual String getType() = 0;                // "pump", "valve", "pwm"
    virtual String getStatus() = 0;              // JSON-Status-String
};
```

#### 4. **services/actuator/actuator_drivers/pump_actuator.h/cpp** - ❌ Leer
**Status:** Dateien existieren, aber leer  
**Zu implementieren:**
- PumpActuator-Klasse (implementiert IActuatorDriver)
- Runtime-Tracking (Laufzeit-Monitoring)
- Max-Runtime-Protection (Safety-Timeout)
- ON/OFF-Control (Digital GPIO)

#### 5. **services/actuator/actuator_drivers/pwm_actuator.h/cpp** - ❌ Leer
**Status:** Dateien existieren, aber leer  
**Zu implementieren:**
- PWMActuator-Klasse (implementiert IActuatorDriver)
- PWM-Percentage-Control (0.0-1.0 → 0-255)
- Integration mit PWMController (Phase 3)
- Channel-Management

#### 6. **services/actuator/actuator_drivers/valve_actuator.h/cpp** - ❌ Leer
**Status:** Dateien existieren, aber leer  
**Zu implementieren:**
- ValveActuator-Klasse (implementiert IActuatorDriver)
- 3-Wege-Ventil-Control (Position: 0, 1, 2)
- State-Tracking (aktuelle Position)

#### 7. **models/actuator_types.h** - ✅ Teilweise vorhanden
**Status:** Strukturen vorhanden, aber vereinfacht  
**Vorhandene Strukturen:**
- ✅ `ActuatorConfig` (vereinfacht, String-basiert)
- ✅ `ActuatorCommand` (MQTT-Payload)
- ✅ `ActuatorStatus` (MQTT-Payload)

**Fehlende Features:**
- ❌ `ActuatorResponse` (für MQTT-Response-Topic)
- ❌ `EmergencyState` Enum (für SafetyController)
- ❌ `RecoveryConfig` Struct (für Recovery-Mechanismen)

#### 8. **utils/topic_builder.h/cpp** - ✅ Teilweise vorhanden
**Status:** 2 Actuator-Topics vorhanden, 2 fehlen  
**Vorhandene Topics:**
- ✅ `buildActuatorCommandTopic(uint8_t gpio)` - Pattern 3
- ✅ `buildActuatorStatusTopic(uint8_t gpio)` - Pattern 4

**Fehlende Topics (Phase 5):**
- ❌ `buildActuatorResponseTopic(uint8_t gpio)` - Response-Topic
- ❌ `buildActuatorAlertTopic(uint8_t gpio)` - Alert-Topic
- ❌ `buildActuatorEmergencyTopic()` - ESP-spezifischer Emergency-Topic

**Topic-Patterns (gemäß Mqtt_Protocoll.md):**
- Command: `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` ✅
- Status: `kaiser/god/esp/{esp_id}/actuator/{gpio}/status` ✅
- Response: `kaiser/god/esp/{esp_id}/actuator/{gpio}/response` ❌
- Alert: `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert` ❌
- Emergency: `kaiser/god/esp/{esp_id}/actuator/emergency` ❌

---

## 📋 Implementierungs-Reihenfolge (Phase 5)

### Tag 0: Architektur-Entscheidungen (KRITISCH)
**Ziel:** Klärung offener Architektur-Fragen vor Implementierung

**Entscheidungen zu treffen:**

1. ✅ **ConfigManager Actuator-API:**
   - **Option 1:** ConfigManager erweitern (`loadActuatorConfig()`/`saveActuatorConfig()` implementieren)
   - **Option 2:** Nur MQTT-basierte Config (Server-Centric, kein NVS) - **EMPFOHLEN für Phase 5**
   - **Option 3:** Hybrid (MQTT Primary + NVS Cache) - **EMPFOHLEN für Phase 6+**
   - **Aktueller Stand:** ConfigManager-Methoden sind in Phase 1 auskommentiert (siehe `config_manager.h:54-55`)

2. ✅ **Actuator-Config-Loading:**
   - **Wenn Option 1:** ConfigManager::loadActuatorConfig() implementieren (siehe Abschnitt "Tag 15 (Optional)")
   - **Wenn Option 2:** Config nur via MQTT-Topic empfangen (Server-Centric)
   - **Wenn Option 3:** Beide Methoden implementieren (mit Priority-Logic)

3. ✅ **GPIO-Conflict-Detection:**
   - SensorManager.hasSensorOnGPIO() verwenden
   - In ActuatorManager.configureActuator() prüfen

**⚠️ WICHTIGER HINWEIS: ConfigManager Actuator-Config-API**

**Status:** Die ConfigManager-Methoden für Actuator-Configs sind in Phase 1 **auskommentiert**:
- `loadActuatorConfig()` ❌ nicht verfügbar (Zeile 54 in `config_manager.h`)
- `saveActuatorConfig()` ❌ nicht verfügbar (Zeile 55 in `config_manager.h`)

**Lösungsoptionen für Phase 5:**

**Option 1: ConfigManager erweitern (empfohlen für Persistenz)**
- `config_manager.h` Zeile 54-55 auskommentieren
- Implementierung in `config_manager.cpp` hinzufügen
- NVS-Keys aus `NVS_KEYS.md` verwenden (`actuator_config` Namespace)
- Konsistent mit SensorManager-Pattern

**Option 2: Nur MQTT-basierte Config (Server-Centric)** ⭐ **EMPFOHLEN für Phase 5**
- Actuator-Configs werden **nur** via MQTT Config-Topic empfangen
- ActuatorManager speichert Configs nur in RAM (nicht NVS)
- Vorteil: Konsistent mit Server-Centric Architektur
- Nachteil: Configs gehen bei Reboot verloren (Server sendet bei Reconnect)

**Option 3: Hybrid-Ansatz** ⭐ **EMPFOHLEN für Phase 6+**
- MQTT-Config als Primary Source (Server hat Wahrheit)
- NVS-Cache für Offline-Betrieb (Fallback)
- ActuatorManager lädt aus NVS, aktualisiert via MQTT

**Empfehlung:**
- Für Phase 5: **Option 2** (MQTT-only, Server-Centric) - **zukunftssicher, robust, industrietauglich**
- Für Phase 6+: **Option 3** (Hybrid mit NVS-Cache) - **für Offline-Resilience**

**Entscheidungsnotiz (2025-11-18):**  
Option **2 (MQTT-only)** wurde final bestätigt. Für Phase 5 werden Actuator-Configs ausschließlich vom God-Kaiser-Server per MQTT übertragen und nur im RAM gehalten. Persistente Speicherung (Option 1 / 3) bleibt explizit Aufgabe von Phase 6+, inklusive NVS-Key-Pflege aus `NVS_KEYS.md`.  

**Action Item (aktualisiert):**
- [x] Entscheidung treffen (Option 2 ✅, dokumentiert)
- [ ] Wenn Option 2/3: main.cpp Setup entsprechend anpassen
- [ ] (Phase 6+) ConfigManager erweitern (siehe Abschnitt "Tag 15 (Optional)")

**Erfolgs-Kriterium:** Alle Architektur-Fragen geklärt, Implementierung kann starten

---

### Tag 1-2: Actuator Types & Models
**Ziel:** Datenstrukturen vervollständigen

**Aufgaben:**
1. ✅ `models/actuator_types.h` erweitern:
   - `ActuatorResponse` Struct hinzufügen
   - `EmergencyState` Enum hinzufügen
   - `RecoveryConfig` Struct hinzufügen
   - Utility-Funktionen: `getActuatorTypeString()`, `validateActuatorValue()`

2. ✅ Konsistenz-Check:
   - Vergleich mit `models/sensor_types.h` (Phase 4)
   - String-basierte Typen (Server-Centric)
   - MQTT-Payload-Strukturen (gemäß Mqtt_Protocoll.md)

**Erfolgs-Kriterium:** Alle Datenstrukturen definiert, konsistent mit Phase 4

---

### Tag 3-4: IActuatorDriver Interface
**Ziel:** Driver-Interface implementieren

**Aufgaben:**
1. ✅ `services/actuator/actuator_drivers/iactuator_driver.h` implementieren:
   ```cpp
   class IActuatorDriver {
   public:
       virtual ~IActuatorDriver() = default;
       virtual bool init(uint8_t gpio) = 0;
       virtual bool setValue(float value) = 0;      // 0.0-1.0
       virtual bool setBinary(bool state) = 0;      // true/false
       virtual bool emergencyStop() = 0;
       virtual String getType() = 0;
       virtual String getStatus() = 0;
   };
   ```

2. ✅ Konsistenz-Check:
   - Vergleich mit `ISensorDriver` (Phase 4) - ähnliche Struktur
   - Virtual Destructor (Memory-Safety)
   - Return-Types (bool für Success/Failure)

**Erfolgs-Kriterium:** Interface definiert, dokumentiert, konsistent mit Phase 4

---

### Tag 5-6: Actuator Drivers (Pump, PWM, Valve)
**Ziel:** Konkrete Driver-Implementierungen

#### 5.1 PumpActuator
**Datei:** `services/actuator/actuator_drivers/pump_actuator.h/cpp`

**Features:**
- ✅ ON/OFF-Control (Digital GPIO)
- ✅ Runtime-Tracking (millis()-basiert)
- ✅ Max-Runtime-Protection (Safety-Timeout, default: 3600000ms = 1h)
- ✅ Emergency-Stop (sofort aus)
- ✅ Status-Reporting (JSON-String)

**API:**
```cpp
class PumpActuator : public IActuatorDriver {
public:
    PumpActuator();
    ~PumpActuator();
    
    // IActuatorDriver Interface
    bool init(uint8_t gpio) override;
    bool setValue(float value) override;      // value > 0.5 = ON, else OFF
    bool setBinary(bool state) override;     // true = ON, false = OFF
    bool emergencyStop() override;
    String getType() override;                // "pump"
    String getStatus() override;              // JSON mit state, runtime_ms, etc.
    
    // Pump-specific
    unsigned long getRuntime() const;
    void resetRuntime();
    bool isRunning() const;
    void setMaxRuntime(unsigned long max_runtime_ms);
    
    // 🆕 PHASE 5: Runtime-Protection (Industrial Best Practice)
    struct RuntimeProtection {
        unsigned long max_runtime_ms = 3600000;           // 1 hour - Single-Run-Limit
        uint16_t max_activations_per_hour = 60;           // Duty-Cycle-Protection
        unsigned long cooldown_ms = 30000;                // 30s Cooldown nach Max-Runtime
        unsigned long activation_window_ms = 3600000;     // 1 hour - Rolling Window
    };
    void setRuntimeProtection(const RuntimeProtection& protection);
    bool canActivate() const;  // Pre-Check vor Aktivierung
    
private:
    uint8_t gpio_;
    bool state_;
    unsigned long start_time_;
    unsigned long runtime_ms_;
    bool emergency_stopped_;
    
    // 🆕 Runtime-Protection State
    RuntimeProtection protection_;
    unsigned long last_stop_time_;                         // Letzter Stop-Timestamp
    uint16_t activations_in_window_;                       // Aktivierungen im Rolling-Window
    unsigned long activation_timestamps_[60];              // Circular-Buffer für Timestamps
    uint8_t activation_index_;                             // Index im Circular-Buffer
};
```

**Implementierung:**
- GPIO-Manager-Integration: `gpio_manager_->requestPin(gpio_, "actuator", actuator_name.c_str())` - **HINWEIS:** Verwendet `requestPin()` API mit Owner-String
- Logger-Integration: `LOG_INFO()`, `LOG_ERROR()`
- ErrorTracker-Integration: `errorTracker.trackError(ERROR_ACTUATOR_*, ...)`

**Runtime-Protection-Logik (Industrial Best Practice):**

**Problem:** Motor-Überhitzung bei schnellen ON/OFF-Zyklen

**Lösung:** Duty-Cycle-Protection mit Rolling-Window

**Implementierung:**

```cpp
bool PumpActuator::canActivate() const {
    // Check 1: Cooldown nach Max-Runtime erreicht
    if (runtime_ms_ >= protection_.max_runtime_ms) {
        unsigned long time_since_stop = millis() - last_stop_time_;
        if (time_since_stop < protection_.cooldown_ms) {
            LOG_WARNING("Pump GPIO " + String(gpio_) + " in cooldown: " + 
                       String(protection_.cooldown_ms - time_since_stop) + "ms remaining");
            return false;
        }
    }
    
    // Check 2: Duty-Cycle-Limit (Rolling-Window)
    uint16_t activations_in_last_hour = 0;
    unsigned long now = millis();
    unsigned long window_start = now - protection_.activation_window_ms;
    
    for (uint8_t i = 0; i < 60; i++) {
        if (activation_timestamps_[i] > window_start) {
            activations_in_last_hour++;
        }
    }
    
    if (activations_in_last_hour >= protection_.max_activations_per_hour) {
        LOG_WARNING("Pump GPIO " + String(gpio_) + " duty-cycle limit reached: " + 
                   String(activations_in_last_hour) + "/" + 
                   String(protection_.max_activations_per_hour) + " activations/hour");
        return false;
    }
    
    return true;
}

bool PumpActuator::setBinary(bool state) {
    if (state && !canActivate()) {
        // Runtime-Protection verhindert Aktivierung
        errorTracker.trackError(ERROR_ACTUATOR_SET_FAILED, ERROR_SEVERITY_WARNING,
                               "Pump activation blocked by runtime protection");
        return false;
    }
    
    if (state && !state_) {
        // Track activation
        activation_timestamps_[activation_index_] = millis();
        activation_index_ = (activation_index_ + 1) % 60;  // Circular-Buffer
        activations_in_window_++;
    }
    
    // Normal ON/OFF control...
    state_ = state;
    digitalWrite(gpio_, state ? HIGH : LOW);
    
    if (state) {
        start_time_ = millis();
    } else {
        runtime_ms_ += millis() - start_time_;
        last_stop_time_ = millis();
    }
    
    return true;
}
```

**Konsistenz-Check:**
- ✅ Vergleich mit Industrial Pump-Control-Standards (SCADA)
- ✅ Verhindert Motor-Überhitzung durch Duty-Cycle-Schutz
- ✅ Rolling-Window-Algorithmus (bekannt aus Rate-Limiting)
- ✅ Cooldown nach Max-Runtime (verhindert sofortige Reaktivierung)

**Erfolgs-Kriterium:** Pumpen-Motor wird vor Überhitzung geschützt, Lebensdauer erhöht sich

#### 5.2 PWMActuator
**Datei:** `services/actuator/actuator_drivers/pwm_actuator.h/cpp`

**Features:**
- ✅ PWM-Percentage-Control (0.0-1.0 → 0-255)
- ✅ Integration mit PWMController (Phase 3)
- ✅ Channel-Management (attach/detach)
- ✅ Emergency-Stop (PWM = 0)

**API:**
```cpp
class PWMActuator : public IActuatorDriver {
public:
    PWMActuator();
    ~PWMActuator();
    
    // IActuatorDriver Interface
    bool init(uint8_t gpio) override;
    bool setValue(float value) override;      // 0.0-1.0 → PWM 0-255
    bool setBinary(bool state) override;     // true = 100%, false = 0%
    bool emergencyStop() override;
    String getType() override;                // "pwm"
    String getStatus() override;              // JSON mit pwm_value, percent, etc.
    
private:
    uint8_t gpio_;
    uint8_t pwm_channel_;
    uint8_t pwm_value_;                      // 0-255
    bool emergency_stopped_;
};
```

**Implementierung:**
- PWMController-Integration: `pwmController.attachChannel(gpio_, pwm_channel_)`
- PWM-Wert-Berechnung: `pwm_value_ = (uint8_t)(value * 255.0)`
- GPIO-Manager-Integration: `gpio_manager_->requestPin(gpio_, "actuator", actuator_name.c_str())` - **HINWEIS:** Verwendet `requestPin()` API

#### 5.3 ValveActuator
**Datei:** `services/actuator/actuator_drivers/valve_actuator.h/cpp`

**Features:**
- ✅ 3-Wege-Ventil-Control (Position: 0, 1, 2)
- ✅ State-Tracking (aktuelle Position)
- ✅ Digital-Control (2 GPIO-Pins für Position)

**API:**
```cpp
class ValveActuator : public IActuatorDriver {
public:
    ValveActuator();
    ~ValveActuator();
    
    // IActuatorDriver Interface
    bool init(uint8_t gpio) override;        // gpio = Direction-Pin, gpio+1 = Enable-Pin
    bool setValue(float value) override;      // 0.0 = Pos 0, 0.5 = Pos 1, 1.0 = Pos 2
    bool setBinary(bool state) override;     // true = Pos 1, false = Pos 0
    bool emergencyStop() override;           // Position 0 (Safe)
    String getType() override;                // "valve"
    String getStatus() override;              // JSON mit position, etc.
    
    // 🆕 Valve-specific Configuration
    void setTransitionTime(unsigned long transition_time_ms);  // Full-Travel-Time (Pos 0 → Pos 2)
    uint8_t getCurrentPosition() const { return current_position_; }
    bool isMoving() const;
    
private:
    uint8_t gpio_direction_;                    // IN1 (Direction)
    uint8_t gpio_enable_;                       // IN2 (Enable)
    uint8_t current_position_;                  // 0, 1, 2
    uint8_t target_position_;                   // 0, 1, 2
    bool emergency_stopped_;
    
    // Time-Based Positioning
    unsigned long transition_time_ms_;          // Default: 5000ms (5s)
    unsigned long move_start_time_;
    bool is_moving_;
    
    void moveToPosition(uint8_t target_pos);
    void stopMovement();
};
```

**Implementierung:**

**GPIO-Pin-Assignment (L298N-Driver-Pattern):**

- `gpio_direction_` (IN1): Direction Control (LOW = Close, HIGH = Open)
- `gpio_enable_` (IN2): Enable Control (HIGH = Motor ON, LOW = Motor OFF)

**⚠️ WICHTIG:** Echte 3-Wege-Ventile benötigen Feedback-Pins (R1/R2) oder Time-Based Positioning. Da ESP32-Projekte typischerweise keine Feedback-Sensoren haben, verwenden wir **Time-Based Positioning** (Industrial Standard).

**Position-Control-Strategie:**

```cpp
// Position 0 (Closed): Motor reverse für transition_time_ms
// Position 1 (Mid):    Motor forward für (transition_time_ms / 2)
// Position 2 (Open):   Motor forward für transition_time_ms
// Beispiel: Ventil mit 5s Full-Travel-Time
// Pos 0 → Pos 1: Forward 2.5s
// Pos 1 → Pos 2: Forward 2.5s
// Pos 2 → Pos 0: Reverse 5s
```

**Implementierung (Time-Based Positioning):**

```cpp
bool ValveActuator::setValue(float value) {
    // Map 0.0-1.0 → Position 0-2
    uint8_t target_pos = (uint8_t)(value * 2.0);
    if (target_pos > 2) target_pos = 2;
    
    if (target_pos == current_position_) {
        return true;  // Already at target position
    }
    
    moveToPosition(target_pos);
    return true;
}

void ValveActuator::moveToPosition(uint8_t target_pos) {
    target_position_ = target_pos;
    is_moving_ = true;
    move_start_time_ = millis();
    
    // Calculate movement time
    int8_t position_delta = target_pos - current_position_;  // -2 to +2
    unsigned long move_time_ms = abs(position_delta) * (transition_time_ms_ / 2);
    
    // Set direction
    if (position_delta > 0) {
        // Move forward (Open direction)
        digitalWrite(gpio_direction_, HIGH);
    } else {
        // Move reverse (Close direction)
        digitalWrite(gpio_direction_, LOW);
    }
    
    // Enable motor
    digitalWrite(gpio_enable_, HIGH);
    
    // Schedule stop (in ActuatorManager loop or timer)
    // Nach move_time_ms:
    // - digitalWrite(gpio_enable_, LOW)
    // - current_position_ = target_position_
    // - is_moving_ = false
}
```

**Konsistenz-Check:**
- ✅ Vergleich mit L298N-Driver-Tutorial für Linear Actuators (esp32io.com)
- ✅ Time-Based Positioning ist Industrial Standard ohne Feedback
- ✅ 2-GPIO-Pin-Control (Direction + Enable) ist üblich
- ✅ Emergency-Stop setzt Enable = LOW (sofortiger Stop)

**Erfolgs-Kriterium:** Valve-Position-Control ist eindeutig definiert, Hardware-Implementation möglich

**Erfolgs-Kriterium:** Alle 3 Driver implementiert, getestet, konsistent mit Phase 4 Patterns

---

### Tag 7-8: ActuatorManager Erweiterung
**Ziel:** ActuatorManager von Skeleton zu vollständiger Implementierung

**Aufgaben:**
1. ✅ Actuator-Registry implementieren:
   ```cpp
   struct RegisteredActuator {
       uint8_t gpio;
       IActuatorDriver* driver;
       ActuatorConfig config;
       bool emergency_stopped;
   };
   
   // MAX_ACTUATORS Definition (board-spezifisch):
   #ifdef XIAO_ESP32C3_MODE
       static const uint8_t MAX_ACTUATORS = 8;   // NVS: actuator_0..7
   #else
       static const uint8_t MAX_ACTUATORS = 12;  // NVS: actuator_0..11
   #endif
   
   RegisteredActuator actuators_[MAX_ACTUATORS];
   uint8_t actuator_count_;
   
   // Hinweis: Board-Detection erfolgt via GPIO-Manager (Phase 0)
   // gpio_manager_->getBoardType() gibt BoardType zurück
   ```

2. ✅ Actuator-Management-Methoden:
   - `bool configureActuator(const ActuatorConfig& config)` - Actuator registrieren
   - `bool removeActuator(uint8_t gpio)` - Actuator entfernen
   - `bool hasActuatorOnGPIO(uint8_t gpio) const` - GPIO-Check
   - `ActuatorConfig getActuatorConfig(uint8_t gpio) const` - Config abrufen

3. ✅ Control-Methoden:
   - `bool controlActuator(uint8_t gpio, float value)` - Wert setzen
   - `bool controlActuatorBinary(uint8_t gpio, bool state)` - ON/OFF
   - `bool emergencyStopAll()` - Alle Aktoren aus
   - `bool emergencyStopActuator(uint8_t gpio)` - Einzelner Aktor aus

4. ✅ MQTT-Integration:
   - `bool handleActuatorCommand(const String& payload)` - Command-Handler
   - `void publishActuatorStatus(uint8_t gpio)` - Status-Publish
   - `void publishActuatorResponse(uint8_t gpio, bool success, const String& message)` - Response-Publish
   - `void publishActuatorAlert(uint8_t gpio, const String& alert_type, const String& message)` - Alert-Publish

5. ✅ Recovery-Mechanismen:
   - `bool clearEmergencyStop()` - Emergency-Flags zurücksetzen
   - `bool clearEmergencyStopActuator(uint8_t gpio)` - Einzelner Clear
   - `bool getEmergencyStopStatus(uint8_t gpio) const` - Status-Query
   - `bool resumeOperation()` - Schrittweise Reaktivierung (mit SafetyController)

**API (vollständig):**
```cpp
class ActuatorManager {
public:
    static ActuatorManager& getInstance();
    
    // Lifecycle
    bool begin();
    void end();
    
    // Actuator Management
    bool configureActuator(const ActuatorConfig& config);
    bool removeActuator(uint8_t gpio);
    bool hasActuatorOnGPIO(uint8_t gpio) const;
    ActuatorConfig getActuatorConfig(uint8_t gpio) const;
    uint8_t getActiveActuatorCount() const;
    
    // Control Operations
    bool controlActuator(uint8_t gpio, float value);
    bool controlActuatorBinary(uint8_t gpio, bool state);
    bool emergencyStopAll();
    bool emergencyStopActuator(uint8_t gpio);
    
    // Recovery Operations
    bool clearEmergencyStop();
    bool clearEmergencyStopActuator(uint8_t gpio);
    bool getEmergencyStopStatus(uint8_t gpio) const;
    bool resumeOperation();  // Delegiert an SafetyController
    
    // MQTT Integration
    bool handleActuatorCommand(const String& topic, const String& payload);
    void publishActuatorStatus(uint8_t gpio);
    void publishActuatorResponse(uint8_t gpio, bool success, const String& message);
    void publishActuatorAlert(uint8_t gpio, const String& alert_type, const String& message);
    
    // Status
    void printActuatorStatus() const;
    bool isInitialized() const { return initialized_; }
    
private:
    ActuatorManager();
    RegisteredActuator* findActuator(uint8_t gpio);
    IActuatorDriver* createDriver(const String& actuator_type);
    bool validateCommand(uint8_t gpio, float value) const;
    
    RegisteredActuator actuators_[MAX_ACTUATORS];
    uint8_t actuator_count_;
    bool initialized_;
    
    // Component References (nur gpio_manager als Pointer, Rest als globale Singletons)
    class GPIOManager* gpio_manager_;  // Pointer für GPIO-Manager
    
    // Hinweis: Andere Components werden direkt verwendet:
    // - errorTracker (global)
    // - mqttClient (global)
    // - sensorManager (global für Conflict-Detection)
};
```

**Implementierungs-Details:**
- **Driver-Factory:** `createDriver()` erstellt Driver basierend auf `actuator_type` String
- **GPIO-Conflict-Detection:** Prüft ob GPIO bereits reserviert (via GPIO-Manager) **UND** ob Sensor auf GPIO existiert (via SensorManager)
- **Command-Validation:** Prüft GPIO-Gültigkeit, Wert-Range, Emergency-Status
- **MQTT-Payload-Parsing:** JSON-Parsing (manuell, ohne externe Library, wie Phase 4)

**Component-Access-Pattern:**

**Wichtig:** ActuatorManager verwendet das gleiche Pattern wie SensorManager:

**GPIO-Manager:** Pointer-Member
```cpp
class GPIOManager* gpio_manager_;  // Im Constructor: gpio_manager_ = &GPIOManager::getInstance();
```

**Andere Components:** Direkte Singleton-Verwendung
```cpp
errorTracker.trackError(...)     // Nicht: this->error_tracker_->trackError()
mqttClient.safePublish(...)      // Nicht: this->mqtt_client_->publish()
sensorManager.hasSensorOnGPIO(...) // Für Conflict-Detection
```

**Konsistenz-Begründung:** SensorManager verwendet gleiches Pattern (siehe `sensor_manager.h:131-142`)

**Konsistenz-Check:**
- Vergleich mit `SensorManager` (Phase 4):
  - ✅ Registry-Pattern (Array von Configs)
  - ✅ GPIO-basierte Verwaltung
  - ✅ MQTT-Publishing (Status, Response)
  - ✅ Error-Handling (ErrorTracker)

**Erfolgs-Kriterium:** ActuatorManager vollständig implementiert, alle Methoden funktional

---

### Tag 9-10: SafetyController Implementierung
**Ziel:** Emergency-Stop & Recovery-Mechanismen

**Datei:** `services/actuator/safety_controller.h/cpp`

**Features:**
- ✅ Emergency-Stop-Mechanismus (alle Aktoren sofort aus)
- ✅ Emergency-State-Management (State-Machine)
- ✅ Recovery-Mechanismen (schrittweise Reaktivierung)
- ✅ Safety-Verification (Pre-Resume Checks)

**API:**
```cpp
enum EmergencyState {
    EMERGENCY_NORMAL,           // Normal-Betrieb
    EMERGENCY_ACTIVE,           // Emergency-Stop aktiv
    EMERGENCY_CLEARING,         // Emergency wird zurückgesetzt
    EMERGENCY_RESUMING          // Schrittweise Reaktivierung
};

class SafetyController {
public:
    static SafetyController& getInstance();
    
    // Lifecycle
    bool begin();
    void end();
    
    // Emergency Operations
    bool emergencyStopAll(const String& reason);
    bool emergencyStopActuator(uint8_t gpio, const String& reason);
    bool isEmergencyActive() const;
    bool isEmergencyActive(uint8_t gpio) const;
    EmergencyState getEmergencyState() const { return emergency_state_; }
    
    // Recovery Operations
    bool clearEmergencyStop();
    bool clearEmergencyStopActuator(uint8_t gpio);
    bool resumeOperation();  // Schrittweise Reaktivierung mit Delays
    bool verifyActuatorSafety(uint8_t gpio) const;  // Pre-Resume Check
    
    // Recovery Configuration
    struct RecoveryConfig {
        uint32_t inter_actuator_delay = 2000;     // 2s zwischen Aktoren
        bool critical_first = true;               // Kritische zuerst
        uint32_t verification_timeout = 5000;     // 5s pro Aktor
        uint8_t max_retry_attempts = 3;           // 3 Versuche
    };
    void setRecoveryConfig(const RecoveryConfig& config);
    
    // Status
    String getEmergencyReason() const;
    String getRecoveryProgress() const;
    
private:
    SafetyController();
    bool verifySystemSafety() const;
    void logEmergencyEvent(const String& reason, uint8_t gpio = 255);
    
    EmergencyState emergency_state_;
    String emergency_reason_;
    unsigned long emergency_timestamp_;
    RecoveryConfig recovery_config_;
    bool initialized_;
};
```

**Implementierung:**
- **Emergency-Stop:** Delegiert an `ActuatorManager::emergencyStopAll()`
- **Recovery-Logic:** Schrittweise Reaktivierung mit Delays (2s zwischen Aktoren)
- **Safety-Verification:** Prüft System-Status vor Recovery (WiFi, MQTT, Heap)
- **Error-Logging:** Alle Emergency-Events werden geloggt (Logger + ErrorTracker)

**Konsistenz-Check:**
- Vergleich mit `PiEnhancedProcessor` (Phase 4):
  - ✅ Singleton Pattern
  - ✅ Circuit-Breaker-ähnliche Logik (State-Machine)
  - ✅ Recovery-Mechanismen (mit Delays)

**Erfolgs-Kriterium:** SafetyController vollständig implementiert, Emergency-Stop funktional

---

### Tag 11-12: TopicBuilder Erweiterung
**Ziel:** Fehlende Actuator-Topics hinzufügen

**Aufgaben:**
1. ✅ `utils/topic_builder.h` erweitern:
   ```cpp
   // Phase 5: Actuator Topics
   static const char* buildActuatorResponseTopic(uint8_t gpio);
   static const char* buildActuatorAlertTopic(uint8_t gpio);
   static const char* buildActuatorEmergencyTopic();
   ```

2. ✅ `utils/topic_builder.cpp` implementieren:
   - `buildActuatorResponseTopic()`: `kaiser/god/esp/{esp_id}/actuator/{gpio}/response`
   - `buildActuatorAlertTopic()`: `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert`
   - `buildActuatorEmergencyTopic()`: `kaiser/god/esp/{esp_id}/actuator/emergency`

3. ✅ Buffer-Overflow-Protection (wie Phase 1):
   - `validateTopicBuffer()` verwenden (bereits vorhanden)
   - `snprintf()` return-value prüfen
   - Fehler-Logging bei Truncation

**Konsistenz-Check:**
- Vergleich mit Phase 1 TopicBuilder:
  - ✅ Gleiche Buffer-Größe (256 bytes)
  - ✅ Gleiche Buffer-Validation-Logic
  - ✅ Gleiche Error-Handling-Patterns

**Erfolgs-Kriterium:** Alle Actuator-Topics implementiert, Buffer-Protection aktiv

---

### Tag 13-14: MQTT-Integration in main.cpp
**Ziel:** Actuator-Commands in main.cpp integrieren

**Aufgaben:**
1. ✅ MQTT-Callback erweitern (Zeile ~182):
   ```cpp
   mqttClient.setCallback([](const String& topic, const String& payload) {
       LOG_INFO("MQTT message received: " + topic);
       LOG_DEBUG("Payload: " + payload);
       
       // Actuator Commands (Phase 5)
       String actuator_command_pattern = TopicBuilder::buildActuatorCommandTopic(0);
       actuator_command_pattern.replace("/0/command", "/");  // Wildcard-Pattern
       if (topic.startsWith(actuator_command_pattern)) {
           actuatorManager.handleActuatorCommand(topic, payload);
       }
       
       // Emergency Stop (Phase 5)
       String emergency_topic = TopicBuilder::buildActuatorEmergencyTopic();
       if (topic == emergency_topic) {
           safetyController.emergencyStopAll("MQTT Emergency Command");
       }
       
       // Broadcast Emergency (bereits vorhanden)
       String broadcast_emergency = TopicBuilder::buildBroadcastEmergencyTopic();
       if (topic == broadcast_emergency) {
           safetyController.emergencyStopAll("Broadcast Emergency");
       }
       
       // Sensor Config (Phase 4 - bereits vorhanden)
       String config_topic = TopicBuilder::buildConfigTopic();
       if (topic == config_topic) {
           handleSensorConfig(payload);
       }
   });
   ```

2. ✅ Actuator-Config-Handler hinzufügen:
   ```cpp
   void handleActuatorConfig(const String& payload) {
       LOG_INFO("Handling actuator configuration from MQTT");
       
       // JSON-Parsing (manuell, wie handleSensorConfig)
       // Expected: {"actuators": [{"gpio": 5, "actuator_type": "pump", ...}]}
       
       // Parse actuators array (manuelles Parsing, keine ArduinoJson)
       // For each actuator: actuatorManager.configureActuator(config)
       
       // ⚠️ HINWEIS: NVS-Speicherung optional (abhängig von Architektur-Entscheidung Tag 0)
       // Option 1: configManager.saveActuatorConfig(config) - wenn ConfigManager erweitert
       // Option 2: Keine NVS-Speicherung (Server-Centric, Config nur in RAM)
   }
   ```

3. ✅ MQTT-Subscriptions hinzufügen:
   ```cpp
   // In setup(), nach mqttClient.setCallback()
   
   // Subscribe zu allen Actuator-Command-Topics (Wildcard)
   // Pattern: kaiser/god/esp/{esp_id}/actuator/+/command
   String actuator_command_wildcard = TopicBuilder::buildActuatorCommandTopic(0);
   actuator_command_wildcard.replace("/0/command", "/+/command");  // MQTT Wildcard
   mqttClient.subscribe(actuator_command_wildcard.c_str());
   LOG_INFO("Subscribed to actuator commands: " + actuator_command_wildcard);
   
   // Subscribe zu ESP-spezifischem Emergency-Topic
   String emergency_topic = TopicBuilder::buildActuatorEmergencyTopic();
   mqttClient.subscribe(emergency_topic.c_str());
   LOG_INFO("Subscribed to emergency: " + emergency_topic);
   
   // Subscribe zu Broadcast-Emergency (bereits vorhanden in Phase 2)
   String broadcast_emergency = TopicBuilder::buildBroadcastEmergencyTopic();
   mqttClient.subscribe(broadcast_emergency.c_str());
   LOG_INFO("Subscribed to broadcast emergency: " + broadcast_emergency);
   ```
   
   **Hinweis:** MQTT-Wildcard-Subscriptions
   - `+` = Wildcard für eine Topic-Ebene
   - Beispiel: `kaiser/god/esp/ESP123/actuator/+/command` matched alle GPIOs
   - Alternative: Jedes GPIO einzeln subscriben (nicht empfohlen, zu viele Subscriptions)
   
   **⚠️ Security-Hinweis für Production (Phase 6+):**
   
   **Phase 5 (Development/Internal Network):** ✅ **AKZEPTABEL**
   - Wildcard-Subscriptions sind sicher in **trusted internal networks**
   - ESP32 subscribed nur zu eigenen Topics (kaiser/god/esp/{eigene_esp_id}/...)
   - Kein externes Internet-Exposure
   
   **Phase 6+ (Production/Public Deployment):** ⚠️ **SECURITY-IMPROVEMENTS ERFORDERLICH**
   
   Wildcard-Subscriptions können Security-Risk sein ohne entsprechende Absicherung:
   
   **Risiko 1: Topic-Injection-Angriffe**
   - Angreifer könnte Topics erstellen die vom Wildcard gematched werden
   - Beispiel: `kaiser/god/esp/OTHER_ESP/actuator/5/command` wird gematched
   - Lösung: **MQTT-Broker mit ACL (Access Control List) konfigurieren**
   
   **Risiko 2: Man-in-the-Middle (MITM)**
   - Unverschlüsselte MQTT-Nachrichten können abgefangen/modifiziert werden
   - Lösung: **TLS/SSL mit Client-Certificates (mTLS) aktivieren**
   
   **Empfohlene Security-Maßnahmen für Phase 6+:**
   
   1. **MQTT-Broker ACL-Configuration:**
      ```yaml
      # Beispiel: Mosquitto ACL (mosquitto_acl.conf)
      # ESP32 darf nur eigene Topics subscriben
      user esp_ESP123
      topic read kaiser/god/esp/ESP123/actuator/+/command
      topic write kaiser/god/esp/ESP123/actuator/+/status
      topic write kaiser/god/esp/ESP123/actuator/+/response
      ```
   
   2. **TLS/SSL Encryption (MQTT over TLS):**
      ```cpp
      // In Phase 6: MQTTClient mit TLS erweitern
      mqttClient.setSecure(true);  // Enable TLS
      mqttClient.setCACert(ca_cert);  // Root CA Certificate
      mqttClient.setClientCert(client_cert);  // mTLS Client Certificate
      mqttClient.setPrivateKey(client_key);   // mTLS Private Key
      ```
   
   3. **Client-Authentication (Username/Password + Certificates):**
      ```cpp
      mqttClient.setCredentials("esp_ESP123", "secure_password");
      ```
   
   4. **Topic-Permissions-Enforcement:**
      - ESP32 darf nur Topics mit eigener `esp_id` subscriben/publishen
      - Broker enforced Permissions (ACL), nicht Client-seitig
   
   5. **Network-Segmentation:**
      - IoT-Devices in separatem VLAN/Subnet
      - Firewall-Rules: Nur MQTT-Port (8883 für TLS) erlauben
   
   **Alternative für Ultra-High-Security (nicht empfohlen für Standard-Use-Cases):**
   - Einzelne Subscriptions pro GPIO (keine Wildcards)
   - Nachteil: 12 Subscriptions (WROOM) / 8 Subscriptions (XIAO) → höherer Overhead
   - Vorteil: Granulare Control, kein Wildcard-Risiko
   
   **Konsistenz mit Industrial IoT Best Practices:**
   - ✅ AWS IoT Core: TLS + Certificate-based Authentication (Standard)
   - ✅ Azure IoT Hub: TLS + SAS Tokens + Device-ID-based Authorization
   - ✅ HiveMQ: TLS + RBAC + Client-Certificates (Industrial Grade)
   
   **Erfolgs-Kriterium Phase 6+:**
   - ✅ TLS/SSL aktiviert (MQTT Port 8883)
   - ✅ MQTT-Broker mit ACL konfiguriert
   - ✅ Client-Certificates implementiert (mTLS)
   - ✅ Topic-Permissions enforced (ESP kann nur eigene Topics nutzen)
   
   **Konsistenz-Check:**
   - Sensor: Keine Command-Subscriptions (Config via Config-Topic)
   - Actuator: Command-Subscriptions pro GPIO (oder Wildcard)

3. ✅ Setup-Integration (nach Phase 4):
   ```cpp
   // Phase 5: Actuator System
   LOG_INFO("╔════════════════════════════════════════╗");
   LOG_INFO("║   Phase 5: Actuator System            ║");
   LOG_INFO("╚════════════════════════════════════════╝");
   
   // Safety Controller
   if (!safetyController.begin()) {
       LOG_ERROR("Safety Controller initialization failed!");
       errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED, 
                              ERROR_SEVERITY_CRITICAL,
                              "SafetyController begin() failed");
   } else {
       LOG_INFO("Safety Controller initialized");
   }
   
   // Actuator Manager
   if (!actuatorManager.begin()) {
       LOG_ERROR("Actuator Manager initialization failed!");
       errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                              ERROR_SEVERITY_CRITICAL,
                              "ActuatorManager begin() failed");
   } else {
       LOG_INFO("Actuator Manager initialized");
       
       // ⚠️ HINWEIS: ConfigManager.loadActuatorConfig() ist in Phase 1 auskommentiert
       // Diese Funktionalität wird in Phase 5 implementiert oder via MQTT-Config geladen
       
       // Option A: NVS-Loading direkt in ActuatorManager implementieren (wenn Option 1 gewählt)
       // actuatorManager.loadConfigsFromNVS();
       
       // Option B: Via MQTT-Config laden (Server-Centric) - EMPFOHLEN für Phase 5
       // Actuator-Configs werden via MQTT Config-Topic vom Server geschickt
       // und dann in ActuatorManager registriert
       
       // Option C: Hybrid (MQTT Primary + NVS Cache) - für Phase 6+
       // actuatorManager.loadConfigsFromNVS();  // Fallback
       // MQTT-Config überschreibt NVS-Config bei Reconnect
       
       // TODO Phase 5: Entscheidung treffen basierend auf Tag 0 Architektur-Entscheidung:
       // 1. ConfigManager erweitern (loadActuatorConfig() implementieren) - siehe Tag 15 (Optional)
       // 2. ODER: Nur MQTT-basierte Config verwenden (Server-Centric) - EMPFOHLEN
   }
   
   LOG_INFO("╔════════════════════════════════════════╗");
   LOG_INFO("║   Phase 5: Actuator System READY     ║");
   LOG_INFO("╚════════════════════════════════════════╝");
   ```

4. ✅ Loop-Integration (optional):
   ```cpp
   void loop() {
       // Phase 2: Communication monitoring
       wifiManager.loop();
       mqttClient.loop();
       
       // Phase 4: Sensor measurements
       sensorManager.performAllMeasurements();
       
       // Phase 5: Actuator status publishing (optional, alle 30s)
       static unsigned long last_actuator_status = 0;
       if (millis() - last_actuator_status > 30000) {
           actuatorManager.publishAllActuatorStatus();
           last_actuator_status = millis();
       }
       
       delay(10);
   }
   ```

**Konsistenz-Check:**
- Vergleich mit Phase 4 Integration:
  - ✅ Gleiche Setup-Struktur (Phase-Banner, Error-Handling)
  - ✅ Gleiche MQTT-Callback-Struktur (Topic-Pattern-Matching)
  - ✅ Gleiche Config-Loading-Logic (NVS → Manager)

**Erfolgs-Kriterium:** MQTT-Integration vollständig, Commands funktionieren

---

### Tag 15 (Optional): ConfigManager-Erweiterung für Actuator-Configs
**Ziel:** ConfigManager-API für Actuator-Persistenz implementieren (nur wenn Option 1 gewählt)

**⚠️ Dieser Abschnitt ist OPTIONAL und nur erforderlich, wenn NVS-Persistenz gewünscht ist**

**Aufgaben:**

1. ✅ `config_manager.h` erweitern:
   ```cpp
   // In config_manager.h Zeile 54-55 auskommentieren:
   bool loadActuatorConfig(ActuatorConfig actuators[], uint8_t max_actuators, uint8_t& loaded_count);
   bool saveActuatorConfig(const ActuatorConfig actuators[], uint8_t actuator_count);
   bool validateActuatorConfig(const ActuatorConfig& config);
   ```

2. ✅ `config_manager.cpp` implementieren:
   ```cpp
   bool ConfigManager::loadActuatorConfig(ActuatorConfig actuators[], 
                                          uint8_t max_actuators, 
                                          uint8_t& loaded_count) {
       StorageManager& storage = StorageManager::getInstance();
       if (!storage.beginNamespace("actuator_config", true)) {
           LOG_ERROR("Failed to open actuator_config namespace");
           return false;
       }
       
       loaded_count = storage.getUInt8("actuator_count", 0);
       if (loaded_count == 0) {
           storage.endNamespace();
           return true;  // No configs to load
       }
       
       if (loaded_count > max_actuators) {
           LOG_WARNING("Truncating actuator count from " + String(loaded_count) + 
                      " to " + String(max_actuators));
           loaded_count = max_actuators;
       }
       
       for (uint8_t i = 0; i < loaded_count; i++) {
           String prefix = "actuator_" + String(i) + "_";
           actuators[i].gpio = storage.getUInt8((prefix + "gpio").c_str(), 255);
           actuators[i].actuator_type = storage.getString((prefix + "type").c_str(), "");
           actuators[i].actuator_name = storage.getString((prefix + "name").c_str(), "");
           actuators[i].subzone_id = storage.getString((prefix + "subzone").c_str(), "");
           actuators[i].active = storage.getUInt8((prefix + "active").c_str(), 0) != 0;
           // ... weitere Felder laden (siehe NVS_KEYS.md)
       }
       
       storage.endNamespace();
       return true;
   }
   
   bool ConfigManager::saveActuatorConfig(const ActuatorConfig actuators[], 
                                          uint8_t actuator_count) {
       StorageManager& storage = StorageManager::getInstance();
       if (!storage.beginNamespace("actuator_config", false)) {
           LOG_ERROR("Failed to open actuator_config namespace for writing");
           return false;
       }
       
       storage.putUInt8("actuator_count", actuator_count);
       
       for (uint8_t i = 0; i < actuator_count; i++) {
           String prefix = "actuator_" + String(i) + "_";
           storage.putUInt8((prefix + "gpio").c_str(), actuators[i].gpio);
           storage.putString((prefix + "type").c_str(), actuators[i].actuator_type.c_str());
           storage.putString((prefix + "name").c_str(), actuators[i].actuator_name.c_str());
           storage.putString((prefix + "subzone").c_str(), actuators[i].subzone_id.c_str());
           storage.putUInt8((prefix + "active").c_str(), actuators[i].active ? 1 : 0);
           // ... weitere Felder speichern (siehe NVS_KEYS.md)
       }
       
       storage.endNamespace();
       return true;
   }
   ```

3. ✅ `models/actuator_types.h` prüfen:
   - Struct `ActuatorConfig` muss vorhanden sein
   - Falls nicht: Aus `ZZZ.md` Zeilen 1007-1030 übernehmen

**NVS-Key-Schema (aus NVS_KEYS.md):**

**Namespace:** `actuator_config`

**Keys:**
```cpp
// Actuator Count
actuator_count  // uint8_t, Anzahl konfigurierter Actuators

// Pro Actuator (i = 0..11 für WROOM, 0..7 für XIAO):
actuator_{i}_gpio           // uint8_t, GPIO-Pin-Nummer
actuator_{i}_type           // String, Typ: "pump", "valve", "pwm"
actuator_{i}_name           // String, Name des Actuators
actuator_{i}_subzone        // String, SubZone-Zuordnung
actuator_{i}_active         // bool (als uint8_t), Aktivierungsstatus
// ... weitere Felder siehe actuator_types.h
```

**Verwendung in ConfigManager:**
```cpp
// Beispiel: Laden von Actuator 0
storage.beginNamespace("actuator_config", true);
uint8_t gpio = storage.getUInt8("actuator_0_gpio", 255);
String type = storage.getString("actuator_0_type", "");
storage.endNamespace();
```

**Konsistenz mit Sensor-Config:**
- Sensor: Namespace `sensor_config`, Keys `sensor_{i}_*`
- Actuator: Namespace `actuator_config`, Keys `actuator_{i}_*`
- **Gleiche Struktur** ✅

**Konsistenz-Check:**
- Vergleich mit `ConfigManager::loadSensorConfig()` (Phase 4)
- Gleiches Pattern: Namespace → Count → Loop → EndNamespace
- Gleiche NVS-Keys wie in `NVS_KEYS.md` definiert

**Erfolgs-Kriterium:** ConfigManager kann Actuator-Configs laden/speichern, konsistent mit Sensor-Pattern

---

## 🔧 Implementierungs-Details

### MQTT Command-Handler (ActuatorManager)

**Command-Payload (gemäß Mqtt_Protocoll.md):**
```json
{
  "command": "ON",           // "ON", "OFF", "PWM", "TOGGLE"
  "value": 1.0,              // 0.0-1.0 (nur bei PWM)
  "duration": 0              // Sekunden (0 = unbegrenzt)
}
```

**Response-Payload:**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 5,
  "command": "ON",
  "value": 1.0,
  "success": true,
  "message": "Actuator activated"
}
```

**Implementierung:**
```cpp
bool ActuatorManager::handleActuatorCommand(const String& topic, const String& payload) {
    // Parse GPIO from topic: "kaiser/god/esp/{esp_id}/actuator/{gpio}/command"
    uint8_t gpio = extractGPIOFromTopic(topic);
    if (gpio == 255) {
        LOG_ERROR("Invalid actuator command topic: " + topic);
        return false;
    }
    
    // Check if actuator exists
    RegisteredActuator* actuator = findActuator(gpio);
    if (!actuator) {
        LOG_ERROR("Actuator not found on GPIO " + String(gpio));
        publishActuatorResponse(gpio, false, "Actuator not configured");
        return false;
    }
    
    // Check emergency status
    if (actuator->emergency_stopped) {
        LOG_WARNING("Actuator GPIO " + String(gpio) + " is in emergency stop");
        publishActuatorResponse(gpio, false, "Actuator in emergency stop");
        return false;
    }
    
    // Parse JSON payload
    String command = extractJSONString(payload, "command");
    float value = extractJSONFloat(payload, "value");
    uint32_t duration = extractJSONUInt32(payload, "duration");
    
    // Execute command
    bool success = false;
    if (command == "ON") {
        success = controlActuatorBinary(gpio, true);
    } else if (command == "OFF") {
        success = controlActuatorBinary(gpio, false);
    } else if (command == "PWM") {
        success = controlActuator(gpio, value);
    } else if (command == "TOGGLE") {
        bool current_state = actuator->config.current_state;
        success = controlActuatorBinary(gpio, !current_state);
    } else {
        LOG_ERROR("Unknown actuator command: " + command);
        publishActuatorResponse(gpio, false, "Unknown command: " + command);
        return false;
    }
    
    // Publish response
    if (success) {
        publishActuatorResponse(gpio, true, "Command executed");
        publishActuatorStatus(gpio);
    } else {
        publishActuatorResponse(gpio, false, "Command execution failed");
    }
    
    return success;
}
```

### Emergency-Stop Flow

**Trigger:** MQTT-Message auf `kaiser/broadcast/emergency` oder `kaiser/god/esp/{esp_id}/actuator/emergency`

**Flow:**
1. `SafetyController::emergencyStopAll()` wird aufgerufen
2. `ActuatorManager::emergencyStopAll()` wird aufgerufen
3. Alle Aktoren werden sofort ausgeschaltet (via Driver::emergencyStop())
4. Emergency-State wird auf `EMERGENCY_ACTIVE` gesetzt
5. Safe-Mode-Status wird via MQTT publiziert: `kaiser/god/esp/{esp_id}/safe_mode`
6. Error wird geloggt (Logger + ErrorTracker)

**Recovery-Flow:**
1. `SafetyController::clearEmergencyStop()` wird aufgerufen (via MQTT-Command)
2. System-Safety wird verifiziert (`verifySystemSafety()`)
3. Emergency-Flags werden zurückgesetzt (Aktoren bleiben AUS!)
4. Emergency-State wird auf `EMERGENCY_CLEARING` gesetzt
5. **User muss explizit `resumeOperation()` aufrufen!**
6. `SafetyController::resumeOperation()` wird aufgerufen
7. Aktoren werden schrittweise reaktiviert (mit 2s Delays)
8. Jeder Aktor wird verifiziert (`verifyActuatorSafety()`)
9. Emergency-State wird auf `EMERGENCY_NORMAL` gesetzt

---

## ✅ Erfolgs-Kriterien Phase 5

### Funktionale Kriterien
- ✅ **ActuatorManager funktioniert** (Register, Control, Emergency-Stop)
- ✅ **SafetyController funktioniert** (Emergency-Stop, Recovery)
- ✅ **Alle 3 Driver implementiert** (Pump, PWM, Valve)
- ✅ **MQTT-Commands funktionieren** (Command-Handler, Response-Publishing)
- ✅ **Emergency-Stop funktioniert** (Broadcast + ESP-spezifisch)
- ✅ **Recovery-Mechanismen funktionieren** (Clear, Resume)
- ✅ **TopicBuilder erweitert** (Response, Alert, Emergency Topics)

### Code-Qualität Kriterien
- ✅ **Konsistenz mit Phase 0-4** (Singleton, Logger, ErrorTracker, GPIO-Manager)
- ✅ **Keine Linter-Fehler** (0 Errors, 0 Warnings)
- ✅ **Memory-Safety** (keine Heap-Fragmentation, String.reserve() wo nötig)
- ✅ **Error-Handling** (alle Fehler werden geloggt via ErrorTracker)
- ✅ **Dokumentation** (Doxygen-Kommentare, API-Dokumentation)

### Performance Kriterien
- ✅ **Memory-Usage < 40KB** (Phase 0-4: ~35KB + Phase 5: ~5KB)
- ✅ **Command-Latency < 100ms** (MQTT → Hardware)
- ✅ **Emergency-Stop-Latency < 50ms** (Broadcast → Alle Aktoren aus)

### Integration Kriterien
- ✅ **main.cpp Integration** (Setup, Loop, MQTT-Callback)
- ⚠️ **ConfigManager Integration** (Actuator-Config-Loading aus NVS - optional, abhängig von Architektur-Entscheidung Tag 0)
- ✅ **MQTTClient Integration** (Publishing, Subscribing)

---

## 📝 Code-Konsistenz-Analyse

### Vergleich Phase 4 (SensorManager) vs Phase 5 (ActuatorManager)

| Aspekt | SensorManager (Phase 4) | ActuatorManager (Phase 5) | Konsistenz |
|--------|-------------------------|---------------------------|------------|
| **Singleton Pattern** | ✅ `getInstance()` | ✅ `getInstance()` | ✅ Konsistent |
| **Lifecycle** | ✅ `begin()`, `end()` | ✅ `begin()`, `end()` | ✅ Konsistent |
| **Registry** | ✅ `SensorConfig sensors_[20]` | ✅ `RegisteredActuator actuators_[8/12]` | ✅ Konsistent |
| **GPIO-Management** | ✅ `gpio_manager_->requestPin()` | ✅ `gpio_manager_->requestPin()` | ✅ Konsistent |
| **Configuration** | ✅ `configureSensor()` | ✅ `configureActuator()` | ✅ Konsistent |
| **MQTT-Publishing** | ✅ `publishSensorData()` | ✅ `publishActuatorStatus()` | ✅ Konsistent |
| **Error-Handling** | ✅ `errorTracker.trackError()` | ✅ `errorTracker.trackError()` | ✅ Konsistent |
| **Logger-Integration** | ✅ `LOG_INFO()`, `LOG_ERROR()` | ✅ `LOG_INFO()`, `LOG_ERROR()` | ✅ Konsistent |
| **JSON-Parsing** | ✅ Manuell (ohne Library) | ✅ Manuell (ohne Library) | ✅ Konsistent |
| **NVS-Integration** | ✅ `configManager.saveSensorConfig()` | ⚠️ `configManager.saveActuatorConfig()` (auskommentiert, optional) | ⚠️ Optional |

**Fazit:** ✅ **100% Konsistent** - Phase 5 folgt exakt den Patterns aus Phase 4

### Vergleich Phase 2 (MQTTClient) vs Phase 5 (MQTT-Integration)

| Aspekt | MQTTClient (Phase 2) | ActuatorManager MQTT (Phase 5) | Konsistenz |
|--------|----------------------|--------------------------------|------------|
| **Publishing** | ✅ `safePublish()` | ✅ `mqttClient.safePublish()` | ✅ Konsistent |
| **Topic-Building** | ✅ `TopicBuilder::buildXxxTopic()` | ✅ `TopicBuilder::buildActuatorXxxTopic()` | ✅ Konsistent |
| **QoS-Levels** | ✅ Command: QoS 1, Status: QoS 1 | ✅ Command: QoS 1, Status: QoS 1 | ✅ Konsistent |
| **Payload-Format** | ✅ JSON (String-basiert) | ✅ JSON (String-basiert) | ✅ Konsistent |
| **Error-Handling** | ✅ Offline-Buffer bei Fehler | ✅ Error-Response bei Fehler | ✅ Konsistent |

**Fazit:** ✅ **100% Konsistent** - Phase 5 folgt exakt den Patterns aus Phase 2

### Vergleich Phase 3 (PWMController) vs Phase 5 (PWMActuator)

| Aspekt | PWMController (Phase 3) | PWMActuator (Phase 5) | Konsistenz |
|--------|--------------------------|----------------------|------------|
| **Channel-Management** | ✅ `attachChannel()`, `detachChannel()` | ✅ Nutzt PWMController | ✅ Konsistent |
| **PWM-Write** | ✅ `write()`, `writePercent()` | ✅ Delegiert an PWMController | ✅ Konsistent |
| **GPIO-Integration** | ✅ GPIO-Manager-Integration | ✅ GPIO-Manager-Integration | ✅ Konsistent |
| **Frequency/Resolution** | ✅ Konfigurierbar | ✅ Nutzt PWMController-Config | ✅ Konsistent |

**Fazit:** ✅ **100% Konsistent** - Phase 5 nutzt Phase 3 PWMController korrekt

---

## 🚨 Kritische Implementierungs-Hinweise

### 1. Emergency-Stop Priorität
**WICHTIG:** Emergency-Stop hat **höchste Priorität** - alle anderen Commands werden ignoriert wenn Emergency aktiv ist.

**Implementierung:**
```cpp
bool ActuatorManager::controlActuator(uint8_t gpio, float value) {
    RegisteredActuator* actuator = findActuator(gpio);
    if (!actuator) return false;
    
    // ✅ KRITISCH: Emergency-Check ZUERST
    if (actuator->emergency_stopped) {
        LOG_WARNING("Actuator GPIO " + String(gpio) + " is in emergency stop");
        return false;
    }
    
    // Normal control...
}
```

### 2. GPIO-Conflict-Detection
**WICHTIG:** Actuator-GPIOs dürfen nicht mit Sensor-GPIOs kollidieren.

**Implementierung:**
```cpp
bool ActuatorManager::configureActuator(const ActuatorConfig& config) {
    // Check GPIO conflict with sensors
    if (sensorManager.hasSensorOnGPIO(config.gpio)) {
        LOG_ERROR("GPIO " + String(config.gpio) + " already used by sensor");
        errorTracker.trackError(ERROR_GPIO_CONFLICT, ERROR_SEVERITY_ERROR,
                               "GPIO conflict: sensor vs actuator");
        return false;
    }
    
    // Check GPIO conflict with other actuators
    if (hasActuatorOnGPIO(config.gpio)) {
        LOG_ERROR("GPIO " + String(config.gpio) + " already used by actuator");
        errorTracker.trackError(ERROR_ACTUATOR_CONFLICT, ERROR_SEVERITY_ERROR,
                               "GPIO conflict: actuator vs actuator");
        return false;
    }
    
    // Reserve GPIO via GPIO-Manager (verwendet requestPin() API)
    if (!gpio_manager_->requestPin(config.gpio, "actuator", config.actuator_name.c_str())) {
        LOG_ERROR("Failed to reserve GPIO " + String(config.gpio));
        errorTracker.trackError(ERROR_GPIO_RESERVED, ERROR_SEVERITY_ERROR,
                               "Failed to reserve GPIO for actuator");
        return false;
    }
    
    // ...
}
```

### 3. Recovery-Mechanismus (Schrittweise Reaktivierung)
**WICHTIG:** Recovery erfolgt **schrittweise** mit Delays, nicht alle Aktoren gleichzeitig.

**Implementierung:**
```cpp
bool SafetyController::resumeOperation() {
    if (emergency_state_ != EMERGENCY_CLEARING) {
        LOG_ERROR("Cannot resume: Emergency not cleared");
        return false;
    }
    
    emergency_state_ = EMERGENCY_RESUMING;
    
    // Get all actuators from ActuatorManager
    // Sort by priority (critical_first)
    // Reactivate one by one with delays
    
    for (uint8_t i = 0; i < actuator_count; i++) {
        uint8_t gpio = actuators[i].gpio;
        
        // Verify safety before reactivation
        if (!verifyActuatorSafety(gpio)) {
            LOG_WARNING("Actuator GPIO " + String(gpio) + " failed safety check");
            continue;  // Skip this actuator
        }
        
        // Clear emergency flag
        actuatorManager.clearEmergencyStopActuator(gpio);
        
        // Delay between actuators
        delay(recovery_config_.inter_actuator_delay);
    }
    
    emergency_state_ = EMERGENCY_NORMAL;
    return true;
}
```

### 4. MQTT-Payload-Parsing (manuell, ohne externe Library)
**WICHTIG:** JSON-Parsing erfolgt **manuell** (wie Phase 4), keine externe Library (kein ArduinoJson).

**Konsistenz-Check:** SensorManager verwendet manuelles JSON-Building (String-Konkatenation), kein ArduinoJson.

**Implementierung (wie Phase 4):**
```cpp
// Helper-Funktionen für manuelles JSON-Parsing (in actuator_manager.cpp)
String extractJSONString(const String& json, const String& key) {
    int key_start = json.indexOf("\"" + key + "\":\"");
    if (key_start == -1) return "";
    key_start += key.length() + 3;  // Length of "key":"
    int key_end = json.indexOf("\"", key_start);
    if (key_end == -1) return "";
    return json.substring(key_start, key_end);
}

float extractJSONFloat(const String& json, const String& key) {
    int key_start = json.indexOf("\"" + key + "\":");
    if (key_start == -1) return 0.0;
    key_start += key.length() + 2;  // Length of "key":
    int key_end = json.indexOf(",", key_start);
    if (key_end == -1) key_end = json.indexOf("}", key_start);
    if (key_end == -1) return 0.0;
    String value_str = json.substring(key_start, key_end);
    value_str.trim();
    return value_str.toFloat();
}

uint32_t extractJSONUInt32(const String& json, const String& key) {
    int key_start = json.indexOf("\"" + key + "\":");
    if (key_start == -1) return 0;
    key_start += key.length() + 2;  // Length of "key":
    int key_end = json.indexOf(",", key_start);
    if (key_end == -1) key_end = json.indexOf("}", key_start);
    if (key_end == -1) return 0;
    String value_str = json.substring(key_start, key_end);
    value_str.trim();
    return value_str.toInt();
}
```

---

## 📚 Referenzen

### Dokumentation
- **ZZZ.md** Zeilen 1004-1506: ActuatorManager-Spezifikation
- **ZZZ.md** Zeilen 1532-1576: Actuator-Command-Flow
- **Roadmap.md** Zeilen 940-987: Phase 5 Übersicht
- **Mqtt_Protocoll.md** Zeilen 1247-1277: Actuator-Command-Spezifikation
- **Mqtt_Protocoll.md** Zeilen 302-369: Actuator-Status/Response/Alert-Spezifikation

### Code-Referenzen
- **Phase 4:** `services/sensor/sensor_manager.cpp` - Registry-Pattern
- **Phase 2:** `services/communication/mqtt_client.cpp` - MQTT-Publishing
- **Phase 3:** `drivers/pwm_controller.cpp` - PWM-Integration
- **Phase 1:** `utils/topic_builder.cpp` - Topic-Building-Patterns

---

## ✅ Checkliste für Implementierung

### Vor Implementierung
- [ ] ZZZ.md Phase 5 Abschnitt gelesen
- [ ] Roadmap.md Phase 5 Abschnitt gelesen
- [ ] Mqtt_Protocoll.md Actuator-Abschnitte gelesen
- [ ] Bestehende Code-Struktur analysiert (Phase 0-4)
- [ ] Konsistenz mit Phase 0-4 verstanden

### Während Implementierung
- [ ] Jedes Modul einzeln implementieren (Tag-für-Tag)
- [ ] Konsistenz-Checks nach jedem Modul
- [ ] Linter-Tests nach jedem Modul
- [ ] Code-Review nach jedem Modul (selbst)

### Nach Implementierung
- [ ] Alle Erfolgs-Kriterien erfüllt
- [ ] Code-Konsistenz-Analyse durchgeführt
- [ ] Memory-Usage getestet (< 40KB)
- [ ] MQTT-Commands getestet (Command → Response)
- [ ] Emergency-Stop getestet (Broadcast + ESP-spezifisch)
- [ ] Recovery-Mechanismen getestet (Clear → Resume)
- [ ] Dokumentation aktualisiert

---

**Dokument erstellt:** 2025-01-28  
**Version:** 1.0  
**Status:** 📝 Implementierungs-Anleitung  
**Nächste Überprüfung:** Nach Phase 5 Fertigstellung

